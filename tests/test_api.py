from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_detect_and_confirm_flow() -> None:
    detect_res = client.post("/ingredients/detect")
    assert detect_res.status_code == 200
    assert len(detect_res.json()["candidates"]) >= 1

    payload = {
        "ingredients": [
            {
                "name": "토마토",
                "category": "vegetable",
                "quantity": 2,
                "unit": "ea",
                "expiry_source": "manual",
            }
        ]
    }
    confirm_res = client.post("/ingredients/confirm", json=payload)
    assert confirm_res.status_code == 200
    assert confirm_res.json()["count"] == 1

    list_res = client.get("/ingredients")
    assert list_res.status_code == 200
    assert len(list_res.json()["ingredients"]) >= 1


def test_recipe_recommendations() -> None:
    response = client.get("/recipes/recommendations")
    assert response.status_code == 200
    assert len(response.json()) >= 1
