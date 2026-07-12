/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Guided rail (BACKLOG B19 slice 1, Vision v2 Phase 1 keystone — 2026-07-11).
 *
 * The hand that DOESN'T let go: after a starter template/recipe loads, this rail
 * carries the newcomer through the three steps between "canvas has nodes" and
 * "I saw MY mod in MY game" — the exact stretch the old onboarding abandoned:
 *   ① TWEAK  — template-declared hint pointing at the one node worth changing.
 *   ② DEPLOY — the existing deploy-verify chain, result rendered in place.
 *   ③ SEE IT — live debug-watcher status + the template's "what to look for".
 * Dismissible at any step (veteran floor — never modal, never mandatory).
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Wrench, Rocket, Gamepad2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { ModWorkspace } from '../types';
import type { RailGuide } from '../lib/modTemplates';
import { ttfm } from '../lib/ttfm';

interface GuidedRailProps {
  title: string;
  guide: RailGuide | null;      // null → generic hints (recipes without metadata)
  getWorkspace: () => ModWorkspace;
  onClose: () => void;
}

type DeployState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'ok'; detail: string }
  | { phase: 'fail'; detail: string };

const GuidedRail: React.FC<GuidedRailProps> = ({ title, guide, getWorkspace, onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [deploy, setDeploy] = useState<DeployState>({ phase: 'idle' });
  const [watcher, setWatcher] = useState<string>('Waiting for the game…');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3: poll the debug-watcher brief so "did the game see it" is LIVE, not a claim.
  useEffect(() => {
    if (step !== 3) { if (pollRef.current) clearInterval(pollRef.current); return; }
    const poll = async () => {
      try {
        const res = await fetch('/api/agent/debug-watcher/brief');
        const b = await res.json();
        if (!res.ok) { setWatcher('Log watcher unavailable.'); return; }
        const errs = Number(b?.modRuntime?.errorCount ?? b?.erroringCount ?? 0);
        if (b?.gameSeen === false || b?.logFound === false) {
          setWatcher('No game log yet — start X4 (or reload a save) with the mod deployed.');
        } else if (errs > 0) {
          setWatcher(`Game log found — ${errs} error(s) attributed to your mod. Check the canvas badges.`);
        } else {
          // B20: the funnel's finish line — the game's log is present and clean.
          if (ttfm.mark('game_confirmed')) {
            const total = ttfm.totalMs();
            if (total !== null) setWatcher(`Game log looks clean — your first mod is IN THE GAME (${Math.round(total / 60000)} min from first boot). ${guide?.gameCheck || ''}`);
            else setWatcher('Game log looks clean. ' + (guide?.gameCheck || 'Load a save and watch for your change.'));
          } else {
            setWatcher('Game log looks clean. ' + (guide?.gameCheck || 'Load a save and watch for your change.'));
          }
        }
      } catch {
        setWatcher('Log watcher unavailable.');
      }
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, guide]);

  const runDeploy = async () => {
    setDeploy({ phase: 'running' });
    try {
      const res = await fetch('/api/agent/deploy-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: getWorkspace() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        ttfm.mark('first_deploy'); // B20 funnel stage
        setDeploy({ phase: 'ok', detail: `Deployed to ${data.deployedPath || data.stagingPath || 'the game'}.` });
        setStep(3);
      } else {
        const failed = (data.checklist || []).find((c: { status: string }) => c.status === 'fail');
        setDeploy({ phase: 'fail', detail: data.error || (failed ? `${failed.label}: ${failed.detail}` : 'Deploy failed.') });
      }
    } catch (e) {
      setDeploy({ phase: 'fail', detail: e instanceof Error ? e.message : 'Deploy failed (connection).' });
    }
  };

  const stepChip = (n: 1 | 2 | 3, icon: React.ReactNode, label: string) => (
    <button
      data-testid={`rail-step-${n}`}
      onClick={() => setStep(n)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
        step === n ? 'bg-cyan-600/40 text-cyan-100 border border-cyan-400/50' : 'bg-white/5 text-slate-400 border border-white/10 hover:border-cyan-500/30'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div data-testid="guided-rail" className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[560px] max-w-[92%]">
      <div className="bg-[#0f131a]/97 border border-cyan-500/25 rounded-xl shadow-2xl glass-effect p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {stepChip(1, <Wrench size={11} />, '1 · Make it yours')}
            {stepChip(2, <Rocket size={11} />, '2 · Put it in the game')}
            {stepChip(3, <Gamepad2 size={11} />, '3 · See it')}
          </div>
          <button data-testid="rail-close" onClick={onClose} className="text-slate-500 hover:text-slate-300 cursor-pointer" aria-label="Dismiss guide">
            <X size={14} />
          </button>
        </div>

        {step === 1 && (
          <div className="text-[11px] text-slate-300 leading-relaxed" data-testid="rail-tweak">
            <span className="text-cyan-300 font-semibold">{title}</span> is a working mod already.{' '}
            {guide?.tweakHint || 'Click any node and change a property to make it yours.'}{' '}
            <button data-testid="rail-next" onClick={() => setStep(2)} className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 cursor-pointer font-semibold">
              Done tweaking → deploy it
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-[11px] text-slate-300 leading-relaxed">
            {deploy.phase === 'idle' && (
              <>
                One click validates, compiles, and installs the mod into your game folder.{' '}
                <button data-testid="rail-deploy" onClick={runDeploy} className="ml-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer">
                  Deploy to X4
                </button>
              </>
            )}
            {deploy.phase === 'running' && (
              <span className="inline-flex items-center gap-1.5 text-cyan-300"><Loader2 size={12} className="animate-spin" /> Validating and deploying…</span>
            )}
            {deploy.phase === 'ok' && (
              <span className="inline-flex items-center gap-1.5 text-emerald-300"><CheckCircle2 size={12} /> {deploy.detail}</span>
            )}
            {deploy.phase === 'fail' && (
              <span className="inline-flex items-start gap-1.5 text-amber-300">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {deploy.detail} — fix the highlighted issue and deploy again.
                <button onClick={runDeploy} className="text-cyan-300 underline underline-offset-2 cursor-pointer shrink-0">Retry</button>
              </span>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-[11px] text-slate-300 leading-relaxed" data-testid="rail-game">
            <div className="flex items-start gap-1.5">
              <Gamepad2 size={12} className="mt-0.5 shrink-0 text-cyan-300" />
              <span>{watcher}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidedRail;
