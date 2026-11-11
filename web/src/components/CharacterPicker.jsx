import { useRef, useState } from "react";
import { analyzeFace } from "../faceAnalyze";
import Character, { HAIRS } from "./Character";

/** look: { hair, photo, photoKind, usePhoto, note } — 사진은 이 브라우저에만 저장 */
export default function CharacterPicker({ look, onChange, bmi }) {
  const cameraRef = useRef();
  const galleryRef = useRef();
  const [busy, setBusy] = useState(false);

  async function onFile(file) {
    setBusy(true);
    try {
      const { photo, kind, message } = await analyzeFace(file);
      onChange({ ...look, photo, photoKind: kind, usePhoto: true, note: message });
    } catch {
      onChange({ ...look, note: "사진을 읽지 못했어요. 다른 사진으로 해 보세요." });
    } finally {
      setBusy(false);
    }
  }
  const pick = (e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; };
  const btn = "rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-brand hover:text-white hover:ring-brand disabled:opacity-50";

  return (
    <div className="flex w-full max-w-[230px] flex-col items-center gap-3">
      <div className="relative">
        <Character bmi={bmi} refBmi={bmi} color="#ffc9a9" hair={look.hair} photo={look.usePhoto ? look.photo : null}
          photoKind={look.photoKind} mood="happy" size={120} />
        {busy && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white/85 text-xs font-semibold">얼굴 오려 내는 중…</div>}
      </div>

      {look.photo && (
        <div className="flex rounded-full bg-paper p-0.5 text-xs ring-1 ring-line">
          {[[true, "내 얼굴"], [false, "그림 아바타"]].map(([v, t]) => (
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

      <div className="flex flex-wrap justify-center gap-1.5">
        <button type="button" disabled={busy} onClick={() => cameraRef.current.click()} className={btn}>📷 사진 찍기</button>
        <button type="button" disabled={busy} onClick={() => galleryRef.current.click()} className={btn}>🖼 갤러리·파일에서</button>
        {look.photo && (
          <button type="button" className="px-1 text-xs text-mute underline"
            onClick={() => onChange({ ...look, photo: null, photoKind: "circle", usePhoto: false, note: null })}>지우기</button>
        )}
      </div>
      {look.note && <p className="text-center text-[11px] text-ink">{look.note}</p>}
      <p className="text-center text-[11px] text-mute">얼굴이 잘 보이는 정면 사진이 가장 좋아요. 사진은 이 기기 안에서만 처리하고 어디에도 보내지 않아요.</p>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}
