import type {
  ApiEnvelope,
  InventoryItem,
  InventorySummary,
  NotificationItem,
  NotificationPreferences,
  StorageType
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = raw?.detail || raw?.error || `HTTP ${res.status}`;
    throw new Error(String(detail));
  }
  return raw as T;
}

export async function getHealth(): Promise<{ status: string; timestamp: string }> {
  return request<{ status: string; timestamp: string }>("/health");
}

export async function listInventory(userId: string): Promise<InventoryItem[]> {
  const q = new URLSearchParams({ user_id: userId });
  const data = await request<ApiEnvelope<{ items: InventoryItem[]; count: number }>>(
    `/api/v1/inventory/items?${q.toString()}`
  );
  return data.data.items || [];
}

export async function createInventoryItem(payload: {
  user_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  storage_type: StorageType;
  purchased_at?: string | null;
}): Promise<InventoryItem> {
  const data = await request<ApiEnvelope<{ item: InventoryItem }>>("/api/v1/inventory/items", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.data.item;
}

export async function adjustInventoryItem(
  userId: string,
  itemId: string,
  delta: number
): Promise<{ updated_item: InventoryItem | null; removed: boolean }> {
  const data = await request<ApiEnvelope<{ updated_item: InventoryItem | null; removed: boolean }>>(
    `/api/v1/inventory/items/${encodeURIComponent(itemId)}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        delta_quantity: delta
      })
    }
  );
  return data.data;
}

export async function getInventorySummary(userId: string): Promise<InventorySummary> {
  const q = new URLSearchParams({ user_id: userId });
  const data = await request<ApiEnvelope<{ summary: InventorySummary }>>(
    `/api/v1/inventory/summary?${q.toString()}`
  );
  return data.data.summary;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const q = new URLSearchParams({ user_id: userId });
  const data = await request<ApiEnvelope<NotificationPreferences>>(
    `/api/v1/notifications/preferences?${q.toString()}`
  );
  return data.data;
}

export async function saveNotificationPreferences(
  userId: string,
  dayOffset: number
): Promise<NotificationPreferences> {
  const data = await request<ApiEnvelope<NotificationPreferences>>("/api/v1/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      day_offset: dayOffset,
      apply_to_existing: true
    })
  });
  return data.data;
}

export async function listNotifications(userId: string): Promise<NotificationItem[]> {
  const q = new URLSearchParams({ user_id: userId, status: "pending" });
  const data = await request<ApiEnvelope<{ items: NotificationItem[]; count: number }>>(
    `/api/v1/notifications?${q.toString()}`
  );
  return data.data.items || [];
}

export async function runDueNotifications(userId: string): Promise<{ sent_count: number; as_of_datetime: string }> {
  const data = await request<ApiEnvelope<{ sent_count: number; as_of_datetime: string }>>(
    "/api/v1/notifications/run-due",
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId })
    }
  );
  return data.data;
}
