import assert from 'node:assert/strict';
import { applyProjectCheckCoverage, buildValidationEvidence, type ProjectCheckVerification } from '../src/lib/validationEvidence';
import { evaluateFindingAcceptances, acceptanceBinding, projectFindingReview, type AcceptanceSubject } from '../src/server/findingAcceptance';

const principal = { kind: 'agent' as const, id: 'key_review_fixture', label: 'Review fixture', scope: 'deploy' as const, deployAuthorized: true };
const evidence = buildValidationEvidence({ id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content', content: '<content id="lab" version="100"/>' }] }, [
  { code: 'warning.first', severity: 'warning', message: 'First warning' },
  { code: 'warning.second', severity: 'warning', message: 'Second warning' },
]);
const subject: AcceptanceSubject = { evidence, artifactHash: 'a'.repeat(64), validatorHash: 'b'.repeat(64), corpusHash: 'c'.repeat(64), targetHash: 'd'.repeat(64) };
const approve = (s: AcceptanceSubject, index: number) => ({ findingId: s.evidence.findings[index].findingId, bindingHash: acceptanceBinding(s).hash, reason: 'Reviewed fixture only.' });
let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; }
const unaccepted = evaluateFindingAcceptances(subject, [], principal);
check('warnings do not block but are not clean', unaccepted.validationAllowsDeploy && !unaccepted.validationClean && unaccepted.outcome === 'warnings-present');
check('outstanding warnings counted', unaccepted.counts.unacceptedWarnings === 2 && unaccepted.counts.acceptedWarnings === 0);
const mixed = evaluateFindingAcceptances(subject, [approve(subject, 0)], principal);
check('mixed warnings distinct', mixed.outcome === 'accepted-findings-with-outstanding-warnings' && mixed.counts.acceptedWarnings === 1 && mixed.counts.unacceptedWarnings === 1);
const all = evaluateFindingAcceptances(subject, [approve(subject, 0), approve(subject, 1)], principal);
check('all accepted still qualified', all.validationAllowsDeploy && !all.validationClean && all.outcome === 'accepted-findings');
check('raw evidence retained', subject.evidence.findings.length === 2 && subject.evidence.findings.every(f => f.severity === 'warning'));
const projected = projectFindingReview(mixed, principal);
check('preview is proposed, not a durable approval', projected.status === 'proposed' && !('receiptId' in projected.approvals[0]));
check('auth principal and reason projected', projected.approvals[0].actor.id === principal.id && projected.approvals[0].reason === 'Reviewed fixture only.');
check('unaccepted finding remains addressable', projected.outstandingFindingIds[0] === evidence.findings[1].findingId);
const incomplete: AcceptanceSubject = { ...subject, evidence: buildValidationEvidence({ id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content', content: '<content id="lab"/>' }] }, [{ code: 'validation.disk_file_skipped', severity: 'warning', message: 'Unavailable check' }]) };
const unavailable = evaluateFindingAcceptances(incomplete, [approve(incomplete, 0)], principal);
check('accepting unavailable never erases coverage', !unavailable.validationClean && unavailable.counts.unavailableChecks === 1 && unavailable.outcome === 'accepted-findings-and-incomplete-checks');
check('unavailable warning not miscounted as mod warning', unavailable.counts.acceptedWarnings === 0 && unavailable.counts.unacceptedWarnings === 0);
const clean = { ...subject, evidence: buildValidationEvidence({ id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content', content: '<content id="lab"/>' }] }, []) };
check('clean input stays clean', evaluateFindingAcceptances(clean, [], principal).validationClean);

const coverageProject = { id: 'lab', name: 'Lab', files: [
  { path: 'content.xml', kind: 'content' as const, content: '<content id="lab"/>' },
  { path: 'ui/covered.lua', kind: 'lua' as const, content: 'local x = 1' },
] };
const uiGap = { code: 'x4-ui.verification-gap', severity: 'info' as const, filePath: 'ui/covered.lua', message: 'Runtime UI values unresolved.' };
const executionGap = { check: 'project-checks.execution', filePath: 'forge.checks.json', reason: 'Approved suite did not run.' };
const projectVerification: ProjectCheckVerification = {
  suite: { id: `ar_${'a'.repeat(64)}`, hash: 'b'.repeat(64) }, artifactHash: 'c'.repeat(64),
  checks: [{ id: 'ui', receiptId: `ar_${'d'.repeat(64)}`, receiptHash: 'e'.repeat(64), durationMs: 1, outputBytes: 0,
    outputTailSha256: 'f'.repeat(64), coveredFiles: [{ path: uiGap.filePath, size: 11, sha256: 'a'.repeat(64) }] }],
};
const unverified = buildValidationEvidence(coverageProject, [uiGap], [executionGap]);
const verified = applyProjectCheckCoverage(unverified, projectVerification);
const verifiedReview = evaluateFindingAcceptances({ ...subject, evidence: verified, projectCheckProof: projectVerification.suite }, [], principal);
check('project verification closes only the eligible gap without hiding the static finding', verified.coverage.complete
  && verified.checkUnavailableCount === 0 && verified.findings === unverified.findings && verifiedReview.validationClean
  && verified.coverage.projectVerification?.forgeComplete === false
  && verified.coverage.projectVerification?.creditedFindingIds[0] === unverified.findings[0].findingId);
const mixedCoverage = buildValidationEvidence(coverageProject, [uiGap,
  { ...uiGap, filePath: 'ui/Covered.lua', message: 'Different path spelling was not bound to the checked artifact.' },
  { ...uiGap, code: 'x4-ui.truncated-evidence' },
  { ...uiGap, code: 'lua_md.emit_verification_gap' },
  { ...uiGap, code: 'ui.fixture_error', severity: 'error' },
], [executionGap, { check: 'references', reason: 'Vocabulary missing.' }]);
const creditedMixed = applyProjectCheckCoverage(mixedCoverage, projectVerification);
const creditedReview = evaluateFindingAcceptances({ ...subject, evidence: creditedMixed, projectCheckProof: projectVerification.suite }, [], principal);
check('mismatched paths, unrelated gaps and real mod errors survive exact credit', !creditedMixed.coverage.complete
  && creditedMixed.checkUnavailableCount === 4 && creditedMixed.findings === mixedCoverage.findings
  && creditedMixed.coverage.projectVerification?.resolvedGaps.length === 2 && creditedReview.outcome === 'blocked-mod-findings');
const replacement = applyProjectCheckCoverage(verified, {
  ...projectVerification,
  checks: [{ ...projectVerification.checks[0], coveredFiles: [{ path: 'ui/unrelated.lua', size: 11, sha256: 'a'.repeat(64) }] }],
});
check('coverage from different suite files does not inherit a former credit', !replacement.coverage.complete
  && replacement.coverage.gaps[0]?.filePath === uiGap.filePath && replacement.coverage.projectVerification?.creditedFindingIds.length === 0);
console.log(JSON.stringify({ pass: true, checks }));
