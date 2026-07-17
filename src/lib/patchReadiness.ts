/**
 * patchReadiness.ts — B59a (2026-07-17): patch-day readiness check.
 *
 * When X4 updates, a mod's <diff> patch SELECTORS may stop matching the changed vanilla files —
 * the patch then silently fails to apply. This engine diffs a mod's selectors against OLD vs NEW
 * vanilla content and reports which patches will silently miss after the update.
 *
 * COMPOSITION, not new analysis: the "does this selector match this content" primitive is the
 * same xpathLib.select used by overrideMap.ts; the caller supplies OLD/NEW content via injected
 * resolvers (wired to x4CatDat.extractBaseGameFile with two game roots by the server). Pure and
 * resolver-injected so the oracle needs no game install.
 */

import * as xpathLib from "xpath";
import { DOMParser } from "@xmldom/xmldom";

export type PatchReadinessVerdict =
  | "ok"                  // matched in old AND new — still applies
  | "broken"             // matched old, NOT new — will silently miss after the update (headline)
  | "unresolved"         // matched neither — targets another mod's addition or bad selector (info)
  | "now_matches"        // matched new only — targets something the update introduced (info)
  | "target_file_removed"; // the vanilla file the patch targets no longer exists in NEW (severe)

export interface PatchReadinessFinding {
  targetFile: string;
  selector: string;
  op?: string;
  verdict: PatchReadinessVerdict;
  matchedOld: number;
  matchedNew: number;
  /** true when the target vanilla file's bytes changed old→new (context for the file group) */
  fileChanged: boolean;
  message: string;
}

export interface PatchReadinessResult {
  findings: PatchReadinessFinding[];
  summary: {
    patches: number;
    ok: number;
    broken: number;
    unresolved: number;
    now_matches: number;
    target_file_removed: number;
    filesChanged: number;
  };
}

export interface PatchTarget {
  targetFile: string;
  selectors: Array<{ sel: string; op?: string }>;
}

export interface AnalyzePatchReadinessInput {
  patches: PatchTarget[];
  /** vanilla content of targetFile in the OLD game version (null = absent there) */
  resolveOld: (targetFile: string) => string | null;
  /** vanilla content of targetFile in the NEW game version (null = absent there) */
  resolveNew: (targetFile: string) => string | null;
}

const MAX_SELECTOR_EVALS = 400;

function parse(content: string | null): Document | null {
  if (!content) return null;
  try {
    const doc = new DOMParser({ onError: () => { /* tolerate recoverable parse noise */ } })
      .parseFromString(content, "text/xml");
    return doc && doc.documentElement ? (doc as unknown as Document) : null;
  } catch {
    return null;
  }
}

/** Count nodes a selector matches in a parsed doc. Malformed xpath → 0, never throws. */
function matchCount(doc: Document | null, sel: string): number {
  if (!doc) return 0;
  try {
    const r = xpathLib.select(sel, doc as unknown as Node);
    return Array.isArray(r) ? r.length : (r ? 1 : 0);
  } catch {
    return 0;
  }
}

export function analyzePatchReadiness(input: AnalyzePatchReadinessInput): PatchReadinessResult {
  const findings: PatchReadinessFinding[] = [];
  const summary = { patches: 0, ok: 0, broken: 0, unresolved: 0, now_matches: 0, target_file_removed: 0, filesChanged: 0 };
  let evals = 0;

  // Group by target file so each vanilla file is read/parsed once.
  const byFile = new Map<string, Array<{ sel: string; op?: string }>>();
  for (const p of input.patches) {
    const list = byFile.get(p.targetFile) || [];
    for (const s of p.selectors) list.push(s);
    byFile.set(p.targetFile, list);
  }

  for (const [targetFile, selectors] of byFile) {
    const oldContent = input.resolveOld(targetFile);
    const newContent = input.resolveNew(targetFile);
    const fileChanged = oldContent !== newContent;
    if (fileChanged) summary.filesChanged++;

    const oldDoc = parse(oldContent);
    const newDoc = parse(newContent);
    const targetRemoved = oldContent !== null && newContent === null;

    for (const s of selectors) {
      summary.patches++;
      if (evals >= MAX_SELECTOR_EVALS) {
        findings.push({ targetFile, selector: s.sel, op: s.op, verdict: "unresolved", matchedOld: 0, matchedNew: 0, fileChanged, message: "Selector budget exceeded — not evaluated." });
        summary.unresolved++;
        continue;
      }
      evals += 2;

      if (targetRemoved) {
        findings.push({
          targetFile, selector: s.sel, op: s.op, verdict: "target_file_removed",
          matchedOld: matchCount(oldDoc, s.sel), matchedNew: 0, fileChanged: true,
          message: `The vanilla file "${targetFile}" this patch targets no longer exists in the new version — every patch to it will fail.`,
        });
        summary.target_file_removed++;
        continue;
      }

      const matchedOld = matchCount(oldDoc, s.sel);
      const matchedNew = matchCount(newDoc, s.sel);
      let verdict: PatchReadinessVerdict;
      let message: string;
      if (matchedOld > 0 && matchedNew > 0) {
        verdict = "ok";
        message = "Still applies — the selector matches in the new version.";
      } else if (matchedOld > 0 && matchedNew === 0) {
        verdict = "broken";
        message = `WILL SILENTLY MISS after the update: this selector matched the old vanilla file but not the new one (\`${targetFile}\` changed). Re-target the patch.`;
      } else if (matchedOld === 0 && matchedNew > 0) {
        verdict = "now_matches";
        message = "Matches only the new version — the target likely didn't exist in the old one.";
      } else {
        verdict = "unresolved";
        message = "Matches neither version — likely targets another mod's addition or is a malformed selector (not a patch-day break).";
      }
      findings.push({ targetFile, selector: s.sel, op: s.op, verdict, matchedOld, matchedNew, fileChanged, message });
      summary[verdict]++;
    }
  }

  return { findings, summary };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic two-version fixtures; no game install needed.
 * ------------------------------------------------------------------ */

export function runPatchReadinessSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  // OLD wares.xml: energycells has a <price average> and a <production>.
  const waresOld = `<?xml version="1.0"?><wares>
    <ware id="energycells" name="Energy Cells"><price min="10" average="16" max="22"/><production time="60" amount="175"/></ware>
    <ware id="water" name="Water"><price min="1" average="2" max="3"/></ware>
  </wares>`;
  // NEW wares.xml: energycells' <price> lost its @average (structure changed); water unchanged.
  const waresNew = `<?xml version="1.0"?><wares>
    <ware id="energycells" name="Energy Cells"><price min="10" max="22"/><production time="60" amount="175"/></ware>
    <ware id="water" name="Water"><price min="1" average="2" max="3"/></ware>
  </wares>`;

  const resolveOld = (f: string) => (f === "libraries/wares.xml" ? waresOld : f === "libraries/removed.xml" ? "<x><y/></x>" : null);
  const resolveNew = (f: string) => (f === "libraries/wares.xml" ? waresNew : null); // removed.xml gone in new

  const r = analyzePatchReadiness({
    patches: [
      { targetFile: "libraries/wares.xml", selectors: [
        { sel: "/wares/ware[@id='energycells']/price/@average", op: "replace" }, // BROKEN (average gone)
        { sel: "/wares/ware[@id='water']/price/@average", op: "replace" },        // ok (unchanged)
        { sel: "/wares/ware[@id='ghost']/@name", op: "replace" },                  // unresolved (never existed)
      ]},
      { targetFile: "libraries/removed.xml", selectors: [{ sel: "/x/y", op: "remove" }] }, // target_file_removed
    ],
    resolveOld, resolveNew,
  });

  const byVerdict = (v: string) => r.findings.filter(f => f.verdict === v);
  ok("broken_detected", byVerdict("broken").length === 1 && byVerdict("broken")[0].selector.includes("energycells"), JSON.stringify(byVerdict("broken").map(f => f.selector)));
  ok("still_valid_is_ok", byVerdict("ok").length === 1 && byVerdict("ok")[0].selector.includes("water"));
  ok("nonexistent_is_unresolved", byVerdict("unresolved").some(f => f.selector.includes("ghost")));
  ok("removed_target_file", byVerdict("target_file_removed").length === 1 && byVerdict("target_file_removed")[0].targetFile === "libraries/removed.xml");
  ok("file_changed_flag", r.findings.filter(f => f.targetFile === "libraries/wares.xml").every(f => f.fileChanged === true));
  ok("summary_counts", r.summary.broken === 1 && r.summary.ok === 1 && r.summary.target_file_removed === 1, JSON.stringify(r.summary));

  // now_matches: selector matches new only (target introduced by the update).
  const r2 = analyzePatchReadiness({
    patches: [{ targetFile: "f.xml", selectors: [{ sel: "/root/added" }] }],
    resolveOld: () => "<root/>", resolveNew: () => "<root><added/></root>",
  });
  ok("now_matches_detected", r2.findings[0].verdict === "now_matches");

  // malformed xpath → unresolved, never crash.
  const r3 = analyzePatchReadiness({
    patches: [{ targetFile: "f.xml", selectors: [{ sel: "/root[@@bad(" }] }],
    resolveOld: () => "<root/>", resolveNew: () => "<root/>",
  });
  ok("malformed_xpath_no_crash", r3.findings[0].verdict === "unresolved");

  // no diffs → empty, no crash.
  const r4 = analyzePatchReadiness({ patches: [], resolveOld: () => null, resolveNew: () => null });
  ok("empty_input_safe", r4.findings.length === 0 && r4.summary.patches === 0);

  // both roots missing the file (unconfigured old) → unresolved, not false-ok.
  const r5 = analyzePatchReadiness({
    patches: [{ targetFile: "f.xml", selectors: [{ sel: "/a" }] }],
    resolveOld: () => null, resolveNew: () => null,
  });
  ok("no_reference_not_false_ok", r5.findings[0].verdict === "unresolved" && r5.summary.ok === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
