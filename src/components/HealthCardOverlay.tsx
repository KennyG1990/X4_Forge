/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Startup walkaround card (beta-UX D1) — fetched once on app boot, shown when anything
 * deserves attention (never nags on an all-green environment), dismissible.
 */

import React, { useEffect, useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import type { StudioLayoutPreferences } from '../lib/studioLayout';

interface HealthRow { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'unknown'; detail: string }
interface HealthCardData { rows: HealthRow[]; verdict: 'ready' | 'attention' | 'blocked'; summary: string; activeMod?: string | null }

interface HealthCardOverlayProps extends Pick<StudioLayoutPreferences, 'toolDock' | 'workspaceDock'> {
  rightInspectorOpen?: boolean;
}

const HealthCardOverlay: React.FC<HealthCardOverlayProps> = ({ toolDock, workspaceDock, rightInspectorOpen = false }) => {
  const [card, setCard] = useState<HealthCardData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/health-card');
        if (!res.ok || stopped) return;
        const data = await res.json();
        if (!stopped && data?.rows) setCard(data);
      } catch { /* server booting — skip silently */ }
    })();
    return () => { stopped = true; };
  }, []);

  if (!card || dismissed || card.verdict === 'ready') return null;

  const horizontalSafeArea = toolDock === 'right' && rightInspectorOpen
    ? 'right-[380px] w-[min(340px,calc(100vw-24.5rem))]'
    : rightInspectorOpen
      ? 'right-[324px] w-[min(360px,calc(100vw-21rem))]'
      : toolDock === 'right'
        ? 'right-16 w-[min(380px,calc(100vw-5rem))]'
        : 'right-4 w-[min(380px,calc(100vw-2rem))]';
  const verticalSafeArea = workspaceDock === 'bottom' ? 'bottom-20' : 'bottom-9';

  return (
    <div
      data-testid="health-card"
      className={`fixed ${verticalSafeArea} ${horizontalSafeArea} z-[90] rounded-lg border shadow-2xl bg-[#11141a]/98 backdrop-blur p-3 text-[11px] ${
        card.verdict === 'blocked' ? 'border-rose-500/40' : 'border-amber-500/35'
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <span className={`font-semibold text-xs flex items-center gap-1.5 ${card.verdict === 'blocked' ? 'text-rose-300' : 'text-amber-300'}`}>
          <ClipboardCheck className="w-3.5 h-3.5" /> Startup walkaround
        </span>
        <button data-testid="health-card-dismiss" onClick={() => setDismissed(true)} className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="py-1.5 text-slate-300">{card.summary}</div>
      <div className="space-y-1 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
        {card.rows.map(r => (
          <div key={r.id} className="grid grid-cols-[14px_128px_1fr] gap-1.5 items-start">
            <span className={
              r.status === 'pass' ? 'text-emerald-400' :
              r.status === 'warn' ? 'text-amber-400' :
              r.status === 'fail' ? 'text-rose-400' : 'text-slate-500'
            }>
              {r.status === 'pass' ? '●' : r.status === 'warn' ? '▲' : r.status === 'fail' ? '✗' : '?'}
            </span>
            <span className="text-slate-200 font-medium">{r.label}</span>
            <span className="text-slate-400 leading-tight" title={r.detail}>{r.detail.length > 110 ? r.detail.slice(0, 110) + '…' : r.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HealthCardOverlay;
