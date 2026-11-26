import { Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DimensionUnit, DocumentSpec, ExamPreset } from '../types/exam';

interface ExamPresetSelectorProps {
  presets: ExamPreset[];
  selectedPreset: ExamPreset;
  activeDocSpec: DocumentSpec;
  onSelectPreset: (presetId: string) => void;
  onUpdateActiveSpec: (patch: Partial<DocumentSpec>) => void;
}

const CM_TO_PX_300DPI = 118.110236; // 300 / 2.54

export function ExamPresetSelector({
  presets,
  selectedPreset,
  activeDocSpec,
  onSelectPreset,
  onUpdateActiveSpec,
}: ExamPresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState<DimensionUnit>('px');
  const [dpi, setDpi] = useState<number>(300);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [presets, query]);

  const pxPerCm = (dpi / 2.54) || CM_TO_PX_300DPI;

  const displayedWidth =
    unit === 'px'
      ? String(activeDocSpec.widthPx)
      : (activeDocSpec.widthPx / pxPerCm).toFixed(2);
  const displayedHeight =
    unit === 'px'
      ? String(activeDocSpec.heightPx)
      : (activeDocSpec.heightPx / pxPerCm).toFixed(2);

  const handleDimensionChange = (axis: 'width' | 'height', rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed) || parsed <= 0) return;

    const pxValue =
      unit === 'px'
        ? Math.min(3000, Math.max(40, Math.round(parsed)))
        : Math.min(3000, Math.max(40, Math.round(parsed * pxPerCm)));

    const nextW = axis === 'width' ? pxValue : activeDocSpec.widthPx;
    const nextH = axis === 'height' ? pxValue : activeDocSpec.heightPx;

    onUpdateActiveSpec({
      widthPx: nextW,
      heightPx: nextH,
      physicalLabel:
        unit === 'cm'
          ? `${(nextW / pxPerCm).toFixed(1)}cm × ${(nextH / pxPerCm).toFixed(1)}cm`
          : `${nextW} × ${nextH} px`,
    });
  };

  return (
    <section
      id="exam-presets"
      aria-label="Exam preset selector"
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="exam-preset-trigger"
            className="block text-sm font-semibold text-slate-900"
          >
            1. Select Government Exam Preset
          </label>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Auto-loads exact dimensions, KB range, format, and verification rules.
          </p>

          <div ref={containerRef} className="relative mt-3 max-w-2xl">
            <button
              id="exam-preset-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((prev) => !prev)}
              className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left transition-colors hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm sm:text-base font-semibold text-slate-900">
                  {selectedPreset.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {selectedPreset.category} · {selectedPreset.documents.length}{' '}
                  {selectedPreset.documents.length === 1 ? 'document' : 'documents'}
                </div>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-150 ${
                  isOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div
                role="listbox"
                aria-label="Exam presets"
                className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                <div className="border-b border-slate-100 p-2.5">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search SSC, IBPS, SBI, UPSC, RRB, Custom..."
                      aria-label="Search exam presets"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto py-1">
                  {filteredPresets.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">
                      No matching exam found. Try &ldquo;Custom Size Mode&rdquo; for any custom portal.
                    </div>
                  ) : (
                    filteredPresets.map((preset) => {
                      const isSelected = preset.id === selectedPreset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            onSelectPreset(preset.id);
                            setIsOpen(false);
                          }}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50/80 text-blue-950'
                              : 'hover:bg-slate-50 text-slate-900'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{preset.name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {preset.description}
                            </div>
                          </div>
                          {isSelected && (
                            <Check
                              className="mt-0.5 h-4 w-4 shrink-0 text-blue-700"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Preset Switcher Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          {presets.map((preset) => {
            const active = preset.id === selectedPreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.shortName}
              </button>
            );
          })}
        </div>
      </div>

      {/* UPSC Square Resolution Control */}
      {activeDocSpec.scalableRangePx && !selectedPreset.isCustom && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <SlidersHorizontal className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
              <span>
                UPSC Square Resolution ({activeDocSpec.shortLabel}):{' '}
                <strong className="font-mono tabular-nums text-blue-800">
                  {activeDocSpec.widthPx} × {activeDocSpec.heightPx} px
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-3 sm:w-72">
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {activeDocSpec.scalableRangePx.min}px
              </span>
              <input
                type="range"
                aria-label="UPSC square pixel dimension"
                min={activeDocSpec.scalableRangePx.min}
                max={activeDocSpec.scalableRangePx.max}
                step={activeDocSpec.scalableRangePx.step}
                value={activeDocSpec.widthPx}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateActiveSpec({ widthPx: val, heightPx: val });
                }}
                className="h-2 w-full cursor-pointer accent-blue-700"
              />
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {activeDocSpec.scalableRangePx.max}px
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Size Mode Controls */}
      {selectedPreset.isCustom && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <SlidersHorizontal className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
              <span>Custom Settings for {activeDocSpec.shortLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Unit:</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setUnit('px')}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    unit === 'px'
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pixels (px)
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('cm')}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    unit === 'cm'
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Centimeters (cm)
                </button>
              </div>
              {unit === 'cm' && (
                <select
                  aria-label="Conversion DPI"
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value))}
                  className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-mono text-slate-700"
                >
                  <option value={200}>200 DPI</option>
                  <option value={300}>300 DPI</option>
                </select>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label
                htmlFor="custom-width"
                className="block text-xs font-medium text-slate-600"
              >
                Width ({unit})
              </label>
              <input
                id="custom-width"
                type="number"
                step={unit === 'cm' ? '0.1' : '1'}
                min={unit === 'cm' ? '0.5' : '40'}
                max={unit === 'cm' ? '25' : '3000'}
                value={displayedWidth}
                onChange={(e) => handleDimensionChange('width', e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="custom-height"
                className="block text-xs font-medium text-slate-600"
              >
                Height ({unit})
              </label>
              <input
                id="custom-height"
                type="number"
                step={unit === 'cm' ? '0.1' : '1'}
                min={unit === 'cm' ? '0.5' : '40'}
                max={unit === 'cm' ? '25' : '3000'}
                value={displayedHeight}
                onChange={(e) => handleDimensionChange('height', e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="custom-min-kb"
                className="block text-xs font-medium text-slate-600"
              >
                Min Size (KB)
              </label>
              <input
                id="custom-min-kb"
                type="number"
                min={2}
                max={Math.max(5, activeDocSpec.maxKB - 1)}
                value={activeDocSpec.minKB}
                onChange={(e) => {
                  const val = Math.max(2, Math.min(Number(e.target.value) || 2, activeDocSpec.maxKB - 1));
                  onUpdateActiveSpec({ minKB: val });
                }}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="custom-max-kb"
                className="block text-xs font-medium text-slate-600"
              >
                Max Size (KB)
              </label>
              <input
                id="custom-max-kb"
                type="number"
                min={activeDocSpec.minKB + 1}
                max={2000}
                value={activeDocSpec.maxKB}
                onChange={(e) => {
                  const val = Math.max(activeDocSpec.minKB + 1, Math.min(Number(e.target.value) || 50, 2000));
                  onUpdateActiveSpec({ maxKB: val });
                }}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <p className="mt-2 font-mono text-xs text-slate-500 tabular-nums">
            Target Output: {activeDocSpec.widthPx} × {activeDocSpec.heightPx} px · {activeDocSpec.minKB}–{activeDocSpec.maxKB} KB · JPG
          </p>
        </div>
      )}
    </section>
  );
}
