import JSZip from 'jszip';
import {
  CropState,
  DocumentSpec,
  EnhanceSettings,
  PhotoBgRemoveSettings,
  ProcessedResult,
  StampSettings,
} from '../types/exam';
import { getForegroundPortraitCanvas } from './backgroundRemover';

export function formatKB(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

export function buildReadyFileName(examShortName: string, docShortLabel: string): string {
  const cleanExam = examShortName
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const cleanDoc = docShortLabel
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleanExam}_${cleanDoc}_Ready.jpg`;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the selected image file.'));
    img.src = src;
  });
}

/**
 * Enhances photographed signatures / thumb impressions / declarations
 * by removing off-white paper shadows and darkening pen ink.
 */
function applySignatureEnhancer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const softBand = 38;
  const lowCut = Math.max(0, threshold - softBand);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum >= threshold) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else if (lum > lowCut) {
      const t = (lum - lowCut) / softBand;
      const eased = t * t;
      data[i] = Math.round(r * 0.45 + (255 - r * 0.45) * eased);
      data[i + 1] = Math.round(g * 0.45 + (255 - g * 0.45) * eased);
      data[i + 2] = Math.round(b * 0.45 + (255 - b * 0.45) * eased);
    } else {
      // Deepen ink strokes while keeping subtle natural ink hue
      const factor = Math.max(0.15, (lum / Math.max(1, lowCut)) * 0.55);
      data[i] = Math.round(r * factor);
      data[i + 1] = Math.round(g * factor);
      data[i + 2] = Math.round(b * factor);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draws a crisp white strip at the bottom of the photograph with bold black
 * Candidate Name and Date of Photo (DOP).
 */
function drawNameAndDateStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stamp: StampSettings
): void {
  const cleanName = stamp.candidateName.trim().toUpperCase();
  const cleanDate = stamp.dateOfPhoto.trim();
  if (!cleanName && !cleanDate) return;

  const hasBoth = Boolean(cleanName && cleanDate);
  const stripHeight = Math.max(
    hasBoth ? 38 : 24,
    Math.min(Math.round(height * (hasBoth ? 0.185 : 0.125)), 110)
  );
  const stripTop = height - stripHeight;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, stripTop, width, stripHeight);

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = Math.max(1, Math.round(width * 0.0025));
  ctx.beginPath();
  ctx.moveTo(0, stripTop);
  ctx.lineTo(width, stripTop);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const horizontalPadding = Math.max(6, Math.round(width * 0.05));
  const maxTextWidth = width - horizontalPadding * 2;

  const fitFontSize = (text: string, initialSize: number, minSize: number) => {
    let size = initialSize;
    while (size > minSize) {
      ctx.font = `700 ${size}px "Public Sans", Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxTextWidth) {
        return size;
      }
      size -= 0.5;
    }
    return minSize;
  };

  if (hasBoth) {
    const baseSize = Math.max(8, Math.round(stripHeight * 0.34));
    const nameSize = fitFontSize(cleanName, baseSize, 7);
    const dopText = `DOP: ${cleanDate}`;
    const dopSize = fitFontSize(dopText, Math.max(7.5, Math.round(baseSize * 0.92)), 7);

    ctx.font = `700 ${nameSize}px "Public Sans", Arial, sans-serif`;
    ctx.fillText(cleanName, width / 2, stripTop + stripHeight * 0.33, maxTextWidth);

    ctx.font = `700 ${dopSize}px "Public Sans", Arial, sans-serif`;
    ctx.fillText(dopText, width / 2, stripTop + stripHeight * 0.72, maxTextWidth);
  } else {
    const lineText = cleanName || `DOP: ${cleanDate}`;
    const baseSize = Math.max(8, Math.round(stripHeight * 0.52));
    const fontSize = fitFontSize(lineText, baseSize, 7);
    ctx.font = `700 ${fontSize}px "Public Sans", Arial, sans-serif`;
    ctx.fillText(lineText, width / 2, stripTop + stripHeight / 2, maxTextWidth);
  }

  ctx.restore();
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode JPEG image on canvas.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Inserts valid ISO/IEC 10918-1 JPEG Comment (0xFF 0xFE) segments directly
 * after the SOI marker (0xFF 0xD8) when a very small pixel target (e.g. 140x60)
 * naturally encodes below the portal's minimum KB requirement even at quality=1.0.
 */
async function padJpegToTargetBytes(blob: Blob, targetBytes: number): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const src = new Uint8Array(buffer);
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) {
    return blob;
  }

  const needed = targetBytes - src.length;
  if (needed <= 4) {
    return blob;
  }

  const chunks: Uint8Array[] = [];
  let remaining = needed;
  while (remaining > 0) {
    // Each COM segment adds (4 + payloadLen) bytes; max segment length field is 65535
    if (remaining <= 4) break;
    const payloadLen = Math.min(remaining - 4, 65500);
    const segment = new Uint8Array(4 + payloadLen);
    const lenField = payloadLen + 2;
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment[2] = (lenField >> 8) & 0xff;
    segment[3] = lenField & 0xff;
    // Fill payload with ASCII spaces (0x20)
    segment.fill(0x20, 4);
    chunks.push(segment);
    remaining -= segment.length;
  }

  const totalExtra = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(src.length + totalExtra);
  // SOI
  out.set(src.subarray(0, 2), 0);
  let cursor = 2;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  out.set(src.subarray(2), cursor);

  return new Blob([out], { type: 'image/jpeg' });
}

/**
 * Renders the cropped, enhanced, and stamped image onto an exact-dimension
 * HTML5 Canvas and runs a binary-search JPEG compression loop to satisfy
 * the exam's strict KB window.
 */
export async function processDocumentImage(params: {
  sourceUrl: string;
  spec: DocumentSpec;
  examShortName: string;
  crop: CropState;
  stamp: StampSettings;
  enhance: EnhanceSettings;
  bgRemove: PhotoBgRemoveSettings;
}): Promise<ProcessedResult> {
  const { sourceUrl, spec, examShortName, crop, stamp, enhance, bgRemove } = params;
  const img = await loadImageElement(sourceUrl);

  let drawSource: CanvasImageSource = img;
  if (spec.allowBgRemove && bgRemove.enabled) {
    drawSource = await getForegroundPortraitCanvas(
      sourceUrl,
      img,
      bgRemove.edgeFeather
    );
  }

  const outW = Math.max(10, Math.round(spec.widthPx));
  const outH = Math.max(10, Math.round(spec.heightPx));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(enhance.enabled) });
  if (!ctx) {
    throw new Error('HTML5 Canvas 2D context is unavailable in this browser.');
  }

  // Fill chosen background color (pure white by default, or selected studio backdrop)
  ctx.fillStyle =
    spec.allowBgRemove && bgRemove.enabled ? bgRemove.bgColor : '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const isQuarterTurn = crop.rotation === 90 || crop.rotation === 270;
  const rotW = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
  const rotH = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

  const baseScale = Math.max(outW / rotW, outH / rotH);
  const effectiveScale = baseScale * crop.zoom;

  const centerX = outW * (0.5 + crop.panX);
  const centerY = outH * (0.5 + crop.panY);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((crop.rotation * Math.PI) / 180);
  ctx.scale(effectiveScale, effectiveScale);
  ctx.drawImage(
    drawSource,
    -img.naturalWidth / 2,
    -img.naturalHeight / 2,
    img.naturalWidth,
    img.naturalHeight
  );
  ctx.restore();

  if (spec.allowEnhance && enhance.enabled) {
    applySignatureEnhancer(ctx, outW, outH, enhance.threshold);
  }

  if (spec.allowStamp && stamp.enabled) {
    drawNameAndDateStrip(ctx, outW, outH, stamp);
  }

  const minBytes = Math.max(1, spec.minKB) * 1024;
  const maxBytes = Math.max(spec.minKB + 1, spec.maxKB) * 1024;
  const targetBytes = minBytes + (maxBytes - minBytes) * 0.65;

  let chosenBlob = await canvasToJpegBlob(canvas, 0.94);
  let chosenQuality = 0.94;

  if (chosenBlob.size > maxBytes) {
    let low = 0.03;
    let high = 0.94;
    let bestInRange: { blob: Blob; quality: number; diff: number } | null = null;
    let bestUnderMax: { blob: Blob; quality: number } | null = null;
    let smallestSeen: { blob: Blob; quality: number } = { blob: chosenBlob, quality: 0.94 };

    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2;
      const candidate = await canvasToJpegBlob(canvas, mid);

      if (candidate.size < smallestSeen.blob.size) {
        smallestSeen = { blob: candidate, quality: mid };
      }

      if (candidate.size <= maxBytes) {
        if (!bestUnderMax || candidate.size > bestUnderMax.blob.size) {
          bestUnderMax = { blob: candidate, quality: mid };
        }
        if (candidate.size >= minBytes) {
          const diff = Math.abs(candidate.size - targetBytes);
          if (!bestInRange || diff < bestInRange.diff) {
            bestInRange = { blob: candidate, quality: mid, diff };
          }
        }
        low = mid;
      } else {
        high = mid;
      }
    }

    if (bestInRange) {
      chosenBlob = bestInRange.blob;
      chosenQuality = bestInRange.quality;
    } else if (bestUnderMax) {
      chosenBlob = bestUnderMax.blob;
      chosenQuality = bestUnderMax.quality;
    } else {
      chosenBlob = smallestSeen.blob;
      chosenQuality = smallestSeen.quality;
    }
  } else if (chosenBlob.size < minBytes) {
    const maxQBlob = await canvasToJpegBlob(canvas, 1.0);
    if (maxQBlob.size <= maxBytes && maxQBlob.size >= chosenBlob.size) {
      chosenBlob = maxQBlob;
      chosenQuality = 1.0;
    }
  }

  // If the encoded JPEG is still under minBytes (common on small 140x60 signatures),
  // pad safely with a standard JPEG COM segment so file size satisfies portal validation.
  if (chosenBlob.size < minBytes) {
    const padTarget = Math.round(minBytes + (maxBytes - minBytes) * 0.35);
    chosenBlob = await padJpegToTargetBytes(chosenBlob, padTarget);
  }

  const sizeBytes = chosenBlob.size;
  const sizeKB = Number((sizeBytes / 1024).toFixed(1));
  const isValid = sizeBytes >= minBytes && sizeBytes <= maxBytes;

  let statusMessage = `Valid: ${outW}×${outH}px | ${sizeKB.toFixed(1)} KB`;
  if (sizeBytes > maxBytes) {
    statusMessage = `Too large (${sizeKB.toFixed(1)} KB > ${spec.maxKB} KB). Simplify background or reduce dimensions.`;
  } else if (sizeBytes < minBytes) {
    statusMessage = `Below minimum (${sizeKB.toFixed(1)} KB < ${spec.minKB} KB).`;
  }

  const objectUrl = URL.createObjectURL(chosenBlob);
  const fileName = buildReadyFileName(examShortName, spec.shortLabel);

  return {
    blob: chosenBlob,
    objectUrl,
    widthPx: outW,
    heightPx: outH,
    sizeBytes,
    sizeKB,
    qualityUsed: Math.round(chosenQuality * 100),
    isValid,
    statusMessage,
    fileName,
  };
}

export async function createDocumentsZip(
  examShortName: string,
  items: { fileName: string; blob: Blob }[]
): Promise<{ zipBlob: Blob; zipName: string }> {
  const zip = new JSZip();
  for (const item of items) {
    zip.file(item.fileName, item.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const cleanExam = examShortName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return {
    zipBlob,
    zipName: `SarkariDocReady_${cleanExam}_Documents.zip`,
  };
}

export function triggerDownload(blobOrUrl: Blob | string, fileName: string): void {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof blobOrUrl !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
