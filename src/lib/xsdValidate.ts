/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Schema-backed XML validation. Builds an element -> allowed-attributes index
 * from the real X4 `.xsd` schema files (md.xsd + common.xsd) and validates
 * generated XML against it. This is a pragmatic subset of full XSD validation:
 * it covers the highest-confidence, highest-value checks —
 *   - enumeration violations (attribute value not in the schema's allowed set)
 *   - missing `use="required"` attributes
 *   - unknown attributes on a recognized element
 *   - unknown elements (info-level, since the schema index can be incomplete)
 * — with raw-text line numbers for actionable sourceRefs. It deliberately does
 * NOT attempt full sequence/cardinality/choice validation.
 */

import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

export interface XsdDiagnostic {
  severity: 'error' | 'warning' | 'info';
  domain: string;
  filePath?: string;
  message: string;
  line?: number;
  sourceRef?: string;
  code?: string;
}

interface AttrSpec {
  required: boolean;
  enumValues?: string[];
  type?: string;
}

interface ElementSpec {
  attributes: Map<string, AttrSpec>;
  /** true when the element's complexType permits arbitrary attributes (anyAttribute) */
  openAttributes: boolean;
  /** true when we successfully resolved the element's type (inline or named) */
  resolved: boolean;
  /** lowercased names of child elements this element may contain (best-effort) */
  children: Set<string>;
}

export interface SchemaIndex {
  elements: Map<string, ElementSpec>; // key: lowercased element name
  loaded: boolean;
  sourceFiles: string[];
  elementCount: number;
}

type AnyNode = Record<string, any>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  allowBooleanAttributes: true,
  trimValues: true
});

function arrayOf<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function collectByKey(node: any, key: string, out: AnyNode[] = []): AnyNode[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(item => collectByKey(item, key, out));
    return out;
  }
  if (node[key]) out.push(...arrayOf(node[key]));
  for (const v of Object.values(node)) collectByKey(v, key, out);
  return out;
}

function collectEnums(node: AnyNode | undefined): string[] {
  if (!node) return [];
  const enums = collectByKey(node, 'xs:enumeration')
    .map(e => e.value)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return Array.from(new Set(enums));
}

// MULTI-SLOT cache (audit A1, 2026-07-09): the old single-slot `cached` let the md and
// aiscripts indexes EVICT EACH OTHER, so every validate/preflight/health-card request
// re-parsed ~2.1MB of XSD (measured: 245-273ms per warm request, dominated by reparse).
// Keyed by the file-path SET; the mtime-key still invalidates on schema edits. Bounded.
const indexCache = new Map<string, { key: string; index: SchemaIndex }>();
const INDEX_CACHE_MAX = 8;

/**
 * Build (and cache) a schema element/attribute index from the given XSD files.
 * Caches on file paths + mtimes so a schema edit invalidates it.
 */
export function buildSchemaIndex(xsdPaths: string[]): SchemaIndex {
  const existing = xsdPaths.filter(p => p && fs.existsSync(p));
  if (!existing.length) {
    return { elements: new Map(), loaded: false, sourceFiles: [], elementCount: 0 };
  }
  const slot = existing.join('|');
  const key = existing.map(p => {
    try { return `${p}:${fs.statSync(p).mtimeMs}`; } catch { return p; }
  }).join('|');
  const cached = indexCache.get(slot);
  if (cached && cached.key === key) return cached.index;

  const roots = existing.map(p => parser.parse(fs.readFileSync(p, 'utf8')));

  // Global named simpleTypes -> enum lists, attributeGroups + complexTypes for ref resolution.
  const simpleTypeEnums: Record<string, string[]> = {};
  const attributeGroups = new Map<string, AnyNode>();
  const complexTypes = new Map<string, AnyNode>();
  const groups = new Map<string, AnyNode>();
  // Named simpleTypes resolve in two passes because of xs:union types: a union's
  // enum set is sound ONLY if EVERY member type is itself fully enumerated. X4's
  // classlookup is `<xs:union memberTypes="positionalclasslookup expression">` plus a
  // tiny inline restriction — collecting just the descendants yielded 2 values and
  // false-errored legal classes (match class="class.spacesuit", proven in-game), while
  // the `expression` member actually makes ANY value legal → no enum restriction at all.
  const simpleTypeRaw = new Map<string, AnyNode>();
  for (const root of roots) {
    arrayOf(root['xs:schema']?.['xs:simpleType']).forEach((st: AnyNode) => {
      if (st.name && !simpleTypeRaw.has(st.name)) simpleTypeRaw.set(st.name, st);
    });
  }
  const resolvedSimpleEnums = new Map<string, string[] | null>(); // null = unrestricted
  const enumsOfSimpleType = (name: string, stack: Set<string>): string[] | null => {
    if (resolvedSimpleEnums.has(name)) return resolvedSimpleEnums.get(name)!;
    const st = simpleTypeRaw.get(name);
    if (!st || stack.has(name)) return null; // unknown / xs:* / cyclic → unrestricted
    stack.add(name);
    let result: string[] | null = null;
    const unionNode = arrayOf(st['xs:union'])[0] as AnyNode | undefined;
    if (unionNode) {
      let all: string[] = [];
      let sound = true;
      for (const mem of String(unionNode.memberTypes || '').split(/\s+/).filter(Boolean)) {
        const e = enumsOfSimpleType(mem, stack);
        if (!e) { sound = false; break; }
        all = all.concat(e);
      }
      if (sound) {
        for (const inline of arrayOf(unionNode['xs:simpleType'])) {
          const e = collectEnums(inline as AnyNode);
          if (!e.length) { sound = false; break; }
          all = all.concat(e);
        }
      }
      result = sound && all.length ? Array.from(new Set(all)) : null;
    } else {
      const e = collectEnums(st);
      result = e.length ? e : null;
    }
    stack.delete(name);
    resolvedSimpleEnums.set(name, result);
    return result;
  };
  for (const name of simpleTypeRaw.keys()) {
    const e = enumsOfSimpleType(name, new Set());
    if (e && e.length) simpleTypeEnums[name] = e;
  }
  for (const root of roots) {
    arrayOf(root['xs:schema']?.['xs:attributeGroup']).forEach((g: AnyNode) => {
      if (g.name) attributeGroups.set(g.name, g);
    });
    arrayOf(root['xs:schema']?.['xs:complexType']).forEach((ct: AnyNode) => {
      if (ct.name) complexTypes.set(ct.name, ct);
    });
    arrayOf(root['xs:schema']?.['xs:group']).forEach((g: AnyNode) => {
      if (g.name) groups.set(g.name, g);
    });
  }

  // Collect the child-element names an element may contain, following named
  // complexTypes (via `type`/`base`) and xs:group references. Best-effort and
  // intentionally over-inclusive (used to avoid false "unknown element" flags).
  function collectChildren(typeNode: AnyNode, into: Set<string>, seenTypes: Set<string>, seenGroups: Set<string>, depth = 0) {
    if (!typeNode || typeof typeNode !== 'object' || depth > 40) return;
    for (const [k, v] of Object.entries(typeNode)) {
      if (k === 'xs:attribute' || k === 'xs:attributeGroup' || k === 'xs:annotation' || k === 'xs:simpleType') continue;
      if (k === 'xs:element') {
        for (const el of arrayOf(v)) {
          const nm = el?.name || el?.ref;
          if (typeof nm === 'string' && nm) into.add(nm.toLowerCase());
          // descend into inline-typed children? No — only THIS element's direct
          // particle membership matters, but X4 nests via groups, handled below.
        }
        continue;
      }
      if (k === 'xs:group') {
        for (const g of arrayOf(v)) {
          const ref = g?.ref || g?.name;
          if (ref && groups.has(ref) && !seenGroups.has(ref)) {
            seenGroups.add(ref);
            collectChildren(groups.get(ref)!, into, seenTypes, seenGroups, depth + 1);
          } else if (g && typeof g === 'object') {
            collectChildren(g, into, seenTypes, seenGroups, depth + 1);
          }
        }
        continue;
      }
      if (k === 'base' && typeof v === 'string' && complexTypes.has(v) && !seenTypes.has(v)) {
        seenTypes.add(v);
        collectChildren(complexTypes.get(v)!, into, seenTypes, seenGroups, depth + 1);
        continue;
      }
      // recurse into structural containers (sequence/choice/all/complexContent/extension/restriction)
      if (typeof v === 'object' && v !== null) collectChildren(v, into, seenTypes, seenGroups, depth + 1);
    }
  }

  const addAttr = (attr: AnyNode, into: Map<string, AttrSpec>) => {
    if (!attr?.name) return;
    const inlineEnums = collectEnums(attr['xs:simpleType']);
    const typeEnums = attr.type ? simpleTypeEnums[attr.type] : undefined;
    const enumValues = inlineEnums.length ? inlineEnums : typeEnums;
    const lname = String(attr.name).toLowerCase();
    const prev = into.get(lname);
    // The same attribute can be declared by MULTIPLE attributeGroups within one type
    // (e.g. matchsubfilter pulls class type="classlookup" via findarbitrary AND
    // class type="entityclasslookup" via matchfilter). Replacement kept whichever came
    // last and false-errored legal values (match class="class.spacesuit", proven
    // in-game). Union when both declare enums; unrestricted when either doesn't.
    let mergedEnums: string[] | undefined;
    if (prev) {
      mergedEnums = (prev.enumValues?.length && enumValues?.length)
        ? Array.from(new Set([...prev.enumValues, ...enumValues]))
        : undefined; // either declaration unrestricted → unrestricted
    } else {
      mergedEnums = enumValues && enumValues.length ? enumValues : undefined;
    }
    into.set(lname, {
      required: Boolean(prev?.required) || attr.use === 'required',
      enumValues: mergedEnums,
      type: attr.type || prev?.type
    });
  };

  const addGroupRefs = (node: AnyNode, into: Map<string, AttrSpec>, seenGroups: Set<string>, open: { v: boolean }) => {
    for (const gref of arrayOf(node['xs:attributeGroup'])) {
      const ref = gref.ref || gref.name;
      if (!ref || seenGroups.has(ref)) continue;
      seenGroups.add(ref);
      const g = attributeGroups.get(ref);
      if (g) collectTypeAttrs(g, into, seenGroups, new Set(), open);
    }
  };

  // Collect ONLY the attributes that belong to this complexType/attributeGroup —
  // its direct xs:attribute/xs:attributeGroup plus those inside
  // complexContent/simpleContent > extension/restriction (following `base`).
  // Deliberately does NOT descend into xs:sequence/choice/all element children.
  function collectTypeAttrs(typeNode: AnyNode, into: Map<string, AttrSpec>, seenGroups: Set<string>, seenTypes: Set<string>, open: { v: boolean }) {
    if (!typeNode || typeof typeNode !== 'object') return;
    if (typeNode['xs:anyAttribute']) open.v = true;
    for (const attr of arrayOf(typeNode['xs:attribute'])) addAttr(attr, into);
    addGroupRefs(typeNode, into, seenGroups, open);

    for (const wrapper of ['xs:complexContent', 'xs:simpleContent']) {
      const content = typeNode[wrapper];
      if (!content) continue;
      for (const deriv of ['xs:extension', 'xs:restriction']) {
        const ext = content[deriv];
        if (!ext) continue;
        if (ext['xs:anyAttribute']) open.v = true;
        for (const attr of arrayOf(ext['xs:attribute'])) addAttr(attr, into);
        addGroupRefs(ext, into, seenGroups, open);
        const base = ext.base;
        if (base && complexTypes.has(base) && !seenTypes.has(base)) {
          seenTypes.add(base);
          collectTypeAttrs(complexTypes.get(base)!, into, seenGroups, seenTypes, open);
        }
      }
    }
  }

  const resolveElementAttrs = (el: AnyNode): { attrs: Map<string, AttrSpec>; open: boolean; resolved: boolean; children: Set<string> } => {
    const into = new Map<string, AttrSpec>();
    const children = new Set<string>();
    const open = { v: false };
    let resolved = false;
    // inline complexType
    if (el['xs:complexType']) {
      collectTypeAttrs(el['xs:complexType'], into, new Set(), new Set(), open);
      collectChildren(el['xs:complexType'], children, new Set(), new Set());
      resolved = true;
    }
    // named type reference
    if (typeof el.type === 'string' && complexTypes.has(el.type)) {
      const t = complexTypes.get(el.type)!;
      collectTypeAttrs(t, into, new Set(), new Set([el.type]), open);
      collectChildren(t, children, new Set([el.type]), new Set());
      resolved = true;
    }
    return { attrs: into, open: open.v, resolved, children };
  };

  const elements = new Map<string, ElementSpec>();
  const addElement = (name: string, attrs: Map<string, AttrSpec>, open: boolean, resolved: boolean, children: Set<string>) => {
    const lname = name.toLowerCase();
    const prev = elements.get(lname);
    if (prev) {
      // The same element name can have context-dependent definitions in md.xsd — e.g.
      // <param> under <library><params> takes name+default, but under <run_actions> it
      // requires `value`. This index is keyed by name only, so an attribute is required in
      // the merged spec ONLY if it is present-and-required in EVERY definition. Walk the
      // UNION of keys so an attr required in one def but ABSENT in another is relaxed to
      // optional (the old loop visited only the new def's attrs, leaving a prev-only required
      // attr stuck required — the source of the false "param missing required value" warning).
      const keys = new Set<string>([...prev.attributes.keys(), ...attrs.keys()]);
      for (const k of keys) {
        const p = prev.attributes.get(k);
        const v = attrs.get(k);
        // Enum merge must be the UNION of the definitions that declare the attribute —
        // the same element name has context-dependent enums in the schemas (e.g. <match>
        // class allows different classlookup subsets per context), and this index is
        // keyed by name only. Replacement kept only one context's enum and false-errored
        // legal, in-game-proven values (found grounding against x4_ai_influence). If a
        // definition declares the attr WITHOUT an enum restriction, the merged attr is
        // unrestricted (an unrestricted context makes any value legal somewhere).
        let enumValues: string[] | undefined;
        if (p && v) {
          enumValues = (p.enumValues?.length && v.enumValues?.length)
            ? Array.from(new Set([...p.enumValues, ...v.enumValues]))
            : undefined;
        } else {
          enumValues = (p?.enumValues) || (v?.enumValues);
        }
        prev.attributes.set(k, {
          required: Boolean(p?.required) && Boolean(v?.required),
          enumValues: enumValues && enumValues.length ? enumValues : undefined,
          type: (v?.type) || p?.type
        });
      }
      prev.openAttributes = prev.openAttributes || open;
      prev.resolved = prev.resolved || resolved;
      for (const c of children) prev.children.add(c);
    } else {
      elements.set(lname, { attributes: attrs, openAttributes: open, resolved, children });
    }
  };

  for (const root of roots) {
    for (const el of collectByKey(root, 'xs:element')) {
      const name = el?.name;
      if (typeof name !== 'string' || !name) continue;
      const { attrs, open, resolved, children } = resolveElementAttrs(el);
      addElement(name, attrs, open, resolved, children);
    }
  }

  const index: SchemaIndex = { elements, loaded: true, sourceFiles: existing, elementCount: elements.size };
  if (indexCache.size >= INDEX_CACHE_MAX && !indexCache.has(slot)) {
    const oldest = indexCache.keys().next().value;
    if (oldest !== undefined) indexCache.delete(oldest);
  }
  indexCache.set(slot, { key, index });
  return index;
}

interface RawTag {
  name: string;
  attrs: { name: string; value: string }[];
  line: number;
  selfClosing: boolean;
}

/** Lightweight scanner: yields each opening/self-closing tag with line numbers. */
function scanTags(xml: string): RawTag[] {
  const tags: RawTag[] = [];
  // Mask out comment / CDATA / PI spans so their contents are not scanned as real
  // tags (e.g. a doc comment mentioning "<do_if>" must not be flagged as an element
  // missing its "value" attribute). Replace non-newline chars with spaces to keep
  // byte offsets and line numbers identical to the source.
  const masked = xml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    (s) => s.replace(/[^\n]/g, ' '),
  );
  // match opening or self-closing tags, skip closing tags, comments, PIs, declarations
  const re = /<([a-zA-Z_][\w.-]*)((?:\s+[\w.\-:]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const before = masked.slice(0, m.index);
    const line = before.split('\n').length;
    const name = m[1];
    const attrStr = m[2] || '';
    const attrs: { name: string; value: string }[] = [];
    const attrRe = /([\w.\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrStr)) !== null) {
      attrs.push({ name: a[1], value: a[2] !== undefined ? a[2] : (a[3] || '') });
    }
    tags.push({ name, attrs, line, selfClosing: m[3] === '/' });
  }
  return tags;
}

// Structural/known tags that may not carry attribute specs in our index but are
// valid; never report these as "unknown element".
const ALWAYS_KNOWN = new Set([
  'mdscript', 'cues', 'cue', 'cues', 'library', 'conditions', 'actions', 'params', 'param',
  'attention', 'check_value', 'check_any', 'check_all', 'do_if', 'do_else', 'do_elseif',
  'do_all', 'do_any', 'do_while', 'do_for_each', 'set_value', 'patch', 'diff', 'add', 'replace',
  'remove', 'aiscript', 'order', 'init', 'interrupt', 'blocks', 'resume', 'label', 'sumitemstodo'
]);

export interface ValidateOptions {
  filePath?: string;
  domain?: string;
  reportUnknownElements?: boolean; // default false (info-only, can false-positive)
  reportUnknownAttributes?: boolean; // default true (warning)
  checkTimeFormat?: boolean; // default true
  /**
   * Real game-data reference sets, keyed by the schema's semantic attribute
   * types. When provided, literal values of attributes with that type are
   * checked for existence (catches runtime "no ship generated" / unknown id).
   */
  references?: {
    macros?: Set<string>;   // type "macroname"/"macro"
    wares?: Set<string>;    // type "warename"/"ware" (literal only)
    factions?: Set<string>; // type "faction" (literal only)
  };
}

// X4 time-typed attributes are schema-typed as permissive "expression", so the
// XSD can't catch a bare number. These names are time values at runtime and a
// literal integer without a unit (e.g. "8") fails as "not of type time".
const TIME_ATTR_NAMES = new Set(['duration', 'timeout', 'delay', 'interval']);

/** A literal (non-expression) reference value we can check against an index. */
function isLiteralRef(v: string): boolean {
  return !!v && !/[{}$\s]/.test(v) && !v.includes('.');
}

/**
 * Validate XML text against the schema index. Returns diagnostics for enum
 * violations (error), missing required attributes (warning), unknown attributes
 * (warning), and optionally unknown elements (info).
 */
export function validateXmlAgainstSchema(xml: string, index: SchemaIndex, opts: ValidateOptions = {}): XsdDiagnostic[] {
  const out: XsdDiagnostic[] = [];
  if (!index.loaded || !index.elements.size) return out;
  const domain = opts.domain || 'md';
  const filePath = opts.filePath;
  const reportUnknownAttr = opts.reportUnknownAttributes !== false;
  const reportUnknownEl = opts.reportUnknownElements === true;

  for (const tag of scanTags(xml)) {
    const lname = tag.name.toLowerCase();
    const spec = index.elements.get(lname);

    if (!spec) {
      if (reportUnknownEl && !ALWAYS_KNOWN.has(lname)) {
        // WARNING (not info): an element the game schema doesn't recognize is a real
        // risk — almost always a typo or a fabricated element name. Surfacing it as a
        // warning makes it count in the Doctor and matches the on-canvas node badge,
        // instead of being buried as info. The wording stays honest about the rare
        // schema-incompleteness case.
        out.push({
          severity: 'warning',
          domain,
          filePath,
          line: tag.line,
          sourceRef: `${tag.name}`,
          code: 'XSD_UNKNOWN_ELEMENT',
          message: `Element <${tag.name}> is not declared in the game schema (md.xsd/common.xsd) — likely a typo or wrong element name. (If it is a deliberate custom element, it can be ignored.)`
        });
      }
      continue;
    }

    const present = new Set(tag.attrs.map(a => a.name.toLowerCase()));

    // enum + unknown-attr checks
    for (const attr of tag.attrs) {
      const aname = attr.name.toLowerCase();
      if (aname.startsWith('xmlns') || aname.startsWith('xsi:')) continue;
      const aspec = spec.attributes.get(aname);
      if (!aspec) {
        // Only flag unknown attributes when we actually resolved this element's
        // attribute set; otherwise we'd false-positive on unresolved types.
        if (reportUnknownAttr && !spec.openAttributes && spec.resolved && spec.attributes.size > 0) {
          out.push({
            severity: 'warning',
            domain,
            filePath,
            line: tag.line,
            sourceRef: `${tag.name}@${attr.name}`,
            code: 'XSD_UNKNOWN_ATTRIBUTE',
            message: `<${tag.name}> has attribute "${attr.name}" which is not declared for this element in the schema.`
          });
        }
        continue;
      }
      if (aspec.enumValues && aspec.enumValues.length && attr.value && !/[{[$]/.test(attr.value)) {
        // skip MD expressions like {param.x}, list literals like [class.ship_l, class.ship_m],
        // and $variable values; only validate plain literal values
        const ok = aspec.enumValues.some(v => v.toLowerCase() === attr.value.toLowerCase());
        if (!ok) {
          out.push({
            severity: 'error',
            domain,
            filePath,
            line: tag.line,
            sourceRef: `${tag.name}@${attr.name}`,
            code: 'XSD_ENUM_VIOLATION',
            message: `<${tag.name}> attribute "${attr.name}"="${attr.value}" is not a valid value. Allowed: ${aspec.enumValues.slice(0, 12).join(', ')}${aspec.enumValues.length > 12 ? ', …' : ''}.`
          });
        }
      }

      // Time-format check (schema type is permissive "expression", so this is a
      // curated semantic rule): a bare integer on a time attribute fails at runtime.
      if (opts.checkTimeFormat !== false && TIME_ATTR_NAMES.has(aname) && attr.value && /^\d+(\.\d+)?$/.test(attr.value)) {
        out.push({
          severity: 'warning',
          domain,
          filePath,
          line: tag.line,
          sourceRef: `${tag.name}@${attr.name}`,
          code: 'XSD_TIME_FORMAT',
          message: `<${tag.name}> attribute "${attr.name}"="${attr.value}" looks like a time but has no unit. X4 rejects bare numbers for time values at runtime — use "${attr.value}s" (or ms/min/h).`
        });
      }

      // Faction reference: the explicit "faction.<id>" literal form is
      // unambiguous (unlike bare expressions), so validate it even though the
      // schema type is often an expression union.
      if (opts.references?.factions?.size && attr.value && /^faction\.\w+$/i.test(attr.value)) {
        if (!opts.references.factions.has(attr.value.toLowerCase())) {
          out.push({
            severity: 'error', domain, filePath, line: tag.line,
            sourceRef: `${tag.name}@${attr.name}`, code: 'REF_UNKNOWN_FACTION',
            message: `<${tag.name}> ${attr.name}="${attr.value}" is not a known faction. Valid factions come from libraries/factions.xml in the indexed game data.`
          });
        }
      }

      // Reference existence check, driven by the schema's semantic type.
      const refs = opts.references;
      if (refs && attr.value && isLiteralRef(attr.value)) {
        const t = (aspec.type || '').toLowerCase();
        const lv = attr.value.toLowerCase();
        if ((t === 'macroname' || t === 'macro') && refs.macros && refs.macros.size && !refs.macros.has(lv)) {
          out.push({
            severity: 'error', domain, filePath, line: tag.line,
            sourceRef: `${tag.name}@${attr.name}`, code: 'REF_UNKNOWN_MACRO',
            message: `<${tag.name}> ${attr.name}="${attr.value}" is not a known macro in the indexed game data (${refs.macros.size} macros). X4 will not resolve it at runtime — pick a real macro from the Object Browser.`
          });
        } else if ((t === 'warename' || t === 'ware') && refs.wares && refs.wares.size && !refs.wares.has(lv)) {
          out.push({
            severity: 'warning', domain, filePath, line: tag.line,
            sourceRef: `${tag.name}@${attr.name}`, code: 'REF_UNKNOWN_WARE',
            message: `<${tag.name}> ${attr.name}="${attr.value}" is not a known ware id in the indexed game data (${refs.wares.size} wares).`
          });
        }
      }
    }

    // required attribute presence.
    // On event-condition elements (event_*) this is an ERROR, not a warning: a listener
    // missing a schema-required attribute (e.g. bare <event_offer_accepted/> without
    // `cue`) silently never registers in-game — the mod looks fine and does nothing
    // (ROADMAP gap #8, x4_ai_influence G3 AAR 2026-07-01: cost a full live-test cycle).
    for (const [aname, aspec] of spec.attributes) {
      if (aspec.required && !present.has(aname)) {
        const isEventCondition = lname.startsWith('event_');
        out.push({
          severity: isEventCondition ? 'error' : 'warning',
          domain,
          filePath,
          line: tag.line,
          sourceRef: `${tag.name}@${aname}`,
          code: 'XSD_MISSING_REQUIRED',
          message: isEventCondition
            ? `<${tag.name}> is missing required attribute "${aname}" per the schema. An event condition missing a required attribute silently never registers in-game — the cue will never fire.`
            : `<${tag.name}> is missing required attribute "${aname}" per the schema.`
        });
      }
    }
  }

  return out;
}
