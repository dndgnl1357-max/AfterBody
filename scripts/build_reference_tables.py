"""
MediUp - 시뮬레이션용 참고표 3종 생성 (식약처 DB에 없는 값 보완)

  ref_alcohol   : 주종별 도수·용량·알코올 g·열량 (주류는 식약처 영양 DB에 없음)
  ref_exercise  : 운동별 MET (Compendium of Physical Activities, Ainsworth et al. 2011)
  ref_gi        : 식품별 혈당지수 GI (International Tables of GI, Atkinson et al. 2008/2021, 포도당=100)

data/nutrition.db 에 테이블로, data/reference/*.csv 로도 저장.
모든 값은 "대표값"이며 제품·조리법에 따라 달라짐 → 앱 화면에는 '추정치'로 표시할 것.

관련 공식 (simulation 엔진에서 사용):
  알코올(g)     = 용량(ml) × 도수(%)/100 × 0.789
  주류 열량     = 알코올 g × 7 + 탄수화물 g × 4
  표준잔        = 알코올 10 g (WHO 기준)
  혈중알코올(%) = 알코올 g / (체중 g × r) × 100 − 0.015 × 경과시간(h)   (Widmark, r: 남 0.68 / 여 0.55)
  운동 소모열량 = MET × 체중(kg) × 시간(h)      (순수 추가 소모 = (MET − 1) × 체중 × 시간)
  당부하지수 GL = GI × 섭취 탄수화물(g) / 100   (GL ≥20 높음, 11–19 중간, ≤10 낮음)
"""
import re
import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(r"C:\mediup")
DB = ROOT / "data" / "nutrition.db"
OUT = ROOT / "data" / "reference"
ETHANOL_DENSITY = 0.789

# ---------------------------------------------------------------- 주류
# (이름, 분류, 도수%, 탄수화물 g/100ml, 기본 1잔 ml, 1잔 단위명, 1병/캔 ml, 병 단위명, 비고)
# 탄수화물은 USDA FoodData Central 및 국내 제품 표시값 범위의 대표값
ALCOHOL = [
    ("맥주(라거)", "맥주", 4.5, 3.1, 200, "맥주잔", 500, "캔(500ml)", "국산 라거 4.5~5%"),
    ("맥주 355ml캔", "맥주", 4.5, 3.1, 355, "캔", 355, "캔(355ml)", ""),
    ("생맥주 500cc", "맥주", 4.5, 3.1, 500, "잔(500cc)", 500, "잔", ""),
    ("흑맥주/에일", "맥주", 5.5, 4.0, 330, "병", 330, "병(330ml)", ""),
    ("무알코올맥주", "맥주", 0.0, 4.0, 355, "캔", 355, "캔", "0.0% 기준, 제품별 당 차이 큼"),
    ("소주(희석식)", "소주", 16.5, 0.0, 50, "소주잔", 360, "병(360ml)", "참이슬·처음처럼류 16~16.5%"),
    ("막걸리", "막걸리", 6.0, 3.0, 200, "사발", 750, "병(750ml)", ""),
    ("레드와인", "와인", 13.0, 2.6, 150, "와인잔", 750, "병(750ml)", ""),
    ("화이트와인", "와인", 12.0, 2.6, 150, "와인잔", 750, "병(750ml)", ""),
    ("청주/사케", "청주", 15.0, 4.5, 50, "잔", 300, "병(300ml)", ""),
    ("위스키", "증류주", 40.0, 0.0, 30, "샷", 700, "병(700ml)", ""),
    ("고량주", "증류주", 40.0, 0.0, 30, "잔", 250, "병(250ml)", "도수 제품별 30~60%"),
]


def build_alcohol():
    rows = []
    for nm, cat, abv, carb, cup, cup_u, bottle, bottle_u, note in ALCOHOL:
        alc100 = abv / 100 * 100 * ETHANOL_DENSITY  # g / 100ml
        kcal100 = alc100 * 7 + carb * 4
        rows.append({
            "name": nm, "category": cat, "abv_pct": abv,
            "alcohol_g_per_100ml": round(alc100, 2), "carb_g_per_100ml": carb,
            "kcal_per_100ml": round(kcal100, 1),
            "serving_ml": cup, "serving_unit": cup_u,
            "serving_alcohol_g": round(alc100 * cup / 100, 1),
            "serving_kcal": round(kcal100 * cup / 100),
            "serving_std_drinks": round(alc100 * cup / 100 / 10, 2),
            "bottle_ml": bottle, "bottle_unit": bottle_u,
            "bottle_alcohol_g": round(alc100 * bottle / 100, 1),
            "bottle_kcal": round(kcal100 * bottle / 100),
            "note": note,
            "source": "도수: 국내 대표제품 / 열량: 알코올7kcal·탄수4kcal 계산",
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- 운동 MET
# (이름, 분류, 강도, MET, Compendium 2011 코드)
EXERCISE = [
    ("걷기 느리게 (3.2km/h)", "걷기", "저", 2.8, "17152"),
    ("걷기 보통 (4.0km/h)", "걷기", "저", 3.0, "17170"),
    ("걷기 보통 (4.8km/h)", "걷기", "중", 3.5, "17190"),
    ("걷기 빠르게 (5.6km/h)", "걷기", "중", 4.3, "17200"),
    ("걷기 매우 빠르게 (6.4km/h)", "걷기", "중", 5.0, "17220"),
    ("계단 오르기 (느리게)", "걷기", "중", 4.0, "17133"),
    ("계단 오르기 (빠르게)", "걷기", "고", 8.8, "17134"),
    ("등산", "걷기", "고", 6.0, "17080"),
    ("달리기 (6.4km/h)", "달리기", "고", 6.0, "12020"),
    ("달리기 (8.0km/h)", "달리기", "고", 8.3, "12030"),
    ("달리기 (9.7km/h)", "달리기", "고", 9.8, "12050"),
    ("달리기 (11.3km/h)", "달리기", "고", 11.0, "12070"),
    ("자전거 여가용 (16km/h 미만)", "자전거", "중", 4.0, "01010"),
    ("자전거 (16~19km/h)", "자전거", "고", 6.8, "01040"),
    ("자전거 (19~22km/h)", "자전거", "고", 8.0, "01050"),
    ("실내자전거 보통", "자전거", "고", 6.8, "02013"),
    ("수영 자유형 느리게", "수영", "중", 5.8, "18240"),
    ("수영 자유형 빠르게", "수영", "고", 9.8, "18230"),
    ("근력운동 (일반)", "근력", "중", 3.5, "02054"),
    ("근력운동 (고강도)", "근력", "고", 6.0, "02050"),
    ("맨몸운동 (팔굽혀펴기·스쿼트 등, 고강도)", "근력", "고", 8.0, "02020"),
    ("요가", "유연성", "저", 2.5, "02150"),
    ("필라테스", "유연성", "저", 3.0, "02105"),
    ("스트레칭", "유연성", "저", 2.3, "02101"),
    ("에어로빅", "유산소", "고", 7.3, "03015"),
    ("줄넘기 (보통)", "유산소", "고", 11.8, "15552"),
    ("로잉머신 (보통)", "유산소", "고", 7.0, "02072"),
    ("일립티컬 (보통)", "유산소", "중", 5.0, "02048"),
    ("축구", "구기", "고", 7.0, "15610"),
    ("농구", "구기", "고", 6.5, "15055"),
    ("배드민턴", "구기", "중", 5.5, "15030"),
    ("테니스", "구기", "고", 7.3, "15675"),
    ("골프 (걸어서)", "구기", "중", 4.8, "15255"),
    ("집안 청소 (보통)", "생활", "중", 3.5, "05021"),
    ("앉아서 TV 시청", "생활", "휴식", 1.3, "07020"),
    ("사무 업무 (앉아서)", "생활", "휴식", 1.5, "11580"),
    ("수면", "생활", "휴식", 0.95, "07030"),
]


def build_exercise():
    df = pd.DataFrame(EXERCISE, columns=["name", "category", "intensity", "met", "compendium_code"])
    df["kcal_30min_per_60kg"] = (df["met"] * 60 * 0.5).round()
    df["source"] = "Compendium of Physical Activities 2011 (Ainsworth et al.)"
    return df


# ---------------------------------------------------------------- GI
# (이름, 분류, GI, 대상)  대상: "D:대표식품명" 또는 "R:대표식품코드[:식품명 포함 정규식]", '|' 로 여러 개
# GI는 조리법에 따라 크게 달라지므로(예: 고구마 삶은것 63 vs 구운것 더 높음) 측정 조건과 같은 형태에만 연결
GI = [
    ("흰쌀밥", "곡류", 73, "D:쌀밥|R:01013:백미"),
    ("현미밥", "곡류", 68, "D:현미밥|R:01013:현미"),
    ("찹쌀밥", "곡류", 92, "D:찰밥|R:01050"),
    ("보리밥", "곡류", 28, "D:보리밥|R:01026"),
    ("흰빵(식빵)", "곡류", 75, "D:식빵"),
    ("통밀빵", "곡류", 74, ""),
    ("라면(인스턴트면)", "면류", 47, "D:라면"),
    ("우동", "면류", 55, "D:우동"),
    ("스파게티", "면류", 49, "D:스파게티|R:01024:삶은"),
    ("오트밀 (죽)", "곡류", 55, ""),
    ("인스턴트 오트밀", "곡류", 79, ""),
    ("콘플레이크", "곡류", 81, "D:시리얼"),
    ("삶은 감자", "서류", 78, "R:02001:삶은|찐것"),
    ("감자튀김", "서류", 63, "D:감자튀김"),
    ("삶은 고구마", "서류", 63, "R:02006:삶은|찐것"),
    ("옥수수", "곡류", 52, "R:01030:삶은|찐것"),
    ("사과", "과일", 36, "R:08050:생것"),
    ("바나나", "과일", 51, "R:08037:생것"),
    ("오렌지", "과일", 43, "R:08069:생것"),
    ("수박", "과일", 76, "R:08061"),
    ("포도", "과일", 59, "R:08098:생것"),
    ("파인애플", "과일", 59, "R:08092:생것"),
    ("망고", "과일", 51, "R:08028"),
    ("오렌지주스", "음료", 50, "R:08069:착즙"),
    ("탄산음료(콜라 등)", "음료", 59, "D:탄산음료"),
    ("우유", "유제품", 39, "R:13009|D:우유"),
    ("요구르트(과일맛)", "유제품", 41, "D:요구르트(액상)|D:요구르트(호상)"),
    ("두유", "두류", 34, ""),
    ("콩(대두)", "두류", 16, "R:04012:삶은"),
    ("강낭콩", "두류", 24, "R:04001:삶은"),
    ("병아리콩", "두류", 28, "R:04021:삶은"),
    ("렌틸콩", "두류", 32, "R:04020:삶은"),
    ("설탕", "당류", 65, "R:03011"),
    ("꿀", "당류", 61, "R:03003"),
    ("포도당", "당류", 100, "R:03019"),
    ("과당", "당류", 15, ""),
    ("초콜릿", "간식", 40, "D:초콜릿"),
    ("감자칩", "간식", 56, ""),
    ("아이스크림", "간식", 51, "D:아이스크림"),
]


def resolve_targets(con, spec):
    """대상 문자열 → foodCd 목록"""
    codes = []
    # '|' 는 R 정규식 안에서도 쓰이므로 다음 'D:' / 'R:' 앞의 '|' 에서만 자름
    for part in filter(None, re.split(r"\|(?=[DR]:)", spec or "")):
        kind, rest = part.split(":", 1)
        if kind == "D":
            codes += [r[0] for r in con.execute(
                "SELECT foodCd FROM food_nutrition WHERE dataCd='D' AND foodLv4Nm=?", (rest,))]
        else:
            code, _, inc = rest.partition(":")
            for cd, nm in con.execute(
                    "SELECT foodCd, foodNm FROM food_nutrition WHERE dataCd='R' AND foodLv4Cd=?", (code,)):
                if not inc or re.search(inc, nm):
                    codes.append(cd)
    return codes


def build_gi(con):
    df = pd.DataFrame(GI, columns=["name", "category", "gi", "targets"])
    df["gi_level"] = pd.cut(df["gi"], [0, 55, 69, 200], labels=["낮음(≤55)", "중간(56-69)", "높음(≥70)"]).astype(str)
    df["source"] = "International Tables of Glycemic Index (Atkinson et al. 2008/2021), 포도당=100"
    links = []
    for _, r in df.iterrows():
        for cd in resolve_targets(con, r["targets"]):
            links.append({"foodCd": cd, "gi": r["gi"], "gi_name": r["name"]})
    link_df = pd.DataFrame(links).drop_duplicates("foodCd")
    df["matched_foods"] = df["name"].map(link_df["gi_name"].value_counts()).fillna(0).astype(int)
    link_df.to_sql("ref_gi_food", con, index=False, if_exists="replace")
    print(f"[ref_gi_food] 식품 {len(link_df)}개에 GI 연결")
    return df


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    tables = {"ref_alcohol": build_alcohol(), "ref_exercise": build_exercise(), "ref_gi": build_gi(con)}
    for name, df in tables.items():
        df.to_sql(name, con, index=False, if_exists="replace")
        df.to_csv(OUT / f"{name}.csv", index=False, encoding="utf-8-sig")
        print(f"[{name}] {len(df)}행 저장")
    con.commit()

    pd.set_option("display.width", 200)
    print(tables["ref_alcohol"][["name", "abv_pct", "serving_unit", "serving_alcohol_g",
                                 "serving_kcal", "bottle_unit", "bottle_kcal"]].to_string(index=False))
    print(tables["ref_gi"][["name", "gi", "targets", "matched_foods"]].to_string(index=False))
    con.close()


if __name__ == "__main__":
    main()
