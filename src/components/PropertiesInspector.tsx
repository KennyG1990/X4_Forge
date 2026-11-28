/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Properties Inspector (BACKLOG B5, 2026-07-09) — extracted VERBATIM from Sidebar.tsx
 * (its largest inline block, 3× AAR worst-pick citations: three IIFE sub-blocks sharing
 * closure state inside a ~1800-line component). Zero behavior change: the JSX is the
 * moved original; `explainOpen` / `sidebarCopied` were inspector-local UI state and
 * moved in as component state; everything else arrives as explicit props.
 *
 * Surfaces (top → bottom): Explain-this-node (deterministic) with Lua↔MD binding,
 * 🔧 one-click quick-fixes (incl. 💡 advice-only), label + build-inclusion, schema-driven
 * property editors (text/reference/textarea/number/select/boolean/coordinates),
 * sticky-note annotation, AI Copilot hand-off, widget property editors, pinned codex.
 */

import React, { useState } from 'react';
import {
  Sliders,
  Lightbulb,
  ChevronRight,
  Info,
  Sparkles,
  Pin,
  Check,
  Copy
} from 'lucide-react';
import { ModWorkspace, MDNode, UIWidget, PackageDiagnostic } from '../types';
import { explainNode } from '../lib/mdExplain';
import { listQuickFixes, applyQuickFix } from '../lib/workspaceQuickFixes';
import { luaMdBinding } from '../lib/luaMdBinding';
import ObjectIndexPicker from './ObjectIndexPicker';
import ExpressionInput from './ExpressionInput';
import PositionPicker from './PositionPicker';
import { WIKI_TOPICS } from './WikiBrowser';

interface PropertiesInspectorProps {
  selectedNode: MDNode | null;
  selectedWidget: UIWidget | null;
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  setSelectedNode: React.Dispatch<React.SetStateAction<MDNode | null>>;
  setSelectedWidget: React.Dispatch<React.SetStateAction<UIWidget | null>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  handleLabelChange: (newLabel: string) => void;
  handlePropChange: (key: string, value: unknown) => void;
  handleSendCuePackageToAIGuide: () => void;
  diagnostics?: PackageDiagnostic[];
  showAdvancedActions?: boolean;
  setWorkspaceView?: (view: 'blueprint' | 'ui-designer' | 'aiscripts' | 'libraries' | 'xmlpatch' | 'contracts' | 'translation' | 'wiki' | 'project' | 'galaxy') => void;
}

export default function PropertiesInspector({
  selectedNode,
  selectedWidget,
  workspace,
  setWorkspace,
  setSelectedNode,
  setSelectedWidget,
  saveCheckpoint,
  handleLabelChange,
  handlePropChange,
  handleSendCuePackageToAIGuide,
  diagnostics = [],
  showAdvancedActions = true,
  setWorkspaceView
}: PropertiesInspectorProps) {
  // Inspector-local UI state (moved in with the block — used nowhere else).
  const [explainOpen, setExplainOpen] = useState<boolean>(false);
  const [sidebarCopied, setSidebarCopied] = useState<boolean>(false);

  const selectedDiagnostics = selectedNode ? diagnostics.filter((finding) => {
    if (finding.nodeId === selectedNode.id || finding.sourceRef?.id === selectedNode.id) return true;
    const label = String(finding.sourceRef?.label || '').trim();
    if (!label) return false;
    return Object.values(selectedNode.properties || {}).some((value) => String(value || '').includes(label));
  }) : [];

  if (!selectedNode && !selectedWidget) return null;

  return (
          <div className="border-t border-[#262c36] pt-4 mt-2">
            <h3 className="text-xs font-mono font-semibold text-[#93c5fd] mb-3 tracking-wider uppercase flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              PROPERTIES INSPECTOR
            </h3>

            {/* A4.0 — "Explain this node" contextual verb. Deterministic (no AI), available at every tier. */}
            {selectedNode && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setExplainOpen(o => !o)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-amber-500/25 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] text-amber-300 text-[11px] font-mono font-semibold uppercase tracking-wider cursor-pointer transition-all"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Explain this node
                  <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${explainOpen ? 'rotate-90' : ''}`} />
                </button>
                {explainOpen && (() => {
                  const x = explainNode(selectedNode.id, workspace.nodes, workspace.links || []);
                  const riskColor = x.risk === 'irreversible' ? 'text-rose-300' : x.risk === 'safe' ? 'text-emerald-300' : 'text-amber-300';
                  return (
                    <div className="mt-1.5 p-2.5 rounded border border-[#262c36] bg-[#11141a] space-y-2 font-sans text-[11px] text-[#eef2f7] leading-relaxed">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#687385] flex items-center gap-1">
                        Deterministic · no AI · <span className="text-[#93c5fd]">&lt;{x.xmlTag}&gt;</span>
                      </div>
                      <div className="text-[#eef2f7]">{x.summary}</div>
                      {!x.schemaRecognized && (
                        <div className="text-rose-300 flex items-start gap-1">
                          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>This tag is not a declared md.xsd element — the game schema may not recognize it.</span>
                        </div>
                      )}
                      {x.note && <div className="text-amber-300">⚠ {x.note}</div>}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] font-mono pt-1 border-t border-[#262c36]">
                        <span className="text-[#687385]">role</span><span className="text-[#eef2f7]">{x.role}</span>
                        <span className="text-[#687385]">risk</span><span className={riskColor}>{x.risk}</span>
                        {x.writes.length > 0 && (<><span className="text-[#687385]">writes</span><span className="text-[#eef2f7]">{x.writes.join(', ')}</span></>)}
                        {x.reads.length > 0 && (<><span className="text-[#687385]">reads</span><span className="text-[#eef2f7]">{x.reads.join(', ')}</span></>)}
                      </div>
                      <div className="text-[11px] text-[#a0aab8] pt-1 border-t border-[#262c36]">
                        {x.role === 'cue'
                          ? 'Wiring: this is a cue (a root container for triggers + actions).'
                          : x.wiring.wiredToCue
                            ? <>Wiring: wired as a <span className="text-emerald-300">trigger</span> of cue <span className="text-[#eef2f7]">{x.wiring.wiredToCue}</span>.</>
                            : x.wiring.inChainOf
                              ? <>Wiring: part of the <span className="text-emerald-300">action chain</span> of cue <span className="text-[#eef2f7]">{x.wiring.inChainOf}</span>.</>
                              : x.wiring.orphan
                                ? <span className="text-rose-300">Wiring: orphaned — nothing points at this node, so it will never run.</span>
                                : 'Wiring: not currently wired into a cue.'}
                      </div>
                      {/* T4.3 "Bind to UI (Lua)" — for a cue, the deterministic two-way Lua↔MD glue (verified snippets). */}
                      {showAdvancedActions && x.role === 'cue' && (() => {
                        const bind = luaMdBinding(selectedNode);
                        if (!bind) return null;
                        return (
                          <details className="pt-1 border-t border-[#262c36] text-[#93c5fd]">
                            <summary className="text-[11px] font-mono uppercase tracking-wider cursor-pointer select-none">🔗 Bind to UI (Lua)</summary>
                            <div className="mt-1.5 space-y-1.5 text-[11px] font-sans text-[#eef2f7]">
                              <div className="text-[#a0aab8]">Trigger this cue <b>from</b> a UI widget — MD listens:</div>
                              <pre className="bg-[#0a0c10] border border-[#262c36] rounded p-2 text-[11px] font-mono text-emerald-300 whitespace-pre-wrap break-all">{bind.fromUi.md}</pre>
                              <div className="text-[#a0aab8]">Notify a UI widget <b>from</b> this cue — MD action:</div>
                              <pre className="bg-[#0a0c10] border border-[#262c36] rounded p-2 text-[11px] font-mono text-emerald-300 whitespace-pre-wrap break-all">{bind.toUi.md}</pre>
                              <div className="text-[#687385] text-[11px]">Lua side: use the "MD → Lua / Lua → MD" patterns in HUD &amp; LUA UI (event <span className="text-[#93c5fd]">{bind.ns}.{bind.event}</span>).</div>
                            </div>
                          </details>
                        );
                      })()}
                      {/* Audit R3: the 💡 "Suggest fix" advice moved into the 🔧 one-click
                          block below (quick-fix engine now carries advice-only descriptors). */}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="space-y-3 bg-[#11141a] p-3 rounded border border-[#262c36] font-mono text-[11px]">
              {/* ONE-CLICK quick-fixes (beta-UX): deterministic repairs with an undo
                  checkpoint — spellcheck's "did you mean", applied. Top of the inspector
                  so a flagged node's remedy is the FIRST thing the user sees. */}
              {selectedNode && (() => {
                const nodeFixes = listQuickFixes(workspace).filter(f => f.nodeId === selectedNode.id);
                if (!nodeFixes.length) return null;
                return (
                  <div className="space-y-1.5" data-testid="quick-fixes">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 flex items-center gap-1">🔧 One-click fixes</div>
                    {nodeFixes.map(f => (
                      <div key={f.id} className={`rounded border p-2 space-y-1 ${f.adviceOnly
                        ? 'border-amber-500/25 bg-amber-500/[0.06]'
                        : 'border-emerald-500/25 bg-emerald-500/[0.06]'}`}>
                        <div className="text-[11px] text-[#eef2f7] font-semibold">{f.adviceOnly ? '💡 ' : ''}{f.title}</div>
                        <div className="text-[11px] text-[#a0aab8] leading-snug">{f.detail}</div>
                        {!f.adviceOnly && (
                          <button
                            type="button"
                            data-testid={`apply-fix-${f.code}`}
                            onClick={() => {
                              saveCheckpoint();
                              setWorkspace(prev => applyQuickFix(prev, f));
                              setSelectedNode(prev => prev && prev.id === f.nodeId
                                ? applyQuickFix({ nodes: [prev] }, f).nodes[0]
                                : prev);
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-600/25 border border-emerald-500/40 hover:bg-emerald-600/40 text-[11px] font-mono font-semibold text-emerald-200 transition-colors cursor-pointer"
                          >
                            APPLY FIX
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {selectedNode && selectedDiagnostics.length > 0 && (
                <div className="space-y-1.5" aria-live="polite" data-testid="selected-node-live-diagnostics">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[#a0aab8]">Live validation</div>
                  {selectedDiagnostics.slice(0, 5).map((finding, index) => (
                    <div
                      key={`${finding.code || finding.message}-${index}`}
                      className={`rounded border px-2 py-1.5 text-[11px] leading-snug ${finding.severity === 'error'
                        ? 'border-rose-500/35 bg-rose-500/[0.08] text-rose-200'
                        : 'border-amber-500/35 bg-amber-500/[0.08] text-amber-200'}`}
                    >
                      {finding.message}
                      {finding.code && <span className="block mt-0.5 opacity-70 font-mono text-[11px]">{finding.code}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-[#a0aab8] block mb-1 font-semibold uppercase text-[11px] tracking-wider">Display Label</label>
                <input
                  type="text"
                  value={selectedNode ? selectedNode.label : (selectedWidget ? selectedWidget.label : '')}
                  onChange={e => handleLabelChange(e.target.value)}
                  className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                />
              </div>

              {/* Build Inclusion Toggle */}
              <div>
                <label className="text-[#a0aab8] block mb-1 font-semibold uppercase text-[11px] tracking-wider">Build Inclusion</label>
                <label className="flex items-center gap-2 text-[#eef2f7] bg-[#0a0c10] border border-[#262c36] rounded px-2.5 py-1.5 cursor-pointer hover:bg-[#171b23] transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={selectedNode ? selectedNode.includeInBuild !== false : (selectedWidget ? selectedWidget.includeInBuild !== false : true)}
                    onChange={e => {
                      saveCheckpoint();
                      const val = e.target.checked;
                      if (selectedNode) {
                        setWorkspace(prev => ({
                          ...prev,
                          nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, includeInBuild: val } : n)
                        }));
                        setSelectedNode(prev => prev && prev.id === selectedNode.id ? { ...prev, includeInBuild: val } : prev);
                      } else if (selectedWidget) {
                        setWorkspace(prev => ({
                          ...prev,
                          uiWidgets: prev.uiWidgets.map(w => w.id === selectedWidget.id ? { ...w, includeInBuild: val } : w)
                        }));
                        setSelectedWidget(prev => prev && prev.id === selectedWidget.id ? { ...prev, includeInBuild: val } : prev);
                      }
                    }}
                    className="accent-[#3b82f6] cursor-pointer"
                  />
                  <span className="text-[11px] uppercase font-semibold tracking-wider text-[#93c5fd]">Include in automatic build</span>
                </label>
              </div>

              {selectedNode && (selectedNode.propertiesSchema || []).map(schema => (
                <div key={schema.key}>
                  <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider flex items-center justify-between">
                    <span>{schema.label}</span>
                    {schema.description && (
                      <span className="group relative cursor-pointer ml-1">
                        <Info className="w-3.5 h-3.5 text-[#687385] hover:text-[#eef2f7]" />
                        <span className="hidden group-hover:block absolute right-0 bottom-4 w-48 bg-[#171b23] border border-[#262c36] text-[#eef2f7] text-[11px] p-2 rounded shadow-xl z-50 normal-case font-sans">
                          {schema.description}
                        </span>
                      </span>
                    )}
                  </label>

                  {schema.type === 'text' && (
                    <ExpressionInput
                      value={String((selectedNode.properties || {})[schema.key] ?? '')}
                      onChange={v => handlePropChange(schema.key, v)}
                      placeholder={schema.placeholder}
                      // Cue-reference fields complete from the WORKSPACE's own cues +
                      // the engine keywords; everything else gets $chain completion.
                      localSuggestions={/(^|_)cue$/i.test(schema.key)
                        ? [
                            ...['parent', 'this', 'static', 'namespace'].map(k => ({ insert: k, label: k, detail: 'engine cue keyword' })),
                            ...workspace.nodes
                              .filter(n => n.type === 'cue' && String(n.properties?.name ?? '').trim())
                              .map(n => ({ insert: String(n.properties!.name), label: String(n.properties!.name), detail: 'cue in this mod' })),
                          ]
                        : undefined}
                    />
                  )}

                  {schema.type === 'reference' && (
                    <ObjectIndexPicker
                      kind={schema.refKind || 'macro'}
                      endpoint={['ware', 'faction', 'job', 'macro'].includes(schema.refKind || 'macro') ? '/api/reference/suggest' : undefined}
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={v => handlePropChange(schema.key, v)}
                      placeholder={schema.placeholder}
                      stripPrefix={schema.refKind === 'faction' ? 'faction.' : undefined}
                    />
                  )}

                  {schema.type === 'textarea' && (
                    <textarea
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      placeholder={schema.placeholder}
                      rows={6}
                      className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] placeholder-[#687385] font-mono text-[11px] leading-relaxed focus:outline-none focus:border-[#3b82f6] resize-y"
                    />
                  )}

                  {schema.type === 'number' && (
                    <input
                      type="number"
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, Number(e.target.value))}
                      placeholder={schema.placeholder}
                      className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6]"
                    />
                  )}

                  {schema.type === 'select' && schema.options && (
                    <select
                      value={(selectedNode.properties || {})[schema.key] || ''}
                      onChange={e => handlePropChange(schema.key, e.target.value)}
                      className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                    >
                      {schema.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {schema.type === 'boolean' && (
                    <label className="flex items-center gap-2 text-[#eef2f7] bg-[#0a0c10] border border-[#262c36] rounded px-2.5 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={String((selectedNode.properties || {})[schema.key] || 'false') === 'true'}
                        onChange={e => handlePropChange(schema.key, e.target.checked ? 'true' : 'false')}
                        className="accent-[#3b82f6]"
                      />
                      <span className="text-[11px] uppercase tracking-wider">{schema.key}</span>
                    </label>
                  )}

                  {schema.type === 'coordinates' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={(selectedNode.properties || {})[schema.key] || ''}
                        onChange={e => handlePropChange(schema.key, e.target.value)}
                        placeholder="X,Y,Z offset"
                        className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6]"
                      />
                      {(selectedNode.xmlTag === 'create_ship' || selectedNode.xmlTag === 'create_station') && (
                        <PositionPicker
                          value={(selectedNode.properties || {})[schema.key] || ''}
                          nodeTag={selectedNode.xmlTag}
                          onChange={v => handlePropChange(schema.key, v)}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Sticky-note annotations comment box */}
              {selectedNode && (
                <div className="pt-3 mt-3 bg-amber-500/5 p-2.5 rounded border border-amber-500/25">
                  <label className="text-amber-300 font-semibold block mb-1.5 uppercase text-[11px] tracking-wider flex items-center gap-1.5 leading-none select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    STICKY-NOTE COMMENT / ANNOTATION
                  </label>
                  <textarea
                    value={selectedNode.comment || ''}
                    onChange={e => {
                      const text = e.target.value;
                      saveCheckpoint();
                      setWorkspace(prev => ({
                        ...prev,
                        nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, comment: text } : n)
                      }));
                      setSelectedNode(prev => prev && prev.id === selectedNode.id ? { ...prev, comment: text } : prev);
                    }}
                    placeholder="Attach an interactive yellow sticky-note annotation beside this node on the canvas layout..."
                    rows={4}
                    className="w-full p-2 rounded bg-[#0a0c10] border border-amber-500/25 text-[#eef2f7] font-sans text-[11px] leading-relaxed focus:outline-none focus:border-amber-400 placeholder-[#687385] resize-none text-left"
                  />
                  <p className="text-[11px] text-amber-400/80 italic leading-snug mt-1.5 select-none">
                    Attaches a floating sticky-note document to this mission step on the canvas graph.
                  </p>
                </div>
              )}

              {/* AI Copilot Cue Editor */}
              {showAdvancedActions && selectedNode && (
                <div className="mt-4 bg-[#171b23] border border-emerald-500/25 rounded p-2.5 flex flex-col gap-2 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-300 uppercase font-semibold tracking-wider">AI Copilot Cue Editor</span>
                  </div>
                  <p className="text-[11px] text-[#a0aab8] leading-normal font-sans">
                    Send this node and all of its linking triggers/actions dependencies on the canvas to the AI Guide for interactive editing.
                  </p>
                  <button
                    onClick={handleSendCuePackageToAIGuide}
                    className="w-full text-center py-1.5 font-mono text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-500/12 hover:bg-emerald-600 rounded border border-emerald-500/30 cursor-pointer uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
                  >
                    🚀 Transmit Context to AI Guide
                  </button>
                </div>
              )}

              {selectedWidget && (
                <div className="space-y-3">
                  {selectedWidget.type === 'progressbar' && (
                    <div>
                      <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider">Progress Value (%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedWidget.properties.value || 75}
                        onChange={e => handlePropChange('value', Number(e.target.value))}
                        className="w-full accent-[#3b82f6]"
                      />
                    </div>
                  )}

                  {selectedWidget.type === 'button' && (
                    <>
                      <div>
                        <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider">Interaction Command</label>
                        <select
                          value={selectedWidget.properties.action || 'signal_cue'}
                          onChange={e => handlePropChange('action', e.target.value)}
                          className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                        >
                          <option value="signal_cue">Signal Mission Cue</option>
                          <option value="dismiss">Dismiss Pilots</option>
                          <option value="standing">Raise standing rep</option>
                          <option value="claim">Claim rewards</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider">Target Cue ID</label>
                        <input
                          type="text"
                          value={selectedWidget.properties.targetCue || 'MyMissionCue'}
                          onChange={e => handlePropChange('targetCue', e.target.value)}
                          className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>
                    </>
                  )}

                  {selectedWidget.type === 'input' && (
                    <div>
                      <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider">Input Placeholder Text</label>
                      <input
                        type="text"
                        value={selectedWidget.properties.placeholder || 'Type transmission command...'}
                        onChange={e => handlePropChange('placeholder', e.target.value)}
                        className="w-full p-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[11px] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6]"
                      />
                    </div>
                  )}

                  {selectedWidget.type === 'chat' && (
                    <div>
                      <label className="text-[#a0aab8] block mb-1 uppercase text-[11px] tracking-wider">Simulated Log Lines (Comma Separated)</label>
                      <textarea
                        value={(selectedWidget.properties.messages || []).join('\n')}
                        onChange={e => handlePropChange('messages', e.target.value.split('\n'))}
                        rows={4}
                        className="w-full p-1.5 font-mono text-[11px] rounded bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] focus:outline-none focus:border-[#3b82f6] resize-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Pinned Wiki Documentation Section inside Selected Node Property Inspector */}
              {selectedNode && selectedNode.properties?.pinnedArticleId && (
                <div className="mt-4 border-t border-[#262c36] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-amber-300 font-mono font-semibold tracking-wider uppercase flex items-center gap-1.5 leading-none">
                      <Pin className="w-3 h-3 rotate-45 text-amber-400 fill-amber-500/20" />
                      PINNED CODEX REFERENCE
                    </span>
                    <button
                      onClick={() => {
                        setWorkspace(prev => ({
                          ...prev,
                          nodes: prev.nodes.map(n =>
                            n.id === selectedNode.id
                              ? { ...n, properties: { ...n.properties, pinnedArticleId: null } }
                              : n
                          )
                        }));
                        setSelectedNode(prev => prev ? { ...prev, properties: { ...prev.properties, pinnedArticleId: null } } : null);
                      }}
                      className="text-[11px] text-rose-300 hover:text-rose-200 font-mono transition-colors uppercase outline-none font-semibold cursor-pointer"
                    >
                      Unpin Reference
                    </button>
                  </div>

                  {(() => {
                    const article = WIKI_TOPICS.find(t => t.id === selectedNode.properties.pinnedArticleId);
                    if (!article) return <div className="text-[11px] text-[#687385] italic">Pinned reference guide not found.</div>;
                    return (
                      <div className="bg-[#171b23] border border-amber-500/25 hover:border-amber-500/45 rounded-lg p-3 space-y-2.5 transition-colors text-left">
                        <div className="font-semibold text-[#eef2f7] text-[11px] leading-snug">{article.title}</div>
                        <p className="text-[11px] text-[#a0aab8] font-sans line-clamp-3 leading-relaxed">{article.summary}</p>

                        {article.codeTemplate && (
                          <div className="mt-2 border-t border-[#262c36] pt-2">
                            <span className="text-[11px] text-[#687385] font-mono uppercase tracking-wider block mb-1">Snippet Preview:</span>
                            <pre className="text-[11px] text-[#93c5fd] font-mono whitespace-pre-wrap leading-tight bg-[#0a0c10] p-2 rounded border border-[#262c36] max-h-24 overflow-y-auto custom-scrollbar">
                              {article.codeTemplate}
                            </pre>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1.5 border-t border-[#262c36]">
                          <button
                            onClick={() => {
                              if (setWorkspaceView) {
                                setWorkspaceView('wiki');
                                window.location.hash = `article_${article.id}`;
                              }
                            }}
                            className="bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded text-[11px] font-mono font-semibold uppercase flex items-center gap-1 transition-colors outline-none cursor-pointer"
                          >
                            READ CODEX
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          {article.codeTemplate && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(article.codeTemplate || '');
                                setSidebarCopied(true);
                                setTimeout(() => setSidebarCopied(false), 2000);
                              }}
                              className="bg-[#3b82f6]/12 hover:bg-[#3b82f6]/20 border border-[#3b82f6]/35 text-[#93c5fd] px-2.5 py-1 rounded text-[11px] font-mono font-semibold uppercase flex items-center gap-1 ml-auto transition-colors outline-none cursor-pointer"
                            >
                              {sidebarCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>COPIED!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>COPY CODE</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
  );
}
