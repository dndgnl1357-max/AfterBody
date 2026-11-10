import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS } from "../presets";
import Avatar from "./Avatar";

function CountUp({ value, duration = 900, decimals = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      start ??= t;
      const k = Math.min((t - start) / duration, 1);
      setV(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{v.toLocaleString("ko-KR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</>;
}

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl bg-card p-5 shadow-sm ring-1 ring-line ${className}`}>{children}</div>
);
const signed = (x, d = 1) => `${x > 0 ? "+" : ""}${x.toFixed(d)}`;
const hourLabel = (h) => `${String(Math.floor(h % 24)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

// ── 오늘 밤
function TodayCard({ r, color, i }) {
  const t = r.today;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}>
      <Card className="h-full" >
        <p className="text-sm font-bold" style={{ color }}>{r.scenario}</p>
        <p className="mt-2 text-3xl font-extrabold tabular-nums">
          <CountUp value={t.kcal.med} /> <span className="text-base font-semibold text-mute">kcal</span>
        </p>
        <p className="text-xs text-mute">범위 {t.kcal.p10.toLocaleString()}–{t.kcal.p90.toLocaleString()} · 하루 필요량의 {t.pct_of_daily_need.med}%</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>🚶 빠르게 걸어서 태우려면 <b><CountUp value={r.fun.walk_minutes_to_burn} />분</b></li>
          <li>🍚 공기밥 <b><CountUp value={r.fun.rice_bowls} decimals={1} />그릇</b> 만큼</li>
          <li>🧂 나트륨 {r.fun.sodium_vs_daily}</li>
          <li>🩸 혈당 부하 <b>{t.glycemic.level}</b> <span className="text-mute">(GL {t.glycemic.load}{t.glycemic.gi_estimated ? ", 추정" : ""})</span></li>
          {t.alcohol && (
            <li>🍺 알코올 {t.alcohol.grams}g · 분해 완료 <b>{t.alcohol.sober_time}</b></li>
          )}
          {t.exercise_kcal > 0 && <li>🔥 운동으로 추가 소모 <b>{t.exercise_kcal}kcal</b></li>}
        </ul>
      </Card>
    </motion.div>
  );
}

function GlucoseChart({ results }) {
  const data = results[0].today.glycemic.curve.minute.map((m, k) => {
    const row = { m };
    results.forEach((r, i) => (row[`s${i}`] = r.today.glycemic.curve.index[k]));
    return row;
  });
  return (
    <Card>
      <h3 className="font-bold">식후 혈당 반응 (상대 지수)</h3>
      <p className="mb-3 text-xs text-mute">포도당 50g을 먹었을 때의 정점을 100으로 둔 상대값이에요. 실제 혈당 수치(mg/dL)는 아닙니다.</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="m" tickFormatter={(v) => `${v}분`} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip formatter={(v) => v.toFixed(0)} labelFormatter={(v) => `식후 ${v}분`} />
          <Legend />
          {results.map((r, i) => (
            <Line key={i} dataKey={`s${i}`} name={r.scenario} stroke={COLORS[i]} strokeWidth={2.5} dot={false}
              animationDuration={1400} animationBegin={i * 250} />
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
      <h3 className="font-bold">혈중알코올농도</h3>
      <p className="mb-3 text-xs text-mute">Widmark 공식 추정. 0.03% 이상이면 운전하면 안 돼요(면허정지 기준).</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart margin={{ left: -10, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="h" type="number" domain={["dataMin", "dataMax"]} tickFormatter={hourLabel} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `${v.toFixed(2)}%`} />
          <Tooltip formatter={(v) => `${v.toFixed(3)}%`} labelFormatter={hourLabel} />
          {drinking.map(({ r, i }) => (
            <Line key={i} name={r.scenario} stroke={COLORS[i]} strokeWidth={2.5} dot={false} animationDuration={1600}
              data={r.today.alcohol.curve.hour.map((h, k) => ({ h, v: r.today.alcohol.curve.bac_pct[k] }))} dataKey="v" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 미래의 나
function RiskBar({ risk, color, show }) {
  const after = show ? risk.after.med : risk.now;
  const diff = after - risk.now;
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{risk.name}</span>
        <span className="tabular-nums">
          {after.toFixed(1)}%{show && Math.abs(diff) >= 0.1 && (
            <b className={diff > 0 ? "text-red-600" : "text-green-700"}> ({signed(diff)}%p)</b>
          )}
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-paper">
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }}
          initial={false} animate={{ width: `${Math.min(after, 100)}%` }} transition={{ duration: 0.8 }} />
        <div className="absolute inset-y-[-2px] w-0.5 bg-ink/50" style={{ left: `${risk.now}%` }} title="현재" />
      </div>
    </div>
  );
}

function Future({ data }) {
  const [h, setH] = useState(2);          // 0 지금, 1 3개월, 2 1년
  const tabs = ["지금", "3개월 뒤", "1년 뒤"];
  const baseBmi = data.person.bmi;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">미래의 나</h3>
        <div className="flex rounded-full bg-paper p-1 text-sm">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setH(i)}
              className={`rounded-full px-4 py-1.5 transition ${h === i ? "bg-ink text-white" : "text-mute"}`}>{t}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-mute">각 선택을 설정한 횟수만큼 매주 반복했을 때예요. 흐릿한 그림자는 예측 범위의 큰 쪽이에요.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {data.results.map((r, i) => {
          const lt = h > 0 ? r.long_term[h - 1] : null;
          const bmi = lt ? lt.bmi.med : baseBmi;
          const w = lt?.weight_change_kg;
          return (
            <div key={i} className="flex flex-col gap-3">
              <p className="text-center text-sm font-bold" style={{ color: COLORS[i] }}>{r.scenario} <span className="font-normal text-mute">· 주 {r.times_per_week}회</span></p>
              <Avatar bmi={bmi} bmiHigh={lt ? Math.max(lt.bmi.p90, lt.bmi.p10) : null} color={COLORS[i]} label={r.scenario} />
              <p className="text-center text-2xl font-extrabold tabular-nums">
                {w ? `${signed(w.med)}kg` : "—"}
              </p>
              {w && <p className="-mt-3 text-center text-xs text-mute">범위 {signed(w.p10)} ~ {signed(w.p90)}kg</p>}
              <div className="space-y-2">
                {Object.values(lt ? lt.risks : r.long_term[0].risks).map((rk) => (
                  <RiskBar key={rk.name} risk={rk} color={COLORS[i]} show={!!lt} />
                ))}
              </div>
              {lt && (
                <div className="rounded-xl bg-paper p-3 text-xs leading-relaxed">
                  🫀 수축기 혈압 <b>{signed(lt.sbp_change.med)} mmHg</b>
                  {lt.sbp_projected && <> → 약 {lt.sbp_projected.med}</>}
                  <br />💓 심혈관 질환 위험 <b className={lt.cvd_relative_risk.med > 1 ? "text-red-600" : "text-green-700"}>
                    {signed((lt.cvd_relative_risk.med - 1) * 100, 0)}%</b>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Results({ data }) {
  const warnings = [...new Set(data.results.flatMap((r) => r.warnings))];
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-extrabold">오늘 밤 내 몸은</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {data.results.map((r, i) => <TodayCard key={i} r={r} i={i} color={COLORS[i]} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlucoseChart results={data.results} />
        <AlcoholChart results={data.results} />
      </div>
      <Future data={data} />
      <details className="rounded-2xl bg-card p-5 text-sm ring-1 ring-line">
        <summary className="cursor-pointer font-semibold">어떻게 계산했나요?</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-mute">
          {data.assumptions.map((a) => <li key={a}>{a}</li>)}
          {warnings.map((w) => <li key={w} className="text-amber-700">{w}</li>)}
        </ul>
      </details>
    </div>
  );
}
