import { errorResponse, jsonResponse, readJsonOptional, withOptionsCors } from "../../../_lib/http.js";
import { createShoppingOrderDraft, listShoppingOrderDrafts } from "../../../_lib/order_draft.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { getRecipeRecommendations, getShoppingSuggestions } from "../../../_lib/recommendation.js";

function parseBool(value, fallback = false) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return fallback;
}

function hasUsableInventory(inventoryItems) {
  const rows = Array.isArray(inventoryItems) ? inventoryItems : [];
  for (const item of rows) {
    const qty = Number(item?.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const status = String(item?.status || "").trim().toLowerCase();
    if (status === "expired") {
      continue;
    }
    return true;
  }
  return false;
}

function toDraftItemsFromSuggestions(suggestions, options = {}) {
  const rows = Array.isArray(suggestions) ? suggestions : [];
  const autoOnly = options?.auto_order_only === true;
  const filtered = autoOnly ? rows.filter((row) => row?.auto_order_candidate === true) : rows;
  return filtered.map((row) => ({
    ingredient_key: String(row?.ingredient_key || "").trim(),
    ingredient_name: String(row?.ingredient_name || row?.ingredient_key || "").trim(),
    quantity: Number(row?.auto_order_hint?.suggested_quantity || 1),
    unit: "ea",
    reasons: Array.isArray(row?.reasons) ? row.reasons : [],
    priority: Number(row?.priority || 3),
    auto_order_candidate: Boolean(row?.auto_order_candidate)
  }));
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }

  if (method === "GET") {
    try {
      const url = new URL(context.request.url);
      const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
      const status = (url.searchParams.get("status") || "").trim();
      const limitRaw = Number(url.searchParams.get("limit") || 50);
      const drafts = await listShoppingOrderDrafts(context, userId, {
        status: status || null,
        limit: Number.isFinite(limitRaw) ? limitRaw : 50
      });

      return jsonResponse(context, {
        data: {
          items: drafts,
          count: drafts.length
        }
      });
    } catch (err) {
      return errorResponse(context, err?.message || String(err), 400);
    }
  }

  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const provider = payload?.provider ? String(payload.provider).trim() : "mixed";
    const source = payload?.source ? String(payload.source).trim() : "shopping_ui";
    const autoOrderOnly = parseBool(payload?.auto_order_only, false);

    let items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0 && (payload?.use_shopping_suggestions === true || autoOrderOnly)) {
      const uiLang = payload?.ui_lang ? String(payload.ui_lang).trim().toLowerCase() : "ko";
      const topN = Number(payload?.top_n || 20);
      const topRecipeCount = Number(payload?.top_recipe_count || 3);

      const inventory = await recomputeInventoryStatuses(context, userId);
      const includeRecipeSignals = hasUsableInventory(inventory);
      const recs = includeRecipeSignals ? await getRecipeRecommendations(context, inventory, { top_n: topN, ui_lang: uiLang }) : [];
      const shopping = await getShoppingSuggestions(context, inventory, recs, {
        user_id: userId,
        top_recipe_count: includeRecipeSignals ? topRecipeCount : 0
      });
      items = toDraftItemsFromSuggestions(shopping?.items || [], { auto_order_only: autoOrderOnly });
    }

    const draft = await createShoppingOrderDraft(context, {
      user_id: userId,
      provider,
      source,
      currency: payload?.currency || "KRW",
      notes: payload?.notes || null,
      items
    });

    return jsonResponse(context, {
      data: {
        draft
      }
    });
  } catch (err) {
    const msg = err?.message || String(err);
    return errorResponse(context, msg, 400);
  }
}
