// 미모티콘식 아바타: 부품(얼굴형·머리·눈·눈썹·코·입·안경·수염)과 색 팔레트
// spec 하나가 아바타 하나. 사진 분석(faceAnalyze.js)이 초안을 만들고, 편집 화면에서 사용자가 다듬는다.

export const SKIN_TONES = ["#fde3cf", "#f7d0b2", "#efbf98", "#e2a77d", "#c98b62", "#a86d4a", "#82533a", "#5c3b2a"];
export const HAIR_COLORS = ["#1f1b1a", "#3b2a22", "#5a3d2b", "#8a6141", "#c8a06a", "#e5c98e", "#8d3b25", "#9a9a9a", "#e8e6e1"];
export const EYE_COLORS = ["#2a1c14", "#4a2f1e", "#6b4a2b", "#4f6b3a", "#3f6a8a"];

export const OPTIONS = {
  faceShape: [["round", "둥근형"], ["oval", "계란형"], ["square", "각진형"], ["heart", "갸름한 턱"]],
  hairStyle: [["buzz", "아주 짧게"], ["short", "짧은 머리"], ["sidepart", "옆 가르마"], ["curly", "곱슬"],
    ["bob", "단발"], ["long", "긴 머리"], ["ponytail", "묶은 머리"], ["bun", "똥머리"], ["bald", "민머리"]],
  bangs: [["none", "없음"], ["straight", "일자 앞머리"], ["side", "옆으로 넘김"]],
  eyeShape: [["round", "동그란 눈"], ["almond", "보통 눈"], ["narrow", "가는 눈"]],
  browShape: [["straight", "일자"], ["soft", "부드러운"], ["arched", "아치형"]],
  browWeight: [["thin", "얇게"], ["normal", "보통"], ["thick", "진하게"]],
  nose: [["small", "작은 코"], ["button", "동그란 코"], ["wide", "넓은 코"]],
  lips: [["thin", "얇은 입술"], ["normal", "보통"], ["full", "도톰한 입술"]],
  glasses: [["none", "없음"], ["round", "동그란 안경"], ["square", "네모 안경"]],
  facialHair: [["none", "없음"], ["stubble", "수염 자국"], ["mustache", "콧수염"], ["beard", "턱수염"]],
};

export function defaultSpec(sex = 1) {
  return {
    skin: SKIN_TONES[2], faceShape: "oval",
    hairStyle: sex === 2 ? "long" : "short", bangs: sex === 2 ? "side" : "none", hairColor: HAIR_COLORS[1],
    eyeShape: "almond", eyeSize: 1, eyeGap: 1, eyeColor: EYE_COLORS[0],
    browShape: "soft", browWeight: "normal", nose: "button", lips: "normal",
    glasses: "none", facialHair: "none",
  };
}

// ── 색 계산
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t));
export const lighten = (c, t) => mix(c, "#ffffff", t);
export const darken = (c, t) => mix(c, "#000000", t);
export const luminance = (c) => { const [r, g, b] = hexRgb(c); return 0.299 * r + 0.587 * g + 0.114 * b; };

/** 사진에서 뽑은 색 → 팔레트에서 가장 가까운 색 (조명 차이를 줄이려고 밝기를 맞춘 뒤 비교) */
export function nearest(rgb, palette, matchBrightness = false) {
  let best = palette[0], bd = Infinity;
  for (const p of palette) {
    const q = hexRgb(p);
    let c = rgb;
    if (matchBrightness) {
      const k = (q[0] + q[1] + q[2]) / Math.max(1, rgb[0] + rgb[1] + rgb[2]);
      c = rgb.map((v) => v * Math.min(1.6, Math.max(0.6, k)));      // 색상(톤)으로 비교
    }
    const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) + (matchBrightness ? Math.abs(luminance(p) - (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2])) * 0.8 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** 이전 버전 저장값 → spec */
export function migrateLook(look, sex) {
  if (look?.spec) return look;
  const spec = defaultSpec(sex);
  const map = { short: ["short", "none"], bob: ["bob", "straight"], long: ["long", "side"], bun: ["bun", "none"] };
  if (look?.hair && map[look.hair]) [spec.hairStyle, spec.bangs] = map[look.hair];
  return { spec, note: null };
}
