/**
 * tFileLint.ts — B62b (2026-07-17): t-file (localization) reference integrity.
 *
 * X4 text lives in t/*.xml under `<page id><t id>…</t></page>` and is referenced elsewhere (MD, wares,
 * jobs, content.xml, factions…) as `{pageId,textId}`, and in Lua as ReadText(pageId,textId). Nothing at author-time checks a reference resolves
 * to a real entry — a typo silently shows blank/garbage in-game (research round 3, F2). The existing
 * `lintTFileStructure` only checks a t-file's own shape (root, page/t ids); it does NOT resolve refs.
 *
 * SCOPE (deliberately cry-wolf-safe, no vanilla index): only flag `{page,id}` references where the mod
 * OWNS the page (defines it in one of its own t-files) but the entry id is missing. References to pages
 * the mod does NOT define resolve to vanilla or another mod — none of our business, never flagged. This
 * catches the modder's OWN typos (the common, high-value case) with zero false positives on legit
 * vanilla-text reuse. DOM-parsed t-files, comment-stripped XML and scope-parsed literal Lua calls.
 *
 * Pure — the caller supplies the mod's files. Advisory WARNING.
 */

import { DOMParser } from "@xmldom/xmldom";
import { parseX4Lua as parseLua } from "./x4LuaParser";
import { createSourcePositionLocator } from "./xmlSourceSpans";
import { normalizeX4UiSourcePath } from "./x4UiSourceBundle";

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
  line?: number;
  column?: number;
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

/** XML files that can contain {page,id} references, excluding the text definitions. */
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
  registeredLuaPaths?: ReadonlySet<string>;
}

interface LuaTextNode {
  type: string;
  name?: string;
  isLocal?: boolean;
  value?: unknown;
  range?: [number, number];
  base?: LuaTextNode;
  identifier?: LuaTextNode;
  index?: LuaTextNode;
  arguments?: LuaTextNode[];
  variables?: LuaTextNode[];
  init?: LuaTextNode[];
}

function luaTextReferences(content: string, limit: number): Array<{ page: string; id: string; offset: number }> {
  if (!content.includes("ReadText") || limit <= 0) return [];
  const references: Array<{ page: string; id: string; offset: number }> = [];
  let rebound = false;
  const globalName = (node?: LuaTextNode) => node?.type === "Identifier" && node.isLocal === false ? node.name : undefined;
  const environment = (node?: LuaTextNode) => ["_G", "_ENV"].includes(globalName(node) ?? "");
  const writeKey = (node?: LuaTextNode): unknown => {
    if (node?.type === "StringLiteral" || node?.type === "NumericLiteral") return node.value;
    return "_ENV"; // A computed environment key may replace the engine binding.
  };
  const writeName = (node?: LuaTextNode): unknown => {
    if (node?.type === "MemberExpression" && environment(node.base)) return node.identifier?.name;
    if (node?.type === "IndexExpression" && environment(node.base)) return writeKey(node.index);
    return globalName(node);
  };
  const markWrite = (name: unknown) => {
    if (name === "ReadText" || name === "_ENV" || name === "_G") rebound = true;
  };
  try {
    // Keep original UTF-16 offsets while accepting non-ASCII prose in Lua strings.
    parseLua(content.replace(/^\uFEFF/, " ").replace(/[\u0100-\uffff]/g, "?"), {
      comments: false, ranges: true, scope: true, encodingMode: "pseudo-latin1",
      onLocalDeclaration(name: string) {
        if (name === "_ENV") rebound = true;
      },
      onCreateNode(node: LuaTextNode) {
        if (node.type === "AssignmentStatement" || node.type === "LocalStatement") {
          if (node.init?.some(environment)) rebound = true;
          if (node.type === "AssignmentStatement") {
            for (const variable of node.variables ?? []) markWrite(writeName(variable));
          }
        } else if (node.type === "FunctionDeclaration") {
          markWrite(writeName(node.identifier));
        } else if (node.type === "CallExpression") {
          const callee = globalName(node.base);
          if (callee === "rawset" && environment(node.arguments?.[0])) markWrite(writeKey(node.arguments?.[1]));
          if (callee !== "ReadText" || references.length >= limit) return;
          const [page, id] = node.arguments ?? [];
          if (page?.type !== "NumericLiteral" || id?.type !== "NumericLiteral" || !id.range
            || typeof page.value !== "number" || typeof id.value !== "number"
            || !Number.isSafeInteger(page.value) || !Number.isSafeInteger(id.value)
            || page.value < 0 || id.value < 0) return;
          references.push({ page: String(page.value), id: String(id.value), offset: id.range[0] });
        }
      },
    });
  } catch { return []; }
  return rebound ? [] : references;
}

export function lintTextReferences(input: LintTextRefsInput): TFileLintResult {
  const { files, index } = input;
  const findings: TextRefFinding[] = [];
  let refsChecked = 0;
  // De-dupe identical (file,page,id) so a repeated bad ref reports once per file.
  const seen = new Set<string>();
  const addReference = (filePath: string, page: string, id: string, position?: { line: number; column: number }) => {
    refsChecked++;
    if (!index.ownedPages.has(page) || index.entries.get(page)?.has(id)) return;
    const key = `${filePath}|${page}|${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      filePath, page, id, kind: "dangling_text_ref", ...position,
      message: `Text reference {${page},${id}} targets page ${page}, which this mod defines, but entry ${id} is not defined there — likely a typo or a missing <t id="${id}"> entry.`,
    });
  };
  for (const f of files) {
    if (typeof f.content !== "string") continue;
    if (/\.lua$/i.test(f.path)) {
      const key = normalizeX4UiSourcePath(f.path).key;
      if (!key || (key.toLowerCase().startsWith("tools/") && !input.registeredLuaPaths?.has(key))) continue;
      if (!index.ownedPages.size) continue;
      const locate = createSourcePositionLocator(f.content);
      for (const reference of luaTextReferences(f.content, MAX_REFS - refsChecked)) {
        addReference(f.path, reference.page, reference.id, locate(reference.offset));
      }
      continue;
    }
    if (!referencesText(f.path)) continue;
    const text = stripComments(f.content);
    let m: RegExpExecArray | null;
    TEXT_REF_RE.lastIndex = 0;
    while ((m = TEXT_REF_RE.exec(text)) !== null && refsChecked < MAX_REFS) {
      addReference(f.path, m[1], m[2]);
    }
  }
  return { findings, summary: { refsChecked, ownedPages: index.ownedPages.size, findings: findings.length } };
}

/* ------------------------------------------------------------------ *
 * B62b phase 2 — per-language translation coverage.
 * A page the mod defines in 2+ of its OWN language files, where one language
 * has fewer entries than the most-complete one, has an incomplete translation.
 * Corpus-verified cry-wolf-safe: vanilla's 477 multi-language pages have 0 gaps
 * (Egosoft fully translates), so a gap is a REAL gap, never noise. One SUMMARY
 * finding per (page, language) — not per entry — to keep it low-noise. Advisory.
 * ------------------------------------------------------------------ */

export interface TranslationCoverageFinding {
  page: string;
  language: string;
  have: number;
  max: number;
  missing: number;
  kind: "incomplete_translation";
  message: string;
}

/**
 * Derive the language id of a t-file: from the filename suffix (…l044.xml → 44), else <language id>.
 * NORMALIZED (leading zeros stripped) so the filename form "007" and the attribute form "7" — X4 uses
 * both — are treated as the SAME language, never a false coverage gap.
 */
function languageOf(path: string, content: string): string | null {
  const m = path.replace(/\\/g, "/").toLowerCase().match(/l(\d+)\.xml$/);
  if (m) return String(parseInt(m[1], 10));
  const lm = String(content || "").match(/<language\s+id\s*=\s*"(\d+)"/i);
  return lm ? String(parseInt(lm[1], 10)) : null;
}

/** page id -> language id -> set of entry (t) ids defined for that page in that language. */
export function buildLanguageCoverage(tFiles: Array<{ path: string; content: string }>): Map<string, Map<string, Set<string>>> {
  const cov = new Map<string, Map<string, Set<string>>>();
  for (const f of tFiles) {
    if (!isTFile(f.path) || typeof f.content !== "string") continue;
    const lang = languageOf(f.path, f.content);
    if (!lang) continue;
    const doc = parse(f.content);
    if (!doc) continue;
    const pages = doc.getElementsByTagName("page");
    for (let i = 0; i < pages.length; i++) {
      const pid = pages[i].getAttribute("id");
      if (!pid) continue;
      let byLang = cov.get(pid);
      if (!byLang) { byLang = new Map(); cov.set(pid, byLang); }
      let set = byLang.get(lang);
      if (!set) { set = new Set(); byLang.set(lang, set); }
      const ts = pages[i].getElementsByTagName("t");
      for (let j = 0; j < ts.length; j++) {
        const tid = ts[j].getAttribute("id");
        if (tid) set.add(tid);
      }
    }
  }
  return cov;
}

export function lintTranslationCoverage(input: { tFiles: Array<{ path: string; content: string }> }): { findings: TranslationCoverageFinding[]; summary: { multiLangPages: number; findings: number } } {
  const cov = buildLanguageCoverage(input.tFiles);
  const findings: TranslationCoverageFinding[] = [];
  let multiLangPages = 0;
  for (const [page, byLang] of cov) {
    if (byLang.size < 2) continue; // need 2+ languages to have a coverage gap
    multiLangPages++;
    const max = Math.max(...[...byLang.values()].map(s => s.size));
    for (const [lang, set] of byLang) {
      if (set.size < max) {
        findings.push({
          page, language: lang, have: set.size, max, missing: max - set.size, kind: "incomplete_translation",
          message: `Page ${page}: language ${lang} has ${set.size} of ${max} text entries — ${max - set.size} line(s) present in your other language file(s) are not translated here (players in that language see the fallback text).`,
        });
      }
    }
  }
  return { findings, summary: { multiLangPages, findings: findings.length } };
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

  const luaRefs = (content: string, path = "lua/text.lua", registeredLuaPaths?: ReadonlySet<string>) =>
    lintTextReferences({ files: [{ path, content }], index: idx, registeredLuaPaths });
  const missingLua = luaRefs("return ReadText(20201, 99)");
  ok("lua_owned_missing_entry", missingLua.findings.length === 1 && missingLua.findings[0].id === "99");
  ok("lua_missing_id_position", missingLua.findings[0]?.line === 1 && missingLua.findings[0]?.column === 24);
  ok("lua_known_entry_clean", luaRefs("return ReadText(20201, 1)").findings.length === 0);
  ok("lua_unowned_page_clean", luaRefs("return ReadText(1001, 999)").findings.length === 0);
  ok("lua_computed_ids_unresolved", luaRefs("return ReadText(page, 99), ReadText(20201, id)").findings.length === 0);
  ok("lua_comments_and_strings_ignored", luaRefs('-- ReadText(20201,99)\nlocal s = "ReadText(20201,99)"\n--[=[ ReadText(20201,99) ]=]').findings.length === 0);
  ok("lua_local_function_shadow_clean", luaRefs("local function ReadText(p, i) return i end; return ReadText(20201,99)").findings.length === 0);
  ok("lua_parameter_shadow_clean", luaRefs("local function f(ReadText) return ReadText(20201,99) end").findings.length === 0);
  ok("lua_global_outside_local_scope_checked", luaRefs("do local ReadText = function() end end; return ReadText(20201,99)").findings.length === 1);
  ok("lua_object_method_ignored", luaRefs("return api.ReadText(20201,99), api:ReadText(20201,99)").findings.length === 0);
  for (const content of [
    "ReadText = function() end; return ReadText(20201,99)",
    "function ReadText() end; return ReadText(20201,99)",
    "_G.ReadText = custom; return ReadText(20201,99)",
    '_ENV["ReadText"] = custom; return ReadText(20201,99)',
    'rawset(_G, "ReadText", custom); return ReadText(20201,99)',
    'local key = "ReadText"; _ENV[key] = custom; return ReadText(20201,99)',
    'local key = "ReadText"; rawset(_G, key, custom); return ReadText(20201,99)',
    'local env = _G; env.ReadText = custom; return ReadText(20201,99)',
    "local _ENV = {}; return ReadText(20201,99)",
    "_ENV = custom; return ReadText(20201,99)",
  ]) ok("lua_rebound_engine_call_ignored " + content, luaRefs(content).findings.length === 0);
  ok("lua_unrelated_literal_environment_write_preserves_binding", luaRefs('_G.other = 1; rawset(_ENV,"other",2); return ReadText(20201,99)').findings.length === 1);
  ok("lua_partial_parse_ignored", luaRefs("ReadText(20201,99); function(").findings.length === 0);
  ok("lua_noninteger_ids_unresolved", luaRefs("return ReadText(20201,99.5), ReadText(20201,-99)").findings.length === 0);
  const positionedLua = luaRefs('\uFEFFlocal s = "é😀"\r\nreturn ReadText(20201,99)');
  ok("lua_original_bom_unicode_crlf_positions", positionedLua.findings[0]?.line === 2 && positionedLua.findings[0]?.column === 23);
  ok("lua_duplicate_refs_retain_existing_dedupe", luaRefs("ReadText(20201,99); ReadText(20201,99)").findings.length === 1);
  ok("lua_standalone_host_tools_excluded", luaRefs("return ReadText(20201,99)", "tools/check.lua").summary.refsChecked === 0);
  ok("lua_registered_tool_checked", luaRefs("return ReadText(20201,99)", "tools/check.lua", new Set(["tools/check.lua"])).findings.length === 1);
  ok("lua_reference_budget_bounded", luaRefs("ReadText(20201,99)\n".repeat(MAX_REFS + 1)).summary.refsChecked === MAX_REFS);

  // --- B62b phase 2: translation coverage ---
  const covEn = { path: "t/0001-L044.xml", content: `<language id="44"><page id="20201"><t id="1">a</t><t id="2">b</t><t id="3">c</t></page></language>` };
  const covDe = { path: "t/0001-L049.xml", content: `<language id="49"><page id="20201"><t id="1">a</t><t id="2">b</t></page></language>` }; // missing 3
  const covGap = lintTranslationCoverage({ tFiles: [covEn, covDe] });
  ok("coverage_gap_flagged", covGap.findings.length === 1 && covGap.findings[0].language === "49" && covGap.findings[0].missing === 1, JSON.stringify(covGap.findings));
  ok("coverage_summary_not_per_entry", covGap.findings.length === 1); // one summary per page-language, not per missing entry

  // Complete coverage → no findings (mirrors vanilla: 477 multi-lang pages, 0 gaps).
  const covDeFull = { path: "t/0001-L049.xml", content: `<language id="49"><page id="20201"><t id="1">a</t><t id="2">b</t><t id="3">c</t></page></language>` };
  ok("complete_coverage_clean", lintTranslationCoverage({ tFiles: [covEn, covDeFull] }).findings.length === 0);

  // Single-language mod → nothing to compare → no findings (never nags a mono-language mod).
  ok("single_language_no_findings", lintTranslationCoverage({ tFiles: [covEn] }).findings.length === 0);

  // Language derived from filename even without a <language id> attribute.
  const covNoAttr = { path: "t/0002-l007.xml", content: `<language><page id="20201"><t id="1">x</t></page></language>` };
  ok("language_from_filename", lintTranslationCoverage({ tFiles: [covEn, covNoAttr] }).findings.some(f => f.language === "7"));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
