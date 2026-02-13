from fastapi import FastAPI

from app.models import ConfirmRequest, DetectCandidate, DetectResponse, RecipeRecommendation
from app.store import store

app = FastAPI(title="Fridge MVP API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingredients/detect", response_model=DetectResponse)
def detect_ingredients() -> DetectResponse:
    # NOTE: MVP skeleton - replace with vision API/SAM pipeline.
    return DetectResponse(
        candidates=[
            DetectCandidate(name="토마토", category="vegetable", quantity=3, unit="ea", confidence=0.86),
            DetectCandidate(name="우유", category="dairy", quantity=1, unit="pack", confidence=0.78),
        ]
    )


@app.post("/ingredients/confirm")
def confirm_ingredients(request: ConfirmRequest):
    created = store.add_ingredients(request.ingredients)
    return {"count": len(created), "ingredients": created}


@app.get("/ingredients")
def get_ingredients():
    return {"ingredients": store.list_ingredients()}


@app.get("/recipes/recommendations", response_model=list[RecipeRecommendation])
def get_recipe_recommendations() -> list[RecipeRecommendation]:
    return [
        RecipeRecommendation(
            recipe_id=1,
            title="토마토 오믈렛",
            match_score=0.82,
            missing_ingredients=["계란"],
        ),
        RecipeRecommendation(
            recipe_id=2,
            title="크림 토마토 파스타",
            match_score=0.68,
            missing_ingredients=["파스타면", "생크림"],
        ),
    ]
