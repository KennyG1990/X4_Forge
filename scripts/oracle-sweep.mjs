#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * oracle-sweep.mjs — hit every deterministic selftest ("house") oracle in one run.
 *
 * WHY: the project's discipline is that each feature ships a pure engine + a
 * run*Selftest() oracle exposed as a public GET. Until now those were checked one at
 * a time in the browser; this sweeps them all and fails loudly on any red — the single
 * command that catches a regression in any house.
 *
 * NO HARDCODED LIST: the set of endpoints is PARSED from server.ts's PUBLIC_READONLY_GETS
 * allowlist (every entry ending in `-selftest`). So when a new house is added and
 * correctly allowlisted, the sweep picks it up automatically — and if someone adds a
 * route WITHOUT allowlisting it (the classic 401 gotcha), it simply won't appear here,
 * which is itself a signal to check the allowlist.
 *
 * USAGE:
 *   node scripts/oracle-sweep.mjs            # sweep against http://localhost:3001
 *   X4_FORGE_BASE=http://localhost:3000 node scripts/oracle-sweep.mjs   # via Vite proxy
 *   node scripts/oracle-sweep.mjs --list     # dry run: just print the discovered endpoints
 *   node scripts/oracle-sweep.mjs --json     # machine-readable summary
 *
 * EXIT: 0 if every oracle is green; 1 if any is red, unreachable, or the list is empty.
 *
 * NOTE: run this on the HOST (where the dev server listens). The agent sandbox cannot
 * reach the host's localhost, and its mounted copy of server.ts can be truncated (the
 * documented H1 fragility) — so the host is authoritative for both the parse and the fetch.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE = (process.env.X4_FORGE_BASE || "http://localhost:3001").replace(/\/+$/, "");
const LIST_ONLY = process.argv.includes("--list");
const JSON_OUT = process.argv.includes("--json");
const TIMEOUT_MS = Number(process.env.X4_FORGE_TIMEOUT_MS || 20000);

/** B27: preferred discovery — ask the RUNNING server for its own oracle board (the
 *  same set registration writes). Falls back to source parsing when the app is down. */
async function discoverViaIndex() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${BASE}/api/agent/selftest-index`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.selftests) || data.selftests.length === 0) return null;
    return data.selftests;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Extract the `/agent/...-selftest` entries from server.ts's PUBLIC_READONLY_GETS set. */
function discoverSelftestPaths() {
  const serverPath = path.join(ROOT, "server.ts");
  if (!fs.existsSync(serverPath)) {
    throw new Error(`server.ts not found at ${serverPath} (run from the repo root).`);
  }
  const text = fs.readFileSync(serverPath, "utf8");
  const open = text.indexOf("PUBLIC_READONLY_GETS");
  if (open < 0) throw new Error("PUBLIC_READONLY_GETS not found in server.ts.");
  // bound to the Set([...]) literal that follows
  const start = text.indexOf("[", open);
  const end = text.indexOf("]", start);
  if (start < 0 || end < 0) throw new Error("Could not bound the PUBLIC_READONLY_GETS array.");
  const block = text.slice(start, end);
  const paths = [...block.matchAll(/["'`](\/agent\/[a-z0-9-]*selftest)["'`]/gi)].map(m => m[1]);

  // Registry-migrated oracles (audit R1) never appear as /agent/ literals — they are
  // SELFTESTS map keys registered at runtime. Blind spot found 2026-07-11: the sweep
  // silently missed the whole registry cohort (~30 oracles) since the migration. Parse
  // the map keys too: `"<name>-selftest": fn`.
  const mapOpen = text.indexOf("const SELFTESTS");
  if (mapOpen >= 0) {
    const mapStart = text.indexOf("{", mapOpen);
    const mapEnd = text.indexOf("};", mapStart);
    if (mapStart >= 0 && mapEnd >= 0) {
      const mapBlock = text.slice(mapStart, mapEnd);
      for (const m of mapBlock.matchAll(/["']([a-z0-9-]*selftest)["']\s*:/gi)) {
        paths.push(`/agent/${m[1]}`);
      }
    }
  }
  return [...new Set(paths)].sort();
}

async function hitOne(p) {
  const url = `${BASE}/api${p}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const status = res.status;
    let body = null;
    try { body = await res.json(); } catch { /* non-json */ }
    // shape variance: newer houses return {allPassed, passed, total}; older return {pass}.
    const green = body ? (body.allPassed ?? body.pass ?? false) : false;
    const passed = body?.passed;
    const total = body?.total;
    return { path: p, status, green: status === 200 && !!green, passed, total,
      error: status !== 200 ? (body?.error || `HTTP ${status}`) : (green ? null : "oracle reported failure") };
  } catch (e) {
    return { path: p, status: 0, green: false, error: e?.name === "AbortError" ? "timeout" : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let paths = await discoverViaIndex();
  let via = "runtime index";
  if (!paths) {
    via = "source parse (server unreachable — fallback)";
    try { paths = discoverSelftestPaths(); }
    catch (e) { console.error(`[oracle-sweep] ${e.message}`); process.exit(1); }
  }
  console.error(`[oracle-sweep] discovery: ${via}`);

  if (paths.length === 0) { console.error("[oracle-sweep] No *-selftest endpoints discovered — check PUBLIC_READONLY_GETS."); process.exit(1); }

  if (LIST_ONLY) {
    if (JSON_OUT) console.log(JSON.stringify({ base: BASE, count: paths.length, paths }, null, 2));
    else { console.log(`[oracle-sweep] ${paths.length} selftest endpoints discovered:`); for (const p of paths) console.log(`  ${p}`); }
    process.exit(0);
  }

  console.error(`[oracle-sweep] sweeping ${paths.length} oracles against ${BASE} ...`);
  const results = [];
  for (const p of paths) results.push(await hitOne(p)); // sequential: gentle on the dev server

  const red = results.filter(r => !r.green);
  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, total: results.length, green: results.length - red.length, red: red.length, results }, null, 2));
  } else {
    for (const r of results) {
      const tally = (r.passed != null && r.total != null) ? ` ${r.passed}/${r.total}` : "";
      console.log(`${r.green ? "PASS" : "FAIL"} ${r.path}${tally}${r.green ? "" : `  — ${r.error}`}`);
    }
    console.log(`\n[oracle-sweep] ${results.length - red.length}/${results.length} green` + (red.length ? `; ${red.length} RED` : ""));
  }
  process.exit(red.length ? 1 : 0);
}

main();
