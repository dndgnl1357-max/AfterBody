// 시나리오 색상
export const COLORS = ["#ffa94d", "#74c0fc", "#8ce99a"]; // 캐릭터 몸 색
export const INK = ["#e8590c", "#1c7ed6", "#2f9e44"];  // 글자·선 색 (진한 버전)

export const DEFAULT_PERSON = {
  sex: 1, age: 35, height_cm: 174, weight_kg: 78, smoking: "never", activity: "저활동적", sbp: "",
  bmr_kcal: "", body_fat_pct: "", skeletal_muscle_kg: "",
};

export const PRESETS = [
  { name: "치킨 + 맥주", foods: [{ query: "치킨", grams: 450, choice: 0 }],
    drinks: [{ name: "생맥주 500cc", servings: 2 }], exercises: [], times_per_week: 2 },
  { name: "치킨 + 물", foods: [{ query: "치킨", grams: 450, choice: 0 }],
    drinks: [], exercises: [], times_per_week: 2 },
  { name: "샐러드 + 걷기", foods: [{ query: "샐러드", grams: 300, choice: 0 }],
    drinks: [], exercises: [{ name: "걷기 빠르게 (5.6km/h)", minutes: 30 }], times_per_week: 2 },
];

// 한 번 눌러 추가하는 자주 먹는 음식 (별칭표에 있는 이름)
export const QUICK_FOODS = ["떡볶이", "라면", "삼겹살", "마라탕", "김밥", "피자", "짜장면", "햄버거", "제육볶음", "김치찌개", "족발", "초밥", "돈가스", "밥", "라떼", "케이크"];

export const BLANK = (i) => ({ name: `선택 ${i + 1}`, foods: [{ query: "", grams: null, choice: 0 }], drinks: [], exercises: [], times_per_week: 2 });
