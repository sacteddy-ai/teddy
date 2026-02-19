"use client";

import { useEffect, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import {
  getNotificationPreferences,
  listNotifications,
  runDueNotifications,
  saveNotificationPreferences
} from "../../lib/api";
import type { NotificationItem } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

function toInt(v: string, min = 0): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min) return null;
  return n;
}

export default function NotificationsPage() {
  const { userId } = useUserId();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [day, setDay] = useState("3");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [prefs, list] = await Promise.all([getNotificationPreferences(userId), listNotifications(userId)]);
      setDay(String(prefs.day_offsets?.[0] ?? 3));
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 정보를 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const saveDay = async () => {
    const value = toInt(day, 0);
    if (value === null) {
      setError("알림 일수는 0 이상의 정수여야 합니다.");
      return;
    }
    setError("");
    try {
      await saveNotificationPreferences(userId, value);
      await load();
      setNotice(`D-${value} 저장 완료`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  };

  const runNow = async () => {
    setError("");
    try {
      const r = await runDueNotifications(userId);
      await load();
      setNotice(`알림 실행 완료: ${r.sent_count}건`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 실행 실패");
    }
  };

  return (
    <FraiPhoneFrame navKey="settings">
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <h2>Notifications</h2>
        </section>

        <section className="frai-block">
          <h3>유통기한 알림 기준</h3>
          <p className="muted">단일 day 규칙(예: 3 = D-3)</p>
          <div className="row two">
            <input value={day} onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, ""))} />
            <button onClick={() => void saveDay()}>Save</button>
          </div>
          <button onClick={() => void runNow()}>Run Due</button>
        </section>

        <section className="frai-block">
          <div className="frai-block-title">
            <h3>대기 알림</h3>
            <button onClick={() => void load()}>새로고침</button>
          </div>
          {items.length === 0 ? <p className="muted">대기 알림이 없습니다.</p> : null}
          <div className="frai-list">
            {items.map((n) => (
              <article key={n.id} className="frai-list-item">
                <div>
                  <strong>{n.notify_type}</strong>
                  <span>
                    item {n.inventory_item_id} | D-{n.days_before_expiration} | {n.status}
                  </span>
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

