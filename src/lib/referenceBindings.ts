/** Context bindings for X4 references whose XSD type is only string/expression. */

import type { CanonicalSymbolKind } from './referenceCorpus';

export interface ReferenceBindingContext {
  domain: string;
  element: string;
  attribute: string;
  type?: string;
  baseType?: string;
}

interface ReferenceBinding {
  domain: string;
  attributes: string[];
  elements?: string[];
  kind: CanonicalSymbolKind;
}

const BINDINGS: ReferenceBinding[] = [
  { domain: 'libraries', attributes: ['ware'], kind: 'ware' },
  { domain: 'libraries', attributes: ['job'], kind: 'job' },
  { domain: 'libraries', attributes: ['faction', 'owner'], kind: 'faction' },
  { domain: 'libraries', attributes: ['macro'], kind: 'macro' },
  { domain: 'libraries', elements: ['task'], attributes: ['task', 'script'], kind: 'aiscript' },
];

export function typedReferenceKind(typeInput?: string, baseTypeInput?: string): CanonicalSymbolKind | null {
  const type = `${typeInput || ''} ${baseTypeInput || ''}`.toLowerCase();
  if (type.includes('faction')) return 'faction';
  if (type.includes('ware')) return 'ware';
  if (type.includes('sector')) return 'sector';
  if (type.includes('job')) return 'job';
  if (type.includes('aiscript') || type.includes('scriptlookup')) return 'aiscript';
  if (type.includes('macro') || type.includes('component')) return 'macro';
  return null;
}

export function resolveReferenceBinding(context: ReferenceBindingContext): CanonicalSymbolKind | null {
  const typed = typedReferenceKind(context.type, context.baseType);
  if (typed) return typed;
  const domain = context.domain.toLowerCase();
  const element = context.element.toLowerCase();
  const attribute = context.attribute.toLowerCase();
  return BINDINGS.find(binding => binding.domain === domain
    && binding.attributes.includes(attribute)
    && (!binding.elements || binding.elements.includes(element)))?.kind || null;
}

export function fallbackLibrarySchemaDomain(filePath: string): string | null {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return /(^|\/)libraries\/(wares|jobs)\.xml$/.test(normalized) ? 'libraries' : null;
}

export function selectorIdentityKind(root: string, element: string, attribute: string): CanonicalSymbolKind | null {
  const key = `${root.toLowerCase()}/${element.toLowerCase()}/@${attribute.toLowerCase()}`;
  if (key === 'wares/ware/@id') return 'ware';
  if (key === 'jobs/job/@id') return 'job';
  if (key === 'factions/faction/@id') return 'faction';
  if (element.toLowerCase() === 'macro' && attribute.toLowerCase() === 'name') return 'macro';
  return null;
}

/** Asset-file namespaces are contextual; the older completion union above is unchanged. */
export interface XmlAssetReferenceBinding {
  kind: 'macro' | 'component' | 'ware' | 'bullet' | 'local-connection';
  targetKind?: 'macro' | 'component' | 'ware';
  scope: 'global' | 'local';
}

export function resolveXmlAssetReferenceBinding(context: {
  root: string; ancestors: readonly string[]; element: string; attribute: string;
}): XmlAssetReferenceBinding | null {
  const root = context.root.toLowerCase();
  const element = context.element.toLowerCase();
  const attribute = context.attribute.toLowerCase();
  const ancestors = context.ancestors.map(name => name.toLowerCase());
  if (element === 'component' && attribute === 'ref') {
    if (root === 'wares' && ancestors.includes('ware')) return { kind: 'macro', targetKind: 'macro', scope: 'global' };
    if (root === 'macros' && ancestors.includes('macro')) return { kind: 'component', targetKind: 'component', scope: 'global' };
  }
  if (root === 'macros' && ancestors.includes('macro')) {
    if (element === 'macro' && attribute === 'ref') return { kind: 'macro', targetKind: 'macro', scope: 'global' };
    if (element === 'bullet' && attribute === 'class') return { kind: 'bullet', targetKind: 'macro', scope: 'global' };
    if (element === 'connection' && attribute === 'ref') return { kind: 'local-connection', scope: 'local' };
  }
  if (root === 'wares' && element === 'ware' && attribute === 'ware') return { kind: 'ware', targetKind: 'ware', scope: 'global' };
  return null;
}

export function runReferenceBindingsSelftest() {
  const checks = [
    { name: 'typed faction wins', pass: resolveReferenceBinding({ domain: 'md', element: 'event_owner', attribute: 'owner', type: 'factionlookup' }) === 'faction' },
    { name: 'generic library ware binds', pass: resolveReferenceBinding({ domain: 'libraries', element: 'primary', attribute: 'ware', type: 'xs:string' }) === 'ware' },
    { name: 'library subordinate job binds', pass: resolveReferenceBinding({ domain: 'libraries', element: 'subordinate', attribute: 'job' }) === 'job' },
    { name: 'task binding is element scoped', pass: resolveReferenceBinding({ domain: 'libraries', element: 'task', attribute: 'task' }) === 'aiscript' },
    { name: 'generic unknown remains unbound', pass: resolveReferenceBinding({ domain: 'md', element: 'set_value', attribute: 'name', type: 'xs:string' }) === null },
    { name: 'wares fallback uses shared libraries schema', pass: fallbackLibrarySchemaDomain('extensions/mod/libraries/wares.xml') === 'libraries' },
    { name: 'ware selector identity binds', pass: selectorIdentityKind('wares', 'ware', 'id') === 'ware' },
    { name: 'ware component ref uses macro namespace', pass: resolveXmlAssetReferenceBinding({ root: 'wares', ancestors: ['wares', 'ware'], element: 'component', attribute: 'ref' })?.targetKind === 'macro' },
    { name: 'macro component ref uses component namespace', pass: resolveXmlAssetReferenceBinding({ root: 'macros', ancestors: ['macros', 'macro'], element: 'component', attribute: 'ref' })?.targetKind === 'component' },
    { name: 'macro child ref uses macro namespace', pass: resolveXmlAssetReferenceBinding({ root: 'macros', ancestors: ['macros', 'macro', 'connections', 'connection'], element: 'macro', attribute: 'ref' })?.targetKind === 'macro' },
    { name: 'weapon bullet class uses macro namespace', pass: resolveXmlAssetReferenceBinding({ root: 'macros', ancestors: ['macros', 'macro', 'properties'], element: 'bullet', attribute: 'class' })?.targetKind === 'macro' },
    { name: 'connection names remain scoped', pass: resolveXmlAssetReferenceBinding({ root: 'macros', ancestors: ['macros', 'macro', 'connections'], element: 'connection', attribute: 'ref' })?.scope === 'local' },
    { name: 'unrelated component remains unbound', pass: resolveXmlAssetReferenceBinding({ root: 'unknown', ancestors: ['unknown'], element: 'component', attribute: 'ref' }) === null },
  ];
  const passed = checks.filter(check => check.pass).length;
  return { pass: passed === checks.length, allPassed: passed === checks.length, passed, total: checks.length, checks };
}
