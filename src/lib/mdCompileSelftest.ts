/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compiled-XML self-test (52nd pass, gap G2).
 *
 * The existing selftests check NODE SHAPE (does the registry/template look right). They do
 * NOT check what `generateMDXML` actually emits — which is how the G1 `check_value` bug
 * slipped through (a node that looked fine compiled to `value="$x ge 5" min="1000000"`).
 * This oracle compiles representative graphs and asserts the EMITTED XML string, so a wrong
 * attribute in an emitter is caught deterministically.
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';
import { sanitizeWorkspace, generateMDXML, reindentRawXmlBlock } from '../types';
import { parseXMLToWorkspace } from './xmlParser';

const N = (id: string, type: any, xmlTag: string, properties: any = {}): Partial<MDNode> =>
  ({ id, type, xmlTag, properties, label: id, x: 0, y: 0 } as any);
const L = (id: string, s: string, sp: string, t: string, tp = 'in'): MDLink =>
  ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

/** Build a one-cue workspace and compile it to MD XML. */
function compile(nodes: Partial<MDNode>[], links: MDLink[]): string {
  const ws = sanitizeWorkspace({
    name: 'CompileTest', nodes, links, uiWidgets: [],
  } as Partial<ModWorkspace>);
  return generateMDXML(ws);
}

export function runCompileSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  // ---- G1: check_value as a full boolean expression ⇒ standalone, NO min/max ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('k', 'condition', 'check_value', { value: '$killcount ge 5' })],
      [L('l', 'c', 'out_cond', 'k', 'in_cond')],
    );
    ok('checkvalue_expr_standalone', /<check_value value="\$killcount ge 5"\s*\/>/.test(xml), xml.match(/<check_value[^>]*>/)?.[0]);
    ok('checkvalue_expr_no_bogus_min', !/value="\$killcount ge 5"[^>]*min=/.test(xml), xml.match(/<check_value[^>]*>/)?.[0]);
  }
  // ---- check_value compound expression ⇒ standalone ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('k', 'condition', 'check_value', { value: '$a ge 3 and $a lt 5' })],
      [L('l', 'c', 'out_cond', 'k', 'in_cond')],
    );
    ok('checkvalue_compound_standalone', /<check_value value="\$a ge 3 and \$a lt 5"\s*\/>/.test(xml), xml.match(/<check_value[^>]*>/)?.[0]);
  }
  // ---- check_value operand + explicit operator/amount ⇒ min/max form ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('k', 'condition', 'check_value', { value: 'player.money', operator: 'ge', amount: '500000' })],
      [L('l', 'c', 'out_cond', 'k', 'in_cond')],
    );
    ok('checkvalue_operand_min', /<check_value value="player\.money" min="500000"\s*\/>/.test(xml), xml.match(/<check_value[^>]*>/)?.[0]);
  }
  // ---- check_value bare operand, no operator ⇒ standalone truthiness (no bogus min) ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('k', 'condition', 'check_value', { value: '$flag' })],
      [L('l', 'c', 'out_cond', 'k', 'in_cond')],
    );
    ok('checkvalue_bare_no_min', /<check_value value="\$flag"\s*\/>/.test(xml) && !/\$flag"[^>]*min=/.test(xml), xml.match(/<check_value[^>]*>/)?.[0]);
  }

  // ---- reward_player ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'reward_player', { money: '100000' })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    ok('reward_player', /<reward_player money="100000"\s*\/>/.test(xml), xml.match(/<reward_player[^>]*>/)?.[0]);
  }
  // ---- set_value (generic emit) keeps its attributes ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'set_value', { name: '$x', exact: '0' })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    ok('set_value_attrs', /<set_value[^>]*name="\$x"[^>]*exact="0"[^>]*\/>/.test(xml), xml.match(/<set_value[^>]*>/)?.[0]);
  }
  // ---- show_help: text→custom, duration carries a unit ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'show_help', { text: 'Hi', duration: 5 })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    ok('show_help_custom', /<show_help custom="'Hi'"/.test(xml), xml.match(/<show_help[^>]*>/)?.[0]);
    ok('show_help_duration_unit', /duration="5s"/.test(xml), xml.match(/<show_help[^>]*>/)?.[0]);
  }
  // ---- show_help survives generated-file reopening and older saved graph fields ----
  {
    const banner = 'Welcome to "Forge" & friends';
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'show_help', { text: banner, duration: 8 })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    const parsed = parseXMLToWorkspace(xml, { identityPath: 'md/quoted_banner.xml' });
    const reopened = parsed ? generateMDXML(sanitizeWorkspace(parsed)) : '';
    const originalHelp = xml.match(/<show_help[^>]*\/>/)?.[0];
    const reopenedHelp = reopened.match(/<show_help[^>]*\/>/)?.[0];
    ok('show_help_generated_quoted_banner', xml.includes('custom="\'Welcome to &quot;Forge&quot; &amp; friends\'"'), originalHelp);
    ok('show_help_roundtrip_quoted_banner', Boolean(originalHelp) && reopenedHelp === originalHelp, { originalHelp, reopenedHelp });
    ok('show_help_roundtrip_seconds', /duration="8s"/.test(reopenedHelp || ''), reopenedHelp);
  }
  for (const duration of ['2min', '1h', '$bannerDuration']) {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'show_help', { text: 'Keep duration', duration })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    const parsed = parseXMLToWorkspace(xml, { identityPath: 'md/banner_duration.xml' });
    const reopened = parsed ? generateMDXML(sanitizeWorkspace(parsed)) : '';
    const originalHelp = xml.match(/<show_help[^>]*\/>/)?.[0];
    const reopenedHelp = reopened.match(/<show_help[^>]*\/>/)?.[0];
    ok(`show_help_roundtrip_duration_${duration}`, Boolean(originalHelp) && reopenedHelp === originalHelp
      && (reopenedHelp || '').includes(`duration="${duration}"`), { originalHelp, reopenedHelp });
  }
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'show_help', { custom: 'Older "saved" banner & hints', duration: 8 })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    ok('show_help_legacy_custom_only_text', xml.includes('custom="\'Older &quot;saved&quot; banner &amp; hints\'"'), xml.match(/<show_help[^>]*>/)?.[0]);
  }

  // ---- create_ship: owner as a CHILD element, not a faction attr ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('a', 'action', 'create_ship', { name: '$S', macro: 'ship_arg_m_fighter_01_a_macro', faction: 'argon', sector: 'player.sector' })],
      [L('l', 'c', 'out_act', 'a', 'in_act')],
    );
    ok('create_ship_owner_child', /<owner exact="faction\.argon"\s*\/>/.test(xml), xml.match(/<create_ship[\s\S]*?<\/create_ship>/)?.[0]?.slice(0, 120));
    ok('create_ship_no_faction_attr', !/<create_ship[^>]*faction=/.test(xml));
  }
  // ---- do_if nests its out_body chain ----
  {
    const xml = compile(
      [N('c', 'cue', 'cue', { name: 'C' }), N('g', 'action', 'do_if', { value: '$x gt 1' }), N('b', 'action', 'reward_player', { money: '5' })],
      [L('la', 'c', 'out_act', 'g', 'in_act'), L('lb', 'g', 'out_body', 'b', 'in_act')],
    );
    ok('do_if_nests_body', /<do_if value="\$x gt 1">[\s\S]*<reward_player money="5"\s*\/>[\s\S]*<\/do_if>/.test(xml), xml.match(/<do_if[\s\S]*?<\/do_if>/)?.[0]);
  }

  // ---- B68: raw-passthrough re-indent is idempotent + no runaway indentation ----
  {
    // A deliberately over-indented (runaway) library block, as the round-trip bug produced on-disk.
    const runaway =
      '<library name="R" purpose="run_actions">\n' +
      '                              <actions>\n' +
      "                                  <raise_lua_event name=\"'x'\" />\n" +
      '                              </actions>\n' +
      '                          </library>';
    const base = '    ';
    const once = reindentRawXmlBlock(runaway, base);
    const twice = reindentRawXmlBlock(once, base);
    const maxLead = Math.max(...once.split('\n').map(l => (l.match(/^ */)?.[0].length ?? 0)));
    ok('b68_reindent_idempotent', once === twice, { once, twice });
    ok('b68_reindent_no_runaway', maxLead <= 8, { maxLead, once });
    ok('b68_reindent_preserves_nesting',
      once.includes('\n      <actions>') && once.includes("\n        <raise_lua_event"),
      once);
    // Wire-through: a custom_xml_cue node with runaway rawXml must compile WITHOUT runaway indentation.
    const xml = compile([N('c', 'cue', 'custom_xml_cue', { name: 'Raw', rawXml: runaway })], []);
    const worst = Math.max(...xml.split('\n').map(l => (l.match(/^ */)?.[0].length ?? 0)));
    ok('b68_generate_bounds_indent', worst <= 12, { worst });
  }

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
