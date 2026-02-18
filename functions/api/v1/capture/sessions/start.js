import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../../_lib/http.js";
import { buildCaptureSessionView } from "../../../../_lib/capture.js";
import { captureSessionKey, putObject } from "../../../../_lib/store.js";
import { nowIso } from "../../../../_lib/util.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    const payload = await readJsonOptional(context.request);
    const userId = String(payload?.user_id || "demo-user").trim() || "demo-user";
    const now = nowIso();

    const session = {
      id: crypto.randomUUID(),
      user_id: userId,
      status: "open",
      draft_items: [],
      draft_history: [],
      turns: [],
      pending_review_item_ids: [],
      created_inventory_item_ids: [],
      created_at: now,
      updated_at: now,
      finalized_at: null
    };

    await putObject(context.env, captureSessionKey(session.id), session);

    return jsonResponse(context, { data: await buildCaptureSessionView(context, session) }, 201);
  } catch (err) {
    return errorResponse(context, err?.message || String(err));
  }
}
