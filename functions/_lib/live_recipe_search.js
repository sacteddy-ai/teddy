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

function resolveLiveRecipeConfig(env) {
  const enabledRaw = safeString(env?.ENABLE_LIVE_RECIPE_SEARCH, "").toLowerCase();
  const apiKey = safeString(env?.YOUTUBE_API_KEY, "");

  const explicitEnable =
    enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";
  const enabled = explicitEnable || (!enabledRaw && Boolean(apiKey));

  const maxResults = clampNumber(env?.YOUTUBE_SEARCH_MAX_RESULTS, 10, 1, 25);
  const regionCode = safeString(env?.YOUTUBE_SEARCH_REGION, "KR");
  const categoryId = safeString(env?.YOUTUBE_SEARCH_CATEGORY_ID, "26");

  return { enabled, apiKey, maxResults, regionCode, categoryId };
}

function toInventoryTerm(item, lang) {
  const name = String(item?.ingredient_name || "").trim();
  const key = String(item?.ingredient_key || "").trim();
  const source = name || key;
  if (!source) {
    return "";
  }
  if (lang === "ko" && hasHangul(source)) {
    return source;
  }
  const fallback = source
    .replace(/_/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return fallback;
}

function buildInventoryTerms(inventoryItems, lang, maxTerms = 4) {
  const rows = Array.isArray(inventoryItems) ? inventoryItems : [];
  const scored = [];
  for (const item of rows) {
    const term = toInventoryTerm(item, lang);
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

function buildYoutubeQuery(terms, lang) {
  const core = (Array.isArray(terms) ? terms : []).filter((v) => String(v || "").trim()).join(" ");
  if (lang === "ko") {
    return `${core || "집밥"} 레시피`;
  }
  return `${core || "home cooking"} recipe`;
}

function normalizeForMatch(value) {
  return normalizeWord(String(value || "").replace(/[^\p{L}\p{N}\s]+/gu, " "));
}

function scoreByTitle(title, terms) {
  const normalizedTitle = normalizeForMatch(title);
  if (!normalizedTitle) {
    return { term_hits: 0, match_ratio: 0 };
  }

  const safeTerms = (Array.isArray(terms) ? terms : []).map((t) => normalizeForMatch(t)).filter(Boolean);
  if (safeTerms.length === 0) {
    return { term_hits: 0, match_ratio: 0 };
  }

  let hits = 0;
  for (const term of safeTerms) {
    if (normalizedTitle.includes(term)) {
      hits += 1;
    }
  }
  const ratio = hits / safeTerms.length;
  return {
    term_hits: hits,
    match_ratio: Math.round(ratio * 1000) / 1000
  };
}

function mapYoutubeItemToRecipe(item, inventoryTerms, idx) {
  const videoId = item?.id?.videoId ? String(item.id.videoId).trim() : "";
  const snippet = item?.snippet && typeof item.snippet === "object" ? item.snippet : {};
  const title = String(snippet?.title || "").trim() || `YouTube recipe ${idx + 1}`;
  const channel = String(snippet?.channelTitle || "").trim() || "YouTube";
  const publishedAt = String(snippet?.publishedAt || "").trim() || null;
  const sourceUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;

  const scoreMeta = scoreByTitle(title, inventoryTerms);
  const score = Math.round((scoreMeta.match_ratio * 100 + scoreMeta.term_hits * 5) * 100) / 100;

  return {
    recipe_id: videoId ? `yt_${videoId}` : `yt_unknown_${idx + 1}`,
    recipe_name: title,
    chef: channel,
    tags: ["youtube", "web"],
    required_ingredient_keys: [],
    optional_ingredient_keys: [],
    matched_ingredient_keys: [],
    missing_ingredient_keys: [],
    can_make_now: false,
    expiring_soon_used_count: 0,
    match_ratio: scoreMeta.match_ratio,
    score,
    source_type: "youtube",
    source_url: sourceUrl,
    source_title: title,
    source_channel: channel,
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

export async function getLiveRecipeRecommendations(context, inventoryItems, options = {}) {
  const cfg = resolveLiveRecipeConfig(context?.env || {});
  if (!cfg.enabled) {
    return { items: [], count: 0, provider: "youtube", enabled: false, warning: "disabled" };
  }
  if (!cfg.apiKey) {
    return { items: [], count: 0, provider: "youtube", enabled: true, warning: "missing_api_key" };
  }

  const lang = normalizeLang(options?.ui_lang || "en");
  const topN = Math.max(1, Number(options?.top_n || 10));
  const terms = buildInventoryTerms(inventoryItems, lang, Math.min(4, topN));
  const query = buildYoutubeQuery(terms, lang);

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", cfg.categoryId);
  url.searchParams.set("maxResults", String(Math.max(topN, cfg.maxResults)));
  url.searchParams.set("q", query);
  url.searchParams.set("regionCode", cfg.regionCode);
  url.searchParams.set("key", cfg.apiKey);
  if (lang === "ko") {
    url.searchParams.set("relevanceLanguage", "ko");
  } else {
    url.searchParams.set("relevanceLanguage", "en");
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const rawText = await res.text();
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const msg =
        parsed?.error?.message ||
        parsed?.message ||
        `youtube_search_failed_${res.status}`;
      return { items: [], count: 0, provider: "youtube", enabled: true, error: msg };
    }

    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const mapped = rows.map((item, idx) => mapYoutubeItemToRecipe(item, terms, idx));
    mapped.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const ta = String(a.source_published_at || "");
      const tb = String(b.source_published_at || "");
      return String(tb).localeCompare(String(ta));
    });

    const deduped = dedupeRecipeResults(mapped).slice(0, topN);
    return {
      items: deduped,
      count: deduped.length,
      provider: "youtube",
      enabled: true,
      query
    };
  } catch (err) {
    return {
      items: [],
      count: 0,
      provider: "youtube",
      enabled: true,
      error: err?.message || String(err)
    };
  }
}

