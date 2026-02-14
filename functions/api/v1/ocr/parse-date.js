import { jsonResponse, errorResponse, withOptionsCors, readJson } from "../../../_lib/http.js";
import { parseOcrExpirationDate } from "../../../_lib/ocr.js";
import { nowIso } from "../../../_lib/util.js";

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
    const rawText = payload?.raw_text ? String(payload.raw_text) : "";
    if (!rawText.trim()) {
      throw new Error("raw_text is required.");
    }

    const parseResult = parseOcrExpirationDate(rawText);
    const event = {
      id: crypto.randomUUID(),
      raw_text: rawText,
      parsed_expiration_date: parseResult.parsed_expiration_date,
      parser_confidence: parseResult.parser_confidence,
      matched_pattern: parseResult.matched_pattern,
      created_at: nowIso()
    };

    return jsonResponse(context, { data: event }, 200);
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}

