import { useEffect, useRef, useState } from "react";
import { searchFood } from "../api";
import { QUICK_FOODS } from "../presets";

const inputCls = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
const RemoveBtn = ({ onClick }) => (
  <button type="button" onClick={onClick} className="shrink-0 px-1 text-mute hover:text-ink" aria-label="삭제">✕</button>
);

/** 음식 입력: 타이핑하면 후보를 보여주고, 고른 후보 번호(choice)를 엔진에 전달 */
function FoodRow({ food, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState(null);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!food.query.trim()) return setCands(null);
    timer.current = setTimeout(() => searchFood(food.query).then(setCands).catch(() => setCands(null)), 300);
    return () => clearTimeout(timer.current);
  }, [food.query]);

  const items = cands?.items ?? [];
  const picked = cands?.mode === "combo" ? null : items[food.choice];

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <input className={inputCls} value={food.query} placeholder="아무 음식이나 입력 (예: 마라탕)"
          onChange={(e) => onChange({ ...food, query: e.target.value, choice: 0 })}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        <input type="number" className={`${inputCls} w-20`} value={food.grams ?? ""} min={1}
          placeholder={picked?.portion_g ? String(Math.round(picked.portion_g)) : "g"}
          onChange={(e) => onChange({ ...food, grams: e.target.value ? Number(e.target.value) : null })} />
        <span className="text-xs text-mute">g</span>
        <RemoveBtn onClick={onRemove} />
      </div>
      {picked && (
        <p className="mt-0.5 pl-1 text-xs text-mute">
          → {picked.name} · {picked.kcal_per_100}kcal/{picked.unit}
          {picked.confidence === "낮음" && <span className="ml-1 text-amber-600">(정확도 낮음)</span>}
        </p>
      )}
      {cands?.mode === "combo" && (
        <p className="mt-0.5 pl-1 text-xs text-mute">→ 조합: {items.map((i) => i.name).join(" + ")}</p>
      )}
      {cands?.mode === "none" && <p className="mt-0.5 pl-1 text-xs text-amber-600">찾지 못했어요. 다른 이름으로 입력해 보세요.</p>}
      {open && cands?.mode === "choose" && items.length > 1 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-line">
          {items.map((it, i) => (
            <li key={i}>
              <button type="button" onMouseDown={() => onChange({ ...food, choice: i })}
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

export default function ScenarioCard({ index, color, scenario, catalog, onChange, onRemove }) {
  const set = (patch) => onChange({ ...scenario, ...patch });
  const updateAt = (key, i, v) => set({ [key]: scenario[key].map((x, j) => (j === i ? v : x)) });
  const removeAt = (key, i) => set({ [key]: scenario[key].filter((_, j) => j !== i) });

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{index + 1}</span>
        <input className="font-display w-full bg-transparent text-xl focus:outline-none" value={scenario.name}
          onChange={(e) => set({ name: e.target.value })} maxLength={40} />
        {onRemove && <RemoveBtn onClick={onRemove} />}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-mute">뭐 먹을 거예요?</h3>
        {scenario.foods.map((f, i) => (
          <FoodRow key={i} food={f} onChange={(v) => updateAt("foods", i, v)} onRemove={() => removeAt("foods", i)} />
        ))}
        <button type="button" className="self-start text-sm text-brand"
          onClick={() => set({ foods: [...scenario.foods, { query: "", grams: null, choice: 0 }] })}>+ 음식 추가</button>
        <div className="flex flex-wrap gap-1">
          {QUICK_FOODS.map((q) => (
            <button key={q} type="button"
              onClick={() => {
                const foods = scenario.foods.filter((f) => f.query.trim());
                set({ foods: [...foods, { query: q, grams: null, choice: 0 }] });
              }}
              className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-mute hover:bg-brand hover:text-white">
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-mute">한잔할 거예요?</h3>
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
        <button type="button" className="self-start text-sm text-brand"
          onClick={() => set({ drinks: [...scenario.drinks, { name: catalog?.drinks[0]?.name ?? "맥주(라거)", servings: 1 }] })}>+ 술 추가</button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-mute">좀 움직일 거예요?</h3>
        {scenario.exercises.map((x, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select className={inputCls} value={x.name} onChange={(e) => updateAt("exercises", i, { ...x, name: e.target.value })}>
              {catalog?.exercises.map((e) => <option key={e.name}>{e.name}</option>)}
            </select>
            <input type="number" className={`${inputCls} w-16`} value={x.minutes} min={5} step={5}
              onChange={(e) => updateAt("exercises", i, { ...x, minutes: Number(e.target.value) })} />
            <span className="shrink-0 text-xs text-mute">분</span>
            <RemoveBtn onClick={() => removeAt("exercises", i)} />
          </div>
        ))}
        <button type="button" className="self-start text-sm text-brand"
          onClick={() => set({ exercises: [...scenario.exercises, { name: catalog?.exercises[0]?.name ?? "걷기 보통 (4.8km/h)", minutes: 30 }] })}>+ 운동 추가</button>
      </div>

      <label className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <span className="flex justify-between"><span className="text-mute">이런 날이 일주일에</span><b>{scenario.times_per_week}번</b></span>
        <input type="range" min={1} max={7} value={scenario.times_per_week} style={{ accentColor: color }}
          onChange={(e) => set({ times_per_week: Number(e.target.value) })} />
      </label>
    </section>
  );
}
