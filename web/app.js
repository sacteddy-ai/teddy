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
let realtimeLastVisionRelabelAt = 0;
let realtimeLastVisionTargetObjectId = "";
let realtimeLastVisionTargetAt = 0;
let realtimePendingInventoryText = "";
let realtimePendingInventoryAt = 0;
let realtimeLastAutoIngestKey = "";
let realtimeLastAutoIngestAt = 0;
let realtimeLoggedEventTypes = new Set();
let realtimeTranscriptionFallbackApplied = false;
let realtimeQuotaBlocked = false;

let visionLastImageDataUrl = "";
let visionObjectsCache = [];
let captureDraftItemsCache = [];
let visionSelectedObjectId = "";
let visionRelabelTargetId = "";
let draftVoiceEditTarget = null; // { ingredient_key, quantity, unit, display_name }
let visionEditMode = "select"; // select | add
let visionPointerState = null;
let visionLastTapAt = 0;
let visionLastTapObjectId = "";

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
const NOTIFICATION_DAY_PRESETS = [14, 7, 3, 1, 0];
let notificationDayOffsets = [3, 1, 0];
let notificationCustomDayPresets = [];
let notificationDayBounds = { min: 0, max: 60 };

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
    vision_objects_hint: "Tap to select a spot. Tap Add Spot, then tap image to place one. Rename by text or voice.",
    btn_edit_label: "Edit",
    btn_edit_label_voice: "Edit by Voice",
    btn_remove_one: "Remove 1",
    btn_save_label: "Save",
    btn_cancel_label: "Cancel",
    vision_badge_ok: "ok",
    vision_badge_low: "check",
    btn_add_box: "Add Spot",
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
    notifications_pref_desc: "Choose how many days before expiration to alert.",
    label_notification_day: "Day",
    btn_add_day: "Add Day",
    btn_save_notification_prefs: "Save Alert Rule",
    notifications_pref_current: "Current alert days: {days}",
    btn_edit_day: "Edit",
    btn_delete_day: "Delete",
    prompt_notification_edit_day: "Change day value (current: {day})",
    err_notification_day_range: "Day must be between {min} and {max}.",
    expiring_focus_title: "Expiring Items (All Storage)",
    expiring_focus_desc: "Shows items nearing expiration across refrigerated/frozen/room.",
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
    err_notification_no_offsets: "Select at least one alert day.",
    empty_expiring_focus: "No expiring items right now.",
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
    voice_ack_applied: "Okay, applied.",
    voice_ack_target_selected: "Spot {index} selected. Say the new name.",
    voice_wait_more: "Okay, keep speaking.",
    voice_already_applied: "Already applied. No duplicate update.",
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
    meta_recipe_link_line: "{provider} | score {score} | match {match}%",
    recipe_cluster_links: "{count} sources",
    recipe_title_fallback: "Recipe",
    meta_shopping_reasons: "reasons: {reasons}",
    meta_shopping_related: "related recipes: {related}",
    toast_order_draft_created: "Order draft created: {id} ({count} items)",
    err_order_draft_no_items: "No visible shopping items to draft.",
    meta_notification_type: "alert: {type}",
    meta_notification_exp: "exp {exp} | {storage} | {due}",
    meta_notification_scheduled_simple: "scheduled: {ts}",
    notification_due_day: "D-day",
    notification_due_minus: "D-{days}",
    notification_due_expired: "expired {days}d ago",
    notification_due_left: "{days}d left",
    notification_unknown_item: "Unknown item",
    toast_notification_prefs_saved: "Alert rule saved: {days} (rebuilt {count})",
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
    vision_objects_hint: "스팟을 눌러 선택하세요. '스팟 추가'를 누르고 사진을 탭해 추가한 뒤, 글자나 말로 이름을 고치세요.",
    btn_edit_label: "수정",
    btn_edit_label_voice: "말로 수정",
    btn_remove_one: "빼기",
    btn_save_label: "저장",
    btn_cancel_label: "취소",
    vision_badge_ok: "확신",
    vision_badge_low: "확인",
    btn_add_box: "스팟 추가",
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
    meta_recipe_link_line: "{provider} | 점수 {score} | 매칭 {match}%",
    recipe_cluster_links: "링크 {count}개",
    recipe_title_fallback: "요리",
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
  renderNotificationLeadButtons();
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
  visionLastTapAt = 0;
  visionLastTapObjectId = "";
  closeVisionInlineEditor();

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
  if (visionEditMode === "add") {
    closeVisionInlineEditor();
  }

  const addBtn = $("visionAddBoxBtn");
  if (addBtn) {
    addBtn.classList.toggle("active", visionEditMode === "add");
  }
  const canvas = $("visionPreviewCanvas");
  if (canvas) {
    canvas.style.cursor = visionEditMode === "add" ? "crosshair" : "pointer";
  }
}

function getSelectedVisionObject() {
  const id = String(visionSelectedObjectId || "").trim();
  if (!id) {
    return null;
  }
  return (visionObjectsCache || []).find((o) => String(o?.id || "").trim() === id) || null;
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

function getVisionObjectById(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return null;
  }
  return (visionObjectsCache || []).find((o) => String(o?.id || "").trim() === id) || null;
}

function getVisionObjectByOrdinal(index) {
  const n = Number.parseInt(index, 10);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache : [];
  return arr[n - 1] || null;
}

function roundVisionBboxValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 10000) / 10000;
}

function updateVisionObjectBbox(objectId, bbox) {
  const id = String(objectId || "").trim();
  if (!id || !bbox) {
    return null;
  }
  const idx = (visionObjectsCache || []).findIndex((o) => String(o?.id || "").trim() === id);
  if (idx < 0) {
    return null;
  }
  const next = {
    x: roundVisionBboxValue(clamp(bbox.x, 0, 1)),
    y: roundVisionBboxValue(clamp(bbox.y, 0, 1)),
    w: roundVisionBboxValue(clamp(bbox.w, 0.01, 1)),
    h: roundVisionBboxValue(clamp(bbox.h, 0.01, 1))
  };
  next.x = roundVisionBboxValue(clamp(next.x, 0, Math.max(0, 1 - next.w)));
  next.y = roundVisionBboxValue(clamp(next.y, 0, Math.max(0, 1 - next.h)));
  visionObjectsCache[idx] = {
    ...visionObjectsCache[idx],
    bbox: next
  };
  return visionObjectsCache[idx];
}

function getVisionObjectCenter(obj) {
  const bb = obj?.bbox;
  if (!bb) {
    return null;
  }
  const x = Number(bb.x);
  const y = Number(bb.y);
  const w = Number(bb.w);
  const h = Number(bb.h);
  if (![x, y, w, h].every(Number.isFinite)) {
    return null;
  }
  return {
    x: x + w / 2,
    y: y + h / 2
  };
}

function isVoiceCaptureRunning() {
  return isRealtimeConnected() || browserSpeechRunning;
}

function setVisionRelabelTarget(objectId, options = {}) {
  const id = String(objectId || "").trim();
  if (!id) {
    visionRelabelTargetId = "";
    realtimeLastVisionTargetObjectId = "";
    realtimeLastVisionTargetAt = 0;
    return;
  }
  visionRelabelTargetId = id;
  realtimeLastVisionTargetObjectId = id;
  realtimeLastVisionTargetAt = Date.now();
  if (options?.select !== false) {
    selectVisionObject(id);
  }
  if (options?.announce !== false) {
    const obj = getVisionObjectById(id);
    const label = obj ? getVisionObjectDisplayLabel(obj) : "";
    const summary = label || id;
    setRealtimeStatus(`${t("btn_edit_label_voice")}: ${summary}. ${t("voice_draft_edit_hint")}`);
  }
}

function getVisionInlineEditorElements() {
  return {
    editor: $("visionInlineEditor"),
    input: $("visionInlineInput"),
    saveBtn: $("visionInlineSaveBtn"),
    cancelBtn: $("visionInlineCancelBtn")
  };
}

function closeVisionInlineEditor() {
  const { editor, input } = getVisionInlineEditorElements();
  if (!editor) {
    return;
  }
  editor.hidden = true;
  editor.removeAttribute("data-object-id");
  if (input) {
    input.value = "";
  }
}

function positionVisionInlineEditor() {
  const { editor } = getVisionInlineEditorElements();
  if (!editor || editor.hidden) {
    return;
  }

  const objectId = String(editor.dataset.objectId || "").trim();
  const obj = getVisionObjectById(objectId);
  const img = $("visionPreviewImage");
  const stage = $("visionStage");
  if (!obj || !img || !stage) {
    closeVisionInlineEditor();
    return;
  }

  const center = getVisionObjectCenter(obj);
  if (!center) {
    closeVisionInlineEditor();
    return;
  }

  const imgRect = img.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  if (!imgRect.width || !imgRect.height || !stageRect.width || !stageRect.height) {
    return;
  }

  const px = (imgRect.left - stageRect.left) + center.x * imgRect.width;
  const py = (imgRect.top - stageRect.top) + center.y * imgRect.height;

  const margin = 10;
  const editorRect = editor.getBoundingClientRect();
  const w = Math.max(190, Math.min(editorRect.width || 240, stageRect.width - margin * 2));
  const h = Math.max(74, editorRect.height || 92);
  let left = clamp(px - w / 2, margin, Math.max(margin, stageRect.width - w - margin));
  let top = py - h - 14;
  if (top < margin) {
    top = py + 14;
  }
  top = clamp(top, margin, Math.max(margin, stageRect.height - h - margin));

  editor.style.left = `${Math.round(left)}px`;
  editor.style.top = `${Math.round(top)}px`;
}

function openVisionInlineEditor(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return;
  }
  const obj = getVisionObjectById(id);
  const { editor, input } = getVisionInlineEditorElements();
  if (!obj || !editor || !input) {
    return;
  }

  selectVisionObject(id);
  editor.dataset.objectId = id;
  input.value = getVisionObjectDisplayLabel(obj);
  editor.hidden = false;
  positionVisionInlineEditor();
  input.focus();
  input.select?.();
}

async function saveVisionInlineEditorLabel() {
  const { editor, input, saveBtn } = getVisionInlineEditorElements();
  if (!editor || !input) {
    return;
  }
  const id = String(editor.dataset.objectId || "").trim();
  const value = String(input.value || "").trim();
  if (!id || !value) {
    return;
  }
  if (saveBtn) {
    saveBtn.disabled = true;
  }
  try {
    await replaceVisionObjectLabel(id, value, { quantity: 1, unit: "ea" });
    closeVisionInlineEditor();
  } catch (err) {
    const msg = err?.message || String(err);
    setGlobalError(msg);
    setCaptureError(msg);
    throw err;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
    }
  }
}

function extractVisionLabelFromSpeech(rawText) {
  let text = String(rawText || "").trim();
  if (!text) {
    return "";
  }
  text = text.replace(/\s+/g, " ").trim();

  const notMatch = text.match(/(?:\uC544\uB2C8\uB77C|\uC544\uB2C8\uACE0)\s*(.+)$/u);
  if (notMatch?.[1]) {
    text = notMatch[1].trim();
  }

  const leadingPatterns = [
    /^(?:\uC774|\uC800|\uADF8|\uC694)?\uAC70(?:\uB294|\uAC00|\uB97C|\uB3C4)?\s*/u,
    /^(?:\uC774|\uC800|\uADF8)\s*\uC810(?:\uC740|\uC774|\uC744)?\s*/u,
    /^\uC810\s*\d+\s*/u,
    /^\uC2A4\uD31F\s*\d+\s*/u,
    /^(?:[0-9]{1,2}|[A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C)?\s*/u,
    /^spot\s*\d+\s*/i,
    /^(?:this|that)\s+is\s+/i,
    /^(?:it|this|that)\s+/i
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of leadingPatterns) {
      const next = text.replace(p, "");
      if (next !== text) {
        text = next.trim();
        changed = true;
      }
    }
  }

  const trailingPatterns = [
    /\s*(?:\uC774\uC57C|\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694)\s*[.!?~]*$/u,
    /\s*(?:\uB77C\uACE0|\uB77C\uAD6C)\s*(?:\uC785\uB825(?:\uD574\uC918)?|\uC800\uC7A5(?:\uD574\uC918)?|\uB4F1\uB85D(?:\uD574\uC918)?|\uC218\uC815(?:\uD574\uC918)?|\uBC14\uAFD4(?:\uC918)?|\uD574\uC918)?\s*[.!?~]*$/u,
    /\s*(?:\uB85C|\uC73C\uB85C)\s*(?:\uC218\uC815|\uBCC0\uACBD|\uBC14\uAFD4)(?:\uC918|\uC8FC\uC138\uC694|\uD574\uC918|\uD574\uC8FC\uC138\uC694)?\s*[.!?~]*$/u
  ];
  changed = true;
  while (changed) {
    changed = false;
    for (const p of trailingPatterns) {
      const next = text.replace(p, "");
      if (next !== text) {
        text = next.trim();
        changed = true;
      }
    }
  }

  text = text.replace(/^[\s"'`]+|[\s"'`.,!?~]+$/g, "").trim();
  if (!text) {
    return "";
  }

  const invalid =
    /^(?:\uCD94\uAC00|\uC0AD\uC81C|\uC218\uC815|\uBCC0\uACBD|\uBC14\uAFD4|\uD574\uC918|\uD574\uC8FC\uC138\uC694|\uC785\uB825\uD574|\uC800\uC7A5\uD574|\uB4F1\uB85D\uD574|add|remove|delete|change|update)$/i.test(
      text
    );
  if (invalid) {
    return "";
  }
  return normalizeVisionLabelCandidate(text);
}

function normalizeVisionLabelCandidate(rawLabel) {
  let label = String(rawLabel || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) {
    return "";
  }

  label = label.replace(/^(?:\uADF8\uB0E5|\uC74C|\uC5B4|\uC544|\uC800\uAE30)\s+/u, "");
  label = label.replace(/^[\s"'`]+|[\s"'`.,!?~]+$/g, "").trim();
  if (!label) {
    return "";
  }

  const lower = label.toLowerCase();
  const blockedExact = new Set([
    "\uB410\uC5B4",
    "\uB410\uC5B4\uC694",
    "\uB05D",
    "\uC544\uB0D0",
    "\uC544\uB2C8",
    "\uC544\uB2C8\uC57C",
    "\uCDE8\uC18C",
    "\uADF8\uB0E5",
    "\uC7A0\uAE50",
    "\uC7A0\uC2DC",
    "\uC751",
    "\uB124",
    "\uC5B4",
    "\uC544",
    "stop",
    "cancel",
    "done",
    "ok",
    "okay"
  ]);
  if (blockedExact.has(label) || blockedExact.has(lower)) {
    return "";
  }

  if (label.length > 28) {
    return "";
  }

  if (/[?!]/.test(label)) {
    return "";
  }

  if (/[0-9A-Za-z\uAC00-\uD7A3]{1,12}\s*(?:\uBC88|\uBC88\uC9F8)/u.test(label)) {
    return "";
  }

  if (
    /(?:\uC65C|\uD588\uB294\uB370|\uB5A4\uB370|\uBC14\uAFD4|\uC218\uC815|\uBCC0\uACBD|\uC544\uB2C8\uB77C|\uC544\uB2C8\uACE0|\uC544\uB0D0|\uC544\uB2C8\uC57C|\uB05D|\uB410\uC5B4)/u.test(
      label
    )
  ) {
    return "";
  }

  const tokenCount = label.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 3) {
    return "";
  }

  return label;
}

function isVisionRelabelCancelSpeech(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return false;
  }
  return /(?:\uB05D|\uCDE8\uC18C|\uADF8\uB9CC|\uB410\uC5B4|cancel|stop|done)/i.test(text);
}

function parseSpokenOrdinalIndexToken(rawToken) {
  const token = String(rawToken || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!token) {
    return null;
  }

  if (/^\d{1,2}$/.test(token)) {
    const n = Number.parseInt(token, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const directMap = {
    "\uC77C": 1,
    "\uD55C": 1,
    "\uD558\uB098": 1,
    "\uCCAB": 1,
    "\uC774": 2,
    "\uB450": 2,
    "\uB458": 2,
    "\uC0BC": 3,
    "\uC138": 3,
    "\uC14B": 3,
    "\uC0AC": 4,
    "\uB124": 4,
    "\uB137": 4,
    "\uC624": 5,
    "\uB2E4\uC12F": 5,
    "\uC721": 6,
    "\uC5EC\uC12F": 6,
    "\uCE60": 7,
    "\uC77C\uACF1": 7,
    "\uD314": 8,
    "\uC5EC\uB35F": 8,
    "\uAD6C": 9,
    "\uC544\uD649": 9,
    "\uC2ED": 10,
    "\uC5F4": 10,
    "\uC5F4\uD55C": 11,
    "\uC5F4\uD558\uB098": 11,
    "\uC5F4\uB450": 12,
    "\uC5F4\uB458": 12,
    "\uC5F4\uC138": 13,
    "\uC5F4\uC14B": 13,
    "\uC5F4\uB124": 14,
    "\uC5F4\uB137": 14,
    "\uC5F4\uB2E4\uC12F": 15,
    "\uC5F4\uC5EC\uC12F": 16,
    "\uC5F4\uC77C\uACF1": 17,
    "\uC5F4\uC5EC\uB35F": 18,
    "\uC5F4\uC544\uD649": 19,
    "\uC2A4\uBB34": 20,
    "\uC2A4\uBB3C": 20
  };

  if (Object.prototype.hasOwnProperty.call(directMap, token)) {
    return directMap[token];
  }

  const sinoDigit = {
    "\uC77C": 1,
    "\uC774": 2,
    "\uC0BC": 3,
    "\uC0AC": 4,
    "\uC624": 5,
    "\uC721": 6,
    "\uCE60": 7,
    "\uD314": 8,
    "\uAD6C": 9
  };

  if (/^[\uC77C\uC774\uC0BC\uC0AC\uC624\uC721\uCE60\uD314\uAD6C\uC2ED]+$/u.test(token)) {
    if (token === "\uC2ED") {
      return 10;
    }
    const idx = token.indexOf("\uC2ED");
    if (idx < 0) {
      return sinoDigit[token] || null;
    }
    const leftToken = token.slice(0, idx);
    const rightToken = token.slice(idx + 1);
    const tens = leftToken ? sinoDigit[leftToken] : 1;
    const ones = rightToken ? sinoDigit[rightToken] : 0;
    if (!Number.isFinite(tens) || !Number.isFinite(ones)) {
      return null;
    }
    const n = tens * 10 + ones;
    return n > 0 ? n : null;
  }

  return null;
}

function parseSpokenCountToken(rawToken) {
  const base = String(rawToken || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!base) {
    return null;
  }

  const token = base.replace(
    /(?:\uAC1C|\uAC1C\uC57C|\uAC1C\uC694|\uAC1C\uC608\uC694|\uAC1C\uC785\uB2C8\uB2E4|\uBCD1|\uBCD1\uC774\uC57C|\uBCD1\uC785\uB2C8\uB2E4|\uBCD1\uC774\uC5D0\uC694|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|ea)$/u,
    ""
  );
  const n = parseSpokenOrdinalIndexToken(token || base);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function normalizeVoiceIngredientPhrase(rawPhrase) {
  return String(rawPhrase || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "")
    .replace(/[^\uAC00-\uD7A3a-z0-9]/g, "")
    .trim();
}

function stripLeadingSpeechFiller(rawText) {
  let text = String(rawText || "").trim();
  if (!text) {
    return "";
  }
  text = text.replace(
    /^(?:(?:\uADF8\uB9AC\uACE0|\uADF8\uB7FC|\uADF8\uB807\uACE0|\uADF8\uB7EC\uBA74|\uADF8\uB0E5|\uADF8\uB7F0\uB370)\s*|(?:\uC74C+|\uC5B4+|\uC544+)(?:\s+|$))/u,
    ""
  );
  return text.trim();
}

function normalizeVoiceIngestKey(rawText) {
  return String(rawText || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVoiceConnectorOnlyText(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return true;
  }
  return /^(?:그리고|그다음|다음|또|그리고요|그리고는|상온\s*재료(?:에는|는)?|냉장\s*재료(?:에는|는)?|냉동\s*재료(?:에는|는)?|재료(?:에는|는)?)$/u.test(
    text
  );
}

function isLikelyFragmentaryInventoryText(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return true;
  }
  if (isVoiceConnectorOnlyText(text)) {
    return true;
  }

  if (/(?:이랑|랑|하고|와|과|및|그리고|에는|에서|부터|도|만)\s*$/u.test(text)) {
    return true;
  }

  const hasCommandVerb =
    /(?:있어|있어요|있습니다|추가|넣|빼|먹|삭제|소비|수량|유통기한|아니라|아니고|말고|변경|수정|해줘|해주세요)\s*[.!?~]*$/u.test(text);
  if (!hasCommandVerb && text.length <= 16) {
    return true;
  }
  return false;
}

function clearRealtimePendingInventoryText() {
  realtimePendingInventoryText = "";
  realtimePendingInventoryAt = 0;
}

function parseQuantityOnlyIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }
  if (/(?:\uBC88|\uBC88\uC9F8)/u.test(text)) {
    return null;
  }

  const patterns = [
    /(?:\uAC1C\uC218|\uC218\uB7C9)(?:\uB294|\uC740|\uC774|\uAC00)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|ea)?(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694)?/u,
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|ea)\s*(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694)?\s*[.!?~]*$/u
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) {
      continue;
    }
    const q = parseSpokenCountToken(m[1]);
    if (Number.isFinite(q) && q > 0 && q <= 200) {
      return { quantity: q };
    }
  }
  return null;
}

function parseCorrectionReplacementLabel(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return "";
  }

  const segments = [text, ...text.split(/[.!?~\n]+/u).map((v) => String(v || "").trim()).filter(Boolean)];
  const markers = ["\uC544\uB2C8\uB77C", "\uC544\uB2C8\uACE0", "\uB9D0\uACE0"];

  const escapeForRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const appearsAsStandaloneNounLike = (source, token) => {
    const raw = String(source || "");
    const tkn = String(token || "").trim();
    if (!raw || !tkn) {
      return false;
    }
    const p = new RegExp(`(?:^|\\s)${escapeForRegex(tkn)}(?:\\s|$|[.,!?~]|[\\uC740\\uB294\\uC774\\uAC00\\uC744\\uB97C\\uC640\\uACFC\\uB3C4])`, "u");
    return p.test(raw);
  };

  for (const segment of segments) {
    const source = String(segment || "").trim();
    if (!source) {
      continue;
    }

    for (const marker of markers) {
      const idx = source.lastIndexOf(marker);
      if (idx < 0) {
        continue;
      }

      let tail = source.slice(idx + marker.length).trim();
      if (!tail) {
        continue;
      }

      // ASR can duplicate phrases in one utterance: keep only the final replacement chunk.
      const nestedParts = tail
        .split(/\s*(?:\uC544\uB2C8\uB77C|\uC544\uB2C8\uACE0|\uB9D0\uACE0)\s*/u)
        .map((v) => String(v || "").trim())
        .filter(Boolean);
      if (nestedParts.length > 0) {
        tail = nestedParts[nestedParts.length - 1];
      }

      const extracted = extractVisionLabelFromSpeech(tail) || tail;
      let label = normalizeVisionLabelCandidate(extracted);
      if (!label) {
        continue;
      }

      // Handle split utterances like "...아니라" then "토마토고".
      if (/^[\uAC00-\uD7A3A-Za-z0-9]{2,24}\uACE0$/u.test(label)) {
        const base = label.slice(0, -1).trim();
        const baseNorm = normalizeVisionLabelCandidate(base);
        if (baseNorm && appearsAsStandaloneNounLike(source, baseNorm)) {
          label = baseNorm;
        }
      }

      if (label) {
        return label;
      }
    }
  }

  return "";
}

function parseDraftQuantityIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }
  if (/(?:\uBC88|\uBC88\uC9F8)/u.test(text)) {
    return null;
  }
  if (/\uC720\uD1B5\uAE30\uD55C/u.test(text)) {
    return null;
  }

  const patterns = [
    /^\s*(.+?)\s*(?:\uC740|\uB294|\uC774|\uAC00)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|ea)?\s*(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694)?\s*[.!?~]*$/u
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) {
      continue;
    }
    const phrase = String(m[1] || "").trim();
    if (!phrase) {
      continue;
    }
    const quantity = parseSpokenCountToken(m[2]);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 200) {
      continue;
    }
    return { ingredient_phrase: phrase, quantity };
  }

  return null;
}

function findDraftItemByVoicePhrase(ingredientPhrase) {
  const target = normalizeVoiceIngredientPhrase(ingredientPhrase);
  if (!target) {
    return null;
  }
  const items = Array.isArray(captureDraftItemsCache) ? captureDraftItemsCache : [];
  if (items.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = -1;
  for (const item of items) {
    const candidates = [
      ingredientLabel(item?.ingredient_key || "", item?.ingredient_name || ""),
      String(item?.ingredient_name || ""),
      String(item?.ingredient_key || "").replace(/_/g, " ")
    ];
    for (const c of candidates) {
      const normalized = normalizeVoiceIngredientPhrase(c);
      if (!normalized) {
        continue;
      }
      let score = 0;
      if (normalized === target) {
        score = 100;
      } else if (normalized.includes(target)) {
        score = 70;
      } else if (target.includes(normalized)) {
        score = 50;
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return bestScore >= 50 ? best : null;
}

function parseVisionOrdinalTargetOnlyIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }
  // If this already includes a valid relabel payload, do not treat it as target-only.
  if (parseVisionOrdinalRelabelIntent(text)) {
    return null;
  }
  const m = text.match(
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C)?(?:\s+.*)?$/u
  );
  if (!m) {
    return null;
  }
  const index = parseSpokenOrdinalIndexToken(m[1]);
  if (!Number.isFinite(index) || index < 1) {
    return null;
  }
  return { index };
}

function parseVisionOrdinalRelabelIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }

  const patterns = [
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(?:(?:\uC740|\uB294|\uC774|\uAC00)\s*|[:=]\s*|)(.+)$/u,
    /^\s*(?:spot|item)\s*(\d{1,2})\s*(?:is|=|:)?\s*(.+)$/i,
    /^\s*(\d{1,2})(?:st|nd|rd|th)\s*(?:item)?\s*(?:is|=|:)?\s*(.+)$/i
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) {
      continue;
    }
    const index = parseSpokenOrdinalIndexToken(m[1]);
    if (!Number.isFinite(index) || index < 1) {
      continue;
    }

    const tail = String(m[2] || "").trim();
    if (!tail) {
      return null;
    }

    const label =
      parseCorrectionReplacementLabel(tail) ||
      normalizeVisionLabelCandidate(
        extractVisionLabelFromSpeech(tail) || tail.replace(/^[\s"'`]+|[\s"'`.,!?~]+$/g, "").trim()
      );
    if (!label) {
      continue;
    }
    return { index, label };
  }

  return null;
}

function findVisionObjectAt(nx, ny, rect = null) {
  const x = Number(nx);
  const y = Number(ny);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const rw = Number(rect?.width || 0);
  const rh = Number(rect?.height || 0);
  const minSide = rw > 0 && rh > 0 ? Math.min(rw, rh) : 0;
  // On mobile, use distance-to-center hit test so tiny spots are easy to tap.
  const threshold = minSide > 0 ? clamp(28 / minSide, 0.04, 0.16) : 0.08;

  let best = null;
  let bestScore = Infinity;
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

    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const dist = Math.hypot(x - cx, y - cy);
    const inside = x >= bx && y >= by && x <= bx + bw && y <= by + bh;
    if (!inside && dist > threshold) {
      continue;
    }

    const area = Math.max(0.000001, bw * bh);
    const score = dist + (inside ? 0 : 0.2) + area * 0.1;
    if (score < bestScore) {
      bestScore = score;
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
    closeVisionInlineEditor();
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
    const cx = x + w / 2;
    const cy = y + h / 2;

    const selected = obj?.id && String(obj.id) === visionSelectedObjectId;
    const confidence = String(obj?.confidence || "").toLowerCase();
    const baseColor = confidence === "low" ? "#b87014" : "#2f8f5b";
    const ring = selected ? "#182018" : baseColor;

    // Draw spot marker instead of resize-heavy box UI.
    const r = selected ? 8 : 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? "#ffffff" : "#fff";
    ctx.stroke();

    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const label = getVisionObjectDisplayLabel(obj);
    const text = `${i + 1} ${label}`.trim();
    drawLabel(Math.max(0, cx + 10), Math.max(18, cy - 8), text, "#fff");
  }

  positionVisionInlineEditor();
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
    list.hidden = true;
    list.innerHTML = "";
  }

  const { editor } = getVisionInlineEditorElements();
  if (editor && !editor.hidden) {
    const editId = String(editor.dataset.objectId || "").trim();
    if (!editId || !getVisionObjectById(editId)) {
      closeVisionInlineEditor();
    } else {
      positionVisionInlineEditor();
    }
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

function buildSpotBboxAt(nx, ny, rect) {
  const x = clamp(nx, 0, 1);
  const y = clamp(ny, 0, 1);
  const rw = Number(rect?.width || 0);
  const rh = Number(rect?.height || 0);
  const halfW = rw > 0 ? clamp(34 / rw, 0.035, 0.12) : 0.06;
  const halfH = rh > 0 ? clamp(34 / rh, 0.035, 0.12) : 0.06;

  const left = clamp(x - halfW, 0, 1);
  const top = clamp(y - halfH, 0, 1);
  const right = clamp(x + halfW, 0, 1);
  const bottom = clamp(y + halfH, 0, 1);
  const w = Math.max(0.02, right - left);
  const h = Math.max(0.02, bottom - top);
  return { x: left, y: top, w, h };
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

function appendVoiceAck(message) {
  const msg = String(message || "").trim();
  if (!msg) {
    return;
  }
  appendRealtimeLogLine("agent", msg);
  setRealtimeStatus(msg);
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

  captureDraftItemsCache = [];
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
  captureDraftItemsCache = Array.isArray(items) ? items.map((it) => ({ ...it })) : [];
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
    realtimeAutoRespond: false,
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
      realtimeAutoRespond: false,
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
                  create_response: false
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
  realtimeLastVisionRelabelAt = 0;
  realtimeLastVisionTargetObjectId = "";
  realtimeLastVisionTargetAt = 0;
  clearRealtimePendingInventoryText();
  realtimeLastAutoIngestKey = "";
  realtimeLastAutoIngestAt = 0;
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
  const suppressContextRepair = now - Number(realtimeLastVisionRelabelAt || 0) < 12000;

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
        appendVoiceAck(t("voice_ack_applied"));
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

  const ordinalRelabel = parseVisionOrdinalRelabelIntent(text);
  if (ordinalRelabel) {
    const targetObj = getVisionObjectByOrdinal(ordinalRelabel.index);
    if (!targetObj?.id) {
      const msg = `target spot #${ordinalRelabel.index} not found`;
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      return;
    }

    visionRelabelTargetId = "";
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("label", `${ordinalRelabel.index}: ${ordinalRelabel.label}`);

    realtimeIngestChain = realtimeIngestChain
      .then(() => replaceVisionObjectLabel(targetObj.id, ordinalRelabel.label, { quantity: 1, unit: "ea" }))
      .then(() => {
        realtimeLastVisionRelabelAt = Date.now();
        realtimeLastVisionTargetObjectId = targetObj.id;
        realtimeLastVisionTargetAt = Date.now();
        setRealtimeStatus(t("voice_draft_updated"));
        appendVoiceAck(t("voice_ack_applied"));
        closeVisionInlineEditor();
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

  const ordinalTargetOnly = parseVisionOrdinalTargetOnlyIntent(text);
  if (ordinalTargetOnly) {
    const targetObj = getVisionObjectByOrdinal(ordinalTargetOnly.index);
    if (!targetObj?.id) {
      const msg = `target spot #${ordinalTargetOnly.index} not found`;
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      return;
    }
    setVisionRelabelTarget(targetObj.id, { announce: true });
    appendRealtimeLogLine("label_target", `${ordinalTargetOnly.index}`);
    appendVoiceAck(tf("voice_ack_target_selected", { index: ordinalTargetOnly.index }));
    return;
  }

  if (visionRelabelTargetId) {
    const targetId = visionRelabelTargetId;
    if (isVisionRelabelCancelSpeech(text)) {
      visionRelabelTargetId = "";
      realtimeLastVisionTargetObjectId = "";
      realtimeLastVisionTargetAt = 0;
      appendRealtimeLogLine("label", "canceled");
      setRealtimeStatus(t("voice_idle"));
      return;
    }

    const qtyOnly = parseQuantityOnlyIntent(text);
    if (qtyOnly?.quantity) {
      const obj = getVisionObjectById(targetId);
      const key = String(obj?.ingredient_key || "").trim();
      if (key) {
        const displayName = ingredientLabel(key, obj?.ingredient_name || obj?.name || key);
        setRealtimeStatus(tf("voice_heard", { text }));
        appendRealtimeLogLine("draft(qty)", `${displayName} x${qtyOnly.quantity}`);
        realtimeLastVisionTargetObjectId = targetId;
        realtimeLastVisionTargetAt = Date.now();
        realtimeIngestChain = realtimeIngestChain
          .then(() => replaceCaptureDraftIngredient(key, displayName, qtyOnly.quantity, obj?.unit || "ea"))
          .then(() => {
            realtimeLastVisionRelabelAt = Date.now();
            setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
            appendVoiceAck(t("voice_ack_applied"));
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
    }

    let correctionLabel = parseCorrectionReplacementLabel(text);
    if (!correctionLabel && recentContext.length > 0) {
      const prev = String(recentContext[recentContext.length - 1] || "").trim();
      if (prev) {
        correctionLabel = parseCorrectionReplacementLabel(`${prev} ${text}`.trim());
      }
    }
    if (correctionLabel) {
      setRealtimeStatus(tf("voice_heard", { text }));
      appendRealtimeLogLine("label", correctionLabel);
      realtimeIngestChain = realtimeIngestChain
        .then(() => replaceVisionObjectLabel(targetId, correctionLabel, { quantity: 1, unit: "ea" }))
        .then(() => {
          realtimeLastVisionRelabelAt = Date.now();
          realtimeLastVisionTargetObjectId = targetId;
          realtimeLastVisionTargetAt = Date.now();
          setRealtimeStatus(t("voice_draft_updated"));
          appendVoiceAck(t("voice_ack_applied"));
          closeVisionInlineEditor();
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

    let extractedLabel = normalizeVisionLabelCandidate(extractVisionLabelFromSpeech(text));
    if (!extractedLabel && recentContext.length > 0) {
      const prev = String(recentContext[recentContext.length - 1] || "").trim();
      if (prev) {
        extractedLabel = normalizeVisionLabelCandidate(extractVisionLabelFromSpeech(`${prev} ${text}`.trim()));
      }
    }
    if (!extractedLabel) {
      appendRealtimeLogLine("label_ignored", text);
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
    }
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("label", extractedLabel);

    realtimeIngestChain = realtimeIngestChain
      .then(() => replaceVisionObjectLabel(targetId, extractedLabel, { quantity: 1, unit: "ea" }))
      .then(() => {
        realtimeLastVisionRelabelAt = Date.now();
        realtimeLastVisionTargetObjectId = targetId;
        realtimeLastVisionTargetAt = Date.now();
        setRealtimeStatus(t("voice_draft_updated"));
        appendVoiceAck(t("voice_ack_applied"));
        closeVisionInlineEditor();
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

  const recentTargetAge = Date.now() - Number(realtimeLastVisionTargetAt || 0);
  const recentTargetId =
    realtimeLastVisionTargetObjectId && recentTargetAge >= 0 && recentTargetAge <= 30000
      ? realtimeLastVisionTargetObjectId
      : "";
  const qtyOnlyWithRecentTarget = parseQuantityOnlyIntent(text);
  if (recentTargetId && qtyOnlyWithRecentTarget?.quantity) {
    const obj = getVisionObjectById(recentTargetId);
    const key = String(obj?.ingredient_key || "").trim();
    if (key) {
      const displayName = ingredientLabel(key, obj?.ingredient_name || obj?.name || key);
      setRealtimeStatus(tf("voice_heard", { text }));
      appendRealtimeLogLine("draft(qty)", `${displayName} x${qtyOnlyWithRecentTarget.quantity}`);
      realtimeIngestChain = realtimeIngestChain
        .then(() => replaceCaptureDraftIngredient(key, displayName, qtyOnlyWithRecentTarget.quantity, obj?.unit || "ea"))
        .then(() => {
          realtimeLastVisionTargetAt = Date.now();
          setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
          appendVoiceAck(t("voice_ack_applied"));
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
  }

  const draftQuantityIntent = parseDraftQuantityIntent(text);
  if (draftQuantityIntent) {
    const targetItem = findDraftItemByVoicePhrase(draftQuantityIntent.ingredient_phrase);
    if (targetItem?.ingredient_key) {
      const displayName = ingredientLabel(targetItem.ingredient_key, targetItem.ingredient_name);
      setRealtimeStatus(tf("voice_heard", { text }));
      appendRealtimeLogLine("draft(qty)", `${displayName} x${draftQuantityIntent.quantity}`);
      realtimeIngestChain = realtimeIngestChain
        .then(() =>
          replaceCaptureDraftIngredient(
            targetItem.ingredient_key,
            displayName,
            draftQuantityIntent.quantity,
            targetItem.unit || "ea"
          )
        )
        .then(() => {
          setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
          appendVoiceAck(t("voice_ack_applied"));
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
  }

  setRealtimeStatus(tf("voice_heard", { text }));
  appendRealtimeLogLine("me", text);

  const hasOpenCaptureSession = Boolean(getCaptureSessionId());
  const autoIngest = isEasyMode() || ($("realtimeAutoIngestSpeech") && $("realtimeAutoIngestSpeech").checked);
  if (!autoIngest) {
    return;
  }

  let autoIngestText = text;
  if (isEasyMode() && !hasOpenCaptureSession) {
    if (realtimePendingInventoryText && now - Number(realtimePendingInventoryAt || 0) > 25000) {
      clearRealtimePendingInventoryText();
    }

    if (isLikelyFragmentaryInventoryText(text)) {
      const merged = normalizeWhitespace(`${realtimePendingInventoryText || ""} ${text}`.trim());
      realtimePendingInventoryText = merged || text;
      realtimePendingInventoryAt = now;
      appendVoiceAck(t("voice_wait_more"));
      return;
    }

    if (realtimePendingInventoryText) {
      autoIngestText = normalizeWhitespace(`${realtimePendingInventoryText} ${text}`.trim());
      clearRealtimePendingInventoryText();
      if (autoIngestText && autoIngestText !== text) {
        appendRealtimeLogLine("me(merged)", autoIngestText);
      }
    }

    const ingestKey = normalizeVoiceIngestKey(autoIngestText);
    if (ingestKey && ingestKey === realtimeLastAutoIngestKey && now - Number(realtimeLastAutoIngestAt || 0) < 20000) {
      appendRealtimeLogLine("system", t("voice_already_applied"));
      appendVoiceAck(t("voice_already_applied"));
      return;
    }
    realtimeLastAutoIngestKey = ingestKey;
    realtimeLastAutoIngestAt = now;
  }

  if (hasOpenCaptureSession) {
    clearRealtimePendingInventoryText();
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
        appendVoiceAck(t("voice_ack_applied"));
        return res;
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

  if (isEasyMode()) {
    realtimeIngestChain = realtimeIngestChain
      .then(() => ingestInventoryFromText(autoIngestText, sourceType))
      .then(async (res) => {
        let data = res?.data || null;
        let summary = data ? formatInventoryIngestSummary(data) : "";

        // Multi-turn repair: if this turn has no parsed food action, retry with previous speech context.
        if (!summary && recentContext.length > 0 && !suppressContextRepair && !/^(?:realtime_voice|browser_speech)$/i.test(sourceType)) {
          const candidates = [];
          const prev1 = String(recentContext[recentContext.length - 1] || "").trim();
          const prev2 = String(recentContext[recentContext.length - 2] || "").trim();
          if (prev1) {
            candidates.push(`${prev1} ${autoIngestText}`.trim());
          }
          if (prev2 && prev1) {
            candidates.push(`${prev2} ${prev1} ${autoIngestText}`.trim());
          }

          for (const candidate of candidates) {
            if (!candidate || candidate === autoIngestText) {
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
          appendVoiceAck(t("voice_inventory_no_items"));
        } else {
          appendRealtimeLogLine("system", tf("voice_inventory_updated", { summary }));
          setRealtimeStatus(tf("voice_inventory_updated", { summary }));
          appendVoiceAck(t("voice_ack_applied"));
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
        appendVoiceAck(t("voice_ack_applied"));
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
  realtimeLastVisionRelabelAt = 0;
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

function applyInventoryMutationToCache(mutation, fallbackItemId = "") {
  const payload = mutation && typeof mutation === "object" ? mutation : {};
  const item = payload?.item && typeof payload.item === "object" ? payload.item : null;
  const removed = Boolean(payload?.removed) || Number(item?.quantity || 0) <= 0;
  const targetId = String(item?.id || fallbackItemId || "").trim();
  if (!targetId) {
    return;
  }

  const rows = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  const next = [];
  let replaced = false;

  for (const row of rows) {
    const rowId = String(row?.id || "").trim();
    if (rowId !== targetId) {
      next.push(row);
      continue;
    }
    replaced = true;
    if (!removed && item) {
      next.push(item);
    }
  }

  if (!replaced && !removed && item) {
    next.push(item);
  }

  if (removed) {
    inventorySelectedIds.delete(targetId);
  }

  inventoryItemsCache = next;
}

function formatQuantityValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "0";
  }
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.0001) {
    return String(Math.round(rounded));
  }
  return String(rounded);
}

function confirmDeleteByMinusSingle() {
  const msg =
    currentLang === "ko"
      ? "수량이 1이라 이 항목이 삭제됩니다. 삭제하시겠습니까?"
      : "Quantity is 1, so this item will be removed. Remove it?";
  return confirm(msg);
}

function confirmDeleteByMinusBulk(removeCount) {
  const count = Math.max(1, Number(removeCount || 0));
  const msg =
    currentLang === "ko"
      ? `선택한 항목 중 ${count}개가 삭제됩니다. 계속하시겠습니까?`
      : `${count} selected item(s) will be removed. Continue?`;
  return confirm(msg);
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
    renderExpiringFocusFromCache();
    return;
  }
  list.innerHTML = "";

  const items = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  const filtered = items.filter((item) => normalizeStorageType(item?.storage_type || "") === inventoryFilterStorage);

  if (filtered.length === 0) {
    list.appendChild(emptyNode(t("empty_inventory")));
  } else {
    filtered.forEach((item) => list.appendChild(buildInventoryNode(item)));
  }

  syncInventoryBulkBar();
  renderExpiringFocusFromCache();
}

function getVisibleInventoryItems() {
  const items = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  return items.filter((item) => normalizeStorageType(item?.storage_type || "") === inventoryFilterStorage);
}

function getExpiringFocusItemsFromCache() {
  const items = Array.isArray(inventoryItemsCache) ? inventoryItemsCache : [];
  const onlyExpiringSoon = items.filter((item) => String(item?.status || "").trim().toLowerCase() === "expiring_soon");
  return onlyExpiringSoon.sort((a, b) => {
    const ad = Number(a?.days_remaining ?? 9999);
    const bd = Number(b?.days_remaining ?? 9999);
    if (ad !== bd) {
      return ad - bd;
    }
    return String(a?.ingredient_name || "").localeCompare(String(b?.ingredient_name || ""));
  });
}

function buildExpiringFocusNode(item) {
  const node = document.createElement("div");
  node.className = "item";

  const main = document.createElement("div");
  main.className = "item-main";

  const name = document.createElement("strong");
  name.className = "name";
  name.textContent = ingredientLabel(item?.ingredient_key, item?.ingredient_name);
  main.appendChild(name);

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = tf("meta_inventory_line", {
    qty: formatQuantityValue(item?.quantity),
    unit: item?.unit || "ea",
    storage: storageLabel(item?.storage_type),
    exp: item?.suggested_expiration_date || "-",
    days: Number(item?.days_remaining ?? 0)
  });
  main.appendChild(meta);

  const side = document.createElement("div");
  side.className = "item-side";
  side.appendChild(statusBadge(item?.status || "expiring_soon"));

  node.appendChild(main);
  node.appendChild(side);
  return node;
}

function renderExpiringFocusFromCache() {
  const list = $("expiringFocusList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  const rows = getExpiringFocusItemsFromCache();
  if (!rows.length) {
    list.appendChild(emptyNode(t("empty_expiring_focus")));
    return;
  }
  rows.forEach((item) => list.appendChild(buildExpiringFocusNode(item)));
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
  const consumeBtn = $("inventoryBulkConsumeBtn");
  const addBtn = $("inventoryBulkAddBtn");
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
  if (consumeBtn) consumeBtn.disabled = !hasAny;
  if (addBtn) addBtn.disabled = !hasAny;
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
  return result?.data || null;
}

async function bulkAdjustSelectedInventory(deltaQuantity) {
  const visible = getVisibleInventoryItems();
  const visibleIds = new Set(visible.map((i) => String(i.id)));
  const selected = Array.from(inventorySelectedIds).filter((id) => visibleIds.has(String(id)));
  if (selected.length === 0) {
    return;
  }
  if (Number(deltaQuantity) < 0) {
    const removeThreshold = Math.abs(Number(deltaQuantity || 0));
    const qtyById = new Map(
      visible.map((row) => [String(row?.id || ""), Number(row?.quantity || 0)])
    );
    const removeCount = selected.reduce((acc, id) => {
      const qty = Number(qtyById.get(String(id)) || 0);
      if (qty > 0 && qty <= removeThreshold + 0.000001) {
        return acc + 1;
      }
      return acc;
    }, 0);
    if (removeCount > 0 && !confirmDeleteByMinusBulk(removeCount)) {
      return;
    }
  }

  const consumeBtn = $("inventoryBulkConsumeBtn");
  const addBtn = $("inventoryBulkAddBtn");
  const clearBtn = $("inventoryBulkClearBtn");
  const selectAll = $("inventorySelectAll");
  if (consumeBtn) consumeBtn.disabled = true;
  if (addBtn) addBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;
  if (selectAll) selectAll.disabled = true;

  try {
    for (const id of selected) {
      const mutation = await adjustInventoryItemQuantity(id, deltaQuantity);
      applyInventoryMutationToCache(mutation, id);
    }
    renderInventoryFromCache();
    await Promise.allSettled([loadSummary(), loadShopping(), loadRecipes(), reloadNotificationsPanel()]);
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

  const qtyValueEl = node.querySelector(".qty-value");
  if (qtyValueEl) {
    qtyValueEl.textContent = formatQuantityValue(item.quantity);
  }

  const minusBtn = node.querySelector(".qty-minus-btn");
  const plusBtn = node.querySelector(".qty-plus-btn");
  const setAdjustDisabled = (disabled) => {
    if (minusBtn) minusBtn.disabled = disabled;
    if (plusBtn) plusBtn.disabled = disabled;
  };

  const applyItemDelta = async (delta) => {
    const qtyNow = Number(item?.quantity || 0);
    const removeThreshold = Math.abs(Number(delta || 0));
    if (Number(delta) < 0 && qtyNow > 0 && qtyNow <= removeThreshold + 0.000001) {
      if (!confirmDeleteByMinusSingle()) {
        return;
      }
    }

    setAdjustDisabled(true);
    try {
      const mutation = await adjustInventoryItemQuantity(item.id, delta);
      applyInventoryMutationToCache(mutation, item.id);
      renderInventoryFromCache();
      await Promise.allSettled([loadSummary(), loadShopping(), loadRecipes(), reloadNotificationsPanel()]);
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setAdjustDisabled(false);
    }
  };

  if (minusBtn) {
    minusBtn.addEventListener("click", async () => {
      await applyItemDelta(-1);
    });
  }
  if (plusBtn) {
    plusBtn.addEventListener("click", async () => {
      await applyItemDelta(1);
    });
  }

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

const RECIPE_DISH_STOPWORDS = new Set([
  "recipe",
  "recipes",
  "easy",
  "quick",
  "simple",
  "shorts",
  "short",
  "asmr",
  "home",
  "cooking",
  "cook",
  "food",
  "dish",
  "video",
  "레시피",
  "요리",
  "만들기",
  "만드는법",
  "만드는",
  "초간단",
  "간단",
  "쉬운",
  "홈쿡",
  "자취",
  "브이로그"
]);

const RECIPE_DISH_STYLE_PATTERNS = [
  { key: "덮밥", patterns: [/덮밥/u, /\bdonburi\b/i, /\brice bowl\b/i] },
  { key: "찜", patterns: [/찜/u, /\bsteam(?:ed)?\b/i, /\bsteamed\b/i] },
  { key: "볶음", patterns: [/볶음/u, /\b볶\b/u, /\bstir[\s-]?fry\b/i] },
  { key: "조림", patterns: [/조림/u, /\bbraise(?:d)?\b/i, /\bsimmer(?:ed)?\b/i] },
  { key: "구이", patterns: [/구이/u, /\bgrill(?:ed)?\b/i, /\broast(?:ed)?\b/i] },
  { key: "찌개", patterns: [/찌개/u, /\bstew\b/i] },
  { key: "국", patterns: [/(^|[^가-힣])국($|[^가-힣])/u, /\bsoup\b/i] },
  { key: "탕", patterns: [/탕/u] },
  { key: "전", patterns: [/(^|[^가-힣])전($|[^가-힣])/u, /\bpancake\b/i, /\bfritter\b/i] },
  { key: "무침", patterns: [/무침/u] },
  { key: "샐러드", patterns: [/샐러드/u, /\bsalad\b/i] },
  { key: "볶음밥", patterns: [/볶음밥/u, /\bfried rice\b/i] },
  { key: "파스타", patterns: [/파스타/u, /\bpasta\b/i] },
  { key: "라면", patterns: [/라면/u, /\bramen\b/i, /\bnoodle\b/i] },
  { key: "카레", patterns: [/카레/u, /\bcurry\b/i] },
  { key: "김밥", patterns: [/김밥/u, /\bgimbap\b/i, /\bkimbap\b/i] }
];

function decodeRecipeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function compactRecipeTitle(value) {
  let title = decodeRecipeHtmlEntities(String(value || "").trim());
  if (!title) {
    return "";
  }

  title = title
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+\|\s+.*$/u, "")
    .replace(/\s+-\s+.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  if (title.length > 72) {
    title = `${title.slice(0, 72).trim()}...`;
  }
  return title;
}

function recipeTitleForClustering(item) {
  return compactRecipeTitle(item?.recipe_name || item?.source_title || "");
}

function extractRecipeDishStyle(item) {
  const text = decodeRecipeHtmlEntities(
    `${recipeTitleForClustering(item)} ${String(item?.source_title || "").trim()}`
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }

  for (const entry of RECIPE_DISH_STYLE_PATTERNS) {
    const patterns = Array.isArray(entry?.patterns) ? entry.patterns : [];
    for (const pattern of patterns) {
      if (pattern && pattern.test(text)) {
        return String(entry.key || "").trim();
      }
    }
  }
  return "";
}

function recipeDishDisplayTitle(item) {
  const fromName = compactRecipeTitle(item?.recipe_name || "");
  if (fromName) {
    return fromName;
  }
  const fromSource = compactRecipeTitle(item?.source_title || "");
  if (fromSource) {
    return fromSource;
  }
  return t("recipe_title_fallback");
}

function recipeDishKeyFromItem(item) {
  const dishStyle = extractRecipeDishStyle(item);
  const requiredKeys = Array.isArray(item?.required_ingredient_keys)
    ? item.required_ingredient_keys
        .map((k) => normalizeIngredientKeyLoose(k))
        .filter((k) => k)
    : [];

  if (requiredKeys.length > 0) {
    const uniqRequired = Array.from(new Set(requiredKeys)).sort();
    if (dishStyle) {
      return `ing:${uniqRequired.slice(0, 6).join("|")}|style:${normalizeIngredientKeyLoose(dishStyle)}`;
    }
    return `ing:${uniqRequired.slice(0, 6).join("|")}`;
  }

  const base = recipeTitleForClustering(item);
  const tokens = decodeRecipeHtmlEntities(base)
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((tkn) => tkn.trim())
    .filter((tkn) => tkn.length >= 2 && !RECIPE_DISH_STOPWORDS.has(tkn));

  if (tokens.length === 0) {
    const rawKey = normalizeIngredientKeyLoose(base) || normalizeIngredientKeyLoose(item?.recipe_id || "");
    if (dishStyle) {
      return `style:${normalizeIngredientKeyLoose(dishStyle)}|raw:${rawKey}`;
    }
    return `raw:${rawKey}`;
  }

  const uniq = Array.from(new Set(tokens)).sort();
  if (dishStyle) {
    return `style:${normalizeIngredientKeyLoose(dishStyle)}|tok:${uniq.slice(0, 6).join("|")}`;
  }
  return `tok:${uniq.slice(0, 6).join("|")}`;
}

function dedupeRecipeLinks(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = normalizeIngredientKeyLoose(String(item?.source_url || item?.recipe_id || item?.recipe_name || ""));
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildRecipeDishClusters(payload) {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const map = new Map();

  for (const item of rows) {
    const key = recipeDishKeyFromItem(item);
    if (!key) {
      continue;
    }
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }

  const clusters = [];
  for (const [key, items] of map.entries()) {
    const deduped = dedupeRecipeLinks(items).sort((a, b) => {
      const scoreDelta = Number(b?.score || 0) - Number(a?.score || 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      const matchDelta = Number(b?.match_ratio || 0) - Number(a?.match_ratio || 0);
      if (matchDelta !== 0) {
        return matchDelta;
      }
      return String(a?.recipe_name || "").localeCompare(String(b?.recipe_name || ""));
    });

    if (deduped.length === 0) {
      continue;
    }

    const best = deduped[0];
    let title = recipeDishDisplayTitle(best);
    if (title.length > 44) {
      const shortest = deduped
        .map((item) => recipeDishDisplayTitle(item))
        .filter((v) => v)
        .sort((a, b) => a.length - b.length)[0];
      if (shortest) {
        title = shortest;
      }
    }

    clusters.push({
      key,
      title,
      score: Number(best?.score || 0),
      match_ratio: Number(best?.match_ratio || 0),
      items: deduped
    });
  }

  clusters.sort((a, b) => {
    const scoreDelta = Number(b?.score || 0) - Number(a?.score || 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  });

  return clusters;
}

function formatRecipeScore(value) {
  const n = Number(value);
  const score = Number.isFinite(n) ? Math.round(n) : 0;
  return currentLang === "ko" ? `${score}점` : `${score}`;
}

function formatRecipeMatchPercent(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) {
    return "0";
  }
  return String(Math.round(Math.max(0, Math.min(1, ratio)) * 100));
}

function buildRecipeDishNode(cluster) {
  const details = document.createElement("details");
  details.className = "recipe-dish";

  const summary = document.createElement("summary");
  summary.className = "recipe-dish-summary";

  const summaryMain = document.createElement("div");
  summaryMain.className = "recipe-dish-main";

  const title = document.createElement("strong");
  title.className = "recipe-dish-title";
  title.textContent = String(cluster?.title || "").trim() || t("recipe_title_fallback");
  summaryMain.appendChild(title);

  const score = document.createElement("span");
  score.className = "recipe-score-chip";
  score.textContent = formatRecipeScore(cluster?.score);

  summary.appendChild(summaryMain);
  summary.appendChild(score);
  details.appendChild(summary);

  const linksWrap = document.createElement("div");
  linksWrap.className = "recipe-dish-links";

  const linksMeta = document.createElement("span");
  linksMeta.className = "meta";
  linksMeta.textContent = tf("recipe_cluster_links", { count: (cluster?.items || []).length });
  linksWrap.appendChild(linksMeta);

  (cluster?.items || []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "recipe-link-item";

    const main = document.createElement("div");
    main.className = "recipe-link-main";

    const name = document.createElement("strong");
    name.className = "name";
    name.textContent = compactRecipeTitle(item?.source_title || item?.recipe_name || item?.recipe_id || "");
    main.appendChild(name);

    const provider = recipeProviderLabel(getRecipeProviderFromItem(item));
    const meta = document.createElement("span");
    meta.className = "recipe-link-meta";
    meta.textContent = tf("meta_recipe_link_line", {
      provider,
      score: Math.round(Number(item?.score || 0)),
      match: formatRecipeMatchPercent(item?.match_ratio)
    });
    main.appendChild(meta);
    row.appendChild(main);

    const side = document.createElement("div");
    side.className = "item-side";
    if (item?.source_url) {
      const link = document.createElement("a");
      link.className = "btn tiny ghost";
      link.href = String(item.source_url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("word_link");
      side.appendChild(link);
    }
    row.appendChild(side);

    linksWrap.appendChild(row);
  });

  details.appendChild(linksWrap);
  return details;
}

function renderRecipeList(payload) {
  const list = $("recipeList");
  list.innerHTML = "";

  const clusters = buildRecipeDishClusters(payload || {});
  if (clusters.length === 0) {
    list.appendChild(emptyNode(t("empty_recipes")));
    return;
  }

  const host = document.createElement("div");
  host.className = "recipe-dish-list";
  clusters.forEach((cluster) => {
    host.appendChild(buildRecipeDishNode(cluster));
  });

  list.appendChild(host);
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

function normalizeNotificationDayOffsets(value, fallback = [3, 1, 0], min = 0, max = 60) {
  const src = Array.isArray(value) ? value : fallback;
  const unique = new Set();
  for (const raw of src || []) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      continue;
    }
    const day = Math.round(n);
    if (day < Number(min) || day > Number(max)) {
      continue;
    }
    unique.add(day);
  }
  const normalized = Array.from(unique).sort((a, b) => b - a);
  if (normalized.length > 0) {
    return normalized;
  }
  return [...fallback];
}

function isBuiltInNotificationDay(dayOffset) {
  const n = Math.round(Number(dayOffset) || 0);
  return NOTIFICATION_DAY_PRESETS.includes(n);
}

function normalizeNotificationCustomDayPresets(value, min = 0, max = 60) {
  const base = normalizeNotificationDayOffsets(value, [], min, max);
  return base.filter((d) => !isBuiltInNotificationDay(d));
}

function parseNotificationDayValue(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return null;
  }
  if (n < notificationDayBounds.min || n > notificationDayBounds.max) {
    return null;
  }
  return n;
}

function notificationDayRangeError() {
  return tf("err_notification_day_range", {
    min: notificationDayBounds.min,
    max: notificationDayBounds.max
  });
}

function formatNotificationDayToken(dayOffset) {
  const n = Math.max(0, Math.round(Number(dayOffset) || 0));
  if (n <= 0) {
    return t("notification_due_day");
  }
  return tf("notification_due_minus", { days: n });
}

function formatNotificationDaysList(dayOffsets) {
  const arr = normalizeNotificationDayOffsets(dayOffsets, [3, 1, 0], notificationDayBounds.min, notificationDayBounds.max);
  return arr.map((d) => formatNotificationDayToken(d)).join(", ");
}

function setNotificationPrefsMeta(message) {
  const el = $("notificationPrefsMeta");
  if (!el) {
    return;
  }
  el.textContent = String(message || "");
}

function renderNotificationLeadButtons() {
  const root = $("notificationLeadButtons");
  if (!root) {
    return;
  }

  const merged = new Set([
    ...(NOTIFICATION_DAY_PRESETS || []),
    ...(notificationCustomDayPresets || []),
    ...(notificationDayOffsets || [])
  ]);
  const sorted = Array.from(merged)
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.round(n))
    .sort((a, b) => b - a);

  root.innerHTML = "";
  sorted.forEach((day) => {
    const chip = document.createElement("div");
    chip.className = "notification-day-chip";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn tiny ghost";
    if (notificationDayOffsets.includes(day)) {
      toggleBtn.classList.add("active");
    }
    toggleBtn.dataset.dayOffset = String(day);
    toggleBtn.dataset.dayAction = "toggle";
    toggleBtn.textContent = formatNotificationDayToken(day);
    chip.appendChild(toggleBtn);

    if (notificationCustomDayPresets.includes(day)) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn tiny ghost notification-day-action";
      editBtn.dataset.dayOffset = String(day);
      editBtn.dataset.dayAction = "edit_custom";
      editBtn.textContent = t("btn_edit_day");
      chip.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn tiny ghost notification-day-action";
      delBtn.dataset.dayOffset = String(day);
      delBtn.dataset.dayAction = "remove_custom";
      delBtn.textContent = t("btn_delete_day");
      chip.appendChild(delBtn);
    }

    root.appendChild(chip);
  });

  const input = $("notificationLeadInput");
  if (input) {
    input.min = String(notificationDayBounds.min);
    input.max = String(notificationDayBounds.max);
  }

  setNotificationPrefsMeta(tf("notifications_pref_current", { days: formatNotificationDaysList(notificationDayOffsets) }));
}

function toggleNotificationLeadDay(dayOffset) {
  const day = parseNotificationDayValue(dayOffset);
  if (day === null) {
    return;
  }
  const next = new Set(notificationDayOffsets || []);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  const normalized = normalizeNotificationDayOffsets(Array.from(next), [], notificationDayBounds.min, notificationDayBounds.max);
  if (!normalized.length) {
    setGlobalError(t("err_notification_no_offsets"));
    return;
  }
  notificationDayOffsets = normalized;
  renderNotificationLeadButtons();
}

function removeCustomNotificationLeadDay(dayOffset) {
  const day = parseNotificationDayValue(dayOffset);
  if (day === null) {
    return;
  }
  if (!notificationCustomDayPresets.includes(day)) {
    return;
  }

  notificationCustomDayPresets = notificationCustomDayPresets.filter((d) => d !== day);
  if (notificationDayOffsets.includes(day)) {
    const next = notificationDayOffsets.filter((d) => d !== day);
    if (!next.length) {
      setGlobalError(t("err_notification_no_offsets"));
      notificationCustomDayPresets = normalizeNotificationCustomDayPresets(
        [...notificationCustomDayPresets, day],
        notificationDayBounds.min,
        notificationDayBounds.max
      );
      return;
    }
    notificationDayOffsets = normalizeNotificationDayOffsets(next, [], notificationDayBounds.min, notificationDayBounds.max);
  }
  renderNotificationLeadButtons();
}

function editCustomNotificationLeadDay(dayOffset) {
  const day = parseNotificationDayValue(dayOffset);
  if (day === null) {
    return;
  }
  if (!notificationCustomDayPresets.includes(day)) {
    return;
  }

  const raw = window.prompt(tf("prompt_notification_edit_day", { day }), String(day));
  if (raw === null) {
    return;
  }
  const nextDay = parseNotificationDayValue(raw);
  if (nextDay === null) {
    setGlobalError(notificationDayRangeError());
    return;
  }
  if (nextDay === day) {
    return;
  }

  notificationCustomDayPresets = normalizeNotificationCustomDayPresets(
    [...notificationCustomDayPresets.filter((d) => d !== day), nextDay],
    notificationDayBounds.min,
    notificationDayBounds.max
  );

  if (notificationDayOffsets.includes(day)) {
    notificationDayOffsets = normalizeNotificationDayOffsets(
      [...notificationDayOffsets.filter((d) => d !== day), nextDay],
      [],
      notificationDayBounds.min,
      notificationDayBounds.max
    );
  }

  renderNotificationLeadButtons();
}

function addNotificationLeadDayFromInput() {
  const input = $("notificationLeadInput");
  if (!input) {
    return;
  }
  const raw = String(input.value || "").trim();
  if (!raw) {
    return;
  }

  const n = parseNotificationDayValue(raw);
  if (n === null) {
    setGlobalError(notificationDayRangeError());
    return;
  }

  if (!isBuiltInNotificationDay(n) && !notificationCustomDayPresets.includes(n)) {
    notificationCustomDayPresets = normalizeNotificationCustomDayPresets(
      [...notificationCustomDayPresets, n],
      notificationDayBounds.min,
      notificationDayBounds.max
    );
  }

  if (!notificationDayOffsets.includes(n)) {
    notificationDayOffsets = normalizeNotificationDayOffsets(
      [...notificationDayOffsets, n],
      [3, 1, 0],
      notificationDayBounds.min,
      notificationDayBounds.max
    );
  }
  input.value = "";
  renderNotificationLeadButtons();
}

async function loadNotificationPreferences() {
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId });
  const result = await request(`/api/v1/notifications/preferences?${q}`, { method: "GET" });
  const data = result?.data || {};
  const min = Number(data?.min_day_offset);
  const max = Number(data?.max_day_offset);
  notificationDayBounds = {
    min: Number.isFinite(min) ? Math.max(0, Math.round(min)) : 0,
    max: Number.isFinite(max) ? Math.max(0, Math.round(max)) : 60
  };
  notificationDayOffsets = normalizeNotificationDayOffsets(
    data?.day_offsets,
    [3, 1, 0],
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  const customFromServer = normalizeNotificationCustomDayPresets(
    data?.custom_day_presets,
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  if (customFromServer.length > 0) {
    notificationCustomDayPresets = customFromServer;
  } else {
    notificationCustomDayPresets = normalizeNotificationCustomDayPresets(
      notificationDayOffsets,
      notificationDayBounds.min,
      notificationDayBounds.max
    );
  }
  renderNotificationLeadButtons();
}

async function saveNotificationPreferences() {
  const dayOffsets = normalizeNotificationDayOffsets(
    notificationDayOffsets,
    [],
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  if (!dayOffsets.length) {
    throw new Error(t("err_notification_no_offsets"));
  }

  const userId = getUserId();
  const result = await request("/api/v1/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      day_offsets: dayOffsets,
      custom_day_presets: normalizeNotificationCustomDayPresets(
        notificationCustomDayPresets,
        notificationDayBounds.min,
        notificationDayBounds.max
      ),
      apply_to_existing: true
    })
  });

  const data = result?.data || {};
  notificationDayOffsets = normalizeNotificationDayOffsets(
    data?.day_offsets,
    dayOffsets,
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  notificationCustomDayPresets = normalizeNotificationCustomDayPresets(
    data?.custom_day_presets,
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  renderNotificationLeadButtons();
  setNotificationPrefsMeta(
    tf("toast_notification_prefs_saved", {
      days: formatNotificationDaysList(notificationDayOffsets),
      count: Number(data?.regenerated_notifications || 0)
    })
  );
  await loadNotifications();
}

function parseNotifyTypeDayOffset(notifyType) {
  const raw = String(notifyType || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "d_day") {
    return 0;
  }
  const m = /^d_minus_(\d+)$/.exec(raw);
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n);
}

function formatNotificationTypeLabel(item) {
  const fromField = Number(item?.days_before_expiration);
  if (Number.isFinite(fromField)) {
    return formatNotificationDayToken(fromField);
  }
  const fromType = parseNotifyTypeDayOffset(item?.notify_type || "");
  if (Number.isFinite(fromType)) {
    return formatNotificationDayToken(fromType);
  }
  return String(item?.notify_type || "-");
}

function formatNotificationDueLabel(daysUntilExpiration) {
  const n = Number(daysUntilExpiration);
  if (!Number.isFinite(n)) {
    return t("word_none");
  }
  if (n < 0) {
    return tf("notification_due_expired", { days: Math.abs(Math.round(n)) });
  }
  if (n === 0) {
    return t("notification_due_day");
  }
  return tf("notification_due_left", { days: Math.round(n) });
}

function formatDateForDisplay(value, includeTime = false) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
  }

  const input = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const dt = new Date(input);
  if (!Number.isFinite(dt.getTime())) {
    return raw;
  }

  try {
    const locale = currentLang === "ko" ? "ko-KR" : "en-US";
    if (includeTime) {
      return dt.toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    return dt.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  } catch {
    if (includeTime) {
      return dt.toISOString().replace("T", " ").slice(0, 16);
    }
    return dt.toISOString().slice(0, 10);
  }
}

function resolveNotificationBadgeStatus(notification) {
  const itemStatus = String(notification?.item?.status || "").trim().toLowerCase();
  if (itemStatus === "expired") {
    return "expired";
  }
  if (itemStatus === "expiring_soon") {
    return "expiring_soon";
  }
  const days = Number(notification?.days_until_expiration);
  if (Number.isFinite(days) && days < 0) {
    return "expired";
  }
  return notification?.status === "pending" ? "expiring_soon" : "fresh";
}

function renderNotifications(items) {
  const list = $("notificationList");
  list.innerHTML = "";
  if (!items.length) {
    list.appendChild(emptyNode(t("empty_notifications")));
    return;
  }

  items.forEach((n) => {
    const item = n?.item || null;
    const ingredientName = item
      ? ingredientLabel(item?.ingredient_key || "", item?.ingredient_name || "")
      : t("notification_unknown_item");
    const storage = item ? storageLabel(item?.storage_type || "") : t("word_none");
    const expDate = item?.suggested_expiration_date ? formatDateForDisplay(item.suggested_expiration_date) : "-";
    const due = formatNotificationDueLabel(n?.days_until_expiration);
    const ruleLabel = formatNotificationTypeLabel(n);
    const scheduled = formatDateForDisplay(n?.scheduled_at, true);

    const node = document.createElement("div");
    node.className = "item";

    const main = document.createElement("div");
    main.className = "item-main";

    const nameEl = document.createElement("strong");
    nameEl.className = "name";
    nameEl.textContent = ingredientName || t("notification_unknown_item");

    const typeMeta = document.createElement("span");
    typeMeta.className = "meta";
    typeMeta.textContent = tf("meta_notification_type", { type: ruleLabel });

    const expMeta = document.createElement("span");
    expMeta.className = "meta";
    expMeta.textContent = tf("meta_notification_exp", {
      exp: expDate,
      storage,
      due
    });

    const scheduleMeta = document.createElement("span");
    scheduleMeta.className = "meta";
    scheduleMeta.textContent = tf("meta_notification_scheduled_simple", { ts: scheduled });

    main.appendChild(nameEl);
    main.appendChild(typeMeta);
    main.appendChild(expMeta);
    main.appendChild(scheduleMeta);

    const side = document.createElement("div");
    side.className = "item-side";
    side.appendChild(statusBadge(resolveNotificationBadgeStatus(n)));

    node.appendChild(main);
    node.appendChild(side);
    list.appendChild(node);
  });
}

async function loadNotifications() {
  try {
    await loadIngredientLabels();
  } catch {
    // Label cache is best-effort for prettier names.
  }
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, status: "pending" });
  const result = await request(`/api/v1/notifications?${q}`, { method: "GET" });
  renderNotifications(result?.data?.items || []);
}

async function reloadNotificationsPanel() {
  await loadNotificationPreferences();
  await loadNotifications();
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
    reloadNotificationsPanel(),
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
  if ($("inventoryBulkConsumeBtn")) {
    $("inventoryBulkConsumeBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await bulkAdjustSelectedInventory(-1);
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

      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      if (visionEditMode === "add") {
        const bb = buildSpotBboxAt(nx, ny, rect);
        const obj = buildCustomVisionObject(bb);
        visionObjectsCache = (visionObjectsCache || []).concat([obj]);
        visionSelectedObjectId = obj.id;
        setVisionEditMode("select");
        renderVisionObjectPreview({ skipImageReload: true });
        openVisionInlineEditor(obj.id);
        if (isVoiceCaptureRunning()) {
          setVisionRelabelTarget(obj.id, { select: false, announce: true });
        }
        event.preventDefault();
        return;
      }

      const hit = findVisionObjectAt(nx, ny, rect);
      if (hit?.id) {
        const id = String(hit.id);
        const now = Date.now();
        const detailCount = Number(event.detail || 0);
        const isDoubleTap =
          detailCount >= 2 || (visionLastTapObjectId === id && now - visionLastTapAt <= 320);
        visionLastTapObjectId = id;
        visionLastTapAt = now;
        selectVisionObject(id);
        if (isVoiceCaptureRunning()) {
          setVisionRelabelTarget(id, { select: false, announce: true });
        }
        if (isDoubleTap) {
          openVisionInlineEditor(id);
          event.preventDefault();
          return;
        }

        const bb = hit.bbox || null;
        if (bb) {
          visionPointerState = {
            pointerId: event.pointerId,
            objectId: id,
            startNx: nx,
            startNy: ny,
            startBbox: {
              x: Number(bb.x),
              y: Number(bb.y),
              w: Number(bb.w),
              h: Number(bb.h)
            },
            moved: false
          };
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {}
        }
        event.preventDefault();
        return;
      }
      visionPointerState = null;
      visionSelectedObjectId = "";
      syncVisionObjectSelectionUI();
      closeVisionInlineEditor();
      drawVisionOverlay();
    };

    const onMove = (event) => {
      if (!visionPointerState || event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      const img = $("visionPreviewImage");
      if (!img) {
        return;
      }
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const start = visionPointerState.startBbox;
      if (!start) {
        return;
      }

      const dx = nx - visionPointerState.startNx;
      const dy = ny - visionPointerState.startNy;
      if (!visionPointerState.moved && Math.hypot(dx, dy) > 0.008) {
        visionPointerState.moved = true;
      }

      if (visionPointerState.moved) {
        updateVisionObjectBbox(visionPointerState.objectId, {
          x: clamp(start.x + dx, 0, Math.max(0, 1 - start.w)),
          y: clamp(start.y + dy, 0, Math.max(0, 1 - start.h)),
          w: start.w,
          h: start.h
        });
        drawVisionOverlay();
      }
      event.preventDefault();
    };

    const onUp = (event) => {
      if (!visionPointerState || event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      visionPointerState = null;
      drawVisionOverlay();
      event.preventDefault();
    };

    const onCancel = (event) => {
      if (!visionPointerState || event.pointerId !== visionPointerState.pointerId) {
        return;
      }
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
      visionPointerState = null;
      drawVisionOverlay();
    };

    const onDoubleClick = (event) => {
      const img = $("visionPreviewImage");
      if (!img) {
        return;
      }
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const hit = findVisionObjectAt(nx, ny, rect);
      if (!hit?.id) {
        return;
      }
      openVisionInlineEditor(hit.id);
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("dblclick", onDoubleClick);
  }
  if ($("visionInlineEditor")) {
    const { input, saveBtn, cancelBtn } = getVisionInlineEditorElements();
    if (saveBtn) {
      saveBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          await saveVisionInlineEditorLabel();
        } catch {}
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (event) => {
        event.preventDefault();
        closeVisionInlineEditor();
      });
    }
    if (input) {
      input.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          try {
            await saveVisionInlineEditorLabel();
          } catch {}
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeVisionInlineEditor();
        }
      });
    }
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
        if (!isRealtimeConnected() && !browserSpeechRunning) {
          const selected = getSelectedVisionObject();
          if (selected?.id) {
            setVisionRelabelTarget(selected.id, { announce: true });
            closeVisionInlineEditor();
            realtimeLastIngestedText = "";
            realtimeLastIngestedAt = 0;
          }
        }

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
  if ($("reloadExpiringFocusBtn")) {
    $("reloadExpiringFocusBtn").addEventListener("click", loadInventory);
  }
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
  $("reloadNotificationsBtn").addEventListener("click", reloadNotificationsPanel);
  if ($("notificationLeadButtons")) {
    $("notificationLeadButtons").addEventListener("click", (event) => {
      const btn = event?.target?.closest?.("button[data-day-offset][data-day-action]");
      if (!btn) {
        return;
      }
      const action = String(btn.dataset.dayAction || "").trim();
      if (action === "toggle") {
        toggleNotificationLeadDay(btn.dataset.dayOffset);
        return;
      }
      if (action === "remove_custom") {
        removeCustomNotificationLeadDay(btn.dataset.dayOffset);
        return;
      }
      if (action === "edit_custom") {
        editCustomNotificationLeadDay(btn.dataset.dayOffset);
      }
    });
  }
  if ($("notificationLeadAddBtn")) {
    $("notificationLeadAddBtn").addEventListener("click", (event) => {
      event.preventDefault();
      addNotificationLeadDayFromInput();
    });
  }
  if ($("notificationLeadInput")) {
    $("notificationLeadInput").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      addNotificationLeadDayFromInput();
    });
  }
  if ($("saveNotificationPrefsBtn")) {
    $("saveNotificationPrefsBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await saveNotificationPreferences();
      } catch (err) {
        setGlobalError(err?.message || String(err));
      }
    });
  }
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
