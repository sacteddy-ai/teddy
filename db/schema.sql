-- PostgreSQL schema for refrigerator inventory + expiration management.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingredient_shelf_life_rules (
  id bigserial primary key,
  ingredient_key text not null,
  ingredient_display_name text not null,
  storage_type text not null check (storage_type in ('refrigerated', 'frozen', 'room')),
  condition_type text not null check (condition_type in ('unopened', 'opened')),
  min_days integer not null check (min_days > 0),
  max_days integer not null check (max_days >= min_days),
  avg_days integer not null check (avg_days >= min_days and avg_days <= max_days),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  source text not null,
  updated_at timestamptz not null default now(),
  unique (ingredient_key, storage_type, condition_type)
);

create table if not exists product_shelf_life_profiles (
  id bigserial primary key,
  barcode text unique,
  product_name text not null,
  storage_type text not null check (storage_type in ('refrigerated', 'frozen', 'room')),
  shelf_life_days integer not null check (shelf_life_days > 0),
  source text not null,
  updated_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ingredient_key text not null,
  ingredient_display_name text not null,
  quantity numeric(10, 2) not null default 1,
  unit text not null default 'ea',
  storage_type text not null check (storage_type in ('refrigerated', 'frozen', 'room')),
  purchased_at date not null,
  opened_at date,
  ocr_expiration_date date,
  product_profile_id bigint references product_shelf_life_profiles(id),
  suggested_expiration_date date not null,
  expiration_source text not null check (expiration_source in ('ocr', 'product_profile', 'average_rule')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null check (status in ('fresh', 'expiring_soon', 'expired')) default 'fresh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opened_at is null or opened_at >= purchased_at)
);

create table if not exists ocr_scan_results (
  id bigserial primary key,
  inventory_item_id uuid references inventory_items(id) on delete cascade,
  raw_text text not null,
  parsed_expiration_date date,
  parser_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  notify_d_minus_3 boolean not null default true,
  notify_d_minus_1 boolean not null default true,
  notify_d_day boolean not null default true,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  notify_type text not null check (notify_type in ('d_minus_3', 'd_minus_1', 'd_day')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null check (status in ('pending', 'sent', 'failed')) default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists recipes (
  id text primary key,
  recipe_name text not null,
  chef text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id bigserial primary key,
  recipe_id text not null references recipes(id) on delete cascade,
  ingredient_key text not null,
  is_optional boolean not null default false,
  unique (recipe_id, ingredient_key, is_optional)
);

create table if not exists shopping_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ingredient_key text not null,
  reasons text[] not null default '{}',
  priority integer not null check (priority > 0),
  related_recipe_ids text[] not null default '{}',
  suggested_at timestamptz not null default now()
);

create table if not exists capture_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('open', 'finalized')) default 'open',
  created_inventory_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists capture_session_draft_items (
  id bigserial primary key,
  session_id uuid not null references capture_sessions(id) on delete cascade,
  ingredient_key text not null,
  ingredient_name text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null default 'ea',
  source text not null default 'chat_text',
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  updated_at timestamptz not null default now(),
  unique (session_id, ingredient_key)
);

create table if not exists capture_session_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  source_type text not null check (source_type in ('text', 'voice', 'vision')),
  text text,
  vision_detected_items text[] not null default '{}',
  parsed_command_count integer not null default 0,
  finalize_requested boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_items_user_status
  on inventory_items (user_id, status);

create index if not exists idx_inventory_items_expiration
  on inventory_items (suggested_expiration_date);

create index if not exists idx_rules_lookup
  on ingredient_shelf_life_rules (ingredient_key, storage_type, condition_type);

create index if not exists idx_recipe_ingredients_lookup
  on recipe_ingredients (ingredient_key);

create index if not exists idx_shopping_suggestions_user_priority
  on shopping_suggestions (user_id, priority, suggested_at desc);

create index if not exists idx_capture_sessions_user_status
  on capture_sessions (user_id, status, updated_at desc);

create index if not exists idx_capture_session_turns_session_created
  on capture_session_turns (session_id, created_at desc);
