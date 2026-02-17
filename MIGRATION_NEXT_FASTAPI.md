# Migration Plan: Next.js + TypeScript / FastAPI + Pydantic

## Goal

Move from:

- Frontend: Vanilla HTML/CSS/JS (`web/`)
- Backend: Cloudflare Functions JS + PowerShell legacy

To:

- Frontend: Next.js + TypeScript (`frontend-next/`)
- Backend: FastAPI + Pydantic (`backend-fastapi/`)

## What is implemented now

### Backend (`backend-fastapi`)

- `GET /health`
- `GET /api/v1/inventory/items`
- `POST /api/v1/inventory/items`
- `POST /api/v1/inventory/items/{item_id}/adjust`
- `GET /api/v1/inventory/summary`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/preferences`
- `POST /api/v1/notifications/preferences`
- `POST /api/v1/notifications/run-due`

Data is persisted in local JSON file (`backend-fastapi/storage/teddy_data.json` by default).

### Frontend (`frontend-next`)

- User/health toolbar
- Summary cards
- Add inventory item form
- Inventory list with:
  - `- / +` quantity step
  - direct quantity input (`Enter` and blur commit)
- Notification day setting (single day)
- Pending notifications list

## Compatibility strategy

- Keep existing `/api/v1/...` route shape to reduce frontend rewrite risk.
- Migrate high-usage flows first (inventory + alert preferences).
- Add the remaining routes incrementally while keeping the old stack online.

## Next migration tasks

1. Port capture session APIs (`/api/v1/capture/...`) to FastAPI.
2. Port vision analyze API (`/api/v1/vision/analyze`) with OpenAI image input.
3. Port recommendations/shopping endpoints and scoring logic.
4. Move alias/review-queue learning pipeline.
5. Add auth, DB (PostgreSQL), and push delivery worker.
