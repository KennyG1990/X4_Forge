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

import { DOMParser } from '@xmldom/xmldom';

/** orderparamlookup from aiscripts.xsd (unpacked 9.00) — curated fallback set. */
export const ORDER_PARAM_TYPES = new Set([
  'internal', 'bool', 'number', 'length', 'time', 'money', 'object', 'space',
  'position', 'ware', 'trade', 'build', 'formationshape',
]);

export interface AiscriptLintFinding {
  code: 'aiscript.order_param_missing_type' | 'aiscript.order_param_illegal_type' | 'aiscript.order_param_missing_text' | 'aiscript.not_aiscript';
  severity: 'error' | 'warning';
  order?: string;
  param?: string;
  detail: string;
}

import { directElementChildren as directChildren, type ElementLike } from './xmlLite';

/**
 * Lint the `<order><params><param …>` block of one aiscript XML file.
 * `legalTypes` defaults to the curated `ORDER_PARAM_TYPES`; when the caller has a live
 * aiscripts.xsd index it should pass the schema's enum instead (schema-grade > curated).
 * Degrades safely: non-XML / non-aiscript input yields a single info-ish warning or [].
 */
export function lintAiscriptOrderParams(xml: string, legalTypes: Set<string> = ORDER_PARAM_TYPES): AiscriptLintFinding[] {
  const out: AiscriptLintFinding[] = [];
  if (!xml || typeof xml !== 'string' || !/<aiscript\b/i.test(xml)) return out;
  let doc: { documentElement: ElementLike | null } | null = null;
  try {
    doc = new DOMParser({ onError: () => { /* degrade */ } }).parseFromString(xml, 'text/xml') as unknown as { documentElement: ElementLike | null };
  } catch {
    return out;
  }
  const root = doc?.documentElement;
  if (!root || root.nodeName !== 'aiscript') return out;

  const orders = root.getElementsByTagName('order');
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const orderId = order.getAttribute('id') || '(unnamed order)';
    for (const params of directChildren(order, 'params')) {
      for (const param of directChildren(params, 'param')) {
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

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
