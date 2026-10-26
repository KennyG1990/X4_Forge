import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResourceCoordinator, canonicalSourceKey } from '../src/server/resourceCoordinator';
import { isApiObject, projectApiSubject, projectApiEnvelope, validateProjectApiBody } from '../src/server/projectApiContract';

const checks: string[] = [];
const check = (name: string, run: () => unknown) => { run(); checks.push(name); };
const objectEnvelope = (...args: Parameters<typeof projectApiEnvelope>) => {
  const result = projectApiEnvelope(...args);
  assert.ok(isApiObject(result));
  return result;
};
const project = { id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content' as const, content: '<content id="lab" version="100"/>' }] };
check('authoring response uses manifest identity, not project label', () => assert.equal(projectApiSubject({ ...project, id: 'different' }).modId, 'lab'));
check('source edits invalidate identity', () => assert.notEqual(projectApiSubject(project).sourceHash, projectApiSubject({ ...project, files: [{ ...project.files[0], content: '<content id="lab" version="101"/>' }] }).sourceHash));
check('unresolved subject is explicit', () => assert.equal(objectEnvelope('/api/agent/compile', { ok: false }).sourceHash, null));
check('known source survives failure', () => assert.equal(objectEnvelope('/api/agent/compile', { ok: false }, projectApiSubject(project)).modId, 'lab'));
check('authoring result derives actual project', () => assert.equal(objectEnvelope('/api/agent/project/create', { project }).sourceHash, projectApiSubject(project).sourceHash));
for (const [route, body] of [
  ['/project/create', { meta: { id: 123 } }], ['/project/create', { meta: { id: 'lab', unexpected: 1 } }],
  ['/project/generate', { spec: { id: 'lab', kind: 'unknown' } }], ['/project/package', { project, unknown: true }],
  ['/project/file/create', { project, file: { path: '../bad.lua' } }], ['/project/file/create', { project, file: { path: 'x.lua', content: 1 } }],
  ['/project/validate', { project, fromPath: 'other' }], ['/project/validate', { project, root: 'filesystem' }],
  ['/project/validate', { path: '' }], ['/project/validate', { path: 'lab', root: 1 }],
  ['/project/validate', { project, recordBaseline: 'true' }], ['/package', { workspace: {} }],
  ['/artifact/build', { workspace: [] }], ['/project/content-xml', { meta: { id: 'lab', deps: [false] } }],
] as const) check(`reject ${route} ${JSON.stringify(body).slice(0,70)}`, () => assert.throws(() => validateProjectApiBody('/api/agent' + route, body)));
check('valid authored metadata is accepted', () => validateProjectApiBody('/api/agent/project/create', { meta: { id: 'lab', deps: [{ id: 'dep', optional: true }] } }));
check('malformed writer content cannot coerce', () => assert.throws(() => validateProjectApiBody('/api/fs/write', { path: 'lab/x.lua', content: { text: 'wrong' } })));
check('writer precondition cannot coerce an array into a hash', () => assert.throws(() => validateProjectApiBody('/api/fs/write', { path: 'lab/x.lua', content: '', expectedSha256: ['a'.repeat(64)] })));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-c06-'));
try {
  const a = path.join(root, 'mod'); fs.mkdirSync(a);
  const alias = path.join(root, 'alias'); fs.symlinkSync(a, alias, process.platform === 'win32' ? 'junction' : 'dir');
  check('canonical aliases resolve identically', () => assert.equal(canonicalSourceKey(a), canonicalSourceKey(alias)));
  check('missing descendants resolve through real parent', () => assert.equal(canonicalSourceKey(path.join(a, 'new')), canonicalSourceKey(path.join(alias, 'new'))));
  const q = new ResourceCoordinator(5, 1500); const key = canonicalSourceKey(a);
  let release!: () => void; const hold = new Promise<void>(r => { release = r; });
  let started!: () => void; const ready = new Promise<void>(r => { started = r; });
  const events: string[] = [];
  const first = q.run([key], { actor: 'agent-A', operation: 'write', workspaceId: 'ws_A' }, async () => { events.push('a-start'); started(); await hold; events.push('a-end'); });
  await ready;
  const second = q.run([canonicalSourceKey(alias)], { actor: 'agent-B', operation: 'write', workspaceId: 'ws_B' }, () => { events.push('b'); });
  await q.run([canonicalSourceKey(path.join(root, 'other'))], { actor: 'agent-C', operation: 'write' }, () => { events.push('c'); });
  check('same source queues across workspaces while independent source proceeds', () => assert.deepEqual(events, ['a-start','c']));
  const status = q.status([key]);
  check('owner and timing observable', () => { assert.equal(status.active[0].owner.actor, 'agent-A'); assert.ok(status.active[0].startedAt); assert.equal(status.waiting[0].owner.workspaceId, 'ws_B'); });
  status.active[0].owner.actor = 'tamper';
  check('status cannot mutate authority', () => assert.equal(q.status([key]).active[0].owner.actor, 'agent-A'));
  release(); await Promise.all([first, second]);
  check('FIFO holds through completion', () => assert.deepEqual(events, ['a-start','c','a-end','b']));
  await assert.rejects(q.run([key], { actor: 'a', operation: 'failure' }, () => { throw new Error('injected'); }));
  await q.run([key], { actor: 'b', operation: 'recovery' }, () => checks.push('exception releases resource'));
  check('empty final queue', () => { assert.equal(q.status([key]).active.length, 0); assert.equal(q.status([key]).waiting.length, 0); });
  const bounded = new ResourceCoordinator(1, 100);
  let free!: () => void; const held = bounded.run([key], { actor: 'a', operation: 'bounded' }, () => new Promise<void>(r => { free = r; }));
  await new Promise(r => setTimeout(r, 0));
  await assert.rejects(bounded.run([key], { actor: 'b', operation: 'overflow' }, () => assert.fail('must not run')), { code: 'RESOURCE_QUEUE_FULL' });
  checks.push('bounded pending operations refuse before execution'); free(); await held;
  const timeout = new ResourceCoordinator(3, 15);
  const held2 = timeout.run([key], { actor: 'a', operation: 'wait' }, () => new Promise<void>(r => { free = r; }));
  await new Promise(r => setTimeout(r, 0));
  await assert.rejects(timeout.run([key], { actor: 'b', operation: 'expiry' }, () => assert.fail('must not run')), { code: 'RESOURCE_QUEUE_TIMEOUT' });
  checks.push('queue expiry never executes operation'); free(); await held2;
  await timeout.run([key], { actor: 'c', operation: 'recovery' }, () => checks.push('expiry recovery'));
  await assert.rejects(q.run([key], { actor: 'a', operation: 'retargeted' }, () => assert.fail('must not run'),
    () => [canonicalSourceKey(path.join(root, 'other'))]), { code: 'SOURCE_COORDINATION_CHANGED' });
  checks.push('retargeted source or configuration refuses before execution');
  await q.run([key], { actor: 'b', operation: 'recovered' }, () => checks.push('retarget refusal releases resource'));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ pass: true, count: checks.length, checks }, null, 2));
