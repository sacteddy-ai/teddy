import { getArray, putArray, shoppingOrderDraftsKey } from "./store.js";
import { clampNumber, normalizeIngredientKey, nowIso } from "./util.js";

const MAX_DRAFTS_PER_USER = 300;
const MAX_ITEMS_PER_DRAFT = 120;

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "coupang" || raw === "naver_shopping" || raw === "mixed") {
    return raw;
  }
  return "mixed";
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "draft" || raw === "approved_pending_checkout" || raw === "canceled") {
    return raw;
  }
  return "draft";
}

function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) {
    return raw;
  }
  return "KRW";
}

function normalizeUnit(value) {
  const raw = String(value || "ea").trim().toLowerCase();
  if (!raw || raw.length > 16) {
    return "ea";
  }
  return raw;
}

function normalizeQuantity(value, fallback = 1) {
  const n = clampNumber(value, fallback, 0.01, 9999);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.round(Number(n) * 100) / 100;
}

function normalizeReasonCodes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((v) => String(v || "").trim().toLowerCase())
    .filter((v) => v.length > 0)
    .slice(0, 10);
}

function toSearchQuery(item) {
  const name = String(item?.ingredient_name || "").trim();
  if (name) {
    return name;
  }
  const key = String(item?.ingredient_key || "").trim().replace(/_/g, " ");
  return key || "";
}

function buildProviderLinks(provider, queryInput) {
  const query = String(queryInput || "").trim();
  const q = encodeURIComponent(query);
  const links = {};
  if (!q) {
    return links;
  }

  if (provider === "mixed" || provider === "coupang") {
    links.coupang = `https://www.coupang.com/np/search?q=${q}`;
  }
  if (provider === "mixed" || provider === "naver_shopping") {
    links.naver_shopping = `https://search.shopping.naver.com/search/all?query=${q}`;
  }
  return links;
}

function normalizeItem(raw, provider, fallbackName = "") {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const keyRaw = String(raw.ingredient_key || raw.ingredient_name || "").trim();
  const ingredientKey = normalizeIngredientKey(keyRaw);
  if (!ingredientKey) {
    return null;
  }

  const ingredientName = String(raw.ingredient_name || fallbackName || ingredientKey).trim() || ingredientKey;
  const quantity = normalizeQuantity(raw.quantity, 1);
  const unit = normalizeUnit(raw.unit);
  const priority = clampNumber(raw.priority, 3, 1, 9);
  const reasons = normalizeReasonCodes(raw.reasons);
  const autoOrderCandidate = raw.auto_order_candidate === true;
  const query = toSearchQuery({ ingredient_key: ingredientKey, ingredient_name: ingredientName });
  const providerLinks = buildProviderLinks(provider, query);

  return {
    ingredient_key: ingredientKey,
    ingredient_name: ingredientName,
    quantity,
    unit,
    priority: Number(priority),
    reasons,
    auto_order_candidate: autoOrderCandidate,
    provider_links: providerLinks
  };
}

function mergeItems(items = []) {
  const byKey = new Map();

  for (const item of items) {
    const key = normalizeIngredientKey(item?.ingredient_key || "");
    if (!key) {
      continue;
    }

    if (!byKey.has(key)) {
      byKey.set(key, {
        ...item,
        ingredient_key: key,
        reasons: normalizeReasonCodes(item?.reasons)
      });
      continue;
    }

    const existing = byKey.get(key);
    existing.quantity = Math.round((Number(existing.quantity || 0) + Number(item.quantity || 0)) * 100) / 100;
    existing.priority = Math.min(Number(existing.priority || 9), Number(item.priority || 9));
    existing.auto_order_candidate = existing.auto_order_candidate || item.auto_order_candidate === true;
    const mergedReasons = new Set([...(existing.reasons || []), ...(item.reasons || [])]);
    existing.reasons = Array.from(mergedReasons).slice(0, 10);
  }

  return Array.from(byKey.values());
}

function toCheckoutLinks(items) {
  const out = [];
  for (const item of items || []) {
    const links = item?.provider_links && typeof item.provider_links === "object" ? item.provider_links : {};
    for (const [provider, url] of Object.entries(links)) {
      if (!url) {
        continue;
      }
      out.push({
        provider: String(provider),
        ingredient_key: String(item.ingredient_key || ""),
        ingredient_name: String(item.ingredient_name || item.ingredient_key || ""),
        quantity: Number(item.quantity || 0),
        unit: String(item.unit || "ea"),
        url: String(url)
      });
    }
  }
  return out;
}

function buildSummary(items) {
  const rows = Array.isArray(items) ? items : [];
  const lineCount = rows.length;
  let totalQuantity = 0;
  let autoOrderCandidateCount = 0;
  for (const item of rows) {
    totalQuantity += Number(item?.quantity || 0);
    if (item?.auto_order_candidate === true) {
      autoOrderCandidateCount += 1;
    }
  }
  return {
    line_count: lineCount,
    total_quantity: Math.round(totalQuantity * 100) / 100,
    auto_order_candidate_count: autoOrderCandidateCount
  };
}

function normalizeDraftRecord(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || "").trim();
  if (!id) {
    return null;
  }

  const provider = normalizeProvider(raw.provider);
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = mergeItems(itemsRaw.map((item) => normalizeItem(item, provider)).filter(Boolean)).slice(0, MAX_ITEMS_PER_DRAFT);
  const checkoutLinks = toCheckoutLinks(items);

  const createdAt = String(raw.created_at || "").trim() || nowIso();
  const updatedAt = String(raw.updated_at || "").trim() || createdAt;
  const status = normalizeStatus(raw.status || "draft");

  return {
    id,
    user_id: String(raw.user_id || "demo-user").trim() || "demo-user",
    status,
    placement_status: String(raw.placement_status || (status === "approved_pending_checkout" ? "awaiting_external_checkout" : "not_placed")).trim(),
    provider,
    currency: normalizeCurrency(raw.currency),
    source: String(raw.source || "shopping_ui").trim() || "shopping_ui",
    notes: raw.notes ? String(raw.notes).trim() : null,
    approval_note: raw.approval_note ? String(raw.approval_note).trim() : null,
    cancel_reason: raw.cancel_reason ? String(raw.cancel_reason).trim() : null,
    created_at: createdAt,
    updated_at: updatedAt,
    approved_at: raw.approved_at ? String(raw.approved_at).trim() : null,
    canceled_at: raw.canceled_at ? String(raw.canceled_at).trim() : null,
    items,
    summary: buildSummary(items),
    checkout_links: checkoutLinks
  };
}

function sortByUpdatedDesc(items) {
  return [...(items || [])].sort((a, b) => String(b?.updated_at || "").localeCompare(String(a?.updated_at || "")));
}

async function loadAndNormalizeDrafts(context, userId) {
  const key = shoppingOrderDraftsKey(userId);
  const raw = await getArray(context.env, key);
  const normalized = sortByUpdatedDesc(raw.map((item) => normalizeDraftRecord(item)).filter(Boolean)).slice(
    0,
    MAX_DRAFTS_PER_USER
  );

  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await putArray(context.env, key, normalized);
  }

  return normalized;
}

async function saveDrafts(context, userId, drafts) {
  const key = shoppingOrderDraftsKey(userId);
  const sorted = sortByUpdatedDesc(drafts).slice(0, MAX_DRAFTS_PER_USER);
  await putArray(context.env, key, sorted);
}

export async function listShoppingOrderDrafts(context, userId, options = {}) {
  const uid = String(userId || "demo-user").trim() || "demo-user";
  const rawStatus = String(options?.status || "").trim().toLowerCase();
  const statusFilter =
    rawStatus === "draft" || rawStatus === "approved_pending_checkout" || rawStatus === "canceled" ? rawStatus : "";
  const limit = clampNumber(options?.limit, 50, 1, 200);
  const drafts = await loadAndNormalizeDrafts(context, uid);
  const filtered = statusFilter ? drafts.filter((item) => item.status === statusFilter) : drafts;
  return filtered.slice(0, Number(limit));
}

export async function createShoppingOrderDraft(context, payload = {}) {
  const userId = String(payload?.user_id || "demo-user").trim() || "demo-user";
  const provider = normalizeProvider(payload?.provider);
  const currency = normalizeCurrency(payload?.currency);
  const source = String(payload?.source || "shopping_ui").trim() || "shopping_ui";
  const notes = payload?.notes ? String(payload.notes).trim() : null;
  const itemsRaw = Array.isArray(payload?.items) ? payload.items : [];

  const normalizedItems = mergeItems(
    itemsRaw
      .slice(0, MAX_ITEMS_PER_DRAFT)
      .map((item) => normalizeItem(item, provider))
      .filter(Boolean)
  );

  if (normalizedItems.length === 0) {
    throw new Error("items are required.");
  }

  const now = nowIso();
  const draft = {
    id: crypto.randomUUID(),
    user_id: userId,
    status: "draft",
    placement_status: "not_placed",
    provider,
    currency,
    source,
    notes,
    approval_note: null,
    cancel_reason: null,
    created_at: now,
    updated_at: now,
    approved_at: null,
    canceled_at: null,
    items: normalizedItems,
    summary: buildSummary(normalizedItems),
    checkout_links: toCheckoutLinks(normalizedItems)
  };

  const drafts = await loadAndNormalizeDrafts(context, userId);
  drafts.unshift(draft);
  await saveDrafts(context, userId, drafts);
  return draft;
}

export async function updateShoppingOrderDraftStatus(context, payload = {}) {
  const userId = String(payload?.user_id || "demo-user").trim() || "demo-user";
  const draftId = String(payload?.draft_id || "").trim();
  const nextStatus = normalizeStatus(payload?.next_status);
  if (!draftId) {
    throw new Error("draft_id is required.");
  }
  if (nextStatus !== "approved_pending_checkout" && nextStatus !== "canceled") {
    throw new Error("next_status must be approved_pending_checkout or canceled.");
  }

  const drafts = await loadAndNormalizeDrafts(context, userId);
  const idx = drafts.findIndex((item) => String(item?.id || "") === draftId);
  if (idx < 0) {
    throw new Error("order draft not found.");
  }

  const now = nowIso();
  const draft = { ...drafts[idx] };
  if (nextStatus === "approved_pending_checkout") {
    if (draft.status !== "draft") {
      throw new Error("only draft status can be approved.");
    }
    draft.status = "approved_pending_checkout";
    draft.placement_status = "awaiting_external_checkout";
    draft.approved_at = now;
    draft.approval_note = payload?.approval_note ? String(payload.approval_note).trim() : null;
  } else if (nextStatus === "canceled") {
    if (draft.status === "canceled") {
      return draft;
    }
    draft.status = "canceled";
    draft.placement_status = "canceled";
    draft.canceled_at = now;
    draft.cancel_reason = payload?.cancel_reason ? String(payload.cancel_reason).trim() : null;
  }

  draft.updated_at = now;
  drafts[idx] = draft;
  await saveDrafts(context, userId, drafts);
  return draft;
}
