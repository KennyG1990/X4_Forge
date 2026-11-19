/** Shared authored Mission Director script and declaration identity. */
import { DOMParser, type Element } from '@xmldom/xmldom';

export function parseMdScriptRoot(content: string): Element | null {
  let malformed = false;
  try {
    const root = new DOMParser({ onError: () => { malformed = true; } })
      .parseFromString(content.replace(/^\uFEFF/, ''), 'text/xml').documentElement;
    return !malformed && root?.nodeName === 'mdscript' ? root : null;
  } catch {
    return null;
  }
}

/**
 * MD structural cue KEYWORDS the engine resolves at runtime — these are legal wherever a
 * cue reference is accepted (`<cancel_cue cue="parent"/>`, `<remove_offer cue="parent"/>`,
 * `<reset_cue cue="this"/>`, …) and must NEVER be flagged as unresolved cue names.
 * Source: shipping, in-game-proven usage (x4_ai_influence Cleanup_on_load precedent;
 * ROADMAP tool-improvement #8, 2026-07-02 — the resolver cried wolf on these ×3).
 */
export const MD_CUE_KEYWORDS = new Set(['this', 'parent', 'static', 'namespace']);

/**
 * THE shared cue-reference classifier (audit A2, 2026-07-09). Three resolvers used to
 * carry their own drifting copies of this logic (this file, extensionProject's index,
 * projectCrossFileValidation's qnameOf) — the keyword whitelist had to be fixed twice
 * and the multi-script duplicate fix reached only one of them. One classifier, three
 * consumers, one semantics.
 */
export type CueRefClass =
  | { kind: 'keyword' }                              // parent/this/static/namespace (exact lowercase)
  | { kind: 'local'; cue: string }                   // bare name or this.Name
  | { kind: 'cross'; script: string; cue: string }   // declaration base of md.<script>.<cue>[.property...]
  | { kind: 'external' };                            // $expr, {…}, other-qualified — never flagged

export function classifyCueRef(raw: string): CueRefClass {
  const ref = String(raw ?? '').trim();
  if (!ref) return { kind: 'external' };
  if (MD_CUE_KEYWORDS.has(ref)) return { kind: 'keyword' };
  const cross = ref.match(/^md\.([^.]+)\.(.+)$/i);
  // This identifies a declaration base, not validity of the remaining property
  // expression. Callers retain the full raw reference for ScriptProperty checks.
  if (cross) return { kind: 'cross', script: cross[1], cue: cross[2].split('.')[0] };
  const local = ref.startsWith('this.') ? ref.slice(5) : ref;
  if (!local || local.includes('.') || local.startsWith('$') || local.startsWith('{')) return { kind: 'external' };
  return { kind: 'local', cue: local };
}

/** Shared, source-agnostic facts for exact MD cue/library declaration resolution. */
export interface MdLibraryDeclaration<T = unknown> {
  name: string;
  kind: 'cue' | 'library';
  purpose: string | null;
  source: T;
}

export type MdReferenceRole = 'cue' | 'run_actions' | 'include_actions'
  | 'signal_cue' | 'signal_cue_instantly' | 'reset_cue' | 'cancel_cue';

export function mdReferenceRole(name: string): MdReferenceRole | undefined {
  return name === 'cue' || name === 'run_actions' || name === 'include_actions'
    || name === 'signal_cue' || name === 'signal_cue_instantly' || name === 'reset_cue' || name === 'cancel_cue' ? name : undefined;
}

export interface MdLibraryScript<D = unknown, S = unknown> {
  name: string;
  declarations: readonly MdLibraryDeclaration<D>[];
  source: S;
}

export interface MdLibraryIndexEntry<D = unknown, S = unknown> {
  name: string;
  declarations: Map<string, MdLibraryDeclaration<D> | null>;
  source: S;
}

export type MdLibraryIndex<D = unknown, S = unknown> = Map<string, MdLibraryIndexEntry<D, S> | null>;

export interface MdLibraryResolution<D = unknown, S = unknown> {
  script: MdLibraryIndexEntry<D, S>;
  declaration: MdLibraryDeclaration<D> | null;
  library: MdLibraryDeclaration<D> | null;
  targetName: string;
  /** Distinguishes a missing name from a present but ambiguous declaration. */
  declared: boolean;
}

/** Case-folded collisions are ambiguous; a later declaration can never restore uniqueness. */
export function buildMdLibraryIndex<D, S>(scripts: readonly MdLibraryScript<D, S>[]): MdLibraryIndex<D, S> {
  const index: MdLibraryIndex<D, S> = new Map();
  for (const script of scripts) {
    if (!script.name) continue;
    const key = script.name.toLowerCase();
    if (index.has(key)) {
      index.set(key, null);
      continue;
    }
    const declarations = new Map<string, MdLibraryDeclaration<D> | null>();
    for (const declaration of script.declarations) {
      if (!declaration.name) continue;
      const declarationKey = declaration.name.toLowerCase();
      declarations.set(declarationKey, declarations.has(declarationKey) ? null : declaration);
    }
    index.set(key, { name: script.name, declarations, source: script.source });
  }
  return index;
}

/**
 * Resolve only the existing bare/local and exact md.Script.Name literal contract.
 * Folded keys detect ambiguity, but do not grant case-insensitive library identity.
 */
export function resolveMdLibraryReference<D, S>(
  index: ReadonlyMap<string, MdLibraryIndexEntry<D, S> | null>,
  callerScriptName: string,
  reference: string,
  options: { cueReference?: boolean } = {},
): MdLibraryResolution<D, S> | null {
  const ref = reference.trim();
  const classified = classifyCueRef(ref);
  let scriptName: string;
  let targetName: string;
  if (options.cueReference) {
    if (classified.kind === 'local') { scriptName = callerScriptName; targetName = classified.cue; }
    else if (classified.kind === 'cross') { scriptName = classified.script; targetName = classified.cue; }
    else return null;
  } else {
    const literal = /^(?:md\.([A-Za-z_][\w]*)\.)?([A-Za-z_][\w]*)$/.exec(ref);
    if (!literal || classified.kind === 'keyword') return null;
    [, scriptName = callerScriptName, targetName] = literal;
  }
  const script = index.get(scriptName.toLowerCase());
  if (!script || script.name !== scriptName) return null;
  const key = targetName.toLowerCase();
  const declaration = script.declarations.get(key) ?? null;
  return {
    script, declaration, targetName, declared: script.declarations.has(key),
    library: declaration?.kind === 'library' && declaration.name === targetName ? declaration : null,
  };
}
