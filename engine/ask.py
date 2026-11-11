"""바디쌤: AI 없이 DB와 정리된 상식으로 답하는 질문 응답.

순서: 운동 → 술 → 음식 → 건강 상식(FAQ) → 모름.
반환: {"answer": 문장, "card": 표로 보여줄 값(선택), "suggestions": 이어서 물어볼 질문}
"""
import re
import sqlite3

from . import config as C
from . import physiology as P
from .foods import lookup

NUTRIENT_WORDS = {
    "kcal": ["칼로리", "열량", "kcal", "살"], "sodium_mg": ["나트륨", "염분", "소금", "짠"],
    "sugar_g": ["당류", "설탕", "당"], "protein_g": ["단백질"], "carb_g": ["탄수화물", "탄수"], "fat_g": ["지방"],
}
NUTRIENT_LABEL = {"kcal": ("열량", "kcal"), "carb_g": ("탄수화물", "g"), "sugar_g": ("당류", "g"),
                  "protein_g": ("단백질", "g"), "fat_g": ("지방", "g"), "sodium_mg": ("나트륨", "mg")}
FILLER = ["영양성분", "영양", "성분", "얼마나", "얼마", "몇", "알려줘", "알려", "주세요", "줘", "뭐야", "뭔가요",
          "어때", "어떄", "있어", "있나요", "되나요", "돼", "높아", "많아", "많이", "적어", "에는", "에", "은", "는",
          "이", "가", "의", "좀", "한", "그릇", "1인분", "일인분", "?", "!", ".", "정도", "들어", "있는지"]

EXERCISE_WORDS = {"걷기": "걷기 보통", "산책": "걷기 보통", "빨리 걷기": "걷기 빠르게", "빠르게 걷기": "걷기 빠르게",
                  "달리기": "달리기 (8.0", "러닝": "달리기 (8.0", "조깅": "달리기 (6.4", "자전거": "자전거 여가용",
                  "수영": "수영 자유형 느리게", "등산": "등산", "요가": "요가", "필라테스": "필라테스", "헬스": "근력운동 (일반)",
                  "근력": "근력운동 (일반)", "웨이트": "근력운동 (일반)", "줄넘기": "줄넘기", "계단": "계단 오르기 (느리게)",
                  "축구": "축구", "농구": "농구", "배드민턴": "배드민턴", "테니스": "테니스", "골프": "골프", "에어로빅": "에어로빅",
                  "청소": "집안 청소"}
DRINK_WORDS = ["생맥주", "맥주", "소주", "와인", "막걸리", "위스키", "사케", "청주", "고량주", "소맥", "술"]

# 검증한 출처의 수치만 사용 (docs/데이터_출처.md)
FAQ = [
    (["bmi", "비만도", "체질량"], "BMI는 몸무게(kg)를 키(m)의 제곱으로 나눈 값이에요. 한국 기준으로 18.5 미만 저체중, 23 이상 비만 전단계, 25 이상 비만으로 봐요."),
    (["기초대사량", "bmr"], "기초대사량은 가만히 누워만 있어도 쓰는 에너지예요. 인바디 결과지에 나와 있고, 입력하면 하루 필요 열량을 더 정확하게 계산해요."),
    (["혈당지수", "gi", "혈당 지수"], "혈당지수(GI)는 포도당을 100으로 두고 음식이 혈당을 얼마나 빨리 올리는지 나타내요. 흰쌀밥 73, 현미밥 68, 사과 36처럼 낮을수록 천천히 올라요."),
    (["혈당 부하", "gl"], "혈당 부하(GL)는 GI에 실제로 먹은 탄수화물 양을 곱해 100으로 나눈 값이에요. 한 끼 기준 10 이하는 낮음, 20 이상은 높음이에요."),
    (["나트륨 권장", "나트륨 하루", "소금 하루", "나트륨 기준", "짜게"], "성인 나트륨은 하루 2,300mg 이하가 만성질환 위험을 줄이는 기준이에요 (2025 한국인 영양소 섭취기준). 소금으로 치면 약 5.8g이에요."),
    (["당류 권장", "당 하루", "설탕 하루", "첨가당"], "총당류는 하루 열량의 20% 이내, 설탕·시럽 같은 첨가당은 10% 이내가 권장이에요 (2025 한국인 영양소 섭취기준)."),
    (["단백질 권장", "단백질 하루"], "성인 단백질 권장량은 남성 60~65g, 여성 50~55g이에요 (2025 한국인 영양소 섭취기준)."),
    (["식이섬유"], "식이섬유는 성인 남성 하루 30g, 여성 20~25g이 충분섭취량이에요 (2025 한국인 영양소 섭취기준)."),
    (["표준잔", "적정 음주", "적당히 마시"], "표준잔은 알코올 10g이에요 (WHO). 소주 1잔(50ml)이 약 6.5g, 생맥주 500cc가 약 18g이에요."),
    (["운동 권장", "얼마나 운동", "운동 얼마"], "WHO는 성인에게 일주일에 중강도 운동 150~300분(빠르게 걷기 등)을 권장해요."),
    (["걸음", "만보"], "하루 걸음 수로 활동량을 나눠요: 5,000보 미만 비활동, 7,500보 미만 저활동, 10,000보 이상 활동적 (Tudor-Locke 2004)."),
    (["살 빠지", "체중 감량", "다이어트", "살 찌", "체중 증가"], "하루 약 24kcal를 꾸준히 덜 먹거나 더 쓰면 결국 1kg 정도 빠지고, 그 절반은 약 1년에 걸쳐 나타나요 (Hall 2011). 하루 240kcal면 약 10kg이에요."),
    (["혈압"], "체중 1kg을 줄이면 수축기 혈압이 약 1mmHg, 소금을 하루 4.4g 줄이면 약 4mmHg, 유산소 운동을 꾸준히 하면 약 3.5mmHg 내려가요 (메타분석)."),
    (["아침", "거르"], "아침을 거르면 그날 섭취 열량은 줄지만, 대신 점심·야식을 더 먹기 쉬워요. '하루 짜기'에서 아침 '안 먹음'과 야식을 같이 넣어 비교해 보세요."),
    (["계산", "어떻게", "정확"], "음식 열량은 식약처 영양성분 DB, 질환 확률은 국민건강영양조사 2024로 만든 모델, 혈압 효과는 임상시험 메타분석 값으로 계산해요. 결과는 범위로 보여주는 추정치예요."),
]
SUGGEST = ["치킨 칼로리", "떡볶이 나트륨", "30분 걷기 칼로리", "소주 1병", "나트륨 하루 권장량", "혈당지수가 뭐야?"]


def _j(word, pair):
    """받침에 따라 조사 고르기: _j('치킨', '은는') → '치킨은'"""
    c = word[-1] if word else ""
    has = "가" <= c <= "힣" and (ord(c) - 0xAC00) % 28 != 0
    if c.isdigit():
        has = c in "013678"
    return word + (pair[0] if has else pair[1])


def _num(q, units, default):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(" + "|".join(units) + ")", q)
    return (float(m.group(1)), m.group(2)) if m else (default, None)


def _asked_nutrient(q):
    for k, words in NUTRIENT_WORDS.items():
        if any(w in q for w in words):
            return k
    return None


def _exercise(con, q, weight):
    hit = next((k for k in sorted(EXERCISE_WORDS, key=len, reverse=True) if k in q), None)
    if not hit:
        return None
    rows = con.execute("SELECT name, met FROM ref_exercise").fetchall()
    key = EXERCISE_WORDS[hit].replace(" ", "")
    row = next((r for r in rows if r[0].replace(" ", "").startswith(key)), None)
    if not row:
        return None
    n, unit = _num(q, ["분", "시간"], 30)
    minutes = n * 60 if unit == "시간" else n
    gross = row[1] * weight * minutes / 60
    net = P.exercise_net_kcal(row[1], weight, minutes)
    return {"answer": f"{row[0]} {minutes:g}분이면 약 {gross:.0f}kcal를 써요. 가만히 있어도 쓰는 양을 빼면 운동으로 더 쓰는 건 약 {net:.0f}kcal예요 (몸무게 {weight:g}kg 기준).",
            "card": {"title": row[0], "rows": [["시간", f"{minutes:g}분"], ["운동 강도", f"{row[1]} MET"],
                                                ["총 소모", f"{gross:.0f} kcal"], ["운동으로 추가 소모", f"{net:.0f} kcal"]]},
            "suggestions": [f"{hit} 1시간 칼로리", "운동 얼마나 해야 해?", "치킨 칼로리"]}


def _drink(con, q, weight, sex):
    hit = next((w for w in DRINK_WORDS if w in q), None)
    if not hit:
        return None
    if hit == "술":
        return {"answer": "어떤 술인지 알려 주세요. 예: '소주 1병', '맥주 2잔', '와인 한 잔'", "suggestions": ["소주 1병", "생맥주 2잔", "와인 1잔"]}
    res = lookup(hit, con)
    a = next((it for it in res["items"] if it["type"] == "alcohol"), None)
    if not a:
        return None
    n, unit = _num(q, ["잔", "병", "캔"], 1)
    bottle = unit == "병" or (unit is None and hit == "소주" and "잔" not in q)
    grams = (a["bottle_alcohol_g"] if bottle else a["serving_alcohol_g"]) * n
    kcal = (a["bottle_kcal"] if bottle else a["serving_kcal"]) * n
    what = f"{n:g}{'병' if bottle else '잔'}"
    _, _, peak, _, sober = P.bac_curve([(20, grams, max(1.0, n * (1.5 if bottle else 0.5)))], sex, weight, 20)
    sober_txt = P.clock(sober) if sober else "-"
    size = "" if bottle else f" ({a['serving_unit']} {a['serving_ml']}ml 기준)"
    return {"answer": f"{_j(a['name'] + ' ' + what, '은는')} 약 {kcal:.0f}kcal, 알코올 {grams:.0f}g(표준잔 {grams / C.STD_DRINK_G:.1f}잔)이에요{size}. 저녁 8시에 마시기 시작하면 {sober_txt}쯤 다 깨요.",
            "card": {"title": f"{a['name']} {what}", "rows": [["열량", f"{kcal:.0f} kcal"], ["알코올", f"{grams:.0f} g"],
                                                            ["최고 혈중알코올", f"{peak:.3f}%"], ["다 깨는 시각", sober_txt]]},
            "suggestions": ["표준잔이 뭐야?", f"{hit} 칼로리", "30분 걷기 칼로리"]}


def _food(con, q):
    key = _asked_nutrient(q)
    text = q
    for words in NUTRIENT_WORDS.values():
        for w in sorted(words, key=len, reverse=True):
            if len(w) > 1:
                text = text.replace(w, " ")
    for w in sorted((w for w in FILLER if len(w) > 1), key=len, reverse=True):
        text = text.replace(w, " ")
    text = re.sub(r"[?!.,]|\d+\s*(g|그램|개|인분)", " ", text)
    tokens = [t for t in sorted(text.split(), key=len, reverse=True) if t not in ("당", "살", "짠")]
    cands = []
    for t in ([text.strip()] if len(tokens) > 1 else []) + tokens:
        cands.append(t)
        if len(t) > 1 and t[-1] in "은는이가의에도요":      # 조사 붙은 경우 (예: 치킨은) 떼고 한 번 더
            cands.append(t[:-1])
    # 1차: 별칭·대표식품명으로 정확히 찾기 → 2차: 식품명 검색
    found = None
    for strict in (True, False):
        for c in cands:
            res = lookup(c, con)
            items = [it for it in res["items"] if it["type"] == "food" and (not strict or it["match"] != "식품명 검색")]
            if items:
                found = items
                break
        if found:
            break
    for foods in ([found] if found else []):
        if foods:
            it = foods[0]
            portion = it["portion_g"]["med"] if it["portion_g"] else None
            rows = []
            for k, (lab, unit) in NUTRIENT_LABEL.items():
                v = it[k]["med"] if it[k] else None
                if v is None:
                    continue
                row = [lab, f"{v:g} {unit}"]
                row.append(f"{v * portion / 100:.0f} {unit}" if portion else "-")
                rows.append(row)
            focus = key or "kcal"
            lab, unit = NUTRIENT_LABEL[focus if focus in NUTRIENT_LABEL else "kcal"]
            v = it[focus]["med"] if it.get(focus) else None
            if v is None:
                ans = f"{it['name']}의 {lab} 정보는 DB에 없어요."
            elif portion:
                u = "ml" if it["unit"].endswith("ml") else "g"
                ans = f"{it['name']} 1인분({portion:.0f}{u})에 {_j(lab, '이가')} 약 {v * portion / 100:.0f}{unit} 들어 있어요 ({it['unit']}당 {v:g}{unit})."
            else:
                ans = f"{_j(it['name'], '은는')} {it['unit']}당 {_j(lab, '이가')} 약 {v:g}{unit}이에요. 1인분 양 정보가 없어 {it['unit']} 기준으로 알려드려요."
            if focus == "sodium_mg" and v and portion:
                ans += f" 하루 권장 상한 2,300mg의 {v * portion / 100 / 2300 * 100:.0f}%예요."
            if it.get("gi"):
                ans += f" 혈당지수(GI)는 {it['gi']}이에요."
            if it["confidence"] == "낮음":
                ans += " (DB에 비슷한 음식이 적어 정확도가 낮아요)"
            return {"answer": ans, "weak": it["match"] == "식품명 검색",
                    "card": {"title": it["name"], "head": ["", it["unit"] + "당", "1인분" if portion else ""],
                             "rows": rows, "note": f"예: {', '.join(it['examples'][:2])} · DB {it['n']}건 중앙값"},
                    "suggestions": [f"{it['name']} 나트륨", f"{it['name']} 단백질", "30분 걷기 칼로리"]}
    return None


def _faq(q):
    ql = q.lower()
    best = None
    for keys, ans in FAQ:
        hit = max((len(k) for k in keys if k in ql), default=0)
        if hit and (best is None or hit > best[0]):
            best = (hit, ans)
    return {"answer": best[1], "suggestions": SUGGEST[:3]} if best else None


def ask(q, weight_kg=65.0, sex=1):
    q = (q or "").strip()
    if not q:
        return {"answer": "궁금한 걸 물어보세요!", "suggestions": SUGGEST}
    con = sqlite3.connect(C.DB)
    try:
        # 상식 질문에 음식 이름이 섞여도(예: '아침 거르면?') 상식이 먼저인 경우
        faq = _faq(q)
        strong_faq = faq and any(w in q for w in ["권장", "뭐야", "뭔가요", "란", "기준", "어떻게", "얼마나 해야"])
        if strong_faq:
            return faq
        for fn in (lambda: _exercise(con, q, weight_kg), lambda: _drink(con, q, weight_kg, sex), lambda: _food(con, q)):
            r = fn()
            if r:
                if r.pop("weak", False) and faq:      # 이름 일부만 맞은 음식보다 상식 답이 낫다
                    return faq
                return r
        return faq or {"answer": "음, 그건 아직 잘 모르겠어요. 음식 이름(예: 떡볶이), 운동(예: 30분 걷기), 술(예: 소주 1병)로 물어보시면 정확히 알려드릴게요.",
                       "suggestions": SUGGEST}
    finally:
        con.close()
