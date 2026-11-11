// 사진 → '내 얼굴 아바타' (브라우저 안에서만 실행, 사진은 어디로도 전송하지 않음)
//   1. Face Landmarker(얼굴 점 478개) → 얼굴 윤곽선, 위치·크기, 피부색
//   2. Hair Segmenter → 실제 머리카락 모양
//   3. 얼굴 윤곽 + 머리카락만 오려 내고(배경 제거) 만화 필터(매끄럽게 → 색 단순화 → 윤곽선)
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const FACE_MODEL = "/mediapipe/face_landmarker.task";
const HAIR_MODEL = "/mediapipe/hair_segmenter.tflite";

// 결과 스티커 규격: 256×320, 얼굴 폭 96px, 얼굴 중심 (128, 150) — Character.jsx 와 같은 값
export const STICKER = { w: 256, h: 320, faceW: 96, cx: 128, cy: 150 };

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
      }).catch(() => null),                               // 머리카락 모델이 없어도 얼굴만으로 진행
    ]);
    return { face, hair, oval: chain(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) };
  })();
  toolsPromise.catch(() => { toolsPromise = null; });
  return toolsPromise;
}

/** 얼굴 윤곽 연결선(start→end) → 순서대로 이은 점 번호 */
function chain(conns) {
  const next = new Map(conns.map((c) => [c.start, c.end]));
  const out = [conns[0].start];
  for (let i = 0; i < conns.length; i++) {
    const n = next.get(out[out.length - 1]);
    if (n === undefined || n === out[0]) break;
    out.push(n);
  }
  return out;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function toCanvas(img, max = 1024) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = canvasOf(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** 3×3 평균 흐림 (채널 지정) — 피부결 정리·가장자리 부드럽게 */
function boxBlur(data, w, h, channels) {
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (const c of channels) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[i + (dy * w + dx) * 4 + c];
        data[i + c] = s / 9;
      }
    }
  }
}

/** 만화 필터: 매끄럽게 → 색 단계 줄이기·채도 살짝 올리기 → 윤곽선 */
function cartoon(img, w, h) {
  const d = img.data;
  boxBlur(d, w, h, [0, 1, 2]);
  boxBlur(d, w, h, [0, 1, 2]);
  const gray = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const step = 28;
  for (let i = 0; i < d.length; i += 4) {
    const m = (d[i] + d[i + 1] + d[i + 2]) / 3;
    for (let c = 0; c < 3; c++) {
      const sat = m + (d[i + c] - m) * 1.18;                          // 채도 18% 올림
      d[i + c] = clamp(Math.round(sat / step) * step + 6, 0, 255);    // 색 단계 줄이기
    }
  }
  for (let y = 1; y < h - 1; y++) {                                    // Sobel 윤곽선
    for (let x = 1; x < w - 1; x++) {
      const g = (dx, dy) => gray[(y + dy) * w + (x + dx)];
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      const a = clamp((Math.hypot(gx, gy) - 70) / 120, 0, 0.85);
      if (a > 0) {
        const i = (y * w + x) * 4;
        d[i] = d[i] * (1 - a) + 50 * a; d[i + 1] = d[i + 1] * (1 - a) + 38 * a; d[i + 2] = d[i + 2] * (1 - a) + 38 * a;
      }
    }
  }
}

/** 얼굴을 못 찾았을 때: 가운데를 동그랗게 */
function circleFallback(canvas) {
  const W = canvas.width, H = canvas.height, s = Math.min(W, H);
  const c = canvasOf(256, 256);
  c.getContext("2d").drawImage(canvas, (W - s) / 2, (H - s) / 2, s, s, 0, 0, 256, 256);
  return c.toDataURL("image/jpeg", 0.88);
}

/**
 * @returns {Promise<{photo: string, kind: "cutout"|"circle", message: string}>}
 */
export async function analyzeFace(file) {
  const img = await loadImage(file);
  const canvas = toCanvas(img);
  URL.revokeObjectURL(img.src);
  const W = canvas.width, H = canvas.height;
  const fallback = (message) => ({ photo: circleFallback(canvas), kind: "circle", message });

  let tools, marks;
  try {
    tools = await getTools();
    marks = tools.face.detect(canvas).faceLandmarks?.[0];
  } catch {
    return fallback("얼굴 분석 기능을 불러오지 못해 사진 가운데를 그대로 썼어요.");
  }
  if (!marks) return fallback("얼굴을 찾지 못했어요. 얼굴이 잘 보이는 정면 사진이면 더 잘 돼요.");

  const P = (i) => [marks[i].x * W, marks[i].y * H];
  const ovalPts = tools.oval.map(P);
  const xs = ovalPts.map((p) => p[0]), ys = ovalPts.map((p) => p[1]);
  const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
  const faceW = fx1 - fx0, faceH = fy1 - fy0;
  const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;

  // ── 마스크: 얼굴 윤곽 + 머리와 이어진 머리카락
  // 얼굴 점은 이마 중간까지만 있어 위쪽을 이마 끝까지 늘린다 (아래쪽·옆은 4%만)
  const ovalPath = (ctx, grow, up) => {
    ctx.beginPath();
    ovalPts.forEach(([x, y], k) => {
      const ex = fcx + (x - fcx) * grow;
      const ey = fcy + (y - fcy) * (y < fcy ? up : grow);
      k ? ctx.lineTo(ex, ey) : ctx.moveTo(ex, ey);
    });
    ctx.closePath();
  };
  const mask = canvasOf(W, H);
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  mctx.fillStyle = "#fff";
  ovalPath(mctx, 1.04, 1.42);
  mctx.fill();
  let hairFound = false;
  if (tools.hair) {
    try {
      const res = tools.hair.segment(canvas);
      const m = res.confidenceMasks?.[res.confidenceMasks.length - 1];   // 마지막 = 머리카락
      if (m) {
        const conf = m.getAsFloat32Array(), mw = m.width, mh = m.height;
        // 머리 주변 영역만 본다
        const x0 = Math.max(0, Math.floor(fcx - faceW * 1.4)), x1 = Math.min(W, Math.ceil(fcx + faceW * 1.4));
        const y0 = Math.max(0, Math.floor(fy0 - faceH * 0.9)), y1 = Math.min(H, Math.ceil(fy1 + faceH * 1.3));
        const rw = x1 - x0, rh = y1 - y0;
        const hair = new Uint8Array(rw * rh);
        for (let y = 0; y < rh; y++) {
          for (let x = 0; x < rw; x++) {
            const c = conf[Math.floor(((y + y0) / H) * mh) * mw + Math.floor(((x + x0) / W) * mw)];
            hair[y * rw + x] = c > 0.5 ? 1 : 0;
          }
        }
        // 씨앗: 얼굴 윤곽을 조금 넓힌 영역 안의 머리카락 → 이어진 머리카락만 남김 (배경·옷의 어두운 덩어리 제거)
        const seedC = canvasOf(W, H);
        const sctx = seedC.getContext("2d", { willReadFrequently: true });
        sctx.fillStyle = "#fff";
        ovalPath(sctx, 1.25, 1.6);
        sctx.fill();
        const seed = sctx.getImageData(x0, y0, rw, rh).data;
        const keep = new Uint8Array(rw * rh);
        const stack = [];
        for (let p = 0; p < rw * rh; p++) if (hair[p] && seed[p * 4 + 3] > 0) { keep[p] = 1; stack.push(p); }
        while (stack.length) {
          const p = stack.pop(), x = p % rw, y = (p - x) / rw;
          for (const q of [x > 0 ? p - 1 : -1, x < rw - 1 ? p + 1 : -1, y > 0 ? p - rw : -1, y < rh - 1 ? p + rw : -1]) {
            if (q >= 0 && hair[q] && !keep[q]) { keep[q] = 1; stack.push(q); }
          }
        }
        const md = mctx.getImageData(x0, y0, rw, rh);
        let n = 0;
        for (let p = 0; p < rw * rh; p++) {
          if (keep[p]) { const i = p * 4; md.data[i] = md.data[i + 1] = md.data[i + 2] = md.data[i + 3] = 255; n++; }
        }
        mctx.putImageData(md, x0, y0);
        hairFound = n > faceW * faceH * 0.05;
      }
      res.close?.();
    } catch { /* 머리카락 없이 진행 */ }
  }

  // ── 스티커 규격으로 잘라 붙이기 (얼굴 폭 96px, 얼굴 중심 128,150)
  const k = STICKER.faceW / faceW;
  const sx = fcx - STICKER.cx / k, sy = fcy - STICKER.cy / k, sw = STICKER.w / k, sh = STICKER.h / k;
  const out = canvasOf(STICKER.w, STICKER.h);
  const octx = out.getContext("2d", { willReadFrequently: true });
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, STICKER.w, STICKER.h);
  const pix = octx.getImageData(0, 0, STICKER.w, STICKER.h);
  cartoon(pix, STICKER.w, STICKER.h);

  const mOut = canvasOf(STICKER.w, STICKER.h);
  const moctx = mOut.getContext("2d", { willReadFrequently: true });
  moctx.drawImage(mask, sx, sy, sw, sh, 0, 0, STICKER.w, STICKER.h);
  const ma = moctx.getImageData(0, 0, STICKER.w, STICKER.h);
  for (let r = 0; r < 2; r++) boxBlur(ma.data, STICKER.w, STICKER.h, [3]);   // 가장자리 부드럽게
  for (let i = 3; i < pix.data.length; i += 4) pix.data[i] = ma.data[i];
  octx.putImageData(pix, 0, 0);

  return {
    photo: out.toDataURL("image/png"),
    kind: "cutout",
    message: hairFound ? "얼굴과 머리 모양 그대로 아바타를 만들었어요." : "얼굴로 아바타를 만들었어요. 머리카락은 잘 안 보여서 얼굴만 썼어요.",
  };
}
