import { DOMParser } from '@xmldom/xmldom';
import type { MDNode, ModWorkspace } from '../types';
import { fnvHash, stableStringify } from './workspaceIdentity';
import { xmlElementSemanticPath } from './xmlSourceSpans';

export interface ImportedIdentity { key: string; ambiguous: boolean; fileHash: string }
const normalized = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const children = (node: Element) => Array.from(node.childNodes).filter(n => n.nodeType === 1) as Element[];

/** Navigation identity only, never an authorization/hash-of-deployed-bytes boundary. */
export function indexImportedIdentities(root: Element, file: string, text: string) {
  const identities = new Map<Element, ImportedIdentity>();
  const used = new Map<string, string>();
  const fileHash = fnvHash(text);
  const segment = (element: Element) => {
    const attrs = Object.fromEntries(Array.from(element.attributes).map(a => [a.name, a.value]));
    const signature = attrs.name ? { name: attrs.name } : attrs.id ? { id: attrs.id } : attrs;
    return stableStringify([element.tagName, signature]);
  };
  const visit = (element: Element, ancestors: string[], inheritedAmbiguity: boolean) => {
    const keyText = stableStringify([normalized(file), ancestors]);
    const key = fnvHash(keyText);
    if (used.has(key) && used.get(key) !== keyText) throw new Error('Imported source identity collision; import refused.');
    used.set(key, keyText);
    identities.set(element, { key, ambiguous: inheritedAmbiguity, fileHash });
    const siblings = children(element);
    const totals = new Map<string, number>(), seen = new Map<string, number>();
    for (const sibling of siblings) { const s = segment(sibling); totals.set(s, (totals.get(s) || 0) + 1); }
    for (const sibling of siblings) {
      const s = segment(sibling), ordinal = seen.get(s) || 0;
      seen.set(s, ordinal + 1);
      const duplicate = totals.get(s)! > 1;
      visit(sibling, [...ancestors, duplicate ? stableStringify([s, ordinal]) : s], inheritedAmbiguity || duplicate);
    }
  };
  visit(root, [segment(root)], false);
  return identities;
}

export function importedNodeId(identity: ImportedIdentity): string {
  return `source_${identity.key}${identity.ambiguous ? '_ambiguous_' + identity.fileHash : ''}`;
}
export function importedLinkId(link: { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }) {
  return `link_${fnvHash(stableStringify([link.sourceNodeId, link.sourcePortId, link.targetNodeId, link.targetPortId]))}`;
}

/** Preserve presentation/IDs, never old source properties. Caller establishes mod/folder authority. */
export function reconcileImportedGraph(next: ModWorkspace, previous?: ModWorkspace) {
  const report = { reusedNodes: 0, reusedLinks: 0, ambiguousNodes: next.nodes.filter(n => n.source?.identity?.ambiguous).length, rejectedPriorIds: 0 };
  if (!previous) return report;
  const oldIdentity = new Map<string, ImportedIdentity>();
  for (const file of previous.originalFiles || []) {
    if (!/^md\/.+\.xml$/i.test(normalized(file.path)) || typeof file.content !== 'string') continue;
    try {
      const root = new DOMParser().parseFromString(file.content, 'text/xml').documentElement;
      if (!root) continue;
      for (const [element, identity] of indexImportedIdentities(root as unknown as Element, file.path, file.content)) {
        oldIdentity.set(normalized(file.path) + '|' + xmlElementSemanticPath(element), identity);
      }
    } catch { /* No source proof means no legacy match. */ }
  }
  const priorIds = new Map<string, number>();
  for (const n of previous.nodes) priorIds.set(n.id, (priorIds.get(n.id) || 0) + 1);
  const keyOf = (node: MDNode, legacy = false) => {
    const source = node.source;
    const identity = source && (legacy ? oldIdentity.get(normalized(source.path) + '|' + source.semanticPath) || source.identity : source.identity);
    if (!identity || identity.ambiguous) return null;
    return normalized(source!.path) + '|' + identity.key;
  };
  const buckets = new Map<string, MDNode[]>();
  for (const node of previous.nodes) {
    const key = keyOf(node, true);
    if (key) buckets.set(key, [...(buckets.get(key) || []), node]);
  }
  const nextCounts = new Map<string, number>();
  for (const node of next.nodes) { const key = keyOf(node); if (key) nextCounts.set(key, (nextCounts.get(key) || 0) + 1); }
  const remap = new Map<string, string>(), occupied = new Set(next.nodes.map(n => n.id));
  for (const node of next.nodes) {
    const key = keyOf(node);
    const matches = key ? buckets.get(key) : undefined;
    if (!key || nextCounts.get(key) !== 1 || matches?.length !== 1) continue;
    const old = matches[0];
    if (priorIds.get(old.id) !== 1 || (old.id !== node.id && occupied.has(old.id))) { report.rejectedPriorIds++; continue; }
    remap.set(node.id, old.id); occupied.delete(node.id); occupied.add(old.id); node.id = old.id;
    for (const field of ['x', 'y', 'width', 'height'] as const) if (Number.isFinite(old[field])) node[field] = old[field]!;
    report.reusedNodes++;
  }
  const oldLinks = new Map<string, typeof previous.links>(), linkIds = new Map<string, number>();
  for (const link of previous.links) {
    const key = importedLinkId(link); oldLinks.set(key, [...(oldLinks.get(key) || []), link]);
    linkIds.set(link.id, (linkIds.get(link.id) || 0) + 1);
  }
  const newLinkIds = new Set<string>();
  for (const link of next.links) {
    const sourceMatched = remap.has(link.sourceNodeId), targetMatched = remap.has(link.targetNodeId);
    link.sourceNodeId = remap.get(link.sourceNodeId) || link.sourceNodeId;
    link.targetNodeId = remap.get(link.targetNodeId) || link.targetNodeId;
    link.id = importedLinkId(link);
    const matches = oldLinks.get(link.id);
    if (sourceMatched && targetMatched && matches?.length === 1 && linkIds.get(matches[0].id) === 1 && !newLinkIds.has(matches[0].id)) {
      link.id = matches[0].id;
      if (matches[0].waypoints?.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) link.waypoints = structuredClone(matches[0].waypoints);
      report.reusedLinks++;
    }
    if (newLinkIds.has(link.id)) throw new Error('Ambiguous imported link identity; import refused.');
    newLinkIds.add(link.id);
  }
  return report;
}
