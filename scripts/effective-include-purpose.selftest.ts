import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runProjectValidation, flattenProjectValidation } from '../src/server/projectValidation';
import type { ExtensionProject } from '../src/lib/extensionProject';
import { simulateXmlDiff, type DiffSimulationOptions } from '../src/lib/diffSimulator';
import {
  canonicalMdLibraryBaseline, diffMdLibraryPurposeFacts, plainMdLibraryPurposeFacts, evaluateEffectiveMdLibraryPurpose,
} from '../src/lib/mdEffectiveLibraryPurpose';

const workerRoot = process.argv[2] === '--worker' ? process.argv[3] : undefined;
const root = workerRoot ? path.resolve(workerRoot) : fs.mkdtempSync(path.join(os.tmpdir(), 'forge-effective-include-'));
const owner = path.join(root, 'fixture-owner.json');
const assertOwned = () => {
  assert.ok(path.basename(root).startsWith('forge-effective-include-'));
  assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
  assert.ok(!fs.lstatSync(root).isSymbolicLink());
  assert.deepEqual(JSON.parse(fs.readFileSync(owner, 'utf8')), { owner: 'Forge QA', unit: 'effective-include-selftest' });
};
const code = 'md.include_actions_run_library';
const content = '<content id="effective_include_probe" name="Effective include probe" author="Forge QA" version="100" date="2026-11-10" description="Standalone validation fixture"/>';
const provider = (purpose: string) => `<mdscript name="Provider"><cues><library name="Run" purpose="${purpose}"><actions><debug_text text="'probe'"/></actions></library></cues></mdscript>`;
const host = (actions = '') => `<mdscript name="Host"><cues><cue name="Start"><conditions><event_game_started/></conditions><actions>${actions}</actions></cue></cues></mdscript>`;
const include = '<include_actions ref="md.Provider.Run"/>';
const checks: { name: string; pass: boolean; detail?: string }[] = [];
const observations: { name: string; ok: boolean; codes: string[]; coverage: string[]; includes: ReturnType<typeof flattenProjectValidation>; ids: string[] }[] = [];
function check(name: string, run: () => void) {
  try { run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.stack : String(error) }); }
}
function authored(source: string, token: string, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index++) offset = source.indexOf(token, offset + 1);
  assert.ok(offset >= 0, `Missing authored token ${token}`);
  const lines = source.slice(0, offset).split(/\r\n?|\n/);
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}
function runProvenance() {
  const base = '<root old="original"><item ref="before"><child/></item><item ref="other"/></root>';
  const trace = (delta: string, source = base, options: DiffSimulationOptions['elementProvenance'] = true) => {
    const result = simulateXmlDiff(source, delta, { elementProvenance: options });
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.elementProvenance?.available, true, result.elementProvenance?.reason);
    return result.elementProvenance!;
  };
  check('element tracking is opt-in and leaves ordinary and attribute-only contracts unchanged', () => {
    const delta = '<diff><replace sel="/root/item[1]/@ref">after</replace></diff>';
    const ordinary = simulateXmlDiff(base, delta);
    const attributed = simulateXmlDiff(base, delta, { attributeProvenance: true });
    assert.equal(Object.hasOwn(ordinary, 'elementProvenance'), false);
    assert.equal(Object.hasOwn(attributed, 'elementProvenance'), false);
    for (const options of [{ elementProvenance: true }, { elementProvenance: true, attributeProvenance: true }]) {
      const combined = simulateXmlDiff(base, delta, options);
      const { elementProvenance, ...compatible } = combined;
      assert.equal(elementProvenance?.available, true);
      const expected = options.attributeProvenance ? attributed : ordinary;
      assert.deepEqual(JSON.parse(JSON.stringify(compatible)), JSON.parse(JSON.stringify(expected)));
      for (const [index, assignment] of (compatible.attributeAssignments ?? []).entries()) {
        assert.equal(typeof assignment.payload.locate, 'function');
        for (let offset = 0; offset <= assignment.value.length; offset++) {
          assert.deepEqual(assignment.payload.locate(offset), expected.attributeAssignments![index].payload.locate(offset));
        }
      }
    }
  });
  check('inserted payload elements and attributes retain exact original nested and repeated positions', () => {
    const delta = '\uFEFF<diff>\r\n<!-- false <add> marker -->\r\n<add sel="/root/item"><include_actions ref="md.Provider.R&#117;n"/><group><include_actions ref="md.Provider.Run"/></group></add></diff>';
    const result = trace(delta);
    const calls = Array.from(result.document!.getElementsByTagName('include_actions'));
    assert.equal(calls.length, 4);
    assert.equal(new Set(calls).size, 4);
    for (const [index, call] of calls.entries()) {
      const occurrence = index % 2;
      assert.equal(call.getAttribute('ref'), 'md.Provider.Run');
      assert.deepEqual(result.elements.get(call), { operation: 0, ...authored(delta, '<include_actions', occurrence) });
      assert.deepEqual(result.attributes.get(call)?.get('ref'), { operation: 0, ...authored(delta, occurrence ? 'md.Provider.Run' : 'md.Provider.R&#117;n') });
      assert.equal(result.initial.has(call), false);
    }
    assert.deepEqual(result.gaps, []);
  });
  check('initial snapshots are immutable and last attribute write uses original CDATA/entity token', () => {
    const delta = '<diff>\r<replace sel="/root/item[1]/@ref">transient</replace>\r<replace sel="/root/item[1]/@ref"><![CDATA[md.Provider.]]>R&#117;n</replace></diff>';
    const result = trace(delta);
    const item = result.document!.getElementsByTagName('item')[0];
    assert.equal(item.getAttribute('ref'), 'md.Provider.Run');
    assert.equal(result.initial.get(item)?.attributes.ref, 'before');
    assert.equal(Object.isFrozen(result.initial.get(item)?.attributes), true);
    assert.equal(Object.isFrozen(result.initial.get(item)), true);
    assert.deepEqual(result.attributes.get(item)?.get('ref'), { operation: 1, ...authored(delta, 'md.Provider.') });
    assert.equal(result.initial.get(item)?.parent, result.document!.documentElement);
  });
  check('replacement records every removed descendant and maps replacement payload to its own source', () => {
    const delta = '<diff>\n<replace sel="/root/item[1]"><replacement><include_actions ref="md.Provider.Run"/></replacement></replace></diff>';
    const result = trace(delta);
    const destroyed = [...result.initial].filter(([, state]) => state.attributes.ref === 'before' || state.elementName === 'child');
    assert.equal(destroyed.length, 2);
    for (const [element] of destroyed) assert.deepEqual(result.removed.get(element), { operation: 0, ...authored(delta, '<replace') });
    const call = result.document!.getElementsByTagName('include_actions')[0];
    assert.deepEqual(result.elements.get(call), { operation: 0, ...authored(delta, '<include_actions') });
    assert.equal(result.document!.getElementsByTagName('child').length, 0);
  });
  check('removed attributes record the destructive operation without losing original values', () => {
    const delta = '<diff>\n<remove sel="/root/item[1]/@ref"/></diff>';
    const result = trace(delta);
    const item = result.document!.getElementsByTagName('item')[0];
    assert.equal(item.hasAttribute('ref'), false);
    assert.equal(result.initial.get(item)?.attributes.ref, 'before');
    assert.deepEqual(result.attributes.get(item)?.get('ref'), { operation: 0, ...authored(delta, '<remove') });
  });
  check('empty literal assignment preserves its exact authored operation cause', () => {
    const delta = '<diff>\n<replace sel="/root/item[1]/@ref"/></diff>';
    const result = trace(delta);
    const item = result.document!.getElementsByTagName('item')[0];
    assert.equal(item.getAttribute('ref'), '');
    assert.deepEqual(result.attributes.get(item)?.get('ref'), { operation: 0, ...authored(delta, '<replace') });
    assert.deepEqual(result.gaps, []);
  });
  check('overlapping removal snapshots visit destroyed identities only once', () => {
    const delta = '<diff><remove sel="/root/group | /root/group/group | /root/group/group/leaf"/></diff>';
    const result = trace(delta, '<root><group><group><leaf/></group></group></root>');
    assert.equal(result.removed.size, 3);
    assert.equal(result.document!.getElementsByTagName('group').length, 0);
    for (const origin of result.removed.values()) assert.deepEqual(origin, { operation: 0, ...authored(delta, '<remove') });
  });
  check('add attribute and later payload removal preserve actual final attachment and origin', () => {
    const delta = '<diff><add sel="/root" type="@new">value</add><add sel="/root"><group><include_actions ref="md.Provider.Run"/></group></add><remove sel="/root/group"/></diff>';
    const result = trace(delta);
    assert.deepEqual(result.attributes.get(result.document!.documentElement)?.get('new'), { operation: 0, ...authored(delta, 'value') });
    assert.equal(result.document!.getElementsByTagName('include_actions').length, 0);
    const detached = [...result.elements.keys()].find(element => element.nodeName === 'include_actions')!;
    assert.ok(detached);
    assert.deepEqual(result.removed.get(detached), { operation: 2, ...authored(delta, '<remove') });
  });
  check('false and zero-match operations manufacture no inserted or changed ownership', () => {
    const result = trace('<diff><add sel="/root" if="false()"><new/></add><replace sel="/root/absent/@ref">value</replace></diff>');
    assert.equal(result.elements.size, 0); assert.equal(result.attributes.size, 0); assert.equal(result.removed.size, 0);
    assert.equal(result.initial.size, 4);
  });
  check('reordering and ancestor attribute changes do not move original payload positions', () => {
    const delta = '<diff><add sel="/root/item[1]"><include_actions ref="md.Provider.Run"/></add><add sel="/root/item[1]" pos="before"><item/></add><add sel="/root" type="@name">renamed</add></diff>';
    const result = trace(delta);
    const call = result.document!.getElementsByTagName('include_actions')[0];
    assert.deepEqual(result.elements.get(call), { operation: 0, ...authored(delta, '<include_actions') });
    assert.equal(result.document!.getElementsByTagName('item')[1], call.parentNode);
  });
  check('Unicode, BOM and XML line normalization map to raw authored UTF-16 coordinates', () => {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      const delta = `\uFEFF<diff><!-- \u{1f680} -->${newline}<add sel="/root"><include_actions ref="md.Provider.Run"/></add></diff>`;
      const result = trace(delta);
      const call = result.document!.getElementsByTagName('include_actions')[0];
      assert.deepEqual(result.elements.get(call), { operation: 0, ...authored(delta, '<include_actions') });
    }
  });
  check('element and source budgets refuse context without changing patch simulation', () => {
    const delta = '<diff><add sel="/root"><new/></add></diff>';
    for (const options of [{ maxElements: 4 }, { maxSourceChars: 10 }, { maxElements: 0 }, { maxSourceChars: NaN }]) {
      const result = simulateXmlDiff(base, delta, { elementProvenance: options });
      assert.equal(result.ok, true);
      assert.equal(result.elementProvenance?.available, false);
      assert.equal(result.elementProvenance?.document, undefined);
      assert.equal(result.elementProvenance?.initial.size, 0);
      const { elementProvenance: ignored, ...ordinary } = result;
      assert.ok(ignored?.reason); assert.deepEqual(ordinary, simulateXmlDiff(base, delta));
    }
    assert.equal(trace('<diff/>', base, { maxElements: 4 }).initial.size, 4);
  });
  check('attribute budgets and repeated payload expansion remain bounded', () => {
    const source = '<root a="1" b="2" c="3" d="4" e="5" f="6" g="7" h="8" i="9"/>';
    assert.equal(simulateXmlDiff(source, '<diff/>', { elementProvenance: { maxElements: 1 } }).elementProvenance?.available, false);
    const many = '<root>' + '<item/>'.repeat(30) + '</root>';
    const result = simulateXmlDiff(many, '<diff><add sel="/root/item"><x/><y/></add></diff>', { elementProvenance: { maxElements: 35 } });
    assert.equal(result.ok, true); assert.equal(result.elementProvenance?.available, false);
    assert.equal(result.elementProvenance?.elements.size, 0);
  });
  check('failed or repaired XML never supplies authoritative element context', () => {
    for (const [source, delta] of [[base, '<diff><add sel="/root">'], ['<root unquoted=value/>', '<diff/>'], [base, '<diff><add sel="/root"><x unquoted=value/></add></diff>'], [base, '<diff><replace sel="/root/item[1]"/></diff>']]) {
      const result = simulateXmlDiff(source, delta, { elementProvenance: true });
      assert.equal(result.elementProvenance?.available, false);
      assert.equal(result.elementProvenance?.document, undefined);
      assert.equal(result.elementProvenance?.initial.size, 0);
    }
  });
  check('unavailable canonical-before inventory is explicit for inherited calls without suppressing new calls', () => {
    const providerFacts = plainMdLibraryPurposeFacts('md/provider.xml', provider('run_actions'), canonicalMdLibraryBaseline(provider('run_actions')));
    const unrelated = plainMdLibraryPurposeFacts('md/unrelated.xml', '<mdscript name="Unrelated"><cues/></mdscript>', { status: 'unavailable', reason: 'Controlled absent before authority' });
    const facts = (delta: string) => diffMdLibraryPurposeFacts('md/host.xml', trace(delta, host(include)));
    const inherited = evaluateEffectiveMdLibraryPurpose([providerFacts, unrelated, facts('<diff/>')]);
    assert.equal(inherited.findings.length, 0);
    assert.ok(inherited.gaps.some(gap => gap.reason.includes('canonical-before MD inventory')));
    const fresh = evaluateEffectiveMdLibraryPurpose([providerFacts, unrelated, facts('<diff><add sel="/mdscript/cues/cue/actions">' + include + '</add></diff>')]);
    assert.equal(fresh.findings.length, 1);
    assert.ok(fresh.gaps.some(gap => gap.reason.includes('canonical-before MD inventory')));
  });
  check('unavailable tracking budget reaches explicit final-inventory coverage rather than guessed findings', () => {
    const result = simulateXmlDiff(host(), '<diff><add sel="/mdscript/cues/cue/actions">' + include + '</add></diff>', { elementProvenance: { maxElements: 2 } });
    const facts = diffMdLibraryPurposeFacts('md/host.xml', result.elementProvenance);
    const evaluated = evaluateEffectiveMdLibraryPurpose([facts]);
    assert.equal(evaluated.incompleteInventory, true);
    assert.deepEqual(evaluated.findings, []);
    assert.ok(evaluated.gaps.some(gap => /budget/.test(gap.reason)));
  });
}
let clock = Date.now();
const write = (relative: string, text: string) => {
  const target = path.join(root, 'corpus', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  const stamp = new Date(clock += 1000);
  fs.utimesSync(target, stamp, stamp);
};
function validate(name: string, hostXml: string, providerXml: string, files: ExtensionProject['files'], expected: number,
  verify?: (result: ReturnType<typeof runProjectValidation>) => void) {
  write('md/host.xml', hostXml);
  write('md/provider.xml', providerXml);
  const project: ExtensionProject = { id: 'effective_include_probe', name: 'Effective include probe', files: [
    { path: 'content.xml', kind: 'content', content }, ...files,
  ] };
  const result = runProjectValidation(project, { references: { macros: new Set(), wares: new Set(), factions: new Set(), sectors: new Set() } });
  const flat = flattenProjectValidation(result);
  observations.push({ name, ok: result.ok, codes: flat.map(finding => finding.code || ''), coverage: result.evidence!.coverage.gaps.map(gap => gap.check),
    includes: flat.filter(finding => finding.code === code), ids: result.evidence!.findings.filter(finding => finding.code === code).map(finding => finding.findingId) });
  check(name, () => { assert.equal(flat.filter(finding => finding.code === code).length, expected); verify?.(result); });
  return result;
}

function run() {
  process.env.X4_REFERENCE_ROOT = path.join(root, 'corpus');
  process.env.X4_CONFIG_DIR = path.join(root, 'config');
  process.env.X4_GAME_PATH = path.join(root, 'game');
  process.env.X4_DATA_DIR = path.join(root, 'data');
  delete process.env.X4_FORGE_DEV_SCRATCH_SETTINGS;
  delete process.env.X4_FORGE_DEV_ROOT;
  const suppliedProvider = { path: 'md/provider.xml', kind: 'md' as const, content: provider('run_actions') };
  validate('authored diff include uses final exact project library purpose', host(), provider('run_actions'), [
    suppliedProvider, { path: 'md/host.xml', kind: 'md', content: `<diff><add sel="/mdscript/cues/cue/actions">${include}</add></diff>` },
  ], 1);
  validate('literal ref change uses final exact project library purpose', host('<include_actions ref="md.Provider.Safe"/>'), provider('run_actions'), [
    suppliedProvider, { path: 'md/host.xml', kind: 'md', content: '<diff><replace sel="/mdscript/cues/cue/actions/include_actions/@ref">md.Provider.Run</replace></diff>' },
  ], 1);
  validate('inherited include becomes invalid after an authored provider purpose change', host(include), provider('include_actions'), [
    { path: 'md/host.xml', kind: 'md', content: '<diff><add sel="/mdscript/cues/cue/actions"><debug_text text="\'unrelated\'"/></add></diff>' },
    { path: 'md/provider.xml', kind: 'md', content: '<diff><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>' },
  ], 1);
  validate('valid action invocation remains clear', host(), provider('run_actions'), [
    suppliedProvider, { path: 'md/host.xml', kind: 'md', content: '<diff><add sel="/mdscript/cues/cue/actions"><run_actions ref="md.Provider.Run"/></add></diff>' },
  ], 0);
  validate('unrelated patch does not import inherited canonical mismatch', host(include), provider('run_actions'), [
    suppliedProvider, { path: 'md/host.xml', kind: 'md', content: '<diff><add sel="/mdscript/cues/cue/actions"><debug_text text="\'unrelated\'"/></add></diff>' },
  ], 0);
  const md = (filePath: string, xml: string): ExtensionProject['files'][number] => ({ path: filePath, kind: 'md', content: xml });
  const deltaFile = (xml: string) => md('md/host.xml', xml);
  const add = (xml: string) => `<diff><add sel="/mdscript/cues/cue/actions">${xml}</add></diff>`;
  const bothLibraries = provider('run_actions').replace('</cues>', '<library name="Safe" purpose="include_actions"><actions/></library></cues>');
  const positioned = (xml: string, token: string, filePath = 'md/host.xml') => (result: ReturnType<typeof runProjectValidation>) => {
    const findings = flattenProjectValidation(result).filter(finding => finding.code === code);
    assert.ok(findings.length);
    for (const finding of findings) {
      assert.equal(finding.filePath, filePath);
      assert.deepEqual({ line: finding.line, column: finding.column }, authored(xml, token));
      assert.ok(finding.sourceRef?.startsWith('md.include_actions:'));
    }
  };
  const gap = (result: ReturnType<typeof runProjectValidation>) => assert.ok(result.evidence!.coverage.gaps.some(item => item.check === 'md.include_actions_context'));
  const authoredSame = add(include);
  validate('new identical include is owned while inherited identical mismatch is exempt', host(include), provider('run_actions'), [suppliedProvider, deltaFile(authoredSame)], 1,
    positioned(authoredSame, '<include_actions'));
  const twice = add(include + include);
  validate('two same-line includes retain distinct authored coordinates and evidence IDs', host(), provider('run_actions'), [suppliedProvider, deltaFile(twice)], 2, result => {
    const found = flattenProjectValidation(result).filter(finding => finding.code === code);
    assert.deepEqual(found.map(finding => ({ line: finding.line, column: finding.column })), [authored(twice, '<include_actions'), authored(twice, '<include_actions', 1)]);
    assert.equal(new Set(result.evidence!.findings.filter(finding => finding.code === code).map(finding => finding.findingId)).size, 2);
  });
  const cloned = '<diff><add sel="/mdscript/cues/cue/actions"><do_all/><do_all/></add><add sel="/mdscript/cues/cue/actions/do_all">' + include + '</add></diff>';
  validate('multimatch into authored parents preserves distinct actual call identities', host(), provider('run_actions'), [suppliedProvider, deltaFile(cloned)], 2, result => {
    positioned(cloned, '<include_actions')(result);
    const findings = result.evidence!.findings.filter(finding => finding.code === code);
    assert.equal(new Set(findings.map(finding => finding.findingId)).size, 2);
    assert.equal(new Set(findings.map(finding => finding.sourceRef)).size, 2);
  });
  const refDelta = '<diff>\r\n<replace sel="/mdscript/cues/cue/actions/include_actions/@ref"><![CDATA[md.Provider.]]>R&#117;n</replace></diff>';
  validate('literal ref mutation uses decoded value and original CRLF CDATA coordinate', host('<include_actions ref="md.Provider.Safe"/>'), bothLibraries,
    [md('md/provider.xml', bothLibraries), deltaFile(refDelta)], 1, positioned(refDelta, 'md.Provider.'));
  validate('later safe ref overwrites the incompatible transient value', host('<include_actions ref="md.Provider.Safe"/>'), bothLibraries,
    [md('md/provider.xml', bothLibraries), deltaFile('<diff><replace sel="/mdscript/cues/cue/actions/include_actions/@ref">md.Provider.Run</replace><replace sel="/mdscript/cues/cue/actions/include_actions/@ref">md.Provider.Safe</replace></diff>')], 0);
  validate('removed authored include is absent from final context', host(), provider('run_actions'), [suppliedProvider,
    deltaFile('<diff><add sel="/mdscript/cues/cue/actions">' + include + '</add><remove sel="/mdscript/cues/cue/actions/include_actions"/></diff>')], 0);
  const recreate = '<diff>\n<replace sel="/mdscript/cues/cue/actions"><actions>' + include + '</actions></replace></diff>';
  validate('recreating canonical bad call inside replacement is a newly authored error', host(include), provider('run_actions'), [suppliedProvider, deltaFile(recreate)], 1,
    positioned(recreate, '<include_actions'));
  validate('no-op ref restatement does not blame an inherited canonical mismatch', host(include), provider('run_actions'), [suppliedProvider,
    deltaFile('<diff><replace sel="/mdscript/cues/cue/actions/include_actions/@ref">md.Provider.Run</replace></diff>')], 0);
  validate('no-op provider purpose restatement does not blame an inherited mismatch', host(include), provider('run_actions'), [deltaFile('<diff/>'),
    md('md/provider.xml', '<diff><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>')], 0);
  validate('later safe purpose removes the transient invalidation', host(include), provider('include_actions'), [deltaFile('<diff/>'),
    md('md/provider.xml', '<diff><replace sel="/mdscript/cues/library/@purpose">run_actions</replace><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>')], 0);
  for (const guard of ['if="false()"', 'sel="/mdscript/cues/absent"']) {
    const operation = guard.startsWith('if') ? `<add sel="/mdscript/cues/cue/actions" ${guard}>` : `<add ${guard}>`;
    validate(`inactive patch does not manufacture include ownership: ${guard}`, host(), provider('run_actions'), [suppliedProvider, deltaFile(`<diff>${operation}${include}</add></diff>`)], 0);
  }
  for (const ref of ['md.provider.Run', 'md.Provider.run', 'md.Outside.Run', '$chosen', 'parent.Run']) {
    validate(`unresolved or contextual authored target remains an explicit gap: ${ref}`, host(), provider('run_actions'),
      [suppliedProvider, deltaFile(add(`<include_actions ref="${ref}"/>`))], 0, gap);
  }
  const nested = provider('run_actions').replace('<library name="Run"', '<cue name="Parent"><cues><library name="Run"').replace('</library>', '</library></cues></cue>');
  validate('unique nested library shares the existing script-wide exact resolver', host(), nested, [md('md/provider.xml', nested), deltaFile(add(include))], 1);
  const duplicate = bothLibraries.replace('name="Safe"', 'name="run"');
  validate('case-fold colliding nested declarations never invent exact purpose', host(), duplicate, [md('md/provider.xml', duplicate), deltaFile(add(include))], 0, gap);
  const purposeDelta = '<diff>\n<replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>';
  validate('inherited invalidation points at the actual authored purpose value', host(include), provider('include_actions'), [deltaFile('<diff/>'), md('md/provider.xml', purposeDelta)], 1,
    positioned(purposeDelta, 'run_actions', 'md/provider.xml'));
  for (const prefix of ['\uFEFF', '\r\n', '\u0085']) {
    const authoredProvider = prefix + provider('run_actions');
    validate(`plain provider purpose changes use raw authored value coordinates: ${JSON.stringify(prefix)}`, host(include), provider('include_actions'),
      [deltaFile('<diff/>'), md('md/provider.xml', authoredProvider)], 1, positioned(authoredProvider, 'run_actions', 'md/provider.xml'));
  }
  const ownedHost = host(include);
  validate('plain authored caller resolves provider diff without losing its own position', host(), provider('include_actions'), [md('md/host.xml', ownedHost), md('md/provider.xml', purposeDelta)], 1,
    positioned(ownedHost, '<include_actions'));
  const collideBefore = provider('run_actions').replace('</cues>', '<library name="Run" purpose="include_actions"><actions/></library></cues>');
  const removeCollision = '<diff>\n<remove sel="/mdscript/cues/library[2]"/></diff>';
  validate('removing a declaration collision attributes newly resolved mismatch to removal', host(include), collideBefore,
    [deltaFile('<diff/>'), md('md/provider.xml', removeCollision)], 1, positioned(removeCollision, '<remove', 'md/provider.xml'));
  const renamedProvider = provider('run_actions').replace('name="Run"', 'name="Other"');
  const renameLibrary = '<diff>\n<replace sel="/mdscript/cues/library/@name">Run</replace></diff>';
  validate('renamed declaration uses final name and authored mutation position', host(include), renamedProvider,
    [deltaFile('<diff/>'), md('md/provider.xml', renameLibrary)], 1, positioned(renameLibrary, '>Run'.slice(1), 'md/provider.xml'));
  const renameScript = '<diff>\n<replace sel="/mdscript/@name">Provider</replace></diff>';
  validate('renamed script uses final identity and its authored mutation position', host(include), provider('run_actions').replace('name="Provider"', 'name="Other"'),
    [deltaFile('<diff/>'), md('md/provider.xml', renameScript)], 1, positioned(renameScript, 'Provider', 'md/provider.xml'));
  const moved = '<diff><add sel="/mdscript/cues/cue/actions">' + include + '</add><add sel="/mdscript/cues/cue" pos="before"><cue name="Before"><conditions><event_game_started/></conditions><actions/></cue></add></diff>';
  validate('later sibling insertion preserves the original authored include coordinate', host(), provider('run_actions'), [suppliedProvider, deltaFile(moved)], 1, positioned(moved, '<include_actions'));
  const forward = validate('forward project order produces one exact error', host(), provider('run_actions'), [suppliedProvider, deltaFile(twice)], 2);
  validate('reverse project order preserves exact findings and IDs', host(), provider('run_actions'), [deltaFile(twice), suppliedProvider], 2, result => {
    const facts = (value: typeof result) => value.evidence!.findings.filter(finding => finding.code === code).map(finding => [finding.findingId, finding.filePath, finding.line, finding.column]).sort();
    assert.deepEqual(facts(result), facts(forward));
  });
  write('md/away_a.xml', provider('run_actions'));
  write('md/away_b.xml', provider('run_actions'));
  const awayA = md('md/away_a.xml', '<diff><replace sel="/mdscript/@name">AwayA</replace></diff>');
  const awayB = md('md/away_b.xml', '<diff><replace sel="/mdscript/@name">AwayB</replace></diff>');
  const collisions = validate('renaming colliding scripts away attributes inherited mismatch deterministically', host(include), provider('run_actions'),
    [deltaFile('<diff/>'), md('md/provider.xml', '<diff/>'), awayA, awayB], 1);
  validate('reversed colliding-script changes preserve primary position and finding ID', host(include), provider('run_actions'),
    [awayB, awayA, md('md/provider.xml', '<diff/>'), deltaFile('<diff/>')], 1, result => {
      const facts = (value: typeof result) => value.evidence!.findings.filter(finding => finding.code === code).map(finding => [finding.findingId, finding.filePath, finding.line, finding.column]);
      assert.deepEqual(facts(result), facts(collisions));
    });
  validate('failed composition remains unavailable without guessed E70', host(), provider('run_actions'), [suppliedProvider,
    deltaFile('<diff><add sel="/mdscript/cues/cue/actions">' + include + '</add><replace sel="[[">x</replace></diff>')], 0, gap);
  validate('untrusted canonical source remains unavailable without guessed E70', '<mdscript name=Host><cues/></mdscript>', provider('run_actions'),
    [suppliedProvider, deltaFile(add(include))], 0, gap);
  validate('unavailable effective inventory preserves existing direct authored checks', host(), provider('run_actions'),
    [md('md/host.xml', host(include)), suppliedProvider, md('md/unavailable.xml', '<diff/>')], 1, gap);
}

if (workerRoot) {
  assertOwned(); runProvenance(); if (!process.argv.includes('--provenance-only')) run();
  const pass = checks.every(check => check.pass);
  console.log(JSON.stringify({ pass, passed: checks.filter(check => check.pass).length, total: checks.length, checks, observations }, null, 2));
  if (!pass) process.exitCode = 1;
} else {
  try {
    fs.writeFileSync(owner, JSON.stringify({ owner: 'Forge QA', unit: 'effective-include-selftest' })); assertOwned();
    const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--worker', root, ...process.argv.slice(2)], { stdio: 'inherit' });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } finally { assertOwned(); fs.rmSync(root, { recursive: true, force: true }); }
}
