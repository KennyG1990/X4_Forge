import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildValidationEvidence, type EvidenceDiagnostic } from '../src/lib/validationEvidence';
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
