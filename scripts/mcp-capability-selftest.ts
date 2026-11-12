#!/usr/bin/env node
/** Deterministic MCP discovery, narrowing, fail-closed, and recovery checks for B115/W1. */

import assert from 'assert/strict';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import {
  FORGE_CAPABILITIES,
  buildForgeCapabilityContract,
  type ForgeCapabilityDescriptorV1,
} from '../src/lib/forgeCapabilities';
import type { XmlReferenceMapResult, XmlReferenceStatus } from '../src/lib/xmlReferenceGraph';
import type { ForgeCpuProfileReport, ForgePerformanceResourceSample, ForgePerformanceSnapshot } from '../src/lib/forgePerformance';
import type { ForgeBackendPerformanceStatus } from '../src/server/forgePerformance';

const PERFORMANCE_TOOLS = ['get_forge_performance', 'start_forge_performance_capture', 'profile_forge_backend'];

const EXPECTED_TOOLS = [
  'validate_mod',
  'list_schema_domains',
  'get_workspace',
  'compile_workspace',
  'author_check',
  'stage_and_validate',
  'readiness',
  'runtime_debugger',
  'check_expression',
  'get_xml_references',
  ...PERFORMANCE_TOOLS,
  'check_conflicts',
  'check_patch_readiness',
  'explain_element',
];
const LEGACY_TOOLS = EXPECTED_TOOLS.filter(tool => !['runtime_debugger', 'check_expression', 'get_xml_references', ...PERFORMANCE_TOOLS].includes(tool));
const READ_TOOLS = ['list_schema_domains', 'get_workspace', 'readiness', 'runtime_debugger', 'check_expression', 'get_xml_references', ...PERFORMANCE_TOOLS, 'check_conflicts', 'explain_element'];
const WRITE_TOOLS = [
  'validate_mod', 'list_schema_domains', 'get_workspace', 'compile_workspace', 'author_check',
  'stage_and_validate', 'readiness', 'runtime_debugger', 'check_expression', 'get_xml_references', ...PERFORMANCE_TOOLS, 'check_conflicts', 'explain_element',
];
const CUSTOM_TOOLS = ['validate_mod', 'list_schema_domains', 'author_check', 'stage_and_validate', 'explain_element'];
const MCP_KEY = `x4fk_${'a'.repeat(64)}`;
const MCP_WORKSPACE_ID = 'ws_111111111111111111111111';
const EFFECTIVE_API_VERSION = '2026-08-01.agent-effective.v1';
const EFFECTIVE_SCHEMA_VERSION = 'forge.agent-capability-authority.v1';
const ROUTE_POLICY_VERSION = 'forge.route-dispositions.v4';
const RUNTIME_EXPECT_MAX_LENGTH = 256;
const RUNTIME_MAX_COUNT = 1_000_000;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('MCP selftest server did not bind a TCP port.');
  return address.port;
}

async function stop(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

interface JsonRpcMessage {
  id?: number;
  method?: string;
  result?: { tools?: any[]; content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  error?: { code?: number; message?: string };
}

interface McpClient {
  child: ChildProcessWithoutNullStreams;
  initializeResult: JsonRpcMessage;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<JsonRpcMessage>;
  waitForNotification(method: string, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

async function startMcp(baseUrl: string, auth: { key?: string; workspaceId?: string } = {}): Promise<McpClient> {
  const child = spawn(process.execPath, [path.join(process.cwd(), 'vscode-extension', 'mcp', 'x4forge-mcp.cjs')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      X4FORGE_URL: baseUrl,
      X4FORGE_KEY: auth.key ?? MCP_KEY,
      X4FORGE_WORKSPACE_ID: auth.workspaceId ?? MCP_WORKSPACE_ID,
      X4FORGE_CAPABILITY_RETRY_MS: '100',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let buffer = '';
  let stderr = '';
  const notifications: string[] = [];
  let nextId = 1;
  const pending = new Map<number, { resolve: (message: JsonRpcMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  child.stderr.on('data', value => { stderr += value; });
  child.stdout.on('data', value => {
    buffer += value;
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message: JsonRpcMessage;
      try { message = JSON.parse(line) as JsonRpcMessage; } catch { continue; }
      if (typeof message.method === 'string' && message.id === undefined) {
        notifications.push(message.method);
        continue;
      }
      if (typeof message.id !== 'number') continue;
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  child.once('exit', code => {
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP exited ${code ?? 'unknown'} while waiting for request ${id}. stderr=${stderr}`));
    }
    pending.clear();
  });

  const client = {
    child,
    initializeResult: {} as JsonRpcMessage,
    request(method, params = {}, timeoutMs = 6_000) {
      const id = nextId++;
      return new Promise<JsonRpcMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP ${method} timed out. stderr=${stderr}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    async waitForNotification(method: string, timeoutMs = 3_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const index = notifications.indexOf(method);
        if (index >= 0) {
          notifications.splice(index, 1);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`MCP notification ${method} timed out. received=${notifications.join(',')} stderr=${stderr}`);
    },
    async close() {
      if (child.exitCode !== null) return;
      child.stdin.end();
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { child.kill(); resolve(); }, 2_000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    },
  } satisfies McpClient;
  const initialized = await client.request('initialize');
  assert.ok(initialized.result, 'MCP initialize failed');
  client.initializeResult = initialized;
  assert.equal((initialized.result as any)?.capabilities?.tools?.listChanged, true,
    'dynamic MCP inventory must advertise tools.listChanged');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return client;
}

async function toolsFor(client: McpClient): Promise<any[]> {
  const message = await client.request('tools/list');
  assert.equal(message.error, undefined, message.error?.message);
  assert.ok(Array.isArray(message.result?.tools), 'MCP tools/list omitted tools');
  const tools = message.result!.tools!;
  for (const tool of tools) {
    assert.equal(typeof tool?.description, 'string', `MCP tool ${String(tool?.name || '<unnamed>')} omitted description`);
    assert.ok(tool?.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema),
      `MCP tool ${String(tool?.name || '<unnamed>')} omitted object inputSchema`);
    assert.equal(tool.inputSchema.type, 'object',
      `MCP tool ${String(tool?.name || '<unnamed>')} must advertise an object root input schema`);
    assert.equal(tool.inputSchema.additionalProperties, false,
      `MCP tool ${String(tool?.name || '<unnamed>')} must advertise a closed root input schema`);
  }
  const authorCheck = tools.find(tool => tool.name === 'author_check');
  if (authorCheck) {
    assert.equal(authorCheck.inputSchema?.properties?.files?.items?.additionalProperties, false,
      'author_check draft-file items must reject undeclared fields');
    assert.equal(authorCheck.inputSchema?.properties?.files?.items?.type, 'object',
      'author_check draft-file items must advertise object validation');
  }
  const xmlReferences = tools.find(tool => tool.name === 'get_xml_references');
  if (xmlReferences) {
    assert.deepEqual(xmlReferences.inputSchema.required, ['focus']);
    assert.equal(xmlReferences.inputSchema.properties.focus.additionalProperties, false,
      'XML reference focus must reject undeclared fields');
    for (const excluded of ['workspace', 'project', 'includeSource', 'fromPath', 'sourceFolder', 'apply']) {
      assert.equal(xmlReferences.inputSchema.properties[excluded], undefined,
        `curated XML reference input must not accept ${excluded}`);
    }
  }
  for (const name of PERFORMANCE_TOOLS) {
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) continue;
    assert.match(tool.description, /backend/i, `${name} must identify its actual producer`);
    assert.match(tool.description, /Projection limit:/, `${name} must disclose its partial surface`);
    for (const excluded of ['workspace', 'fromPath', 'sourceFolder', 'command', 'rawProfile', 'persist']) {
      assert.equal(tool.inputSchema.properties[excluded], undefined, `${name} must not accept ${excluded}`);
    }
  }
  return tools;
}

async function withMcp<T>(
  baseUrl: string,
  run: (client: McpClient) => Promise<T>,
  auth?: { key?: string; workspaceId?: string },
): Promise<T> {
  const client = await startMcp(baseUrl, auth);
  try { return await run(client); } finally { await client.close(); }
}

type Mode = 'live' | 'read' | 'write' | 'legacy' | 'malformed' | 'current-missing' | 'unknown-envelope' | 'primitive' |
  'wrong-hash' | 'unauthorized' | 'forbidden' | 'incomplete' | 'duplicate-id' | 'binding-collision' |
  'fixed-body-type' | 'mcp-alias-collision' | 'extra-field' | 'api-path' | 'api-dot-path' | 'open-input' | 'hung' | 'outage' |
  'narrowed' | 'alias-narrowed' | 'v2' | 'wrong-workspace' | 'authority-wrong-hash' | 'effective-malformed' |
  'effective-missing' | 'effective-expanded';
let mode: Mode = 'live';
let endpointMode: 'normal' | 'invalid-json' | 'empty-json' | 'missing-fields' | 'missing-workspace-snapshot' | 'compile-invalid' | 'compile-contradictory' | 'compile-missing-ok' |
  'xml-wrong-schema' | 'xml-wrong-workspace' | 'xml-invalid-status' | 'xml-invalid-location' | 'xml-output-budget' |
  'performance-missing-metric' | 'performance-foreign-producer' | 'performance-invalid-coverage' | 'performance-private-module' |
  'performance-profile-disabled' | 'performance-profile-busy' | 'performance-profile-cooldown' | 'performance-http-conflict' | 'performance-http-cooldown' |
  'performance-missing-overhead-cost' | 'performance-invalid-overhead-scope' | 'performance-missing-cleanup-status' |
  'performance-http-cleanup' | 'performance-http-status-mismatch' | 'performance-http-invalid-failure' = 'normal';
const contract = buildForgeCapabilityContract(sha256);
const wrongHashContract = {
  ...contract,
  contractHash: `${contract.contractHash[0] === '0' ? '1' : '0'}${contract.contractHash.slice(1)}`,
};
const validationV1 = FORGE_CAPABILITIES.find(capability => capability.id === 'project.validate')!;
const aliasNarrowedValidationV1 = {
  ...validationV1,
  surfaces: {
    ...validationV1.surfaces,
    mcp: validationV1.surfaces.mcp.filter(projection => projection.id === 'validate_mod'),
  },
} as ForgeCapabilityDescriptorV1;
const validationV2 = { ...validationV1, version: 2 } as unknown as ForgeCapabilityDescriptorV1;
const duplicateIdV2 = {
  ...validationV1,
  version: 2,
  apiBindings: validationV1.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/v2` })),
  surfaces: { ...validationV1.surfaces, mcp: [] },
} as ForgeCapabilityDescriptorV1;
const duplicateIdContract = buildForgeCapabilityContract(sha256, [validationV1, duplicateIdV2]);
const bindingCollisionCapability = {
  ...validationV1,
  id: 'project.validationcollision',
  surfaces: { ...validationV1.surfaces, mcp: [] },
} as ForgeCapabilityDescriptorV1;
const bindingCollisionContract = buildForgeCapabilityContract(sha256, [validationV1, bindingCollisionCapability]);
const fixedBodyTypeCapability = {
  ...validationV1,
  inputSchema: {
    ...validationV1.inputSchema,
    properties: {
      ...validationV1.inputSchema.properties,
      recordBaseline: { type: 'string' },
    },
  },
} as ForgeCapabilityDescriptorV1;
const fixedBodyTypeContract = buildForgeCapabilityContract(sha256, [fixedBodyTypeCapability]);
const mcpAliasCollisionCapability = {
  ...validationV1,
  id: 'project.validatealiascollision',
  apiBindings: validationV1.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/alias-collision` })),
} as ForgeCapabilityDescriptorV1;
const mcpAliasCollisionContract = buildForgeCapabilityContract(sha256, [validationV1, mcpAliasCollisionCapability]);
const effectiveOrphanCapability = {
  ...validationV1,
  id: 'project.validationorphan',
  apiBindings: validationV1.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/effective-orphan` })),
  surfaces: { ...validationV1.surfaces, mcp: [] },
} as ForgeCapabilityDescriptorV1;
const extraFieldContract = { ...contract, generatedAt: '2030-01-01T00:00:00.000Z' };
const invalidPathCapability = {
  ...validationV1,
  apiBindings: validationV1.apiBindings.map(binding => ({ ...binding, path: `${binding.path}?decoy=1` })),
} as ForgeCapabilityDescriptorV1;
const invalidPathContract = buildForgeCapabilityContract(sha256, [invalidPathCapability]);
const traversalPathCapability = {
  ...validationV1,
  apiBindings: validationV1.apiBindings.map(binding => ({ ...binding, path: `${binding.path}/../hidden` })),
} as ForgeCapabilityDescriptorV1;
const traversalPathContract = buildForgeCapabilityContract(sha256, [traversalPathCapability]);
const workspaceRead = FORGE_CAPABILITIES.find(capability => capability.id === 'workspace.read')!;
const openInputCapability = {
  ...workspaceRead,
  inputSchema: { type: 'object', properties: {}, additionalProperties: true },
} as ForgeCapabilityDescriptorV1;
const openInputContract = buildForgeCapabilityContract(sha256, [openInputCapability]);
const incompleteContract = buildForgeCapabilityContract(sha256, [{
  id: 'project.validate',
  version: 1,
  effects: ['read'],
  apiBindings: [],
  surfaces: {},
} as unknown as ForgeCapabilityDescriptorV1]);
type Constraint = { capabilityIdentities: string[]; allowedEffects: string[] };
const customConstraint: Constraint = {
  capabilityIdentities: ['project.validate@1'],
  allowedEffects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
};

function effectiveAuthority(
  scope: 'read' | 'write' | 'deploy',
  constraint: Constraint | null = null,
  effectiveCapabilities?: ForgeCapabilityDescriptorV1[],
): Record<string, unknown> {
  const allowedEffects = new Set(constraint?.allowedEffects || []);
  const selected = new Set(constraint?.capabilityIdentities || []);
  const capabilities = effectiveCapabilities || FORGE_CAPABILITIES.filter(capability => {
    if (!capability.access.agentScopes.some(candidate => candidate === scope)) return false;
    if (capability.access.public || constraint === null) return true;
    return selected.has(`${capability.id}@${capability.version}`) && capability.effects.every(effect => allowedEffects.has(effect));
  });
  const effectiveIdentities = new Set(capabilities.map(capability => `${capability.id}@${capability.version}`));
  const exclusions = FORGE_CAPABILITIES.flatMap(capability => {
    const identity = `${capability.id}@${capability.version}`;
    if (effectiveIdentities.has(identity)) return [];
    if (!capability.access.agentScopes.some(candidate => candidate === scope)) return [{ capabilityIdentity: identity, code: 'CAPABILITY_SCOPE_DENIED' }];
    if (constraint !== null && !selected.has(identity)) return [{ capabilityIdentity: identity, code: 'CAPABILITY_NOT_GRANTED' }];
    const disallowedEffects = capability.effects.filter(effect => !allowedEffects.has(effect));
    return [{ capabilityIdentity: identity, code: 'CAPABILITY_EFFECT_DENIED', disallowedEffects }];
  });
  const unsigned = {
    api_version: EFFECTIVE_API_VERSION,
    authority_schema_version: EFFECTIVE_SCHEMA_VERSION,
    actor: {
      kind: 'agent', label: `${scope} fixture`, keyId: `key_${scope}_fixture`, scope,
      workspaceId: mode === 'wrong-workspace' ? 'ws_222222222222222222222222' : MCP_WORKSPACE_ID,
    },
    route_policy: { version: ROUTE_POLICY_VERSION, hash: 'b'.repeat(64) },
    constraint,
    capability_contract: buildForgeCapabilityContract(sha256, capabilities),
    exclusions,
  };
  return { ...unsigned, authority_hash: sha256(stableStringify(unsigned)) };
}
const routeCalls: Array<{ method: string; path: string; body: unknown }> = [];
const discoveryCalls: Array<{ path: string; authorization?: string; workspaceId?: string }> = [];
const runtimeHostileHome = `${process.env.USERPROFILE || 'C:\\Users\\Fixture'}\\private\\debuglog.txt`;
function xmlReferenceFixture(): XmlReferenceMapResult {
  const files = Array.from({ length: 260 }, (_, index) => ({
    id: `project:assets/fixture_${index}.xml`, origin: 'project' as const, path: `assets/fixture_${index}.xml`,
    sha256: 'c'.repeat(64), locationKind: 'authored' as const, complete: true, available: true,
    sourcePaths: [runtimeHostileHome],
    ...(endpointMode === 'xml-output-budget' ? { reason: 'R'.repeat(2048) } : {}),
  }));
  const statuses: XmlReferenceStatus[] = ['ambiguous', 'missing', 'dynamic', 'unsupported', 'incomplete', 'resolved'];
  return {
    ok: false, schemaVersion: 'forge.xml-reference-map.v1', signature: 'd'.repeat(64),
    files, nodes: files.slice(0, 61).map(file => ({ ...file, depth: 1 })),
    edges: Array.from({ length: 123 }, (_, index) => ({
      id: `edge-${index}`, sourceId: files[0].id, kind: 'macro' as const, symbol: `macro_${index}`,
      targetIds: index === 0 ? files.slice(1, 21).map(file => file.id) : [],
      status: statuses[index % statuses.length], reason: 'Keep the authoritative resolution reason.',
      candidates: index === 0 ? files.slice(1, 21).map(file => ({ fileId: file.id, origin: file.origin, path: file.path })) : undefined,
      location: { origin: 'project' as const, path: files[0].path, kind: 'authored' as const, line: 4, column: 9 },
    })),
    coverage: {
      scope: 'Fixture scanned project and lazily reached corpus.', incomingScope: 'Only scanned files, never global completeness.',
      scannedFiles: 260, scannedProjectFiles: 260, scannedReferenceFiles: 0, knownProjectFiles: 260,
      truncated: false, reasons: ['Fixture coverage must survive projection unchanged.'], unsupported: 20, incomplete: 20,
      limits: { maxDepth: 2, maxNodes: 60, maxEdges: 120, maxDocuments: 256, maxDocumentBytes: 2_097_152, maxTotalBytes: 16_777_216, maxPreviewChars: 32_000, maxResponseBytes: 2_097_152 },
    },
    context: { workspaceId: MCP_WORKSPACE_ID, inputMode: 'addressed-workspace', inputFingerprint: 'e'.repeat(64), corpusSignature: 'f'.repeat(64), corpusGeneration: 'fixture-generation', usedSourceSignature: 'a'.repeat(64), nativeSourceFolder: runtimeHostileHome },
    preview: { fileId: files[0].id, origin: 'project', path: files[0].path, sha256: files[0].sha256, content: 'SOURCE PREVIEW MUST NOT LEAK', startLine: 1, truncated: false, locationKind: 'authored' },
  };
}
function performanceSnapshotFixture(): ForgePerformanceSnapshot {
  const resource = (index: number): ForgePerformanceResourceSample => ({
    atUnixMs: 1000 + index, elapsedMs: 2000, cpuUserMicros: null, cpuSystemMicros: null,
    cpuOneCorePercent: null, cpuHostPercent: null, logicalCpuCount: 8, rssBytes: null,
    heapUsedBytes: 100 + index, heapTotalBytes: 200, externalBytes: 0, arrayBuffersBytes: 0,
    uptimeSeconds: 10, eventLoopUtilization: null, eventLoopDelayP50Ms: null,
    eventLoopDelayP95Ms: null, eventLoopDelayMaxMs: null, fps: null, frameIntervalMs: null,
    longTaskDurationMs: null, jsHeapUsedBytes: null,
  });
  return {
    schemaVersion: 'forge.performance.v1', producer: { component: 'backend', scope: 'owned-process', pid: 42, instanceId: 'performance_fixture' },
    enabled: true, disposed: false, startedAtUnixMs: null, capturedAtUnixMs: 2000,
    operations: Array.from({ length: 40 }, (_, index) => ({
      name: `fixture.operation_${index}`, count: 1, outcomes: { ok: 1, error: 0, cancelled: 0, aborted: 0, superseded: 0 },
      totalMs: index + 1, minMs: index + 1, maxMs: index + 1, meanMs: index + 1,
      p50Ms: null, p95Ms: index + 1, p99Ms: index + 1, quantileMethod: 'fixed-histogram-upper-bound',
      histogram: { upperBoundsMs: [100], counts: [1] },
    })),
    recentSlowOperations: Array.from({ length: 20 }, (_, index) => ({
      name: `fixture.operation_${index}`, durationMs: 100 + index, outcome: 'superseded', correlationId: `fixture_${index}`, atUnixMs: null,
    })),
    resources: Array.from({ length: 25 }, (_, index) => resource(index)),
    drops: { disabled: 1, disposed: 0, invalidOperations: 2, invalidResources: 3, operationCapacity: 4, slowOverwrites: 5,
      resourceOverwrites: 6, duplicateFinishes: 7, recorderErrors: 8, snapshotOmissions: 9, staleFinishes: 10 },
    limits: { maxOperations: 128, maxSlowOperations: 64, maxResources: 120, maxSnapshotBytes: 1048576, maxNameChars: 160, maxCorrelationChars: 80, slowOperationMs: 100 },
    selfOverhead: { recordCalls: 40, recordMs: null, snapshotCalls: 1, snapshotMs: null, clockFailures: 2,
      snapshotScope: 'completed-prior-snapshots-including-serialization-and-freeze' },
    coverage: { operations: 'instrumented-boundaries-only', cpuAttribution: 'process-interval-not-exclusive-operation',
      memoryAttribution: 'process-or-host-estimates-not-function-allocations', quantiles: 'histogram-estimates',
      resourceFields: 'null-means-unavailable-or-unsampled', functionProfiles: 'separate-bounded-producer', limitsAre: 'retained-state-not-os-quota' },
  };
}
function performanceControlFixture(): ForgeBackendPerformanceStatus {
  return {
    disposed: false, collectionActive: true, profilingEnabled: true, profileActive: false,
    collectionStartedAtUnixMs: 1000, collectionExpiresAtUnixMs: 61000, intervalMs: 2000,
    resourceSamples: 25, resourceErrors: 2, throttledSamples: 3, counterResets: 4, sampleOverheadMs: 0.5,
    lastResourceError: 'unavailable', eventLoopDelayMonitoring: false, profileCleanupUnconfirmed: false,
    collectionStopDelayMs: null, profileCapturesStarted: 4, profileCapturesSucceeded: 2, profileCapturesFailed: 2,
    collectionCleanupUnconfirmed: true, abortListenerCleanupUnconfirmed: true, ownedTimerCount: 3, failedTimerCount: 1,
    profileRateLimited: 3, profileCooldownRemainingMs: 25000,
    coverage: { backendPid: 42, extensionHost: 'not-this-producer', webview: 'not-this-producer', childProcesses: 'excluded', memory: 'process-not-function', cpu: 'process-interval' },
  };
}
function performanceReportFixture() {
  const cache = { hits: 1, misses: 2, bypasses: 3, evictions: 4, entries: 5, accountedBytes: 600 };
  return {
    ok: true as const, schemaVersion: 'forge.performance.report.v1' as const,
    backend: performanceSnapshotFixture(), control: performanceControlFixture(),
    caches: { projectValidation: { ...cache, lua: { ...cache }, effectiveSchema: { ...cache }, privatePath: runtimeHostileHome } },
    coverage: { native: 'unavailable-not-wired', webview: 'local-current-panel-only', profiling: 'backend-only-explicit-control',
      cacheBytes: 'accounted-not-exact-heap', operations: 'instrumented-boundaries-only' },
    privatePath: runtimeHostileHome,
  };
}
function performanceProfileFixture(): ForgeCpuProfileReport {
  return {
    ok: true, schemaVersion: 'forge.cpu-profile.v1', producer: performanceSnapshotFixture().producer,
    requestedDurationMs: 250, observedDurationMs: 350, delayedStopMs: 100, samplingIntervalMicros: 1000,
    profileDurationMicros: 250000, sampleCount: null, scannedSampleCount: 100,
    functions: Array.from({ length: 40 }, (_, index) => ({ name: `function_${index}`, module: 'src/server/forgePerformance.ts',
      line: index + 1, column: 1, selfSamples: index + 1, selfSampleMicros: null })),
    omitted: { nodes: 1, samples: 2, functions: 3, unknownNodeSamples: 4, invalidNodes: 5, invalidDeltas: 6, redactedLabels: 7 },
    coverage: { process: 'current-backend-only', attribution: 'sampled-self-time-not-exact-operation-cpu', rawProfile: 'not-returned-or-persisted',
      timer: 'event-loop-blockage-can-delay-stop', resourceLimit: 'no-os-heap-quota', samples: 'unavailable' },
  };
}
const server = http.createServer((request, response) => {
  if (request.url === '/api/agent/schema') {
    discoveryCalls.push({
      path: request.url,
      authorization: request.headers.authorization,
      workspaceId: request.headers['x-workspace-id'] as string | undefined,
    });
    if (mode === 'hung') return;
    if (mode === 'outage') {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'schema temporarily unavailable' }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const effectiveModes: Mode[] = [
      'live', 'read', 'write', 'narrowed', 'alias-narrowed', 'v2', 'unauthorized', 'forbidden',
      'wrong-workspace', 'authority-wrong-hash', 'effective-malformed', 'effective-missing', 'effective-expanded',
    ];
    const body = effectiveModes.includes(mode)
      ? { api_version: '2026-07-30.agent.v4', capability_contract: contract }
      : mode === 'duplicate-id'
            ? { api_version: '2026-07-30.agent.v4', capability_contract: duplicateIdContract }
            : mode === 'binding-collision'
              ? { api_version: '2026-07-30.agent.v4', capability_contract: bindingCollisionContract }
              : mode === 'fixed-body-type'
                ? { api_version: '2026-07-30.agent.v4', capability_contract: fixedBodyTypeContract }
                : mode === 'mcp-alias-collision'
                  ? { api_version: '2026-07-30.agent.v4', capability_contract: mcpAliasCollisionContract }
                : mode === 'extra-field'
                  ? { api_version: '2026-07-30.agent.v4', capability_contract: extraFieldContract }
                : mode === 'api-path'
                  ? { api_version: '2026-07-30.agent.v4', capability_contract: invalidPathContract }
                  : mode === 'api-dot-path'
                    ? { api_version: '2026-07-30.agent.v4', capability_contract: traversalPathContract }
                : mode === 'open-input'
                  ? { api_version: '2026-07-30.agent.v4', capability_contract: openInputContract }
          : mode === 'wrong-hash'
            ? { api_version: '2026-07-30.agent.v4', capability_contract: wrongHashContract }
          : mode === 'incomplete'
            ? { api_version: '2026-07-30.agent.v4', capability_contract: incompleteContract }
          : mode === 'malformed'
            ? { api_version: '2026-07-30.agent.v4', capability_contract: { ...contract, contractHash: 'not-a-hash', capabilities: contract.capabilities.slice(0, 1) } }
            : mode === 'current-missing'
              ? { api_version: '2026-07-30.agent.v4' }
              : mode === 'unknown-envelope'
                ? { api_version: 'future.agent.v99' }
                : mode === 'primitive'
                  ? 'not-a-schema-envelope'
                  : { api_version: '2026-06-10.agent.v2' };
    response.end(JSON.stringify(body));
    return;
  }
  if (request.url === '/api/agent/capabilities/effective') {
    discoveryCalls.push({
      path: request.url,
      authorization: request.headers.authorization,
      workspaceId: request.headers['x-workspace-id'] as string | undefined,
    });
    if (mode === 'legacy') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (mode === 'effective-missing') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    if (mode === 'unauthorized') {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid agent key' }));
      return;
    }
    if (mode === 'forbidden') {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'key scope denied' }));
      return;
    }
    let authority = mode === 'read'
      ? effectiveAuthority('read')
      : mode === 'write'
        ? effectiveAuthority('write')
        : mode === 'narrowed'
          ? effectiveAuthority('write', customConstraint)
          : mode === 'alias-narrowed'
            ? effectiveAuthority('write', customConstraint, [
              FORGE_CAPABILITIES.find(capability => capability.id === 'schema.domains.list')!,
              FORGE_CAPABILITIES.find(capability => capability.id === 'schema.element.explain')!,
              aliasNarrowedValidationV1,
            ])
            : mode === 'v2'
              ? effectiveAuthority('write', customConstraint, [validationV2])
              : mode === 'effective-expanded'
                ? effectiveAuthority('deploy', null, [...FORGE_CAPABILITIES, effectiveOrphanCapability])
              : mode === 'effective-malformed'
                ? { api_version: EFFECTIVE_API_VERSION, actor: {} }
                : effectiveAuthority('deploy');
    if (mode === 'authority-wrong-hash') authority = { ...authority, authority_hash: '0'.repeat(64) };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(authority));
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/agent/lang/hover?')) {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      domain: 'md', tag: 'cue', known: true, summary: 'fixture', requiredAttrs: [], attrCount: 0,
    }));
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/agent/lang/attrs?')) {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ attrs: [] }));
    return;
  }
  if (request.method === 'POST' && ['/api/agent/project/validate', '/api/agent/project/validate/check'].includes(request.url || '')) {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      routeCalls.push({ method: request.method || '', path: request.url || '', body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(endpointMode === 'empty-json'
        ? {}
        : { ok: true, summary: {}, flat: [], capsules: [], source: { loaded: [] } }));
    });
    return;
  }
  if (request.method === 'POST' && request.url === '/api/agent/expressions/check') {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = JSON.parse(raw);
      routeCalls.push({ method: request.method || '', path: request.url || '', body });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: false, legal: false, expression: body.expression,
        problems: Array.from({ length: 51 }, () => ({ code: 'expression-format-specifier', severity: 'error' })),
      }));
    });
    return;
  }
  if (request.method === 'POST' && request.url === '/api/agent/project/xml-references') {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = JSON.parse(raw);
      routeCalls.push({ method: request.method || '', path: request.url || '', body });
      const result: any = xmlReferenceFixture();
      if (endpointMode === 'missing-fields') delete result.coverage;
      if (endpointMode === 'xml-wrong-schema') result.schemaVersion = 'forge.xml-reference-map.v2';
      if (endpointMode === 'xml-wrong-workspace') result.context.workspaceId = 'ws_222222222222222222222222';
      if (endpointMode === 'xml-invalid-status') result.edges[0].status = 'probably-resolved';
      if (endpointMode === 'xml-invalid-location') result.edges[0].location.path = '../outside.xml';
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/api/agent/performance') {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    const result: any = performanceReportFixture();
    if (endpointMode === 'performance-missing-metric') delete result.backend.resources.at(-1).rssBytes;
    if (endpointMode === 'performance-foreign-producer') result.backend.producer.component = 'extension-host';
    if (endpointMode === 'performance-invalid-coverage') result.coverage.native = 'complete';
    if (endpointMode === 'performance-missing-overhead-cost') delete result.backend.selfOverhead.recordMs;
    if (endpointMode === 'performance-invalid-overhead-scope') result.backend.selfOverhead.snapshotScope = 'all-tracker-work';
    if (endpointMode === 'performance-missing-cleanup-status') delete result.control.collectionCleanupUnconfirmed;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result));
    return;
  }
  if (request.method === 'POST' && ['/api/agent/performance/collection', '/api/agent/performance/profile'].includes(request.url || '')) {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = JSON.parse(raw);
      routeCalls.push({ method: request.method || '', path: request.url || '', body });
      const conflict = endpointMode === 'performance-http-conflict';
      const cooldown = endpointMode === 'performance-http-cooldown';
      const cleanup = endpointMode === 'performance-http-cleanup';
      const mismatch = endpointMode === 'performance-http-status-mismatch';
      const malformed = endpointMode === 'performance-http-invalid-failure';
      response.writeHead(conflict || cleanup || mismatch || malformed ? 409 : cooldown ? 429 : 200, { 'Content-Type': 'application/json' });
      if (conflict || cooldown || cleanup || mismatch || malformed) {
        const collection = request.url === '/api/agent/performance/collection';
        response.end(JSON.stringify({ ok: false, ...(!malformed ? { error: 'Bounded capture refused.' } : {}),
          code: cleanup ? 'PROFILE_CLEANUP_UNCONFIRMED' : cooldown || mismatch ? 'PROFILE_RATE_LIMITED' : collection ? 'PERFORMANCE_COLLECTION_BUSY' : 'PROFILE_BUSY' }));
        return;
      }
      if (request.url === '/api/agent/performance/collection') {
        response.end(JSON.stringify({ ok: true, control: performanceControlFixture(), backend: performanceSnapshotFixture() }));
        return;
      }
      if (['performance-profile-disabled', 'performance-profile-busy', 'performance-profile-cooldown'].includes(endpointMode)) {
        response.end(JSON.stringify({ ok: false, code: endpointMode === 'performance-profile-disabled' ? 'PROFILE_DISABLED' : endpointMode === 'performance-profile-busy' ? 'PROFILE_BUSY' : 'PROFILE_RATE_LIMITED', error: 'Bounded profile unavailable.' }));
        return;
      }
      const result: any = performanceProfileFixture();
      result.rawProfile = { privatePath: runtimeHostileHome };
      if (endpointMode === 'performance-private-module') result.functions[0].module = runtimeHostileHome;
      response.end(JSON.stringify(result));
    });
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/agent/lang/element-explain?')) {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(endpointMode === 'missing-fields'
      ? { domain: 'md', tag: 'cue', known: true, attrs: [] }
      : { domain: 'md', tag: 'cue', known: true, requiredAttrs: [], attrCount: 0, attrs: [] }));
    return;
  }
  if (request.method === 'GET' && request.url === '/api/agent/readiness') {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': endpointMode === 'invalid-json' ? 'text/plain' : 'application/json' });
    response.end(endpointMode === 'invalid-json' ? 'not-json' : JSON.stringify({
      workspaceId: 'fixture', workspace: 'Fixture workspace', modId: 'fixture', stages: [], note: 'fixture',
    }));
    return;
  }
  if (request.method === 'GET' && request.url?.startsWith('/api/agent/runtime-debugger')) {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const hostileHome = runtimeHostileHome;
    const longRuntimeText = 'L'.repeat(1_000);
    response.end(JSON.stringify({
      schemaVersion: 1,
      authority: {
        workspaceId: MCP_WORKSPACE_ID,
        displayName: 'MCP runtime fixture',
        contentId: 'x4_runtime_fixture',
        sourceFolder: hostileHome,
        deployedFolder: 'x4_runtime_fixture',
      },
      identity: {
        workspaceId: MCP_WORKSPACE_ID,
        contentIds: ['x4_runtime_fixture'],
        deployedFolders: ['x4_runtime_fixture'],
        sourceFolders: [hostileHome],
        ownedFileCount: 12,
        inventoryComplete: true,
        inventoryOtherExtensionCount: 2,
        inventoryScannedAt: '2030-01-01T00:00:00.000Z',
      },
      session: {
        state: 'historical',
        sessionId: 'segment_fixture',
        logPath: hostileHome,
        generation: 3,
        firstLine: 1,
        lastLine: 90,
        newlyReadBytes: 1024,
        observedAt: '2030-01-01T00:00:00.000Z',
        detail: longRuntimeText,
      },
      incidents: Array.from({ length: 20 }, (_, index) => ({
        key: `incident-${index}`,
        count: index === 0 ? Number.MAX_SAFE_INTEGER : index + 1,
        firstLine: index + 1,
        lastLine: index + 2,
        classification: 'engine_fault',
        severity: 'error',
        isEngineFailure: true,
        raw: 'WHOLE LOG MUST NOT LEAK',
        lines: ['WHOLE LOG MUST NOT LEAK'],
        samples: [{ text: 'WHOLE LOG MUST NOT LEAK' }],
        attribution: {
          disposition: index === 1 ? 'ambiguous' : 'confirmed_active',
          confidence: 0.8,
          reason: 'Fixture attribution',
          evidence: [{ label: 'fixture', value: 'active extension', strength: 'exact', rank: 1 }],
        },
        evidence: Array.from({ length: 10 }, (_, evidenceIndex) => `bounded runtime evidence ${evidenceIndex}`),
        explanation: {
          cause: 'Deterministic fixture cause',
          impact: 'Fixture impact',
          nextAction: 'Inspect the addressed source',
          summary: longRuntimeText,
          evidenceLabel: 'fixture evidence',
        },
        mapping: {
          kind: index === 0 ? 'node' : 'file_line',
          file: hostileHome,
          line: 41,
          nodeId: index === 0 ? 'cue_fixture' : undefined,
          nodeLabel: index === 0 ? 'Fixture cue' : undefined,
          reason: longRuntimeText,
        },
      })),
      coverage: {
        target: 0.99,
        met: false,
        candidates: Number.MAX_SAFE_INTEGER,
        recognized: 18,
        explicitUnknown: 1,
        silentlyDropped: 1,
        recognizedOrExplicitUnknown: Number.MAX_SAFE_INTEGER,
        recognizedOrExplicitUnknownRatio: 0.95,
        dispositionCounts: { confirmed_active: Number.MAX_SAFE_INTEGER, ambiguous: 1, excluded_other_mod: 1, unknown: 0 },
        dispositionSum: Number.MAX_SAFE_INTEGER,
      },
      expectedSteps: Array.from({ length: 20 }, (_, index) => ({
        id: `step-${index}`,
        label: `Expected step ${index}`,
        truth: index === 0 ? 'observed' : 'missing',
        observed: index === 0,
        success: index === 0,
        evidence: index === 0
          ? Array.from({ length: 10 }, (_, evidenceIndex) => `observed fixture marker ${evidenceIndex}`)
          : [],
      })),
      hiddenOtherModCount: Number.MAX_SAFE_INTEGER,
      ambiguousCount: Number.MAX_SAFE_INTEGER,
      hiddenOtherModSummary: longRuntimeText,
      ...(endpointMode === 'missing-fields' ? {} : {
        verdict: {
          state: 'stale',
          detail: 'Historical evidence is not current proof.',
          errorCount: 8,
          currentSession: false,
          positiveExecutionEvidence: false,
          coverageMet: false,
          unresolvedBlocker: true,
        },
      }),
    }));
    return;
  }
  if (request.method === 'GET' && request.url === '/api/agent/workspace') {
    routeCalls.push({ method: request.method, path: request.url, body: null });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      workspaceId: 'ws_fixture',
      workspace: { name: 'Fixture workspace', nodes: [{ id: 'cue_fixture', xmlTag: 'cue', label: 'Fixture cue' }], links: [] },
      version: 7,
      workspaceHash: 'a'.repeat(64),
      ...(endpointMode === 'missing-workspace-snapshot' ? {} : { snapshotHash: 'b'.repeat(64) }),
      lastUpdated: '2030-01-01T00:00:00.000Z',
      origin: 'mcp-selftest',
    }));
    return;
  }
  if (request.method === 'POST' && request.url === '/api/agent/compile') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      success: endpointMode !== 'compile-invalid',
      modId: 'compile_fixture', file_count: 1, files: { 'ui/test.lua': 'preview' },
      diagnostics: [{ severity: 'warning', message: 'retain me' }],
      validation: endpointMode === 'compile-missing-ok' ? {} : { ok: endpointMode === 'normal', summary: {} },
    }));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;
try {
  mode = 'read';
  await withMcp(baseUrl, async client => {
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), READ_TOOLS,
      'read key effective discovery must expose exactly the declared read tools');
  });

  mode = 'write';
  await withMcp(baseUrl, async client => {
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), WRITE_TOOLS,
      'write key effective discovery must expose exactly the declared write tools');
  });

  mode = 'live';
  await withMcp(baseUrl, async client => {
    for (const fixture of ['normal', 'compile-invalid', 'compile-contradictory'] as const) {
      endpointMode = fixture;
      const reply = await client.request('tools/call', { name: 'compile_workspace', arguments: {} });
      const payload = JSON.parse(reply.result!.content![0].text!);
      const valid = fixture === 'normal';
      assert.equal(payload.success, valid, `${fixture}: validation controls the compile verdict`);
      assert.equal(Boolean(reply.result?.isError), !valid, `${fixture}: MCP must flag invalid output`);
      assert.equal(payload.validation.ok, valid);
      assert.equal(payload.generation.success, true);
      assert.deepEqual(payload.files, ['ui/test.lua']);
      assert.equal(payload.diagnostics[0].message, 'retain me');
      if (!valid) {
        assert.equal(payload.code, 'PROJECT_VALIDATION_FAILED');
        assert.deepEqual(payload.failedStages, ['validation']);
      }
    }
    endpointMode = 'compile-missing-ok';
    const missing = await client.request('tools/call', { name: 'compile_workspace', arguments: {} });
    assert.equal(missing.result?.isError, true, 'missing validation.ok must fail closed');
    endpointMode = 'normal';
  });
  for (const [label, auth] of [
    ['missing-key', { key: '' }],
    ['missing-workspace', { workspaceId: '' }],
  ] as const) {
    await withMcp(baseUrl, async client => {
      assert.deepEqual(await toolsFor(client), [], `${label} must advertise no tools before effective discovery`);
      const denied = await client.request('tools/call', { name: 'get_workspace', arguments: {} });
      assert.equal(denied.error?.code, -32602, `${label} must also block direct tools/call`);
    }, auth);
  }

  mode = 'live';
  discoveryCalls.length = 0;
  await withMcp(baseUrl, async client => {
    const liveTools = await toolsFor(client);
    assert.deepEqual(liveTools.map(tool => tool.name), EXPECTED_TOOLS, 'live discovery changed the curated MCP inventory');
    assert.deepEqual(discoveryCalls.slice(0, 2).map(call => call.path), [
      '/api/agent/schema', '/api/agent/capabilities/effective',
    ], 'current MCP discovery must verify the canonical catalog before the actor-effective subset');
    assert.ok(discoveryCalls.slice(0, 2).every(call =>
      call.authorization === `Bearer ${MCP_KEY}` && call.workspaceId === MCP_WORKSPACE_ID),
    'canonical and effective discovery must carry the configured bearer key and workspace authority');
    assert.ok(!JSON.stringify(liveTools).includes(MCP_KEY) && !JSON.stringify(liveTools).includes('x4fk_'),
      'MCP inventory must never leak the plaintext key');
    for (const tool of liveTools) {
      assert.equal(tool._meta?.['x4forge/contractVersion'], 'forge.capability.v1');
      assert.equal(tool._meta?.['x4forge/contractHash'], contract.contractHash);
      assert.equal(tool._meta?.['x4forge/authorityVersion'], EFFECTIVE_API_VERSION);
      assert.match(String(tool._meta?.['x4forge/authorityHash'] || ''), /^[a-f0-9]{64}$/);
      assert.equal(typeof tool._meta?.['x4forge/capabilityId'], 'string');
      const capabilityId = String(tool._meta?.['x4forge/capabilityId'] || '');
      assert.equal(
        tool._meta?.['x4forge/capabilityVersion'],
        FORGE_CAPABILITIES.find(capability => capability.id === capabilityId)?.version,
      );
      assert.equal(tool.annotations, undefined, '2024-11-05 MCP must not emit annotations introduced in later revisions');
    }
    routeCalls.length = 0;
    const liveValidation = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal(liveValidation.error, undefined, liveValidation.error?.message);
    assert.equal((liveValidation.result as any)?.isError, undefined);
    const liveWorkspace = await client.request('tools/call', { name: 'get_workspace', arguments: {} });
    assert.equal(liveWorkspace.error, undefined, liveWorkspace.error?.message);
    assert.equal((liveWorkspace.result as any)?.isError, undefined);
    const liveWorkspaceSummary = JSON.parse(String(liveWorkspace.result?.content?.[0]?.text || '{}'));
    assert.deepEqual(liveWorkspaceSummary, {
      name: 'Fixture workspace',
      version: 7,
      workspaceHash: 'a'.repeat(64),
      snapshotHash: 'b'.repeat(64),
      nodes: 1,
      links: 0,
      nodeSummary: [{ id: 'cue_fixture', tag: 'cue', label: 'Fixture cue' }],
    }, 'get_workspace must return both identities and the bounded workspace summary');
    const liveExplanation = await client.request('tools/call', { name: 'explain_element', arguments: { tag: 'cue' } });
    assert.equal(liveExplanation.error, undefined, liveExplanation.error?.message);
    assert.equal((liveExplanation.result as any)?.isError, undefined);
    const liveReadiness = await client.request('tools/call', { name: 'readiness', arguments: {} });
    assert.equal(liveReadiness.error, undefined, liveReadiness.error?.message);
    assert.equal((liveReadiness.result as any)?.isError, undefined);
    const runtimeTool = liveTools.find(tool => tool.name === 'runtime_debugger');
    assert.ok(runtimeTool, 'runtime debugger must be present in a live effective contract');
    assert.equal(runtimeTool._meta?.['x4forge/capabilityId'], 'runtime.debug.read');
    assert.equal(runtimeTool._meta?.['x4forge/capabilityVersion'], 1);
    assert.equal(runtimeTool.inputSchema?.properties?.expect?.maxLength, RUNTIME_EXPECT_MAX_LENGTH);
    assert.equal(runtimeTool.inputSchema?.properties?.logPath, undefined,
      'runtime debugger must not accept a log path');
    assert.equal(runtimeTool.inputSchema?.properties?.modId, undefined,
      'runtime debugger must remain addressed by workspace authority, not modId');
    const liveRuntime = await client.request('tools/call', {
      name: 'runtime_debugger', arguments: { expect: 'cue_fixture,marker_fixture' },
    });
    assert.equal(liveRuntime.error, undefined, liveRuntime.error?.message);
    assert.equal((liveRuntime.result as any)?.isError, undefined);
    const runtimeSummary = JSON.parse(String(liveRuntime.result?.content?.[0]?.text || '{}'));
    assert.equal(runtimeSummary.schemaVersion, 1);
    assert.deepEqual(runtimeSummary.authority, {
      workspaceId: MCP_WORKSPACE_ID,
      displayName: 'MCP runtime fixture',
      contentId: 'x4_runtime_fixture',
    });
    assert.deepEqual(runtimeSummary.identity, {
      workspaceId: MCP_WORKSPACE_ID,
      contentIds: ['x4_runtime_fixture'],
      deployedFolders: ['x4_runtime_fixture'],
      ownedFileCount: 12,
      inventoryComplete: true,
      inventoryOtherExtensionCount: 2,
      inventoryScannedAt: '2030-01-01T00:00:00.000Z',
    });
    assert.equal(runtimeSummary.session.state, 'historical');
    assert.equal(runtimeSummary.session.detail.length, 360);
    assert.equal(runtimeSummary.verdict.state, 'stale');
    assert.equal(runtimeSummary.verdict.currentSession, false);
    assert.equal(runtimeSummary.verdict.unresolvedBlocker, true);
    assert.equal(runtimeSummary.expectedSteps.length, 16, 'expected steps must be capped');
    assert.equal(runtimeSummary.expectedSteps[0].evidence.length, 5, 'expected-step evidence must be capped');
    assert.equal(runtimeSummary.incidents.length, 8, 'incidents must be capped');
    assert.equal(runtimeSummary.incidents[0].count, RUNTIME_MAX_COUNT, 'incident counts must be capped');
    assert.equal(runtimeSummary.incidents[0].evidence.length, 5, 'incident evidence must be capped');
    assert.equal(runtimeSummary.incidents[0].navigationEvidence.kind, 'md_node',
      'confirmed node attribution must expose safe node navigation');
    assert.equal(runtimeSummary.incidents[0].navigationEvidence.nodeId, 'cue_fixture');
    assert.equal(runtimeSummary.incidents[1].navigationEvidence, undefined,
      'ambiguous attribution must never synthesize navigation');
    assert.equal(runtimeSummary.incidents[1].unresolved, true);
    assert.equal(runtimeSummary.incidents[2].navigationEvidence.kind, 'file_line',
      'confirmed file attribution must expose safe file navigation');
    assert.equal(runtimeSummary.coverage.candidates, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.coverage.recognizedOrExplicitUnknown, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.coverage.dispositionCounts.confirmed_active, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.coverage.dispositionSum, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.hiddenOtherModCount, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.ambiguousCount, RUNTIME_MAX_COUNT);
    assert.equal(runtimeSummary.hiddenOtherModSummary.length, 360);
    const runtimeWire = JSON.stringify(runtimeSummary);
    assert.ok(runtimeWire.includes('%USERPROFILE%'), 'runtime projection must retain only redacted path evidence');
    assert.ok(!runtimeWire.includes(runtimeHostileHome), 'runtime projection must redact user-profile paths');
    for (const forbiddenField of ['logPath', 'sourceFolder', 'raw', 'lines', 'samples']) {
      assert.equal(runtimeWire.includes(`"${forbiddenField}"`), false,
        `runtime projection must exclude ${forbiddenField}`);
    }
    assert.equal(runtimeWire.includes('WHOLE LOG MUST NOT LEAK'), false,
      'runtime projection must exclude whole-log/raw fixture content');
    const expressionArguments = { expression: "'%d'.[1]", variableTypes: { $ship: 'ship' } };
    const expressionReply = await client.request('tools/call', { name: 'check_expression', arguments: expressionArguments });
    assert.equal(expressionReply.error, undefined);
    assert.equal((expressionReply.result as any)?.isError, undefined, 'illegal expression is a completed check');
    const expressionResult = JSON.parse(String(expressionReply.result?.content?.[0]?.text || '{}'));
    assert.equal(expressionResult.legal, false);
    assert.equal(expressionResult.problemCount, 51);
    assert.equal(expressionResult.problems.length, 50);
    assert.deepEqual(routeCalls.at(-1)?.body, expressionArguments);
    assert.deepEqual(routeCalls.map(call => `${call.method} ${call.path}`), [
      'POST /api/agent/project/validate/check',
      'GET /api/agent/workspace',
      'GET /api/agent/lang/element-explain?file=md%2Fx.xml&tag=cue',
      'GET /api/agent/readiness',
      'GET /api/agent/runtime-debugger?expect=cue_fixture%2Cmarker_fixture',
      'POST /api/agent/expressions/check',
    ], 'current-contract execution must use current capability routes');

    routeCalls.length = 0;
    const invalidListParams = await client.request('tools/list', { ignored: true });
    assert.equal(invalidListParams.error?.code, -32602, 'tools/list must reject undeclared params');
    const invalidListCursor = await client.request('tools/list', { cursor: 'not-issued' });
    assert.equal(invalidListCursor.error?.code, -32602, 'tools/list must reject a cursor that this one-page inventory did not issue');
    const invalidCallEnvelope = await client.request('tools/call', { name: 'readiness', arguments: {}, ignored: true });
    assert.equal(invalidCallEnvelope.error?.code, -32602, 'tools/call must reject undeclared envelope fields');
    const invalidCallArgumentsShape = await client.request('tools/call', { name: 'readiness', arguments: 'not-an-object' });
    assert.equal(invalidCallArgumentsShape.error?.code, -32602, 'tools/call arguments must be an object when supplied');
    for (const invalid of [
      { name: 'validate_mod', arguments: {} },
      { name: 'validate_mod', arguments: { fromPath: 42 } },
      { name: 'author_check', arguments: { files: [{ path: 'md/x.xml', content: 42 }] } },
      { name: 'readiness', arguments: { apply: true } },
      { name: 'readiness', arguments: { constructor: 'x' } },
      { name: 'explain_element', arguments: { tag: 'cue', recordBaseline: true } },
      { name: 'author_check', arguments: { files: [{ path: 'md/x.xml', content: '<mdscript/>', ignored: true }] } },
      { name: 'author_check', arguments: { files: [{ path: 'md/x.xml', content: '<mdscript/>', toString: 'x' }] } },
      { name: 'runtime_debugger', arguments: { expect: 42 } },
      { name: 'runtime_debugger', arguments: { expect: 'e'.repeat(RUNTIME_EXPECT_MAX_LENGTH + 1) } },
      { name: 'runtime_debugger', arguments: { expect: 'cue_fixture', logPath: 'C:\\Users\\Fixture\\debuglog.txt' } },
      { name: 'runtime_debugger', arguments: { modId: 'x4_runtime_fixture' } },
      { name: 'check_expression', arguments: {} },
      { name: 'check_expression', arguments: { expression: 'x'.repeat(4097) } },
      { name: 'check_expression', arguments: { expression: '$x', variableTypes: { $x: 42 } } },
      { name: 'check_expression', arguments: { expression: '$x', recordBaseline: true } },
    ]) {
      const denied = await client.request('tools/call', invalid);
      assert.equal(denied.error?.code, -32602, `${invalid.name} malformed input must fail before HTTP`);
    }
    assert.deepEqual(routeCalls, [], 'schema-invalid MCP arguments reached the Forge API');

    endpointMode = 'empty-json';
    const emptyResponse = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal((emptyResponse.result as any)?.isError, true, 'empty successful API envelope must fail the MCP call');
    endpointMode = 'invalid-json';
    const invalidJsonResponse = await client.request('tools/call', { name: 'readiness', arguments: {} });
    assert.equal((invalidJsonResponse.result as any)?.isError, true, 'non-JSON successful API response must fail the MCP call');
    endpointMode = 'missing-fields';
    const incompleteEnvelope = await client.request('tools/call', { name: 'explain_element', arguments: { tag: 'cue' } });
    assert.equal((incompleteEnvelope.result as any)?.isError, true,
      'successful API response missing canonical output fields must fail the MCP call');
    const incompleteRuntime = await client.request('tools/call', { name: 'runtime_debugger', arguments: {} });
    assert.equal((incompleteRuntime.result as any)?.isError, true,
      'runtime debugger must fail closed when a required verdict field is missing');
    assert.match(String(incompleteRuntime.result?.content?.[0]?.text || ''), /verdict/,
      'runtime debugger malformed payload failure must name the missing verdict field');
    endpointMode = 'missing-workspace-snapshot';
    const missingSnapshot = await client.request('tools/call', { name: 'get_workspace', arguments: {} });
    assert.equal((missingSnapshot.result as any)?.isError, true,
      'workspace.read@2 must fail closed when the API omits snapshotHash');
    assert.match(String(missingSnapshot.result?.content?.[0]?.text || ''), /snapshotHash/,
      'workspace.read@2 failure must name the missing snapshotHash field');
    endpointMode = 'normal';
  });

  mode = 'live';
  await withMcp(baseUrl, async client => {
    const xmlTool = (await toolsFor(client)).find(tool => tool.name === 'get_xml_references');
    assert.ok(xmlTool, 'current discovery must register the XML reference tool');
    assert.equal(xmlTool._meta?.['x4forge/capabilityId'], 'project.xml.references');
    assert.equal(xmlTool._meta?.['x4forge/capabilityVersion'], 1);
    assert.match(xmlTool.description, /Projection limit:/, 'curated projection limits must be visible in discovery');
    routeCalls.length = 0;
    const focus = { origin: 'project', path: 'assets/fixture_0.xml', line: 4, column: 9 };
    const reply = await client.request('tools/call', { name: 'get_xml_references', arguments: { focus } });
    assert.equal(reply.error, undefined);
    assert.equal(reply.result?.isError, undefined, 'an incomplete analysis is an authoritative result, not a transport error');
    const result = JSON.parse(String(reply.result?.content?.[0]?.text || '{}'));
    const fixture = xmlReferenceFixture();
    assert.deepEqual(routeCalls, [{
      method: 'POST', path: '/api/agent/project/xml-references',
      body: { focus, maxDepth: 2, maxNodes: 60, maxEdges: 120, includeSource: false },
    }], 'XML tool must use the canonical addressed read route with bounded defaults and no inline workspace');
    assert.equal(result.ok, fixture.ok);
    assert.equal(result.schemaVersion, fixture.schemaVersion);
    assert.equal(result.signature, fixture.signature);
    assert.deepEqual(result.coverage, fixture.coverage, 'projection must preserve service coverage, including partial-scope truth');
    assert.equal(result.context.workspaceId, MCP_WORKSPACE_ID);
    assert.equal(result.context.inputFingerprint, fixture.context!.inputFingerprint);
    assert.equal(result.context.corpusSignature, fixture.context!.corpusSignature);
    assert.equal(result.context.corpusGeneration, fixture.context!.corpusGeneration);
    assert.equal(result.context.usedSourceSignature, fixture.context!.usedSourceSignature);
    assert.deepEqual(result.files.map((file: any) => file.id), fixture.files.slice(0, 256).map(file => file.id));
    assert.deepEqual(result.nodes.map((file: any) => file.id), fixture.nodes.slice(0, 60).map(file => file.id),
      'projection must never fabricate nodes for unresolved or omitted files');
    assert.deepEqual(result.edges.map((edge: any) => edge.status), fixture.edges.slice(0, 120).map(edge => edge.status));
    assert.deepEqual(result.edges[0].location, fixture.edges[0].location, 'authored one-based source evidence must survive');
    assert.deepEqual(result.edges[0].targetIds, fixture.edges[0].targetIds.slice(0, 16));
    assert.equal(result.edges[0].targetIdCount, 20);
    assert.equal(result.edges[0].targetIdsTruncated, true);
    assert.deepEqual(result.edges[0].candidates, fixture.edges[0].candidates!.slice(0, 16));
    assert.equal(result.edges[0].candidateCount, 20);
    assert.equal(result.edges[0].candidatesTruncated, true);
    assert.deepEqual(result.edges[1].targetIds, [], 'missing targets must stay unresolved without fabricated fallback');
    assert.equal(result.edges[1].targetId, undefined);
    assert.deepEqual(result.projection, {
      fileCount: 260, returnedFileCount: 256, nodeCount: 61, returnedNodeCount: 60, edgeCount: 123, returnedEdgeCount: 120,
      candidateCountInReturnedEdges: 20, returnedCandidateCount: 16, targetIdCountInReturnedEdges: 20, returnedTargetIdCount: 16,
      truncated: true, sourceIncluded: false,
      omittedFields: ['preview', 'files.sourcePaths', 'nodes.sourcePaths', 'context.nativeSourceFolder'],
    });
    assert.equal(JSON.stringify(result).includes('SOURCE PREVIEW MUST NOT LEAK'), false);
    assert.equal(JSON.stringify(result).includes(runtimeHostileHome), false);
    const smaller = await client.request('tools/call', {
      name: 'get_xml_references', arguments: { focus, maxDepth: 0, maxNodes: 3, maxEdges: 5 },
    });
    const smallerResult = JSON.parse(String(smaller.result?.content?.[0]?.text || '{}'));
    assert.deepEqual(routeCalls.at(-1)?.body, { focus, maxDepth: 0, maxNodes: 3, maxEdges: 5, includeSource: false });
    assert.equal(smallerResult.nodes.length, 3);
    assert.equal(smallerResult.edges.length, 5);
    routeCalls.length = 0;
    for (const args of [
      {}, { focus: { path: focus.path } }, { focus: { ...focus, origin: 'disk' } },
      { focus: { ...focus, path: 42 } }, { focus: { ...focus, apply: true } },
      { focus, workspace: { files: [] } }, { focus, project: { files: [] } }, { focus, includeSource: true },
      { focus, fromPath: 'fixture' }, { focus, sourceFolder: runtimeHostileHome },
      { focus, maxDepth: 3 }, { focus, maxNodes: 1.5 },
    ]) {
      const denied = await client.request('tools/call', { name: 'get_xml_references', arguments: args });
      assert.equal(denied.error?.code, -32602, 'malformed XML reference arguments must fail schema checks before HTTP');
    }
    for (const args of [
      { focus: { ...focus, path: '../outside.xml' } }, { focus: { ...focus, path: runtimeHostileHome } },
      { focus: { ...focus, line: 0 } }, { focus: { ...focus, column: 1_000_000_001 } },
      { focus, maxNodes: 0 }, { focus, maxNodes: 61 }, { focus, maxEdges: 121 },
    ]) {
      const denied = await client.request('tools/call', { name: 'get_xml_references', arguments: args });
      assert.equal(denied.result?.isError, true, 'out-of-bounds XML reference arguments must fail before HTTP');
    }
    assert.deepEqual(routeCalls, [], 'rejected XML reference arguments reached the Forge API');
    for (const fixtureMode of [
      'missing-fields', 'xml-wrong-schema', 'xml-wrong-workspace', 'xml-invalid-status', 'xml-invalid-location', 'xml-output-budget',
    ] as const) {
      endpointMode = fixtureMode;
      const denied = await client.request('tools/call', { name: 'get_xml_references', arguments: { focus } });
      assert.equal(denied.result?.isError, true, `${fixtureMode}: invalid service results must not become a success or fabricated graph`);
      assert.equal(String(denied.result?.content?.[0]?.text || '').includes('"nodes"'), false,
        `${fixtureMode}: rejection must not contain fallback nodes`);
    }
    endpointMode = 'normal';
  });

  mode = 'live';
  await withMcp(baseUrl, async client => {
    const tools = await toolsFor(client);
    for (const [index, name] of PERFORMANCE_TOOLS.entries()) {
      const tool = tools.find(candidate => candidate.name === name);
      assert.ok(tool, `live discovery omitted ${name}`);
      assert.equal(tool._meta?.['x4forge/capabilityId'], ['performance.read', 'performance.collect', 'performance.profile'][index]);
      assert.equal(tool._meta?.['x4forge/capabilityVersion'], 1);
    }
    routeCalls.length = 0;
    const read = await client.request('tools/call', { name: 'get_forge_performance', arguments: {} });
    assert.equal(read.error, undefined);
    assert.equal(read.result?.isError, undefined);
    const report = JSON.parse(String(read.result?.content?.[0]?.text || '{}'));
    const fixture = performanceReportFixture();
    assert.deepEqual(routeCalls, [{ method: 'GET', path: '/api/agent/performance', body: null }], 'snapshot reads must not start captures');
    assert.equal(report.schemaVersion, fixture.schemaVersion);
    assert.deepEqual(report.coverage, fixture.coverage);
    assert.deepEqual(report.control, fixture.control, 'cooldown, loss and unsupported-producer evidence must survive');
    assert.deepEqual(report.backend.drops, fixture.backend.drops);
    assert.deepEqual(report.backend.selfOverhead, fixture.backend.selfOverhead);
    assert.equal(report.backend.selfOverhead.recordMs, null, 'clock failure must not become zero recording cost');
    assert.equal(report.backend.selfOverhead.snapshotMs, null);
    assert.equal(report.backend.selfOverhead.snapshotScope, 'completed-prior-snapshots-including-serialization-and-freeze');
    assert.equal(report.backend.drops.staleFinishes, 10, 'cross-generation finishes must remain visible');
    assert.equal(report.control.collectionCleanupUnconfirmed, true);
    assert.equal(report.control.abortListenerCleanupUnconfirmed, true);
    assert.equal(report.control.failedTimerCount, 1);
    assert.deepEqual(report.backend.coverage, fixture.backend.coverage);
    assert.equal(report.backend.operations.length, 32);
    assert.equal(report.backend.operations[0].name, 'fixture.operation_39');
    assert.equal(report.backend.operations[0].p50Ms, null);
    assert.equal(report.backend.operations[0].histogram, undefined);
    assert.deepEqual(report.backend.recentSlowOperations, fixture.backend.recentSlowOperations.slice(-16));
    assert.deepEqual(report.backend.resources, fixture.backend.resources.slice(-20));
    assert.equal(report.backend.resources[0].rssBytes, null, 'unavailable memory must not become a zero estimate');
    assert.deepEqual(report.backend.projection, { operationCount: 40, scannedOperationCount: 40, returnedOperationCount: 32,
      slowOperationCount: 20, returnedSlowOperationCount: 16, resourceSampleCount: 25, returnedResourceSampleCount: 20,
      truncated: true, omittedFields: ['operations.histogram'] });
    assert.equal(report.caches.projectValidation.accountedBytes, 600);
    assert.equal(report.caches.projectValidation.lua.hits, 1);
    assert.equal(report.caches.projectValidation.effectiveSchema.entries, 5);
    assert.equal(JSON.stringify(report).includes(runtimeHostileHome), false, 'unreviewed cache/report fields must not leak private paths');

    const capture = await client.request('tools/call', { name: 'start_forge_performance_capture', arguments: {} });
    assert.equal(capture.result?.isError, undefined);
    assert.deepEqual(routeCalls.at(-1), { method: 'POST', path: '/api/agent/performance/collection',
      body: { durationMs: 60000, intervalMs: 2000, eventLoopDelay: false } });
    const captured = JSON.parse(String(capture.result?.content?.[0]?.text || '{}'));
    assert.deepEqual(captured.control, fixture.control);
    assert.equal(captured.backend.resources.length, 20);
    await client.request('tools/call', { name: 'start_forge_performance_capture', arguments: { durationMs: 900000, intervalMs: 60000, eventLoopDelay: true } });
    assert.deepEqual(routeCalls.at(-1)?.body, { durationMs: 900000, intervalMs: 60000, eventLoopDelay: true });

    const profile = await client.request('tools/call', { name: 'profile_forge_backend', arguments: {} });
    assert.equal(profile.result?.isError, undefined);
    assert.deepEqual(routeCalls.at(-1), { method: 'POST', path: '/api/agent/performance/profile',
      body: { durationMs: 250, samplingIntervalMicros: 1000, maxFunctions: 16 } });
    const profiled = JSON.parse(String(profile.result?.content?.[0]?.text || '{}'));
    const profileFixture = performanceProfileFixture();
    assert.deepEqual(profiled.functions, profileFixture.functions.slice(0, 16));
    assert.deepEqual(profiled.omitted, profileFixture.omitted);
    assert.deepEqual(profiled.coverage, profileFixture.coverage);
    assert.equal(profiled.requestedDurationMs, 250);
    assert.equal(profiled.observedDurationMs, 350);
    assert.equal(profiled.delayedStopMs, 100);
    assert.equal(profiled.sampleCount, null);
    assert.equal(profiled.functions[0].selfSampleMicros, null);
    assert.deepEqual(profiled.projection, { functionCount: 40, returnedFunctionCount: 16, truncated: true });
    assert.equal(profiled.rawProfile, undefined);
    assert.equal(JSON.stringify(profiled).includes(runtimeHostileHome), false);
    const larger = await client.request('tools/call', { name: 'profile_forge_backend', arguments: { durationMs: 2000, samplingIntervalMicros: 100000, maxFunctions: 32 } });
    assert.equal(JSON.parse(String(larger.result?.content?.[0]?.text || '{}')).functions.length, 32);
    assert.deepEqual(routeCalls.at(-1)?.body, { durationMs: 2000, samplingIntervalMicros: 100000, maxFunctions: 32 });

    routeCalls.length = 0;
    for (const name of PERFORMANCE_TOOLS) {
      for (const args of [{ workspace: {} }, { command: 'anything' }, { sourceFolder: runtimeHostileHome }, { rawProfile: true }]) {
        const denied = await client.request('tools/call', { name, arguments: args });
        assert.equal(denied.error?.code, -32602, `${name} accepted undeclared arguments`);
      }
    }
    for (const [name, args] of [
      ['start_forge_performance_capture', { durationMs: 999 }], ['start_forge_performance_capture', { durationMs: 900001 }],
      ['start_forge_performance_capture', { intervalMs: 999 }], ['start_forge_performance_capture', { intervalMs: 60001 }],
      ['profile_forge_backend', { durationMs: 99 }], ['profile_forge_backend', { durationMs: 2001 }],
      ['profile_forge_backend', { samplingIntervalMicros: 999 }], ['profile_forge_backend', { samplingIntervalMicros: 100001 }],
      ['profile_forge_backend', { maxFunctions: 0 }], ['profile_forge_backend', { maxFunctions: 33 }],
    ] as const) {
      const denied = await client.request('tools/call', { name, arguments: args });
      assert.equal(denied.result?.isError, true, `${name} must reject out-of-bounds collection/profiling`);
    }
    for (const [name, args] of [
      ['start_forge_performance_capture', { durationMs: 1000.5 }], ['start_forge_performance_capture', { eventLoopDelay: 'yes' }],
      ['profile_forge_backend', { maxFunctions: 1.5 }], ['get_forge_performance', { durationMs: 1000 }],
    ] as const) {
      assert.equal((await client.request('tools/call', { name, arguments: args })).error?.code, -32602);
    }
    assert.deepEqual(routeCalls, [], 'invalid performance arguments reached HTTP');
    for (const fixtureMode of ['performance-missing-metric', 'performance-foreign-producer', 'performance-invalid-coverage',
      'performance-missing-overhead-cost', 'performance-invalid-overhead-scope', 'performance-missing-cleanup-status'] as const) {
      endpointMode = fixtureMode;
      const denied = await client.request('tools/call', { name: 'get_forge_performance', arguments: {} });
      assert.equal(denied.result?.isError, true, `${fixtureMode} must fail closed`);
      assert.equal(String(denied.result?.content?.[0]?.text || '').includes('"operations"'), false, 'invalid results must not create fallback evidence');
    }
    endpointMode = 'performance-private-module';
    assert.equal((await client.request('tools/call', { name: 'profile_forge_backend', arguments: {} })).result?.isError, true);
    for (const [fixtureMode, code] of [
      ['performance-profile-disabled', 'PROFILE_DISABLED'], ['performance-profile-busy', 'PROFILE_BUSY'], ['performance-profile-cooldown', 'PROFILE_RATE_LIMITED'],
    ] as const) {
      endpointMode = fixtureMode;
      const denied = await client.request('tools/call', { name: 'profile_forge_backend', arguments: {} });
      assert.equal(denied.result?.isError, true);
      assert.deepEqual(JSON.parse(String(denied.result?.content?.[0]?.text || '{}')), { ok: false, code, error: 'Bounded profile unavailable.' });
    }
    for (const fixtureMode of ['performance-http-conflict', 'performance-http-cooldown'] as const) {
      endpointMode = fixtureMode;
      for (const [name, route] of [
        ['profile_forge_backend', '/api/agent/performance/profile'],
        ['start_forge_performance_capture', '/api/agent/performance/collection'],
      ] as const) {
        routeCalls.length = 0;
        const denied = await client.request('tools/call', { name, arguments: {} });
        assert.equal(denied.result?.isError, true);
        assert.equal(routeCalls.length, 1, 'HTTP overlap/cooldown rejection must not retry or start another capture');
        assert.equal(routeCalls[0].path, route);
        if (name === 'profile_forge_backend' || fixtureMode === 'performance-http-conflict') {
          const failure = JSON.parse(String(denied.result?.content?.[0]?.text || '{}'));
          assert.equal(failure.ok, false);
          assert.equal(failure.code, name === 'start_forge_performance_capture' ? 'PERFORMANCE_COLLECTION_BUSY'
            : fixtureMode === 'performance-http-conflict' ? 'PROFILE_BUSY' : 'PROFILE_RATE_LIMITED');
          assert.equal(failure.error, 'Bounded capture refused.');
          assert.equal(failure.functions, undefined);
          assert.equal(failure.backend, undefined);
        }
      }
    }
    endpointMode = 'performance-http-cleanup';
    const uncertain = await client.request('tools/call', { name: 'profile_forge_backend', arguments: {} });
    assert.equal(uncertain.result?.isError, true);
    assert.deepEqual(JSON.parse(String(uncertain.result?.content?.[0]?.text || '{}')),
      { ok: false, code: 'PROFILE_CLEANUP_UNCONFIRMED', error: 'Bounded capture refused.' }, 'HTTP cleanup uncertainty must keep its typed refusal');
    for (const fixtureMode of ['performance-http-status-mismatch', 'performance-http-invalid-failure'] as const) {
      endpointMode = fixtureMode;
      const denied = await client.request('tools/call', { name: 'profile_forge_backend', arguments: {} });
      assert.equal(denied.result?.isError, true);
      assert.equal(String(denied.result?.content?.[0]?.text || '').includes('"ok"'), false,
        'malformed or contradictory HTTP failures must not be fabricated into typed profile results');
    }
    endpointMode = 'normal';
  });

  mode = 'legacy';
  await withMcp(baseUrl, async client => {
    const legacyTools = await toolsFor(client);
    assert.deepEqual(legacyTools.map(tool => tool.name), LEGACY_TOOLS, 'legacy fallback changed the curated MCP inventory');
    assert.equal(legacyTools.find(tool => tool.name === 'runtime_debugger'), undefined,
      'runtime debugger must not bypass live capability discovery through legacy fallback');
    const legacyExpression = await client.request('tools/call', { name: 'check_expression', arguments: { expression: '$x' } });
    assert.equal(legacyExpression.error?.code, -32602, 'expression check requires live capability discovery');
    const legacyXmlReferences = await client.request('tools/call', {
      name: 'get_xml_references', arguments: { focus: { origin: 'project', path: 'assets/fixture_0.xml' } },
    });
    assert.equal(legacyXmlReferences.error?.code, -32602, 'XML references must not gain authority from legacy fallback');
    for (const name of PERFORMANCE_TOOLS) {
      assert.equal((await client.request('tools/call', { name, arguments: {} })).error?.code, -32602,
        `${name} must not acquire authority from legacy discovery`);
    }
    assert.ok(legacyTools.every(tool => tool._meta?.['x4forge/contractVersion'] === 'legacy-static-fallback'));
    const legacyWorkspaceTool = legacyTools.find(tool => tool.name === 'get_workspace');
    assert.equal(legacyWorkspaceTool?._meta?.['x4forge/capabilityVersion'], 1,
      'legacy get_workspace must identify its workspace.read@1 compatibility projection');
    assert.match(String(legacyWorkspaceTool?.description || ''), /no complete snapshotHash/i);
    routeCalls.length = 0;
    const legacyCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal(legacyCall.error, undefined, legacyCall.error?.message);
    assert.equal(legacyCall.result?.content?.[0]?.type, 'text');
    endpointMode = 'missing-workspace-snapshot';
    const legacyWorkspace = await client.request('tools/call', { name: 'get_workspace', arguments: {} });
    assert.equal((legacyWorkspace.result as any)?.isError, undefined,
      'reviewed legacy workspace.read@1 response must remain callable without snapshotHash');
    const legacyWorkspaceSummary = JSON.parse(String(legacyWorkspace.result?.content?.[0]?.text || '{}'));
    assert.equal(legacyWorkspaceSummary.snapshotHash, undefined);
    assert.equal(legacyWorkspaceSummary.snapshotHashAvailable, false);
    assert.equal(legacyWorkspaceSummary.compatibility, 'workspace.read@1');
    endpointMode = 'normal';
    assert.deepEqual(routeCalls, [
      { method: 'POST', path: '/api/agent/project/validate', body: { fromPath: 'fixture' } },
      { method: 'GET', path: '/api/agent/workspace', body: null },
    ], 'legacy calls must use bounded compatibility routes and preserve workspace.read@1 truth');
  });

  mode = 'legacy';
  await withMcp(baseUrl, async client => {
    await toolsFor(client);
    mode = 'outage';
    const unavailableTools = await toolsFor(client);
    const unavailableWorkspaceTool = unavailableTools.find(tool => tool.name === 'get_workspace');
    assert.equal(unavailableWorkspaceTool?._meta?.['x4forge/capabilityVersion'], 1,
      'a positively identified reviewed legacy server may retain its bounded v1 adapter through an outage');
    routeCalls.length = 0;
    const validationCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal(validationCall.result?.content?.[0]?.type, 'text');
    const explanationCall = await client.request('tools/call', { name: 'explain_element', arguments: { tag: 'cue' } });
    assert.equal(explanationCall.result?.content?.[0]?.type, 'text');
    endpointMode = 'missing-workspace-snapshot';
    const unavailableWorkspace = await client.request('tools/call', { name: 'get_workspace', arguments: {} });
    assert.equal((unavailableWorkspace.result as any)?.isError, undefined,
      'positively identified legacy workspace.read@1 may remain available through a transient discovery outage');
    endpointMode = 'normal';
    assert.deepEqual(routeCalls.map(call => `${call.method} ${call.path}`), [
      'POST /api/agent/project/validate',
      'GET /api/agent/lang/hover?file=md%2Fx.xml&tag=cue',
      'GET /api/agent/lang/attrs?file=md%2Fx.xml&tag=cue',
      'GET /api/agent/workspace',
    ], 'transient outage after reviewed legacy discovery must retain only the old-server-compatible calls');
  });

  mode = 'malformed';
  await withMcp(baseUrl, async client => {
    assert.deepEqual(await toolsFor(client), [], 'malformed current contract must fail closed');
    const deniedCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal(deniedCall.error?.code, -32602, 'malformed current contract must also block direct tools/call');
  });

  for (const invalidMode of [
    'current-missing', 'unknown-envelope', 'primitive', 'wrong-hash', 'unauthorized', 'forbidden',
    'wrong-workspace', 'authority-wrong-hash', 'effective-malformed', 'effective-missing', 'effective-expanded',
  ] as const) {
    mode = invalidMode;
    await withMcp(baseUrl, async client => {
      assert.deepEqual(await toolsFor(client), [], `${invalidMode} capability discovery must fail closed`);
      const deniedCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
      assert.equal(deniedCall.error?.code, -32602, `${invalidMode} must also block direct tools/call`);
    });
  }

  mode = 'incomplete';
  await withMcp(baseUrl, async client => {
    assert.deepEqual(await toolsFor(client), [], 'correctly hashed incomplete v1 descriptor must fail closed');
    mode = 'legacy';
    assert.deepEqual(await toolsFor(client), [], 'legacy downgrade after malformed current discovery must remain fail closed');
    mode = 'live';
    await client.waitForNotification('notifications/tools/list_changed');
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), EXPECTED_TOOLS,
      'a later valid current contract must notify and recover a process blocked by malformed discovery');
  });

  for (const invalidMode of [
    'duplicate-id', 'binding-collision', 'fixed-body-type', 'mcp-alias-collision', 'extra-field', 'api-path', 'api-dot-path', 'open-input',
  ] as const) {
    mode = invalidMode;
    await withMcp(baseUrl, async client => {
      assert.deepEqual(await toolsFor(client), [], `${invalidMode} correctly hashed contract must fail closed`);
      const deniedCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
      assert.equal(deniedCall.error?.code, -32602, `${invalidMode} contract must also block direct tools/call`);
    });
  }

  mode = 'narrowed';
  await withMcp(baseUrl, async client => {
    const narrowedTools = await toolsFor(client);
    assert.deepEqual(narrowedTools.map(tool => tool.name), CUSTOM_TOOLS,
      'custom exact identity must retain public capabilities while narrowing protected tools');
    routeCalls.length = 0;
    for (const name of PERFORMANCE_TOOLS) {
      assert.equal((await client.request('tools/call', { name, arguments: {} })).error?.code, -32602,
        `${name} must require its own exact grant`);
    }
    assert.deepEqual(routeCalls, [], 'ungranted performance tools reached HTTP');
    const narrowedAuthorityHash = narrowedTools[0]?._meta?.['x4forge/authorityHash'];
    assert.match(String(narrowedAuthorityHash || ''), /^[a-f0-9]{64}$/,
      'narrowed live tools must carry the effective authority hash');
    mode = 'legacy';
    const stickyAfterLegacyDowngrade = await toolsFor(client);
    assert.deepEqual(stickyAfterLegacyDowngrade.map(tool => tool.name), CUSTOM_TOOLS,
      'reviewed legacy downgrade after live narrowing must not widen the MCP inventory');
    assert.ok(stickyAfterLegacyDowngrade.every(tool =>
      tool._meta?.['x4forge/contractVersion'] === 'legacy-sticky-live' &&
      tool._meta?.['x4forge/authorityHash'] === narrowedAuthorityHash),
    'legacy downgrade must retain the accepted live contract and authority receipts');
    assert.equal(stickyAfterLegacyDowngrade.find(tool => tool.name === 'get_workspace'), undefined,
      'legacy downgrade must not acquire a workspace.read@1 compatibility projection');
    const excludedAfterLegacy = await client.request('tools/call', { name: 'compile_workspace', arguments: {} });
    assert.equal(excludedAfterLegacy.error?.code, -32602,
      'legacy downgrade must not make an excluded tool directly callable');
    routeCalls.length = 0;
    const allowedAfterLegacy = await client.request('tools/call', {
      name: 'validate_mod', arguments: { fromPath: 'fixture' },
    });
    assert.equal(allowedAfterLegacy.error, undefined, allowedAfterLegacy.error?.message);
    assert.deepEqual(routeCalls.map(call => `${call.method} ${call.path}`), ['POST /api/agent/project/validate/check'],
      'legacy downgrade after live authority must retain current routes, not compatibility adapters');
    mode = 'hung';
    const stickyAfterTimeout = await toolsFor(client);
    assert.deepEqual(stickyAfterTimeout.map(tool => tool.name), CUSTOM_TOOLS,
      'timeout after live narrowing must not widen the MCP inventory');
    assert.ok(stickyAfterTimeout.every(tool => tool._meta?.['x4forge/contractVersion'] === 'unavailable-sticky-live'));
    mode = 'live';
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), CUSTOM_TOOLS,
      'a broader later live contract must not re-expand a process after narrowing');
  });

  mode = 'live';
  await withMcp(baseUrl, async client => {
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), EXPECTED_TOOLS);
    mode = 'outage';
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), EXPECTED_TOOLS.filter(name => !['check_expression', 'get_xml_references', ...PERFORMANCE_TOOLS].includes(name)),
      'expression, XML reference and performance tools require current discovery even when other tools retain prior authority');
    const staleExpression = await client.request('tools/call', { name: 'check_expression', arguments: { expression: '$x' } });
    assert.equal(staleExpression.error?.code, -32602, 'stale discovery cannot authorize a direct expression check');
    const staleXmlReferences = await client.request('tools/call', {
      name: 'get_xml_references', arguments: { focus: { origin: 'project', path: 'assets/fixture_0.xml' } },
    });
    assert.equal(staleXmlReferences.error?.code, -32602, 'stale discovery cannot authorize a direct XML reference map');
    routeCalls.length = 0;
    for (const name of PERFORMANCE_TOOLS) {
      assert.equal((await client.request('tools/call', { name, arguments: {} })).error?.code, -32602,
        `${name} must not acquire authority from stale discovery`);
    }
    assert.deepEqual(routeCalls, [], 'stale performance tools reached HTTP');
    mode = 'live';
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), EXPECTED_TOOLS,
      'a successful discovery restores the expression tool');
    mode = 'alias-narrowed';
    await client.waitForNotification('notifications/tools/list_changed');
    assert.deepEqual(await toolsFor(client), [],
      'a substituted descriptor that is locally well-formed but not byte-equivalent to canonical must fail closed');
    const deniedSubstitutedCall = await client.request('tools/call', { name: 'validate_mod', arguments: { fromPath: 'fixture' } });
    assert.equal(deniedSubstitutedCall.error?.code, -32602,
      'descriptor substitution must also block direct tools/call');
    mode = 'live';
    await client.waitForNotification('notifications/tools/list_changed');
    assert.deepEqual((await toolsFor(client)).map(tool => tool.name), EXPECTED_TOOLS,
      'a later valid actor-effective contract must recover after a substituted descriptor is removed');
  });

  mode = 'v2';
  await withMcp(baseUrl, async client => {
    assert.deepEqual(await toolsFor(client), [], 'unsupported capability descriptor version must not run the v1 adapter');
  });

  mode = 'hung';
  await withMcp(baseUrl, async client => {
    const hungStarted = Date.now();
    const hungTools = await toolsFor(client);
    const hungElapsed = Date.now() - hungStarted;
    assert.deepEqual(hungTools, [], 'pre-first-discovery outage must not expose a broad static inventory');
    assert.ok(hungElapsed >= 1_500 && hungElapsed < 4_500, `hung discovery fallback took ${hungElapsed} ms`);
    mode = 'live';
    const recovered = await toolsFor(client);
    assert.deepEqual(recovered.map(tool => tool.name), EXPECTED_TOOLS, 'same-process discovery did not recover after the server became live');
    assert.ok(recovered.every(tool => tool._meta?.['x4forge/contractVersion'] === 'forge.capability.v1'));
    console.log(`MCP capability selftest PASS: read=${READ_TOOLS.length}, write=${WRITE_TOOLS.length}, deploy=${recovered.length}; exact custom narrowing, legacy-only fallback, authenticated effective discovery, canonical-subset checks, fail-closed negatives, sticky monotonicity, and same-process recovery after ${hungElapsed} ms.`);
  });
} finally {
  await stop(server);
}
