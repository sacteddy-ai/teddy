import type {
  ApiEnvelope,
  CaptureMessageResult,
  CapturePayload,
  InventoryItem,
  InventorySummary,
  NotificationItem,
  NotificationPreferences,
  OrderDraftItemInput,
  OrderDraftResult,
  RecipeRecommendationsData,
  ShoppingSuggestionsData,
  StorageType,
  VisionAnalyzeResult
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") {
      continue;
    }
    q.set(k, String(v));
  }
  return q.toString();
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${normalizeApiPath(path)}`, {
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
    throw new ApiError(String(detail), res.status, raw);
  }
  return raw as T;
}

function mapOptionalFeatureError(featureName: string): string {
  return `${featureName} endpoint is not available on current backend.`;
}

export async function getHealth(): Promise<{ status: string; timestamp: string }> {
  return request<{ status: string; timestamp: string }>("/health");
}

export async function listInventory(userId: string): Promise<InventoryItem[]> {
  const q = buildQuery({ user_id: userId });
  const data = await request<ApiEnvelope<{ items: InventoryItem[]; count: number }>>(
    `/api/v1/inventory/items?${q}`
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
  const q = buildQuery({ user_id: userId });
  const data = await request<ApiEnvelope<{ summary: InventorySummary }>>(`/api/v1/inventory/summary?${q}`);
  return data.data.summary;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const q = buildQuery({ user_id: userId });
  const data = await request<ApiEnvelope<NotificationPreferences>>(`/api/v1/notifications/preferences?${q}`);
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
  const q = buildQuery({ user_id: userId, status: "pending" });
  const data = await request<ApiEnvelope<{ items: NotificationItem[]; count: number }>>(
    `/api/v1/notifications?${q}`
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

export async function startCaptureSession(userId: string): Promise<CapturePayload> {
  try {
    const data = await request<ApiEnvelope<CapturePayload>>("/api/v1/capture/sessions/start", {
      method: "POST",
      body: JSON.stringify({ user_id: userId })
    });
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("capture"));
    }
    throw error;
  }
}

export async function getCaptureSession(sessionId: string): Promise<CapturePayload> {
  try {
    const data = await request<ApiEnvelope<CapturePayload>>(
      `/api/v1/capture/sessions/${encodeURIComponent(sessionId)}`
    );
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("capture"));
    }
    throw error;
  }
}

export async function sendCaptureMessage(
  sessionId: string,
  payload: {
    source_type: string;
    text: string;
    vision_detected_items: string[];
  }
): Promise<CaptureMessageResult> {
  try {
    const data = await request<ApiEnvelope<CaptureMessageResult>>(
      `/api/v1/capture/sessions/${encodeURIComponent(sessionId)}/message`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("capture message"));
    }
    throw error;
  }
}

export async function analyzeVision(payload: {
  user_id: string;
  session_id: string;
  image_base64: string;
  text_hint?: string | null;
  ui_lang?: string;
  source_type?: string;
  auto_apply_to_session?: boolean;
  segmentation_mode?: string;
}): Promise<VisionAnalyzeResult> {
  try {
    const data = await request<ApiEnvelope<VisionAnalyzeResult>>("/api/v1/vision/analyze", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("vision"));
    }
    throw error;
  }
}

export async function finalizeCaptureSession(
  sessionId: string,
  payload: {
    user_id: string;
    purchased_at: string;
    storage_type: StorageType;
  }
): Promise<CapturePayload> {
  try {
    const data = await request<ApiEnvelope<{ capture: CapturePayload }>>(
      `/api/v1/capture/sessions/${encodeURIComponent(sessionId)}/finalize`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    return data.data.capture;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("capture finalize"));
    }
    throw error;
  }
}

export async function listRecipeRecommendations(params: {
  user_id: string;
  top_n?: number;
  ui_lang?: "ko" | "en";
  include_live?: boolean;
}): Promise<RecipeRecommendationsData> {
  try {
    const q = buildQuery({
      user_id: params.user_id,
      top_n: params.top_n ?? 8,
      ui_lang: params.ui_lang ?? "ko",
      include_live: params.include_live ?? true
    });
    const data = await request<ApiEnvelope<RecipeRecommendationsData>>(
      `/api/v1/recommendations/recipes?${q}`
    );
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("recipes"));
    }
    throw error;
  }
}

export async function listShoppingSuggestions(params: {
  user_id: string;
  top_n?: number;
  top_recipe_count?: number;
  ui_lang?: "ko" | "en";
}): Promise<ShoppingSuggestionsData> {
  try {
    const q = buildQuery({
      user_id: params.user_id,
      top_n: params.top_n ?? 8,
      top_recipe_count: params.top_recipe_count ?? 3,
      ui_lang: params.ui_lang ?? "ko"
    });
    const data = await request<ApiEnvelope<ShoppingSuggestionsData>>(
      `/api/v1/shopping/suggestions?${q}`
    );
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("shopping"));
    }
    throw error;
  }
}

export async function createShoppingOrderDraft(payload: {
  user_id: string;
  source: string;
  provider: string;
  items: OrderDraftItemInput[];
}): Promise<OrderDraftResult> {
  try {
    const data = await request<ApiEnvelope<OrderDraftResult>>("/api/v1/shopping/order-drafts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return data.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
      throw new Error(mapOptionalFeatureError("shopping order-draft"));
    }
    throw error;
  }
}
