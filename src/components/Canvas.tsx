/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  Move,
  Link2,
  Trash2,
  Sparkles,
  Play,
  Square,
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Compass,
  Zap,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Filter,
  MessageSquare,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter
} from 'lucide-react';
import { MDNode, MDLink, ModWorkspace, Port, NODE_TEMPLATES } from '../types';
import { computeAlignment, type AlignMode } from '../lib/nodeAlign';

interface CanvasProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  selectedNode: MDNode | null;
  setSelectedNode: (node: MDNode | null) => void;
  schemaTemplates?: Omit<MDNode, 'id' | 'x' | 'y'>[];
  visibleCueIds: string[] | null;
  focusNodeRequest: { nodeId: string; timestamp: number } | null;
  selectedCueIds: string[];
  setSelectedCueIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function Canvas({
  workspace,
  setWorkspace,
  saveCheckpoint,
  selectedNode,
  setSelectedNode,
  schemaTemplates = [],
  visibleCueIds,
  focusNodeRequest,
  selectedCueIds,
  setSelectedCueIds
}: CanvasProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [depPanelOpen, setDepPanelOpen] = useState<boolean>(true);
  // General multi-node selection (ANY node type) for alignment — parallel to the
  // cue-only `selectedCueIds`, so the cue-specific behaviour is untouched.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [linking, setLinking] = useState<{ nodeId: string; portId: string; type: string } | null>(null);

  // Find in Blueprint search overlay states
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchNodesQuery, setSearchNodesQuery] = useState<string>('');

  // Diagnostic panel toggle State
  const [diagnosticPanelOpen, setDiagnosticPanelOpen] = useState<boolean>(false);

  // Drag connection background-click support (Unreal smart auto-completion)
  const [pendingLinkTarget, setPendingLinkTarget] = useState<{ nodeId: string; portId: string; type: string } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Scaling comment boxes
  const [resizingComment, setResizingComment] = useState<{ id: string; startWidth: number; startHeight: number; clientX: number; clientY: number } | null>(null);

  // Ref container to track starting offsets of nodes to avoid drift during multi-drag inside group comment boxes
  const draggedNodesStartOffset = useRef<{ id: string; x: number; y: number }[]>([]);

  // Quick Spawn Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; gridX: number; gridY: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Script Evaluation Mock Simulator state
  const [simActive, setSimActive] = useState<boolean>(false);
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [pulsingLinks, setPulsingLinks] = useState<string[]>([]);
  const [simLogs, setSimLogs] = useState<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'action' }[]>([]);
  const [isConsoleDockOpen, setIsConsoleDockOpen] = useState<boolean>(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const simTimersRef = useRef<number[]>([]);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Drops a template node safely from Sidebar Template Library onto coordinates clicked/positioned
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data && data.type === 'x4-template-node') {
        const templateNode = data.template;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const clientX = e.clientX - rect.left;
          const clientY = e.clientY - rect.top;
          
          // Translate client coords with panning offset and zoom scaling factor
          const dropX = Math.round((clientX - panOffset.x) / zoom / 10) * 10;
          const dropY = Math.round((clientY - panOffset.y) / zoom / 10) * 10;
          
          const newNode = {
            ...templateNode,
            id: `node_template_${Date.now()}`,
            x: dropX,
            y: dropY,
            includeInBuild: true // Active compiled copies!
          };
          
          saveCheckpoint();
          setWorkspace(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNode]
          }));
        }
      }
    } catch (err) {
      console.error("Canvas dropping handle error", err);
    }
  };

  // Pan the canvas offset on clicking background dragging
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    // Unreal Engine style: Drag wire to blank space and click triggers Quick Spawn popup auto-linking
    if (linking) {
      e.preventDefault();
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const gridX = Math.round((x - panOffset.x) / zoom / 10) * 10;
      const gridY = Math.round((y - panOffset.y) / zoom / 10) * 10;

      setPendingLinkTarget(linking);
      setContextMenu({ x, y, gridX, gridY });
      setSearchQuery('');
      setLinking(null);
      return;
    }

    if (e.target === canvasRef.current || (e.target as HTMLElement).id === 'grid-pattern' || (e.target as HTMLElement).tagName === 'path' || (e.target as HTMLElement).tagName === 'svg') {
      setPanning({ x: e.clientX, y: e.clientY });
      setSelectedNode(null);
      setSelectedCueIds([]);
      setSelectedNodeIds([]);
    }
  };

  // Double click empty space to trigger Quick Spawn selection, just like Unreal Spacebar/DoubleClick
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).id === 'grid-pattern' || (e.target as HTMLElement).tagName === 'path' || (e.target as HTMLElement).tagName === 'svg') {
      e.preventDefault();
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const gridX = Math.round((x - panOffset.x) / zoom / 10) * 10;
      const gridY = Math.round((y - panOffset.y) / zoom / 10) * 10;

      setContextMenu({ x, y, gridX, gridY });
      setSearchQuery('');
    }
  };

  // Node Drags initialization with spatial state snapshots for child drag integration within comments
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    setDraggedNodeId(nodeId);
    const node = workspace.nodes.find(n => n.id === nodeId);
    if (node) {
      dragStartPos.current = {
        x: e.clientX,
        y: e.clientY
      };
      draggedNodesStartOffset.current = workspace.nodes.map(n => ({
        id: n.id,
        x: n.x,
        y: n.y
      }));

      const isCue = node.type === 'cue';
      if (isCue) {
        const isModified = e.shiftKey || e.ctrlKey || e.metaKey;
        if (isModified) {
          setSelectedCueIds(prev => {
            if (prev.includes(nodeId)) {
              return prev.filter(id => id !== nodeId);
            } else {
              return [...prev, nodeId];
            }
          });
        } else {
          setSelectedCueIds([nodeId]);
        }
      } else {
        setSelectedCueIds([]);
      }

      // General multi-selection for alignment (any node type, shift/ctrl to add).
      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isMulti) {
        setSelectedNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
      } else {
        setSelectedNodeIds([nodeId]);
      }

      setSelectedNode(node);
      window.dispatchEvent(new CustomEvent('x4-node-selected', { detail: { nodeId } }));
    }
  };

  // Quick Trigger Context Menu on Right Click
  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Accounts mathematically for scrolling panning constraints and zoom metrics
    const gridX = Math.round((x - panOffset.x) / zoom / 10) * 10;
    const gridY = Math.round((y - panOffset.y) / zoom / 10) * 10;

    setContextMenu({ x, y, gridX, gridY });
    setSearchQuery('');
  };

  // Sync mouse interactions (panning, resizing comment groups, dragging node clusters, and wiring live line mouse tracers)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingComment) {
        const dx = (e.clientX - resizingComment.clientX) / zoom;
        const dy = (e.clientY - resizingComment.clientY) / zoom;
        
        setWorkspace(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => 
            n.id === resizingComment.id 
              ? { 
                  ...n, 
                  width: Math.max(150, Math.round((resizingComment.startWidth + dx) / 10) * 10), 
                  height: Math.max(100, Math.round((resizingComment.startHeight + dy) / 10) * 10) 
                } 
              : n
          )
        }));
      } else if (draggedNodeId) {
        const dragStart = draggedNodesStartOffset.current.find(n => n.id === draggedNodeId);
        if (dragStart) {
          const dx = (e.clientX - dragStartPos.current.x) / zoom;
          const dy = (e.clientY - dragStartPos.current.y) / zoom;
          
          const virtualDx = Math.round(dx / 10) * 10;
          const virtualDy = Math.round(dy / 10) * 10;
          
          const targetNode = workspace.nodes.find(n => n.id === draggedNodeId);
          
          if (targetNode && targetNode.type === 'comment') {
            const commentWidth = targetNode.width || 400;
            const commentHeight = targetNode.height || 300;
            
            // Look up nodes whose starting coordinates were bounds-encompassed inside this Comment Box
            const nodesInsideIds = draggedNodesStartOffset.current.filter(startingNode => {
              return startingNode.id !== draggedNodeId && 
                     startingNode.id !== 'grid-canvas' &&
                     workspace.nodes.find(wn => wn.id === startingNode.id)?.type !== 'comment' &&
                     startingNode.x >= dragStart.x && 
                     startingNode.x <= dragStart.x + commentWidth &&
                     startingNode.y >= dragStart.y && 
                     startingNode.y <= dragStart.y + commentHeight;
            }).map(n => n.id);
            
            setWorkspace(prev => ({
              ...prev,
              nodes: prev.nodes.map(n => {
                const startingInfo = draggedNodesStartOffset.current.find(s => s.id === n.id);
                if (!startingInfo) return n;
                
                if (n.id === draggedNodeId) {
                  return { ...n, x: startingInfo.x + virtualDx, y: startingInfo.y + virtualDy };
                } else if (nodesInsideIds.includes(n.id)) {
                  return { ...n, x: startingInfo.x + virtualDx, y: startingInfo.y + virtualDy };
                }
                return n;
              })
            }));
          } else {
            // Standard individual dragging
            setWorkspace(prev => ({
              ...prev,
              nodes: prev.nodes.map(n => {
                const startingInfo = draggedNodesStartOffset.current.find(s => s.id === n.id);
                if (startingInfo && n.id === draggedNodeId) {
                  return { ...n, x: startingInfo.x + virtualDx, y: startingInfo.y + virtualDy };
                }
                return n;
              })
            }));
          }
        }
      } else if (panning) {
        const dx = e.clientX - panning.x;
        const dy = e.clientY - panning.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setPanning({ x: e.clientX, y: e.clientY });
      }
      
      // Live wire tracker mouse vector calculations
      if (linking) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left - panOffset.x) / zoom;
          const y = (e.clientY - rect.top - panOffset.y) / zoom;
          setMousePos({ x, y });
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedNodeId || resizingComment) {
        saveCheckpoint();
      }
      setDraggedNodeId(null);
      setResizingComment(null);
      setPanning(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNodeId, panning, saveCheckpoint, resizingComment, zoom, panOffset, linking, workspace.nodes]);

  // Handle intuitive smooth zoom-to-cursor via mouse scroll wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const zoomStep = 0.05;
      const direction = e.deltaY < 0 ? 1 : -1;
      
      setZoom(prevZoom => {
        const nextZoom = Math.max(0.6, Math.min(1.4, prevZoom + direction * zoomStep));
        if (nextZoom === prevZoom) return prevZoom;

        // Obtain mouse position relative to container bounds
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Map client coordinates to workspace board virtual coordinates before scale shift
        const canvasX = (mouseX - panOffset.x) / prevZoom;
        const canvasY = (mouseY - panOffset.y) / prevZoom;

        // Perform layout re-anchoring to avoid visual viewport sliding
        setPanOffset({
          x: mouseX - canvasX * nextZoom,
          y: mouseY - canvasY * nextZoom
        });

        return nextZoom;
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [panOffset]);

  // Clean-up active simulations on unmount
  useEffect(() => {
    return () => {
      simTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Autoscroll debug logs dock safely within its container to avoid window scroll page shifting
  useEffect(() => {
    if (consoleBottomRef.current) {
      const container = consoleBottomRef.current.parentElement;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [simLogs]);

  const deleteNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveCheckpoint();
    setWorkspace(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      links: prev.links.filter(l => l.sourceNodeId !== nodeId && l.targetNodeId !== nodeId)
    }));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  const clearLinks = () => {
    saveCheckpoint();
    setWorkspace(prev => ({ ...prev, links: [] }));
    setLinking(null);
  };

  // Connection logic
  const handlePortClick = (nodeId: string, port: Port, e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);

    if (!linking) {
      setLinking({ nodeId, portId: port.id, type: port.type });
    } else {
      if (linking.nodeId !== nodeId) {
        saveCheckpoint();
        setWorkspace(prev => {
          const linkExists = prev.links.some(
            l => l.sourceNodeId === linking.nodeId && 
                 l.sourcePortId === linking.portId && 
                 l.targetNodeId === nodeId && 
                 l.targetPortId === port.id
          );
          if (linkExists) return prev;

          const newLink: MDLink = {
            id: `link_${Date.now()}`,
            sourceNodeId: linking.nodeId,
            sourcePortId: linking.portId,
            targetNodeId: nodeId,
            targetPortId: port.id
          };
          return {
            ...prev,
            links: [...prev.links, newLink]
          };
        });
      }
      setLinking(null);
    }
  };

  // Get source or target coordinates of ports
  const getPortCoordinates = (nodeId: string, portId: string, isSource: boolean) => {
    const node = workspace.nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const width = 240;
    const baseIndexInPorts = node.inputs.findIndex(p => p.id === portId);
    const baseIndexOutPorts = node.outputs.findIndex(p => p.id === portId);
    
    let xOffset = 0;
    let yOffset = 50; 

    if (baseIndexInPorts !== -1) {
      xOffset = 0;
      yOffset += 26 * baseIndexInPorts + 14;
    } else if (baseIndexOutPorts !== -1) {
      xOffset = width;
      yOffset += 26 * baseIndexOutPorts + 14;
    }

    return {
      x: node.x + xOffset,
      y: node.y + yOffset
    };
  };

  // Viewport tracking for optimization
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });

  useEffect(() => {
    if (!canvasRef.current) return;
    let raf = 0;
    // Measure on an animation frame (after layout settles), skip zero-size reads, and only
    // update state when the size actually changed (avoids redundant re-renders).
    const measure = () => {
      const el = canvasRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setViewportSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    scheduleMeasure();
    // Element-level observer (resizes from sidebar/code-panel drags) ...
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(canvasRef.current);
    // ... plus a window-resize backstop and a deferred re-measure, so opening the app in a
    // much larger window (or a window resize the element observer is slow to report) always
    // reflows the canvas/frustum-cull viewport instead of leaving a stale paint.
    window.addEventListener('resize', scheduleMeasure);
    const settle = window.setTimeout(scheduleMeasure, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver.disconnect();
    };
  }, []);

  // Visible bounds calculation in virtual coordinates (frustum culling)
  const visibleBounds = React.useMemo(() => {
    const pad = 300 / Math.max(0.1, zoom);
    const xStart = -panOffset.x / zoom - pad;
    const xEnd = (-panOffset.x + viewportSize.width) / zoom + pad;
    const yStart = -panOffset.y / zoom - pad;
    const yEnd = (-panOffset.y + viewportSize.height) / zoom + pad;
    
    return { xStart, xEnd, yStart, yEnd };
  }, [panOffset, zoom, viewportSize]);

  // Map each non-cue node to the cue it belongs to.
  // Rewritten from O(cues × links × nodes) to O(nodes + links): prebuild a node-id
  // lookup and an undirected adjacency list (excluding parent→sub-cue boundary links),
  // then BFS each cue subtree with an index-pointer queue (no O(n) Array.shift).
  const nodeToCueMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    const nodeById = new Map<string, MDNode>();
    for (const n of workspace.nodes) nodeById.set(n.id, n);

    const adj = new Map<string, string[]>();
    const addAdj = (a: string, b: string) => {
      let arr = adj.get(a);
      if (!arr) { arr = []; adj.set(a, arr); }
      arr.push(b);
    };
    for (const link of workspace.links) {
      // Skip parent-subcue transitions so we stay within the cue's boundary.
      if (link.sourcePortId === 'out_sub' && link.targetPortId === 'in_flow') continue;
      addAdj(link.sourceNodeId, link.targetNodeId);
      addAdj(link.targetNodeId, link.sourceNodeId);
    }

    for (const cueNode of workspace.nodes) {
      if (cueNode.type !== 'cue') continue;
      map[cueNode.id] = cueNode.id;
      const visited = new Set<string>([cueNode.id]);
      const queue: string[] = [cueNode.id];
      let head = 0;
      while (head < queue.length) {
        const currentId = queue[head++];
        const neighbors = adj.get(currentId);
        if (!neighbors) continue;
        for (const neighborId of neighbors) {
          if (visited.has(neighborId)) continue;
          const neighborNode = nodeById.get(neighborId);
          if (neighborNode && neighborNode.type !== 'cue') {
            visited.add(neighborId);
            map[neighborId] = cueNode.id;
            queue.push(neighborId);
          }
        }
      }
    }

    return map;
  }, [workspace.nodes, workspace.links]);

  // Nodes that are active in the workspace (not hidden by cue filter)
  const nodesFilteredByCue = React.useMemo(() => {
    if (!visibleCueIds) return workspace.nodes;
    return workspace.nodes.filter(node => {
      const cueId = nodeToCueMap[node.id];
      if (cueId) {
        return visibleCueIds.includes(cueId);
      }
      return true;
    });
  }, [workspace.nodes, visibleCueIds, nodeToCueMap]);

  // Nodes falling inside the visible bounds
  const visibleNodes = React.useMemo(() => {
    return nodesFilteredByCue.filter(node => {
      const w = node.type === 'comment' ? (node.width || 400) : 240;
      const h = node.type === 'comment' ? (node.height || 300) : 200;
      return (
        node.x + w >= visibleBounds.xStart &&
        node.x <= visibleBounds.xEnd &&
        node.y + h >= visibleBounds.yStart &&
        node.y <= visibleBounds.yEnd
      );
    });
  }, [nodesFilteredByCue, visibleBounds]);

  // Links falling inside the visible bounds (at least one end inside, or crossing)
  const visibleLinks = React.useMemo(() => {
    const visibleNodeIds = new Set(nodesFilteredByCue.map(n => n.id));
    return workspace.links.filter(link => {
      if (!visibleNodeIds.has(link.sourceNodeId) || !visibleNodeIds.has(link.targetNodeId)) {
        return false;
      }
      
      const start = getPortCoordinates(link.sourceNodeId, link.sourcePortId, true);
      const end = getPortCoordinates(link.targetNodeId, link.targetPortId, false);
      
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      
      return (
        maxX >= visibleBounds.xStart &&
        minX <= visibleBounds.xEnd &&
        maxY >= visibleBounds.yStart &&
        minY <= visibleBounds.yEnd
      );
    });
  }, [workspace.links, visibleBounds, nodesFilteredByCue, getPortCoordinates]);

  // Minimap dots: cap the rendered count so a large mod doesn't paint thousands of
  // DOM nodes on every pan/zoom. Always keep cues (structural anchors); sample the rest.
  const minimapNodes = React.useMemo(() => {
    const MAX = 500;
    if (nodesFilteredByCue.length <= MAX) return nodesFilteredByCue;
    const cues = nodesFilteredByCue.filter(n => n.type === 'cue');
    const others = nodesFilteredByCue.filter(n => n.type !== 'cue');
    const budget = Math.max(1, MAX - cues.length);
    const step = Math.max(1, Math.ceil(others.length / budget));
    const sampled = others.filter((_, i) => i % step === 0);
    return [...cues, ...sampled];
  }, [nodesFilteredByCue]);

  // Auto-Align Core Layout Math Algorithm (Tidy Graph Tool)
  const autoAlignGraph = () => {
    saveCheckpoint();
    
    const cues = workspace.nodes.filter(n => n.type === 'cue');
    const positionedIds = new Set<string>();
    const newNodes = [...workspace.nodes];

    // Find top level cues (no incoming links to 'in_flow')
    const topLevelCues = cues.filter(c => {
      return !workspace.links.some(l => l.targetNodeId === c.id && l.targetPortId === 'in_flow');
    });

    let currentY = 80;

    function layoutCue(cueId: string, depth: number): number {
      const idx = newNodes.findIndex(n => n.id === cueId);
      if (idx === -1 || positionedIds.has(cueId)) return 0;

      const x = 100 + depth * 1500;
      newNodes[idx] = { ...newNodes[idx], x, y: currentY };
      positionedIds.add(cueId);
      const cueY = currentY;

      // Position Conditions connected to out_cond (Column 2)
      const condLinks = workspace.links.filter(l => l.sourceNodeId === cueId && l.sourcePortId === 'out_cond');
      condLinks.forEach((link, cIdx) => {
        const condNodeIdx = newNodes.findIndex(n => n.id === link.targetNodeId);
        if (condNodeIdx !== -1 && !positionedIds.has(link.targetNodeId)) {
          newNodes[condNodeIdx] = {
            ...newNodes[condNodeIdx],
            x: x + 300,
            y: cueY + cIdx * 150
          };
          positionedIds.add(link.targetNodeId);
        }
      });

      // Position Actions connected to out_act (Column 3+)
      const actLinks = workspace.links.filter(l => l.sourceNodeId === cueId && l.sourcePortId === 'out_act');
      actLinks.forEach((firstLink) => {
        let actionNodeId = firstLink.targetNodeId;
        let actionIdx = 0;
        const seenActions = new Set<string>();
        
        while (actionNodeId && !seenActions.has(actionNodeId)) {
          seenActions.add(actionNodeId);
          const actNodeIdx = newNodes.findIndex(n => n.id === actionNodeId);
          if (actNodeIdx !== -1 && !positionedIds.has(actionNodeId)) {
            newNodes[actNodeIdx] = {
              ...newNodes[actNodeIdx],
              x: x + 600 + actionIdx * 300,
              y: cueY
            };
            positionedIds.add(actionNodeId);
          }
          
          const nextLink = workspace.links.find(l => l.sourceNodeId === actionNodeId && l.sourcePortId === 'out_next');
          actionNodeId = nextLink ? nextLink.targetNodeId : '';
          actionIdx++;
        }
      });

      // Find children cues connected via out_sub to in_flow
      const childLinks = workspace.links.filter(l => l.sourceNodeId === cueId && l.sourcePortId === 'out_sub');
      if (childLinks.length > 0) {
        childLinks.forEach((link, childIdx) => {
          if (childIdx > 0) {
            currentY += 450;
          }
          layoutCue(link.targetNodeId, depth + 1);
        });
      }
      return currentY;
    }

    topLevelCues.forEach((cue, idx) => {
      if (idx > 0) {
        currentY += 500;
      }
      layoutCue(cue.id, 0);
    });

    // Cluster unconnected floating elements at base
    let baseFloaterX = 80;
    let baseFloaterY = currentY + 300;
    newNodes.forEach((node) => {
      if (!positionedIds.has(node.id)) {
        node.x = baseFloaterX;
        node.y = baseFloaterY;
        baseFloaterX += 250;
        if (baseFloaterX > 1100) {
          baseFloaterX = 80;
          baseFloaterY += 220;
        }
      }
    });

    setWorkspace(prev => ({ ...prev, nodes: newNodes }));
  };

  // Launch Right-Click Spawn Context Menu Selection Handler with automatic link routing completion
  const handleQuickSpawn = (template: any) => {
    if (!contextMenu) return;
    saveCheckpoint();

    const newNode: MDNode = {
      ...template,
      id: `node_${Date.now()}`,
      x: contextMenu.gridX,
      y: contextMenu.gridY,
      properties: { ...template.properties }
    };

    if (pendingLinkTarget) {
      // Smart Auto-Linking completion math matching Unreal Engine 5 Blueprint drag-to-spawn behaviors
      const sourcePortId = pendingLinkTarget.portId;
      const isPendingSourceOutput = sourcePortId.startsWith('out') || sourcePortId === 'out_act' || sourcePortId === 'out_sub' || sourcePortId === 'out_next' || sourcePortId === 'out_cond';
      
      let matchedTargetPortId = '';
      if (isPendingSourceOutput) {
        // Pending was an output port. Find matching input on the spawned node (e.g., 'in_flow')
        const matchedPort = newNode.inputs.find(p => p.id === 'in_flow' || p.id.startsWith('in'));
        if (matchedPort) {
          matchedTargetPortId = matchedPort.id;
        }
      } else {
        // Pending was an input port. Find matching output on the spawned node (e.g., 'out_next')
        const matchedPort = newNode.outputs.find(p => p.id === 'out_next' || p.id.startsWith('out'));
        if (matchedPort) {
          matchedTargetPortId = matchedPort.id;
        }
      }

      if (matchedTargetPortId) {
        const newLink: MDLink = {
          id: `link_${Date.now()}`,
          sourceNodeId: isPendingSourceOutput ? pendingLinkTarget.nodeId : newNode.id,
          sourcePortId: isPendingSourceOutput ? pendingLinkTarget.portId : matchedTargetPortId,
          targetNodeId: isPendingSourceOutput ? newNode.id : pendingLinkTarget.nodeId,
          targetPortId: isPendingSourceOutput ? matchedTargetPortId : pendingLinkTarget.portId
        };
        
        setWorkspace(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
          links: [...prev.links, newLink]
        }));
      } else {
        setWorkspace(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode]
        }));
      }
      setPendingLinkTarget(null);
    } else {
      setWorkspace(prev => ({
        ...prev,
        nodes: [...prev.nodes, newNode]
      }));
    }

    setContextMenu(null);
    setSelectedNode(newNode);
  };

  // Run Stepped Visual Action Logic Evaluation Simulator
  const triggerLogicSimulator = (startNodeId?: string) => {
    if (simActive) {
      // Direct stop if clicked during simulation
      simTimersRef.current.forEach(t => clearTimeout(t));
      simTimersRef.current = [];
      setSimActive(false);
      setActiveNodes([]);
      setPulsingLinks([]);
      return;
    }

    setSimActive(true);
    setIsConsoleDockOpen(true);
    setActiveNodes([]);
    setPulsingLinks([]);
    setSimLogs([]);

    const log = (text: string, type: 'info' | 'success' | 'warn' | 'action' = 'info') => {
      const stamp = new Date().toLocaleTimeString().split(' ')[0];
      setSimLogs(prev => [...prev, { id: `log_${Date.now()}_${Math.random()}`, time: stamp, text, type }]);
    };

    log("⚡ INIT: Initializing visual script compiler loop context...", "info");

    const cues = workspace.nodes.filter(n => n.type === 'cue');
    const startCue = startNodeId ? cues.find(c => c.id === startNodeId) : null;
    const targetCues = startCue ? [startCue] : cues.filter(c => {
      return !workspace.links.some(l => l.targetNodeId === c.id && l.targetPortId === 'in_flow');
    });

    if (targetCues.length === 0) {
      log("🚫 DIAGNOSTIC FAILED: No executable cues present in workspace grid.", "warn");
      setSimActive(false);
      return;
    }

    let delayCounter = 400;
    const scheduleStep = (action: () => void, time: number) => {
      const timer = window.setTimeout(action, time);
      simTimersRef.current.push(timer);
    };

    function simulateCue(cue: MDNode, parentLink?: MDLink) {
      // 1. Evaluate Cue
      scheduleStep(() => {
        setActiveNodes(prev => [...prev, cue.id]);
        if (parentLink) {
          setPulsingLinks(prev => [...prev, parentLink.id]);
        }
        log(`📂 [CUE EVALUATE] Evaluating cue: "${cue.properties.name || cue.label || cue.id}"`, "info");
      }, delayCounter);
      delayCounter += 800;

      // 2. Evaluate conditions/events connected to out_cond
      const condLinks = workspace.links.filter(l => l.sourceNodeId === cue.id && l.sourcePortId === 'out_cond');
      if (condLinks.length > 0) {
        condLinks.forEach(link => {
          const condNode = workspace.nodes.find(n => n.id === link.targetNodeId);
          if (condNode) {
            scheduleStep(() => {
              setActiveNodes(prev => [...prev, condNode.id]);
              setPulsingLinks(prev => [...prev, link.id]);
              log(`⚙️ [CONDITIONS CHECK] Checking condition: <${condNode.xmlTag}>`, "info");
              Object.entries(condNode.properties).forEach(([k, v]) => {
                log(`  ${k}: ${v}`, "info");
              });
            }, delayCounter);
            delayCounter += 1000;
          }
        });

        scheduleStep(() => {
          log(`✔️ [CONDITIONS PASSED] All trigger conditions satisfied.`, "success");
        }, delayCounter);
        delayCounter += 600;
      } else {
        scheduleStep(() => {
          log(`⚠️ [NOTICE] Cue has no trigger condition locks. Flowing directly to actions.`, "success");
        }, delayCounter);
        delayCounter += 600;
      }

      // 3. Execute actions in chain connected to out_act
      const actLinks = workspace.links.filter(l => l.sourceNodeId === cue.id && l.sourcePortId === 'out_act');
      actLinks.forEach(firstLink => {
        let currentNode = workspace.nodes.find(n => n.id === firstLink.targetNodeId);
        let currentLink = firstLink;
        const seen = new Set<string>();

        while (currentNode && !seen.has(currentNode.id)) {
          seen.add(currentNode.id);
          
          const nodeToGlow = currentNode;
          const linkToGlow = currentLink;
          
          scheduleStep(() => {
             setActiveNodes(prev => [...prev, nodeToGlow.id]);
             setPulsingLinks(prev => [...prev, linkToGlow.id]);
             log(`🚀 [ACTION EXECUTE] Running action <${nodeToGlow.xmlTag}>`, "action");
             Object.entries(nodeToGlow.properties).forEach(([k, v]) => {
               log(`  ${k}: ${v}`, "action");
             });
          }, delayCounter);
          delayCounter += 1000;

          const nextLink = workspace.links.find(l => l.sourceNodeId === currentNode!.id && l.sourcePortId === 'out_next');
          if (nextLink) {
            currentLink = nextLink;
            currentNode = workspace.nodes.find(n => n.id === nextLink.targetNodeId);
          } else {
            currentNode = undefined;
          }
        }
      });

      // 4. Recursively simulate sub-cues
      const childLinks = workspace.links.filter(l => l.sourceNodeId === cue.id && l.sourcePortId === 'out_sub');
      childLinks.forEach(link => {
        const subCue = workspace.nodes.find(n => n.id === link.targetNodeId);
        if (subCue && subCue.type === 'cue') {
          simulateCue(subCue, link);
        }
      });
    }

    targetCues.forEach(cue => {
      simulateCue(cue);
    });

    scheduleStep(() => {
      log("🥇 SUCCESS: Virtual script evaluation successfully completed. 0 warnings, 0 crash errors.", "success");
      setSimActive(false);
      setActiveNodes([]);
      setPulsingLinks([]);
    }, delayCounter);
  };

  // Focus and Center Viewport camera onto a specific Selected Node, smoothly centering details pane
  const focusNode = React.useCallback((node: MDNode) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const targetZoom = 1;
    const newPanX = width / 2 - node.x * targetZoom;
    const newPanY = height / 2 - node.y * targetZoom;
    
    setZoom(targetZoom);
    setPanOffset({ x: newPanX, y: newPanY });
    setSelectedNode(node);
  }, [setSelectedNode]);

  // Trigger camera focus / fit when focusNodeRequest is updated from the Sidebar Tree
  useEffect(() => {
    if (focusNodeRequest) {
      const node = workspace.nodes.find(n => n.id === focusNodeRequest.nodeId);
      if (node) {
        focusNode(node);
      }
    }
  }, [focusNodeRequest, workspace.nodes, focusNode]);

  // Cue & Variable dependency analysis builder
  const dependencies = React.useMemo(() => {
    if (!selectedNode) return [];
    
    interface NodeDep {
      id: string;
      label: string;
      type: 'cue' | 'event' | 'condition' | 'action' | 'variable' | 'comment';
      direction: 'reliance' | 'required-by';
      reason: string;
      originalNode: MDNode;
    }

    const rels: NodeDep[] = [];
    const cueName = selectedNode.properties?.name || '';

    // 1. Structural links (MDLinks) directly connected to ports
    workspace.links.forEach(link => {
      // If selectedNode is the target, we require/rely on the source node
      if (link.targetNodeId === selectedNode.id) {
        const srcNode = workspace.nodes.find(n => n.id === link.sourceNodeId);
        if (srcNode) {
          rels.push({
            id: srcNode.id,
            label: srcNode.label,
            type: srcNode.type,
            direction: 'reliance',
            reason: `Linked from "${srcNode.label}" (${link.sourcePortId} → ${link.targetPortId})`,
            originalNode: srcNode
          });
        }
      }

      // If selectedNode is the source, the target node requires us
      if (link.sourceNodeId === selectedNode.id) {
        const tgtNode = workspace.nodes.find(n => n.id === link.targetNodeId);
        if (tgtNode) {
          rels.push({
            id: tgtNode.id,
            label: tgtNode.label,
            type: tgtNode.type,
            direction: 'required-by',
            reason: `Triggers "${tgtNode.label}" (${link.sourcePortId} → ${link.targetPortId})`,
            originalNode: tgtNode
          });
        }
      }
    });

    // 2. Logical / Text based property references in workspace
    const otherNodes = workspace.nodes.filter(n => n.id !== selectedNode.id);
    otherNodes.forEach(other => {
      const otherName = other.properties?.name || other.properties?.value || other.label;
      if (otherName && typeof otherName === 'string') {
        const refsOther = Object.entries(selectedNode.properties).some(([k, v]) => 
          typeof v === 'string' && (v === otherName || v.includes(otherName))
        );
        if (refsOther) {
          rels.push({
            id: other.id,
            label: other.label,
            type: other.type,
            direction: 'reliance',
            reason: other.type === 'variable' ? `Reads variable "${otherName}"` : `References cue "${otherName}" in settings`,
            originalNode: other
          });
        }
      }

      if (cueName && typeof cueName === 'string') {
        const otherRefsUs = Object.entries(other.properties).some(([k, v]) => 
          typeof v === 'string' && (v === cueName || v.includes(cueName))
        );
        if (otherRefsUs) {
          rels.push({
            id: other.id,
            label: other.label,
            type: other.type,
            direction: 'required-by',
            reason: `Node "${other.label}" refers to this cue`,
            originalNode: other
          });
        }
      }
    });

    // De-duplicate by id + direction
    const seen = new Set<string>();
    const uniqueRels: NodeDep[] = [];
    rels.forEach(item => {
      const key = `${item.id}_${item.direction}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRels.push(item);
      }
    });

    return uniqueRels;
  }, [selectedNode, workspace.nodes, workspace.links]);

  // Visual Diagnostic Compilation checker
  const diagnostics = React.useMemo(() => {
    const list: { id: string; nodeId?: string; type: 'error' | 'warning' | 'info'; message: string }[] = [];
    
    const cues = workspace.nodes.filter(n => n.type === 'cue');
    if (cues.length === 0) {
      list.push({
        id: 'no_cues',
        type: 'error',
        message: 'No cue entry points found in this script.'
      });
    }
    
    workspace.nodes.forEach(node => {
      if (node.type === 'comment') return;
      
      // 1. Orphan Checks
      if (node.type !== 'cue') {
        const hasInputs = node.inputs && node.inputs.length > 0;
        if (hasInputs) {
          const isLinked = workspace.links.some(l => l.targetNodeId === node.id);
          if (!isLinked) {
            list.push({
              id: `orphan_${node.id}`,
              nodeId: node.id,
              type: 'warning',
              message: `Orphan Node: "${node.label}" is unconnected and will never execute.`
            });
          }
        }
      }
      
      // 2. Empty properties
      if (node.type === 'cue' && !node.properties.name) {
        list.push({
          id: `empty_cue_name_${node.id}`,
          nodeId: node.id,
          type: 'error',
          message: `Required Fields: Cue "${node.label}" is missing a unique 'name' identification attribute.`
        });
      }
      
      if (node.xmlTag === 'wait' && (!node.properties.exact && !node.properties.min)) {
        list.push({
          id: `wait_dur_${node.id}`,
          nodeId: node.id,
          type: 'warning',
          message: `Variable Lock: Wait action "${node.label}" has no wait duration (exact/min) specified.`
        });
      }
    });

    return list;
  }, [workspace.nodes, workspace.links]);

  // Schema-driven per-node diagnostics (md.xsd, no AI) — fetched so the canvas can show
  // an in-your-face badge on the exact offending node instead of burying it in the Doctor.
  const [schemaNodeDiags, setSchemaNodeDiags] = useState<Record<string, { severity: 'error' | 'warning'; messages: string[] }>>({});
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const tok = (window as any).__STUDIO_API_TOKEN__;
        const res = await fetch('/api/agent/node-diagnostics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
          body: JSON.stringify({ nodes: workspace.nodes }),
        });
        const data = await res.json();
        setSchemaNodeDiags(data && data.byNode ? data.byNode : {});
      } catch { /* offline / no schema — leave as-is */ }
    }, 400);
    return () => clearTimeout(t);
  }, [workspace.nodes]);

  // Merge client heuristics + schema diagnostics into one per-node severity/message map.
  const nodeDiagMap = React.useMemo(() => {
    const m: Record<string, { severity: 'error' | 'warning'; messages: string[] }> = {};
    const add = (nodeId: string, severity: 'error' | 'warning', message: string) => {
      const cur = m[nodeId] || { severity: 'warning' as 'error' | 'warning', messages: [] };
      cur.messages.push(message);
      if (severity === 'error') cur.severity = 'error';
      m[nodeId] = cur;
    };
    for (const d of diagnostics) {
      if (!d.nodeId || d.type === 'info') continue;
      add(d.nodeId, d.type === 'error' ? 'error' : 'warning', d.message);
    }
    for (const [nodeId, v] of Object.entries(schemaNodeDiags)) {
      for (const msg of v.messages) add(nodeId, v.severity, msg);
    }
    return m;
  }, [diagnostics, schemaNodeDiags]);

  // Selective node alignment/distribution (UE5-style) over the multi-selection.
  const applyAlignment = React.useCallback((mode: AlignMode) => {
    const ids = selectedNodeIds || [];
    if (ids.length < 2) return;
    // Measure REAL node dimensions from the DOM (cards vary in height) and convert
    // screen px → canvas coords by dividing out the current zoom, so dimension-based
    // alignment (right/bottom/center) is exact rather than using a fixed default.
    const measure = (id: string): { width?: number; height?: number } => {
      const el = document.querySelector(`[data-node-id="${id}"]`);
      if (!el) return {};
      const r = el.getBoundingClientRect();
      const z = zoom || 1;
      return { width: r.width / z, height: r.height / z };
    };
    const moves = computeAlignment(
      workspace.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, ...measure(n.id) })),
      ids, mode
    );
    if (Object.keys(moves).length === 0) return;
    saveCheckpoint();
    setWorkspace(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => moves[n.id] ? { ...n, x: moves[n.id].x, y: moves[n.id].y } : n)
    }));
  }, [selectedNodeIds, workspace.nodes, saveCheckpoint, setWorkspace, zoom]);

  // Add Comment Box bounding group, matching Unreal Engine box boundaries
  const addCommentBox = React.useCallback(() => {
    saveCheckpoint();
    
    let x = -panOffset.x / zoom + 250;
    let y = -panOffset.y / zoom + 180;
    let width = 450;
    let height = 300;
    let label = "Comment Group";
    const color = "rgba(6, 182, 212, 0.04)";
    
    if (selectedNode) {
      x = selectedNode.x - 30;
      y = selectedNode.y - 45;
      width = 300;
      height = 240;
      label = `Logic Group ${selectedNode.label}`;
    }
    
    const newCommentNode: MDNode = {
      id: `node_${Date.now()}`,
      type: 'comment',
      label,
      xmlTag: 'comment',
      x: Math.round(x / 10) * 10,
      y: Math.round(y / 10) * 10,
      width,
      height,
      color,
      properties: {},
      propertiesSchema: [],
      inputs: [],
      outputs: []
    };

    setWorkspace(prev => ({
      ...prev,
      nodes: [...prev.nodes, newCommentNode]
    }));
  }, [selectedNode, panOffset, zoom, saveCheckpoint, setWorkspace]);

  // Listen to visual keyboard shortcuts (such as 'C' for Comment, or 'Ctrl+F' to search blueprints)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).contentEditable === 'true')) {
        return;
      }

      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        addCommentBox();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [addCommentBox]);

  const allTemplates = React.useMemo(() => {
    const byTag = new Map<string, Omit<MDNode, 'id' | 'x' | 'y'>>();
    NODE_TEMPLATES.forEach(template => byTag.set(template.xmlTag, template));
    schemaTemplates.forEach(template => {
      if (!byTag.has(template.xmlTag)) byTag.set(template.xmlTag, template);
    });
    return Array.from(byTag.values());
  }, [schemaTemplates]);

  // Filter right click context spawn options
  const filteredTemplates = allTemplates.filter(
    t => t.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
         t.xmlTag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dynamic Minimap calculation helpers
  const xs = nodesFilteredByCue.map(n => n.x);
  const ys = nodesFilteredByCue.map(n => n.y);
  const minX = xs.length ? Math.min(...xs) - 80 : 0;
  const maxX = xs.length ? Math.max(...xs) + 260 : 600;
  const minY = ys.length ? Math.min(...ys) - 80 : 0;
  const maxY = ys.length ? Math.max(...ys) + 160 : 400;
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  return (
    <div className="flex-1 bg-[#07090d] relative overflow-hidden flex flex-col h-full select-none" onContextMenu={handleCanvasContextMenu}>
      
      {/* Canvas Top Controls Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-[#0f131a]/95 border border-cyan-500/20 p-2 rounded-lg shadow-2xl glass-effect">
        <button
          onClick={() => setZoom(prev => Math.min(prev + 0.1, 1.4))}
          title="Zoom In (Scroll Up)"
          className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-all cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.6))}
          title="Zoom Out (Scroll Down)"
          className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-all cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
          title="Reset Graph Zoom"
          className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-cyan-400 text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          100%
        </button>
        
        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Comment Box Group (icon-only — compact) */}
        <button
          onClick={addCommentBox}
          title="Group selected nodes inside a Comment Box (Shortcut: C)"
          className="p-1.5 rounded bg-purple-950/20 hover:bg-purple-900/30 border border-purple-500/20 text-purple-400 hover:text-white transition-all flex items-center cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Find in Blueprints Search Bar toggle */}
        <button
          onClick={() => setSearchOpen(prev => !prev)}
          title="Search All Nodes by label, tag, or field properties (Shortcut: Ctrl+F)"
          className={`p-1.5 px-2.5 rounded border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            searchOpen 
              ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400' 
              : 'bg-slate-900 hover:bg-slate-800 border-white/10 text-slate-300'
          }`}
        >
          <Search className="w-3.5 h-3.5 font-bold" />
          FIND
        </button>

        {/* Compile / Diagnostic checks badge */}
        <button
          onClick={() => setDiagnosticPanelOpen(prev => !prev)}
          className={`p-1.5 px-2.5 rounded text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
            diagnostics.some(d => d.type === 'error')
              ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15'
              : diagnostics.some(d => d.type === 'warning')
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15'
          }`}
          title="Check blueprint syntax and logic connections for warnings or isolated states"
        >
          {diagnostics.some(d => d.type === 'error') ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : diagnostics.some(d => d.type === 'warning') ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span>COMPILER: {
            diagnostics.some(d => d.type === 'error')
              ? "ERRORS"
              : diagnostics.some(d => d.type === 'warning')
              ? "WARN"
              : "OK"
          }</span>
        </button>
        
        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Tidy Graph Optimizer (icon-only — compact) */}
        <button
          onClick={autoAlignGraph}
          title="Tidy graph — auto-align node layout"
          className="p-1.5 rounded bg-cyan-950/20 hover:bg-cyan-900/30 border border-cyan-500/20 text-cyan-400 hover:text-white transition-all flex items-center cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        {/* AAA Feature 2: Stepped logic Flow Simulator */}
        <button
          onClick={() => triggerLogicSimulator()}
          className={`p-1.5 px-2.5 rounded border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
            simActive 
              ? 'bg-red-500/10 border-red-500/40 text-red-400' 
              : 'bg-emerald-950/20 hover:bg-emerald-900/30 border-emerald-500/20 text-emerald-400 hover:text-white'
          }`}
          title={simActive ? "Halt Visual Stimulation Flow" : "Boot Interactive XML Step Testing Simulator"}
        >
          {simActive ? (
            <>
              <Square className="w-3.5 h-3.5 fill-red-400 shrink-0" />
              STOP SIM
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-emerald-400 shrink-0" />
              PLAY SIMULATION
            </>
          )}
        </button>

        <button
          onClick={() => setIsConsoleDockOpen(prev => !prev)}
          title="Toggle Simulation Terminal dock"
          className={`p-1.5 rounded hover:bg-white/5 transition-all relative cursor-pointer ${isConsoleDockOpen ? 'text-amber-400' : 'text-slate-400'}`}
        >
          <TerminalIcon className="w-4 h-4" />
          {simLogs.length > 0 && (
            <span className="absolute -top-1.5 -right-1 px-1 py-0.5 rounded-full bg-amber-500 text-[8px] leading-none font-bold text-black border border-black">
              {simLogs.length}
            </span>
          )}
        </button>
        
        <div className="h-5 w-px bg-white/10 mx-1" />

        <button
          onClick={clearLinks}
          title="Clear all wires/links"
          className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all flex items-center cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-5 w-px bg-white/10 mx-1" />

        <button
          onClick={() => setDepPanelOpen(prev => !prev)}
          title="Deps trace — toggle dependency analyzer panel"
          className={`p-1.5 rounded flex items-center transition-all border cursor-pointer ${
            depPanelOpen
              ? 'bg-violet-500/15 border-violet-500/35 text-violet-400'
              : 'bg-slate-900 border-white/10 text-slate-350 hover:bg-slate-800'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selective node ALIGNMENT toolbar — appears when 2+ nodes are selected (UE5-style). */}
      {(selectedNodeIds?.length || 0) >= 2 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-[#0c0e14]/95 border border-cyan-500/25 rounded-lg px-1.5 py-1 shadow-2xl backdrop-blur-sm animate-fade-in">
          <span className="text-[8px] font-mono uppercase tracking-wider text-cyan-400/80 px-1.5 select-none">align {selectedNodeIds.length}</span>
          <span className="h-4 w-px bg-white/10 mx-0.5" />
          {([
            { mode: 'left', Icon: AlignStartVertical, title: 'Align left edges' },
            { mode: 'hcenter', Icon: AlignCenterVertical, title: 'Align horizontal centers' },
            { mode: 'right', Icon: AlignEndVertical, title: 'Align right edges' },
            { mode: 'top', Icon: AlignStartHorizontal, title: 'Align top edges' },
            { mode: 'vcenter', Icon: AlignCenterHorizontal, title: 'Align vertical centers' },
            { mode: 'bottom', Icon: AlignEndHorizontal, title: 'Align bottom edges' },
          ] as const).map(({ mode, Icon, title }) => (
            <button
              key={mode}
              onClick={() => applyAlignment(mode as AlignMode)}
              title={title}
              className="p-1.5 rounded hover:bg-cyan-500/15 text-slate-400 hover:text-cyan-300 transition-all cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <span className="h-4 w-px bg-white/10 mx-0.5" />
          <button
            onClick={() => applyAlignment('distribute-h')}
            disabled={selectedNodeIds.length < 3}
            title="Distribute horizontally (needs 3+)"
            className="p-1.5 rounded hover:bg-cyan-500/15 text-slate-400 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyAlignment('distribute-v')}
            disabled={selectedNodeIds.length < 3}
            title="Distribute vertically (needs 3+)"
            className="p-1.5 rounded hover:bg-cyan-500/15 text-slate-400 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <AlignVerticalDistributeCenter className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Visual Linking indicator notification banner */}
      { linking && (
        <div className="absolute top-4 right-4 z-10 font-mono text-[10px] uppercase bg-cyan-950/70 text-cyan-400 px-3 py-1.5 rounded-lg border border-cyan-500/30 animate-pulse flex items-center gap-2 shadow-2xl glass-effect">
          <Link2 className="w-3.5 h-3.5 animate-spin" />
          <span>Linking Terminals: Select output-to-input connection destination...</span>
          <button onClick={() => setLinking(null)} className="ml-2 hover:bg-white/10 p-0.5 rounded text-slate-400 hover:text-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Main Draggable Workspace Grid Canvas Area */}
      <div
        id="grid-canvas"
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={e => e.preventDefault()}
        onDrop={handleCanvasDrop}
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing outline-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(6, 182, 212, 0.15) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${panOffset.x}px ${panOffset.y}px`
        }}
      >
        <div
          className="absolute origin-top-left flex"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transition: panning ? 'none' : 'transform 0.05s ease-out'
          }}
        >
          
          {/* SVG Connector Paths */}
          <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="wire-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="glow-wave" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Wire Links Render loop */}
            {visibleLinks.map(link => {
              const start = getPortCoordinates(link.sourceNodeId, link.sourcePortId, true);
              const end = getPortCoordinates(link.targetNodeId, link.targetPortId, false);

              const dx = Math.abs(end.x - start.x) * 0.52;
              const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
              
              const isPulsing = pulsingLinks.includes(link.id);

              return (
                <g key={link.id} className="group pointer-events-auto">
                  {/* Thick Invisible path helper to ease click detections */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      saveCheckpoint();
                      setWorkspace(prev => ({
                        ...prev,
                        links: prev.links.filter(l => l.id !== link.id)
                      }));
                    }}
                  >
                    <title>Click cable directly to snip link</title>
                  </path>

                  {/* Colored vector line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isPulsing ? "url(#glow-wave)" : "url(#wire-gradient)"}
                    strokeWidth={isPulsing ? "3" : "2.5"}
                    className={`${
                      isPulsing 
                        ? 'animate-wire-flow stroke-cyan-400' 
                        : 'group-hover:stroke-red-400 group-hover:stroke-2 transition-all duration-150'
                    }`}
                  />
                  <circle cx={start.x} cy={start.y} r={isPulsing ? "5" : "3.5"} fill={isPulsing ? "#38bdf8" : "#06b6d4"} />
                  <circle cx={end.x} cy={end.y} r={isPulsing ? "5" : "3.5"} fill={isPulsing ? "#10b981" : "#10b981"} />
                </g>
              );
            })}

            {/* Unreal Engine style: live cable visual dragging tracker */}
            {linking && (
              (() => {
                const start = getPortCoordinates(linking.nodeId, linking.portId, true);
                const end = mousePos;
                const dx = Math.abs(end.x - start.x) * 0.52;
                const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
                return (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    className="pointer-events-none animate-pulse opacity-85"
                  />
                );
              })()
            )}
          </svg>

          {/* Sorted node list (comment boxes rendered first to reside in background) */}
          {[...visibleNodes]
            .sort((a, b) => {
              if (a.type === 'comment' && b.type !== 'comment') return -1;
              if (a.type !== 'comment' && b.type === 'comment') return 1;
              return 0;
            })
            .map(node => {
              if (node.type === 'comment') {
                const isSelected = selectedNode?.id === node.id;
                const width = node.width || 400;
                const height = node.height || 300;
                const commentBg = node.color || 'rgba(6, 182, 212, 0.04)';
                
                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    style={{ 
                      left: node.x, 
                      top: node.y,
                      width: width,
                      height: height,
                      backgroundColor: commentBg
                    }}
                    className={`absolute rounded-xl border border-dashed border-white/20 text-slate-300 font-mono shadow-md select-none group flex flex-col pointer-events-auto transition-shadow ${
                      isSelected ? 'ring-2 ring-cyan-500/70 border-cyan-400/80 scale-[1.002] z-10' : 'hover:border-white/35 z-0'
                    }`}
                  >
                    {/* Comment Header bar */}
                    <div 
                      className="w-full p-2 bg-white/[0.03] border-b border-white/[0.05] rounded-t-xl flex items-center justify-between cursor-grab active:cursor-grabbing font-bold text-xs"
                      style={{ color: node.color ? '#e2e8f0' : '#22d3ee' }}
                      onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <input
                          type="text"
                          value={node.label}
                          onChange={(e) => {
                            setWorkspace(prev => ({
                              ...prev,
                              nodes: prev.nodes.map(n => n.id === node.id ? { ...n, label: e.target.value } : n)
                            }));
                          }}
                          className="bg-transparent border-none text-slate-200 focus:bg-black/55 px-1.5 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 max-w-[280px] font-semibold"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Double-click to edit group label"
                        />
                      </div>
                      
                      <div className="flex items-center gap-2" onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {['rgba(6, 182, 212, 0.04)', 'rgba(168, 85, 247, 0.04)', 'rgba(234, 179, 8, 0.04)', 'rgba(34, 197, 94, 0.04)'].map((col, idx) => {
                            const borderCol = col.replace('0.04', '0.4');
                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  saveCheckpoint();
                                  setWorkspace(prev => ({
                                    ...prev,
                                    nodes: prev.nodes.map(n => n.id === node.id ? { ...n, color: col } : n)
                                  }));
                                }}
                                style={{ backgroundColor: col, borderColor: borderCol }}
                                className="w-2.5 h-2.5 rounded-full border cursor-pointer hover:scale-110 transition-transform"
                              />
                            );
                          })}
                        </div>
                        <button
                          onClick={(e) => deleteNode(node.id, e)}
                          className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 cursor-pointer"
                          title="Delete Comment Box"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 pointer-events-none relative" />
                    
                    {/* Resize handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizingComment({
                          id: node.id,
                          startWidth: width,
                          startHeight: height,
                          clientX: e.clientX,
                          clientY: e.clientY
                        });
                      }}
                      className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-center justify-center text-slate-500 hover:text-cyan-400 select-none font-bold select-none text-[11px]"
                      title="Drag to Resize Box"
                    >
                      ◢
                    </div>
                  </div>
                );
              }

              const isSelected = selectedNode?.id === node.id || (node.type === 'cue' && selectedCueIds.includes(node.id)) || selectedNodeIds.includes(node.id);
              const isGlowActive = activeNodes.includes(node.id);
              const nodeDiag = nodeDiagMap[node.id];

              let borderClasses = 'border-cyan-500/20 bg-[#0c1017]/95 backdrop-blur-sm';
              let headingClasses = 'bg-white/[0.02] text-slate-200 border-white/[0.03]';

              if (node.type === 'cue') {
                borderClasses = 'border-purple-500/20 bg-[#0f1118]/95 backdrop-blur-sm';
                headingClasses = 'bg-white/[0.02] text-slate-200 border-white/[0.03]';
              } else if (node.type === 'event') {
                borderClasses = 'border-amber-500/20 bg-[#121114]/95 backdrop-blur-sm';
                headingClasses = 'bg-white/[0.02] text-slate-200 border-white/[0.03]';
              } else if (node.type === 'condition') {
                borderClasses = 'border-cyan-500/20 bg-[#0c1017]/95 backdrop-blur-sm';
                headingClasses = 'bg-white/[0.02] text-slate-200 border-white/[0.03]';
              } else if (node.type === 'action') {
                borderClasses = 'border-emerald-500/20 bg-[#0c1310]/95 backdrop-blur-sm';
                headingClasses = 'bg-white/[0.02] text-slate-200 border-white/[0.03]';
              }

              const isLowDetail = zoom < 0.45;

              // Shared Yellow Sticky Annotation render fragment helper
              const stickyAnnotation = node.comment && (
                <div 
                  style={{ 
                    position: 'absolute',
                    left: node.x + 248, // Adjacent to the w-60 (240px) visual node card
                    top: node.y,
                    width: '190px',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  className="bg-amber-400/[0.12] hover:bg-amber-400/[0.22] border border-amber-400/40 text-amber-200 p-2.5 rounded-lg shadow-2xl font-sans text-[10px] leading-relaxed z-20 transition-all flex flex-col gap-1.5 backdrop-blur-md cursor-default text-left select-text"
                >
                  <div className="flex items-center justify-between border-b border-amber-400/20 pb-1 mb-0.5 select-none font-bold uppercase tracking-wider text-[8px] text-amber-400 font-mono">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                      Sticky Note
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const text = window.prompt(`Edit Sticky Note Annotation for "${node.label}":`, node.comment);
                          if (text !== null) {
                            saveCheckpoint();
                            setWorkspace(prev => ({
                              ...prev,
                              nodes: prev.nodes.map(n => n.id === node.id ? { ...n, comment: text } : n)
                            }));
                            if (selectedNode && selectedNode.id === node.id) {
                              setSelectedNode({ ...selectedNode, comment: text });
                            }
                          }
                        }}
                        className="text-[8.5px] text-yellow-300 hover:text-white"
                      >
                        Edit
                      </button>
                      <span className="text-amber-400/30 font-sans select-none">•</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          saveCheckpoint();
                          setWorkspace(prev => ({
                            ...prev,
                            nodes: prev.nodes.map(n => n.id === node.id ? { ...n, comment: '' } : n)
                          }));
                          if (selectedNode && selectedNode.id === node.id) {
                            setSelectedNode({ ...selectedNode, comment: '' });
                          }
                        }}
                        className="text-red-400 hover:text-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed italic text-slate-300 select-text font-serif text-[10px]">{node.comment}</p>
                </div>
              );

              if (isLowDetail) {
                return (
                  <React.Fragment key={node.id}>
                    <div
                      data-node-id={node.id}
                      data-node-type={node.type}
                      data-node-label={node.label}
                      onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                      style={{ left: node.x, top: node.y }}
                      className={`absolute w-60 h-24 rounded-lg border flex flex-col justify-between font-mono text-[11px] p-2.5 select-none shadow-2xl transition-all duration-150 ${borderClasses} ${
                        isSelected ? 'ring-2 ring-cyan-500/70 border-cyan-500/50 scale-[1.015] z-10' : 'hover:border-white/20'
                      } ${isGlowActive ? 'animate-node-glow-active border-cyan-400 z-30 scale-[1.03]' : ''}`}
                    >
                      <div className="flex-1 flex items-center justify-center text-center">
                        <span className="font-bold text-[12px] truncate w-48 text-slate-100">
                          {node.label}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-500 text-center uppercase tracking-wider font-bold border-t border-white/[0.04] pt-1">
                        {node.type.toUpperCase()}: &lt;{node.xmlTag}&gt;
                      </div>
                    </div>
                    {stickyAnnotation}
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={node.id}>
                  <div
                    data-node-id={node.id}
                    data-node-type={node.type}
                    data-node-label={node.label}
                    onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    style={{ left: node.x, top: node.y }}
                    className={`absolute w-60 rounded-lg border flex flex-col font-mono text-[11px] shadow-2xl transition-all duration-150 ${borderClasses} ${
                      isSelected ? 'ring-2 ring-cyan-500/70 border-cyan-500/50 scale-[1.015]' : 'hover:border-white/20'
                    } ${isGlowActive ? 'animate-node-glow-active border-cyan-400 z-30 scale-[1.03]' : ''} ${
                      nodeDiag ? (nodeDiag.severity === 'error'
                        ? 'ring-2 ring-red-500/90 !border-red-500/70 shadow-[0_0_22px_rgba(239,68,68,0.55)] z-20'
                        : 'ring-2 ring-amber-400/90 !border-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.45)] z-20') : ''
                    }`}
                  >
                    {/* In-your-face schema diagnostic badge — floats on the node corner. */}
                    {nodeDiag && (
                      <div
                        title={nodeDiag.messages.join('\n')}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`absolute -top-2.5 -right-2.5 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full text-[8.5px] font-bold font-mono uppercase shadow-lg cursor-help select-none ${
                          nodeDiag.severity === 'error' ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-400 text-black'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {nodeDiag.messages.length > 1 ? nodeDiag.messages.length : ''}
                      </div>
                    )}

                    {/* Top-accent Gradient Line */}
                    <div className={`h-[3px] rounded-t-lg w-full bg-gradient-to-r ${
                      node.type === 'cue' 
                        ? 'from-purple-500 to-fuchsia-500' 
                        : node.type === 'event' 
                        ? 'from-amber-500 to-orange-500' 
                        : node.type === 'condition' 
                        ? 'from-cyan-500 to-blue-500' 
                        : 'from-emerald-500 to-teal-500'
                    }`} />

                    {/* Visual node title & close handle button */}
                    <div className="p-2 flex items-center justify-between border-b border-white/[0.04] cursor-grab active:cursor-grabbing bg-white/[0.01]">
                      <div className="flex items-center gap-1.5 truncate">
                        {simActive && isGlowActive && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block shrink-0" />
                        )}
                        {node.type === 'cue' && <Compass className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                        {node.type === 'event' && <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 shrink-0" />}
                        {node.type === 'condition' && <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        {node.type === 'action' && <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20 shrink-0" />}
                        <span className="font-semibold text-[11px] tracking-tight truncate w-32 text-slate-100">{node.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Sticky Note Toggle Icon */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const existingComment = node.comment || '';
                            const text = window.prompt(`Attach Yellow Sticky Note to "${node.label}" script step:`, existingComment);
                            if (text !== null) {
                              saveCheckpoint();
                              setWorkspace(prev => ({
                                ...prev,
                                nodes: prev.nodes.map(n => n.id === node.id ? { ...n, comment: text } : n)
                              }));
                              if (selectedNode && selectedNode.id === node.id) {
                                setSelectedNode({ ...selectedNode, comment: text });
                              }
                            }
                          }}
                          title="Attach sticky-note annotation"
                          className={`p-1 rounded transition-colors duration-100 cursor-pointer ${
                            node.comment 
                              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                              : 'hover:bg-yellow-400/10 text-slate-400 hover:text-yellow-400'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        {node.type === 'event' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerLogicSimulator(node.id); }}
                            title="Simulate Event from this step specifically"
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-all cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5 fill-emerald-400/20" />
                          </button>
                        )}
                        <button
                          onClick={(e) => deleteNode(node.id, e)}
                          title="Delete Node"
                          className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Properties Inspector Preview */}
                    <div className="p-2 bg-[#090b0f] text-slate-400 space-y-1 select-none border-b border-white/[0.04] font-mono text-[9px] rounded-md m-1.5">
                      {Object.entries(node.properties).slice(0, 3).map(([key, val]) => (
                        <div key={key} className="flex justify-between leading-normal">
                          <span className="text-slate-500 text-[9px] uppercase font-bold tracking-wider">{key}:</span>
                          <span className="text-slate-300 truncate max-w-[130px] text-right font-medium" title={String(val)}>
                            {String(val)}
                          </span>
                        </div>
                      ))}
                      {Object.keys(node.properties).length === 0 && (
                        <div className="text-slate-650 italic text-[9px] text-center">No properties configured</div>
                      )}
                    </div>

                    {/* Ports list row layouts */}
                    <div className="p-2 space-y-1.5 bg-black/10 rounded-b-lg">
                      {/* Event Inputs/Condition locks list */}
                      {(node.inputs || []).map((port) => (
                        <div key={port.id} className="flex items-center gap-2">
                           <button
                            onClick={(e) => handlePortClick(node.id, port, e)}
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                              linking?.nodeId === node.id && linking?.portId === port.id 
                                ? 'bg-cyan-400 border-white ring-2 ring-cyan-500' 
                                : 'bg-[#10b981]/15 hover:bg-[#10b981]/50 border-[#10b981]/40'
                            }`}
                            title={`Connector terminal: ${port.name}`}
                          />
                          <span className="text-[9.5px] text-slate-450 uppercase font-bold tracking-wider">{port.name}</span>
                        </div>
                      ))}

                      {/* Command outputs target lists */}
                      {(node.outputs || []).map((port) => (
                        <div key={port.id} className="flex items-center justify-end gap-2 text-right w-full">
                          <span className="text-[9.5px] text-slate-450 uppercase font-bold tracking-wider">{port.name}</span>
                          <button
                            onClick={(e) => handlePortClick(node.id, port, e)}
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                              linking?.nodeId === node.id && linking?.portId === port.id 
                                ? 'bg-cyan-400 border-white ring-2 ring-cyan-500' 
                                : 'bg-cyan-500/15 hover:bg-cyan-500/50 border-cyan-500/40'
                            }`}
                            title={`Connector terminal: ${port.name}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {stickyAnnotation}
                </React.Fragment>
              );
            })}
        </div>
      </div>

      {/* AAA Feature 3: Unreal Engine-Style Searchable Context Menu Spawn Drawer on Canvas Right Click */}
      {contextMenu && (
        <div
          className="absolute z-50 w-72 bg-[#121620]/95 border border-cyan-500/30 rounded-xl shadow-2xl p-3 select-none flex flex-col gap-2 font-mono text-xs glass-effect text-slate-300 animate-terminal-line max-h-96"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5 bg-[#171d2b]/60 -m-3 p-3 rounded-t-xl mb-1 shrink-0">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              CREATE NODE HERE
            </span>
            <button
              onClick={() => setContextMenu(null)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search box search query filters node blueprints instantly */}
          <div className="relative shrink-0 pt-1">
            <Search className="absolute left-2.5 top-3.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              placeholder="Search egosoft logic parameters..."
              className="w-full bg-[#07090e] border border-white/10 rounded-lg px-2.5 py-1.5 pl-8 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Search elements viewport lists */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar max-h-56 mt-1">
            {filteredTemplates.length > 0 ? (
              filteredTemplates.map((item, idx) => {
                let badgeStyle = 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25';
                if (item.type === 'cue') badgeStyle = 'bg-purple-500/10 text-purple-400 border border-purple-500/25';
                else if (item.type === 'event') badgeStyle = 'bg-amber-500/10 text-amber-400 border border-amber-500/25';
                else if (item.type === 'action') badgeStyle = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';

                return (
                  <button
                    key={`${item.xmlTag}_${idx}`}
                    onClick={() => handleQuickSpawn(item)}
                    className="w-full text-left p-1.5 rounded hover:bg-cyan-500/10 flex items-center justify-between text-[11px] group transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col truncate pr-1">
                      <span className="text-white font-bold group-hover:text-cyan-400 transition-colors truncate">{item.label}</span>
                      <span className="text-[9px] text-slate-500 font-sans truncate">&lt;{item.xmlTag}&gt;</span>
                    </div>
                    <span className={`text-[8px] font-bold p-0.5 px-1 truncate rounded scale-90 ${badgeStyle}`}>
                      {item.type.toUpperCase()}
                    </span>
                  </button>
                );
              })
            ) : (
              <span className="text-slate-500 text-[10px] text-center block py-4 bg-black/10 rounded-lg">No matching script node found</span>
            )}
          </div>
          <div className="text-[9px] text-slate-500 border-t border-white/5 pt-1.5 text-center leading-normal">
            Coords: x:{contextMenu.gridX} y:{contextMenu.gridY}
          </div>
        </div>
      )}

      {/* AAA Feature 4: Sliding Script Simulator Logs HUD Terminal overlay */}
      {isConsoleDockOpen && (
        <div className="absolute bottom-4 right-4 z-40 w-96 bg-[#080b0f] border border-[#f59e0b]/30 rounded-xl shadow-2xl flex flex-col font-mono text-[10px] text-amber-200/90 animate-terminal-line h-60 max-h-80 overflow-hidden">
          
          {/* Header Panel */}
          <div className="bg-[#10151c] border-b border-[#f59e0b]/15 p-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <TerminalIcon className="w-3.5 h-3.5 text-[#f59e0b] animate-pulse" />
              <span className="font-bold text-slate-200">TACTICAL LOG MONITOR</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSimLogs([])}
                className="hover:text-white text-slate-500 text-[9px] px-1.5 py-0.5 bg-black/40 rounded hover:bg-black/60 border border-white/5 transition-colors cursor-pointer"
              >
                CLEAR LOGS
              </button>
              <button
                onClick={() => setIsConsoleDockOpen(false)}
                className="hover:bg-white/5 p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Lines scrolling window */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar bg-[#05070a] select-text">
            {simLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 italic py-10 font-sans text-center px-4 leading-normal">
                <Globe className="w-7 h-7 text-slate-700 mb-2 animate-spin-slow" />
                No simulation log metrics reported. Click 'PLAY SIMULATION' above or right click an event cue trigger to compile and test sequence.
              </div>
            ) : (
              simLogs.map((log) => {
                let colorClass = 'text-amber-200/80';
                if (log.type === 'success') colorClass = 'text-emerald-400 font-bold';
                else if (log.type === 'warn') colorClass = 'text-red-400 font-bold';
                else if (log.type === 'action') colorClass = 'text-cyan-400';

                return (
                  <div key={log.id} className="leading-relaxed border-b border-white/[0.02] pb-1 flex items-start gap-1.5 text-left animate-terminal-line">
                    <span className="text-slate-500 select-none font-sans mt-0.5">{log.time}</span>
                    <span className={colorClass}>{log.text}</span>
                  </div>
                );
              })
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>
      )}

      {/* AAA Feature 5: Floating Mini Radar Layout Minimap card */}
      <div className="absolute bottom-4 left-4 z-40 bg-[#0c1017]/95 border border-cyan-500/25 p-2 rounded-xl shadow-2xl glass-effect flex flex-col gap-1 select-none">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1 border-b border-white/5 pb-1 font-mono">
          <Compass className="w-3 h-3 text-cyan-400 animate-spin-slow" />
          RADAR MINIMAP
        </span>
        <div className="relative w-36 h-24 bg-[#05070a] rounded-lg border border-white/5 overflow-hidden">
          {minimapNodes.map(node => {
            // Transform coordinates down to scale perfectly within radar dimension boundaries (144px width, 96px height)
            const nodeX = rangeX > 1 ? ((node.x - minX) / rangeX) * 120 + 8 : 10;
            const nodeY = rangeY > 1 ? ((node.y - minY) / rangeY) * 80 + 8 : 10;
            
            let colorDot = 'bg-cyan-500';
            if (node.type === 'cue') colorDot = 'bg-purple-500 ring-2 ring-purple-500/40';
            else if (node.type === 'event') colorDot = 'bg-amber-500';
            else if (node.type === 'action') colorDot = 'bg-emerald-500';

            const isCurrentSelected = selectedNode?.id === node.id;

            return (
              <div
                key={`mini_${node.id}`}
                style={{ left: nodeX, top: nodeY }}
                className={`absolute w-1.5 h-1.5 rounded-full transition-transform ${colorDot} ${
                  isCurrentSelected ? 'scale-150 ring-2 ring-white animate-pulse' : ''
                }`}
                title={node.label}
              />
            );
          })}

          {/* Drawing pan offset aspect range box inside minimap */}
          <div 
            className="absolute border border-cyan-500/30 bg-cyan-500/5 rounded pointer-events-none"
            style={{
              left: Math.max(0, Math.min(100, -panOffset.x / 14)),
              top: Math.max(0, Math.min(60, -panOffset.y / 14)),
              width: Math.max(30, 110 / zoom),
              height: Math.max(20, 70 / zoom)
            }}
          />
        </div>
        <p className="text-[8px] text-slate-500 font-sans text-center mt-0.5">Double click canvas to Spawn node</p>
      </div>

      {/* AAA Feature 6: Find in Blueprints Floating Search HUD Panel */}
      {searchOpen && (
        <div className="absolute top-20 left-4 z-50 w-80 bg-[#0c111a]/95 border border-cyan-500/30 rounded-xl shadow-2xl p-4 flex flex-col gap-3 font-mono text-xs text-slate-300 animate-terminal-line max-h-96">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
              <Search className="w-3.5 h-3.5 text-cyan-400" />
              Find in Blueprints
            </span>
            <button
              onClick={() => setSearchOpen(false)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchNodesQuery}
              onChange={(e) => setSearchNodesQuery(e.target.value)}
              placeholder="Search labels, tags, property keys..."
              className="w-full bg-[#05070a] border border-white/10 rounded-lg px-2.5 py-1.5 pl-8 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1 max-h-56">
            {(() => {
              const matches = workspace.nodes.filter(n => {
                if (n.type === 'comment') return false;
                const matchesLabel = n.label.toLowerCase().includes(searchNodesQuery.toLowerCase());
                const matchesTag = n.xmlTag.toLowerCase().includes(searchNodesQuery.toLowerCase());
                const matchesProperties = Object.values(n.properties).some(val => 
                  String(val).toLowerCase().includes(searchNodesQuery.toLowerCase())
                );
                return matchesLabel || matchesTag || matchesProperties;
              });

              if (!searchNodesQuery) {
                return <span className="text-[10px] text-slate-500 italic block text-center py-4">Type a query to scan graph elements...</span>;
              }

              if (matches.length === 0) {
                return <span className="text-[10px] text-slate-500 block text-center py-4 bg-black/10 rounded-lg">No nodes fit the query matches</span>;
              }

              return matches.map(node => {
                let nodeAccentColor = 'text-cyan-400';
                if (node.type === 'cue') nodeAccentColor = 'text-purple-400';
                else if (node.type === 'event') nodeAccentColor = 'text-amber-400';
                else if (node.type === 'action') nodeAccentColor = 'text-emerald-400';

                return (
                  <button
                    key={`search_res_${node.id}`}
                    onClick={() => focusNode(node)}
                    className="w-full text-left p-2 rounded bg-white/[0.02] hover:bg-cyan-500/10 border border-white/[0.03] hover:border-cyan-500/20 flex flex-col gap-1 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 truncate">{node.label}</span>
                      <span className={`text-[8px] font-semibold truncate ${nodeAccentColor}`}>
                        &lt;{node.xmlTag}&gt;
                      </span>
                    </div>
                    {Object.keys(node.properties).length > 0 && (
                      <div className="text-[9px] text-slate-500 font-sans truncate">
                        Properties: {Object.entries(node.properties).map(([k, v]) => `${k}="${v}"`).join(', ')}
                      </div>
                    )}
                  </button>
                );
              });
            })()}
          </div>
          <span className="text-[9px] text-slate-500 italic leading-snug">Click any matched node to pan-teleport camera directly onto it.</span>
        </div>
      )}

      {/* AAA Feature 7: Compiler Diagnostics Warnings Overlay Panel */}
      {diagnosticPanelOpen && (
        <div className="absolute top-20 right-4 z-50 w-80 bg-[#0c111a]/95 border border-cyan-500/30 rounded-xl shadow-2xl p-4 flex flex-col gap-3 font-mono text-xs text-slate-300 animate-terminal-line max-h-96 w-[320px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              Compiler Diagnostics
            </span>
            <button
              onClick={() => setDiagnosticPanelOpen(false)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1 max-h-64">
            {diagnostics.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6 bg-emerald-500/5 rounded-lg border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-6 h-6 mb-1.5 animate-pulse" />
                <span className="font-bold uppercase text-[10px]">ALL LOGS GOCLEAN</span>
                <span className="text-[9px] text-slate-400 mt-0.5">0 errors, 0 logic warnings</span>
              </div>
            ) : (
              diagnostics.map((diag) => {
                let boxStyle = 'bg-amber-500/5 border-amber-500/20 text-amber-300';
                let iconColor = 'text-amber-400';
                if (diag.type === 'error') {
                  boxStyle = 'bg-red-500/5 border-red-500/20 text-red-300';
                  iconColor = 'text-red-400';
                }

                const targetNode = diag.nodeId ? workspace.nodes.find(n => n.id === diag.nodeId) : undefined;

                return (
                  <div
                    key={diag.id}
                    className={`p-2 rounded border flex flex-col gap-1.5 leading-relaxed text-left text-[10px] ${boxStyle}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className={`w-3.5 h-3.5 ${iconColor} shrink-0 mt-0.5`} />
                      <span className="flex-1 font-semibold">{diag.message}</span>
                    </div>
                    {targetNode && (
                      <button
                        onClick={() => focusNode(targetNode)}
                        className="text-[9px] self-end px-2 py-0.5 bg-white/5 hover:border-cyan-500/30 rounded border border-white/10 text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-all cursor-pointer"
                      >
                        PAN TO TERMINAL
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <span className="text-[9px] text-slate-500 text-center leading-snug">Evaluates connected script graphs real-time to prevent broken XML references in X4 Foundations load processes.</span>
        </div>
      )}

      {/* Dynamic Cue & Variable Dependency Graph overlay panel */}
      {depPanelOpen && (
        <div className="absolute top-[340px] right-4 z-40 w-80 bg-[#0e121b]/95 border border-violet-500/30 rounded-xl shadow-2xl p-4 flex flex-col gap-3 font-mono text-xs text-slate-350 animate-terminal-line max-h-[380px] w-[320px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
              <MessageSquare className="w-4 h-4 text-violet-400 shrink-0" />
              Dependency Graph
            </span>
            <button
              onClick={() => setDepPanelOpen(false)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
            {selectedNode ? (
              <>
                {/* Header highlighting selected cue name with visual frame */}
                <div className="p-2 border border-violet-500/25 bg-violet-950/20 rounded-lg text-center shadow-lg relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500" />
                  <span className="text-[9px] uppercase font-bold text-violet-400 block tracking-widest leading-none mb-1">SELECTED ROOT</span>
                  <span className="text-white font-bold block truncate text-center">{selectedNode.label}</span>
                  <span className="text-[9.5px] text-slate-500 font-mono mt-0.5 block">&lt;{selectedNode.xmlTag}&gt;</span>
                </div>

                {/* RELIES ON SECTION (PREDECESSORS) */}
                <div>
                  <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-wider block mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    RELIES ON (DATA / INBOUNDS)
                  </span>
                  {dependencies.filter(d => d.direction === 'reliance').length === 0 ? (
                    <span className="text-[10px] text-slate-500 italic block pl-1.5 border-l border-white/5 py-1">
                      No inbound dependencies detected.
                    </span>
                  ) : (
                    <div className="space-y-1.5 pl-1.5 border-l border-white/5">
                      {dependencies
                        .filter(d => d.direction === 'reliance')
                        .map(dep => {
                          let typeColors = 'border-purple-500/40 text-purple-300 bg-purple-950/10';
                          if (dep.type === 'variable') typeColors = 'border-cyan-500/40 text-cyan-300 bg-cyan-950/10';
                          else if (dep.type === 'event') typeColors = 'border-amber-500/40 text-amber-300 bg-amber-950/10';
                          else if (dep.type === 'action') typeColors = 'border-emerald-500/40 text-emerald-300 bg-emerald-950/10';

                          return (
                            <button
                              key={`dep_in_${dep.id}`}
                              onClick={() => focusNode(dep.originalNode)}
                              className={`w-full text-left p-1.5 rounded border ${typeColors} hover:border-cyan-400 hover:bg-cyan-500/5 transition-all text-[10px] font-mono flex items-start gap-1 justify-between group cursor-pointer`}
                              title="Click to zoom focus onto this dependency connection node"
                            >
                              <div className="flex-1 min-w-0 pr-1.5">
                                <span className="font-bold block truncate">{dep.label}</span>
                                <span className="text-[8px] text-slate-450 leading-none block truncate mt-0.5 italic">{dep.reason}</span>
                              </div>
                              <span className="text-[8px] uppercase tracking-wider font-semibold border border-white/10 px-1 py-0.5 rounded shrink-0 self-center text-slate-400 select-none group-hover:text-cyan-300 group-hover:border-cyan-400/30">
                                PAN ↑
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* REQUIRED BY SECTION (CONSUMERS) */}
                <div>
                  <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider block mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    REQUIRED BY (OUTBOUNDS)
                  </span>
                  {dependencies.filter(d => d.direction === 'required-by').length === 0 ? (
                    <span className="text-[10px] text-slate-500 italic block pl-1.5 border-l border-white/5 py-1">
                      No outbound dependencies detected.
                    </span>
                  ) : (
                    <div className="space-y-1.5 pl-1.5 border-l border-white/5">
                      {dependencies
                        .filter(d => d.direction === 'required-by')
                        .map(dep => {
                          let typeColors = 'border-purple-500/40 text-purple-300 bg-purple-950/10';
                          if (dep.type === 'variable') typeColors = 'border-cyan-500/40 text-cyan-300 bg-cyan-950/10';
                          else if (dep.type === 'event') typeColors = 'border-amber-500/40 text-amber-300 bg-amber-950/10';
                          else if (dep.type === 'action') typeColors = 'border-emerald-500/40 text-emerald-300 bg-emerald-950/10';

                          return (
                            <button
                              key={`dep_out_${dep.id}`}
                              onClick={() => focusNode(dep.originalNode)}
                              className={`w-full text-left p-1.5 rounded border ${typeColors} hover:border-cyan-400 hover:bg-cyan-500/5 transition-all text-[10px] font-mono flex items-start gap-1 justify-between group cursor-pointer`}
                              title="Click to zoom focus onto this consumer node"
                            >
                              <div className="flex-1 min-w-0 pr-1.5">
                                <span className="font-bold block truncate">{dep.label}</span>
                                <span className="text-[8px] text-slate-450 leading-none block truncate mt-0.5 italic">{dep.reason}</span>
                              </div>
                              <span className="text-[8px] uppercase tracking-wider font-semibold border border-white/10 px-1 py-0.5 rounded shrink-0 self-center text-slate-400 select-none group-hover:text-cyan-300 group-hover:border-cyan-400/30">
                                PAN ↑
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 leading-normal font-sans border border-slate-850 bg-black/30 rounded-lg">
                <MessageSquare className="w-8 h-8 text-slate-700 mb-2 animate-pulse" />
                <span className="font-bold uppercase text-[10px] text-slate-500 tracking-wider">No active node selected</span>
                <span className="text-[9px] text-slate-550 mt-1.5 leading-normal italic">
                  Select any visual script cue or variable node on your canvas to instantly map out the flow-dependencies diagram!
                </span>
              </div>
            )}
          </div>
          <span className="text-[8px] text-slate-550 text-center leading-normal">
            Traces linkages, custom variables, inbounds/outbounds, and properties schemas automatically.
          </span>
        </div>
      )}

    </div>
  );
}
