import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildValidationEvidence, type EvidenceDiagnostic } from '../src/lib/validationEvidence';
import { deploymentImplementationHash } from '../src/server/deploymentTrust';
import { acceptanceBinding, evaluateFindingAcceptances, projectFindingReview, recordFindingAcceptances,
  verifyFindingAcceptanceReceipts, revokeWarningReview, type AcceptanceSubject } from '../src/server/findingAcceptance';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-C03-'));
const store = new ActionReceiptStore({ root });
const actor = { kind: 'agent' as const, id: 'key_original', label: 'Original reviewer', scope: 'deploy' as const, deployAuthorized: true };
const nextActor = { ...actor, id: 'key_next', label: 'Next deployer' };
const warning: EvidenceDiagnostic = { severity: 'warning', code: 'fixture.warning', filePath: 'md/test.xml', line: 2, message: 'Known warning' };
const make = (diagnostics: EvidenceDiagnostic[] = [warning], content = '<content id="lab" version="100"/>'): AcceptanceSubject => ({
  evidence: buildValidationEvidence({ id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content', content }] }, diagnostics),
  artifactHash: 'a'.repeat(64), validatorHash: 'b'.repeat(64), corpusHash: 'c'.repeat(64), targetHash: 'd'.repeat(64),
  warningReviews: { scopeHash: 'e'.repeat(64), history: store.listVerified(), invocationId: randomUUID() },
});
const approve = (s: AcceptanceSubject) => [{ findingId: s.evidence.findings[0].findingId, bindingHash: acceptanceBinding(s).hash, reason: 'Reviewed fixture against reference.' }];
let checks = 0;
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`PASS ${name}`); };

// Exercise the production entry layout, not an invented validatorHash. These tiny packages
// resolve like the external parsers but execute no package code or installation command.
function validatorFixture(source = false) {
  const directory = fs.mkdtempSync(path.join(root, 'validator-'));
  const entry = path.join(directory, source ? 'server.ts' : 'dist/server.cjs');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, '// unchanged validator entry\n');
  fs.mkdirSync(path.join(directory, 'src'));
  const names = ['@xmldom/xmldom', 'fast-xml-parser', 'luaparse', 'xpath', 'fixture-transitive'];
  const packages: Record<string, { version: string }> = {};
  for (const name of names) {
    const packageRoot = path.join(directory, 'node_modules', name);
    fs.mkdirSync(packageRoot, { recursive: true });
    const version = name === '@xmldom/xmldom' ? '0.9.10' : '1.0.0';
    fs.writeFileSync(path.join(packageRoot, 'index.cjs'), 'throw new Error("Fingerprinting must not execute packages");\n');
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs',
      // Deliberately do not export package.json, as real fast-xml-parser does not.
      exports: { '.': './index.cjs' }, ...(name === 'fast-xml-parser' ? { dependencies: { 'fixture-transitive': '^1.0.0' } } : {}) }));
    packages[`node_modules/${name}`] = { version };
  }
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'fixture-validator',
    dependencies: Object.fromEntries(names.slice(0, 4).map(name => [name, '*'])) }));
  const lockPath = path.join(directory, 'package-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 3, packages }));
  const update = (name: string, version: string, updateLock = true) => {
    const file = path.join(directory, 'node_modules', name, 'package.json');
    const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...metadata, version }));
    if (updateLock) { packages[`node_modules/${name}`].version = version; fs.writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 3, packages })); }
  };
  return { directory, entry, lockPath, update };
}
function withValidatorFixture(fn: (fixture: ReturnType<typeof validatorFixture>) => void, source = false) {
  const fixture = validatorFixture(source);
  try { fn(fixture); } finally {
    const relative = path.relative(root, fixture.directory);
    assert.ok(relative.startsWith('validator-') && !relative.includes(path.sep), 'Cleanup must stay in its own fixture');
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
}
const unavailable = { code: 'VALIDATOR_FINGERPRINT_UNAVAILABLE' };
check('packaged dependency hash is stable and does not execute package code', () => withValidatorFixture(f => {
  assert.equal(deploymentImplementationHash(f.entry), deploymentImplementationHash(f.entry));
}));
for (const source of [false, true]) check(`${source ? 'source' : 'packaged'} parser upgrade invalidates durable warning approval`, () => withValidatorFixture(f => {
  const receipts = new ActionReceiptStore({ root: path.join(f.directory, 'receipts') });
  const subject = (): AcceptanceSubject => ({ ...make(), validatorHash: deploymentImplementationHash(f.entry),
    warningReviews: { scopeHash: 'e'.repeat(64), history: receipts.listVerified(), invocationId: randomUUID() } });
  const before = subject();
  const originalApproval = recordFindingAcceptances(receipts, before, approve(before), actor).receipts[0];
  assert.equal(evaluateFindingAcceptances(subject(), [], nextActor).counts.acceptedWarnings, 1);
  const entryBytes = fs.readFileSync(f.entry);
  f.update('@xmldom/xmldom', '0.9.12');
  assert.deepEqual(fs.readFileSync(f.entry), entryBytes);
  const after = subject();
  assert.notEqual(after.validatorHash, before.validatorHash);
  const decision = evaluateFindingAcceptances(after, [], nextActor);
  assert.equal(decision.counts.acceptedWarnings, 0);
  assert.equal(decision.warningReviews?.rows[0].state, 'invalidated');
  f.update('@xmldom/xmldom', '0.9.10');
  const restored = subject();
  assert.equal(restored.validatorHash, before.validatorHash);
  const recovered = evaluateFindingAcceptances(restored, [], nextActor);
  assert.equal(recovered.counts.acceptedWarnings, 1);
  const projection = projectFindingReview(recovered, nextActor);
  assert.equal(projection.approvals[0].originalReceiptId, originalApproval.id);
  assert.equal(projection.approvals[0].originalActor?.id, actor.id);
  assert.equal(projection.approvals[0].reason, 'Reviewed fixture against reference.');
}, source));
check('packaged manifest and lock bytes independently invalidate identity', () => withValidatorFixture(f => {
  const before = deploymentImplementationHash(f.entry);
  fs.appendFileSync(f.lockPath, '\n');
  const afterLock = deploymentImplementationHash(f.entry);
  assert.notEqual(afterLock, before);
  fs.appendFileSync(path.join(f.directory, 'package.json'), '\n');
  assert.notEqual(deploymentImplementationHash(f.entry), afterLock);
}));
check('actual transitive parser upgrade invalidates identity', () => withValidatorFixture(f => {
  const before = deploymentImplementationHash(f.entry);
  f.update('fixture-transitive', '1.0.1');
  assert.notEqual(deploymentImplementationHash(f.entry), before);
}));
for (const name of ['@xmldom/xmldom', 'fixture-transitive']) check(`installed ${name} and lock divergence fails closed`, () => withValidatorFixture(f => {
  f.update(name, '2.0.0', false);
  assert.throws(() => deploymentImplementationHash(f.entry), unavailable);
}));
for (const input of ['package.json', 'package-lock.json', 'node_modules/@xmldom/xmldom/package.json']) {
  check(`missing ${input} refuses a fingerprint`, () => withValidatorFixture(f => {
    fs.unlinkSync(path.join(f.directory, input));
    assert.throws(() => deploymentImplementationHash(f.entry), unavailable);
  }));
  check(`malformed ${input} refuses a fingerprint`, () => withValidatorFixture(f => {
    fs.writeFileSync(path.join(f.directory, input), '{');
    assert.throws(() => deploymentImplementationHash(f.entry), unavailable);
  }));
}
check('unreadable required metadata cannot fall back to the previous hash', () => withValidatorFixture(f => {
  deploymentImplementationHash(f.entry);
  const readFile = fs.readFileSync;
  // Deterministic EACCES: chmod is not an unreadable-file oracle on Windows.
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    if (String(file) === f.lockPath) throw Object.assign(new Error('Fixture access denied'), { code: 'EACCES' });
    return Reflect.apply(readFile, fs, [file, ...args]);
  }) as typeof fs.readFileSync;
  try { assert.throws(() => deploymentImplementationHash(f.entry), unavailable); }
  finally { fs.readFileSync = readFile; }
}));
check('ancestor dependency fallback cannot certify the addressed package', () => withValidatorFixture(f => {
  const child = path.join(f.directory, 'child');
  fs.mkdirSync(path.join(child, 'dist'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(f.directory, file), path.join(child, file));
  const entry = path.join(child, 'dist/server.cjs');
  fs.writeFileSync(entry, '// fixture\n');
  assert.throws(() => deploymentImplementationHash(entry), unavailable);
}));
check('validator dependency traversal has a bounded package count', () => withValidatorFixture(f => {
  const lock = JSON.parse(fs.readFileSync(f.lockPath, 'utf8'));
  for (let index = 0; index < 65; index++) {
    const name = index === 0 ? 'fixture-transitive' : `fixture-chain-${index}`;
    const directory = path.join(f.directory, 'node_modules', name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.cjs'), '// fixture\n');
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.cjs',
      dependencies: index < 64 ? { [`fixture-chain-${index + 1}`]: '*' } : {} }));
    lock.packages[`node_modules/${name}`] = { version: '1.0.0' };
  }
  fs.writeFileSync(f.lockPath, JSON.stringify(lock));
  assert.throws(() => deploymentImplementationHash(f.entry), unavailable);
}));
function nestedMetadata(f: ReturnType<typeof validatorFixture>, name = 'fixture-transitive') {
  const directory = path.join(f.directory, 'node_modules/fast-xml-parser/node_modules', name);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'package.json');
  fs.writeFileSync(file, JSON.stringify({ name, version: '2.0.0', type: 'module',
    exports: { '.': { import: './index.mjs' } } }));
  fs.writeFileSync(path.join(directory, 'index.mjs'), 'throw new Error("Metadata lookup must not execute an import");\n');
  const lock = JSON.parse(fs.readFileSync(f.lockPath, 'utf8'));
  lock.packages[`node_modules/fast-xml-parser/node_modules/${name}`] = { version: '2.0.0' };
  fs.writeFileSync(f.lockPath, JSON.stringify(lock));
  return { directory, file };
}
check('import-only dependency metadata is accepted without executing its entry', () => withValidatorFixture(f => {
  nestedMetadata(f);
  assert.match(deploymentImplementationHash(f.entry), /^[a-f0-9]{64}$/);
}));
check('nearest nested metadata wins over an inconsistent hoisted copy', () => withValidatorFixture(f => {
  nestedMetadata(f);
  f.update('fixture-transitive', '9.0.0', false);
  assert.match(deploymentImplementationHash(f.entry), /^[a-f0-9]{64}$/);
}));
for (const condition of ['missing', 'malformed', 'unreadable'] as const) {
  check(`${condition} nested metadata cannot fall back to a valid hoisted package`, () => withValidatorFixture(f => {
    const nested = nestedMetadata(f);
    const readFile = fs.readFileSync;
    if (condition === 'missing') fs.unlinkSync(nested.file);
    if (condition === 'malformed') fs.writeFileSync(nested.file, '{');
    if (condition === 'unreadable') fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(file) === nested.file) throw Object.assign(new Error('Fixture access denied'), { code: 'EACCES' });
      return Reflect.apply(readFile, fs, [file, ...args]);
    }) as typeof fs.readFileSync;
    try { assert.throws(() => deploymentImplementationHash(f.entry), unavailable); }
    finally { fs.readFileSync = readFile; }
  }));
}
check('scoped nested packages and cyclic metadata remain bounded', () => withValidatorFixture(f => {
  const nested = nestedMetadata(f, '@fixture/scoped');
  const parentFile = path.join(f.directory, 'node_modules/fast-xml-parser/package.json');
  const parent = JSON.parse(fs.readFileSync(parentFile, 'utf8'));
  fs.writeFileSync(parentFile, JSON.stringify({ ...parent, dependencies: { '@fixture/scoped': '*' } }));
  const metadata = JSON.parse(fs.readFileSync(nested.file, 'utf8'));
  fs.writeFileSync(nested.file, JSON.stringify({ ...metadata, dependencies: { 'fast-xml-parser': '*' } }));
  assert.match(deploymentImplementationHash(f.entry), /^[a-f0-9]{64}$/);
}));
for (const target of ['package', 'metadata', 'broken-package'] as const) {
  check(`${target} junction outside the owner refuses a fingerprint`, () => withValidatorFixture(f => {
    const nested = nestedMetadata(f);
    const external = path.join(root, `outside-${randomUUID()}`);
    fs.mkdirSync(external);
    try {
      // Directory junctions exercise canonical escape on Windows without requiring
      // privileged file symlinks. The metadata junction is rejected before any JSON read.
      const link = target === 'metadata' ? nested.file : nested.directory;
      if (target === 'metadata') fs.unlinkSync(link);
      else {
        assert.ok(path.relative(f.directory, link).startsWith(`node_modules${path.sep}`));
        fs.rmSync(link, { recursive: true });
      }
      fs.symlinkSync(target === 'broken-package' ? path.join(external, 'missing') : external, link, 'junction');
      assert.throws(() => deploymentImplementationHash(f.entry), unavailable);
    } finally {
      assert.equal(path.dirname(external), root);
      fs.rmSync(external, { recursive: true });
    }
  }));
}
check('real installed parser closure fingerprints in source and compiled CommonJS', () => {
  const repository = process.cwd();
  const sourceEntry = path.join(repository, 'server.ts');
  const compiledEntry = path.join(repository, 'dist/server.cjs');
  assert.ok(fs.existsSync(sourceEntry) && fs.existsSync(compiledEntry), 'Real source and built entry are required smoke inputs');
  const expectedSource = deploymentImplementationHash(sourceEntry);
  const expectedCompiled = deploymentImplementationHash(compiledEntry);
  assert.match(expectedSource, /^[a-f0-9]{64}$/);
  assert.match(expectedCompiled, /^[a-f0-9]{64}$/);
  const smoke = path.join(root, 'compiled-metadata-smoke.cjs');
  // Compile the current implementation, then exercise actual repo lock/node_modules
  // through both entry layouts. This is metadata proof, not a server startup claim.
  const implementation = fs.readFileSync(path.join(repository, 'src/server/deploymentTrust.ts'), 'utf8');
  fs.writeFileSync(smoke, transformSync(implementation, { loader: 'ts', format: 'cjs', platform: 'node' }).code
    + '\nprocess.stdout.write(deploymentImplementationHash(process.argv[2]));\n');
  for (const [entry, expected] of [[sourceEntry, expectedSource], [compiledEntry, expectedCompiled]]) {
    const actual = execFileSync(process.execPath, [smoke, entry], { encoding: 'utf8', windowsHide: true, timeout: 30_000,
      env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } });
    assert.equal(actual, expected);
  }
});
let original = '';
check('new warning needs review', () => { const d = evaluateFindingAcceptances(make(), [], actor); assert.equal(d.counts.acceptedWarnings, 0); assert.equal(d.warningReviews?.newFindingIds.length, 1); });
check('explicit warning stores scoped provenance', () => { const s = make(); const r = recordFindingAcceptances(store, s, approve(s), actor); original = r.receipts[0].id; assert.equal(r.receipts[0].metadata?.reviewScopeHash, s.warningReviews!.scopeHash); });
check('unchanged warning reused with original actor and reason', () => { const d = evaluateFindingAcceptances(make(), [], nextActor); assert.equal(d.counts.acceptedWarnings, 1); assert.equal(d.validationClean, false); const p = projectFindingReview(d, nextActor); assert.equal(p.approvals[0].originalActor?.id, actor.id); assert.equal(p.approvals[0].originalReceiptId, original); });
check('each deployment reuse gets its own durable receipt', () => { const s = make(); const a = recordFindingAcceptances(store, s, [], nextActor); const b = recordFindingAcceptances(store, make(), [], nextActor); assert.notEqual(a.receipts[0].id, b.receipts[0].id); assert.equal(a.receipts[0].metadata?.originalReceiptId, original); verifyFindingAcceptanceReceipts(store, a.receipts.map(r => r.id), s, [], nextActor); });
for (const field of ['validatorHash', 'corpusHash', 'targetHash'] as const) check(`changed ${field} invalidates`, () => { const s = make(); s[field] = 'f'.repeat(64); assert.equal(evaluateFindingAcceptances(s, [], actor).counts.acceptedWarnings, 0); });
check('changed source invalidates matching diagnostic', () => { const d = evaluateFindingAcceptances(make([warning], '<content id="lab" version="101"/>'), [], actor); assert.equal(d.counts.acceptedWarnings, 0); assert.equal(d.warningReviews?.rows[0].state, 'invalidated'); });
check('changed rules bytes invalidate even identical warning', () => { const s = make(); s.evidence.sourceHash = 'f'.repeat(64); assert.equal(evaluateFindingAcceptances(s, [], actor).counts.acceptedWarnings, 0); });
check('changed coverage invalidates', () => { const s = make(); s.evidence.coverage.gaps.push({ check: 'fixture', reason: 'Unavailable' }); assert.equal(evaluateFindingAcceptances(s, [], actor).counts.acceptedWarnings, 0); });
check('wrong source scope never reuses', () => { const s = make(); s.warningReviews!.scopeHash = 'f'.repeat(64); assert.equal(evaluateFindingAcceptances(s, [], actor).counts.acceptedWarnings, 0); });
check('new warning stays new beside known warning', () => { const d = evaluateFindingAcceptances(make([warning, { ...warning, message: 'New warning' }]), [], actor); assert.equal(d.counts.acceptedWarnings, 1); assert.equal(d.counts.unacceptedWarnings, 1); });
check('disappeared warning is resolved, not accepted', () => { const d = evaluateFindingAcceptances(make([]), [], actor); assert.equal(d.warningReviews?.rows[0].state, 'resolved'); assert.equal(d.approvals.length, 0); });
check('errors never inherit warning reviews', () => { const d = evaluateFindingAcceptances(make([{ ...warning, severity: 'error' }]), [], actor); assert.equal(d.validationAllowsDeploy, false); });
check('explicit errors do not become reusable', () => { const s = make([{ ...warning, severity: 'error' }]); recordFindingAcceptances(store, s, approve(s), actor); assert.equal(evaluateFindingAcceptances(make([{ ...warning, severity: 'error' }]), [], actor).validationAllowsDeploy, false); });
check('unavailable checks do not inherit', () => { const s = make([{ ...warning, code: 'validation.lua_ast_unavailable' }]); recordFindingAcceptances(store, s, approve(s), actor); assert.equal(evaluateFindingAcceptances(make([{ ...warning, code: 'validation.lua_ast_unavailable' }]), [], actor).approvals.length, 0); });
check('read/write identities cannot approve or revoke', () => { assert.throws(() => evaluateFindingAcceptances(make(), [], { ...actor, scope: 'write' }), /FORBIDDEN/); assert.throws(() => revokeWarningReview(store, 'e'.repeat(64), original, 'Reason', { ...actor, deployAuthorized: false }), /FORBIDDEN/); });
check('safety failures remain non-overridable', () => { assert.throws(() => evaluateFindingAcceptances(make(), [], actor, ['source-changed']), /NON_OVERRIDABLE/); });
check('wrong scope revocation refused', () => assert.throws(() => revokeWarningReview(store, 'f'.repeat(64), original, 'Reason', actor), /SCOPE_MISMATCH/));
check('invalid revocation reasons write no receipts', () => {
  const count = store.listVerified().length;
  for (const reason of ['', 'two\nlines', 'Bearer abcdefghijklm']) assert.throws(() => revokeWarningReview(store, 'e'.repeat(64), original, reason, actor), /INPUT_INVALID/);
  assert.equal(store.listVerified().length, count);
});
check('revocation invalidates preview and write-boundary authority', () => { const s = make(); const r = recordFindingAcceptances(store, s, [], nextActor); const before = acceptanceBinding(s).hash; revokeWarningReview(store, 'e'.repeat(64), original, 'Withdraw fixture review', actor); const fresh = make(); assert.notEqual(acceptanceBinding(fresh).hash, before); assert.equal(evaluateFindingAcceptances(fresh, [], nextActor).counts.acceptedWarnings, 0); s.warningReviews!.history = store.listVerified(); assert.throws(() => verifyFindingAcceptanceReceipts(store, r.receipts.map(x => x.id), s, [], nextActor), /RECEIPT_MISMATCH/); });
check('explicit reapproval recovers without resurrecting revoked receipt', () => { const s = make(); const r = recordFindingAcceptances(store, s, approve(s), actor); assert.notEqual(r.receipts[0].id, original); assert.equal(evaluateFindingAcceptances(make(), [], nextActor).counts.acceptedWarnings, 1); });
check('tampered history fails closed and restores', () => { const file = store.pathFor(original), bytes = fs.readFileSync(file); fs.appendFileSync(file, ' '); assert.throws(() => store.listVerified(), { code: 'RECEIPT_CORRUPT' }); fs.writeFileSync(file, bytes); assert.ok(store.listVerified().length); });
check('restart reads durable history', () => { const reopened = new ActionReceiptStore({ root }); const s = make(); s.warningReviews!.history = reopened.listVerified(); assert.equal(evaluateFindingAcceptances(s, [], nextActor).counts.acceptedWarnings, 1); });
check('missing warning with incomplete checks is not resolved', () => { const s = make([]); s.evidence.coverage.complete = false; assert.ok(evaluateFindingAcceptances(s, [], actor).warningReviews?.rows.some(r => r.state === 'unverified')); });
check('changed mod identity does not inherit', () => { const s = make([warning], '<content id="other" version="100"/>'); assert.equal(evaluateFindingAcceptances(s, [], actor).counts.acceptedWarnings, 0); });
check('legacy receipts without scope never become reusable', () => { const legacyStore = new ActionReceiptStore({ root: path.join(root, 'legacy') }); const s = make(); delete s.warningReviews; recordFindingAcceptances(legacyStore, s, approve(s), actor); const fresh = make(); fresh.warningReviews!.history = legacyStore.listVerified(); assert.equal(evaluateFindingAcceptances(fresh, [], actor).counts.acceptedWarnings, 0); });
check('receipt scan byte cap fails before reading oversized history', () => {
  const capped = new ActionReceiptStore({ root: path.join(root, 'cap') }); fs.mkdirSync(capped.root);
  const file = capped.pathFor(`ar_${'0'.repeat(64)}`); fs.writeFileSync(file, ''); fs.truncateSync(file, 65 * 1024 * 1024);
  try { assert.throws(() => capped.listVerified(), { code: 'RECEIPT_SCAN_LIMIT' }); } finally { fs.unlinkSync(file); }
});
check('incomplete revocation blocks reuse and cannot silently resume', () => {
  class InterruptedStore extends ActionReceiptStore { override commit(): never { throw new Error('Interrupted'); } }
  const s = make(); const latest = evaluateFindingAcceptances(s, [], actor).approvals[0].original!;
  assert.throws(() => revokeWarningReview(new InterruptedStore({ root }), 'e'.repeat(64), latest.id, 'Interrupted revoke', actor), /Interrupted/);
  assert.throws(() => evaluateFindingAcceptances(make(), [], actor), /RECEIPT_INCOMPLETE/);
  assert.throws(() => revokeWarningReview(store, 'e'.repeat(64), latest.id, 'Interrupted revoke', actor), /RECEIPT_INCOMPLETE/);
});
console.log(JSON.stringify({ pass: true, checks, root }));
