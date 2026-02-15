import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../_lib/http.js";
import { invokeInventoryQuantityAdjustment, normalizeInventoryStatus } from "../../../../../_lib/inventory.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  const itemId = context.params?.item_id ? String(context.params.item_id) : "";
  if (!itemId) {
    return errorResponse(context, "item_id is required.", 400);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const deltaInput = payload?.delta_quantity;
    const deltaQuantity = Number(deltaInput);
    if (!Number.isFinite(deltaQuantity) || deltaQuantity === 0) {
      throw new Error("delta_quantity must be a non-zero number.");
    }

    const result = await invokeInventoryQuantityAdjustment(context, userId, itemId, deltaQuantity);
    const normalized = result?.updated_item ? normalizeInventoryStatus(result.updated_item) : null;

    return jsonResponse(context, {
      data: {
        item: normalized,
        delta_quantity: deltaQuantity,
        removed: Boolean(result?.removed)
      }
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === "inventory item not found.") {
      return errorResponse(context, msg, 404);
    }
    return errorResponse(context, msg, 400);
  }
}

