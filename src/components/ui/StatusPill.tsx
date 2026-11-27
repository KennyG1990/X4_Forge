import type { ReactNode } from 'react';

export type StatusPillTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface StatusPillProps {
  tone?: StatusPillTone;
  children: ReactNode;
  dot?: boolean;
  title?: string;
  className?: string;
  dataTestId?: string;
}

const TONE_CLASSES: Record<StatusPillTone, string> = {
  neutral: 'border-white/10 bg-white/[0.04] text-[#a0aab8]',
  info: 'border-blue-500/30 bg-blue-500/12 text-blue-300',
  success: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/12 text-amber-300',
  error: 'border-rose-500/35 bg-rose-500/12 text-rose-300',
};

const DOT_CLASSES: Record<StatusPillTone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-rose-400',
};

/** Compact semantic status pill with >=11px readable typography. */
export default function StatusPill({
  tone = 'neutral',
  children,
  dot = false,
  title,
  className = '',
  dataTestId,
}: StatusPillProps) {
  return (
    <span
      data-testid={dataTestId}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  );
}
