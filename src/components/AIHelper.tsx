/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  X, 
  RefreshCw, 
  Cpu, 
  Check, 
  Copy, 
  ChevronRight 
} from 'lucide-react';
import { getAIHeaders, handleApiResponse } from '../lib/apiHelper';
import { ModWorkspace, validateModWorkspace, generateMDXML } from '../types';

interface AIHelperProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  localVersion: number;
  setLocalVersion: (v: number) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  actionRequired?: boolean;
  proposedWorkspace?: ModWorkspace;
  proposedVersion?: number;
  actionApplied?: 'applied' | 'declined' | null;
}

export default function AIHelper({ workspace, setWorkspace, localVersion, setLocalVersion }: AIHelperProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [activeMode, setActiveMode] = useState<'chat' | 'builder'>('chat');
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { 
      role: 'assistant', 
      text: "Hello, Captain! I am your visual X4: Foundations Mission Director digital copilot. Press '💬 ASSISTANT CHAT' for advice, or '🛠️ BUILDER ACTION PORT' to describe modifications and generate them on-the-fly." 
    }
  ]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Quick prompt suggestions
  const SUGGESTIONS = {
    chat: [
      { title: "Define a Sector-Entry Alert", prompt: "Write an X4 MD Cue block that listens for the player entering sector 'player.sector', showing a custom scrolling dialogue banner and playing an alert sound." },
      { title: "Register a Custom UI Table", prompt: "Explain how to hook up custom XML UI menu buttons to signal MD script cues to deliver a ship in X4 Foundations." }
    ],
    builder: [
      { title: "Design High-Yield Trading post", prompt: "Produce an X4 mod visual workspace consisting of 4 interconnected trade exchange nodes with high-importance layout parameters." },
      { title: "Construct Xenon Incursion Mission", prompt: "Generate a custom sector-entry threat logic chain featuring Xenon fighter wing spawns and threat level diagnostics." }
    ]
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSendChatMode = async (promptMsg: string) => {
    // Add user message to history
    setChatHistory(prev => [...prev, { role: 'user', text: promptMsg }]);
    setLoading(true);
    setInputText('');

    try {
      const currentCode = generateMDXML(workspace);
      const diagnostics = validateModWorkspace(workspace, currentCode);

      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: getAIHeaders(),
        body: JSON.stringify({ 
          prompt: promptMsg,
          currentWorkspace: workspace,
          diagnostics: diagnostics
        })
      });

      const data = await handleApiResponse(response, "Failed to establish connection.");

      setChatHistory(prev => [...prev, { role: 'assistant', text: data.text }]);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Listen to open-ai-chat events triggered by Wiki Browser or nodes clicks
  React.useEffect(() => {
    const handleOpenChatEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      if (customEvent.detail && customEvent.detail.prompt) {
        setIsOpen(true);
        setActiveMode('chat');
        handleSendChatMode(customEvent.detail.prompt);
      }
    };
    window.addEventListener('open-ai-chat', handleOpenChatEvent);
    return () => {
      window.removeEventListener('open-ai-chat', handleOpenChatEvent);
    };
  }, [workspace]);

  const handleSendBuilderMode = async (promptMsg: string) => {
    // Add user message to history
    setChatHistory(prev => [...prev, { role: 'user', text: `Generate workspace blueprint: ${promptMsg}` }]);
    setLoading(true);
    setInputText('');

    try {
      const currentCode = generateMDXML(workspace);
      const diagnostics = validateModWorkspace(workspace, currentCode);

      const response = await fetch("/api/agent/generate", {
        method: "POST",
        headers: getAIHeaders(),
        body: JSON.stringify({ 
          prompt: promptMsg,
          currentWorkspace: workspace,
          diagnostics: diagnostics
        })
      });

      const data = await handleApiResponse(response, "Failed to trigger visual automated generator.");

      const generatedWorkspace: ModWorkspace = data.workspace;
      const proposedText = `I have successfully designed a new Visual Mod Workspace layout named "${generatedWorkspace.name}". It contains ${generatedWorkspace.nodes.length} functional nodes, ${generatedWorkspace.links.length} connected flow paths, and ${generatedWorkspace.uiWidgets.length} interactive dashboard widgets.\n\nPlease inspect the blueprint audit report card below to confirm and apply these visual changes directly to your active stage!`;
      
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        text: proposedText,
        actionRequired: true,
        proposedWorkspace: generatedWorkspace,
        proposedVersion: data.version,
        actionApplied: null
      }]);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Something went wrong during generation simulation.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAction = (index: number, msg: ChatMessage) => {
    if (!msg.proposedWorkspace) return;
    setWorkspace(msg.proposedWorkspace);
    if (msg.proposedVersion !== undefined) {
      setLocalVersion(msg.proposedVersion);
    }
    
    // Update message status
    setChatHistory(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          actionRequired: false,
          actionApplied: 'applied',
          text: `Success! Proposed automated node scheme "${msg.proposedWorkspace?.name}" has been compiled and injected successfully into your visual canvas. Try navigating or adjusting the physical nodes now!`
        };
      }
      return updated;
    });
  };

  const handleDeclineAction = (index: number) => {
    setChatHistory(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          actionRequired: false,
          actionApplied: 'declined',
          text: `Action declined. Proposed visual modifications were successfully discarded. Feel free to re-submit your prompt with different parameters!`
        };
      }
      return updated;
    });
  };

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    setErrorText(null);
    if (activeMode === 'builder') {
      handleSendBuilderMode(text);
    } else {
      handleSendChatMode(text);
    }
  };

  // Custom dragging state & handlers to allow moving the widget out of the way of the log panel or canvas nodes
  const [position, setPosition] = useState(() => {
    const initialY = 140;
    const initialX = typeof window !== 'undefined' ? window.innerWidth - 580 : 700;
    return { x: initialX, y: initialY };
  });

  const isDraggingRef = React.useRef(false);
  const hasDraggedRef = React.useRef(false);
  const startCoordsRef = React.useRef({ x: 0, y: 0 });
  const startPosRef = React.useRef({ x: 0, y: 0 });

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      if (e.button !== 0) return; // Only left-click
      const target = e.target as HTMLElement;
      if (target.closest('.drag-handle-only')) {
        return; // ignore drag if close button is clicked
      }
      clientX = e.clientX;
      clientY = e.clientY;
    }

    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    startCoordsRef.current = { x: clientX, y: clientY };
    startPosRef.current = { x: position.x, y: position.y };

    const handleDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      
      let moveX = 0;
      let moveY = 0;
      if ('touches' in moveEvent) {
        if (moveEvent.touches.length === 0) return;
        moveX = moveEvent.touches[0].clientX;
        moveY = moveEvent.touches[0].clientY;
      } else {
        moveX = moveEvent.clientX;
        moveY = moveEvent.clientY;
      }

      const dx = moveX - startCoordsRef.current.x;
      const dy = moveY - startCoordsRef.current.y;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasDraggedRef.current = true;
      }

      const nextX = startPosRef.current.x + dx;
      const nextY = startPosRef.current.y + dy;

      // Clamp inside the viewport boundaries roughly so it cannot go fully offscreen
      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 80;
      const clampedX = Math.max(10, Math.min(nextX, maxX));
      const clampedY = Math.max(10, Math.min(nextY, maxY));

      setPosition({ x: clampedX, y: clampedY });
    };

    const handleDragEnd = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  };

  const currentSuggestions = activeMode === 'chat' ? SUGGESTIONS.chat : SUGGESTIONS.builder;

  return (
    <div 
      className="fixed z-40 flex flex-col items-end select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {/* Expanded AI Guide Drawer panel */}
      {isOpen ? (
        <div className="w-[390px] h-[540px] bg-[#0c0f16] border border-[#df9825]/40 rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono text-xs text-slate-300">
          
          {/* Assist Header */}
          <div 
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="bg-[#df9825]/10 border-b border-[#df9825]/20 p-3.5 flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing select-none"
            title="Drag from header to move guide window"
          >
            <div className="flex items-center gap-1.5 font-bold text-[#df9825] pointer-events-none">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>X4 INTELLIGENT AI GUIDE</span>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer drag-handle-only"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex border-b border-white/5 bg-black/35 font-mono text-[9px] shrink-0">
            <button
              type="button"
              onClick={() => setActiveMode('chat')}
              className={`flex-1 py-1.5 text-center border-r border-white/5 font-semibold transition-all cursor-pointer ${
                activeMode === 'chat' ? 'text-[#df9825] bg-[#df9825]/5 font-bold' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              💬 ASSISTANT CHAT
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('builder')}
              className={`flex-1 py-1.5 text-center font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeMode === 'builder' ? 'text-emerald-400 bg-emerald-500/5 font-bold' : 'text-slate-450 hover:bg-white/5'
              }`}
            >
              🛠️ BUILDER ACTION PORT
            </button>
          </div>

          {/* Prompt/Chat response viewarea */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-black/45 flex flex-col min-h-0">
            
            {chatHistory.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1.5 w-full">
                <div 
                  className={`max-w-[90%] p-3 rounded-lg leading-relaxed text-[11.5px] font-sans relative group ${
                    item.role === 'user' 
                      ? 'bg-[#df9825]/10 text-slate-200 border border-[#df9825]/20 self-end ml-auto' 
                      : 'bg-slate-900/60 text-slate-300 border border-white/5 self-start mr-auto'
                  }`}
                >
                  {/* Message Identity Icon row */}
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#df9825]/85 uppercase tracking-wide mb-1 opacity-80 select-none gap-4">
                    <span>{item.role === 'user' ? 'Mod Creator' : 'MD Copilot'}</span>
                    
                    {item.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(item.text, `chat_msg_${idx}`)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center gap-1 h-4"
                        title="Copy message response"
                      >
                        <span className="text-[8px] font-mono leading-none">COPY</span>
                        {copiedId === `chat_msg_${idx}` ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>
                  
                  {/* Text render block */}
                  <span className="whitespace-pre-line font-medium leading-relaxed font-sans select-text">{item.text}</span>
                </div>

                {/* Proposed Workspace Action Card Block */}
                {item.actionRequired && item.proposedWorkspace && (
                  <div className="max-w-[90%] self-start mr-auto bg-[#0a1018] border border-emerald-500/20 rounded-lg p-3.5 space-y-3 font-sans animate-fade-in shadow-lg">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                      <Cpu className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      <span>PROPOSED WORKSPACE BLUEPRINT</span>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded p-2.5 space-y-1.5 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Namespace:</span>
                        <span className="text-slate-200 font-bold truncate max-w-[150px]">{item.proposedWorkspace.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Visual Nodes:</span>
                        <span className="text-slate-200 font-bold">{item.proposedWorkspace.nodes?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Flow Paths:</span>
                        <span className="text-slate-200 font-bold">{item.proposedWorkspace.links?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">UI Controls:</span>
                        <span className="text-slate-200 font-bold">{item.proposedWorkspace.uiWidgets?.length || 0}</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      This action will update your canvas immediately. You can modify any nodes manually or discard at any time.
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplyAction(idx, item)}
                        className="py-1.5 text-center text-[10px] bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Check className="w-3" />
                        Confirm & Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineAction(idx)}
                        className="py-1.5 text-center text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 rounded font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <X className="w-3 text-red-400" />
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="self-start bg-[#0a0d14] border border-white/5 p-3 rounded-lg text-slate-400 max-w-[80%] flex items-center gap-2.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#df9825]" />
                <span className="text-[10px] font-mono">
                  {activeMode === 'builder' 
                    ? 'Automating mission node linkages...' 
                    : 'Querying Egosoft compiler schemas...'
                  }
                </span>
              </div>
            )}

            {errorText && (
              <div className="p-2.5 bg-red-500/10 text-red-300 border border-red-500/15 rounded text-[10px] leading-relaxed font-sans">
                {errorText}
              </div>
            )}
          </div>

          {/* Suggestions drawer panel (only shows when user chat is fresh) */}
          {chatHistory.length === 1 && (
            <div className="border-t border-white/5 bg-[#080a10] p-3.5 space-y-2 shrink-0">
              <span className="text-slate-400 uppercase text-[9px] font-bold tracking-widest block mb-1">RECOMMENDED QUICK PROMPTS:</span>
              <div className="space-y-1.5">
                {currentSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.prompt)}
                    className="w-full text-left p-2 rounded bg-black/40 border border-white/[0.04] hover:bg-[#df9825]/10 hover:border-[#df9825]/30 group transition-all text-[11px] font-sans text-slate-300 cursor-pointer"
                  >
                    <div className="text-slate-200 font-bold flex items-center gap-1 group-hover:text-[#df9825]">
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      {s.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User Chat Inputs form */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(inputText); }}
            className="border-t border-white/5 bg-black/60 p-2.5 flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-black/85 border border-white/10 rounded-lg p-2 focus:outline-none focus:border-[#df9825] text-white text-[11px] font-sans"
              placeholder={activeMode === 'builder' 
                ? "Describe visual mod flow to auto-configure..."
                : "Ask for custom cues or script parameters..."
              }
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="p-2.5 rounded-lg bg-[#df9825] hover:bg-[#df9825]/90 text-black font-semibold uppercase font-mono disabled:opacity-50 transition-all flex items-center justify-center cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          
        </div>
      ) : (
        /* Floating click helper chip */
        <button
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={(e) => {
            if (hasDraggedRef.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            setIsOpen(true);
          }}
          className="flex items-center gap-2 px-4.5 py-3 rounded-full bg-[#df9825]/90 hover:bg-[#df9825] text-black font-mono text-xs font-bold shadow-2xl transition-all duration-150 transform hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing select-none"
          title="Drag anywhere; click to open AI Guide"
        >
          <Bot className="w-4.5 h-4.5 pointer-events-none" />
          <span className="pointer-events-none">X4 AI GUIDE</span>
        </button>
      )}
    </div>
  );
}
