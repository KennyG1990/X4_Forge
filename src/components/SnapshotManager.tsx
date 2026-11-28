/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { confirmDialog } from '../lib/uiDialogs';
import {
  GitCommit,
  RotateCcw,
  Trash2,
  FileDiff,
  Plus,
  Calendar,
  Code2
} from 'lucide-react';
import { ModWorkspace } from '../types';
import { generateMDXML } from '../types';
import { toSafeModId } from '../lib/modCompiler';

interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  workspace: ModWorkspace;
}

interface SnapshotManagerProps {
  workspace: ModWorkspace;
  setWorkspace: (updater: ModWorkspace | ((prev: ModWorkspace) => ModWorkspace)) => void;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  modWorkspacePath: string;
  onSelectSnapshot?: (snapWS: ModWorkspace | null) => void;
}

// Robust line-by-line Diff engine
interface DiffLine {
  type: 'addition' | 'deletion' | 'normal';
  value: string;
  num?: number;
}

function computeSimpleDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = (oldStr || '').split('\n');
  const newLines = (newStr || '').split('\n');
  
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i].trim() === newLines[j].trim()) {
      result.push({ type: 'normal', value: oldLines[i] });
      i++;
      j++;
    } else {
      let foundMatch = false;
      // Look ahead up to 10 lines to find aligned matching block (for modifications/additions/deletions)
      for (let offset = 1; offset <= 10; offset++) {
        if (i + offset < oldLines.length && oldLines[i + offset].trim() === newLines[j].trim()) {
          for (let k = 0; k < offset; k++) {
            result.push({ type: 'deletion', value: oldLines[i + k] });
          }
          i += offset;
          foundMatch = true;
          break;
        } else if (j + offset < newLines.length && oldLines[i].trim() === newLines[j + offset].trim()) {
          for (let k = 0; k < offset; k++) {
            result.push({ type: 'addition', value: newLines[j + k] });
          }
          j += offset;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        if (i < oldLines.length && j < newLines.length) {
          result.push({ type: 'deletion', value: oldLines[i] });
          result.push({ type: 'addition', value: newLines[j] });
          i++;
          j++;
        } else if (i < oldLines.length) {
          result.push({ type: 'deletion', value: oldLines[i] });
          i++;
        } else if (j < newLines.length) {
          result.push({ type: 'addition', value: newLines[j] });
          j++;
        }
      }
    }
  }
  
  // Add 1-based indexing for line diagnostics
  return result.map((line, idx) => ({ ...line, num: idx + 1 }));
}

export default function SnapshotManager({
  workspace,
  setWorkspace,
  saveCheckpoint,
  modWorkspacePath,
  onSelectSnapshot
}: SnapshotManagerProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'saves' | 'diff'>('saves');
  const [showFeedback, setShowFeedback] = useState<'saved' | 'restored' | null>(null);
  const [, setLoading] = useState<boolean>(false);

  const modId = useMemo(() => toSafeModId(workspace.name), [workspace.name]);

  // Load snapshots from staging directory on initialization/workspace change
  const fetchSnapshots = async () => {
    if (!modWorkspacePath) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/fs/snapshots?modId=${encodeURIComponent(modId)}`);
      if (response.ok) {
        const list = await response.json();
        setSnapshots(list);
      }
    } catch (e) {
      console.error("Failed to load snapshots from server:", e);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
    setSelectedSnapshotId(null);
    if (onSelectSnapshot) {
      onSelectSnapshot(null);
    }
    // reason: fetchSnapshots is a non-memoized component-body function and onSelectSnapshot is a parent callback; the reset+refetch is intended only when the target mod (modWorkspacePath/modId) changes, and adding them risks a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modWorkspacePath, modId]);

  // Create a new snapshot of the current workspace state on the server
  const handleCreateSnapshot = async (customName?: string) => {
    if (!modWorkspacePath) return;
    const name = (customName || newSnapshotName || `Snapshot #${snapshots.length + 1}`).trim();
    try {
      const response = await fetch('/api/fs/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modId,
          workspace,
          name
        })
      });
      if (response.ok) {
        setNewSnapshotName('');
        setShowFeedback('saved');
        setTimeout(() => setShowFeedback(null), 2000);
        await fetchSnapshots();
      }
    } catch (e) {
      console.error("Failed to save snapshot on server:", e);
    }
  };

  // Roll back the active workspace to the selected snapshot
  const handleRestoreSnapshot = async (snap: Snapshot) => {
    if (!modWorkspacePath) return;
    // Capture current state in undo stack before rolling back
    saveCheckpoint();
    try {
      const currentWorkspaceResponse = await fetch('/api/agent/workspace');
      if (!currentWorkspaceResponse.ok) {
        console.error(`Failed to read current workspace before restoring snapshot (${currentWorkspaceResponse.status}).`);
        return;
      }
      const currentWorkspaceData: unknown = await currentWorkspaceResponse.json();
      if (!currentWorkspaceData || typeof currentWorkspaceData !== 'object') {
        console.error('Failed to restore snapshot: current workspace response was malformed.');
        return;
      }
      const currentWorkspaceRecord = currentWorkspaceData as {
        workspaceHash?: unknown;
        snapshotHash?: unknown;
      };
      if (
        typeof currentWorkspaceRecord.workspaceHash !== 'string'
        || currentWorkspaceRecord.workspaceHash.trim().length === 0
        || typeof currentWorkspaceRecord.snapshotHash !== 'string'
        || currentWorkspaceRecord.snapshotHash.trim().length === 0
      ) {
        console.error('Failed to restore snapshot: current workspace response did not include valid CAS hashes.');
        return;
      }

      const response = await fetch('/api/fs/restore-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modId,
          snapshotName: snap.id,
          expectedHead: currentWorkspaceRecord.workspaceHash,
          expectedSnapshotHash: currentWorkspaceRecord.snapshotHash
        })
      });
      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.workspace) {
          setWorkspace(resData.workspace);
          setShowFeedback('restored');
          setTimeout(() => setShowFeedback(null), 2000);
          if (onSelectSnapshot) {
            onSelectSnapshot(null);
          }
        }
      }
    } catch (err) {
      console.error("Failed to restore snapshot:", err);
    }
  };

  // Delete a snapshot from server
  const handleDeleteSnapshot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!modWorkspacePath) return;
    try {
      const response = await fetch('/api/fs/delete-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modId,
          snapshotName: id
        })
      });
      if (response.ok) {
        await fetchSnapshots();
        if (selectedSnapshotId === id) {
          setSelectedSnapshotId(null);
          if (onSelectSnapshot) {
            onSelectSnapshot(null);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete snapshot:", err);
    }
  };

  // Clear all checkpoints from server
  const handleClearAll = async () => {
    if (!modWorkspacePath) return;
    if (await confirmDialog("Are you sure you want to permanently clear all snapshots for this mod? This is irreversible.", { okLabel: 'Clear all', cancelLabel: 'Keep' })) {
      for (const snap of snapshots) {
        try {
          await fetch('/api/fs/delete-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modId,
              snapshotName: snap.id
            })
          });
        } catch {
          // ignore individual snapshot delete failures
        }
      }
      setSelectedSnapshotId(null);
      if (onSelectSnapshot) {
        onSelectSnapshot(null);
      }
      await fetchSnapshots();
    }
  };

  // Find currently selected snapshot
  const selectedSnapshot = useMemo(() => {
    return snapshots.find(s => s.id === selectedSnapshotId) || null;
  }, [snapshots, selectedSnapshotId]);

  // Propagate snapshot selection changes up to the parent application
  useEffect(() => {
    if (onSelectSnapshot) {
      onSelectSnapshot(selectedSnapshot ? selectedSnapshot.workspace : null);
    }
  }, [selectedSnapshot, onSelectSnapshot]);

  // Generate and compare XML structures between current workspace and selected snapshot
  const diffData = useMemo(() => {
    if (!selectedSnapshot) return null;
    
    try {
      const oldXml = generateMDXML(selectedSnapshot.workspace);
      const newXml = generateMDXML(workspace);
      
      const diffLines = computeSimpleDiff(oldXml, newXml);
      
      // Calculate structural statistics
      const oldNodesCount = selectedSnapshot.workspace.nodes.length;
      const newNodesCount = workspace.nodes.length;
      const oldWidgetsCount = selectedSnapshot.workspace.uiWidgets?.length || 0;
      const newWidgetsCount = workspace.uiWidgets?.length || 0;
      const oldPatchesCount = selectedSnapshot.workspace.xmlPatches?.length || 0;
      const newPatchesCount = workspace.xmlPatches?.length || 0;

      const additionsCount = diffLines.filter(l => l.type === 'addition').length;
      const deletionsCount = diffLines.filter(l => l.type === 'deletion').length;

      return {
        lines: diffLines,
        stats: {
          nodesDelta: newNodesCount - oldNodesCount,
          widgetsDelta: newWidgetsCount - oldWidgetsCount,
          patchesDelta: newPatchesCount - oldPatchesCount,
          additions: additionsCount,
          deletions: deletionsCount
        }
      };
    } catch (e) {
      return {
        lines: [{ type: 'normal', value: `Error generating diff comparison: ${String(e)}` }] as DiffLine[],
        stats: { nodesDelta: 0, widgetsDelta: 0, patchesDelta: 0, additions: 0, deletions: 0 }
      };
    }
  }, [workspace, selectedSnapshot]);

  return (
    <div data-testid="snapshot-manager" className="border-t border-[#262c36] pt-4 space-y-3 font-mono text-xs text-[#eef2f7]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#eef2f7] flex items-center gap-1.5">
          <GitCommit className="w-4 h-4 text-[#60a5fa]" />
          Workspace Snapshots
        </h3>
        
        {snapshots.length > 0 && (
          <button 
            onClick={handleClearAll}
            className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Wipe
          </button>
        )}
      </div>

      {/* Snapshot operations feedback */}
      {showFeedback && (
        <div className={`p-2 rounded font-semibold text-[11px] text-center transition-all ${
          showFeedback === 'saved' 
            ? 'bg-emerald-500/12 border border-emerald-500/30 text-emerald-300' 
            : 'bg-[#3b82f6]/12 border border-[#3b82f6]/35 text-[#93c5fd]'
        }`}>
          {showFeedback === 'saved' ? "✓ Snapshot captured successfully!" : "✓ Workspace rolled back to old instance version!"}
        </div>
      )}

      {/* Create New Snapshot Form */}
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          value={newSnapshotName}
          onChange={e => setNewSnapshotName(e.target.value)}
          placeholder="New milestone name..."
          className="flex-1 px-2.5 py-1.5 rounded bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] placeholder-[#687385] focus:outline-none focus:border-[#3b82f6] transition-colors text-[11px]"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleCreateSnapshot();
            }
          }}
        />
        <button
          onClick={() => handleCreateSnapshot()}
          className="px-2.5 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
          title="Take manual milestone snapshot"
        >
          <Plus className="w-3.5 h-3.5" />
          Snap
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="p-4 rounded-lg bg-[#11141a] border border-[#262c36] border-dashed text-center text-[#687385] italic text-[11px]">
          No checkpoints saved for mod "{workspace.name}". Capture snapshots above to prevent version derailments.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Sub tabs: Milestones List vs active Snapshot XML Diff */}
          <div className="flex border-b border-[#262c36] text-[11px] font-medium">
            <button
              onClick={() => setActiveTab('saves')}
              className={`flex-1 py-1.5 text-center border-b-2 transition-colors cursor-pointer ${
                activeTab === 'saves' 
                  ? 'border-[#3b82f6] text-[#eef2f7] bg-[#171b23]' 
                  : 'border-transparent text-[#a0aab8] hover:text-[#eef2f7]'
              }`}
            >
              Checkpoints ({snapshots.length})
            </button>
            <button
              onClick={() => {
                if (!selectedSnapshotId) {
                  setSelectedSnapshotId(snapshots[0]?.id || null);
                }
                setActiveTab('diff');
              }}
              className={`flex-1 py-1.5 text-center border-b-2 transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'diff' 
                  ? 'border-[#3b82f6] text-[#eef2f7] bg-[#171b23]' 
                  : 'border-transparent text-[#a0aab8] hover:text-[#eef2f7]'
              }`}
            >
              <FileDiff className="w-3.5 h-3.5" />
              Diff Changes
            </button>
          </div>

          {activeTab === 'saves' ? (
            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1.5 p-0.5">
              {snapshots.map(snap => {
                const isSelected = selectedSnapshotId === snap.id;
                const nodeCount = snap.workspace.nodes.length;
                const widgetCount = snap.workspace.uiWidgets?.length || 0;
                
                return (
                  <div
                    key={snap.id}
                    onClick={() => {
                      setSelectedSnapshotId(snap.id);
                      setActiveTab('diff'); // Switch to view diff on select!
                    }}
                    className={`p-2 rounded border transition-colors cursor-pointer text-[11px] flex items-center justify-between gap-2 ${
                      isSelected 
                        ? 'bg-[#3b82f6]/12 border-[#3b82f6]/45 text-[#eef2f7]' 
                        : 'bg-[#11141a] border-[#262c36] text-[#cbd5e1] hover:border-[#3b82f6]/35 hover:bg-[#171b23]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-[#eef2f7] truncate text-xs">{snap.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#a0aab8]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {snap.timestamp}
                        </span>
                        <span>•</span>
                        <span>{nodeCount} Nodes</span>
                        {widgetCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{widgetCount} Widgets</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreSnapshot(snap);
                        }}
                        className="px-2 py-1 bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 border border-[#3b82f6]/35 text-[#93c5fd] rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Rollback active workspace to this version index"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                      <button
                        onClick={(e) => handleDeleteSnapshot(snap.id, e)}
                        className="p-1 hover:bg-rose-500/20 text-[#a0aab8] hover:text-rose-300 rounded transition-colors cursor-pointer"
                        title="Delete checkpoint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // XML DIFF SCREEN
            <div className="space-y-2">
              {!selectedSnapshot ? (
                <div className="p-4 text-center text-[#687385] italic text-[11px]">
                  Select a checkpoint from the list to compute file-level diff diagnostics.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-[#a0aab8]">Comparing active vs:</span>
                    <select
                      value={selectedSnapshotId || ''}
                      onChange={e => setSelectedSnapshotId(e.target.value)}
                      className="bg-[#0a0c10] border border-[#262c36] text-[#eef2f7] rounded px-2 py-1 font-mono text-[11px] max-w-[180px] focus:outline-none focus:border-[#3b82f6]"
                    >
                      {snapshots.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.timestamp.slice(0, 8)})</option>
                      ))}
                    </select>
                  </div>

                  {/* Summary of Delta changes */}
                  {diffData && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#11141a] border border-[#262c36] rounded text-[11px] leading-normal font-sans">
                      <div className="space-y-1">
                        <div className="text-[#cbd5e1] font-semibold">Flowchart Deltas</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#a0aab8]">Nodes:</span>
                          <span className={diffData.stats.nodesDelta > 0 ? 'text-emerald-400' : diffData.stats.nodesDelta < 0 ? 'text-rose-400' : 'text-[#cbd5e1]'}>
                            {diffData.stats.nodesDelta > 0 ? `+${diffData.stats.nodesDelta}` : diffData.stats.nodesDelta}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#a0aab8]">Widgets:</span>
                          <span className={diffData.stats.widgetsDelta > 0 ? 'text-emerald-400' : diffData.stats.widgetsDelta < 0 ? 'text-rose-400' : 'text-[#cbd5e1]'}>
                            {diffData.stats.widgetsDelta > 0 ? `+${diffData.stats.widgetsDelta}` : diffData.stats.widgetsDelta}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#a0aab8]">XML Patches:</span>
                          <span className={diffData.stats.patchesDelta > 0 ? 'text-emerald-400' : diffData.stats.patchesDelta < 0 ? 'text-rose-400' : 'text-[#cbd5e1]'}>
                            {diffData.stats.patchesDelta > 0 ? `+${diffData.stats.patchesDelta}` : diffData.stats.patchesDelta}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 border-l border-[#262c36] pl-2.5">
                        <div className="text-[#cbd5e1] font-semibold">XML Line Changes</div>
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <span className="bg-emerald-500/15 px-1.5 py-0.5 rounded">+{diffData.stats.additions} added</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-rose-400">
                          <span className="bg-rose-500/15 px-1.5 py-0.5 rounded">-{diffData.stats.deletions} deleted</span>
                        </div>
                        <button
                          onClick={() => handleRestoreSnapshot(selectedSnapshot)}
                          className="w-full mt-1.5 px-2 py-1 bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 border border-[#3b82f6]/35 text-[#93c5fd] rounded text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Rollback workspace
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Micro XML code Diff viewer */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-[#a0aab8] font-semibold flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-[#60a5fa]" />
                      Lines Comparison (md/{modId}.xml)
                    </span>
                    
                    <div className="border border-[#262c36] rounded overflow-hidden max-h-60 bg-[#0a0c10] text-[11px]">
                      <div className="overflow-auto custom-scrollbar h-52 font-mono scroll-smooth select-text leading-snug p-2 space-y-0.5">
                        {diffData && diffData.lines.map((line) => {
                          let lineClass = 'text-[#a0aab8]';
                          let prefix = ' ';
                          if (line.type === 'addition') {
                            lineClass = 'bg-emerald-500/12 text-emerald-300 font-semibold border-l-2 border-emerald-500 pl-1';
                            prefix = '+';
                          } else if (line.type === 'deletion') {
                            lineClass = 'bg-rose-500/12 text-rose-300 font-semibold border-l-2 border-rose-500 pl-1 line-through';
                            prefix = '-';
                          }
                          
                          return (
                            <div key={line.num} className={`flex ${lineClass} whitespace-pre`}>
                              <span className="opacity-35 w-8 select-none text-right pr-2 shrink-0">{line.num}</span>
                              <span className="opacity-55 select-none w-3 shrink-0">{prefix}</span>
                              <span className="flex-1 break-all select-all font-mono">{line.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
