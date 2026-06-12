// liveFixes.ts — T5 Live Fix Loop engine (Inc 1).
//
// Turns live debuglog telemetry into actionable, ATTRIBUTED fix cards:
// error line → known failure class → owning node (when locatable) → suggestion,
// with a mechanical auto-apply only where the result is statically verifiable.
//
// EXTENDS (not duplicates): logTelemetry supplies the parsed entries; the
// failure classes come from what the reference/XSD validators already catch
// (unknown macro, time-format, dangling cue, null cascades); jumps reuse the
// existing navigate-to-source sourceRef contract.
//
// HONESTY BOUNDS: only errors the rule table can attribute produce cards —
// unattributable third-party log noise yields NOTHING (it stays visible in the
// raw feed). autoApplicable is set only for mechanical, verifiable rewrites
// (e.g. bare number on a time-typed property → append "s").
//
// House pattern: pure engine + runLiveFixesSelftest() + public GET, THEN UI.

import type { ModWorkspace, MDNode } from '../types';

export interface LiveLogEntry {
  severity?: string;
  message: string;
}

export interface LiveFix {
  id: string;
  fixKind: 'time_format' | 'unknown_macro' | 'dangling_cue' | 'null_expression' | 'cue_error';
  /** The offending log line (trimmed). */
  logLine: string;
  /** Owning cue name when the line could be correlated. */
  cueName?: string;
  /** navigate-to-source payload when the owning node was located. */
  sourceRef?: { kind: string; id: string; label?: string };
  suggestion: string;
  /** True only for mechanical rewrites the validators can verify statically. */
  autoApplicable: boolean;
  /** Present when autoApplicable: the exact property rewrite to perform. */
  apply?: { nodeId: string; propertyKey: string; newValue: string };
}

const TIME_KEYS = ['duration', 'timeout', 'delay', 'interval', 'time'];

/** Nodes whose named property holds the given bare value. */
function findNodeByProperty(nodes: MDNode[], key: string, value: string): MDNode | undefined {
  return nodes.find(n => String((n.properties || ({} as any))[key] ?? '') === value);
}

function findNodeWithMacro(nodes: MDNode[], macro: string): MDNode | undefined {
  return nodes.find(n => String((n.properties || ({} as any)).macro ?? '').split(' (')[0] === macro);
}

function cueNameForLine(line: string, cueNames: string[]): string | undefined {
  const marker = line.match(/\[MDStudio\]\s*cue=(\w+)/i);
  if (marker) return marker[1];
  return cueNames.find(name => name && line.includes(name));
}

/**
 * Classify parsed log entries into attributed fix cards.
 * Pure: workspace and entries in, cards out. Unattributable lines yield nothing.
 */
export function classifyLiveFixes(entries: LiveLogEntry[], workspace: Pick<ModWorkspace, 'nodes'>): LiveFix[] {
  const nodes = workspace.nodes || [];
  const cueNames = nodes
    .filter(n => n.type === 'cue')
    .map(n => String((n.properties || ({} as any)).name ?? ''))
    .filter(Boolean);
  const fixes: LiveFix[] = [];
  const seen = new Set<string>();
  let counter = 0;

  for (const entry of entries) {
    const line = String(entry?.message ?? '').trim();
    if (!line) continue;
    const severity = String(entry?.severity ?? '').toLowerCase();
    const isError = severity === 'error' || /\berror\b/i.test(line);
    if (!isError) continue;

    const cueName = cueNameForLine(line, cueNames);
    let fix: LiveFix | null = null;

    // 1) time-format: Evaluated value '8' is not of type time
    const time = line.match(/value\s+'([\d.]+)'\s+is not of type time/i);
    if (time) {
      const bare = time[1];
      let owner: MDNode | undefined;
      let ownerKey: string | undefined;
      for (const key of TIME_KEYS) {
        owner = findNodeByProperty(nodes, key, bare);
        if (owner) { ownerKey = key; break; }
      }
      fix = {
        id: `fix_${counter++}`,
        fixKind: 'time_format',
        logLine: line,
        cueName,
        sourceRef: owner ? { kind: 'md_node', id: owner.id, label: owner.xmlTag } : undefined,
        suggestion: `X4 time values need a unit: "${bare}" should be "${bare}s".` +
          (owner ? ` Found on <${owner.xmlTag}> ${ownerKey}.` : ' No matching node property found — fix manually.'),
        autoApplicable: !!(owner && ownerKey),
        ...(owner && ownerKey ? { apply: { nodeId: owner.id, propertyKey: ownerKey, newValue: `${bare}s` } } : {})
      };
    }

    // 2) unknown macro
    if (!fix) {
      const macro = line.match(/(?:macro|template)\s+'?([\w.]+_macro)'?\s+(?:not found|unknown|could not be (?:found|resolved))/i)
        || line.match(/(?:failed to (?:find|resolve)|unknown)\s+macro\s+'?([\w.]+)'?/i);
      if (macro) {
        const name = macro[1];
        const owner = findNodeWithMacro(nodes, name);
        fix = {
          id: `fix_${counter++}`,
          fixKind: 'unknown_macro',
          logLine: line,
          cueName,
          sourceRef: owner ? { kind: 'md_node', id: owner.id, label: owner.xmlTag } : undefined,
          suggestion: `Macro "${name}" does not exist in this install. Open the node and re-pick it from the live index (the picker only offers real macros).`,
          autoApplicable: false
        };
      }
    }

    // 3) dangling cue reference
    if (!fix) {
      const cueRef = line.match(/cue\s+'?([\w.]+)'?\s+(?:not found|unknown|does not exist)/i);
      if (cueRef) {
        fix = {
          id: `fix_${counter++}`,
          fixKind: 'dangling_cue',
          logLine: line,
          cueName,
          suggestion: `Cue reference "${cueRef[1]}" doesn't resolve. Check the Cue Lineage Tree for dangling refs (it flags these statically too).`,
          autoApplicable: false
        };
      }
    }

    // 4) null-expression cascade — only when attributable to one of OUR cues
    if (!fix && cueName && /(?:is null|null is not|property\s+.*\s+not (?:found|defined))/i.test(line)) {
      fix = {
        id: `fix_${counter++}`,
        fixKind: 'null_expression',
        logLine: line,
        cueName,
        suggestion: `An expression in cue "${cueName}" evaluated to null — usually a cascade from an earlier failed action (check the cards above this one first).`,
        autoApplicable: false
      };
    }

    // 5) generic attributed cue error — our cue, error line, no specific class
    if (!fix && cueName) {
      fix = {
        id: `fix_${counter++}`,
        fixKind: 'cue_error',
        logLine: line,
        cueName,
        suggestion: `Error attributed to cue "${cueName}". Jump to it and inspect the action chain.`,
        autoApplicable: false
      };
    }

    // Unattributable error → NO card (honesty bound).
    if (fix) {
      const dedupe = fix.fixKind + '|' + (fix.sourceRef?.id || fix.cueName || fix.logLine.slice(0, 60));
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        fixes.push(fix);
      }
    }
  }
  return fixes;
}

/**
 * Apply a mechanical fix. Pure: returns a NEW workspace (caller owns undo via
 * the normal setWorkspace path). Throws if the fix is not auto-applicable or
 * the target node/property has changed since classification.
 */
export function applyLiveFix<T extends Pick<ModWorkspace, 'nodes'>>(workspace: T, fix: LiveFix): T {
  if (!fix.autoApplicable || !fix.apply) throw new Error('fix is not auto-applicable');
  const { nodeId, propertyKey, newValue } = fix.apply;
  const node = (workspace.nodes || []).find(n => n.id === nodeId);
  if (!node) throw new Error('target node no longer exists');
  const expectedOld = newValue.replace(/s$/, '');
  if (String((node.properties || ({} as any))[propertyKey] ?? '') !== expectedOld) {
    throw new Error('target property changed since classification — re-scan');
  }
  return {
    ...workspace,
    nodes: workspace.nodes.map(n =>
      n.id === nodeId ? { ...n, properties: { ...n.properties, [propertyKey]: newValue } } : n
    )
  };
}

// ---------------------------------------------------------------------------
// Selftest oracle — synthetic log + workspace fixtures.
// ---------------------------------------------------------------------------

export interface LiveFixesCheck { name: string; pass: boolean; detail?: string }

export function runLiveFixesSelftest(): { pass: boolean; checks: LiveFixesCheck[] } {
  const checks: LiveFixesCheck[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const ws: any = {
    nodes: [
      { id: 'cue1', type: 'cue', xmlTag: 'cue', properties: { name: 'BountyCue' } },
      { id: 'n1', type: 'action', xmlTag: 'show_help', properties: { text: 'hi', duration: '8' } },
      { id: 'n2', type: 'action', xmlTag: 'create_ship', properties: { macro: 'ship_xen_i_destroyer_01_macro' } }
    ]
  };

  const entries = [
    { severity: 'error', message: "Evaluated value '8' is not of type time" },
    { severity: 'error', message: "Error: macro 'ship_xen_i_destroyer_01_macro' not found in library" },
    { severity: 'error', message: "Error in MD cue BountyCue: property lookup failed: value is null" },
    { severity: 'error', message: "cue 'md.Missing.Target' not found" },
    { severity: 'error', message: 'completely unrelated third-party mod explosion' },
    { severity: 'info', message: '[MDStudio] cue=BountyCue fired' }
  ];

  const fixes = classifyLiveFixes(entries, ws);

  ok('exactly 4 cards (unattributable + info lines yield none)', fixes.length === 4,
    fixes.map(f => f.fixKind).join(','));

  const tf = fixes.find(f => f.fixKind === 'time_format');
  ok('time_format located the owning node and is auto-applicable',
    !!tf && tf.autoApplicable && tf.sourceRef?.id === 'n1' && tf.apply?.newValue === '8s',
    tf && tf.suggestion);

  const um = fixes.find(f => f.fixKind === 'unknown_macro');
  ok('unknown_macro attributed to the create_ship node, not auto',
    !!um && !um.autoApplicable && um.sourceRef?.id === 'n2');

  const ne = fixes.find(f => f.fixKind === 'null_expression');
  ok('null cascade attributed to our cue by name', !!ne && ne.cueName === 'BountyCue');

  const dc = fixes.find(f => f.fixKind === 'dangling_cue');
  ok('dangling cue reference produces a card', !!dc);

  // apply path
  if (tf) {
    const next = applyLiveFix(ws, tf);
    ok('applyLiveFix rewrites 8 → 8s immutably',
      next.nodes.find((n: any) => n.id === 'n1').properties.duration === '8s'
      && ws.nodes.find((n: any) => n.id === 'n1').properties.duration === '8');
    let threw = false;
    try { applyLiveFix(next, tf); } catch { threw = true; }
    ok('applyLiveFix refuses a stale fix (property already changed)', threw);
  } else {
    ok('applyLiveFix rewrites 8 → 8s immutably', false, 'no time fix to apply');
  }

  let threw2 = false;
  try { applyLiveFix(ws, fixes.find(f => f.fixKind === 'unknown_macro')!); } catch { threw2 = true; }
  ok('applyLiveFix refuses non-auto fixes', threw2);

  // dedupe: same error twice → one card
  const twice = classifyLiveFixes([entries[0], entries[0]], ws);
  ok('duplicate log lines dedupe to one card', twice.length === 1);

  return { pass: checks.every(c => c.pass), checks };
}
