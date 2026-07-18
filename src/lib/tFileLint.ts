/**
 * tFileLint.ts — B62b (2026-07-17): t-file (localization) reference integrity.
 *
 * X4 text lives in t/*.xml under `<page id><t id>…</t></page>` and is referenced elsewhere (MD, wares,
 * jobs, content.xml, factions…) as `{pageId,textId}`. Nothing at author-time checks a reference resolves
 * to a real entry — a typo silently shows blank/garbage in-game (research round 3, F2). The existing
 * `lintTFileStructure` only checks a t-file's own shape (root, page/t ids); it does NOT resolve refs.
 *
 * SCOPE (deliberately cry-wolf-safe, no vanilla index): only flag `{page,id}` references where the mod
 * OWNS the page (defines it in one of its own t-files) but the entry id is missing. References to pages
 * the mod does NOT define resolve to vanilla or another mod — none of our business, never flagged. This
 * catches the modder's OWN typos (the common, high-value case) with zero false positives on legit
 * vanilla-text reuse. DOM-parsed for the t-file index; comment-stripped scan for refs (comment-safe).
 *
 * Pure — the caller supplies the mod's files. Advisory WARNING.
 */

import { DOMParser } from "@xmldom/xmldom";

export interface ModTextIndex {
  /** page ids this mod defines across all its t-files */
  ownedPages: Set<string>;
  /** pageId -> set of entry (t) ids defined for it, merged across the mod's language files */
  entries: Map<string, Set<string>>;
}

export interface TextRefFinding {
  filePath: string;
  page: string;
  id: string;
  kind: "dangling_text_ref";
  message: string;
}

export interface TFileLintResult {
  findings: TextRefFinding[];
  summary: { refsChecked: number; ownedPages: number; findings: number };
}

function parse(content: string | null): Document | null {
  if (!content || !content.trim()) return null;
  try {
    const doc = new DOMParser({ onError: () => { /* tolerate */ } }).parseFromString(content, "text/xml");
    return doc && doc.documentElement ? (doc as unknown as Document) : null;
  } catch { return null; }
}

function isTFile(path: string): boolean {
  return /(^|\/)t\/[^/]+\.xml$/i.test(path.replace(/\\/g, "/"));
}

/** Files that can CONTAIN {page,id} references (everything content-ish except the t-files themselves). */
function referencesText(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  if (isTFile(path)) return false;
  return /(^|\/)(md|aiscripts)\/[^/]+\.xml$/.test(p)
    || /(^|\/)libraries\/[^/]+\.xml$/.test(p)
    || p === "content.xml" || p.endsWith("/content.xml");
}

/** Build the mod's owned-text index from its t-files (any/all languages merged). */
export function buildModTextIndex(tFiles: Array<{ path: string; content: string }>): ModTextIndex {
  const ownedPages = new Set<string>();
  const entries = new Map<string, Set<string>>();
  for (const f of tFiles) {
    if (!isTFile(f.path) || typeof f.content !== "string") continue;
    const doc = parse(f.content);
    if (!doc) continue;
    const pages = doc.getElementsByTagName("page");
    for (let i = 0; i < pages.length; i++) {
      const pid = pages[i].getAttribute("id");
      if (!pid) continue;
      ownedPages.add(pid);
      let set = entries.get(pid);
      if (!set) { set = new Set(); entries.set(pid, set); }
      const ts = pages[i].getElementsByTagName("t");
      for (let j = 0; j < ts.length; j++) {
        const tid = ts[j].getAttribute("id");
        if (tid) set.add(tid);
      }
    }
  }
  return { ownedPages, entries };
}

const TEXT_REF_RE = /\{\s*(\d+)\s*,\s*(\d+)\s*\}/g;
const MAX_REFS = 20000;

/**
 * Blank out things that contain example `{page,id}` text but are NOT live references, so they never
 * cry wolf: XML comments, AND X4's `comment="…"` developer-note attribute (used heavily in vanilla to
 * document, e.g. `comment="…purchase '{20103,61301}'."`). Newlines are preserved so line numbers hold.
 */
function stripComments(xml: string): string {
  return String(xml || "")
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " "))
    .replace(/\bcomment\s*=\s*"[^"]*"/gi, m => m.replace(/[^\n]/g, " "));
}

export interface LintTextRefsInput {
  files: Array<{ path: string; content: string }>;
  index: ModTextIndex;
}

export function lintTextReferences(input: LintTextRefsInput): TFileLintResult {
  const { files, index } = input;
  const findings: TextRefFinding[] = [];
  let refsChecked = 0;
  // De-dupe identical (file,page,id) so a repeated bad ref reports once per file.
  const seen = new Set<string>();
  for (const f of files) {
    if (typeof f.content !== "string" || !referencesText(f.path)) continue;
    const text = stripComments(f.content);
    let m: RegExpExecArray | null;
    TEXT_REF_RE.lastIndex = 0;
    while ((m = TEXT_REF_RE.exec(text)) !== null && refsChecked < MAX_REFS) {
      refsChecked++;
      const page = m[1], id = m[2];
      // Only the mod's OWN pages are our business — refs to vanilla/other pages are legit and ignored.
      if (!index.ownedPages.has(page)) continue;
      if (index.entries.get(page)?.has(id)) continue; // resolves — fine
      const key = `${f.path}|${page}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        filePath: f.path, page, id, kind: "dangling_text_ref",
        message: `Text reference {${page},${id}} targets page ${page}, which this mod defines, but entry ${id} is not defined there — likely a typo or a missing <t id="${id}"> entry.`,
      });
    }
  }
  return { findings, summary: { refsChecked, ownedPages: index.ownedPages.size, findings: findings.length } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures; pure, no corpus needed.
 * ------------------------------------------------------------------ */

export function runTFileLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const tfile = { path: "t/0001-L044.xml", content: `<?xml version="1.0"?><language id="44">
    <page id="20201" title="MyMod"><t id="1">Hello</t><t id="2">World</t></page>
  </language>` };
  const idx = buildModTextIndex([tfile]);
  ok("owned_page_indexed", idx.ownedPages.has("20201"));
  ok("entries_indexed", !!idx.entries.get("20201")?.has("1") && !!idx.entries.get("20201")?.has("2"));

  // MD references a good entry (1) and a bad one (99) on the OWNED page → only the bad one flags.
  const md = { path: "md/mymod.xml", content: `<?xml version="1.0"?><mdscript name="M"><cues><cue name="C"><actions>
    <set_objective text="{20201,1}"/>
    <set_objective text="{20201,99}"/>
  </actions></cue></cues></mdscript>` };
  const r = lintTextReferences({ files: [md], index: idx });
  ok("dangling_flagged", r.findings.length === 1 && r.findings[0].id === "99", JSON.stringify(r.findings.map(f => f.id)));
  ok("valid_ref_not_flagged", !r.findings.some(f => f.id === "1"));

  // A reference to a page the mod does NOT own (vanilla text reuse) → NEVER flagged.
  const vanillaRef = { path: "libraries/wares.xml", content: `<wares><ware id="x" name="{20111,401}"/></wares>` };
  const r2 = lintTextReferences({ files: [vanillaRef], index: idx });
  ok("foreign_page_not_flagged", r2.findings.length === 0, JSON.stringify(r2.findings));

  // Comment safety: a bad ref inside an XML comment is NOT flagged.
  const commented = { path: "md/c.xml", content: `<mdscript><!-- old: {20201,99} --><cue name="C"/></mdscript>` };
  const r3 = lintTextReferences({ files: [commented], index: idx });
  ok("commented_ref_not_flagged", r3.findings.length === 0, JSON.stringify(r3.findings));

  // comment="…" attribute safety: X4's dev-note attribute often contains example {page,id} text that is
  // NOT a live reference — must never be flagged (this was a real vanilla false-positive source, 3 hits).
  const commentAttr = { path: "md/tut.xml", content: `<a><show_help line="1" comment="purchase '{20201,99}' here"/><b text="{20201,1}"/></a>` };
  const rc = lintTextReferences({ files: [commentAttr], index: idx });
  ok("comment_attribute_not_flagged", !rc.findings.some(f => f.id === "99") && rc.findings.length === 0, JSON.stringify(rc.findings));

  // t-files themselves are not scanned for references (they DEFINE text).
  const r4 = lintTextReferences({ files: [tfile], index: idx });
  ok("tfiles_not_scanned_for_refs", r4.summary.refsChecked === 0);

  // Multi-language merge: the same page defined in two language files unions the entries.
  const de = { path: "t/0001-L049.xml", content: `<language id="49"><page id="20201"><t id="3">Hallo</t></page></language>` };
  const merged = buildModTextIndex([tfile, de]);
  ok("multilang_merged", !!merged.entries.get("20201")?.has("3") && !!merged.entries.get("20201")?.has("1"));
  // Now {20201,3} resolves (defined in the German file) → not flagged.
  const r5 = lintTextReferences({ files: [{ path: "md/x.xml", content: `<a b="{20201,3}"/>` }], index: merged });
  ok("cross_language_entry_resolves", r5.findings.length === 0);

  // Robustness.
  ok("empty_safe", lintTextReferences({ files: [], index: idx }).findings.length === 0);
  ok("no_tfiles_no_owned_pages", buildModTextIndex([]).ownedPages.size === 0);
  ok("malformed_tfile_safe", buildModTextIndex([{ path: "t/x.xml", content: "<language><page id=" }]).ownedPages.size === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
