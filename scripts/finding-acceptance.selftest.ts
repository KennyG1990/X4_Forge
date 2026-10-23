import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildValidationEvidence } from '../src/lib/validationEvidence';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildArtifactPlan, artifactPlanIdentity } from '../src/lib/artifactPipeline';
import {
  acceptanceBinding, evaluateFindingAcceptances, recordFindingAcceptances,
  verifyFindingAcceptanceReceipts, type AcceptanceSubject, type AcceptancePrincipal,
} from '../src/server/findingAcceptance';

let count = 0;
function check(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }
const digest = (character: string) => character.repeat(64);
const evidence = buildValidationEvidence({ id: 'fixture', name: 'Fixture', files: [
  { path: 'content.xml', kind: 'content', content: '<content id="acceptance_fixture" version="100"/>' },
] }, [
  { code: 'lua_md.missing_listener', severity: 'error', filePath: 'ui/main.lua', message: 'Listener not found.' },
  { code: 'validation.lua_ast_unavailable', severity: 'error', filePath: 'ui/other.lua', message: 'Analysis unavailable.' },
]);
const subject: AcceptanceSubject = {
  evidence, artifactHash: digest('a'), validatorHash: digest('b'), corpusHash: digest('c'), targetHash: digest('d'),
};
const principal: AcceptancePrincipal = { kind: 'agent', id: 'key_fixture', label: 'Fixture agent', scope: 'deploy', deployAuthorized: true };
const request = () => [{ findingId: evidence.findings[0].findingId, bindingHash: acceptanceBinding(subject).hash, reason: 'Matched the listener against the complete source.' }];
const decide = (requests: unknown = request(), actor: AcceptancePrincipal | undefined = principal, current = subject, safety: string[] = []) =>
  evaluateFindingAcceptances(current, requests, actor, safety);
check('mod error blocks without an exact acceptance', () => assert.equal(decide([]).validationAllowsDeploy, false));
check('authorized exact acceptance allows only a qualified result', () => {
  const decision = decide();
  assert.equal(decision.validationAllowsDeploy, true);
  assert.equal(decision.validationClean, false);
  assert.equal(decision.outcome, 'accepted-findings-and-incomplete-checks');
  assert.equal(evidence.modErrorCount, 1);
});
check('unavailable checks alone do not become a mod blocker', () => {
  const current = { ...subject, evidence: { ...evidence, modErrorCount: 0, findings: [evidence.findings[1]] } };
  const decision = decide([], principal, current);
  assert.equal(decision.validationAllowsDeploy, true);
  assert.equal(decision.validationClean, false);
  assert.equal(decision.outcome, 'incomplete-checks');
});
for (const scope of ['read', 'write'] as const) check(`${scope} principal cannot approve`, () =>
  assert.throws(() => decide(request(), { ...principal, scope }), /DEPLOY_APPROVAL_FORBIDDEN/));
check('capability-constrained deploy principal cannot approve', () => assert.throws(() => decide(request(), { ...principal, deployAuthorized: false }), /DEPLOY_APPROVAL_FORBIDDEN/));
check('missing principal cannot approve', () => assert.throws(() => evaluateFindingAcceptances(subject, request(), undefined), /DEPLOY_APPROVAL_FORBIDDEN/));
check('caller cannot forge actor or wildcard fields', () => assert.throws(() => decide([{ ...request()[0], actor: 'Ken' }]), /ACCEPTANCE_INPUT_INVALID/));
for (const reason of ['', '   ', 'x'.repeat(513), 'two\nlines', 'Bearer abcdefghijklmnop']) check(`invalid reason ${JSON.stringify(reason.slice(0, 20))}`, () =>
  assert.throws(() => decide([{ ...request()[0], reason }]), /ACCEPTANCE_INPUT_INVALID/));
check('unknown finding is refused', () => assert.throws(() => decide([{ ...request()[0], findingId: digest('e') }]), /ACCEPTANCE_FINDING_STALE/));
check('duplicate finding is refused', () => assert.throws(() => decide([...request(), ...request()]), /ACCEPTANCE_INPUT_INVALID/));
for (const field of ['artifactHash', 'validatorHash', 'corpusHash', 'targetHash'] as const) check(`${field} change expires acceptance`, () =>
  assert.throws(() => decide(request(), principal, { ...subject, [field]: digest('e') }), /ACCEPTANCE_BINDING_STALE/));
check('source change expires acceptance', () => assert.throws(() => decide(request(), principal, { ...subject, evidence: { ...evidence, sourceHash: digest('e') } }), /ACCEPTANCE_BINDING_STALE/));
check('mod identity change expires acceptance', () => assert.throws(() => decide(request(), principal, { ...subject, evidence: { ...evidence, modId: 'different_mod' } }), /ACCEPTANCE_BINDING_STALE/));
check('unresolved identity is not overridable', () => assert.throws(() => decide(request(), principal, { ...subject, evidence: { ...evidence, modId: null } }), /ACCEPTANCE_SUBJECT_INVALID/));
for (const code of ['AUTHORIZATION_DENIED', 'PATH_ESCAPE', 'SOURCE_STALE', 'WRITE_INTEGRITY_FAILED']) check(`${code} is non-overridable`, () =>
  assert.throws(() => decide(request(), principal, subject, [code]), /NON_OVERRIDABLE_DEPLOY_GATE/));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-finding-acceptance-'));
try {
  const store = new ActionReceiptStore({ root: path.join(root, 'receipts') });
  const record = () => recordFindingAcceptances(store, subject, request(), principal);
  let receiptIds: string[] = [];
  check('approval is durable in the existing verified receipt store', () => {
    const result = record();
    receiptIds = result.receipts.map(receipt => receipt.id);
    const receipt = store.read(receiptIds[0]);
    assert.equal(receipt.status, 'committed');
    assert.deepEqual(receipt.actor, { kind: 'agent', id: principal.id });
    assert.equal(receipt.metadata?.reason, request()[0].reason);
    assert.equal(receipt.metadata?.findingId, evidence.findings[0].findingId);
    assert.equal(receipt.metadata?.sourceHash, evidence.sourceHash);
    assert.equal(receipt.metadata?.outcome, 'finding-accepted-not-deployed');
    assert.equal(receipt.validation.validator, 'finding-acceptance-v1');
  });
  check('same approval is idempotent', () => assert.deepEqual(record().receipts.map(receipt => receipt.id), receiptIds));
  check('restart reads the same authenticated approval', () => {
    const reopened = new ActionReceiptStore({ root: store.root });
    assert.equal(verifyFindingAcceptanceReceipts(reopened, receiptIds, subject, request(), principal).validationAllowsDeploy, true);
  });
  check('missing receipt cannot authorize', () => assert.throws(() => verifyFindingAcceptanceReceipts(store, [], subject, request(), principal), /ACCEPTANCE_RECEIPT_MISMATCH/));
  check('another actor cannot replay the approval', () => assert.throws(() => verifyFindingAcceptanceReceipts(store, receiptIds, subject, request(), { ...principal, id: 'key_other' }), /ACCEPTANCE_RECEIPT_MISMATCH/));
  check('corrupt receipt cannot authorize', () => {
    const file = store.pathFor(receiptIds[0]);
    const original = fs.readFileSync(file, 'utf8');
    const changed = JSON.parse(original);
    changed.metadata.reason = 'Tampered';
    fs.writeFileSync(file, JSON.stringify(changed));
    assert.throws(() => verifyFindingAcceptanceReceipts(store, receiptIds, subject, request(), principal));
    fs.writeFileSync(file, original);
  });
  check('receipt storage failure is not swallowed', () => {
    const blockedRoot = path.join(root, 'not-a-directory');
    fs.writeFileSync(blockedRoot, 'fixture');
    assert.throws(() => recordFindingAcceptances(new ActionReceiptStore({ root: blockedRoot }), subject, request(), principal));
  });
  check('prepared-only approval cannot authorize or silently resume', () => {
    class InterruptedStore extends ActionReceiptStore {
      override commit(): never { throw new Error('Injected failure before terminal approval'); }
    }
    const interrupted = new InterruptedStore({ root: path.join(root, 'interrupted') });
    assert.throws(() => recordFindingAcceptances(interrupted, subject, request(), principal), /Injected failure/);
    const ids = fs.readdirSync(interrupted.root).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5));
    assert.equal(ids.length, 1);
    assert.equal(interrupted.read(ids[0]).status, 'prepared');
    const reopened = new ActionReceiptStore({ root: interrupted.root });
    assert.throws(() => verifyFindingAcceptanceReceipts(reopened, ids, subject, request(), principal), /ACCEPTANCE_RECEIPT_MISMATCH/);
    assert.throws(() => recordFindingAcceptances(reopened, subject, request(), principal), /ACCEPTANCE_RECEIPT_INCOMPLETE/);
  });
  check('terminal approval with a different result cannot authorize', () => {
    class WrongResultStore extends ActionReceiptStore {
      override commit(id: string, input: Parameters<ActionReceiptStore['commit']>[1]) {
        return super.commit(id, { ...input, validation: { ...input.validation!, code: 'NOT_AN_APPROVAL' } });
      }
    }
    assert.throws(() => recordFindingAcceptances(new WrongResultStore({ root: path.join(root, 'wrong-result') }), subject, request(), principal), /ACCEPTANCE_RECEIPT_MISMATCH/);
  });
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'large.bin'), Buffer.alloc(600_000, 1));
  const plan = () => buildArtifactPlan({ sourceRoot: source, generatedFiles: { 'content.xml': '<content id="fixture"/>' } });
  const originalPlan = plan();
  const hash = artifactPlanIdentity(originalPlan, 'loose');
  check('artifact identity covers non-validated large binary bytes', () => {
    fs.writeFileSync(path.join(source, 'large.bin'), Buffer.alloc(600_000, 2));
    assert.notEqual(artifactPlanIdentity(plan(), 'loose'), hash);
  });
  check('artifact identity is independent of enumeration order', () => assert.equal(artifactPlanIdentity({ ...originalPlan, entries: [...originalPlan.entries].reverse() }, 'loose'), hash));
  check('artifact identity binds packaging format', () => assert.notEqual(artifactPlanIdentity(originalPlan, 'catalog'), hash));
  check('artifact identity binds ownership rules', () => assert.notEqual(artifactPlanIdentity({ ...originalPlan, rules: { ...originalPlan.rules, runtimeOwned: ['save/*'] } }, 'loose'), hash));
  check('failed artifact plan has no deploy identity', () => assert.throws(() => artifactPlanIdentity({ ...originalPlan, ok: false }, 'loose')));
} finally {
  // Exact mkdtemp-created fixture only; never a user/project/game tree.
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`Finding acceptance: ${count}/${count} passed`);
