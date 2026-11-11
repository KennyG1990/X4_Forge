import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureProjectCheckSetup } from '../src/server/projectCheckSetup';
import { ProjectCheckApprovalLedger, type OwnerDecision } from '../src/server/projectCheckApproval';
import { ProjectCheckOwnerProof } from '../src/server/projectCheckOwnerProof';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { canonicalJson } from '../src/lib/actionReceipt';
import { inspectProjectCheckProposal } from '../src/server/projectCheckProposal';

const parent = fs.realpathSync.native(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(parent, 'x4-check-setup-'));
const sourceRoot = path.join(fixture, 'mod');
const runtime = path.join(fixture, 'runtime');
const interpreterPath = path.join(runtime, 'python.exe');
const runtimeDependency = path.join(runtime, 'python.dll');
const manifest = path.join(sourceRoot, 'forge.checks.json');
const script = path.join(sourceRoot, 'checks', 'smoke.py');
const dependency = path.join(sourceRoot, 'checks', 'helper.py');
const input = { modId: 'fixture', sourceRoot, interpreterPath, interpreterDependencies: ['python.dll'] };
const check = { id: 'smoke', script: 'checks/smoke.py', dependencies: ['checks/helper.py'], covers: ['md/smoke.xml'] };
const configure = (checks: unknown[], maxParallelChecks?: unknown) => fs.writeFileSync(manifest,
  JSON.stringify({ version: 1, checks, ...(maxParallelChecks === undefined ? {} : { maxParallelChecks }) }));
const originalBytes = new Map([
  [interpreterPath, 'interpreter binary fixture'],
  [runtimeDependency, 'runtime dependency fixture'],
  [script, 'raise RuntimeError("must not be executed")'],
  [dependency, 'imported helper fixture'],
]);
type TestDecisionProof = (decision: Readonly<OwnerDecision>) => boolean;

try {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(runtime);
  for (const [file, value] of originalBytes) fs.writeFileSync(file, value);
  configure([check]);
  const original = captureProjectCheckSetup(input);
  assert.deepEqual(captureProjectCheckSetup(input), original);
  assert.equal(original.checks[0].timeoutSeconds, 60);
  assert.equal(original.manifest.sha256, createHash('sha256').update(fs.readFileSync(manifest)).digest('hex'));
  assert.deepEqual(original.checks[0].covers, ['md/smoke.xml']);
  assert(!original.harness.some(entry => entry.path === 'md/smoke.xml'));
  const { setupHash: legacyHash, ...legacySetup } = original;
  assert(!Object.hasOwn(legacySetup, 'maxParallelChecks'));
  // Spell out the pre-budget serialization rather than comparing two new captures.
  const oldShape = { version: legacySetup.version, modId: legacySetup.modId, sourceRoot: legacySetup.sourceRoot,
    manifest: legacySetup.manifest, interpreter: legacySetup.interpreter, harness: legacySetup.harness, checks: legacySetup.checks };
  assert.equal(legacyHash, createHash('sha256').update(canonicalJson(oldShape)).digest('hex'));
  for (const budget of [1, 2, 4]) {
    configure([check], budget);
    const bounded = captureProjectCheckSetup(input);
    assert.equal((bounded as typeof bounded & { maxParallelChecks?: number }).maxParallelChecks, budget);
    assert.notEqual(bounded.setupHash, legacyHash);
  }
  for (const budget of [0, -1, 5, 1.5, '2', null, true, {}, []]) {
    configure([check], budget);
    const proposed = inspectProjectCheckProposal([{ path: 'forge.checks.json', kind: 'other', content: fs.readFileSync(manifest, 'utf8') }]);
    assert.equal(proposed?.status, 'invalid', `Invalid budget ${JSON.stringify(budget)}`);
  }
  configure([check]);
  assert.equal(captureProjectCheckSetup(input).setupHash, legacyHash);
  assert.notEqual(captureProjectCheckSetup({ ...input, modId: 'other' }).setupHash, original.setupHash);

  for (const [file, value] of originalBytes) {
    fs.appendFileSync(file, ' changed');
    assert.notEqual(captureProjectCheckSetup(input).setupHash, original.setupHash, file);
    fs.writeFileSync(file, value);
  }
  fs.appendFileSync(manifest, '\n');
  assert.notEqual(captureProjectCheckSetup(input).setupHash, original.setupHash);
  configure([check]);
  assert.equal(captureProjectCheckSetup(input).setupHash, original.setupHash);

  assert.throws(() => captureProjectCheckSetup({ ...input, interpreterPath: 'python.exe' }), /local absolute/);
  assert.throws(() => captureProjectCheckSetup({ ...input, interpreterDependencies: ['../escape'] }), /Unsafe relative/);
  configure([{ ...check, dependencies: ['checks/absent.py'] }]);
  assert.throws(() => captureProjectCheckSetup(input), /ENOENT/);
  configure([check, { id: 'second', script: 'checks/SMOKE.py' }]);
  assert.throws(() => captureProjectCheckSetup(input), /Case-colliding/);

  const link = path.join(sourceRoot, 'external');
  fs.symlinkSync(runtime, link, process.platform === 'win32' ? 'junction' : 'dir');
  configure([{ ...check, dependencies: ['external/python.dll'] }]);
  assert.throws(() => captureProjectCheckSetup(input), /alias or symbolic link/);
  const hardlink = path.join(sourceRoot, 'alias.py');
  fs.linkSync(script, hardlink);
  configure([{ ...check, script: 'alias.py' }]);
  assert.throws(() => captureProjectCheckSetup(input), /single-link/);
  fs.unlinkSync(hardlink);
  configure([check]);
  fs.truncateSync(dependency, 64 * 1024 * 1024 + 1);
  assert.throws(() => captureProjectCheckSetup(input), /byte limit/);
  fs.writeFileSync(dependency, originalBytes.get(dependency)!);
  fs.writeFileSync(manifest, Buffer.from([0xff, 0xfe]));
  assert.throws(() => captureProjectCheckSetup(input), { code: 'ERR_ENCODING_INVALID_ENCODED_DATA' });

  configure([check]);
  const scriptIdentity = fs.statSync(script, { bigint: true });
  const readSync = fs.readSync;
  let changed = false;
  fs.readSync = ((fd: number, ...args: unknown[]) => {
    const count = Reflect.apply(readSync, fs, [fd, ...args]);
    const file = fs.fstatSync(fd, { bigint: true });
    if (!changed && file.dev === scriptIdentity.dev && file.ino === scriptIdentity.ino) {
      changed = true;
      fs.appendFileSync(script, ' modified during read');
    }
    return count;
  }) as typeof fs.readSync;
  try {
    assert.throws(() => captureProjectCheckSetup(input), /changed while reading/);
    assert(changed);
  } finally {
    fs.readSync = readSync;
  }
  console.log('Project check setup selftest passed, including identity drift and unsafe inputs.');

  fs.writeFileSync(script, originalBytes.get(script)!);
  class InterruptedStore extends ActionReceiptStore {
    interrupt = false;
    override commit(...args: Parameters<ActionReceiptStore['commit']>) {
      if (this.interrupt) throw new Error('Simulated stop before commit.');
      return super.commit(...args);
    }
  }
  const store = new InterruptedStore({ root: path.join(fixture, 'receipts') });
  const verify: ConstructorParameters<typeof ProjectCheckApprovalLedger>[2] = (_ownerId, decision, proof) =>
    typeof proof === 'function' && proof(decision) === true;
  const ledger = new ProjectCheckApprovalLedger(store, 'fixture-owner', verify);
  const firstReview = 'fixture-review-001';
  const approveProof = (reviewId: string): TestDecisionProof => (decision) =>
    decision.action === 'approve' && decision.reviewId === reviewId && decision.setupHash === original.setupHash;
  assert.throws(() => ledger.approve(input, original.setupHash, firstReview, { actor: 'studio' }), /owner confirmation/);
  assert.throws(() => ledger.approve(input, original.setupHash, 'fixture-review-002', approveProof(firstReview)), /owner confirmation/);
  assert.throws(() => ledger.approve({ ...input, modId: 'wrong' }, original.setupHash, firstReview, approveProof(firstReview)), /changed since review/);
  assert.deepEqual(store.listVerified(), []);

  store.interrupt = true;
  const failedReview = 'fixture-review-000';
  assert.throws(() => ledger.approve(input, original.setupHash, failedReview, approveProof(failedReview)), /Simulated stop/);
  const [interruptedApproval] = store.listVerified();
  assert.throws(() => ledger.requireUsable(interruptedApproval.id, original), /committed owner setup approval/);
  store.interrupt = false;
  assert.throws(() => ledger.approve(input, original.setupHash, failedReview, approveProof(failedReview)), /unresolved receipt/);
  const approval = ledger.approve(input, original.setupHash, firstReview, approveProof(firstReview));
  assert.deepEqual(ledger.approve(input, original.setupHash, firstReview, approveProof(firstReview)), approval);
  const reopened = new ProjectCheckApprovalLedger(new ActionReceiptStore({ root: store.root }), 'fixture-owner', verify);
  assert.deepEqual(reopened.requireUsable(approval.id, captureProjectCheckSetup(input)), approval);
  configure([check], 2);
  assert.throws(() => reopened.requireUsable(approval.id, captureProjectCheckSetup(input)), /does not match/);
  configure([check]);
  const otherOwner = new ProjectCheckApprovalLedger(store, 'other-owner', verify);
  assert.throws(() => otherOwner.requireUsable(approval.id, original), /committed owner setup approval/);
  assert.throws(() => reopened.requireUsable(approval.id, captureProjectCheckSetup({ ...input, modId: 'wrong' })), /does not match/);
  fs.appendFileSync(dependency, ' drift');
  assert.throws(() => reopened.requireUsable(approval.id, captureProjectCheckSetup(input)), /does not match/);
  fs.writeFileSync(dependency, originalBytes.get(dependency)!);

  const revokeProof = (target: typeof approval): TestDecisionProof => (decision) =>
    decision.action === 'revoke' && decision.approvalId === target.id && decision.approvalHash === target.hash;
  assert.throws(() => ledger.revoke(approval.id, approveProof(firstReview)), /owner confirmation/);
  assert.deepEqual(reopened.requireUsable(approval.id, original), approval);
  const revocation = ledger.revoke(approval.id, revokeProof(approval));
  assert.deepEqual(ledger.revoke(approval.id, revokeProof(approval)), revocation);
  assert.throws(() => reopened.requireUsable(approval.id, original), /revoked/);
  assert.throws(() => ledger.approve(input, original.setupHash, firstReview, approveProof(firstReview)), /revoked/);
  assert.throws(() => ledger.requireUsable(revocation.id, original), /committed owner setup approval/);

  const newReview = 'fixture-review-002';
  const replacement = ledger.approve(input, original.setupHash, newReview, approveProof(newReview));
  assert.notEqual(replacement.id, approval.id);
  assert.deepEqual(reopened.requireUsable(replacement.id, original), replacement);
  assert.throws(() => ledger.revoke(replacement.id, revokeProof(approval)), /owner confirmation/);
  store.interrupt = true;
  assert.throws(() => ledger.revoke(replacement.id, revokeProof(replacement)), /Simulated stop/);
  assert.throws(() => reopened.requireUsable(replacement.id, original), /revocation is unresolved/);
  const tombstone = store.listVerified().find(receipt => receipt.input.beforeHash === replacement.hash);
  assert(tombstone);
  fs.appendFileSync(store.pathFor(tombstone.id), '\n');
  assert.throws(() => reopened.requireUsable(replacement.id, original), { code: 'RECEIPT_CORRUPT' });
  fs.unlinkSync(store.pathFor(tombstone.id));
  const junctionTarget = path.join(fixture, 'junction-target');
  fs.mkdirSync(junctionTarget);
  fs.symlinkSync(junctionTarget, store.pathFor(tombstone.id), process.platform === 'win32' ? 'junction' : 'dir');
  fs.rmdirSync(junctionTarget);
  assert.throws(() => reopened.requireUsable(replacement.id, original), /revocation path is unresolved/);
  console.log('Project check approval selftest passed, including owner proof, replay, drift, revocation and receipt faults.');

  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const unrelated = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pinned = {
    ownerId: 'fixture-owner', origin: 'http://localhost:45678', publicKey: keys.publicKey,
    credentialId: Buffer.alloc(32, 1).toString('base64url'), userHandle: Buffer.alloc(32, 2).toString('base64url'),
  };
  let now = 10;
  const ownerProof = new ProjectCheckOwnerProof(pinned, () => now);
  const signedStore = new ActionReceiptStore({ root: path.join(fixture, 'signed-receipts') });
  const signedLedger = new ProjectCheckApprovalLedger(signedStore, pinned.ownerId, ownerProof.verify);
  const reviewed = { action: 'approve', reviewId: 'signed-fixture-review-01', setupHash: original.setupHash } as const;
  const options = ownerProof.issue(reviewed);
  assert.deepEqual(options.allowCredentials, [{ type: 'public-key', id: pinned.credentialId }]);
  assert.equal(options.userVerification, 'required');
  assert.equal(options.rpId, 'localhost');

  function fixtureAssertion(challenge: string, overrides: {
    client?: Record<string, unknown>; rpId?: string; flags?: number; count?: number; key?: KeyObject;
  } = {}) {
    const clientData = Buffer.from(JSON.stringify({
      type: 'webauthn.get', challenge, origin: pinned.origin, crossOrigin: false, ...overrides.client,
    }));
    const authData = Buffer.alloc(37);
    createHash('sha256').update(overrides.rpId ?? 'localhost').digest().copy(authData);
    authData[32] = overrides.flags ?? 5;
    authData.writeUInt32BE(overrides.count ?? 4, 33);
    const clientHash = createHash('sha256').update(clientData).digest();
    return {
      type: 'public-key', id: pinned.credentialId, userHandle: pinned.userHandle,
      clientDataJSON: clientData.toString('base64url'), authenticatorData: authData.toString('base64url'),
      signature: sign('sha256', Buffer.concat([authData, clientHash]), overrides.key ?? keys.privateKey).toString('base64url'),
    };
  }

  const validProof = fixtureAssertion(options.challenge);
  const rejectionProofs = {
    studio: { actor: 'studio' },
    credential: { ...validProof, id: pinned.userHandle },
    userHandle: { ...validProof, userHandle: pinned.credentialId },
    signature: fixtureAssertion(options.challenge, { key: unrelated.privateKey }),
    origin: fixtureAssertion(options.challenge, { client: { origin: 'http://localhost:45679' } }),
    type: fixtureAssertion(options.challenge, { client: { type: 'webauthn.create' } }),
    crossOrigin: fixtureAssertion(options.challenge, { client: { crossOrigin: true } }),
    topOrigin: fixtureAssertion(options.challenge, { client: { topOrigin: pinned.origin } }),
    rp: fixtureAssertion(options.challenge, { rpId: 'wrong.local' }),
    presence: fixtureAssertion(options.challenge, { flags: 4 }),
    verification: fixtureAssertion(options.challenge, { flags: 1 }),
    backup: fixtureAssertion(options.challenge, { flags: 0x0d }),
    extension: fixtureAssertion(options.challenge, { flags: 0x85 }),
    encoding: { ...validProof, signature: validProof.signature + '=' },
    invalidUtf8: { ...validProof, clientDataJSON: Buffer.from([255]).toString('base64url') },
    oversized: { ...validProof, clientDataJSON: Buffer.alloc(4097).toString('base64url') },
    unknownChallenge: fixtureAssertion('unknown-challenge'),
  };
  for (const [name, proof] of Object.entries(rejectionProofs)) {
    assert.throws(() => signedLedger.approve(input, reviewed.setupHash, reviewed.reviewId, proof), /owner confirmation/, name);
  }
  assert.equal(ownerProof.verify('different-owner', reviewed, validProof), false);
  const wrongOwnerLedger = new ProjectCheckApprovalLedger(signedStore, 'different-owner', ownerProof.verify);
  assert.throws(() => wrongOwnerLedger.approve(input, reviewed.setupHash, reviewed.reviewId, validProof), /owner confirmation/);
  assert.throws(() => signedLedger.approve(input, reviewed.setupHash, 'signed-fixture-review-02', validProof), /owner confirmation/);
  assert.throws(() => signedLedger.approve(input, '1'.repeat(64), reviewed.reviewId, validProof), /owner confirmation/);
  assert.equal(new ProjectCheckOwnerProof(pinned).verify(pinned.ownerId, reviewed, validProof), false);
  assert.deepEqual(signedStore.listVerified(), []);

  const signed = signedLedger.approve(input, reviewed.setupHash, reviewed.reviewId, validProof);
  assert.equal(signed.status, 'committed');
  assert.equal(signed.actor.id, pinned.ownerId);
  assert.throws(() => signedLedger.approve(input, reviewed.setupHash, reviewed.reviewId, validProof), /owner confirmation/);
  assert.deepEqual(signedLedger.requireUsable(signed.id, captureProjectCheckSetup(input)), signed);
  const reopenedSigned = new ProjectCheckApprovalLedger(new ActionReceiptStore({ root: signedStore.root }),
    pinned.ownerId, new ProjectCheckOwnerProof(pinned).verify);
  assert.deepEqual(reopenedSigned.requireUsable(signed.id, original), signed);
  const changedReview = { ...reviewed, reviewId: 'signed-fixture-review-03' };
  const staleSetupProof = fixtureAssertion(ownerProof.issue(changedReview).challenge, { count: 6 });
  fs.appendFileSync(script, ' changed');
  assert.throws(() => signedLedger.approve(input, reviewed.setupHash, changedReview.reviewId, staleSetupProof), /changed since review/);
  fs.writeFileSync(script, originalBytes.get(script)!);
  assert.throws(() => signedLedger.approve(input, reviewed.setupHash, changedReview.reviewId, staleSetupProof), /owner confirmation/);
  const regressed = fixtureAssertion(ownerProof.issue(changedReview).challenge, { count: 5 });
  assert.throws(() => signedLedger.approve(input, reviewed.setupHash, changedReview.reviewId, regressed), /owner confirmation/);
  assert.deepEqual(signedStore.listVerified(), [signed]);

  const revoke = { action: 'revoke', approvalId: signed.id, approvalHash: signed.hash } as const;
  const wrongRevoke = fixtureAssertion(ownerProof.issue({ ...revoke, approvalHash: '2'.repeat(64) }).challenge, { count: 7 });
  assert.throws(() => signedLedger.revoke(signed.id, wrongRevoke), /owner confirmation/);
  const exactRevoke = fixtureAssertion(ownerProof.issue(revoke).challenge, { count: 7 });
  assert.equal(signedLedger.revoke(signed.id, exactRevoke).status, 'committed');
  assert.throws(() => signedLedger.revoke(signed.id, exactRevoke), /owner confirmation/);
  assert.throws(() => reopenedSigned.requireUsable(signed.id, original), /revoked/);

  const expiring = new ProjectCheckOwnerProof(pinned, () => now);
  const expired = expiring.issue(reviewed);
  for (let count = 1; count < 16; count++) expiring.issue(reviewed);
  assert.throws(() => expiring.issue(reviewed), /Too many pending/);
  now += expired.timeout;
  const expiredProof = fixtureAssertion(expired.challenge, { count: 0 });
  assert.equal(expiring.verify(pinned.ownerId, reviewed, expiredProof), false);
  const fresh = expiring.issue(reviewed);
  const zeroCounter = fixtureAssertion(fresh.challenge, { count: 0 });
  assert.equal(expiring.verify(pinned.ownerId, reviewed, zeroCounter), true);
  assert.equal(expiring.verify(pinned.ownerId, reviewed, zeroCounter), false);
  assert.throws(() => new ProjectCheckOwnerProof({ ...pinned, origin: 'https://outside.example' }), /Invalid pinned local/);
  assert.throws(() => new ProjectCheckOwnerProof({ ...pinned, publicKey: keys.privateKey }), /Invalid pinned local/);
  console.log(JSON.stringify({ ownerAssertionProof: true, assertionRejections: Object.keys(rejectionProofs).length,
    exactApproval: true, exactRevocation: true, expiryAndCapacity: true, fixtureCredentials: true }));
} finally {
  assert.equal(path.dirname(fixture), parent);
  fs.rmSync(fixture, { recursive: true, force: true });
}
