"""
MediUp - 1주차 데이터 정리 (MVP용 통합 DB 구축)

입력 (C:\\mediup 루트):
  - 20260929_가공식품DB_323197건.xlsx   (P, 식약처 최신 엑셀 배포본)
  - 20260828_음식DB_19617건.xlsx        (D)
  - 20260623_건강기능식품DB_5556건 (3).xlsx (F)
  - data/nutrition.db 의 기존 nutrition_items 중 원재료성(R) 3,701건 (엑셀 신규본 없음 → 유지)
  - HN24_ALL(SAS) (1).zip               (국민건강영양조사 2024 원시자료)
  - 국민건강보험공단_직역별 성별 연령별 건강검진정보_20231231.csv

출력 (data/nutrition.db):
  - food_nutrition      : 통합 영양성분 테이블 (R/D/P/F, foodCd 고유)
  - knhanes_2024_adult  : HN24 성인(19세+) 정제 테이블 (무응답코드 → NULL, 파생변수 포함)
  - nhis_checkup_2022   : 건보공단 집계 CSV
  - 기존 nutrition_items 는 food_nutrition 으로 대체되어 삭제 (백업: data/nutrition_backup_20260922.db)
  또한 data/processed/knhanes_2024_adult.csv 로 내보냄.

사용:  python scripts/build_clean_db.py [--skip-food]
"""
import csv
import sqlite3
import sys
import zipfile
import tempfile
from pathlib import Path

import numpy as np
import openpyxl
import pandas as pd

ROOT = Path(r"C:\mediup")
DB = ROOT / "data" / "nutrition.db"
OUT_DIR = ROOT / "data" / "processed"

FOOD_FILES = [
    ROOT / "20260828_음식DB_19617건.xlsx",
    ROOT / "20260623_건강기능식품DB_5556건 (3).xlsx",
    ROOT / "20260929_가공식품DB_323197건.xlsx",
]

# 엑셀 헤더(여러 표기) → DB 컬럼. 기존 nutrition_items(API) 컬럼명과 호환되게 맞춤.
TEXT_MAP = {
    "foodCd": ["식품코드"],
    "foodNm": ["식품명"],
    "dataCd": ["데이터구분코드"],
    "typeNm": ["데이터구분명"],
    "foodOriginCd": ["식품기원코드"],
    "foodOriginNm": ["식품기원명"],
    "foodLv3Cd": ["식품대분류코드"],
    "foodLv3Nm": ["식품대분류명"],
    "foodLv4Cd": ["대표식품코드"],
    "foodLv4Nm": ["대표식품명"],
    "foodLv5Cd": ["식품중분류코드"],
    "foodLv5Nm": ["식품중분류명"],
    "foodLv6Cd": ["식품소분류코드"],
    "foodLv6Nm": ["식품소분류명"],
    "foodLv7Cd": ["식품세분류코드"],
    "foodLv7Nm": ["식품세분류명"],
    "nutConSrtrQua": ["영양성분함량기준량", "영양성분제공단위량"],
    "servSize": ["1회 섭취참고량", "1인(회)분량 참고량", "1회분량중량/부피"],
    "foodSize": ["식품중량", "식품중량/부피"],
    "mfrNm": ["제조사명", "업체명"],
    "srcNm": ["출처명"],
    "crtrYmd": ["데이터기준일자"],
}
NUM_MAP = {
    "enerc": ["에너지(kcal)"],
    "water": ["수분(g)"],
    "prot": ["단백질(g)"],
    "fatce": ["지방(g)"],
    "ash": ["회분(g)"],
    "chocdf": ["탄수화물(g)"],
    "sugar": ["당류(g)"],
    "fibtg": ["식이섬유(g)"],
    "ca": ["칼슘(mg)"],
    "fe": ["철(mg)"],
    "p": ["인(mg)"],
    "k": ["칼륨(mg)"],
    "nat": ["나트륨(mg)"],
    "vitaRae": ["비타민A(μg RAE)", "비타민 A(μg RAE)"],
    "retol": ["레티놀(μg)"],
    "cartb": ["베타카로틴(μg)"],
    "thia": ["티아민(mg)"],
    "ribf": ["리보플라빈(mg)"],
    "nia": ["니아신(mg)"],
    "vitc": ["비타민 C(mg)"],
    "vitd": ["비타민 D(μg)"],
    "chole": ["콜레스테롤(mg)"],
    "fasat": ["포화지방산(g)"],
    "fatrn": ["트랜스지방산(g)"],
    "mg": ["마그네슘(mg)"],
    "alcohol": ["알코올(g)"],
    "caffeine": ["카페인(mg)"],
}
FOOD_COLS = list(TEXT_MAP) + list(NUM_MAP)


def _num(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s == "" or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _txt(v):
    if v is None:
        return None
    s = str(v).replace("\ufeff", "").strip()
    return s or None


def read_food_xlsx(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = [_txt(h) for h in next(rows)]
    idx = {}
    for col, names in {**TEXT_MAP, **NUM_MAP}.items():
        idx[col] = next((header.index(n) for n in names if n in header), None)
    missing = [c for c, i in idx.items() if i is None]
    if missing:
        print(f"  (컬럼 없음, NULL 처리: {missing})")
    out = []
    for r in rows:
        if r is None or r[0] is None:
            continue
        rec = []
        for c in TEXT_MAP:
            i = idx[c]
            rec.append(_txt(r[i]) if i is not None and i < len(r) else None)
        for c in NUM_MAP:
            i = idx[c]
            rec.append(_num(r[i]) if i is not None and i < len(r) else None)
        out.append(rec)
    wb.close()
    return out


def build_food(con):
    print("[food] 원재료성(R) 기존 데이터 보존")
    old_cols = {r[1] for r in con.execute("PRAGMA table_info(nutrition_items)")}
    sel = ", ".join(c if c in old_cols else "NULL" for c in FOOD_COLS)
    n_text = len(TEXT_MAP)
    r_rows = [
        list(r[:n_text]) + [_num(v) for v in r[n_text:]]  # API 원본의 '' 문자열 → NULL/REAL
        for r in con.execute(f"SELECT {sel} FROM nutrition_items WHERE dataCd='R'")
    ]
    old_counts = dict(con.execute("SELECT dataCd, COUNT(*) FROM nutrition_items GROUP BY dataCd"))
    print(f"  R {len(r_rows)}건")

    con.execute("DROP TABLE IF EXISTS food_nutrition")
    coldefs = ", ".join(
        [f"{c} TEXT" + (" PRIMARY KEY" if c == "foodCd" else "") for c in TEXT_MAP]
        + [f"{c} REAL" for c in NUM_MAP]
    )
    con.execute(f"CREATE TABLE food_nutrition ({coldefs})")
    ph = ", ".join("?" * len(FOOD_COLS))
    ins = f"INSERT OR IGNORE INTO food_nutrition ({', '.join(FOOD_COLS)}) VALUES ({ph})"
    con.executemany(ins, r_rows)

    for f in FOOD_FILES:
        print(f"[food] 읽는 중: {f.name}")
        recs = read_food_xlsx(f)
        before = con.total_changes
        con.executemany(ins, recs)
        added = con.total_changes - before
        print(f"  행 {len(recs)} → 적재 {added} (중복코드 {len(recs) - added} 제외)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_food_data ON food_nutrition(dataCd)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_food_lv4 ON food_nutrition(foodLv4Cd)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_food_nm ON food_nutrition(foodNm)")

    new_counts = dict(con.execute("SELECT dataCd, COUNT(*) FROM food_nutrition GROUP BY dataCd"))
    print("[food] 구분별 건수 (기존 → 신규):")
    for k in sorted(set(old_counts) | set(new_counts)):
        print(f"  {k}: {old_counts.get(k, 0)} → {new_counts.get(k, 0)}")
    # 기존 API 수집분 중 신규 엑셀에 없는 코드 수 (단종 제품 등)
    lost = con.execute(
        "SELECT dataCd, COUNT(*) FROM nutrition_items n "
        "WHERE NOT EXISTS (SELECT 1 FROM food_nutrition f WHERE f.foodCd=n.foodCd) GROUP BY dataCd"
    ).fetchall()
    print(f"  기존에 있었으나 신규본에 없는 코드: {lost or '없음'}")
    no_kcal = con.execute("SELECT COUNT(*) FROM food_nutrition WHERE enerc IS NULL").fetchone()[0]
    print(f"  에너지 값 없는 행: {no_kcal}")
    con.execute("DROP TABLE nutrition_items")
    con.commit()


# ---------------------------------------------------------------- KNHANES
def _clean(s, valid):
    """valid 범위 밖(8/9/88/99 등 무응답·비해당 코드)을 NaN 으로."""
    return s.where(s.isin(valid))


def build_knhanes(con):
    zpath = ROOT / "HN24_ALL(SAS) (1).zip"
    print(f"[knhanes] {zpath.name} 읽는 중")
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(zpath) as z:
            z.extract("hn24_all.sas7bdat", td)
        raw = pd.read_sas(Path(td) / "hn24_all.sas7bdat", format="sas7bdat", encoding="cp949")
    print(f"  원자료 {raw.shape}")
    df = raw[raw["age"] >= 19].copy()

    o = pd.DataFrame(index=df.index)
    o["id"] = df["ID"]
    o["sex"] = df["sex"]  # 1 남, 2 여
    o["age"] = df["age"]
    o["incm"] = df["incm"]  # 소득4분위
    o["edu"] = df["edu"]
    for c in ["wt_itvex", "wt_tot", "wt_ntr", "kstrata", "psu"]:
        o[c] = df[c]

    # 검진 수치 (연속형, 결측은 원래 공란)
    exam = {
        "height": "HE_ht", "weight": "HE_wt", "bmi": "HE_BMI", "waist": "HE_wc",
        "sbp": "HE_sbp", "dbp": "HE_dbp", "glucose": "HE_glu", "hba1c": "HE_HbA1c",
        "tchol": "HE_chol", "tg": "HE_TG", "hdl": "HE_HDL_st2", "ldl": "HE_LDL_drct",
        "ast": "HE_ast", "alt": "HE_alt", "creatinine": "HE_crea", "fasting_hours": "HE_fst",
    }
    for k, v in exam.items():
        o[k] = df[v]

    # 음주 (8=비해당: 평생/최근1년 안 마심 → 0)
    f = df["BD1_11"].replace(8, 1)
    f = _clean(f, [1, 2, 3, 4, 5, 6])
    o["drink_freq_code"] = f - 1  # 0 안마심 ~ 5 주4회+
    o["drink_per_month"] = f.map({1: 0, 2: 0.5, 3: 1, 4: 3, 5: 10, 6: 20})
    q = _clean(df["BD2_1"], [1, 2, 3, 4, 5, 8])
    o["drink_amount_code"] = q.replace(8, 0)  # 0 안마심, 1:1-2잔 … 5:10잔+
    o.loc[o["drink_freq_code"] == 0, "drink_amount_code"] = 0
    o["high_risk_drink"] = np.where(
        o["drink_freq_code"].isna() | o["drink_amount_code"].isna(), np.nan,
        ((o["drink_freq_code"] >= 4)
         & (((o["sex"] == 1) & (o["drink_amount_code"] >= 4))
            | ((o["sex"] == 2) & (o["drink_amount_code"] >= 3)))).astype(float),
    )

    # 흡연: 1 매일, 2 가끔 → 현재흡연 / 3 과거 / 8 비흡연
    s = _clean(df["BS3_1"], [1, 2, 3, 8])
    o["smoke_status"] = s.map({8: 0, 3: 1, 1: 2, 2: 2})  # 0 비흡연 1 과거 2 현재
    o["smoke_current"] = (o["smoke_status"] == 2).astype(float).where(o["smoke_status"].notna())

    # 신체활동
    o["aerobic_pa"] = df["pa_aerobic"]
    o["walk_days"] = _clean(df["BE3_31"], range(1, 9)) - 1  # 0~7일

    # 수면 (취침·기상 시각 → 시간)
    def sleep_hours(bh, bm, wh, wm):
        bh = _clean(df[bh], range(0, 25)); wh = _clean(df[wh], range(0, 25))
        bm = _clean(df[bm], range(0, 60)).fillna(0); wm = _clean(df[wm], range(0, 60)).fillna(0)
        h = ((wh + wm / 60) - (bh + bm / 60)) % 24
        return h.where((h >= 2) & (h <= 16))
    o["sleep_weekday_h"] = sleep_hours("BP16_11", "BP16_12", "BP16_13", "BP16_14")
    o["sleep_weekend_h"] = sleep_hours("BP16_21", "BP16_22", "BP16_23", "BP16_24")
    o["sleep_avg_h"] = (o["sleep_weekday_h"] * 5 + o["sleep_weekend_h"] * 2) / 7

    # 영양 섭취 (24시간 회상 1일)
    nutr = {
        "kcal": "N_EN", "carb_g": "N_CHO", "sugar_g": "N_SUGAR", "fiber_g": "N_TDF",
        "protein_g": "N_PROT", "fat_g": "N_FAT", "sfa_g": "N_SFA", "chol_mg": "N_CHOL",
        "sodium_mg": "N_NA", "potassium_mg": "N_K",
    }
    for k, v in nutr.items():
        o[k] = df[v]

    # 복약 (8=비해당 → 복용 안 함)
    o["med_htn"] = _clean(df["DI1_2"], [1, 2, 3, 4, 5, 8]).map({1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 8: 0})
    o["med_lipid"] = _clean(df["DI2_2"], [1, 2, 3, 4, 5, 8]).map({1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 8: 0})
    ins = _clean(df["DE1_31"], [0, 1, 8]).replace(8, 0)
    oral = _clean(df["DE1_32"], [0, 1, 8]).replace(8, 0)
    o["med_dm"] = ((ins == 1) | (oral == 1)).astype(float).where(ins.notna() & oral.notna())

    # 질환 라벨 (질병관리청 정의, 복약 포함)
    o["y_htn"] = (df["HE_HP"] == 4).astype(float).where(df["HE_HP"].notna())
    o["y_dm"] = (df["HE_DM_HbA1c"] == 3).astype(float).where(df["HE_DM_HbA1c"].notna())
    o["y_hchol"] = df["HE_HCHOL"]
    o["y_htg"] = df["HE_HTG"]  # 12시간 공복자만 판정
    o["y_obese"] = (df["HE_obe"] >= 4).astype(float).where(df["HE_obe"].notna())

    con.execute("DROP TABLE IF EXISTS knhanes_2024_adult")
    o.to_sql("knhanes_2024_adult", con, index=False)
    OUT_DIR.mkdir(exist_ok=True)
    o.to_csv(OUT_DIR / "knhanes_2024_adult.csv", index=False, encoding="utf-8-sig")
    print(f"  성인 {len(o)}명, 변수 {o.shape[1]}개 저장")

    # 요약
    w = o["wt_itvex"]
    print("  결측률(%) 주요 변수:")
    for c in ["bmi", "sbp", "glucose", "hba1c", "drink_freq_code", "smoke_status",
              "aerobic_pa", "sleep_avg_h", "kcal", "y_htn", "y_dm", "y_hchol"]:
        print(f"    {c:16s} {o[c].isna().mean()*100:5.1f}")
    print("  가중 유병률(%, 공식 통계와 대조용):")
    for c in ["y_htn", "y_dm", "y_hchol", "y_obese", "smoke_current", "high_risk_drink"]:
        m = o[c].notna()
        print(f"    {c:16s} {np.average(o.loc[m, c], weights=w[m]) * 100:5.1f}")
    con.commit()


def build_nhis(con):
    p = ROOT / "국민건강보험공단_직역별 성별 연령별 건강검진정보_20231231.csv"
    df = pd.read_csv(p, encoding="cp949")
    df = df.apply(lambda s: pd.to_numeric(s.astype(str).str.strip().replace("", np.nan), errors="coerce")
                  if s.name not in ("직역", "연령(5세단위)", "성별") else s)
    df.to_sql("nhis_checkup_2022", con, index=False, if_exists="replace")
    con.commit()
    print(f"[nhis] {len(df)}행 저장")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    con = sqlite3.connect(DB)
    if "--skip-food" not in sys.argv:
        build_food(con)
    build_knhanes(con)
    build_nhis(con)
    con.execute("VACUUM")
    print("\n[DB 테이블]")
    for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        print(f"  {t}: {con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
    con.close()


if __name__ == "__main__":
    main()
