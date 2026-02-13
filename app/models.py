from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class IngredientBase(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = "etc"
    quantity: float = 1
    unit: str = "ea"


class IngredientCreate(IngredientBase):
    expires_at: datetime | None = None
    expiry_source: str = "default_db"


class Ingredient(IngredientCreate):
    id: int
    detected_at: datetime
    status: str


class DetectCandidate(IngredientBase):
    confidence: float = 0.7


class DetectResponse(BaseModel):
    candidates: List[DetectCandidate]


class ConfirmRequest(BaseModel):
    ingredients: List[IngredientCreate]


class RecipeRecommendation(BaseModel):
    recipe_id: int
    title: str
    match_score: float
    missing_ingredients: list[str]
