"""질환 위험: 기준선은 국민건강영양조사 모델, 행동 변화 효과는 문헌 효과크기(ref_effects).

- 체중 변화 → BMI → 고혈압·당뇨·고콜레스테롤 '유병 확률' (KNHANES 로지스틱, 단면 연관)
- 체중·나트륨·절주·운동 → 수축기혈압 변화 (RCT 메타분석) → 심혈관사건 상대위험 (Ettehad 2016)
두 경로를 섞어 이중 계산하지 않도록, 질환 확률은 BMI 경로만, 혈압은 문헌 경로만 사용한다.
"""
import sqlite3
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from . import config as C

SMOKE_CODE = {"never": 0, "former": 1, "current": 2}
DISEASES = {"htn": "고혈압", "dm": "당뇨병", "hchol": "고콜레스테롤혈증"}


@lru_cache(maxsize=1)
def _models():
    out = {}
    for key in DISEASES:
        path = C.MODEL_DIR / f"risk_{key}.joblib"
        if not path.exists():
            raise FileNotFoundError(f"{path} 없음 → python scripts/train_risk_models.py 먼저 실행")
        out[key] = joblib.load(path)
    return out


@lru_cache(maxsize=1)
def effects():
    """ref_effects → {id: {effect, sd}}. sd는 95% 신뢰구간에서 역산 (없으면 0)."""
    con = sqlite3.connect(C.DB)
    rows = con.execute("SELECT id, effect, ci_low, ci_high FROM ref_effects").fetchall()
    con.close()
    return {i: {"effect": e, "sd": (abs(hi - lo) / 3.92) if lo is not None and hi is not None else 0.0}
            for i, e, lo, hi in rows}


def disease_probs(age, sex, bmi, smoking):
    """BMI 배열을 받아 질환별 확률 배열 반환."""
    bmi = np.atleast_1d(np.asarray(bmi, dtype=float))
    X = pd.DataFrame({"age": age, "bmi": bmi, "sex": sex, "smoke_status": SMOKE_CODE[smoking]})
    out = {}
    for key, m in _models().items():
        out[key] = m["model"].predict_proba(X[m["features"]])[:, 1]
    return out


def sbp_change(delta_weight_kg, delta_sodium_mg_day, alcohol_halved_heavy, aerobic_per_week, rng=None):
    """수축기혈압 변화(mmHg). rng가 있으면 효과크기를 신뢰구간 안에서 표본추출(배열 입력 지원)."""
    ef = effects()
    n = np.size(delta_weight_kg)

    def draw(key):
        e, sd = ef[key]["effect"], ef[key]["sd"]
        return rng.normal(e, sd, n) if rng is not None and sd > 0 else np.full(n, e)

    # 효과크기는 모두 '감량/감소 1단위당' 값(음수). 증가는 같은 기울기로 대칭 가정.
    loss_kg = -np.asarray(delta_weight_kg, dtype=float)          # 감량이면 양수
    sodium_cut = -np.asarray(delta_sodium_mg_day, dtype=float)   # 감소면 양수
    total = draw("weight_sbp") * loss_kg                         # Neter 2003: -1.05 mmHg/kg
    total = total + C.SBP_PER_SODIUM_MG * sodium_cut             # He 2013: -5.8 mmHg/2,300 mg
    if alcohol_halved_heavy:
        total = total + draw("alcohol_sbp")
    frac = min(aerobic_per_week / C.AEROBIC_FULL_EFFECT_PER_WEEK, 1.0)
    if frac > 0:
        total = total + draw("aerobic_sbp") * frac
    return total


def cvd_relative_risk(delta_sbp):
    """Ettehad 2016: 수축기 10 mmHg 감소당 주요 심혈관사건 RR 0.80 (로그선형, 증가 방향은 대칭 외삽)."""
    rr10 = effects()["sbp_cvd"]["effect"]
    return np.power(rr10, -np.asarray(delta_sbp) / 10)
