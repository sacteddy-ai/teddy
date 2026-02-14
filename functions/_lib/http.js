function resolveCorsHeaders(env, request) {
  const enabled = String(env?.ENABLE_CORS || "").trim();
  if (!enabled) {
    return {};
  }

  const allowOriginRaw = String(env?.CORS_ALLOW_ORIGIN || "").trim();
  const allowOrigin = allowOriginRaw || "*";

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400"
  };

  if (allowOrigin !== "*" && request?.headers?.get("Origin")) {
    headers.Vary = "Origin";
  }

  return headers;
}

export function jsonResponse(context, body, status = 200, extraHeaders = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...resolveCorsHeaders(context?.env, context?.request),
    ...extraHeaders
  };

  return new Response(JSON.stringify(body ?? {}), { status, headers });
}

export function errorResponse(context, message, status = 400, extra = null) {
  const body = { error: String(message || "Bad request.") };
  if (extra && typeof extra === "object") {
    body.meta = extra;
  }
  return jsonResponse(context, body, status);
}

export async function readJson(request) {
  const text = await request.text();
  if (!text) {
    throw new Error("Request body is required.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export async function readJsonOptional(request) {
  const text = await request.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function withOptionsCors(context) {
  const headers = {
    ...resolveCorsHeaders(context?.env, context?.request),
    "cache-control": "no-store"
  };
  return new Response(null, { status: 204, headers });
}

