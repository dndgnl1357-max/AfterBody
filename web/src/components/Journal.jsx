import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import Avatar from "../avatar/Avatar";
import { getJournal } from "../api";
import { BLANK, INK, frequentFoods } from "../presets";
import ScenarioCard from "./ScenarioCard";

const KEY = "ab.journal";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장 공간 문제는 무시 */ } };
const iso = (d) => d.toLocaleDateString("sv");                   // 로컬 날짜 YYYY-MM-DD
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wd = (s) => WD[new Date(`${s}T12:00:00`).getDay()];
const signed = (x, d = 1) => `${x > 0 ? "+" : ""}${Number(x).toFixed(d)}`;

const Card = ({ children, className = "" }) => <div className={`rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line ${className}`}>{children}</div>;
const Stat = ({ big, small, tone }) => (
  <div className="rounded-2xl bg-paper px-4 py-3">
    <p className={`font-display text-2xl tabular-nums ${tone ?? ""}`}>{big}</p>
    <p className="text-xs text-mute">{small}</p>
  </div>
);

/** 기록 한 건 → API 형식 (빈 음식 칸 제거) */
function toApi(date, e) {
  const meals = Object.fromEntries(Object.entries(e.meals ?? {}).map(([k, m]) => [k, { ...m, foods: (m.foods ?? []).filter((f) => f.query.trim()) }]));
  return { date, meals, drinks: e.drinks ?? [], drink_start_hour: e.drink_start_hour, exercises: e.exercises ?? [],
    weight_kg: e.weight_kg || null, logged: e.logged !== false };
}

export default function Journal({ person, personPayload, catalog, look, onCompare, version = 0 }) {
  const [entries, setEntries] = useState(load);
  const [day, setDay] = useState(today());
  const [end, setEnd] = useState(today());          // 날짜 줄의 마지막 날 (이전 2주로 이동)
  const [view, setView] = useState("log");          // 모바일: log 기록하기 / trend 변화 보기
  useEffect(() => { setEntries(load()); }, [version]);   // 예시 데이터를 불러오면 다시 읽기
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();
  const stripRef = useRef();
  useEffect(() => { const el = stripRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [end]);   // 마지막 날이 보이게

  useEffect(() => save(entries), [entries]);

  const entry = entries[day];
  const scenario = entry ? { ...BLANK(0), ...entry, name: day } : null;
  const setEntry = (patch) => setEntries((all) => ({ ...all, [day]: { ...(all[day] ?? { ...BLANK(0), logged: true }), ...patch } }));
  const removeEntry = () => setEntries((all) => { const n = { ...all }; delete n[day]; return n; });

  // 기록이 바뀌면 0.8초 뒤 다시 계산
  const apiEntries = useMemo(() => Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([d, e]) => toApi(d, e)), [entries]);
  useEffect(() => {
    if (!apiEntries.length) { setData(null); return; }
    const t = setTimeout(async () => {
      setBusy(true); setErr("");
      try { setData(await getJournal(personPayload(), apiEntries, today())); }
      catch (e) { setErr(e.message); }
      finally { setBusy(false); }
    }, 800);
    return () => clearTimeout(t);
  }, [apiEntries, person]);   // eslint-disable-line react-hooks/exhaustive-deps

  const strip = Array.from({ length: 14 }, (_, i) => addDays(end, i - 13));
  const frequent = useMemo(() => frequentFoods(entries), [entries]);
  // 이 날 이전에 식사를 기록한 가장 가까운 날
  const prevDay = Object.keys(entries).filter((d) => d < day && entries[d].logged !== false).sort().at(-1);
  const copyFrom = (d) => { const { weight_kg, ...rest } = structuredClone(entries[d]); setEntry({ ...rest, logged: true }); };
  const byDate = Object.fromEntries((data?.days ?? []).map((d) => [d.date, d]));

  function exportFile() {
    const blob = new Blob([JSON.stringify({ app: "AfterBody", version: 1, entries }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `afterbody-기록-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importFile(f) {
    try {
      const j = JSON.parse(await f.text());
      if (!j.entries || typeof j.entries !== "object") throw new Error();
      setEntries((all) => ({ ...all, ...j.entries }));
    } catch { setErr("백업 파일을 읽지 못했어요. AfterBody에서 내보낸 파일인지 확인해 주세요."); }
  }

  const chartDays = (data?.days ?? []).map((d) => ({ ...d, label: md(d.date) }));
  const lastH = data?.projection.horizons.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl">내 기록</h1>
          <p className="text-sm text-mute">매일 먹은 것을 적으면 쌓인 변화를 보여주고, 체중도 적으면 예측이 나에게 맞춰져요.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button onClick={exportFile} disabled={!Object.keys(entries).length} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line disabled:opacity-40">⬇ 백업 내보내기</button>
          <button onClick={() => fileRef.current.click()} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line">⬆ 불러오기</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-mute">기록은 이 기기 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 가끔 백업해 두세요.</p>

      {/* 날짜 줄 (2주씩 이동) */}
      <div className="flex items-center gap-2">
        <button onClick={() => setEnd(addDays(end, -14))} className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm ring-1 ring-line" aria-label="이전 2주">◀</button>
        <div ref={stripRef} className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
        {strip.map((d) => {
          const e = entries[d], info = byDate[d];
          const sel = d === day;
          return (
            <button key={d} onClick={() => setDay(d)}
              className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 text-xs ring-1 transition ${sel ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
              <span className={sel ? "text-white/70" : "text-mute"}>{wd(d)}</span>
              <span className="font-semibold">{md(d)}</span>
              <span className={`mt-1 size-2 rounded-full ${e?.logged !== false && e ? "bg-brand" : e?.weight_kg ? "bg-sky-400" : "bg-line"}`} />
              <span className="mt-0.5 h-3 text-[10px] tabular-nums">{info?.kcal ? Math.round(info.kcal) : ""}</span>
            </button>
          );
        })}
        </div>
        <button onClick={() => setEnd(addDays(end, 14) > today() ? today() : addDays(end, 14))} disabled={end >= today()}
          className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm ring-1 ring-line disabled:opacity-30" aria-label="다음 2주">▶</button>
        <input type="date" value={day} max={today()} aria-label="날짜로 이동"
          onChange={(e) => { if (e.target.value) { setDay(e.target.value); setEnd(addDays(e.target.value, 7) > today() ? today() : addDays(e.target.value, 7)); } }}
          className="hidden shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-xs sm:block" />
      </div>

      {/* 모바일: 기록하기 / 변화 보기 */}
      <div className="grid grid-cols-2 rounded-2xl bg-white p-1 text-sm ring-1 ring-line lg:hidden" role="tablist">
        {[["log", "✏️ 기록하기"], ["trend", "📈 변화 보기"]].map(([k, t]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`rounded-xl py-2 ${view === k ? "bg-ink font-semibold text-white" : "text-mute"}`}>{t}</button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* 선택한 날 기록 */}
        <div className={`flex-col gap-3 ${view === "log" ? "flex" : "hidden lg:flex"}`}>
          <Card className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-xl">{md(day)} ({wd(day)}) {day === today() && <span className="text-sm text-brand">오늘</span>}</p>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-mute">잰 체중</span>
                <input type="number" step="0.1" placeholder="kg" value={entry?.weight_kg ?? ""}
                  onChange={(e) => setEntry({ weight_kg: e.target.value ? Number(e.target.value) : null, logged: entry ? entry.logged : false })}
                  className="w-20 rounded-lg border border-line bg-white px-2 py-1 text-sm" aria-label="그날 잰 체중" />
              </label>
            </div>
            {!scenario || scenario.logged === false ? (
              <div className="mt-3 flex flex-col gap-2">
                <button onClick={() => setEntry({ logged: true })} className="w-full rounded-2xl border-2 border-dashed border-line py-5 text-mute hover:border-brand hover:text-brand">
                  + 이 날 먹은 것 기록하기
                </button>
                {prevDay && (
                  <button onClick={() => copyFrom(prevDay)} className="w-full rounded-2xl bg-paper py-2.5 text-sm ring-1 ring-line hover:ring-brand">
                    🔁 {md(prevDay)}({wd(prevDay)})과 똑같이 먹었어요
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                <span>바꾸지 않은 끼니는 '평소대로'로 계산해요. 입력하면 바로 저장돼요.</span>
                {prevDay && <button onClick={() => copyFrom(prevDay)} className="underline">🔁 {md(prevDay)} 기록 그대로 가져오기</button>}
                <button onClick={() => onCompare?.({ ...scenario, name: `${md(day)} 기록` })} className="text-brand underline">이 하루를 비교에 넣기 →</button>
                <button onClick={removeEntry} className="underline">이 날 기록 지우기</button>
              </div>
            )}
          </Card>
          {scenario && scenario.logged !== false && (
            <ScenarioCard index={0} color={INK[0]} scenario={scenario} catalog={catalog} hideHeader hideWeekly frequent={frequent}
              onChange={(v) => { const { name, ...rest } = v; setEntry({ ...rest, logged: true }); }} />
          )}
        </div>

        {/* 누적 분석 */}
        <div className={`flex-col gap-4 ${view === "trend" ? "flex" : "hidden lg:flex"}`}>
          {!data && !busy && <Card><p className="text-sm text-mute">하루라도 기록하면 여기에 쌓인 변화가 나타나요.</p></Card>}
          {busy && !data && <Card><p className="text-sm text-mute">기록을 모아 계산하는 중… (서버가 잠들어 있었다면 30초쯤 걸려요)</p></Card>}
          {busy && data && <p className="text-xs text-mute">다시 계산하는 중…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat big={`${data.summary.logged_days}일`} small={`기록한 날 (최근 ${data.summary.total_days}일 중)`} />
                <Stat big={data.summary.avg_kcal ? `${data.summary.avg_kcal.toLocaleString()}` : "-"} small={`평균 섭취 kcal · 필요 ${data.summary.need_kcal.toLocaleString()}`} />
                <Stat big={`${signed(data.summary.predicted_change_kg)}kg`} small="지금까지 쌓인 예상 변화"
                  tone={data.summary.predicted_change_kg > 0.05 ? "text-red-500" : data.summary.predicted_change_kg < -0.05 ? "text-green-600" : ""} />
                <Stat big={`${data.calibration.need_kcal.toLocaleString()}`}
                  small={data.calibration.used ? `내 몸에 맞춘 필요 kcal (공식 ${data.eer_kcal.toLocaleString()})` : "하루 필요 kcal (공식 추정)"} />
              </div>
              {!data.calibration.used && (
                <p className="rounded-2xl bg-sky-50 px-4 py-2 text-xs text-sky-800">
                  💡 체중을 <b>3번 이상, 10일 넘게</b> 적으면 실제 체중 변화로 내 몸의 필요 열량을 다시 맞춰요 (지금 {data.calibration.n_weights}번 · {data.calibration.span_days}일).
                </p>
              )}

              <Card>
                <h3 className="font-display text-xl">날마다 먹은 양</h3>
                <p className="mb-2 text-xs text-mute">막대: 섭취 열량 · 선: 하루 필요량 · 기록 없는 날은 평소대로로 계산</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartDays} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0e6da" />
                    <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v, n) => [`${Math.round(v)} kcal`, n]} />
                    <Bar dataKey="kcal" name="섭취" fill={INK[0]} radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    <Line dataKey="need_kcal" name="필요량" stroke="#868e96" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <h3 className="font-display text-xl">체중 흐름</h3>
                <p className="mb-2 text-xs text-mute">선: 기록으로 예상한 체중 · 점: 실제로 잰 체중</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartDays} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0e6da" />
                    <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
                    <YAxis fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => v.toFixed(1)} />
                    <Tooltip formatter={(v, n) => [`${Number(v).toFixed(1)} kg`, n]} />
                    <Line dataKey="predicted_weight" name="예상" stroke={INK[1]} strokeWidth={3} dot={false} isAnimationActive={false} />
                    <Scatter dataKey="measured_weight" name="실제" fill="#2b2a32" isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              {lastH && data.projection.based_on_days > 0 && (
                <Card className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="flex items-end gap-2">
                    <div className="text-center"><Avatar spec={look.spec} bmi={data.projection.from_weight / (person.height_cm / 100) ** 2} refBmi={data.projection.from_weight / (person.height_cm / 100) ** 2} color="#ffb98a" size={90} /><p className="text-xs text-mute">지금</p></div>
                    <span className="mb-16 text-2xl text-mute">→</span>
                    <div className="text-center"><Avatar spec={look.spec} bmi={lastH.bmi} refBmi={data.projection.from_weight / (person.height_cm / 100) ** 2} color="#ffb98a" size={90}
                      mood={lastH.change_kg > 1.5 ? "tired" : lastH.change_kg < -0.5 ? "happy" : "meh"} delay={0.4} /><p className="text-xs text-mute">1년 뒤</p></div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-xl">최근 {data.projection.based_on_days}일처럼 계속하면</h3>
                    <p className="text-sm text-mute">하루 평균 {signed(data.projection.avg_delta_kcal, 0)}kcal (필요량 대비)</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {data.projection.horizons.map((h) => (
                        <Stat key={h.days} big={`${signed(h.change_kg)}kg`} small={`${h.days === 90 ? "3개월" : "1년"} 뒤 · 고혈압 ${h.risks.htn}% · 당뇨 ${h.risks.dm}%`}
                          tone={h.change_kg > 0.3 ? "text-red-500" : h.change_kg < -0.3 ? "text-green-600" : ""} />
                      ))}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
