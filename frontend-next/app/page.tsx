"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustInventoryItem,
  createInventoryItem,
  getHealth,
  getInventorySummary,
  getNotificationPreferences,
  listInventory,
  listNotifications,
  runDueNotifications,
  saveNotificationPreferences
} from "../lib/api";
import type { InventoryItem, InventorySummary, NotificationItem, StorageType } from "../lib/types";

const EMPTY_SUMMARY: InventorySummary = {
  total_items: 0,
  fresh_count: 0,
  expiring_soon_count: 0,
  expired_count: 0,
  total_quantity: 0
};

function statusLabel(status: InventoryItem["status"]): string {
  if (status === "fresh") return "Fresh";
  if (status === "expiring_soon") return "Soon";
  return "Expired";
}

function storageLabel(storage: StorageType): string {
  if (storage === "frozen") return "Frozen";
  if (storage === "room") return "Room";
  return "Refrigerated";
}

export default function Page() {
  const [userId, setUserId] = useState("demo-user");
  const [health, setHealth] = useState("checking...");
  const [summary, setSummary] = useState<InventorySummary>(EMPTY_SUMMARY);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dayOffset, setDayOffset] = useState<string>("3");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [ingredientName, setIngredientName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [storageType, setStorageType] = useState<StorageType>("refrigerated");
  const [purchasedAt, setPurchasedAt] = useState("");

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [h, s, list, pref, notice] = await Promise.all([
        getHealth(),
        getInventorySummary(userId),
        listInventory(userId),
        getNotificationPreferences(userId),
        listNotifications(userId)
      ]);
      setHealth(`${h.status} @ ${h.timestamp}`);
      setSummary(s);
      setItems(list);
      setNotifications(notice);
      setDayOffset(String(pref.day_offsets?.[0] ?? 3));
      const nextDraft: Record<string, string> = {};
      for (const item of list) {
        nextDraft[item.id] = String(item.quantity);
      }
      setQtyDraft(nextDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const setBusy = (itemId: string, active: boolean) => {
    setBusyIds((prev) => ({ ...prev, [itemId]: active }));
  };

  const applyDelta = async (item: InventoryItem, delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    if (delta < 0 && item.quantity <= Math.abs(delta)) {
      const yes = window.confirm("Quantity will become 0 or less and item will be removed. Continue?");
      if (!yes) {
        setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
        return;
      }
    }
    setBusy(item.id, true);
    setError("");
    setOk("");
    try {
      await adjustInventoryItem(userId, item.id, delta);
      await refreshAll();
      setOk("Quantity updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update quantity.");
    } finally {
      setBusy(item.id, false);
    }
  };

  const commitQty = async (item: InventoryItem) => {
    const raw = String(qtyDraft[item.id] ?? "").trim();
    if (!raw) {
      setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
      return;
    }
    const target = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(target) || target < 0) {
      setError("Quantity must be a number >= 0.");
      setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
      return;
    }
    const delta = Math.round((target - item.quantity) * 100) / 100;
    if (Math.abs(delta) < 0.000001) return;
    await applyDelta(item, delta);
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setOk("");
    const q = Math.round(Number(quantity) * 100) / 100;
    if (!ingredientName.trim()) {
      setError("Please enter ingredient name.");
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    try {
      await createInventoryItem({
        user_id: userId,
        ingredient_name: ingredientName.trim(),
        quantity: q,
        unit: unit.trim() || "ea",
        storage_type: storageType,
        purchased_at: purchasedAt || undefined
      });
      setIngredientName("");
      setQuantity("1");
      await refreshAll();
      setOk("Added to inventory.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add item.");
    }
  };

  const saveDay = async () => {
    setError("");
    setOk("");
    const n = Math.round(Number(dayOffset));
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      setError("Notification day must be between 0 and 60.");
      return;
    }
    try {
      await saveNotificationPreferences(userId, n);
      await refreshAll();
      setOk(`Notification rule saved as D-${n}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save notification rule.");
    }
  };

  const runDue = async () => {
    setError("");
    setOk("");
    try {
      const data = await runDueNotifications(userId);
      await refreshAll();
      setOk(`Sent notifications: ${data.sent_count}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run due notifications.");
    }
  };

  const pendingCount = useMemo(() => notifications.length, [notifications]);

  return (
    <main className="page">
      <section className="hero">
        <h1>Teddy Migration Dashboard</h1>
        <p>Next.js + TypeScript frontend / FastAPI + Pydantic backend</p>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okline">{ok}</div> : null}

      <div className="toolbar">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user id" />
        <button className="btn secondary" onClick={() => void refreshAll()} disabled={loading}>
          Refresh all
        </button>
        <span className="muted">health: {health}</span>
      </div>

      <section className="grid stats">
        <div className="stat">
          <div className="k">Total</div>
          <div className="v">{summary.total_items}</div>
        </div>
        <div className="stat">
          <div className="k">Fresh</div>
          <div className="v">{summary.fresh_count}</div>
        </div>
        <div className="stat">
          <div className="k">Soon</div>
          <div className="v">{summary.expiring_soon_count}</div>
        </div>
        <div className="stat">
          <div className="k">Expired</div>
          <div className="v">{summary.expired_count}</div>
        </div>
        <div className="stat">
          <div className="k">Total Qty</div>
          <div className="v">{summary.total_quantity}</div>
        </div>
      </section>

      <section className="grid main">
        <aside className="panel stack">
          <h2>Add Inventory Item</h2>
          <form onSubmit={submitAdd} className="stack">
            <div className="row">
              <input
                className="full"
                placeholder="ingredient name"
                value={ingredientName}
                onChange={(e) => setIngredientName(e.target.value)}
              />
            </div>
            <div className="row">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" />
            </div>
            <div className="row">
              <select value={storageType} onChange={(e) => setStorageType(e.target.value as StorageType)}>
                <option value="refrigerated">Refrigerated</option>
                <option value="frozen">Frozen</option>
                <option value="room">Room</option>
              </select>
              <input
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
                title="purchased_at"
              />
            </div>
            <button className="btn primary full" type="submit">
              Save
            </button>
          </form>

          <hr />

          <h2>Notification Rule</h2>
          <p className="muted">Single day mode. Example: 3 means 3 days before expiration.</p>
          <div className="row">
            <input
              type="number"
              min={0}
              max={60}
              value={dayOffset}
              onChange={(e) => setDayOffset(e.target.value)}
            />
            <button className="btn ok" type="button" onClick={() => void saveDay()}>
              Save day
            </button>
          </div>
          <div className="row">
            <button className="btn secondary" type="button" onClick={() => void runDue()}>
              Run due
            </button>
            <span className="muted">Pending: {pendingCount}</span>
          </div>
        </aside>

        <section className="panel stack">
          <h2>Inventory</h2>
          {items.length === 0 ? <p className="muted">No items yet.</p> : null}
          {items.map((item) => {
            const isBusy = Boolean(busyIds[item.id]);
            return (
              <article className="item" key={item.id}>
                <div className="item-top">
                  <strong>{item.ingredient_name}</strong>
                  <span className={`badge ${item.status}`}>{statusLabel(item.status)}</span>
                </div>
                <div className="muted">
                  {storageLabel(item.storage_type)} | exp {item.suggested_expiration_date} | D
                  {item.days_remaining}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="qty">
                    <button
                      className="btn warn"
                      disabled={isBusy}
                      onClick={() => void applyDelta(item, -1)}
                      type="button"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={qtyDraft[item.id] ?? String(item.quantity)}
                      disabled={isBusy}
                      onChange={(e) =>
                        setQtyDraft((prev) => ({
                          ...prev,
                          [item.id]: e.target.value
                        }))
                      }
                      onBlur={() => void commitQty(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitQty(item);
                        }
                        if (e.key === "Escape") {
                          setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <button
                      className="btn primary"
                      disabled={isBusy}
                      onClick={() => void applyDelta(item, 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <span className="muted">{item.unit}</span>
                </div>
              </article>
            );
          })}

          <h2 style={{ marginTop: 16 }}>Pending Notifications</h2>
          {notifications.length === 0 ? <p className="muted">No pending notifications.</p> : null}
          {notifications.map((n) => (
            <article className="item" key={n.id}>
              <div className="item-top">
                <strong>{n.notify_type}</strong>
                <span className="muted">{n.status}</span>
              </div>
              <div className="muted">
                item: {n.inventory_item_id} | scheduled: {n.scheduled_at}
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
