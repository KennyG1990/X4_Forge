/**
 * B31s2 — helpers for the EPHEMERAL e2e stack (see playwright.config.ts).
 *
 * Specs seed the ephemeral server's workspace directly over its API and then let the
 * app adopt it naturally on page load — no page.route interception, no localStorage
 * version pinning, no restore/teardown. The live dev stack is never touched.
 */
import { E2E_API_PORT, E2E_TOKEN } from '../../playwright.config';

// B41: 127.0.0.1, never "localhost" — the API binds IPv4-only (server.ts listen)
// and resolver family order varies per run on Windows (see playwright.config note).
const API = `http://127.0.0.1:${E2E_API_PORT}`;

/** Force-set the ephemeral server's active workspace (deliberate overwrite by design). */
export async function seedServerWorkspace(workspace: unknown): Promise<void> {
  const res = await fetch(`${API}/api/agent/workspace`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${E2E_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace, force: true }),
  });
  if (!res.ok) throw new Error(`ephemeral seed failed: ${res.status} ${await res.text()}`);
}

/** Read the ephemeral server's active workspace (for assertions on synced state). */
export async function readServerWorkspace(): Promise<any> {
  const res = await fetch(`${API}/api/agent/workspace`, {
    headers: { Authorization: `Bearer ${E2E_TOKEN}` },
  });
  if (!res.ok) throw new Error(`ephemeral read failed: ${res.status}`);
  const data = await res.json();
  return data.workspace;
}
