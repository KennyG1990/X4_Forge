/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dedicated Right-Hand Contextual Inspector (Unit 39 — Unified IDE Workbench).
 * Promotes node/widget property editing, deterministic explanations, quick-fixes,
 * inbound/outbound graph lineage, and focused XML preview beside the active editor
 * stage instead of burying them beneath the left sidebar toolbox scroll container.
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Code2,
  Compass,
  Copy,
  GitFork,
  Layout,
  PanelRightClose,
  Sliders,
  X,
} from 'lucide-react';
import {
  generateMDXML,
  type MDNode,
  type ModWorkspace,
  type PackageDiagnostic,
  type UIWidget,
} from '../types';
import type { WorkspaceView } from '../lib/experienceMode';
import { applyNodePropertyChange, isNodeSelectionFailure } from '../lib/nodeSelectionDocument';
import PropertiesInspector from './PropertiesInspector';

interface ContextualInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: MDNode | null;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  selectedWidget: UIWidget | null;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  diagnostics: PackageDiagnostic[];
  workspaceView: WorkspaceView;
  setWorkspaceView: (view: WorkspaceView) => void;
  setFocusNodeRequest: (req: { nodeId: string; timestamp: number } | null) => void;
}

type InspectorTab = 'properties' | 'connections' | 'xml';

export default function ContextualInspector({
  isOpen,
  onClose,
  selectedNode,
  setSelectedNode,
  selectedWidget,
  setSelectedWidget,
  workspace,
  setWorkspace,
  saveCheckpoint,
  diagnostics,
  workspaceView,
  setWorkspaceView,
  setFocusNodeRequest,
}: ContextualInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');
  const [propertyEditError, setPropertyEditError] = useState<string>('');
  const [copiedXml, setCopiedXml] = useState(false);

  const hasSelection = Boolean(selectedNode || selectedWidget);

  const connections = useMemo(() => {
    if (!selectedNode) return { inbound: [] as Array<{ linkId: string; port: string; node: MDNode }>, outbound: [] as Array<{ linkId: string; port: string; node: MDNode }> };
    const byId = new Map((workspace.nodes || []).map(node => [node.id, node] as const));
    const inbound: Array<{ linkId: string; port: string; node: MDNode }> = [];
    const outbound: Array<{ linkId: string; port: string; node: MDNode }> = [];
    for (const link of workspace.links || []) {
      if (link.targetNodeId === selectedNode.id) {
        const src = byId.get(link.sourceNodeId);
        if (src) inbound.push({ linkId: link.id, port: `${link.sourcePortId} → ${link.targetPortId}`, node: src });
      }
      if (link.sourceNodeId === selectedNode.id) {
        const dst = byId.get(link.targetNodeId);
        if (dst) outbound.push({ linkId: link.id, port: `${link.sourcePortId} → ${link.targetPortId}`, node: dst });
      }
    }
    return { inbound, outbound };
  }, [selectedNode, workspace.links, workspace.nodes]);

  const focusedXml = useMemo(() => {
    if (!selectedNode) return '';
    try {
      const connectedIds = new Set<string>([selectedNode.id]);
      for (const link of workspace.links || []) {
        if (link.sourceNodeId === selectedNode.id) connectedIds.add(link.targetNodeId);
        if (link.targetNodeId === selectedNode.id) connectedIds.add(link.sourceNodeId);
      }
      if (selectedNode.type === 'cue') {
        const scopedNodes = (workspace.nodes || []).filter(n => connectedIds.has(n.id));
        const scopedLinks = (workspace.links || []).filter(l => connectedIds.has(l.sourceNodeId) && connectedIds.has(l.targetNodeId));
        return generateMDXML({ ...workspace, nodes: scopedNodes, links: scopedLinks });
      }
      const attrs = Object.entries(selectedNode.properties || {})
        .filter(([key, val]) => key !== 'mdFileStem' && val !== undefined && val !== '')
        .map(([key, val]) => `${key}="${String(val).replace(/"/g, '&quot;')}"`)
        .join(' ');
      return `<${selectedNode.xmlTag}${attrs ? ` ${attrs}` : ''} />`;
    } catch {
      return `<!-- Could not preview XML for ${selectedNode.xmlTag} -->`;
    }
  }, [selectedNode, workspace]);

  if (!isOpen) return null;

  const commitWorkspaceChange: React.Dispatch<React.SetStateAction<ModWorkspace>> = (updater) => {
    saveCheckpoint();
    setWorkspace(updater);
  };

  const handlePropChange = (key: string, value: unknown) => {
    if (selectedNode) {
      const applied = applyNodePropertyChange(workspace, selectedNode.id, key, value);
      if (isNodeSelectionFailure(applied)) {
        setPropertyEditError(applied.message);
        return;
      }
      setPropertyEditError('');
      commitWorkspaceChange(applied.workspace);
      setSelectedNode(applied.workspace.nodes.find(node => node.id === selectedNode.id) || null);
    } else if (selectedWidget) {
      commitWorkspaceChange(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w =>
          w.id === selectedWidget.id
            ? { ...w, properties: { ...w.properties, [key]: value } }
            : w
        ),
      }));
      setSelectedWidget(prev => (prev ? { ...prev, properties: { ...prev.properties, [key]: value } } : null));
    }
  };

  const handleLabelChange = (newLabel: string) => {
    if (selectedNode) {
      commitWorkspaceChange(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => (n.id === selectedNode.id ? { ...n, label: newLabel } : n)),
      }));
      setSelectedNode(prev => (prev ? { ...prev, label: newLabel } : null));
    } else if (selectedWidget) {
      commitWorkspaceChange(prev => ({
        ...prev,
        uiWidgets: prev.uiWidgets.map(w => (w.id === selectedWidget.id ? { ...w, label: newLabel } : w)),
      }));
      setSelectedWidget(prev => (prev ? { ...prev, label: newLabel } : null));
    }
  };

  const handleSendCuePackageToAIGuide = () => {
    if (!selectedNode) return;
    const links = workspace.links || [];
    const connectedNodeIds = new Set<string>();
    links.forEach(l => {
      if (l.sourceNodeId === selectedNode.id) connectedNodeIds.add(l.targetNodeId);
      if (l.targetNodeId === selectedNode.id) connectedNodeIds.add(l.sourceNodeId);
    });
    const dependencies = (workspace.nodes || []).filter(n => connectedNodeIds.has(n.id));
    let serializedContext = `### SELECTED ELEMENT NODE\n- Label: "${selectedNode.label}"\n- XML Tag: <${selectedNode.xmlTag}>\n`;
    if (Object.keys(selectedNode.properties || {}).length > 0) {
      serializedContext += '  Properties:\n';
      Object.entries(selectedNode.properties).forEach(([k, v]) => {
        serializedContext += `    - ${k}: ${JSON.stringify(v)}\n`;
      });
    }
    if (selectedNode.comment) {
      serializedContext += `  Comment Annotation: "${selectedNode.comment}"\n`;
    }
    if (dependencies.length > 0) {
      serializedContext += '\n### DEPENDENCIES & CONNECTING NODES\n';
      dependencies.forEach(dep => {
        serializedContext += `- Relation Connection: <${dep.xmlTag}> Tag, labeled "${dep.label}"\n`;
      });
    }
    const promptMessage = `I would like to edit my mission cue sequence. Here is the active selected node and its dependency graph context:\n\n${serializedContext}\n\nPlease analyze this cue structure, offer feedback on Egosoft engine compliance, and guide me on how to enhance this sequence or introduce custom conditions & action events!`;
    window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt: promptMessage } }));
  };

  const rootCues = (workspace.nodes || []).filter(n => n.type === 'cue').slice(0, 8);

  return (
    <aside
      aria-label="Contextual Inspector"
      data-testid="contextual-inspector"
      className="order-1 w-[312px] max-w-[38vw] max-[1150px]:fixed max-[1150px]:right-0 max-[1150px]:top-[104px] max-[1150px]:bottom-[26px] max-[1150px]:z-40 max-[1150px]:max-w-[min(320px,92vw)] max-[1150px]:shadow-2xl shrink-0 border-l border-slate-800/80 bg-[#11161f] flex flex-col h-full max-[1150px]:h-auto text-slate-200 select-none"
    >
      {/* Inspector Header */}
      <div className="h-9 px-3 border-b border-slate-800/80 bg-[#151b26] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-100 truncate">
            {selectedNode ? selectedNode.label || `<${selectedNode.xmlTag}>` : selectedWidget ? selectedWidget.label || selectedWidget.type : 'Inspector'}
          </span>
          {selectedNode && (
            <span className="font-mono text-[10px] text-sky-300/90 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded shrink-0">
              &lt;{selectedNode.xmlTag}&gt;
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              onClick={() => {
                setSelectedNode(null);
                setSelectedWidget(null);
                setPropertyEditError('');
              }}
              className="h-6 px-1.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer inline-flex items-center gap-1"
              title="Clear active selection"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            type="button"
            data-testid="contextual-inspector-close"
            onClick={onClose}
            className="w-6 h-6 grid place-items-center rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 cursor-pointer"
            title="Collapse right inspector"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Segmented Inspector Tabs when a node is selected */}
      {selectedNode && (
        <div className="px-2.5 py-1.5 border-b border-slate-800/70 bg-[#0e131b] flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('properties')}
            aria-pressed={activeTab === 'properties'}
            className={`flex-1 h-6 rounded text-[11px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'properties' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3 h-3" />
            Properties
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('connections')}
            aria-pressed={activeTab === 'connections'}
            className={`flex-1 h-6 rounded text-[11px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'connections' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3" />
            Links ({connections.inbound.length + connections.outbound.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('xml')}
            aria-pressed={activeTab === 'xml'}
            className={`flex-1 h-6 rounded text-[11px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'xml' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Code2 className="w-3 h-3" />
            XML
          </button>
        </div>
      )}

      {/* Inspector Body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 select-text">
        {!hasSelection ? (
          <div className="space-y-4 text-xs text-slate-400">
            <div className="rounded-lg border border-slate-800 bg-[#0d1118] p-3.5 space-y-1.5">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                No Element Selected
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click any Mission Director node on the canvas or widget in the UI designer to inspect and edit its schema-validated attributes, quick-fixes, and wiring here.
              </p>
            </div>

            {/* Quick Workspace Summary */}
            <div className="rounded-lg border border-slate-800/80 bg-[#0d1118]/70 p-3 space-y-2">
              <div className="text-[10.5px] font-semibold text-slate-300">Active Mod Summary</div>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10.5px]">
                <div className="rounded bg-black/25 border border-white/5 px-2 py-1.5 flex items-center justify-between">
                  <span className="text-slate-500">MD Nodes</span>
                  <span className="text-slate-200 font-semibold">{workspace.nodes?.length ?? 0}</span>
                </div>
                <div className="rounded bg-black/25 border border-white/5 px-2 py-1.5 flex items-center justify-between">
                  <span className="text-slate-500">Wires</span>
                  <span className="text-slate-200 font-semibold">{workspace.links?.length ?? 0}</span>
                </div>
                <div className="rounded bg-black/25 border border-white/5 px-2 py-1.5 flex items-center justify-between">
                  <span className="text-slate-500">XML Patches</span>
                  <span className="text-slate-200 font-semibold">{workspace.xmlPatches?.length ?? 0}</span>
                </div>
                <div className="rounded bg-black/25 border border-white/5 px-2 py-1.5 flex items-center justify-between">
                  <span className="text-slate-500">AI / Wares</span>
                  <span className="text-slate-200 font-semibold">{(workspace.aiScripts?.length ?? 0) + (workspace.wares?.length ?? 0)}</span>
                </div>
              </div>
            </div>

            {rootCues.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-purple-400" />
                  Quick Jump to Cue
                </div>
                <div className="space-y-1">
                  {rootCues.map(cue => (
                    <button
                      key={cue.id}
                      type="button"
                      onClick={() => {
                        setSelectedNode(cue);
                        if (workspaceView !== 'blueprint') setWorkspaceView('blueprint');
                        setFocusNodeRequest({ nodeId: cue.id, timestamp: Date.now() });
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md border border-slate-800/80 bg-[#0d1118]/80 hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="truncate text-[11px] font-medium text-slate-200">
                        {String(cue.properties?.name || cue.label || cue.id)}
                      </span>
                      <span className="font-mono text-[9.5px] text-slate-500 shrink-0">&lt;cue&gt;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(workspace.uiWidgets?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layout className="w-3.5 h-3.5 text-sky-400" />
                  UI Designer Widgets
                </div>
                <div className="space-y-1">
                  {workspace.uiWidgets.slice(0, 5).map(widget => (
                    <button
                      key={widget.id}
                      type="button"
                      onClick={() => {
                        setSelectedWidget(widget);
                        if (workspaceView !== 'ui-designer') setWorkspaceView('ui-designer');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md border border-slate-800/80 bg-[#0d1118]/80 hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="truncate text-[11px] font-medium text-slate-200">{widget.label || widget.type}</span>
                      <span className="font-mono text-[9.5px] text-slate-500 shrink-0">{widget.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : selectedNode && activeTab === 'connections' ? (
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300">
                Inbound Connections ({connections.inbound.length})
              </div>
              {connections.inbound.length === 0 ? (
                <div className="rounded border border-slate-800 bg-[#0d1118] p-2.5 text-[11px] text-slate-500">
                  No incoming wires connect to this node.
                </div>
              ) : (
                connections.inbound.map(({ linkId, port, node }) => (
                  <button
                    key={linkId}
                    type="button"
                    onClick={() => {
                      setSelectedNode(node);
                      setActiveTab('properties');
                      if (workspaceView !== 'blueprint') setWorkspaceView('blueprint');
                      setFocusNodeRequest({ nodeId: node.id, timestamp: Date.now() });
                    }}
                    className="w-full text-left rounded-md border border-slate-800 bg-[#0d1118] hover:border-sky-500/40 p-2 space-y-0.5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-200 truncate flex items-center gap-1.5">
                        <GitFork className="w-3 h-3 text-sky-400 shrink-0" />
                        {node.label || `<${node.xmlTag}>`}
                      </span>
                      <span className="font-mono text-[9.5px] text-sky-300 shrink-0">Focus ↗</span>
                    </div>
                    <div className="font-mono text-[9.5px] text-slate-500 truncate">
                      &lt;{node.xmlTag}&gt; · {port}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300">
                Outbound Connections ({connections.outbound.length})
              </div>
              {connections.outbound.length === 0 ? (
                <div className="rounded border border-slate-800 bg-[#0d1118] p-2.5 text-[11px] text-slate-500">
                  No outgoing wires originate from this node.
                </div>
              ) : (
                connections.outbound.map(({ linkId, port, node }) => (
                  <button
                    key={linkId}
                    type="button"
                    onClick={() => {
                      setSelectedNode(node);
                      setActiveTab('properties');
                      if (workspaceView !== 'blueprint') setWorkspaceView('blueprint');
                      setFocusNodeRequest({ nodeId: node.id, timestamp: Date.now() });
                    }}
                    className="w-full text-left rounded-md border border-slate-800 bg-[#0d1118] hover:border-emerald-500/40 p-2 space-y-0.5 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-200 truncate flex items-center gap-1.5">
                        <GitFork className="w-3 h-3 text-emerald-400 shrink-0" />
                        {node.label || `<${node.xmlTag}>`}
                      </span>
                      <span className="font-mono text-[9.5px] text-emerald-300 shrink-0">Focus ↗</span>
                    </div>
                    <div className="font-mono text-[9.5px] text-slate-500 truncate">
                      &lt;{node.xmlTag}&gt; · {port}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : selectedNode && activeTab === 'xml' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300">Compiled XML Excerpt</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(focusedXml);
                  setCopiedXml(true);
                  setTimeout(() => setCopiedXml(false), 1800);
                }}
                className="settings-button !min-h-[24px] !py-1 !px-2 !text-[10px]"
              >
                {copiedXml ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedXml ? 'Copied' : 'Copy XML'}
              </button>
            </div>
            <pre className="rounded-lg border border-slate-800 bg-[#090c11] p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300 overflow-x-auto code-scroll whitespace-pre">
              {focusedXml}
            </pre>
          </div>
        ) : (
          <div className="-mt-4">
            <PropertiesInspector
              selectedNode={selectedNode}
              selectedWidget={selectedWidget}
              workspace={workspace}
              setWorkspace={commitWorkspaceChange}
              setSelectedNode={setSelectedNode}
              setSelectedWidget={setSelectedWidget}
              saveCheckpoint={saveCheckpoint}
              handleLabelChange={handleLabelChange}
              handlePropChange={handlePropChange}
              handleSendCuePackageToAIGuide={handleSendCuePackageToAIGuide}
              diagnostics={diagnostics}
              setWorkspaceView={setWorkspaceView}
            />
            {propertyEditError && (
              <div className="mt-3 rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-200" role="status">
                {propertyEditError}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
