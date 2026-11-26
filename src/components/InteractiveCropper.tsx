import {
  Calendar,
  Eraser,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Move,
  RotateCw,
  RotateCcw,
  Sparkles,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  CropState,
  DocumentWorkItem,
  EnhanceSettings,
  PhotoBgRemoveSettings,
  StampSettings,
} from '../types/exam';
import { getForegroundPortraitCanvas } from '../utils/backgroundRemover';
import { loadImageElement } from '../utils/imageProcessor';

interface InteractiveCropperProps {
  item: DocumentWorkItem;
  onFileSelected: (file: File) => void;
  onCropChange: (patch: Partial<CropState>) => void;
  onResetCrop: () => void;
  onStampChange: (patch: Partial<StampSettings>) => void;
  onEnhanceChange: (patch: Partial<EnhanceSettings>) => void;
  onBgRemoveChange: (patch: Partial<PhotoBgRemoveSettings>) => void;
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PHOTO_BG_SWATCHES = [
  { label: 'Pure White', color: '#FFFFFF' },
  { label: 'Off-White', color: '#F4F6F9' },
  { label: 'Light Blue', color: '#E3F2FD' },
  { label: 'Studio Blue', color: '#DBEAFE' },
];

function formatTodayDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function InteractiveCropper({
  item,
  onFileSelected,
  onCropChange,
  onResetCrop,
  onStampChange,
  onEnhanceChange,
  onBgRemoveChange,
}: InteractiveCropperProps) {
  const { spec, sourceUrl, crop, stamp, enhance, bgRemove } = item;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [isSegmentingBg, setIsSegmentingBg] = useState(false);

  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanX: number;
    startPanY: number;
    rectW: number;
    rectH: number;
  } | null>(null);

  // Compute preview canvas resolution keeping exact aspect ratio up to 520px max side
  const maxPreviewDim = 520;
  const aspect = spec.widthPx / spec.heightPx;
  const previewW =
    aspect >= 1 ? maxPreviewDim : Math.max(180, Math.round(maxPreviewDim * aspect));
  const previewH =
    aspect >= 1 ? Math.max(140, Math.round(maxPreviewDim / aspect)) : maxPreviewDim;

  // Load HTMLImageElement whenever sourceUrl changes
  useEffect(() => {
    let active = true;
    fgCanvasRef.current = null;
    if (!sourceUrl) {
      loadedImgRef.current = null;
      return;
    }
    loadImageElement(sourceUrl)
      .then((img) => {
        if (!active) return;
        loadedImgRef.current = img;
        drawPreview();
      })
      .catch(() => {
        if (active) setUploadError('Unable to read image. Please upload a valid JPG, PNG, or WEBP.');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl]);

  // Compute segmented foreground portrait whenever background removal is enabled
  useEffect(() => {
    let active = true;
    if (!sourceUrl || !spec.allowBgRemove || !bgRemove.enabled) {
      fgCanvasRef.current = null;
      setIsSegmentingBg(false);
      drawPreview();
      return;
    }

    const prepareMask = async () => {
      setIsSegmentingBg(true);
      try {
        const img = loadedImgRef.current ?? (await loadImageElement(sourceUrl));
        if (!active) return;
        loadedImgRef.current = img;
        const fg = await getForegroundPortraitCanvas(
          sourceUrl,
          img,
          bgRemove.edgeFeather
        );
        if (!active) return;
        fgCanvasRef.current = fg;
        drawPreview();
      } catch {
        if (active) fgCanvasRef.current = null;
      } finally {
        if (active) setIsSegmentingBg(false);
      }
    };

    prepareMask();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, spec.allowBgRemove, bgRemove.enabled, bgRemove.edgeFeather]);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    const img = loadedImgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(enhance.enabled) });
    if (!ctx) return;

    canvas.width = previewW;
    canvas.height = previewH;

    const useBgRemove = Boolean(spec.allowBgRemove && bgRemove.enabled && fgCanvasRef.current);
    ctx.fillStyle = useBgRemove ? bgRemove.bgColor : '#FFFFFF';
    ctx.fillRect(0, 0, previewW, previewH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const isQuarterTurn = crop.rotation === 90 || crop.rotation === 270;
    const rotW = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
    const rotH = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

    const baseScale = Math.max(previewW / rotW, previewH / rotH);
    const effectiveScale = baseScale * crop.zoom;

    const centerX = previewW * (0.5 + crop.panX);
    const centerY = previewH * (0.5 + crop.panY);

    const drawSource: CanvasImageSource = useBgRemove ? fgCanvasRef.current! : img;

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
      const imageData = ctx.getImageData(0, 0, previewW, previewH);
      const data = imageData.data;
      const threshold = enhance.threshold;
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
          const factor = Math.max(0.15, (lum / Math.max(1, lowCut)) * 0.55);
          data[i] = Math.round(r * factor);
          data[i + 1] = Math.round(g * factor);
          data[i + 2] = Math.round(b * factor);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    if (spec.allowStamp && stamp.enabled) {
      const cleanName = stamp.candidateName.trim().toUpperCase();
      const cleanDate = stamp.dateOfPhoto.trim();
      if (cleanName || cleanDate) {
        const hasBoth = Boolean(cleanName && cleanDate);
        const stripHeight = Math.max(
          hasBoth ? 42 : 26,
          Math.min(Math.round(previewH * (hasBoth ? 0.185 : 0.125)), 120)
        );
        const stripTop = previewH - stripHeight;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, stripTop, previewW, stripHeight);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, stripTop);
        ctx.lineTo(previewW, stripTop);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const pad = Math.max(8, Math.round(previewW * 0.05));
        const maxW = previewW - pad * 2;

        const fitSize = (txt: string, start: number, min: number) => {
          let s = start;
          while (s > min) {
            ctx.font = `700 ${s}px "Public Sans", Arial, sans-serif`;
            if (ctx.measureText(txt).width <= maxW) return s;
            s -= 0.5;
          }
          return min;
        };

        if (hasBoth) {
          const base = Math.max(10, Math.round(stripHeight * 0.34));
          const nSize = fitSize(cleanName, base, 8);
          const dopTxt = `DOP: ${cleanDate}`;
          const dSize = fitSize(dopTxt, Math.max(9, Math.round(base * 0.92)), 8);
          ctx.font = `700 ${nSize}px "Public Sans", Arial, sans-serif`;
          ctx.fillText(cleanName, previewW / 2, stripTop + stripHeight * 0.33, maxW);
          ctx.font = `700 ${dSize}px "Public Sans", Arial, sans-serif`;
          ctx.fillText(dopTxt, previewW / 2, stripTop + stripHeight * 0.72, maxW);
        } else {
          const txt = cleanName || `DOP: ${cleanDate}`;
          const fSize = fitSize(txt, Math.max(10, Math.round(stripHeight * 0.52)), 8);
          ctx.font = `700 ${fSize}px "Public Sans", Arial, sans-serif`;
          ctx.fillText(txt, previewW / 2, stripTop + stripHeight / 2, maxW);
        }
        ctx.restore();
      }
    }
  };

  useEffect(() => {
    drawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, stamp, enhance, bgRemove, previewW, previewH, spec.allowEnhance, spec.allowStamp, spec.allowBgRemove]);

  const validateAndAcceptFile = (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const isImageMime =
      ACCEPTED_TYPES.has(file.type) ||
      /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!isImageMime) {
      setUploadError('Unsupported format. Please choose a JPG, PNG, or WEBP image.');
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    validateAndAcceptFile(file);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sourceUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startPanX: crop.panX,
      startPanY: crop.panY,
      rectW: Math.max(1, rect.width),
      rectH: Math.max(1, rect.height),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const { clientX, clientY, startPanX, startPanY, rectW, rectH } = panStartRef.current;
    const dx = (e.clientX - clientX) / rectW;
    const dy = (e.clientY - clientY) / rectH;

    const maxOffset = Math.max(0.45, crop.zoom * 0.45);
    const nextPanX = Math.max(-maxOffset, Math.min(maxOffset, startPanX + dx));
    const nextPanY = Math.max(-maxOffset, Math.min(maxOffset, startPanY + dy));
    onCropChange({ panX: nextPanX, panY: nextPanY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
      setIsPanning(false);
      panStartRef.current = null;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
            {spec.label}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
            Target: {spec.widthPx}×{spec.heightPx}px · {spec.minKB}–{spec.maxKB} KB · JPG
            {spec.physicalLabel ? ` · ${spec.physicalLabel}` : ''}
          </p>
        </div>

        {sourceUrl && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGuide((g) => !g)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              {showGuide ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{showGuide ? 'Hide Guide' : 'Show Guide'}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Change File</span>
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`Upload ${spec.label}`}
        onChange={(e) => {
          validateAndAcceptFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {uploadError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-medium text-red-800"
        >
          {uploadError}
        </div>
      )}

      {!sourceUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`mt-5 flex min-h-[280px] sm:min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            isDraggingFile
              ? 'border-blue-600 bg-blue-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-blue-50/40'
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Upload className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mt-4 font-display text-base font-bold text-slate-900">
            Upload {spec.shortLabel}
          </p>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-600">
            Drag and drop your image here, or tap to pick from your phone gallery or computer.
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">
            Supports JPG, PNG, WEBP · Processed 100% locally on your device
          </p>
          <span className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            <span>Select Image File</span>
          </span>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* Interactive Pan & Zoom Viewport */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-100/90 p-4 sm:p-6">
            <div
              className="relative overflow-hidden rounded-lg border-2 border-blue-700 bg-white shadow-sm"
              style={{
                width: '100%',
                maxWidth: aspect >= 1.4 ? '480px' : aspect <= 0.8 ? '280px' : '340px',
                aspectRatio: `${spec.widthPx} / ${spec.heightPx}`,
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
                className={`h-full w-full block ${
                  isPanning ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              />

              {/* Subtle Alignment Guide Overlay */}
              {showGuide && (
                <div className="pointer-events-none absolute inset-0">
                  {spec.type === 'photo' ? (
                    <svg
                      viewBox="0 0 100 125"
                      preserveAspectRatio="none"
                      className="h-full w-full"
                    >
                      <ellipse
                        cx="50"
                        cy="46"
                        rx="26"
                        ry="33"
                        fill="none"
                        stroke="rgba(29, 78, 216, 0.55)"
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                      />
                      <line
                        x1="20"
                        y1="44"
                        x2="80"
                        y2="44"
                        stroke="rgba(29, 78, 216, 0.35)"
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                      />
                    </svg>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-3">
                      <div className="h-full w-full rounded border border-dashed border-blue-600/45" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
              <Move className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
              <span>Drag inside the blue frame to position · Use slider to zoom</span>
            </div>
          </div>

          {/* Cropper Toolbar: Zoom, Rotate, Reset */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() =>
                    onCropChange({ zoom: Math.max(0.8, Number((crop.zoom - 0.1).toFixed(2))) })
                  }
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="flex-1 px-1">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1">
                    <span>Zoom</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {crop.zoom.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Zoom level"
                    min={0.8}
                    max={4}
                    step={0.05}
                    value={crop.zoom}
                    onChange={(e) => onCropChange({ zoom: Number(e.target.value) })}
                    className="h-2 w-full cursor-pointer accent-blue-700"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() =>
                    onCropChange({ zoom: Math.min(4, Number((crop.zoom + 0.1).toFixed(2))) })
                  }
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onCropChange({
                      rotation: ((crop.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    })
                  }
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  <span>Rotate 90°</span>
                </button>
                <button
                  type="button"
                  onClick={onResetCrop}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Photo Background Remover & Plain Backdrop Replacer */}
          {spec.allowBgRemove && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Eraser className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Remove &amp; Replace Photo Background
                    </div>
                    <p className="text-xs text-slate-600">
                      Automatically removes room or outdoor backgrounds and replaces them with plain white or light-blue studio backdrop — 100% locally in your browser.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={bgRemove.enabled}
                  aria-label="Toggle Photo Background Remover"
                  onClick={() => onBgRemoveChange({ enabled: !bgRemove.enabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    bgRemove.enabled ? 'bg-blue-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                      bgRemove.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isSegmentingBg && (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-blue-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                  <span>Removing background locally on your device...</span>
                </div>
              )}

              {bgRemove.enabled && (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  <div>
                    <span className="block text-xs font-semibold text-slate-700">
                      Backdrop Color
                    </span>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PHOTO_BG_SWATCHES.map((swatch) => {
                        const selected =
                          bgRemove.bgColor.toUpperCase() === swatch.color.toUpperCase();
                        return (
                          <button
                            key={swatch.color}
                            type="button"
                            onClick={() => onBgRemoveChange({ bgColor: swatch.color })}
                            className={`flex min-h-[42px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                              selected
                                ? 'border-blue-700 bg-blue-50/70 text-blue-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className="h-4 w-4 shrink-0 rounded border border-slate-300"
                              style={{ backgroundColor: swatch.color }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{swatch.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                      <span>Edge Smoothness</span>
                      <span className="font-mono tabular-nums text-blue-800">
                        {bgRemove.edgeFeather}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Background edge smoothness"
                      min={0}
                      max={10}
                      step={1}
                      value={bgRemove.edgeFeather}
                      onChange={(e) =>
                        onBgRemoveChange({ edgeFeather: Number(e.target.value) })
                      }
                      className="mt-1.5 h-2 w-full cursor-pointer accent-blue-700"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                      <span>Sharp Cutout</span>
                      <span>Soft Blend</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto Date & Name Stamp Toggle (For Photo) */}
          {spec.allowStamp && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Type className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Add Candidate Name &amp; Date Stamp (DOP)
                    </div>
                    <p className="text-xs text-slate-600">
                      Draws a crisp white strip with bold black Name &amp; Date of Photo at the bottom edge (ideal for UPSC/SSC).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={stamp.enabled}
                  aria-label="Toggle Candidate Name and Date Stamp"
                  onClick={() => onStampChange({ enabled: !stamp.enabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    stamp.enabled ? 'bg-blue-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                      stamp.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {stamp.enabled && (
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="stamp-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Candidate Name
                    </label>
                    <input
                      id="stamp-name"
                      type="text"
                      value={stamp.candidateName}
                      onChange={(e) => onStampChange({ candidateName: e.target.value })}
                      placeholder="e.g. RAHUL SHARMA"
                      className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="stamp-dop"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Date of Photo (DOP)
                      </label>
                      <button
                        type="button"
                        onClick={() => onStampChange({ dateOfPhoto: formatTodayDDMMYYYY() })}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                      >
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        <span>Use Today</span>
                      </button>
                    </div>
                    <input
                      id="stamp-dop"
                      type="text"
                      value={stamp.dateOfPhoto}
                      onChange={(e) => onStampChange({ dateOfPhoto: e.target.value })}
                      placeholder="DD-MM-YYYY"
                      className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Signature / Thumb / Declaration Enhancer */}
          {spec.allowEnhance && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Make Background Pure White &amp; Ink Dark
                    </div>
                    <p className="text-xs text-slate-600">
                      Removes phone camera paper shadows and deepens pen ink for clean scanner-like output.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enhance.enabled}
                  aria-label="Toggle Make Background Pure White and Ink Dark"
                  onClick={() => onEnhanceChange({ enabled: !enhance.enabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    enhance.enabled ? 'bg-blue-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                      enhance.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {enhance.enabled && (
                <div className="mt-4 border-t border-slate-100 pt-3.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                    <span>Paper Whiteness Sensitivity</span>
                    <span className="font-mono tabular-nums text-blue-800">
                      {enhance.threshold}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Paper whiteness threshold"
                    min={110}
                    max={220}
                    step={2}
                    value={enhance.threshold}
                    onChange={(e) => onEnhanceChange({ threshold: Number(e.target.value) })}
                    className="mt-1.5 h-2 w-full cursor-pointer accent-blue-700"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>More Dark Ink</span>
                    <span>Whiter Paper</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
