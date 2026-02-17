# Teddy Next.js Frontend (Migration Track)

This is the migration frontend using `Next.js + TypeScript`.

## Prerequisites

- Node.js 18+
- Running backend (`backend-fastapi`) on `http://localhost:8000`

## Run

```bash
cd frontend-next
npm install
cp .env.local.example .env.local
npm run dev
```

Open:

- `http://localhost:3000`

## Environment

- `NEXT_PUBLIC_API_BASE_URL` (default in example: `http://localhost:8000`)
