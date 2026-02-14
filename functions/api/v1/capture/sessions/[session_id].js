import { jsonResponse, errorResponse, withOptionsCors } from "../../../../_lib/http.js";
import { buildCaptureSessionView } from "../../../../_lib/capture.js";
import { captureSessionKey, getObject } from "../../../../_lib/store.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return errorResponse(context, "Not found.", 404);
  }

  const sessionId = context.params?.session_id ? String(context.params.session_id) : "";
  if (!sessionId) {
    return errorResponse(context, "session_id is required.", 400);
  }

  try {
    const session = await getObject(context.env, captureSessionKey(sessionId));
    if (!session) {
      return errorResponse(context, "capture session not found.", 404);
    }
    return jsonResponse(context, { data: await buildCaptureSessionView(context, session) }, 200);
  } catch (err) {
    return errorResponse(context, err?.message || String(err));
  }
}

