import { motion } from "framer-motion";
import { STICKER } from "../faceAnalyze";

/**
 * 사람 아바타. BMI에 따라 몸통·얼굴 폭이 변하고, 결과에 따라 표정·소품이 바뀐다.
 * hair: "short" | "bob" | "long" | "bun",  photo: 사용자 얼굴 사진(dataURL, 브라우저에만 저장)
 * mood: "happy" | "meh" | "tired",  props: { beer, sweat, headband },  color: 상의 색
 */
export const HAIRS = [
  { id: "short", label: "짧은 머리" },
  { id: "bob", label: "단발" },
  { id: "long", label: "긴 머리" },
  { id: "bun", label: "묶은 머리" },
];

const SKIN = "#f3cba5";
const HAIR = "#3b2f2f";
const PANTS = "#5c6378";
const spring = { type: "spring", stiffness: 70, damping: 13 };

function Hair({ style, back, color = HAIR }) {
  if (back) {
    if (style === "long") return <path d="M56 40 Q54 82 60 104 L100 104 Q106 82 104 40 Z" fill={color} />;
    if (style === "bob") return <path d="M56 40 Q55 64 60 72 L100 72 Q105 64 104 40 Z" fill={color} />;
    return null;
  }
  return (
    <g fill={color}>
      <path d="M57 44 Q56 20 80 20 Q104 20 103 44 Q96 32 80 31 Q66 31 57 44 Z" />
      {style === "short" && <path d="M64 30 Q76 36 92 29 Q86 24 80 24 Q70 24 64 30 Z" />}
      {style === "bun" && <circle cx="80" cy="15" r="9" />}
    </g>
  );
}

function Face({ mood, blush, eye = 1, hairColor = HAIR }) {
  const ex = 8 * eye;
  const mouth = {
    happy: "M73 58 Q80 65 87 58",
    meh: "M74 60 L86 60",
    tired: "M73 61 Q77 57 80 61 Q83 65 87 61",
  }[mood];
  return (
    <g>
      <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 3.8, times: [0, 0.92, 0.96, 1], repeat: Infinity }}
        style={{ transformOrigin: "80px 48px" }}>
        <ellipse cx={80 - ex} cy="48" rx="2.6" ry="3.4" fill="#2b2b2b" />
        <ellipse cx={80 + ex} cy="48" rx="2.6" ry="3.4" fill="#2b2b2b" />
      </motion.g>
      <path d={mood === "tired" ? `M${80 - ex - 5} 40 L${80 - ex + 4} 42 M${80 + ex - 4} 42 L${80 + ex + 5} 40` : `M${80 - ex - 5} 41 L${80 - ex + 4} 40 M${80 + ex - 4} 40 L${80 + ex + 5} 41`} stroke={hairColor} strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="66" cy="55" rx="4.5" ry="2.8" fill="#ff8787" opacity={blush ? 0.7 : 0.25} />
      <ellipse cx="94" cy="55" rx="4.5" ry="2.8" fill="#ff8787" opacity={blush ? 0.7 : 0.25} />
      <path d={mouth} stroke="#7a3b2e" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

export default function Character({ bmi, refBmi, color, hair = "short", photo, photoKind = "circle", features, mood = "meh", props = {}, delay = 0, size = 170 }) {
  const skin = features?.skin ?? SKIN;
  const hairColor = features?.hair ?? HAIR;
  const shape = features?.faceRatio ?? 1;     // 사진에서 측정한 얼굴형 (1 = 보통)
  // 체형: 기준 BMI 대비 변화를 2.5배 과장해서 눈에 보이게 (화면에 '과장 표현' 안내)
  const base = Math.min(Math.max((refBmi / 22) ** 1.2, 0.85), 1.5);
  const f = Math.min(Math.max(base * (1 + 2.5 * (bmi - refBmi) / refBmi), 0.75), 1.9);
  const w = 46 * f;                       // 몸통 폭
  const belly = 34 * f * f / base;        // 배 부분 (체중 변화에 더 민감)
  const face = Math.min(Math.max(1 + 0.35 * (f / base - 1), 0.85), 1.3) * shape;
  const id = `face-${color.slice(1)}-${delay}`;

  return (
    <motion.svg viewBox="0 0 160 220" width={size} height={size * 1.375} className="overflow-visible"
      animate={{ y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay }}
      role="img" aria-label={`아바타 BMI ${bmi.toFixed(1)}`}>
      <defs><clipPath id={id}><circle cx="80" cy="46" r="22" /></clipPath></defs>
      <motion.ellipse cx="80" cy="212" ry="5" fill="#000" opacity="0.08" animate={{ rx: w * 0.9 }} transition={spring} />

      {!photo && <motion.g animate={{ scaleX: face }} style={{ transformOrigin: "80px 40px" }} transition={spring}><Hair style={hair} back color={hairColor} /></motion.g>}

      {/* 다리·신발 */}
      <motion.rect y="140" width="17" height="64" rx="7" fill={PANTS} animate={{ x: 80 - w * 0.12 - 17 }} transition={spring} />
      <motion.rect y="140" width="17" height="64" rx="7" fill={PANTS} animate={{ x: 80 + w * 0.12 }} transition={spring} />
      <motion.ellipse cy="205" rx="11" ry="5" fill="#343a40" animate={{ cx: 80 - w * 0.12 - 9 }} transition={spring} />
      <motion.ellipse cy="205" rx="11" ry="5" fill="#343a40" animate={{ cx: 80 + w * 0.12 + 9 }} transition={spring} />

      {/* 팔 (상의 소매 + 손) */}
      <motion.rect y="80" width="12" height="54" rx="6" fill={color} animate={{ x: 80 - w / 2 - 10 }} transition={spring} />
      <motion.rect y="80" width="12" height="54" rx="6" fill={color} animate={{ x: 80 + w / 2 - 2 }} transition={spring} />
      <motion.circle cy="138" r="6" fill={skin} animate={{ cx: 80 - w / 2 - 4 }} transition={spring} />
      <motion.circle cy="138" r="6" fill={skin} animate={{ cx: 80 + w / 2 + 4 }} transition={spring} />

      {/* 몸통 */}
      <rect x="73" y="62" width="14" height="16" rx="4" fill={skin} />
      <motion.rect y="74" height="74" rx="20" fill={color} animate={{ x: 80 - w / 2, width: w }} transition={spring} />
      <motion.ellipse cx="80" cy="124" ry="20" fill={color} animate={{ rx: belly / 2 }} transition={spring} />
      <motion.ellipse cx="80" cy="128" ry="12" fill="#fff" opacity="0.22" animate={{ rx: belly / 3 }} transition={spring} />
      <path d="M72 76 Q80 84 88 76" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" fill="none" />

      {/* 머리 */}
      {photo && photoKind === "cutout" ? (() => {
        // 오려 낸 내 얼굴(머리카락 포함): 얼굴 중심 → (80, 46)
        const k = 52 / STICKER.faceW;       // 그림 머리(44)보다 조금 크게 → 얼굴이 잘 보이는 캐릭터 비율
        return (
          <g>
            <motion.image href={photo} x={80 - STICKER.cx * k} y={46 - STICKER.cy * k} width={STICKER.w * k} height={STICKER.h * k}
              animate={{ scaleX: face }} style={{ transformOrigin: "80px 46px", filter: "drop-shadow(0 0 0.6px #3b2f2f)" }} transition={spring} />
            {props.beer && <><ellipse cx="68" cy="54" rx="5" ry="3" fill="#ff6b6b" opacity="0.35" /><ellipse cx="92" cy="54" rx="5" ry="3" fill="#ff6b6b" opacity="0.35" /></>}
          </g>
        );
      })() : photo ? (
        <g>
          <circle cx="80" cy="46" r="24" fill="#fff" />
          <motion.image href={photo} x="58" y="24" width="44" height="44" clipPath={`url(#${id})`}
            preserveAspectRatio="xMidYMid slice" animate={{ scaleX: face }} style={{ transformOrigin: "80px 46px" }} transition={spring} />
          {props.beer && <ellipse cx="80" cy="56" rx="14" ry="5" fill="#ff6b6b" opacity="0.25" />}
        </g>
      ) : (
        <g>
          <motion.ellipse cx="80" cy="46" ry="22" fill={skin} animate={{ rx: 21 * face }} transition={spring} />
          <motion.ellipse cy="48" rx="3" ry="5" fill={skin} animate={{ cx: 80 - 21 * face }} transition={spring} />
          <motion.ellipse cy="48" rx="3" ry="5" fill={skin} animate={{ cx: 80 + 21 * face }} transition={spring} />
          <motion.g animate={{ scaleX: face }} style={{ transformOrigin: "80px 40px" }} transition={spring}><Hair style={hair} color={hairColor} /></motion.g>
          <Face mood={mood} blush={props.beer} eye={features?.eyeGap ?? 1} hairColor={hairColor} />
        </g>
      )}

      {/* 소품 */}
      {props.headband && <rect x="57" y="30" width="46" height="6" rx="3" fill="#fa5252" />}
      {props.beer && (
        <motion.g animate={{ x: w / 2 }} transition={spring}>
          <g transform="translate(84, 124) rotate(-6)">
            <rect x="0" y="0" width="16" height="21" rx="3" fill="#ffd43b" stroke="#e8a500" strokeWidth="1.8" />
            <rect x="-1" y="-5" width="18" height="7" rx="3.5" fill="#fff" />
            <path d="M16 5 h4 a4 4 0 0 1 0 9 h-4" fill="none" stroke="#e8a500" strokeWidth="2" />
          </g>
        </motion.g>
      )}
      {props.sweat && <path d="M106 34 q4 7 0 10 q-4 -3 0 -10z" fill="#74c0fc" />}
    </motion.svg>
  );
}
