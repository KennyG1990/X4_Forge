import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { bindDiagnosticSourceFiles } from '../src/server/diagnosticSourceNavigation';
import type { ProjectFile } from '../src/lib/extensionProject';
import { lintAiscript, runAiscriptLintSelftest } from '../src/lib/aiscriptLint';
import { buildMdVariableAvailabilityContext, lintMdPitfalls } from '../src/lib/mdPitfallLints';
import type { ValidationCoverageGap } from '../src/lib/validationEvidence';
import { createSourcePositionLocator, indexXmlElementSpans } from '../src/lib/xmlSourceSpans';
import { fnvHash } from '../src/lib/workspaceIdentity';
import type { MDNode, OriginalModeledFile } from '../src/types';

const path = 'md/fixture.xml';
const content = '\uFEFF<mdscript/>\r\n<!--🚀--><cue/>';
const file: ProjectFile = { path, kind: 'md', content };
const digest = crypto.createHash('sha256').update(content).digest('hex');
const selected = new Map([[path, file]]);
const finding = { code: 'reference.unknown_ware', filePath: path, line: 2, column: 10 };
const bind = bindDiagnosticSourceFiles('fixture', selected, [file]);
const ready = { status: 'ready', path, sourceFolder: 'fixture', sha256: digest, line: 1, column: 9 };

assert.deepEqual(bind(finding), ready);
assert.deepEqual(bind({ ...finding, line: 1, column: 2 }), { ...ready, line: 0, column: 0 });
assert.equal(bind({ ...finding, code: 'diff.post-apply.reference.unknown_ware' }), undefined);
assert.equal(bind({ ...finding, filePath: 'MD/fixture.xml' })?.status, 'unavailable');
assert.deepEqual(bind({ ...finding, column: 0 }), { status: 'unavailable', reason: 'position-unavailable' });
assert.deepEqual(bindDiagnosticSourceFiles('fixture', selected, [])(finding),
  { status: 'unavailable', reason: 'materialized-source' });
assert.deepEqual(bindDiagnosticSourceFiles(undefined, selected, [file])(finding),
  { status: 'unavailable', reason: 'materialized-source' });
assert.deepEqual(bindDiagnosticSourceFiles('fixture', selected, [{ ...file, content: '<changed/>' }])(finding),
  { status: 'unavailable', reason: 'source-mismatch' });
const exceptional = { ...file, content: content.replace('\r\n', '\u2028') };
const bindExceptional = bindDiagnosticSourceFiles('fixture', new Map([[path, exceptional]]), [exceptional]);
assert.deepEqual(bindExceptional({ ...finding, code: 'aiscript.order_param_missing_text' }),
  { status: 'unavailable', reason: 'position-unavailable' });
assert.equal(bind({ ...finding, code: 'aiscript.order_param_missing_text' })?.status, 'ready');
const aiPath = 'aiscripts/order.xml';
const singleLine = '<aiscript><order id="Fixture"><params><!--🚀--><param name="radius" type="number"/></params></order></aiscript>';
const aiContent = '\uFEFF' + singleLine;
const aiFile: ProjectFile = { path: aiPath, kind: 'aiscript', content: aiContent };
const aiFindings = lintAiscript(aiContent);
assert.equal(aiFindings.length, 1);
const ai = bindDiagnosticSourceFiles('fixture', new Map([[aiPath, aiFile]]), [aiFile])({
  ...aiFindings[0], filePath: aiPath,
});
assert.equal(ai?.status, 'ready');
assert.equal(ai?.line, 0);
assert.equal(ai?.column, singleLine.indexOf('<param name'));

const initialStatePath = 'md/initial-state.xml';
const initialStateLine = '<mdscript name="SourceGap"><cues><cue name="Run"><actions><opaque_effect/>'
  + '<debug_text text="&#36;Probe + &#36;Probe"/></actions></cue></cues></mdscript>';
const initialStateSample = (raw: string) => {
  const file: ProjectFile = { path: initialStatePath, kind: 'md', content: raw };
  const selected = new Map([[initialStatePath, file]]);
  const context = buildMdVariableAvailabilityContext([file], null);
  const gaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(raw, { filePath: initialStatePath, variableAvailability: context.context, initialStateGaps: gaps });
  return { file, selected, gaps, bind: bindDiagnosticSourceFiles('fixture', selected, [file]) };
};
const initialStateFinding = {
  code: 'md.variable_initial_state', filePath: initialStatePath, line: 1,
  column: initialStateLine.indexOf('&#36;Probe') + 1,
};
const initialStateExpected = (raw: string, line: number, column: number) => ({
  status: 'ready', path: initialStatePath, sourceFolder: 'fixture',
  sha256: crypto.createHash('sha256').update(raw).digest('hex'), line, column,
});
for (const prefix of ['', '\uFEFF']) {
  const raw = prefix + initialStateLine;
  const sample = initialStateSample(raw);
  assert.equal(sample.gaps.length, 2);
  assert.deepEqual(sample.gaps.map(gap => [gap.line, gap.column]), [
    [1, raw.indexOf('&#36;Probe') + 1], [1, raw.lastIndexOf('&#36;Probe') + 1],
  ]);
  assert.deepEqual(sample.gaps.map(gap => sample.bind({ ...gap, code: gap.check })), [
    initialStateExpected(raw, 0, initialStateLine.indexOf('&#36;Probe')),
    initialStateExpected(raw, 0, initialStateLine.lastIndexOf('&#36;Probe')),
  ]);
}
const initialStateCrLf = '\uFEFF' + initialStateLine.replace('<debug_text', '\r\n<debug_text');
const initialStateSecondLine = initialStateCrLf.split('\r\n')[1];
const crLfSample = initialStateSample(initialStateCrLf);
assert.deepEqual(crLfSample.gaps.map(gap => [gap.line, gap.column]), [
  [2, initialStateSecondLine.indexOf('&#36;Probe') + 1],
  [2, initialStateSecondLine.lastIndexOf('&#36;Probe') + 1],
]);
assert.deepEqual(crLfSample.gaps.map(gap => crLfSample.bind({ ...gap, code: gap.check })), [
  initialStateExpected(initialStateCrLf, 1, initialStateSecondLine.indexOf('&#36;Probe')),
  initialStateExpected(initialStateCrLf, 1, initialStateSecondLine.lastIndexOf('&#36;Probe')),
]);
const plainInitialState = initialStateSample(initialStateLine);
assert.deepEqual(bindDiagnosticSourceFiles('fixture', plainInitialState.selected, [])(initialStateFinding),
  { status: 'unavailable', reason: 'materialized-source' });
assert.deepEqual(bindDiagnosticSourceFiles(undefined, plainInitialState.selected, [plainInitialState.file])(initialStateFinding),
  { status: 'unavailable', reason: 'materialized-source' });
assert.deepEqual(bindDiagnosticSourceFiles('fixture', new Map(), [plainInitialState.file])(initialStateFinding),
  { status: 'unavailable', reason: 'materialized-source' });
const changedInitialState = { ...plainInitialState.file, content: initialStateLine.replace('SourceGap', 'EditedGap') };
assert.deepEqual(bindDiagnosticSourceFiles('fixture', plainInitialState.selected, [changedInitialState])(initialStateFinding),
  { status: 'unavailable', reason: 'source-mismatch' });
assert.deepEqual(bindDiagnosticSourceFiles('fixture', new Map([[initialStatePath, changedInitialState]]),
  [plainInitialState.file])(initialStateFinding), { status: 'unavailable', reason: 'source-mismatch' });
assert.deepEqual(plainInitialState.bind({ ...initialStateFinding, line: undefined }),
  { status: 'unavailable', reason: 'position-unavailable' });
assert.deepEqual(plainInitialState.bind({ ...initialStateFinding, column: undefined }),
  { status: 'unavailable', reason: 'position-unavailable' });
assert.deepEqual(plainInitialState.bind({ ...initialStateFinding, line: 0 }),
  { status: 'unavailable', reason: 'position-unavailable' });
assert.deepEqual(plainInitialState.bind({ ...initialStateFinding, column: 0 }),
  { status: 'unavailable', reason: 'position-unavailable' });
for (const separator of ['\u0085', '\u2028', '\u2029']) {
  const exceptionalFile = { ...plainInitialState.file, content: initialStateLine + separator };
  const bindExceptionalInitialState = bindDiagnosticSourceFiles('fixture',
    new Map([[initialStatePath, exceptionalFile]]), [exceptionalFile]);
  assert.deepEqual(bindExceptionalInitialState(initialStateFinding), { status: 'unavailable', reason: 'position-unavailable' });
}
assert.equal(plainInitialState.bind({ ...initialStateFinding, code: 'diff.post-apply.md.variable_initial_state' }), undefined);

const mdContent = '\uFEFF<mdscript><cues><cue name="Repeated">\r\n<actions>\r'
  + '<!--🚀--><set_value name="$x" exact="ware.missing" /><opaque exact="ware.absent" />'
  + '</actions></cue></cues></mdscript>';
const mdLocation = createSourcePositionLocator(mdContent);
const mdSpans = [...indexXmlElementSpans(mdContent).values()];
const modeled = (file: string, tag: string, id: string): MDNode => {
  const span = mdSpans.find(item => item.tag === tag)!;
  return {
    id, type: tag === 'cue' ? 'cue' : 'action', label: 'Repeated', xmlTag: tag, x: 0, y: 0,
    properties: {}, propertiesSchema: [], inputs: [], outputs: [],
    source: { path: file, semanticPath: span.path, start: span.start, end: span.end, modeled: true,
      identity: { key: id, ambiguous: false, fileHash: fnvHash(mdContent) } },
  };
};
const a = 'md/a.xml';
const b = 'md/b.xml';
const files = [a, b].map(path => ({ path, kind: 'md' as const, content: mdContent }));
const originalFiles: OriginalModeledFile[] = files;
const aCue = modeled(a, 'cue', 'a-cue');
const bCue = modeled(b, 'cue', 'b-cue');
const aAction = modeled(a, 'set_value', 'a-action');
const bAction = modeled(b, 'set_value', 'b-action');
const modeledWorkspace = { nodes: [aCue, aAction, bCue, bAction], originalFiles };
const mdFinding = { code: 'reference.unknown_ware', filePath: b, ...mdLocation(mdContent.indexOf('missing')) };
const bindMd = (workspace = modeledWorkspace) => bindDiagnosticSourceFiles('fixture',
  new Map(files.map(file => [file.path, file])), files, workspace);
const selectedNode = (binding: ReturnType<ReturnType<typeof bindMd>>) =>
  binding?.status === 'ready' ? binding.nodeId : undefined;
assert.equal(selectedNode(bindMd()(mdFinding)), 'b-action');
assert.equal(selectedNode(bindMd()({ ...mdFinding, code: 'REF_UNKNOWN_WARE' })), 'b-action');
assert.equal(selectedNode(bindMd()({ ...mdFinding, code: 'XSD_UNKNOWN_ATTRIBUTE' })), 'b-action');
assert.equal(bindMd()({ ...mdFinding, code: 'post-apply.XSD_UNKNOWN_ATTRIBUTE' }), undefined);
assert.equal(selectedNode(bindMd()({ ...mdFinding, filePath: a })), 'a-action');
assert.equal(selectedNode(bindMd()({ ...mdFinding, ...mdLocation(mdContent.indexOf('absent')) })), undefined);
assert.equal(selectedNode(bindMd({ ...modeledWorkspace, nodes: [...modeledWorkspace.nodes, bAction] })(mdFinding)), undefined);
assert.equal(selectedNode(bindMd({ ...modeledWorkspace, nodes: [...modeledWorkspace.nodes, { ...bAction, id: 'duplicate-span' }] })(mdFinding)), undefined);
assert.equal(selectedNode(bindMd({ ...modeledWorkspace, originalFiles: [files[0], { ...files[1], content: '<changed/>' }] })(mdFinding)), undefined);
assert.equal(selectedNode(bindMd({ ...modeledWorkspace,
  nodes: [aCue, aAction, bCue, { ...bAction, source: { ...bAction.source!, start: bAction.source!.start + 1 } }],
})(mdFinding)), undefined);
const lint = runAiscriptLintSelftest();
assert.ok(lint.pass, JSON.stringify(lint.checks.filter(check => !check.pass)));
console.log(`Diagnostic source snapshot: passed, existing AI lint ${lint.checks.length}/${lint.checks.length} passed`);
