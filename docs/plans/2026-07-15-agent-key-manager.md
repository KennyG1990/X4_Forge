# B42 · Agent key manager (named, scoped, EXPIRING keys) — SPECIFIED 2026-07-15

Lane: **FULL** (security surface). Branch `claude/x4-forge-vscode-poc-806ef5`.
Ken's directive: user picks key lifetime; build it; validate in the Antigravity extension;
plus parity feature passes and a shippable extension icon (tracked here as riders).

## Bounded unit

OpenAI-style key management for the existing bearer-auth Agent API: create named keys with a
**scope** and a **user-chosen lifetime**, hand them to external agents, revoke them
individually, see last-use. The boot session token remains the app-UI's own credential and
the ONLY credential that can manage keys.

## Reconcile (what exists — extend, don't rebuild)

- Auth chokepoint: `authMiddleware` server.ts:299 — single function, all `/api/*`. Extend here.
- Persistence pattern: `aiSpendMeter` (`src/lib/aiSpendMeter.ts` + `data/ai-usage.json`).
- Oracle registry: `SELFTESTS` map (server.ts:5164) → `registerSelftests` auto-publics + sweeps.
- Agent-facing UI: `src/components/AgentBridge.tsx` (tabs: docs/status/execute) — add a `keys` tab.
- Extension: `vscode-extension/src/extension.ts` holds the sidecar session token in memory —
  a "Create Agent Key" command closes the token-discoverability gap found in B41.
- NEGATIVE: no multi-token, scope, expiry, or revocation exists anywhere (single
  `STUDIO_API_TOKEN` equality check; searched server.ts auth path + src/lib).

## Design

**Engine** `src/lib/agentKeys.ts` (house pattern; injected `now` — no wall-clock in logic):
- Token format `x4fk_<64 hex>`; stored as **sha256 hash only** (plaintext shown once).
- Record: `{ id, label, scope, tokenHash, createdAt, expiresAt|null, lastUsedAt|null, useCount, revokedAt|null }`.
- Store: `createAgentKeyStore({file, now})` → `create(label, scope, ttlMs|null)` /
  `verify(token, at)` → `{ok, scope?, id?, reason?: 'unknown'|'expired'|'revoked'}` /
  `revoke(id)` / `list()` / `touch(id)`; atomic JSON persistence `data/agent-keys.json`.
- Oracle `runAgentKeysSelftest()`: create/verify green; wrong token → unknown; **expired**
  (ttl 1h, verify at +2h via injected clock) → expired; revoked → revoked; scope carried;
  no plaintext in records or file; persistence round-trip; expired keys prune.

**Scopes** (deny-by-default; session token = unscoped as today):
- `read` — GET only.
- `write` — read + these POST prefixes: `/agent/workspace`, `/agent/compile`,
  `/agent/package`, `/agent/project/`, `/agent/simulate`, `/agent/probe/preview`.
  Everything else non-GET → 403 `insufficient_scope`.
- `deploy` — everything write has + deploy/fs/github/AI routes (= full API power),
  EXCEPT key management, which is session-token-only for every scope (no key can mint
  or revoke keys — privilege-escalation guard).

**Lifetimes** (Ken's requirement): create-time choice `1h · 24h · 7d · 30d · never`
(engine takes arbitrary ttlMs; UI offers these five). Expired keys fail closed with a
distinct 401 reason and are prunable.

**Endpoints** (all session-token-only): `GET /api/agent/keys` (list, no hashes) ·
`POST /api/agent/keys {label, scope, ttl}` → `{token(once), record}` ·
`POST /api/agent/keys/revoke {id}`.

**UI**: AgentBridge 4th tab **AGENT KEYS** — create form (label / scope / lifetime),
one-time key reveal with copy, key table (label · scope · expires · last used · uses ·
revoke). Uses the page's session token automatically.

**Extension**: command `x4forge.createAgentKey` ("X4 Forge: Create Agent Key") — prompts
label/scope/lifetime, POSTs to its backend (session token from memory), copies
`endpoint + key` to the clipboard and prints a ready curl line to the output channel.

**Riders in this unit**: extension icon (`icon.png`, generated locally, wired via manifest
`icon` field; version → 0.0.2) · parity feature passes in the extension (see validation).

## Acceptance contract

1. Oracle `agent-keys-selftest` green and auto-swept (sweep count +1).
2. Gates: tsc · lint · precommit · build · **full e2e** all green on the branch.
3. Live in the **Antigravity-installed extension** (rebuilt VSIX): create a key in the new
   UI tab; use it from a plain terminal (no session token): read succeeds; **negative
   paths live**: write beyond scope → 403; revoked → 401; garbage/expired-class → 401;
   key-management with an agent key → 403.
4. Expiry semantics proven by the deterministic oracle (live expiry would need wall-clock
   waiting — declared here as oracle-proven, not live-proven).
5. Session token unchanged for the app UI; e2e (which uses it) stays green.
6. VSIX packages with icon; installs; no secrets/hashes ship (data/agent-keys.json is a
   runtime file, never staged).
7. Parity passes (extension, its own sidecar): (a) engine pass = full oracle sweep;
   (b) surface pass = Expert-mode walk of the major panels (canvas, toolbox, inspector,
   diagnostics/doctor, simulator, templates/patterns, wares/jobs, aiscripts, HUD/Lua,
   XML patch, languages, project, playtest, settings, agent bridge incl. new tab);
   (c) workflow pass = template → edit → validate → package rerun. Evidence appended to
   `vscode-extension/evidence/VALIDATION.md`.

## Risks / rollback

Auth-path change = the riskiest edit in the app: mitigated by deny-by-default scoping,
session-token fast path unchanged first branch, full e2e + api-selftest rerun, and the
negative-path live drills. Rollback = revert the branch commits (worktree-only; main
untouched). No spend/network surface added (keys grant no new capability, only subsets).
