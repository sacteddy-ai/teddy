import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../_lib/http.js";
import { invokeInventoryConsumption, normalizeInventoryStatus } from "../../../../../_lib/inventory.js";

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
    const consumedQuantityInput = payload?.consumed_quantity;
    const openedAt = payload?.opened_at ? String(payload.opened_at).trim() : null;
    const markOpened = payload?.mark_opened === true;
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";

    let consumedQuantity = consumedQuantityInput === null || consumedQuantityInput === undefined ? 1.0 : Number(consumedQuantityInput);
    if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
      throw new Error("consumed_quantity must be greater than 0.");
    }

    const result = await invokeInventoryConsumption(context, userId, itemId, consumedQuantity, openedAt, markOpened);
    const normalized = normalizeInventoryStatus(result.updated_item);
    const removed = Boolean(result?.removed);
    const shouldReorder = removed || Number(normalized?.quantity || 0) <= 0;

    return jsonResponse(context, {
      data: {
        item: normalized,
        consumed_quantity: consumedQuantity,
        removed,
        should_reorder: shouldReorder
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
