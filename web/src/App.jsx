import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getCatalog, getRecommend, runSimulation } from "./api";
import Coach from "./components/Coach";
import PersonCard from "./components/PersonCard";
import Results from "./components/Results";
import ScenarioCard from "./components/ScenarioCard";
import { BLANK, DEFAULT_PERSON, INK, PRESETS, activityOf, migrate } from "./presets";

// 브라우저에 입력값 기억 (실패해도 동작에는 지장 없음)
const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

const STEPS = ["나", "하루 짜기", "결과"];

/** 추천 적용: 엔진 recommend.py 의 apply 종류와 같은 변환 */
function applyTips(sc, applies) {
  const s = structuredClone(sc);
  for (const a of applies) {
    if (a.kind === "drink_half") s.drinks = a.drinks;
    else if (a.kind === "drink_none") s.drinks = [];
    else if (a.kind === "portion") s.meals[a.slot].foods[a.index].grams = a.grams;
    else if (a.kind === "walk") s.exercises = [...s.exercises, a.exercise];
    else if (a.kind === "less_often") s.times_per_week = a.times_per_week;
  }
  if (!s.name.endsWith("(바꿈)")) s.name = `${s.name} (바꿈)`.slice(0, 40);
  return s;
}

export default function App() {
  const [person, setPerson] = useState(() => ({ ...DEFAULT_PERSON, ...load("ab.person", {}) }));
  const [scenarios, setScenarios] = useState(() => load("ab.scenarios", PRESETS).map(migrate));
  const [look, setLook] = useState(() => {
    const l = load("ab.look", {});
    return { hair: l.hair ?? (load("ab.person", DEFAULT_PERSON).sex === 2 ? "long" : "short"), photo: l.photo ?? null };
  });
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState(null);
  const [result, setResult] = useState(null);
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getCatalog().then(setCatalog).catch(() => setError("서버에 연결할 수 없어요. 잠시 후 새로고침해 주세요.")); }, []);
  useEffect(() => save("ab.person", person), [person]);
  useEffect(() => save("ab.scenarios", scenarios), [scenarios]);
  useEffect(() => save("ab.look", look), [look]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  function payload(list) {
    const blankToNull = (v) => (v === "" || v === undefined ? null : v);
    const p = {
      sex: person.sex, age: person.age, height_cm: person.height_cm, weight_kg: person.weight_kg, smoking: person.smoking,
      activity: activityOf(person).level, sbp: blankToNull(person.sbp), bmr_kcal: blankToNull(person.bmr_kcal),
      body_fat_pct: blankToNull(person.body_fat_pct), skeletal_muscle_kg: blankToNull(person.skeletal_muscle_kg),
    };
    const sc = list.map(({ foods, ...s }) => ({
      ...s,
      meals: Object.fromEntries(Object.entries(s.meals).map(([k, m]) => [k, { ...m, foods: (m.foods ?? []).filter((f) => f.query.trim()) }])),
    }));
    return [p, sc];
  }

  async function run(list = scenarios) {
    setLoading(true); setError(""); setRecs(null);
    try {
      const [p, sc] = payload(list);
      const data = await runSimulation(p, sc);
      setResult(data);
      setStep(2);
      getRecommend(p, sc).then((r) => setRecs(r.results)).catch(() => setRecs([]));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onApply(i, applies) {
    const next = scenarios.map((s, j) => (j === i ? applyTips(s, applies) : s));
    setScenarios(next);
    run(next);
  }

  const canNext = person.age && person.height_cm && person.weight_kg;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6">
      <header className="sticky top-0 z-30 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 bg-paper/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="font-display text-2xl text-brand">AfterBody</p>
        <nav className="flex items-center gap-1" aria-label="단계">
          {STEPS.map((t, i) => (
            <button key={t} onClick={() => (i < 2 || result) && setStep(i)} disabled={i === 2 && !result}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${step === i ? "bg-ink text-white" : "text-mute hover:bg-white"}`}>
              <span className={`grid size-5 place-items-center rounded-full text-[11px] ${step === i ? "bg-white text-ink" : "bg-line text-ink"}`}>{i + 1}</span>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <AnimatePresence mode="wait">
        <motion.main key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-4xl leading-tight">먹기 전에, 미래의 나한테 먼저 물어보기</h1>
                <p className="mt-2 text-mute">먼저 지금의 나를 알려 주세요. 입력한 정보는 이 기기에만 저장돼요.</p>
              </div>
              <PersonCard person={person} onChange={setPerson} look={look} onLook={setLook} />
              <button disabled={!canNext} onClick={() => setStep(1)}
                className="font-display self-end rounded-full bg-brand px-8 py-3 text-xl text-white shadow-lg disabled:opacity-50">다음: 하루 짜기 →</button>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h1 className="font-display text-3xl">어떤 하루를 비교해 볼까요?</h1>
                  <p className="text-sm text-mute">끼니·술·운동을 탭별로 넣어요. 안 바꾼 끼니는 평소대로 먹은 걸로 계산해요.</p>
                </div>
                <div className="flex gap-3 text-sm text-mute">
                  <button className="underline" onClick={() => { setScenarios([BLANK(0), BLANK(1)]); setResult(null); }}>빈칸에서 시작</button>
                  <button className="underline" onClick={() => { setScenarios(PRESETS); setResult(null); }}>예시 보기</button>
                </div>
              </div>
              <div className="grid items-start gap-4 md:grid-cols-3">
                {scenarios.map((s, i) => (
                  <ScenarioCard key={i} index={i} color={INK[i]} scenario={s} catalog={catalog}
                    onChange={(v) => setScenarios(scenarios.map((x, j) => (j === i ? v : x)))}
                    onRemove={scenarios.length > 1 ? () => setScenarios(scenarios.filter((_, j) => j !== i)) : null} />
                ))}
                {scenarios.length < 3 && (
                  <button className="min-h-40 rounded-3xl border-2 border-dashed border-line text-mute hover:border-brand hover:text-brand"
                    onClick={() => setScenarios([...scenarios, BLANK(scenarios.length)])}>
                    + 비교할 하루 추가
                  </button>
                )}
              </div>
              <div className="sticky bottom-3 z-20 flex justify-center">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => run()} disabled={loading}
                  className="font-display w-full max-w-md rounded-full bg-brand py-4 text-2xl text-white shadow-xl shadow-orange-200 disabled:opacity-60">
                  {loading ? "미래의 나 불러오는 중…" : "미래의 나 만나러 가기 →"}
                </motion.button>
              </div>
            </div>
          )}

          {step === 2 && result && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="font-display text-3xl">미래의 나</h1>
                <button onClick={() => setStep(1)} className="rounded-full bg-white px-4 py-2 text-sm ring-1 ring-line">← 하루 다시 짜기</button>
              </div>
              {loading && <p className="text-sm text-mute">다시 계산하는 중…</p>}
              <Results data={result} look={look} recs={recs} onApply={onApply} />
            </div>
          )}
        </motion.main>
      </AnimatePresence>
      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <footer className="mt-12 text-center text-xs leading-relaxed text-mute">
        의학적 진단이 아닌 건강관리 참고용 추정치입니다. 건강 문제는 전문의와 상담하세요.<br />
        데이터: 식약처 식품영양성분DB · 질병관리청 국민건강영양조사 2024 · 2025 한국인 영양소 섭취기준 · 무작위대조시험 메타분석
      </footer>

      <Coach person={person} />
    </div>
  );
}
