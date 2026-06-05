/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AIProviderId = 'gemini' | 'claude' | 'openai';

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
    defaultModel: 'claude-3-5-sonnet-latest'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT/Codex',
    description: 'Use OpenAI models for processing logical game state translations.',
    placeholderKey: 'sk-proj-...',
    defaultModel: 'gpt-4o'
  }
];

export function getActiveProvider(): AIProviderId {
  const stored = localStorage.getItem('active_ai_provider');
  if (stored === 'claude' || stored === 'openai' || stored === 'gemini') {
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

export function getAIHeaders(): Record<string, string> {
  const provider = getActiveProvider();
  const key = getProviderKey(provider);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-ai-provider': provider
  };
  
  if (key) {
    headers['x-custom-api-key'] = key;
  }
  
  return headers;
}
