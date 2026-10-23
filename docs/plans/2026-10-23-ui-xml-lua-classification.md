# UI XML incorrectly admitted to Lua cross-file analysis

Task: repair Lua input selection. Lane: FULL. Status: SPECIFIED.

## PLAN / BASELINE / RECONCILE

- Bounded unit: shared cross-file validation selects Lua by file extension, matching existing projectValidation and projectOrchestration Lua analysis. UI is a resource category, not a language.
- Source: HEAD 743c010, feat/agent-scope-all; extensive existing unrelated edits preserved. Target validator initially clean. Installed sidecar 0.0.78 is separate from this checkout.
- Owner report: KennyG1990/x4_AiLive#10, comment 6358598449. Forge#10 is a different rule-pack program. No duplicate issue needed.
- Graph identifies validateProjectCrossFile consumers in projectValidation, projectOrchestration and server. Actual source confirms kind=ui currently enters Lua parser; ordinary Lua passes use the .lua suffix.
- Agent-brain and F:/StarForge capability/ADR ledgers unavailable. No capability-map delta: repair existing validator.
- Scope: validator and regression fixtures, local evidence/records. Excludes save-store work, mod writes, game writes, installed extension replacement, release and unrelated B119 edits.
- Risk: accidentally skipping real Lua or accepting invalid Lua. Require case-insensitive suffix and tests with misleading kind tags, malformed Lua and XML with Lua-looking text.
- Acceptance: UI XML does not generate Lua AST failures or satisfy missing event registrations; valid .lua continues to register; malformed .lua remains a hard error regardless of kind. Packaging retains XML bytes.
- Validation: red/green shared-validator selftest; orchestration selftest; focused lint; typecheck; package regression. Full E2E/native/release validation is outside this pure backend unit; installed behavior requires a separately authorized installation.
- Machine: user confirms X4 running, machine quiet for this fix. Fixtures are in-memory; no deployment or workspace switch.
- Rollback: reverse only this task's diff. Evidence: red/green results and close below. No new spend/network/delete/credential surface.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

- [REPRODUCED] Before repair: cross-file selftest 28/33, exit1. Four non-Lua UI assets produced lua_ast_unavailable, including exact ui.xml parser error [1:2] unexpected symbol '?' near '<'. XML containing Lua-looking text incorrectly satisfied registration (fifth failing check).
- Repair: select files using classifyPath(path) === 'lua', whose case-insensitive .lua suffix precedes directory classification. All registrations/emits/payload analysis consume this same list. Added packaging regression to existing projectOrchestration selftest.
- After repair: cross-file 33/33 and orchestration 16/16, combined command exit0. Includes uppercase .LUA with ui/other/lua kinds still rejecting malformed source; normal event registrations/listeners and existing payload checks retained. Packaging retains ui.xml bytes.
- Commands: node --import tsx --input-type=module importing runProjectCrossFileSelftest and runProjectOrchestrationSelftest; npm run typecheck; npx eslint src/lib/projectCrossFileValidation.ts src/lib/projectOrchestration.ts; git diff --check on task paths. Typecheck passed; lint exit0 (9 existing any warnings); diff check passed.
- Installed 0.0.78 app/dist/server.cjs line32247 still contains the old predicate; live sidecar PID69456 is running. No installed file or service changed. Source repair alone cannot unblock that process.
- Review: suffix rule agrees with existing package/general validation; does not modify structural/XML checks, project state, mod contents or writes. Full rendered/native/E2E proof not applicable to this bounded pure backend change; installation/runtime verification remains outstanding.
- Status: VERIFIED source regression repair; PARTIAL operational unblock pending installed-runtime repair authorization. Changes uncommitted; no precommit/release performed. Suggested commit: fix(validation): exclude non-Lua UI assets from cross-file analysis.
- AAR triggers: reproduced negative test, connector parameter mismatch corrected, PowerShell inline JavaScript quote failure corrected by durable packaging fixture, Windows glob searches rejected. Sustain: reproduce exact failure and preserve negative Lua checks. Improve: use rg -g filters instead of wildcard path operands; durable fixtures avoid shell escaping. Highest-risk observed weakness: source and installed bundle differ, so source green cannot imply deploy readiness. Follow-up: patch installed predicate with backup, restart owned sidecar, verify live fixture and target validation before any mod deployment.
- Project lesson banked here; external StarForge ledger unavailable. No global memory writes.
