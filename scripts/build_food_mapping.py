"""
MediUp - 음식 매칭/불확실성 테이블 생성

  food_group_stats : 대표식품(foodLv4) 단위 영양값 분포 (p10 / 중앙값 / p90) + 대표 1회 중량
  food_alias       : 사용자가 쓰는 말 → 대표식품(또는 ref_alcohol 주류) 연결표 (초안, 사람 검수 필요)

전제: food_nutrition, ref_alcohol 테이블이 있어야 함
      (build_clean_db.py → build_reference_tables.py → 이 스크립트 순서로 실행)
"""
import re
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(r"C:\mediup")
DB = ROOT / "data" / "nutrition.db"
OUT = ROOT / "data" / "reference"

NUTRIENTS = {  # DB 컬럼 → 출력 이름
    "enerc": "kcal", "chocdf": "carb_g", "sugar": "sugar_g", "prot": "protein_g",
    "fatce": "fat_g", "fasat": "sfa_g", "nat": "sodium_mg", "fibtg": "fiber_g",
}

# ---------------------------------------------------------------- 별칭 초안
# alias → 대상 목록.  D("이름")=음식 대표식품, A("이름")=ref_alcohol 주류,
# R(코드, 이름, inc, exc)=원재료 대표식품. 원재료는 같은 코드 안에 생것·조리·분말·품종이 섞여 있어
# 식품명 포함(inc)/제외(exc) 정규식으로 실제로 먹는 형태만 고른다.
R_DEFAULT_EXC = "말린|분말|가루|동결건조|착즙"


def D(name):
    return {"t": "D", "name": name}


def A(name):
    return {"t": "A", "name": name}


def R(code, name, inc=None, exc=R_DEFAULT_EXC):
    return {"t": "R", "code": code, "name": name, "inc": inc, "exc": exc}


COOKED = "찐것|삶은|구운"
RAW = "생것"
RICE_WHITE = R("01013", "멥쌀밥", inc="백미")
ALIASES = {
    # 치킨·튀김
    "치킨": [D("닭튀김")], "후라이드": [D("닭튀김")], "후라이드치킨": [D("닭튀김")],
    "프라이드치킨": [D("닭튀김")], "양념치킨": [D("닭튀김")], "통닭": [D("닭튀김")],
    "닭강정": [D("닭강정")], "돈까스": [D("돈가스")], "돈가스": [D("돈가스")],
    "탕수육": [D("탕수육")], "감자튀김": [D("감자튀김")],
    # 조합
    "치맥": [D("닭튀김"), A("맥주(라거)")], "피맥": [D("피자"), A("맥주(라거)")],
    "소맥": [A("소주(희석식)"), A("맥주(라거)")], "삼쏘": [D("삼겹살구이"), A("소주(희석식)")],
    # 고기
    "삼겹살": [D("삼겹살구이"), D("오겹살구이")], "제육": [D("제육볶음")], "제육볶음": [D("제육볶음")],
    "불고기": [D("소불고기"), D("돼지불고기")], "닭갈비": [D("닭볶음(닭갈비)")],
    "닭볶음탕": [D("닭볶음탕"), D("닭도리탕")], "닭도리탕": [D("닭도리탕"), D("닭볶음탕")],
    "족발": [D("족발")], "보쌈": [D("수육")], "수육": [D("수육")], "순대": [D("순대")],
    "스테이크": [D("스테이크")],
    "닭가슴살": [R("09008", "닭고기", inc="가슴", exc="생것|" + R_DEFAULT_EXC)],
    # 밥
    "밥": [RICE_WHITE, D("쌀밥")], "공기밥": [RICE_WHITE, D("쌀밥")], "흰밥": [RICE_WHITE, D("쌀밥")],
    "쌀밥": [RICE_WHITE, D("쌀밥")], "백미밥": [RICE_WHITE, D("쌀밥")],
    "잡곡밥": [D("잡곡밥")], "현미밥": [D("현미밥"), R("01013", "멥쌀밥", inc="현미")],
    "비빔밥": [D("비빔밥")], "볶음밥": [D("볶음밥")],
    "카레": [D("카레라이스")], "카레라이스": [D("카레라이스")], "김밥": [D("김밥")],
    "삼각김밥": [D("삼각김밥")], "주먹밥": [D("주먹밥")], "덮밥": [D("덮밥")], "초밥": [D("초밥")],
    "국밥": [D("국밥")], "죽": [D("쌀죽(흰죽)")],
    # 면
    "라면": [D("라면")], "컵라면": [D("라면")], "짜장면": [D("자장면"), D("짜장면")],
    "자장면": [D("자장면"), D("짜장면")], "짬뽕": [D("짬뽕")], "냉면": [D("냉면"), D("물냉면")],
    "물냉면": [D("물냉면")], "비빔냉면": [D("비빔냉면")], "칼국수": [D("칼국수")], "우동": [D("우동")],
    "국수": [D("국수"), D("잔치국수")], "잔치국수": [D("잔치국수")],
    "파스타": [D("스파게티")], "스파게티": [D("스파게티")], "쌀국수": [D("쌀국수")],
    # 분식·간편식
    "떡볶이": [D("떡볶이")], "떡볶기": [D("떡볶이")], "라볶이": [D("라볶이")], "만두": [D("만두")],
    "피자": [D("피자")], "햄버거": [D("햄버거"), D("버거")], "버거": [D("버거"), D("햄버거")],
    "샌드위치": [D("샌드위치")], "샐러드": [D("샐러드")], "토스트": [D("토스트")], "핫도그": [D("핫도그")],
    # 국·찌개
    "김치찌개": [D("김치찌개")], "된장찌개": [D("된장찌개")], "순두부찌개": [D("순두부찌개")],
    "부대찌개": [D("부대찌개")], "순대국": [D("순대국")], "순댓국": [D("순대국")],
    "설렁탕": [D("설렁탕")], "갈비탕": [D("갈비탕")], "삼계탕": [D("삼계탕")], "감자탕": [D("감자탕")],
    "미역국": [D("미역국")], "된장국": [D("된장국")], "마라탕": [D("마라탕")],
    # 음료·간식
    "커피": [D("커피")], "아메리카노": [D("커피")], "라떼": [D("라떼")], "카페라떼": [D("라떼")],
    "콜라": [D("탄산음료")], "사이다": [D("탄산음료")], "탄산음료": [D("탄산음료")],
    "버블티": [D("밀크티/버블티")], "스무디": [D("스무디")],
    "케이크": [D("케이크")], "아이스크림": [D("아이스크림")], "도넛": [D("도넛")],
    "쿠키": [D("비스킷/쿠키/크래커")], "과자": [D("비스킷/쿠키/크래커")], "빵": [D("식빵")], "식빵": [D("식빵")],
    "떡": [D("가래떡"), D("절편")],
    # 원재료
    "계란": [R("10003", "달걀", exc="난황|난백|" + R_DEFAULT_EXC)],
    "달걀": [R("10003", "달걀", exc="난황|난백|" + R_DEFAULT_EXC)],
    "삶은계란": [R("10003", "달걀", inc="삶은", exc="난황|난백")],
    "계란후라이": [D("달걀부침(달걀후라이)")],
    "고구마": [R("02006", "고구마", inc=COOKED)], "군고구마": [R("02006", "고구마", inc="구운")],
    "감자": [R("02001", "감자", inc=COOKED)], "옥수수": [R("01030", "옥수수", inc="삶은|찐것")],
    "바나나": [R("08037", "바나나", inc=RAW)], "사과": [R("08050", "사과", inc=RAW)],
    "귤": [R("08010", "귤", inc=RAW)], "포도": [R("08098", "포도", inc=RAW)],
    "딸기": [R("08019", "딸기", inc=RAW)], "수박": [R("08061", "수박", inc=RAW)],
    "우유": [R("13009", "우유")], "두부": [D("두부부침")],
    # 주류
    "맥주": [A("맥주(라거)")], "캔맥주": [A("맥주 355ml캔")], "생맥주": [A("생맥주 500cc")],
    "소주": [A("소주(희석식)")], "막걸리": [A("막걸리")], "와인": [A("레드와인")],
    "레드와인": [A("레드와인")], "화이트와인": [A("화이트와인")], "위스키": [A("위스키")],
    "사케": [A("청주/사케")], "고량주": [A("고량주")], "무알콜맥주": [A("무알코올맥주")],
}
COMBOS = {"치맥", "피맥", "소맥", "삼쏘"}


def parse_grams(s):
    """'630g', '250 ml', '1,200g' → 숫자. 그 외(복합 표기 등)는 None."""
    if not s:
        return None
    m = re.fullmatch(r"\s*([\d,.]+)\s*(g|ml|mL)\s*", str(s))
    return float(m.group(1).replace(",", "")) if m else None


def food_state(name):
    if re.search(r"말린|건조|분말|가루", name):
        return "건조·분말"
    if "생것" in name:
        return "생것"
    if re.search(r"삶은|찐것|구운|데친|볶은|튀긴|익힌", name):
        return "조리"
    return "기타"


def build_group_stats(con):
    cols = ", ".join(["dataCd", "foodLv3Nm", "foodLv4Cd", "foodLv4Nm", "foodNm", "nutConSrtrQua",
                      "foodSize", "servSize"] + list(NUTRIENTS))
    df = pd.read_sql(f"SELECT {cols} FROM food_nutrition WHERE dataCd IN ('D','R','P')", con)
    df["unit"] = df["nutConSrtrQua"].str.replace(" ", "")
    df = df[df["unit"].isin(["100g", "100ml"])]
    # 1회 중량: D는 식품중량(=1인분 조리량), P는 1회 섭취참고량. 100g/100ml 같은 기준량 표기는 제외
    size = df["servSize"].where(df["dataCd"] == "P", df["foodSize"]).map(parse_grams)
    df["portion"] = size.where(size != 100)

    # 원재료(R)는 같은 코드 안에 생것·조리·건조가 섞여 있어 상태별로 분리
    df["state"] = "전체"
    r_mask = df["dataCd"] == "R"
    df.loc[r_mask, "state"] = df.loc[r_mask, "foodNm"].map(food_state)

    rows = []
    for (d, cd, unit, st), g in df.groupby(["dataCd", "foodLv4Cd", "unit", "state"]):
        # 원본에 같은 코드에 이름이 2개인 경우가 있어(띄어쓰기 차이, 생강/상추 등) 최빈값 사용
        r = {"dataCd": d, "foodLv4Cd": cd, "foodLv4Nm": g["foodLv4Nm"].mode().iloc[0],
             "foodLv3Nm": g["foodLv3Nm"].mode().iloc[0], "unit": unit, "state": st, "n": len(g)}
        for c, nm in NUTRIENTS.items():
            v = g[c].dropna().astype(float)
            r[f"{nm}_p10"], r[f"{nm}_med"], r[f"{nm}_p90"] = (
                np.percentile(v, [10, 50, 90]).round(1) if len(v) else (None, None, None))
        p = g["portion"].dropna()
        r["portion_n"] = len(p)
        r["portion_med"] = round(float(p.median())) if len(p) else None
        r["portion_p10"] = round(float(np.percentile(p, 10))) if len(p) else None
        r["portion_p90"] = round(float(np.percentile(p, 90))) if len(p) else None
        r["examples"] = " / ".join(g["foodNm"].drop_duplicates().head(3))
        # 분포 신뢰도: 표본이 적으면 범위 자체를 믿기 어려움
        r["spread_reliability"] = "높음" if len(g) >= 20 else ("중간" if len(g) >= 5 else "낮음(표본<5)")
        rows.append(r)
    out = pd.DataFrame(rows)
    out.to_sql("food_group_stats", con, index=False, if_exists="replace")
    con.execute("CREATE INDEX IF NOT EXISTS ix_fgs_nm ON food_group_stats(foodLv4Nm)")
    out.to_csv(OUT / "food_group_stats.csv", index=False, encoding="utf-8-sig")
    print(f"[food_group_stats] {len(out)}개 대표식품 그룹 저장")
    print(out.groupby("dataCd")["spread_reliability"].value_counts().unstack(fill_value=0))
    return out


def build_alias(con, stats):
    d_names = set(stats.loc[stats["dataCd"] == "D", "foodLv4Nm"])
    alc = {r[0] for r in con.execute("SELECT name FROM ref_alcohol")}
    rows, problems = [], []
    for alias, targets in ALIASES.items():
        for prio, t in enumerate(targets, 1):
            row = {"alias": alias, "target_type": "alcohol" if t["t"] == "A" else "food",
                   "dataCd": None if t["t"] == "A" else t["t"], "foodLv4Cd": t.get("code"),
                   "target_name": t["name"], "include_regex": t.get("inc"), "exclude_regex": t.get("exc"),
                   "priority": prio, "is_combo": int(alias in COMBOS), "reviewed": 0}
            if t["t"] == "A":
                n = int(t["name"] in alc)
            elif t["t"] == "D":
                n = con.execute("SELECT COUNT(*) FROM food_nutrition WHERE dataCd='D' AND foodLv4Nm=?",
                                (t["name"],)).fetchone()[0] if t["name"] in d_names else 0
            else:
                names = [r[0] for r in con.execute(
                    "SELECT foodNm FROM food_nutrition WHERE dataCd='R' AND foodLv4Cd=?", (t["code"],))]
                names = [x for x in names
                         if (not t["inc"] or re.search(t["inc"], x)) and not (t["exc"] and re.search(t["exc"], x))]
                n = len(names)
            row["matched_items"] = n
            if n == 0:
                problems.append((alias, t["name"]))
                continue
            rows.append(row)
    out = pd.DataFrame(rows)
    out.to_sql("food_alias", con, index=False, if_exists="replace")
    con.execute("CREATE INDEX IF NOT EXISTS ix_alias ON food_alias(alias)")
    out.to_csv(OUT / "food_alias.csv", index=False, encoding="utf-8-sig")
    print(f"[food_alias] 별칭 {out['alias'].nunique()}개 → 연결 {len(out)}건")
    if problems:
        print(f"  ⚠ 매칭 0건이라 제외: {problems}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    stats = build_group_stats(con)
    build_alias(con, stats)
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
