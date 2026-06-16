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
  ChevronRight,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';
import { ModWorkspace, ChatMessage } from '../types';
import { reviewProposal, type VerdictStatus } from '../lib/proposalReview';

interface AIHelperProps {
  mode: 'floating' | 'sidebar';
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
  localVersion: number;
  setLocalVersion: (v: number) => void;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  inputText: string;
  setInputText: (text: string) => void;
  activeMode: 'chat' | 'builder';
  setActiveMode: (mode: 'chat' | 'builder') => void;
  loading: boolean;
  errorText: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  handleSend: (text: string) => void;
  handleApplyAction: (index: number, msg: ChatMessage) => void;
  handleDeclineAction: (index: number) => void;
  isAiFloatingVisible: boolean;
  setIsAiFloatingVisible: (visible: boolean) => void;
}

export default function AIHelper({
  mode,
  workspace,
  chatHistory,
  inputText,
  setInputText,
  activeMode,
  setActiveMode,
  loading,
  errorText,
  isOpen,
  setIsOpen,
  handleSend,
  handleApplyAction,
  handleDeclineAction
}: AIHelperProps) {
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

  // Dragging logic for floating mode
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
    if (mode === 'sidebar') return;
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

  const innerContent = (
    <>
      {/* Assist Header */}
      {mode === 'floating' ? (
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer drag-handle-only animate-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div 
          className="bg-[#df9825]/5 border-b border-white/5 p-3 flex items-center justify-between shrink-0 select-none"
        >
          <div className="flex items-center gap-1.5 font-bold text-[#df9825] pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>X4 INTELLIGENT AI GUIDE</span>
          </div>
        </div>
      )}

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

            {/* A4.2 — Review panel: diff + deterministic verdicts BEFORE apply. */}
            {item.actionRequired && item.proposedWorkspace && (() => {
              const review = reviewProposal(workspace, item.proposedWorkspace as ModWorkspace);
              const vClass: Record<VerdictStatus, string> = {
                pass: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                warn: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
                fail: 'text-red-300 border-red-500/30 bg-red-500/10',
                'not-checked': 'text-slate-400 border-white/10 bg-white/5',
              };
              const vLabel: Record<VerdictStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', 'not-checked': 'N/A' };
              const Badge = ({ name, v }: { name: string; v: { status: VerdictStatus; errors: number; warnings: number } }) => (
                <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-mono font-bold uppercase tracking-wide ${vClass[v.status]}`}
                  title={v.status === 'not-checked' ? 'Not machine-verified' : `${v.errors} error(s), ${v.warnings} warning(s)`}>
                  {name}: {vLabel[v.status]}
                </span>
              );
              return (
              <div className="max-w-[90%] self-start mr-auto bg-[#0a1018] border border-white/10 rounded-lg p-3.5 space-y-3 font-sans animate-fade-in shadow-lg">
                <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[10px] font-bold uppercase tracking-wider">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Proposed changes — review before applying</span>
                </div>

                {/* Diff summary */}
                <div className="bg-black/40 border border-white/5 rounded p-2.5 font-mono text-[10px] flex items-center gap-3">
                  <span className="text-emerald-400 font-bold">+{review.diff.added.length} added</span>
                  <span className="text-red-400 font-bold">−{review.diff.removed.length} removed</span>
                  <span className="text-amber-400 font-bold">~{review.diff.changed.length} changed</span>
                  <span className="ml-auto text-slate-500">{review.nodeCounts.base}→{review.nodeCounts.proposed} nodes</span>
                </div>

                {/* Three deterministic verdicts */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge name="Schema" v={review.verdicts.schema} />
                  <Badge name="Graph" v={review.verdicts.graph} />
                  <Badge name="Intent" v={review.verdicts.intent} />
                </div>

                {/* Unknown / likely-hallucinated tags */}
                {review.unknownTags.length > 0 && (
                  <div className="text-[9.5px] text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2 leading-relaxed flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>Unrecognized tag(s): {review.unknownTags.map(u => u.xmlTag).join(', ')} — not in the X4 schema (likely invented). Blocked from apply.</span>
                  </div>
                )}

                <p className="text-[9.5px] text-slate-500 leading-relaxed">
                  Staged only — nothing changes until you apply. <span className="text-slate-400">Intent</span> is not machine-verified: a green Schema/Graph proves the XML is valid, not that it does what you asked.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!review.applySafe}
                    onClick={() => handleApplyAction(idx, item)}
                    title={review.applySafe ? 'Apply to the canvas (reversible via Undo)' : 'Resolve the schema/graph errors or unknown tags first'}
                    className={`py-1.5 text-center text-[10px] font-bold rounded font-mono uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                      review.applySafe
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer'
                        : 'bg-slate-800 text-slate-500 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {review.applySafe ? <Check className="w-3" /> : <ShieldCheck className="w-3" />}
                    {review.applySafe ? 'Confirm & Apply' : 'Review before applying'}
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
              );
            })()}
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
                type="button"
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
    </>
  );

  if (mode === 'sidebar') {
    return (
      <div className="w-full h-full flex flex-col bg-transparent overflow-hidden font-mono text-xs text-slate-300">
        {innerContent}
      </div>
    );
  }

  return (
    <div 
      className="fixed z-40 flex flex-col items-end select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {isOpen ? (
        <div className="w-[390px] h-[540px] bg-[#0c0f16] border border-[#df9825]/40 rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono text-xs text-slate-300">
          {innerContent}
        </div>
      ) : (
        /* Floating click helper chip */
        <button
          type="button"
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
