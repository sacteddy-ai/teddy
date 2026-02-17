from __future__ import annotations

import os
from pathlib import Path


def _default_data_file() -> str:
    here = Path(__file__).resolve().parent.parent
    return str(here / "storage" / "teddy_data.json")


DATA_FILE = os.getenv("TEDDY_DATA_FILE", _default_data_file())
DEFAULT_USER_ID = "demo-user"
DEFAULT_NOTIFICATION_DAY_OFFSET = 3
MIN_NOTIFICATION_DAY_OFFSET = 0
MAX_NOTIFICATION_DAY_OFFSET = 60


def get_cors_allow_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").strip()
    if not raw:
        return ["*"]
    return [entry.strip() for entry in raw.split(",") if entry.strip()]
