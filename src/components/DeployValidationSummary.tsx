import React from 'react';
import { deployReviewView, type DeployReviewData } from '../lib/deployClient';

/** Read-only view of server findings and recorded approval provenance. */
export default function DeployValidationSummary({ result }: { result: DeployReviewData }) {
  const view = deployReviewView(result);
  const review = result.validation?.review;
  const recorded = review?.status === 'recorded';
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
          <div className="break-all">Finding: <code>{approval.findingId}</code></div>
          <div className="break-all">{recorded && approval.receiptId ? <>Receipt: <code>{approval.receiptId}</code></> : 'No recorded approval receipt supplied.'}</div>
        </li>)}
      </ul>
    </details>}
  </section>;
}
