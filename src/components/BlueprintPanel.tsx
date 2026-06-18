/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A5.1 — Architect Blueprint panel. Renders the durable ModBlueprint (intent +
 * requirements + plan + tasks + scratchpad + changelog) as the Architect's
 * working surface. Read-only in A5.1; the agent loop (A5.2) fills it and
 * collaborative editing (A5.5) makes it editable. Each task shows its
 * deterministic done-check + whether it passed (the M-ARCH-2 guarantee).
 */
import React, { useState } from 'react';
import { ClipboardList, ListChecks, NotebookPen, Check, Play, Loader2, AlertTriangle, X } from 'lucide-react';
import { ModBlueprint, blueprintProgress, evaluateBlueprintChecks, saveBlueprint } from '../lib/modBlueprint';
import { ModWorkspace } from '../types';

/** A5.2 D3 — the result of one Architect step, surfaced in the panel.
 *  'error' = the step could not run (network/model failure) — distinct from a referee
 *  decision, and crucially does NOT touch the lessons log. */
export interface ArchitectStepView {
  decision: 'accept' | 'revise' | 'reject' | 'error';
  reason: string;
  taskTitle?: string;
  /** Verdict summary for an accepted proposal (schema/graph/intent). */
  verdicts?: { schema: string; graph: string; intent: string };
  nodeCount?: number;
}

interface BlueprintPanelProps {
  blueprint: ModBlueprint;
  /** A5.3 — when provided, each task's done-check is evaluated against the live workspace. */
  workspace?: ModWorkspace;
  /** A5.2 — when provided the panel is CONTROLLED by the parent (App = single source of
   *  truth, shared with the agent loop). When absent it falls back to its own persisted
   *  local state (standalone A5.5 behavior — keeps editing+persistence working). */
  onChange?: (b: ModBlueprint) => void;
  /** A5.2 D3 — Architect loop controls (rendered only when provided, i.e. cobuild tier). */
  onRunStep?: () => void;
  running?: boolean;
  step?: ArchitectStepView | null;
  onConfirmStep?: () => void;
  onDeclineStep?: () => void;
  /** Gate the Run control (e.g. no AI key set). */
  canRun?: boolean;
  runDisabledReason?: string;
}

type View = 'plan' | 'tasks' | 'scratch';

const verdictColor = (s?: string) => s === 'pass' ? 'text-emerald-400' : s === 'fail' ? 'text-red-400' : s === 'warn' ? 'text-amber-400' : 'text-slate-500';

const statusStyle: Record<string, string> = {
  done: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  in_progress: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  blocked: 'text-red-300 border-red-500/30 bg-red-500/10',
  pending: 'text-slate-400 border-white/10 bg-white/5',
};

export default function BlueprintPanel({
  blueprint, workspace, onChange,
  onRunStep, running, step, onConfirmStep, onDeclineStep, canRun = true, runDisabledReason,
}: BlueprintPanelProps) {
  const [view, setView] = useState<View>('tasks');
  // A5.5 — the blueprint is user-editable + persisted. When the parent supplies onChange
  // the panel is CONTROLLED (A5.2 shared state); otherwise it self-manages + persists.
  const [localBp, setLocalBp] = useState<ModBlueprint>(blueprint);
  const [noteDraft, setNoteDraft] = useState('');
  const bp = onChange ? blueprint : localBp;
  const update = (next: ModBlueprint) => {
    if (onChange) onChange(next);
    else { setLocalBp(next); saveBlueprint(next); }
  };
  // A5.3 — evaluate each task's done-check against the live workspace (deterministic).
  const evaluated = React.useMemo(
    () => (workspace ? evaluateBlueprintChecks(bp, workspace) : bp),
    [bp, workspace],
  );
  const prog = blueprintProgress(evaluated);
  const addNote = () => {
    const n = noteDraft.trim();
    if (!n) return;
    update({ ...bp, scratchpad: { ...bp.scratchpad, notes: [...bp.scratchpad.notes, n] } });
    setNoteDraft('');
  };

  const Tab = ({ id, label, icon: Icon }: { id: View; label: string; icon: typeof ClipboardList }) => (
    <button
      type="button"
      onClick={() => setView(id)}
      className={`flex-1 py-1.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center justify-center gap-1 transition-all cursor-pointer ${
        view === id ? 'text-[#df9825] bg-[#df9825]/5 border-b-2 border-[#df9825]' : 'text-slate-400 border-b-2 border-transparent hover:text-slate-200'
      }`}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full min-h-0 font-sans text-slate-300">
      {/* Intent + progress */}
      <div className="p-3 border-b border-white/5 bg-black/30 shrink-0 space-y-1.5">
        <div className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-slate-500">Blueprint — Goal (editable)</div>
        <input
          value={bp.intent}
          onChange={e => update({ ...bp, intent: e.target.value })}
          placeholder="Describe the mod's goal…"
          className="w-full bg-[#0F1115] border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#df9825] font-sans"
        />
        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500">
          <span className="text-emerald-400 font-bold">{prog.done}/{prog.total}</span> tasks verified done
        </div>
      </div>

      {/* A5.2 D3 — Architect loop control + last-step result. Rendered only when the parent
          wires onRunStep (cobuild tier). The model drafts one task's nodes; the deterministic
          referee (vetTaskProposal) decides accept/revise/reject; a task reaches done only when
          its check passes. */}
      {onRunStep && (
        <div className="p-3 border-b border-white/5 bg-[#0d0f13] shrink-0 space-y-2">
          <button
            type="button"
            onClick={onRunStep}
            disabled={running || !canRun}
            title={!canRun ? (runDisabledReason || 'Unavailable') : 'Draft the next task with the model, then verify it deterministically'}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
              running || !canRun ? 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed' : 'bg-cyan-500 hover:bg-cyan-400 text-black cursor-pointer'
            }`}
          >
            {running ? <><Loader2 className="w-3 h-3 animate-spin" /> Working…</> : <><Play className="w-3 h-3" /> Run Architect step</>}
          </button>
          {!canRun && runDisabledReason && (
            <div className="text-[9px] text-amber-300/80 font-sans leading-snug">{runDisabledReason}</div>
          )}

          {step && (
            <div className={`rounded border p-2 space-y-1.5 ${
              step.decision === 'accept' ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                : step.decision === 'reject' || step.decision === 'error' ? 'border-red-500/30 bg-red-500/[0.06]'
                  : 'border-amber-500/30 bg-amber-500/[0.06]'
            }`}>
              <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider">
                {step.decision === 'accept' ? <Check className="w-3 h-3 text-emerald-400" />
                  : step.decision === 'reject' ? <X className="w-3 h-3 text-red-400" />
                    : <AlertTriangle className={`w-3 h-3 ${step.decision === 'error' ? 'text-red-400' : 'text-amber-400'}`} />}
                <span className={step.decision === 'accept' ? 'text-emerald-300' : step.decision === 'reject' ? 'text-red-300' : step.decision === 'error' ? 'text-red-300' : 'text-amber-300'}>
                  {step.decision === 'accept' ? 'Proposal verified' : step.decision === 'reject' ? 'Rejected' : step.decision === 'error' ? 'Step failed' : 'Sent back for revision'}
                </span>
              </div>
              {step.taskTitle && <div className="text-[10px] text-slate-300 font-sans">Task: <span className="text-slate-200">{step.taskTitle}</span></div>}
              {step.verdicts && (
                <div className="flex gap-2 text-[9px] font-mono">
                  <span className="text-slate-500">SCHEMA <span className={verdictColor(step.verdicts.schema)}>{step.verdicts.schema.toUpperCase()}</span></span>
                  <span className="text-slate-500">GRAPH <span className={verdictColor(step.verdicts.graph)}>{step.verdicts.graph.toUpperCase()}</span></span>
                  <span className="text-slate-500">INTENT <span className={verdictColor(step.verdicts.intent)}>{step.verdicts.intent.toUpperCase()}</span></span>
                </div>
              )}
              <div className="text-[9.5px] text-slate-400 font-sans leading-snug">{step.reason}</div>
              {step.decision === 'accept' && onConfirmStep && (
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button type="button" onClick={onConfirmStep} className="py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1">
                    <Check className="w-3 h-3" /> Confirm & apply
                  </button>
                  <button type="button" onClick={onDeclineStep} className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1">
                    <X className="w-3 h-3 text-red-400" /> Decline
                  </button>
                </div>
              )}
              {step.decision !== 'accept' && (
                <div className="text-[9px] font-mono text-slate-500">{step.decision === 'reject' ? 'Logged to lessons — won\'t be re-proposed.' : 'Nothing applied. Run again to retry.'}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-view tabs */}
      <div className="flex border-b border-white/5 bg-black/40 shrink-0">
        <Tab id="plan" label="Plan" icon={ClipboardList} />
        <Tab id="tasks" label="Tasks" icon={ListChecks} />
        <Tab id="scratch" label="Scratchpad" icon={NotebookPen} />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {view === 'plan' && (
          <>
            {evaluated.requirements.length > 0 && (
              <div className="space-y-1">
                <div className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-slate-500">Requirements</div>
                {evaluated.requirements.map((r, i) => (
                  <div key={i} className="text-[10.5px] text-slate-300 flex items-start gap-1.5"><span className="text-slate-600">•</span>{r}</div>
                ))}
              </div>
            )}
            <div className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-slate-500 pt-1">Implementation plan</div>
            {evaluated.implementationPlan.length === 0 ? (
              <div className="text-[10px] text-slate-500 italic">No plan yet.</div>
            ) : evaluated.implementationPlan.map((s, i) => (
              <div key={s.id} className="bg-[#12141a]/60 border border-white/5 rounded p-2 space-y-0.5">
                <div className="text-[10.5px] text-slate-200 font-medium flex items-start gap-1.5">
                  <span className="text-[#df9825] font-mono font-bold">{i + 1}.</span> {s.step}
                </div>
                {s.rationale && <div className="text-[9.5px] text-slate-500 pl-4">{s.rationale}</div>}
                {s.doneCheck && <div className="text-[9px] font-mono text-cyan-400/80 pl-4">✓ check: {s.doneCheck}</div>}
              </div>
            ))}
          </>
        )}

        {view === 'tasks' && (
          evaluated.tasks.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic">No tasks yet.</div>
          ) : evaluated.tasks.map(t => (
            <div key={t.id} className="bg-[#12141a]/60 border border-white/5 rounded p-2 flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[10.5px] text-slate-200 font-medium">{t.title}</div>
                {t.doneCheck && (
                  <div className={`text-[9px] font-mono flex items-center gap-1 ${t.checkPassed ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {t.checkPassed && <Check className="w-2.5 h-2.5" />} check: {t.doneCheck}{t.checkPassed ? ' (passed)' : ''}
                  </div>
                )}
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold uppercase ${statusStyle[t.status] || statusStyle.pending}`}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
          ))
        )}

        {view === 'scratch' && (
          <>
            <div className="flex gap-1.5">
              <input
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                placeholder="Add a note to the scratchpad…"
                className="flex-1 bg-[#0F1115] border border-white/10 rounded px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-[#df9825] font-sans"
              />
              <button type="button" onClick={addNote} className="px-2 py-1 bg-[#df9825]/15 hover:bg-[#df9825]/25 border border-[#df9825]/30 text-[#df9825] rounded text-[9px] font-mono font-bold uppercase cursor-pointer">Add</button>
            </div>
            {([
              ['Decisions', evaluated.scratchpad.decisions],
              ['Notes', evaluated.scratchpad.notes],
              ['Rejected approaches (lessons)', evaluated.scratchpad.rejected],
              ['Open questions', evaluated.scratchpad.openQuestions],
            ] as [string, string[]][]).map(([label, items]) => (
              <div key={label} className="space-y-1">
                <div className="text-[8.5px] font-mono font-bold uppercase tracking-wider text-slate-500">{label}</div>
                {items.length === 0 ? (
                  <div className="text-[9.5px] text-slate-600 italic">—</div>
                ) : items.map((it, i) => (
                  <div key={i} className={`text-[10px] flex items-start gap-1.5 ${label.startsWith('Rejected') ? 'text-red-300/80' : 'text-slate-300'}`}>
                    <span className="text-slate-600">•</span>{it}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-white/5 text-[8.5px] font-mono text-slate-600 shrink-0">
        Architect blueprint — a task is "done" only when its deterministic check passes.
      </div>
    </div>
  );
}
