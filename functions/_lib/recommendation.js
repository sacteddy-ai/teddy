import { loadStaticJson } from "./assets.js";
import { normalizeIngredientKey, clampNumber } from "./util.js";

let recipeCache = null;
let baselineCache = null;

async function getRecipeCatalog(context) {
  if (recipeCache) {
    return recipeCache;
  }
  const parsed = await loadStaticJson(context, "/data/recipes.json");
  const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
  if (recipes.length === 0) {
    throw new Error("No recipes found.");
  }
  recipeCache = recipes;
  return recipes;
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

function buildInventoryMap(inventoryItems) {
  const map = new Map();
  for (const item of inventoryItems || []) {
    const key = getIngredientKeyFromInventoryItem(item);
    const quantity = clampNumber(item?.quantity, 0, 0, null);
    const status = String(item?.status || "fresh");

    if (!map.has(key)) {
      map.set(key, {
        ingredient_key: key,
        total_quantity: 0,
        has_fresh_or_soon: false,
        has_expired: false,
        expiring_soon_quantity: 0
      });
    }
    const entry = map.get(key);
    entry.total_quantity += quantity;

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

export async function getRecipeRecommendations(context, inventoryItems, topN = 10) {
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

    for (const requiredKey of required) {
      const entry = inventoryMap.get(requiredKey);
      if (entry && entry.has_fresh_or_soon && entry.total_quantity > 0) {
        matched.push(requiredKey);
        if (entry.expiring_soon_quantity > 0) {
          expiringSoonUsedCount += 1;
        }
      } else {
        missing.push(requiredKey);
      }
    }

    const requiredCount = required.length;
    const matchedCount = matched.length;
    const missingCount = missing.length;
    const matchRatio = requiredCount === 0 ? 0 : matchedCount / requiredCount;
    const canMakeNow = missingCount === 0;

    const scoreBase = Math.round(matchRatio * 100 * 100) / 100;
    const urgencyBoost = expiringSoonUsedCount * 5;
    const missingPenalty = missingCount * 8;
    const completionBonus = canMakeNow ? 20 : 0;
    const score = Math.round((scoreBase + urgencyBoost + completionBonus - missingPenalty) * 100) / 100;

    results.push({
      recipe_id: String(recipe.id),
      recipe_name: String(recipe.name || recipe.recipe_name || recipe.id),
      chef: String(recipe.chef || "unknown"),
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      required_ingredient_keys: required,
      optional_ingredient_keys: Array.isArray(recipe.optional_ingredient_keys) ? recipe.optional_ingredient_keys : [],
      matched_ingredient_keys: matched,
      missing_ingredient_keys: missing,
      can_make_now: canMakeNow,
      expiring_soon_used_count: expiringSoonUsedCount,
      match_ratio: matchRatio,
      score
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

export async function getShoppingSuggestions(context, inventoryItems, recipeRecommendations = [], opts = {}) {
  const inventoryMap = buildInventoryMap(inventoryItems || []);
  const baseline = await getShoppingBaseline(context);
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

  const items = Array.from(suggestionMap.values()).sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return String(a.ingredient_key).localeCompare(String(b.ingredient_key));
  });

  return {
    items,
    count: items.length,
    low_stock_threshold: threshold
  };
}

