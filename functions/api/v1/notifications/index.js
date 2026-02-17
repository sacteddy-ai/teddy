import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { getArray, putArray, inventoryKey, notificationsKey } from "../../../_lib/store.js";
import { parseIsoDateToEpochDay, todayEpochDay } from "../../../_lib/util.js";
import { parseDayOffsetFromNotifyType } from "../../../_lib/notifications.js";

function toEpochDaySafe(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!raw) {
    return null;
  }
  try {
    return parseIsoDateToEpochDay(raw);
  } catch {
    return null;
  }
}

function toDateMs(value) {
  const d = new Date(String(value || ""));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const url = new URL(context.request.url);
    const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
    const status = (url.searchParams.get("status") || "").trim();
    const dueUntil = (url.searchParams.get("due_until") || "").trim();

    let items = await getArray(context.env, notificationsKey(userId));

    // Garbage-collect orphaned notifications (inventory items already removed).
    // This keeps the UI clean even if older data exists from before cleanup logic was added.
    const inventoryItems = await getArray(context.env, inventoryKey(userId));
    const invIds = new Set((inventoryItems || []).map((i) => String(i?.id || "")).filter((v) => v));
    const pruned = (items || []).filter((n) => n && invIds.has(String(n.inventory_item_id)));
    if (pruned.length !== (items || []).length) {
      items = pruned;
      await putArray(context.env, notificationsKey(userId), items);
    }

    if (status) {
      items = items.filter((n) => n && n.status === status);
    }
    if (dueUntil) {
      const due = new Date(dueUntil);
      if (!Number.isFinite(due.getTime())) {
        throw new Error("Invalid due_until.");
      }
      items = items.filter((n) => {
        const scheduled = new Date(String(n?.scheduled_at || ""));
        return Number.isFinite(scheduled.getTime()) && scheduled <= due;
      });
    }

    items = [...items].sort((a, b) => {
      const ams = toDateMs(a?.scheduled_at);
      const bms = toDateMs(b?.scheduled_at);
      if (ams === null && bms === null) {
        return 0;
      }
      if (ams === null) {
        return 1;
      }
      if (bms === null) {
        return -1;
      }
      return ams - bms;
    });

    const invById = new Map();
    for (const inv of inventoryItems || []) {
      const id = String(inv?.id || "").trim();
      if (id) {
        invById.set(id, inv);
      }
    }

    const today = todayEpochDay();
    const enriched = items.map((n) => {
      const itemId = String(n?.inventory_item_id || "").trim();
      const inv = itemId ? invById.get(itemId) || null : null;
      const expirationEpoch = toEpochDaySafe(inv?.suggested_expiration_date);
      const daysUntilExpiration =
        expirationEpoch === null || !Number.isFinite(today) ? null : Number(expirationEpoch) - Number(today);
      const parsedOffset = parseDayOffsetFromNotifyType(n?.notify_type);
      const dayOffsetRaw =
        n?.days_before_expiration !== null && n?.days_before_expiration !== undefined
          ? Number(n.days_before_expiration)
          : parsedOffset;
      const dayOffset = Number.isFinite(dayOffsetRaw) ? Math.max(0, Math.round(dayOffsetRaw)) : null;

      return {
        ...n,
        days_before_expiration: dayOffset,
        days_until_expiration: daysUntilExpiration,
        item: inv
          ? {
              id: String(inv.id || ""),
              ingredient_name: inv.ingredient_name || "",
              ingredient_key: inv.ingredient_key || "",
              storage_type: inv.storage_type || "",
              suggested_expiration_date: inv.suggested_expiration_date || "",
              status: inv.status || "",
              days_remaining: inv.days_remaining ?? null,
              quantity: inv.quantity ?? null,
              unit: inv.unit || ""
            }
          : null
      };
    });

    return jsonResponse(context, {
      data: {
        items: enriched,
        count: enriched.length
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
