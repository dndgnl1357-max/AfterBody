import { useEffect, useRef, useState } from "react";
import { searchFood } from "../api";
import { MEALS, PORTION_STEPS, fromTime, toTime } from "../presets";

const inputCls = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const RemoveBtn = ({ onClick }) => (
  <button type="button" onClick={onClick} className="shrink-0 px-1 text-mute hover:text-ink" aria-label="삭제">✕</button>
);
const TimeInput = ({ value, onChange, label }) => (
  <input type="time" aria-label={label} className="w-[7.5rem] shrink-0 rounded-lg border border-line bg-white px-1.5 py-1 text-xs tabular-nums focus:border-brand focus:outline-none"
    value={toTime(value)} onChange={(e) => e.target.value && onChange(fromTime(e.target.value))} />
);

/** 음식 입력: 이름을 치면 가장 맞는 후보, 양은 ½·1·1.5·2인분(또는 공기·개) 버튼으로 */
function FoodRow({ food, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState(null);
  const [gramMode, setGramMode] = useState(food.grams != null && food.mult == null);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!food.query.trim()) return setCands(null);
    timer.current = setTimeout(() => searchFood(food.query).then(setCands).catch(() => setCands(null)), 300);
    return () => clearTimeout(timer.current);
  }, [food.query]);

  const items = cands?.items ?? [];
  const picked = cands?.mode === "combo" ? null : items[food.choice];
  const base = picked?.serving ?? null;           // 1인분 기준 (서버가 계산: 생활 단위표 → DB 1회량 → 100 g)
  const mult = food.mult ?? (food.grams == null ? 1 : null);   // 아무것도 안 골랐으면 1인분

  const unitLabel = (m) => `${m === 0.5 ? "½" : m}${base?.unit === "인분" ? "인분" : base?.unit}`;

  return (
    <div className="relative rounded-xl bg-white p-2 ring-1 ring-line">
      <div className="flex items-center gap-1.5">
        <input className={inputCls} value={food.query} placeholder="먹은 음식 (예: 마라탕)"
          onChange={(e) => { setOpen(false); onChange({ ...food, query: e.target.value, choice: 0 }); }} />
        <RemoveBtn onClick={onRemove} />
      </div>
      {picked && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 pl-1 text-xs text-mute">
          <span>→ {picked.name} · {picked.kcal_per_100}kcal/{picked.unit}</span>
          {picked.confidence === "낮음" && <span className="text-amber-600">(정확도 낮음)</span>}
          {cands?.mode === "choose" && items.length > 1 && (
            <button type="button" className="text-brand underline" onClick={() => setOpen(!open)}>
              {open ? "접기" : `이게 아니면 다른 후보 ${items.length - 1}개`}
            </button>
          )}
        </p>
      )}
      {base && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {!gramMode && PORTION_STEPS.map((m) => (
            <button key={m} type="button" onClick={() => onChange({ ...food, mult: m, grams: null })}
              className={`rounded-full px-2.5 py-1 text-xs transition ${mult === m ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-line"}`}>
              {unitLabel(m)}
            </button>
          ))}
          {gramMode && (
            <span className="flex items-center gap-1">
              <input type="number" className={`${inputCls} w-20`} value={food.grams ?? ""} min={1} aria-label="먹은 양 (g)"
                onChange={(e) => onChange({ ...food, mult: null, grams: e.target.value ? Number(e.target.value) : null })} />
              <span className="text-xs text-mute">g</span>
            </span>
          )}
          <span className="ml-1 text-[11px] text-mute">
            {!gramMode && mult ? `= ${base.approx ? "약 " : ""}${Math.round(base.g * mult)}g` : ""}{base.note && !gramMode ? ` (${base.note})` : ""}
          </span>
          <button type="button" className="ml-auto text-[11px] text-brand underline"
            onClick={() => {
              if (gramMode) onChange({ ...food, mult: 1, grams: null });
              else onChange({ ...food, mult: null, grams: Math.round(base.g * (mult ?? 1)) });
              setGramMode(!gramMode);
            }}>
            {gramMode ? "인분으로" : "g로 직접"}
          </button>
        </div>
      )}
      {cands?.mode === "combo" && <p className="mt-0.5 pl-1 text-xs text-mute">→ 조합: {items.map((i) => i.name).join(" + ")}</p>}
      {cands?.mode === "none" && <p className="mt-0.5 pl-1 text-xs text-amber-600">찾지 못했어요. 다른 이름으로 입력해 보세요.</p>}
      {open && cands?.mode === "choose" && items.length > 1 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-line">
          {items.map((it, i) => (
            <li key={i}>
              <button type="button" onClick={() => { onChange({ ...food, choice: i }); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper ${i === food.choice ? "font-semibold" : ""}`}>
                {it.name} <span className="text-xs text-mute">{it.kcal_per_100}kcal/{it.unit} · {it.examples?.[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MODES = [["usual", "평소대로"], ["custom", "직접 입력"], ["skip", "안 먹음"]];

/** 끼니 한 칸: 평소대로 / 직접 입력 / 안 먹음 */
function MealRow({ slot, meal, color, onChange, frequent = [] }) {
  const info = MEALS[slot];
  const foods = meal.foods ?? [];
  const setFoods = (f) => onChange({ ...meal, foods: f });
  return (
    <div className={`rounded-2xl p-2.5 ${meal.mode === "custom" ? "bg-paper" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-9 shrink-0 text-sm font-semibold">{info.label}</span>
        <TimeInput label={`${info.label} 시각`} value={meal.hour ?? info.hour} onChange={(h) => onChange({ ...meal, hour: h })} />
        <div className="ml-auto flex rounded-full bg-white p-0.5 text-xs ring-1 ring-line">
          {MODES.map(([m, t]) => (
            <button key={m} type="button"
              onClick={() => onChange({ ...meal, mode: m, foods: m === "custom" && !foods.length ? [{ query: "", grams: null, choice: 0 }] : foods })}
              className={`rounded-full px-2.5 py-1 transition ${meal.mode === m ? "text-white" : "text-mute"}`}
              style={meal.mode === m ? { background: color } : undefined}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {meal.mode === "usual" && <p className="mt-1 pl-11 text-xs text-mute">하루 필요량의 {Math.round(info.share * 100)}% 정도 먹은 걸로 계산</p>}
      {meal.mode === "custom" && (
        <div className="mt-2 flex flex-col gap-2">
          {foods.map((f, i) => (
            <FoodRow key={i} food={f} onChange={(v) => setFoods(foods.map((x, j) => (j === i ? v : x)))}
              onRemove={() => setFoods(foods.filter((_, j) => j !== i))} />
          ))}
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="mr-1 text-sm text-brand"
              onClick={() => setFoods([...foods, { query: "", grams: null, choice: 0 }])}>+ 음식 추가</button>
            {frequent.length > 0 && <span className="text-[11px] text-mute">자주 먹은:</span>}
            {frequent.map((q) => (
              <button key={q} type="button" onClick={() => setFoods([...foods.filter((f) => f.query.trim()), { query: q, grams: null, choice: 0 }])}
                className="rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-line hover:bg-brand hover:text-white hover:ring-brand">{q}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [["meal", "🍚 식사"], ["drink", "🍺 음주"], ["move", "🏃 운동"]];

export default function ScenarioCard({ index, color, scenario, catalog, onChange, onRemove, hideHeader = false, hideWeekly = false, frequent = [] }) {
  const [tab, setTab] = useState("meal");
  const set = (patch) => onChange({ ...scenario, ...patch });
  const updateAt = (key, i, v) => set({ [key]: scenario[key].map((x, j) => (j === i ? v : x)) });
  const removeAt = (key, i) => set({ [key]: scenario[key].filter((_, j) => j !== i) });
  const custom = Object.values(scenario.meals).filter((m) => m.mode !== "usual").length;
  const badge = { meal: custom, drink: scenario.drinks.length, move: scenario.exercises.length };

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-line">
      {!hideHeader && <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{index + 1}</span>
        <input className="font-display w-full bg-transparent text-xl focus:outline-none" value={scenario.name}
          onChange={(e) => set({ name: e.target.value })} maxLength={40} aria-label="선택지 이름" />
        {onRemove && <RemoveBtn onClick={onRemove} />}
      </div>}

      <div className="grid grid-cols-3 rounded-2xl bg-paper p-1 text-sm" role="tablist">
        {TABS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-xl py-1.5 transition ${tab === k ? "bg-white font-semibold shadow-sm" : "text-mute"}`}>
            {t}{badge[k] > 0 && <span className="ml-1 rounded-full px-1.5 text-[10px] text-white" style={{ background: color }}>{badge[k]}</span>}
          </button>
        ))}
      </div>

      {tab === "meal" && (
        <div className="flex flex-col gap-1">
          {Object.keys(MEALS).map((slot) => (
            <MealRow key={slot} slot={slot} meal={scenario.meals[slot]} color={color} frequent={frequent}
              onChange={(m) => set({ meals: { ...scenario.meals, [slot]: m } })} />
          ))}
        </div>
      )}

      {tab === "drink" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-mute">마시기 시작</span>
            <TimeInput label="음주 시작 시각" value={scenario.drink_start_hour ?? 19.5} onChange={(h) => set({ drink_start_hour: h })} />
          </label>
          {scenario.drinks.map((d, i) => {
            const unit = catalog?.drinks.find((x) => x.name === d.name)?.unit ?? "잔";
            return (
              <div key={i} className="flex items-center gap-1.5">
                <select className={inputCls} value={d.name} onChange={(e) => updateAt("drinks", i, { ...d, name: e.target.value })}>
                  {catalog?.drinks.map((x) => <option key={x.name}>{x.name}</option>)}
                </select>
                <input type="number" className={`${inputCls} w-16`} value={d.servings} min={0.5} step={0.5}
                  onChange={(e) => updateAt("drinks", i, { ...d, servings: Number(e.target.value) })} />
                <span className="shrink-0 text-xs text-mute">{unit}</span>
                <RemoveBtn onClick={() => removeAt("drinks", i)} />
              </div>
            );
          })}
          {!scenario.drinks.length && <p className="text-xs text-mute">술 안 마시는 날이에요.</p>}
          <button type="button" className="self-start text-sm text-brand"
            onClick={() => set({ drinks: [...scenario.drinks, { name: catalog?.drinks[0]?.name ?? "맥주(라거)", servings: 1 }] })}>+ 술 추가</button>
        </div>
      )}

      {tab === "move" && (
        <div className="flex flex-col gap-2">
          {scenario.exercises.map((x, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <TimeInput label="운동 시각" value={x.hour ?? 20} onChange={(h) => updateAt("exercises", i, { ...x, hour: h })} />
              <select className={inputCls} value={x.name} onChange={(e) => updateAt("exercises", i, { ...x, name: e.target.value })}>
                {catalog?.exercises.map((e) => <option key={e.name}>{e.name}</option>)}
              </select>
              <input type="number" className={`${inputCls} w-14`} value={x.minutes} min={5} step={5}
                onChange={(e) => updateAt("exercises", i, { ...x, minutes: Number(e.target.value) })} />
              <span className="shrink-0 text-xs text-mute">분</span>
              <RemoveBtn onClick={() => removeAt("exercises", i)} />
            </div>
          ))}
          {!scenario.exercises.length && <p className="text-xs text-mute">운동 없는 날이에요.</p>}
          <button type="button" className="self-start text-sm text-brand"
            onClick={() => set({ exercises: [...scenario.exercises, { name: catalog?.exercises[0]?.name ?? "걷기 보통 (4.8km/h)", minutes: 30, hour: 20 }] })}>+ 운동 추가</button>
        </div>
      )}

      {!hideWeekly && <label className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <span className="flex justify-between"><span className="text-mute">이런 날이 일주일에</span><b>{scenario.times_per_week}번</b></span>
        <input type="range" min={1} max={7} value={scenario.times_per_week} style={{ accentColor: color }}
          onChange={(e) => set({ times_per_week: Number(e.target.value) })} aria-label="일주일에 몇 번" />
      </label>}
    </section>
  );
}
