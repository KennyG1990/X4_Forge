import { prepareDeployReview, type DeployReviewData } from '../lib/deployClient';
import DeployValidationSummary from './DeployValidationSummary';
import DeployFileChanges from './DeployFileChanges';
import React, { useState } from 'react';
import type { ModWorkspace } from '../types';
import { getAIHeaders, handleApiResponse } from '../lib/apiHelper';
import { fetchPollingJson } from '../lib/continuousPolling';
import { useContinuousPolling } from '../lib/useContinuousPolling';
import {
  buildRuntimeDebuggerViewModel,
  type RuntimeDebuggerPayload,
} from '../lib/runtimeDebuggerView';
import { openInNativeEditor } from '../lib/nativeEditor';
import {
  Folder,
  Terminal,
  Upload,
  Sparkles,
  CheckCircle,
  RefreshCw,
  Wrench,
  Cpu,
  PackageCheck,
} from 'lucide-react';

interface LogIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  errorLogSnippet: string;
  explanation: string;
  impact: string;
  suggestedAction: string;
  affectedNodeId?: string;
  autoFix?: {
    type: 'update_node_property';
    nodeId: string;
    propertyKey: string;
    propertyValue: string;
  };
}

interface LogAnalysisResult {
  parsedLogsCount: number;
  summaryOfGameMDReload: string;
  issues: LogIssue[];
}

interface GameLogIssue {
  severity: 'error' | 'warning' | 'info';
  lineNumber: number;
  text: string;
  matchesActiveMod: boolean;
}

interface GameLogStatus {
  status: 'no_log' | 'stale' | 'clean' | 'warnings' | 'errors' | 'error';
  modId: string;
  summary?: string;
  selectedLogPath?: string;
  logUpdatedAt?: string;
  logBytes?: number;
  counts?: {
    allIssues: number;
    activeIssues: number;
    activeErrors: number;
    activeWarnings: number;
  };
  cueLiveness?: {
    totalCues: number;
    erroringCount: number;
    firingCount: number;
    erroring: { name: string; errors: number; hits: number; lastLineNo?: number }[];
    firing: { name: string; hits: number }[];
  };
  modMarkers?: string[];
  modRuntime?: { markersSeen: boolean; markerLines: number; errorCount: number; samples: string[] };
  issues?: GameLogIssue[];
  recentGlobalIssues?: GameLogIssue[];
  diagnosis?: {
    filesLoaded: boolean;
    markersSeen: boolean;
    hypotheses: { code: string; confidence: 'high' | 'medium'; evidence: string; explanation: string; suggestion: string }[];
  };
  error?: string;
}

// B24s1 (ADR-F3): shape of GET /api/agent/live/forge-state — the Inspector's read path.
interface ForgeStateView {
  available: boolean;
  live?: boolean;
  logUpdatedAt?: string;
  topics?: { topic: string; data: unknown; raw: string; lineNo: number }[];
  malformed?: number;
  reason?: string;
  error?: string;
}

interface DebugWatcherBrief {
  brief?: string;
  // B19s2: server-computed "loaded and clean?" verdict — render, never re-derive.
  verdict?: { state: 'no_log' | 'stale' | 'not_seen' | 'loaded_with_errors' | 'loaded_clean'; detail: string; errorCount: number };
  timeline?: { kind: string; severity: 'info' | 'warning' | 'error'; label: string; lineNumber?: number; evidence: string }[];
  expectedChain?: { step: string; seen: boolean; evidence?: string }[];
  sinceDeploy?: { hasDeploy: boolean; changedSinceDeploy: boolean; summary: string; deployedAt?: string; logUpdatedAt?: string };
  evidence?: string[];
  artifact?: string;
  runtimeDebugger?: RuntimeDebuggerPayload;
  error?: string;
}

// H9: honest log-status labels. This panel only reports what the X4 debug log
// shows for THIS mod — it is not a statement that the mod is deployed, loaded,
// or schema-valid. "clean" specifically means "no active-mod log issues".
const GAME_LOG_STATUS_LABELS: Record<GameLogStatus['status'], string> = {
  no_log: 'NO LOG FOUND',
  stale: 'LOG STALE',
  clean: 'NO LOG ISSUES',
  warnings: 'LOG WARNINGS',
  errors: 'LOG ERRORS',
  error: 'LOG READ ERROR',
};

function RuntimeDebuggerPanel({
  runtimeDebugger,
  brief,
  timeline,
  expectedChain,
  artifact,
}: {
  runtimeDebugger: RuntimeDebuggerPayload;
  brief?: DebugWatcherBrief['brief'];
  timeline?: DebugWatcherBrief['timeline'];
  expectedChain?: DebugWatcherBrief['expectedChain'];
  artifact?: DebugWatcherBrief['artifact'];
}) {
  const view = buildRuntimeDebuggerViewModel(runtimeDebugger);
  const sessionTone = view.session.state === 'current'
    ? 'border-cyan-500/30 bg-cyan-500/5 text-cyan-100'
    : view.session.state === 'historical'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-100'
      : 'border-slate-500/30 bg-slate-500/5 text-slate-200';
  const coverageTone = view.coverage.status === 'met'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : view.coverage.status === 'below_target'
      ? 'border-red-500/30 bg-red-500/10 text-red-200'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  const incidentEntries = view.incidents.map((row, index) => ({ row, index }));
  const issueEntries = incidentEntries.filter(({ row }) => row.severity !== 'info');
  const activityEntries = incidentEntries.filter(({ row }) => row.severity === 'info');
  const confirmedEngineErrorEntries = incidentEntries.filter(({ row }) => row.disposition === 'confirmed_active' && row.isEngineFailure);
  const unresolvedIssueEntries = incidentEntries.filter(({ row }) => row.unresolved);
  const confirmedIssueOccurrences = confirmedEngineErrorEntries.reduce((total, { row }) => total + row.count, 0);
  const unresolvedIssueOccurrences = unresolvedIssueEntries.reduce((total, { row }) => total + row.count, 0);
  const activityOccurrences = activityEntries.reduce((total, { row }) => total + row.count, 0);
  const observedExpectedSteps = view.expectedSteps.filter(step => step.truth === 'observed').length;
  const missingExpectedSteps = view.expectedSteps.filter(step => step.truth === 'missing').length;
  const unavailableExpectedSteps = view.expectedSteps.filter(step => step.truth === 'unavailable').length;
  const coverageWarning = view.coverage.status !== 'met';
  const statusSummary = view.session.state === 'historical'
    ? 'Historical runtime evidence is shown; it cannot prove the current session is clean.'
    : view.session.state === 'unavailable'
      ? 'The runtime watcher is unavailable; no current clean proof is available.'
      : confirmedIssueOccurrences > 0 && unresolvedIssueOccurrences > 0
        ? `${confirmedIssueOccurrences} confirmed mod error${confirmedIssueOccurrences === 1 ? '' : 's'}; ${unresolvedIssueOccurrences} unresolved log issue${unresolvedIssueOccurrences === 1 ? '' : 's'}.${coverageWarning ? ` Coverage warning: ${view.coverage.statusLabel}.` : ''}`
        : confirmedIssueOccurrences > 0
          ? `${confirmedIssueOccurrences} confirmed mod error${confirmedIssueOccurrences === 1 ? '' : 's'} across ${confirmedEngineErrorEntries.length} group${confirmedEngineErrorEntries.length === 1 ? '' : 's'}.${coverageWarning ? ` Coverage warning: ${view.coverage.statusLabel}.` : ''}`
          : unresolvedIssueOccurrences > 0
            ? `No confirmed mod errors; ${unresolvedIssueOccurrences} unresolved log issue${unresolvedIssueOccurrences === 1 ? '' : 's'} remain visible.${coverageWarning ? ` Coverage warning: ${view.coverage.statusLabel}.` : ''}`
        : coverageWarning
          ? view.noCandidateMessage || `No active-mod errors are shown, but ${view.coverage.statusLabel.toLowerCase()}.`
          : 'No active-mod errors observed in the current session; coverage target met.';
  const isNestedInteractiveTarget = (
    target: EventTarget | null,
    currentTarget: EventTarget | null,
  ): boolean => {
    if (!(target instanceof Element) || !(currentTarget instanceof Element)) return false;
    const interactiveTarget = target.closest('a,button,details,summary,input,select,textarea,[role="button"]');
    return Boolean(
      interactiveTarget
      && interactiveTarget !== currentTarget
      && currentTarget.contains(interactiveTarget),
    );
  };
  const [nativeEditorMessage, setNativeEditorMessage] = useState<string | null>(null);

  const navigateToNode = (nodeId: string, nodeLabel?: string) => {
    window.dispatchEvent(new CustomEvent('navigate-to-source', {
      detail: { kind: 'md_node', id: nodeId, ...(nodeLabel ? { label: nodeLabel } : {}) },
    }));
  };

  const activateIncident = (target: NonNullable<(typeof view.incidents)[number]['navigationTarget']>) => {
    if (target.kind === 'md_node') {
      setNativeEditorMessage(null);
      navigateToNode(target.nodeId, target.nodeLabel);
      return;
    }
    const requested = openInNativeEditor(
      target.file,
      { line: target.nativeLine },
    );
    setNativeEditorMessage(requested
      ? `Native editor request sent for ${target.file}:${target.sourceLine}.`
      : 'Native editor unavailable in the standalone browser; the source was not opened.');
  };

  const renderIncidentRow = ({ row, index }: { row: (typeof view.incidents)[number]; index: number }) => {
    const navigationTarget = row.navigationTarget;
    const sourceLabel = row.mapping.nodeLabel
      ? `${row.mapping.nodeLabel} · ${row.mapping.locationLabel}`
      : row.mapping.locationLabel;
    const primaryMessage = row.samples[0]?.text || row.cause;
    const actionable = Boolean(navigationTarget);
    const rowTone = row.severity === 'error'
      ? 'border-red-500/30 bg-red-500/5'
      : row.severity === 'info'
        ? 'border-cyan-500/30 bg-cyan-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

    return (
      <article
        key={`${row.key}-${index}`}
        className={`space-y-1.5 rounded-md border p-2 text-[11px] leading-snug ${rowTone} ${actionable ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c0e12]' : ''}`}
        data-testid={`runtime-incident-${index}`}
        data-navigation-kind={navigationTarget?.kind}
        {...(actionable ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': `${navigationTarget!.actionLabel}: ${primaryMessage}`,
        } : {})}
        onClick={event => {
          if (!navigationTarget || isNestedInteractiveTarget(event.target, event.currentTarget)) return;
          activateIncident(navigationTarget);
        }}
        onKeyDown={event => {
          if (!navigationTarget || isNestedInteractiveTarget(event.target, event.currentTarget)) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          activateIncident(navigationTarget);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-mono font-semibold ${row.severity === 'error' ? 'text-red-300' : row.severity === 'info' ? 'text-cyan-300' : 'text-amber-300'}`}>
              {row.severity === 'error' ? 'ERROR' : row.severity === 'warning' ? 'WARNING' : 'ACTIVITY'} · {row.dispositionLabel}
            </div>
            <div className="break-words font-mono text-slate-200" title={row.key}>{primaryMessage}</div>
          </div>
          <div className="shrink-0 text-right font-mono text-slate-300">
            <div>{row.count}×</div>
            <div>{row.lineLabel}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 font-mono">
          <span className="truncate text-cyan-200" title={row.mapping.reason}>{sourceLabel}</span>
          {navigationTarget && <span className="ml-auto rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-200">{navigationTarget.actionLabel} ↗</span>}
        </div>

        {row.unresolved && (
          <div className="truncate text-amber-200" title={row.attributionReason}>
            unresolved: {row.attributionReason}
          </div>
        )}

        <details className="rounded border border-white/[0.08] bg-[#0a0c10] p-1.5 font-mono text-[11px]" data-testid={`runtime-incident-details-${index}`}>
          <summary className="cursor-pointer text-slate-400">incident details · cause, attribution, evidence</summary>
          <div className="mt-1 space-y-1 text-slate-300">
            <div><span className="text-slate-400">SUMMARY · </span>{row.summary}</div>
            <div><span className="text-slate-400">CAUSE · </span>{row.cause}</div>
            <div><span className="text-slate-400">IMPACT · </span>{row.impact}</div>
            <div><span className="text-slate-400">NEXT ACTION · </span>{row.nextAction}</div>
            <div><span className="text-slate-400">ATTRIBUTION · </span>{row.attributionReason}</div>
            <div className="rounded border border-white/[0.08] bg-[#0c0e12] p-1.5">
              <div className="text-slate-400">EVIDENCE · {row.evidenceLabel}</div>
              {row.evidence.map((evidence, evidenceIndex) => <div key={`${evidence}-${evidenceIndex}`} className="truncate" title={evidence}>· {evidence}</div>)}
            </div>
            <div className="rounded border border-white/[0.08] bg-[#0c0e12] p-1.5">
              <div className="text-slate-400">SOURCE MAPPING · {row.mapping.mappingLabel}</div>
              <div title={row.mapping.reason}>{row.mapping.locationLabel}</div>
              <div className="text-slate-400">{row.mapping.reason}</div>
            </div>
            {row.samples.length > 0 && (
              <div className="rounded border border-white/[0.08] bg-[#0c0e12] p-1.5">
                <div className="text-slate-400">SAMPLES · {row.samples.length}</div>
                {row.samples.map((sample, sampleIndex) => (
                  <pre key={`${sample.lineLabel}-${sampleIndex}`} className="mt-1 whitespace-pre-wrap break-words text-slate-300">{sample.lineLabel}: {sample.text}</pre>
                ))}
              </div>
            )}
          </div>
        </details>
      </article>
    );
  };

  return (
    <div className="mt-2 space-y-2.5 rounded-md border border-cyan-500/25 bg-[#0e131b] p-2.5 text-[11px]" data-testid="runtime-debugger-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-cyan-200" title={view.authority.displayName}>
            Runtime Debugger · {view.authority.displayName}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-200" data-testid="runtime-debugger-status">
            {statusSummary}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] font-mono text-slate-400">
            <span>{confirmedIssueOccurrences} confirmed issue{confirmedIssueOccurrences === 1 ? '' : 's'}</span>
            <span>{unresolvedIssueOccurrences} unresolved</span>
            <span>{activityOccurrences} activity</span>
            <span>{view.hiddenOtherModCount} unrelated hidden</span>
          </div>
        </div>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-mono font-semibold ${sessionTone}`}>
          {view.session.stateLabel}
        </span>
      </div>

      {nativeEditorMessage && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] font-mono text-amber-200" aria-live="polite" data-testid="runtime-debugger-native-editor-status">
          {nativeEditorMessage}
        </div>
      )}

      <div className="space-y-1.5" data-testid="runtime-debugger-incidents">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
          <span>Confirmed errors &amp; unresolved issues</span>
          <span className="font-mono">{confirmedEngineErrorEntries.length} confirmed · {unresolvedIssueEntries.length} unresolved{view.omittedIncidentCount > 0 ? ` · +${view.omittedIncidentCount} bounded` : ''}</span>
        </div>
        <div className="space-y-1.5" data-testid="runtime-debugger-active-issues">
          {issueEntries.length === 0 ? (
            <div className="rounded border border-white/[0.08] bg-[#0a0c10] p-2 text-[11px] leading-snug text-slate-400">
              {view.noCandidateMessage || 'No active-mod errors or warnings are shown; absence is not clean proof.'}
            </div>
          ) : issueEntries.map(renderIncidentRow)}
        </div>
      </div>

      <details className="rounded border border-white/[0.08] bg-[#0a0c10] p-2 text-[11px] font-mono text-slate-300" data-testid="runtime-debugger-expected-steps">
        <summary className="cursor-pointer">
          Expected flow / cue health · {observedExpectedSteps} observed · {missingExpectedSteps} missing · {unavailableExpectedSteps} unavailable
        </summary>
        {view.expectedSteps.length === 0 ? (
          <div className="mt-1 text-slate-400">No declared expected steps.</div>
        ) : (
          <div className="mt-1.5 grid grid-cols-1 gap-1">
            {view.expectedSteps.map(step => (
              <div key={step.id} className={`flex items-start gap-1.5 rounded border p-1.5 ${step.truth === 'observed' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : step.truth === 'missing' ? 'border-amber-500/30 bg-amber-500/5 text-amber-200' : 'border-slate-500/30 bg-slate-500/5 text-slate-300'}`}>
                <span className="w-3 shrink-0 text-center">{step.truth === 'observed' ? '✓' : step.truth === 'missing' ? '!' : '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{step.truthLabel}</span> <span className="break-words">{step.label}</span>
                  {step.evidence.length > 0 && (
                    <details className="mt-1 rounded border border-white/[0.08] bg-[#0c0e12] p-1">
                      <summary className="cursor-pointer text-slate-400">step evidence</summary>
                      <div className="mt-0.5 truncate text-slate-300" title={step.evidence.join(' · ')}>{step.evidence.join(' · ')}</div>
                    </details>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </details>

      {activityEntries.length > 0 && (
        <details className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2 text-[11px]" data-testid="runtime-debugger-activity">
          <summary className="cursor-pointer font-mono text-cyan-200">
            Activity / runtime evidence · {activityOccurrences} event{activityOccurrences === 1 ? '' : 's'} · {activityEntries.length} group{activityEntries.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-1.5 space-y-1.5">{activityEntries.map(renderIncidentRow)}</div>
        </details>
      )}

      {(brief || (timeline && timeline.length > 0) || (expectedChain && expectedChain.length > 0) || artifact) && (
        <details className="rounded border border-white/[0.08] bg-[#0a0c10] p-2 text-[11px] font-mono text-slate-300" data-testid="runtime-debugger-advanced">
          <summary className="cursor-pointer text-cyan-200">Advanced watcher details</summary>
          {brief && <div className="mt-1 leading-snug">{brief}</div>}
          {expectedChain && expectedChain.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {expectedChain.map(step => <span key={step.step} className={`rounded border px-1.5 py-0.5 ${step.seen ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>{step.seen ? '✓' : '·'} {step.step}</span>)}
            </div>
          )}
          {timeline && timeline.length > 0 && (
            <div className="mt-1 space-y-1">
              {timeline.slice(-8).map((item, index) => (
                <div key={`${item.lineNumber}-${index}`} className="grid grid-cols-[78px_1fr] gap-2 leading-snug">
                  <span className={item.severity === 'error' ? 'text-red-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-cyan-300'}>{item.kind}{item.lineNumber ? `:${item.lineNumber}` : ''}</span>
                  <span className="truncate" title={item.evidence}>{item.evidence}</span>
                </div>
              ))}
            </div>
          )}
          {artifact && (
            <details className="mt-1 rounded border border-white/[0.08] bg-[#0c0e12] p-1.5">
              <summary className="cursor-pointer text-cyan-300">copyable agent artifact</summary>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-slate-300">{artifact}</pre>
            </details>
          )}
        </details>
      )}

      <details className="rounded border border-white/[0.08] bg-[#0a0c10] p-2 text-[11px] font-mono text-slate-300" data-testid="runtime-debugger-session-detail">
        <summary className="cursor-pointer text-slate-300">Session &amp; workspace details · {view.session.stateLabel}</summary>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
          <span className="col-span-2 truncate" title={view.authority.workspaceId}>workspace authority: {view.authority.workspaceId}</span>
          {view.authority.contentId && <span className="truncate" title={view.authority.contentId}>content: {view.authority.contentId}</span>}
          {view.authority.deployedFolder && <span className="truncate" title={view.authority.deployedFolder}>deployed: {view.authority.deployedFolder}</span>}
          {view.authority.sourceFolder && <span className="col-span-2 truncate" title={view.authority.sourceFolder}>source: {view.authority.sourceFolder}</span>}
          {view.session.sessionId && <span className="truncate" title={view.session.sessionId}>session: {view.session.sessionId}</span>}
          {view.session.logPath && <span className="col-span-2 truncate" title={view.session.logPath}>log: {view.session.logPath}</span>}
          {view.session.generation !== undefined && <span>generation: {view.session.generation}</span>}
          {(view.session.firstLine !== undefined || view.session.lastLine !== undefined) && <span>lines: {view.session.firstLine ?? '—'}–{view.session.lastLine ?? '—'}</span>}
          {view.session.newlyReadBytes !== undefined && <span>new bytes: {view.session.newlyReadBytes}</span>}
          {view.session.observedAt && <span className="truncate" title={view.session.observedAt}>observed: {view.session.observedAt}</span>}
        </div>
        <div className="mt-1 text-slate-300">SESSION EVIDENCE · {view.session.detail}</div>
        {view.session.resetReason && <div className="mt-0.5 text-amber-300">reset: {view.session.resetReason}</div>}
        {view.noCandidateMessage && <div className="mt-1 rounded border border-amber-500/25 bg-amber-500/5 p-1.5 text-amber-200">{view.noCandidateMessage}</div>}
      </details>

      <details className={`rounded border p-2 text-[11px] font-mono ${coverageTone}`} data-testid="runtime-debugger-coverage">
        <summary className="cursor-pointer">Coverage · {view.coverage.statusLabel} · {view.coverage.targetLabel}</summary>
        <div className="mt-1 space-y-1 text-slate-200">
          <div>{view.coverage.arithmeticLabel}</div>
          <div>{view.unresolvedCount} unresolved · {view.hiddenOtherModCount} unrelated hidden · {view.coverage.silentlyDropped} silently dropped</div>
        </div>
      </details>
    </div>
  );
}

interface PlaytestWorkspaceProps {
  workspace: ModWorkspace;
  setWorkspace?: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint?: (customTarget?: ModWorkspace) => void;
  activeModId: string;
  modWorkspacePath: string;
  onOpenReleaseCenter?: () => void;
}

type PlaytestDeployResult = DeployReviewData & {
  checklist?: Array<{ id: string; label: string; status: string; detail: string }>;
  error?: string;
  compileErrors?: Array<{ message: string }>;
  deployedPath?: string;
  deployedBytes?: number;
  doctor?: { blocking?: unknown[] };
};

export default function PlaytestWorkspace({
  workspace,
  setWorkspace,
  saveCheckpoint,
  activeModId,
  modWorkspacePath,
  onOpenReleaseCenter,
}: PlaytestWorkspaceProps) {
  const [logInput, setLogInput] = useState<string>('');
  const [diagnosingLogs, setDiagnosingLogs] = useState<boolean>(false);
  const [logAnalysis, setLogAnalysis] = useState<LogAnalysisResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [successfulFixApplied, setSuccessfulFixApplied] = useState<string | null>(null);

  const handleTriggerLogAnalysis = async () => {
    if (!logInput.trim()) return;
    setDiagnosingLogs(true);
    setDiagnosticError(null);
    try {
      const response = await fetch('/api/gemini/analyze-log', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ workspace, logs: logInput }),
      });
      const data = await handleApiResponse(response, 'Log parsing request rejected.');
      setLogAnalysis(data.analysis);
    } catch (err: any) {
      console.error(err);
      setDiagnosticError(err?.message || 'Failed to analyze X4 script logs.');
    } finally {
      setDiagnosingLogs(false);
    }
  };

  const handleApplyAutoFix = (fix: LogIssue['autoFix']) => {
    if (!fix || !setWorkspace || !saveCheckpoint) return;
    if (fix.type === 'update_node_property' && fix.nodeId && fix.propertyKey) {
      saveCheckpoint();
      setWorkspace(prev => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === fix.nodeId
            ? { ...n, properties: { ...n.properties, [fix.propertyKey]: fix.propertyValue } }
            : n,
        ),
      }));
      setSuccessfulFixApplied(`Successfully repaired property '${fix.propertyKey}' to '${fix.propertyValue}'!`);
      setTimeout(() => setSuccessfulFixApplied(null), 4000);
      if (logAnalysis) {
        setLogAnalysis(prev => {
          if (!prev) return null;
          return {
            ...prev,
            issues: prev.issues.filter(issue => issue.autoFix?.nodeId !== fix.nodeId || issue.autoFix?.propertyKey !== fix.propertyKey),
          };
        });
      }
    }
  };

  const insertDemoX4Log = () => {
    const demoText = `### ====================================================================
### SAMPLE / DEMO LOG — this is EXAMPLE text to show the parser format.
### It is NOT from your game and contains NO real errors about your mod.
### Use "Browse debug.log" or the auto-watcher to see your actual X4 log.
### ====================================================================
[General] 0000.00: ==========================================
[General] 0000.00: X4: Foundations vX.XX (000000)
[General] 0000.00: Command Line: -debug all -logfile uidata.log -reloaddirector
[General] 0000.00: ==========================================
[MD Engine] Error: Parsing XML file extensions\\Demo_Sample_Mod\\md\\demo_sample_mod.xml
*** Context:md.Demo_Sample_Cue: cue has active state but 'instantiate' attribute is currently 'false'. Re-instantiation will fail on game reloads!
[MD Engine] Warning: Property 'faction' has unrecognized faction code 'DEMO_FACTION' in cue 'Demo_Sample_Cue'. X4 standard code is 'argon'.`;
    setLogInput(demoText);
  };

  const handleLogFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => setLogInput((evt.target?.result as string) || '');
    reader.readAsText(file);
  };

  const [gameLogStatus, setGameLogStatus] = useState<GameLogStatus | null>(null);
  const [gameLogLoading, setGameLogLoading] = useState<boolean>(false);
  const [gameLogError, setGameLogError] = useState<string>('');
  const [debugBrief, setDebugBrief] = useState<DebugWatcherBrief | null>(null);
  // B24s1 (ADR-F3): read-only Inspector — latest FORGE-STATE snapshot per topic.
  const [forgeState, setForgeState] = useState<ForgeStateView | null>(null);
  const [pastedDiagnosis, setPastedDiagnosis] = useState<GameLogStatus['diagnosis'] | null>(null);
  const [diagnosingPasted, setDiagnosingPasted] = useState<boolean>(false);
  const gameLogAuthorityRef = React.useRef(activeModId);
  React.useLayoutEffect(() => {
    gameLogAuthorityRef.current = activeModId;
    setGameLogStatus(null);
    setGameLogError('');
    setGameLogLoading(true);
    setDebugBrief(null);
  }, [activeModId, workspace.id]);
  // NPC Identity Probe UI removed 2026-07-09 (Ken): it was a one-off research rig from
  // the cross-session NPC-id investigation, never meant to ship in the product surface.
  // The agent API endpoints (/api/agent/npc-identity-probe/*) remain for agent use.

  const [verifyPath, setVerifyPath] = useState<string>('');
  const [deployPhase, setDeployPhase] = useState<'preview' | 'apply' | null>(null);
  const [deployAttempt, setDeployAttempt] = useState<{
    result: PlaytestDeployResult;
    review?: { destination: string; applyBody: string; epoch: number };
  } | null>(null);
  const workspaceContext = window.__X4_WORKSPACE_CONTEXT__;
  const workspaceId = workspaceContext?.getWorkspaceId() || '';
  const selectionRevision = workspaceContext?.getSelectionRevision() ?? 0;
  const sourcePath = verifyPath.trim();
  const canvasSource = sourcePath ? null : workspace;
  const deploySource = React.useMemo(() => sourcePath ? { path: sourcePath, root: 'workspace' } : { workspace: canvasSource },
    [sourcePath, canvasSource]);
  const deployScopeEpoch = React.useRef(0);
  const deployPending = React.useRef(false);
  React.useLayoutEffect(() => {
    setDeployAttempt(null);
    return () => { deployScopeEpoch.current += 1; };
  }, [workspaceId, selectionRevision, modWorkspacePath, deploySource]);
  const verifyResult = deployAttempt?.result;
  const reviewedDeploy = deployAttempt?.review;

  const [harvesting, setHarvesting] = useState<boolean>(false);
  const [harvestResult, setHarvestResult] = useState<any>(null);

  const harvestVanillaUi = async () => {
    setHarvesting(true);
    setHarvestResult(null);
    try {
      const r = await fetch('/api/agent/vanilla-ui-harvest?limit=24');
      setHarvestResult(await r.json());
    } catch (e: any) {
      setHarvestResult({ error: e?.message || 'request failed' });
    } finally {
      setHarvesting(false);
    }
  };

  const requestDeploy = async (phase: 'preview' | 'apply') => {
    if (deployPending.current) return;
    const selectionMatches = () => workspaceId && workspaceContext?.getWorkspaceId() === workspaceId
      && workspaceContext.getSelectionRevision() === selectionRevision;
    if (!selectionMatches() || (phase === 'apply' && reviewedDeploy?.epoch !== deployScopeEpoch.current)) {
      setDeployAttempt(null);
      return;
    }
    const body = phase === 'preview' ? JSON.stringify({ ...deploySource, dryRun: true }) : reviewedDeploy?.applyBody;
    if (!body) return;
    const epoch = ++deployScopeEpoch.current;
    const stillSelected = () => epoch === deployScopeEpoch.current && selectionMatches();
    deployPending.current = true;
    setDeployPhase(phase);
    setDeployAttempt(null);
    try {
      const r = await fetch('/api/agent/deploy-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const result = await r.json();
      if (!stillSelected()) return;
      if (!r.ok || result.ok !== true) {
        setDeployAttempt({ result: { ...result, ok: false } });
        return;
      }
      if (phase === 'apply') {
        setDeployAttempt({ result });
        return;
      }
      setDeployAttempt({ result, review: { ...prepareDeployReview(body, result), epoch } });
    } catch (error) {
      if (stillSelected()) setDeployAttempt({ result: { ok: false, error: error instanceof Error ? error.message : 'Deploy request failed.' } });
    } finally {
      deployPending.current = false;
      setDeployPhase(null);
    }
  };

  const diagnosePastedTrace = async () => {
    setDiagnosingPasted(true);
    try {
      const r = await fetch('/api/agent/log-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tail: logInput, modId: activeModId }),
      });
      const data = await r.json();
      setPastedDiagnosis(data.diagnosis || null);
    } catch {
      setPastedDiagnosis(null);
    } finally {
      setDiagnosingPasted(false);
    }
  };

  const refreshGameLogStatus = async () => {
    const requestedModId = activeModId;
    setGameLogLoading(true);
    setGameLogError('');
    try {
      const response = await fetch(`/api/agent/game-log/status?modId=${encodeURIComponent(requestedModId)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to read X4 debug log status.');
      }
      if (gameLogAuthorityRef.current !== requestedModId) return;
      setGameLogStatus(data);
    } catch (err) {
      if (gameLogAuthorityRef.current !== requestedModId) return;
      setGameLogStatus(null);
      setGameLogError(err.message || 'Failed to read X4 debug log status.');
    } finally {
      if (gameLogAuthorityRef.current === requestedModId) setGameLogLoading(false);
    }
  };

  const gameLogStatusUrl = `/api/agent/game-log/status?modId=${encodeURIComponent(activeModId)}`;
  useContinuousPolling<GameLogStatus>({
    enabled: !debugBrief?.runtimeDebugger,
    resourceKey: `game-log-status:${activeModId}`,
    contract: `GET ${gameLogStatusUrl}`,
    intervalMs: 4000,
    run: signal => fetchPollingJson(gameLogStatusUrl, undefined, signal),
    onResult: data => { setGameLogStatus(data); setGameLogError(''); setGameLogLoading(false); },
    onError: error => {
      setGameLogStatus(null);
      setGameLogError(error.message || 'Failed to read X4 debug log status.');
      setGameLogLoading(false);
    },
  });

  const expectedCues = ['Save_identity', 'Chat_boot', 'Poll_tick', 'On_action'].join(',');
  // The enhanced runtime debugger is workspace-authoritative. The global fetch
  // wrapper supplies x-workspace-id; do not let an editable mod id select it.
  const debugBriefUrl = `/api/agent/debug-watcher/brief?expect=${encodeURIComponent(expectedCues)}`;
  useContinuousPolling<DebugWatcherBrief>({
    resourceKey: `debug-watcher-playtest:${workspace.id}`,
    contract: `GET ${debugBriefUrl}`,
    intervalMs: 4000,
    run: signal => fetchPollingJson(debugBriefUrl, undefined, signal),
    onResult: data => setDebugBrief(data),
    onError: error => setDebugBrief({ error: error.message || 'Failed to read debug watcher brief.' }),
  });

  useContinuousPolling<ForgeStateView>({
    resourceKey: 'forge-state:latest',
    contract: 'GET /api/agent/live/forge-state',
    intervalMs: 4000,
    run: signal => fetchPollingJson('/api/agent/live/forge-state', undefined, signal),
    onResult: data => setForgeState(data),
    onError: error => setForgeState({ available: false, error: error.message || 'Failed to read FORGE-STATE topics.' }),
  });

  const gameLogTone = gameLogError
    ? 'border-red-500/30 bg-red-500/5 text-red-300'
    : gameLogStatus?.status === 'errors'
    ? 'border-red-500/30 bg-red-500/5 text-red-300'
    : gameLogStatus?.status === 'warnings'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
      : gameLogStatus?.status === 'clean'
        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
        : 'border-white/10 bg-slate-900/35 text-slate-300';

  return (
    <div className="p-3 space-y-4 font-sans select-text bg-[#0c0e12]">
      
      {/* Deployment & Vanilla UI verification */}
      <div className="bg-[#11141a] border border-white/[0.08] p-3.5 rounded-lg space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-[#eef2f7] flex items-center gap-2">
              <Folder className="w-4 h-4 text-emerald-400" />
              X4 Deployment
            </h3>
            <p className="text-[11px] text-slate-400 leading-normal">
              Preview the selected source and confirm the exact X4 install destination before deploying.
            </p>
          </div>
          
          {modWorkspacePath ? (
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] font-medium flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Workspace Set
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.08] font-mono text-[11px] font-medium flex items-center gap-1 shrink-0">
              Workspace Unset
            </span>
          )}
        </div>

        {modWorkspacePath ? (
          <div className="space-y-3">
            <div className="p-2 bg-[#0a0c10] border border-white/[0.08] rounded-md font-mono text-[11px] text-slate-300 break-all">
              Mod Workspace · {modWorkspacePath}
            </div>
            <p className="text-[11px] text-slate-400">Deploy keeps a build copy under .forge-builds/loose in the Mod Workspace.</p>

            <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={verifyPath}
                  onChange={(e) => setVerifyPath(e.target.value)}
                  disabled={deployPhase !== null}
                  aria-label="Mod folder relative to Mod Workspace, or blank for current canvas"
                  placeholder="Workspace folder or blank for canvas"
                  data-testid="verify-path-input"
                  className="min-w-0 flex-1 px-2.5 py-1.5 bg-[#0a0c10] border border-white/[0.08] text-slate-200 rounded font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void requestDeploy('preview')}
                  disabled={deployPhase !== null || !workspaceId}
                  data-testid="deploy-verify-btn"
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 font-sans text-white font-semibold text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  {deployPhase === 'preview' ? 'Previewing…' : 'Preview deployment'}
                </button>
              </div>
              <p className="break-all text-[11px] text-slate-300">Source · {sourcePath ? `Mod Workspace / ${sourcePath}` : `Current canvas / ${workspace.name}`}</p>
              {deployPhase === 'apply' && <p role="status" className="text-[11px] text-slate-300">Deploying and verifying…</p>}
              {verifyResult && (
                <div data-testid="verify-result" className="rounded border border-white/[0.08] bg-[#0a0c10] p-2.5 text-[11px] font-mono leading-relaxed">
                  <DeployValidationSummary result={verifyResult} />
                  {reviewedDeploy && (
                    <div className="mt-2 space-y-1.5 rounded border border-cyan-500/25 p-2">
                      <p className="break-all text-slate-200" data-testid="playtest-deploy-destination">X4 install destination · {reviewedDeploy.destination}</p>
                      {verifyResult.effect && <DeployFileChanges effect={verifyResult.effect} />}
                      <button
                        type="button"
                        onClick={() => void requestDeploy('apply')}
                        data-testid="deploy-apply-btn"
                        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 font-sans text-slate-950 font-semibold text-[11px] rounded cursor-pointer"
                      >
                        Deploy + Verify
                      </button>
                    </div>
                  )}
                  {Array.isArray(verifyResult.checklist) && verifyResult.checklist.length > 0 && (
                    <div className="@container mt-1.5 space-y-1.5" data-testid="preflight-checklist">
                      {verifyResult.checklist.map(c => (
                        <div key={`${c.id}-${c.label}`} className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-1 @min-[24rem]:grid-cols-[14px_130px_minmax(0,1fr)]">
                          <span className={
                            c.status === 'pass' ? 'text-emerald-400' :
                            c.status === 'warn' ? 'text-amber-400' :
                            c.status === 'fail' ? 'text-red-400' : 'text-slate-500'
                          }>
                            {c.status === 'pass' ? '●' : c.status === 'warn' ? '▲' : c.status === 'fail' ? '✗' : '○'}
                          </span>
                          <span className="text-slate-300">{c.label}</span>
                          <span className="col-start-2 break-words text-slate-400 leading-tight @min-[24rem]:col-start-auto">{c.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {verifyResult.deployedPath && <div className="break-all text-slate-400">X4 install destination · {verifyResult.deployedPath}</div>}
                  {typeof verifyResult.bytesConfirmed === 'boolean' && <div className="text-slate-400">bytes confirmed: {String(verifyResult.bytesConfirmed)} ({verifyResult.deployedBytes}b) · doctor blocking: {verifyResult.doctor?.blocking?.length ?? '—'}</div>}
                  {verifyResult.deployRecord?.id && <div className="break-all text-slate-400">Deploy receipt · {verifyResult.deployRecord.id}</div>}
                  {verifyResult.error && <div className="text-red-300">{verifyResult.error}</div>}
                  {verifyResult.compileErrors?.[0] && <div className="text-red-300">{verifyResult.compileErrors[0].message}</div>}
                </div>
              )}
            </div>

            {/* Vanilla-UI reference: validate our UI schema against REAL game menus harvested from the .cat/.dat. */}
            <div className="pt-2.5 border-t border-white/[0.08] space-y-1.5">
              <button
                onClick={harvestVanillaUi}
                disabled={harvesting}
                data-testid="vanilla-ui-harvest-btn"
                className="w-full px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 disabled:opacity-40 font-sans text-violet-100 font-semibold text-[11px] rounded transition-colors cursor-pointer"
              >
                {harvesting ? 'Harvesting…' : 'Harvest Vanilla UI Reference'}
              </button>
              {harvestResult && !harvestResult.error && (
                <div data-testid="vanilla-ui-result" className="rounded border border-violet-500/35 bg-violet-500/10 p-2 text-[11px] font-mono leading-snug text-violet-100">
                  <div className="font-semibold">✓ {harvestResult.menusProfiled} vanilla menus profiled (scanned {harvestResult.scanned})</div>
                  {(harvestResult.evidence || []).map((ev: any) => (
                    <div key={ev.element} className={ev.universal ? 'text-emerald-300' : 'text-amber-300'}>
                      {ev.element}: {ev.presentIn}/{ev.total} {ev.universal ? '· universal' : '· NOT universal'}
                    </div>
                  ))}
                </div>
              )}
              {harvestResult?.error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] font-mono text-red-200">{harvestResult.error}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Set the Mod Workspace Folder in Settings to preview deployments.
            </p>
          </div>
        )}

        {/* Single-owner Release Center handoff -> Project -> Release */}
        <div
          data-testid="playtest-release-handoff"
          className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between gap-2 text-[11px]"
        >
          <div className="min-w-0">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Release Center</span>
            </div>
            <div className="text-slate-400 truncate">Package verified Nexus ZIP or Steam Workshop archives in Project → Release.</div>
          </div>
          {onOpenReleaseCenter && (
            <button
              type="button"
              data-testid="playtest-open-release-btn"
              onClick={onOpenReleaseCenter}
              className="shrink-0 px-2.5 py-1.5 rounded-md border border-blue-500/40 bg-blue-500/15 hover:bg-blue-500/25 text-[11px] font-medium text-blue-100 cursor-pointer transition-colors"
            >
              Open Release →
            </button>
          )}
        </div>

      </div>

      {/* ERROR LOADER & DEBUG FILE INPUT TRIGGER */}
      <div className="bg-[#11141a] border border-white/[0.08] p-3.5 rounded-lg space-y-3.5">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-[#eef2f7] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Game Debug Log Watcher
            </span>
            <button
              onClick={insertDemoX4Log}
              className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-2 py-0.5 rounded text-cyan-300 font-medium transition-colors shrink-0 cursor-pointer"
            >
              Load Demo Log
            </button>
          </h3>
          <p className="text-[11px] text-slate-400 leading-normal">
            Paste lines from <code className="text-cyan-400">debug.log</code>, or load it with the picker below to analyze MD engine issues.
          </p>
        </div>

        {debugBrief?.runtimeDebugger ? (
          <RuntimeDebuggerPanel
            runtimeDebugger={debugBrief.runtimeDebugger}
            brief={debugBrief.brief}
            timeline={debugBrief.timeline}
            expectedChain={debugBrief.expectedChain}
            artifact={debugBrief.artifact}
          />
        ) : (
        <div data-testid="playtest-game-log-status" className={`rounded-lg border p-3 space-y-2 ${gameLogTone}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="font-mono text-[11px] font-semibold text-white" title="Reflects only this mod's entries in the X4 debug log — not whether the mod is deployed, loaded in-game, or schema-valid.">
                Active-Mod Log Status: {gameLogError ? 'UNAVAILABLE' : gameLogStatus ? (GAME_LOG_STATUS_LABELS[gameLogStatus.status] || gameLogStatus.status) : 'CHECKING'}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {gameLogError || gameLogStatus?.summary || 'Reading recent debuglog.txt output...'}
              </p>
            </div>
            <button
              onClick={refreshGameLogStatus}
              disabled={gameLogLoading}
              className="px-2 py-1 bg-[#0a0c10] border border-white/[0.08] rounded font-mono text-[11px] text-slate-200 hover:text-white disabled:opacity-50 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${gameLogLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
            <span className="truncate" title={activeModId}>MOD: {activeModId}</span>
            <span className="truncate" title={gameLogStatus?.selectedLogPath || ''}>
              LOG: {gameLogStatus?.selectedLogPath || 'not found'}
            </span>
            {gameLogStatus?.logUpdatedAt && <span className="truncate">UPDATED: {new Date(gameLogStatus.logUpdatedAt).toLocaleTimeString()}</span>}
            {gameLogStatus?.counts && <span>ACTIVE ISSUES: {gameLogStatus.counts.activeIssues}</span>}
          </div>

          {gameLogStatus?.cueLiveness && gameLogStatus.cueLiveness.totalCues > 0 && (
            <div className="mt-1 space-y-1" data-testid="cue-liveness">
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-slate-400">CUE STATUS</span>
                {gameLogStatus.cueLiveness.erroringCount > 0 ? (
                  <span className="text-red-300">✗ {gameLogStatus.cueLiveness.erroringCount} cue(s) failing</span>
                ) : gameLogStatus.cueLiveness.firingCount > 0 ? (
                  <span className="text-emerald-300">✓ {gameLogStatus.cueLiveness.firingCount} firing cleanly</span>
                ) : (
                  <span className="text-slate-400">no cue activity in tail</span>
                )}
              </div>
              {gameLogStatus.cueLiveness.erroring && gameLogStatus.cueLiveness.erroring.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gameLogStatus.cueLiveness.erroring.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-source', { detail: { kind: 'cue', id: c.name } }))}
                      title={`${c.errors} error(s) in the log — click to jump to this cue on the canvas`}
                      className="rounded px-1.5 py-0.5 text-[11px] font-mono border border-red-500/50 bg-red-500/15 text-red-300 cursor-pointer hover:bg-red-500/30 hover:border-red-400 transition-colors"
                    >
                      {c.name} ✗{c.errors} ↗
                    </button>
                  ))}
                </div>
              )}
              {gameLogStatus.cueLiveness.firing && gameLogStatus.cueLiveness.firing.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gameLogStatus.cueLiveness.firing.map((c) => (
                    <span
                      key={c.name}
                      title={`${c.hits} fires`}
                      className="rounded px-1.5 py-0.5 text-[11px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    >
                      {c.name} ✓{c.hits}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {gameLogStatus?.modRuntime && gameLogStatus.modRuntime.errorCount > 0 && (
            <div className="mt-1 space-y-1" data-testid="mod-runtime-errors">
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-slate-400">RUNTIME</span>
                <span className="text-red-300">
                  ✗ {gameLogStatus.modRuntime.errorCount} engine error(s) next to mod marker
                  {gameLogStatus.modMarkers && gameLogStatus.modMarkers.length > 0 ? ` [${gameLogStatus.modMarkers.join('/')}]` : ''}
                </span>
              </div>
              <div className="space-y-1">
                {gameLogStatus.modRuntime.samples.slice(0, 4).map((s, i) => (
                  <pre key={i} className="whitespace-pre-wrap rounded border border-red-500/50 bg-red-500/15 p-1.5 text-[11px] leading-snug text-red-200 font-mono">
                    {s}
                  </pre>
                ))}
              </div>
            </div>
          )}

          {gameLogStatus?.issues && gameLogStatus.issues.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
              {gameLogStatus.issues.slice(-3).map((issue, index) => (
                <pre key={`${issue.lineNumber}-${index}`} className="whitespace-pre-wrap rounded bg-[#0a0c10] border border-white/[0.08] p-1.5 text-[11px] leading-snug text-slate-300 font-mono">
                  [{issue.severity}] {issue.text}
                </pre>
              ))}
            </div>
          )}

          {(() => {
            const diag = pastedDiagnosis || gameLogStatus?.diagnosis;
            if (!diag) return null;
            return (
              <div className="mt-1 space-y-1.5" data-testid="log-diagnosis">
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-slate-400">ROOT-CAUSE {pastedDiagnosis ? '(pasted)' : '(live)'}</span>
                  <span className={diag.filesLoaded ? 'text-cyan-300' : 'text-slate-400'}>
                    files {diag.filesLoaded ? 'loaded' : '—'}
                  </span>
                  <span className={diag.markersSeen ? 'text-emerald-300' : 'text-amber-300'}>
                    markers {diag.markersSeen ? 'seen' : 'not seen'}
                  </span>
                </div>
                {diag.hypotheses.length === 0 ? (
                  <div className="text-[11px] font-mono text-slate-400">No root-cause hypotheses for this mod.</div>
                ) : (
                  diag.hypotheses.map((h, i) => (
                    <div key={`${h.code}-${i}`} className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] font-mono leading-snug">
                      <div className="text-amber-300">{h.code} <span className="text-slate-400">· {h.confidence}</span></div>
                      <div className="text-slate-300 mt-0.5">{h.explanation}</div>
                      <div className="text-cyan-300/90 mt-0.5">→ {h.suggestion}</div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}

          {debugBrief && !debugBrief.error && !debugBrief.runtimeDebugger && (
            <div className="mt-2 space-y-2 rounded border border-cyan-500/20 bg-cyan-500/5 p-2" data-testid="debug-watcher-brief">
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <div className="font-semibold text-cyan-200">Agent Debug Brief</div>
                <div className={debugBrief.sinceDeploy?.changedSinceDeploy ? 'text-emerald-300' : 'text-amber-300'}>
                  {debugBrief.sinceDeploy?.changedSinceDeploy ? 'fresh since deploy' : 'stale / no deploy proof'}
                </div>
              </div>
              {debugBrief.verdict && (
                <div
                  data-testid="watcher-verdict"
                  title={debugBrief.verdict.detail}
                  className={`rounded border px-2 py-1 text-[11px] font-mono leading-snug ${
                    debugBrief.verdict.state === 'loaded_clean' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : debugBrief.verdict.state === 'loaded_with_errors' ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                  }`}
                >
                  VERDICT: {debugBrief.verdict.state.toUpperCase()} — {debugBrief.verdict.detail}
                </div>
              )}
              {debugBrief.sinceDeploy?.summary && (
                <div className="text-[11px] font-mono text-slate-300 leading-snug">{debugBrief.sinceDeploy.summary}</div>
              )}

              {debugBrief.expectedChain && debugBrief.expectedChain.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-mono text-slate-400">EXPECTED CHAIN</div>
                  <div className="flex flex-wrap gap-1">
                    {debugBrief.expectedChain.map((step) => (
                      <span
                        key={step.step}
                        title={step.evidence || (step.seen ? 'seen in current log tail' : 'not seen in current log tail')}
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-mono ${step.seen ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}
                      >
                        {step.seen ? '✓' : '·'} {step.step}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {debugBrief.timeline && debugBrief.timeline.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-mono text-slate-400">RECENT HIGH-SIGNAL TIMELINE</div>
                  <div className="max-h-24 space-y-1 overflow-y-auto scrollbar-thin">
                    {debugBrief.timeline.slice(-8).map((item, index) => (
                      <div key={`${item.lineNumber}-${index}`} className="grid grid-cols-[78px_1fr] gap-2 text-[11px] font-mono leading-snug">
                        <span className={item.severity === 'error' ? 'text-red-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-cyan-300'}>
                          {item.kind}{item.lineNumber ? `:${item.lineNumber}` : ''}
                        </span>
                        <span className="text-slate-300 truncate" title={item.evidence}>{item.evidence}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {debugBrief.artifact && (
                <details className="rounded border border-white/[0.08] bg-[#0a0c10] p-1.5 text-[11px]">
                  <summary className="cursor-pointer font-mono text-cyan-300">copyable agent artifact</summary>
                  <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap leading-snug text-slate-300">{debugBrief.artifact}</pre>
                </details>
              )}
            </div>
          )}
          {debugBrief?.error && (
            <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] font-mono text-red-200">
              Debug watcher brief failed: {debugBrief.error}
            </div>
          )}
        </div>
        )}

          <div className="mt-2 space-y-2 rounded border border-violet-500/20 bg-violet-500/5 p-2.5 text-[11px]" data-testid="forge-state-inspector">
            <div className="flex items-center justify-between gap-2 font-mono">
              <div className="font-semibold text-violet-200">Inspector — FORGE-STATE</div>
              <div className={forgeState?.live ? 'text-emerald-300' : 'text-slate-400'}>
                {forgeState?.live ? 'log live' : forgeState?.available ? 'log stale' : 'no log'}
              </div>
            </div>
            {(!forgeState || !forgeState.available || !forgeState.topics?.length) ? (
              <div className="font-mono text-slate-400 leading-snug">
                {forgeState?.error
                  ? `Inspector read failed: ${forgeState.error}`
                  : 'No FORGE-STATE topics in the current log tail. Emit one from any cue: '}
                {!forgeState?.error && (
                  <code className="text-violet-300/90 select-text">{'<debug_text text="\'FORGE-STATE player {&quot;credits&quot;: &quot;\' + player.money + \'&quot;}\'" />'}</code>
                )}
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                {forgeState.topics.map((t) => (
                  <details key={t.topic} className="rounded border border-white/[0.08] bg-[#0a0c10] p-1.5" data-testid={`forge-state-topic-${t.topic}`}>
                    <summary className="cursor-pointer font-mono text-violet-300">
                      {t.topic} <span className="text-slate-400">· line {t.lineNo} · {Object.keys((t.data as Record<string, unknown>) || {}).length} field(s)</span>
                    </summary>
                    <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap leading-snug text-slate-300 select-text">{JSON.stringify(t.data, null, 2)}</pre>
                  </details>
                ))}
                {(forgeState.malformed ?? 0) > 0 && (
                  <div className="font-mono text-amber-300">{forgeState.malformed} malformed FORGE-STATE line(s) ignored (bad JSON).</div>
                )}
              </div>
            )}
          </div>

        {/* LOG TEXTAREA BUFFER */}
        <div className="space-y-2">
          <textarea
            value={logInput}
            onChange={(e) => setLogInput(e.target.value)}
            placeholder="Paste X4 Foundations debug trace here (e.g. cue failures, properties missing in extensions...)"
            className="w-full h-28 p-2.5 bg-[#0a0c10] border border-white/[0.08] text-emerald-300 rounded-md font-mono text-[11px] focus:outline-none focus:border-blue-500 select-text leading-relaxed"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={diagnosePastedTrace}
              disabled={diagnosingPasted || !logInput.trim()}
              data-testid="diagnose-trace-btn"
              className="px-2.5 py-1 bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-mono text-cyan-200 rounded transition-colors cursor-pointer"
            >
              {diagnosingPasted ? 'Diagnosing…' : 'Diagnose trace (deterministic)'}
            </button>
            {pastedDiagnosis && (
              <button type="button" onClick={() => setPastedDiagnosis(null)} className="text-[11px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer">clear</button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="px-2.5 py-1 bg-[#171b23] border border-white/[0.08] hover:border-white/20 text-[11px] font-mono text-slate-200 rounded cursor-pointer transition-colors flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Browse debug.log</span>
              <input
                type="file"
                accept=".log,.txt"
                className="hidden"
                onChange={handleLogFileChange}
              />
            </label>

            {logInput.trim() && (
              <button
                onClick={handleTriggerLogAnalysis}
                disabled={diagnosingLogs}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${diagnosingLogs ? 'animate-spin' : ''}`} />
                AI Diagnose Traces
              </button>
            )}
          </div>
        </div>

        {debugBrief?.runtimeDebugger && pastedDiagnosis && (
          <div className="mt-1 space-y-1.5 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] font-mono" data-testid="pasted-log-diagnosis">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">ROOT-CAUSE (pasted)</span>
              <span className={pastedDiagnosis.filesLoaded ? 'text-cyan-300' : 'text-slate-400'}>files {pastedDiagnosis.filesLoaded ? 'loaded' : '—'}</span>
              <span className={pastedDiagnosis.markersSeen ? 'text-emerald-300' : 'text-amber-300'}>markers {pastedDiagnosis.markersSeen ? 'seen' : 'not seen'}</span>
            </div>
            {pastedDiagnosis.hypotheses.length === 0 ? (
              <div className="text-slate-400">No root-cause hypotheses for this trace.</div>
            ) : pastedDiagnosis.hypotheses.map((hypothesis, index) => (
              <div key={`${hypothesis.code}-${index}`} className="rounded border border-amber-500/20 bg-[#0a0c10] p-2 leading-snug">
                <div className="text-amber-300">{hypothesis.code} <span className="text-slate-400">· {hypothesis.confidence}</span></div>
                <div className="mt-0.5 text-slate-300">{hypothesis.explanation}</div>
                <div className="mt-0.5 text-cyan-300/90">→ {hypothesis.suggestion}</div>
              </div>
            ))}
          </div>
        )}

        {successfulFixApplied && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium rounded-lg leading-relaxed flex items-center gap-2 text-[11px]">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successfulFixApplied}</span>
          </div>
        )}

        {diagnosticError && (
          <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-300 rounded-lg shrink-0 text-[11px]">
            <span className="font-semibold text-red-400 block">Error Reading Logs</span>
            <p className="text-slate-300 mt-0.5">{diagnosticError}</p>
          </div>
        )}
      </div>

      {diagnosingLogs && (
        <div className="flex flex-col items-center justify-center p-6 bg-[#11141a] rounded-lg border border-white/[0.08] space-y-2.5 text-[11px]">
          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
          <div className="text-center">
            <span className="font-semibold text-slate-200">Compiling Trace Solutions…</span>
            <p className="text-slate-400 mt-0.5">Searching debug trace for scripting faults…</p>
          </div>
        </div>
      )}

      {logAnalysis && !diagnosingLogs && (
        <div className="space-y-3 animate-fade-in">
          <div className="px-2 border-l-2 border-blue-500 space-y-1 text-left">
            <h4 className="text-xs font-semibold text-[#eef2f7]">
              AI Playtest Diagnosis
            </h4>
            <p className="text-[11px] text-slate-400 leading-normal">
              {logAnalysis.summaryOfGameMDReload}
            </p>
          </div>

          {logAnalysis.issues && logAnalysis.issues.length > 0 ? (
            <div className="space-y-3">
              {logAnalysis.issues.map((issue) => {
                const isErr = issue.severity === 'error';
                return (
                  <div
                    key={issue.id}
                    className={`p-3 rounded-lg border leading-relaxed space-y-2.5 text-left text-[11px] ${
                      isErr
                        ? 'bg-red-500/5 border-red-500/25'
                        : 'bg-amber-500/5 border-amber-500/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono font-semibold px-1.5 py-0.5 rounded border ${
                        isErr
                          ? 'bg-red-500/10 text-red-300 border-red-500/25'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                      }`}>
                        [{issue.severity}] {issue.title}
                      </span>
                      {issue.affectedNodeId && (
                        <span className="bg-[#0a0c10] border border-white/[0.08] px-1.5 py-0.5 rounded text-slate-300 font-mono">
                          Node matched
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 block">Trace Match</span>
                      <pre className="p-2 bg-[#0a0c10] border border-white/[0.08] font-mono text-slate-300 rounded overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {issue.errorLogSnippet}
                      </pre>
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 block">Why Context Fails</span>
                      <p className="text-slate-200 leading-relaxed">{issue.explanation}</p>
                    </div>

                    <div className="p-2 bg-[#0a0c10] rounded border border-white/[0.08] space-y-0.5">
                      <span className="font-semibold text-slate-400 block">In-Game Impact</span>
                      <p className="text-slate-300">{issue.impact}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 block">Repair Advice</span>
                      <p className="text-slate-200 leading-relaxed">{issue.suggestedAction}</p>
                    </div>

                    {issue.autoFix && (
                      <button
                        onClick={() => handleApplyAutoFix(issue.autoFix)}
                        className="mt-1 w-full py-2 bg-emerald-500 hover:bg-emerald-400 border border-emerald-400 text-slate-950 font-semibold text-[11px] rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Apply AI 1-Click Repair
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-slate-400 bg-[#11141a] rounded border border-white/[0.08] flex flex-col items-center justify-center gap-2 text-[11px]">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span className="leading-normal font-medium text-slate-300">
                All traces passed! Clear game state compilation achieved. Re-run or trace when logs contain director warning cues.
              </span>
            </div>
          )}
        </div>
      )}

      {/* INSTRUCTIONS ON HOT RELOADING DIRECTOR ON USER MACHINE */}
      <div className="bg-[#11141a] border border-white/[0.08] p-3.5 rounded-lg space-y-2 text-left">
        <h5 className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5" />
          Egosoft Live Hot-Reload Guide
        </h5>
        <div className="text-[11px] text-slate-400 leading-relaxed space-y-2">
          <p>
            1. Launch X4: Foundations with properties: <code className="text-cyan-300 font-mono select-all bg-[#0a0c10] px-1.5 py-0.5 rounded">-debug scripts -logfile debuglog.txt</code>
          </p>
          <p>
            2. Refresh/save compiled files, then fire this reload signal in your game&apos;s active developer terminal input:
          </p>
          <div className="p-1.5 px-2 bg-[#0a0c10] border border-white/[0.08] rounded font-mono text-[11px] font-semibold text-center block text-slate-100 select-all">
            refreshmd
          </div>
        </div>
      </div>

    </div>
  );
}
