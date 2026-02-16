import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { getRecipeRecommendations } from "../../../_lib/recommendation.js";
import { getLiveRecipeRecommendations } from "../../../_lib/live_recipe_search.js";

function parseBool(value, fallback = false) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return fallback;
}

function resolveLiveOnly(context, url) {
  const queryValue = url?.searchParams?.get("live_only");
  if (queryValue !== null) {
    return parseBool(queryValue, true);
  }

  const envValue = context?.env?.RECIPE_LIVE_ONLY;
  if (envValue === null || envValue === undefined || String(envValue).trim() === "") {
    // Default to live-only mode for this project.
    return true;
  }
  return parseBool(envValue, true);
}

function hasUsableInventory(inventoryItems) {
  const rows = Array.isArray(inventoryItems) ? inventoryItems : [];
  for (const item of rows) {
    const qty = Number(item?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const status = String(item?.status || "").trim().toLowerCase();
    if (status === "expired") {
      continue;
    }
    return true;
  }
  return false;
}

function dedupeRecipes(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const sourceUrl = String(item?.source_url || "").trim();
    const recipeId = String(item?.recipe_id || "").trim();
    const key = String(sourceUrl || recipeId || item?.recipe_name || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hasHangul(value) {
  return /[\uAC00-\uD7A3]/.test(String(value || ""));
}

function getHostname(urlValue) {
  try {
    return String(new URL(String(urlValue || "")).hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeProviderKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "seed";
  }
  if (raw === "youtube") {
    return "youtube";
  }
  if (raw === "naver_blog") {
    return "naver_blog";
  }
  if (raw === "naver_web") {
    return "naver_web";
  }
  if (raw === "google" || raw === "google_web") {
    return "google";
  }
  if (raw === "themealdb" || raw === "recipe_site") {
    return "recipe_site";
  }
  if (raw === "seed" || raw === "catalog") {
    return "seed";
  }
  return raw;
}

function providerFromRecipe(item) {
  const sourceProvider = String(item?.source_provider || "").trim();
  if (sourceProvider) {
    return normalizeProviderKey(sourceProvider);
  }
  return normalizeProviderKey(item?.source_type || "seed");
}

function getKoreanPreferenceScore(item) {
  const provider = providerFromRecipe(item);
  const text = [
    String(item?.recipe_name || "").trim(),
    String(item?.source_title || "").trim(),
    String(item?.source_channel || "").trim()
  ]
    .filter((v) => v)
    .join(" ");
  const host = getHostname(item?.source_url || "");

  let score = 0;
  if (hasHangul(text)) {
    score += 26;
  }
  if (host.endsWith(".kr")) {
    score += 10;
  }
  if (host.includes("naver.com")) {
    score += 10;
  }
  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    score += 4;
  }

  if (provider === "naver_blog") {
    score += 16;
  } else if (provider === "naver_web") {
    score += 13;
  } else if (provider === "youtube") {
    score += 7;
  } else if (provider === "google") {
    score += 5;
  } else if (provider === "recipe_site") {
    score -= 8;
  }

  return score;
}

function sortRecipesForUiLang(items, uiLang) {
  const rows = Array.isArray(items) ? [...items] : [];
  const normalizedLang = String(uiLang || "").trim().toLowerCase();

  rows.sort((a, b) => {
    if (normalizedLang === "ko") {
      const koDelta = getKoreanPreferenceScore(b) - getKoreanPreferenceScore(a);
      if (koDelta !== 0) {
        return koDelta;
      }
    }

    const aMake = a?.can_make_now ? 0 : 1;
    const bMake = b?.can_make_now ? 0 : 1;
    if (aMake !== bMake) {
      return aMake - bMake;
    }

    const scoreDelta = Number(b?.score || 0) - Number(a?.score || 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const matchDelta = Number(b?.match_ratio || 0) - Number(a?.match_ratio || 0);
    if (matchDelta !== 0) {
      return matchDelta;
    }

    return String(a?.recipe_name || "").localeCompare(String(b?.recipe_name || ""));
  });

  return rows;
}

function buildGroupedRecipeItems(items, liveProviders = []) {
  const grouped = new Map();
  for (const item of items || []) {
    const provider = providerFromRecipe(item);
    if (!grouped.has(provider)) {
      grouped.set(provider, []);
    }
    grouped.get(provider).push(item);
  }

  const order = [];
  const seen = new Set();
  const providerRows = Array.isArray(liveProviders) ? liveProviders : [];
  for (const row of providerRows) {
    const key = normalizeProviderKey(row?.provider || "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    order.push(key);
  }

  const defaults = ["youtube", "naver_blog", "naver_web", "google", "recipe_site", "seed"];
  for (const key of defaults) {
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }

  for (const key of grouped.keys()) {
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }

  const out = [];
  for (const provider of order) {
    const rows = grouped.get(provider);
    if (!rows || rows.length === 0) {
      continue;
    }
    out.push({
      provider,
      count: rows.length,
      items: rows
    });
  }
  return out;
}

function normalizeLiveProviders(live) {
  if (Array.isArray(live?.providers)) {
    return live.providers.map((row) => ({
      provider: String(row?.provider || "").trim(),
      enabled: Boolean(row?.enabled),
      count: Number(row?.count || 0),
      query: row?.query || null,
      warning: row?.warning || null,
      error: row?.error || null
    }));
  }

  if (live?.provider) {
    return [
      {
        provider: String(live.provider).trim(),
        enabled: Boolean(live?.enabled),
        count: Number(live?.count || 0),
        query: live?.query || null,
        warning: live?.warning || null,
        error: live?.error || null
      }
    ];
  }

  return [];
}

function pickPrimaryProvider(live, providers) {
  const rows = Array.isArray(providers) ? providers : [];
  const matched = rows.find((row) => row.enabled && row.count > 0);
  if (matched?.provider) {
    return matched.provider;
  }
  if (rows[0]?.provider) {
    return rows[0].provider;
  }
  if (live?.provider) {
    return String(live.provider).trim();
  }
  return null;
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const url = new URL(context.request.url);
    const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
    const topN = Number(url.searchParams.get("top_n") || 10);
    const uiLang = (url.searchParams.get("ui_lang") || "en").trim().toLowerCase();
    const includeLive = parseBool(url.searchParams.get("include_live"), true);
    const liveOnly = resolveLiveOnly(context, url);

    const inventory = await recomputeInventoryStatuses(context, userId);
    if (!hasUsableInventory(inventory)) {
      return jsonResponse(context, {
        data: {
          items: [],
          count: 0,
          grouped_items: [],
          ui_lang: uiLang,
          live: {
            include_live: includeLive,
            provider: null,
            enabled: false,
            count: 0,
            query: null,
            warning: "empty_inventory",
            error: null,
            providers: []
          }
        }
      });
    }

    let seeded = [];
    if (!liveOnly) {
      seeded = await getRecipeRecommendations(context, inventory, { top_n: topN, ui_lang: uiLang });
    }

    let live = {
      items: [],
      count: 0,
      enabled: false,
      warning: "include_live_false",
      providers: []
    };
    if (includeLive) {
      live = await getLiveRecipeRecommendations(context, inventory, {
        top_n: topN,
        ui_lang: uiLang,
        user_id: userId
      });
    }
    const liveProviders = normalizeLiveProviders(live);
    const primaryProvider = pickPrimaryProvider(live, liveProviders);

    const sourceItems = liveOnly ? [...(live.items || [])] : [...(live.items || []), ...seeded];
    const deduped = dedupeRecipes(sourceItems);
    const sorted = sortRecipesForUiLang(deduped, uiLang);
    const recs = sorted.slice(0, Math.max(1, Number(topN || 10)));
    const groupedItems = buildGroupedRecipeItems(recs, liveProviders);

    return jsonResponse(context, {
      data: {
        items: recs,
        count: recs.length,
        grouped_items: groupedItems,
        ui_lang: uiLang,
        live: {
          include_live: includeLive,
          live_only: liveOnly,
          provider: primaryProvider,
          enabled: Boolean(live.enabled),
          count: Number(live.count || 0),
          query: live.query || null,
          warning: live.warning || null,
          error: live.error || null,
          providers: liveProviders
        }
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
