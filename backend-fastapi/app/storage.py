from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any


class JsonStore:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write(
                {
                    "inventory": {},
                    "notifications": {},
                    "notification_preferences": {},
                }
            )

    def _read(self) -> dict[str, Any]:
        with self.path.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def _write(self, data: dict[str, Any]) -> None:
        with self.path.open("w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)

    def get_user_list(self, namespace: str, user_id: str) -> list[dict[str, Any]]:
        with self.lock:
            data = self._read()
            ns = data.setdefault(namespace, {})
            rows = ns.get(user_id, [])
            if isinstance(rows, list):
                return rows
            return []

    def set_user_list(self, namespace: str, user_id: str, rows: list[dict[str, Any]]) -> None:
        with self.lock:
            data = self._read()
            ns = data.setdefault(namespace, {})
            ns[user_id] = rows
            self._write(data)

    def get_user_obj(self, namespace: str, user_id: str) -> dict[str, Any] | None:
        with self.lock:
            data = self._read()
            ns = data.setdefault(namespace, {})
            value = ns.get(user_id)
            if isinstance(value, dict):
                return value
            return None

    def set_user_obj(self, namespace: str, user_id: str, value: dict[str, Any]) -> None:
        with self.lock:
            data = self._read()
            ns = data.setdefault(namespace, {})
            ns[user_id] = value
            self._write(data)
