"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustInventoryItem,
  analyzeVision,
  createInventoryItem,
  createShoppingOrderDraft,
  finalizeCaptureSession,
  getCaptureSession,
  getHealth,
  getInventorySummary,
  getNotificationPreferences,
  listInventory,
  listNotifications,
  listRecipeRecommendations,
  listShoppingSuggestions,
  runDueNotifications,
  saveNotificationPreferences,
  sendCaptureMessage,
  startCaptureSession
} from "../lib/api";
import type {
  CapturePayload,
  InventoryItem,
  InventorySummary,
  NotificationItem,
  RecipeRecommendationItem,
  ShoppingSuggestionItem,
  StorageType
} from "../lib/types";

type TabKey = "home" | "capture" | "inventory" | "recipes" | "shopping" | "notifications";
type Notice = { type: "ok" | "error"; text: string };

const STORAGE_TABS: Array<{ key: StorageType; label: string }> = [
  { key: "refrigerated", label: "냉장" },
  { key: "frozen", label: "냉동" },
  { key: "room", label: "상온" }
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mapSummary(s: InventorySummary | null) {
  return {
    total: Number(s?.total_items || 0),
    fresh: Number(s?.fresh_count ?? s?.fresh ?? 0),
    soon: Number(s?.expiring_soon_count ?? s?.expiring_soon ?? 0),
    expired: Number(s?.expired_count ?? s?.expired ?? 0),
    qty: Number(s?.total_quantity || 0)
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    r.readAsDataURL(file);
  });
}

function toInt(v: string, min = 0): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min) return null;
  return n;
}

function statusKo(v: string): string {
  if (v === "fresh") return "신선";
  if (v === "expiring_soon") return "임박";
  return "만료";
}

export default function Page() {
  const [tab, setTab] = useState<TabKey>("home");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [userId, setUserId] = useState("demo-user");
  const [health, setHealth] = useState("checking...");

  const [summary, setSummary] = useState(mapSummary(null));
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [storageFilter, setStorageFilter] = useState<StorageType>("refrigerated");

  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addUnit, setAddUnit] = useState("ea");
  const [addStorage, setAddStorage] = useState<StorageType>("refrigerated");
  const [addPurchasedAt, setAddPurchasedAt] = useState(todayIso());

  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [captureSessionId, setCaptureSessionId] = useState("");
  const [captureStorageType, setCaptureStorageType] = useState<StorageType>("refrigerated");
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureVisionItems, setCaptureVisionItems] = useState("");
  const [captureImage, setCaptureImage] = useState<File | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationDay, setNotificationDay] = useState("3");

  const [recipes, setRecipes] = useState<RecipeRecommendationItem[]>([]);
  const [recipesProvider, setRecipesProvider] = useState("");
  const [includeLive, setIncludeLive] = useState(true);

  const [shopping, setShopping] = useState<ShoppingSuggestionItem[]>([]);
  const [shoppingAutoOnly, setShoppingAutoOnly] = useState(false);
  const [shoppingDraftMsg, setShoppingDraftMsg] = useState("");

  const setOk = (text: string) => setNotice({ type: "ok", text });
  const setErr = (text: string) => setNotice({ type: "error", text });

  const refreshCore = useCallback(async () => {
    try {
      const [h, s, list, prefs, pending] = await Promise.all([
        getHealth(),
        getInventorySummary(userId),
        listInventory(userId),
        getNotificationPreferences(userId),
        listNotifications(userId)
      ]);
      setHealth(`${h.status} @ ${h.timestamp}`);
      setSummary(mapSummary(s));
      setItems(list);
      setNotificationDay(String(prefs.day_offsets?.[0] ?? 3));
      setNotifications(pending);
      const q: Record<string, string> = {};
      list.forEach((it) => {
        q[it.id] = String(Math.round(Number(it.quantity || 0)));
      });
      setQtyDraft(q);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "데이터 조회 실패");
    }
  }, [userId]);

  const loadRecipes = useCallback(async () => {
    try {
      const data = await listRecipeRecommendations({ user_id: userId, top_n: 8, ui_lang: "ko", include_live: includeLive });
      setRecipes(data.items || []);
      setRecipesProvider(String(data?.live?.provider || ""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "레시피 조회 실패");
    }
  }, [includeLive, userId]);

  const loadShopping = useCallback(async () => {
    try {
      const data = await listShoppingSuggestions({ user_id: userId, top_n: 12, top_recipe_count: 3, ui_lang: "ko" });
      setShopping(data.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "장보기 조회 실패");
    }
  }, [userId]);

  useEffect(() => {
    void refreshCore();
  }, [refreshCore]);

  useEffect(() => {
    if (tab === "recipes") void loadRecipes();
    if (tab === "shopping") void loadShopping();
  }, [tab, loadRecipes, loadShopping]);

  const filteredItems = useMemo(() => items.filter((it) => it.storage_type === storageFilter), [items, storageFilter]);
  const visibleShopping = useMemo(
    () => shopping.filter((it) => (shoppingAutoOnly ? Boolean(it.auto_order_candidate) : true)),
    [shopping, shoppingAutoOnly]
  );

  const applyDelta = async (item: InventoryItem, delta: number) => {
    if (delta < 0 && Number(item.quantity || 0) <= Math.abs(delta)) {
      const ok = window.confirm("수량이 0이 되어 삭제됩니다. 진행할까요?");
      if (!ok) return;
    }
    try {
      await adjustInventoryItem(userId, item.id, delta);
      await refreshCore();
      setOk("수량이 반영되었습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "수량 반영 실패");
    }
  };

  const commitQty = async (item: InventoryItem) => {
    const target = toInt(String(qtyDraft[item.id] ?? ""), 0);
    if (target === null) {
      setErr("수량은 0 이상의 정수여야 합니다.");
      setQtyDraft((prev) => ({ ...prev, [item.id]: String(Math.round(Number(item.quantity || 0))) }));
      return;
    }
    const curr = Math.round(Number(item.quantity || 0));
    if (target === curr) return;
    await applyDelta(item, target - curr);
  };

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    const qty = toInt(addQty, 1);
    if (!addName.trim()) {
      setErr("식재료 이름을 입력해 주세요.");
      return;
    }
    if (qty === null) {
      setErr("수량은 1 이상의 정수여야 합니다.");
      return;
    }
    try {
      await createInventoryItem({
        user_id: userId,
        ingredient_name: addName.trim(),
        quantity: qty,
        unit: addUnit.trim() || "ea",
        storage_type: addStorage,
        purchased_at: addPurchasedAt || undefined
      });
      setAddName("");
      setAddQty("1");
      await refreshCore();
      setOk("아이템이 추가되었습니다.");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "추가 실패");
    }
  };

  const saveDay = async () => {
    const day = toInt(notificationDay, 0);
    if (day === null) {
      setErr("알림 기준은 0 이상의 정수여야 합니다.");
      return;
    }
    try {
      await saveNotificationPreferences(userId, day);
      await refreshCore();
      setOk(`알림 기준 D-${day} 저장 완료`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "알림 저장 실패");
    }
  };

  const runDue = async () => {
    try {
      const r = await runDueNotifications(userId);
      await refreshCore();
      setOk(`알림 처리 ${r.sent_count}건`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "알림 실행 실패");
    }
  };

  const startCapture = async () => {
    try {
      const r = await startCaptureSession(userId);
      setCapture(r);
      setCaptureSessionId(String(r?.session?.id || ""));
      setOk("캡처 세션을 시작했습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "캡처 시작 실패");
    }
  };

  const loadCapture = async () => {
    if (!captureSessionId.trim()) {
      setErr("세션 ID를 입력해 주세요.");
      return;
    }
    try {
      const r = await getCaptureSession(captureSessionId.trim());
      setCapture(r);
      setOk("세션을 불러왔습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "세션 조회 실패");
    }
  };

  const sendMessage = async () => {
    let sid = captureSessionId.trim();
    if (!sid) {
      const started = await startCaptureSession(userId);
      sid = String(started?.session?.id || "");
      setCapture(started);
      setCaptureSessionId(sid);
    }
    const text = captureMessage.trim();
    const visionItems = captureVisionItems
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!text && visionItems.length === 0) {
      setErr("메시지 또는 비전 아이템을 입력해 주세요.");
      return;
    }
    try {
      const r = await sendCaptureMessage(sid, { source_type: "text", text, vision_detected_items: visionItems });
      setCapture(r.capture);
      setCaptureSessionId(String(r.capture?.session?.id || sid));
      setCaptureMessage("");
      const n = Number(r?.turn?.parsed_command_count || 0);
      if (n > 0) setOk(`메시지 적용 완료 (${n}개)`);
      else setErr("식재료를 찾지 못했습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메시지 처리 실패");
    }
  };

  const analyzeImage = async () => {
    if (!captureImage) {
      setErr("이미지를 선택해 주세요.");
      return;
    }
    let sid = captureSessionId.trim();
    if (!sid) {
      const started = await startCaptureSession(userId);
      sid = String(started?.session?.id || "");
      setCapture(started);
      setCaptureSessionId(sid);
    }
    try {
      const dataUrl = await readFileAsDataUrl(captureImage);
      const r = await analyzeVision({
        user_id: userId,
        session_id: sid,
        image_base64: dataUrl,
        text_hint: captureMessage.trim() || null,
        ui_lang: "ko",
        source_type: "vision",
        auto_apply_to_session: true,
        segmentation_mode: "auto"
      });
      if (r.capture) setCapture(r.capture);
      if ((r.detected_items || []).length > 0) setCaptureVisionItems((r.detected_items || []).join(", "));
      setOk(`비전 분석 완료: ${(r.detected_items || []).length}개`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "비전 분석 실패");
    }
  };

  const finalizeCaptureToInventory = async () => {
    const sid = captureSessionId.trim() || String(capture?.session?.id || "");
    if (!sid) {
      setErr("먼저 세션을 시작해 주세요.");
      return;
    }
    try {
      const r = await finalizeCaptureSession(sid, {
        user_id: userId,
        purchased_at: todayIso(),
        storage_type: captureStorageType
      });
      setCapture(r);
      await refreshCore();
      setStorageFilter(captureStorageType);
      setTab("inventory");
      setOk("드래프트를 인벤토리로 확정했습니다.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "확정 실패");
    }
  };

  const createDraftOrder = async () => {
    if (!visibleShopping.length) {
      setErr("주문 초안 대상이 없습니다.");
      return;
    }
    try {
      const payload = visibleShopping.map((it) => ({
        ingredient_key: String(it.ingredient_key || "").trim(),
        ingredient_name: String(it.ingredient_name || it.ingredient_key || "").trim(),
        quantity: Math.max(1, Math.round(Number(it?.auto_order_hint?.suggested_quantity || 1))),
        unit: "ea",
        reasons: Array.isArray(it.reasons) ? it.reasons : [],
        priority: Number(it.priority || 0),
        auto_order_candidate: Boolean(it.auto_order_candidate)
      }));
      const r = await createShoppingOrderDraft({ user_id: userId, source: "next_ui", provider: "mixed", items: payload });
      const id = String(r?.draft?.id || "");
      const lines = Number(r?.draft?.summary?.line_count || payload.length);
      setShoppingDraftMsg(id ? `주문 초안 ${id} (${lines}줄)` : "주문 초안 생성 완료");
      setOk("주문 초안 생성 완료");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "주문 초안 생성 실패");
    }
  };

  const captureItems = capture?.session?.draft_items || [];

  return (
    <main className="frai-root">
      <div className="frai-app">
        <header className="frai-header">
          <div>
            <p className="brand-mini">FRAI</p>
            <h1>Frai 냉장고 도우미</h1>
          </div>
          <button className="btn ghost" onClick={() => void refreshCore()}>새로고침</button>
        </header>

        <section className="user-bar">
          <label htmlFor="uid">User</label>
          <input id="uid" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <span className="health">{health}</span>
        </section>

        {notice ? <div className={`notice ${notice.type}`}>{notice.text}</div> : null}

        <section className="frai-screen">
          {tab === "home" ? (
            <div className="screen-stack">
              <section className="hero-card"><div className="hero-logo">AI</div><h2>Frai</h2><p>냉장고 재료를 쉽게 관리하세요.</p></section>
              <section className="action-cards">
                <button className="action-card primary" onClick={() => setTab("capture")}><div className="action-icon">CAM</div><div><strong>냉장고 사진 찍기</strong><span>사진 한 장으로 재료 인식</span></div></button>
                <button className="action-card" onClick={() => setTab("capture")}><div className="action-icon">TALK</div><div><strong>대화로 추가하기</strong><span>말/텍스트로 재료 추가</span></div></button>
              </section>
              <section className="summary-grid">
                <article className="summary-box"><span>전체</span><strong>{summary.total}</strong></article>
                <article className="summary-box"><span>신선</span><strong>{summary.fresh}</strong></article>
                <article className="summary-box"><span>임박</span><strong>{summary.soon}</strong></article>
                <article className="summary-box"><span>만료</span><strong>{summary.expired}</strong></article>
              </section>
            </div>
          ) : null}

          {tab === "capture" ? (
            <div className="screen-stack">
              <section className="panel"><h3>캡처 세션</h3><div className="row two"><input value={captureSessionId} onChange={(e) => setCaptureSessionId(e.target.value)} placeholder="session id"/><button className="btn primary" onClick={() => void startCapture()}>시작</button></div><div className="row"><button className="btn ghost" onClick={() => void loadCapture()}>세션 불러오기</button></div></section>
              <section className="panel"><h3>대화 입력</h3><textarea value={captureMessage} onChange={(e) => setCaptureMessage(e.target.value)} rows={4} placeholder="예: 이거는 두부, 저거는 계란"/><input value={captureVisionItems} onChange={(e) => setCaptureVisionItems(e.target.value)} placeholder="vision items, comma separated"/><div className="row"><button className="btn primary" onClick={() => void sendMessage()}>메시지 전송</button><button className="btn ok" onClick={() => void finalizeCaptureToInventory()}>인벤토리 확정</button></div></section>
              <section className="panel"><h3>사진 분석</h3><input type="file" accept="image/*" onChange={(e) => setCaptureImage(e.target.files?.[0] || null)}/><div className="row two"><select value={captureStorageType} onChange={(e) => setCaptureStorageType(e.target.value as StorageType)}>{STORAGE_TABS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select><button className="btn primary" onClick={() => void analyzeImage()}>Analyze Image</button></div></section>
              <section className="panel"><h3>캡처 드래프트</h3><p className="meta-line">세션 {capture?.session?.id || "-"} | 상태 {capture?.session?.status || "-"} | 아이템 {capture?.summary?.item_count ?? captureItems.length}</p>{captureItems.length === 0 ? <p className="empty">드래프트가 비어 있습니다.</p> : <div className="list">{captureItems.map((it, idx) => <article className="list-item" key={`${it.ingredient_key}-${idx}`}><div className="list-main"><strong>{it.ingredient_name || it.ingredient_key}</strong><span>{Math.round(Number(it.quantity || 0))} {it.unit || "ea"}</span></div></article>)}</div>}</section>
            </div>
          ) : null}

          {tab === "inventory" ? (
            <div className="screen-stack">
              <section className="panel"><h3>인벤토리 추가</h3><form className="stack" onSubmit={submitAdd}><input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="식재료 이름"/><div className="row two"><input inputMode="numeric" value={addQty} onChange={(e) => setAddQty(e.target.value.replace(/[^0-9]/g, ""))} placeholder="수량"/><input value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="단위"/></div><div className="row two"><select value={addStorage} onChange={(e) => setAddStorage(e.target.value as StorageType)}>{STORAGE_TABS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select><input type="date" value={addPurchasedAt} onChange={(e) => setAddPurchasedAt(e.target.value)}/></div><button className="btn primary" type="submit">저장</button></form></section>
              <section className="panel"><div className="seg-tabs">{STORAGE_TABS.map((s) => <button key={s.key} className={`seg-btn ${storageFilter === s.key ? "active" : ""}`} onClick={() => setStorageFilter(s.key)}>{s.label}</button>)}</div>{filteredItems.length === 0 ? <p className="empty">이 구역에 아이템이 없습니다.</p> : <div className="list">{filteredItems.map((it) => <article className="list-item" key={it.id}><div className="list-main"><strong>{it.ingredient_name}</strong><span>{it.storage_type === "refrigerated" ? "냉장" : it.storage_type === "frozen" ? "냉동" : "상온"} | 유통기한 {it.suggested_expiration_date} | D{it.days_remaining}</span></div><div className="list-side"><span className={`chip ${it.status}`}>{statusKo(it.status)}</span><div className="qty-row"><button className="round warn" onClick={() => void applyDelta(it, -1)}>-</button><input className="qty-input" inputMode="numeric" pattern="[0-9]*" value={qtyDraft[it.id] ?? String(Math.round(Number(it.quantity || 0)))} onChange={(e) => setQtyDraft((p) => ({ ...p, [it.id]: e.target.value.replace(/[^0-9]/g, "") }))} onBlur={() => void commitQty(it)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitQty(it); } }}/><button className="round primary" onClick={() => void applyDelta(it, 1)}>+</button></div></div></article>)}</div>}</section>
            </div>
          ) : null}

          {tab === "recipes" ? (
            <div className="screen-stack">
              <section className="panel"><div className="row between"><h3>레시피 추천</h3><button className="btn ghost" onClick={() => void loadRecipes()}>새로고침</button></div><label className="check-row"><input type="checkbox" checked={includeLive} onChange={(e) => setIncludeLive(e.target.checked)}/>라이브 레시피 포함</label><p className="meta-line">provider: {recipesProvider || "-"}</p></section>
              <section className="panel">{recipes.length === 0 ? <p className="empty">레시피가 없습니다.</p> : <div className="list">{recipes.map((r) => <article className="list-item" key={r.recipe_id}><div className="list-main"><strong>{r.recipe_name}</strong><span>{r.source_type || "source"} | 점수 {Math.round(Number(r.score || 0))} | 매칭 {Math.round(Number(r.match_ratio || 0) * 100)}%</span></div><div className="list-side">{r.source_url ? <a className="btn ghost" href={r.source_url} target="_blank" rel="noreferrer">링크</a> : null}</div></article>)}</div>}</section>
            </div>
          ) : null}

          {tab === "shopping" ? (
            <div className="screen-stack">
              <section className="panel"><div className="row between"><h3>장보기 추천</h3><button className="btn ghost" onClick={() => void loadShopping()}>새로고침</button></div><label className="check-row"><input type="checkbox" checked={shoppingAutoOnly} onChange={(e) => setShoppingAutoOnly(e.target.checked)}/>자동 주문 후보만 보기</label><button className="btn ok" onClick={() => void createDraftOrder()}>주문 초안 만들기</button>{shoppingDraftMsg ? <p className="meta-line">{shoppingDraftMsg}</p> : null}</section>
              <section className="panel">{visibleShopping.length === 0 ? <p className="empty">장보기 추천이 없습니다.</p> : <div className="list">{visibleShopping.map((s, i) => <article className="list-item" key={`${s.ingredient_key}-${i}`}><div className="list-main"><strong>{s.ingredient_name || s.ingredient_key}</strong><span>{(s.reason_labels || s.reasons || []).join(", ") || "이유 없음"}</span></div><div className="list-side"><span className="chip fresh">P{Number(s.priority || 0)}</span></div></article>)}</div>}</section>
            </div>
          ) : null}

          {tab === "notifications" ? (
            <div className="screen-stack">
              <section className="panel"><h3>유통기한 알림</h3><p className="meta-line">D-day 기준 한 개만 유지합니다.</p><div className="row two"><input inputMode="numeric" value={notificationDay} onChange={(e) => setNotificationDay(e.target.value.replace(/[^0-9]/g, ""))} placeholder="3"/><button className="btn ok" onClick={() => void saveDay()}>저장</button></div><button className="btn ghost" onClick={() => void runDue()}>지금 실행</button></section>
              <section className="panel"><h3>알림 대기 목록</h3>{notifications.length === 0 ? <p className="empty">대기 알림이 없습니다.</p> : <div className="list">{notifications.map((n) => <article className="list-item" key={n.id}><div className="list-main"><strong>{n.notify_type}</strong><span>item {n.inventory_item_id} | D-{n.days_before_expiration} | {n.status}</span></div></article>)}</div>}</section>
            </div>
          ) : null}
        </section>

        <nav className="frai-nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><span>H</span><em>홈</em></button>
          <button className={tab === "capture" ? "active" : ""} onClick={() => setTab("capture")}><span>C</span><em>캡처</em></button>
          <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}><span>I</span><em>인벤토리</em></button>
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}><span>R</span><em>레시피</em></button>
          <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}><span>S</span><em>쇼핑</em></button>
          <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}><span>N</span><em>알림</em></button>
        </nav>
      </div>
    </main>
  );
}
