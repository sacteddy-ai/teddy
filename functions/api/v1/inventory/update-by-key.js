import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { buildAliasLookup } from "../../../_lib/catalog.js";
import { normalizeIngredientKey, normalizeWord } from "../../../_lib/util.js";
import { updateInventoryByIngredientKey } from "../../../_lib/inventory.js";

function resolveIngredientKey(rawKey, rawName, aliasLookup) {
  const direct = normalizeIngredientKey(String(rawKey || "").trim());
  if (direct) {
    return direct;
  }

  const name = String(rawName || "").trim();
  if (!name) {
    return "";
  }

  const mention = aliasLookup.get(normalizeWord(name)) || null;
  if (mention?.ingredient_key) {
    return normalizeIngredientKey(String(mention.ingredient_key));
  }
  return normalizeIngredientKey(name);
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const ingredientName = payload?.ingredient_name ? String(payload.ingredient_name).trim() : "";
    const aliasLookup = await buildAliasLookup(context, userId);
    const ingredientKey = resolveIngredientKey(payload?.ingredient_key, ingredientName, aliasLookup);
    if (!ingredientKey) {
      throw new Error("ingredient_key or ingredient_name is required.");
    }

    const result = await updateInventoryByIngredientKey(context, userId, ingredientKey, {
      storage_type: payload?.storage_type ? String(payload.storage_type).trim() : "",
      quantity: payload?.quantity,
      expiration_date: payload?.expiration_date
    });

    if (Number(result?.matched_count || 0) <= 0) {
      return errorResponse(context, "inventory item not found.", 404, {
        ingredient_key: ingredientKey
      });
    }

    return jsonResponse(context, {
      data: {
        ingredient_key: ingredientKey,
        matched_count: result.matched_count,
        item: result.updated_item
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
