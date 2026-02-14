const $ = (id) => document.getElementById(id);
let currentCaptureSessionId = "";
let liveCameraStream = null;
let liveCameraTimer = null;
let liveCameraInFlight = false;

const API_BASE_STORAGE_KEY = "teddy_api_base";

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

function getUserId() {
  return $("userId").value.trim() || "demo-user";
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
  span.textContent = status;
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

  const name = document.createElement("strong");
  name.className = "name";
  name.textContent = item.phrase || "(unknown phrase)";
  main.appendChild(name);

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `reason: ${item.reason || "unknown"} | seen: ${item.seen_count ?? 1}`;
  main.appendChild(meta);

  const candidateOptions = Array.isArray(item.candidate_options) ? item.candidate_options : [];
  if (candidateOptions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "review-actions";
    candidateOptions.slice(0, 4).forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn tiny secondary";
      const score = Number(option.score || 0);
      btn.textContent = `Map: ${option.ingredient_name} (${Math.round(score * 100)}%)`;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await resolveReviewQueueItem(item.id, {
            action: "map",
            ingredient_key: option.ingredient_key,
            display_name: option.ingredient_name
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
  keyInput.placeholder = "ingredient_key";
  if (candidateOptions.length > 0 && candidateOptions[0]?.ingredient_key) {
    keyInput.value = candidateOptions[0].ingredient_key;
  }

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "display name (optional)";

  const mapBtn = document.createElement("button");
  mapBtn.type = "button";
  mapBtn.className = "btn tiny";
  mapBtn.textContent = "Map Custom";
  mapBtn.addEventListener("click", async () => {
    const ingredientKey = keyInput.value.trim();
    if (!ingredientKey) {
      setGlobalError("ingredient_key is required to map this phrase.");
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
  ignoreBtn.textContent = "Ignore";
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
    meta.textContent = "No active capture session.";
    list.appendChild(emptyNode("Start a capture session."));
    renderReviewQueueList("captureReviewList", [], "No pending confirmations in this session.");
    return;
  }

  const session = capture.session;
  const summary = capture.summary || {};
  meta.textContent = `Session ${session.id} | status ${session.status} | items ${summary.item_count ?? 0} | total qty ${summary.total_quantity ?? 0}`;

  const items = session.draft_items || [];
  if (items.length === 0) {
    list.appendChild(emptyNode("Draft is empty."));
  } else {
    items.forEach((item) => {
      const node = document.createElement("div");
      node.className = "item";
      node.innerHTML = `
        <div class="item-main">
          <strong class="name">${item.ingredient_name}</strong>
          <span class="meta">${item.quantity} ${item.unit} | key ${item.ingredient_key}</span>
        </div>
        <div class="item-side">
          <span class="badge fresh">draft</span>
        </div>
      `;
      list.appendChild(node);
    });
  }

  const reviewQueueItems = capture.review_queue_items || [];
  renderReviewQueueList(
    "captureReviewList",
    reviewQueueItems,
    "No pending confirmations in this session."
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
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, status: "pending", limit: 80 });
  const result = await request(`/api/v1/ingredients/review-queue?${q}`, { method: "GET" });
  renderReviewQueueList("reviewQueueList", result?.data?.items || [], "No pending review items.");
}

async function sendCaptureMessage() {
  let sessionId = getCaptureSessionId();
  if (!sessionId) {
    await startCaptureSession();
    sessionId = getCaptureSessionId();
  }

  const text = ($("captureMessageInput")?.value || "").trim();
  const visionItems = parseCsvItems(($("captureVisionItemsInput")?.value || "").trim());

  if (!text && visionItems.length === 0) {
    throw new Error("Type a message or provide vision items.");
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({
      source_type: "text",
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
    setCaptureError(`No confirmed ingredient yet. ${reviewQueueCount} phrase(s) need confirmation below.`);
  } else if (parsedCommandCount === 0) {
    setCaptureError("No ingredient was detected from this message. Add names explicitly or use Vision Items.");
  } else if (reviewQueueCount > 0) {
    setCaptureError(`${reviewQueueCount} phrase(s) still need confirmation below.`);
  } else {
    setCaptureError("");
  }
  $("captureMessageInput").value = "";
  $("captureVisionItemsInput").value = "";
}

function getSegmentationMode() {
  return ($("captureSegmentationMode")?.value || "auto").trim().toLowerCase();
}

async function analyzeVisionDataUrl(imageDataUrl, options = {}) {
  const { textHint = null, segmentationMode = null, refreshMode = "light" } = options || {};
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

  const reviewQueueCount = result?.data?.review_queue_count ?? 0;
  if (detectedItems.length === 0) {
    setCaptureError(result?.data?.message || "No ingredients were detected from this image.");
  } else if (reviewQueueCount > 0) {
    setCaptureError(`${reviewQueueCount} phrase(s) need confirmation below.`);
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

async function analyzeVisionImage() {
  const imageInput = $("captureVisionImageInput");
  const imageFile = imageInput?.files?.[0];
  if (!imageFile) {
    throw new Error("Select an image to analyze.");
  }

  const imageDataUrl = await readFileAsDataUrl(imageFile);
  await analyzeVisionDataUrl(imageDataUrl, { refreshMode: "light" });
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
    await analyzeVisionDataUrl(dataUrl, { refreshMode: "light" });
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

async function finalizeCaptureSession() {
  const sessionId = getCaptureSessionId();
  if (!sessionId) {
    throw new Error("No capture session to finalize.");
  }

  const result = await request(`/api/v1/capture/sessions/${sessionId}/finalize`, {
    method: "POST",
    body: JSON.stringify({
      user_id: getUserId(),
      purchased_at: todayIso(),
      storage_type: "refrigerated"
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

function buildInventoryNode(item) {
  const tpl = $("inventoryItemTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".name").textContent = item.ingredient_name;
  node.querySelector(".meta").textContent = `${item.quantity} ${item.unit} | exp ${item.suggested_expiration_date} | D${item.days_remaining}`;

  const badgeHost = node.querySelector(".badge");
  badgeHost.replaceWith(statusBadge(item.status));

  const btn = node.querySelector(".consume-btn");
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
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId });
  const result = await request(`/api/v1/inventory/items?${q}`, { method: "GET" });
  const list = $("inventoryList");
  list.innerHTML = "";
  const items = result.data.items || [];

  if (items.length === 0) {
    list.appendChild(emptyNode("No inventory items yet."));
    return;
  }

  items.forEach((item) => list.appendChild(buildInventoryNode(item)));
}

function renderRecipeList(items) {
  const list = $("recipeList");
  list.innerHTML = "";

  if (!items.length) {
    list.appendChild(emptyNode("No recipe recommendations yet."));
    return;
  }

  items.forEach((r) => {
    const node = document.createElement("div");
    node.className = "item";
    const missing = (r.missing_ingredient_keys || []).join(", ");
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${r.recipe_name}</strong>
        <span class="meta">${r.chef} | score ${r.score} | match ${(r.match_ratio * 100).toFixed(0)}%</span>
        <span class="meta">missing: ${missing || "none"}</span>
      </div>
      <div class="item-side"></div>
    `;
    node.querySelector(".item-side").appendChild(statusBadge(r.can_make_now ? "fresh" : "expiring_soon"));
    list.appendChild(node);
  });
}

async function loadRecipes() {
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8 });
  const result = await request(`/api/v1/recommendations/recipes?${q}`, { method: "GET" });
  renderRecipeList(result.data.items || []);
}

function renderShopping(items) {
  const list = $("shoppingList");
  list.innerHTML = "";
  if (!items.length) {
    list.appendChild(emptyNode("No shopping suggestions."));
    return;
  }

  items.forEach((s) => {
    const node = document.createElement("div");
    node.className = "item";
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${s.ingredient_key}</strong>
        <span class="meta">reasons: ${(s.reasons || []).join(", ")}</span>
        <span class="meta">related recipes: ${(s.related_recipe_ids || []).join(", ") || "n/a"}</span>
      </div>
      <div class="item-side">
        <span class="badge fresh">P${s.priority}</span>
      </div>
    `;
    list.appendChild(node);
  });
}

async function loadShopping() {
  const userId = getUserId();
  const q = encodeQuery({ user_id: userId, top_n: 8, top_recipe_count: 3 });
  const result = await request(`/api/v1/shopping/suggestions?${q}`, { method: "GET" });
  renderShopping(result.data.items || []);
}

function renderNotifications(items) {
  const list = $("notificationList");
  list.innerHTML = "";
  if (!items.length) {
    list.appendChild(emptyNode("No notifications."));
    return;
  }

  items.forEach((n) => {
    const node = document.createElement("div");
    node.className = "item";
    node.innerHTML = `
      <div class="item-main">
        <strong class="name">${n.notify_type}</strong>
        <span class="meta">item: ${n.inventory_item_id}</span>
        <span class="meta">scheduled: ${n.scheduled_at}</span>
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

  $("runDueResult").textContent = `Sent ${result.data.sent_count} notification(s) at ${result.data.as_of_datetime}`;
}

async function reloadIngredientCatalog() {
  const result = await request("/api/v1/admin/reload-ingredient-catalog", {
    method: "POST",
    body: JSON.stringify({})
  });

  const count = result?.data?.reloaded_count ?? 0;
  const reloadedAt = result?.data?.reloaded_at || new Date().toISOString();
  $("reloadCatalogResult").textContent = `Reloaded ${count} cache(s) at ${reloadedAt}`;
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
  const apiBaseInput = $("apiBaseUrl");
  if (apiBaseInput) {
    apiBaseInput.value = getApiBase();
  }

  const purchased = document.querySelector("[name='purchased_at']");
  if (purchased) {
    purchased.value = todayIso();
  }
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setCameraStatus("Tip: mobile camera preview usually requires HTTPS. Photo upload still works.");
  } else {
    setCameraStatus("Camera idle.");
  }
  window.addEventListener("beforeunload", stopLiveCamera);
  bindEvents();
  refreshAll();
}

window.addEventListener("DOMContentLoaded", init);
