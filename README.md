# Teddy MVP Backend

PowerShell-based backend MVP for refrigerator inventory, conversational capture, expiration suggestions, and alerts.

## What is implemented

- Expiration suggestion logic
  - Priority: `OCR date > product shelf-life days > average shelf-life rule`
- OCR text date parser
- Inventory APIs
  - Create item
  - List items
  - Summary by status
  - Consume item quantity
- Notification APIs
  - List notifications
  - Dispatch due notifications (`pending -> sent`)
- Recipe recommendation API
- Shopping suggestion API
- Conversational capture session API (voice/text/vision hybrid)
- One-shot chat intake API (text only or text + vision items)
- AI vision analyze API (image -> ingredient list -> optional capture session append)
- Optional SAM3 HTTP segmentation hook (`segmentation_mode=sam3_http`)
- Ingredient matching with multilingual aliases + fuzzy typo fallback
- Unknown/low-confidence ingredient review queue
- Alias auto-learning endpoint (writes to `ingredient_alias_overrides.json`)
- Capture finalize auto-maps unknown pending phrases (reason=`unknown`) to custom ingredient keys and creates inventory
- Local JSON storage for quick MVP iteration

## Project structure

```text
api/
  openapi.yaml
db/
  schema.sql
  seeds/ingredient_shelf_life_rules.sql
  seeds/recipes.sql
scripts/
  sync-ingredient-aliases.ps1
  test-alias-sync.ps1
  test-chat-ingestion-engine.ps1
  test-expiration-engine.ps1
  test-ingredient-learning.ps1
  test-inventory-engine.ps1
  test-mvp-workflow.ps1
  test-recommendation-engine.ps1
  test-vision-engine.ps1
src/
  api/server.ps1
  chat/ChatIngestionEngine.psm1
  data/Store.psm1
  data/ingredient_aliases.json
  data/ingredient_alias_overrides.json
  data/ingredient_alias_sync_map.json
  data/recipes.json
  data/shopping_baseline.json
  data/shelf_life_rules.json
  expiration/ExpirationEngine.psm1
  inventory/InventoryEngine.psm1
  notifications/NotificationEngine.psm1
  ocr/OcrDateParser.psm1
  recommendation/RecommendationEngine.psm1
  vision/VisionEngine.psm1
web/
  index.html
  styles.css
  app.js
storage/
  (auto-created at runtime)
```

## Run server

```powershell
powershell -ExecutionPolicy Bypass -File .\src\api\server.ps1 -Prefix http://localhost:8080/
```

Open dashboard:

`http://localhost:8080/`

If any API call fails, the dashboard now shows an inline error banner instead of browser popup alerts.

Mobile testing note:

- Photo capture via the file input works on most phones.
- Live camera preview (getUserMedia) typically requires HTTPS when opened from a phone. For quick hackathon testing, use an HTTPS tunnel that forwards to `http://localhost:8080/`:
  - Cloudflare Tunnel (recommended): `cloudflared tunnel --url http://localhost:8080`
  - ngrok: `ngrok http 8080`

If you host the dashboard separately (e.g. Cloudflare Pages), set the dashboard "Remote API Base URL" to your tunnel URL and enable CORS on the API server:

```powershell
$env:ENABLE_CORS = "1"
# optional (recommended): restrict to your Pages domain instead of "*"
$env:CORS_ALLOW_ORIGIN = "https://your-project.pages.dev"
```

## Deploy (Cloudflare Pages + Functions)

This repo also includes a Cloudflare Pages Functions backend under `functions/`, so you can deploy the dashboard + API together on Cloudflare (no local server).

1. Push this repo to GitHub.
1. Cloudflare Dashboard -> `Workers & Pages` -> `Pages` -> `Create a project` -> `Connect to Git`.
1. Build settings:
   - Framework preset: `None`
   - Build command: (empty)
   - Build output directory: `web`
1. Bindings (Project -> Settings -> Functions):
   - Add a KV Namespace binding named `TEDDY_KV` (create a new namespace).
1. Optional (Vision):
   - Add an environment variable / secret `OPENAI_API_KEY`.
   - Optional: `OPENAI_VISION_MODEL` (default: `gpt-4.1-mini`), `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`).
1. Optional (LLM text extraction for cleaner Korean capture):
   - Add `OPENAI_ENABLE_CHAT_LLM_EXTRACTOR=true` to extract only food items from free-form speech/text.
   - Optional: `OPENAI_TEXT_EXTRACTOR_MODEL` (default: `gpt-4.1-mini`).
1. Deploy and open your Pages URL (e.g. `https://your-project.pages.dev`).

Static data used by the Cloudflare backend is served from `web/data/*.json`.

Recipe recommendation sources:

- Base recipe catalog: `web/data/recipes.json`
- Optional YouTube-derived catalog: `web/data/recipes_youtube.json`
  - The backend merges both files when building recommendations.
  - You can paste recipes extracted from YouTube description ingredient lists into `recipes_youtube.json` (schema example is included in that file).
  - Set `source.type = "youtube"` and `source.url` to preserve reference metadata in recommendation responses.
- Optional automatic live search (YouTube Data API):
  - Add `YOUTUBE_API_KEY` and call recommendations with `include_live=true` (default).
  - The API searches YouTube automatically using current inventory terms and returns reference links.
  - Optional tuning: `ENABLE_LIVE_RECIPE_SEARCH=true`, `YOUTUBE_SEARCH_MAX_RESULTS=10`, `YOUTUBE_SEARCH_REGION=KR`.

Vision API environment variables:

```powershell
$env:OPENAI_API_KEY = "sk-..."
# optional
$env:OPENAI_VISION_MODEL = "gpt-4.1-mini"
$env:OPENAI_BASE_URL = "https://api.openai.com/v1"

# optional (recommended): LLM extraction for Conversational Capture (reduces filler words like "옆", "아래칸", "있어")
$env:OPENAI_ENABLE_CHAT_LLM_EXTRACTOR = "true"
$env:OPENAI_TEXT_EXTRACTOR_MODEL = "gpt-4.1-mini"
# optional
$env:OPENAI_TEXT_EXTRACTOR_MAX_ITEMS = "14"
$env:OPENAI_TEXT_EXTRACTOR_MAX_CHARS = "800"
$env:OPENAI_TEXT_EXTRACTOR_CACHE_DAYS = "30"

# optional (LLM): classify pending review phrases as food vs spatial/other (runs only on review queue candidates)
$env:OPENAI_ENABLE_REVIEW_PHRASE_CLASSIFIER = "true"
$env:OPENAI_TEXT_CLASSIFIER_MODEL = "gpt-4.1-mini"
$env:OPENAI_TEXT_CLASSIFIER_MAX_ITEMS = "12"
$env:OPENAI_TEXT_CLASSIFIER_CACHE_DAYS = "30"

# optional (automatic live recipe search from YouTube)
$env:YOUTUBE_API_KEY = "AIza..."
$env:ENABLE_LIVE_RECIPE_SEARCH = "true"
$env:YOUTUBE_SEARCH_MAX_RESULTS = "10"
$env:YOUTUBE_SEARCH_REGION = "KR"

# optional SAM3 segmentation hook
$env:SAM3_SEGMENT_API_URL = "https://your-sam3-service/segment"
$env:SAM3_SEGMENT_API_KEY = "sam3-key"
```

## API endpoints

- `GET /health`
- `POST /api/v1/expiration/suggest`
- `POST /api/v1/admin/reload-ingredient-catalog`
- `POST /api/v1/chat/intake`
- `POST /api/v1/vision/analyze`
- `GET /api/v1/ingredients/catalog`
- `POST /api/v1/ingredients/aliases/learn`
- `GET /api/v1/ingredients/review-queue`
- `POST /api/v1/ingredients/review-queue/{queue_item_id}/resolve`
- `POST /api/v1/capture/sessions/start`
- `GET /api/v1/capture/sessions/{session_id}`
- `POST /api/v1/capture/sessions/{session_id}/message`
- `POST /api/v1/capture/sessions/{session_id}/finalize`
- `POST /api/v1/ocr/parse-date`
- `POST /api/v1/inventory/items`
- `GET /api/v1/inventory/items`
- `POST /api/v1/inventory/ingest`
- `POST /api/v1/inventory/items/{item_id}/consume`
- `GET /api/v1/inventory/summary`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/run-due`
- `GET /api/v1/recommendations/recipes`
- `GET /api/v1/shopping/suggestions`

## Quick request examples

Expiration suggestion:

```powershell
$payload = @{
  ingredient_name = "milk"
  purchased_at = "2026-02-13"
  storage_type = "refrigerated"
  opened_at = $null
  ocr_expiration_date = $null
  product_shelf_life_days = $null
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/expiration/suggest" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json)
```

Create inventory item with OCR text:

```powershell
$payload = @{
  user_id = "demo-user"
  ingredient_name = "milk"
  purchased_at = "2026-02-13"
  storage_type = "refrigerated"
  ocr_raw_text = "BEST BEFORE 2026-02-20"
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/inventory/items" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json)
```

Run due notifications:

```powershell
$payload = @{
  user_id = "demo-user"
  as_of_datetime = "2026-02-20T09:30:00+09:00"
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/notifications/run-due" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json)
```

Get recipe recommendations:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:8080/api/v1/recommendations/recipes?user_id=demo-user&top_n=5&ui_lang=ko&include_live=true"
```

Get shopping suggestions:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "http://localhost:8080/api/v1/shopping/suggestions?user_id=demo-user&top_n=5&top_recipe_count=3&ui_lang=ko"
```

Consume inventory item:

```powershell
$payload = @{
  consumed_quantity = 1
  mark_opened = $true
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/inventory/items/{item_id}/consume" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json)
```

One-shot chat intake:

```powershell
$payload = @{
  user_id = "demo-user"
  text = "This is tofu. This is kimchi. This is bacon. This is egg."
  purchased_at = "2026-02-13"
  storage_type = "refrigerated"
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/chat/intake" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json)
```

Vision analyze (image -> detected ingredients -> capture session append):

```powershell
# $imageBase64 can be raw base64 or full data URL
$imageBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\sample-fridge.jpg"))

$payload = @{
  user_id = "demo-user"
  session_id = "{capture_session_id}"
  image_base64 = $imageBase64
  mime_type = "image/jpeg"
  text_hint = "냉장고에 새로 넣을 재료들이야"
  auto_apply_to_session = $true
  segmentation_mode = "auto"  # auto | none | sam3_http
}

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/vision/analyze" `
  -ContentType "application/json" `
  -Body ($payload | ConvertTo-Json -Depth 8)
```

Reload ingredient catalog cache (no server restart):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/admin/reload-ingredient-catalog" `
  -ContentType "application/json" `
  -Body "{}"
```

Sync multilingual aliases from Open Food Facts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-ingredient-aliases.ps1

# Then refresh in-memory cache without restart
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/admin/reload-ingredient-catalog" `
  -ContentType "application/json" `
  -Body "{}"
```

Conversational capture session:

```powershell
$start = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/api/v1/capture/sessions/start" `
  -ContentType "application/json" `
  -Body (@{ user_id = "demo-user" } | ConvertTo-Json)

$sessionId = $start.data.session.id

Invoke-RestMethod -Method Post `
  -Uri ("http://localhost:8080/api/v1/capture/sessions/" + $sessionId + "/message") `
  -ContentType "application/json" `
  -Body (@{ source_type = "text"; text = "This is tofu. This is kimchi." } | ConvertTo-Json)

Invoke-RestMethod -Method Post `
  -Uri ("http://localhost:8080/api/v1/capture/sessions/" + $sessionId + "/message") `
  -ContentType "application/json" `
  -Body (@{ source_type = "text"; text = "This is bacon. This is egg. finish" } | ConvertTo-Json)

Invoke-RestMethod -Method Post `
  -Uri ("http://localhost:8080/api/v1/capture/sessions/" + $sessionId + "/finalize") `
  -ContentType "application/json" `
  -Body (@{ purchased_at = "2026-02-13"; storage_type = "refrigerated" } | ConvertTo-Json)
```

Resolve unknown/local ingredient phrase from review queue:

```powershell
# 1) List pending queue items
$queue = Invoke-RestMethod -Method Get `
  -Uri "http://localhost:8080/api/v1/ingredients/review-queue?user_id=demo-user&status=pending&limit=20"

# 2) Map a queue item to a key (this also learns alias into overrides JSON)
$queueItemId = $queue.data.items[0].id

Invoke-RestMethod -Method Post `
  -Uri ("http://localhost:8080/api/v1/ingredients/review-queue/" + $queueItemId + "/resolve") `
  -ContentType "application/json" `
  -Body (@{
    action = "map"
    ingredient_key = "regional_custom_food"
    display_name = "Regional Custom Food"
    user_id = "demo-user"
    apply_to_session = $true
  } | ConvertTo-Json)
```

## Test scripts

Expiration engine tests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-expiration-engine.ps1
```

Chat ingestion tests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-chat-ingestion-engine.ps1
```

Inventory consume tests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-inventory-engine.ps1
```

Workflow test (OCR + inventory + notifications):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-mvp-workflow.ps1
```

Recommendation and shopping tests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-recommendation-engine.ps1
```

Alias sync test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-alias-sync.ps1
```

Ingredient auto-learning test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-ingredient-learning.ps1
```

Vision engine tests (mocked HTTP; no real API key required):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-vision-engine.ps1
```

## Notes

- This MVP stores data in local JSON files under `storage/`.
- `db/schema.sql` and seed files are included for migration to a real DB (PostgreSQL).
- Add multilingual ingredient synonyms in `src/data/ingredient_aliases.json` to expand text/voice/vision recognition coverage.
- Add region-specific manual synonyms in `src/data/ingredient_alias_overrides.json` (for local foods not in global taxonomy).
- Unknown/low-confidence phrases are stored in `storage/ingredient_review_queue.json` and can be resolved via review-queue APIs or dashboard UI.
- Use `scripts/sync-ingredient-aliases.ps1` to import multilingual aliases from Open Food Facts for mapped ingredient keys.
- After updating alias/rule JSON files, call `POST /api/v1/admin/reload-ingredient-catalog` (or restart the API process).
- Vision labeling uses OpenAI multimodal API; SAM3 is optional and currently integrated as an external HTTP segmenter hook (`SAM3_SEGMENT_API_URL`).
- Next step is to connect a real OCR service and persistent DB.
