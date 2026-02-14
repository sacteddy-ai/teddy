import { loadStaticJson } from "./assets.js";
import { aliasOverridesKey, getObject, putObject } from "./store.js";
import { normalizeIngredientKey, normalizeWord } from "./util.js";

let baseCatalogCache = null;

export function clearIngredientCatalogCache() {
  baseCatalogCache = null;
}

function mergeCatalogItems(items, mergedByKey, aliasSetByKey) {
  for (const item of items || []) {
    const rawKey = item?.ingredient_key;
    if (!rawKey) {
      continue;
    }

    const key = normalizeIngredientKey(String(rawKey));
    if (!key) {
      continue;
    }

    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, { ingredient_key: key, display_name: key });
      aliasSetByKey.set(key, new Map());
    }

    const entry = mergedByKey.get(key);
    const aliasMap = aliasSetByKey.get(key);

    const displayNameRaw = item?.display_name;
    if (displayNameRaw && String(displayNameRaw).trim()) {
      entry.display_name = String(displayNameRaw).trim();
    }

    const aliasesRaw = [];
    aliasesRaw.push(key);
    if (entry.display_name) {
      aliasesRaw.push(entry.display_name);
    }
    if (Array.isArray(item?.aliases)) {
      aliasesRaw.push(...item.aliases);
    }

    for (const rawAlias of aliasesRaw) {
      if (rawAlias === null || rawAlias === undefined) {
        continue;
      }
      const alias = String(rawAlias).trim();
      if (!alias) {
        continue;
      }
      const normalized = normalizeWord(alias);
      if (!aliasMap.has(normalized)) {
        aliasMap.set(normalized, alias);
      }
    }
  }
}

async function loadBaseCatalog(context) {
  if (baseCatalogCache) {
    return baseCatalogCache;
  }

  const rulesJson = await loadStaticJson(context, "/data/shelf_life_rules.json");
  const aliasJson = await loadStaticJson(context, "/data/ingredient_aliases.json");
  const seedOverridesJson = await loadStaticJson(context, "/data/ingredient_alias_overrides.json");

  const mergedByKey = new Map();
  const aliasSetByKey = new Map();

  const rules = Array.isArray(rulesJson?.rules) ? rulesJson.rules : [];
  const ruleItems = rules
    .filter((r) => r && r.ingredient_key && String(r.ingredient_key) !== "default_perishable")
    .map((r) => ({
      ingredient_key: r.ingredient_key,
      display_name: r.display_name || r.ingredient_key,
      aliases: Array.isArray(r.aliases) ? r.aliases : []
    }));

  const aliasItems = Array.isArray(aliasJson?.items) ? aliasJson.items : [];
  const seedOverrideItems = Array.isArray(seedOverridesJson?.items) ? seedOverridesJson.items : [];

  mergeCatalogItems(ruleItems, mergedByKey, aliasSetByKey);
  mergeCatalogItems(aliasItems, mergedByKey, aliasSetByKey);
  mergeCatalogItems(seedOverrideItems, mergedByKey, aliasSetByKey);

  const entries = [];
  for (const key of Array.from(mergedByKey.keys()).sort()) {
    const entry = mergedByKey.get(key);
    const aliasMap = aliasSetByKey.get(key) || new Map();
    const aliases = Array.from(aliasMap.values()).sort();
    entries.push({
      ingredient_key: entry.ingredient_key,
      display_name: entry.display_name,
      aliases
    });
  }

  baseCatalogCache = entries;
  return entries;
}

export async function getIngredientCatalogEntries(context, userId) {
  const base = await loadBaseCatalog(context);
  const overrideCatalog = await getObject(context.env, aliasOverridesKey(userId));
  const overrideItems = Array.isArray(overrideCatalog?.items) ? overrideCatalog.items : [];
  if (overrideItems.length === 0) {
    return base;
  }

  const mergedByKey = new Map();
  const aliasSetByKey = new Map();
  mergeCatalogItems(base, mergedByKey, aliasSetByKey);
  mergeCatalogItems(overrideItems, mergedByKey, aliasSetByKey);

  const entries = [];
  for (const key of Array.from(mergedByKey.keys()).sort()) {
    const entry = mergedByKey.get(key);
    const aliasMap = aliasSetByKey.get(key) || new Map();
    const aliases = Array.from(aliasMap.values()).sort();
    entries.push({
      ingredient_key: entry.ingredient_key,
      display_name: entry.display_name,
      aliases
    });
  }

  return entries;
}

export async function buildAliasLookup(context, userId) {
  const entries = await getIngredientCatalogEntries(context, userId);
  const map = new Map();

  for (const entry of entries) {
    const ingredientKey = normalizeIngredientKey(entry.ingredient_key);
    const displayName = String(entry.display_name || ingredientKey);
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];

    for (const rawAlias of aliases) {
      const alias = normalizeWord(rawAlias);
      if (!alias) {
        continue;
      }
      if (!map.has(alias)) {
        map.set(alias, {
          ingredient_key: ingredientKey,
          ingredient_name: displayName,
          matched_alias: String(rawAlias)
        });
      }
    }
  }

  return map;
}

export async function addIngredientAliasOverride(context, userId, ingredientKey, alias, displayName = null) {
  const normalizedKey = normalizeIngredientKey(ingredientKey);
  if (!normalizedKey) {
    throw new Error("ingredient_key is required.");
  }

  const aliasValue = String(alias || "").trim();
  if (!aliasValue) {
    throw new Error("alias is required.");
  }

  const overrideKey = aliasOverridesKey(userId);
  const catalog = (await getObject(context.env, overrideKey)) || {
    version: new Date().toISOString().slice(0, 10),
    source: "cloudflare.kv.overrides.v1",
    items: []
  };

  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const byKey = new Map();
  for (const item of items) {
    if (!item?.ingredient_key) {
      continue;
    }
    const k = normalizeIngredientKey(item.ingredient_key);
    if (!k) {
      continue;
    }
    if (!byKey.has(k)) {
      byKey.set(k, {
        ingredient_key: k,
        display_name: item.display_name || k,
        aliases: Array.isArray(item.aliases) ? Array.from(item.aliases) : []
      });
    }
  }

  if (!byKey.has(normalizedKey)) {
    byKey.set(normalizedKey, {
      ingredient_key: normalizedKey,
      display_name: displayName && String(displayName).trim() ? String(displayName).trim() : normalizedKey,
      aliases: []
    });
  }

  const entry = byKey.get(normalizedKey);
  if (displayName && String(displayName).trim()) {
    entry.display_name = String(displayName).trim();
  }

  const normalizedAlias = normalizeWord(aliasValue);
  const aliasSet = new Map();
  for (const a of entry.aliases) {
    const na = normalizeWord(a);
    if (na && !aliasSet.has(na)) {
      aliasSet.set(na, a);
    }
  }
  if (!aliasSet.has(normalizedAlias)) {
    aliasSet.set(normalizedAlias, aliasValue);
  }

  entry.aliases = Array.from(aliasSet.values());

  catalog.version = new Date().toISOString().slice(0, 10);
  catalog.items = Array.from(byKey.values()).sort((a, b) => String(a.ingredient_key).localeCompare(String(b.ingredient_key)));

  await putObject(context.env, overrideKey, catalog);

  return {
    ingredient_key: normalizedKey,
    display_name: entry.display_name,
    alias: aliasValue
  };
}
