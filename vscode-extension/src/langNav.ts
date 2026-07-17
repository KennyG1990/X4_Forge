/**
 * langNav.ts — B57s3 (2026-07-17): vscode-free cue navigation helpers.
 *
 * NAVIGATION AID ONLY: plain-text location of cue/script definitions and references.
 * Resolution SEMANTICS (namespaces, this/parent keywords, cross-mod refs) belong to the
 * server's cue index — the validator remains the referee; this just moves the cursor.
 */

export interface CueWord {
  /** the full dotted chain under the cursor, e.g. "md.Setup.Start" or "Boot_Cue" */
  chain: string;
  /** last segment — the cue name to locate */
  cue: string;
  /** middle segment when the chain is md.Script.Cue — narrows the target file */
  script: string | null;
}

/** Parse the dotted identifier around a cursor word. Returns null for non-identifiers. */
export function parseCueWord(raw: string): CueWord | null {
  const chain = (raw || "").trim();
  if (!/^[A-Za-z_][\w.]*$/.test(chain)) return null;
  const parts = chain.split(".").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0].toLowerCase() === "md" && parts.length >= 3) {
    return { chain, cue: parts[2], script: parts[1] };
  }
  if (parts.length === 1) return { chain, cue: parts[0], script: null };
  // this.Foo / parent.Foo / Script.Cue two-part chains: last segment is the cue.
  return { chain, cue: parts[parts.length - 1], script: parts.length >= 2 && !["this", "parent", "static"].includes(parts[0].toLowerCase()) ? parts[parts.length - 2] : null };
}

export interface TextLocation { line: number; column: number; }

/** 0-based line/column of `<cue name="<cue>"` in one file's text (case-insensitive name). */
export function findCueDefinition(text: string, cue: string): TextLocation | null {
  const re = new RegExp(`<cue\\b[^>]*\\bname\\s*=\\s*"${escapeRe(cue)}"`, "i");
  const m = re.exec(text);
  if (!m) return null;
  return offsetToLocation(text, m.index);
}

/** True when the file's <mdscript name="..."> matches (used to narrow md.Script.Cue). */
export function mdscriptNameOf(text: string): string | null {
  const m = /<mdscript\b[^>]*\bname\s*=\s*"([^"]+)"/i.exec(text);
  return m ? m[1] : null;
}

/** All 0-based locations of the cue name as a whole word (references view). */
export function findCueReferences(text: string, cue: string): TextLocation[] {
  const out: TextLocation[] = [];
  // A preceding dot is a CHAIN segment (md.Setup.Start) — those ARE references; only a
  // preceding word character means we're inside a longer identifier (Restart).
  const re = new RegExp(`(?<!\\w)${escapeRe(cue)}(?!\\w)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(offsetToLocation(text, m.index));
    if (out.length > 500) break;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function offsetToLocation(text: string, offset: number): TextLocation {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) || []).length;
  const column = offset - (before.lastIndexOf("\n") + 1);
  return { line, column };
}

/* ------------------------------------------------------------------ *
 * Selftest — run headlessly: npx tsx vscode-extension/src/langNav.ts
 * ------------------------------------------------------------------ */

export function runLangNavSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  ok("bare_cue", JSON.stringify(parseCueWord("Boot_Cue")) === JSON.stringify({ chain: "Boot_Cue", cue: "Boot_Cue", script: null }));
  ok("md_chain", JSON.stringify(parseCueWord("md.Setup.Start")) === JSON.stringify({ chain: "md.Setup.Start", cue: "Start", script: "Setup" }));
  ok("this_chain_no_script", parseCueWord("this.Local")?.cue === "Local" && parseCueWord("this.Local")?.script === null);
  ok("non_identifier_rejected", parseCueWord("$variable") === null && parseCueWord("") === null);

  const doc = `<mdscript name="Setup" xmlns:xsi="x">\n  <cues>\n    <cue name="Start" instantiate="true">\n      <actions><signal_cue_instantly cue="md.Setup.Start"/></actions>\n    </cue>\n  </cues>\n</mdscript>`;
  const def = findCueDefinition(doc, "Start");
  ok("definition_found_line", def?.line === 2, JSON.stringify(def));
  ok("definition_case_insensitive", findCueDefinition(doc, "start")?.line === 2);
  ok("definition_absent_null", findCueDefinition(doc, "Nope") === null);
  ok("mdscript_name", mdscriptNameOf(doc) === "Setup");
  const refs = findCueReferences(doc, "Start");
  ok("references_found_both", refs.length === 2, JSON.stringify(refs));
  ok("references_word_boundary", findCueReferences('<x a="Restart Started"/>', "Start").length === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}

// Headless runner: `npx tsx vscode-extension/src/langNav.ts`
if (typeof require !== "undefined" && require.main === module) {
  const r = runLangNavSelftest();
  console.log(`langNav selftest: ${r.passed}/${r.total} allPassed=${r.allPassed}`);
  for (const c of r.checks) if (!c.pass) console.log("FAIL", c.name, c.detail || "");
  process.exit(r.allPassed ? 0 : 1);
}
