/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  PackageCheck,
  Scroll,
  Layers,
  Brain,
  Database,
  Globe,
  FileCode,
  Wrench,
  CheckCircle,
  Folder,
  CheckSquare,
  Square
} from 'lucide-react';
import { ModWorkspace } from '../types';
import DeployValidationSummary from './DeployValidationSummary';
import DeployFileChanges from './DeployFileChanges';
import type { DeployReviewData } from '../lib/deployClient';
import { ModalShell } from './ui';

export interface DeployChecklistRow {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  detail: string;
}

interface CompileConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreview: () => void;
  onConfirm: () => void;
  onFormatChange: () => void;
  phase: 'preview' | 'apply' | null;
  reviewedDestination?: string;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  modWorkspacePath?: string;
  /** BACKLOG B7: live deploy-verify feedback rendered IN the wizard (was hidden in Playtest). */
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  compileMessage?: string;
  checklist?: DeployChecklistRow[];
  deployResult?: DeployReviewData | null;
}

const CHECK_COLORS: Record<DeployChecklistRow['status'], string> = {
  pass: 'text-emerald-400',
  warn: 'text-amber-400',
  fail: 'text-red-400',
  skipped: 'text-slate-600',
};
const CHECK_GLYPH: Record<DeployChecklistRow['status'], string> = {
  pass: '✓', warn: '!', fail: '✗', skipped: '·',
};

export default function CompileConfirmationModal({
  isOpen,
  onClose,
  onPreview,
  onConfirm,
  onFormatChange,
  phase,
  reviewedDestination,
  workspace,
  setWorkspace,
  modWorkspacePath,
  compileStatus = 'idle',
  compileMessage = '',
  checklist = [],
  deployResult = null
}: CompileConfirmationModalProps) {
  // B84: the deploy FORMAT toggle. Hooks must sit above the `isOpen` early return.
  // The value is server-persisted config, not workspace state, so every deploy surface
  // (wizard, IDE, agent API) agrees on one answer.
  const [deployFormat, setDeployFormat] = React.useState<'loose' | 'catalog' | null>(null);
  const [formatBusy, setFormatBusy] = React.useState(false);
  const [formatError, setFormatError] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schema/config');
        const data = await res.json();
        if (!cancelled && data?.deployFormat?.format) setDeployFormat(data.deployFormat.format);
      } catch {
        // A read failure leaves the toggle in its unknown state rather than asserting a
        // format the server may not agree with.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const chooseDeployFormat = async (next: 'loose' | 'catalog') => {
    if (next === deployFormat || formatBusy || phase) return;
    onFormatChange();
    setFormatBusy(true);
    setFormatError('');
    const previous = deployFormat;
    setDeployFormat(next);
    try {
      const res = await fetch('/api/schema/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployFormat: next }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || `Save failed (${res.status})`);
    } catch (error) {
      // Never leave the toggle showing a preference the server did not store.
      setDeployFormat(previous);
      setFormatError(error instanceof Error ? error.message : 'Could not save the deploy format.');
    } finally {
      setFormatBusy(false);
    }
  };

  if (!isOpen) return null;

  const compileSettings = workspace.compileSettings || {
    md: true,
    ui: true,
    ai: true,
    library: true,
    translations: true,
    patches: true
  };

  const handleToggleSetting = (key: keyof NonNullable<ModWorkspace['compileSettings']>) => {
    setWorkspace(prev => ({
      ...prev,
      compileSettings: {
        ...compileSettings,
        [key]: !compileSettings[key]
      }
    }));
  };

  const handleSelectAll = (select: boolean) => {
    setWorkspace(prev => ({
      ...prev,
      compileSettings: {
        md: select,
        ui: select,
        ai: select,
        library: select,
        translations: select,
        patches: select
      }
    }));
  };

  // Human-readable titles, icons, and descriptions for each of the 6 targets
  const targets = [
    {
      key: 'md' as const,
      title: 'MD Scripts',
      desc: 'Generates Mission Director visual logic nodes, events, conditions, actions, and cues.',
      icon: <Scroll className="w-4 h-4 text-emerald-400" />
    },
    {
      key: 'ui' as const,
      title: 'HUD & Lua UI',
      desc: 'Builds customized layout widget menus, in-game canvas HUD items, text prompts, and lua binds.',
      icon: <Layers className="w-4 h-4 text-sky-400" />
    },
    {
      key: 'ai' as const,
      title: 'AI Behaviors',
      desc: 'Compiles custom ship commands, tactical behaviors, trade routes, and automated job loops.',
      icon: <Brain className="w-4 h-4 text-fuchsia-400" />
    },
    {
      key: 'library' as const,
      title: 'Wares & Jobs',
      desc: 'Assembles XML files for economy items, production blueprints, job quotas, and ship spawners.',
      icon: <Database className="w-4 h-4 text-blue-400" />
    },
    {
      key: 'translations' as const,
      title: 'T Languages',
      desc: 'Creates standard multi-lingual t/ tables for localized names, descriptions, and voice triggers.',
      icon: <Globe className="w-4 h-4 text-amber-400" />
    },
    {
      key: 'patches' as const,
      title: 'XML Patching',
      desc: 'Produces diff-based add/replace/remove patch node sets to safely adapt vanilla source files.',
      icon: <FileCode className="w-4 h-4 text-purple-400" />
    }
  ];

  const selectedCount = Object.values(compileSettings).filter(Boolean).length;

  return (
    <ModalShell
      title="Compile & Deploy Wizard"
      subtitle="Review targets, choose deploy format, and preview changes before writing to X4"
      icon={(
        <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <PackageCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>
      )}
      borderTone="emerald"
      onClose={onClose}
      closeButtonTitle="Cancel and close"
      dataTestId="compile-confirmation-modal"
      maxWidthClass="max-w-[540px]"
      zIndexClass="z-[120]"
      footer={(
        <div className="space-y-3">
          {reviewedDestination && (
            <div className="rounded-md border border-white/[0.08] bg-[#141820] px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 space-y-1 text-[11px] font-mono">
                <p className="text-slate-200 break-all" role="status" data-testid="wizard-deploy-destination">X4 install destination · {reviewedDestination}</p>
                {deployResult?.effect && <DeployFileChanges effect={deployResult.effect} />}
              </div>
              <button
                type="button"
                data-testid="wizard-apply-deploy"
                onClick={onConfirm}
                disabled={selectedCount === 0 || phase !== null || formatBusy}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-black rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                Deploy + Verify
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 select-none">
            <div className="text-[11px] font-mono text-slate-400">
              <span className="text-emerald-400 font-semibold">{selectedCount}</span> of 6 targets active
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-white/10 hover:border-white/20 hover:bg-white/[0.05] text-slate-300 hover:text-white rounded-md text-xs font-medium transition-colors cursor-pointer"
              >
                {phase === 'apply' || compileStatus === 'success' || compileStatus === 'error' ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                data-testid="wizard-preview-deploy"
                onClick={onPreview}
                disabled={selectedCount === 0 || phase !== null || formatBusy}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-black rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                Preview deployment
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {/* Info panel context line */}
      <div className="px-4 py-2 border-b border-white/[0.08] bg-[#0e1219] flex items-center justify-between text-[11px] font-mono select-none">
        <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
          <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-100 font-semibold truncate max-w-[260px]">
            {workspace.name || 'Untitled_Mod'}
          </span>
          <span className="text-emerald-400/90 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[11px]">
            v{workspace.version || '1.0.0'}
          </span>
        </div>
        <div className="text-slate-400 shrink-0">
          Author: <span className="text-slate-200">{workspace.author || 'Moshi'}</span>
        </div>
      </div>

      {/* Scrollable grid area of targets */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 select-none">
          <span>Choose elements to build</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer focus:outline-none"
            >
              Select all
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="text-slate-400 hover:text-slate-200 hover:underline cursor-pointer focus:outline-none"
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {targets.map(t => {
            const isActive = !!compileSettings[t.key];
            return (
              <div
                key={t.key}
                onClick={() => handleToggleSetting(t.key)}
                className={`p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 group cursor-pointer select-none ${
                  isActive
                    ? 'bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/45'
                    : 'bg-[#0e1219] border-white/[0.06] hover:border-white/15'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5" onClick={(e) => { e.stopPropagation(); handleToggleSetting(t.key); }}>
                    {isActive ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 cursor-pointer" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 shrink-0 cursor-pointer" />
                    )}
                  </div>
                  <div className="flex shrink-0 mt-0.5">{t.icon}</div>
                  <div className="space-y-0.5 min-w-0">
                    <span className={`text-xs font-medium block ${isActive ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`}>
                      {t.title}
                    </span>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {t.desc}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-[11px] font-medium text-right">
                  {isActive ? (
                    <span className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                      Building
                    </span>
                  ) : (
                    <span className="text-slate-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded">
                      Skipped
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* B84: deploy FORMAT toggle — the author picks how the mod lands in the game folder,
          and each option states its real consequence rather than a bare label. */}
      <div className="mx-4 mb-4 p-3 bg-[#0e1219] border border-white/[0.08] rounded-lg space-y-2" data-testid="deploy-format-toggle">
        <div className="text-slate-300 text-[11px] font-medium flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-sky-400" />
          Deploy format
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            {
              key: 'loose' as const,
              title: 'Loose files',
              desc: 'Every file written to the mod folder as a real file. Readable, diffable, hand-editable — and native .dll/.so files load normally. Most X4 mods ship this way.',
            },
            {
              key: 'catalog' as const,
              title: 'CAT / DAT archive',
              desc: 'Payload packed into ext_01.cat + ext_01.dat. Tidier, but packed files no longer exist individually on disk, and native binaries inside an archive cannot load.',
            },
          ]).map(option => {
            const selected = deployFormat === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => chooseDeployFormat(option.key)}
                disabled={formatBusy || phase !== null}
                aria-pressed={selected}
                data-testid={`deploy-format-${option.key}`}
                className={`text-left p-2.5 rounded-md border transition-colors disabled:opacity-60 cursor-pointer ${
                  selected
                    ? 'border-sky-500/60 bg-sky-500/10'
                    : 'border-white/[0.06] bg-[#090c11] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {selected
                    ? <CheckSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    : <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                  <span className={`text-xs font-medium ${selected ? 'text-sky-200' : 'text-slate-300'}`}>
                    {option.title}
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-slate-400">{option.desc}</div>
              </button>
            );
          })}
        </div>
        {deployFormat === null && !formatError && (
          <div className="text-[11px] text-slate-400">Reading the saved deploy format…</div>
        )}
        {formatError && (
          <div className="text-[11px] text-rose-300" role="alert">{formatError}</div>
        )}
      </div>

      {/* Staging target directory info */}
      {modWorkspacePath && (
        <div className="mx-4 mb-4 p-3 bg-[#0e1219] border border-white/[0.08] rounded-lg text-[11px] leading-relaxed text-slate-400 space-y-1">
          <div className="text-slate-300 font-medium flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-sky-400" />
            Staging target location
          </div>
          <div className="text-slate-200 font-mono select-all break-all pr-2">
            {modWorkspacePath}
          </div>
        </div>
      )}

      {/* B7: deploy-verify preflight result — rendered IN the wizard, not hidden in Playtest */}
      {(deployResult || compileStatus !== 'idle') && (
        <div className="mx-4 mb-4 p-3 bg-[#0e1219] border border-white/[0.08] rounded-lg text-[11px] leading-relaxed space-y-1.5 shrink-0 max-h-[40vh] overflow-y-auto custom-scrollbar" data-testid="wizard-preflight-card">
          {deployResult && compileStatus !== 'compiling' ? <DeployValidationSummary result={deployResult} /> : (
            <div className={`text-xs font-medium ${
              compileStatus === 'compiling' ? 'text-sky-300' : 'text-slate-200'
            }`}>
              {phase === 'preview' ? 'Running deployment preview…' : phase === 'apply' ? 'Deploying and verifying…' : compileStatus === 'success' ? 'Deployment result unavailable' : 'Build stopped'}
            </div>
          )}
          {compileMessage && <div className="text-slate-200 font-mono break-all">{compileMessage}</div>}
          {deployResult?.deployRecord?.id && <p className="text-slate-400 font-mono break-all">Deploy receipt · {deployResult.deployRecord.id}</p>}
          {checklist.map(row => (
            <div key={row.id} className="flex items-start gap-1.5 font-mono">
              <span className={`${CHECK_COLORS[row.status]} font-bold w-3 shrink-0`}>{CHECK_GLYPH[row.status]}</span>
              <span className={row.status === 'fail' ? 'text-rose-300' : row.status === 'skipped' ? 'text-slate-500' : 'text-slate-300'}>
                {row.label}
                {/* B84: the deploy row ALWAYS shows its detail — that is where the plain
                    account of what format was written now lives. */}
                {(row.status !== 'pass' || row.id === 'deploy') && row.detail
                  ? <span className="text-slate-400"> — {row.detail}</span>
                  : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
