import type { MDLink, MDNode, ModWorkspace } from '../types';
import { stableStringify } from './workspaceIdentity';

export interface MdStemIdentityIndex {
  nodeIdsForStem(stem: string): Set<string>;
  stemFingerprint(stem: string): string;
}

/** Pre-index nodes, links, and cue roots once so multi-script stem queries run in O(V + E). */
export function createMdStemIdentityIndex(workspace: Pick<ModWorkspace, 'nodes' | 'links'>): MdStemIdentityIndex {
  const nodes = workspace.nodes || [];
  const links = workspace.links || [];
  const byId = new Map<string, MDNode>();
  const cuesByStem = new Map<string, string[]>();
  const cueStemById = new Map<string, string>();
  for (const node of nodes) {
    byId.set(node.id, node);
    if (node.type === 'cue') {
      const stem = String(node.properties?.mdFileStem || '');
      if (stem) {
        cueStemById.set(node.id, stem);
        const list = cuesByStem.get(stem);
        if (list) list.push(node.id);
        else cuesByStem.set(stem, [node.id]);
      }
    }
  }
  const linksBySource = new Map<string, MDLink[]>();
  for (const link of links) {
    const list = linksBySource.get(link.sourceNodeId);
    if (list) list.push(link);
    else linksBySource.set(link.sourceNodeId, [link]);
  }
  const ownedCache = new Map<string, Set<string>>();
  const fpCache = new Map<string, string>();

  const nodeIdsForStem = (stem: string): Set<string> => {
    const cached = ownedCache.get(stem);
    if (cached) return cached;
    const owned = new Set<string>();
    const queue = [...(cuesByStem.get(stem) || [])];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      if (owned.has(id)) continue;
      if (!byId.has(id)) continue;
      const cueStem = cueStemById.get(id);
      if (cueStem && cueStem !== stem) continue;
      owned.add(id);
      const outgoing = linksBySource.get(id);
      if (!outgoing) continue;
      for (const link of outgoing) {
        if (!owned.has(link.targetNodeId)) queue.push(link.targetNodeId);
      }
    }
    ownedCache.set(stem, owned);
    return owned;
  };

  const stemFingerprint = (stem: string): string => {
    const cached = fpCache.get(stem);
    if (cached !== undefined) return cached;
    const ids = nodeIdsForStem(stem);
    const stemNodes: ReturnType<typeof fingerprintNode>[] = [];
    const keyedLinks: Array<{ key: string; fp: ReturnType<typeof fingerprintLink> }> = [];
    for (const id of ids) {
      const node = byId.get(id);
      if (node) stemNodes.push(fingerprintNode(node));
      const outgoing = linksBySource.get(id);
      if (!outgoing) continue;
      for (const link of outgoing) {
        if (!ids.has(link.targetNodeId)) continue;
        const fp = fingerprintLink(link);
        keyedLinks.push({ key: stableStringify(fp), fp });
      }
    }
    stemNodes.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));
    keyedLinks.sort((a, b) => a.key.localeCompare(b.key));
    const result = stableStringify({ stem, nodes: stemNodes, links: keyedLinks.map(entry => entry.fp) });
    fpCache.set(stem, result);
    return result;
  };

  return { nodeIdsForStem, stemFingerprint };
}

/** All graph nodes owned by one imported MD file, derived from its cue roots. */
export function mdNodeIdsForStem(workspace: Pick<ModWorkspace, 'nodes' | 'links'>, stem: string): Set<string> {
  return new Set(createMdStemIdentityIndex(workspace).nodeIdsForStem(stem));
}

/** Canvas ownership excludes parent-to-subcue transitions. */
export function canvasCueOwners(workspace: Pick<ModWorkspace, 'nodes' | 'links'>): Record<string, string> {
  const owners: Record<string, string> = Object.create(null);
  const nodes = new Map(workspace.nodes.map(node => [node.id, node]));
  const neighbors = new Map<string, string[]>();
  const addNeighbor = (id: string, neighbor: string) => {
    const linked = neighbors.get(id);
    if (linked) linked.push(neighbor);
    else neighbors.set(id, [neighbor]);
  };
  for (const link of workspace.links) {
    if (link.sourcePortId === 'out_sub' && link.targetPortId === 'in_flow') continue;
    addNeighbor(link.sourceNodeId, link.targetNodeId);
    addNeighbor(link.targetNodeId, link.sourceNodeId);
  }
  for (const cue of workspace.nodes) {
    if (cue.type !== 'cue') continue;
    owners[cue.id] = cue.id;
    const queue = [cue.id];
    const visited = new Set(queue);
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of neighbors.get(queue[index]) || []) {
        if (visited.has(neighbor)) continue;
        const node = nodes.get(neighbor);
        if (node && node.type !== 'cue') {
          visited.add(neighbor);
          owners[neighbor] = cue.id;
          queue.push(neighbor);
        }
      }
    }
  }
  return owners;
}

function fingerprintNode(node: MDNode): unknown {
  return {
    id: node.id,
    type: node.type,
    xmlTag: node.xmlTag,
    label: node.label,
    includeInBuild: node.includeInBuild !== false,
    properties: node.properties || {},
  };
}

function fingerprintLink(link: MDLink): unknown {
  return {
    sourceNodeId: link.sourceNodeId,
    sourcePortId: link.sourcePortId,
    targetNodeId: link.targetNodeId,
    targetPortId: link.targetPortId,
  };
}

/** Semantic fingerprint used by original-file byte preservation. Includes every node in the file. */
export function mdStemFingerprint(
  workspace: Pick<ModWorkspace, 'nodes' | 'links'>,
  stem: string,
  index?: MdStemIdentityIndex,
): string {
  return (index ?? createMdStemIdentityIndex(workspace)).stemFingerprint(stem);
}

export function runMdFileIdentitySelftest(): { allPassed: boolean; passed: number; total: number; checks: Array<{ name: string; pass: boolean }> } {
  const cue = { id: 'cue', type: 'cue', xmlTag: 'cue', label: 'Cue', x: 0, y: 0, properties: { name: 'Start', mdFileStem: 'main' }, propertiesSchema: [], inputs: [], outputs: [] } as MDNode;
  const action = { id: 'act', type: 'action', xmlTag: 'set_value', label: 'Set', x: 0, y: 0, properties: { name: '$x', exact: '1' }, propertiesSchema: [], inputs: [], outputs: [] } as MDNode;
  const action2 = { id: 'act2', type: 'action', xmlTag: 'set_value', label: 'Set2', x: 0, y: 0, properties: { name: '$y', exact: '2' }, propertiesSchema: [], inputs: [], outputs: [] } as MDNode;
  const otherCue = { id: 'other_cue', type: 'cue', xmlTag: 'cue', label: 'Other', x: 0, y: 0, properties: { name: 'Other', mdFileStem: 'other' }, propertiesSchema: [], inputs: [], outputs: [] } as MDNode;
  const otherAction = { id: 'other_act', type: 'action', xmlTag: 'set_value', label: 'OtherAct', x: 0, y: 0, properties: { name: '$z', exact: '3' }, propertiesSchema: [], inputs: [], outputs: [] } as MDNode;
  const link = { id: 'l', sourceNodeId: 'cue', sourcePortId: 'out_act', targetNodeId: 'act', targetPortId: 'in_act' } as MDLink;
  const link2 = { id: 'l2', sourceNodeId: 'cue', sourcePortId: 'out_act', targetNodeId: 'act2', targetPortId: 'in_act' } as MDLink;
  const diamond = { id: 'l3', sourceNodeId: 'act', sourcePortId: 'out_next', targetNodeId: 'act2', targetPortId: 'in_act' } as MDLink;
  const crossCue = { id: 'lc', sourceNodeId: 'act2', sourcePortId: 'out_next', targetNodeId: 'other_cue', targetPortId: 'in_flow' } as MDLink;
  const otherLink = { id: 'lo', sourceNodeId: 'other_cue', sourcePortId: 'out_act', targetNodeId: 'other_act', targetPortId: 'in_act' } as MDLink;
  const base = { nodes: [cue, action], links: [link] } as ModWorkspace;
  const changed = { ...base, nodes: [cue, { ...action, properties: { ...action.properties, exact: '2' } }] } as ModWorkspace;
  const multi = { nodes: [cue, action, action2, otherCue, otherAction], links: [link2, link, diamond, crossCue, otherLink] } as ModWorkspace;
  const reorderedLinks = { ...multi, links: [otherLink, crossCue, diamond, link, link2] } as ModWorkspace;
  const idx = createMdStemIdentityIndex(multi);
  const ownedMain = mdNodeIdsForStem(multi, 'main');
  const checks = [
    { name: 'action_is_owned_by_cue_file', pass: mdNodeIdsForStem(base, 'main').has('act') },
    { name: 'action_property_edit_changes_file_fingerprint', pass: mdStemFingerprint(base, 'main') !== mdStemFingerprint(changed, 'main') },
    { name: 'unknown_stem_has_no_nodes', pass: mdNodeIdsForStem(base, 'other').size === 0 },
    { name: 'cross_stem_cue_boundary_blocks_leakage', pass: ownedMain.has('act2') && !ownedMain.has('other_cue') && !ownedMain.has('other_act') },
    { name: 'indexed_matches_unindexed_fingerprint', pass: mdStemFingerprint(multi, 'main', idx) === mdStemFingerprint(multi, 'main') && mdStemFingerprint(multi, 'other', idx) === mdStemFingerprint(multi, 'other') },
    { name: 'link_order_invariant_fingerprint', pass: mdStemFingerprint(multi, 'main') === mdStemFingerprint(reorderedLinks, 'main') },
    { name: 'stem_index_isolated_across_files', pass: mdStemFingerprint(multi, 'other') !== mdStemFingerprint({ ...multi, nodes: [cue, action, action2, otherCue, { ...otherAction, properties: { name: '$z', exact: '9' } }] } as ModWorkspace, 'other') },
  ];
  return { allPassed: checks.every(check => check.pass), passed: checks.filter(check => check.pass).length, total: checks.length, checks };
}
