import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as contracts from '../src/server/projectApiContract';
import { ValidationInputError } from '../src/lib/validationEvidence';

const api = contracts;
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, run: () => void) {
  try { run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); }
}
function accepts(name: string, route: string, value: unknown) {
  check(name, () => contracts.validateProjectApiBody(route, value));
}
function refuses(name: string, route: string, value: unknown) {
  check(name, () => assert.throws(() => contracts.validateProjectApiBody(route, value), ValidationInputError));
}
const workspace = { name: 'C06 contract test', nodes: [], links: [],
  passthroughFiles: [{ path: 'content.xml', content: '<content id="c06_test" version="100" />' }] };
const head = 'a'.repeat(16);
const sha256 = 'b'.repeat(64);
const workspaceId = `ws_${'c'.repeat(24)}`;

accepts('bootstrap header/default selectors remain valid', '/api/agent/workspaces/bootstrap', {});
accepts('bootstrap explicit selectors', '/api/agent/workspaces/bootstrap', { clientId: 'tab-1', workspaceId });
refuses('bootstrap array refused', '/api/agent/workspaces/bootstrap', []);
refuses('bootstrap coerced client refused', '/api/agent/workspaces/bootstrap', { clientId: 123 });
refuses('bootstrap invalid workspace selector refused', '/api/agent/workspaces/bootstrap', { workspaceId: 'wrong' });
refuses('bootstrap unknown options refused', '/api/agent/workspaces/bootstrap', { force: true });
accepts('restore valid selector', '/api/agent/workspace/restore-parked', { targetWorkspaceId: workspaceId });
refuses('restore nonstring selector refused', '/api/agent/workspace/restore-parked', { targetWorkspaceId: [workspaceId] });

for (const value of [{}, { name: 'Empty new workspace' }, { clientId: 'tab-1', workspace }]) {
  check(`workspace create preserves ${Object.keys(value).join('/') || 'default'}`, () => api.validateWorkspaceCreateBody(value));
}
for (const value of [[], { workspace: [] }, { workspace: {} }, { workspace: { name: 'Explicit malformed' } }, { name: false }, { workspace: { nodes: 'lost graph' } }, { force: true }]) {
  check(`workspace create refuses ${JSON.stringify(value)}`, () => assert.throws(() => api.validateWorkspaceCreateBody(value), ValidationInputError));
}
check('receipt routes bypass generic body rejection', () => {
  for (const route of ['/api/agent/workspace', '/api/agent/workspace/merge', '/api/agent/workspaces']) contracts.validateProjectApiBody(route, []);
});
check('workspace replace valid CAS', () => api.validateWorkspaceMutationBody('replace', { workspace, expectedHead: head, expectedSnapshotHash: sha256, dryRun: false, force: false }));
check('workspace mutation body transport selectors preserved', () => api.validateWorkspaceMutationBody('replace', { workspace, workspaceId, clientId: 'client_contract_tests', expectedHead: head }));
check('workspace create body transport selectors preserved', () => api.validateWorkspaceCreateBody({ workspace, workspaceId, clientId: 'client_contract_tests' }));
check('workspace mutation malformed transport refused', () => assert.throws(() => api.validateWorkspaceMutationBody('merge', { changes: {}, workspaceId: [workspaceId] }), ValidationInputError));
check('workspace merge partial clear remains valid', () => api.validateWorkspaceMutationBody('merge', { changes: { description: null, nodes: [] }, expectedVersion: 0, dryRun: true }));
check('missing workspace retains receipt preflight message', () => assert.throws(() => api.validateWorkspaceMutationBody('replace', {}), { message: "Missing required 'workspace' body parameter." }));
check('missing changes retains receipt preflight message', () => assert.throws(() => api.validateWorkspaceMutationBody('merge', {}), { message: "Missing required 'changes' object (top-level workspace fields to merge)." }));
for (const [name, value] of Object.entries({ array: [], workspaceArray: { workspace: [] }, graphString: { workspace: { ...workspace, nodes: 'lost' } }, flag: { workspace, dryRun: 'false' }, force: { workspace, force: 1 }, version: { workspace, expectedVersion: '2' }, negativeVersion: { workspace, expectedVersion: -1 }, head: { workspace, expectedHead: [] }, unknown: { workspace, overwrite: true } })) {
  check(`workspace replace refuses ${name}`, () => assert.throws(() => api.validateWorkspaceMutationBody('replace', value), ValidationInputError));
}
check('merge refuses array changes', () => assert.throws(() => api.validateWorkspaceMutationBody('merge', { changes: [] }), ValidationInputError));
check('merge refuses scalar known graph field', () => assert.throws(() => api.validateWorkspaceMutationBody('merge', { changes: { nodes: 'lost' } }), ValidationInputError));

for (const route of ['/api/agent/release/nexus/prepare', '/api/agent/package/release', '/api/agent/release/steam/prepare']) {
  accepts(`${route} default bump`, route, { workspace });
  accepts(`${route} supported bump`, route, { workspace, bump: 'minor' });
  refuses(`${route} unknown bump`, route, { workspace, bump: 'major' });
  refuses(`${route} malformed workspace`, route, { workspace: [] });
  refuses(`${route} missing workspace`, route, {});
  refuses(`${route} unknown field`, route, { workspace, overwrite: true });
}
accepts('Steam UI empty optional values', '/api/agent/release/steam/prepare', { workspace, bump: 'none', minorUpdate: false, previewPath: '', toolPath: '', changeNote: '' });
refuses('Steam flag is not truthiness', '/api/agent/release/steam/prepare', { workspace, minorUpdate: 'false' });
refuses('Steam path is not coerced', '/api/agent/release/steam/prepare', { workspace, previewPath: 42 });
const artifact = { platform: 'nexus', modId: 'c06_test', artifactPath: 'C:/scratch/c06.zip' };
accepts('artifact valid download', '/api/agent/release/artifact/download', artifact);
refuses('artifact unsafe mod id', '/api/agent/release/artifact/download', { ...artifact, modId: '../other' });
refuses('artifact unknown platform', '/api/agent/release/artifact/download', { ...artifact, platform: 'public' });
const receipt = { ...artifact, method: 'browser-save', destination: 'c06.zip', sha256, sizeBytes: 42 };
accepts('export UI receipt', '/api/agent/release/export/receipt', receipt);
for (const [name, changes] of Object.entries({ sizeString: { sizeBytes: '42' }, hash: { sha256: 'no' }, controls: { destination: 'line\r\ninjected' }, method: { method: 'clipboard' }, flag: { overwrite: true } })) {
  refuses(`export refuses ${name}`, '/api/agent/release/export/receipt', { ...receipt, ...changes });
}
accepts('Steam verify ID', '/api/agent/release/steam/verify', { modId: 'c06_test' });
accepts('Steam adoption preview', '/api/agent/release/steam/adopt', { modId: 'c06_test', apply: false });
accepts('Steam adoption CAS', '/api/agent/release/steam/adopt', { modId: 'c06_test', apply: true, expectedSourceSha256: sha256, expectedWorkshopId: 'ws_123' });
refuses('Steam apply string refused', '/api/agent/release/steam/adopt', { modId: 'c06_test', apply: 'false' });
refuses('Steam adoption malformed hash refused', '/api/agent/release/steam/adopt', { modId: 'c06_test', expectedSourceSha256: 'wrong' });
refuses('Steam verify unknown fields refused', '/api/agent/release/steam/verify', { modId: 'c06_test', apply: true });
accepts('pasted log empty trace is valid', '/api/agent/log-diagnose', { modId: 'c06_test', tail: '' });
refuses('pasted log nonstring trace refused', '/api/agent/log-diagnose', { modId: 'c06_test', tail: {} });
refuses('pasted log unknown fields refused', '/api/agent/log-diagnose', { modId: 'c06_test', tail: '', workspace });

check('canonical runtime supported query', () => api.validateProjectApiQuery('/api/agent/runtime-debugger', { expect: 'one,two' }));
check('legacy brief caller modId preserved', () => api.validateProjectApiQuery('/api/agent/debug-watcher/brief', { modId: 'c06_test', expect: '' }));
check('log filter remains valid', () => api.validateProjectApiQuery('/api/agent/game-log/status', { modId: 'c06_test' }));
check('workspace query addressing remains valid', () => api.validateProjectApiQuery('/api/agent/workspace', { workspaceId, clientId: 'client_contract_tests' }));
check('legacy runtime query addressing remains valid', () => api.validateProjectApiQuery('/api/agent/debug-watcher/brief', { workspaceId, clientId: 'client_contract_tests', expect: '' }));
check('readiness query addressing preserved', () => api.validateProjectApiQuery('/api/agent/readiness', { workspaceId }));
for (const [route, query] of [
  ['/api/agent/runtime-debugger', { modId: 'c06_test' }],
  ['/api/agent/debug-watcher/brief', { expect: ['one', 'two'] }],
  ['/api/agent/debug-watcher/brief', { expect: 'x'.repeat(257) }],
  ['/api/agent/game-log/status', { modId: 123 }],
  ['/api/agent/runtime-control', { workspaceId }],
  ['/api/agent/diagnostics', { unknown: 'yes' }],
] as const) check(`query refuses ${route} ${JSON.stringify(query).slice(0, 50)}`, () => assert.throws(() => api.validateProjectApiQuery(route, query), ValidationInputError));

check('workspace actual manifest identity', () => assert.equal(api.workspaceApiSubject(workspace).modId, 'c06_test'));
check('workspace editable name does not fabricate mod identity', () => assert.equal(api.workspaceApiSubject({ name: 'Not an ID', nodes: [], links: [] }).modId, null));
check('workspace current head has explicit scope', () => assert.deepEqual(api.workspaceApiSubject(workspace, { modId: 'compiled_mod', head }), { modId: 'compiled_mod', sourceHash: head, sourceHashScope: 'workspace-head' }));
check('preview hash tracks preview instead of current head', () => {
  const result = contracts.projectApiEnvelope('/api/agent/workspace/merge', { dryRun: true, workspaceHash: head, previewWorkspace: { ...workspace, description: 'preview' } }, api.workspaceApiSubject(workspace, { head }));
  assert.notEqual(result.sourceHash, head);
  assert.equal(result.sourceHashScope, 'workspace-content-sha256-v1');
  assert.equal(result.currentSource.sourceHash, head);
  assert.notEqual(result.sourceHash, api.workspaceApiSubject(workspace).sourceHash);
});
check('collection preserves distinct items without fabricated top-level mod', () => {
  const result = contracts.projectApiEnvelope('/api/agent/workspaces', { workspaces: [
    { workspaceId: 'one', modId: 'first', sourceHash: head, sourceHashScope: 'workspace-head' },
    { workspaceId: 'two', modId: 'second', sourceHash: sha256, sourceHashScope: 'workspace-content-sha256-v1' },
  ] });
  assert.equal(result.environment.scope, 'workspace-collection');
  assert.equal(result.modId, null);
  assert.equal(result.workspaces[0].modId, 'first');
  assert.equal(result.workspaces[1].modId, 'second');
});
check('unknown collection row remains unresolved', () => assert.equal(contracts.projectApiEnvelope('/api/agent/workspace/parked', { parked: [{ workspaceId: 'unknown' }] }).parked[0].sourceHash, null));
for (const route of ['/api/agent/runtime-debugger', '/api/agent/debug-watcher/brief', '/api/agent/diagnostics', '/api/agent/readiness', '/api/agent/release/nexus/prepare', '/api/agent/package/release']) {
  check(`${route} exposes unresolved source honestly`, () => assert.equal(contracts.projectApiEnvelope(route, { ok: false }).sourceHashScope, 'unresolved'));
}
check('runtime source identity leaves game evidence untouched', () => {
  const result = contracts.projectApiEnvelope('/api/agent/runtime-debugger', { identity: { gameLoaded: false }, session: { id: 'old' } }, api.workspaceApiSubject(workspace, { head }));
  assert.equal(result.sourceHash, head);
  assert.deepEqual(result.identity, { gameLoaded: false });
  assert.deepEqual(result.session, { id: 'old' });
});
for (const route of ['/api/agent/runtime-control', '/api/agent/runtime-control/preview', '/api/agent/runtime-control/reload']) {
  check(`${route} preserves operational folder ID and scoped content identity`, () => {
    const result = contracts.projectApiEnvelope(route, { modId: 'copied_folder', workspaceHash: head, sessionId: 'current', gameVerified: false }, { modId: 'original_content', sourceHash: head, sourceHashScope: 'workspace-head' });
    assert.equal(result.modId, 'copied_folder'); assert.equal(result.modIdScope, 'artifact-folder');
    assert.equal(result.sourceIdentity.modId, 'original_content'); assert.equal(result.sourceHash, head);
    assert.equal(result.sessionId, 'current'); assert.equal(result.gameVerified, false);
  });
}
check('explicit subject cannot be overridden by unrelated payload evidence', () => {
  const result = contracts.projectApiEnvelope('/api/agent/diagnostics', { sourceHash: 'wrong', modId: 'wrong', evidence: { sourceHash: 'wrong', hashScope: 'wrong' } }, api.workspaceApiSubject(workspace, { head }));
  assert.equal(result.sourceHash, head); assert.equal(result.modId, 'c06_test'); assert.equal(result.sourceHashScope, 'workspace-head');
});
check('legacy release metadata never invents source from zip hash', () => assert.equal(api.releaseReportApiSubject({ modId: 'c06_test', sha256 }).sourceHash, null));
check('recorded release evidence is explicitly labelled', () => {
  const source = { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' };
  const result = api.releaseReportApiSubject({ modId: 'c06_test', validatedSource: source });
  assert.equal(result.sourceHash, sha256); assert.equal(result.sourceIdentityProvenance, 'recorded-release-report');
});
check('release folder selector may differ from recorded content ID', () => assert.equal(api.releaseReportApiSubject({ modId: 'original_folder', validatedSource: { modId: 'ws_123', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' } }).modId, 'ws_123'));
check('mismatched prepared and validated content ID is unresolved', () => assert.equal(api.releaseReportApiSubject({ modId: 'folder', validatedSource: { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' }, preparedSource: { modId: 'other', sourceHash: sha256, sourceHashScope: 'artifact-plan-sha256-v1' } }).sourceHash, null));
check('malformed prepared source evidence is unresolved', () => assert.equal(api.releaseReportApiSubject({ modId: 'folder', validatedSource: { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' }, preparedSource: [] }).sourceHash, null));
check('wrong prepared source scope is unresolved', () => assert.equal(api.releaseReportApiSubject({ modId: 'folder', validatedSource: { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' }, preparedSource: { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'workspace-head' } }).sourceHash, null));
check('exact prepared source scope preserves validated identity', () => assert.equal(api.releaseReportApiSubject({ modId: 'folder', validatedSource: { modId: 'c06_test', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' }, preparedSource: { modId: 'c06_test', sourceHash: 'd'.repeat(64), sourceHashScope: 'release-artifact-inputs-v1' } }).sourceHash, sha256));
check('release envelope preserves folder selector and distinguishes source ID', () => {
  const result = contracts.projectApiEnvelope('/api/agent/release/nexus/prepare', { modId: 'original_folder', sha256: 'd'.repeat(64) }, { modId: 'ws_123', sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' });
  assert.equal(result.modId, 'original_folder'); assert.equal(result.modIdScope, 'artifact-folder');
  assert.equal(result.sourceIdentity.modId, 'ws_123'); assert.equal(result.sourceHash, sha256);
  assert.notEqual(result.sourceHash, result.sha256);
});
check('release unknown source keeps selector without claiming current canvas hash', () => {
  const result = contracts.projectApiEnvelope('/api/agent/release/export/receipt', { modId: 'original_folder', sha256 });
  assert.equal(result.modId, 'original_folder'); assert.equal(result.sourceHash, null);
  assert.equal(result.sourceIdentity.modId, null); assert.equal(result.sourceIdentity.sourceHashScope, 'unresolved');
});
check('malformed recorded release evidence is unresolved', () => assert.equal(api.releaseReportApiSubject({ modId: 'c06_test', validatedSource: { modId: 'c06_test', sourceHash: head, sourceHashScope: 'project-validation-inputs-v1' } }).sourceHash, null));
for (const modId of ['c06\r\nInjected: yes', 'unicode_\u{1f600}', 'x'.repeat(257)]) {
  check(`unsafe recorded release header ID refused ${JSON.stringify(modId).slice(0, 50)}`, () => assert.equal(api.releaseReportApiSubject({ validatedSource: { modId, sourceHash: sha256, sourceHashScope: 'project-validation-inputs-v1' } }).sourceHash, null));
}
check('pasted log hashes supplied UTF-8 bytes in its own scope', () => {
  const subject = api.pastedLogApiSubject('trace \u00e9', 'c06_test');
  assert.equal(subject.sourceHash, createHash('sha256').update('trace \u00e9', 'utf8').digest('hex'));
  assert.equal(subject.sourceHashScope, 'pasted-log-utf8-sha256-v1');
  assert.equal(subject.sourceIdentityProvenance, 'caller-supplied-log');
});

const passed = checks.filter(check => check.pass).length;
console.log(JSON.stringify({ suite: 'c06b-api-contracts', passed, total: checks.length, allPassed: passed === checks.length, checks }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
