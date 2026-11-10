# Agent control of Forge settings and complete UI/API/MCP parity

**Status: SPECIFIED — future work; no runtime implementation authorized by this specification task.**
**Lane:** FULL specification. **Owner:** existing capability-convergence #19 under #9; directory/default-format control is its independently executable first child [#96](https://github.com/KennyG1990/X4_Forge/issues/96).

**Goal:** An authorized agent can perform every intentional Forge product action through a documented API and discoverable MCP projection, including changing directories and deployment format, without computer use or a Studio token.

**Architecture:** Extend the existing Forge capability contract, authority registry, configuration service and native deploy owners. UI, API and MCP consume the same business operations, validators, approvals, results and receipts. The installed IDE extension remains the product; this does not create a standalone CLI or another settings/deployment engine.

## Request, baseline and reconciliation

Ken requested this on 2026-11-10 for later work. This updates the intended product policy: historical omission of MCP deployment and the current Studio-only standing-configuration boundary are future gaps to resolve with explicit scoped authority. They remain enforced until the later implementation and its negative gates pass. Existing historical ADRs must not be silently rewritten; record the prospective policy delta beside their implementation.

Baseline is isolated Dev a53f418, with ongoing uncommitted #95 compiler/doctor/native changes and Dev recovery notes. Those changes are separate work and must not be staged or claimed as this feature. Live Forge, Antigravity, X4, AiLive, game directories and saves are outside this specification task. No runtime setting or credential changes are needed to write it.

Observed existing behavior:

| User action | Existing owner | Remaining agent gap |
| --- | --- | --- |
| Read/save Directory Settings | GET/POST `/api/schema/config`, `DirectorySettingsModal.tsx`, `xsdParser.ts` | Both routes require `requireStudioActor`; a route existing does not make it usable by an agent key. No MCP settings tool. |
| Save default deploy format | Same config POST; `CompileConfirmationModal.tsx` | Studio toggle writes `deployFormat`; agents cannot persist that preference through their ordinary key. |
| Choose format for one deploy | `/api/agent/deploy` and `/api/agent/deploy-verify`, `resolveDeployFormat` | API already supports `deployFormat: loose | catalog`. MCP has no native deployment tool. |
| Inspect effective paths/format | `/api/agent/status` | Reuse its process scope, resolved roots and format provenance; add the complete authorized settings/lock view. |
| Discover authorized operations | `forgeCapabilities.ts`, `/api/agent/capabilities/effective` | Existing catalog needs complete UI-action coverage and missing agent projections. |

Exact current directory POST keys are `schemaDir`, `x4ReferenceRoot`, `x4GamePath`, `modWorkspacePath`, `filesystemPath`. `schemaDir` is stored as `xsdSchemaPath`. Omission preserves a field; explicit empty string clears it subject to validation. General `x4LogPath` editing is not implemented by this POST and must be inventoried under its actual owner, not advertised as supported.

References: `src/lib/forgeCapabilities.ts`, `agentAuthority.ts`, `agentCapabilityAuthority.ts`, `agentKeys.ts`, `xsdParser.ts`, `pathRoles.ts`; `config/forge-route-dispositions.json`; `config/action-receipt-coverage.json` and the existing action-receipt policy/transaction/store modules; `vscode-extension/mcp/x4forge-mcp.cjs`; `docs/plans/2026-07-31-capability-convergence.md`; ADR-F4 artifact ownership and ADR-F5 workspace authority. Config is instance/profile-global under ADR-F5, so a workspace-bound key alone must not retarget every workspace.

## Selected design

A generic arbitrary HTTP/shell tunnel would not establish audited product parity and could bypass the exact authority model. Separate MCP implementations of UI behavior would drift. Extend the current typed capability catalog and shared owners: one operation, multiple authorized transports, one deterministic result.

Each intentional UI action gets a stable operation identity/version, input/output schema, owning service, instance/workspace scope, effects, required capability, confirmation policy, API mapping, MCP mapping, and applicable proof. The existing catalog/audits own this record. Count semantic outcomes, not pixel clicks: selecting a target, editing a node, saving a file, starting a backend or preparing a release must be expressible as operations. Presentation state that has a meaningful Forge outcome (open/select an editor, choose workspace, show diagnostics) uses extension-native commands where appropriate. Do not build mouse-coordinate automation.

Every unmapped action remains an explicit open gap. `available`, `partial`, `missing`, and `approval-required` must reflect actual supported workflows. Approval-required is not a blanket exemption: the agent must be able to prepare/request, inspect status, continue when approved, and retrieve the resulting receipt through machine interfaces. Existing credentials/owner approval cannot be impersonated. No feature closes solely because a backend route exists or an internal harness can access it.

## First slice: directory and saved-format control

Proposed MCP operations: `get_configuration`, `preview_configuration_change`, `apply_configuration_change`. Register exact final identities/names in the existing capability catalog before implementation. API read/apply reuse `/api/schema/config` and its current configuration writer; a proposed sibling `/api/schema/config/preview` shares the same planning/validation service. No independent settings file or direct arbitrary filesystem-write tool.

Read returns an allowlisted saved-values view, effective resolved values, provenance (saved/default/environment/launcher), current revision, exact instance/profile identity, per-field mutability and lock reason, and deployment-format options/default/source. Do not return provider secrets or the Studio session token. Invalid/unavailable paths and incomplete schemas remain explicit.

Preview accepts only `schemaDir`, `x4ReferenceRoot`, `x4GamePath`, `modWorkspacePath`, `filesystemPath`, and `deployFormat`, plus addressed instance, expected configuration revision and a caller operation ID. It returns normalized requested/effective changes, impact on validation/caches/deploy destination, rejected fields, schema availability, any restart requirement, and a bound proposal identity/hash. It does not save paths, move/copy/delete a mod, launch the game, install extensions or deploy anything.

Apply requires the same authorized instance, bound current proposal/revision and caller operation ID. Refactor/reuse the existing writer and receipt infrastructure; current config POST directly saves then reloads, and does not already provide this proposed CAS/proposal/transaction behavior. Preserve existing Studio callers through a reviewed compatibility adapter or migrate UI/first-run/toggle callers in the same unit; they currently send no revision/proposal. Agent calls must always use the bound contract, without a legacy fallback. A stale config, changed instance, changed proposal, revoked grant, invalid role/path, owner seal or launcher pin refuses before writes with a stable code and actionable result. A successful result returns persisted/effective values, new revision and verifiable receipt; the agent reads back through the same API/MCP. Unchanged replay is idempotent; a conflicting replay refuses. Restore uses the same authorization/CAS validation, with bounded existing receipt/history retention rather than unbounded backup copies.

Authorization must explicitly grant instance-level configuration effects, allowed fields/roots and a duration. Current immutable key constraints support capability identities and allowed effects only. Instance/field/root/duration restrictions therefore require a reviewed additive server-enforced grant contract, coupled to that existing narrowing and revocation/expiry; do not pretend these dimensions already exist. Do not automatically widen legacy read/write/deploy keys and do not give MCP a Studio token. Owner authorization may cover a bounded work session so the agent does not need a new human click for each already-authorized edit. Out-of-grant changes return the precise missing authority/request path. Grant/credential administration remains an explicit owner-authorized workflow.

Preserve `PROJECT_CHECK_OWNER_ROOTS_LOCKED` and `DEV_SCRATCH_PATH_LOCKED`. This feature cannot unseal a running approved-check environment or redirect this agent's pinned Dev instance to live paths. Prove editable directory behavior in an ordinary unlocked synthetic profile, and prove pinned/owner profiles refuse. Preserve read-only corpus/game boundaries and all role/physical-path/reparse protections. Directory changes do not implicitly migrate projects, invalidate unrelated user data, or authorize deployment.

## Deployment format and native deploy through MCP

Supported format values remain `loose` and `catalog` (CAT/DAT). Request override > saved preference > loose default remains authoritative. Setting a per-deployment override must not persist the default; changing the default must not rewrite an existing artifact or silently change a reviewed preview.

Expose native preview, bound apply, operation status, receipt/recovery and undo through curated MCP operations over existing API owners and their exact capability/effect declarations. `compile_workspace` is packaging, not a substitute for deploy. A deploy-capable actor uses a current preview bound to instance/workspace/source/artifact/target/format/approvals; stale mismatches refuse before managed writes. Read or package-only actors cannot deploy. Status distinguishes queued/running/committed/verified/failed/unknown; transport success does not invent deploy or game success.

## Full parity census and later slices

Audit intentional actions across Directory Settings/first-run setup, workspace/project selection, import/file/source editing and undo, canvas/domain editors, reference/search/completion, validation/diagnostics/explanations/fixes, compile/package/export, native deploy/verify/recovery, runtime/debug evidence, approved project checks, Release Center, extension/backend lifecycle, supported preferences, credentials/consent and help/navigation. This is a scope checklist for the census, not a claim those actions are all missing or already enumerated.

Map existing operations first. Reuse current issue owners for known gaps (#31 registration, #79 expression MCP, #20 deploy safety, #75 scratch settings, #19 convergence); create child issues only for independently executable new gaps. Keep one authoritative catalog, not a parallel parity database. New product actions must declare a machine projection in the same change; an audit fails on unclassified UI actions or falsely advertised/unauthorized tools. No generic dynamic-route discovery may silently broaden a key.

## Acceptance and validation contract for later implementation

1. One agent session changes each permitted directory through API and MCP, reads the actual effective path, restarts the isolated backend and proves persistence. Omitted fields preserve values; explicit clears follow the current validator. Schema incompleteness is reported without masquerading as save failure when current policy permits saving paths.
2. Saved format changes via API/MCP survive restart. Paired one-shot overrides exercise both formats without changing the saved preference; invalid values refuse before staging. Both transports produce equal effects, diagnostics and receipts.
3. Permission negatives cover old/read/workspace-only keys, wrong instance/profile, ungranted fields/roots, stale revision/proposal, conflicting replay, revocation, launcher pins, A15 seals, role overlap and reparse targets. Refusal leaves config, live state and target files unchanged.
4. Concurrent config changes cannot retarget an already reviewed/in-flight deploy or project-check approval. Invalidate/rebind affected previews using existing identity/coordination owners. No operation executes against whichever workspace happened to be active.
5. Each census row has an independently verified API/MCP operation or an open owner and exact missing behavior. Full-program acceptance requires every required row, including approval workflows; percentages of mapped routes are not outcome proof.
6. Use focused config/deploy/capability/MCP/receipt/rollback tests; full type/lint, route/capability/writer/receipt audits, required precommit, serial isolated E2E, exact package/installed-host qualification and applicable rendered UI evidence. No CUA is required for normal agent operation; permitted UI validation remains a separate proof layer. In-game proof stays with Claude, not an agent-driven game.
7. Fault-inject configuration writer failure, post-save schema/cache reload failure and receipt-finalization failure. API/MCP must distinguish not-written from persisted-but-follow-up-failed, expose operation status and authoritative readback, avoid blind retries/false success, and preserve bounded recovery. Config currently saves before schema/manifest follow-up, so a transport failure alone is not evidence of rollback.
8. Enumerate the changed permission/configuration/network/delete surfaces before shipping. Reuse existing bounded effects/receipts, limits and fail-closed behavior. No new AI spend, raw shell capability, secret export or unlimited backup/retention path is implied.

## Planned implementation order

- **P1 / scoped child:** scoped configuration read/preview/apply and directory/default-format MCP projection; exact ownership and negative matrix first.
- **P2 / #19:** project-wide UI operation census and gap list in the existing capability catalog.
- **P3 / existing owners:** curated native deploy/operation/receipt/recovery MCP projection; reuse already-supported API format override.
- **P4 / #19 children:** close remaining census gaps in coherent tested units; make parity audit a regression gate for future features.

Each implementation unit needs its own baseline, exact acceptance/evidence and required release gates. Future changes to current standing-configuration or MCP exclusion policy must update code, capability/route authority, receipt policy, docs and negative tests together. No runtime policy is relaxed by this document.

## Specification close and AAR

**SPECIFIED; implementation NOT STARTED for this feature.** Validation for this task is source/issue reconciliation, exact current field/permission/format checks, owner deduplication, specification review and whitespace/link checks. Runtime, MCP, persistence, package, rendered and game acceptance above are future requirements, not results. No capability-map delta: this is an open plan, not a new working capability. Rollback removes only this specification and its targeted backlog/owner projection, preserving unrelated #95/recovery edits.

AAR: non-clean. Independent review corrected an ambiguous format allowlist, distinguished existing key constraints from proposed grant dimensions, and added Studio compatibility plus persistence/follow-up failure tests. Reconciliation corrected the premise that these settings lack an API: an existing Studio-only API and per-deploy format override already work by contract, while agent authorization/MCP coverage is missing. Sustain resource/actor-based reconciliation and the existing #19 owner. Improve the product's discoverability of why an action is unavailable; return effective permissions/locks with the next authorized machine step. Highest evidenced weakness is the mismatch between UI reachability and curated agent authority; the bounded future first slice and exhaustive census address it without silently broadening old keys. No runtime test or completed capability is claimed.
