/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B118 — compose immutable per-key narrowing with the canonical Forge capability
 * registry and B117's exact route authority. Metadata never grants: every effective
 * capability must still resolve to its reviewed primary route.
 */

import {
  FORGE_CAPABILITIES,
  FORGE_CAPABILITY_EFFECTS,
  type ForgeCapabilityDescriptorV1,
  type ForgeCapabilityEffect,
} from './forgeCapabilities';
import type {
  AgentAuthorityResolution,
  AgentKeyScope,
  AgentRouteAuthorityDecision,
} from './agentAuthority';
import { agentScopeCovers } from './agentAuthority';

export const AGENT_CAPABILITY_AUTHORITY_SCHEMA_VERSION = 'forge.agent-capability-authority.v1' as const;
export const AGENT_CAPABILITY_AUTHORITY_API_VERSION = '2026-08-01.agent-effective.v1' as const;
export const AGENT_CAPABILITY_DISCOVERY_ROUTE_KEY = 'GET /api/agent/capabilities/effective' as const;
export const AGENT_CAPABILITY_DISCOVERY_DISPOSITION = 'agent-authority-discovery' as const;

export interface AgentCapabilityConstraint {
  /** Exact immutable id@version identities. Public capabilities remain public. */
  capabilityIdentities: string[];
  /** Every effect declared by a selected protected capability must be present. */
  allowedEffects: ForgeCapabilityEffect[];
}

export type AgentCapabilityDecisionCode =
  | 'ALLOWED'
  | 'CAPABILITY_ROUTE_UNREVIEWED'
  | 'CAPABILITY_OWNER_MISMATCH'
  | 'CAPABILITY_SCOPE_DENIED'
  | 'CAPABILITY_WORKSPACE_REQUIRED'
  | 'CAPABILITY_NOT_GRANTED'
  | 'CAPABILITY_EFFECT_DENIED'
  | 'UNCONTRACTED_ROUTE_DENIED';

export interface AgentCapabilityDecision {
  allowed: boolean;
  code: AgentCapabilityDecisionCode;
  capabilityIdentity?: string;
  disallowedEffects?: ForgeCapabilityEffect[];
}

export interface EffectiveCapabilityActor {
  kind: 'agent' | 'studio';
  scope?: AgentKeyScope;
  workspaceId?: string;
  constraint?: AgentCapabilityConstraint;
}

export interface EffectiveCapabilityExclusion {
  capabilityIdentity: string;
  code: Exclude<AgentCapabilityDecisionCode, 'ALLOWED' | 'UNCONTRACTED_ROUTE_DENIED'>;
  disallowedEffects?: ForgeCapabilityEffect[];
}

export type ResolveAgentRouteTemplate = (method: string, template: string) => AgentAuthorityResolution;

const EFFECT_ORDER = new Map(FORGE_CAPABILITY_EFFECTS.map((effect, index) => [effect, index]));
const EFFECT_SET = new Set<ForgeCapabilityEffect>(FORGE_CAPABILITY_EFFECTS);

/** Exact protected native identities require an explicit key grant, including legacy presets. */
function isNativePerformanceCapabilityId(id: string): boolean {
  return id === 'performance.native.read' || id === 'performance.native.collect' || id === 'performance.native.stop';
}

export function forgeCapabilityIdentity(capability: Pick<ForgeCapabilityDescriptorV1, 'id' | 'version'>): string {
  return `${capability.id}@${capability.version}`;
}

function duplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function normalizeAgentCapabilityConstraint(
  capabilityIdentities: unknown,
  allowedEffects: unknown,
  scope: AgentKeyScope,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): { ok: true; constraint?: AgentCapabilityConstraint } | { ok: false; errors: string[] } {
  if (capabilityIdentities === undefined && allowedEffects === undefined) return { ok: true };
  const errors: string[] = [];
  if (!Array.isArray(capabilityIdentities) || !capabilityIdentities.every(value => typeof value === 'string')) {
    errors.push('capabilityIdentities must be an array of exact capability.id@version strings.');
  }
  if (!Array.isArray(allowedEffects) || !allowedEffects.every(value => typeof value === 'string')) {
    errors.push('allowedEffects must be an array of known Forge capability effects.');
  }
  if (errors.length) return { ok: false, errors };

  const identities = capabilityIdentities as string[];
  const effects = allowedEffects as string[];
  const duplicateIdentities = duplicateStrings(identities);
  const duplicateEffects = duplicateStrings(effects);
  if (duplicateIdentities.length) errors.push(`duplicate capability identities: ${duplicateIdentities.join(', ')}`);
  if (duplicateEffects.length) errors.push(`duplicate allowed effects: ${duplicateEffects.join(', ')}`);

  const byIdentity = new Map(capabilities.map(capability => [forgeCapabilityIdentity(capability), capability]));
  for (const identity of identities) {
    const capability = byIdentity.get(identity);
    if (!capability) errors.push(`unknown capability identity: ${identity}`);
    else if (capability.access.public) errors.push(`public capability does not belong in a key restriction: ${identity}`);
    else if (!agentScopeCovers(capability.access.agentScopes, scope)) {
      errors.push(`${identity} is outside the ${scope} preset.`);
    }
  }
  for (const effect of effects) {
    if (!EFFECT_SET.has(effect as ForgeCapabilityEffect)) errors.push(`unknown capability effect: ${effect}`);
  }
  const selectedEffectSet = new Set(identities.flatMap(identity => byIdentity.get(identity)?.effects || []));
  const surplusEffects = effects.filter(effect => EFFECT_SET.has(effect as ForgeCapabilityEffect) && !selectedEffectSet.has(effect as ForgeCapabilityEffect));
  if (surplusEffects.length) errors.push(`allowed effects unused by the selected capabilities: ${surplusEffects.sort().join(', ')}`);
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    constraint: {
      capabilityIdentities: [...identities].sort(),
      allowedEffects: [...effects as ForgeCapabilityEffect[]]
        .sort((left, right) => (EFFECT_ORDER.get(left) ?? 999) - (EFFECT_ORDER.get(right) ?? 999)),
    },
  };
}

function primaryRouteDecision(
  capability: ForgeCapabilityDescriptorV1,
  resolveTemplate: ResolveAgentRouteTemplate,
): AgentAuthorityResolution {
  const primary = capability.apiBindings.find(binding => binding.role === 'primary');
  return primary
    ? resolveTemplate(primary.method, primary.path)
    : { ok: false, reason: 'unreviewed_route' };
}

export function decideEffectiveCapability(
  capability: ForgeCapabilityDescriptorV1,
  actor: EffectiveCapabilityActor,
  resolveTemplate: ResolveAgentRouteTemplate,
): AgentCapabilityDecision {
  const identity = forgeCapabilityIdentity(capability);
  if (actor.kind === 'studio') return { allowed: true, code: 'ALLOWED', capabilityIdentity: identity };
  const route = primaryRouteDecision(capability, resolveTemplate);
  if (!route.ok) return { allowed: false, code: 'CAPABILITY_ROUTE_UNREVIEWED', capabilityIdentity: identity };
  if (route.decision.disposition !== 'canonical-capability' || route.decision.owner !== capability.id) {
    return { allowed: false, code: 'CAPABILITY_OWNER_MISMATCH', capabilityIdentity: identity };
  }
  if (!actor.scope || !agentScopeCovers(route.decision.agentScopes, actor.scope)) {
    return { allowed: false, code: 'CAPABILITY_SCOPE_DENIED', capabilityIdentity: identity };
  }
  if ((route.decision.workspaceMode === 'required' || capability.context.workspace === 'required') && !actor.workspaceId) {
    return { allowed: false, code: 'CAPABILITY_WORKSPACE_REQUIRED', capabilityIdentity: identity };
  }
  const native = isNativePerformanceCapabilityId(capability.id);
  if (native && !actor.constraint) return { allowed: false, code: 'CAPABILITY_NOT_GRANTED', capabilityIdentity: identity };
  // The key cannot make a public route private. Native identities remain explicitly protected.
  if (capability.access.public && !native) return { allowed: true, code: 'ALLOWED', capabilityIdentity: identity };
  if (!actor.constraint) return { allowed: true, code: 'ALLOWED', capabilityIdentity: identity };
  if (!actor.constraint.capabilityIdentities.includes(identity)) {
    return { allowed: false, code: 'CAPABILITY_NOT_GRANTED', capabilityIdentity: identity };
  }
  const allowedEffects = new Set(actor.constraint.allowedEffects);
  const disallowedEffects = capability.effects.filter(effect => !allowedEffects.has(effect));
  if (disallowedEffects.length) {
    return { allowed: false, code: 'CAPABILITY_EFFECT_DENIED', capabilityIdentity: identity, disallowedEffects };
  }
  return { allowed: true, code: 'ALLOWED', capabilityIdentity: identity };
}

export function buildEffectiveCapabilitySelection(
  actor: EffectiveCapabilityActor,
  resolveTemplate: ResolveAgentRouteTemplate,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): { capabilities: ForgeCapabilityDescriptorV1[]; exclusions: EffectiveCapabilityExclusion[] } {
  const selected: ForgeCapabilityDescriptorV1[] = [];
  const exclusions: EffectiveCapabilityExclusion[] = [];
  for (const capability of capabilities) {
    const decision = decideEffectiveCapability(capability, actor, resolveTemplate);
    if (decision.allowed) selected.push(capability);
    else exclusions.push({
      capabilityIdentity: decision.capabilityIdentity || forgeCapabilityIdentity(capability),
      code: decision.code as EffectiveCapabilityExclusion['code'],
      ...(decision.disallowedEffects?.length ? { disallowedEffects: decision.disallowedEffects } : {}),
    });
  }
  return { capabilities: selected, exclusions };
}

/** The one protected route that a contract-only key must reach to inspect itself. */
export function isAgentCapabilityDiscoveryRoute(decision: AgentRouteAuthorityDecision): boolean {
  return decision.routeKey === AGENT_CAPABILITY_DISCOVERY_ROUTE_KEY &&
    decision.disposition === AGENT_CAPABILITY_DISCOVERY_DISPOSITION;
}

/** Apply custom key narrowing after the exact preset decision and before handler execution. */
export function decideConstrainedAgentRoute(
  decision: AgentRouteAuthorityDecision,
  constraint: AgentCapabilityConstraint | undefined,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): AgentCapabilityDecision {
  if (!constraint && isNativePerformanceCapabilityId(decision.owner)) {
    const capability = capabilities.find(candidate => candidate.id === decision.owner);
    return { allowed: false, code: 'CAPABILITY_NOT_GRANTED',
      ...(capability ? { capabilityIdentity: forgeCapabilityIdentity(capability) } : {}) };
  }
  if (!constraint || isAgentCapabilityDiscoveryRoute(decision)) return { allowed: true, code: 'ALLOWED' };
  if (decision.disposition !== 'canonical-capability') {
    return { allowed: false, code: 'UNCONTRACTED_ROUTE_DENIED' };
  }
  const capability = capabilities.find(candidate => candidate.id === decision.owner);
  if (!capability) return { allowed: false, code: 'CAPABILITY_OWNER_MISMATCH' };
  const identity = forgeCapabilityIdentity(capability);
  if (!constraint.capabilityIdentities.includes(identity)) {
    return { allowed: false, code: 'CAPABILITY_NOT_GRANTED', capabilityIdentity: identity };
  }
  const allowedEffects = new Set(constraint.allowedEffects);
  const disallowedEffects = capability.effects.filter(effect => !allowedEffects.has(effect));
  if (disallowedEffects.length) {
    return { allowed: false, code: 'CAPABILITY_EFFECT_DENIED', capabilityIdentity: identity, disallowedEffects };
  }
  return { allowed: true, code: 'ALLOWED', capabilityIdentity: identity };
}

/** Pure injected native-authority controls. No route table, key store or global registry mutation. */
export function runNativeAgentCapabilityAuthoritySelftest(): {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const scopes: AgentKeyScope[] = ['read', 'write', 'deploy', 'all'];
  const nativeCapabilities: ForgeCapabilityDescriptorV1[] = [
    ['performance.native.read', 'GET', '/api/agent/performance/native', ['read', 'write', 'deploy']],
    ['performance.native.collect', 'POST', '/api/agent/performance/native/collection', ['write', 'deploy']],
    ['performance.native.stop', 'POST', '/api/agent/performance/native/stop', ['write', 'deploy']],
  ].map<ForgeCapabilityDescriptorV1>(([id, method, route, agentScopes]) => ({
    id: id as string, version: 1, title: 'Native authority fixture', description: 'Exact protected native telemetry fixture.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: { type: 'object', properties: {}, additionalProperties: false },
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: agentScopes as Array<'read' | 'write' | 'deploy'> },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: method as 'GET' | 'POST', path: route as string, inputLocation: method === 'GET' ? 'none' : 'body', role: 'primary' }],
    surfaces: { ui: [], cli: [], mcp: [], agentApi: true, builtInHarness: [], externalAgents: [] },
  }));
  const routeFor = (capability: ForgeCapabilityDescriptorV1): AgentRouteAuthorityDecision => {
    const primary = capability.apiBindings[0];
    return {
      policyVersion: 'forge.route-dispositions.v4', policyHash: 'f'.repeat(64),
      routeKey: `${primary.method} ${primary.path}`, method: primary.method, template: primary.path,
      disposition: 'canonical-capability', owner: capability.id,
      agentScopes: [...capability.access.agentScopes], resourceClass: 'process-telemetry', workspaceMode: 'none',
    };
  };
  const resolveNative: ResolveAgentRouteTemplate = (method, template) => {
    const capability = nativeCapabilities.find(candidate => candidate.apiBindings[0].method === method && candidate.apiBindings[0].path === template);
    return capability ? { ok: true, decision: routeFor(capability) } : { ok: false, reason: 'unreviewed_route' };
  };
  const constraintFor = (capability: ForgeCapabilityDescriptorV1): AgentCapabilityConstraint => ({
    capabilityIdentities: [forgeCapabilityIdentity(capability)], allowedEffects: [...capability.effects],
  });
  const denied = (decision: AgentCapabilityDecision, code: AgentCapabilityDecisionCode) => !decision.allowed && decision.code === code;

  for (const capability of nativeCapabilities) {
    const identity = forgeCapabilityIdentity(capability);
    const route = routeFor(capability);
    const exact = constraintFor(capability);
    for (const scope of scopes) {
      // Route narrowing has no scope parameter: auth first composes the reviewed preset with this decision.
      ok(`native_unconstrained_route_${identity}_${scope}`,
        denied(decideConstrainedAgentRoute(route, undefined, nativeCapabilities), 'CAPABILITY_NOT_GRANTED'));
      ok(`native_unconstrained_effective_${identity}_${scope}`,
        denied(decideEffectiveCapability(capability, { kind: 'agent', scope }, resolveNative),
          agentScopeCovers(route.agentScopes, scope) ? 'CAPABILITY_NOT_GRANTED' : 'CAPABILITY_SCOPE_DENIED'));
      const scopeAllowed = agentScopeCovers(route.agentScopes, scope);
      const routeDecision = decideConstrainedAgentRoute(route, exact, nativeCapabilities);
      ok(`native_exact_grant_route_scope_${identity}_${scope}`,
        (agentScopeCovers(route.agentScopes, scope) && routeDecision.allowed) === scopeAllowed && routeDecision.code === 'ALLOWED');
      const effective = decideEffectiveCapability(capability, { kind: 'agent', scope, constraint: exact }, resolveNative);
      ok(`native_exact_grant_effective_scope_${identity}_${scope}`,
        scopeAllowed ? effective.allowed && effective.code === 'ALLOWED' : denied(effective, 'CAPABILITY_SCOPE_DENIED'));
      const normalized = normalizeAgentCapabilityConstraint(exact.capabilityIdentities, exact.allowedEffects, scope, nativeCapabilities);
      ok(`native_exact_grant_normalizes_only_in_scope_${identity}_${scope}`, normalized.ok === scopeAllowed);
    }
    for (const [name, constraint] of [
      ['backend_only', { capabilityIdentities: ['performance.read@1', 'performance.collect@1', 'performance.profile@1'], allowedEffects: [...capability.effects] }],
      ['other_version', { capabilityIdentities: [`${capability.id}@2`], allowedEffects: [...capability.effects] }],
      ['empty_grant', { capabilityIdentities: [], allowedEffects: [...capability.effects] }],
    ] as Array<[string, AgentCapabilityConstraint]>) {
      ok(`native_${name}_route_${identity}`, denied(decideConstrainedAgentRoute(route, constraint, nativeCapabilities), 'CAPABILITY_NOT_GRANTED'));
      ok(`native_${name}_effective_${identity}`,
        denied(decideEffectiveCapability(capability, { kind: 'agent', scope: 'write', constraint }, resolveNative), 'CAPABILITY_NOT_GRANTED'));
    }
    for (const missingEffect of capability.effects) {
      const incomplete = { ...exact, allowedEffects: exact.allowedEffects.filter(effect => effect !== missingEffect) };
      const routeDecision = decideConstrainedAgentRoute(route, incomplete, nativeCapabilities);
      const effective = decideEffectiveCapability(capability, { kind: 'agent', scope: 'write', constraint: incomplete }, resolveNative);
      ok(`native_missing_effect_route_${identity}_${missingEffect}`,
        denied(routeDecision, 'CAPABILITY_EFFECT_DENIED') && routeDecision.disallowedEffects?.includes(missingEffect) === true);
      ok(`native_missing_effect_effective_${identity}_${missingEffect}`,
        denied(effective, 'CAPABILITY_EFFECT_DENIED') && effective.disallowedEffects?.includes(missingEffect) === true);
    }
    ok(`native_trusted_studio_effective_${identity}`,
      decideEffectiveCapability(capability, { kind: 'studio' }, resolveNative).allowed);
    ok(`native_wrong_owner_effective_${identity}`,
      denied(decideEffectiveCapability(capability, { kind: 'agent', scope: 'write', constraint: exact },
        () => ({ ok: true, decision: { ...route, owner: 'performance.read' } })), 'CAPABILITY_OWNER_MISMATCH'));
    ok(`native_unreviewed_route_effective_${identity}`,
      denied(decideEffectiveCapability(capability, { kind: 'agent', scope: 'write', constraint: exact },
        () => ({ ok: false, reason: 'unreviewed_route' })), 'CAPABILITY_ROUTE_UNREVIEWED'));
  }
  const allNativeGrant: AgentCapabilityConstraint = {
    capabilityIdentities: nativeCapabilities.map(forgeCapabilityIdentity), allowedEffects: ['read', 'analyze'],
  };
  for (const scope of scopes) {
    const absent = buildEffectiveCapabilitySelection({ kind: 'agent', scope }, resolveNative, nativeCapabilities);
    ok(`native_unconstrained_discovery_${scope}`, absent.capabilities.length === 0 && absent.exclusions.length === nativeCapabilities.length
      && absent.exclusions.every(exclusion => {
        const capability = nativeCapabilities.find(candidate => forgeCapabilityIdentity(candidate) === exclusion.capabilityIdentity);
        return !!capability && exclusion.code === (agentScopeCovers(capability.access.agentScopes, scope) ? 'CAPABILITY_NOT_GRANTED' : 'CAPABILITY_SCOPE_DENIED');
      }));
    const granted = buildEffectiveCapabilitySelection({ kind: 'agent', scope, constraint: allNativeGrant }, resolveNative, nativeCapabilities);
    const expected = nativeCapabilities.filter(capability => agentScopeCovers(capability.access.agentScopes, scope)).map(forgeCapabilityIdentity);
    ok(`native_explicit_discovery_scope_${scope}`,
      granted.capabilities.map(forgeCapabilityIdentity).join(',') === expected.join(',')
      && granted.exclusions.every(exclusion => exclusion.code === 'CAPABILITY_SCOPE_DENIED'));
  }
  for (const id of ['performance.read', 'performance.collect', 'performance.profile']) {
    const capability = FORGE_CAPABILITIES.find(candidate => candidate.id === id);
    if (!capability) { ok(`backend_legacy_fixture_present_${id}`, false); continue; }
    const route = routeFor(capability);
    const resolveBackend: ResolveAgentRouteTemplate = (method, template) => method === route.method && template === route.template
      ? { ok: true, decision: route } : { ok: false, reason: 'unreviewed_route' };
    for (const scope of scopes) {
      ok(`backend_legacy_unconstrained_route_${id}_${scope}`,
        agentScopeCovers(route.agentScopes, scope) && decideConstrainedAgentRoute(route, undefined).allowed);
      ok(`backend_legacy_unconstrained_effective_${id}_${scope}`,
        decideEffectiveCapability(capability, { kind: 'agent', scope }, resolveBackend).allowed);
    }
    ok(`backend_exact_grant_preserved_${id}`, decideConstrainedAgentRoute(route, constraintFor(capability)).allowed
      && decideEffectiveCapability(capability, { kind: 'agent', scope: 'write', constraint: constraintFor(capability) }, resolveBackend).allowed);
  }
  return { pass: checks.every(check => check.pass), checks };
}
