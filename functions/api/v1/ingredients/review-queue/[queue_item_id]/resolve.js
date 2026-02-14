import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../_lib/http.js";
import { resolveIngredientReviewQueueItem } from "../../../../../_lib/capture.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  const queueItemId = context.params?.queue_item_id ? String(context.params.queue_item_id) : "";
  if (!queueItemId) {
    return errorResponse(context, "queue_item_id is required.", 400);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = String(payload?.user_id || "demo-user").trim() || "demo-user";
    const action = payload?.action ? String(payload.action).trim().toLowerCase() : "map";
    if (!["map", "ignore"].includes(action)) {
      throw new Error("action must be map or ignore.");
    }

    const result = await resolveIngredientReviewQueueItem(context, userId, queueItemId, {
      ...payload,
      action
    });

    return jsonResponse(context, { data: result });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === "review queue item not found.") {
      return errorResponse(context, msg, 404);
    }
    return errorResponse(context, msg, 400);
  }
}

