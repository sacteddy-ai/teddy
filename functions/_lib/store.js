import { kvGetJson, kvPutJson } from "./kv.js";

function keyFor(prefix, userId) {
  const u = String(userId || "demo-user").trim() || "demo-user";
  return `${prefix}:${u}`;
}

export function inventoryKey(userId) {
  return keyFor("inventory_items", userId);
}

export function notificationsKey(userId) {
  return keyFor("notifications", userId);
}

export function reviewQueueKey(userId) {
  return keyFor("ingredient_review_queue", userId);
}

export function aliasOverridesKey(userId) {
  return keyFor("ingredient_alias_overrides", userId);
}

export function captureSessionKey(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) {
    throw new Error("session_id is required.");
  }
  return `capture_session:${id}`;
}

export async function getArray(env, key) {
  const items = await kvGetJson(env, key, []);
  return Array.isArray(items) ? items : [];
}

export async function putArray(env, key, items) {
  await kvPutJson(env, key, Array.isArray(items) ? items : []);
}

export async function getObject(env, key) {
  const obj = await kvGetJson(env, key, null);
  return obj && typeof obj === "object" ? obj : null;
}

export async function putObject(env, key, obj) {
  await kvPutJson(env, key, obj && typeof obj === "object" ? obj : null);
}

