"""
MediUp - 음식 입력 → 영양 프로필(범위 포함) 조회 모듈

검색 순서 (위에서 걸리면 멈춤, 아래로 갈수록 신뢰도 낮음)
  1. 별칭 (food_alias)         "치킨" → 닭튀김, "치맥" → 닭튀김 + 맥주
  2. 대표식품명 일치/포함        "떡국" → 떡국
  3. 식품명 검색 후 대표식품별 묶음 (최후 수단, 후보 여러 개를 사용자에게 보여줄 것)

각 결과는 100g(또는 100ml)당 p10/중앙값/p90 범위와 대표 1회 중량, GI(있으면), 신뢰도를 담는다.
엔진은 중앙값으로 계산하고 p10~p90을 '추정 범위'로 표시하면 된다.

사용 예 (CLI):  python -m engine.foods 치킨 치맥 고구마 떡볶이 마라샹궈
코드에서:       from engine.foods import lookup;  lookup("치킨")
"""
import re
import sqlite3
import sys
from pathlib import Path

import numpy as np

from .config import DB  # noqa: E402  (전체/실행용 DB 자동 선택)
NUTR = {"enerc": "kcal", "chocdf": "carb_g", "sugar": "sugar_g", "prot": "protein_g",
        "fatce": "fat_g", "nat": "sodium_mg"}
DATA_ORDER = {"D": 0, "R": 1, "P": 2}
GROUP_STAT_CAP = 5  # 단계 2·3에서 보여줄 후보 수


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def _grams(s):
    m = re.fullmatch(r"\s*([\d,.]+)\s*(g|ml|mL)\s*", str(s or ""))
    return float(m.group(1).replace(",", "")) if m else None


def _pct(v):
    v = np.asarray([x for x in v if x is not None], dtype=float)
    if not len(v):
        return None
    p10, med, p90 = np.percentile(v, [10, 50, 90])
    return {"p10": round(p10, 1), "med": round(med, 1), "p90": round(p90, 1)}


def _confidence(match, n):
    if match in ("별칭", "대표식품명") and n >= 20:
        return "높음"
    if (match in ("별칭", "대표식품명") and n >= 5) or (match == "대표식품명 포함" and n >= 20):
        return "중간"
    return "낮음"


def food_profile(con, dataCd, lv4cd=None, lv4nm=None, inc=None, exc=None, match="별칭"):
    """대표식품 하나의 영양 분포 프로필."""
    where, args = ["dataCd=?"], [dataCd]
    if lv4cd:
        where.append("foodLv4Cd=?"); args.append(lv4cd)
    if lv4nm:
        where.append("REPLACE(foodLv4Nm,' ','')=?"); args.append(_norm(lv4nm))
    cols = ["foodCd", "foodNm", "foodLv4Nm", "nutConSrtrQua", "foodSize", "servSize"] + list(NUTR)
    rows = con.execute(f"SELECT {', '.join(cols)} FROM food_nutrition WHERE {' AND '.join(where)}", args).fetchall()
    rows = [dict(zip(cols, r)) for r in rows]
    rows = [r for r in rows if (not inc or re.search(inc, r["foodNm"])) and not (exc and re.search(exc, r["foodNm"]))]
    if not rows:
        return None
    # 기준량이 섞여 있으면(100g / 100ml) 많은 쪽만 사용
    units = [_norm(r["nutConSrtrQua"]) for r in rows]
    # g 기준이 3건 이상이면 g 우선 (김밥처럼 일부만 ml로 측정된 음식), 국·음료처럼 대부분 ml이면 ml
    unit = "100g" if units.count("100g") >= 3 else max(set(units), key=units.count)
    rows = [r for r, u in zip(rows, units) if u == unit]

    prof = {"type": "food", "dataCd": dataCd, "name": rows[0]["foodLv4Nm"], "unit": unit,
            "n": len(rows), "match": match, "examples": [r["foodNm"] for r in rows[:3]]}
    for c, nm in NUTR.items():
        prof[nm] = _pct(r[c] for r in rows)

    sizes = [_grams(r["servSize"] if dataCd == "P" else r["foodSize"]) for r in rows]
    sizes = [s for s in sizes if s and s != 100]
    prof["portion_g"] = _pct(sizes) if len(sizes) >= 3 else None

    codes = [r["foodCd"] for r in rows]
    gi = con.execute(f"SELECT gi FROM ref_gi_food WHERE foodCd IN ({','.join('?' * len(codes))})",
                     codes).fetchall()
    # 절반 이상이 GI 측정 형태와 일치할 때만 GI 부여 (아니면 엔진이 분류별 기본값 사용)
    prof["gi"] = int(np.median([g[0] for g in gi])) if len(gi) >= len(codes) / 2 else None
    prof["confidence"] = _confidence(match, len(rows))
    return prof


def alcohol_profile(con, name):
    cur = con.execute("SELECT * FROM ref_alcohol WHERE name=?", (name,))
    r = cur.fetchone()
    if not r:
        return None
    d = dict(zip([c[0] for c in cur.description], r))
    d.update(type="alcohol", match="별칭", confidence="중간",
             note="도수·용량 표준값 기준. 제품 선택 시 정확도 상승")
    return d


def lookup(text, con=None):
    """반환: {"query", "mode": "combo"|"choose"|"none", "items": [...]}
    combo  = 함께 먹는 조합 → items 전부 합산
    choose = 후보 중 하나 → 첫 번째를 기본값으로, 나머지는 사용자 선택지로 표시
    """
    own = con is None
    con = con or sqlite3.connect(DB)
    q = _norm(text)
    try:
        # 1) 별칭
        al = con.execute(
            "SELECT target_type, dataCd, foodLv4Cd, target_name, include_regex, exclude_regex, is_combo "
            "FROM food_alias WHERE REPLACE(alias,' ','')=? ORDER BY priority", (q,)).fetchall()
        if al:
            items = []
            for tt, d, cd, nm, inc, exc, _ in al:
                p = alcohol_profile(con, nm) if tt == "alcohol" else \
                    food_profile(con, d, lv4cd=cd, lv4nm=None if cd else nm, inc=inc, exc=exc)
                if p:
                    items.append(p)
            return {"query": text, "mode": "combo" if al[0][6] else "choose", "items": items}

        # 2) 대표식품명 (정확히 같음 → 포함)
        groups = con.execute(
            "SELECT DISTINCT dataCd, foodLv4Cd, foodLv4Nm FROM food_group_stats "
            "WHERE REPLACE(foodLv4Nm,' ','') LIKE ?", (f"%{q}%",)).fetchall()
        if groups:
            groups.sort(key=lambda g: (_norm(g[2]) != q, DATA_ORDER[g[0]], len(g[2])))
            items = []
            for d, cd, nm in groups[:GROUP_STAT_CAP]:
                exc = "말린|분말|가루|동결건조" if d == "R" else None
                p = food_profile(con, d, lv4cd=cd, exc=exc,
                                 match="대표식품명" if _norm(nm) == q else "대표식품명 포함")
                if p:
                    items.append(p)
            return {"query": text, "mode": "choose", "items": items}

        # 3) 식품명 검색 → 대표식품별 묶음
        hits = con.execute(
            "SELECT dataCd, foodLv4Cd, COUNT(*) c FROM food_nutrition WHERE dataCd IN ('D','R','P') "
            "AND REPLACE(foodNm,' ','') LIKE ? GROUP BY dataCd, foodLv4Cd", (f"%{q}%",)).fetchall()
        hits.sort(key=lambda h: (DATA_ORDER[h[0]], -h[2]))
        items = []
        for d, cd, _ in hits[:GROUP_STAT_CAP]:
            # 그룹 전체가 아니라 실제로 이름이 걸린 식품만으로 분포 계산
            p = food_profile(con, d, lv4cd=cd, inc=re.escape(text.strip()), match="식품명 검색")
            if p:
                items.append(p)
        return {"query": text, "mode": "choose" if items else "none", "items": items}
    finally:
        if own:
            con.close()


def _fmt_range(r, unit=""):
    return f"{r['med']:g}{unit} ({r['p10']:g}~{r['p90']:g})" if r else "-"


def describe(res):
    out = [f"\n■ '{res['query']}'  → {res['mode']}"]
    if not res["items"]:
        out.append("  찾지 못함 → 사용자에게 다른 이름/비슷한 음식 선택 요청")
    for i, it in enumerate(res["items"], 1):
        if it["type"] == "alcohol":
            out.append(f"  {i}. [주류] {it['name']}  1{it['serving_unit']}({it['serving_ml']}ml) "
                       f"알코올 {it['serving_alcohol_g']}g · {it['serving_kcal']}kcal  | 신뢰도 {it['confidence']}")
            continue
        portion = it["portion_g"]
        out.append(
            f"  {i}. [{it['dataCd']}] {it['name']} ({it['n']}건, {it['match']}) per {it['unit']}: "
            f"열량 {_fmt_range(it['kcal'], 'kcal')}, 탄수 {_fmt_range(it['carb_g'], 'g')}, "
            f"나트륨 {_fmt_range(it['sodium_mg'], 'mg')}"
            f"\n     1회량 {_fmt_range(portion, 'g') if portion else '정보없음(사용자 입력)'}"
            f" | GI {it['gi'] if it['gi'] else '-'} | 신뢰도 {it['confidence']}"
            f"\n     예: {' / '.join(it['examples'])}")
    return "\n".join(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    queries = sys.argv[1:] or ["치킨", "치맥", "고구마", "밥", "떡볶이", "떡국", "마라샹궈"]
    con = sqlite3.connect(DB)
    for q in queries:
        print(describe(lookup(q, con)))
    con.close()
