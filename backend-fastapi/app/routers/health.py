from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z"}
