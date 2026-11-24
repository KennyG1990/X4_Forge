import React, { useState } from 'react';
import { AlertTriangle, Check, ChevronRight, CircleDashed, Clock3, Eye, PackageCheck, Rocket, Route, ShieldAlert, UserCheck } from 'lucide-react';
import type { ReadinessOwner, ReadinessStage, ReadinessStageId, ReadinessStatus } from '../lib/readiness';

interface ReadinessLadderProps {
  stages: ReadinessStage[];
  onNavigate: (owner: ReadinessOwner, stage: ReadinessStageId) => void;
  onConfirmExperience: () => void;
  trailing?: React.ReactNode;
}

const styles: Record<ReadinessStatus, string> = {
  pass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  fail: 'border-rose-500/35 bg-rose-500/10 text-rose-300',
  pending: 'border-slate-700/70 bg-slate-800/40 text-slate-300',
  stale: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  unavailable: 'border-slate-800 bg-black/20 text-slate-500',
};

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'pass') return <Check className="h-3 w-3 shrink-0" />;
  if (status === 'fail') return <ShieldAlert className="h-3 w-3 shrink-0" />;
  if (status === 'warning' || status === 'stale') return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (status === 'pending') return <Clock3 className="h-3 w-3 shrink-0" />;
  return <CircleDashed className="h-3 w-3 shrink-0" />;
}

const stageIcons: Record<ReadinessStageId, React.ReactNode> = {
  graph: <Route className="h-3 w-3 shrink-0 opacity-80" />,
  package: <PackageCheck className="h-3 w-3 shrink-0 opacity-80" />,
  deployed: <Rocket className="h-3 w-3 shrink-0 opacity-80" />,
  seen: <Eye className="h-3 w-3 shrink-0 opacity-80" />,
  experience: <UserCheck className="h-3 w-3 shrink-0 opacity-80" />,
};

export default function ReadinessLadder({ stages, onNavigate, onConfirmExperience, trailing }: ReadinessLadderProps) {
  const [expanded, setExpanded] = useState<ReadinessStageId | null>(null);
  const active = stages.find(stage => stage.id === expanded) ?? null;
  const deployed = stages.find(stage => stage.id === 'deployed');
  const canConfirm = deployed?.status === 'pass';

  const activate = (stage: ReadinessStage) => {
    setExpanded(current => current === stage.id ? null : stage.id);
    onNavigate(stage.owner, stage.id);
  };

  return (
    <section
      aria-label="Mod readiness"
      data-testid="readiness-ladder"
      className="border-b border-slate-800/80 bg-[#0e121a] px-2.5 py-1 select-none shrink-0"
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="hidden xl:inline text-[10.5px] font-medium text-slate-500 mr-1 shrink-0">
          Pipeline:
        </span>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.id}>
            {index > 0 && <ChevronRight className="hidden sm:block w-3 h-3 text-slate-700 shrink-0" aria-hidden="true" />}
            <button
              type="button"
              data-testid={`readiness-stage-${stage.id}`}
              data-status={stage.status}
              onClick={() => activate(stage)}
              title={`${stage.label}: ${stage.summary} — Click for evidence`}
              className={`min-w-0 flex-1 h-[24px] rounded-md border px-2 inline-flex items-center gap-1.5 text-left transition-colors cursor-pointer hover:border-sky-400/45 ${styles[stage.status]} ${expanded === stage.id ? 'ring-1 ring-sky-400/50' : ''}`}
            >
              {stageIcons[stage.id]}
              <span className="truncate text-[10.5px] font-semibold">{stage.shortLabel}</span>
              <span className="hidden 2xl:inline truncate text-[10px] opacity-75 ml-0.5">· {stage.summary}</span>
              <span className="ml-auto"><StatusIcon status={stage.status} /></span>
            </button>
          </React.Fragment>
        ))}
        {trailing && <div className="ml-1.5 shrink-0">{trailing}</div>}
      </div>
      {active && (
        <div
          data-testid="readiness-evidence"
          className="mt-1 flex items-center gap-2 rounded-md border border-slate-800 bg-[#090c11] px-2.5 py-1 text-[10.5px] leading-tight text-slate-300"
        >
          <span className="shrink-0 font-semibold text-sky-300">{active.label}</span>
          <span className="min-w-0 flex-1 truncate" title={active.evidence}>{active.evidence}</span>
          {active.id === 'experience' && canConfirm && (
            <button
              type="button"
              data-testid="readiness-confirm-experience"
              onClick={event => { event.stopPropagation(); onConfirmExperience(); }}
              className="shrink-0 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              I saw it and it worked
            </button>
          )}
          <span className="shrink-0 text-[10px] text-slate-500">open {active.owner} ↗</span>
        </div>
      )}
    </section>
  );
}
