/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * StarterCard (B13b2, deferred from B22s2) — the ONE card for every starter list.
 * Templates, recipes, and proven patterns rendered three near-identical button blocks
 * that drifted independently; this is the single shape, tone-varied.
 */

import React from 'react';

export type StarterTone = 'cyan' | 'emerald' | 'amber';

const TONES: Record<StarterTone, { border: string; text: string; hoverText: string }> = {
  cyan:    { border: 'border-white/10 bg-white/[0.02] hover:border-cyan-500/40 hover:bg-cyan-500/5',          text: 'text-cyan-300',    hoverText: 'group-hover:text-cyan-200' },
  emerald: { border: 'border-emerald-500/15 bg-emerald-500/[0.03] hover:border-emerald-500/40 hover:bg-emerald-500/10', text: 'text-emerald-300', hoverText: 'group-hover:text-emerald-200' },
  amber:   { border: 'border-amber-500/15 bg-amber-500/[0.03] hover:border-amber-500/40 hover:bg-amber-500/10',          text: 'text-amber-300',   hoverText: 'group-hover:text-amber-200' },
};

export interface StarterCardProps {
  testid: string;
  title: string;
  blurb: string;
  tone: StarterTone;
  onClick: () => void;
  /** Optional third line (e.g. pattern provenance), truncated. */
  footnote?: string;
  /** Optional hover tooltip (e.g. full provenance). */
  tooltip?: string;
}

const StarterCard: React.FC<StarterCardProps> = ({ testid, title, blurb, tone, onClick, footnote, tooltip }) => {
  const t = TONES[tone];
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      title={tooltip}
      className={`text-left p-2.5 rounded-lg border transition-colors group cursor-pointer ${t.border}`}
    >
      <div className={`font-semibold text-xs ${t.text} ${t.hoverText}`}>{title}</div>
      <div className="text-slate-500 text-[10px] mt-0.5 leading-snug">{blurb}</div>
      {footnote && <div className="text-slate-600 text-[9px] mt-0.5 italic truncate">{footnote}</div>}
    </button>
  );
};

export default StarterCard;
