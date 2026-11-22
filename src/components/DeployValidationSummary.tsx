import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { deployReviewView, type DeployReviewData } from '../lib/deployClient';
import type { ValidationCoverageGap } from '../lib/validationEvidence';
import DeployFileChanges from './DeployFileChanges';

const COVERAGE_PAGE_SIZE = 40;
const PAGE_BUTTON = 'rounded border border-white/15 px-2 py-1 disabled:opacity-40';

function DeployCoverageGaps({ gaps, directPage, setDirectPage }: {
  gaps: readonly ValidationCoverageGap[];
  directPage: number;
  setDirectPage: (page: number) => void;
}) {
  const files = useMemo(() => {
    const groups = new Map<string, ValidationCoverageGap[]>();
    if (gaps.length > COVERAGE_PAGE_SIZE) {
      for (const gap of gaps) {
        const path = gap.filePath || '';
        const group = groups.get(path);
        if (group) group.push(gap);
        else groups.set(path, [gap]);
      }
    }
    return groups;
  }, [gaps]);
  const [selectedFile, setSelectedFile] = useState<string | null>();
  const [filePage, setFilePage] = useState(0);
  const [gapPage, setGapPage] = useState(0);
  const returnTo = useRef<string | null | undefined>(undefined);
  const overview = useRef<HTMLDivElement>(null);
  const detailTitle = useRef<HTMLParagraphElement>(null);
  const grouped = files.size > 1;
  const showFiles = grouped && selectedFile === undefined;
  const visibleGaps = (typeof selectedFile === 'string' && files.get(selectedFile)) || gaps;
  const count = showFiles ? files.size : visibleGaps.length;
  const pages = Math.ceil(count / COVERAGE_PAGE_SIZE);
  const setPage = showFiles ? setFilePage : grouped ? setGapPage : setDirectPage;
  const page = Math.min(showFiles ? filePage : grouped ? gapPage : directPage, Math.max(0, pages - 1));
  const first = page * COVERAGE_PAGE_SIZE;
  const end = first + COVERAGE_PAGE_SIZE;
  const pageLabel = showFiles ? 'groups' : 'gaps';

  useLayoutEffect(() => {
    if (returnTo.current === undefined) return;
    if (showFiles) {
      const scope = returnTo.current === null ? 'all' : `file:${returnTo.current}`;
      const button = Array.from(overview.current?.querySelectorAll<HTMLButtonElement>('[data-coverage-scope]') ?? [])
        .find(candidate => candidate.dataset.coverageScope === scope);
      button?.focus();
      returnTo.current = undefined;
    } else {
      detailTitle.current?.focus();
    }
  }, [showFiles]);

  function openGaps(path: string | null) {
    returnTo.current = path;
    setGapPage(0);
    setSelectedFile(path);
  }

  return <>
    {showFiles ? <div ref={overview} className="mt-2">
      <button type="button" data-coverage-scope="all" className={PAGE_BUTTON} onClick={() => openGaps(null)}>All gaps</button>
      <ul aria-label="Files with coverage gaps" className="mt-2 max-h-40 space-y-2 overflow-y-auto">
        {Array.from(files).slice(first, end).map(([path, rows]) => <li key={path}>
          <button type="button" data-coverage-scope={`file:${path}`}
            className="block w-full break-all rounded border border-white/15 px-2 py-1 text-left"
            onClick={() => openGaps(path)}>
            <code>{path || 'Project-wide'}</code> ({rows.length})
          </button>
        </li>)}
      </ul>
    </div> : <>
      {grouped && <div className="mt-2 flex flex-wrap items-center gap-2">
        <p ref={detailTitle} tabIndex={-1} className="min-w-0 break-all">{selectedFile === '' ? 'Project-wide' : selectedFile ?? 'All gaps'}</p>
        <button type="button" className={PAGE_BUTTON} onClick={() => setSelectedFile(undefined)}>Back to coverage files</button>
      </div>}
      <ul aria-label="Unavailable validation checks" className="mt-2 max-h-40 space-y-2 overflow-y-auto">
        {visibleGaps.slice(first, end).map((gap, index) => {
          const position = gap.line === undefined ? '' : `:${gap.line}${gap.column === undefined ? '' : `:${gap.column}`}`;
          return <li key={first + index} className="border-l border-slate-600 pl-2">
            <div><code>{gap.check}</code>{gap.filePath && <> · <code>{gap.filePath}{position}</code></>}</div>
            <p>{gap.reason}</p>
          </li>;
        })}
      </ul>
    </>}
    {pages > 1 && <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={PAGE_BUTTON}>Previous {pageLabel}</button>
      <span>{first + 1}–{Math.min(end, count)} of {count} {pageLabel}</span>
      <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} className={PAGE_BUTTON}>Next {pageLabel}</button>
    </div>}
  </>;
}

/** Server findings/provenance with an explicit, receipt-backed review revocation control. */
export default function DeployValidationSummary({ result }: { result: DeployReviewData }) {
  const view = deployReviewView(result);
  const review = result.validation?.review;
  const recorded = review?.status === 'recorded';
  const remembered = review?.warningReviews;
  const registration = result.effect?.luaRegistration;
  const gaps = result.validation?.evidence?.coverage?.gaps;
  const gapCount = Array.isArray(gaps) ? gaps.length : 0;
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coveragePage, setCoveragePage] = useState(0);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const currentResult = useRef(result);
  currentResult.current = result;
  useEffect(() => { setReason(''); setMessage(''); setRevoked([]); setBusy(false); setCoverageOpen(false); setCoveragePage(0); }, [result]);
  const revoke = async (receiptId: string) => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/agent/warning-reviews/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId, reviewScopeHash: remembered?.scopeHash, reason }) });
      const data = await response.json();
      if (currentResult.current !== result) return;
      if (!response.ok || data.ok !== true || data.receipt?.status !== 'committed') throw new Error(data.error || data.code || 'Revocation was not confirmed.');
      setRevoked(previous => [...previous, receiptId]);
      setMessage('Review revoked. This displayed deployment is historical; obtain a fresh preview before deploying again.');
    } catch (error) { if (currentResult.current === result) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (currentResult.current === result) setBusy(false); }
  };
  return <section data-testid="deploy-review-summary" data-tone={view.tone} className="space-y-2 text-xs leading-relaxed break-words">
    <div data-testid="deploy-review-title" className={`font-semibold ${view.tone === 'clean' ? 'text-emerald-300' : view.tone === 'error' ? 'text-red-300' : 'text-amber-200'}`}>{view.title}</div>
    <p className="text-slate-200">{view.validationText}</p>
    <p data-testid="deploy-review-counts" className="text-slate-300">{view.countText}</p>
    {Array.isArray(gaps) && gapCount > 0 && <details data-testid="deploy-coverage-details" className="text-slate-300"
      open={coverageOpen} onToggle={event => setCoverageOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-cyan-400">Coverage gaps ({gapCount})</summary>
      {coverageOpen && <DeployCoverageGaps gaps={gaps} directPage={coveragePage} setDirectPage={setCoveragePage} />}
    </details>}
    <p className="text-slate-400">{view.confirmed ? 'Deployed file bytes confirmed. ' : ''}This result does not verify behavior in X4.</p>
    {view.confirmed && result.deployRecord?.status === 'committed' && result.effect && (
      <DeployFileChanges effect={result.effect} label="Applied file changes" />
    )}
    {registration?.status === 'added' && <div data-testid="deploy-lua-registration-notice" className="text-amber-200">
      <p>{registration.addedCount} new Lua {registration.addedCount === 1 ? 'registration' : 'registrations'} may require a full X4 restart.</p>
      <ul className="list-disc pl-5">{registration.addedPaths.map(file => <li key={file}><code>{file}</code></li>)}</ul>
      {registration.addedCount > registration.addedPaths.length && <p>Plus {registration.addedCount - registration.addedPaths.length} more.</p>}
    </div>}
    {registration?.status === 'unavailable' && <p data-testid="deploy-lua-registration-notice" className="text-slate-400">{registration.detail}</p>}
    {result.modId && <div className="text-slate-300">Mod: <code>{result.modId}</code></div>}
    {result.sourceHash && <details className="text-slate-400"><summary className="cursor-pointer">Validated source identity</summary><code className="break-all">{result.sourceHash}</code></details>}
    {!!review?.approvals?.length && <details data-testid="deploy-review-approvals" className="text-slate-300">
      <summary className="cursor-pointer">{recorded ? 'Recorded approvals' : review.status === 'proposed' ? 'Proposed approvals' : 'Approval details'} ({review.approvals.length})</summary>
      <ul className="space-y-2 mt-2">
        {review.approvals.map((approval, index) => <li key={`${approval.findingId}:${index}`} className="border-l border-slate-600 pl-2 space-y-1">
          <div>{approval.severity || 'Finding'}: <code>{approval.code || approval.findingId}</code></div>
          <div>Reason: {approval.reason}</div>
          <div>Actor: {approval.actor?.label || approval.actor?.id || 'Not supplied'}{approval.actor?.label && approval.actor.id ? ` (${approval.actor.id})` : ''}</div>
          {approval.reused && <div>Reused review by {approval.originalActor?.label || approval.originalActor?.id}; original receipt: <code>{approval.originalReceiptId}</code></div>}
          <div className="break-all">Finding: <code>{approval.findingId}</code></div>
          <div className="break-all">{recorded && approval.receiptId ? <>Receipt: <code>{approval.receiptId}</code></> : 'No recorded approval receipt supplied.'}</div>
        </li>)}
      </ul>
    </details>}
    {remembered && <details data-testid="warning-review-history" className="text-slate-300">
      <summary className="cursor-pointer">Warning reviews: {remembered.knownFindingIds.length} known, {remembered.newFindingIds.length} need review</summary>
      <p>Reuse requires unchanged validation inputs, validator, game reference files and coverage. Accepted warnings remain visible.</p>
      <label className="block">Revocation reason<input aria-label="Warning review revocation reason" value={reason} maxLength={512}
        onChange={event => setReason(event.target.value)} className="block w-full bg-slate-900 border border-slate-600 p-1" /></label>
      <ul className="space-y-2 mt-2">{remembered.rows.map(row => <li key={row.receiptId} data-testid="warning-review-row" className="border-l border-slate-600 pl-2">
        <div>{revoked.includes(row.receiptId) ? 'revoked' : row.state}: <code>{row.code}</code></div>
        <div>{row.reason} — {row.actor.label || row.actor.id} ({row.recordedAt})</div>
        <code className="block break-all">{row.receiptId}</code>
        {row.state !== 'revoked' && !revoked.includes(row.receiptId) && <button type="button" disabled={busy || !reason.trim()}
          onClick={() => void revoke(row.receiptId)} className="border border-slate-500 px-2 py-1 disabled:opacity-50">Revoke review</button>}
      </li>)}</ul>
      {message && <p role="status">{message}</p>}
    </details>}
  </section>;
}
