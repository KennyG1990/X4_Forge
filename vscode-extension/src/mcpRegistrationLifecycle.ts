/**
 * #31 (Kimi R21) — Secure native opt-in MCP server registration lifecycle.
 *
 * Pure, host-agnostic state machine and lazy resolution broker for VS Code and
 * Antigravity MCP server definition providers (`vscode.lm.registerMcpServerDefinitionProvider`).
 *
 * Security & authority invariants:
 * 1. Plaintext agent keys (`x4fk_<64 hex>`) live ONLY in `context.secrets` (never in
 *    `globalState`, `workspaceState`, settings, output logs, clipboard, or package files).
 * 2. Durable metadata (`McpRegistrationMetadataV1`) stores non-secret identifiers only
 *    and is validated before both read and write (`assertNonSecretMetadata`).
 * 3. Sidecar startup and key minting are strictly LAZY: `provideDefinitions()` returns
 *    an empty-env stdio stub when `enabled` (or `[]` when `disabled` / `revocation-pending`),
 *    and `resolveDefinition()` acquires the owned sidecar + workspace-bound key on demand.
 * 4. Native MCP keys are strictly bounded to `'read' | 'write'` preset scopes (never
 *    `'deploy'` or `'all'` and never provider spend).
 * 5. Workspace changes (IDE folder signature or Studio `workspaceId`) immediately
 *    invalidate authority and revoke the owned key (`disabled` on confirmed revoke, or
 *    `revocation-pending` if revocation cannot yet be confirmed).
 * 6. Unsupported hosts refuse native enablement (`UNSUPPORTED_HOST_API`) and offer a
 *    placeholder-only manual JSON fallback without mutating external MCP config files.
 */

import * as crypto from "node:crypto";
import {
  createdAgentKeyMatchesRequestedAuthority,
} from "../../shared/agentKeyCreationContract";

type CreatedAgentKeyRecordShape = NonNullable<Parameters<typeof createdAgentKeyMatchesRequestedAuthority>[1]>;

export const MCP_PROVIDER_ID = "x4forge.mcp";
export const MCP_SERVER_LABEL = "X4 Forge Studio";
export const MCP_METADATA_STORAGE_KEY = "x4forge.mcpRegistration.v1";
export const MCP_SECRET_STORAGE_KEY = "x4forge.mcpAgentKey.v1";
export const MCP_OWNED_KEY_LABEL = "x4forge-native-mcp";
export const MCP_MANUAL_KEY_PLACEHOLDER =
  "<paste an agent key here — run 'X4 Forge: Create Agent Key' (write scope recommended)>";

export type McpRegistrationState = "disabled" | "enabled" | "revocation-pending";
export type McpAllowedScope = "read" | "write";
export type McpAllowedTtl = "1h" | "24h" | "7d" | "30d";

export type McpRefusalCode =
  | "UNSUPPORTED_HOST_API"
  | "REGISTRATION_DISABLED"
  | "REVOCATION_PENDING"
  | "SIDECAR_UNAVAILABLE"
  | "KEY_INVALID_OR_REVOKED"
  | "SECRET_STORE_FAILURE"
  | "WORKSPACE_AUTHORITY_CHANGED"
  | "REVOKE_FAILED"
  | "MALFORMED_CAPABILITY_CONTRACT";

export interface McpRegistrationMetadataV1 {
  schemaVersion: 1;
  state: McpRegistrationState;
  scope: McpAllowedScope;
  ttl: McpAllowedTtl;
  boundWorkspaceId: string | null;
  ideWorkspaceSignature: string;
  keyId: string | null;
  hashPrefix: string | null;
  lastErrorCode: McpRefusalCode | null;
  updatedAt: number;
}

export interface McpMetadataPersistence {
  readMetadata(): unknown;
  writeMetadata(next: McpRegistrationMetadataV1): Promise<void>;
}

export interface McpSecretVault {
  readSecret(): Promise<string | undefined>;
  saveSecret(token: string): Promise<void>;
  removeSecret(): Promise<void>;
}

export interface OwnedSidecarSnapshot {
  owned: boolean;
  baseUrl: string;
  sessionToken?: string;
  workspaceId?: string;
  clientId?: string;
}

export interface McpSidecarBroker {
  /** Non-mutating snapshot if backend is already running; null if stopped. */
  peekSidecar(): OwnedSidecarSnapshot | null;
  /** Lazily start/attach backend when needed (`resolveDefinition` or explicit revoke). */
  ensureSidecar(): Promise<OwnedSidecarSnapshot>;
  fetchJson(
    url: string,
    init?: {
      method?: "GET" | "POST";
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<{ ok: boolean; status: number; body: unknown }>;
  createOperationId(): string;
}

export interface McpStdioDefinitionDescriptor {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  version: string;
}

export interface McpLifecycleResult {
  ok: boolean;
  state: McpRegistrationState;
  code?: McpRefusalCode;
  message: string;
  manualFallbackJson?: string;
}

export interface McpResolveResult {
  ok: boolean;
  definition?: McpStdioDefinitionDescriptor;
  code?: McpRefusalCode;
  state: McpRegistrationState;
  message: string;
}

export interface HostMcpProviderDetection<TDef = unknown> {
  supported: boolean;
  registerProvider?: (
    id: string,
    provider: {
      onDidChangeMcpServerDefinitions?: unknown;
      provideMcpServerDefinitions: (token: unknown) => Promise<TDef[]> | TDef[];
      resolveMcpServerDefinition?: (server: TDef, token: unknown) => Promise<TDef | undefined>;
    },
  ) => { dispose(): void };
  createStdioDefinition?: (descriptor: McpStdioDefinitionDescriptor) => TDef;
}

const VALID_STATES = new Set<McpRegistrationState>(["disabled", "enabled", "revocation-pending"]);
const VALID_SCOPES = new Set<McpAllowedScope>(["read", "write"]);
const VALID_TTLS = new Set<McpAllowedTtl>(["1h", "24h", "7d", "30d"]);
const VALID_REFUSALS = new Set<McpRefusalCode>([
  "UNSUPPORTED_HOST_API",
  "REGISTRATION_DISABLED",
  "REVOCATION_PENDING",
  "SIDECAR_UNAVAILABLE",
  "KEY_INVALID_OR_REVOKED",
  "SECRET_STORE_FAILURE",
  "WORKSPACE_AUTHORITY_CHANGED",
  "REVOKE_FAILED",
  "MALFORMED_CAPABILITY_CONTRACT",
]);

const WORKSPACE_ID_RE = /^ws_[a-f0-9]{24}$/i;
const AGENT_TOKEN_EXACT_RE = /^x4fk_[0-9a-f]{64}$/i;
const AGENT_TOKEN_SUBSTRING_RE = /\bx4fk_[0-9a-fA-Z_-]{8,}\b/gi;
const BEARER_SUBSTRING_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const KEY_ID_RE = /^key_[a-z0-9]+_[a-f0-9]{8}$/i;
const HASH_PREFIX_RE = /^[a-f0-9]{8}$/i;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

export function redactMcpSecrets(input: string): string {
  return String(input || "")
    .replace(AGENT_TOKEN_SUBSTRING_RE, "[REDACTED_AGENT_KEY]")
    .replace(BEARER_SUBSTRING_RE, "Bearer [REDACTED_TOKEN]");
}

export function containsMcpSecretMaterial(input: string): boolean {
  const text = String(input || "");
  AGENT_TOKEN_SUBSTRING_RE.lastIndex = 0;
  if (AGENT_TOKEN_SUBSTRING_RE.test(text)) return true;
  BEARER_SUBSTRING_RE.lastIndex = 0;
  return BEARER_SUBSTRING_RE.test(text);
}

export function computeIdeWorkspaceSignature(folderPaths: readonly string[]): string {
  const normalized = folderPaths
    .map(entry => String(entry || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase())
    .filter(Boolean)
    .sort();
  if (normalized.length === 0) return "ide_ws_empty";
  const digest = crypto.createHash("sha256").update(normalized.join("\n"), "utf8").digest("hex").slice(0, 24);
  return `ide_ws_${digest}`;
}

export function hashAgentTokenPrefix(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex").slice(0, 8);
}

function defaultMetadata(ideWorkspaceSignature: string, now: number): McpRegistrationMetadataV1 {
  return {
    schemaVersion: 1,
    state: "disabled",
    scope: "write",
    ttl: "7d",
    boundWorkspaceId: null,
    ideWorkspaceSignature,
    keyId: null,
    hashPrefix: null,
    lastErrorCode: null,
    updatedAt: now,
  };
}

export function assertNonSecretMetadata(metadata: McpRegistrationMetadataV1): void {
  const serialized = JSON.stringify(metadata);
  if (containsMcpSecretMaterial(serialized)) {
    throw new Error("Refusing to persist secret material in non-secret MCP metadata.");
  }
  if (metadata.schemaVersion !== 1 || !VALID_STATES.has(metadata.state)) {
    throw new Error("Invalid MCP registration metadata state.");
  }
  if (!VALID_SCOPES.has(metadata.scope)) {
    throw new Error("Invalid MCP registration scope; only read and write are permitted.");
  }
  if (!VALID_TTLS.has(metadata.ttl)) {
    throw new Error("Invalid MCP registration TTL.");
  }
  if (metadata.boundWorkspaceId !== null && !WORKSPACE_ID_RE.test(metadata.boundWorkspaceId)) {
    throw new Error("Invalid MCP boundWorkspaceId.");
  }
  if (metadata.keyId !== null && !KEY_ID_RE.test(metadata.keyId)) {
    throw new Error("Invalid MCP keyId.");
  }
  if (metadata.hashPrefix !== null && !HASH_PREFIX_RE.test(metadata.hashPrefix)) {
    throw new Error("Invalid MCP hashPrefix.");
  }
  if (metadata.state === "disabled" && (metadata.keyId !== null || metadata.hashPrefix !== null)) {
    throw new Error("Disabled MCP metadata must not retain active key identifiers.");
  }
  if (metadata.state === "revocation-pending" && metadata.keyId === null) {
    throw new Error("Revocation-pending MCP metadata must name the unrevoked keyId.");
  }
}

export function normalizeStoredMcpMetadata(
  raw: unknown,
  currentIdeWorkspaceSignature: string,
  now: number,
): McpRegistrationMetadataV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultMetadata(currentIdeWorkspaceSignature, now);
  }
  const candidate = raw as Partial<McpRegistrationMetadataV1>;
  const serialized = JSON.stringify(raw);
  const salvagedKeyId = typeof candidate.keyId === "string" && KEY_ID_RE.test(candidate.keyId)
    ? candidate.keyId
    : null;
  if (
    containsMcpSecretMaterial(serialized)
    || candidate.schemaVersion !== 1
    || typeof candidate.state !== "string"
    || !VALID_STATES.has(candidate.state as McpRegistrationState)
    || typeof candidate.scope !== "string"
    || !VALID_SCOPES.has(candidate.scope as McpAllowedScope)
    || typeof candidate.ttl !== "string"
    || !VALID_TTLS.has(candidate.ttl as McpAllowedTtl)
    || typeof candidate.ideWorkspaceSignature !== "string"
    || !candidate.ideWorkspaceSignature.trim()
  ) {
    // Fail closed: if corrupt metadata still names an owned keyId, preserve it in
    // revocation-pending so it cannot be silently orphaned.
    if (salvagedKeyId) {
      return {
        ...defaultMetadata(currentIdeWorkspaceSignature, now),
        state: "revocation-pending",
        keyId: salvagedKeyId,
        lastErrorCode: "REVOKE_FAILED",
      };
    }
    return defaultMetadata(currentIdeWorkspaceSignature, now);
  }
  const boundWorkspaceId = typeof candidate.boundWorkspaceId === "string" && WORKSPACE_ID_RE.test(candidate.boundWorkspaceId)
    ? candidate.boundWorkspaceId
    : null;
  const hashPrefix = typeof candidate.hashPrefix === "string" && HASH_PREFIX_RE.test(candidate.hashPrefix)
    ? candidate.hashPrefix.toLowerCase()
    : null;
  const lastErrorCode = typeof candidate.lastErrorCode === "string" && VALID_REFUSALS.has(candidate.lastErrorCode as McpRefusalCode)
    ? (candidate.lastErrorCode as McpRefusalCode)
    : null;
  const state: McpRegistrationState = candidate.state === "revocation-pending" && !salvagedKeyId
    ? "disabled"
    : candidate.state === "disabled" && salvagedKeyId
    ? "revocation-pending"
    : (candidate.state as McpRegistrationState);
  return {
    schemaVersion: 1,
    state,
    scope: candidate.scope as McpAllowedScope,
    ttl: candidate.ttl as McpAllowedTtl,
    boundWorkspaceId: state === "disabled" ? null : boundWorkspaceId,
    ideWorkspaceSignature: candidate.ideWorkspaceSignature,
    keyId: state === "disabled" ? null : salvagedKeyId,
    hashPrefix: state === "disabled" ? null : hashPrefix,
    lastErrorCode,
    updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : now,
  };
}

export function isValidLiveCapabilityContract(schemaBody: unknown): boolean {
  if (!schemaBody || typeof schemaBody !== "object" || Array.isArray(schemaBody)) return false;
  const contract = (schemaBody as Record<string, unknown>).capability_contract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return false;
  const record = contract as Record<string, unknown>;
  if (record.schemaVersion !== "forge.capability.v1") return false;
  if (typeof record.contractHash !== "string" || !SHA256_HEX_RE.test(record.contractHash)) return false;
  if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) return false;
  return record.capabilities.every(item => (
    !!item
    && typeof item === "object"
    && !Array.isArray(item)
    && typeof (item as Record<string, unknown>).id === "string"
    && ((item as Record<string, unknown>).id as string).length > 0
    && typeof (item as Record<string, unknown>).version === "number"
  ));
}

export function isValidEffectiveAuthorityPayload(body: unknown, expectedWorkspaceId: string): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (record.api_version !== "2026-08-01.agent-effective.v1") return false;
  if (record.authority_schema_version !== "forge.agent-capability-authority.v1") return false;
  if (typeof record.authority_hash !== "string" || !SHA256_HEX_RE.test(record.authority_hash)) return false;
  const actor = record.actor as Record<string, unknown> | undefined;
  if (!actor || actor.kind !== "agent" || actor.workspaceId !== expectedWorkspaceId) return false;
  const nested = { capability_contract: record.capability_contract };
  const contract = record.capability_contract as Record<string, unknown> | undefined;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return false;
  if (contract.schemaVersion !== "forge.capability.v1") return false;
  if (typeof contract.contractHash !== "string" || !SHA256_HEX_RE.test(contract.contractHash)) return false;
  if (!Array.isArray(contract.capabilities)) return false;
  return contract.capabilities.length === 0 || isValidLiveCapabilityContract(nested);
}

export function buildManualMcpConfigFallback(options: {
  shimPath: string;
  bootstrapPath?: string;
  storageDir?: string;
  forgeRoot?: string;
  baseUrl?: string;
  workspaceId?: string | null;
  nodeCommand?: string;
  existingConfigJson?: string;
}): string {
  const useBootstrap = typeof options.bootstrapPath === "string" && options.bootstrapPath.trim().length > 0;
  const forgeServer = {
    command: options.nodeCommand || "node",
    args: [useBootstrap ? options.bootstrapPath!.trim() : options.shimPath],
    env: {
      X4FORGE_URL: useBootstrap
        ? "auto"
        : (options.baseUrl || "http://127.0.0.1:3000").replace(/\/+$/, ""),
      X4FORGE_KEY: MCP_MANUAL_KEY_PLACEHOLDER,
      X4FORGE_WORKSPACE_ID: options.workspaceId && WORKSPACE_ID_RE.test(options.workspaceId)
        ? options.workspaceId
        : "<workspace id>",
      ...(useBootstrap && typeof options.storageDir === "string" && options.storageDir.trim().length > 0
        ? { X4FORGE_STORAGE_DIR: options.storageDir.trim() }
        : {}),
      ...(useBootstrap && typeof options.forgeRoot === "string" && options.forgeRoot.trim().length > 0
        ? { X4FORGE_FORGE_ROOT: options.forgeRoot.trim() }
        : {}),
    },
  };
  let root: Record<string, unknown> = {};
  if (typeof options.existingConfigJson === "string" && options.existingConfigJson.trim().length > 0) {
    const parsed = JSON.parse(options.existingConfigJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Existing MCP configuration JSON must be a JSON object.");
    }
    root = { ...(parsed as Record<string, unknown>) };
  }
  const existingServers = root.mcpServers && typeof root.mcpServers === "object" && !Array.isArray(root.mcpServers)
    ? { ...(root.mcpServers as Record<string, unknown>) }
    : {};
  existingServers.x4forge = forgeServer;
  const merged = { ...root, mcpServers: existingServers };
  const serialized = JSON.stringify(merged, null, 2);
  if (containsMcpSecretMaterial(serialized)) {
    throw new Error("Manual MCP fallback must never embed live secret material.");
  }
  return serialized;
}

export function detectHostMcpProviderApi(vscodeNamespace: unknown): HostMcpProviderDetection {
  if (!vscodeNamespace || typeof vscodeNamespace !== "object") {
    return { supported: false };
  }
  const ns = vscodeNamespace as {
    lm?: { registerMcpServerDefinitionProvider?: unknown };
    McpStdioServerDefinition?: new (
      label: string,
      command: string,
      args?: string[],
      env?: Record<string, string | number | null>,
      version?: string,
    ) => { env?: Record<string, string | number | null> };
  };
  const registerFn = ns.lm?.registerMcpServerDefinitionProvider;
  const Ctor = ns.McpStdioServerDefinition;
  if (typeof registerFn !== "function" || typeof Ctor !== "function") {
    return { supported: false };
  }
  return {
    supported: true,
    registerProvider: (id, provider) =>
      (registerFn as (providerId: string, impl: unknown) => { dispose(): void }).call(ns.lm, id, provider),
    createStdioDefinition: descriptor =>
      new Ctor(
        descriptor.label,
        descriptor.command,
        [...descriptor.args],
        { ...descriptor.env },
        descriptor.version,
      ),
  };
}

export interface CreateMcpRegistrationLifecycleOptions {
  hostSupported: boolean;
  shimPath: string;
  extensionVersion: string;
  getNodeCommand: () => string;
  getIdeWorkspaceSignature: () => string;
  metadataStore: McpMetadataPersistence;
  secretVault: McpSecretVault;
  sidecar: McpSidecarBroker;
  now?: () => number;
  log?: (line: string) => void;
  onDidChangeDefinitions?: () => void;
}

interface ListedAgentKeyRow {
  id?: unknown;
  label?: unknown;
  scope?: unknown;
  workspaceId?: unknown;
  expiresAt?: unknown;
  revokedAt?: unknown;
}

export function createMcpRegistrationLifecycle(options: CreateMcpRegistrationLifecycleOptions) {
  const clock = options.now ?? (() => Date.now());
  const safeLog = (line: string) => {
    options.log?.(redactMcpSecrets(line));
  };
  const notifyChanged = () => {
    options.onDidChangeDefinitions?.();
  };

  let metadata: McpRegistrationMetadataV1 = normalizeStoredMcpMetadata(
    options.metadataStore.readMetadata(),
    options.getIdeWorkspaceSignature(),
    clock(),
  );
  let opQueue: Promise<unknown> = Promise.resolve();

  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = opQueue.then(fn, fn);
    opQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function persistMetadata(next: McpRegistrationMetadataV1): Promise<void> {
    assertNonSecretMetadata(next);
    await options.metadataStore.writeMetadata(next);
    metadata = next;
  }

  function sidecarHeaders(snapshot: OwnedSidecarSnapshot, json = false, workspaceId?: string | null): Record<string, string> {
    const headers: Record<string, string> = {};
    if (snapshot.sessionToken) headers.Authorization = `Bearer ${snapshot.sessionToken}`;
    if (snapshot.clientId) headers["x-client-id"] = snapshot.clientId;
    const effectiveWs = workspaceId || snapshot.workspaceId;
    if (effectiveWs) headers["x-workspace-id"] = effectiveWs;
    if (json) {
      headers["Content-Type"] = "application/json";
      headers["x-forge-operation-id"] = options.sidecar.createOperationId();
    }
    return headers;
  }

  async function revokeExactKeyOnServer(
    keyId: string,
    preferPeekOnly: boolean,
  ): Promise<{ confirmedInactive: boolean; reason?: string }> {
    let snapshot: OwnedSidecarSnapshot | null = null;
    try {
      snapshot = preferPeekOnly ? options.sidecar.peekSidecar() : await options.sidecar.ensureSidecar();
    } catch (error) {
      return {
        confirmedInactive: false,
        reason: redactMcpSecrets(error instanceof Error ? error.message : String(error)),
      };
    }
    if (!snapshot || !snapshot.owned || !snapshot.sessionToken) {
      return {
        confirmedInactive: false,
        reason: "Owned Forge sidecar is unavailable to confirm key revocation.",
      };
    }
    try {
      const revokeRes = await options.sidecar.fetchJson(`${snapshot.baseUrl}/api/agent/keys/revoke`, {
        method: "POST",
        headers: sidecarHeaders(snapshot, true),
        body: JSON.stringify({ id: keyId }),
      });
      if (revokeRes.ok) {
        return { confirmedInactive: true };
      }
      if (revokeRes.status === 404) {
        // Confirm via GET /api/agent/keys that the key is genuinely absent or already has revokedAt !== null.
        const listRes = await options.sidecar.fetchJson(`${snapshot.baseUrl}/api/agent/keys`, {
          method: "GET",
          headers: sidecarHeaders(snapshot, false),
        });
        const keys = (listRes.body as { keys?: ListedAgentKeyRow[] } | null)?.keys;
        if (listRes.ok && Array.isArray(keys)) {
          const match = keys.find(row => row?.id === keyId);
          if (!match || (match.revokedAt !== null && match.revokedAt !== undefined)) {
            return { confirmedInactive: true };
          }
        }
      }
      const errText = (revokeRes.body as { error?: string } | null)?.error || `HTTP ${revokeRes.status}`;
      return { confirmedInactive: false, reason: redactMcpSecrets(errText) };
    } catch (error) {
      return {
        confirmedInactive: false,
        reason: redactMcpSecrets(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async function retireOwnedAuthorityInternal(
    code: McpRefusalCode,
    preferPeekOnly: boolean,
    nextIdeSignature: string,
  ): Promise<{ fullyRetired: boolean; secretCleared: boolean; reason?: string }> {
    const targetKeyId = metadata.keyId;
    let secretCleared = true;
    try {
      await options.secretVault.removeSecret();
    } catch (error) {
      secretCleared = false;
      safeLog(`MCP secret vault delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!targetKeyId) {
      await persistMetadata({
        schemaVersion: 1,
        state: "disabled",
        scope: metadata.scope,
        ttl: metadata.ttl,
        boundWorkspaceId: null,
        ideWorkspaceSignature: nextIdeSignature,
        keyId: null,
        hashPrefix: null,
        lastErrorCode: secretCleared ? code : "SECRET_STORE_FAILURE",
        updatedAt: clock(),
      });
      notifyChanged();
      return { fullyRetired: secretCleared, secretCleared };
    }

    const revoked = await revokeExactKeyOnServer(targetKeyId, preferPeekOnly);
    if (revoked.confirmedInactive && secretCleared) {
      await persistMetadata({
        schemaVersion: 1,
        state: "disabled",
        scope: metadata.scope,
        ttl: metadata.ttl,
        boundWorkspaceId: null,
        ideWorkspaceSignature: nextIdeSignature,
        keyId: null,
        hashPrefix: null,
        lastErrorCode: code,
        updatedAt: clock(),
      });
      safeLog(`MCP key ${targetKeyId} revoked and registration disabled (${code}).`);
      notifyChanged();
      return { fullyRetired: true, secretCleared: true };
    }

    const pendingCode: McpRefusalCode = !secretCleared ? "SECRET_STORE_FAILURE" : "REVOKE_FAILED";
    await persistMetadata({
      schemaVersion: 1,
      state: "revocation-pending",
      scope: metadata.scope,
      ttl: metadata.ttl,
      boundWorkspaceId: metadata.boundWorkspaceId,
      ideWorkspaceSignature: nextIdeSignature,
      keyId: targetKeyId,
      hashPrefix: metadata.hashPrefix,
      lastErrorCode: code === "WORKSPACE_AUTHORITY_CHANGED" ? "WORKSPACE_AUTHORITY_CHANGED" : pendingCode,
      updatedAt: clock(),
    });
    safeLog(
      `MCP registration entered revocation-pending for ${targetKeyId}: ${revoked.reason || "secret cleanup incomplete"}`,
    );
    notifyChanged();
    return {
      fullyRetired: false,
      secretCleared,
      reason: revoked.reason || (!secretCleared ? "Could not clear secret from context.secrets." : undefined),
    };
  }

  return {
    getStatus(): {
      hostSupported: boolean;
      state: McpRegistrationState;
      scope: McpAllowedScope;
      ttl: McpAllowedTtl;
      boundWorkspaceId: string | null;
      ideWorkspaceSignature: string;
      keyId: string | null;
      hashPrefix: string | null;
      lastErrorCode: McpRefusalCode | null;
      updatedAt: number;
    } {
      return {
        hostSupported: options.hostSupported,
        ...metadata,
      };
    },

    buildManualFallback(existingConfigJson?: string): string {
      const peek = options.sidecar.peekSidecar();
      return buildManualMcpConfigFallback({
        shimPath: options.shimPath,
        baseUrl: peek?.baseUrl,
        workspaceId: peek?.workspaceId ?? metadata.boundWorkspaceId,
        nodeCommand: options.getNodeCommand(),
        existingConfigJson,
      });
    },

    /**
     * Reconcile persisted metadata at extension activation WITHOUT starting the sidecar
     * or minting/reading secrets. Prevents cross-workspace authority widening on restart.
     */
    rehydrateOnActivate(): Promise<McpRegistrationState> {
      return runExclusive(async () => {
        const currentSig = options.getIdeWorkspaceSignature();
        metadata = normalizeStoredMcpMetadata(options.metadataStore.readMetadata(), currentSig, clock());
        if (!options.hostSupported && metadata.state === "enabled") {
          if (metadata.keyId) {
            await persistMetadata({
              ...metadata,
              state: "revocation-pending",
              lastErrorCode: "UNSUPPORTED_HOST_API",
              updatedAt: clock(),
            });
          } else {
            await persistMetadata({
              ...metadata,
              state: "disabled",
              boundWorkspaceId: null,
              lastErrorCode: "UNSUPPORTED_HOST_API",
              updatedAt: clock(),
            });
          }
          notifyChanged();
          return metadata.state;
        }
        if (metadata.state === "enabled" && metadata.ideWorkspaceSignature !== currentSig) {
          await retireOwnedAuthorityInternal("WORKSPACE_AUTHORITY_CHANGED", true, currentSig);
        }
        return metadata.state;
      });
    },

    /**
     * Non-interactive provider listing (`provideMcpServerDefinitions`).
     * Never launches the sidecar, never mints a key, and never embeds a token in `env`.
     */
    provideDefinitions(): McpStdioDefinitionDescriptor[] {
      if (!options.hostSupported || metadata.state !== "enabled") {
        return [];
      }
      const currentSig = options.getIdeWorkspaceSignature();
      if (metadata.ideWorkspaceSignature !== currentSig) {
        void this.handleWorkspaceAuthorityChange(undefined);
        return [];
      }
      return [
        {
          label: MCP_SERVER_LABEL,
          command: options.getNodeCommand(),
          args: [options.shimPath],
          env: {},
          version: `${options.extensionVersion}:${metadata.scope}:${metadata.boundWorkspaceId || "lazy"}:${metadata.keyId || "pending"}`,
        },
      ];
    },

    /**
     * Lazy on-demand resolution (`resolveMcpServerDefinition`): resolves the owned sidecar,
     * validates live `/api/agent/schema`, verifies workspace binding, reuses or lazily mints
     * the scoped key in `context.secrets`, and verifies `/api/agent/capabilities/effective`.
     */
    resolveDefinition(): Promise<McpResolveResult> {
      return runExclusive(async () => {
        if (!options.hostSupported) {
          return {
            ok: false,
            state: metadata.state,
            code: "UNSUPPORTED_HOST_API",
            message: "This IDE host does not expose the native MCP definition-provider API; use Copy MCP Config (manual fallback).",
          };
        }
        if (metadata.state === "revocation-pending") {
          return {
            ok: false,
            state: "revocation-pending",
            code: "REVOCATION_PENDING",
            message: `Native MCP is paused while key ${metadata.keyId} awaits revocation confirmation.`,
          };
        }
        if (metadata.state !== "enabled") {
          return {
            ok: false,
            state: metadata.state,
            code: "REGISTRATION_DISABLED",
            message: "Native MCP registration is disabled. Run 'X4 Forge: Manage Native MCP Registration' to opt in.",
          };
        }

        const currentSig = options.getIdeWorkspaceSignature();
        if (metadata.ideWorkspaceSignature !== currentSig) {
          await retireOwnedAuthorityInternal("WORKSPACE_AUTHORITY_CHANGED", false, currentSig);
          return {
            ok: false,
            state: metadata.state,
            code: "WORKSPACE_AUTHORITY_CHANGED",
            message: "IDE workspace folders changed; previous MCP authority was invalidated. Re-enable Native MCP for this workspace.",
          };
        }

        let sidecar: OwnedSidecarSnapshot;
        try {
          sidecar = await options.sidecar.ensureSidecar();
        } catch (error) {
          const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
          return {
            ok: false,
            state: metadata.state,
            code: "SIDECAR_UNAVAILABLE",
            message: `Forge managed sidecar is unavailable: ${detail}`,
          };
        }
        if (!sidecar.owned || !sidecar.sessionToken) {
          return {
            ok: false,
            state: metadata.state,
            code: "SIDECAR_UNAVAILABLE",
            message: "Forge is attached to an external server without managed sidecar ownership; native MCP registration requires an extension-owned sidecar.",
          };
        }

        const liveWorkspaceId = String(sidecar.workspaceId || "").trim();
        if (!WORKSPACE_ID_RE.test(liveWorkspaceId)) {
          return {
            ok: false,
            state: metadata.state,
            code: "SIDECAR_UNAVAILABLE",
            message: "Forge sidecar has no bound workspace authority yet.",
          };
        }

        if (metadata.boundWorkspaceId !== null && metadata.boundWorkspaceId !== liveWorkspaceId) {
          await retireOwnedAuthorityInternal("WORKSPACE_AUTHORITY_CHANGED", false, currentSig);
          return {
            ok: false,
            state: metadata.state,
            code: "WORKSPACE_AUTHORITY_CHANGED",
            message: `Active Forge workspace changed (${metadata.boundWorkspaceId} -> ${liveWorkspaceId}); previous MCP authority was invalidated.`,
          };
        }

        // Validate current capability contract on GET /api/agent/schema before minting or handing out credentials.
        let schemaRes: { ok: boolean; status: number; body: unknown };
        try {
          schemaRes = await options.sidecar.fetchJson(`${sidecar.baseUrl}/api/agent/schema`, { method: "GET" });
        } catch (error) {
          const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
          return {
            ok: false,
            state: metadata.state,
            code: "SIDECAR_UNAVAILABLE",
            message: `Could not reach Forge schema endpoint: ${detail}`,
          };
        }
        if (!schemaRes.ok || !isValidLiveCapabilityContract(schemaRes.body)) {
          await persistMetadata({ ...metadata, lastErrorCode: "MALFORMED_CAPABILITY_CONTRACT", updatedAt: clock() });
          return {
            ok: false,
            state: metadata.state,
            code: "MALFORMED_CAPABILITY_CONTRACT",
            message: "Forge sidecar returned a missing or malformed capability_contract on /api/agent/schema; refusing MCP launch.",
          };
        }

        let resolvedToken = "";
        if (metadata.keyId !== null) {
          let storedToken: string | undefined;
          try {
            storedToken = await options.secretVault.readSecret();
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            await persistMetadata({ ...metadata, lastErrorCode: "SECRET_STORE_FAILURE", updatedAt: clock() });
            return {
              ok: false,
              state: metadata.state,
              code: "SECRET_STORE_FAILURE",
              message: `Could not read MCP key from IDE secret storage: ${detail}`,
            };
          }
          const trimmed = String(storedToken || "").trim();
          const tokenFormatOk = AGENT_TOKEN_EXACT_RE.test(trimmed);
          const prefixOk = tokenFormatOk && (!metadata.hashPrefix || hashAgentTokenPrefix(trimmed) === metadata.hashPrefix);
          if (!tokenFormatOk || !prefixOk) {
            await retireOwnedAuthorityInternal("KEY_INVALID_OR_REVOKED", false, currentSig);
            return {
              ok: false,
              state: metadata.state,
              code: "KEY_INVALID_OR_REVOKED",
              message: "Stored MCP credential is missing or does not match owned metadata; previous key was retired.",
            };
          }

          let keysRes: { ok: boolean; status: number; body: unknown };
          try {
            keysRes = await options.sidecar.fetchJson(`${sidecar.baseUrl}/api/agent/keys`, {
              method: "GET",
              headers: sidecarHeaders(sidecar, false, liveWorkspaceId),
            });
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            return {
              ok: false,
              state: metadata.state,
              code: "SIDECAR_UNAVAILABLE",
              message: `Could not inspect Forge agent key inventory: ${detail}`,
            };
          }
          const rows = (keysRes.body as { keys?: ListedAgentKeyRow[] } | null)?.keys;
          const record = keysRes.ok && Array.isArray(rows) ? rows.find(item => item?.id === metadata.keyId) : undefined;
          const nowMs = clock();
          const notExpired = !record || record.expiresAt === null || record.expiresAt === undefined
            || (typeof record.expiresAt === "number" && record.expiresAt > nowMs);
          if (
            !record
            || (record.revokedAt !== null && record.revokedAt !== undefined)
            || !notExpired
            || record.workspaceId !== liveWorkspaceId
            || record.scope !== metadata.scope
          ) {
            await retireOwnedAuthorityInternal("KEY_INVALID_OR_REVOKED", false, currentSig);
            return {
              ok: false,
              state: metadata.state,
              code: "KEY_INVALID_OR_REVOKED",
              message: "Owned MCP agent key is missing, expired, revoked, or mismatched on the sidecar; registration was invalidated.",
            };
          }
          resolvedToken = trimmed;
        } else {
          // Lazily mint a workspace-bound preset key ('read' | 'write' only).
          let createRes: { ok: boolean; status: number; body: unknown };
          try {
            createRes = await options.sidecar.fetchJson(`${sidecar.baseUrl}/api/agent/keys`, {
              method: "POST",
              headers: sidecarHeaders(sidecar, true, liveWorkspaceId),
              body: JSON.stringify({
                label: MCP_OWNED_KEY_LABEL,
                scope: metadata.scope,
                ttl: metadata.ttl,
                authorityMode: "preset",
              }),
            });
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            return {
              ok: false,
              state: metadata.state,
              code: "SIDECAR_UNAVAILABLE",
              message: `Could not mint workspace-bound MCP key: ${detail}`,
            };
          }
          const created = (createRes.body || {}) as {
            token?: unknown;
            error?: unknown;
            record?: CreatedAgentKeyRecordShape & {
              id?: unknown;
              scope?: unknown;
              workspaceId?: unknown;
              hashPrefix?: unknown;
            };
          };
          const mintedToken = typeof created.token === "string" ? created.token.trim() : "";
          const mintedId = typeof created.record?.id === "string" ? created.record.id : "";
          const computedPrefix = AGENT_TOKEN_EXACT_RE.test(mintedToken) ? hashAgentTokenPrefix(mintedToken) : "";
          const reportedPrefix = typeof created.record?.hashPrefix === "string" ? created.record.hashPrefix.toLowerCase() : computedPrefix;
          const validMint = createRes.ok
            && AGENT_TOKEN_EXACT_RE.test(mintedToken)
            && KEY_ID_RE.test(mintedId)
            && createdAgentKeyMatchesRequestedAuthority({ authorityMode: "preset" }, created.record)
            && created.record?.scope === metadata.scope
            && created.record?.workspaceId === liveWorkspaceId
            && computedPrefix === reportedPrefix;

          if (!validMint) {
            if (KEY_ID_RE.test(mintedId)) {
              const revoked = await revokeExactKeyOnServer(mintedId, false);
              if (!revoked.confirmedInactive) {
                await persistMetadata({
                  ...metadata,
                  state: "revocation-pending",
                  boundWorkspaceId: liveWorkspaceId,
                  keyId: mintedId,
                  hashPrefix: HASH_PREFIX_RE.test(reportedPrefix) ? reportedPrefix : null,
                  lastErrorCode: "REVOKE_FAILED",
                  updatedAt: clock(),
                });
                notifyChanged();
              }
            }
            return {
              ok: false,
              state: metadata.state,
              code: "KEY_INVALID_OR_REVOKED",
              message: "Forge sidecar did not confirm an exact workspace-bound preset MCP key; refusing MCP launch.",
            };
          }

          try {
            await options.secretVault.saveSecret(mintedToken);
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            const revoked = await revokeExactKeyOnServer(mintedId, false);
            if (!revoked.confirmedInactive) {
              await persistMetadata({
                ...metadata,
                state: "revocation-pending",
                boundWorkspaceId: liveWorkspaceId,
                keyId: mintedId,
                hashPrefix: computedPrefix,
                lastErrorCode: "SECRET_STORE_FAILURE",
                updatedAt: clock(),
              });
              notifyChanged();
            } else {
              await persistMetadata({
                ...metadata,
                lastErrorCode: "SECRET_STORE_FAILURE",
                updatedAt: clock(),
              });
            }
            return {
              ok: false,
              state: metadata.state,
              code: "SECRET_STORE_FAILURE",
              message: `Could not store MCP key in IDE secret storage (${detail}); minted key was ${revoked.confirmedInactive ? "revoked immediately" : "marked revocation-pending"}.`,
            };
          }

          try {
            await persistMetadata({
              ...metadata,
              state: "enabled",
              boundWorkspaceId: liveWorkspaceId,
              ideWorkspaceSignature: currentSig,
              keyId: mintedId,
              hashPrefix: computedPrefix,
              lastErrorCode: null,
              updatedAt: clock(),
            });
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            try { await options.secretVault.removeSecret(); } catch { /* best-effort rollback */ }
            await revokeExactKeyOnServer(mintedId, false);
            return {
              ok: false,
              state: metadata.state,
              code: "SECRET_STORE_FAILURE",
              message: `Could not persist non-secret MCP metadata (${detail}); minted key was rolled back.`,
            };
          }
          safeLog(`MCP workspace-bound key minted lazily: id=${mintedId} scope=${metadata.scope} ttl=${metadata.ttl} workspace=${liveWorkspaceId}`);
          resolvedToken = mintedToken;
        }

        // Verify effective capability discovery with the resolved agent key before handing the server to the IDE host.
        let effectiveRes: { ok: boolean; status: number; body: unknown };
        try {
          effectiveRes = await options.sidecar.fetchJson(`${sidecar.baseUrl}/api/agent/capabilities/effective`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${resolvedToken}`,
              "x-workspace-id": liveWorkspaceId,
            },
          });
        } catch (error) {
          const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
          return {
            ok: false,
            state: metadata.state,
            code: "SIDECAR_UNAVAILABLE",
            message: `Could not verify effective MCP capabilities: ${detail}`,
          };
        }
        if (effectiveRes.status === 401 || effectiveRes.status === 403) {
          await retireOwnedAuthorityInternal("KEY_INVALID_OR_REVOKED", false, currentSig);
          return {
            ok: false,
            state: metadata.state,
            code: "KEY_INVALID_OR_REVOKED",
            message: "Sidecar rejected the MCP agent key during effective capability verification; authority was invalidated.",
          };
        }
        if (!effectiveRes.ok || !isValidEffectiveAuthorityPayload(effectiveRes.body, liveWorkspaceId)) {
          await persistMetadata({ ...metadata, lastErrorCode: "MALFORMED_CAPABILITY_CONTRACT", updatedAt: clock() });
          return {
            ok: false,
            state: metadata.state,
            code: "MALFORMED_CAPABILITY_CONTRACT",
            message: "Forge sidecar returned a malformed /api/agent/capabilities/effective contract; refusing MCP launch.",
          };
        }

        if (metadata.boundWorkspaceId !== liveWorkspaceId || metadata.lastErrorCode !== null) {
          await persistMetadata({
            ...metadata,
            boundWorkspaceId: liveWorkspaceId,
            lastErrorCode: null,
            updatedAt: clock(),
          });
        }

        return {
          ok: true,
          state: "enabled",
          message: `Resolved native MCP server for workspace ${liveWorkspaceId} (${metadata.scope}).`,
          definition: {
            label: MCP_SERVER_LABEL,
            command: options.getNodeCommand(),
            args: [options.shimPath],
            env: {
              X4FORGE_URL: sidecar.baseUrl.replace(/\/+$/, ""),
              X4FORGE_KEY: resolvedToken,
              X4FORGE_WORKSPACE_ID: liveWorkspaceId,
            },
            version: `${options.extensionVersion}:${metadata.scope}:${liveWorkspaceId}:${metadata.keyId || "resolved"}`,
          },
        };
      });
    },

    enable(request?: { scope?: McpAllowedScope; ttl?: McpAllowedTtl }): Promise<McpLifecycleResult> {
      return runExclusive(async () => {
        const scope: McpAllowedScope = request?.scope ?? metadata.scope ?? "write";
        const ttl: McpAllowedTtl = request?.ttl ?? metadata.ttl ?? "7d";
        if (!VALID_SCOPES.has(scope)) {
          throw new Error("Native MCP registration only supports 'read' or 'write' preset scopes.");
        }
        if (!VALID_TTLS.has(ttl)) {
          throw new Error("Invalid native MCP TTL.");
        }

        if (!options.hostSupported) {
          const fallback = this.buildManualFallback();
          return {
            ok: false,
            state: metadata.state,
            code: "UNSUPPORTED_HOST_API",
            message: "This IDE host does not support native MCP provider registration. Use the manual MCP config fallback instead.",
            manualFallbackJson: fallback,
          };
        }

        const currentSig = options.getIdeWorkspaceSignature();
        if (metadata.state === "revocation-pending" && metadata.keyId) {
          const retry = await retireOwnedAuthorityInternal("REVOKE_FAILED", false, currentSig);
          if (!retry.fullyRetired) {
            return {
              ok: false,
              state: "revocation-pending",
              code: "REVOKE_FAILED",
              message: `Cannot enable a new MCP key while previous key ${metadata.keyId} is still revocation-pending${retry.reason ? ` (${retry.reason})` : ""}.`,
            };
          }
        }

        if (metadata.state === "enabled" && metadata.keyId) {
          const retiredPrior = await retireOwnedAuthorityInternal("REGISTRATION_DISABLED", false, currentSig);
          if (!retiredPrior.fullyRetired) {
            return {
              ok: false,
              state: "revocation-pending",
              code: "REVOKE_FAILED",
              message: `Could not revoke prior MCP key ${metadata.keyId} before re-enabling${retiredPrior.reason ? ` (${retiredPrior.reason})` : ""}.`,
            };
          }
        } else {
          try {
            await options.secretVault.removeSecret();
          } catch (error) {
            const detail = redactMcpSecrets(error instanceof Error ? error.message : String(error));
            return {
              ok: false,
              state: metadata.state,
              code: "SECRET_STORE_FAILURE",
              message: `Could not prepare IDE secret storage before enabling Native MCP: ${detail}`,
            };
          }
        }

        const peek = options.sidecar.peekSidecar();
        const peekWorkspaceId = peek?.owned && peek.workspaceId && WORKSPACE_ID_RE.test(peek.workspaceId)
          ? peek.workspaceId
          : null;

        await persistMetadata({
          schemaVersion: 1,
          state: "enabled",
          scope,
          ttl,
          boundWorkspaceId: peekWorkspaceId,
          ideWorkspaceSignature: currentSig,
          keyId: null,
          hashPrefix: null,
          lastErrorCode: null,
          updatedAt: clock(),
        });
        safeLog(`Native MCP registration opted in (scope=${scope}, ttl=${ttl}, lazy key/sidecar resolution).`);
        notifyChanged();
        return {
          ok: true,
          state: "enabled",
          message: `Native MCP enabled (${scope} scope, ${ttl} TTL). The sidecar and workspace-bound key will resolve lazily on agent connection.`,
        };
      });
    },

    disable(): Promise<McpLifecycleResult> {
      return runExclusive(async () => {
        const currentSig = options.getIdeWorkspaceSignature();
        if (metadata.state === "disabled" && metadata.keyId === null) {
          try { await options.secretVault.removeSecret(); } catch { /* ignore when already disabled */ }
          return {
            ok: true,
            state: "disabled",
            message: "Native MCP registration is already disabled.",
          };
        }
        const priorKeyId = metadata.keyId;
        const retired = await retireOwnedAuthorityInternal("REGISTRATION_DISABLED", false, currentSig);
        if (!retired.fullyRetired) {
          return {
            ok: false,
            state: "revocation-pending",
            code: retired.secretCleared ? "REVOKE_FAILED" : "SECRET_STORE_FAILURE",
            message: `Native MCP advertisement stopped, but key ${priorKeyId || "(unknown)"} could not be confirmed revoked${retired.reason ? ` (${retired.reason})` : ""}; state is revocation-pending.`,
          };
        }
        await persistMetadata({
          ...metadata,
          state: "disabled",
          lastErrorCode: null,
          updatedAt: clock(),
        });
        return {
          ok: true,
          state: "disabled",
          message: priorKeyId
            ? `Native MCP disabled and owned key ${priorKeyId} revoked.`
            : "Native MCP disabled.",
        };
      });
    },

    retryPendingRevocation(): Promise<McpLifecycleResult> {
      return runExclusive(async () => {
        const currentSig = options.getIdeWorkspaceSignature();
        if (metadata.state !== "revocation-pending" || !metadata.keyId) {
          return {
            ok: true,
            state: metadata.state,
            message: `No pending MCP key revocation (current state: ${metadata.state}).`,
          };
        }
        const pendingKeyId = metadata.keyId;
        const retired = await retireOwnedAuthorityInternal("REVOKE_FAILED", false, currentSig);
        if (!retired.fullyRetired) {
          return {
            ok: false,
            state: "revocation-pending",
            code: retired.secretCleared ? "REVOKE_FAILED" : "SECRET_STORE_FAILURE",
            message: `Key ${pendingKeyId} is still revocation-pending${retired.reason ? ` (${retired.reason})` : ""}.`,
          };
        }
        await persistMetadata({
          ...metadata,
          state: "disabled",
          lastErrorCode: null,
          updatedAt: clock(),
        });
        return {
          ok: true,
          state: "disabled",
          message: `Pending MCP key ${pendingKeyId} was confirmed revoked; state is now disabled.`,
        };
      });
    },

    handleWorkspaceAuthorityChange(nextBoundWorkspaceId?: string | null): Promise<McpLifecycleResult | null> {
      return runExclusive(async () => {
        if (metadata.state !== "enabled") return null;
        const currentSig = options.getIdeWorkspaceSignature();
        const ideChanged = metadata.ideWorkspaceSignature !== currentSig;
        const studioChanged = typeof nextBoundWorkspaceId === "string"
          && nextBoundWorkspaceId.length > 0
          && metadata.boundWorkspaceId !== null
          && metadata.boundWorkspaceId !== nextBoundWorkspaceId;
        if (!ideChanged && !studioChanged) {
          if (
            metadata.boundWorkspaceId === null
            && typeof nextBoundWorkspaceId === "string"
            && WORKSPACE_ID_RE.test(nextBoundWorkspaceId)
          ) {
            await persistMetadata({
              ...metadata,
              boundWorkspaceId: nextBoundWorkspaceId,
              updatedAt: clock(),
            });
          }
          return null;
        }
        const retired = await retireOwnedAuthorityInternal("WORKSPACE_AUTHORITY_CHANGED", false, currentSig);
        return {
          ok: retired.fullyRetired,
          state: metadata.state,
          code: "WORKSPACE_AUTHORITY_CHANGED",
          message: retired.fullyRetired
            ? "Workspace authority changed; previous Native MCP registration was disabled and its key revoked."
            : `Workspace authority changed; Native MCP stopped advertising and key ${metadata.keyId} is revocation-pending.`,
        };
      });
    },
  };
}
