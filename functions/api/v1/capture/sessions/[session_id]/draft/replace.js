import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../../../_lib/http.js";
import { captureSessionKey, getObject, putObject } from "../../../../../../_lib/store.js";
import { buildAliasLookup } from "../../../../../../_lib/catalog.js";
import { applyConversationCommandsToDraft } from "../../../../../../_lib/chat.js";
import { buildCaptureSessionView } from "../../../../../../_lib/capture.js";
import { ensureCatalogLocalizationForCommands } from "../../../../../../_lib/ingredient_localization.js";
import { nowIso, normalizeIngredientKey, normalizeReviewPhraseValue, normalizeWord } from "../../../../../../_lib/util.js";

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

function resolveTargetIngredient(aliasLookup, label) {
  const normalized = normalizeReviewPhraseValue(label);
  const mention = normalized ? aliasLookup.get(normalizeWord(normalized)) : null;
  if (mention?.ingredient_key) {
    return {
      ingredient_key: String(mention.ingredient_key),
      ingredient_name: String(mention.ingredient_name || mention.ingredient_key)
    };
  }
  const fallbackKey = normalizeIngredientKey(normalized || label);
  return {
    ingredient_key: fallbackKey,
    ingredient_name: normalized || label || fallbackKey
  };
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
    const uiLang = payload?.ui_lang ? String(payload.ui_lang).trim().toLowerCase() : "";
    const replaceAll = payload?.replace_all === true;

    const fromKeyRaw = payload?.from_ingredient_key ? String(payload.from_ingredient_key).trim() : "";
    if (!fromKeyRaw) {
      throw new Error("from_ingredient_key is required.");
    }
    const fromKey = normalizeIngredientKey(fromKeyRaw);
    if (!fromKey) {
      throw new Error("from_ingredient_key is invalid.");
    }

    const toLabel = payload?.to_label ? String(payload.to_label).trim() : "";
    if (!toLabel) {
      throw new Error("to_label is required.");
    }

    const quantity = coerceQuantity(payload?.quantity);
    const unit = coerceUnit(payload?.unit);

    const session = await getObject(context.env, captureSessionKey(sessionId));
    if (!session) {
      return errorResponse(context, "capture session not found.", 404);
    }
    if (session.status !== "open") {
      throw new Error("capture session is not open.");
    }
    if (userId && session.user_id && String(session.user_id) !== String(userId)) {
      // Allow overriding userId only when it matches the session.
      throw new Error("session user_id does not match payload user_id.");
    }

    const aliasLookup = await buildAliasLookup(context, session.user_id);
    const target = resolveTargetIngredient(aliasLookup, toLabel);

    const currentDraft = Array.isArray(session?.draft_items) ? session.draft_items : [];
    let effectiveQuantity = quantity;
    let effectiveUnit = unit;

    if (replaceAll) {
      const fromEntry =
        currentDraft.find((i) => normalizeIngredientKey(i?.ingredient_key || "") === fromKey) || null;
      const fromQty = fromEntry ? Number(fromEntry.quantity || 0) : 0;
      if (Number.isFinite(fromQty) && fromQty > 0) {
        effectiveQuantity = Math.round(fromQty * 100) / 100;
      }
      if (fromEntry?.unit) {
        effectiveUnit = coerceUnit(fromEntry.unit);
      }
    }

    const commands = [
      {
        action: "remove",
        ingredient_key: fromKey,
        ingredient_name: fromKey,
        quantity: replaceAll ? null : effectiveQuantity,
        unit: effectiveUnit,
        remove_all: Boolean(replaceAll),
        source: "draft_edit",
        confidence: "high",
        matched_alias: fromKeyRaw,
        match_type: "edit"
      },
      {
        action: "add",
        ingredient_key: target.ingredient_key,
        ingredient_name: target.ingredient_name,
        quantity: effectiveQuantity,
        unit: effectiveUnit,
        remove_all: false,
        source: "draft_edit",
        confidence: "high",
        matched_alias: toLabel,
        match_type: "edit"
      }
    ];

    // Best-effort: ensure the catalog has Korean aliases so the UI can render localized labels.
    let localization = null;
    try {
      localization = await ensureCatalogLocalizationForCommands(context, session.user_id, commands, uiLang);
    } catch {
      localization = null;
    }

    const nextDraft = applyConversationCommandsToDraft(currentDraft, commands);

    const updatedAt = nowIso();
    const updatedSession = {
      ...session,
      draft_items: nextDraft,
      updated_at: updatedAt
    };
    await putObject(context.env, captureSessionKey(sessionId), updatedSession);

    return jsonResponse(context, {
      data: {
        capture: await buildCaptureSessionView(context, updatedSession),
        replacement: {
          from_ingredient_key: fromKey,
          to_ingredient_key: target.ingredient_key,
          to_ingredient_name: target.ingredient_name,
          quantity: effectiveQuantity,
          unit: effectiveUnit,
          replace_all: Boolean(replaceAll)
        },
        localization
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
