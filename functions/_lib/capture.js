import { addIngredientAliasOverride } from "./catalog.js";
import { applyConversationCommandsToDraft, getDraftSummary } from "./chat.js";
import { filterReviewCandidatesWithPhraseClassifier } from "./review_phrase_classifier.js";
import { nowIso, normalizeWhitespace, normalizeWord, normalizeIngredientKey } from "./util.js";
import {
  captureSessionKey,
  getArray,
  putArray,
  getObject,
  putObject,
  reviewQueueKey
} from "./store.js";

function normalizeReviewPhrase(value) {
  return normalizeWhitespace(normalizeWord(value));
}

function containsCorrectionIntent(text) {
  const t = normalizeWord(text);
  if (!t) {
    return false;
  }
  return (
    t.includes("아니라") ||
    t.includes("아니고") ||
    t.includes("정정") ||
    t.includes("대신") ||
    t.includes("바꿔") ||
    t.includes("바꾸") ||
    t.includes("수정") ||
    /\bnot\b/i.test(t) ||
    /\binstead\b/i.test(t) ||
    /\brather\b/i.test(t)
  );
}

function findDraftItemByKey(draftItems, ingredientKey) {
  const key = normalizeIngredientKey(ingredientKey);
  if (!key) {
    return null;
  }
  for (const item of draftItems || []) {
    if (normalizeIngredientKey(item?.ingredient_key || "") === key) {
      return item;
    }
  }
  return null;
}

function pickLastAddedIngredientKeyFromTurns(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const cmds = Array.isArray(turns[i]?.parsed_commands) ? turns[i].parsed_commands : [];
    for (let j = cmds.length - 1; j >= 0; j -= 1) {
      const cmd = cmds[j];
      if (cmd?.action === "add" && cmd?.ingredient_key) {
        const key = normalizeIngredientKey(cmd.ingredient_key);
        if (key) {
          return key;
        }
      }
    }
  }
  return null;
}

function commandTextIndex(cmd, normalizedText) {
  const hay = String(normalizedText || "");
  if (!hay) {
    return Number.POSITIVE_INFINITY;
  }
  const alias = cmd?.matched_alias || cmd?.ingredient_name || cmd?.ingredient_key || "";
  const needle = String(alias || "").toLowerCase();
  if (!needle) {
    return Number.POSITIVE_INFINITY;
  }
  const idx = hay.indexOf(needle);
  return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
}

function maybeRewriteCommandsForCorrection(session, textInput, draftItems, commands, parseResult) {
  const textHasCorrection =
    Boolean(parseResult?.correction_intent_detected) || containsCorrectionIntent(textInput || "");
  if (!textHasCorrection) {
    return commands;
  }

  const list = Array.isArray(commands) ? commands : [];
  const adds = list.filter((c) => c && c.action === "add" && c.ingredient_key);
  const removes = list.filter((c) => c && c.action === "remove");
  if (removes.length > 0) {
    return commands;
  }
  if (adds.length === 0) {
    return commands;
  }
  if (adds.length > 2) {
    // Too ambiguous. Keep original add behavior.
    return commands;
  }

  const textLower = String(textInput || "").toLowerCase();

  let fromKey = "";
  let toCmd = adds[adds.length - 1];

  if (adds.length === 2) {
    const sorted = adds
      .map((cmd) => ({ cmd, idx: commandTextIndex(cmd, textLower) }))
      .sort((a, b) => a.idx - b.idx);
    const fromCmd = sorted[0]?.cmd || adds[0];
    toCmd = sorted[1]?.cmd || adds[1];
    fromKey = normalizeIngredientKey(fromCmd?.ingredient_key || "");
  } else {
    const lastAdded = pickLastAddedIngredientKeyFromTurns(session);
    fromKey = normalizeIngredientKey(lastAdded || "");
  }

  const toKey = normalizeIngredientKey(toCmd?.ingredient_key || "");
  if (!fromKey || !toKey || fromKey === toKey) {
    return commands;
  }

  const fromDraft = findDraftItemByKey(draftItems, fromKey);
  if (!fromDraft) {
    return commands;
  }

  const qty = Math.round(Number(fromDraft.quantity || 1) * 100) / 100;
  const unit = fromDraft.unit || toCmd?.unit || "ea";

  return [
    {
      action: "remove",
      ingredient_key: fromKey,
      ingredient_name: fromDraft.ingredient_name || fromKey,
      quantity: null,
      unit,
      remove_all: true,
      source: "chat_text",
      confidence: "high",
      matched_alias: fromKey,
      match_type: "correction"
    },
    {
      ...toCmd,
      action: "add",
      ingredient_key: toKey,
      ingredient_name: toCmd?.ingredient_name || toKey,
      quantity: qty,
      unit,
      remove_all: false,
      source: toCmd?.source || "chat_text",
      confidence: toCmd?.confidence || "medium",
      matched_alias: toCmd?.matched_alias || toCmd?.ingredient_name || toKey,
      match_type: "correction"
    }
  ];
}

export function convertPhraseToIngredientKey(phrase) {
  const raw = String(phrase || "").trim();
  if (!raw) {
    return null;
  }
  const normalized = normalizeIngredientKey(raw);
  return normalized || null;
}

function convertReviewCandidateOptions(value) {
  const options = [];
  for (const candidate of value || []) {
    if (!candidate?.ingredient_key) {
      continue;
    }
    const ingredientKey = String(candidate.ingredient_key).trim();
    if (!ingredientKey) {
      continue;
    }
    const ingredientName = candidate.ingredient_name ? String(candidate.ingredient_name) : ingredientKey;
    const matchedAlias = candidate.matched_alias ? String(candidate.matched_alias) : null;
    const score = Math.round(Number(candidate.score || 0) * 10000) / 10000;
    options.push({
      ingredient_key: ingredientKey,
      ingredient_name: ingredientName,
      matched_alias: matchedAlias,
      score
    });
  }

  options.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return String(a.ingredient_name).localeCompare(String(b.ingredient_name));
  });
  return options;
}

export async function upsertIngredientReviewCandidates(context, userId, sessionId, turnId, reviewCandidates) {
  const candidates = Array.isArray(reviewCandidates) ? reviewCandidates : [];
  if (candidates.length === 0) {
    return { items: [], created_count: 0, updated_count: 0 };
  }

  const qKey = reviewQueueKey(userId);
  const queue = await getArray(context.env, qKey);

  const pendingIndex = new Map();
  const ignoredGlobalIndex = new Map();
  for (let i = 0; i < queue.length; i += 1) {
    const entry = queue[i];
    if (!entry) {
      continue;
    }
    const status = entry.status;
    const normalizedPhrase = entry.normalized_phrase
      ? String(entry.normalized_phrase)
      : entry.phrase
        ? normalizeReviewPhrase(entry.phrase)
        : null;

    if (status === "pending" && normalizedPhrase) {
      pendingIndex.set(normalizedPhrase, i);
    }

    // Persisted ignore: once a phrase is globally ignored, do not re-add it to the review queue.
    if (status === "ignored" && normalizedPhrase) {
      const scopeRaw = entry.ignore_scope ? String(entry.ignore_scope).trim().toLowerCase() : "global";
      const scope = scopeRaw === "session" ? "session" : "global";
      if (scope === "global") {
        ignoredGlobalIndex.set(normalizedPhrase, true);
      }
    }
  }

  const touchedById = new Map();
  let createdCount = 0;
  let updatedCount = 0;

  for (const candidate of candidates) {
    const phrase = candidate?.phrase ? String(candidate.phrase).trim() : "";
    if (!phrase) {
      continue;
    }
    const normalizedPhrase = normalizeReviewPhrase(phrase);
    if (!normalizedPhrase) {
      continue;
    }
    if (ignoredGlobalIndex.has(normalizedPhrase)) {
      continue;
    }

    const reason = candidate?.reason ? String(candidate.reason).trim() : "unknown";
    const candidateOptions = convertReviewCandidateOptions(candidate?.candidates || candidate?.candidate_options || []);
    const now = nowIso();

    if (pendingIndex.has(normalizedPhrase)) {
      const idx = pendingIndex.get(normalizedPhrase);
      const existing = queue[idx];
      existing.phrase = phrase;
      existing.reason = reason || "unknown";
      existing.updated_at = now;
      existing.last_seen_at = now;
      existing.seen_count = Number(existing.seen_count || 1) + 1;
      if (sessionId) {
        existing.session_id = sessionId;
      }
      if (turnId) {
        existing.turn_id = turnId;
      }
      if (candidateOptions.length > 0) {
        existing.candidate_options = candidateOptions;
      }
      queue[idx] = existing;
      touchedById.set(existing.id, existing);
      updatedCount += 1;
      continue;
    }

    const newEntry = {
      id: crypto.randomUUID(),
      user_id: String(userId),
      session_id: sessionId || null,
      turn_id: turnId || null,
      phrase,
      normalized_phrase: normalizedPhrase,
      reason: reason || "unknown",
      candidate_options: candidateOptions,
      seen_count: 1,
      status: "pending",
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      resolved_at: null,
      resolved_action: null,
      resolved_by_user_id: null,
      resolved_ingredient_key: null,
      resolved_display_name: null
    };

    queue.push(newEntry);
    pendingIndex.set(normalizedPhrase, queue.length - 1);
    touchedById.set(newEntry.id, newEntry);
    createdCount += 1;
  }

  await putArray(context.env, qKey, queue);

  const items = Array.from(touchedById.values()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return { items, created_count: createdCount, updated_count: updatedCount };
}

export async function buildCaptureSessionView(context, session) {
  const draftItems = Array.isArray(session?.draft_items) ? session.draft_items : [];

  let reviewQueueItems = [];
  if (session?.id && session?.user_id) {
    const qKey = reviewQueueKey(session.user_id);
    const pending = (await getArray(context.env, qKey)).filter(
      (item) => item && item.status === "pending" && item.session_id === session.id
    );
    pending.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    reviewQueueItems = pending;
  }

  return {
    session,
    summary: getDraftSummary(draftItems),
    review_queue_items: reviewQueueItems,
    review_queue_count: reviewQueueItems.length
  };
}

export async function applyCaptureSessionParsedInput(context, session, sourceType, textInput, visionDetectedItems, parseResult) {
  let commands = Array.isArray(parseResult?.commands) ? parseResult.commands : [];
  const reviewCandidatesRaw = Array.isArray(parseResult?.review_candidates) ? parseResult.review_candidates : [];
  let reviewCandidates = reviewCandidatesRaw;
  if (!parseResult?.llm_extraction_used) {
    reviewCandidates = await filterReviewCandidatesWithPhraseClassifier(
      context,
      session?.user_id ? String(session.user_id) : "demo-user",
      reviewCandidatesRaw
    );
  }

  const currentDraft = Array.isArray(session?.draft_items) ? session.draft_items : [];
  commands = maybeRewriteCommandsForCorrection(session, textInput, currentDraft, commands, parseResult);
  const nextDraft = applyConversationCommandsToDraft(currentDraft, commands);

  const turnId = crypto.randomUUID();
  const now = nowIso();
  const queuedReviewResult = await upsertIngredientReviewCandidates(
    context,
    session.user_id,
    session.id,
    turnId,
    reviewCandidates
  );
  const queuedReviewItems = queuedReviewResult.items;

  const turn = {
    id: turnId,
    source_type: sourceType || "text",
    text: textInput || null,
    vision_detected_items: Array.isArray(visionDetectedItems) ? visionDetectedItems : [],
    parsed_commands: commands,
    parsed_command_count: commands.length,
    parsed_review_candidates: reviewCandidates,
    parsed_review_candidate_count: reviewCandidates.length,
    review_queue_items: queuedReviewItems,
    review_queue_item_count: queuedReviewItems.length,
    finalize_requested: Boolean(parseResult?.finalize_requested),
    llm_extraction_used: Boolean(parseResult?.llm_extraction_used),
    llm_extraction_model: parseResult?.llm_extraction_model ? String(parseResult.llm_extraction_model) : null,
    created_at: now
  };

  const existingTurns = Array.isArray(session?.turns) ? session.turns : [];
  const nextTurns = existingTurns.concat([turn]).slice(-20);

  const existingPendingIds = Array.isArray(session?.pending_review_item_ids) ? session.pending_review_item_ids : [];
  const pendingMap = new Map();
  for (const id of existingPendingIds) {
    if (id) {
      pendingMap.set(String(id), true);
    }
  }
  for (const item of queuedReviewItems) {
    if (item?.id) {
      pendingMap.set(String(item.id), true);
    }
  }

  const updatedSession = {
    ...session,
    draft_items: nextDraft,
    turns: nextTurns,
    pending_review_item_ids: Array.from(pendingMap.keys()).sort(),
    updated_at: now
  };

  await putObject(context.env, captureSessionKey(session.id), updatedSession);

  return {
    capture: await buildCaptureSessionView(context, updatedSession),
    turn,
    review_queue_items: queuedReviewItems,
    review_queue_count: queuedReviewItems.length
  };
}

export async function resolveIngredientReviewQueueItem(context, userId, queueItemId, payload) {
  const qKey = reviewQueueKey(userId);
  const allItems = await getArray(context.env, qKey);

  const idx = allItems.findIndex((i) => i && i.id === queueItemId);
  if (idx < 0) {
    throw new Error("review queue item not found.");
  }

  const target = allItems[idx];
  if (target.status !== "pending") {
    return { item: target, alias_result: null, session_apply: null };
  }

  const now = nowIso();
  const action = String(payload?.action || "").trim().toLowerCase();
  const applyToSession = payload?.apply_to_session !== false;
  const resolvedByUserId = payload?.user_id ? String(payload.user_id).trim() : String(target.user_id || userId);

  let aliasResult = null;
  let sessionApply = null;

  if (action === "map") {
    let resolvedIngredientKey = payload?.ingredient_key ? String(payload.ingredient_key).trim() : "";
    if (!resolvedIngredientKey) {
      const opts = Array.isArray(target.candidate_options) ? target.candidate_options : [];
      if (opts.length > 0 && opts[0]?.ingredient_key) {
        resolvedIngredientKey = String(opts[0].ingredient_key).trim();
      }
    }
    if (!resolvedIngredientKey) {
      throw new Error("ingredient_key is required when action is map.");
    }

    let resolvedDisplayName = payload?.display_name ? String(payload.display_name).trim() : "";
    if (!resolvedDisplayName) {
      const opts = Array.isArray(target.candidate_options) ? target.candidate_options : [];
      const match = opts.find((o) => o && o.ingredient_key === resolvedIngredientKey);
      if (match?.ingredient_name) {
        resolvedDisplayName = String(match.ingredient_name).trim();
      }
    }
    if (!resolvedDisplayName) {
      resolvedDisplayName = resolvedIngredientKey;
    }

    aliasResult = await addIngredientAliasOverride(
      context,
      userId,
      resolvedIngredientKey,
      target.phrase,
      resolvedDisplayName
    );

    if (applyToSession && target.session_id) {
      const session = await getObject(context.env, captureSessionKey(target.session_id));
      if (session && session.status === "open") {
        const draftItems = Array.isArray(session.draft_items) ? session.draft_items : [];
        const addCommand = {
          action: "add",
          ingredient_key: aliasResult.ingredient_key,
          ingredient_name: aliasResult.display_name,
          quantity: 1.0,
          unit: "ea",
          remove_all: false,
          source: "chat_text",
          confidence: "medium",
          matched_alias: target.phrase,
          match_type: "manual_confirmation"
        };
        const nextDraft = applyConversationCommandsToDraft(draftItems, [addCommand]);
        const nextSession = { ...session, draft_items: nextDraft, updated_at: now };
        await putObject(context.env, captureSessionKey(session.id), nextSession);
        sessionApply = { applied: true, session_id: session.id, draft_item_count: nextDraft.length };
      } else if (session) {
        sessionApply = { applied: false, reason: "session_not_open", session_id: String(target.session_id) };
      }
    }

    target.status = "mapped";
    target.resolved_action = "map";
    target.resolved_ingredient_key = aliasResult.ingredient_key;
    target.resolved_display_name = aliasResult.display_name;
  } else if (action === "ignore") {
    target.status = "ignored";
    target.resolved_action = "ignore";
    target.ignore_scope = applyToSession ? "session" : "global";
  } else {
    throw new Error("action must be one of: map, ignore.");
  }

  target.updated_at = now;
  target.resolved_at = now;
  target.resolved_by_user_id = resolvedByUserId;

  allItems[idx] = target;
  await putArray(context.env, qKey, allItems);

  return { item: target, alias_result: aliasResult, session_apply: sessionApply };
}

export async function autoMapPendingUnknownReviewItemsToSessionDraft(context, session, resolvedByUserId) {
  const sessionId = session?.id ? String(session.id) : "";
  const sessionUserId = session?.user_id ? String(session.user_id) : "";

  if (!sessionId || !sessionUserId) {
    return { mapped_count: 0, skipped_count: 0, mapped_item_ids: [] };
  }

  const qKey = reviewQueueKey(sessionUserId);
  const pendingItems = (await getArray(context.env, qKey)).filter(
    (i) => i && i.status === "pending" && i.session_id === sessionId
  );

  if (pendingItems.length === 0) {
    return { mapped_count: 0, skipped_count: 0, mapped_item_ids: [] };
  }

  let mappedCount = 0;
  let skippedCount = 0;
  const mappedItemIds = [];

  for (const item of pendingItems) {
    const reason = item?.reason ? String(item.reason).trim().toLowerCase() : "unknown";
    const candidateCount = Array.isArray(item?.candidate_options) ? item.candidate_options.length : 0;
    if (reason !== "unknown" || candidateCount > 0) {
      skippedCount += 1;
      continue;
    }

    const phrase = item?.phrase ? String(item.phrase) : "";
    if (!phrase) {
      skippedCount += 1;
      continue;
    }

    const autoKey = convertPhraseToIngredientKey(phrase);
    if (!autoKey) {
      skippedCount += 1;
      continue;
    }

    try {
      const resolved = await resolveIngredientReviewQueueItem(context, sessionUserId, item.id, {
        action: "map",
        ingredient_key: autoKey,
        display_name: phrase,
        user_id: resolvedByUserId || sessionUserId,
        apply_to_session: true
      });
      if (resolved?.item?.status === "mapped") {
        mappedCount += 1;
        mappedItemIds.push(resolved.item.id);
      } else {
        skippedCount += 1;
      }
    } catch {
      skippedCount += 1;
    }
  }

  return { mapped_count: mappedCount, skipped_count: skippedCount, mapped_item_ids: mappedItemIds };
}
