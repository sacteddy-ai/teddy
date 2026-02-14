import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { getRecipeRecommendations } from "../../../_lib/recommendation.js";

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

    const inventory = await recomputeInventoryStatuses(context, userId);
    const recs = await getRecipeRecommendations(context, inventory, topN);

    return jsonResponse(context, {
      data: {
        items: recs,
        count: recs.length
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

