// 시나리오 색상
export const COLORS = ["#ffa94d", "#74c0fc", "#8ce99a"]; // 캐릭터 몸 색
export const INK = ["#e8590c", "#1c7ed6", "#2f9e44"];  // 글자·선 색 (진한 버전)

export const DEFAULT_PERSON = {
  sex: 1, age: 35, height_cm: 174, weight_kg: 78, smoking: "never", activity: "저활동적", sbp: "",
  bmr_kcal: "", body_fat_pct: "", skeletal_muscle_kg: "",
};

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
