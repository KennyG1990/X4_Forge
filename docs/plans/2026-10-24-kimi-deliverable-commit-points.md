# Kimi recommendations: deliverable commit points

Status: SPECIFIED / PAUSED BY OWNER — 2026-10-25. Finish Claude's complaints first. M01 received read-only preparation only; no MCP implementation was made. Original planning date: 2026-10-24. Owner program: [GitHub #29](https://github.com/KennyG1990/X4_Forge/issues/29); open native MCP work: [#31](https://github.com/KennyG1990/X4_Forge/issues/31).

## What the records actually say

The original review contains 21 recommendations, not 21 current bugs. The reconciled ledger and live GitHub readback record **19 historically VERIFIED, R18 rejected by the owner, and R21 OPEN**. This planning pass does not certify current executable behavior. Recent private Dev repairs also show why historical proof must be checked against the candidate being integrated.

There are **20 bounded checkpoints below: 14 proof-or-repair checkpoints covering the 19 existing capabilities, and six implementation commits for R21**. These are not 20 promised rewrites. An existing capability that passes its relevant checks needs only an evidence/documentation checkpoint; a reproduced gap gets a narrow repair under that same card. Split any newly discovered larger repair before coding. Do not manufacture code changes merely to make a commit.

## How to execute one point at a time

1. Select one card, capture the candidate revision/file hashes and existing changes, read its original plan and owners, and confirm the current capability before editing.
2. Use the private Dev source and disposable test mod. Define the exact changed-file scope, acceptance, rollback and evidence before implementation. Keep Claude's live Forge, mod and X4 untouched.
3. Prove its positive behavior and refusal case. For a visible change, inspect the real Dev host. API tests alone do not prove a button or screen.
4. Review the diff and save evidence at lab/evidence/kimi-commit-points/CHECKPOINT_ID/ with commands, timestamp, revision/hashes, results, screenshots where applicable, and rollback notes. Update the canonical plan and the existing owner issue.
5. Stop at that checkpoint. Later, in the authorized Git-backed integration checkout, run required precommit checks and commit only that unit with its proof. The current private archive has no .git: these are proposed commit boundaries, not commits already made. Do not push or publish each checkpoint.

**Next unfinished original feature: M01.** Before M03, verify the relevant current A07/A09 contracts and carry forward the recent private client-isolation proof. A01–A14 are an assurance menu for integration/regressions, not a compulsory fourteen-task detour before M01. When a particular behavior fails, select its card next. M06 is followed by a separately authorized public release, not automatic publication.

Each card's title below is a proposed commit title. For a repair replace test(...) with an accurate fix(...) title. A green evidence-only check can use docs(...). No card is marked implemented by this plan.

## Existing capabilities: proof or repair checkpoints

### A01 — Known warnings and mod-declared contracts (R1, R16)

- Suggested commit: `test(validation): preserve reviewed project rules`.
- Deliverable / DONE-WHEN: Exact reviewed warnings can be suppressed; declared chains, wire keys and registrations are checked against evidence. Show raw, suppressed and active totals.
- Must refuse / failure test: Expired, malformed, overbroad rules and absent declared registrations refuse; errors cannot be hidden through warning suppression.
- Existing resources: forge.rules.json shared referee; 2026-07-30-project-rules-schema.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: None; reuse private finding-override proof without conflating acceptance with suppression.
- Required proof: API + fixture; rendered UI if changed.

### A02 — Show what changed since the last clean validation (R2)

- Suggested commit: `test(validation): preserve per-mod warning deltas`.
- Deliverable / DONE-WHEN: A second test-mod run labels warnings new, resolved or unchanged using that mod's last-green baseline.
- Must refuse / failure test: Failed validation, dry-run and another mod cannot advance its baseline.
- Existing resources: 2026-07-30-validation-delta-baselines.md; validation/deploy baseline readers. Historical plan filenames are under source/docs/plans/.
- Dependencies: A01 fixture identities; A07 workspace authority.
- Required proof: API + persisted restart readback; UI if changed.

### A03 — Give agents an honest failure verdict (R3)

- Suggested commit: `test(api): preserve structured failure verdicts`.
- Deliverable / DONE-WHEN: Every tested failure has success:false, a stable code, useful error and failed stages, including legacy HTTP-200 failures.
- Must refuse / failure test: Offline dependency and operational failure cannot look successful; successful array/object response compatibility remains.
- Existing resources: src/lib/apiFailureEnvelope.ts; pre-auth middleware; API schema. Historical plan filenames are under source/docs/plans/.
- Dependencies: None.
- Required proof: Actual HTTP routes and client interpretation.

### A04 — Check Lua registrations and Lua-to-MD messages (R4, R5)

- Suggested commit: `test(validation): preserve AST and wire-contract checks`.
- Deliverable / DONE-WHEN: Parse real registrations/aliases and connect payload writes to MD readers in the scratch mod; report coverage limitations explicitly.
- Must refuse / failure test: Comments are not registrations; missing readers, scope collisions and unsupported dynamic evidence cannot become a false clean result.
- Existing resources: Existing Lua AST and cross-file index; B108 hardening record. Historical plan filenames are under source/docs/plans/.
- Dependencies: None. Large-file/event coverage is a scoped repair only if reproduced.
- Required proof: Actual project validation + AST fixtures; full-file coverage evidence.

### A05 — Explain each finding and its safe exception path (R6)

- Suggested commit: `test(diagnostics): preserve explanations and reviewed exceptions`.
- Deliverable / DONE-WHEN: A finding shows rule, cause, impact and next action; exact warning suppression is reviewable and recorded.
- Must refuse / failure test: Changed source, stale preparation, error suppression and overbroad exceptions refuse without writing.
- Existing resources: DiagnosticsCenter; 2026-07-30-diagnostic-guidance-suppression-ui.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A01, A03. Reuse private accepted-finding backend; native acceptance UI remains a separate gap.
- Required proof: API + real rendered Dev-host interaction.

### A06 — Keep writes atomic and recoverable (R7)

- Suggested commit: `test(storage): preserve atomic write failure contracts`.
- Deliverable / DONE-WHEN: Exercise existing workspace/deploy writers with an injected failure: either old state or complete new state, with honest receipts.
- Must refuse / failure test: Partial tree, receipt-finalization failure and corrupt authority cannot leave a success record or half-written target.
- Existing resources: Existing writer inventory and staging/rollback authorities; 2026-07-30-durable-writer-discipline.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A03; scratch targets only.
- Required proof: Fault injection, byte hashes and restart readback.

### A07 — Keep two agents and mods separate (R8, R17)

- Suggested commit: `test(workspaces): preserve client and deployment isolation`.
- Deliverable / DONE-WHEN: Two clients with two scratch mods retain separate identity, source hashes, edits, histories and deployment receipts.
- Must refuse / failure test: Wrong-mod deploy, stale hash/CAS, same-name workspaces and cross-bound keys refuse before any write.
- Existing resources: Workspace registry and route policy; 2026-07-31-workspace-authority.md; private 2026-10-24-dev-client-isolation.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A03, A06. Reuse recent private HTTP/installed evidence and patch; do not build another registry.
- Required proof: Two-client actual HTTP + installed Dev API; byte/receipt proof.

### A08 — Make stuck operations end predictably (R9)

- Suggested commit: `test(runtime): preserve bounded request and job timeouts`.
- Deliverable / DONE-WHEN: Slow HTTP and internal test jobs end with a truthful timeout and bounded cleanup.
- Must refuse / failure test: A stubborn child cannot survive its owned job timeout; late response cannot overwrite a newer result.
- Existing resources: Fetch chokepoint; job ownership; 2026-07-30-timeout-policy.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A03.
- Required proof: Isolated slow server and owned disposable child process.

### A09 — Stop orphaned extension sidecars (R10)

- Suggested commit: `test(extension): preserve owned sidecar shutdown`.
- Deliverable / DONE-WHEN: A disposable extension-host/supervisor shutdown cleans its owned backend and discovery record.
- Must refuse / failure test: Broken parent pipe reaps the owned tree; an externally attached backend and stable Forge remain untouched.
- Existing resources: vscode-extension/src/sidecarSupervisor.ts, backendLiveness.ts; 2026-07-30-sidecar-parent-liveness.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A08.
- Required proof: Packaged supervisor + disposable process lifecycle; no stable restart.

### A10 — Make conflicts understandable and recovery real (R11, R14)

- Suggested commit: `test(recovery): preserve conflict decisions and bounded undo`.
- Deliverable / DONE-WHEN: A scratch conflict shows both versions, changed files and explicit outcomes; supported overwrite recovery restores exact prior bytes.
- Must refuse / failure test: Cancel writes nothing; stale, expired, corrupt and replayed recovery refuse; unrelated newer edits survive.
- Existing resources: Conflict dialog and recovery authorities; 2026-07-30-conflict-recovery.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: A06, A07.
- Required proof: Actual HTTP/byte restoration + real rendered conflict and Undo.

### A11 — Remove misleading controls (R12)

- Suggested commit: `test(settings): preserve observable setting behavior`.
- Deliverable / DONE-WHEN: Each setting in the current inventory changes an observable behavior; unsupported/inert options are absent.
- Must refuse / failure test: Invalid saved values normalize safely; release presentation settings never bypass safety gates.
- Existing resources: Studio settings consumers; B108/B109 settings records. Historical plan filenames are under source/docs/plans/.
- Dependencies: None.
- Required proof: Consumer inventory + real rendered Dev-host controls.

### A12 — Prevent duplicate background polling (R13)

- Suggested commit: `test(perf): preserve shared polling and stale-result refusal`.
- Deliverable / DONE-WHEN: Multiple subscribers share transport; hidden/offline/unused views pause; unchanged ticks avoid full snapshots.
- Must refuse / failure test: Resume causes one shared read; delayed responses from another workspace cannot be adopted.
- Existing resources: Resource-keyed scheduler; 2026-07-31-continuous-polling-scheduler.md; B116 summary-first profile. Historical plan filenames are under source/docs/plans/.
- Dependencies: A07, A08.
- Required proof: Request counters + dense scratch workspace and installed-host profile; no game-performance claim.

### A13 — Keep readiness truthful and visible (R15)

- Suggested commit: `test(readiness): preserve distinct validation and deployment states`.
- Deliverable / DONE-WHEN: Existing readiness ladder shows evidence and links to its owner; mod checks, unavailable coverage, deployment and game proof remain distinct.
- Must refuse / failure test: Stale validation, unavailable checks and missing game evidence never become green game verification.
- Existing resources: Existing readiness ladder; B36/B109; private deploy and log-freshness plans. Historical plan filenames are under source/docs/plans/.
- Dependencies: A02, A03, A07.
- Required proof: Actual backend states + real rendered Dev-host inspection; no replacement status widget.

### A14 — Make the packaged build and test gate trustworthy (R19, R20)

- Suggested commit: `test(ci): preserve inspected packages and zero-flake verdicts`.
- Deliverable / DONE-WHEN: Exact-revision runner executes applicable type/lint/oracle/E2E/security gates, builds and inspects the VSIX, and retains only inspected artifacts.
- Must refuse / failure test: Retry-only pass remains a flake failure; invalid/expired quarantine and failed package inspection cannot produce a green release artifact.
- Existing resources: Existing CI and structured E2E gate; 2026-07-30-packaged-vsix-ci.md; 2026-07-30-e2e-flake-policy.md. Historical plan filenames are under source/docs/plans/.
- Dependencies: Required changed-surface checks above; this is the final candidate gate, not permission to publish.
- Required proof: Exact revision CI + staged/packaged probe. Red audit remains red, not waived.

## R21: six new implementation commits, in order

MCP is the connection through which an AI agent discovers and uses Forge's tools. The tools already exist; the missing work is safely turning that connection on, keeping it attached to the right mod, and turning it off again. The original suggestion to edit .mcp.json was superseded by the extension-native lifecycle decision; this plan does not silently edit shared agent configuration.

### M01 — Host capability and lifecycle foundation (R21)

- Suggested commit: `feat(mcp): add a disabled native provider lifecycle`.
- Deliverable / DONE-WHEN: Reconcile the current host APIs and existing shim; add a testable disabled-by-default lifecycle and provider adapter. Opening Forge alone grants nothing.
- Must refuse / failure test: Missing native API reports unsupported; no key creation, registration or external config write occurs implicitly.
- Existing resources: Existing extension.ts/capabilities.ts and bundled shim; add focused lifecycle module only if absent.
- Dependencies: Current A07/A09 contracts inspected; do not rerun every historical feature first.
- Required proof: Static/unit + supported/unsupported host capability evidence.

### M02 — Secure opt-in and key ownership (R21)

- Suggested commit: `feat(mcp): store opt-in workspace credentials securely`.
- Deliverable / DONE-WHEN: Explicit enable owns one least-privilege workspace-bound key. Store credentials only in context.secrets and non-secret metadata elsewhere. Make failed enable recoverable.
- Must refuse / failure test: Secret-store failure, cancelled enable or partial provisioning cannot leave an active untracked key or enabled status; exact cleanup failure is recorded.
- Existing resources: Existing scoped-key API, SecretStorage, M01 lifecycle.
- Dependencies: M01. Credential writes require the concrete opt-in/authorization at execution time.
- Required proof: Fault-injected secret/key flow + secret scans; disposable Dev credentials only.

### M03 — Connect the existing tools to the correct workspace (R21)

- Suggested commit: `feat(mcp): resolve native tools with workspace-bound authority`.
- Deliverable / DONE-WHEN: Provider lazily resolves the owned sidecar/key and runs the existing stdio shim. Tool list/calls preserve the actor-effective allowed subset.
- Must refuse / failure test: Offline sidecar, revoked/mismatched key, malformed capability contract and forbidden tools refuse; no deploy/spend permission is added.
- Existing resources: Native provider resolution, bundled x4forge-mcp.cjs, capability discovery.
- Dependencies: M02 + A07/A09 applicable regressions.
- Required proof: Real disposable MCP client list/call tests + Dev provider resolution.

### M04 — Restart and workspace-switch safety (R21)

- Suggested commit: `fix(mcp): invalidate authority across workspace changes`.
- Deliverable / DONE-WHEN: Restart restores only an explicitly enabled registration. Switching workspace invalidates stale sessions before further calls and requires correct authority.
- Must refuse / failure test: Delayed old-workspace calls cannot read/write the new workspace; missing secret on restart is not reported connected.
- Existing resources: M01 lifecycle, workspace events, M03 session ownership.
- Dependencies: M03.
- Required proof: Two scratch workspaces + restart/switch/race tests; installed host events.

### M05 — Disable, revoke and unsupported-host fallback (R21)

- Suggested commit: `feat(mcp): add truthful disable and revoke recovery`.
- Deliverable / DONE-WHEN: Disable stops local access and revokes only the owned key; failed revoke remains revocation-pending with a retry path. Unsupported hosts get explicit manual instructions without automatic config edits.
- Must refuse / failure test: Revoke outage and repeated disable cannot claim revoked or delete another key; existing external configs stay byte-identical. Fallback must not copy actual secrets to clipboard/logs.
- Existing resources: Lifecycle UI/commands, exact key revoke, existing manual configuration command.
- Dependencies: M04.
- Required proof: Real key/revoke API fault cases + restart recovery + rendered states + config/secret scans.

### M06 — Prove the package in both supported editors (R21)

- Suggested commit: `test(mcp): prove packaged native lifecycle in both hosts`.
- Deliverable / DONE-WHEN: Run enable, list/call, workspace switch, restart and disable against the exact packaged candidate in isolated VS Code and Antigravity profiles; retain hashes and evidence.
- Must refuse / failure test: Exercise unsupported API/offline/revoked-key paths; compare unrelated config hashes and inspect package/logs for secrets.
- Existing resources: Existing extension build/stage/package gates and isolated host fixtures.
- Dependencies: M05 + A14. Coordinate computer use only for required host proof; stable Forge and X4 remain outside the fixture.
- Required proof: Installed native UI + real MCP interactions in both hosts. A missing host means PARTIAL, not R21 complete.

## Complete recommendation mapping

| Original | Checkpoint | Disposition entering this plan |
| --- | --- | --- |
| R1 | A01 | Historically VERIFIED; current candidate proof required when touched |
| R2 | A02 | Historically VERIFIED; current candidate proof required when touched |
| R3 | A03 | Historically VERIFIED; current candidate proof required when touched |
| R4 | A04 | Historically VERIFIED; current candidate proof required when touched |
| R5 | A04 | Historically VERIFIED; current candidate proof required when touched |
| R6 | A05 | Historically VERIFIED; current candidate proof required when touched |
| R7 | A06 | Historically VERIFIED; current candidate proof required when touched |
| R8 | A07 | Historically VERIFIED; current candidate proof required when touched |
| R9 | A08 | Historically VERIFIED; current candidate proof required when touched |
| R10 | A09 | Historically VERIFIED; current candidate proof required when touched |
| R11 | A10 | Historically VERIFIED; current candidate proof required when touched |
| R12 | A11 | Historically VERIFIED; current candidate proof required when touched |
| R13 | A12 | Historically VERIFIED; current candidate proof required when touched |
| R14 | A10 | Historically VERIFIED; current candidate proof required when touched |
| R15 | A13 | Historically VERIFIED; current candidate proof required when touched |
| R16 | A01 | Historically VERIFIED; current candidate proof required when touched |
| R17 | A07 | Historically VERIFIED; current candidate proof required when touched |
| R18 | No implementation | Owner-rejected; #30 remains closed not_planned |
| R19 | A14 | Historically VERIFIED; current candidate proof required when touched |
| R20 | A14 | Historically VERIFIED; current candidate proof required when touched |
| R21 | M01 → M06 | OPEN; proposed sequence SPECIFIED |

## Boundaries and related work

- **R18 stays rejected.** No public CLI or second standalone product. Internal repository test commands are unaffected. Reversing this product decision requires an explicit new instruction.
- The separate “Note for Kimi.md” was a mod-agent report **to** Kimi, not additional Kimi-authored R numbers. Order/unit/cue checks map to #10; runtime log/cue liveness to #14/#35; API discoverability to #19; deploy hygiene to #20/#34. Stable node identity and save-compatibility requests need their own owner/acceptance reconciliation before a future executable card. They are retained, not silently marked done or bundled into R21.
- Claude's newer requests and the professional canvas-first UI concept remain separate programs. Existing private ui.xml, snapshot deployment, finding acceptance, strict import, runtime log freshness and client-isolation proofs are reusable inputs. They are not claimed publicly shipped here. Native game reload/save/state proof remains PARTIAL; M06 does not close it.
- Warning suppression and logged deployment acceptance are different policies. A01 preserves warning-only suppression; it does not remove the separately authorized deploy-actor acceptance workflow or broaden it into blanket suppression.
- Future negative tests use cloned mods, scratch targets and disposable processes. Native editor tests may need coordinated screen access; do not steal Claude's input. No game helper install or real reload is authorized by this plan.
- Rollback per future unit: preserve pre-change files/package and isolated state, revert only that unit, reprove the prior state. Key lifecycle rollback must stop local access and revoke its exact owned credential; failed revocation remains explicit. No broad reset/clean.

## Sources and proof boundary

- [Original R1–R21 addendum at immutable e27a08b](https://github.com/KennyG1990/X4_Forge/blob/e27a08b5681d44bd273be81b40079aa6828716d4/KNOWN-BUGS.md#L863-L958).
- [Historical reconciled execution ledger](https://github.com/KennyG1990/X4_Forge/blob/main/docs/plans/2026-07-29-kimi-recommendations-ledger.md); local private copy read during this task.
- GitHub #29, #30 and #31 fetched during this task; their states and original checklists remain unchanged.
- [Existing Notion B110](https://app.notion.com/p/3ae4618ed15b8154995efbbea7226a32) is the planning projection. This file is the local canonical breakdown until authorized source integration. Do not invent a public GitHub blob URL for this uncommitted file.

No executable, runtime, installed-host, public-package or game validation was performed for this documentation task. The verification here covers source traceability, full R1–R21 mapping, bounded acceptance/failure criteria and persisted plan readback only.
