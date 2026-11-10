const Field = ({ label, children, hint }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-mute">{label}</span>
    {children}
    {hint && <span className="text-xs text-mute">{hint}</span>}
  </label>
);

const inputCls = "rounded-lg border border-line bg-white px-3 py-2 text-ink focus:border-brand focus:outline-none";

export default function PersonCard({ person, onChange }) {
  const set = (k) => (e) => onChange({ ...person, [k]: e.target.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value });
  const bmi = person.weight_kg && person.height_cm ? person.weight_kg / (person.height_cm / 100) ** 2 : null;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-line">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">내 몸 정보</h2>
        {bmi && <span className="text-sm text-mute">BMI {bmi.toFixed(1)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="성별">
          <div className="flex gap-1">
            {[[1, "남"], [2, "여"]].map(([v, t]) => (
              <button key={v} type="button" onClick={() => onChange({ ...person, sex: v })}
                className={`flex-1 rounded-lg py-2 ring-1 ${person.sex === v ? "bg-brand text-white ring-brand" : "bg-white ring-line"}`}>
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
        <Field label="수축기 혈압 (선택)" hint="검진 결과가 있으면 입력">
          <input type="number" className={inputCls} value={person.sbp} onChange={set("sbp")} placeholder="예: 125" />
        </Field>
      </div>
    </section>
  );
}
