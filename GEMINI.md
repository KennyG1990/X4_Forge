# Agent Bootstrapper & Governance Canon

> Entry point for AI agents working in this repository (`CLAUDE.md` / `AGENTS.md` / `GEMINI.md` carry IDENTICAL content; edit one, mirror the others via `scripts/precommit-check.mjs`).
> **STANDING OPERATOR POLICY (Ken, 2026-11-26 — NOTION-ONLY DOCUMENTATION, MEMORIES, LESSONS & SOFTWARE REPORTS):**
> **ALL project documentation, task plans, session handoffs, backlogs, roadmaps, AARs, memories, lessons, and software/benchmark reports MUST live exclusively inside Notion (`notion-mcp-server`).**
> **NEVER create, append to, or maintain documentation, memory ledgers, lessons, or software reports on the local computer.**
> If `notion-mcp-server` is unreachable or lacks credentials, stop with `BLOCKED` on the documentation step rather than falling back to local files.

## Canonical Notion Workspace Targets (`notion-mcp-server`)

- **Operating Homepage (`X4 Forge Studio — Project Hub`):** `3ad4618e-d15b-8140-8777-e434a7f4a888`
- **Live Session Handoff & Active Queue:** `4254618e-d15b-817b-8d91-e00b7ffa5466` (read at session start; overwrite in place at every commit point / session close)
- **Plans, Closes & AAR Ledger (`Forge QA Field Log`):** `4124618e-d15b-8131-bdd5-ff6aabefbd6d` (`SPECIFIED` plans, `VERIFIED`/`PARTIAL`/`FAILED`/`BLOCKED`/`REVERTED` closes, and AARs)
- **Tasks & Bugs Database:** `d652f4a0-8d54-4341-a353-027a423f1a37`
- **Decision Log Database (ADRs):** `7e84e4f0-0d2f-45e9-87ef-6fa31b33e975`
- **Research & Evidence Database (Software & Benchmark Reports):** `d59937b7-e467-4845-92f9-8007a0fa2468`
- **Releases Database:** `6d1ac5d2-65d5-437a-ac6e-78ef730a102f`

## ⛔ OPERATOR PROTOCOL

Ken's standing instruction: give honest, direct technical feedback; criticize flawed assumptions immediately; never appease; surface better solutions upfront; and enforce operational discipline on every turn:

1. **SESSION-START BRIEF (NOTION-FIRST).** Before work, read the Notion **Live Session Handoff & Active Queue** (`4254618e-d15b-817b-8d91-e00b7ffa5466`), **X4 Forge Studio — Project Hub** (`3ad4618e-d15b-8140-8777-e434a7f4a888`), and **Forge QA Field Log** (`4124618e-d15b-8131-bdd5-ff6aabefbd6d`) via `notion-mcp-server`, and search Notion (`API-post-search`) before non-trivial tasks to verify whether a problem or decision is already recorded. State in one block: WHICH project this session owns, the **eyeball queue** (every `PARTIAL` item gated on a Ken check, each with a click-by-click script), and the **commit question** (whether `HEAD` is clean and pushed).
   **SESSION-CLOSE MIRROR:** At every commit point or degradation call, update the Notion **Live Session Handoff & Active Queue** (`4254618e-d15b-817b-8d91-e00b7ffa5466`) in place via `notion-mcp-server`. Never write a local handoff file.
2. **MACHINE-STATE ASK.** Before validation-heavy or E2E work when live surfaces may contend: check machine state and never assume. Never touch a running `X4.exe` session or live user canvas without explicit authorization. Isolated `FORGE DEVELOPMENT` (`G:\Forge-QA\development-ide\`) stays permitted while `X4.exe` or live work is active; only full 38-spec `test:e2e`, VSIX publish, and game installs wait on `X4.exe`.
3. **DEGRADATION CALL.** When a session runs long and agent errors cluster (2+ mistakes in a stretch or repeated tool freezes), state plainly: "we're in degradation territory — commit point now, fresh session for the next unit."
4. **COMMIT CADENCE.** End every `VERIFIED` close with `commit point: <close title>`. Uncommitted work is blast radius.
5. **CANON LAG.** When Ken changes a standing rule, update Notion (`Decision Log` `7e84e4f0-0d2f-45e9-87ef-6fa31b33e975` + `Project Hub` `3ad4618e-d15b-8140-8777-e434a7f4a888`) and, if bootstrapper pointers change, sync `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` IN THE SAME TASK.
6. **WRITE GATES.** Before any destructive deletion or any write to a live gameplay mod, game directory, or standing user config: present ONE paragraph — what will be written/deleted, what could break, and how it is undone — and wait for explicit approval. Never validate against a live gameplay mod when an isolated scratch fixture works.
7. **`[REPRODUCED]` vs `[HYPOTHESIS]`.** Tag every failure or root-cause claim `[REPRODUCED]` or `[HYPOTHESIS]`. Never present a hypothesis as a proven diagnosis.
8. **OVERLOAD FLAG.** If messages mix projects or contradict active state, state this project's one-line status plainly so context stays clean.

# Universal AI Task Workflow

## Hard Rule

Every task follows:

`CLASSIFY -> PLAN -> BASELINE -> RECONCILE -> DOCUMENT PLAN -> IMPLEMENT -> VALIDATE -> REVIEW -> DOCUMENT CLOSE -> AAR`

Enforce this workflow 100%. Scale the amount of writing to the task, but never skip reconciliation, honesty, or an explicit final status.

The model proposes and performs work within its authorization. Deterministic tools, tests, policies, and observed runtime behavior decide whether the work is correct.

## 0. Classify The Lane

Choose the lane before work begins.

### Full Lane

Use for code, features, bug fixes, behavioral changes, schemas, migrations, endpoints, tables, panels, dependencies, security or spending surfaces, cross-layer contracts, and anything with meaningful blast radius. Run every stage in full.

### Light Lane

Use only when all are true:
- The task is a small local text, comment, or formatting edit.
- It changes no executable behavior, API, schema, dependency, endpoint, table, panel, security boundary, spending surface, or persistent state contract.
- It is confined to one clearly understood surface.
- Validation is immediate and low risk.

When uncertain, use the Full lane.

## 1. Plan And Declare The Acceptance Contract

Before touching implementation files, state:
- The one bounded unit of work, assumptions, unresolved facts, and authoritative references.
- In-scope and explicitly out-of-scope behavior.
- Files, resources, interfaces, and user surfaces affected.
- Risks (data loss, security, network, spending, compatibility, migration, UX) and rollback method.
- Exact acceptance criteria, required validation methods, >=1 negative/failure-path check, Notion evidence target, and any unavailable validation with reason.

## 2. Capture The Baseline

Before mutation, record current version/SHA, modified/untracked files, failing tests/diagnostics, relevant runtime/port/UI state, and rollback target. Preserve pre-existing user changes. If a safe baseline cannot be captured, stop with `BLOCKED`.

## 3. Reconcile With Reality

Inspect live code, runtime, schemas, and Notion records (`Project Hub`, `Decision Log`, `Research & Evidence`, `Tasks & Bugs`) before building:
1. **Search by resource, not feature name:** Enumerate readers, writers, callers, and owners of the concrete table, route, port, command, state object, path, process, UI mount, or chokepoint function.
2. **Reconcile couplings:** Check schema/emitter, writer/reader, backend/UI, runtime/persistence, prompt/validator, and source/generated artifact parity.
3. **Prove presence and absence:** Cite locations for existing/partial code and exact search boundaries for absence claims.
4. **Capability-map delta:** Update Notion capability state only when reconciliation adds, strengthens, or invalidates a capability claim; otherwise record `no capability-map delta`.
5. **Architecture gate:** If a component has 3+ documented recurring failures, record an explicit extend-vs-replace decision backed by measurable evidence.
6. **Standing-hazard sweep:** Whenever any spending, network, deletion, credential, permission, or security surface changes (and at least every 10 substantial closed tasks), verify each surface has a meter, limit, and failure behavior.

## 4. Document The Reconciled Plan (In Notion)

Write the bounded `SPECIFIED` plan to Notion (`Forge QA Field Log` `4124618e-d15b-8131-bdd5-ff6aabefbd6d`) via `notion-mcp-server` before Full-lane implementation. Never create a local plan markdown file on disk.

## 5. Implement The Bounded Unit

- Build only the documented scope following existing ownership boundaries, conventions, and structured APIs.
- Keep policy, validation, and pass/fail verdicts deterministic.
- Never silently weaken tests, oracles, schemas, permissions, or acceptance criteria.
- Respect authorization gates for spending, publishing, deletion, credentials, live state, or out-of-workspace writes.

## 6. Validate Against The Acceptance Contract

Run every declared and coupled validation method across applicable layers:
1. Static / schema / types (`npm run typecheck`, `npm run lint -- --max-warnings 600`)
2. Unit / focused behavioral selftests and runtime-discovered oracles (`npm run test:oracles`)
3. Integration / cross-layer contracts (`npm run test:routes`, capability/receipt/writer audits)
4. Negative-path, rejection, rollback, timeout, and no-false-success checks
5. Real runtime, service, database, or host-process checks
6. Native UI rendering and interaction (`npm run test:e2e`, rendered Chromium / live `FORGE DEVELOPMENT` extension host; headless Playwright and `inspect:ui` do NOT substitute for live `FORGE DEVELOPMENT` IDE host validation)
7. Packaged / installed VSIX verification (`stage-app`, `probe-app`, `inspect-vsix`, installed IDE)
8. In-game X4 execution/experience verification where game behavior is claimed

**Outcomes:** `VERIFIED` | `PARTIAL` | `FAILED` | `BLOCKED` | `REVERTED`. Never claim `VERIFIED` from code inspection alone or over unavailable required gates.

## 7. Review Against The Source Of Truth

Re-read the request, Notion contract, references, and full `git diff` point-by-point (`done | partial | missed | deferred | out of scope`). Perform a fresh-eyes review on subsystems, schemas, security boundaries, migrations, and cross-layer contracts.

## 8. Document The Close & 9. Record The AAR Outcome (In Notion)

Update `Forge QA Field Log` (`4124618e-d15b-8131-bdd5-ff6aabefbd6d`) and `Live Session Handoff & Active Queue` (`4254618e-d15b-817b-8d91-e00b7ffa5466`) in Notion with final status, changes, validation receipts, remaining risks, commit title, and AAR (`Sustain`, `Improve work/approach`, `Improve tools`, `Highest-risk observed weakness | No evidenced risk delta`). Bank all durable decisions, reports, and lessons in Notion — **never on local disk**.

## ⛔ X4 FORGE PROJECT ADAPTER

- **Authoritative technical references:** X4's unpacked XSDs + vanilla/DLC corpus (`<X4_UNPACKED_CORPUS>`), Notion `Decision Log` (`7e84e4f0-0d2f-45e9-87ef-6fa31b33e975`), Notion `Research & Evidence` (`d59937b7-e467-4845-92f9-8007a0fa2468`), Notion `Tasks & Bugs` (`d652f4a0-8d54-4341-a353-027a423f1a37`), and GitHub Issues (`KennyG1990/X4_Forge` — every scoped feature/program has one non-duplicate owner issue synced on status change).
- **Shipped store package metadata exception:** `vscode-extension/README.md` and `vscode-extension/CHANGELOG.md` exist strictly as packaged Open VSX `.vsix` store metadata enforced by `inspect-vsix.mjs`; never store engineering notes, AARs, or memories in them.
- **Commands & gates (repo root):**
  - `npm run typecheck` · `npm run lint -- --max-warnings 600` · `npm run test:writers` · `npm run test:capabilities` · `npm run test:action-receipt-coverage`
  - `npm run test:oracles` (`node scripts/oracle-sweep.mjs`) · `npm run test:routes` (run with `X4_XSD_PATH` and `X4_REFERENCE_ROOT` unset)
  - `npm run test:e2e` (ephemeral ports `3100`/`3101` + isolated state dir; pass `X4_REFERENCE_ROOT`; `workers=1` serial; verify ephemeral tree cleanup)
  - `npm run precommit:check` · `npm run build` · `npm run validate:mod -- "<folder>"`
- **Live `FORGE DEVELOPMENT` IDE Gate (Ken, 2026-11-28):**
  - Keep `G:\Forge-QA\development-ide\` (`FORGE DEVELOPMENT` side-by-side with `X4CodeSense`) active during UI/extension work: **agents operate it autonomously and headlessly without Ken at the computer**, launching via `pwsh -NoProfile -File G:\Forge-QA\development-ide\Launch-FORGE-DEVELOPMENT.ps1 -HoldOpen` (under background daemon execution) or `-Restart -HoldOpen` on crash/wedge recovery. When Ken is at the computer and runs `Launch-FORGE-DEVELOPMENT.cmd` on interactive `WinSta0\Default`, it cleanly hands over from any headless `development-ide\profile` process to a visible GUI window while leaving live Antigravity and `X4.exe` untouched.
  - After building edits, run `pwsh -NoProfile -File G:\Forge-QA\development-ide\Reload-FORGE-DEVELOPMENT.ps1` (signals `recoverIfStopped: true` across `.forge-dev-reload` and fails closed `exit 1` unless live sidecar recovers and `Probe-FORGE-DEVELOPMENT.ps1 -Json` returns `ok: true`; use `-SyncOnly` only during pre-commit packaging prep) and capture `Probe-FORGE-DEVELOPMENT.ps1 -Json` (`ok: true`, `ideRunning`, `sidecarRunning`, `uiMatchesDist`, `distMatchesHead`, `extensionSynced`, `x4CodeSenseInstalled`).
  - **Honesty boundary:** Headless Playwright and `inspect:ui` do NOT satisfy the installed-IDE gate. Without a green `Probe-FORGE-DEVELOPMENT.ps1` receipt + live verification inside `FORGE DEVELOPMENT`, any UI, webview, or extension unit may claim at most `PARTIAL`, never `VERIFIED`.
- **Memory & CPU admission (Ken, 2026-11-12):** Fixed free-RAM and CPU-percentage launch floors are retired; keep tests serial (`workers=1`), heap-bounded, and isolated from live `~/.x4forge` (`3000`/`3001`) and `X4.exe`.
- **Spending / network / deletion policy:** AI spend meter + daily cap live at `callMultiProviderAI`; any new spend, network, or deletion surface requires a verified meter, limit, and failure behavior. External agents bring their own AI keys (`x-custom-api-key`).
- **Git & Unified Version Standard (Ken, 2026-07-19 & 2026-11-25):**
  - Agents run `npm run precommit:check`, commit, push directly to `origin/main`, assert `origin/main == HEAD`, and verify GitHub Actions `Quality` passes.
  - `vscode-extension/package.json` `.version` is the **single canonical product version** across Open VSX, Studio UI header (`v{__APP_VERSION__}`), bug reports, validation receipts, and discovery records, with `__APP_BUILD__` carrying `build <full-commit-count> · <sha> · <YYYY-MM-DD>` from an **unshallow** checkout (`git rev-parse --is-shallow-repository` MUST be `false`; `stage-app.mjs` and `inspect-vsix.mjs` fail closed on shallow provenance or client-bundle version drift).
  - **Publish-before-commit** applies only to user-facing Open VSX releases (`bump vscode-extension/package.json` + `release-notes.json` -> root `npm run build` -> `changelog` -> `stage-app` -> `audit` -> `probe-app` -> `ext build` -> `package` -> `inspect-package` -> `ovsx publish` -> `commit`).
- **Code knowledge graph (`graphify`):** AST-extracted code graph at `graphify-out/graph.json` (`graphify query`, `graphify affected`, `graphify path`, `graphify explain`). After changing code files, run `graphify update .` (deterministic AST-only, zero API cost).
