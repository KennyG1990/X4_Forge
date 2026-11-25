# Unit 57 — Complete Deterministic Diagnostic Explain Guidance Across MD, AIScript, Expression, Lua/UI & Manifest Rules (`#33`, `#74`, `#82`, `#114`, `#122`, `#129`)

Task: Eliminate all 34 missing deterministic diagnostic explanations in `src/lib/diagnosticExplain.ts` across shipped MD pitfall, MD/AIScript call-parameter & label, MD/AI expression AST, Lua/UI static, and extension-manifest rules while preserving `X4_CORE_RULE_PACK` provenance and honest `genericGuidance` fallback on unknown future codes (`#33`, `#74`, `#82`, `#114`, `#122`, `#129`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Upgrade `GUIDANCE` and `runDiagnosticExplainSelftest()` in `src/lib/diagnosticExplain.ts` so every shipped deterministic project-validation diagnostic code across X4 Forge returns accurate, domain-specific `title`, `why`, `impact`, `next`, and `basis` remediation instead of falling through to `'Project validator finding'` (`"no more specific explanation is registered for this code yet"`) or an overly broad `<order>` / cue-link bucket:
  1. **MD Variable Lifecycle & Initial-State Flow (`#114`, `#129`):**
     - `md_pitfall.variable_read_before_initialization`, `md.variable_initial_state`
     - `md_pitfall.variable_read_after_removal`, `md_pitfall.variable_read_when_absent`
  2. **MD Cue Triggering, Listeners & Runtime Pitfalls (`#54`, `#74`):**
     - `md_pitfall.no_event_condition`, `md_pitfall.illegal_instantiate`
     - `md_pitfall.ui_listener_one_shot`, `md_pitfall.offer_accepted_keyword_cue`, `md_pitfall.param3_table_barekey`, `md_pitfall.cancel_conversation_actor_or_template`, `md_pitfall.destroyed_event_source_required`, `md_pitfall.products_existence`, `md_pitfall.return_context`, `md.return_context`
  3. **MD & AIScript Call Signatures, Library Purpose & Labels (`#81`, `#82`, `#83`, `#84`, `#122`):**
     - `md.run_actions_param_required`, `md.run_actions_param_undeclared`, `md.cue_library_param_required`, `md.cue_library_param_undeclared` (matched before `/^md\.cue_/`)
     - `md.run_actions_nonlibrary`, `md.include_actions_run_library`, `md.signal_library`, `md.reference_context`
     - `aiscript.run_script_param_required`, `aiscript.run_script_param_undeclared` (`#122`, matched before `/^(aiscript\.|order_param\.)/`)
     - `aiscript.label_duplicate`, `aiscript.resume_label_unresolved` (`#84`, matched before `/^(aiscript\.|order_param\.)/`)
  4. **MD/AI Expression AST Rules (`#78`):**
     - `md.unmatched_else`, `expression-null-safe-exists`, `expression-format-specifier`, `format-arguments-missing`, `expression-text-reference`
  5. **Lua Static Analysis & X4 UI Widget/Table Rules (`#41`, `#86`):**
     - `lua.syntax_error`, `lua.syntax`, `lua.undefined_global`, `lua.global_before_definition`, `lua.globals-order`, `lua.fictional_ui_api`, `lua.helper_cached_at_load`, `lua.restricted_online_call`, `lua.broad_package_path`, `lua.djfhe_internal_require`, `lua.menu_never_opened`, `lua.registrations`, `lua.runtime_scope_unverified`
     - All 15 remaining `x4UiLint.ts` rule codes (`add-table-column-limit`, `table-width-minimum`, `column-index`, `width-after-first-row`, `reserve-scrollbar-no-variable-column`, `column-percentage-total`, `colspan-overrun`, `font-scale`, `rendered-non-ascii`, `button-text-complex-property`, `row-height-budget`, `table-height-budget`, `editbox-height-minimum`, `inline-display`, `same-layer-inline-open`), `x4-ui.verification-gap`, and `x4-ui.analysis-unavailable`
  6. **Extension Manifest & Project Structure (`#33`):**
     - `dep.duplicate`, `dep.missing_content_xml`, `dep.self`, `project.structure`, `md.xsd`
- **Assumptions & authoritative references:**
  - `src/lib/x4RulePack.core.json` (`X4_CORE_RULE_PACK_EXPECTED_SHA256 = 55f96f23783d6b3acfe11b02eb14b9a063818babf21ca87c62adf8f99eca54a7`) remains byte-identical.
  - Exact-code matchers (`Set<string>`) keep unregistered future codes (`x4-ui.future-rule`, `lua.future_rule`, `md_pitfall.future_rule`, `dep.future_rule`, `future.unregistered`) failing closed to `genericGuidance`.
  - `no capability-map delta`; `0` new files and `0` raw `fs.*` writers.
- **Out of scope:** Altering `x4RulePack.core.json`, changing diagnostic severities, or adding HTTP/MCP routes.
- **Risks & rollback:** Rollback target: `2984a5bd0acb839f2a499551a34118b7275aad1c`.

## BASELINE
- **Revision:** `2984a5bd0acb839f2a499551a34118b7275aad1c` (`main == origin/main`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `src/lib/diagnosticExplain.ts`, `src/lib/x4RulePacks.ts`, `src/lib/x4RulePack.core.json`, `src/lib/mdPitfallLints.ts`, `src/lib/projectCrossFileValidation.ts`, `src/lib/aiscriptLint.ts`, `src/lib/luaStaticAnalysis.ts`, `src/lib/x4UiLint.ts`, `src/lib/expressionAst.ts`, `src/server/projectValidation.ts`.
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **Actual bounded changes (`src/lib/diagnosticExplain.ts`):**
  1. Added 10 exact-code `Set<string>` constants and 16 targeted `GUIDANCE` entries covering every shipped validator code across MD variable lifecycle/absence, MD cue triggers/listeners/lookups/action context, MD & AIScript call signatures/purposes/attention labels, MD/AI expression AST rules, LuaJIT syntax/global/runtime rules, calibrated X4 UI widget/lifecycle/gap rules, and extension manifest/folder structure rules.
  2. Expanded `runDiagnosticExplainSelftest()` (`26 -> 28` checks) with both an exhaustive registered-code completeness assertion (`uncoveredCodes.length === 0`) and a negative unregistered-future-code fallback assertion across `x4-ui.future-rule`, `lua.future_rule`, `md_pitfall.future_rule`, `dep.future_rule`, and `future.unregistered`.
- **Deliberately unchanged:** `src/lib/x4RulePack.core.json` (`55f96f23...`), `config/durable-writers.json` (`74f0a969...`), `config/forge-route-dispositions.json` (`00da8941...`), `config/action-receipt-coverage.json` (`dc34d679...`).

## VALIDATE
All required validation gates passed strictly after the final edit:
- `runDiagnosticExplainSelftest()` -> `28/28` PASS (`allPassed: true`).
- Automated validator code-inventory sweep across `mdPitfallLints.ts`, `projectCrossFileValidation.ts`, `aiscriptLint.ts`, `luaStaticAnalysis.ts`, `x4UiLint.ts`, `expressionAst.ts`, and `projectValidation.ts` -> `missingConcreteCodes: 0 []`.
- `npx eslint src/lib/diagnosticExplain.ts` -> exit `0` (`0` errors, `0` warnings).
- `npm run typecheck` (`task-15361`) -> exit `0`.
- `npm run lint -- --max-warnings 600` (`task-15361`) -> exit `0` (`0` errors, `579` pre-existing warnings).
- `npm run test:writers` (`task-15361`) -> exit `0` (`30/30 + PASS + 8/8`).
- `npm run test:oracles` (`task-15361`, `X4_*` env unset) -> exit `0` (`134/134` oracles PASS, `/agent/diagnostic-explain-selftest 28/28`).
- `npm run test:routes` (`task-15361`, `X4_*` env unset) -> exit `0` (`804/804 PASS`).
- `npm run precommit:check` (`task-15361`, `X4_*` env unset) -> exit `0` (`[precommit] OK`).

## REVIEW & 3-UNIT RELEASE READINESS REVIEW (`0.0.97`)
- All 6 diagnostic rule families covered with exact matchers + negative fallback preserved: **Done and evidenced**.
- **3-Unit Release Readiness Review (`Unit 55` `60b3bbf`, `Unit 56` `2984a5b`, `Unit 57`; `3` verified units ahead of `0.0.96`):**
  - Dev source, `134/134` oracles, `804/804` routes, `test:writers`, `test:capabilities`, `test:action-receipt-coverage`, and `precommit:check` are green.
  - **QUALIFIED** to execute the `0.0.97` pre-bump clean-tree gates (`typecheck`, `test:routes`, prod `oracle-sweep.mjs`, `153`-test `npm run test:e2e`), package & byte-inspect `x4-forge-studio-0.0.97.vsix`, publish to Open VSX (`x4forge/x4-forge-studio`) + GitHub Release `v0.0.97`, qualify installed `0.0.97` inside `FORGE DEVELOPMENT` (`Antigravity IDE 1.107.0` including real `--extensionTestsPath` Go to Definition replay for `#125` & `#126`, `#68` write recovery, `#107` cue property path, `#75` scratch Directory Settings, and `#60` nested keyed lookups), and close fully delivered issues!

## CLOSE
- **Status:** `VERIFIED`
- **Suggested commit title:** `feat(diagnostics): complete deterministic explain guidance across MD, AIScript, Lua, X4-UI, and manifest rules (#33, #74)`

## AAR
- **Triggers:** Triggered once during pre-edit audit — initial PowerShell double-quoted regex hit `Missing ] at end of attribute or type literal` (`step 15329`) before switching to a single-quoted `@' ... '@` PowerShell here-string (`step 15333`). All production edits, selftests, lint, typecheck, oracles, routes, and precommit passed on the first attempt.
- **Sustain:** Running a programmatic code-inventory sweep across all 7 validator modules before editing caught both `format-arguments-missing` (`expressionAst.ts:16`) and all 15 `x4UiLint.ts` rule codes, achieving `missingConcreteCodes: 0` on the first run while keeping `diagnosticExplain.ts`'s import graph untouched.
- **Improve work/approach:** Always pipe multi-line JS/regex probes via single-quoted `@' ... '@ | node --import tsx --input-type=module -` in PowerShell.
- **Improve tools:** `No evidenced risk delta`.
