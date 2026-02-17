from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


StorageType = Literal["refrigerated", "frozen", "room"]
InventoryStatus = Literal["fresh", "expiring_soon", "expired"]
NotificationStatus = Literal["pending", "sent"]


class ApiError(BaseModel):
    error: str


class InventoryItem(BaseModel):
    id: str
    user_id: str
    ingredient_name: str
    ingredient_key: str
    quantity: float
    unit: str = "ea"
    storage_type: StorageType = "refrigerated"
    purchased_at: str
    suggested_expiration_date: str
    expiration_source: str
    status: InventoryStatus
    days_remaining: int
    created_at: str
    updated_at: str


class InventoryCreateRequest(BaseModel):
    user_id: str = Field(default="demo-user")
    ingredient_name: str
    quantity: float = Field(default=1.0, gt=0)
    unit: str = "ea"
    storage_type: StorageType = "refrigerated"
    purchased_at: Optional[str] = None
    product_shelf_life_days: Optional[int] = Field(default=None, ge=1)
    ocr_expiration_date: Optional[str] = None


class InventoryAdjustRequest(BaseModel):
    user_id: str = Field(default="demo-user")
    delta_quantity: float


class InventoryListResponseData(BaseModel):
    items: list[InventoryItem]
    count: int


class InventorySummaryModel(BaseModel):
    total_items: int
    fresh_count: int
    expiring_soon_count: int
    expired_count: int
    total_quantity: float


class InventorySummaryResponseData(BaseModel):
    summary: InventorySummaryModel


class NotificationItem(BaseModel):
    id: str
    user_id: str
    inventory_item_id: str
    notify_type: str
    days_before_expiration: int
    scheduled_at: str
    sent_at: Optional[str] = None
    status: NotificationStatus = "pending"
    created_at: str


class NotificationPreferencesPayload(BaseModel):
    user_id: str = Field(default="demo-user")
    day_offset: Optional[int] = None
    day_offsets: Optional[list[int]] = None
    apply_to_existing: bool = True


class NotificationPreferencesModel(BaseModel):
    day_offsets: list[int]
    custom_day_presets: list[int] = []
    updated_at: Optional[str] = None
    default_day_offsets: list[int] = [3]
    min_day_offset: int = 0
    max_day_offset: int = 60


class RunDuePayload(BaseModel):
    user_id: str = Field(default="demo-user")
    as_of_datetime: Optional[datetime] = None
