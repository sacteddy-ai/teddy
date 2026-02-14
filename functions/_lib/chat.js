import {
  nowIso,
  normalizeWhitespace,
  normalizeWord,
  removeKoreanParticleSuffix,
  getDefaultStopwordMap,
  isLikelySpatialOrOrdinalToken,
  normalizeReviewPhraseValue,
  normalizeIngredientKey
} from "./util.js";

function containsFinalizeIntent(text) {
  const normalized = normalizeWord(text);
  if (!normalized) {
    return false;
  }
  return /(finish|done|finalize|완료|끝|마무리|확정)/i.test(normalized);
}

function containsRemoveIntent(normalizedClause) {
  const patterns = [
    /(?<![\p{L}\p{N}_])remove(?![\p{L}\p{N}_])/iu,
    /(?<![\p{L}\p{N}_])delete(?![\p{L}\p{N}_])/iu,
    /(?<![\p{L}\p{N}_])제거(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])없애(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])버려(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])소진(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])먹었(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])다\s*먹(?![\p{L}\p{N}_])/u,
    /(?<![\p{L}\p{N}_])빼(?=\s|$|[^\p{L}\p{N}_]|\uC918|\uC8FC|\uC790)/iu
  ];

  for (const re of patterns) {
    if (re.test(normalizedClause)) {
      return true;
    }
  }
  return false;
}

function convertNumberWordToDouble(text) {
  const t = String(text || "").trim().toLowerCase();
  const map = new Map([
    ["one", 1],
    ["two", 2],
    ["three", 3],
    ["four", 4],
    ["five", 5],
    ["한", 1],
    ["하나", 1],
    ["두", 2],
    ["둘", 2],
    ["세", 3],
    ["셋", 3],
    ["네", 4],
    ["넷", 4],
    ["다섯", 5]
  ]);
  return map.get(t) || 0;
}

function parseQuantityFromClause(clause) {
  const unitPattern = "(?<unit>ea|pcs?|piece|pieces|g|kg|ml|l|개|봉|팩|장|병|캔)";

  const numberRe = new RegExp(`(?<qty>\\d+(?:\\.\\d+)?)\\s*${unitPattern}?`, "iu");
  const m = numberRe.exec(clause);
  if (m?.groups?.qty) {
    const qty = Number(m.groups.qty);
    if (Number.isFinite(qty) && qty > 0) {
      return {
        quantity: qty,
        unit: (m.groups.unit || "ea").toLowerCase(),
        explicit: true
      };
    }
  }

  const wordRe = new RegExp(
    `(?<qtyword>one|two|three|four|five|한|하나|두|둘|세|셋|네|넷|다섯)\\s*${unitPattern}?`,
    "iu"
  );
  const wm = wordRe.exec(clause);
  if (wm?.groups?.qtyword) {
    const qty = convertNumberWordToDouble(wm.groups.qtyword);
    if (qty > 0) {
      return {
        quantity: qty,
        unit: (wm.groups.unit || "ea").toLowerCase(),
        explicit: true
      };
    }
  }

  return { quantity: 1.0, unit: "ea", explicit: false };
}

function tokenizeClause(clause) {
  const parts = String(clause || "")
    .split(/[^\p{L}\p{N}_]+/gu)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  const stopwordMap = getDefaultStopwordMap();
  const tokens = [];
  for (const raw of parts) {
    let token = normalizeWord(raw);
    if (!token) {
      continue;
    }

    token = removeKoreanParticleSuffix(token);
    token = normalizeWhitespace(token);
    if (!token) {
      continue;
    }

    if (stopwordMap.has(token)) {
      continue;
    }
    if (/^\d+$/.test(token)) {
      continue;
    }
    if (isLikelySpatialOrOrdinalToken(token)) {
      continue;
    }

    tokens.push(token);
  }

  return tokens;
}

function stripAmbiguousTrailingParticleIfKnownAlias(token, aliasLookup) {
  if (!aliasLookup || !token) {
    return token;
  }

  const ambiguous = ["도", "만", "고"];
  for (const suffix of ambiguous) {
    if (!token.endsWith(suffix) || token.length <= suffix.length) {
      continue;
    }
    const base = token.slice(0, -suffix.length);
    if (!base) {
      continue;
    }
    if (aliasLookup.has(base)) {
      return base;
    }
  }

  return token;
}

function extractMentionsFromTokens(tokens, aliasLookup) {
  const matches = [];
  const count = tokens.length;

  for (let i = 0; i < count; i += 1) {
    for (let n = 1; n <= 3; n += 1) {
      if (i + n > count) {
        break;
      }

      const phrase = normalizeWhitespace(tokens.slice(i, i + n).join(" "));
      if (!phrase || phrase.length < 2) {
        continue;
      }

      const mention = aliasLookup.get(phrase);
      if (!mention) {
        continue;
      }

      matches.push({
        start: i,
        end: i + n,
        phrase,
        mention
      });
    }
  }

  matches.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) {
      return lenB - lenA;
    }
    return a.start - b.start;
  });

  const used = new Array(count).fill(false);
  const selected = [];
  const seenIngredientKey = new Set();

  for (const m of matches) {
    let overlap = false;
    for (let i = m.start; i < m.end; i += 1) {
      if (used[i]) {
        overlap = true;
        break;
      }
    }
    if (overlap) {
      continue;
    }

    const key = normalizeIngredientKey(m.mention.ingredient_key);
    if (seenIngredientKey.has(key)) {
      continue;
    }
    seenIngredientKey.add(key);

    for (let i = m.start; i < m.end; i += 1) {
      used[i] = true;
    }

    selected.push(m);
  }

  return { selected, used };
}

export function applyConversationCommandsToDraft(draftItems, commands) {
  const map = new Map();

  for (const item of draftItems || []) {
    const key = normalizeWord(item?.ingredient_key || "");
    if (!key) {
      continue;
    }
    map.set(key, {
      ingredient_key: item.ingredient_key,
      ingredient_name: item.ingredient_name,
      quantity: Number(item.quantity || 0),
      unit: item.unit || "ea",
      source: item.source || "chat_text",
      confidence: item.confidence || "medium",
      updated_at: item.updated_at || nowIso()
    });
  }

  for (const command of commands || []) {
    const key = normalizeWord(command?.ingredient_key || "");
    if (!key) {
      continue;
    }

    const qty = command.quantity === null || command.quantity === undefined ? 1.0 : Number(command.quantity);
    const unit = command.unit || "ea";

    if (command.action === "add") {
      if (!map.has(key)) {
        map.set(key, {
          ingredient_key: command.ingredient_key,
          ingredient_name: command.ingredient_name || command.ingredient_key,
          quantity: 0,
          unit,
          source: command.source || "chat_text",
          confidence: command.confidence || "medium",
          updated_at: nowIso()
        });
      }
      const entry = map.get(key);
      entry.quantity = Math.round((Number(entry.quantity || 0) + qty) * 100) / 100;
      entry.updated_at = nowIso();
      continue;
    }

    if (command.action === "remove" && map.has(key)) {
      if (command.remove_all) {
        map.delete(key);
        continue;
      }
      const entry = map.get(key);
      entry.quantity = Math.round((Number(entry.quantity || 0) - qty) * 100) / 100;
      if (entry.quantity <= 0) {
        map.delete(key);
      } else {
        entry.updated_at = nowIso();
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => String(a.ingredient_name).localeCompare(String(b.ingredient_name)));
}

export function getDraftSummary(draftItems) {
  const items = draftItems || [];
  let sum = 0;
  for (const item of items) {
    sum += Number(item?.quantity || 0);
  }
  return {
    item_count: items.length,
    total_quantity: Math.round(sum * 100) / 100
  };
}

export function parseConversationCommands(text, visionDetectedItems, aliasLookup) {
  const commands = [];
  const reviewCandidatesMap = new Map();
  const finalizeRequested = containsFinalizeIntent(text || "");

  if (text && String(text).trim()) {
    const clauses = String(text)
      .split(/[\r\n\.\,\!\?\~]+/g)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    for (const clause of clauses) {
      const normalizedClause = normalizeWord(clause);
      if (!normalizedClause) {
        continue;
      }

      const isRemove = containsRemoveIntent(normalizedClause);
      const qtyInfo = parseQuantityFromClause(normalizedClause);
      const tokens = tokenizeClause(normalizedClause).map((t) => stripAmbiguousTrailingParticleIfKnownAlias(t, aliasLookup));

      const { selected, used } = extractMentionsFromTokens(tokens, aliasLookup);
      for (const m of selected) {
        const mention = m.mention;
        commands.push({
          action: isRemove ? "remove" : "add",
          ingredient_key: mention.ingredient_key,
          ingredient_name: mention.ingredient_name,
          quantity: isRemove && !qtyInfo.explicit ? null : qtyInfo.quantity,
          unit: qtyInfo.unit,
          remove_all: Boolean(isRemove && !qtyInfo.explicit),
          source: "chat_text",
          confidence: "high",
          matched_alias: mention.matched_alias || m.phrase,
          match_type: "exact"
        });
      }

      for (let i = 0; i < tokens.length; i += 1) {
        if (used[i]) {
          continue;
        }
        const phrase = normalizeReviewPhraseValue(tokens[i]);
        if (!phrase || phrase.length < 2) {
          continue;
        }
        const key = normalizeWord(phrase);
        if (!reviewCandidatesMap.has(key)) {
          reviewCandidatesMap.set(key, {
            phrase,
            reason: "unknown",
            candidates: []
          });
        }
      }
    }
  }

  for (const visionItem of visionDetectedItems || []) {
    const raw = String(visionItem || "").trim();
    if (!raw) {
      continue;
    }
    const normalized = normalizeReviewPhraseValue(raw);
    if (!normalized) {
      continue;
    }
    const mention = aliasLookup.get(normalizeWord(normalized));
    if (mention) {
      commands.push({
        action: "add",
        ingredient_key: mention.ingredient_key,
        ingredient_name: mention.ingredient_name,
        quantity: 1.0,
        unit: "ea",
        remove_all: false,
        source: "vision",
        confidence: "medium",
        matched_alias: mention.matched_alias || normalized,
        match_type: "exact"
      });
    } else {
      commands.push({
        action: "add",
        ingredient_key: normalizeIngredientKey(normalized),
        ingredient_name: normalized,
        quantity: 1.0,
        unit: "ea",
        remove_all: false,
        source: "vision",
        confidence: "low",
        matched_alias: raw,
        match_type: "fallback"
      });
    }
  }

  return {
    commands,
    review_candidates: Array.from(reviewCandidatesMap.values()).sort((a, b) => String(a.phrase).localeCompare(String(b.phrase))),
    finalize_requested: finalizeRequested
  };
}
