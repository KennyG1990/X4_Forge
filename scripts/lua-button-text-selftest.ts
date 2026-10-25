import { buildX4UiCallModel } from '../src/lib/x4UiCallModel';
import { lintX4UiCallModel } from '../src/lib/x4UiLint';
import { analyzeLuaFiles } from '../src/lib/luaStaticAnalysis';

const code = 'x4-ui.button-text-complex-property';
const head = `local menu = { name = 'Lab', layer = 1 }
local frame = Helper.createFrameHandle(menu, { width = 100, height = 100 })
local tab = frame:addTable(2, { width = 100 })
local row = tab:addRow(nil, { height = 20 })
`;
const cases: Array<[string, string, number]> = [
  ['string', `row[1]:createButton({ text = 'label' })`, 1],
  ['text2_number', `row[1]:createButton({ text2 = 42 })`, 1],
  ['boolean', `row[1]:createButton({ text = false })`, 1],
  ['both', `row[1]:createButton({ text = 'one', text2 = 'two' })`, 2],
  ['alias', `local opts = { text = 'label' }; row[1]:createButton(opts)`, 1],
  ['bracket_key', `row[1]:createButton({ ['text'] = 'label' })`, 1],
  ['setter', `row[1]:createButton({ active = true }):setText('label'):setText2('other')`, 0],
  ['nil', `row[1]:createButton({ text = nil })`, 0],
  ['table', `row[1]:createButton({ text = { text = 'label' } })`, 0],
  ['dynamic', `row[1]:createButton({ text = menu.runtimeText })`, 0],
  ['case_sensitive', `row[1]:createButton({ Text = 'label' })`, 0],
  ['comment', `-- row[1]:createButton({ text = 'label' })`, 0],
  ['string_example', `local example = [[row[1]:createButton({ text = 'label' })]]`, 0],
  ['unrelated_receiver', `local fake = {}; fake:createButton({ text = 'label' })`, 0],
  ['shadowed_helper', `local Helper = {}; local f = Helper.createFrameHandle(menu, {}); local t = f:addTable(2); local r = t:addRow(); r[1]:createButton({ text = 'label' })`, 0],
  ['unreachable', `if false then row[1]:createButton({ text = 'label' }) end`, 0],
  ['mutated', `local opts = { text = 'label' }; opts.text = nil; row[1]:createButton(opts)`, 0],
  ['escaped', `local opts = { text = 'label' }; unknownMutator(opts); row[1]:createButton(opts)`, 0],
  ['large_tail', '-- ordinary source padding\n'.repeat(24000) + `row[1]:createButton({ text = 'tail' })`, 1],
  ['after_gap_cap', Array.from({length:180}, (_, i) => `local gap${i} = Helper.createFrameHandle(menu, { width = unknown${i} })`).join('\n') + `\nrow[1]:createButton({ text = 'tail' })`, 1],
];
const checks: Array<{name: string; pass: boolean; detail?: unknown}> = [];
for (const [name, body, expected] of cases) {
  const text = head + body;
  const model = buildX4UiCallModel({ rel:'ui/lab.lua', text });
  const result = lintX4UiCallModel(model);
  const findings = result.findings.filter(f => f.code === code);
  checks.push({ name, pass: findings.length === expected, detail: { expected, found: findings.length, gapCount:result.verificationGapCount } });
  if (expected) checks.push({ name:name+'_source_and_guidance', pass: findings.length === expected && findings.every(f => f.severity === 'error' && f.location.file === 'ui/lab.lua' && f.nextAction.includes(':setText') && text.slice(f.location.start.offset, f.location.end.offset).length > 0) });
  if (name === 'large_tail') checks.push({name:'large_tail_location', pass:findings.length === 1 && findings[0].location.start.offset > 560000});
  if (name === 'after_gap_cap') checks.push({name:'gap_cap_remains_honest', pass:result.hasTruncatedEvidence && !result.isStaticallyVerified});
  if (['dynamic','escaped'].includes(name)) checks.push({name:name+'_not_claimed_verified',pass:!result.isStaticallyVerified});
  if (name === 'string') {
    const integrated = analyzeLuaFiles([{ rel:'ui/lab.lua', text, source:'loose', sourcePath:'fixture/ui/lab.lua', extension:{folder:'forge_regression_lab',id:'forge_regression_lab'} }]);
    checks.push({name:'lua_analyzer_flattens_error',pass:integrated.findings.some(f=>f.code===code && f.severity==='error' && f.line===5)});
  }
}
console.log(JSON.stringify({pass:checks.every(c=>c.pass),total:checks.length,passed:checks.filter(c=>c.pass).length,checks},null,2));
if (checks.some(c=>!c.pass)) process.exitCode=1;
