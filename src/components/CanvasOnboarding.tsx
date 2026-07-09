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

interface CanvasOnboardingProps {
  onLoad: (workspace: ModWorkspace) => void;
}

const CanvasOnboarding: React.FC<CanvasOnboardingProps> = ({ onLoad }) => {
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-[460px] max-w-[82%] bg-[#0f131a]/97 border border-cyan-500/25 rounded-xl shadow-2xl glass-effect p-5">
        <div className="text-center mb-3.5">
          <div className="text-white font-bold text-sm tracking-wide">Start a new mod</div>
          <div className="text-slate-400 text-[11px] mt-1 leading-relaxed">
            Pick a starter to begin with a working example — or press <span className="px-1 py-0.5 rounded bg-white/10 text-slate-200 font-mono text-[9px]">Space</span> on the canvas to drop a node.
          </div>
        </div>
        {!activeRecipe && (
          <div className="grid grid-cols-1 gap-2">
            {MOD_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => onLoad(buildTemplateWorkspace(t.id))}
                className="text-left p-2.5 rounded-lg border border-white/10 bg-white/[0.02] hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors group cursor-pointer"
              >
                <div className="text-cyan-300 font-semibold text-xs group-hover:text-cyan-200">{t.title}</div>
                <div className="text-slate-500 text-[10px] mt-0.5 leading-snug">{t.blurb}</div>
              </button>
            ))}
            <div className="pt-1.5 border-t border-white/5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">Recipes — describe it, we build it</div>
            {MOD_RECIPES.map(r => (
              <button
                key={r.id}
                data-testid={`recipe-${r.id}`}
                onClick={() => { setActiveRecipe(r.id); setAnswers({}); }}
                className="text-left p-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.03] hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-colors group cursor-pointer"
              >
                <div className="text-emerald-300 font-semibold text-xs group-hover:text-emerald-200">{r.title}</div>
                <div className="text-slate-500 text-[10px] mt-0.5 leading-snug">{r.blurb}</div>
              </button>
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
                  <label className="text-slate-300 text-[10px] font-semibold block mb-0.5">{q.label}</label>
                  <div className="text-slate-500 text-[9px] mb-1">{q.help}</div>
                  <input
                    type={q.type === 'number' ? 'number' : 'text'}
                    value={answers[q.key] ?? ''}
                    placeholder={q.default}
                    data-testid={`recipe-q-${q.key}`}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
                    className="w-full p-1.5 rounded bg-black/60 border border-white/10 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  data-testid="recipe-build"
                  onClick={() => { onLoad(buildRecipeWorkspace(recipe.id, answers)); setActiveRecipe(null); }}
                  className="flex-1 px-3 py-1.5 rounded bg-emerald-600/30 border border-emerald-500/50 hover:bg-emerald-600/50 text-emerald-100 font-bold text-[11px] transition-all cursor-pointer"
                >
                  Build my mod
                </button>
                <button
                  onClick={() => setActiveRecipe(null)}
                  className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-[11px] transition-all cursor-pointer"
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
