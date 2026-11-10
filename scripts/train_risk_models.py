"""
MediUp - 2주차: 만성질환 위험 예측 모델 (국민건강영양조사 2024 성인)

대상 질환 : 고혈압(y_htn), 당뇨병(y_dm), 고콜레스테롤혈증(y_hchol)  — 질병관리청 정의(복약 포함)
입력 변수 : 시뮬레이션에서 바뀔 수 있는 값 + 기본 특성만 사용
            (혈압·혈당·콜레스테롤 등 질환을 '정의'하는 검사값은 넣지 않음 → 정답 누설 방지)
모델      : ① 로지스틱 회귀(나이·BMI 스플라인)  ② HistGradientBoosting  — 5겹 교차검증으로 비교
가중치    : 검진조사 가중치(wt_itvex) → 예측확률이 한국 성인 인구 기준으로 맞춰짐

주의 (결과 해석):
  - 단면조사라 "이 조건의 사람들 중 해당 질환을 가진 비율"이지 '미래 발병 확률'이 아님
  - 진단 후 생활습관을 바꾼 사람(역인과)이 섞여 있어 음주·운동 효과가 왜곡될 수 있음
    → 복약자 제외 모델로 방향을 비교하는 민감도 분석을 함께 출력

출력: models/risk_<질환>.joblib, models/risk_report.txt
사용: python scripts/train_risk_models.py
"""
import sqlite3
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

ROOT = Path(r"C:\mediup")
DB = ROOT / "data" / "nutrition.db"
MODEL_DIR = ROOT / "models"

TARGETS = {"y_htn": ("고혈압", "med_htn"), "y_dm": ("당뇨병", "med_dm"), "y_hchol": ("고콜레스테롤혈증", "med_lipid")}

SPLINE = ["age", "bmi"]                       # 비선형 (나이·BMI는 위험과 곡선 관계)
LINEAR = ["drink_per_month", "drink_amount_code", "aerobic_pa", "walk_days", "sleep_avg_h",
          "kcal", "sodium_mg", "sugar_g", "sfa_g", "fiber_g", "potassium_mg", "incm", "edu"]
CATEG = ["sex", "smoke_status"]
FEATURES = SPLINE + LINEAR + CATEG
# 최종(엔진용) 모델: 생활습관 변수를 다 넣어도 AUC가 0.005 내외만 오르고, 음주·당류 등은 역인과로
# 방향이 뒤집혀 시뮬레이션에 쓸 수 없음 → 안정적인 핵심 변수만 사용. 생활습관 효과는 문헌 효과크기로 별도 반영.
CORE = ["age", "bmi", "sex", "smoke_status"]

LABEL_KO = {
    "age": "나이", "bmi": "BMI", "drink_per_month": "월 음주횟수", "drink_amount_code": "1회 음주량(단계)",
    "aerobic_pa": "유산소 신체활동 실천", "walk_days": "주간 걷기 일수", "sleep_avg_h": "평균 수면시간",
    "kcal": "섭취 열량", "sodium_mg": "나트륨", "sugar_g": "당류", "sfa_g": "포화지방", "fiber_g": "식이섬유",
    "potassium_mg": "칼륨", "incm": "소득4분위", "edu": "교육수준",
}
# 효과 크기 해석용 단위 (오즈비를 '이만큼 늘 때'로 표시)
UNIT = {"drink_per_month": 4, "drink_amount_code": 1, "aerobic_pa": 1, "walk_days": 3, "sleep_avg_h": 1,
        "kcal": 500, "sodium_mg": 1000, "sugar_g": 25, "sfa_g": 10, "fiber_g": 10, "potassium_mg": 1000,
        "incm": 1, "edu": 1}


def make_logit():
    pre = ColumnTransformer([
        ("spl", make_pipeline(SimpleImputer(strategy="median"),
                              SplineTransformer(n_knots=4, degree=3)), SPLINE),
        ("lin", make_pipeline(SimpleImputer(strategy="median"), StandardScaler()), LINEAR),
        ("cat", make_pipeline(SimpleImputer(strategy="most_frequent"),
                              OneHotEncoder(drop="first", handle_unknown="ignore")), CATEG),
    ])
    return Pipeline([("pre", pre), ("clf", LogisticRegression(max_iter=2000, C=1.0))])


def make_core():
    pre = ColumnTransformer([
        ("spl", make_pipeline(SimpleImputer(strategy="median"),
                              SplineTransformer(n_knots=4, degree=3)), ["age", "bmi"]),
        ("cat", make_pipeline(SimpleImputer(strategy="most_frequent"),
                              OneHotEncoder(drop="first", handle_unknown="ignore")), ["sex", "smoke_status"]),
    ])
    return Pipeline([("pre", pre), ("clf", LogisticRegression(max_iter=2000))])


def make_gbm():
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
        l2_regularization=1.0, categorical_features=[FEATURES.index(c) for c in CATEG], random_state=0)


def cv_eval(make, X, y, w, seed=0):
    skf = StratifiedKFold(5, shuffle=True, random_state=seed)
    pred = np.zeros(len(y))
    for tr, te in skf.split(X, y):
        m = make()
        m.fit(X.iloc[tr], y.iloc[tr], **_fit_kw(m, w[tr]))
        pred[te] = m.predict_proba(X.iloc[te])[:, 1]
    return {"auc": roc_auc_score(y, pred, sample_weight=w), "brier": brier_score_loss(y, pred, sample_weight=w),
            "pred": pred}


def _fit_kw(m, w):
    return {"clf__sample_weight": w} if isinstance(m, Pipeline) else {"sample_weight": w}


def calibration_table(y, p, w, bins=5):
    q = pd.qcut(p, bins, labels=False, duplicates="drop")
    rows = []
    for b in sorted(set(q)):
        m = q == b
        rows.append(f"    구간{b + 1}: 예측 {np.average(p[m], weights=w[m]) * 100:5.1f}%  "
                    f"실제 {np.average(y[m], weights=w[m]) * 100:5.1f}%  (n={m.sum()})")
    return rows


def odds_ratios(model, X):
    """선형 변수: UNIT 만큼 증가 시 오즈비 (다른 변수 고정)"""
    coefs = model.named_steps["clf"].coef_[0]
    names = model.named_steps["pre"].get_feature_names_out()
    scaler = model.named_steps["pre"].named_transformers_["lin"].named_steps["standardscaler"]
    out = {}
    for i, f in enumerate(LINEAR):
        b = coefs[list(names).index(f"lin__{f}")] / scaler.scale_[i]
        out[f] = float(np.exp(b * UNIT[f]))
    for f in ["smoke_status_1.0", "smoke_status_2.0", "sex_2.0"]:
        k = f"cat__{f}"
        if k in names:
            out[f] = float(np.exp(coefs[list(names).index(k)]))
    return out


def scenario_check(model, base, features=None):
    """시뮬레이션 반응 점검: 기본 인물에서 한 변수씩 바꿨을 때 위험 변화"""
    cases = {
        "기준 (45세 남, BMI 27, 월 10회 음주·1회 5-6잔, 현재흡연, 운동X, 나트륨 4000)": {},
        "BMI 27 → 24": {"bmi": 24},
        "음주 월 10회 → 2회": {"drink_per_month": 2},
        "유산소 운동 실천": {"aerobic_pa": 1, "walk_days": 5},
        "나트륨 4000 → 2300mg": {"sodium_mg": 2300},
        "위 4가지 모두": {"bmi": 24, "drink_per_month": 2, "aerobic_pa": 1, "walk_days": 5, "sodium_mg": 2300},
    }
    rows = []
    for name, ch in cases.items():
        x = base.copy()
        for k, v in ch.items():
            x[k] = v
        rows.append((name, float(model.predict_proba(pd.DataFrame([x])[features or FEATURES])[:, 1][0])))
    return rows


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    MODEL_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    df = pd.read_sql("SELECT * FROM knhanes_2024_adult", con)
    con.close()

    base = {"age": 45, "sex": 1, "bmi": 27, "drink_per_month": 10, "drink_amount_code": 3, "smoke_status": 2,
            "aerobic_pa": 0, "walk_days": 1, "sleep_avg_h": 6.5, "kcal": 2400, "sodium_mg": 4000,
            "sugar_g": 50, "sfa_g": 20, "fiber_g": 20, "potassium_mg": 2800, "incm": 2, "edu": 3}

    report = []
    log = lambda s="": (print(s), report.append(s))
    for y_col, (name, med_col) in TARGETS.items():
        d = df[df[y_col].notna() & df["wt_itvex"].notna()].reset_index(drop=True)
        X, y, w = d[FEATURES], d[y_col].astype(int), d["wt_itvex"].to_numpy()
        w = w / w.mean()
        log(f"\n{'=' * 70}\n[{name}]  n={len(d)}, 유병 {y.sum()}명 (가중 {np.average(y, weights=w) * 100:.1f}%)")

        r_lr = cv_eval(make_logit, X, y, w)
        r_gb = cv_eval(make_gbm, X, y, w)
        log(f"  5겹 교차검증  로지스틱 AUC {r_lr['auc']:.3f} / Brier {r_lr['brier']:.3f}"
            f"   |  GBM AUC {r_gb['auc']:.3f} / Brier {r_gb['brier']:.3f}")
        # 나이·성별만 쓴 기준선: 생활습관 변수가 실제로 얼마나 보태는지
        r_age = cv_eval(lambda: Pipeline([("pre", ColumnTransformer([
            ("spl", SplineTransformer(n_knots=4), ["age"]), ("cat", OneHotEncoder(drop="first"), ["sex"])])),
            ("clf", LogisticRegression(max_iter=1000))]), d[["age", "sex"]], y, w)
        log(f"  (기준선: 나이·성별만 AUC {r_age['auc']:.3f})")
        log("  보정(로지스틱, 예측확률 5분위):")
        for line in calibration_table(y.to_numpy(), r_lr["pred"], w):
            log(line)

        model = make_logit().fit(X, y, clf__sample_weight=w)
        ors = odds_ratios(model, X)

        # 민감도: 복약자 제외 (진단 후 생활습관 변화의 영향 확인)
        d2 = d[d[med_col] != 1].reset_index(drop=True)
        w2 = d2["wt_itvex"].to_numpy() / d2["wt_itvex"].mean()
        m2 = make_logit().fit(d2[FEATURES], d2[y_col].astype(int), clf__sample_weight=w2)
        ors2 = odds_ratios(m2, d2[FEATURES])
        log(f"  오즈비 (괄호: 복약자 {len(d) - len(d2)}명 제외 시, 유병 {int(d2[y_col].sum())}명)")
        for f in LINEAR:
            flag = "  ⚠ 방향 반대" if (ors[f] - 1) * (ors2[f] - 1) < 0 and abs(np.log(ors[f])) > 0.05 else ""
            log(f"    {LABEL_KO[f]:14s} +{UNIT[f]:<5} → OR {ors[f]:.2f} ({ors2[f]:.2f}){flag}")
        for f, ko in [("smoke_status_1.0", "과거흡연 vs 비흡연"), ("smoke_status_2.0", "현재흡연 vs 비흡연"),
                      ("sex_2.0", "여성 vs 남성")]:
            if f in ors:
                log(f"    {ko:14s}        → OR {ors[f]:.2f} ({ors2.get(f, float('nan')):.2f})")

        log("  시뮬레이션 반응 점검 (전체변수 모델 — 참고용, 엔진에는 사용 안 함):")
        for nm, p in scenario_check(model, base):
            log(f"    {nm:60s} {p * 100:5.1f}%")

        # 최종 모델 (핵심 변수)
        r_core = cv_eval(make_core, d[CORE], y, w)
        core = make_core().fit(d[CORE], y, clf__sample_weight=w)
        log(f"  ▶ 최종 모델(나이·BMI·성별·흡연) AUC {r_core['auc']:.3f} / Brier {r_core['brier']:.3f}")
        for nm, p in scenario_check(core, base, CORE)[:2]:
            log(f"    {nm:60s} {p * 100:5.1f}%")
        joblib.dump({"model": core, "features": CORE, "target": y_col, "name": name,
                     "cv_auc": r_core["auc"], "cv_auc_full": r_lr["auc"], "cv_auc_gbm": r_gb["auc"],
                     "n": len(d)}, MODEL_DIR / f"risk_{y_col[2:]}.joblib")

    (MODEL_DIR / "risk_report.txt").write_text("\n".join(report), encoding="utf-8")
    print(f"\n모델·리포트 저장: {MODEL_DIR}")


if __name__ == "__main__":
    main()
