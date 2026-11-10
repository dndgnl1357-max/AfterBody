"""
MediUp - 2025 한국인 영양소 섭취기준(KDRI, 보건복지부) 성인 기준치 테이블

출처 (C:\\mediup 의 PDF, 쪽수는 PDF 페이지):
  1권 에너지와 다량영양소  p.8 (에너지적정비율·당류), p.9 (에너지·탄수화물·식이섬유), p.10 (단백질),
                           p.69-70 표 12·13 (성인·노인 에너지필요추정량 산출식, 신체활동계수)
  3권 무기질               p.16 (나트륨 만성질환위험감소섭취량, 칼륨 충분섭취량)

※ 1인 1회 분량표는 1~3권에 없음 (2025 '활용편'으로 별도 출간 예정이라고 명시, p.36)

출력: data/nutrition.db 의 ref_kdri_adult, data/reference/ref_kdri_adult.csv
엔진에서 쓰는 함수: eer(sex, age, weight_kg, height_m, pa_level)
"""
import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(r"C:\mediup")
DB = ROOT / "data" / "nutrition.db"
OUT = ROOT / "data" / "reference"

# 성인 EER 산출식 (표 12·13):  a - b×나이 + PA×[c×체중(kg) + d×신장(m)]
EER_COEF = {1: (662, 9.53, 15.91, 539.6), 2: (354, 6.91, 9.36, 726)}  # 1 남, 2 여
PA = {  # 신체활동계수 (19세 이상)
    1: {"비활동적": 1.0, "저활동적": 1.11, "활동적": 1.25, "매우활동적": 1.48},
    2: {"비활동적": 1.0, "저활동적": 1.12, "활동적": 1.27, "매우활동적": 1.45},
}


def eer(sex, age, weight_kg, height_m, pa_level="저활동적"):
    """개인 에너지필요추정량(kcal/일). KDRI는 한국 성인 평균을 '저활동적'으로 봄."""
    a, b, c, d = EER_COEF[sex]
    return a - b * age + PA[sex][pa_level] * (c * weight_kg + d * height_m)


# (성별, 연령구간, 나이하한, 나이상한, 에너지 설정값, 단백질 권장, 식이섬유 충분, 나트륨 CDRR, 칼륨 충분)
ROWS = [
    (1, "19-29", 19, 29, 2600, 65, 30, 2300, 3500),
    (1, "30-49", 30, 49, 2500, 65, 30, 2300, 3500),
    (1, "50-64", 50, 64, 2200, 60, 30, 2300, 3500),
    (1, "65-74", 65, 74, 2000, 60, 30, 1900, 3500),
    (1, "75+", 75, 200, 1900, 60, 30, 1800, 3500),
    (2, "19-29", 19, 29, 2000, 55, 20, 2300, 3500),
    (2, "30-49", 30, 49, 1900, 50, 20, 2300, 3500),
    (2, "50-64", 50, 64, 1700, 50, 25, 2300, 3500),
    (2, "65-74", 65, 74, 1600, 50, 25, 1900, 3500),
    (2, "75+", 75, 200, 1500, 50, 25, 1800, 3500),
]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    df = pd.DataFrame(ROWS, columns=["sex", "age_group", "age_min", "age_max", "eer_kcal",
                                     "protein_rni_g", "fiber_ai_g", "sodium_cdrr_mg", "potassium_ai_mg"])
    # 전 성인 공통값 (1권 p.8·9)
    df["carb_rni_g"] = 130
    df["amdr_carb_pct"] = "50-65"
    df["amdr_protein_pct"] = "10-20"
    df["amdr_fat_pct"] = "15-30"
    df["sfa_max_pct"] = 7
    df["trans_fat_max_pct"] = 1
    df["cholesterol_max_mg"] = 300
    df["total_sugar_max_pct"] = 20
    df["added_sugar_max_pct"] = 10
    df["source"] = "2025 한국인 영양소 섭취기준 (보건복지부)"

    con = sqlite3.connect(DB)
    df.to_sql("ref_kdri_adult", con, index=False, if_exists="replace")
    pa = pd.DataFrame([{"sex": s, "pa_level": k, "pa_coef": v} for s, d in PA.items() for k, v in d.items()])
    pa.to_sql("ref_kdri_pa", con, index=False, if_exists="replace")
    con.commit()
    con.close()
    OUT.mkdir(exist_ok=True)
    df.to_csv(OUT / "ref_kdri_adult.csv", index=False, encoding="utf-8-sig")
    print(f"[ref_kdri_adult] {len(df)}행, [ref_kdri_pa] {len(pa)}행 저장")

    # 검증: PDF 표 12·13의 산출값 재현
    checks = [(1, 24, 69.1, 1.748, 2701), (1, 39.5, 68.0, 1.734, 2525), (2, 24, 55.9, 1.615, 2087),
              (2, 57, 52.5, 1.567, 1785), (1, 69.5, 62.7, 1.665, 2104), (2, 75, 46.2, 1.469, 1515)]
    for s, a, w, h, expected in checks:
        got = eer(s, a, w, h)
        print(f"  EER 검증 sex={s} age={a}: 계산 {got:.0f} / PDF {expected}  {'OK' if abs(got - expected) <= 1 else 'X'}")


if __name__ == "__main__":
    main()
