import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../../_lib/http.js";
import { captureSessionKey, getObject, putObject } from "../../../../../../_lib/store.js";
import { applyConversationCommandsToDraft } from "../../../../../../_lib/chat.js";
import { applyDraftMutationWithHistory, buildCaptureSessionView } from "../../../../../../_lib/capture.js";
import { normalizeIngredientKey } from "../../../../../../_lib/util.js";

function coerceQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 1.0;
  }
  return Math.round(n * 100) / 100;
}

function coerceUnit(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.length > 12) {
    return "ea";
  }
  return raw;
}

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
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";

    const ingredientKeyRaw = payload?.ingredient_key ? String(payload.ingredient_key).trim() : "";
    if (!ingredientKeyRaw) {
      throw new Error("ingredient_key is required.");
    }
    const ingredientKey = normalizeIngredientKey(ingredientKeyRaw);
    if (!ingredientKey) {
      throw new Error("ingredient_key is invalid.");
    }

    const quantity = coerceQuantity(payload?.quantity);
    const unit = coerceUnit(payload?.unit);
    const removeAll = payload?.remove_all === true;

    const session = await getObject(context.env, captureSessionKey(sessionId));
    if (!session) {
      return errorResponse(context, "capture session not found.", 404);
    }
    if (session.status !== "open") {
      throw new Error("capture session is not open.");
    }
    if (userId && session.user_id && String(session.user_id) !== String(userId)) {
      throw new Error("session user_id does not match payload user_id.");
    }

    const commands = [
      {
        action: "remove",
        ingredient_key: ingredientKey,
        ingredient_name: ingredientKey,
        quantity: removeAll ? null : quantity,
        unit,
        remove_all: Boolean(removeAll),
        source: "draft_edit",
        confidence: "high",
        matched_alias: ingredientKeyRaw,
        match_type: "edit"
      }
    ];

    const currentDraft = Array.isArray(session?.draft_items) ? session.draft_items : [];
    const nextDraft = applyConversationCommandsToDraft(currentDraft, commands);

    const updatedSession = applyDraftMutationWithHistory(session, nextDraft, {
      source_type: "draft_remove",
      reason: removeAll ? "remove_all" : "remove",
      source_text: ingredientKeyRaw,
      user_id: userId
    });
    await putObject(context.env, captureSessionKey(sessionId), updatedSession);

    return jsonResponse(context, {
      data: {
        capture: await buildCaptureSessionView(context, updatedSession),
        removed: {
          ingredient_key: ingredientKey,
          quantity: removeAll ? null : quantity,
          unit,
          remove_all: Boolean(removeAll)
        }
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
