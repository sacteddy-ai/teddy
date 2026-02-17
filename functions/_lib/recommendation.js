import { loadStaticJson } from "./assets.js";
import { inventoryUsageEventsKey, getArray } from "./store.js";
import { normalizeIngredientKey, clampNumber, parseDateOrDateTimeToEpochDay, todayEpochDay } from "./util.js";

let recipeCache = null;
let baselineCache = null;

const COLD_INGREDIENT_WEIGHT = 0.9;
const ROOM_INGREDIENT_WEIGHT = 0.15;
const PANTRY_STAPLE_WEIGHT = 0.12;
const PANTRY_STAPLE_KEY_HINTS = [
  "salt",
  "sugar",
  "pepper",
  "soy_sauce",
  "vinegar",
  "oil",
  "flour",
  "starch",
  "sesame_oil",
  "olive_oil",
  "fish_sauce",
  "miso",
  "gochujang",
  "doenjang"
];

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "ko" || raw === "en") {
    return raw;
  }
  return "en";
}

function pickLocalizedString(row, baseKey, lang, fallback = "") {
  const normalizedLang = normalizeLang(lang);
  const localizedKey = `${String(baseKey)}_${normalizedLang}`;
  const localized = row?.[localizedKey];
  if (localized !== null && localized !== undefined) {
    const v = String(localized).trim();
    if (v) {
      return v;
    }
  }

  const base = row?.[baseKey];
  if (base !== null && base !== undefined) {
    const v = String(base).trim();
    if (v) {
      return v;
    }
  }

  return String(fallback || "").trim();
}

function pickLocalizedArray(row, baseKey, lang) {
  const normalizedLang = normalizeLang(lang);
  const localizedKey = `${String(baseKey)}_${normalizedLang}`;
  const localized = row?.[localizedKey];
  if (Array.isArray(localized)) {
    return localized.map((x) => String(x)).filter((x) => x.trim().length > 0);
  }

  const base = row?.[baseKey];
  if (Array.isArray(base)) {
    return base.map((x) => String(x)).filter((x) => x.trim().length > 0);
  }

  return [];
}

async function getRecipeCatalog(context) {
  if (recipeCache) {
    return recipeCache;
  }
  const parsedBase = await loadStaticJson(context, "/data/recipes.json");
  const baseRecipes = Array.isArray(parsedBase?.recipes) ? parsedBase.recipes : [];

  let youtubeRecipes = [];
  try {
    const parsedYoutube = await loadStaticJson(context, "/data/recipes_youtube.json");
    youtubeRecipes = Array.isArray(parsedYoutube?.recipes) ? parsedYoutube.recipes : [];
  } catch {
    youtubeRecipes = [];
  }

  const merged = [...baseRecipes, ...youtubeRecipes];
  if (merged.length === 0) {
    throw new Error("No recipes found.");
  }
  recipeCache = merged;
  return merged;
}

async function getShoppingBaseline(context) {
  if (baselineCache) {
    return baselineCache;
  }
  const parsed = await loadStaticJson(context, "/data/shopping_baseline.json");
  if (!parsed?.essential_ingredient_keys) {
    throw new Error("No essential_ingredient_keys found.");
  }
  baselineCache = parsed;
  return parsed;
}

function getIngredientKeyFromInventoryItem(item) {
  if (item?.ingredient_key && String(item.ingredient_key).trim()) {
    return normalizeIngredientKey(String(item.ingredient_key));
  }
  if (item?.ingredient_name && String(item.ingredient_name).trim()) {
    return normalizeIngredientKey(String(item.ingredient_name));
  }
  return "unknown";
}

function normalizeStorageTypeForScore(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "room" || raw === "ambient" || raw === "pantry") {
    return "room";
  }
  if (raw === "frozen" || raw === "freezer") {
    return "frozen";
  }
  return "refrigerated";
}

function isPantryStapleKey(ingredientKey) {
  const key = normalizeIngredientKey(String(ingredientKey || ""));
  if (!key) {
    return false;
  }
  for (const hint of PANTRY_STAPLE_KEY_HINTS) {
    if (key === hint || key.includes(hint)) {
      return true;
    }
  }
  return false;
}

function getIngredientWeight(ingredientKey, inventoryMap) {
  const entry = inventoryMap instanceof Map ? inventoryMap.get(ingredientKey) : null;
  const roomQty = Number(entry?.room_quantity || 0);
  const coldQty = Number(entry?.cold_quantity || 0);

  let weight = COLD_INGREDIENT_WEIGHT;
  if (roomQty > 0 && coldQty <= 0) {
    weight = ROOM_INGREDIENT_WEIGHT;
  }
  if (isPantryStapleKey(ingredientKey)) {
    weight = Math.min(weight, PANTRY_STAPLE_WEIGHT);
  }
  return Math.max(0.05, Math.min(1, weight));
}

function buildInventoryMap(inventoryItems) {
  const map = new Map();
  for (const item of inventoryItems || []) {
    const key = getIngredientKeyFromInventoryItem(item);
    const quantity = clampNumber(item?.quantity, 0, 0, null);
    const status = String(item?.status || "fresh");
    const storageType = normalizeStorageTypeForScore(item?.storage_type);

    if (!map.has(key)) {
      map.set(key, {
        ingredient_key: key,
        total_quantity: 0,
        has_fresh_or_soon: false,
        has_expired: false,
        expiring_soon_quantity: 0,
        refrigerated_quantity: 0,
        frozen_quantity: 0,
        room_quantity: 0,
        cold_quantity: 0
      });
    }
    const entry = map.get(key);
    entry.total_quantity += quantity;

    if (storageType === "room") {
      entry.room_quantity += quantity;
    } else if (storageType === "frozen") {
      entry.frozen_quantity += quantity;
      entry.cold_quantity += quantity;
    } else {
      entry.refrigerated_quantity += quantity;
      entry.cold_quantity += quantity;
    }

    if (status === "expired") {
      entry.has_expired = true;
    } else {
      entry.has_fresh_or_soon = true;
    }

    if (status === "expiring_soon") {
      entry.expiring_soon_quantity += quantity;
    }
  }
  return map;
}

function resolveShoppingUsageConfig(baseline, opts = {}) {
  const usageWindowDays = clampNumber(
    opts?.usage_window_days ?? baseline?.usage_window_days_default,
    30,
    7,
    365
  );
  const usageReorderDaysThreshold = clampNumber(
    opts?.usage_reorder_days_threshold ?? opts?.reorder_days_threshold ?? baseline?.usage_reorder_days_threshold_default,
    5,
    1,
    60
  );
  const usageMinConsumedQuantity = clampNumber(
    opts?.usage_min_consumed_quantity ?? baseline?.usage_min_consumed_quantity_default,
    1,
    0.1,
    1000
  );

  return {
    usage_window_days: Number(usageWindowDays),
    usage_reorder_days_threshold: Number(usageReorderDaysThreshold),
    usage_min_consumed_quantity: Number(usageMinConsumedQuantity)
  };
}

function resolveUserIdFromInventoryOrOpts(inventoryItems, opts = {}) {
  const fromOpts = String(opts?.user_id || "").trim();
  if (fromOpts) {
    return fromOpts;
  }
  const rows = Array.isArray(inventoryItems) ? inventoryItems : [];
  for (const item of rows) {
    const uid = String(item?.user_id || "").trim();
    if (uid) {
      return uid;
    }
  }
  return "demo-user";
}

function resolveEventEpochDay(event) {
  const rawEpoch = Number(event?.epoch_day);
  if (Number.isFinite(rawEpoch)) {
    return rawEpoch;
  }
  try {
    return parseDateOrDateTimeToEpochDay(event?.ts);
  } catch {
    return null;
  }
}

async function buildUsageStatsByIngredient(context, userId, usageCfg) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const key = inventoryUsageEventsKey(uid);
  const events = await getArray(context.env, key);

  const windowDays = Math.max(1, Number(usageCfg?.usage_window_days || 30));
  const minEpochDay = todayEpochDay() - windowDays + 1;
  const aggregate = new Map();

  for (const event of events || []) {
    const action = String(event?.action || "").trim().toLowerCase();
    if (action !== "consume") {
      continue;
    }
    const ingredientKey = normalizeIngredientKey(String(event?.ingredient_key || "").trim());
    if (!ingredientKey) {
      continue;
    }
    const qty = clampNumber(event?.quantity, 0, 0, null);
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const epochDay = resolveEventEpochDay(event);
    if (!Number.isFinite(epochDay) || epochDay < minEpochDay) {
      continue;
    }

    if (!aggregate.has(ingredientKey)) {
      aggregate.set(ingredientKey, {
        ingredient_key: ingredientKey,
        total_consumed: 0,
        active_days: new Set(),
        last_consumed_at: null,
        last_epoch_day: null
      });
    }
    const row = aggregate.get(ingredientKey);
    row.total_consumed = Math.round((Number(row.total_consumed || 0) + qty) * 100) / 100;
    row.active_days.add(epochDay);

    const ts = event?.ts ? String(event.ts).trim() : null;
    if (ts) {
      row.last_consumed_at = ts;
    }
    if (!Number.isFinite(row.last_epoch_day) || epochDay > row.last_epoch_day) {
      row.last_epoch_day = epochDay;
    }
  }

  const out = new Map();
  const today = todayEpochDay();
  for (const [ingredientKey, row] of aggregate.entries()) {
    const totalConsumed = Number(row.total_consumed || 0);
    if (totalConsumed < Number(usageCfg?.usage_min_consumed_quantity || 0)) {
      continue;
    }
    const activeDays = row.active_days instanceof Set ? row.active_days.size : 0;
    const avgDaily = totalConsumed / windowDays;
    const avgActive = activeDays > 0 ? totalConsumed / activeDays : 0;

    const lastEpochDay = Number(row.last_epoch_day);
    const daysSinceLastConsumed = Number.isFinite(lastEpochDay) ? Math.max(0, today - lastEpochDay) : null;

    out.set(ingredientKey, {
      ingredient_key: ingredientKey,
      total_consumed: Math.round(totalConsumed * 100) / 100,
      avg_daily_consumption: Math.round(avgDaily * 1000) / 1000,
      avg_active_day_consumption: Math.round(avgActive * 1000) / 1000,
      active_days: activeDays,
      window_days: windowDays,
      last_consumed_at: row.last_consumed_at || null,
      days_since_last_consumed: Number.isFinite(daysSinceLastConsumed) ? daysSinceLastConsumed : null
    });
  }

  return out;
}

export async function getRecipeRecommendations(context, inventoryItems, topN = 10) {
  let options = {};
  if (typeof topN === "object" && topN !== null) {
    options = topN;
    topN = Number(options.top_n ?? 10);
  }

  const uiLang = normalizeLang(options?.ui_lang || "en");
  const n = Math.max(1, Number(topN || 10));
  const recipes = await getRecipeCatalog(context);
  const inventoryMap = buildInventoryMap(inventoryItems || []);

  const results = [];
  for (const recipe of recipes) {
    const required = Array.isArray(recipe?.ingredient_keys)
      ? recipe.ingredient_keys.map((k) => normalizeIngredientKey(String(k)))
      : [];

    const matched = [];
    const missing = [];
    let expiringSoonUsedCount = 0;
    let matchedWeight = 0;
    let missingWeight = 0;
    let expiringSoonWeight = 0;
    let totalRequiredWeight = 0;

    for (const requiredKey of required) {
      const ingredientWeight = getIngredientWeight(requiredKey, inventoryMap);
      totalRequiredWeight += ingredientWeight;
      const entry = inventoryMap.get(requiredKey);
      if (entry && entry.has_fresh_or_soon && entry.total_quantity > 0) {
        matched.push(requiredKey);
        matchedWeight += ingredientWeight;
        if (entry.expiring_soon_quantity > 0) {
          expiringSoonUsedCount += 1;
          expiringSoonWeight += ingredientWeight;
        }
      } else {
        missing.push(requiredKey);
        missingWeight += ingredientWeight;
      }
    }

    const requiredCount = required.length;
    const matchedCount = matched.length;
    const missingCount = missing.length;
    const matchRatio = totalRequiredWeight > 0 ? matchedWeight / totalRequiredWeight : requiredCount === 0 ? 0 : matchedCount / requiredCount;
    const canMakeNow = missingCount === 0;

    const scoreBase = Math.round(matchRatio * 100 * 100) / 100;
    const urgencyBoost = Math.round(expiringSoonWeight * 5 * 100) / 100;
    const missingPenalty = Math.round(missingWeight * 8 * 100) / 100;
    const completionBonus = canMakeNow ? 20 : 0;
    const score = Math.round((scoreBase + urgencyBoost + completionBonus - missingPenalty) * 100) / 100;

    const source = recipe?.source && typeof recipe.source === "object" ? recipe.source : null;
    const sourceType = source?.type ? String(source.type).trim() : "";
    const sourceUrl = source?.url ? String(source.url).trim() : "";
    const sourceTitle = pickLocalizedString(source || {}, "title", uiLang, source?.title || sourceType || "");
    const sourceChannel = pickLocalizedString(source || {}, "channel", uiLang, source?.channel || "");

    results.push({
      recipe_id: String(recipe.id),
      recipe_name: pickLocalizedString(recipe, "name", uiLang, String(recipe.id)),
      chef: pickLocalizedString(recipe, "chef", uiLang, "unknown"),
      tags: pickLocalizedArray(recipe, "tags", uiLang),
      required_ingredient_keys: required,
      optional_ingredient_keys: Array.isArray(recipe.optional_ingredient_keys) ? recipe.optional_ingredient_keys : [],
      matched_ingredient_keys: matched,
      missing_ingredient_keys: missing,
      can_make_now: canMakeNow,
      expiring_soon_used_count: expiringSoonUsedCount,
      match_ratio: matchRatio,
      score,
      source_type: sourceType || "seed",
      source_url: sourceUrl || null,
      source_title: sourceTitle || null,
      source_channel: sourceChannel || null
    });
  }

  results.sort((a, b) => {
    const aMake = a.can_make_now ? 0 : 1;
    const bMake = b.can_make_now ? 0 : 1;
    if (aMake !== bMake) {
      return aMake - bMake;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.match_ratio !== a.match_ratio) {
      return b.match_ratio - a.match_ratio;
    }
    return String(a.recipe_name).localeCompare(String(b.recipe_name));
  });

  return results.slice(0, n);
}

function addOrUpdateSuggestion(map, ingredientKey, reason, priority, relatedRecipeId = null) {
  const key = normalizeIngredientKey(ingredientKey);
  if (!map.has(key)) {
    map.set(key, {
      ingredient_key: key,
      reasons: [reason],
      priority,
      related_recipe_ids: []
    });
  } else {
    const existing = map.get(key);
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    if (priority < existing.priority) {
      existing.priority = priority;
    }
  }

  if (relatedRecipeId) {
    const entry = map.get(key);
    if (!entry.related_recipe_ids.includes(relatedRecipeId)) {
      entry.related_recipe_ids.push(relatedRecipeId);
    }
  }
}

function attachUsageMeta(map, ingredientKey, usageMeta) {
  const key = normalizeIngredientKey(String(ingredientKey || ""));
  if (!key || !map.has(key) || !usageMeta || typeof usageMeta !== "object") {
    return;
  }
  const entry = map.get(key);
  entry.usage = {
    ...(entry.usage && typeof entry.usage === "object" ? entry.usage : {}),
    ...usageMeta
  };
}

function computeUsageUrgencyMeta(inventoryMap, ingredientKey, usage, usageCfg) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inv = inventoryMap.get(ingredientKey) || null;
  const totalQty = Number(inv?.total_quantity || 0);
  const avgDaily = Number(usage.avg_daily_consumption || 0);
  const threshold = Number(usageCfg?.usage_reorder_days_threshold || 5);
  const projectedDaysLeft = avgDaily > 0 ? Math.round((totalQty / avgDaily) * 10) / 10 : null;
  const suggestedOrderDays = Math.max(2, Math.round(threshold + 2));
  const suggestedOrderQuantity = avgDaily > 0 ? Math.max(1, Math.round(avgDaily * suggestedOrderDays)) : 1;
  const daysSinceLast = Number(usage.days_since_last_consumed);

  let urgencyScore = 0;
  if (avgDaily > 0) {
    urgencyScore += Math.min(45, Math.round(avgDaily * 25));
  }
  if (totalQty <= 0) {
    urgencyScore += 35;
  }
  if (Number.isFinite(projectedDaysLeft)) {
    const deficit = Math.max(0, threshold - projectedDaysLeft);
    urgencyScore += Math.min(30, Math.round(deficit * 8));
  }
  if (Number.isFinite(daysSinceLast)) {
    const recencyBoost = Math.max(0, 14 - daysSinceLast);
    urgencyScore += Math.min(20, Math.round(recencyBoost));
  }
  urgencyScore = Math.max(0, Math.min(100, urgencyScore));

  return {
    total_consumed: usage.total_consumed,
    avg_daily_consumption: usage.avg_daily_consumption,
    window_days: usage.window_days,
    active_days: usage.active_days,
    last_consumed_at: usage.last_consumed_at,
    days_since_last_consumed: usage.days_since_last_consumed,
    projected_days_left: Number.isFinite(projectedDaysLeft) ? projectedDaysLeft : null,
    reorder_days_threshold: threshold,
    suggested_order_quantity: suggestedOrderQuantity,
    urgency_score: urgencyScore
  };
}

export async function getShoppingSuggestions(context, inventoryItems, recipeRecommendations = [], opts = {}) {
  const inventoryMap = buildInventoryMap(inventoryItems || []);
  const baseline = await getShoppingBaseline(context);
  const usageCfg = resolveShoppingUsageConfig(baseline, opts);
  const userId = resolveUserIdFromInventoryOrOpts(inventoryItems, opts);
  const usageStatsByKey = await buildUsageStatsByIngredient(context, userId, usageCfg);

  const threshold = opts?.low_stock_threshold
    ? Number(opts.low_stock_threshold)
    : Number(baseline.low_stock_threshold_default || 1);

  const suggestionMap = new Map();

  for (const [key, entry] of inventoryMap.entries()) {
    if (entry.has_expired) {
      addOrUpdateSuggestion(suggestionMap, key, "expired_replace", 1);
    }
    if (entry.has_fresh_or_soon && entry.total_quantity > 0 && entry.total_quantity <= threshold) {
      addOrUpdateSuggestion(suggestionMap, key, "low_stock", 2);
    }

    const usage = usageStatsByKey.get(key) || null;
    if (usage && Number(usage.avg_daily_consumption || 0) > 0) {
      const projectedDaysLeft =
        Number(entry.total_quantity || 0) > 0
          ? Number(entry.total_quantity || 0) / Number(usage.avg_daily_consumption || 1)
          : 0;

      if (Number(entry.total_quantity || 0) <= 0) {
        addOrUpdateSuggestion(suggestionMap, key, "usage_restock", 2);
      } else if (projectedDaysLeft <= Number(usageCfg.usage_reorder_days_threshold || 5)) {
        addOrUpdateSuggestion(suggestionMap, key, "usage_reorder_soon", 2);
      }
    }
  }

  for (const [key] of usageStatsByKey.entries()) {
    const entry = inventoryMap.get(key);
    if (!entry || Number(entry.total_quantity || 0) <= 0) {
      addOrUpdateSuggestion(suggestionMap, key, "usage_restock", 2);
    }
  }

  const essentials = Array.isArray(baseline?.essential_ingredient_keys)
    ? baseline.essential_ingredient_keys
    : [];

  for (const essential of essentials) {
    const key = normalizeIngredientKey(String(essential));
    const entry = inventoryMap.get(key);
    if (!entry || entry.total_quantity <= 0 || !entry.has_fresh_or_soon) {
      addOrUpdateSuggestion(suggestionMap, key, "essential_missing", 2);
    }
  }

  const topRecipeCount = Math.max(0, Number(opts?.top_recipe_count ?? 3));
  const recipesForShopping = (recipeRecommendations || []).slice(0, topRecipeCount);
  for (const recipe of recipesForShopping) {
    if (recipe?.can_make_now) {
      continue;
    }
    const missing = Array.isArray(recipe?.missing_ingredient_keys) ? recipe.missing_ingredient_keys : [];
    for (const missingKey of missing) {
      addOrUpdateSuggestion(suggestionMap, normalizeIngredientKey(String(missingKey)), "recipe_missing", 3, recipe.recipe_id);
    }
  }

  const items = Array.from(suggestionMap.values());

  const recipeNameById = new Map();
  for (const recipe of recipeRecommendations || []) {
    const id = recipe?.recipe_id ? String(recipe.recipe_id) : "";
    if (!id || recipeNameById.has(id)) {
      continue;
    }
    const name = recipe?.recipe_name ? String(recipe.recipe_name) : id;
    recipeNameById.set(id, name);
  }

  const itemsWithNames = items.map((entry) => {
    const relatedRecipeIds = Array.isArray(entry.related_recipe_ids) ? entry.related_recipe_ids : [];
    const relatedRecipeNames = relatedRecipeIds
      .map((id) => recipeNameById.get(String(id)) || String(id))
      .filter((v) => String(v || "").trim().length > 0);

    const usage = usageStatsByKey.get(entry.ingredient_key) || null;
    const usageMeta = computeUsageUrgencyMeta(inventoryMap, entry.ingredient_key, usage, usageCfg);
    if (usageMeta) {
      attachUsageMeta(suggestionMap, entry.ingredient_key, usageMeta);
    }

    const next = {
      ...entry,
      related_recipe_names: relatedRecipeNames,
      usage: suggestionMap.get(entry.ingredient_key)?.usage || null
    };

    const reasons = Array.isArray(next.reasons) ? next.reasons : [];
    const urgency = Number(next?.usage?.urgency_score || 0);
    const projected = Number(next?.usage?.projected_days_left);
    const hasProjected = Number.isFinite(projected);

    const autoOrderCandidate =
      reasons.includes("usage_restock") ||
      reasons.includes("expired_replace") ||
      (reasons.includes("usage_reorder_soon") && urgency >= 45) ||
      (reasons.includes("low_stock") && urgency >= 35);

    next.auto_order_candidate = autoOrderCandidate;
    next.auto_order_hint = autoOrderCandidate
      ? {
          suggested_quantity: Number(next?.usage?.suggested_order_quantity || 1),
          next_order_within_days: hasProjected ? Math.max(0, Math.round(projected)) : null
        }
      : null;

    return next;
  });

  itemsWithNames.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    const aUrgency = Number(a?.usage?.urgency_score || 0);
    const bUrgency = Number(b?.usage?.urgency_score || 0);
    if (bUrgency !== aUrgency) {
      return bUrgency - aUrgency;
    }

    const aProjected = Number(a?.usage?.projected_days_left);
    const bProjected = Number(b?.usage?.projected_days_left);
    const aProjectedOk = Number.isFinite(aProjected);
    const bProjectedOk = Number.isFinite(bProjected);
    if (aProjectedOk && bProjectedOk && aProjected !== bProjected) {
      return aProjected - bProjected;
    }
    if (aProjectedOk !== bProjectedOk) {
      return aProjectedOk ? -1 : 1;
    }

    const aAvg = Number(a?.usage?.avg_daily_consumption || 0);
    const bAvg = Number(b?.usage?.avg_daily_consumption || 0);
    if (bAvg !== aAvg) {
      return bAvg - aAvg;
    }

    return String(a.ingredient_key).localeCompare(String(b.ingredient_key));
  });

  return {
    items: itemsWithNames,
    count: itemsWithNames.length,
    low_stock_threshold: threshold,
    usage_window_days: usageCfg.usage_window_days,
    usage_reorder_days_threshold: usageCfg.usage_reorder_days_threshold,
    usage_min_consumed_quantity: usageCfg.usage_min_consumed_quantity
  };
}
