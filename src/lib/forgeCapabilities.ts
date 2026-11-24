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
  readonly minimum?: number;
  readonly maximum?: number;
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
  additionalProperties = true,
): ForgeJsonSchema {
  return { type: 'object', properties, required, additionalProperties };
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

// Native telemetry has a separate public contract. Backend v1 schemas stay unchanged.
const NATIVE_PERFORMANCE_ID_SCHEMA: ForgeJsonSchema = {
  type: 'string', maxLength: 128, description: 'Exact process/capture identity: 8–128 ASCII letters, digits, underscores or hyphens.',
};
const NATIVE_PERFORMANCE_PRODUCER_SCHEMA = objectOutput({
  component: { type: 'string', enum: ['extension-host'] }, scope: { type: 'string', enum: ['shared-process'] },
  pid: { type: 'number' }, instanceId: NATIVE_PERFORMANCE_ID_SCHEMA,
}, ['component', 'scope', 'pid', 'instanceId'], false);
const NATIVE_PERFORMANCE_SNAPSHOT_SCHEMA: ForgeJsonSchema = {
  ...PERFORMANCE_SNAPSHOT_SCHEMA, additionalProperties: false,
  properties: { ...PERFORMANCE_SNAPSHOT_SCHEMA.properties, producer: NATIVE_PERFORMANCE_PRODUCER_SCHEMA },
};
const NATIVE_PERFORMANCE_STATUS_PROPERTIES: Record<string, ForgeJsonSchema> = {
  schemaVersion: { type: 'string', enum: ['forge.native-performance.status.v1'] }, producer: NATIVE_PERFORMANCE_PRODUCER_SCHEMA,
  disposed: { type: 'boolean' }, collectionActive: { type: 'boolean' }, captureId: { anyOf: [NATIVE_PERFORMANCE_ID_SCHEMA, { type: 'null' }] },
  ...performanceNumbers(['collectionStartedAtUnixMs', 'collectionExpiresAtUnixMs', 'collectionStopDelayMs'], true),
  ...performanceNumbers(['intervalMs', 'resourceSamples', 'resourceErrors', 'throttledSamples', 'counterResets', 'sampleOverheadMs', 'ownedTimerCount', 'failedTimerCount']),
  eventLoopDelayMonitoring: { type: 'boolean' }, collectionCleanupUnconfirmed: { type: 'boolean' },
  lastResourceError: { type: ['string', 'null'], enum: [null, 'unavailable', 'producer-identity-changed', 'clock-unavailable'] },
  lastStopReason: { type: ['string', 'null'], enum: [null, 'requested', 'expired', 'cancelled', 'retired', 'disposed'] },
};
const NATIVE_PERFORMANCE_STATUS_SCHEMA = objectOutput(NATIVE_PERFORMANCE_STATUS_PROPERTIES, Object.keys(NATIVE_PERFORMANCE_STATUS_PROPERTIES), false);
const NATIVE_PERFORMANCE_AVAILABILITY: ForgeJsonSchema = { type: 'string', enum: ['unavailable', 'waiting', 'ready', 'retired'] };
const NATIVE_PERFORMANCE_UNAVAILABLE_REASON: ForgeJsonSchema = {
  type: ['string', 'null'], enum: [null, 'transport-absent', 'contract-invalid', 'waiting', 'ready-timeout', 'producer-disposed', 'retired', 'authority-revoked'],
};
const NATIVE_PERFORMANCE_CODES: ForgeJsonSchema = { type: 'string', enum: [
  'NATIVE_PERFORMANCE_INPUT_INVALID', 'NATIVE_PERFORMANCE_BUSY', 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH',
  'NATIVE_PERFORMANCE_IDENTITY_MISMATCH', 'NATIVE_PERFORMANCE_PREEMPTED', 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED',
  'NATIVE_PERFORMANCE_DISPOSED', 'NATIVE_PERFORMANCE_UNAVAILABLE', 'NATIVE_PERFORMANCE_RETIRED',
  'NATIVE_PERFORMANCE_AUTHORITY_REVOKED', 'NATIVE_PERFORMANCE_NOT_OWNER', 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT',
  'NATIVE_PERFORMANCE_ABORTED', 'NATIVE_PERFORMANCE_PROTOCOL_ERROR', 'NATIVE_PERFORMANCE_READER_LIMIT',
  'NATIVE_PERFORMANCE_START_FAILED', 'NATIVE_PERFORMANCE_REQUEST_FAILED',
] };
function nativePerformanceReportSchema(operation: 'read' | 'start' | 'stop'): ForgeJsonSchema {
  const brokerProperties: Record<string, ForgeJsonSchema> = {
    schemaVersion: { type: 'string', enum: ['forge.native-performance.broker.v1'] }, backendInstanceId: NATIVE_PERFORMANCE_ID_SCHEMA,
    availability: NATIVE_PERFORMANCE_AVAILABILITY, unavailableReason: NATIVE_PERFORMANCE_UNAVAILABLE_REASON,
    native: { anyOf: [NATIVE_PERFORMANCE_STATUS_SCHEMA, { type: 'null' }] },
    pending: { type: ['string', 'null'], enum: [null, 'read', 'start', 'stop'] }, cancellation: { type: 'string', enum: ['none', 'pending', 'unknown'] },
    cleanupUnconfirmed: { type: 'boolean' }, orphaned: { type: 'boolean' }, captureOwned: { type: 'boolean' },
    ...performanceNumbers(['readSubscribers', 'rejectedMessages', 'lateResults', 'droppedSnapshots']),
    snapshot: operation === 'read' ? { anyOf: [NATIVE_PERFORMANCE_SNAPSHOT_SCHEMA, { type: 'null' }] } : { type: 'null' },
    snapshotAgeMs: operation === 'read' ? PERFORMANCE_NULLABLE_NUMBER : { type: 'null' },
    lastRefreshOutcome: { type: 'string', enum: ['never', 'pending', 'ok', 'timeout', 'aborted', 'preempted', 'rejected', 'invalidated', 'retired'] },
    timerCleanupUnconfirmed: { type: 'boolean' },
  };
  const properties = {
    schemaVersion: { type: 'string', enum: ['forge.native-performance.report.v1'] }, operation: { type: 'string', enum: [operation] },
    ok: { type: 'boolean' }, availability: NATIVE_PERFORMANCE_AVAILABILITY, unavailableReason: NATIVE_PERFORMANCE_UNAVAILABLE_REASON,
    ownership: { type: 'string', enum: ['none', 'self', 'other', 'operator'] },
    status: { anyOf: [objectOutput(brokerProperties, Object.keys(brokerProperties), false), { type: 'null' }] },
  } satisfies Record<string, ForgeJsonSchema>;
  return {
    ...objectOutput({ ...properties, code: NATIVE_PERFORMANCE_CODES }, Object.keys(properties), false),
    anyOf: [
      objectOutput({ ...properties, ok: { type: 'boolean', enum: [true] } }, Object.keys(properties), false),
      objectOutput({ ...properties, ok: { type: 'boolean', enum: [false] }, code: NATIVE_PERFORMANCE_CODES }, [...Object.keys(properties), 'code'], false),
    ],
  };
}

const EXPRESSION_INSPECTION_OTHER_STATUSES = [
  'unknown-receiver', 'unknown-property', 'ambiguous', 'unsupported', 'invalid-expression', 'unavailable', 'limit',
] as const;
const EXPRESSION_INSPECTION_OUTPUT_FIELDS = {
  expression: { type: 'string', maxLength: EXPRESSION_CHECK_MAX_LENGTH },
  steps: { type: 'array', items: objectOutput({
    segment: { type: 'string' },
    start: { type: 'integer', minimum: 0, maximum: EXPRESSION_CHECK_MAX_LENGTH },
    end: { type: 'integer', minimum: 1, maximum: EXPRESSION_CHECK_MAX_LENGTH },
    kind: { type: 'string', enum: ['keyword', 'variable', 'property'] },
    confidence: { type: 'string', enum: ['declared', 'hint', 'unestablished'] },
    owner: { type: 'string' },
    property: { type: 'string' },
    datatype: { type: 'string' },
    inherited: { type: 'boolean' },
  }, ['segment', 'start', 'end', 'kind', 'confidence'], false) },
} satisfies Record<string, ForgeJsonSchema>;

const CONFIGURATION_FIELD_NAMES = [
  'schemaDir', 'x4ReferenceRoot', 'x4GamePath', 'modWorkspacePath', 'filesystemPath', 'deployFormat',
] as const;
const CONFIGURATION_OPERATION_ID_SCHEMA: ForgeJsonSchema = {
  type: 'string', maxLength: 96,
  description: 'Caller-owned idempotency identifier (8–96 ASCII letters, digits, dots, underscores, colons, or hyphens).',
};
const CONFIGURATION_INSTANCE_SCHEMA = objectOutput({
  profileId: { type: 'string', maxLength: 128 },
  pid: { type: 'integer', minimum: 1, maximum: 4294967295 },
  startedAt: { type: 'string', maxLength: 64 },
}, ['profileId', 'pid', 'startedAt'], false);
const CONFIGURATION_PATCH_PROPERTIES: Readonly<Record<string, ForgeJsonSchema>> = {
  schemaDir: { type: 'string', maxLength: 4096 },
  x4ReferenceRoot: { type: 'string', maxLength: 4096 },
  x4GamePath: { type: 'string', maxLength: 4096 },
  modWorkspacePath: { type: 'string', maxLength: 4096 },
  filesystemPath: { type: 'string', maxLength: 4096 },
  deployFormat: { type: 'string', enum: ['loose', 'catalog'] },
};
const CONFIGURATION_PATCH_SCHEMA: ForgeJsonSchema = {
  type: 'object', additionalProperties: false, properties: CONFIGURATION_PATCH_PROPERTIES,
};
const CONFIGURATION_SAVED_VALUES_SCHEMA: ForgeJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ...CONFIGURATION_PATCH_PROPERTIES,
    deployFormat: { type: 'string', enum: ['', 'loose', 'catalog'] },
  },
};
const CONFIGURATION_ROOT_LIST_SCHEMA: ForgeJsonSchema = {
  type: 'array', items: { type: 'string', maxLength: 4096 },
};
const CONFIGURATION_ROOTS_SCHEMA: ForgeJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    schemaDir: CONFIGURATION_ROOT_LIST_SCHEMA,
    x4ReferenceRoot: CONFIGURATION_ROOT_LIST_SCHEMA,
    x4GamePath: CONFIGURATION_ROOT_LIST_SCHEMA,
    modWorkspacePath: CONFIGURATION_ROOT_LIST_SCHEMA,
    filesystemPath: CONFIGURATION_ROOT_LIST_SCHEMA,
  },
};
const CONFIGURATION_ACCESS_OUTPUT_SCHEMA = objectOutput({
  success: { type: 'boolean' },
  requestId: { type: 'string' },
  operationId: { type: 'string' },
  state: { type: 'string', enum: ['pending', 'approved', 'denied'] },
  instance: CONFIGURATION_INSTANCE_SCHEMA,
  expiresAt: { type: 'integer' },
  requested: { type: 'object', additionalProperties: true },
  receiptId: { type: 'string' },
}, ['success', 'requestId', 'operationId', 'state', 'instance', 'expiresAt', 'requested']);

const DEPLOY_ACCEPTANCE_ITEM_SCHEMA = objectOutput({
  findingId: { type: 'string', maxLength: 128 },
  bindingHash: { type: 'string', maxLength: 64 },
  reason: { type: 'string', maxLength: 512 },
}, ['findingId', 'bindingHash', 'reason'], false);
const DEPLOY_SHARED_TARGET_PROPERTIES: Readonly<Record<string, ForgeJsonSchema>> = {
  path: { type: 'string', maxLength: 4096, description: 'Mod folder path under the selected configured root; mutually exclusive with useAddressedWorkspace.' },
  root: { type: 'string', enum: ['workspace', 'filesystem'], description: 'Configured source root for path deployments.' },
  useAddressedWorkspace: { type: 'boolean', description: 'Deploy the key-bound saved workspace instead of a disk folder path.' },
  deployFormat: { type: 'string', enum: ['loose', 'catalog'], description: 'Per-deployment format override (loose or CAT/DAT catalog) without changing saved config.' },
  detail: { type: 'string', enum: ['compact', 'full'], description: 'Response detail level; compact omits the full echoed workspace.' },
  autoReimport: { type: 'boolean', description: 'Re-import a stale stamped source folder from disk before validation/deployment.' },
  projectCheckSuiteReceiptId: { type: 'string', maxLength: 96, description: 'Approved asynchronous project-check suite receipt ID when required.' },
  expectedProjectCheckSuiteReceiptHash: { type: 'string', maxLength: 64, description: 'Expected SHA-256 hash of the approved project-check suite receipt.' },
  acceptances: { type: 'array', items: DEPLOY_ACCEPTANCE_ITEM_SCHEMA, description: 'Exact finding acceptances with nonempty reasons (at most 127).' },
};

const BULK_TRANSFORM_OPERATION_ITEM_SCHEMA: ForgeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['selector', 'operation', 'operand'],
  properties: {
    id: { type: 'string', maxLength: 64, description: 'Optional deterministic step identifier.' },
    selector: { type: 'string', maxLength: 512, description: 'XPath attribute or text selector within matched corpus XML files.' },
    operation: { type: 'string', enum: ['multiply', 'divide', 'add', 'subtract', 'set', 'clamp'], description: 'Deterministic numeric transform operation.' },
    operand: {
      anyOf: [
        { type: 'number' },
        { type: 'array', items: { type: 'number' } },
      ],
      description: 'Numeric operand, or [min, max] bounds when operation is clamp.',
    },
    rounding: { type: 'string', enum: ['none', 'nearest', 'floor', 'ceil'], description: 'Optional post-operation rounding mode.' },
    roundingIncrement: { type: 'number', minimum: 0.000001, description: 'Optional rounding step size (default 1).' },
  },
};

const BULK_TRANSFORM_RULE_INPUT_SCHEMA: ForgeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pathPrefix', 'maxFiles'],
  properties: {
    pathPrefix: { type: 'string', maxLength: 512, description: 'Vanilla-relative corpus XML prefix (for example assets/fx/weaponfx/macros).' },
    selector: { type: 'string', maxLength: 512, description: 'Single-step XPath attribute/text selector when operations is omitted.' },
    operation: { type: 'string', enum: ['multiply', 'divide', 'add', 'subtract', 'set', 'clamp'], description: 'Single-step numeric transform operation when operations is omitted.' },
    operand: {
      anyOf: [
        { type: 'number' },
        { type: 'array', items: { type: 'number' } },
      ],
      description: 'Single-step numeric operand (or [min, max] for clamp) when operations is omitted.',
    },
    rounding: { type: 'string', enum: ['none', 'nearest', 'floor', 'ceil'], description: 'Single-step rounding mode.' },
    roundingIncrement: { type: 'number', minimum: 0.000001, description: 'Single-step rounding increment.' },
    maxFiles: { type: 'integer', minimum: 1, maximum: 5000, description: 'Hard upper bound on matched files before refusing the plan.' },
    operations: {
      type: 'array',
      items: BULK_TRANSFORM_OPERATION_ITEM_SCHEMA,
      description: 'Optional multi-step ordered numeric transform operations per matched file.',
    },
  },
};

export const FORGE_CAPABILITIES = [
  {
    id: 'bulk.transform.apply',
    version: 1,
    title: 'Apply a previewed canonical bulk XML transform to the addressed workspace',
    description: 'Commit validated <diff> patches from a previewed deterministic corpus numeric transform into the addressed workspace under expectedPlanHash, expectedHead, and expectedSnapshotHash compare-and-swap guards with an action receipt and one-use workspace recovery. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId', 'rule', 'expectedPlanHash', 'expectedHead', 'expectedSnapshotHash'],
      properties: {
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        rule: BULK_TRANSFORM_RULE_INPUT_SCHEMA,
        expectedPlanHash: { type: 'string', maxLength: 128, description: 'Deterministic planHash returned by bulk.transform.preview.' },
        expectedHead: { type: 'string', maxLength: 64, description: 'Expected workspaceHash head from bulk.transform.preview or workspace.read.' },
        expectedSnapshotHash: { type: 'string', maxLength: 64, description: 'Expected complete snapshotHash from bulk.transform.preview or workspace.read.' },
        detail: { type: 'string', enum: ['compact', 'full'], description: 'Response detail level; compact omits the full echoed workspace.' },
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      applied: { type: 'boolean' },
      replayed: { type: 'boolean' },
      added: { type: 'number' },
      workspaceId: { type: 'string' },
      version: { type: 'number' },
      workspaceHash: { type: 'string' },
      snapshotHash: { type: 'string' },
      plan: { type: 'object', additionalProperties: true },
      receipt: { type: 'object', additionalProperties: true },
    }, ['success', 'applied', 'replayed', 'added', 'workspaceId', 'version', 'workspaceHash', 'snapshotHash', 'plan', 'receipt']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['workspace-write'],
    confirmation: 'preview-required',
    apiBindings: [
      { method: 'POST', path: '/api/agent/bulk-transform/execute', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('bulk-transform-panel', 'BulkTransformPanel posts to /api/agent/bulk-transform/apply over the shared executeBulkTransformApplyRoute receipt engine.'),
        disconnected('vscode-extension-bulk-transform-apply', 'The VS Code/Antigravity extension has no native bulk-transform apply command.'),
      ],
      cli: [],
      mcp: [connected('apply_bulk_transform', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "apply_bulk_transform"')],
      agentApi: true,
      builtInHarness: [disconnected('bulk-transform-apply', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/bulk-transform/execute"')],
    },
  },
  {
    id: 'bulk.transform.preview',
    version: 1,
    title: 'Preview a deterministic multi-file corpus numeric XML transform',
    description: 'Build a read-only deterministic bulk XML diff plan across canonical base+DLC corpus files and return matched file counts, sample changes, CAS hashes, and expectedPlanHash without mutating workspace state. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['rule'],
      properties: {
        rule: BULK_TRANSFORM_RULE_INPUT_SCHEMA,
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      applied: { type: 'boolean' },
      planHash: { type: 'string' },
      matchedFiles: { type: 'number' },
      workspaceId: { type: 'string' },
      workspaceHash: { type: 'string' },
      snapshotHash: { type: 'string' },
    }, ['ok', 'applied', 'planHash', 'matchedFiles', 'workspaceId', 'workspaceHash', 'snapshotHash']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/bulk-transform/preview-plan', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('bulk-transform-panel', 'BulkTransformPanel posts to /api/agent/bulk-transform/preview over the shared executeBulkTransformPreviewRoute planner.'),
        disconnected('vscode-extension-bulk-transform-preview', 'The VS Code/Antigravity extension has no native bulk-transform preview command.'),
      ],
      cli: [],
      mcp: [connected('preview_bulk_transform', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "preview_bulk_transform"')],
      agentApi: true,
      builtInHarness: [disconnected('bulk-transform-preview', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/bulk-transform/preview-plan"')],
    },
  },
  {
    id: 'configuration.access.request',
    version: 1,
    title: 'Request bounded configuration access',
    description: 'Submit a profile-bound owner approval request for explicit configuration fields, physical root leases, and session duration. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['instance', 'operationId', 'fields', 'roots', 'durationMs'],
      properties: {
        instance: CONFIGURATION_INSTANCE_SCHEMA,
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        fields: { type: 'array', items: { type: 'string', enum: CONFIGURATION_FIELD_NAMES } },
        roots: CONFIGURATION_ROOTS_SCHEMA,
        durationMs: { type: 'integer', minimum: 60000, maximum: 86400000 },
        restartPolicy: { type: 'string', enum: ['same-profile'] },
      },
    },
    outputSchema: CONFIGURATION_ACCESS_OUTPUT_SCHEMA,
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'audit-write', 'audit-retention-delete'],
    confirmation: 'human-only',
    apiBindings: [
      { method: 'POST', path: '/api/agent/configuration/access/request', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-access-request', 'Agents submit access requests via API or MCP; the Studio owner approves or denies them in Agent Bridge -> Issued Keys.'),
        disconnected('vscode-extension-configuration-access-request', 'The extension hosts MCP and Studio owner review rather than submitting agent access requests directly.'),
      ],
      cli: [],
      mcp: [connected('request_configuration_access', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "request_configuration_access"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/configuration/access/request'")],
    },
  },
  {
    id: 'configuration.access.status',
    version: 1,
    title: 'Read configuration access request status',
    description: 'Inspect the current pending, approved, or denied status of a caller-owned configuration access request. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId'],
      properties: {
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
      },
    },
    outputSchema: CONFIGURATION_ACCESS_OUTPUT_SCHEMA,
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/configuration/access', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-access-status', 'The Studio owner inspects all pending and decided access requests via Agent Bridge -> Issued Keys.'),
        disconnected('vscode-extension-configuration-access-status', 'The extension delegates configuration access polling to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_configuration_access_status', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_configuration_access_status"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.get('/api/agent/configuration/access'")],
    },
  },
  {
    id: 'configuration.apply',
    version: 1,
    title: 'Apply a reviewed configuration proposal',
    description: 'Atomically persist a revision- and instance-bound configuration proposal, refresh schema/reference caches, and record a durable profile receipt. Requires an explicit key grant and committed owner access.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['instance', 'proposalId', 'operationId'],
      properties: {
        instance: CONFIGURATION_INSTANCE_SCHEMA,
        proposalId: { type: 'string', maxLength: 96 },
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      saved: { type: ['boolean', 'null'] },
      code: { type: 'string' },
      operationId: { type: 'string' },
      proposalId: { type: 'string' },
      revision: { type: 'string' },
      followup: { type: 'string', enum: ['complete', 'failed'] },
      receiptStatus: { type: 'string' },
      receipt: { type: 'object', additionalProperties: true },
      schemaComplete: { type: 'boolean' },
      schemaWarning: { type: ['string', 'null'] },
      replayed: { type: 'boolean' },
    }, ['success', 'saved', 'code', 'operationId', 'proposalId', 'receiptStatus']),
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write'],
    confirmation: 'preview-required',
    apiBindings: [
      { method: 'POST', path: '/api/agent/configuration/apply', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-agent-apply', 'Web Studio Directory Settings saves through the session-only /api/schema/config compatibility adapter over the shared configuration planner and writer.'),
        disconnected('vscode-extension-configuration-agent-apply', 'The extension hosts Studio settings and MCP rather than calling agent CAS apply directly.'),
      ],
      cli: [],
      mcp: [connected('apply_configuration_change', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "apply_configuration_change"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/configuration/apply'")],
    },
  },
  {
    id: 'configuration.preview',
    version: 1,
    title: 'Preview a scoped configuration change',
    description: 'Validate a strict six-field directory or default deploy-format patch against the current profile revision, path-role locks, and physical root leases without modifying config.json.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['instance', 'revision', 'operationId', 'patch'],
      properties: {
        instance: CONFIGURATION_INSTANCE_SCHEMA,
        revision: { type: 'string', maxLength: 64 },
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        patch: CONFIGURATION_PATCH_SCHEMA,
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      proposalId: { type: 'string' },
      operationId: { type: 'string' },
      expiresAt: { type: 'integer' },
      instance: CONFIGURATION_INSTANCE_SCHEMA,
      revision: { type: 'string' },
      changes: CONFIGURATION_PATCH_SCHEMA,
      effective: CONFIGURATION_PATCH_SCHEMA,
      schemaComplete: { type: 'boolean' },
      schemaWarning: { type: ['string', 'null'] },
      restartRequired: { type: 'boolean' },
      impact: { type: 'string' },
      replayed: { type: 'boolean' },
    }, ['success', 'proposalId', 'operationId', 'expiresAt']),
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/configuration/preview', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-agent-preview', 'Web Studio validates inline in Directory Settings and saves through /api/schema/config.'),
        disconnected('vscode-extension-configuration-agent-preview', 'The extension hosts Studio settings and MCP rather than calling agent CAS preview directly.'),
      ],
      cli: [],
      mcp: [connected('preview_configuration_change', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "preview_configuration_change"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/configuration/preview'")],
    },
  },
  {
    id: 'configuration.read',
    version: 1,
    title: 'Read scoped Forge configuration',
    description: 'Read allowlisted saved and effective directory settings, deployment format preference, resolver provenance, lock reasons, and current revision for this profile without exposing secrets.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      instance: CONFIGURATION_INSTANCE_SCHEMA,
      revision: { type: 'string' },
      saved: CONFIGURATION_SAVED_VALUES_SCHEMA,
      effective: CONFIGURATION_PATCH_SCHEMA,
      locks: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
      mutability: { type: 'object', additionalProperties: { type: 'string', enum: ['mutable', 'locked'] } },
      provenance: { type: 'object', additionalProperties: { type: 'string', enum: ['saved', 'default', 'environment', 'launcher'] } },
      deployFormats: { type: 'array', items: { type: 'string', enum: ['loose', 'catalog'] } },
      deployFormatDefault: { type: 'string', enum: ['loose'] },
      deployFormatSource: { type: 'string', enum: ['saved', 'default'] },
      schemaComplete: { type: 'boolean' },
      x4ReferenceExists: { type: 'boolean' },
      grantExpiresAt: { type: 'integer' },
    }, ['success', 'instance', 'revision', 'saved', 'effective', 'locks', 'mutability', 'provenance', 'deployFormats', 'deployFormatDefault', 'deployFormatSource', 'schemaComplete', 'x4ReferenceExists']),
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/configuration', inputLocation: 'none', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-agent-read', 'Web Studio Directory Settings reads the session-only /api/schema/config view.'),
        disconnected('vscode-extension-configuration-agent-read', 'The extension hosts Studio settings and MCP rather than calling the agent configuration read route directly.'),
      ],
      cli: [],
      mcp: [connected('get_configuration', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_configuration"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.get('/api/agent/configuration'")],
    },
  },
  {
    id: 'configuration.status',
    version: 1,
    title: 'Read configuration operation status',
    description: 'Inspect the saved, follow-up, receipt, and recovery-patch status of a caller-owned configuration preview or apply operation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId'],
      properties: {
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      saved: { type: ['boolean', 'null'] },
      code: { type: 'string' },
      operationId: { type: 'string' },
      proposalId: { type: 'string' },
      revision: { type: 'string' },
      followup: { type: 'string', enum: ['complete', 'failed'] },
      receiptStatus: { type: 'string' },
      receipt: { type: 'object', additionalProperties: true },
      instance: CONFIGURATION_INSTANCE_SCHEMA,
      recoveryPatch: CONFIGURATION_PATCH_SCHEMA,
    }, ['success', 'saved', 'code', 'operationId', 'proposalId', 'receiptStatus', 'instance', 'recoveryPatch']),
    context: { workspace: 'optional', profile: 'required' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/configuration/status', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-configuration-agent-status', 'Web Studio inspects configuration changes through Agent Bridge history and Directory Settings.'),
        disconnected('vscode-extension-configuration-agent-status', 'The extension delegates configuration operation inspection to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_configuration_operation_status', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_configuration_operation_status"')],
      agentApi: true,
      builtInHarness: [],
        externalAgents: [connected('agent-api', "server.ts::app.get('/api/agent/configuration/status'")],
    },
  },
  {
    id: 'contracts.derive',
    version: 1,
    title: 'Derive and validate a draft external API contract from an installed or workspace mod',
    description: 'Scan loose .xml/.lua files and packed .cat/.dat archives of a single extension folder under configured Filesystem, Game extensions/, or Mod Workspace roots, synthesize a draft external API contract definition, validate it against the Forge API-registry schema, and return redacted provenance without mutating disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ext'],
      properties: {
        ext: { type: 'string', maxLength: 128, description: 'Single extension folder name without path separators.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      extensionFolder: { type: 'string' },
      sourceKind: { type: 'string', enum: ['filesystem', 'extensions', 'workspace'] },
      filesScanned: { type: 'number' },
      packedFilesScanned: { type: 'number' },
      definition: { type: 'object', additionalProperties: true },
      notes: { type: 'array', items: { type: 'string' } },
      validates: { type: 'boolean' },
      validationErrors: { type: 'array', items: { type: 'string' } },
    }, ['ok', 'success', 'extensionFolder', 'sourceKind', 'filesScanned', 'packedFilesScanned', 'definition', 'notes', 'validates', 'validationErrors']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/external-api/derive-draft', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('contract-editor-derive', 'ContractEditor calls GET /api/agent/external-api/derive; agent callers use the host-path-redacted GET /api/agent/external-api/derive-draft adapter.'),
        disconnected('vscode-extension-contracts-derive', 'The VS Code/Antigravity extension delegates external-API contract derivation to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('derive_external_api_contract', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "derive_external_api_contract"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/external-api/derive-draft"')],
    },
  },
  {
    id: 'contracts.registry.read',
    version: 1,
    title: 'List active external Lua/MD integration API contract definitions',
    description: 'Read the merged active external-API contract registry (built-in, data-dir, configured folder, and Studio runtime registrations) with optional full symbol payloads or single-extension filtering.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        full: { type: 'string', enum: ['0', '1'], description: 'When 1, return full symbol definitions instead of component counts.' },
        extensionId: { type: 'string', maxLength: 128, description: 'Optional case-insensitive extensionId exact match filter.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      count: { type: 'number' },
      totalApis: { type: 'number' },
      full: { type: 'boolean' },
      apis: { type: 'array', items: { type: 'object', additionalProperties: true } },
      sources: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'count', 'totalApis', 'full', 'apis', 'sources']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/external-api/registry', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-inspector-api-registry', 'ProjectInspector and ContractEditor read GET /api/agent/external-api-registry; agent callers use the protected GET /api/agent/external-api/registry adapter.'),
        disconnected('vscode-extension-contracts-registry', 'The VS Code/Antigravity extension delegates external-API contract registry inspection to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('list_external_api_contracts', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_external_api_contracts"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/external-api/registry"')],
    },
  },
  {
    id: 'deploy.apply',
    version: 1,
    title: 'Apply a reviewed native deployment',
    description: 'Deploy a preview-bound mod artifact (loose or CAT/DAT catalog) through the shared native deploy transaction, verifying source/artifact/binding/target hashes, recording durable action and recovery receipts, and confirming deployed bytes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId', 'expectedModId', 'expectedSourceHash', 'expectedArtifactHash', 'expectedBindingHash', 'expectedTargetFingerprint'],
      properties: {
        ...DEPLOY_SHARED_TARGET_PROPERTIES,
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        expectedModId: { type: 'string', maxLength: 256 },
        expectedSourceHash: { type: 'string', maxLength: 64 },
        expectedArtifactHash: { type: 'string', maxLength: 64 },
        expectedBindingHash: { type: 'string', maxLength: 64 },
        expectedTargetFingerprint: { type: 'string', maxLength: 64 },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      stage: { type: 'string' },
      code: { type: 'string' },
      error: { type: 'string' },
      modId: { type: ['string', 'null'] },
      sourceHash: { type: ['string', 'null'] },
      artifactHash: { type: ['string', 'null'] },
      bindingHash: { type: 'string' },
      deployedPath: { type: 'string' },
      deployedFingerprint: { type: 'string' },
      bytesConfirmed: { type: 'boolean' },
      deployment: { type: 'object', additionalProperties: true },
      deployRecord: { type: 'object', additionalProperties: true },
      recovery: { type: 'object', additionalProperties: true },
      deployFormat: { type: 'object', additionalProperties: true },
      effect: { type: 'object', additionalProperties: true },
      checklist: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'success', 'stage', 'checklist', 'deployment']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'preview-required',
    apiBindings: [
      { method: 'POST', path: '/api/agent/deploy-verify/apply', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-deploy-agent-apply', 'Web Studio deploys through the CompileConfirmationModal /api/agent/deploy-verify flow over the same deployVerifyHandler owner.'),
        disconnected('vscode-extension-deploy-agent-apply', 'The extension hosts Studio deploy actions and MCP rather than calling the bound agent apply adapter directly.'),
      ],
      cli: [],
      mcp: [connected('apply_native_deploy', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "apply_native_deploy"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/deploy-verify/apply'")],
    },
  },
  {
    id: 'deploy.preview',
    version: 1,
    title: 'Preview a native deployment',
    description: 'Run the real native deployment planner, full validation stack, finding-review evaluation, and destination file-effect preview without writing staging or installed files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...DEPLOY_SHARED_TARGET_PROPERTIES,
        inspectDeployOperationId: { type: 'string', maxLength: 96, description: 'Optional prior operation ID in this workspace to compare target state against.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      dryRun: { type: 'boolean' },
      stage: { type: 'string' },
      code: { type: 'string' },
      error: { type: 'string' },
      modId: { type: ['string', 'null'] },
      sourceHash: { type: ['string', 'null'] },
      artifactHash: { type: ['string', 'null'] },
      bindingHash: { type: 'string' },
      targetFingerprint: { type: 'string' },
      targetRoot: { type: 'string' },
      deployFormat: { type: 'object', additionalProperties: true },
      effect: { type: 'object', additionalProperties: true },
      deployment: { type: 'object', additionalProperties: true },
      checklist: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'stage', 'checklist', 'deployment']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/deploy-verify/preview', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-deploy-agent-preview', 'Web Studio previews deployments through /api/agent/deploy-verify dryRun:true over the same deployVerifyHandler owner.'),
        disconnected('vscode-extension-deploy-agent-preview', 'The extension hosts Studio deploy previews and MCP rather than calling the agent preview adapter directly.'),
      ],
      cli: [],
      mcp: [connected('preview_native_deploy', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "preview_native_deploy"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/deploy-verify/preview'")],
    },
  },
  {
    id: 'deploy.status',
    version: 1,
    title: 'Read native deploy operation status',
    description: 'Inspect the durable deployment receipt, outcome, optional live target/managed-output observation, and committed file-effect report for an addressed agent deployment operation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['deployOperationId'],
      properties: {
        deployOperationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        inspectDeployTarget: { type: 'string', enum: ['1', 'managed'], description: 'Inspect current whole-folder (1) or recorded managed-file (managed) target state.' },
        inspectDeployEffect: { type: 'string', enum: ['1'], description: 'Include the committed file-effect report.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      code: { type: 'string' },
      workspaceId: { type: 'string' },
      outcome: { type: 'string' },
      receipt: { type: 'object', additionalProperties: true },
      targetObservation: { type: 'object', additionalProperties: true },
      managedObservation: { type: 'object', additionalProperties: true },
      effectReport: { type: 'object', additionalProperties: true },
    }, ['ok', 'outcome']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/deploy-verify/status', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-deploy-agent-status', 'Web Studio inspects deployment history and receipts through Agent Bridge.'),
        disconnected('vscode-extension-deploy-agent-status', 'The extension delegates agent deploy-operation status inspection to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_deploy_operation_status', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_deploy_operation_status"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.get('/api/agent/deploy-verify/status'")],
    },
  },
  {
    id: 'deploy.undo',
    version: 1,
    title: 'Undo a verified native deployment',
    description: 'Restore the exact pre-deploy extensions target state once using a CAS-checked deployment recovery record addressed by deployOperationId, recoveryId, or historyId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deployOperationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        recoveryId: { type: 'string', maxLength: 96, description: 'Deployment recovery ID returned by apply_native_deploy.' },
        historyId: { type: 'string', maxLength: 96, description: 'Workspace deploy ledger row ID.' },
      },
      anyOf: [
        { type: 'object', additionalProperties: false, required: ['deployOperationId'], properties: { deployOperationId: CONFIGURATION_OPERATION_ID_SCHEMA } },
        { type: 'object', additionalProperties: false, required: ['recoveryId'], properties: { recoveryId: { type: 'string', maxLength: 96 } } },
        { type: 'object', additionalProperties: false, required: ['historyId'], properties: { historyId: { type: 'string', maxLength: 96 } } },
      ],
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      code: { type: 'string' },
      error: { type: 'string' },
      revertedTo: { type: 'string' },
      recoveryId: { type: 'string' },
      recoveryKind: { type: 'string', enum: ['deploy'] },
      deployedPath: { type: 'string' },
      restoredFingerprint: { type: 'string' },
      priorExisted: { type: 'boolean' },
      cleanupWarning: { type: 'object', additionalProperties: true },
    }, ['ok']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'deploy', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/deploy-verify/undo', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('studio-deploy-agent-undo', 'Web Studio reverts deployments through Agent Bridge /api/agent/history/:id/revert over the same deployment recovery owner.'),
        disconnected('vscode-extension-deploy-agent-undo', 'The extension delegates deployment recovery undo to Studio Agent Bridge, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [connected('undo_native_deploy', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "undo_native_deploy"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/deploy-verify/undo'")],
    },
  },
  {
    id: 'diagnostics.quick.fixes',
    version: 1,
    title: 'List deterministic workspace quick-fix descriptors',
    description: 'Compute deterministic quick-fix and repair descriptors across the addressed workspace graph (or an inline workspace) using the server-owned ScriptProperty union.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        workspace: { type: 'object', additionalProperties: true, description: 'Optional inline workspace graph ({ nodes, links }); when omitted, evaluates the addressed Studio workspace.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum quick-fix descriptors to return (default 100, maximum 200).' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      total: { type: 'number' },
      truncated: { type: 'boolean' },
      fixes: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'total', 'truncated', 'fixes']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/quick-fixes', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('properties-inspector-quick-fixes', 'PropertiesInspector evaluates listQuickFixes in memory over the shared workspaceQuickFixes engine rather than calling /api/agent/quick-fixes.'),
        disconnected('vscode-extension-quick-fixes', 'The VS Code/Antigravity extension uses editor code-action providers rather than /api/agent/quick-fixes.'),
      ],
      cli: [],
      mcp: [partial('suggest_quick_fixes', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "suggest_quick_fixes"', 'MCP evaluates the addressed workspace (without uploading an inline workspace) and bounds fixes at 200.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/quick-fixes"')],
    },
  },
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
    id: 'expression.inspect',
    version: 1,
    title: 'Inspect X4 expression type evidence',
    description: 'Read ordered type evidence for one unsaved static MD or AIScript property chain using the configured script property index and explicit variable hints.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', maxLength: EXPRESSION_CHECK_MAX_LENGTH },
        variableTypes: { type: 'object', additionalProperties: { type: 'string', maxLength: EXPRESSION_CHECK_HINT_MAX_LENGTH } },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    outputSchema: {
      ...objectOutput({
        ...EXPRESSION_INSPECTION_OUTPUT_FIELDS,
        status: { type: 'string', enum: ['resolved', ...EXPRESSION_INSPECTION_OTHER_STATUSES] },
        resultType: { type: 'string' },
      }, ['expression', 'status', 'steps'], false),
      anyOf: [
        objectOutput({
          ...EXPRESSION_INSPECTION_OUTPUT_FIELDS,
          status: { type: 'string', enum: ['resolved'] },
          resultType: { type: 'string' },
        }, ['expression', 'status', 'steps', 'resultType'], false),
        objectOutput({
          ...EXPRESSION_INSPECTION_OUTPUT_FIELDS,
          status: { type: 'string', enum: EXPRESSION_INSPECTION_OTHER_STATUSES },
        }, ['expression', 'status', 'steps'], false),
      ],
    },
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/expressions/inspect', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-expression-inspect', 'The web Studio has no dedicated expression type inspection control.'),
        disconnected('vscode-extension-expression-inspect', 'The extension has no dedicated expression type inspection control.'),
      ],
      cli: [],
      mcp: [connected('inspect_expression', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "inspect_expression"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/expressions/inspect"')],
    },
  },
  {
    id: 'expression.suggest',
    version: 1,
    title: 'Suggest X4 expression property continuations',
    description: 'Suggest ranked ScriptProperty continuations at a caret position in an unsaved MD or AIScript expression, optionally narrowed by variableTypes hints.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: { type: 'string', maxLength: 4000, description: 'Expression text being authored, e.g. $station. or player.ship.' },
        caret: { type: 'integer', minimum: 0, maximum: 4000, description: 'Zero-based caret position in text (defaults to text.length).' },
        variableTypes: {
          type: 'object',
          additionalProperties: { type: 'string', maxLength: EXPRESSION_CHECK_HINT_MAX_LENGTH },
          description: 'Optional map of variable names (with or without $) to X4 ScriptProperty datatypes.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum ranked suggestions to return (default 100, max 200).' },
      },
    },
    outputSchema: objectOutput({
      available: { type: 'boolean' },
      total: { type: 'number' },
      truncated: { type: 'boolean' },
      suggestions: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['available', 'total', 'truncated', 'suggestions']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/suggest/expression', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('expression-input-autocomplete', 'ExpressionInput invokes /api/agent/suggest/expression from a debounced timer callback during interactive typing.'),
        disconnected('vscode-extension-expression-suggest', 'The VS Code/Antigravity extension uses /api/agent/lang/complete rather than /api/agent/suggest/expression.'),
      ],
      cli: [],
      mcp: [connected('suggest_expression_completions', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "suggest_expression_completions"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/suggest/expression"')],
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
    id: 'extensions.dependencies.analyze',
    version: 1,
    title: 'Analyze installed extension dependency graph and load order',
    description: 'Inspect installed X4 extension manifests, resolved dependency edges, simulated load order, cycles, and missing required or optional dependencies without exposing host filesystem paths.',
    inputSchema: EMPTY_INPUT,
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      nodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
      loadOrder: { type: 'array', items: { type: 'string' } },
      cycles: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      issues: { type: 'array', items: { type: 'object', additionalProperties: true } },
      counts: { type: 'object', additionalProperties: { type: 'number' } },
    }, ['success', 'nodes', 'loadOrder', 'cycles', 'issues', 'counts']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/extensions/dependency-graph', inputLocation: 'none', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('mod-dependency-view', 'ModDependencyView reads /api/agent/mod-dependency-graph; agent callers use the redacted /api/agent/extensions/dependency-graph adapter over scanInstalledModDependencyGraph.'),
        disconnected('vscode-extension-mod-dependencies', 'The VS Code/Antigravity extension delegates mod dependency graph inspection to Studio, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_mod_dependency_graph', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_mod_dependency_graph"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/extensions/dependency-graph"')],
    },
  },
  {
    id: 'extensions.file.read',
    version: 1,
    title: 'Read a single file from an installed X4 extension (loose or packed CAT/DAT)',
    description: 'Read one relative file (<extensionFolder>/<relativeFile>) from the configured X4 game extensions/ directory across both loose regular files and packed .cat/.dat archives, bounding returned UTF-8 content at 512 KiB and redacting host filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Extensions-relative file path, e.g. my_mod/content.xml or my_mod/md/main.xml.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      path: { type: 'string' },
      name: { type: 'string' },
      source: { type: 'string', enum: ['loose', 'packed'] },
      archive: { type: 'string' },
      bytes: { type: 'number' },
      contentLength: { type: 'number' },
      contentTruncated: { type: 'boolean' },
      sha256: { type: 'string' },
      content: { type: 'string' },
    }, ['ok', 'success', 'path', 'name', 'source', 'bytes', 'contentLength', 'contentTruncated', 'sha256', 'content']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/extensions/file', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('package-mod-doctor-extension-file', 'PackageModDoctor loads GET /api/agent/extension-file on click-through; agent callers use the bounded, symlink-contained GET /api/agent/extensions/file adapter.'),
        disconnected('vscode-extension-extension-file', 'The VS Code/Antigravity extension delegates installed-extension file reads to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('read_extension_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "read_extension_file"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/extensions/file"')],
    },
  },
  {
    id: 'extensions.overrides.analyze',
    version: 1,
    title: 'Analyze per-element extension overrides on a base XML file',
    description: 'Build the per-element and per-attribute override map and simulated load-order winner across enabled third-party X4 extensions for one contested relative XML target file.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['file'],
      properties: {
        file: { type: 'string', maxLength: 1024, description: 'Base-relative XML path, e.g. libraries/jobs.xml or libraries/wares.xml.' },
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      targetFile: { type: 'string' },
      resolution: { type: 'string', enum: ['base', 'string'] },
      loadOrder: { type: 'array', items: { type: 'string' } },
      entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
      counts: { type: 'object', additionalProperties: { type: 'number' } },
    }, ['success', 'targetFile', 'resolution', 'loadOrder', 'entries', 'counts']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/override-map', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('override-visualizer', 'PackageModDoctor loads /api/agent/override-map on demand when drilling into a contested file row.'),
        disconnected('vscode-extension-override-map', 'The VS Code/Antigravity extension checks summary conflicts via /api/agent/extension-doctor rather than /api/agent/override-map.'),
      ],
      cli: [],
      mcp: [connected('get_extension_override_map', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_extension_override_map"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/override-map"')],
    },
  },
  {
    id: 'files.delete',
    version: 1,
    title: 'Remove a single regular file in the Mod Workspace root with mandatory CAS and durable recovery',
    description: 'Atomically remove one regular file inside the configured Mod Workspace root using mandatory expectedSha256 compare-and-swap, explicit directory/symlink/traversal/hidden-path refusal, durable pre-delete byte preservation, and a one-use CAS recovery receipt. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'expectedSha256'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative regular file path inside the configured Mod Workspace root.' },
        expectedSha256: { type: 'string', maxLength: 64, description: 'Mandatory 64-hex sha256 digest of the existing regular file bytes.' },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex Mod Workspace root identity guard.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      path: { type: 'string' },
      workspaceRootId: { type: 'string' },
      removed: { type: 'object', additionalProperties: true },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'path', 'removed', 'recovery']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/files/delete', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-delete', 'DirectoryExplorer posts directory deletes to /api/fs/delete-dir; single-file removal shares removeWorkspaceFileGuarded across /api/fs/delete-file and /api/agent/files/delete.'),
        disconnected('vscode-extension-files-delete', 'The VS Code/Antigravity extension uses native workspace file APIs or MCP remove_workspace_file.'),
      ],
      cli: [],
      mcp: [connected('remove_workspace_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "remove_workspace_file"')],
      agentApi: true,
      builtInHarness: [disconnected('project-files-delete', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/files/delete"')],
    },
  },
  {
    id: 'files.delete.dir',
    version: 1,
    title: 'Preview or remove a Mod Workspace directory with mandatory tree CAS and reversible recovery',
    description: 'Preview (apply=false) or atomically remove (apply=true with expectedTreeSha256) a regular directory inside the configured Mod Workspace root. Refuses root deletion, traversal, symlinks, hidden paths, regular files, directories containing hidden or Forge-managed entries (such as .git or .snapshots), and payloads above 32 MiB, while capturing a one-use reversible directory recovery receipt restorable through files.restore@2 or history.revert@2. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative directory path inside the configured Mod Workspace root.' },
        apply: { type: 'boolean', description: 'When false, compute and return treeSha256, byte count, and entry counts without deleting; when true (default), verify expectedTreeSha256 and remove reversibly.' },
        expectedTreeSha256: { type: 'string', maxLength: 64, description: 'Mandatory 64-hex tree digest from apply=false preview when apply is true.' },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex Mod Workspace root identity guard.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      applied: { type: 'boolean' },
      path: { type: 'string' },
      workspaceRootId: { type: 'string' },
      treeSha256: { type: 'string' },
      totalBytes: { type: 'number' },
      fileCount: { type: 'number' },
      dirCount: { type: 'number' },
      removed: { type: 'object', additionalProperties: true },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'applied', 'path']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/files/delete-dir', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-delete-dir', 'DirectoryExplorer posts legacy directory deletes to /api/fs/delete-dir; agent callers use CAS-guarded /api/agent/files/delete-dir over shared removeDirectoryRecursive.'),
        disconnected('vscode-extension-files-delete-dir', 'The VS Code/Antigravity extension uses native workspace folder deletion or MCP remove_workspace_directory.'),
      ],
      cli: [],
      mcp: [connected('remove_workspace_directory', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "remove_workspace_directory"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/files/delete-dir"')],
    },
  },
  {
    id: 'files.inventory.read',
    version: 1,
    title: 'Read addressed workspace artifact-plan and source-folder file ownership inventory',
    description: 'Inspect the addressed workspace artifact-plan file inventory (up to 500 entries) reconciled against its Mod Workspace folder, reporting source vs synchronized-generated vs generated-only vs conflict state, sha256 digests, and materialization eligibility without exposing host filesystem paths. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        modId: { type: 'string', maxLength: 128, description: 'Optional single-segment Mod Workspace folder name override; defaults to the addressed workspace modId.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      sourceAvailable: { type: 'boolean' },
      workspaceId: { type: 'string' },
      workspaceRootId: { type: 'string' },
      modId: { type: 'string' },
      sourceFolder: { type: ['string', 'null'] },
      totalEntries: { type: 'number' },
      truncated: { type: 'boolean' },
      excludedCount: { type: 'number' },
      errors: { type: 'array', items: { type: 'string' } },
      entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'sourceAvailable', 'workspaceId', 'modId', 'sourceFolder', 'totalEntries', 'truncated', 'excludedCount', 'errors', 'entries']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/files/inventory', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('native-project-files-inventory', 'NativeProjectFiles posts inline workspace state to /api/agent/project/files over the shared buildProjectFileInventory engine.'),
        disconnected('vscode-extension-files-inventory', 'The VS Code/Antigravity extension delegates artifact-plan file inventory reads to Studio and MCP get_project_file_inventory.'),
      ],
      cli: [],
      mcp: [connected('get_project_file_inventory', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_project_file_inventory"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/files/inventory"')],
    },
  },
  {
    id: 'files.list',
    version: 1,
    title: 'List project source or deployed directory entries',
    description: 'Inspect one shallow directory (at most 500 visible entries) inside the configured Mod Workspace or deployed Filesystem root without exposing host filesystem paths. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        root: { type: 'string', enum: ['workspace', 'filesystem'], description: 'Target project root (default workspace).' },
        path: { type: 'string', maxLength: 1024, description: 'Optional relative subdirectory path within the selected root.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      root: { type: 'string' },
      path: { type: 'string' },
      totalItems: { type: 'number' },
      truncated: { type: 'boolean' },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'root', 'path', 'totalItems', 'truncated', 'items']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/files/list', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-browser', 'DirectoryExplorer and NativeProjectFiles browse /api/fs/list over the shared inspectShallowDirectory engine.'),
        disconnected('vscode-extension-files-list', 'The VS Code/Antigravity extension uses native workspace file APIs rather than /api/agent/files/list.'),
      ],
      cli: [],
      mcp: [connected('list_workspace_files', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_workspace_files"')],
      agentApi: true,
      builtInHarness: [disconnected('project-files-list', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/files/list"')],
    },
  },
  {
    id: 'files.read',
    version: 1,
    title: 'Read a UTF-8 file from the Mod Workspace or deployed Filesystem root',
    description: 'Read one bounded regular UTF-8 text file (at most 512 KiB) from the configured Mod Workspace or deployed Filesystem root and return its sha256 digest and optional workspaceRootId without exposing host absolute paths. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative file path within the selected project root.' },
        root: { type: 'string', enum: ['workspace', 'filesystem'], description: 'Target project root (default workspace).' },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex workspace root identity guard when root is workspace.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      path: { type: 'string' },
      root: { type: 'string' },
      bytes: { type: 'number' },
      sha256: { type: 'string' },
      content: { type: 'string' },
    }, ['ok', 'path', 'root', 'bytes', 'sha256', 'content']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/files/read', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-reader', 'Studio editors read /api/fs/read over the shared root-bound file reader.'),
        disconnected('vscode-extension-files-read', 'The VS Code/Antigravity extension reads local workspace documents directly rather than /api/agent/files/read.'),
      ],
      cli: [],
      mcp: [connected('read_workspace_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "read_workspace_file"')],
      agentApi: true,
      builtInHarness: [disconnected('project-files-read', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/files/read"')],
    },
  },
  {
    id: 'files.restore',
    version: 2,
    title: 'Restore a removed Mod Workspace file or directory or undo a CAS creation once',
    description: 'Consume one ready file or directory recovery receipt (delete-file, undo-create, delete-dir, or undo-create-dir) inside the matching workspace and Mod Workspace root under compare-and-swap guards. Restores exact pre-delete bytes or directory trees when the target path is still absent, or removes an unmodified newly created file or scaffolded mod folder. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['recoveryId'],
      properties: {
        recoveryId: { type: 'string', maxLength: 81, description: 'One-use file or directory recovery receipt identifier from files.delete, files.delete.dir, files.scaffold, or files.write.' },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex Mod Workspace root identity guard.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      recoveryId: { type: 'string' },
      recoveryKind: { type: 'string', enum: ['file'] },
      operation: { type: 'string', enum: ['delete-file', 'undo-create', 'delete-dir', 'undo-create-dir'] },
      action: { type: 'string', enum: ['restored', 'removed-created-file', 'restored-directory', 'removed-created-directory'] },
      path: { type: 'string' },
      workspaceRootId: { type: 'string' },
      restored: { type: 'object', additionalProperties: true },
      removed: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'recoveryId', 'recoveryKind', 'operation', 'action', 'path']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/files/restore', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-restore', 'AgentBridge triggers file recovery via /api/agent/history/:id/revert; direct recovery uses /api/fs/restore-file and /api/agent/files/restore.'),
        disconnected('vscode-extension-files-restore', 'The VS Code/Antigravity extension uses MCP restore_workspace_file or revert_action_history.'),
      ],
      cli: [],
      mcp: [connected('restore_workspace_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "restore_workspace_file"')],
      agentApi: true,
      builtInHarness: [disconnected('project-files-restore', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/files/restore"')],
    },
  },
  {
    id: 'files.scaffold',
    version: 1,
    title: 'Preview or scaffold a new X4 mod folder on disk with strict validation and undo-create recovery',
    description: 'Preview (apply=false) or atomically materialize (apply=true) a new X4 extension folder under the configured Mod Workspace root with authored content.xml and optional starter Mission Director or AI-Influence contract files. Refuses existing target folders (MOD_FOLDER_ALREADY_EXISTS), validates every starter file before touching disk, and records a one-use undo-create-dir recovery receipt. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', maxLength: 64, description: 'Lowercase alphanumeric/underscore X4 extension folder identifier (2..64 chars, starting with a letter).' },
        name: { type: 'string', maxLength: 512, description: 'Optional human-readable mod display title.' },
        version: { type: 'string', maxLength: 512, description: 'Optional mod version string (e.g. 1.0.0 or 100).' },
        author: { type: 'string', maxLength: 512, description: 'Optional author display name.' },
        description: { type: 'string', maxLength: 512, description: 'Optional mod description.' },
        deps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: { type: 'string', maxLength: 80 },
              version: { type: 'string', maxLength: 32 },
              optional: { type: 'boolean' },
            },
          },
          description: 'Optional extension dependency list written into content.xml (at most 32 entries).',
        },
        starterKind: { type: 'string', enum: ['minimal', 'md_cue', 'ai_influence_starter'], description: 'Starter skeleton layout (default minimal).' },
        apply: { type: 'boolean', description: 'When false, preview planned starter files without writing; when true (default), materialize the new mod folder.' },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex Mod Workspace root identity guard.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      applied: { type: 'boolean' },
      modId: { type: 'string' },
      starterKind: { type: 'string', enum: ['minimal', 'md_cue', 'ai_influence_starter'] },
      path: { type: 'string' },
      workspaceRootId: { type: 'string' },
      fileCount: { type: 'number' },
      treeSha256: { type: 'string' },
      totalBytes: { type: 'number' },
      files: { type: 'array', items: { type: 'object', additionalProperties: true } },
      writtenFiles: { type: 'array', items: { type: 'string' } },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'applied', 'modId', 'starterKind', 'fileCount', 'files']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/files/scaffold', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-scaffold', 'Studio scaffolds new files and folders via /api/fs/create and /api/agent/project/create; agent callers materialize complete mod skeletons via /api/agent/files/scaffold.'),
        disconnected('vscode-extension-files-scaffold', 'The VS Code/Antigravity extension delegates mod skeleton scaffolding to Studio and MCP scaffold_mod_project.'),
      ],
      cli: [],
      mcp: [connected('scaffold_mod_project', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "scaffold_mod_project"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/files/scaffold"')],
    },
  },
  {
    id: 'files.write',
    version: 2,
    title: 'Write a UTF-8 file in the Mod Workspace root with mandatory CAS and strict preflight',
    description: 'Atomically create or update one UTF-8 text file (at most 512 KiB) inside the configured Mod Workspace root using mandatory expectedSha256 compare-and-swap (64-hex digest or null for new files), default strict XML/scriptproperty preflight before touching disk, automatic Action Ledger undo capture, and a one-use undo-create recovery receipt when expectedSha256 is null. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content', 'expectedSha256'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative target file path inside the configured Mod Workspace root.' },
        content: { type: 'string', maxLength: 524_288, description: 'UTF-8 text content to write.' },
        expectedSha256: {
          anyOf: [
            { type: 'string', maxLength: 64 },
            { type: 'null' },
          ],
          description: 'Mandatory CAS precondition: 64-hex sha256 of existing file bytes, or null when creating a new file.',
        },
        expectedWorkspaceRootId: { type: 'string', maxLength: 64, description: 'Optional 64-hex Mod Workspace root identity guard.' },
        strict: { type: 'boolean', description: 'Refuse writes on validation errors before touching disk (default true).' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      path: { type: 'string' },
      workspaceRootId: { type: 'string' },
      written: { type: 'object', additionalProperties: true },
      recovery: { type: 'object', additionalProperties: true },
      validation: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'path', 'written', 'validation']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/files/write', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('project-files-writer', 'DirectoryExplorer and NativeProjectFiles post to /api/fs/write over the shared writeWorkspaceFileGuarded writer.'),
        disconnected('vscode-extension-files-write', 'The VS Code/Antigravity extension edits local workspace buffers directly rather than /api/agent/files/write.'),
      ],
      cli: [],
      mcp: [connected('write_workspace_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "write_workspace_file"')],
      agentApi: true,
      builtInHarness: [disconnected('project-files-write', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/files/write"')],
    },
  },
  {
    id: 'history.list',
    version: 2,
    title: 'List workspace activity history',
    description: 'Read the existing workspace-scoped action ledger and its honest ledger-failure state.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', maxLength: 64 },
        outcome: { type: 'string', maxLength: 64 },
        file: { type: 'string', maxLength: 1024 },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
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
      mcp: [connected('list_action_history', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_action_history"')],
      agentApi: true,
      builtInHarness: [disconnected('activity-history', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/history"')],
    },
  },
  {
    id: 'history.raw.read',
    version: 1,
    title: 'Read raw diff, before, after, or diagnostics blob for an Action Ledger entry',
    description: 'Read the content-addressed diff, before-file, after-file, or diagnostics/file-effects payload attached to an Action Ledger entry in the addressed workspace, verifying deployment receipt hashes when applicable and capping output at 256 KiB.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', maxLength: 128, description: 'Action Ledger entry id from history.list.' },
        which: { type: 'string', enum: ['diff', 'before', 'after', 'diagnostics'], default: 'diff' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      workspaceId: { type: 'string' },
      id: { type: 'string' },
      which: { type: 'string', enum: ['diff', 'before', 'after', 'diagnostics'] },
      bytes: { type: 'integer', minimum: 0 },
      contentLength: { type: 'integer', minimum: 0 },
      contentTruncated: { type: 'boolean' },
      content: { type: 'string' },
    }, ['ok', 'workspaceId', 'id', 'which', 'bytes', 'contentLength', 'contentTruncated', 'content']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [{ method: 'GET', path: '/api/agent/history/raw', inputLocation: 'query', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('studio-history-raw-adapter', 'Web Studio AgentBridge fetches GET /api/agent/history/:id/raw directly when expanding an action row.'),
        disconnected('vscode-extension-history-raw', 'The VS Code/Antigravity extension has no activity-history raw viewer.'),
      ],
      cli: [],
      mcp: [connected('read_action_history_blob', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "read_action_history_blob"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/history/raw"')],
    },
  },
  {
    id: 'history.revert',
    version: 2,
    title: 'Revert a workspace activity entry',
    description: 'Revert one eligible Action Ledger entry by id in the addressed workspace. Workspace and deploy recovery-receipt rows are one-use and CAS-checked; ordinary before-blob file edit reverts use the guarded Mod Workspace writer. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 96, description: 'Action Ledger entry id from history.list.' },
        detail: { type: 'string', enum: ['compact', 'full'], description: 'Response detail level for workspace recovery restores; compact omits the full echoed workspace.' },
      },
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
      { method: 'POST', path: '/api/agent/history/revert', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('source-control-history', 'AgentBridge posts to /api/agent/history/:id/revert over the shared handleHistoryRevertById engine.'),
        disconnected('vscode-extension-history-revert', 'The VS Code/Antigravity extension has no canonical history.revert action.'),
      ],
      cli: [],
      mcp: [connected('revert_action_history', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "revert_action_history"')],
      agentApi: true,
      builtInHarness: [disconnected('activity-history', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/history/revert"')],
    },
  },
  {
    id: 'patch.base.read',
    version: 1,
    title: 'Read target XML base content for RFC 5261 patch authoring',
    description: 'Resolve and read an XML patch target file across Mod Workspace, loose game files, loose installed extensions, or packed base-game .cat/.dat archives, bounding UTF-8 output at 512 KiB and redacting host filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['targetFile'],
      properties: {
        targetFile: { type: 'string', maxLength: 1024, description: 'Relative target XML path, e.g. libraries/wares.xml or libraries/jobs.xml.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      targetFile: { type: 'string' },
      source: { type: 'string', enum: ['loose', 'packed'] },
      sourceKind: { type: 'string', enum: ['workspace', 'game-loose', 'extension-loose', 'packed'] },
      extensionFolder: { type: 'string' },
      archive: { type: 'string' },
      note: { type: 'string' },
      bytes: { type: 'number' },
      contentLength: { type: 'number' },
      contentTruncated: { type: 'boolean' },
      sha256: { type: 'string' },
      content: { type: 'string' },
    }, ['ok', 'success', 'targetFile', 'source', 'sourceKind', 'bytes', 'contentLength', 'contentTruncated', 'sha256', 'content']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/patch/base-content', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('xml-patch-base-content', 'XMLPatchSystem reads GET /api/patch/base-content; agent callers use the host-path-redacted GET /api/agent/patch/base-content adapter.'),
        disconnected('vscode-extension-patch-base-content', 'The VS Code/Antigravity extension delegates base-content target reads to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('read_patch_base_content', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "read_patch_base_content"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/patch/base-content"')],
    },
  },
  {
    id: 'patch.diff.simulate',
    version: 1,
    title: 'Simulate an RFC 5261 XML diff patch against canonical X4 base+DLC XML',
    description: 'Run the deterministic X4 XML diff interpreter over a composed canonical base+DLC target file and a submitted <diff> payload without modifying disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Canonical relative X4 XML target path, e.g. libraries/wares.xml.' },
        content: { type: 'string', maxLength: 5_000_000, description: 'Submitted <diff> XML document.' },
      },
    },
    outputSchema: objectOutput({
      path: { type: 'string' },
      base: { type: 'object', additionalProperties: true },
      ok: { type: 'boolean' },
      content: { type: 'string' },
      operations: { type: 'array', items: { type: 'object', additionalProperties: true } },
      findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['path', 'base', 'ok', 'content', 'operations', 'findings']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/reference/simulate-diff', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-diff-simulate', 'Web Studio previews base XML via /api/reference/effective-file; Agent API and MCP run server-side diff simulation.'),
        disconnected('vscode-extension-diff-simulate', 'The extension delegates diff simulation to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [partial('simulate_xml_diff', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "simulate_xml_diff"', 'MCP caps submitted diff content at 512 KiB and truncates returned merged XML at 256 KiB.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/reference/simulate-diff"')],
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
    id: 'patch.targets.list',
    version: 1,
    title: 'List base and DLC XML patch target paths',
    description: 'Search relative X4 base-game and official DLC XML target paths eligible for RFC 5261 <diff> patching.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 256, description: 'Optional case-insensitive path substring filter, e.g. jobs or wares.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum matching target paths to return (default 25, max 100).' },
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      total: { type: 'number' },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['success', 'total', 'items']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/patch-targets', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('xml-patch-target-picker', 'XMLPatchSystem passes endpoint="/api/agent/patch-targets" into its target picker component.'),
        disconnected('vscode-extension-patch-targets', 'The VS Code/Antigravity extension has no dedicated patch-target picker UI.'),
      ],
      cli: [],
      mcp: [connected('list_patch_targets', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_patch_targets"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/patch-targets"')],
    },
  },
  {
    id: 'patch.xpath.complete',
    version: 1,
    title: 'Complete XPath selectors against composed canonical X4 base+DLC XML',
    description: 'Compute ranked XPath element, attribute, and predicate selector completions at a cursor offset against a composed canonical base+DLC XML target document without mutating disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'selector', 'cursor'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Canonical relative XML path, e.g. libraries/wares.xml.' },
        selector: { type: 'string', maxLength: 16_384, description: 'Current XPath selector text.' },
        cursor: { type: 'integer', minimum: 0, description: 'Zero-based cursor offset within selector.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum completions to return (default 50, max 100).' },
        refresh: { type: 'boolean', description: 'Force refresh of the canonical reference composition before completing.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      path: { type: 'string' },
      available: { type: 'boolean' },
      complete: { type: 'boolean' },
      signature: { type: 'string' },
      sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
      findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
      incompleteFindings: { type: 'array', items: { type: 'object', additionalProperties: true } },
      total: { type: 'number' },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'path', 'available', 'complete', 'signature', 'sources', 'findings', 'incompleteFindings', 'total', 'items']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/patch/xpath-complete', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('xpath-input-completions', 'XPathInput posts to /api/reference/xpath-complete; agent callers use the closed-input /api/agent/patch/xpath-complete adapter.'),
        disconnected('vscode-extension-xpath-complete', 'The VS Code/Antigravity extension delegates canonical XPath selector completion to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('complete_xpath_selector', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "complete_xpath_selector"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/patch/xpath-complete"')],
    },
  },
  {
    id: 'patch.xpath.synthesize',
    version: 1,
    title: 'Synthesize minimal RFC 5261 X4 XML diff operations',
    description: 'Compute minimal id/name-anchored X4 <diff> add, replace, and remove operations turning a vanilla or canonical composed XML document into a modified XML candidate without writing disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['editedXml'],
      properties: {
        editedXml: { type: 'string', maxLength: 2_000_000, description: 'Modified full XML document.' },
        vanillaXml: { type: 'string', maxLength: 2_000_000, description: 'Baseline vanilla XML document when supplied inline.' },
        targetFile: { type: 'string', maxLength: 1024, description: 'Relative X4 XML target path when resolving vanilla/canonical base XML.' },
        sourceSignature: {
          anyOf: [
            { type: 'string', maxLength: 128 },
            { type: 'null' },
          ],
          description: 'Optional canonical effective-reference signature for CAS revision verification.',
        },
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      targetFile: { type: ['string', 'null'] },
      sourceSignature: { type: ['string', 'null'] },
      diffXml: { type: 'string' },
      ops: { type: 'array', items: { type: 'object', additionalProperties: true } },
      warnings: { type: 'array', items: { type: 'string' } },
      base: { type: 'object', additionalProperties: true },
    }, ['success', 'diffXml', 'ops', 'warnings']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/xpath-synth', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('xml-patch-diff-to-patch', 'src/components/XMLPatchSystem.tsx::/api/agent/xpath-synth'),
        disconnected('vscode-extension-xpath-synth', 'The VS Code/Antigravity extension delegates diff-to-patch synthesis to Studio, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [partial('synthesize_xml_patch', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "synthesize_xml_patch"', 'MCP caps XML inputs at 512 KiB, diffXml output at 256 KiB, and ops at 200.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/xpath-synth"')],
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
    id: 'performance.native.collect',
    version: 1,
    title: 'Start bounded native host performance collection',
    description: 'Collect expiring resource samples in the owned extension host. Its process is shared with other extensions. Requires an explicit native grant and the exact current backend/native identities; execution ACK is distinct from transport delivery.',
    inputSchema: { type: 'object', properties: {
      expectedBackendInstanceId: NATIVE_PERFORMANCE_ID_SCHEMA, expectedNativeInstanceId: NATIVE_PERFORMANCE_ID_SCHEMA,
      durationMs: { type: 'integer', description: '1000–900000 milliseconds; defaults to 60000.' },
      intervalMs: { type: 'integer', description: '1000–60000 milliseconds; defaults to 2000.' },
      eventLoopDelay: { type: 'boolean', description: 'Explicit event-loop delay monitoring; defaults to false.' },
    }, required: ['expectedBackendInstanceId', 'expectedNativeInstanceId'], additionalProperties: false },
    outputSchema: nativePerformanceReportSchema('start'),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/performance/native/collection', inputLocation: 'body', role: 'primary' }],
    surfaces: { ui: [
      connected('native-performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance/native/collection'),
      disconnected('vscode-extension-native-performance-collection', 'Use the connected shared app panel and native API; no dedicated native-host UI control is connected. Installed Antigravity rendering and native-control qualification remain pending Batch4.'),
    ], cli: [], mcp: [partial('start_forge_native_performance_capture', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "start_forge_native_performance_capture"', 'Native execution ACK only; no retained snapshots or function profiles. Installed host qualification remains pending.')],
    agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/performance/native/collection"')] },
  },
  {
    id: 'performance.native.read',
    version: 1,
    title: 'Read native host performance evidence',
    description: 'Read the bounded native extension-host snapshot and freshness/ownership state without starting collection. Shared-process resources include other extensions. Missing transport and unsampled metrics remain explicit.',
    inputSchema: EMPTY_INPUT, outputSchema: nativePerformanceReportSchema('read'),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'GET', path: '/api/agent/performance/native', inputLocation: 'none', role: 'primary' }],
    surfaces: { ui: [
      connected('native-performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance/native'),
      disconnected('vscode-extension-native-performance-read', 'Use the connected shared app panel and native API; no dedicated native-host UI control is connected. Installed Antigravity rendering and native-control qualification remain pending Batch4.'),
    ], cli: [], mcp: [partial('get_forge_native_performance', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_forge_native_performance"', 'Bounded native/shared-process evidence with exact producer identity, ownership and freshness. Installed host qualification remains pending.')],
    agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/performance/native"')] },
  },
  {
    id: 'performance.native.stop',
    version: 1,
    title: 'Stop an exact native performance capture',
    description: 'Stop the explicitly addressed native capture owned by the caller, or explicitly targeted by the trusted Studio operator. Requires exact backend/native/capture identities and an explicit native grant; uncertain cleanup remains a failure.',
    inputSchema: { type: 'object', properties: {
      expectedBackendInstanceId: NATIVE_PERFORMANCE_ID_SCHEMA, expectedNativeInstanceId: NATIVE_PERFORMANCE_ID_SCHEMA, captureId: NATIVE_PERFORMANCE_ID_SCHEMA,
    }, required: ['expectedBackendInstanceId', 'expectedNativeInstanceId', 'captureId'], additionalProperties: false },
    outputSchema: nativePerformanceReportSchema('stop'),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/performance/native/stop', inputLocation: 'body', role: 'primary' }],
    surfaces: { ui: [
      connected('native-performance-panel', 'src/components/PerformancePanel.tsx::/api/agent/performance/native/stop'),
      disconnected('vscode-extension-native-performance-stop', 'Use the connected shared app panel and native API; no dedicated native-host UI control is connected. Installed Antigravity rendering and native-control qualification remain pending Batch4.'),
    ], cli: [], mcp: [partial('stop_forge_native_performance_capture', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "stop_forge_native_performance_capture"', 'Exact-target cleanup ACK with caller-relative ownership; no implicit global stop or read grant. Installed host qualification remains pending.')],
    agentApi: true, builtInHarness: [], externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/performance/native/stop"')] },
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
    id: 'project.ai.navigation',
    version: 1,
    title: 'Navigate authored AI scripts',
    description: 'Find the exact definition or references for a literal run_script name in a supplied authored AI XML snapshot. Requires a key explicitly granted this capability and the addressed workspace. Locations refer to the submitted text.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['project', 'path', 'offset', 'mode'],
      properties: {
        project: {
          type: 'object', additionalProperties: false, required: ['id', 'name', 'files'],
          properties: {
            id: { type: 'string', maxLength: 256 }, name: { type: 'string', maxLength: 512 },
            files: { type: 'array', description: 'Up to 512 authored files, each up to 8 MiB UTF-8, up to 32 MiB total before transport limits.',
              items: { type: 'object', additionalProperties: false, required: ['path'], properties: {
                path: { type: 'string', maxLength: 1024 }, content: { type: 'string' },
              } } },
          },
        },
        path: { type: 'string', maxLength: 1024, description: 'Exact project-relative aiscripts XML path.' },
        offset: { type: 'integer', minimum: 0, maximum: 8_388_608, description: 'Zero-based UTF-16 character offset in the supplied file.' },
        mode: { type: 'string', enum: ['definition', 'references'] },
        includeDeclaration: { type: 'boolean', default: false },
      },
    },
    outputSchema: objectOutput({
      schemaVersion: { type: 'string', enum: ['forge.ai-navigation.v1'] }, workspaceId: { type: 'string' },
      scope: { type: 'string', enum: ['authored-ai-snapshot'] }, inputHash: { type: 'string' },
      modId: { type: 'string' }, sourceHash: { type: 'string' }, sourceHashScope: { type: 'string' },
      status: { type: 'string', enum: ['resolved', 'not-found', 'not-a-literal', 'ambiguous', 'unavailable'] },
      reason: { type: 'string', enum: ['focus', 'inventory', 'source', 'limit'] },
      locations: { type: 'array', items: objectOutput({
        file: { type: 'string' },
        start: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column']),
        end: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column']),
      }, ['file', 'start', 'end']) },
    }, ['schemaVersion', 'workspaceId', 'scope', 'inputHash', 'status']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/project/ai-navigation', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('vscode-extension-ai-snapshot-navigation', 'Native editor navigation uses the active document and its authored context.'),
        disconnected('studio-ai-snapshot-navigation', 'The agent submits the authored snapshot and caret offset through API or MCP.'),
      ],
      cli: [],
      mcp: [connected('navigate_ai_script', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "navigate_ai_script"')],
      agentApi: true, builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/project/ai-navigation'")],
    },
  },
  {
    id: 'project.brief.read',
    version: 1,
    title: 'Generate deterministic mod agent brief and grounding notes',
    description: 'Read deterministic AGENTS.md and X4_NOTES.md source text plus mod domain, file-ownership, cue-index, and default MCP tool inventory for a guarded mod folder without mutating disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fromPath'],
      properties: {
        fromPath: { type: 'string', maxLength: 512, description: 'Mod folder name under the configured Mod Workspace root.' },
      },
    },
    outputSchema: objectOutput({
      input: objectOutput({
        modId: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        generatedFiles: { type: 'array', items: { type: 'string' } },
        domainsPresent: { type: 'array', items: { type: 'string' } },
        cueNames: { type: 'array', items: { type: 'string' } },
        mcpTools: { type: 'array', items: { type: 'string' } },
      }, ['modId', 'files', 'generatedFiles', 'domainsPresent', 'cueNames', 'mcpTools']),
      agentsMd: { type: 'string' },
      notesMd: { type: 'string' },
    }, ['input', 'agentsMd', 'notesMd']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/project/brief', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-project-brief', 'Web Studio has no dedicated agent brief regeneration button; brief generation runs from the VS Code/Antigravity command, API, or MCP.'),
        connected('vscode-extension-project-brief', 'vscode-extension/src/extension.ts::/api/agent/project/brief'),
      ],
      cli: [],
      mcp: [connected('get_agent_brief', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_agent_brief"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/project/brief"')],
    },
  },
  {
    id: 'project.md.navigation',
    version: 1,
    title: 'Navigate authored Mission Director scripts',
    description: 'Find the exact definition or references for a literal cue or library name in a supplied authored Mission Director XML snapshot. Requires a key explicitly granted this capability and the addressed workspace. Locations refer to the submitted text.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['project', 'path', 'offset', 'mode'],
      properties: {
        project: {
          type: 'object', additionalProperties: false, required: ['id', 'name', 'files'],
          properties: {
            id: { type: 'string', maxLength: 256 }, name: { type: 'string', maxLength: 512 },
            files: { type: 'array', description: 'Up to 512 authored files, each up to 8 MiB UTF-8, up to 32 MiB total before transport limits.',
              items: { type: 'object', additionalProperties: false, required: ['path'], properties: {
                path: { type: 'string', maxLength: 1024 }, content: { type: 'string' },
              } } },
          },
        },
        path: { type: 'string', maxLength: 1024, description: 'Exact project-relative md XML path.' },
        offset: { type: 'integer', minimum: 0, maximum: 8_388_608, description: 'Zero-based UTF-16 character offset in the supplied file.' },
        mode: { type: 'string', enum: ['definition', 'references'] },
        includeDeclaration: { type: 'boolean', default: false },
      },
    },
    outputSchema: objectOutput({
      schemaVersion: { type: 'string', enum: ['forge.md-navigation.v1'] }, workspaceId: { type: 'string' },
      scope: { type: 'string', enum: ['authored-md-snapshot'] }, inputHash: { type: 'string' },
      modId: { type: 'string' }, sourceHash: { type: 'string' }, sourceHashScope: { type: 'string' },
      status: { type: 'string', enum: ['resolved', 'not-found', 'not-a-literal', 'ambiguous', 'unavailable'] },
      reason: { type: 'string', enum: ['focus', 'inventory', 'source', 'limit'] },
      locations: { type: 'array', items: objectOutput({
        file: { type: 'string' },
        start: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column']),
        end: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column']),
      }, ['file', 'start', 'end']) },
    }, ['schemaVersion', 'workspaceId', 'scope', 'inputHash', 'status']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'], confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/project/md-navigation', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('vscode-extension-md-snapshot-navigation', 'Native editor navigation uses the active document and its authored context.'),
        disconnected('studio-md-snapshot-navigation', 'The agent submits the authored snapshot and caret offset through API or MCP.'),
      ],
      cli: [],
      mcp: [connected('navigate_md_script', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "navigate_md_script"')],
      agentApi: true, builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/project/md-navigation'")],
    },
  },
  {
    id: 'project.md.rename',
    version: 1,
    title: 'Preview or CAS-apply Mission Director cue/library symbol rename',
    description: 'Plan or compare-and-swap commit an exact Mission Director cue or library symbol rename across all physical md/*.xml files in a Mod Workspace mod folder (or the addressed Studio workspace), refusing unsafe captures, opaque $which operands, unmodeled property expressions, casefolded collisions, and stale file SHA-256 digests. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['file', 'offset', 'newName'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside Mod Workspace (mutually exclusive with useAddressedWorkspace).' },
        useAddressedWorkspace: { type: 'boolean', description: 'Resolve target mod folder from the addressed Studio workspace source directory.' },
        file: { type: 'string', maxLength: 1024, description: 'Direct md/<name>.xml path inside the target mod folder.' },
        offset: { type: 'integer', minimum: 0, maximum: 8_388_608, description: 'Zero-based UTF-16 character offset in the target MD file.' },
        newName: { type: 'string', maxLength: 128, description: 'New Mission Director cue or library identifier.' },
        apply: { type: 'boolean', default: false, description: 'When false (default), dry-run preview edits and expectedSha256ByFile without mutating disk; when true, CAS-commit edits.' },
        expectedSha256ByFile: {
          type: 'object',
          additionalProperties: { type: 'string', maxLength: 64 },
          description: 'Required when apply is true: map of relative MD path -> 64-char lowercase hex SHA-256 from preview.',
        },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      applied: { type: 'boolean' },
      modId: { type: 'string' },
      symbolFile: { type: 'string' },
      newName: { type: 'string' },
      editCount: { type: 'integer', minimum: 0 },
      touchedFiles: { type: 'array', items: { type: 'string' } },
      expectedSha256ByFile: { type: 'object', additionalProperties: { type: 'string' } },
      writtenByFile: { type: 'object', additionalProperties: true },
      edits: {
        type: 'array',
        items: objectOutput({
          file: { type: 'string' },
          start: { type: 'integer', minimum: 0 },
          end: { type: 'integer', minimum: 0 },
          line: { type: 'integer', minimum: 0 },
          column: { type: 'integer', minimum: 0 },
          before: { type: 'string' },
          after: { type: 'string' },
        }, ['file', 'start', 'end', 'line', 'column', 'before', 'after']),
      },
    }, ['ok', 'success', 'applied', 'modId', 'symbolFile', 'newName', 'editCount', 'touchedFiles', 'expectedSha256ByFile', 'edits']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/mod-folder/md-rename', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('vscode-extension-md-rename', 'Native VS Code/Antigravity x4forge.renameMdSymbol executes shared planMdRename directly on workspace documents.'),
        disconnected('studio-md-rename', 'Web Studio exposes graph cue editing rather than physical-file UTF-16 offset rename; agents use API or MCP.'),
      ],
      cli: [],
      mcp: [connected('rename_md_symbol', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "rename_md_symbol"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/mod-folder/md-rename"')],
    },
  },
  {
    id: 'project.proof.read',
    version: 1,
    title: 'Read server-computed mod proof markdown',
    description: 'Render the deterministic PROOF.md machine-evidence report for the addressed workspace and an optional guarded mod folder, combining readiness stages, watcher verdict, folder validation, and save-impact facts without writing disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fromPath: { type: 'string', maxLength: 512, description: 'Optional mod folder name under the configured Mod Workspace root.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      workspaceId: { type: 'string' },
      workspace: { type: 'string' },
      markdown: { type: 'string' },
    }, ['ok', 'workspaceId', 'workspace', 'markdown']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/proof', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-proof', 'Web Studio renders the live ReadinessLadder inline rather than generating PROOF.md.'),
        connected('vscode-extension-proof', 'vscode-extension/src/extension.ts::/api/agent/proof'),
      ],
      cli: [],
      mcp: [connected('get_mod_proof', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_mod_proof"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/proof"')],
    },
  },
  {
    id: 'project.symbols.search',
    version: 1,
    title: 'Search multi-source Workspace Symbols across mod, DLC, base-game, and installed scripts',
    description: 'Search Mission Director scripts, cues, and libraries plus AIScripts and interrupt-handler libraries across an authored Mod Workspace mod folder (or the addressed Studio workspace), unpacked base-game and official DLC reference catalogs, and loose installed extensions without exposing host filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['q'],
      properties: {
        q: { type: 'string', maxLength: 256, description: 'Case-insensitive symbol or qualified md.Script.Cue query.' },
        path: { type: 'string', maxLength: 1024, description: 'Optional relative mod folder inside Mod Workspace; defaults to the addressed Studio workspace when omitted.' },
        includeReference: { type: 'boolean', default: true, description: 'Include unpacked base-game and official DLC script symbols.' },
        includeInstalled: { type: 'boolean', default: true, description: 'Include loose installed extension script symbols under X4 extensions/.' },
        kind: { type: 'string', enum: ['script', 'cue', 'library', 'interrupt-handler'] },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      query: { type: 'string' },
      total: { type: 'integer', minimum: 0 },
      truncated: { type: 'boolean' },
      referenceIncluded: { type: 'boolean' },
      installedIncluded: { type: 'boolean' },
      countsByScope: objectOutput({
        authored: { type: 'integer', minimum: 0 },
        base: { type: 'integer', minimum: 0 },
        dlc: { type: 'integer', minimum: 0 },
        installed: { type: 'integer', minimum: 0 },
      }, ['authored', 'base', 'dlc', 'installed'], false),
      symbols: {
        type: 'array',
        items: objectOutput({
          name: { type: 'string' },
          qualifiedName: { type: 'string' },
          container: { type: 'string' },
          kind: { type: 'string', enum: ['script', 'cue', 'library', 'interrupt-handler'] },
          sourceScope: { type: 'string', enum: ['authored', 'base', 'dlc', 'installed'] },
          origin: { type: 'string' },
          file: { type: 'string' },
          start: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column'], false),
          end: objectOutput({ line: { type: 'integer', minimum: 0 }, column: { type: 'integer', minimum: 0 } }, ['line', 'column'], false),
        }, ['name', 'qualifiedName', 'container', 'kind', 'sourceScope', 'origin', 'file', 'start', 'end'], false),
      },
    }, ['ok', 'success', 'query', 'total', 'truncated', 'referenceIncluded', 'installedIncluded', 'countsByScope', 'symbols']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [{ method: 'GET', path: '/api/agent/mod-folder/symbols', inputLocation: 'query', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('vscode-extension-workspace-symbols', 'Native VS Code/Antigravity registerWorkspaceSymbolProvider executes shared searchWorkspaceScriptSymbols in-process.'),
        disconnected('studio-workspace-symbols', 'Web Studio searches canvas nodes and reference browser panels separately; multi-source script symbol search runs over API, MCP, and IDE.'),
      ],
      cli: [],
      mcp: [connected('search_workspace_symbols', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "search_workspace_symbols"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/mod-folder/symbols"')],
    },
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
    id: 'reference.coverage.read',
    version: 1,
    title: 'Read X4 reference corpus domain and authority coverage',
    description: 'Read or schedule the SQLite reference-manifest coverage summary across canonical X4 domains, sources, and authority roles with host filesystem paths redacted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        refresh: { type: 'string', enum: ['0', '1'], description: 'When 1, schedule a fresh background reference-manifest scan.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      ready: { type: 'boolean' },
      status: { type: 'object', additionalProperties: true },
      coverage: {
        anyOf: [
          { type: 'object', additionalProperties: true },
          { type: 'null' },
        ],
      },
    }, ['ok', 'ready', 'status', 'coverage']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/reference/coverage', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('directory-settings-coverage', 'DirectorySettingsModal polls GET /api/reference/coverage; agent callers use the host-path-redacted GET /api/agent/reference/coverage adapter.'),
        disconnected('vscode-extension-reference-coverage', 'The VS Code/Antigravity extension delegates reference-manifest coverage inspection to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_reference_coverage', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_reference_coverage"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/reference/coverage"')],
    },
  },
  {
    id: 'reference.file.read',
    version: 1,
    title: 'Read composed canonical X4 base+DLC reference XML',
    description: 'Read a composed canonical base+DLC reference XML document or its script-symbol origins with host filesystem roots redacted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative path inside the X4 reference corpus, e.g. libraries/factions.xml.' },
        refresh: { type: 'string', enum: ['0', '1'] },
        view: { type: 'string', enum: ['script-symbol-origins'] },
        compact: { type: 'string', enum: ['0', '1'] },
      },
    },
    outputSchema: objectOutput({
      relativePath: { type: 'string' },
      available: { type: 'boolean' },
      complete: { type: 'boolean' },
      content: { type: 'string' },
      sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
      findings: { type: 'array', items: { type: 'object', additionalProperties: true } },
      scriptSymbolOrigins: { type: 'object', additionalProperties: true },
    }, ['relativePath', 'available', 'complete']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/reference/effective-file', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('xml-patch-system-base-preview', 'Web Studio reads /api/reference/effective-file directly; agent callers use the redacted /api/agent/reference/effective-file adapter over the same resolver.'),
        disconnected('vscode-extension-effective-file', 'The extension reads /api/reference/effective-file for local symbol origins; agent callers use the redacted /api/agent/reference/effective-file adapter.'),
      ],
      cli: [],
      mcp: [partial('read_reference_file', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "read_reference_file"', 'MCP caps returned XML content at 256 KiB and reports contentLength and contentTruncated.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/reference/effective-file"')],
    },
  },
  {
    id: 'reference.galaxy.read',
    version: 1,
    title: 'Read X4 galaxy cluster and sector coordinate map',
    description: 'Read merged base-game, DLC, and extension cluster and sector 3D placement coordinates from maps/xu_ep2_universe without exposing host filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 256, description: 'Optional case-insensitive cluster or sector macro substring filter.' },
      },
    },
    outputSchema: objectOutput({
      success: { type: 'boolean' },
      counts: { type: 'object', additionalProperties: { type: 'number' } },
      bounds: { type: 'object', additionalProperties: { type: 'number' } },
      clusters: { type: 'array', items: { type: 'object', additionalProperties: true } },
      sectors: { type: 'array', items: { type: 'object', additionalProperties: true } },
      sources: { type: 'object', additionalProperties: true },
    }, ['success', 'counts', 'bounds', 'clusters', 'sectors']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/galaxy-map', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('galaxy-map-view', 'src/components/GalaxyMapView.tsx::/api/agent/galaxy-map'),
        disconnected('vscode-extension-galaxy-map', 'The VS Code/Antigravity extension delegates universe map inspection to Studio, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_galaxy_map', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_galaxy_map"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/galaxy-map"')],
    },
  },
  {
    id: 'reference.objects.search',
    version: 1,
    title: 'Search indexed X4 ships, stations, wares, factions, jobs, macros, and MD elements',
    description: 'Search the local loose and packed .cat/.dat X4 object index with localized display names and schema elements.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 256 },
        kind: { type: 'string', enum: ['all', 'ship', 'station', 'ware', 'faction', 'sound', 'job', 'aiscript', 'md_element', 'macro'] },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
    },
    outputSchema: objectOutput({
      roots: { type: 'array', items: { type: 'string' } },
      scannedFiles: { type: 'number' },
      skippedFiles: { type: 'number' },
      truncated: { type: 'boolean' },
      packedArchives: { type: 'number' },
      packedEntriesScanned: { type: 'number' },
      counts: { type: 'object', additionalProperties: { type: 'number' } },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['scannedFiles', 'skippedFiles', 'truncated', 'counts', 'items']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/object-index', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('object-browser', 'src/components/ObjectBrowser.tsx::/api/agent/object-index'),
        disconnected('vscode-extension-object-index', 'The extension delegates object-index searches to Studio, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [partial('search_x4_objects', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "search_x4_objects"', 'MCP omits host filesystem roots and caps returned items at 200.')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/object-index"')],
    },
  },
  {
    id: 'reference.status.read',
    version: 1,
    title: 'Read X4 reference corpus and manifest status',
    description: 'Read canonical X4 reference corpus availability, counts, generation, and manifest state without exposing host filesystem root paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        observe: { type: 'string', enum: ['0', '1'], description: 'When 1, inspect in-memory corpus/manifest readiness without starting a cold load.' },
        refresh: { type: 'string', enum: ['0', '1'] },
      },
    },
    outputSchema: objectOutput({
      available: { type: 'boolean' },
      observed: { type: 'boolean' },
      state: { type: 'string' },
      manifestGeneration: { type: ['string', 'null'] },
      sourceFiles: { type: 'number' },
      counts: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
      manifest: { type: 'object', additionalProperties: true },
    }, ['available', 'manifestGeneration', 'sourceFiles', 'counts', 'manifest']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/reference/status', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('corpus-status', 'Studio and discovery read the public /api/reference/status endpoint; agent callers use the redacted /api/agent/reference/status adapter.'),
        disconnected('vscode-extension-reference-status', 'The extension checks the local backend directly; agent callers use /api/agent/reference/status and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_reference_status', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_reference_status"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/reference/status"')],
    },
  },
  {
    id: 'reference.suggest',
    version: 1,
    title: 'Search and rank canonical + workspace X4 reference symbols',
    description: 'Suggest and rank canonical base+DLC plus addressed-workspace faction, ware, sector, macro, job, or aiscript symbols for authoring, references, or diff selectors.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['faction', 'ware', 'sector', 'macro', 'job', 'aiscript'] },
        q: { type: 'string', maxLength: 256 },
        intent: { type: 'string', enum: ['reference', 'new-definition', 'selector'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        refresh: { type: 'string', enum: ['0', '1'] },
      },
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'q'],
          properties: {
            kind: { type: 'string', enum: ['faction', 'ware', 'sector', 'macro', 'job', 'aiscript'] },
            q: { type: 'string', maxLength: 256 },
            intent: { type: 'string', enum: ['reference', 'new-definition', 'selector'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            refresh: { type: 'string', enum: ['0', '1'] },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'limit'],
          properties: {
            kind: { type: 'string', enum: ['faction', 'ware', 'sector', 'macro', 'job', 'aiscript'] },
            q: { type: 'string', maxLength: 256 },
            intent: { type: 'string', enum: ['reference', 'new-definition', 'selector'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            refresh: { type: 'string', enum: ['0', '1'] },
          },
        },
      ],
    },
    outputSchema: objectOutput({
      generation: { type: 'string' },
      kind: { type: 'string', enum: ['faction', 'ware', 'sector', 'macro', 'job', 'aiscript'] },
      query: { type: 'string' },
      intent: { type: 'string', enum: ['reference', 'new-definition', 'selector'] },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['generation', 'kind', 'query', 'intent', 'items']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/reference/suggest', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('library-configurator-suggest', 'Web Studio reads /api/reference/suggest over the same suggestReferences engine; canonical agent callers use /api/agent/reference/suggest.'),
        disconnected('vscode-extension-reference-suggest', 'The extension uses /api/reference/complete for editor completions rather than /api/agent/reference/suggest.'),
      ],
      cli: [],
      mcp: [connected('search_reference_symbols', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "search_reference_symbols"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/reference/suggest"')],
    },
  },
  {
    id: 'release.artifact.verify',
    version: 1,
    title: 'Verify a prepared Nexus or Steam release archive against its Forge release report',
    description: 'Verify on disk that a prepared Nexus Mods ZIP or Steam Workshop backup ZIP inside the release output root matches its recorded .forge-release.json SHA-256, byte size, and source provenance without streaming raw binary archive bytes over stdio.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['platform', 'modId', 'artifactFile'],
      properties: {
        platform: { type: 'string', enum: ['nexus', 'steam'], description: 'Release output platform root to inspect.' },
        modId: { type: 'string', maxLength: 256, description: 'Artifact folder / mod identifier recorded in the Forge release report.' },
        artifactFile: { type: 'string', maxLength: 256, description: 'Single-segment prepared .zip filename inside the platform release output root.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      verified: { type: 'boolean' },
      platform: { type: 'string' },
      modId: { type: 'string' },
      artifactFile: { type: 'string' },
      reportFile: { type: 'string' },
      sha256: { type: 'string' },
      sizeBytes: { type: 'number' },
    }, ['ok', 'success', 'verified', 'platform', 'modId', 'artifactFile', 'reportFile', 'sha256', 'sizeBytes']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/release/artifact/status', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('release-center-artifact-verify', 'ReleaseCenter verifies and streams archives via POST /api/agent/release/artifact/download over the shared verifyPreparedReleaseArtifact check.'),
        disconnected('vscode-extension-release-artifact-verify', 'The VS Code/Antigravity extension delegates release verification to Studio Release Center and MCP.'),
      ],
      cli: [],
      mcp: [connected('verify_release_artifact', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "verify_release_artifact"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.get('/api/agent/release/artifact/status'")],
    },
  },
  {
    id: 'release.nexus.prepare',
    version: 1,
    title: 'Package and reopen-verify a Nexus Mods release ZIP archive',
    description: 'Validate a mod source folder inside Mod Workspace (or the addressed Studio workspace), build a reopen-verified Nexus Mods release ZIP plus its .forge-release.json provenance report, and return redacted relative artifact filenames and SHA-256 receipts. Requires an explicit deploy key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside Mod Workspace (mutually exclusive with useAddressedWorkspace: true).' },
        useAddressedWorkspace: { type: 'boolean', description: 'When true, package the addressed Studio workspace instead of a relative Mod Workspace folder.' },
        bump: { type: 'string', enum: ['none', 'patch', 'minor'], description: 'Optional content.xml version bump applied inside the packaged release manifest (default none).' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string' },
      platform: { type: 'string' },
      modId: { type: 'string' },
      folderName: { type: 'string' },
      version: { type: 'string' },
      artifactFile: { type: 'string' },
      reportFile: { type: 'string' },
      sha256: { type: 'string' },
      sizeBytes: { type: 'number' },
      fileCount: { type: 'number' },
      stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'success', 'status', 'platform', 'modId', 'folderName', 'version', 'artifactFile', 'reportFile', 'sha256', 'sizeBytes', 'fileCount', 'stages']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/release/nexus/build', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('release-center-nexus-prepare', 'ReleaseCenter packages Nexus archives via POST /api/agent/release/nexus/prepare over the shared executeNexusReleaseBuild engine.'),
        disconnected('vscode-extension-nexus-prepare', 'The VS Code/Antigravity extension delegates Nexus release packaging to Studio Release Center and MCP.'),
      ],
      cli: [],
      mcp: [connected('prepare_nexus_release', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "prepare_nexus_release"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/release/nexus/build'")],
    },
  },
  {
    id: 'release.steam.adopt',
    version: 1,
    title: 'Preview or CAS-adopt verified Steam Workshop ID metadata into source content.xml',
    description: 'Preview (apply: false) or compare-and-swap adopt (apply: true) the post-WorkshopTool verified ws_<numeric> Workshop ID and release version from staged content.xml back into the Mod Workspace source content.xml with physical file-identity guards and automatic rollback on mismatch. Requires an explicit deploy key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId'],
      properties: {
        modId: { type: 'string', maxLength: 256, description: 'Safe modId matching the verified <modId>.forge-release.json Steam report.' },
        apply: { type: 'boolean', default: false, description: 'When false or omitted, returns before/after manifest preview and bindingHash without writing disk; when true, requires expectedSourceSha256, expectedWorkshopId, and expectedBindingHash.' },
        expectedSourceSha256: { type: 'string', maxLength: 64, description: '64-hex SHA-256 of source content.xml from the adoption preview (required when apply is true).' },
        expectedWorkshopId: { type: 'string', maxLength: 64, description: 'Verified ws_<numeric> Workshop ID from the adoption preview (required when apply is true).' },
        expectedBindingHash: { type: 'string', maxLength: 64, description: '64-hex adoption preview bindingHash (required when apply is true).' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string' },
      platform: { type: 'string' },
      modId: { type: 'string' },
      sourceManifestFile: { type: 'string' },
      workshopId: { type: 'string' },
      version: { type: 'string' },
      beforeSha256: { type: 'string' },
      afterSha256: { type: 'string' },
      bindingHash: { type: 'string' },
      sourceWritePerformed: { type: 'boolean' },
      stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'success', 'status', 'platform', 'modId', 'sourceManifestFile', 'workshopId', 'version', 'beforeSha256', 'afterSha256', 'bindingHash', 'sourceWritePerformed', 'stages']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/release/steam/apply-adoption', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('release-center-steam-adopt', 'ReleaseCenter adopts Workshop metadata via POST /api/agent/release/steam/adopt over the shared executeSteamReleaseAdopt engine.'),
        disconnected('vscode-extension-steam-adopt', 'The VS Code/Antigravity extension delegates Steam Workshop ID adoption to Studio Release Center and MCP.'),
      ],
      cli: [],
      mcp: [connected('adopt_steam_workshop_id', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "adopt_steam_workshop_id"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/release/steam/apply-adoption'")],
    },
  },
  {
    id: 'release.steam.prepare',
    version: 1,
    title: 'Prepare a verified Steam Workshop CAT/DAT staging folder and rollback backup ZIP',
    description: 'Validate a mod source folder inside Mod Workspace (or the addressed Studio workspace), build a verified Steam CAT/DAT staging folder, validate and stage an optional relative preview image, write a reopen-verified rollback backup ZIP plus its .forge-release.json provenance report, and return redacted relative filenames. Requires an explicit deploy key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside Mod Workspace (mutually exclusive with useAddressedWorkspace: true).' },
        useAddressedWorkspace: { type: 'boolean', description: 'When true, package the addressed Studio workspace instead of a relative Mod Workspace folder.' },
        bump: { type: 'string', enum: ['none', 'patch', 'minor'], description: 'Optional content.xml version bump applied inside the packaged release manifest (default none).' },
        previewFile: { type: 'string', maxLength: 256, description: 'Optional single-segment .png, .jpg, or .jpeg filename inside the mod folder.' },
        changeNote: { type: 'string', maxLength: 4000, description: 'Optional Workshop change note up to 4000 characters.' },
        minorUpdate: { type: 'boolean', description: 'When true on an existing ws_<numeric> Workshop mod, marks the release as an unchanged-version -minor update.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string' },
      platform: { type: 'string' },
      readyForUpload: { type: 'boolean' },
      modId: { type: 'string' },
      folderName: { type: 'string' },
      version: { type: 'string' },
      workshopId: { type: ['string', 'null'] },
      targetFolder: { type: 'string' },
      backupFile: { type: 'string' },
      backupHash: { type: 'string' },
      backupSizeBytes: { type: 'number' },
      reportFile: { type: 'string' },
      sourceManifestAdoptionAvailable: { type: 'boolean' },
      stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'success', 'status', 'platform', 'readyForUpload', 'modId', 'folderName', 'version', 'workshopId', 'targetFolder', 'backupFile', 'backupHash', 'backupSizeBytes', 'reportFile', 'sourceManifestAdoptionAvailable', 'stages']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/release/steam/build', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('release-center-steam-prepare', 'ReleaseCenter prepares Steam staging folders via POST /api/agent/release/steam/prepare over the shared executeSteamReleasePrepare engine.'),
        disconnected('vscode-extension-steam-prepare', 'The VS Code/Antigravity extension delegates Steam staging preparation to Studio Release Center and MCP.'),
      ],
      cli: [],
      mcp: [connected('prepare_steam_release', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "prepare_steam_release"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/release/steam/build'")],
    },
  },
  {
    id: 'release.steam.verify',
    version: 1,
    title: 'Verify staged Steam Workshop manifest mutation and CAT/DAT payload integrity after WorkshopTool',
    description: 'Verify on disk after interactive Egosoft WorkshopTool execution that staged content.xml contains a valid ws_<numeric> Workshop ID, only Workshop-managed manifest attributes changed relative to preparedManifestXml, and every non-manifest staged payload file remains byte-identical, updating <modId>.forge-release.json. Requires an explicit deploy key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId'],
      properties: {
        modId: { type: 'string', maxLength: 256, description: 'Safe modId matching the prepared <modId>.forge-release.json Steam report.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string' },
      platform: { type: 'string' },
      modId: { type: 'string' },
      workshopId: { type: 'string' },
      targetFolder: { type: 'string' },
      reportFile: { type: 'string' },
      sourceManifestAdoptionRequired: { type: 'boolean' },
      sourceManifestAdoptionAvailable: { type: 'boolean' },
      stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'success', 'status', 'platform', 'modId', 'workshopId', 'targetFolder', 'reportFile', 'sourceManifestAdoptionRequired', 'sourceManifestAdoptionAvailable', 'stages']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['read', 'analyze', 'filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/release/steam/check', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('release-center-steam-verify', 'ReleaseCenter verifies post-tool Steam output via POST /api/agent/release/steam/verify over the shared executeSteamReleaseVerify engine.'),
        disconnected('vscode-extension-steam-verify', 'The VS Code/Antigravity extension delegates post-tool Steam verification to Studio Release Center and MCP.'),
      ],
      cli: [],
      mcp: [connected('verify_steam_release', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "verify_steam_release"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/release/steam/check'")],
    },
  },
  {
    id: 'reviews.warning.revoke',
    version: 1,
    title: 'Revoke a deployment warning-review acceptance receipt',
    description: 'Record an immutable revocation receipt for a previously accepted deployment warning review belonging to the addressed workspace mod and source scope without modifying source or deployed game files. Requires an explicit deploy key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['receiptId', 'reviewScopeHash', 'reason'],
      properties: {
        receiptId: { type: 'string', maxLength: 67, description: 'Exact ar_<64-hex> warning-review acceptance receipt identifier to revoke.' },
        reviewScopeHash: { type: 'string', maxLength: 64, description: 'Exact 64-char lowercase hex reviewScopeHash matching the addressed workspace source and mod.' },
        reason: { type: 'string', maxLength: 512, description: 'Single-line revocation reason recorded in the immutable revocation receipt.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      outcome: { type: 'string' },
      scope: { type: 'string' },
      receipt: { type: 'object', additionalProperties: true },
      note: { type: 'string' },
    }, ['ok', 'outcome', 'scope', 'receipt', 'note']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/warning-reviews/revoke-review', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('deploy-warning-review-revoke', 'Studio revokes warning-review acceptances via POST /api/agent/warning-reviews/revoke over the shared handleWarningReviewRevoke owner.'),
        disconnected('vscode-extension-warning-review-revoke', 'The VS Code/Antigravity extension delegates warning-review revocation to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('revoke_warning_review', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "revoke_warning_review"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/warning-reviews/revoke-review'")],
    },
  },
  {
    id: 'rules.suppression.apply',
    version: 1,
    title: 'Commit a reviewed warning suppression rule to forge.rules.json',
    description: 'Reproduce an exact active warning and CAS-commit a reviewed forge.rules.json v1 suppression rule inside Mod Workspace using expectedSha256 (or null when creating forge.rules.json), capturing an Action Ledger diff and undo-create recovery receipt. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scope', 'expectedSha256', 'review'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside Mod Workspace (mutually exclusive with useAddressedWorkspace: true).' },
        useAddressedWorkspace: { type: 'boolean', description: 'When true, resolve the mod source folder from the addressed Studio workspace.' },
        scope: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: {
            code: { type: 'string', maxLength: 128 },
            file: { type: 'string', maxLength: 1024 },
            sourceRef: { type: 'string', maxLength: 1024 },
          },
        },
        expectedSha256: {
          anyOf: [
            { type: 'string', maxLength: 64 },
            { type: 'null' },
          ],
          description: 'Current 64-hex SHA-256 of forge.rules.json from rules.suppression.prepare, or null when creating forge.rules.json.',
        },
        review: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'owner', 'reason', 'reviewBy'],
          properties: {
            id: { type: 'string', maxLength: 128 },
            owner: { type: 'string', maxLength: 128 },
            reason: { type: 'string', maxLength: 1024 },
            reviewBy: { type: 'string', maxLength: 32 },
          },
        },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string' },
      target: { type: 'string' },
      rule: { type: 'object', additionalProperties: true },
      written: { type: 'object', additionalProperties: true },
      sourceHash: { type: 'string' },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'status', 'target', 'rule', 'written', 'sourceHash']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'preview-required',
    apiBindings: [
      { method: 'POST', path: '/api/agent/project-rules/suppression/apply', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('diagnostic-guidance-suppress', 'DiagnosticGuidance commits suppressions via POST /api/agent/project-rules/suppress over the shared executeWarningSuppressionCommit owner.'),
        disconnected('vscode-extension-suppression-apply', 'The VS Code/Antigravity extension edits forge.rules.json or delegates reviewed suppressions to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('apply_warning_suppression', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "apply_warning_suppression"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/project-rules/suppression/apply'")],
    },
  },
  {
    id: 'rules.suppression.prepare',
    version: 1,
    title: 'Prepare a reviewed warning suppression rule for forge.rules.json',
    description: 'Reproduce an exact active full-project warning on a Mod Workspace mod folder (or the addressed Studio workspace) and return the current forge.rules.json expectedSha256 CAS token, suggested rule metadata defaults, and remediation guidance without mutating disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['scope'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside Mod Workspace (mutually exclusive with useAddressedWorkspace: true).' },
        useAddressedWorkspace: { type: 'boolean', description: 'When true, resolve the mod source folder from the addressed Studio workspace.' },
        scope: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: {
            code: { type: 'string', maxLength: 128 },
            file: { type: 'string', maxLength: 1024 },
            sourceRef: { type: 'string', maxLength: 1024 },
          },
        },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      target: { type: 'string' },
      scope: { type: 'object', additionalProperties: true },
      expectedSha256: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      defaults: { type: 'object', additionalProperties: true },
      existingSuppressions: { type: 'number' },
      explanation: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'target', 'scope', 'expectedSha256', 'defaults', 'existingSuppressions', 'explanation']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/project-rules/suppression/prepare', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('diagnostic-guidance-prepare-suppression', 'DiagnosticGuidance prepares suppressions via POST /api/agent/project-rules/prepare-suppression over the shared suppressionPreparation owner.'),
        disconnected('vscode-extension-suppression-prepare', 'The VS Code/Antigravity extension delegates warning-suppression preparation to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('prepare_warning_suppression', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "prepare_warning_suppression"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', "server.ts::app.post('/api/agent/project-rules/suppression/prepare'")],
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
    id: 'runtime.log.diagnose',
    version: 1,
    title: 'Diagnose pasted X4 debug log output',
    description: 'Run deterministic root-cause classification and #58 raw engine-ID prose leak detection over a pasted X4 log trace without AI spend or live log access.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId', 'tail'],
      properties: {
        modId: { type: 'string', maxLength: 256 },
        tail: { type: 'string', maxLength: 10_485_760 },
      },
    },
    outputSchema: objectOutput({
      modIds: { type: 'array', items: { type: 'string' } },
      diagnosis: { type: 'object', additionalProperties: true },
      rawEngineIdLeaks: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['modIds', 'diagnosis']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/log-diagnose', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        connected('playtest-log-diagnose', 'src/components/PlaytestWorkspace.tsx::/api/agent/log-diagnose'),
        disconnected('vscode-extension-log-diagnose', 'The extension delegates pasted log diagnosis to Studio, the Forge API, and MCP.'),
      ],
      cli: [],
      mcp: [partial('diagnose_game_log', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "diagnose_game_log"', 'MCP caps pasted tail input at 512 KiB (HTTP accepts up to 10 MiB).')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/log-diagnose"')],
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
    id: 'snapshots.create',
    version: 1,
    title: 'Save a named Mod Workspace checkpoint of the addressed Studio workspace',
    description: 'Save a time-stamped JSON snapshot of the addressed Studio workspace inside <modId>/.snapshots/ under Mod Workspace, pruning snapshots older than the newest 30 and returning a one-use undo-create recovery receipt without echoing multi-megabyte workspace payloads. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId'],
      properties: {
        modId: { type: 'string', maxLength: 256, description: 'Direct visible mod folder name inside Mod Workspace.' },
        name: { type: 'string', maxLength: 256, description: 'Optional human-readable snapshot label.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      modId: { type: 'string' },
      snapshotName: { type: 'string' },
      name: { type: 'string' },
      savedAt: { type: 'string' },
      sha256: { type: 'string' },
      bytes: { type: 'integer', minimum: 0 },
      workspaceHash: { type: 'string' },
      snapshotHash: { type: 'string' },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'modId', 'snapshotName', 'name', 'savedAt', 'sha256', 'bytes', 'workspaceHash', 'snapshotHash']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/snapshots/create', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('studio-snapshots-create-adapter', 'Web Studio SourceControl calls POST /api/fs/snapshot with an inline workspace body.'),
        disconnected('vscode-extension-snapshots-create', 'The VS Code/Antigravity extension has no workspace snapshot panel.'),
      ],
      cli: [],
      mcp: [connected('create_workspace_snapshot', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "create_workspace_snapshot"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/snapshots/create"')],
    },
  },
  {
    id: 'snapshots.delete',
    version: 1,
    title: 'CAS-delete a workspace snapshot with one-use file recovery',
    description: 'Remove one named snapshot_<stamp>.json file inside <modId>/.snapshots/ under Mod Workspace when expectedSha256 matches, recording a one-use FileRecoveryRecord before unlinking so the deletion is reversible via restore_workspace_file. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId', 'snapshotName', 'expectedSha256'],
      properties: {
        modId: { type: 'string', maxLength: 256 },
        snapshotName: { type: 'string', maxLength: 256 },
        expectedSha256: { type: 'string', maxLength: 64 },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      modId: { type: 'string' },
      snapshotName: { type: 'string' },
      removed: objectOutput({
        sha256: { type: 'string' },
        bytes: { type: 'integer', minimum: 0 },
      }, ['sha256', 'bytes'], false),
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'modId', 'snapshotName', 'removed', 'recovery']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/snapshots/delete', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('studio-snapshots-delete-adapter', 'Web Studio SourceControl calls legacy POST /api/fs/delete-snapshot.'),
        disconnected('vscode-extension-snapshots-delete', 'The VS Code/Antigravity extension has no workspace snapshot panel.'),
      ],
      cli: [],
      mcp: [connected('delete_workspace_snapshot', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "delete_workspace_snapshot"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/snapshots/delete"')],
    },
  },
  {
    id: 'snapshots.list',
    version: 1,
    title: 'List compact workspace snapshot metadata and SHA-256 digests',
    description: 'List saved workspace snapshots inside <modId>/.snapshots/ under Mod Workspace with SHA-256 digests, byte sizes, and node/link counts without streaming raw multi-megabyte workspace bodies. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modId'],
      properties: {
        modId: { type: 'string', maxLength: 256 },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      modId: { type: 'string' },
      total: { type: 'integer', minimum: 0 },
      snapshots: {
        type: 'array',
        items: objectOutput({
          snapshotName: { type: 'string' },
          name: { type: 'string' },
          savedAt: { type: 'string' },
          sha256: { type: 'string' },
          bytes: { type: 'integer', minimum: 0 },
          nodeCount: { type: 'integer', minimum: 0 },
          linkCount: { type: 'integer', minimum: 0 },
        }, ['snapshotName', 'name', 'savedAt', 'sha256', 'bytes', 'nodeCount', 'linkCount'], false),
      },
    }, ['ok', 'success', 'modId', 'total', 'snapshots']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [{ method: 'GET', path: '/api/agent/snapshots/list', inputLocation: 'query', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('studio-snapshots-list-adapter', 'Web Studio SourceControl calls legacy GET /api/fs/snapshots.'),
        disconnected('vscode-extension-snapshots-list', 'The VS Code/Antigravity extension has no workspace snapshot panel.'),
      ],
      cli: [],
      mcp: [connected('list_workspace_snapshots', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_workspace_snapshots"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/snapshots/list"')],
    },
  },
  {
    id: 'snapshots.restore',
    version: 1,
    title: 'CAS-restore a workspace snapshot into the addressed Studio workspace',
    description: 'Restore a saved snapshot_<stamp>.json inside <modId>/.snapshots/ into the addressed Studio workspace using expectedHead + expectedSnapshotHash compare-and-swap preconditions, persisted action receipts, compact workspace summaries, and one-use workspace undo recovery. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId', 'modId', 'snapshotName', 'expectedHead', 'expectedSnapshotHash'],
      properties: {
        operationId: { type: 'string', maxLength: 128 },
        modId: { type: 'string', maxLength: 256 },
        snapshotName: { type: 'string', maxLength: 256 },
        expectedHead: { type: 'string', maxLength: 64 },
        expectedSnapshotHash: { type: 'string', maxLength: 64 },
        expectedVersion: { type: 'integer', minimum: 0 },
        detail: { type: 'string', enum: ['compact', 'full'], default: 'compact' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      status: { type: 'string', enum: ['SUCCESS'] },
      applied: { type: 'boolean' },
      replayed: { type: 'boolean' },
      workspaceId: { type: 'string' },
      version: { type: 'integer', minimum: 0 },
      workspaceHash: { type: 'string' },
      snapshotHash: { type: 'string' },
      detail: { type: 'string' },
      workspaceSummary: { type: 'object', additionalProperties: true },
      workspace: { type: 'object', additionalProperties: true },
      receipt: { type: 'object', additionalProperties: true },
      recovery: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'status', 'applied', 'replayed', 'workspaceId', 'version', 'workspaceHash', 'snapshotHash', 'receipt']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['workspace-write', 'audit-write', 'audit-retention-delete'],
    confirmation: 'none',
    apiBindings: [{ method: 'POST', path: '/api/agent/snapshots/restore', inputLocation: 'body', role: 'primary' }],
    surfaces: {
      ui: [
        disconnected('studio-snapshots-restore-adapter', 'Web Studio SourceControl calls POST /api/fs/restore-snapshot.'),
        disconnected('vscode-extension-snapshots-restore', 'The VS Code/Antigravity extension has no workspace snapshot panel.'),
      ],
      cli: [],
      mcp: [connected('restore_workspace_snapshot', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "restore_workspace_snapshot"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/snapshots/restore"')],
    },
  },
  {
    id: 'text.lookup',
    version: 1,
    title: 'Look up a literal X4 text entry',
    description: 'Read one literal page and entry in an explicit language from the configured reference corpus or the bound saved workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        id: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        language: { type: 'integer', minimum: 1, maximum: 999 },
        scope: { type: 'string', enum: ['reference', 'workspace'] },
      },
      required: ['page', 'id', 'language', 'scope'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      page: { type: 'integer' }, id: { type: 'integer' }, language: { type: 'integer' },
      scope: { type: 'string', enum: ['reference', 'workspace'] },
      status: { type: 'string', enum: ['found', 'missing', 'unavailable', 'ambiguous', 'unresolved'] },
      selectedLanguage: { type: 'integer' },
      authored: { type: 'string' }, text: { type: 'string' }, reason: { type: 'string' },
      source: { type: 'object', additionalProperties: true },
      sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['page', 'id', 'language', 'scope', 'status']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/text/lookup', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-text-lookup', 'The web Studio has no literal text lookup control.'),
        disconnected('vscode-extension-text-lookup', 'The extension has no literal text lookup control.'),
      ],
      cli: [],
      mcp: [connected('lookup_text', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "lookup_text"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/text/lookup"')],
    },
  },
  {
    id: 'ui.lua.snippets.read',
    version: 1,
    title: 'List vetted X4 UI Lua authoring snippets and self-test evidence',
    description: 'Read the curated library of X4 UI Lua patterns (menus, widgets, event bridges, tables) with optional keyword filtering and built-in Lua snippet validation evidence.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 128, description: 'Optional case-insensitive keyword filter across snippet metadata and Lua source.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      total: { type: 'number' },
      count: { type: 'number' },
      snippets: { type: 'array', items: { type: 'object', additionalProperties: true } },
      selftest: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'total', 'count', 'snippets', 'selftest']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/ui/lua-snippets', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('ui-builder-lua-snippets', 'Studio reads GET /api/agent/lua-snippets; agent callers use the protected, filterable GET /api/agent/ui/lua-snippets adapter.'),
        disconnected('vscode-extension-lua-snippets', 'The VS Code/Antigravity extension delegates X4 UI Lua snippet lookup to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('list_lua_ui_snippets', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "list_lua_ui_snippets"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/ui/lua-snippets"')],
    },
  },
  {
    id: 'ui.vanilla.harvest',
    version: 1,
    title: 'Harvest and profile vanilla X4 UI menu Lua patterns from game archives',
    description: 'Scan packed base-game .cat/.dat archives for menu-bearing vanilla X4 UI Lua files, profile each against the standalone-menu contract, and return universal schema evidence without exposing host filesystem paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'string', maxLength: 4, description: 'Optional integer string from 1 to 60 capping profiled menus (default 24).' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      scanned: { type: 'number' },
      menusProfiled: { type: 'number' },
      evidence: { type: 'array', items: { type: 'object', additionalProperties: true } },
      menus: { type: 'array', items: { type: 'object', additionalProperties: true } },
    }, ['ok', 'scanned', 'menusProfiled', 'evidence', 'menus']),
    context: { workspace: 'none', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/ui/vanilla-harvest', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('playtest-vanilla-ui-harvest', 'PlaytestWorkspace reads GET /api/agent/vanilla-ui-harvest; agent callers use the protected GET /api/agent/ui/vanilla-harvest adapter.'),
        disconnected('vscode-extension-vanilla-ui-harvest', 'The VS Code/Antigravity extension delegates vanilla UI menu profiling to Studio and MCP.'),
      ],
      cli: [],
      mcp: [connected('harvest_vanilla_ui_menus', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "harvest_vanilla_ui_menus"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/ui/vanilla-harvest"')],
    },
  },
  {
    id: 'validation.last.read',
    version: 1,
    title: 'Read last canonical deploy-verify validation verdict',
    description: 'Read the durable hash-bound deploy-verify validation receipt for the addressed workspace mod or an explicit modId, with exact source-hash freshness (current vs superseded) and isolated non-canonical project-validate state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        modId: { type: 'string', maxLength: 256, description: 'Optional mod ID override; defaults to the addressed workspace mod ID.' },
        sourceHash: { type: 'string', maxLength: 64, description: 'Optional 64-character SHA-256 hex digest to compare against the stored receipt.' },
        checkSource: { type: 'string', enum: ['0', '1'], description: 'When 0, skip hashing the working mod folder on disk.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      modId: { type: 'string' },
      canonicalSurface: { type: 'string', enum: ['POST /api/agent/deploy-verify'] },
      status: { type: 'string', enum: ['available', 'missing'] },
      receipt: { type: ['object', 'null'], additionalProperties: true },
      freshness: { type: 'object', additionalProperties: true },
      banner: { type: ['string', 'null'] },
      sourceValidation: { type: ['object', 'null'], additionalProperties: true },
    }, ['ok', 'modId', 'canonicalSurface', 'status', 'receipt', 'freshness', 'banner', 'sourceValidation']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/validation/last', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-validation-last', 'Web Studio reads canonical deploy-verify verdicts from /api/agent/deploy-verify and /api/agent/status.'),
        disconnected('vscode-extension-validation-last', 'The extension delegates canonical validation receipt lookups to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_last_validation_verdict', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_last_validation_verdict"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/validation/last"')],
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
    id: 'workspace.compile.result',
    version: 2,
    title: 'Reopen a compile validation report',
    description: 'Read an exact retained validation report from this workspace without recompiling. Request retention with X-Forge-Retain-Validation: 1 on workspace.compile. Reports expire and do not authorize deploy.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 128 } },
      required: ['id'],
      additionalProperties: false,
    },
    outputSchema: objectOutput({
      modId: { type: 'string' },
      success: { type: 'boolean' },
      diagnostics: { type: 'array', items: { type: 'object', additionalProperties: true } },
      validation: { type: 'object', additionalProperties: true },
    }, ['modId', 'success', 'diagnostics', 'validation']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['read'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/compile/result', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('web-studio-compile-result-read', 'Studio displays the retained result ID. The passive read is available through the Agent API and MCP.'),
        disconnected('vscode-extension-compile-result-read', 'The extension delegates retained compile result readback to the Forge API and MCP.'),
      ],
      cli: [],
      mcp: [connected('get_compile_result', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_compile_result"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/compile/result"')],
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
    id: 'workspace.mod.drift',
    version: 1,
    title: 'Inspect file-level drift between a mod folder in Mod Workspace and deployed Filesystem roots',
    description: 'Compare one mod folder across the configured Mod Workspace and deployed Filesystem roots and return deterministic per-file sync, modified, workspace-only, and deployed-only status. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['mod'],
      properties: {
        mod: { type: 'string', maxLength: 256, description: 'Single mod folder name to compare across workspace and deployed roots.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      available: { type: 'boolean' },
      mod: { type: 'string' },
    }, ['ok', 'available', 'mod']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'GET', path: '/api/agent/mod-folder/drift', inputLocation: 'query', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('mod-drift-inspector', 'Studio SyncModal and AgentBridge read /api/agent/mod-drift over the shared computeModDrift engine.'),
        disconnected('vscode-extension-mod-drift', 'The VS Code/Antigravity extension has no native mod-drift inspection view.'),
      ],
      cli: [],
      mcp: [connected('get_mod_drift', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "get_mod_drift"')],
      agentApi: true,
      builtInHarness: [disconnected('mod-drift', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.get("/api/agent/mod-folder/drift"')],
    },
  },
  {
    id: 'workspace.mod.import',
    version: 1,
    title: 'Preview or commit a mod folder import into the addressed Studio workspace',
    description: 'Import an existing X4 mod folder from the configured Mod Workspace or deployed Filesystem root. Defaults to a non-mutating preview returning candidate hashes and an import classification report; setting apply:true with operationId and CAS preconditions commits directly to the addressed workspace with an action receipt and one-use workspace recovery. Requires an explicit key grant.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path within the selected root.' },
        root: { type: 'string', enum: ['workspace', 'filesystem'], description: 'Source root containing the mod folder (optional when unambiguous).' },
        apply: { type: 'boolean', description: 'When true, commit the imported workspace to the addressed workspaceRegistry entry under CAS guards (default false).' },
        operationId: CONFIGURATION_OPERATION_ID_SCHEMA,
        expectedHead: { type: 'string', maxLength: 64, description: 'Expected 16-hex workspaceHash head when apply is true.' },
        expectedSnapshotHash: { type: 'string', maxLength: 64, description: 'Expected snapshotHash when apply is true.' },
        expectedVersion: { type: 'integer', minimum: 0, description: 'Optional legacy expectedVersion CAS guard when apply is true.' },
        detail: { type: 'string', enum: ['compact', 'full'], description: 'Response detail level; compact returns workspaceSummary instead of echoing the full workspace.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      applied: { type: 'boolean' },
      workspaceId: { type: 'string' },
      modId: { type: 'string' },
      report: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'applied', 'workspaceId', 'modId', 'report']),
    context: { workspace: 'required', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['write', 'deploy'] },
    effects: ['workspace-write'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/mod-folder/sync', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('sync-modal-import', 'SyncModal posts to /api/agent/mod-folder/import over the shared importModFolder engine.'),
        disconnected('vscode-extension-mod-import', 'The VS Code/Antigravity extension opens local folders directly rather than posting to /api/agent/mod-folder/sync.'),
      ],
      cli: [],
      mcp: [connected('import_mod_folder', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "import_mod_folder"')],
      agentApi: true,
      builtInHarness: [disconnected('mod-folder-import', 'No built-in harness capability dispatcher is bound yet.')],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/mod-folder/sync"')],
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
  {
    id: 'workspace.roundtrip.check',
    version: 1,
    title: 'Verify lossless XML import-and-compile round-trip fidelity for a mod folder',
    description: 'Import an existing mod folder from the configured Mod Workspace or deployed Filesystem root in memory, compile its file manifest, and verify passthrough preservation, modeled XML byte equivalence, and zero dropped files without mutating workspace state or disk.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', maxLength: 1024, description: 'Relative mod folder path inside the selected root.' },
        root: { type: 'string', enum: ['workspace', 'filesystem'], description: 'Optional root selector ("workspace" or "filesystem") when disambiguating duplicate folder names.' },
      },
    },
    outputSchema: objectOutput({
      ok: { type: 'boolean' },
      success: { type: 'boolean' },
      path: { type: 'string' },
      root: { type: 'string' },
      lossless: { type: 'boolean' },
      strictLossless: { type: 'boolean' },
      inputFileCount: { type: 'number' },
      outputFileCount: { type: 'number' },
      passthroughVerified: { type: 'number' },
      droppedFiles: { type: 'array', items: { type: 'string' } },
      passthroughMismatch: { type: 'array', items: { type: 'object', additionalProperties: true } },
      modeledByteChanged: { type: 'array', items: { type: 'object', additionalProperties: true } },
      importReport: { type: 'object', additionalProperties: true },
    }, ['ok', 'success', 'path', 'root', 'lossless', 'strictLossless', 'inputFileCount', 'outputFileCount', 'passthroughVerified', 'droppedFiles', 'passthroughMismatch', 'modeledByteChanged', 'importReport']),
    context: { workspace: 'optional', profile: 'none' },
    access: { public: false, studioSession: true, agentScopes: ['read', 'write', 'deploy'] },
    effects: ['read', 'analyze'],
    confirmation: 'none',
    apiBindings: [
      { method: 'POST', path: '/api/agent/mod-folder/round-trip', inputLocation: 'body', role: 'primary' },
    ],
    surfaces: {
      ui: [
        disconnected('sync-modal-roundtrip-check', 'SyncModal checks round-trip fidelity via POST /api/agent/round-trip-check over the shared evaluateModFolderRoundTrip engine.'),
        disconnected('vscode-extension-roundtrip-check', 'The VS Code/Antigravity extension delegates round-trip import verification to Studio SyncModal and MCP.'),
      ],
      cli: [],
      mcp: [connected('check_xml_round_trip', 'vscode-extension/mcp/x4forge-mcp.cjs::name: "check_xml_round_trip"')],
      agentApi: true,
      builtInHarness: [],
      externalAgents: [connected('agent-api', 'server.ts::app.post("/api/agent/mod-folder/round-trip"')],
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

// ---------------------------------------------------------------------------
// #19 P2 — Authoritative Semantic UI-Action Parity Census (forge.ui-action-parity.v1)
// ---------------------------------------------------------------------------

export const FORGE_UI_ACTION_PARITY_SCHEMA_VERSION = 'forge.ui-action-parity.v1' as const;

export const FORGE_UI_ACTION_PARITY_DOMAINS = [
  'approved-project-checks',
  'canvas-and-domain-editors',
  'compile-package-export',
  'credentials-and-consent',
  'directory-settings',
  'extension-and-backend-lifecycle',
  'help-and-navigation',
  'native-deploy-and-recovery',
  'preferences-and-layout',
  'reference-search-completion',
  'release-center',
  'runtime-and-performance',
  'source-files-and-undo',
  'validation-and-diagnostics',
  'workspace-selection',
] as const;

export type ForgeUiActionParityDomain = (typeof FORGE_UI_ACTION_PARITY_DOMAINS)[number];

export const FORGE_UI_ACTION_PARITY_STATUSES = [
  'available',
  'approval-required',
  'partial',
  'missing',
] as const;

export type ForgeUiActionParityStatus = (typeof FORGE_UI_ACTION_PARITY_STATUSES)[number];

export interface ForgeUiActionApprovalWorkflowV1 {
  readonly requestCapabilityIdentity: string;
  readonly statusCapabilityIdentity: string;
  readonly applyCapabilityIdentities: readonly string[];
  readonly receiptCapabilityIdentity: string;
  readonly ownerDecisionRoutes: readonly string[];
}

export interface ForgeUiActionInventoryCoverageV1 {
  readonly extensionCommands?: readonly string[];
  readonly extensionSettings?: readonly string[];
  readonly globalActions?: readonly string[];
  readonly workspaceViews?: readonly string[];
  readonly sidebarTools?: readonly string[];
}

export interface ForgeUiActionParityRowV1 {
  readonly id: string;
  readonly domain: ForgeUiActionParityDomain;
  readonly title: string;
  readonly status: ForgeUiActionParityStatus;
  /** `repo-relative path::literal token` anchors across web Studio and/or VS Code/Antigravity host. */
  readonly uiAnchors: readonly string[];
  readonly capabilityIdentities: readonly string[];
  readonly apiRoutes: readonly string[];
  readonly mcpTools: readonly string[];
  readonly nativeIdeProvider?: boolean;
  readonly coverage?: ForgeUiActionInventoryCoverageV1;
  readonly approvalWorkflow?: ForgeUiActionApprovalWorkflowV1;
  readonly ownerIssue?: string;
  readonly missingBehavior?: string;
}

export interface ForgeUiActionParitySummaryV1 {
  readonly totalActions: number;
  readonly available: number;
  readonly approvalRequired: number;
  readonly partial: number;
  readonly missing: number;
  readonly openGaps: number;
}

export interface ForgeUiActionParityCensusV1 {
  readonly schemaVersion: typeof FORGE_UI_ACTION_PARITY_SCHEMA_VERSION;
  readonly censusHash: string;
  readonly summary: ForgeUiActionParitySummaryV1;
  readonly actions: readonly ForgeUiActionParityRowV1[];
}

const CONFIGURATION_APPROVAL_WORKFLOW: ForgeUiActionApprovalWorkflowV1 = {
  requestCapabilityIdentity: 'configuration.access.request@1',
  statusCapabilityIdentity: 'configuration.access.status@1',
  applyCapabilityIdentities: ['configuration.preview@1', 'configuration.apply@1'],
  receiptCapabilityIdentity: 'configuration.status@1',
  ownerDecisionRoutes: [
    'GET /api/agent/keys/configuration-access',
    'POST /api/agent/keys/configuration-access/decision',
  ],
};

export const FORGE_UI_ACTION_PARITY_CENSUS: readonly ForgeUiActionParityRowV1[] = [
  {
    id: 'ai.copilot.generate_and_chat',
    domain: 'canvas-and-domain-editors',
    title: 'Generate, preview, and apply AI Co-pilot / Architect workspace proposals',
    status: 'partial',
    uiAnchors: [
      'src/components/AIHelper.tsx::AIHelper',
      'src/components/BlueprintPanel.tsx::BlueprintPanel',
    ],
    capabilityIdentities: ['workspace.generate.preview@1'],
    apiRoutes: [
      'POST /api/agent/generate/preview',
      'POST /api/agent/project/generate',
      'GET /api/ai/usage',
    ],
    mcpTools: [],
    coverage: { sidebarTools: ['ai'] },
    ownerIssue: '#19',
    missingBehavior: 'workspace.generate.preview@1 has no MCP tool projection and direct POST /api/agent/generate remains Studio-session-only.',
  },
  {
    id: 'checks.project_owner.enroll',
    domain: 'approved-project-checks',
    title: 'Review and enroll owner-approved project-registered checks (A15)',
    status: 'missing',
    uiAnchors: [
      'server.ts::/api/project-check-owner/review',
      'server.ts::/api/project-check-owner/confirm',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'POST /api/project-check-owner/review',
      'POST /api/project-check-owner/confirm',
    ],
    mcpTools: [],
    ownerIssue: '#61',
    missingBehavior: 'Project-check owner enrollment is Studio-session-only with no agent request/status/continuation workflow or MCP projection.',
  },
  {
    id: 'checks.project_runs.execute',
    domain: 'approved-project-checks',
    title: 'Execute and poll already-enrolled project-check suite runs',
    status: 'partial',
    uiAnchors: [
      'server.ts::/api/agent/project-check-runs',
      'src/components/DeployValidationSummary.tsx::DeployValidationSummary',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'POST /api/agent/project-check-runs',
      'GET /api/agent/project-check-runs/:id',
    ],
    mcpTools: [],
    ownerIssue: '#61',
    missingBehavior: 'Agent HTTP endpoints start and poll enrolled project-check runs, but neither canonical capability descriptors nor MCP tools are projected yet.',
  },
  {
    id: 'compile.workspace.build',
    domain: 'compile-package-export',
    title: 'Compile and package workspace artifacts (loose or catalog)',
    status: 'partial',
    uiAnchors: [
      'src/components/CompileConfirmationModal.tsx::CompileConfirmationModal',
      'src/App.tsx::/api/agent/compile',
    ],
    capabilityIdentities: ['workspace.compile@2', 'workspace.compile.result@2'],
    apiRoutes: [
      'POST /api/agent/compile',
      'GET /api/agent/compile/result',
      'GET /api/agent/compile/result/:id',
      'POST /api/agent/artifact/build',
      'POST /api/agent/package',
      'POST /api/agent/project/package',
    ],
    mcpTools: ['compile_workspace', 'get_compile_result'],
    ownerIssue: '#19',
    missingBehavior: 'Retained compile report readback is available over MCP (get_compile_result), while MCP compile_workspace omits inline workspace/fileOverrides, returns file names without file contents, and caps diagnostics at 100.',
  },
  {
    id: 'credentials.agent_keys.manage',
    domain: 'credentials-and-consent',
    title: 'Mint, inspect, revoke, and approve scoped Agent API keys and MCP config',
    status: 'missing',
    uiAnchors: [
      'src/components/AgentBridge.tsx::AgentBridge',
      'vscode-extension/src/extension.ts::x4forge.createAgentKey',
      'vscode-extension/src/extension.ts::x4forge.copyMcpConfig',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'GET /api/agent/keys',
      'POST /api/agent/keys',
      'POST /api/agent/keys/revoke',
      'GET /api/agent/keys/configuration-access',
      'POST /api/agent/keys/configuration-access/decision',
    ],
    mcpTools: [],
    coverage: {
      extensionCommands: ['x4forge.createAgentKey', 'x4forge.copyMcpConfig'],
      globalActions: ['agent-api'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Credential minting, revocation, and owner grant decisions are Studio-session/IDE-owner-only; agents can inspect their own effective contract via GET /api/agent/capabilities/effective but cannot self-mint or impersonate owner approval.',
  },
  {
    id: 'credentials.ai_provider.configure',
    domain: 'credentials-and-consent',
    title: 'Configure AI provider credentials, active model, and reasoning tier',
    status: 'missing',
    uiAnchors: [
      'src/components/AIConnectionModal.tsx::AIConnectionModal',
      'vscode-extension/src/extension.ts::/api/ai/keys/status',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'GET /api/ai/keys/status',
      'POST /api/ai/keys',
    ],
    mcpTools: [],
    coverage: { globalActions: ['ai-settings'] },
    ownerIssue: '#19',
    missingBehavior: 'AI provider key storage and status routes are Studio-session-only with no scoped agent or MCP consent workflow.',
  },
  {
    id: 'credentials.github_sync.manage',
    domain: 'credentials-and-consent',
    title: 'Authenticate GitHub device/PAT credentials and push/pull mod repositories',
    status: 'missing',
    uiAnchors: [
      'src/components/SourceControl.tsx::SourceControl',
      'src/components/SourceControl.tsx::/api/github/push',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'GET /api/github/credential',
      'POST /api/github/credential',
      'DELETE /api/github/credential',
      'POST /api/github/device/start',
      'POST /api/github/device/poll',
      'POST /api/github/commits',
      'POST /api/github/create',
      'POST /api/github/load',
      'POST /api/github/push',
    ],
    mcpTools: [],
    ownerIssue: '#19',
    missingBehavior: 'All GitHub credential and repository sync endpoints inside Forge are Studio-session-only with no scoped agent or MCP projection.',
  },
  {
    id: 'deploy.format.default.configure',
    domain: 'native-deploy-and-recovery',
    title: 'Read, preview, and persist default deployment format (loose vs catalog)',
    status: 'approval-required',
    uiAnchors: [
      'src/components/CompileConfirmationModal.tsx::chooseDeployFormat',
      'src/components/DirectorySettingsModal.tsx::DirectorySettingsModal',
    ],
    capabilityIdentities: [
      'configuration.access.request@1',
      'configuration.access.status@1',
      'configuration.read@1',
      'configuration.preview@1',
      'configuration.apply@1',
      'configuration.status@1',
    ],
    apiRoutes: [
      'POST /api/agent/configuration/access/request',
      'GET /api/agent/configuration/access',
      'GET /api/agent/configuration',
      'POST /api/agent/configuration/preview',
      'POST /api/agent/configuration/apply',
      'GET /api/agent/configuration/status',
      'POST /api/schema/config',
    ],
    mcpTools: [
      'request_configuration_access',
      'get_configuration_access_status',
      'get_configuration',
      'preview_configuration_change',
      'apply_configuration_change',
      'get_configuration_operation_status',
    ],
    approvalWorkflow: CONFIGURATION_APPROVAL_WORKFLOW,
    ownerIssue: '#96',
  },
  {
    id: 'deploy.native.apply',
    domain: 'native-deploy-and-recovery',
    title: 'Execute preview-bound native deployment (loose or catalog) with CAS verification',
    status: 'available',
    uiAnchors: [
      'src/components/CompileConfirmationModal.tsx::CompileConfirmationModal',
      'src/components/DeployFileChanges.tsx::DeployFileChanges',
    ],
    capabilityIdentities: ['deploy.apply@1'],
    apiRoutes: [
      'POST /api/agent/deploy-verify/apply',
      'POST /api/agent/deploy-verify',
      'POST /api/agent/deploy',
    ],
    mcpTools: ['apply_native_deploy'],
    ownerIssue: '#19',
  },
  {
    id: 'deploy.native.preview',
    domain: 'native-deploy-and-recovery',
    title: 'Preview native deployment bytes, validation verdict, and per-request deployFormat override',
    status: 'available',
    uiAnchors: [
      'src/components/CompileConfirmationModal.tsx::CompileConfirmationModal',
      'src/components/DeployValidationSummary.tsx::DeployValidationSummary',
    ],
    capabilityIdentities: ['deploy.preview@1'],
    apiRoutes: [
      'POST /api/agent/deploy-verify/preview',
      'POST /api/agent/deploy-verify',
    ],
    mcpTools: ['preview_native_deploy'],
    ownerIssue: '#19',
  },
  {
    id: 'deploy.native.status',
    domain: 'native-deploy-and-recovery',
    title: 'Inspect native deployment receipt, target/managed physical state, and file-effect report',
    status: 'available',
    uiAnchors: [
      'src/components/DeployValidationSummary.tsx::DeployValidationSummary',
      'src/components/PlaytestWorkspace.tsx::/api/agent/deploy-verify',
    ],
    capabilityIdentities: ['deploy.status@1'],
    apiRoutes: [
      'GET /api/agent/deploy-verify/status',
      'GET /api/agent/status',
    ],
    mcpTools: ['get_deploy_operation_status'],
    ownerIssue: '#19',
  },
  {
    id: 'deploy.native.undo',
    domain: 'native-deploy-and-recovery',
    title: 'Undo a committed native deployment from its one-use CAS recovery snapshot',
    status: 'available',
    uiAnchors: [
      'src/components/SourceControl.tsx::SourceControl',
      'src/components/AgentBridge.tsx::/api/agent/history/',
    ],
    capabilityIdentities: ['deploy.undo@1'],
    apiRoutes: [
      'POST /api/agent/deploy-verify/undo',
      'POST /api/agent/history/:id/revert',
    ],
    mcpTools: ['undo_native_deploy'],
    ownerIssue: '#19',
  },
  {
    id: 'diagnostics.conflicts.check',
    domain: 'validation-and-diagnostics',
    title: 'Check installed extension duplicate IDs, load-order, and override conflicts',
    status: 'partial',
    uiAnchors: [
      'src/components/PackageModDoctor.tsx::PackageModDoctor',
      'vscode-extension/src/extension.ts::x4forge.checkModConflicts',
    ],
    capabilityIdentities: ['extensions.conflicts.analyze@1', 'extensions.file.read@1', 'extensions.overrides.analyze@1'],
    apiRoutes: [
      'GET /api/agent/extension-doctor',
      'GET /api/agent/override-map',
      'GET /api/agent/extension-file',
      'GET /api/agent/extensions/file',
    ],
    mcpTools: ['check_conflicts', 'get_extension_override_map', 'read_extension_file'],
    coverage: { extensionCommands: ['x4forge.checkModConflicts'] },
    ownerIssue: '#19',
    missingBehavior: 'Installed extension conflict summaries (check_conflicts), per-element override maps (get_extension_override_map), and loose/packed extension file reads (read_extension_file, bounded at 512 KiB) are projected over MCP, while MCP check_conflicts caps returned findings at 50.',
  },
  {
    id: 'diagnostics.patch_readiness.check',
    domain: 'validation-and-diagnostics',
    title: 'Analyze XML diff patch selectors against base-game and DLC targets',
    status: 'partial',
    uiAnchors: [
      'src/components/XMLPatchSystem.tsx::XMLPatchSystem',
      'src/components/DiagnosticsHub.tsx::DiagnosticsHub',
    ],
    capabilityIdentities: ['patch.diff.simulate@1', 'patch.readiness.analyze@2'],
    apiRoutes: [
      'GET /api/agent/patch-readiness',
      'GET /api/agent/patch-audit',
      'POST /api/agent/reference/simulate-diff',
      'POST /api/reference/simulate-diff',
    ],
    mcpTools: ['check_patch_readiness', 'simulate_xml_diff'],
    ownerIssue: '#19',
    missingBehavior: 'XML diff simulation (simulate_xml_diff, bounded at 512 KiB input / 256 KiB output) and patch readiness (check_patch_readiness, broken/removed findings capped at 50) are projected over MCP with bounded payloads, while GET /api/agent/patch-audit remains HTTP-only.',
  },
  {
    id: 'diagnostics.project.validate',
    domain: 'validation-and-diagnostics',
    title: 'Validate project files, inspect remediation guidance, and manage warning suppressions',
    status: 'partial',
    uiAnchors: [
      'src/components/DiagnosticsCenter.tsx::DiagnosticsCenter',
      'src/components/DiagnosticGuidance.tsx::DiagnosticGuidance',
      'vscode-extension/src/extension.ts::/api/agent/project/validate/check',
    ],
    capabilityIdentities: [
      'diagnostics.quick.fixes@1',
      'project.validate@1',
      'reviews.warning.revoke@1',
      'rules.suppression.apply@1',
      'rules.suppression.prepare@1',
      'validation.last.read@1',
    ],
    apiRoutes: [
      'POST /api/agent/project/validate/check',
      'POST /api/agent/project/validate',
      'GET /api/agent/validation/last',
      'POST /api/agent/quick-fixes',
      'POST /api/agent/project-rules/prepare-suppression',
      'POST /api/agent/project-rules/suppression/prepare',
      'POST /api/agent/project-rules/suppress',
      'POST /api/agent/project-rules/suppression/apply',
      'POST /api/agent/warning-reviews/revoke',
      'POST /api/agent/warning-reviews/revoke-review',
    ],
    mcpTools: [
      'validate_mod',
      'author_check',
      'stage_and_validate',
      'get_last_validation_verdict',
      'suggest_quick_fixes',
      'prepare_warning_suppression',
      'apply_warning_suppression',
      'revoke_warning_review',
    ],
    coverage: { sidebarTools: ['diagnostics'] },
    ownerIssue: '#19',
    missingBehavior: 'Canonical deploy-verify verdict readback (get_last_validation_verdict), quick-fixes (suggest_quick_fixes), reviewed forge.rules.json warning suppressions (prepare_warning_suppression, apply_warning_suppression), and warning-review revocation (revoke_warning_review) are available over MCP, while MCP validation aliases cap findings/capsules at 50-100 and suggest_quick_fixes caps fixes at 200.',
  },
  {
    id: 'diagnostics.proof_and_brief.generate',
    domain: 'validation-and-diagnostics',
    title: 'Generate mod proof report and refresh deterministic agent brief',
    status: 'available',
    uiAnchors: [
      'vscode-extension/src/extension.ts::x4forge.generateProof',
      'vscode-extension/src/extension.ts::x4forge.refreshAgentBrief',
    ],
    capabilityIdentities: ['project.brief.read@1', 'project.proof.read@1'],
    apiRoutes: [
      'GET /api/agent/proof',
      'GET /api/agent/project/brief',
    ],
    mcpTools: ['get_agent_brief', 'get_mod_proof'],
    coverage: {
      extensionCommands: ['x4forge.generateProof', 'x4forge.refreshAgentBrief'],
    },
    ownerIssue: '#19',
  },
  {
    id: 'diagnostics.readiness.inspect',
    domain: 'validation-and-diagnostics',
    title: 'Inspect five-stage workspace package/deploy readiness ladder',
    status: 'available',
    uiAnchors: [
      'src/components/ReadinessLadder.tsx::ReadinessLadder',
      'vscode-extension/src/extension.ts::/api/agent/schema',
    ],
    capabilityIdentities: ['readiness.read@1'],
    apiRoutes: ['GET /api/agent/readiness'],
    mcpTools: ['readiness'],
  },
  {
    id: 'editors.aiscripts.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author AI behavior scripts and parameters in the AI Scripts domain editor',
    status: 'partial',
    uiAnchors: [
      'src/components/AIScriptEditor.tsx::AIScriptEditor',
      'src/components/WorkspaceNavigationBar.tsx::aiscripts',
    ],
    capabilityIdentities: ['workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/workspace',
      'POST /api/agent/workspace',
      'POST /api/agent/workspace/merge',
    ],
    mcpTools: ['get_workspace'],
    coverage: { workspaceViews: ['aiscripts'] },
    ownerIssue: '#19',
    missingBehavior: 'Scoped agent HTTP routes read/replace/merge aiScripts on the saved workspace, but MCP get_workspace summarizes at 50 nodes and MCP has no workspace/AIScript mutation tool.',
  },
  {
    id: 'editors.contracts.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author external Lua/MD integration contracts and register external APIs',
    status: 'partial',
    uiAnchors: [
      'src/components/ContractEditor.tsx::ContractEditor',
      'src/components/WorkspaceNavigationBar.tsx::contracts',
    ],
    capabilityIdentities: ['contracts.derive@1', 'contracts.registry.read@1', 'workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/external-api-registry',
      'GET /api/agent/external-api/registry',
      'GET /api/agent/external-api/derive',
      'GET /api/agent/external-api/derive-draft',
      'GET /api/agent/contract-glue-sample',
      'POST /api/agent/external-api/register',
      'POST /api/agent/workspace',
    ],
    mcpTools: ['derive_external_api_contract', 'get_workspace', 'list_external_api_contracts'],
    coverage: { workspaceViews: ['contracts'] },
    ownerIssue: '#31',
    missingBehavior: 'Active external-API contract listing (list_external_api_contracts) and draft derivation from loose/packed extensions (derive_external_api_contract) are projected over MCP, while POST /api/agent/external-api/register remains Studio-session-only (#31) and workspace contract model writes remain HTTP-only.',
  },
  {
    id: 'editors.libraries.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author wares, jobs, and mod metadata in Wares & Jobs / Mod Meta editors',
    status: 'partial',
    uiAnchors: [
      'src/components/LibraryConfigurator.tsx::LibraryConfigurator',
      'src/components/Sidebar.tsx::toContentVersion',
    ],
    capabilityIdentities: ['workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/workspace',
      'POST /api/agent/workspace',
      'POST /api/agent/workspace/merge',
      'POST /api/agent/project/content-xml',
    ],
    mcpTools: ['get_workspace'],
    coverage: {
      workspaceViews: ['libraries'],
      sidebarTools: ['config'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Agent HTTP routes mutate wares, jobs, and content.xml metadata, but no canonical capability or MCP tool mutates library/metadata models.',
  },
  {
    id: 'editors.md_canvas.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author Mission Director cue graphs, node properties, templates, and undo/redo',
    status: 'partial',
    uiAnchors: [
      'src/components/Canvas.tsx::Canvas',
      'src/components/CueViewer.tsx::CueViewer',
      'src/components/PropertiesInspector.tsx::PropertiesInspector',
    ],
    capabilityIdentities: ['workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/workspace',
      'POST /api/agent/workspace',
      'POST /api/agent/workspace/merge',
      'POST /api/agent/node-diagnostics',
    ],
    mcpTools: ['get_workspace'],
    coverage: {
      globalActions: ['undo', 'redo'],
      workspaceViews: ['blueprint'],
      sidebarTools: ['script', 'cues', 'templates'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Canvas undo/redo is browser-memory local (durable undo uses Agent History / snapshots), MCP get_workspace truncates at 50 nodes, and workspace graph writes have no MCP tool.',
  },
  {
    id: 'editors.translations.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author localized t-file pages and text entries',
    status: 'partial',
    uiAnchors: [
      'src/components/TFileEditor.tsx::TFileEditor',
      'src/components/WorkspaceNavigationBar.tsx::translation',
    ],
    capabilityIdentities: ['text.lookup@1', 'workspace.read@2'],
    apiRoutes: [
      'POST /api/agent/text/lookup',
      'POST /api/agent/workspace',
      'POST /api/agent/workspace/merge',
    ],
    mcpTools: ['lookup_text', 'get_workspace'],
    coverage: { workspaceViews: ['translation'] },
    ownerIssue: '#19',
    missingBehavior: 'Text lookup is available on API and MCP (lookup_text), while authoring tFiles requires HTTP workspace/fs writes with no MCP mutation tool.',
  },
  {
    id: 'editors.ui_lua.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author HUD & Lua UI widgets and X4 UI Lua/XML source files',
    status: 'partial',
    uiAnchors: [
      'src/components/UIBuilder.tsx::UIBuilder',
      'src/components/X4UiSourceEditor.tsx::X4UiSourceEditor',
    ],
    capabilityIdentities: ['ui.lua.snippets.read@1', 'ui.vanilla.harvest@1', 'workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/lua-snippets',
      'GET /api/agent/ui/lua-snippets',
      'GET /api/agent/vanilla-ui-harvest',
      'GET /api/agent/ui/vanilla-harvest',
      'POST /api/agent/workspace',
      'POST /api/fs/write',
    ],
    mcpTools: ['get_workspace', 'harvest_vanilla_ui_menus', 'list_lua_ui_snippets'],
    coverage: {
      workspaceViews: ['ui-designer'],
      sidebarTools: ['ui'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Vetted UI Lua snippets (list_lua_ui_snippets) and base-game menu Lua profiling (harvest_vanilla_ui_menus) are projected over MCP (with disk Lua/XML file authoring via write_workspace_file), while visual UIBuilder widget model mutations remain HTTP-only.',
  },
  {
    id: 'editors.xml_patches.author',
    domain: 'canvas-and-domain-editors',
    title: 'Author RFC 5261 XML diff blocks and synthesize XPath selectors',
    status: 'partial',
    uiAnchors: [
      'src/components/XMLPatchSystem.tsx::XMLPatchSystem',
      'src/components/XPathInput.tsx::XPathInput',
    ],
    capabilityIdentities: ['patch.base.read@1', 'patch.readiness.analyze@2', 'patch.targets.list@1', 'patch.xpath.complete@1', 'patch.xpath.synthesize@1', 'workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/patch-targets',
      'GET /api/patch/base-content',
      'GET /api/agent/patch/base-content',
      'POST /api/agent/xpath-synth',
      'POST /api/reference/xpath-complete',
      'POST /api/agent/patch/xpath-complete',
      'POST /api/agent/workspace',
    ],
    mcpTools: ['check_patch_readiness', 'complete_xpath_selector', 'get_workspace', 'list_patch_targets', 'read_patch_base_content', 'synthesize_xml_patch'],
    coverage: { workspaceViews: ['xmlpatch'] },
    ownerIssue: '#19',
    missingBehavior: 'Patch target discovery (list_patch_targets), target base XML inspection (read_patch_base_content, bounded at 512 KiB), XPath selector completion (complete_xpath_selector), minimal <diff> synthesis (synthesize_xml_patch), and patch readiness (check_patch_readiness) are projected over MCP, while xmlPatches workspace model mutations remain HTTP-only.',
  },
  {
    id: 'extension.ide_capabilities.inspect',
    domain: 'extension-and-backend-lifecycle',
    title: 'Inspect IDE semantic capabilities, companion XML extensions, and schema status',
    status: 'partial',
    uiAnchors: [
      'vscode-extension/src/extension.ts::x4forge.showCapabilities',
      'vscode-extension/src/capabilities.ts::detectIdeCapabilities',
    ],
    capabilityIdentities: ['schema.domains.list@1'],
    apiRoutes: [
      'GET /api/agent/schema-registry',
      'GET /api/agent/schema',
      'GET /api/agent/capabilities/effective',
    ],
    mcpTools: ['list_schema_domains'],
    coverage: { extensionCommands: ['x4forge.showCapabilities'] },
    ownerIssue: '#19',
    missingBehavior: 'MCP list_schema_domains omits domain/refresh parameters, and companion IDE extension state (detectIdeCapabilities) is local to the extension host without an API/MCP readback.',
  },
  {
    id: 'extension.sidecar.lifecycle',
    domain: 'extension-and-backend-lifecycle',
    title: 'Open Studio webview and start, stop, or inspect the managed local backend sidecar',
    status: 'missing',
    uiAnchors: [
      'vscode-extension/src/extension.ts::x4forge.openStudio',
      'vscode-extension/src/extension.ts::x4forge.startSidecar',
      'vscode-extension/src/extension.ts::x4forge.stopSidecar',
      'vscode-extension/src/extension.ts::x4forge.showLogs',
    ],
    capabilityIdentities: [],
    apiRoutes: [],
    mcpTools: [],
    coverage: {
      extensionCommands: [
        'x4forge.openStudio',
        'x4forge.startSidecar',
        'x4forge.stopSidecar',
        'x4forge.showLogs',
      ],
    },
    ownerIssue: '#53',
    missingBehavior: 'Backend sidecar start/stop/log inspection and opening the Studio panel are VS Code/Antigravity host commands with no headless agent or MCP lifecycle bootstrap (#53).',
  },
  {
    id: 'files.bulk_transform.execute',
    domain: 'source-files-and-undo',
    title: 'Preview and apply deterministic multi-file corpus transforms',
    status: 'available',
    uiAnchors: [
      'src/components/BulkTransformPanel.tsx::BulkTransformPanel',
      'src/components/BulkTransformPanel.tsx::/api/agent/bulk-transform/apply',
    ],
    capabilityIdentities: ['bulk.transform.apply@1', 'bulk.transform.preview@1'],
    apiRoutes: [
      'POST /api/agent/bulk-transform/preview',
      'POST /api/agent/bulk-transform/apply',
      'POST /api/agent/bulk-transform/preview-plan',
      'POST /api/agent/bulk-transform/execute',
    ],
    mcpTools: ['apply_bulk_transform', 'preview_bulk_transform'],
    ownerIssue: '#19',
  },
  {
    id: 'files.history_and_snapshots.manage',
    domain: 'source-files-and-undo',
    title: 'Inspect Agent Action Ledger history, revert file/workspace actions, and manage snapshots',
    status: 'available',
    uiAnchors: [
      'src/components/SourceControl.tsx::SourceControl',
      'src/components/SnapshotManager.tsx::SnapshotManager',
    ],
    capabilityIdentities: [
      'deploy.undo@1',
      'history.list@2',
      'history.raw.read@1',
      'history.revert@2',
      'snapshots.create@1',
      'snapshots.delete@1',
      'snapshots.list@1',
      'snapshots.restore@1',
    ],
    apiRoutes: [
      'GET /api/agent/history',
      'GET /api/agent/history/raw',
      'GET /api/agent/history/:id/raw',
      'POST /api/agent/history/:id/revert',
      'POST /api/agent/history/revert',
      'GET /api/agent/snapshots/list',
      'POST /api/agent/snapshots/create',
      'POST /api/agent/snapshots/restore',
      'POST /api/agent/snapshots/delete',
      'GET /api/fs/snapshots',
      'POST /api/fs/snapshot',
      'POST /api/fs/restore-snapshot',
      'POST /api/fs/delete-snapshot',
    ],
    mcpTools: [
      'create_workspace_snapshot',
      'delete_workspace_snapshot',
      'list_action_history',
      'list_workspace_snapshots',
      'read_action_history_blob',
      'restore_workspace_snapshot',
      'revert_action_history',
      'undo_native_deploy',
    ],
    coverage: { sidebarTools: ['git'] },
    ownerIssue: '#19',
  },
  {
    id: 'files.project_sources.manage',
    domain: 'source-files-and-undo',
    title: 'List, read, create, edit, and delete mod project files on disk',
    status: 'available',
    uiAnchors: [
      'src/components/DirectoryExplorer.tsx::/api/fs/write',
      'src/components/NativeProjectFiles.tsx::NativeProjectFiles',
    ],
    capabilityIdentities: [
      'files.delete@1',
      'files.delete.dir@1',
      'files.inventory.read@1',
      'files.list@1',
      'files.read@1',
      'files.restore@2',
      'files.scaffold@1',
      'files.write@2',
    ],
    apiRoutes: [
      'POST /api/agent/project/files',
      'POST /api/agent/project/create',
      'POST /api/agent/project/file/create',
      'GET /api/agent/files/inventory',
      'GET /api/agent/files/list',
      'GET /api/agent/files/read',
      'POST /api/agent/files/scaffold',
      'POST /api/agent/files/write',
      'POST /api/agent/files/delete',
      'POST /api/agent/files/delete-dir',
      'POST /api/agent/files/restore',
      'GET /api/fs/list',
      'GET /api/fs/read',
      'POST /api/fs/create',
      'POST /api/fs/write',
      'POST /api/fs/delete-file',
      'POST /api/fs/restore-file',
      'POST /api/fs/delete-dir',
    ],
    mcpTools: [
      'get_project_file_inventory',
      'list_workspace_files',
      'read_workspace_file',
      'remove_workspace_directory',
      'remove_workspace_file',
      'restore_workspace_file',
      'scaffold_mod_project',
      'write_workspace_file',
    ],
    coverage: {
      globalActions: ['native-project-files'],
      workspaceViews: ['project'],
      sidebarTools: ['filesystem'],
    },
    ownerIssue: '#19',
  },
  {
    id: 'help.bug_report.prepare',
    domain: 'help-and-navigation',
    title: 'Assemble sanitized diagnostic bug report and open GitHub issue draft',
    status: 'missing',
    uiAnchors: [
      'src/components/BugReportModal.tsx::BugReportModal',
      'src/components/StudioActionsMenu.tsx::report-bug',
    ],
    capabilityIdentities: [],
    apiRoutes: [],
    mcpTools: [],
    coverage: { globalActions: ['report-bug'] },
    ownerIssue: '#19',
    missingBehavior: 'BugReportModal assembles browser-side state and opens a GitHub URL directly without a server/MCP bug-bundle operation.',
  },
  {
    id: 'help.onboarding_and_shortcuts.view',
    domain: 'help-and-navigation',
    title: 'Browse X4 modding wiki, keyboard shortcuts, and guided onboarding rails',
    status: 'missing',
    uiAnchors: [
      'src/components/WikiBrowser.tsx::WikiBrowser',
      'src/components/ShortcutsOverlay.tsx::ShortcutsOverlay',
      'src/components/GuidedRail.tsx::GuidedRail',
      'src/components/StarterCard.tsx::StarterCard',
    ],
    capabilityIdentities: [],
    apiRoutes: [],
    mcpTools: [],
    coverage: {
      globalActions: ['shortcuts'],
      workspaceViews: ['wiki'],
    },
    ownerIssue: '#19',
    missingBehavior: 'In-app X4 Wiki topics, keyboard shortcut reference, and onboarding guides live only in frontend bundles without a read-only API/MCP knowledge query.',
  },
  {
    id: 'navigation.ai_scripts.resolve',
    domain: 'help-and-navigation',
    title: 'Resolve authored AI script definitions, references, and call targets',
    status: 'available',
    uiAnchors: [
      'vscode-extension/src/extension.ts::registerDefinitionProvider',
      'src/components/AIScriptEditor.tsx::AIScriptEditor',
    ],
    capabilityIdentities: ['project.ai.navigation@1'],
    apiRoutes: ['POST /api/agent/project/ai-navigation'],
    mcpTools: ['navigate_ai_script'],
    nativeIdeProvider: true,
  },
  {
    id: 'navigation.md_scripts.resolve',
    domain: 'help-and-navigation',
    title: 'Resolve authored Mission Director cue/library definitions and references',
    status: 'available',
    uiAnchors: [
      'vscode-extension/src/extension.ts::registerDefinitionProvider',
      'src/components/CueViewer.tsx::CueViewer',
    ],
    capabilityIdentities: ['project.md.navigation@1'],
    apiRoutes: ['POST /api/agent/project/md-navigation'],
    mcpTools: ['navigate_md_script'],
    nativeIdeProvider: true,
  },
  {
    id: 'navigation.symbols.rename_and_workspace_search',
    domain: 'help-and-navigation',
    title: 'Rename Mission Director symbols and jump to Workspace Symbols across mod/DLC/base catalogs',
    status: 'available',
    uiAnchors: [
      'vscode-extension/src/mdRenameHost.ts::x4forge.renameMdSymbol',
      'vscode-extension/src/workspaceScriptSymbolsHost.ts::registerWorkspaceSymbolProvider',
    ],
    capabilityIdentities: ['project.md.rename@1', 'project.symbols.search@1'],
    apiRoutes: ['GET /api/agent/mod-folder/symbols', 'POST /api/agent/mod-folder/md-rename'],
    mcpTools: ['rename_md_symbol', 'search_workspace_symbols'],
    nativeIdeProvider: true,
    coverage: { extensionCommands: ['x4forge.renameMdSymbol'] },
    ownerIssue: '#130',
  },
  {
    id: 'preferences.extension_host.configure',
    domain: 'preferences-and-layout',
    title: 'Configure VS Code / Antigravity extension host settings (attachUrl, stateDir, hover languages, two-way editing)',
    status: 'missing',
    uiAnchors: [
      'vscode-extension/package.json::x4forge.attachUrl',
      'vscode-extension/src/extension.ts::twoWayEditing',
    ],
    capabilityIdentities: [],
    apiRoutes: [],
    mcpTools: [],
    coverage: {
      extensionSettings: [
        'x4forge.attachUrl',
        'x4forge.autoOpen',
        'x4forge.debug',
        'x4forge.forgeRoot',
        'x4forge.nodePath',
        'x4forge.stateDir',
        'x4forge.textHoverAlternateLanguage',
        'x4forge.textHoverLanguage',
        'x4forge.twoWayEditing',
        'x4forge.writeXmlAssociations',
      ],
    },
    ownerIssue: '#19',
    missingBehavior: 'Extension-contributed VS Code workspace/user settings are managed only through the IDE configuration store with no Forge API or MCP settings projection.',
  },
  {
    id: 'preferences.studio_layout.configure',
    domain: 'preferences-and-layout',
    title: 'Configure Studio dock layout, visible tool/workspace rails, experience mode, and release preferences',
    status: 'missing',
    uiAnchors: [
      'src/App.tsx::/api/studio/layout',
      'src/App.tsx::/api/studio/release-preferences',
    ],
    capabilityIdentities: [],
    apiRoutes: [
      'GET /api/studio/layout',
      'POST /api/studio/layout',
      'GET /api/studio/release-preferences',
      'POST /api/studio/release-preferences',
    ],
    mcpTools: [],
    coverage: { globalActions: ['experience-mode'] },
    ownerIssue: '#19',
    missingBehavior: 'Studio layout, experience-mode, and release-preference endpoints are Studio-session-only with no agent API scope or MCP projection.',
  },
  {
    id: 'reference.corpus.browse_and_search',
    domain: 'reference-search-completion',
    title: 'Search and browse unpacked/cat-dat X4 objects, wares, factions, jobs, sectors, galaxy map, and mod dependencies',
    status: 'partial',
    uiAnchors: [
      'src/components/ObjectBrowser.tsx::ObjectBrowser',
      'src/components/GalaxyMapView.tsx::GalaxyMapView',
      'src/components/ModDependencyView.tsx::ModDependencyView',
      'src/components/GlobalSearch.tsx::GlobalSearch',
    ],
    capabilityIdentities: [
      'extensions.dependencies.analyze@1',
      'reference.file.read@1',
      'reference.galaxy.read@1',
      'reference.objects.search@1',
      'reference.status.read@1',
      'reference.suggest@1',
    ],
    apiRoutes: [
      'GET /api/agent/object-index',
      'GET /api/agent/reference/status',
      'GET /api/agent/reference/effective-file',
      'GET /api/agent/reference/suggest',
      'GET /api/reference/suggest',
      'GET /api/agent/galaxy-map',
      'GET /api/agent/extensions/dependency-graph',
      'GET /api/agent/mod-dependency-graph',
      'GET /api/reference/status',
      'GET /api/reference/manifest',
      'GET /api/reference/search',
      'GET /api/reference/file',
      'GET /api/reference/effective-file',
      'GET /api/reference/wares',
      'GET /api/reference/factions',
      'GET /api/reference/jobs',
      'GET /api/reference/sectors',
      'GET /api/reference/aiscripts',
      'GET /api/reference/scriptproperties',
    ],
    mcpTools: [
      'get_galaxy_map',
      'get_mod_dependency_graph',
      'get_reference_status',
      'read_reference_file',
      'search_reference_symbols',
      'search_x4_objects',
    ],
    coverage: {
      workspaceViews: ['galaxy'],
      sidebarTools: ['reference'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Reference status, composed base+DLC XML reads (capped at 256 KiB), ranked symbol search, object-index search (capped at 200), galaxy sector/cluster coordinates (get_galaxy_map), and installed mod dependency graphs (get_mod_dependency_graph) are projected over MCP, while raw manifest file pagination (/api/reference/manifest) remains HTTP-only.',
  },
  {
    id: 'reference.element.explain',
    domain: 'reference-search-completion',
    title: 'Explain X4 XML elements, required attributes, hover docs, and context completions',
    status: 'available',
    uiAnchors: [
      'src/components/PropertiesInspector.tsx::PropertiesInspector',
      'vscode-extension/src/extension.ts::/api/agent/lang/',
    ],
    capabilityIdentities: ['schema.element.explain@1'],
    apiRoutes: [
      'GET /api/agent/lang/element-explain',
      'GET /api/agent/lang/attrs',
      'GET /api/agent/lang/complete',
      'GET /api/agent/lang/hover',
      'POST /api/reference/complete',
      'POST /api/reference/hover',
    ],
    mcpTools: ['explain_element'],
    nativeIdeProvider: true,
  },
  {
    id: 'reference.expression.check',
    domain: 'reference-search-completion',
    title: 'Validate X4 script expressions with unsaved context hints and completions',
    status: 'partial',
    uiAnchors: [
      'src/components/ExpressionInput.tsx::ExpressionInput',
      'vscode-extension/src/extension.ts::/api/agent/lang/',
    ],
    capabilityIdentities: ['expression.check@1', 'expression.suggest@1'],
    apiRoutes: [
      'POST /api/agent/expressions/check',
      'POST /api/agent/check-expression',
      'POST /api/agent/suggest/expression',
    ],
    mcpTools: ['check_expression', 'suggest_expression_completions'],
    ownerIssue: '#79',
    missingBehavior: 'Expression validation (check_expression) and ScriptProperty completion suggestions with variableTypes hints (suggest_expression_completions) are projected over MCP, while MCP check_expression caps returned problems at 50.',
  },
  {
    id: 'reference.expression.inspect',
    domain: 'reference-search-completion',
    title: 'Inspect step-by-step X4 ScriptProperty chain types and receiver provenance',
    status: 'available',
    uiAnchors: [
      'src/components/ExpressionInput.tsx::ExpressionInput',
      'vscode-extension/src/extension.ts::/api/agent/lang/',
    ],
    capabilityIdentities: ['expression.inspect@1'],
    apiRoutes: [
      'POST /api/agent/expressions/inspect',
      'GET /api/agent/type-probe',
    ],
    mcpTools: ['inspect_expression'],
  },
  {
    id: 'reference.text.lookup',
    domain: 'reference-search-completion',
    title: 'Resolve `{page,id}` localized text entries across mod and base-game language tables',
    status: 'available',
    uiAnchors: [
      'src/components/TFileEditor.tsx::TFileEditor',
      'vscode-extension/src/extension.ts::/api/reference/',
    ],
    capabilityIdentities: ['text.lookup@1'],
    apiRoutes: ['POST /api/agent/text/lookup'],
    mcpTools: ['lookup_text'],
  },
  {
    id: 'reference.xml_map.inspect',
    domain: 'reference-search-completion',
    title: 'Traverse incoming and outgoing XML macro/component/ware file references',
    status: 'partial',
    uiAnchors: [
      'src/components/XmlReferenceView.tsx::/api/agent/project/xml-references',
      'vscode-extension/src/extension.ts::/api/agent/schema',
    ],
    capabilityIdentities: ['project.xml.references@1'],
    apiRoutes: ['POST /api/agent/project/xml-references'],
    mcpTools: ['get_xml_references'],
    ownerIssue: '#100',
    missingBehavior: 'MCP get_xml_references omits source preview/paths, caps graph size (60 nodes / 120 edges / depth 2), and #11 additive DLC collection merge semantics remain incomplete (#100).',
  },
  {
    id: 'release.nexus.prepare_and_download',
    domain: 'release-center',
    title: 'Prepare Nexus Mods release ZIP archive and download verified release artifacts',
    status: 'partial',
    uiAnchors: [
      'src/components/ReleaseCenter.tsx::ReleaseCenter',
      'src/components/ReleaseCenter.tsx::/api/agent/release/artifact/download',
    ],
    capabilityIdentities: ['release.artifact.verify@1', 'release.nexus.prepare@1'],
    apiRoutes: [
      'POST /api/agent/release/nexus/prepare',
      'POST /api/agent/release/nexus/build',
      'GET /api/agent/release/artifact/status',
      'POST /api/agent/release/artifact/download',
      'POST /api/agent/package/release',
    ],
    mcpTools: ['prepare_nexus_release', 'verify_release_artifact'],
    ownerIssue: '#19',
    missingBehavior: 'Nexus release ZIP packaging (prepare_nexus_release) and on-disk release report verification (verify_release_artifact) are available over MCP, while binary ZIP streaming (POST /api/agent/release/artifact/download) remains HTTP-only and POST /api/agent/release/export/receipt is Studio-session-only.',
  },
  {
    id: 'release.steam.prepare_verify_adopt',
    domain: 'release-center',
    title: 'Prepare Steam Workshop staging folder, verify WorkshopTool output, adopt workshopId, and record export receipts',
    status: 'partial',
    uiAnchors: [
      'src/components/ReleaseCenter.tsx::/api/agent/release/steam/verify',
      'src/components/ReleaseCenter.tsx::/api/agent/release/steam/adopt',
      'src/components/ReleaseCenter.tsx::/api/agent/release/export/receipt',
    ],
    capabilityIdentities: [
      'release.artifact.verify@1',
      'release.steam.adopt@1',
      'release.steam.prepare@1',
      'release.steam.verify@1',
    ],
    apiRoutes: [
      'GET /api/agent/release/artifact/status',
      'POST /api/agent/release/steam/prepare',
      'POST /api/agent/release/steam/build',
      'POST /api/agent/release/steam/verify',
      'POST /api/agent/release/steam/check',
      'POST /api/agent/release/steam/adopt',
      'POST /api/agent/release/steam/apply-adoption',
      'POST /api/agent/release/export/receipt',
    ],
    mcpTools: [
      'adopt_steam_workshop_id',
      'prepare_steam_release',
      'verify_release_artifact',
      'verify_steam_release',
    ],
    ownerIssue: '#19',
    missingBehavior: 'Steam CAT/DAT staging & backup ZIP preparation (prepare_steam_release), backup ZIP integrity check (verify_release_artifact), post-WorkshopTool manifest/payload verification (verify_steam_release), and CAS source workshopId adoption (adopt_steam_workshop_id) are projected over explicit-grant deploy API & MCP, while interactive Egosoft WorkshopTool.exe execution/path selection and human save-picker export receipts (POST /api/agent/release/export/receipt) remain Studio-session/human-operated.',
  },
  {
    id: 'runtime.debugger.inspect',
    domain: 'runtime-and-performance',
    title: 'Read attributed live X4 runtime debugger incidents, session state, and expectation verdicts',
    status: 'available',
    uiAnchors: [
      'src/components/PlaytestWorkspace.tsx::PlaytestWorkspace',
      'src/components/HealthCardOverlay.tsx::HealthCardOverlay',
    ],
    capabilityIdentities: ['runtime.debug.read@1'],
    apiRoutes: ['GET /api/agent/runtime-debugger'],
    mcpTools: ['runtime_debugger'],
    coverage: { sidebarTools: ['playtest'] },
  },
  {
    id: 'runtime.logs_and_probes.diagnose',
    domain: 'runtime-and-performance',
    title: 'Diagnose X4 debug logs, tail logs, preview probes/reloads, and correlate NPC/save telemetry',
    status: 'partial',
    uiAnchors: [
      'src/components/PlaytestWorkspace.tsx::/api/agent/log-diagnose',
      'src/components/PlaytestWorkspace.tsx::/api/agent/game-log/status',
    ],
    capabilityIdentities: ['runtime.log.diagnose@1'],
    apiRoutes: [
      'GET /api/agent/game-log/status',
      'GET /api/agent/debug-watcher/brief',
      'GET /api/agent/health-card',
      'GET /api/agent/live/bridge-state',
      'GET /api/agent/live/forge-state',
      'GET /api/agent/runtime-control',
      'POST /api/agent/log-diagnose',
      'POST /api/agent/log-file-tail',
      'POST /api/agent/live/cue-telemetry',
      'POST /api/agent/lua-staleness/instrument',
      'POST /api/agent/npc-identity-probe/parse-log',
      'POST /api/agent/npc-identity-probe/parse-save',
      'POST /api/agent/npc-identity-probe/correlate',
      'POST /api/agent/probe/preview',
      'POST /api/agent/runtime-control/preview',
      'POST /api/agent/runtime-control/reload',
    ],
    mcpTools: ['diagnose_game_log'],
    ownerIssue: '#19',
    missingBehavior: 'Pasted log root-cause and raw-engine-ID prose diagnosis is available over MCP (diagnose_game_log, capped at 512 KiB), while unredacted log tailing, Lua staleness instrumentation, NPC probes, and runtime reload routes remain HTTP-only.',
  },
  {
    id: 'runtime.performance.monitor_and_profile',
    domain: 'runtime-and-performance',
    title: 'Collect, read, stop, and profile backend and native extension-host performance telemetry',
    status: 'partial',
    uiAnchors: [
      'src/components/PerformancePanel.tsx::PerformancePanel',
      'src/components/PerformancePanel.tsx::/api/agent/performance/native',
    ],
    capabilityIdentities: [
      'performance.collect@1',
      'performance.native.collect@1',
      'performance.native.read@1',
      'performance.native.stop@1',
      'performance.profile@1',
      'performance.read@1',
    ],
    apiRoutes: [
      'GET /api/agent/performance',
      'POST /api/agent/performance/collection',
      'POST /api/agent/performance/profile',
      'GET /api/agent/performance/native',
      'POST /api/agent/performance/native/collection',
      'POST /api/agent/performance/native/stop',
    ],
    mcpTools: [
      'get_forge_performance',
      'start_forge_performance_capture',
      'profile_forge_backend',
      'get_forge_native_performance',
      'start_forge_native_performance_capture',
      'stop_forge_native_performance_capture',
    ],
    ownerIssue: '#109',
    missingBehavior: 'Backend and native performance tools are projected across API and MCP with bounded summaries, while installed-host qualification and equal-workload overhead proof remain open (#103/#109).',
  },
  {
    id: 'settings.directories.configure',
    domain: 'directory-settings',
    title: 'Read, preview, and apply Studio directory settings (schemaDir, x4ReferenceRoot, x4GamePath, modWorkspacePath, filesystemPath)',
    status: 'approval-required',
    uiAnchors: [
      'src/components/DirectorySettingsModal.tsx::DirectorySettingsModal',
      'src/components/FirstRunWizard.tsx::FirstRunWizard',
    ],
    capabilityIdentities: [
      'configuration.access.request@1',
      'configuration.access.status@1',
      'configuration.read@1',
      'configuration.preview@1',
      'configuration.apply@1',
      'configuration.status@1',
    ],
    apiRoutes: [
      'POST /api/agent/configuration/access/request',
      'GET /api/agent/configuration/access',
      'GET /api/agent/configuration',
      'POST /api/agent/configuration/preview',
      'POST /api/agent/configuration/apply',
      'GET /api/agent/configuration/status',
      'GET /api/schema/config',
      'POST /api/schema/config',
    ],
    mcpTools: [
      'request_configuration_access',
      'get_configuration_access_status',
      'get_configuration',
      'preview_configuration_change',
      'apply_configuration_change',
      'get_configuration_operation_status',
    ],
    coverage: { globalActions: ['settings'] },
    approvalWorkflow: CONFIGURATION_APPROVAL_WORKFLOW,
    ownerIssue: '#96',
  },
  {
    id: 'settings.first_run.detect_and_harvest',
    domain: 'directory-settings',
    title: 'Auto-detect X4 installation paths, harvest XSD schemas from game archives, and check reference coverage',
    status: 'partial',
    uiAnchors: [
      'src/components/FirstRunWizard.tsx::/api/agent/setup/harvest-schemas',
      'src/components/DirectorySettingsModal.tsx::/api/agent/detect-game',
    ],
    capabilityIdentities: ['reference.coverage.read@1'],
    apiRoutes: [
      'GET /api/agent/detect-game',
      'GET /api/reference/coverage',
      'GET /api/agent/reference/coverage',
      'POST /api/agent/setup/harvest-schemas',
    ],
    mcpTools: ['get_reference_coverage'],
    ownerIssue: '#75',
    missingBehavior: 'Reference-manifest domain coverage (get_reference_coverage) is projected over MCP, while host-path GET /api/agent/detect-game has no MCP tool, POST /api/agent/setup/harvest-schemas is Studio-session-only, and x4LogPath editing has no configuration API (#75/#19).',
  },
  {
    id: 'workspace.mod_folder.import_and_sync',
    domain: 'workspace-selection',
    title: 'Open or import an existing mod folder into the active workspace with round-trip safety checks',
    status: 'available',
    uiAnchors: [
      'src/components/SyncModal.tsx::/api/agent/mod-folder/import',
      'vscode-extension/src/extension.ts::x4forge.openModFolder',
    ],
    capabilityIdentities: ['workspace.mod.drift@1', 'workspace.mod.import@1', 'workspace.roundtrip.check@1'],
    apiRoutes: [
      'POST /api/agent/mod-folder/import',
      'POST /api/agent/mod-folder/sync',
      'POST /api/agent/round-trip-check',
      'POST /api/agent/mod-folder/round-trip',
      'GET /api/agent/mod-drift',
      'GET /api/agent/mod-folder/drift',
    ],
    mcpTools: ['check_xml_round_trip', 'get_mod_drift', 'import_mod_folder'],
    coverage: {
      extensionCommands: ['x4forge.openModFolder'],
      globalActions: ['sync-mod'],
    },
    ownerIssue: '#19',
  },
  {
    id: 'workspace.selection.switch_create_reset',
    domain: 'workspace-selection',
    title: 'List, switch, create, bootstrap, resolve conflicts, restore parked drafts, or reset Studio workspaces',
    status: 'partial',
    uiAnchors: [
      'src/App.tsx::/api/agent/workspaces',
      'src/App.tsx::/api/agent/workspace/restore-parked',
      'src/components/WorkspaceConflictDialog.tsx::WorkspaceConflictDialog',
    ],
    capabilityIdentities: ['workspace.read@2'],
    apiRoutes: [
      'GET /api/agent/workspaces',
      'POST /api/agent/workspaces/bootstrap',
      'POST /api/agent/workspaces',
      'GET /api/agent/workspace',
      'POST /api/agent/workspace',
      'GET /api/agent/workspace/parked',
      'POST /api/agent/workspace/restore-parked',
    ],
    mcpTools: ['get_workspace'],
    coverage: {
      globalActions: ['workspace-switcher', 'reset-workspace'],
    },
    ownerIssue: '#19',
    missingBehavior: 'Agent keys are workspace-bound by design (ADR-F5), POST /api/agent/workspaces and parked-draft recovery are Studio-session-only, and MCP has no workspace creation/reset/conflict-resolution projection.',
  },
];

export interface ForgeUiActionParityValidationExpectations {
  readonly extensionCommands?: readonly string[];
  readonly extensionSettings?: readonly string[];
  readonly globalActions?: readonly string[];
  readonly workspaceViews?: readonly string[];
  readonly sidebarTools?: readonly string[];
  readonly routeDispositions?: Readonly<Record<string, string>>;
  readonly liveMcpTools?: ReadonlySet<string>;
}

export function summarizeForgeUiActionParityCensus(
  actions: readonly ForgeUiActionParityRowV1[] = FORGE_UI_ACTION_PARITY_CENSUS,
): ForgeUiActionParitySummaryV1 {
  let available = 0;
  let approvalRequired = 0;
  let partial = 0;
  let missing = 0;
  for (const row of actions) {
    if (row.status === 'available') available += 1;
    else if (row.status === 'approval-required') approvalRequired += 1;
    else if (row.status === 'partial') partial += 1;
    else if (row.status === 'missing') missing += 1;
  }
  return {
    totalActions: actions.length,
    available,
    approvalRequired,
    partial,
    missing,
    openGaps: partial + missing,
  };
}

export function canonicalUiActionParityCensusPayload(
  actions: readonly ForgeUiActionParityRowV1[] = FORGE_UI_ACTION_PARITY_CENSUS,
): string {
  return stableStringify({
    schemaVersion: FORGE_UI_ACTION_PARITY_SCHEMA_VERSION,
    summary: summarizeForgeUiActionParityCensus(actions),
    actions,
  });
}

export function buildForgeUiActionParityCensus(
  hashSha256: (canonicalPayload: string) => string,
  actions: readonly ForgeUiActionParityRowV1[] = FORGE_UI_ACTION_PARITY_CENSUS,
): ForgeUiActionParityCensusV1 {
  return {
    schemaVersion: FORGE_UI_ACTION_PARITY_SCHEMA_VERSION,
    censusHash: hashSha256(canonicalUiActionParityCensusPayload(actions)),
    summary: summarizeForgeUiActionParityCensus(actions),
    actions,
  };
}

export function validateForgeUiActionParityCensus(
  actions: readonly ForgeUiActionParityRowV1[] = FORGE_UI_ACTION_PARITY_CENSUS,
  capabilities: readonly ForgeCapabilityDescriptorV1[] = FORGE_CAPABILITIES,
  expectations?: ForgeUiActionParityValidationExpectations,
): string[] {
  const errors: string[] = [];
  const capabilityMap = new Map<string, ForgeCapabilityDescriptorV1>();
  for (const capability of capabilities) {
    capabilityMap.set(`${capability.id}@${capability.version}`, capability);
  }
  const domainSet = new Set<string>(FORGE_UI_ACTION_PARITY_DOMAINS);
  const statusSet = new Set<string>(FORGE_UI_ACTION_PARITY_STATUSES);
  const seenIds = new Set<string>();
  const sortedIds = actions.map(action => action.id).sort();
  const referencedCapabilities = new Set<string>();

  const coveredExtensionCommands = new Set<string>();
  const coveredExtensionSettings = new Set<string>();
  const coveredGlobalActions = new Set<string>();
  const coveredWorkspaceViews = new Set<string>();
  const coveredSidebarTools = new Set<string>();

  actions.forEach((row, index) => {
    const label = `census/${row.id || `<index-${index}>`}`;
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(row.id)) {
      errors.push(`${label}: id must be a lower-case dotted semantic action identifier.`);
    }
    if (seenIds.has(row.id)) errors.push(`${label}: duplicate census action id.`);
    seenIds.add(row.id);
    if (sortedIds[index] !== row.id) {
      errors.push(`${label}: census rows must remain sorted by id.`);
    }
    if (!domainSet.has(row.domain)) errors.push(`${label}: unknown domain ${String(row.domain)}.`);
    if (!statusSet.has(row.status)) errors.push(`${label}: invalid status ${String(row.status)}.`);
    if (!row.title?.trim()) errors.push(`${label}: title is required.`);
    if (!Array.isArray(row.uiAnchors) || row.uiAnchors.length === 0) {
      errors.push(`${label}: at least one file::token uiAnchor is required.`);
    } else {
      const seenAnchors = new Set<string>();
      for (const anchor of row.uiAnchors) {
        if (!anchor?.includes('::')) errors.push(`${label}: malformed uiAnchor ${String(anchor)}.`);
        if (seenAnchors.has(anchor)) errors.push(`${label}: duplicate uiAnchor ${anchor}.`);
        seenAnchors.add(anchor);
      }
    }
    if (row.ownerIssue !== undefined && !/^#\d+$/.test(row.ownerIssue)) {
      errors.push(`${label}: ownerIssue must match #<number> (got ${String(row.ownerIssue)}).`);
    }

    const rowCapabilities: ForgeCapabilityDescriptorV1[] = [];
    const seenCapIds = new Set<string>();
    for (const capIdentity of row.capabilityIdentities) {
      if (seenCapIds.has(capIdentity)) errors.push(`${label}: duplicate capabilityIdentity ${capIdentity}.`);
      seenCapIds.add(capIdentity);
      const found = capabilityMap.get(capIdentity);
      if (!found) errors.push(`${label}: unknown capabilityIdentity ${capIdentity}.`);
      else {
        rowCapabilities.push(found);
        referencedCapabilities.add(capIdentity);
      }
    }

    const seenRoutes = new Set<string>();
    for (const route of row.apiRoutes) {
      if (!/^(?:GET|POST|PUT|PATCH|DELETE) \/api\/[^\s?#]+$/.test(route)) {
        errors.push(`${label}: malformed apiRoute ${String(route)}.`);
      }
      if (seenRoutes.has(route)) errors.push(`${label}: duplicate apiRoute ${route}.`);
      seenRoutes.add(route);
      if (expectations?.routeDispositions && !Object.hasOwn(expectations.routeDispositions, route)) {
        errors.push(`${label}: apiRoute does not exist in route dispositions: ${route}`);
      }
    }

    const declaredMcpByCap = new Map<string, ForgeSurfaceProjectionStatus>();
    for (const cap of rowCapabilities) {
      for (const mcp of cap.surfaces.mcp) {
        if (mcp.status !== 'disconnected') declaredMcpByCap.set(mcp.id, mcp.status);
      }
    }
    const seenMcp = new Set<string>();
    for (const tool of row.mcpTools) {
      if (seenMcp.has(tool)) errors.push(`${label}: duplicate mcpTool ${tool}.`);
      seenMcp.add(tool);
      if (!declaredMcpByCap.has(tool)) {
        errors.push(`${label}: mcpTool ${tool} is not an active MCP projection of the row's capabilityIdentities.`);
      }
      if (expectations?.liveMcpTools && !expectations.liveMcpTools.has(tool)) {
        errors.push(`${label}: mcpTool ${tool} is absent from live MCP TOOLS.`);
      }
    }

    if (row.status === 'available') {
      if (rowCapabilities.length === 0 || row.mcpTools.length === 0) {
        errors.push(`${label}: available status requires at least one capabilityIdentity and one connected mcpTool.`);
      }
      for (const cap of rowCapabilities) {
        if (cap.access.agentScopes.length === 0) {
          errors.push(`${label}: available capability ${cap.id}@${cap.version} has no agentScopes.`);
        }
        if (cap.id.startsWith('configuration.')) {
          errors.push(`${label}: session-grant capability ${cap.id}@${cap.version} must use approval-required, not available.`);
        }
        if (!cap.surfaces.mcp.some(mcp => mcp.status === 'connected' && row.mcpTools.includes(mcp.id))) {
          errors.push(`${label}: available capability ${cap.id}@${cap.version} lacks a connected MCP projection in mcpTools.`);
        }
      }
      if (row.missingBehavior !== undefined) {
        errors.push(`${label}: available row must not carry missingBehavior.`);
      }
      if (row.approvalWorkflow !== undefined) {
        errors.push(`${label}: available row must not carry approvalWorkflow.`);
      }
    } else if (row.status === 'approval-required') {
      if (!row.approvalWorkflow) {
        errors.push(`${label}: approval-required status requires an approvalWorkflow with request, status, apply, and receipt capabilities.`);
      } else {
        const wf = row.approvalWorkflow;
        const requiredIdentities = [
          wf.requestCapabilityIdentity,
          wf.statusCapabilityIdentity,
          ...wf.applyCapabilityIdentities,
          wf.receiptCapabilityIdentity,
        ];
        if (wf.applyCapabilityIdentities.length === 0) {
          errors.push(`${label}: approvalWorkflow requires at least one applyCapabilityIdentity.`);
        }
        if (wf.ownerDecisionRoutes.length === 0) {
          errors.push(`${label}: approvalWorkflow requires at least one ownerDecisionRoute.`);
        }
        for (const ownerRoute of wf.ownerDecisionRoutes) {
          if (expectations?.routeDispositions && !Object.hasOwn(expectations.routeDispositions, ownerRoute)) {
            errors.push(`${label}: approvalWorkflow ownerDecisionRoute does not exist: ${ownerRoute}`);
          }
        }
        for (const reqId of requiredIdentities) {
          if (!row.capabilityIdentities.includes(reqId)) {
            errors.push(`${label}: approvalWorkflow capability ${reqId} must also appear in row.capabilityIdentities.`);
          }
          const cap = capabilityMap.get(reqId);
          if (!cap) {
            errors.push(`${label}: approvalWorkflow references unknown capability ${reqId}.`);
          } else {
            if (cap.access.agentScopes.length === 0) {
              errors.push(`${label}: approvalWorkflow capability ${reqId} must allow agentScopes.`);
            }
            if (!cap.surfaces.mcp.some(mcp => mcp.status === 'connected' && row.mcpTools.includes(mcp.id))) {
              errors.push(`${label}: approvalWorkflow capability ${reqId} requires a connected MCP tool in row.mcpTools.`);
            }
          }
        }
      }
      if (row.missingBehavior !== undefined) {
        errors.push(`${label}: approval-required row with complete workflow must not carry missingBehavior.`);
      }
    } else if (row.status === 'partial') {
      if (!row.ownerIssue) errors.push(`${label}: partial row requires an ownerIssue (#<number>).`);
      if (!row.missingBehavior?.trim()) errors.push(`${label}: partial row requires a non-empty missingBehavior.`);
      if (row.approvalWorkflow !== undefined) errors.push(`${label}: partial row must not claim a complete approvalWorkflow.`);
      const hasAgentCapability = rowCapabilities.some(cap => cap.access.agentScopes.length > 0);
      const hasAgentRoute = row.apiRoutes.some(route => {
        if (!expectations?.routeDispositions) return true;
        const disposition = expectations.routeDispositions[route];
        return Boolean(disposition && disposition !== 'session-only' && disposition !== 'ui-internal');
      });
      if (!hasAgentCapability && !hasAgentRoute && !row.nativeIdeProvider) {
        errors.push(`${label}: partial status requires at least one agent-accessible capability, non-session-only API route, or nativeIdeProvider.`);
      }
    } else if (row.status === 'missing') {
      if (!row.ownerIssue) errors.push(`${label}: missing row requires an ownerIssue (#<number>).`);
      if (!row.missingBehavior?.trim()) errors.push(`${label}: missing row requires a non-empty missingBehavior.`);
      if (row.capabilityIdentities.length > 0 || row.mcpTools.length > 0) {
        errors.push(`${label}: missing row must not claim capabilityIdentities or mcpTools.`);
      }
      if (row.approvalWorkflow !== undefined) {
        errors.push(`${label}: missing row must not carry approvalWorkflow.`);
      }
      if (expectations?.routeDispositions) {
        for (const route of row.apiRoutes) {
          const disposition = expectations.routeDispositions[route];
          if (disposition && disposition !== 'session-only' && disposition !== 'ui-internal') {
            errors.push(`${label}: missing row references agent-accessible route ${route} (${disposition}); classify as partial instead.`);
          }
        }
      }
    }

    for (const cmd of row.coverage?.extensionCommands || []) coveredExtensionCommands.add(cmd);
    for (const setting of row.coverage?.extensionSettings || []) coveredExtensionSettings.add(setting);
    for (const action of row.coverage?.globalActions || []) coveredGlobalActions.add(action);
    for (const view of row.coverage?.workspaceViews || []) coveredWorkspaceViews.add(view);
    for (const tool of row.coverage?.sidebarTools || []) coveredSidebarTools.add(tool);
  });

  for (const capability of capabilities) {
    const identity = `${capability.id}@${capability.version}`;
    if (!referencedCapabilities.has(identity)) {
      errors.push(`census coverage gap: canonical capability ${identity} is not mapped by any UI-action parity row.`);
    }
  }

  const checkInventoryParity = (
    kind: string,
    expected: readonly string[] | undefined,
    actual: ReadonlySet<string>,
  ): void => {
    if (!expected) return;
    const expectedSet = new Set(expected);
    for (const item of expectedSet) {
      if (!actual.has(item)) errors.push(`census coverage gap: unclassified ${kind} "${item}".`);
    }
    for (const item of actual) {
      if (!expectedSet.has(item)) errors.push(`census coverage drift: unknown ${kind} "${item}" is not present in source inventory.`);
    }
  };

  checkInventoryParity('extension command', expectations?.extensionCommands, coveredExtensionCommands);
  checkInventoryParity('extension setting', expectations?.extensionSettings, coveredExtensionSettings);
  checkInventoryParity('Studio global action', expectations?.globalActions, coveredGlobalActions);
  checkInventoryParity('Studio workspace view', expectations?.workspaceViews, coveredWorkspaceViews);
  checkInventoryParity('Studio sidebar tool', expectations?.sidebarTools, coveredSidebarTools);

  return errors;
}
