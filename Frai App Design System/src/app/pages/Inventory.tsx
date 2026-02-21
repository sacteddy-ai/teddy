import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  getCategoryLabel,
  getStatusBadge,
  type Category,
  type InventoryUiItem
} from "../lib/uiModel";
import { useUserId } from "../lib/useUserId";

const categories: Array<Category | "all"> = [
  "all",
  "vegetable",
  "meat",
  "dairy",
  "frozen",
  "seasoning",
  "drink",
  "fruit"
];
const filters = ["all", "urgent", "fresh"] as const;
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

export default function Inventory() {
  const navigate = useNavigate();
  const { userId } = useUserId();
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<InventoryUiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const q = new URLSearchParams({ user_id: userId || "demo-user" }).toString();
      const res = await fetch(`${INVENTORY_API_BASE}/api/v1/inventory/items?${q}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store"
      });
      const payload = (await res.json()) as { data?: { items?: InventoryApiItem[] } };
      if (!res.ok) {
        throw new Error("Failed to load inventory.");
      }
      const rows = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      setItems(rows.map(adaptInventoryItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCategory === "all" || item.category === activeCategory;
      const isUrgent = item.status === "today" || item.status === "soon" || item.status === "expired";
      const matchFilter =
        activeFilter === "all" ||
        (activeFilter === "urgent" && isUrgent) ||
        (activeFilter === "fresh" && item.status === "fresh");
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchFilter && matchSearch;
    });
  }, [activeCategory, activeFilter, items, search]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#FFFEF7" }}>
      <div className="px-5 pt-5 pb-4 flex-shrink-0" style={{ background: "#FFFEF7" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#2C2C2C", marginBottom: "12px" }}>Inventory</h1>

        <div
          style={{
            background: "#FFF",
            borderRadius: "16px",
            border: "1.5px solid #F0EFE8",
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            gap: "8px",
            marginBottom: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
          }}
        >
          <span style={{ fontSize: "16px" }}>?뵊</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredient"
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: "14px", color: "#2C2C2C" }}
          />
          <button
            onClick={() => void load()}
            style={{
              background: "#F5F4EE",
              border: "none",
              borderRadius: "10px",
              padding: "5px 10px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                background: activeFilter === f ? "#FDE74C" : "#FFF",
                border: `1.5px solid ${activeFilter === f ? "#FDE74C" : "#F0EFE8"}`,
                borderRadius: "20px",
                padding: "5px 14px",
                fontSize: "13px",
                fontWeight: activeFilter === f ? 700 : 400,
                color: "#2C2C2C",
                cursor: "pointer"
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 px-5 pb-3 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              background: activeCategory === cat ? "#2C2C2C" : "#FFF",
              border: `1.5px solid ${activeCategory === cat ? "#2C2C2C" : "#F0EFE8"}`,
              borderRadius: "20px",
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: activeCategory === cat ? 700 : 400,
              color: activeCategory === cat ? "#FFF" : "#2C2C2C",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            {cat === "all" ? "All" : getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      <div className="px-5 pb-2 flex-shrink-0">
        <span style={{ fontSize: "13px", color: "#888" }}>{filtered.length} items</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {error ? (
          <div
            style={{
              background: "#FFEBEB",
              color: "#9b3a3a",
              borderRadius: "14px",
              padding: "10px 12px",
              fontSize: "13px",
              marginBottom: "10px"
            }}
          >
            {error}
          </div>
        ) : null}
        {loading ? <p style={{ fontSize: "13px", color: "#888" }}>Loading...</p> : null}

        {!loading && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div style={{ fontSize: "48px" }}>?벀</div>
            <p style={{ fontSize: "16px", fontWeight: 600, color: "#2C2C2C" }}>
              {search ? "No search result." : "No inventory yet."}
            </p>
            <p style={{ fontSize: "14px", color: "#888" }}>
              {search ? "Try another keyword." : "Add items by taking a fridge photo."}
            </p>
            {!search ? (
              <button
                onClick={() => navigate("/scan")}
                style={{
                  background: "#FDE74C",
                  border: "none",
                  borderRadius: "16px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#2C2C2C",
                  cursor: "pointer",
                  marginTop: "4px"
                }}
              >
                Scan now
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item, idx) => {
              const badge = getStatusBadge(item.status);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => navigate(`/inventory/${item.id}`)}
                  className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer"
                  style={{
                    background: "#FFF",
                    border: "1.5px solid #F0EFE8",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
                  }}
                >
                  <div
                    style={{
                      width: "46px",
                      height: "46px",
                      background: badge.bg,
                      borderRadius: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "22px",
                      flexShrink: 0
                    }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: "15px", fontWeight: 600, color: "#2C2C2C" }}>{item.name}</div>
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      {Math.round(item.quantity)}
                      {item.unit} 쨌 {getCategoryLabel(item.category)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        borderRadius: "10px",
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: 700
                      }}
                    >
                      {badge.label}
                    </div>
                    <div style={{ fontSize: "11px", color: "#BBB" }}>{item.expiryDate}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
