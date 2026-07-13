/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FORGE-STATE — structured game-state snapshots from the running game (B24s1, ADR-F3).
 *
 * The inspection-half of Play-In-Editor: FORGE-WATCH carries single scalar values;
 * FORGE-STATE carries one JSON object per TOPIC. A mod (hand-authored cue today, the
 * B24s2 probe extension later) emits:
 *
 *   FORGE-STATE <topic> {"key": "value", ...}
 *
 * via debug_text; the Forge tails the debuglog and the Inspector panel renders the
 * latest object per topic. Read-only by construction (log emission only, ADR-F3's
 * binding constraint) — this file must never grow a write path toward the game.
 *
 * Latest occurrence wins per topic; malformed JSON is counted, never thrown.
 */

export interface StateTopic {
  topic: string;
  /** Parsed JSON object for the topic (latest occurrence in the tail). */
  data: unknown;
  /** Raw JSON text as it appeared in the log (for the panel's raw view). */
  raw: string;
  lineNo: number;
}

export interface ForgeStateParse {
  topics: StateTopic[];
  /** FORGE-STATE lines whose JSON payload did not parse — surfaced, not hidden. */
  malformed: number;
}

const STATE_RE = /FORGE-STATE\s+([A-Za-z_][\w.-]*)\s+(\{.*)$/;
const MAX_TOPICS = 200;

/** Latest JSON object per topic from a log tail (last occurrence wins). */
export function parseForgeState(tail: string): ForgeStateParse {
  const byTopic = new Map<string, StateTopic>();
  let malformed = 0;
  const lines = String(tail ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(STATE_RE);
    if (!m) continue;
    const raw = m[2].trim();
    try {
      const data = JSON.parse(raw);
      // Only objects are state snapshots; a bare number/string is a WATCH's job.
      if (!data || typeof data !== 'object') { malformed++; continue; }
      if (byTopic.size >= MAX_TOPICS && !byTopic.has(m[1])) continue;
      byTopic.set(m[1], { topic: m[1], data, raw, lineNo: i + 1 });
    } catch {
      malformed++;
    }
  }
  return {
    topics: [...byTopic.values()].sort((a, b) => a.topic.localeCompare(b.topic)),
    malformed,
  };
}

/**
 * The MD action that emits a state snapshot — mirrors buildWatchActionXml. Values are
 * MD expressions concatenated into the JSON text at runtime; string-valued by design
 * (MD renders them into the text). Keys are sanitized; the emitted JSON is valid as
 * long as the expressions render without embedded double quotes.
 */
/** XML-escape an attribute value (mirrors types.ts escapeXMLAttribute). */
function escapeXmlAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A ready-to-paste `<debug_text>` element that emits a FORGE-STATE line. This is RAW
 * XML the user pastes into an MD file, so the JSON quotes are XML-escaped (`&quot;`) —
 * X4 renders them back to `"` in the debug log, giving valid JSON the parser reads.
 * (Fixed 2026-07-13, B24s2: the old form used `\"` which rendered LITERALLY as `\"`
 * and broke JSON.parse — the round-trip was never actually exercised end to end.)
 */
export function buildStateActionXml(topic: string, fields: Array<{ key: string; expression: string }>): string {
  return `<debug_text text="${escapeXmlAttr(buildStateTextExpression(topic, fields))}" />`;
}

/**
 * The LOGICAL MD text-attribute expression for a FORGE-STATE emit (what the attribute
 * means, with real `"` in the JSON), WITHOUT the element wrapper. The probe generator
 * (B24s2) sets this as an action node's `text` property and lets generateMDXML do the
 * XML escaping; buildStateActionXml escapes it inline for the paste snippet.
 */
export function buildStateTextExpression(topic: string, fields: Array<{ key: string; expression: string }>): string {
  const safeTopic = String(topic || 'state').replace(/[^\w.-]/g, '_');
  const parts = (fields || [])
    .filter(f => f && f.key)
    .map(f => {
      const key = String(f.key).replace(/[^\w.-]/g, '_');
      const expr = String(f.expression || "'?'").trim();
      return `'"${key}": "' + (${expr}) + '"'`;
    });
  const body = parts.length ? parts.join(` + ', ' + `) : `''`;
  return `'FORGE-STATE ${safeTopic} {' + ${body} + '}'`;
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runForgeStateSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  // Real X4 shape: mods log via DebugError → the engine stamps [=ERROR=] prefixes.
  const tail = [
    '[General] 100.0 ======',
    '[=ERROR=] 101.2 Error ... FORGE-STATE player {"name": "Kirt", "credits": "125000"}',
    '[=ERROR=] 102.9 Error ... FORGE-STATE factions {"argon": "-12", "split": "5"}',
    '[=ERROR=] 140.1 Error ... FORGE-STATE player {"name": "Kirt", "credits": "99000"}',
    '[=ERROR=] 141.0 Error ... FORGE-STATE broken {not json at all',
    '[=ERROR=] 141.5 Error ... FORGE-STATE scalar "just-a-string"',
    '[General] noise FORGE-STATEnope {"a": 1}',
  ].join('\n');
  const parsed = parseForgeState(tail);
  const get = (t: string) => parsed.topics.find(x => x.topic === t);

  ok('parses topics from [=ERROR=]-stamped lines', parsed.topics.length === 2, JSON.stringify(parsed.topics.map(t => t.topic)));
  ok('last occurrence wins per topic', (get('player')?.data as any)?.credits === '99000' && get('player')?.lineNo === 4);
  ok('topics coexist and sort', parsed.topics[0]?.topic === 'factions' && (get('factions')?.data as any)?.split === '5');
  // The scalar line ("just-a-string") is NOT counted: the protocol is {-anchored, so a
  // non-object payload is a non-line (not our protocol), while a broken {…} IS malformed.
  ok('malformed JSON counted, never thrown', parsed.malformed === 1, `malformed=${parsed.malformed}`);
  ok('non-object payloads are non-lines, not topics', parsed.topics.every(t => t.topic !== 'scalar'));
  ok('requires whitespace after FORGE-STATE (no false match)', get('nope' as string) === undefined && parsed.topics.every(t => t.topic !== 'nope'));
  ok('empty tail degrades', parseForgeState('').topics.length === 0 && parseForgeState('').malformed === 0);
  ok('nested objects survive', (parseForgeState('FORGE-STATE deep {"a": {"b": [1, 2]}}').topics[0]?.data as any)?.a?.b?.[1] === 2);

  // Emit helper → engine-stamped log line → parses back (round-trip).
  const xml = buildStateActionXml('player', [
    { key: 'name', expression: 'player.name' },
    { key: 'credits', expression: 'player.money' },
  ]);
  ok('emit helper is a debug_text action', xml.startsWith('<debug_text text=') && xml.includes('FORGE-STATE player {'), xml);
  // B24s2 fix: the paste snippet is XML-valid — JSON quotes are &quot; (NOT raw " which
  // breaks the attribute, NOT \" which renders literally and breaks JSON.parse). The inner
  // attribute content (between text=" and " />) must contain zero raw double-quotes.
  const innerAttr = xml.replace(/^<debug_text text="/, '').replace(/" \/>$/, '');
  ok('emit XML escapes JSON quotes as &quot;', xml.includes('&quot;') && !innerAttr.includes('"'), innerAttr);
  ok('emit XML has no backslash-quote (the old broken form)', !xml.includes('\\"'), xml);
  // The LOGICAL expression carries real quotes (what generateMDXML escapes at emit time).
  const expr = buildStateTextExpression('player', [{ key: 'name', expression: 'player.name' }]);
  ok('logical expression uses real JSON quotes', expr.includes('"name": "') && !expr.includes('&quot;'), expr);
  // Simulate what X4 renders (the &quot; render back to " in the debug log): parses back.
  const rendered = '[=ERROR=] 12.3 Error in ... FORGE-STATE player {"name": "Kirt", "credits": "125000"}';
  const round = parseForgeState(rendered);
  ok('emit→log→parse round-trip', (round.topics[0]?.data as any)?.name === 'Kirt' && round.malformed === 0);
  ok('emit helper sanitizes hostile topic', buildStateActionXml('a b"c', [{ key: 'x', expression: '$x' }]).includes('FORGE-STATE a_b_c {'));
  ok('emit helper with zero fields still emits legal JSON braces', buildStateActionXml('empty', []).includes(`{' + '' + '}`));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
