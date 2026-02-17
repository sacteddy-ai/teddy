from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from app.config import (
    DEFAULT_NOTIFICATION_DAY_OFFSET,
    MAX_NOTIFICATION_DAY_OFFSET,
    MIN_NOTIFICATION_DAY_OFFSET,
)
from app.models import NotificationItem


def sanitize_day_offset(value: int | float | None, fallback: int = DEFAULT_NOTIFICATION_DAY_OFFSET) -> int:
    try:
        day = int(round(float(value)))
    except (TypeError, ValueError):
        day = fallback
    if day < MIN_NOTIFICATION_DAY_OFFSET:
        return MIN_NOTIFICATION_DAY_OFFSET
    if day > MAX_NOTIFICATION_DAY_OFFSET:
        return MAX_NOTIFICATION_DAY_OFFSET
    return day


def notify_type_from_day(day_offset: int) -> str:
    if day_offset <= 0:
        return "d_day"
    return f"d_minus_{day_offset}"


def build_notification(
    user_id: str,
    inventory_item_id: str,
    expiration_date_iso: str,
    day_offset: int,
) -> NotificationItem:
    exp = date.fromisoformat(expiration_date_iso[:10])
    day = sanitize_day_offset(day_offset)
    scheduled_date = exp - timedelta(days=day)
    scheduled_dt = datetime.combine(scheduled_date, time(hour=9, minute=0, tzinfo=timezone.utc))
    now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    return NotificationItem(
        id=str(uuid4()),
        user_id=user_id,
        inventory_item_id=inventory_item_id,
        notify_type=notify_type_from_day(day),
        days_before_expiration=day,
        scheduled_at=scheduled_dt.isoformat().replace("+00:00", "Z"),
        sent_at=None,
        status="pending",
        created_at=now,
    )


def dispatch_due(
    notifications: list[dict],
    as_of: datetime,
) -> tuple[list[dict], list[dict]]:
    as_of_utc = as_of.astimezone(timezone.utc)
    pending_rows: list[dict] = []
    sent_rows: list[dict] = []

    for row in notifications:
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "pending")
        if status == "sent":
            continue
        scheduled_raw = str(row.get("scheduled_at") or "").replace("Z", "+00:00")
        try:
            scheduled = datetime.fromisoformat(scheduled_raw)
        except ValueError:
            pending_rows.append(row)
            continue
        if scheduled <= as_of_utc:
            next_row = dict(row)
            next_row["status"] = "sent"
            next_row["sent_at"] = as_of_utc.isoformat().replace("+00:00", "Z")
            sent_rows.append(next_row)
        else:
            pending_rows.append(row)

    return pending_rows, sent_rows
