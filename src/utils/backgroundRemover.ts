import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

interface CachedMask {
  width: number;
  height: number;
  /** Float values 0..1 where 1 = person foreground, 0 = background */
  personMask: Float32Array;
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;
const maskCache = new Map<string, CachedMask>();
const inFlightCache = new Map<string, Promise<CachedMask>>();

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      try {
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/selfie_segmenter.tflite',
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch {
        // Fallback to CPU delegate when WebGL2/GPU delegate is unavailable
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/selfie_segmenter.tflite',
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      }
    })();
  }
  return segmenterPromise;
}

/**
 * Fallback heuristic mask if WASM segmentation is blocked in a restricted browser.
 * Estimates background from top corners and builds a soft distance matte.
 */
function buildCornerColorFallbackMask(
  img: HTMLImageElement,
  workW: number,
  workH: number
): CachedMask {
  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      width: workW,
      height: workH,
      personMask: new Float32Array(workW * workH).fill(1),
    };
  }
  ctx.drawImage(img, 0, 0, workW, workH);
  const { data } = ctx.getImageData(0, 0, workW, workH);

  // Sample top-left and top-right corners
  const sampleOffsets = [
    (2 * workW + 2) * 4,
    (2 * workW + (workW - 3)) * 4,
    (Math.floor(workH * 0.1) * workW + 2) * 4,
    (Math.floor(workH * 0.1) * workW + (workW - 3)) * 4,
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const idx of sampleOffsets) {
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR /= sampleOffsets.length;
  bgG /= sampleOffsets.length;
  bgB /= sampleOffsets.length;

  const mask = new Float32Array(workW * workH);
  const visited = new Uint8Array(workW * workH);
  const queue = new Int32Array(workW * workH);
  let head = 0;
  let tail = 0;

  const isBgLike = (pIdx: number) => {
    const i = pIdx * 4;
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < 42;
  };

  mask.fill(1);
  for (let x = 0; x < workW; x++) {
    if (isBgLike(x)) {
      visited[x] = 1;
      queue[tail++] = x;
    }
  }
  for (let y = 0; y < Math.floor(workH * 0.75); y++) {
    const left = y * workW;
    const right = y * workW + (workW - 1);
    if (!visited[left] && isBgLike(left)) {
      visited[left] = 1;
      queue[tail++] = left;
    }
    if (!visited[right] && isBgLike(right)) {
      visited[right] = 1;
      queue[tail++] = right;
    }
  }

  while (head < tail) {
    const p = queue[head++];
    mask[p] = 0;
    const x = p % workW;
    const y = (p - x) / workW;
    const neighbors = [
      x > 0 ? p - 1 : -1,
      x < workW - 1 ? p + 1 : -1,
      y > 0 ? p - workW : -1,
      y < workH - 1 ? p + workW : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && isBgLike(n)) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  return { width: workW, height: workH, personMask: mask };
}

async function computePersonMask(
  sourceUrl: string,
  img: HTMLImageElement
): Promise<CachedMask> {
  const existing = maskCache.get(sourceUrl);
  if (existing) return existing;

  const inflight = inFlightCache.get(sourceUrl);
  if (inflight) return inflight;

  const task = (async () => {
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const workW = Math.max(32, Math.round(img.naturalWidth * scale));
    const workH = Math.max(32, Math.round(img.naturalHeight * scale));

    try {
      const segmenter = await getSegmenter();
      const inputCanvas = document.createElement('canvas');
      inputCanvas.width = workW;
      inputCanvas.height = workH;
      const ictx = inputCanvas.getContext('2d');
      if (!ictx) {
        throw new Error('2D context unavailable');
      }
      ictx.drawImage(img, 0, 0, workW, workH);

      const result = segmenter.segment(inputCanvas);
      try {
        const masks = result.confidenceMasks;
        if (!masks || masks.length === 0) {
          throw new Error('Empty confidence mask');
        }

        // If 2+ masks (background, person), index 1 is foreground person.
        // If 1 mask (binary selfie_segmenter), check corner vs center to verify polarity.
        const rawMask = masks.length >= 2 ? masks[1] : masks[0];
        const mW = rawMask.width;
        const mH = rawMask.height;
        const rawFloat = rawMask.getAsFloat32Array();
        const personMask = new Float32Array(rawFloat.length);

        let shouldInvert = false;
        if (masks.length === 1) {
          const cornerSamples = [
            rawFloat[0],
            rawFloat[mW - 1],
            rawFloat[Math.min(rawFloat.length - 1, mW * 2 + 2)],
            rawFloat[Math.min(rawFloat.length - 1, mW * 2 + mW - 3)],
          ];
          const cornerAvg =
            cornerSamples.reduce((a, b) => a + b, 0) / cornerSamples.length;

          const cx = Math.floor(mW * 0.5);
          const cy = Math.floor(mH * 0.45);
          const centerAvg =
            (rawFloat[cy * mW + cx] +
              rawFloat[Math.floor(mH * 0.6) * mW + cx]) /
            2;

          // If corners have higher confidence than the center face/torso, mask[0] is background
          if (cornerAvg > centerAvg) {
            shouldInvert = true;
          }
        }

        for (let i = 0; i < rawFloat.length; i++) {
          const v = shouldInvert ? 1 - rawFloat[i] : rawFloat[i];
          personMask[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        }

        const cached: CachedMask = { width: mW, height: mH, personMask };
        maskCache.set(sourceUrl, cached);
        return cached;
      } finally {
        result.close();
      }
    } catch {
      const fallback = buildCornerColorFallbackMask(img, workW, workH);
      maskCache.set(sourceUrl, fallback);
      return fallback;
    } finally {
      inFlightCache.delete(sourceUrl);
    }
  })();

  inFlightCache.set(sourceUrl, task);
  return task;
}

/**
 * Returns an HTMLCanvasElement containing ONLY the segmented foreground person
 * with smooth alpha transparency on the background pixels.
 */
export async function getForegroundPortraitCanvas(
  sourceUrl: string,
  img: HTMLImageElement,
  edgeFeather = 5
): Promise<HTMLCanvasElement> {
  const mask = await computePersonMask(sourceUrl, img);

  // Build an alpha mask canvas at mask resolution
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = mask.width;
  alphaCanvas.height = mask.height;
  const actx = alphaCanvas.getContext('2d');
  if (!actx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const alphaImg = actx.createImageData(mask.width, mask.height);
  const aData = alphaImg.data;

  // edgeFeather 0..10 controls cutoff tightness & soft transition band
  const bandHalf = 0.08 + (edgeFeather / 10) * 0.16; // 0.08 .. 0.24
  const center = 0.48;
  const low = center - bandHalf;
  const high = center + bandHalf;
  const span = Math.max(0.01, high - low);

  for (let i = 0; i < mask.personMask.length; i++) {
    const conf = mask.personMask[i];
    let alpha = 0;
    if (conf >= high) {
      alpha = 255;
    } else if (conf > low) {
      const t = (conf - low) / span;
      // Smoothstep for natural hair/shoulder edge blending
      const smooth = t * t * (3 - 2 * t);
      alpha = Math.round(smooth * 255);
    }
    const p = i * 4;
    aData[p] = 255;
    aData[p + 1] = 255;
    aData[p + 2] = 255;
    aData[p + 3] = alpha;
  }
  actx.putImageData(alphaImg, 0, 0);

  // Composite source image masked by smooth bilinear upscaled alpha mask
  const fgCanvas = document.createElement('canvas');
  const targetW = Math.min(img.naturalWidth, 1400);
  const scale = targetW / img.naturalWidth;
  const targetH = Math.round(img.naturalHeight * scale);
  fgCanvas.width = targetW;
  fgCanvas.height = targetH;

  const fctx = fgCanvas.getContext('2d');
  if (!fctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(alphaCanvas, 0, 0, targetW, targetH);
  fctx.globalCompositeOperation = 'source-in';
  fctx.drawImage(img, 0, 0, targetW, targetH);
  fctx.globalCompositeOperation = 'source-over';

  return fgCanvas;
}

export function clearMaskCacheForUrl(sourceUrl: string | null): void {
  if (sourceUrl) {
    maskCache.delete(sourceUrl);
  }
}
