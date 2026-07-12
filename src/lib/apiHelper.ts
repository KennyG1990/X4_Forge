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

/**
 * Audit #3 (2026-07-10): provider keys live SERVER-SIDE (data/ai-keys.json), never in the
 * browser. The client tracks only WHICH providers are configured (boolean cache below);
 * key values are write-only via POST /api/ai/keys. Existing localStorage keys migrate
 * silently on boot (migrateLocalAiKeys) and are removed from the browser.
 */
let aiKeyStatusCache: Record<string, boolean> = {};

export async function refreshAiKeyStatus(): Promise<void> {
  try {
    const r = await fetch('/api/ai/keys/status');
    if (r.ok) aiKeyStatusCache = (await r.json()).status || {};
  } catch { /* keep last known */ }
}

/** Synchronous render-time gate: is a key configured (server-side) for this provider? */
export function hasProviderKey(provider: AIProviderId): boolean {
  return !!aiKeyStatusCache[provider];
}

export function setProviderKey(provider: AIProviderId, key: string): void {
  // fire-and-forget server write; status cache updates from the response
  fetch('/api/ai/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key: key.trim() }),
  }).then(async r => { if (r.ok) aiKeyStatusCache = (await r.json()).status || aiKeyStatusCache; })
    .catch(() => { /* status refresh will catch up */ });
  // never keep a browser-side copy
  localStorage.removeItem(`user_${provider}_key`);
}

/** One-time boot migration: move any legacy localStorage keys to the server, then purge. */
export async function migrateLocalAiKeys(): Promise<void> {
  const providers: AIProviderId[] = ['gemini', 'claude', 'openai', 'openrouter'];
  for (const p of providers) {
    const legacy = localStorage.getItem(`user_${p}_key`);
    if (legacy !== null && !legacy.trim()) {
      // empty husk from the old modal saving blanks — nothing to migrate, just purge
      localStorage.removeItem(`user_${p}_key`);
      continue;
    }
    if (legacy && legacy.trim()) {
      try {
        const r = await fetch('/api/ai/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: p, key: legacy.trim() }),
        });
        if (r.ok) localStorage.removeItem(`user_${p}_key`);
      } catch { /* retry next boot; key stays local until migrated */ }
    }
  }
  await refreshAiKeyStatus();
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
  const model = getProviderModel(provider);
  const reasoning = getProviderReasoning(provider);

  // Audit #3: the browser no longer ships key material — the server resolves the stored
  // key (or its .env fallback) for app-UI requests. x-custom-api-key remains supported
  // server-side for external agents only.
  return {
    'Content-Type': 'application/json',
    'x-ai-provider': provider,
    'x-ai-model': model,
    'x-ai-reasoning': reasoning
  };
}

/**
 * Audit #4 (2026-07-10): fetch + ok-check + JSON in one call. The known ugly path this
 * fixes: during API restarts the vite proxy answers with HTML, and blind `r.json()`
 * surfaces "SyntaxError: Unexpected token '<'" to the user. This returns the server's
 * real error message when there is one, and a human sentence when there isn't.
 */
export async function fetchJson<T = any>(url: string, init?: RequestInit, defaultError = "Request failed."): Promise<T> {
  const response = await fetch(url, init);
  return handleApiResponse<T>(response, defaultError);
}

export async function handleApiResponse<T = any>(response: Response, defaultError = "API request failed."): Promise<T> {
  if (!response.ok) {
    let errMsg = defaultError;
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType && contentType.includes("application/json")) {
      try {
        const data = await response.json();
        errMsg = data.error || errMsg;
      } catch {
        // failed to parse JSON
      }
    } else {
      try {
        const text = await response.text();
        if (text && text.length < 500 && !text.trim().startsWith("<!doctype") && !text.trim().startsWith("<html") && !text.trim().startsWith("<!DOCTYPE")) {
          errMsg = text.trim();
        } else {
          errMsg = `HTTP Error ${response.status}: ${response.statusText || "Unresolved"}`;
        }
      } catch {
        errMsg = `HTTP Error ${response.status}: ${response.statusText || "Unresolved"}`;
      }
    }
    if (errMsg.toLowerCase().includes("quota") || errMsg.toUpperCase().includes("RESOURCE_EXHAUSTED") || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("quota limit") || errMsg.toLowerCase().includes("exceeded")) {
      errMsg = `⚠️ Free Tier AI Quota Exceeded (20 requests/day limit reached on our public key). Please click the amber "AI ENGINE" button in the top-right header and paste your own Gemini, Anthropic, or OpenAI Key to continue without any rate limits!`;
    } else if (errMsg.toLowerCase().includes("key is not configured") || errMsg.toLowerCase().includes("api key is not configured") || errMsg.toLowerCase().includes("api key not found")) {
      errMsg = `🔑 AI Connection Key required. Please click the amber "AI ENGINE" button in the top-right header and supply your API Key to enable automated cognitive mod assistant generation!`;
    }
    throw new Error(errMsg);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType && !contentType.includes("application/json")) {
    throw new Error("Server response was not JSON.");
  }
  
  return await response.json() as T;
}
