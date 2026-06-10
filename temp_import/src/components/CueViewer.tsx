/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CueViewer component for X4 Foundations Visual Mod Studio.
 * Renders a nested tree of Mission Director script cues according to their
 * parent-subcue dependency links, with checkboxes to toggle graph visibility.
 */

import React, { useState, useMemo } from 'react';
import { 
  GitCommit, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Eye, 
  EyeOff,
  CheckSquare, 
  Square, 
  RefreshCw,
  Compass,
  Link2
} from 'lucide-react';
import { ModWorkspace, MDNode, MDLink } from '../types';

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
}

export default function CueViewer({
  workspace,
  selectedNode,
  setSelectedNode,
  setFocusNodeRequest,
  visibleCueIds,
  setVisibleCueIds
}: CueViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // 1. Retrieve all cues
  const allCues = useMemo(() => {
    return workspace.nodes.filter(node => node.type === 'cue');
  }, [workspace.nodes]);

  // 2. Identify root cues (cues that don't have a parent "out_sub" link to their "in_flow")
  const rootCues = useMemo(() => {
    const subCueIds = new Set<string>();
    workspace.links.forEach(link => {
      if (link.targetPortId === 'in_flow' && link.sourcePortId === 'out_sub') {
        subCueIds.add(link.targetNodeId);
      }
    });
    return allCues.filter(cue => !subCueIds.has(cue.id));
  }, [allCues, workspace.links]);

  // 3. Build recursive hierarchy tree
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

  // 4. Set of currently visible cue IDs (for easy checkbox matches)
  // If visibleCueIds is null, all cues are visible by default
  const activeVisibleSet = useMemo(() => {
    if (visibleCueIds === null) {
      return new Set<string>(allCues.map(c => c.id));
    }
    return new Set<string>(visibleCueIds);
  }, [visibleCueIds, allCues]);

  // 5. Expand/collapse tree folders
  const toggleFolder = (id: string) => {
    setExpandedPaths(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Helper: Collect all descendant IDs of a tree node
  const getDescendantIds = (node: CueTreeNode): string[] => {
    let ids: string[] = [node.id];
    node.children.forEach(child => {
      ids = [...ids, ...getDescendantIds(child)];
    });
    return ids;
  };

  // 6. Handle visibility checkbox toggle (respects parent-child dependencies recursively!)
  const handleToggleCueVisibility = (treeNode: CueTreeNode, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering selection focus
    const targetIds = getDescendantIds(treeNode);
    const isCurrentlyChecked = activeVisibleSet.has(treeNode.id);

    let nextVisibleList: string[] | null = null;
    
    if (isCurrentlyChecked) {
      // Hide self and all descendants recursive
      const nextSet = new Set<string>(activeVisibleSet);
      targetIds.forEach(id => nextSet.delete(id));
      nextVisibleList = Array.from(nextSet);
    } else {
      // Show self and all descendants recursive
      const nextSet = new Set<string>(activeVisibleSet);
      targetIds.forEach(id => nextSet.add(id));
      nextVisibleList = Array.from(nextSet);
    }

    // If all cues are checked, default back to "All" (null state)
    if (nextVisibleList.length === allCues.length) {
      setVisibleCueIds(null);
    } else {
      setVisibleCueIds(nextVisibleList);
    }
  };

  // 7. Select All Cues
  const handleSelectAll = () => {
    setVisibleCueIds(null);
  };

  // 8. Uncheck All Cues (Empty graph selection)
  const handleClearAll = () => {
    setVisibleCueIds([]);
  };

  // 9. Clicking Cue Name focuses camera viewport
  const handleFocusCue = (cueNode: MDNode) => {
    setSelectedNode(cueNode);
    setFocusNodeRequest({ nodeId: cueNode.id, timestamp: Date.now() });
  };

  // 10. Filter tree hierarchy recursive
  const filteredTree = useMemo(() => {
    if (!searchQuery) return cueTree;
    
    const lcQuery = searchQuery.toLowerCase();
    
    const filterNode = (node: CueTreeNode): CueTreeNode | null => {
      const selfMatches = node.name.toLowerCase().includes(lcQuery);
      
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter((child): child is CueTreeNode => child !== null);
      
      if (selfMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }
      return null;
    };

    return cueTree.map(root => filterNode(root)).filter((root): root is CueTreeNode => root !== null);
  }, [cueTree, searchQuery]);

  // Render tree recursive items
  const renderCueNode = (node: CueTreeNode, depth = 0) => {
    const isParent = node.children.length > 0;
    const isExpanded = expandedPaths[node.id] ?? true; // Default parent cues to expanded
    const isActive = selectedNode?.id === node.id;
    const isChecked = activeVisibleSet.has(node.id);

    // Style helper for state attributes
    const initialState = node.node.properties?.state || 'active';
    const isInstantiated = node.node.properties?.instantiate === 'true';

    return (
      <div key={node.id} style={{ paddingLeft: `${depth * 8}px` }}>
        <div 
          className={`group flex items-center gap-1.5 py-1 px-1.5 rounded text-left transition-all font-mono text-[11px] border border-transparent select-none my-0.5 ${
            isActive 
              ? 'bg-purple-600/20 text-purple-300 border-purple-500/30' 
              : 'text-slate-200 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          {/* Collapse folder bracket pointer */}
          <span className="shrink-0">
            {isParent ? (
              <button 
                onClick={() => toggleFolder(node.id)}
                className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-350 cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : (
              <div className="w-4 h-4 flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
              </div>
            )}
          </span>

          {/* Eye Icon Visibility Checkbox checkbox style */}
          <button
            onClick={(e) => handleToggleCueVisibility(node, e)}
            className={`p-1 rounded shrink-0 transition-colors cursor-pointer ${
              isChecked 
                ? 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/10' 
                : 'text-slate-600 hover:text-slate-400 hover:bg-white/5'
            }`}
            title={isChecked ? "Hide cue and descendants from canvas" : "Show cue and descendants on canvas"}
          >
            {isChecked ? (
              <Eye className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 shrink-0" />
            )}
          </button>

          {/* Cue Badge Icon */}
          <GitCommit className={`w-3.5 h-3.5 shrink-0 ${
            isChecked ? 'text-purple-400' : 'text-slate-600'
          }`} />

          {/* Clickable Cue Title label */}
          <button
            onClick={() => handleFocusCue(node.node)}
            className="flex-1 text-left truncate cursor-pointer pl-0.5 min-w-0"
            title={`Focus cue & dependencies: ${node.name}`}
          >
            <span className={`truncate font-semibold ${
              isChecked ? '' : 'text-slate-500 line-through decoration-slate-700'
            }`}>{node.name}</span>
            
            {/* Properties summary indicators line */}
            <span className="block text-[8px] text-slate-500 font-mono scale-95 origin-left truncate leading-tight">
              {initialState} {isInstantiated && '• dynamic'}
            </span>
          </button>
        </div>

        {/* Recursive sub-cue child elements block */}
        {isParent && isExpanded && (
          <div className="border-l border-white/5 ml-3 my-0.5 space-y-0.5">
            {node.children.map(child => renderCueNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1b1e24] text-[#e0e0e0] overflow-hidden select-none font-sans border-r border-white/5">
      {/* Title Bar Section Header */}
      <div className="p-3 border-b border-white/10 shrink-0 space-y-2 bg-[#20232b]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-purple-400" />
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-white">Cue Hierarchy</span>
          </div>

          {/* Visibility presets triggers */}
          <div className="flex gap-1">
            <button
              onClick={handleSelectAll}
              className="p-1 px-1.5 rounded-md hover:bg-[#2d313d] text-cyan-400 hover:text-white transition-all text-[9.5px] font-mono font-bold cursor-pointer"
              title="Show all cues and elements"
            >
              SHOW ALL
            </button>
            <span className="text-slate-600 self-center">|</span>
            <button
              onClick={handleClearAll}
              className="p-1 px-1.5 rounded-md hover:bg-[#2d313d] text-slate-400 hover:text-red-400 transition-all text-[9.5px] font-mono font-bold cursor-pointer"
              title="Hide all cues from canvas"
            >
              CLEAR ALL
            </button>
          </div>
        </div>

        {/* Visibility filter counter badge */}
        <div className="flex items-center gap-1.5 bg-black/35 rounded-md p-1.5 border border-white/5 font-mono text-[9.5px] justify-between">
          <div className="flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">Status:</span>
            <span className="text-purple-400 font-bold">{allCues.length} total cues</span>
          </div>
          <div className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 rounded font-bold uppercase">
            {visibleCueIds === null ? 'All Active' : `${visibleCueIds.length} visible`}
          </div>
        </div>

        {/* File filter search box */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-3 h-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter Cue Hierarchy"
            className="w-full pl-7 pr-2 py-1.5 rounded bg-black/45 border border-white/5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono"
          />
        </div>
      </div>

      {/* Tree scroll viewport */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-[#1b1e24] scrollbar-thin">
        {filteredTree.length === 0 ? (
          <div className="text-center py-8 text-[10px] font-mono text-slate-500 leading-normal">
            {allCues.length === 0 
              ? 'No script cues identified in active blueprint.' 
              : 'No cues matched query criteria'
            }
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredTree.map(rootItem => renderCueNode(rootItem))}
          </div>
        )}
      </div>

      {/* Actionable tutorial help line */}
      <div className="p-2 border-t border-white/5 bg-[#17191e] flex items-center justify-between font-mono text-[8.5px] text-slate-500 shrink-0">
        <span className="truncate">👁 Toggle eye icon to filter. Click name to Pan.</span>
      </div>
    </div>
  );
}
