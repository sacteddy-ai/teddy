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
let realtimePendingSpatialAddContext = null; // { anchor_phrase, relation }
let realtimePendingSpatialAddAt = 0;
let realtimePendingInventoryText = "";
let realtimePendingInventoryAt = 0;
let realtimeLastAutoIngestKey = "";
let realtimeLastAutoIngestAt = 0;
let realtimeLoggedEventTypes = new Set();
let realtimeTranscriptionFallbackApplied = false;
let realtimeQuotaBlocked = false;
let realtimeLastResponseCreateAt = 0;
let realtimeResponseInProgress = false;

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
  onion: { en: "Onion", ko: "?묓뙆" },
  green_onion: { en: "Green Onion", ko: "??? }
};

let inventoryItemsCache = [];
let inventoryFilterStorage = "refrigerated";
let inventorySelectedIds = new Set();
let shoppingItemsCache = [];
let shoppingAutoOnly = false;
let notificationDayOffsets = [3];
let notificationDayBounds = { min: 0, max: 60 };
const APP_SCREEN_STORAGE_KEY = "teddy_app_screen";
const APP_SCREEN_HASH_PREFIX = "#/";
const APP_SCREENS = ["home", "capture", "inventory", "recipes", "shopping", "alerts"];
const APP_SCREEN_SET = new Set(APP_SCREENS);
const LEGACY_HASH_SCREEN_MAP = {
  mobilehomecard: "home",
  home: "home",
  capture: "capture",
  capturecard: "capture",
  capturedraftcard: "capture",
  photo: "capture",
  talk: "capture",
  inventory: "inventory",
  inventorycard: "inventory",
  recipe: "recipes",
  recipes: "recipes",
  recipescard: "recipes",
  shopping: "shopping",
  shop: "shopping",
  shoppingcard: "shopping",
  alerts: "alerts",
  alert: "alerts",
  notifications: "alerts",
  notificationscard: "alerts",
  expiring: "alerts",
  expiringcard: "alerts"
};
let currentAppScreen = "home";

const I18N = {
  en: {
    doc_title: "FRAI Fridge Dashboard",
    hero_eyebrow: "FRAI MVP",
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
    btn_undo_last: "Undo Last",
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
    notifications_pref_desc: "Set one alert day before expiration.",
    label_notification_day: "Day",
    btn_add_day: "Set Day",
    btn_save_notification_prefs: "Save Alert Rule",
    notifications_pref_current: "Current alert day: {days}",
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
    voice_draft_edit_hint: "Say name or quantity.",
    voice_ack_applied: "Applied.",
    voice_ack_confirmed: "Confirmed.",
    voice_ack_undone: "Undone.",
    voice_undo_empty: "Nothing to undo.",
    voice_ack_target_selected: "Spot {index} selected. Say name or quantity.",
    voice_wait_more: "Keep speaking.",
    voice_already_applied: "Already applied.",
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
    doc_title: "Teddy ?됱옣怨???쒕낫??,
    hero_eyebrow: "FRAI MVP",
    hero_title: "?됱옣怨?而⑦듃濡?蹂대뱶",
    hero_subtitle: "?앹옱猷? ?좏넻湲고븳, ?덉떆?? ?λ낫湲곌퉴吏 ???붾㈃?먯꽌 愿由ы븯?몄슂.",
    label_user_id: "User ID",
    label_language: "?몄뼱",
    easy_mode_label: "?ъ슫 紐⑤뱶",
    btn_refresh_all: "?꾩껜 ?덈줈怨좎묠",
    btn_reload_catalog: "移댄깉濡쒓렇 ?덈줈怨좎묠",
    remote_api_summary: "?먭꺽 API (?좏깮)",
    label_api_base_url: "API Base URL",
    btn_save: "???,
    btn_use_same_origin: "媛숈? ?꾨찓???ъ슜",
    remote_api_help_html:
      "??쒕낫?쒕뒗 Pages?? API???ㅻⅨ 怨??? ?곕꼸)???꾩썱?????ъ슜?섏꽭?? API ?쒕쾭?먯꽌 CORS瑜?<code>ENABLE_CORS=1</code> 濡?耳쒖빞 ?⑸땲??",
    capture_storage_help: "?몃깽?좊━濡??뺤젙??????蹂닿? 諛⑹떇?쇰줈 ??λ맗?덈떎.",
    word_none: "?놁쓬",
    word_new_item: "????ぉ",
    word_source: "\uCD9C\uCC98",
    word_link: "\uB9C1\uD06C",
    stat_total: "?꾩껜",
    stat_fresh: "?좎꽑",
    stat_expiring_soon: "?꾨컯",
    stat_expired: "留뚮즺",
    add_item_title: "?몃깽?좊━ ??ぉ 異붽?",
    label_ingredient: "?앹옱猷?,
    ph_ingredient_example: "?곗쑀",
    label_purchased_date: "援щℓ??,
    label_storage_type: "蹂닿? 諛⑹떇",
    storage_refrigerated: "?됱옣",
    storage_frozen: "?됰룞",
    storage_room: "?곸삩",
    label_quantity: "?섎웾",
    label_unit: "?⑥쐞",
    label_ocr_raw_text: "OCR ?먮Ц (?좏깮)",
    ph_ocr_example: "?좏넻湲고븳 2026-03-20",
    label_product_shelf_life_days: "?쒗뭹 ?좏넻湲고븳(?? (?좏깮)",
    btn_save_item: "???,
    notification_runner_title: "?뚮┝ ?ㅽ뻾",
    notification_runner_desc: "吏湲덇퉴吏 ?꾩갑?댁빞 ???뚮┝??紐⑤몢 諛쒖넚?⑸땲??",
    btn_run_due_notifications: "?뚮┝ ?ㅽ뻾",
    conversational_capture_title: "??뷀삎 罹≪쿂",
    btn_take_photo: "?ъ쭊 李띻린",
    btn_quick_talk: "留먰븯湲?,
    btn_quick_talk_browser: "留먰븯湲?(釉뚮씪?곗?)",
    btn_stop_talk: "留먰븯湲?以묒?",
    quick_capture_hint: "蹂닿? 諛⑹떇??怨좊Ⅴ怨? ?ъ쭊??李띻굅??留먰빐蹂댁꽭?? ?먮룞?쇰줈 ?쒕옒?꾪듃??異붽??댁슂.",
    label_session_id: "?몄뀡 ID",
    ph_start_session: "?몄뀡 ?쒖옉",
    btn_start_session: "?몄뀡 ?쒖옉",
    label_voice_text_message: "?뚯꽦/?띿뒪??硫붿떆吏",
    ph_capture_message_example: "?쇱そ? ?먮?, 洹??놁? 怨꾨?, ?꾨옒移몄뿉???쇳겢怨??ㅼ씠媛 ?덉뼱.",
    label_vision_items: "鍮꾩쟾 ?꾩씠???쇳몴 援щ텇, ?좏깮)",
    ph_vision_items_example: "?먮?, 源移?,
    label_vision_image: "?대?吏(?좏깮)",
    label_segmentation: "?멸렇硫섑뀒?댁뀡",
    seg_auto: "?먮룞 (?ㅼ젙 ??SAM3 ?ъ슜)",
    seg_none: "?놁쓬 (?꾩껜 ?대?吏)",
    seg_sam3_http: "sam3_http (?붾뱶?ъ씤???꾩슂)",
    btn_analyze_image: "?대?吏 遺꾩꽍",
    vision_objects_title: "?ㅻ툕?앺듃 ?쇰꺼",
    vision_objects_hint: "?ㅽ뙚???뚮윭 ?좏깮?섏꽭?? '?ㅽ뙚 異붽?'瑜??꾨Ⅴ怨??ъ쭊????빐 異붽????? 湲?먮굹 留먮줈 ?대쫫??怨좎튂?몄슂.",
    btn_edit_label: "?섏젙",
    btn_edit_label_voice: "留먮줈 ?섏젙",
    btn_remove_one: "鍮쇨린",
    btn_save_label: "???,
    btn_cancel_label: "痍⑥냼",
    vision_badge_ok: "?뺤떊",
    vision_badge_low: "?뺤씤",
    btn_add_box: "?ㅽ뙚 異붽?",
    btn_delete_box: "??젣",
    live_camera_summary: "?쇱씠釉?移대찓??(?ㅽ뿕)",
    btn_start_camera: "移대찓???쒖옉",
    btn_stop_camera: "移대찓??以묒?",
    btn_capture_frame: "?꾨젅??罹≪쿂",
    label_facing: "移대찓??,
    facing_back: "?꾨㈃",
    facing_front: "?꾨㈃",
    label_auto_capture: "?먮룞 罹≪쿂",
    auto_off: "??,
    realtime_summary: "Realtime ?뚯꽦 ?먯씠?꾪듃 (?섏씠釉뚮━??",
    btn_start_voice: "?뚯꽦 ?쒖옉",
    btn_stop_voice: "?뚯꽦 以묒?",
    realtime_auto_ingest: "???뚯꽦???먮룞?쇰줈 ?쒕옒?꾪듃??異붽?",
    realtime_share_snapshots: "?ㅻ깄???대?吏)???먯씠?꾪듃?먭쾶 怨듭쑀",
    label_send_text_optional: "?띿뒪??蹂대궡湲?(?좏깮)",
    ph_realtime_text_example: "吏湲??덈뒗 ?щ즺濡?萸?留뚮뱾 ???덉뼱?",
    btn_send_to_agent: "?먯씠?꾪듃?먭쾶 ?꾩넚",
    btn_send_message: "硫붿떆吏 蹂대궡湲?,
    btn_undo_last: "?댁쟾 蹂寃?痍⑥냼",
    btn_finalize_to_inventory: "?몃깽?좊━濡??뺤젙",
    capture_draft_title: "罹≪쿂 ?쒕옒?꾪듃",
    pending_confirmations_title: "?뺤씤 ?꾩슂 (?몄뀡)",
    ingredient_review_queue_title: "?앹옱猷??뺤씤 ??,
    btn_reload: "?덈줈怨좎묠",
    review_queue_desc: "紐⑤Ⅴ寃좉굅???뺤떊????? ?⑥뼱媛 ?ш린???밸땲?? ??踰덈쭔 留ㅽ븨?섎㈃ ?뚯꽌媛 ?숈뒿?⑸땲??",
    inventory_title: "?몃깽?좊━",
    recipes_title: "?덉떆??異붿쿇",
    shopping_title: "?λ낫湲?異붿쿇",
    btn_shopping_auto_only: "?먮룞二쇰Ц ?꾨낫留?,
    btn_shopping_show_all: "?꾩껜蹂닿린",
    btn_create_order_draft: "二쇰Ц 珥덉븞 留뚮뱾湲?,
    notifications_title: "?뚮┝",
    btn_consume_1: "1媛??뚮퉬",
    btn_select_all: "?꾩껜 ?좏깮",
    btn_clear_selection: "?좏깮 ?댁젣",
    btn_add_1: "1媛?異붽?",
    btn_delete_selected: "??젣",
    inventory_selected_count: "?좏깮: {count}媛?,
    btn_map_prefix: "留ㅽ븨:",
    btn_map_custom: "吏곸젒 留ㅽ븨",
    btn_ignore: "臾댁떆",
    label_ingredient_key: "?앹옄????,
    label_display_name_optional: "?쒖떆 ?대쫫(?좏깮)",
    err_missing_key_map: "??臾몄옣??留ㅽ븨?섎젮硫?ingredient_key媛 ?꾩슂?⑸땲??",
    unknown_phrase: "(?????녿뒗 臾멸뎄)",
    review_meta_line: "?ъ쑀: {reason} | ?잛닔: {seen}",
    empty_inventory: "?꾩쭅 ?몃깽?좊━ ??ぉ???놁뒿?덈떎.",
    empty_recipes: "?덉떆??異붿쿇???놁뒿?덈떎.",
    empty_shopping: "?λ낫湲?異붿쿇???놁뒿?덈떎.",
    empty_shopping_auto_only: "?먮룞二쇰Ц ?꾨낫媛 ?놁뒿?덈떎.",
    empty_notifications: "?뚮┝???놁뒿?덈떎.",
    empty_capture_none: "罹≪쿂 ?몄뀡???쒖옉?섏꽭??",
    empty_capture_no_session: "?쒖꽦 罹≪쿂 ?몄뀡???놁뒿?덈떎.",
    empty_capture_draft: "?쒕옒?꾪듃媛 鍮꾩뼱?덉뒿?덈떎.",
    empty_capture_review: "???몄뀡???뺤씤????ぉ???놁뒿?덈떎.",
    empty_review_queue: "?뺤씤????ぉ???놁뒿?덈떎.",
    capture_error_need_text_or_vision: "硫붿떆吏瑜??낅젰?섍굅??鍮꾩쟾 ?꾩씠?쒖쓣 ?ｌ뼱二쇱꽭??",
    err_no_capture_session: "?뺤젙??罹≪쿂 ?몄뀡???놁뒿?덈떎.",
    err_vision_label_required: "??諛뺤뒪 ?대쫫???낅젰?????뺤젙?댁＜?몄슂.",
    capture_error_no_confirmed: "?꾩쭅 ?뺤젙???앹옱猷뚭? ?놁뼱?? ?꾨옒?먯꽌 {count}媛쒕? ?뺤씤?댁＜?몄슂.",
    capture_error_none_detected: "??硫붿떆吏?먯꽌 ?앹옱猷뚮? 李얠? 紐삵뻽?댁슂. ?대쫫????紐낇솗???곌굅??鍮꾩쟾???ъ슜?대낫?몄슂.",
    capture_error_need_confirmation: "?꾨옒?먯꽌 {count}媛쒕? ???뺤씤?댁빞 ?⑸땲??",
    vision_no_detected: "???대?吏?먯꽌 ?앹옱猷뚮? 李얠? 紐삵뻽?댁슂.",
    camera_tip_https: "?? ?대??곗뿉??移대찓??誘몃━蹂닿린??蹂댄넻 HTTPS媛 ?꾩슂?⑸땲?? ?ъ쭊 ?낅줈?쒕뒗 ?숈옉?⑸땲??",
    camera_idle: "移대찓???湲?以?",
    voice_idle: "?뚯꽦 ?湲?以?",
    voice_starting: "?뚯꽦 ?곌껐 以?..",
    voice_ready: "以鍮??? 留먰빐蹂댁꽭??",
    voice_connected: "?뚯꽦 ?곌껐??",
    voice_connection_state: "?뚯꽦 ?곌껐 ?곹깭: {state}",
    voice_listening: "?ｋ뒗 以?..",
    voice_processing: "泥섎━ 以?..",
    voice_heard: "?몄떇: {text}",
    voice_start_failed: "?뚯꽦 ?쒖옉 ?ㅽ뙣: {msg}",
    voice_stopped: "?뚯꽦 ?몄뀡 醫낅즺??",
    voice_error_prefix: "?ㅻ쪟: {msg}",
    voice_quota_exceeded:
      "OpenAI ?щ젅??荑쇳꽣媛 遺議깊빐???뚯꽦 ?몄떇??留됲삍?댁슂. 寃곗젣/?щ젅?㏃쓣 異붽??섎㈃ ?ㅼ떆 ?숈옉?⑸땲?? 吏湲덉? 釉뚮씪?곗? ?뚯꽦 ?몄떇???ъ슜?⑸땲??",
    voice_draft_updated: "留먰븳 ?댁슜???쒕옒?꾪듃??諛섏쁺?덉뼱??",
    voice_draft_updated_ready: "?쒕옒?꾪듃??異붽??덉뼱?? ?뺤씤 ??'?몃깽?좊━濡??뺤젙'???뚮윭二쇱꽭??",
    voice_draft_edit_hint: "\uC774\uB984 \uB610\uB294 \uC218\uB7C9\uB9CC \uB9D0\uC500\uD574 \uC8FC\uC138\uC694.",
    voice_ack_applied: "\uC801\uC6A9\uD588\uC2B5\uB2C8\uB2E4.",
    voice_ack_confirmed: "\uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.",
    voice_ack_undone: "\uB418\uB3CC\uB838\uC2B5\uB2C8\uB2E4.",
    voice_undo_empty: "?섎룎由?蹂寃쎌씠 ?놁뼱??",
    voice_ack_target_selected: "{index}\uBC88\uC744 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4. \uC774\uB984 \uB610\uB294 \uC218\uB7C9\uC744 \uB9D0\uC500\uD574 \uC8FC\uC138\uC694.",
    voice_wait_more: "怨꾩냽 留먰븯?몄슂.",
    voice_already_applied: "?대? 諛섏쁺?먯뼱??",
    voice_draft_update_failed: "?쒕옒?꾪듃 諛섏쁺 ?ㅽ뙣: {msg}",
    voice_inventory_updated: "?몃깽?좊━ ?낅뜲?댄듃: {summary}",
    voice_inventory_no_items: "??臾몄옣?먯꽌 ?앹옱猷뚮? 李얠? 紐삵뻽?댁슂.",
    voice_inventory_update_failed: "?몃깽?좊━ ?낅뜲?댄듃 ?ㅽ뙣: {msg}",
    voice_saved: "?몃깽?좊━????ν뻽?댁슂.",
    meta_session_line: "?몄뀡 {id} | ?곹깭 {status} | ?꾩씠??{items} | 珥??섎웾 {qty}",
    meta_inventory_line: "{qty}{unit} | {storage} | ?좏넻湲고븳 {exp} | D{days}",
    meta_recipe_line: "{chef} | ?먯닔 {score} | 留ㅼ묶 {match}%",
    meta_recipe_missing: "遺議? {missing}",
    meta_recipe_missing_unknown: "遺議? ?щ즺 遺꾩꽍 以?,
    meta_recipe_link_line: "{provider} | ?먯닔 {score} | 留ㅼ묶 {match}%",
    recipe_cluster_links: "留곹겕 {count}媛?,
    recipe_title_fallback: "?붾━",
    meta_shopping_reasons: "?댁쑀: {reasons}",
    meta_shopping_related: "?곌? ?덉떆?? {related}",
    toast_order_draft_created: "二쇰Ц 珥덉븞 ?앹꽦: {id} ({count}媛?",
    err_order_draft_no_items: "二쇰Ц 珥덉븞?쇰줈 留뚮뱾 ??ぉ???놁뒿?덈떎.",
    meta_notification_item: "?꾩씠?? {id}",
    meta_notification_scheduled: "?덉빟: {ts}",
    toast_run_due: "?뚮┝ {count}嫄?諛쒖넚 ?꾨즺 ({ts})",
    toast_reload_catalog: "罹먯떆 {count}媛??덈줈怨좎묠 ?꾨즺 ({ts})",
    badge_draft: "?쒕옒?꾪듃"
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
    fresh: "?좎꽑",
    expiring_soon: "?꾨컯",
    expired: "留뚮즺",
    draft: "?쒕옒?꾪듃",
    pending: "?湲?,
    ignored: "臾댁떆",
    resolved: "?꾨즺"
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
  // Default to easy mode unless explicitly disabled by query.
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

function normalizeAppScreenName(value) {
  const key = String(value || "").trim().toLowerCase();
  return APP_SCREEN_SET.has(key) ? key : "home";
}

function parseAppScreenFromHash() {
  const raw = String(window.location.hash || "").trim();
  if (!raw) {
    return "";
  }
  const cleaned = raw
    .replace(/^#\/?/, "")
    .replace(/^app\/?/i, "")
    .split(/[?&]/)[0]
    .trim();

  if (APP_SCREEN_SET.has(cleaned)) {
    return cleaned;
  }

  const normalizedKey = String(cleaned).toLowerCase().replace(/[^a-z0-9_/-]/g, "");
  if (APP_SCREEN_SET.has(normalizedKey)) {
    return normalizedKey;
  }
  if (LEGACY_HASH_SCREEN_MAP[normalizedKey]) {
    return LEGACY_HASH_SCREEN_MAP[normalizedKey];
  }

  const firstSegment = normalizedKey.split("/")[0];
  if (APP_SCREEN_SET.has(firstSegment)) {
    return firstSegment;
  }
  if (LEGACY_HASH_SCREEN_MAP[firstSegment]) {
    return LEGACY_HASH_SCREEN_MAP[firstSegment];
  }

  return "";
}

function animateAppScreenSwitch() {
  const page = document.querySelector(".page");
  if (!page) {
    return;
  }
  page.classList.remove("screen-switching");
  void page.offsetWidth;
  page.classList.add("screen-switching");
  window.setTimeout(() => {
    page.classList.remove("screen-switching");
  }, 220);
}

function setAppScreen(screen, options = {}) {
  const next = normalizeAppScreenName(screen);
  const updateHash = options.updateHash !== false;
  const animate = options.animate !== false;
  const replaceHash = options.replaceHash === true;
  const force = options.force === true;

  if (!force && next === currentAppScreen) {
    return;
  }

  currentAppScreen = next;
  document.body.dataset.appScreen = next;
  localStorage.setItem(APP_SCREEN_STORAGE_KEY, next);

  document.querySelectorAll("[data-app-screen]").forEach((node) => {
    const allowed = String(node.getAttribute("data-app-screen") || "")
      .split(/\s+/)
      .map((v) => normalizeAppScreenName(v))
      .includes(next);
    node.hidden = !allowed;
    node.classList.toggle("screen-active", allowed);
  });

  document.querySelectorAll(".app-nav-btn[data-screen]").forEach((btn) => {
    const target = normalizeAppScreenName(btn.getAttribute("data-screen"));
    btn.classList.toggle("active", target === next);
  });

  if (updateHash) {
    const targetHash = `${APP_SCREEN_HASH_PREFIX}${next}`;
    if (window.location.hash !== targetHash) {
      if (replaceHash) {
        window.history.replaceState(null, "", targetHash);
      } else {
        window.history.pushState(null, "", targetHash);
      }
    }
  }

  if (animate) {
    animateAppScreenSwitch();
  }
  window.scrollTo(0, 0);
}

function bindMobileHomeActions() {
  const takePhotoBtn = $("hubTakePhotoBtn");
  if (takePhotoBtn) {
    takePhotoBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("capture");
      const fileInput = $("captureVisionImageInput");
      if (fileInput) {
        fileInput.click();
      }
    });
  }

  const talkBtn = $("hubTalkBtn");
  if (talkBtn) {
    talkBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("capture");
      const quickTalkBtn = $("quickTalkBtn");
      if (quickTalkBtn) {
        quickTalkBtn.click();
      }
    });
  }

  const notificationsBtn = $("hubNotificationsBtn");
  if (notificationsBtn) {
    notificationsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("alerts");
      const reloadBtn = $("reloadNotificationsBtn");
      if (reloadBtn) {
        reloadBtn.click();
      }
    });
  }

  const recipesBtn = $("hubRecipesBtn");
  if (recipesBtn) {
    recipesBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("recipes");
      const reloadBtn = $("reloadRecipesBtn");
      if (reloadBtn) {
        reloadBtn.click();
      }
    });
  }

  const shoppingBtn = $("hubShoppingBtn");
  if (shoppingBtn) {
    shoppingBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("shopping");
      const reloadBtn = $("reloadShoppingBtn");
      if (reloadBtn) {
        reloadBtn.click();
      }
    });
  }

  const exploreBtn = $("hubExploreBtn");
  if (exploreBtn) {
    exploreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      setAppScreen("inventory");
      if ($("reloadInventoryBtn")) {
        $("reloadInventoryBtn").click();
      }
    });
  }
}

function bindAppBottomNav() {
  document.querySelectorAll(".app-nav-btn[data-screen]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const target = normalizeAppScreenName(btn.getAttribute("data-screen"));
      setAppScreen(target);
      if (target === "recipes" && $("reloadRecipesBtn")) {
        $("reloadRecipesBtn").click();
      } else if (target === "shopping" && $("reloadShoppingBtn")) {
        $("reloadShoppingBtn").click();
      } else if (target === "alerts" && $("reloadNotificationsBtn")) {
        $("reloadNotificationsBtn").click();
      } else if (target === "inventory" && $("reloadInventoryBtn")) {
        $("reloadInventoryBtn").click();
      }
    });
  });

  window.addEventListener("hashchange", () => {
    const target = parseAppScreenFromHash();
    if (!target || target === currentAppScreen) {
      return;
    }
    setAppScreen(target, { updateHash: false, animate: false, force: true });
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

function getVisionObjectOrdinalById(objectId) {
  const id = String(objectId || "").trim();
  if (!id) {
    return null;
  }
  const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache : [];
  const idx = arr.findIndex((o) => String(o?.id || "").trim() === id);
  return idx >= 0 ? idx + 1 : null;
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
    /\s*(?:\uC774|\uAC00)?\s*(?:\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uB2E4)\s*[.!?~]*$/u,
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

  if (isAffirmationOnlySpeech(label)) {
    return "";
  }
  if (isVoiceConnectorOnlyText(label)) {
    return "";
  }

  label = normalizeVoiceFoodAlias(label);
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
    /(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)(?:\uC57C|\uC694|\uC608\uC694|\uC785\uB2C8\uB2E4)?$/u,
    ""
  );
  if (/^(?:\uC774|\uAC00|\uC740|\uB294|\uC744|\uB97C)$/u.test(token || base)) {
    return null;
  }
  const n = parseSpokenOrdinalIndexToken(token || base);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

const VOICE_FOOD_ALIAS_MAP = new Map([
  ["\uD76C\uB9DD", "\uD53C\uB9DD"],
  ["\uBC29\uC6B8 \uD1A0\uB9C8\uD1A0", "\uBC29\uC6B8\uD1A0\uB9C8\uD1A0"]
]);

function normalizeVoiceFoodAlias(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  return VOICE_FOOD_ALIAS_MAP.get(value) || value;
}

function normalizeVoiceIngredientPhrase(rawPhrase) {
  const aliasNormalized = normalizeVoiceFoodAlias(String(rawPhrase || "").replace(/\s+/g, " ").trim());
  const base = String(aliasNormalized || rawPhrase || "")
    .toLowerCase()
    .replace(
      /(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C|\uC640|\uACFC|\uB3C4|\uC57C|\uC694|\uC774\uACE0|\uB77C\uACE0|\uB77C\uB294|\uC774\uB791|\uB791)$/u,
      ""
    )
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "")
    .replace(/[^\uAC00-\uD7A3a-z0-9]/g, "")
    .trim();
  return base;
}

function isVoicePhraseMatchForVisionObject(rawPhrase, visionObj) {
  const phrase = normalizeVoiceIngredientPhrase(rawPhrase);
  if (!phrase) {
    return false;
  }

  const candidates = [
    ingredientLabel(
      String(visionObj?.ingredient_key || ""),
      String(visionObj?.ingredient_name || visionObj?.name || "")
    ),
    String(visionObj?.ingredient_name || ""),
    String(visionObj?.name || ""),
    String(visionObj?.ingredient_key || "").replace(/_/g, " ")
  ];

  for (const c of candidates) {
    const normalized = normalizeVoiceIngredientPhrase(c);
    if (!normalized) {
      continue;
    }
    if (normalized === phrase || normalized.includes(phrase) || phrase.includes(normalized)) {
      return true;
    }
  }
  return false;
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

function stripTrailingSpeechParticles(rawText) {
  let text = String(rawText || "").trim();
  if (!text) {
    return "";
  }
  let changed = true;
  while (changed && text) {
    changed = false;
    const next = text
      .replace(/(?:\uC774\uB791|\uB791|\uD558\uACE0|\uC640|\uACFC)\s*$/u, "")
      .replace(/(?:\uB3C4|\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C)\s*$/u, "")
      .trim();
    if (next !== text) {
      text = next;
      changed = true;
    }
  }
  return text;
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
  const compact = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
  if (!compact) {
    return true;
  }
  const tokens = new Set([
    "\uADF8\uB9AC\uACE0",
    "\uADF8\uB9AC\uACE0\uC694",
    "\uADF8\uB9AC\uACE0\uB294",
    "\uADF8\uB2E4\uC74C",
    "\uB2E4\uC74C",
    "\uB610",
    "\uADF8\uB7EC\uBA74",
    "\uADF8\uB7F0\uB370",
    "\uC7AC\uB8CC",
    "\uC0C1\uC628\uC7AC\uB8CC",
    "\uB0C9\uC7A5\uC7AC\uB8CC",
    "\uB0C9\uB3D9\uC7AC\uB8CC",
    "and",
    "then",
    "next"
  ]);
  return tokens.has(compact);
}

function isAffirmationOnlySpeech(rawText) {
  const compact = String(rawText || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
  if (!compact) {
    return false;
  }
  const yesTokens = [
    "\uB9DE\uC2B5\uB2C8\uB2E4",
    "\uB9DE\uC544\uC694",
    "\uB9DE\uC544",
    "\uB9DE\uC9C0",
    "\uB9DE\uC8E0",
    "\uC815\uD655\uD574\uC694",
    "\uC815\uD655\uD574",
    "\uADF8\uB807\uC2B5\uB2C8\uB2E4",
    "\uADF8\uB807\uC8E0",
    "\uADF8\uB798\uC694",
    "\uADF8\uB798",
    "\uADF8\uB7FC",
    "\uC751",
    "\uB124",
    "\uC608",
    "\u3147\u3147",
    "yes",
    "ok",
    "okay",
    "right",
    "correct"
  ];
  if (yesTokens.includes(compact)) {
    return true;
  }

  // Accept stacked confirmations like combined yes-tokens ("okyes", etc.).
  let rest = compact;
  for (let i = 0; i < 8 && rest; i += 1) {
    let matched = false;
    for (const token of yesTokens) {
      if (rest.startsWith(token)) {
        rest = rest.slice(token.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      break;
    }
  }
  return rest.length === 0;
}

function isUndoSpeech(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return false;
  }

  const compact = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
  if (!compact) {
    return false;
  }

  const exactSet = new Set([
    "\uC544\uB2C8\uC57C",
    "\uC544\uB0D0",
    "\uC544\uB2C8\uC694",
    "\uC544\uB2C8",
    "\uD2C0\uB838\uC5B4",
    "\uD2C0\uB824",
    "\uADF8\uAC70\uB9D0\uACE0",
    "\uC774\uAC70\uB9D0\uACE0",
    "\uADF8\uAC70\uC544\uB2C8\uC57C",
    "\uC774\uAC70\uC544\uB2C8\uC57C",
    "\uCDE8\uC18C",
    "\uCDE8\uC18C\uD574",
    "\uB418\uB3CC\uB824",
    "\uB418\uB3CC\uB824\uC918",
    "\uB418\uB3CC\uB9AC\uAE30",
    "\uC6D0\uB798\uB300\uB85C",
    "\uC774\uC804\uC73C\uB85C",
    "\uBC29\uAE08\uAC70\uCDE8\uC18C",
    "\uBC29\uAE08\uC218\uC815\uCDE8\uC18C",
    "undo",
    "undolast",
    "rollback",
    "revert",
    "goback"
  ]);
  if (exactSet.has(compact)) {
    return true;
  }

  const lowered = String(rawText || "").toLowerCase();
  if (/\b(?:undo|rollback|revert|go back|cancel last)\b/i.test(lowered)) {
    return true;
  }
  if (/(?:\uBC29\uAE08|\uC9C1\uC804|\uC774\uC804).*(?:\uCDE8\uC18C|\uB418\uB3CC|\uC6D0\uB798)/u.test(text)) {
    return true;
  }
  return false;
}

function isLikelyFragmentaryInventoryText(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return true;
  }
  if (isVoiceConnectorOnlyText(text)) {
    return true;
  }

  if (/(?:?대옉|???섍퀬|?|怨?諛?洹몃━怨??먮뒗|?먯꽌|遺????留?\s*$/u.test(text)) {
    return true;
  }

  const hasCommandVerb =
    /(?:?덉뼱|?덉뼱???덉뒿?덈떎|異붽?|??鍮?癒???젣|?뚮퉬|?섎웾|?좏넻湲고븳|?꾨땲???꾨땲怨?留먭퀬|蹂寃??섏젙|?댁쨾|?댁＜?몄슂)\s*[.!?~]*$/u.test(text);
  if (!hasCommandVerb && text.length <= 16) {
    return true;
  }
  return false;
}

function clearRealtimePendingInventoryText() {
  realtimePendingInventoryText = "";
  realtimePendingInventoryAt = 0;
}

function clearRealtimePendingSpatialAddContext() {
  realtimePendingSpatialAddContext = null;
  realtimePendingSpatialAddAt = 0;
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
    /(?:\uAC1C\uC218|\uC218\uB7C9)(?:\uB294|\uC740|\uC774|\uAC00)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)?(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694|\uC788\uB2E4|\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uACE0|\uC788\uB294\uB370|\uC788\uB2E4\uACE0)?/u,
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)\s*(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694|\uC788\uB2E4|\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uACE0|\uC788\uB294\uB370|\uC788\uB2E4\uACE0|\uB77C\uB2C8\uAE4C)?\s*[.!?~]*$/u,
    /^\s*(?:\uADF8\uAC70|\uC774\uAC70|\uC800\uAC70)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)\s*(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694|\uC788\uB2E4|\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uACE0|\uC788\uB294\uB370|\uC788\uB2E4\uACE0|\uB77C\uB2C8\uAE4C)?\s*[.!?~]*$/u
  ];
  const segments = [text, ...text.split(/[.!?~\n]+/u).map((v) => String(v || "").trim()).filter(Boolean)];
  for (const seg of segments) {
    const candidate = stripLeadingSpeechFiller(seg);
    if (!candidate) {
      continue;
    }
    for (const p of patterns) {
      const m = candidate.match(p);
      if (!m) {
        continue;
      }
      const q = parseSpokenCountToken(m[1]);
      if (Number.isFinite(q) && q > 0 && q <= 200) {
        return { quantity: q };
      }
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

      // Handle split utterances like "...?꾨땲?? then "?좊쭏?좉퀬".
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
    /^\s*(.+?)\s*(?:\uC740|\uB294|\uC774|\uAC00)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)?\s*(?:\uC57C|\uC785\uB2C8\uB2E4|\uC774\uC5D0\uC694|\uC608\uC694|\uC788\uB2E4|\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uACE0|\uC788\uB294\uB370|\uC788\uB2E4\uACE0|\uB77C\uB2C8\uAE4C|\uAC70\uB4E0)?\s*[.!?~]*$/u
  ];
  const segments = [text, ...text.split(/[.!?~\n]+/u).map((v) => String(v || "").trim()).filter(Boolean)];
  for (const segment of segments) {
    const candidate = stripLeadingSpeechFiller(segment);
    if (!candidate) {
      continue;
    }
    for (const pattern of patterns) {
      const m = candidate.match(pattern);
      if (!m) {
        continue;
      }
      const phrase = stripTrailingSpeechParticles(String(m[1] || "").trim());
      if (!phrase) {
        continue;
      }
      const quantity = parseSpokenCountToken(m[2]);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 200) {
        continue;
      }
      return { ingredient_phrase: phrase, quantity };
    }
  }

  return null;
}

function parseDraftRemoveIntent(rawText) {
  const textRaw = stripLeadingSpeechFiller(rawText);
  if (!textRaw) {
    return null;
  }
  const text = String(textRaw || "")
    .replace(/\s*(?:,?\s*(?:\uADF8\uB0E5|\uC880|\uC81C\uBC1C))+\s*[.!?~]*$/u, "")
    .trim();
  if (!text) {
    return null;
  }
  const removeVerb = /(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC9C0\uC6B0|\uC81C\uAC70|\uBE7C|\uC5C6\uC560|remove|delete)/iu;
  if (!removeVerb.test(text)) {
    return null;
  }

  const patterns = [
    /^\s*(.+?)\s*(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C)?\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})?\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)?\s*(?:\uB9CC)?\s*(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC9C0\uC6B0|\uC81C\uAC70|\uBE7C|\uC5C6\uC560)(?:\uC918|\uC8FC\uC138\uC694|\uD574|\uD574\uC918|\uD574\uC8FC\uC138\uC694)?\s*[.!?~]*$/u,
    /^\s*(?:\uC0AD\uC81C|\uC9C0\uC6CC|\uC9C0\uC6B0|\uC81C\uAC70|\uBE7C|\uC5C6\uC560)\s*(.+?)\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})?\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)?\s*[.!?~]*$/u
  ];

  const segments = [text, ...text.split(/[.!?~\n]+/u).map((v) => String(v || "").trim()).filter(Boolean)];
  for (const segment of segments) {
    const candidate = stripLeadingSpeechFiller(segment);
    if (!candidate) {
      continue;
    }
    for (const pattern of patterns) {
      const m = candidate.match(pattern);
      if (!m) {
        continue;
      }
      const phrase = stripTrailingSpeechParticles(String(m[1] || "").trim()).replace(/\s*(?:\uB9CC)$/u, "").trim();
      if (!phrase || isVoiceConnectorOnlyText(phrase)) {
        continue;
      }
      const qtyRaw = String(m[2] || "").trim();
      let quantity = 1;
      if (qtyRaw) {
        const q = parseSpokenCountToken(qtyRaw);
        if (Number.isFinite(q) && q > 0 && q <= 200) {
          quantity = q;
        }
      }
      return { ingredient_phrase: phrase, quantity };
    }
  }
  return null;
}

function parseVisionOrdinalQuantityIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }

  const head = text.match(
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(.*)$/u
  );
  if (!head) {
    return null;
  }

  const index = parseSpokenOrdinalIndexToken(head[1]);
  if (!Number.isFinite(index) || index < 1) {
    return null;
  }

  const tailRaw = String(head[2] || "").trim();
  if (!tailRaw) {
    return null;
  }

  let tail = tailRaw.replace(/^(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C)\s*/u, "").trim();
  if (!tail) {
    return null;
  }

  let quantity = null;
  const qtyOnly = parseQuantityOnlyIntent(tail);
  if (qtyOnly?.quantity) {
    quantity = qtyOnly.quantity;
  } else {
    const matches = Array.from(
      tail.matchAll(/([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)/gu)
    );
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      quantity = parseSpokenCountToken(last?.[1] || "");
    }
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 200) {
    return null;
  }

  let ingredientPhrase = "";
  const phraseMatch = parseDraftQuantityIntent(tail);
  if (phraseMatch?.ingredient_phrase) {
    ingredientPhrase = stripTrailingSpeechParticles(String(phraseMatch.ingredient_phrase || "").trim());
  } else {
    const m = tail.match(/^(.*?)(?:[0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)/u);
    if (m?.[1]) {
      ingredientPhrase = stripTrailingSpeechParticles(String(m[1] || "").trim());
    }
  }

  return {
    index,
    quantity,
    ingredient_phrase: ingredientPhrase
  };
}

function parseVisionAddAdjacentIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }

  const patterns = [
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(?:.+?\s+)?(?:\uC606(?:\uC5D0|\uC73C\uB85C)?|\uC606\uCABD(?:\uC5D0|\uC73C\uB85C)?)\s*(.+)\s*$/u,
    /^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(.+)\s*(?:\uC606(?:\uC5D0|\uC73C\uB85C)?|\uC606\uCABD(?:\uC5D0|\uC73C\uB85C)?)\s*$/u
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
    let rawLabel = String(m[2] || "").trim();
    rawLabel = rawLabel
      .replace(/^(?:\uC5D0|\uC5D4)\s*/u, "")
      .replace(
        /\s*(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C|\uB3C4)?\s*(?:\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC57C|\uC774\uC5D0\uC694|\uC608\uC694|\uC785\uB2C8\uB2E4)\s*[.!?~]*$/u,
        ""
      )
      .trim();
    rawLabel = stripTrailingSpeechParticles(rawLabel);
    const label = normalizeVisionLabelCandidate(extractVisionLabelFromSpeech(rawLabel) || rawLabel);
    if (!label) {
      continue;
    }
    return { index, label };
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
  let bestSpecificity = -1;
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
      const specificity = normalized.length;
      if (score > bestScore || (score === bestScore && specificity > bestSpecificity)) {
        bestScore = score;
        bestSpecificity = specificity;
        best = item;
      }
    }
  }
  return bestScore >= 50 ? best : null;
}

function findVisionObjectByVoicePhrase(ingredientPhrase) {
  const target = normalizeVoiceIngredientPhrase(ingredientPhrase);
  if (!target) {
    return null;
  }
  const objects = Array.isArray(visionObjectsCache) ? visionObjectsCache : [];
  if (objects.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = -1;
  let bestSpecificity = -1;
  for (const obj of objects) {
    const candidates = [
      ingredientLabel(obj?.ingredient_key || "", obj?.ingredient_name || obj?.name || ""),
      String(obj?.ingredient_name || ""),
      String(obj?.name || ""),
      String(obj?.ingredient_key || "").replace(/_/g, " ")
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
        score = 75;
      } else if (target.includes(normalized)) {
        score = 55;
      }
      const specificity = normalized.length;
      if (score > bestScore || (score === bestScore && specificity > bestSpecificity)) {
        bestScore = score;
        bestSpecificity = specificity;
        best = obj;
      }
    }
  }
  return bestScore >= 55 ? best : null;
}

function normalizeVoiceSpatialRelation(raw) {
  const token = String(raw || "").trim();
  if (!token) {
    return "right";
  }
  if (/\uC67C\uCABD|\uC67C\uD3B8/u.test(token)) {
    return "left";
  }
  if (/\uC624\uB978\uCABD|\uC624\uB978\uD3B8|\uC606/u.test(token)) {
    return "right";
  }
  if (/\uC704|\uC717/u.test(token)) {
    return "above";
  }
  if (/\uC544\uB798|\uBC11|\uC544\uB7AB/u.test(token)) {
    return "below";
  }
  return "right";
}

function parseVoiceVisionLabelAndQuantity(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text || isVoiceConnectorOnlyText(text) || isAffirmationOnlySpeech(text)) {
    return null;
  }
  if (
    /(?:\uC67C\uCABD|\uC624\uB978\uCABD|\uC606|\uC704|\uC544\uB798|\uBC11)/u.test(text) &&
    !/(?:\uCD94\uAC00|\uB123\uC5B4|\uB4F1\uB85D|\uC800\uC7A5)/u.test(text)
  ) {
    return null;
  }

  const sentence = String(text || "")
    .split(/[.!?~\n]+/u)
    .map((v) => String(v || "").trim())
    .filter(Boolean)[0] || text;

  const cleanupLabelPhrase = (raw) => {
    let value = String(raw || "").trim();
    if (!value) {
      return "";
    }
    value = value
      .replace(/\s*(?:\uB610|\uB354|\uC815\uB3C4|\uCAB4)\s*$/u, "")
      .replace(
        /\s*(?:\uD558\uB098|\uD55C|\uB458|\uB450|\uC14B|\uC138|\uB137|\uB124|\uB2E4\uC12F|\uC5EC\uC12F|\uC77C\uACF1|\uC5EC\uB35F|\uC544\uD649|\uC5F4|\d{1,3})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)?\s*$/u,
        ""
      )
      .trim();
    const parts = value.split(/\s+/u).filter(Boolean);
    const filtered = parts.filter((part) => {
      const token = String(part || "").trim();
      if (!token) {
        return false;
      }
      if (/^(?:\uB610|\uB354|\uC815\uB3C4|\uCAB4)$/u.test(token)) {
        return false;
      }
      if (parseSpokenCountToken(token)) {
        return false;
      }
      return true;
    });
    value = filtered.join(" ").trim() || value;
    return stripTrailingSpeechParticles(value);
  };

  const qtyIntent = parseDraftQuantityIntent(sentence);
  if (qtyIntent?.ingredient_phrase && qtyIntent?.quantity) {
    const normalizedLabel = normalizeVisionLabelCandidate(cleanupLabelPhrase(qtyIntent.ingredient_phrase));
    if (normalizedLabel) {
      return { label: normalizedLabel, quantity: qtyIntent.quantity };
    }
  }

  let quantity = 1;
  const qOnly = parseQuantityOnlyIntent(sentence);
  if (qOnly?.quantity) {
    quantity = qOnly.quantity;
  }

  let candidate = String(sentence || "").trim();
  candidate = candidate
    .replace(
      /\s*(?:\uC744|\uB97C|\uC774|\uAC00)?\s*(?:\uCD94\uAC00|\uB123\uC5B4|\uB354\uD574|\uB4F1\uB85D|\uC800\uC7A5)(?:\uD574|\uD574\uC918|\uD574\uC8FC\uC138\uC694)?\s*[.!?~]*$/u,
      ""
    )
    .replace(/\s*(?:\uC774|\uAC00)?\s*(?:\uC788\uC5B4|\uC788\uC5B4\uC694|\uC788\uC2B5\uB2C8\uB2E4|\uC788\uB2E4|\uC788\uACE0|\uC788\uB294\uB370|\uC788\uB2E4\uACE0)\s*[.!?~]*$/u, "")
    .trim();
  if (!candidate) {
    return null;
  }
  candidate = cleanupLabelPhrase(candidate);
  const normalizedLabel = normalizeVisionLabelCandidate(extractVisionLabelFromSpeech(candidate) || candidate);
  if (!normalizedLabel) {
    return null;
  }
  return { label: normalizedLabel, quantity };
}

function parseVisionSpatialAnchorIntent(rawText) {
  let text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }
  text = text.replace(/^(?:\uADF8\uB9AC\uACE0|\uADF8\uB7FC|\uADF8\uB7F0\uB370|\uADFC\uB370)\s*/u, "").trim();
  const relationMatch = text.match(
    /^\s*(.+?)\s*(\uC606|\uC606\uCABD|\uC67C\uCABD|\uC67C\uD3B8|\uC624\uB978\uCABD|\uC624\uB978\uD3B8|\uC704|\uC717\uCABD|\uC544\uB798|\uC544\uB7AB\uCABD|\uBC11|\uBC11\uCABD)(?:\uC5D0|\uC73C\uB85C)?\s*(.*)$/u
  );
  if (!relationMatch) {
    return null;
  }
  const anchorPhrase = stripTrailingSpeechParticles(
    String(relationMatch[1] || "")
      .replace(/^(?:\uADF8|\uC800|\uC774)\s+/u, "")
      .trim()
  );
  const relation = normalizeVoiceSpatialRelation(relationMatch[2]);
  const tail = String(relationMatch[3] || "").trim();
  if (!anchorPhrase) {
    return null;
  }
  return { anchor_phrase: anchorPhrase, relation, tail };
}

function parseVisionAddByAnchorPhraseIntent(rawText) {
  const parsed = parseVisionSpatialAnchorIntent(rawText);
  if (!parsed) {
    return null;
  }
  const labelPayload = parseVoiceVisionLabelAndQuantity(parsed.tail);
  if (!labelPayload?.label) {
    return null;
  }
  return {
    anchor_phrase: parsed.anchor_phrase,
    relation: parsed.relation,
    label: labelPayload.label,
    quantity: labelPayload.quantity
  };
}

function parseVisionAnchorOnlyIntent(rawText) {
  const parsed = parseVisionSpatialAnchorIntent(rawText);
  if (!parsed) {
    return null;
  }
  if (!parsed.tail) {
    return { anchor_phrase: parsed.anchor_phrase, relation: parsed.relation };
  }
  if (parseVoiceVisionLabelAndQuantity(parsed.tail)) {
    return null;
  }
  if (
    isVoiceConnectorOnlyText(parsed.tail) ||
    /^(?:\uCD94\uAC00|\uCD94\uAC00\uD574|\uCD94\uAC00\uD574\uC918|\uCD94\uAC00\uD574\uC8FC\uC138\uC694|\uB123\uC5B4|\uB123\uC5B4\uC918|\uB123\uC5B4\uC8FC\uC138\uC694)$/u.test(
      parsed.tail
    )
  ) {
    return { anchor_phrase: parsed.anchor_phrase, relation: parsed.relation };
  }
  return null;
}

function parseVisionStandaloneAddIntent(rawText) {
  const text = stripLeadingSpeechFiller(rawText);
  if (!text) {
    return null;
  }
  const withQty = text.match(
    /^\s*([\p{L}\p{N}_ -]{1,24}?)\s+([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uAC1C|\uBCD1|\uBD09|\uBD09\uC9C0|\uCE94|\uD1B5|\uD3EC\uAE30|\uC904\uAE30|\uC1A1\uC774|\uC54C|\uCABD|\uB9C8\uB9AC|\uC7A5|\uD329|\uC0C1\uC790|\uB9DD|\uB2E8|\uBB36\uC74C|\uAC1C\uC785|\uC778\uBD84|ea)\s*(?:\uC744|\uB97C|\uC774|\uAC00)?\s*(?:\uCD94\uAC00|\uB123\uC5B4|\uB4F1\uB85D|\uC800\uC7A5)(?:\uD574|\uD574\uC918|\uD574\uC8FC\uC138\uC694)?\s*[.!?~]*$/u
  );
  const withoutQty = text.match(
    /^\s*([\p{L}\p{N}_ -]{1,24}?)\s*(?:\uC744|\uB97C|\uC774|\uAC00)?\s*(?:\uCD94\uAC00|\uB123\uC5B4|\uB4F1\uB85D|\uC800\uC7A5)(?:\uD574|\uD574\uC918|\uD574\uC8FC\uC138\uC694)?\s*[.!?~]*$/u
  );
  const m = withQty || withoutQty;
  if (!m) {
    return null;
  }
  const labelRaw = String(m[1] || "").trim();
  const qtyRaw = withQty ? String(withQty[2] || "").trim() : "";
  const label = normalizeVisionLabelCandidate(stripTrailingSpeechParticles(labelRaw));
  if (!label) {
    return null;
  }
  let quantity = 1;
  if (qtyRaw) {
    const parsed = parseSpokenCountToken(qtyRaw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
      quantity = parsed;
    }
  }
  return { label, quantity };
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
  if (parseVisionOrdinalQuantityIntent(text)) {
    return null;
  }
  if (parseVisionAddAdjacentIntent(text)) {
    return null;
  }
  const m = text.match(/^\s*([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)\s*(.*)$/u);
  if (!m) {
    return null;
  }
  const index = parseSpokenOrdinalIndexToken(m[1]);
  if (!Number.isFinite(index) || index < 1) {
    return null;
  }
  const tail = String(m[2] || "").trim();
  if (!tail) {
    return { index };
  }
  const compact = tail
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
  if (!compact) {
    return { index };
  }
  const allowed = new Set([
    "\uC120\uD0DD",
    "\uC120\uD0DD\uD574",
    "\uC120\uD0DD\uD574\uC918",
    "\uC120\uD0DD\uD574\uC8FC\uC138\uC694",
    "\uC9C0\uC815",
    "\uC9C0\uC815\uD574",
    "\uC218\uC815",
    "\uD3B8\uC9D1",
    "select",
    "target",
    "edit"
  ]);
  if (!allowed.has(compact)) {
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
    const qtyIntent = parseQuantityOnlyIntent(tail) || parseDraftQuantityIntent(tail);
    if (qtyIntent?.quantity) {
      continue;
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

async function undoCaptureDraftLastChange(sourceType = "manual") {
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    throw new Error(t("err_no_capture_session"));
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/draft/undo`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      source_type: String(sourceType || "manual")
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

function insertVisionObjectAfterOrdinal(index, obj) {
  const n = Number.parseInt(index, 10);
  const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache.slice() : [];
  if (!obj || !Number.isFinite(n) || n < 1) {
    visionObjectsCache = arr.concat(obj ? [obj] : []);
    return;
  }
  const insertAt = clamp(n, 0, arr.length);
  visionObjectsCache = [...arr.slice(0, insertAt), obj, ...arr.slice(insertAt)];
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

function buildAdjacentVoiceSpotBbox(referenceObj, nextObj = null) {
  const refBbox = referenceObj?.bbox || null;
  const refX = Number(refBbox?.x);
  const refY = Number(refBbox?.y);
  const refW = Number(refBbox?.w);
  const refH = Number(refBbox?.h);
  if (![refX, refY, refW, refH].every(Number.isFinite)) {
    return { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };
  }

  const refCenter = getVisionObjectCenter(referenceObj) || { x: refX + refW / 2, y: refY + refH / 2 };
  let centerX = refCenter.x + refW * 1.05;
  let centerY = refCenter.y;
  let boxW = clamp(refW, 0.04, 0.2);
  let boxH = clamp(refH, 0.04, 0.2);

  const nxtBbox = nextObj?.bbox || null;
  const nextCenter = getVisionObjectCenter(nextObj);
  if (nextCenter && nxtBbox) {
    const nxtW = clamp(Number(nxtBbox.w || refW), 0.04, 0.2);
    const nxtH = clamp(Number(nxtBbox.h || refH), 0.04, 0.2);
    const sameRow = Math.abs(nextCenter.y - refCenter.y) <= Math.max(refH, nxtH) * 0.9;
    if (sameRow) {
      centerX = (refCenter.x + nextCenter.x) / 2;
      centerY = (refCenter.y + nextCenter.y) / 2;
      boxW = clamp(Math.min(refW, nxtW), 0.04, 0.16);
      boxH = clamp(Math.min(refH, nxtH), 0.04, 0.16);
    }
  }

  const x = clamp(centerX - boxW / 2, 0, 1 - boxW);
  const y = clamp(centerY - boxH / 2, 0, 1 - boxH);
  return {
    x: roundVisionBboxValue(x),
    y: roundVisionBboxValue(y),
    w: roundVisionBboxValue(boxW),
    h: roundVisionBboxValue(boxH)
  };
}

function buildRelativeVoiceSpotBbox(referenceObj, relation = "right") {
  const refBbox = referenceObj?.bbox || null;
  const refX = Number(refBbox?.x);
  const refY = Number(refBbox?.y);
  const refW = Number(refBbox?.w);
  const refH = Number(refBbox?.h);
  if (![refX, refY, refW, refH].every(Number.isFinite)) {
    return { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };
  }

  const center = getVisionObjectCenter(referenceObj) || { x: refX + refW / 2, y: refY + refH / 2 };
  const boxW = clamp(refW, 0.04, 0.2);
  const boxH = clamp(refH, 0.04, 0.2);
  let centerX = center.x + refW * 1.05;
  let centerY = center.y;

  if (relation === "left") {
    centerX = center.x - refW * 1.05;
    centerY = center.y;
  } else if (relation === "above") {
    centerX = center.x;
    centerY = center.y - refH * 1.15;
  } else if (relation === "below") {
    centerX = center.x;
    centerY = center.y + refH * 1.15;
  }

  const x = clamp(centerX - boxW / 2, 0, 1 - boxW);
  const y = clamp(centerY - boxH / 2, 0, 1 - boxH);
  return {
    x: roundVisionBboxValue(x),
    y: roundVisionBboxValue(y),
    w: roundVisionBboxValue(boxW),
    h: roundVisionBboxValue(boxH)
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
    parts.push(`${currentLang === "ko" ? "異붽?" : "Added"}: ${addedText.join(", ")}`);
  }
  if (consumedText.length > 0) {
    parts.push(`${currentLang === "ko" ? "?뚮퉬" : "Consumed"}: ${consumedText.join(", ")}`);
  }
  if (updatedText.length > 0) {
    parts.push(`${currentLang === "ko" ? "?섏젙" : "Updated"}: ${updatedText.join(", ")}`);
  }
  if (notFoundText.length > 0) {
    parts.push(`${currentLang === "ko" ? "?놁쓬" : "Not found"}: ${notFoundText.join(", ")}`);
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
    realtimePrompt: "???대?吏?먯꽌 蹂댁씠???앹옄?щ? 媛꾨떒??留먰빐以?"
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
      realtimePrompt: isAuto ? null : "???대?吏?먯꽌 蹂댁씠???앹옄?щ? 媛꾨떒??留먰빐以?"
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

function requestRealtimeAssistantResponse(options = {}) {
  if (!isRealtimeConnected() || realtimeQuotaBlocked) {
    return false;
  }
  if (realtimeResponseInProgress) {
    return false;
  }
  const force = Boolean(options?.force);
  const minIntervalMs = Number(options?.minIntervalMs);
  const throttleMs = Number.isFinite(minIntervalMs) ? Math.max(0, Math.round(minIntervalMs)) : 700;
  const now = Date.now();
  if (!force && now - Number(realtimeLastResponseCreateAt || 0) < throttleMs) {
    return false;
  }
  try {
    realtimeResponseInProgress = true;
    realtimeSendEvent({ type: "response.create" });
    realtimeLastResponseCreateAt = now;
    return true;
  } catch {
    realtimeResponseInProgress = false;
    return false;
  }
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
      requestRealtimeAssistantResponse({ minIntervalMs: 0 });
    }
  } catch {
    // best-effort only
  }
}

function buildRealtimePoliteInstructions() {
  if (currentLang === "ko") {
    return (
      "?뱀떊? Teddy ?됱옣怨??뚯꽦 鍮꾩꽌?낅땲?? ?ъ슜?먯쓽 紐낅졊留?泥섎━?섏꽭?? " +
      "??긽 ?쒓뎅??議대뙎留먮줈, 吏㏃? ??臾몄옣?쇰줈留??듯븯?몄슂. " +
      "遺덊븘?뷀븳 ?ㅻ챸, 媛먰깂, ?쒖븞, ?〓떞???섏? 留덉꽭?? " +
      "紐⑦샇???뚮쭔 ??臾몄옣?쇰줈 吏㏐쾶 ?섎Ъ?쇱꽭??"
    );
  }
  return (
    "You are Teddy, a fridge command assistant. Follow user commands exactly. " +
    "Reply with exactly one short confirmation sentence. " +
    "No small talk, opinions, or suggestions. Ask one short clarification only when ambiguous."
  );
}

async function fetchRealtimeClientSecret() {
  const result = await request("/api/v1/realtime/token", {
    method: "POST",
    body: JSON.stringify({
      // Keep the token lifetime short. The voice session uses it only for call setup.
      expires_seconds: 600,
      instructions: buildRealtimePoliteInstructions()
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
            instructions: buildRealtimePoliteInstructions(),
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
  clearRealtimePendingSpatialAddContext();
  clearRealtimePendingInventoryText();
  realtimeLastAutoIngestKey = "";
  realtimeLastAutoIngestAt = 0;
  realtimeLastResponseCreateAt = 0;
  realtimeResponseInProgress = false;
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
    requestRealtimeAssistantResponse({ force: true, minIntervalMs: 0 });
  }
}

function setVisionObjectQuantityByIngredientKey(ingredientKey, quantity) {
  const key = String(ingredientKey || "").trim();
  if (!key) {
    return;
  }
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) {
    return;
  }
  (visionObjectsCache || []).forEach((obj) => {
    if (String(obj?.ingredient_key || "").trim() === key) {
      obj.quantity = q;
    }
  });
}

async function applyVoiceDraftQuantityUpdate(item, quantity, heardText) {
  const key = String(item?.ingredient_key || "").trim();
  if (!key) {
    return;
  }
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) {
    return;
  }
  const displayName = ingredientLabel(key, item?.ingredient_name || item?.name || key);
  setRealtimeStatus(tf("voice_heard", { text: heardText }));
  appendRealtimeLogLine("draft(qty)", `${displayName} x${q}`);
  setVisionObjectQuantityByIngredientKey(key, q);
  await replaceCaptureDraftIngredient(key, displayName, q, item?.unit || "ea");
  setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
  appendVoiceAck(t("voice_ack_applied"));
  renderVisionObjectPreview({ skipImageReload: true });
}

function applyVoiceLocalObjectRemoval(ingredientKey, quantity, removeAll = false) {
  const key = String(ingredientKey || "").trim();
  if (!key) {
    return;
  }
  const q = Number(quantity);
  const removeQty = Number.isFinite(q) && q > 0 ? q : 1;
  const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache.slice() : [];
  if (arr.length === 0) {
    return;
  }

  if (removeAll) {
    visionObjectsCache = arr.filter((obj) => String(obj?.ingredient_key || "").trim() !== key);
    if (visionSelectedObjectId && !getVisionObjectById(visionSelectedObjectId)) {
      visionSelectedObjectId = "";
    }
    renderVisionObjectPreview({ skipImageReload: true });
    return;
  }

  let remaining = removeQty;
  for (let i = 0; i < arr.length && remaining > 0; i += 1) {
    const obj = arr[i];
    if (String(obj?.ingredient_key || "").trim() !== key) {
      continue;
    }
    const nowQty = Math.max(1, Number(obj?.quantity || 1));
    if (nowQty <= remaining) {
      arr.splice(i, 1);
      i -= 1;
      remaining -= nowQty;
    } else {
      obj.quantity = nowQty - remaining;
      remaining = 0;
    }
  }
  visionObjectsCache = arr;
  if (visionSelectedObjectId && !getVisionObjectById(visionSelectedObjectId)) {
    visionSelectedObjectId = "";
  }
  renderVisionObjectPreview({ skipImageReload: true });
}

async function applyVoiceDraftRemove(item, quantity, heardText) {
  const key = String(item?.ingredient_key || "").trim();
  if (!key) {
    return;
  }
  const q = Number(quantity);
  const removeQty = Number.isFinite(q) && q > 0 ? q : 1;
  const currentQty = Math.max(0, Number(item?.quantity || 0));
  const removeAll = currentQty > 0 && removeQty >= currentQty;
  const displayName = ingredientLabel(key, item?.ingredient_name || item?.name || key);
  setRealtimeStatus(tf("voice_heard", { text: heardText }));
  appendRealtimeLogLine("draft(remove)", `${displayName} -${removeQty}`);
  await removeCaptureDraftIngredient(key, removeQty, item?.unit || "ea", removeAll);
  applyVoiceLocalObjectRemoval(key, removeQty, removeAll);
  setRealtimeStatus(t(isEasyMode() ? "voice_draft_updated_ready" : "voice_draft_updated"));
  appendVoiceAck(t("voice_ack_applied"));
}

function addVoiceVisionObjectWithLabel(targetObj, nextObj, label, quantity = 1, relation = "right") {
  const bbox =
    relation === "right" ? buildAdjacentVoiceSpotBbox(targetObj, nextObj) : buildRelativeVoiceSpotBbox(targetObj, relation);
  const addedObj = buildCustomVisionObject(bbox);
  const index = getVisionObjectOrdinalById(targetObj?.id || "");
  if (Number.isFinite(index) && index > 0) {
    insertVisionObjectAfterOrdinal(index, addedObj);
  } else {
    const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache.slice() : [];
    visionObjectsCache = arr.concat([addedObj]);
  }
  addedObj.quantity = Number(quantity) > 0 ? Number(quantity) : 1;
  visionSelectedObjectId = addedObj.id;
  setVisionEditMode("select");
  renderVisionObjectPreview({ skipImageReload: true });
  closeVisionInlineEditor();
  setVisionRelabelTarget(addedObj.id, { select: false, announce: false });
  return addedObj;
}

function resolveVisionAnchorObject(anchorPhrase) {
  const phrase = String(anchorPhrase || "").trim();
  if (!phrase) {
    return null;
  }
  const ordinalMatch = phrase.match(/([0-9A-Za-z\uAC00-\uD7A3]{1,12})\s*(?:\uBC88(?:\s*\uD56D\uBAA9)?|\uBC88\uC9F8)/u);
  if (ordinalMatch?.[1]) {
    const idx = parseSpokenOrdinalIndexToken(ordinalMatch[1]);
    if (Number.isFinite(idx) && idx > 0) {
      const byOrdinal = getVisionObjectByOrdinal(idx);
      if (byOrdinal?.id) {
        return byOrdinal;
      }
    }
  }
  return findVisionObjectByVoicePhrase(phrase);
}

function queueVoiceSpatialAdd(anchorPhrase, relation, label, quantity, heardText) {
  const targetObj = resolveVisionAnchorObject(anchorPhrase);
  if (!targetObj?.id) {
    const msg = `target spot for "${anchorPhrase}" not found`;
    appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
    setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
    return false;
  }

  const anchorOrdinal = getVisionObjectOrdinalById(targetObj.id);
  const nextObj = relation === "right" && Number.isFinite(anchorOrdinal) ? getVisionObjectByOrdinal(anchorOrdinal + 1) : null;
  const addedObj = addVoiceVisionObjectWithLabel(targetObj, nextObj, label, quantity, relation);
  setRealtimeStatus(tf("voice_heard", { text: heardText }));
  appendRealtimeLogLine("label_add", `${anchorPhrase} ${relation}: ${label} x${quantity}`);
  realtimeIngestChain = realtimeIngestChain
    .then(() =>
      replaceVisionObjectLabel(addedObj.id, label, {
        quantity: quantity || 1,
        unit: "ea"
      })
    )
    .then(() => {
      realtimeLastVisionRelabelAt = Date.now();
      realtimeLastVisionTargetObjectId = addedObj.id;
      realtimeLastVisionTargetAt = Date.now();
      setRealtimeStatus(t("voice_draft_updated"));
      appendVoiceAck(t("voice_ack_applied"));
    })
    .catch((err) => {
      const msg = err?.message || "unknown error";
      visionObjectsCache = (visionObjectsCache || []).filter((o) => String(o?.id || "") !== String(addedObj.id || ""));
      if (visionSelectedObjectId === addedObj.id) {
        visionSelectedObjectId = "";
      }
      renderVisionObjectPreview({ skipImageReload: true });
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setGlobalError(msg);
      setCaptureError(msg);
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
    });
  return true;
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

  if (isUndoSpeech(text)) {
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("undo", text);
    realtimeIngestChain = realtimeIngestChain
      .then(async () => {
        const result = await undoCaptureDraftLastChange(sourceType);
        const remaining = Number(result?.data?.undone?.remaining_history_count || 0);
        const ack = t("voice_ack_undone");
        appendRealtimeLogLine("system", remaining > 0 ? `${ack} (${remaining})` : ack);
        setRealtimeStatus(ack);
        appendVoiceAck(ack);
        draftVoiceEditTarget = null;
        visionRelabelTargetId = "";
        clearRealtimePendingSpatialAddContext();
        closeVisionInlineEditor();
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        if (/no draft history to undo/i.test(msg)) {
          const emptyMsg = t("voice_undo_empty");
          appendRealtimeLogLine("system", emptyMsg);
          setRealtimeStatus(emptyMsg);
          appendVoiceAck(emptyMsg);
          return;
        }
        appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
        setGlobalError(msg);
        setCaptureError(msg);
        setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      });
    return;
  }

  if (draftVoiceEditTarget) {
    const target = draftVoiceEditTarget;
    draftVoiceEditTarget = null;
    const key = String(target?.ingredient_key || "").trim();
    if (!key) {
      return;
    }

    const normalized = text.toLowerCase();
    const deleteIntent =
      /\b(remove|delete)\b/i.test(normalized) || /??젣|吏??鍮??쒓굅|?놁븷|踰꾨젮/.test(normalized);

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

  const removeIntent = parseDraftRemoveIntent(text);
  if (removeIntent?.ingredient_phrase) {
    const targetItem =
      findDraftItemByVoicePhrase(removeIntent.ingredient_phrase) ||
      findVisionObjectByVoicePhrase(removeIntent.ingredient_phrase);
    const recentTargetAge = Date.now() - Number(realtimeLastVisionTargetAt || 0);
    const recentTarget =
      realtimeLastVisionTargetObjectId && recentTargetAge >= 0 && recentTargetAge <= 30000
        ? getVisionObjectById(realtimeLastVisionTargetObjectId)
        : null;
    const chosenTarget = targetItem?.ingredient_key
      ? targetItem
      : /^(?:\uC774\uAC70|\uADF8\uAC70|\uC800\uAC70|\uC774\uAC8C|\uADF8\uAC8C|\uC800\uAC8C)$/u.test(
            String(removeIntent.ingredient_phrase || "").trim()
          )
        ? recentTarget
        : null;
    if (chosenTarget?.ingredient_key) {
      realtimeIngestChain = realtimeIngestChain
        .then(() => applyVoiceDraftRemove(chosenTarget, removeIntent.quantity || 1, text))
        .catch((err) => {
          const msg = err?.message || "unknown error";
          appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
          setGlobalError(msg);
          setCaptureError(msg);
          setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
        });
      return;
    }
    appendRealtimeLogLine("label_ignored", text);
    setRealtimeStatus(t("voice_draft_edit_hint"));
    appendVoiceAck(t("voice_draft_edit_hint"));
    return;
  }

  if (realtimePendingSpatialAddContext && now - Number(realtimePendingSpatialAddAt || 0) > 30000) {
    clearRealtimePendingSpatialAddContext();
  }

  const addByAnchorPhrase = parseVisionAddByAnchorPhraseIntent(text);
  if (addByAnchorPhrase) {
    clearRealtimePendingSpatialAddContext();
    if (queueVoiceSpatialAdd(
      addByAnchorPhrase.anchor_phrase,
      addByAnchorPhrase.relation,
      addByAnchorPhrase.label,
      addByAnchorPhrase.quantity || 1,
      text
    )) {
      return;
    }
  }

  const anchorOnly = parseVisionAnchorOnlyIntent(text);
  if (anchorOnly) {
    realtimePendingSpatialAddContext = {
      anchor_phrase: anchorOnly.anchor_phrase,
      relation: anchorOnly.relation
    };
    realtimePendingSpatialAddAt = now;
    appendRealtimeLogLine("label_target", `${anchorOnly.anchor_phrase} ${anchorOnly.relation}`);
    setRealtimeStatus(t("voice_draft_edit_hint"));
    appendVoiceAck(t("voice_draft_edit_hint"));
    return;
  }

  if (realtimePendingSpatialAddContext) {
    const pendingLabel = parseVoiceVisionLabelAndQuantity(text);
    if (pendingLabel?.label) {
      const ctx = realtimePendingSpatialAddContext;
      clearRealtimePendingSpatialAddContext();
      if (queueVoiceSpatialAdd(ctx.anchor_phrase, ctx.relation, pendingLabel.label, pendingLabel.quantity || 1, text)) {
        return;
      }
    } else if (/(?:\uCD94\uAC00|\uB123\uC5B4|\uB4F1\uB85D|\uC800\uC7A5)/u.test(text)) {
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
    }
  }

  const draftQtyByPhrase = parseDraftQuantityIntent(text);
  const hasExplicitAddVerb = /(?:\uCD94\uAC00|\uB123\uC5B4|\uB4F1\uB85D|\uC800\uC7A5)/u.test(text);
  if (!hasExplicitAddVerb && draftQtyByPhrase?.quantity && draftQtyByPhrase?.ingredient_phrase) {
    const draftTarget =
      findDraftItemByVoicePhrase(draftQtyByPhrase.ingredient_phrase) ||
      findVisionObjectByVoicePhrase(draftQtyByPhrase.ingredient_phrase);
    if (draftTarget?.ingredient_key) {
      realtimeIngestChain = realtimeIngestChain
        .then(() => applyVoiceDraftQuantityUpdate(draftTarget, draftQtyByPhrase.quantity, text))
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

  const standaloneAdd = parseVisionStandaloneAddIntent(text);
  if (standaloneAdd) {
    const arr = Array.isArray(visionObjectsCache) ? visionObjectsCache : [];
    const targetObj =
      getVisionObjectById(visionSelectedObjectId) ||
      (realtimeLastVisionTargetObjectId ? getVisionObjectById(realtimeLastVisionTargetObjectId) : null) ||
      (arr.length > 0 ? arr[arr.length - 1] : null);

    let addedObj = null;
    if (targetObj?.id) {
      const nextObj = getVisionObjectByOrdinal(getVisionObjectOrdinalById(targetObj.id) + 1);
      addedObj = addVoiceVisionObjectWithLabel(targetObj, nextObj, standaloneAdd.label, standaloneAdd.quantity, "right");
    } else {
      addedObj = buildCustomVisionObject({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 });
      addedObj.quantity = standaloneAdd.quantity || 1;
      const current = Array.isArray(visionObjectsCache) ? visionObjectsCache.slice() : [];
      visionObjectsCache = current.concat([addedObj]);
      visionSelectedObjectId = addedObj.id;
      setVisionEditMode("select");
      renderVisionObjectPreview({ skipImageReload: true });
      setVisionRelabelTarget(addedObj.id, { select: false, announce: false });
    }

    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("label_add", `${standaloneAdd.label} x${standaloneAdd.quantity}`);
    realtimeIngestChain = realtimeIngestChain
      .then(() =>
        replaceVisionObjectLabel(addedObj.id, standaloneAdd.label, {
          quantity: standaloneAdd.quantity || 1,
          unit: "ea"
        })
      )
      .then(() => {
        realtimeLastVisionRelabelAt = Date.now();
        realtimeLastVisionTargetObjectId = addedObj.id;
        realtimeLastVisionTargetAt = Date.now();
        setRealtimeStatus(t("voice_draft_updated"));
        appendVoiceAck(t("voice_ack_applied"));
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        visionObjectsCache = (visionObjectsCache || []).filter((o) => String(o?.id || "") !== String(addedObj.id || ""));
        if (visionSelectedObjectId === addedObj.id) {
          visionSelectedObjectId = "";
        }
        renderVisionObjectPreview({ skipImageReload: true });
        appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
        setGlobalError(msg);
        setCaptureError(msg);
        setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      });
    return;
  }

  const adjacentAdd = parseVisionAddAdjacentIntent(text);
  if (adjacentAdd) {
    const targetObj = getVisionObjectByOrdinal(adjacentAdd.index);
    if (!targetObj?.id) {
      const msg = `target spot #${adjacentAdd.index} not found`;
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      return;
    }
    const nextObj = getVisionObjectByOrdinal(adjacentAdd.index + 1);
    const addedObj = addVoiceVisionObjectWithLabel(targetObj, nextObj, adjacentAdd.label, 1, "right");
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("label_add", `${adjacentAdd.index}: ${adjacentAdd.label}`);

    realtimeIngestChain = realtimeIngestChain
      .then(() => replaceVisionObjectLabel(addedObj.id, adjacentAdd.label, { quantity: 1, unit: "ea" }))
      .then(() => {
        realtimeLastVisionRelabelAt = Date.now();
        realtimeLastVisionTargetObjectId = addedObj.id;
        realtimeLastVisionTargetAt = Date.now();
        setRealtimeStatus(t("voice_draft_updated"));
        appendVoiceAck(t("voice_ack_applied"));
      })
      .catch((err) => {
        const msg = err?.message || "unknown error";
        visionObjectsCache = (visionObjectsCache || []).filter((o) => String(o?.id || "") !== String(addedObj.id || ""));
        if (visionSelectedObjectId === addedObj.id) {
          visionSelectedObjectId = "";
        }
        renderVisionObjectPreview({ skipImageReload: true });
        appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
        setGlobalError(msg);
        setCaptureError(msg);
        setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      });
    return;
  }

  const ordinalQty = parseVisionOrdinalQuantityIntent(text);
  if (ordinalQty?.quantity) {
    const targetObj = getVisionObjectByOrdinal(ordinalQty.index);
    if (!targetObj?.id) {
      const msg = `target spot #${ordinalQty.index} not found`;
      appendRealtimeLogLine("system", tf("voice_draft_update_failed", { msg }));
      setRealtimeStatus(tf("voice_draft_update_failed", { msg }));
      return;
    }
    const key = String(targetObj?.ingredient_key || "").trim();
    if (!key) {
      appendRealtimeLogLine("label_ignored", text);
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
    }
    const displayName = ingredientLabel(key, targetObj?.ingredient_name || targetObj?.name || key);
    setRealtimeStatus(tf("voice_heard", { text }));
    appendRealtimeLogLine("draft(qty)", `${displayName} x${ordinalQty.quantity}`);
    targetObj.quantity = ordinalQty.quantity;
    setVisionRelabelTarget(targetObj.id, { select: true, announce: false });
    realtimeIngestChain = realtimeIngestChain
      .then(() => replaceCaptureDraftIngredient(key, displayName, ordinalQty.quantity, targetObj?.unit || "ea"))
      .then(() => {
        realtimeLastVisionRelabelAt = Date.now();
        realtimeLastVisionTargetObjectId = targetObj.id;
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

    if (isAffirmationOnlySpeech(text)) {
      appendRealtimeLogLine("confirm", text);
      setRealtimeStatus(t("voice_ready"));
      appendVoiceAck(t("voice_ack_confirmed"));
      return;
    }
    if (isVoiceConnectorOnlyText(text)) {
      appendRealtimeLogLine("label_ignored", text);
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
    }

    const targetedQty = parseDraftQuantityIntent(text);
    if (targetedQty?.quantity) {
      const obj = getVisionObjectById(targetId);
      const key = String(obj?.ingredient_key || "").trim();
      if (key && isVoicePhraseMatchForVisionObject(targetedQty.ingredient_phrase, obj)) {
        obj.quantity = targetedQty.quantity;
        realtimeLastVisionTargetObjectId = targetId;
        realtimeLastVisionTargetAt = Date.now();
        realtimeIngestChain = realtimeIngestChain
          .then(() => applyVoiceDraftQuantityUpdate(obj, targetedQty.quantity, text))
          .then(() => {
            realtimeLastVisionRelabelAt = Date.now();
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
      const mentionedItem = findDraftItemByVoicePhrase(targetedQty.ingredient_phrase);
      if (mentionedItem?.ingredient_key) {
        realtimeIngestChain = realtimeIngestChain
          .then(() => applyVoiceDraftQuantityUpdate(mentionedItem, targetedQty.quantity, text))
          .then(() => {
            realtimeLastVisionTargetAt = Date.now();
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

      appendRealtimeLogLine("label_ignored", text);
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
    }

    const qtyOnly = parseQuantityOnlyIntent(text);
    if (qtyOnly?.quantity) {
      const obj = getVisionObjectById(targetId);
      const key = String(obj?.ingredient_key || "").trim();
      if (key) {
        obj.quantity = qtyOnly.quantity;
        realtimeLastVisionTargetObjectId = targetId;
        realtimeLastVisionTargetAt = Date.now();
        realtimeIngestChain = realtimeIngestChain
          .then(() => applyVoiceDraftQuantityUpdate(obj, qtyOnly.quantity, text))
          .then(() => {
            realtimeLastVisionRelabelAt = Date.now();
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

    const looksLikeQuantitySpeech =
      /(?:\uAC1C|\uBCD1|\uBD09|\uCE94|\uD1B5|ea)/u.test(text) ||
      /(?:\uAC1C\uC218|\uC218\uB7C9)/u.test(text);
    if (looksLikeQuantitySpeech) {
      appendRealtimeLogLine("label_ignored", text);
      setRealtimeStatus(t("voice_draft_edit_hint"));
      appendVoiceAck(t("voice_draft_edit_hint"));
      return;
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
  const qtyOnlyWithRecentTarget = draftQtyByPhrase?.quantity ? null : parseQuantityOnlyIntent(text);
  if (recentTargetId && qtyOnlyWithRecentTarget?.quantity) {
    const obj = getVisionObjectById(recentTargetId);
    const key = String(obj?.ingredient_key || "").trim();
    if (key) {
      realtimeIngestChain = realtimeIngestChain
        .then(() => applyVoiceDraftQuantityUpdate(obj, qtyOnlyWithRecentTarget.quantity, text))
        .then(() => {
          realtimeLastVisionTargetAt = Date.now();
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

  const draftQuantityIntent = draftQtyByPhrase || parseDraftQuantityIntent(text);
  if (draftQuantityIntent?.quantity) {
    const targetItem = findDraftItemByVoicePhrase(draftQuantityIntent.ingredient_phrase);
    if (targetItem?.ingredient_key) {
      realtimeIngestChain = realtimeIngestChain
        .then(() => applyVoiceDraftQuantityUpdate(targetItem, draftQuantityIntent.quantity, text))
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

  if (type === "response.created") {
    realtimeResponseInProgress = true;
    return;
  }
  if (
    type === "response.done" ||
    type === "response.failed" ||
    type === "response.canceled" ||
    type === "response.cancelled"
  ) {
    realtimeResponseInProgress = false;
    return;
  }

  if (type === "error") {
    const msg = evt?.error?.message || evt?.message || "Unknown realtime error.";
    if (/active response in progress/i.test(String(msg || ""))) {
      realtimeResponseInProgress = true;
    }
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
      const commandLikeSpeech =
        Boolean(parseVisionAddAdjacentIntent(finalText)) ||
        Boolean(parseVisionAddByAnchorPhraseIntent(finalText)) ||
        Boolean(parseVisionAnchorOnlyIntent(finalText)) ||
        Boolean(realtimePendingSpatialAddContext && parseVoiceVisionLabelAndQuantity(finalText)) ||
        Boolean(parseVisionStandaloneAddIntent(finalText)) ||
        Boolean(parseDraftRemoveIntent(finalText)) ||
        Boolean(parseVisionOrdinalQuantityIntent(finalText)) ||
        Boolean(parseVisionOrdinalRelabelIntent(finalText)) ||
        Boolean(parseVisionOrdinalTargetOnlyIntent(finalText)) ||
        Boolean(parseDraftQuantityIntent(finalText));
      const skipSpeechResponse =
        isAffirmationOnlySpeech(finalText) ||
        isUndoSpeech(finalText) ||
        isVoiceConnectorOnlyText(finalText) ||
        (isEasyMode() && !getCaptureSessionId() && isLikelyFragmentaryInventoryText(finalText));
      if (!skipSpeechResponse) {
        requestRealtimeAssistantResponse({ minIntervalMs: commandLikeSpeech ? 120 : 700 });
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
  const placeholderKo = "????ぉ";
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

function parseEditableQuantity(value) {
  if (typeof value === "string" && String(value).trim() === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  if (!Number.isInteger(n)) {
    return null;
  }
  return n;
}

function confirmDeleteByMinusSingle() {
  const msg =
    currentLang === "ko"
      ? "?섎웾??1?대씪 ????ぉ????젣?⑸땲?? ??젣?섏떆寃좎뒿?덇퉴?"
      : "Quantity is 1, so this item will be removed. Remove it?";
  return confirm(msg);
}

function confirmDeleteByMinusBulk(removeCount) {
  const count = Math.max(1, Number(removeCount || 0));
  const msg =
    currentLang === "ko"
      ? `?좏깮????ぉ 以?${count}媛쒓? ??젣?⑸땲?? 怨꾩냽?섏떆寃좎뒿?덇퉴?`
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

  const qtyInputEl = node.querySelector(".qty-input");
  if (qtyInputEl) {
    qtyInputEl.value = formatQuantityValue(item.quantity);
  }

  const syncQtyInputToCurrent = () => {
    if (!qtyInputEl) {
      return;
    }
    qtyInputEl.value = formatQuantityValue(item?.quantity || 0);
  };

  const minusBtn = node.querySelector(".qty-minus-btn");
  const plusBtn = node.querySelector(".qty-plus-btn");
  const setAdjustDisabled = (disabled) => {
    if (minusBtn) minusBtn.disabled = disabled;
    if (plusBtn) plusBtn.disabled = disabled;
    if (qtyInputEl) qtyInputEl.disabled = disabled;
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

  const applyItemTargetQuantity = async (nextQuantity) => {
    const qtyNow = Math.round(Number(item?.quantity || 0) * 100) / 100;
    const targetQty = parseEditableQuantity(nextQuantity);
    if (targetQty === null) {
      syncQtyInputToCurrent();
      return;
    }
    const delta = Math.round((targetQty - qtyNow) * 100) / 100;
    if (Math.abs(delta) < 0.000001) {
      syncQtyInputToCurrent();
      return;
    }
    if (delta < 0 && qtyNow > 0 && targetQty <= 0) {
      if (!confirmDeleteByMinusSingle()) {
        syncQtyInputToCurrent();
        return;
      }
    }
    await applyItemDelta(delta);
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

  if (qtyInputEl) {
    const commitQuantityInput = async () => {
      if (qtyInputEl.dataset.committing === "1") {
        return;
      }
      qtyInputEl.dataset.committing = "1";
      try {
        await applyItemTargetQuantity(qtyInputEl.value);
      } finally {
        delete qtyInputEl.dataset.committing;
      }
    };

    qtyInputEl.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await commitQuantityInput();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        syncQtyInputToCurrent();
        qtyInputEl.blur();
      }
    });

    qtyInputEl.addEventListener("blur", () => {
      void commitQuantityInput();
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
      youtube: "?좏뒠釉?,
      naver_blog: "?ㅼ씠踰?釉붾줈洹?,
      naver_web: "?ㅼ씠踰???,
      google: "援ш?",
      recipe_site: "?덉떆???ъ씠??,
      seed: "湲곕낯 ?덉떆??,
      other: "湲고?"
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
  "?덉떆??,
  "?붾━",
  "留뚮뱾湲?,
  "留뚮뱶?붾쾿",
  "留뚮뱶??,
  "珥덇컙??,
  "媛꾨떒",
  "?ъ슫",
  "?덉에",
  "?먯랬",
  "釉뚯씠濡쒓렇"
]);

const RECIPE_DISH_STYLE_PATTERNS = [
  { key: "??갈", patterns: [/??갈/u, /\bdonburi\b/i, /\brice bowl\b/i] },
  { key: "李?, patterns: [/李?u, /\bsteam(?:ed)?\b/i, /\bsteamed\b/i] },
  { key: "蹂띠쓬", patterns: [/蹂띠쓬/u, /\b蹂?b/u, /\bstir[\s-]?fry\b/i] },
  { key: "議곕┝", patterns: [/議곕┝/u, /\bbraise(?:d)?\b/i, /\bsimmer(?:ed)?\b/i] },
  { key: "援ъ씠", patterns: [/援ъ씠/u, /\bgrill(?:ed)?\b/i, /\broast(?:ed)?\b/i] },
  { key: "李뚭컻", patterns: [/李뚭컻/u, /\bstew\b/i] },
  { key: "援?, patterns: [/(^|[^媛-??)援?$|[^媛-??)/u, /\bsoup\b/i] },
  { key: "??, patterns: [/??u] },
  { key: "??, patterns: [/(^|[^媛-??)??$|[^媛-??)/u, /\bpancake\b/i, /\bfritter\b/i] },
  { key: "臾댁묠", patterns: [/臾댁묠/u] },
  { key: "?먮윭??, patterns: [/?먮윭??u, /\bsalad\b/i] },
  { key: "蹂띠쓬諛?, patterns: [/蹂띠쓬諛?u, /\bfried rice\b/i] },
  { key: "?뚯뒪?", patterns: [/?뚯뒪?/u, /\bpasta\b/i] },
  { key: "?쇰㈃", patterns: [/?쇰㈃/u, /\bramen\b/i, /\bnoodle\b/i] },
  { key: "移대젅", patterns: [/移대젅/u, /\bcurry\b/i] },
  { key: "源諛?, patterns: [/源諛?u, /\bgimbap\b/i, /\bkimbap\b/i] }
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
  return currentLang === "ko" ? `${score}?? : `${score}`;
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

function normalizeNotificationDayOffsets(value, fallback = [3], min = 0, max = 60) {
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
    return [normalized[0]];
  }
  const fb = Array.isArray(fallback) ? fallback : [3];
  for (const raw of fb) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      continue;
    }
    const day = Math.round(n);
    if (day >= Number(min) && day <= Number(max)) {
      return [day];
    }
  }
  return [3];
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
  const arr = normalizeNotificationDayOffsets(dayOffsets, [3], notificationDayBounds.min, notificationDayBounds.max);
  return arr.map((d) => formatNotificationDayToken(d)).join(", ");
}

function getActiveNotificationDay() {
  const arr = normalizeNotificationDayOffsets(notificationDayOffsets, [3], notificationDayBounds.min, notificationDayBounds.max);
  return arr[0];
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

  const day = getActiveNotificationDay();
  root.innerHTML = "";

  const chip = document.createElement("div");
  chip.className = "notification-day-chip";
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "btn tiny ghost active";
  badge.textContent = formatNotificationDayToken(day);
  chip.appendChild(badge);
  root.appendChild(chip);

  const input = $("notificationLeadInput");
  if (input) {
    input.min = String(notificationDayBounds.min);
    input.max = String(notificationDayBounds.max);
    input.value = String(day);
  }

  setNotificationPrefsMeta(tf("notifications_pref_current", { days: formatNotificationDaysList([day]) }));
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

  notificationDayOffsets = [n];
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
    [3],
    notificationDayBounds.min,
    notificationDayBounds.max
  );
  renderNotificationLeadButtons();
}

async function saveNotificationPreferences() {
  const day = getActiveNotificationDay();
  const userId = getUserId();
  const result = await request("/api/v1/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      day_offset: day,
      day_offsets: [day],
      custom_day_presets: [],
      apply_to_existing: true
    })
  });

  const data = result?.data || {};
  notificationDayOffsets = normalizeNotificationDayOffsets(
    data?.day_offsets,
    [day],
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
    quantity: Math.max(1, Math.round(parseNumberOrNull(formData.get("quantity")) || 1)),
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
  if ($("undoCaptureBtn")) {
    $("undoCaptureBtn").addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await undoCaptureDraftLastChange("manual");
        setCaptureError("");
      } catch (err) {
        const msg = err?.message || String(err);
        if (/no draft history to undo/i.test(msg)) {
          setRealtimeStatus(t("voice_undo_empty"));
          return;
        }
        setCaptureError(msg);
        setGlobalError(msg);
      }
    });
  }
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

  bindMobileHomeActions();
  bindAppBottomNav();
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
  const hashScreen = parseAppScreenFromHash();
  const storedScreen = normalizeAppScreenName(localStorage.getItem(APP_SCREEN_STORAGE_KEY) || "home");
  const initialScreen = hashScreen || (isEasyMode() ? "home" : storedScreen);
  if (isEasyMode() && !hashScreen) {
    localStorage.setItem(APP_SCREEN_STORAGE_KEY, "home");
  }
  setAppScreen(initialScreen, {
    updateHash: true,
    replaceHash: true,
    animate: false,
    force: true
  });
  refreshAll();
}

window.addEventListener("DOMContentLoaded", init);

