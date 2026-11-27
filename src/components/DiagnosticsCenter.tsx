/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Brain, PackageCheck, Boxes, Activity } from 'lucide-react';
import { ModWorkspace, PackageDiagnostic } from '../types';
import { analyzeCueLineage } from '../lib/cueLineage';
import DiagnosticsHub from './DiagnosticsHub';
import PackageModDoctor from './PackageModDoctor';
import type { ValidationDeltaResult } from '../lib/validationDelta';
import type { WorkspaceValidationInputs } from '../lib/workspaceValidationInputs';
import PerformancePanel from './PerformancePanel';

interface DiagnosticsCenterProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint?: (customTarget?: ModWorkspace) => void;
  modWorkspacePath: string;
  setWorkspaceView?: (view: any) => void;
  diagnostics: PackageDiagnostic[];
  diagnosticSource: 'checking' | 'project' | 'local';
  validationDelta?: ValidationDeltaResult | null;
  validationInputs?: WorkspaceValidationInputs;
  /** Jump to the Cues tab (the cue-health summary deep-links there). */
  onOpenCues?: () => void;
  /** A4.10 — gates the optional AI-polish affordance in the Scripts (MDScanner) view. */
  aiEnabled?: boolean;
  scope: DiagnosticsScope;
  onScopeChange: (scope: DiagnosticsScope) => void;
  onSuppressionCommitted?: (sourceHash: string) => void;
}

export type DiagnosticsScope = 'scripts' | 'package' | 'install' | 'performance';

const SCOPES: { id: DiagnosticsScope; label: string; icon: typeof Brain; activeClass: string }[] = [
  { id: 'package', label: 'Validation', icon: PackageCheck, activeClass: 'bg-blue-500/15 text-blue-200 border-blue-500/35' },
  { id: 'install', label: 'Mod Conflicts', icon: Boxes, activeClass: 'bg-blue-500/15 text-blue-200 border-blue-500/35' },
  { id: 'scripts', label: 'Scripts', icon: Brain, activeClass: 'bg-blue-500/15 text-blue-200 border-blue-500/35' },
  { id: 'performance', label: 'Performance', icon: Activity, activeClass: 'bg-blue-500/15 text-blue-200 border-blue-500/35' },
];

export default function DiagnosticsCenter({
  workspace,
  diagnostics,
  diagnosticSource,
  validationInputs,
  validationDelta,
  onOpenCues,
  aiEnabled = false,
  scope,
  onScopeChange,
  onSuppressionCommitted,
}: DiagnosticsCenterProps) {

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0c0e12]">
      {/* Scope selector */}
      <div className="flex min-w-0 overflow-x-auto border-b border-white/[0.08] bg-[#11141a] items-center gap-1 px-2 py-1.5 shrink-0 font-sans">
        {SCOPES.map(s => {
          const Icon = s.icon;
          const active = scope === s.id;
          return (
            <button
              key={s.id}
              data-testid={`diagnostics-scope-${s.id}`}
              aria-pressed={active}
              onClick={() => onScopeChange(s.id)}
              title={`${s.label} Diagnostics`}
              className={`shrink-0 px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer border ${
                active ? s.activeClass : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Scope viewport */}
      <div className="flex-1 overflow-hidden min-h-0">
        {scope === 'performance' && <PerformancePanel />}
        {scope === 'scripts' && (
          <DiagnosticsHub
            workspace={workspace}
            aiEnabled={aiEnabled}
          />
        )}

        {scope === 'package' && (
          <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {/* Cue health SUMMARY only — the full tree lives in the CUES tab. */}
            {(() => {
              const lf = analyzeCueLineage(workspace.nodes || [], workspace.links || []).findings;
              const errs = lf.filter(f => f.severity === 'error').length;
              const warns = lf.filter(f => f.severity === 'warning').length;
              return (
                <button
                  onClick={onOpenCues}
                  className={`mx-3 mt-3 shrink-0 flex items-center justify-between gap-2 rounded-lg border p-2.5 font-sans text-[11px] cursor-pointer transition-colors hover:bg-white/5 ${
                    errs > 0 ? 'border-red-500/30 bg-red-500/5 text-red-300'
                      : warns > 0 ? 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                        : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300'
                  }`}
                  title="Open the cue tree (navigate, diagnose, bind live game log)"
                >
                  <span className="font-semibold">Cue health</span>
                  <span className="font-mono">{errs > 0 || warns > 0 ? `${errs} error(s) · ${warns} warning(s)` : 'clean'} → Cues tab</span>
                </button>
              );
            })()}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PackageModDoctor
                workspace={workspace}
                diagnostics={diagnostics}
                diagnosticSource={diagnosticSource}
                validationInputs={validationInputs}
                validationDelta={validationDelta}
                focus="package"
                aiEnabled={aiEnabled}
                onSuppressionCommitted={onSuppressionCommitted}
              />
            </div>
          </div>
        )}

        {scope === 'install' && (
          <PackageModDoctor
            workspace={workspace}
            diagnostics={diagnostics}
            diagnosticSource={diagnosticSource}
            validationDelta={validationDelta}
            focus="install"
            onSuppressionCommitted={onSuppressionCommitted}
          />
        )}
      </div>
    </div>
  );
}
