import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../_lib/http.js";
import { createInventoryItemRecord, recomputeInventoryStatuses } from "../../../_lib/inventory.js";
import { inventoryKey, getArray } from "../../../_lib/store.js";
import { parseOcrExpirationDate } from "../../../_lib/ocr.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }

  if (method === "POST") {
    try {
      const payload = await readJson(context.request);

      const ingredientName = payload?.ingredient_name ? String(payload.ingredient_name).trim() : "";
      const purchasedAt = payload?.purchased_at ? String(payload.purchased_at).trim() : "";
      if (!ingredientName) {
        throw new Error("ingredient_name is required.");
      }
      if (!purchasedAt) {
        throw new Error("purchased_at is required.");
      }

      const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
      const storageType = payload?.storage_type ? String(payload.storage_type).trim() : "refrigerated";
      const quantity = payload?.quantity ?? 1;
      const unit = payload?.unit ? String(payload.unit).trim() : "ea";
      const openedAt = payload?.opened_at ? String(payload.opened_at).trim() : null;
      const productShelfLifeDays = payload?.product_shelf_life_days ?? null;

      const ocrExpirationDateInput = payload?.ocr_expiration_date ? String(payload.ocr_expiration_date).trim() : null;
      const ocrRawText = payload?.ocr_raw_text ? String(payload.ocr_raw_text) : "";

      let resolvedOcrDate = ocrExpirationDateInput;
      let ocrMeta = null;

      if (!resolvedOcrDate && ocrRawText && ocrRawText.trim()) {
        ocrMeta = parseOcrExpirationDate(ocrRawText);
        resolvedOcrDate = ocrMeta.parsed_expiration_date;
      }

      const createResult = await createInventoryItemRecord(context, {
        user_id: userId,
        ingredient_name: ingredientName,
        purchased_at: purchasedAt,
        storage_type: storageType,
        quantity,
        unit,
        opened_at: openedAt,
        ocr_expiration_date: resolvedOcrDate,
        product_shelf_life_days: productShelfLifeDays
      });

      return jsonResponse(
        context,
        {
          data: {
            item: createResult.item,
            notifications: createResult.notifications,
            ocr: ocrMeta
          }
        },
        201
      );
    } catch (err) {
      return errorResponse(context, err?.message || String(err), 400);
    }
  }

  if (method === "GET") {
    try {
      const url = new URL(context.request.url);
      const userId = (url.searchParams.get("user_id") || "demo-user").trim() || "demo-user";
      const status = (url.searchParams.get("status") || "").trim();

      const normalized = await recomputeInventoryStatuses(context, userId);
      const filtered = status ? normalized.filter((i) => i && i.status === status) : normalized;

      return jsonResponse(context, {
        data: {
          items: filtered,
          count: filtered.length
        }
      });
    } catch (err) {
      return errorResponse(context, err?.message || String(err), 400);
    }
  }

  return errorResponse(context, "Not found.", 404);
}

