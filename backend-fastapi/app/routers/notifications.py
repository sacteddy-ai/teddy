from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request

from app.config import (
    DEFAULT_NOTIFICATION_DAY_OFFSET,
    DEFAULT_USER_ID,
    MAX_NOTIFICATION_DAY_OFFSET,
    MIN_NOTIFICATION_DAY_OFFSET,
)
from app.models import NotificationPreferencesPayload, RunDuePayload
from app.services.notifications import (
    build_notification,
    dispatch_due,
    sanitize_day_offset,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


def _pref_response(pref: dict | None) -> dict:
    day = sanitize_day_offset((pref or {}).get("day_offset"), DEFAULT_NOTIFICATION_DAY_OFFSET)
    return {
        "day_offsets": [day],
        "custom_day_presets": [],
        "updated_at": (pref or {}).get("updated_at"),
        "default_day_offsets": [DEFAULT_NOTIFICATION_DAY_OFFSET],
        "min_day_offset": MIN_NOTIFICATION_DAY_OFFSET,
        "max_day_offset": MAX_NOTIFICATION_DAY_OFFSET,
    }


@router.get("")
async def list_notifications(
    request: Request,
    user_id: str = Query(default=DEFAULT_USER_ID),
    status: str = Query(default="pending"),
) -> dict:
    store = request.app.state.store
    rows = store.get_user_list("notifications", user_id)
    if status != "all":
        rows = [row for row in rows if str(row.get("status") or "") == status]
    rows = sorted(rows, key=lambda row: str(row.get("scheduled_at") or ""))
    return {"data": {"items": rows, "count": len(rows)}}


@router.get("/preferences")
async def get_preferences(
    request: Request,
    user_id: str = Query(default=DEFAULT_USER_ID),
) -> dict:
    store = request.app.state.store
    pref = store.get_user_obj("notification_preferences", user_id)
    return {"data": _pref_response(pref)}


@router.post("/preferences")
async def save_preferences(
    payload: NotificationPreferencesPayload,
    request: Request,
) -> dict:
    store = request.app.state.store
    user_id = payload.user_id.strip() or DEFAULT_USER_ID

    incoming = payload.day_offset
    if incoming is None and payload.day_offsets:
        incoming = payload.day_offsets[0]
    day = sanitize_day_offset(incoming, DEFAULT_NOTIFICATION_DAY_OFFSET)
    updated_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    pref = {"day_offset": day, "updated_at": updated_at}
    store.set_user_obj("notification_preferences", user_id, pref)

    affected_inventory_items = 0
    regenerated_notifications = 0

    if payload.apply_to_existing:
        items = store.get_user_list("inventory", user_id)
        notices: list[dict] = []
        for item in items:
            exp = str(item.get("suggested_expiration_date") or "").strip()[:10]
            item_id = str(item.get("id") or "").strip()
            if not exp or not item_id:
                continue
            affected_inventory_items += 1
            n = build_notification(
                user_id=user_id,
                inventory_item_id=item_id,
                expiration_date_iso=exp,
                day_offset=day,
            ).model_dump()
            notices.append(n)
            regenerated_notifications += 1
        store.set_user_list("notifications", user_id, notices)

    return {
        "data": {
            **_pref_response(pref),
            "apply_to_existing": payload.apply_to_existing,
            "affected_inventory_items": affected_inventory_items,
            "regenerated_notifications": regenerated_notifications,
        }
    }


@router.post("/run-due")
async def run_due(
    payload: RunDuePayload,
    request: Request,
) -> dict:
    store = request.app.state.store
    user_id = payload.user_id.strip() or DEFAULT_USER_ID
    as_of = payload.as_of_datetime or datetime.now(timezone.utc)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)
    notices = store.get_user_list("notifications", user_id)
    pending_rows, sent_rows = dispatch_due(notices, as_of=as_of)
    store.set_user_list("notifications", user_id, pending_rows)
    return {
        "data": {
            "as_of_datetime": as_of.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "sent_count": len(sent_rows),
        }
    }
