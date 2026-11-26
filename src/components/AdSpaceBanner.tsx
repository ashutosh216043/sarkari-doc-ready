interface AdSpaceBannerProps {
  position: 'top' | 'bottom';
}

export function AdSpaceBanner({ position }: AdSpaceBannerProps) {
  return (
    <aside
      aria-label={`Advertisement placeholder ${position}`}
      className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="flex min-h-[68px] sm:min-h-[84px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100/70 px-4 py-3 text-center">
        <span className="text-xs font-semibold tracking-wide text-slate-500">
          Ad Space
        </span>
        <span className="mt-0.5 text-[11px] text-slate-400">
          {position === 'top'
            ? 'Responsive Banner Slot (728×90 / 320×50)'
            : 'Footer Banner Slot (728×90 / Responsive)'}
        </span>
      </div>
    </aside>
  );
}
