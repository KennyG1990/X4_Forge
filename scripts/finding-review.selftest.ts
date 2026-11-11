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
const claimedCode = 'x4-ui.truncated-evidence';
const explicitEvidence = buildValidationEvidence(coverageProject, [{ ...uiGap, code: claimedCode }]);
const explicitProof = { ...projectVerification, checks: [{ ...projectVerification.checks[0], coveredChecks: [claimedCode] }] };
const explicitCredit = applyProjectCheckCoverage(explicitEvidence, explicitProof);
check('an explicitly reviewed covered Lua check receives separate project credit', explicitCredit.coverage.complete
  && explicitCredit.coverage.projectVerification?.forgeComplete === false && explicitCredit.findings === explicitEvidence.findings);
const namedCodes = ['x4-ui.truncated-evidence', 'lua_md.emit_verification_gap',
  'md_lua.registration_verification_gap', 'lua.runtime_scope_unverified'];
const namedGaps = namedCodes.map(code => ({ ...uiGap, code, message: 'Same reason for distinct named checks.' }));
const namedEvidence = buildValidationEvidence(coverageProject, namedGaps);
const allNamedProof = { ...projectVerification, checks: [{ ...projectVerification.checks[0], coveredChecks: namedCodes }] };
const allNamed = applyProjectCheckCoverage(namedEvidence, allNamedProof);
check('every explicitly covered named gap is project-verified with raw findings retained', allNamed.coverage.complete
  && allNamed.findings === namedEvidence.findings && allNamed.coverage.projectVerification?.resolvedGaps.length === 4
  && allNamed.coverage.projectVerification?.creditedFindingIds.length === 4
  && allNamed.coverage.projectVerification?.status === 'project-verified' && !allNamed.coverage.projectVerification.forgeComplete
  && evaluateFindingAcceptances({ ...subject, evidence: allNamed, projectCheckProof: allNamedProof.suite }, [], principal).validationClean);
const oneNamed = applyProjectCheckCoverage(namedEvidence, explicitProof);
check('same-path same-message findings from undeclared checks keep their gaps', !oneNamed.coverage.complete
  && oneNamed.checkUnavailableCount === 3 && oneNamed.coverage.projectVerification?.creditedFindingIds.length === 1
  && oneNamed.coverage.projectVerification.creditedFindingIds[0] === namedEvidence.findings[0].findingId);
check('old file-only approvals gain no additional credit', applyProjectCheckCoverage(namedEvidence, projectVerification).checkUnavailableCount === 4);
check('replacement proof restores previously credited checks it does not declare', applyProjectCheckCoverage(allNamed, projectVerification).checkUnavailableCount === 4);
check('reapplying exact named coverage is idempotent', JSON.stringify(applyProjectCheckCoverage(allNamed, allNamedProof)) === JSON.stringify(allNamed));
const nonLuaAndUnclaimed = buildValidationEvidence(coverageProject, [
  ...['ui/uncovered.lua', 'ui/Covered.lua', 'ui.xml', 'md/covered.xml'].map(filePath => ({ ...uiGap, code: claimedCode, filePath })),
  { ...uiGap, code: claimedCode, filePath: undefined },
  { ...uiGap, code: 'validation.lua_ast_unavailable' },
  { ...uiGap, code: 'lua.undefined_global', severity: 'error' },
]);
const boundedNamed = applyProjectCheckCoverage(nonLuaAndUnclaimed, { ...allNamedProof, checks: [{ ...allNamedProof.checks[0],
  coveredChecks: [...namedCodes, 'validation.lua_ast_unavailable', 'lua.undefined_global'],
  coveredFiles: [...allNamedProof.checks[0].coveredFiles, ...['ui.xml', 'md/covered.xml'].map(path => ({ path, size: 1, sha256: 'a'.repeat(64) }))],
}] });
check('uncovered/case/non-Lua/global/parser gaps and real static errors survive even untrusted extra names', boundedNamed.checkUnavailableCount === 6
  && boundedNamed.modErrorCount === 1 && boundedNamed.outcome === 'mod-findings' && boundedNamed.findings === nonLuaAndUnclaimed.findings
  && boundedNamed.coverage.projectVerification?.creditedFindingIds.length === 0);
const separateFiles = applyProjectCheckCoverage(buildValidationEvidence(coverageProject,
  [{ ...uiGap, code: namedCodes[1] }]), { ...projectVerification, checks: [
    { ...projectVerification.checks[0], coveredChecks: [namedCodes[0]] },
    { ...projectVerification.checks[0], id: 'different', coveredChecks: [namedCodes[1]],
      coveredFiles: [{ path: 'ui/different.lua', size: 1, sha256: 'a'.repeat(64) }] },
  ] });
check('coverage claims from one check cannot attach to another check files', separateFiles.checkUnavailableCount === 1);
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
const mdPath = 'md/deep.xml';
const mdGap = { code: 'package.md_analysis_unavailable', severity: 'warning' as const, filePath: mdPath,
  message: 'Mission Director authored-output analysis unavailable: XML nesting exceeds the 256-element import limit.' };
const mdEvidence = buildValidationEvidence({ ...coverageProject, files: [...coverageProject.files,
  { path: mdPath, kind: 'md' as const, content: '<diff><remove sel="/mdscript/@name"/></diff>' },
] }, [mdGap]);
const mdSubject: AcceptanceSubject = { ...subject, evidence: mdEvidence };
const mdDecision = evaluateFindingAcceptances(mdSubject, [], principal);
check('MD readiness unavailability is an exact coverage gap, never a mod error or clean result',
  mdEvidence.findings.length === 1 && mdEvidence.findings[0].code === mdGap.code
  && mdEvidence.findings[0].filePath === mdPath && mdEvidence.findings[0].category === 'check-unavailable'
  && mdEvidence.modErrorCount === 0 && mdEvidence.checkUnavailableCount === 1
  && mdEvidence.outcome === 'incomplete' && !mdEvidence.coverage.complete
  && mdEvidence.coverage.gaps[0]?.check === mdGap.code && mdEvidence.coverage.gaps[0]?.filePath === mdPath
  && mdDecision.validationAllowsDeploy && !mdDecision.validationClean && mdDecision.outcome === 'incomplete-checks');
const acceptedMd = evaluateFindingAcceptances(mdSubject, [approve(mdSubject, 0)], principal);
check('exact acceptance cannot erase the MD readiness coverage gap', acceptedMd.validationAllowsDeploy
  && !acceptedMd.validationClean && acceptedMd.outcome === 'accepted-findings-and-incomplete-checks'
  && acceptedMd.counts.unavailableChecks === 1 && acceptedMd.counts.acceptedWarnings === 0
  && mdEvidence.checkUnavailableCount === 1 && !mdEvidence.coverage.complete);
const verifiedMd = applyProjectCheckCoverage(mdEvidence, { ...projectVerification,
  checks: [{ ...projectVerification.checks[0], coveredFiles: [{ path: mdPath, size: 49, sha256: 'a'.repeat(64) }] }],
});
const verifiedMdDecision = evaluateFindingAcceptances({ ...mdSubject, evidence: verifiedMd,
  projectCheckProof: projectVerification.suite }, [], principal);
check('project coverage of the same MD file cannot credit this unavailable check', verifiedMd.findings === mdEvidence.findings
  && !verifiedMd.coverage.complete && verifiedMd.checkUnavailableCount === 1
  && verifiedMd.coverage.gaps[0]?.check === mdGap.code && verifiedMd.coverage.gaps[0]?.filePath === mdPath
  && verifiedMd.coverage.projectVerification?.creditedFindingIds.length === 0
  && verifiedMd.coverage.projectVerification?.resolvedGaps.length === 0
  && verifiedMdDecision.validationAllowsDeploy && !verifiedMdDecision.validationClean
  && verifiedMdDecision.outcome === 'incomplete-checks');
console.log(JSON.stringify({ pass: true, checks }));
