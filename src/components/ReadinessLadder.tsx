import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleDashed, Clock3, Eye, PackageCheck, Rocket, Route, ShieldAlert, UserCheck, X } from 'lucide-react';
import type { ReadinessOwner, ReadinessStage, ReadinessStageId, ReadinessStatus } from '../lib/readiness';

interface ReadinessLadderProps {
  stages: ReadinessStage[];
  onNavigate: (owner: ReadinessOwner, stage: ReadinessStageId) => void;
  onConfirmExperience: () => void;
  trailing?: React.ReactNode;
  popoverDirection?: 'down' | 'up';
  showLabels?: boolean;
}

const styles: Record<ReadinessStatus, string> = {
  pass: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/12 text-amber-300',
  fail: 'border-rose-500/35 bg-rose-500/12 text-rose-300',
  pending: 'border-white/[0.08] bg-white/[0.03] text-slate-300',
  stale: 'border-orange-500/30 bg-orange-500/12 text-orange-300',
  unavailable: 'border-white/[0.05] bg-black/25 text-slate-500',
};

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'pass') return <Check className="h-3 w-3 shrink-0" />;
  if (status === 'fail') return <ShieldAlert className="h-3 w-3 shrink-0" />;
  if (status === 'warning' || status === 'stale') return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (status === 'pending') return <Clock3 className="h-3 w-3 shrink-0" />;
  return <CircleDashed className="h-3 w-3 shrink-0" />;
}

const stageIcons: Record<ReadinessStageId, React.ReactNode> = {
  graph: <Route className="h-3 w-3 shrink-0 opacity-85" />,
  package: <PackageCheck className="h-3 w-3 shrink-0 opacity-85" />,
  deployed: <Rocket className="h-3 w-3 shrink-0 opacity-85" />,
  seen: <Eye className="h-3 w-3 shrink-0 opacity-85" />,
  experience: <UserCheck className="h-3 w-3 shrink-0 opacity-85" />,
};

export default function ReadinessLadder({
  stages,
  onNavigate,
  onConfirmExperience,
  trailing,
  popoverDirection = 'down',
  showLabels = false,
}: ReadinessLadderProps) {
  const [expanded, setExpanded] = useState<ReadinessStageId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = stages.find(stage => stage.id === expanded) ?? null;
  const deployed = stages.find(stage => stage.id === 'deployed');
  const canConfirm = deployed?.status === 'pass';

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setExpanded(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  const activate = (stage: ReadinessStage) => {
    setExpanded(current => current === stage.id ? null : stage.id);
    onNavigate(stage.owner, stage.id);
  };

  return (
    <section
      aria-label="Mod readiness"
      data-testid="readiness-ladder"
      className="relative flex items-center gap-1.5 select-none shrink-0"
    >
      <div ref={rootRef} className="relative flex items-center">
        <div className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-[#0a0c10] p-0.5">
          {stages.map(stage => (
            <button
              key={stage.id}
              type="button"
              data-testid={`readiness-stage-${stage.id}`}
              data-status={stage.status}
              onClick={() => activate(stage)}
              aria-label={`${stage.label}: ${stage.summary}`}
              title={`${stage.label}: ${stage.summary} — Click for evidence`}
              className={`h-[24px] rounded border px-1.5 inline-flex items-center gap-1 transition-colors cursor-pointer hover:border-blue-400/45 ${styles[stage.status]} ${expanded === stage.id ? 'ring-1 ring-blue-400/60' : ''}`}
            >
              {stageIcons[stage.id]}
              {showLabels && <span className="hidden md:inline text-[11px] font-medium">{stage.shortLabel}</span>}
              <StatusIcon status={stage.status} />
            </button>
          ))}
        </div>

        {active && (
          <div
            data-testid="readiness-evidence"
            className={`absolute right-0 ${popoverDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-[9990] w-[min(460px,calc(100vw-1rem))] rounded-lg border border-white/14 bg-[#11141a]/98 px-3 py-2 shadow-2xl backdrop-blur-md flex items-center gap-2 text-[11.5px] leading-snug text-slate-200`}
          >
            <span className="shrink-0 font-semibold text-blue-300">{active.label}</span>
            <span className="min-w-0 flex-1 truncate" title={active.evidence}>{active.evidence}</span>
            {active.id === 'experience' && canConfirm && (
              <button
                type="button"
                data-testid="readiness-confirm-experience"
                onClick={event => { event.stopPropagation(); onConfirmExperience(); }}
                className="shrink-0 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
              >
                I saw it and it worked
              </button>
            )}
            <span className="shrink-0 text-[11px] text-slate-400">open {active.owner}</span>
            <button
              type="button"
              aria-label="Close readiness evidence"
              onClick={() => setExpanded(null)}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0 flex items-center">{trailing}</div>}
    </section>
  );
}
