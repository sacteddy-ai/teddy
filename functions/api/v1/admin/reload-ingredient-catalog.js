import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { clearShelfLifeRuleCache } from "../../../_lib/expiration.js";
import { clearIngredientCatalogCache } from "../../../_lib/catalog.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }

  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    await readJsonOptional(context.request);
    clearShelfLifeRuleCache();
    clearIngredientCatalogCache();

    const now = new Date().toISOString();
    const reloaded = ["shelf_life_rules", "ingredient_catalog"];
    return jsonResponse(context, {
      data: {
        reloaded,
        reloaded_count: reloaded.length,
        reloaded_at: now
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err));
  }
}

