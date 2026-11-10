# MediUp

개인 건강 디지털 트윈 기반 What-if 시뮬레이션 — "내 몸에 먼저 해보기"

음식·음주·운동 같은 행동을 하기 전에, 내 건강 상태를 기준으로 단기·장기 변화를 비교해 보여주는 서비스의 MVP 데이터·모델 저장소입니다.

## 웹 배포 (Render)

`Dockerfile` + `render.yaml` 포함. Render → **New → Blueprint** → 이 저장소 선택 → 자동 빌드·배포.
빌드 시 저장소의 `runtime/afterbody-runtime.zip` 사용. 푸시하면 자동 재배포.
서버는 사용자 입력·사진을 저장하지 않음 (요청마다 계산만 하고 버림).

## 실행하기 (다른 PC 포함)

**준비물: Python 3.11 이상** (설치할 때 "Add python.exe to PATH" 체크). Node.js 는 필요 없어요.

1. 이 저장소를 내려받기 — GitHub 초록색 **Code → Download ZIP** 후 압축 풀기 (또는 `git clone`)
2. **`setup.bat` 더블클릭** (처음 한 번) — 파이썬 패키지 설치 + 실행 데이터(DB·모델·화면) 풀기
3. **`start.bat` 더블클릭** — 브라우저에서 http://localhost:8000 이 열려요 (검은 창을 닫으면 종료)

| 파일 | 용도 |
|---|---|
| `setup.bat` | 처음 설치 |
| `start.bat` | 실행 (일반 사용) |
| `dev.bat` | 개발 모드 — 화면 코드 수정 시 바로 반영 (Node.js 필요, http://localhost:5173) |

### 실행 데이터 새로 배포하기 (개발자)
```bash
cd web && npm run build && cd ..
python scripts/make_runtime_bundle.py      # → runtime/afterbody-runtime.zip
```
커밋·푸시하면 Render 가 자동 재배포. 다른 PC 는 저장소를 다시 받아 `setup.bat` 실행.
(실행 묶음에는 국민건강영양조사 개인자료가 들어있지 않음: 음식 DB·참고표·학습된 모델 계수·화면만)

## 원본 데이터 (git에 포함되지 않음)

용량이 크거나 재배포가 제한된 파일이므로 **각자 내려받아 저장소 루트(`C:\mediup` 등)에 그대로 두세요.**

| 파일 | 출처 | 비고 |
|---|---|---|
| `20260929_가공식품DB_323197건.xlsx` | 식품의약품안전처 식품영양성분 DB | |
| `20260828_음식DB_19617건.xlsx` | 〃 | |
| `20260623_건강기능식품DB_5556건 (3).xlsx` | 〃 | |
| `HN24_ALL(SAS) (1).zip` | 질병관리청 국민건강영양조사 2024 원시자료 | **이용자 동의 후 개인별 다운로드, 제3자 공유 금지** |
| `국민건강보험공단_직역별 성별 연령별 건강검진정보_20231231.csv` | 공공데이터포털 | |
| `2025+KDRI_1~3권 *.pdf` | 보건복지부 2025 한국인 영양소 섭취기준 | |
| `data/nutrition.db` (R 원재료 3,701건 포함) | 식약처 API 수집본 | 원재료성 식품은 아직 엑셀 신규본이 없어 기존 DB에서 가져옴 |

## DB 만들기 (순서대로 실행)

```bash
python scripts/build_clean_db.py         # 음식 DB 통합, 국민건강영양조사 정제
python scripts/build_reference_tables.py # 주류·운동 MET·GI 참고표
python scripts/build_kdri_table.py       # 2025 KDRI 성인 기준치, 에너지필요추정량 공식
python scripts/build_food_mapping.py     # 대표식품 분포표, 별칭표
python scripts/build_effects_table.py    # 생활습관 효과 크기 (문헌)
python scripts/train_risk_models.py      # 위험 예측 모델
```

결과는 `data/nutrition.db`에 저장되고, 참고표는 `data/reference/*.csv`로도 내보냅니다(git 포함).

## DB 테이블

| 테이블 | 내용 |
|---|---|
| `food_nutrition` | 영양성분 35만 건 (D 음식 / P 가공식품 / R 원재료 / F 건강기능식품) |
| `food_group_stats` | 대표식품별 영양값 분포 (p10 / 중앙값 / p90), 대표 1회 중량 |
| `food_alias` | 일상 표현 → 대표식품·주류 연결 (예: 치맥 → 닭튀김 + 맥주) |
| `knhanes_2024_adult` | 국민건강영양조사 2024 성인 6,033명 정제본 (검진·생활습관·영양·질환 라벨) |
| `population_baseline` | 국민건강통계 2024 전국 평균 지표 |
| `ref_alcohol` / `ref_exercise` / `ref_gi`, `ref_gi_food` | 주류, 운동 MET, 혈당지수 |
| `ref_kdri_adult`, `ref_kdri_pa` | 2025 KDRI 성인 기준치, 신체활동계수 |
| `nhis_checkup_2022` | 건보공단 검진 결과 집계 |

## 시뮬레이션 엔진 (`engine/`)

```bash
python -m engine                         # 데모: 치킨+맥주 / 치킨+물 / 샐러드+걷기 비교
python -m engine.foods 치킨 치맥 고구마     # 음식 검색
python -m unittest discover tests -v     # 검증 테스트 (KDRI·문헌 수치 재현, 방향성)
```

```python
from engine import simulate, Person, Scenario, FoodInput, DrinkInput, ExerciseInput
me = Person(sex=1, age=35, height_cm=174, weight_kg=78, sbp=128)
simulate(me, [Scenario("치맥", foods=[FoodInput("치킨", 450)], drinks=[DrinkInput("생맥주", 2)], times_per_week=2)])
```

- 오늘: 열량·나트륨·혈당부하(GI)·혈중알코올 곡선(Widmark)·운동 소모(MET)·재미 환산
- 장기(3개월·1년): 체중(Hall 2011) → BMI → 질환 확률(KNHANES 모델), 혈압(RCT 메타분석) → 심혈관 상대위험
- 모든 결과는 `{p10, med, p90}` 범위 (몬테카를로) — 상수와 출처는 `engine/config.py`, `ref_effects`

## 할 일

- [ ] `data/reference/food_alias.csv` 검수 (`reviewed` → 1), 자주 쓰는 음식 이름 추가
- [x] ~~1인 1회 분량표 확보~~ → 2025 KDRI 활용편 미출간. MVP는 100g 기준 + 섭취량(g) 입력으로 진행
- [ ] (선택) 국민건강영양조사 24시간 회상 원시자료(HN24_24RC)로 실제 1회 섭취량 산출
- [x] 위험 예측 모델 학습 (고혈압·당뇨·이상지질혈증)
- [x] 시뮬레이션 엔진
- [x] API (FastAPI) / 화면 (React + Recharts + Framer Motion)
- [ ] 화면 피드백 반영
