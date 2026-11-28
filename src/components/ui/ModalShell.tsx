import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalShellProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  maxWidthClass?: string;
  zIndexClass?: string;
  borderTone?: 'default' | 'emerald' | 'amber' | 'rose';
  dataTestId?: string;
  bodyClassName?: string;
  closeButtonTestId?: string;
  closeButtonAriaLabel?: string;
  closeButtonTitle?: string;
}

const BORDER_TONES: Record<NonNullable<ModalShellProps['borderTone']>, string> = {
  default: 'border-white/[0.12]',
  emerald: 'border-emerald-500/30',
  amber: 'border-amber-500/30',
  rose: 'border-rose-500/35',
};

/** Shared accessible Concept A dialog container for Studio overlays and workflows. */
export default function ModalShell({
  title,
  subtitle,
  icon,
  headerActions,
  footer,
  children,
  onClose,
  dismissible = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidthClass = 'max-w-[520px]',
  zIndexClass = 'z-[120]',
  borderTone = 'default',
  dataTestId,
  bodyClassName = 'min-h-0 flex-1 overflow-y-auto custom-scrollbar',
  closeButtonTestId,
  closeButtonAriaLabel = 'Close dialog',
  closeButtonTitle = 'Close',
}: ModalShellProps) {
  const titleId = useId();
  const subtitleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!dismissible || !closeOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismissible, closeOnEscape]);

  return (
    <div
      data-testid={dataTestId}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm`}
      onClick={() => {
        if (dismissible && closeOnBackdrop) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        onClick={event => event.stopPropagation()}
        className={`w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-[#11151d] border ${BORDER_TONES[borderTone]} text-slate-200 shadow-2xl`}
      >
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#141820] shrink-0 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            {icon && <span className="shrink-0 flex items-center">{icon}</span>}
            <div className="min-w-0">
              <h2 id={titleId} className="text-[13px] font-semibold text-slate-100 leading-tight truncate">
                {title}
              </h2>
              {subtitle && (
                <p id={subtitleId} className="mt-0.5 text-[11px] text-slate-400 leading-snug truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
            {dismissible && (
              <button
                type="button"
                data-testid={closeButtonTestId}
                aria-label={closeButtonAriaLabel}
                title={closeButtonTitle}
                onClick={onClose}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className={bodyClassName}>{children}</div>

        {footer && (
          <div className="px-4 py-3 border-t border-white/[0.08] bg-[#0d1118] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
