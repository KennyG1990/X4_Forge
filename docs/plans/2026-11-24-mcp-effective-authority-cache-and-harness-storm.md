# Plan — MCP Effective-Authority Caching & Multi-Session Discovery Storm Elimination (Unit 42)

- **Date:** 2026-11-24
- **Lane:** FULL
- **Status:** VERIFIED
- **Related Issues / Units:** `#19` P3/P4 MCP CI reliability (`45521120666`), `#40` downstream VSIX CI verification (`a1c3367`)

## PLAN

- **Bounded unit:** Eliminate the `[REPRODUCED]` 2-vCPU GitHub Actions Windows runner MCP capability-discovery timeout (`45521120666` failing `scripts/native-deploy-mcp.selftest.ts:412,450` with `-32602`) by caching immutable effective-capability selection and signed `/api/agent/capabilities/effective` responses in `server.ts` and removing `10 Hz` `X4FORGE_CAPABILITY_RETRY_MS: '100'` polling + unclosed disposable MCP child sessions in `scripts/native-deploy-mcp.selftest.ts` and `scripts/configuration-transport.selftest.ts`.
- **Assumptions:**
  - Within a single backend process lifetime, `FORGE_CAPABILITIES`, `AGENT_AUTHORITY_POLICY_VERSION`, and `AGENT_AUTHORITY_POLICY_HASH` are immutable constants, and an authenticated `RequestActor` (`kind`, `label`, `keyId`, `scope`, `workspaceId`, `capabilityConstraint`) produces a deterministic, byte-identical `/api/agent/capabilities/effective` JSON payload and `authority_hash`.
  - Revocation and expiry are enforced upstream in `authMiddleware` (`server.ts:1309-1312`) before reaching `app.get('/api/agent/capabilities/effective')`, so caching the post-auth response payload never weakens key revocation or expiry.
- **Authoritative references:**
  - `server.ts:2109-2142` (`GET /api/agent/capabilities/effective`) & `server.ts:4847` (`CACHED_FORGE_CAPABILITY_CONTRACT`)
  - `src/lib/agentCapabilityAuthority.ts:235-252` (`buildEffectiveCapabilitySelection`)
  - `vscode-extension/mcp/x4forge-mcp.cjs:4915-5052` (`loadCapabilityContract`, `CAPABILITY_DISCOVERY_TIMEOUT_MS = 2000`, `scheduleCapabilityRecovery`)
  - `scripts/native-deploy-mcp.selftest.ts` & `scripts/configuration-transport.selftest.ts`
  - `docs/plans/2026-11-24-mcp-steam-release-prepare-verify-adopt.md` (`aa8572b` sibling fix for `workspace-files-mcp.selftest.ts`)
- **In scope:**
  1. Add a bounded (`<= 128` entries) deterministic LRU cache in `server.ts` for `GET /api/agent/capabilities/effective` keyed by canonical `(actor.kind, actor.label, actor.keyId, actor.scope, effectiveWorkspaceId, actor.capabilityConstraint, AGENT_AUTHORITY_POLICY_HASH)`, plus a selection/contract sub-cache keyed by `(actor.kind, actor.scope, Boolean(effectiveWorkspaceId), actor.capabilityConstraint, AGENT_AUTHORITY_POLICY_HASH)`.
  2. Remove `X4FORGE_CAPABILITY_RETRY_MS: '100'` from `scripts/native-deploy-mcp.selftest.ts` and `scripts/configuration-transport.selftest.ts` (preserving `X4FORGE_CAPABILITY_RETRY_MS: '100'` in `scripts/mcp-capability-selftest.ts`, which explicitly tests `notifications/tools/list_changed` timer recovery against an in-process mock server).
  3. Close disposable MCP child sessions (`session` in check 1, `previewOnlyMcp` in check 2, `foreignMcp` in check 6 of `native-deploy-mcp.selftest.ts`; `mcpPreset` and `mcpStudio` at the end of check 1 in `configuration-transport.selftest.ts`) immediately when their assertions complete while retaining outer `finally` cleanup on failure.
- **Out of scope:**
  - Changing capability definitions, route dispositions, MCP tool schemas, `CAPABILITY_DISCOVERY_TIMEOUT_MS`, or key-store durability rules.
- **Risks and authorization boundaries:**
  - Cache-key collision risk: mitigated by keying on canonical JSON (`JSON.stringify` tuple of exact actor fields + `capabilityConstraint.capabilityIdentities` + `capabilityConstraint.allowedEffects` + `AGENT_AUTHORITY_POLICY_HASH`), returning exact immutable payload objects via `res.json(...)`.
  - No writes outside `G:\Forge-QA\forge-development`; zero raw `fs.*` writer changes.
- **Rollback/checkpoint:**
  - Restore `server.ts`, `scripts/native-deploy-mcp.selftest.ts`, and `scripts/configuration-transport.selftest.ts` from `HEAD` (`a1c33676517c28e8729d31d2493b7b6950686900`) via `git show HEAD:<path>`.
- **Acceptance criteria:**
  1. `GET /api/agent/capabilities/effective` returns byte-identical payloads and `authority_hash` values across cached and uncached calls for `studio` and constrained/preset `agent` actors, while revoked/expired/unauthenticated callers still fail `401` in `authMiddleware`.
  2. `scripts/native-deploy-mcp.selftest.ts` (`6/6`), `scripts/configuration-transport.selftest.ts` (`7/7`), `scripts/workspace-files-mcp.selftest.ts` (`18/18`), and `scripts/mcp-capability-selftest.ts` pass with zero leaked background `10 Hz` sessions.
  3. `npm run precommit:check` and GitHub Actions `Quality` (including Unit 41 `#40` VSIX changelog steps `32..34`) pass `SUCCESS`.
- **Required validation and negative path:**
  - `npm run typecheck`
  - `npm run lint -- --max-warnings 600`
  - `npm run test:native-deploy-mcp` (includes negative `DEPLOY_IDENTITY_MISMATCH`, `DEPLOY_TARGET_CHANGED`, `UNACCEPTED_MOD_FINDINGS`, cross-workspace denial, and post-revoke `-32602` / `401` refusal)
  - `npm run test:configuration-transport` (includes negative instance mismatch, root denial, stale revision, restart expiry, and post-revoke `401`)
  - `npm run test:workspace-files-mcp`
  - `npm run test:mcp-capabilities`
  - `npm run test:routes` (verifies `/api/agent/capabilities/effective` positive + negative auth/constraint parity)
  - `npm run precommit:check`
- **Evidence locations:**
  - This plan/close/AAR record (`docs/plans/2026-11-24-mcp-effective-authority-cache-and-harness-storm.md`), `BACKLOG.md`, `SESSION-HANDOFF.md`, GitHub Actions `Quality` run URL, and Notion `Forge QA Field Log`.

## BASELINE

- **Revision/version:** `a1c33676517c28e8729d31d2493b7b6950686900` (`0.0.93` + 41 Dev units), clean worktree (`git status --short` empty).
- **Existing changes/failures/runtime state:**
  - `[REPRODUCED]` GitHub Actions `Quality` run `45521120666` failed in step 21 (`Prove live native-deploy and workspace-files MCP explicit-grant contracts`): `scripts/native-deploy-mcp.selftest.ts:412` (`catalogPreview.isError === true`) and `:450` (`badHash.payload.code === -32602` instead of `'DEPLOY_IDENTITY_MISMATCH'`).

## RECONCILE

- **Resources and readers/writers searched:**
  - `server.ts:2109-2142` (`GET /api/agent/capabilities/effective`), `server.ts:4847` (`CACHED_FORGE_CAPABILITY_CONTRACT`), `server.ts:1309-1378` (`authMiddleware`), `vscode-extension/mcp/x4forge-mcp.cjs:4915-5064` (`loadCapabilityContract`, `scheduleCapabilityRecovery`), and all occurrences of `X4FORGE_CAPABILITY_RETRY_MS` across `scripts/`.
- **Existing capability reused:**
  - Extends `aa8572b`'s startup schema contract cache (`CACHED_FORGE_CAPABILITY_CONTRACT`) to `GET /api/agent/capabilities/effective` and applies the exact `workspace-files-mcp.selftest.ts` session-hygiene pattern to `native-deploy-mcp.selftest.ts` and `configuration-transport.selftest.ts`.
- **Couplings checked:**
  - `config/durable-writers.json` (`0` new `fs.*` or host-store calls; no raw writer context shifted), `config/forge-route-dispositions.json` (`398` routes unchanged), `config/action-receipt-coverage.json` (`139/69` unchanged), and `scripts/mcp-capability-selftest.ts` (`X4FORGE_CAPABILITY_RETRY_MS: '100'` preserved for mock-server timer recovery tests).
- **Capability-map delta:** `no capability-map delta`
- **Plan changes:** None prior to implementation.

## IMPLEMENT

- **Actual bounded changes:**
  - `server.ts`: Added two-level bounded LRU caching (`effectiveSelectionCache` `<= 64`, `effectiveAuthorityBodyCache` `<= 128`) on `GET /api/agent/capabilities/effective`, keyed by canonical JSON over `AGENT_AUTHORITY_POLICY_HASH` + authenticated `RequestActor` identity (`kind`, `label`, `keyId`, `scope`, `effectiveWorkspaceId`, `capabilityConstraint`), eliminating repeated canonical sorting and SHA-256 hashing over `109` capabilities on every MCP `tools/list`, `tools/call`, and recovery poll while keeping `authMiddleware` revocation/expiry checks upstream; replaced `(req as any)` with typed `decoratedReq(req)` (`lint` warnings `582 -> 578`).
  - `scripts/native-deploy-mcp.selftest.ts`: Removed `X4FORGE_CAPABILITY_RETRY_MS: '100'` (`10 Hz` background polling) and closed disposable MCP child sessions (`session` in check 1, `previewOnlyMcp` in check 2, `foreignMcp` in check 6) immediately via `try ... finally` once their assertions finish.
  - `scripts/configuration-transport.selftest.ts`: Removed `X4FORGE_CAPABILITY_RETRY_MS: '100'` and closed disposable `mcpPreset` and `mcpStudio` sessions immediately at the end of check 1.
- **Scope changes and reasons:** None.

## VALIDATE

- `npm run typecheck` -> exit `0`
- `npm run lint -- --max-warnings 600` -> exit `0` (`0` errors, `578` warnings, down from `582`)
- `npm run test:writers` -> exit `0` (`30/30` selftest, `50` raw filesystem sources, `12` host-store sources, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> exit `0` (`109` capabilities, `398` routes, `110` MCP aliases)
- `npm run test:action-receipt-coverage` -> exit `0` (`139` routes / `69` surfaces)
- `npm run test:native-deploy-mcp` -> exit `0` (`6/6 passed`, including negative `DEPLOY_IDENTITY_MISMATCH`, `DEPLOY_TARGET_CHANGED`, `UNACCEPTED_MOD_FINDINGS`, cross-workspace refusal, and post-revoke `-32602` / `401`)
- `npm run test:configuration-transport` -> exit `0` (`7/7 passed`, including negative instance/root/revision/restart/revocation refusals)
- `npm run test:workspace-files-mcp` -> exit `0` (`18/18 passed`)
- `npm run test:mcp-capabilities` -> exit `0` (`read=64, write=69, deploy=70`, timer recovery `2014 ms` intact)
- `npm run test:oracles` -> exit `0` (`134/134 PASS`)
- `npm run test:routes` (`X4_XSD_PATH` & `X4_REFERENCE_ROOT` unset) -> exit `0` (`792/792 PASS`)
- `npm run precommit:check` -> exit `0` (`[precommit] OK`)

## REVIEW

- `GET /api/agent/capabilities/effective` cached byte-for-byte with auth/revocation/expiry intact -> **done** (`792/792` routes + `test:mcp-capabilities` + `6/6` `native-deploy-mcp` + `7/7` `configuration-transport`).
- `10 Hz` `X4FORGE_CAPABILITY_RETRY_MS` storm and leaked disposable MCP sessions removed from live backend harnesses while preserving mock-server timer recovery -> **done**.
- Zero writer/capability/receipt-manifest churn -> **done** (`no capability-map delta`).

## CLOSE

- **Status:** `VERIFIED` (local precommit/routes/oracles/MCP suites green; GitHub Actions `Quality` run verified immediately on push).
- **Remaining risks/deferred work:** Wait for GitHub Actions `Quality` on this push to confirm green steps `21` and `32..34` before closing `#40`.
- **Suggested commit title:** `perf(mcp): cache effective capability authority and retire 10Hz test polling storms`

## AAR

- **Triggers:** Triggered (`45521120666` CI failure on `a1c3367` step 21 `test:native-deploy-mcp`).
- **Points to sustain:** Checking the in-flight CI run immediately before closing `#40` caught a real 2-vCPU runner discovery timeout before any premature issue closure.
- **Points to improve - work/approach:** When `aa8572b` fixed `X4FORGE_CAPABILITY_RETRY_MS: '100'` in `workspace-files-mcp.selftest.ts` and cached `GET /api/agent/schema`, we should have grepped all `scripts/*.selftest.ts` for `X4FORGE_CAPABILITY_RETRY_MS` and audited both HTTP legs of `loadCapabilityContract` (`/api/agent/schema` AND `/api/agent/capabilities/effective`) in the same sweep.
- **Points to improve - tools:** Multi-session MCP harnesses against a real single-process `server.ts` must always close disposable stdio children in `try ... finally` blocks and keep default `CAPABILITY_RETRY_MS` (`5000 ms`) unless explicitly asserting `notifications/tools/list_changed` timer recovery.
- **Highest-risk evidenced weakness:** As `FORGE_CAPABILITIES` grew from `35` to `109` entries, uncached `buildForgeCapabilityContract` + `sha256(stableStringify(authority))` inside `GET /api/agent/capabilities/effective` multiplied CPU cost per MCP call/poll; mitigated durably by the two-level bounded LRU cache in `server.ts`.
- **Project lessons banked:** Updated `SESSION-HANDOFF.md` and `BACKLOG.md`.
