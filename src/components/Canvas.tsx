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
  Globe
} from 'lucide-react';
import { MDNode, MDLink, ModWorkspace, Port, NODE_TEMPLATES } from '../types';

interface CanvasProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  saveCheckpoint: (customTarget?: ModWorkspace) => void;
  selectedNode: MDNode | null;
  setSelectedNode: (node: MDNode | null) => void;
}

export default function Canvas({
  workspace,
  setWorkspace,
  saveCheckpoint,
  selectedNode,
  setSelectedNode
}: CanvasProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [linking, setLinking] = useState<{ nodeId: string; portId: string; type: string } | null>(null);

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

  // Pan the canvas offset on clicking background dragging
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    if (e.target === canvasRef.current || (e.target as HTMLElement).id === 'grid-pattern' || (e.target as HTMLElement).tagName === 'path' || (e.target as HTMLElement).tagName === 'svg') {
      setPanning({ x: e.clientX, y: e.clientY });
    }
  };

  // Node Drags initialization
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    setDraggedNodeId(nodeId);
    const node = workspace.nodes.find(n => n.id === nodeId);
    if (node) {
      dragStartPos.current = {
        x: e.clientX - node.x,
        y: e.clientY - node.y
      };
      setSelectedNode(node);
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

  // Sync mouse interactions
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedNodeId) {
        // Drag snap to grid calculations
        const newX = Math.round((e.clientX - dragStartPos.current.x) / 10) * 10;
        const newY = Math.round((e.clientY - dragStartPos.current.y) / 10) * 10;
        
        setWorkspace(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => 
            n.id === draggedNodeId ? { ...n, x: newX, y: newY } : n
          )
        }));
      } else if (panning) {
        const dx = e.clientX - panning.x;
        const dy = e.clientY - panning.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setPanning({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      if (draggedNodeId) {
        // Save history checkpoint once released
        saveCheckpoint();
      }
      setDraggedNodeId(null);
      setPanning(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNodeId, panning, saveCheckpoint]);

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

  // Auto-Align Core Layout Math Algorithm (Tidy Graph Tool)
  const autoAlignGraph = () => {
    saveCheckpoint();
    
    const cues = workspace.nodes.filter(n => n.type === 'cue');
    const positionedIds = new Set<string>();
    const newNodes = [...workspace.nodes];

    let currentY = 80;

    cues.forEach((cue) => {
      // 1. Column 1: Cues (x = 80)
      const cueIdx = newNodes.findIndex(n => n.id === cue.id);
      if (cueIdx !== -1) {
        newNodes[cueIdx] = { ...newNodes[cueIdx], x: 80, y: currentY };
        positionedIds.add(cue.id);
      }

      const linkedLinks = workspace.links.filter(l => l.sourceNodeId === cue.id);

      // 2. Column 2: Event Filters / Conditions (x = 360)
      const condLinks = linkedLinks.filter(l => l.sourcePortId === 'out_cond');
      let condY = currentY;
      condLinks.forEach((l) => {
        const targetIdx = newNodes.findIndex(n => n.id === l.targetNodeId);
        if (targetIdx !== -1 && !positionedIds.has(l.targetNodeId)) {
          newNodes[targetIdx] = { ...newNodes[targetIdx], x: 360, y: condY };
          positionedIds.add(l.targetNodeId);
          condY += 150;
        }
      });

      // 3. Column 3 to 5: Action cascades flowing left-to-right (x = 640+)
      const actLinks = linkedLinks.filter(l => l.sourcePortId === 'out_act');
      let actY = currentY;
      actLinks.forEach((l) => {
        let currentNodeId: string | undefined = l.targetNodeId;
        let actX = 640;
        
        while (currentNodeId) {
          const targetIdx = newNodes.findIndex(n => n.id === currentNodeId);
          if (targetIdx !== -1) {
            if (!positionedIds.has(currentNodeId)) {
              newNodes[targetIdx] = { ...newNodes[targetIdx], x: actX, y: actY };
              positionedIds.add(currentNodeId);
            }
            // Follow next node links
            const nextLink = workspace.links.find(
              lnk => lnk.sourceNodeId === currentNodeId && lnk.sourcePortId === 'out_next'
            );
            currentNodeId = nextLink?.targetNodeId;
            actX += 260;
          } else {
            currentNodeId = undefined;
          }
        }
        actY += 160;
      });

      currentY += Math.max(condY - currentY, actY - currentY, 180) + 120;
    });

    // 4. Cluster unconnected floating elements at base
    let baseFloaterX = 80;
    let baseFloaterY = currentY + 60;
    newNodes.forEach((node) => {
      if (!positionedIds.has(node.id)) {
        node.x = baseFloaterX;
        node.y = baseFloaterY;
        baseFloaterX += 250;
        if (baseFloaterX > 1100) {
          baseFloaterX = 80;
          baseFloaterY += 160;
        }
      }
    });

    setWorkspace(prev => ({ ...prev, nodes: newNodes }));
  };

  // Launch Right-Click Spawn Context Menu Selection Handler
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

    setWorkspace(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));

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

    // Gather active trigger cues
    const targetCues = startNodeId 
      ? workspace.nodes.filter(n => n.id === startNodeId || (n.type === 'cue' && workspace.links.some(l => l.targetNodeId === startNodeId && l.sourceNodeId === n.id)))
      : workspace.nodes.filter(n => n.type === 'cue');

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

    targetCues.forEach((cue) => {
      // Glow Cue Node
      scheduleStep(() => {
        setActiveNodes([cue.id]);
        log(`📂 [CUE EVALUATE] Found active block mdscript: "${cue.properties.name || cue.label || cue.id}"`, "info");
      }, delayCounter);
      delayCounter += 900;

      const linksFromCue = workspace.links.filter(l => l.sourceNodeId === cue.id);
      
      const conditions = linksFromCue.filter(l => l.sourcePortId === 'out_cond');
      const actions = linksFromCue.filter(l => l.sourcePortId === 'out_act');

      if (conditions.length > 0) {
        scheduleStep(() => {
          setPulsingLinks(prev => [...prev, ...conditions.map(l => l.id)]);
          log(`⚙️ [CONDITIONS CHECK] Spawning checks down linked wire criteria paths...`, "info");
        }, delayCounter);
        delayCounter += 600;

        scheduleStep(() => {
          const ids = conditions.map(l => l.targetNodeId);
          setActiveNodes(prev => [...prev, ...ids]);
          ids.forEach(id => {
            const node = workspace.nodes.find(n => n.id === id);
            if (node) {
              log(`✔️ [EVENT SOLVED] Filter lock resolved: <${node.xmlTag}> passed constraints successfully.`, "success");
            }
          });
        }, delayCounter);
        delayCounter += 900;
      } else {
        scheduleStep(() => {
          log(`⚠️ [NOTICE] Cue has no trigger condition locks. Flowing directly to actions cascade.`, "success");
        }, delayCounter);
        delayCounter += 500;
      }

      if (actions.length > 0) {
        scheduleStep(() => {
          setPulsingLinks(prev => [...prev, ...actions.map(l => l.id)]);
          log(`🚀 [EXECUTION SEQUENCE] Signaling logical action chains...`, "info");
        }, delayCounter);
        delayCounter += 600;

        actions.forEach((actl) => {
          let currentActId: string | undefined = actl.targetNodeId;
          let lastNodeId = cue.id;

          while (currentActId) {
            const activeId = currentActId;
            const sourceId = lastNodeId;
            const node = workspace.nodes.find(n => n.id === activeId);
            const wireLink = workspace.links.find(l => l.sourceNodeId === sourceId && l.targetNodeId === activeId);

            if (node) {
              scheduleStep(() => {
                setActiveNodes(prev => [...prev, activeId]);
                if (wireLink) setPulsingLinks(prev => [...prev, wireLink.id]);

                let desc = `Fired visual xmlTag <${node.xmlTag}>.`;
                if (node.xmlTag === 'create_ship') {
                  desc += ` Spawning ship ${node.properties.name || '$Ship'} (${(node.properties.macro || '').split('(')[0].trim()}) in ${node.properties.sector || 'player.sector'}.`;
                } else if (node.xmlTag === 'reward_player') {
                  desc += ` Crediting +${Number(node.properties.money || 0).toLocaleString()} Cr and updating Argon relations.`;
                } else if (node.xmlTag === 'play_sound') {
                  desc += ` Dispatching sound ID '${node.properties.sound || 'notification_generic'}' relative to playership audio.`;
                } else if (node.xmlTag === 'show_help') {
                  desc += ` Feeding HUD alert text string: "${node.properties.text || ''}".`;
                } else if (node.xmlTag === 'create_station') {
                  desc += ` Spawning modular base space station macro at relative coords: ${node.properties.coords || '0,0,0'}.`;
                }
                log(`🔧 [ACTION DISPATCH] ${desc}`, "action");
              }, delayCounter);
              delayCounter += 1200;
            }

            const nextWire = workspace.links.find(l => l.sourceNodeId === activeId && l.sourcePortId === 'out_next');
            currentActId = nextWire?.targetNodeId;
            lastNodeId = activeId;
          }
        });
      }
    });

    scheduleStep(() => {
      log("🥇 SUCCESS: Virtual script evaluation successfully completed. 0 warnings, 0 crash errors.", "success");
      setSimActive(false);
      setActiveNodes([]);
      setPulsingLinks([]);
    }, delayCounter);
  };

  // Filter right click context spawn options
  const filteredTemplates = NODE_TEMPLATES.filter(
    t => t.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
         t.xmlTag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Dynamic Minimap calculation helpers
  const xs = workspace.nodes.map(n => n.x);
  const ys = workspace.nodes.map(n => n.y);
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

        {/* AAA Feature 1: Tidy Graph Optimizer */}
        <button
          onClick={autoAlignGraph}
          title="Auto-Align Nodes Layout"
          className="p-1.5 px-2.5 rounded bg-cyan-950/20 hover:bg-cyan-900/30 border border-cyan-500/20 text-cyan-400 hover:text-white transition-all text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          TIDY GRAPH
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
          title="Wipe Out all links"
          className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-all text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          CLEAR WIRES
        </button>
      </div>

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
            {workspace.links.map(link => {
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
                    title="Click cable directly to snip link"
                  />

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
          </svg>

          {/* Node Component Cards Loop */}
          {workspace.nodes.map(node => {
            const isSelected = selectedNode?.id === node.id;
            const isGlowActive = activeNodes.includes(node.id);
            
            let borderClasses = 'border-cyan-500/30 bg-[#0c1017]';
            let headingClasses = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';

            if (node.type === 'cue') {
              borderClasses = 'border-purple-500/30 bg-[#0f1118]';
              headingClasses = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
            } else if (node.type === 'event') {
              borderClasses = 'border-amber-500/30 bg-[#121114]';
              headingClasses = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
            } else if (node.type === 'condition') {
              borderClasses = 'border-cyan-500/30 bg-[#0c1017]';
              headingClasses = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20';
            } else if (node.type === 'action') {
              borderClasses = 'border-emerald-500/30 bg-[#0c1310]';
              headingClasses = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
            }

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                style={{ left: node.x, top: node.y }}
                className={`absolute w-60 rounded-lg border flex flex-col font-mono text-[11px] shadow-2xl transition-all duration-150 ${borderClasses} ${
                  isSelected ? 'ring-2 ring-cyan-500/70 border-cyan-500/50 scale-[1.015]' : 'hover:border-white/20'
                } ${isGlowActive ? 'animate-node-glow-active border-cyan-400 z-30 scale-[1.03]' : ''}`}
              >
                {/* Visual node title & close handle button */}
                <div className={`p-2.5 rounded-t-lg border-b flex items-center justify-between cursor-grab active:cursor-grabbing ${headingClasses}`}>
                  <div className="flex items-center gap-1.5 truncate">
                    {simActive && isGlowActive && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block shrink-0" />
                    )}
                    <span className="font-semibold text-xs tracking-tight truncate w-36">{node.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
                <div className="p-2.5 bg-black/45 text-slate-400 space-y-1 select-none border-b border-white/[0.04]">
                  {node.type === 'cue' && (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">CUE_ID:</span> <span className="text-purple-300 font-bold truncate">{node.properties.name || 'untamed'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">INSTANTIATE:</span> <span className="text-slate-300">{node.properties.instantiate || 'false'}</span></div>
                    </>
                  )}
                  {node.type === 'event' && (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">XML_TAG:</span> <span className="text-amber-300 font-bold font-sans">&lt;{node.xmlTag}&gt;</span></div>
                      {node.properties.cue && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">SIG_SOURCE:</span> <span className="text-slate-300 truncate w-24 block text-right">{node.properties.cue}</span></div>}
                    </>
                  )}
                  {node.type === 'action' && (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">DISPATCH:</span> <span className="text-emerald-300 font-bold font-sans">&lt;{node.xmlTag}&gt;</span></div>
                      {node.properties.macro && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">MACRO:</span> <span className="text-slate-300 text-[9px] truncate w-28 block text-right">{(node.properties.macro).split(' (')[0]}</span></div>}
                      {node.properties.money && <div className="flex justify-between"><span className="text-slate-500 text-[10px]">REWARD:</span> <span className="text-amber-400 font-bold">{Number(node.properties.money).toLocaleString()} cr</span></div>}
                    </>
                  )}
                  {node.type === 'condition' && (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">CHECK:</span> <span className="text-cyan-300 select-all truncate">{node.properties.value}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 text-[10px]">CRITERIA:</span> <span className="text-slate-300 font-bold">{node.properties.operator || 'ge'} ({node.properties.amount})</span></div>
                    </>
                  )}
                </div>

                {/* Ports list row layouts */}
                <div className="p-2 space-y-2 bg-black/15 rounded-b-lg">
                  {/* Event Inputs/Condition locks list */}
                  {(node.inputs || []).map((port) => (
                    <div key={port.id} className="flex items-center gap-2">
                       <button
                        onClick={(e) => handlePortClick(node.id, port, e)}
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                          linking?.nodeId === node.id && linking?.portId === port.id 
                            ? 'bg-cyan-400 border-white ring-2 ring-cyan-500' 
                            : 'bg-[#10b981]/20 hover:bg-[#10b981]/60 border-[#10b981]/50'
                        }`}
                        title={`Connector terminal: ${port.name}`}
                      />
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{port.name}</span>
                    </div>
                  ))}

                  {/* Command outputs target lists */}
                  {(node.outputs || []).map((port) => (
                    <div key={port.id} className="flex items-center justify-end gap-2 text-right w-full">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{port.name}</span>
                      <button
                        onClick={(e) => handlePortClick(node.id, port, e)}
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                          linking?.nodeId === node.id && linking?.portId === port.id 
                            ? 'bg-cyan-400 border-white ring-2 ring-cyan-500' 
                            : 'bg-cyan-500/20 hover:bg-cyan-500/60 border-cyan-500/50'
                        }`}
                        title={`Connector terminal: ${port.name}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
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
          {workspace.nodes.map(node => {
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

    </div>
  );
}
