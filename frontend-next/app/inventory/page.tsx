"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import { adjustInventoryItem, createInventoryItem, listInventory } from "../../lib/api";
import type { InventoryItem, StorageType } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

const STORAGE_TABS: Array<{ key: StorageType; label: string }> = [
  { key: "refrigerated", label: "냉장" },
  { key: "frozen", label: "냉동" },
  { key: "room", label: "상온" }
];

function toInt(v: string, min = 0): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min) return null;
  return n;
}

export default function InventoryPage() {
  const { userId } = useUserId();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [storageFilter, setStorageFilter] = useState<StorageType>("refrigerated");
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [storage, setStorage] = useState<StorageType>("refrigerated");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const list = await listInventory(userId);
      setItems(list);
      const draft: Record<string, string> = {};
      list.forEach((it) => {
        draft[it.id] = String(Math.round(Number(it.quantity || 0)));
      });
      setQtyDraft(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "인벤토리를 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void refresh();
  }, [userId]);

  const filtered = useMemo(() => items.filter((it) => it.storage_type === storageFilter), [items, storageFilter]);

  const applyDelta = async (item: InventoryItem, delta: number) => {
    if (delta < 0 && Number(item.quantity || 0) <= Math.abs(delta)) {
      if (!window.confirm("수량이 0이 되면 삭제됩니다. 계속할까요?")) return;
    }
    try {
      await adjustInventoryItem(userId, item.id, delta);
      await refresh();
      setNotice("수량을 반영했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "수량 변경 실패");
    }
  };

  const commitQty = async (item: InventoryItem) => {
    const target = toInt(String(qtyDraft[item.id] ?? ""), 0);
    if (target === null) {
      setError("수량은 정수여야 합니다.");
      return;
    }
    const curr = Math.round(Number(item.quantity || 0));
    if (target === curr) return;
    await applyDelta(item, target - curr);
  };

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    const q = toInt(qty, 1);
    if (!name.trim() || q === null) {
      setError("이름과 수량을 확인해 주세요.");
      return;
    }
    try {
      await createInventoryItem({
        user_id: userId,
        ingredient_name: name.trim(),
        quantity: q,
        unit: unit.trim() || "ea",
        storage_type: storage
      });
      setName("");
      setQty("1");
      await refresh();
      setNotice("아이템을 추가했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    }
  };

  return (
    <FraiPhoneFrame navKey="inventory">
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <h2>인벤토리</h2>
        </section>

        <section className="frai-block">
          <h3>아이템 추가</h3>
          <form onSubmit={addItem} className="stack">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="식재료 이름" />
            <div className="row two">
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))} placeholder="수량" />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="단위" />
            </div>
            <div className="row two">
              <select value={storage} onChange={(e) => setStorage(e.target.value as StorageType)}>
                {STORAGE_TABS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="submit">저장</button>
            </div>
          </form>
        </section>

        <section className="frai-block">
          <div className="seg-tabs">
            {STORAGE_TABS.map((s) => (
              <button key={s.key} className={storageFilter === s.key ? "active" : ""} onClick={() => setStorageFilter(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? <p className="muted">해당 구역 아이템이 없습니다.</p> : null}
          <div className="frai-list">
            {filtered.map((it) => (
              <article key={it.id} className="frai-list-item">
                <div>
                  <strong>{it.ingredient_name}</strong>
                  <span>
                    {Math.round(Number(it.quantity || 0))}
                    {it.unit} | 유통기한 {it.suggested_expiration_date} | D{it.days_remaining}
                  </span>
                </div>
                <div className="qty-row">
                  <button className="round warn" onClick={() => void applyDelta(it, -1)}>
                    -
                  </button>
                  <input
                    className="qty-input"
                    value={qtyDraft[it.id] ?? "0"}
                    inputMode="numeric"
                    onChange={(e) =>
                      setQtyDraft((p) => ({
                        ...p,
                        [it.id]: e.target.value.replace(/[^0-9]/g, "")
                      }))
                    }
                    onBlur={() => void commitQty(it)}
                  />
                  <button className="round primary" onClick={() => void applyDelta(it, 1)}>
                    +
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {notice ? <div className="frai-ok">{notice}</div> : null}
        {error ? <div className="frai-error">{error}</div> : null}
      </div>
    </FraiPhoneFrame>
  );
}
