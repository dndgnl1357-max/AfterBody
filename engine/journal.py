"""하루 기록 누적: 날짜별 실제 섭취·음주·운동 → 체중 흐름, 나에게 맞춘 필요열량 추정, 앞으로의 예측.

체중 동역학 (Hall 2011 근사, simulate 의 weight_change_kg 와 같은 모형을 하루 단위로 푼 것)
  정상상태 변화 = 하루 에너지 차이 / 23.9 kcal,  반감기 1년
  x(d+1) = x(d) + (ΔE(d)/23.9 − x(d)) · ln2/365
  → ΔE 를 상수 1 kcal/일로 넣었을 때의 응답 g(d) 로, 실제 체중과의 차이를 맞추는 보정값 c 를 최소제곱으로 구한다.
기록 없는 날은 '평소대로 먹은 날'(ΔE = 0)로 본다.
"""
import math
from datetime import date, timedelta

import numpy as np

from . import config as C
from . import risk as R
from .simulate import simulate

DECAY = math.log(2) / C.WEIGHT_HALF_TIME_DAYS
MIN_WEIGHTS, MIN_SPAN_DAYS = 3, 10          # 보정에 필요한 최소 체중 기록 수·기간
OFFSET_LIMIT = 600                          # 보정 한도 (kcal/일) — 체중 측정 오차(수분 등)로 튀는 것 방지


def _trajectory(delta):
    """하루 에너지 차이 배열 → 날짜별 누적 체중 변화(kg)"""
    x, out = 0.0, []
    for d in delta:
        out.append(x)
        x += (d / C.KCAL_PER_DAY_PER_KG - x) * DECAY
    return np.array(out)


def journal(person, entries, today=None, horizons_days=(90, 365)):
    """
    entries: [(date, Scenario, measured_weight_kg 또는 None)]  (Scenario.times_per_week 는 쓰지 않음)
    반환: days(날짜별 요약), calibration(개인 필요열량 추정), projection(최근 7일 평균대로 갈 때)
    """
    today = today or date.today()
    entries = sorted(entries, key=lambda e: e[0])
    logged = [e for e in entries if e[1] is not None]
    sims = simulate(person, [e[1] for e in logged], n_sim=60)["results"] if logged else []
    eer = simulate(person, [], n_sim=1)["person"]["eer_kcal"]
    day_info = {e[0]: s for e, s in zip(logged, sims)}
    weights = {e[0]: e[2] for e in entries if e[2]}

    start = entries[0][0] if entries else today
    n_days = (max(today, entries[-1][0] if entries else today) - start).days + 1
    dates = [start + timedelta(days=i) for i in range(n_days)]
    delta = np.array([day_info[d]["today"]["net_kcal"]["med"] - eer if d in day_info else 0.0 for d in dates])

    # 보정: 실제 체중 = 시작체중 + a + 누적(ΔE − c) 이 되도록 a(시작 체중 차이)와 c(필요열량 차이)를 함께 추정
    base_w = weights.get(start, person.weight_kg) if weights else person.weight_kg
    pred0 = _trajectory(delta)
    unit = _trajectory(np.ones(n_days))                       # 1 kcal/일 의 응답
    idx = [i for i, d in enumerate(dates) if d in weights]
    calib = {"used": False, "offset_kcal": 0, "need_kcal": round(eer), "n_weights": len(idx),
             "span_days": (dates[idx[-1]] - dates[idx[0]]).days if len(idx) >= 2 else 0}
    offset = shift = 0.0
    if len(idx) >= MIN_WEIGHTS and calib["span_days"] >= MIN_SPAN_DAYS:
        y = np.array([weights[dates[i]] - base_w - pred0[i] for i in idx])
        X = np.column_stack([np.ones(len(idx)), -unit[idx]])
        (shift, offset), *_ = np.linalg.lstsq(X, y, rcond=None)
        offset = float(np.clip(offset, -OFFSET_LIMIT, OFFSET_LIMIT))
        shift = float(np.mean(y + offset * unit[idx]))           # 잘린 offset 기준으로 다시 맞춤
        calib.update(used=True, offset_kcal=round(offset), need_kcal=round(eer + offset))
    pred = base_w + shift + _trajectory(delta - offset)

    days = []
    for i, d in enumerate(dates):
        s = day_info.get(d)
        t = s["today"] if s else None
        days.append({
            "date": d.isoformat(), "logged": s is not None,
            "kcal": t["kcal"]["med"] if t else None, "net_kcal": t["net_kcal"]["med"] if t else None,
            "exercise_kcal": t["exercise_kcal"] if t else None,
            "sodium_mg": t["sodium_mg"]["med"] if t else None,
            "alcohol_g": t["alcohol"]["grams"] if t and t["alcohol"] else 0,
            "need_kcal": round(eer + offset),
            "predicted_weight": round(float(pred[i]), 2),
            "measured_weight": weights.get(d),
        })

    # 앞으로: 최근 7일(기록된 날 기준) 평균 에너지 차이가 계속된다고 가정
    recent = [d for d in dates if d in day_info][-7:]
    avg = float(np.mean([day_info[d]["today"]["net_kcal"]["med"] - eer - offset for d in recent])) if recent else 0.0
    now_w = float(pred[-1])
    projection = {"avg_delta_kcal": round(avg), "based_on_days": len(recent), "from_weight": round(now_w, 1), "horizons": []}
    x0 = now_w - base_w - shift
    for h in horizons_days:
        x = x0
        for _ in range(h):
            x += (avg / C.KCAL_PER_DAY_PER_KG - x) * DECAY
        w = base_w + shift + x
        bmi = w / person.height_m ** 2
        probs = R.disease_probs(person.age, person.sex, [bmi], person.smoking)
        projection["horizons"].append({"days": h, "weight": round(w, 1), "change_kg": round(w - now_w, 1), "bmi": round(bmi, 1),
                                       "risks": {k: round(float(v[0]) * 100, 1) for k, v in probs.items()}})

    summary = {
        "logged_days": len(day_info), "total_days": n_days,
        "avg_kcal": round(float(np.mean([day_info[d]["today"]["kcal"]["med"] for d in day_info]))) if day_info else None,
        "need_kcal": round(eer + offset),
        "predicted_change_kg": round(float(pred[-1] - pred[0]), 2),
    }
    return {"days": days, "calibration": calib, "projection": projection, "summary": summary,
            "start_weight": base_w, "eer_kcal": round(eer)}
