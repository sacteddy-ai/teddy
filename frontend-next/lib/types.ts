export type StorageType = "refrigerated" | "frozen" | "room";
export type InventoryStatus = "fresh" | "expiring_soon" | "expired";

export type ApiEnvelope<T> = {
  data: T;
  error?: string;
};

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
  fresh_count?: number;
  expiring_soon_count?: number;
  expired_count?: number;
  fresh?: number;
  expiring_soon?: number;
  expired?: number;
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
  custom_day_presets?: number[];
  updated_at: string | null;
  default_day_offsets?: number[];
  min_day_offset?: number;
  max_day_offset?: number;
};

export type CaptureDraftItem = {
  ingredient_key: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
};

export type CaptureSession = {
  id: string;
  user_id: string;
  status: string;
  draft_items: CaptureDraftItem[];
  created_at?: string;
  updated_at?: string;
};

export type CaptureReviewItem = {
  id: string;
  source_phrase?: string;
  normalized_phrase?: string;
  display_name?: string;
  ingredient_key_candidates?: Array<{ ingredient_key: string; display_name?: string; score?: number }>;
  reason?: string;
  seen_count?: number;
};

export type CapturePayload = {
  session: CaptureSession;
  summary?: {
    item_count?: number;
    total_quantity?: number;
  };
  review_queue_items?: CaptureReviewItem[];
  review_queue_count?: number;
};

export type CaptureTurnResult = {
  parsed_command_count?: number;
  review_queue_item_count?: number;
};

export type CaptureMessageResult = {
  capture: CapturePayload;
  turn?: CaptureTurnResult;
  review_queue_count?: number;
};

export type VisionObject = {
  id: string;
  label: string;
  confidence?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type VisionAnalyzeResult = {
  detected_items: string[];
  message?: string;
  capture?: CapturePayload;
  review_queue_count?: number;
  vision?: {
    detected_objects?: VisionObject[];
    segmentation?: {
      provider?: string;
      segment_count?: number;
      warnings?: string[];
    };
  };
};

export type RecipeRecommendationItem = {
  recipe_id: string;
  recipe_name: string;
  chef?: string;
  score?: number;
  match_ratio?: number;
  source_type?: string;
  source_url?: string;
  source_title?: string;
  source_channel?: string;
  source_published_at?: string;
  missing_ingredient_keys?: string[];
};

export type RecipeRecommendationsData = {
  items: RecipeRecommendationItem[];
  count?: number;
  ui_lang?: string;
  live?: {
    include_live?: boolean;
    provider?: string;
    enabled?: boolean;
    count?: number;
    query?: string;
    warning?: string | null;
    error?: string | null;
  };
};

export type ShoppingSuggestionItem = {
  ingredient_key: string;
  ingredient_name?: string;
  priority: number;
  reasons?: string[];
  reason_labels?: string[];
  related_recipe_names?: string[];
  related_recipe_ids?: string[];
  auto_order_candidate?: boolean;
  auto_order_hint?: {
    suggested_quantity?: number;
  };
  usage?: {
    avg_daily_consumption?: number;
    projected_days_left?: number;
  };
};

export type ShoppingSuggestionsData = {
  items: ShoppingSuggestionItem[];
  count?: number;
};

export type OrderDraftItemInput = {
  ingredient_key: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  reasons?: string[];
  priority?: number;
  auto_order_candidate?: boolean;
};

export type OrderDraftResult = {
  draft?: {
    id: string;
    summary?: {
      line_count?: number;
    };
  };
};
