import { jsonResponse, withOptionsCors } from "./_lib/http.js";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }
  if (method !== "GET") {
    return jsonResponse(context, { error: "Not found.", path: "/health", method }, 404);
  }
  return jsonResponse(context, {
    status: "ok",
    timestamp: new Date().toISOString()
  });
}

