# Fridge MVP API Skeleton

문서 기획(`PRODUCT_PLAN_KO.md`)을 바로 실행할 수 있도록 만든 FastAPI 기반 초기 백엔드입니다.

## 실행
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 주요 엔드포인트
- `POST /ingredients/detect`: 인식 후보 반환(현재는 목업 데이터)
- `POST /ingredients/confirm`: 사용자 확정 식재료 저장
- `GET /ingredients`: 현재 인벤토리 조회
- `GET /recipes/recommendations`: 추천 레시피 조회(목업)

## 테스트
```bash
pytest -q
```
