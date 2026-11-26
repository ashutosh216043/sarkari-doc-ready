import {
  Archive,
  CheckCircle2,
  Circle,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdSpaceBanner } from './components/AdSpaceBanner';
import { DocumentCard } from './components/DocumentCard';
import { ExamPresetSelector } from './components/ExamPresetSelector';
import { Header } from './components/Header';
import { InteractiveCropper } from './components/InteractiveCropper';
import { SeoHelpSection } from './components/SeoHelpSection';
import { EXAM_PRESETS } from './data/examPresets';
import {
  CropState,
  DocumentSpec,
  DocumentWorkItem,
  EnhanceSettings,
  PhotoBgRemoveSettings,
  StampSettings,
} from './types/exam';
import { clearMaskCacheForUrl } from './utils/backgroundRemover';
import {
  createDocumentsZip,
  loadImageElement,
  processDocumentImage,
  triggerDownload,
} from './utils/imageProcessor';

function formatTodayDDMMYYYY(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function createInitialWorkItems(presetId: string): DocumentWorkItem[] {
  const preset = EXAM_PRESETS.find((p) => p.id === presetId) ?? EXAM_PRESETS[0];
  return preset.documents.map((spec) => ({
    spec: { ...spec },
    sourceFile: null,
    sourceUrl: null,
    sourceWidth: 0,
    sourceHeight: 0,
    crop: {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
    },
    stamp: {
      enabled: Boolean(spec.defaultStampEnabled),
      candidateName: '',
      dateOfPhoto: formatTodayDDMMYYYY(),
    },
    enhance: {
      enabled: Boolean(spec.defaultEnhanceEnabled),
      threshold: 168,
    },
    bgRemove: {
      enabled: false,
      bgColor: '#FFFFFF',
      edgeFeather: 5,
    },
    processed: null,
    isProcessing: false,
    error: null,
  }));
}

export default function App() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(EXAM_PRESETS[0].id);
  const [workItems, setWorkItems] = useState<DocumentWorkItem[]>(() =>
    createInitialWorkItems(EXAM_PRESETS[0].id)
  );
  const [activeDocId, setActiveDocId] = useState<string>(
    EXAM_PRESETS[0].documents[0].id
  );
  const [isZipping, setIsZipping] = useState(false);

  const selectedPreset = useMemo(
    () => EXAM_PRESETS.find((p) => p.id === selectedPresetId) ?? EXAM_PRESETS[0],
    [selectedPresetId]
  );

  const activeItem = useMemo(
    () => workItems.find((w) => w.spec.id === activeDocId) ?? workItems[0],
    [workItems, activeDocId]
  );

  const processTimersRef = useRef<Record<string, number>>({});
  const processVersionRef = useRef<Record<string, number>>({});
  const workItemsRef = useRef<DocumentWorkItem[]>(workItems);
  workItemsRef.current = workItems;

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(processTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      workItemsRef.current.forEach((item) => {
        if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
        if (item.processed?.objectUrl) URL.revokeObjectURL(item.processed.objectUrl);
      });
    };
  }, []);

  const scheduleProcessing = useCallback(
    (docId: string, delayMs = 150) => {
      if (processTimersRef.current[docId]) {
        window.clearTimeout(processTimersRef.current[docId]);
      }

      const nextVer = (processVersionRef.current[docId] ?? 0) + 1;
      processVersionRef.current[docId] = nextVer;

      setWorkItems((prev) =>
        prev.map((item) =>
          item.spec.id === docId && item.sourceUrl
            ? { ...item, isProcessing: true, error: null }
            : item
        )
      );

      processTimersRef.current[docId] = window.setTimeout(async () => {
        const currentItem = workItemsRef.current.find((w) => w.spec.id === docId);
        if (!currentItem || !currentItem.sourceUrl) return;

        try {
          const result = await processDocumentImage({
            sourceUrl: currentItem.sourceUrl,
            spec: currentItem.spec,
            examShortName: selectedPreset.shortName,
            crop: currentItem.crop,
            stamp: currentItem.stamp,
            enhance: currentItem.enhance,
            bgRemove: currentItem.bgRemove,
          });

          if (processVersionRef.current[docId] !== nextVer) {
            URL.revokeObjectURL(result.objectUrl);
            return;
          }

          setWorkItems((prev) =>
            prev.map((item) => {
              if (item.spec.id !== docId) return item;
              if (item.processed?.objectUrl) {
                URL.revokeObjectURL(item.processed.objectUrl);
              }
              return {
                ...item,
                processed: result,
                isProcessing: false,
                error: null,
              };
            })
          );
        } catch (err) {
          if (processVersionRef.current[docId] !== nextVer) return;
          setWorkItems((prev) =>
            prev.map((item) =>
              item.spec.id === docId
                ? {
                    ...item,
                    isProcessing: false,
                    error:
                      err instanceof Error
                        ? err.message
                        : 'Failed to process image in browser.',
                  }
                : item
            )
          );
        }
      }, delayMs);
    },
    [selectedPreset.shortName]
  );

  const handleSelectPreset = (presetId: string) => {
    if (presetId === selectedPresetId) return;

    // Revoke previous object URLs
    Object.values(processTimersRef.current).forEach((timerId) =>
      window.clearTimeout(timerId)
    );
    processTimersRef.current = {};
    workItems.forEach((item) => {
      if (item.sourceUrl) {
        clearMaskCacheForUrl(item.sourceUrl);
        URL.revokeObjectURL(item.sourceUrl);
      }
      if (item.processed?.objectUrl) URL.revokeObjectURL(item.processed.objectUrl);
    });

    const nextItems = createInitialWorkItems(presetId);
    setSelectedPresetId(presetId);
    setWorkItems(nextItems);
    setActiveDocId(nextItems[0].spec.id);
  };

  const handleUpdateActiveSpec = (patch: Partial<DocumentSpec>) => {
    const docId = activeItem.spec.id;
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, spec: { ...item.spec, ...patch } }
          : item
      )
    );
    if (activeItem.sourceUrl) {
      scheduleProcessing(docId, 200);
    }
  };

  const handleFileSelected = async (docId: string, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageElement(objectUrl);
      setWorkItems((prev) =>
        prev.map((item) => {
          if (item.spec.id !== docId) return item;
          if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
          if (item.processed?.objectUrl) URL.revokeObjectURL(item.processed.objectUrl);
          return {
            ...item,
            sourceFile: file,
            sourceUrl: objectUrl,
            sourceWidth: img.naturalWidth,
            sourceHeight: img.naturalHeight,
            crop: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
            processed: null,
            error: null,
          };
        })
      );
      scheduleProcessing(docId, 50);
    } catch {
      URL.revokeObjectURL(objectUrl);
      setWorkItems((prev) =>
        prev.map((item) =>
          item.spec.id === docId
            ? { ...item, error: 'Could not open image. Please choose a valid JPG, PNG, or WEBP.' }
            : item
        )
      );
    }
  };

  const handleRemoveFile = (docId: string) => {
    if (processTimersRef.current[docId]) {
      window.clearTimeout(processTimersRef.current[docId]);
    }
    setWorkItems((prev) =>
      prev.map((item) => {
        if (item.spec.id !== docId) return item;
        if (item.sourceUrl) {
          clearMaskCacheForUrl(item.sourceUrl);
          URL.revokeObjectURL(item.sourceUrl);
        }
        if (item.processed?.objectUrl) URL.revokeObjectURL(item.processed.objectUrl);
        return {
          ...item,
          sourceFile: null,
          sourceUrl: null,
          sourceWidth: 0,
          sourceHeight: 0,
          crop: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
          processed: null,
          isProcessing: false,
          error: null,
        };
      })
    );
  };

  const handleCropChange = (docId: string, patch: Partial<CropState>) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, crop: { ...item.crop, ...patch } }
          : item
      )
    );
    scheduleProcessing(docId, 160);
  };

  const handleResetCrop = (docId: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, crop: { zoom: 1, panX: 0, panY: 0, rotation: 0 } }
          : item
      )
    );
    scheduleProcessing(docId, 80);
  };

  const handleStampChange = (docId: string, patch: Partial<StampSettings>) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, stamp: { ...item.stamp, ...patch } }
          : item
      )
    );
    scheduleProcessing(docId, 200);
  };

  const handleEnhanceChange = (docId: string, patch: Partial<EnhanceSettings>) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, enhance: { ...item.enhance, ...patch } }
          : item
      )
    );
    scheduleProcessing(docId, 180);
  };

  const handleBgRemoveChange = (docId: string, patch: Partial<PhotoBgRemoveSettings>) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.spec.id === docId
          ? { ...item, bgRemove: { ...item.bgRemove, ...patch } }
          : item
      )
    );
    scheduleProcessing(docId, 200);
  };

  const readyItems = useMemo(
    () => workItems.filter((item) => item.processed !== null),
    [workItems]
  );

  const handleDownloadAllZip = async () => {
    if (readyItems.length === 0 || isZipping) return;
    setIsZipping(true);
    try {
      const files = readyItems.map((item) => ({
        fileName: item.processed!.fileName,
        blob: item.processed!.blob,
      }));
      const { zipBlob, zipName } = await createDocumentsZip(
        selectedPreset.shortName,
        files
      );
      triggerDownload(zipBlob, zipName);
    } finally {
      setIsZipping(false);
    }
  };

  const scrollToWorkspace = () => {
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div id="top" className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        readyCount={readyItems.length}
        onDownloadAllZip={handleDownloadAllZip}
        onScrollToWorkspace={scrollToWorkspace}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Ad Space Banner */}
        <AdSpaceBanner position="top" />

        {/* Hero & Prominent 100% Privacy Trust Badge */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h1
                className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                Indian Govt Exam Photo &amp; Signature Auto-Validator &amp; Resizer
              </h1>
              <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-slate-600">
                Crop, enhance phone-clicked signatures, add Name &amp; Date stamps, and compress images to exact SSC, IBPS, UPSC, and RRB KB limits directly inside your browser.
              </p>
            </div>

            {/* Prominent Privacy Trust Badge */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-4 lg:max-w-sm shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-blue-950">
                    <Lock className="h-3.5 w-3.5 text-blue-700 shrink-0" aria-hidden="true" />
                    <span>100% Safe &amp; Private</span>
                  </div>
                  <p className="mt-0.5 text-xs sm:text-sm font-medium text-blue-900">
                    Your photos never leave your device. Zero server uploads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Exam Preset Selector */}
        <ExamPresetSelector
          presets={EXAM_PRESETS}
          selectedPreset={selectedPreset}
          activeDocSpec={activeItem.spec}
          onSelectPreset={handleSelectPreset}
          onUpdateActiveSpec={handleUpdateActiveSpec}
        />

        {/* Workspace Section */}
        <section id="workspace" aria-label="Document editor and validation queue" className="space-y-4">
          {/* Document Switcher Strip (Great for Mobile One-Thumb Navigation) */}
          <div className="flex items-center justify-between gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
            <div className="flex items-center gap-1.5">
              {workItems.map((item) => {
                const isActive = item.spec.id === activeItem.spec.id;
                const isReady = Boolean(item.processed?.isValid);
                return (
                  <button
                    key={item.spec.id}
                    type="button"
                    onClick={() => setActiveDocId(item.spec.id)}
                    className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isReady ? (
                      <CheckCircle2
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-emerald-200' : 'text-emerald-600'
                        }`}
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? 'text-blue-200' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    <span>{item.spec.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center pr-2 font-mono text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap shrink-0">
              {readyItems.length} of {workItems.length} Ready
            </div>
          </div>

          {/* 2-Column Workspace Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left: Interactive Cropper & Image Controls */}
            <div className="lg:col-span-7">
              <InteractiveCropper
                item={activeItem}
                onFileSelected={(file) => handleFileSelected(activeItem.spec.id, file)}
                onCropChange={(patch) => handleCropChange(activeItem.spec.id, patch)}
                onResetCrop={() => handleResetCrop(activeItem.spec.id)}
                onStampChange={(patch) => handleStampChange(activeItem.spec.id, patch)}
                onEnhanceChange={(patch) => handleEnhanceChange(activeItem.spec.id, patch)}
                onBgRemoveChange={(patch) => handleBgRemoveChange(activeItem.spec.id, patch)}
              />
            </div>

            {/* Right: All Required Documents Queue + Real-time Validation + Download All ZIP */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                      {selectedPreset.shortName} Document Checklist
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {readyItems.length} of {workItems.length} documents processed
                    </p>
                  </div>
                </div>

                {/* Prominent Download All as ZIP Button */}
                <button
                  type="button"
                  disabled={readyItems.length === 0 || isZipping}
                  onClick={handleDownloadAllZip}
                  className={`mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors whitespace-nowrap ${
                    readyItems.length > 0
                      ? 'bg-blue-700 text-white hover:bg-blue-800 cursor-pointer shadow-xs'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    {isZipping
                      ? 'Packaging ZIP...'
                      : readyItems.length > 0
                        ? `Download All as ZIP (${readyItems.length} Ready)`
                        : 'Upload Documents to Download ZIP'}
                  </span>
                </button>
              </div>

              <div className="space-y-3">
                {workItems.map((item) => (
                  <DocumentCard
                    key={item.spec.id}
                    item={item}
                    isActive={item.spec.id === activeItem.spec.id}
                    onSelect={() => {
                      setActiveDocId(item.spec.id);
                      if (window.innerWidth < 1024) {
                        scrollToWorkspace();
                      }
                    }}
                    onDownload={() => {
                      if (item.processed) {
                        triggerDownload(item.processed.blob, item.processed.fileName);
                      }
                    }}
                    onRemove={() => handleRemoveFile(item.spec.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SEO & Help Section */}
        <SeoHelpSection />

        {/* Bottom Ad Space Banner */}
        <AdSpaceBanner position="bottom" />
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <p className="font-medium text-slate-700">
            SarkariDocReady · 100% Client-Side Photo &amp; Signature Validator
          </p>
          <p>
            Processed locally in your browser via HTML5 Canvas · No data uploaded or stored
          </p>
        </div>
      </footer>
    </div>
  );
}
