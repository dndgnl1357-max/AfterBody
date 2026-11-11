// 사진 → 아바타 특징 추출 (브라우저 안에서만 실행, 사진은 어디로도 전송하지 않음)
// MediaPipe Face Landmarker: 얼굴 점 478개 → 얼굴 위치·얼굴형·눈 간격, 픽셀 샘플링 → 피부색·머리색
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL = "/mediapipe/face_landmarker.task";

let landmarkerPromise = null;
function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: 1,
    });
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; });   // 실패하면 다음에 다시 시도
  return landmarkerPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** 큰 사진은 1024px로 줄인 캔버스로 (분석 속도·메모리) */
function toCanvas(img, max = 1024) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function crop(src, cx, cy, size, out = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = out;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(src, cx - size / 2, cy - size / 2, size, size, 0, 0, out, out);
  return c.toDataURL("image/jpeg", 0.88);
}

const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const colorDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** (x, y) 주변 정사각형 픽셀 평균색 */
function sample(ctx, x, y, r) {
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const w = Math.max(1, Math.round(r * 2)), h = w;
  const d = ctx.getImageData(x0, y0, w, h).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  return [R / n, G / n, B / n];
}

/**
 * @returns {Promise<{photo: string, features: object|null, message: string}>}
 *  features: { skin, hair, faceRatio(얼굴 가로/세로 보정값), eyeGap(눈 간격 보정값) }
 */
export async function analyzeFace(file) {
  const img = await loadImage(file);
  const canvas = toCanvas(img);
  URL.revokeObjectURL(img.src);
  const W = canvas.width, H = canvas.height;
  const fallback = (message) => ({ photo: crop(canvas, W / 2, H / 2, Math.min(W, H)), features: null, message });

  let marks;
  try {
    const lm = await getLandmarker();
    marks = lm.detect(canvas).faceLandmarks?.[0];
  } catch {
    return fallback("얼굴 분석 기능을 불러오지 못해 사진을 그대로 썼어요.");
  }
  if (!marks) return fallback("얼굴을 찾지 못했어요. 정면 사진이면 더 잘 돼요. 우선 사진 가운데를 썼어요.");

  const P = (i) => [marks[i].x * W, marks[i].y * H];
  const xs = marks.map((m) => m.x * W), ys = marks.map((m) => m.y * H);
  const faceW = dist(P(234), P(454));          // 양쪽 광대 끝
  const faceH = dist(P(10), P(152));           // 이마 위 ~ 턱 끝
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 - faceH * 0.12;   // 머리카락까지 보이게 살짝 위로
  const size = Math.max(faceW, faceH) * 1.7;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const r = Math.max(2, faceW * 0.03);
  const cheeks = [sample(ctx, ...P(50), r), sample(ctx, ...P(280), r)];
  const skin = cheeks[0].map((v, k) => (v + cheeks[1][k]) / 2);

  // 머리색: 이마 위·양쪽 관자놀이 위 중 가장 어두운 곳 (배경·피부와 구분)
  const up = faceH * 0.14;
  const spots = [[P(10)[0], P(10)[1] - up], [P(54)[0], P(54)[1] - up * 0.6], [P(284)[0], P(284)[1] - up * 0.6]]
    .filter(([x, y]) => x > 0 && y > 0 && x < W && y < H)
    .map(([x, y]) => sample(ctx, x, y, r));
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const darkest = spots.sort((a, b) => lum(a) - lum(b))[0];
  const hairVisible = darkest && colorDist(darkest, skin) > 40 && lum(darkest) < lum(skin);

  const eyeL = [(P(33)[0] + P(133)[0]) / 2, (P(33)[1] + P(133)[1]) / 2];
  const eyeR = [(P(362)[0] + P(263)[0]) / 2, (P(362)[1] + P(263)[1]) / 2];

  return {
    photo: crop(canvas, cx, cy, size),
    features: {
      skin: hex(skin),
      hair: hairVisible ? hex(darkest) : null,
      faceRatio: clamp((faceW / faceH) / 0.9, 0.88, 1.12),      // 1보다 크면 둥근 얼굴
      eyeGap: clamp((dist(eyeL, eyeR) / faceW) / 0.45, 0.85, 1.15),
    },
    message: hairVisible ? "사진을 보고 얼굴형·피부색·머리색을 맞췄어요." : "얼굴형·피부색을 맞췄어요. 머리색은 잘 안 보여서 기본색을 썼어요.",
  };
}
