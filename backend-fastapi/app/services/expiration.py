from __future__ import annotations

from datetime import date, datetime, timedelta

from app.models import InventoryStatus, StorageType


DEFAULT_SHELF_LIFE_BY_STORAGE: dict[StorageType, int] = {
    "refrigerated": 7,
    "frozen": 30,
    "room": 60,
}

COMMON_SHELF_LIFE: dict[str, int] = {
    "egg": 21,
    "milk": 7,
    "tofu": 5,
    "kimchi": 30,
    "onion": 30,
    "green_onion": 7,
    "potato": 30,
    "sweet_potato": 21,
}


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def today_iso() -> str:
    return date.today().isoformat()


def slug_key(name: str) -> str:
    key = (name or "").strip().lower()
    return "_".join([part for part in key.replace("-", " ").split() if part])


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    raw = str(value).strip()[:10]
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def normalize_storage(value: str | None) -> StorageType:
    raw = (value or "").strip().lower()
    if raw == "frozen":
        return "frozen"
    if raw == "room":
        return "room"
    return "refrigerated"


def days_remaining(expiration_date: date, as_of: date | None = None) -> int:
    base = as_of or date.today()
    return (expiration_date - base).days


def status_from_days(days: int) -> InventoryStatus:
    if days < 0:
        return "expired"
    if days <= 3:
        return "expiring_soon"
    return "fresh"


def suggest_expiration_date(
    ingredient_name: str,
    purchased_at: str | None,
    storage_type: str | None,
    ocr_expiration_date: str | None = None,
    product_shelf_life_days: int | None = None,
) -> tuple[date, str, str]:
    purchase = parse_iso_date(purchased_at) or date.today()

    ocr_date = parse_iso_date(ocr_expiration_date)
    if ocr_date:
        return ocr_date, "ocr", purchase.isoformat()

    if isinstance(product_shelf_life_days, int) and product_shelf_life_days > 0:
        return purchase + timedelta(days=product_shelf_life_days), "product_rule", purchase.isoformat()

    storage = normalize_storage(storage_type)
    ingredient_key = slug_key(ingredient_name)
    life = COMMON_SHELF_LIFE.get(ingredient_key, DEFAULT_SHELF_LIFE_BY_STORAGE[storage])
    return purchase + timedelta(days=life), "avg_rule", purchase.isoformat()
