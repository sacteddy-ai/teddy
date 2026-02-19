"use client";

import { useEffect, useMemo, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import { createShoppingOrderDraft, listShoppingSuggestions } from "../../lib/api";
import type { ShoppingSuggestionItem } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

export default function ShoppingPage() {
  const { userId } = useUserId();
  const [items, setItems] = useState<ShoppingSuggestionItem[]>([]);
  const [autoOnly, setAutoOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await listShoppingSuggestions({
        user_id: userId,
        top_n: 12,
        top_recipe_count: 3,
        ui_lang: "ko"
      });
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "장보기 추천을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const visible = useMemo(
    () => items.filter((it) => (autoOnly ? Boolean(it.auto_order_candidate) : true)),
    [items, autoOnly]
  );

  const createDraft = async () => {
    if (!visible.length) {
      setError("주문 초안으로 보낼 항목이 없습니다.");
      return;
    }

    setError("");
    try {
      const payload = visible.map((it) => ({
        ingredient_key: String(it.ingredient_key || "").trim(),
        ingredient_name: String(it.ingredient_name || it.ingredient_key || "").trim(),
        quantity: Math.max(1, Math.round(Number(it?.auto_order_hint?.suggested_quantity || 1))),
        unit: "ea",
        reasons: Array.isArray(it.reasons) ? it.reasons : [],
        priority: Number(it.priority || 0),
        auto_order_candidate: Boolean(it.auto_order_candidate)
      }));

      const r = await createShoppingOrderDraft({
        user_id: userId,
        source: "next_ui",
        provider: "mixed",
        items: payload
      });
      const id = String(r?.draft?.id || "");
      setMessage(id ? `주문 초안 생성 완료: ${id}` : "주문 초안 생성 완료");
    } catch (e) {
      setError(e instanceof Error ? e.message : "주문 초안 생성 실패");
    }
  };

  return (
    <FraiPhoneFrame navKey="shopping">
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <h2>Shopping Suggestions</h2>
        </section>

        <section className="frai-block">
          <div className="frai-block-title">
            <h3>추천 항목</h3>
            <button onClick={() => void load()}>새로고침</button>
          </div>
          <label className="frai-checkline">
            <input type="checkbox" checked={autoOnly} onChange={(e) => setAutoOnly(e.target.checked)} />
            자동 주문 후보만 보기
          </label>
          <button onClick={() => void createDraft()}>주문 초안 만들기</button>

          {visible.length === 0 ? <p className="muted">추천 항목이 없습니다.</p> : null}
          <div className="frai-list">
            {visible.map((it, i) => (
              <article key={`${it.ingredient_key}-${i}`} className="frai-list-item">
                <div>
                  <strong>{it.ingredient_name || it.ingredient_key}</strong>
                  <span>{(it.reason_labels || it.reasons || []).join(", ") || "이유 없음"}</span>
                </div>
                <em className="chip fresh">P{Number(it.priority || 0)}</em>
              </article>
            ))}
          </div>
        </section>

        {message ? <div className="frai-ok">{message}</div> : null}
        {error ? <div className="frai-error">{error}</div> : null}
      </div>
    </FraiPhoneFrame>
  );
}
