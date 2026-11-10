"""엔진 상수와 경로. 모든 수치는 출처를 함께 적는다 (문헌 효과크기는 DB ref_effects 가 단일 출처)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "nutrition.db"
MODEL_DIR = ROOT / "models"

# ── 체중 동역학 (Hall KD et al. 2011, Lancet 378:826, PMC3880593)
# 하루 100 kJ(≈23.9 kcal) 지속 변화 → 최종 체중 약 1 kg 변화, 반감기 약 1년.
# 체지방이 많을수록 변화가 더 크고 느리지만 MVP에서는 평균값 사용.
KCAL_PER_DAY_PER_KG = 100 / 4.184
WEIGHT_HALF_TIME_DAYS = 365.0

# ── 알코올 (Widmark 공식)
ETHANOL_DENSITY = 0.789            # g/ml
WIDMARK_R = {1: 0.68, 2: 0.55}     # 체내 분포계수 (남/여)
ALCOHOL_ELIM_PCT_PER_H = 0.015     # 혈중알코올 제거속도 %/h (통상 0.010–0.020 범위의 중앙값)
ALCOHOL_ABSORB_KA = 2.0            # 흡수속도 상수 1/h (식사와 함께 마실 때 흡수 반감기 약 20분 가정)
STD_DRINK_G = 10.0                 # WHO 표준잔
HEAVY_DRINKER_G_PER_DAY = 60.0     # Roerecke 2017 '하루 6잔 이상' 하위군 (10 g/잔 가정) — 절주 혈압효과 적용 기준

# ── 혈당 부하 (GL = GI × 탄수화물g / 100), 1회 식사 기준 분류
GL_LOW, GL_HIGH = 10, 20
DEFAULT_GI = 60                    # GI 미측정 음식(치킨 등 복합음식)의 임시값 → 결과에 '추정' 표시

# ── 나트륨 → 혈압 (He 2013 BMJ 메타회귀: 소변 나트륨 100 mmol(=2,300 mg) 감소당 수축기 -5.8 mmHg)
SBP_PER_SODIUM_MG = -5.8 / 2300

# ── 기준 저녁(비교 기준선): 하루 에너지필요추정량의 1/3, 나트륨은 만성질환위험감소섭취량의 1/3
#    "균형 잡힌 평소 저녁을 먹었을 때"와 비교한 차이로 장기 변화를 계산한다 (가정, 화면에 명시할 것)
REFERENCE_MEAL_SHARE = 1 / 3

# ── 유산소 운동 혈압효과 (Cornelissen 2013): 대부분 주 3회 이상 시행한 RCT → 주 3회 미만은 비례 축소
AEROBIC_FULL_EFFECT_PER_WEEK = 3
AEROBIC_MIN_MET = 3.0              # 중강도 이상만 유산소 운동으로 인정

# ── 비교 단위 (재미 요소)
RICE_BOWL_G = 210                  # 즉석밥·공기밥 표준 210 g
BRISK_WALK_MET = 4.3               # 걷기 빠르게 5.6 km/h (Compendium 17200)

# ── 인바디 기초대사량(BMR)이 있을 때 하루 소모량 = BMR × 신체활동수준(PAL)
# IOM(2005) DRI 신체활동수준 구간(비활동 1.0–1.4, 저활동 1.4–1.6, 활동 1.6–1.9, 매우활동 1.9–2.5)의 대표값.
# 참고: KDRI 2025 는 한국 성인의 실측 PAL을 남 1.55, 여 1.46(저활동적)으로 보고.
PAL_BY_ACTIVITY = {"비활동적": 1.25, "저활동적": 1.5, "활동적": 1.75, "매우활동적": 2.0}
