// 시나리오 색상 (index.css 의 --color-s0..s2 와 동일)
export const COLORS = ["#e8590c", "#1c7ed6", "#2f9e44"];

export const DEFAULT_PERSON = {
  sex: 1, age: 35, height_cm: 174, weight_kg: 78, smoking: "never", activity: "저활동적", sbp: "",
};

export const PRESETS = [
  { name: "치킨 + 맥주", foods: [{ query: "치킨", grams: 450, choice: 0 }],
    drinks: [{ name: "생맥주 500cc", servings: 2 }], exercises: [], times_per_week: 2 },
  { name: "치킨 + 물", foods: [{ query: "치킨", grams: 450, choice: 0 }],
    drinks: [], exercises: [], times_per_week: 2 },
  { name: "샐러드 + 걷기", foods: [{ query: "샐러드", grams: 300, choice: 0 }],
    drinks: [], exercises: [{ name: "걷기 빠르게 (5.6km/h)", minutes: 30 }], times_per_week: 2 },
];
