import { errorResponse, jsonResponse, readJsonOptional, withOptionsCors } from "../../../../../_lib/http.js";
import { updateShoppingOrderDraftStatus } from "../../../../../_lib/order_draft.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  const draftId = context.params?.draft_id ? String(context.params.draft_id).trim() : "";
  if (!draftId) {
    return errorResponse(context, "draft_id is required.", 400);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const draft = await updateShoppingOrderDraftStatus(context, {
      user_id: userId,
      draft_id: draftId,
      next_status: "approved_pending_checkout",
      approval_note: payload?.approval_note || null
    });

    return jsonResponse(context, {
      data: {
        draft
      }
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === "order draft not found.") {
      return errorResponse(context, msg, 404);
    }
    return errorResponse(context, msg, 400);
  }
}
