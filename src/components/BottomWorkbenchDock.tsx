/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Collapsible Bottom Workbench Panel (Ctrl+J) — Problems & Critic, Runtime & Deliver,
 * and Live Compiled MD XML Preview beneath any active domain editor.
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  PackageCheck,
  Rocket,
  Search,
  Terminal,
  X,
} from 'lucide-react';
import { generateMDXML, type MDNode, type ModWorkspace, type PackageDiagnostic } from '../types';
import { analyzeCueLineage } from '../lib/cueLineage';
import { critiqueWorkspace } from '../lib/mdCritic';
import type { ReadinessStage } from '../lib/readiness';
import type { WorkspaceView } from '../lib/experienceMode';
import type { SidebarTab } from '../lib/studioLayout';

export type BottomDockTab = 'problems' | 'runtime' | 'xml';

interface BottomWorkbenchDockProps {
  isOpen: boolean;
  activeTab: BottomDockTab;
  onTabChange: (tab: BottomDockTab) => void;
  onClose: () => void;
  workspace: ModWorkspace;
  diagnostics: PackageDiagnostic[];
  diagnosticSource: 'checking' | 'project' | 'local';
  readinessStages: ReadinessStage[];
  onOpenDeployWizard: () => void;
  onSelectNode: (node: MDNode) => void;
  onFocusNode: (nodeId: string) => void;
  onNavigateWorkspace: (view: WorkspaceView) => void;
  onNavigateSidebar: (tab: SidebarTab) => void;
  onOpenReleaseCenter?: () => void;
}

export default function BottomWorkbenchDock({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  workspace,
  diagnostics,
  diagnosticSource,
  readinessStages,
  onOpenDeployWizard,
  onSelectNode,
  onFocusNode,
  onNavigateWorkspace,
  onNavigateSidebar,
  onOpenReleaseCenter,
}: BottomWorkbenchDockProps) {
  const [filterText, setFilterText] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [copiedXml, setCopiedXml] = useState(false);

  const criticResult = useMemo(
    () => critiqueWorkspace(workspace.nodes || [], workspace.links || []),
    [workspace.links, workspace.nodes],
  );

  const lineageResult = useMemo(
    () => analyzeCueLineage(workspace.nodes || [], workspace.links || []),
    [workspace.links, workspace.nodes],
  );

  const combinedFindings = useMemo(() => {
    const list: Array<{
      id: string;
      severity: 'error' | 'warning' | 'info';
      code: string;
      message: string;
      file?: string;
      nodeId?: string;
    }> = [];
    const seen = new Set<string>();

    diagnostics.forEach((diag, idx) => {
      list.push({
        id: `diag-${idx}-${diag.code || ''}`,
        severity: diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info',
        code: diag.code || diag.domain || 'project',
        message: diag.message,
        file: diag.filePath,
        nodeId: diag.nodeId,
      });
      seen.add(`${diag.code || ''}:${diag.nodeId || diag.message}`);
    });

    criticResult.findings.forEach((cf, idx) => {
      const nodeId = cf.nodeId || cf.cueId;
      seen.add(`${cf.code}:${nodeId || cf.message}`);
      list.push({
        id: `critic-${idx}-${cf.code}`,
        severity: cf.severity === 'error' ? 'error' : cf.severity === 'warning' ? 'warning' : 'info',
        code: cf.code,
        message: cf.message,
        nodeId,
      });
    });

    lineageResult.findings.forEach((lf, idx) => {
      const nodeId = lf.nodeId || lf.cueId;
      const dedupeKey = `${lf.code}:${nodeId || lf.message}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      list.push({
        id: `lineage-${idx}-${lf.code}`,
        severity: lf.severity === 'error' ? 'error' : 'warning',
        code: lf.code,
        message: lf.message,
        nodeId,
      });
    });

    return list;
  }, [criticResult, diagnostics, lineageResult]);

  const filteredFindings = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return combinedFindings.filter(item => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        item.message.toLowerCase().includes(q)
        || item.code.toLowerCase().includes(q)
        || (item.file && item.file.toLowerCase().includes(q))
      );
    });
  }, [combinedFindings, filterText, severityFilter]);

  const compiledMdXml = useMemo(() => {
    if (!isOpen || activeTab !== 'xml') return '';
    try {
      return generateMDXML(workspace);
    } catch (err) {
      return `<!-- XML preview error: ${err instanceof Error ? err.message : String(err)} -->`;
    }
  }, [activeTab, isOpen, workspace]);

  if (!isOpen) return null;

  const errorCount = combinedFindings.filter(f => f.severity === 'error').length;
  const warnCount = combinedFindings.filter(f => f.severity === 'warning').length;
  const runtimeStages = readinessStages.filter(stage => stage.id === 'deployed' || stage.id === 'seen');

  return (
    <section
      aria-label="Workbench bottom panel"
      data-testid="bottom-workbench-dock"
      className="h-[220px] shrink-0 border-t border-white/[0.08] bg-[#0c0e12] flex flex-col text-[#eef2f7] select-none"
    >
      {/* Dock Tab Bar */}
      <div className="h-8 px-3 border-b border-white/[0.08] bg-[#11141a] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onTabChange('problems')}
            aria-pressed={activeTab === 'problems'}
            className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors border ${
              activeTab === 'problems' ? 'bg-blue-500/15 text-blue-200 border-blue-500/35' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Problems</span>
            <span className={`font-mono text-[11px] px-1.5 rounded ${
              errorCount > 0 ? 'bg-rose-500/20 text-rose-300' : warnCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-[#171b23] text-slate-400'
            }`}>
              {errorCount + warnCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('runtime')}
            aria-pressed={activeTab === 'runtime'}
            className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors border ${
              activeTab === 'runtime' ? 'bg-blue-500/15 text-blue-200 border-blue-500/35' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
            }`}
          >
            <Terminal className="w-3 h-3" />
            <span>Runtime Log</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('xml')}
            aria-pressed={activeTab === 'xml'}
            className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors border ${
              activeTab === 'xml' ? 'bg-blue-500/15 text-blue-200 border-blue-500/35' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
            }`}
          >
            <Code2 className="w-3 h-3" />
            <span>Compiled XML</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'problems' && (
            <>
              <div className="relative flex items-center">
                <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
                <input
                  type="search"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Filter problems…"
                  className="h-6 w-40 rounded border border-white/[0.08] bg-[#0a0c10] pl-6 pr-2 text-[11px] text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value as 'all' | 'error' | 'warning')}
                aria-label="Filter bottom problems severity"
                className="h-6 rounded border border-white/[0.08] bg-[#0a0c10] px-1.5 text-[11px] text-slate-300 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All severities</option>
                <option value="error">Errors ({errorCount})</option>
                <option value="warning">Warnings ({warnCount})</option>
              </select>
              <button
                type="button"
                onClick={() => onNavigateSidebar('diagnostics')}
                className="h-6 px-2 rounded border border-white/[0.08] hover:border-blue-500/40 text-[11px] text-slate-300 hover:text-blue-200 inline-flex items-center gap-1 cursor-pointer"
              >
                Full Diagnostics <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </>
          )}

          {activeTab === 'xml' && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(compiledMdXml);
                setCopiedXml(true);
                setTimeout(() => setCopiedXml(false), 1800);
              }}
              className="h-6 px-2 rounded border border-white/[0.08] hover:border-blue-500/40 text-[11px] text-slate-300 hover:text-blue-200 inline-flex items-center gap-1 cursor-pointer"
            >
              {copiedXml ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedXml ? 'Copied' : 'Copy MD XML'}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 grid place-items-center rounded text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            title="Close bottom panel (Ctrl+J)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dock Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 select-text">
        {activeTab === 'problems' && (
          filteredFindings.length === 0 ? (
            <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                {diagnosticSource === 'checking'
                  ? 'Running project validation…'
                  : combinedFindings.length === 0
                    ? 'Zero active errors, cue lineage issues, or graph critic warnings in this workspace.'
                    : 'No findings match the current filter.'}
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFindings.slice(0, 80).map(item => {
                const targetNode = item.nodeId ? workspace.nodes.find(n => n.id === item.nodeId) : undefined;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (targetNode) {
                        onNavigateWorkspace('blueprint');
                        onSelectNode(targetNode);
                        onFocusNode(targetNode.id);
                      } else {
                        onNavigateSidebar('diagnostics');
                      }
                    }}
                    className="px-2.5 py-1.5 rounded border border-white/[0.08] bg-[#11141a] hover:border-blue-500/40 flex items-center gap-2.5 text-[11px] cursor-pointer transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      item.severity === 'error' ? 'bg-rose-400' : item.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                    }`} />
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">{item.code}</span>
                    <span className="text-slate-200 flex-1 truncate">{item.message}</span>
                    {(item.file || targetNode) && (
                      <span className="font-mono text-[11px] text-blue-300 shrink-0">
                        {targetNode ? `Node: ${targetNode.label || targetNode.xmlTag}` : item.file}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'runtime' && (
          <div data-testid="bottom-dock-runtime-status" className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {runtimeStages.map(stage => (
                <div
                  key={stage.id}
                  className="rounded-md border border-white/[0.08] bg-[#11141a] p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
                    <span>{stage.label}</span>
                    <span className={`font-mono text-[11px] uppercase ${
                      stage.status === 'pass' ? 'text-emerald-400'
                        : stage.status === 'fail' ? 'text-rose-400'
                          : stage.status === 'warning' || stage.status === 'stale' ? 'text-amber-400'
                            : 'text-slate-400'
                    }`}>
                      {stage.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate" title={stage.evidence}>
                    {stage.evidence || stage.summary}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={onOpenDeployWizard}
                className="settings-button !bg-blue-500/15 !border-blue-500/40 !text-blue-200 hover:!bg-blue-500/25"
              >
                <Rocket className="w-3.5 h-3.5" />
                Validate &amp; Deploy
              </button>
              <button
                type="button"
                onClick={() => onNavigateSidebar('playtest')}
                className="settings-button"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Open Runtime Debugger
              </button>
              {onOpenReleaseCenter && (
                <button
                  type="button"
                  onClick={onOpenReleaseCenter}
                  className="settings-button"
                >
                  <PackageCheck className="w-3.5 h-3.5 text-blue-400" />
                  Open Release Center
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateSidebar('diagnostics')}
                className="settings-button"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Full Diagnostics
              </button>
            </div>
          </div>
        )}

        {activeTab === 'xml' && (
          <pre className="rounded border border-white/[0.08] bg-[#0a0c10] p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto code-scroll whitespace-pre">
            {compiledMdXml}
          </pre>
        )}
      </div>
    </section>
  );
}
