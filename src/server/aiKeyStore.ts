/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side AI provider key store (audit roadmap #3, 2026-07-10).
 *
 * Previously the browser held provider keys in PLAINTEXT localStorage and shipped them on
 * every AI request via x-custom-api-key — any XSS, malicious extension, or shared-machine
 * user could read them. Keys now live server-side in `data/ai-keys.json` (the data/ dir is
 * git- and watcher-ignored), same trust boundary as `.studio-api-token`. The client can
 * WRITE a key and read WHICH providers are configured — never the values.
 *
 * Precedence at call time (see callMultiProviderAI): explicit x-custom-api-key header
 * (external agents + one legacy round) → stored key (app-UI requests only — agents must
 * not spend the user's credits, same rule as the .env fallback) → .env key (app-UI only).
 */

import * as fs from "fs";
import * as path from "path";

export const AI_KEY_PROVIDERS = ["gemini", "claude", "openai", "openrouter"] as const;
export type AiKeyProvider = (typeof AI_KEY_PROVIDERS)[number];

const STORE_PATH = path.join(process.cwd(), "data", "ai-keys.json");

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getStoredAiKey(provider: string): string {
  if (!AI_KEY_PROVIDERS.includes(provider as AiKeyProvider)) return "";
  const v = readStore()[provider];
  return typeof v === "string" ? v : "";
}

/** Empty/whitespace key deletes the entry. Returns the new configured-status map. */
export function setStoredAiKey(provider: string, key: string): Record<string, boolean> {
  if (!AI_KEY_PROVIDERS.includes(provider as AiKeyProvider)) {
    throw new Error(`Unknown AI provider "${provider}". Valid: ${AI_KEY_PROVIDERS.join(", ")}`);
  }
  const store = readStore();
  const trimmed = String(key || "").trim();
  if (trimmed) store[provider] = trimmed;
  else delete store[provider];
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  return aiKeyStatus();
}

/** Which providers have a key — booleans only, values never leave the server. */
export function aiKeyStatus(): Record<string, boolean> {
  const store = readStore();
  const status: Record<string, boolean> = {};
  for (const p of AI_KEY_PROVIDERS) status[p] = typeof store[p] === "string" && store[p].length > 0;
  return status;
}
