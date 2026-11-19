/**
 * langNav.ts — B57s3 (2026-07-17): vscode-free cue navigation helpers.
 *
 * Literal MD definitions and references use authored XML and one declaration resolver.
 */

import {
  buildMdLibraryIndex, MD_CUE_KEYWORDS, mdReferenceArgumentNamespaceUnavailable, mdReferenceRole,
  parseMdScriptRoot, readMdLibrarySignature, readMdReferenceArguments, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryIndex, type MdLibraryScript, type MdLibrarySignature,
} from "../../shared/mdDeclarationResolution";
import type { Attr } from "@xmldom/xmldom";
import { createXmlNodePositionLocator } from "../../shared/xmlSourcePosition";
import { MAX_PROJECT_XML_DEPTH } from "../../shared/xmlMarkup";

export interface DefinitionLocation { file: string; line: number; column: number; }
interface NameSpan { start: number; end: number; }
interface DefinitionSource {
  location?: DefinitionLocation;
  libraryScope?: number;
  span?: NameSpan;
  signature?: MdLibrarySignature<DefinitionLocation>;
}
interface LiteralReference {
  value: string;
  script?: string;
  library: boolean;
  libraryScope?: number;
  location: DefinitionLocation;
  span?: NameSpan;
}
export type MdDefinitionDocument = MdLibraryScript<DefinitionSource, string> & {
  reference: LiteralReference | undefined;
  declaration: MdLibraryDeclaration<DefinitionSource> | undefined;
  references: readonly LiteralReference[];
  renameGap?: string;
  call?: { role: "cue" | "run_actions"; ref: string; arguments: ReturnType<typeof readMdReferenceArguments<number>> };
};

interface MdDefinitionOptions {
  suspectValue?: (value: string) => boolean;
  includeSignatures?: boolean;
  callStart?: number;
}

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

/** Prove the raw terminal identifier before changing an XML attribute. */
function mdNameSpan(text: string, open: number, close: number, value: string): NameSpan | undefined {
  if (close <= open) return undefined;
  let decoded = "";
  let start: number | undefined;
  let end = open + 1;
  const raw = text.slice(open + 1, close);
  for (const match of raw.matchAll(/&#(?:\d+|x[\da-fA-F]+);|[\s\S]/g)) {
    const atom = match[0];
    const offset = open + 1 + match.index;
    const character = atom.startsWith("&#x") ? Number.parseInt(atom.slice(3, -1), 16)
      : atom.startsWith("&#") ? Number(atom.slice(2, -1)) : atom.charCodeAt(0);
    if (character > 127) return undefined;
    const token = String.fromCharCode(character);
    decoded += token;
    if (token === ".") start = undefined;
    else if (/[A-Za-z0-9_]/.test(token)) {
      start ??= offset;
      end = offset + atom.length;
    } else if (!/[ \t\r\n]/.test(token)) return undefined;
  }
  return start !== undefined && decoded.trim() === value ? { start, end } : undefined;
}

/** Read literal cue references and declaration positions from the same authored bytes. */
export function readMdDefinitionDocument(
  file: string, text: string, cursor?: number, collectReferences = false,
  { suspectValue, includeSignatures, callStart }: MdDefinitionOptions = {},
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
  let renameGap: string | undefined;
  let call: MdDefinitionDocument["call"];
  const location = ({ line, column }: { line: number; column: number }) => ({ file, line: line - 1, column: column - 1 });
  const pending = [{ element: root, depth: 0, libraryScope: undefined as number | undefined, opaque: false }];
  let seen = 0;
  while (pending.length) {
    const { element, depth, libraryScope: inheritedScope, opaque: opaqueParent } = pending.pop()!;
    if (++seen > 50_000 || depth > MAX_PROJECT_XML_DEPTH) return undefined;
    const opaque = opaqueParent || !!element.namespaceURI || !!element.getAttribute("xmlns");
    if (opaque && !suspectValue) continue;
    const tag = element.tagName;
    const kind = tag === "cue" || tag === "library" ? tag : undefined;
    const libraryScope = kind === "library" ? seen : inheritedScope;
    const container = element.parentElement;
    const owner = container?.parentElement;
    let declarationName;
    let modeledReference;
    const authoredDeclaration = container?.tagName === "cues" && (owner === root || owner?.tagName === "cue" || owner?.tagName === "library");
    if (!opaque && kind && authoredDeclaration) {
      const attr = element.getAttributeNode("name");
      const point = attr && locator.point(attr);
      if (attr && IDENTIFIER.test(attr.value)) {
        declarationName = attr;
        const start = point ? locator.offset(attr) : undefined;
        const close = start === undefined ? -1 : text.indexOf(text[start], start + 1);
        const span = suspectValue && start !== undefined ? mdNameSpan(text, start, close, attr.value) : undefined;
        const entry: MdLibraryDeclaration<DefinitionSource> = { name: attr.value, kind, purpose: element.getAttribute("purpose"),
          source: { libraryScope, location: point ? location(point) : undefined, span } };
        if (includeSignatures && kind === "library") {
          entry.source.signature = readMdLibrarySignature(element, node => {
            const paramName = node.nodeType === 1 ? (node as typeof element).getAttributeNode("name") : null;
            const position = (paramName && locator.point(paramName)) || locator.point(node);
            return position ? location(position) : undefined;
          }, { namespaceAware: true, includePresentation: true });
        }
        declarations.push(entry);
        if (collectReferences && cursor !== undefined && start !== undefined && cursor > start && cursor < close) declaration = entry;
      }
      if (suspectValue && !declarationName) renameGap ??= `A <${tag}> declaration has an unsupported name in ${file}.`;
    }
    if (!opaque && callStart !== undefined && (tag === "run_actions" || (tag === "cue" && authoredDeclaration))
      && locator.offset(element) === callStart && !mdReferenceArgumentNamespaceUnavailable(element)) {
      const ref = element.getAttribute("ref")?.trim();
      if (ref && LITERAL_REFERENCE.test(ref)) {
        call = { role: tag, ref, arguments: readMdReferenceArguments(element, node => {
          const ownerElement = node.nodeType === 2 ? (node as Attr).ownerElement : undefined;
          return locator.offset(ownerElement ?? node);
        }) };
      }
    }
    if (!opaque && (collectReferences || (cursor !== undefined && !reference))) {
      const role = mdReferenceRole(tag);
      const library = role === "cue" || role === "include_actions" || role === "run_actions";
      const attr = (role || CUE_ELEMENTS.has(tag)) && element.getAttributeNode(library ? "ref" : "cue");
      const start = attr ? locator.offset(attr) : undefined;
      if (suspectValue && attr && !LITERAL_REFERENCE.test(attr.value.trim())) {
        renameGap ??= `The ${tag}/@${attr.name} reference in ${file} uses an expression Forge cannot rename safely.`;
      }
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
          const span = suspectValue ? mdNameSpan(text, start, close, value) : undefined;
          const entry = { value, script: literal[1], library, libraryScope, location: location(locator.locateRaw(start + 1 + nameAt)), span };
          if (span) modeledReference = attr;
          if (selected) reference = entry;
          if (collectReferences) references.push(entry);
        }
      }
    }
    if (suspectValue && !renameGap) {
      for (const attr of Array.from(element.attributes)) {
        if (attr === declarationName || attr === modeledReference || (element === root && attr.name === "name")) continue;
        // The MD schema uses its prose-only comment type here.
        if (!opaque && attr.name === "comment") continue;
        const value = attr.value.trim();
        if ((!opaque && (attr.name === "exact" || (tag === "debug_text" && attr.name === "text")))
          && /^'(?:\\.|[^'\\])*'$/.test(value)) continue;
        if (suspectValue(value)) {
          renameGap = `An unsupported use in ${tag}/@${attr.name} could refer to this name in ${file}.`;
          break;
        }
      }
    }
    const instance = tag === "cue" && element.hasAttribute("ref");
    if (instance && !suspectValue) continue;
    for (const child of Array.from(element.children)) pending.push({ element: child, depth: depth + 1, libraryScope, opaque: opaque || instance });
  }
  return { name, source: file, declarations, reference, declaration, references, renameGap, call };
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
  const target = selectedMdDeclaration(index, origin);
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

function selectedMdDeclaration(index: MdLibraryIndex<DefinitionSource, string>, origin: MdDefinitionDocument) {
  const caller = index.get(origin.name.toLowerCase());
  if (!caller || caller.source !== origin.source) return undefined;
  const selected = origin.declaration;
  return origin.reference ? resolveReference(index, origin, origin.reference)
    : selected && caller.declarations.get(selected.name.toLowerCase()) === selected ? selected : undefined;
}

export interface MdRenameSource { file: string; text: string; }
export interface MdRenameEdit extends NameSpan { file: string; before: string; after: string; }
export type MdRenamePlan = { reason: string } | {
  script: string; kind: "cue" | "library"; oldName: string; newName: string; edits: MdRenameEdit[];
};

/** Compare identities by structural ordinal, which is stable across identifier edits. */
function mdRenameInventory(documents: readonly MdDefinitionDocument[]): { reason: string } | {
  index: MdLibraryIndex<DefinitionSource, string>;
  identities: Map<MdLibraryDeclaration<DefinitionSource>, string>;
  uses: { document: MdDefinitionDocument; reference: LiteralReference; target?: MdLibraryDeclaration<DefinitionSource> }[];
} {
  const index = buildMdLibraryIndex(documents);
  const identities = new Map<MdLibraryDeclaration<DefinitionSource>, string>();
  for (const [fileOrdinal, document] of documents.entries()) {
    const script = index.get(document.name.toLowerCase());
    if (!script) return { reason: `Mission Director script ${document.name} is declared more than once.` };
    for (const [ordinal, declaration] of document.declarations.entries()) {
      if (script.declarations.get(declaration.name.toLowerCase()) !== declaration) {
        return { reason: `Mission Director name ${document.name}.${declaration.name} is ambiguous.` };
      }
      if (!declaration.source.span) return { reason: `The name in ${document.source} has no verified source range.` };
      identities.set(declaration, `${fileOrdinal}:${ordinal}`);
    }
  }
  const uses = documents.flatMap(document => document.references.map(reference => ({ document, reference,
    target: resolveReference(index, document, reference),
  })));
  return { index, identities, uses };
}

/** Build and verify a read-only plan for an already captured authored MD inventory. */
export function planMdRename(
  sources: readonly MdRenameSource[], file: string, cursor: number, newName: string,
): MdRenamePlan {
  if (!IDENTIFIER.test(newName) || MD_CUE_KEYWORDS.has(newName.toLowerCase())) {
    return { reason: "Enter an unreserved Mission Director identifier using letters, digits or underscores." };
  }
  const selected = sources.find(source => source.file === file);
  if (!selected) return { reason: "The selected file is outside the reviewed Mission Director inventory." };
  const selection = readMdDefinitionDocument(file, selected.text, cursor, true);
  if (!selection) return { reason: `Forge could not fully inspect ${file}. Check for an XML patch, malformed XML or an oversized script.` };
  const oldName = selection.reference?.value.split(".").pop() ?? selection.declaration?.name;
  if (!oldName || MD_CUE_KEYWORDS.has(oldName.toLowerCase())) {
    return { reason: "Place the cursor on an authored cue or library name or one of its supported literal references." };
  }
  if (oldName === newName) return { reason: "The new name is already in use by this declaration." };

  const suspect = new RegExp(`(?<![\\w$])(?:${oldName}|${newName})(?!\\w)`, "i");
  const originals: MdDefinitionDocument[] = [];
  const sourceByFile = new Map<string, string>();
  for (const source of sources) {
    const document = readMdDefinitionDocument(source.file, source.text, source.file === file ? cursor : undefined, true,
      { suspectValue: value => suspect.test(value) });
    if (sourceByFile.has(source.file) || !document) {
      return { reason: `Forge could not fully inspect ${source.file}. Check for an XML patch, malformed XML or an oversized script.` };
    }
    if (document.renameGap) return { reason: document.renameGap };
    originals.push(document);
    sourceByFile.set(source.file, source.text);
  }
  const before = mdRenameInventory(originals);
  if ("reason" in before) return { reason: before.reason };
  const origin = originals.find(document => document.source === file)!;
  const selectedSpan = origin.reference?.span ?? origin.declaration?.source.span;
  if (!selectedSpan || cursor < selectedSpan.start || cursor > selectedSpan.end) {
    return { reason: "Place the cursor on the cue or library name. Rename preserves the script qualifier." };
  }
  const target = selectedMdDeclaration(before.index, origin);
  if (!target?.source.location || !target.source.span) return { reason: "The selected name has no unique authored declaration." };
  const targetFile = target.source.location.file;
  const script = originals.find(document => document.source === targetFile)!.name;
  const collision = before.index.get(script.toLowerCase())!.declarations.get(newName.toLowerCase());
  if (collision && collision !== target) return { reason: `The script ${script} already declares ${newName}.` };

  const editsByFile = new Map<string, MdRenameEdit[]>();
  const edit = (targetPath: string, span: NameSpan) => {
    const fileEdits = editsByFile.get(targetPath) ?? [];
    fileEdits.push({ ...span, file: targetPath, before: sourceByFile.get(targetPath)!.slice(span.start, span.end), after: newName });
    editsByFile.set(targetPath, fileEdits);
  };
  edit(targetFile, target.source.span);
  for (const use of before.uses) {
    if (!use.reference.span) return { reason: `A reference in ${use.document.source} has no verified source range.` };
    if (use.target === target) edit(use.document.source, use.reference.span);
  }

  const changed: MdDefinitionDocument[] = [];
  for (const original of originals) {
    const fileEdits = editsByFile.get(original.source);
    if (!fileEdits) { changed.push(original); continue; }
    let text = sourceByFile.get(original.source)!;
    let lastStart = text.length;
    for (const replacement of fileEdits.sort((a, b) => b.start - a.start)) {
      if (replacement.end > lastStart) return { reason: `Overlapping name ranges in ${original.source}.` };
      text = text.slice(0, replacement.start) + replacement.after + text.slice(replacement.end);
      lastStart = replacement.start;
    }
    const edited = readMdDefinitionDocument(original.source, text, undefined, true, { suspectValue: value => suspect.test(value) });
    if (!edited || edited.renameGap || edited.declarations.length !== original.declarations.length
      || edited.references.length !== original.references.length) {
      return { reason: `The proposed edits change the script structure in ${original.source}.` };
    }
    changed.push(edited);
  }
  const after = mdRenameInventory(changed);
  if ("reason" in after) return { reason: after.reason };
  for (const [ordinal, use] of before.uses.entries()) {
    const next = after.uses[ordinal];
    if ((use.target && before.identities.get(use.target)) !== (next.target && after.identities.get(next.target))) {
      return { reason: `The proposed rename would change the binding of ${use.reference.value} in ${use.document.source}.` };
    }
  }
  return { script, kind: target.kind, oldName, newName, edits: [...editsByFile.values()].flat() };
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

  const renameFile = "md/one.xml";
  const renameSource = "\uFEFF" + [
    '<mdscript name="One"><cues><cue name="Shared"><actions>',
    '<signal_cue cue="Shared" comment="Tell Shared to start"/><set_value name="$hint" exact="\'Shared\'"/>',
    '</actions></cue><library name="Templ&#97;te"/></cues></mdscript>',
  ].join("\r\n");
  const remoteFile = "md/two.xml";
  const remoteSource = [
    '<mdscript name="Two"><cues><cue name="Shared"><actions>',
    '<signal_cue cue="Shared"/><signal_cue cue="md.One.Sh&#97;red"/>',
    '</actions></cue><!-- Shared -->',
    "<cue name='Instance' ref='&#32;md&#46;One&#x2e;Templ&#97;te&#32;'/></cues></mdscript>",
  ].join("\r\n");
  const renameInputs = [{ file: renameFile, text: renameSource }, { file: remoteFile, text: remoteSource }];
  const plan = (newName: string, inputs = renameInputs, source = renameFile, word = 'name="Shared"') =>
    planMdRename(inputs, source, inputs.find(input => input.file === source)!.text.indexOf(word) + word.length - 2, newName);
  const apply = (result: MdRenamePlan, file: string, input: string) => {
    if ("reason" in result) return undefined;
    for (const edit of result.edits.filter(edit => edit.file === file).sort((a, b) => b.start - a.start)) {
      if (input.slice(edit.start, edit.end) !== edit.before) return undefined;
      input = input.slice(0, edit.start) + edit.after + input.slice(edit.end);
    }
    return input;
  };
  const cuePlan = plan("Renamed");
  ok("rename_cue_exact_spans_two_scripts", "edits" in cuePlan && cuePlan.edits.length === 3
    && apply(cuePlan, renameFile, renameSource) === renameSource.replace('name="Shared"', 'name="Renamed"').replace('cue="Shared"', 'cue="Renamed"')
    && apply(cuePlan, remoteFile, remoteSource) === remoteSource.replace('Sh&#97;red', 'Renamed'),
    "reason" in cuePlan ? cuePlan.reason : undefined);
  const libraryPlan = plan("NewTemplate", renameInputs, remoteFile, "Templ&#97;te");
  ok("rename_library_from_encoded_reference_preserves_instance_and_qualifiers", "edits" in libraryPlan && libraryPlan.edits.length === 2
    && apply(libraryPlan, renameFile, renameSource) === renameSource.replace('Templ&#97;te', 'NewTemplate')
    && apply(libraryPlan, remoteFile, remoteSource) === remoteSource.replace('Templ&#97;te', 'NewTemplate'),
    "reason" in libraryPlan ? libraryPlan.reason : undefined);
  const withAction = (action: string) => renameInputs.map(source => source.file === remoteFile
    ? { ...source, text: source.text.replace('<actions>', `<actions>${action}`) } : source);
  const capture = plan("Future", withAction('<signal_cue cue="md.One.Future"/>'));
  ok("rename_rejects_capture_of_previously_unresolved_reference", "reason" in capture && capture.reason.includes("binding"));
  const expression = plan("Renamed", withAction("<set_value name='$a' exact='md.One.Shared.$Value'/>"));
  ok("rename_refuses_unmodeled_property_use_in_single_quoted_xml", "reason" in expression && expression.reason.includes("unsupported use"));
  const dynamic = plan("Renamed", withAction('<signal_cue cue="$which"/>'));
  ok("rename_refuses_opaque_cue_operand", "reason" in dynamic && dynamic.reason.includes("cannot rename safely"));
  const collision = plan("Template");
  ok("rename_refuses_casefolded_collisions", "reason" in collision && collision.reason.includes("already declares"));
  ok("rename_refuses_structural_keywords", "reason" in plan("THIS"));
  const malformed = plan("Renamed", [...renameInputs, { file: "md/bad.xml", text: "<diff>" }]);
  ok("rename_refuses_uninspected_script_or_patch", "reason" in malformed && malformed.reason.includes("bad.xml"));
  const duplicatePlan = plan("Renamed", [...renameInputs, { file: "md/duplicate.xml", text: renameSource }]);
  ok("rename_refuses_duplicate_script_identity", "reason" in duplicatePlan && duplicatePlan.reason.includes("more than once"));
  const caseChange = plan("shared");
  ok("rename_accepts_unambiguous_case_only_change", "edits" in caseChange && caseChange.edits.length === 3);
  const qualifier = planMdRename(renameInputs, remoteFile, remoteSource.indexOf("md.One.") + 4, "Renamed");
  ok("rename_requires_caret_on_terminal_name", "reason" in qualifier && qualifier.reason.includes("script qualifier"));

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
