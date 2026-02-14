import { chatLlmExtractorCacheKey, getObject, putObject } from "./store.js";
import {
  clampNumber,
  nowIso,
  normalizeReviewPhraseValue,
  normalizeIngredientKey,
  normalizeWhitespace,
  normalizeWord,
  safeString
} from "./util.js";

function resolveExtractorConfig(env) {
  const enabledRaw = safeString(env?.OPENAI_ENABLE_CHAT_LLM_EXTRACTOR, "").toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";

  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_TEXT_EXTRACTOR_MODEL, "gpt-4.1-mini");
  const maxItems = clampNumber(env?.OPENAI_TEXT_EXTRACTOR_MAX_ITEMS, 14, 1, 40);
  const cacheDays = clampNumber(env?.OPENAI_TEXT_EXTRACTOR_CACHE_DAYS, 30, 1, 365);
  const maxTextChars = clampNumber(env?.OPENAI_TEXT_EXTRACTOR_MAX_CHARS, 800, 80, 4000);

  return { enabled, apiKey, baseUrl, model, maxItems, cacheDays, maxTextChars };
}

function normalizeCacheText(value, maxChars) {
  const raw = normalizeWhitespace(String(value || ""));
  if (!raw) {
    return "";
  }
  if (raw.length <= maxChars) {
    return raw;
  }
  return raw.slice(0, maxChars);
}

async function sha256Base64Url(value) {
  const enc = new TextEncoder();
  const bytes = enc.encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let bin = "";
  for (const b of arr) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isCacheEntryFresh(entry, cacheDays) {
  if (!entry?.updated_at) {
    return false;
  }
  const updated = Date.parse(String(entry.updated_at));
  if (!Number.isFinite(updated)) {
    return false;
  }
  const ageMs = Date.now() - updated;
  return ageMs >= 0 && ageMs <= cacheDays * 24 * 60 * 60 * 1000;
}

async function loadExtractorCache(context, userId) {
  const key = chatLlmExtractorCacheKey(userId);
  const existing = await getObject(context.env, key);
  const items = existing?.items && typeof existing.items === "object" ? existing.items : {};
  return {
    version: existing?.version ? String(existing.version) : "v1",
    items
  };
}

async function saveExtractorCache(context, userId, cache) {
  const key = chatLlmExtractorCacheKey(userId);
  await putObject(context.env, key, {
    version: cache?.version ? String(cache.version) : "v1",
    updated_at: nowIso(),
    items: cache?.items && typeof cache.items === "object" ? cache.items : {}
  });
}

function trimCacheItems(itemsObj, maxEntries = 200) {
  const keys = Object.keys(itemsObj || {});
  if (keys.length <= maxEntries) {
    return itemsObj;
  }

  const entries = keys
    .map((k) => ({ key: k, updated_at: itemsObj[k]?.updated_at ? String(itemsObj[k].updated_at) : "" }))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  const keep = new Set(entries.slice(0, maxEntries).map((e) => e.key));
  const trimmed = {};
  for (const k of keys) {
    if (keep.has(k)) {
      trimmed[k] = itemsObj[k];
    }
  }
  return trimmed;
}

async function extractItemsWithOpenAI(context, text, cfg) {
  const { apiKey, baseUrl, model, maxItems } = cfg;
  if (!apiKey) {
    return { ok: false, error: "missing_api_key", items: [], model };
  }

  const prompt = [
    "You extract food items for a fridge inventory app.",
    "Input is a user message that may include spatial/order words (left/right/top/bottom/next/first/slot),",
    "and filler verbs (have/exists/put).",
    "",
    "Task:",
    "- Extract ONLY food items (ingredients, packaged foods, or prepared dishes) that the user says are in the fridge,",
    "  or is putting into the fridge.",
    "",
    "Rules:",
    "- Do NOT include spatial/order/filler words.",
    "- Do NOT include verbs or non-food words.",
    "- Keep names in the original language (Korean/English). Do not translate.",
    "- Remove particles/endings from names (e.g. Korean: 은/는/이/가/을/를/에/에서/랑/이랑/하고).",
    "- Deduplicate items (include each item once).",
    "- If quantity is explicitly mentioned, include it; otherwise quantity=1 and unit=\"ea\".",
    `- Return at most ${maxItems} items.`,
    "",
    "Return ONLY JSON: {\"items\":[{\"name\":\"...\",\"quantity\":1,\"unit\":\"ea\"}]}"
  ].join("\n");

  const payload = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: prompt },
      { role: "user", content: JSON.stringify({ text }) }
    ],
    response_format: { type: "json_object" }
  };

  const url = `${baseUrl.replace(/\/+$/g, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errMsg = parsed?.error?.message || parsed?.message || `Extractor request failed: ${res.status}`;
    return { ok: false, error: errMsg, items: [], model };
  }

  const content = parsed?.choices?.[0]?.message?.content ?? "";
  let obj = null;
  try {
    obj = content ? JSON.parse(content) : null;
  } catch {
    obj = null;
  }

  const items = Array.isArray(obj?.items) ? obj.items : [];
  return { ok: true, error: null, items, model };
}

function normalizeLlmItemName(value) {
  const normalized = normalizeReviewPhraseValue(value);
  return normalized || "";
}

function coerceQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 1.0;
  }
  return Math.round(n * 100) / 100;
}

function coerceUnit(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "ea";
  }
  if (raw.length > 12) {
    return "ea";
  }
  return raw;
}

export async function augmentParseResultWithChatLlmExtraction(context, userId, textInput, aliasLookup, parseResult) {
  const cfg = resolveExtractorConfig(context.env);
  if (!cfg.enabled) {
    return parseResult;
  }

  const text = normalizeCacheText(textInput, cfg.maxTextChars);
  if (!text) {
    return parseResult;
  }

  // Avoid accidental "add" commands on remove-style messages.
  if (parseResult?.remove_intent_detected) {
    return parseResult;
  }

  const cacheKey = await sha256Base64Url(text);
  const cache = await loadExtractorCache(context, userId);
  const cacheItems = cache.items;

  let extraction = cacheItems[cacheKey];
  if (!extraction || !isCacheEntryFresh(extraction, cfg.cacheDays) || !Array.isArray(extraction.items)) {
    const res = await extractItemsWithOpenAI(context, text, cfg);
    if (!res.ok) {
      // If the extractor fails (rate limit, network, etc.), fall back to rule-based behavior.
      return parseResult;
    }

    extraction = {
      updated_at: nowIso(),
      model: res.model,
      source: "openai",
      items: Array.isArray(res.items) ? res.items : []
    };

    cacheItems[cacheKey] = extraction;
    cache.items = trimCacheItems(cacheItems, 200);
    await saveExtractorCache(context, userId, cache);
  }

  const extractedRaw = Array.isArray(extraction?.items) ? extraction.items : [];
  const dedupByNameKey = new Map();
  for (const item of extractedRaw) {
    const rawName = item?.name ? String(item.name).trim() : "";
    if (!rawName) {
      continue;
    }
    const normalizedName = normalizeLlmItemName(rawName);
    if (!normalizedName || normalizedName.length < 2) {
      continue;
    }

    const nameKey = normalizeWord(normalizedName);
    if (!nameKey) {
      continue;
    }
    if (dedupByNameKey.has(nameKey)) {
      continue;
    }

    dedupByNameKey.set(nameKey, {
      name: normalizedName,
      quantity: coerceQuantity(item?.quantity),
      unit: coerceUnit(item?.unit)
    });
  }

  const extracted = Array.from(dedupByNameKey.values()).slice(0, cfg.maxItems);
  const commands = Array.isArray(parseResult?.commands) ? Array.from(parseResult.commands) : [];

  const existingKeySet = new Set(commands.map((c) => normalizeWord(c?.ingredient_key || "")));

  for (const item of extracted) {
    const normalizedAliasKey = normalizeWord(item.name);
    const mention = normalizedAliasKey && aliasLookup ? aliasLookup.get(normalizedAliasKey) : null;
    if (mention?.ingredient_key) {
      const key = normalizeWord(mention.ingredient_key);
      if (!key || existingKeySet.has(key)) {
        continue;
      }
      existingKeySet.add(key);
      commands.push({
        action: "add",
        ingredient_key: mention.ingredient_key,
        ingredient_name: mention.ingredient_name || mention.ingredient_key,
        quantity: item.quantity,
        unit: item.unit,
        remove_all: false,
        source: "chat_llm",
        confidence: "medium",
        matched_alias: mention.matched_alias || item.name,
        match_type: "llm"
      });
      continue;
    }

    const fallbackKeyRaw = normalizeIngredientKey(item.name);
    const fallbackKey = String(fallbackKeyRaw || "").trim();
    const key = normalizeWord(fallbackKey);
    if (!key || existingKeySet.has(key)) {
      continue;
    }
    existingKeySet.add(key);
    commands.push({
      action: "add",
      ingredient_key: fallbackKey,
      ingredient_name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      remove_all: false,
      source: "chat_llm",
      confidence: "low",
      matched_alias: item.name,
      match_type: "llm_fallback"
    });
  }

  return {
    ...parseResult,
    commands,
    review_candidates: [],
    llm_extraction_used: true,
    llm_extraction_model: extraction?.model ? String(extraction.model) : cfg.model
  };
}
