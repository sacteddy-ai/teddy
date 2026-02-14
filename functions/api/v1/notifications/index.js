import { jsonResponse, errorResponse, withOptionsCors } from "../../../_lib/http.js";
import { getArray, notificationsKey } from "../../../_lib/store.js";

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
    const status = (url.searchParams.get("status") || "").trim();
    const dueUntil = (url.searchParams.get("due_until") || "").trim();

    let items = await getArray(context.env, notificationsKey(userId));
    if (status) {
      items = items.filter((n) => n && n.status === status);
    }
    if (dueUntil) {
      const due = new Date(dueUntil);
      if (!Number.isFinite(due.getTime())) {
        throw new Error("Invalid due_until.");
      }
      items = items.filter((n) => {
        const scheduled = new Date(String(n?.scheduled_at || ""));
        return Number.isFinite(scheduled.getTime()) && scheduled <= due;
      });
    }

    return jsonResponse(context, {
      data: {
        items,
        count: items.length
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

