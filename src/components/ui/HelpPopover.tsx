import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface HelpPopoverProps {
  title: string;
  children: ReactNode;
  align?: 'left' | 'right';
  label?: string;
  className?: string;
  dataTestId?: string;
}

/** Accessible progressive-disclosure help popover keeping instructional prose off main screens. */
export default function HelpPopover({
  title,
  children,
  align = 'right',
  label,
  className = '',
  dataTestId,
}: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex shrink-0 ${className}`} data-testid={dataTestId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen(current => !current)}
        title={title}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#11141a] px-2 text-[11.5px] font-medium text-[var(--forge-text-secondary)] hover:border-white/16 hover:text-[var(--forge-text-primary)] cursor-pointer transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        {label && <span>{label}</span>}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          className={`absolute top-full mt-1.5 z-[9990] w-[min(360px,calc(100vw-1rem))] rounded-lg border border-white/14 bg-[#11141a]/98 p-3 shadow-2xl backdrop-blur-md text-xs text-[var(--forge-text-secondary)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.06] pb-1.5">
            <span className="text-xs font-semibold text-[var(--forge-text-primary)]">{title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${title}`}
              className="rounded p-0.5 text-[var(--forge-text-muted)] hover:bg-white/5 hover:text-[var(--forge-text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 leading-relaxed">{children}</div>
        </div>
      )}
    </div>
  );
}
