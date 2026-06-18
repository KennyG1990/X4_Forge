/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P4 (Tier 4) — third-party API palettization, deterministic core.
 *
 * Forge's node palette is md.xsd-driven: it knows the base-game MD/AIScript vocabulary,
 * but it has no knowledge of the well-known *community library mods* that real extensions
 * depend on (SirNukes' sn_mod_support_apis, kuertee's UI extensions). Those expose their
 * own MD-cue / Lua-event / Lua-global surfaces that the schema can't see, so a mod can
 * use Simple_Menu_API.Create_Menu (or Time.setAlarm, or a kuertee interact-menu group)
 * and Forge today gives zero feedback — including the most common real-world break: using
 * an API without declaring the content.xml dependency, so it silently no-ops in-game.
 *
 * This is the deterministic, heuristic usage scanner + dependency validator over a
 * LOADABLE registry. The curated knowledge is DATA, not code: built-in defs ship as
 * data/api-registry/*.json and are loaded + merged by the server; new community APIs are
 * dumped in the same way (data dir / configured folder / runtime endpoint), or derived
 * from an installed mod. This module stays pure (no fs/network/React): it owns the
 * schema (validateApiDefinition), the merge (mergeRegistries), the active set, the
 * detector/validator, and the draft-deriver. The code-def array below is intentionally
 * EMPTY — it remains as an escape hatch for any future API that needs bespoke logic
 * rather than declarative data.
 *
 * Honest scope (◐): the schema is NOT the truth source here — these are curated
 * assertions about a moving community target, so every finding is labelled SOFT
 * (heuristic), never schema-grade. The registry is intentionally NOT exhaustive;
 * "unknown symbol under a known namespace" is surfaced as info, never an error.
 *
 * Data grounded in the API authors' own docs:
 *  - sn_mod_support_apis — github.com/bvbohnen/x4-projects
 *  - kuertee_ui_extensions — github.com/kuertee/x4-mod-ui-extensions
 *
 * Pure: no fs/network/React. House pattern: engine + oracle + public GET, then UI.
 */

import { parseModManifest } from './modDependencyGraph';
import type { ExtensionProject, ProjectFile } from './extensionProject';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ExternalApiSymbolKind =
  | 'md_cue'       // an MD cue you signal, e.g. md.Simple_Menu_API.Create_Menu
  | 'lua_event'    // a raise_lua_event name, e.g. 'Time.setAlarm'
  | 'lua_global'   // a Lua global function the API installs, e.g. Register_OnLoad_Init
  | 'lua_callback' // a Lua-side callback registration, e.g. menu.registerCallback(...)
  | 'ui_signal';   // an event_ui_triggered screen/control the API raises back

export interface ExternalApiSymbol {
  /** Canonical symbol name as a modder writes it. */
  name: string;
  kind: ExternalApiSymbolKind;
  summary: string;
  /** Literal tokens whose presence in MD/Lua text indicates this symbol is used. */
  detect: string[];
  /** Optional ready-to-insert scaffold (MD or Lua) for the palette. */
  scaffold?: string;
}

export interface ExternalApiComponent {
  /** stable id within an entry, e.g. 'simple_menu' */
  id: string;
  title: string;
  summary: string;
  symbols: ExternalApiSymbol[];
  /** Windows-only components (named pipes / hotkeys go through a Windows pipe server). */
  windowsOnly?: boolean;
  /** Many of these require Protected UI Mode to be disabled. */
  requiresProtectedUiDisabled?: boolean;
}

export interface ExternalApiEntry {
  /** The content.xml id / dependency id X4 matches on (case-insensitive). */
  extensionId: string;
  name: string;
  author: string;
  source: string;
  /** Other registry extensionIds this one needs (transitive deps the validator enforces). */
  dependsOn: string[];
  components: ExternalApiComponent[];
}

export type ApiFindingSeverity = 'error' | 'warning' | 'info';

export interface ApiUsageFinding {
  severity: ApiFindingSeverity;
  code:
    | 'api.missing_dependency'       // detected API used, dependency not declared (◐)
    | 'api.missing_transitive_dep'   // dependency declared, but its own required dep is not (◐)
    | 'api.unknown_symbol'           // a known namespace, an unknown member (◐ info)
    | 'api.windows_only'             // uses a Windows-only component (◐ info)
    | 'api.detected';                // informational: this API is in use
  extensionId: string;
  message: string;
  /** project file where the usage was detected (if applicable). */
  file?: string;
  detail?: string;
}

export interface DetectedApi {
  extensionId: string;
  name: string;
  components: { id: string; title: string; symbols: string[] }[];
  /** files the usage was seen in */
  files: string[];
}

/* ------------------------------------------------------------------ *
 * Code-defined registry — INTENTIONALLY EMPTY.
 * The curated built-ins (sn_mod_support_apis, kuertee_ui_extensions) now live as DATA in
 * data/api-registry/*.json and are loaded by the server. Add an entry here ONLY for an
 * API that needs bespoke logic a declarative JSON def can't express; it will be merged in
 * through the same pipeline as the data-file defs.
 * ------------------------------------------------------------------ */

export const EXTERNAL_API_REGISTRY: ExternalApiEntry[] = [];

/* ------------------------------------------------------------------ *
 * Loadable registry — definitions can be DUMPED IN (data dir / configured
 * folder / agent endpoint) and merged onto the seed. The pipeline is uniform:
 * every definition (built-in data file or external) goes through
 * validateApiDefinition → mergeRegistries.
 * ------------------------------------------------------------------ */

export type ApiOrigin = 'builtin' | 'data-dir' | 'folder' | 'endpoint' | 'derived';

/** An external API definition as authored in a drop-in JSON file. Same shape as
 *  ExternalApiEntry plus an optional origin label the loader stamps on. */
export type ApiDefinition = ExternalApiEntry & { origin?: ApiOrigin };

export interface ApiDefinitionValidation {
  ok: boolean;
  errors: string[];
  /** normalized + defaulted entry, present only when ok. */
  normalized?: ApiDefinition;
}

const ID_SAFE = /^[A-Za-z0-9_.-]+$/;
const VALID_SYMBOL_KINDS: ExternalApiSymbolKind[] = [
  'md_cue', 'lua_event', 'lua_global', 'lua_callback', 'ui_signal',
];

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Validate + normalize one drop-in API definition. Pure. Returns all errors at
 * once (with field paths) so a bad file is actionable, never a silent partial load.
 */
export function validateApiDefinition(input: unknown, origin: ApiOrigin = 'data-dir'): ApiDefinitionValidation {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['definition must be a JSON object'] };
  }
  const d = input as Record<string, unknown>;

  const extensionId = asStr(d.extensionId).trim();
  if (!extensionId) errors.push('extensionId is required (string)');
  else if (!ID_SAFE.test(extensionId)) errors.push(`extensionId "${extensionId}" has invalid characters (allowed: A-Z a-z 0-9 _ . -)`);

  const name = asStr(d.name).trim() || extensionId;
  const dependsOn = Array.isArray(d.dependsOn) ? d.dependsOn.map(asStr).filter(Boolean) : [];

  const compsIn = Array.isArray(d.components) ? d.components : [];
  if (compsIn.length === 0) errors.push('components must be a non-empty array');

  const components: ExternalApiComponent[] = [];
  const compIds = new Set<string>();
  compsIn.forEach((c, ci) => {
    if (!c || typeof c !== 'object') { errors.push(`components[${ci}] must be an object`); return; }
    const comp = c as Record<string, unknown>;
    const id = asStr(comp.id).trim();
    if (!id) errors.push(`components[${ci}].id is required`);
    else if (compIds.has(id.toLowerCase())) errors.push(`components[${ci}].id "${id}" is duplicated`);
    compIds.add(id.toLowerCase());

    const symsIn = Array.isArray(comp.symbols) ? comp.symbols : [];
    if (symsIn.length === 0) errors.push(`components[${ci}] ("${id}") must have a non-empty symbols array`);

    const symbols: ExternalApiSymbol[] = [];
    symsIn.forEach((s, si) => {
      if (!s || typeof s !== 'object') { errors.push(`components[${ci}].symbols[${si}] must be an object`); return; }
      const sym = s as Record<string, unknown>;
      const sname = asStr(sym.name).trim();
      if (!sname) errors.push(`components[${ci}].symbols[${si}].name is required`);
      const kind = asStr(sym.kind) as ExternalApiSymbolKind;
      if (!VALID_SYMBOL_KINDS.includes(kind)) {
        errors.push(`components[${ci}].symbols[${si}].kind "${sym.kind}" invalid (one of: ${VALID_SYMBOL_KINDS.join(', ')})`);
      }
      const detect = Array.isArray(sym.detect) ? sym.detect.map(asStr).filter(Boolean) : [];
      if (detect.length === 0) errors.push(`components[${ci}].symbols[${si}] ("${sname}") needs a non-empty detect[] of literal tokens`);
      symbols.push({
        name: sname,
        kind: VALID_SYMBOL_KINDS.includes(kind) ? kind : 'md_cue',
        summary: asStr(sym.summary),
        detect,
        ...(asStr(sym.scaffold) ? { scaffold: asStr(sym.scaffold) } : {}),
      });
    });

    components.push({
      id,
      title: asStr(comp.title).trim() || id,
      summary: asStr(comp.summary),
      symbols,
      ...(comp.windowsOnly === true ? { windowsOnly: true } : {}),
      ...(comp.requiresProtectedUiDisabled === true ? { requiresProtectedUiDisabled: true } : {}),
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    normalized: {
      extensionId,
      name,
      author: asStr(d.author),
      source: asStr(d.source),
      dependsOn,
      components,
      origin,
    },
  };
}

export interface MergeConflict {
  extensionId: string;
  kind: 'entry_overridden' | 'component_overridden';
  detail: string;
}

/**
 * Merge incoming definitions onto a base registry. Deterministic, pure.
 * - new extensionId → appended.
 * - existing extensionId → components merged BY component id (incoming wins per
 *   id, new component ids appended); dependsOn unioned; name/author/source taken
 *   from incoming when non-empty. Conflicts are reported, never silent.
 * Matching is case-insensitive on extensionId and component id.
 */
export function mergeRegistries(
  base: ExternalApiEntry[],
  incoming: ExternalApiEntry[],
): { registry: ApiDefinition[]; conflicts: MergeConflict[] } {
  const conflicts: MergeConflict[] = [];
  const out: ApiDefinition[] = base.map(e => ({ ...e, origin: (e as ApiDefinition).origin || 'builtin' }));
  const indexOf = (id: string) => out.findIndex(e => e.extensionId.toLowerCase() === id.toLowerCase());

  for (const inc of incoming || []) {
    if (!inc || !inc.extensionId) continue;
    const idx = indexOf(inc.extensionId);
    if (idx < 0) {
      out.push({ ...inc, origin: (inc as ApiDefinition).origin || 'data-dir' });
      continue;
    }
    // merge into existing entry
    const existing = out[idx];
    const mergedComponents = [...existing.components];
    for (const incComp of inc.components || []) {
      const ci = mergedComponents.findIndex(c => c.id.toLowerCase() === incComp.id.toLowerCase());
      if (ci < 0) {
        mergedComponents.push(incComp);
      } else {
        mergedComponents[ci] = incComp;
        conflicts.push({
          extensionId: inc.extensionId,
          kind: 'component_overridden',
          detail: `component "${incComp.id}" of ${inc.extensionId} overridden by ${(inc as ApiDefinition).origin || 'incoming'} definition`,
        });
      }
    }
    out[idx] = {
      ...existing,
      name: asStr(inc.name).trim() || existing.name,
      author: asStr(inc.author).trim() || existing.author,
      source: asStr(inc.source).trim() || existing.source,
      dependsOn: [...new Set([...(existing.dependsOn || []), ...(inc.dependsOn || [])])],
      components: mergedComponents,
      origin: (inc as ApiDefinition).origin || existing.origin,
    };
    conflicts.push({
      extensionId: inc.extensionId,
      kind: 'entry_overridden',
      detail: `${inc.extensionId} already existed (${existing.origin}); merged in ${(inc as ApiDefinition).origin || 'incoming'} definition`,
    });
  }
  return { registry: out, conflicts };
}

/* ------------------------------------------------------------------ *
 * Active registry — the live set the UI/server read. The pure functions all
 * accept an explicit registry (default = active) so the oracle stays hermetic.
 * The server replaces this at boot with built-ins(data) ⊕ folder ⊕ endpoint.
 * ------------------------------------------------------------------ */

let activeRegistry: ApiDefinition[] = EXTERNAL_API_REGISTRY.map(e => ({ ...e, origin: 'builtin' as ApiOrigin }));

export function getActiveRegistry(): ApiDefinition[] {
  return activeRegistry;
}

/** Replace the active registry (server calls this at boot after loading defs). */
export function setActiveRegistry(entries: ApiDefinition[]): void {
  activeRegistry = Array.isArray(entries) ? entries : [];
}

/** Reset the active registry to the code-defined seed (used by tests). */
export function resetActiveRegistry(): void {
  activeRegistry = EXTERNAL_API_REGISTRY.map(e => ({ ...e, origin: 'builtin' as ApiOrigin }));
}

/* ------------------------------------------------------------------ *
 * Accessors
 * ------------------------------------------------------------------ */

export function listExternalApis(registry: ExternalApiEntry[] = getActiveRegistry()): ExternalApiEntry[] {
  return registry;
}

export function getExternalApi(
  extensionId: string,
  registry: ExternalApiEntry[] = getActiveRegistry(),
): ExternalApiEntry | undefined {
  const key = String(extensionId || '').toLowerCase();
  return registry.find(e => e.extensionId.toLowerCase() === key);
}

/** Flat list of pickable building blocks for the palette UI. */
export interface ApiBuildingBlock {
  extensionId: string;
  apiName: string;
  componentId: string;
  componentTitle: string;
  symbol: ExternalApiSymbol;
  /** dependency ids (this entry + its transitive deps) needed for the block to work. */
  requiredDependencies: string[];
}

export function getApiBuildingBlocks(registry: ExternalApiEntry[] = getActiveRegistry()): ApiBuildingBlock[] {
  const blocks: ApiBuildingBlock[] = [];
  for (const entry of registry) {
    const deps = [entry.extensionId, ...entry.dependsOn];
    for (const comp of entry.components) {
      for (const sym of comp.symbols) {
        blocks.push({
          extensionId: entry.extensionId,
          apiName: entry.name,
          componentId: comp.id,
          componentTitle: comp.title,
          symbol: sym,
          requiredDependencies: deps,
        });
      }
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------ *
 * Usage detection (deterministic, heuristic literal-token match)
 * ------------------------------------------------------------------ */

/** MD-cue namespaces we can scan for unknown members. */
const NAMESPACE_PREFIXES = [
  'Simple_Menu_API.',
  'Simple_Menu_Options.',
  'Interact_Menu_API.',
  'Hotkey_API.',
];

function projectScannableFiles(project: ExtensionProject): ProjectFile[] {
  return (project?.files || []).filter(
    f => f && typeof f.content === 'string' && (f.kind === 'md' || f.kind === 'lua' || f.kind === 'ui'),
  );
}

/**
 * Scan one blob of MD/Lua text and report which registry symbols appear used.
 * Pure literal-substring match — deterministic, no regex backtracking surprises.
 */
export function detectApiUsage(
  text: string,
  registry: ExternalApiEntry[] = getActiveRegistry(),
): {
  extensionId: string;
  componentId: string;
  symbolName: string;
}[] {
  const hits: { extensionId: string; componentId: string; symbolName: string }[] = [];
  if (typeof text !== 'string' || !text) return hits;
  for (const entry of registry) {
    for (const comp of entry.components) {
      for (const sym of comp.symbols) {
        if (sym.detect.some(tok => tok && text.includes(tok))) {
          hits.push({ extensionId: entry.extensionId, componentId: comp.id, symbolName: sym.name });
        }
      }
    }
  }
  return hits;
}

/** Aggregate detected APIs across a whole project. */
export function detectProjectApis(
  project: ExtensionProject,
  registry: ExternalApiEntry[] = getActiveRegistry(),
): DetectedApi[] {
  const byEntry = new Map<string, DetectedApi>();
  for (const f of projectScannableFiles(project)) {
    for (const hit of detectApiUsage(f.content || '', registry)) {
      let det = byEntry.get(hit.extensionId);
      if (!det) {
        const entry = getExternalApi(hit.extensionId, registry);
        det = { extensionId: hit.extensionId, name: entry?.name || hit.extensionId, components: [], files: [] };
        byEntry.set(hit.extensionId, det);
      }
      if (!det.files.includes(f.path)) det.files.push(f.path);
      let comp = det.components.find(c => c.id === hit.componentId);
      if (!comp) {
        const entry = getExternalApi(hit.extensionId, registry);
        const cmeta = entry?.components.find(c => c.id === hit.componentId);
        comp = { id: hit.componentId, title: cmeta?.title || hit.componentId, symbols: [] };
        det.components.push(comp);
      }
      if (!comp.symbols.includes(hit.symbolName)) comp.symbols.push(hit.symbolName);
    }
  }
  return [...byEntry.values()];
}

/** Parse the declared dependency ids (lowercased) from a project's content.xml. */
function declaredDependencyIds(project: ExtensionProject): Set<string> {
  const out = new Set<string>();
  const content = (project?.files || []).find(
    f => String(f.path || '').replace(/\\/g, '/').toLowerCase() === 'content.xml',
  );
  if (!content || typeof content.content !== 'string') return out;
  const man = parseModManifest(project.id || 'project', content.content);
  for (const d of man?.deps || []) if (d?.id) out.add(d.id.toLowerCase());
  return out;
}

/** Collect known symbol names per namespace prefix, for the unknown-member scan. */
function knownSymbolsByPrefix(registry: ExternalApiEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const prefix of NAMESPACE_PREFIXES) map.set(prefix, new Set());
  for (const entry of registry) {
    for (const comp of entry.components) {
      for (const sym of comp.symbols) {
        for (const prefix of NAMESPACE_PREFIXES) {
          const idx = sym.name.indexOf(prefix);
          if (idx >= 0) map.get(prefix)!.add(sym.name.slice(idx + prefix.length));
        }
      }
    }
  }
  return map;
}

/**
 * ◐ Validate a project's use of third-party APIs. SOFT findings only:
 *  - api.missing_dependency: a detected API has no content.xml dependency declared.
 *  - api.missing_transitive_dep: a declared API needs another dep that isn't declared.
 *  - api.unknown_symbol: a member under a known namespace that isn't in the registry.
 *  - api.windows_only / api.detected: informational.
 */
export function validateExternalApiUsage(
  project: ExtensionProject,
  registry: ExternalApiEntry[] = getActiveRegistry(),
): ApiUsageFinding[] {
  const findings: ApiUsageFinding[] = [];
  if (!project || !Array.isArray(project.files)) return findings;

  const declared = declaredDependencyIds(project);
  const detected = detectProjectApis(project, registry);

  for (const det of detected) {
    const entry = getExternalApi(det.extensionId, registry);
    const where = det.files.join(', ');

    // informational: this API is in use
    findings.push({
      severity: 'info',
      code: 'api.detected',
      extensionId: det.extensionId,
      message: `Detected use of ${det.name} (${det.components.map(c => c.title).join(', ')}).`,
      detail: `Heuristic detection in: ${where}`,
    });

    // missing direct dependency
    if (!declared.has(det.extensionId.toLowerCase())) {
      findings.push({
        severity: 'warning',
        code: 'api.missing_dependency',
        extensionId: det.extensionId,
        file: 'content.xml',
        message:
          `${det.name} is used but content.xml declares no dependency on "${det.extensionId}". ` +
          `Without it the API silently no-ops in-game.`,
        detail: `◐ heuristic — detected via API tokens in: ${where}`,
      });
    }

    // missing transitive dependency (e.g. kuertee → sn_mod_support_apis)
    for (const need of entry?.dependsOn || []) {
      if (!declared.has(need.toLowerCase())) {
        findings.push({
          severity: 'warning',
          code: 'api.missing_transitive_dep',
          extensionId: need,
          file: 'content.xml',
          message:
            `${det.name} requires "${need}", which content.xml does not declare as a dependency.`,
          detail: `◐ heuristic — ${det.extensionId} depends on ${need}.`,
        });
      }
    }

    // windows-only components in use
    const winComps = det.components.filter(c => entry?.components.find(ec => ec.id === c.id)?.windowsOnly);
    for (const c of winComps) {
      findings.push({
        severity: 'info',
        code: 'api.windows_only',
        extensionId: det.extensionId,
        message: `${c.title} is Windows-only (requires an external pipe server); Linux players are unsupported.`,
      });
    }
  }

  // unknown member under a known namespace (◐ info)
  const known = knownSymbolsByPrefix(registry);
  for (const f of projectScannableFiles(project)) {
    const text = f.content || '';
    for (const prefix of NAMESPACE_PREFIXES) {
      let from = 0;
      while (true) {
        const idx = text.indexOf(prefix, from);
        if (idx < 0) break;
        from = idx + prefix.length;
        // capture the member: a run of identifier chars after the prefix
        const m = /^[A-Za-z0-9_]+/.exec(text.slice(from));
        const member = m ? m[0] : '';
        if (member && !known.get(prefix)!.has(member)) {
          findings.push({
            severity: 'info',
            code: 'api.unknown_symbol',
            extensionId: '',
            file: f.path,
            message: `"${prefix}${member}" is not in the curated registry (the registry is not exhaustive).`,
            detail: '◐ heuristic — verify against the API docs; may be a newer/unmodelled member.',
          });
        }
      }
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Auto-derive a DRAFT definition from an installed mod's files (derive→refine).
 * Heuristic and lossy: it can recover the *surface* (library cues, raised lua
 * events, global lua functions) but NOT human summaries or precise detect tokens,
 * so the output is explicitly a DRAFT to be hand-refined. Pure: text in, def out.
 * ------------------------------------------------------------------ */

export interface DeriveInputFile { path: string; kind?: string; content: string }

function matchAll(re: RegExp, text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/**
 * Derive a draft ApiDefinition from a mod's files. extensionId is taken from a
 * content.xml `<content id>` if present, else from the provided fallback.
 */
export function deriveApiDefinition(
  fallbackExtensionId: string,
  files: DeriveInputFile[],
): { definition: ApiDefinition; notes: string[] } {
  const notes: string[] = [];
  const list = Array.isArray(files) ? files.filter(f => f && typeof f.content === 'string') : [];

  // extension id from content.xml
  let extensionId = String(fallbackExtensionId || '').trim();
  let name = extensionId;
  const contentFile = list.find(f => /(^|\/)content\.xml$/i.test(f.path || ''));
  if (contentFile) {
    extensionId = contentFile.content.match(/<content\b[^>]*\bid\s*=\s*"([^"]+)"/i)?.[1] || extensionId;
    name = contentFile.content.match(/<content\b[^>]*\bname\s*=\s*"([^"]+)"/i)?.[1] || extensionId;
  }
  if (!extensionId) extensionId = 'derived_extension';

  const mdText = list.filter(f => /\.xml$/i.test(f.path || '')).map(f => f.content).join('\n');
  const luaText = list.filter(f => /\.lua$/i.test(f.path || '')).map(f => f.content).join('\n');

  // MD libraries (explicitly reusable cue blocks) → md_cue surface
  const libraries = [...new Set(matchAll(/<library\b[^>]*\bname\s*=\s*"([^"]+)"/gi, mdText))];
  // raised lua events (the MD→Lua event surface), names are 'Quoted.Strings'
  const luaEvents = [...new Set(matchAll(/<raise_lua_event\b[^>]*\bname\s*=\s*"'([^']+)'"/gi, mdText))];
  // global lua functions: `function Name(` and `Name = function`, excluding locals/methods
  const luaFnDefs = [
    ...matchAll(/(?:^|\n)\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, luaText),
    ...matchAll(/(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\b/g, luaText),
  ];
  const luaGlobals = [...new Set(luaFnDefs)].filter(n => n && !/^(M|m|self)$/.test(n));

  const components: ExternalApiComponent[] = [];
  if (libraries.length) {
    components.push({
      id: 'md_libraries',
      title: 'MD libraries (derived)',
      summary: 'Reusable MD library cues found in the mod (draft — refine summaries).',
      symbols: libraries.map(n => ({
        name: n, kind: 'md_cue' as const, summary: '', detect: [n],
      })),
    });
  }
  if (luaEvents.length) {
    components.push({
      id: 'lua_events',
      title: 'Raised Lua events (derived)',
      summary: 'raise_lua_event names found in the mod (draft — refine summaries).',
      symbols: luaEvents.map(n => ({
        name: `'${n}'`, kind: 'lua_event' as const, summary: '', detect: [n],
      })),
    });
  }
  if (luaGlobals.length) {
    components.push({
      id: 'lua_globals',
      title: 'Global Lua functions (derived)',
      summary: 'Top-level Lua function definitions (draft — many may be internal, prune before trusting).',
      symbols: luaGlobals.map(n => ({
        name: n, kind: 'lua_global' as const, summary: '', detect: [n],
      })),
    });
  }

  if (components.length === 0) {
    notes.push('No library cues, raised lua events, or global lua functions found — empty draft.');
    // ensure a valid (non-empty) shape so it can still be saved/edited
    components.push({
      id: 'derived',
      title: 'Derived (empty)',
      summary: 'Nothing recognizable was found; add symbols manually.',
      symbols: [{ name: `${extensionId}.placeholder`, kind: 'md_cue', summary: '', detect: [`${extensionId}.`] }],
    });
  }

  notes.push('DRAFT: summaries are empty and detect tokens are name-based; refine before relying on the validator.');

  return {
    definition: {
      extensionId,
      name,
      author: '',
      source: '',
      dependsOn: [],
      components,
      origin: 'derived',
    },
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle — hermetic: tests the engine MECHANICS against an inline synthetic
 * FIXTURE registry (NOT the shipped data files). "Are the shipped built-ins
 * valid?" is a separate runtime/observable check the server performs at load
 * (see external-api-registry sources.errors) — keeping this oracle pure (no fs).
 * ------------------------------------------------------------------ */

const FIXTURE_REGISTRY: ExternalApiEntry[] = [
  {
    extensionId: 'fix_core', name: 'Fixture Core API', author: 'test', source: '', dependsOn: [],
    components: [
      {
        id: 'menu', title: 'Menu', requiresProtectedUiDisabled: true,
        symbols: [
          { name: 'md.Simple_Menu_API.Create_Menu', kind: 'md_cue', summary: '', detect: ['Simple_Menu_API.Create_Menu'] },
          { name: 'md.Simple_Menu_API.Add_Row', kind: 'md_cue', summary: '', detect: ['Simple_Menu_API.Add_Row'] },
        ],
      },
      {
        id: 'time', title: 'Time',
        symbols: [
          { name: "'Time.getEngineTime'", kind: 'lua_event', summary: '', detect: ['Time.getEngineTime'] },
        ],
      },
      {
        id: 'pipes', title: 'Named Pipes', windowsOnly: true,
        symbols: [
          { name: 'Named_Pipes.Write', kind: 'md_cue', summary: '', detect: ['Named_Pipes.'] },
        ],
      },
    ],
  },
  {
    extensionId: 'fix_ui', name: 'Fixture UI', author: 'test', source: '', dependsOn: ['fix_core'],
    components: [
      {
        id: 'cb', title: 'Callbacks',
        symbols: [
          { name: 'menu.registerCallback', kind: 'lua_callback', summary: '', detect: ['registerCallback('] },
        ],
      },
    ],
  },
];

export function runExternalApiRegistrySelftest(): {
  allPassed: boolean;
  pass: boolean;
  passed: number;
  total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const FX = FIXTURE_REGISTRY;

  // --- registry shape (fixture) ---
  ok('fixture non-empty', FX.length >= 2, `entries=${FX.length}`);
  ok(
    'every entry has id + components + symbols',
    FX.every(e => !!e.extensionId && e.components.length > 0 && e.components.every(c => c.symbols.length > 0)),
  );
  ok(
    'every detect token is non-empty',
    FX.every(e => e.components.every(c => c.symbols.every(s => s.detect.length > 0 && s.detect.every(t => !!t)))),
  );
  ok('getExternalApi finds an entry', !!getExternalApi('fix_core', FX));
  ok('getExternalApi is case-insensitive', !!getExternalApi('FIX_CORE', FX));
  ok(
    'transitive dep recorded',
    getExternalApi('fix_ui', FX)?.dependsOn.includes('fix_core') === true,
    JSON.stringify(getExternalApi('fix_ui', FX)?.dependsOn),
  );

  // --- building blocks ---
  const blocks = getApiBuildingBlocks(FX);
  ok('building blocks flatten all symbols', blocks.length >= 5, `blocks=${blocks.length}`);
  const uiBlock = blocks.find(b => b.extensionId === 'fix_ui');
  ok(
    'blocks carry transitive deps',
    !!uiBlock && uiBlock.requiredDependencies.includes('fix_core'),
    JSON.stringify(uiBlock?.requiredDependencies),
  );

  // --- detection ---
  const mdSimple = `<signal_cue_instantly cue="md.Simple_Menu_API.Create_Menu" param="table[$columns=1]"/>`;
  ok('detect md_cue', detectApiUsage(mdSimple, FX).some(h => h.symbolName === 'md.Simple_Menu_API.Create_Menu'));
  const mdTime = `<raise_lua_event name="'Time.getEngineTime'" param="'my_id'"/>`;
  ok('detect lua_event', detectApiUsage(mdTime, FX).some(h => h.symbolName === "'Time.getEngineTime'"));
  const luaCb = `m.registerCallback("prepareSections_on_end", function() end)`;
  ok('detect lua_callback', detectApiUsage(luaCb, FX).some(h => h.extensionId === 'fix_ui'));
  ok('detect on empty string is empty', detectApiUsage('', FX).length === 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ok('detect tolerates non-string', detectApiUsage(undefined as any, FX).length === 0);
  const unrelated = `<cue name="Start"><actions><signal_cue cue="this.Foo"/></actions></cue>`;
  ok('no false positive on unrelated MD', detectApiUsage(unrelated, FX).length === 0);

  // --- validation: missing dependency ---
  const projNoDep: ExtensionProject = {
    id: 'p', name: 'p',
    files: [
      { path: 'content.xml', kind: 'content', content: '<content id="p" name="p" version="100"/>' },
      { path: 'md/menu.xml', kind: 'md', content: mdSimple },
    ],
  };
  const fNoDep = validateExternalApiUsage(projNoDep, FX);
  ok(
    'flags missing dependency when API used without dep',
    fNoDep.some(f => f.code === 'api.missing_dependency' && f.extensionId === 'fix_core'),
    JSON.stringify(fNoDep.map(f => f.code)),
  );

  // --- validation: dependency declared → no missing-dep finding ---
  const projWithDep: ExtensionProject = {
    id: 'p', name: 'p',
    files: [
      {
        path: 'content.xml', kind: 'content',
        content: '<content id="p" name="p" version="100"><dependency id="fix_core" /></content>',
      },
      { path: 'md/menu.xml', kind: 'md', content: mdSimple },
    ],
  };
  const fWithDep = validateExternalApiUsage(projWithDep, FX);
  ok(
    'no missing-dep finding when dependency declared',
    !fWithDep.some(f => f.code === 'api.missing_dependency'),
    JSON.stringify(fWithDep.map(f => f.code)),
  );
  ok('still reports api.detected when declared', fWithDep.some(f => f.code === 'api.detected'));

  // --- validation: transitive dep (fix_ui declared, fix_core missing) ---
  const projTransitive: ExtensionProject = {
    id: 'p', name: 'p',
    files: [
      {
        path: 'content.xml', kind: 'content',
        content: '<content id="p" name="p" version="100"><dependency id="fix_ui" /></content>',
      },
      { path: 'ui/menu.lua', kind: 'lua', content: luaCb },
    ],
  };
  const fTrans = validateExternalApiUsage(projTransitive, FX);
  ok(
    'flags missing transitive dependency',
    fTrans.some(f => f.code === 'api.missing_transitive_dep' && f.extensionId === 'fix_core'),
    JSON.stringify(fTrans.map(f => `${f.code}:${f.extensionId}`)),
  );

  // --- validation: windows-only info ---
  const projPipes: ExtensionProject = {
    id: 'p', name: 'p',
    files: [
      {
        path: 'content.xml', kind: 'content',
        content: '<content id="p" version="100"><dependency id="fix_core"/></content>',
      },
      { path: 'md/pipe.xml', kind: 'md', content: `<raise_lua_event name="'Named_Pipes.Write'"/>` },
    ],
  };
  ok('flags windows-only component', validateExternalApiUsage(projPipes, FX).some(f => f.code === 'api.windows_only'));

  // --- validation: unknown symbol under known namespace ---
  const projUnknown: ExtensionProject = {
    id: 'p', name: 'p',
    files: [
      {
        path: 'content.xml', kind: 'content',
        content: '<content id="p" version="100"><dependency id="fix_core"/></content>',
      },
      { path: 'md/x.xml', kind: 'md', content: `<signal_cue_instantly cue="md.Simple_Menu_API.Totally_Fake_Cue"/>` },
    ],
  };
  const fUnknown = validateExternalApiUsage(projUnknown, FX);
  ok(
    'flags unknown member under known namespace',
    fUnknown.some(f => f.code === 'api.unknown_symbol' && (f.message || '').includes('Totally_Fake_Cue')),
    JSON.stringify(fUnknown.filter(f => f.code === 'api.unknown_symbol').map(f => f.message)),
  );
  ok(
    'known member does NOT trigger unknown-symbol',
    !validateExternalApiUsage(projWithDep, FX).some(f => f.code === 'api.unknown_symbol'),
  );

  // --- degrade safely ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ok('empty project yields no findings', validateExternalApiUsage({ id: '', name: '', files: [] } as any, FX).length === 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ok('garbage project does not throw', Array.isArray(validateExternalApiUsage({} as any, FX)));

  /* ---- loadable registry: validateApiDefinition ---- */
  const goodDef = {
    extensionId: 'my_api',
    name: 'My API',
    components: [{ id: 'core', title: 'Core', symbols: [{ name: 'My_API.Do', kind: 'md_cue', detect: ['My_API.Do'] }] }],
  };
  const goodV = validateApiDefinition(goodDef);
  ok('validateApiDefinition accepts a good def', goodV.ok && !!goodV.normalized, JSON.stringify(goodV.errors));
  ok('validateApiDefinition defaults dependsOn to []', goodV.ok && Array.isArray(goodV.normalized!.dependsOn));
  ok('validateApiDefinition rejects non-object', !validateApiDefinition(42).ok);
  ok('validateApiDefinition requires extensionId', !validateApiDefinition({ components: goodDef.components }).ok);
  ok('validateApiDefinition rejects bad id chars', !validateApiDefinition({ ...goodDef, extensionId: 'bad id!' }).ok);
  ok('validateApiDefinition requires components', !validateApiDefinition({ extensionId: 'x', components: [] }).ok);
  ok(
    'validateApiDefinition rejects empty detect[]',
    !validateApiDefinition({ extensionId: 'x', components: [{ id: 'c', symbols: [{ name: 'n', kind: 'md_cue', detect: [] }] }] }).ok,
  );
  ok(
    'validateApiDefinition rejects invalid kind',
    !validateApiDefinition({ extensionId: 'x', components: [{ id: 'c', symbols: [{ name: 'n', kind: 'nope', detect: ['n'] }] }] }).ok,
  );

  /* ---- loadable registry: mergeRegistries ---- */
  const newEntry = validateApiDefinition({ ...goodDef, extensionId: 'brand_new' }, 'data-dir').normalized!;
  const m1 = mergeRegistries(FX, [newEntry]);
  ok('merge adds a new extensionId', m1.registry.some(e => e.extensionId === 'brand_new'));
  ok('merge keeps base entries', m1.registry.some(e => e.extensionId === 'fix_core'));
  ok('merge stamps origin on new entry', m1.registry.find(e => e.extensionId === 'brand_new')?.origin === 'data-dir');

  // same extensionId → component-level merge + conflict report
  const extend = validateApiDefinition({
    extensionId: 'fix_core',
    components: [
      { id: 'time', title: 'Time (override)', symbols: [{ name: "'Time.newCmd'", kind: 'lua_event', detect: ['Time.newCmd'] }] },
      { id: 'brand_comp', title: 'New comp', symbols: [{ name: 'X.Y', kind: 'md_cue', detect: ['X.Y'] }] },
    ],
  }, 'endpoint').normalized!;
  const m2 = mergeRegistries(FX, [extend]);
  const merged = m2.registry.find(e => e.extensionId === 'fix_core')!;
  ok('merge does not duplicate the entry', m2.registry.filter(e => e.extensionId === 'fix_core').length === 1);
  ok('merge appends a new component', !!merged.components.find(c => c.id === 'brand_comp'));
  ok('merge overrides an existing component by id', merged.components.find(c => c.id === 'time')?.title === 'Time (override)');
  ok('merge reports component_overridden conflict', m2.conflicts.some(c => c.kind === 'component_overridden'));
  ok('merge reports entry_overridden conflict', m2.conflicts.some(c => c.kind === 'entry_overridden'));
  ok('detection uses the merged registry', detectApiUsage('foo X.Y bar', m2.registry).some(h => h.extensionId === 'fix_core'));

  /* ---- active registry set/reset ---- */
  const _prevActive = getActiveRegistry();
  setActiveRegistry(m1.registry);
  ok('setActiveRegistry takes effect', getActiveRegistry().some(e => e.extensionId === 'brand_new'));
  resetActiveRegistry();
  ok('resetActiveRegistry restores seed', !getActiveRegistry().some(e => e.extensionId === 'brand_new'));
  setActiveRegistry(_prevActive);

  /* ---- deriveApiDefinition ---- */
  const derived = deriveApiDefinition('sn_test', [
    { path: 'content.xml', content: '<content id="sn_test" name="SN Test"/>' },
    { path: 'md/api.xml', content: `<mdscript name="API"><library name="Create_Menu"/><cues><cue name="X"><actions><raise_lua_event name="'Time.getEngineTime'"/></actions></cue></cues></mdscript>` },
    { path: 'ui/api.lua', content: `function Register_Thing(x)\n  local y = 1\nend\nlocal function Hidden() end` },
  ]);
  ok('derive picks extension id from content.xml', derived.definition.extensionId === 'sn_test');
  ok('derive finds the md library', derived.definition.components.some(c => c.symbols.some(s => s.name === 'Create_Menu')));
  ok('derive finds the raised lua event', derived.definition.components.some(c => c.symbols.some(s => s.name === "'Time.getEngineTime'")));
  ok('derive finds the global lua function', derived.definition.components.some(c => c.symbols.some(s => s.name === 'Register_Thing')));
  ok('derive excludes local lua function', !derived.definition.components.some(c => c.symbols.some(s => s.name === 'Hidden')));
  ok('derive output validates', validateApiDefinition(derived.definition, 'derived').ok, JSON.stringify(validateApiDefinition(derived.definition).errors));
  ok('derive notes the draft caveat', derived.notes.some(n => /DRAFT/i.test(n)));
  const emptyDerived = deriveApiDefinition('empty', []);
  ok('derive on no files yields a valid placeholder def', validateApiDefinition(emptyDerived.definition).ok);

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const allPassed = passed === total;
  return { allPassed, pass: allPassed, passed, total, checks };
}
