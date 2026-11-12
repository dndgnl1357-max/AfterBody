import { motion } from "framer-motion";
import { useState } from "react";
import Avatar from "./Avatar";
import { EYE_COLORS, HAIR_COLORS, OPTIONS, SKIN_TONES } from "./spec";

const TABS = [
  ["face", "얼굴"], ["hair", "머리"], ["eyes", "눈·눈썹"], ["nose", "코·입"], ["extra", "꾸밈"],
];

function Chips({ label, value, options, onPick }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-mute">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, t]) => (
          <button key={v} type="button" onClick={() => onPick(v)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${value === v ? "bg-ink text-white" : "bg-white ring-1 ring-line hover:ring-ink"}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, value, colors, onPick }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-mute">{label}</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-label={`색 ${c}`}
            className={`size-8 rounded-full ring-2 transition ${value === c ? "ring-ink ring-offset-2" : "ring-white"}`} style={{ background: c }} />
        ))}
        {!colors.includes(value) && (
          <span className="size-8 rounded-full ring-2 ring-ink ring-offset-2" style={{ background: value }} title="사진에서 가져온 색" />
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, onPick, left, right }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-mute">{label}</span>
      <div className="flex items-center gap-2 text-[11px] text-mute">
        <span>{left}</span>
        <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onPick(Number(e.target.value))} className="flex-1 accent-[var(--color-brand)]" />
        <span>{right}</span>
      </div>
    </label>
  );
}

/** 미모티콘식 편집: 미리보기 + 부품 탭 */
export default function AvatarEditor({ spec, onChange, onClose }) {
  const [tab, setTab] = useState("face");
  const set = (k) => (v) => onChange({ ...spec, [k]: v });

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClose}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="아바타 꾸미기"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <p className="font-display text-xl">아바타 꾸미기</p>
          <button onClick={onClose} className="rounded-full bg-ink px-4 py-1.5 text-sm text-white">완료</button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="flex shrink-0 items-center justify-center bg-white py-3 sm:w-64">
            <Avatar spec={spec} size={150} mood="happy" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
              {TABS.map(([k, t]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${tab === k ? "bg-brand text-white" : "text-mute"}`}>{t}</button>
              ))}
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto p-4">
              {tab === "face" && <>
                <Swatches label="피부색" value={spec.skin} colors={SKIN_TONES} onPick={set("skin")} />
                <Chips label="얼굴형" value={spec.faceShape} options={OPTIONS.faceShape} onPick={set("faceShape")} />
              </>}
              {tab === "hair" && <>
                <Chips label="헤어스타일" value={spec.hairStyle} options={OPTIONS.hairStyle} onPick={set("hairStyle")} />
                <Chips label="앞머리" value={spec.bangs} options={OPTIONS.bangs} onPick={set("bangs")} />
                <Swatches label="머리색" value={spec.hairColor} colors={HAIR_COLORS} onPick={set("hairColor")} />
              </>}
              {tab === "eyes" && <>
                <Chips label="눈 모양" value={spec.eyeShape} options={OPTIONS.eyeShape} onPick={set("eyeShape")} />
                <Slider label="눈 크기" value={spec.eyeSize} min={0.85} max={1.15} onPick={set("eyeSize")} left="작게" right="크게" />
                <Slider label="눈 사이 간격" value={spec.eyeGap} min={0.88} max={1.12} onPick={set("eyeGap")} left="좁게" right="넓게" />
                <Swatches label="눈동자 색" value={spec.eyeColor} colors={EYE_COLORS} onPick={set("eyeColor")} />
                <Chips label="눈썹 모양" value={spec.browShape} options={OPTIONS.browShape} onPick={set("browShape")} />
                <Chips label="눈썹 굵기" value={spec.browWeight} options={OPTIONS.browWeight} onPick={set("browWeight")} />
              </>}
              {tab === "nose" && <>
                <Chips label="코" value={spec.nose} options={OPTIONS.nose} onPick={set("nose")} />
                <Chips label="입술" value={spec.lips} options={OPTIONS.lips} onPick={set("lips")} />
              </>}
              {tab === "extra" && <>
                <Chips label="안경" value={spec.glasses} options={OPTIONS.glasses} onPick={set("glasses")} />
                <Chips label="수염" value={spec.facialHair} options={OPTIONS.facialHair} onPick={set("facialHair")} />
              </>}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
