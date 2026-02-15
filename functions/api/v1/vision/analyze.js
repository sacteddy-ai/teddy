import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../_lib/http.js";
import { detectIngredientsFromImage } from "../../../_lib/vision.js";
import { captureSessionKey, getObject } from "../../../_lib/store.js";
import { buildAliasLookup } from "../../../_lib/catalog.js";
import { parseConversationCommands } from "../../../_lib/chat.js";
import { augmentParseResultWithChatLlmExtraction } from "../../../_lib/chat_llm_extractor.js";
import { applyCaptureSessionParsedInput } from "../../../_lib/capture.js";
import { ensureCatalogLocalizationForCommands } from "../../../_lib/ingredient_localization.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJson(context.request);
    const userIdInput = payload?.user_id ? String(payload.user_id).trim() : "";
    const sessionIdInput = payload?.session_id ? String(payload.session_id).trim() : "";
    const imageBase64Input = payload?.image_base64 ? String(payload.image_base64) : "";
    const textHintInput = payload?.text_hint ? String(payload.text_hint) : null;
    const sourceType = payload?.source_type ? String(payload.source_type).trim() : "vision";
    const segmentationMode = payload?.segmentation_mode ? String(payload.segmentation_mode).trim().toLowerCase() : "auto";
    const autoApplyToSession = payload?.auto_apply_to_session !== false;
    const uiLang = payload?.ui_lang ? String(payload.ui_lang).trim().toLowerCase() : "";

    if (!imageBase64Input || !imageBase64Input.trim()) {
      throw new Error("image_base64 is required.");
    }
    if (!["auto", "none", "sam3_http"].includes(segmentationMode)) {
      throw new Error("segmentation_mode must be one of: auto, none, sam3_http.");
    }

    const visionResult = await detectIngredientsFromImage(context, imageBase64Input, textHintInput);
    const detectedItems = Array.isArray(visionResult?.detected_items) ? visionResult.detected_items : [];

    let captureApplyResult = null;
    let appliedToSession = false;
    let localization = null;

    if (autoApplyToSession && sessionIdInput && detectedItems.length > 0) {
      const session = await getObject(context.env, captureSessionKey(sessionIdInput));
      if (!session) {
        throw new Error("capture session not found.");
      }
      if (session.status !== "open") {
        throw new Error("capture session is not open.");
      }
      if (userIdInput && session.user_id !== userIdInput) {
        throw new Error("session user_id does not match payload user_id.");
      }

      const aliasLookup = await buildAliasLookup(context, session.user_id);
      let parseResult = parseConversationCommands(textHintInput, detectedItems, aliasLookup);
      parseResult = await augmentParseResultWithChatLlmExtraction(
        context,
        session.user_id,
        textHintInput,
        aliasLookup,
        parseResult
      );

      // Best-effort: ensure the catalog has Korean aliases so the UI can display items in Korean.
      // This does not affect draft parsing for this request, it only improves label rendering.
      try {
        localization = await ensureCatalogLocalizationForCommands(context, session.user_id, parseResult?.commands || [], uiLang);
      } catch {
        localization = null;
      }

      captureApplyResult = await applyCaptureSessionParsedInput(
        context,
        session,
        sourceType,
        textHintInput,
        detectedItems,
        parseResult
      );
      appliedToSession = true;
    }

    let message = null;
    if (detectedItems.length === 0) {
      message = "No ingredients were detected from this image.";
    } else if (!appliedToSession && sessionIdInput && !autoApplyToSession) {
      message = "Detected items were returned but not applied to session because auto_apply_to_session=false.";
    } else if (!appliedToSession && !sessionIdInput) {
      message = "Detected items were returned. Set session_id to append directly to capture draft.";
    }

    return jsonResponse(context, {
      data: {
        detected_items: detectedItems,
        detected_count: detectedItems.length,
        vision: visionResult,
        applied_to_session: appliedToSession,
        session_id: sessionIdInput || null,
        capture: captureApplyResult ? captureApplyResult.capture : null,
        turn: captureApplyResult ? captureApplyResult.turn : null,
        review_queue_items: captureApplyResult ? captureApplyResult.review_queue_items : [],
        review_queue_count: captureApplyResult ? captureApplyResult.review_queue_count : 0,
        localization,
        message
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
