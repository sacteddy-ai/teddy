# Teddy FastAPI Backend (Migration Track)

This is the migration backend using `FastAPI + Pydantic`.

It keeps the existing API style (`/api/v1/...`) for key flows:

- `GET /health`
- `GET/POST /api/v1/inventory/items`
- `POST /api/v1/inventory/items/{item_id}/adjust`
- `GET /api/v1/inventory/summary`
- `GET /api/v1/notifications`
- `GET/POST /api/v1/notifications/preferences`
- `POST /api/v1/notifications/run-due`

## Run

```bash
cd backend-fastapi
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docs:

- `http://localhost:8000/docs`

## Storage

- Local JSON file storage (default: `backend-fastapi/storage/teddy_data.json`)
- Configure with `TEDDY_DATA_FILE` environment variable.
