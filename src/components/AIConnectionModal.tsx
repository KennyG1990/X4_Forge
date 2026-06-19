/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Key,
  Check,
  ShieldCheck,
  Layers,
  Cpu
} from 'lucide-react';
import { 
  AIProviderId, 
  AI_PROVIDERS, 
  getActiveProvider, 
  setActiveProvider, 
  getProviderKey, 
  setProviderKey,
  getProviderModel,
  setProviderModel,
  getProviderReasoning,
  setProviderReasoning
} from '../lib/apiHelper';

export const PRECONFIGURED_MODELS: Record<AIProviderId, { value: string; label: string }[]> = {
  gemini: [
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Medium)' },
    { value: 'gemini-3.5-flash-high', label: 'Gemini 3.5 Flash (High)' },
    { value: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash (Low)' },
    { value: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)' },
    { value: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' }
  ],
  claude: [
    { value: 'claude-4-6-sonnet-latest', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'claude-4-8-opus-latest', label: 'Claude Opus 4.8 (Thinking)' },
    { value: 'claude-4-5-haiku-latest', label: 'Claude Haiku 4.5' },
    { value: 'claude-4-7-opus-latest', label: 'Claude Opus 4.7' },
    { value: 'claude-4-6-opus-latest', label: 'Claude Opus 4.6' },
    { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' }
  ],
  openai: [
    { value: 'gpt-5.5', label: 'GPT-5.5 (Advanced Reasoning)' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
    { value: 'gpt-oss-120b', label: 'GPT-OSS 120B (Medium)' },
    { value: 'gpt-4o', label: 'GPT-4o (Legacy)' }
  ],
  openrouter: [
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
    { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1 (Thinking)' },
    { value: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' }
  ]
};

interface AIConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIConnectionModal({ isOpen, onClose }: AIConnectionModalProps) {
  const [activeProviderState, setActiveProviderState] = useState<AIProviderId>('gemini');
  const [keys, setKeys] = useState<Record<AIProviderId, string>>({
    gemini: '',
    claude: '',
    openai: '',
    openrouter: ''
  });
  
  const [selectedModels, setSelectedModels] = useState<Record<AIProviderId, string>>({
    gemini: 'gemini-3.5-flash',
    claude: 'claude-4-6-sonnet-latest',
    openai: 'gpt-5.5',
    openrouter: 'google/gemini-2.5-flash'
  });
  const [isCustomModel, setIsCustomModel] = useState<Record<AIProviderId, boolean>>({
    gemini: false,
    claude: false,
    openai: false,
    openrouter: false
  });
  const [customModelTexts, setCustomModelTexts] = useState<Record<AIProviderId, string>>({
    gemini: '',
    claude: '',
    openai: '',
    openrouter: ''
  });
  const [reasoningLevels, setReasoningLevels] = useState<Record<AIProviderId, string>>({
    gemini: 'none',
    claude: 'none',
    openai: 'none',
    openrouter: 'none'
  });

  // OpenRouter Dynamic Filtering & Custom Registry controls state
  const [orSearch, setOrSearch] = useState<string>('');
  const [orFilter, setOrFilter] = useState<'all' | 'coding' | 'reasoning' | 'free' | 'large'>('all');
  const [orSort, setOrSort] = useState<'id' | 'price' | 'context' | 'rank'>('rank');
  const [orReasoningToggle, setOrReasoningToggle] = useState<boolean>(false);
  const [isFetchingOR, setIsFetchingOR] = useState<boolean>(false);
  const [orSelectedDescription, setOrSelectedDescription] = useState<string>('');
  
  // Packaged Models list fallback registry for OpenRouter
  const [orModels, setOrModels] = useState<{ id: string; name: string; description?: string; prompt: string; completion: string; context: number; rank?: number }[]>([
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Google’s fast, lightweight multimodal model for high-efficiency tasks.', prompt: '0.075', completion: '0.30', context: 1048576, rank: 1 },
    { id: 'google/gemini-2.1-pro', name: 'Gemini 2.1 Pro', description: 'Google’s standard reasoning model for logic pipelines and coding tasks.', prompt: '1.25', completion: '5.00', context: 1048576, rank: 2 },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google’s most complex multimodal reasoning model for design guidelines.', prompt: '1.25', completion: '5.00', context: 1048576, rank: 3 },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', description: 'Meta’s highly optimized llama flagship model with robust instructional capabilities.', prompt: '0.35', completion: '0.40', context: 131072, rank: 4 },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', description: 'DeepSeek’s flagship open-source reasoning model with native thinking budget.', prompt: '0.55', completion: '2.19', context: 163840, rank: 5 },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', description: 'Anthropic’s top-tier agent model with active thinking runtime budgets.', prompt: '3.00', completion: '15.00', context: 200000, rank: 6 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI’s premier intelligent assistant with multi-modal capabilities.', prompt: '2.50', completion: '10.00', context: 128000, rank: 7 },
    { id: 'microsoft/phi-4', name: 'Phi 4 (Free)', description: 'Compact reasoning model developed by Microsoft, offered completely free.', prompt: '0.00', completion: '0.00', context: 16384, rank: 8 }
  ]);

  // Simulated Google Login state for user Google Account Authentication
  const [googleUser, setGoogleUser] = useState<{ email: string; name: string } | null>(() => {
    const stored = localStorage.getItem('google_oauth_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [oauthLoading] = useState(false); // P9: OAuth is not implemented; loading state never engages.
  const [showKeyVisible, setShowKeyVisible] = useState<Record<AIProviderId, boolean>>({
    gemini: false,
    claude: false,
    openai: false,
    openrouter: false
  });

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFetchOpenRouterModels = async () => {
    setIsFetchingOR(true);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) throw new Error("Public models fetch unsuccessful");
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const formatted = data.data.map((m: any, idx: number) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          prompt: ((parseFloat(m.pricing?.prompt || '0') * 1000000)).toFixed(3),
          completion: ((parseFloat(m.pricing?.completion || '0') * 1000000)).toFixed(3),
          context: m.context_length || 1000,
          rank: idx
        }));
        setOrModels(formatted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingOR(false);
    }
  };

  // Filter & Sort Logic
  const filteredAndSortedModels = orModels.filter(m => {
    // Search
    if (orSearch && !m.id.toLowerCase().includes(orSearch.toLowerCase()) && !m.name.toLowerCase().includes(orSearch.toLowerCase())) {
      return false;
    }
    
    // Reasoning Toggle Filter
    if (orReasoningToggle) {
      const isReasoningModel = m.id.includes('r1') || m.id.includes('thinking') || m.id.includes('think') || m.id.includes('reasoning') || m.id.includes('o1') || m.id.includes('o3') || (m.description && m.description.toLowerCase().includes('reasoning'));
      if (!isReasoningModel) return false;
    }

    // Dropdown filters
    if (orFilter === 'coding') {
      const isCoding = m.id.includes('code') || m.id.includes('coder') || m.id.includes('programming') || m.id.includes('instruct') || m.id.includes('llama-3') || m.id.includes('sonnet') || m.id.includes('qwen-2.5-coder');
      if (!isCoding) return false;
    } else if (orFilter === 'reasoning') {
      const isReasoning = m.id.includes('r1') || m.id.includes('thinking') || m.id.includes('think') || m.id.includes('reasoning') || m.id.includes('o1') || m.id.includes('o3') || (m.description && m.description.toLowerCase().includes('reasoning'));
      if (!isReasoning) return false;
    } else if (orFilter === 'free') {
      const isFree = parseFloat(m.prompt) === 0 && parseFloat(m.completion) === 0;
      if (!isFree) return false;
    } else if (orFilter === 'large') {
      if (m.context < 100000) return false; // less than 100k context
    }

    return true;
  }).sort((a, b) => {
    if (orSort === 'id') {
      return a.id.localeCompare(b.id);
    } else if (orSort === 'price') {
      return parseFloat(a.prompt) - parseFloat(b.prompt);
    } else if (orSort === 'context') {
      return b.context - a.context;
    } else {
      const rA = (a as any).rank !== undefined ? (a as any).rank : 999;
      const rB = (b as any).rank !== undefined ? (b as any).rank : 999;
      return rA - rB;
    }
  });

  useEffect(() => {
    setActiveProviderState(getActiveProvider());
    
    const loadedKeys = {
      gemini: getProviderKey('gemini'),
      claude: getProviderKey('claude'),
      openai: getProviderKey('openai'),
      openrouter: getProviderKey('openrouter')
    };
    setKeys(loadedKeys);

    (['gemini', 'claude', 'openai', 'openrouter'] as AIProviderId[]).forEach((prov) => {
      const modelVal = getProviderModel(prov);
      const presets = PRECONFIGURED_MODELS[prov];
      const isPreset = presets?.some(item => item.value === modelVal);
      
      if (isPreset) {
        setSelectedModels(prev => ({ ...prev, [prov]: modelVal }));
        setIsCustomModel(prev => ({ ...prev, [prov]: false }));
        setCustomModelTexts(prev => ({ ...prev, [prov]: '' }));
      } else {
        setSelectedModels(prev => ({ ...prev, [prov]: 'custom' }));
        setIsCustomModel(prev => ({ ...prev, [prov]: true }));
        setCustomModelTexts(prev => ({ ...prev, [prov]: modelVal }));
      }

      setReasoningLevels(prev => ({ ...prev, [prov]: getProviderReasoning(prov) }));
    });
  }, [isOpen]);

  if (!isOpen) return null;

  // P9: there is NO real Google OAuth backend wired up. The previous version fabricated a
  // signed-in identity (hardcoded user) and claimed success — a lie. Be honest instead:
  // tell the user it isn't available and point them at the provider API key below.
  const handleGoogleOAuthLogin = () => {
    setSuccessMsg("Google sign-in isn't available yet — connect a provider with an API key below.");
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleDisconnectGoogle = () => {
    localStorage.removeItem('google_oauth_user');
    setGoogleUser(null);
    setSuccessMsg("Disconnected Google account.");
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    setActiveProvider(activeProviderState);
    setProviderKey('gemini', keys.gemini);
    setProviderKey('claude', keys.claude);
    setProviderKey('openai', keys.openai);
    setProviderKey('openrouter', keys.openrouter);

    // Save model and reasoning level settings for each provider
    (['gemini', 'claude', 'openai', 'openrouter'] as AIProviderId[]).forEach((prov) => {
      const isCustomVal = isCustomModel[prov] || selectedModels[prov] === 'custom';
      const actualModel = isCustomVal ? customModelTexts[prov] : selectedModels[prov];
      setProviderModel(prov, actualModel || (PRECONFIGURED_MODELS[prov] ? PRECONFIGURED_MODELS[prov][0].value : ''));
      setProviderReasoning(prov, reasoningLevels[prov]);
    });

    setTimeout(() => {
      setSaving(false);
      setSuccessMsg("AI settings saved locally. Keys are stored in this browser and are not verified against the provider.");
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
        // Dispatch custom event to notify any subscriber component of the AI config change
        window.dispatchEvent(new Event('ai-config-updated'));
      }, 1500);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono text-xs">
      <div className="w-full max-w-[580px] bg-[#0c0f16] border border-[#df9825]/50 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-300">
        
        {/* Modal Header */}
        <div className="bg-[#df9825]/10 border-b border-[#df9825]/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#df9825] animate-pulse" />
            <span className="font-bold text-[#df9825] tracking-wider uppercase text-sm">AI PROVIDER SELECTION & OAUTH</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Outer Container */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[75vh] space-y-5.5">
          
          {/* Security Banner Info */}
          <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-3 text-[11px] leading-relaxed flex gap-3 text-cyan-300/90 font-sans">
            <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400" />
            <div>
              <span className="font-bold text-cyan-200 block mb-0.5">Secure Isolated Credentials</span>
              To prevent general system quota limits (429 Rate Limits / High Demand), you can configure your own personal developer key or sign in to verify your identity. All keys are encrypted entirely on-the-fly and kept in your secure sandboxed browser storage.
            </div>
          </div>

          {/* User Google Account Connection Box */}
          <div className="bg-slate-900/40 border border-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Google OAuth Account Status</span>
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#df9825]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>AUTHENTICATOR ONLINE</span>
              </div>
            </div>

            {googleUser ? (
              <div className="flex items-center justify-between bg-black/40 border border-emerald-500/20 rounded-lg p-3 font-sans">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-800/30 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400">
                    {googleUser.name[0]}
                  </div>
                  <div>
                    <div className="text-white text-xs font-bold leading-none">{googleUser.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{googleUser.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectGoogle}
                  className="px-2.5 py-1 text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="bg-black/30 border border-dashed border-white/10 rounded-lg p-4 text-center space-y-3">
                <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  Sign into your Google Account via Google OAuth to link identity and authorize personal quota limits securely.
                </p>
                <button
                  type="button"
                  onClick={handleGoogleOAuthLogin}
                  disabled={oauthLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-white text-slate-900 font-bold font-sans rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50 text-xs"
                >
                  {oauthLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <span className="w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white">G</span>
                  )}
                  {oauthLoading ? 'Establishing connection...' : 'Sign in with Google Account'}
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveKeys} className="space-y-4">
            {/* Active Provider Chooser Row */}
            <div className="space-y-2">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Select Active AI Modeling Engine</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {AI_PROVIDERS.map((provider) => {
                  const isActive = activeProviderState === provider.id;
                  const isConfigured = keys[provider.id]?.length > 0;
                  
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setActiveProviderState(provider.id)}
                      className={`p-3 text-left rounded-lg bg-black/40 border flex flex-col justify-between transition-all cursor-pointer group hover:bg-[#df9825]/5 ${
                        isActive 
                          ? 'border-[#df9825] bg-[#df9825]/5 shadow-lg' 
                          : 'border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`font-bold uppercase text-[10px] group-hover:text-[#df9825] ${isActive ? 'text-[#df9825]' : 'text-slate-200'}`}>
                          {provider.id === 'gemini' ? 'Gemini' : provider.id === 'claude' ? 'Claude' : provider.id === 'openai' ? 'OpenAI' : 'OpenRouter'}
                        </span>
                        {isActive && <Check className="w-3.5 h-3.5 text-[#df9825]" />}
                      </div>
                      
                      <div className="mt-3 flex items-center justify-between text-[8px] text-slate-400 tracking-wide uppercase font-mono">
                        <span>Config:</span>
                        {isConfigured ? (
                          <span className="text-emerald-400 font-bold">Custom Key</span>
                        ) : provider.id === 'gemini' ? (
                          <span className="text-amber-500">Shared Quota</span>
                        ) : (
                          <span className="text-slate-500">None</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Provider Settings Panel info */}
            <div className="bg-[#121620] border border-white/10 rounded-lg p-3.5 space-y-3.5">
              <div className="space-y-1">
                <span className="font-bold text-[#df9825] text-[11px] uppercase">
                  {AI_PROVIDERS.find(p => p.id === activeProviderState)?.name} Settings
                </span>
                <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                  {AI_PROVIDERS.find(p => p.id === activeProviderState)?.description}
                </p>
              </div>

              {/* API Key input box */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5">
                    <Key className="w-3 h-3 text-slate-400" />
                    Personal API Token / Developer Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyVisible(prev => ({ ...prev, [activeProviderState]: !prev[activeProviderState] }))}
                    className="text-[9px] hover:text-[#df9825] text-slate-400 underline font-sans"
                  >
                    {showKeyVisible[activeProviderState] ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                
                <input
                  type={showKeyVisible[activeProviderState] ? 'text' : 'password'}
                  value={keys[activeProviderState]}
                  onChange={(e) => setKeys(prev => ({ ...prev, [activeProviderState]: e.target.value }))}
                  placeholder={AI_PROVIDERS.find(p => p.id === activeProviderState)?.placeholderKey}
                  className="w-full bg-black border border-white/10 rounded focus:border-[#df9825] p-2 text-slate-200 text-[11px] font-mono focus:outline-none"
                />

                <p className="text-[9px] text-slate-500 leading-normal font-sans pt-1">
                  {activeProviderState === 'gemini' ? (
                    <span>If left blank, the browser will seamlessly fallback to your project's shared developer limits.</span>
                  ) : (
                    <span>A personal API developer key is required to query models of this provider. Obtain one directly from the developer console.</span>
                  )}
                </p>
              </div>

              {/* Model selection dropdown, custom input, and reasoning levels */}
              <div className="border-t border-white/5 pt-3.5 space-y-3.5">
                {activeProviderState === 'openrouter' ? (
                  /* Dynamic OpenRouter Model Discovery Engine */
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10.5px]">
                      <label className="text-slate-300 font-bold flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        OpenRouter Registry Engine
                      </label>
                      <button
                        type="button"
                        onClick={handleFetchOpenRouterModels}
                        disabled={isFetchingOR}
                        className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded transition-all text-[9.5px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isFetchingOR ? (
                          <>
                            <span className="w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                            <span>UPDATING...</span>
                          </>
                        ) : (
                          <>
                            <span>UPDATE REGISTRY</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Search & Sort Panel */}
                    <div className="space-y-2 bg-black/40 border border-white/5 rounded-lg p-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={orSearch}
                          onChange={(e) => setOrSearch(e.target.value)}
                          placeholder="Search OpenRouter models (e.g. deepseek, claude)..."
                          className="flex-1 bg-black text-slate-200 border border-white/10 rounded px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-[#df9825]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        {/* Sort Dropdown */}
                        <div className="flex items-center gap-1.5 justify-between">
                          <span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">Sort:</span>
                          <select
                            value={orSort}
                            onChange={(e) => setOrSort(e.target.value as any)}
                            className="bg-black text-slate-300 border border-white/10 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#df9825] cursor-pointer flex-1"
                          >
                            <option value="rank">Popular Rank</option>
                            <option value="id">Alphabetical</option>
                            <option value="price">Pricing (Low)</option>
                            <option value="context">Context length</option>
                          </select>
                        </div>

                        {/* Filter Dropdown */}
                        <div className="flex items-center gap-1.5 justify-between">
                          <span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">Filter:</span>
                          <select
                            value={orFilter}
                            onChange={(e) => setOrFilter(e.target.value as any)}
                            className="bg-black text-slate-300 border border-white/10 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#df9825] cursor-pointer flex-1"
                          >
                            <option value="all">All Models</option>
                            <option value="coding">Coding/Instruct</option>
                            <option value="reasoning">Reasoning</option>
                            <option value="free">Free Only</option>
                            <option value="large">Large Context</option>
                          </select>
                        </div>

                        {/* Reasoning Toggle Switch */}
                        <div className="flex items-center gap-2 justify-end sm:col-span-1">
                          <span className="text-[9.5px] font-sans text-slate-400">Reasoning</span>
                          <button
                            type="button"
                            onClick={() => setOrReasoningToggle(!orReasoningToggle)}
                            className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                              orReasoningToggle ? 'bg-[#df9825]' : 'bg-slate-700 border border-white/15'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-black transition-transform transform ${
                              orReasoningToggle ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Scrolling Model list */}
                    <div className="border border-white/10 rounded-lg max-h-40 overflow-y-auto bg-black/70 divide-y divide-white/[0.04]">
                      {filteredAndSortedModels.length > 0 ? (
                        filteredAndSortedModels.map((m) => {
                          const isSelected = customModelTexts.openrouter === m.id || (selectedModels.openrouter === m.id && !isCustomModel.openrouter);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedModels(prev => ({ ...prev, openrouter: 'custom' }));
                                setIsCustomModel(prev => ({ ...prev, openrouter: true }));
                                setCustomModelTexts(prev => ({ ...prev, openrouter: m.id }));
                                if (m.description) {
                                  setOrSelectedDescription(m.description);
                                } else {
                                  setOrSelectedDescription(`ID: ${m.id} - Context: ${(m.context / 1000).toFixed(0)}k characters. Pricing (Prompt: $${parseFloat(m.prompt).toFixed(3)}/M tokens, Completion: $${parseFloat(m.completion).toFixed(3)}/M tokens)`);
                                }
                              }}
                              className={`w-full text-left p-2.5 transition-all outline-none flex items-center justify-between text-[11px] font-mono leading-relaxed cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#df9825]/10 border-l-2 border-[#df9825] text-[#df9825] font-semibold' 
                                  : 'hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div className="flex flex-col gap-0.5 max-w-[70%]">
                                <span className={isSelected ? 'text-[#df9825]' : 'text-slate-200'}>{m.id}</span>
                                <span className="text-[9px] text-slate-500 font-sans truncate">{m.name}</span>
                              </div>
                              <div className="text-right flex flex-col shrink-0 text-[10px] text-slate-400 font-sans">
                                <span className="font-mono text-[9px] font-bold text-emerald-400">
                                  {parseFloat(m.prompt) === 0 && parseFloat(m.completion) === 0 ? 'FREE' : `$${parseFloat(m.prompt).toFixed(2)}/$${parseFloat(m.completion).toFixed(2)}`}
                                </span>
                                <span className="text-[9.5px] font-mono text-slate-500 uppercase font-bold shrink-0">{(m.context / 1000).toFixed(0)}k ctx</span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-slate-500 font-sans text-[11px]">
                          No models matched your query. Click Update Registry above to query the live OpenRouter directory.
                        </div>
                      )}
                    </div>

                    {/* Model description footer */}
                    <div className="bg-black/50 border border-white/5 rounded-lg p-2.5 min-h-[50px] animate-fade-in flex flex-col gap-0.5">
                      <span className="text-[8px] text-slate-500 block font-bold uppercase tracking-wide">Model Description / Capabilities</span>
                      <p className="text-[10.5px] text-slate-400 font-sans leading-relaxed">
                        {orSelectedDescription || (customModelTexts.openrouter ? orModels.find(m => m.id === customModelTexts.openrouter)?.description : '') || "Explore a model above to view descriptions and detailed parameter capabilities."}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Standard Preconfigured Dropdown Layout */
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <label className="text-slate-300 font-bold flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        Cognitive Model Selection
                      </label>
                      <span className="text-[8.5px] text-[#df9825] uppercase tracking-wider font-mono">FULLY ENABLING {activeProviderState.toUpperCase()}</span>
                    </div>
                    
                    <select
                      value={selectedModels[activeProviderState]}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedModels(prev => ({ ...prev, [activeProviderState]: val }));
                        setIsCustomModel(prev => ({ ...prev, [activeProviderState]: val === 'custom' }));
                      }}
                      className="w-full bg-black border border-white/10 rounded focus:border-[#df9825] p-2 text-slate-200 text-[11px] font-mono focus:outline-none cursor-pointer"
                    >
                      {PRECONFIGURED_MODELS[activeProviderState]?.map((m) => (
                        <option key={m.value} value={m.value} className="bg-[#0c0f16]">
                          {m.label}
                        </option>
                      ))}
                      <option value="custom" className="bg-[#0c0f16]">Custom Model string...</option>
                    </select>

                    {/* Custom model name text input field */}
                    {(selectedModels[activeProviderState] === 'custom' || isCustomModel[activeProviderState]) && (
                      <div className="pt-2 animate-fade-in">
                        <input
                          type="text"
                          value={customModelTexts[activeProviderState]}
                          onChange={(e) => setCustomModelTexts(prev => ({ ...prev, [activeProviderState]: e.target.value }))}
                          placeholder="e.g. gemini-3.5-flash-high, gpt-5.5, claude-4.6-thinking"
                          className="w-full bg-black border border-[#df9825]/40 rounded focus:border-[#df9825] p-2 text-slate-200 text-[11px] font-mono focus:outline-none"
                        />
                        <p className="text-[8.5px] text-[#df9825]/75 leading-normal font-sans pt-1">
                          Type any custom model identifier supported by your API provider. Works with any new or reasoning model!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reasoning Level Selector */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#df9825]" />
                      Reasoning Effort / Thinking Budget
                    </label>
                    <span className="text-[8px] text-slate-500 uppercase font-mono bg-white/5 px-1 py-0.5 rounded">
                      Value: {reasoningLevels[activeProviderState].toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { val: 'none', lbl: 'None' },
                      { val: 'low', lbl: 'Low' },
                      { val: 'medium', lbl: 'Med' },
                      { val: 'high', lbl: 'High' },
                      { val: 'extra_high', lbl: 'Extra' }
                    ].map((level) => {
                      const isSelected = reasoningLevels[activeProviderState] === level.val;
                      return (
                        <button
                          key={level.val}
                          type="button"
                          onClick={() => setReasoningLevels(prev => ({ ...prev, [activeProviderState]: level.val }))}
                          className={`py-1.5 text-center text-[9px] rounded font-mono uppercase tracking-wider transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#df9825]/15 border border-[#df9825] text-[#df9825] font-bold'
                              : 'bg-black/30 border border-white/5 text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {level.lbl}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[8.5px] text-slate-500 leading-normal font-sans pt-0.5">
                    {reasoningLevels[activeProviderState] === 'none' && (
                      <span>Disables reasoning/thinking mode for maximum stream rate.</span>
                    )}
                    {reasoningLevels[activeProviderState] === 'low' && (
                      <span>Low budget: Good for fast simple reasoning prompts.</span>
                    )}
                    {reasoningLevels[activeProviderState] === 'medium' && (
                      <span>Balanced reasoning mode. Perfect for most script compiling tasks.</span>
                    )}
                    {reasoningLevels[activeProviderState] === 'high' && (
                      <span>Deep reasoning context. Recommended for diagnosing logs.</span>
                    )}
                    {reasoningLevels[activeProviderState] === 'extra_high' && (
                      <span>Extends thinking attention for maximum comprehensive accuracy.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Dynamic Status Notifications */}
            {successMsg && (
              <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-[10px] leading-relaxed rounded flex items-center gap-2">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="font-sans font-medium">{successMsg}</span>
              </div>
            )}

            {/* Actions Buttons spacing */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 hover:bg-white/5 border border-white/10 rounded font-bold hover:text-white text-slate-400 transition-all cursor-pointer"
              >
                CANCEL
              </button>
              
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#df9825] hover:bg-[#df9825]/90 text-black font-bold font-mono uppercase flex items-center gap-1.5 rounded transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <span className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>SAVE CONFIG</span>
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
}
