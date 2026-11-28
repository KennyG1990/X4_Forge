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
import { getActiveProvider, hasProviderKey } from '../lib/apiHelper';
import BlueprintPanel, { type ArchitectStepView } from './BlueprintPanel';
import { loadBlueprint, sampleBlueprint, type ModBlueprint } from '../lib/modBlueprint';

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
  activeMode: 'chat' | 'builder' | 'architect';
  setActiveMode: (mode: 'chat' | 'builder' | 'architect') => void;
  loading: boolean;
  errorText: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  handleSend: (text: string) => void;
  handleApplyAction: (index: number, msg: ChatMessage) => void;
  handleDeclineAction: (index: number) => void;
  isAiFloatingVisible: boolean;
  setIsAiFloatingVisible: (visible: boolean) => void;
  /** Live md.xsd-derived valid tag set, so the review's unknown-tag check doesn't
   *  false-flag legitimate schema tags outside the curated palette. */
  knownTags?: Set<string>;
  /** A4.7 — abort the in-flight AI request (Builder runs several slow passes). */
  onCancel?: () => void;
  /** A4.3 — the active AI presence tier. Gates which surfaces are exposed:
   *  explain = read-only chat (no apply, no Builder/Architect);
   *  assist  = chat + Builder (staged proposals you can apply);
   *  cobuild = chat + Builder + Architect. Defaults to cobuild if unset. */
  aiTier?: 'off' | 'explain' | 'assist' | 'cobuild';
  /** A5.2 — Architect blueprint, owned by App (single source of truth shared with the loop). */
  architectBlueprint?: ModBlueprint;
  onBlueprintChange?: (b: ModBlueprint) => void;
  /** A5.2 D3 — Architect agent-loop controls (wired by App at cobuild tier). */
  onRunArchitectStep?: () => void;
  architectRunning?: boolean;
  architectStep?: ArchitectStepView | null;
  onConfirmArchitectStep?: () => void;
  onDeclineArchitectStep?: () => void;
  architectCanRun?: boolean;
  architectRunDisabledReason?: string;
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
  handleDeclineAction,
  knownTags,
  onCancel,
  aiTier = 'cobuild',
  architectBlueprint: architectBlueprintProp,
  onBlueprintChange,
  onRunArchitectStep,
  architectRunning,
  architectStep,
  onConfirmArchitectStep,
  onDeclineArchitectStep,
  architectCanRun,
  architectRunDisabledReason,
}: AIHelperProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // A4.3 — tier-gated surfaces. explain = read-only chat; assist adds Builder; cobuild adds Architect.
  const canBuild = aiTier === 'assist' || aiTier === 'cobuild';
  const canArchitect = aiTier === 'cobuild';
  // Coerce the active mode down to one this tier actually exposes (e.g. a persisted
  // 'architect' selection when the user later drops to 'explain').
  React.useEffect(() => {
    if (activeMode === 'architect' && !canArchitect) setActiveMode(canBuild ? 'builder' : 'chat');
    else if (activeMode === 'builder' && !canBuild) setActiveMode('chat');
  }, [activeMode, canBuild, canArchitect, setActiveMode]);
  // A5.1/A5.2 — Architect blueprint. Prefer App's (single source of truth, shared with the
  // agent loop); fall back to a persisted/sample one so the panel still renders standalone.
  const fallbackBlueprint = React.useMemo(() => loadBlueprint() || sampleBlueprint(), []);
  const architectBlueprint = architectBlueprintProp ?? fallbackBlueprint;

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
          className="bg-[#11141a] border-b border-[#262c36] px-3.5 py-2.5 flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing select-none"
          title="Drag from header to move guide window"
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-[#eef2f7] pointer-events-none">
            <Sparkles className="w-4 h-4 text-[#60a5fa]" />
            <span>Forge AI Assistant</span>
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1 rounded hover:bg-[#171b23] text-[#a0aab8] hover:text-[#eef2f7] transition-colors cursor-pointer drag-handle-only animate-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div 
          className="bg-[#11141a] border-b border-[#262c36] px-3 py-2.5 flex items-center justify-between shrink-0 select-none"
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-[#eef2f7] pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-[#60a5fa]" />
            <span>Forge AI Assistant</span>
          </div>
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="flex border-b border-[#262c36] bg-[#11141a] font-sans text-[11px] shrink-0">
        <button
          type="button"
          onClick={() => setActiveMode('chat')}
          className={`flex-1 py-2 text-center border-r border-[#262c36] transition-colors cursor-pointer ${
            activeMode === 'chat' ? 'text-[#93c5fd] bg-[#3b82f6]/10 border-b-2 border-[#3b82f6] font-semibold' : 'text-[#a0aab8] hover:text-[#eef2f7] hover:bg-[#171b23] font-medium'
          }`}
        >
          Chat
        </button>
        {canBuild && (
          <button
            type="button"
            onClick={() => setActiveMode('builder')}
            className={`flex-1 py-2 text-center transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeMode === 'builder' ? 'text-emerald-300 bg-emerald-500/10 border-b-2 border-emerald-400 font-semibold' : 'text-[#a0aab8] hover:text-[#eef2f7] hover:bg-[#171b23] font-medium'
            }`}
          >
            Builder
          </button>
        )}
        {canArchitect && (
          <button
            type="button"
            onClick={() => setActiveMode('architect')}
            className={`flex-1 py-2 text-center border-l border-[#262c36] transition-colors cursor-pointer ${
              activeMode === 'architect' ? 'text-[#93c5fd] bg-[#3b82f6]/10 border-b-2 border-[#3b82f6] font-semibold' : 'text-[#a0aab8] hover:text-[#eef2f7] hover:bg-[#171b23] font-medium'
            }`}
          >
            Architect
          </button>
        )}
      </div>
      {/* A4.3 — explain tier: a calm note that this is a read-only on-ramp (no canvas changes). */}
      {!canBuild && (
        <div className="shrink-0 px-3.5 py-2 bg-[#3b82f6]/10 border-b border-[#3b82f6]/25 text-[11px] text-[#93c5fd] font-sans leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#60a5fa]" />
          <span>Explain mode — read-only. The assistant answers questions and explains errors but never changes your canvas. Switch to <b>Assist</b> or <b>Co-build</b> in Settings to let it propose edits.</span>
        </div>
      )}

      {/* A4.8 — calm, upfront key-setup nudge (no recurring popups; just a static banner while no key is set). */}
      {!hasProviderKey(getActiveProvider()) && (
        <div className="shrink-0 px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/25 text-[11px] text-amber-300 font-sans leading-relaxed flex items-start gap-1.5">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
          <span>No AI key set for <b>{getActiveProvider()}</b>. Open <b>Settings → AI Assistant → Configure AI engine</b> to add a provider key — requests won't run until then.</span>
        </div>
      )}

      {activeMode === 'architect' ? (
        <BlueprintPanel
          blueprint={architectBlueprint}
          workspace={workspace}
          onChange={onBlueprintChange}
          onRunStep={onRunArchitectStep}
          running={architectRunning}
          step={architectStep}
          onConfirmStep={onConfirmArchitectStep}
          onDeclineStep={onDeclineArchitectStep}
          canRun={architectCanRun}
          runDisabledReason={architectRunDisabledReason}
        />
      ) : (
      <>
      {/* Prompt/Chat response viewarea */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-[#0c0e12] flex flex-col min-h-0">

        {chatHistory.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1.5 w-full">
            <div 
              className={`max-w-[90%] p-3 rounded-lg leading-relaxed text-xs font-sans relative group ${
                item.role === 'user' 
                  ? 'bg-[#3b82f6]/12 text-[#eef2f7] border border-[#3b82f6]/30 self-end ml-auto' 
                  : 'bg-[#11141a] text-[#cbd5e1] border border-[#262c36] self-start mr-auto'
              }`}
            >
              {/* Message Identity Icon row */}
              <div className="flex items-center justify-between font-mono text-[11px] text-[#a0aab8] mb-1 select-none gap-4">
                <span>{item.role === 'user' ? 'Mod Creator' : 'MD Copilot'}</span>
                
                {item.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(item.text, `chat_msg_${idx}`)}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded hover:bg-[#171b23] text-[#a0aab8] hover:text-[#eef2f7] transition-opacity cursor-pointer flex items-center gap-1"
                    title="Copy message response"
                  >
                    <span className="text-[11px] font-mono leading-none">Copy</span>
                    {copiedId === `chat_msg_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
              
              {/* Text render block */}
              <span className="whitespace-pre-line font-normal leading-relaxed font-sans select-text">{item.text}</span>
            </div>

            {/* A4.2 — Review panel: diff + deterministic verdicts BEFORE apply. */}
            {item.actionRequired && item.proposedWorkspace && (() => {
              const review = reviewProposal(workspace, item.proposedWorkspace as ModWorkspace, { knownTags, requirements: item.requirements });
              const intentChecked = !!(review.intentResults && review.intentResults.length);
              const intentFail = review.verdicts.intent.status === 'fail';
              const vClass: Record<VerdictStatus, string> = {
                pass: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
                warn: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
                fail: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
                'not-checked': 'text-[#a0aab8] border-[#262c36] bg-[#171b23]',
              };
              const vLabel: Record<VerdictStatus, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', 'not-checked': 'N/A' };
              const Badge = ({ name, v }: { name: string; v: { status: VerdictStatus; errors: number; warnings: number } }) => (
                <span className={`px-2 py-0.5 rounded border text-[11px] font-mono font-medium ${vClass[v.status]}`}
                  title={v.status === 'not-checked' ? 'Not machine-verified' : `${v.errors} error(s), ${v.warnings} warning(s)`}>
                  {name}: {vLabel[v.status]}
                </span>
              );
              return (
              <div className="max-w-[90%] self-start mr-auto bg-[#11141a] border border-[#262c36] rounded-lg p-3.5 space-y-3 font-sans">
                <div className="flex items-center gap-1.5 text-[#eef2f7] font-semibold text-xs">
                  <Cpu className="w-3.5 h-3.5 text-[#60a5fa]" />
                  <span>Proposed changes — review before applying</span>
                </div>

                {/* Diff summary */}
                <div className="bg-[#0a0c10] border border-[#262c36] rounded p-2.5 font-mono text-[11px] flex flex-wrap items-center gap-3">
                  <span className="text-emerald-400 font-semibold">+{review.diff.added.length} added</span>
                  <span className="text-rose-400 font-semibold">−{review.diff.removed.length} removed</span>
                  <span className="text-amber-400 font-semibold">~{review.diff.changed.length} changed</span>
                  <span className="ml-auto text-[#a0aab8]">{review.nodeCounts.base}→{review.nodeCounts.proposed} nodes</span>
                </div>

                {/* Three deterministic verdicts */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge name="Schema" v={review.verdicts.schema} />
                  <Badge name="Graph" v={review.verdicts.graph} />
                  <Badge name="Intent" v={review.verdicts.intent} />
                </div>

                {/* Intent requirement checklist (A4.9) — what the request asked vs what the output satisfies */}
                {review.intentResults && review.intentResults.length > 0 && (
                  <div className="bg-[#0a0c10] border border-[#262c36] rounded p-2.5 space-y-1">
                    <div className="text-[11px] font-medium text-[#a0aab8]">Requirements checked</div>
                    {review.intentResults.map(r => (
                      <div key={r.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                        <span className={`shrink-0 font-bold ${r.status === 'pass' ? 'text-emerald-400' : r.status === 'fail' ? 'text-rose-400' : 'text-[#687385]'}`}>
                          {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '—'}
                        </span>
                        <span className={r.status === 'fail' ? 'text-rose-300' : 'text-[#cbd5e1]'}>
                          {r.label}{r.status === 'not-verified' ? ' (not machine-verified)' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unknown / likely-hallucinated tags */}
                {review.unknownTags.length > 0 && (
                  <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded p-2.5 leading-relaxed flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Unrecognized tag(s): {review.unknownTags.map(u => u.xmlTag).join(', ')} — not in the X4 schema (likely invented). Blocked from apply.</span>
                  </div>
                )}

                <p className="text-[11px] text-[#a0aab8] leading-relaxed">
                  Staged only — nothing changes until you apply. {intentChecked
                    ? <>Requirements above are machine-checked against the output (rows marked <span className="text-[#eef2f7]">—</span> aren't verifiable). A green Schema/Graph means valid XML — the <span className="text-[#eef2f7]">Intent</span> result is what tells you it matches your request.</>
                    : <><span className="text-[#eef2f7]">Intent</span> is not machine-verified here: a green Schema/Graph proves the XML is valid, not that it does what you asked.</>}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!canBuild || !review.applySafe}
                    onClick={() => handleApplyAction(idx, item)}
                    title={
                      !canBuild ? 'Explain tier is read-only — switch to Assist or Co-build in Settings to apply changes'
                        : !review.applySafe ? 'Resolve the schema/graph errors or unknown tags first'
                          : intentFail ? 'Valid XML, but it does NOT satisfy all your requirements. Apply only if you intend to finish it yourself (reversible via Undo).'
                            : 'Apply to the canvas (reversible via Undo)'
                    }
                    className={`py-1.5 text-center text-[11px] font-semibold rounded flex items-center justify-center gap-1 transition-colors ${
                      !canBuild || !review.applySafe
                        ? 'bg-[#171b23] text-[#687385] border border-[#262c36] cursor-not-allowed'
                        : intentFail
                          ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer'
                    }`}
                  >
                    {!canBuild || !review.applySafe ? <ShieldCheck className="w-3.5 h-3.5" /> : intentFail ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    {!canBuild ? 'Read-only (Explain tier)' : !review.applySafe ? 'Review before applying' : intentFail ? 'Apply anyway — intent incomplete' : 'Confirm & Apply'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineAction(idx)}
                    className="py-1.5 text-center text-[11px] bg-[#171b23] hover:bg-[#262c36] text-[#cbd5e1] border border-[#262c36] rounded font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    Decline
                  </button>
                </div>
              </div>
              );
            })()}
          </div>
        ))}

        {loading && (
          <div className="self-start bg-[#11141a] border border-[#262c36] p-3 rounded-lg text-[#a0aab8] max-w-[88%] space-y-2">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#60a5fa] shrink-0" />
              <span className="text-[11px] font-mono leading-relaxed">
                {activeMode === 'builder'
                  ? 'Drafting → wiring → HUD → verifying → requirements… (several model passes, ~30–60s)'
                  : 'Working…'}
              </span>
            </div>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-2 py-0.5 bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded text-[11px] font-medium cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {errorText && (
          <div className="p-2.5 bg-rose-500/10 text-rose-300 border border-rose-500/25 rounded text-[11px] leading-relaxed font-sans">
            {errorText}
          </div>
        )}
      </div>

      {/* Suggestions drawer panel (only shows when user chat is fresh) */}
      {chatHistory.length === 1 && (
        <div className="border-t border-[#262c36] bg-[#11141a] p-3.5 space-y-2 shrink-0">
          <span className="text-[#a0aab8] text-[11px] font-medium block mb-1">Quick prompts</span>
          <div className="space-y-1.5">
            {currentSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(s.prompt)}
                className="w-full text-left p-2 rounded bg-[#0a0c10] border border-[#262c36] hover:bg-[#171b23] hover:border-[#3b82f6]/45 group transition-colors text-[11px] font-sans text-[#cbd5e1] cursor-pointer"
              >
                <div className="text-[#eef2f7] font-semibold flex items-center gap-1 group-hover:text-[#93c5fd]">
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
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
        className="border-t border-[#262c36] bg-[#11141a] p-2.5 flex gap-2 shrink-0"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-[#0a0c10] border border-[#262c36] rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#3b82f6] text-[#eef2f7] placeholder-[#687385] text-[11px] font-sans"
          placeholder={activeMode === 'builder' 
            ? "Describe visual mod flow to auto-configure..."
            : "Ask for custom cues or script parameters..."
          }
        />
        <button
          type="submit"
          disabled={loading || !inputText.trim()}
          className="px-3 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold disabled:opacity-50 transition-colors flex items-center justify-center cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
      </>
      )}
    </>
  );

  if (mode === 'sidebar') {
    return (
      <div data-testid="ai-helper-panel" className="w-full h-full flex flex-col bg-[#0c0e12] overflow-hidden font-sans text-xs text-[#eef2f7]">
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
        <div data-testid="ai-helper-panel" className="w-[390px] h-[540px] bg-[#0c0e12] border border-[#262c36] rounded-xl shadow-2xl flex flex-col overflow-hidden font-sans text-xs text-[#eef2f7]">
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
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-sans text-xs font-semibold shadow-2xl transition-all duration-150 cursor-grab active:cursor-grabbing select-none"
          title="Drag anywhere; click to open AI Guide"
        >
          <Bot className="w-4 h-4 pointer-events-none" />
          <span className="pointer-events-none">Forge AI</span>
        </button>
      )}
    </div>
  );
}
