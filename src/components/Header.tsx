import { Download } from 'lucide-react';

interface HeaderProps {
  readyCount: number;
  onDownloadAllZip: () => void;
  onScrollToWorkspace: () => void;
}

export function Header({
  readyCount,
  onDownloadAllZip,
  onScrollToWorkspace,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-blue-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 rounded"
        >
          SarkariDocReady
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#exam-presets"
            className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Exam Presets
          </a>
          <a
            href="#workspace"
            className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Crop &amp; Resize
          </a>
          <a
            href="#rejection-guide"
            className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Rejection Guide
          </a>
          <a
            href="#faq"
            className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            FAQs
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          {readyCount > 0 ? (
            <button
              type="button"
              onClick={onDownloadAllZip}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">Download ZIP ({readyCount})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onScrollToWorkspace}
              className="inline-flex min-h-[40px] items-center rounded-lg bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Resizing
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
