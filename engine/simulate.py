"""AfterBody 시뮬레이션 엔진 — 시나리오(먹고·마시고·움직인 것) → 오늘의 변화 + 반복 시 장기 변화.

설계 요약
  하루   : 식사(아침·점심·저녁·간식: 평소대로/직접 입력/거름) + 음주 + 운동을 따로 입력
           → 끼니별 영양(음식 DB 분포), 하루 혈당 흐름(GI), 혈중알코올 곡선(Widmark), 운동 소모(MET)
  장기   : '평소대로 먹은 하루'(= 하루 필요열량) 대비 에너지 차이 × 주당 반복 횟수
           → 체중 변화(Hall 2011) → BMI → 질환 유병 확률(KNHANES 모델)
           → 혈압 변화(체중·나트륨·절주·운동, RCT 메타분석) → 심혈관 상대위험(Ettehad 2016)
  불확실성: 몬테카를로. 음식 영양값·1회량은 DB 분포(p10–중앙–p90 삼각분포), 효과크기는 95% CI 정규분포.
            결과는 모두 {p10, med, p90} 로 반환 → 화면은 중앙값 + 범위로 표시.

사용 예:  python -m engine   (데모 3개 시나리오)
"""
import sqlite3
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from . import config as C
from . import physiology as P
from . import risk as R
from .foods import lookup

PCT_KEYS = ("p10", "med", "p90")


# ──────────────────────────────────────────────────────────────── 입력 모델
@dataclass
class Person:
    sex: int                         # 1 남, 2 여
    age: float
    height_cm: float
    weight_kg: float
    smoking: str = "never"           # never / former / current
    activity: str = "저활동적"         # 비활동적 / 저활동적 / 활동적 / 매우활동적
    sbp: Optional[float] = None      # 측정한 수축기혈압 (있으면 예상 혈압을 함께 계산)
    usual_alcohol_g_per_day: float = 0.0
    # 인바디 결과 (선택) — BMR이 있으면 하루 필요열량을 실측 기반으로 계산
    bmr_kcal: Optional[float] = None
    body_fat_pct: Optional[float] = None
    skeletal_muscle_kg: Optional[float] = None

    @property
    def height_m(self):
        return self.height_cm / 100

    @property
    def bmi(self):
        return self.weight_kg / self.height_m ** 2


@dataclass
class FoodInput:
    query: str
    grams: Optional[float] = None    # 없으면 DB 대표 1회량 사용
    choice: int = 0                  # 후보가 여러 개일 때 선택 번호


@dataclass
class DrinkInput:
    name: str                        # "맥주", "소주" 등 (ref_alcohol 이름 또는 별칭)
    servings: float = 1.0            # 1잔 단위 (ref_alcohol.serving_unit)


@dataclass
class ExerciseInput:
    name: str                        # ref_exercise 이름 또는 일부 ("걷기 빠르게")
    minutes: float
    hour: Optional[float] = None     # 운동 시각 (타임라인 표시용)


@dataclass
class MealInput:
    mode: str = "usual"              # usual 평소대로 / custom 직접 입력 / skip 거름
    foods: list = field(default_factory=list)
    hour: Optional[float] = None     # 없으면 끼니 기본 시각


@dataclass
class Scenario:
    """하루 하나. meals: {"breakfast"|"lunch"|"dinner"|"snack": MealInput} — 빠진 끼니는 '평소대로'."""
    name: str
    foods: list = field(default_factory=list)   # (이전 방식) 저녁에 먹은 음식으로 처리
    drinks: list = field(default_factory=list)
    exercises: list = field(default_factory=list)
    start_hour: float = 19.0                    # (이전 방식) 저녁 시각
    drink_hours: float = 2.0                    # 술 마신 시간
    times_per_week: float = 1.0                 # 이런 날이 일주일에 몇 번인가 (나머지 날은 평소대로)
    meals: dict = field(default_factory=dict)
    drink_start_hour: Optional[float] = None


# ──────────────────────────────────────────────────────────────── 보조
def _pct(a, nd=1):
    a = np.atleast_1d(a)
    return dict(zip(PCT_KEYS, (round(float(x), nd) for x in np.percentile(a, [10, 50, 90]))))


def _tri_ppf(u, a, c, b):
    """삼각분포 역CDF (a=p10, c=중앙값, b=p90 을 범위로 사용). 범위가 없으면 c."""
    if a is None or b is None or b <= a:
        return np.full_like(u, c if c is not None else 0.0, dtype=float)
    c = min(max(c, a), b)
    fc = (c - a) / (b - a)
    return np.where(u < fc, a + np.sqrt(u * (b - a) * (c - a)), b - np.sqrt((1 - u) * (b - a) * (b - c)))


def _sample(rng_u, stat):
    return _tri_ppf(rng_u, stat["p10"], stat["med"], stat["p90"]) if stat else np.zeros_like(rng_u)


def _alcohol_row(con, name):
    cur = con.execute("SELECT * FROM ref_alcohol WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return dict(zip([c[0] for c in cur.description], row))
    res = lookup(name, con)
    for it in res["items"]:
        if it["type"] == "alcohol":
            return it
    return None


def _exercise_row(con, name):
    q = name.replace(" ", "")
    rows = con.execute("SELECT name, met FROM ref_exercise").fetchall()
    exact = [r for r in rows if r[0].replace(" ", "") == q]
    part = [r for r in rows if q in r[0].replace(" ", "")]
    hit = (exact or part or [None])[0]
    return {"name": hit[0], "met": hit[1]} if hit else None


def _sodium_limit(con, sex, age):
    r = con.execute("SELECT sodium_cdrr_mg FROM ref_kdri_adult WHERE sex=? AND ? BETWEEN age_min AND age_max",
                    (sex, int(age))).fetchone()
    return r[0] if r else 2300


# ──────────────────────────────────────────────────────────────── 핵심
def simulate(person: Person, scenarios, n_sim=500, seed=0, horizons_days=(90, 365)):
    con = sqlite3.connect(C.DB)
    try:
        if person.bmr_kcal:
            eer, energy_source = person.bmr_kcal * C.PAL_BY_ACTIVITY[person.activity], "인바디 기초대사량 × 활동계수"
        else:
            eer, energy_source = P.eer_kcal(person.sex, person.age, person.weight_kg, person.height_m,
                                            person.activity), "2025 한국인 영양소 섭취기준 공식"
        sodium_limit = _sodium_limit(con, person.sex, person.age)
        rice = lookup("밥", con)["items"][0]["kcal"]["med"] * C.RICE_BOWL_G / 100
        base_probs = {k: float(v[0]) for k, v in
                      R.disease_probs(person.age, person.sex, person.bmi, person.smoking).items()}
        results = [_run(con, person, s, eer, sodium_limit, rice, base_probs,
                        np.random.default_rng(seed + i), n_sim, horizons_days)
                   for i, s in enumerate(scenarios)]
    finally:
        con.close()
    return {
        "person": {"bmi": round(person.bmi, 1), "eer_kcal": round(eer), "energy_source": energy_source,
                   "body_fat_pct": person.body_fat_pct, "skeletal_muscle_kg": person.skeletal_muscle_kg,
                   "sodium_limit_mg": sodium_limit,
                   "risk_now": {k: round(v * 100, 1) for k, v in base_probs.items()}},
        "results": results,
        "assumptions": [
            "'평소대로' 끼니는 하루 필요열량 중 아침 25%·점심 35%·저녁 35%·간식 5%를 먹은 것으로 가정합니다.",
            "장기 변화는 이런 날(주 N회)을 '끼니를 모두 평소대로 먹고 술·운동이 없는 하루'와 비교한 값입니다.",
            "체중 변화: 하루 약 24 kcal 차이가 지속되면 최종 약 1 kg, 그 절반은 약 1년에 걸쳐 나타남 (Hall 2011).",
            "질환 확률은 국민건강영양조사 2024의 '같은 조건 사람들 중 비율'이며 발병 예언이 아닙니다.",
            "혈압 변화는 무작위대조시험 메타분석 효과크기를 사용했습니다.",
            "의학적 진단이 아닌 건강관리 참고용 추정치입니다.",
        ],
    }


NUTRIENTS = ("kcal", "carb_g", "fat_g", "protein_g", "sodium_mg")


def _eat(con, foods, rng, n, warnings, resolved, drinks, confidences, slot):
    """직접 입력한 한 끼 → (영양소별 표본 배열, [(탄수화물 g, GI)])"""
    tot = {k: np.zeros(n) for k in NUTRIENTS}
    gl_items = []
    for f in foods:
        res = lookup(f.query, con)
        if not res["items"]:
            warnings.append(f"'{f.query}'를 찾지 못해 계산에서 제외했습니다.")
            continue
        items = res["items"] if res["mode"] == "combo" else [res["items"][min(f.choice, len(res["items"]) - 1)]]
        for it in items:
            if it["type"] == "alcohol":           # 음식 칸에 '맥주'·'치맥' 등을 넣은 경우 1잔으로 처리
                drinks.append(DrinkInput(it["name"], 1.0))
                continue
            u = rng.random(n)                     # 같은 음식의 영양소는 함께 움직이도록 동일 분위수 사용
            if f.grams:
                grams = np.full(n, float(f.grams))
            elif it["portion_g"]:
                grams = _sample(rng.random(n), it["portion_g"])
            else:
                grams = np.full(n, 100.0)
                warnings.append(f"'{it['name']}' 섭취량 정보가 없어 100 g으로 계산했습니다.")
            for k in NUTRIENTS:
                tot[k] += _sample(u, it[k]) * grams / 100
            carb_med = (it["carb_g"]["med"] if it["carb_g"] else 0) * float(np.median(grams)) / 100
            gl_items.append((carb_med, it["gi"]))
            confidences.append(it["confidence"])
            resolved.append({"type": "food", "meal": slot, "query": f.query, "name": it["name"],
                             "grams": round(float(np.median(grams))), "unit": it["unit"],
                             "confidence": it["confidence"], "kcal_per_100": it["kcal"]["med"]})
    return tot, gl_items


def _meals_of(sc):
    """시나리오 → 끼니 4칸 (빠진 칸은 평소대로). 이전 방식(foods)은 저녁 직접 입력으로 변환."""
    meals = dict(sc.meals)
    if sc.foods and "dinner" not in meals:
        meals["dinner"] = MealInput("custom", list(sc.foods), sc.start_hour)
    out = {}
    for slot, (label, share, hour) in C.MEAL_SLOTS.items():
        m = meals.get(slot) or MealInput()
        mode = m.mode if m.mode in ("usual", "custom", "skip") else "usual"
        if mode == "custom" and not m.foods:
            mode = "usual"
        out[slot] = (label, share, m.hour if m.hour is not None else hour, mode, m.foods)
    return out


def _run(con, person, sc, eer, sodium_limit, rice_kcal, base_probs, rng, n, horizons):
    warnings, resolved, confidences = [], [], []
    drinks = list(sc.drinks)
    tot = {k: np.zeros(n) for k in NUTRIENTS}
    entered_kcal = np.zeros(n)                    # 사용자가 직접 넣은 음식·술만 (재미 환산용)
    meal_rows, glucose_events, gi_est, peak = [], [], False, (0.0, None)

    # 식사 (아침·점심·저녁·간식)
    for slot, (label, share, hour, mode, foods) in _meals_of(sc).items():
        if mode == "custom":
            m_tot, gl_items = _eat(con, foods, rng, n, warnings, resolved, drinks, confidences, slot)
            gl, level, est = P.glycemic_load(gl_items)
            gi_est |= est
            entered_kcal += m_tot["kcal"]
            if gl > peak[0]:
                peak = (gl, label)
        elif mode == "usual":
            kcal = share * eer
            m_tot = {"kcal": np.full(n, kcal), "sodium_mg": np.full(n, share * sodium_limit),
                     "carb_g": np.full(n, kcal * C.USUAL_ENERGY_SHARE["carb"] / 4),
                     "protein_g": np.full(n, kcal * C.USUAL_ENERGY_SHARE["protein"] / 4),
                     "fat_g": np.full(n, kcal * C.USUAL_ENERGY_SHARE["fat"] / 9)}
            gl = C.DEFAULT_GI * float(m_tot["carb_g"][0]) / 100
            level = None
        else:
            m_tot, gl, level = {k: np.zeros(n) for k in NUTRIENTS}, 0.0, None
        for k in NUTRIENTS:
            tot[k] += m_tot[k]
        if gl > 0:
            glucose_events.append((hour, gl))
        meal_rows.append({"slot": slot, "label": label, "mode": mode, "hour": hour,
                          "kcal": _pct(m_tot["kcal"], 0), "sodium_mg": round(float(np.median(m_tot["sodium_mg"]))),
                          "glycemic_load": round(gl, 1), "glycemic_level": level,
                          "items": [r["name"] for r in resolved if r.get("meal") == slot]})
    if gi_est:
        warnings.append("혈당지수가 측정되지 않은 음식이 있어 GI 60(중간)으로 추정했습니다.")

    # 음주
    alcohol_g = alcohol_kcal = alcohol_carb = 0.0
    for d in drinks:
        a = _alcohol_row(con, d.name)
        if not a:
            warnings.append(f"'{d.name}' 주류 정보를 찾지 못했습니다.")
            continue
        alcohol_g += a["serving_alcohol_g"] * d.servings
        alcohol_kcal += a["serving_kcal"] * d.servings
        alcohol_carb += a["carb_g_per_100ml"] * a["serving_ml"] / 100 * d.servings
        resolved.append({"type": "drink", "query": d.name, "name": a["name"], "servings": d.servings,
                         "unit": a["serving_unit"], "alcohol_g": round(a["serving_alcohol_g"] * d.servings, 1)})
    tot["kcal"] += alcohol_kcal
    tot["carb_g"] += alcohol_carb
    entered_kcal += alcohol_kcal

    # 운동
    ex_kcal, aerobic_session, ex_rows = 0.0, False, []
    for e in sc.exercises:
        x = _exercise_row(con, e.name)
        if not x:
            warnings.append(f"'{e.name}' 운동을 찾지 못했습니다.")
            continue
        kcal = P.exercise_net_kcal(x["met"], person.weight_kg, e.minutes)
        ex_kcal += kcal
        aerobic_session |= x["met"] >= C.AEROBIC_MIN_MET and e.minutes >= 20
        row = {"type": "exercise", "query": e.name, "name": x["name"], "minutes": e.minutes,
               "met": x["met"], "kcal": round(kcal), "hour": e.hour}
        resolved.append(row)
        ex_rows.append({k: row[k] for k in ("name", "minutes", "kcal", "hour")})

    net = tot["kcal"] - ex_kcal

    # 하루 혈당 흐름
    g_hours, g_index = P.glucose_day_index(glucose_events)

    # 알코올
    alcohol = None
    if alcohol_g > 0:
        start = sc.drink_start_hour if sc.drink_start_hour is not None else (
            sc.start_hour if sc.foods and not sc.meals else C.DEFAULT_DRINK_START_HOUR)
        times, bac, pk, t_peak, sober = P.bac_curve([(start, alcohol_g, sc.drink_hours)],
                                                    person.sex, person.weight_kg, start)
        step = max(1, len(times) // 120)
        alcohol = {"grams": round(alcohol_g, 1), "kcal": round(alcohol_kcal),
                   "std_drinks": round(alcohol_g / C.STD_DRINK_G, 1), "start_hour": start,
                   "peak_bac_pct": round(pk, 3), "peak_time": P.clock(t_peak),
                   "sober_time": P.clock(sober) if sober else None,
                   "curve": {"hour": [round(float(t), 2) for t in times[::step]],
                             "bac_pct": [round(float(v), 4) for v in bac[::step]]}}

    # 장기: 이런 날(주 N회)과 '평소대로 먹은 하루'(= 하루 필요열량, 나트륨 기준치)의 차이
    per_day = sc.times_per_week / 7
    d_kcal_day = (net - eer) * per_day
    d_sodium_day = (tot["sodium_mg"] - sodium_limit) * per_day
    weekly_alcohol = alcohol_g * sc.times_per_week
    heavy_cut = (person.usual_alcohol_g_per_day >= C.HEAVY_DRINKER_G_PER_DAY
                 and weekly_alcohol <= 0.5 * person.usual_alcohol_g_per_day * 7)
    aerobic_week = sc.times_per_week if aerobic_session else 0.0

    long_term = []
    for days in horizons:
        dw = P.weight_change_kg(d_kcal_day, days)
        bmi = (person.weight_kg + dw) / person.height_m ** 2
        bmi_q = np.percentile(bmi, [10, 50, 90])
        probs = R.disease_probs(person.age, person.sex, bmi_q, person.smoking)
        dsbp = R.sbp_change(dw, d_sodium_day, heavy_cut, aerobic_week, rng)
        entry = {
            "days": days,
            "weight_change_kg": _pct(dw),
            "bmi": _pct(bmi),
            "risks": {k: {"name": R.DISEASES[k], "now": round(base_probs[k] * 100, 1),
                          "after": dict(zip(PCT_KEYS, (round(float(p) * 100, 1) for p in probs[k]))),
                          "change_pp": round((float(probs[k][1]) - base_probs[k]) * 100, 1)}
                      for k in probs},
            "sbp_change": _pct(dsbp),
            "cvd_relative_risk": _pct(R.cvd_relative_risk(dsbp), 3),
        }
        if person.sbp:
            entry["sbp_projected"] = _pct(person.sbp + dsbp, 0)
        long_term.append(entry)

    order = {"높음": 2, "중간": 1, "낮음": 0}
    walk_kcal_per_min = (C.BRISK_WALK_MET - 1) * person.weight_kg / 60
    entered = float(np.median(entered_kcal))
    peak_level = "낮음" if peak[0] <= C.GL_LOW else ("중간" if peak[0] < C.GL_HIGH else "높음")
    return {
        "scenario": sc.name,
        "times_per_week": sc.times_per_week,
        "resolved": resolved,
        "today": {
            "kcal": _pct(tot["kcal"], 0), "entered_kcal": round(entered),
            "exercise_kcal": round(ex_kcal), "net_kcal": _pct(net, 0),
            "pct_of_daily_need": _pct(tot["kcal"] / eer * 100, 0),
            "carb_g": _pct(tot["carb_g"]), "fat_g": _pct(tot["fat_g"]), "protein_g": _pct(tot["protein_g"]),
            "sodium_mg": _pct(tot["sodium_mg"], 0),
            "sodium_pct_of_daily_limit": _pct(tot["sodium_mg"] / sodium_limit * 100, 0),
            "meals": meal_rows,
            "exercises": ex_rows,
            # 직접 입력한 끼니 중 혈당 부하가 가장 큰 끼니 (없으면 meal=None)
            "glycemic": {"load": round(peak[0], 1), "level": peak_level if peak[1] else None, "meal": peak[1],
                         "gi_estimated": gi_est,
                         "curve": {"hour": [round(float(h), 2) for h in g_hours],
                                   "index": [round(float(v), 1) for v in g_index]}},
            "alcohol": alcohol,
        },
        "fun": {
            "walk_minutes_to_burn": round(entered / walk_kcal_per_min),
            "rice_bowls": round(entered / rice_kcal, 1),
            "sodium_vs_daily": f"하루 권장 상한의 {round(float(np.median(tot['sodium_mg'])) / sodium_limit * 100)}%",
        },
        "long_term": long_term,
        "confidence": min(confidences, key=lambda c: order.get(c, 0)) if confidences else "낮음",
        "warnings": warnings,
    }


# ──────────────────────────────────────────────────────────────── 데모
def demo():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    me = Person(sex=1, age=35, height_cm=174, weight_kg=78, smoking="never", sbp=128)
    out = simulate(me, [
        Scenario("치킨 + 맥주", meals={"dinner": MealInput("custom", [FoodInput("치킨", 450)])},
                 drinks=[DrinkInput("생맥주", 2)], times_per_week=2),
        Scenario("아침 거르고 치킨", meals={"breakfast": MealInput("skip"),
                                      "dinner": MealInput("custom", [FoodInput("치킨", 450)])}, times_per_week=2),
        Scenario("샐러드 + 30분 걷기", meals={"dinner": MealInput("custom", [FoodInput("샐러드", 300)])},
                 exercises=[ExerciseInput("걷기 빠르게", 30, hour=20)], times_per_week=2),
    ])
    p = out["person"]
    print(f"BMI {p['bmi']}, 하루 필요열량 {p['eer_kcal']} kcal, 현재 위험 {p['risk_now']}")
    for r in out["results"]:
        t, y = r["today"], r["long_term"][-1]
        print(f"\n■ {r['scenario']} (주 {r['times_per_week']}회, 신뢰도 {r['confidence']})")
        print(f"  하루: {t['kcal']['med']} kcal ({t['kcal']['p10']}~{t['kcal']['p90']}), "
              f"필요량의 {t['pct_of_daily_need']['med']}%, 나트륨 {t['sodium_mg']['med']} mg")
        print("  끼니: " + " / ".join(f"{m['label']} {m['kcal']['med']:.0f}({m['mode']})" for m in t["meals"]))
        if t["alcohol"]:
            a = t["alcohol"]
            print(f"  술: {a['grams']} g, 최고 {a['peak_bac_pct']}% ({a['peak_time']}), 분해 완료 {a['sober_time']}")
        print(f"  재미: 빠르게 걷기 {r['fun']['walk_minutes_to_burn']}분 / 공기밥 {r['fun']['rice_bowls']}그릇 / {r['fun']['sodium_vs_daily']}")
        print(f"  1년 유지: 체중 {y['weight_change_kg']}, 수축기혈압 {y['sbp_change']} mmHg, "
              f"고혈압 {y['risks']['htn']['now']}→{y['risks']['htn']['after']['med']}%, "
              f"당뇨 {y['risks']['dm']['now']}→{y['risks']['dm']['after']['med']}%, 심혈관 RR {y['cvd_relative_risk']['med']}")
        for w in r["warnings"]:
            print(f"  ⚠ {w}")
