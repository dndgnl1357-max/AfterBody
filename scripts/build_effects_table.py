"""
MediUp - 생활습관 변화의 인과 효과 크기 (RCT·메타분석, 2026-11-10 원문 확인)

국민건강영양조사 모델은 역인과로 생활습관 효과를 추정할 수 없어(→ train_risk_models.py),
시뮬레이션 엔진은 행동 변화의 효과를 이 표의 값으로 계산한다.
출력: data/nutrition.db 의 ref_effects, data/reference/ref_effects.csv
"""
import sqlite3
from pathlib import Path

import pandas as pd

ROOT = Path(r"C:\mediup")

COLS = ["id", "intervention", "outcome", "effect", "ci_low", "ci_high", "per", "population", "design", "source", "url", "note"]
ROWS = [
    ("weight_sbp", "체중 감량", "수축기혈압(mmHg)", -1.05, -1.43, -0.66, "체중 1kg 감량", "성인 4,874명",
     "RCT 25건 메타분석", "Neter 2003, Hypertension 42:878", "https://doi.org/10.1161/01.HYP.0000094221.86888.AE", ""),
    ("weight_dbp", "체중 감량", "이완기혈압(mmHg)", -0.92, -1.28, -0.55, "체중 1kg 감량", "성인 4,874명",
     "RCT 25건 메타분석", "Neter 2003, Hypertension 42:878", "https://doi.org/10.1161/01.HYP.0000094221.86888.AE", ""),
    ("salt_sbp", "나트륨 감량", "수축기혈압(mmHg)", -4.18, -5.18, -3.18, "소금 4.4g/일(나트륨 약 1,730mg) 감량",
     "고혈압·정상 혼합", "RCT 34건 메타분석", "He 2013, BMJ 346:f1325", "https://doi.org/10.1136/bmj.f1325",
     "고혈압자는 -5.39. 회귀: 나트륨 100mmol(소금 6g) 감량당 -5.8"),
    ("alcohol_sbp", "절주", "수축기혈압(mmHg)", -5.50, -6.70, -4.30, "음주량 약 50% 감량",
     "하루 6잔 이상 음주자", "RCT 36건 메타분석", "Roerecke 2017, Lancet Public Health 2:e108",
     "https://pmc.ncbi.nlm.nih.gov/articles/PMC6118407",
     "하루 2잔 이하 음주자는 유의한 변화 없음(역치 효과) → 엔진은 고위험음주자에게만 적용"),
    ("aerobic_sbp", "유산소 운동", "수축기혈압(mmHg)", -3.5, -4.6, -2.3, "4주 이상 규칙적 지구력 운동",
     "건강 성인 5,223명", "RCT 93건 메타분석", "Cornelissen 2013, JAHA 2:e004473",
     "https://doi.org/10.1161/JAHA.112.004473", "고혈압자는 약 -8.3 (추정 불확실성 큼)"),
    ("weight_dm", "체중 감량", "당뇨병 발생위험(상대위험)", 0.84, None, None, "체중 1kg 감량",
     "당뇨 전단계 고위험군 1,079명", "DPP 생활습관군 분석(관찰적)", "Hamman 2006, Diabetes Care 29:2102",
     "https://pubmed.ncbi.nlm.nih.gov/16936160/", "5kg당 HR 0.42~0.49. 연관 추정치이므로 '추정' 표시"),
    ("sbp_cvd", "혈압 감소", "주요 심혈관사건(상대위험)", 0.80, 0.77, 0.83, "수축기혈압 10mmHg 감소",
     "61만 명", "RCT 123건 메타분석", "Ettehad 2016, Lancet 387:957",
     "https://doi.org/10.1016/S0140-6736(15)01225-8", "뇌졸중 0.73, 관상동맥질환 0.83, 심부전 0.72"),
]


def main():
    df = pd.DataFrame(ROWS, columns=COLS)
    con = sqlite3.connect(ROOT / "data" / "nutrition.db")
    df.to_sql("ref_effects", con, index=False, if_exists="replace")
    con.commit()
    con.close()
    df.to_csv(ROOT / "data" / "reference" / "ref_effects.csv", index=False, encoding="utf-8-sig")
    print(f"[ref_effects] {len(df)}행 저장")


if __name__ == "__main__":
    main()
