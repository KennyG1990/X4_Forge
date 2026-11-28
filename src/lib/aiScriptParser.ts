/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * G13 follow-up (#52) — import parser for the aiscripts domain.
 *
 * The aiscript compiler (`compileScriptToXML`) is intentionally lossy: it drops the
 * model's `id`/`description`/`command` and EXPANDS `actions`/`interrupts` into concrete
 * X4 behaviour nodes. So a model round-trip (`parse(compile(x))===x`) is impossible.
 * What IS achievable — and what actually matters — is EXPORT FIDELITY:
 *   compile(parseAiScriptXml(compile(x))) === compile(x)
 * i.e. import→edit→export stays byte-faithful. This parser recovers exactly the
 * compile-relevant fields. The IMPORT path additionally guards with a strict
 * `compile(parsed) === original` check, so only files that re-compile byte-identically
 * become editable; everything else stays passthrough (lossless). Tolerant regex; no I/O.
 */

import {
  type AIBehaviorScript,
  type AIParam,
  type AIAction,
  type AIInterruptHandler,
  type AIScriptOrderConfig,
  type AIScriptPatchBlock,
  type AIScriptDiffOp,
  AI_ORDER_PARAM_TYPES,
  AI_ORDER_CATEGORIES,
  normalizeAiAttentionLevel,
} from '../types';
import { compileScriptToXML, namespaceAiScriptName } from './modCompiler';

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? decodeXml(m[1]) : '';
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const OPEN_ATTRS = `((?:[^>"'\\/]|"[^"]*"|'[^']*'|\\/(?!>))*)`;

function dedentBlock(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

const PARAM_TYPES = new Set<string>(AI_ORDER_PARAM_TYPES);
const ORDER_CATEGORIES = new Set<string>(AI_ORDER_CATEGORIES);

/**
 * Parse one aiscript XML document (or RFC 5261 `<diff>` patch for an aiscript) into the
 * editable AIBehaviorScript model, or null if it is neither `<aiscript>` nor `<diff>`.
 */
export function parseAiScriptXml(content: string): AIBehaviorScript | null {
  if (!content) return null;

  // Optional RFC 5261 <diff> mode (used to patch vanilla aiscripts without overriding)
  if (/<diff\b/i.test(content) && !/<aiscript\b/i.test(content)) {
    const diffInner = (content.match(/<diff\b[^>]*>([\s\S]*?)<\/diff>/i) || ['', ''])[1];
    const diffOps: AIScriptDiffOp[] = [];
    let di = 0;
    for (const opMatch of diffInner.matchAll(new RegExp(`<(add|replace|remove)\\b${OPEN_ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`, 'gi'))) {
      const op = opMatch[1].toLowerCase() as AIScriptDiffOp['op'];
      const openAttrs = opMatch[2] || '';
      const sel = attr(openAttrs, 'sel');
      const pos = attr(openAttrs, 'pos') as AIScriptDiffOp['pos'];
      const body = opMatch[3] ? dedentBlock(opMatch[3]) : undefined;
      diffOps.push({
        id: `diff_${di++}`,
        op,
        sel,
        ...(pos ? { pos } : {}),
        ...(body !== undefined ? { content: body } : {}),
      });
    }
    return {
      id: 'imported_aiscript_diff',
      name: '',
      description: '',
      command: '',
      attentionLevel: 'unknown',
      mode: 'diff',
      namespaced: true,
      params: [],
      interrupts: [],
      actions: [],
      diffOps,
    };
  }

  const openMatch = content.match(/<aiscript\b[^>]*>/i);
  if (!openMatch) return null;
  const openTag = openMatch[0];
  const name = attr(openTag, 'name');
  const versionRaw = attr(openTag, 'version');
  const priorityRaw = attr(openTag, 'priority');
  const version = /^\d+$/.test(versionRaw) ? Number.parseInt(versionRaw, 10) : undefined;
  const priority = /^\d+$/.test(priorityRaw) ? Number.parseInt(priorityRaw, 10) : undefined;

  // --- optional <order> wrapper ---
  const orderMatch = content.match(/<order\b([^>]*)>([\s\S]*?)<\/order>/i);
  let order: AIScriptOrderConfig | undefined;
  let paramsSource = '';
  if (orderMatch) {
    const orderOpen = orderMatch[1] || '';
    const orderBody = orderMatch[2] || '';
    const cat = attr(orderOpen, 'category');
    const requiresMatch = orderBody.match(/<requires\b[^>]*>([\s\S]*?)<\/requires>/i);
    const locationMatch = orderBody.match(/<location\b[^>]*\/?>/i);
    order = {
      id: attr(orderOpen, 'id'),
      ...(attr(orderOpen, 'name') ? { name: attr(orderOpen, 'name') } : {}),
      ...(attr(orderOpen, 'description') ? { description: attr(orderOpen, 'description') } : {}),
      ...(ORDER_CATEGORIES.has(cat) ? { category: cat as AIScriptOrderConfig['category'] } : {}),
      ...(attr(orderOpen, 'infinite') === 'true' ? { infinite: true } : {}),
      ...(attr(orderOpen, 'allowinloop') === 'false' ? { allowInLoop: false } : {}),
      ...(attr(orderOpen, 'canplayercancel') === 'true' ? { canPlayerCancel: true } : {}),
      ...(requiresMatch ? { requiresXml: dedentBlock(requiresMatch[1]) } : {}),
      ...(locationMatch && attr(locationMatch[0], 'object') ? { locationObject: attr(locationMatch[0], 'object') } : {}),
      ...(locationMatch && attr(locationMatch[0], 'condition') ? { locationCondition: attr(locationMatch[0], 'condition') } : {}),
    };
    paramsSource = (orderBody.match(/<params\b[^>]*>([\s\S]*?)<\/params>/i) || ['', ''])[1];
  } else {
    paramsSource = (content.match(/<params\b[^>]*>([\s\S]*?)<\/params>/i) || ['', ''])[1];
  }

  // --- params ---
  const params: AIParam[] = [];
  for (const pm of paramsSource.matchAll(new RegExp(`<param\\b${OPEN_ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/param>)`, 'gi'))) {
    const openAttrs = pm[1] || '';
    const inner = pm[2] || '';
    const type = attr(openAttrs, 'type').toLowerCase();
    const text = attr(openAttrs, 'text');
    const reqAttr = attr(openAttrs, 'required');
    const advAttr = attr(openAttrs, 'advanced');
    const inputParams: NonNullable<AIParam['inputParams']> = [];
    for (const ip of inner.matchAll(/<input_param\b([^>]*)\/?>/gi)) {
      const ipName = attr(ip[1], 'name');
      const ipVal = attr(ip[1], 'value');
      if (ipName) inputParams.push({ name: ipName, value: ipVal });
    }
    params.push({
      name: attr(openAttrs, 'name'),
      type: (PARAM_TYPES.has(type) ? type : 'object') as AIParam['type'],
      defaultValue: attr(openAttrs, 'default'),
      comment: attr(openAttrs, 'comment'),
      ...(text ? { text } : {}),
      ...(reqAttr === 'true' ? { required: true } : reqAttr === 'false' ? { required: false } : {}),
      ...(advAttr === 'true' ? { advanced: true } : {}),
      ...(inputParams.length > 0 ? { inputParams } : {}),
    });
  }

  // --- interrupts (optional) ---
  const interrupts: AIInterruptHandler[] = [];
  const interruptsBlock = (content.match(/<interrupts\b[^>]*>([\s\S]*?)<\/interrupts>/i) || ['', ''])[1];
  let hi = 0;
  for (const hm of interruptsBlock.matchAll(new RegExp(`<handler\\b${OPEN_ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/handler>)`, 'gi'))) {
    const openAttrs = hm[1] || '';
    const inner = hm[2] || '';
    const ref = attr(openAttrs, 'ref');
    const consume = attr(openAttrs, 'consume') === 'false' ? false : undefined;
    if (ref) {
      interrupts.push({
        id: `int_${hi++}`,
        ref,
        ...(consume === false ? { consume: false } : {}),
      });
      continue;
    }
    const conditionsXml = dedentBlock((inner.match(/<conditions\b[^>]*>([\s\S]*?)<\/conditions>/i) || ['', ''])[1]);
    const actionsXml = dedentBlock((inner.match(/<actions\b[^>]*>([\s\S]*?)<\/actions>/i) || ['', ''])[1]);
    const legacyEventAttr = attr(openAttrs, 'event');
    const detectedEventTag = (conditionsXml.match(/<(event_[a-z0-9_]+)/i) || ['', ''])[1];
    let action = 'log';
    if (/run_(?:interrupt_)?script\b[^>]*name\s*=\s*"'move\.flee'"/i.test(actionsXml)) action = 'flee';
    else if (/run_(?:interrupt_)?script\b[^>]*name\s*=\s*"'(?:order\.dock|move\.dockat)'"/i.test(actionsXml)) action = 'dock_at_safety';
    else if (/<abort_called_scripts\b/i.test(actionsXml)) action = 'abort';
    interrupts.push({
      id: `int_${hi++}`,
      event: legacyEventAttr || detectedEventTag || 'event_object_attacked',
      ...(conditionsXml ? { conditionsXml } : {}),
      action,
      ...(actionsXml ? { actionsXml } : {}),
      ...(consume === false ? { consume: false } : {}),
    });
  }

  // --- optional <init>, <patch>, <on_abort> ---
  const initMatch = content.match(/<init\b[^>]*>([\s\S]*?)<\/init>/i);
  const initXml = initMatch ? dedentBlock(initMatch[1]) : undefined;

  const contentWithoutOrderAndAttention = content
    .replace(/<order\b[\s\S]*?<\/order>/gi, '')
    .replace(/<attention\b[\s\S]*?<\/attention>/gi, '');
  const patches: AIScriptPatchBlock[] = [];
  let pi = 0;
  for (const pm of contentWithoutOrderAndAttention.matchAll(new RegExp(`<patch\\b${OPEN_ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/patch>)`, 'gi'))) {
    const openAttrs = pm[1] || '';
    const sv = attr(openAttrs, 'sinceversion');
    if (!/^[1-9]\d*$/.test(sv)) continue;
    patches.push({
      id: `patch_${pi++}`,
      sinceVersion: Number.parseInt(sv, 10),
      ...(attr(openAttrs, 'early') === 'true' ? { early: true } : {}),
      ...(attr(openAttrs, 'comment') ? { comment: attr(openAttrs, 'comment') } : {}),
      actionsXml: pm[2] ? dedentBlock(pm[2]) : '',
    });
  }

  const onAbortMatch = content.match(/<on_abort\b[^>]*>([\s\S]*?)<\/on_abort>/i);
  const onAbortXml = onAbortMatch ? dedentBlock(onAbortMatch[1]) : undefined;

  // --- attention level + actions ---
  const attBlock = content.match(/<attention\b[^>]*\bmin\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/attention>/i);
  const attentionLevel = normalizeAiAttentionLevel(attBlock?.[1]);
  const actionsInner = attBlock
    ? (attBlock[2].match(/<actions\b[^>]*>([\s\S]*?)<\/actions>/i) || ['', ''])[1]
    : (content.match(/<actions\b[^>]*>([\s\S]*?)<\/actions>/i) || ['', ''])[1];

  const actions: AIAction[] = [];
  const commentRe = /<!--\s*Action:\s*([\s\S]*?)\s*-->/g;
  const marks: { label: string; start: number; end: number }[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = commentRe.exec(actionsInner))) marks.push({ label: decodeXml(cm[1]), start: cm.index, end: cm.index + cm[0].length });
  for (let i = 0; i < marks.length; i++) {
    const segEnd = i + 1 < marks.length ? marks[i + 1].start : actionsInner.length;
    const seg = actionsInner.slice(marks[i].end, segEnd).trim();
    actions.push(parseActionSegment(`act_${i}`, marks[i].label, seg));
  }

  return {
    id: name || 'imported_aiscript',
    name,
    description: '',
    command: '',
    attentionLevel,
    ...(version !== undefined ? { version } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(order ? { order } : {}),
    params,
    interrupts,
    actions,
    ...(patches.length > 0 ? { patches } : {}),
    ...(initXml ? { initXml } : {}),
    ...(onAbortXml ? { onAbortXml } : {}),
  };
}

function parseActionSegment(id: string, label: string, seg: string): AIAction {
  const mk = (command: AIAction['command'], properties: AIAction['properties']): AIAction => ({ id, command, label, properties });
  if (/^<label\b/i.test(seg)) {
    const t = seg.match(/<label\b[^>]*>/i)![0];
    return mk('label', { name: attr(t, 'name') });
  }
  if (/^<resume\b/i.test(seg)) {
    const t = seg.match(/<resume\b[^>]*>/i)![0];
    return mk('resume', { label: attr(t, 'label') });
  }
  if (/<move_to\b/i.test(seg)) {
    const t = seg.match(/<move_to\b[^>]*>/i)![0];
    const intTime = seg.match(/<interrupt_after_time\b[^>]*>/i);
    const fb = attr(t, 'flightbehaviour');
    return mk('move_to', {
      object: attr(t, 'object') || 'this.ship',
      destination: attr(t, 'destination'),
      ...(fb ? { flightbehaviour: fb } : {}),
      forceposition: attr(t, 'forceposition') || 'false',
      finishonapproach: attr(t, 'finishonapproach') || 'false',
      timeout: intTime ? (attr(intTime[0], 'time') || '10s') : '10s',
    });
  }
  if (/<run_script\b[^>]*name\s*=\s*"'move\.flee'"/i.test(seg)) return mk('flee', {});
  if (/<run_script\b[^>]*name\s*=\s*"'order\.dock'"/i.test(seg)) {
    const paramMatch = seg.match(/<param\b[^>]*name\s*=\s*"destination"[^>]*>/i);
    return mk('dock_at', { destination: paramMatch ? attr(paramMatch[0], 'value') : '$station' });
  }
  if (/<run_script\b/i.test(seg)) {
    const rm = seg.match(new RegExp(`<run_script\\b${OPEN_ATTRS}(?:\\/>|>([\\s\\S]*?)<\\/run_script>)`, 'i'))!;
    const openAttrs = rm[1] || '';
    const inner = rm[2] ? dedentBlock(rm[2]) : '';
    const res = attr(openAttrs, 'result');
    return mk('run_script', {
      name: attr(openAttrs, 'name'),
      ...(res ? { result: res } : {}),
      ...(inner ? { paramsXml: inner } : {}),
    });
  }
  if (/<shoot_at\b/i.test(seg)) {
    const t = seg.match(/<shoot_at\b[^>]*>/i)![0];
    const wm = attr(t, 'weaponmode');
    return mk('shoot', {
      object: attr(t, 'object') || 'this.ship',
      target: attr(t, 'target'),
      ...(wm ? { weaponmode: wm } : {}),
    });
  }
  if (/<dock_at\b/i.test(seg)) {
    const t = seg.match(/<dock_at\b[^>]*>/i)![0];
    return mk('dock_at', { destination: attr(t, 'station') });
  }
  if (/<wait\b/i.test(seg)) {
    const t = seg.match(/<wait\b[^>]*>/i)![0];
    const exact = attr(t, 'exact');
    const resume = attr(t, 'resume');
    const base = exact ? { exact } : { min: attr(t, 'min'), max: attr(t, 'max') };
    return mk('wait', resume === 'true' ? { ...base, resume: 'true' } : base);
  }
  if (/<find_object\b/i.test(seg)) {
    const t = seg.match(/<find_object\b[^>]*>/i)![0];
    return mk('find_objects', {
      result: attr(t, 'name') || '$targets',
      class: attr(t, 'class').replace(/^class\./, ''),
      space: attr(t, 'space') || 'this.sector',
    });
  }
  return mk('custom_xml', { rawXml: dedentBlock(seg) });
}

/* ------------------------------------------------------------------ *
 * Round-trip oracle (compile-idempotence). House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runAiScriptRoundtripSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // 1. Legacy bare-script shape (backward compatibility for #65 rt_patrol & existing saves)
  const legacyFixture: AIBehaviorScript = {
    id: 'rt_patrol', name: 'rt_patrol', description: '', command: '', attentionLevel: 'low',
    params: [{ name: '$t', type: 'object', defaultValue: 'null', comment: 'tgt' }],
    interrupts: [],
    actions: [{ id: 'a0', command: 'flee', label: 'Run', properties: {} }],
    includeInBuild: true,
  };
  const legacyXml = compileScriptToXML(legacyFixture);
  const legacyParsed = parseAiScriptXml(legacyXml);
  ok('legacy fixture normalizes attention low → unknown', !!legacyParsed && legacyParsed.attentionLevel === 'unknown');
  ok('legacy fixture compile-idempotent', !!legacyParsed && compileScriptToXML(legacyParsed) === legacyXml,
    legacyParsed ? firstDiff(legacyXml, compileScriptToXML(legacyParsed)) : 'null');

  // 2. Full X4 9.00 order script with 11-tier attentionlookup, typed order params,
  // <interrupts> ref + handler, <patch sinceversion>, <label>/<resume>, <run_script>,
  // <move_to>, <shoot_at>, order.dock, <wait>, <find_object>.
  const fullFixture: AIBehaviorScript = {
    id: 'order_patrol',
    name: 'order.forge.patrol',
    description: 'desc',
    command: 'combat',
    attentionLevel: 'insector',
    version: 3,
    priority: 5,
    order: {
      id: 'ForgePatrol',
      name: '{1041, 391}',
      description: '{1041, 392}',
      category: 'combat',
      infinite: true,
      allowInLoop: false,
      requiresXml: '<match class="class.spacesuit" negate="true" />',
      locationObject: '$space',
      locationCondition: '$space.exists',
    },
    params: [
      { name: 'space', type: 'sector', text: '{1041, 10007}', defaultValue: 'null', required: true, comment: 'patrol sector' },
      { name: 'timeout', type: 'time', text: '{1041, 10034}', defaultValue: '15min', advanced: true, comment: 'timeout', inputParams: [{ name: 'min', value: '0s' }, { name: 'max', value: '10h' }] },
      { name: 'internalflag', type: 'internal', defaultValue: 'false', comment: 'hidden' },
    ],
    interrupts: [
      { id: 'i0', ref: 'AttackHandler' },
      { id: 'i1', event: 'event_object_hull_damaged', action: 'flee', consume: false },
    ],
    initXml: '<set_value name="$initsector" exact="this.sector" />',
    patches: [
      { id: 'p0', sinceVersion: 2, early: true, comment: 'v2 init', actionsXml: '<set_value name="$migrated" exact="true" />' },
    ],
    actions: [
      { id: 'a0', command: 'label', label: 'Entry Point', properties: { name: 'start' } },
      { id: 'a1', command: 'find_objects', label: 'Scan Hostiles', properties: { result: '$enemies', class: 'ship', space: 'this.sector' } },
      { id: 'a2', command: 'move_to', label: 'Intercept Target', properties: { object: 'this.ship', destination: '$target', flightbehaviour: 'flightbehaviour.chase', forceposition: 'false', finishonapproach: 'true', timeout: '15s' } },
      { id: 'a3', command: 'shoot', label: 'Engage', properties: { object: 'this.ship', target: '$enemy', weaponmode: 'weaponmode.attackenemies' } },
      { id: 'a4', command: 'run_script', label: 'Helper Patrol', properties: { name: "'move.generic'", result: '$moved', paramsXml: '<param name="destination" value="$target" />' } },
      { id: 'a5', command: 'wait', label: 'Pause', properties: { min: '2s', max: '10s' } },
      { id: 'a6', command: 'dock_at', label: 'Dock Station', properties: { destination: '$home' } },
      { id: 'a7', command: 'resume', label: 'Loop Start', properties: { label: 'start' } },
    ],
    onAbortXml: '<debug_text text="\'aborted\'" chance="0" />',
    includeInBuild: true,
  };

  const xml = compileScriptToXML(fullFixture);
  const parsed = parseAiScriptXml(xml);
  ok('parse non-null', !!parsed && parsed.name === 'order.forge.patrol', parsed ? parsed.name : 'null');
  const reXml = parsed ? compileScriptToXML(parsed) : '';
  ok('X4 9.00 order script compile-idempotent (export fidelity)', reXml === xml, reXml === xml ? '' : firstDiff(xml, reXml));
  ok('recovers order id & category', !!parsed && parsed.order?.id === 'ForgePatrol' && parsed.order?.category === 'combat');
  ok('recovers order params & input_param', !!parsed && parsed.params.length === 3 && parsed.params[0].type === 'sector' && parsed.params[1].inputParams?.length === 2);
  ok('recovers attentionlookup', !!parsed && parsed.attentionLevel === 'insector');
  ok('recovers interrupts (ref + handler)', !!parsed && parsed.interrupts.length === 2 && parsed.interrupts[0].ref === 'AttackHandler' && parsed.interrupts[1].consume === false);
  ok('recovers patch sinceversion', !!parsed && parsed.patches?.length === 1 && parsed.patches[0].sinceVersion === 2 && parsed.patches[0].early === true);
  ok('recovers action commands', !!parsed && parsed.actions.map(a => a.command).join(',') === 'label,find_objects,move_to,shoot,run_script,wait,dock_at,resume', parsed ? parsed.actions.map(a => a.command).join(',') : '');
  ok('emits XSD-valid run_interrupt_script inside interrupt handler actions', xml.includes('<run_interrupt_script name="\'move.flee\'" />'));
  ok('emits order.dock instead of non-existent dock_at', !xml.includes('<dock_at') && xml.includes('<run_script name="\'order.dock\'">'));

  // 3. RFC 5261 <diff> mode round-trip
  const diffFixture: AIBehaviorScript = {
    id: 'diff_1', name: 'move.flee', description: 'patch vanilla flee', command: '', attentionLevel: 'unknown', mode: 'diff', namespaced: true,
    params: [], interrupts: [], actions: [],
    diffOps: [{ id: 'd0', op: 'replace', sel: '//aiscript/attention/actions/wait/@exact', content: '<wait exact="1s" />' }],
  };
  const diffXml = compileScriptToXML(diffFixture);
  const diffParsed = parseAiScriptXml(diffXml);
  ok('diff mode round-trips cleanly', !!diffParsed && diffParsed.mode === 'diff' && compileScriptToXML(diffParsed) === diffXml);

  // null on non-aiscript content
  ok('non-aiscript → null', parseAiScriptXml('<mdscript name="X"><cues/></mdscript>') === null);
  ok('empty → null', parseAiScriptXml('') === null);

  // #65 — provenance-aware namespacing helper
  ok('ns prefixes a bare authored name', namespaceAiScriptName('patrol', 'mymod') === 'mymod.patrol');
  ok('ns is idempotent on own prefix', namespaceAiScriptName('mymod.patrol', 'mymod') === 'mymod.patrol');
  ok('ns respects alreadyNamespaced (foreign import)', namespaceAiScriptName('foo.patrol', 'mymod', true) === 'foo.patrol');
  ok('ns no-op on empty name', namespaceAiScriptName('', 'mymod') === '');
  ok('ns no-op without modId', namespaceAiScriptName('patrol', '') === 'patrol');
  ok('ns f(f(x)) === f(x)',
    namespaceAiScriptName(namespaceAiScriptName('patrol', 'mymod'), 'mymod') === namespaceAiScriptName('patrol', 'mymod'));
  const imported: AIBehaviorScript = { ...legacyFixture, name: 'foreignmod.patrol', namespaced: true };
  ok('imported (namespaced) script compile-idempotent',
    compileScriptToXML(parseAiScriptXml(compileScriptToXML(imported))!) === compileScriptToXML(imported));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}

/** Tiny diff locator for oracle detail (first differing slice). */
function firstDiff(a: string, b: string): string {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `@${i}: exp=${JSON.stringify(a.slice(i, i + 40))} got=${JSON.stringify(b.slice(i, i + 40))}`;
}
