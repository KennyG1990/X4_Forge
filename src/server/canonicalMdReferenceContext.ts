import type { CanonicalMdCatalog } from '../lib/canonicalMdProviderCatalog';
import { readCanonicalMdProviderGeneration } from '../lib/canonicalMdProviderCatalog';
import { classifyPath } from '../lib/extensionProject';
import { buildMdLibraryIndex } from '../lib/cueLineage';
import { plainMdLibraryPurposeFacts, type EffectiveMdReferenceContext } from '../lib/mdEffectiveLibraryPurpose';
import { resolveEffectiveReferenceDocument } from '../lib/referenceOverlay';

type Ready = Extract<CanonicalMdCatalog, { status: 'ready' }>;
type Document = EffectiveMdReferenceContext['documents'][number];
export type CanonicalMdConsultation = { root: string; generation?: string; paths: string[] };
export type CanonicalMdValidationOptions = {
  read: (root: string) => Ready | undefined;
  /** Authored inputs that could not be loaded for validation. */
  skippedFiles?: readonly { path: string; directory?: true }[];
  consulted?: (memo: CanonicalMdConsultation) => void;
};

export const authoredMdSourcePath = (file: string) => file.replace(/\\/g, '/').replace(/^\.\//, '');
export const authoredMdSourceKey = (file: string) => authoredMdSourcePath(file).toLowerCase();
export const isAuthoredMdInventoryPath = (key: string, directory = false) =>
  key === '.' || key === 'md' || classifyPath(key) === 'md' || (directory && key.split('/').includes('md'));
const qualifiedScript = (reference: string) => /^md\.([A-Za-z_][\w]*)\.[A-Za-z_][\w]*$/.exec(reference.trim())?.[1];
const MAX_PROVIDERS = 32;

export function withCanonicalMdReferences(
  context: EffectiveMdReferenceContext, projectPaths: readonly string[], referenceRoot: string,
  options: CanonicalMdValidationOptions, plain: boolean,
): EffectiveMdReferenceContext | undefined {
  const requested = new Map<string, Set<string>>();
  const selected: Document[] = [];
  for (const document of context.documents) {
    const refs = document.references.filter(call => {
      const script = qualifiedScript(call.ref);
      if (!script) return false;
      const key = script.toLowerCase();
      if (context.index.has(key)) return false;
      const variants = requested.get(key) ?? new Set<string>();
      variants.add(script);
      requested.set(key, variants);
      return true;
    });
    if (!plain || !refs.length) continue;
    const includes = new Set(refs.filter(call => call.role === 'include_actions').map(call => call.id));
    selected.push({ ...document, declarations: [], references: refs, includes: document.includes.filter(call => includes.has(call.id)) });
  }
  if (!requested.size) return undefined;

  const claimed = new Set(projectPaths.map(authoredMdSourceKey));
  const memo: CanonicalMdConsultation = { root: referenceRoot, paths: [] };
  const loaded: Document[] = [];
  // Even an off-stem authored file could declare a competing script identity.
  const skippedMd = options.skippedFiles?.some(file => isAuthoredMdInventoryPath(authoredMdSourceKey(file.path), file.directory));
  const catalog = context.complete && !skippedMd && referenceRoot ? options.read(referenceRoot) : undefined;
  if (catalog) {
    for (const [key, variants] of [...requested].sort(([a], [b]) => a.localeCompare(b))) {
      if (memo.paths.length >= MAX_PROVIDERS) break;
      const provider = catalog.providers.get(key);
      if (!provider || !variants.has(provider.name) || claimed.has(authoredMdSourceKey(provider.relativePath))) continue;
      memo.paths.push(provider.relativePath);
      try {
        const document = resolveEffectiveReferenceDocument(catalog.root, provider.relativePath, true);
        if (!document.complete || document.content === undefined) continue;
        const facts = plainMdLibraryPurposeFacts(provider.relativePath, document.content, { status: 'absent' });
        if ('unavailable' in facts || facts.referenceUnavailable || facts.name !== provider.name) continue;
        // These offsets are in composed corpus XML, never original authored positions.
        const declarations = facts.declarations.map(({ id, name, kind, purpose, signature }) => ({
          id, name, kind, purpose, inherited: true,
          signature: signature?.status === 'known' ? { ...signature, parameters: signature.parameters
            .map(({ name, hasDefault }) => ({ name, hasDefault })) } : signature,
        }));
        loaded.push({ ...facts, declarations, references: [], includes: [], inventoryChanges: [] });
      } catch { /* A provider without an authoritative effective document stays external. */ }
    }
    const latest = readCanonicalMdProviderGeneration(referenceRoot);
    if (latest?.root === catalog.root && latest.generation === catalog.generation) memo.generation = catalog.generation;
    else { loaded.length = 0; memo.paths.length = 0; }
  }
  options.consulted?.(memo);
  const canonicalIndex = buildMdLibraryIndex(loaded.map(document => ({ name: document.name, source: document,
    declarations: document.declarations.map(declaration => ({ ...declaration, source: declaration })) })));
  return {
    ...context,
    index: new Map([...context.index, ...canonicalIndex]),
    canonicalIndex,
    documents: plain ? selected : context.documents,
  };
}
