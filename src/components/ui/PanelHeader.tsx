import type { ReactNode } from 'react';

export interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  dataTestId?: string;
}

/** Calm Concept A header row for tool drawers and secondary workspace panes. */
export default function PanelHeader({
  title,
  subtitle,
  icon,
  badge,
  actions,
  className = '',
  dataTestId,
}: PanelHeaderProps) {
  return (
    <div
      data-testid={dataTestId}
      className={`h-9 min-w-0 px-3 border-b border-white/[0.08] bg-[#141820] shrink-0 flex items-center justify-between gap-2 ${className}`}
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        {icon && <span className="shrink-0 flex items-center text-[var(--forge-accent-text)]">{icon}</span>}
        <span className="min-w-0 truncate text-xs font-semibold text-[var(--forge-text-primary)] leading-tight">
          {title}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
        {subtitle && (
          <span className="hidden sm:inline truncate text-[11px] text-[var(--forge-text-muted)]">
            {subtitle}
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}
