import CharacterPicker from "./CharacterPicker";

const Field = ({ label, children, hint }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-mute">{label}</span>
    {children}
    {hint && <span className="text-xs text-mute">{hint}</span>}
  </label>
);

const inputCls = "rounded-xl border border-line bg-white px-3 py-2 text-ink focus:border-brand focus:outline-none";

export default function PersonCard({ person, onChange, look, onLook }) {
  const set = (k) => (e) => onChange({ ...person, [k]: e.target.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value });
  const bmi = person.weight_kg && person.height_cm ? person.weight_kg / (person.height_cm / 100) ** 2 : null;

  return (
    <section className="flex flex-col gap-6 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-line md:flex-row md:items-center">
      <CharacterPicker look={look} onChange={onLook} bmi={bmi || 22} />
      <div className="flex-1">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-2xl">먼저, 나를 알려줘요</h2>
        {bmi && <span className="rounded-full bg-paper px-3 py-1 text-sm text-mute">BMI {bmi.toFixed(1)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="성별">
          <div className="flex gap-1">
            {[[1, "남"], [2, "여"]].map(([v, t]) => (
              <button key={v} type="button" onClick={() => onChange({ ...person, sex: v })}
                className={`flex-1 rounded-xl py-2 ring-1 ${person.sex === v ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="나이"><input type="number" className={inputCls} value={person.age} onChange={set("age")} min={19} max={90} /></Field>
        <Field label="키 (cm)"><input type="number" className={inputCls} value={person.height_cm} onChange={set("height_cm")} /></Field>
        <Field label="몸무게 (kg)"><input type="number" className={inputCls} value={person.weight_kg} onChange={set("weight_kg")} /></Field>
        <Field label="흡연">
          <select className={inputCls} value={person.smoking} onChange={set("smoking")}>
            <option value="never">비흡연</option><option value="former">과거 흡연</option><option value="current">현재 흡연</option>
          </select>
        </Field>
        <Field label="평소 활동량">
          <select className={inputCls} value={person.activity} onChange={set("activity")}>
            {["비활동적", "저활동적", "활동적", "매우활동적"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="혈압 (선택)" hint="검진표의 윗 숫자">
          <input type="number" className={inputCls} value={person.sbp} onChange={set("sbp")} placeholder="예: 125" />
        </Field>
      </div>
      <details className="mt-4 rounded-2xl bg-paper px-4 py-3" open={!!person.bmr_kcal}>
        <summary className="cursor-pointer text-sm font-semibold">📋 인바디 결과지 있어요 <span className="font-normal text-mute">(선택 · 넣으면 더 정확해져요)</span></summary>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Field label="기초대사량 (kcal)" hint="가장 중요해요">
            <input type="number" className={inputCls} value={person.bmr_kcal ?? ""} onChange={set("bmr_kcal")} placeholder="예: 1650" />
          </Field>
          <Field label="체지방률 (%)"><input type="number" className={inputCls} value={person.body_fat_pct ?? ""} onChange={set("body_fat_pct")} placeholder="예: 24.5" /></Field>
          <Field label="골격근량 (kg)"><input type="number" className={inputCls} value={person.skeletal_muscle_kg ?? ""} onChange={set("skeletal_muscle_kg")} placeholder="예: 32.1" /></Field>
        </div>
        <p className="mt-2 text-xs text-mute">기초대사량을 넣으면 공식 추정 대신 내 실측값으로 하루 필요 열량을 계산해요.</p>
      </details>
      </div>
    </section>
  );
}
