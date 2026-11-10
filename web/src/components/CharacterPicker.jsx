import { useRef } from "react";
import Character, { SKINS } from "./Character";

/** 사진을 256px로 줄여 dataURL로 (서버로 보내지 않고 브라우저에만 저장) */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = 256, c = document.createElement("canvas");
      c.width = c.height = s;
      const k = Math.max(s / img.width, s / img.height);
      c.getContext("2d").drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      resolve(c.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function CharacterPicker({ look, onChange, bmi }) {
  const fileRef = useRef();
  return (
    <div className="flex flex-col items-center gap-3">
      <Character bmi={bmi} refBmi={bmi} color="#ffc9a9" skin={look.skin} photo={look.photo} mood="happy" size={130} />
      <div className="flex gap-1.5">
        {SKINS.map((s) => (
          <button key={s.id} type="button" onClick={() => onChange({ ...look, skin: s.id })}
            className={`rounded-full px-3 py-1 text-sm transition ${look.skin === s.id ? "bg-ink text-white" : "bg-white ring-1 ring-line"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => fileRef.current.click()} className="font-semibold text-brand">
          {look.photo ? "사진 바꾸기" : "📷 내 얼굴 씌우기"}
        </button>
        {look.photo && <button type="button" className="text-mute" onClick={() => onChange({ ...look, photo: null })}>빼기</button>}
      </div>
      <p className="text-center text-[11px] text-mute">사진은 이 기기 브라우저에만 저장되고<br />어디에도 전송되지 않아요</p>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange({ ...look, photo: await shrink(f) });
          e.target.value = "";
        }} />
    </div>
  );
}
