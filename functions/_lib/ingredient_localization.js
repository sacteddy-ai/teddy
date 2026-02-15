import { addIngredientAliasOverride, getIngredientCatalogEntries } from "./catalog.js";
import { normalizeIngredientKey, safeString } from "./util.js";

function hasHangul(value) {
  return /[\uAC00-\uD7A3]/.test(String(value || ""));
}

function entryHasKoreanAlias(entry) {
  if (!entry) {
    return false;
  }
  const display = safeString(entry.display_name, "");
  if (display && hasHangul(display)) {
    return true;
  }
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  return aliases.some((a) => a && hasHangul(String(a)));
}

function resolveOpenAiI18nConfig(env) {
  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_I18N_MODEL, "gpt-4.1-mini");
  return { apiKey, baseUrl, model };
}

async function translateIngredientNamesToKorean(context, items) {
  const cfg = resolveOpenAiI18nConfig(context.env);
  if (!cfg.apiKey) {
    return { ok: false, error: "missing_api_key", items: [] };
  }

  const input = Array.isArray(items) ? items : [];
  if (input.length === 0) {
    return { ok: true, error: null, items: [] };
  }

  const prompt = [
    "Translate food ingredient names into natural Korean for a fridge inventory app.",
    "",
    "Rules:",
    "- Keep names short (ingredient/dish name only).",
    "- Do not add brands or extra descriptors.",
    "- Do not add Korean particles/endings (은/는/이/가/을/를/에/에서/랑/이랑/하고).",
    "- If the input is already Korean, return it as-is.",
    "",
    "Return ONLY JSON: {\"items\":[{\"ingredient_key\":\"...\",\"ko\":\"...\"}]}."
  ].join("\n");

  const payload = {
    model: cfg.model,
    temperature: 0,
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: prompt },
      { role: "user", content: JSON.stringify({ items: input }) }
    ],
    response_format: { type: "json_object" }
  };

  let res = null;
  let rawText = "";
  try {
    const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    rawText = await res.text();
  } catch (err) {
    return { ok: false, error: err?.message || String(err), items: [] };
  }

  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errMsg = parsed?.error?.message || parsed?.message || `i18n request failed: ${res.status}`;
    return { ok: false, error: errMsg, items: [] };
  }

  const content = parsed?.choices?.[0]?.message?.content ?? "";
  let obj = null;
  try {
    obj = content ? JSON.parse(content) : null;
  } catch {
    obj = null;
  }

  const out = Array.isArray(obj?.items) ? obj.items : [];
  const normalized = [];
  const seen = new Set();
  for (const row of out) {
    const key = normalizeIngredientKey(row?.ingredient_key ? String(row.ingredient_key) : "");
    const ko = safeString(row?.ko, "").trim();
    if (!key || !ko) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ ingredient_key: key, ko });
  }

  return { ok: true, error: null, items: normalized };
}

export async function ensureCatalogLocalizationForCommands(context, userId, commands, uiLang) {
  const lang = safeString(uiLang, "").toLowerCase();
  if (lang !== "ko") {
    return { updated_count: 0, translated_count: 0 };
  }

  const list = Array.isArray(commands) ? commands : [];
  if (list.length === 0) {
    return { updated_count: 0, translated_count: 0 };
  }

  const entries = await getIngredientCatalogEntries(context, userId);
  const byKey = new Map();
  for (const entry of entries) {
    const key = normalizeIngredientKey(entry?.ingredient_key ? String(entry.ingredient_key) : "");
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, entry);
  }

  const directAdds = new Map(); // key -> { display_name, alias }
  const needsTranslation = new Map(); // key -> { display_name, name_en }

  for (const cmd of list) {
    if (!cmd?.ingredient_key) {
      continue;
    }
    const key = normalizeIngredientKey(String(cmd.ingredient_key));
    if (!key) {
      continue;
    }

    const entry = byKey.get(key) || null;
    if (entryHasKoreanAlias(entry)) {
      continue;
    }

    const displayName = safeString(entry?.display_name, safeString(cmd?.ingredient_name, key)).trim() || key;
    const rawName = safeString(cmd?.ingredient_name, "").trim();
    if (rawName && hasHangul(rawName)) {
      if (!directAdds.has(key)) {
        directAdds.set(key, { display_name: displayName, alias: rawName });
      }
      continue;
    }

    if (!needsTranslation.has(key)) {
      const nameEn = rawName || displayName || key;
      needsTranslation.set(key, { display_name: displayName, name_en: nameEn });
    }
  }

  let updatedCount = 0;
  let translatedCount = 0;

  for (const [key, row] of directAdds.entries()) {
    try {
      await addIngredientAliasOverride(context, userId, key, row.alias, row.display_name);
      updatedCount += 1;
    } catch {
      // Best-effort only.
    }
  }

  const translationInput = Array.from(needsTranslation.entries()).map(([key, row]) => ({
    ingredient_key: key,
    name: row.name_en
  }));

  if (translationInput.length > 0) {
    const translationRes = await translateIngredientNamesToKorean(context, translationInput);
    if (translationRes.ok) {
      const koByKey = new Map();
      for (const row of translationRes.items) {
        koByKey.set(row.ingredient_key, row.ko);
      }

      for (const [key, row] of needsTranslation.entries()) {
        const ko = safeString(koByKey.get(key), "").trim();
        if (!ko || !hasHangul(ko)) {
          continue;
        }
        try {
          await addIngredientAliasOverride(context, userId, key, ko, row.display_name);
          updatedCount += 1;
          translatedCount += 1;
        } catch {
          // Best-effort only.
        }
      }
    }
  }

  return { updated_count: updatedCount, translated_count: translatedCount };
}
