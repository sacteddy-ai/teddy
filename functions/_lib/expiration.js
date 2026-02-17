import { loadStaticJson } from "./assets.js";
import {
  epochDayToIso,
  parseDateOrDateTimeToEpochDay,
  parseIsoDateToEpochDay,
  todayEpochDay,
  normalizeWord
} from "./util.js";

let ruleCache = null;

export async function getShelfLifeRules(context) {
  if (ruleCache) {
    return ruleCache;
  }

  const parsed = await loadStaticJson(context, "/data/shelf_life_rules.json");
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
  if (rules.length === 0) {
    throw new Error("No shelf-life rules found.");
  }

  ruleCache = rules;
  return rules;
}

export function clearShelfLifeRuleCache() {
  ruleCache = null;
}

function pickRuleFromCandidates(candidates, normalizedIngredient) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const exact = rows.find((r) => normalizeWord(r?.ingredient_key || "") === normalizedIngredient);
  if (exact) {
    return exact;
  }

  for (const r of rows) {
    const aliases = Array.isArray(r?.aliases) ? r.aliases : [];
    for (const rawAlias of aliases) {
      const a = normalizeWord(rawAlias);
      if (a && a === normalizedIngredient) {
        return r;
      }
    }
  }

  return rows.find((r) => normalizeWord(r?.ingredient_key || "") === "default_perishable") || null;
}

function selectCandidates(rules, storageType = null, conditionType = null) {
  return (Array.isArray(rules) ? rules : []).filter((r) => {
    if (storageType !== null && r?.storage_type !== storageType) {
      return false;
    }
    if (conditionType !== null && r?.condition_type !== conditionType) {
      return false;
    }
    return true;
  });
}

function findRule(rules, ingredientName, storageType, conditionType) {
  const normalized = normalizeWord(ingredientName);

  const conditionAlt = conditionType === "opened" ? "unopened" : "opened";
  const searchOrder = [
    { storage: storageType, condition: conditionType },
    { storage: storageType, condition: conditionAlt },
    { storage: storageType, condition: null },
    { storage: null, condition: conditionType },
    { storage: null, condition: conditionAlt },
    { storage: null, condition: null }
  ];

  for (const scope of searchOrder) {
    const candidates = selectCandidates(rules, scope.storage, scope.condition);
    const rule = pickRuleFromCandidates(candidates, normalized);
    if (rule) {
      return rule;
    }
  }

  throw new Error(`No shelf-life rule found for '${ingredientName}' (${storageType}, ${conditionType}).`);
}

export function getItemStatus(suggestedExpirationEpochDay, asOfEpochDay = null, thresholdDays = 3) {
  const asOf = asOfEpochDay ?? todayEpochDay();
  const daysRemaining = Number(suggestedExpirationEpochDay) - Number(asOf);

  if (daysRemaining < 0) {
    return { status: "expired", days_remaining: daysRemaining };
  }
  if (daysRemaining <= thresholdDays) {
    return { status: "expiring_soon", days_remaining: daysRemaining };
  }
  return { status: "fresh", days_remaining: daysRemaining };
}

export async function getExpirationSuggestion(context, input) {
  const ingredientName = String(input?.ingredient_name || input?.IngredientName || "").trim();
  const purchasedAtRaw = input?.purchased_at ?? input?.PurchasedAt ?? null;
  const storageType = String(input?.storage_type || input?.StorageType || "refrigerated").trim();
  const openedAtRaw = input?.opened_at ?? input?.OpenedAt ?? null;
  const ocrExpirationDateRaw = input?.ocr_expiration_date ?? input?.OcrExpirationDate ?? null;
  const productShelfLifeDays = input?.product_shelf_life_days ?? input?.ProductShelfLifeDays ?? null;
  const asOfDateRaw = input?.as_of_date ?? input?.AsOfDate ?? null;

  if (!ingredientName) {
    throw new Error("ingredient_name is required.");
  }

  const purchasedEpochDay = parseDateOrDateTimeToEpochDay(purchasedAtRaw);
  if (purchasedEpochDay === null) {
    throw new Error("purchased_at is required.");
  }

  const openedEpochDay = parseDateOrDateTimeToEpochDay(openedAtRaw);
  const ocrEpochDay = parseDateOrDateTimeToEpochDay(ocrExpirationDateRaw);
  const asOfEpochDay =
    asOfDateRaw === null || asOfDateRaw === undefined || String(asOfDateRaw).trim() === ""
      ? todayEpochDay()
      : parseIsoDateToEpochDay(String(asOfDateRaw).trim().slice(0, 10));

  if (openedEpochDay !== null && openedEpochDay < purchasedEpochDay) {
    throw new Error("opened_at cannot be earlier than purchased_at.");
  }

  const conditionType = openedEpochDay !== null ? "opened" : "unopened";
  const referenceEpochDay = conditionType === "opened" ? openedEpochDay : purchasedEpochDay;

  let expirationSource = "";
  let confidence = "";
  let suggestedExpirationEpochDay = null;
  let ruleContext = null;
  let rangeMinEpochDay = null;
  let rangeMaxEpochDay = null;

  if (ocrEpochDay !== null) {
    expirationSource = "ocr";
    confidence = "high";
    suggestedExpirationEpochDay = ocrEpochDay;
  } else if (productShelfLifeDays !== null && Number(productShelfLifeDays) > 0) {
    expirationSource = "product_profile";
    confidence = "medium";
    suggestedExpirationEpochDay = referenceEpochDay + Number(productShelfLifeDays);
  } else {
    const rules = await getShelfLifeRules(context);
    ruleContext = findRule(rules, ingredientName, storageType, conditionType);
    expirationSource = "average_rule";
    confidence = String(ruleContext?.confidence || "low");
    suggestedExpirationEpochDay = referenceEpochDay + Number(ruleContext?.avg_days || 0);
    rangeMinEpochDay = referenceEpochDay + Number(ruleContext?.min_days || 0);
    rangeMaxEpochDay = referenceEpochDay + Number(ruleContext?.max_days || 0);
  }

  const statusInfo = getItemStatus(suggestedExpirationEpochDay, asOfEpochDay, 3);

  return {
    ingredient_name_input: ingredientName,
    ingredient_key: ruleContext ? String(ruleContext.ingredient_key) : null,
    storage_type: storageType,
    condition_type: conditionType,
    purchased_at: epochDayToIso(purchasedEpochDay),
    opened_at: openedEpochDay !== null ? epochDayToIso(openedEpochDay) : null,
    reference_date: epochDayToIso(referenceEpochDay),
    suggested_expiration_date: epochDayToIso(suggestedExpirationEpochDay),
    range_min_date: rangeMinEpochDay !== null ? epochDayToIso(rangeMinEpochDay) : null,
    range_max_date: rangeMaxEpochDay !== null ? epochDayToIso(rangeMaxEpochDay) : null,
    expiration_source: expirationSource,
    confidence,
    status: statusInfo.status,
    days_remaining: statusInfo.days_remaining,
    rule_source: ruleContext ? String(ruleContext.source || "") : null
  };
}
