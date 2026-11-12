/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { resolveAgentRouteTemplateAuthority, scopeAllows, type AgentKeyScope } from './agentKeys';
import { decideEffectiveCapability } from './agentCapabilityAuthority';
import { LEDGER_QUIET_ROUTES, ledgerRouteKind } from './agentHistory';
import {
  FORGE_CAPABILITIES,
  applyForgeCapabilityFixedBody,
  buildForgeCapabilityContract,
  canonicalCapabilityContractPayload,
  findForgeCapability,
  isForgeCapabilityContractV1,
  verifyForgeCapabilityContract,
  validateForgeCapabilityRegistry,
  type ForgeCapabilityDescriptorV1,
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
  check('bounded initial registry', FORGE_CAPABILITIES.length === 17, `count=${FORGE_CAPABILITIES.length}`);

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

  return { pass: checks.every(item => item.pass), checks, contractHash: contract.contractHash };
}
