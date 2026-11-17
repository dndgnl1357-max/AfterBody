// 시연용 예시 데이터: 버튼 한 번으로 프로필·아바타·2주치 기록을 채운다 (발표·심사용)
const iso = (d) => d.toLocaleDateString("sv");
const usual = (h) => ({ mode: "usual", foods: [], hour: h });
const food = (query, mult = 1) => ({ query, grams: null, choice: 0, mult });

export function makeDemo() {
  const person = {
    sex: 1, age: 32, height_cm: 175, weight_kg: 79, smoking: "never", activity: "저활동적", sbp: 128,
    bmr_kcal: "", body_fat_pct: "", skeletal_muscle_kg: "", steps: 6200, job: "sit", exercise_week: "low",
  };
  const look = {
    spec: { skin: "#efbf98", faceShape: "oval", hairStyle: "sidepart", bangs: "none", hairColor: "#1f1b1a",
      eyeShape: "almond", eyeSize: 1.02, eyeGap: 1, eyeColor: "#2a1c14", browShape: "soft", browWeight: "thick",
      nose: "button", lips: "normal", glasses: "round", facialHair: "none" },
    note: "시연용 예시 아바타예요.",
  };
  // 2주: 평일 점심 직접 입력, 주말 치맥·야식, 격일 걷기, 체중 5번
  const journal = {};
  const weights = { 13: 79.4, 10: 79.3, 7: 79.35, 3: 79.15, 0: 79.1 };   // 먹은 양과 대체로 맞는 완만한 감소
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dow = d.getDay(), weekend = dow === 0 || dow === 6;
    const meals = { breakfast: usual(8), lunch: usual(12.5), dinner: usual(19), snack: usual(15.5) };
    if (!weekend) meals.lunch = { mode: "custom", foods: [food(i % 2 ? "김치찌개" : "제육볶음"), food("밥")], hour: 12.5 };
    if (i % 3 === 0) meals.breakfast = { mode: "skip", foods: [], hour: 8 };
    if (weekend) meals.dinner = { mode: "custom", foods: [food("치킨", 1.5)], hour: 19.5 };
    if (dow === 5) meals.snack = { mode: "custom", foods: [food("라면")], hour: 23 };
    journal[iso(d)] = {
      meals, drinks: weekend ? [{ name: "생맥주 500cc", servings: 2 }] : [], drink_start_hour: 19.5,
      exercises: i % 2 === 0 ? [{ name: "걷기 빠르게 (5.6km/h)", minutes: 30, hour: 20.5 }] : [],
      times_per_week: 2, logged: true, weight_kg: weights[i] ?? null,
    };
  }
  return { person, look, journal };
}
