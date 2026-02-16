import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { buildAliasLookup } from "../../../_lib/catalog.js";
import { ensureCatalogLocalizationForCommands } from "../../../_lib/ingredient_localization.js";
import {
  consumeInventoryByIngredientKey,
  updateInventoryByIngredientKey,
  upsertInventoryItemRecordByIngredientKey
} from "../../../_lib/inventory.js";
import {
  clampNumber,
  epochDayToIso,
  normalizeIngredientKey,
  normalizeWhitespace,
  normalizeWord,
  safeString,
  todayEpochDay
} from "../../../_lib/util.js";

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
  if (!raw || raw.length > 12) {
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
  if (
    raw === "set_quantity" ||
    raw === "update_quantity" ||
    raw === "change_quantity" ||
    raw === "quantity" ||
    raw === "update_qty"
  ) {
    return "set_quantity";
  }
  if (
    raw === "set_expiration" ||
    raw === "update_expiration" ||
    raw === "change_expiration" ||
    raw === "expiration" ||
    raw === "set_expiry"
  ) {
    return "set_expiration";
  }
  if (raw.includes("수량")) {
    return "set_quantity";
  }
  if (raw.includes("유통기한") || raw.includes("소비기한")) {
    return "set_expiration";
  }
  return raw;
}

function toIsoDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return "";
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    return "";
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDaysIso(baseDateUtc, days) {
  const dt = new Date(baseDateUtc.getTime());
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${String(dt.getUTCFullYear()).padStart(4, "0")}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

function normalizeExpirationDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  let m = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (m) {
    return toIsoDateParts(m[1], m[2], m[3]);
  }

  const now = new Date();
  const todayBase = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (/^오늘$/.test(raw)) {
    return addDaysIso(todayBase, 0);
  }
  if (/^내일$/.test(raw)) {
    return addDaysIso(todayBase, 1);
  }
  if (/^모레$/.test(raw)) {
    return addDaysIso(todayBase, 2);
  }

  m = raw.match(/^(\d{1,2})\s*일\s*후$/);
  if (m) {
    return addDaysIso(todayBase, Number(m[1]));
  }

  m = raw.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = now.getUTCFullYear();
    let iso = toIsoDateParts(year, month, day);
    if (!iso) {
      return "";
    }
    if (iso < addDaysIso(todayBase, -1)) {
      year += 1;
      iso = toIsoDateParts(year, month, day);
    }
    return iso;
  }

  if (/다음\s*달/.test(raw)) {
    const dayMatch = raw.match(/(\d{1,2})\s*일/);
    if (!dayMatch) {
      return "";
    }
    const day = Number(dayMatch[1]);
    const nextMonth = now.getUTCMonth() + 2;
    const year = nextMonth > 12 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const month = ((nextMonth - 1) % 12) + 1;
    return toIsoDateParts(year, month, day);
  }

  return "";
}

async function extractInventoryCommandsWithOpenAI(context, text, uiLang, cfg) {
  if (!cfg.apiKey) {
    throw new Error("OPENAI_API_KEY is required for inventory ingest.");
  }

  const prompt = [
    "Convert user speech to inventory commands for a fridge/pantry app.",
    "",
    "The user may:",
    "- add items",
    "- consume/remove items",
    "- set quantity for an existing item",
    "- set expiration date for an existing item",
    "",
    "Extract ONLY food items (ingredients, packaged foods, prepared dishes).",
    "",
    "Return JSON ONLY:",
    "{\"commands\":[{\"action\":\"add|consume|set_quantity|set_expiration\",\"name\":\"...\",\"quantity\":1,\"unit\":\"ea\",\"remove_all\":false,\"expiration_date\":\"YYYY-MM-DD\"}]}",
    "",
    "Rules:",
    "- Ignore spatial/order words and filler phrases.",
    "- Ignore wake words and politeness words.",
    "- Keep item names in original language.",
    "- Normalize name to food itself.",
    "- Deduplicate commands.",
    "- For set_expiration, return expiration_date in ISO YYYY-MM-DD when possible.",
    "- For set_quantity, include quantity.",
    "- For consume all intent, set remove_all=true and quantity=null.",
    "",
    "Examples:",
    "- \"계란 3개 남았어\" -> {\"action\":\"set_quantity\",\"name\":\"계란\",\"quantity\":3}",
    "- \"닭갈비 유통기한은 다음 달 20일\" -> {\"action\":\"set_expiration\",\"name\":\"닭갈비\",\"expiration_date\":\"YYYY-MM-DD\"}",
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
      if (action !== "add" && action !== "consume" && action !== "set_quantity" && action !== "set_expiration") {
        continue;
      }

      const name = normalizeName(cmd?.name);
      if (!name || name.length < 2) {
        continue;
      }

      const removeAll = cmd?.remove_all === true;
      const rawQuantity = cmd?.quantity;
      const hasExplicitQuantity =
        rawQuantity !== null &&
        rawQuantity !== undefined &&
        String(rawQuantity).trim().length > 0 &&
        Number.isFinite(Number(rawQuantity));
      const quantity = removeAll ? null : coerceQuantity(rawQuantity);
      const unit = coerceUnit(cmd?.unit);
      const expirationDate = action === "set_expiration" ? normalizeExpirationDateInput(cmd?.expiration_date || cmd?.date) : "";
      if (action === "set_quantity" && !hasExplicitQuantity) {
        continue;
      }
      if (action === "set_expiration" && !expirationDate) {
        continue;
      }

      const dedupKey = `${action}:${normalizeWord(name)}:${expirationDate || ""}:${quantity ?? ""}`;
      if (dedup.has(dedupKey)) {
        continue;
      }
      dedup.add(dedupKey);

      const mention = aliasLookup.get(normalizeWord(name)) || null;
      const ingredientKey = mention?.ingredient_key ? String(mention.ingredient_key) : normalizeIngredientKey(name);
      const ingredientName = uiLang === "ko" && hasHangul(name) ? name : String(mention?.ingredient_name || name);

      normalizedCommands.push({
        action,
        name,
        ingredient_key: ingredientKey,
        ingredient_name: ingredientName,
        quantity,
        unit,
        expiration_date: expirationDate || null,
        remove_all: Boolean(removeAll),
        match_type: mention ? "alias" : "fallback"
      });
    }

    if (normalizedCommands.length === 0) {
      return jsonResponse(context, { data: { commands: [], added: [], consumed: [], updated: [], not_found: [] } }, 200);
    }

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
    const updated = [];
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
        continue;
      }

      if (c.action === "set_quantity" || c.action === "set_expiration") {
        const res = await updateInventoryByIngredientKey(context, userId, c.ingredient_key, {
          storage_type: storageType,
          quantity: c.action === "set_quantity" ? c.quantity ?? 1 : null,
          expiration_date: c.action === "set_expiration" ? c.expiration_date || null : null
        });
        if (Number(res?.matched_count || 0) <= 0) {
          notFound.push({
            ingredient_key: c.ingredient_key,
            ingredient_name: c.ingredient_name,
            quantity: c.quantity ?? 1,
            expiration_date: c.expiration_date || null,
            unit: c.unit || "ea"
          });
        } else {
          updated.push({
            ingredient_key: c.ingredient_key,
            ingredient_name: c.ingredient_name,
            action: c.action,
            quantity: c.action === "set_quantity" ? c.quantity ?? 1 : null,
            expiration_date: c.action === "set_expiration" ? c.expiration_date || null : null,
            item: res.updated_item
          });
        }
      }
    }

    return jsonResponse(context, {
      data: {
        commands: normalizedCommands,
        added,
        consumed,
        updated,
        not_found: notFound,
        localization
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
