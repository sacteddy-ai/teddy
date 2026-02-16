import { getArray, inventoryUsageEventsKey, putArray } from "./store.js";
import { clampNumber, normalizeIngredientKey, nowIso, parseDateOrDateTimeToEpochDay, todayEpochDay } from "./util.js";

const DEFAULT_KEEP_DAYS = 120;
const DEFAULT_MAX_RECORDS = 6000;

function normalizeAction(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "consume" || raw === "add") {
    return raw;
  }
  return "";
}

function normalizeUsageEvent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const ingredientKey = normalizeIngredientKey(String(value.ingredient_key || "").trim());
  if (!ingredientKey) {
    return null;
  }

  const action = normalizeAction(value.action);
  if (!action) {
    return null;
  }

  const quantity = clampNumber(value.quantity, 0, 0, null);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const ts = String(value.ts || nowIso()).trim() || nowIso();
  let epochDay = Number(value.epoch_day);
  if (!Number.isFinite(epochDay)) {
    try {
      epochDay = parseDateOrDateTimeToEpochDay(ts);
    } catch {
      epochDay = todayEpochDay();
    }
  }

  const source = String(value.source || "").trim();
  return {
    ts,
    epoch_day: Number(epochDay),
    action,
    ingredient_key: ingredientKey,
    quantity: Math.round(Number(quantity) * 100) / 100,
    source: source || null
  };
}

function pruneUsageEvents(events, keepDays = DEFAULT_KEEP_DAYS, maxRecords = DEFAULT_MAX_RECORDS) {
  const minEpochDay = todayEpochDay() - Math.max(1, Number(keepDays || DEFAULT_KEEP_DAYS));
  const rows = (Array.isArray(events) ? events : [])
    .map((e) => normalizeUsageEvent(e))
    .filter((e) => e && Number.isFinite(e.epoch_day) && e.epoch_day >= minEpochDay);

  rows.sort((a, b) => {
    if (a.epoch_day !== b.epoch_day) {
      return a.epoch_day - b.epoch_day;
    }
    return String(a.ts || "").localeCompare(String(b.ts || ""));
  });

  const limit = Math.max(100, Number(maxRecords || DEFAULT_MAX_RECORDS));
  if (rows.length <= limit) {
    return rows;
  }
  return rows.slice(rows.length - limit);
}

export async function getInventoryUsageEvents(context, userId, options = {}) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const keepDays = clampNumber(options?.keep_days, DEFAULT_KEEP_DAYS, 1, 3650);
  const maxRecords = clampNumber(options?.max_records, DEFAULT_MAX_RECORDS, 100, 20000);
  const key = inventoryUsageEventsKey(uid);

  const current = await getArray(context.env, key);
  const pruned = pruneUsageEvents(current, keepDays, maxRecords);
  if (pruned.length !== current.length) {
    await putArray(context.env, key, pruned);
  }
  return pruned;
}

export async function appendInventoryUsageEvents(context, userId, events, options = {}) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const key = inventoryUsageEventsKey(uid);
  const keepDays = clampNumber(options?.keep_days, DEFAULT_KEEP_DAYS, 1, 3650);
  const maxRecords = clampNumber(options?.max_records, DEFAULT_MAX_RECORDS, 100, 20000);

  const incoming = (Array.isArray(events) ? events : [events]).map((e) => normalizeUsageEvent(e)).filter(Boolean);
  if (incoming.length === 0) {
    const existing = await getArray(context.env, key);
    return {
      saved_count: 0,
      total_count: Array.isArray(existing) ? existing.length : 0
    };
  }

  const existing = await getArray(context.env, key);
  const merged = pruneUsageEvents([...(Array.isArray(existing) ? existing : []), ...incoming], keepDays, maxRecords);
  await putArray(context.env, key, merged);

  return {
    saved_count: incoming.length,
    total_count: merged.length
  };
}

