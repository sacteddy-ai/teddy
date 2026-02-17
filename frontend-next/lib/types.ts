export type StorageType = "refrigerated" | "frozen" | "room";
export type InventoryStatus = "fresh" | "expiring_soon" | "expired";

export type InventoryItem = {
  id: string;
  user_id: string;
  ingredient_name: string;
  ingredient_key: string;
  quantity: number;
  unit: string;
  storage_type: StorageType;
  purchased_at: string;
  suggested_expiration_date: string;
  expiration_source: string;
  status: InventoryStatus;
  days_remaining: number;
  created_at: string;
  updated_at: string;
};

export type InventorySummary = {
  total_items: number;
  fresh_count: number;
  expiring_soon_count: number;
  expired_count: number;
  total_quantity: number;
};

export type NotificationItem = {
  id: string;
  user_id: string;
  inventory_item_id: string;
  notify_type: string;
  days_before_expiration: number;
  scheduled_at: string;
  sent_at: string | null;
  status: "pending" | "sent";
  created_at: string;
};

export type NotificationPreferences = {
  day_offsets: number[];
  custom_day_presets: number[];
  updated_at: string | null;
  default_day_offsets: number[];
  min_day_offset: number;
  max_day_offset: number;
};

export type ApiEnvelope<T> = {
  data: T;
};
