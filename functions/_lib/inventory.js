import { getExpirationSuggestion, getItemStatus } from "./expiration.js";
import { appendInventoryUsageEvents } from "./inventory_usage.js";
import { newExpirationNotifications, sanitizeNotificationDayOffsets } from "./notifications.js";
import { nowIso, parseIsoDateToEpochDay, todayEpochDay, epochDayToIso, normalizeIngredientKey } from "./util.js";
import { getArray, getObject, putArray, inventoryKey, notificationsKey, notificationPreferencesKey } from "./store.js";

function sameInventoryItemId(left, right) {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

export function normalizeInventoryStatus(item, asOfEpochDay = null) {
  if (!item?.suggested_expiration_date) {
    return item;
  }
  const expEpoch = parseIsoDateToEpochDay(String(item.suggested_expiration_date).slice(0, 10));
  const statusInfo = getItemStatus(expEpoch, asOfEpochDay ?? todayEpochDay(), 3);
  return {
    ...item,
    status: statusInfo.status,
    days_remaining: statusInfo.days_remaining
  };
}

async function logUsageEventsBestEffort(context, userId, events) {
  try {
    await appendInventoryUsageEvents(context, userId, events);
  } catch {
    // Usage tracking must not block inventory updates.
  }
}

async function getNotificationDayOffsetsForUser(context, userId) {
  const prefsKey = notificationPreferencesKey(userId);
  const prefs = await getObject(context.env, prefsKey);
  const offsets = sanitizeNotificationDayOffsets(prefs?.day_offsets, [3]);
  if (Array.isArray(offsets) && offsets.length > 0) {
    return [Math.round(Number(offsets[0]) || 3)];
  }
  return [3];
}

export async function createInventoryItemRecord(context, params) {
  const userId = String(params.user_id || "demo-user").trim() || "demo-user";
  const ingredientName = String(params.ingredient_name || "").trim();
  const purchasedAt = String(params.purchased_at || "").trim();
  const storageType = String(params.storage_type || "refrigerated").trim() || "refrigerated";
  const openedAt = params.opened_at ? String(params.opened_at).trim() : null;
  const ocrExpirationDate = params.ocr_expiration_date ? String(params.ocr_expiration_date).trim() : null;
  const productShelfLifeDays = params.product_shelf_life_days ?? null;
  const ingredientKeyHint = params.ingredient_key_hint ? String(params.ingredient_key_hint).trim() : null;

  let quantity = params.quantity === null || params.quantity === undefined ? 1.0 : Number(params.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    quantity = 1.0;
  }
  quantity = Math.round(quantity * 100) / 100;

  const unit = String(params.unit || "ea").trim() || "ea";

  const suggestion = await getExpirationSuggestion(context, {
    ingredient_name: ingredientName,
    purchased_at: purchasedAt,
    storage_type: storageType,
    opened_at: openedAt,
    ocr_expiration_date: ocrExpirationDate,
    product_shelf_life_days: productShelfLifeDays
  });

  const forcedKeyRaw = params.ingredient_key ? String(params.ingredient_key).trim() : "";
  const forcedKey = forcedKeyRaw ? normalizeIngredientKey(forcedKeyRaw) : "";

  let resolvedIngredientKey = suggestion.ingredient_key;
  if (forcedKey) {
    resolvedIngredientKey = forcedKey;
  }
  if (ingredientKeyHint && (!resolvedIngredientKey || resolvedIngredientKey === "default_perishable")) {
    resolvedIngredientKey = ingredientKeyHint;
  }

  const itemId = crypto.randomUUID();
  const now = nowIso();

  const newItem = {
    id: itemId,
    user_id: userId,
    ingredient_name: ingredientName,
    ingredient_key: resolvedIngredientKey,
    quantity,
    unit,
    storage_type: storageType,
    purchased_at: suggestion.purchased_at,
    opened_at: suggestion.opened_at,
    ocr_expiration_date: ocrExpirationDate,
    product_shelf_life_days: productShelfLifeDays,
    suggested_expiration_date: suggestion.suggested_expiration_date,
    range_min_date: suggestion.range_min_date,
    range_max_date: suggestion.range_max_date,
    expiration_source: suggestion.expiration_source,
    confidence: suggestion.confidence,
    status: suggestion.status,
    days_remaining: suggestion.days_remaining,
    created_at: now,
    updated_at: now
  };

  const invKey = inventoryKey(userId);
  const items = await getArray(context.env, invKey);
  items.push(newItem);
  await putArray(context.env, invKey, items);

  const notificationDayOffsets = await getNotificationDayOffsetsForUser(context, userId);
  const notifications = newExpirationNotifications(
    userId,
    itemId,
    suggestion.suggested_expiration_date,
    notificationDayOffsets
  );
  const nKey = notificationsKey(userId);
  const existingNotifications = await getArray(context.env, nKey);
  existingNotifications.push(...notifications);
  await putArray(context.env, nKey, existingNotifications);

  const keyForUsage = normalizeIngredientKey(String(resolvedIngredientKey || ingredientName || "").trim());
  if (keyForUsage) {
    await logUsageEventsBestEffort(context, userId, {
      ts: now,
      action: "add",
      ingredient_key: keyForUsage,
      quantity,
      source: "inventory.create"
    });
  }

  return { item: newItem, notifications };
}

export async function invokeInventoryConsumption(context, userId, itemId, consumedQuantity, openedAt, markOpened) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let removed = false;
  let updatedItem = null;
  let consumedForUsage = 0;
  let consumedIngredientKey = "";
  const updated = [];

  const now = nowIso();
  for (const item of allItems) {
    if (!sameInventoryItemId(item?.id, itemId)) {
      updated.push(item);
      continue;
    }

    found = true;
    const beforeQty = Number(item.quantity || 0);
    const actualConsumed = Math.max(0, Math.min(beforeQty, Number(consumedQuantity || 0)));
    consumedForUsage = Math.round(actualConsumed * 100) / 100;

    const nextQty = Math.max(0, beforeQty - consumedQuantity);
    const roundedQty = Math.round(nextQty * 100) / 100;

    const existingOpenedAt = item.opened_at ? String(item.opened_at).trim() : null;
    let resolvedOpenedAt = existingOpenedAt;
    if (openedAt && String(openedAt).trim()) {
      resolvedOpenedAt = String(openedAt).trim().slice(0, 10);
    } else if (markOpened && !existingOpenedAt) {
      resolvedOpenedAt = now.slice(0, 10);
    }

    const suggestion = await getExpirationSuggestion(context, {
      ingredient_name: item.ingredient_name,
      purchased_at: item.purchased_at,
      storage_type: item.storage_type,
      opened_at: resolvedOpenedAt,
      ocr_expiration_date: item.ocr_expiration_date,
      product_shelf_life_days: item.product_shelf_life_days,
      as_of_date: now.slice(0, 10)
    });
    consumedIngredientKey = normalizeIngredientKey(
      String(item.ingredient_key || suggestion.ingredient_key || item.ingredient_name || "").trim()
    );

    updatedItem = {
      id: item.id,
      user_id: item.user_id,
      ingredient_name: item.ingredient_name,
      ingredient_key: suggestion.ingredient_key || item.ingredient_key,
      quantity: roundedQty,
      unit: item.unit,
      storage_type: item.storage_type,
      purchased_at: suggestion.purchased_at,
      opened_at: suggestion.opened_at,
      ocr_expiration_date: item.ocr_expiration_date,
      product_shelf_life_days: item.product_shelf_life_days,
      suggested_expiration_date: suggestion.suggested_expiration_date,
      range_min_date: suggestion.range_min_date,
      range_max_date: suggestion.range_max_date,
      expiration_source: suggestion.expiration_source,
      confidence: suggestion.confidence,
      status: suggestion.status,
      days_remaining: suggestion.days_remaining,
      created_at: item.created_at,
      updated_at: now
    };

    if (roundedQty <= 0) {
      removed = true;
      continue;
    }

    updated.push(updatedItem);
  }

  if (!found) {
    throw new Error("inventory item not found.");
  }

  await putArray(context.env, invKey, updated);

  if (consumedForUsage > 0 && consumedIngredientKey) {
    await logUsageEventsBestEffort(context, userId, {
      ts: now,
      action: "consume",
      ingredient_key: consumedIngredientKey,
      quantity: consumedForUsage,
      source: "inventory.consume_item"
    });
  }

  if (removed) {
    const nKey = notificationsKey(userId);
    const notifications = await getArray(context.env, nKey);
    const filtered = (notifications || []).filter((n) => n && String(n.inventory_item_id) !== String(itemId));
    const removedNotificationCount = Math.max(0, (notifications || []).length - filtered.length);
    if (removedNotificationCount > 0) {
      await putArray(context.env, nKey, filtered);
    }
  }

  return { updated_items: updated, updated_item: updatedItem, removed };
}

export async function invokeInventoryQuantityAdjustment(context, userId, itemId, deltaQuantity) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let updatedItem = null;
  let usageEvent = null;
  const updated = [];
  const now = nowIso();

  const delta = Number(deltaQuantity);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("delta_quantity must be a non-zero number.");
  }

  for (const item of allItems) {
    if (!sameInventoryItemId(item?.id, itemId)) {
      updated.push(item);
      continue;
    }

    found = true;
    const prevQty = Number(item.quantity || 0);
    const nextQty = Math.round((prevQty + delta) * 100) / 100;
    const usageKey = normalizeIngredientKey(String(item.ingredient_key || item.ingredient_name || "").trim());

    if (usageKey) {
      if (delta > 0) {
        usageEvent = {
          ts: now,
          action: "add",
          ingredient_key: usageKey,
          quantity: Math.round(delta * 100) / 100,
          source: "inventory.adjust"
        };
      } else {
        const consumed = Math.round(Math.max(0, Math.min(prevQty, Math.abs(delta))) * 100) / 100;
        if (consumed > 0) {
          usageEvent = {
            ts: now,
            action: "consume",
            ingredient_key: usageKey,
            quantity: consumed,
            source: "inventory.adjust"
          };
        }
      }
    }

    if (nextQty <= 0) {
      // Treat as removal.
      continue;
    }

    updatedItem = {
      ...item,
      quantity: nextQty,
      updated_at: now
    };
    updated.push(updatedItem);
  }

  if (!found) {
    throw new Error("inventory item not found.");
  }

  await putArray(context.env, invKey, updated);

  if (usageEvent?.ingredient_key && Number(usageEvent?.quantity || 0) > 0) {
    await logUsageEventsBestEffort(context, userId, usageEvent);
  }

  if (!updatedItem) {
    // When an item is removed via quantity adjustment, clear its notifications too.
    const nKey = notificationsKey(userId);
    const notifications = await getArray(context.env, nKey);
    const filtered = (notifications || []).filter((n) => n && String(n.inventory_item_id) !== String(itemId));
    const removedNotificationCount = Math.max(0, (notifications || []).length - filtered.length);
    if (removedNotificationCount > 0) {
      await putArray(context.env, nKey, filtered);
    }
  }

  return { updated_item: updatedItem, removed: !updatedItem };
}

export async function deleteInventoryItemRecord(context, userId, itemId) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let removedItem = null;
  const updated = [];

  for (const item of allItems) {
    if (sameInventoryItemId(item?.id, itemId)) {
      found = true;
      removedItem = item;
      continue;
    }
    updated.push(item);
  }

  if (!found) {
    throw new Error("inventory item not found.");
  }

  await putArray(context.env, invKey, updated);

  const nKey = notificationsKey(userId);
  const notifications = await getArray(context.env, nKey);
  const filtered = (notifications || []).filter((n) => n && String(n.inventory_item_id) !== String(itemId));
  const removedNotificationCount = Math.max(0, (notifications || []).length - filtered.length);
  if (removedNotificationCount > 0) {
    await putArray(context.env, nKey, filtered);
  }

  return { removed_item: removedItem, removed_notification_count: removedNotificationCount };
}

function parseExpirationEpochDay(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return parseIsoDateToEpochDay(raw.slice(0, 10));
  } catch {
    return null;
  }
}

function coercePositiveNumber(value, fallback = 1.0) {
  const n = value === null || value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.round(n * 100) / 100;
}

export async function upsertInventoryItemRecordByIngredientKey(context, params) {
  const userId = String(params.user_id || "demo-user").trim() || "demo-user";
  const ingredientKeyRaw = String(params.ingredient_key || "").trim();
  const ingredientKey = normalizeIngredientKey(ingredientKeyRaw);
  if (!ingredientKey) {
    throw new Error("ingredient_key is required.");
  }

  const ingredientName = String(params.ingredient_name || ingredientKey).trim() || ingredientKey;
  const purchasedAt = String(params.purchased_at || "").trim();
  if (!purchasedAt) {
    throw new Error("purchased_at is required.");
  }

  const storageType = String(params.storage_type || "refrigerated").trim() || "refrigerated";
  const unit = String(params.unit || "ea").trim() || "ea";
  const quantity = coercePositiveNumber(params.quantity, 1.0);

  const invKey = inventoryKey(userId);
  const items = await getArray(context.env, invKey);

  const purchaseDate = purchasedAt.slice(0, 10);
  let bestIdx = -1;
  let bestUpdatedAt = "";

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) {
      continue;
    }
    if (normalizeIngredientKey(item.ingredient_key || "") !== ingredientKey) {
      continue;
    }
    if (String(item.storage_type || "") !== storageType) {
      continue;
    }
    if (String(item.unit || "ea") !== unit) {
      continue;
    }
    const itemPurchased = String(item.purchased_at || "").slice(0, 10);
    if (itemPurchased !== purchaseDate) {
      continue;
    }

    const ua = item.updated_at ? String(item.updated_at) : "";
    if (bestIdx < 0 || String(ua).localeCompare(bestUpdatedAt) > 0) {
      bestIdx = i;
      bestUpdatedAt = ua;
    }
  }

  if (bestIdx >= 0) {
    const now = nowIso();
    const existing = items[bestIdx];
    const nextQty = Math.round((Number(existing.quantity || 0) + quantity) * 100) / 100;
    const mergedItem = {
      ...existing,
      quantity: nextQty,
      updated_at: now
    };
    items[bestIdx] = mergedItem;
    await putArray(context.env, invKey, items);

    await logUsageEventsBestEffort(context, userId, {
      ts: now,
      action: "add",
      ingredient_key: ingredientKey,
      quantity,
      source: "inventory.upsert_merge"
    });

    return { item: mergedItem, merged: true, notifications: [] };
  }

  const createResult = await createInventoryItemRecord(context, {
    user_id: userId,
    ingredient_name: ingredientName,
    ingredient_key: ingredientKey,
    purchased_at: purchasedAt,
    storage_type: storageType,
    quantity,
    unit
  });
  return { item: createResult.item, merged: false, notifications: createResult.notifications || [] };
}

export async function consumeInventoryByIngredientKey(context, userId, ingredientKeyInput, params = {}) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const ingredientKey = normalizeIngredientKey(String(ingredientKeyInput || "").trim());
  if (!ingredientKey) {
    throw new Error("ingredient_key is required.");
  }

  const preferredStorage = params?.storage_type ? String(params.storage_type).trim() : "";
  const removeAll = params?.remove_all === true;
  let remaining = removeAll ? Infinity : coercePositiveNumber(params?.consumed_quantity, 1.0);

  const invKey = inventoryKey(uid);
  const items = await getArray(context.env, invKey);

  const matching = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    if (normalizeIngredientKey(item.ingredient_key || "") !== ingredientKey) {
      continue;
    }
    matching.push(item);
  }

  if (matching.length === 0) {
    return { matched_count: 0, consumed_quantity: 0, removed_item_ids: [], updated_items: items };
  }

  let effectiveMatches = matching;
  if (preferredStorage) {
    const preferred = matching.filter((i) => String(i.storage_type || "") === preferredStorage);
    if (preferred.length > 0) {
      effectiveMatches = preferred;
    }
  }

  // Prefer consuming items that expire sooner.
  const orderedIds = effectiveMatches
    .map((i) => ({
      id: String(i.id),
      exp: parseExpirationEpochDay(i.suggested_expiration_date),
      purchased_at: String(i.purchased_at || ""),
      created_at: String(i.created_at || "")
    }))
    .sort((a, b) => {
      const ea = a.exp === null ? Infinity : a.exp;
      const eb = b.exp === null ? Infinity : b.exp;
      if (ea !== eb) {
        return ea - eb;
      }
      const pa = a.purchased_at || "";
      const pb = b.purchased_at || "";
      if (pa !== pb) {
        return String(pa).localeCompare(String(pb));
      }
      return String(a.created_at).localeCompare(String(b.created_at));
    })
    .map((x) => x.id);

  const now = nowIso();
  const idToItem = new Map();
  for (const item of items) {
    const id = item?.id ? String(item.id) : "";
    if (id && !idToItem.has(id)) {
      idToItem.set(id, item);
    }
  }

  const removedIds = new Set();
  const modsById = new Map(); // id -> { remove: bool, quantity?: number }
  let consumed = 0;
  let consumedAll = 0;

  for (const id of orderedIds) {
    const item = idToItem.get(String(id)) || null;
    if (!item) {
      continue;
    }

    if (removeAll) {
      const qty = Math.round(Math.max(0, Number(item.quantity || 0)) * 100) / 100;
      consumedAll = Math.round((consumedAll + qty) * 100) / 100;
      modsById.set(String(id), { remove: true });
      removedIds.add(String(id));
      continue;
    }

    if (remaining <= 0) {
      break;
    }

    const qty = Number(item.quantity || 0);
    const take = Math.min(qty, remaining);
    remaining = Math.round((remaining - take) * 100) / 100;
    consumed = Math.round((consumed + take) * 100) / 100;

    const nextQty = Math.round((qty - take) * 100) / 100;
    if (nextQty <= 0) {
      modsById.set(String(id), { remove: true });
      removedIds.add(String(id));
      continue;
    }

    modsById.set(String(id), { remove: false, quantity: nextQty });
  }

  const updated = [];
  for (const item of items) {
    const id = item?.id ? String(item.id) : "";
    if (!id) {
      updated.push(item);
      continue;
    }

    const mod = modsById.get(id) || null;
    if (!mod) {
      updated.push(item);
      continue;
    }
    if (mod.remove) {
      continue;
    }

    updated.push({
      ...item,
      quantity: Number(mod.quantity || item.quantity || 0),
      updated_at: now
    });
  }

  await putArray(context.env, invKey, updated);

  const consumedForUsage = removeAll ? consumedAll : consumed;
  if (consumedForUsage > 0) {
    await logUsageEventsBestEffort(context, uid, {
      ts: now,
      action: "consume",
      ingredient_key: ingredientKey,
      quantity: consumedForUsage,
      source: "inventory.consume_key"
    });
  }

  if (removedIds.size > 0) {
    const nKey = notificationsKey(uid);
    const notifications = await getArray(context.env, nKey);
    const filtered = (notifications || []).filter((n) => n && !removedIds.has(String(n.inventory_item_id)));
    const removedNotificationCount = Math.max(0, (notifications || []).length - filtered.length);
    if (removedNotificationCount > 0) {
      await putArray(context.env, nKey, filtered);
    }
  }

  return {
    matched_count: effectiveMatches.length,
    consumed_quantity: removeAll ? null : consumed,
    removed_item_ids: Array.from(removedIds),
    updated_items: updated
  };
}

export async function updateInventoryByIngredientKey(context, userId, ingredientKeyInput, params = {}) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const ingredientKey = normalizeIngredientKey(String(ingredientKeyInput || "").trim());
  if (!ingredientKey) {
    throw new Error("ingredient_key is required.");
  }

  const preferredStorage = params?.storage_type ? String(params.storage_type).trim() : "";
  const hasQuantityUpdate = params?.quantity !== null && params?.quantity !== undefined;
  const hasExpirationUpdate =
    params?.expiration_date !== null &&
    params?.expiration_date !== undefined &&
    String(params.expiration_date || "").trim().length > 0;

  if (!hasQuantityUpdate && !hasExpirationUpdate) {
    throw new Error("quantity or expiration_date is required.");
  }

  const nextQuantity = hasQuantityUpdate ? coercePositiveNumber(params?.quantity, 1.0) : null;
  const nextExpirationDate = hasExpirationUpdate ? String(params.expiration_date).trim().slice(0, 10) : null;
  if (nextExpirationDate && parseExpirationEpochDay(nextExpirationDate) === null) {
    throw new Error("expiration_date must be a valid ISO date (YYYY-MM-DD).");
  }

  const invKey = inventoryKey(uid);
  const items = await getArray(context.env, invKey);
  const matches = [];
  for (const item of items) {
    if (!item) {
      continue;
    }
    if (normalizeIngredientKey(item.ingredient_key || "") !== ingredientKey) {
      continue;
    }
    matches.push(item);
  }

  if (matches.length === 0) {
    return {
      matched_count: 0,
      ingredient_key: ingredientKey,
      updated_item: null
    };
  }

  let effectiveMatches = matches;
  if (preferredStorage) {
    const preferred = matches.filter((i) => String(i.storage_type || "") === preferredStorage);
    if (preferred.length > 0) {
      effectiveMatches = preferred;
    }
  }

  const target = [...effectiveMatches].sort((a, b) => {
    const ua = String(a?.updated_at || a?.created_at || "");
    const ub = String(b?.updated_at || b?.created_at || "");
    return String(ub).localeCompare(String(ua));
  })[0];

  if (!target?.id) {
    return {
      matched_count: 0,
      ingredient_key: ingredientKey,
      updated_item: null
    };
  }

  const targetId = String(target.id);
  const now = nowIso();
  const beforeQuantity = Number(target.quantity || 0);

  const updatedItems = [];
  let updatedItem = null;
  for (const row of items) {
    const rowId = row?.id ? String(row.id) : "";
    if (rowId !== targetId) {
      updatedItems.push(row);
      continue;
    }

    let next = {
      ...row,
      updated_at: now
    };

    if (hasQuantityUpdate) {
      next.quantity = nextQuantity;
    }

    if (hasExpirationUpdate && nextExpirationDate) {
      next.suggested_expiration_date = nextExpirationDate;
      next.range_min_date = nextExpirationDate;
      next.range_max_date = nextExpirationDate;
      next.expiration_source = "manual_voice_update";
      next.confidence = 1.0;
    }

    next = normalizeInventoryStatus(next, todayEpochDay());
    updatedItem = next;
    updatedItems.push(next);
  }

  await putArray(context.env, invKey, updatedItems);

  // Replace notifications for the updated item so reminders match the new expiration.
  const nKey = notificationsKey(uid);
  const notifications = await getArray(context.env, nKey);
  const baseNotifications = (notifications || []).filter((n) => n && String(n.inventory_item_id) !== targetId);
  if (updatedItem?.suggested_expiration_date) {
    const notificationDayOffsets = await getNotificationDayOffsetsForUser(context, uid);
    baseNotifications.push(
      ...newExpirationNotifications(uid, targetId, updatedItem.suggested_expiration_date, notificationDayOffsets)
    );
  }
  await putArray(context.env, nKey, baseNotifications);

  if (hasQuantityUpdate) {
    const delta = Math.round((Number(nextQuantity || 0) - Number(beforeQuantity || 0)) * 100) / 100;
    if (delta !== 0) {
      const usageEvent =
        delta > 0
          ? {
              ts: now,
              action: "add",
              ingredient_key: ingredientKey,
              quantity: Math.round(delta * 100) / 100,
              source: "inventory.voice_update_quantity"
            }
          : {
              ts: now,
              action: "consume",
              ingredient_key: ingredientKey,
              quantity: Math.round(Math.abs(delta) * 100) / 100,
              source: "inventory.voice_update_quantity"
            };

      await logUsageEventsBestEffort(context, uid, usageEvent);
    }
  }

  return {
    matched_count: effectiveMatches.length,
    ingredient_key: ingredientKey,
    updated_item: updatedItem
  };
}

export async function recomputeInventoryStatuses(context, userId) {
  const invKey = inventoryKey(userId);
  const items = await getArray(context.env, invKey);
  const asOf = todayEpochDay();
  const normalized = items.map((item) => normalizeInventoryStatus(item, asOf));

  // Persist if anything changed (status/days_remaining). This keeps list/summary fast.
  let changed = false;
  for (let i = 0; i < items.length; i += 1) {
    const before = items[i];
    const after = normalized[i];
    if (!before || !after) {
      continue;
    }
    if (before.status !== after.status || before.days_remaining !== after.days_remaining) {
      changed = true;
      break;
    }
  }
  if (changed) {
    await putArray(context.env, invKey, normalized);
  }

  return normalized;
}
