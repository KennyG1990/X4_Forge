import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { bindDiagnosticSourceFiles } from '../src/server/diagnosticSourceNavigation';
import type { ProjectFile } from '../src/lib/extensionProject';
import { lintAiscript, runAiscriptLintSelftest } from '../src/lib/aiscriptLint';
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
