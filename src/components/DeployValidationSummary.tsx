import React, { useEffect, useRef, useState } from 'react';
import { deployReviewView, type DeployReviewData } from '../lib/deployClient';

/** Server findings/provenance with an explicit, receipt-backed review revocation control. */
export default function DeployValidationSummary({ result }: { result: DeployReviewData }) {
  const view = deployReviewView(result);
  const review = result.validation?.review;
  const recorded = review?.status === 'recorded';
  const remembered = review?.warningReviews;
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const currentResult = useRef(result);
  currentResult.current = result;
  useEffect(() => { setReason(''); setMessage(''); setRevoked([]); setBusy(false); }, [result]);
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
    <p className="text-slate-400">{view.confirmed ? 'Deployed file bytes confirmed. ' : ''}This result does not verify behavior in X4.</p>
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
