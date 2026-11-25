/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { resolveAgentRouteTemplateAuthority, scopeAllows, type AgentKeyScope } from './agentKeys';
import { decideEffectiveCapability, type AgentCapabilityConstraint } from './agentCapabilityAuthority';
import { LEDGER_QUIET_ROUTES, ledgerRouteKind } from './agentHistory';
import { runForgeKnowledgeSelftest } from './forgeKnowledge';
import { runWorkspaceDomainAuthoringSelftest } from './workspaceDomainAuthoring';
import {
  FORGE_CAPABILITIES,
  FORGE_UI_ACTION_PARITY_CENSUS,
  FORGE_UI_ACTION_PARITY_DOMAINS,
  applyForgeCapabilityFixedBody,
  buildForgeCapabilityContract,
  buildForgeUiActionParityCensus,
  canonicalCapabilityContractPayload,
  findForgeCapability,
  isForgeCapabilityContractV1,
  verifyForgeCapabilityContract,
  validateForgeCapabilityRegistry,
  validateForgeUiActionParityCensus,
  type ForgeCapabilityDescriptorV1,
  type ForgeUiActionParityRowV1,
} from './forgeCapabilities';

interface CapabilityCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function sampleRoute(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, 'sample');
}

function observedAgentScopes(binding: ForgeCapabilityDescriptorV1['apiBindings'][number]): AgentKeyScope[] {
  const reqPath = sampleRoute(binding.path).replace(/^\/api/, '');
  return (['read', 'write', 'deploy'] as const).filter(scope => scopeAllows(scope, binding.method, reqPath));
}

export async function runForgeCapabilitiesSelftest(): Promise<{ pass: boolean; checks: CapabilityCheck[]; contractHash: string }> {
  const checks: CapabilityCheck[] = [];
  const check = (name: string, pass: boolean, detail?: string): void => {
    checks.push({ name, pass, ...(detail ? { detail } : {}) });
  };

  const validationErrors = validateForgeCapabilityRegistry();
  check('registry invariants', validationErrors.length === 0, validationErrors.join(' | ') || undefined);
  check('bounded non-native registry', FORGE_CAPABILITIES.filter(capability => !capability.id.startsWith('performance.native.')).length === 106, `count=${FORGE_CAPABILITIES.length}`);
  const knowledgeSelftest = runForgeKnowledgeSelftest();
  check('forgeKnowledge shared wiki/shortcuts/onboarding selftest', knowledgeSelftest.pass, knowledgeSelftest.checks.filter(c => !c.pass).map(c => c.name).join(', ') || undefined);
  const domainAuthoringSelftest = runWorkspaceDomainAuthoringSelftest();
  check('workspaceDomainAuthoring isolation and CAS merge selftest', domainAuthoringSelftest.ok, domainAuthoringSelftest.failed.join(', ') || undefined);
  const compileResult = findForgeCapability('workspace.compile.result', 2);
  check('retained compile report access is workspace-scoped and read-only',
    compileResult?.context.workspace === 'required'
      && compileResult.effects.length === 1 && compileResult.effects[0] === 'read'
      && compileResult.access.public === false
      && compileResult.surfaces.mcp.length === 1 && compileResult.surfaces.mcp[0].id === 'get_compile_result'
      && compileResult.surfaces.mcp[0].status === 'connected'
      && compileResult.apiBindings.length === 1 && compileResult.apiBindings[0].method === 'GET'
      && compileResult.apiBindings[0].path === '/api/agent/compile/result'
      && compileResult.apiBindings[0].inputLocation === 'query');

  const canonical = canonicalCapabilityContractPayload();
  const contract = buildForgeCapabilityContract(sha256);
  const second = buildForgeCapabilityContract(sha256);
  check('deterministic sha256 contract', contract.contractHash === second.contractHash && contract.contractHash === sha256(canonical), contract.contractHash);
  check('no volatile timestamp field', !canonical.includes('generatedAt') && !canonical.includes('timestamp'));
  check('canonical contract shape is accepted', isForgeCapabilityContractV1(contract));
  check('unhashed top-level contract fields are rejected',
    !isForgeCapabilityContractV1({ ...contract, generatedAt: '2030-01-01T00:00:00.000Z' }));
  const syntacticallyValidWrongHash = {
    ...contract,
    contractHash: `${contract.contractHash[0] === '0' ? '1' : '0'}${contract.contractHash.slice(1)}`,
  };
  check('malformed hash and duplicate identities are rejected by shape',
    !isForgeCapabilityContractV1({ ...contract, contractHash: 'bad' }) &&
    !isForgeCapabilityContractV1({ ...contract, capabilities: [contract.capabilities[0], contract.capabilities[0]] }));
  check('canonical hash verifies and a valid-looking wrong hash is rejected',
    await verifyForgeCapabilityContract(contract) &&
    isForgeCapabilityContractV1(syntacticallyValidWrongHash) &&
    !await verifyForgeCapabilityContract(syntacticallyValidWrongHash));
  const firstCapability = FORGE_CAPABILITIES[0];
  const secondVersion = {
    ...firstCapability,
    version: firstCapability.version + 1,
    apiBindings: firstCapability.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/v2` })),
    surfaces: { ...firstCapability.surfaces, mcp: [] },
  } as ForgeCapabilityDescriptorV1;
  const collidingCapability = {
    ...firstCapability,
    id: 'contract.bindingcollision',
    surfaces: { ...firstCapability.surfaces, mcp: [] },
  } as ForgeCapabilityDescriptorV1;
  const duplicateVersionContract = buildForgeCapabilityContract(sha256, [firstCapability, secondVersion]);
  const collidingBindingContract = buildForgeCapabilityContract(sha256, [firstCapability, collidingCapability]);
  const duplicateVersionErrors = validateForgeCapabilityRegistry([firstCapability, secondVersion]);
  const collidingBindingErrors = validateForgeCapabilityRegistry([firstCapability, collidingCapability]);
  check(
    'stable ids and contract-wide API bindings are unambiguous',
    !isForgeCapabilityContractV1(duplicateVersionContract) && !isForgeCapabilityContractV1(collidingBindingContract) &&
      duplicateVersionErrors.some(error => error.includes('duplicate stable capability id')) &&
      collidingBindingErrors.some(error => error.includes('duplicate API binding')),
    [...duplicateVersionErrors, ...collidingBindingErrors].join(' | '),
  );
  const incompleteCapability = {
    id: 'project.validate',
    version: 1,
    effects: ['read'],
    apiBindings: [],
    surfaces: {},
  } as unknown as ForgeCapabilityDescriptorV1;
  const correctlyHashedIncompleteContract = buildForgeCapabilityContract(sha256, [incompleteCapability]);
  check(
    'correctly hashed incomplete descriptor is rejected',
    !isForgeCapabilityContractV1(correctlyHashedIncompleteContract),
  );
  const schemaDomains = findForgeCapability('schema.domains.list')!;
  const transportMismatch = {
    ...schemaDomains,
    apiBindings: schemaDomains.apiBindings.map(binding => binding.role === 'primary'
      ? { ...binding, inputLocation: 'none' as const }
      : binding),
  } as ForgeCapabilityDescriptorV1;
  const transportMismatchErrors = validateForgeCapabilityRegistry([transportMismatch]);
  check(
    'declared caller input cannot use a none transport binding',
    transportMismatchErrors.some(error => error.includes('input schema declares caller input')) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [transportMismatch])),
    transportMismatchErrors.join(' | ') || undefined,
  );
  const openTransportMismatch = {
    ...findForgeCapability('workspace.read', 2)!,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  } as ForgeCapabilityDescriptorV1;
  const openTransportErrors = validateForgeCapabilityRegistry([openTransportMismatch]);
  check(
    'additionalProperties caller input cannot use a none transport binding',
    openTransportErrors.some(error => error.includes('input schema declares caller input')) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [openTransportMismatch])),
    openTransportErrors.join(' | ') || undefined,
  );

  const validationCapability = findForgeCapability('project.validate')!;
  const invalidApiPath = {
    ...validationCapability,
    apiBindings: validationCapability.apiBindings.map(binding => ({ ...binding, path: `${binding.path}?decoy=1` })),
  } as ForgeCapabilityDescriptorV1;
  const invalidApiPathErrors = validateForgeCapabilityRegistry([invalidApiPath]);
  const traversalApiPath = {
    ...validationCapability,
    apiBindings: validationCapability.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/../hidden` })),
  } as ForgeCapabilityDescriptorV1;
  const traversalApiPathErrors = validateForgeCapabilityRegistry([traversalApiPath]);
  check(
    'API bindings are literal Express paths without query, fragment, or traversal text',
    invalidApiPathErrors.some(error => error.includes('literal /api route')) &&
      traversalApiPathErrors.some(error => error.includes('literal /api route')) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [invalidApiPath])) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [traversalApiPath])),
    [...invalidApiPathErrors, ...traversalApiPathErrors].join(' | ') || undefined,
  );
  const fixedBodyTypeMismatch = {
    ...validationCapability,
    inputSchema: {
      ...validationCapability.inputSchema,
      properties: {
        ...validationCapability.inputSchema.properties,
        recordBaseline: { type: 'string' },
      },
    },
  } as ForgeCapabilityDescriptorV1;
  const fixedBodyTypeErrors = validateForgeCapabilityRegistry([fixedBodyTypeMismatch]);
  check(
    'fixed-body values must match every binding input schema',
    fixedBodyTypeErrors.some(error => error.includes('does not match its input schema')) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [fixedBodyTypeMismatch])),
    fixedBodyTypeErrors.join(' | ') || undefined,
  );

  const duplicateMcpAlias = {
    ...validationCapability,
    id: 'project.validatealiascollision',
    apiBindings: validationCapability.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/alias-collision` })),
  } as ForgeCapabilityDescriptorV1;
  const duplicateMcpAliasErrors = validateForgeCapabilityRegistry([validationCapability, duplicateMcpAlias]);
  check(
    'MCP aliases are unique across the capability contract',
    duplicateMcpAliasErrors.some(error => error.includes('MCP alias')) &&
      !isForgeCapabilityContractV1(buildForgeCapabilityContract(sha256, [validationCapability, duplicateMcpAlias])),
    duplicateMcpAliasErrors.join(' | ') || undefined,
  );

  const known = findForgeCapability('project.validate');
  check('known capability lookup', known?.version === 1);
  check('unknown capability refusal', findForgeCapability('project.validate', 99) === undefined && findForgeCapability('unknown.capability') === undefined);
  check(
    'runtime debugger capability identity is unique and versioned once',
    FORGE_CAPABILITIES.filter(capability => capability.id === 'runtime.debug.read' && capability.version === 1).length === 1,
    JSON.stringify(FORGE_CAPABILITIES.filter(capability => capability.id === 'runtime.debug.read')),
  );
  const runtimeDebugger = findForgeCapability('runtime.debug.read');
  check(
    'runtime debugger has one canonical addressed API and one MCP projection',
    runtimeDebugger?.version === 1 &&
      runtimeDebugger.context.workspace === 'required' &&
      runtimeDebugger.inputSchema.properties?.expect?.type === 'string' &&
      runtimeDebugger.inputSchema.properties?.expect?.maxLength === 256 &&
      JSON.stringify(runtimeDebugger.apiBindings) === JSON.stringify([{
        method: 'GET', path: '/api/agent/runtime-debugger', inputLocation: 'query', role: 'primary',
      }]) &&
      JSON.stringify(runtimeDebugger.surfaces.mcp.map(projection => projection.id)) === JSON.stringify(['runtime_debugger']) &&
      JSON.stringify(runtimeDebugger.effects) === JSON.stringify(['read', 'analyze', 'audit-write', 'audit-retention-delete']) &&
      !runtimeDebugger.effects.some(effect => ['workspace-write', 'filesystem-write', 'package', 'deploy', 'delete'].includes(effect)),
    JSON.stringify(runtimeDebugger),
  );
  const xmlReferences = findForgeCapability('project.xml.references')!;
  check(
    'XML reference analysis has one versioned canonical read API and an honest curated projection',
    FORGE_CAPABILITIES.filter(capability => capability.id === 'project.xml.references').length === 1 &&
      xmlReferences?.version === 1 && xmlReferences.context.workspace === 'optional' && xmlReferences.context.profile === 'none' &&
      xmlReferences.confirmation === 'none' && !xmlReferences.access.public &&
      JSON.stringify(xmlReferences.effects) === JSON.stringify(['read', 'analyze']) &&
      JSON.stringify(xmlReferences.access.agentScopes) === JSON.stringify(['read', 'write', 'deploy']) &&
      JSON.stringify(xmlReferences.apiBindings) === JSON.stringify([{
        method: 'POST', path: '/api/agent/project/xml-references', inputLocation: 'body', role: 'primary',
      }]) &&
      xmlReferences.surfaces.ui.some(projection => projection.id === 'xml-reference-view' && projection.status === 'connected' &&
        projection.anchor === 'src/components/XmlReferenceView.tsx::/api/agent/project/xml-references') &&
      xmlReferences.surfaces.mcp.length === 1 && xmlReferences.surfaces.mcp[0].id === 'get_xml_references' &&
      xmlReferences.surfaces.mcp[0].status === 'partial' && Boolean(xmlReferences.surfaces.mcp[0].note) &&
      xmlReferences.outputSchema.properties?.schemaVersion?.enum?.[0] === 'forge.xml-reference-map.v1' &&
      ['ok', 'schemaVersion', 'signature', 'files', 'nodes', 'edges', 'coverage'].every(field => xmlReferences.outputSchema.required?.includes(field)),
    JSON.stringify(xmlReferences),
  );
  if (xmlReferences) {
    const schemaFixtureAccepts = (input: unknown): boolean => {
      // Exercise the registry's existing schema matcher through its fixed-body contract check.
      const fixture: ForgeCapabilityDescriptorV1 = {
        ...xmlReferences,
        inputSchema: { type: 'object', properties: { input: xmlReferences.inputSchema }, additionalProperties: false },
        apiBindings: [{ ...xmlReferences.apiBindings[0], fixedBody: { input } }],
      };
      return validateForgeCapabilityRegistry([fixture]).length === 0;
    };
    check(
      'XML reference input describes inline workspace/project exclusivity and addressed reads without mutation controls',
      schemaFixtureAccepts({}) && schemaFixtureAccepts({ workspace: {} }) && schemaFixtureAccepts({ project: {} }) &&
        schemaFixtureAccepts({ focus: { origin: 'reference', path: 'assets/example.xml', line: 1, column: 2 }, maxDepth: 0, includeSource: false }) &&
        !schemaFixtureAccepts({ workspace: {}, project: {} }) && !schemaFixtureAccepts({ apply: true }) &&
        !schemaFixtureAccepts({ focus: { origin: 'disk', path: 'assets/example.xml' } }) &&
        !schemaFixtureAccepts({ focus: { origin: 'project', path: 'assets/example.xml', sourceFolder: 'outside' } }),
    );
    const readActor = { kind: 'agent' as const, scope: 'read' as const, workspaceId: 'ws_xml_reference_fixture' };
    check(
      'XML reference analysis preserves old read keys and exact custom capability/effect narrowing',
      decideEffectiveCapability(xmlReferences, readActor, resolveAgentRouteTemplateAuthority).allowed &&
        decideEffectiveCapability(xmlReferences, {
          ...readActor, constraint: { capabilityIdentities: ['project.xml.references@1'], allowedEffects: ['read', 'analyze'] },
        }, resolveAgentRouteTemplateAuthority).allowed &&
        decideEffectiveCapability(xmlReferences, {
          ...readActor, constraint: { capabilityIdentities: ['project.validate@1'], allowedEffects: ['read', 'analyze'] },
        }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED' &&
        decideEffectiveCapability(xmlReferences, {
          ...readActor, constraint: { capabilityIdentities: ['project.xml.references@1'], allowedEffects: ['read'] },
        }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_EFFECT_DENIED' &&
        scopeAllows('read', 'POST', '/agent/project/xml-references') &&
        !scopeAllows('read', 'POST', '/agent/project/xml-references/extra') &&
        !scopeAllows('read', 'POST', '/agent/workspace'),
    );
    check(
      'XML reference analysis is ledger quiet and cannot persist a generic POST action',
      LEDGER_QUIET_ROUTES.includes('/api/agent/project/xml-references') &&
        ledgerRouteKind('POST', '/api/agent/project/xml-references') === null,
    );
  }
  for (const [kind, other] of [['ai', 'md'], ['md', 'ai']] as const) {
    const id = 'project.' + kind + '.navigation';
    const otherId = 'project.' + other + '.navigation';
    const capability = findForgeCapability(id)!;
    const route = '/api/agent/project/' + kind + '-navigation';
    const grant: AgentCapabilityConstraint = { capabilityIdentities: [id + '@1'], allowedEffects: ['read', 'analyze'] };
    const actor = { kind: 'agent', scope: 'read', workspaceId: 'ws_navigation_fixture' } as const;
    const authority = resolveAgentRouteTemplateAuthority('POST', route);
    check(`${kind} navigation is one private workspace-bound read/analyze capability`,
      capability?.version === 1 && !capability.access.public
        && capability.context.workspace === 'required' && capability.confirmation === 'none'
        && JSON.stringify(capability.effects) === JSON.stringify(['read', 'analyze'])
        && JSON.stringify(capability.apiBindings) === JSON.stringify([{ method: 'POST', path: route, inputLocation: 'body', role: 'primary' }])
        && capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === 'navigate_' + kind + '_script'
        && authority.ok && authority.decision.owner === capability.id && authority.decision.workspaceMode === 'required');
    check(`${kind} navigation advertises only exact addressed grants and remains ledger quiet`,
      ['read', 'write', 'deploy'].every(scope => decideEffectiveCapability(capability, {
        ...actor, scope: scope as AgentKeyScope,
      }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED')
        && decideEffectiveCapability(capability, { ...actor, constraint: grant }, resolveAgentRouteTemplateAuthority).allowed
        && decideEffectiveCapability(capability, { ...actor, workspaceId: undefined, constraint: grant }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_WORKSPACE_REQUIRED'
        && decideEffectiveCapability(capability, {
          ...actor, constraint: { ...grant, allowedEffects: ['read'] },
        }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_EFFECT_DENIED'
        && decideEffectiveCapability(capability, {
          ...actor, constraint: { ...grant, capabilityIdentities: ['project.xml.references@1'] },
        }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED'
        && decideEffectiveCapability(capability, {
          ...actor, constraint: { ...grant, capabilityIdentities: [otherId + '@1'] },
        }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED'
        && decideEffectiveCapability(capability, { kind: 'studio' }, resolveAgentRouteTemplateAuthority).allowed
        && !resolveAgentRouteTemplateAuthority('POST', route + '/extra').ok
        && LEDGER_QUIET_ROUTES.includes(route) && ledgerRouteKind('POST', route) === null);
  }
  const performanceBindings = [
    { id: 'performance.read', method: 'GET', path: '/api/agent/performance', alias: 'get_forge_performance' },
    { id: 'performance.collect', method: 'POST', path: '/api/agent/performance/collection', alias: 'start_forge_performance_capture' },
    { id: 'performance.profile', method: 'POST', path: '/api/agent/performance/profile', alias: 'profile_forge_backend' },
  ] as const;
  for (const expected of performanceBindings) {
    const capability = findForgeCapability(expected.id)!;
    check(`${expected.id} describes a single bounded process-level analysis API`,
      FORGE_CAPABILITIES.filter(candidate => candidate.id === expected.id).length === 1 && capability?.version === 1 &&
        capability.context.workspace === 'none' && capability.context.profile === 'none' && capability.confirmation === 'none' &&
        !capability.access.public && capability.access.studioSession &&
        JSON.stringify(capability.access.agentScopes) === JSON.stringify(['read', 'write', 'deploy']) &&
        JSON.stringify(capability.effects) === JSON.stringify(['read', 'analyze']) &&
        JSON.stringify(capability.apiBindings) === JSON.stringify([{
          method: expected.method, path: expected.path, inputLocation: expected.method === 'GET' ? 'none' : 'body', role: 'primary',
        }]) && capability.inputSchema.additionalProperties === false &&
        capability.surfaces.ui.length === 2 && capability.surfaces.ui[0].status === 'connected' &&
        capability.surfaces.ui[0].anchor === `src/components/PerformancePanel.tsx::${expected.path}` &&
        capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === expected.alias &&
        capability.surfaces.mcp[0].status === 'partial' && Boolean(capability.surfaces.mcp[0].note),
      JSON.stringify(capability));
    if (!capability) continue;
    const actor = { kind: 'agent' as const, scope: 'read' as const };
    check(`${expected.id} keeps existing read keys and exact custom grant/effect authority`,
      decideEffectiveCapability(capability, actor, resolveAgentRouteTemplateAuthority).allowed &&
        decideEffectiveCapability(capability, { ...actor, constraint: {
          capabilityIdentities: [`${expected.id}@1`], allowedEffects: ['read', 'analyze'],
        } }, resolveAgentRouteTemplateAuthority).allowed &&
        decideEffectiveCapability(capability, { ...actor, constraint: {
          capabilityIdentities: ['project.xml.references@1'], allowedEffects: ['read', 'analyze'],
        } }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED' &&
        decideEffectiveCapability(capability, { ...actor, constraint: {
          capabilityIdentities: [`${expected.id}@1`], allowedEffects: ['read'],
        } }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_EFFECT_DENIED' &&
        scopeAllows('read', expected.method, expected.path.replace(/^\/api/, '')));
    if (expected.method === 'POST') {
      check(`${expected.id} is ledger quiet without granting a route prefix`,
        LEDGER_QUIET_ROUTES.includes(expected.path) && ledgerRouteKind('POST', expected.path) === null &&
          !scopeAllows('read', 'POST', `${expected.path.replace(/^\/api/, '')}/extra`) &&
          !scopeAllows('read', 'POST', '/agent/performance/reset'));
    }
  }
  check('new analysis capabilities disclose disconnected native host controls without fabricating a producer',
    ['project.xml.references', 'performance.read', 'performance.collect', 'performance.profile'].every(id => {
      const capability = findForgeCapability(id);
      const native = capability?.surfaces.ui.filter(projection => projection.id.startsWith('vscode-extension-'));
      return native?.length === 1 && native[0].status === 'disconnected' && !native[0].anchor && Boolean(native[0].note) &&
        capability?.surfaces.ui.filter(projection => projection.status === 'connected').length === 1;
    }));
  const collection = findForgeCapability('performance.collect')!;
  const profiling = findForgeCapability('performance.profile')!;
  const performanceRead = findForgeCapability('performance.read')!;
  const performanceSchemaAccepts = (schema: ForgeCapabilityDescriptorV1['inputSchema'], input: unknown): boolean => {
    const fixture: ForgeCapabilityDescriptorV1 = {
      ...collection,
      inputSchema: { type: 'object', properties: { input: schema }, additionalProperties: false },
      apiBindings: [{ ...collection.apiBindings[0], fixedBody: { input } }],
    };
    return validateForgeCapabilityRegistry([fixture]).length === 0;
  };
  check('performance request schemas stay closed and describe API integer bounds',
    performanceSchemaAccepts(collection.inputSchema, {}) &&
      performanceSchemaAccepts(collection.inputSchema, { durationMs: 900000, intervalMs: 60000, eventLoopDelay: true }) &&
      !performanceSchemaAccepts(collection.inputSchema, { durationMs: 1000.5 }) &&
      !performanceSchemaAccepts(collection.inputSchema, { eventLoopDelay: 'true' }) &&
      !performanceSchemaAccepts(collection.inputSchema, { workspace: {} }) &&
      performanceSchemaAccepts(profiling.inputSchema, { durationMs: 5000, samplingIntervalMicros: 100000, maxFunctions: 64 }) &&
      !performanceSchemaAccepts(profiling.inputSchema, { maxFunctions: 1.5 }) &&
      !performanceSchemaAccepts(profiling.inputSchema, { rawProfile: true }) &&
      performanceSchemaAccepts(performanceRead.inputSchema, {}) && !performanceSchemaAccepts(performanceRead.inputSchema, { durationMs: 1000 }) &&
      collection.inputSchema.properties?.durationMs?.description?.includes('900000') === true &&
      profiling.inputSchema.properties?.durationMs?.description?.includes('5000') === true);
  check('CPU profile schema preserves explicit failure codes instead of a successful empty fallback',
    performanceSchemaAccepts(profiling.outputSchema, { ok: false, code: 'PROFILE_RATE_LIMITED', error: 'Cooldown active.' }) &&
      performanceSchemaAccepts(profiling.outputSchema, { ok: false, code: 'PROFILE_CLEANUP_UNCONFIRMED', error: 'Cleanup uncertain.' }) &&
      !performanceSchemaAccepts(profiling.outputSchema, { ok: false, code: 'PROFILE_RATE_LIMITED' }) &&
      !performanceSchemaAccepts(profiling.outputSchema, { ok: false, code: 'UNKNOWN', error: 'Unsupported.' }) &&
      !performanceSchemaAccepts(profiling.outputSchema, { ok: true, functions: [] }));
  check('collection schema distinguishes HTTP refusal from a successful snapshot',
    performanceSchemaAccepts(collection.outputSchema, { ok: false, code: 'PERFORMANCE_COLLECTION_BUSY', error: 'Already active.' }) &&
      performanceSchemaAccepts(collection.outputSchema, { ok: false, code: 'PERFORMANCE_COLLECTION_REFUSED', error: 'Cleanup uncertain.' }) &&
      !performanceSchemaAccepts(collection.outputSchema, { ok: false, code: 'PERFORMANCE_COLLECTION_BUSY' }) &&
      !performanceSchemaAccepts(collection.outputSchema, { ok: true }));
  const backendSchema = performanceRead.outputSchema.properties?.backend;
  const resourceSchema = backendSchema?.properties?.resources?.items;
  const controlSchema = performanceRead.outputSchema.properties?.control;
  const overheadSchema = backendSchema?.properties?.selfOverhead;
  check('overhead schema preserves unknown cost and scopes completed snapshot work',
    !!overheadSchema && performanceSchemaAccepts(overheadSchema, {
      recordCalls: 1, recordMs: null, snapshotCalls: 2, snapshotMs: null, clockFailures: 3,
      snapshotScope: 'completed-prior-snapshots-including-serialization-and-freeze',
    }) && !performanceSchemaAccepts(overheadSchema, {
      recordCalls: 1, recordMs: 0, snapshotCalls: 2, snapshotMs: 0, clockFailures: 0, snapshotScope: 'all-tracker-work',
    }) && !performanceSchemaAccepts(overheadSchema, {
      recordCalls: 1, snapshotCalls: 2, snapshotMs: 0, clockFailures: 0,
      snapshotScope: 'completed-prior-snapshots-including-serialization-and-freeze',
    }));
  check('performance output schemas preserve nullable measurements, cooldown and producer coverage',
    performanceRead.outputSchema.properties?.schemaVersion?.enum?.[0] === 'forge.performance.report.v1' &&
      backendSchema?.properties?.schemaVersion?.enum?.[0] === 'forge.performance.v1' &&
      resourceSchema?.required?.includes('rssBytes') === true &&
      JSON.stringify(resourceSchema?.properties?.rssBytes?.type) === JSON.stringify(['number', 'null']) &&
      controlSchema?.required?.includes('profileRateLimited') === true &&
      controlSchema?.required?.includes('profileCooldownRemainingMs') === true &&
      backendSchema?.properties?.drops?.required?.includes('staleFinishes') === true &&
      ['collectionCleanupUnconfirmed', 'abortListenerCleanupUnconfirmed', 'ownedTimerCount', 'failedTimerCount'].every(field => controlSchema?.required?.includes(field)) &&
      performanceRead.outputSchema.properties?.coverage?.properties?.native?.enum?.[0] === 'unavailable-not-wired');
  check(
    'validation aliases converge',
    JSON.stringify(known?.surfaces.mcp.map(projection => projection.id)) === JSON.stringify(['validate_mod', 'author_check', 'stage_and_validate']) &&
      known?.surfaces.mcp.every(projection => projection.status === 'partial' && !!projection.note) === true,
    JSON.stringify(known?.surfaces.mcp),
  );
  check(
    'validation adapter fixes recordBaseline false',
    known?.apiBindings[0]?.fixedBody?.recordBaseline === false &&
      known.inputSchema.properties?.recordBaseline?.enum?.[0] === false &&
      known.inputSchema.anyOf?.some(branch => branch.required?.[0] === 'project') === true &&
      known.inputSchema.anyOf?.some(branch => branch.required?.[0] === 'fromPath') === true,
  );
  check(
    'fixed-body adapter overrides hostile mutation flags',
    applyForgeCapabilityFixedBody('project.validate', { recordBaseline: true }).recordBaseline === false &&
      applyForgeCapabilityFixedBody('workspace.generate.preview', { apply: true }).apply === false,
  );

  const preview = findForgeCapability('workspace.generate.preview');
  const previewPrimary = preview?.apiBindings.find(binding => binding.role === 'primary');
  check(
    'generation is preview constrained',
    previewPrimary?.path === '/api/agent/generate/preview' && previewPrimary.fixedBody?.apply === false,
  );
  check(
    'generation spend and network are explicit',
    preview?.effects.includes('spend') === true && preview.effects.includes('network') === true && preview.surfaces.mcp.length === 0,
  );

  const scopeMismatches = FORGE_CAPABILITIES.flatMap(capability => capability.apiBindings.flatMap(binding => {
    const observed = observedAgentScopes(binding);
    return JSON.stringify(observed) === JSON.stringify(capability.access.agentScopes)
      ? []
      : [`${capability.id} ${binding.method} ${binding.path}: declared=${capability.access.agentScopes.join(',')} observed=${observed.join(',')}`];
  }));
  check('declared agent scopes match current middleware', scopeMismatches.length === 0, scopeMismatches.join(' | ') || undefined);

  const unclassifiedPosts = FORGE_CAPABILITIES.flatMap(capability => capability.apiBindings
    .filter(binding => binding.method === 'POST')
    .filter(binding => !(LEDGER_QUIET_ROUTES.includes(binding.path)
      && capability.effects.every(effect => effect === 'read' || effect === 'analyze')))
    .filter(binding => ledgerRouteKind(binding.method, sampleRoute(binding.path)) === null)
    .map(binding => `${capability.id}: ${binding.method} ${binding.path}`));
  check('post bindings have ledger disposition', unclassifiedPosts.length === 0, unclassifiedPosts.join(' | ') || undefined);

  const malformed = {
    ...FORGE_CAPABILITIES[0],
    id: 'Malformed Capability',
    version: 0,
    effects: [],
    apiBindings: [
      ...FORGE_CAPABILITIES[0].apiBindings,
      ...FORGE_CAPABILITIES[0].apiBindings,
    ],
  } as unknown as ForgeCapabilityDescriptorV1;
  const malformedErrors = validateForgeCapabilityRegistry([malformed]);
  const malformedSurface = {
    ...FORGE_CAPABILITIES[0],
    outputSchema: { type: 'object', properties: {}, additionalProperties: true },
    surfaces: {
      ...FORGE_CAPABILITIES[0].surfaces,
      ui: [{ id: 'false-live', status: 'connected' }],
    },
  } as unknown as ForgeCapabilityDescriptorV1;
  const malformedSurfaceErrors = validateForgeCapabilityRegistry([malformedSurface]);
  const duplicateErrors = validateForgeCapabilityRegistry([FORGE_CAPABILITIES[0], FORGE_CAPABILITIES[0]]);
  check(
    'malformed descriptor fixture is rejected',
    malformedErrors.some(error => error.includes('lower-case dotted')) &&
      malformedErrors.some(error => error.includes('positive integer')) &&
      malformedErrors.some(error => error.includes('at least one effect')) &&
      malformedErrors.some(error => error.includes('duplicate API binding')) &&
      malformedSurfaceErrors.some(error => error.includes('output schema must declare')) &&
      malformedSurfaceErrors.some(error => error.includes('requires a file::token anchor')) &&
      duplicateErrors.some(error => error.includes('duplicate capability identity')),
    [...malformedErrors, ...malformedSurfaceErrors, ...duplicateErrors].join(' | '),
  );

  const deployCapabilities = [
    { id: 'deploy.apply', method: 'POST', path: '/api/agent/deploy-verify/apply', alias: 'apply_native_deploy', workspace: 'optional',
      confirmation: 'preview-required', effects: ['filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'deploy' },
    { id: 'deploy.preview', method: 'POST', path: '/api/agent/deploy-verify/preview', alias: 'preview_native_deploy', workspace: 'optional',
      confirmation: 'none', effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'], ledger: 'deploy' },
    { id: 'deploy.status', method: 'GET', path: '/api/agent/deploy-verify/status', alias: 'get_deploy_operation_status', workspace: 'required',
      confirmation: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'deploy.undo', method: 'POST', path: '/api/agent/deploy-verify/undo', alias: 'undo_native_deploy', workspace: 'required',
      confirmation: 'none', effects: ['filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'revert' },
    { id: 'release.nexus.prepare', method: 'POST', path: '/api/agent/release/nexus/build', alias: 'prepare_nexus_release', workspace: 'optional',
      confirmation: 'none', effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'package' },
    { id: 'release.steam.adopt', method: 'POST', path: '/api/agent/release/steam/apply-adoption', alias: 'adopt_steam_workshop_id', workspace: 'optional',
      confirmation: 'none', effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'package' },
    { id: 'release.steam.prepare', method: 'POST', path: '/api/agent/release/steam/build', alias: 'prepare_steam_release', workspace: 'optional',
      confirmation: 'none', effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'package' },
    { id: 'release.steam.verify', method: 'POST', path: '/api/agent/release/steam/check', alias: 'verify_steam_release', workspace: 'optional',
      confirmation: 'none', effects: ['read', 'analyze', 'filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'package' },
    { id: 'reviews.warning.revoke', method: 'POST', path: '/api/agent/warning-reviews/revoke-review', alias: 'revoke_warning_review', workspace: 'optional',
      confirmation: 'none', effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'action' },
  ] as const;
  for (const expected of deployCapabilities) {
    const capability = findForgeCapability(expected.id);
    const grant: AgentCapabilityConstraint = {
      capabilityIdentities: [`${expected.id}@1`],
      allowedEffects: [...expected.effects],
    };
    const deployActor = { kind: 'agent' as const, scope: 'deploy' as const, workspaceId: 'ws_deploy_capability_fixture' };
    check(`${expected.id} declares explicit-grant deploy-only authority and curated MCP projection`,
      !!capability && capability.version === 1 &&
        capability.context.workspace === expected.workspace && capability.context.profile === 'none' &&
        capability.confirmation === expected.confirmation && !capability.access.public && capability.access.studioSession &&
        JSON.stringify(capability.access.agentScopes) === JSON.stringify(['deploy']) &&
        JSON.stringify(capability.effects) === JSON.stringify(expected.effects) &&
        JSON.stringify(capability.apiBindings) === JSON.stringify([{
          method: expected.method, path: expected.path, inputLocation: expected.method === 'GET' ? 'query' : 'body', role: 'primary',
        }]) &&
        capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === expected.alias &&
        capability.surfaces.mcp[0].status === 'connected' &&
        ledgerRouteKind(expected.method, expected.path) === expected.ledger &&
        decideEffectiveCapability(capability, deployActor, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED' &&
        decideEffectiveCapability(capability, { ...deployActor, scope: 'write', constraint: grant }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_SCOPE_DENIED' &&
        decideEffectiveCapability(capability, { ...deployActor, constraint: grant }, resolveAgentRouteTemplateAuthority).allowed);
  }

  const workspaceFilesCapabilities = [
    { id: 'bulk.transform.apply', version: 1, method: 'POST', path: '/api/agent/bulk-transform/execute', alias: 'apply_bulk_transform',
      workspace: 'required', confirmation: 'preview-required', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['workspace-write'], ledger: 'workspace' },
    { id: 'bulk.transform.preview', version: 1, method: 'POST', path: '/api/agent/bulk-transform/preview-plan', alias: 'preview_bulk_transform',
      workspace: 'required', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read', 'analyze'], ledger: null },
    { id: 'files.delete', version: 1, method: 'POST', path: '/api/agent/files/delete', alias: 'remove_workspace_file',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'edit' },
    { id: 'files.delete.dir', version: 1, method: 'POST', path: '/api/agent/files/delete-dir', alias: 'remove_workspace_directory',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'edit' },
    { id: 'files.inventory.read', version: 1, method: 'GET', path: '/api/agent/files/inventory', alias: 'get_project_file_inventory',
      workspace: 'required', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read', 'analyze'], ledger: null },
    { id: 'files.list', version: 1, method: 'GET', path: '/api/agent/files/list', alias: 'list_workspace_files',
      workspace: 'optional', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read'], ledger: null },
    { id: 'files.read', version: 1, method: 'GET', path: '/api/agent/files/read', alias: 'read_workspace_file',
      workspace: 'optional', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read'], ledger: null },
    { id: 'files.restore', version: 2, method: 'POST', path: '/api/agent/files/restore', alias: 'restore_workspace_file',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'revert' },
    { id: 'files.scaffold', version: 1, method: 'POST', path: '/api/agent/files/scaffold', alias: 'scaffold_mod_project',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'edit' },
    { id: 'files.write', version: 2, method: 'POST', path: '/api/agent/files/write', alias: 'write_workspace_file',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'edit' },
    { id: 'history.revert', version: 2, method: 'POST', path: '/api/agent/history/revert', alias: 'revert_action_history',
      workspace: 'required', confirmation: 'none', scopes: ['deploy'], deniedScope: 'write',
      effects: ['workspace-write', 'filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'revert' },
    { id: 'project.md.rename', version: 1, method: 'POST', path: '/api/agent/mod-folder/md-rename', alias: 'rename_md_symbol',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'edit' },
    { id: 'snapshots.create', version: 1, method: 'POST', path: '/api/agent/snapshots/create', alias: 'create_workspace_snapshot',
      workspace: 'required', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'], ledger: 'snapshot' },
    { id: 'snapshots.delete', version: 1, method: 'POST', path: '/api/agent/snapshots/delete', alias: 'delete_workspace_snapshot',
      workspace: 'optional', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'], ledger: 'snapshot' },
    { id: 'snapshots.list', version: 1, method: 'GET', path: '/api/agent/snapshots/list', alias: 'list_workspace_snapshots',
      workspace: 'optional', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read'], ledger: null },
    { id: 'snapshots.restore', version: 1, method: 'POST', path: '/api/agent/snapshots/restore', alias: 'restore_workspace_snapshot',
      workspace: 'required', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['workspace-write', 'audit-write', 'audit-retention-delete'], ledger: 'snapshot' },
    { id: 'workspace.mod.drift', version: 1, method: 'GET', path: '/api/agent/mod-folder/drift', alias: 'get_mod_drift',
      workspace: 'optional', confirmation: 'none', scopes: ['read', 'write', 'deploy'], deniedScope: null,
      effects: ['read', 'analyze'], ledger: null },
    { id: 'workspace.mod.import', version: 1, method: 'POST', path: '/api/agent/mod-folder/sync', alias: 'import_mod_folder',
      workspace: 'required', confirmation: 'none', scopes: ['write', 'deploy'], deniedScope: 'read',
      effects: ['workspace-write'], ledger: 'workspace' },
  ] as const;
  for (const expected of workspaceFilesCapabilities) {
    const capability = findForgeCapability(expected.id, expected.version);
    const grant: AgentCapabilityConstraint = {
      capabilityIdentities: [`${expected.id}@${expected.version}`],
      allowedEffects: [...expected.effects],
    };
    const allowedScope = expected.scopes[0];
    const actor = { kind: 'agent' as const, scope: allowedScope, workspaceId: 'ws_files_capability_fixture' };
    check(`${expected.id}@${expected.version} declares explicit-grant authority and curated MCP projection`,
      !!capability &&
        capability.context.workspace === expected.workspace && capability.context.profile === 'none' &&
        capability.confirmation === expected.confirmation && !capability.access.public && capability.access.studioSession &&
        JSON.stringify(capability.access.agentScopes) === JSON.stringify(expected.scopes) &&
        JSON.stringify(capability.effects) === JSON.stringify(expected.effects) &&
        JSON.stringify(capability.apiBindings) === JSON.stringify([{
          method: expected.method, path: expected.path, inputLocation: expected.method === 'GET' ? 'query' : 'body', role: 'primary',
        }]) &&
        capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === expected.alias &&
        capability.surfaces.mcp[0].status === 'connected' &&
        ledgerRouteKind(expected.method, expected.path) === expected.ledger &&
        decideEffectiveCapability(capability, { ...actor, scope: 'deploy' }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED' &&
        (expected.deniedScope === null
          || decideEffectiveCapability(capability, { ...actor, scope: expected.deniedScope, constraint: grant }, resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_SCOPE_DENIED') &&
        decideEffectiveCapability(capability, { ...actor, constraint: grant }, resolveAgentRouteTemplateAuthority).allowed);
  }

  const authoringHelperCapabilities = [
    { id: 'contracts.derive', method: 'GET', path: '/api/agent/external-api/derive-draft', inputLocation: 'query', alias: 'derive_external_api_contract', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'contracts.registry.read', method: 'GET', path: '/api/agent/external-api/registry', inputLocation: 'query', alias: 'list_external_api_contracts', mcpStatus: 'connected', workspace: 'none', effects: ['read'], ledger: null },
    { id: 'expression.suggest', method: 'POST', path: '/api/agent/suggest/expression', inputLocation: 'body', alias: 'suggest_expression_completions', mcpStatus: 'connected', workspace: 'optional', effects: ['read', 'analyze'], ledger: null },
    { id: 'extensions.dependencies.analyze', method: 'GET', path: '/api/agent/extensions/dependency-graph', inputLocation: 'none', alias: 'get_mod_dependency_graph', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'extensions.file.read', method: 'GET', path: '/api/agent/extensions/file', inputLocation: 'query', alias: 'read_extension_file', mcpStatus: 'connected', workspace: 'none', effects: ['read'], ledger: null },
    { id: 'extensions.overrides.analyze', method: 'GET', path: '/api/agent/override-map', inputLocation: 'query', alias: 'get_extension_override_map', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'history.raw.read', method: 'GET', path: '/api/agent/history/raw', inputLocation: 'query', alias: 'read_action_history_blob', mcpStatus: 'connected', workspace: 'required', effects: ['read'], ledger: null },
    { id: 'patch.base.read', method: 'GET', path: '/api/agent/patch/base-content', inputLocation: 'query', alias: 'read_patch_base_content', mcpStatus: 'connected', workspace: 'none', effects: ['read'], ledger: null },
    { id: 'patch.targets.list', method: 'GET', path: '/api/agent/patch-targets', inputLocation: 'query', alias: 'list_patch_targets', mcpStatus: 'connected', workspace: 'none', effects: ['read'], ledger: null },
    { id: 'patch.xpath.complete', method: 'POST', path: '/api/agent/patch/xpath-complete', inputLocation: 'body', alias: 'complete_xpath_selector', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'patch.xpath.synthesize', method: 'POST', path: '/api/agent/xpath-synth', inputLocation: 'body', alias: 'synthesize_xml_patch', mcpStatus: 'partial', workspace: 'optional', effects: ['read', 'analyze'], ledger: null },
    { id: 'project.symbols.search', method: 'GET', path: '/api/agent/mod-folder/symbols', inputLocation: 'query', alias: 'search_workspace_symbols', mcpStatus: 'connected', workspace: 'optional', effects: ['read', 'analyze'], ledger: null },
    { id: 'reference.coverage.read', method: 'GET', path: '/api/agent/reference/coverage', inputLocation: 'query', alias: 'get_reference_coverage', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'reference.galaxy.read', method: 'GET', path: '/api/agent/galaxy-map', inputLocation: 'query', alias: 'get_galaxy_map', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'reference.override.orders.read', method: 'GET', path: '/api/agent/reference/override-orders', inputLocation: 'query', alias: 'list_override_order_issuers', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
    { id: 'ui.lua.snippets.read', method: 'GET', path: '/api/agent/ui/lua-snippets', inputLocation: 'query', alias: 'list_lua_ui_snippets', mcpStatus: 'connected', workspace: 'none', effects: ['read'], ledger: null },
    { id: 'ui.vanilla.harvest', method: 'GET', path: '/api/agent/ui/vanilla-harvest', inputLocation: 'query', alias: 'harvest_vanilla_ui_menus', mcpStatus: 'connected', workspace: 'none', effects: ['read', 'analyze'], ledger: null },
  ] as const;
  for (const expected of authoringHelperCapabilities) {
    const capability = findForgeCapability(expected.id, 1);
    check(`${expected.id}@1 declares protected read/analyze authoring or ecosystem MCP projection`,
      !!capability &&
        capability.context.workspace === expected.workspace && capability.context.profile === 'none' &&
        capability.confirmation === 'none' && !capability.access.public && capability.access.studioSession &&
        JSON.stringify(capability.access.agentScopes) === JSON.stringify(['read', 'write', 'deploy']) &&
        JSON.stringify(capability.effects) === JSON.stringify(expected.effects) &&
        JSON.stringify(capability.apiBindings) === JSON.stringify([{
          method: expected.method, path: expected.path, inputLocation: expected.inputLocation, role: 'primary',
        }]) &&
        capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === expected.alias &&
        capability.surfaces.mcp[0].status === expected.mcpStatus &&
        ledgerRouteKind(expected.method, expected.path) === expected.ledger &&
        decideEffectiveCapability(capability, { kind: 'agent', scope: 'read', workspaceId: 'ws_slice4_fixture' }, resolveAgentRouteTemplateAuthority).allowed);
  }

  const censusErrors = validateForgeUiActionParityCensus();
  const builtCensus = buildForgeUiActionParityCensus(sha256);
  const builtCensusSecond = buildForgeUiActionParityCensus(sha256);
  const coveredDomains = new Set(FORGE_UI_ACTION_PARITY_CENSUS.map(row => row.domain));
  check('UI-action parity census covers all 15 domains and all 94 capabilities with deterministic hash',
    censusErrors.length === 0 &&
      builtCensus.schemaVersion === 'forge.ui-action-parity.v1' &&
      builtCensus.censusHash === builtCensusSecond.censusHash &&
      FORGE_UI_ACTION_PARITY_DOMAINS.every(domain => coveredDomains.has(domain)) &&
      builtCensus.summary.totalActions === FORGE_UI_ACTION_PARITY_CENSUS.length &&
      builtCensus.summary.available === 23 &&
      builtCensus.summary.approvalRequired === 2 &&
      builtCensus.summary.missing === 6 &&
      builtCensus.summary.available + builtCensus.summary.approvalRequired + builtCensus.summary.partial + builtCensus.summary.missing === builtCensus.summary.totalActions &&
      builtCensus.summary.openGaps === builtCensus.summary.partial + builtCensus.summary.missing,
    censusErrors.join(' | ') || undefined);
  const falseAvailableRow: ForgeUiActionParityRowV1 = {
    ...FORGE_UI_ACTION_PARITY_CENSUS.find(row => row.id === 'compile.workspace.build')!,
    status: 'available',
    missingBehavior: undefined,
  };
  const incompleteApprovalRow: ForgeUiActionParityRowV1 = {
    ...FORGE_UI_ACTION_PARITY_CENSUS.find(row => row.id === 'checks.project_owner.enroll')!,
    status: 'approval-required',
    missingBehavior: undefined,
  };
  const missingOwnerRow: ForgeUiActionParityRowV1 = {
    ...FORGE_UI_ACTION_PARITY_CENSUS.find(row => row.id === 'release.steam.prepare_verify_adopt')!,
    ownerIssue: undefined,
  };
  check('UI-action parity validator rejects false available, blanket approval-required, and ownerless gaps',
    validateForgeUiActionParityCensus(
      FORGE_UI_ACTION_PARITY_CENSUS.map(row => row.id === falseAvailableRow.id ? falseAvailableRow : row),
    ).some(error => error.includes('lacks a connected MCP projection')) &&
      validateForgeUiActionParityCensus(
        FORGE_UI_ACTION_PARITY_CENSUS.map(row => row.id === incompleteApprovalRow.id ? incompleteApprovalRow : row),
      ).some(error => error.includes('requires an approvalWorkflow')) &&
      validateForgeUiActionParityCensus(
        FORGE_UI_ACTION_PARITY_CENSUS.map(row => row.id === missingOwnerRow.id ? missingOwnerRow : row),
      ).some(error => error.includes('requires an ownerIssue')));

  checks.push(...runNativeForgeCapabilitiesSelftest().checks);
  return { pass: checks.every(item => item.pass), checks, contractHash: contract.contractHash };
}

/** Native metadata adds three process telemetry capabilities. */
export function runNativeForgeCapabilitiesSelftest() {
  const checks: CapabilityCheck[] = [];
  const check = (name: string, pass: boolean): void => { checks.push({ name, pass }); };
  const expected = [
    { id: 'performance.native.read', operation: 'read', method: 'GET', route: '/api/agent/performance/native', alias: 'get_forge_native_performance',
      scopes: ['read', 'write', 'deploy'], fields: [], required: [] },
    { id: 'performance.native.collect', operation: 'start', method: 'POST', route: '/api/agent/performance/native/collection', alias: 'start_forge_native_performance_capture',
      scopes: ['write', 'deploy'], fields: ['expectedBackendInstanceId', 'expectedNativeInstanceId', 'durationMs', 'intervalMs', 'eventLoopDelay'],
      required: ['expectedBackendInstanceId', 'expectedNativeInstanceId'] },
    { id: 'performance.native.stop', operation: 'stop', method: 'POST', route: '/api/agent/performance/native/stop', alias: 'stop_forge_native_performance_capture',
      scopes: ['write', 'deploy'], fields: ['expectedBackendInstanceId', 'expectedNativeInstanceId', 'captureId'],
      required: ['expectedBackendInstanceId', 'expectedNativeInstanceId', 'captureId'] },
  ] as const;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const keys = (value: object | undefined) => Object.keys(value || {}).sort();
  check('native registry has exactly the three reviewed process telemetry identities',
    FORGE_CAPABILITIES.length === 109 &&
      equal(FORGE_CAPABILITIES.filter(capability => capability.id.startsWith('performance.native.')).map(capability => capability.id).sort(),
        expected.map(row => row.id).sort()));
  for (const row of expected) {
    const capability = findForgeCapability(row.id);
    check(row.id + ' has one exact protected process-telemetry route and matching public projections',
      !!capability && capability.version === 1 &&
        equal(capability.context, { workspace: 'none', profile: 'none' }) &&
        equal(capability.access, { public: false, studioSession: true, agentScopes: row.scopes }) &&
        equal(capability.effects, ['read', 'analyze']) && capability.confirmation === 'none' &&
        equal(capability.apiBindings, [{ method: row.method, path: row.route, inputLocation: row.method === 'GET' ? 'none' : 'body', role: 'primary' }]) &&
        capability.surfaces.mcp.length === 1 && capability.surfaces.mcp[0].id === row.alias &&
        capability.surfaces.mcp[0].anchor === 'vscode-extension/mcp/x4forge-mcp.cjs::name: "' + row.alias + '"' &&
        capability.surfaces.ui.some(surface => surface.anchor === 'src/components/PerformancePanel.tsx::' + row.route));
    check(row.id + ' declares only its closed flat input fields and required exact target IDs',
      !!capability && capability.inputSchema.type === 'object' && capability.inputSchema.additionalProperties === false &&
        equal(keys(capability.inputSchema.properties), [...row.fields].sort()) &&
        equal([...(capability.inputSchema.required || [])].sort(), [...row.required].sort()) &&
        row.required.every(field => capability.inputSchema.properties?.[field]?.type === 'string' &&
          capability.inputSchema.properties[field].maxLength === 128));
    const output = capability?.outputSchema;
    const status = output?.properties?.status?.anyOf?.find(schema => schema.type === 'object');
    const snapshot = status?.properties?.snapshot;
    check(row.id + ' has a closed operation-specific report without private actor or control snapshot disclosure',
      !!output && output.type === 'object' && output.additionalProperties === false &&
        equal(keys(output.properties), ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status', 'code'].sort()) &&
        equal([...(output.required || [])].sort(), ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status'].sort()) &&
        equal(output.properties?.schemaVersion?.enum, ['forge.native-performance.report.v1']) &&
        equal(output.properties?.operation?.enum, [row.operation]) &&
        equal(output.properties?.ownership?.enum, ['none', 'self', 'other', 'operator']) &&
        output.properties?.status?.anyOf?.some(schema => schema.type === 'null') === true &&
        !!status && status.additionalProperties === false &&
        !['actor', 'owner', 'keyId', 'nonce', 'epoch'].some(field => Object.hasOwn(status.properties || {}, field)) &&
        (row.operation === 'read'
          ? snapshot?.anyOf?.some(schema => schema.type === 'object') === true && snapshot.anyOf.some(schema => schema.type === 'null')
          : snapshot?.type === 'null'));
    const allowedEffects: AgentCapabilityConstraint['allowedEffects'] = ['read', 'analyze'];
    const constrained = { kind: 'agent' as const, scope: 'write' as const,
      constraint: { capabilityIdentities: [row.id + '@1'], allowedEffects } };
    check(row.id + ' discovery uses the same explicit version/effects and scope authority as its exact route',
      !!capability &&
        decideEffectiveCapability(capability, constrained, resolveAgentRouteTemplateAuthority).allowed &&
        !decideEffectiveCapability(capability, { kind: 'agent', scope: 'all' }, resolveAgentRouteTemplateAuthority).allowed &&
        decideEffectiveCapability(capability, { ...constrained, constraint: { ...constrained.constraint, capabilityIdentities: [row.id + '@2'] } },
          resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_NOT_GRANTED' &&
        decideEffectiveCapability(capability, { ...constrained, constraint: { ...constrained.constraint, allowedEffects: ['read'] } },
          resolveAgentRouteTemplateAuthority).code === 'CAPABILITY_EFFECT_DENIED' &&
        decideEffectiveCapability(capability, { ...constrained, scope: 'read' }, resolveAgentRouteTemplateAuthority).allowed === (row.operation === 'read'));
  }
  return { pass: checks.every(check => check.pass), passed: checks.filter(check => check.pass).length, total: checks.length, checks };
}
