/** Final MD library-purpose facts. DOM ownership is consumed here, never retained in the project result. */
import type { Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom';
import {
  buildMdLibraryIndex, parseMdScriptRoot, resolveMdLibraryReference,
  type MdLibraryDeclaration, type MdLibraryResolution,
} from './cueLineage';
import type { DiffElementProvenance, DiffSourcePoint } from './diffSimulator';
import type { ProjectCrossFileFinding } from './projectCrossFileValidation';
import { createXmlNodePositionLocator } from './xmlSourceSpans';

export const EFFECTIVE_INCLUDE_PURPOSE_CODE = 'md.include_actions_run_library';
export const EFFECTIVE_INCLUDE_PURPOSE_CHECK = 'md.include_actions_context';
const MAX_ELEMENTS = 50_000;
const MAX_SOURCE_CHARS = 8 * 1024 * 1024;

interface SourcePoint {
  file: string;
  operation?: number;
  line?: number;
  column?: number;
  reason?: string;
}
interface DeclarationFact {
  id: string;
  name: string;
  kind: 'cue' | 'library';
  purpose: string | null;
  inherited: boolean;
  point?: SourcePoint;
  namePoint?: SourcePoint;
  purposePoint?: SourcePoint;
}
interface IncludeFact {
  id: string;
  ref: string;
  inherited: boolean;
  originalRef?: string;
  point?: SourcePoint;
  refPoint?: SourcePoint;
}
interface ScriptSnapshot {
  name: string;
  declarations: readonly DeclarationFact[];
}
export type MdLibraryBaseline =
  | { readonly status: 'known'; readonly script: ScriptSnapshot }
  | { readonly status: 'absent' | 'unavailable'; readonly reason?: string };
interface InventoryChange { name: string; point?: SourcePoint }
export interface MdEffectiveLibraryFacts {
  readonly file: string;
  readonly mode: 'plain' | 'diff';
  readonly name: string;
  readonly declarations: readonly DeclarationFact[];
  readonly includes: readonly IncludeFact[];
  readonly baseline: MdLibraryBaseline;
  readonly namePoint?: SourcePoint;
  readonly inventoryChanges: readonly InventoryChange[];
  readonly gaps: readonly string[];
}
export type MdEffectiveLibraryInput = MdEffectiveLibraryFacts | { readonly file: string; readonly unavailable: string };
export type EffectiveIncludePurposeFinding = ProjectCrossFileFinding & { sourceRef: string };

function sourcePoint(file: string, source: DiffSourcePoint | undefined): SourcePoint | undefined {
  if (!source) return undefined;
  return Object.freeze({ file, operation: source.operation,
    line: source.line, column: source.column, reason: source.reason });
}
function usable(point: SourcePoint | undefined): point is SourcePoint & { line: number; column: number } {
  return !!point && !point.reason && Number.isInteger(point.line) && Number.isInteger(point.column)
    && (point.line ?? 0) > 0 && (point.column ?? 0) > 0;
}
function elements(root: XmlElement): XmlElement[] | null {
  const out: XmlElement[] = [];
  const pending = [root];
  while (pending.length) {
    const element = pending.pop();
    if (!element) break;
    out.push(element);
    if (out.length > MAX_ELEMENTS) return null;
    for (let index = element.childNodes.length - 1; index >= 0; index--) {
      const child = element.childNodes[index];
      if (child.nodeType === 1) pending.push(child as XmlElement);
    }
  }
  return out;
}
function kind(name: string): 'cue' | 'library' | null {
  return name === 'cue' || name === 'library' ? name : null;
}
function freezeFacts(facts: MdEffectiveLibraryFacts): MdEffectiveLibraryFacts {
  return Object.freeze({ ...facts,
    baseline: Object.freeze(facts.baseline),
    declarations: Object.freeze(facts.declarations.map(value => Object.freeze(value))),
    includes: Object.freeze(facts.includes.map(value => Object.freeze(value))),
    inventoryChanges: Object.freeze(facts.inventoryChanges.map(value => Object.freeze(value))),
    gaps: Object.freeze([...facts.gaps]),
  });
}

/** A canonical-before view for a participating plain path; no unrelated corpus scan. */
export function canonicalMdLibraryBaseline(content: string): MdLibraryBaseline {
  if (content.length > MAX_SOURCE_CHARS) return { status: 'unavailable', reason: 'Canonical MD source exceeds the context source budget.' };
  const root = parseMdScriptRoot(content);
  const nodes = root && elements(root);
  if (!root || !nodes) return { status: 'unavailable', reason: 'Canonical MD declarations could not be read within the context limits.' };
  const declarations = nodes.flatMap((node, index): DeclarationFact[] => {
    const declarationKind = kind(node.nodeName);
    const name = node.getAttribute('name');
    return declarationKind && name ? [{ id: `b:${index}`, name, kind: declarationKind,
      purpose: node.getAttribute('purpose'), inherited: true }] : [];
  });
  return Object.freeze({ status: 'known', script: Object.freeze({ name: root.getAttribute('name') || '',
    declarations: Object.freeze(declarations.map(value => Object.freeze(value))) }) });
}

/** Complete project source is authored, even when its bytes also exist in the corpus. */
export function plainMdLibraryPurposeFacts(file: string, content: string, baseline: MdLibraryBaseline): MdEffectiveLibraryInput {
  if (content.length > MAX_SOURCE_CHARS) return { file, unavailable: 'Plain MD source exceeds the context source budget.' };
  const root = parseMdScriptRoot(content);
  const nodes = root && elements(root);
  if (!root || !nodes) return { file, unavailable: 'Plain MD source could not be read within the context limits.' };
  const locator = createXmlNodePositionLocator(content);
  const authoredPoint = (node: XmlNode | undefined): SourcePoint | undefined => {
    const position = node && locator.point(node);
    return position ? Object.freeze({ file, ...position }) : undefined;
  };
  const declarations: DeclarationFact[] = [];
  const includes: IncludeFact[] = [];
  for (const [index, node] of nodes.entries()) {
    const declarationKind = kind(node.nodeName);
    const name = node.getAttribute('name');
    if (declarationKind && name) declarations.push({ id: `p:${index}`, name, kind: declarationKind,
      purpose: node.getAttribute('purpose'), inherited: false, point: authoredPoint(node),
      namePoint: authoredPoint(node.getAttributeNode('name') ?? undefined),
      purposePoint: authoredPoint(node.getAttributeNode('purpose') ?? undefined) });
    if (node.nodeName === 'include_actions') includes.push({ id: `p:${index}`, ref: node.getAttribute('ref') || '',
      inherited: false, point: authoredPoint(node), refPoint: undefined });
  }
  const inventoryChanges: InventoryChange[] = [];
  if (baseline.status === 'known') {
    const finalCounts = new Map<string, number>();
    for (const declaration of declarations) {
      const key = declaration.name.toLowerCase();
      finalCounts.set(key, (finalCounts.get(key) || 0) + 1);
    }
    const beforeCounts = new Map<string, number>();
    for (const declaration of baseline.script.declarations) {
      const key = declaration.name.toLowerCase();
      beforeCounts.set(key, (beforeCounts.get(key) || 0) + 1);
    }
    for (const [name, count] of beforeCounts) {
      if (count > (finalCounts.get(name) || 0)) inventoryChanges.push({ name, point: authoredPoint(root) });
    }
  }
  return freezeFacts({ file, mode: 'plain', name: root.getAttribute('name') || '', declarations, includes,
    baseline, namePoint: authoredPoint(root.getAttributeNode('name') ?? root), inventoryChanges, gaps: [] });
}

/** Consume final attachment and frozen initial identities while the one-document DOM is in scope. */
export function diffMdLibraryPurposeFacts(file: string, trace: DiffElementProvenance | undefined): MdEffectiveLibraryInput {
  if (!trace?.available || !trace.document?.documentElement) {
    return { file, unavailable: trace?.reason || 'Final MD element provenance is unavailable.' };
  }
  const root = trace.document.documentElement;
  const nodes = elements(root);
  if (root.nodeName !== 'mdscript' || !nodes) return { file, unavailable: 'The final MD root or bounded element inventory is unavailable.' };
  const initialRoot = [...trace.initial.values()].find(state => state.parent === null && state.elementName === 'mdscript');
  if (!initialRoot) return { file, unavailable: 'The canonical-before MD identity snapshot is unavailable.' };
  const beforeDeclarations: DeclarationFact[] = [];
  for (const state of trace.initial.values()) {
    const declarationKind = kind(state.elementName);
    if (declarationKind && state.attributes.name) beforeDeclarations.push({ id: `b:${state.id}`,
      name: state.attributes.name, kind: declarationKind, purpose: state.attributes.purpose ?? null, inherited: true });
  }
  const baseline: MdLibraryBaseline = Object.freeze({ status: 'known', script: Object.freeze({
    name: initialRoot.attributes.name || '', declarations: Object.freeze(beforeDeclarations.map(value => Object.freeze(value))),
  }) });
  const declarations: DeclarationFact[] = [];
  const includes: IncludeFact[] = [];
  const inventoryChanges: InventoryChange[] = [];
  const attached = new Set(nodes);
  const insertedOrdinals = new Map<XmlElement, number>();
  for (const node of trace.elements.keys()) insertedOrdinals.set(node, insertedOrdinals.size);
  const identity = (node: XmlElement): string => {
    const original = trace.initial.get(node);
    if (original) return `b:${original.id}`;
    const origin = trace.elements.get(node);
    // A bounded trace-order ordinal distinguishes copies inserted into previously
    // authored parents. Baseline matching always uses frozen original identity.
    return `a:${origin?.operation}:${origin?.line}:${origin?.column}:${insertedOrdinals.get(node)}`;
  };
  for (const node of nodes) {
    const original = trace.initial.get(node);
    const origins = trace.attributes.get(node);
    const point = sourcePoint(file, trace.elements.get(node));
    const declarationKind = kind(node.nodeName);
    const name = node.getAttribute('name');
    if (declarationKind && name) declarations.push({ id: identity(node), name, kind: declarationKind,
      purpose: node.getAttribute('purpose'), inherited: !!original, point,
      namePoint: sourcePoint(file, origins?.get('name')),
      purposePoint: sourcePoint(file, origins?.get('purpose')) });
    if (declarationKind && original?.attributes.name && original.attributes.name !== name) {
      inventoryChanges.push({ name: original.attributes.name.toLowerCase(), point: sourcePoint(file, origins?.get('name')) ?? point });
    }
    if (node.nodeName === 'include_actions') includes.push({ id: identity(node), ref: node.getAttribute('ref') || '',
      inherited: original?.elementName === 'include_actions', originalRef: original?.attributes.ref,
      point, refPoint: sourcePoint(file, origins?.get('ref')) });
  }
  for (const [node, state] of trace.initial) {
    if (attached.has(node) || !kind(state.elementName) || !state.attributes.name) continue;
    inventoryChanges.push({ name: state.attributes.name.toLowerCase(), point: sourcePoint(file, trace.removed.get(node)) });
  }
  return freezeFacts({ file, mode: 'diff', name: root.getAttribute('name') || '', declarations, includes, baseline,
    namePoint: sourcePoint(file, trace.attributes.get(root)?.get('name')) ?? sourcePoint(file, trace.elements.get(root)),
    // Trace gaps may describe nodes overwritten or removed later. Only a final
    // fact actually used below may make an authored-position check unavailable.
    inventoryChanges, gaps: [] });
}

type Resolution = MdLibraryResolution<DeclarationFact, MdEffectiveLibraryFacts>;
function sameContract(before: Resolution, after: Resolution): boolean {
  if (!before.library || !after.library || before.script.source.file !== after.script.source.file) return false;
  if (after.script.source.mode === 'diff' && before.library.source.id !== after.library.source.id) return false;
  return before.library.name === after.library.name && before.library.kind === after.library.kind
    && before.library.purpose === after.library.purpose;
}

function declarationIdentity(mode: MdEffectiveLibraryFacts['mode'], declaration: DeclarationFact): string {
  return mode === 'diff' ? declaration.id : JSON.stringify([declaration.kind, declaration.name]);
}

/** Choose equivalent causal witnesses without depending on project enumeration order. */
function compareSourcePoints(left: SourcePoint, right: SourcePoint): number {
  const text = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1;
  const numeric = (a: number | undefined, b: number | undefined) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER);
  return Number(!usable(left)) - Number(!usable(right))
    || text(left.file, right.file)
    || numeric(left.line, right.line)
    || numeric(left.column, right.column)
    || numeric(left.operation, right.operation)
    || text(left.reason ?? '', right.reason ?? '');
}

/**
 * One final project index; this runs only the existing include-purpose predicate.
 * Any unavailable input makes inventory completeness unknowable: its final script
 * identity might collide with a known one. In that case no effective inference is
 * returned; the caller preserves the existing authored-only rule and these gaps.
 */
export function evaluateEffectiveMdLibraryPurpose(inputs: readonly MdEffectiveLibraryInput[]): {
  findings: EffectiveIncludePurposeFinding[];
  gaps: Array<{ filePath: string; reason: string }>;
  incompleteInventory: boolean;
} {
  const documents: MdEffectiveLibraryFacts[] = [];
  const gaps: Array<{ filePath: string; reason: string }> = [];
  const findings: EffectiveIncludePurposeFinding[] = [];
  let incompleteInventory = false;
  const gapKeys = new Set<string>();
  const addGap = (filePath: string, reason: string) => {
    const bounded = reason.slice(0, 480);
    const key = JSON.stringify([filePath, bounded]);
    if (!gapKeys.has(key)) { gapKeys.add(key); gaps.push({ filePath, reason: bounded }); }
  };
  for (const input of inputs) {
    if ('unavailable' in input) {
      incompleteInventory = true;
      addGap(input.file, `Effective MD inventory is incomplete; no new effective include-purpose inference was made. ${input.unavailable}`);
      continue;
    }
    documents.push(input);
    for (const reason of input.gaps) addGap(input.file, reason);
  }
  if (incompleteInventory) return { findings, gaps, incompleteInventory };
  const wrap = (declarations: readonly DeclarationFact[]): MdLibraryDeclaration<DeclarationFact>[] => declarations
    .map(declaration => ({ name: declaration.name, kind: declaration.kind, purpose: declaration.purpose, source: declaration }));
  const finalIndex = buildMdLibraryIndex(documents.map(document => ({ name: document.name,
    declarations: wrap(document.declarations), source: document })));
  const beforeIndex = buildMdLibraryIndex(documents.flatMap(document => document.baseline.status === 'known'
    ? [{ name: document.baseline.script.name, declarations: wrap(document.baseline.script.declarations), source: document }] : []));
  const beforeInventoryUnavailable = documents.some(document => document.baseline.status === 'unavailable');
  // Identity and causality lookups are linear to build, then constant per call.
  // They are not a second reference resolver and never grant target authority.
  const originals = new Map<MdEffectiveLibraryFacts, Map<string, DeclarationFact | null>>();
  const inventoryChanges = new Map<MdEffectiveLibraryFacts, Map<string, SourcePoint | undefined>>();
  const scriptChanges = new Map<string, SourcePoint[]>();
  for (const document of documents) {
    const declarations = new Map<string, DeclarationFact | null>();
    if (document.baseline.status === 'known') {
      for (const declaration of document.baseline.script.declarations) {
        const key = declarationIdentity(document.mode, declaration);
        declarations.set(key, declarations.has(key) ? null : declaration);
      }
      if (document.name !== document.baseline.script.name) {
        const key = document.baseline.script.name.toLowerCase();
        const candidates = scriptChanges.get(key) ?? [];
        candidates.push(document.namePoint ?? Object.freeze({ file: document.file,
          reason: 'A changed script identity has no reliable authored source position.' }));
        scriptChanges.set(key, candidates);
      }
    }
    originals.set(document, declarations);
    const changedNames = new Map<string, SourcePoint | undefined>();
    for (const change of document.inventoryChanges) changedNames.set(change.name, change.point);
    inventoryChanges.set(document, changedNames);
  }
  for (const candidates of scriptChanges.values()) candidates.sort(compareSourcePoints);
  for (const document of documents) for (const call of document.includes) {
    const resolved = resolveMdLibraryReference(finalIndex, document.name, call.ref);
    const refChanged = !call.inherited || (call.originalRef ?? '').trim() !== call.ref.trim();
    const before = call.inherited && document.baseline.status === 'known'
      ? resolveMdLibraryReference(beforeIndex, document.baseline.script.name, call.originalRef || '') : null;
    if (!resolved?.library) {
      if (document.mode === 'diff' && (!call.inherited || refChanged || before?.library)) {
        addGap(document.file, 'An authored include target is external, missing, case-mismatched or ambiguous; its library purpose could not be verified.');
      }
      continue;
    }
    if (resolved.library.purpose !== 'run_actions') continue;
    const provider = resolved.script.source;
    const declaration = resolved.library.source;
    // Importing a complete call owns its element. A later literal ref write owns
    // the value instead; the payload's initial attribute point is not that write.
    let primary = !call.inherited && call.point && call.refPoint?.operation === call.point.operation
      ? call.point : call.refPoint ?? call.point;
    let cause = 'authored include';
    if (document.mode === 'diff' && call.inherited) {
      if (document.baseline.status !== 'known') { addGap(document.file, 'The inherited call has no authoritative canonical-before context.'); continue; }
      if (!refChanged && beforeInventoryUnavailable) {
        addGap(document.file, 'Participating canonical-before MD inventory is incomplete; an unchanged inherited include cannot be attributed or exempted with complete authority.');
        continue;
      }
      if (!refChanged && before?.library?.purpose === 'run_actions' && sameContract(before, resolved)) continue;
      if (!refChanged && provider.baseline.status === 'unavailable') {
        addGap(document.file, 'The inherited include target has unavailable canonical-before declarations.'); continue;
      }
      if (refChanged) {
        if (!usable(call.refPoint)) {
          addGap(document.file, call.refPoint?.reason || 'An inherited include ref changed without a reliable authored value position.');
          continue;
        }
        primary = call.refPoint; cause = 'authored ref change';
      }
      else {
        const original = originals.get(provider)?.get(declarationIdentity(provider.mode, declaration));
        const changedScriptName = provider.baseline.status === 'known' && provider.name !== provider.baseline.script.name;
        primary = (original && original.purpose !== declaration.purpose ? declaration.purposePoint : undefined)
          ?? (original && original.name !== declaration.name ? declaration.namePoint : undefined)
          ?? (changedScriptName ? provider.namePoint : undefined);
        cause = 'authored declaration or script-context change';
        if (!primary) {
          primary = inventoryChanges.get(provider)?.get(resolved.targetName.toLowerCase())
            ?? scriptChanges.get(resolved.script.name.toLowerCase())?.[0];
          cause = 'authored declaration inventory change';
        }
        if (!primary && !declaration.inherited) {
          primary = declaration.point;
          cause = 'authored declaration';
        }
      }
    }
    if (!usable(primary)) {
      addGap(document.file, primary?.reason || 'The authored cause of an incompatible include has no reliable source position.');
      continue;
    }
    const related = usable(declaration.point) ? { file: provider.file, line: declaration.point.line, column: declaration.point.column }
      : { file: provider.file };
    const targetLabel = usable(declaration.point)
      ? `${provider.file}:${declaration.point.line}:${declaration.point.column}`
      : `${provider.file} (effective/reference declaration; original per-node coordinates unavailable)`;
    findings.push({ code: EFFECTIVE_INCLUDE_PURPOSE_CODE, severity: 'error', file: primary.file,
      line: primary.line, column: primary.column, target: related,
      sourceRef: `md.include_actions:${JSON.stringify([document.file, call.id, provider.file, declaration.id])}`,
      detail: `<include_actions ref="${call.ref.trim().slice(0, 160)}"> in ${document.file} targets a library declared with purpose="run_actions" at ${targetLabel}.`
        + ` Checked ${cause}. Use <run_actions> to call this library.` });
  }
  return { findings, gaps, incompleteInventory };
}
