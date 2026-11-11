"""추천: 시나리오를 조금씩 바꾼 대안을 엔진으로 다시 계산해, 효과가 큰 순서로 돌려준다.

대안 종류 (해당될 때만)
  drink_half  술을 절반으로        drink_none  술 없이
  portion     가장 양이 많은 음식을 2/3로
  walk        30분 빠르게 걷기 추가 (운동이 없을 때)
  less_often  이런 날을 주 1번 줄이기
  combined    위에서 효과 있던 것(술 없이 제외) 모두 적용
"""
import copy
from dataclasses import replace

from .simulate import DrinkInput, ExerciseInput, FoodInput, MealInput, simulate
from . import config as C

WALK = "걷기 빠르게 (5.6km/h)"


def _with_meals(sc, slot, foods):
    meals = copy.deepcopy(sc.meals)
    m = meals[slot]
    meals[slot] = MealInput(m.mode, foods, m.hour)
    return replace(sc, meals=meals)


def _variants(sc):
    out = []
    if sc.drinks:
        half = [DrinkInput(d.name, max(round(d.servings / 2 * 2) / 2, 0.5)) for d in sc.drinks]
        if any(h.servings < d.servings for h, d in zip(half, sc.drinks)):
            out.append(({"kind": "drink_half", "drinks": [vars(h) for h in half]},
                        "술을 절반으로", " · ".join(f"{d.name} {d.servings:g}→{h.servings:g}잔" for d, h in zip(sc.drinks, half)),
                        replace(sc, drinks=half)))
        out.append(({"kind": "drink_none"}, "술 없이", "음주만 빼고 나머지는 그대로", replace(sc, drinks=[])))

    best = None
    for slot, m in sc.meals.items():
        if m.mode == "custom":
            for i, f in enumerate(m.foods):
                if f.grams and (best is None or f.grams > best[2].grams):
                    best = (slot, i, f)
    if best:
        slot, i, f = best
        g = int(round(f.grams * 2 / 3 / 10) * 10)
        foods = [FoodInput(x.query, g if j == i else x.grams, x.choice) for j, x in enumerate(sc.meals[slot].foods)]
        label = C.MEAL_SLOTS[slot][0]
        out.append(({"kind": "portion", "slot": slot, "index": i, "grams": g},
                    f"{label} {f.query} 양 줄이기", f"{f.grams:g}g → {g}g (3분의 2)", _with_meals(sc, slot, foods)))

    if not sc.exercises:
        out.append(({"kind": "walk", "exercise": {"name": WALK, "minutes": 30, "hour": 20.5}},
                    "30분 빠르게 걷기", "저녁 먹고 산책하듯 30분", replace(sc, exercises=[ExerciseInput(WALK, 30, 20.5)])))

    if sc.times_per_week >= 2:
        n = sc.times_per_week
        out.append(({"kind": "less_often", "times_per_week": n - 1},
                    "이런 날을 일주일에 1번 줄이기", f"주 {n:g}번 → {n - 1:g}번", replace(sc, times_per_week=n - 1)))
    return out


def _combine(sc, applies):
    for a in applies:
        k = a["kind"]
        if k == "drink_half":
            sc = replace(sc, drinks=[DrinkInput(**d) for d in a["drinks"]])
        elif k == "portion":
            foods = [FoodInput(x.query, a["grams"] if j == a["index"] else x.grams, x.choice)
                     for j, x in enumerate(sc.meals[a["slot"]].foods)]
            sc = _with_meals(sc, a["slot"], foods)
        elif k == "walk":
            sc = replace(sc, exercises=[ExerciseInput(**a["exercise"])])
        elif k == "less_often":
            sc = replace(sc, times_per_week=a["times_per_week"])
    return sc


def _effect(base, var):
    b, v = base["long_term"][-1], var["long_term"][-1]
    return {"weight_kg": round(v["weight_change_kg"]["med"] - b["weight_change_kg"]["med"], 1),
            "sbp": round(v["sbp_change"]["med"] - b["sbp_change"]["med"], 1),
            "kcal_today": round(var["today"]["kcal"]["med"] - base["today"]["kcal"]["med"]),
            "weight_after_kg": v["weight_change_kg"]["med"]}


def _score(e):
    return -e["weight_kg"] - 0.3 * e["sbp"]


def recommend(person, scenarios, n_sim=150, top=3):
    """시나리오마다 효과 큰 순서의 추천(최대 top개)과 '모두 적용' 결과."""
    out = []
    for sc in scenarios:
        vs = _variants(sc)
        if not vs:
            out.append({"scenario": sc.name, "tips": [], "combined": None})
            continue
        res = simulate(person, [sc] + [v[3] for v in vs], n_sim=n_sim, seed=7)["results"]
        # 같은 난수 시드로 기준도 다시 계산해 비교 (몬테카를로 잡음 상쇄)
        base = res[0]
        tips = []
        for (apply, title, detail, _), r in zip(vs, res[1:]):
            e = _effect(base, r)
            if _score(e) > 0.05:
                tips.append({"title": title, "detail": detail, "apply": apply, "effect": e})
        tips.sort(key=lambda t: _score(t["effect"]), reverse=True)
        combined = None
        usable = [t["apply"] for t in tips if t["apply"]["kind"] != "drink_none"]
        if len(usable) >= 2:
            rc = simulate(person, [sc, _combine(sc, usable)], n_sim=n_sim, seed=7)["results"]
            combined = {"applies": usable, "effect": _effect(rc[0], rc[1])}
        out.append({"scenario": sc.name, "tips": tips[:top], "combined": combined})
    return out
