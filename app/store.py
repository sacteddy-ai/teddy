from __future__ import annotations

from datetime import datetime

from app.models import Ingredient, IngredientCreate


class InMemoryStore:
    def __init__(self) -> None:
        self._ingredients: list[Ingredient] = []
        self._next_id = 1

    def add_ingredients(self, payloads: list[IngredientCreate]) -> list[Ingredient]:
        created: list[Ingredient] = []
        for payload in payloads:
            ingredient = Ingredient(
                id=self._next_id,
                name=payload.name,
                category=payload.category,
                quantity=payload.quantity,
                unit=payload.unit,
                expires_at=payload.expires_at,
                expiry_source=payload.expiry_source,
                detected_at=datetime.utcnow(),
                status=self._status_from_expiry(payload.expires_at),
            )
            self._ingredients.append(ingredient)
            created.append(ingredient)
            self._next_id += 1
        return created

    def list_ingredients(self) -> list[Ingredient]:
        return self._ingredients

    @staticmethod
    def _status_from_expiry(expires_at: datetime | None) -> str:
        if not expires_at:
            return "여유"

        diff_days = (expires_at.date() - datetime.utcnow().date()).days
        if diff_days < 0:
            return "만료"
        if diff_days <= 3:
            return "임박"
        return "여유"


store = InMemoryStore()
