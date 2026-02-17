from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import DATA_FILE, get_cors_allow_origins
from app.routers.health import router as health_router
from app.routers.inventory import router as inventory_router
from app.routers.notifications import router as notifications_router
from app.storage import JsonStore

app = FastAPI(
    title="Teddy FastAPI API",
    version="0.1.0",
    description="Migration backend for Teddy MVP using FastAPI + Pydantic.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.store = JsonStore(DATA_FILE)

app.include_router(health_router)
app.include_router(inventory_router)
app.include_router(notifications_router)


@app.get("/")
async def root() -> dict:
    return {
        "name": "teddy-fastapi",
        "status": "ok",
        "docs": "/docs",
    }
