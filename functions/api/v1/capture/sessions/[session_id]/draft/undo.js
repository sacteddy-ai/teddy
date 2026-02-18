import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../../_lib/http.js";
import { captureSessionKey, getObject, putObject } from "../../../../../../_lib/store.js";
import { buildCaptureSessionView, popCaptureDraftHistory } from "../../../../../../_lib/capture.js";

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

    const undoResult = popCaptureDraftHistory(session);
    if (!undoResult) {
      throw new Error("no draft history to undo.");
    }

    await putObject(context.env, captureSessionKey(sessionId), undoResult.session);

    return jsonResponse(context, {
      data: {
        capture: await buildCaptureSessionView(context, undoResult.session),
        undone: {
          entry_id: undoResult?.entry?.id || null,
          source_type: undoResult?.entry?.source_type || null,
          reason: undoResult?.entry?.reason || null,
          created_at: undoResult?.entry?.created_at || null,
          remaining_history_count: Number(undoResult?.remaining_history_count || 0)
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

