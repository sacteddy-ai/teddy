"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import { getHealth, getInventorySummary, listInventory } from "../../lib/api";
import type { InventoryItem } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

export default function HomePage() {
  const { userId, setUserId } = useUserId();
  const [health, setHealth] = useState("-");
  const [summary, setSummary] = useState({ total: 0, fresh: 0, soon: 0, expired: 0 });
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      setError("");
      try {
        const [h, s, list] = await Promise.all([getHealth(), getInventorySummary(userId), listInventory(userId)]);
        setHealth(`${h.status}`);
        setSummary({
          total: Number(s.total_items || 0),
          fresh: Number(s.fresh_count ?? s.fresh ?? 0),
          soon: Number(s.expiring_soon_count ?? s.expiring_soon ?? 0),
          expired: Number(s.expired_count ?? s.expired ?? 0)
        });
        setItems(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
      }
    };
    void run();
  }, [userId]);

  const urgentItems = useMemo(
    () => items.filter((it) => it.status === "expiring_soon" || it.status === "expired").slice(0, 4),
    [items]
  );

  return (
    <FraiPhoneFrame navKey="home">
      <div className="frai-page">
        <section className="frai-header-hero">
          <div>
            <p>안녕하세요</p>
            <h2>오늘의 냉장고</h2>
          </div>
          <Link href="/notifications" className="circle-btn">
            알
          </Link>
        </section>

        <section className="frai-user-row">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user id" />
          <span>{health}</span>
        </section>

        {error ? <div className="frai-error">{error}</div> : null}

        <section className="frai-stat-grid">
          <article>
            <span>전체</span>
            <strong>{summary.total}</strong>
          </article>
          <article>
            <span>신선</span>
            <strong>{summary.fresh}</strong>
          </article>
          <article>
            <span>임박</span>
            <strong>{summary.soon}</strong>
          </article>
          <article>
            <span>만료</span>
            <strong>{summary.expired}</strong>
          </article>
        </section>

        <section className="frai-block">
          <div className="frai-block-title">
            <h3>유통기한 임박</h3>
            <Link href="/notifications">전체보기</Link>
          </div>
          {urgentItems.length === 0 ? <p className="muted">임박 항목이 없습니다.</p> : null}
          <div className="frai-list">
            {urgentItems.map((item) => (
              <article key={item.id} className="frai-list-item">
                <div>
                  <strong>{item.ingredient_name}</strong>
                  <span>
                    {item.suggested_expiration_date} | D{item.days_remaining}
                  </span>
                </div>
                <em className={item.status === "expired" ? "chip expired" : "chip soon"}>
                  {item.status === "expired" ? "만료" : "임박"}
                </em>
              </article>
            ))}
          </div>
        </section>

        <section className="frai-quick-grid">
          <Link href="/scan">Take photo</Link>
          <Link href="/chat">Talk</Link>
          <Link href="/recipes">Recipe Recommendations</Link>
          <Link href="/shopping">Shopping Suggestions</Link>
        </section>
      </div>
    </FraiPhoneFrame>
  );
}
