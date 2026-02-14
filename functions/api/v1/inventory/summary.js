import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { recomputeInventoryStatuses } from "../../../_lib/inventory.js";

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
    const items = await recomputeInventoryStatuses(context, userId);

    let fresh = 0;
    let expiringSoon = 0;
    let expired = 0;
    for (const item of items) {
      if (!item) {
        continue;
      }
      if (item.status === "fresh") {
        fresh += 1;
      } else if (item.status === "expiring_soon") {
        expiringSoon += 1;
      } else if (item.status === "expired") {
        expired += 1;
      }
    }

    return jsonResponse(context, {
      data: {
        total_items: items.length,
        fresh,
        expiring_soon: expiringSoon,
        expired
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

