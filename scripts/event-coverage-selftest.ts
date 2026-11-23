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


const protectedProbe = 'pcall(AddUITriggeredEvent, "ForgeLab", "probe", p)';
check('protected-global-emitter-uses-forwarded-screen-and-control', () => {
  const sent = analyze(protectedProbe);
  assert.equal(sent.mdLua.emitCoverage.exact, 1);
  assert.equal(sent.mdLua.emitCoverage.scope, 'direct-and-pcall-global-AddUITriggeredEvent-calls');
  assert.deepEqual(sent.mdLua.emitted.map(event => [event.namespace, event.control]), [['ForgeLab', 'probe']]);
  assert.deepEqual(listenerErrors(sent), []);
  assert.deepEqual(listenerErrors(analyze(protectedProbe.replace('"probe"', '"absent"'))), [['ForgeLab.absent', 'error']]);
  const dynamicControl = analyze(protectedProbe.replace('"probe"', 'nextControl()'));
  assert.equal(dynamicControl.mdLua.emitCoverage.unresolved, 1);
  assert.ok(dynamicControl.mdLua.emitCoverage.files.find(file => file.file === 'ui/lab.lua')?.reasons.includes('dynamic-arguments'));
});

check('rebound-protected-callee-does-not-prove-an-event', () => {
  for (const rebind of [
    'local pcall = invoke;',
    'pcall = invoke;',
    '_G["pcall"] = invoke;',
    'rawset(_G, "pcall", invoke);',
    '_G[dynamicName] = invoke;',
    'rawset(_G, dynamicName, invoke);',
    'setfenv(1, env);',
    'function _G.pcall(...) return invoke(...) end;',
    '_G.AddUITriggeredEvent = invoke;',
  ]) {
    const result = analyze(`${rebind} ${protectedProbe}`);
    assert.equal(result.mdLua.emitted.length, 0, rebind);
    assert.equal(result.mdLua.emitCoverage.unresolved, 1, rebind);
    assert.ok(result.mdLua.emitCoverage.files.find(file => file.file === 'ui/lab.lua')?.reasons.includes('ambiguous-callee'), rebind);
  }
  assert.deepEqual(analyze('local AddUITriggeredEvent = invoke; ' + protectedProbe).mdLua.emitted, []);
  assert.equal(analyze('local _G = {}; _G.pcall = invoke; ' + protectedProbe).mdLua.emitCoverage.exact, 1);
  assert.deepEqual(analyze('pcall(function() return p end)').mdLua.emitted, []);
});

check('protected-emitter-proves-only-an-owned-exact-indexed-write', () => {
  const table = 'local p = {n = 1};';
  const write = 'p["po" .. p.n] = "order";';
  const send = protectedProbe.replace('"probe"', '"on"');
  const authored = `${table} ${write} ${send}`;
  const listeners: [string, string][] = [['ForgeLab', 'on']];
  const checkPayload = (lua: string) => finiteCase(lua, listeners, true).findings.filter(finding => finding.code.startsWith('md_lua.payload_'));
  assert.deepEqual(checkPayload(authored), []);
  const input = project(authored);
  input.files.push({ path: 'md/orders.xml', kind: 'md', content: `<mdscript name="Orders"><cues><cue name="OnOrder">
    <conditions><event_ui_triggered screen="'ForgeLab'" control="'on'"/></conditions>
    <actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions>
  </cue></cues></mdscript>` });
  const validated = runProjectValidation(input);
  assert.ok(!flattenProjectValidation(validated).some(finding => finding.code.startsWith('md_lua.payload_')));
  assert.ok(!validated.evidence?.coverage.gaps.some(gap => gap.check === 'md_lua.payload_writer_unverified'));
  const wrong = checkPayload(authored.replace('"on"', '"other"'));
  assert.equal(wrong[0]?.code, 'md_lua.payload_missing_writer');
  assert.equal(wrong[0]?.severity, 'error');
  for (const unproved of [
    `${table} ${write} p["po" .. p.n] = nil; ${send}`,
    `${table} ${write} local alias = p; alias["po" .. alias.n] = nil; ${send}`,
    `${table} p["po" .. p.n] = ${send}`,
    `${table} ${write} ${send.replace(', p)', ', p, mutate(p))')}`,
    `${table} ${write} local function send() ${send} end`,
    `${table} ${write} p = {}; ${send}`,
    `${table} ${write} ${send.replace('"on"', 'nextControl()')}`,
    `${table} ${write} pcall = invoke; ${send}`,
  ]) {
    const findings = checkPayload(unproved);
    assert.equal(findings[0]?.code, 'md_lua.payload_writer_unverified', unproved);
    assert.equal(findings[0]?.severity, 'info', unproved);
  }
});


const returnedOrders = `OrderTools = OrderTools or {}
function OrderTools.Build(rows)
  local p = { n = 0 }
  for _, row in ipairs(rows) do
    p.n = p.n + 1
    local alias = p
    alias["po" .. alias.n] = row.order
  end
  return p
end
local function send(rows)
  local p = OrderTools.Build(rows)
  if p.n > 0 then
    p.flag = true
    pcall(function() AddUITriggeredEvent("ForgeLab", "on", p) end)
  end
end`;

check('protected-callback-sends-the-indexed-builder-return', () => {
  const result = finiteCase(returnedOrders, [['ForgeLab', 'on']], true);
  assert.equal(result.mdLua.emitCoverage.exact, 1);
  assert.deepEqual(result.findings.filter(finding => finding.code.startsWith('md_lua.payload_')), []);
});

check('returned-table-proof-refuses-unresolved-ownership-and-clears', () => {
  for (const variant of [
    returnedOrders + '\nOrderTools.Build = replacement',
    returnedOrders + '\nOrderTools = {}',
    returnedOrders.replace('  local p = OrderTools.Build', '  local OrderTools = foreign; local p = OrderTools.Build'),
    returnedOrders.replace('  return p', '  return {}, p'),
    returnedOrders.replace('  return p', '  unknown(p); return p'),
    returnedOrders.replace('  return p', '  p["po" .. p.n] = nil; return p'),
    returnedOrders.replace('    p.flag = true', '    p.po1 = nil'),
    returnedOrders.replace('    p.flag = true', '    p[unknown] = nil'),
    returnedOrders.replace('    p.flag = true', '    mutate(p)'),
    returnedOrders.replace('  local p = OrderTools.Build', '  local pcall = foreign; local p = OrderTools.Build'),
    returnedOrders.replace('function() AddUITriggeredEvent', 'function() local p = {}; AddUITriggeredEvent'),
    returnedOrders.replace('    alias["po" .. alias.n] = row.order', '    if false then alias["po" .. alias.n] = row.order end'),
    returnedOrders.replace('  for _, row in ipairs(rows) do', '  while false do'),
    returnedOrders.replace('  for _, row in ipairs(rows) do', '  for i = 2, 1 do'),
  ]) {
    const findings = finiteCase(variant, [['ForgeLab', 'on']], true).findings;
    assert.ok(findings.some(finding => finding.code === 'md_lua.payload_writer_unverified'), variant);
  }
  const input = project(returnedOrders);
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', `<cue name="Returned"><conditions>
    <event_ui_triggered screen="'ForgeLab'" control="'on'"/>
  </conditions><actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions></cue></cues>`);
  const full = runProjectValidation(input);
  assert.ok(!flattenProjectValidation(full).some(finding => finding.code.startsWith('md_lua.payload_')));
  assert.ok(!full.evidence?.coverage.gaps.some(gap => gap.check === 'md_lua.payload_writer_unverified'));
  input.files.push({ path: 'ui/initialize_builder.lua', kind: 'lua', content: 'local alias = rawget(_G, "OrderTools") or {}; OrderTools = alias' });
  assert.ok(!validateProjectCrossFile(input).findings.some(finding => finding.code === 'md_lua.payload_writer_unverified'));
  for (const content of ['local alias = OrderTools; alias["Build"] = replacement', 'rawget = replacement',
    'local alias = rawget(_G, "OrderTools") or {}; alias[dynamicField] = replacement', 'rawset(_G, "OrderTools", replacement)',
    'AddUITriggeredEvent = decorate(AddUITriggeredEvent)', 'function AddUITriggeredEvent() end', 'function pcall() end']) {
    const changed = { ...input, files: [...input.files, { path: 'ui/replace_builder.lua', kind: 'lua' as const, content }] };
    const finding = validateProjectCrossFile(changed).findings.find(item => item.code === 'md_lua.payload_writer_unverified');
    assert.ok(finding, content);
    assert.match(finding.detail, /A returned table is passed to an authored callback/);
    assert.match(finding.detail, /AddUITriggeredEvent|^function pcall/.test(content) ? /event forwarding/ : /the builder binding/);
  }
});

check('finite-registry-member-wrap-verification', () => {
  const input = project(returnedOrders);
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', `<cue name="ReturnedRegistry"><conditions>
    <event_ui_triggered screen="'ForgeLab'" control="'on'"/>
  </conditions><actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions></cue></cues>`);

  const safeHealthLua = `local T = rawget(_G, "OrderTools") or {}
OrderTools = T
T.HOOKS = {
  { "noop", "misc", every = 60 },
  { "tick", "ops", lua = "Tick", every = 5 },
}
function T.Tick() return 1 end
function T.Every(e) return type(e) == "table" and tonumber(e.every) or nil end
function T.Inspect(expect)
  local seen = {}
  for _, e in ipairs(expect or T.HOOKS) do
    if e[1] then seen[e[1]] = true end
  end
  return seen
end
for _, e in ipairs(T.HOOKS) do
  local fname = e.lua
  local orig = fname and T[fname]
  if type(orig) == "function" then
    T[fname] = function(...) return orig(...) end
  end
end`;
  const safeUiConsumerLua = `OrderTools = OrderTools or {}
function OrderTools.BoardRows(expect)
  local out = {}
  for _, e in ipairs(type(expect) == "table" and expect or {}) do
    out[#out + 1] = OrderTools.Every(e)
  end
  return out
end
local _rows = OrderTools.BoardRows(OrderTools.HOOKS)`;

  const verifiedProject = {
    ...input,
    files: [
      ...input.files,
      { path: 'ui/safe_health.lua', kind: 'lua' as const, content: safeHealthLua },
      { path: 'ui/safe_board.lua', kind: 'lua' as const, content: safeUiConsumerLua },
    ],
  };
  assert.ok(!validateProjectCrossFile(verifiedProject).findings.some(f => f.code === 'md_lua.payload_writer_unverified'));

  const negativeCases = [
    safeHealthLua.replace('{ "tick", "ops", lua = "Tick", every = 5 }', '{ "tick", "ops", lua = "Build", every = 5 }'),
    safeHealthLua.replace('{ "tick", "ops", lua = "Tick", every = 5 }', '{ "tick", "ops", lua = dynamicName(), every = 5 }'),
    safeHealthLua.replace('if type(orig) == "function" then', 'fname = dynamicTarget()\n  if type(orig) == "function" then'),
    safeHealthLua + '\ntable.insert(T.HOOKS, { "bad", "ops", lua = "Build" })',
    safeHealthLua + '\nfunction T.Sneak(expect) expect[1].lua = "Build" end\nlocal _x = T.Sneak(T.HOOKS)',
  ];
  for (const lua of negativeCases) {
    const negProject = {
      ...input,
      files: [...input.files, { path: 'ui/bad_health.lua', kind: 'lua' as const, content: lua }],
    };
    const finding = validateProjectCrossFile(negProject).findings.find(item => item.code === 'md_lua.payload_writer_unverified');
    assert.ok(finding, lua);
    assert.match(finding.detail, /the builder binding/);
  }
});

check('emitter-forwarding-wrapper-verification', () => {
  const input = project(returnedOrders);
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', `<cue name="ReturnedWrapped"><conditions>
    <event_ui_triggered screen="'ForgeLab'" control="'on'"/>
  </conditions><actions><set_value name="$order" exact="event.param3.{'$po' + $si}"/></actions></cue></cues>`);

  const utf8StyleWrapper = `local T = OrderTools
local concat = table.concat
function T.CleanStr(s)
  if type(s) ~= "string" then return s end
  local out = { s }
  return concat(out)
end
function T.CleanParam(p, depth)
  if type(p) == "string" then local c = T.CleanStr(p); return c, 1 end
  if type(p) ~= "table" or (depth or 0) > 3 then return p, 0 end
  local fixed = 0
  for k, v in pairs(p) do
    if type(v) == "string" or type(v) == "table" then
      local c, f = T.CleanParam(v, (depth or 0) + 1)
      if f > 0 then p[k] = c; fixed = fixed + 1 end
    end
  end
  return p, fixed
end
if type(AddUITriggeredEvent) == "function" then
  local orig = AddUITriggeredEvent
  AddUITriggeredEvent = function(screen, control, param, ...)
    if screen == "ForgeLab" and param ~= nil then
      local ok, c, f = pcall(T.CleanParam, param)
      if ok then
        param = c
        if f > 0 then local _n = f end
      end
    end
    return orig(screen, control, param, ...)
  end
end`;

  const plaintextStyleWrapper = `OrderTools = OrderTools or {}
function OrderTools.FoldOther(s) return tostring(s or "") end
function OrderTools.WrapOther(add)
  return function(screen, control, param, ...)
    if screen == "ForgeLab" and control == "other_msg" and type(param) == "table" then
      param.body = OrderTools.FoldOther(param.body)
    elseif screen == "ForgeLab" and control == "bulletin" and type(param) == "table" then
      for k, v in pairs(param) do
        if type(k) == "string" and type(v) == "string" then param[k] = OrderTools.FoldOther(v) end
      end
    end
    return add(screen, control, param, ...)
  end
end
if AddUITriggeredEvent then
  AddUITriggeredEvent = OrderTools.WrapOther(AddUITriggeredEvent)
end`;

  const combinedPositive = {
    ...input,
    files: [
      ...input.files,
      { path: 'ui/wrap_utf8.lua', kind: 'lua' as const, content: utf8StyleWrapper },
      { path: 'ui/wrap_plain.lua', kind: 'lua' as const, content: plaintextStyleWrapper },
    ],
  };
  assert.ok(!validateProjectCrossFile(combinedPositive).findings.some(f => f.code === 'md_lua.payload_writer_unverified'));

  const negativeWrappers = [
    utf8StyleWrapper.replace('if screen == "ForgeLab" and param ~= nil then', 'if control == "other" then return end\n    if screen == "ForgeLab" and param ~= nil then'),
    utf8StyleWrapper.replace('return orig(screen, control, param, ...)', 'control = "hijack"\n    return orig(screen, control, param, ...)'),
    utf8StyleWrapper.replace('if ok then', 'param = {}\n      if ok then'),
    utf8StyleWrapper.replace('p[k] = c', 'p.po1 = nil; p[k] = c'),
    utf8StyleWrapper.replace('return concat(out)', 'return nil'),
    utf8StyleWrapper.replace('local concat = table.concat', 'local concat = unknownFn'),
    plaintextStyleWrapper.replace('control == "other_msg"', 'control == "on"'),
    utf8StyleWrapper + '\nAddUITriggeredEvent = decorate(AddUITriggeredEvent)',
  ];
  for (const lua of negativeWrappers) {
    const neg = {
      ...input,
      files: [...input.files, { path: 'ui/bad_wrap.lua', kind: 'lua' as const, content: lua }],
    };
    const finding = validateProjectCrossFile(neg).findings.find(item => item.code === 'md_lua.payload_writer_unverified');
    assert.ok(finding, lua);
    assert.match(finding.detail, /event forwarding/);
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

check('payload-writer-explanation-is-independent-of-candidate-file-order', () => {
  const input = project([
    'local pack = { n = 1 }',
    'local i = pack.n',
    'pack["ri" .. i] = "risk"',
    'pack["po" .. i] = "priority"',
  ].join('\n'));
  input.files.push({ path: 'ui/build_payload.lua', kind: 'lua', content: [
    'local pack = { n = 1 }',
    'pack["ri" .. pack.n] = "risk"',
    'return pack',
  ].join('\n') });
  const reader = input.files.find(file => file.path === 'md/forge_regression_lab.xml')!;
  reader.content = reader.content!.replace('</cues>', `<cue name="PayloadExplanation"><conditions>
    <event_ui_triggered screen="'ForgeLab'" control="'probe'"/>
  </conditions><actions>
    <set_value name="$risk" exact="event.param3.{'$ri' + $si}"/>
    <set_value name="$priority" exact="event.param3.{'$po' + $si}"/>
  </actions></cue></cues>`);
  const diagnose = (files: ExtensionProject['files'], keys = ['po', 'ri']) => {
    const variant = { ...input, files };
    const finding = validateProjectCrossFile(variant).findings.find(item => item.code === payloadUnavailable)!;
    const fact = runProjectValidation(variant).evidence!.findings.find(item => item.code === payloadUnavailable)!.projectCheckFact;
    assert.deepEqual(finding.payloadWriterScope?.keys, keys);
    assert.equal(finding.target, undefined);
    assert.ok(fact);
    return { detail: finding.detail, fact };
  };
  const oneKey = input.files.map(file => file === reader
    ? { ...file, content: file.content!.replace(/^.*name="\$priority".*$/m, '') } : file);
  assert.deepEqual(diagnose(oneKey, ['ri']), diagnose([...oneKey].reverse(), ['ri']));
  const forward = diagnose(input.files);
  assert.deepEqual(diagnose([...input.files].reverse()), forward);
  assert.match(forward.detail, /Only local-index assignments were found for 1 of these 2 keys/);
  assert.match(forward.detail, /Indexed keys \(2\): po, ri/);
});
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
