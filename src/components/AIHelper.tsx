/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  HelpCircle, 
  X, 
  Info,
  ChevronRight,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { getAIHeaders } from '../lib/apiHelper';

export default function AIHelper() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: "Hello, Captain! I am your visual X4: Foundations Mission Director digital copilot. Prompt me for quick templates, command lookups, custom station macro triggers, or script structures." }
  ]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Quick prompt suggestions
  const SUGGESTIONS = [
    { title: "Define a Sector-Entry Alert", prompt: "Write an X4 MD Cue block that listens for the player entering sector 'player.sector', showing a custom scrolling dialogue banner and playing an alert sound." },
    { title: "Register a Custom UI Table", prompt: "Explain how to hook up custom XML UI menu buttons to signal MD script cues to deliver a ship in X4 Foundations." },
    { title: "Spawn Capital Fleet Wing", prompt: "Provide clean MD action XML that checks if player money exceeds 5,000,000, subtracts 1,000,000 credits, and spawns 1 behemoth destroyer belonging to Xenon faction at the player position." }
  ];

  const handleSend = async (messagePrompt: string) => {
    if (!messagePrompt.trim()) return;
    setErrorText(null);
    setLoading(true);

    // Expand history
    const userMessage = { role: 'user' as const, text: messagePrompt };
    setChatHistory(prev => [...prev, userMessage]);
    setInputText('');

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: getAIHeaders(),
        body: JSON.stringify({ prompt: messagePrompt })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to establish connection.");
      }

      setChatHistory(prev => [...prev, { role: 'assistant' as const, text: data.text }]);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Expanded AI Guide Drawer panel */}
      {isOpen ? (
        <div className="w-[380px] h-[520px] bg-[#0c0f16] border border-[#df9825]/40 rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono text-xs text-slate-300">
          
          {/* Assist Header */}
          <div className="bg-[#df9825]/10 border-b border-[#df9825]/20 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-[#df9825]">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>X4 INTELLIGENT AI GUIDE</span>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Prompt/Chat response viewarea */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-black/45 flex flex-col">
            
            {chatHistory.map((item, idx) => (
              <div 
                key={idx} 
                className={`max-w-[90%] p-3 rounded-lg leading-relaxed text-[11px] font-sans ${
                  item.role === 'user' 
                    ? 'bg-[#df9825]/10 text-slate-200 border border-[#df9825]/20 self-end ml-auto' 
                    : 'bg-slate-900/60 text-slate-300 border border-white/5 self-start mr-auto'
                }`}
              >
                {/* Message Identity Icon row */}
                <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#df9825]/85 uppercase tracking-wide mb-1 opacity-80 select-none">
                  {item.role === 'user' ? 'Mod Creator' : 'MD Copilot'}
                </div>
                
                {/* Text render block */}
                <span className="whitespace-pre-line font-medium leading-relaxed font-sans">{item.text}</span>
              </div>
            ))}

            {loading && (
              <div className="self-start bg-slate-900/60 border border-white/5 p-3 rounded-lg text-slate-400 max-w-[80%] flex items-center gap-2 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#df9825]" />
                <span className="text-[10px]">Consulting Egosoft compiler schemas...</span>
              </div>
            )}

            {errorText && (
              <div className="p-2 bg-red-500/10 text-red-300 border border-red-500/15 rounded text-[10px] leading-relaxed">
                {errorText}
              </div>
            )}
          </div>

          {/* Suggetions drawer panel (only shows when user chat is fresh) */}
          {chatHistory.length === 1 && (
            <div className="border-t border-white/5 bg-[#080a10] p-3.5 space-y-2">
              <span className="text-slate-400 uppercase text-[9px] font-bold tracking-widest block mb-1">RECOMMENDED QUICK PROMPTS:</span>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.prompt)}
                    className="w-full text-left p-2 rounded bg-black/40 border border-white/[0.04] hover:bg-[#df9825]/10 hover:border-[#df9825]/30 group transition-all text-[11px] font-sans"
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
            className="border-t border-white/5 bg-black/60 p-2.5 flex gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-black/80 border border-white/10 rounded-lg p-2 focus:outline-none focus:border-[#df9825] text-white text-[11px]"
              placeholder="Ask for custom cue templates or Lua menus..."
            />
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="p-2 rounded-lg bg-[#df9825] hover:bg-[#df9825]/90 text-black font-semibold uppercase font-mono disabled:opacity-50 transition-all flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          
        </div>
      ) : (
        /* Floating click helper chip */
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4.5 py-3 rounded-full bg-[#df9825] hover:bg-[#df9825]/95 text-black font-mono text-xs font-bold shadow-2xl transition-all duration-150 transform hover:scale-105 active:scale-95"
        >
          <Bot className="w-4.5 h-4.5" />
          X4 AI GUIDE
        </button>
      )}
    </div>
  );
}
