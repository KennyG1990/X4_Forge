import { strict as assert } from 'node:assert';
import { simulateXmlDiff } from '../src/lib/diffSimulator';
import {
  isScriptExpressionAttribute,
  lintScriptExpressionValue,
  lintScriptExpressions,
  type MdPitfallFinding,
} from '../src/lib/mdPitfallLints';
import type { SchemaIndex } from '../src/lib/xsdValidate';

const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, run: () => void) {
  try { run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); }
}

const base = '<mdscript><set_value name="$v" exact="0"/><do_if value="true"/></mdscript>';
const exact = '/mdscript/set_value/@exact';
const filePath = 'md/probe.xml';
const replace = (value: string, selector = exact) => `<replace sel="${selector}">${value}</replace>`;
const patch = (...operations: string[]) => `<diff>${operations.join('')}</diff>`;
const simulate = (source: string, delta: string) => simulateXmlDiff(source, delta, { attributeProvenance: true });
function findings(result: ReturnType<typeof simulate>, schema: SchemaIndex | null = null): MdPitfallFinding[] {
  return (result.attributeAssignments ?? []).flatMap(assignment => lintScriptExpressionValue({
    elementName: assignment.elementName,
    attributeName: assignment.attributeName,
    value: assignment.value,
    schema,
    filePath,
    locate: offset => assignment.payload.locate(offset),
  }));
}

/** Test oracle: the actual authored token's raw UTF-16 line/column, independent of DOM parsing. */
function authored(source: string, token: string, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index++) offset = source.indexOf(token, offset + 1);
  assert.ok(offset >= 0, `missing authored token ${token}`);
  const lines = source.slice(0, offset).split(/\r\n?|\n/);
  return { line: lines.length, column: (lines.at(-1) ?? '').length + 1 };
}

function onePositioned(delta: string, code: MdPitfallFinding['code'], token: string, source = base) {
  const result = simulate(source, delta);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(result.attributeAttributionGaps, []);
  const found = findings(result);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].code, code);
  assert.equal(found[0].severity, 'error');
  assert.equal(found[0].filePath, filePath);
  assert.deepEqual({ line: found[0].line, column: found[0].column }, authored(delta, token));
  return { result, finding: found[0] };
}

check('default simulator API has no opt-in attribution fields', () => {
  const delta = patch(replace('$v else 0'));
  const ordinary = simulateXmlDiff(base, delta);
  assert.equal(ordinary.ok, true);
  assert.equal(Object.hasOwn(ordinary, 'attributeAssignments'), false);
  assert.equal(Object.hasOwn(ordinary, 'attributeAttributionGaps'), false);
  const attributed = simulate(base, delta);
  const compatible = Object.fromEntries(Object.entries(attributed)
    .filter(([key]) => key !== 'attributeAssignments' && key !== 'attributeAttributionGaps'));
  assert.deepEqual(compatible, ordinary);
});

check('literal replacement uses the existing orphan-else rule at its original token', () => {
  const { finding } = onePositioned(patch(replace('$v else 0')), 'md.unmatched_else', 'else');
  assert.equal(finding.sourceRef, 'set_value/@exact');
});

check('literal replacement reuses the X4-witnessed mixed-access rule', () => {
  onePositioned(patch(replace('not @$ship.pilot.seed?')), 'expression-null-safe-exists', '@$ship');
});

check('corrected conditional and separate access operands stay clean', () => {
  for (const value of ['if $v? then $v else 0', 'not @$ship.pilot or $ship.pilot.seed?']) {
    const result = simulate(base, patch(replace(value)));
    assert.equal(result.ok, true);
    assert.equal(result.attributeAssignments?.length, 1);
    assert.deepEqual(result.attributeAttributionGaps, []);
    assert.deepEqual(findings(result), []);
  }
});

check('empty literal replacement retains a real final assignment without a grammar finding', () => {
  const result = simulate(base, patch(replace('')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments?.map(value => value.value), ['']);
  assert.deepEqual(result.attributeAttributionGaps, []);
  assert.deepEqual(findings(result), []);
});

check('add type creates a real expression attribute with authored provenance', () => {
  const delta = patch('<add sel="/mdscript/set_value" type="@exact">$v else 0</add>');
  const { result } = onePositioned(delta, 'md.unmatched_else', 'else', '<mdscript><set_value name="$v"/></mdscript>');
  assert.equal(result.attributeAssignments?.[0].attributeName, 'exact');
});

check('add type overwrites an existing Attr and keeps only its last assignment', () => {
  const result = simulate(base, patch(replace('$v else 0'), '<add sel="/mdscript/set_value" type="@exact">1</add>'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments?.map(value => [value.operation, value.value]), [[1, '1']]);
  assert.deepEqual(findings(result), []);
});

check('later replacement removes an earlier invalid assignment', () => {
  const result = simulate(base, patch(replace('$v else 0'), replace('if $v? then $v else 0')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments?.map(value => value.operation), [1]);
  assert.deepEqual(findings(result), []);
});

check('later invalid replacement points to the later authored occurrence', () => {
  const delta = patch(replace('1'), replace('$v else 0'));
  const { result } = onePositioned(delta, 'md.unmatched_else', 'else');
  assert.equal(result.attributeAssignments?.[0].operation, 1);
});

check('removing a written attribute discards its provenance', () => {
  const result = simulate(base, patch(replace('$v else 0'), `<remove sel="${exact}"/>`));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(result.attributeAttributionGaps, []);
  assert.deepEqual(findings(result), []);
});

check('removing the owner subtree discards detached Attr provenance', () => {
  const result = simulate(base, patch(replace('$v else 0'), '<remove sel="/mdscript/set_value"/>'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(findings(result), []);
});

check('replacing the owner subtree does not transfer old Attr provenance to new nodes', () => {
  const result = simulate(base, patch(replace('$v else 0'), '<replace sel="/mdscript/set_value"><set_value name="$v" exact="1"/></replace>'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(findings(result), []);
});

check('remove then add creates a distinct current Attr with its own operation', () => {
  const delta = patch(replace('$v else 0'), `<remove sel="${exact}"/>`, '<add sel="/mdscript/set_value" type="@exact">not @$ship.pilot.seed?</add>');
  const { result } = onePositioned(delta, 'expression-null-safe-exists', '@$ship');
  assert.deepEqual(result.attributeAssignments?.map(value => value.operation), [2]);
});

check('false conditions contribute no assignment or expression finding', () => {
  const result = simulate(base, patch(`<replace sel="${exact}" if="false()">$v else 0</replace>`));
  assert.equal(result.ok, true);
  assert.equal(result.operations[0].applied, false);
  assert.ok(result.findings.some(finding => finding.code === 'DIFF_CONDITION_FALSE'));
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(findings(result), []);
});

check('unmatched selectors retain their warning without inferred assignments', () => {
  const result = simulate(base, patch(replace('$v else 0', '/mdscript/missing/@exact')));
  assert.equal(result.ok, true);
  assert.ok(result.findings.some(finding => finding.code === 'DIFF_SELECTOR_ZERO'));
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(findings(result), []);
});

check('a later selector failure invalidates all earlier successful attribution', () => {
  const result = simulate(base, patch(replace('$v else 0'), replace('1', '//*[')));
  assert.equal(result.ok, false);
  assert.ok(result.operations.some(operation => operation.applied));
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(result.attributeAttributionGaps, []);
  assert.deepEqual(findings(result), []);
});

check('a failed apply also exposes no partial attribution', () => {
  const result = simulate(base, patch(replace('$v else 0'), '<add sel="/mdscript" type="not-an-attribute">1</add>'));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(finding => finding.code === 'DIFF_APPLY_FAILED'));
  assert.deepEqual(result.attributeAssignments, []);
  assert.deepEqual(result.attributeAttributionGaps, []);
});

check('malformed base or patch opts into empty attribution rather than fabricated output', () => {
  for (const [source, delta] of [[base, '<diff><replace>'], ['<mdscript></wrong>', patch(replace('$v else 0'))]]) {
    const result = simulate(source, delta);
    assert.equal(result.ok, false);
    assert.deepEqual(result.attributeAssignments, []);
    assert.deepEqual(result.attributeAttributionGaps, []);
  }
});

check('equivalent multimatches share one original payload mapping', () => {
  const source = '<mdscript><set_value exact="0"/><set_value exact="1"/></mdscript>';
  const delta = patch(replace('$v else 0'));
  const result = simulate(source, delta);
  assert.equal(result.ok, true);
  const assignments = result.attributeAssignments;
  assert.ok(assignments);
  assert.equal(assignments.length, 2);
  const [first, second] = assignments;
  assert.equal(first.operation, second.operation);
  assert.equal(first.payload, second.payload, 'mapping must be shared rather than copied per target');
  assert.deepEqual(first.payload.locate(3), authored(delta, 'else'));
  assert.deepEqual(second.payload.locate(3), authored(delta, 'else'));
});

check('one operation selecting distinct expression roles preserves both actual roles', () => {
  const result = simulate(base, patch(replace('$v else 0', '/mdscript/set_value/@exact | /mdscript/do_if/@value')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.attributeAssignments?.map(value => `${value.elementName}/@${value.attributeName}`).sort(), ['do_if/@value', 'set_value/@exact']);
  assert.deepEqual(findings(result).map(value => value.sourceRef).sort(), ['do_if/@value', 'set_value/@exact']);
});

check('same-line authored operations remain separate original occurrences', () => {
  const delta = patch(replace('$v else 0'), replace('$v else 0', '/mdscript/do_if/@value'));
  const result = simulate(base, delta);
  const found = findings(result);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map(value => ({ line: value.line, column: value.column })), [authored(delta, 'else'), authored(delta, 'else', 1)]);
  assert.notEqual(found[0].column, found[1].column);
});

check('non-expression attribute text is not promoted by selector spelling', () => {
  const result = simulate(base, patch(replace('$v else 0', '/mdscript/set_value/@name')));
  assert.equal(result.ok, true);
  assert.equal(result.attributeAssignments?.[0].attributeName, 'name');
  assert.deepEqual(findings(result), []);
  assert.equal(isScriptExpressionAttribute('set_value', 'name', null), false);
});

check('untouched malformed base expressions are not blamed on this patch', () => {
  const source = '<mdscript><set_value exact="$v else 0"/><do_if value="true"/></mdscript>';
  const result = simulate(source, patch('<add sel="/mdscript" type="@name">probe</add>'));
  assert.equal(result.ok, true);
  assert.deepEqual(findings(result), []);
});

const schema: SchemaIndex = { loaded: true, sourceFiles: [], elementCount: 1, elements: new Map([['custom', {
  attributes: new Map([['value', { required: false, type: 'xs:expression' }], ['literal', { required: false, type: 'xs:string' }]]),
  openAttributes: false, resolved: true, children: new Set<string>(), childSpecs: new Map(), openChildren: false, particles: [],
}]]) };
check('schema-declared expression roles share the same positioned grammar', () => {
  const delta = patch(replace('$v else 0', '/mdscript/custom/@value'));
  const result = simulate('<mdscript><custom value="0" literal="0"/></mdscript>', delta);
  assert.equal(result.ok, true);
  assert.equal(isScriptExpressionAttribute('custom', 'value', schema), true);
  assert.equal(isScriptExpressionAttribute('custom', 'literal', schema), false);
  const found = findings(result, schema);
  assert.equal(found.length, 1);
  assert.equal(found[0].sourceRef, 'custom/@value');
  assert.deepEqual({ line: found[0].line, column: found[0].column }, authored(delta, 'else'));
});

check('a named entity before the token does not shift original coordinates', () => {
  onePositioned(patch(replace("'&amp;' + $v else 0")), 'md.unmatched_else', 'else');
});

check('a numeric entity inside the token maps to the authored entity start', () => {
  onePositioned(patch(replace('$v &#101;lse 0')), 'md.unmatched_else', '&#101;');
});

check('encoded access operators map back through original numeric entities', () => {
  onePositioned(patch(replace('not &#64;$ship.pilot.seed&#63;')), 'expression-null-safe-exists', '&#64;');
});

check('CDATA preserves literal text and locates the real keyword', () => {
  onePositioned(patch(replace('<![CDATA[$v else 0]]>')), 'md.unmatched_else', 'else');
});

check('CDATA literal entity-looking text remains literal, not recursively decoded', () => {
  onePositioned(patch(replace("<![CDATA['&#64;' + $v else 0]]>")), 'md.unmatched_else', 'else');
});

check('descendant payload text and split CDATA produce one original token', () => {
  const delta = patch(replace('<part>$v </part><![CDATA[else]]> 0'));
  onePositioned(delta, 'md.unmatched_else', 'else');
});

check('comments and processing instructions do not fabricate operation positions', () => {
  const delta = '<diff><!-- <replace sel="bad">else</replace> --><?probe ignored?>'
    + replace('$v else 0') + '</diff>';
  const result = simulate(base, delta);
  assert.equal(result.ok, true);
  const found = findings(result);
  assert.equal(found.length, 1);
  assert.deepEqual({ line: found[0].line, column: found[0].column }, authored(delta, 'else', 1));
});

check('comment text inside the payload contributes no expression characters', () => {
  onePositioned(patch(replace('$v <!-- else -->else 0')), 'md.unmatched_else', 'else 0');
});

check('CRLF and lone CR retain original raw authored coordinates', () => {
  for (const newline of ['\r\n', '\r']) {
    const delta = `<diff>${newline}${replace(`$v${newline}else 0`)}${newline}</diff>`;
    onePositioned(delta, 'md.unmatched_else', 'else');
  }
});

check('BOM and astral UTF-16 source widths do not shift the token', () => {
  const delta = '\uFEFF<diff>\r\n<!-- 🚀 decoy -->' + replace("'🚀' + $v else 0") + '</diff>';
  onePositioned(delta, 'md.unmatched_else', 'else');
});

check('astral numeric references preserve decoded width but authored column', () => {
  onePositioned(patch(replace("'&#x1f680;' + $v else 0")), 'md.unmatched_else', 'else');
});

check('literal NEL and Unicode separators map through XML newline normalization', () => {
  for (const newline of ['\u0085', '\u2028', '\u2029', '\r\u0085']) {
    onePositioned(patch(replace(`$v${newline}else 0`)), 'md.unmatched_else', 'else');
  }
});

check('entity-derived CR followed by LF is mapped after the serializer round trip', () => {
  const delta = patch(replace('$v&#13;\nelse 0'));
  const { result } = onePositioned(delta, 'md.unmatched_else', 'else');
  assert.equal(result.attributeAssignments?.[0].value, '$v\nelse 0');
});

check('multiple entity-derived newline contractions preserve the later token', () => {
  onePositioned(patch(replace('$v&#13;&#10;&#13;&#x85;else 0')), 'md.unmatched_else', 'else');
});

check('unknown custom expansion never fabricates a positioned assignment', () => {
  const delta = '<!DOCTYPE diff [<!ENTITY custom "$v else 0">]><diff>' + replace('&custom;') + '</diff>';
  const result = simulate(base, delta);
  if (result.ok) {
    assert.equal(result.attributeAssignments?.length, 0);
    assert.ok(result.attributeAttributionGaps?.some(gap => gap.operation === 0 && gap.elementName === 'set_value' && gap.attributeName === 'exact'));
  } else {
    assert.deepEqual(result.attributeAssignments, []);
    assert.deepEqual(result.attributeAttributionGaps, []);
  }
  assert.deepEqual(findings(result), []);
});

check('original direct-attribute checking remains positioned and compatible', () => {
  const source = '<mdscript>\n<set_value exact="$v else 0"/>\n<do_if value="not @$ship.pilot.seed?"/>\n</mdscript>';
  const found = lintScriptExpressions(source, null, filePath);
  assert.deepEqual(found.map(value => value.code), ['md.unmatched_else', 'expression-null-safe-exists']);
  assert.deepEqual(found.map(value => ({ line: value.line, column: value.column })), [authored(source, 'else'), authored(source, '@$ship')]);
  assert.ok(found.every(value => value.filePath === filePath));
});

const passed = checks.filter(value => value.pass).length;
const pass = passed === checks.length;
console.log(JSON.stringify({ pass, passed, total: checks.length, checks }, null, 2));
if (!pass) process.exitCode = 1;
