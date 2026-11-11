"""AfterBody API — 엔진을 웹 화면에서 부르는 창구.

실행:  uvicorn api.main:app --reload --port 8000
문서:  http://localhost:8000/docs  (자동 생성, 직접 눌러서 테스트 가능)
"""
import sqlite3
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from engine import DrinkInput, ExerciseInput, FoodInput, MealInput, Person, Scenario, simulate
from engine import config as C
from engine.ask import ask
from engine.foods import lookup
from engine.recommend import recommend

app = FastAPI(title="AfterBody API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


# ── 요청 스키마 (엔진 dataclass와 1:1)
class PersonIn(BaseModel):
    sex: Literal[1, 2]
    age: float = Field(ge=19, le=90)
    height_cm: float = Field(ge=120, le=220)
    weight_kg: float = Field(ge=30, le=250)
    smoking: Literal["never", "former", "current"] = "never"
    activity: Literal["비활동적", "저활동적", "활동적", "매우활동적"] = "저활동적"
    sbp: Optional[float] = Field(default=None, ge=70, le=250)
    usual_alcohol_g_per_day: float = Field(default=0, ge=0, le=500)
    bmr_kcal: Optional[float] = Field(default=None, ge=600, le=4000)       # 인바디 기초대사량
    body_fat_pct: Optional[float] = Field(default=None, ge=2, le=70)       # 인바디 체지방률
    skeletal_muscle_kg: Optional[float] = Field(default=None, ge=5, le=80) # 인바디 골격근량


class FoodIn(BaseModel):
    query: str = Field(min_length=1, max_length=50)
    grams: Optional[float] = Field(default=None, gt=0, le=5000)
    choice: int = Field(default=0, ge=0, le=10)


class DrinkIn(BaseModel):
    name: str
    servings: float = Field(default=1, gt=0, le=50)


class ExerciseIn(BaseModel):
    name: str
    minutes: float = Field(gt=0, le=600)
    hour: Optional[float] = Field(default=None, ge=0, le=24)


class MealIn(BaseModel):
    mode: Literal["usual", "custom", "skip"] = "usual"   # 평소대로 / 직접 입력 / 거름
    foods: list[FoodIn] = []
    hour: Optional[float] = Field(default=None, ge=0, le=24)


class ScenarioIn(BaseModel):
    name: str = Field(max_length=40)
    meals: dict[Literal["breakfast", "lunch", "dinner", "snack"], MealIn] = {}
    drink_start_hour: Optional[float] = Field(default=None, ge=0, le=24)
    foods: list[FoodIn] = []          # 이전 방식: 저녁 음식
    drinks: list[DrinkIn] = []
    exercises: list[ExerciseIn] = []
    start_hour: float = Field(default=19, ge=0, le=24)
    drink_hours: float = Field(default=2, gt=0, le=12)
    times_per_week: float = Field(default=1, ge=0, le=21)


class SimulateIn(BaseModel):
    person: PersonIn
    scenarios: list[ScenarioIn] = Field(min_length=1, max_length=4)


# ── 엔드포인트
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/catalog")
def catalog():
    """화면의 선택 목록 (주류·운동)"""
    con = sqlite3.connect(C.DB)
    try:
        drinks = [{"name": n, "unit": u, "ml": ml, "kcal": k} for n, u, ml, k in
                  con.execute("SELECT name, serving_unit, serving_ml, serving_kcal FROM ref_alcohol")]
        exercises = [{"name": n, "category": c, "met": m} for n, c, m in
                     con.execute("SELECT name, category, met FROM ref_exercise WHERE category != '생활'")]
    finally:
        con.close()
    return {"drinks": drinks, "exercises": exercises}


@app.get("/api/foods/search")
def food_search(q: str = Query(min_length=1, max_length=50)):
    """음식 후보 (화면 자동완성용으로 필요한 필드만)"""
    res = lookup(q)
    return {"mode": res["mode"], "items": [
        {"type": it["type"], "name": it["name"],
         **({"unit": it["unit"], "kcal_per_100": it["kcal"]["med"] if it["kcal"] else None,
             "portion_g": it["portion_g"]["med"] if it["portion_g"] else None,
             "confidence": it["confidence"], "examples": it["examples"]} if it["type"] == "food"
            else {"kcal": it["serving_kcal"], "unit": it["serving_unit"]})}
        for it in res["items"]]}


def _to_engine(body: SimulateIn):
    p = Person(**body.person.model_dump())
    scenarios = [Scenario(
        name=s.name,
        foods=[FoodInput(**f.model_dump()) for f in s.foods],
        drinks=[DrinkInput(**d.model_dump()) for d in s.drinks],
        exercises=[ExerciseInput(**e.model_dump()) for e in s.exercises],
        start_hour=s.start_hour, drink_hours=s.drink_hours, times_per_week=s.times_per_week,
        drink_start_hour=s.drink_start_hour,
        meals={slot: MealInput(m.mode, [FoodInput(**f.model_dump()) for f in m.foods], m.hour)
               for slot, m in s.meals.items()},
    ) for s in body.scenarios]
    return p, scenarios


@app.post("/api/simulate")
def run(body: SimulateIn):
    p, scenarios = _to_engine(body)
    return simulate(p, scenarios, n_sim=400)


@app.post("/api/recommend")
def recommend_tips(body: SimulateIn):
    """선택지마다 효과 큰 대안 최대 3개 (+ 모두 적용 시 효과)"""
    p, scenarios = _to_engine(body)
    return {"results": recommend(p, scenarios)}


@app.get("/api/ask")
def ask_coach(q: str = Query(min_length=1, max_length=100), weight: float = Query(65, ge=30, le=250),
              sex: Literal[1, 2] = 1):
    """바디쌤: 음식 영양성분·운동·술·건강 상식 질문 (AI 미사용, DB 기반)"""
    return ask(q, weight, sex)


# 빌드된 화면(web/dist)이 있으면 http://localhost:8000 에서 바로 열림 (Node.js 불필요)
_WEB = C.ROOT / "web" / "dist"
if (_WEB / "index.html").exists():
    app.mount("/", StaticFiles(directory=_WEB, html=True), name="web")
