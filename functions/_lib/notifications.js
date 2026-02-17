import { nowIso } from "./util.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REMINDER_HOUR_OFFSET_MS = 9 * 60 * 60 * 1000;

export const DEFAULT_NOTIFICATION_DAY_OFFSETS = [3, 1, 0];
export const MIN_NOTIFICATION_DAY_OFFSET = 0;
export const MAX_NOTIFICATION_DAY_OFFSET = 60;

export function sanitizeNotificationDayOffsets(value, fallback = DEFAULT_NOTIFICATION_DAY_OFFSETS) {
  const raw = Array.isArray(value) ? value : fallback;
  const unique = new Set();

  for (const entry of raw || []) {
    const n = Number(entry);
    if (!Number.isFinite(n)) {
      continue;
    }
    const day = Math.round(n);
    if (day < MIN_NOTIFICATION_DAY_OFFSET || day > MAX_NOTIFICATION_DAY_OFFSET) {
      continue;
    }
    unique.add(day);
  }

  const normalized = Array.from(unique).sort((a, b) => b - a);
  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackRaw = Array.isArray(fallback) ? fallback : DEFAULT_NOTIFICATION_DAY_OFFSETS;
  const fallbackUnique = new Set();
  for (const entry of fallbackRaw || []) {
    const n = Number(entry);
    if (!Number.isFinite(n)) {
      continue;
    }
    const day = Math.round(n);
    if (day < MIN_NOTIFICATION_DAY_OFFSET || day > MAX_NOTIFICATION_DAY_OFFSET) {
      continue;
    }
    fallbackUnique.add(day);
  }
  const fallbackNormalized = Array.from(fallbackUnique).sort((a, b) => b - a);
  if (fallbackNormalized.length > 0) {
    return fallbackNormalized;
  }
  return [];
}

export function notifyTypeFromDayOffset(dayOffset) {
  const n = Math.round(Number(dayOffset) || 0);
  if (n <= 0) {
    return "d_day";
  }
  return `d_minus_${n}`;
}

export function parseDayOffsetFromNotifyType(notifyType) {
  const raw = String(notifyType || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "d_day") {
    return 0;
  }
  const m = /^d_minus_(\d+)$/.exec(raw);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n);
}

export function newExpirationNotifications(userId, inventoryItemId, expirationDateIso, dayOffsets = null) {
  const base = new Date(`${String(expirationDateIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) {
    throw new Error("Invalid expiration_date.");
  }

  const offsets = sanitizeNotificationDayOffsets(dayOffsets);
  const schedules = offsets.map((dayOffset) => ({
    day_offset: dayOffset,
    notify_type: notifyTypeFromDayOffset(dayOffset),
    scheduled_at: new Date(base.getTime() - dayOffset * MS_PER_DAY + REMINDER_HOUR_OFFSET_MS)
  }));

  const createdAt = nowIso();
  return schedules.map((entry) => ({
    id: crypto.randomUUID(),
    user_id: String(userId),
    inventory_item_id: String(inventoryItemId),
    notify_type: entry.notify_type,
    days_before_expiration: entry.day_offset,
    scheduled_at: entry.scheduled_at.toISOString(),
    sent_at: null,
    status: "pending",
    created_at: createdAt
  }));
}

export function dispatchDueNotifications(notifications, asOfDateTimeIso) {
  const asOf = new Date(String(asOfDateTimeIso || ""));
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("Invalid as_of_datetime.");
  }

  const updated = [];
  const sent = [];

  for (const item of notifications || []) {
    // Treat the KV list as a queue of pending notifications. We intentionally drop "sent" entries
    // so users don't keep seeing already-delivered notifications in the UI.
    if (item?.status === "sent") {
      continue;
    }

    const mutable = {
      id: item.id,
      user_id: item.user_id,
      inventory_item_id: item.inventory_item_id,
      notify_type: item.notify_type,
      days_before_expiration: item.days_before_expiration,
      scheduled_at: item.scheduled_at,
      sent_at: item.sent_at ?? null,
      status: item.status,
      created_at: item.created_at
    };

    const scheduledAt = new Date(String(mutable.scheduled_at));
    if (mutable.status === "pending" && Number.isFinite(scheduledAt.getTime()) && scheduledAt <= asOf) {
      mutable.status = "sent";
      mutable.sent_at = asOf.toISOString();
      sent.push(mutable);
      // Do not keep sent notifications in the pending queue.
      continue;
    }

    updated.push(mutable);
  }

  return {
    updated_notifications: updated,
    sent_notifications: sent,
    sent_count: sent.length
  };
}
