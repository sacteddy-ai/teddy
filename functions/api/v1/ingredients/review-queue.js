import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { getArray, reviewQueueKey } from "../../../_lib/store.js";

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
    const statusInput = (url.searchParams.get("status") || "pending").trim().toLowerCase();
    const limitRaw = url.searchParams.get("limit");
    let limit = Number(limitRaw || 100);
    if (!Number.isFinite(limit) || limit <= 0) {
      limit = 100;
    }

    const status = statusInput || "pending";
    if (!["pending", "mapped", "ignored", "all"].includes(status)) {
      throw new Error("status must be one of: pending, mapped, ignored, all.");
    }

    const all = await getArray(context.env, reviewQueueKey(userId));
    const filtered =
      status === "all" ? all : all.filter((item) => item && item.status === status);

    filtered.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const limited = filtered.slice(0, limit);

    return jsonResponse(context, {
      data: {
        items: limited,
        count: limited.length,
        total_count: filtered.length,
        status
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err));
  }
}

