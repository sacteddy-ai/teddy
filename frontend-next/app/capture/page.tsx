"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import {
  analyzeVision,
  finalizeCaptureSession,
  getCaptureSession,
  sendCaptureMessage,
  startCaptureSession
} from "../../lib/api";
import type { CapturePayload, StorageType } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    r.readAsDataURL(file);
  });
}

export default function CapturePage() {
  const { userId } = useUserId();
  const searchParams = useSearchParams();
  const mode = useMemo(() => searchParams.get("mode") || "photo", [searchParams]);

  const [sessionId, setSessionId] = useState("");
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [message, setMessage] = useState("");
  const [visionItems, setVisionItems] = useState("");
  const [storageType, setStorageType] = useState<StorageType>("refrigerated");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const start = async () => {
    setError("");
    try {
      const r = await startCaptureSession(userId);
      setCapture(r);
      setSessionId(String(r?.session?.id || ""));
      setNotice("캡처 세션을 시작했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "캡처 시작 실패");
    }
  };

  const load = async () => {
    if (!sessionId.trim()) {
      setError("세션 ID를 입력해 주세요.");
      return;
    }
    setError("");
    try {
      const r = await getCaptureSession(sessionId.trim());
      setCapture(r);
      setNotice("세션을 불러왔습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "세션 조회 실패");
    }
  };

  const ensureSession = async (): Promise<string | null> => {
    const sid = sessionId.trim();
    if (sid) return sid;
    try {
      const r = await startCaptureSession(userId);
      const nextId = String(r?.session?.id || "");
      setCapture(r);
      setSessionId(nextId);
      return nextId || null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "세션 시작 실패");
      return null;
    }
  };

  const send = async () => {
    const sid = await ensureSession();
    if (!sid) return;

    const text = message.trim();
    const vision = parseCsv(visionItems);
    if (!text && vision.length === 0) {
      setError("메시지 또는 Vision Items를 입력해 주세요.");
      return;
    }

    setError("");
    try {
      const r = await sendCaptureMessage(sid, {
        source_type: "text",
        text,
        vision_detected_items: vision
      });
      setCapture(r.capture);
      setSessionId(String(r.capture?.session?.id || sid));
      setMessage("");
      setNotice("메시지를 반영했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지 처리 실패");
    }
  };

  const analyze = async () => {
    if (!imageFile) {
      setError("이미지를 선택해 주세요.");
      return;
    }

    const sid = await ensureSession();
    if (!sid) return;

    setError("");
    try {
      const dataUrl = await readFileAsDataUrl(imageFile);
      const r = await analyzeVision({
        user_id: userId,
        session_id: sid,
        image_base64: dataUrl,
        text_hint: message.trim() || null,
        ui_lang: "ko",
        source_type: "vision",
        auto_apply_to_session: true,
        segmentation_mode: "auto"
      });
      if (r.capture) setCapture(r.capture);
      if ((r.detected_items || []).length > 0) {
        setVisionItems((r.detected_items || []).join(", "));
      }
      setNotice(`이미지 분석 완료: ${(r.detected_items || []).length}개`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 분석 실패");
    }
  };

  const finalize = async () => {
    const sid = sessionId.trim() || String(capture?.session?.id || "");
    if (!sid) {
      setError("세션을 먼저 시작해 주세요.");
      return;
    }

    setError("");
    try {
      const r = await finalizeCaptureSession(sid, {
        user_id: userId,
        purchased_at: todayIso(),
        storage_type: storageType
      });
      setCapture(r);
      setNotice("인벤토리로 확정했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 실패");
    }
  };

  const draftItems = capture?.session?.draft_items || [];

  return (
    <FraiPhoneFrame navKey="home">
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <div>
            <p>{mode === "talk" ? "Talk" : "Take photo"}</p>
            <h2>캡처</h2>
          </div>
        </section>

        <section className="frai-block">
          <div className="row two">
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session ID" />
            <button onClick={() => void start()}>Start</button>
          </div>
          <div className="row">
            <button onClick={() => void load()}>Load</button>
          </div>
        </section>

        <section className="frai-block">
          <h3>대화 입력</h3>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="예: 이거는 두부고 저거는 계란이에요"
          />
          <input
            value={visionItems}
            onChange={(e) => setVisionItems(e.target.value)}
            placeholder="Vision Items (comma separated)"
          />
          <div className="row">
            <button onClick={() => void send()}>Send message</button>
            <button onClick={() => void finalize()}>Finalize</button>
          </div>
        </section>

        <section className="frai-block">
          <h3>사진 분석</h3>
          <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          <div className="row two">
            <select value={storageType} onChange={(e) => setStorageType(e.target.value as StorageType)}>
              <option value="refrigerated">냉장</option>
              <option value="frozen">냉동</option>
              <option value="room">상온</option>
            </select>
            <button onClick={() => void analyze()}>Analyze image</button>
          </div>
        </section>

        {notice ? <div className="frai-ok">{notice}</div> : null}
        {error ? <div className="frai-error">{error}</div> : null}

        <section className="frai-block">
          <h3>Capture Draft</h3>
          {draftItems.length === 0 ? <p className="muted">드래프트가 비어 있습니다.</p> : null}
          <div className="frai-list">
            {draftItems.map((it, idx) => (
              <article key={`${it.ingredient_key}-${idx}`} className="frai-list-item">
                <div>
                  <strong>{it.ingredient_name || it.ingredient_key}</strong>
                  <span>
                    {Math.round(Number(it.quantity || 0))} {it.unit || "ea"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </FraiPhoneFrame>
  );
}
