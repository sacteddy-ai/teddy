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
let realtimeRecentSpeechTexts = [];
let realtimeLoggedEventTypes = new Set();
let realtimeTranscriptionFallbackApplied = false;
let realtimeQuotaBlocked = false;

let visionLastImageDataUrl = "";
let visionObjectsCache = [];
let visionSelectedObjectId = "";
let visionRelabelTargetId = "";
let draftVoiceEditTarget = null; // { ingredient_key, quantity, unit, display_name }
let visionEditMode = "select"; // select | add
let visionPointerState = null;
let visionTempBbox = null;

let browserSpeechRecognizer = null;
let browserSpeechRunning = false;
let browserSpeechFinalText = "";
let browserSpeechInterimText = "";

const API_BASE_STORAGE_KEY = "teddy_api_base";
const LANG_STORAGE_KEY = "teddy_lang";
const CAPTURE_STORAGE_TYPE_KEY = "teddy_capture_storage_type";
const EASY_MODE_STORAGE_KEY = "teddy_easy_mode";
const INVENTORY_FILTER_STORAGE_KEY = "teddy_inventory_filter_storage";
const SHOPPING_AUTO_ONLY_STORAGE_KEY = "teddy_shopping_auto_only";

let currentLang = "en";
let ingredientLabelsUserId = "";
let ingredientLabelsByKey = new Map();
let ingredientLabelsLoadPromise = null;
let ingredientLabelsLoadUserId = "";

const INGREDIENT_KEY_LABEL_FALLBACK = {
  onion: { en: "Onion", ko: "양파" },
  green_onion: { en: "Green Onion", ko: "대파" }
};

let inventoryItemsCache = [];
let inventoryFilterStorage = "refrigerated";
let inventorySelectedIds = new Set();
let shoppingItemsCache = [];
let shoppingAutoOnly = false;

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
    word_new_item: "New item",
    word_source: "source",
    word_link: "link",
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
    btn_quick_talk_browser: "Talk (Browser)",
    btn_stop_talk: "Stop Talking",
    quick_capture_hint: "Choose storage, then take a photo or talk. We'll add items to the draft automatically.",
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
    vision_objects_title: "Object Labels",
    vision_objects_hint: "Tap a box to select. Edit labels if needed.",
    btn_edit_label: "Edit",
    btn_edit_label_voice: "Edit by Voice",
    btn_remove_one: "Remove 1",
    btn_save_label: "Save",
    btn_cancel_label: "Cancel",
    vision_badge_ok: "ok",
    vision_badge_low: "check",
    btn_add_box: "Add Box",
    btn_delete_box: "Delete",
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
    btn_shopping_auto_only: "Auto-Order Only",
    btn_shopping_show_all: "Show All",
    btn_create_order_draft: "Create Order Draft",
    notifications_title: "Notifications",
    btn_consume_1: "Consume 1",
    btn_select_all: "Select all",
    btn_clear_selection: "Clear",
    btn_add_1: "Add 1",
    btn_delete_selected: "Delete",
    inventory_selected_count: "Selected: {count}",
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
    empty_shopping_auto_only: "No auto-order candidates.",
    empty_notifications: "No notifications.",
    empty_capture_none: "Start a capture session.",
    empty_capture_no_session: "No active capture session.",
    empty_capture_draft: "Draft is empty.",
    empty_capture_review: "No pending confirmations in this session.",
    empty_review_queue: "No pending review items.",
    capture_error_need_text_or_vision: "Type a message or provide vision items.",
    err_no_capture_session: "No capture session to finalize.",
    err_vision_label_required: "Name the new box before finalizing.",
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
    voice_processing: "Processing...",
    voice_heard: "Heard: {text}",
    voice_start_failed: "Voice start failed: {msg}",
    voice_stopped: "Voice session stopped.",
    voice_error_prefix: "Error: {msg}",
    voice_quota_exceeded:
      "OpenAI quota exceeded. Voice transcription via OpenAI is disabled until billing is enabled. Using browser speech recognition instead.",
    voice_draft_updated: "Draft updated from speech.",
    voice_draft_updated_ready: "Added to draft. Review and tap Finalize to save.",
    voice_draft_edit_hint: "Say the new name, or say \"delete\" to remove it.",
    voice_draft_update_failed: "Draft update failed: {msg}",
    voice_inventory_updated: "Inventory updated: {summary}",
    voice_inventory_no_items: "I couldn't find any food items in that message.",
    voice_inventory_update_failed: "Inventory update failed: {msg}",
    voice_saved: "Saved to inventory.",
    meta_session_line: "Session {id} | status {status} | items {items} | total qty {qty}",
    meta_inventory_line: "{qty} {unit} | {storage} | exp {exp} | D{days}",
    meta_recipe_line: "{chef} | score {score} | match {match}%",
    meta_recipe_missing: "missing: {missing}",
    meta_recipe_missing_unknown: "missing: analyzing ingredients",
    meta_shopping_reasons: "reasons: {reasons}",
    meta_shopping_related: "related recipes: {related}",
    toast_order_draft_created: "Order draft created: {id} ({count} items)",
    err_order_draft_no_items: "No visible shopping items to draft.",
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
    word_new_item: "새 항목",
    word_source: "\uCD9C\uCC98",
    word_link: "\uB9C1\uD06C",
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
    btn_quick_talk_browser: "말하기 (브라우저)",
    btn_stop_talk: "말하기 중지",
    quick_capture_hint: "보관 방식을 고르고, 사진을 찍거나 말해보세요. 자동으로 드래프트에 추가해요.",
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
    vision_objects_title: "오브젝트 라벨",
    vision_objects_hint: "박스를 눌러 선택하고, 필요하면 이름을 수정하세요.",
    btn_edit_label: "수정",
    btn_edit_label_voice: "말로 수정",
    btn_remove_one: "빼기",
    btn_save_label: "저장",
    btn_cancel_label: "취소",
    vision_badge_ok: "확신",
    vision_badge_low: "확인",
    btn_add_box: "박스 추가",
    btn_delete_box: "삭제",
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
    btn_shopping_auto_only: "자동주문 후보만",
    btn_shopping_show_all: "전체보기",
    btn_create_order_draft: "주문 초안 만들기",
    notifications_title: "알림",
    btn_consume_1: "1개 소비",
    btn_select_all: "전체 선택",
    btn_clear_selection: "선택 해제",
    btn_add_1: "1개 추가",
    btn_delete_selected: "삭제",
    inventory_selected_count: "선택: {count}개",
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
    empty_shopping_auto_only: "자동주문 후보가 없습니다.",
    empty_notifications: "알림이 없습니다.",
    empty_capture_none: "캡처 세션을 시작하세요.",
    empty_capture_no_session: "활성 캡처 세션이 없습니다.",
    empty_capture_draft: "드래프트가 비어있습니다.",
    empty_capture_review: "이 세션에 확인할 항목이 없습니다.",
    empty_review_queue: "확인할 항목이 없습니다.",
    capture_error_need_text_or_vision: "메시지를 입력하거나 비전 아이템을 넣어주세요.",
    err_no_capture_session: "확정할 캡처 세션이 없습니다.",
    err_vision_label_required: "새 박스 이름을 입력한 뒤 확정해주세요.",
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
    voice_processing: "처리 중...",
    voice_heard: "인식: {text}",
    voice_start_failed: "음성 시작 실패: {msg}",
    voice_stopped: "음성 세션 종료됨.",
    voice_error_prefix: "오류: {msg}",
    voice_quota_exceeded:
      "OpenAI 크레딧/쿼터가 부족해서 음성 인식이 막혔어요. 결제/크레딧을 추가하면 다시 동작합니다. 지금은 브라우저 음성 인식을 사용합니다.",
    voice_draft_updated: "말한 내용을 드래프트에 반영했어요.",
    voice_draft_updated_ready: "드래프트에 추가했어요. 확인 후 '인벤토리로 확정'을 눌러주세요.",
    voice_draft_edit_hint: "새 이름을 말하거나 '삭제'라고 말하면 이 항목이 사라져요.",
    voice_draft_update_failed: "드래프트 반영 실패: {msg}",
    voice_inventory_updated: "인벤토리 업데이트: {summary}",
    voice_inventory_no_items: "이 문장에서 식재료를 찾지 못했어요.",
    voice_inventory_update_failed: "인벤토리 업데이트 실패: {msg}",
    voice_saved: "인벤토리에 저장했어요.",
    meta_session_line: "세션 {id} | 상태 {status} | 아이템 {items} | 총 수량 {qty}",
    meta_inventory_line: "{qty}{unit} | {storage} | 유통기한 {exp} | D{days}",
    meta_recipe_line: "{chef} | 점수 {score} | 매칭 {match}%",
    meta_recipe_missing: "부족: {missing}",
    meta_recipe_missing_unknown: "부족: 재료 분석 중",
    meta_shopping_reasons: "이유: {reasons}",
    meta_shopping_related: "연관 레시피: {related}",
    toast_order_draft_created: "주문 초안 생성: {id} ({count}개)",
    err_order_draft_no_items: "주문 초안으로 만들 항목이 없습니다.",
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
  syncShoppingFilterUI();
  updateQuickTalkButton();
  renderShoppingFromCache();
  renderVisionObjectPreview({ skipImageReload: true });
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

  if (k && INGREDIENT_KEY_LABEL_FALLBACK[k]) {
    const row = INGREDIENT_KEY_LABEL_FALLBACK[k];
    return (currentLang === "ko" ? row.ko : row.en) || row.en || k;
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

function clearVisionObjectPreview() {
  visionLastImageDataUrl = "";
  visionObjectsCache = [];
  visionSelectedObjectId = "";
  visionRelabelTargetId = "";
  visionEditMode = "select";
  visionPointerState = null;
  visionTempBbox = null;

  const panel = $("visionObjectPanel");
  if (panel) {
    panel.hidden = true;
  }
  const img = $("visionPreviewImage");
  if (img) {
    img.removeAttribute("src");
  }
  const list = $("visionObjectList");
  if (list) {
    list.innerHTML = "";
  }
  const canvas = $("visionPreviewCanvas");
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function setVisionObjectsPreview(imageDataUrl, objects) {
  visionLastImageDataUrl = String(imageDataUrl || "").trim();
  visionObjectsCache = Array.isArray(objects) ? objects.filter(Boolean) : [];
  if (!visionSelectedObjectId && visionObjectsCache.length > 0) {
    visionSelectedObjectId = String(visionObjectsCache[0]?.id || "").trim() || "";
  }
  renderVisionObjectPreview();
}

function setVisionEditMode(nextMode) {
  const mode = String(nextMode || "").trim().toLowerCase();
  visionEditMode = mode === "add" ? "add" : "select";
  visionTempBbox = null;

  const addBtn = $("visionAddBoxBtn");
  if (addBtn) {
    addBtn.classList.toggle("active", visionEditMode === "add");
  }
}

function getSelectedVisionObject() {
  const id = String(visionSelectedObjectId || "").trim();
  if (!id) {
    return null;
  }
  return (visionObjectsCache || []).find((o) => String(o?.id || "").trim() === id) || null;
}

function openVisionObjectEdit(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return;
  }
  const list = $("visionObjectList");
  if (!list) {
    return;
  }
  let node = null;
  list.querySelectorAll(".vision-object").forEach((n) => {
    if (node) {
      return;
    }
    const oid = String(n?.dataset?.objectId || "");
    if (oid === id) {
      node = n;
    }
  });
  if (!node) {
    return;
  }
  const row = node.querySelector(".vision-edit-row");
  const input = node.querySelector(".vision-edit-input");
  if (row) {
    row.hidden = false;
  }
  if (input) {
    input.focus();
    input.select?.();
  }
}

function getVisionObjectDisplayLabel(obj) {
  const key = obj?.ingredient_key || "";
  const fallback = obj?.ingredient_name || obj?.name || key;
  return ingredientLabel(key, fallback);
}

function selectVisionObject(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return;
  }
  visionSelectedObjectId = id;
  syncVisionObjectSelectionUI();
  drawVisionOverlay();
}

function syncVisionObjectSelectionUI() {
  const list = $("visionObjectList");
  if (!list) {
    return;
  }
  list.querySelectorAll(".vision-object").forEach((node) => {
    const id = String(node?.dataset?.objectId || "");
    node.classList.toggle("selected", id && id === visionSelectedObjectId);
  });
}

function findVisionObjectAt(nx, ny) {
  const x = Number(nx);
  const y = Number(ny);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  // Prefer the smallest matching box (more specific).
  let best = null;
  let bestArea = Infinity;
  for (const obj of visionObjectsCache || []) {
    const bbox = obj?.bbox;
    if (!bbox) {
      continue;
    }
    const bx = Number(bbox.x);
    const by = Number(bbox.y);
    const bw = Number(bbox.w);
    const bh = Number(bbox.h);
    if (![bx, by, bw, bh].every(Number.isFinite)) {
      continue;
    }
    if (x < bx || y < by || x > bx + bw || y > by + bh) {
      continue;
    }
    const area = bw * bh;
    if (area < bestArea) {
      bestArea = area;
      best = obj;
    }
  }
  return best;
}

function drawVisionOverlay() {
  const img = $("visionPreviewImage");
  const canvas = $("visionPreviewCanvas");
  if (!img || !canvas || !canvas.getContext) {
    return;
  }
  if (!visionLastImageDataUrl || (visionObjectsCache || []).length === 0) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const drawLabel = (x, y, text, color) => {
    const padX = 6;
    const padY = 4;
    ctx.font = "600 12px Noto Sans KR, Space Grotesk, sans-serif";
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + padX * 2;
    const h = 18;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x, Math.max(0, y - h), w, h);
    ctx.fillStyle = color;
    ctx.fillText(text, x + padX, Math.max(12, y - 5));
  };

  const allObjects = Array.isArray(visionObjectsCache) ? visionObjectsCache : [];
  for (let i = 0; i < allObjects.length; i += 1) {
    const obj = allObjects[i];
    const bbox = obj?.bbox;
    if (!bbox) {
      continue;
    }
    const bx = Number(bbox.x);
    const by = Number(bbox.y);
    const bw = Number(bbox.w);
    const bh = Number(bbox.h);
    if (![bx, by, bw, bh].every(Number.isFinite)) {
      continue;
    }

    const x = bx * rect.width;
    const y = by * rect.height;
    const w = bw * rect.width;
    const h = bh * rect.height;

    const selected = obj?.id && String(obj.id) === visionSelectedObjectId;
    const confidence = String(obj?.confidence || "").toLowerCase();
    const baseColor = confidence === "low" ? "#b87014" : "#2f8f5b";
    const stroke = selected ? "#182018" : baseColor;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(x, y, w, h);

    const label = getVisionObjectDisplayLabel(obj);
    const text = `${i + 1} ${label}`.trim();
    drawLabel(x, y, text, "#fff");

    if (selected) {
      // Corner handles for resizing.
      const hs = 8;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      const corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h]
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
      }
    }
  }

  if (visionTempBbox) {
    const bx = Number(visionTempBbox.x);
    const by = Number(visionTempBbox.y);
    const bw = Number(visionTempBbox.w);
    const bh = Number(visionTempBbox.h);
    if ([bx, by, bw, bh].every(Number.isFinite)) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bx * rect.width, by * rect.height, bw * rect.width, bh * rect.height);
      ctx.setLineDash([]);
    }
  }
}

async function replaceVisionObjectLabel(objectId, newLabel, options = {}) {
  const id = String(objectId || "").trim();
  const label = String(newLabel || "").trim();
  if (!id || !label) {
    return;
  }

  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const obj = (visionObjectsCache || []).find((o) => String(o?.id || "") === id);
  if (!obj?.ingredient_key) {
    throw new Error("Vision object not found.");
  }

  const qty = options?.quantity ?? 1;
  const unit = options?.unit || "ea";

  const result = await request(`/api/v1/capture/sessions/${sessionId}/draft/replace`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      ui_lang: currentLang,
      from_ingredient_key: obj.ingredient_key,
      to_label: label,
      quantity: qty,
      unit
    })
  });

  const capture = result?.data?.capture || null;
  if (capture) {
    renderCaptureDraft(capture);
  }

  const rep = result?.data?.replacement || null;
  if (rep?.to_ingredient_key) {
    obj.ingredient_key = rep.to_ingredient_key;
  }
  if (rep?.to_ingredient_name) {
    obj.ingredient_name = rep.to_ingredient_name;
  }
  obj.confidence = "medium";
  obj.draft_applied = true;

  const locUpdated = Number(result?.data?.localization?.updated_count || 0);
  if (locUpdated > 0) {
    try {
      await loadIngredientLabels(true);
    } catch {}
  }

  renderVisionObjectPreview({ skipImageReload: true });
  await loadReviewQueue();
}

async function replaceCaptureDraftIngredient(fromIngredientKey, toLabel, quantity, unit) {
  const fromKey = String(fromIngredientKey || "").trim();
  const label = String(toLabel || "").trim();
  if (!fromKey || !label) {
    return null;
  }

  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/draft/replace`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      ui_lang: currentLang,
      from_ingredient_key: fromKey,
      to_label: label,
      replace_all: true,
      quantity: quantity ?? 1,
      unit: unit || "ea"
    })
  });

  const capture = result?.data?.capture || null;
  if (capture) {
    renderCaptureDraft(capture);
  }

  const locUpdated = Number(result?.data?.localization?.updated_count || 0);
  if (locUpdated > 0) {
    try {
      await loadIngredientLabels(true);
    } catch {}
  }

  await loadReviewQueue();
  return result;
}

async function removeCaptureDraftIngredient(ingredientKey, quantity, unit, removeAll = false) {
  const key = String(ingredientKey || "").trim();
  if (!key) {
    return null;
  }

  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/draft/remove`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      ingredient_key: key,
      quantity: quantity ?? 1,
      unit: unit || "ea",
      remove_all: Boolean(removeAll)
    })
  });

  const capture = result?.data?.capture || null;
  if (capture) {
    renderCaptureDraft(capture);
  }
  await loadReviewQueue();
  return result;
}

function renderVisionObjectPreview(options = {}) {
  const { skipImageReload = false } = options || {};

  const panel = $("visionObjectPanel");
  if (!panel) {
    return;
  }

  if (!visionLastImageDataUrl || (visionObjectsCache || []).length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const img = $("visionPreviewImage");
  if (img && !skipImageReload) {
    img.onload = () => {
      drawVisionOverlay();
    };
    img.src = visionLastImageDataUrl;
  } else {
    // Image already set; still redraw in case labels changed.
    drawVisionOverlay();
  }

  const addBtn = $("visionAddBoxBtn");
  if (addBtn) {
    addBtn.classList.toggle("active", visionEditMode === "add");
  }

  const list = $("visionObjectList");
  if (list) {
    list.innerHTML = "";

    (visionObjectsCache || []).forEach((obj, idx) => {
      const node = document.createElement("div");
      node.className = "item vision-object";
      node.dataset.objectId = String(obj?.id || "");
      node.addEventListener("click", () => selectVisionObject(obj?.id));

      const label = getVisionObjectDisplayLabel(obj);
      const metaText = isEasyMode() ? "" : obj?.ingredient_key ? `key ${obj.ingredient_key}` : "";
      const confidence = String(obj?.confidence || "").toLowerCase();
      const badgeClass = confidence === "low" ? "expiring_soon" : "fresh";
      const badgeText = confidence === "low" ? t("vision_badge_low") : t("vision_badge_ok");

      node.innerHTML = `
        <div class="item-main">
          <strong class="name">${idx + 1}. ${label}</strong>
          <span class="meta">${metaText}</span>
          <div class="vision-edit-row" hidden>
            <input class="vision-edit-input" type="text" value="${label.replace(/\"/g, "&quot;")}">
            <button type="button" class="btn tiny secondary save-btn">${t("btn_save_label")}</button>
            <button type="button" class="btn tiny ghost cancel-btn">${t("btn_cancel_label")}</button>
          </div>
        </div>
        <div class="item-side">
          <span class="badge ${badgeClass}">${badgeText}</span>
          <button type="button" class="btn tiny ghost edit-btn">${t("btn_edit_label")}</button>
          <button type="button" class="btn tiny ghost edit-voice-btn">${t("btn_edit_label_voice")}</button>
          <button type="button" class="btn tiny warn delete-btn">${t("btn_delete_box")}</button>
        </div>
      `;

      const editBtn = node.querySelector(".edit-btn");
      const voiceBtn = node.querySelector(".edit-voice-btn");
      const editRow = node.querySelector(".vision-edit-row");
      const input = node.querySelector(".vision-edit-input");
      const saveBtn = node.querySelector(".save-btn");
      const cancelBtn = node.querySelector(".cancel-btn");

      if (editBtn && editRow) {
        editBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          editRow.hidden = !editRow.hidden;
          if (!editRow.hidden && input) {
            input.focus();
            input.select?.();
          }
        });
      }

      if (cancelBtn && editRow) {
        cancelBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          editRow.hidden = true;
        });
      }

      if (input && saveBtn && cancelBtn && editRow) {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            saveBtn.click();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelBtn.click();
          }
        });
      }

      if (saveBtn && input && editRow) {
        saveBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          saveBtn.disabled = true;
          try {
            await replaceVisionObjectLabel(obj?.id, input.value, { quantity: 1, unit: "ea" });
            editRow.hidden = true;
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
          } finally {
            saveBtn.disabled = false;
          }
        });
      }

      if (voiceBtn) {
        voiceBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectVisionObject(obj?.id);
          visionRelabelTargetId = String(obj?.id || "");
          realtimeLastIngestedText = "";
          realtimeLastIngestedAt = 0;
          setRealtimeStatus(`${t("btn_edit_label_voice")}: ${idx + 1}. ${label}`);
          updateQuickTalkButton();
          try {
            if (realtimeQuotaBlocked) {
              startBrowserSpeechRecognition();
            } else {
              await startRealtimeVoice();
            }
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
          }
        });
      }

      const deleteBtn = node.querySelector(".delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const ok = confirm(`${t("btn_delete_box")}: ${label}?`);
          if (!ok) {
            return;
          }
          deleteBtn.disabled = true;
          try {
            await deleteVisionObject(obj?.id);
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
          } finally {
            deleteBtn.disabled = false;
          }
        });
      }

      list.appendChild(node);
    });
  }

  syncVisionObjectSelectionUI();
}

function buildCustomVisionObject(bbox) {
  const id = `custom_${(crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`)}`;
  const placeholder = t("word_new_item");
  return {
    id,
    name: placeholder,
    ingredient_key: `custom_${id}`,
    ingredient_name: placeholder,
    confidence: "low",
    bbox,
    quantity: 1,
    unit: "ea",
    draft_applied: false
  };
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.min(max, Math.max(min, n));
}

function normalizeBboxFromPoints(x1, y1, x2, y2) {
  const ax = clamp(Math.min(x1, x2), 0, 1);
  const ay = clamp(Math.min(y1, y2), 0, 1);
  const bx = clamp(Math.max(x1, x2), 0, 1);
  const by = clamp(Math.max(y1, y2), 0, 1);
  const w = Math.max(0, bx - ax);
  const h = Math.max(0, by - ay);
  if (w < 0.01 || h < 0.01) {
    return null;
  }
  return { x: ax, y: ay, w, h };
}

function getHandleAtPoint(obj, nx, ny, rect) {
  if (!obj?.bbox || !rect?.width || !rect?.height) {
    return null;
  }
  const bbox = obj.bbox;
  const x = Number(bbox.x);
  const y = Number(bbox.y);
  const w = Number(bbox.w);
  const h = Number(bbox.h);
  if (![x, y, w, h].every(Number.isFinite)) {
    return null;
  }

  const px = nx * rect.width;
  const py = ny * rect.height;
  const cx1 = x * rect.width;
  const cy1 = y * rect.height;
  const cx2 = (x + w) * rect.width;
  const cy2 = (y + h) * rect.height;

  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const threshold = 14; // px

  const corners = [
    { handle: "nw", x: cx1, y: cy1 },
    { handle: "ne", x: cx2, y: cy1 },
    { handle: "sw", x: cx1, y: cy2 },
    { handle: "se", x: cx2, y: cy2 }
  ];
  let best = null;
  let bestD = Infinity;
  for (const c of corners) {
    const d = dist(px, py, c.x, c.y);
    if (d <= threshold && d < bestD) {
      bestD = d;
      best = c.handle;
    }
  }
  return best;
}

function updateObjectBbox(objId, bbox) {
  const id = String(objId || "").trim();
  if (!id || !bbox) {
    return;
  }
  const idx = (visionObjectsCache || []).findIndex((o) => String(o?.id || "") === id);
  if (idx < 0) {
    return;
  }
  visionObjectsCache[idx] = {
    ...visionObjectsCache[idx],
    bbox: {
      x: Math.round(Number(bbox.x) * 10000) / 10000,
      y: Math.round(Number(bbox.y) * 10000) / 10000,
      w: Math.round(Number(bbox.w) * 10000) / 10000,
      h: Math.round(Number(bbox.h) * 10000) / 10000
    }
  };
}

async function deleteVisionObject(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return;
  }
  const obj = (visionObjectsCache || []).find((o) => String(o?.id || "") === id) || null;
  if (!obj) {
    return;
  }

  const sessionId = getCaptureSessionId();
  if (sessionId && obj.draft_applied && obj.ingredient_key) {
    // Remove 1 unit from draft to match object deletion.
    const result = await request(`/api/v1/capture/sessions/${sessionId}/draft/remove`, {
      method: "POST",
      body: JSON.stringify({
        user_id: getUserId(),
        ingredient_key: obj.ingredient_key,
        quantity: obj.quantity ?? 1,
        unit: obj.unit || "ea",
        remove_all: false
      })
    });
    const capture = result?.data?.capture || null;
    if (capture) {
      renderCaptureDraft(capture);
    }
    await loadReviewQueue();
  }

  visionObjectsCache = (visionObjectsCache || []).filter((o) => String(o?.id || "") !== id);
  if (visionSelectedObjectId === id) {
    visionSelectedObjectId = String(visionObjectsCache[0]?.id || "");
  }
  renderVisionObjectPreview({ skipImageReload: true });
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
  const running = isRealtimeConnected() || browserSpeechRunning;
  if (running) {
    btn.textContent = t("btn_stop_talk");
  } else if (realtimeQuotaBlocked) {
    btn.textContent = t("btn_quick_talk_browser");
  } else {
    btn.textContent = t("btn_quick_talk");
  }
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

  const sendOnce = async () =>
    request(`/api/v1/capture/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({
        source_type: payload?.source_type || "text",
        text,
        vision_detected_items: visionItems
      })
    });

  let result = null;
  try {
    result = await sendOnce();
  } catch (err) {
    const msg = err?.message || String(err);
    if (/capture session is not open|capture session not found/i.test(msg)) {
      await startCaptureSession();
      sessionId = getCaptureSessionId();
      result = await sendOnce();
    } else {
      throw err;
    }
  }

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

function formatInventoryIngestSummary(data) {
  const added = Array.isArray(data?.added) ? data.added : [];
  const consumed = Array.isArray(data?.consumed) ? data.consumed : [];
  const updated = Array.isArray(data?.updated) ? data.updated : [];
  const notFound = Array.isArray(data?.not_found) ? data.not_found : [];

  const labelFor = (key, fallback) => ingredientLabel(String(key || ""), String(fallback || ""));
  const fmtQty = (qty) => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 1) {
      return "";
    }
    return ` x${n}`;
  };

  const addedText = added
    .map((row) => {
      const item = row?.item || {};
      const label = labelFor(item.ingredient_key, item.ingredient_name);
      return label ? `${label}${fmtQty(row?.quantity)}` : "";
    })
    .filter((v) => v);

  const consumedText = consumed
    .map((row) => {
      const label = labelFor(row?.ingredient_key, row?.ingredient_name);
      const qty = row?.consumed_quantity === null ? null : row?.requested_quantity;
      return label ? `${label}${qty === null ? "" : fmtQty(qty)}` : "";
    })
    .filter((v) => v);

  const updatedText = updated
    .map((row) => {
      const label = labelFor(row?.ingredient_key, row?.ingredient_name);
      if (!label) {
        return "";
      }
      const action = String(row?.action || "").trim().toLowerCase();
      if (action === "set_quantity") {
        const q = Number(row?.quantity ?? row?.item?.quantity ?? 0);
        if (!Number.isFinite(q) || q <= 0) {
          return label;
        }
        return `${label}=${q}`;
      }
      if (action === "set_expiration") {
        const exp = String(row?.expiration_date || row?.item?.suggested_expiration_date || "").trim();
        return exp ? `${label}(${exp})` : label;
      }
      return label;
    })
    .filter((v) => v);

  const notFoundText = notFound
    .map((row) => {
      const label = labelFor(row?.ingredient_key, row?.ingredient_name);
      return label ? `${label}${fmtQty(row?.quantity)}` : "";
    })
    .filter((v) => v);

  const parts = [];
  if (addedText.length > 0) {
    parts.push(`${currentLang === "ko" ? "추가" : "Added"}: ${addedText.join(", ")}`);
  }
  if (consumedText.length > 0) {
    parts.push(`${currentLang === "ko" ? "소비" : "Consumed"}: ${consumedText.join(", ")}`);
  }
  if (updatedText.length > 0) {
    parts.push(`${currentLang === "ko" ? "수정" : "Updated"}: ${updatedText.join(", ")}`);
  }
  if (notFoundText.length > 0) {
    parts.push(`${currentLang === "ko" ? "없음" : "Not found"}: ${notFoundText.join(", ")}`);
  }

  return parts.join(" | ").trim();
}

async function ingestInventoryFromText(text, sourceType = "realtime_voice") {
  const value = String(text || "").trim();
  if (!value) {
    return null;
  }

  return request("/api/v1/inventory/ingest", {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      ui_lang: currentLang,
      text: value,
      source_type: sourceType,
      purchased_at: todayIso(),
      storage_type: getCaptureStorageType()
    })
  });
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
          <button type="button" class="btn tiny warn draft-action-btn remove-draft-btn">${t("btn_remove_one")}</button>
          <button type="button" class="btn tiny ghost draft-action-btn edit-draft-voice-btn">${t("btn_edit_label_voice")}</button>
          <button type="button" class="btn tiny ghost draft-action-btn edit-draft-btn advanced-only">${t("btn_edit_label")}</button>
        </div>
      `;

      const removeBtn = node.querySelector(".remove-draft-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeBtn.disabled = true;
          try {
            await removeCaptureDraftIngredient(item.ingredient_key, 1, item.unit, false);
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
          } finally {
            removeBtn.disabled = false;
          }
        });
      }

      const voiceBtn = node.querySelector(".edit-draft-voice-btn");
      if (voiceBtn) {
        voiceBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const key = String(item?.ingredient_key || "").trim();
          if (!key) {
            return;
          }

          // Keep it simple: one utterance edits one draft item.
          draftVoiceEditTarget = {
            ingredient_key: key,
            quantity: item?.quantity ?? 1,
            unit: item?.unit || "ea",
            display_name: displayName
          };
          realtimeLastIngestedText = "";
          realtimeLastIngestedAt = 0;
          visionRelabelTargetId = "";

          setRealtimeStatus(`${t("btn_edit_label_voice")}: ${displayName}. ${t("voice_draft_edit_hint")}`);
          updateQuickTalkButton();

          try {
            if (isRealtimeConnected()) {
              stopRealtimeVoice();
            }
            if (browserSpeechRunning) {
              stopBrowserSpeechRecognition();
            }

            if (realtimeQuotaBlocked) {
              startBrowserSpeechRecognition();
              return;
            }

            try {
              await startRealtimeVoice();
            } catch (err) {
              const msg = err?.message || String(err);
              if (/insufficient[_ ]quota/i.test(msg) || /exceeded your current quota/i.test(msg)) {
                realtimeQuotaBlocked = true;
                setRealtimeStatus(t("voice_quota_exceeded"));
                if (isBrowserSpeechSupported()) {
                  startBrowserSpeechRecognition();
                  return;
                }
              }
              throw err;
            }
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
            setRealtimeStatus(tf("voice_start_failed", { msg }));
            draftVoiceEditTarget = null;
          } finally {
            updateQuickTalkButton();
          }
        });
      }

      const editBtn = node.querySelector(".edit-draft-btn");
      if (editBtn) {
        editBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const next = prompt(t("btn_edit_label"), displayName);
          if (!next || !String(next).trim()) {
            return;
          }
          editBtn.disabled = true;
          try {
            await replaceCaptureDraftIngredient(item.ingredient_key, next, item.quantity, item.unit);
          } catch (err) {
            const msg = err?.message || String(err);
            setGlobalError(msg);
            setCaptureError(msg);
          } finally {
            editBtn.disabled = false;
          }
        });
      }
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
      ui_lang: currentLang,
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

  const visionObjects = Array.isArray(result?.data?.vision?.detected_objects) ? result.data.vision.detected_objects : [];
  if (visionObjects.length > 0) {
    setVisionObjectsPreview(imageDataUrl, visionObjects);
  } else {
    clearVisionObjectPreview();
  }

  // If the server learned new localized aliases, refresh the catalog so labels render correctly.
  const locUpdated = Number(result?.data?.localization?.updated_count || 0);
  if (locUpdated > 0) {
    try {
      await loadIngredientLabels(true);
      if (capture) {
        renderCaptureDraft(capture);
      }
      renderInventoryFromCache();
      renderVisionObjectPreview({ skipImageReload: true });
    } catch {}
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
  realtimeLoggedEventTypes = new Set();
  realtimeTranscriptionFallbackApplied = false;
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
                transcription: {
                  model: "gpt-4o-mini-transcribe",
                  language: lang
                },
                turn_detection: {
                  type: "server_vad",
                  create_response: true
                }
              }
            }
          }
        });
      } catch {
        // best-effort only
      }
    });

    dc.addEventListener("message", async (event) => {
      const raw = event?.data;
      if (!raw) {
        return;
      }

      let text = "";
      try {
        if (typeof raw === "string") {
          text = raw;
        } else if (raw instanceof ArrayBuffer) {
          text = new TextDecoder().decode(new Uint8Array(raw));
        } else if (typeof raw === "object" && typeof raw.text === "function") {
          // Blob (Safari often uses this)
          text = await raw.text();
        } else {
          return;
        }
      } catch {
        return;
      }

      let obj = null;
      try {
        obj = text ? JSON.parse(text) : null;
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
  realtimeRecentSpeechTexts = [];
  realtimeLoggedEventTypes = new Set();
  realtimeTranscriptionFallbackApplied = false;
  visionRelabelTargetId = "";
  draftVoiceEditTarget = null;
  setRealtimeStatus(t("voice_stopped"));
  updateQuickTalkButton();
}

function logRealtimeEventTypeOnce(type) {
  const tpe = String(type || "").trim();
  if (!tpe) {
    return;
  }
  if (realtimeLoggedEventTypes.has(tpe)) {
    return;
  }
  realtimeLoggedEventTypes.add(tpe);
  appendRealtimeLogLine("event", tpe);
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

function queueRealtimeSpeechIngest(finalText, sourceType = "realtime_voice") {
  const text = String(finalText || "").trim();
  if (!text) {
    return;
  }

  const now = Date.now();
  if (text === realtimeLastIngestedText && now - realtimeLastIngestedAt < 4500) {
    return;
  }
  realtimeLastIngestedText = text;
  realtimeLastIngestedAt = now;
  const recentContext = Array.isArray(realtimeRecentSpeechTexts) ? realtimeRecentSpeechTexts.slice(-2) : [];
  realtimeRecentSpeechTexts = [...recentContext, text].slice(-4);

  if (draftVoiceEditTarget) {
    const target = draftVoiceEditTarget;
    draftVoiceEditTarget = null;
    const key = String(target?.ingredient_key || "").trim();
    if (!key) {
      return;
    }

    const normalized = text.toLowerCase();
    const deleteIntent =
      /\b(remove|delete)\b/i.test(normalized) || /삭제|지워|빼|제거|없애|버려/.test(normalized);

    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("draft(edit)", text);

    realtimeIngestChain = realtimeIngestChain
      .then(() => {
        if (deleteIntent) {
          return removeCaptureDraftIngredient(key, 1, target?.unit || "ea", true);
        }
        return replaceCaptureDraftIngredient(key, text, target?.quantity ?? 1, target?.unit || "ea");
      })
      .then(() => {
        appendRealtimeLogLine("system", t("voice_draft_updated"));
        setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
        setGlobalError(msg);
        setCaptureError(msg);
        setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      });
    return;
  }

  if (visionRelabelTargetId) {
    const targetId = visionRelabelTargetId;
    visionRelabelTargetId = "";
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("label", text);

    realtimeIngestChain = realtimeIngestChain
      .then(() => replaceVisionObjectLabel(targetId, text, { quantity: 1, unit: "ea" }))
      .then(() => {
        setRealtimeStatus(t("voice_draft_updated"));
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
        setGlobalError(msg);
        setCaptureError(msg);
        setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      });
    return;
  }

  setRealtimeStatus(tf("voice_heard", { text }));
  appendRealtimeLogLine("me", text);

  const autoIngest = isEasyMode() || ($("realtimeAutoIngestSpeech") && $("realtimeAutoIngestSpeech").checked);
  if (!autoIngest) {
    return;
  }

  if (isEasyMode()) {
    realtimeIngestChain = realtimeIngestChain
      .then(() => ingestInventoryFromText(text, sourceType))
      .then(async (res) => {
        let data = res?.data || null;
        let summary = data ? formatInventoryIngestSummary(data) : "";

        // Multi-turn repair: if this turn has no parsed food action, retry with previous speech context.
        if (!summary && recentContext.length > 0) {
          const candidates = [];
          const prev1 = String(recentContext[recentContext.length - 1] || "").trim();
          const prev2 = String(recentContext[recentContext.length - 2] || "").trim();
          if (prev1) {
            candidates.push(`${prev1} ${text}`.trim());
          }
          if (prev2 && prev1) {
            candidates.push(`${prev2} ${prev1} ${text}`.trim());
          }

          for (const candidate of candidates) {
            if (!candidate || candidate === text) {
              continue;
            }
            const retry = await ingestInventoryFromText(candidate, `${sourceType}_context`);
            const retryData = retry?.data || null;
            const retrySummary = retryData ? formatInventoryIngestSummary(retryData) : "";
            if (retrySummary) {
              data = retryData;
              summary = retrySummary;
              break;
            }
          }
        }

        if (!summary) {
          appendRealtimeLogLine("system", t("voice_inventory_no_items"));
          setRealtimeStatus(t("voice_inventory_no_items"));
        } else {
          appendRealtimeLogLine("system", tf("voice_inventory_updated", { summary }));
          setRealtimeStatus(tf("voice_inventory_updated", { summary }));
        }

        await refreshAll();
        return res;
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        appendRealtimeLogLine("system", tf("voice_inventory_update_failed", { msg }));
        setGlobalError(msg);
        setRealtimeStatus(tf("voice_inventory_update_failed", { msg }));
      });
    return;
  }

  realtimeIngestChain = realtimeIngestChain
    .then(() =>
      sendCaptureMessagePayload({
        source_type: sourceType,
        text,
        vision_detected_items: []
      })
    )
    .then((res) => {
      appendRealtimeLogLine("system", t("voice_draft_updated"));
      setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
      return res;
    })
    .catch((err) => {
      const msg = err?.message || "unknown error";
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setGlobalError(msg);
      setCaptureError(msg);
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
    });
}

function getBrowserSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isBrowserSpeechSupported() {
  return Boolean(getBrowserSpeechRecognitionCtor());
}

function startBrowserSpeechRecognition() {
  const Ctor = getBrowserSpeechRecognitionCtor();
  if (!Ctor) {
    throw new Error("Browser speech recognition is not supported in this browser.");
  }

  browserSpeechFinalText = "";
  browserSpeechInterimText = "";

  const recognizer = new Ctor();
  browserSpeechRecognizer = recognizer;
  browserSpeechRunning = true;

  recognizer.lang = currentLang === "ko" ? "ko-KR" : "en-US";
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;

  recognizer.onresult = (event) => {
    let finalText = browserSpeechFinalText;
    let interimText = "";

    const results = event?.results;
    if (results && typeof results.length === "number") {
      for (let i = event.resultIndex || 0; i < results.length; i++) {
        const res = results[i];
        const alt = res && res[0];
        const transcript = alt && typeof alt.transcript === "string" ? alt.transcript : "";
        if (!transcript) {
          continue;
        }
        if (res.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }
    }

    browserSpeechFinalText = finalText;
    browserSpeechInterimText = interimText;
    setRealtimeStatus(t("voice_listening"));
  };

  recognizer.onerror = (event) => {
    const msg = (event && event.error) || "speech_error";
    setRealtimeStatus(tf("voice_error_prefix", { msg }));
    appendRealtimeLogLine("browser_stt_error", String(msg));
    stopBrowserSpeechRecognition();
  };

  recognizer.onend = () => {
    // Always transition to not-running first so UI updates correctly.
    browserSpeechRunning = false;
    updateQuickTalkButton();

    const text = String(browserSpeechFinalText || browserSpeechInterimText || "").trim();
    browserSpeechFinalText = "";
    browserSpeechInterimText = "";

    if (text) {
      queueRealtimeSpeechIngest(text, "browser_speech");
    } else {
      setRealtimeStatus(t("voice_idle"));
    }
  };

  setRealtimeStatus(t("voice_ready"));
  updateQuickTalkButton();
  recognizer.start();
}

function stopBrowserSpeechRecognition() {
  const recognizer = browserSpeechRecognizer;
  browserSpeechRecognizer = null;
  browserSpeechRunning = false;
  visionRelabelTargetId = "";
  draftVoiceEditTarget = null;
  try {
    recognizer?.stop?.();
  } catch {}
  updateQuickTalkButton();
}

function formatRealtimeError(err) {
  const e = err && typeof err === "object" ? err : {};
  const message = typeof e.message === "string" ? e.message.trim() : "";
  const code = typeof e.code === "string" ? e.code.trim() : "";
  const type = typeof e.type === "string" ? e.type.trim() : "";

  const bits = [];
  if (message) bits.push(message);
  if (code) bits.push(code);
  if (!message && type) bits.push(type);
  return bits.join(" | ") || "unknown error";
}

function maybeApplyRealtimeTranscriptionFallback() {
  if (realtimeTranscriptionFallbackApplied) {
    return;
  }
  realtimeTranscriptionFallbackApplied = true;

  // Try switching ASR model once. This will only help for subsequent turns.
  try {
    const lang = currentLang === "ko" ? "ko" : "en";
    realtimeSendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            transcription: {
              model: "whisper-1",
              language: lang
            }
          }
        }
      }
    });
    appendRealtimeLogLine("system", "Applied transcription fallback (whisper-1). Speak again.");
  } catch {}
}

function handleRealtimeEvent(evt) {
  const type = String(evt?.type || "").trim();
  if (!type) {
    return;
  }

  logRealtimeEventTypeOnce(type);

  if (type === "error") {
    const msg = evt?.error?.message || evt?.message || "Unknown realtime error.";
    appendRealtimeLogLine("error", msg);
    setRealtimeStatus(tf("voice_error_prefix", { msg }));
    return;
  }

  if (type === "conversation.item.input_audio_transcription.failed") {
    const errObj = evt?.error;
    const errCode = errObj && typeof errObj.code === "string" ? errObj.code.trim() : "";
    const errMsg = formatRealtimeError(errObj);
    appendRealtimeLogLine("stt_failed", errMsg);
    if (errCode === "insufficient_quota" || /insufficient[_ ]quota/i.test(errMsg) || /exceeded your current quota/i.test(errMsg)) {
      realtimeQuotaBlocked = true;
      setRealtimeStatus(t("voice_quota_exceeded"));
      appendRealtimeLogLine("system", t("voice_quota_exceeded"));
      stopRealtimeVoice();
      updateQuickTalkButton();
      return;
    }

    setRealtimeStatus(tf("voice_error_prefix", { msg: errMsg }));
    maybeApplyRealtimeTranscriptionFallback();
    return;
  }

  if (type === "input_audio_buffer.speech_started") {
    setRealtimeStatus(t("voice_listening"));
    return;
  }

  if (type === "input_audio_buffer.speech_stopped" || type === "input_audio_buffer.committed") {
    setRealtimeStatus(t("voice_processing"));
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

    const deltaText = String(realtimeUserTranscriptDelta || "").trim();
    const transcriptText = String(transcript || "").trim();
    let finalText = "";
    if (deltaText && transcriptText) {
      if (transcriptText.includes(deltaText)) {
        finalText = transcriptText;
      } else if (deltaText.includes(transcriptText)) {
        finalText = deltaText;
      } else {
        finalText = `${deltaText} ${transcriptText}`.trim();
      }
    } else {
      finalText = (transcriptText || deltaText).trim();
    }
    if (finalText) {
      realtimeUserTranscriptDelta = "";
      queueRealtimeSpeechIngest(finalText);
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

  // We intentionally do not ingest from user conversation items, because we already ingest from
  // input_audio_transcription events. Ingesting both can double-send partial transcripts.

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

async function applyPendingVisionEditsToDraftBeforeFinalize() {
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    return;
  }

  const list = $("visionObjectList");
  if (!list) {
    return;
  }

  const placeholder = String(t("word_new_item") || "").trim();
  const placeholderEn = "New item";
  const placeholderKo = "새 항목";
  const pending = [];

  const nodes = Array.from(list.querySelectorAll(".vision-object"));
  for (const node of nodes) {
    const oid = String(node?.dataset?.objectId || "").trim();
    if (!oid) {
      continue;
    }

    const obj = (visionObjectsCache || []).find((o) => String(o?.id || "") === oid) || null;
    if (!obj) {
      continue;
    }

    const editRow = node.querySelector(".vision-edit-row");
    const input = node.querySelector(".vision-edit-input");
    if (!input) {
      continue;
    }

    const label = String(input.value || "").trim();
    const needsApply = (editRow && editRow.hidden === false) || obj.draft_applied === false;
    if (!needsApply) {
      continue;
    }

    if (!label || label === placeholder || label === placeholderEn || label === placeholderKo) {
      // Prevent finalizing a "New item" without an actual name.
      throw new Error(t("err_vision_label_required"));
    }

    pending.push({ id: oid, label, quantity: obj.quantity ?? 1, unit: obj.unit || "ea" });
  }

  for (const p of pending) {
    await replaceVisionObjectLabel(p.id, p.label, { quantity: p.quantity, unit: p.unit });
  }
}

async function finalizeCaptureSession() {
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    throw new Error(t("err_no_capture_session"));
  }

  // If the user typed labels for new/moved boxes but didn't tap "Save", apply them now so Finalize works.
  await applyPendingVisionEditsToDraftBeforeFinalize();

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
  setInventoryFilterStorage(getCaptureStorageType());
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
  clearInventorySelection();
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
    syncInventoryBulkBar();
    return;
  }

  filtered.forEach((item) => list.appendChild(buildInventoryNode(item)));
  syncInventoryBulkBar();
}

function getVisibleInventoryItems() {
  const items = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  return items.filter((item) => normalizeStorageType(item?.storage_type || "") === inventoryFilterStorage);
}

function detectDefaultShoppingAutoOnly() {
  const raw = String(localStorage.getItem(SHOPPING_AUTO_ONLY_STORAGE_KEY) || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  return false;
}

function getVisibleShoppingItems() {
  const rows = Array.isArray(shoppingItemsCache) ? shoppingItemsCache : [];
  if (!shoppingAutoOnly) {
    return rows;
  }
  return rows.filter((item) => item && item.auto_order_candidate === true);
}

function syncShoppingFilterUI() {
  const btn = $("toggleShoppingAutoFilterBtn");
  if (!btn) {
    return;
  }
  btn.classList.toggle("active", shoppingAutoOnly);
  btn.textContent = shoppingAutoOnly ? t("btn_shopping_show_all") : t("btn_shopping_auto_only");
}

function setShoppingAutoOnly(enabled, options = {}) {
  shoppingAutoOnly = Boolean(enabled);
  if (options?.persist !== false) {
    localStorage.setItem(SHOPPING_AUTO_ONLY_STORAGE_KEY, shoppingAutoOnly ? "true" : "false");
  }
  syncShoppingFilterUI();
  if (options?.render !== false) {
    renderShoppingFromCache();
  }
}

function clearInventorySelection() {
  inventorySelectedIds = new Set();
  const selectAll = $("inventorySelectAll");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
  syncInventoryBulkBar();
}

function syncInventoryBulkBar() {
  const countEl = $("inventorySelectedCount");
  const addBtn = $("inventoryBulkAddBtn");
  const delBtn = $("inventoryBulkDeleteBtn");
  const clearBtn = $("inventoryBulkClearBtn");
  const selectAll = $("inventorySelectAll");

  const visible = getVisibleInventoryItems();
  const visibleIds = new Set(visible.map((i) => String(i.id)));
  const selectedVisible = Array.from(inventorySelectedIds).filter((id) => visibleIds.has(String(id)));

  // Drop selections for items that no longer exist.
  const allIds = new Set((Array.isArray(inventoryItemsCache) ? inventoryItemsCache : []).map((i) => String(i?.id || "")));
  const nextSelected = new Set();
  for (const id of inventorySelectedIds) {
    if (allIds.has(String(id))) {
      nextSelected.add(String(id));
    }
  }
  inventorySelectedIds = nextSelected;

  if (countEl) {
    countEl.textContent = tf("inventory_selected_count", { count: selectedVisible.length });
  }

  const hasAny = selectedVisible.length > 0;
  if (addBtn) addBtn.disabled = !hasAny;
  if (delBtn) delBtn.disabled = !hasAny;
  if (clearBtn) clearBtn.disabled = !hasAny;

  if (selectAll) {
    if (visible.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
    } else {
      selectAll.disabled = false;
      const selectedCount = selectedVisible.length;
      selectAll.checked = selectedCount > 0 && selectedCount === visible.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;
    }
  }

  // Ensure checkboxes reflect the selection set (for actions like "Clear").
  const list = $("inventoryList");
  if (list) {
    list.querySelectorAll(".inventory-item").forEach((node) => {
      const id = String(node?.dataset?.itemId || "").trim();
      const cb = node.querySelector(".inventory-select");
      if (cb && id) {
        cb.checked = inventorySelectedIds.has(id);
      }
    });
  }
}

async function adjustInventoryItemQuantity(itemId, deltaQuantity) {
  const id = String(itemId || "").trim();
  if (!id) {
    return null;
  }
  const delta = Number(deltaQuantity);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }
  const result = await request(`/api/v1/inventory/items/${id}/adjust`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      delta_quantity: delta
    })
  });
  return result?.data?.item || null;
}

async function deleteInventoryItem(itemId) {
  const id = String(itemId || "").trim();
  if (!id) {
    return null;
  }
  const result = await request(`/api/v1/inventory/items/${id}/delete`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId()
    })
  });
  return result?.data || null;
}

async function bulkAdjustSelectedInventory(deltaQuantity) {
  const visible = getVisibleInventoryItems();
  const visibleIds = new Set(visible.map((i) => String(i.id)));
  const selected = Array.from(inventorySelectedIds).filter((id) => visibleIds.has(String(id)));
  if (selected.length === 0) {
    return;
  }

  const addBtn = $("inventoryBulkAddBtn");
  const delBtn = $("inventoryBulkDeleteBtn");
  const clearBtn = $("inventoryBulkClearBtn");
  const selectAll = $("inventorySelectAll");
  if (addBtn) addBtn.disabled = true;
  if (delBtn) delBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;
  if (selectAll) selectAll.disabled = true;

  try {
    for (const id of selected) {
      await adjustInventoryItemQuantity(id, deltaQuantity);
    }
    await refreshAll();
    clearInventorySelection();
  } finally {
    syncInventoryBulkBar();
  }
}

async function bulkDeleteSelectedInventory() {
  const visible = getVisibleInventoryItems();
  const visibleIds = new Set(visible.map((i) => String(i.id)));
  const selected = Array.from(inventorySelectedIds).filter((id) => visibleIds.has(String(id)));
  if (selected.length === 0) {
    return;
  }

  const ok = confirm(`${t("btn_delete_selected")}: ${selected.length}`);
  if (!ok) {
    return;
  }

  const addBtn = $("inventoryBulkAddBtn");
  const delBtn = $("inventoryBulkDeleteBtn");
  const clearBtn = $("inventoryBulkClearBtn");
  const selectAll = $("inventorySelectAll");
  if (addBtn) addBtn.disabled = true;
  if (delBtn) delBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;
  if (selectAll) selectAll.disabled = true;

  try {
    for (const id of selected) {
      await deleteInventoryItem(id);
    }
    await refreshAll();
    clearInventorySelection();
  } finally {
    syncInventoryBulkBar();
  }
}

function buildInventoryNode(item) {
  const tpl = $("inventoryItemTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = String(item.id);

  const selectEl = node.querySelector(".inventory-select");
  if (selectEl) {
    selectEl.checked = inventorySelectedIds.has(String(item.id));
    selectEl.addEventListener("change", () => {
      const id = String(item.id);
      if (selectEl.checked) {
        inventorySelectedIds.add(id);
      } else {
        inventorySelectedIds.delete(id);
      }
      syncInventoryBulkBar();
    });
  }

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

function normalizeRecipeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "seed";
  }
  if (raw === "google_web") {
    return "google";
  }
  if (raw === "themealdb") {
    return "recipe_site";
  }
  if (raw === "catalog") {
    return "seed";
  }
  return raw;
}

function getRecipeProviderFromItem(item) {
  const sourceProvider = String(item?.source_provider || "").trim();
  if (sourceProvider) {
    return normalizeRecipeProvider(sourceProvider);
  }
  return normalizeRecipeProvider(item?.source_type || "seed");
}

function recipeProviderLabel(provider) {
  const key = normalizeRecipeProvider(provider);
  if (currentLang === "ko") {
    const labelsKo = {
      youtube: "유튜브",
      naver_blog: "네이버 블로그",
      naver_web: "네이버 웹",
      google: "구글",
      recipe_site: "레시피 사이트",
      seed: "기본 레시피",
      other: "기타"
    };
    return labelsKo[key] || labelsKo.other;
  }

  const labelsEn = {
    youtube: "YouTube",
    naver_blog: "Naver Blog",
    naver_web: "Naver Web",
    google: "Google",
    recipe_site: "Recipe Sites",
    seed: "Catalog",
    other: "Other"
  };
  return labelsEn[key] || labelsEn.other;
}

function buildRecipeGroups(payload) {
  const groups = [];
  const groupedFromApi = Array.isArray(payload?.grouped_items) ? payload.grouped_items : [];
  if (groupedFromApi.length > 0) {
    for (const row of groupedFromApi) {
      const provider = normalizeRecipeProvider(row?.provider || "");
      const items = Array.isArray(row?.items) ? row.items : [];
      if (items.length === 0) {
        continue;
      }
      groups.push({
        provider,
        items
      });
    }
    if (groups.length > 0) {
      return groups;
    }
  }

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const map = new Map();
  for (const item of rows) {
    const provider = getRecipeProviderFromItem(item);
    if (!map.has(provider)) {
      map.set(provider, []);
    }
    map.get(provider).push(item);
  }

  const defaultOrder = ["youtube", "naver_blog", "naver_web", "google", "recipe_site", "seed"];
  const seen = new Set();
  for (const provider of defaultOrder) {
    const items = map.get(provider);
    if (items && items.length > 0) {
      seen.add(provider);
      groups.push({ provider, items });
    }
  }
  for (const [provider, items] of map.entries()) {
    if (seen.has(provider)) {
      continue;
    }
    groups.push({ provider, items });
  }
  return groups;
}

function buildRecipeNode(r) {
  const node = document.createElement("div");
  node.className = "item";
  const missingKeys = Array.isArray(r.missing_ingredient_keys) ? r.missing_ingredient_keys : [];
  const missing = missingKeys
    .map((k) => ingredientLabel(k, k))
    .filter((v) => String(v || "").trim())
    .join(", ");
  const extractionStatus = String(r?.ingredient_extraction_status || "").trim().toLowerCase();
  let missingLabel = missing || t("word_none");
  if (!missing && (extractionStatus === "pending" || extractionStatus === "unavailable")) {
    missingLabel = t("meta_recipe_missing_unknown");
  }

  const main = document.createElement("div");
  main.className = "item-main";

  const name = document.createElement("strong");
  name.className = "name";
  name.textContent = String(r.recipe_name || "").trim() || String(r.recipe_id || "");
  main.appendChild(name);

  const metaLine = document.createElement("span");
  metaLine.className = "meta";
  metaLine.textContent = tf("meta_recipe_line", {
    chef: r.chef,
    score: r.score,
    match: `${(r.match_ratio * 100).toFixed(0)}`
  });
  main.appendChild(metaLine);

  const metaMissing = document.createElement("span");
  metaMissing.className = "meta";
  metaMissing.textContent = tf("meta_recipe_missing", { missing: missingLabel });
  main.appendChild(metaMissing);

  if (r?.source_type) {
    const sourceMeta = document.createElement("span");
    sourceMeta.className = "meta";

    const sourceLabel = [
      String(r.source_channel || "").trim(),
      String(r.source_title || "").trim()
    ]
      .filter((v) => v)
      .join(" | ");

    sourceMeta.appendChild(document.createTextNode(`${t("word_source")}: ${sourceLabel || String(r.source_type)}`));
    if (r?.source_url) {
      sourceMeta.appendChild(document.createTextNode(" "));
      const link = document.createElement("a");
      link.href = String(r.source_url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("word_link");
      sourceMeta.appendChild(link);
    }
    main.appendChild(sourceMeta);
  }

  const side = document.createElement("div");
  side.className = "item-side";
  side.appendChild(statusBadge(r.can_make_now ? "fresh" : "expiring_soon"));

  node.appendChild(main);
  node.appendChild(side);
  return node;
}

function renderRecipeList(payload) {
  const list = $("recipeList");
  list.innerHTML = "";

  const groups = buildRecipeGroups(payload || {});
  if (groups.length === 0) {
    list.appendChild(emptyNode(t("empty_recipes")));
    return;
  }

  const groupHost = document.createElement("div");
  groupHost.className = "recipe-groups";
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "recipe-group";

    const head = document.createElement("div");
    head.className = "recipe-group-head";

    const title = document.createElement("h3");
    title.className = "recipe-group-title";
    title.textContent = recipeProviderLabel(group.provider);

    const count = document.createElement("span");
    count.className = "recipe-group-count";
    count.textContent = `${group.items.length}`;

    head.appendChild(title);
    head.appendChild(count);
    section.appendChild(head);

    const subList = document.createElement("div");
    subList.className = "list";
    group.items.forEach((item) => {
      subList.appendChild(buildRecipeNode(item));
    });
    section.appendChild(subList);
    groupHost.appendChild(section);
  });

  list.appendChild(groupHost);
}

async function loadRecipes() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8, ui_lang: currentLang });
  const result = await request(`/api/v1/recommendations/recipes?${q}`, { method: "GET" });
  renderRecipeList(result.data || {});
}

function renderShopping(items) {
  const list = $("shoppingList");
  list.innerHTML = "";
  if (!items.length) {
    const emptyKey = shoppingAutoOnly ? "empty_shopping_auto_only" : "empty_shopping";
    list.appendChild(emptyNode(t(emptyKey)));
    return;
  }

  items.forEach((s) => {
    const node = document.createElement("div");
    node.className = "item";
    const label = ingredientLabel(s.ingredient_key, s.ingredient_key);
    const reasons = Array.isArray(s.reason_labels) && s.reason_labels.length > 0
      ? s.reason_labels.join(", ")
      : Array.isArray(s.reasons)
        ? s.reasons.join(", ")
        : "";
    const related =
      Array.isArray(s.related_recipe_names) && s.related_recipe_names.length > 0
        ? s.related_recipe_names.join(", ")
        : Array.isArray(s.related_recipe_ids) && s.related_recipe_ids.length > 0
          ? s.related_recipe_ids.join(", ")
        : t("word_none");
    const usage = s.usage && typeof s.usage === "object" ? s.usage : null;
    const usageMeta = usage
      ? currentLang === "ko"
        ? `\uC0AC\uC6A9\uB7C9: ${Number(usage.avg_daily_consumption || 0)}/\uC77C | \uC608\uC0C1 \uC18C\uC9C4: ${
            Number.isFinite(Number(usage.projected_days_left))
              ? `${usage.projected_days_left}\uC77C`
              : "-"
          }`
        : `usage: ${Number(usage.avg_daily_consumption || 0)}/day | projected runout: ${
            Number.isFinite(Number(usage.projected_days_left)) ? `${usage.projected_days_left}d` : "-"
          }`
      : "";
    const autoOrderMeta = s.auto_order_candidate
      ? currentLang === "ko"
        ? `\uC790\uB3D9 \uC8FC\uBB38 \uD6C4\uBCF4 (\uAD8C\uC7A5 \uC218\uB7C9 ${Number(s?.auto_order_hint?.suggested_quantity || 1)})`
        : `auto-order candidate (suggested qty ${Number(s?.auto_order_hint?.suggested_quantity || 1)})`
      : "";
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${label}</strong>
        <span class="meta">${tf("meta_shopping_reasons", { reasons })}</span>
        <span class="meta">${tf("meta_shopping_related", { related })}</span>
        ${usageMeta ? `<span class="meta">${usageMeta}</span>` : ""}
        ${autoOrderMeta ? `<span class="meta">${autoOrderMeta}</span>` : ""}
      </div>
      <div class="item-side">
        <span class="badge fresh">P${s.priority}</span>
      </div>
    `;
    list.appendChild(node);
  });
}

function renderShoppingFromCache() {
  const visible = getVisibleShoppingItems();
  renderShopping(visible);
}

async function loadShopping() {
  await loadIngredientLabels();
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8, top_recipe_count: 3, ui_lang: currentLang });
  const result = await request(`/api/v1/shopping/suggestions?${q}`, { method: "GET" });
  shoppingItemsCache = Array.isArray(result?.data?.items) ? result.data.items : [];
  renderShoppingFromCache();
}

function normalizeDraftQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(n));
}

async function createOrderDraftFromVisibleShopping() {
  const userId = getUserId();
  const items = getVisibleShoppingItems();
  if (!items.length) {
    throw new Error(t("err_order_draft_no_items"));
  }

  const draftItems = items.map((item) => ({
    ingredient_key: String(item?.ingredient_key || "").trim(),
    ingredient_name: ingredientLabel(item?.ingredient_key || "", item?.ingredient_key || ""),
    quantity: normalizeDraftQuantity(item?.auto_order_hint?.suggested_quantity || 1),
    unit: "ea",
    reasons: Array.isArray(item?.reasons) ? item.reasons : [],
    priority: Number(item?.priority || 0),
    auto_order_candidate: Boolean(item?.auto_order_candidate)
  }));

  const result = await request("/api/v1/shopping/order-drafts", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      source: "shopping_ui",
      provider: "mixed",
      items: draftItems
    })
  });

  const draft = result?.data?.draft || null;
  const resultEl = $("shoppingDraftResult");
  if (resultEl && draft) {
    resultEl.textContent = tf("toast_order_draft_created", {
      id: draft.id,
      count: Number(draft?.summary?.line_count || draftItems.length)
    });
  }
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
  // Show only pending notifications by default.
  const q = encodeQuery({ user_id: userId, status: "pending" });
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
  window.addEventListener("resize", () => {
    if (!document.hidden) {
      drawVisionOverlay();
    }
  });
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
  if ($("inventorySelectAll")) {
    $("inventorySelectAll").addEventListener("change", () => {
      const visible = getVisibleInventoryItems();
      const ids = visible.map((i) => String(i.id));
      if ($("inventorySelectAll").checked) {
        ids.forEach((id) => inventorySelectedIds.add(id));
      } else {
        ids.forEach((id) => inventorySelectedIds.delete(id));
      }
      syncInventoryBulkBar();
    });
  }
  if ($("inventoryBulkAddBtn")) {
    $("inventoryBulkAddBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await bulkAdjustSelectedInventory(1);
      } catch (err) {
        setGlobalError(err?.message || String(err));
      }
    });
  }
  if ($("inventoryBulkDeleteBtn")) {
    $("inventoryBulkDeleteBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await bulkDeleteSelectedInventory();
      } catch (err) {
        setGlobalError(err?.message || String(err));
      }
    });
  }
  if ($("inventoryBulkClearBtn")) {
    $("inventoryBulkClearBtn").addEventListener("click", (event) => {
      event.preventDefault();
      clearInventorySelection();
      renderInventoryFromCache();
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
  if ($("visionPreviewCanvas")) {
    const canvas = $("visionPreviewCanvas");
    const onDown = (event) => {
      const img = $("visionPreviewImage");
      if (!img) {
        return;
      }
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;

      if (visionEditMode === "add") {
        visionPointerState = {
          pointerId: event.pointerId,
          action: "draw",
          startNx: clamp(nx, 0, 1),
          startNy: clamp(ny, 0, 1)
        };
        visionTempBbox = { x: visionPointerState.startNx, y: visionPointerState.startNy, w: 0, h: 0 };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {}
        drawVisionOverlay();
        event.preventDefault();
        return;
      }

      const hit = findVisionObjectAt(nx, ny);
      if (hit?.id) {
        selectVisionObject(hit.id);
      }

      const selected = getSelectedVisionObject();
      const handle = getHandleAtPoint(selected, nx, ny, rect);
      if (selected && handle) {
        visionPointerState = {
          pointerId: event.pointerId,
          action: "resize",
          handle,
          objectId: selected.id,
          startNx: clamp(nx, 0, 1),
          startNy: clamp(ny, 0, 1),
          startBbox: { ...selected.bbox }
        };
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {}
        event.preventDefault();
        return;
      }

      if (selected?.bbox) {
        const bb = selected.bbox;
        const x = Number(bb.x);
        const y = Number(bb.y);
        const w = Number(bb.w);
        const h = Number(bb.h);
        if ([x, y, w, h].every(Number.isFinite) && nx >= x && ny >= y && nx <= x + w && ny <= y + h) {
          visionPointerState = {
            pointerId: event.pointerId,
            action: "move",
            objectId: selected.id,
            startNx: clamp(nx, 0, 1),
            startNy: clamp(ny, 0, 1),
            startBbox: { ...selected.bbox }
          };
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {}
          event.preventDefault();
        }
      }
    };

    const onMove = (event) => {
      const img = $("visionPreviewImage");
      if (!img || !visionPointerState) {
        return;
      }
      if (event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      if (visionPointerState.action === "draw") {
        const bb = normalizeBboxFromPoints(visionPointerState.startNx, visionPointerState.startNy, nx, ny);
        visionTempBbox = bb || null;
        drawVisionOverlay();
        event.preventDefault();
        return;
      }

      if (visionPointerState.action === "move") {
        const start = visionPointerState.startBbox;
        const dx = nx - visionPointerState.startNx;
        const dy = ny - visionPointerState.startNy;
        const x = clamp(Number(start.x) + dx, 0, 1 - Number(start.w));
        const y = clamp(Number(start.y) + dy, 0, 1 - Number(start.h));
        updateObjectBbox(visionPointerState.objectId, { x, y, w: start.w, h: start.h });
        drawVisionOverlay();
        event.preventDefault();
        return;
      }

      if (visionPointerState.action === "resize") {
        const start = visionPointerState.startBbox;
        const x1 = Number(start.x);
        const y1 = Number(start.y);
        const x2 = x1 + Number(start.w);
        const y2 = y1 + Number(start.h);

        let ax = x1;
        let ay = y1;
        let bx = x2;
        let by = y2;

        switch (visionPointerState.handle) {
          case "nw":
            ax = nx;
            ay = ny;
            break;
          case "ne":
            bx = nx;
            ay = ny;
            break;
          case "sw":
            ax = nx;
            by = ny;
            break;
          case "se":
            bx = nx;
            by = ny;
            break;
        }

        const bb = normalizeBboxFromPoints(ax, ay, bx, by);
        if (bb) {
          updateObjectBbox(visionPointerState.objectId, bb);
          drawVisionOverlay();
        }
        event.preventDefault();
      }
    };

    const onUp = (event) => {
      if (!visionPointerState || event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      const action = visionPointerState.action;
      visionPointerState = null;

      if (action === "draw") {
        const bb = visionTempBbox;
        visionTempBbox = null;
        setVisionEditMode("select");
        if (bb) {
          const obj = buildCustomVisionObject(bb);
          visionObjectsCache = (visionObjectsCache || []).concat([obj]);
          visionSelectedObjectId = obj.id;
          renderVisionObjectPreview({ skipImageReload: true });
          openVisionObjectEdit(obj.id);
        } else {
          drawVisionOverlay();
        }
      }
      event.preventDefault();
    };

    const onCancel = (event) => {
      if (!visionPointerState || event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      visionPointerState = null;
      visionTempBbox = null;
      setVisionEditMode("select");
      drawVisionOverlay();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
  }
  if ($("visionAddBoxBtn")) {
    $("visionAddBoxBtn").addEventListener("click", (event) => {
      event.preventDefault();
      const next = visionEditMode === "add" ? "select" : "add";
      setVisionEditMode(next);
      drawVisionOverlay();
    });
  }
  if ($("visionDeleteBoxBtn")) {
    $("visionDeleteBoxBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      const obj = getSelectedVisionObject();
      if (!obj) {
        return;
      }
      const label = getVisionObjectDisplayLabel(obj);
      const ok = confirm(`${t("btn_delete_box")}: ${label}?`);
      if (!ok) {
        return;
      }
      const btn = $("visionDeleteBoxBtn");
      if (btn) {
        btn.disabled = true;
      }
      try {
        await deleteVisionObject(obj.id);
      } catch (err) {
        const msg = err?.message || String(err);
        setGlobalError(msg);
        setCaptureError(msg);
      } finally {
        if (btn) {
          btn.disabled = false;
        }
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
          const pendingText = String(realtimeUserTranscriptDelta || "").trim();
          realtimeUserTranscriptDelta = "";
          stopRealtimeVoice();
          if (pendingText) {
            queueRealtimeSpeechIngest(pendingText);
          }
        } else if (browserSpeechRunning) {
          stopBrowserSpeechRecognition();
        } else if (realtimeQuotaBlocked) {
          if (!isBrowserSpeechSupported()) {
            throw new Error("Speech recognition is not supported in this browser.");
          }
          startBrowserSpeechRecognition();
        } else {
          try {
            await startRealtimeVoice();
          } catch (err) {
            const msg = err?.message || String(err);
            if (/insufficient[_ ]quota/i.test(msg) || /exceeded your current quota/i.test(msg)) {
              realtimeQuotaBlocked = true;
              setRealtimeStatus(t("voice_quota_exceeded"));
              if (isBrowserSpeechSupported()) {
                startBrowserSpeechRecognition();
                return;
              }
            }
            throw err;
          }
        }
      } catch (err) {
        const msg = err?.message || String(err);
        setGlobalError(msg);
        setRealtimeStatus(tf("voice_error_prefix", { msg }));
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
  if ($("toggleShoppingAutoFilterBtn")) {
    $("toggleShoppingAutoFilterBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      setShoppingAutoOnly(!shoppingAutoOnly, { persist: true, render: true });
    });
  }
  if ($("createOrderDraftBtn")) {
    $("createOrderDraftBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await createOrderDraftFromVisibleShopping();
      } catch (err) {
        setGlobalError(err?.message || String(err));
      }
    });
  }
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
  setShoppingAutoOnly(detectDefaultShoppingAutoOnly(), { persist: false, render: false });

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
