/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, Server, X } from 'lucide-react';
import type { WorkspaceConflictPreview } from '../lib/workspaceConflict';

export interface WorkspaceConflictDetail {
  detectedAt: string;
  server: { head: string; snapshotHash?: string; version?: number; savedAt?: string; origin?: string; name?: string };
  local: { head: string; snapshotHash?: string; name?: string; updatedAt?: string };
  preview?: WorkspaceConflictPreview;
  previewUnavailable?: string;
}

interface Props {
  detail: WorkspaceConflictDetail | null;
  expanded: boolean;
  busy: 'server' | 'local' | '';
  error: string;
  onExpand: () => void;
  onCancel: () => void;
  onUseServer: () => void;
  onKeepLocal: () => void;
}

function when(value?: string): string {
  if (!value) return 'time unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function WorkspaceConflictDialog({ detail, expanded, busy, error, onExpand, onCancel, onUseServer, onKeepLocal }: Props) {
  const counts = detail?.preview?.counts;
  const changed = counts?.changed ?? 0;
  if (!expanded) {
    return (
      <button
        data-testid="sync-conflict-review"
        onClick={onExpand}
        className="fixed top-14 right-3 z-[9999] max-w-[calc(100vw-1.5rem)] rounded-lg border border-red-500/60 bg-[#1a0d0d]/95 px-3 py-2 font-mono text-[11px] text-red-100 shadow-2xl hover:bg-red-950"
      >
        <span className="font-bold">Workspace conflict</span>
        <span className="ml-2 text-red-300">{changed ? `${changed} changed file${changed === 1 ? '' : 's'}` : 'review both copies'} · Review</span>
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="workspace-conflict-title"
      data-testid="sync-conflict-dialog"
      className="fixed top-14 right-3 z-[9999] flex max-h-[calc(100vh-4.5rem)] w-[min(680px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-rose-500/45 bg-[#11151d] text-xs text-slate-200 shadow-2xl"
    >
      <header className="flex items-start gap-3 border-b border-rose-500/25 bg-[#141820] px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1">
          <h2 id="workspace-conflict-title" className="text-[13px] font-semibold text-rose-100">Two writers changed this workspace</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Nothing was overwritten. Compare both copies, then choose which one becomes the server head.</p>
        </div>
        <button data-testid="conflict-cancel-btn" onClick={onCancel} disabled={!!busy} className="rounded-md p-1 text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40 cursor-pointer" title="Cancel for now — write nothing"><X className="h-4 w-4" /></button>
      </header>

      <div className="overflow-y-auto custom-scrollbar px-4 py-3 text-[11px]">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/15 p-3" data-testid="conflict-server-meta">
            <div className="flex items-center gap-1.5 font-semibold text-sky-200"><Server className="h-3.5 w-3.5" /> Server copy</div>
            <div className="mt-2 break-all text-[11px] text-slate-200 font-mono">{detail?.server.name || 'Untitled'} · head {detail?.server.head?.slice(0, 12) || 'unknown'}</div>
            {detail?.server.snapshotHash ? <div className="mt-1 break-all text-[11px] font-mono text-slate-400">snapshot {detail.server.snapshotHash.slice(0, 12)}</div> : null}
            <div className="mt-1 text-[11px] text-slate-400">Saved {when(detail?.server.savedAt)} · {detail?.server.origin || 'origin unavailable'}</div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-3" data-testid="conflict-local-meta">
            <div className="font-semibold text-amber-200">My canvas</div>
            <div className="mt-2 break-all text-[11px] text-slate-200 font-mono">{detail?.local.name || 'Untitled'} · head {detail?.local.head?.slice(0, 12) || 'unknown'}</div>
            {detail?.local.snapshotHash ? <div className="mt-1 break-all text-[11px] font-mono text-slate-400">snapshot {detail.local.snapshotHash.slice(0, 12)}</div> : null}
            <div className="mt-1 text-[11px] text-slate-400">Edited {when(detail?.local.updatedAt)} · conflict detected {when(detail?.detectedAt)}</div>
          </div>
        </div>

        {counts ? (
          <div data-testid="conflict-file-counts" className="mt-3 rounded-md border border-white/[0.08] bg-[#0d1118] px-3 py-2 text-slate-300 font-mono">
            If my canvas wins: <span className="text-emerald-300">add {counts.added}</span> · <span className="text-amber-300">replace {counts.modified}</span> · <span className="text-rose-300">remove {counts.removed}</span>
            {detail?.preview?.truncated ? <span className="ml-2 text-amber-300">(preview bounded)</span> : null}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-amber-200">{detail?.previewUnavailable || 'File comparison unavailable; both content heads still prove divergence.'}</div>
        )}

        {detail?.preview?.files?.length ? (
          <div className="mt-3 space-y-2" data-testid="conflict-diff-list">
            {detail.preview.files.map(file => (
              <details key={`${file.kind}:${file.path}`} className="rounded-md border border-white/[0.08] bg-[#0d1118]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-slate-200 font-mono">
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  <span className={file.kind === 'added' ? 'text-emerald-300' : file.kind === 'removed' ? 'text-rose-300' : 'text-amber-300'}>
                    {file.kind === 'added' ? 'Added' : file.kind === 'removed' ? 'Removed' : 'Modified'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{file.path}</span>
                  {file.lines ? <span className="text-[11px] text-slate-400">+{file.lines.added}/−{file.lines.removed}</span> : null}
                </summary>
                {file.diff ? <pre className="max-h-48 overflow-auto border-t border-white/[0.08] p-3 text-[11px] font-mono leading-relaxed text-slate-300 whitespace-pre-wrap">{file.diff}</pre> : <div className="border-t border-white/[0.08] p-3 text-[11px] text-slate-400">{file.diffUnavailable}</div>}
              </details>
            ))}
          </div>
        ) : null}

        {error ? <div role="alert" data-testid="conflict-error" className="mt-3 rounded-md border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-rose-200">{error}</div> : null}
      </div>

      <footer className="grid gap-2 border-t border-white/[0.08] bg-[#0d1118] p-3 sm:grid-cols-2">
        <button data-testid="conflict-adopt-btn" onClick={onUseServer} disabled={!!busy} className="rounded-md border border-sky-500/40 bg-sky-950/25 px-3 py-2.5 text-left hover:bg-sky-900/35 disabled:opacity-40 cursor-pointer transition-colors">
          <span className="flex items-center gap-2 text-xs font-semibold text-sky-100">{busy === 'server' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Use server copy</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-slate-300">Replace my canvas. A local Undo checkpoint is created first.</span>
        </button>
        <button data-testid="conflict-keep-btn" onClick={onKeepLocal} disabled={!!busy} className="rounded-md border border-amber-500/40 bg-amber-950/25 px-3 py-2.5 text-left hover:bg-amber-900/35 disabled:opacity-40 cursor-pointer transition-colors">
          <span className="flex items-center gap-2 text-xs font-semibold text-amber-100">{busy === 'local' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Overwrite server with my canvas</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-slate-300">A bounded server recovery is saved first. Later changes make that recovery refuse safely.</span>
        </button>
      </footer>
    </section>
  );
}
