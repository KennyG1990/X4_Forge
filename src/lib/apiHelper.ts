/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AIProviderId = 'gemini' | 'claude' | 'openai' | 'openrouter';

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  description: string;
  placeholderKey: string;
  defaultModel: string;
}

export const AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Use Google Gemini models for generating and analyzing X4 Mod schemas.',
    placeholderKey: 'AI_API_... (usually starts with AIza)',
    defaultModel: 'gemini-3.5-flash'
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Use Anthropic Claude models for high fidelity script structure synthesis.',
    placeholderKey: 'sk-ant-ap03-...',
    defaultModel: 'claude-4-6-sonnet-latest'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT/Codex',
    description: 'Use OpenAI models for processing logical game state translations.',
    placeholderKey: 'sk-proj-...',
    defaultModel: 'gpt-5.5'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter AI',
    description: 'Use OpenRouter to fetch, filter, and compile mods with the latest cutting-edge AI models.',
    placeholderKey: 'sk-or-v1-...',
    defaultModel: 'google/gemini-2.5-flash'
  }
];

export function getActiveProvider(): AIProviderId {
  const stored = localStorage.getItem('active_ai_provider');
  if (stored === 'claude' || stored === 'openai' || stored === 'gemini' || stored === 'openrouter') {
    return stored;
  }
  return 'gemini';
}

export function setActiveProvider(provider: AIProviderId): void {
  localStorage.setItem('active_ai_provider', provider);
}

export function getProviderKey(provider: AIProviderId): string {
  return localStorage.getItem(`user_${provider}_key`) || '';
}

export function setProviderKey(provider: AIProviderId, key: string): void {
  localStorage.setItem(`user_${provider}_key`, key.trim());
}

export function getProviderModel(provider: AIProviderId): string {
  const stored = localStorage.getItem(`user_${provider}_model`);
  if (stored) return stored;
  // Default values
  if (provider === 'gemini') return 'gemini-3.5-flash';
  if (provider === 'claude') return 'claude-4-6-sonnet-latest';
  if (provider === 'openai') return 'gpt-5.5';
  if (provider === 'openrouter') return 'google/gemini-2.5-flash';
  return '';
}

export function setProviderModel(provider: AIProviderId, model: string): void {
  localStorage.setItem(`user_${provider}_model`, model.trim());
}

export function getProviderReasoning(provider: AIProviderId): string {
  return localStorage.getItem(`user_${provider}_reasoning`) || 'none';
}

export function setProviderReasoning(provider: AIProviderId, level: string): void {
  localStorage.setItem(`user_${provider}_reasoning`, level);
}

export function getAIHeaders(): Record<string, string> {
  const provider = getActiveProvider();
  const key = getProviderKey(provider);
  const model = getProviderModel(provider);
  const reasoning = getProviderReasoning(provider);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-ai-provider': provider,
    'x-ai-model': model,
    'x-ai-reasoning': reasoning
  };
  
  if (key) {
    headers['x-custom-api-key'] = key;
  }
  
  return headers;
}
