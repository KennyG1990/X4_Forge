import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateMDXML, PRESETS, validateModWorkspace, type MDLink, type MDNode, type ModWorkspace } from '../src/types';

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function node(id: string, type: MDNode['type'], xmlTag: string, properties: MDNode['properties']): MDNode {
  return { id, type, xmlTag, label: xmlTag, properties, x: 0, y: 0, inputs: [], outputs: [], propertiesSchema: [] };
}

function link(sourceNodeId: string, sourcePortId: string, targetNodeId: string): MDLink {
  return { id: `${sourceNodeId}-${sourcePortId}-${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId: 'in_act' };
}

function workspace(): ModWorkspace {
  return {
    ...structuredClone(PRESETS.escort.workspace),
    id: 'graph-traversal',
    name: 'Graph_Traversal',
    uiWidgets: [],
    nodes: [
      node('cue', 'cue', 'cue', { name: 'Root' }),
      node('sub', 'cue', 'cue', { name: 'Child' }),
      node('event', 'event', 'event_game_loaded', {}),
      node('condition', 'condition', 'check_value', { value: 'true' }),
      node('start', 'action', 'reward_player', { money: 10 }),
      node('branch', 'action', 'do_if', { value: 'true' }),
      node('body', 'action', 'reward_player', { money: 40 }),
      node('tail', 'action', 'reward_player', { money: 20 }),
      node('child-action', 'action', 'reward_player', { money: 30 }),
    ],
    links: [
      link('cue', 'out_cond', 'event'),
      link('cue', 'out_cond', 'condition'),
      link('cue', 'out_act', 'start'),
      link('start', 'out_next', 'branch'),
      link('branch', 'out_body', 'body'),
      link('branch', 'out_next', 'tail'),
      link('cue', 'out_sub', 'sub'),
      link('sub', 'out_act', 'child-action'),
    ],
  };
}

interface Fixture {
  name: string;
  workspace: ModWorkspace;
  selected?: string[];
  verify?: (xml: string, diagnostics: ReturnType<typeof validateModWorkspace>) => void;
}

const fixtures: Fixture[] = [];
function fixture(name: string, edit: (value: ModWorkspace) => void = () => {}, selected?: string[], verify?: Fixture['verify']) {
  const value = workspace();
  edit(value);
  fixtures.push({ name, workspace: value, selected, verify });
}

fixture('nested-body-and-child-cue');
fixture('duplicate-node-first-match', value => {
  value.nodes.push(node('start', 'action', 'reward_player', { money: 900 }));
}, undefined, xml => {
  assert.ok(xml.includes('money="10"'));
  assert.ok(!xml.includes('money="900"'));
});
fixture('duplicate-node-first-excluded', value => {
  value.nodes.find(item => item.id === 'start')!.includeInBuild = false;
  value.nodes.push(node('start', 'action', 'reward_player', { money: 900 }));
}, undefined, xml => {
  assert.ok(xml.includes('money="900"'));
  assert.ok(!xml.includes('money="10"'));
});
fixture('first-continuation-edge', value => {
  value.links.unshift(link('start', 'out_next', 'tail'));
}, undefined, xml => assert.ok(!xml.includes('<do_if')));
fixture('first-body-edge', value => {
  value.links.unshift(link('branch', 'out_body', 'child-action'));
}, undefined, xml => assert.ok(!xml.includes('money="40"')));
fixture('condition-order-error', value => {
  [value.links[0], value.links[1]] = [value.links[1], value.links[0]];
}, undefined, (_xml, diagnostics) => {
  assert.ok(diagnostics.some(item => item.message.includes('Event conditions must be the FIRST')));
});
fixture('multiple-action-starts', value => value.links.unshift(link('cue', 'out_act', 'tail')));
fixture('action-cycle', value => value.links.push(link('tail', 'out_next', 'start')), undefined, xml => {
  assert.equal(xml.match(/money="10"/g)?.length, 1);
});
fixture('nested-body-cycle', value => value.links.push(link('body', 'out_next', 'branch')));
fixture('excluded-body', value => { value.nodes.find(item => item.id === 'body')!.includeInBuild = false; });
fixture('missing-targets', value => {
  value.links.unshift(link('cue', 'out_cond', 'missing-condition'), link('cue', 'out_act', 'missing-action'));
  value.links.push(link('branch', 'out_body', 'missing-body'));
});
fixture('selected-child', () => {}, ['sub'], xml => {
  assert.ok(xml.includes('name="Child"'));
  assert.ok(!xml.includes('name="Root"'));
});
fixture('empty-selection-uses-roots', () => {}, []);
fixture('unknown-selection', () => {}, ['absent']);
fixture('raw-cue', value => {
  value.nodes.push(node('raw', 'cue', 'custom_xml_cue', { rawXml: '<cue name="Raw"><actions><debug_text text="1"/></actions></cue>' }));
});
fixture('duplicate-cue-id', value => value.nodes.push(node('sub', 'cue', 'cue', { name: 'DuplicateId' })));
fixture('non-object-key-identities', value => {
  const renamed = new Map([['cue', '__proto__'], ['start', 'constructor']]);
  value.nodes.forEach(item => { item.id = renamed.get(item.id) ?? item.id; });
  value.links = value.links.map(item => ({
    ...item,
    sourceNodeId: renamed.get(item.sourceNodeId) ?? item.sourceNodeId,
    targetNodeId: renamed.get(item.targetNodeId) ?? item.targetNodeId,
  }));
});

// Captured from the pre-index implementation, with the semantic assertions above.
const expected: Record<string, { xml: string; diagnostics: string }> = {
  "nested-body-and-child-cue": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "duplicate-node-first-match": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "duplicate-node-first-excluded": {
    "xml": "de670172005bd6251bea7a63a70cc0a915e2c0f6f283459ce7746ff0e9a57b1f",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "first-continuation-edge": {
    "xml": "a0f76f2663286f8bf15aecbea0330c1ae7c4cf37485c538a96595ee60af3b217",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "first-body-edge": {
    "xml": "e220dee59ed904c4f0c362fbc87963d2dd10ec19284043b62006a1fb72b750bf",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "condition-order-error": {
    "xml": "e4bbee5727f6a8b643cf209a8ac3476c82dd8ea9aa6dd46d634e18f54989204a",
    "diagnostics": "286a552faef4a27c8c117d47a3b39c02dd83cdef781ea42990f13bc398341dad"
  },
  "multiple-action-starts": {
    "xml": "9cdbedf10e28177547f67aec4012916880ec666b851d0b1a9cea2c285732209e",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "action-cycle": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "nested-body-cycle": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "excluded-body": {
    "xml": "d1ac009783ce9bff274defb999e3c1a29d3abfa0a33902ee3bfd168ed488547a",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "missing-targets": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "selected-child": {
    "xml": "cd65970fa95202c2fcab64ebb0c4b11b07da882978cf80b33c72cd0894253b6c",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "empty-selection-uses-roots": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "unknown-selection": {
    "xml": "1ffda34e04626ada2ebc50c859e57f05c89edae6f156a3d0735ddbd7067c2a58",
    "diagnostics": "7d3af230bcf99cab495d3b906acafa8ec1457ec6f3df055722bbb58c73a923d4"
  },
  "raw-cue": {
    "xml": "1a2d09c9ae29a1da6deb0df659ad35135141b0f5a9a8f2fd6600b286ab36c46d",
    "diagnostics": "37b2138243cc56c8c0052d9016a2a5e6a03adb2f2f669f735781bbc66d12e31a"
  },
  "duplicate-cue-id": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "36863023ede2a866889a873b43a71366a7cbaf68ca51d880ab549c3003e27c8b"
  },
  "non-object-key-identities": {
    "xml": "e1b8571980cf0a8a642e6bbb0561ff6a5795c12d4e7aceb5bc71ff5bd26b72fc",
    "diagnostics": "f27ef93e0d1f8a2998ad96256ef9e7f70e88010ef3961881988e45f3ad542e57"
  }
};
for (const item of fixtures) {
  const before = hash(item.workspace);
  const xml = generateMDXML(item.workspace, item.selected);
  const diagnostics = validateModWorkspace(item.workspace, xml);
  item.verify?.(xml, diagnostics);
  assert.equal(hash(item.workspace), before, `${item.name} mutates its input`);
  assert.deepEqual({ xml: hash(xml), diagnostics: hash(diagnostics) }, expected[item.name], item.name);
}
const orphan = workspace();
orphan.nodes.push(node('orphan', 'action', 'reward_player', { money: 900 }));
const orphanDiagnostics = () => validateModWorkspace(orphan, generateMDXML(orphan))
  .filter(item => item.nodeId === 'orphan' && item.category === 'references');
assert.equal(orphanDiagnostics().length, 1, 'unlinked action must retain its orphan warning');
orphan.links.push(link('absent-source', 'out_next', 'orphan'));
assert.equal(orphanDiagnostics().length, 0, 'legacy orphan detection counts any matching target');

const subCueOnly = workspace();
subCueOnly.links = subCueOnly.links.filter(item => item.sourceNodeId !== 'cue' || item.sourcePortId === 'out_sub');
const subCueDiagnostics = validateModWorkspace(subCueOnly, generateMDXML(subCueOnly));
assert.ok(!subCueDiagnostics.some(item => item.nodeId === 'cue' && item.message.includes('no event/condition or action')));
console.log(`MD graph traversal selftest PASS: ${fixtures.length + 3}/${fixtures.length + 3}`);
