import React, { useState } from 'react';
import { AlertTriangle, Check, CircleDashed, Clock3, Eye, PackageCheck, Rocket, Route, ShieldAlert, UserCheck } from 'lucide-react';
import type { ReadinessOwner, ReadinessStage, ReadinessStageId, ReadinessStatus } from '../lib/readiness';

interface ReadinessLadderProps {
  stages: ReadinessStage[];
  onNavigate: (owner: ReadinessOwner, stage: ReadinessStageId) => void;
  onConfirmExperience: () => void;
  trailing?: React.ReactNode;
}

const styles: Record<ReadinessStatus, string> = {
  pass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  fail: 'border-red-500/40 bg-red-500/10 text-red-300',
  pending: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  stale: 'border-orange-500/35 bg-orange-500/10 text-orange-300',
  unavailable: 'border-slate-600/30 bg-black/20 text-slate-500',
};

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'pass') return <Check className="h-3 w-3" />;
  if (status === 'fail') return <ShieldAlert className="h-3 w-3" />;
  if (status === 'warning' || status === 'stale') return <AlertTriangle className="h-3 w-3" />;
  if (status === 'pending') return <Clock3 className="h-3 w-3" />;
  return <CircleDashed className="h-3 w-3" />;
}

const stageIcons: Record<ReadinessStageId, React.ReactNode> = {
  graph: <Route className="h-3.5 w-3.5" />,
  package: <PackageCheck className="h-3.5 w-3.5" />,
  deployed: <Rocket className="h-3.5 w-3.5" />,
  seen: <Eye className="h-3.5 w-3.5" />,
  experience: <UserCheck className="h-3.5 w-3.5" />,
};

export default function ReadinessLadder({ stages, onNavigate, onConfirmExperience, trailing }: ReadinessLadderProps) {
  const [expanded, setExpanded] = useState<ReadinessStageId | null>(null);
  const active = stages.find(stage => stage.id === expanded) || null;
  const canConfirm = stages.find(stage => stage.id === 'seen')?.status === 'pass' &&
    stages.find(stage => stage.id === 'deployed')?.status === 'pass' &&
    stages.find(stage => stage.id === 'experience')?.status !== 'pass';

  const activate = (stage: ReadinessStage) => {
    setExpanded(current => current === stage.id ? null : stage.id);
    onNavigate(stage.owner, stage.id);
  };

  return (
    <section data-testid="readiness-ladder" className="shrink-0 border-b border-white/10 bg-[#101319]/95 px-3 py-1.5 font-mono shadow-lg">
      <div className="flex items-center gap-1.5">
        <span className="mr-1 hidden text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500 xl:inline">Ship readiness</span>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.id}>
            {index > 0 && <span aria-hidden className="text-slate-700">›</span>}
            <button
              type="button"
              data-testid={`readiness-stage-${stage.id}`}
              data-status={stage.status}
              aria-expanded={expanded === stage.id}
              onClick={() => activate(stage)}
              title={`${stage.label}: ${stage.summary}. Click for evidence.`}
              className={`min-w-0 flex-1 rounded border px-2 py-1 text-left transition-colors cursor-pointer hover:border-cyan-400/45 ${styles[stage.status]} ${expanded === stage.id ? 'ring-1 ring-cyan-400/50' : ''}`}
            >
              <span className="flex items-center gap-1.5">
                {stageIcons[stage.id]}
                <span className="truncate text-[9px] font-bold uppercase tracking-wide">{stage.shortLabel}</span>
                <span className="ml-auto"><StatusIcon status={stage.status} /></span>
              </span>
              <span className="mt-0.5 block truncate text-[8px] opacity-80">{stage.summary}</span>
            </button>
          </React.Fragment>
        ))}
        {trailing && <div className="ml-1 shrink-0">{trailing}</div>}
      </div>
      {active && (
        <div data-testid="readiness-evidence" className="mt-1.5 flex items-center gap-2 rounded border border-white/10 bg-black/25 px-2.5 py-1 text-[9px] leading-tight text-slate-300">
          <span className="shrink-0 font-bold text-cyan-300">{active.label}</span>
          <span className="min-w-0 flex-1 truncate" title={active.evidence}>{active.evidence}</span>
          {active.id === 'experience' && canConfirm && (
            <button
              type="button"
              data-testid="readiness-confirm-experience"
              onClick={event => { event.stopPropagation(); onConfirmExperience(); }}
              className="shrink-0 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              I saw it and it worked
            </button>
          )}
          <span className="shrink-0 text-slate-600">open {active.owner} ↗</span>
        </div>
      )}
    </section>
  );
}
