import { fetchVerifiedDeploy, deployValidationLabel } from '../lib/deployClient';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CueViewer — THE single cue tree for X4 Forge (consolidated 2026-06-12).
 *
 * Renders the Mission Director cue hierarchy from parent→sub-cue links and is
 * the one surface that NAVIGATES (click → select + focus on canvas, eye
 * toggles filter the graph), DIAGNOSES (structural lineage findings inline:
 * dead code, dangling refs, duplicates — engine: src/lib/cueLineage.ts), and
 * GOES LIVE (bind the running game's debuglog: fired cues glow, error cues
 * redden, attributed errors yield Live Fix cards — engines: logTelemetry +
 * liveFixes).
 *
 * History: this absorbs the former CueLineageTree.tsx (Doctor tab), which was
 * a second rendering of the same tree that knew how to judge but not navigate.
 * Ken's duplicate-surface catch; the Doctor now shows a one-line cue-health
 * summary that deep-links here.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  GitCommit,
  ChevronRight,
  ChevronDown,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  Activity,
  Radio,
  FileText
} from 'lucide-react';
import { ModWorkspace, MDNode } from '../types';
import { analyzeCueLineage } from '../lib/cueLineage';
import { parseLogTelemetry, type CueTelemetry, type LogEntry } from '../lib/logTelemetry';
import { classifyLiveFixes, applyLiveFix, type LiveFix } from '../lib/liveFixes';
import { fetchPollingJson, pollingResourceKey } from '../lib/continuousPolling';
import { useContinuousPolling } from '../lib/useContinuousPolling';

interface CueTreeNode {
  id: string;
  name: string;
  node: MDNode;
  children: CueTreeNode[];
}

interface CueViewerProps {
  workspace: ModWorkspace;
  selectedNode: MDNode | null;
  setSelectedNode: (node: MDNode | null) => void;
  setFocusNodeRequest: (req: { nodeId: string; timestamp: number } | null) => void;
  visibleCueIds: string[] | null;
  setVisibleCueIds: (ids: string[] | null) => void;
  /** Enables Live-Fix Apply (mechanical fixes run through the normal undo-able path). */
  setWorkspace?: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

interface CueViewerTailResponse {
  success?: boolean;
  error?: string;
  telemetry?: { cues?: CueTelemetry[]; entries?: LogEntry[] };
}

const EMPTY_LIVE_ENTRIES: LogEntry[] = [];

export default function CueViewer({
  workspace,
  selectedNode,
  setSelectedNode,
  setFocusNodeRequest,
  visibleCueIds,
  setVisibleCueIds,
  setWorkspace
}: CueViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [showFindings, setShowFindings] = useState(false);

  const allCues = useMemo(() => {
    return workspace.nodes.filter(node => node.type === 'cue');
  }, [workspace.nodes]);

  const rootCues = useMemo(() => {
    const subCueIds = new Set<string>();
    workspace.links.forEach(link => {
      if (link.targetPortId === 'in_flow' && link.sourcePortId === 'out_sub') {
        subCueIds.add(link.targetNodeId);
      }
    });
    return allCues.filter(cue => !subCueIds.has(cue.id));
  }, [allCues, workspace.links]);

  const cueTree = useMemo(() => {
    const buildTree = (cueNode: MDNode): CueTreeNode => {
      const childCueIds = workspace.links
        .filter(link => link.sourceNodeId === cueNode.id && link.sourcePortId === 'out_sub')
        .map(link => link.targetNodeId);
      const childrenNodes = allCues.filter(n => childCueIds.includes(n.id));
      return {
        id: cueNode.id,
        name: cueNode.properties?.name || cueNode.label,
        node: cueNode,
        children: childrenNodes.map(child => buildTree(child))
      };
    };
    return rootCues.map(root => buildTree(root));
  }, [rootCues, allCues, workspace.links]);

  // --- Structural lineage analysis (absorbed from CueLineageTree) ----------
  const lineage = useMemo(
    () => analyzeCueLineage(workspace.nodes || [], workspace.links || []),
    [workspace.nodes, workspace.links]
  );
  const findingsByCueId = useMemo(() => {
    const m = new Map<string, typeof lineage.findings>();
    for (const f of lineage.findings) {
      if (!f.cueId) continue;
      const arr = m.get(f.cueId) || [];
      arr.push(f);
      m.set(f.cueId, arr);
    }
    return m;
  }, [lineage]);
  const errorCount = lineage.findings.filter(f => f.severity === 'error').length;
  const warnCount = lineage.findings.filter(f => f.severity === 'warning').length;

  // --- Live game-log binding (absorbed from CueLineageTree) ----------------
  // ONE log watcher app-wide: this subscribes to the same backend feed the
  // Playtest watcher uses (game-log/status → log-file-tail). The paste box is
  // an offline IMPORT for logs from other machines/sessions, not a watcher.
  const [liveMode, setLiveMode] = useState(false);
  const workspaceAuthority = window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || 'unbound';
  const [liveEvidence, setLiveEvidence] = useState<{
    authority: string;
    telemetry: Map<string, CueTelemetry>;
    entries: LogEntry[];
  } | null>(null);
  const [liveStatusState, setLiveStatusState] = useState<{ authority: string; text: string } | null>(null);
  const [liveLogTarget, setLiveLogTarget] = useState<{ workspaceAuthority: string; path: string }>({
    workspaceAuthority: '',
    path: '',
  });
  const [fixMsg, setFixMsg] = useState('');
  const [logText, setLogText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const liveCueNames = useMemo(() => allCues.map(cue => String(cue.properties?.name || '')).filter(Boolean), [allCues]);
  const liveCueIdentity = `${window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || 'unbound'}|${JSON.stringify(liveCueNames)}`;
  const liveLogPath = liveLogTarget.workspaceAuthority === workspaceAuthority ? liveLogTarget.path : '';
  const liveTailAuthority = `${liveCueIdentity}|${liveLogPath}`;
  const liveTele = liveEvidence?.authority === liveTailAuthority ? liveEvidence.telemetry : null;
  const liveEntries = liveEvidence?.authority === liveTailAuthority ? liveEvidence.entries : EMPTY_LIVE_ENTRIES;
  const liveStatus = liveStatusState?.authority === liveTailAuthority
    ? liveStatusState.text
    : liveMode ? (liveLogPath ? 'connecting to selected debug log…' : 'locating debug log…') : '';
  React.useLayoutEffect(() => {
    setLiveEvidence(null);
    setLiveStatusState(null);
    setFixMsg('');
  }, [liveMode, liveCueIdentity]);
  useEffect(() => {
    if (!liveMode) {
      setLiveEvidence(null);
      setLiveStatusState(null);
      setLiveLogTarget({ workspaceAuthority: '', path: '' });
      setFixMsg('');
    }
  }, [liveMode]);
  useContinuousPolling<{ selectedLogPath?: string }>({
    enabled: liveMode,
    resourceKey: `cue-viewer-log-status:${workspaceAuthority}`,
    contract: 'GET /api/agent/game-log/status',
    intervalMs: 10000,
    run: signal => fetchPollingJson('/api/agent/game-log/status', undefined, signal),
    onResult: status => {
      const nextPath = status.selectedLogPath || '';
      const nextAuthority = `${liveCueIdentity}|${nextPath}`;
      if (liveLogPath !== nextPath) {
        setLiveEvidence(null);
        setLiveStatusState(null);
        setFixMsg('');
      }
      setLiveLogTarget({ workspaceAuthority, path: nextPath });
      if (!nextPath) {
        setLiveEvidence(null);
        setLiveStatusState({ authority: nextAuthority, text: 'no debuglog found — configure the X4 log path (see the Playtest watcher)' });
      }
    },
    onError: error => {
      const emptyAuthority = `${liveCueIdentity}|`;
      setLiveLogTarget({ workspaceAuthority, path: '' });
      setLiveEvidence(null);
      setLiveStatusState({ authority: emptyAuthority, text: `feed unavailable: ${error.message}` });
    },
  });
  const liveTailBody = JSON.stringify({ path: liveLogPath, cueNames: liveCueNames });
  useContinuousPolling<CueViewerTailResponse>({
    enabled: liveMode && !!liveLogPath,
    resourceKey: pollingResourceKey('cue-viewer-log-tail', `${workspaceAuthority}|${liveLogPath}|${liveCueIdentity}`),
    contract: `POST /api/agent/log-file-tail ${liveTailBody}`,
    intervalMs: 10000,
    run: signal => fetchPollingJson('/api/agent/log-file-tail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: liveTailBody,
    }, signal),
    onResult: tail => {
      if (tail?.success && tail.telemetry) {
        const entries = tail.telemetry.entries || [];
        setLiveEvidence({
          authority: liveTailAuthority,
          telemetry: new Map((tail.telemetry.cues || []).map((cue: CueTelemetry) => [cue.name, cue])),
          entries,
        });
        setLiveStatusState({ authority: liveTailAuthority, text: 'live · ' + String(liveLogPath).split(/[\\/]/).pop() + ' · ' + entries.length + ' recent entries' });
      } else {
        setLiveEvidence(null);
        setLiveStatusState({ authority: liveTailAuthority, text: tail?.error || 'tail failed' });
      }
    },
    onError: error => {
      setLiveEvidence(null);
      setLiveStatusState({ authority: liveTailAuthority, text: `feed unavailable: ${error.message}` });
    },
  });

  const pastedTele = useMemo(() => {
    if (!logText.trim()) return new Map<string, CueTelemetry>();
    const t = parseLogTelemetry(logText, allCues.map(c => String(c.properties?.name || '')).filter(Boolean));
    return new Map(t.cues.map(c => [c.name, c]));
  }, [logText, allCues]);
  const cueTele = liveMode && liveTele ? liveTele : pastedTele;

  // --- T5 Live Fix cards (absorbed) ----------------------------------------
  const liveFixes = useMemo<LiveFix[]>(
    () => (liveMode && liveEntries.length ? classifyLiveFixes(liveEntries, workspace) : []),
    [liveMode, liveEntries, workspace]
  );

  const handleApplyFix = (fix: LiveFix) => {
    if (!setWorkspace) return;
    try {
      setWorkspace(prev => applyLiveFix(prev, fix));
      setFixMsg(`Applied: ${fix.apply?.propertyKey} → ${fix.apply?.newValue}. Deploy, then run /refreshmd in-game to re-test live.`);
    } catch (e) {
      setFixMsg(`Apply failed: ${e?.message || e}`);
    }
  };

  const handleDeployForRefresh = async () => {
    setFixMsg('Deploying current workspace…');
    try {
      // Audit R4: deploy-verify (full preflight) replaces the deprecated /deploy; send the
      // CURRENT canvas workspace so the applied live-fix is what actually deploys.
      const r = await fetchVerifiedDeploy( { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }) });
      const d = await r.json();
      const failed = (d.checklist || []).find((c: { status: string }) => c.status === 'fail');
      setFixMsg(d.ok
        ? `Deployed bytes verified. ${deployValidationLabel(d)} In game: Enter (chat) → type /refreshmd → Enter. The glow above shows the result live.`
        : `Deploy failed${d.stage ? ` at ${d.stage}` : ''}: ${d.error || (failed ? `${failed.label}: ${failed.detail}` : r.status)}`);
    } catch (e) {
      setFixMsg(`Deploy failed: ${e?.message || e}`);
    }
  };

  const handleJumpToNode = (nodeId?: string) => {
    if (!nodeId) return;
    const node = workspace.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
      setFocusNodeRequest({ nodeId: node.id, timestamp: Date.now() });
    }
  };

  // --- original CueViewer mechanics ----------------------------------------
  const activeVisibleSet = useMemo(() => {
    if (visibleCueIds === null) {
      return new Set<string>(allCues.map(c => c.id));
    }
    return new Set<string>(visibleCueIds);
  }, [visibleCueIds, allCues]);

  const toggleFolder = (id: string) => {
    setExpandedPaths(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDescendantIds = (node: CueTreeNode): string[] => {
    let ids: string[] = [node.id];
    node.children.forEach(child => { ids = [...ids, ...getDescendantIds(child)]; });
    return ids;
  };

  const handleToggleCueVisibility = (treeNode: CueTreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIds = getDescendantIds(treeNode);
    const isCurrentlyChecked = activeVisibleSet.has(treeNode.id);
    let nextVisibleList: string[] | null = null;
    if (isCurrentlyChecked) {
      const nextSet = new Set<string>(activeVisibleSet);
      targetIds.forEach(id => nextSet.delete(id));
      nextVisibleList = Array.from(nextSet);
    } else {
      const nextSet = new Set<string>(activeVisibleSet);
      targetIds.forEach(id => nextSet.add(id));
      nextVisibleList = Array.from(nextSet);
    }
    if (nextVisibleList.length === allCues.length) {
      setVisibleCueIds(null);
    } else {
      setVisibleCueIds(nextVisibleList);
    }
  };

  const handleSelectAll = () => setVisibleCueIds(null);
  const handleClearAll = () => setVisibleCueIds([]);

  const handleFocusCue = (cueNode: MDNode) => {
    setSelectedNode(cueNode);
    setFocusNodeRequest({ nodeId: cueNode.id, timestamp: Date.now() });
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery) return cueTree;
    const lcQuery = searchQuery.toLowerCase();
    const filterNode = (node: CueTreeNode): CueTreeNode | null => {
      const selfMatches = node.name.toLowerCase().includes(lcQuery);
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter((child): child is CueTreeNode => child !== null);
      if (selfMatches || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    };
    return cueTree.map(root => filterNode(root)).filter((root): root is CueTreeNode => root !== null);
  }, [cueTree, searchQuery]);

  const renderCueNode = (node: CueTreeNode, depth = 0) => {
    const isParent = node.children.length > 0;
    const isExpanded = expandedPaths[node.id] ?? true;
    const isActive = selectedNode?.id === node.id;
    const isChecked = activeVisibleSet.has(node.id);
    const props = node.node.properties || {};
    const initialState = props.state || 'active';
    const isInstantiated = props.instantiate === 'true';
    const isLibrary = props.isLibrary === 'true' || props.isLibrary === true;
    const libPurpose = String(props.libPurpose || props.purpose || '').trim();
    const patchVerMatch = String(props.cueTailXml || props.rawXml || '').match(/sinceversion\s*=\s*["'](\d+)["']/i);
    const patchVer = String(props.patchSinceVersion || '').trim() || (patchVerMatch ? patchVerMatch[1] : '');

    // health + live state for THIS cue
    const cueFindings = findingsByCueId.get(node.id) || [];
    const hasError = cueFindings.some(f => f.severity === 'error');
    const hasWarn = !hasError && cueFindings.length > 0;
    const tele = node.name ? cueTele.get(node.name) : undefined;
    const liveTint = tele
      ? (tele.errors > 0 ? 'border-l-2 border-rose-500 bg-rose-500/5' : 'border-l-2 border-emerald-500 bg-emerald-500/5')
      : '';

    return (
      <div key={node.id} style={{ paddingLeft: `${depth * 6}px` }}>
        <div
          className={`group flex items-center gap-1 py-1 px-1.5 rounded text-left transition-colors font-mono text-[11px] border border-transparent select-none my-0.5 ${liveTint} ${
            isActive
              ? 'bg-[#171b23] text-[#eef2f7] border-[#3b82f6]/50 font-semibold'
              : 'text-[#cbd5e1] hover:text-white hover:bg-[#171b23]/60'
          }`}
        >
          <span className="shrink-0">
            {isParent ? (
              <button
                onClick={() => toggleFolder(node.id)}
                className="p-0.5 rounded hover:bg-white/10 text-[#a0aab8] hover:text-white cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-4 h-4 flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-[#687385]" />
              </div>
            )}
          </span>

          <button
            onClick={(e) => handleToggleCueVisibility(node, e)}
            className={`p-0.5 rounded shrink-0 transition-colors cursor-pointer ${
              isChecked
                ? 'text-[#60a5fa] hover:text-[#93c5fd] hover:bg-[#3b82f6]/10'
                : 'text-[#687385] hover:text-[#a0aab8] hover:bg-white/5'
            }`}
            title={isChecked ? 'Hide cue and descendants from canvas' : 'Show cue and descendants on canvas'}
          >
            {isChecked ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
          </button>

          <GitCommit className={`w-3.5 h-3.5 shrink-0 ${isChecked ? 'text-purple-400' : 'text-[#687385]'}`} />

          <button
            onClick={() => handleFocusCue(node.node)}
            className="flex-1 text-left truncate cursor-pointer pl-0.5 min-w-0"
            title={`Focus cue & dependencies: ${node.name}`}
          >
            <span className={`truncate font-semibold block ${isChecked ? '' : 'text-[#687385] line-through decoration-[#262c36]'}`}>{node.name}</span>
            <span className="block text-[11px] text-[#687385] font-mono truncate leading-tight">
              {initialState}{isInstantiated ? ' · inst' : ''}
              {tele && <span className={tele.errors > 0 ? ' text-rose-400' : ' text-emerald-400'}> · live ×{tele.hits}{tele.errors > 0 ? ` (${tele.errors} err)` : ''}</span>}
            </span>
          </button>

          {isLibrary && (
            <span
              data-testid="cue-viewer-library-badge"
              className="shrink-0 rounded border border-purple-500/35 bg-purple-500/10 px-1.5 py-0.5 text-[11px] font-mono text-purple-200"
              title={`<library${libPurpose ? ` purpose="${libPurpose}"` : ''}>`}
            >
              {libPurpose || 'lib'}
            </span>
          )}
          {patchVer && (
            <span
              data-testid="cue-viewer-patch-badge"
              className="shrink-0 rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-mono text-amber-200"
              title={`<patch sinceversion="${patchVer}">`}
            >
              p{patchVer}
            </span>
          )}

          {(hasError || hasWarn) && (
            <span
              className="shrink-0 cursor-help"
              title={cueFindings.map(f => `[${f.severity}] ${f.message}`).join('\n')}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${hasError ? 'text-rose-400' : 'text-amber-400'}`} />
            </span>
          )}
        </div>

        {isParent && isExpanded && (
          <div className="border-l border-[#262c36] ml-2 my-0.5 space-y-0.5">
            {node.children.map(child => renderCueNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0e12] text-[#eef2f7] overflow-hidden select-none font-sans">
      <div className="p-3 border-b border-[#262c36] shrink-0 space-y-2 bg-[#11141a]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-[#0a0c10] p-0.5 rounded border border-[#262c36]">
            <button
              onClick={handleSelectAll}
              className="px-2 py-1 rounded hover:bg-[#171b23] text-[#60a5fa] hover:text-[#93c5fd] transition-colors text-[11px] font-mono font-semibold cursor-pointer"
              title="Show all cues and elements"
            >
              SHOW ALL
            </button>
            <span className="text-[#262c36] text-[11px] font-mono px-0.5">|</span>
            <button
              onClick={handleClearAll}
              className="px-2 py-1 rounded hover:bg-[#171b23] text-[#a0aab8] hover:text-rose-300 transition-colors text-[11px] font-mono font-semibold cursor-pointer"
              title="Hide all cues from canvas"
            >
              CLEAR ALL
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {(errorCount > 0 || warnCount > 0) && (
              <button
                onClick={() => setShowFindings(v => !v)}
                className={`text-[11px] px-2 py-0.5 rounded border font-semibold font-mono cursor-pointer ${
                  errorCount > 0
                    ? 'bg-rose-500/12 text-rose-300 border-rose-500/35'
                    : 'bg-amber-500/12 text-amber-300 border-amber-500/35'
                }`}
                title="Structural lineage findings — click to expand"
              >
                {errorCount > 0 ? `${errorCount} ⛔` : ''}{errorCount > 0 && warnCount > 0 ? ' ' : ''}{warnCount > 0 ? `${warnCount} ⚠` : ''}
              </button>
            )}
            <div className="text-[11px] bg-[#171b23] text-[#93c5fd] px-2 py-0.5 rounded border border-[#262c36] font-semibold font-mono">
              {visibleCueIds === null ? `${allCues.length} Cues` : `${visibleCueIds.length}/${allCues.length} Visible`}
            </div>
          </div>
        </div>

        {showFindings && lineage.findings.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
            {lineage.findings.map((f, i) => (
              <button
                key={i}
                onClick={() => handleJumpToNode(f.cueId || (f as any).nodeId)}
                className={`w-full text-left text-[11px] font-sans leading-snug p-2 rounded border cursor-pointer hover:bg-[#171b23] ${
                  f.severity === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
                title="Jump to the offending cue/node"
              >
                [{f.severity}] {f.message}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#687385]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search Cues..."
            className="w-full pl-8 pr-2.5 py-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6] transition-colors font-mono"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-[#0c0e12] scrollbar-thin">
        {filteredTree.length === 0 ? (
          <div className="text-center py-8 text-[11px] font-mono text-[#687385] leading-normal">
            {allCues.length === 0
              ? 'No script cues identified in active blueprint.'
              : 'No cues matched query criteria'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredTree.map(rootItem => renderCueNode(rootItem))}
          </div>
        )}
      </div>

      {/* Live game-log binding + Live Fix cards (the app's ONE log consumer UI besides Playtest) */}
      <div className="p-2.5 border-t border-[#262c36] bg-[#11141a] shrink-0 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setLiveMode(v => !v)}
            data-testid="cue-live-toggle"
            title="Watch the live X4 debuglog — the same feed the Playtest watcher uses — and light up cues in real time"
            className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase cursor-pointer ${liveMode ? 'text-emerald-300' : 'text-[#a0aab8] hover:text-emerald-300'}`}
          >
            <Radio className={`w-3.5 h-3.5 ${liveMode ? 'animate-pulse' : ''}`} />{liveMode ? 'Live: ON' : 'Bind live game log'}
          </button>
          <button
            onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[#a0aab8] hover:text-[#93c5fd] cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />{showLog ? 'Hide' : 'Import'} offline log{!liveMode && pastedTele.size > 0 ? ` (${pastedTele.size} lit)` : ''}
          </button>
        </div>
        {liveMode && (
          <div data-testid="cue-live-status" className="text-[11px] font-mono text-[#a0aab8] truncate" title={liveStatus}>
            {liveStatus || 'connecting to debuglog feed…'}
          </div>
        )}
        {liveMode && liveFixes.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase text-rose-300 tracking-wide">
              Live fixes — {liveFixes.length} attributed error{liveFixes.length > 1 ? 's' : ''}
            </div>
            {liveFixes.slice(0, 6).map(fix => (
              <div key={fix.id} className="rounded border border-rose-500/25 bg-rose-500/5 p-2 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase text-rose-300 bg-rose-500/12 border border-rose-500/30 rounded px-1.5 py-0.5">{fix.fixKind.replace('_', ' ')}</span>
                  {fix.cueName && <span className="text-[11px] font-mono text-[#a0aab8]">{fix.cueName}</span>}
                  {fix.sourceRef && (
                    <button
                      onClick={() => handleJumpToNode(fix.sourceRef!.id)}
                      className="text-[11px] font-semibold text-[#60a5fa] hover:text-[#93c5fd] uppercase cursor-pointer"
                    >
                      Jump →
                    </button>
                  )}
                  {fix.autoApplicable && setWorkspace && (
                    <button
                      onClick={() => handleApplyFix(fix)}
                      className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 uppercase ml-auto cursor-pointer"
                    >
                      Apply fix
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-[#eef2f7] font-sans leading-snug">{fix.suggestion}</div>
                <div className="text-[11px] text-[#687385] font-mono truncate" title={fix.logLine}>{fix.logLine}</div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeployForRefresh}
                className="text-[11px] font-semibold uppercase text-[#93c5fd] hover:text-[#bfdbfe] cursor-pointer"
              >
                Deploy for /refreshmd
              </button>
              {fixMsg && <span className="text-[11px] font-sans text-[#a0aab8] leading-snug">{fixMsg}</span>}
            </div>
          </div>
        )}
        {liveMode && liveFixes.length === 0 && fixMsg && (
          <div className="text-[11px] font-sans text-[#a0aab8]">{fixMsg}</div>
        )}
        {showLog && (
          <div className="space-y-1.5">
            <textarea
              value={logText}
              onChange={e => setLogText(e.target.value)}
              spellCheck={false}
              placeholder={'Paste X4 debug-log text. Lines naming a cue (or [MDStudio] cue=<Name>) light it up; errors turn it red.'}
              className="w-full h-20 p-2 rounded bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] placeholder-[#687385] font-mono text-[11px] leading-snug focus:outline-none focus:border-[#3b82f6] resize-y"
            />
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[#60a5fa] hover:text-[#93c5fd] cursor-pointer flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />Load .log file
                <input type="file" accept=".log,.txt" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) { const rd = new FileReader(); rd.onload = () => setLogText(String(rd.result || '')); rd.readAsText(fl); } }} />
              </label>
              {logText && <button onClick={() => setLogText('')} className="text-[11px] text-[#a0aab8] hover:text-rose-300 cursor-pointer">clear</button>}
            </div>
          </div>
        )}
        {!liveMode && !showLog && (
          <span className="block truncate font-mono text-[11px] text-[#687385]">👁 Toggle eye to filter · click name to pan · ⚠ hover for findings</span>
        )}
      </div>
    </div>
  );
}
