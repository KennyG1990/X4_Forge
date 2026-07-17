/**
 * langService.ts — B56s3 (2026-07-17): X4 IntelliSense data layer.
 *
 * Pure functions the /api/agent/lang/* endpoints expose to the IDE extension's
 * completion/hover providers. Everything is derived from EXISTING truth — the validation
 * SchemaIndex (children/attributes/enums), the census-derived curation
 * (nodeToolbox.CENSUS_TOP_52_TAGS), and the curated element semantics (mdSemantics) —
 * no new vocabulary is invented here (one-referee rule).
 */

import { CENSUS_TOP_52_TAGS } from './nodeToolbox';
import { getElementSemantics, type ElementSemantics } from './mdSemantics';
import type { SchemaIndex } from './xsdValidate';

export interface LangCompletionItem {
  tag: string;
  /** census-curated tags float first for md — mirrors the Toolbox's Curated discipline */
  curated: boolean;
  requiredAttrs: string[];
  /** one-line curated summary when the semantics corpus has one */
  summary?: string;
}

export interface LangAttribute {
  name: string;
  required: boolean;
  type?: string;
  enumValues?: string[];
}

/** JSON-safe view of the curated semantics (ElementSemantics.describe is a function). */
export interface LangSemanticsView {
  kind: string;
  title: string;
  risk: string;
  reads: string[];
  writes: string[];
  description?: string;
  note?: string;
}

export interface LangHover {
  tag: string;
  known: boolean;
  summary?: string;
  semantics?: LangSemanticsView;
  requiredAttrs: string[];
  attrCount: number;
}

function semanticsView(sem: ElementSemantics | null): LangSemanticsView | undefined {
  if (!sem) return undefined;
  let description: string | undefined;
  try { description = sem.describe({}); } catch { /* describe must never throw, but stay safe */ }
  return {
    kind: sem.kind,
    title: sem.title,
    risk: String(sem.risk),
    reads: sem.reads || [],
    writes: sem.writes || [],
    ...(description ? { description } : {}),
    ...(sem.note ? { note: sem.note } : {}),
  };
}

const CENSUS_RANK = new Map(CENSUS_TOP_52_TAGS.map((t, i) => [t.toLowerCase(), i]));

function requiredAttrsOf(index: SchemaIndex, tag: string): string[] {
  const spec = index.elements.get(tag.toLowerCase());
  if (!spec) return [];
  const out: string[] = [];
  for (const [name, attr] of spec.attributes) if (attr.required) out.push(name);
  return out.sort();
}

/**
 * Legal child elements of `parentTag` per the schema index, census-curated first.
 * An unknown/unresolvable parent returns [] — NEVER the whole vocabulary (a wrong
 * completion list is worse than none; the cry-wolf rule applied to suggestions).
 */
export function completeChildren(index: SchemaIndex, parentTag: string | null | undefined): LangCompletionItem[] {
  if (!index?.loaded || !parentTag) return [];
  const parent = index.elements.get(parentTag.toLowerCase());
  if (!parent || !parent.children.size) return [];
  const items: LangCompletionItem[] = [];
  for (const child of parent.children) {
    if (!index.elements.has(child)) continue; // wildcard/unresolved names never suggested
    const sem = getElementSemantics(child);
    items.push({
      tag: child,
      curated: CENSUS_RANK.has(child),
      requiredAttrs: requiredAttrsOf(index, child),
      ...(sem?.title ? { summary: sem.title } : {}),
    });
  }
  items.sort((a, b) => {
    const ra = CENSUS_RANK.get(a.tag) ?? Number.MAX_SAFE_INTEGER;
    const rb = CENSUS_RANK.get(b.tag) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.tag.localeCompare(b.tag);
  });
  return items;
}

/** Declared attributes of `tag` (name/required/type/enums), required first then alpha. */
export function attributesFor(index: SchemaIndex, tag: string | null | undefined): LangAttribute[] {
  if (!index?.loaded || !tag) return [];
  const spec = index.elements.get(tag.toLowerCase());
  if (!spec || !spec.resolved) return [];
  const out: LangAttribute[] = [];
  for (const [name, attr] of spec.attributes) {
    out.push({
      name,
      required: !!attr.required,
      ...(attr.type ? { type: attr.type } : {}),
      ...(attr.enumValues?.length ? { enumValues: attr.enumValues } : {}),
    });
  }
  out.sort((a, b) => (Number(b.required) - Number(a.required)) || a.name.localeCompare(b.name));
  return out;
}

/** Hover payload: schema facts + curated semantics. Honest `known:false` for strangers. */
export function hoverFor(index: SchemaIndex, tag: string | null | undefined): LangHover {
  const clean = (tag || '').toLowerCase();
  const spec = clean ? index?.elements.get(clean) : undefined;
  const sem = clean ? getElementSemantics(clean) : null;
  const view = semanticsView(sem);
  return {
    tag: clean,
    known: !!spec,
    ...(view?.title ? { summary: view.title } : {}),
    ...(view ? { semantics: view } : {}),
    requiredAttrs: spec ? requiredAttrsOf(index, clean) : [],
    attrCount: spec ? spec.attributes.size : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic index fixtures; census/semantics come from the real modules.
 * ------------------------------------------------------------------ */

export function runLangServiceSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const el = (attrs: Array<[string, { required?: boolean; type?: string; enumValues?: string[] }]>, children: string[] = [], resolved = true) => ({
    attributes: new Map(attrs.map(([n, a]) => [n, a])),
    openAttributes: false,
    resolved,
    children: new Set(children),
  });
  const index = {
    loaded: true,
    sourceFiles: [],
    elementCount: 4,
    elements: new Map<string, ReturnType<typeof el>>([
      // 'actions' parents a census tag (set_value is in CENSUS_TOP_52) + a niche tag + a wildcard orphan
      ['actions', el([], ['zeta_custom', 'set_value', 'unresolved_ghost'])],
      ['set_value', el([['name', { required: true }], ['exact', {}]])],
      ['zeta_custom', el([['id', { required: true }], ['mode', { enumValues: ['a', 'b'] }]])],
      ['sealed', el([], [], false)],
    ]),
  } as unknown as SchemaIndex;

  const completions = completeChildren(index, 'actions');
  ok('census_tag_ranks_first', completions[0]?.tag === 'set_value', completions.map(c => c.tag).join(','));
  ok('census_flag_set', completions[0]?.curated === true && completions[1]?.curated === false);
  ok('unresolved_child_never_suggested', !completions.some(c => c.tag === 'unresolved_ghost'));
  ok('required_attrs_carried', JSON.stringify(completions[0]?.requiredAttrs) === JSON.stringify(['name']));
  ok('unknown_parent_returns_empty', completeChildren(index, 'nope').length === 0);
  ok('null_parent_returns_empty', completeChildren(index, null).length === 0);

  const attrs = attributesFor(index, 'zeta_custom');
  ok('required_attr_sorts_first', attrs[0]?.name === 'id' && attrs[0]?.required === true);
  ok('enum_values_carried', JSON.stringify(attrs.find(a => a.name === 'mode')?.enumValues) === JSON.stringify(['a', 'b']));
  ok('unresolved_element_no_attrs', attributesFor(index, 'sealed').length === 0);

  const hover = hoverFor(index, 'SET_VALUE');
  ok('hover_case_insensitive_known', hover.known === true && hover.attrCount === 2);
  const strange = hoverFor(index, 'does_not_exist');
  ok('hover_honest_unknown', strange.known === false && strange.requiredAttrs.length === 0);
  // set_value is a curated md tag — the real semantics corpus should describe it
  ok('curated_semantics_surface', typeof hover.summary === 'string' || hover.semantics !== undefined);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
