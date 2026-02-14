import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../../../_lib/http.js";
import { captureSessionKey, getObject } from "../../../../../_lib/store.js";
import { buildAliasLookup } from "../../../../../_lib/catalog.js";
import { parseConversationCommands } from "../../../../../_lib/chat.js";
import { applyCaptureSessionParsedInput } from "../../../../../_lib/capture.js";

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
    const session = await getObject(context.env, captureSessionKey(sessionId));
    if (!session) {
      return errorResponse(context, "capture session not found.", 404);
    }
    if (session.status !== "open") {
      throw new Error("capture session is not open.");
    }

    const payload = await readJson(context.request);
    const textInput = payload?.text ? String(payload.text) : "";
    const sourceType = payload?.source_type ? String(payload.source_type).trim() : "text";
    const visionDetectedItems = Array.isArray(payload?.vision_detected_items)
      ? payload.vision_detected_items.map((v) => String(v))
      : [];

    if (!String(textInput || "").trim() && visionDetectedItems.length === 0) {
      throw new Error("Either text or vision_detected_items is required.");
    }

    const aliasLookup = await buildAliasLookup(context, session.user_id);
    const parseResult = parseConversationCommands(textInput, visionDetectedItems, aliasLookup);
    const applyResult = await applyCaptureSessionParsedInput(
      context,
      session,
      sourceType,
      textInput,
      visionDetectedItems,
      parseResult
    );

    return jsonResponse(context, { data: applyResult }, 200);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg === "capture session not found.") {
      return errorResponse(context, msg, 404);
    }
    return errorResponse(context, msg, 400);
  }
}

