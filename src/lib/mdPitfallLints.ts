/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MD pitfall lints — the failure-corpus lints from the 2026-06-25 ACTUATION bug-hunt
 * and ROADMAP item #4 (offer-accept), GROUNDED against the full vanilla md/ corpus
 * (unpacked 9.00) before shipping. Grounding results (2026-07-08):
 *
 *  SHIPPED (0 vanilla false positives):
 *   1. `md_pitfall.ui_listener_one_shot` — a ROOT-level cue listening for
 *      <event_ui_triggered> without instantiate="true", never reset/cancelled anywhere
 *      (incl. keyword self-resets in its own subtree), fires ONCE then completes
 *      forever. Vanilla count of this exact shape: 0/516. (The broad "any event_*
 *      without instantiate" form was FALSIFIED: vanilla does it 6321/8456 times —
 *      one-shot listeners are a normal idiom. Do not widen this lint.)
 *   2. `md_pitfall.offer_accepted_keyword_cue` — <event_offer_accepted cue="parent|
 *      this|static"> validates clean but NEVER FIRES in-game (proven in x4_ai_influence
 *      2026-07-01; kuertee_emergent_missions_escort.xml:325 "event_offer_accepted
 *      doesn't work"). Vanilla uses the variable idiom exclusively (0 keyword uses).
 *      Suggests the proven pattern: <event_object_signalled object="$Client"
 *      param="'accept'"/> or the $OfferCue variable form.
 *   3. `md_pitfall.param3_table_barekey` — `$x = event.param3` (a Lua table from
 *      AddUITriggeredEvent) followed by `$x.barekey` where `barekey` is NOT a known
 *      script property: that's a PROPERTY lookup (almost always nonexistent → branch
 *      silently skips); the author meant `$x.$barekey`. Union-aware: vanilla's 6
 *      `$x.<ident>` uses after param3 are all REAL properties (count, buildobject,
 *      roleobject, …) and pass. (This was THE silent killer of the 2026-06-25 hunt.)
 *
 *  FALSIFIED BY GROUNDING (deliberately NOT shipped — recorded so nobody re-adds them):
 *   - "event_* handler without instantiate → warn" (6321 vanilla uses).
 *   - "instantiated cue setting $vars without namespace='this' → warn" (1345 vanilla uses).
 *
 * House pattern: pure engine + oracle + public GET. xmldom for cue-tree structure.
 */

import { DOMParser } from '@xmldom/xmldom';
import { maskNonExpressionSpans } from './scriptProperties';

export interface MdPitfallFinding {
  code: 'md_pitfall.ui_listener_one_shot' | 'md_pitfall.offer_accepted_keyword_cue' | 'md_pitfall.param3_table_barekey';
  severity: 'warning';
  cue?: string;
  line?: number;
  detail: string;
}

import { directElementChildren, type ElementLike } from './xmlLite';

function lineOf(haystack: string, needleIndex: number): number {
  return haystack.slice(0, Math.max(0, needleIndex)).split('\n').length;
}

/**
 * Lint one MD file. `propertyUnion` (from the scriptproperty index) makes the param3
 * lint union-aware; without it the param3 lint stays conservative (identifier must
 * look like a custom key: it is flagged only when it contains no known-property hit,
 * so with no union supplied we skip the lint entirely rather than guess).
 */
export function lintMdPitfalls(xml: string, opts: { propertyUnion?: Set<string>; filePath?: string } = {}): MdPitfallFinding[] {
  const out: MdPitfallFinding[] = [];
  if (!xml || typeof xml !== 'string' || !/<mdscript\b/i.test(xml)) return out;
  const masked = maskNonExpressionSpans(xml);

  // ---- 2. offer_accepted keyword cue (regex over masked text — flat shape) ----
  {
    const re = /<event_offer_accepted\b[^>]*\bcue\s*=\s*"(parent|this|static)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      out.push({
        code: 'md_pitfall.offer_accepted_keyword_cue',
        severity: 'warning',
        line: lineOf(masked, m.index),
        detail: `<event_offer_accepted cue="${m[1]}"> validates clean but never fires in-game — the engine does not resolve cue keywords for this event at register time (proven 2026-07-01; also kuertee: "event_offer_accepted doesn't work"). Use the proven accept pattern instead: listen <event_object_signalled object="$Client" param="'accept'"/> after create_mission / set_objective, or store the offer cue in a variable (<set_value name="$OfferCue" exact="this"/> … cue="$OfferCue").${opts.filePath ? ` (${opts.filePath})` : ''}`,
      });
    }
  }

  // DOM parse for the cue-tree lints
  let doc: { documentElement: ElementLike | null } | null = null;
  try {
    doc = new DOMParser({ onError: () => { /* degrade */ } }).parseFromString(xml, 'text/xml') as unknown as { documentElement: ElementLike | null };
  } catch { return out; }
  const root = doc?.documentElement;
  if (!root || root.nodeName !== 'mdscript') return out;

  const cuesBlocks = directElementChildren(root, 'cues');
  const rootCues = cuesBlocks.flatMap(b => directElementChildren(b, 'cue'));

  // reset/cancel targets by NAME anywhere in the file (masked text, cheap)
  const resetTargets = new Set<string>();
  {
    const re = /<(?:reset_cue|cancel_cue)\b[^>]*\bcue\s*=\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const ref = m[1].trim();
      const local = ref.startsWith('this.') ? ref.slice(5) : ref;
      resetTargets.add(local.split('.').pop() || local);
    }
  }

  // ---- 1. root-level one-shot event_ui_triggered listener ----
  for (const cue of rootCues) {
    if ((cue.getAttribute('instantiate') || '').toLowerCase() === 'true') continue;
    const name = cue.getAttribute('name') || '';
    const conditions = directElementChildren(cue, 'conditions')[0];
    if (!conditions) continue;
    const hasUiEvent = conditions.getElementsByTagName('event_ui_triggered').length > 0;
    if (!hasUiEvent) continue;
    if (name && resetTargets.has(name)) continue; // something re-arms it by name
    const subtree = cue.toString();
    if (/<(?:reset_cue|cancel_cue)\b[^>]*\bcue\s*=\s*"(?:this|parent|static|namespace)"/i.test(subtree)) continue; // keyword self-reset
    out.push({
      code: 'md_pitfall.ui_listener_one_shot',
      severity: 'warning',
      cue: name || '(unnamed)',
      detail: `Cue "${name || '(unnamed)'}" listens for <event_ui_triggered> without instantiate="true" and is never reset — it fires ONCE then completes forever, so the UI handler goes dead after the first event (the exact 2026-06-25 On_action bug). Add instantiate="true" (with namespace="this" for its $vars) or re-arm it with reset_cue. Vanilla has zero root-level one-shot UI listeners.${opts.filePath ? ` (${opts.filePath})` : ''}`,
    });
  }

  // ---- 3. param3 table bare-key access (union-aware; skipped without a union) ----
  if (opts.propertyUnion && opts.propertyUnion.size) {
    const union = opts.propertyUnion;
    const allCues = root.getElementsByTagName('cue');
    const seen = new Set<string>();
    const scanScope = (scopeXml: string) => {
      const scopeMasked = maskNonExpressionSpans(scopeXml);
      const setRe = /<set_value\s+name="(\$\w+)"\s+exact="event\.param3"\s*\/?\s*>/gi;
      let m: RegExpExecArray | null;
      while ((m = setRe.exec(scopeMasked)) !== null) {
        const varName = m[1];
        const tail = scopeMasked.slice(m.index + m[0].length);
        const accessRe = new RegExp(varName.replace('$', '\\$') + '\\.(?![\\$\\{])([A-Za-z_]\\w*)', 'g');
        let a: RegExpExecArray | null;
        while ((a = accessRe.exec(tail)) !== null) {
          const ident = a[1].replace(/\?$/, '').toLowerCase();
          if (union.has(ident)) continue; // real script property — legal read
          const key = `${varName}.${ident}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            code: 'md_pitfall.param3_table_barekey',
            severity: 'warning',
            detail: `"${varName}.${a[1]}" reads a bare key off ${varName} = event.param3 (a Lua table from AddUITriggeredEvent). A bare identifier is a PROPERTY lookup — "${a[1]}" is not a known script property, so the expression is silently false and the branch skips (the 2026-06-25 silent killer). You almost certainly meant "${varName}.$${a[1]}" (variable key).${opts.filePath ? ` (${opts.filePath})` : ''}`,
          });
        }
      }
    };
    if (allCues.length) {
      for (let i = 0; i < allCues.length; i++) {
        // only leaf-ish scope scan: the cue's own serialized subtree keeps var scoping local
        scanScope(allCues[i].toString());
      }
    } else {
      scanScope(xml);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Oracle — fixtures mirror probed vanilla shapes + the real bug shapes.
 * ------------------------------------------------------------------ */

const UNION_FIXTURE = new Set(['count', 'buildobject', 'roleobject', 'npctemplate', 'assignedcontrolled', 'formatted', 'exists', 'name']);

export function runMdPitfallSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  const lint = (xml: string) => lintMdPitfalls(xml, { propertyUnion: UNION_FIXTURE });

  // --- 1. ui_listener_one_shot ---
  const deadListener = `<mdscript name="T"><cues>
    <cue name="On_action"><conditions><event_ui_triggered screen="'aic'" control="'action'"/></conditions>
      <actions><debug_text text="'hi'"/></actions></cue>
  </cues></mdscript>`;
  ok('flags root one-shot UI listener (the On_action bug)',
    lint(deadListener).some(f => f.code === 'md_pitfall.ui_listener_one_shot' && f.cue === 'On_action'), lint(deadListener));
  const instantiated = deadListener.replace('<cue name="On_action">', '<cue name="On_action" instantiate="true">');
  ok('instantiate="true" passes', !lint(instantiated).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const resetByName = deadListener.replace('</cues>', `<cue name="Rearm"><conditions><event_cue_signalled cue="md.T.X"/></conditions><actions><reset_cue cue="On_action"/></actions></cue></cues>`);
  ok('listener reset by name elsewhere passes', !lint(resetByName).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const selfReset = deadListener.replace('<debug_text text="\'hi\'"/>', '<debug_text text="\'hi\'"/><reset_cue cue="this"/>');
  ok('keyword self-reset passes', !lint(selfReset).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const nonUi = deadListener.replace('event_ui_triggered screen="\'aic\'" control="\'action\'"', 'event_object_destroyed object="$target"');
  ok('non-UI one-shot event cue NOT flagged (vanilla idiom — falsified broad lint stays dead)',
    lint(nonUi).length === 0, lint(nonUi));
  const subCueListener = `<mdscript name="T"><cues>
    <cue name="Root" instantiate="true"><conditions><event_cue_signalled cue="md.X.Y"/></conditions>
      <cues><cue name="Inner"><conditions><event_ui_triggered screen="'a'" control="'b'"/></conditions></cue></cues></cue>
  </cues></mdscript>`;
  ok('non-root UI listener NOT flagged (parent instance re-arms it)',
    !lint(subCueListener).some(f => f.code === 'md_pitfall.ui_listener_one_shot'), lint(subCueListener));

  // --- 2. offer_accepted_keyword_cue ---
  const offerKw = `<mdscript name="T"><cues><cue name="A" instantiate="true"><conditions><event_offer_accepted cue="parent"/></conditions></cue></cues></mdscript>`;
  ok('flags event_offer_accepted cue="parent"',
    lint(offerKw).some(f => f.code === 'md_pitfall.offer_accepted_keyword_cue'), lint(offerKw));
  ok('offer finding suggests the proven pattern',
    lint(offerKw)[0]?.detail.includes('event_object_signalled'), lint(offerKw)[0]?.detail);
  const offerVar = `<mdscript name="T"><cues><cue name="A" instantiate="true"><conditions><event_offer_accepted cue="$OfferCue"/></conditions></cue></cues></mdscript>`;
  ok('variable-form offer listener passes (vanilla idiom)', lint(offerVar).length === 0);

  // --- 3. param3_table_barekey ---
  const bareKey = `<mdscript name="T"><cues><cue name="A" instantiate="true" namespace="this">
    <conditions><event_ui_triggered screen="'aic'" control="'act'"/></conditions>
    <actions><set_value name="$d" exact="event.param3"/><do_if value="$d.l1 == 'relation'"><debug_text text="'x'"/></do_if></actions>
    <actions><reset_cue cue="this"/></actions></cue></cues></mdscript>`;
  ok('flags $d.l1 barekey read off event.param3 (the silent killer)',
    lint(bareKey).some(f => f.code === 'md_pitfall.param3_table_barekey' && f.detail.includes('$d.$l1')), lint(bareKey));
  const dollarKey = bareKey.replace('$d.l1', '$d.$l1');
  ok('$d.$l1 variable-key read passes', !lint(dollarKey).some(f => f.code === 'md_pitfall.param3_table_barekey'));
  const realProp = `<mdscript name="T"><cues><cue name="A"><conditions><event_cue_signalled cue="md.X.Y"/></conditions>
    <actions><set_value name="$TheNPC" exact="event.param3"/><do_if value="$TheNPC.roleobject.exists"><debug_text text="'x'"/></do_if></actions></cue></cues></mdscript>`;
  ok('real property read off param3 passes (vanilla rml_deliver_crew shape)',
    !lint(realProp).some(f => f.code === 'md_pitfall.param3_table_barekey'), lint(realProp));
  ok('param3 lint skipped without a property union (never guesses)',
    lintMdPitfalls(bareKey, {}).every(f => f.code !== 'md_pitfall.param3_table_barekey'));

  // --- degradation ---
  ok('non-mdscript degrades to []', lint('<aiscript name="x"/>').length === 0);
  ok('garbage degrades to []', lint('not xml').length === 0);
  ok('empty degrades to []', lint('').length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
