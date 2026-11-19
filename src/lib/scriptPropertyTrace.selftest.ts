import assert from 'node:assert/strict';
import { buildScriptPropertyIndex, traceScriptPropertyExpression } from './scriptProperties';

const index = buildScriptPropertyIndex(`
<scriptproperties>
  <keyword name="player">
    <property name="ship" type="ship"/>
    <property name="setting" type="string"/>
    <property name="setting.id" type="sector"/>
    <property name="opaque" type="enginevalue"/>
    <property name="untyped"/>
  </keyword>
  <keyword name="ware"><import><property name="id" type="ware"/></import></keyword>
  <datatype name="ship" type="component">
    <property name="sector" type="sector"/>
    <property name="conflict" type="string"/>
    <property name="conflict" type="sector"/>
    <property name="controlentity.default" type="entity"/>
    <property name="controlentity.{$controlpost}" type="entity"/>
    <property name="selected" type="sector"/>
    <property name="selected.{$key}" type="entity"/>
  </datatype>
  <datatype name="component"><property name="exists" type="boolean"/></datatype>
  <datatype name="sector"><property name="name" type="string"/></datatype>
  <datatype name="string"><property name="id" type="string"/></datatype>
  <datatype name="entity"/>
  <datatype name="ware"/>
</scriptproperties>
`);
const trace = (expression: string, variableTypes?: Record<string, string>) =>
  traceScriptPropertyExpression(expression, index, { variableTypes });

assert.deepEqual(trace(' \r\n player.ship.sector '), {
  status: 'resolved',
  resultType: 'sector',
  steps: [
    { segment: 'player', start: 0, end: 6, kind: 'keyword', confidence: 'declared' },
    { segment: 'ship', start: 7, end: 11, kind: 'property', confidence: 'declared', owner: 'player', property: 'ship', inherited: false, datatype: 'ship' },
    { segment: 'sector', start: 12, end: 18, kind: 'property', confidence: 'declared', owner: 'ship', property: 'sector', inherited: false, datatype: 'sector' },
  ],
});

const inherited = trace('$target.exists', { '$TARGET': 'SHIP', TaRGeT: 'ship' });
assert.equal(inherited.resultType, 'boolean');
assert.deepEqual(inherited.steps.map(step => [step.confidence, step.datatype]), [['hint', 'ship'], ['hint', 'boolean']]);
assert.equal(inherited.steps[1].owner, 'component');
assert.equal(inherited.steps[1].inherited, true);
assert.deepEqual(trace('$target.sector', { '$TARGET': 'ship', TaRGeT: 'sector' }), {
  status: 'ambiguous',
  steps: [{ segment: '$target', start: 0, end: 7, kind: 'variable', confidence: 'unestablished' }],
});
const hiddenHint = Object.defineProperty({}, 'target', { value: 'ship', enumerable: false });
assert.equal(trace('$target.sector', hiddenHint).status, 'unknown-receiver');

const contextFree = ['$ship.sector', '$unknown.sector', 'unknown.sector', '$constructor.sector'];
for (const expression of contextFree) {
  const result = trace(expression, Object.create({ '$ship': 'ship', '$unknown': 'ship' }));
  assert.equal(result.status, 'unknown-receiver');
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].confidence, 'unestablished');
  assert.equal(result.resultType, undefined);
}
assert.equal(trace('$target.sector', { '$target': 'unindexed' }).status, 'unknown-receiver');

const typo = trace('player.ship.sectro');
assert.equal(typo.status, 'unknown-property');
assert.deepEqual(typo.steps.map(step => [step.segment, step.start, step.confidence]), [
  ['player', 0, 'declared'], ['ship', 7, 'declared'], ['sectro', 12, 'unestablished'],
]);
assert.equal(typo.resultType, undefined);

const opaque = trace('player.opaque.sector');
assert.equal(opaque.status, 'unknown-receiver');
assert.equal(opaque.steps[1].datatype, 'enginevalue');
assert.equal(opaque.steps[2].confidence, 'unestablished');
assert.equal(opaque.resultType, undefined);
assert.equal(trace('player.untyped').status, 'unknown-receiver');

const continuation = trace('player.ship.controlentity.default');
assert.equal(continuation.status, 'resolved');
assert.equal(continuation.steps[2].property, 'controlentity.default');
assert.equal(continuation.steps[2].datatype, undefined);
assert.equal(continuation.steps[3].datatype, 'entity');
assert.equal(trace('player.ship.controlentity').status, 'unsupported');
assert.equal(trace('player.ship.selected').resultType, 'sector');
assert.equal(trace('player.ship.selected.name').status, 'unsupported');

for (const expression of ['player.ship.conflict', 'player.setting.id']) {
  const result = trace(expression);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.resultType, undefined);
}
for (const expression of ['ware.energycells.name', 'player.ship.{$key}.name', 'player.ship.sector?',
  '@player.ship', 'player.ship + 1', "'player.ship'", 'player.ship.', 'player.ship..sector']) {
  const result = trace(expression);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.resultType, undefined);
}
assert.equal(trace('player' + '.ship'.repeat(32)).status, 'limit');
assert.equal(traceScriptPropertyExpression('player.ship', null).status, 'unavailable');
console.log(JSON.stringify({ pass: true, suite: 'script property trace' }));
