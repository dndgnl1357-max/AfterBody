import { useRef, useState } from "react";
import { analyzeFace } from "../faceAnalyze";
import Character, { HAIRS } from "./Character";

/** look: { hair, photo, features, usePhoto, note } — 사진·특징은 이 브라우저에만 저장 */
export default function CharacterPicker({ look, onChange, bmi }) {
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);

  async function onFile(file) {
    setBusy(true);
    try {
      const { photo, features, message } = await analyzeFace(file);
      onChange({ ...look, photo, features, usePhoto: !features, note: message });
    } catch {
      onChange({ ...look, note: "사진을 읽지 못했어요. 다른 사진으로 해 보세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-[220px] flex-col items-center gap-3">
      <div className="relative">
        <Character bmi={bmi} refBmi={bmi} color="#ffc9a9" hair={look.hair} photo={look.usePhoto ? look.photo : null}
          features={look.features} mood="happy" size={120} />
        {busy && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white/80 text-xs font-semibold">얼굴 분석 중…</div>}
      </div>

      {look.photo && look.features && (
        <div className="flex rounded-full bg-paper p-0.5 text-xs ring-1 ring-line">
          {[[false, "닮은 그림"], [true, "내 사진 얼굴"]].map(([v, t]) => (
            <button key={t} type="button" onClick={() => onChange({ ...look, usePhoto: v })}
              className={`rounded-full px-2.5 py-1 ${look.usePhoto === v ? "bg-ink text-white" : "text-mute"}`}>{t}</button>
          ))}
        </div>
      )}

      {!look.usePhoto && (
        <div className="flex flex-wrap justify-center gap-1">
          {HAIRS.map((h) => (
            <button key={h.id} type="button" onClick={() => onChange({ ...look, hair: h.id })}
              className={`rounded-full px-2.5 py-1 text-xs transition ${look.hair === h.id ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>
              {h.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <button type="button" disabled={busy} onClick={() => fileRef.current.click()} className="font-semibold text-brand disabled:opacity-50">
          {look.photo ? "📷 사진 바꾸기" : "📷 내 사진으로 아바타 만들기"}
        </button>
        {look.photo && (
          <button type="button" className="text-mute"
            onClick={() => onChange({ ...look, photo: null, features: null, usePhoto: false, note: null })}>지우기</button>
        )}
      </div>
      {look.note && <p className="text-center text-[11px] text-ink">{look.note}</p>}
      <p className="text-center text-[11px] text-mute">정면 얼굴 사진이 가장 잘 돼요. 사진은 이 기기 안에서만 분석하고 어디에도 보내지 않아요.</p>
      <input ref={fileRef} type="file" accept="image/*" capture="user" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}
