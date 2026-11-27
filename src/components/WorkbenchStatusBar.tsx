/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IDE Status Bar (26px) — Unified bottom telemetry & quick-toggle strip.
 * Houses active mod identity, problem counters, Bottom Panel (Ctrl+J) toggle,
 * Right Inspector toggle, Agent Sync status, and docked FpsMeter (eliminating
 * bottom-left Canvas minimap collisions).
 */

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  PanelBottom,
  PanelRight,
} from 'lucide-react';
import { toSafeModId } from '../lib/modCompiler';
import type { ExperienceMode, WorkspaceView } from '../lib/experienceMode';
import FpsMeter from './FpsMeter';
import type { BottomDockTab } from './BottomWorkbenchDock';

interface WorkbenchStatusBarProps {
  modName: string;
  modVersion: string;
  workspaceView: WorkspaceView;
  experienceMode: ExperienceMode;
  errorCount: number;
  warningCount: number;
  diagnosticSource: 'checking' | 'project' | 'local';
  bottomDockOpen: boolean;
  onToggleBottomDock: (tab?: BottomDockTab) => void;
  rightInspectorOpen: boolean;
  onToggleRightInspector: () => void;
  agentBridgeOpen: boolean;
  pendingAgentUpdate: boolean;
  onToggleAgentBridge: () => void;
  onOpenDeployWizard?: () => void;
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  blueprint: 'MD Scripts',
  aiscripts: 'AI Scripts',
  libraries: 'Wares & Jobs',
  'ui-designer': 'HUD & Lua UI',
  xmlpatch: 'XML Patching',
  contracts: 'Contracts',
  translation: 'Languages (t/)',
  project: 'Project Overview',
  galaxy: 'Galaxy Map',
  wiki: 'X4 Wiki',
};

export default function WorkbenchStatusBar({
  modName,
  modVersion,
  workspaceView,
  experienceMode,
  errorCount,
  warningCount,
  diagnosticSource,
  bottomDockOpen,
  onToggleBottomDock,
  rightInspectorOpen,
  onToggleRightInspector,
  agentBridgeOpen,
  pendingAgentUpdate,
  onToggleAgentBridge,
}: WorkbenchStatusBarProps) {
  const modId = toSafeModId(modName || 'untitled_mod');

  return (
    <footer
      data-testid="workbench-status-bar"
      className="h-[26px] shrink-0 border-t border-white/[0.08] bg-[#0c0e12] px-2.5 flex items-center justify-between gap-2 text-[11px] text-[#94a3b8] select-none z-30"
    >
      {/* Left Cluster: Mod Identity + Problems */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-300 truncate max-w-[220px]" title={`Mod ID: ${modId} · Version ${modVersion}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          <span className="truncate">{modId}</span>
          <span className="text-slate-500">v{modVersion || '1.0.0'}</span>
        </span>

        <span className="h-3 w-px bg-white/[0.08] shrink-0" />

        <button
          type="button"
          data-testid="status-problems-toggle"
          onClick={() => onToggleBottomDock('problems')}
          className={`h-5 px-1.5 rounded inline-flex items-center gap-1.5 font-mono text-[11px] cursor-pointer transition-colors ${
            errorCount > 0
              ? 'text-rose-300 hover:bg-rose-500/15'
              : warningCount > 0
                ? 'text-amber-300 hover:bg-amber-500/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Toggle Problems & Critic bottom panel (Ctrl+J)"
        >
          {errorCount === 0 && warningCount === 0 ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{errorCount}E · {warningCount}W</span>
          {diagnosticSource === 'checking' && <span className="text-blue-300 text-[11px]">checking…</span>}
        </button>
      </div>

      {/* Right Cluster: Active Surface + Dock Toggles + Agent Sync + Docked FPS */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="hidden lg:inline text-[11px] text-slate-500">
          {VIEW_LABELS[workspaceView]}
        </span>

        {experienceMode === 'expert' && (
          <>
            <span className="hidden lg:inline h-3 w-px bg-white/[0.08]" />
            <button
              type="button"
              data-testid="bottom-dock-toggle"
              aria-pressed={bottomDockOpen}
              onClick={() => onToggleBottomDock()}
              className={`h-5 px-1.5 rounded inline-flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
                bottomDockOpen ? 'bg-blue-500/15 text-blue-300' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title="Toggle bottom output/problems panel (Ctrl+J)"
            >
              <PanelBottom className="w-3 h-3" />
              <span className="hidden sm:inline">Panel</span>
            </button>

            <button
              type="button"
              data-testid="right-inspector-toggle"
              aria-pressed={rightInspectorOpen}
              onClick={onToggleRightInspector}
              className={`h-5 px-1.5 rounded inline-flex items-center gap-1 text-[11px] cursor-pointer transition-colors ${
                rightInspectorOpen ? 'bg-blue-500/15 text-blue-300' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title="Toggle right Contextual Inspector"
            >
              <PanelRight className="w-3 h-3" />
              <span className="hidden sm:inline">Inspector</span>
            </button>

            <button
              type="button"
              onClick={onToggleAgentBridge}
              aria-pressed={agentBridgeOpen}
              className={`hidden sm:inline-flex h-5 px-1.5 rounded items-center gap-1 text-[11px] cursor-pointer transition-colors ${
                pendingAgentUpdate
                  ? 'bg-amber-500/20 text-amber-300'
                  : agentBridgeOpen
                    ? 'bg-blue-500/15 text-blue-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
              title="Open Agent API & MCP Bridge"
            >
              <Cpu className="w-3 h-3" />
              <span>{pendingAgentUpdate ? 'Agent Update Pending' : 'Agent API'}</span>
            </button>
          </>
        )}

        <span className="h-3 w-px bg-white/[0.08]" />
        <FpsMeter variant="docked" />
      </div>
    </footer>
  );
}
