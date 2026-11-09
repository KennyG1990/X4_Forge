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
 *   4. `md_pitfall.cancel_conversation_actor_or_template` — X4 emits a startup/load ERROR when
 *      <cancel_conversation> has neither actor nor template, even though common.xsd leaves each
 *      attribute individually optional. This is a blocking runtime-semantic check, not an XSD rule.
 *
 *  FALSIFIED BY GROUNDING (deliberately NOT shipped — recorded so nobody re-adds them):
 *   - "event_* handler without instantiate → warn" (6321 vanilla uses).
 *   - "instantiated cue setting $vars without namespace='this' → warn" (1345 vanilla uses).
 *
 * House pattern: pure engine + oracle + public GET. xmldom for cue-tree structure.
 */

import { DOMParser, normalizeLineEndings, type Attr, type Document, type Element } from '@xmldom/xmldom';
import { lintMdExpressionRules, type MdExpressionFinding } from './expressionAst';
import { maskNonExpressionSpans, type ScriptPropertyIndex } from './scriptProperties';
import { assertXmlInputWithinLimits } from './xmlInputLimits';
import type { SchemaIndex } from './xsdValidate';

export interface MdPitfallFinding {
  code: 'md_pitfall.products_existence' | 'md_pitfall.cancel_conversation_actor_or_template' | 'md_pitfall.ui_listener_one_shot' | 'md_pitfall.offer_accepted_keyword_cue' | 'md_pitfall.param3_table_barekey' | MdExpressionFinding['code'];
  severity: 'error' | 'warning';
  cue?: string;
  filePath?: string;
  line?: number;
  column?: number;
  sourceRef?: string;
  detail: string;
}

import { directElementChildren, type ElementLike } from './xmlLite';

function lineOf(haystack: string, needleIndex: number): number {
  return haystack.slice(0, Math.max(0, needleIndex)).split('\n').length;
}

const EXPRESSION_TYPE = /^(?:\w+:)?(?:lvalue|boolean)?expression$/i;

/** Translate a decoded attribute offset to a one-based raw XML source position. */
function expressionLocation(source: string, lines: number[], attr: Attr, offset: number) {
  const fallback = { line: attr.lineNumber, column: attr.columnNumber };
  if (!attr.lineNumber || !attr.columnNumber) return fallback;
  let line = attr.lineNumber;
  const quoteAt = lines[line - 1] + attr.columnNumber - 1;
  const quote = source[quoteAt];
  if (quote !== '"' && quote !== "'") return fallback;
  const end = source.indexOf(quote, quoteAt + 1);
  const entity = /&(?:#(x[\da-f]+|\d+)|amp|apos|quot|lt|gt);/iy;
  let index = quoteAt + 1;
  for (let decoded = 0; decoded < offset && index < end; decoded++) {
    entity.lastIndex = index;
    const match = source[index] === '&' ? entity.exec(source) : null;
    if (match) {
      const numeric = match[1];
      const value = numeric?.startsWith('x') ? parseInt(numeric.slice(1), 16) : Number(numeric);
      if (value > 0xffff) decoded++;
      index = entity.lastIndex;
    } else {
      index++;
    }
  }
  if (index >= end) return fallback;
  while (lines[line] !== undefined && lines[line] <= index) line++;
  return { line, column: index - lines[line - 1] + 1 };
}

/** Validate expression-valued attributes in script files and their XML diff payloads. */
export function lintScriptExpressions(xml: string, schema: SchemaIndex | null, filePath?: string): MdPitfallFinding[] {
  if (!/\belse\b|[%{]|&#/.test(xml) && !(xml.includes('@') && xml.includes('?'))) return [];
  const source = normalizeLineEndings(xml.replace(/^\uFEFF/, ''));
  let invalid = false;
  let doc;
  try {
    assertXmlInputWithinLimits(source);
    doc = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(source, 'text/xml');
  } catch { return []; }
  if (invalid || !['mdscript', 'aiscript', 'diff'].includes(doc.documentElement?.nodeName ?? '')) return [];

  const findings: MdPitfallFinding[] = [];
  const elements = doc.getElementsByTagName('*');
  let lines: number[] | undefined;
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const attributes = schema?.elements.get(element.nodeName)?.attributes;
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const spec = attributes?.get(attr.name);
      const knownExpression = (element.nodeName === 'set_value' && attr.name === 'exact')
        || (element.nodeName === 'debug_text' && attr.name === 'text')
        || (element.nodeName === 'do_if' && attr.name === 'value');
      if (!knownExpression
        && !EXPRESSION_TYPE.test(spec?.type ?? '') && !EXPRESSION_TYPE.test(spec?.baseType ?? '')) continue;
      for (const finding of lintMdExpressionRules(attr.value)) {
        lines ??= [0, ...Array.from(source.matchAll(/\n/g), match => match.index + 1)];
        findings.push({
          code: finding.code, severity: finding.severity, filePath,
          sourceRef: `${element.nodeName}/@${attr.name}`,
          ...expressionLocation(source, lines, attr, finding.offset),
          detail: finding.message,
        });
      }
    }
  }
  return findings;
}

/** Preserve source offsets while excluding markup-looking content that is not an element. */
function maskXmlDecoys(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, match => match.replace(/[^\r\n]/g, ' '));
}

/** Find real opening-tag offsets after comments and CDATA have been masked. */
function openingTagOffsets(xml: string, elementName: string): number[] {
  const masked = maskXmlDecoys(xml);
  const re = new RegExp(`<${elementName}(?=[\\s/>])`, 'g');
  const offsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null) {
    let quote = '';
    let end = match.index + match[0].length;
    for (; end < masked.length; end++) {
      const ch = masked[end];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    if (end < masked.length && !quote) offsets.push(match.index);
  }
  return offsets;
}

function hasXmlAttribute(element: ElementLike, name: string): boolean {
  const candidate = element as unknown as { hasAttribute?: (attributeName: string) => boolean };
  if (typeof candidate.hasAttribute === 'function') return candidate.hasAttribute(name);
  const openingTag = element.toString().match(/^<[^>]*>/s)?.[0] || '';
  return new RegExp(`\\b${name}\\s*=`, 'i').test(openingTag);
}

function enclosingNamedCue(element: Element): string | undefined {
  const names: string[] = [];
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'cue' && parent.tagName !== 'library') continue;
    const name = parent.getAttribute('name');
    if (!name) return undefined;
    names.push(name);
  }
  return names.length ? names.reverse().join('.') : undefined;
}

/**
 * Lint one MD file. `propertyUnion` (from the scriptproperty index) makes the param3
 * lint union-aware; without it the param3 lint stays conservative (identifier must
 * look like a custom key: it is flagged only when it contains no known-property hit,
 * so with no union supplied we skip the lint entirely rather than guess).
 */
export function lintMdPitfalls(xml: string, opts: { propertyUnion?: Set<string>; propertyIndex?: ScriptPropertyIndex; filePath?: string } = {}): MdPitfallFinding[] {
  const out: MdPitfallFinding[] = [];
  if (!xml || typeof xml !== 'string' || !/<mdscript\b/i.test(xml)) return out;
  const masked = maskNonExpressionSpans(xml);

  // DOM parse for the cue-tree lints
  let doc: Document;
  let parseError = false;
  try {
    doc = new DOMParser({ onError: () => { parseError = true; } }).parseFromString(xml, 'text/xml');
  } catch { return out; }
  const element = doc.documentElement;
  // Non-MD and malformed XML produce no semantic finding here; structural/wellformedness validation owns those diagnostics.
  if (!element || element.nodeName !== 'mdscript' || parseError) return out;
  const root = element as unknown as ElementLike;

  const offerOccurrences = new Map<string, number>();
  for (const event of Array.from(element.getElementsByTagName('event_offer_accepted'))) {
    const attribute = event.getAttributeNode('cue');
    if (!attribute || !/^(parent|this|static)$/i.test(attribute.value)) continue;
    const cue = enclosingNamedCue(event);
    const key = JSON.stringify([cue, attribute.value]);
    const occurrence = (offerOccurrences.get(key) ?? 0) + 1;
    offerOccurrences.set(key, occurrence);
    out.push({
      code: 'md_pitfall.offer_accepted_keyword_cue',
      severity: 'warning',
      filePath: opts.filePath,
      cue,
      // Remembered reviews distinguish source references independently of columns.
      sourceRef: occurrence > 1 ? `#${occurrence} ${cue ?? 'event_offer_accepted'}` : cue,
      line: attribute.lineNumber ?? event.lineNumber,
      column: attribute.columnNumber ?? event.columnNumber,
      detail: `<event_offer_accepted cue="${attribute.value}"> validates clean but never fires in-game — the engine does not resolve cue keywords for this event at register time (proven 2026-07-01; also kuertee: "event_offer_accepted doesn't work"). Use the proven accept pattern instead: listen <event_object_signalled object="$Client" param="'accept'"/> after create_mission / set_objective, or store the offer cue in a variable (<set_value name="$OfferCue" exact="this"/> … cue="$OfferCue").${opts.filePath ? ` (${opts.filePath})` : ''}`,
    });
  }

  // Prior X4 9.00 station probe (#635): products? was false on producing stations,
  // whereas products.count worked. Gate the advisory on actual corpus metadata;
  // do not infer a receiver type or generalize to every pseudo datatype.
  const model = opts.propertyIndex?.model;
  const productDefinitions = model ? [...model.datatypes.values()].flatMap(entry =>
    entry.properties.filter(property => property.name === 'products')) : [];
  if (model?.datatypes.get('warelist')?.pseudo && productDefinitions.length
    && productDefinitions.every(property => property.type === 'warelist')) {
    const elements = root.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i] as unknown as { attributes: ArrayLike<{ name: string; value: string }>; lineNumber?: number };
      for (let a = 0; a < element.attributes.length; a++) {
        const attr = element.attributes[a];
        // Expression-valued attributes only. DOM decoding precedes MD string masking.
        if (!['value', 'exact', 'min', 'max', 'chance', 'weight'].includes(attr.name)) continue;
        const expression = attr.value.replace(/'[^']*'|"[^"]*"/g, match => ' '.repeat(match.length));
        if (!/\.products\?(?![\w$])/.test(expression)) continue;
        out.push({ code: 'md_pitfall.products_existence', severity: 'warning', filePath: opts.filePath,
          line: element.lineNumber,
          detail: 'Reported X4 9.00 station trap: .products? returned false on producing stations. The loaded scriptproperties.xml defines products as pseudo warelist. For a valid station, test .products.count gt 0 before selecting a product. Receiver type and current game behavior are not established by this advisory; .$products? table keys are a different expression.' });
      }
    }
  }

  // ---- 4. cancel_conversation runtime semantic requiredness -----------------------------
  const cancelElements = root.getElementsByTagName('cancel_conversation');
  const cancelOffsets = openingTagOffsets(xml, 'cancel_conversation');
  for (let index = 0; index < cancelElements.length; index++) {
    const element = cancelElements[index];
    if (hasXmlAttribute(element, 'actor') || hasXmlAttribute(element, 'template')) continue;
    const offset = cancelOffsets[index];
    if (offset === undefined) continue; // skip when exact source mapping is unavailable; never fabricate a finding.
    out.push({
      code: 'md_pitfall.cancel_conversation_actor_or_template',
      severity: 'error',
      filePath: opts.filePath,
      line: lineOf(xml, offset),
      detail: `X4 emits the engine ERROR "Neither of the attributes 'actor' and 'template' is present!" at startup/load when <cancel_conversation> has neither attribute. This makes Forge validation non-clean; the engine diagnostic alone does not establish whole-file or whole-frame failure (the tested compact/expanded UI still rendered and END closed the conversation). Use a valid target, for example <cancel_conversation actor="$Guide"/> or <cancel_conversation template="$Guide" context="$Context"/>. X4 common.xsd marks actor and template individually optional; this is a runtime semantic rule, not an XSD-enforced disjunction.`,
    });
  }

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
  const orphan = '  <set_value name="$probe" exact="$n &lt; 5 &#101;lse 0"/>';
  const expressionXml = [
    '<mdscript name="ElseProbe">',
    '  <!-- <set_value exact="else"/> -->',
    '  <![CDATA[<set_value exact="else"/>]]>',
    '  <set_value name="$else" exact="\'else\'" comment="else"/>',
    orphan,
    '</mdscript>',
  ].join('\r\n');
  const expressionFindings = lintScriptExpressions(expressionXml, null, 'md/probe.xml');
  ok('unmatched_else_uses_decoded_attributes_and_raw_coordinates',
    expressionFindings.length === 1 && expressionFindings[0].line === 5
    && expressionFindings[0].column === orphan.indexOf('&#101;') + 1
    && expressionFindings[0].sourceRef === 'set_value/@exact', expressionFindings);
  ok('unmatched_else_ignores_non_script_root_and_invalid_xml',
    lintScriptExpressions('<root><set_value exact="else"/></root>', null).length === 0
    && lintScriptExpressions('<mdscript><set_value exact="else"/></invalid>', null).length === 0);
  const formatLine = '    <debug_text text="&apos;&#37;d&apos;.[7]"/>';
  const formatFindings = lintScriptExpressions([
    '<aiscript><actions>', formatLine, '    <set_value name="$out" exact="\'%s %s\'.[1]"/>', '</actions></aiscript>',
  ].join('\r\n'), null, 'aiscripts/format.xml');
  ok('literal format findings retain decoded severity and raw coordinates',
    formatFindings.length === 2 && formatFindings[0].code === 'expression-format-specifier'
      && formatFindings[0].severity === 'error' && formatFindings[0].line === 2
      && formatFindings[0].column === formatLine.indexOf('&#37;') + 1
      && formatFindings[0].sourceRef === 'debug_text/@text'
      && formatFindings[1].code === 'format-arguments-missing' && formatFindings[1].severity === 'warning', formatFindings);
  const mixedLine = '    <do_if value="not &#64;$ship.pilot.seed&#63;" comment="@$decoy?"/>';
  const mixedFindings = lintScriptExpressions([
    '<mdscript>', '  <!-- <do_if value="@$decoy?"/> -->', mixedLine, '</mdscript>',
  ].join('\r\n'), null, 'md/mixed.xml');
  ok('mixed access reports raw XML coordinates without a schema index',
    mixedFindings.length === 1 && mixedFindings[0].code === 'expression-null-safe-exists'
      && mixedFindings[0].severity === 'error' && mixedFindings[0].line === 3
      && mixedFindings[0].column === mixedLine.indexOf('&#64;') + 1
      && mixedFindings[0].sourceRef === 'do_if/@value', mixedFindings);
  ok('mixed access alone triggers script scanning',
    lintScriptExpressions('<aiscript><do_if value="not @$ship.pilot.seed?"/></aiscript>', null).length === 1
    && lintScriptExpressions('<aiscript><do_if value="not @$ship.pilot or $ship.pilot.seed?"/></aiscript>', null).length === 0);
  const referenceLine = '    <debug_text text="&#123;$page,$id&#125;" comment="{$decoy,$id}"/>';
  const referenceFindings = lintScriptExpressions([
    '<mdscript>', '  <!-- <debug_text text="{$decoy,$id}"/> -->', referenceLine, '</mdscript>',
  ].join('\r\n'), null, 'md/textref.xml');
  ok('TextDB shorthand reports raw entity coordinates without a schema index',
    referenceFindings.length === 1 && referenceFindings[0].code === 'expression-text-reference'
      && referenceFindings[0].severity === 'error' && referenceFindings[0].line === 3
      && referenceFindings[0].column === referenceLine.indexOf('&#123;') + 1
      && referenceFindings[0].sourceRef === 'debug_text/@text', referenceFindings);
  ok('literal TextDB shorthand is checked in AIScript with no other fast filter triggers',
    lintScriptExpressions('<aiscript><set_value exact="{$page,$id}"/></aiscript>', null).length === 1
    && lintScriptExpressions('<aiscript><set_value exact="readtext.{$page}.{$id}"/></aiscript>', null).length === 0);
  const cancelFindingCode = 'md_pitfall.cancel_conversation_actor_or_template';
  const cancelFindings = (xml: string) => lint(xml).filter(f => f.code === cancelFindingCode);

  // --- 0. cancel_conversation engine semantic requiredness ------------------------------
  const cancelMissing = [
    '<mdscript name="T">',
    '  <cues>',
    '    <cue name="A">',
    '      <actions>',
    '        <cancel_conversation force="true"/>',
    '      </actions>',
    '    </cue>',
    '  </cues>',
    '</mdscript>',
  ].join('\n');
  const missingCancel = cancelFindings(cancelMissing);
  ok('cancel_conversation without actor/template is one blocking finding',
    missingCancel.length === 1
      && missingCancel[0]?.severity === 'error'
      && missingCancel[0]?.line === 5
      && missingCancel[0]?.detail.includes('Neither of the attributes')
      && missingCancel[0]?.detail.includes('at startup/load')
      && missingCancel[0]?.detail.includes('does not establish whole-file or whole-frame failure')
      && !/\b(?:rejects|rejected)\b/i.test(missingCancel[0]?.detail || '')
      && missingCancel[0]?.detail.includes('<cancel_conversation actor="$Guide"/>')
      && missingCancel[0]?.detail.includes('<cancel_conversation template="$Guide" context="$Context"/>'),
    missingCancel);
  const cancelWithStructuredPath = lintMdPitfalls(cancelMissing, {
    propertyUnion: UNION_FIXTURE,
    filePath: 'md/ai_influence_conversation.xml',
  }).filter(f => f.code === cancelFindingCode);
  ok('cancel_conversation keeps structured file location without duplicate prose path',
    cancelWithStructuredPath.length === 1
      && cancelWithStructuredPath[0]?.filePath === 'md/ai_influence_conversation.xml'
      && cancelWithStructuredPath[0]?.line === 5
      && !cancelWithStructuredPath[0]?.detail.includes('md/ai_influence_conversation.xml'),
    cancelWithStructuredPath);
  ok('cancel_conversation actor form passes', cancelFindings(cancelMissing.replace(' force="true"', ' force="true" actor="$Guide"')).length === 0);
  ok('cancel_conversation template form passes', cancelFindings(cancelMissing.replace(' force="true"', ' force="true" template="$Guide" context="$Context"')).length === 0);
  ok('cancel_conversation with neither attribute fails', cancelFindings(cancelMissing).some(f => f.severity === 'error'));
  const cancelDecoys = `<mdscript name="T"><cues><cue name="A"><actions>
    <!-- <cancel_conversation force="true"/> -->
    <![CDATA[<cancel_conversation force="true"/>]]>
    <debug_text text="'&lt;cancel_conversation force=&quot;true&quot;/&gt;'"/>
    <conversation force="true"/>
  </actions></cue></cues></mdscript>`;
  ok('cancel_conversation decoys and unrelated tags stay quiet', cancelFindings(cancelDecoys).length === 0, cancelFindings(cancelDecoys));
  ok('cancel_conversation semantic lint skips non-mdscript, malformed, and garbage input',
    cancelFindings('<aiscript><cancel_conversation force="true"/></aiscript>').length === 0
      && cancelFindings('<mdscript><cancel_conversation force="true"></mdscript>').length === 0
      && cancelFindings('not xml').length === 0);

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
  const nestedOffers = [
    '<mdscript name="T"><cues>',
    '<cue name="Left"><cues><cue name="Listen"><conditions><event_offer_accepted cue="this"/></conditions></cue></cues></cue>',
    '<cue name="Right"><cues><cue name="Listen"><conditions><event_offer_accepted cue=\'this\'/></conditions></cue></cues></cue>',
    '<!-- <event_offer_accepted cue="this"/> -->',
    '</cues></mdscript>',
  ].join('\n');
  const offers = lintMdPitfalls(nestedOffers, { filePath: 'md/probe.xml' });
  ok('offer keywords retain distinct cue ancestry and attribute locations',
    offers.length === 2 && offers[0].cue === 'Left.Listen' && offers[1].cue === 'Right.Listen'
    && offers.every((finding, index) => finding.filePath === 'md/probe.xml' && finding.line === index + 2
      && finding.column === nestedOffers.split('\n')[index + 1].indexOf('cue=') + 5), offers);

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
