/**
 * langNav.ts — B57s3 (2026-07-17): vscode-free cue navigation helpers.
 *
 * Literal MD definitions use authored XML and the shared declaration resolver.
 * Find References still supplies a separate text search.
 */

import {
  buildMdLibraryIndex, mdReferenceRole, parseMdScriptRoot, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryScript,
} from "../../shared/mdDeclarationResolution";
import { createXmlNodePositionLocator } from "../../shared/xmlSourcePosition";
import { MAX_PROJECT_XML_DEPTH } from "../../shared/xmlMarkup";

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

interface DefinitionLocation extends TextLocation { file: string; }
interface DefinitionSource { location?: DefinitionLocation; libraryScope?: number; }
interface LiteralReference { value: string; script?: string; library: boolean; libraryScope?: number; }
export type MdDefinitionDocument = MdLibraryScript<DefinitionSource, string> & {
  reference: LiteralReference | undefined;
};

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const LITERAL_REFERENCE = /^(?:md\.([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)$/;
const CUE_EVENTS = new Set(["event_cue_signalled", "event_cue_completed"]);
export const MAX_MD_DEFINITION_SOURCE = 8 * 1024 * 1024;

/** Read literal cue references and declaration positions from the same authored bytes. */
export function readMdDefinitionDocument(file: string, text: string, cursor?: number): MdDefinitionDocument | undefined {
  if (text.length > MAX_MD_DEFINITION_SOURCE) return undefined;
  const root = parseMdScriptRoot(text);
  const name = root?.getAttribute("name");
  if (!root || !name || !IDENTIFIER.test(name) || root.ownerDocument?.doctype) return undefined;

  const locator = createXmlNodePositionLocator(text);
  const declarations: MdLibraryDeclaration<DefinitionSource>[] = [];
  let reference: LiteralReference | undefined;
  const pending = [{ element: root, depth: 0, libraryScope: undefined as number | undefined }];
  let seen = 0;
  while (pending.length) {
    const { element, depth, libraryScope: inheritedScope } = pending.pop()!;
    if (++seen > 50_000 || depth > MAX_PROJECT_XML_DEPTH) return undefined;
    if (element.namespaceURI || element.getAttribute("xmlns")) continue;
    const tag = element.tagName;
    const kind = tag === "cue" || tag === "library" ? tag : undefined;
    const libraryScope = kind === "library" ? seen : inheritedScope;
    const container = element.parentElement;
    const owner = container?.parentElement;
    if (kind && container?.tagName === "cues" && (owner === root || owner?.tagName === "cue" || owner?.tagName === "library")) {
      const attr = element.getAttributeNode("name");
      const point = attr && locator.point(attr);
      if (attr && IDENTIFIER.test(attr.value)) {
        declarations.push({
          name: attr.value, kind, purpose: element.getAttribute("purpose"),
          source: { libraryScope, location: point ? { file, line: point.line - 1, column: point.column - 1 } : undefined },
        });
      }
    }
    if (cursor !== undefined && !reference) {
      const role = mdReferenceRole(tag);
      const library = role === "cue" || role === "include_actions" || role === "run_actions";
      const attr = (role || CUE_EVENTS.has(tag)) && element.getAttributeNode(library ? "ref" : "cue");
      const start = attr ? locator.offset(attr) : undefined;
      if (attr && start !== undefined && cursor > start && locator.point(attr)) {
        const close = text.indexOf(text[start], start + 1);
        const value = attr.value.trim();
        const literal = LITERAL_REFERENCE.exec(value);
        if (close > cursor && literal) reference = { value, script: literal[1], library, libraryScope };
      }
    }
    if (tag === "cue" && element.hasAttribute("ref")) continue;
    for (const child of Array.from(element.children)) pending.push({ element: child, depth: depth + 1, libraryScope });
  }
  return { name, source: file, declarations, reference };
}

export function resolveMdDefinition(
  origin: MdDefinitionDocument,
  siblings: readonly MdDefinitionDocument[] = [],
): DefinitionLocation | undefined {
  const ref = origin.reference;
  if (!ref) return undefined;
  const index = buildMdLibraryIndex([origin, ...siblings]);
  const resolved = resolveMdLibraryReference(index, origin.name, ref.value, { cueReference: !ref.library });
  if (ref.library) return resolved?.library?.source.location;
  const target = resolved?.declaration;
  if (!target || target.name !== resolved.targetName || target.source.libraryScope !== ref.libraryScope) return undefined;
  if (ref.libraryScope !== undefined && resolved.script.source !== origin.source) return undefined;
  return target.source.location;
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
  const refs = findCueReferences(doc, "Start");
  ok("references_found_both", refs.length === 2, JSON.stringify(refs));
  ok("references_word_boundary", findCueReferences('<x a="Restart Started"/>', "Start").length === 0);

  const local = (value: string) => doc.replace('cue="md.Setup.Start"', `cue="${value}"`);
  const other = readMdDefinitionDocument("other.xml", '<mdscript name="Other"><cues><cue name="Start"/><library name="Template"/></cues></mdscript>')!;
  const find = (source: string, caret: string, siblings?: MdDefinitionDocument[]) => {
    const parsed = readMdDefinitionDocument("setup.xml", source, source.indexOf(caret) + caret.length - 2);
    return parsed && resolveMdDefinition(parsed, siblings);
  };
  const definition = find(local("Start"), 'cue="Start"', [other]);
  ok("bare_resolves_in_own_script", JSON.stringify(definition) === JSON.stringify({ file: "setup.xml", line: 2, column: 15 }));
  ok("qualified_uses_mdscript_identity", find(local("md.Other.Start"), 'cue="md.Other.Start"', [other])?.file === "other.xml");
  ok("unknown_script_does_not_fall_back", !find(local("md.Unknown.Start"), 'cue="md.Unknown.Start"', [other]));
  ok("matching_name_with_wrong_case_is_unsupported", !find(local("start"), 'cue="start"', [other]));
  ok("computed_keyword_and_property_references_do_not_jump", ["$Start", "this", "this.Start", "parent.Start", "md.Setup.Start.status"].every(value =>
    !find(local(value), `cue="${value}"`, [other])));
  ok("duplicate_explicit_script_is_ambiguous", !find(local("md.Other.Start"), 'cue="md.Other.Start"', [other, other]));
  const duplicate = doc.replace("</cue>", '<cues><cue name="Start"/></cues></cue>');
  ok("duplicate_nested_declaration_is_ambiguous", !find(duplicate, 'cue="md.Setup.Start"'));
  const ghost = local("Ghost").replace("<cues>", '<cues><!-- <cue name="Ghost"/> --><![CDATA[<cue name="Ghost"/>]]>');
  ok("comments_and_cdata_are_not_declarations", !find(ghost, 'cue="Ghost"'));
  const ordinary = local("Start").replace('<signal_cue_instantly cue=', '<debug_text text=');
  ok("unrelated_attribute_is_not_a_reference", !find(ordinary, 'text="Start"'));
  const foreign = local("Start").replace("<actions>", '<actions xmlns="urn:foreign">');
  ok("foreign_namespace_is_not_a_reference", !find(foreign, 'cue="Start"'));
  ok("incomplete_authored_xml_has_no_target", !find(local("Start").replace("</cues>", ""), 'cue="Start"'));
  const library = doc.replace('<cue name="Start" instantiate="true">', "<cue name='Start' ref='md.Other.Templ&#97;te'>");
  ok("single_quote_and_entity_in_library_reference", find(library, "ref='md.Other.Templ&#97;te'", [other])?.file === "other.xml");
  ok("library_reference_cannot_target_plain_cue", !find(library.replace('Templ&#97;te', 'Start'), "ref='md.Other.Start'", [other]));
  const scoped = local("Inner").replace("</cues>", '<library name="Shell"><cues><cue name="Inner"/></cues></library></cues>');
  ok("library_subcue_cannot_be_named_by_ordinary_cue", !find(scoped, 'cue="Inner"'));
  const inside = scoped.replace('<library name="Shell">', '<library name="Shell"><actions><signal_cue cue="Inner"/></actions>');
  ok("library_subcue_resolves_for_own_library", !!find(inside.replace('cue="Inner"', 'cue="Absent"'), 'cue="Inner"'));
  const otherLibrary = readMdDefinitionDocument("library.xml", scoped.replace('name="Setup"', 'name="Foreign"'))!;
  ok("qualified_reference_cannot_target_foreign_library_subcue",
    !find(local("md.Foreign.Inner"), 'cue="md.Foreign.Inner"', [otherLibrary]));
  const inherited = local("Inner").replace("</cues>", '<cue name="FromLibrary" ref="Shell"><cues><cue name="Inner"/></cues></cue></cues>');
  ok("reference_instance_does_not_declare_ignored_child", !find(inherited, 'cue="Inner"'));
  const crlf = "\uFEFF" + local("Start").replaceAll("\n", "\r\n");
  ok("bom_and_crlf_keep_exact_destination", JSON.stringify(find(crlf, 'cue="Start"')) === JSON.stringify(definition));

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
