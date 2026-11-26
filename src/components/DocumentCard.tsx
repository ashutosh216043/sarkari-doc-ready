import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crop,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import { DocumentWorkItem } from '../types/exam';

interface DocumentCardProps {
  item: DocumentWorkItem;
  isActive: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onRemove: () => void;
}

export function DocumentCard({
  item,
  isActive,
  onSelect,
  onDownload,
  onRemove,
}: DocumentCardProps) {
  const { spec, processed, isProcessing, sourceUrl, error } = item;

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        isActive
          ? 'border-blue-600 bg-blue-50/35'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onSelect}
            className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 rounded cursor-pointer"
          >
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
              {spec.label}
            </h3>
          </button>
          <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
            {spec.widthPx}×{spec.heightPx}px · {spec.minKB}–{spec.maxKB} KB · {spec.format}
          </p>
        </div>

        {sourceUrl && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove uploaded ${spec.label}`}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Real-time Validation Status Line (Icon + Explicit Text) */}
      <div className="mt-3">
        {isProcessing ? (
          <div className="flex items-center gap-2 text-xs font-medium text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            <span>Compressing to exact KB range...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs font-medium text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : processed ? (
          <div
            className={`flex items-start gap-2 text-xs font-semibold tabular-nums ${
              processed.isValid ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {processed.isValid ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{processed.statusMessage}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Pending upload · Tap Edit to add file</span>
          </div>
        )}
      </div>

      {/* Processed Output Preview */}
      {processed && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
            <img
              src={processed.objectUrl}
              alt={`Processed ${spec.label}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-semibold text-slate-800">
              {processed.fileName}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
              {processed.widthPx}×{processed.heightPx}px · {processed.sizeKB.toFixed(1)} KB
            </p>
          </div>
        </div>
      )}

      {/* Exam Rules Checklist */}
      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {spec.rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2 text-xs text-slate-600">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            isActive
              ? 'bg-blue-100 text-blue-900'
              : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Crop className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{sourceUrl ? (isActive ? 'Editing Now' : 'Edit / Crop') : 'Upload & Crop'}</span>
        </button>

        {processed && (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Download JPG</span>
          </button>
        )}
      </div>
    </div>
  );
}
