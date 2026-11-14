/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B117 — closed-world Agent API route authority.
 *
 * The reviewed route manifest is the only grant source. This module deliberately knows
 * nothing about Express handlers or key persistence: it validates/compiles exact route
 * templates and returns a secret-free decision for the auth/workspace middleware.
 */

import crypto from 'crypto';

export type AgentKeyScope = 'read' | 'write' | 'deploy' | 'all';
export const AGENT_KEY_SCOPES = ['read', 'write', 'deploy', 'all'] as const satisfies readonly AgentKeyScope[];
/** The scopes a ROUTE may list (its reviewed preset). `all` is key-only - it is never written on a route. */
export const AGENT_ROUTE_SCOPES = ['read', 'write', 'deploy'] as const satisfies readonly AgentKeyScope[];

/**
 * Does a KEY scope cover a route's (or capability's) reviewed agent scopes? Routes list read/write/deploy; `all` is a
 * key-only MASTER agent scope - the union of them: every route ANY agent scope may use. It never reaches a Studio-only
 * route (empty list) and never an unreviewed one (that fails resolution before this is asked). One helper, so every
 * enforcement point (allows(), the request gate, capability narrowing) means the same thing by it.
 */
export function agentScopeCovers(routeScopes: readonly string[], keyScope: string | null | undefined): boolean {
  if (!keyScope) return false;
  if (keyScope === 'all') return routeScopes.length > 0;
  return routeScopes.includes(keyScope);
}

export type AgentAuthorityResourceClass =
  | 'public'
  | 'workspace'
  | 'inline-or-addressed'
  | 'configured-root'
  | 'global-session'
  | 'process-telemetry'
  | 'cross-workspace-session'
  | 'provider-network'
  | 'host-file-read'
  | 'external-repository'
  | 'command-session'
  | 'stateless-analysis';

export type WorkspaceAuthorityMode = 'none' | 'optional' | 'required' | 'input-first';

export interface AgentRouteAuthorityEntry {
  disposition: string;
  owner: string;
  registrations: number;
  agentScopes: AgentKeyScope[];
  resourceClass: AgentAuthorityResourceClass;
  workspaceMode: WorkspaceAuthorityMode;
}

/** This class covers only the owned backend's bounded telemetry controls.
 * It does not grant a route prefix or change Studio-only global-session authority. */
export const PROCESS_TELEMETRY_ROUTE_OWNERS: Readonly<Record<string, string>> = Object.freeze({
  'GET /api/agent/performance': 'performance.read',
  'POST /api/agent/performance/collection': 'performance.collect',
  'POST /api/agent/performance/profile': 'performance.profile',
});

/** Native telemetry has separately reviewed scopes; backend-only tuples stay unchanged. */
export const NATIVE_PROCESS_TELEMETRY_ROUTE_TUPLES: Readonly<Record<string, Readonly<{
  owner: string;
  agentScopes: readonly AgentKeyScope[];
}>>> = Object.freeze({
  'GET /api/agent/performance/native': Object.freeze({ owner: 'performance.native.read', agentScopes: Object.freeze(['read', 'write', 'deploy'] as const) }),
  'POST /api/agent/performance/native/collection': Object.freeze({ owner: 'performance.native.collect', agentScopes: Object.freeze(['write', 'deploy'] as const) }),
  'POST /api/agent/performance/native/stop': Object.freeze({ owner: 'performance.native.stop', agentScopes: Object.freeze(['write', 'deploy'] as const) }),
});

export function processTelemetryRouteAuthorityErrors(routeKey: string, entry: unknown): string[] {
  if (!isRecord(entry) || entry.resourceClass !== 'process-telemetry') return [];
  const errors: string[] = [];
  const nativeTuple = Object.hasOwn(NATIVE_PROCESS_TELEMETRY_ROUTE_TUPLES, routeKey) ? NATIVE_PROCESS_TELEMETRY_ROUTE_TUPLES[routeKey] : undefined;
  const owner = nativeTuple?.owner ?? (Object.hasOwn(PROCESS_TELEMETRY_ROUTE_OWNERS, routeKey) ? PROCESS_TELEMETRY_ROUTE_OWNERS[routeKey] : undefined);
  const scopes = nativeTuple?.agentScopes ?? AGENT_ROUTE_SCOPES;
  if (!owner || entry.owner !== owner) errors.push('process-telemetry requires an exact reviewed performance method, route and owner');
  if (entry.disposition !== 'canonical-capability' || entry.registrations !== 1) errors.push('process-telemetry requires one canonical registration');
  if (entry.workspaceMode !== 'none') errors.push('process-telemetry requires workspaceMode none');
  if (!Array.isArray(entry.agentScopes) || entry.agentScopes.join(',') !== scopes.join(',')) {
    errors.push(`process-telemetry requires the ${scopes.join('/')} preset`);
  }
  return errors;
}

export interface AgentRouteAuthorityManifest {
  schemaVersion: 'forge.route-dispositions.v4';
  sources: string[];
  routes: Record<string, AgentRouteAuthorityEntry>;
  dynamicRoutes: Record<string, AgentRouteAuthorityEntry>;
  capabilitySignatures: Record<string, string>;
  mcpModuleSignature: { version: number; hash: string };
  mcpSignatures: Record<string, string>;
  mcpCapabilityIdentities: Record<string, string>;
}

export interface AgentRouteAuthorityDecision {
  policyVersion: AgentRouteAuthorityManifest['schemaVersion'];
  policyHash: string;
  routeKey: string;
  method: string;
  template: string;
  disposition: string;
  owner: string;
  agentScopes: AgentKeyScope[];
  resourceClass: AgentAuthorityResourceClass;
  workspaceMode: WorkspaceAuthorityMode;
}

export type AgentAuthorityResolution =
  | { ok: true; decision: AgentRouteAuthorityDecision }
  | { ok: false; reason: 'unreviewed_route' | 'malformed_path' };

interface CompiledRoute {
  method: string;
  template: string;
  segments: string[];
  params: boolean[];
  entry: AgentRouteAuthorityEntry;
}

export interface AgentRouteAuthority {
  policyVersion: AgentRouteAuthorityManifest['schemaVersion'];
  policyHash: string;
  resolve(method: string, requestPath: string): AgentAuthorityResolution;
  /** Resolve one exact reviewed Express template without fabricating a concrete parameter. */
  resolveTemplate(method: string, template: string): AgentAuthorityResolution;
  allows(scope: AgentKeyScope, method: string, requestPath: string): boolean;
}

const RESOURCE_CLASSES = new Set<AgentAuthorityResourceClass>([
  'public',
  'workspace',
  'inline-or-addressed',
  'configured-root',
  'global-session',
  'process-telemetry',
  'cross-workspace-session',
  'provider-network',
  'host-file-read',
  'external-repository',
  'command-session',
  'stateless-analysis',
]);

const WORKSPACE_MODES = new Set<WorkspaceAuthorityMode>(['none', 'optional', 'required', 'input-first']);
const METHOD_RE = /^[A-Z]+$/;
const PARAM_RE = /^:[A-Za-z_][A-Za-z0-9_]*$/;
const LITERAL_SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;
const ENCODED_SEPARATOR_RE = /%(?:2f|5c)/i;
const ALLOWED_SCOPE_CHAINS = new Set(['', 'deploy', 'write,deploy', 'read,write,deploy']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function templateParts(template: string): { segments: string[]; params: boolean[] } | null {
  if (!template.startsWith('/api/') || template.includes('?') || template.includes('#') ||
    template.includes('\\') || ENCODED_SEPARATOR_RE.test(template) || template.endsWith('/')) return null;
  const segments = template.split('/').slice(1);
  const params = segments.map(segment => PARAM_RE.test(segment));
  if (segments.some((segment, index) => !params[index] && !LITERAL_SEGMENT_RE.test(segment))) return null;
  return { segments, params };
}

function templatesOverlap(left: CompiledRoute, right: CompiledRoute): boolean {
  if (left.method !== right.method || left.segments.length !== right.segments.length) return false;
  return left.segments.every((segment, index) => left.params[index] || right.params[index] || segment === right.segments[index]);
}

function requestSegments(requestPath: string): string[] | null {
  if (!requestPath.startsWith('/api/') || requestPath.includes('?') || requestPath.includes('#') ||
    requestPath.includes('\\') || requestPath.includes('\0') || requestPath.includes('%') || ENCODED_SEPARATOR_RE.test(requestPath) ||
    requestPath.endsWith('/')) return null;
  const segments = requestPath.split('/').slice(1);
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || !LITERAL_SEGMENT_RE.test(segment))) return null;
  return segments;
}

function entryErrors(raw: unknown, label: string): string[] {
  if (!isRecord(raw)) return [`${label} must be an object`];
  const errors: string[] = [];
  const expected = ['disposition', 'owner', 'registrations', 'agentScopes', 'resourceClass', 'workspaceMode'];
  for (const field of expected) if (!Object.hasOwn(raw, field)) errors.push(`${label} is missing ${field}`);
  for (const field of Object.keys(raw)) if (!expected.includes(field)) errors.push(`${label} has unsupported field ${field}`);
  if (typeof raw.disposition !== 'string' || !raw.disposition.trim()) errors.push(`${label}.disposition is invalid`);
  if (typeof raw.owner !== 'string' || !raw.owner.trim()) errors.push(`${label}.owner is invalid`);
  if (!Number.isInteger(raw.registrations) || Number(raw.registrations) < 1) errors.push(`${label}.registrations is invalid`);
  if (!Array.isArray(raw.agentScopes) || !ALLOWED_SCOPE_CHAINS.has(raw.agentScopes.join(','))) {
    errors.push(`${label}.agentScopes must be one of [], [deploy], [write, deploy], or [read, write, deploy]`);
  }
  if (typeof raw.resourceClass !== 'string' || !RESOURCE_CLASSES.has(raw.resourceClass as AgentAuthorityResourceClass)) {
    errors.push(`${label}.resourceClass is invalid`);
  }
  if (typeof raw.workspaceMode !== 'string' || !WORKSPACE_MODES.has(raw.workspaceMode as WorkspaceAuthorityMode)) {
    errors.push(`${label}.workspaceMode is invalid`);
  }
  return errors;
}

export function agentRouteAuthorityManifestErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['authority manifest must be an object'];
  const errors: string[] = [];
  if (value.schemaVersion !== 'forge.route-dispositions.v4') {
    errors.push(`authority manifest schema must be forge.route-dispositions.v4, got ${String(value.schemaVersion)}`);
  }
  if (!isRecord(value.routes)) errors.push('authority manifest routes must be an object');
  if (!isRecord(value.dynamicRoutes)) errors.push('authority manifest dynamicRoutes must be an object');
  if (isRecord(value.routes)) {
    for (const [key, entry] of Object.entries(value.routes)) {
      errors.push(...entryErrors(entry, `routes.${key}`));
      errors.push(...processTelemetryRouteAuthorityErrors(key, entry).map(error => `routes.${key}: ${error}`));
      const match = key.match(/^([A-Z]+) (\/\S*|\*)$/);
      if (!match || !METHOD_RE.test(match[1])) errors.push(`routes.${key} has a malformed route key`);
      else if (match[2].startsWith('/api/') && !templateParts(match[2])) errors.push(`routes.${key} has an unsupported API template`);
    }
  }
  if (isRecord(value.dynamicRoutes)) {
    for (const [key, entry] of Object.entries(value.dynamicRoutes)) {
      errors.push(...entryErrors(entry, `dynamicRoutes.${key}`));
      if (isRecord(entry) && entry.resourceClass === 'process-telemetry') {
        errors.push(`dynamicRoutes.${key}: process-telemetry is limited to exact literal route entries`);
      }
    }
  }
  return errors;
}

export function createAgentRouteAuthority(value: unknown): AgentRouteAuthority {
  const errors = agentRouteAuthorityManifestErrors(value);
  if (errors.length) throw new Error(`Invalid agent route authority manifest: ${errors.join(' | ')}`);
  const manifest = value as unknown as AgentRouteAuthorityManifest;
  const compiled: CompiledRoute[] = [];
  for (const [key, entry] of Object.entries(manifest.routes)) {
    const match = key.match(/^([A-Z]+) (\/\S*|\*)$/)!;
    const method = match[1];
    const template = match[2];
    if (!template.startsWith('/api/')) continue;
    const parts = templateParts(template)!;
    compiled.push({ method, template, ...parts, entry });
  }
  for (let left = 0; left < compiled.length; left += 1) {
    for (let right = left + 1; right < compiled.length; right += 1) {
      if (templatesOverlap(compiled[left], compiled[right])) {
        throw new Error(`Invalid agent route authority manifest: overlapping templates ${compiled[left].method} ${compiled[left].template} and ${compiled[right].method} ${compiled[right].template}`);
      }
    }
  }
  const policyHash = crypto.createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex');
  const decisionFor = (route: CompiledRoute): AgentAuthorityResolution => ({
    ok: true,
    decision: {
      policyVersion: manifest.schemaVersion,
      policyHash,
      routeKey: `${route.method} ${route.template}`,
      method: route.method,
      template: route.template,
      disposition: route.entry.disposition,
      owner: route.entry.owner,
      agentScopes: [...route.entry.agentScopes],
      resourceClass: route.entry.resourceClass,
      workspaceMode: route.entry.workspaceMode,
    },
  });
  return {
    policyVersion: manifest.schemaVersion,
    policyHash,
    resolve(method, requestPath) {
      const normalizedMethod = String(method || '').toUpperCase();
      if (!METHOD_RE.test(normalizedMethod)) return { ok: false, reason: 'malformed_path' };
      const segments = requestSegments(requestPath);
      if (!segments) return { ok: false, reason: 'malformed_path' };
      const route = compiled.find(candidate => candidate.method === normalizedMethod &&
        candidate.segments.length === segments.length &&
        candidate.segments.every((segment, index) => candidate.params[index] ? true : segment === segments[index]));
      if (!route) return { ok: false, reason: 'unreviewed_route' };
      return decisionFor(route);
    },
    resolveTemplate(method, template) {
      const normalizedMethod = String(method || '').toUpperCase();
      if (!METHOD_RE.test(normalizedMethod) || !templateParts(String(template || ''))) {
        return { ok: false, reason: 'malformed_path' };
      }
      const route = compiled.find(candidate => candidate.method === normalizedMethod && candidate.template === template);
      return route ? decisionFor(route) : { ok: false, reason: 'unreviewed_route' };
    },
    allows(scope, method, requestPath) {
      const resolved = this.resolve(method, requestPath);
      return resolved.ok && agentScopeCovers(resolved.decision.agentScopes, scope);
    },
  };
}

function fixtureManifest(routes: Record<string, AgentRouteAuthorityEntry>): AgentRouteAuthorityManifest {
  return {
    schemaVersion: 'forge.route-dispositions.v4',
    sources: ['fixture.ts'],
    routes,
    dynamicRoutes: {},
    capabilitySignatures: { 'fixture.read@1': 'a'.repeat(64) },
    mcpModuleSignature: { version: 1, hash: 'b'.repeat(64) },
    mcpSignatures: { fixture: 'c'.repeat(64) },
    mcpCapabilityIdentities: { fixture: 'fixture.read@1' },
  };
}

function fixtureEntry(agentScopes: AgentKeyScope[]): AgentRouteAuthorityEntry {
  return {
    disposition: 'legacy-agent-api',
    owner: 'fixture',
    registrations: 1,
    agentScopes,
    resourceClass: 'workspace',
    workspaceMode: 'required',
  };
}

export function runAgentRouteAuthoritySelftest(): {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const authority = createAgentRouteAuthority(fixtureManifest({
    'GET /api/agent/workspace': fixtureEntry(['read', 'write', 'deploy']),
    'POST /api/agent/workspace': fixtureEntry(['write', 'deploy']),
    'GET /api/agent/history/:id/raw': fixtureEntry(['deploy']),
    'GET *': { ...fixtureEntry([]), resourceClass: 'global-session', workspaceMode: 'none' },
  }));

  ok('exact_literal_scope_matrix',
    authority.allows('read', 'GET', '/api/agent/workspace') &&
    !authority.allows('read', 'POST', '/api/agent/workspace') &&
    authority.allows('write', 'POST', '/api/agent/workspace'));
  ok('parameter_matches_one_safe_segment',
    authority.allows('deploy', 'GET', '/api/agent/history/row_1/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/row_1/extra/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/../raw'));
  const exactTemplate = authority.resolveTemplate('GET', '/api/agent/history/:id/raw');
  ok('exact_template_resolution_does_not_fabricate_parameters',
    exactTemplate.ok && exactTemplate.decision.routeKey === 'GET /api/agent/history/:id/raw' &&
    !authority.resolveTemplate('GET', '/api/agent/history/:other/raw').ok &&
    !authority.resolveTemplate('GET', '/api/agent/history/value/raw').ok);
  ok('unknown_method_and_prefix_child_fail_closed',
    !authority.allows('deploy', 'DELETE', '/api/agent/workspace') &&
    !authority.allows('deploy', 'GET', '/api/agent/Workspace') &&
    !authority.allows('deploy', 'GET', '/api/agent/workspaces') &&
    !authority.allows('deploy', 'GET', '/api/agent/workspace/future'));
  ok('malformed_and_encoded_paths_fail_closed',
    !authority.allows('deploy', 'GET', '/api/agent/history/a%2Fb/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/a%5Cb/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/%2e/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/%2e%2e/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/%00/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/history/bad%/raw') &&
    !authority.allows('deploy', 'GET', '/api/agent/workspace?x=1') &&
    !authority.allows('deploy', 'GET', '/api/agent/workspace/'));
  ok('ui_wildcard_never_grants_api_authority',
    !authority.allows('deploy', 'GET', '/api/agent/unreviewed'));

  let overlapRejected = false;
  try {
    createAgentRouteAuthority(fixtureManifest({
      'GET /api/agent/history/:id/raw': fixtureEntry(['read']),
      'GET /api/agent/history/fixed/raw': fixtureEntry(['read']),
    }));
  } catch { overlapRejected = true; }
  ok('overlapping_templates_rejected', overlapRejected);

  const malformed = fixtureManifest({ 'GET /api/agent/workspace': fixtureEntry(['deploy', 'read']) });
  const nonHierarchical = fixtureManifest({ 'GET /api/agent/workspace': fixtureEntry(['read', 'deploy']) });
  ok('unordered_and_non_hierarchical_scope_arrays_rejected',
    agentRouteAuthorityManifestErrors(malformed).some(error => error.includes('must be one of')) &&
    agentRouteAuthorityManifestErrors(nonHierarchical).some(error => error.includes('must be one of')));

  const reordered = fixtureManifest({
    'POST /api/agent/workspace': fixtureEntry(['write', 'deploy']),
    'GET /api/agent/workspace': fixtureEntry(['read', 'write', 'deploy']),
    'GET /api/agent/history/:id/raw': fixtureEntry(['deploy']),
    'GET *': { ...fixtureEntry([]), resourceClass: 'global-session', workspaceMode: 'none' },
  });
  ok('policy_hash_is_key_order_independent', authority.policyHash === createAgentRouteAuthority(reordered).policyHash);

  const telemetryEntry = (owner: string): AgentRouteAuthorityEntry => ({
    disposition: 'canonical-capability', owner, registrations: 1, agentScopes: [...AGENT_ROUTE_SCOPES],
    resourceClass: 'process-telemetry', workspaceMode: 'none',
  });
  const telemetryRoutes = Object.fromEntries(Object.entries(PROCESS_TELEMETRY_ROUTE_OWNERS).map(([key, owner]) => [key, telemetryEntry(owner)]));
  const telemetry = createAgentRouteAuthority(fixtureManifest(telemetryRoutes));
  for (const key of Object.keys(telemetryRoutes)) {
    const [method, route] = key.split(' ');
    ok(`process_telemetry_exact_presets_${key}`, ['read', 'write', 'deploy', 'all'].every(scope => telemetry.allows(scope as AgentKeyScope, method, route)));
  }
  ok('process_telemetry_does_not_grant_prefix_or_other_method',
    !telemetry.allows('read', 'POST', '/api/agent/performance') &&
      !telemetry.allows('read', 'POST', '/api/agent/performance/profile/extra') &&
      !telemetry.allows('read', 'POST', '/api/agent/performance/reset') &&
      !telemetry.allows('read', 'GET', '/api/agent/workspace'));
  const readTelemetry = telemetryEntry('performance.read');
  const telemetryNegatives: Array<[string, string, AgentRouteAuthorityEntry]> = [
    ['foreign_route', 'GET /api/agent/workspace', readTelemetry],
    ['wrong_verb', 'POST /api/agent/performance', readTelemetry],
    ['prefix_child', 'GET /api/agent/performance/extra', readTelemetry],
    ['wrong_owner', 'GET /api/agent/performance', { ...readTelemetry, owner: 'performance.profile' }],
    ['noncanonical', 'GET /api/agent/performance', { ...readTelemetry, disposition: 'legacy-agent-api' }],
    ['public', 'GET /api/agent/performance', { ...readTelemetry, disposition: 'legacy-public' }],
    ['duplicate_registration', 'GET /api/agent/performance', { ...readTelemetry, registrations: 2 }],
    ['workspace', 'GET /api/agent/performance', { ...readTelemetry, workspaceMode: 'optional' }],
    ['missing_scope', 'GET /api/agent/performance', { ...readTelemetry, agentScopes: ['write', 'deploy'] }],
    ['master_scope', 'GET /api/agent/performance', { ...readTelemetry, agentScopes: ['all'] }],
  ];
  for (const [name, key, entry] of telemetryNegatives) {
    let rejected = false;
    try { createAgentRouteAuthority(fixtureManifest({ [key]: entry })); } catch { rejected = true; }
    ok(`process_telemetry_rejects_${name}`, rejected);
  }
  const dynamicTelemetry = fixtureManifest({ 'GET /api/agent/workspace': fixtureEntry(['read', 'write', 'deploy']) });
  dynamicTelemetry.dynamicRoutes['GET route @ fixture.ts'] = readTelemetry;
  ok('process_telemetry_rejects_dynamic_registrar', agentRouteAuthorityManifestErrors(dynamicTelemetry).some(error => error.includes('exact literal route entries')));
  dynamicTelemetry.dynamicRoutes = { 'GET /api/agent/performance': readTelemetry };
  ok('process_telemetry_rejects_literal_key_inside_dynamic_routes', agentRouteAuthorityManifestErrors(dynamicTelemetry).some(error => error.includes('exact literal route entries')));

  // Native tuples are literal fixtures, independent of the production route-owner registry.
  const nativeTelemetryTuples: Array<[string, string, AgentRouteAuthorityEntry]> = [
    ['GET', '/api/agent/performance/native', { ...telemetryEntry('performance.native.read'), agentScopes: ['read', 'write', 'deploy'] }],
    ['POST', '/api/agent/performance/native/collection', { ...telemetryEntry('performance.native.collect'), agentScopes: ['write', 'deploy'] }],
    ['POST', '/api/agent/performance/native/stop', { ...telemetryEntry('performance.native.stop'), agentScopes: ['write', 'deploy'] }],
  ];
  for (const [method, route, entry] of nativeTelemetryTuples) {
    const routeKey = `${method} ${route}`;
    let nativeAuthority: AgentRouteAuthority | undefined;
    try { nativeAuthority = createAgentRouteAuthority(fixtureManifest({ [routeKey]: entry })); } catch { /* The positive must record RED rather than abort the remaining cases. */ }
    ok(`native_process_telemetry_exact_tuple_${entry.owner}`,
      processTelemetryRouteAuthorityErrors(routeKey, entry).length === 0 && !!nativeAuthority &&
      ['read', 'write', 'deploy', 'all'].every(scope => nativeAuthority!.allows(scope as AgentKeyScope, method, route) === agentScopeCovers(entry.agentScopes, scope)));
    const nativeNegatives: Array<[string, string, AgentRouteAuthorityEntry]> = [
      ['wrong_method', `${method === 'GET' ? 'POST' : 'GET'} ${route}`, entry],
      ['prefix_child', `${routeKey}/extra`, entry],
      ['wrong_owner', routeKey, { ...entry, owner: 'performance.read' }],
      ['wrong_scope', routeKey, { ...entry, agentScopes: entry.owner === 'performance.native.read' ? ['write', 'deploy'] : ['read', 'write', 'deploy'] }],
      ['noncanonical', routeKey, { ...entry, disposition: 'legacy-agent-api' }],
      ['workspace', routeKey, { ...entry, workspaceMode: 'optional' }],
      ['duplicate_registration', routeKey, { ...entry, registrations: 2 }],
      ['master_scope', routeKey, { ...entry, agentScopes: ['all'] }],
    ];
    for (const [name, key, invalidEntry] of nativeNegatives) {
      let rejected = false;
      try { createAgentRouteAuthority(fixtureManifest({ [key]: invalidEntry })); } catch { rejected = true; }
      ok(`native_process_telemetry_rejects_${entry.owner}_${name}`, rejected);
    }
    for (const key of ['GET route @ fixture.ts', routeKey]) {
      const dynamic = fixtureManifest({ 'GET /api/agent/workspace': fixtureEntry(['read', 'write', 'deploy']) });
      dynamic.dynamicRoutes[key] = entry;
      ok(`native_process_telemetry_rejects_dynamic_${entry.owner}_${key}`,
        agentRouteAuthorityManifestErrors(dynamic).some(error => error.includes('exact literal route entries')));
    }
  }

  return { pass: checks.every(check => check.pass), checks };
}
