import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runProjectValidation, flattenProjectValidation } from '../src/server/projectValidation';
import type { ExtensionProject } from '../src/lib/extensionProject';
import { simulateXmlDiff, type DiffElementProvenance, type DiffSimulationOptions } from '../src/lib/diffSimulator';
import { lintEffectiveMdCueReturns } from '../src/lib/mdPitfallLints';
import { buildEffectiveMdReferenceContext, diffMdLibraryPurposeFacts } from '../src/lib/mdEffectiveLibraryPurpose';

const workerRoot = process.argv[2] === '--worker' ? process.argv[3] : undefined;
const libraryOnly = process.argv.includes('--library-only');
const referenceOnly = process.argv.includes('--reference-only');
const root = workerRoot ? path.resolve(workerRoot) : fs.mkdtempSync(path.join(os.tmpdir(), 'forge-effective-return-'));
const marker = { owner: 'Forge QA', unit: 'effective-return-selftest' };
const owner = path.join(root, 'fixture-owner.json');
function assertOwned() {
  assert.ok(path.basename(root).startsWith('forge-effective-return-'));
  assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
  assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(owner, 'utf8')), marker);
}
const code = 'md_pitfall.return_context';
const content = '<content id="effective_return_probe" name="Effective return probe" author="Forge QA" version="100" date="2026-11-10" description="Standalone validation fixture"/>';
const host = (actions = '') => `<mdscript name="Probe"><cues><cue name="Start"><conditions><event_game_started/></conditions><actions>${actions}</actions></cue></cues></mdscript>`;
const library = (purpose: string, actions = '') => `<mdscript name="Probe"><cues><library name="Run" purpose="${purpose}"><actions>${actions}</actions></library></cues></mdscript>`;
const checks: { name: string; pass: boolean; detail?: string }[] = [];
type Result = ReturnType<typeof runProjectValidation>;
const observations: { name: string; ok: boolean; codes: string[]; returns: Array<{ filePath?: string; line?: number; column?: number; sourceRef?: string }>; ids: string[]; coverage: string[] }[] = [];
let clock = Date.now();
function check(name: string, run: () => void) {
  try { run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.stack : String(error) }); }
}
function authoredPosition(source: string, token: string, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index++) offset = source.indexOf(token, offset + 1);
  assert.ok(offset >= 0, `Missing authored token ${token}`);
  const lines = source.slice(0, offset).split(/\r\n?|\n/);
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}
const returns = (result: Result) => flattenProjectValidation(result).filter(finding => finding.code === code);
const returnEvidence = (result: Result) => result.evidence!.findings.filter(finding => finding.code === code);
const returnGaps = (result: Result) => result.evidence!.coverage.gaps.filter(gap => gap.check === 'md.return_context');
const deferred = (result: Result) => assert.ok(returnGaps(result).length, 'Expected an explicit md.return_context coverage gap');
const complete = (result: Result) => assert.deepEqual(returnGaps(result), []);
const positioned = (source: string, token = '<return', occurrence = 0, filePath = 'md/probe.xml') => (result: Result) => {
  const found = returns(result);
  assert.ok(found.length);
  for (const finding of found) {
    assert.equal(finding.filePath, filePath);
    assert.deepEqual({ line: finding.line, column: finding.column }, authoredPosition(source, token, occurrence));
  }
};
function validate(name: string, before: string | undefined, authored: string, expected: number,
  verify?: (result: Result) => void,
  options: { kind?: ExtensionProject['files'][number]['kind']; extraFiles?: ExtensionProject['files']; filePath?: string } = {}) {
  const filePath = options.filePath ?? 'md/probe.xml';
  const target = path.join(root, 'corpus', filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (before === undefined) { if (fs.existsSync(target)) fs.unlinkSync(target); }
  else {
    fs.writeFileSync(target, before);
    const stamp = new Date(clock += 1000); fs.utimesSync(target, stamp, stamp);
  }
  const project: ExtensionProject = { id: 'effective_return_probe', name: 'Effective return probe', files: [
    { path: 'content.xml', kind: 'content', content }, { path: filePath, kind: options.kind ?? 'md', content: authored }, ...(options.extraFiles ?? []),
  ] };
  const result = runProjectValidation(project, { references: { macros: new Set(), wares: new Set(), factions: new Set(), sectors: new Set() } });
  const flat = flattenProjectValidation(result);
  const found = flat.filter(finding => finding.code === code);
  const evidence = returnEvidence(result);
  observations.push({ name, ok: result.ok, codes: [...new Set(flat.map(finding => finding.code ?? ''))],
    returns: found.map(({ filePath: source, line, column, sourceRef }) => ({ filePath: source, line, column, sourceRef })),
    ids: evidence.map(finding => finding.findingId), coverage: [...new Set(result.evidence!.coverage.gaps.map(gap => gap.check))] });
  check(name, () => {
    assert.equal(result.pitfalls.findings.filter(finding => finding.code === code).length, expected, 'Raw project findings');
    assert.equal(found.length, expected, 'Flat project findings');
    assert.equal(evidence.length, expected, 'Validation evidence findings');
    assert.equal(new Set(evidence.map(finding => finding.findingId)).size, expected, 'Distinct evidence identities');
    verify?.(result);
  });
  return result;
}
function runTraceChecks() {
  const filePath = 'md/trace-probe.xml';
  const insertion = '<diff><add sel="/mdscript/cues/cue/actions"><return/></add></diff>';
  const evaluate = (trace: DiffElementProvenance | undefined) => lintEffectiveMdCueReturns(filePath, trace);
  const trace = (base: string, delta: string, options: DiffSimulationOptions['elementProvenance'] = true) => {
    const result = simulateXmlDiff(base, delta, { elementProvenance: options });
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.elementProvenance?.available, true, result.elementProvenance?.reason);
    return result.elementProvenance!;
  };
  const unavailable = (input: DiffElementProvenance | undefined) => {
    const result = evaluate(input);
    assert.deepEqual(result.findings, []);
    assert.ok(result.gaps.length, 'Expected unavailable effective return context');
    for (const gap of result.gaps) {
      assert.equal(gap.filePath, filePath);
      assert.ok(gap.reason.trim());
    }
    return result;
  };
  const clear = (input: DiffElementProvenance) => assert.deepEqual(evaluate(input), { findings: [], gaps: [] });
  check('trace consumer reports undefined provenance without inventing findings', () => unavailable(undefined));
  check('trace consumer refuses unavailable element budget rather than checked-clean ownership', () => {
    const result = simulateXmlDiff(host(), insertion, { elementProvenance: { maxElements: 2 } });
    assert.equal(result.ok, true);
    assert.equal(result.elementProvenance?.available, false);
    assert.ok(unavailable(result.elementProvenance).gaps.some(gap => /budget/i.test(gap.reason)));
  });
  check('trace consumer refuses unavailable source budget without changing simulation success', () => {
    const result = simulateXmlDiff(host(), insertion, { elementProvenance: { maxSourceChars: 10 } });
    assert.equal(result.ok, true);
    assert.equal(result.elementProvenance?.available, false);
    unavailable(result.elementProvenance);
  });
  for (const [name, base, delta] of [
    ['repaired base', '<mdscript name=Probe><cues><cue name="Start"><actions/></cue></cues></mdscript>', insertion],
    ['repaired payload', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return value=true/></add></diff>'],
    ['failed later operation', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><replace sel="[[">x</replace></diff>'],
  ]) {
    check(`trace consumer does not trust ${name}`, () => {
      const result = simulateXmlDiff(base, delta, { elementProvenance: true });
      assert.equal(result.elementProvenance?.available, false);
      unavailable(result.elementProvenance);
    });
  }
  check('trace consumer refuses an available flag without its final document', () => {
    unavailable({ ...trace(host(), insertion), document: undefined });
  });
  check('an inherited return without an initial identity cannot be exempted or blamed', () => {
    unavailable({ ...trace(host('<return/>'), '<diff/>'), initial: new Map() });
  });
  check('an inherited return with a missing frozen owner cannot use live parents as before evidence', () => {
    const actual = trace(host('<return/>'), '<diff/>');
    const initial = new Map(actual.initial);
    initial.delete(actual.document!.getElementsByTagName('cue')[0]);
    unavailable({ ...actual, initial });
  });
  check('a final authored return with missing original node mapping remains explicitly unavailable', () => {
    const actual = trace(host(), insertion);
    const mapped = new Map(actual.elements);
    mapped.delete(actual.document!.getElementsByTagName('return')[0]);
    unavailable({ ...actual, elements: mapped });
  });
  check('a relevant unusable origin cannot borrow a valid owner or attribute position', () => {
    const actual = trace(host(), insertion);
    const mapped = new Map(actual.elements);
    mapped.set(actual.document!.getElementsByTagName('return')[0], { operation: 0, reason: 'Controlled missing return origin' });
    const result = unavailable({ ...actual, elements: mapped });
    assert.ok(result.gaps.some(gap => /origin|position/i.test(gap.reason)));
  });
  check('unrelated historical trace gaps do not hide an exactly mapped final cue return', () => {
    const actual = trace(host(), insertion);
    const result = evaluate({ ...actual, gaps: ['Controlled historical gap for a discarded node'] });
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.gaps, []);
    assert.equal(result.findings[0].code, code);
    assert.equal(result.findings[0].filePath, filePath);
    assert.deepEqual({ line: result.findings[0].line, column: result.findings[0].column }, authoredPosition(insertion, '<return'));
  });
  check('removed authored return mapping failures do not survive final attachment', () => {
    const actual = trace(host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><remove sel="/mdscript/cues/cue/actions/return"/></diff>');
    const discarded = [...actual.elements.keys()].find(element => element.nodeName === 'return');
    assert.ok(discarded);
    const mapped = new Map(actual.elements);
    mapped.set(discarded, { operation: 0, reason: 'Controlled detached mapping gap' });
    clear({ ...actual, elements: mapped, gaps: ['Controlled detached mapping gap'] });
  });
  for (const [name, delta] of [
    ['false payload', '<diff><add sel="/mdscript/cues/cue/actions" if="false()"><return/></add></diff>'],
    ['unmatched payload', '<diff><add sel="/mdscript/cues/absent"><return/></add></diff>'],
    ['overwritten payload ancestor', '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><replace sel="/mdscript/cues/cue/actions"><actions/></replace></diff>'],
  ]) {
    check(`trace consumer ignores final-absent ${name} and historical gaps`, () => {
      clear({ ...trace(host(), delta), gaps: ['Controlled irrelevant historical gap'] });
    });
  }
  check('restored run-library purpose discards transient invalidity and historical mapping gaps', () => {
    clear({ ...trace(library('run_actions', '<return/>'), '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>'),
      gaps: ['Controlled overwritten purpose mapping gap'] });
  });
  check('new non-run library return uses the witnessed hard rule at the authored element', () => {
    const delta = '<diff><add sel="/mdscript/cues/library/actions"><return/></add></diff>';
    const result = evaluate(trace(library('include_actions'), delta));
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.gaps, []);
    assert.deepEqual({ line: result.findings[0].line, column: result.findings[0].column }, authoredPosition(delta, '<return'));
  });
  check('ordinary inherited return remains exempt using frozen identity despite value and name writes', () => {
    clear(trace(host('<return value="false"/>'), '<diff><replace sel="/mdscript/cues/cue/@name">Changed</replace><replace sel="/mdscript/cues/cue/actions/return/@value">true</replace></diff>'));
  });
  check('pure trace same-line findings use exact original BOM CRLF and Unicode coordinates', () => {
    const delta = '\uFEFF<diff>\r\n<!-- \u{1f680} <return/> -->\r\n<add sel="/mdscript/cues/cue/actions"><return/><return/></add></diff>';
    const result = evaluate(trace(host(), delta));
    assert.equal(result.findings.length, 2);
    assert.deepEqual(result.gaps, []);
    assert.deepEqual(result.findings.map(({ line, column }) => ({ line, column })),
      [authoredPosition(delta, '<return', 1), authoredPosition(delta, '<return', 2)]);
    assert.equal(new Set(result.findings.map(finding => finding.sourceRef)).size, 2);
  });
  check('pure trace clones under newly authored parents retain distinct actual return identities', () => {
    const delta = '<diff><add sel="/mdscript/cues/cue/actions"><do_all/><do_all/></add><add sel="/mdscript/cues/cue/actions/do_all"><return/></add></diff>';
    const result = evaluate(trace(host(), delta));
    assert.equal(result.findings.length, 2);
    assert.deepEqual(result.gaps, []);
    assert.equal(new Set(result.findings.map(finding => finding.sourceRef)).size, 2);
    for (const finding of result.findings) {
      assert.ok(finding.sourceRef);
      assert.deepEqual({ line: finding.line, column: finding.column }, authoredPosition(delta, '<return'));
    }
  });
  check('many inherited library returns keep final purpose reads bounded per actual owner', () => {
    const actual = trace(library('include_actions', '<return/>'.repeat(128)), '<diff/>');
    const owner = actual.document!.getElementsByTagName('library')[0];
    const original = owner.getAttribute;
    const reads = new Map<string, number>();
    owner.getAttribute = name => {
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return original.call(owner, name);
    };
    try {
      clear(actual);
      assert.ok((reads.get('purpose') ?? 0) <= 8, `Purpose was read ${reads.get('purpose')} times for one owner`);
    } finally { owner.getAttribute = original; }
  });
  check('many authored cue returns keep display-name reads bounded per actual owner', () => {
    const delta = '<diff><add sel="/mdscript/cues/cue/actions">' + '<return/>'.repeat(128) + '</add></diff>';
    const actual = trace(host(), delta);
    const owner = actual.document!.getElementsByTagName('cue')[0];
    const original = owner.getAttribute;
    const reads = new Map<string, number>();
    owner.getAttribute = name => {
      reads.set(name, (reads.get(name) ?? 0) + 1);
      return original.call(owner, name);
    };
    try {
      const result = evaluate(actual);
      assert.equal(result.findings.length, 128);
      assert.equal(new Set(result.findings.map(finding => finding.sourceRef)).size, 128);
      assert.ok(result.findings.every(finding => finding.cue === 'Start'));
      assert.deepEqual(result.gaps, []);
      assert.ok((reads.get('name') ?? 0) <= 8, `Name was read ${reads.get('name')} times for one owner`);
      assert.ok((reads.get('purpose') ?? 0) <= 8, `Purpose was read ${reads.get('purpose')} times for one owner`);
    } finally { owner.getAttribute = original; }
  });
}
function configureEnvironment() {
  process.env.X4_REFERENCE_ROOT = path.join(root, 'corpus');
  process.env.X4_CONFIG_DIR = path.join(root, 'config');
  process.env.X4_DATA_DIR = path.join(root, 'data');
  process.env.X4_GAME_PATH = path.join(root, 'game');
  delete process.env.X4_FORGE_DEV_SCRATCH_SETTINGS;
  delete process.env.X4_FORGE_DEV_ROOT;
}
function run() {
  configureEnvironment();
  validate('direct ordinary cue return preserves existing hard rule', host(), host('<return/>'), 1);
  validate('patch inserted ordinary return uses final cue owner', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add></diff>', 1);
  validate('patch replacement creates a newly authored ordinary return', host('<debug_text text="\'before\'"/>'), '<diff><replace sel="/mdscript/cues/cue/actions/debug_text"><return/></replace></diff>', 1);
  validate('new identical return is owned while inherited identical return is exempt', host('<return/>'), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add></diff>', 1);
  validate('nested child cue overrides outer run library owner', library('run_actions', ''), '<diff><add sel="/mdscript/cues/library"><cues><cue name="Child"><conditions><event_game_started/></conditions><actions><return/></actions></cue></cues></add></diff>', 1);
  validate('run-library return remains accepted by the existing structural contract', library('run_actions'), '<diff><add sel="/mdscript/cues/library/actions"><return value="true"/></add></diff>', 0);
  validate('unrelated edit does not import inherited ordinary cue return', host('<return/>'), '<diff><add sel="/mdscript/cues/cue/actions"><debug_text text="\'unrelated\'"/></add></diff>', 0);
  const changedPurpose = '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>';
  validate('effective library purpose change uses the witnessed hard rule', library('run_actions', '<return/>'), changedPurpose, 1,
    result => { positioned(changedPurpose, 'include_actions</replace>')(result); complete(result); });

  const add = (payload: string, selector = '/mdscript/cues/cue/actions') => `<diff><add sel="${selector}">${payload}</add></diff>`;
  const insert = add('<return/>');
  validate('ordinary return is positioned at its original patch element', host(), insert, 1, result => {
    positioned(insert)(result); complete(result);
  });
  const duplicate = '<diff>\r\n<add sel="/mdscript/cues/cue/actions"><return/><return/></add></diff>';
  validate('same-line returns preserve both original columns and distinct IDs', host(), duplicate, 2, result => {
    assert.deepEqual(returns(result).map(({ line, column }) => ({ line, column })),
      [authoredPosition(duplicate, '<return'), authoredPosition(duplicate, '<return', 1)]);
    assert.equal(new Set(returns(result).map(finding => finding.sourceRef)).size, 2);
    complete(result);
  });
  const cloned = '<diff><add sel="/mdscript/cues/cue/actions"><do_all/><do_all/></add><add sel="/mdscript/cues/cue/actions/do_all"><return/></add></diff>';
  validate('multimatch into previously authored parents preserves actual return identities', host(), cloned, 2, result => {
    positioned(cloned)(result);
    assert.equal(new Set(returns(result).map(finding => finding.sourceRef)).size, 2);
    complete(result);
  });
  const wrapped = add('<do_if value="true"><do_all><return/></do_all></do_if>');
  validate('nested action wrappers retain the nearest ordinary cue owner', host(), wrapped, 1, positioned(wrapped));
  const replacedIdentical = '<diff><replace sel="/mdscript/cues/cue/actions/return"><return/></replace></diff>';
  validate('replacing an inherited bad return with identical XML creates a new owned return', host('<return/>'), replacedIdentical, 1,
    positioned(replacedIdentical));
  const replaceActions = '<diff><replace sel="/mdscript/cues/cue/actions"><actions><return/></actions></replace></diff>';
  validate('replacing an inherited bad actions subtree owns the replacement return', host('<return/>'), replaceActions, 1, positioned(replaceActions));
  const moved = '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><add sel="/mdscript/cues/cue" pos="before"><cue name="Before"><conditions><event_game_started/></conditions><actions/></cue></add></diff>';
  validate('later sibling insertion cannot move the original authored return coordinate', host(), moved, 1, positioned(moved));
  for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
    const delta = `\uFEFF<?xml version="1.1"?><diff><!-- \u{1f680} <return/> -->${newline}<add sel="/mdscript/cues/cue/actions"><return value="true"/></add></diff>`;
    validate(`BOM Unicode and raw XML line coordinates survive ${JSON.stringify(newline)}`, host(), delta, 1,
      positioned(delta, '<return', 1));
  }
  for (const [name, delta] of [
    ['empty patch', '<diff/>'],
    ['cue rename', '<diff><replace sel="/mdscript/cues/cue/@name">Renamed</replace></diff>'],
    ['script rename', '<diff><replace sel="/mdscript/@name">Renamed</replace></diff>'],
    ['return value change', '<diff><replace sel="/mdscript/cues/cue/actions/return/@value">true</replace></diff>'],
    ['owner type attribute', '<diff><add sel="/mdscript/cues/cue" type="@type">library</add></diff>'],
    ['return type attribute', '<diff><add sel="/mdscript/cues/cue/actions/return" type="@type">run_actions</add></diff>'],
    ['ordinary owner purpose attribute', '<diff><add sel="/mdscript/cues/cue" type="@purpose">run_actions</add></diff>'],
  ]) {
    validate(`unchanged inherited ordinary return is exempt after ${name}`, host('<return value="false"/>'), delta, 0, complete);
  }
  const renamedNew = '<diff><replace sel="/mdscript/cues/cue/@name">Renamed</replace><add sel="/mdscript/cues/cue/actions"><return/></add></diff>';
  validate('a new return after an owner rename blames the return rather than the name write', host(), renamedNew, 1, positioned(renamedNew));
  validate('ordinary cue purpose does not grant run-library return privileges', host().replace('<cue name="Start"', '<cue name="Start" purpose="run_actions"'), insert, 1,
    positioned(insert));

  for (const branch of ['patch', 'on_abort', 'editable', 'force']) {
    const base = host().replace('<actions></actions>', `<${branch}/>`);
    validate(`direct ${branch} branch preserves the existing context exclusion`, base, add('<return/>', `/mdscript/cues/cue/${branch}`), 0, complete);
  }
  for (const branch of ['patch', 'on_abort', 'editable']) {
    validate(`nested ${branch} branch remains excluded inside ordinary actions`, host(`<${branch}/>`),
      add('<return/>', `/mdscript/cues/cue/actions/${branch}`), 0, complete);
  }
  validate('force inside actions does not broaden the direct-force exemption', host('<force/>'),
    add('<return/>', '/mdscript/cues/cue/actions/force'), 1);
  const changeToOrdinary = '<diff><replace sel="/mdscript/cues/cue/force"><actions><return/></actions></replace></diff>';
  validate('replacing a special branch with ordinary actions owns the new return', host().replace('<actions></actions>', '<force/>'), changeToOrdinary, 1,
    positioned(changeToOrdinary));
  validate('replacing ordinary actions with a special branch removes the final error', host('<return/>'),
    '<diff><replace sel="/mdscript/cues/cue/actions"><force><return/></force></replace></diff>', 0, complete);
  const cueReplacement = '<diff><replace sel="/mdscript/cues/library"><cue name="Start"><conditions><event_game_started/></conditions><actions><return/></actions></cue></replace></diff>';
  validate('owner element replacement creates an authored ordinary cue return', library('run_actions', '<return/>'), cueReplacement, 1,
    positioned(cueReplacement));
  validate('replacing an ordinary owner with a run library retains the existing structural control', host('<return/>'),
    '<diff><replace sel="/mdscript/cues/cue"><library name="Run" purpose="run_actions"><actions><return/></actions></library></replace></diff>', 0, complete);
  const nestedLibrary = host().replace('</cue>', '<cues><library name="Nested" purpose="run_actions"><actions/></library></cues></cue>');
  validate('nested run library overrides the outer ordinary cue owner', nestedLibrary,
    add('<return/>', '/mdscript/cues/cue/cues/library/actions'), 0, complete);
  validate('child ordinary cue remains owned beneath a non-run library', library('include_actions'),
    '<diff><add sel="/mdscript/cues/library"><cues><cue name="Child"><conditions><event_game_started/></conditions><actions><return/></actions></cue></cues></add></diff>', 1, complete);

  for (const purpose of ['include_actions', 'cue_ref', 'absent']) {
    const base = purpose === 'absent' ? library('cue_ref').replace(' purpose="cue_ref"', '') : library(purpose);
    const delta = add('<return/>', '/mdscript/cues/library/actions');
    validate(`authored effective ${purpose} library return uses the existing hard rule`, base,
      delta, 1, result => { positioned(delta)(result); complete(result); });
  }
  const removedPurpose = '<diff><remove sel="/mdscript/cues/library/@purpose"/></diff>';
  validate('effective library purpose removal is located at its authored operation', library('run_actions', '<return/>'),
    removedPurpose, 1, result => { positioned(removedPurpose, '<remove')(result); complete(result); });
  validate('different non-run purpose does not import an inherited invalid return', library('include_actions', '<return/>'),
    '<diff><replace sel="/mdscript/cues/library/@purpose">cue_ref</replace></diff>', 0, complete);
  validate('identical inherited non-run library contract remains exempt', library('include_actions', '<return/>'),
    '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>', 0, complete);
  validate('inherited non-run library return is not imported by name or value edits', library('include_actions', '<return value="false"/>'),
    '<diff><replace sel="/mdscript/cues/library/@name">Renamed</replace><replace sel="/mdscript/cues/library/actions/return/@value">true</replace></diff>', 0, complete);
  validate('restoring run purpose removes transient effective-library invalidity', library('run_actions', '<return/>'),
    '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>', 0, complete);
  validate('changing an inherited non-run library to run purpose remains accepted structurally', library('include_actions', '<return/>'),
    '<diff><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>', 0, complete);
  validate('new library return becomes structurally valid after its final purpose write', library('include_actions'),
    '<diff><add sel="/mdscript/cues/library/actions"><return/></add><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>', 0, complete);
  const mixedCallers = library('run_actions').replace('</cues>', '<cue name="Caller"><conditions><event_game_started/></conditions><actions><include_actions ref="Run"/></actions></cue></cues>');
  validate('incompatible callers do not change the structural run-library return control', mixedCallers,
    add('<return value="true"/>', '/mdscript/cues/library/actions'), 0, complete);

  for (const [name, base, delta] of [
    ['false insertion', host(), '<diff><add sel="/mdscript/cues/cue/actions" if="false()"><return/></add></diff>'],
    ['unmatched insertion', host(), '<diff><add sel="/mdscript/cues/absent"><return/></add></diff>'],
    ['removed return', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><remove sel="/mdscript/cues/cue/actions/return"/></diff>'],
    ['removed authored ancestor', host(), '<diff><add sel="/mdscript/cues/cue/actions"><do_all><return/></do_all></add><remove sel="/mdscript/cues/cue/actions/do_all"/></diff>'],
    ['overwritten ancestor', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><replace sel="/mdscript/cues/cue/actions"><actions><debug_text text="\'final\'"/></actions></replace></diff>'],
    ['non-return replacement', host('<return/>'), '<diff><replace sel="/mdscript/cues/cue/actions/return"><debug_text text="\'final\'"/></replace></diff>'],
    ['removed non-run library return', library('include_actions'), '<diff><add sel="/mdscript/cues/library/actions"><return/></add><remove sel="/mdscript/cues/library/actions/return"/></diff>'],
    ['comment and CDATA decoys', host(), '<diff><add sel="/mdscript/cues/cue/actions"><!-- <return/> --><![CDATA[<return/>]]><debug_text text="\'safe\'"/></add></diff>'],
  ]) {
    validate(`final attachment excludes ${name}`, base, delta, 0, complete);
  }
  validate('raw other kind at an MD path still uses effective ordinary ownership', host(), insert, 1, positioned(insert), { kind: 'other' });
  for (const [name, base, delta] of [
    ['missing canonical document', undefined, insert],
    ['repaired canonical XML', '<mdscript name=Probe><cues/></mdscript>', insert],
    ['malformed authored XML', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></diff>'],
    ['failed operation after a transient return', host(), '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><replace sel="[[">x</replace></diff>'],
    ['non-MD canonical root', '<root><actions/></root>', '<diff><add sel="/root/actions"><return/></add></diff>'],
  ] as const) {
    validate(`unavailable effective ownership is explicit for ${name}`, base, delta, 0, deferred);
  }
  validate('AIScript return does not enter the MD ownership rule', '<aiscript name="Probe"><actions/></aiscript>',
    '<diff><add sel="/aiscript/actions"><return/></add></diff>', 0, complete, { kind: 'aiscript', filePath: 'aiscripts/probe.xml' });
  validate('new namespaced return in run library is unavailable rather than checked-clear', library('run_actions'),
    '<diff><add sel="/mdscript/cues/library/actions"><return xmlns="urn:forge-test"/></add></diff>', 0, deferred);
  validate('authored namespace change affects an inherited ordinary return context', host('<return/>'),
    '<diff><add sel="/mdscript/cues/cue" type="@xmlns">urn:forge-test</add></diff>', 0, deferred);
  const transientNamespace = '<diff><add sel="/mdscript/cues/cue" type="@xmlns">urn:discarded</add><remove sel="/mdscript/cues/cue/@xmlns"/><add sel="/mdscript/cues/cue/actions"><return/></add></diff>';
  validate('removed transient namespace cannot hide a final authored ordinary return', host(), transientNamespace, 1, result => {
    positioned(transientNamespace)(result); complete(result);
  });
  validate('removed transient namespace does not import an inherited ordinary error or gap', host('<return/>'),
    '<diff><add sel="/mdscript/cues/cue" type="@xmlns">urn:discarded</add><remove sel="/mdscript/cues/cue/@xmlns"/></diff>', 0, complete);
  const clearedNamespace = '<diff><add sel="/mdscript/cues/cue/actions"><return/></add><add sel="/mdscript/cues/cue" type="@xmlns">urn:discarded</add><replace sel="/mdscript/cues/cue/@xmlns"/></diff>';
  validate('empty final namespace overwrite restores the ordinary authored-return check', host(), clearedNamespace, 1, result => {
    positioned(clearedNamespace)(result); complete(result);
  });
  validate('different final foreign namespace remains unavailable after overwrite', host(),
    '<diff><add sel="/mdscript/cues/cue" type="@xmlns">urn:first</add><replace sel="/mdscript/cues/cue/@xmlns">urn:final</replace><add sel="/mdscript/cues/cue/actions"><return/></add></diff>', 0, deferred);
  validate('removed namespaced return cannot leave a historical namespace gap', host(),
    '<diff><add sel="/mdscript/cues/cue/actions"><return xmlns="urn:discarded"/></add><remove sel="/mdscript/cues/cue/actions/return"/></diff>', 0, complete);
  validate('a final namespace change with no return does not manufacture return-context coverage', host(),
    '<diff><add sel="/mdscript/cues/cue" type="@xmlns">urn:unused</add></diff>', 0, complete);
  const xsiHost = host().replace('<mdscript name="Probe"', '<mdscript xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" name="Probe"');
  validate('unused standard xmlns:xsi declaration does not change unqualified MD return ownership', xsiHost, insert, 1, result => {
    positioned(insert)(result); complete(result);
  });
  for (const purpose of ['include_actions', 'cue_ref', 'absent']) {
    const direct = purpose === 'absent' ? library('cue_ref', '<return/>').replace(' purpose="cue_ref"', '') : library(purpose, '<return/>');
    validate(`direct ${purpose} library behavior remains unchanged`, host(), direct, 1, complete);
  }
  validate('direct run-library behavior remains unchanged', host(), library('run_actions', '<return/>'), 0, complete);
  validate('unavailable diff context cannot erase an established direct ordinary error', host(), host('<return/>'), 1, deferred,
    { extraFiles: [{ path: 'md/unavailable.xml', kind: 'md', content: '<diff/>' }] });
  validate('effective library error is counted beside the existing direct library error', library('include_actions'),
    add('<return/>', '/mdscript/cues/library/actions'), 2, result => {
      assert.equal(result.summary.mdPitfallErrors, 2); complete(result);
    },
    { extraFiles: [{ path: 'md/direct_library.xml', kind: 'md', content: library('include_actions', '<return/>').replace('name="Probe"', 'name="DirectLibrary"') }] });
  validate('unrelated direct pitfall and its counter survive effective cue checking', host(), insert, 1, result => {
    assert.equal(result.pitfalls.findings.filter(finding => finding.code === 'md_pitfall.cancel_conversation_actor_or_template').length, 1);
    assert.equal(result.summary.mdPitfallErrors, 2);
    complete(result);
  }, { extraFiles: [{ path: 'md/unrelated.xml', kind: 'md', content: host('<cancel_conversation/>').replace('name="Probe"', 'name="Unrelated"') }] });
}

function runLibraryTraceChecks() {
  const filePath = 'md/library-trace.xml';
  const added = '<diff><add sel="/mdscript/cues/library/actions"><return/></add></diff>';
  const changed = '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>';
  const trace = (base: string, delta: string) => {
    const result = simulateXmlDiff(base, delta, { elementProvenance: true });
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.elementProvenance?.available, true, result.elementProvenance?.reason);
    return result.elementProvenance!;
  };
  const evaluate = (actual: DiffElementProvenance | undefined) => lintEffectiveMdCueReturns(filePath, actual);
  const unavailable = (actual: DiffElementProvenance | undefined) => {
    const result = evaluate(actual);
    assert.deepEqual(result.findings, []);
    assert.ok(result.gaps.length, 'Expected an explicit unavailable library-return check');
    assert.ok(result.gaps.every(gap => gap.filePath === filePath && gap.reason.trim()));
  };
  for (const missing of ['absent', 'unusable'] as const) {
    check(`library trace ${missing} authored return origin cannot borrow its valid purpose origin`, () => {
      const actual = trace(library('run_actions'), '<diff><add sel="/mdscript/cues/library/actions"><return/></add><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>');
      const node = actual.document!.getElementsByTagName('return')[0];
      const elements = new Map(actual.elements);
      if (missing === 'absent') elements.delete(node);
      else elements.set(node, { operation: 0, reason: 'Controlled unusable authored return origin' });
      unavailable({ ...actual, elements });
    });
  }
  for (const missing of ['absent', 'unusable', 'zero-line', 'missing-column'] as const) {
    check(`library trace ${missing} inherited purpose cause cannot borrow a canonical return position`, () => {
      const actual = trace(library('run_actions', '<return/>'), changed);
      const owner = actual.document!.getElementsByTagName('library')[0];
      const attributes = new Map(actual.attributes);
      const ownerAttributes = new Map(attributes.get(owner));
      if (missing === 'absent') ownerAttributes.delete('purpose');
      else ownerAttributes.set('purpose', missing === 'unusable'
        ? { operation: 0, reason: 'Controlled unusable purpose origin' }
        : { operation: 0, line: missing === 'zero-line' ? 0 : 1, column: missing === 'missing-column' ? undefined : 1 });
      attributes.set(owner, ownerAttributes);
      unavailable({ ...actual, attributes });
    });
  }
  for (const missing of ['return', 'library'] as const) {
    check(`library trace missing frozen ${missing} identity remains unavailable for a purpose edit`, () => {
      const actual = trace(library('run_actions', '<return/>'), changed);
      const initial = new Map(actual.initial);
      initial.delete(actual.document!.getElementsByTagName(missing)[0]);
      unavailable({ ...actual, initial });
    });
  }
  check('library trace authored return keeps element origin despite later value and purpose writes', () => {
    const delta = '<diff><add sel="/mdscript/cues/library/actions"><return value="false"/></add><replace sel="/mdscript/cues/library/actions/return/@value">true</replace><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>';
    const result = evaluate(trace(library('run_actions'), delta));
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.gaps, []);
    assert.deepEqual({ line: result.findings[0].line, column: result.findings[0].column }, authoredPosition(delta, '<return'));
  });
  check('library trace inherited invalidity exemption needs no new purpose origin', () => {
    const actual = trace(library('include_actions', '<return/>'), '<diff><replace sel="/mdscript/cues/library/@purpose">cue_ref</replace></diff>');
    assert.deepEqual(evaluate({ ...actual, attributes: new Map(), gaps: ['Controlled irrelevant purpose origin gap'] }), { findings: [], gaps: [] });
  });
  check('library trace restored final validity ignores obsolete purpose origin failures', () => {
    const actual = trace(library('run_actions', '<return/>'), '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>');
    assert.deepEqual(evaluate({ ...actual, attributes: new Map(), gaps: ['Controlled overwritten purpose origin gap'] }), { findings: [], gaps: [] });
  });
  check('library trace unknown provenance budget refuses false checked-clean coverage', () => {
    const result = simulateXmlDiff(library('include_actions'), added, { elementProvenance: { maxElements: 2 } });
    assert.equal(result.ok, true);
    assert.equal(result.elementProvenance?.available, false);
    unavailable(result.elementProvenance);
  });
  check('many inherited library returns share bounded owner reads but retain distinct causal identities', () => {
    const actual = trace(library('run_actions', '<return/>'.repeat(128)), changed);
    const owner = actual.document!.getElementsByTagName('library')[0];
    const original = owner.getAttribute;
    const reads = new Map<string, number>();
    owner.getAttribute = name => { reads.set(name, (reads.get(name) ?? 0) + 1); return original.call(owner, name); };
    try {
      const result = evaluate(actual);
      assert.equal(result.findings.length, 128);
      assert.deepEqual(result.gaps, []);
      assert.equal(new Set(result.findings.map(finding => finding.sourceRef)).size, 128);
      assert.ok(result.findings.every(finding => finding.cue === 'Run'));
      assert.ok(result.findings.every(finding => finding.line === authoredPosition(changed, 'include_actions</replace>').line
        && finding.column === authoredPosition(changed, 'include_actions</replace>').column));
      assert.ok((reads.get('purpose') ?? 0) <= 8, `Purpose was read ${reads.get('purpose')} times for one owner`);
      assert.ok((reads.get('name') ?? 0) <= 8, `Name was read ${reads.get('name')} times for one owner`);
    } finally { owner.getAttribute = original; }
  });
}

function runLibraryChecks() {
  configureEnvironment();
  const base = (purpose: string | null, actions = '') => purpose === null
    ? library('cue_ref', actions).replace(' purpose="cue_ref"', '') : library(purpose, actions);
  const hardAt = (delta: string, token = '<return', occurrence = 0) => (result: Result) => {
    positioned(delta, token, occurrence)(result);
    assert.equal(result.ok, false, 'A forbidden final library return must prevent success');
    complete(result);
  };
  for (const purpose of ['include_actions', 'cue_ref', null, '']) {
    const label = purpose === null ? 'absent' : purpose || 'empty';
    const inserted = '<diff><add sel="/mdscript/cues/library/actions"><return/></add></diff>';
    validate(`library contract inserted ${label} return is a hard error at its element`, base(purpose), inserted, 1, hardAt(inserted));
    const replaced = '<diff><replace sel="/mdscript/cues/library/actions/debug_text"><return value="73"/></replace></diff>';
    validate(`library contract replaced ${label} return is newly authored`, base(purpose, '<debug_text text="\'before\'"/>'), replaced, 1, hardAt(replaced));
  }
  const wholeLibrary = '<diff><add sel="/mdscript/cues"><library name="Include" purpose="include_actions"><actions><return/></actions></library></add></diff>';
  validate('library contract newly added owner retains its return element origin', host(), wholeLibrary, 1, hardAt(wholeLibrary));
  const replacedOwner = '<diff><replace sel="/mdscript/cues/library"><library name="Replacement" purpose="include_actions"><actions><return/></actions></library></replace></diff>';
  validate('library contract replaced run owner owns the new non-run return', library('run_actions', '<return/>'), replacedOwner, 1, hardAt(replacedOwner));
  const editedAuthored = '<diff><add sel="/mdscript/cues/library/actions"><return value="false"/></add><replace sel="/mdscript/cues/library/actions/return/@value">true</replace><replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>';
  validate('library contract later value and purpose edits do not steal authored return attribution', library('run_actions'), editedAuthored, 1, hardAt(editedAuthored));
  const clones = '<diff><add sel="/mdscript/cues/library/actions"><do_all/><do_all/></add><add sel="/mdscript/cues/library/actions/do_all"><return/></add></diff>';
  validate('library contract multimatch clones share coordinates but retain actual identities', library('include_actions'), clones, 2, result => {
    hardAt(clones)(result); assert.equal(new Set(returns(result).map(finding => finding.sourceRef)).size, 2);
  });
  for (const purpose of ['include_actions', 'cue_ref', '']) {
    const delta = `<diff><replace sel="/mdscript/cues/library/@purpose">${purpose}</replace></diff>`;
    validate(`library contract inherited run return becomes invalid after ${purpose || 'empty'} purpose`, library('run_actions', '<return/>'), delta, 1,
      hardAt(delta, purpose ? `${purpose}</replace>` : '<replace'));
  }
  const removal = '<diff>\r\n<remove sel="/mdscript/cues/library/@purpose"/></diff>';
  validate('library contract inherited run return uses purpose removal operation origin', library('run_actions', '<return/>'), removal, 1, hardAt(removal, '<remove'));
  const emptyPurpose = '<diff><replace sel="/mdscript/cues/library/@purpose"/></diff>';
  validate('library contract empty self-closing purpose assignment uses operation origin', library('run_actions', '<return/>'), emptyPurpose, 1, hardAt(emptyPurpose, '<replace'));
  const finalCause = '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/@purpose">cue_ref</replace></diff>';
  validate('library contract final purpose write owns the inherited return error', library('run_actions', '<return/>'), finalCause, 1, hardAt(finalCause, 'cue_ref</replace>'));
  const sharedCause = '<diff>\r\n<replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>';
  const first = validate('library contract distinct inherited returns retain IDs at one purpose-change coordinate', library('run_actions', '<return/><return/>'), sharedCause, 2, result => {
    hardAt(sharedCause, 'include_actions</replace>')(result);
    assert.equal(new Set(returns(result).map(finding => finding.sourceRef)).size, 2);
  });
  validate('library contract same-source repeated validation preserves causal evidence IDs', library('run_actions', '<return/><return/>'), sharedCause, 2, result => {
    hardAt(sharedCause, 'include_actions</replace>')(result);
    assert.deepEqual(returnEvidence(result).map(finding => finding.findingId), returnEvidence(first).map(finding => finding.findingId));
  });
  for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
    const prefix = `\uFEFF<?xml version="1.1"?><diff><!-- \u{1f680} <return/> -->${newline}`;
    const inserted = `${prefix}<add sel="/mdscript/cues/library/actions"><return/></add></diff>`;
    validate(`library contract authored element keeps original XML1.1 Unicode coordinates ${JSON.stringify(newline)}`, library('include_actions'), inserted, 1,
      hardAt(inserted, '<return', 1));
    const changed = `${prefix}<replace sel="/mdscript/cues/library/@purpose">include_actions</replace></diff>`;
    validate(`library contract purpose cause keeps original XML1.1 Unicode coordinates ${JSON.stringify(newline)}`, library('run_actions', '<return/>'), changed, 1,
      hardAt(changed, 'include_actions</replace>'));
  }
  for (const [before, delta] of [
    ['include_actions', '<diff><replace sel="/mdscript/cues/library/@purpose">cue_ref</replace></diff>'],
    ['cue_ref', '<diff><remove sel="/mdscript/cues/library/@purpose"/></diff>'],
    [null, '<diff><add sel="/mdscript/cues/library" type="@purpose">include_actions</add></diff>'],
    ['include_actions', '<diff><replace sel="/mdscript/cues/library/@purpose"/></diff>'],
  ] as const) {
    validate(`library contract inherited invalid ${before ?? 'absent'} purpose remains exempt after another invalid contract`, base(before, '<return/>'), delta, 0, complete);
  }
  for (const [name, delta] of [
    ['false purpose edit', '<diff><replace sel="/mdscript/cues/library/@purpose" if="false()">include_actions</replace></diff>'],
    ['unmatched purpose edit', '<diff><replace sel="/mdscript/cues/library[@name=\'Absent\']/@purpose">include_actions</replace></diff>'],
    ['final restored run purpose', '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/@purpose">run_actions</replace></diff>'],
    ['removed inherited return', '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><remove sel="/mdscript/cues/library/actions/return"/></diff>'],
    ['removed owner', '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><remove sel="/mdscript/cues/library"/></diff>'],
    ['overwritten actions', '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><replace sel="/mdscript/cues/library/actions"><actions/></replace></diff>'],
  ]) {
    validate(`library contract final attachment excludes ${name}`, library('run_actions', '<return/>'), delta, 0, complete);
  }
  const removedAuthored = '<diff><add sel="/mdscript/cues/library/actions"><return/></add><remove sel="/mdscript/cues/library/actions/return"/></diff>';
  validate('library contract removed authored invalid return leaves no historical gap', library('include_actions'), removedAuthored, 0, complete);
  validate('library contract purpose change without a surviving return creates no contextual finding', library('run_actions'), finalCause, 0, complete);
  for (const result of ['', ' result="$Result"']) {
    const before = library('run_actions').replace('</cues>', `<cue name="Caller"><conditions><event_game_started/></conditions><actions><run_actions ref="Run"${result}/></actions></cue></cues>`);
    validate(`library contract valid run caller ${result ? 'captures' : 'discards'} result without a return error`, before,
      '<diff><add sel="/mdscript/cues/library/actions"><return value="73"/></add></diff>', 0, actual => {
        complete(actual);
        assert.equal(actual.ok, true, 'The valid inherited-library caller must actually validate');
        assert.deepEqual(actual.evidence!.findings.filter(finding => finding.severity === 'error'), []);
      });
    const callerHost = library('run_actions').replace('</cues>', '<cue name="Caller"><conditions><event_game_started/></conditions><actions/></cue></cues>');
    const authoredCall = `<diff><add sel="/mdscript/cues/library/actions"><return value="73"/></add><add sel="/mdscript/cues/cue/actions"><run_actions ref="Run"${result}/></add></diff>`;
    validate(`library contract authored run caller ${result ? 'captures' : 'discards'} inherited canonical library`, callerHost,
      authoredCall, 0, actual => {
        complete(actual);
        assert.equal(actual.ok, true, 'An authored valid call must resolve its inherited canonical library');
        assert.deepEqual(actual.evidence!.findings.filter(finding => finding.severity === 'error'), []);
      });
  }
  for (const [name, before, delta] of [
    ['authored foreign return', library('include_actions'), '<diff><add sel="/mdscript/cues/library/actions"><return xmlns="urn:forge-test"/></add></diff>'],
    ['changed inherited run context', library('run_actions', '<return/>'), '<diff><replace sel="/mdscript/cues/library/@purpose">include_actions</replace><add sel="/mdscript/cues/library" type="@xmlns">urn:forge-test</add></diff>'],
    ['inherited invalid exemption', library('include_actions', '<return/>'), '<diff><replace sel="/mdscript/cues/library/@purpose">cue_ref</replace><add sel="/mdscript/cues/library" type="@xmlns">urn:forge-test</add></diff>'],
  ]) {
    validate(`library contract namespace guard precedes ${name}`, before, delta, 0, deferred);
  }
  validate('library contract direct and effective errors both reach summary and evidence', library('include_actions'),
    '<diff><add sel="/mdscript/cues/library/actions"><return/></add></diff>', 2, result => {
      assert.equal(result.summary.mdPitfallErrors, 2); assert.equal(result.ok, false); complete(result);
    }, { extraFiles: [{ path: 'md/direct-library.xml', kind: 'md', content: library('include_actions', '<return/>').replace('name="Probe"', 'name="DirectLibrary"') }] });
}

function runEffectiveReferenceChecks() {
  configureEnvironment();
  const declaration = (name = 'Run', purpose = 'run_actions', parameters = '') => `<library name="${name}" purpose="${purpose}">${parameters}<actions/></library>`;
  const provider = (definitions = declaration(), actions = '') => `<mdscript name="Probe"><cues>${definitions}<cue name="Caller"><conditions><event_game_started/></conditions><actions>${actions}</actions></cue></cues></mdscript>`;
  const call = (payload: string) => `<diff><add sel="/mdscript/cues/cue[@name='Caller']/actions">${payload}</add></diff>`;
  const codeFindings = (result: Result, code: string) => flattenProjectValidation(result).filter(finding => finding.code === code);
  const referenceGaps = (result: Result) => result.evidence!.coverage.gaps.filter(gap => gap.check === 'md.reference_context' || gap.check === 'md.library_arguments');
  const noUnresolved = (result: Result) => {
    assert.deepEqual(result.cueIndex.unresolved, []);
    assert.deepEqual(codeFindings(result, 'project.unresolved_cue_ref'), []);
    assert.deepEqual(codeFindings(result, 'cue.unresolved'), []);
  };
  const accepted = (result: Result) => {
    noUnresolved(result); complete(result);
    assert.deepEqual(referenceGaps(result), []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.evidence!.findings.filter(finding => finding.severity === 'error'), []);
  };
  const unresolved = (result: Result) => {
    assert.ok(result.cueIndex.unresolved.length);
    assert.ok(codeFindings(result, 'project.unresolved_cue_ref').length);
    assert.ok(codeFindings(result, 'cue.unresolved').length);
    assert.equal(result.ok, false);
  };
  const unavailable = (result: Result) => assert.ok(referenceGaps(result).length, 'Unknown effective reference/argument context must remain explicit');
  check('effective reference missing authored positions cannot become checked-clean context', () => {
    const simulation = simulateXmlDiff(provider(), call('<run_actions ref="Run"/>'), { elementProvenance: true });
    assert.equal(simulation.ok, true);
    const trace = simulation.elementProvenance!;
    const target = [...trace.elements.keys()].find(node => node.nodeName === 'run_actions');
    assert.ok(target);
    const elements = new Map(trace.elements); elements.delete(target);
    const attributes = new Map(trace.attributes); attributes.delete(target);
    const facts = diffMdLibraryPurposeFacts('md/probe.xml', { ...trace, elements, attributes });
    const context = buildEffectiveMdReferenceContext([facts]);
    assert.ok(context.gaps.some(gap => gap.check === 'md.reference_context' && /position/.test(gap.reason)));
  });
  for (const result of ['', ' result="$Value"']) {
    validate(`effective reference authored caller ${result ? 'captures' : 'discards'} inherited library without authored-definition inflation`, provider(), call(`<run_actions ref="Run"${result}/>`), 0, actual => {
      accepted(actual);
      assert.deepEqual(actual.cueIndex.defined, [], 'Canonical lookup declarations are not cues authored by the mod');
      assert.equal(actual.summary.definedCues, 0);
    });
  }
  validate('effective reference missing target remains unresolved in both projections', provider(), call('<run_actions ref="Missing"/>'), 0, unresolved);
  validate('effective reference case mismatch cannot acquire case-insensitive identity', provider(), call('<run_actions ref="run"/>'), 0, actual => {
    assert.ok(actual.cueIndex.unresolved.length || referenceGaps(actual).length);
    assert.ok(codeFindings(actual, 'project.unresolved_cue_ref').length || referenceGaps(actual).length);
  });
  for (const [name, edit] of [
    ['removed', '<remove sel="/mdscript/cues/library"/>'],
    ['renamed', '<replace sel="/mdscript/cues/library/@name">Renamed</replace>'],
  ]) {
    const delta = `<diff>${edit}<add sel="/mdscript/cues/cue[@name='Caller']/actions"><run_actions ref="Run"/></add></diff>`;
    validate(`effective reference ${name} final target is not rescued from canonical-before declarations`, provider(), delta, 0, unresolved);
  }
  validate('effective reference duplicate final target cannot become checked-clean', provider(declaration() + declaration()), call('<run_actions ref="Run"/>'), 0, actual => {
    assert.ok(actual.cueIndex.unresolved.length || referenceGaps(actual).length || codeFindings(actual, 'md.cue_duplicate_name').length);
  });
  validate('effective reference duplicate script identity cannot become checked-clean', provider(), call('<run_actions ref="Run"/>'), 0, actual => {
    assert.ok(actual.cueIndex.unresolved.length || referenceGaps(actual).length);
  }, { extraFiles: [{ path: 'md/duplicate.xml', kind: 'md', content: provider() }] });
  validate('effective reference exact cross-script provider remains usable', provider(''), call('<run_actions ref="md.Other.Target"/>'), 0, accepted,
    { extraFiles: [{ path: 'md/other.xml', kind: 'md', content: provider(declaration('Target')).replace('name="Probe"', 'name="Other"') }] });
  validate('effective reference another script does not satisfy an unrelated local target', provider(''), call('<run_actions ref="Target"/>'), 0, unresolved,
    { extraFiles: [{ path: 'md/other.xml', kind: 'md', content: provider(declaration('Target')).replace('name="Probe"', 'name="Other"') }] });
  validate('effective reference raw other kind at MD path shares the effective owner', provider(), call('<run_actions ref="Run"/>'), 0, accepted, { kind: 'other' });
  for (const role of ['signal_cue', 'signal_cue_instantly']) {
    validate(`effective reference ${role} to inherited library remains a kind error`, provider(), call(`<${role} cue="Run"/>`), 0, actual => {
      noUnresolved(actual);
      assert.ok(codeFindings(actual, 'md.signal_library').some(finding => finding.severity === 'error'));
      assert.equal(actual.ok, false);
    });
  }
  const targetCue = '<cue name="Target"><conditions><event_game_started/></conditions><actions/></cue>';
  validate('effective reference running a canonical cue retains the existing kind warning', provider(targetCue), call('<run_actions ref="Target"/>'), 0, actual => {
    noUnresolved(actual);
    assert.ok(codeFindings(actual, 'md.run_actions_nonlibrary').some(finding => finding.severity === 'warning'));
  });
  validate('effective reference same spelling across roles cannot erase the invalid signal', provider(), call('<run_actions ref="Run"/><signal_cue cue="Run"/>'), 0, actual => {
    noUnresolved(actual);
    assert.equal(codeFindings(actual, 'md.signal_library').length, 1);
    assert.equal(actual.ok, false);
  });
  validate('effective reference known-empty signature still warns on undeclared action argument', provider(), call('<run_actions ref="Run"><param name="Unexpected" value="1"/></run_actions>'), 0, actual => {
    noUnresolved(actual);
    const found = actual.crossFile.findings.filter(finding => finding.code === 'md.run_actions_param_undeclared');
    assert.equal(found.length, 1); assert.equal(found[0].severity, 'warning');
    assert.equal(found[0].target?.line, undefined, 'An inherited declaration has no mod-authored target coordinate');
  });
  const optional = '<params><param name="Optional" default="42"/></params>';
  validate('effective reference valid declared optional action argument stays clear', provider(declaration('Run', 'run_actions', optional)), call('<run_actions ref="Run"><param name="Optional" value="1"/></run_actions>'), 0, actual => {
    accepted(actual); assert.deepEqual(codeFindings(actual, 'md.run_actions_param_undeclared'), []);
  });
  validate('effective reference action argument names remain exact-case', provider(declaration('Run', 'run_actions', optional)), call('<run_actions ref="Run"><param name="optional" value="1"/></run_actions>'), 0, actual => {
    noUnresolved(actual); assert.equal(codeFindings(actual, 'md.run_actions_param_undeclared').length, 1);
  });
  const required = '<params><param name="Required"/></params>';
  validate('effective reference missing required action contract is explicit coverage while its policy remains separate', provider(declaration('Run', 'run_actions', required)), call('<run_actions ref="Run"/>'), 0, actual => {
    noUnresolved(actual); unavailable(actual);
  });
  validate('effective reference unknown provider signature remains explicit when consulted', provider(declaration('Run', 'run_actions', '<params/><params/>')), call('<run_actions ref="Run"/>'), 0, unavailable);
  for (const [name, parameters] of [
    ['default-namespaced container', '<params xmlns="urn:forge-foreign"><param name="Optional" default="42"/></params>'],
    ['prefixed container', '<x:params xmlns:x="urn:forge-foreign"><x:param name="Optional" default="42"/></x:params>'],
    ['default-namespaced parameter', '<params><param xmlns="urn:forge-foreign" name="Optional" default="42"/></params>'],
    ['prefixed parameter', '<params xmlns:x="urn:forge-foreign"><x:param name="Optional" default="42"/></params>'],
  ]) {
    validate(`effective reference ${name} cannot become a known-empty or known-valid signature`, provider(declaration('Run', 'run_actions', parameters)), call('<run_actions ref="Run"/>'), 0, unavailable);
  }
  for (const argument of [
    '<param xmlns="urn:forge-foreign" name="Optional" value="1"/>',
    '<x:param xmlns:x="urn:forge-foreign" name="Optional" value="1"/>',
  ]) {
    validate(`effective reference foreign authored argument remains explicitly unavailable ${argument.startsWith('<x:') ? 'prefixed' : 'default'}`,
      provider(declaration('Run', 'run_actions', optional)), call(`<run_actions ref="Run">${argument}</run_actions>`), 0, unavailable);
  }
  validate('effective reference non-run purpose is not mislabeled as a checked run contract', provider(declaration('Run', 'include_actions')), call('<run_actions ref="Run"/>'), 0, unavailable);
  validate('effective reference cue-instance required parameter still produces its existing error', provider(declaration('Template', 'cue_ref', required)),
    '<diff><add sel="/mdscript/cues"><cue name="Child" ref="Template"/></add></diff>', 0, actual => {
      assert.equal(codeFindings(actual, 'md.cue_library_param_required').length, 1); assert.equal(actual.ok, false);
    });
  validate('effective reference cue-instance default presence remains optional', provider(declaration('Template', 'cue_ref', optional)),
    '<diff><add sel="/mdscript/cues"><cue name="Child" ref="Template"/></add></diff>', 0, actual => {
      accepted(actual); assert.equal(actual.cueIndex.defined.filter(definition => definition.name === 'Child').length, 1);
    });
  const suppliedChild = '<cue name="Child" ref="Template"><param name="Required" value="1"/></cue>';
  for (const [name, before, delta] of [
    ['earlier unchanged ref edit', provider(declaration('Template', 'cue_ref', required) + suppliedChild),
      '<diff>\n<replace sel="/mdscript/cues/cue[@name=\'Child\']/@ref">Template</replace>\n<remove sel="/mdscript/cues/cue[@name=\'Child\']/param"/>\n</diff>'],
    ['earlier valid call insertion', provider(declaration('Template', 'cue_ref', required)),
      `<diff>\n<add sel="/mdscript/cues">${suppliedChild}</add>\n<remove sel="/mdscript/cues/cue[@name='Child']/param"/>\n</diff>`],
  ]) {
    validate(`effective reference removed required argument uses its actual cause after ${name}`, before, delta, 0, actual => {
      const findings = codeFindings(actual, 'md.cue_library_param_required');
      assert.equal(findings.length, 1); assert.equal(actual.ok, false);
      assert.deepEqual({ line: findings[0].line, column: findings[0].column }, authoredPosition(delta, '<remove'));
    });
  }
  const pairSignature = '<params><param name="Required"/><param name="Second"/></params>';
  const pairChild = '<cue name="Child" ref="Template"><param name="Required" value="1"/><param name="Second" value="2"/></cue>';
  const pairRemoval = '<diff>\n<remove sel="/mdscript/cues/cue[@name=\'Child\']/param[@name=\'Required\']"/>\n<remove sel="/mdscript/cues/cue[@name=\'Child\']/param[@name=\'Second\']"/>\n</diff>';
  validate('effective reference distinct required removals keep distinct exact causal positions', provider(declaration('Template', 'cue_ref', pairSignature) + pairChild), pairRemoval, 0, actual => {
    const findings = codeFindings(actual, 'md.cue_library_param_required');
    assert.equal(findings.length, 2);
    assert.ok(findings[0].message.includes('"Required"'));
    assert.ok(findings[1].message.includes('"Second"'));
    assert.deepEqual(findings.map(finding => ({ line: finding.line, column: finding.column })),
      [authoredPosition(pairRemoval, '<remove'), authoredPosition(pairRemoval, '<remove', 1)]);
  });
  const requiredOptional = '<params><param name="Required"/><param name="Optional" default="42"/></params>';
  const incompleteChild = '<cue name="Child" ref="Template"><param name="Optional" value="1"/></cue>';
  const firstAdd = `<add sel="/mdscript/cues">${incompleteChild}</add>`;
  const missingControl = `<diff>\n${firstAdd}\n</diff>`;
  const missingBeforeRemoval = validate('effective reference missing required argument control before optional removal', provider(declaration('Template', 'cue_ref', requiredOptional)), missingControl, 0, actual => {
    const findings = codeFindings(actual, 'md.cue_library_param_required');
    assert.equal(findings.length, 1);
    assert.deepEqual({ line: findings[0].line, column: findings[0].column }, authoredPosition(missingControl, 'Template'));
  });
  validate('effective reference unrelated optional removal cannot steal required argument origin', provider(declaration('Template', 'cue_ref', requiredOptional)),
    `<diff>\n${firstAdd}\n<remove sel="/mdscript/cues/cue[@name='Child']/param"/>\n</diff>`, 0, actual => {
      const findings = codeFindings(actual, 'md.cue_library_param_required');
      const control = codeFindings(missingBeforeRemoval, 'md.cue_library_param_required')[0];
      assert.equal(findings.length, 1);
      assert.deepEqual({ line: findings[0].line, column: findings[0].column }, { line: control.line, column: control.column });
    });
  validate('effective reference restoring the removed required argument leaves no historical error', provider(declaration('Template', 'cue_ref', required) + suppliedChild),
    '<diff><remove sel="/mdscript/cues/cue[@name=\'Child\']/param"/><add sel="/mdscript/cues/cue[@name=\'Child\']"><param name="Required" value="2"/></add></diff>', 0, actual => {
      accepted(actual); assert.deepEqual(codeFindings(actual, 'md.cue_library_param_required'), []);
    });
  for (const [name, delta] of [
    ['false', '<diff><add sel="/mdscript/cues/cue[@name=\'Caller\']/actions" if="false()"><run_actions ref="Missing"/></add></diff>'],
    ['no-match', '<diff><add sel="/mdscript/cues/cue[@name=\'Absent\']/actions"><run_actions ref="Missing"/></add></diff>'],
    ['removed', '<diff><add sel="/mdscript/cues/cue[@name=\'Caller\']/actions"><run_actions ref="Missing"/></add><remove sel="/mdscript/cues/cue/actions/run_actions"/></diff>'],
    ['overwritten', '<diff><add sel="/mdscript/cues/cue[@name=\'Caller\']/actions"><run_actions ref="Missing"/></add><replace sel="/mdscript/cues/cue/actions"><actions/></replace></diff>'],
  ]) {
    validate(`effective reference ${name} payload cannot create a final unresolved call`, provider(), delta, 0, actual => {
      noUnresolved(actual); assert.deepEqual(referenceGaps(actual), []);
    });
  }
  validate('effective reference untouched inherited bad caller is not imported as authored', provider(declaration(), '<run_actions ref="Missing"/>'), call('<debug_text text="\'unrelated\'"/>'), 0, actual => {
    noUnresolved(actual); assert.deepEqual(codeFindings(actual, 'md.run_actions_param_undeclared'), []);
  });
  validate('effective reference missing canonical composition stays explicitly unavailable', undefined, call('<run_actions ref="Run"/>'), 0, unavailable);
  validate('effective reference failed canonical parse is not silently trusted', '<mdscript><broken></mdscript>', call('<run_actions ref="Run"/>'), 0, unavailable);
  validate('effective reference foreign namespace cannot supply trusted canonical declarations', provider().replace('<mdscript ', '<mdscript xmlns="urn:forge-test" '), call('<run_actions ref="Run"/>'), 0, unavailable);
  validate('effective reference unavailable participating inventory cannot hide a collision', provider(), call('<run_actions ref="Run"/>'), 0, unavailable,
    { extraFiles: [{ path: 'md/unknown.xml', kind: 'md' }] });
}

if (workerRoot) {
  assertOwned();
  if (referenceOnly) runEffectiveReferenceChecks();
  else if (libraryOnly) { runLibraryTraceChecks(); runLibraryChecks(); }
  else {
    runTraceChecks();
    if (!process.argv.includes('--trace-only')) { run(); runLibraryTraceChecks(); runLibraryChecks(); runEffectiveReferenceChecks(); }
  }
  const pass = checks.every(item => item.pass);
  console.log(JSON.stringify({ pass, passed: checks.filter(item => item.pass).length, total: checks.length, checks, observations }, null, 2));
  if (!pass) process.exitCode = 1;
} else {
  try {
    fs.writeFileSync(owner, JSON.stringify(marker)); assertOwned();
    const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--worker', root, ...process.argv.slice(2)], { stdio: 'inherit' });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } finally { assertOwned(); fs.rmSync(root, { recursive: true, force: true }); }
}
