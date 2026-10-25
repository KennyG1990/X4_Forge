Status: SPECIFIED for later implementation. Documentation delivered to the existing Forge Notion hub; no helper/game installation or live command authorized.

## Future concept — Forge Companion inside X4

Requested on <mention-date start="2026-10-25"/>. **SPECIFIED for later implementation.** This specification authorizes no installation, reload command, save mutation or connection to the currently running game. Claude's live Forge remains isolated; Kimi remains paused.

### Purpose and product shape

A small optional **Forge Companion** X4 mod gives the installed Forge extension a controlled two-way connection to the game. Forge remains the editor, validator and deployment manager in Antigravity/VS Code. The companion is its in-game observer and command executor, not a second full IDE.

The desired workflow is: edit → validate and deploy the exact source → request the appropriate reload → receive fresh game evidence → inspect structured results in Forge. Agents should not need keyboard focus, console typing or screenshots to perform these technical checks. Visual appearance and player experience still require game observation.

### Existing foundation and honest limits

Reuse the private Dev runtime debugger, lifecycle segments, bounded log reader, addressed runtime-control API, action receipts and generated MD/Lua helper. The existing local plan is `docs/plans/2026-10-24-dev-runtime-loop.md`, with evidence under `lab/evidence/runtime-loop`.

That prototype passed isolated HTTP and Lua-interpreter tests with simulated game functions. Its generated MD passed the game schema. Installed Dev correctly refused requests when no helper was available. **Real X4 transport availability, real reload completion and real save-load behavior remain unproven.** It is not installed in the running game.

The game-source investigation recorded `ExecuteDebugCommand` in the vanilla chat UI, the Helper scheduler and the MD game-loaded event. Their existence does not prove that an arbitrary mod can safely use every facility. Prove access and behavior before selecting the production transport.

### Architecture and connection ownership

1. **Extension and managed sidecar:** authenticate agents, select the mod/workspace/game instance, enforce permissions, retain receipts, manage validated deployment and present evidence.
2. **Companion mod:** a minimal MD lifecycle observer plus Lua scheduler/command adapter. It announces supported capabilities, emits heartbeats and results, and executes only explicitly supported operations.
3. **Opt-in mod adapters:** a documented probe interface lets a mod expose named state snapshots and diagnostic events. The companion routes these reports without depending on AI Live or any particular gameplay mod.
4. **Transport adapter:** prove the existing private file mailbox first. Evaluate a loopback connection only if game-side networking is demonstrably available and appropriate. No silent keyboard fallback, remote listener, arbitrary filesystem access or assumed Lua io/socket support.
5. **Isolation:** pair explicitly with a Forge instance and game instance. Dev and stable use separate discovery, queues and credentials. Multiple read-only consumers may observe; only one expiring control lease may issue mutating commands to a game instance. The lease is queryable by owner and acquisition/expiry time. Dev must never take over Claude's live connection automatically.

### Required operations

- **Connection status:** helper/protocol version, supported operations, current helper boot, heartbeat age, targeted mod and game session, and precise unavailable/degraded reasons.
- **Save-aware logs:** distinguish game launch, save load, UI reload and reconnect. Preserve historical incidents but prevent old lines or probes from satisfying a new-session check. Report missing instrumentation or uncertain boundaries explicitly.
- **Tagged probes:** accept bounded structured events carrying mod identity, provider/schema version, sequence, session and correlation ID. Allow Forge to request a named probe and receive its result as data.
- **Read-only state snapshots:** a mod may register a provider such as outcomes-summary. It returns explicitly selected values, types, truncation information and capture time. A request for an internal value such as Cards.$outcomes requires that mod's adapter or another proven game API; the system must not promise universal access to private variables or engine memory.
- **Reload UI and refresh MD:** expose only the proven named commands, without arbitrary code or arguments. Bind each request to the paired instance, control lease, mod identity, successful deployment record, expected session and reason.
- **Reload result tracking:** distinguish authorized, queued, invocation observed, reconnected, postcondition passed, failed, expired and unknown. A queued request, command invocation or new heartbeat alone must never mean that the mod works. UI reload should deliberately reconnect; MD refresh requires an appropriate mod-owned completion probe.
- **Evidence export:** retain the deployed source identity, actor, reason, command ID, before/after session, relevant log cursor, probe payloads and verdict. Keep file-byte proof separate from the build marker reported by running scripts.

### Safety, persistence and performance requirements

- Read-only observation is the default. Existing deploy permission authorizes supported reload operations, with authenticated actor and reason recorded. Unsupported operations refuse with a precise capability error.
- Use versioned, data-only messages; validate types, lengths and identities at both ends. Never evaluate supplied Lua, MD expressions or arbitrary console commands.
- Preserve the prototype's bounded queue, one outstanding command, short expiry and replay protection. Crash/reconnect/save changes invalidate stale requests. Record consumption before invocation; an ambiguous crash becomes unknown, not an automatic retry.
- Treat mod-emitted logs as attributed reports, not cryptographically authenticated engine telemetry. Document the trust model of whichever transport passes the feasibility gate.
- Do not overwrite the game's update loop. Use the existing scheduler with bounded work, backoff while disconnected and explicit dropped/truncated counts. Measure idle and burst overhead against the companion-disabled baseline; no performance improvement is claimed from source inspection.
- Keep runtime command state ephemeral. Namespace and version any unavoidable save data. Test disabling/removing the companion, missing adapters and old saves; do not assume removing a mod leaves saves unaffected.
- Installation and removal require a preview of exact files, hashes, compatibility and rollback. No automatic installation into another mod or a running live environment.

### Deliverable commit points and acceptance

**GC01 — transport and capability feasibility.** In a separately authorized disposable game session, prove a bidirectional nonce round trip using the actual X4 Lua environment. Test missing io/network/command/scheduler support. Report unsupported capabilities clearly and choose the transport from observed evidence. No shipping claim from stubs.

**GC02 — companion identity and session lifecycle.** Package the optional generic companion and prove pairing, heartbeats, game launch, save A → save B, reconnect, UI reload and log rotation. Old session data cannot satisfy current expectations; a second Forge instance cannot seize the control lease.

**GC03 — structured events and read-only probes.** Implement a test-mod provider and prove known values, changes, unavailable providers, wrong-mod requests, timeouts, malformed/oversized data and bounded output. Reading state must not mutate it.

**GC04 — controlled reload operations.** Wire the existing receipt/control owners to the proven transport. Test scope denial, wrong instance/mod/session, stale deployment, duplicate requests, expiry and crash ambiguity. Prove actual UI reload reconnect and MD refresh postconditions in X4 without keyboard input.

**GC05 — complete deploy-to-game proof.** Use the test mod to demonstrate two builds: validated and byte-verified deployment, command receipt, fresh runtime marker and requested probe result. Deliberately introduce an error and show a failed outcome. A stale marker, merely queued reload or source change after validation must not produce a green result.

**GC06 — installed experience and lifecycle hardening.** Provide clear connected/unavailable/reloading/awaiting-evidence states, current-session log filtering and named probes through existing Forge UI/API/MCP owners. Prove compatibility negotiation, restart, removal, rollback and bounded performance. Native rendered controls and real game execution require separate evidence.

Each point must preserve existing validators and deploy guards. Reconcile with the existing runtime precision and current-session programs before creating implementation issues: [GitHub #14](https://github.com/KennyG1990/X4_Forge/issues/14) and [GitHub #35](https://github.com/KennyG1990/X4_Forge/issues/35). These are navigation references; this concept does not close either issue or claim a new implemented feature.

### Non-goals and sequencing

No gameplay automation, arbitrary live-state editing, memory injection, universal hot reload of all X4 assets, complete editor inside X4, mandatory AI Live dependency or public release in this task. Some content changes may still require a game restart or new session; detect and explain that limitation.

Document this concept now, then resume Claude's remaining Forge complaints in the isolated Dev build. The game-side feasibility work waits for a separately coordinated test; it must not interrupt Claude's active mod development.


Documentation close: VERIFIED Notion insertion/readback. Existing hub body preserved exactly. Six deliverables and explicit unproven transport/game boundary confirmed. AAR: parser converted the date mention to its current syntax; readback confirmed content. No code or game change in this documentation unit. Owner references: existing #14/#35, not new issues. Canonical implementation foundation remains 2026-10-24-dev-runtime-loop.md.
