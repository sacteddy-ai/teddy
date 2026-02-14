import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../_lib/http.js";
import { captureSessionKey, getObject, putObject } from "../../../../../_lib/store.js";
import { autoMapPendingUnknownReviewItemsToSessionDraft, buildCaptureSessionView } from "../../../../../_lib/capture.js";
import { createInventoryItemRecord } from "../../../../../_lib/inventory.js";
import { nowIso, todayEpochDay, epochDayToIso } from "../../../../../_lib/util.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  const sessionId = context.params?.session_id ? String(context.params.session_id) : "";
  if (!sessionId) {
    return errorResponse(context, "session_id is required.", 400);
  }

  try {
    let session = await getObject(context.env, captureSessionKey(sessionId));
    if (!session) {
      return errorResponse(context, "capture session not found.", 404);
    }
    if (session.status !== "open") {
      throw new Error("capture session is not open.");
    }

    const payload = await readJsonOptional(context.request);
    const purchasedAt = payload?.purchased_at ? String(payload.purchased_at).trim() : epochDayToIso(todayEpochDay());
    const storageType = payload?.storage_type ? String(payload.storage_type).trim() : "refrigerated";
    const userId = payload?.user_id ? String(payload.user_id).trim() : String(session.user_id);
    const openedAt = payload?.opened_at ? String(payload.opened_at).trim() : null;

    let autoMappedReviewCount = 0;
    let draftItems = Array.isArray(session?.draft_items) ? session.draft_items : [];

    if (draftItems.length === 0) {
      const autoMapResult = await autoMapPendingUnknownReviewItemsToSessionDraft(context, session, userId);
      autoMappedReviewCount = Number(autoMapResult?.mapped_count || 0);
      if (autoMappedReviewCount > 0) {
        session = await getObject(context.env, captureSessionKey(sessionId));
        draftItems = Array.isArray(session?.draft_items) ? session.draft_items : [];
      }
    }

    if (draftItems.length === 0) {
      throw new Error("capture session has no draft items. Resolve pending confirmations first.");
    }

    const createdItems = [];
    const createdNotifications = [];

    for (const draftItem of draftItems) {
      const createResult = await createInventoryItemRecord(context, {
        user_id: userId,
        ingredient_name: draftItem.ingredient_name,
        purchased_at: purchasedAt,
        storage_type: storageType,
        quantity: Number(draftItem.quantity || 1),
        unit: draftItem.unit || "ea",
        opened_at: openedAt,
        ingredient_key_hint: draftItem.ingredient_key
      });
      createdItems.push(createResult.item);
      createdNotifications.push(...(createResult.notifications || []));
    }

    const finalizedAt = nowIso();
    const updatedSession = {
      ...session,
      status: "finalized",
      finalized_at: finalizedAt,
      updated_at: finalizedAt,
      created_inventory_item_ids: createdItems.map((i) => i.id)
    };
    await putObject(context.env, captureSessionKey(sessionId), updatedSession);

    return jsonResponse(context, {
      data: {
        capture: await buildCaptureSessionView(context, updatedSession),
        created_items: createdItems,
        created_notifications_count: createdNotifications.length,
        auto_mapped_review_count: autoMappedReviewCount
      }
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === "capture session not found.") {
      return errorResponse(context, msg, 404);
    }
    return errorResponse(context, msg, 400);
  }
}

