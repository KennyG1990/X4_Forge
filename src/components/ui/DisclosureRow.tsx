import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { StatusPillTone } from './StatusPill';

export interface DisclosureRowProps {
  summary: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  tone?: StatusPillTone;
  onClick?: () => void;
  className?: string;
  dataTestId?: string;
}

const DOT_TONES: Record<StatusPillTone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
};

/** Single-line summary row that expands detail content on click to eliminate text walls. */
export default function DisclosureRow({
  summary,
  meta,
  children,
  defaultOpen = false,
  tone = 'neutral',
  onClick,
  className = '',
  dataTestId,
}: DisclosureRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = Boolean(children);

  return (
    <div
      data-testid={dataTestId}
      className={`rounded-md border border-white/[0.07] bg-[#0d1016] transition-colors ${className}`}
    >
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        onClick={() => {
          if (expandable) setOpen(current => !current);
          onClick?.();
        }}
        className="w-full px-2.5 py-2 flex items-center gap-2 text-left text-xs text-[var(--forge-text-primary)] hover:bg-white/[0.03] cursor-pointer"
      >
        {expandable && (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-[var(--forge-text-muted)] transition-transform ${open ? 'rotate-90' : ''}`}
          />
        )}
        <span aria-hidden="true" className={`h-2 w-2 rounded-full shrink-0 ${DOT_TONES[tone]}`} />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {meta && <span className="shrink-0 text-[11px] text-[var(--forge-text-muted)]">{meta}</span>}
      </button>
      {expandable && open && (
        <div className="border-t border-white/[0.06] px-3 py-2 text-xs text-[var(--forge-text-secondary)]">
          {children}
        </div>
      )}
    </div>
  );
}
