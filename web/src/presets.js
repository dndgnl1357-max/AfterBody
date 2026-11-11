// 시나리오 색상
export const COLORS = ["#ffa94d", "#74c0fc", "#8ce99a"]; // 캐릭터 몸 색
export const INK = ["#e8590c", "#1c7ed6", "#2f9e44"];  // 글자·선 색 (진한 버전)

export const DEFAULT_PERSON = {
  sex: 1, age: 35, height_cm: 174, weight_kg: 78, smoking: "never", activity: "저활동적", sbp: "",
  bmr_kcal: "", body_fat_pct: "", skeletal_muscle_kg: "",
  steps: "", job: "sit", exercise_week: "none",
};

// ── 활동 수준을 주관적 선택 대신 객관적 질문으로 판정
export const JOBS = [["sit", "주로 앉아서 (사무직·학생)"], ["stand", "서 있거나 자주 돌아다님"], ["labor", "몸을 많이 쓰는 일"]];
export const EXERCISE_WEEK = [["none", "거의 안 함"], ["low", "1~2시간"], ["mid", "2시간 반~5시간"], ["high", "5시간 넘게"]];
const LEVELS = ["비활동적", "저활동적", "활동적", "매우활동적"];

/** 걸음 수가 있으면 Tudor-Locke(2004) 걸음 수 기준, 없으면 일 방식 + WHO 권장 운동량(주 150~300분) 기준 */
export function activityOf(p) {
  const steps = Number(p.steps) || 0;
  const ex = { none: 0, low: 0, mid: 1, high: 2 }[p.exercise_week ?? "none"];
  if (steps > 0) {
    let lv = steps < 5000 ? 0 : steps < 7500 ? 1 : steps < 12500 ? 2 : 3;
    if (ex === 2 && lv < 3) lv += 1;         // 걸음 수에 안 잡히는 운동(수영·자전거 등)을 많이 하면 한 단계 위
    return { level: LEVELS[lv], reason: `하루 ${steps.toLocaleString()}보${ex === 2 ? " + 주 5시간 넘는 운동" : ""} 기준` };
  }
  const job = { sit: 0, stand: 1, labor: 2 }[p.job ?? "sit"];
  const lv = Math.min(3, job + ex);
  return { level: LEVELS[lv], reason: "걸음 수를 넣으면 더 정확해요" };
}

// 끼니 (엔진 engine/config.py MEAL_SLOTS 와 같은 값)
export const MEALS = {
  breakfast: { label: "아침", share: 0.25, hour: 8 },
  lunch: { label: "점심", share: 0.35, hour: 12.5 },
  dinner: { label: "저녁", share: 0.35, hour: 19 },
  snack: { label: "간식", share: 0.05, hour: 15.5 },
};

export const toTime = (h) => `${String(Math.floor(h % 24)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
export const fromTime = (t) => { const [hh, mm] = t.split(":").map(Number); return hh + mm / 60; };

const usualMeals = () => Object.fromEntries(Object.entries(MEALS).map(([k, m]) => [k, { mode: "usual", foods: [], hour: m.hour }]));
const food = (query, grams = null) => ({ query, grams, choice: 0 });
const day = (name, patch = {}, meals = {}) => ({
  name, drinks: [], drink_start_hour: 19.5, exercises: [], times_per_week: 2, ...patch,
  meals: { ...usualMeals(), ...meals },
});

export const PRESETS = [
  day("치킨 + 맥주", { drinks: [{ name: "생맥주 500cc", servings: 2 }] },
    { dinner: { mode: "custom", foods: [food("치킨", 450)], hour: 19.5 } }),
  day("아침 굶고 야식 라면", {},
    { breakfast: { mode: "skip", foods: [], hour: 8 }, snack: { mode: "custom", foods: [food("라면", 550)], hour: 23 } }),
  day("샐러드 + 걷기", { exercises: [{ name: "걷기 빠르게 (5.6km/h)", minutes: 30, hour: 20.5 }] },
    { dinner: { mode: "custom", foods: [food("샐러드", 300)], hour: 19 } }),
];

// 한 번 눌러 추가하는 자주 먹는 음식 (별칭표에 있는 이름)
export const QUICK_FOODS = ["밥", "김치찌개", "떡볶이", "라면", "삼겹살", "마라탕", "김밥", "피자", "짜장면", "햄버거", "제육볶음", "돈가스", "초밥", "라떼", "케이크"];

export const BLANK = (i) => day(`선택 ${i + 1}`);

/** 이전 버전(음식 칸 하나)으로 저장된 선택지를 하루 구조로 변환 */
export function migrate(s) {
  if (s.meals) return s;
  const foods = (s.foods ?? []).filter((f) => f.query?.trim());
  return day(s.name ?? "선택", { drinks: s.drinks ?? [], exercises: s.exercises ?? [], times_per_week: s.times_per_week ?? 2 },
    foods.length ? { dinner: { mode: "custom", foods, hour: 19 } } : {});
}
