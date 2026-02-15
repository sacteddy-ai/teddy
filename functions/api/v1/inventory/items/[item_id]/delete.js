import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../_lib/http.js";
import { deleteInventoryItemRecord } from "../../../../../_lib/inventory.js";

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

    const result = await deleteInventoryItemRecord(context, userId, itemId);
    return jsonResponse(context, {
      data: {
        deleted: true,
        item_id: itemId,
        removed_notification_count: Number(result?.removed_notification_count || 0)
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

