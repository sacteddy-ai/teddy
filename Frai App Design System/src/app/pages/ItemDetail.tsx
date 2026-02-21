import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { inventoryItems as mockInventoryItems } from "../data/mockData";
import { getStatusBadge, type Category, type InventoryUiItem } from "../lib/uiModel";
import { useUserId } from "../lib/useUserId";

const INVENTORY_API_BASE = "http://localhost:8080";

type InventoryApiItem = {
  id?: string;
  ingredient_name?: string;
  ingredient_key?: string;
  quantity?: number;
  unit?: string;
  storage_type?: "refrigerated" | "frozen" | "room";
  suggested_expiration_date?: string;
  days_remaining?: number;
};

const iconMap: Record<string, string> = {
  milk: "\uD83E\uDD5B",
  egg: "\uD83E\uDD5A",
  tofu: "\uD83D\uDFEA",
  kimchi: "\uD83E\uDD6C",
  beef: "\uD83E\uDD69",
  pork: "\uD83E\uDD69",
  chicken: "\uD83E\uDD69",
  meat: "\uD83E\uDD69",
  onion: "\uD83E\uDDC5",
  scallion: "\uD83E\uDDC5",
  spinach: "\uD83E\uDD6C",
  butter: "\uD83E\uDDC8",
  apple: "\uD83C\uDF4E",
  banana: "\uD83C\uDF4C",
  orange: "\uD83C\uDF4A",
  juice: "\uD83E\uDD64",
  drink: "\uD83E\uDD64",
  cheese: "\uD83E\uDDC0",
  sauce: "\uD83E\uDD6B",
  paste: "\uD83E\uDD6B",
  soy: "\uD83E\uDD6B"
};

function toItemStatus(daysRemaining: number): InventoryUiItem["status"] {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 0) return "today";
  if (daysRemaining <= 3) return "soon";
  if (daysRemaining <= 7) return "week";
  return "fresh";
}

function toCategory(name: string, storageType: InventoryApiItem["storage_type"]): Category {
  const n = String(name || "").toLowerCase();
  if (n.includes("milk") || n.includes("egg") || n.includes("cheese") || n.includes("butter")) {
    return "dairy";
  }
  if (n.includes("beef") || n.includes("pork") || n.includes("chicken") || n.includes("meat")) {
    return "meat";
  }
  if (n.includes("apple") || n.includes("banana") || n.includes("orange") || n.includes("fruit")) {
    return "fruit";
  }
  if (n.includes("juice") || n.includes("drink") || n.includes("soda")) {
    return "drink";
  }
  if (n.includes("soy") || n.includes("paste") || n.includes("sauce")) {
    return "seasoning";
  }
  if (storageType === "frozen") {
    return "frozen";
  }
  if (storageType === "room") {
    return "seasoning";
  }
  return "vegetable";
}

function toIcon(name: string): string {
  const n = String(name || "").toLowerCase();
  const hit = Object.keys(iconMap).find((key) => n.includes(key));
  return hit ? iconMap[hit] : "\uD83E\uDD55";
}

function adaptInventoryItem(row: InventoryApiItem): InventoryUiItem {
  const name = String(row.ingredient_name || row.ingredient_key || "item");
  const daysRemaining = Number(row.days_remaining ?? 0);
  return {
    id: String(row.id || ""),
    ingredientKey: String(row.ingredient_key || ""),
    name,
    category: toCategory(name, row.storage_type),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit || "ea"),
    expiryDate: String(row.suggested_expiration_date || "").slice(0, 10),
    icon: toIcon(name),
    status: toItemStatus(daysRemaining),
    storageType: row.storage_type === "frozen" || row.storage_type === "room" ? row.storage_type : "refrigerated",
    daysRemaining
  };
}

function fallbackItemFromMock(id: string | undefined): InventoryUiItem | null {
  const target = mockInventoryItems.find((row) => String(row.id) === String(id || ""));
  if (!target) {
    return null;
  }
  return {
    id: String(target.id),
    ingredientKey: String(target.name || "").toLowerCase().replace(/\s+/g, "_"),
    name: String(target.name || "item"),
    category: "vegetable",
    quantity: Number(target.quantity ?? 0),
    unit: String(target.unit || "ea"),
    expiryDate: String(target.expiryDate || ""),
    icon: String(target.icon || "\uD83E\uDD55"),
    status: target.status,
    storageType: "refrigerated",
    daysRemaining: 0
  };
}

export default function ItemDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { userId } = useUserId();

  const [item, setItem] = useState<InventoryUiItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    const run = async () => {
      setError("");
      setLoading(true);
      const fallback = fallbackItemFromMock(id);
      if (fallback) {
        setItem(fallback);
      }
      try {
        const q = new URLSearchParams({ user_id: userId || "demo-user" }).toString();
        const res = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/items?${q}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store"
        });
        const payload = (await res.json()) as { data?: { items?: InventoryApiItem[] } };
        if (!res.ok) {
          throw new Error("Failed to load item detail.");
        }
        const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
        const target = rows.find((it) => String(it.id || "") === String(id || ""));
        setItem(target ? adaptInventoryItem(target) : fallback);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load item detail.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [id, userId]);

  const badge = useMemo(() => (item ? getStatusBadge(item.status) : null), [item]);

  const consumeOne = async () => {
    if (!item || !id || adjusting) {
      return;
    }
    setAdjusting(true);
    setError("");
    try {
      const res = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/items/${encodeURIComponent(id)}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "demo-user",
          delta_quantity: -1
        })
      });
      const payload = (await res.json()) as {
        data?: { item?: InventoryApiItem | null; updated_item?: InventoryApiItem | null; removed?: boolean };
      };
      if (!res.ok) {
        throw new Error("Failed to adjust quantity.");
      }
      const removed = Boolean(payload?.data?.removed);
      const updatedRaw = payload?.data?.item || payload?.data?.updated_item;
      if (removed || !updatedRaw) {
        navigate("/inventory");
        return;
      }
      setItem(adaptInventoryItem(updatedRaw));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to adjust quantity.");
      setItem((prev) => {
        if (!prev) return prev;
        const nextQty = Math.max(0, Number(prev.quantity || 0) - 1);
        if (nextQty <= 0) {
          return prev;
        }
        return { ...prev, quantity: nextQty };
      });
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#FFFEF7" }}>
      <div className="px-5 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/inventory")}
            style={{ background: "#F5F4EE", border: "none", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", fontSize: "16px" }}
          >
            ←
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#2C2C2C" }}>Item Detail</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {loading ? <p style={{ fontSize: "14px", color: "#888" }}>Loading...</p> : null}
        {error ? (
          <div style={{ background: "#FFEBEB", color: "#9b3a3a", borderRadius: "14px", padding: "10px 12px", fontSize: "13px", marginBottom: "10px" }}>
            {error}
          </div>
        ) : null}
        {!loading && !item ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div style={{ fontSize: "46px" }}>🥲</div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#2C2C2C" }}>해당 재고를 찾지 못했습니다.</p>
            <button
              onClick={() => navigate("/inventory")}
              style={{ background: "#FDE74C", border: "none", borderRadius: "14px", padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}
            >
              목록으로
            </button>
          </div>
        ) : null}

        {item && badge ? (
          <>
            <div style={{ background: "#FFF", border: "1.5px solid #F0EFE8", borderRadius: "22px", padding: "18px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  style={{
                    width: "58px",
                    height: "58px",
                    borderRadius: "18px",
                    background: badge.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px"
                  }}
                >
                  {item.icon}
                </div>
                <div className="flex-1">
                  <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#2C2C2C" }}>{item.name}</h2>
                  <div style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>{item.category}</div>
                </div>
                <div style={{ background: badge.bg, color: badge.color, borderRadius: "10px", padding: "4px 10px", fontSize: "12px", fontWeight: 700 }}>{badge.label}</div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {[
                  { label: "수량", value: `${Math.round(item.quantity)}${item.unit}` },
                  { label: "유통기한", value: item.expiryDate || "-" },
                  { label: "보관", value: item.storageType === "refrigerated" ? "냉장" : item.storageType === "frozen" ? "냉동" : "상온" },
                  { label: "남은 일수", value: `${item.daysRemaining}일` }
                ].map((x) => (
                  <div key={x.label} style={{ background: "#F8F7F2", borderRadius: "12px", padding: "10px" }}>
                    <div style={{ fontSize: "11px", color: "#888" }}>{x.label}</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#2C2C2C", marginTop: "3px" }}>{x.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => navigate("/recipes")}
                style={{ flex: 1, background: "#FDE74C", border: "none", borderRadius: "14px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}
              >
                이 재료로 레시피 보기
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => void consumeOne()}
                disabled={adjusting}
                style={{ flex: 1, background: "#F5F4EE", border: "none", borderRadius: "14px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: adjusting ? "not-allowed" : "pointer", opacity: adjusting ? 0.7 : 1 }}
              >
                {adjusting ? "처리중..." : "사용했어요"}
              </motion.button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
