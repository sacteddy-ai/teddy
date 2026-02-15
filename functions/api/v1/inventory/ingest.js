import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { buildAliasLookup } from "../../../_lib/catalog.js";
import { ensureCatalogLocalizationForCommands } from "../../../_lib/ingredient_localization.js";
import { consumeInventoryByIngredientKey, upsertInventoryItemRecordByIngredientKey } from "../../../_lib/inventory.js";
import { clampNumber, normalizeIngredientKey, normalizeWhitespace, normalizeWord, safeString, todayEpochDay, epochDayToIso } from "../../../_lib/util.js";

function resolveAgentConfig(env) {
  const enabledRaw = safeString(env?.OPENAI_ENABLE_INVENTORY_AGENT, "").toLowerCase();
  const enabled = enabledRaw === "" || enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes" || enabledRaw === "on";

  const apiKey = safeString(env?.OPENAI_API_KEY, "");
  const baseUrl = safeString(env?.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const model = safeString(env?.OPENAI_INVENTORY_AGENT_MODEL, "gpt-4.1-mini");
  const maxItems = clampNumber(env?.OPENAI_INVENTORY_AGENT_MAX_ITEMS, 16, 1, 40);
  const maxChars = clampNumber(env?.OPENAI_INVENTORY_AGENT_MAX_CHARS, 800, 80, 4000);

  return { enabled, apiKey, baseUrl, model, maxItems, maxChars };
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

function coerceQuantity(value) {
  if (value === null || value === undefined) {
    return 1.0;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 1.0;
  }
  return Math.round(n * 100) / 100;
}

function normalizeName(value) {
  const raw = normalizeWhitespace(String(value || ""));
  if (!raw) {
    return "";
  }
  // Keep Korean/English as-is; just trim stray punctuation/spaces.
  return raw.replace(/[^\p{L}\p{N}\s_]+/gu, " ").replace(/\s+/g, " ").trim();
}

function hasHangul(value) {
  return /[\uAC00-\uD7A3]/.test(String(value || ""));
}

function normalizeAction(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  if (raw === "add" || raw === "put" || raw === "store" || raw === "buy") {
    return "add";
  }
  if (raw === "consume" || raw === "remove" || raw === "eat" || raw === "use" || raw === "discard" || raw === "delete") {
    return "consume";
  }
  return raw;
}

async function extractInventoryCommandsWithOpenAI(context, text, uiLang, cfg) {
  if (!cfg.apiKey) {
    throw new Error("OPENAI_API_KEY is required for inventory ingest.");
  }

  const prompt = [
    "You convert a user's message into inventory update commands for a fridge/pantry app.",
    "",
    "The user may say what they PUT INTO storage, or what they TOOK OUT / ATE / USED UP.",
    "Extract ONLY food items (ingredients, packaged foods, prepared dishes).",
    "",
    "Output JSON ONLY:",
    "{\"commands\":[{\"action\":\"add|consume\",\"name\":\"...\",\"quantity\":1,\"unit\":\"ea\",\"remove_all\":false}]}",
    "",
    "Rules:",
    "- Ignore spatial/order words (left/right/top/bottom/next/first/slot/shelf/box) and filler phrases.",
    "- Ignore wake words (e.g. app name + '야').",
    "- Keep item names in the original language. Do not translate.",
    "- Normalize names to the food itself (remove particles/endings like '을/를/이/가/랑/하고').",
    "- Deduplicate items.",
    "- If user clearly indicates 'all' (e.g. 'all of it', 'ran out', '다 먹었어', '없어', '버렸어'), set remove_all=true and quantity=null.",
    "- If quantity is explicitly mentioned, include it; otherwise quantity=1 and unit=\"ea\".",
    "",
    `- Return at most ${cfg.maxItems} commands.`
  ].join("\n");

  const payload = {
    model: cfg.model,
    temperature: 0,
    messages: [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: prompt },
      { role: "user", content: JSON.stringify({ text, ui_lang: uiLang || "" }) }
    ],
    response_format: { type: "json_object" }
  };

  const url = `${cfg.baseUrl.replace(/\/+$/g, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
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
    const errMsg = parsed?.error?.message || parsed?.message || `Inventory agent request failed: ${res.status}`;
    throw new Error(errMsg);
  }

  const content = parsed?.choices?.[0]?.message?.content ?? "";
  let obj = null;
  try {
    obj = content ? JSON.parse(content) : null;
  } catch {
    obj = null;
  }

  const commands = Array.isArray(obj?.commands) ? obj.commands : [];
  return commands;
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const uiLang = payload?.ui_lang ? String(payload.ui_lang).trim().toLowerCase() : "";
    const textInput = payload?.text ? String(payload.text) : "";
    const storageType = payload?.storage_type ? String(payload.storage_type).trim() : "refrigerated";
    const purchasedAt = payload?.purchased_at ? String(payload.purchased_at).trim() : epochDayToIso(todayEpochDay());

    const text = normalizeWhitespace(textInput);
    if (!text) {
      throw new Error("text is required.");
    }

    const cfg = resolveAgentConfig(context.env);
    if (!cfg.enabled) {
      throw new Error("inventory agent is disabled.");
    }

    const aliasLookup = await buildAliasLookup(context, userId);
    const rawCommands = await extractInventoryCommandsWithOpenAI(context, text.slice(0, cfg.maxChars), uiLang, cfg);

    const dedup = new Set();
    const normalizedCommands = [];

    for (const cmd of rawCommands) {
      const action = normalizeAction(cmd?.action);
      if (action !== "add" && action !== "consume") {
        continue;
      }
      const name = normalizeName(cmd?.name);
      if (!name || name.length < 2) {
        continue;
      }
      const removeAll = cmd?.remove_all === true;
      const quantity = removeAll ? null : coerceQuantity(cmd?.quantity);
      const unit = coerceUnit(cmd?.unit);

      const dedupKey = `${action}:${normalizeWord(name)}`;
      if (dedup.has(dedupKey)) {
        continue;
      }
      dedup.add(dedupKey);

      const mention = aliasLookup.get(normalizeWord(name)) || null;
      const ingredientKey = mention?.ingredient_key ? String(mention.ingredient_key) : normalizeIngredientKey(name);

      // Prefer storing the user's spoken Korean name when available.
      const ingredientName = uiLang === "ko" && hasHangul(name) ? name : String(mention?.ingredient_name || name);

      normalizedCommands.push({
        action,
        name,
        ingredient_key: ingredientKey,
        ingredient_name: ingredientName,
        quantity,
        unit,
        remove_all: Boolean(removeAll),
        match_type: mention ? "alias" : "fallback"
      });
    }

    if (normalizedCommands.length === 0) {
      return jsonResponse(context, { data: { commands: [], added: [], consumed: [], not_found: [] } }, 200);
    }

    // Best-effort: keep Korean UI labels natural (adds aliases/translations into the catalog).
    let localization = null;
    try {
      const locCommands = normalizedCommands.map((c) => ({
        ingredient_key: c.ingredient_key,
        ingredient_name: c.ingredient_name
      }));
      localization = await ensureCatalogLocalizationForCommands(context, userId, locCommands, uiLang);
    } catch {
      localization = null;
    }

    const added = [];
    const consumed = [];
    const notFound = [];

    for (const c of normalizedCommands) {
      if (c.action === "add") {
        const res = await upsertInventoryItemRecordByIngredientKey(context, {
          user_id: userId,
          ingredient_key: c.ingredient_key,
          ingredient_name: c.ingredient_name,
          purchased_at: purchasedAt,
          storage_type: storageType,
          quantity: c.quantity ?? 1,
          unit: c.unit || "ea"
        });
        added.push({
          item: res.item,
          merged: Boolean(res.merged),
          quantity: c.quantity ?? 1,
          unit: c.unit || "ea"
        });
        continue;
      }

      if (c.action === "consume") {
        const res = await consumeInventoryByIngredientKey(context, userId, c.ingredient_key, {
          storage_type: storageType,
          consumed_quantity: c.quantity ?? 1,
          remove_all: Boolean(c.remove_all)
        });
        if (Number(res?.matched_count || 0) <= 0) {
          notFound.push({
            ingredient_key: c.ingredient_key,
            ingredient_name: c.ingredient_name,
            quantity: c.quantity ?? 1,
            unit: c.unit || "ea"
          });
        } else {
          consumed.push({
            ingredient_key: c.ingredient_key,
            ingredient_name: c.ingredient_name,
            requested_quantity: c.quantity,
            consumed_quantity: res.consumed_quantity,
            removed_item_ids: res.removed_item_ids || []
          });
        }
      }
    }

    return jsonResponse(context, {
      data: {
        commands: normalizedCommands,
        added,
        consumed,
        not_found: notFound,
        localization
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
