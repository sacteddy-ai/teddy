const $ = (id) => document.getElementById(id);
let currentCaptureSessionId = "";
let liveCameraStream = null;
let liveCameraTimer = null;
let liveCameraInFlight = false;
let realtimePeer = null;
let realtimeDataChannel = null;
let realtimeMicStream = null;
let realtimeRemoteStream = null;
let realtimeUserTranscriptDelta = "";
let realtimeAssistantTranscriptDelta = "";
let realtimeLastSharedImageKey = "";
let realtimeLastSharedImageAt = 0;
let realtimeIngestChain = Promise.resolve();
let realtimeLastIngestedText = "";
let realtimeLastIngestedAt = 0;

const API_BASE_STORAGE_KEY = "teddy_api_base";
const LANG_STORAGE_KEY = "teddy_lang";
const CAPTURE_STORAGE_TYPE_KEY = "teddy_capture_storage_type";
const EASY_MODE_STORAGE_KEY = "teddy_easy_mode";
const INVENTORY_FILTER_STORAGE_KEY = "teddy_inventory_filter_storage";

let currentLang = "en";
let ingredientLabelsUserId = "";
let ingredientLabelsByKey = new Map();
let ingredientLabelsLoadPromise = null;
let ingredientLabelsLoadUserId = "";

let inventoryItemsCache = [];
let inventoryFilterStorage = "refrigerated";

const I18N = {
  en: {
    doc_title: "Teddy Fridge Dashboard",
    hero_eyebrow: "Teddy MVP",
    hero_title: "Fridge Control Board",
    hero_subtitle: "Track ingredients, expiration risk, recipe options, and shopping actions in one place.",
    label_user_id: "User ID",
    label_language: "Language",
    easy_mode_label: "Easy Mode",
    btn_refresh_all: "Refresh All",
    btn_reload_catalog: "Reload Catalog",
    remote_api_summary: "Remote API (optional)",
    label_api_base_url: "API Base URL",
    btn_save: "Save",
    btn_use_same_origin: "Use Same Origin",
    remote_api_help_html:
      "Use this when the dashboard is hosted separately (e.g. Cloudflare Pages) and the API runs elsewhere (e.g. Tunnel). Enable CORS on the API server with <code>ENABLE_CORS=1</code>.",
    capture_storage_help: "Applies when finalizing to inventory.",
    word_none: "none",
    stat_total: "Total",
    stat_fresh: "Fresh",
    stat_expiring_soon: "Expiring Soon",
    stat_expired: "Expired",
    add_item_title: "Add Inventory Item",
    label_ingredient: "Ingredient",
    ph_ingredient_example: "milk",
    label_purchased_date: "Purchased Date",
    label_storage_type: "Storage Type",
    storage_refrigerated: "refrigerated",
    storage_frozen: "frozen",
    storage_room: "room",
    label_quantity: "Quantity",
    label_unit: "Unit",
    label_ocr_raw_text: "OCR Raw Text (optional)",
    ph_ocr_example: "BEST BEFORE 2026-03-20",
    label_product_shelf_life_days: "Product Shelf-Life Days (optional)",
    btn_save_item: "Save Item",
    notification_runner_title: "Notification Runner",
    notification_runner_desc: "Send all due notifications up to now.",
    btn_run_due_notifications: "Run Due Notifications",
    conversational_capture_title: "Conversational Capture",
    btn_take_photo: "Take Photo",
    btn_quick_talk: "Talk",
    btn_stop_talk: "Stop Talking",
    quick_capture_hint: "Choose storage, then take a photo or talk. We'll add items automatically.",
    label_session_id: "Session ID",
    ph_start_session: "Start a session",
    btn_start_session: "Start Session",
    label_voice_text_message: "Voice/Text Message",
    ph_capture_message_example: "This is tofu. This is kimchi. This is bacon. This is egg.",
    label_vision_items: "Vision Items (comma separated, optional)",
    ph_vision_items_example: "tofu, kimchi",
    label_vision_image: "Vision Image (optional)",
    label_segmentation: "Segmentation",
    seg_auto: "auto (SAM3 if configured)",
    seg_none: "none (full image)",
    seg_sam3_http: "sam3_http (require endpoint)",
    btn_analyze_image: "Analyze Image",
    live_camera_summary: "Live Camera (experimental)",
    btn_start_camera: "Start Camera",
    btn_stop_camera: "Stop Camera",
    btn_capture_frame: "Capture Frame",
    label_facing: "Facing",
    facing_back: "back",
    facing_front: "front",
    label_auto_capture: "Auto Capture",
    auto_off: "off",
    realtime_summary: "Realtime Voice Agent (hybrid)",
    btn_start_voice: "Start Voice",
    btn_stop_voice: "Stop Voice",
    realtime_auto_ingest: "Auto-add my speech to draft",
    realtime_share_snapshots: "Share snapshots (images) to agent",
    label_send_text_optional: "Send Text (optional)",
    ph_realtime_text_example: "What can I cook with what you see?",
    btn_send_to_agent: "Send To Agent",
    btn_send_message: "Send Message",
    btn_finalize_to_inventory: "Finalize To Inventory",
    capture_draft_title: "Capture Draft",
    pending_confirmations_title: "Pending Confirmations (Session)",
    ingredient_review_queue_title: "Ingredient Review Queue",
    btn_reload: "Reload",
    review_queue_desc: "Unknown or low-confidence ingredients appear here. Confirm once and the parser learns it.",
    inventory_title: "Inventory",
    recipes_title: "Recipe Recommendations",
    shopping_title: "Shopping Suggestions",
    notifications_title: "Notifications",
    btn_consume_1: "Consume 1",
    btn_map_prefix: "Map:",
    btn_map_custom: "Map Custom",
    btn_ignore: "Ignore",
    label_ingredient_key: "ingredient_key",
    label_display_name_optional: "display name (optional)",
    err_missing_key_map: "ingredient_key is required to map this phrase.",
    unknown_phrase: "(unknown phrase)",
    review_meta_line: "reason: {reason} | seen: {seen}",
    empty_inventory: "No inventory items yet.",
    empty_recipes: "No recipe recommendations yet.",
    empty_shopping: "No shopping suggestions.",
    empty_notifications: "No notifications.",
    empty_capture_none: "Start a capture session.",
    empty_capture_no_session: "No active capture session.",
    empty_capture_draft: "Draft is empty.",
    empty_capture_review: "No pending confirmations in this session.",
    empty_review_queue: "No pending review items.",
    capture_error_need_text_or_vision: "Type a message or provide vision items.",
    err_no_capture_session: "No capture session to finalize.",
    capture_error_no_confirmed: "No confirmed ingredient yet. {count} phrase(s) need confirmation below.",
    capture_error_none_detected:
      "No ingredient was detected from this message. Add names explicitly or use Vision Items.",
    capture_error_need_confirmation: "{count} phrase(s) still need confirmation below.",
    vision_no_detected: "No ingredients were detected from this image.",
    camera_tip_https: "Tip: mobile camera preview usually requires HTTPS. Photo upload still works.",
    camera_idle: "Camera idle.",
    voice_idle: "Voice idle.",
    voice_starting: "Starting voice session...",
    voice_ready: "Ready. Speak now.",
    voice_connected: "Voice session connected.",
    voice_connection_state: "Voice connection: {state}",
    voice_listening: "Listening...",
    voice_heard: "Heard: {text}",
    voice_start_failed: "Voice start failed: {msg}",
    voice_stopped: "Voice session stopped.",
    voice_error_prefix: "Error: {msg}",
    voice_draft_updated: "Draft updated from speech.",
    voice_draft_update_failed: "Draft update failed: {msg}",
    meta_session_line: "Session {id} | status {status} | items {items} | total qty {qty}",
    meta_inventory_line: "{qty} {unit} | {storage} | exp {exp} | D{days}",
    meta_recipe_line: "{chef} | score {score} | match {match}%",
    meta_recipe_missing: "missing: {missing}",
    meta_shopping_reasons: "reasons: {reasons}",
    meta_shopping_related: "related recipes: {related}",
    meta_notification_item: "item: {id}",
    meta_notification_scheduled: "scheduled: {ts}",
    toast_run_due: "Sent {count} notification(s) at {ts}",
    toast_reload_catalog: "Reloaded {count} cache(s) at {ts}",
    badge_draft: "draft"
  },
  ko: {
    doc_title: "Teddy 냉장고 대시보드",
    hero_eyebrow: "Teddy MVP",
    hero_title: "냉장고 컨트롤 보드",
    hero_subtitle: "식재료, 유통기한, 레시피, 장보기까지 한 화면에서 관리하세요.",
    label_user_id: "User ID",
    label_language: "언어",
    easy_mode_label: "쉬운 모드",
    btn_refresh_all: "전체 새로고침",
    btn_reload_catalog: "카탈로그 새로고침",
    remote_api_summary: "원격 API (선택)",
    label_api_base_url: "API Base URL",
    btn_save: "저장",
    btn_use_same_origin: "같은 도메인 사용",
    remote_api_help_html:
      "대시보드는 Pages에, API는 다른 곳(예: 터널)에 띄웠을 때 사용하세요. API 서버에서 CORS를 <code>ENABLE_CORS=1</code> 로 켜야 합니다.",
    capture_storage_help: "인벤토리로 확정할 때 이 보관 방식으로 저장됩니다.",
    word_none: "없음",
    stat_total: "전체",
    stat_fresh: "신선",
    stat_expiring_soon: "임박",
    stat_expired: "만료",
    add_item_title: "인벤토리 항목 추가",
    label_ingredient: "식재료",
    ph_ingredient_example: "우유",
    label_purchased_date: "구매일",
    label_storage_type: "보관 방식",
    storage_refrigerated: "냉장",
    storage_frozen: "냉동",
    storage_room: "상온",
    label_quantity: "수량",
    label_unit: "단위",
    label_ocr_raw_text: "OCR 원문 (선택)",
    ph_ocr_example: "유통기한 2026-03-20",
    label_product_shelf_life_days: "제품 유통기한(일) (선택)",
    btn_save_item: "저장",
    notification_runner_title: "알림 실행",
    notification_runner_desc: "지금까지 도착해야 할 알림을 모두 발송합니다.",
    btn_run_due_notifications: "알림 실행",
    conversational_capture_title: "대화형 캡처",
    btn_take_photo: "사진 찍기",
    btn_quick_talk: "말하기",
    btn_stop_talk: "말하기 중지",
    quick_capture_hint: "보관 방식을 고르고, 사진을 찍거나 말해보세요. 자동으로 추가해요.",
    label_session_id: "세션 ID",
    ph_start_session: "세션 시작",
    btn_start_session: "세션 시작",
    label_voice_text_message: "음성/텍스트 메시지",
    ph_capture_message_example: "왼쪽은 두부, 그 옆은 계란, 아래칸에는 피클과 오이가 있어.",
    label_vision_items: "비전 아이템(쉼표 구분, 선택)",
    ph_vision_items_example: "두부, 김치",
    label_vision_image: "이미지(선택)",
    label_segmentation: "세그멘테이션",
    seg_auto: "자동 (설정 시 SAM3 사용)",
    seg_none: "없음 (전체 이미지)",
    seg_sam3_http: "sam3_http (엔드포인트 필요)",
    btn_analyze_image: "이미지 분석",
    live_camera_summary: "라이브 카메라 (실험)",
    btn_start_camera: "카메라 시작",
    btn_stop_camera: "카메라 중지",
    btn_capture_frame: "프레임 캡처",
    label_facing: "카메라",
    facing_back: "후면",
    facing_front: "전면",
    label_auto_capture: "자동 캡처",
    auto_off: "끔",
    realtime_summary: "Realtime 음성 에이전트 (하이브리드)",
    btn_start_voice: "음성 시작",
    btn_stop_voice: "음성 중지",
    realtime_auto_ingest: "내 음성을 자동으로 드래프트에 추가",
    realtime_share_snapshots: "스냅샷(이미지)도 에이전트에게 공유",
    label_send_text_optional: "텍스트 보내기 (선택)",
    ph_realtime_text_example: "지금 있는 재료로 뭘 만들 수 있어?",
    btn_send_to_agent: "에이전트에게 전송",
    btn_send_message: "메시지 보내기",
    btn_finalize_to_inventory: "인벤토리로 확정",
    capture_draft_title: "캡처 드래프트",
    pending_confirmations_title: "확인 필요 (세션)",
    ingredient_review_queue_title: "식재료 확인 큐",
    btn_reload: "새로고침",
    review_queue_desc: "모르겠거나 확신이 낮은 단어가 여기에 뜹니다. 한 번만 매핑하면 파서가 학습합니다.",
    inventory_title: "인벤토리",
    recipes_title: "레시피 추천",
    shopping_title: "장보기 추천",
    notifications_title: "알림",
    btn_consume_1: "1개 소비",
    btn_map_prefix: "매핑:",
    btn_map_custom: "직접 매핑",
    btn_ignore: "무시",
    label_ingredient_key: "식자재 키",
    label_display_name_optional: "표시 이름(선택)",
    err_missing_key_map: "이 문장을 매핑하려면 ingredient_key가 필요합니다.",
    unknown_phrase: "(알 수 없는 문구)",
    review_meta_line: "사유: {reason} | 횟수: {seen}",
    empty_inventory: "아직 인벤토리 항목이 없습니다.",
    empty_recipes: "레시피 추천이 없습니다.",
    empty_shopping: "장보기 추천이 없습니다.",
    empty_notifications: "알림이 없습니다.",
    empty_capture_none: "캡처 세션을 시작하세요.",
    empty_capture_no_session: "활성 캡처 세션이 없습니다.",
    empty_capture_draft: "드래프트가 비어있습니다.",
    empty_capture_review: "이 세션에 확인할 항목이 없습니다.",
    empty_review_queue: "확인할 항목이 없습니다.",
    capture_error_need_text_or_vision: "메시지를 입력하거나 비전 아이템을 넣어주세요.",
    err_no_capture_session: "확정할 캡처 세션이 없습니다.",
    capture_error_no_confirmed: "아직 확정된 식재료가 없어요. 아래에서 {count}개를 확인해주세요.",
    capture_error_none_detected: "이 메시지에서 식재료를 찾지 못했어요. 이름을 더 명확히 쓰거나 비전을 사용해보세요.",
    capture_error_need_confirmation: "아래에서 {count}개를 더 확인해야 합니다.",
    vision_no_detected: "이 이미지에서 식재료를 찾지 못했어요.",
    camera_tip_https: "팁: 휴대폰에서 카메라 미리보기는 보통 HTTPS가 필요합니다. 사진 업로드는 동작합니다.",
    camera_idle: "카메라 대기 중.",
    voice_idle: "음성 대기 중.",
    voice_starting: "음성 연결 중...",
    voice_ready: "준비 됨. 말해보세요.",
    voice_connected: "음성 연결됨.",
    voice_connection_state: "음성 연결 상태: {state}",
    voice_listening: "듣는 중...",
    voice_heard: "인식: {text}",
    voice_start_failed: "음성 시작 실패: {msg}",
    voice_stopped: "음성 세션 종료됨.",
    voice_error_prefix: "오류: {msg}",
    voice_draft_updated: "말한 내용을 드래프트에 반영했어요.",
    voice_draft_update_failed: "드래프트 반영 실패: {msg}",
    meta_session_line: "세션 {id} | 상태 {status} | 아이템 {items} | 총 수량 {qty}",
    meta_inventory_line: "{qty}{unit} | {storage} | 유통기한 {exp} | D{days}",
    meta_recipe_line: "{chef} | 점수 {score} | 매칭 {match}%",
    meta_recipe_missing: "부족: {missing}",
    meta_shopping_reasons: "이유: {reasons}",
    meta_shopping_related: "연관 레시피: {related}",
    meta_notification_item: "아이템: {id}",
    meta_notification_scheduled: "예약: {ts}",
    toast_run_due: "알림 {count}건 발송 완료 ({ts})",
    toast_reload_catalog: "캐시 {count}개 새로고침 완료 ({ts})",
    badge_draft: "드래프트"
  }
};

const STATUS_LABELS = {
  en: {
    fresh: "fresh",
    expiring_soon: "expiring",
    expired: "expired",
    draft: "draft",
    pending: "pending",
    ignored: "ignored",
    resolved: "resolved"
  },
  ko: {
    fresh: "신선",
    expiring_soon: "임박",
    expired: "만료",
    draft: "드래프트",
    pending: "대기",
    ignored: "무시",
    resolved: "완료"
  }
};

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  if (raw === "ko" || raw.startsWith("ko-")) {
    return "ko";
  }
  return "en";
}

function detectDefaultLang() {
  const usp = new URLSearchParams(location.search);
  const fromQuery = normalizeLang(usp.get("lang") || usp.get("locale") || "");
  if (fromQuery) {
    return fromQuery;
  }

  const stored = normalizeLang(localStorage.getItem(LANG_STORAGE_KEY) || "");
  if (stored) {
    return stored;
  }

  const nav = normalizeLang(navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : ""));
  return nav || "en";
}

function detectDefaultEasyMode() {
  const usp = new URLSearchParams(location.search);
  const raw = String(usp.get("easy") || usp.get("simple") || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on") {
    return true;
  }

  const stored = String(localStorage.getItem(EASY_MODE_STORAGE_KEY) || "").trim().toLowerCase();
  if (stored === "0" || stored === "false" || stored === "off") {
    return false;
  }
  if (stored === "1" || stored === "true" || stored === "on") {
    return true;
  }

  return true;
}

function isEasyMode() {
  return document.body.classList.contains("easy");
}

function setEasyMode(enabled) {
  const next = Boolean(enabled);
  document.body.classList.toggle("easy", next);
  localStorage.setItem(EASY_MODE_STORAGE_KEY, next ? "true" : "false");
  const el = $("easyModeToggle");
  if (el) {
    el.checked = next;
  }
  syncCaptureStorageButtonsUI();
  syncInventoryTabsUI();
  updateQuickTalkButton();
}

function t(key) {
  const lang = currentLang || "en";
  return I18N[lang]?.[key] ?? I18N.en[key] ?? String(key);
}

function tf(key, vars = {}) {
  let msg = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    msg = msg.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  });
  return msg;
}

function setLang(lang) {
  const normalized = normalizeLang(lang) || "en";
  currentLang = normalized;
  localStorage.setItem(LANG_STORAGE_KEY, normalized);
  const el = $("languageSelect");
  if (el) {
    el.value = normalized;
  }
  applyI18n();
  syncCaptureStorageButtonsUI();
  syncInventoryTabsUI();
  updateQuickTalkButton();
}

function applyI18n() {
  document.documentElement.lang = currentLang || "en";
  document.title = t("doc_title");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
}

function statusLabel(status) {
  const key = String(status || "").trim().toLowerCase() || "unknown";
  return STATUS_LABELS[currentLang]?.[key] ?? STATUS_LABELS.en[key] ?? key;
}

function storageLabel(storageType) {
  const key = String(storageType || "").trim().toLowerCase();
  if (key === "refrigerated") {
    return t("storage_refrigerated");
  }
  if (key === "frozen") {
    return t("storage_frozen");
  }
  if (key === "room") {
    return t("storage_room");
  }
  return key || "";
}

function hasHangul(value) {
  return /[\uAC00-\uD7A3]/.test(String(value || ""));
}

function pickKoreanAlias(aliases) {
  const list = Array.isArray(aliases) ? aliases : [];
  const hangul = list
    .map((v) => String(v || "").trim())
    .filter((v) => v && hasHangul(v));
  if (hangul.length === 0) {
    return null;
  }
  hangul.sort((a, b) => a.length - b.length);
  return hangul[0];
}

function normalizeIngredientKeyLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadIngredientLabels(force = false) {
  const userId = getUserId();
  const needsReload = force || ingredientLabelsUserId !== userId || ingredientLabelsByKey.size === 0;
  if (!needsReload) {
    return;
  }

  if (!force && ingredientLabelsLoadPromise && ingredientLabelsLoadUserId === userId) {
    await ingredientLabelsLoadPromise;
    return;
  }

  ingredientLabelsLoadUserId = userId;
  const promise = (async () => {
    const q = encodeQuery({ user_id: userId, top_n: 500 });
    const result = await request(`/api/v1/ingredients/catalog?${q}`, { method: "GET" });
    const entries = Array.isArray(result?.data?.items) ? result.data.items : [];
    const next = new Map();

    entries.forEach((entry) => {
      const k = normalizeIngredientKeyLoose(entry?.ingredient_key || "");
      if (!k) {
        return;
      }
      const displayName = String(entry?.display_name || entry?.ingredient_key || "").trim();
      const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
      const nameKo = hasHangul(displayName) ? displayName : pickKoreanAlias(aliases) || displayName;
      next.set(k, {
        en: displayName || k,
        ko: nameKo || displayName || k
      });
    });

    ingredientLabelsUserId = userId;
    ingredientLabelsByKey = next;
  })();

  ingredientLabelsLoadPromise = promise;
  try {
    await promise;
  } finally {
    if (ingredientLabelsLoadPromise === promise) {
      ingredientLabelsLoadPromise = null;
    }
  }
}

function ingredientLabel(ingredientKey, fallback = "") {
  const k = normalizeIngredientKeyLoose(ingredientKey || "");
  const entry = k ? ingredientLabelsByKey.get(k) : null;
  if (entry) {
    return currentLang === "ko" ? entry.ko : entry.en;
  }

  const rawFallback = String(fallback || "").trim();
  if (rawFallback) {
    return rawFallback;
  }
  return ingredientKey || "";
}

function normalizeApiBase(value) {
  if (!value) {
    return "";
  }
  return String(value).trim().replace(/\/+$/, "");
}

function initApiBaseFromQuery() {
  const usp = new URLSearchParams(location.search);
  const raw = usp.get("api_base") || usp.get("apiBase") || usp.get("api");
  if (!raw) {
    return;
  }
  const normalized = normalizeApiBase(raw);
  if (!normalized) {
    return;
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
}

function getApiBase() {
  return normalizeApiBase(localStorage.getItem(API_BASE_STORAGE_KEY) || "");
}

function setApiBase(value) {
  const normalized = normalizeApiBase(value);
  if (!normalized) {
    localStorage.removeItem(API_BASE_STORAGE_KEY);
    return "";
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  return normalized;
}

function clearApiBase() {
  localStorage.removeItem(API_BASE_STORAGE_KEY);
}

function apiUrl(path) {
  const base = getApiBase();
  if (!base) {
    return path;
  }
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

function setGlobalError(message) {
  const el = $("globalError");
  if (!el) {
    return;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setCaptureError(message) {
  const el = $("captureError");
  if (!el) {
    return;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setVisionAnalyzeMeta(message) {
  const el = $("visionAnalyzeMeta");
  if (!el) {
    return;
  }
  el.textContent = message || "";
}

function setCameraStatus(message) {
  const el = $("cameraStatus");
  if (!el) {
    return;
  }
  el.textContent = message || "";
}

function setRealtimeStatus(message) {
  const msg = message || "";
  const el = $("realtimeStatus");
  if (el) {
    el.textContent = msg;
  }
  const quick = $("quickTalkStatus");
  if (quick) {
    quick.textContent = msg;
  }
}

function updateQuickTalkButton() {
  const btn = $("quickTalkBtn");
  if (!btn) {
    return;
  }
  const running = isRealtimeConnected();
  btn.textContent = running ? t("btn_stop_talk") : t("btn_quick_talk");
  btn.setAttribute("aria-pressed", running ? "true" : "false");
}

function appendRealtimeLogLine(prefix, message) {
  const host = $("realtimeLog");
  if (!host) {
    return;
  }
  const ts = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "line";
  line.textContent = `[${ts}] ${prefix}: ${message}`;
  host.appendChild(line);
  host.scrollTop = host.scrollHeight;
}

function clearRealtimeLog() {
  const host = $("realtimeLog");
  if (host) {
    host.innerHTML = "";
  }
}

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function encodeQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") {
      return;
    }
    usp.set(k, String(v));
  });
  return usp.toString();
}

async function request(path, options = {}) {
  const init = { ...options };
  init.headers = {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
    ...(options.headers || {})
  };

  const res = await fetch(apiUrl(path), init);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

async function sendCaptureMessagePayload(payload) {
  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const text = (payload?.text || "").trim();
  const visionItems = Array.isArray(payload?.vision_detected_items) ? payload.vision_detected_items : [];
  if (!text && visionItems.length === 0) {
    throw new Error(t("capture_error_need_text_or_vision"));
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      source_type: payload?.source_type || "text",
      text,
      vision_detected_items: visionItems
    })
  });

  renderCaptureDraft(result.data.capture);
  const parsedCommandCount = result?.data?.turn?.parsed_command_count ?? 0;
  const reviewQueueCount =
    result?.data?.review_queue_count ??
    result?.data?.turn?.review_queue_item_count ??
    result?.data?.capture?.review_queue_count ??
    0;

  if (parsedCommandCount === 0 && reviewQueueCount > 0) {
    setCaptureError(tf("capture_error_no_confirmed", { count: reviewQueueCount }));
  } else if (parsedCommandCount === 0) {
    setCaptureError(t("capture_error_none_detected"));
  } else if (reviewQueueCount > 0) {
    setCaptureError(tf("capture_error_need_confirmation", { count: reviewQueueCount }));
  } else {
    setCaptureError("");
  }

  await loadReviewQueue();
  return result;
}

function getUserId() {
  return $("userId").value.trim() || "demo-user";
}

function normalizeStorageType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "refrigerated" || raw === "frozen" || raw === "room") {
    return raw;
  }
  return "refrigerated";
}

function getCaptureStorageType() {
  const el = $("captureStorageType");
  return normalizeStorageType(el ? el.value : "");
}

function setCaptureStorageType(value) {
  const el = $("captureStorageType");
  if (!el) {
    return;
  }
  el.value = normalizeStorageType(value);
}

function applyCaptureStorageType(value, options = {}) {
  const storageType = normalizeStorageType(value);
  setCaptureStorageType(storageType);
  if (options?.persist !== false) {
    localStorage.setItem(CAPTURE_STORAGE_TYPE_KEY, storageType);
  }
  if (options?.syncInventory !== false) {
    setInventoryFilterStorage(storageType, { persist: true });
  }
  syncCaptureStorageButtonsUI();
}

function syncCaptureStorageButtonsUI() {
  const host = $("captureStorageButtons");
  if (!host) {
    return;
  }
  const active = getCaptureStorageType();
  host.querySelectorAll(".seg-btn").forEach((btn) => {
    const st = normalizeStorageType(btn?.dataset?.storage || "");
    btn.classList.toggle("active", st === active);
  });
}

function parseCsvItems(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function setCaptureSessionId(sessionId) {
  currentCaptureSessionId = sessionId || "";
  const el = $("captureSessionId");
  if (el) {
    el.value = currentCaptureSessionId;
  }
}

function getCaptureSessionId() {
  const inputValue = ($("captureSessionId")?.value || "").trim();
  if (inputValue) {
    currentCaptureSessionId = inputValue;
  }
  return currentCaptureSessionId;
}

function statusBadge(status) {
  const span = document.createElement("span");
  span.className = `badge ${status}`;
  span.textContent = statusLabel(status);
  return span;
}

function emptyNode(message) {
  const div = document.createElement("div");
  div.className = "empty";
  div.textContent = message;
  return div;
}

async function resolveReviewQueueItem(queueItemId, payload = {}) {
  return request(`/api/v1/ingredients/review-queue/${queueItemId}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      apply_to_session: true,
      ...payload
    })
  });
}

function buildReviewQueueNode(item) {
  const node = document.createElement("div");
  node.className = "item";

  const main = document.createElement("div");
  main.className = "item-main";

  const rawPhrase = item?.phrase ? String(item.phrase).trim() : "";
  const phrase = rawPhrase || t("unknown_phrase");
  const candidateOptions = Array.isArray(item.candidate_options) ? item.candidate_options : [];

  const name = document.createElement("strong");
  name.className = "name";
  name.textContent = phrase;
  main.appendChild(name);

  if (isEasyMode()) {
    const actions = document.createElement("div");
    actions.className = "review-actions easy";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn big full";
    saveBtn.textContent = t("btn_save");
    saveBtn.addEventListener("click", async () => {
      if (!rawPhrase) {
        setGlobalError(t("unknown_phrase"));
        return;
      }

      saveBtn.disabled = true;
      try {
        const best = candidateOptions.length > 0 ? candidateOptions[0] : null;
        const ingredientKey = best?.ingredient_key
          ? String(best.ingredient_key).trim()
          : normalizeIngredientKeyLoose(rawPhrase);
        const displayName = best?.ingredient_key
          ? ingredientLabel(best.ingredient_key, best.ingredient_name)
          : rawPhrase;

        await resolveReviewQueueItem(item.id, {
          action: "map",
          ingredient_key: ingredientKey,
          display_name: displayName || null
        });
        setCaptureError("");
        await refreshAll();
      } catch (err) {
        setGlobalError(err.message);
        setCaptureError(err.message);
      } finally {
        saveBtn.disabled = false;
      }
    });

    const ignoreBtn = document.createElement("button");
    ignoreBtn.type = "button";
    ignoreBtn.className = "btn big warn full";
    ignoreBtn.textContent = t("btn_ignore");
    ignoreBtn.addEventListener("click", async () => {
      ignoreBtn.disabled = true;
      try {
        await resolveReviewQueueItem(item.id, { action: "ignore", apply_to_session: false });
        setCaptureError("");
        await refreshAll();
      } catch (err) {
        setGlobalError(err.message);
        setCaptureError(err.message);
      } finally {
        ignoreBtn.disabled = false;
      }
    });

    actions.appendChild(saveBtn);
    actions.appendChild(ignoreBtn);
    main.appendChild(actions);

    const side = document.createElement("div");
    side.className = "item-side";
    side.appendChild(statusBadge("expiring_soon"));

    node.appendChild(main);
    node.appendChild(side);
    return node;
  }

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = tf("review_meta_line", {
    reason: item.reason || "unknown",
    seen: item.seen_count ?? 1
  });
  main.appendChild(meta);

  if (candidateOptions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "review-actions";
    candidateOptions.slice(0, 4).forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn tiny secondary";
      const score = Number(option.score || 0);
      const optionLabel = ingredientLabel(option.ingredient_key, option.ingredient_name);
      btn.textContent = `${t("btn_map_prefix")} ${optionLabel} (${Math.round(score * 100)}%)`;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await resolveReviewQueueItem(item.id, {
            action: "map",
            ingredient_key: option.ingredient_key,
            display_name: optionLabel
          });
          setCaptureError("");
          await refreshAll();
        } catch (err) {
          setGlobalError(err.message);
          setCaptureError(err.message);
        } finally {
          btn.disabled = false;
        }
      });
      actions.appendChild(btn);
    });
    main.appendChild(actions);
  }

  const custom = document.createElement("div");
  custom.className = "review-custom";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = t("label_ingredient_key");
  if (candidateOptions.length > 0 && candidateOptions[0]?.ingredient_key) {
    keyInput.value = candidateOptions[0].ingredient_key;
  }

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = t("label_display_name_optional");

  const mapBtn = document.createElement("button");
  mapBtn.type = "button";
  mapBtn.className = "btn tiny";
  mapBtn.textContent = t("btn_map_custom");
  mapBtn.addEventListener("click", async () => {
    const ingredientKey = keyInput.value.trim();
    if (!ingredientKey) {
      setGlobalError(t("err_missing_key_map"));
      return;
    }

    mapBtn.disabled = true;
    try {
      await resolveReviewQueueItem(item.id, {
        action: "map",
        ingredient_key: ingredientKey,
        display_name: nameInput.value.trim() || null
      });
      setCaptureError("");
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
      setCaptureError(err.message);
    } finally {
      mapBtn.disabled = false;
    }
  });

  const ignoreBtn = document.createElement("button");
  ignoreBtn.type = "button";
  ignoreBtn.className = "btn tiny warn";
  ignoreBtn.textContent = t("btn_ignore");
  ignoreBtn.addEventListener("click", async () => {
    ignoreBtn.disabled = true;
    try {
      await resolveReviewQueueItem(item.id, { action: "ignore", apply_to_session: false });
      setCaptureError("");
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
      setCaptureError(err.message);
    } finally {
      ignoreBtn.disabled = false;
    }
  });

  custom.appendChild(keyInput);
  custom.appendChild(nameInput);
  custom.appendChild(mapBtn);
  custom.appendChild(ignoreBtn);
  main.appendChild(custom);

  const side = document.createElement("div");
  side.className = "item-side";
  side.appendChild(statusBadge("expiring_soon"));

  node.appendChild(main);
  node.appendChild(side);
  return node;
}

function renderReviewQueueList(hostId, items, emptyMessage) {
  const list = $(hostId);
  if (!list) {
    return;
  }

  list.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    list.appendChild(emptyNode(emptyMessage));
    return;
  }

  items.forEach((item) => {
    list.appendChild(buildReviewQueueNode(item));
  });
}

function renderStats(summary) {
  $("statTotal").textContent = summary.total_items ?? 0;
  $("statFresh").textContent = summary.fresh ?? 0;
  $("statExpiring").textContent = summary.expiring_soon ?? 0;
  $("statExpired").textContent = summary.expired ?? 0;
}

function renderCaptureDraft(capture) {
  const list = $("captureDraftList");
  const meta = $("captureMeta");
  if (!list || !meta) {
    return;
  }

  list.innerHTML = "";
  if (!capture || !capture.session) {
    meta.textContent = t("empty_capture_no_session");
    list.appendChild(emptyNode(t("empty_capture_none")));
    renderReviewQueueList("captureReviewList", [], t("empty_capture_review"));
    return;
  }

  const session = capture.session;
  const summary = capture.summary || {};
  meta.textContent = tf("meta_session_line", {
    id: session.id,
    status: session.status,
    items: summary.item_count ?? 0,
    qty: summary.total_quantity ?? 0
  });

  const items = session.draft_items || [];
  if (items.length === 0) {
    list.appendChild(emptyNode(t("empty_capture_draft")));
  } else {
    items.forEach((item) => {
      const displayName = ingredientLabel(item.ingredient_key, item.ingredient_name);
      const metaLine = isEasyMode()
        ? `${item.quantity} ${item.unit}`
        : `${item.quantity} ${item.unit} | key ${item.ingredient_key}`;
      const node = document.createElement("div");
      node.className = "item";
      node.innerHTML = `
        <div class="item-main">
          <strong class="name">${displayName}</strong>
          <span class="meta">${metaLine}</span>
        </div>
        <div class="item-side">
          <span class="badge fresh">${t("badge_draft")}</span>
        </div>
      `;
      list.appendChild(node);
    });
  }

  const reviewQueueItems = capture.review_queue_items || [];
  renderReviewQueueList(
    "captureReviewList",
    reviewQueueItems,
    t("empty_capture_review")
  );
}

async function startCaptureSession() {
  const result = await request("/api/v1/capture/sessions/start", {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId()
    })
  });

  setCaptureSessionId(result.data.session.id);
  renderCaptureDraft(result.data);
  setCaptureError("");
  setVisionAnalyzeMeta("");
}

async function loadCaptureSession() {
  await loadIngredientLabels();
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    renderCaptureDraft(null);
    setCaptureError("");
    return;
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}`, { method: "GET" });
  renderCaptureDraft(result.data);
}

async function loadReviewQueue() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, status: "pending", limit: 80 });
  const result = await request(`/api/v1/ingredients/review-queue?${q}`, { method: "GET" });
  renderReviewQueueList("reviewQueueList", result?.data?.items || [], t("empty_review_queue"));
}

async function sendCaptureMessage() {
  const text = ($("captureMessageInput")?.value || "").trim();
  const visionItems = parseCsvItems(($("captureVisionItemsInput")?.value || "").trim());

  await sendCaptureMessagePayload({
    source_type: "text",
    text,
    vision_detected_items: visionItems
  });
  $("captureMessageInput").value = "";
  $("captureVisionItemsInput").value = "";
}

function getSegmentationMode() {
  return ($("captureSegmentationMode")?.value || "auto").trim().toLowerCase();
}

async function analyzeVisionDataUrl(imageDataUrl, options = {}) {
  const {
    textHint = null,
    segmentationMode = null,
    refreshMode = "light",
    realtimeAutoRespond = false,
    realtimePrompt = null
  } = options || {};
  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const result = await request("/api/v1/vision/analyze", {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      session_id: sessionId,
      image_base64: imageDataUrl,
      text_hint: (textHint || ($("captureMessageInput")?.value || "").trim()) || null,
      source_type: "vision",
      auto_apply_to_session: true,
      segmentation_mode: segmentationMode || getSegmentationMode()
    })
  });

  const detectedItems = result?.data?.detected_items || [];
  if (detectedItems.length > 0) {
    $("captureVisionItemsInput").value = detectedItems.join(", ");
  }

  const capture = result?.data?.capture || null;
  if (capture) {
    renderCaptureDraft(capture);
  }

  const segmentation = result?.data?.vision?.segmentation || {};
  const provider = segmentation.provider || "none";
  const segmentCount = segmentation.segment_count ?? 0;
  const warnings = Array.isArray(segmentation.warnings) ? segmentation.warnings.filter(Boolean) : [];
  let metaMessage = `Detected ${detectedItems.length} item(s) | segmentation ${provider} (${segmentCount} segment(s))`;
  if (warnings.length > 0) {
    metaMessage += ` | ${warnings.join(" | ")}`;
  }
  setVisionAnalyzeMeta(metaMessage);
  maybeShareVisionImageToRealtime(imageDataUrl, {
    textHint,
    prompt: realtimePrompt,
    autoRespond: Boolean(realtimeAutoRespond)
  });

  const reviewQueueCount = result?.data?.review_queue_count ?? 0;
  if (detectedItems.length === 0) {
    setCaptureError(result?.data?.message || t("vision_no_detected"));
  } else if (reviewQueueCount > 0) {
    setCaptureError(tf("capture_error_need_confirmation", { count: reviewQueueCount }));
  } else {
    setCaptureError("");
  }

  if (refreshMode === "full") {
    await refreshAll();
  } else {
    await loadReviewQueue();
  }
  return result;
}

function downscaleImageDataUrl(imageDataUrl, options = {}) {
  const { maxSize = 1024, quality = 0.85 } = options || {};
  const raw = String(imageDataUrl || "").trim();
  if (!raw.startsWith("data:image/")) {
    return Promise.resolve(raw);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Number(img.naturalWidth || img.width || 0);
      const h = Number(img.naturalHeight || img.height || 0);
      if (!w || !h) {
        resolve(raw);
        return;
      }

      const maxDim = Math.max(w, h);
      const scale = maxDim > maxSize ? maxSize / maxDim : 1;
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(raw);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

async function analyzeVisionImage() {
  const imageInput = $("captureVisionImageInput");
  const imageFile = imageInput?.files?.[0];
  if (!imageFile) {
    throw new Error("Select an image to analyze.");
  }

  const imageDataUrl = await readFileAsDataUrl(imageFile);
  const resized = await downscaleImageDataUrl(imageDataUrl, { maxSize: 1024, quality: 0.85 });
  await analyzeVisionDataUrl(resized, {
    refreshMode: "light",
    realtimeAutoRespond: true,
    realtimePrompt: "이 이미지에서 보이는 식자재를 간단히 말해줘."
  });
}

function captureVideoFrameAsDataUrl(videoEl, options = {}) {
  const { maxSize = 960, quality = 0.85 } = options || {};
  const w = Number(videoEl?.videoWidth || 0);
  const h = Number(videoEl?.videoHeight || 0);
  if (!w || !h) {
    throw new Error("Camera is not ready yet.");
  }

  const maxDim = Math.max(w, h);
  const scale = maxDim > maxSize ? maxSize / maxDim : 1;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  ctx.drawImage(videoEl, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", quality);
}

function stopLiveCameraAutoCapture() {
  if (liveCameraTimer) {
    clearInterval(liveCameraTimer);
    liveCameraTimer = null;
  }
}

function stopLiveCamera() {
  stopLiveCameraAutoCapture();
  liveCameraInFlight = false;

  const video = $("liveCameraVideo");
  if (video) {
    video.srcObject = null;
  }

  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach((t) => t.stop());
    liveCameraStream = null;
  }

  setCameraStatus("Camera stopped.");
}

async function startLiveCamera() {
  const video = $("liveCameraVideo");
  if (!video) {
    throw new Error("Live camera UI not found.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is not supported in this browser.");
  }
  if (liveCameraStream) {
    setCameraStatus("Camera is already running.");
    return;
  }

  const facing = ($("cameraFacingMode")?.value || "environment").trim();
  const preferred = {
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };

  try {
    try {
      liveCameraStream = await navigator.mediaDevices.getUserMedia(preferred);
    } catch {
      // Fallback if facingMode constraints are not supported.
      liveCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  } catch (err) {
    const errName = err?.name || "camera_error";
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw new Error(
        `Camera access was blocked. Mobile browsers usually require HTTPS. Use photo upload or an HTTPS tunnel (e.g. ngrok). (${errName})`
      );
    }
    throw new Error(`Camera access failed. Check permissions and camera availability. (${errName})`);
  }

  video.srcObject = liveCameraStream;
  try {
    await video.play();
  } catch {
    // ignore autoplay quirks; video element will still show once user interacts
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setCameraStatus("Camera is running, but note: mobile browsers often require HTTPS for camera access.");
  } else {
    setCameraStatus("Camera running.");
  }
}

function getLiveCameraAutoIntervalMs() {
  const raw = Number($("cameraAutoInterval")?.value || 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1000, Math.round(raw));
}

async function updateLiveCameraAutoCapture() {
  stopLiveCameraAutoCapture();
  const intervalMs = getLiveCameraAutoIntervalMs();
  if (!intervalMs) {
    return;
  }

  if (!liveCameraStream) {
    await startLiveCamera();
  }

  liveCameraTimer = setInterval(async () => {
    if (document.hidden) {
      return;
    }
    if (liveCameraInFlight) {
      return;
    }
    try {
      await captureLiveCameraFrame({ isAuto: true });
    } catch {
      // captureLiveCameraFrame will update UI errors
    }
  }, intervalMs);

  setCameraStatus(`Auto capture enabled (${intervalMs}ms interval).`);
}

async function captureLiveCameraFrame(options = {}) {
  const { isAuto = false } = options || {};
  const video = $("liveCameraVideo");
  if (!video || !liveCameraStream) {
    throw new Error("Camera is not running.");
  }
  if (liveCameraInFlight) {
    if (isAuto) {
      return;
    }
    throw new Error("Vision analysis is already running.");
  }

  liveCameraInFlight = true;
  try {
    const dataUrl = captureVideoFrameAsDataUrl(video, { maxSize: 960, quality: 0.85 });
    await analyzeVisionDataUrl(dataUrl, {
      refreshMode: "light",
      realtimeAutoRespond: !isAuto,
      realtimePrompt: isAuto ? null : "이 이미지에서 보이는 식자재를 간단히 말해줘."
    });
  } catch (err) {
    const msg = err?.message || "Vision analysis failed.";
    setCaptureError(msg);
    setGlobalError(msg);
    if (isAuto && /insufficient_quota|HTTP 429|Too Many Requests/i.test(msg)) {
      const intervalSelect = $("cameraAutoInterval");
      if (intervalSelect) {
        intervalSelect.value = "0";
      }
      stopLiveCameraAutoCapture();
      setCameraStatus("Auto capture stopped due to API quota/rate limit error.");
    }
    throw err;
  } finally {
    liveCameraInFlight = false;
  }
}

function normalizeSharedImageKey(imageDataUrl) {
  const raw = String(imageDataUrl || "").trim();
  if (!raw.startsWith("data:image/")) {
    return "";
  }
  // Avoid hashing the full payload; just use a stable head/tail + length.
  const head = raw.slice(0, 48);
  const tail = raw.slice(-160);
  return `${raw.length}:${head}:${tail}`;
}

function isRealtimeConnected() {
  return Boolean(realtimeDataChannel && realtimeDataChannel.readyState === "open" && realtimePeer);
}

function realtimeSendEvent(evt) {
  if (!isRealtimeConnected()) {
    throw new Error("Realtime voice session is not connected.");
  }
  realtimeDataChannel.send(JSON.stringify(evt));
}

function maybeShareVisionImageToRealtime(imageDataUrl, options = {}) {
  try {
    if (!isRealtimeConnected()) {
      return;
    }
    if ($("realtimeShareVision") && !$("realtimeShareVision").checked) {
      return;
    }

    const rawImage = String(imageDataUrl || "").trim();
    if (!rawImage.startsWith("data:image/")) {
      return;
    }

    const key = normalizeSharedImageKey(rawImage);
    if (!key) {
      return;
    }

    const now = Date.now();
    // De-dupe and avoid spamming the agent during auto-capture loops.
    if (key === realtimeLastSharedImageKey && now - realtimeLastSharedImageAt < 20000) {
      return;
    }
    if (now - realtimeLastSharedImageAt < 3000) {
      return;
    }

    realtimeLastSharedImageKey = key;
    realtimeLastSharedImageAt = now;

    const hint = options?.textHint ? String(options.textHint).trim() : "";
    const prompt = options?.prompt ? String(options.prompt).trim() : "";
    const content = [];
    if (hint || prompt) {
      const parts = [];
      if (hint) {
        parts.push(`User hint: ${hint}`);
      }
      if (prompt) {
        parts.push(prompt);
      }
      content.push({ type: "input_text", text: parts.join("\n") });
    }
    content.push({ type: "input_image", image_url: rawImage });

    realtimeSendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content
      }
    });

    const autoRespond = Boolean(options?.autoRespond);
    if (autoRespond) {
      appendRealtimeLogLine("system", "Shared snapshot to agent.");
      realtimeSendEvent({ type: "response.create" });
    }
  } catch {
    // best-effort only
  }
}

async function fetchRealtimeClientSecret() {
  const result = await request("/api/v1/realtime/token", {
    method: "POST",
    body: JSON.stringify({
      // Keep the token lifetime short. The voice session uses it only for call setup.
      expires_seconds: 600
    })
  });
  const value = result?.data?.value || "";
  if (!value) {
    throw new Error("Realtime token missing from API response.");
  }
  return value;
}

function waitForIceGatheringComplete(pc, timeoutMs = 2500) {
  if (!pc || pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      pc.removeEventListener("icegatheringstatechange", onState);
      clearTimeout(timer);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onState);
  });
}

async function startRealtimeVoice() {
  if (isRealtimeConnected()) {
    setRealtimeStatus(t("voice_ready"));
    updateQuickTalkButton();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API is not supported in this browser.");
  }
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    throw new Error("Microphone access requires HTTPS in most browsers.");
  }

  clearRealtimeLog();
  setRealtimeStatus(t("voice_starting"));
  try {
    const secret = await fetchRealtimeClientSecret();

    const pc = new RTCPeerConnection();
    realtimePeer = pc;
    realtimeRemoteStream = new MediaStream();

    pc.ontrack = (event) => {
      if (!event?.track) {
        return;
      }
      realtimeRemoteStream.addTrack(event.track);
      const audio = $("realtimeAudio");
      if (audio) {
        audio.srcObject = realtimeRemoteStream;
        audio.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState || "unknown";
      setRealtimeStatus(tf("voice_connection_state", { state }));
      if (state === "failed" || state === "closed" || state === "disconnected") {
        // auto-cleanup
        stopRealtimeVoice();
      }
    };

    const dc = pc.createDataChannel("oai-events");
    realtimeDataChannel = dc;

    dc.addEventListener("open", () => {
      appendRealtimeLogLine("system", "Voice data channel open.");
      setRealtimeStatus(t("voice_ready"));
      const stopBtn = $("stopRealtimeBtn");
      const startBtn = $("startRealtimeBtn");
      if (stopBtn) stopBtn.disabled = false;
      if (startBtn) startBtn.disabled = true;
      updateQuickTalkButton();

      // Ensure transcription + VAD are enabled even if the token session config is minimal.
      try {
        const lang = currentLang === "ko" ? "ko" : "en";
        realtimeSendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            audio: {
              input: {
                noise_reduction: { type: "near_field" },
                transcription: {
                  model: "whisper-1",
                  language: lang
                },
                turn_detection: { type: "server_vad" }
              }
            }
          }
        });
      } catch {
        // best-effort only
      }
    });

    dc.addEventListener("message", (event) => {
      const raw = event?.data;
      if (!raw || typeof raw !== "string") {
        return;
      }
      let obj = null;
      try {
        obj = JSON.parse(raw);
      } catch {
        return;
      }
      handleRealtimeEvent(obj);
    });

    dc.addEventListener("close", () => {
      appendRealtimeLogLine("system", "Voice data channel closed.");
    });

    // Mic stream into the call.
    realtimeMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    realtimeMicStream.getTracks().forEach((track) => pc.addTrack(track, realtimeMicStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, 2500);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/sdp"
      },
      body: pc.localDescription?.sdp || offer.sdp
    });

    const answerSdp = await sdpRes.text();
    if (!sdpRes.ok) {
      throw new Error(answerSdp || `Realtime call failed: ${sdpRes.status}`);
    }

    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    setRealtimeStatus(t("voice_connected"));
    updateQuickTalkButton();
  } catch (err) {
    stopRealtimeVoice();
    const msg = err?.message || String(err);
    setRealtimeStatus(tf("voice_start_failed", { msg }));
    throw err;
  }
}

function stopRealtimeVoice() {
  const startBtn = $("startRealtimeBtn");
  const stopBtn = $("stopRealtimeBtn");
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  try {
    realtimeDataChannel?.close?.();
  } catch {}
  realtimeDataChannel = null;

  try {
    realtimePeer?.close?.();
  } catch {}
  realtimePeer = null;

  try {
    realtimeMicStream?.getTracks?.().forEach((t) => t.stop());
  } catch {}
  realtimeMicStream = null;

  try {
    realtimeRemoteStream?.getTracks?.().forEach((t) => t.stop());
  } catch {}
  realtimeRemoteStream = null;

  const audio = $("realtimeAudio");
  if (audio) {
    audio.srcObject = null;
  }

  realtimeUserTranscriptDelta = "";
  realtimeAssistantTranscriptDelta = "";
  realtimeLastSharedImageKey = "";
  realtimeLastSharedImageAt = 0;
  realtimeIngestChain = Promise.resolve();
  realtimeLastIngestedText = "";
  realtimeLastIngestedAt = 0;
  setRealtimeStatus(t("voice_stopped"));
  updateQuickTalkButton();
}

async function sendRealtimeTextToAgent(text, autoRespond = true) {
  const value = String(text || "").trim();
  if (!value) {
    return;
  }
  appendRealtimeLogLine("me(text)", value);
  realtimeSendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: value }]
    }
  });
  if (autoRespond) {
    realtimeSendEvent({ type: "response.create" });
  }
}

function handleRealtimeEvent(evt) {
  const type = String(evt?.type || "").trim();
  if (!type) {
    return;
  }

  if (type === "error") {
    const msg = evt?.error?.message || evt?.message || "Unknown realtime error.";
    appendRealtimeLogLine("error", msg);
    setRealtimeStatus(tf("voice_error_prefix", { msg }));
    return;
  }

  // User speech transcription.
  if (type.includes("input_audio_transcription")) {
    const delta = typeof evt?.delta === "string" ? evt.delta : "";
    let transcript = typeof evt?.transcript === "string" ? evt.transcript : "";
    if (!transcript && evt?.item?.content) {
      const parts = Array.isArray(evt.item.content) ? evt.item.content : [];
      const joined = parts
        .map((p) => (p && typeof p.transcript === "string" ? p.transcript.trim() : ""))
        .filter((v) => v.length > 0)
        .join(" ");
      transcript = joined;
    }

    if (delta) {
      realtimeUserTranscriptDelta = `${realtimeUserTranscriptDelta}${delta}`;
      setRealtimeStatus(t("voice_listening"));
      return;
    }

    const finalText = String(transcript || realtimeUserTranscriptDelta || "").trim();
    if (finalText) {
      realtimeUserTranscriptDelta = "";

      const now = Date.now();
      if (finalText === realtimeLastIngestedText && now - realtimeLastIngestedAt < 4500) {
        return;
      }
      realtimeLastIngestedText = finalText;
      realtimeLastIngestedAt = now;

      setRealtimeStatus(tf("voice_heard", { text: finalText }));
      appendRealtimeLogLine("me", finalText);

      const autoIngest =
        isEasyMode() || ($("realtimeAutoIngestSpeech") && $("realtimeAutoIngestSpeech").checked);
      if (autoIngest) {
        // Queue capture updates so fast speech doesn't drop messages.
        realtimeIngestChain = realtimeIngestChain
          .then(() =>
            sendCaptureMessagePayload({
              source_type: "realtime_voice",
              text: finalText,
              vision_detected_items: []
            })
          )
          .then(() => {
            appendRealtimeLogLine("system", t("voice_draft_updated"));
          })
          .catch((err) => {
            appendRealtimeLogLine(
              "system",
              tf("voice_draft_update_failed", { msg: err?.message || "unknown error" })
            );
          });
      }
    }
    return;
  }

  // Assistant transcript from audio output.
  if (type.includes("audio_transcript")) {
    const delta = typeof evt?.delta === "string" ? evt.delta : "";
    const transcript = typeof evt?.transcript === "string" ? evt.transcript : "";

    if (delta) {
      realtimeAssistantTranscriptDelta = `${realtimeAssistantTranscriptDelta}${delta}`;
      return;
    }

    const finalText = transcript.trim() || realtimeAssistantTranscriptDelta.trim();
    if (finalText) {
      appendRealtimeLogLine("agent", finalText);
      realtimeAssistantTranscriptDelta = "";
    }
    return;
  }

  // Some variants send the final user transcript as a conversation item.
  if (type === "conversation.item.done" && evt?.item?.role === "user") {
    const parts = Array.isArray(evt.item?.content) ? evt.item.content : [];
    const transcriptParts = parts
      .map((p) => (p && typeof p.transcript === "string" ? p.transcript.trim() : ""))
      .filter((v) => v.length > 0);
    const finalText = transcriptParts.join(" ").trim();
    if (finalText) {
      const now = Date.now();
      if (finalText !== realtimeLastIngestedText || now - realtimeLastIngestedAt >= 4500) {
        realtimeLastIngestedText = finalText;
        realtimeLastIngestedAt = now;

        setRealtimeStatus(tf("voice_heard", { text: finalText }));
        appendRealtimeLogLine("me", finalText);

        const autoIngest =
          isEasyMode() || ($("realtimeAutoIngestSpeech") && $("realtimeAutoIngestSpeech").checked);
        if (autoIngest) {
          realtimeIngestChain = realtimeIngestChain
            .then(() =>
              sendCaptureMessagePayload({
                source_type: "realtime_voice",
                text: finalText,
                vision_detected_items: []
              })
            )
            .then(() => {
              appendRealtimeLogLine("system", t("voice_draft_updated"));
            })
            .catch((err) => {
              appendRealtimeLogLine(
                "system",
                tf("voice_draft_update_failed", { msg: err?.message || "unknown error" })
              );
            });
        }
      }
    }
    return;
  }

  // Some variants send the final assistant message as a conversation item.
  if (type === "conversation.item.done" && evt?.item?.role === "assistant") {
    const parts = Array.isArray(evt.item?.content) ? evt.item.content : [];
    const transcriptParts = parts
      .map((p) => (p && typeof p.transcript === "string" ? p.transcript.trim() : ""))
      .filter((v) => v.length > 0);
    if (transcriptParts.length > 0) {
      appendRealtimeLogLine("agent", transcriptParts.join(" "));
      realtimeAssistantTranscriptDelta = "";
    }
  }
}

async function finalizeCaptureSession() {
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    throw new Error(t("err_no_capture_session"));
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/finalize`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      purchased_at: todayIso(),
      storage_type: getCaptureStorageType()
    })
  });

  renderCaptureDraft(result.data.capture);
  setCaptureError("");
  await refreshAll();
}

async function loadSummary() {
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId });
  const result = await request(`/api/v1/inventory/summary?${q}`, { method: "GET" });
  renderStats(result.data);
}

async function consumeItem(itemId) {
  await request(`/api/v1/inventory/items/${itemId}/consume`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      consumed_quantity: 1,
      mark_opened: true
    })
  });
}

function detectDefaultInventoryFilterStorage() {
  const stored = String(localStorage.getItem(INVENTORY_FILTER_STORAGE_KEY) || "").trim();
  if (stored) {
    return normalizeStorageType(stored);
  }
  const captureStored = String(localStorage.getItem(CAPTURE_STORAGE_TYPE_KEY) || "").trim();
  if (captureStored) {
    return normalizeStorageType(captureStored);
  }
  return "refrigerated";
}

function setInventoryFilterStorage(value, options = {}) {
  const next = normalizeStorageType(value);
  inventoryFilterStorage = next;
  if (options?.persist !== false) {
    localStorage.setItem(INVENTORY_FILTER_STORAGE_KEY, next);
  }
  syncInventoryTabsUI();
  renderInventoryFromCache();
}

function syncInventoryTabsUI() {
  const host = $("inventoryTabs");
  if (!host) {
    return;
  }
  host.querySelectorAll(".seg-btn").forEach((btn) => {
    const st = normalizeStorageType(btn?.dataset?.storage || "");
    btn.classList.toggle("active", st === inventoryFilterStorage);
  });
}

function renderInventoryFromCache() {
  const list = $("inventoryList");
  if (!list) {
    return;
  }
  list.innerHTML = "";

  const items = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  const filtered = items.filter((item) => normalizeStorageType(item?.storage_type || "") === inventoryFilterStorage);

  if (filtered.length === 0) {
    list.appendChild(emptyNode(t("empty_inventory")));
    return;
  }

  filtered.forEach((item) => list.appendChild(buildInventoryNode(item)));
}

function buildInventoryNode(item) {
  const tpl = $("inventoryItemTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".name").textContent = ingredientLabel(item.ingredient_key, item.ingredient_name);
  node.querySelector(".meta").textContent = tf("meta_inventory_line", {
    qty: item.quantity,
    unit: item.unit,
    storage: storageLabel(item.storage_type),
    exp: item.suggested_expiration_date,
    days: item.days_remaining
  });

  const badgeHost = node.querySelector(".badge");
  badgeHost.replaceWith(statusBadge(item.status));

  const btn = node.querySelector(".consume-btn");
  btn.textContent = t("btn_consume_1");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await consumeItem(item.id);
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  return node;
}

async function loadInventory() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId });
  const result = await request(`/api/v1/inventory/items?${q}`, { method: "GET" });
  inventoryItemsCache = result.data.items || [];
  renderInventoryFromCache();
}

function renderRecipeList(items) {
  const list = $("recipeList");
  list.innerHTML = "";

  if (!items.length) {
    list.appendChild(emptyNode(t("empty_recipes")));
    return;
  }

  items.forEach((r) => {
    const node = document.createElement("div");
    node.className = "item";
    const missingKeys = Array.isArray(r.missing_ingredient_keys) ? r.missing_ingredient_keys : [];
    const missing = missingKeys
      .map((k) => ingredientLabel(k, k))
      .filter((v) => String(v || "").trim())
      .join(", ");
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${r.recipe_name}</strong>
        <span class="meta">${tf("meta_recipe_line", {
          chef: r.chef,
          score: r.score,
          match: `${(r.match_ratio * 100).toFixed(0)}`
        })}</span>
        <span class="meta">${tf("meta_recipe_missing", { missing: missing || t("word_none") })}</span>
      </div>
      <div class="item-side"></div>
    `;
    node.querySelector(".item-side").appendChild(statusBadge(r.can_make_now ? "fresh" : "expiring_soon"));
    list.appendChild(node);
  });
}

async function loadRecipes() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8 });
  const result = await request(`/api/v1/recommendations/recipes?${q}`, { method: "GET" });
  renderRecipeList(result.data.items || []);
}

function renderShopping(items) {
  const list = $("shoppingList");
  list.innerHTML = "";
  if (!items.length) {
    list.appendChild(emptyNode(t("empty_shopping")));
    return;
  }

  items.forEach((s) => {
    const node = document.createElement("div");
    node.className = "item";
    const label = ingredientLabel(s.ingredient_key, s.ingredient_key);
    const reasons = Array.isArray(s.reasons) ? s.reasons.join(", ") : "";
    const related =
      Array.isArray(s.related_recipe_ids) && s.related_recipe_ids.length > 0
        ? s.related_recipe_ids.join(", ")
        : t("word_none");
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${label}</strong>
        <span class="meta">${tf("meta_shopping_reasons", { reasons })}</span>
        <span class="meta">${tf("meta_shopping_related", { related })}</span>
      </div>
      <div class="item-side">
        <span class="badge fresh">P${s.priority}</span>
      </div>
    `;
    list.appendChild(node);
  });
}

async function loadShopping() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8, top_recipe_count: 3 });
  const result = await request(`/api/v1/shopping/suggestions?${q}`, { method: "GET" });
  renderShopping(result.data.items || []);
}

function renderNotifications(items) {
  const list = $("notificationList");
  list.innerHTML = "";
  if (!items.length) {
    list.appendChild(emptyNode(t("empty_notifications")));
    return;
  }

  items.forEach((n) => {
    const node = document.createElement("div");
    node.className = "item";
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${n.notify_type}</strong>
        <span class="meta">${tf("meta_notification_item", { id: n.inventory_item_id })}</span>
        <span class="meta">${tf("meta_notification_scheduled", { ts: n.scheduled_at })}</span>
      </div>
      <div class="item-side"></div>
    `;
    node.querySelector(".item-side").appendChild(statusBadge(n.status === "pending" ? "expiring_soon" : "fresh"));
    list.appendChild(node);
  });
}

async function loadNotifications() {
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId });
  const result = await request(`/api/v1/notifications?${q}`, { method: "GET" });
  renderNotifications(result.data.items || []);
}

async function runDueNotifications() {
  const userId = getUserId();
  const result = await request("/api/v1/notifications/run-due", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      as_of_datetime: new Date().toISOString()
    })
  });

  $("runDueResult").textContent = tf("toast_run_due", {
    count: result.data.sent_count,
    ts: result.data.as_of_datetime
  });
}

async function reloadIngredientCatalog() {
  const result = await request("/api/v1/admin/reload-ingredient-catalog", {
    method: "POST",
    body: JSON.stringify({})
  });

  const count = result?.data?.reloaded_count ?? 0;
  const reloadedAt = result?.data?.reloaded_at || new Date().toISOString();
  $("reloadCatalogResult").textContent = tf("toast_reload_catalog", {
    count,
    ts: reloadedAt
  });
}

function parseNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return null;
  }
  return n;
}

async function createItemFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  const payload = {
    user_id: getUserId(),
    ingredient_name: String(formData.get("ingredient_name") || "").trim(),
    purchased_at: String(formData.get("purchased_at") || "").trim(),
    storage_type: String(formData.get("storage_type") || "refrigerated"),
    quantity: parseNumberOrNull(formData.get("quantity")),
    unit: String(formData.get("unit") || "ea").trim(),
    ocr_raw_text: String(formData.get("ocr_raw_text") || "").trim() || null,
    product_shelf_life_days: parseNumberOrNull(formData.get("product_shelf_life_days"))
  };

  await request("/api/v1/inventory/items", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  form.reset();
  form.querySelector("[name='purchased_at']").value = todayIso();
  await refreshAll();
}

async function refreshAll() {
  setGlobalError("");

  const tasks = [
    loadSummary(),
    loadInventory(),
    loadRecipes(),
    loadShopping(),
    loadNotifications(),
    loadCaptureSession(),
    loadReviewQueue()
  ];

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    setGlobalError(failed.map((f) => f.reason?.message || "unknown error").join(" | "));
  }
}

function bindEvents() {
  $("createItemForm").addEventListener("submit", createItemFromForm);
  $("refreshAllBtn").addEventListener("click", refreshAll);
  if ($("languageSelect")) {
    $("languageSelect").addEventListener("change", async () => {
      setLang($("languageSelect").value);
      try {
        await refreshAll();
      } catch (err) {
        setGlobalError(err.message);
      }
    });
  }
  if ($("easyModeToggle")) {
    $("easyModeToggle").addEventListener("change", () => {
      setEasyMode(Boolean($("easyModeToggle").checked));
    });
  }
  if ($("captureStorageButtons")) {
    $("captureStorageButtons").addEventListener("click", (event) => {
      const btn = event?.target?.closest?.(".seg-btn");
      if (!btn) {
        return;
      }
      applyCaptureStorageType(btn.dataset.storage);
    });
  }
  if ($("captureStorageType")) {
    $("captureStorageType").addEventListener("change", () => {
      applyCaptureStorageType(getCaptureStorageType());
    });
  }
  if ($("inventoryTabs")) {
    $("inventoryTabs").addEventListener("click", (event) => {
      const btn = event?.target?.closest?.(".seg-btn");
      if (!btn) {
        return;
      }
      setInventoryFilterStorage(btn.dataset.storage, { persist: true });
    });
  }
  if ($("captureVisionImageInput")) {
    $("captureVisionImageInput").addEventListener("change", async () => {
      const input = $("captureVisionImageInput");
      const file = input?.files?.[0] || null;
      const nameEl = $("captureVisionFileName");
      if (nameEl) {
        nameEl.textContent = file ? file.name : "";
      }
      if (!file) {
        return;
      }
      try {
        await analyzeVisionImage();
      } catch (err) {
        setCaptureError(err.message);
        setGlobalError(err.message);
      } finally {
        // Allow selecting the same file again.
        try {
          input.value = "";
        } catch {}
      }
    });
  }
  if ($("quickTalkBtn")) {
    $("quickTalkBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      const btn = $("quickTalkBtn");
      if (btn) {
        btn.disabled = true;
      }
      try {
        if (isRealtimeConnected()) {
          stopRealtimeVoice();
        } else {
          await startRealtimeVoice();
        }
      } catch (err) {
        setGlobalError(err.message);
      } finally {
        updateQuickTalkButton();
        if (btn) {
          btn.disabled = false;
        }
      }
    });
  }
  $("saveApiBaseBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    const value = $("apiBaseUrl").value;
    const normalized = setApiBase(value);
    $("apiBaseUrl").value = normalized;
    try {
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  });
  $("clearApiBaseBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    clearApiBase();
    $("apiBaseUrl").value = "";
    try {
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  });
  $("reloadInventoryBtn").addEventListener("click", loadInventory);
  $("reloadRecipesBtn").addEventListener("click", loadRecipes);
  $("reloadShoppingBtn").addEventListener("click", loadShopping);
  $("reloadNotificationsBtn").addEventListener("click", loadNotifications);
  $("reloadReviewQueueBtn").addEventListener("click", loadReviewQueue);
  $("startCaptureSessionBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await startCaptureSession();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("sendCaptureMessageBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await sendCaptureMessage();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("analyzeVisionImageBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await analyzeVisionImage();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("startCameraBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await startLiveCamera();
      await updateLiveCameraAutoCapture();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("stopCameraBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    stopLiveCamera();
  });
  $("captureFrameBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await captureLiveCameraFrame({ isAuto: false });
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("cameraAutoInterval").addEventListener("change", async () => {
    try {
      await updateLiveCameraAutoCapture();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("cameraFacingMode").addEventListener("change", async () => {
    if (!liveCameraStream) {
      return;
    }
    try {
      stopLiveCamera();
      await startLiveCamera();
      await updateLiveCameraAutoCapture();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });

  if ($("startRealtimeBtn")) {
    $("startRealtimeBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await startRealtimeVoice();
      } catch (err) {
        setGlobalError(err.message);
      }
    });
  }
  if ($("stopRealtimeBtn")) {
    $("stopRealtimeBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      stopRealtimeVoice();
    });
  }
  if ($("sendRealtimeTextBtn")) {
    $("sendRealtimeTextBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await sendRealtimeTextToAgent(($("realtimeTextInput")?.value || "").trim(), true);
        if ($("realtimeTextInput")) {
          $("realtimeTextInput").value = "";
        }
      } catch (err) {
        setGlobalError(err.message);
      }
    });
  }
  if ($("realtimeTextInput")) {
    $("realtimeTextInput").addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if ($("sendRealtimeTextBtn")) {
        $("sendRealtimeTextBtn").click();
      }
    });
  }
  $("finalizeCaptureBtn").addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await finalizeCaptureSession();
    } catch (err) {
      setCaptureError(err.message);
      setGlobalError(err.message);
    }
  });
  $("runDueBtn").addEventListener("click", async () => {
    try {
      await runDueNotifications();
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  });
  $("reloadCatalogBtn").addEventListener("click", async () => {
    try {
      await reloadIngredientCatalog();
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  });
}

function init() {
  initApiBaseFromQuery();
  setLang(detectDefaultLang());
  setEasyMode(detectDefaultEasyMode());
  const apiBaseInput = $("apiBaseUrl");
  if (apiBaseInput) {
    apiBaseInput.value = getApiBase();
  }
  const storedCaptureStorage = String(localStorage.getItem(CAPTURE_STORAGE_TYPE_KEY) || "").trim();
  const captureStorage = storedCaptureStorage ? normalizeStorageType(storedCaptureStorage) : "refrigerated";
  applyCaptureStorageType(captureStorage, { persist: false, syncInventory: false });
  setInventoryFilterStorage(detectDefaultInventoryFilterStorage(), { persist: false });

  const purchased = document.querySelector("[name='purchased_at']");
  if (purchased) {
    purchased.value = todayIso();
  }
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setCameraStatus(t("camera_tip_https"));
  } else {
    setCameraStatus(t("camera_idle"));
  }
  setRealtimeStatus(t("voice_idle"));
  window.addEventListener("beforeunload", stopLiveCamera);
  window.addEventListener("beforeunload", stopRealtimeVoice);
  bindEvents();
  refreshAll();
}

window.addEventListener("DOMContentLoaded", init);
