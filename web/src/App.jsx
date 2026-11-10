import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getCatalog, runSimulation } from "./api";
import PersonCard from "./components/PersonCard";
import Results from "./components/Results";
import ScenarioCard from "./components/ScenarioCard";
import { COLORS, DEFAULT_PERSON, PRESETS } from "./presets";

// 브라우저에 입력값 기억 (실패해도 동작에는 지장 없음)
const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export default function App() {
  const [person, setPerson] = useState(() => load("ab.person", DEFAULT_PERSON));
  const [scenarios, setScenarios] = useState(() => load("ab.scenarios", PRESETS));
  const [catalog, setCatalog] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef();

  useEffect(() => { getCatalog().then(setCatalog).catch(() => setError("서버에 연결할 수 없어요. API 서버가 켜져 있는지 확인해 주세요.")); }, []);
  useEffect(() => save("ab.person", person), [person]);
  useEffect(() => save("ab.scenarios", scenarios), [scenarios]);

  async function run() {
    setLoading(true); setError("");
    try {
      const p = { ...person, sbp: person.sbp === "" ? null : person.sbp };
      const sc = scenarios.map((s) => ({ ...s, foods: s.foods.filter((f) => f.query.trim()) }));
      const data = await runSimulation(p, sc);
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold text-brand">AfterBody</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">내 몸에 먼저 해보기</h1>
        <p className="mt-2 text-mute">오늘의 선택을 내 몸에 미리 적용해 보고, 반복하면 어떻게 달라지는지 비교해 보세요.</p>
      </header>

      <div className="flex flex-col gap-5">
        <PersonCard person={person} onChange={setPerson} />

        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">비교할 선택지</h2>
          <button className="text-sm text-mute underline" onClick={() => { setScenarios(PRESETS); setResult(null); }}>예시로 되돌리기</button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {scenarios.map((s, i) => (
            <ScenarioCard key={i} index={i} color={COLORS[i]} scenario={s} catalog={catalog}
              onChange={(v) => setScenarios(scenarios.map((x, j) => (j === i ? v : x)))}
              onRemove={scenarios.length > 1 ? () => setScenarios(scenarios.filter((_, j) => j !== i)) : null} />
          ))}
          {scenarios.length < 3 && (
            <button className="min-h-40 rounded-2xl border-2 border-dashed border-line text-mute hover:border-brand hover:text-brand"
              onClick={() => setScenarios([...scenarios, { name: `선택 ${scenarios.length + 1}`, foods: [{ query: "", grams: null, choice: 0 }], drinks: [], exercises: [], times_per_week: 2 }])}>
              + 선택지 추가
            </button>
          )}
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={run} disabled={loading}
          className="mx-auto mt-2 w-full max-w-md rounded-full bg-brand py-4 text-lg font-bold text-white shadow-lg disabled:opacity-60">
          {loading ? "내 몸에 적용하는 중…" : "내 몸에 먼저 해보기"}
        </motion.button>
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div ref={resultRef} className="mt-12">
        <AnimatePresence>
          {result && (
            <motion.div key={JSON.stringify(result.person)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Results data={result} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="mt-16 text-center text-xs leading-relaxed text-mute">
        의학적 진단이 아닌 건강관리 참고용 추정치입니다. 건강 문제는 전문의와 상담하세요.<br />
        데이터: 식약처 식품영양성분DB · 질병관리청 국민건강영양조사 2024 · 2025 한국인 영양소 섭취기준 · 무작위대조시험 메타분석
      </footer>
    </div>
  );
}
