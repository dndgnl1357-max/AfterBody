import { motion } from "framer-motion";
import { useId } from "react";
import { darken, defaultSpec, lighten, luminance } from "./spec";

/**
 * 미모티콘식 아바타 (머리 큰 2등신, 그라데이션으로 입체감).
 * spec: 부품 선택 (avatar/spec.js),  bmi·refBmi: 체형 변화,  color: 상의 색
 * mood: "happy" | "meh" | "tired",  props: { beer, sweat, headband }
 */
const spring = { type: "spring", stiffness: 70, damping: 14 };
const CX = 100, CY = 88, HH = 60;   // 머리 중심, 머리 반높이

// 얼굴 윤곽: 위쪽은 둥글게, 아래쪽(턱)은 얼굴형마다 다르게. 모든 얼굴형이 같은 명령 구조라 부드럽게 변형됨
function facePath(shape, w) {
  const h = HH, t = CY - h;
  const jaw = { round: [0.98, 0.62, 0.62, 0.98], oval: [0.92, 0.55, 0.42, 1.0], square: [0.96, 0.78, 0.5, 0.96], heart: [0.9, 0.42, 0.28, 1.02] }[shape];
  const [sideK, jawY, chinW, chinY] = jaw;
  return [
    `M ${CX - w} ${CY}`,
    `C ${CX - w} ${t + h * 0.12} ${CX - w * 0.55} ${t} ${CX} ${t}`,
    `C ${CX + w * 0.55} ${t} ${CX + w} ${t + h * 0.12} ${CX + w} ${CY}`,
    `C ${CX + w * sideK} ${CY + h * jawY} ${CX + w * chinW} ${CY + h * chinY} ${CX} ${CY + h * chinY}`,
    `C ${CX - w * chinW} ${CY + h * chinY} ${CX - w * sideK} ${CY + h * jawY} ${CX - w} ${CY}`,
    "Z",
  ].join(" ");
}

// 머리카락: 뒤쪽(머리 뒤에 그림) / 앞쪽(얼굴 위에 그림)
function hairBack(style, w) {
  const t = CY - HH;
  switch (style) {
    case "bob": return `M ${CX - w * 1.14} ${CY - 6} C ${CX - w * 1.2} ${t - 4} ${CX + w * 1.2} ${t - 4} ${CX + w * 1.14} ${CY - 6} L ${CX + w * 1.12} ${CY + HH * 0.62} Q ${CX} ${CY + HH * 0.78} ${CX - w * 1.12} ${CY + HH * 0.62} Z`;
    case "long": return `M ${CX - w * 1.16} ${CY - 6} C ${CX - w * 1.22} ${t - 4} ${CX + w * 1.22} ${t - 4} ${CX + w * 1.16} ${CY - 6} L ${CX + w * 1.22} ${CY + HH * 1.75} Q ${CX} ${CY + HH * 1.95} ${CX - w * 1.22} ${CY + HH * 1.75} Z`;
    case "ponytail": return `M ${CX + w * 0.7} ${t + 20} C ${CX + w * 1.55} ${t + 10} ${CX + w * 1.45} ${CY + HH * 0.9} ${CX + w * 1.05} ${CY + HH * 1.2} C ${CX + w * 1.2} ${CY + HH * 0.5} ${CX + w * 1.0} ${t + 40} ${CX + w * 0.7} ${t + 20} Z`;
    default: return null;
  }
}

function hairFront(style, bangs, w) {
  const t = CY - HH;
  const cap = (top, side, fringeY) =>
    `M ${CX - w * side} ${CY - 2} C ${CX - w * 1.12} ${top + 6} ${CX - w * 0.6} ${top} ${CX} ${top} C ${CX + w * 0.6} ${top} ${CX + w * 1.12} ${top + 6} ${CX + w * side} ${CY - 2} ` +
    `C ${CX + w * 0.96} ${fringeY + 6} ${CX + w * 0.6} ${fringeY - 10} ${CX} ${fringeY - 6} C ${CX - w * 0.6} ${fringeY - 10} ${CX - w * 0.96} ${fringeY + 6} ${CX - w * side} ${CY - 2} Z`;
  if (style === "bald") return null;
  if (style === "buzz") return cap(t - 3, 1.0, t + 22);
  if (style === "curly") return null;   // 원 여러 개로 따로 그림
  let d = ["long", "bob", "ponytail", "bun"].includes(style) ? cap(t - 9, 1.08, t + 26) : cap(t - 17, 1.05, t + 26);
  if (style === "sidepart" || bangs === "side")       // 한쪽으로 쓸어 넘긴 앞머리 (왼쪽 높고 오른쪽 낮게)
    d += ` M ${CX - w * 0.55} ${t + 4} C ${CX - w * 0.1} ${t - 2} ${CX + w * 0.75} ${t + 6} ${CX + w * 1.0} ${t + 46}` +
      ` C ${CX + w * 0.7} ${t + 34} ${CX + w * 0.2} ${t + 30} ${CX - w * 0.35} ${t + 34} C ${CX - w * 0.55} ${t + 26} ${CX - w * 0.6} ${t + 14} ${CX - w * 0.55} ${t + 4} Z`;
  if (bangs === "straight")
    d += ` M ${CX - w * 0.92} ${t + 18} C ${CX - w * 0.7} ${t} ${CX + w * 0.7} ${t} ${CX + w * 0.92} ${t + 18} L ${CX + w * 0.9} ${t + 40}` +
      ` Q ${CX + w * 0.72} ${t + 50} ${CX + w * 0.55} ${t + 42} Q ${CX + w * 0.37} ${t + 51} ${CX + w * 0.18} ${t + 43} Q ${CX} ${t + 52} ${CX - w * 0.18} ${t + 43}` +
      ` Q ${CX - w * 0.37} ${t + 51} ${CX - w * 0.55} ${t + 42} Q ${CX - w * 0.72} ${t + 50} ${CX - w * 0.9} ${t + 40} Z`;
  return d;
}

function Eye({ x, y, spec, mood, blink, uid }) {
  const s = spec.eyeSize;
  const open = { round: 1.0, almond: 0.78, narrow: 0.55 }[spec.eyeShape];
  const rx = 12 * s, ry = 13 * s * open;
  const id = `${uid}-${Math.round(x)}`;
  const sad = mood === "tired";
  return (
    <g>
      <defs><clipPath id={`eye-${id}`}><ellipse cx={x} cy={y} rx={rx} ry={ry} /></clipPath></defs>
      <motion.g animate={{ scaleY: [1, 1, 0.08, 1] }} transition={{ duration: 4.2, times: [0, 0.93, 0.96, 1], repeat: Infinity, delay: blink }}
        style={{ transformOrigin: `${x}px ${y}px` }}>
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" />
        <g clipPath={`url(#eye-${id})`}>
          <circle cx={x} cy={y + 1.5} r={9 * s} fill={`url(#iris-${uid})`} />
          <circle cx={x} cy={y + 1.5} r={4.4 * s} fill="#120c0a" />
          <circle cx={x - 3 * s} cy={y - 2.6 * s} r={2.8 * s} fill="#fff" />
          <circle cx={x + 3 * s} cy={y + 3.6 * s} r={1.2 * s} fill="#fff" opacity="0.85" />
          <rect x={x - rx} y={y - ry} width={rx * 2} height={ry * 0.35} fill="#000" opacity="0.07" />
          {sad && <rect x={x - rx} y={y - ry} width={rx * 2} height={ry * 0.55} fill={darken(spec.skin, 0.05)} />}
        </g>
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke="#5a3e34" strokeOpacity="0.35" strokeWidth="1" />
        <path d={`M ${x - rx - 1.5} ${y - ry * 0.15} Q ${x} ${y - ry - 3} ${x + rx + 1.5} ${y - ry * 0.15}`} fill="none" stroke="#2a1d18" strokeWidth="2.4" strokeLinecap="round" />
      </motion.g>
    </g>
  );
}

export default function Avatar({ spec: raw, bmi = 22, refBmi = 22, color = "#ffc9a9", mood = "happy", props = {}, delay = 0, size = 170 }) {
  const uid = useId().replace(/:/g, "");
  const spec = { ...defaultSpec(1), ...raw };
  // 체형: 기준 BMI 대비 변화를 2.5배 과장 (화면에 '과장 표현' 안내)
  const base = Math.min(Math.max((refBmi / 22) ** 1.2, 0.85), 1.5);
  const f = Math.min(Math.max(base * (1 + 2.5 * (bmi - refBmi) / refBmi), 0.75), 1.9);
  const faceK = Math.min(Math.max(1 + 0.38 * (f / base - 1), 0.86), 1.32);
  const w = 54 * faceK;                         // 얼굴 반폭
  const bw = 34 * f;                            // 몸통 반폭
  const skin = spec.skin, hair = spec.hairColor;
  const skinShade = darken(skin, 0.14), hairHi = lighten(hair, luminance(hair) < 60 ? 0.28 : 0.18);
  const browColor = luminance(hair) > 170 ? darken(hair, 0.35) : darken(hair, 0.12);
  const eyeGap = 21 * spec.eyeGap * (0.6 + 0.4 * faceK);
  const browW = { thin: 2.4, normal: 3.6, thick: 5.2 }[spec.browWeight];
  const browD = (dir) => {
    const x0 = CX + dir * (eyeGap - 10), x1 = CX + dir * (eyeGap + 12), y = CY - 21;
    const peak = { straight: 0, soft: 3, arched: 6 }[spec.browShape];
    // 안쪽 끝을 바깥보다 살짝 낮게 두면 순한 인상, 피곤할 땐 안쪽을 올려 걱정스러운 표정
    const inner = mood === "tired" ? y - 3 : y + 1.5, outer = y + 1;
    return `M ${x0} ${inner} Q ${(x0 + x1) / 2} ${y - peak - 2} ${x1} ${outer}`;
  };
  const lipK = { thin: 0.7, normal: 1, full: 1.35 }[spec.lips];
  const mouthY = CY + HH * 0.5;
  const front = hairFront(spec.hairStyle, spec.bangs, w);
  const back = hairBack(spec.hairStyle, w);

  return (
    <motion.svg viewBox="0 0 200 270" width={size} height={size * 1.35} className="overflow-visible"
      animate={{ y: [0, -3, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay }}
      role="img" aria-label="내 아바타">
      <defs>
        <radialGradient id={`skin-${uid}`} cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor={lighten(skin, 0.18)} /><stop offset="60%" stopColor={skin} /><stop offset="100%" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`hair-${uid}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={hairHi} /><stop offset="55%" stopColor={hair} /><stop offset="100%" stopColor={darken(hair, 0.25)} />
        </linearGradient>
        <linearGradient id={`shirt-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lighten(color, 0.15)} /><stop offset="100%" stopColor={darken(color, 0.12)} />
        </linearGradient>
        <radialGradient id={`iris-${uid}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={lighten(spec.eyeColor, 0.35)} /><stop offset="100%" stopColor={spec.eyeColor} />
        </radialGradient>
      </defs>

      <motion.ellipse cx={CX} cy={262} ry={5} fill="#000" opacity="0.1" animate={{ rx: bw * 1.4 }} transition={spring} />

      {/* 뒷머리 */}
      {back && <motion.path fill={`url(#hair-${uid})`} animate={{ d: back }} transition={spring} />}
      {spec.hairStyle === "bun" && <circle cx={CX} cy={CY - HH - 8} r={17} fill={`url(#hair-${uid})`} />}

      {/* 다리 */}
      <motion.rect y={222} width={22} height={36} rx={10} fill="#4c5a73" animate={{ x: CX - bw * 0.42 - 11 }} transition={spring} />
      <motion.rect y={222} width={22} height={36} rx={10} fill="#4c5a73" animate={{ x: CX + bw * 0.42 - 11 }} transition={spring} />
      <motion.ellipse cy={258} rx={13} ry={6} fill="#2f3542" animate={{ cx: CX - bw * 0.42 }} transition={spring} />
      <motion.ellipse cy={258} rx={13} ry={6} fill="#2f3542" animate={{ cx: CX + bw * 0.42 }} transition={spring} />

      {/* 팔 */}
      <motion.rect y={160} width={16} height={50} rx={8} fill={`url(#shirt-${uid})`} animate={{ x: CX - bw - 12 }} transition={spring} style={{ rotate: 8 }} />
      <motion.rect y={160} width={16} height={50} rx={8} fill={`url(#shirt-${uid})`} animate={{ x: CX + bw - 4 }} transition={spring} style={{ rotate: -8 }} />
      <motion.circle cy={212} r={8} fill={skin} animate={{ cx: CX - bw - 6 }} transition={spring} />
      <motion.circle cy={212} r={8} fill={skin} animate={{ cx: CX + bw + 6 }} transition={spring} />

      {/* 몸통 */}
      <motion.path fill={`url(#shirt-${uid})`} transition={spring}
        animate={{ d: `M ${CX - bw * 0.8} 152 Q ${CX} 146 ${CX + bw * 0.8} 152 Q ${CX + bw * 1.05} 160 ${CX + bw} 190 Q ${CX + bw * 1.08} 222 ${CX + bw * 0.85} 228 L ${CX - bw * 0.85} 228 Q ${CX - bw * 1.08} 222 ${CX - bw} 190 Q ${CX - bw * 1.05} 160 ${CX - bw * 0.8} 152 Z` }} />
      <path d={`M ${CX - 12} 150 Q ${CX} 164 ${CX + 12} 150`} fill={skinShade} />

      {/* 목·귀 */}
      <rect x={CX - 11} y={CY + HH - 14} width={22} height={22} rx={8} fill={skinShade} />
      <motion.ellipse cy={CY + 6} rx={10} ry={14} fill={skin} animate={{ cx: CX - w + 1 }} transition={spring} />
      <motion.ellipse cy={CY + 6} rx={10} ry={14} fill={skin} animate={{ cx: CX + w - 1 }} transition={spring} />
      <motion.ellipse cy={CY + 7} rx={4.5} ry={7} fill={skinShade} animate={{ cx: CX - w + 1 }} transition={spring} />
      <motion.ellipse cy={CY + 7} rx={4.5} ry={7} fill={skinShade} animate={{ cx: CX + w - 1 }} transition={spring} />

      {/* 얼굴 */}
      <motion.path fill={`url(#skin-${uid})`} animate={{ d: facePath(spec.faceShape, w) }} transition={spring} />
      <motion.ellipse cy={CY + 22} rx={11} ry={7} fill="#ff8a8a" opacity={props.beer ? 0.55 : 0.22} animate={{ cx: CX - w * 0.56 }} transition={spring} />
      <motion.ellipse cy={CY + 22} rx={11} ry={7} fill="#ff8a8a" opacity={props.beer ? 0.55 : 0.22} animate={{ cx: CX + w * 0.56 }} transition={spring} />

      {/* 수염 */}
      {spec.facialHair === "stubble" && (
        <motion.path fill={hair} opacity="0.16" animate={{ d: `M ${CX - w * 0.85} ${CY + 18} Q ${CX} ${CY + 30} ${CX + w * 0.85} ${CY + 18} C ${CX + w * 0.7} ${CY + HH * 0.85} ${CX + w * 0.4} ${CY + HH} ${CX} ${CY + HH} C ${CX - w * 0.4} ${CY + HH} ${CX - w * 0.7} ${CY + HH * 0.85} ${CX - w * 0.85} ${CY + 18} Z` }} transition={spring} />
      )}
      {spec.facialHair === "beard" && (
        <motion.path fill={`url(#hair-${uid})`} animate={{ d: `M ${CX - w * 0.92} ${CY + 8} Q ${CX - w * 0.8} ${CY + 30} ${CX - 16} ${mouthY - 6} Q ${CX} ${mouthY - 9} ${CX + 16} ${mouthY - 6} Q ${CX + w * 0.8} ${CY + 30} ${CX + w * 0.92} ${CY + 8} C ${CX + w * 0.86} ${CY + HH * 0.95} ${CX + w * 0.45} ${CY + HH * 1.12} ${CX} ${CY + HH * 1.12} C ${CX - w * 0.45} ${CY + HH * 1.12} ${CX - w * 0.86} ${CY + HH * 0.95} ${CX - w * 0.92} ${CY + 8} Z` }} transition={spring} />
      )}

      {/* 눈·눈썹 */}
      <Eye x={CX - eyeGap} y={CY + 2} spec={spec} mood={mood} blink={delay} uid={uid} />
      <Eye x={CX + eyeGap} y={CY + 2} spec={spec} mood={mood} blink={delay} uid={uid} />
      <path d={browD(-1)} stroke={browColor} strokeWidth={browW} fill="none" strokeLinecap="round" />
      <path d={browD(1)} stroke={browColor} strokeWidth={browW} fill="none" strokeLinecap="round" />

      {/* 코 */}
      <ellipse cx={CX} cy={CY + 31} rx={7} ry={2.2} fill={skinShade} opacity="0.35" />
      {spec.nose === "small" && <path d={`M ${CX - 4} ${CY + 24} Q ${CX} ${CY + 28} ${CX + 4} ${CY + 24}`} stroke={skinShade} strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      {spec.nose === "button" && <g><ellipse cx={CX} cy={CY + 22} rx={6.5} ry={5.5} fill={lighten(skin, 0.1)} /><path d={`M ${CX - 6} ${CY + 25} Q ${CX} ${CY + 30} ${CX + 6} ${CY + 25}`} stroke={skinShade} strokeWidth="2" fill="none" strokeLinecap="round" /></g>}
      {spec.nose === "wide" && <g><ellipse cx={CX} cy={CY + 22} rx={9} ry={6} fill={lighten(skin, 0.08)} /><path d={`M ${CX - 10} ${CY + 24} Q ${CX - 7} ${CY + 30} ${CX - 2} ${CY + 27} M ${CX + 10} ${CY + 24} Q ${CX + 7} ${CY + 30} ${CX + 2} ${CY + 27}`} stroke={skinShade} strokeWidth="2.2" fill="none" strokeLinecap="round" /></g>}

      {/* 콧수염 */}
      {(spec.facialHair === "mustache" || spec.facialHair === "beard") && (
        <path d={`M ${CX - 16} ${mouthY - 5} Q ${CX - 8} ${mouthY - 13} ${CX} ${mouthY - 9} Q ${CX + 8} ${mouthY - 13} ${CX + 16} ${mouthY - 5} Q ${CX} ${mouthY - 6} ${CX - 16} ${mouthY - 5} Z`} fill={darken(hair, 0.1)} />
      )}

      {/* 입 */}
      {mood === "happy" ? (
        <g>
          <path d={`M ${CX - 14} ${mouthY - 2} Q ${CX} ${mouthY + 2} ${CX + 14} ${mouthY - 2} Q ${CX + 11} ${mouthY + 13 * lipK} ${CX} ${mouthY + 14 * lipK} Q ${CX - 11} ${mouthY + 13 * lipK} ${CX - 14} ${mouthY - 2} Z`} fill="#6b2a2a" />
          <path d={`M ${CX - 11} ${mouthY} Q ${CX} ${mouthY + 3} ${CX + 11} ${mouthY} L ${CX + 10} ${mouthY + 3.5} Q ${CX} ${mouthY + 6} ${CX - 10} ${mouthY + 3.5} Z`} fill="#fff" />
          <ellipse cx={CX} cy={mouthY + 10 * lipK} rx={6} ry={3} fill="#e8747a" />
        </g>
      ) : mood === "tired" ? (
        <path d={`M ${CX - 11} ${mouthY + 4} Q ${CX - 5} ${mouthY} ${CX} ${mouthY + 4} Q ${CX + 5} ${mouthY + 8} ${CX + 11} ${mouthY + 4}`} stroke="#7a3b3b" strokeWidth={2.4 * lipK} fill="none" strokeLinecap="round" />
      ) : (
        <path d={`M ${CX - 11} ${mouthY + 2} Q ${CX} ${mouthY + 7} ${CX + 11} ${mouthY + 2}`} stroke="#9b4a4a" strokeWidth={2.6 * lipK} fill="none" strokeLinecap="round" />
      )}

      {/* 앞머리 */}
      {spec.hairStyle === "curly" &&
        Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI * (1.02 + i * 0.096);
          return <motion.circle key={i} r={15} fill={`url(#hair-${uid})`} animate={{ cx: CX + Math.cos(a) * w * 0.98, cy: CY - 8 + Math.sin(a) * HH * 0.95 }} transition={spring} />;
        })}
      {front && <motion.path fill={`url(#hair-${uid})`} animate={{ d: front }} transition={spring} />}
      {front && !["buzz"].includes(spec.hairStyle) && (
        <g stroke={darken(hair, 0.3)} strokeOpacity="0.45" strokeWidth="1.6" fill="none" strokeLinecap="round">
          <path d={`M ${CX - w * 0.15} ${CY - HH - 6} Q ${CX - w * 0.45} ${CY - HH + 6} ${CX - w * 0.62} ${CY - HH + 22}`} />
          <path d={`M ${CX + w * 0.1} ${CY - HH - 6} Q ${CX + w * 0.35} ${CY - HH + 6} ${CX + w * 0.55} ${CY - HH + 20}`} />
          <path d={`M ${CX - w * 0.02} ${CY - HH - 7} Q ${CX - w * 0.08} ${CY - HH + 8} ${CX - w * 0.2} ${CY - HH + 18}`} />
        </g>
      )}
      {(spec.hairStyle === "sidepart" || spec.bangs === "side") && front && (
        <path d={`M ${CX - w * 0.42} ${CY - HH - 4} Q ${CX - w * 0.5} ${CY - HH + 14} ${CX - w * 0.4} ${CY - HH + 30}`} stroke={darken(hair, 0.4)} strokeOpacity="0.6" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
      {front && <path d={`M ${CX - w * 0.55} ${CY - HH + 4} Q ${CX - w * 0.15} ${CY - HH - 6} ${CX + w * 0.2} ${CY - HH - 1}`} stroke={lighten(hair, 0.45)} strokeOpacity="0.4" strokeWidth="4" fill="none" strokeLinecap="round" />}
      {spec.hairStyle === "bald" && <ellipse cx={CX - w * 0.3} cy={CY - HH + 14} rx={12} ry={6} fill="#fff" opacity="0.25" />}

      {/* 안경 */}
      {spec.glasses !== "none" && (
        <g stroke="#2b2b2b" strokeWidth="2.6" fill="#bfe3ff" fillOpacity="0.12">
          {spec.glasses === "round"
            ? <><circle cx={CX - eyeGap} cy={CY + 3} r={15} /><circle cx={CX + eyeGap} cy={CY + 3} r={15} /></>
            : <><rect x={CX - eyeGap - 16} y={CY - 9} width={32} height={23} rx={6} /><rect x={CX + eyeGap - 16} y={CY - 9} width={32} height={23} rx={6} /></>}
          <path d={`M ${CX - eyeGap + 15} ${CY} Q ${CX} ${CY - 4} ${CX + eyeGap - 15} ${CY}`} fill="none" />
        </g>
      )}

      {/* 소품 */}
      {props.headband && <motion.rect y={CY - HH + 14} height={8} rx={4} fill="#fa5252" animate={{ x: CX - w * 0.95, width: w * 1.9 }} transition={spring} />}
      {props.beer && (
        <motion.g animate={{ x: bw }} transition={spring}>
          <g transform={`translate(${CX + 6}, 196) rotate(-8)`}>
            <rect x="0" y="0" width="18" height="24" rx="3" fill="#ffd43b" stroke="#e8a500" strokeWidth="2" />
            <rect x="-1" y="-6" width="20" height="8" rx="4" fill="#fff" />
            <path d="M18 5 h5 a5 5 0 0 1 0 10 h-5" fill="none" stroke="#e8a500" strokeWidth="2.2" />
          </g>
        </motion.g>
      )}
      {props.sweat && <path d={`M ${CX + w * 0.8} ${CY - 30} q 5 9 0 13 q -5 -4 0 -13 z`} fill="#74c0fc" />}
    </motion.svg>
  );
}

