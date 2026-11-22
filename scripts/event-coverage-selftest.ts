import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateProjectCrossFile, runProjectCrossFileSelftest } from '../src/lib/projectCrossFileValidation';
import { applyProjectCheckCoverage, buildValidationEvidence, type ProjectCheckVerification } from '../src/lib/validationEvidence';
import { runProjectValidation, flattenProjectValidation } from '../src/server/projectValidation';
import { evaluateFindingAcceptances } from '../src/server/findingAcceptance';
import type { ExtensionProject } from '../src/lib/extensionProject';

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json','utf8')) as ExtensionProject;
function project(lua: string) {
  const p=structuredClone(fixture);
  p.files.find(f=>f.path==='ui/lab.lua')!.content=lua;
  const md=p.files.find(f=>f.path==='md/forge_regression_lab.xml')!;
  md.content=md.content!.replace('</cues>',`<cue name="Probe"><conditions><event_ui_triggered screen="'ForgeLab'" control="'probe'"/></conditions><actions><debug_text text="'probe'"/></actions></cue></cues>`);
  return p;
}
const checks:string[]=[];
function check(name:string,run:()=>void){run();checks.push(name);}
const exact='AddUITriggeredEvent("ForgeLab", "probe", {})';
const dynamic='function SendProbe(name) AddUITriggeredEvent("ForgeLab", name, {}) end';
const analyze=(lua:string)=>validateProjectCrossFile(project(lua));
check('literal-match-exact',()=>{const r=analyze(exact);assert.equal(r.ok,true);assert.equal(r.mdLua.emitCoverage.exact,1);assert.equal(r.summary.luaEmitUnverified,0);});
check('literal-missing-still-error',()=>{const r=analyze(exact.replace('probe','absent'));assert.equal(r.ok,false);assert.ok(r.findings.some(f=>f.code==='lua_md.missing_listener'&&f.severity==='error'));});
check('dynamic-control-explicit',()=>{const r=analyze(dynamic);assert.equal(r.ok,true);assert.equal(r.mdLua.emitCoverage.unresolved,1);assert.equal(r.mdLua.emitted.length,0);assert.equal(r.findings.filter(f=>f.code==='lua_md.emit_verification_gap').length,1);});
check('dynamic-namespace-explicit',()=>assert.equal(analyze('function f(screen) AddUITriggeredEvent(screen,"probe",{}) end').summary.luaEmitUnverified,1));
check('prefix-match-remains-unproven',()=>{const r=analyze('function f(suffix) AddUITriggeredEvent("ForgeLab","pro"..suffix,{}) end');assert.equal(r.mdLua.emitCoverage.prefix,1);assert.equal(r.summary.luaMdMissingListeners,0);assert.equal(r.summary.luaEmitUnverified,1);});
check('literal-underscore-not-prefix',()=>{const r=analyze(exact.replace('probe','probe_'));assert.equal(r.summary.luaEmitUnverified,0);assert.equal(r.ok,false);});
check('immutable-local-exact',()=>assert.equal(analyze('local screen="ForgeLab"\nlocal control="probe"\nAddUITriggeredEvent(screen,control,{})').mdLua.emitCoverage.exact,1));
check('reassignment-unresolved',()=>assert.equal(analyze('local control="probe"\ncontrol=GetPlayerName()\nAddUITriggeredEvent("ForgeLab",control,{})').mdLua.emitCoverage.unresolved,1));
check('shadow-is-not-engine-call',()=>assert.equal(analyze('local function AddUITriggeredEvent(a,b,c) return a end\nAddUITriggeredEvent("ForgeLab","missing",{})').summary.luaEmitUnverified,0));
check('ambiguous-global-explicit',()=>assert.ok(analyze('AddUITriggeredEvent=SomeOtherFunction\nAddUITriggeredEvent("ForgeLab","missing",{})').mdLua.emitCoverage.files.some(f=>f.reasons.includes('ambiguous-callee'))));
check('comments-strings-not-calls',()=>assert.equal(analyze('-- '+dynamic+'\nlocal s=[['+dynamic+']]\nreturn s').summary.luaEmitUnverified,0));
check('unsupported-encoding-explicit',()=>assert.ok(analyze('AddUITriggeredEvent("ForgeLab","日本",{})').mdLua.emitCoverage.files.some(f=>f.reasons.includes('source-encoding'))));
check('large-file-tail-included',()=>assert.equal(analyze('-- filler\n'.repeat(65000)+dynamic).summary.luaEmitUnverified,1));
check('one-gap-per-file',()=>{const r=analyze(Array.from({length:100},()=>dynamic).join('\n'));assert.equal(r.summary.luaEmitUnverified,100);assert.equal(r.findings.filter(f=>f.code==='lua_md.emit_verification_gap').length,1);});
check('parse-failure-preserved',()=>{const r=analyze('function broken(');assert.ok(r.findings.some(f=>f.code==='validation.lua_ast_unavailable'));assert.equal(r.mdLua.emitCoverage.files.find(f=>f.file==='ui/lab.lua')!.parsed,false);});
const finite = 'local function send(on) AddUITriggeredEvent("ForgeLab", on and "on" or "off", {}) end';
const finiteControls: [string, string][] = [['ForgeLab', 'on'], ['ForgeLab', 'off']];
function finiteCase(lua: string, listeners = finiteControls, payloadRead = false) {
  const input = project(lua);
  const cues = listeners.map(([screen, control], index) => `<cue name="Finite${index}">
    <conditions><event_ui_triggered screen="'${screen}'" control="'${control}'"/></conditions>
    ${payloadRead ? `<actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions>` : ''}
  </cue>`).join('');
  input.files.push({ path: 'md/finite.xml', kind: 'md', content: `<mdscript name="Finite"><cues>${cues}</cues></mdscript>` });
  return validateProjectCrossFile(input);
}
const listenerErrors = (result: ReturnType<typeof finiteCase>) => result.findings
  .filter(finding => finding.code === 'lua_md.missing_listener')
  .map(finding => [finding.event, finding.severity]);
const targetNames = (result: ReturnType<typeof finiteCase>) => result.mdLua.emitted
  .filter(event => event.file === 'ui/lab.lua').map(event => event.control);

check('finite-control-counts-one-exact-call-and-both-targets', () => {
  const result = finiteCase(finite);
  assert.deepEqual(targetNames(result), ['on', 'off']);
  assert.equal(result.mdLua.emitCoverage.exact, 1);
  assert.equal(result.summary.luaEmitUnverified, 0);
  assert.deepEqual(listenerErrors(result), []);
});
check('finite-control-exposes-each-missing-listener', () => {
  assert.deepEqual(listenerErrors(finiteCase(finite, [finiteControls[0]])), [['ForgeLab.off', 'error']]);
  assert.deepEqual(listenerErrors(finiteCase(finite, [finiteControls[1]])), [['ForgeLab.on', 'error']]);
});
check('finite-control-selects-reachable-literal-truthiness', () => {
  for (const [condition, target] of [['true', 'on'], ['false', 'off'], ['nil', 'off'], ['0', 'on'], ['""', 'on']]) {
    const lua = finite.replace('on and', `${condition} and`);
    assert.deepEqual(targetNames(finiteCase(lua)), [target], condition);
  }
  const localFalse = finite.replace('function send(on)', 'function send() local on = false;');
  const result = finiteCase(localFalse, [finiteControls[1]]);
  assert.deepEqual(targetNames(result), ['off']);
  assert.deepEqual(listenerErrors(result), []);
  for (const initializer of ['{}', '{ compute() }', 'function() end']) {
    const lua = finite.replace('function send(on)', `function send() local on = ${initializer};`);
    assert.deepEqual(targetNames(finiteCase(lua, [finiteControls[0]])), ['on'], initializer);
  }
  const alias = localFalse.replace('false;', 'false; local alias = on;').replace('on and', 'alias and');
  assert.deepEqual(targetNames(finiteCase(alias, [finiteControls[1]])), ['off']);
});
check('finite-control-deduplicates-equal-arms', () => {
  const result = finiteCase(finite.replace('or "off"', 'or "on"'), []);
  assert.deepEqual(targetNames(result), ['on']);
  assert.deepEqual(listenerErrors(result), [['ForgeLab.on', 'error']]);
  assert.equal(result.mdLua.emitCoverage.exact, 1);
});
check('finite-control-preserves-unknown-arguments-and-callees', () => {
  const unsupported = [
    finite.replace('on and "on"', 'on'),
    finite.replace(' or "off"', ''),
    finite.replace('on and', 'compute() and'),
    finite.replace('on and', '({ compute() }) and'),
    finite.replace('AddUITriggeredEvent', 'if on then AddUITriggeredEvent').replace(', {}) end', ', {}) end end'),
    finite.replace('AddUITriggeredEvent', 'while on do AddUITriggeredEvent').replace(', {}) end', ', {}) end end'),
    finite.replace('function send(on)', 'function send()'),
    finite.replace('or "off"', 'or dynamicName'),
    finite.replace('or "off"', 'or ""'),
    finite.replace('or "off"', 'or "日本"'),
    finite.replace('"ForgeLab"', '"Forge" .. suffix'),
    'AddUITriggeredEvent = alternate\n' + finite,
    'rawset(_G, "AddUITriggeredEvent", alternate)\n' + finite,
  ];
  for (const lua of unsupported) {
    const result = finiteCase(lua);
    assert.equal(result.summary.luaEmitUnverified, 1, lua);
    assert.deepEqual(targetNames(result), [], lua);
    assert.deepEqual(listenerErrors(result), [], lua);
  }
});
check('listener-matching-preserves-namespace-and-control-boundaries', () => {
  const lua = finite.replace('"ForgeLab"', '"a"').replace('and "on"', 'and "b.c"');
  assert.deepEqual(listenerErrors(finiteCase(lua, [['a.b', 'c'], ['a', 'off']])), [['a.b.c', 'error']]);
  assert.deepEqual(listenerErrors(finiteCase(lua, [['a', 'b.c'], ['a', 'off']])), []);
  const prefix = 'local function send(suffix) AddUITriggeredEvent("a", "b." .. suffix, {}) end';
  assert.deepEqual(listenerErrors(finiteCase(prefix, [['a.b', 'c']])), [['a.b.', 'warning']]);
  assert.deepEqual(listenerErrors(finiteCase(prefix, [['a', 'b.c']])), []);
  const bothMissing = project('AddUITriggeredEvent("a", "b.c", {})\nAddUITriggeredEvent("a.b", "c", {})');
  const flat = flattenProjectValidation(runProjectValidation(bothMissing)).filter(finding => finding.code === 'lua_md.missing_listener');
  assert.equal(flat.length, 2);
  assert.deepEqual(flat.map(finding => finding.message.match(/screen "[^"]+" and control "[^"]+"/)?.[0]).sort(),
    ['screen "a" and control "b.c"', 'screen "a.b" and control "c"']);
});
check('finite-control-applies-indexed-payload-proof-to-both-targets', () => {
  const authored = finite.replace('AddUITriggeredEvent', 'local p = {n = 1}; p["po" .. p.n] = "order"; AddUITriggeredEvent')
    .replace(', {})', ', p)');
  const result = finiteCase(authored, finiteControls, true);
  assert.equal(result.mdLua.payload.reads.filter(read => read.file === 'md/finite.xml').length, 2);
  assert.ok(!result.findings.some(finding => finding.code.startsWith('md_lua.payload_')));
  for (const negative of [authored.replace('on and', 'compute(p) and'),
    authored.replace('; AddUITriggeredEvent', '; p["po" .. p.n] = nil; AddUITriggeredEvent'),
    authored.replace('; AddUITriggeredEvent', '; local alias = p; alias["po" .. alias.n] = nil; AddUITriggeredEvent'),
    authored.replace('; AddUITriggeredEvent', '; p["po1"] = nil; AddUITriggeredEvent'),
    authored.replace('p["po" .. p.n] = "order"', 'while false do p["po" .. p.n] = "order" end'),
    authored.replace('= "order"', '= unknownOrder()'),
    authored.replace('; AddUITriggeredEvent', '; AddUITriggeredEvent("ForgeLab", "probe", p); AddUITriggeredEvent')]) {
    const findings = finiteCase(negative, finiteControls, true).findings;
    assert.equal(findings.filter(finding => finding.code === 'md_lua.payload_writer_unverified').length, 2);
  }
});

const localIndexPayloadHelper = `local function build()
local p = { n = 1 }
local i = p.n
p["ri" .. i] = "order"
return p
end
AddUITriggeredEvent("ForgeLab", "probe", build())`;
for (const [name, lua, code, severity] of [
  ['helper', localIndexPayloadHelper, 'md_lua.payload_writer_unverified', 'info'],
  ['missing', 'local p = { n = 1 }; AddUITriggeredEvent("ForgeLab", "probe", p)', 'md_lua.payload_missing_writer', 'error'],
  ['wrong-event', 'local p = { n = 1 }; local i = 1; p["ri" .. i] = "order"; AddUITriggeredEvent("ForgeLab", "other", p); AddUITriggeredEvent("ForgeLab", "probe", {})', 'md_lua.payload_missing_writer', 'error'],
  ['cleared-wrong-event', 'local p = { n = 1 }; p["ri" .. p.n] = "order"; local i = p.n; p["ri" .. i] = nil; AddUITriggeredEvent("ForgeLab", "other", p); AddUITriggeredEvent("ForgeLab", "probe", {})', 'md_lua.payload_missing_writer', 'error'],
] as const) {
  check(`local-index-payload-${name}-classification`, () => {
    const input = project(lua);
    const md = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
    md.content = md.content!.replace('</cues>', `<cue name="LocalIndexPayload"><conditions>
      <event_ui_triggered screen="'ForgeLab'" control="'probe'"/>
    </conditions><actions><set_value name="$ri" exact="event.param3.{'$ri' + $si}"/></actions></cue></cues>`);
    const result = validateProjectCrossFile(input);
    const payloadFindings = result.findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
    assert.equal(payloadFindings.length, 1);
    assert.equal(payloadFindings[0].code, code);
    assert.equal(payloadFindings[0].severity, severity);
    for (const write of result.mdLua.payload.writes) assert.deepEqual(Object.keys(write).sort(), ['file', 'key']);
    const unavailable = code === 'md_lua.payload_writer_unverified';
    // Classify these actual payload findings separately from unrelated project checks.
    const scopedEvidence = buildValidationEvidence(input, payloadFindings.map(finding => ({
      severity: finding.severity, code: finding.code, filePath: finding.file, message: finding.detail,
    })));
    const category = unavailable ? 'check-unavailable' : 'mod-finding';
    assert.equal(scopedEvidence.findings[0].category, category);
    assert.equal(scopedEvidence.outcome, unavailable ? 'incomplete' : 'mod-findings');
    assert.equal(scopedEvidence.modErrorCount, unavailable ? 0 : 1);
    assert.equal(scopedEvidence.coverage.gaps.some(gap => gap.check === 'md_lua.payload_writer_unverified'), unavailable);
    const decision = evaluateFindingAcceptances({
      evidence: scopedEvidence, artifactHash: 'a'.repeat(64), validatorHash: 'b'.repeat(64),
      corpusHash: 'c'.repeat(64), targetHash: 'd'.repeat(64),
    }, [], { kind: 'agent', id: 'fixture', label: 'Fixture', scope: 'deploy', deployAuthorized: true });
    assert.equal(decision.validationAllowsDeploy, unavailable);
    assert.equal(decision.validationClean, false);
    assert.equal(decision.outcome, unavailable ? 'incomplete-checks' : 'blocked-mod-findings');

    const full = runProjectValidation(input);
    assert.ok(flattenProjectValidation(full).some(finding => finding.code === code && finding.severity === severity));
    assert.ok(full.evidence!.findings.some(finding => finding.code === code && finding.category === category));
    assert.equal(full.evidence!.coverage.gaps.some(gap => gap.check === 'md_lua.payload_writer_unverified'), unavailable);
  });
}

const payloadUnavailable = 'md_lua.payload_writer_unverified';
check('payload-writer-target-prefers-an-observed-recipient-across-keys', () => {
  const input = project([
    'local p = { n = 1 }',
    'p["v" .. p.n] = "message"',
    'pcall(function() AddUITriggeredEvent("ForgeLab", "spend_request", p) end)',
  ].join('\n'));
  const writerPath = 'ui/player_orders.lua';
  input.files.push({ path: writerPath, kind: 'lua', content: [
    'local p = { n = 1 }',
    'local i = p.n',
    'p["cq" .. i] = "query"',
    'AddUITriggeredEvent("ForgeLab", "probe", p)',
  ].join('\n') });
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', [
    '<cue name="Spend"><conditions><event_ui_triggered screen="\'ForgeLab\'" control="\'spend_request\'"/></conditions></cue>',
    '<cue name="Orders"><conditions><event_ui_triggered screen="\'ForgeLab\'" control="\'probe\'"/></conditions><actions>',
    '<set_value name="$verb" exact="event.param3.{\'$v\' + $si}"/>',
    '<set_value name="$query" exact="event.param3.{\'$cq\' + $si}"/>',
    '</actions></cue></cues>',
  ].join('\n'));
  const replay = (project: ExtensionProject) => {
    const evidence = runProjectValidation(project).evidence!;
    const findings = evidence.findings.filter(finding => finding.code === payloadUnavailable);
    assert.equal(findings.length, 1);
    const [finding] = findings;
    assert.equal(finding.severity, 'info');
    assert.equal(finding.category, 'check-unavailable');
    assert.equal(finding.target?.file, writerPath);
    assert.deepEqual(finding.payloadWriterScope?.keys, ['cq', 'v']);
    assert.deepEqual(finding.payloadWriterScope?.writerPaths, ['ui/lab.lua', writerPath]);
    assert.ok(finding.projectCheckFact);
    return finding.projectCheckFact;
  };
  const forward = replay(input);
  assert.deepEqual(replay({ ...input, files: [...input.files].reverse() }), forward);
});

check('reviewed-payload-fact-covers-only-the-exact-event-and-every-input-byte', () => {
  const input = project(`${localIndexPayloadHelper}\nAddUITriggeredEvent("ForgeLab", "also", build())`);
  input.files.push({ path: 'ui/other.lua', kind: 'lua', content: localIndexPayloadHelper });
  const payloadCue = (name: string, control: string, keys: string[]) => `<cue name="${name}">
    <conditions><event_ui_triggered screen="'ForgeLab'" control="'${control}'"/></conditions>
    <actions>${keys.map(key => `<set_value name="$${key}" exact="event.param3.{'$${key}' + $si}"/>`).join('')}</actions>
  </cue>`;
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', payloadCue('FirstPayload', 'probe', ['ri'])
    + payloadCue('OtherPayload', 'also', ['ri']) + payloadCue('MissingPayload', 'probe', ['missing']) + '</cues>');
  const collidingReader = payloadCue('Another', 'probe', ['ri']).replace('</actions>',
    `<do_if value="$sv == 'collider'"><set_value name="$ri" exact="event.param3.{'$ri' + $si}"/></do_if></actions>`);
  input.files.push({ path: 'md/second_reader.xml', kind: 'md',
    content: `<mdscript name="SecondReader"><cues>${collidingReader}</cues></mdscript>` });

  const collect = (p: ExtensionProject) => {
    const result = runProjectValidation(p);
    const evidence = result.evidence!;
    const findings = evidence.findings.filter(finding => finding.code === payloadUnavailable);
    const fact = findings.find(finding => finding.payloadWriterScope?.event[1] === 'probe')?.projectCheckFact;
    assert(fact, 'Expected an exact project-check fact for the complete probe payload scope');
    return { evidence, findings, fact };
  };
  const { evidence, findings, fact } = collect(input);
  assert.deepEqual(fact.files.map(file => file.path), [
    'md/forge_regression_lab.xml', 'md/second_reader.xml', 'ui/lab.lua', 'ui/other.lua',
  ]);
  assert.equal(findings.length, 2);
  assert.notEqual(findings[0].projectCheckFact?.id, findings[1].projectCheckFact?.id);
  const onlyProbe = findings.find(finding => finding.projectCheckFact?.id === fact.id)!;
  assert.equal(onlyProbe.target, undefined);
  const withCandidateTarget = buildValidationEvidence(input, [{ ...onlyProbe, target: { file: 'ui/lab.lua', line: 4 } }]).findings[0];
  assert.deepEqual(withCandidateTarget.projectCheckFact, fact);
  assert.equal(withCandidateTarget.findingId, onlyProbe.findingId);
  for (const rejected of [
    { ...onlyProbe, target: { file: 'ui/unrelated.lua', line: 1 } },
    { ...onlyProbe, payloadWriterScope: { ...onlyProbe.payloadWriterScope!, writerPaths: [] } },
  ]) {
    assert.equal(buildValidationEvidence(input, [rejected]).findings[0].projectCheckFact, undefined);
  }
  const coveredFiles = fact.files.map(file => ({ ...file, size: Buffer.byteLength(input.files.find(candidate => candidate.path === file.path)!.content!) }));
  const hex = 'a'.repeat(64);
  const proof: ProjectCheckVerification = { suite: { id: 'suite', hash: hex }, artifactHash: hex,
    checks: [{ id: 'wire', receiptId: 'receipt', receiptHash: hex, durationMs: 1, outputBytes: 0, outputTailSha256: hex,
      coveredFiles, coveredFacts: [fact.id] }] };
  const rawGapCount = evidence.coverage.gaps.length;
  const apply = (checks: ProjectCheckVerification['checks']) => applyProjectCheckCoverage(evidence, { ...proof, checks });

  const matched = apply(proof.checks);
  assert.equal(matched.coverage.gaps.length, rawGapCount - 1);
  assert.equal(matched.coverage.projectVerification!.status, 'project-verified');
  assert.equal(matched.coverage.projectVerification!.forgeComplete, false);
  assert.deepEqual(matched.coverage.projectVerification!.creditedFindingIds, [onlyProbe.findingId]);
  assert.deepEqual(matched.coverage.projectVerification!.resolvedGaps[0].projectCheckFact, fact);
  assert.equal(matched.findings, evidence.findings);
  assert(matched.findings.some(finding => finding.code === 'md_lua.payload_missing_writer' && finding.severity === 'error'));
  assert(matched.findings.some(finding => finding.code === 'md_lua.payload_collision' && finding.severity === 'error'));
  const initializationGap = { check: 'md.variable_initial_state', filePath: reader.path, reason: 'Synthetic unmatched initialization check' };
  const mixed = buildValidationEvidence(input, findings, [initializationGap]);
  assert(applyProjectCheckCoverage(mixed, proof).coverage.gaps.some(gap => gap.check === initializationGap.check));
  assert.equal(matched.modErrorCount, evidence.modErrorCount);
  assert.deepEqual(applyProjectCheckCoverage(matched, proof), matched);

  const child = proof.checks[0];
  const wrongFile = coveredFiles.map((file, index) => index === 0 ? { ...file, path: file.path.toUpperCase() } : file);
  const wrongHash = coveredFiles.map((file, index) => index === 0 ? { ...file, sha256: hex } : file);
  for (const checks of [
    [{ ...child, coveredFacts: undefined, coveredChecks: [payloadUnavailable] }],
    [{ ...child, coveredFacts: [`md-payload-writer.v2:${hex}`] }],
    [{ ...child, coveredFiles: wrongFile }],
    [{ ...child, coveredFiles: wrongHash }],
    [{ ...child, coveredFiles: coveredFiles.slice(0, 1) }, { ...child, id: 'other', coveredFiles: coveredFiles.slice(1) }],
    ...coveredFiles.map(missing => [{ ...child, coveredFiles: coveredFiles.filter(file => file !== missing) }]),
  ]) {
    const uncredited = apply(checks);
    assert.equal(uncredited.coverage.gaps.length, rawGapCount);
    assert.deepEqual(uncredited.coverage.projectVerification!.creditedFindingIds, []);
  }
  assert.equal(applyProjectCheckCoverage(matched, { ...proof, checks: [] }).checkUnavailableCount, rawGapCount);

  const withManifest = structuredClone(input);
  withManifest.files.push({ path: 'forge.checks.json', kind: 'other', content: JSON.stringify({ version: 1, checks: [
    { id: 'wire', script: 'checks/wire.py', covers: fact.files.map(file => file.path), coversFacts: [fact.id] },
  ] }) });
  assert.equal(collect(withManifest).fact.id, fact.id, 'Fact identity must not depend on a declaration containing it');
  const changed = structuredClone(input);
  changed.files.find(file => file.path === 'ui/other.lua')!.content += '\n-- newly reviewed writer bytes';
  const changedEvidence = collect(changed);
  assert.equal(changedEvidence.fact.id, fact.id, 'Changing writer bytes must preserve the reviewed selector for the same obligation');
  assert.notEqual(changedEvidence.evidence.sourceHash, evidence.sourceHash);
  assert.notDeepEqual(changedEvidence.fact.files, fact.files);
  assert.deepEqual(applyProjectCheckCoverage(changedEvidence.evidence, proof).coverage.projectVerification!.creditedFindingIds, []);
  const freshProof = { ...proof, checks: [{ ...child, coveredFiles: changedEvidence.fact.files.map(file => ({
    ...file, size: Buffer.byteLength(changed.files.find(candidate => candidate.path === file.path)!.content!),
  })) }] };
  const nextCredit = applyProjectCheckCoverage(changedEvidence.evidence, freshProof);
  assert.deepEqual(nextCredit.coverage.projectVerification!.creditedFindingIds,
    [changedEvidence.findings.find(finding => finding.projectCheckFact?.id === fact.id)!.findingId]);

  const lessScope = { ...input, files: input.files.filter(file => file.path !== 'md/second_reader.xml') };
  assert.notEqual(collect(lessScope).fact.id, fact.id, 'Changing the reader path set must require another declaration');
  const anotherKey = structuredClone(input);
  for (const file of anotherKey.files) {
    if (file.kind === 'md') file.content = file.content?.replaceAll('$ri', '$rj');
    if (file.kind === 'lua') file.content = file.content?.replaceAll('"ri"', '"rj"');
  }
  const renamed = collect(anotherKey);
  assert.notEqual(renamed.fact.id, fact.id, 'Changing the key set must require another declaration');
  assert.deepEqual(renamed.fact.files.map(file => file.path), fact.files.map(file => file.path));
});

const p=project(dynamic), r=validateProjectCrossFile(p);
const diagnostics=r.findings.map(f=>({severity:f.severity,code:f.code,filePath:f.file,message:f.detail}));
const evidence=buildValidationEvidence(p,diagnostics);
check('coverage-not-mod-error',()=>{assert.equal(evidence.modErrorCount,0);assert.equal(evidence.outcome,'incomplete');assert.ok(evidence.findings.some(f=>f.code==='lua_md.emit_verification_gap'&&f.category==='check-unavailable'));});
check('incomplete-deploy-allowed-not-clean',()=>{const d=evaluateFindingAcceptances({evidence,artifactHash:'a'.repeat(64),validatorHash:'b'.repeat(64),corpusHash:'c'.repeat(64),targetHash:'d'.repeat(64)},[],{kind:'agent',id:'fixture',label:'Fixture',scope:'deploy',deployAuthorized:true});assert.equal(d.validationAllowsDeploy,true);assert.equal(d.validationClean,false);assert.equal(d.outcome,'incomplete-checks');});
check('repair-clears-only-gap',()=>assert.equal(analyze(exact).summary.luaEmitUnverified,0));
check('suppression-cannot-hide-coverage',()=>{
  const rules=structuredClone(p);rules.files.push({path:'forge.rules.json',kind:'other',content:JSON.stringify({version:1,suppressions:[{id:'attempt',owner:'lab',reason:'Test only',reviewBy:new Date(Date.now()+30*86400000).toISOString().slice(0,10),code:'lua_md.emit_verification_gap',file:'ui/lab.lua'}]})});
  const result=runProjectValidation(rules);assert.ok(result.evidence!.coverage.gaps.some(g=>g.check==='lua_md.emit_verification_gap'));assert.ok(flattenProjectValidation(result).some(f=>f.code==='lua_md.emit_verification_gap'));
});
check('existing-cross-file-regressions',()=>{const result=runProjectCrossFileSelftest();assert.equal(result.allPassed,true,JSON.stringify(result.checks.filter(c=>!c.pass)));});
console.log(JSON.stringify({pass:true,total:checks.length,checks}));
