import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../_lib/http.js";
import { getExpirationSuggestion } from "../../../_lib/expiration.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJson(context.request);
    const ingredientName = payload?.ingredient_name ? String(payload.ingredient_name).trim() : "";
    const purchasedAt = payload?.purchased_at ? String(payload.purchased_at).trim() : "";
    if (!ingredientName) {
      throw new Error("ingredient_name is required.");
    }
    if (!purchasedAt) {
      throw new Error("purchased_at is required.");
    }

    const result = await getExpirationSuggestion(context, payload);
    return jsonResponse(context, {
      data: result,
      meta: { calculated_at: new Date().toISOString() }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

