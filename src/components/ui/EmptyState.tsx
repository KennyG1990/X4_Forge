import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  dataTestId?: string;
}

/** Calm centered empty-state container supporting optional starter cards or CTAs. */
export default function EmptyState({
  title,
  description,
  icon,
  children,
  className = '',
  dataTestId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={dataTestId}
      className={`h-full w-full flex flex-col items-center justify-center p-6 text-center ${className}`}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-[#11141a] text-[var(--forge-text-secondary)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--forge-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--forge-text-secondary)]">
          {description}
        </p>
      )}
      {children && <div className="mt-5 w-full max-w-xl">{children}</div>}
    </div>
  );
}
