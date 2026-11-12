import { AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import Avatar from "../avatar/Avatar";
import AvatarEditor from "../avatar/AvatarEditor";
import { defaultSpec } from "../avatar/spec";
import { analyzeFace } from "../faceAnalyze";

/** look: { spec, note } — 사진은 분석에만 쓰고 저장하지 않음 (부품 선택값만 저장) */
export default function CharacterPicker({ look, onChange, bmi, sex }) {
  const cameraRef = useRef();
  const galleryRef = useRef();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const spec = look.spec ?? defaultSpec(sex);

  async function onFile(file) {
    setBusy(true);
    try {
      const r = await analyzeFace(file, sex);
      onChange({ spec: r.spec ?? spec, note: r.message });
    } catch {
      onChange({ ...look, note: "사진을 읽지 못했어요. 다른 사진으로 해 보세요." });
    } finally {
      setBusy(false);
    }
  }
  const pick = (e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; };
  const btn = "rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-line hover:bg-brand hover:text-white hover:ring-brand disabled:opacity-50";

  return (
    <div className="flex w-full max-w-[240px] flex-col items-center gap-2.5">
      <button type="button" onClick={() => setEditing(true)} className="relative rounded-3xl" aria-label="아바타 꾸미기 열기">
        <Avatar spec={spec} bmi={bmi} refBmi={bmi} color="#ffb98a" size={130} />
        {busy && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white/85 text-xs font-semibold">사진 보고 그리는 중…</div>}
      </button>
      <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">✏️ 꾸미기</button>
      <div className="flex flex-wrap justify-center gap-1.5">
        <button type="button" disabled={busy} onClick={() => cameraRef.current.click()} className={btn}>📷 사진 찍어 만들기</button>
        <button type="button" disabled={busy} onClick={() => galleryRef.current.click()} className={btn}>🖼 갤러리에서</button>
      </div>
      {look.note && <p className="text-center text-[11px] text-ink">{look.note}</p>}
      <p className="text-center text-[11px] text-mute">사진은 이 기기 안에서 분석만 하고 저장·전송하지 않아요.</p>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={pick} />
      <AnimatePresence>
        {editing && <AvatarEditor spec={spec} onChange={(s) => onChange({ ...look, spec: s })} onClose={() => setEditing(false)} />}
      </AnimatePresence>
    </div>
  );
}
