# Plan — `#19` P4 Slice 11: Help/Wiki/Shortcuts/Onboarding Knowledge, Sanitized Bug-Report Bundles & Live Runtime Health/Probe/FORGE-STATE MCP Projections

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (isolated Dev source, governance manifests, `134/134` oracles, `771/771` HTTP routes, and `14/14` real stdio MCP; `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#19` (`help.onboarding_and_shortcuts.view`, `help.bug_report.prepare`, `runtime.logs_and_probes.diagnose`)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Project five read/analyze capabilities across `FORGE_CAPABILITIES`, protected (`public: false`) Agent HTTP routes, and stdio MCP tools (`87 -> 92` capabilities, `88 -> 93` MCP tools, zero new raw `fs.*` writer calls), flipping **two `missing` UI-action parity rows (`help.onboarding_and_shortcuts.view`, `help.bug_report.prepare`) directly to `available`** (`available: 17 -> 19`, `missing: 9 -> 7`, `openGaps: 32 -> 30`):
  1. **`help.knowledge.read@1`** (`query_forge_knowledge` -> `GET /api/agent/help/knowledge`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read']`):
     - Extract `WIKI_TOPICS` (`WikiTopic`) and `STUDIO_SHORTCUTS` (`ShortcutRow`) into a single shared pure TypeScript module `src/lib/forgeKnowledge.ts` (re-imported by `src/components/WikiBrowser.tsx` and `src/components/ShortcutsOverlay.tsx`), paired with `MOD_TEMPLATES` (`src/lib/modTemplates.ts`) starter guides and `RailGuide` onboarding steps.
     - Closed query `{ section?: 'all' | 'wiki' | 'shortcuts' | 'onboarding', category?: 'mdscript' | 'aiscript' | 'xmlpatch' | 'luaui' | 'reference', q?: string }` (`q` `maxLength: 256`).
     - Flips `help.onboarding_and_shortcuts.view` (`missing -> available`).
  2. **`help.bug.report@1`** (`prepare_bug_report` -> `POST /api/agent/help/bug-report`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`, `LEDGER_QUIET_ROUTES`):
     - Reuses `buildBugReport`, `redactSecrets`, and `BUG_TRACKER_REPO` (`src/lib/bugReport.ts`).
     - Closed body `{ title, description?, includeContext?, extraContext? }` (`title` `1..256`, `description` `<= 16000`, `extraContext` `<= 16` string entries scrubbed for secrets and host filesystem paths).
     - Auto-attaches sanitized server environment facts (`Forge version`, `Instance mode`, `Platform`, `Node`, `Schemas`, `Reference corpus`, optional addressed `Workspace` summary and `Last deploy validation` summary) with zero host paths or secrets, returning `{ ok: true, repo, issueUrl, body, truncated, context }`.
     - Flips `help.bug_report.prepare` (`missing -> available`).
  3. **`runtime.health.read@1`** (`get_forge_health_card` -> `GET /api/agent/runtime/health-card`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`, `context: { workspace: 'required', profile: 'none' }`):
     - Reuses `buildHealthCard` (`src/lib/healthCard.ts`) with redacted path placeholders (`(configured)` / `(unset)`) so all 10 walkaround rows, `verdict`, and `summary` are returned without leaking `x4GamePath` or `modWorkspacePath`.
  4. **`runtime.probe.preview@1`** (`preview_forge_probe` -> `POST /api/agent/runtime/probe-preview`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`, `LEDGER_QUIET_ROUTES`):
     - Reuses `buildProbeWorkspace` + `DEFAULT_PROBE_TOPICS` (`src/lib/forgeProbe.ts`), `generateMDXML`, and `computeWorkspaceDiagnostics` over optional validated `topics` (`<= 16` topics, `<= 24` fields/topic), returning `{ ok: true, topicCount, md, diagnosticsSummary, readOnly: true, note }`.
  5. **`runtime.state.read@1`** (`get_live_forge_state` -> `GET /api/agent/runtime/forge-state`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`):
     - Closed query `{ topic?: string }` (`maxLength: 128`), reusing `findDebugLogCandidates()`, `readTail(..., 256 * 1024)`, and `parseForgeState`, redacting host `logPath` while returning `{ ok: true, available, live, logUpdatedAt, totalTopics, truncated, topics, malformed, reason? }`.
- **Out of scope:** Mutating `x4_forge_probe` deployment into game directories (write-gated human step per ADR-F3), unredacted `POST /api/agent/log-file-tail` arbitrary host log path reads, or modifying `SELFTESTS` count (`134`) in `server.ts`.
- **Rollback / checkpoint:** `1ab7b472b89271b6b8519cc4fbe028fa36f71650` (`origin/main`).

## 2. Baseline & Reconciliation

- **Baseline HEAD:** `1ab7b472b89271b6b8519cc4fbe028fa36f71650` (`main == origin/main`, GitHub Actions `Quality` `45462671652` `SUCCESS`).
- **Reconciled owners reused without duplication:**
  - `src/lib/forgeKnowledge.ts` extracted directly from `src/components/WikiBrowser.tsx` (`WIKI_TOPICS`) and `src/components/ShortcutsOverlay.tsx` (`STUDIO_SHORTCUTS`), joined with `MOD_TEMPLATES` (`src/lib/modTemplates.ts`).
  - `src/lib/bugReport.ts` (`BUG_TRACKER_REPO`, `buildBugReport`, `redactSecrets`).
  - `src/lib/healthCard.ts` (`buildHealthCard`), `src/lib/forgeProbe.ts` (`DEFAULT_PROBE_TOPICS`, `buildProbeWorkspace`), and `src/lib/forgeState.ts` (`parseForgeState`).
- **Capability-map delta:**
  - `FORGE_CAPABILITIES` (`87 -> 92` capabilities, `84 -> 89` non-native; Contract SHA-256 `0fcadd01229c33fe67dddd8983fb308a1ec53e5784c80da1cb58c99a0d4d7d0f`).
  - `FORGE_UI_ACTION_PARITY_CENSUS` (`SHA-256: e6c54f40232acd6442394b8002a49290f313bff115224324e0136cf1e22f3007`; `available: 17 -> 19`, `approvalRequired: 2`, `partial: 23`, `missing: 9 -> 7`, `openGaps: 32 -> 30`).
  - `config/forge-route-dispositions.json` (`376 -> 381` disposed literal routes, SHA-256 `c8e6313f335e2f2357ef91d642b315377e9d8027e406cd711aba327c13374f33`).
  - `config/action-receipt-coverage.json` (`130 -> 132` routes / `69` surfaces, `manifestSha256: 868b4cbf4a40e1fc889c9be0a0dc47c61a473560bef55877b6f822584e456b68`, `envelopeSha256: 4b34b33d3ad0c8620036ffb09cb7da7d98d2060c6a38c7de465e4fbbc7927569`).
  - `vscode-extension/mcp/x4forge-mcp.cjs` (`88 -> 93` MCP tools, `MCP_MODULE_AUDIT_VERSION = 37`, preset inventories `read=48, write=53, deploy=54`).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600`: `0` errors (`579` warnings).
- `npm run typecheck`: exit `0`.
- `npm run test:writers`: `30/30 + PASS + 8/8` (`50` raw filesystem writer sources, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`92` capabilities, `381` disposed literal routes, `1` reviewed dynamic registrar, `93` MCP aliases, `51` UI-action parity rows).
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`: `PASS` (`132` routes / `69` surfaces, `79/79 + 23/23`).
- `npx tsx scripts/c06-contracts.selftest.ts` (`196/196`) & `npx tsx scripts/c06-api.selftest.ts` (`42/42`): `PASS`.
- `npm run test:mcp-capabilities`: `PASS` (`read=48, write=53, deploy=54` + `md-navigation-mcp` + `ai-navigation-mcp` + `native-performance-mcp`).
- `npm run test:native-deploy-mcp`: `6/6 PASS`.
- `npm run test:workspace-files-mcp`: `14/14 PASS` (including `14_help_knowledge_sanitized_bug_report_and_runtime_probes_over_mcp` over real child backend + stdio MCP).
- `npm run build`: exit `0`.
- `npm run test:oracles`: `134/134 PASS` (`runForgeCapabilitiesSelftest` including `runForgeKnowledgeSelftest`).
- `npm run test:routes`: `771/771 PASS` (including `slice11_help_knowledge_bug_report_and_runtime_probe_routes_redact_secrets_and_host_paths` and `all_canonical_capability_outputs_exercised` across all `92` capabilities).
- `npm run precommit:check`: `[precommit] OK`.

## 4. Close & AAR

- **Final status:** `VERIFIED` (bounded Unit 34; `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): help/wiki/shortcuts/onboarding knowledge, sanitized bug reports, and runtime health/probe/state (#19)`
- **AAR (Triggered — promotion helper CLI argument shape, multi-line regex & rare Windows Node 24 `undici` 16-stream EOF teardown race):**
  1. **Points to sustain:** Extracting `WIKI_TOPICS` and `STUDIO_SHORTCUTS` into `src/lib/forgeKnowledge.ts` and re-importing them in `WikiBrowser.tsx` and `ShortcutsOverlay.tsx` eliminated frontend/backend duplication while preserving every `FORGE_UI_ACTION_PARITY_CENSUS` disk `uiAnchor` token, and all product + test suites (`test:capabilities`, `test:action-receipt-coverage:selftest`, `test:mcp-capabilities`, `test:workspace-files-mcp` `14/14`, `test:oracles` `134/134`, `test:routes` `771/771`, `precommit:check`) passed cleanly.
  2. **Points to improve - work/approach:** `capability-contract-audit.ts --promote-candidate <sha256>` takes a positional `<sha256>` (unlike `action-receipt-coverage-audit.ts --promote-candidate <file> --expected-sha256 <sha256>`), and `ACTION_RECEIPT_COVERAGE_REVIEWED_MANIFEST_SHA256` wraps across two lines (`=\s*'...'`) in `src/lib/actionReceiptPolicyBundle.ts`.
  3. **Points to improve - tools:** During pre-commit re-verification (`task-9804`), `native_sixteen_request_admission_limit_preserves_each_http_owner` hit a 1-in-N Windows `Node v24.15.0` (`uv 1.51.0`) `0xC0000409` (`3221226505`) teardown abort when 16 cancelled `undici` `ReadableStream` (`reader.cancel()`) handles drained at the same instant `child.stdin.end()` closed the MCP process (`--native-performance-selftest` passed `30/30` on immediate isolated replay `task-9848`); keep banked under `#19`/MCP Windows `Node v24` `undici` stream-cancel teardown observation if recurrence warrants a brief post-cancel microtask/timer settle before `stdin` drain.
  4. **Highest-risk observed weakness:** Rare Windows `Node v24.15.0` libuv `0xC0000409` (`src\win\async.c:76`) child exit race after 16 simultaneous `undici` `ReadableStream.cancel()` calls immediately preceding `stdin` EOF; mitigated in normal operation (real MCP hosts do not simultaneously cancel 16 streaming native reads and close `stdin` within `150ms`) and tracked for deterministic test/client hardening if seen again.
