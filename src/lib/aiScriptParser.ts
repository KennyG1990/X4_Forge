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

import type { AIBehaviorScript, AIParam, AIAction } from '../types';
import { compileScriptToXML, namespaceAiScriptName } from './modCompiler';

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? decodeXml(m[1]) : '';
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const PARAM_TYPES = new Set(['object', 'number', 'boolean', 'ware', 'faction']);

/**
 * Parse one aiscript XML document into the editable AIBehaviorScript model, or null if
 * it has no `<aiscript>` root (→ caller keeps it as passthrough).
 */
export function parseAiScriptXml(content: string): AIBehaviorScript | null {
  if (!content) return null;
  const openMatch = content.match(/<aiscript\b[^>]*>/i);
  if (!openMatch) return null;
  const name = attr(openMatch[0], 'name');

  // --- params ---
  const params: AIParam[] = [];
  const paramsBlock = (content.match(/<params\b[^>]*>([\s\S]*?)<\/params>/i) || ['', ''])[1];
  for (const pm of paramsBlock.matchAll(/<param\b[^>]*\/?>/gi)) {
    const t = pm[0];
    const type = attr(t, 'type');
    params.push({
      name: attr(t, 'name'),
      type: (PARAM_TYPES.has(type) ? type : 'object') as AIParam['type'],
      defaultValue: attr(t, 'default'),
      comment: attr(t, 'comment'),
    });
  }

  // --- interrupts (optional) ---
  const interrupts: AIBehaviorScript['interrupts'] = [];
  const interruptsBlock = (content.match(/<interrupts\b[^>]*>([\s\S]*?)<\/interrupts>/i) || ['', ''])[1];
  let hi = 0;
  for (const hm of interruptsBlock.matchAll(/<handler\b[^>]*>([\s\S]*?)<\/handler>/gi)) {
    const event = attr(hm[0].match(/<handler\b[^>]*>/i)![0], 'event');
    const inner = hm[1];
    // Reverse-map the emitted handler body to a model action. Any value other than
    // 'flee'/'dock_at_safety' re-compiles to the same <write_to_logbook>, so 'log' is safe.
    let action = 'log';
    if (/run_script\b[^>]*name\s*=\s*"'move\.flee'"/i.test(inner)) action = 'flee';
    else if (/run_script\b[^>]*name\s*=\s*"'move\.dockat'"/i.test(inner)) action = 'dock_at_safety';
    interrupts.push({ id: `int_${hi++}`, event, action });
  }

  // --- attention level + actions ---
  const attBlock = content.match(/<attention\b[^>]*\bmin\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/attention>/i);
  const attentionLevel = (attBlock && (attBlock[1] === 'high' || attBlock[1] === 'low') ? attBlock[1] : 'low') as AIBehaviorScript['attentionLevel'];
  const actionsInner = attBlock
    ? (attBlock[2].match(/<actions\b[^>]*>([\s\S]*?)<\/actions>/i) || ['', ''])[1]
    : '';

  const actions: AIAction[] = [];
  // Each authored action is preceded by `<!-- Action: LABEL -->`; segment = comment→next comment.
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
    description: '',     // not present in the emit
    command: '',         // not present in the emit
    attentionLevel,
    params,
    interrupts,
    actions,
  };
}

function parseActionSegment(id: string, label: string, seg: string): AIAction {
  const mk = (command: AIAction['command'], properties: AIAction['properties']): AIAction => ({ id, command, label, properties });
  if (/<move_to\b/i.test(seg)) {
    const t = seg.match(/<move_to\b[^>]*>/i)![0];
    return mk('move_to', { destination: attr(t, 'destination') });
  }
  if (/<run_script\b[^>]*name\s*=\s*"'move\.flee'"/i.test(seg)) return mk('flee', {});
  if (/<shoot_at\b/i.test(seg)) {
    const t = seg.match(/<shoot_at\b[^>]*>/i)![0];
    return mk('shoot', { target: attr(t, 'target') });
  }
  if (/<dock_at\b/i.test(seg)) {
    const t = seg.match(/<dock_at\b[^>]*>/i)![0];
    return mk('dock_at', { station: attr(t, 'station') });
  }
  if (/<wait\b/i.test(seg)) {
    const t = seg.match(/<wait\b[^>]*>/i)![0];
    const exact = attr(t, 'exact');
    return exact ? mk('wait', { exact }) : mk('wait', { min: attr(t, 'min'), max: attr(t, 'max') });
  }
  if (/<find_object\b/i.test(seg)) {
    const t = seg.match(/<find_object\b[^>]*>/i)![0];
    return mk('find_objects', { class: attr(t, 'class').replace(/^class\./, '') });
  }
  return mk('custom_xml', { rawXml: seg });
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

  const fixture: AIBehaviorScript = {
    id: 'patrol', name: 'patrol', description: 'desc', command: 'patrol', attentionLevel: 'high',
    params: [
      { name: '$target', type: 'object', defaultValue: 'null', comment: 'patrol target' },
      { name: '$count', type: 'number', defaultValue: '3', comment: 'loops' },
    ],
    interrupts: [
      { id: 'i0', event: 'enemy_detected', action: 'flee' },
      { id: 'i1', event: 'low_hull', action: 'log' },
    ],
    actions: [
      { id: 'a0', command: 'move_to', label: 'Go to target', properties: { destination: '$target' } },
      { id: 'a1', command: 'shoot', label: 'Engage', properties: { target: '$enemy' } },
      { id: 'a2', command: 'wait', label: 'Pause', properties: { min: '2s', max: '10s' } },
      { id: 'a3', command: 'find_objects', label: 'Scan', properties: { class: 'ship' } },
      { id: 'a4', command: 'flee', label: 'Retreat', properties: {} },
      { id: 'a5', command: 'dock_at', label: 'Dock', properties: { station: '$home' } },
    ],
    includeInBuild: true,
  };

  const xml = compileScriptToXML(fixture);
  const parsed = parseAiScriptXml(xml);
  ok('parse non-null', !!parsed && parsed.name === 'patrol', parsed ? parsed.name : 'null');
  // The headline guarantee: re-compiling the parsed model reproduces the original bytes.
  const reXml = parsed ? compileScriptToXML(parsed) : '';
  ok('compile-idempotent (export fidelity)', reXml === xml, reXml === xml ? '' : firstDiff(xml, reXml));

  // recovered compile-relevant fields
  ok('recovers params', !!parsed && parsed.params.length === 2 && parsed.params[0].name === '$target' && parsed.params[1].type === 'number');
  ok('recovers attention', !!parsed && parsed.attentionLevel === 'high');
  ok('recovers interrupts', !!parsed && parsed.interrupts.length === 2 && parsed.interrupts[0].event === 'enemy_detected' && parsed.interrupts[0].action === 'flee');
  ok('recovers action commands', !!parsed && parsed.actions.map(a => a.command).join(',') === 'move_to,shoot,wait,find_objects,flee,dock_at', parsed ? parsed.actions.map(a => a.command).join(',') : '');
  ok('recovers action labels', !!parsed && parsed.actions[0].label === 'Go to target' && parsed.actions[3].label === 'Scan');
  ok('recovers move_to destination', !!parsed && parsed.actions[0].properties.destination === '$target');
  ok('recovers find_objects class (strips prefix)', !!parsed && parsed.actions[3].properties.class === 'ship');

  // a script with no interrupts also round-trips
  const noInt: AIBehaviorScript = { ...fixture, interrupts: [], actions: [{ id: 'x', command: 'flee', label: 'Flee', properties: {} }] };
  const noIntXml = compileScriptToXML(noInt);
  ok('no-interrupts compile-idempotent', compileScriptToXML(parseAiScriptXml(noIntXml)!) === noIntXml);

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
  // an already-namespaced (imported) script still re-compiles byte-faithfully
  const imported: AIBehaviorScript = { ...fixture, name: 'foreignmod.patrol', namespaced: true };
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
