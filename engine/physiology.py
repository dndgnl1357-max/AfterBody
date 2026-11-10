"""생리 계산 (결정론적 공식). 입력·출력 단위를 함수 이름/인자에 명시한다."""
import math

import numpy as np

from . import config as C

# 2025 KDRI 성인 에너지필요추정량 산출식 (1권 표 12·13): a - b×나이 + PA×(c×체중kg + d×신장m)
_EER_COEF = {1: (662, 9.53, 15.91, 539.6), 2: (354, 6.91, 9.36, 726)}
PA_COEF = {
    1: {"비활동적": 1.0, "저활동적": 1.11, "활동적": 1.25, "매우활동적": 1.48},
    2: {"비활동적": 1.0, "저활동적": 1.12, "활동적": 1.27, "매우활동적": 1.45},
}


def eer_kcal(sex, age, weight_kg, height_m, activity="저활동적"):
    a, b, c, d = _EER_COEF[sex]
    return a - b * age + PA_COEF[sex][activity] * (c * weight_kg + d * height_m)


def exercise_net_kcal(met, weight_kg, minutes):
    """운동으로 '추가로' 쓴 열량. 안정 시 소모(1 MET)는 이미 EER에 포함되므로 뺀다."""
    return max(met - 1.0, 0.0) * weight_kg * minutes / 60.0


def weight_change_kg(delta_kcal_per_day, days):
    """지속적인 하루 에너지 차이 → days 후 체중 변화 (Hall 2011 근사: 정상상태 1kg/23.9kcal, 반감기 1년)."""
    steady = delta_kcal_per_day / C.KCAL_PER_DAY_PER_KG
    return steady * (1.0 - 0.5 ** (days / C.WEIGHT_HALF_TIME_DAYS))


def bac_curve(drinks, sex, weight_kg, t_start_h, t_end_h=None, dt_h=1 / 60):
    """혈중알코올농도(%) 시계열.

    drinks: [(시작시각 h, 알코올 g, 마시는 데 걸린 시간 h), ...]  (시각은 0~48 범위, 24 이상은 다음날)
    1구획 모형: 위장 → 1차 흡수(ka) → 체내 분포(Widmark r) → 0차 제거(β %/h)
    반환: (times_h, bac_pct, peak_pct, peak_time_h, sober_time_h 또는 None)
    """
    r = C.WIDMARK_R[sex]
    body_g = weight_kg * 1000 * r                     # 분포 체적에 해당하는 g
    elim_g_per_h = C.ALCOHOL_ELIM_PCT_PER_H / 100 * body_g
    if t_end_h is None:
        total = sum(g for _, g, _ in drinks)
        t_end_h = max(s + d for s, _, d in drinks) + total / max(elim_g_per_h, 1e-9) + 2
    times = np.arange(t_start_h, t_end_h + dt_h, dt_h)
    stomach = body = 0.0
    out = np.zeros_like(times)
    for i, t in enumerate(times):
        intake = sum(g / d if s <= t < s + d else 0.0 for s, g, d in drinks)
        absorbed = C.ALCOHOL_ABSORB_KA * stomach * dt_h
        stomach += intake * dt_h - absorbed
        body = max(body + absorbed - elim_g_per_h * dt_h, 0.0)
        out[i] = body / body_g * 100
    k = int(np.argmax(out))
    after = np.where((times > times[k]) & (out <= 1e-4))[0]
    sober = float(times[after[0]]) if len(after) and out[k] > 0 else None
    return times, out, float(out[k]), float(times[k]), sober


def glycemic_load(items):
    """items: [(탄수화물 g, GI 또는 None)] → (GL 합계, 등급, GI 추정 포함 여부)"""
    gl, estimated = 0.0, False
    for carb_g, gi in items:
        if gi is None:
            gi, estimated = C.DEFAULT_GI, True
        gl += gi * carb_g / 100
    level = "낮음" if gl <= C.GL_LOW else ("중간" if gl < C.GL_HIGH else "높음")
    return gl, level, estimated


def glucose_response_index(gl, minutes=180, step=5):
    """화면용 '혈당 반응 지수' 곡선 (상대값, 실제 mg/dL 아님).
    포도당 50 g(GL 50)일 때 정점이 100이 되도록 GL에 비례시키고, 형태는 45분 정점의 감마형 곡선."""
    t = np.arange(0, minutes + step, step, dtype=float)
    shape = (t / 45.0) * np.exp(1 - t / 45.0)          # 45분에 1로 정점
    return t, shape * 100 * gl / 50


def clock(h):
    """시각(h, 24 이상은 다음날) → '다음날 03:40' 형식"""
    day = "다음날 " if h >= 24 else ""
    h24 = h % 24
    hh, mm = int(h24), int(round((h24 - int(h24)) * 60))
    if mm == 60:
        hh, mm = hh + 1, 0
    return f"{day}{hh:02d}:{mm:02d}"
