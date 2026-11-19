/**
 * langNav.ts — B57s3 (2026-07-17): vscode-free cue navigation helpers.
 *
 * Literal MD definitions and references use authored XML and one declaration resolver.
 */

import {
  buildMdLibraryIndex, mdReferenceRole, parseMdScriptRoot, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryIndex, type MdLibraryScript,
} from "../../shared/mdDeclarationResolution";
import { createXmlNodePositionLocator } from "../../shared/xmlSourcePosition";
import { MAX_PROJECT_XML_DEPTH } from "../../shared/xmlMarkup";

interface DefinitionLocation { file: string; line: number; column: number; }
interface DefinitionSource { location?: DefinitionLocation; libraryScope?: number; }
interface LiteralReference {
  value: string;
  script?: string;
  library: boolean;
  libraryScope?: number;
  location: DefinitionLocation;
}
export type MdDefinitionDocument = MdLibraryScript<DefinitionSource, string> & {
  reference: LiteralReference | undefined;
  declaration: MdLibraryDeclaration<DefinitionSource> | undefined;
  references: readonly LiteralReference[];
};

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const LITERAL_REFERENCE = /^(?:md\.([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)$/;
// Direct cuename attributes in the X4 9.00 MD schema. The shared resolver already
// recognizes the signal, reset and cancel actions, as well as library references.
const CUE_ELEMENTS = new Set([
  "event_briefing_started", "event_briefing_cancelled", "event_briefing_submission_selected",
  "event_briefing_submission_unselected", "event_briefing_interact_button_clicked",
  "event_cue_activated", "event_cue_cancelled", "event_cue_completed", "event_cue_signalled",
  "event_guidance_disabled", "event_guidance_enabled", "event_mission_aborted",
  "event_offer_accepted", "event_online_offer_outdated",
  "cue_is_active", "cue_is_cancelled", "cue_is_complete", "cue_is_disabled", "cue_is_waiting", "guidance_is_active",
  "activate_mission", "complete_cue", "create_cue_actor", "create_mission", "accept_offer",
  "create_offer", "create_mission_thread", "create_mission_thread_offer", "force_cue",
  "pause_mission_timer", "unpause_mission_timer", "pause_objective_timer", "unpause_objective_timer",
  "remove_all_cue_actors", "remove_cue_actor", "remove_mission", "remove_offer",
  "set_objective", "set_objective_from_briefing", "update_objective_progress", "update_mission",
  "update_objective_endtime", "update_offer", "update_mission_thread", "update_mission_thread_offer",
]);
export const MAX_MD_DEFINITION_SOURCE = 8 * 1024 * 1024;

/** Read literal cue references and declaration positions from the same authored bytes. */
export function readMdDefinitionDocument(
  file: string, text: string, cursor?: number, collectReferences = false,
): MdDefinitionDocument | undefined {
  if (text.length > MAX_MD_DEFINITION_SOURCE) return undefined;
  const root = parseMdScriptRoot(text);
  const name = root?.getAttribute("name");
  if (!root || !name || !IDENTIFIER.test(name) || root.ownerDocument?.doctype) return undefined;

  const locator = createXmlNodePositionLocator(text);
  const declarations: MdLibraryDeclaration<DefinitionSource>[] = [];
  const references: LiteralReference[] = [];
  let reference: LiteralReference | undefined;
  let declaration: MdLibraryDeclaration<DefinitionSource> | undefined;
  const location = ({ line, column }: { line: number; column: number }) => ({ file, line: line - 1, column: column - 1 });
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
        const entry: MdLibraryDeclaration<DefinitionSource> = { name: attr.value, kind, purpose: element.getAttribute("purpose"),
          source: { libraryScope, location: point ? location(point) : undefined } };
        declarations.push(entry);
        if (collectReferences && point && cursor !== undefined) {
          const start = locator.offset(attr)!;
          if (cursor > start && cursor < text.indexOf(text[start], start + 1)) declaration = entry;
        }
      }
    }
    if (collectReferences || (cursor !== undefined && !reference)) {
      const role = mdReferenceRole(tag);
      const library = role === "cue" || role === "include_actions" || role === "run_actions";
      const attr = (role || CUE_ELEMENTS.has(tag)) && element.getAttributeNode(library ? "ref" : "cue");
      const start = attr ? locator.offset(attr) : undefined;
      if (attr && start !== undefined && locator.point(attr)) {
        const close = text.indexOf(text[start], start + 1);
        const value = attr.value.trim();
        const literal = LITERAL_REFERENCE.exec(value);
        const selected = cursor !== undefined && cursor > start && cursor < close;
        if (close > start && literal && (selected || collectReferences)) {
          const raw = text.slice(start + 1, close);
          let nameAt = raw.match(/^(?:[ \t\r\n]|&#(?:0*(?:9|10|13|32)|x0*(?:9|a|d|20));)*/i)![0].length;
          if (literal[1]) {
            // A script qualifier can spell a dot as an XML numeric character entity.
            for (const separator of raw.matchAll(/\.|&#0*46;|&#x0*2e;/gi)) nameAt = separator.index + separator[0].length;
          }
          const entry = { value, script: literal[1], library, libraryScope, location: location(locator.locateRaw(start + 1 + nameAt)) };
          if (selected) reference = entry;
          if (collectReferences) references.push(entry);
        }
      }
    }
    if (tag === "cue" && element.hasAttribute("ref")) continue;
    for (const child of Array.from(element.children)) pending.push({ element: child, depth: depth + 1, libraryScope });
  }
  return { name, source: file, declarations, reference, declaration, references };
}

function resolveReference(
  index: MdLibraryIndex<DefinitionSource, string>, origin: MdDefinitionDocument, ref: LiteralReference,
): MdLibraryDeclaration<DefinitionSource> | undefined {
  const resolved = resolveMdLibraryReference(index, origin.name, ref.value, { cueReference: !ref.library });
  if (ref.library) return resolved?.library ?? undefined;
  const target = resolved?.declaration;
  if (!resolved || !target || target.name !== resolved.targetName || target.source.libraryScope !== ref.libraryScope) return undefined;
  if (ref.libraryScope !== undefined && resolved.script.source !== origin.source) return undefined;
  return target;
}

export function resolveMdDefinition(origin: MdDefinitionDocument, siblings: readonly MdDefinitionDocument[] = []): DefinitionLocation | undefined {
  return origin.reference
    ? resolveReference(buildMdLibraryIndex([origin, ...siblings]), origin, origin.reference)?.source.location
    : undefined;
}

export function resolveMdReferences(
  origin: MdDefinitionDocument, siblings: readonly MdDefinitionDocument[], includeDeclaration: boolean,
): DefinitionLocation[] {
  const documents = [origin, ...siblings];
  const index = buildMdLibraryIndex(documents);
  const caller = index.get(origin.name.toLowerCase());
  if (!caller || caller.source !== origin.source) return [];
  const selected = origin.declaration;
  const target = origin.reference ? resolveReference(index, origin, origin.reference)
    : selected && caller.declarations.get(selected.name.toLowerCase()) === selected ? selected : undefined;
  if (!target?.source.location) return [];
  const locations = includeDeclaration ? [target.source.location] : [];
  for (const document of documents) {
    if (index.get(document.name.toLowerCase())?.source !== document.source) continue;
    for (const reference of document.references) {
      if (resolveReference(index, document, reference) === target) locations.push(reference.location);
    }
  }
  return locations;
}

/* ------------------------------------------------------------------ *
 * Selftest — run headlessly: npx tsx vscode-extension/src/langNav.ts
 * ------------------------------------------------------------------ */

export function runLangNavSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const doc = `<mdscript name="Setup" xmlns:xsi="x">\n  <cues>\n    <cue name="Start" instantiate="true">\n      <actions><signal_cue_instantly cue="md.Setup.Start"/></actions>\n    </cue>\n  </cues>\n</mdscript>`;
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

  const one = [
    '<mdscript name="One"><cues>',
    '<cue name="Shared"/>',
    '<library name="Template"/>',
    '<cue name="Made" ref="Template"/>',
    '<cue name="Caller"><actions><signal_cue cue="Shared"/>',
    '<debug_text text="\'Shared\'"/><signal_cue cue="md.Two.Shared"/>',
    '</actions></cue></cues></mdscript>',
  ].join("\n");
  const two = [
    '<mdscript name="Two"><cues>',
    '<cue name="Shared"/>',
    '<!-- <signal_cue cue="md.One.Shared"/> -->',
    '<cue name="Caller"><actions><signal_cue cue="md&#46;One&#x2e;Shared"/>',
    '<signal_cue cue="Shared"/></actions></cue></cues></mdscript>',
  ].join("\n");
  const snapshot = (file: string, xml: string, anchor?: string) =>
    readMdDefinitionDocument(file, xml, anchor ? xml.indexOf(anchor) + anchor.length - 2 : undefined, true)!;
  const remote = snapshot("two.xml", two);
  const uses = (anchor: string, includeDeclaration = false) =>
    resolveMdReferences(snapshot("one.xml", one, anchor), [remote], includeDeclaration)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const first = [
    { file: "one.xml", line: 4, column: one.split("\n")[4].indexOf("Shared") },
    { file: "two.xml", line: 3, column: two.split("\n")[3].indexOf("Shared") },
  ];
  ok("references_scope_and_authored_name_positions", JSON.stringify(uses('name="Shared"')) === JSON.stringify(first));
  ok("references_can_start_on_a_use", JSON.stringify(uses('cue="Shared"')) === JSON.stringify(first));
  ok("references_include_declaration_on_request", JSON.stringify(uses('name="Shared"', true)) === JSON.stringify([
    { file: "one.xml", line: 1, column: 11 }, ...first,
  ]));
  ok("qualified_reference_selects_the_other_script",
    uses('cue="md.Two.Shared"').map(result => result.file + result.line).join(",") === "one.xml5,two.xml4");
  ok("references_on_library_instances_report_the_call",
    JSON.stringify(uses('name="Template"')) === JSON.stringify([{ file: "one.xml", line: 3, column: 22 }]));
  ok("quoted_expression_cannot_start_reference_lookup", uses('text="\'Shared\'"').length === 0);
  ok("duplicate_script_suppresses_reference_authority", resolveMdReferences(snapshot("one.xml", one, 'name="Shared"'),
    [remote, snapshot("other.xml", one)], true).length === 0);
  ok("duplicate_name_suppresses_reference_authority",
    resolveMdReferences(snapshot("one.xml", one.replace('<library name=', '<cue name="Shared"/><library name='), 'name="Shared"'),
      [remote], true).length === 0);
  const scopedUses = [
    '<mdscript name="LibraryScript"><cues><library name="Owner"><cues><cue name="Inner"/>',
    '<cue name="Listener"><actions><signal_cue cue="Inner"/></actions></cue></cues></library>',
    '<cue name="Outside"><actions><signal_cue cue="Inner"/></actions></cue></cues></mdscript>',
  ].join("\n");
  ok("references_respect_library_ownership",
    resolveMdReferences(snapshot("scope.xml", scopedUses, 'name="Inner"'), [], false).map(result => result.line).join() === "1");
  const schemaUses = one.replace('<signal_cue cue="Shared"/>',
    '<remove_offer cue="&#32;Shared"/><event_cue_cancelled cue="Shared"/><unknown cue="Shared"/>');
  const actual = resolveMdReferences(snapshot("one.xml", schemaUses, 'name="Shared"'), [], false);
  const useLine = schemaUses.split("\n")[4];
  ok("schema_cue_attributes_include_actions_and_events", actual.length === 2);
  ok("references_skip_encoded_leading_space",
    actual.some(result => result.column === useLine.indexOf("Shared")));

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
