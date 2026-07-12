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
  const posted = await fetch(`${BASE}/api/agent/workspace`, {
    method: 'POST',
    headers: bearer(),
    // B2s3 legacy gate: a guard restore is a deliberate overwrite by definition.
    body: JSON.stringify({ workspace, force: true }),
  }).catch(() => null); // server gone — nothing to restore onto
  // B26: SELF-CHECK — a guard that restores without verifying is a guard that can fail
  // silently (the manual post-run GET was the only thing catching leak class #70).
  // Mismatch prints a parseable marker; scripts/run-e2e.mjs turns it into a red verdict.
  if (posted) {
    try {
      const res = await fetch(`${BASE}/api/agent/workspace`, { headers: bearer() });
      const data = await res.json();
      const got = JSON.stringify(data?.workspace ?? null);
      const want = JSON.stringify(workspace);
      if (got === want) {
        console.log(`[workspace-guard] RESTORE-VERIFY: OK ("${workspace?.name}" byte-matches the pre-suite snapshot)`);
      } else {
        console.error(`[workspace-guard] RESTORE-VERIFY: FAIL — server holds "${data?.workspace?.name}" (${got.length}B), snapshot was "${workspace?.name}" (${want.length}B). The live workspace may be leaked test state.`);
      }
    } catch (e) {
      console.error(`[workspace-guard] RESTORE-VERIFY: FAIL — could not re-read the workspace after restore: ${(e as Error).message}`);
    }
  }
  fs.unlinkSync(SNAPSHOT);
}

export default captureWorkspace;
