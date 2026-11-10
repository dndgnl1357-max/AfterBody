import { motion } from "framer-motion";

// BMI → 몸통 가로 배율 (BMI 22 = 1.0). 과장하지 않도록 범위를 제한한다.
const widthScale = (bmi) => Math.min(Math.max((bmi / 22) ** 1.1, 0.75), 1.8);

function Body({ scale, fill, opacity = 1, blur = false }) {
  return (
    <motion.g
      initial={false}
      animate={{ scaleX: scale }}
      transition={{ type: "spring", stiffness: 60, damping: 14 }}
      style={{ transformOrigin: "60px 120px", opacity, filter: blur ? "blur(3px)" : undefined }}
      fill={fill}
    >
      {/* 몸통 */}
      <rect x="38" y="52" width="44" height="78" rx="20" />
      {/* 팔 */}
      <rect x="26" y="58" width="12" height="62" rx="6" />
      <rect x="82" y="58" width="12" height="62" rx="6" />
      {/* 다리 */}
      <rect x="42" y="122" width="15" height="78" rx="7" />
      <rect x="63" y="122" width="15" height="78" rx="7" />
    </motion.g>
  );
}

/** 디지털 트윈 실루엣. range(p90 BMI)는 흐릿한 그림자로 '불확실성'을 보여준다. */
export default function Avatar({ bmi, bmiHigh, color, label }) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 210" className="h-44 w-auto" role="img" aria-label={`${label} BMI ${bmi.toFixed(1)}`}>
        {bmiHigh && <Body scale={widthScale(bmiHigh)} fill={color} opacity={0.18} blur />}
        <Body scale={widthScale(bmi)} fill={color} opacity={0.85} />
        <circle cx="60" cy="30" r="17" fill={color} opacity={0.9} />
      </svg>
      <figcaption className="text-xs text-mute">BMI {bmi.toFixed(1)}</figcaption>
    </figure>
  );
}
