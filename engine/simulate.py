"""AfterBody 시뮬레이션 엔진 — 시나리오(먹고·마시고·움직인 것) → 오늘의 변화 + 반복 시 장기 변화.

설계 요약
  오늘   : 영양 합계(음식 DB 분포), 혈당 부하(GI), 혈중알코올 곡선(Widmark), 운동 소모(MET), 재미 환산
  장기   : '기준 저녁'(하루 필요열량의 1/3) 대비 에너지 차이 × 주당 반복 횟수
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


@dataclass
class Scenario:
    name: str
    foods: list = field(default_factory=list)
    drinks: list = field(default_factory=list)
    exercises: list = field(default_factory=list)
    start_hour: float = 19.0         # 먹기 시작한 시각
    drink_hours: float = 2.0         # 술 마신 시간
    times_per_week: float = 1.0      # 장기 예측: 이 선택을 주 몇 번 반복하는가


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
        eer = P.eer_kcal(person.sex, person.age, person.weight_kg, person.height_m, person.activity)
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
        "person": {"bmi": round(person.bmi, 1), "eer_kcal": round(eer), "sodium_limit_mg": sodium_limit,
                   "risk_now": {k: round(v * 100, 1) for k, v in base_probs.items()}},
        "results": results,
        "assumptions": [
            "장기 변화는 '하루 필요열량의 1/3을 먹는 균형 잡힌 저녁'과 비교한 값입니다.",
            "체중 변화: 하루 약 24 kcal 차이가 지속되면 최종 약 1 kg, 그 절반은 약 1년에 걸쳐 나타남 (Hall 2011).",
            "질환 확률은 국민건강영양조사 2024의 '같은 조건 사람들 중 비율'이며 발병 예언이 아닙니다.",
            "혈압 변화는 무작위대조시험 메타분석 효과크기를 사용했습니다.",
            "의학적 진단이 아닌 건강관리 참고용 추정치입니다.",
        ],
    }


def _run(con, person, sc, eer, sodium_limit, rice_kcal, base_probs, rng, n, horizons):
    warnings, resolved = [], []
    tot = {k: np.zeros(n) for k in ("kcal", "carb_g", "sugar_g", "fat_g", "protein_g", "sodium_mg")}
    gl_items, confidences = [], []
    drinks = list(sc.drinks)

    # 음식
    for f in sc.foods:
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
            for k in tot:
                tot[k] += _sample(u, it[k]) * grams / 100
            carb_med = (it["carb_g"]["med"] if it["carb_g"] else 0) * float(np.median(grams)) / 100
            gl_items.append((carb_med, it["gi"]))
            confidences.append(it["confidence"])
            resolved.append({"type": "food", "query": f.query, "name": it["name"], "grams": round(float(np.median(grams))),
                             "unit": it["unit"], "confidence": it["confidence"], "kcal_per_100": it["kcal"]["med"]})

    # 술
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

    # 운동
    ex_kcal, aerobic_session = 0.0, False
    for e in sc.exercises:
        x = _exercise_row(con, e.name)
        if not x:
            warnings.append(f"'{e.name}' 운동을 찾지 못했습니다.")
            continue
        kcal = P.exercise_net_kcal(x["met"], person.weight_kg, e.minutes)
        ex_kcal += kcal
        aerobic_session |= x["met"] >= C.AEROBIC_MIN_MET and e.minutes >= 20
        resolved.append({"type": "exercise", "query": e.name, "name": x["name"], "minutes": e.minutes,
                         "met": x["met"], "kcal": round(kcal)})

    net = tot["kcal"] - ex_kcal

    # 오늘: 혈당 부하
    gl, gl_level, gi_est = P.glycemic_load(gl_items)
    t_g, idx = P.glucose_response_index(gl)
    if gi_est:
        warnings.append("혈당지수가 측정되지 않은 음식이 있어 GI 60(중간)으로 추정했습니다.")

    # 오늘: 알코올
    alcohol = None
    if alcohol_g > 0:
        times, bac, peak, t_peak, sober = P.bac_curve(
            [(sc.start_hour, alcohol_g, sc.drink_hours)], person.sex, person.weight_kg, sc.start_hour)
        step = max(1, len(times) // 120)
        alcohol = {"grams": round(alcohol_g, 1), "std_drinks": round(alcohol_g / C.STD_DRINK_G, 1),
                   "peak_bac_pct": round(peak, 3), "peak_time": P.clock(t_peak),
                   "sober_time": P.clock(sober) if sober else None,
                   "curve": {"hour": [round(float(t), 2) for t in times[::step]],
                             "bac_pct": [round(float(v), 4) for v in bac[::step]]}}

    # 장기
    ref_kcal = eer * C.REFERENCE_MEAL_SHARE
    ref_sodium = sodium_limit * C.REFERENCE_MEAL_SHARE
    per_day = sc.times_per_week / 7
    d_kcal_day = (net - ref_kcal) * per_day
    d_sodium_day = (tot["sodium_mg"] - ref_sodium) * per_day
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
    return {
        "scenario": sc.name,
        "times_per_week": sc.times_per_week,
        "resolved": resolved,
        "today": {
            "kcal": _pct(tot["kcal"], 0), "exercise_kcal": round(ex_kcal), "net_kcal": _pct(net, 0),
            "pct_of_daily_need": _pct(tot["kcal"] / eer * 100, 0),
            "carb_g": _pct(tot["carb_g"]), "sugar_g": _pct(tot["sugar_g"]), "fat_g": _pct(tot["fat_g"]),
            "protein_g": _pct(tot["protein_g"]), "sodium_mg": _pct(tot["sodium_mg"], 0),
            "sodium_pct_of_daily_limit": _pct(tot["sodium_mg"] / sodium_limit * 100, 0),
            "glycemic": {"load": round(gl, 1), "level": gl_level, "gi_estimated": gi_est,
                         "curve": {"minute": t_g.tolist(), "index": [round(float(v), 1) for v in idx]}},
            "alcohol": alcohol,
        },
        "fun": {
            "walk_minutes_to_burn": round(float(np.median(tot["kcal"])) / walk_kcal_per_min),
            "rice_bowls": round(float(np.median(tot["kcal"])) / rice_kcal, 1),
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
        Scenario("치킨 + 맥주", foods=[FoodInput("치킨", 450)], drinks=[DrinkInput("생맥주", 2)], times_per_week=2),
        Scenario("치킨 + 물", foods=[FoodInput("치킨", 450)], times_per_week=2),
        Scenario("샐러드 + 30분 걷기", foods=[FoodInput("샐러드", 300)],
                 exercises=[ExerciseInput("걷기 빠르게", 30)], times_per_week=2),
    ])
    p = out["person"]
    print(f"BMI {p['bmi']}, 하루 필요열량 {p['eer_kcal']} kcal, 현재 위험 {p['risk_now']}")
    for r in out["results"]:
        t, y = r["today"], r["long_term"][-1]
        print(f"\n■ {r['scenario']} (주 {r['times_per_week']}회, 신뢰도 {r['confidence']})")
        print(f"  오늘: {t['kcal']['med']} kcal ({t['kcal']['p10']}~{t['kcal']['p90']}), "
              f"나트륨 {t['sodium_mg']['med']} mg, GL {t['glycemic']['load']}({t['glycemic']['level']})")
        if t["alcohol"]:
            a = t["alcohol"]
            print(f"  술: {a['grams']} g, 최고 {a['peak_bac_pct']}% ({a['peak_time']}), 분해 완료 {a['sober_time']}")
        print(f"  재미: 빠르게 걷기 {r['fun']['walk_minutes_to_burn']}분 / 공기밥 {r['fun']['rice_bowls']}그릇 / {r['fun']['sodium_vs_daily']}")
        print(f"  1년 유지: 체중 {y['weight_change_kg']}, 수축기혈압 {y['sbp_change']} mmHg, "
              f"고혈압 {y['risks']['htn']['now']}→{y['risks']['htn']['after']['med']}%, "
              f"당뇨 {y['risks']['dm']['now']}→{y['risks']['dm']['after']['med']}%, 심혈관 RR {y['cvd_relative_risk']['med']}")
        for w in r["warnings"]:
            print(f"  ⚠ {w}")
