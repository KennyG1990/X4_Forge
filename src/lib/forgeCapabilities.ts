/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B115/W1 — browser-safe capability metadata for every Forge surface.
 *
 * This module is deliberately descriptive, not executable. Existing route handlers,
 * validators, workspace authority, and ledgers remain the enforcement boundary. The
 * registry gives UI, CLI, MCP, the built-in harness, and external agents one stable
 * vocabulary without turning metadata into a second router.
 */

import { stableStringify } from './workspaceIdentity';

export const FORGE_CAPABILITY_SCHEMA_VERSION = 'forge.capability.v1' as const;
export const EXPRESSION_CHECK_MAX_LENGTH = 4096;
export const EXPRESSION_CHECK_MAX_HINTS = 32;
export const EXPRESSION_CHECK_HINT_MAX_LENGTH = 128;

export type ForgeAgentScope = 'read' | 'write' | 'deploy';
export type ForgeContextRequirement = 'none' | 'optional' | 'required';
export type ForgeCapabilityEffect =
  | 'read'
  | 'analyze'
  | 'audit-write'
  | 'audit-retention-delete'
  | 'workspace-write'
  | 'filesystem-write'
  | 'package'
  | 'deploy'
  | 'delete'
  | 'network'
  | 'spend'
  | 'credential'
  | 'publish';
export const FORGE_CAPABILITY_EFFECTS = [
  'read',
  'analyze',
  'audit-write',
  'audit-retention-delete',
  'workspace-write',
  'filesystem-write',
  'package',
  'deploy',
  'delete',
  'network',
  'spend',
  'credential',
  'publish',
] as const satisfies readonly ForgeCapabilityEffect[];
export type ForgeConfirmationPolicy = 'none' | 'preview-required' | 'human-only';
export type ForgeSurfaceProjectionStatus = 'connected' | 'partial' | 'disconnected';
export type ForgeApiInputLocation = 'none' | 'query' | 'body' | 'path' | 'path-and-query';
export type ForgeApiBindingRole = 'primary' | 'supporting';

export interface ForgeJsonSchema {
  readonly type?: string | readonly string[];
  readonly description?: string;
  readonly maxLength?: number;
  readonly properties?: Readonly<Record<string, ForgeJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | ForgeJsonSchema;
  readonly items?: ForgeJsonSchema;
  readonly enum?: readonly unknown[];
  readonly default?: unknown;
  readonly anyOf?: readonly ForgeJsonSchema[];
}

export interface ForgeCapabilityApiBinding {
  readonly method: 'GET' | 'POST';
  /** Literal Express route, including :parameter segments but excluding query text. */
  readonly path: string;
  readonly inputLocation: ForgeApiInputLocation;
  readonly role: ForgeApiBindingRole;
  /** Mandatory adapter values. Callers may not override these fields. */
  readonly fixedBody?: Readonly<Record<string, unknown>>;
}

export interface ForgeSurfaceProjection {
  readonly id: string;
  readonly status: ForgeSurfaceProjectionStatus;
  /** `repo-relative path::literal token`; required for connected/partial projections. */
  readonly anchor?: string;
  readonly note?: string;
}

export interface ForgeCapabilityDescriptorV1 {
  /** Stable dotted identifier. Surface aliases point here; they are not capabilities. */
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ForgeJsonSchema;
  readonly outputSchema: ForgeJsonSchema;
  readonly context: {
    readonly workspace: ForgeContextRequirement;
    readonly profile: ForgeContextRequirement;
  };
  /** Observed W1 access, not a grant. src/lib/agentKeys.ts and server middleware enforce it. */
  readonly access: {
    readonly public: boolean;
    readonly studioSession: true;
    readonly agentScopes: readonly ForgeAgentScope[];
  };
  readonly effects: readonly ForgeCapabilityEffect[];
  readonly confirmation: ForgeConfirmationPolicy;
  readonly apiBindings: readonly ForgeCapabilityApiBinding[];
  readonly surfaces: {
    readonly ui: readonly ForgeSurfaceProjection[];
    readonly cli: readonly ForgeSurfaceProjection[];
    readonly mcp: readonly ForgeSurfaceProjection[];
    readonly agentApi: true;
    readonly builtInHarness: readonly ForgeSurfaceProjection[];
    readonly externalAgents: readonly ForgeSurfaceProjection[];
  };
}

export interface ForgeCapabilityContractV1 {
  readonly schemaVersion: typeof FORGE_CAPABILITY_SCHEMA_VERSION;
  /** SHA-256 of canonicalCapabilityContractPayload(), supplied by the Node boundary. */
  readonly contractHash: string;
  readonly capabilities: readonly ForgeCapabilityDescriptorV1[];
}

const EMPTY_INPUT: ForgeJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

function objectOutput(
  properties: Readonly<Record<string, ForgeJsonSchema>>,
  required: readonly string[],
): ForgeJsonSchema {
  return { type: 'object', properties, required, additionalProperties: true };
}

function connected(id: string, anchor: string): ForgeSurfaceProjection {
  return { id, status: 'connected', anchor };
}

function partial(id: string, anchor: string, note: string): ForgeSurfaceProjection {
  return { id, status: 'partial', anchor, note };
}

function disconnected(id: string, note: string): ForgeSurfaceProjection {
  return { id, status: 'disconnected', note };
}

const XML_REFERENCE_FOCUS_SCHEMA: ForgeJsonSchema = {
  type: 'object',
  properties: {
    origin: { type: 'string', enum: ['project', 'reference'] },
    path: { type: 'string', maxLength: 1024, description: 'Safe relative XML path in the selected origin.' },
    line: { type: 'integer', description: 'Optional positive one-based source line.' },
    column: { type: 'integer', description: 'Optional positive one-based source column.' },
  },
  required: ['origin', 'path'],
  additionalProperties: false,
};
const XML_REFERENCE_OPTIONS: Readonly<Record<string, ForgeJsonSchema>> = {
  focus: XML_REFERENCE_FOCUS_SCHEMA,
  maxDepth: { type: 'integer', description: 'Traversal depth from 0 to 6; default 2.' },
  maxNodes: { type: 'integer', description: 'Neighborhood node limit from 1 to 200; default 80.' },
  maxEdges: { type: 'integer', description: 'Neighborhood edge limit from 1 to 1000; default 300.' },
  includeSource: { type: 'boolean', description: 'Include the bounded authored source preview for the focus file.' },
};
const XML_REFERENCE_FILE_SCHEMA = objectOutput({
  id: { type: 'string' }, origin: { type: 'string', enum: ['project', 'reference'] }, path: { type: 'string' },
  sha256: { type: 'string' }, locationKind: { type: 'string', enum: ['authored', 'effective'] },
  complete: { type: 'boolean' }, available: { type: 'boolean' }, depth: { type: 'integer' },
  sourcePaths: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' },
}, ['id', 'origin', 'path', 'sha256', 'locationKind', 'complete', 'available']);
const XML_REFERENCE_LOCATION_SCHEMA = objectOutput({
  ...XML_REFERENCE_FOCUS_SCHEMA.properties,
  kind: { type: 'string', enum: ['authored', 'effective'] },
}, ['origin', 'path', 'kind']);

const PERFORMANCE_NULLABLE_NUMBER: ForgeJsonSchema = { type: ['number', 'null'] };
const performanceNumbers = (fields: readonly string[], nullable = false): Record<string, ForgeJsonSchema> =>
  Object.fromEntries(fields.map(field => [field, nullable ? PERFORMANCE_NULLABLE_NUMBER : { type: 'number' }]));
const PERFORMANCE_PRODUCER_SCHEMA = objectOutput({
  component: { type: 'string', enum: ['backend', 'extension-host', 'webview'] },
  scope: { type: 'string', enum: ['owned-process', 'shared-process', 'webview'] },
  pid: PERFORMANCE_NULLABLE_NUMBER, instanceId: { type: ['string', 'null'] },
}, ['component', 'scope', 'pid', 'instanceId']);
const PERFORMANCE_RESOURCE_FIELDS = ['atUnixMs', 'elapsedMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuOneCorePercent', 'cpuHostPercent', 'logicalCpuCount', 'rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes', 'uptimeSeconds', 'eventLoopUtilization', 'eventLoopDelayP50Ms', 'eventLoopDelayP95Ms', 'eventLoopDelayMaxMs', 'fps', 'frameIntervalMs', 'longTaskDurationMs', 'jsHeapUsedBytes'] as const;
const PERFORMANCE_DROP_FIELDS = ['disabled', 'disposed', 'invalidOperations', 'invalidResources', 'operationCapacity', 'slowOverwrites', 'resourceOverwrites', 'duplicateFinishes', 'recorderErrors', 'snapshotOmissions', 'staleFinishes'] as const;
const PERFORMANCE_LIMIT_FIELDS = ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'maxNameChars', 'maxCorrelationChars', 'slowOperationMs'] as const;
const PERFORMANCE_OVERHEAD_FIELDS = ['recordCalls', 'snapshotCalls', 'clockFailures'] as const;
const PERFORMANCE_CACHE_FIELDS = ['hits', 'misses', 'bypasses', 'evictions', 'entries', 'accountedBytes'] as const;
const PERFORMANCE_CACHE_SCHEMA = objectOutput(performanceNumbers(PERFORMANCE_CACHE_FIELDS), PERFORMANCE_CACHE_FIELDS);
const PERFORMANCE_OPERATION_SCHEMA = objectOutput({
  name: { type: 'string', maxLength: 160 },
  ...performanceNumbers(['count', 'totalMs', 'minMs', 'maxMs', 'meanMs']),
  ...performanceNumbers(['p50Ms', 'p95Ms', 'p99Ms'], true),
  outcomes: objectOutput(performanceNumbers(['ok', 'error', 'cancelled', 'aborted', 'superseded']), ['ok', 'error', 'cancelled', 'aborted', 'superseded']),
  quantileMethod: { type: 'string', enum: ['fixed-histogram-upper-bound'] },
  histogram: objectOutput({ upperBoundsMs: { type: 'array', items: { type: 'number' } }, counts: { type: 'array', items: { type: 'number' } } }, ['upperBoundsMs', 'counts']),
}, ['name', 'count', 'outcomes', 'totalMs', 'minMs', 'maxMs', 'meanMs', 'p50Ms', 'p95Ms', 'p99Ms', 'quantileMethod', 'histogram']);
const PERFORMANCE_SNAPSHOT_SCHEMA = objectOutput({
  schemaVersion: { type: 'string', enum: ['forge.performance.v1'] }, producer: PERFORMANCE_PRODUCER_SCHEMA,
  enabled: { type: 'boolean' }, disposed: { type: 'boolean' },
  startedAtUnixMs: PERFORMANCE_NULLABLE_NUMBER, capturedAtUnixMs: PERFORMANCE_NULLABLE_NUMBER,
  operations: { type: 'array', items: PERFORMANCE_OPERATION_SCHEMA },
  recentSlowOperations: { type: 'array', items: objectOutput({
    name: { type: 'string', maxLength: 160 }, durationMs: { type: 'number' },
    outcome: { type: 'string', enum: ['ok', 'error', 'cancelled', 'aborted', 'superseded'] },
    correlationId: { type: 'string', maxLength: 80 }, atUnixMs: PERFORMANCE_NULLABLE_NUMBER,
  }, ['name', 'durationMs', 'outcome', 'atUnixMs']) },
  resources: { type: 'array', items: objectOutput(performanceNumbers(PERFORMANCE_RESOURCE_FIELDS, true), PERFORMANCE_RESOURCE_FIELDS) },
  drops: objectOutput(performanceNumbers(PERFORMANCE_DROP_FIELDS), PERFORMANCE_DROP_FIELDS),
  limits: objectOutput(performanceNumbers(PERFORMANCE_LIMIT_FIELDS), PERFORMANCE_LIMIT_FIELDS),
  selfOverhead: objectOutput({ ...performanceNumbers(PERFORMANCE_OVERHEAD_FIELDS), ...performanceNumbers(['recordMs', 'snapshotMs'], true),
    snapshotScope: { type: 'string', enum: ['completed-prior-snapshots-including-serialization-and-freeze'] },
  }, [...PERFORMANCE_OVERHEAD_FIELDS, 'recordMs', 'snapshotMs', 'snapshotScope']),
  coverage: objectOutput({
    operations: { type: 'string', enum: ['instrumented-boundaries-only'] },
    cpuAttribution: { type: 'string', enum: ['process-interval-not-exclusive-operation'] },
    memoryAttribution: { type: 'string', enum: ['process-or-host-estimates-not-function-allocations'] },
    quantiles: { type: 'string', enum: ['histogram-estimates'] },
    resourceFields: { type: 'string', enum: ['null-means-unavailable-or-unsampled'] },
    functionProfiles: { type: 'string', enum: ['separate-bounded-producer'] },
    limitsAre: { type: 'string', enum: ['retained-state-not-os-quota'] },
  }, ['operations', 'cpuAttribution', 'memoryAttribution', 'quantiles', 'resourceFields', 'functionProfiles', 'limitsAre']),
}, ['schemaVersion', 'producer', 'enabled', 'disposed', 'startedAtUnixMs', 'capturedAtUnixMs', 'operations', 'recentSlowOperations', 'resources', 'drops', 'limits', 'selfOverhead', 'coverage']);
const PERFORMANCE_CONTROL_SCHEMA = objectOutput({
  ...Object.fromEntries(['disposed', 'collectionActive', 'profilingEnabled', 'profileActive', 'eventLoopDelayMonitoring', 'profileCleanupUnconfirmed', 'collectionCleanupUnconfirmed', 'abortListenerCleanupUnconfirmed'].map(field => [field, { type: 'boolean' } as ForgeJsonSchema])),
  ...performanceNumbers(['collectionStartedAtUnixMs', 'collectionExpiresAtUnixMs', 'collectionStopDelayMs', 'profileCooldownRemainingMs'], true),
  ...performanceNumbers(['intervalMs', 'resourceSamples', 'resourceErrors', 'throttledSamples', 'counterResets', 'sampleOverheadMs', 'profileCapturesStarted', 'profileCapturesSucceeded', 'profileCapturesFailed', 'profileRateLimited', 'ownedTimerCount', 'failedTimerCount']),
  lastResourceError: { type: ['string', 'null'], enum: ['unavailable', 'producer-identity-changed', 'clock-unavailable', null] },
  coverage: objectOutput({
    backendPid: { type: 'number' }, extensionHost: { type: 'string', enum: ['not-this-producer'] },
    webview: { type: 'string', enum: ['not-this-producer'] }, childProcesses: { type: 'string', enum: ['excluded'] },
    memory: { type: 'string', enum: ['process-not-function'] }, cpu: { type: 'string', enum: ['process-interval'] },
  }, ['backendPid', 'extensionHost', 'webview', 'childProcesses', 'memory', 'cpu']),
}, ['disposed', 'collectionActive', 'profilingEnabled', 'profileActive', 'collectionStartedAtUnixMs', 'collectionExpiresAtUnixMs', 'intervalMs', 'resourceSamples', 'resourceErrors', 'throttledSamples', 'counterResets', 'sampleOverheadMs', 'lastResourceError', 'eventLoopDelayMonitoring', 'profileCleanupUnconfirmed', 'collectionCleanupUnconfirmed', 'abortListenerCleanupUnconfirmed', 'ownedTimerCount', 'failedTimerCount', 'collectionStopDelayMs', 'profileCapturesStarted', 'profileCapturesSucceeded', 'profileCapturesFailed', 'profileRateLimited', 'profileCooldownRemainingMs', 'coverage']);
const PERFORMANCE_PROFILE_FAILURE_SCHEMA = objectOutput({
  ok: { type: 'boolean', enum: [false] },
  code: { type: 'string', enum: ['PROFILE_DISABLED', 'PROFILE_BUSY', 'PROFILE_DISPOSED', 'PROFILE_INPUT_INVALID', 'PROFILE_ABORTED', 'PROFILE_FAILED', 'PROFILE_CLEANUP_UNCONFIRMED', 'PROFILE_RATE_LIMITED'] },
  error: { type: 'string' },
}, ['ok', 'code', 'error']);
const PERFORMANCE_PROFILE_SCHEMA = objectOutput({
  ok: { type: 'boolean', enum: [true] }, schemaVersion: { type: 'string', enum: ['forge.cpu-profile.v1'] }, producer: PERFORMANCE_PRODUCER_SCHEMA,
  requestedDurationMs: { type: 'number' }, samplingIntervalMicros: { type: 'number' }, scannedSampleCount: { type: 'number' },
  ...performanceNumbers(['observedDurationMs', 'delayedStopMs', 'profileDurationMicros', 'sampleCount'], true),
  functions: { type: 'array', items: objectOutput({
    name: { type: 'string' }, module: { type: 'string', description: 'Bounded relative module or runtime label, never an absolute source path.' },
    line: PERFORMANCE_NULLABLE_NUMBER, column: PERFORMANCE_NULLABLE_NUMBER, selfSamples: { type: 'number' }, selfSampleMicros: PERFORMANCE_NULLABLE_NUMBER,
  }, ['name', 'module', 'line', 'column', 'selfSamples', 'selfSampleMicros']) },
  omitted: objectOutput(performanceNumbers(['nodes', 'samples', 'functions', 'unknownNodeSamples', 'invalidNodes', 'invalidDeltas', 'redactedLabels']), ['nodes', 'samples', 'functions', 'unknownNodeSamples', 'invalidNodes', 'invalidDeltas', 'redactedLabels']),
  coverage: objectOutput({
    process: { type: 'string', enum: ['current-backend-only'] }, attribution: { type: 'string', enum: ['sampled-self-time-not-exact-operation-cpu'] },
    rawProfile: { type: 'string', enum: ['not-returned-or-persisted'] }, timer: { type: 'string', enum: ['event-loop-blockage-can-delay-stop'] },
    resourceLimit: { type: 'string', enum: ['no-os-heap-quota'] }, samples: { type: 'string', enum: ['available', 'unavailable'] },
  }, ['process', 'attribution', 'rawProfile', 'timer', 'resourceLimit', 'samples']),
}, ['ok', 'schemaVersion', 'producer', 'requestedDurationMs', 'observedDurationMs', 'delayedStopMs', 'samplingIntervalMicros', 'profileDurationMicros', 'sampleCount', 'scannedSampleCount', 'functions', 'omitted', 'coverage']);
const PERFORMANCE_COLLECTION_SUCCESS_SCHEMA = objectOutput({ ok: { type: 'boolean', enum: [true] }, control: PERFORMANCE_CONTROL_SCHEMA, backend: PERFORMANCE_SNAPSHOT_SCHEMA }, ['ok', 'control', 'backend']);
const PERFORMANCE_COLLECTION_FAILURE_SCHEMA = objectOutput({ ok: { type: 'boolean', enum: [false] }, code: { type: 'string', enum: ['PERFORMANCE_DISPOSED', 'PERFORMANCE_COLLECTION_BUSY', 'PERFORMANCE_COLLECTION_REFUSED', 'PROJECT_INPUT_INVALID', 'PERFORMANCE_COLLECTION_FAILED'] }, error: { type: 'string' } }, ['ok', 'code', 'error']);

export const FORGE_CAPABILITIES = [
  {
    id: 'expression.check',
    version: 1,
    title: 'Check an unsaved X4 expression',
    description: 'Run Forge expression rules and configured script property checks on one MD or AIScript expression.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', maxLength: EXPRESSION_CHECK_MAX_LENGTH },
        variableTypes: { type: 'object', additionalProperties: { type: 'string', maxLength: EXPRESSION_CHECK_HINT_MAX_LENGTH } },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' }, legal: { type: 'boolean' }, expression: { type: 'string' },
      problems: { type: 'array', items: { type: 'object', additionalProperties: true } },
      note: { type: 'string' },
    }, ['ok', 'legal', 'expression', 'problems']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/expressions/check', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-expression-check', 'Web Studio has no dedicated expression checker for this capability.'),
        disconnected('vscode-extension-expression-check', 'The extension has no dedicated UI caller for this capability.'),
      ],
      cli: [],
      mcp: [partial('check_expression', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "check_expression"', 'MCP displays up to 50 problems and reports the total count.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/expressions/check"')],
    },
  },
  {
    id: 'extensions.conflicts.analyze',
    version: 1,
    title: 'Analyze installed extension conflicts',
    description: 'Read installed-extension dependency and override evidence through the existing Extension Doctor.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      extensionsScanned: { type: 'number' },
      enabledCount: { type: 'number' },
      counts: { type: 'object', additionalProperties: true },
      findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
      loadOrder: { type: 'array', items: { type: 'string' } },
    }, ['success', 'extensionsScanned', 'enabledCount', 'findings']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/extension-doctor', inputLocation: 'none', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('extension-doctor', 'src/components/PackageModDoctor.tsx::/api/agent/extension-doctor'),
        connected('vscode-extension-doctor', 'vscode-extension/src/extension.ts::/api/agent/extension-doctor'),
      ],
      cli: [],
      mcp: [partial('check_conflicts', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "check_conflicts"', 'MCP returns a summarized view capped at 50 findings.')],
      agentApi: true,
      builtInHarness: [disconnected('extension-doctor', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/extension-doctor"')],
    },
  },
  {
    id: 'history.list',
    version: 1,
    title: 'List workspace activity history',
    description: 'Read the existing workspace-scoped action ledger and its honest ledger-failure state.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        outcome: { type: 'string' },
        file: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      workspaceId: { type: 'string' },
      rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
      total: { type: 'number' },
      ledgerFailures: { type: 'number' },
    }, ['ok', 'workspaceId', 'rows', 'total', 'ledgerFailures']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/history', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('source-control-history', 'src/components/AgentBridge.tsx::/api/agent/history?'),
        disconnected('vscode-extension-history', 'The VS Code/Antigravity extension has no activity-history view or canonical history.list caller.'),
      ],
      cli: [],
      mcp: [],
      agentApi: true,
      builtInHarness: [disconnected('activity-history', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/history"')],
    },
  },
  {
    id: 'history.revert',
    version: 1,
    title: 'Revert a workspace activity',
    description: 'Revert one eligible history entry. Recovery-receipt rows are one-use and CAS-checked; ordinary before-blob file reverts use the existing guarded writer and are not one-time CAS restores.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      revertedTo: { type: 'string' },
    }, ['ok', 'revertedTo']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['workspace-write', 'filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/history/:id/revert', inputLocation: 'path', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('source-control-history', 'src/components/AgentBridge.tsx::/api/agent/history/${row.id}/revert'),
        disconnected('vscode-extension-history-revert', 'The VS Code/Antigravity extension has no canonical history.revert action.'),
      ],
      cli: [],
      mcp: [],
      agentApi: true,
      builtInHarness: [disconnected('activity-history', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/history/:id/revert"')],
    },
  },
  {
    id: 'patch.readiness.analyze',
    version: 2,
    title: 'Analyze patch readiness',
    description: 'Check mod diff selectors against old and current X4 sources without writing either source.',
    inputSchema: {
      type: 'object',
      properties: {
        fromPath: { type: 'string' },
        oldRoot: { type: 'string' },
        newRoot: { type: 'string' },
      },
      required: ['fromPath', 'oldRoot'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      oldRoot: { type: 'string' },
      newRoot: { type: 'string' },
      diffFiles: { type: 'number' },
      summary: { type: 'object', additionalProperties: true },
      findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['oldRoot', 'newRoot', 'diffFiles', 'summary', 'findings']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/patch-readiness', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-patch-readiness', 'The engine and Agent API exist, but web Studio has no connected UI caller.'),
        disconnected('vscode-extension-patch-readiness', 'The VS Code/Antigravity extension has no connected patch-readiness caller.'),
      ],
      cli: [],
      mcp: [partial('check_patch_readiness', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "check_patch_readiness"', 'MCP returns only broken/removed findings and caps them at 50.')],
      agentApi: true,
      builtInHarness: [disconnected('patch-readiness', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/patch-readiness"')],
    },
  },
  {
    id: 'performance.collect',
    version: 1,
    title: 'Start bounded backend performance collection',
    description: 'Start an expiring in-memory collection for the owned Forge backend. This controls telemetry only; it does not run validation, execute commands or change workspace/configuration state.',
    inputSchema: { type: 'object', properties: {
      durationMs: { type: 'integer', description: 'Collection duration from 1000 to 900000 milliseconds; retained resource history stays bounded.' },
      intervalMs: { type: 'integer', description: 'Resource interval from 1000 to 60000 milliseconds.' },
      eventLoopDelay: { type: 'boolean', description: 'Opt in to event-loop delay monitoring for this bounded collection.' },
    }, additionalProperties: false },
    outputSchema: { ...objectOutput({ ...PERFORMANCE_COLLECTION_SUCCESS_SCHEMA.properties, ...PERFORMANCE_COLLECTION_FAILURE_SCHEMA.properties, ok: { type: 'boolean' } }, ['ok']), anyOf: [PERFORMANCE_COLLECTION_SUCCESS_SCHEMA, PERFORMANCE_COLLECTION_FAILURE_SCHEMA] },
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/performance/collection', inputLocation: 'body', role: 'primary' }],
    surfaces: { ui: [
      connected('performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance/collection'),
      disconnected('vscode-extension-performance-collection', 'No dedicated native extension control or host producer is connected; use the app Performance panel. Installed native-host qualification remains pending.'),
    ], cli: [], mcp: [partial('start_forge_performance_capture', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "start_forge_performance_capture"', 'Starts backend-only collection for at most 15 minutes with bounded retention. Returns bounded summaries; resource/operation attribution and unsupported producer coverage remain explicit.')], agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/performance/collection"')] },
  },
  {
    id: 'performance.profile',
    version: 1,
    title: 'Capture bounded backend function samples',
    description: 'Sample functions in the current Forge backend through its in-process inspector. No debugger port, raw profile, source content or persistent profile file is exposed. Native host and webview function profiling are outside this producer.',
    inputSchema: { type: 'object', properties: {
      durationMs: { type: 'integer', description: 'Requested duration from 100 to 5000 milliseconds; event-loop blockage can delay stopping.' },
      samplingIntervalMicros: { type: 'integer', description: 'Sampling interval from 1000 to 100000 microseconds.' },
      maxFunctions: { type: 'integer', description: 'Maximum returned function summaries from 1 to 64.' },
    }, additionalProperties: false },
    outputSchema: { ...objectOutput({ ...PERFORMANCE_PROFILE_SCHEMA.properties, ...PERFORMANCE_PROFILE_FAILURE_SCHEMA.properties, ok: { type: 'boolean' } }, ['ok']), anyOf: [PERFORMANCE_PROFILE_SCHEMA, PERFORMANCE_PROFILE_FAILURE_SCHEMA] },
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/performance/profile', inputLocation: 'body', role: 'primary' }],
    surfaces: { ui: [
      connected('performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance/profile'),
      disconnected('vscode-extension-performance-profile', 'No dedicated native extension control or host producer is connected; use the app Performance panel. Installed native-host qualification remains pending.'),
    ], cli: [], mcp: [partial('profile_forge_backend', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "profile_forge_backend"', 'Samples the current backend only, for at most 2000 milliseconds and 32 function summaries. Keeps omission/delay/coverage evidence; no raw profile or private source paths.')], agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/performance/profile"')] },
  },
  {
    id: 'performance.read',
    version: 1,
    title: 'Read Forge performance evidence',
    description: 'Read bounded performance snapshots and existing cache/status counters without starting collection, profiling, validation, scans or commands. Unknown and unsupported measurements remain explicit.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({ ok: { type: 'boolean', enum: [true] }, schemaVersion: { type: 'string', enum: ['forge.performance.report.v1'] }, backend: PERFORMANCE_SNAPSHOT_SCHEMA, control: PERFORMANCE_CONTROL_SCHEMA,
      caches: objectOutput({ projectValidation: objectOutput({ ...PERFORMANCE_CACHE_SCHEMA.properties, lua: PERFORMANCE_CACHE_SCHEMA, effectiveSchema: PERFORMANCE_CACHE_SCHEMA }, [...PERFORMANCE_CACHE_FIELDS, 'lua', 'effectiveSchema']) }, ['projectValidation']),
      coverage: objectOutput({ native: { type: 'string', enum: ['unavailable-not-wired'] }, webview: { type: 'string', enum: ['local-current-panel-only'] }, profiling: { type: 'string', enum: ['backend-only-explicit-control'] }, cacheBytes: { type: 'string', enum: ['accounted-not-exact-heap'] }, operations: { type: 'string', enum: ['instrumented-boundaries-only'] } }, ['native', 'webview', 'profiling', 'cacheBytes', 'operations']),
    }, ['ok', 'schemaVersion', 'backend', 'control', 'caches', 'coverage']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'GET', path: '/api/agent/performance', inputLocation: 'none', role: 'primary' }],
    surfaces: { ui: [
      connected('performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance'),
      disconnected('vscode-extension-performance-read', 'No dedicated native extension control or host producer is connected; use the app Performance panel. Installed native-host qualification remains pending.'),
    ], cli: [], mcp: [partial('get_forge_performance', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_forge_performance"', 'Returns backend summaries capped at 32 operations, 16 recent slow records and 20 latest resource samples, with totals and omission flags. Preserves unknown/unsupported producer and cache coverage; does not start a capture.')], agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/performance"')] },
  },
  {
    id: 'project.validate',
    version: 1,
    title: 'Validate an X4 extension project',
    description: 'Run the shared full-project deterministic referee over an inline project or a guarded mod folder.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'object', additionalProperties: true },
        fromPath: { type: 'string' },
        root: { type: 'string', enum: ['workspace', 'filesystem'] },
        recordBaseline: { type: 'boolean', enum: [false], default: false },
      },
      anyOf: [
        { required: ['project'] },
        { required: ['fromPath'] },
      ],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      summary: { type: 'object', additionalProperties: true },
      flat: { type: 'array', items: { type: 'object', additionalProperties: true } },
      capsules: { type: 'array', items: { type: 'object', additionalProperties: true } },
      source: { type: 'object', additionalProperties: true },
    }, ['ok', 'summary', 'flat', 'capsules', 'source']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      {
        method: 'POST',
        path: '/api/agent/project/validate/check',
        inputLocation: 'body',
        role: 'primary',
        fixedBody: { recordBaseline: false },
      },
    ],
    surfaces: {
      ui: [
        connected('project-diagnostics', 'src/App.tsx::/api/agent/project/validate/check'),
        connected('vscode-extension-diagnostics', 'vscode-extension/src/extension.ts::/api/agent/project/validate/check'),
      ],
      cli: [partial('validate:mod', 'scripts/x4validate.ts::game-object reference checks', 'CLI omits game-object reference checks that require the configured Forge corpus.')],
      mcp: [
        partial('validate_mod', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "validate_mod"', 'MCP caps the canonical findings list at 100.'),
        partial('author_check', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "author_check"', 'MCP caps findings at 100 and capsules at 50.'),
        partial('stage_and_validate', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "stage_and_validate"', 'MCP caps remediation capsules at 100.'),
      ],
      agentApi: true,
      builtInHarness: [disconnected('project-validation-referee', 'The architect has local vetting but no canonical capability dispatcher binding.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/project/validate/check"')],
    },
  },
  {
    id: 'project.xml.references',
    version: 1,
    title: 'Analyze XML file references',
    description: 'Read a bounded XML file-reference map from inline workspace/project documents or the explicitly addressed saved workspace, using the configured game corpus and shared schema knowledge. Inline workspace and project are mutually exclusive; neither selects the addressed saved workspace. This is source navigation, not runtime loading or validation proof.',
    inputSchema: {
      type: 'object',
      properties: {
        ...XML_REFERENCE_OPTIONS,
        workspace: { type: 'object', additionalProperties: true },
        project: { type: 'object', additionalProperties: true },
      },
      anyOf: [
        { type: 'object', properties: { ...XML_REFERENCE_OPTIONS, workspace: { type: 'object', additionalProperties: true } }, required: ['workspace'], additionalProperties: false },
        { type: 'object', properties: { ...XML_REFERENCE_OPTIONS, project: { type: 'object', additionalProperties: true } }, required: ['project'], additionalProperties: false },
        { type: 'object', properties: XML_REFERENCE_OPTIONS, additionalProperties: false },
      ],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' }, schemaVersion: { type: 'string', enum: ['forge.xml-reference-map.v1'] }, signature: { type: 'string' },
      files: { type: 'array', items: XML_REFERENCE_FILE_SCHEMA },
      nodes: { type: 'array', items: XML_REFERENCE_FILE_SCHEMA },
      edges: { type: 'array', items: objectOutput({
        id: { type: 'string' }, sourceId: { type: 'string' }, targetId: { type: 'string' },
        targetIds: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string', enum: ['macro', 'component', 'ware', 'bullet', 'index-file', 'local-connection', 'unknown'] },
        symbol: { type: 'string' }, status: { type: 'string', enum: ['resolved', 'missing', 'ambiguous', 'dynamic', 'unsupported', 'incomplete'] },
        reason: { type: 'string' }, location: XML_REFERENCE_LOCATION_SCHEMA,
        candidates: { type: 'array', items: objectOutput({
          fileId: { type: 'string' }, origin: { type: 'string', enum: ['project', 'reference'] }, path: { type: 'string' },
        }, ['fileId', 'origin', 'path']) },
      }, ['id', 'sourceId', 'targetIds', 'kind', 'symbol', 'status', 'location']) },
      coverage: objectOutput({
        scope: { type: 'string' }, incomingScope: { type: 'string' }, scannedFiles: { type: 'integer' },
        scannedProjectFiles: { type: 'integer' }, scannedReferenceFiles: { type: 'integer' }, knownProjectFiles: { type: 'integer' },
        truncated: { type: 'boolean' }, reasons: { type: 'array', items: { type: 'string' } },
        unsupported: { type: 'integer' }, incomplete: { type: 'integer' },
        limits: objectOutput({
          maxDepth: { type: 'integer' }, maxNodes: { type: 'integer' }, maxEdges: { type: 'integer' }, maxDocuments: { type: 'integer' },
          maxDocumentBytes: { type: 'integer' }, maxTotalBytes: { type: 'integer' }, maxPreviewChars: { type: 'integer' }, maxResponseBytes: { type: 'integer' },
        }, ['maxDepth', 'maxNodes', 'maxEdges', 'maxDocuments', 'maxDocumentBytes', 'maxTotalBytes', 'maxPreviewChars', 'maxResponseBytes']),
      }, ['scope', 'incomingScope', 'scannedFiles', 'scannedProjectFiles', 'scannedReferenceFiles', 'knownProjectFiles', 'truncated', 'reasons', 'unsupported', 'incomplete', 'limits']),
      preview: objectOutput({
        fileId: { type: 'string' }, origin: { type: 'string', enum: ['project', 'reference'] }, path: { type: 'string' },
        sha256: { type: 'string' }, content: { type: 'string' }, startLine: { type: 'integer' }, truncated: { type: 'boolean' },
        locationKind: { type: 'string', enum: ['authored'] }, line: { type: 'integer' }, column: { type: 'integer' },
      }, ['fileId', 'origin', 'path', 'sha256', 'content', 'startLine', 'truncated', 'locationKind']),
      context: objectOutput({
        inputMode: { type: 'string' }, inputFingerprint: { type: 'string' }, workspaceId: { type: 'string' },
        corpusSignature: { type: 'string' }, corpusGeneration: { type: 'string' }, usedSourceSignature: { type: 'string' }, nativeSourceFolder: { type: 'string' },
      }, []),
    }, ['ok', 'schemaVersion', 'signature', 'files', 'nodes', 'edges', 'coverage']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/project/xml-references', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('xml-reference-view', 'src/components/XmlReferenceView.tsx::/api/agent/project/xml-references'),
        disconnected('vscode-extension-xml-reference-view', 'The extension has no dedicated XML-reference command. Installed native-host qualification remains pending.'),
      ],
      cli: [],
      mcp: [partial('get_xml_references', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_xml_references"', 'Requires current capability discovery and an explicitly bound saved workspace plus focus. Omits source preview and source/native paths; caps depth at 2, nodes at 60, edges at 120, file metadata at 256 and target/candidate IDs per edge at 16. Reports original totals and projection truncation; rejects projections above 512 KiB UTF-8.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/project/xml-references"')],
    },
  },
  {
    id: 'readiness.read',
    version: 1,
    title: 'Read Forge readiness',
    description: 'Read the existing machine-evidence readiness ladder for the addressed workspace.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({
      workspaceId: { type: 'string' },
      workspace: { type: 'string' },
      modId: { type: 'string' },
      stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
      note: { type: 'string' },
    }, ['workspaceId', 'workspace', 'modId', 'stages', 'note']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/readiness', inputLocation: 'none', role: 'primary' },
    ],
    surfaces: {
      ui: [
        partial('readiness-badge', 'src/App.tsx::buildReadinessStages', 'The visible ladder uses the same evidence model locally rather than the Agent API projection.'),
        disconnected('vscode-extension-readiness', 'The VS Code/Antigravity extension has no canonical readiness.read caller.'),
      ],
      cli: [],
      mcp: [connected('readiness', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "readiness"')],
      agentApi: true,
      builtInHarness: [disconnected('readiness', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/readiness"')],
    },
  },
  {
    id: 'runtime.debug.read',
    version: 1,
    title: 'Read addressed runtime-debugger evidence',
    description: 'Read the existing bounded deterministic runtime-debugger payload for the explicitly addressed workspace, including honest session, verdict, coverage, expected-step, incident, ambiguity, and unrelated-extension evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        expect: { type: 'string', maxLength: 256, description: 'Optional comma-separated expected cue or marker names evaluated in the addressed runtime session. Maximum 256 characters.' },
      },
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      schemaVersion: { type: 'number' },
      authority: { type: 'object', additionalProperties: true },
      identity: { type: 'object', additionalProperties: true },
      session: { type: 'object', additionalProperties: true },
      incidents: { type: 'array', items: { type: 'object', additionalProperties: true } },
      coverage: { type: 'object', additionalProperties: true },
      expectedSteps: { type: 'array', items: { type: 'object', additionalProperties: true } },
      hiddenOtherModCount: { type: 'number' },
      ambiguousCount: { type: 'number' },
      hiddenOtherModSummary: { type: 'string' },
      verdict: { type: 'object', additionalProperties: true },
    }, [
      'schemaVersion',
      'authority',
      'identity',
      'session',
      'incidents',
      'coverage',
      'expectedSteps',
      'hiddenOtherModCount',
      'ambiguousCount',
      'hiddenOtherModSummary',
      'verdict',
    ]),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/runtime-debugger', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        partial('studio-debug-watcher', 'src/App.tsx::/api/agent/debug-watcher/brief', 'Studio retains the compatibility envelope; canonical callers receive the addressed runtime payload directly.'),
      ],
      cli: [],
      mcp: [connected('runtime_debugger', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "runtime_debugger"')],
      agentApi: true,
      builtInHarness: [disconnected('runtime-debugger', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/runtime-debugger"')],
    },
  },
  {
    id: 'schema.domains.list',
    version: 1,
    title: 'List X4 schema domains',
    description: 'Read the discovered XSD domain registry and include-chain status.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Optional schema domain whose element index should be included.' },
        refresh: { type: 'string', enum: ['0', '1'], default: '0' },
      },
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      roots: { type: 'array', items: { type: 'string' } },
      domainCount: { type: 'number' },
      domains: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['roots', 'domainCount', 'domains']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: true, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/schema-registry', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('schema-status', 'src/components/Sidebar.tsx::/api/agent/schema-registry'),
        connected('vscode-extension-schema-status', 'vscode-extension/src/extension.ts::/api/agent/schema-registry'),
      ],
      cli: [],
      mcp: [partial('list_schema_domains', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_schema_domains"', 'MCP omits domain/refresh inputs and reduces include chains to counts.')],
      agentApi: true,
      builtInHarness: [disconnected('schema-registry', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/schema-registry"')],
    },
  },
  {
    id: 'schema.element.explain',
    version: 1,
    title: 'Explain an X4 schema element',
    description: 'Combine schema-derived hover and attribute evidence for one MD or AI-script element.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        file: { type: 'string', default: 'md/x.xml' },
      },
      required: ['tag'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      domain: { type: 'string' },
      tag: { type: 'string' },
      known: { type: 'boolean' },
      requiredAttrs: { type: 'array', items: { type: 'string' } },
      attrCount: { type: 'number' },
      attrs: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['domain', 'tag', 'known', 'requiredAttrs', 'attrCount', 'attrs']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: true, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/lang/element-explain', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        partial('editor-inspector', 'src/components/PropertiesInspector.tsx::selectedNode.propertiesSchema', 'The inspector renders local schema evidence but does not call the combined hover/attributes capability.'),
        partial('vscode-extension-intellisense', 'vscode-extension/src/extension.ts::langGet', 'Native IntelliSense uses the separate completion, attributes, and hover routes rather than the combined endpoint.'),
      ],
      cli: [],
      mcp: [connected('explain_element', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "explain_element"')],
      agentApi: true,
      builtInHarness: [disconnected('schema-language-service', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/lang/element-explain"')],
    },
  },
  {
    id: 'workspace.compile',
    version: 2,
    title: 'Compile a workspace in memory',
    description: 'Generate and validate an in-memory manifest without writing the game. success reflects validation.ok; failed validation retains preview files and diagnostics with PROJECT_VALIDATION_FAILED. generation.success reports generation only.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'object', additionalProperties: true },
        fileOverrides: {
          type: 'object',
          description: 'Optional project-relative string file contents overlaid in memory before validation.',
          additionalProperties: { type: 'string' },
        },
      },
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      generation: { type: 'object', properties: { success: { type: 'boolean' } }, required: ['success'], additionalProperties: false },
      status: { type: 'string' },
      code: { type: 'string' },
      error: { type: 'string' },
      failedStages: { type: 'array', items: { type: 'string' } },
      modId: { type: 'string' },
      file_count: { type: 'number' },
      files: { type: 'object', additionalProperties: true },
      diagnostics: { type: 'array', items: { type: 'object', additionalProperties: true } },
      validation: { type: 'object', additionalProperties: true },
    }, ['success', 'modId', 'file_count', 'files', 'diagnostics', 'validation']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/compile', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('compile', 'src/App.tsx::/api/agent/compile'),
        disconnected('vscode-extension-compile', 'The VS Code/Antigravity extension has no canonical workspace.compile caller.'),
      ],
      cli: [],
      mcp: [partial('compile_workspace', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "compile_workspace"', 'MCP omits inline workspace/fileOverrides, returns file names rather than contents, and caps diagnostics at 100.')],
      agentApi: true,
      builtInHarness: [disconnected('workspace-compiler', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/compile"')],
    },
  },
  {
    id: 'workspace.generate.preview',
    version: 1,
    title: 'Preview AI workspace generation',
    description: 'Use the existing provider workflow in non-applying mode; this can spend and use the network but cannot commit workspace state.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        currentWorkspace: { type: 'object', additionalProperties: true },
        apply: { type: 'boolean', enum: [false], default: false },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      message: { type: 'string' },
      applied: { type: 'boolean', enum: [false] },
      workspace: { type: 'object', additionalProperties: true },
      diagnostics: { type: 'array', items: { type: 'object', additionalProperties: true } },
      requirements: { type: 'array', items: { type: 'object', additionalProperties: true } },
      repair: { type: 'object', additionalProperties: true },
    }, ['success', 'message', 'applied', 'workspace', 'diagnostics', 'requirements', 'repair']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['read', 'analyze', 'network', 'spend', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      {
        method: 'POST',
        path: '/api/agent/generate/preview',
        inputLocation: 'body',
        role: 'primary',
        fixedBody: { apply: false },
      },
    ],
    surfaces: {
      ui: [
        connected('ai-engine', 'src/App.tsx::/api/agent/generate/preview'),
        disconnected('vscode-extension-generate-preview', 'The VS Code/Antigravity extension has no canonical workspace.generate.preview caller.'),
      ],
      cli: [],
      mcp: [],
      agentApi: true,
      builtInHarness: [connected('proposal-preview', 'src/App.tsx::onRunArchitectStep={runArchitectStep}')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/generate/preview"')],
    },
  },
  {
    id: 'workspace.read',
    version: 2,
    title: 'Read the addressed workspace',
    description: 'Read the workspace selected by immutable workspace identity and return its version, CAS head, and complete snapshot evidence.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({
      workspaceId: { type: 'string' },
      workspace: { type: 'object', additionalProperties: true },
      version: { type: 'number' },
      workspaceHash: { type: 'string' },
      snapshotHash: { type: 'string' },
      lastUpdated: { type: 'string' },
      origin: { type: 'string' },
    }, ['workspaceId', 'workspace', 'version', 'workspaceHash', 'snapshotHash', 'lastUpdated', 'origin']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/workspace', inputLocation: 'none', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('workspace-sync', 'src/App.tsx::/api/agent/workspace'),
        connected('vscode-extension-workspace', 'vscode-extension/src/extension.ts::/api/agent/workspace'),
      ],
      cli: [],
      mcp: [partial('get_workspace', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_workspace"', 'MCP returns both hashes plus a summary capped at 50 nodes rather than the full workspace.')],
      agentApi: true,
      builtInHarness: [disconnected('workspace-context', 'The architect reads React workspace state directly; no canonical capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/workspace"')],
    },
  },
] as const satisfies readonly ForgeCapabilityDescriptorV1[];

export function canonicalCapabilityContractPayload(
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): string {
  return stableStringify({
    schemaVersion: FORGE_CAPABILITY_SCHEMA_VERSION,
    capabilities,
  });
}

export function buildForgeCapabilityContract(
  sha256: (canonicalPayload: string) => string,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): ForgeCapabilityContractV1 {
  const contractHash = sha256(canonicalCapabilityContractPayload(capabilities));
  if (!/^[a-f0-9]{64}$/i.test(contractHash)) {
    throw new Error('Capability contract hash provider must return a 64-character SHA-256 hex digest.');
  }
  return {
    schemaVersion: FORGE_CAPABILITY_SCHEMA_VERSION,
    contractHash: contractHash.toLowerCase(),
    capabilities,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const JSON_SCHEMA_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
const CONTEXT_REQUIREMENTS = new Set<ForgeContextRequirement>(['none', 'optional', 'required']);
const AGENT_SCOPES = new Set<ForgeAgentScope>(['read', 'write', 'deploy']);
const CAPABILITY_EFFECTS = new Set<ForgeCapabilityEffect>(FORGE_CAPABILITY_EFFECTS);
const CONFIRMATION_POLICIES = new Set<ForgeConfirmationPolicy>(['none', 'preview-required', 'human-only']);
const API_INPUT_LOCATIONS = new Set<ForgeApiInputLocation>(['none', 'query', 'body', 'path', 'path-and-query']);
const API_BINDING_ROLES = new Set<ForgeApiBindingRole>(['primary', 'supporting']);
const SURFACE_STATUSES = new Set<ForgeSurfaceProjectionStatus>(['connected', 'partial', 'disconnected']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown, allowed?: ReadonlySet<string>): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && (!allowed || allowed.has(item)));
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isLiteralForgeApiPath(value: unknown): value is string {
  if (typeof value !== 'string' ||
    !/^\/api(?:\/(?:[A-Za-z0-9._~-]+|:[A-Za-z_][A-Za-z0-9_]*))+$/.test(value)) return false;
  return value.split('/').slice(2).every(segment => segment !== '.' && segment !== '..');
}

function forgeJsonValueMatchesSchema(schema: ForgeJsonSchema, value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (schema.anyOf?.length && !schema.anyOf.some(candidate => forgeJsonValueMatchesSchema(candidate, value, depth + 1))) {
    return false;
  }
  if (schema.enum && !schema.enum.some(candidate => Object.is(candidate, value))) return false;
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = (type: string): boolean => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return isRecord(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
  };
  if (types.length && !types.some(matchesType)) return false;
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  if (isRecord(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return false;
    for (const [key, child] of Object.entries(value)) {
      const properties = schema.properties;
      const childSchema = properties && Object.hasOwn(properties, key) ? properties[key] : undefined;
      if (childSchema !== undefined) {
        if (!forgeJsonValueMatchesSchema(childSchema, child, depth + 1)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object' &&
        !forgeJsonValueMatchesSchema(schema.additionalProperties, child, depth + 1)) return false;
    }
  }
  if (Array.isArray(value) && schema.items &&
    !value.every(child => forgeJsonValueMatchesSchema(schema.items!, child, depth + 1))) return false;
  return true;
}

function isForgeJsonSchema(value: unknown, depth = 0): value is ForgeJsonSchema {
  if (!isRecord(value) || depth > 24) return false;
  if (value.type !== undefined) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!isStringArray(types, JSON_SCHEMA_TYPES) || types.length === 0 || !hasUniqueStrings(types)) return false;
  }
  if (value.description !== undefined && typeof value.description !== 'string') return false;
  if (value.maxLength !== undefined && (typeof value.maxLength !== 'number' || !Number.isSafeInteger(value.maxLength) || value.maxLength < 0)) return false;
  if (value.properties !== undefined) {
    if (!isRecord(value.properties) || !Object.values(value.properties).every(schema => isForgeJsonSchema(schema, depth + 1))) return false;
  }
  if (value.required !== undefined) {
    if (!isStringArray(value.required) || !hasUniqueStrings(value.required)) return false;
    const properties = value.properties;
    if (properties !== undefined && (!isRecord(properties) || !value.required.every(key => Object.hasOwn(properties, key)))) return false;
  }
  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== 'boolean' &&
    !isForgeJsonSchema(value.additionalProperties, depth + 1)) return false;
  if (value.items !== undefined && !isForgeJsonSchema(value.items, depth + 1)) return false;
  if (value.enum !== undefined && !Array.isArray(value.enum)) return false;
  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf) || value.anyOf.length === 0 || !value.anyOf.every(schema => isForgeJsonSchema(schema, depth + 1))) return false;
  }
  return true;
}

function isForgeApiBinding(value: unknown): value is ForgeCapabilityApiBinding {
  if (!isRecord(value) || !['GET', 'POST'].includes(String(value.method)) ||
    !isLiteralForgeApiPath(value.path) ||
    !API_INPUT_LOCATIONS.has(value.inputLocation as ForgeApiInputLocation) ||
    !API_BINDING_ROLES.has(value.role as ForgeApiBindingRole)) return false;
  if (value.fixedBody !== undefined && (!isRecord(value.fixedBody) || value.inputLocation !== 'body')) return false;
  return true;
}

function schemaDeclaresCallerInput(schema: ForgeJsonSchema): boolean {
  if (Object.keys(schema.properties || {}).length > 0 || (schema.required?.length || 0) > 0 ||
    schema.additionalProperties === true || (schema.additionalProperties !== undefined && typeof schema.additionalProperties === 'object')) return true;
  return schema.anyOf?.some(branch => schemaDeclaresCallerInput(branch)) === true;
}

function isForgeSurfaceProjection(value: unknown): value is ForgeSurfaceProjection {
  if (!isRecord(value) || !isNonEmptyString(value.id) ||
    !SURFACE_STATUSES.has(value.status as ForgeSurfaceProjectionStatus)) return false;
  if (value.anchor !== undefined && typeof value.anchor !== 'string') return false;
  if (value.note !== undefined && typeof value.note !== 'string') return false;
  if (value.status === 'connected' || value.status === 'partial') {
    if (!isNonEmptyString(value.anchor) || !value.anchor.includes('::')) return false;
  } else if (value.anchor !== undefined) return false;
  if ((value.status === 'partial' || value.status === 'disconnected') && !isNonEmptyString(value.note)) return false;
  return true;
}

function isForgeCapabilityDescriptorV1(value: unknown): value is ForgeCapabilityDescriptorV1 {
  if (!isRecord(value) ||
    !isNonEmptyString(value.id) || !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(value.id) ||
    typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1 ||
    !isNonEmptyString(value.title) || !isNonEmptyString(value.description) ||
    !isForgeJsonSchema(value.inputSchema) || !isForgeJsonSchema(value.outputSchema) ||
    value.inputSchema.type !== 'object' || value.outputSchema.type !== 'object' ||
    !isRecord(value.outputSchema.properties) || !Array.isArray(value.outputSchema.required) || value.outputSchema.required.length === 0 ||
    !isRecord(value.context) || !CONTEXT_REQUIREMENTS.has(value.context.workspace as ForgeContextRequirement) ||
    !CONTEXT_REQUIREMENTS.has(value.context.profile as ForgeContextRequirement) ||
    !isRecord(value.access) || typeof value.access.public !== 'boolean' || value.access.studioSession !== true ||
    !isStringArray(value.access.agentScopes, AGENT_SCOPES) || !hasUniqueStrings(value.access.agentScopes) ||
    !isStringArray(value.effects, CAPABILITY_EFFECTS) || value.effects.length === 0 || !hasUniqueStrings(value.effects) ||
    !CONFIRMATION_POLICIES.has(value.confirmation as ForgeConfirmationPolicy) ||
    !Array.isArray(value.apiBindings) || value.apiBindings.length === 0 || !value.apiBindings.every(isForgeApiBinding) ||
    !isRecord(value.surfaces) || value.surfaces.agentApi !== true) return false;
  if (value.access.public && !value.access.agentScopes.includes('read')) return false;
  const primaryBindings = value.apiBindings.filter(binding => binding.role === 'primary');
  if (primaryBindings.length !== 1) return false;
  const declaresCallerInput = schemaDeclaresCallerInput(value.inputSchema);
  if ((primaryBindings[0].inputLocation === 'none') === declaresCallerInput) return false;
  const bindingKeys = value.apiBindings.map(binding => `${binding.method} ${binding.path}`);
  if (!hasUniqueStrings(bindingKeys)) return false;
  for (const binding of value.apiBindings) {
    for (const [key, fixedValue] of Object.entries(binding.fixedBody || {})) {
      const property = value.inputSchema.properties?.[key];
      if (!property || !forgeJsonValueMatchesSchema(property, fixedValue)) return false;
    }
  }
  for (const surface of ['ui', 'cli', 'mcp', 'builtInHarness', 'externalAgents'] as const) {
    const projections = value.surfaces[surface];
    if (!Array.isArray(projections) || !projections.every(isForgeSurfaceProjection)) return false;
    if (!hasUniqueStrings(projections.map(projection => projection.id))) return false;
  }
  return true;
}

/** Browser-safe shape check. Hash recomputation is intentionally separate and async. */
export function isForgeCapabilityContractV1(value: unknown): value is ForgeCapabilityContractV1 {
  if (!isRecord(value) ||
    !hasExactKeys(value, ['capabilities', 'contractHash', 'schemaVersion']) ||
    value.schemaVersion !== FORGE_CAPABILITY_SCHEMA_VERSION ||
    typeof value.contractHash !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.contractHash) ||
    !Array.isArray(value.capabilities)) return false;
  const identities = new Set<string>();
  const stableIds = new Set<string>();
  const bindings = new Set<string>();
  const mcpAliases = new Set<string>();
  for (const capability of value.capabilities) {
    if (!isForgeCapabilityDescriptorV1(capability)) return false;
    const identity = `${capability.id}@${capability.version}`;
    if (identities.has(identity) || stableIds.has(capability.id)) return false;
    identities.add(identity);
    stableIds.add(capability.id);
    for (const binding of capability.apiBindings) {
      const key = `${binding.method} ${binding.path}`;
      if (bindings.has(key)) return false;
      bindings.add(key);
    }
    for (const projection of capability.surfaces.mcp) {
      if (mcpAliases.has(projection.id)) return false;
      mcpAliases.add(projection.id);
    }
  }
  const sortedIds = [...stableIds].sort();
  if (value.capabilities.some((capability, index) => capability.id !== sortedIds[index])) return false;
  return true;
}

export async function verifyForgeCapabilityContract(value: unknown): Promise<boolean> {
  if (!isForgeCapabilityContractV1(value) || !globalThis.crypto?.subtle) return false;
  const payload = canonicalCapabilityContractPayload(value.capabilities);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return actual === value.contractHash.toLowerCase();
}

export function findForgeCapability(
  id: string,
  version = 1,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): ForgeCapabilityDescriptorV1 | undefined {
  return capabilities.find(capability => capability.id === id && capability.version === version);
}

export function applyForgeCapabilityFixedBody(
  id: string,
  input: unknown,
  version = 1,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): Record<string, unknown> {
  const capability = findForgeCapability(id, version, capabilities);
  if (!capability) throw new Error(`Unknown Forge capability: ${id}@${version}`);
  const primary = capability.apiBindings.find(binding => binding.role === 'primary');
  if (!primary || primary.inputLocation !== 'body') throw new Error(`${id}@${version} has no primary body binding.`);
  const body = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return { ...body, ...(primary.fixedBody || {}) };
}

export function validateForgeCapabilityRegistry(
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
): string[] {
  const errors: string[] = [];
  const identities = new Set<string>();
  const stableIds = new Map<string, number>();
  const bindings = new Map<string, string>();
  const mcpAliases = new Map<string, string>();
  const sortedIds = capabilities.map(capability => capability.id).sort();

  capabilities.forEach((capability, index) => {
    const identity = `${capability.id}@${capability.version}`;
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(capability.id)) {
      errors.push(`${identity}: id must be a lower-case dotted identifier.`);
    }
    if (!Number.isInteger(capability.version) || capability.version < 1) {
      errors.push(`${identity}: version must be a positive integer.`);
    }
    if (identities.has(identity)) errors.push(`${identity}: duplicate capability identity.`);
    identities.add(identity);
    const priorVersion = stableIds.get(capability.id);
    if (priorVersion !== undefined) errors.push(`${identity}: duplicate stable capability id already declared at version ${priorVersion}.`);
    else stableIds.set(capability.id, capability.version);
    if (sortedIds[index] !== capability.id) {
      errors.push(`${identity}: registry must remain sorted by id for reviewable deterministic output.`);
    }
    if (capability.apiBindings.filter(binding => binding.role === 'primary').length !== 1) {
      errors.push(`${identity}: exactly one primary API binding is required.`);
    }
    const primary = capability.apiBindings.find(binding => binding.role === 'primary');
    const declaresCallerInput = schemaDeclaresCallerInput(capability.inputSchema);
    if (primary?.inputLocation === 'none' && declaresCallerInput) {
      errors.push(`${identity}: input schema declares caller input but the primary binding inputLocation is none.`);
    } else if (primary && primary.inputLocation !== 'none' && !declaresCallerInput) {
      errors.push(`${identity}: primary binding declares ${primary.inputLocation} input but the input schema declares no caller input.`);
    }
    if (!capability.effects.length) errors.push(`${identity}: at least one effect classification is required.`);
    if (capability.outputSchema.type !== 'object' || !capability.outputSchema.properties || !capability.outputSchema.required?.length) {
      errors.push(`${identity}: output schema must declare a versioned object envelope with required fields.`);
    } else {
      for (const key of capability.outputSchema.required) {
        if (!Object.hasOwn(capability.outputSchema.properties, key)) errors.push(`${identity}: output schema requires undeclared field ${key}.`);
      }
    }
    if (capability.access.public && !capability.access.agentScopes.includes('read')) {
      errors.push(`${identity}: public capability must also describe read-scoped agent access.`);
    }
    for (const binding of capability.apiBindings) {
      const key = `${binding.method} ${binding.path}`;
      const prior = bindings.get(key);
      if (prior) errors.push(`${key}: duplicate API binding in ${prior} and ${capability.id}.`);
      else bindings.set(key, capability.id);
      if (!isLiteralForgeApiPath(binding.path)) {
        errors.push(`${identity}: API binding path must be one literal /api route without query, fragment, whitespace, traversal, or encoded segments.`);
      }
      if (binding.fixedBody && binding.inputLocation !== 'body') {
        errors.push(`${identity}: fixedBody is only valid for a body binding.`);
      }
      for (const [key, value] of Object.entries(binding.fixedBody || {})) {
        const property = capability.inputSchema.properties?.[key];
        if (!property) errors.push(`${identity}: fixedBody field ${key} is absent from the input schema.`);
        else if (!forgeJsonValueMatchesSchema(property, value)) {
          errors.push(`${identity}: fixedBody field ${key} does not match its input schema.`);
        }
      }
    }
    const surfaceGroups = [
      ['ui', capability.surfaces.ui],
      ['cli', capability.surfaces.cli],
      ['mcp', capability.surfaces.mcp],
      ['builtInHarness', capability.surfaces.builtInHarness],
      ['externalAgents', capability.surfaces.externalAgents],
    ] as const;
    for (const [surface, projections] of surfaceGroups) {
      const ids = new Set<string>();
      for (const projection of projections) {
        if (!projection.id?.trim()) errors.push(`${identity}: ${surface} projection id is required.`);
        if (ids.has(projection.id)) errors.push(`${identity}: duplicate ${surface} projection ${projection.id}.`);
        ids.add(projection.id);
        if (!['connected', 'partial', 'disconnected'].includes(projection.status)) {
          errors.push(`${identity}: ${surface}/${projection.id} has invalid status ${String(projection.status)}.`);
        }
        if (projection.status === 'connected' || projection.status === 'partial') {
          if (!projection.anchor?.includes('::')) errors.push(`${identity}: ${surface}/${projection.id} requires a file::token anchor.`);
        } else if (projection.anchor) {
          errors.push(`${identity}: disconnected ${surface}/${projection.id} must not claim an implementation anchor.`);
        }
        if ((projection.status === 'partial' || projection.status === 'disconnected') && !projection.note?.trim()) {
          errors.push(`${identity}: ${surface}/${projection.id} ${projection.status} status requires an explanatory note.`);
        }
        if (surface === 'mcp') {
          const prior = mcpAliases.get(projection.id);
          if (prior) errors.push(`${identity}: MCP alias ${projection.id} is already owned by ${prior}.`);
          else mcpAliases.set(projection.id, capability.id);
        }
      }
    }
  });
  return errors;
}
