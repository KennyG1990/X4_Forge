/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B52 — "Report a Bug" modal. Collects a title + description, shows the exact technical
 * context that will be attached (nothing hidden), and hands off to a PREFILLED GitHub
 * new-issue page in the user's browser (they submit under their own account — the app never
 * talks to GitHub and carries no secrets). "Copy report" is the universal fallback for users
 * without GitHub or with popups blocked. Engine: src/lib/bugReport.ts (oracle-backed).
 */

import React, { useMemo, useState } from 'react';
import { Bug, Copy, ExternalLink, X, Check } from 'lucide-react';
import { buildBugReport, BUG_TRACKER_REPO } from '../lib/bugReport';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Auto-gathered environment (version/build/platform/workspace…) shown to the user verbatim. */
  context: Record<string, string>;
}

export default function BugReportModal({ isOpen, onClose, context }: BugReportModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const report = useMemo(
    () => buildBugReport({ title, description, context, includeContext }),
    [title, description, context, includeContext],
  );

  if (!isOpen) return null;

  const openIssue = () => {
    if (!report.ok || !report.issueUrl) { setError(report.error || 'Could not build the report.'); return; }
    setError('');
    if (report.truncated) void navigator.clipboard?.writeText(report.body || '');
    window.open(report.issueUrl, '_blank', 'noopener,noreferrer');
  };

  const copyReport = async () => {
    const body = report.ok ? report.body || '' : `${title}\n\n${description}`;
    try {
      await navigator.clipboard.writeText(`Bug report for ${BUG_TRACKER_REPO}:\n\n# ${title}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Clipboard unavailable — select and copy the text manually.'); }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" data-testid="bug-report-modal">
      <div className="w-[560px] max-w-[94vw] max-h-[88vh] overflow-y-auto rounded-xl border border-amber-500/25 bg-[#0d1017] shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 font-mono text-[12px] font-bold text-amber-300">
            <Bug className="w-4 h-4" /> REPORT A BUG
          </div>
          <button onClick={onClose} title="Close" className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-[12px] text-slate-300">
          <p className="text-slate-400 leading-relaxed">
            This opens a <span className="text-slate-200">pre-filled bug report</span> on the X4 Forge GitHub page
            (<span className="font-mono text-[11px]">{BUG_TRACKER_REPO}</span>) — review it there and press
            <span className="text-slate-200"> Submit</span>. Submitting needs a free GitHub account; no GitHub?
            Use <span className="text-slate-200">Copy report</span> and paste it in Discord instead.
          </p>

          <div>
            <label className="block font-mono text-[10px] uppercase text-slate-500 mb-1">Short title *</label>
            <input
              data-testid="bug-title"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(''); }}
              placeholder="e.g. Deploy button does nothing after switching workspace"
              className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-2 text-slate-200 outline-none focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase text-slate-500 mb-1">What happened? Steps to reproduce?</label>
            <textarea
              data-testid="bug-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder={'1. What you did\n2. What you expected\n3. What actually happened'}
              className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-2 text-slate-200 outline-none focus:border-amber-500/50 resize-y font-mono text-[11.5px] leading-relaxed"
            />
          </div>

          {/* Context — shown verbatim so nothing rides along invisibly */}
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={includeContext} onChange={e => setIncludeContext(e.target.checked)} />
              <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">Attach technical details (recommended)</span>
            </label>
            {includeContext && (
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-slate-500">
                {Object.entries(context).map(([k, v]) => (
                  <React.Fragment key={k}><span>{k}</span><span className="text-slate-400 truncate">{v}</span></React.Fragment>
                ))}
              </div>
            )}
          </div>

          {error && <div className="rounded border border-red-500/40 bg-red-500/10 text-red-300 px-3 py-2 font-mono text-[11px]">{error}</div>}

          <div className="flex items-center gap-2 pt-1">
            <button
              data-testid="bug-open-github"
              onClick={openIssue}
              disabled={!title.trim()}
              className="flex-1 px-3 py-2 rounded font-mono text-[11px] font-bold bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> OPEN GITHUB ISSUE
            </button>
            <button
              data-testid="bug-copy"
              onClick={() => void copyReport()}
              className="px-3 py-2 rounded font-mono text-[11px] font-bold bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 cursor-pointer flex items-center gap-1.5"
              title="Copy the full report as text (fallback if you don't use GitHub)"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'COPIED' : 'COPY REPORT'}
            </button>
          </div>
          {report.ok && report.truncated && (
            <p className="text-[10px] text-amber-300/80 font-mono">
              Long report: the GitHub page will show a shortened version — the FULL text is copied to your clipboard automatically; paste it into the issue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
