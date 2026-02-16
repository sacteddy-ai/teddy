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

function dedupeRecipes(items, topN) {
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
    if (out.length >= topN) {
      break;
    }
  }
  return out;
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

    const inventory = await recomputeInventoryStatuses(context, userId);
    const seeded = await getRecipeRecommendations(context, inventory, { top_n: topN, ui_lang: uiLang });

    let live = {
      items: [],
      count: 0,
      provider: "youtube",
      enabled: false,
      warning: "include_live_false"
    };
    if (includeLive) {
      live = await getLiveRecipeRecommendations(context, inventory, { top_n: topN, ui_lang: uiLang });
    }

    const recs = dedupeRecipes([...(live.items || []), ...seeded], Math.max(1, Number(topN || 10)));

    return jsonResponse(context, {
      data: {
        items: recs,
        count: recs.length,
        ui_lang: uiLang,
        live: {
          include_live: includeLive,
          provider: live.provider || "youtube",
          enabled: Boolean(live.enabled),
          count: Number(live.count || 0),
          query: live.query || null,
          warning: live.warning || null,
          error: live.error || null
        }
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
