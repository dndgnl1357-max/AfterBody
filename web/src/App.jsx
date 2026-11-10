import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getCatalog, runSimulation } from "./api";
import PersonCard from "./components/PersonCard";
import Results from "./components/Results";
import ScenarioCard from "./components/ScenarioCard";
import { BLANK, DEFAULT_PERSON, INK, PRESETS } from "./presets";

// 브라우저에 입력값 기억 (실패해도 동작에는 지장 없음)
const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export default function App() {
  const [person, setPerson] = useState(() => load("ab.person", DEFAULT_PERSON));
  const [scenarios, setScenarios] = useState(() => load("ab.scenarios", PRESETS));
  const [look, setLook] = useState(() => load("ab.look", { skin: "mochi", photo: null }));
  const [catalog, setCatalog] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef();

  useEffect(() => { getCatalog().then(setCatalog).catch(() => setError("서버에 연결할 수 없어요. API 서버가 켜져 있는지 확인해 주세요.")); }, []);
  useEffect(() => save("ab.person", person), [person]);
  useEffect(() => save("ab.scenarios", scenarios), [scenarios]);
  useEffect(() => save("ab.look", look), [look]);

  async function run() {
    setLoading(true); setError("");
    try {
      const blankToNull = (v) => (v === "" || v === undefined ? null : v);
      const p = { ...person, sbp: blankToNull(person.sbp), bmr_kcal: blankToNull(person.bmr_kcal),
        body_fat_pct: blankToNull(person.body_fat_pct), skeletal_muscle_kg: blankToNull(person.skeletal_muscle_kg) };
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
        <p className="font-display text-xl text-brand">AfterBody</p>
        <h1 className="font-display mt-1 text-4xl leading-tight sm:text-5xl">먹기 전에,<br />미래의 나한테 먼저 물어보기</h1>
        <p className="mt-3 text-mute">오늘 뭐 먹을지 고민될 때. 선택지 몇 개 넣어보면 1년 뒤 내 모습을 미리 보여줄게요.</p>
      </header>

      <div className="flex flex-col gap-5">
        <PersonCard person={person} onChange={setPerson} look={look} onLook={setLook} />

        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">오늘 뭐 할까 고민 중이에요?</h2>
          <div className="flex gap-3 text-sm text-mute">
            <button className="underline" onClick={() => { setScenarios([BLANK(0), BLANK(1)]); setResult(null); }}>빈칸에서 시작</button>
            <button className="underline" onClick={() => { setScenarios(PRESETS); setResult(null); }}>예시 보기</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {scenarios.map((s, i) => (
            <ScenarioCard key={i} index={i} color={INK[i]} scenario={s} catalog={catalog}
              onChange={(v) => setScenarios(scenarios.map((x, j) => (j === i ? v : x)))}
              onRemove={scenarios.length > 1 ? () => setScenarios(scenarios.filter((_, j) => j !== i)) : null} />
          ))}
          {scenarios.length < 3 && (
            <button className="min-h-40 rounded-3xl border-2 border-dashed border-line text-mute hover:border-brand hover:text-brand"
              onClick={() => setScenarios([...scenarios, BLANK(scenarios.length)])}>
              + 선택지 추가
            </button>
          )}
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={run} disabled={loading}
          className="font-display mx-auto mt-2 w-full max-w-md rounded-full bg-brand py-4 text-2xl text-white shadow-lg shadow-orange-200 disabled:opacity-60">
          {loading ? "미래의 나 불러오는 중…" : "미래의 나 만나러 가기 →"}
        </motion.button>
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div ref={resultRef} className="mt-12">
        <AnimatePresence>
          {result && (
            <motion.div key={JSON.stringify(result.person)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Results data={result} look={look} />
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
