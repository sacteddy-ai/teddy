import { getExpirationSuggestion, getItemStatus } from "./expiration.js";
import { newExpirationNotifications } from "./notifications.js";
import { nowIso, parseIsoDateToEpochDay, todayEpochDay, epochDayToIso } from "./util.js";
import { getArray, putArray, inventoryKey, notificationsKey } from "./store.js";

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

  let resolvedIngredientKey = suggestion.ingredient_key;
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

  const notifications = newExpirationNotifications(userId, itemId, suggestion.suggested_expiration_date);
  const nKey = notificationsKey(userId);
  const existingNotifications = await getArray(context.env, nKey);
  existingNotifications.push(...notifications);
  await putArray(context.env, nKey, existingNotifications);

  return { item: newItem, notifications };
}

export async function invokeInventoryConsumption(context, userId, itemId, consumedQuantity, openedAt, markOpened) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let removed = false;
  let updatedItem = null;
  const updated = [];

  const now = nowIso();
  for (const item of allItems) {
    if (item?.id !== itemId) {
      updated.push(item);
      continue;
    }

    found = true;
    const nextQty = Math.max(0, Number(item.quantity || 0) - consumedQuantity);
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

  return { updated_items: updated, updated_item: updatedItem, removed };
}

export async function invokeInventoryQuantityAdjustment(context, userId, itemId, deltaQuantity) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let updatedItem = null;
  const updated = [];
  const now = nowIso();

  const delta = Number(deltaQuantity);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("delta_quantity must be a non-zero number.");
  }

  for (const item of allItems) {
    if (item?.id !== itemId) {
      updated.push(item);
      continue;
    }

    found = true;
    const nextQty = Math.round((Number(item.quantity || 0) + delta) * 100) / 100;
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
  return { updated_item: updatedItem, removed: !updatedItem };
}

export async function deleteInventoryItemRecord(context, userId, itemId) {
  const invKey = inventoryKey(userId);
  const allItems = await getArray(context.env, invKey);

  let found = false;
  let removedItem = null;
  const updated = [];

  for (const item of allItems) {
    if (item?.id === itemId) {
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
