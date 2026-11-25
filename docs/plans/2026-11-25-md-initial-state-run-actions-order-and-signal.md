# Unit 56 — Sound MD Initial-State Flow for Value-Returning `<run_actions>`, `<create_order>`, Post-Block `<signal_cue>`, and Positive `@`-Guards (`#129` / `#114`)

Task: Reduce `md.variable_initial_state` false coverage gaps in `src/lib/mdPitfallLints.ts` by (1) crediting `<run_actions ref="..." result="$var"/>` when its unambiguously resolved `purpose="run_actions"` library guarantees `<return value="..."/>` on all paths, (2) crediting unconditional schema-resolved `<create_order name="$var"/>` and `<create_trade_order name="$var"/>` outputs, (3) removing post-block `<signal_cue>` from `OPAQUE_OR_INLINE_ACTIONS` per `md.xsd`, and (4) crediting bare positive null-suppressed truthiness conjuncts (`@$var` / `@$var.prop`) inside `<do_if>` / `<do_elseif>` (`#129`, `#114`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Eliminate four XSD- and engine-provable classes of `md.variable_initial_state` coverage gaps (`SESSION-HANDOFF.md:48` and `#129` `#issuecomment-7104422430` — `<run_actions result>`, `<create_order name>`, `<signal_cue>`, and positive `@$var` / `@$var.prop` branch guards) without weakening soundness:
  1. **Post-block `<signal_cue>` preservation (`src/lib/mdPitfallLints.ts:201`):**
     - Per X4 9.00 `libraries/md.xsd:4282` (*"The signal will be dispatched in the same frame, but only after the current cue actions are completed"*), `<signal_cue>` cannot synchronously execute another cue's actions mid-block.
     - Remove `'signal_cue'` from `OPAQUE_OR_INLINE_ACTIONS` while keeping `'signal_cue_instantly'`, `'reset_cue'`, `'cancel_cue'`, `'include_actions'`, and `'opaque_effect'` opaque/inline so pre-existing `{ kind: 'present' }` facts survive across schema-resolved `<signal_cue>` (both top-level and inside loops).
  2. **Guaranteed `<create_order>` & `<create_trade_order>` `@name` outputs (`src/lib/mdPitfallLints.ts:440-445`):**
     - Extend `findGuaranteedLocalOutputs(action)` (evaluated only under `fact?.knownDeclaration && !action.namespaceURI && !childUnsafe`) to credit `LOCAL_VARIABLE` `@name` on unconditional (`!action.hasAttribute('chance')`) `<create_order>` and `<create_trade_order>` (`common.xsd:23980-24065`).
  3. **Value-returning `<run_actions ref="..." result="$var"/>` (`src/lib/mdPitfallLints.ts:461-497, 608-634, 722-736, 968`):**
     - Add `doesLibraryGuaranteeReturnValue(actionsEl)` checking that every execution path through a `<library purpose="run_actions">` `<actions>` block reaches an unconditional `<return value="<non-empty>"/>` before any valueless `<return/>`, `OPAQUE_OR_INLINE_ACTIONS`, or fallthrough end-of-block (supporting sequential actions and exhaustive unconditional `<do_if>`/`<do_elseif>`/`<do_else>` chains).
     - Index unambiguous `purpose="run_actions"` libraries without `<delay>` (same-script `Lib` and cross-script `md.Script.Lib` when `!hasOmissions && !limited` and neither the script name nor callable name is duplicated) inside `buildMdVariableAvailabilityContext`, and record `guaranteedOutputs?: readonly string[]` on schema-resolved unconditional `<run_actions>` actions whose target library satisfies `doesLibraryGuaranteeReturnValue` and whose `result` is a `LOCAL_VARIABLE`.
     - Credit `fact.guaranteedOutputs` alongside `findGuaranteedLocalOutputs(action)` in `initialAction` (`line 968`), while keeping void/partial-return/delayed/ambiguous/omitted/unresolved/chance-guarded `<run_actions result="$var"/>` conservative!
  4. **Positive `@$var` / `@$var.prop` truthiness conjuncts in `<do_if>` / `<do_elseif>` (`src/lib/mdPitfallLints.ts:367, 423`, `#129` `#issuecomment-7104422430`):**
     - Extend `extractGuaranteedExistenceVars` so bare positive null-suppressed truthiness conjuncts (`@(?:namespace\.)?(\$[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*`, without trailing `?`, `not`, comparisons, `or`, `if/then/else`, `exact`, or `chance`) seed `$var` as `{ kind: 'present' }` inside that `<do_if>` / `<do_elseif>` arm (because an unset variable evaluates `@$var...` to `null`/falsy and cannot enter the branch), while keeping negated `not @$typedOrder.exists`, `@$eqNull == null`, `@$orAt.exists or $Flag`, and `<do_else>` uncredited.
- **Assumptions & authoritative references:**
  - GitHub Issues `#129` (`https://github.com/KennyG1990/X4_Forge/issues/129`) and `#114`.
  - X4 9.00 schemas: `md.xsd:3044-3088` (`run_actions`), `md.xsd:4278-4306` (`signal_cue` vs `signal_cue_instantly`), `common.xsd:23980-24065` (`create_order`, `create_trade_order`), `common.xsd:31463-31510` (`return`).
  - `no capability-map delta`; `0` new raw `fs.*` writers (`src/lib/mdPitfallLints.ts` has `0` writer calls).
- **Out of scope:** Unsoundly crediting `<run_actions result>` when the target library can fall through or `<return/>` without `value`, or crediting single-match `<find_ship multiple="false"/>`.
- **Risks & rollback:** Rollback target: `60b3bbf503dc531b01616482ba953112a7608241`.

## BASELINE
- **Revision:** `60b3bbf503dc531b01616482ba953112a7608241` (`main == origin/main`), clean working tree; Unit 55 `Quality` CI run `45632181973` `SUCCESS` (`7m59s`).

## RECONCILE
- **Resources & callers searched:** `src/lib/mdPitfallLints.ts` (`199-201`, `364-437`, `439-497`, `598-634`, `720-745`, `889-905`, `960-975`, `1084-1099`), `src/lib/xsdValidate.ts` (`buildSchemaIndex` verified `resolved: true, openAttributes: false` on `run_actions`, `create_order`, `create_trade_order`, `signal_cue`, `signal_cue_instantly`), `md.xsd`, `common.xsd`, `#129` comments (`#issuecomment-7104422430`).
- **Capability-map delta:** `no capability-map delta`.
- **Plan changes:** Added item 4 (`@$var` / `@$var.prop` positive truthiness conjuncts in `extractGuaranteedExistenceVars`) to `SPECIFIED` contract during `#129` comment reconciliation prior to final validation.

## IMPLEMENT
- **Actual bounded changes (`src/lib/mdPitfallLints.ts`):**
  1. Removed `'signal_cue'` from `OPAQUE_OR_INLINE_ACTIONS` while retaining `'opaque_effect'`, `'include_actions'`, `'signal_cue_instantly'`, `'reset_cue'`, and `'cancel_cue'`.
  2. Extended `extractGuaranteedExistenceVars` (`line 367` early-exit guard `(!expr.includes('?') && !expr.includes('@'))` and `line 423` conjunct matcher) to recognize bare positive `@(?:namespace\.)?(\$[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*` branch guards alongside `$var?`.
  3. Extended `findGuaranteedLocalOutputs` (`lines 440-445`) to credit `LOCAL_VARIABLE` `@name` on unconditional `<create_order>` and `<create_trade_order>`.
  4. Added `containsValuelessReturnOrInlineAction` + `doesLibraryGuaranteeReturnValue`, indexed unambiguous delay-free `purpose="run_actions"` libraries when `!hasOmissions && !limited`, populated `guaranteedOutputs` on schema-resolved unconditional `<run_actions ref="..." result="$var"/>`, and credited `fact.guaranteedOutputs` in `initialAction`.
  5. Added 3 Unit 56 selftest suites in `runMdPitfallSelftest()` (`121 -> 124` checks) using a dedicated `unit56Schema` without mutating `initialSchema`.
- **Deliberately unchanged:** `config/durable-writers.json` (`50` raw writers, `sourceFingerprint: 74f0a969...`), `config/forge-route-dispositions.json` (`00da8941...`), `config/action-receipt-coverage.json` (`dc34d679...`), and all existing diagnostic severities.

## VALIDATE
All required validation gates passed strictly after the final edit:
- `runMdPitfallSelftest()` -> `124/124` PASS (`allPassed: true`).
- `node --import tsx scripts/diagnostic-source-navigation-selftest.ts` -> exit `0` (`Diagnostic source snapshot: passed, existing AI lint 33/33 passed`).
- `X4_REFERENCE_ROOT=... X4_XSD_PATH=... node --import tsx scripts/claude-validation-matrix.selftest.ts` -> exit `0` (`34/34` PASS).
- `X4_REFERENCE_ROOT=... X4_XSD_PATH=... node --import tsx scripts/validation-noise.selftest.ts` -> exit `0` (`reference 28/28`, `properties 112/112`, `crossFile 124/124`, `42/42` corpus assertions PASS).
- `544`-file official X4 9.00 MD + AIScript corpus sweep (`G:\Forge-QA\temp\unit54-544-corpus-sweep.ts`, `task-15260`) -> exit `0` (`124/124`, `26/26`, `0` false positives in `11.5s`).
- `npx eslint src/lib/mdPitfallLints.ts` -> exit `0` (`0` errors, `0` warnings).
- `npm run typecheck` (`task-15267`) -> exit `0`.
- `npm run lint -- --max-warnings 600` (`task-15267`) -> exit `0` (`0` errors, `579` pre-existing warnings).
- `npm run test:writers` (`task-15267`) -> exit `0` (`30/30 + PASS + 8/8`).
- `npm run test:oracles` (`task-15277`, `X4_*` env unset) -> exit `0` (`134/134` oracles PASS, `/agent/md-pitfall-selftest 124/124`).
- `npm run test:routes` (`task-15277`, `X4_*` env unset) -> exit `0` (`804/804 PASS`).
- `npm run precommit:check` (`task-15277`, `X4_*` env unset) -> exit `0` (`[precommit] OK`).

## REVIEW
- Value-returning `<run_actions>` (same-script & `md.Script.Lib`, direct & exhaustive `<do_if>`/`<do_elseif>`/`<do_else>` returns) + negative fallthrough/void/delayed/duplicate/omitted/chance/no-schema refusals: **Done and evidenced** (`runMdPitfallSelftest`).
- Unconditional schema-resolved `<create_order name>` & `<create_trade_order name>` + negative chance/no-schema refusals: **Done and evidenced**.
- Post-block `<signal_cue>` preservation across top-level actions & loops while `<signal_cue_instantly>`, `<reset_cue>`, `<cancel_cue>`, and `<include_actions>` still clear: **Done and evidenced**.
- Positive `@$var` / `@$var.prop` truthiness conjuncts (`@$areaHoldOrder.exists`, `not @$typedOrder.exists and @$mhOrd.exists`) + negative `not @$typedOrder.exists`, `@$eqNull == null`, `@$orAt.exists or $Flag`, and `<do_else>` refusals: **Done and evidenced**.

## CLOSE
- **Status:** `VERIFIED` (Dev source, `124/124` selftests, `544`-file X4 9.00 sweep, `134/134` oracles, `804/804` routes, `precommit:check` OK; `#129` stays open pending `0.0.97` VSIX delivery & Claude's `x4_ai_influence` readback).
- **Suggested commit title:** `feat(validation): track value-returning run_actions, create_order, signal_cue, and @-guards (#129)`

## AAR
- **Triggers:** Non-clean — (1) expanded `SPECIFIED` contract pre-validation after reading `#129` `#issuecomment-7104422430` (`@$areaHoldOrder.exists`); (2) guessed `xsdSchema.ts` / `schemaValidator.ts` module names in ad-hoc probe before checking `src/lib/xsdValidate.ts` (`buildSchemaIndex`); (3) first `runMdPitfallSelftest` run failed `atGuardXml` (`123/124`) because `extractGuaranteedExistenceVars` had an early-exit `!expr.includes('?')` fast-path at line `367`; (4) first `tsc --noEmit` hit `TS2769` on `new Map([...initialSchema.elements, ...])` until typed as `new Map<string, unknown>([...])`.
- **Sustain:** Reconciling `#129` comment history uncovered the exact `@$areaHoldOrder.exists` / `not @$typedOrder.exists and @$mhOrd.exists` pattern right alongside `<run_actions>`, `<create_order>`, and `<signal_cue>`, and dedicated negative selftests immediately caught the line-367 `!expr.includes('?')` fast-path.
- **Improve work/approach:** Read module imports/exports directly via `read_file` / `git grep` instead of guessing file or export names in one-off `node --import tsx -e` probes.
- **Improve tools:** `No evidenced risk delta`.
