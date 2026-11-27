import type { ReactNode } from 'react';

export interface CompactCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dataTestId?: string;
}

/** Calm Concept A card surface with hairline border and title-case header. */
export default function CompactCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  dataTestId,
}: CompactCardProps) {
  return (
    <section
      data-testid={dataTestId}
      className={`rounded-lg border border-white/[0.08] bg-[#11141a] p-3.5 ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="truncate text-[13px] font-semibold text-[var(--forge-text-primary)] leading-snug">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11.5px] text-[var(--forge-text-muted)] leading-snug">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
