/**
 * Suite-level workspace guard (G14 follow-up, 2026-07-09).
 *
 * The dev server holds ONE live workspace. A fresh test-browser profile boots the app
 * with a default workspace that syncs itself to the server on load — so merely RUNNING
 * the e2e suite could clobber whatever the user had loaded (it reset a loaded
 * AI Influence workspace twice before this guard). globalSetup snapshots the server
 * workspace before any test; globalTeardown puts it back afterward, regardless of what
 * the tests (or the app under test) did in between.
 */
import fs from 'fs';
import path from 'path';

const SNAPSHOT = path.join(process.cwd(), 'test-results', '.pre-suite-workspace.json');
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

function bearer(): Record<string, string> {
  const token = fs.readFileSync(path.join(process.cwd(), '.studio-api-token'), 'utf8').trim();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function captureWorkspace(): Promise<void> {
  const res = await fetch(`${BASE}/api/agent/workspace`, { headers: bearer() });
  if (!res.ok) return; // no server / no workspace — nothing to guard
  const data = await res.json();
  if (!data?.workspace) return;
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(data.workspace), 'utf8');
}

export async function restoreWorkspace(): Promise<void> {
  if (!fs.existsSync(SNAPSHOT)) return;
  const workspace = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  await fetch(`${BASE}/api/agent/workspace`, {
    method: 'POST',
    headers: bearer(),
    body: JSON.stringify({ workspace }),
  }).catch(() => { /* server gone — nothing to restore onto */ });
  fs.unlinkSync(SNAPSHOT);
}

export default captureWorkspace;
