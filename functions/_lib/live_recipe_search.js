import { getIngredientCatalogEntries } from "./catalog.js";
import { clampNumber, normalizeIngredientKey, normalizeWord, safeString } from "./util.js";

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "ko" || raw === "en") {
    return raw;
  }
  return "en";
}

function hasHangul(value) {
  return /[\uAC00-\uD7A3]/.test(String(value || ""));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function cleanText(value) {
  return decodeHtmlEntities(stripHtml(value))
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrlHostname(value) {
  try {
    const url = new URL(String(value || ""));
    return String(url.hostname || "").trim();
  } catch {
    return "";
  }
}

function resolveLiveRecipeConfig(env) {
  const enabledRaw = safeString(env?.ENABLE_LIVE_RECIPE_SEARCH, "").toLowerCase();
  const explicitEnable =
    enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";

  const youtube = {
    api_key: safeString(env?.YOUTUBE_API_KEY, ""),
    max_results: clampNumber(env?.YOUTUBE_SEARCH_MAX_RESULTS, 10, 1, 25),
    region: safeString(env?.YOUTUBE_SEARCH_REGION, "KR"),
    category_id: safeString(env?.YOUTUBE_SEARCH_CATEGORY_ID, "26")
  };

  const naver = {
    client_id: safeString(env?.NAVER_CLIENT_ID, ""),
    client_secret: safeString(env?.NAVER_CLIENT_SECRET, ""),
    max_results: clampNumber(env?.NAVER_SEARCH_MAX_RESULTS, 8, 1, 20)
  };

  const google = {
    api_key: safeString(env?.GOOGLE_SEARCH_API_KEY, ""),
    cx: safeString(env?.GOOGLE_SEARCH_CX, ""),
    max_results: clampNumber(env?.GOOGLE_SEARCH_MAX_RESULTS, 8, 1, 10)
  };

  const themealdbEnabledRaw = safeString(env?.ENABLE_THEMEALDB_SEARCH, "true").toLowerCase();
  const themealdbEnabled =
    themealdbEnabledRaw === "1" ||
    themealdbEnabledRaw === "true" ||
    themealdbEnabledRaw === "yes" ||
    themealdbEnabledRaw === "on";
  const themealdb = {
    enabled: themealdbEnabled,
    max_results: clampNumber(env?.THEMEALDB_SEARCH_MAX_RESULTS, 8, 1, 25)
  };

  const providerOrderRaw = safeString(
    env?.LIVE_RECIPE_PROVIDER_ORDER,
    "youtube,naver_blog,naver_web,google,themealdb"
  );
  const provider_order = Array.from(
    new Set(
      providerOrderRaw
        .split(",")
        .map((v) => String(v || "").trim().toLowerCase())
        .filter((v) => v)
    )
  );

  const hasAnyProviderCredential =
    Boolean(youtube.api_key) ||
    (Boolean(naver.client_id) && Boolean(naver.client_secret)) ||
    (Boolean(google.api_key) && Boolean(google.cx)) ||
    themealdb.enabled;

  const enabled = explicitEnable || (!enabledRaw && hasAnyProviderCredential);

  return {
    enabled,
    provider_order,
    youtube,
    naver,
    google,
    themealdb
  };
}

function sanitizeSearchTerm(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toInventoryTerm(item, lang, koNameByKey = null) {
  const name = String(item?.ingredient_name || "").trim();
  const key = String(item?.ingredient_key || "").trim();
  if (!name && !key) {
    return "";
  }

  if (lang === "ko") {
    if (name && hasHangul(name)) {
      return sanitizeSearchTerm(name);
    }
    const normalizedKey = normalizeIngredientKey(key || name);
    const koName =
      koNameByKey && normalizedKey ? String(koNameByKey.get(normalizedKey) || "").trim() : "";
    if (koName && hasHangul(koName)) {
      return sanitizeSearchTerm(koName);
    }
  }

  const source = name || key;
  if (!source) {
    return "";
  }
  return sanitizeSearchTerm(source);
}

function buildInventoryTerms(inventoryItems, lang, maxTerms = 4, koNameByKey = null) {
  const rows = Array.isArray(inventoryItems) ? inventoryItems : [];
  const scored = [];
  for (const item of rows) {
    const term = toInventoryTerm(item, lang, koNameByKey);
    if (!term) {
      continue;
    }
    const qty = Number(item?.quantity || 0);
    const status = String(item?.status || "").trim().toLowerCase();
    const urgency = status === "expiring_soon" ? 2 : status === "fresh" ? 1 : 0;
    scored.push({
      term,
      score: (Number.isFinite(qty) ? qty : 0) + urgency
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const dedup = new Set();
  const out = [];
  for (const row of scored) {
    const key = normalizeWord(row.term);
    if (!key || dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    out.push(row.term);
    if (out.length >= maxTerms) {
      break;
    }
  }
  return out;
}

function pickKoreanCatalogTerm(entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const display = String(entry.display_name || "").trim();
  if (display && hasHangul(display)) {
    return display;
  }

  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  let best = "";
  for (const raw of aliases) {
    const alias = String(raw || "").trim();
    if (!alias || !hasHangul(alias)) {
      continue;
    }
    if (!best || alias.length < best.length) {
      best = alias;
    }
  }
  return best;
}

async function buildKoreanCatalogLookup(context, userId) {
  const map = new Map();
  try {
    const entries = await getIngredientCatalogEntries(context, userId);
    for (const entry of entries || []) {
      const key = normalizeIngredientKey(String(entry?.ingredient_key || ""));
      if (!key || map.has(key)) {
        continue;
      }
      const ko = pickKoreanCatalogTerm(entry);
      if (!ko || !hasHangul(ko)) {
        continue;
      }
      map.set(key, ko);
    }
  } catch {
    // best-effort only
  }
  return map;
}

async function buildInventoryTermsForLang(context, inventoryItems, lang, maxTerms, userId) {
  const normalizedLang = normalizeLang(lang);
  if (normalizedLang !== "ko") {
    return buildInventoryTerms(inventoryItems, normalizedLang, maxTerms);
  }

  const lookup = await buildKoreanCatalogLookup(context, userId);
  return buildInventoryTerms(inventoryItems, normalizedLang, maxTerms, lookup);
}

function buildFallbackRecipeQuery(terms, lang) {
  const core = (Array.isArray(terms) ? terms : []).filter((v) => String(v || "").trim()).join(" ");
  if (lang === "ko") {
    return `${core || "\uC9D1\uBC25"} \uB808\uC2DC\uD53C`;
  }
  return `${core || "home cooking"} recipe`;
}

function buildBlogQuery(terms, lang) {
  const base = buildFallbackRecipeQuery(terms, lang);
  if (lang === "ko") {
    return `${base} \uBE14\uB85C\uADF8`;
  }
  return `${base} blog`;
}

function buildRecipeWebQuery(terms, lang) {
  const base = buildFallbackRecipeQuery(terms, lang);
  if (lang === "ko") {
    return `${base} site:10000recipe.com OR site:manrecipe.com OR site:maangchi.com`;
  }
  return `${base} site:allrecipes.com OR site:foodnetwork.com OR site:bbcgoodfood.com`;
}

function normalizeForMatch(value) {
  return normalizeWord(String(value || "").replace(/[^\p{L}\p{N}\s]+/gu, " "));
}

function getLanguageContentBoost({
  lang = "en",
  provider = "",
  title = "",
  description = "",
  sourceUrl = "",
  sourceChannel = ""
} = {}) {
  if (normalizeLang(lang) !== "ko") {
    return 0;
  }

  const providerKey = String(provider || "").trim().toLowerCase();
  const text = `${String(title || "")} ${String(description || "")} ${String(sourceChannel || "")}`.trim();
  const host = safeUrlHostname(sourceUrl);

  let boost = 0;
  if (hasHangul(text)) {
    boost += 18;
  }
  if (host) {
    if (/\.kr$/i.test(host)) {
      boost += 12;
    }
    if (/naver\.com$/i.test(host) || /daum\.net$/i.test(host) || /tistory\.com$/i.test(host)) {
      boost += 8;
    }
  }

  if (providerKey === "naver_blog") {
    boost += 14;
  } else if (providerKey === "naver_web") {
    boost += 11;
  } else if (providerKey === "youtube") {
    boost += 5;
  } else if (providerKey === "google") {
    boost += 3;
  } else if (providerKey === "themealdb") {
    boost -= 8;
  }

  return boost;
}

function scoreByText(title, text, terms) {
  const normalizedTitle = normalizeForMatch(title);
  const normalizedText = normalizeForMatch(text);
  const combined = `${normalizedTitle} ${normalizedText}`.trim();
  if (!combined) {
    return { term_hits: 0, match_ratio: 0 };
  }

  const safeTerms = (Array.isArray(terms) ? terms : [])
    .map((t) => normalizeForMatch(t))
    .filter(Boolean);
  if (safeTerms.length === 0) {
    return { term_hits: 0, match_ratio: 0 };
  }

  let hits = 0;
  for (const term of safeTerms) {
    if (combined.includes(term)) {
      hits += 1;
    }
  }
  const ratio = hits / safeTerms.length;
  return {
    term_hits: hits,
    match_ratio: Math.round(ratio * 1000) / 1000
  };
}

function toRecipeId(prefix, sourceKey, idx = 0) {
  const normalized = normalizeIngredientKey(sourceKey || "");
  if (normalized) {
    return `${prefix}_${normalized}`;
  }
  return `${prefix}_${idx + 1}`;
}

function makeRecipeItem({
  provider,
  sourceType,
  sourceUrl,
  sourceTitle,
  sourceChannel,
  title,
  description = "",
  publishedAt = null,
  inventoryTerms = [],
  lang = "en",
  idx = 0
}) {
  const scoreMeta = scoreByText(title, description, inventoryTerms);
  const providerBoost =
    provider === "youtube" ? 6 :
    provider === "google" ? 4 :
    provider === "naver_blog" ? 4 :
    provider === "naver_web" ? 3 :
    provider === "themealdb" ? 5 :
    0;
  const langBoost = getLanguageContentBoost({
    lang,
    provider,
    title,
    description,
    sourceUrl,
    sourceChannel
  });
  const score = Math.round((scoreMeta.match_ratio * 100 + scoreMeta.term_hits * 5 + providerBoost + langBoost) * 100) / 100;

  return {
    recipe_id: toRecipeId(provider, sourceUrl || title, idx),
    recipe_name: String(title || "").trim() || `${provider} recipe`,
    chef: String(sourceChannel || provider).trim(),
    tags: ["web", provider],
    required_ingredient_keys: [],
    optional_ingredient_keys: [],
    matched_ingredient_keys: [],
    missing_ingredient_keys: [],
    can_make_now: false,
    expiring_soon_used_count: 0,
    match_ratio: scoreMeta.match_ratio,
    score,
    source_type: sourceType || provider,
    source_provider: provider,
    source_url: sourceUrl || null,
    source_title: sourceTitle || String(title || "").trim() || null,
    source_channel: sourceChannel || null,
    source_published_at: publishedAt
  };
}

function dedupeRecipeResults(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const sourceUrl = String(item?.source_url || "").trim();
    const id = String(item?.recipe_id || "").trim();
    const key = normalizeWord(sourceUrl || id || item?.recipe_name || "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function parseJsonResponse(res) {
  const raw = await res.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return parsed;
}

async function searchYoutube(cfg, query, inventoryTerms, lang, topN) {
  if (!cfg.api_key) {
    return { provider: "youtube", enabled: false, items: [], count: 0, warning: "missing_api_key", query };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", cfg.category_id);
  url.searchParams.set("maxResults", String(Math.max(topN, cfg.max_results)));
  url.searchParams.set("q", query);
  url.searchParams.set("regionCode", cfg.region);
  url.searchParams.set("key", cfg.api_key);
  url.searchParams.set("relevanceLanguage", lang === "ko" ? "ko" : "en");

  try {
    const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
    const parsed = await parseJsonResponse(res);
    if (!res.ok) {
      const msg = parsed?.error?.message || parsed?.message || `youtube_search_failed_${res.status}`;
      return { provider: "youtube", enabled: true, items: [], count: 0, error: msg, query };
    }

    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rows.map((row, idx) => {
      const videoId = row?.id?.videoId ? String(row.id.videoId).trim() : "";
      const snippet = row?.snippet && typeof row.snippet === "object" ? row.snippet : {};
      const title = cleanText(snippet?.title || "") || `YouTube recipe ${idx + 1}`;
      const channel = cleanText(snippet?.channelTitle || "") || "YouTube";
      const publishedAt = snippet?.publishedAt ? String(snippet.publishedAt).trim() : null;
      const sourceUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
      return makeRecipeItem({
        provider: "youtube",
        sourceType: "youtube",
        sourceUrl,
        sourceTitle: title,
        sourceChannel: channel,
        title,
        description: "",
        publishedAt,
        inventoryTerms,
        lang,
        idx
      });
    });

    return {
      provider: "youtube",
      enabled: true,
      items: dedupeRecipeResults(items).slice(0, topN),
      count: Math.min(items.length, topN),
      query
    };
  } catch (err) {
    return {
      provider: "youtube",
      enabled: true,
      items: [],
      count: 0,
      error: err?.message || String(err),
      query
    };
  }
}

async function searchNaverBlog(cfg, query, inventoryTerms, topN) {
  if (!cfg.client_id || !cfg.client_secret) {
    return { provider: "naver_blog", enabled: false, items: [], count: 0, warning: "missing_credentials", query };
  }

  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(topN, cfg.max_results)));
  url.searchParams.set("sort", "sim");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Naver-Client-Id": cfg.client_id,
        "X-Naver-Client-Secret": cfg.client_secret
      }
    });
    const parsed = await parseJsonResponse(res);
    if (!res.ok) {
      const msg = parsed?.errorMessage || parsed?.message || `naver_blog_search_failed_${res.status}`;
      return { provider: "naver_blog", enabled: true, items: [], count: 0, error: msg, query };
    }

    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rows.map((row, idx) => {
      const title = cleanText(row?.title || "") || `Naver Blog recipe ${idx + 1}`;
      const desc = cleanText(row?.description || "");
      const link = String(row?.link || "").trim() || null;
      const blogger = cleanText(row?.bloggername || "") || "Naver Blog";
      const postDateRaw = String(row?.postdate || "").trim();
      const publishedAt =
        postDateRaw && /^\d{8}$/.test(postDateRaw)
          ? `${postDateRaw.slice(0, 4)}-${postDateRaw.slice(4, 6)}-${postDateRaw.slice(6, 8)}`
          : null;

      return makeRecipeItem({
        provider: "naver_blog",
        sourceType: "naver_blog",
        sourceUrl: link,
        sourceTitle: title,
        sourceChannel: blogger,
        title,
        description: desc,
        publishedAt,
        inventoryTerms,
        lang: "ko",
        idx
      });
    });

    return {
      provider: "naver_blog",
      enabled: true,
      items: dedupeRecipeResults(items).slice(0, topN),
      count: Math.min(items.length, topN),
      query
    };
  } catch (err) {
    return {
      provider: "naver_blog",
      enabled: true,
      items: [],
      count: 0,
      error: err?.message || String(err),
      query
    };
  }
}

async function searchNaverWeb(cfg, query, inventoryTerms, topN) {
  if (!cfg.client_id || !cfg.client_secret) {
    return { provider: "naver_web", enabled: false, items: [], count: 0, warning: "missing_credentials", query };
  }

  const url = new URL("https://openapi.naver.com/v1/search/webkr.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(topN, cfg.max_results)));

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Naver-Client-Id": cfg.client_id,
        "X-Naver-Client-Secret": cfg.client_secret
      }
    });
    const parsed = await parseJsonResponse(res);
    if (!res.ok) {
      const msg = parsed?.errorMessage || parsed?.message || `naver_web_search_failed_${res.status}`;
      return { provider: "naver_web", enabled: true, items: [], count: 0, error: msg, query };
    }

    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rows.map((row, idx) => {
      const title = cleanText(row?.title || "") || `Naver Web recipe ${idx + 1}`;
      const desc = cleanText(row?.description || "");
      const link = String(row?.link || "").trim() || null;
      const host = safeUrlHostname(link) || "Naver Web";
      return makeRecipeItem({
        provider: "naver_web",
        sourceType: "naver_web",
        sourceUrl: link,
        sourceTitle: title,
        sourceChannel: host,
        title,
        description: desc,
        publishedAt: null,
        inventoryTerms,
        lang: "ko",
        idx
      });
    });

    return {
      provider: "naver_web",
      enabled: true,
      items: dedupeRecipeResults(items).slice(0, topN),
      count: Math.min(items.length, topN),
      query
    };
  } catch (err) {
    return {
      provider: "naver_web",
      enabled: true,
      items: [],
      count: 0,
      error: err?.message || String(err),
      query
    };
  }
}

async function searchGoogleCse(cfg, query, inventoryTerms, topN, lang) {
  if (!cfg.api_key || !cfg.cx) {
    return { provider: "google", enabled: false, items: [], count: 0, warning: "missing_credentials", query };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", cfg.api_key);
  url.searchParams.set("cx", cfg.cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(topN, cfg.max_results)));
  if (lang === "ko") {
    url.searchParams.set("lr", "lang_ko");
    url.searchParams.set("hl", "ko");
    url.searchParams.set("gl", "kr");
    url.searchParams.set("cr", "countryKR");
  } else {
    url.searchParams.set("lr", "lang_en");
    url.searchParams.set("hl", "en");
  }

  try {
    const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
    const parsed = await parseJsonResponse(res);
    if (!res.ok) {
      const msg = parsed?.error?.message || parsed?.message || `google_search_failed_${res.status}`;
      return { provider: "google", enabled: true, items: [], count: 0, error: msg, query };
    }

    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rows.map((row, idx) => {
      const title = cleanText(row?.title || "") || `Google recipe ${idx + 1}`;
      const desc = cleanText(row?.snippet || "");
      const link = String(row?.link || "").trim() || null;
      const channel = cleanText(row?.displayLink || "") || safeUrlHostname(link) || "Google Web";
      return makeRecipeItem({
        provider: "google",
        sourceType: "google_web",
        sourceUrl: link,
        sourceTitle: title,
        sourceChannel: channel,
        title,
        description: desc,
        publishedAt: null,
        inventoryTerms,
        lang,
        idx
      });
    });

    return {
      provider: "google",
      enabled: true,
      items: dedupeRecipeResults(items).slice(0, topN),
      count: Math.min(items.length, topN),
      query
    };
  } catch (err) {
    return {
      provider: "google",
      enabled: true,
      items: [],
      count: 0,
      error: err?.message || String(err),
      query
    };
  }
}

function buildThemealdbTerms(inventoryItems, maxTerms = 3) {
  const out = [];
  const seen = new Set();

  for (const item of inventoryItems || []) {
    const key = String(item?.ingredient_key || "").trim();
    const name = String(item?.ingredient_name || "").trim();
    const candidate = (key || name || "")
      .replace(/_/g, " ")
      .replace(/[^a-zA-Z\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!candidate || candidate.length < 2) {
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    out.push(candidate);
    if (out.length >= maxTerms) {
      break;
    }
  }

  return out;
}

async function searchThemealdb(cfg, inventoryItems, inventoryTerms, topN) {
  if (!cfg.enabled) {
    return { provider: "themealdb", enabled: false, items: [], count: 0, warning: "disabled" };
  }

  const termCandidates = buildThemealdbTerms(inventoryItems, 3);
  if (termCandidates.length === 0) {
    return { provider: "themealdb", enabled: true, items: [], count: 0, warning: "no_english_terms" };
  }

  const allRows = [];
  for (const term of termCandidates) {
    const url = new URL("https://www.themealdb.com/api/json/v1/1/filter.php");
    url.searchParams.set("i", term);
    try {
      const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
      const parsed = await parseJsonResponse(res);
      if (!res.ok) {
        continue;
      }
      const meals = Array.isArray(parsed?.meals) ? parsed.meals : [];
      for (const meal of meals) {
        allRows.push({ meal, term });
      }
    } catch {
      // Ignore one-term failures and keep trying other terms.
    }
  }

  const items = allRows.map((row, idx) => {
    const idMeal = row?.meal?.idMeal ? String(row.meal.idMeal).trim() : "";
    const title = cleanText(row?.meal?.strMeal || "") || `Recipe ${idx + 1}`;
    const sourceUrl = idMeal ? `https://www.themealdb.com/meal/${idMeal}` : null;
    return makeRecipeItem({
      provider: "themealdb",
      sourceType: "recipe_site",
      sourceUrl,
      sourceTitle: title,
      sourceChannel: "TheMealDB",
      title,
      description: row?.term || "",
      publishedAt: null,
      inventoryTerms,
      lang: "en",
      idx
    });
  });

  const deduped = dedupeRecipeResults(items).slice(0, Math.min(topN, cfg.max_results));
  return {
    provider: "themealdb",
    enabled: true,
    items: deduped,
    count: deduped.length,
    query: termCandidates.join(", ")
  };
}

function rankCombinedResults(items) {
  const rows = Array.isArray(items) ? items : [];
  rows.sort((a, b) => {
    if (Number(b?.score || 0) !== Number(a?.score || 0)) {
      return Number(b?.score || 0) - Number(a?.score || 0);
    }
    const ta = String(a?.source_published_at || "");
    const tb = String(b?.source_published_at || "");
    return String(tb).localeCompare(String(ta));
  });
  return rows;
}

export async function getLiveRecipeRecommendations(context, inventoryItems, options = {}) {
  const cfg = resolveLiveRecipeConfig(context?.env || {});
  if (!cfg.enabled) {
    return {
      items: [],
      count: 0,
      enabled: false,
      warning: "disabled",
      providers: []
    };
  }

  const lang = normalizeLang(options?.ui_lang || "en");
  const topN = Math.max(1, Number(options?.top_n || 10));
  const userId =
    String(options?.user_id || "").trim() ||
    String(Array.isArray(inventoryItems) && inventoryItems[0]?.user_id ? inventoryItems[0].user_id : "demo-user").trim() ||
    "demo-user";
  const terms = await buildInventoryTermsForLang(context, inventoryItems, lang, Math.min(5, topN), userId);
  const baseQuery = buildFallbackRecipeQuery(terms, lang);
  const blogQuery = buildBlogQuery(terms, lang);
  const recipeWebQuery = buildRecipeWebQuery(terms, lang);

  const providerMap = {
    youtube: () => searchYoutube(cfg.youtube, baseQuery, terms, lang, topN),
    naver_blog: () => searchNaverBlog(cfg.naver, blogQuery, terms, topN),
    naver_web: () => searchNaverWeb(cfg.naver, recipeWebQuery, terms, topN),
    google: () => searchGoogleCse(cfg.google, recipeWebQuery, terms, topN, lang),
    themealdb: () => searchThemealdb(cfg.themealdb, inventoryItems, terms, topN)
  };

  const providers = [];
  for (const name of cfg.provider_order) {
    if (!providerMap[name]) {
      continue;
    }
    providers.push({ name, run: providerMap[name] });
  }

  const liveResults = await Promise.all(
    providers.map(async (p) => {
      try {
        return await p.run();
      } catch (err) {
        return {
          provider: p.name,
          enabled: true,
          items: [],
          count: 0,
          error: err?.message || String(err)
        };
      }
    })
  );

  const combined = [];
  for (const result of liveResults) {
    combined.push(...(Array.isArray(result?.items) ? result.items : []));
  }

  const ranked = rankCombinedResults(dedupeRecipeResults(combined)).slice(0, topN);
  return {
    items: ranked,
    count: ranked.length,
    enabled: true,
    query: baseQuery,
    providers: liveResults.map((r) => ({
      provider: r?.provider || "",
      enabled: Boolean(r?.enabled),
      count: Number(r?.count || 0),
      query: r?.query || null,
      warning: r?.warning || null,
      error: r?.error || null
    }))
  };
}
