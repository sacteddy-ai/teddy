from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request

from app.config import DEFAULT_USER_ID
from app.models import (
    InventoryAdjustRequest,
    InventoryCreateRequest,
    InventoryItem,
)
from app.services.expiration import (
    days_remaining,
    normalize_storage,
    now_iso,
    parse_iso_date,
    slug_key,
    status_from_days,
    suggest_expiration_date,
)
from app.services.notifications import build_notification, sanitize_day_offset

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def _summary(items: list[dict]) -> dict:
    fresh = 0
    expiring = 0
    expired = 0
    total_qty = 0.0
    for row in items:
        status = str(row.get("status") or "")
        qty = float(row.get("quantity") or 0)
        total_qty += qty
        if status == "fresh":
            fresh += 1
        elif status == "expiring_soon":
            expiring += 1
        elif status == "expired":
            expired += 1
    return {
        "total_items": len(items),
        "fresh_count": fresh,
        "expiring_soon_count": expiring,
        "expired_count": expired,
        "total_quantity": round(total_qty, 2),
    }


@router.get("/items")
async def list_items(
    request: Request,
    user_id: str = Query(default=DEFAULT_USER_ID),
) -> dict:
    store = request.app.state.store
    rows = store.get_user_list("inventory", user_id)
    return {"data": {"items": rows, "count": len(rows)}}


@router.post("/items")
async def create_item(
    payload: InventoryCreateRequest,
    request: Request,
) -> dict:
    store = request.app.state.store
    user_id = payload.user_id.strip() or DEFAULT_USER_ID
    expiration_date, source, purchased_at = suggest_expiration_date(
        ingredient_name=payload.ingredient_name,
        purchased_at=payload.purchased_at,
        storage_type=payload.storage_type,
        ocr_expiration_date=payload.ocr_expiration_date,
        product_shelf_life_days=payload.product_shelf_life_days,
    )
    d_left = days_remaining(expiration_date)
    now = now_iso()
    item = InventoryItem(
        id=str(uuid4()),
        user_id=user_id,
        ingredient_name=payload.ingredient_name.strip(),
        ingredient_key=slug_key(payload.ingredient_name),
        quantity=round(float(payload.quantity), 2),
        unit=(payload.unit or "ea").strip() or "ea",
        storage_type=normalize_storage(payload.storage_type),
        purchased_at=purchased_at,
        suggested_expiration_date=expiration_date.isoformat(),
        expiration_source=source,
        status=status_from_days(d_left),
        days_remaining=d_left,
        created_at=now,
        updated_at=now,
    ).model_dump()

    rows = store.get_user_list("inventory", user_id)
    rows.append(item)
    store.set_user_list("inventory", user_id, rows)

    pref = store.get_user_obj("notification_preferences", user_id) or {}
    day_offset = sanitize_day_offset(pref.get("day_offset"))
    n = build_notification(
        user_id=user_id,
        inventory_item_id=item["id"],
        expiration_date_iso=item["suggested_expiration_date"],
        day_offset=day_offset,
    ).model_dump()
    notices = store.get_user_list("notifications", user_id)
    notices.append(n)
    store.set_user_list("notifications", user_id, notices)

    return {"data": {"item": item}}


@router.post("/items/{item_id}/adjust")
async def adjust_item(
    item_id: str,
    payload: InventoryAdjustRequest,
    request: Request,
) -> dict:
    delta = float(payload.delta_quantity)
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta_quantity must be non-zero.")

    store = request.app.state.store
    user_id = payload.user_id.strip() or DEFAULT_USER_ID
    rows = store.get_user_list("inventory", user_id)
    next_rows: list[dict] = []
    updated_item: dict | None = None
    removed = False

    for row in rows:
        if str(row.get("id")) != str(item_id):
            next_rows.append(row)
            continue

        qty = round(float(row.get("quantity") or 0) + delta, 2)
        if qty <= 0:
            removed = True
            continue

        exp = parse_iso_date(str(row.get("suggested_expiration_date") or ""))
        d_left = days_remaining(exp) if exp else 0
        next_row = dict(row)
        next_row["quantity"] = qty
        next_row["status"] = status_from_days(d_left)
        next_row["days_remaining"] = d_left
        next_row["updated_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        updated_item = next_row
        next_rows.append(next_row)

    if len(next_rows) == len(rows) and not removed and updated_item is None:
        raise HTTPException(status_code=404, detail="inventory item not found.")

    store.set_user_list("inventory", user_id, next_rows)

    if removed:
        notices = store.get_user_list("notifications", user_id)
        notices = [n for n in notices if str(n.get("inventory_item_id")) != str(item_id)]
        store.set_user_list("notifications", user_id, notices)

    return {"data": {"updated_item": updated_item, "removed": removed}}


@router.get("/summary")
async def summary(
    request: Request,
    user_id: str = Query(default=DEFAULT_USER_ID),
) -> dict:
    store = request.app.state.store
    rows = store.get_user_list("inventory", user_id)
    return {"data": {"summary": _summary(rows)}}
