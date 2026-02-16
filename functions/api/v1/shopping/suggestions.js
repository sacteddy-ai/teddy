import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { getRecipeRecommendations, getShoppingSuggestions } from "../../../_lib/recommendation.js";

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "ko" || raw === "en") {
    return raw;
  }
  return "en";
}

function reasonLabel(reasonCode, uiLang) {
  const lang = normalizeLang(uiLang);
  const code = String(reasonCode || "").trim().toLowerCase();

  const labels = {
    expired_replace: {
      en: "replace expired item",
      ko: "\uC720\uD1B5\uAE30\uD55C \uC9C0\uB0A8/\uC0C1\uD0DC \uBB38\uC81C \uAD50\uCCB4"
    },
    low_stock: {
      en: "low stock",
      ko: "\uC7AC\uACE0 \uBD80\uC871"
    },
    essential_missing: {
      en: "essential missing",
      ko: "\uAE30\uBCF8 \uC2DD\uC7AC\uB8CC \uBD80\uC7AC"
    },
    recipe_missing: {
      en: "needed for recommended recipe",
      ko: "\uCD94\uCC9C \uB808\uC2DC\uD53C \uD544\uC218 \uC7AC\uB8CC"
    }
  };

  const row = labels[code];
  if (!row) {
    return code || "unknown";
  }
  return row[lang] || row.en || code;
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const url = new URL(context.request.url);
    const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
    const topN = Number(url.searchParams.get("top_n") || 10);
    const topRecipeCount = Number(url.searchParams.get("top_recipe_count") || 3);
    const lowStockThresholdRaw = url.searchParams.get("low_stock_threshold");
    const lowStockThreshold = lowStockThresholdRaw ? Number(lowStockThresholdRaw) : null;
    const uiLang = normalizeLang(url.searchParams.get("ui_lang") || "en");

    const inventory = await recomputeInventoryStatuses(context, userId);
    const recs = await getRecipeRecommendations(context, inventory, { top_n: topN, ui_lang: uiLang });
    const shopping = await getShoppingSuggestions(context, inventory, recs, {
      top_recipe_count: topRecipeCount,
      low_stock_threshold: lowStockThreshold
    });

    const localizedItems = (shopping.items || []).map((item) => {
      const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
      return {
        ...item,
        reason_labels: reasons.map((code) => reasonLabel(code, uiLang))
      };
    });

    return jsonResponse(context, {
      data: {
        items: localizedItems,
        count: localizedItems.length,
        low_stock_threshold: shopping.low_stock_threshold,
        ui_lang: uiLang
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
