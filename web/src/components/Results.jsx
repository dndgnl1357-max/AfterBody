import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS, INK } from "../presets";
import Character from "./Character";

const Card = ({ children, className = "" }) => (
  <div className={`rounded-3xl bg-card p-6 shadow-sm ring-1 ring-line ${className}`}>{children}</div>
);
const signed = (x, d = 1) => `${x > 0 ? "+" : ""}${x.toFixed(d)}`;
const hourLabel = (h) => `${String(Math.floor(h % 24)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const PERIOD = ["오늘", "3개월", "1년"];

function CountUp({ value, decimals = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      start ??= t;
      const k = Math.min((t - start) / 900, 1);
      setV(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toLocaleString("ko-KR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</>;
}

// ── 캐릭터의 한마디 (결과 숫자 → 사람 말투)
function talk(r, h) {
  const t = r.today;
  if (h === 0) {
    const pct = t.pct_of_daily_need.med;
    if (t.alcohol) return `술은 ${t.alcohol.sober_time.replace("다음날 ", "내일 ")}쯤 다 깨요`;
    if (pct >= 120) return `하루 필요량의 ${pct}%… 오늘 좀 많이 먹었다`;
    if (t.exercise_kcal > 0) return `오늘 ${t.exercise_kcal}kcal 더 태웠다!`;
    if (t.meals.some((m) => m.mode === "skip")) return "한 끼 건너뛰었더니 배고파…";
    return pct <= 95 ? "가볍게 잘 먹었다~" : "딱 평소만큼 먹었다";
  }
  const lt = r.long_term[h - 1], w = lt.weight_change_kg.med, bp = lt.sbp_change.med;
  const when = `${PERIOD[h]} 뒤`;
  let s;
  if (w >= 2) s = `${when}엔 ${signed(w)}kg… 바지가 좀 낄지도?`;
  else if (w >= 0.5) s = `티는 안 나는데 ${signed(w)}kg 슬금슬금`;
  else if (w > -0.5) s = "거의 그대로! 유지 성공";
  else s = `${Math.abs(w).toFixed(1)}kg 가벼워졌다!`;
  if (bp <= -3) s += " 혈압도 내려갔어";
  else if (bp >= 3) s += " 혈압은 좀 올랐네";
  return s;
}

function mood(r, h) {
  if (h === 0) return r.today.alcohol ? "meh" : "happy";
  const lt = r.long_term[h - 1];
  if (lt.weight_change_kg.med >= 1.5 || lt.sbp_change.med >= 3) return "tired";
  return lt.weight_change_kg.med <= -0.5 ? "happy" : "meh";
}

// ── 미래의 나 (메인)
function Future({ data, look }) {
  const [h, setH] = useState(2);
  const ref = data.person.bmi;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">미래의 나</h2>
          <p className="text-sm text-mute">이런 날을 매주 반복하면 이렇게 돼요</p>
        </div>
        <div className="flex rounded-full bg-paper p-1">
          {PERIOD.map((t, i) => (
            <button key={t} onClick={() => setH(i)}
              className={`font-display rounded-full px-5 py-2 text-lg transition ${h === i ? "bg-ink text-white shadow" : "text-mute"}`}>
              {i === 0 ? t : `${t} 뒤`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-3">
        {data.results.map((r, i) => {
          const lt = h > 0 ? r.long_term[h - 1] : null;
          const bmi = lt ? lt.bmi.med : ref;
          const props = { beer: !!r.today.alcohol, headband: r.today.exercise_kcal > 0 };
          const m = mood(r, h);
          return (
            <div key={i} className="flex flex-col items-center text-center">
              <AnimatePresence mode="wait">
                <motion.div key={`${h}-${i}`} initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }} transition={{ delay: i * 0.08 }}
                  className="relative mb-1 min-h-14 max-w-60 rounded-2xl bg-paper px-4 py-2.5 text-sm font-medium">
                  {talk(r, h)}
                  <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-paper" />
                </motion.div>
              </AnimatePresence>
              <Character bmi={bmi} refBmi={ref} color={COLORS[i]} skin={look.skin} photo={look.photo}
                mood={m} props={{ ...props, sweat: m === "tired" }} delay={i * 0.4} />
              <p className="font-display text-xl" style={{ color: INK[i] }}>{r.scenario}</p>
              <p className="text-xs text-mute">일주일에 {r.times_per_week}번</p>
              <p className="font-display mt-2 text-4xl tabular-nums">{lt ? `${signed(lt.weight_change_kg.med)}kg` : "지금 그대로"}</p>
              {lt && <p className="text-xs text-mute">아마도 {signed(lt.weight_change_kg.p10)} ~ {signed(lt.weight_change_kg.p90)}kg 사이</p>}
              {lt && (
                <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5 text-xs">
                  {Object.values(lt.risks).map((rk) => {
                    const d = rk.after.med - rk.now;
                    return (
                      <span key={rk.name} className="rounded-full bg-paper px-2.5 py-1">
                        {rk.name} {rk.now}→<b className={d > 0.05 ? "text-red-500" : d < -0.05 ? "text-green-600" : ""}>{rk.after.med}%</b>
                      </span>
                    );
                  })}
                  <span className="rounded-full bg-paper px-2.5 py-1">
                    혈압 <b className={lt.sbp_change.med > 0 ? "text-red-500" : "text-green-600"}>{signed(lt.sbp_change.med)}</b>
                    {lt.sbp_projected && <> (→{lt.sbp_projected.med})</>}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[11px] text-mute">캐릭터 몸 변화는 눈에 잘 보이게 과장했어요. 숫자가 실제 추정값이에요.</p>
    </Card>
  );
}

// ── 오늘 밤 자세히
const Chip = ({ big, small }) => (
  <div className="rounded-2xl bg-paper px-3 py-2.5">
    <p className="font-display text-xl leading-tight">{big}</p>
    <p className="text-[11px] text-mute">{small}</p>
  </div>
);

const SEG = { usual: "var(--color-line)", skip: "transparent" };

/** 하루 열량이 어디서 왔는지: 끼니 + 술 가로 막대 */
function DayBar({ t, i }) {
  const parts = [
    ...t.meals.map((m) => ({ key: m.slot, label: m.label, kcal: m.kcal.med, mode: m.mode })),
    ...(t.alcohol ? [{ key: "drink", label: "술", kcal: t.alcohol.kcal, mode: "drink" }] : []),
  ];
  const total = parts.reduce((a, p) => a + p.kcal, 0) || 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-7 w-full overflow-hidden rounded-full bg-paper ring-1 ring-line">
        {parts.filter((p) => p.kcal > 0).map((p) => (
          <motion.div key={p.key} initial={{ width: 0 }} animate={{ width: `${(p.kcal / total) * 100}%` }} transition={{ duration: 0.8 }}
            title={`${p.label} ${Math.round(p.kcal)}kcal`}
            className="flex items-center justify-center overflow-hidden whitespace-nowrap border-r border-white text-[11px] font-semibold last:border-r-0"
            style={{ background: p.mode === "usual" ? SEG.usual : p.mode === "drink" ? "#ffd43b" : INK[i], color: p.mode === "usual" || p.mode === "drink" ? "var(--color-ink)" : "#fff" }}>
            {p.kcal / total > 0.12 ? p.label : ""}
          </motion.div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mute">
        {parts.map((p) => (
          <li key={p.key}>
            {p.label} <b className="text-ink tabular-nums">{p.mode === "skip" ? "안 먹음" : `${Math.round(p.kcal)}`}</b>
            {p.mode === "usual" && <span> (평소)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayCard({ r, i }) {
  const t = r.today;
  const eaten = t.meals.filter((m) => m.mode === "custom").flatMap((m) => m.items.map((n) => `${m.label}: ${n}`));
  return (
    <Card className="!p-5 flex flex-col gap-3">
      <div>
        <p className="font-display text-lg" style={{ color: INK[i] }}>{r.scenario}</p>
        <p className="font-display text-4xl tabular-nums"><CountUp value={t.kcal.med} /><span className="ml-1 text-lg text-mute">kcal</span></p>
        <p className="text-xs text-mute">하루에 필요한 양의 <b className={t.pct_of_daily_need.med > 110 ? "text-red-500" : t.pct_of_daily_need.med < 90 ? "text-green-600" : ""}>{t.pct_of_daily_need.med}%</b>
          {t.exercise_kcal > 0 && <> · 운동으로 {t.exercise_kcal}kcal 더 태움</>}</p>
      </div>
      <DayBar t={t} i={i} />
      {eaten.length > 0 && <p className="text-xs text-mute">{eaten.join(" · ")}</p>}
      <div className="grid grid-cols-2 gap-2">
        {t.entered_kcal > 0 && <Chip big={<><CountUp value={r.fun.walk_minutes_to_burn} />분</>} small="직접 넣은 음식·술을 빠르게 걸어 태우려면" />}
        {t.entered_kcal > 0 && <Chip big={<><CountUp value={r.fun.rice_bowls} decimals={1} />공기</>} small="밥으로 치면" />}
        <Chip big={`${t.sodium_pct_of_daily_limit.med}%`} small="하루 나트륨 한도 중" />
        {t.glycemic.meal && <Chip big={t.glycemic.level} small={`혈당 부하 가장 큰 끼니: ${t.glycemic.meal}${t.glycemic.gi_estimated ? " (추정)" : ""}`} />}
        {t.alcohol && <Chip big={t.alcohol.sober_time.replace("다음날 ", "")} small="술 다 깨는 시각 (다음날)" />}
      </div>
    </Card>
  );
}

function GlucoseChart({ results }) {
  const data = results[0].today.glycemic.curve.hour.map((h, k) => {
    const row = { h };
    results.forEach((r, n) => (row[`s${n}`] = r.today.glycemic.curve.index[k]));
    return row;
  });
  return (
    <Card>
      <h3 className="font-display text-xl">하루 동안 혈당은?</h3>
      <p className="mb-3 text-xs text-mute">끼니마다 오르내리는 흐름이에요. 포도당 50g 먹었을 때 꼭대기를 100으로 둔 상대 비교 (실제 혈당 수치 아님)</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: -24, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0e6da" />
          <XAxis dataKey="h" type="number" domain={[6, 26]} ticks={[6, 9, 12, 15, 18, 21, 24]} tickFormatter={hourLabel} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip formatter={(v, n) => [v.toFixed(0), n]} labelFormatter={(v) => hourLabel(v)} />
          {results.map((r, n) => (
            <Line key={n} dataKey={`s${n}`} name={r.scenario} stroke={INK[n]} strokeWidth={3} dot={false}
              animationDuration={1400} animationBegin={n * 250} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function AlcoholChart({ results }) {
  const drinking = results.map((r, i) => ({ r, i })).filter(({ r }) => r.today.alcohol);
  if (!drinking.length) return null;
  return (
    <Card>
      <h3 className="font-display text-xl">술은 언제 깰까?</h3>
      <p className="mb-3 text-xs text-mute">0.03%를 넘으면 운전하면 안 돼요 (면허정지 기준)</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart margin={{ left: -10, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0e6da" />
          <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={hourLabel} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `${v.toFixed(2)}%`} />
          <Tooltip formatter={(v) => `${v.toFixed(3)}%`} labelFormatter={hourLabel} />
          {drinking.map(({ r, i }) => (
            <Line key={i} name={r.scenario} stroke={INK[i]} strokeWidth={3} dot={false} animationDuration={1600}
              data={r.today.alcohol.curve.hour.map((h, k) => ({ h, v: r.today.alcohol.curve.bac_pct[k] }))} dataKey="v" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function Results({ data, look }) {
  const warnings = [...new Set(data.results.flatMap((r) => r.warnings))];
  return (
    <div className="flex flex-col gap-5">
      <Future data={data} look={look} />
      <h2 className="font-display mt-6 text-2xl">그 하루만 놓고 보면</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {data.results.map((r, i) => <DayCard key={i} r={r} i={i} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlucoseChart results={data.results} />
        <AlcoholChart results={data.results} />
      </div>
      <details className="rounded-3xl bg-card p-5 text-sm ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">이 숫자들, 어떻게 나왔어요?</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-mute">
          <li>하루 필요 열량 {data.person.eer_kcal.toLocaleString()}kcal — {data.person.energy_source}</li>
          {data.assumptions.map((a) => <li key={a}>{a}</li>)}
          {warnings.map((w) => <li key={w} className="text-amber-700">{w}</li>)}
        </ul>
      </details>
    </div>
  );
}
