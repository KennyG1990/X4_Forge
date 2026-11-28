/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Empty-canvas onboarding (G9) + recipe wizards (beta-UX D2) — extracted from
 * Canvas.tsx (audit A7, 2026-07-09: god-component split, same register pattern the
 * server modules use). Owns its own wizard state; the parent only supplies onLoad.
 */

import React, { useState } from 'react';
import type { ModWorkspace } from '../types';
import { MOD_TEMPLATES, buildTemplateWorkspace } from '../lib/modTemplates';
import { MOD_RECIPES, buildRecipeWorkspace } from '../lib/modRecipes';
import { MOD_PATTERNS, buildPatternWorkspace } from '../lib/modPatterns';
import StarterCard from './StarterCard';

interface CanvasOnboardingProps {
  /** B19: sourceId identifies what was loaded ('welcome' | 'recipe:timed_message' | …)
   *  so the guided rail can pick up template-specific hand-holding. */
  onLoad: (workspace: ModWorkspace, sourceId?: string) => void;
}

const CanvasOnboarding: React.FC<CanvasOnboardingProps> = ({ onLoad }) => {
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      {/* B19s2b: 3 beyond-canvas templates joined the list — cap height so the card
          scrolls instead of clipping on short viewports. */}
      <div className="pointer-events-auto w-[460px] max-w-[82%] max-h-[85%] overflow-y-auto scrollbar-thin bg-[#0c0e12]/97 border border-[#262c36] rounded-xl shadow-2xl p-5">
        <div className="text-center mb-3.5">
          <div className="text-[#eef2f7] font-semibold text-sm tracking-wide">Start a new mod</div>
          <div className="text-[#a0aab8] text-[11px] mt-1 leading-relaxed">
            Pick a starter to begin with a working example — or press <span className="px-1.5 py-0.5 rounded bg-[#171b23] border border-[#262c36] text-[#eef2f7] font-mono text-[11px]">Space</span> on the canvas to drop a node.
          </div>
        </div>
        {!activeRecipe && (
          <div className="grid grid-cols-1 gap-2">
            {/* B13b2: all three starter lists render the ONE StarterCard (tone-varied). */}
            {MOD_TEMPLATES.map(t => (
              <StarterCard key={t.id} testid={`template-${t.id}`} tone="cyan"
                title={t.title} blurb={t.blurb}
                onClick={() => onLoad(buildTemplateWorkspace(t.id), t.id)} />
            ))}
            <div className="pt-2 border-t border-[#262c36] text-[11px] font-mono uppercase tracking-wider text-emerald-300">Recipes — describe it, we build it</div>
            {MOD_RECIPES.map(r => (
              <StarterCard key={r.id} testid={`recipe-${r.id}`} tone="emerald"
                title={r.title} blurb={r.blurb}
                onClick={() => { setActiveRecipe(r.id); setAnswers({}); }} />
            ))}
            {/* B22: proven patterns — provenance-carrying fragments from shipping mods. */}
            <div className="pt-2 border-t border-[#262c36] text-[11px] font-mono uppercase tracking-wider text-amber-300">Proven patterns — how real mods do it</div>
            {MOD_PATTERNS.map(p => (
              <StarterCard key={p.id} testid={`pattern-${p.id}`} tone="amber"
                title={p.title} blurb={p.blurb}
                footnote={`proven by ${p.provenance.provenMod}`}
                tooltip={`${p.provenance.provenMod} — ${p.provenance.file}\n${p.provenance.note}`}
                onClick={() => onLoad(buildPatternWorkspace(p.id), `pattern:${p.id}`)} />
            ))}
          </div>
        )}
        {activeRecipe && (() => {
          const recipe = MOD_RECIPES.find(r => r.id === activeRecipe)!;
          return (
            <div className="space-y-2.5" data-testid="recipe-wizard">
              <div className="text-emerald-300 font-semibold text-xs">{recipe.title}</div>
              {recipe.questions.map(q => (
                <div key={q.key}>
                  <label className="text-[#eef2f7] text-[11px] font-semibold block mb-0.5">{q.label}</label>
                  <div className="text-[#a0aab8] text-[11px] mb-1">{q.help}</div>
                  <input
                    type={q.type === 'number' ? 'number' : 'text'}
                    value={answers[q.key] ?? ''}
                    placeholder={q.default}
                    data-testid={`recipe-q-${q.key}`}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                    className="w-full p-2 rounded bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] placeholder-[#687385] text-[11px] focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  data-testid="recipe-build"
                  onClick={() => { onLoad(buildRecipeWorkspace(recipe.id, answers), `recipe:${recipe.id}`); setActiveRecipe(null); }}
                  className="flex-1 px-3 py-1.5 rounded bg-emerald-600/25 border border-emerald-500/45 hover:bg-emerald-600/40 text-emerald-100 font-semibold text-[11px] transition-colors cursor-pointer"
                >
                  Build my mod
                </button>
                <button
                  onClick={() => setActiveRecipe(null)}
                  className="px-3 py-1.5 rounded bg-[#171b23] border border-[#262c36] hover:bg-[#1e2430] text-[#a0aab8] hover:text-[#eef2f7] text-[11px] transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default CanvasOnboarding;
