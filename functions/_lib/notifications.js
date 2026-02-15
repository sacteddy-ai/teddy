import { nowIso } from "./util.js";

export function newExpirationNotifications(userId, inventoryItemId, expirationDateIso) {
  const base = new Date(`${String(expirationDateIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) {
    throw new Error("Invalid expiration_date.");
  }

  const schedules = [
    { notify_type: "d_minus_3", scheduled_at: new Date(base.getTime() - 3 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000) },
    { notify_type: "d_minus_1", scheduled_at: new Date(base.getTime() - 1 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000) },
    { notify_type: "d_day", scheduled_at: new Date(base.getTime() + 9 * 60 * 60 * 1000) }
  ];

  const createdAt = nowIso();
  return schedules.map((entry) => ({
    id: crypto.randomUUID(),
    user_id: String(userId),
    inventory_item_id: String(inventoryItemId),
    notify_type: entry.notify_type,
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
