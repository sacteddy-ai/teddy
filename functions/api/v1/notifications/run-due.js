import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../_lib/http.js";
import { getArray, putArray, notificationsKey } from "../../../_lib/store.js";
import { dispatchDueNotifications } from "../../../_lib/notifications.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJson(context.request);
    const userId = payload?.user_id ? String(payload.user_id).trim() : "demo-user";
    const asOfDateTime = payload?.as_of_datetime ? String(payload.as_of_datetime).trim() : new Date().toISOString();

    const key = notificationsKey(userId);
    const all = await getArray(context.env, key);
    const result = dispatchDueNotifications(all, asOfDateTime);
    await putArray(context.env, key, result.updated_notifications);

    return jsonResponse(context, {
      data: {
        as_of_datetime: asOfDateTime,
        sent_count: result.sent_count,
        sent_notifications: result.sent_notifications
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

