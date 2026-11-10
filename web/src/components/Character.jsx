import { motion } from "framer-motion";

/**
 * 말랑한 '모찌' 캐릭터. BMI에 따라 몸이 통통해지고, 결과에 따라 표정이 바뀐다.
 * skin: "mochi" | "bear" | "cat",  photo: 사용자가 올린 얼굴 사진(dataURL, 브라우저에만 저장)
 * mood: "happy" | "meh" | "tired",  props: { beer, sweat, headband }
 */
export const SKINS = [
  { id: "mochi", label: "모찌" },
  { id: "bear", label: "곰돌" },
  { id: "cat", label: "냥이" },
];

const spring = { type: "spring", stiffness: 70, damping: 12 };

function Face({ mood, blush }) {
  const mouth = {
    happy: "M70 112 Q80 124 90 112",
    meh: "M71 115 L89 115",
    tired: "M70 117 Q75 112 80 117 Q85 122 90 117",
  }[mood];
  return (
    <g>
      <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3.6, times: [0, 0.92, 0.96, 1], repeat: Infinity }}
        style={{ transformOrigin: "80px 98px" }}>
        <ellipse cx="66" cy="98" rx="4.5" ry="6" fill="#2b2b2b" />
        <ellipse cx="94" cy="98" rx="4.5" ry="6" fill="#2b2b2b" />
        <circle cx="67.5" cy="96" r="1.6" fill="#fff" />
        <circle cx="95.5" cy="96" r="1.6" fill="#fff" />
      </motion.g>
      <ellipse cx="57" cy="110" rx="7" ry="4.5" fill={blush ? "#ff6b6b" : "#ffb3b3"} opacity={blush ? 0.75 : 0.6} />
      <ellipse cx="103" cy="110" rx="7" ry="4.5" fill={blush ? "#ff6b6b" : "#ffb3b3"} opacity={blush ? 0.75 : 0.6} />
      <path d={mouth} stroke="#2b2b2b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {mood === "tired" && <path d="M112 84 q4 7 0 10 q-4 -3 0 -10z" fill="#74c0fc" />}
    </g>
  );
}

export default function Character({ bmi, refBmi, color, skin = "mochi", photo, mood = "meh", props = {}, delay = 0, size = 180 }) {
  // 몸 너비: 기준 BMI 대비 변화를 2.5배 과장해서 눈에 보이게 (화면에 '과장 표현' 안내)
  const base = Math.min(Math.max((refBmi / 22) ** 1.2, 0.85), 1.5);
  const f = Math.min(Math.max(base * (1 + 2.5 * (bmi - refBmi) / refBmi), 0.75), 1.9);
  const rx = 46 * f;
  const id = `clip-${color.slice(1)}-${delay}`;

  return (
    <motion.svg viewBox="0 0 160 200" width={size} height={size * 1.25} className="overflow-visible"
      animate={{ y: [0, -5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay }}>
      <defs>
        <clipPath id={id}><circle cx="80" cy="102" r="30" /></clipPath>
      </defs>
      <motion.ellipse cx="80" cy="186" ry="6" fill="#000" opacity="0.08" animate={{ rx: rx * 0.9 }} transition={spring} />

      {/* 귀 */}
      {skin === "bear" && (<>
        <motion.circle cy="66" r="13" fill={color} animate={{ cx: 80 - rx * 0.62 }} transition={spring} />
        <motion.circle cy="66" r="13" fill={color} animate={{ cx: 80 + rx * 0.62 }} transition={spring} />
      </>)}
      {skin === "cat" && (<>
        <motion.path fill={color} animate={{ d: `M${80 - rx * 0.75} 78 L${80 - rx * 0.55} 48 L${80 - rx * 0.2} 66 Z` }} transition={spring} />
        <motion.path fill={color} animate={{ d: `M${80 + rx * 0.75} 78 L${80 + rx * 0.55} 48 L${80 + rx * 0.2} 66 Z` }} transition={spring} />
      </>)}

      {/* 발·팔·몸 */}
      <motion.ellipse cy="182" rx="14" ry="8" fill={color} animate={{ cx: 80 - rx * 0.45 }} transition={spring} />
      <motion.ellipse cy="182" rx="14" ry="8" fill={color} animate={{ cx: 80 + rx * 0.45 }} transition={spring} />
      <motion.ellipse cy="130" rx="10" ry="16" fill={color} animate={{ cx: 80 - rx - 4 }} transition={spring}
        style={{ rotate: 18 }} />
      <motion.ellipse cy="130" rx="10" ry="16" fill={color} animate={{ cx: 80 + rx + 4 }} transition={spring}
        style={{ rotate: -18 }} />
      <motion.ellipse cx="80" cy="122" ry="62" fill={color} animate={{ rx }} transition={spring} />
      <motion.ellipse cx="80" cy="150" ry="26" fill="#fff" opacity="0.28" animate={{ rx: rx * 0.6 }} transition={spring} />

      {/* 얼굴: 사진이 있으면 사진, 없으면 캐릭터 얼굴 */}
      {photo ? (
        <g>
          <circle cx="80" cy="102" r="33" fill="#fff" />
          <motion.image href={photo} x="50" y="72" width="60" height="60" clipPath={`url(#${id})`}
            preserveAspectRatio="xMidYMid slice" animate={{ scaleX: Math.min(f / base, 1.35) }}
            style={{ transformOrigin: "80px 102px" }} transition={spring} />
          {props.beer && <ellipse cx="80" cy="114" rx="22" ry="7" fill="#ff6b6b" opacity="0.25" />}
        </g>
      ) : (
        <Face mood={mood} blush={props.beer} />
      )}

      {/* 소품 */}
      {props.headband && (
        <motion.rect y="68" height="9" rx="4.5" fill="#fa5252" animate={{ x: 80 - rx * 0.8, width: rx * 1.6 }} transition={spring} />
      )}
      {props.beer && (
        <g transform={`translate(${80 + rx + 2}, 118) rotate(-8)`}>
          <rect x="0" y="0" width="20" height="26" rx="3" fill="#ffd43b" stroke="#e8a500" strokeWidth="2" />
          <rect x="-1" y="-6" width="22" height="9" rx="4.5" fill="#fff" />
          <path d="M20 6 h5 a5 5 0 0 1 0 12 h-5" fill="none" stroke="#e8a500" strokeWidth="2.5" />
        </g>
      )}
      {props.sweat && <path d={`M${80 - rx - 12} 92 q4 7 0 10 q-4 -3 0 -10z`} fill="#74c0fc" />}
    </motion.svg>
  );
}
