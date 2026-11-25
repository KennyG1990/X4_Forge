# Unit 61 — Unconditional XSD Value, Group, List, and `substitute_text` Initializer Flow (`#129` / `#114`) + `0.0.98` 3-Unit Release Readiness Review

Task: Credit XSD-proven unconditional Mission Director local initializers (`substitute_text[source]`, `create_position`, `transform_position`, `create_orientation`, `create_list`, `create_group`, `add_to_group`, `get_threat_score`) in `md.variable_initial_state` flow and execute the `v0.0.98` 3-unit release readiness review
Lane: FULL | Status: SPECIFIED -> VERIFIED

## PLAN

- **Bounded unit:**
  1. Extend `findGuaranteedLocalOutputs(action)` in `src/lib/mdPitfallLints.ts` (which runs strictly under `fact?.knownDeclaration && !action.namespaceURI && !childUnsafe` and `!action.hasAttribute('chance')`) to credit the eight XSD-proven unconditional local variable initializers in X4 `9.00` `libraries/common.xsd`:
     - `<substitute_text text="$var" source="...">` (`common.xsd:37586-37635`): credits `LOCAL_VARIABLE` `@text` only when `(action.getAttribute('source') ?? '').trim().length > 0` (omitting `@source` reads `@text` in place and does not initialize an unset variable, while already-`present` `@text` remains preserved).
     - `<create_position>` (`common.xsd:24974-24985`), `<transform_position>` (`common.xsd:24987-25013`), `<create_orientation>` (`common.xsd:24111-24143`), `<create_list>` (`common.xsd:23650-23668`): credit `LOCAL_VARIABLE` `@name`.
     - `<create_group>` (`common.xsd:23631-23648`) and `<add_to_group>` (`common.xsd:20768-20776`, `"the group is created if it does not exist yet"`): credit `LOCAL_VARIABLE` `@groupname`.
     - `<get_threat_score>` (`common.xsd:29748-29760`): credits `LOCAL_VARIABLE` `@result`.
  2. Add positive and negative selftest coverage in `runMdPitfallSelftest` covering `<library purpose="run_actions">` and `instantiate="true"` cues as well as negative controls (`substitute_text` without `@source`, `chance`-guarded initializers, fallible `<create_ship>`, foreign-namespace child, and `schema === null`).
  3. Complete the mandatory **3-Unit Release Readiness Review** for **`v0.0.98`** (Units 59 `30970e5`, 60 `7734959`, and 61).
- **Assumptions & authoritative references:**
  - GitHub Issues `#129` (`#issuecomment` reporting `<substitute_text text="$updated" source="$cur">` inside `purpose="run_actions"` library) and `#114`.
  - Unpacked X4 `9.00` `libraries/common.xsd` (`lines 20768, 23631, 23650, 24111, 24974, 24987, 29748, 37586`).
- **In scope:**
  - `src/lib/mdPitfallLints.ts`
  - `docs/plans/2026-11-25-md-initial-state-xsd-value-and-group-initializers.md`
  - `SESSION-HANDOFF.md`
- **Out of scope:**
  - Crediting fallible spawners (`<create_ship>`, `<create_station>`, `<create_object>`, single-object `<find_*>`) that can leave outputs unset or fail on invalid macro/space inputs.
  - Modifying live Forge, `AiLive`, X4 game installation, or saves.
- **Risks and authorization boundaries:**
  - Risk: Over-crediting in-place `<substitute_text text="$x">` when `@source` is omitted or `@chance` is present. Mitigation: explicitly require non-empty `@source` and `!action.hasAttribute('chance')` plus `fact?.knownDeclaration`.
- **Rollback/checkpoint:**
  - Clean baseline commit `77349593a70e9d36d961acbca12c797cd95cbdce`.
- **Acceptance criteria:**
  1. Unconditional schema-resolved `substitute_text[source]`, `create_position`, `transform_position`, `create_orientation`, `create_list`, `create_group`, `add_to_group`, and `get_threat_score` establish `{ kind: 'present' }` on their `LOCAL_VARIABLE` target across plain cues, `instantiate="true"` cues, and `<library>` blocks.
  2. Negative controls (`substitute_text` without `@source` on an unset variable, `chance`-guarded initializers, `<create_ship>`, foreign-namespace children, and `schema === null`) remain uncredited and report `md.variable_initial_state` coverage gaps.
  3. On the `221`-file official X4 `9.00` base MD corpus, `totalGaps` measurably decreases from `1,771` with `0` `md_pitfall.variable_*` false warnings (`0/636` base+DLC false warnings).
  4. `runMdPitfallSelftest`, `claude-validation-matrix`, `validation-noise`, `diagnostic-source-navigation`, `typecheck`, `lint -- --max-warnings 600`, `test:writers`, `test:oracles` (`134/134`), `test:routes` (`807/807`), and `precommit:check` all pass.
- **Required validation and negative path:**
  - `runMdPitfallSelftest` (positive + negative controls)
  - `221`-file X4 `9.00` MD initial-state before/after comparison (`1,771 -> ...`, `0` false warnings)
  - `claude-validation-matrix.selftest.ts`, `validation-noise.selftest.ts`, `diagnostic-source-navigation-selftest.ts`
  - `npm run typecheck`, `npm run lint -- --max-warnings 600`, `npm run test:writers`, `npm run test:oracles`, `npm run test:routes`, `npm run precommit:check`
- **Evidence locations:**
  - `docs/plans/2026-11-25-md-initial-state-xsd-value-and-group-initializers.md`, `SESSION-HANDOFF.md`, and `#129` GitHub comment receipt.

## BASELINE

- **Revision/version:** `77349593a70e9d36d961acbca12c797cd95cbdce` (`main`).
- **Existing changes/failures/runtime state:** `git status --short` clean; `221`-file X4 `9.00` base MD initial-state survey (`step 16035`) shows `totalGaps: 1771`, `totalWarnings: 0` (including `create_position` `17`, `add_to_group` `17`, `substitute_text` `11`, `get_threat_score` `9`).

## RECONCILE

- **Resources and readers/writers searched:**
  - `src/lib/mdPitfallLints.ts` (`findGuaranteedLocalOutputs` lines `440-459`, `lvalues` & `primitive` lines `534-536`, `buildMdVariableAvailabilityContext` lines `668-745`, `initialAction` lines `919-1035`, `runMdPitfallSelftest` lines `3025-3115`).
  - `src/lib/xsdValidate.ts` (`buildSchemaIndex` verified `found: true, resolved: true, openAttributes: false` for all 8 elements against X4 `9.00` `md.xsd` + `common.xsd`).
  - `src/server/projectValidation.ts` (`lines 947-970`, incremental `pitfalls` fact cache).
- **Existing capability reused:** `findGuaranteedLocalOutputs`, `fact.knownDeclaration`, `buildSchemaIndex`.
- **Couplings checked:**
  - `lvalues` (`line 534`: `['lvalueexpression', 'lvaluename', 'groupname', 'countresult']`) already indexes `@text`, `@name`, `@groupname`, and `@result` in `buildMdVariableAvailabilityContext` (`line 678`), so writer/opaque authority tables already account for all 8 elements without altering derived-fact budgets.
  - `0` new `fs.*` writers; `config/durable-writers.json`, `config/forge-route-dispositions.json`, and `config/action-receipt-coverage.json` remain untouched (`no capability-map delta`).
- **Capability-map delta:** `no capability-map delta`.
- **3-strike / hazard-sweep check:** Clean (`0` new writers, pure static analysis).

## IMPLEMENT

- **Actual bounded changes (`src/lib/mdPitfallLints.ts`, `+75 / -2` lines):**
  1. Added `UNCONDITIONAL_NAME_INITIALIZER_TAGS` (`create_order`, `create_trade_order`, `create_position`, `transform_position`, `create_orientation`, `create_list`) and extended `findGuaranteedLocalOutputs(action)` (invoked strictly under `fact?.knownDeclaration && !action.namespaceURI && !childUnsafe && !action.hasAttribute('chance')`):
     - `create_position`, `transform_position`, `create_orientation`, `create_list` (`common.xsd:23650,24111,24974,24987`): credit `LOCAL_VARIABLE` `@name`.
     - `create_group` (`common.xsd:23631`) and `add_to_group` (`common.xsd:20768`, `"the group is created if it does not exist yet"`): credit `LOCAL_VARIABLE` `@groupname`.
     - `get_threat_score` (`common.xsd:29748`): credits `LOCAL_VARIABLE` `@result`.
     - `substitute_text` (`common.xsd:37586`): credits `LOCAL_VARIABLE` `@text` only when `(action.getAttribute('source') ?? '').trim().length > 0`, keeping in-place `substitute_text` without `@source` uncredited on unset variables while preserving already-`present` variables.
  2. Added `unit61Schema` / `xsdInitXml` positive and negative selftest check in `runMdPitfallSelftest` (`124 -> 125` checks).
- **Post-lock contract changes & reason:** None.

## VALIDATE

- **`runMdPitfallSelftest` (`step 16069`, `2026-11-25T21:12:30Z`):** `125/125 PASS` (`0` failed).
- **Official X4 `9.00` Base MD Corpus (`221` files, `step 16069`):**
  - `md.variable_initial_state` read gaps reduced **`1,771 -> 1,714` (`-57`)** with **`0` `md_pitfall.variable_*` false warnings**.
- **Focused & Full Repo Suites (`task-16072`, `2026-11-25T21:16:57Z`):**
  - `npx tsx scripts/claude-validation-matrix.selftest.ts`: `34/34 PASS`
  - `npx tsx scripts/validation-noise.selftest.ts`: `42/42 PASS`
  - `npx tsx scripts/diagnostic-source-navigation-selftest.ts`: `33/33 PASS`
  - `npx eslint src/lib/mdPitfallLints.ts`: exit `0` (`0` errors)
  - `npm run typecheck`: exit `0`
  - `npm run lint -- --max-warnings 600`: exit `0` (`0` errors, `579` warnings)
  - `npm run test:writers`: `30/30 + PASS + 8/8` (`50` raw writers & `sourceFingerprint: 74f0a969...` unchanged)
  - `npm run test:oracles`: `134/134 PASS`
  - `npm run test:routes` (`X4_XSD_PATH` / `X4_REFERENCE_ROOT` unset): `807/807 PASS`

## REVIEW

- Unconditional schema-resolved `substitute_text[source]`, `create_position`, `transform_position`, `create_orientation`, `create_list`, `create_group`, `add_to_group`, and `get_threat_score` establish `{ kind: 'present' }` across plain cues, `instantiate="true"` cues, and `<library>` blocks -> **done (evidenced)** (`125/125` selftest + `-57` X4 `9.00` MD gaps).
- Negative controls (`substitute_text` without `@source` on unset variable, `chance="50"`, fallible `<create_ship>`, foreign-namespace child, `schema === null`) remain uncredited -> **done (evidenced)**.
- Fresh-eyes diff review -> **clean**: single-file diff (`src/lib/mdPitfallLints.ts`), zero writer/capability churn.
- **3-Unit Release Readiness Review (`0.0.97 -> 0.0.98`, Units 59 `30970e5`, 60 `7734959`, and 61):**
  - Unit 59 (`30970e5`, CI `Quality` `45695354873` `SUCCESS`): `#137` 14-stage workspace replacement persistence telemetry (`stageTimingsMs`, `X-Forge-Workspace-Stage-Timings`, `LedgerRow.stageTimingsMs`) + redundant `beforeWorkspace`/`nextWorkspace` hash elimination (`23/23` kernel, `27/27` workspace receipt service, `807/807` routes).
  - Unit 60 (`7734959`): `#80` general positive `isclass` branch & conjunction narrowing, multi-segment `'hint'` provenance, declaration `@name`/`@id` masking, and mixed-case local `<cue>` root resolution (`119/119` `scriptproperties`, `0` false positives on all 4 targeted vanilla families across `636` X4 `9.00` base+DLC scripts).
  - Unit 61 (this unit): `#129` / `#114` unconditional XSD value, list, group, `get_threat_score`, and sourced `substitute_text` local initializers (`125/125` `mdPitfallLints`, `-57` X4 `9.00` MD gaps).
  - **Verdict:** **QUALIFIED** to execute full `v0.0.98` Playwright E2E + staged runtime audit + VSIX packaging + Open VSX & GitHub Release + installed `FORGE DEVELOPMENT` `Antigravity IDE 1.107.0` verification per `vscode-extension/PUBLISHING.md`.

## CLOSE

- **Status:** `VERIFIED` (`#129` kept open through `0.0.98` VSIX delivery + consumer readback; `0.0.98` release execution immediately next).
- **Remaining risks / deferred work:** Full `153/153` Playwright E2E, VSIX packaging, Open VSX publish, and installed `FORGE DEVELOPMENT` extension-host verification in `v0.0.98`.
- **Suggested commit title:** `feat(validation): credit unconditional XSD value, group, list, and substitute_text initializers (#129)`

## AAR

- **Triggers:**
  1. Two read-only reconciliation probes (`steps 16021` & `16031`) checked `buildSchemaIndex` (`string[]` paths vs inline map) and `lintMdPitfalls` (`variableAvailability` vs `availability`) before reading `projectValidation.ts:963`.
- **Sustain:** Checking `buildSchemaIndex` directly on X4 `9.00` `md.xsd` + `common.xsd` (`step 16047`) confirmed `found: true, resolved: true, openAttributes: false` for all 8 elements before locking the plan, so implementation and `125/125` + `807/807` validation passed on the first attempt.
- **Improve work/approach:** Read caller call-sites (`projectValidation.ts`) before writing scratch reconciliation scripts so argument shapes match on the first run.
- **Improve tools:** `No evidenced tool gap`.
- **Highest-risk evidenced weakness:** `No evidenced risk delta`.
- **Lessons banked:** In `mdPitfallLints.ts`, non-primitive XSD actions (`!primitive.has(tag)`) carry `fact.opaque = true` and rely on `findGuaranteedLocalOutputs(action)` under `fact?.knownDeclaration && !childUnsafe && !chance` to propagate guaranteed local outputs across cues and `<library>` blocks.
