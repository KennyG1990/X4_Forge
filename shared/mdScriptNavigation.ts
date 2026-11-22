/**
 * Authored Mission Director navigation and rename planning.
 *
 * Literal MD definitions and references use authored XML and one declaration resolver.
 */

import {
  buildMdLibraryIndex, MD_CUE_KEYWORDS, mdReferenceArgumentNamespaceUnavailable, mdReferenceRole,
  parseMdScriptRoot, readMdLibrarySignature, readMdReferenceArguments, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryIndex, type MdLibraryScript, type MdLibrarySignature,
} from "./mdDeclarationResolution";
import type { Attr } from "@xmldom/xmldom";
import { Buffer } from "node:buffer";
import { createSourcePositionLocator, createXmlNodePositionLocator, decodedXmlAttributeCursor } from "./xmlSourcePosition";
import { parseExpressionChains } from "./expressionChains";
import { MAX_PROJECT_XML_DEPTH, maskXmlOpaqueMarkup, scanXmlTagTokens } from "./xmlMarkup";

export interface DefinitionLocation { file: string; line: number; column: number; }
interface NameSpan { start: number; end: number; }
interface DefinitionSource {
  location?: DefinitionLocation;
  libraryScope?: number;
  span?: NameSpan;
  signature?: MdLibrarySignature<DefinitionLocation>;
}
interface MdTargetReference {
  value: string;
  script?: string;
  library: boolean;
  libraryScope?: number;
}
interface LiteralReference extends MdTargetReference {
  location: DefinitionLocation;
  span?: NameSpan;
}
export type MdDefinitionDocument = MdLibraryScript<DefinitionSource, string> & {
  reference: LiteralReference | undefined;
  expressionReference?: { tag: string; attribute: string; target: MdTargetReference };
  declaration: MdLibraryDeclaration<DefinitionSource> | undefined;
  scriptNameSpan?: NameSpan;
  references: readonly LiteralReference[];
  referencesLimited?: true;
  renameGap?: string;
  call?: { role: "cue" | "run_actions"; ref: string; arguments: ReturnType<typeof readMdReferenceArguments<number>> };
};

interface MdDefinitionOptions {
  suspectValue?: (value: string) => boolean;
  includeSignatures?: boolean;
  includeNameSpans?: boolean;
  referenceName?: string;
  referenceScript?: string;
  referenceLimit?: number;
  expressionDefinition?: boolean;
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

/** Select the cue itself in a qualified expression chain, excluding string literals. */
function expressionCueAt(value: string, cursor: number, libraryScope?: number): MdTargetReference | undefined {
  const masked = value.replace(/'(?:\\[\s\S]|[^'\\])*'?|"(?:\\[\s\S]|[^"\\])*"?/g,
    match => ' '.repeat(match.length));
  for (const chain of parseExpressionChains(masked)) {
    const [script, cue] = chain.segments;
    if (chain.root.raw !== 'md' || script?.kind !== 'property' || script.optional || cue?.kind !== 'property') continue;
    const cueName = cue.optional ? cue.raw.slice(0, -1) : cue.raw;
    if (cursor < cue.start || cursor >= cue.start + cueName.length) continue;
    // Decline partial identifier and path matches in malformed chains.
    const before = /[\p{L}\p{N}\p{M}_.@$"']$/u.test(value.slice(0, chain.start));
    const after = /^[\p{L}\p{N}\p{M}_.$?"'[{]/u.test(value.slice(chain.end));
    if (before || after) continue;
    return { value: 'md.' + script.raw + '.' + cueName, script: script.raw, library: false, libraryScope };
  }
  return undefined;
}

/** Read literal cue references and declaration positions from the same authored bytes. */
export function readMdDefinitionDocument(
  file: string, text: string, cursor?: number, collectReferences = false,
  { suspectValue, includeSignatures, includeNameSpans, referenceName, referenceScript, referenceLimit, expressionDefinition, callStart }: MdDefinitionOptions = {},
): MdDefinitionDocument | undefined {
  if (text.length > MAX_MD_DEFINITION_SOURCE) return undefined;
  const root = parseMdScriptRoot(text);
  const name = root?.getAttribute("name");
  if (!root || !name || !IDENTIFIER.test(name) || root.ownerDocument?.doctype) return undefined;

  const locator = createXmlNodePositionLocator(text);
  const declarations: MdLibraryDeclaration<DefinitionSource>[] = [];
  const references: LiteralReference[] = [];
  let reference: LiteralReference | undefined;
  let expressionReference: MdDefinitionDocument["expressionReference"];
  let declaration: MdLibraryDeclaration<DefinitionSource> | undefined;
  let renameGap: string | undefined;
  let referencesLimited: true | undefined;
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
        const span = (suspectValue || includeNameSpans) && start !== undefined ? mdNameSpan(text, start, close, attr.value) : undefined;
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
        const collect = !!literal && collectReferences && (referenceName === undefined || literal[2] === referenceName)
          && (referenceScript === undefined || (literal[1] ?? name) === referenceScript);
        if (close > start && literal && (selected || collect)) {
          const raw = text.slice(start + 1, close);
          let nameAt = raw.match(/^(?:[ \t\r\n]|&#(?:0*(?:9|10|13|32)|x0*(?:9|a|d|20));)*/i)![0].length;
          if (literal[1]) {
            // A script qualifier can spell a dot as an XML numeric character entity.
            for (const separator of raw.matchAll(/\.|&#0*46;|&#x0*2e;/gi)) nameAt = separator.index + separator[0].length;
          }
          const span = suspectValue || includeNameSpans ? mdNameSpan(text, start, close, value) : undefined;
          const entry = { value, script: literal[1], library, libraryScope, location: location(locator.locateRaw(start + 1 + nameAt)), span };
          if (span) modeledReference = attr;
          if (selected) reference = entry;
          if (collect) {
            if (referenceLimit !== undefined && references.length >= referenceLimit) referencesLimited = true;
            else references.push(entry);
          }
        }
      }
    }
    if (!opaque && cursor !== undefined && expressionDefinition && !reference && !expressionReference
      && /^[a-z][a-z0-9_]*$/.test(tag)) {
      for (const attr of Array.from(element.attributes)) {
        if (attr.namespaceURI || !attr.value.includes('md.')) continue;
        const start = locator.offset(attr);
        if (start === undefined || cursor <= start || !locator.point(attr)) continue;
        const end = text.indexOf(text[start], start + 1);
        if (cursor >= end) continue;
        const decoded = decodedXmlAttributeCursor(text.slice(start + 1, end), attr.value, cursor - start - 1);
        if (decoded === undefined) continue;
        const target = expressionCueAt(attr.value, decoded, libraryScope);
        if (target) expressionReference = { tag, attribute: attr.name, target };
        break;
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
  const rootName = includeNameSpans ? root.getAttributeNode("name") : null;
  const start = rootName ? locator.offset(rootName) : undefined;
  const scriptNameSpan = start === undefined ? undefined : mdNameSpan(text, start, text.indexOf(text[start], start + 1), name);
  return { name, source: file, declarations, reference, expressionReference, declaration, references,
    ...(scriptNameSpan ? { scriptNameSpan } : {}), ...(referencesLimited ? { referencesLimited } : {}), renameGap, call };
}

function resolveReference(
  index: MdLibraryIndex<DefinitionSource, string>, origin: MdDefinitionDocument, ref: MdTargetReference,
): MdLibraryDeclaration<DefinitionSource> | undefined {
  const resolved = resolveMdLibraryReference(index, origin.name, ref.value, { cueReference: !ref.library });
  if (ref.library) return resolved?.library ?? undefined;
  const target = resolved?.declaration;
  if (!resolved || !target || target.name !== resolved.targetName || target.source.libraryScope !== ref.libraryScope) return undefined;
  if (ref.libraryScope !== undefined && resolved.script.source !== origin.source) return undefined;
  return target;
}

export function resolveMdDefinition(origin: MdDefinitionDocument, siblings: readonly MdDefinitionDocument[] = [],
  { allowExpression = false } = {}): DefinitionLocation | undefined {
  const target = origin.reference ?? (allowExpression ? origin.expressionReference?.target : undefined);
  if (!target) return undefined;
  const index = buildMdLibraryIndex([origin, ...siblings]);
  if (!origin.reference && index.get(origin.name.toLowerCase())?.source !== origin.source) return undefined;
  const declaration = resolveReference(index, origin, target);
  return origin.reference || declaration?.kind === "cue" ? declaration?.source.location : undefined;
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


export const MD_SCRIPT_NAVIGATION_LIMITS = Object.freeze({
  files: 512,
  fileBytes: MAX_MD_DEFINITION_SOURCE,
  totalBytes: 4 * MAX_MD_DEFINITION_SOURCE,
  references: 2_048,
  markupTokensPerFile: 100_000,
});

export interface MdScriptNavigationLocation {
  file: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

type MdScriptSnapshotResult =
  | { status: "resolved"; locations: MdScriptNavigationLocation[] }
  | { status: "not-found" | "not-a-literal" | "ambiguous" }
  | { status: "unavailable"; reason: "focus" | "inventory" | "source" | "limit" };

export function authoredNavigationMarkupIssue(text: string): "source" | "limit" | undefined {
  if (/<!DOCTYPE\b/.test(text) && /<!DOCTYPE\b/.test(maskXmlOpaqueMarkup(text))) return "source";
  let tokens = 0;
  let depth = 0;
  for (const { token, complete } of scanXmlTagTokens(text)) {
    if (++tokens > MD_SCRIPT_NAVIGATION_LIMITS.markupTokensPerFile) return "limit";
    if (!complete) return "source";
    if (token.startsWith("</")) depth--;
    else if (!token.endsWith("/>") && ++depth > MAX_PROJECT_XML_DEPTH + 1) return "limit";
  }
}

export function hasInvalidNavigationPathCharacters(value: string): boolean {
  return /[:<>"|?*]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32);
}

/** Use exact submitted bytes for static authored MD navigation. Paths are identifiers only. */
export function navigateAuthoredMdScriptSnapshot(input: {
  files: readonly { path: string; content?: string }[];
  path: string;
  offset: number;
  mode: "definition" | "references";
  includeDeclaration?: boolean;
}): MdScriptSnapshotResult {
  const directMdPath = /^md\/[^/\\]+\.xml$/i;
  if (!directMdPath.test(input.path) || hasInvalidNavigationPathCharacters(input.path)
    || !Number.isSafeInteger(input.offset) || input.offset < 0) {
    return { status: "unavailable", reason: "focus" };
  }
  const files = new Map<string, { path: string; content: string }>();
  let totalBytes = 0;
  for (const file of input.files) {
    const path = file.path.replace(/\\/g, "/");
    if (path.length > 1_024 || hasInvalidNavigationPathCharacters(path)
      || path.split("/").some(part => !part || part === "." || part === "..")) {
      return { status: "unavailable", reason: "inventory" };
    }
    if (!directMdPath.test(path)) continue;
    const key = path.toLowerCase();
    if (files.has(key)) return { status: "unavailable", reason: "inventory" };
    if (typeof file.content !== "string") return { status: "unavailable", reason: "source" };
    const bytes = Buffer.byteLength(file.content, "utf8");
    totalBytes += bytes;
    if (files.size >= MD_SCRIPT_NAVIGATION_LIMITS.files || bytes > MD_SCRIPT_NAVIGATION_LIMITS.fileBytes
      || totalBytes > MD_SCRIPT_NAVIGATION_LIMITS.totalBytes) return { status: "unavailable", reason: "limit" };
    files.set(key, { path, content: file.content });
  }
  const focus = files.get(input.path.toLowerCase());
  if (!focus || input.offset > focus.content.length) return { status: "unavailable", reason: "focus" };

  const focusIssue = authoredNavigationMarkupIssue(focus.content);
  if (focusIssue) return { status: "unavailable", reason: focusIssue };
  const findUses = input.mode === "references";
  const selection = readMdDefinitionDocument(focus.path, focus.content, input.offset, findUses,
    { includeNameSpans: true, referenceName: "" });
  if (!selection?.name) return { status: "unavailable", reason: "source" };
  const selectedRef = selection.reference;
  const targetName = selectedRef ? LITERAL_REFERENCE.exec(selectedRef.value)?.[2] : selection.declaration?.name;
  if (!targetName || (selectedRef && MD_CUE_KEYWORDS.has(selectedRef.value))) return { status: "not-a-literal" };

  const targetScript = selectedRef?.script ?? selection.name;
  const documents: MdDefinitionDocument[] = [];
  let referenceBudget: number = MD_SCRIPT_NAVIGATION_LIMITS.references;
  for (const file of files.values()) {
    if (file !== focus) {
      const issue = authoredNavigationMarkupIssue(file.content);
      if (issue) return { status: "unavailable", reason: issue };
    }
    if (!findUses && file === focus) {
      documents.push(selection);
      continue;
    }
    const parsed = readMdDefinitionDocument(file.path, file.content, file === focus ? input.offset : undefined, findUses,
      { includeNameSpans: true, referenceName: targetName, referenceScript: targetScript, referenceLimit: referenceBudget });
    if (!parsed?.name) return { status: "unavailable", reason: "source" };
    if (parsed.referencesLimited) return { status: "unavailable", reason: "limit" };
    referenceBudget -= parsed.references.length;
    documents.push(parsed);
  }
  const origin = documents.find(document => document.source === focus.path)!;
  const index = buildMdLibraryIndex(documents);
  const script = index.get(targetScript.toLowerCase());
  if (script === null
    || (findUses && index.get(origin.name.toLowerCase()) === null)
    || (script?.name === targetScript && script.declarations.get(targetName.toLowerCase()) === null)) {
    return { status: "ambiguous" };
  }
  const target = findUses ? selectedMdDeclaration(index, origin)
    : selectedRef && resolveReference(index, origin, selectedRef);
  if (!target) return { status: "not-found" };

  const locators = new Map<string, ReturnType<typeof createSourcePositionLocator>>();
  const toLocation = (file: string, span: NameSpan | undefined): MdScriptNavigationLocation | undefined => {
    if (!span) return undefined;
    let locate = locators.get(file);
    if (!locate) {
      const source = files.get(file.toLowerCase());
      if (!source) return undefined;
      locate = createSourcePositionLocator(source.content);
      locators.set(file, locate);
    }
    const start = locate(span.start);
    const end = locate(span.end);
    return { file, start: { line: start.line - 1, column: start.column - 1 },
      end: { line: end.line - 1, column: end.column - 1 } };
  };

  const definition = target.source.location && toLocation(target.source.location.file, target.source.span);
  if (!definition) return { status: "unavailable", reason: "source" };
  if (!findUses) return { status: "resolved", locations: [definition] };
  const locations = input.includeDeclaration ? [definition] : [];
  for (const document of documents) {
    const caller = index.get(document.name.toLowerCase());
    for (const reference of document.references) {
      if (resolveReference(index, document, reference) !== target) continue;
      if (!caller) return { status: "ambiguous" };
      const location = toLocation(document.source, reference.span);
      if (!location) return { status: "unavailable", reason: "source" };
      locations.push(location);
    }
  }
  locations.sort((a, b) => a.file === b.file
    ? a.start.line - b.start.line || a.start.column - b.start.column
    : a.file < b.file ? -1 : 1);
  return { status: "resolved", locations };
}
