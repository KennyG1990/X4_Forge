/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AISCRIPT order-param lint — ROADMAP AAR item #1 (x4_ai_influence in-game verification,
 * 2026-07-01): the game found 4 REAL order-param errors in
 * `order.aic.opord.protectposition.xml` that the Forge never checked, because
 * project/validate had no aiscript path. The two game-truth rules (beyond the XSD):
 *
 *   1. `type="text"` is NOT a legal order-param type. The legal set comes from
 *      aiscripts.xsd `orderparamlookup` (probed from the unpacked 9.00 data):
 *      internal, bool, number, length, time, money, object, space, position, ware,
 *      trade, build, formationshape. (The XSD wiring also catches this via enum
 *      violation when the aiscripts schema index is available — this lint carries a
 *      curated fallback so the check works even without the schema.)
 *   2. Non-internal order params need a `text` attribute (the localised UI label).
 *      The XSD marks `text` optional, but the game rejects a UI-facing param without
 *      it — vanilla confirms: every non-internal param has text; internal params
 *      may omit it (move.flee.xml `subordinateorders`).
 *
 * House pattern: pure engine (no fs/network) + oracle + public GET selftest.
 * XML parsing: xmldom (nested <aiscript><order><params><param><input_param…>).
 */

import { DOMParser, type Element } from '@xmldom/xmldom';

/** orderparamlookup from aiscripts.xsd (unpacked 9.00) — curated fallback set. */
export const ORDER_PARAM_TYPES = new Set([
  'internal', 'bool', 'number', 'length', 'time', 'money', 'object', 'space',
  'position', 'ware', 'trade', 'build', 'formationshape',
]);

export interface AiscriptLintFinding {
  code: 'aiscript.order_param_missing_type' | 'aiscript.order_param_illegal_type' | 'aiscript.order_param_missing_text' | 'aiscript.not_aiscript'
    | 'aiscript.label_duplicate' | 'aiscript.resume_label_unresolved';
  severity: 'error' | 'warning';
  order?: string;
  param?: string;
  sourceRef?: string;
  line?: number;
  column?: number;
  detail: string;
}

function parseAiscript(xml: string): { root: Element; recovered: boolean } | undefined {
  if (!xml || typeof xml !== 'string' || !/<aiscript\b/i.test(xml)) return;
  let recovered = false;
  try {
    const root = new DOMParser({ onError: () => { recovered = true; } })
      .parseFromString(xml, 'text/xml').documentElement;
    if (root?.nodeName === 'aiscript') return { root, recovered };
  } catch {
    return;
  }
}

function childrenNamed(element: Element, name: string): Element[] {
  return Array.from(element.children).filter(child => child.nodeName === name);
}

/**
 * Lint the `<order><params><param …>` block of one aiscript XML file.
 * `legalTypes` defaults to the curated `ORDER_PARAM_TYPES`; when the caller has a live
 * aiscripts.xsd index it should pass the schema's enum instead (schema-grade > curated).
 * Degrades safely: non-XML / non-aiscript input yields a single info-ish warning or [].
 */
export function lintAiscriptOrderParams(xml: string, legalTypes: Set<string> = ORDER_PARAM_TYPES): AiscriptLintFinding[] {
  const parsed = parseAiscript(xml);
  return parsed ? lintOrderParams(parsed.root, legalTypes) : [];
}

export function lintAiscript(xml: string, legalTypes: Set<string> = ORDER_PARAM_TYPES): AiscriptLintFinding[] {
  const parsed = parseAiscript(xml);
  if (!parsed) return [];
  const findings = lintOrderParams(parsed.root, legalTypes);
  // Structural validation owns malformed XML. Label keys use the no-namespace schema.
  if (!parsed.recovered && !parsed.root.namespaceURI) lintActionLabels(parsed.root, findings);
  return findings;
}

function lintOrderParams(root: Element, legalTypes: Set<string>): AiscriptLintFinding[] {
  const out: AiscriptLintFinding[] = [];
  const orders = root.getElementsByTagName('order');
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const orderId = order.getAttribute('id') || '(unnamed order)';
    for (const params of childrenNamed(order, 'params')) {
      for (const param of childrenNamed(params, 'param')) {
        const pname = param.getAttribute('name') || '(unnamed param)';
        const ptype = (param.getAttribute('type') || '').trim();
        const ptext = param.getAttribute('text');

        if (!ptype) {
          out.push({
            code: 'aiscript.order_param_missing_type', severity: 'error', order: orderId, param: pname,
            detail: `Order "${orderId}" param "${pname}" has no type attribute — aiscripts.xsd marks type use="required" for order params.`,
          });
          continue;
        }
        if (!legalTypes.has(ptype.toLowerCase())) {
          out.push({
            code: 'aiscript.order_param_illegal_type', severity: 'error', order: orderId, param: pname,
            detail: `Order "${orderId}" param "${pname}" has type="${ptype}" which is not a legal order-param type. Legal types: ${[...legalTypes].join(', ')}. (The game rejected exactly this class of error in-game, 2026-07-01.)`,
          });
        }
        if (ptype.toLowerCase() !== 'internal' && (ptext === null || ptext.trim() === '')) {
          out.push({
            code: 'aiscript.order_param_missing_text', severity: 'error', order: orderId, param: pname,
            detail: `Order "${orderId}" param "${pname}" (type="${ptype}") has no text attribute. Non-internal order params need a localised text label (e.g. text="{1041, 10064}") or the game rejects the order definition — internal params may omit it.`,
          });
        }
      }
    }
  }
  return out;
}

function lintActionLabels(root: Element, out: AiscriptLintFinding[]): void {
  // aiscripts.xsd puts separate label keys and resume keyrefs on each actions block.
  for (const container of [root, ...childrenNamed(root, 'attention')]) {
    if (container.namespaceURI) continue;
    const scope = container === root ? 'main actions' : `attention ${container.getAttribute('min') || '(unspecified)'} actions`;
    for (const actions of childrenNamed(container, 'actions')) {
      if (actions.namespaceURI) continue;
      const labels = new Map<string, number | undefined>();
      for (const label of childrenNamed(actions, 'label')) {
        const attribute = label.getAttributeNode('name');
        if (label.namespaceURI || !attribute) continue;
        const name = attribute.value;
        if (labels.has(name)) {
          const firstLine = labels.get(name);
          out.push({
            code: 'aiscript.label_duplicate', severity: 'error', sourceRef: name,
            line: attribute.lineNumber, column: attribute.columnNumber,
            detail: `Label "${name}" is repeated in ${scope}${firstLine ? ` (first declared on line ${firstLine})` : ''}.`,
          });
        } else {
          labels.set(name, attribute.lineNumber);
        }
      }
      for (const resume of Array.from(actions.getElementsByTagName('resume'))) {
        const attribute = resume.getAttributeNode('label');
        if (resume.namespaceURI || !attribute || labels.has(attribute.value)) continue;
        out.push({
          code: 'aiscript.resume_label_unresolved', severity: 'error', sourceRef: attribute.value,
          line: attribute.lineNumber, column: attribute.columnNumber,
          detail: `Resume label "${attribute.value}" has no exact declaration in ${scope}.`,
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Oracle — fixture mirrors the PROBED vanilla shape (move.flee.xml, unpacked 9.00):
 * category attr, input_param + patch children, internal params with/without text.
 * ------------------------------------------------------------------ */

const GOOD_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<aiscript xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" name="move.flee" xsi:noNamespaceSchemaLocation="aiscripts.xsd" version="6">
  <order id="Flee" name="{1041, 551}" description="{1041, 552}" category="internal" allowinloop="false">
    <params>
      <param name="method" default="1" type="number" text="{1041, 10064}" advanced="true" comment="number. Methods: 'boost','maneuver'">
        <input_param name="min" value="1" />
        <input_param name="max" value="5" />
      </param>
      <param name="return" default="false" type="bool" text="{1041, 10104}" advanced="true" comment="Return to previous position."/>
      <param name="attacker" default="null" type="internal" text="{1041, 10011}" comment="Attacker." />
      <param name="subordinateorders" type="internal" default="[]" comment="internal params may omit text (vanilla precedent)">
        <patch value="[]" sinceversion="5"/>
      </param>
    </params>
  </order>
  <attention min="unknown"><actions><wait exact="1s"/></actions></attention>
</aiscript>`;

const BAD_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="order.aic.opord.protectposition" version="1">
  <order id="ProtectPosition" name="{1041, 551}">
    <params>
      <param name="position" type="position" comment="MISSING text on non-internal"/>
      <param name="radius" type="text" text="{1041, 2}" comment="type=text is not a legal order-param type"/>
      <param name="notype" comment="missing type entirely"/>
      <param name="ok_internal" type="internal" comment="internal without text is fine"/>
    </params>
  </order>
</aiscript>`;

export function runAiscriptLintSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const good = lintAiscriptOrderParams(GOOD_FIXTURE);
  ok('vanilla-shaped order lints clean', good.length === 0, good);

  const bad = lintAiscriptOrderParams(BAD_FIXTURE);
  ok('flags non-internal param without text (the in-game error class)',
    bad.some(f => f.code === 'aiscript.order_param_missing_text' && f.param === 'position'), bad);
  ok('flags type="text" as illegal order-param type',
    bad.some(f => f.code === 'aiscript.order_param_illegal_type' && f.param === 'radius'), bad);
  ok('flags missing type', bad.some(f => f.code === 'aiscript.order_param_missing_type' && f.param === 'notype'));
  ok('internal param without text is NOT flagged (vanilla precedent: move.flee subordinateorders)',
    !bad.some(f => f.param === 'ok_internal'), bad);
  ok('all findings are errors with order id', bad.every(f => f.severity === 'error' && f.order === 'ProtectPosition'));
  ok('exactly 3 findings (no cry-wolf extras)', bad.length === 3, bad.map(f => f.code).join(','));

  // schema-provided legal set takes precedence over the curated fallback
  const custom = lintAiscriptOrderParams(BAD_FIXTURE, new Set(['text', 'position', 'internal']));
  ok('caller-supplied legal set is honored (type=text legal there)',
    !custom.some(f => f.code === 'aiscript.order_param_illegal_type' && f.param === 'radius'), custom);

  // degradation
  ok('non-aiscript XML degrades to []', lintAiscriptOrderParams('<mdscript name="X"/>').length === 0);
  ok('garbage degrades to []', lintAiscriptOrderParams('not xml at all').length === 0);
  ok('empty degrades to []', lintAiscriptOrderParams('').length === 0);
  ok('aiscript with no orders degrades to []', lintAiscriptOrderParams('<aiscript name="x"><attention min="unknown"/></aiscript>').length === 0);

  const labels = lintAiscript(`<aiscript name="labels">
    <actions>
      <label name="loop"/>
      <label name="loop"/>
      <do_if value="true"><resume label="loop"/></do_if>
      <resume label="Loop"/>
    </actions>
    <attention min="visible"><actions><resume label="loop"/></actions></attention>
    <attention min="unknown"><actions><label name="loop"/><resume label="loop"/></actions></attention>
    <init><run_interrupt_script name="'interrupt'" resume="interrupt_only"/></init>
    <!-- <resume label="comment"/> -->
  </aiscript>`);
  ok('reports the duplicate at the second declaration only',
    labels.filter(f => f.code === 'aiscript.label_duplicate').map(f => f.line).join(',') === '4', labels);
  ok('resumes match exact labels in their own block',
    labels.filter(f => f.code === 'aiscript.resume_label_unresolved').map(f => f.sourceRef).join(',') === 'Loop,loop', labels);
  ok('only scoped label diagnostics appear, with locations',
    labels.length === 3 && labels.every(f => f.line && f.column), labels);
  ok('patch and recovered XML leave label resolution to the owning validator', [
    '<diff><add><resume label="elsewhere"/></add></diff>',
    '<aiscript><actions><resume label="elsewhere"/></actions></invalid>',
  ].every(xml => lintAiscript(xml).length === 0));
  ok('project entry point preserves order diagnostics',
    JSON.stringify(lintAiscript(BAD_FIXTURE)) === JSON.stringify(bad));
  const sameLine = '<aiscript><actions><label name="x"/><label name="x"/><label name="x"/></actions></aiscript>';
  const duplicateColumns = [...sameLine.matchAll(/"x"/g)].slice(1).map(match => match.index + 1);
  ok('duplicate attributes on one line have distinct exact columns',
    lintAiscript(sameLine).map(f => f.column).join(',') === duplicateColumns.join(','));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
