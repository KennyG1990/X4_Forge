/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lua-staleness detection — ROADMAP tool-improvement #7 (RC-killer class).
 *
 * X4 quickload re-parses MD but does NOT reliably reload ui/*.lua: the resident Lua can
 * be a version BEHIND disk, so the mod's MD and Lua halves silently run MISMATCHED
 * versions during F5/F9 iteration (cost x4_ai_influence ~4 ghost-chase reload cycles:
 * missing event fields, dead pollers). Detection needs two halves:
 *
 *   1. INSTRUMENT (deploy-time / opt-in): inject an idempotent boot marker at the top of
 *      each ui *.lua — `DebugError("[<PREFIX>] LUAV=<hash8>")` — where <hash8> is a
 *      fingerprint of the file body (marker lines excluded, so re-injection is stable).
 *      X4 stamps every DebugError as "[=ERROR=]", so the marker always reaches the log.
 *   2. ASSESS (watch-time): parse the debuglog tail for LUAV markers and compare the
 *      RESIDENT hash the game logged at boot vs the CURRENT on-disk hash. Mismatch ⇒
 *      "resident Lua ≠ deployed Lua — full X4 restart required" (quickload won't do).
 *
 * Verdicts are an honest tri-state per file: match / stale / unknown (no marker or not
 * seen in the log) — a mod that was never instrumented reports unknown, never a guess.
 *
 * House pattern: pure engine (no fs/network) + oracle + routes wired in server.ts.
 */

export const LUAV_COMMENT = '-- FORGE-LUAV';

/** FNV-1a 32-bit over the marker-stripped, newline-normalized source → 8 hex chars. */
export function luaVersionFingerprint(source: string): string {
  const body = stripLuaVersionMarker(String(source ?? '')).replace(/\r\n/g, '\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Remove any existing FORGE-LUAV marker block (comment + DebugError line). */
export function stripLuaVersionMarker(source: string): string {
  return String(source ?? '')
    .replace(/^[ \t]*-- FORGE-LUAV[^\n]*\n(?:[ \t]*DebugError\(\s*["'][^"'\n]*LUAV=[0-9a-f]{8}[^"'\n]*["']\s*\)[^\n]*\n)?/gm, '');
}

/**
 * Inject (or refresh) the boot marker as the first line(s) of the file. Idempotent:
 * the hash covers the marker-stripped body, so injecting twice yields identical output.
 * `prefix` should be the mod's log marker (e.g. "AICHAT") — uppercase conventional.
 */
export function injectLuaVersionMarker(source: string, prefix: string): { source: string; hash: string } {
  const clean = stripLuaVersionMarker(String(source ?? ''));
  const hash = luaVersionFingerprint(clean);
  const p = String(prefix || 'FORGE').replace(/[^A-Za-z0-9_]/g, '').toUpperCase() || 'FORGE';
  const marker = `${LUAV_COMMENT} ${hash} (auto-injected; do not edit — re-deploy regenerates)\nDebugError("[${p}] LUAV=${hash}")\n`;
  return { source: marker + clean, hash };
}

/** The hash the file DECLARES in its marker, if instrumented. */
export function declaredLuaVersion(source: string): string | null {
  const m = String(source ?? '').match(/LUAV=([0-9a-f]{8})/);
  return m ? m[1] : null;
}

/** Parse a debuglog tail for LUAV boot markers → prefix(lowercased) → last-seen hash. */
export function parseLogLuaMarkers(tail: string): Map<string, { hash: string; lastLineNo: number }> {
  const out = new Map<string, { hash: string; lastLineNo: number }>();
  const lines = String(tail ?? '').split(/\r?\n/);
  const re = /\[([A-Za-z][A-Za-z0-9_]{2,})\][^\n]*?LUAV=([0-9a-f]{8})/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) out.set(m[1].toLowerCase(), { hash: m[2], lastLineNo: i + 1 });
  }
  return out;
}

export interface LuaStalenessFileVerdict {
  path: string;
  diskHash: string;
  declaredHash: string | null;
  residentHash: string | null;
  verdict: 'match' | 'stale' | 'marker_drift' | 'unknown_not_instrumented' | 'unknown_not_in_log';
  detail: string;
}

export interface LuaStalenessAssessment {
  checked: number;
  instrumented: number;
  stale: number;
  verdicts: LuaStalenessFileVerdict[];
  /** true when at least one resident hash mismatches disk — full restart required */
  restartRequired: boolean;
  summary: string;
}

/**
 * Compare deployed disk Lua against the resident versions the log saw at boot.
 * `diskFiles` = the mod's ui *.lua files as read from the DEPLOYED folder.
 */
export function assessLuaStaleness(diskFiles: { path: string; source: string }[], logTail: string): LuaStalenessAssessment {
  const logMarkers = parseLogLuaMarkers(logTail);
  const verdicts: LuaStalenessFileVerdict[] = [];
  let instrumented = 0;
  let stale = 0;

  for (const f of diskFiles) {
    const declared = declaredLuaVersion(f.source);
    const diskHash = luaVersionFingerprint(f.source);
    if (!declared) {
      verdicts.push({
        path: f.path, diskHash, declaredHash: null, residentHash: null,
        verdict: 'unknown_not_instrumented',
        detail: `${f.path} has no FORGE-LUAV marker — staleness cannot be assessed. Instrument it (POST /api/agent/lua-staleness/instrument) or redeploy through the Forge.`,
      });
      continue;
    }
    instrumented++;
    if (declared !== diskHash) {
      // file was hand-edited AFTER instrumentation — its marker lies about the body
      verdicts.push({
        path: f.path, diskHash, declaredHash: declared, residentHash: null,
        verdict: 'marker_drift',
        detail: `${f.path}: FORGE-LUAV marker (${declared}) no longer matches the file body (${diskHash}) — the file was edited after instrumentation. Re-instrument so the next boot logs the true version.`,
      });
      continue;
    }
    // find a resident hash under any prefix whose logged hash matches or mismatches this file:
    // match by hash equality first (any prefix), else report the freshest prefix mismatch.
    let resident: string | null = null;
    for (const { hash } of logMarkers.values()) {
      if (hash === declared) { resident = hash; break; }
    }
    if (resident) {
      verdicts.push({
        path: f.path, diskHash, declaredHash: declared, residentHash: resident,
        verdict: 'match',
        detail: `${f.path}: resident Lua (${resident}) matches disk (${diskHash}).`,
      });
    } else if (logMarkers.size) {
      stale++;
      const freshest = [...logMarkers.values()].sort((a, b) => b.lastLineNo - a.lastLineNo)[0];
      verdicts.push({
        path: f.path, diskHash, declaredHash: declared, residentHash: freshest.hash,
        verdict: 'stale',
        detail: `${f.path}: RESIDENT Lua ≠ DEPLOYED Lua — the log's last boot marker is ${freshest.hash} but disk is ${diskHash}. X4 quickload does NOT reload ui/*.lua: a FULL game restart is required (the RC-killer ghost-chase class).`,
      });
    } else {
      verdicts.push({
        path: f.path, diskHash, declaredHash: declared, residentHash: null,
        verdict: 'unknown_not_in_log',
        detail: `${f.path}: instrumented (${declared}) but no LUAV marker appears in the log tail — the game hasn't booted this Lua since instrumentation (or the log rotated).`,
      });
    }
  }

  const restartRequired = stale > 0;
  return {
    checked: diskFiles.length,
    instrumented,
    stale,
    verdicts,
    restartRequired,
    summary: restartRequired
      ? `⚠ RESIDENT LUA STALE — ${stale} file(s) differ from disk; quickload will NOT pick them up. Full X4 restart required.`
      : instrumented === 0
        ? 'Lua staleness unknown — no instrumented files (no FORGE-LUAV markers).'
        : `Resident Lua consistent with disk for ${instrumented} instrumented file(s).`,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runLuaStalenessSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const lua = `local ffi = require("ffi")\nlocal function onBoot()\n  DebugError("[AICHAT][UIX] boot")\nend\nonBoot()\n`;

  // injection + idempotence
  const once = injectLuaVersionMarker(lua, 'AICHAT');
  const twice = injectLuaVersionMarker(once.source, 'AICHAT');
  ok('injects marker as first lines', once.source.startsWith(LUAV_COMMENT) && once.source.includes(`LUAV=${once.hash}`));
  ok('injection is idempotent (same hash, same output)', twice.hash === once.hash && twice.source === once.source, `${once.hash} vs ${twice.hash}`);
  ok('strip removes the whole marker block', stripLuaVersionMarker(once.source) === lua);
  ok('fingerprint is stable across CRLF/LF', luaVersionFingerprint(lua.replace(/\n/g, '\r\n')) === luaVersionFingerprint(lua));
  ok('declaredLuaVersion reads the marker', declaredLuaVersion(once.source) === once.hash);
  ok('declaredLuaVersion null when uninstrumented', declaredLuaVersion(lua) === null);

  // log parsing — real X4 shape: every DebugError line is stamped [=ERROR=]
  const bootLog = `[General] 12345.67 ======================================\n[=ERROR=] 12346.01 Error … [AICHAT] LUAV=${once.hash}\n[General] more\n`;
  const seen = parseLogLuaMarkers(bootLog);
  ok('parses LUAV marker from [=ERROR=]-stamped log line', seen.get('aichat')?.hash === once.hash, JSON.stringify([...seen]));

  // assessment verdicts
  const match = assessLuaStaleness([{ path: 'ui/x.lua', source: once.source }], bootLog);
  ok('match verdict when resident == disk', match.verdicts[0]?.verdict === 'match' && !match.restartRequired, match.summary);

  const edited = once.source.replace('onBoot()', 'onBoot() -- v2 edit') ;
  const reinjected = injectLuaVersionMarker(edited, 'AICHAT');
  const staleRes = assessLuaStaleness([{ path: 'ui/x.lua', source: reinjected.source }], bootLog);
  ok('stale verdict when log boot hash ≠ new disk hash', staleRes.verdicts[0]?.verdict === 'stale' && staleRes.restartRequired, staleRes.summary);
  ok('stale detail names the RC-killer restart requirement', staleRes.verdicts[0]?.detail.includes('FULL game restart'), staleRes.verdicts[0]?.detail);

  const drift = assessLuaStaleness([{ path: 'ui/x.lua', source: once.source.replace('onBoot()\n', 'onBoot()\nlocal z=1\n') }], bootLog);
  ok('marker_drift verdict when file edited after instrumentation', drift.verdicts[0]?.verdict === 'marker_drift', drift.verdicts[0]?.detail);

  const noInst = assessLuaStaleness([{ path: 'ui/x.lua', source: lua }], bootLog);
  ok('honest unknown when not instrumented', noInst.verdicts[0]?.verdict === 'unknown_not_instrumented' && !noInst.restartRequired);

  const noLog = assessLuaStaleness([{ path: 'ui/x.lua', source: once.source }], '');
  ok('honest unknown when log has no markers', noLog.verdicts[0]?.verdict === 'unknown_not_in_log' && !noLog.restartRequired);

  ok('degrades on empty input', assessLuaStaleness([], '').checked === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
