import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { getRecipeRecommendations, getShoppingSuggestions } from "../../../_lib/recommendation.js";

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
    const topRecipeCount = Number(url.searchParams.get("top_recipe_count") || 3);
    const lowStockThresholdRaw = url.searchParams.get("low_stock_threshold");
    const lowStockThreshold = lowStockThresholdRaw ? Number(lowStockThresholdRaw) : null;

    const inventory = await recomputeInventoryStatuses(context, userId);
    const recs = await getRecipeRecommendations(context, inventory, topN);
    const shopping = await getShoppingSuggestions(context, inventory, recs, {
      top_recipe_count: topRecipeCount,
      low_stock_threshold: lowStockThreshold
    });

    return jsonResponse(context, {
      data: {
        items: shopping.items,
        count: shopping.count,
        low_stock_threshold: shopping.low_stock_threshold
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

