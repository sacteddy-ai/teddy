import { clampNumber, nowIso, normalizeWhitespace, normalizeWord, safeString } from "./util.js";
import { getObject, phraseClassifierCacheKey, putObject } from "./store.js";

function resolveClassifierConfig(env) {
  const enabledRaw = safeString(env?.OPENAI_ENABLE_REVIEW_PHRASE_CLASSIFIER, "").toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";

  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_TEXT_CLASSIFIER_MODEL, "gpt-4.1-mini");
  const maxItems = clampNumber(env?.OPENAI_TEXT_CLASSIFIER_MAX_ITEMS, 12, 1, 30);
  const cacheDays = clampNumber(env?.OPENAI_TEXT_CLASSIFIER_CACHE_DAYS, 30, 1, 365);

  return { enabled, apiKey, baseUrl, model, maxItems, cacheDays };
}

function normalizePhraseKey(value) {
  return normalizeWhitespace(normalizeWord(value));
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

async function loadClassifierCache(context, userId) {
  const key = phraseClassifierCacheKey(userId);
  const existing = await getObject(context.env, key);
  const items = existing?.items && typeof existing.items === "object" ? existing.items : {};
  return {
    version: existing?.version ? String(existing.version) : "v1",
    items
  };
}

async function saveClassifierCache(context, userId, cache) {
  const key = phraseClassifierCacheKey(userId);
  await putObject(context.env, key, {
    version: cache?.version ? String(cache.version) : "v1",
    updated_at: nowIso(),
    items: cache?.items && typeof cache.items === "object" ? cache.items : {}
  });
}

async function classifyPhrasesWithOpenAI(context, phrases, cfg) {
  const { apiKey, baseUrl, model } = cfg;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for review phrase classification.");
  }

  const prompt = [
    "You are a classifier for a fridge inventory app.",
    "Given short phrases extracted from user speech/text, classify each phrase into exactly one category:",
    "- spatial: location/order/filler words (left/right/top/bottom/next/first/slot/etc), NOT a food item.",
    "- food_item: an ingredient OR a prepared dish that could be stored in a fridge.",
    "- other: not spatial but also not a food item (e.g. greetings, random words).",
    "Rules:",
    "- Be conservative: only label 'spatial' when it is clearly spatial/order/filler.",
    "- If uncertain between food_item and spatial, choose food_item.",
    "- Do not translate phrases. Keep them verbatim.",
    "Return ONLY JSON: {\"results\":[{\"phrase\":\"...\",\"category\":\"spatial|food_item|other\"}]}."
  ].join("\n");

  const payload = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: prompt },
      { role: "user", content: JSON.stringify({ phrases }) }
    ],
    response_format: { type: "json_object" }
  };

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errMsg = parsed?.error?.message || parsed?.message || `Classifier request failed: ${res.status}`;
    throw new Error(errMsg);
  }

  const content = parsed?.choices?.[0]?.message?.content ?? "";
  let obj = null;
  try {
    obj = content ? JSON.parse(content) : null;
  } catch {
    obj = null;
  }

  const results = Array.isArray(obj?.results) ? obj.results : [];
  const map = new Map();
  for (const r of results) {
    const phrase = r?.phrase ? String(r.phrase) : "";
    const category = r?.category ? String(r.category).trim().toLowerCase() : "";
    const key = normalizePhraseKey(phrase);
    if (!key) {
      continue;
    }
    if (!["spatial", "food_item", "other"].includes(category)) {
      continue;
    }
    map.set(key, category);
  }

  return { categoryByPhraseKey: map, model };
}

export async function filterReviewCandidatesWithPhraseClassifier(context, userId, reviewCandidates) {
  const cfg = resolveClassifierConfig(context.env);
  if (!cfg.enabled) {
    return reviewCandidates;
  }

  const candidates = Array.isArray(reviewCandidates) ? reviewCandidates : [];
  if (candidates.length === 0) {
    return candidates;
  }

  const cache = await loadClassifierCache(context, userId);
  const cacheItems = cache.items;
  const metaByKey = new Map();
  for (const cand of candidates) {
    const phrase = cand?.phrase ? String(cand.phrase).trim() : "";
    if (!phrase) {
      continue;
    }
    const key = normalizePhraseKey(phrase);
    if (!key) {
      continue;
    }
    if (!metaByKey.has(key)) {
      metaByKey.set(key, { phrase, key });
    }
  }

  const keepKeys = new Set();
  const discardKeys = new Set();
  const toClassifyKeys = [];

  for (const [key, meta] of metaByKey.entries()) {
    const cached = cacheItems[key];
    if (cached && isCacheEntryFresh(cached, cfg.cacheDays) && typeof cached.category === "string") {
      const category = String(cached.category).trim().toLowerCase();
      if (category === "spatial") {
        discardKeys.add(key);
      } else {
        keepKeys.add(key);
      }
      continue;
    }
    toClassifyKeys.push(meta);
  }

  if (toClassifyKeys.length === 0) {
    return candidates.filter((cand) => {
      const phrase = cand?.phrase ? String(cand.phrase).trim() : "";
      const key = normalizePhraseKey(phrase);
      return key && keepKeys.has(key);
    });
  }

  // Limit spend and latency: overflow keys default to "keep" to avoid false discards.
  const classifyBatch = toClassifyKeys.slice(0, cfg.maxItems);
  const overflow = toClassifyKeys.slice(cfg.maxItems);
  for (const meta of overflow) {
    keepKeys.add(meta.key);
  }

  try {
    const phrases = classifyBatch.map((m) => m.phrase);
    const { categoryByPhraseKey, model } = await classifyPhrasesWithOpenAI(context, phrases, cfg);

    const now = nowIso();
    for (const meta of classifyBatch) {
      const category = categoryByPhraseKey.get(meta.key) || "food_item";
      cacheItems[meta.key] = {
        category,
        model,
        updated_at: now,
        source: "openai"
      };

      if (category === "spatial") {
        discardKeys.add(meta.key);
      } else {
        keepKeys.add(meta.key);
      }
    }

    await saveClassifierCache(context, userId, cache);
  } catch {
    // If the classifier fails (rate limit, network, etc.), fall back to the rule-based behavior.
    return candidates;
  }

  return candidates.filter((cand) => {
    const phrase = cand?.phrase ? String(cand.phrase).trim() : "";
    const key = normalizePhraseKey(phrase);
    if (!key) {
      return false;
    }
    if (discardKeys.has(key)) {
      return false;
    }
    return keepKeys.has(key);
  });
}
