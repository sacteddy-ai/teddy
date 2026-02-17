import { jsonResponse, errorResponse, withOptionsCors, readJsonOptional } from "../../../_lib/http.js";
import { nowIso } from "../../../_lib/util.js";
import {
  getArray,
  getObject,
  putArray,
  putObject,
  inventoryKey,
  notificationsKey,
  notificationPreferencesKey
} from "../../../_lib/store.js";
import {
  DEFAULT_NOTIFICATION_DAY_OFFSETS,
  MIN_NOTIFICATION_DAY_OFFSET,
  MAX_NOTIFICATION_DAY_OFFSET,
  sanitizeNotificationDayOffsets,
  newExpirationNotifications
} from "../../../_lib/notifications.js";

function normalizeUserId(value) {
  return String(value || "demo-user").trim() || "demo-user";
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return fallback;
}

function buildPreferenceResponse(pref) {
  const dayOffsets = sanitizeNotificationDayOffsets(pref?.day_offsets, DEFAULT_NOTIFICATION_DAY_OFFSETS);
  const customDayPresetsRaw = sanitizeNotificationDayOffsets(pref?.custom_day_presets, []);
  const customDayPresets = customDayPresetsRaw.filter((d) => !DEFAULT_NOTIFICATION_DAY_OFFSETS.includes(d));
  return {
    day_offsets: dayOffsets,
    custom_day_presets: customDayPresets,
    updated_at: pref?.updated_at || null,
    default_day_offsets: [...DEFAULT_NOTIFICATION_DAY_OFFSETS],
    min_day_offset: MIN_NOTIFICATION_DAY_OFFSET,
    max_day_offset: MAX_NOTIFICATION_DAY_OFFSET
  };
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withOptionsCors(context);
  }

  if (method !== "GET" && method !== "POST") {
    return errorResponse(context, "Not found.", 404);
  }

  try {
    if (method === "GET") {
      const url = new URL(context.request.url);
      const userId = normalizeUserId(url.searchParams.get("user_id"));
      const pref = await getObject(context.env, notificationPreferencesKey(userId));
      return jsonResponse(context, {
        data: buildPreferenceResponse(pref)
      });
    }

    const payload = await readJsonOptional(context.request);
    const userId = normalizeUserId(payload?.user_id);
    const dayOffsets = sanitizeNotificationDayOffsets(payload?.day_offsets, DEFAULT_NOTIFICATION_DAY_OFFSETS);
    const customDayPresetsInput = sanitizeNotificationDayOffsets(payload?.custom_day_presets, []);
    const customFromSelected = dayOffsets.filter((d) => !DEFAULT_NOTIFICATION_DAY_OFFSETS.includes(d));
    const customDayPresets = Array.from(new Set([...(customDayPresetsInput || []), ...(customFromSelected || [])]))
      .filter((d) => !DEFAULT_NOTIFICATION_DAY_OFFSETS.includes(d))
      .sort((a, b) => b - a);
    const applyToExisting = normalizeBoolean(payload?.apply_to_existing, true);
    const updatedAt = nowIso();

    await putObject(context.env, notificationPreferencesKey(userId), {
      day_offsets: dayOffsets,
      custom_day_presets: customDayPresets,
      updated_at: updatedAt
    });

    let affectedInventoryItems = 0;
    let regeneratedNotifications = 0;

    if (applyToExisting) {
      const inventoryItems = await getArray(context.env, inventoryKey(userId));
      const nextNotifications = [];

      for (const item of inventoryItems || []) {
        const itemId = String(item?.id || "").trim();
        const exp = String(item?.suggested_expiration_date || "").trim().slice(0, 10);
        if (!itemId || !exp) {
          continue;
        }
        try {
          const created = newExpirationNotifications(userId, itemId, exp, dayOffsets);
          if (created.length > 0) {
            affectedInventoryItems += 1;
            regeneratedNotifications += created.length;
            nextNotifications.push(...created);
          }
        } catch {
          // Skip malformed rows and continue rebuilding.
        }
      }

      await putArray(context.env, notificationsKey(userId), nextNotifications);
    }

    return jsonResponse(context, {
      data: {
        ...buildPreferenceResponse({ day_offsets: dayOffsets, custom_day_presets: customDayPresets, updated_at: updatedAt }),
        apply_to_existing: applyToExisting,
        affected_inventory_items: affectedInventoryItems,
        regenerated_notifications: regeneratedNotifications
      }
    });
  } catch (err) {
    return errorResponse(context, err?.message || String(err), 400);
  }
}
