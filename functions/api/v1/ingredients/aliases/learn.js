import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../../_lib/http.js";
import { addIngredientAliasOverride } from "../../../../_lib/catalog.js";

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
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const ingredientKey = payload?.ingredient_key ? String(payload.ingredient_key).trim() : "";
    const alias = payload?.alias ? String(payload.alias).trim() : "";
    const displayName = payload?.display_name ? String(payload.display_name).trim() : null;

    const result = await addIngredientAliasOverride(context, userId, ingredientKey, alias, displayName);
    return jsonResponse(context, { data: result }, 200);
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

