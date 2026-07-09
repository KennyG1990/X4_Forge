/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stale-source deploy gate (P0, 2026-07-09 — the stale-canvas incident).
 *
 * RECONCILE NOTE (why this module is SMALL): the "fidelity-first emit" half of the P0 —
 * emit original bytes for files whose graph is untouched — ALREADY EXISTS and works:
 * `importModFolder` fills `ws.originalFiles` (content + per-stem node fingerprint) and
 * `applyOriginalModeledFiles` restores the original bytes at the end of
 * `buildWorkspaceFileManifest` whenever the fingerprint still matches. Headless proof
 * 2026-07-09: fresh import → compile emits ai_influence_combat.xml byte-faithful, SPEC #66
 * comments intact. Do not rebuild that. What was MISSING — and what let one wizard click
 * regenerate 8 md files from an ancient browser graph — is a WRITE-TIME check that the
 * canvas's idea of the mod still matches the mod on disk:
 *
 *   server restart → `workspaceVersion` reset → client adoption gate (`version > storedVer`)
 *   closed → browser kept a pre-SPEC-#66 localStorage graph (with equally stale
 *   originalFiles) → UI deploy sent it → nothing compared it against the newer disk state
 *   → newer truth overwritten by an older drawing.
 *
 * This module is that check, pure logic (house pattern): a workspace is STAMPED at import
 * with a content-keyed hash of its source folder; at deploy time the hash is recomputed
 * from disk and a mismatch BLOCKS the write unless explicitly overridden. Content-keyed
 * (per-file sha1 from `fingerprintModFolder`) so our own byte-identical re-deploys never
 * invalidate the stamp — only a real content change (another session, git restore, an
 * agent edit) trips it.
 */

export interface FingerprintEntryLike {
  path: string;
  /** per-file CONTENT hash (sha1) — preferred key: byte-identical rewrites keep the folder
   * hash stable, so deploying unchanged content never invalidates the stamp. */
  hash?: string;
  size?: number;
  mtimeMs?: number;
}

export interface WorkspaceSourceStamp {
  dir: string;
  hash: string;
  at: string; // ISO timestamp of the import
}

/** Order-independent stable hash over folder file fingerprints (path + content hash,
 * falling back to size/mtime when a content hash is unavailable). */
export function hashFolderFingerprint(entries: FingerprintEntryLike[]): string {
  const lines = (entries || [])
    .map(e => `${String(e.path).replace(/\\/g, '/').toLowerCase()}|${e.hash ?? `${e.size ?? 0}:${Math.round(e.mtimeMs ?? 0)}`}`)
    .sort();
  // FNV-1a 32-bit ×2 (different seeds) — deterministic, dependency-free, collision-safe
  // enough for "did anything in this folder change" (not a security boundary).
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x811c9dc5;
  const text = lines.join('\n');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}:${lines.length}`;
}

export interface SourceSyncVerdict {
  ok: boolean;
  reason: 'in_sync' | 'no_stamp' | 'source_missing' | 'source_changed' | 'override';
  detail: string;
}

/** Decide whether a workspace may be written over its source folder. */
export function assessSourceSync(
  stamp: WorkspaceSourceStamp | undefined | null,
  currentHash: string | null,
  allowStaleOverwrite: boolean,
): SourceSyncVerdict {
  if (allowStaleOverwrite) {
    return { ok: true, reason: 'override', detail: 'allowStaleOverwrite=true — caller explicitly accepted overwriting a changed source.' };
  }
  if (!stamp || !stamp.hash) {
    return {
      ok: true, reason: 'no_stamp',
      detail: 'Workspace has no source stamp (created in-canvas or imported before stamping) — gate not applicable.',
    };
  }
  if (currentHash === null) {
    return { ok: true, reason: 'source_missing', detail: `Source folder "${stamp.dir}" not found on disk — nothing newer to protect.` };
  }
  if (currentHash === stamp.hash) {
    return { ok: true, reason: 'in_sync', detail: `Source unchanged since import (${stamp.at}).` };
  }
  return {
    ok: false, reason: 'source_changed',
    detail: `The mod folder on disk changed AFTER this canvas imported it (${stamp.at}). Deploying would overwrite newer files with an older graph — this exact mechanism destroyed SPEC #66 work on 2026-07-09. Re-import the mod (safe), or pass allowStaleOverwrite:true to force.`,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runCompileFidelitySelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  // fingerprint hash: order-independent, CONTENT-keyed, rewrite-stable
  const fpA = [{ path: 'md/a.xml', hash: 'aaa1' }, { path: 'md/b.xml', hash: 'bbb2' }];
  const fpB = [fpA[1], fpA[0]]; // reordered
  ok('fingerprint_order_independent', hashFolderFingerprint(fpA) === hashFolderFingerprint(fpB));
  ok('fingerprint_detects_content_change', hashFolderFingerprint(fpA) !== hashFolderFingerprint([{ path: 'md/a.xml', hash: 'aaa1-edited' }, fpA[1]]));
  ok('fingerprint_detects_new_file', hashFolderFingerprint(fpA) !== hashFolderFingerprint([...fpA, { path: 'md/c.xml', hash: 'ccc3' }]));
  ok('fingerprint_detects_deleted_file', hashFolderFingerprint(fpA) !== hashFolderFingerprint([fpA[0]]));
  ok('fingerprint_identical_rewrite_stable_despite_mtime',
    hashFolderFingerprint([{ path: 'md/a.xml', hash: 'aaa1', mtimeMs: 1 }]) === hashFolderFingerprint([{ path: 'md/a.xml', hash: 'aaa1', mtimeMs: 999 }]));
  ok('fingerprint_windows_path_normalized', hashFolderFingerprint([{ path: 'md\\a.xml', hash: 'aaa1' }])
    === hashFolderFingerprint([{ path: 'md/a.xml', hash: 'aaa1' }]));
  ok('fingerprint_fallback_without_content_hash', hashFolderFingerprint([{ path: 'x', size: 10, mtimeMs: 5 }])
    !== hashFolderFingerprint([{ path: 'x', size: 11, mtimeMs: 5 }]));
  ok('fingerprint_empty_folder_stable', hashFolderFingerprint([]) === hashFolderFingerprint([]));

  // source-sync verdicts
  const stamp = { dir: 'x4_ai_influence', hash: hashFolderFingerprint(fpA), at: '2026-07-09T00:00:00Z' };
  ok('sync_in_sync_ok', assessSourceSync(stamp, hashFolderFingerprint(fpA), false).ok === true);
  const changed = assessSourceSync(stamp, hashFolderFingerprint([{ path: 'md/a.xml', hash: 'CHANGED' }, fpA[1]]), false);
  ok('sync_changed_source_BLOCKS (the incident class)', changed.ok === false && changed.reason === 'source_changed', changed);
  ok('sync_override_allows_but_is_named', assessSourceSync(stamp, 'whatever', true).reason === 'override');
  ok('sync_no_stamp_allows_legacy_workspaces', assessSourceSync(undefined, 'x', false).reason === 'no_stamp');
  ok('sync_missing_folder_allows', assessSourceSync(stamp, null, false).reason === 'source_missing');
  ok('sync_empty_hash_stamp_treated_as_no_stamp', assessSourceSync({ dir: 'x', hash: '', at: '' }, 'x', false).reason === 'no_stamp');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
