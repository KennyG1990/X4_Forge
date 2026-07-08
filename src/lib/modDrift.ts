/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mod copy DRIFT detection — "drift as first-class state" (2026-07-09 design review).
 *
 * The observed failure class: a mod exists as a WORKSPACE copy (modWorkspacePath) and a
 * DEPLOYED copy (extensions dir), development happens in one, and the other silently
 * rots — ROADMAP #5 ("the F:-side copy silently goes stale"), and the 2026-07-09 audit
 * found exactly that on x4_ai_influence (deployed = canon, workspace = stale with real
 * wiring errors). Nothing in the tool SAID so. This engine makes the comparison a
 * deterministic, always-available verdict instead of tribal knowledge.
 *
 * Pure: takes two file-fingerprint sets (path → content hash + mtime + size), returns
 * per-file states (identical / differs / only-in-X) with newer-side attribution by
 * mtime, plus an overall verdict and an honest canon HINT (never a guess dressed as
 * fact: mtime says which side is newer, not which side is right).
 *
 * House pattern: pure engine + oracle + endpoint (server does the fs fingerprinting).
 */

export interface FileFingerprint {
  /** mod-relative path, forward slashes */
  path: string;
  /** content hash (any stable algo — server uses sha1) */
  hash: string;
  mtimeMs: number;
  size: number;
}

export interface DriftFileState {
  path: string;
  state: 'identical' | 'differs' | 'only_a' | 'only_b';
  /** for `differs`: which side has the newer mtime */
  newer?: 'a' | 'b' | 'same_time';
  aMtimeMs?: number;
  bMtimeMs?: number;
}

export interface DriftReport {
  labelA: string;
  labelB: string;
  filesA: number;
  filesB: number;
  identical: number;
  differing: number;
  onlyA: number;
  onlyB: number;
  files: DriftFileState[];
  verdict: 'identical' | 'drifted';
  /** which side mtimes say is ahead overall (majority of differing files) */
  newerSide: 'a' | 'b' | 'mixed' | 'none';
  summary: string;
}

export function compareModCopies(
  a: FileFingerprint[],
  b: FileFingerprint[],
  labelA = 'workspace',
  labelB = 'deployed',
): DriftReport {
  const mapA = new Map(a.map(f => [f.path.toLowerCase(), f]));
  const mapB = new Map(b.map(f => [f.path.toLowerCase(), f]));
  const allPaths = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();

  const files: DriftFileState[] = [];
  let identical = 0, differing = 0, onlyA = 0, onlyB = 0, newerA = 0, newerB = 0;

  for (const p of allPaths) {
    const fa = mapA.get(p);
    const fb = mapB.get(p);
    if (fa && fb) {
      if (fa.hash === fb.hash) {
        identical++;
        files.push({ path: fa.path, state: 'identical' });
      } else {
        differing++;
        const newer = fa.mtimeMs > fb.mtimeMs ? 'a' : fb.mtimeMs > fa.mtimeMs ? 'b' : 'same_time';
        if (newer === 'a') newerA++; else if (newer === 'b') newerB++;
        files.push({ path: fa.path, state: 'differs', newer, aMtimeMs: fa.mtimeMs, bMtimeMs: fb.mtimeMs });
      }
    } else if (fa) {
      onlyA++;
      files.push({ path: fa.path, state: 'only_a' });
    } else if (fb) {
      onlyB++;
      files.push({ path: fb.path, state: 'only_b' });
    }
  }

  const drifted = differing > 0 || onlyA > 0 || onlyB > 0;
  const newerSide: DriftReport['newerSide'] = !differing ? 'none'
    : newerA > 0 && newerB > 0 ? 'mixed'
      : newerA > 0 ? 'a' : newerB > 0 ? 'b' : 'none';

  const summary = !drifted
    ? `The ${labelA} and ${labelB} copies are IDENTICAL (${identical} files).`
    : `DRIFT: ${differing} file(s) differ` +
      (onlyA ? `, ${onlyA} only in ${labelA}` : '') +
      (onlyB ? `, ${onlyB} only in ${labelB}` : '') +
      (newerSide === 'a' ? `. Mtimes say the ${labelA} copy is ahead — it is probably canon.`
        : newerSide === 'b' ? `. Mtimes say the ${labelB} copy is ahead — it is probably canon.`
          : newerSide === 'mixed' ? `. Mtimes point BOTH ways — the copies have forked; reconcile by hand before trusting either.`
            : '.') +
      ` (Mtime is a hint, not proof — decide canon deliberately, then sync.)`;

  return {
    labelA, labelB,
    filesA: a.length, filesB: b.length,
    identical, differing, onlyA, onlyB,
    files,
    verdict: drifted ? 'drifted' : 'identical',
    newerSide,
    summary,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runModDriftSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const f = (path: string, hash: string, mtimeMs = 1000, size = 10): FileFingerprint => ({ path, hash, mtimeMs, size });

  // identical copies
  const same = compareModCopies(
    [f('content.xml', 'h1'), f('md/a.xml', 'h2')],
    [f('content.xml', 'h1'), f('md/a.xml', 'h2')],
  );
  ok('identical copies → verdict identical', same.verdict === 'identical' && same.identical === 2 && same.newerSide === 'none', same.summary);

  // deployed ahead (the ROADMAP #5 shape: dev iterated in extensions/, workspace rotted)
  const stale = compareModCopies(
    [f('content.xml', 'h1', 1000), f('md/a.xml', 'OLD', 1000)],
    [f('content.xml', 'h1', 1000), f('md/a.xml', 'NEW', 9000), f('ui/x.lua', 'h3', 9000)],
  );
  ok('workspace-stale shape → drifted, deployed newer', stale.verdict === 'drifted' && stale.newerSide === 'b' && stale.onlyB === 1, stale.summary);
  ok('summary names probable canon without overclaiming',
    stale.summary.includes('probably canon') && stale.summary.includes('hint, not proof'), stale.summary);
  ok('per-file newer attribution', stale.files.find(x => x.path === 'md/a.xml')?.newer === 'b');

  // forked copies (edits both sides) — must say MIXED, never pick a side
  const forked = compareModCopies(
    [f('md/a.xml', 'A2', 9000), f('md/b.xml', 'B1', 1000)],
    [f('md/a.xml', 'A1', 1000), f('md/b.xml', 'B2', 9000)],
  );
  ok('forked copies → newerSide mixed + reconcile warning', forked.newerSide === 'mixed' && forked.summary.includes('forked'), forked.summary);

  // path-case insensitivity (Windows) + one-sided files
  const cased = compareModCopies([f('MD/A.xml', 'h1')], [f('md/a.xml', 'h1')]);
  ok('path comparison is case-insensitive (Windows)', cased.verdict === 'identical', cased.summary);
  const oneSided = compareModCopies([f('md/a.xml', 'h1')], []);
  ok('one-sided copy reports only_a', oneSided.onlyA === 1 && oneSided.verdict === 'drifted');

  // degradation
  ok('empty inputs degrade to identical-empty', compareModCopies([], []).verdict === 'identical');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
