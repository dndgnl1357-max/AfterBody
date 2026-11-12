// 사진 → 미모티콘식 아바타 초안 (브라우저 안에서만 실행, 사진은 어디로도 전송하지 않음)
//   Face Landmarker(얼굴 점 478개) → 얼굴형·눈·눈썹·코·입 비율, 피부·눈동자·수염 색
//   Hair Segmenter → 머리 길이·볼륨·앞머리
// 측정값을 부품 선택지로 바꾸는 기준은 공공 초상 사진 10장의 측정 분포로 잡았다.
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, defaultSpec, nearest } from "./avatar/spec";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const FACE_MODEL = "/mediapipe/face_landmarker.task";
const HAIR_MODEL = "/mediapipe/hair_segmenter.tflite";

let toolsPromise = null;
function getTools() {
  toolsPromise ??= (async () => {
    const { FaceLandmarker, ImageSegmenter, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const [face, hair] = await Promise.all([
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" }, runningMode: "IMAGE", numFaces: 1,
      }),
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAIR_MODEL, delegate: "CPU" }, runningMode: "IMAGE",
        outputConfidenceMasks: true, outputCategoryMask: false,
      }).catch(() => null),
    ]);
    return { face, hair };
  })();
  toolsPromise.catch(() => { toolsPromise = null; });
  return toolsPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function toCanvas(img, max = 1024) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function sample(ctx, [x, y], r) {
  const s = Math.max(2, Math.round(r));
  const d = ctx.getImageData(Math.max(0, Math.round(x - s)), Math.max(0, Math.round(y - s)), s * 2, s * 2).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  return [R / n, G / n, B / n];
}

/** 측정 → 부품 선택 (기준값은 공공 초상 사진 측정 분포의 대략 1/3, 2/3 지점) */
export function specFromMeasures(m, sex) {
  const s = defaultSpec(sex);
  s.skin = nearest(m.skinRGB, SKIN_TONES);
  if (m.hairRGB) {
    const [r, g, b] = m.hairRGB, chroma = Math.max(r, g, b) - Math.min(r, g, b), L = lum(m.hairRGB);
    // 채도 낮고 밝으면 흰머리·회색 머리
    s.hairColor = chroma < 22 && L > 150 ? HAIR_COLORS[8] : chroma < 22 && L > 85 ? HAIR_COLORS[7] : nearest(m.hairRGB, HAIR_COLORS);
  }
  s.eyeColor = nearest(m.irisRGB, EYE_COLORS);

  s.faceShape = m.widthRatio > 0.865 ? "round" : m.jawRatio > 0.842 ? "square" : m.jawRatio < 0.788 ? "heart" : "oval";
  s.eyeShape = m.eyeOpen > 0.34 ? "round" : m.eyeOpen < 0.25 ? "narrow" : "almond";
  s.eyeSize = clamp(m.eyeWidth / 0.193, 0.88, 1.12);
  s.eyeGap = clamp(m.eyeGap / 0.43, 0.9, 1.1);
  s.browShape = m.browArch > 0.034 ? "arched" : m.browArch < 0.026 ? "straight" : "soft";
  s.nose = m.noseWidth > 0.302 ? "wide" : m.noseWidth < 0.275 ? "small" : "button";
  s.lips = m.lipHeight > 0.16 ? "full" : m.lipHeight < 0.09 ? "thin" : "normal";

  // 머리: 머리카락 영역의 위치·양으로 길이와 앞머리 판단
  if (m.hair) {
    const h = m.hair;
    if (h.area < 0.08) s.hairStyle = "bald";
    else if (h.below > 0.6 && h.area > 0.9) s.hairStyle = "long";
    else if (h.below > -0.15 && h.area > 0.8) s.hairStyle = "bob";       // 옷·배경의 어두운 부분을 단발로 착각하지 않게 양도 본다
    else if (h.volume < 0.12) s.hairStyle = "buzz";
    else s.hairStyle = h.sideDiff > 0.25 ? "sidepart" : "short";
    s.bangs = h.forehead > 0.45 ? (h.sideDiff > 0.3 ? "side" : "straight") : (["bob", "long"].includes(s.hairStyle) && h.forehead > 0.2 ? "side" : "none");
    if (["buzz", "bald"].includes(s.hairStyle)) s.bangs = "none";
  }
  // 수염: 턱·윗입술이 볼보다 확실히 어두울 때만
  s.facialHair = m.chinDark < 0.62 ? "beard" : m.lipDark < 0.66 ? "mustache" : m.chinDark < 0.75 && m.lipDark < 0.8 ? "stubble" : "none";
  return s;
}

/**
 * @returns {Promise<{spec: object|null, measures: object|null, message: string}>}
 */
export async function analyzeFace(file, sex = 1) {
  const img = await loadImage(file);
  const canvas = toCanvas(img);
  URL.revokeObjectURL(img.src);
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let tools, marks;
  try {
    tools = await getTools();
    marks = tools.face.detect(canvas).faceLandmarks?.[0];
  } catch {
    return { spec: null, measures: null, message: "얼굴 분석 기능을 불러오지 못했어요. 직접 꾸며 주세요." };
  }
  if (!marks) return { spec: null, measures: null, message: "얼굴을 찾지 못했어요. 얼굴이 잘 보이는 정면 사진으로 다시 해 보세요." };

  const P = (i) => [marks[i].x * W, marks[i].y * H];
  const faceW = d2(P(234), P(454)), faceH = d2(P(10), P(152));
  const r = faceW * 0.035;
  const eyeL = { w: d2(P(33), P(133)), h: d2(P(159), P(145)) }, eyeR = { w: d2(P(263), P(362)), h: d2(P(386), P(374)) };
  const browY = (o, mid_, inn) => P(mid_)[1] - (P(o)[1] + P(inn)[1]) / 2;   // 음수일수록 가운데가 높음(아치)
  // 피부: 여러 곳을 뽑아 밝은 하이라이트·어두운 그림자를 빼고 중간 톤 (조명 영향 줄이기)
  const skinPts = [50, 280, 205, 425, 187, 411, 151, 123, 352].map((i) => sample(ctx, P(i), r)).sort((a, b) => lum(a) - lum(b));
  const skinRGB = [0, 1, 2].map((k) => (skinPts[2][k] + skinPts[3][k] + skinPts[4][k]) / 3);
  const chin = sample(ctx, mid(P(152), P(17)), r * 0.8), upperLip = sample(ctx, mid(P(0), P(2)), r * 0.6);

  const m = {
    widthRatio: faceW / faceH,
    jawRatio: d2(P(172), P(397)) / faceW,
    eyeOpen: (eyeL.h / eyeL.w + eyeR.h / eyeR.w) / 2,
    eyeWidth: (eyeL.w + eyeR.w) / 2 / faceW,
    eyeGap: d2(mid(P(33), P(133)), mid(P(263), P(362))) / faceW,
    browArch: -(browY(70, 105, 107) + browY(300, 334, 336)) / 2 / faceH,
    noseWidth: d2(P(48), P(278)) / faceW,
    lipHeight: d2(P(0), P(17)) / faceH,
    skinRGB,
    irisRGB: marks.length > 473 ? sample(ctx, P(468), r * 0.25).map((v, i) => (v + sample(ctx, P(473), r * 0.25)[i]) / 2) : [42, 28, 20],
    chinDark: lum(chin) / lum(skinRGB),
    lipDark: lum(upperLip) / lum(skinRGB),
    hairRGB: null,
    hair: null,
  };

  if (tools.hair) {
    try {
      const res = tools.hair.segment(canvas);
      const mask = res.confidenceMasks?.[res.confidenceMasks.length - 1];
      if (mask) {
        const conf = mask.getAsFloat32Array(), mw = mask.width, mh = mask.height;
        const at = (x, y) => conf[Math.floor((y / H) * mh) * mw + Math.floor((x / W) * mw)] > 0.5;
        const top = P(10)[1], chinY = P(152)[1], cx = (P(234)[0] + P(454)[0]) / 2;
        const browYv = (P(105)[1] + P(334)[1]) / 2;
        let area = 0, minY = Infinity, maxSideY = -Infinity, fore = 0, foreN = 0, left = 0, right = 0;
        const dark = [0, 0, 0]; let dn = 0;
        const step = Math.max(1, Math.round(faceW / 60));
        for (let y = Math.max(0, top - faceH * 1.0); y < Math.min(H, chinY + faceH * 1.5); y += step) {
          for (let x = Math.max(0, cx - faceW * 1.4); x < Math.min(W, cx + faceW * 1.4); x += step) {
            const inForehead = y > top - faceH * 0.05 && y < browYv && Math.abs(x - cx) < faceW * 0.3;
            if (inForehead) foreN++;
            if (!at(x, y)) continue;
            area++;
            minY = Math.min(minY, y);
            if (Math.abs(x - cx) > faceW * 0.45) maxSideY = Math.max(maxSideY, y);
            if (inForehead) fore++;
            if (y < top) { x < cx ? left++ : right++; }
            if (y < top + faceH * 0.1) {
              const p = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
              dark[0] += p[0]; dark[1] += p[1]; dark[2] += p[2]; dn++;
            }
          }
        }
        const cell = (faceW / step) * (faceH / step);
        m.hair = {
          area: area / cell,
          volume: (top - minY) / faceH,
          below: (maxSideY - chinY) / faceH,
          forehead: foreN ? fore / foreN : 0,
          sideDiff: (left + right) ? Math.abs(left - right) / (left + right) : 0,
        };
        if (dn > 20) m.hairRGB = dark.map((v) => v / dn);
      }
      res.close?.();
    } catch { /* 머리 정보 없이 진행 */ }
  }

  const spec = specFromMeasures(m, sex);
  return { spec, measures: m, message: "사진을 보고 아바타 초안을 만들었어요. '꾸미기'에서 마음껏 바꿔 보세요." };
}
