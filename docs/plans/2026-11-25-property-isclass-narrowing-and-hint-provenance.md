# Unit 60 — General `isclass` Branch & Conjunction Narrowing, Multi-Segment Hint Provenance, and Declaration Masking (`#80`)

Task: Generalize positive `isclass.<datatype>` narrowing across `<do_if>`, `<do_elseif>`, and top-level `and`-conjunctions in MD & AIScript, preserve producer-hint `typeContext` across multi-segment `$var` chains, mask declaration `@name`/`@id` attributes, and resolve mixed-case local `<cue>` roots
Lane: FULL | Status: SPECIFIED -> VERIFIED

## PLAN

- **Bounded unit:**
  1. **Declaration-attribute masking (`maskNonExpressionSpans` in `src/lib/scriptProperties.ts`):**
     - Mask non-expression identifier `@name` on `<mdscript>`, `<aiscript>`, `<cue>`, `<library>`, `<param>`, `<order>` (and `@id` on `<order>`) at original source widths so dotted script names such as `<aiscript name="player.interaction.budget">` are never scanned as `player.*` property chains while `<set_value name="player.target.$mark"/>` remains checked.
  2. **Mixed-case local `<cue>` root resolution (`lintScriptPropertyChains` in `src/lib/scriptProperties.ts`):**
     - Collect declared `<cue name="...">` names in well-formed `<mdscript>` documents; when a bare non-`$` root identifier is mixed-case (`rootRaw !== rootLower`) and matches a declared local `<cue name="...">`, resolve it against `{ kind: 'datatype', name: 'cue' }` (when `cue` is in `index.model.datatypes`, otherwise skip conservatively) instead of colliding with lowercase keywords such as `gamestart` (`Gamestart.state == cuestate.complete` in `md/x4ep1_pirates_subscriptions.xml`).
  3. **General positive `isclass.<datatype>` branch & `and`-conjunction narrowing (`src/lib/scriptProperties.ts`):**
     - Generalize `npcGuardReadSpans` to `collectXmlIsClassGuardSpans`:
       - Support well-formed `<mdscript>` and `<aiscript>` documents (without foreign `xmlns`).
       - Support both `<do_if>` and `<do_elseif>` elements inside `<actions>` ancestors when attributes are strictly in `POSITIVE_GUARD_ATTRIBUTES` (`value`, `chance`, `weight`, `comment`) and `value` matches `^@?([A-Za-z_$][\w$.]*)\.isclass\.([A-Za-z_]\w*)$` for a known non-pseudo datatype in `index.model.datatypes`.
       - Narrow contiguous synchronous read-only child prefixes (`<debug_text>` `@text`, `<set_value>` `@exact` on a plain `$var` without `operation` — halting subsequent narrowing if `@name` overwrites the guarded root variable — and `<substitute_text>` `@source` + `<replace>` `@string`/`@with` on a plain `$var` `@text`), stopping at any mutating, async, nested-block, or unknown element.
     - Add `collectExpressionAndIsClassGuards(masked, index)` so top-level `and`-conjunctions (with zero top-level `or` operators) narrow subsequent conjuncts after a positive `<receiver>.isclass.<datatype>` conjunct (`md/npc_state_machines.xml:2509`).
     - Apply narrowing only when the guarded receiver's pre-guard datatype shares a root ancestor with `<datatype>` in `index.model.datatypes` (`sharesDatatypeRoot`), or annotate `typeContext: { datatype, confidence: 'guarded' }` when a bare `$var` fails all candidate datatypes inside its guarded span.
  4. **Multi-segment producer-hint provenance (`lintPropertyChains` in `src/lib/scriptProperties.ts`):**
     - When `!nextStates.length` at `segmentIndex >= 1` on a `$var` root with a `knownVariableDatatype(rootRaw, index, opts)` hint, trace the prefix `rootRaw.seg_0...seg_{k-1}` via `traceScriptPropertyExpression` under `{ [rootRaw]: hintRoot }` and report `typeContext = { datatype: traced.resultType, confidence: 'hint' }` (`$s.boardingoperation.attacker`, `$s.cargo.fre`).
  5. **Selftest & X4 9.00 Corpus Verification (`runScriptPropertiesSelftest`):**
     - Expand `runScriptPropertiesSelftest` with positive and negative controls for `<do_if>`/`<do_elseif>` `isclass` narrowing (`npc`, `ship`, `highway` + `<substitute_text>/<replace>`, `<aiscript>`), same-expression `and` vs `or`/`not` guards, root-variable overwrite barrier, multi-segment `'hint'` provenance, `<aiscript name="player.interaction.budget">` masking, and mixed-case `<cue name="Gamestart">` resolution, and replay all `362` MD + `182` AIScript official X4 9.00 files.
- **Assumptions & authoritative references:**
  - GitHub Issue `#80` (`[#74 P0-2] Locate property typos and distinguish declared types from guesses`).
  - Official unpacked X4 `9.00` corpus (`libraries/scriptproperties.xml`, `md/notifications.xml:185`, `md/npc_state_machines.xml:2509`, `md/x4ep1_pirates_subscriptions.xml:172`, `aiscripts/player.interaction.budget.xml:2`).
- **In scope:**
  - `src/lib/scriptProperties.ts`
  - `docs/plans/2026-11-25-property-isclass-narrowing-and-hint-provenance.md`
  - `SESSION-HANDOFF.md`
- **Out of scope:**
  - Escalating `scriptproperty.unknown` from `warning` to `error` (explicitly out of scope per `scriptProperties.ts:20-21` determinism doctrine).
  - Modifying live Forge, `AiLive`, X4 game installation, or saves.
- **Risks and authorization boundaries:**
  - Risk: Over-narrowing across `<do_else>`, `or` disjunctions, negations, mutations, or malformed XML. Mitigation: retain all 11 existing counterexamples in `runScriptPropertiesSelftest:1577-1592` plus new `or`, `not`, `<do_else>`, and root-variable-overwrite negative controls.
- **Rollback/checkpoint:**
  - Clean baseline commit `30970e5e5474cf9675843197f589cb10d6872fca`.
- **Acceptance criteria:**
  1. Positive `<do_if>` and `<do_elseif>` `isclass.<datatype>` guards narrow compatible declared receivers (`player.target.isclass.npc`, `player.target.isclass.ship`, `$killed.zone.isclass.highway`) across contiguous synchronous reads in `<mdscript>` and `<aiscript>`, reporting `confidence: 'guarded'` on typos inside the guarded span and reverting to base type after mutations or outside the branch.
  2. Top-level `and`-conjunctions (`$NPC.assignedcontrolled.parent.isclass.dockingbay and $NPC.assignedcontrolled.parent.dockstate == dockstate.default`) narrow subsequent conjuncts while `or` disjunctions and `not`/comparison negations do not.
  3. Multi-segment hinted `$var` chains (`$s.boardingoperation.attacker`, `$s.cargo.fre` with `$s: 'ship'`) carry `typeContext: { datatype, confidence: 'hint' }`.
  4. `<aiscript name="player.interaction.*">` (`4` vanilla files), `Gamestart.state` (`8` vanilla hits), `md/notifications.xml:187,2867` (`2` vanilla hits), and `md/npc_state_machines.xml:2509,2576` (`2` vanilla hits) are all eliminated on the 544-file X4 9.00 sweep with zero new false positives.
  5. All `runScriptPropertiesSelftest`, `claude-validation-matrix`, `validation-noise`, `typecheck`, `lint`, `test:writers`, `test:oracles` (`134/134`), `test:routes` (`807/807`), and `precommit:check` gates pass.
- **Required validation and negative path:**
  - `runScriptPropertiesSelftest` (including `or`, `not`, `<do_else>`, `<wait>`, `<run_actions>`, root-variable overwrite, and malformed XML negative controls)
  - 544-file X4 `9.00` MD + AIScript sweep
  - `scripts/claude-validation-matrix.selftest.ts` & `scripts/validation-noise.selftest.ts`
  - `npm run typecheck`, `npm run lint -- --max-warnings 600`, `npm run test:writers`, `npm run test:oracles`, `npm run test:routes`, `npm run precommit:check`
- **Evidence locations:**
  - This document (`docs/plans/2026-11-25-property-isclass-narrowing-and-hint-provenance.md`), `SESSION-HANDOFF.md`, and `#80` GitHub comment receipt.

## BASELINE

- **Revision/version:** `30970e5e5474cf9675843197f589cb10d6872fca` (`main`).
- **Existing changes/failures/runtime state:** `git status --short` clean; 544-file X4 9.00 baseline sweep (`task-15793`) shows `95` MD findings (`12` of which are `Gamestart.state` [8], `$killed/$attacked.zone.destination` [2], and `$NPC.assignedcontrolled.parent.dockstate` [2]) and `player.interaction` (`4` in `aiscripts/player.interaction.*.xml`).

## RECONCILE

- **Resources and readers/writers searched:**
  - `src/lib/scriptProperties.ts` (`maskNonExpressionSpans` lines `371-401`, `npcGuardReadSpans` lines `756-787`, `traceScriptPropertyExpression` lines `817-905`, `lintPropertyChains` lines `936-1076`, `runScriptPropertiesSelftest` lines `1248-1614`).
  - `src/server/projectValidation.ts` (`lines 886-913`), `server.ts` (`lines 6443, 7206`), `shared/mdDeclarationResolution.ts` (`parseMdScriptRoot`).
- **Existing capability reused:**
  - `maskNonExpressionSpans`, `traceScriptPropertyExpression`, `lintPropertyChains`, `parseMdScriptRoot`.
- **Couplings checked:**
  - `projectValidation.ts` incremental cache key (`[propertyGeneration, variableTypes, resourceGeneration(schema)]`) operates per file and automatically reflects pure `lintScriptPropertyChains` logic.
  - `directPropertyCorrection` (`line 1034`) remains restricted to `typeContext?.confidence === 'declared' && firstSegment === 0 && !narrowedTarget` so guarded/hinted findings never emit unsafe auto-fixes.
  - `config/durable-writers.json`, `config/forge-route-dispositions.json`, and `config/action-receipt-coverage.json` remain untouched (`no capability-map delta`).
- **Capability-map delta:** `no capability-map delta`.
- **3-strike / hazard-sweep check:** Clean (`0` new writers, pure static analysis).

## IMPLEMENT

- **Actual bounded changes (`src/lib/scriptProperties.ts`, `+374 / -54` lines):**
  1. **`maskNonExpressionSpans`:** Added `NON_EXPRESSION_DECLARATION_NAME_ELEMENTS` (`mdscript`, `aiscript`, `cue`, `library`, `param`, `order`) so declaration `@name` attributes (plus `@id` on `<order>`) are masked with spaces at exact UTF-16 widths while `<set_value name="player.target.$mark"/>` and all expression attributes remain scanned.
  2. **`collectDeclaredMdCueNames` & mixed-case local cue root resolution:** Collected `<cue name="...">` declarations on well-formed `<mdscript>` documents without foreign `xmlns`; mixed-case bare identifiers (`rootRaw !== rootLower`) matching a declared local cue name resolve to `{ kind: 'datatype', name: 'cue' }` without masking lowercase keyword checks (`gamestart.state` still warned).
  3. **`collectXmlIsClassGuardSpans` & `collectConjunctionIsClassGuards`:** Generalized positive `^@?([A-Za-z_$][\w$.]*)\.isclass\.([A-Za-z_]\w*)$` guard narrowing across `<mdscript>` and `<aiscript>`, `<do_if>` and `<do_elseif>` inside `<actions>`, synchronous read-only child prefixes (`<debug_text>`, plain-`$var` `<set_value>` without `@operation` with root-variable overwrite barrier, and plain-`$var` `<substitute_text>`/`<replace>`), and top-level `and`-conjunctions with zero top-level `or` operators (rejecting `or` and `not`), restricted to compatible datatype ancestry (`sharesDatatypeRoot`) or bare `$var` root narrowing with `confidence: 'guarded'`.
  4. **Multi-segment producer-hint provenance:** Extended `lintPropertyChains` so failing segments at `segmentIndex >= 1` on a `$var` root with `knownVariableDatatype` trace `prefix` via `traceScriptPropertyExpression` and attach `typeContext: { datatype: traced.resultType, confidence: 'hint' }` (`$s.boardingoperation.attacker` -> `operation` `'hint'`; `$s.cargo.fre` -> `containercargolist` `'hint'`), keeping `directPropertyCorrection` strictly gated on `confidence === 'declared' && firstSegment === 0 && !narrowedGuard`.
  5. **`runScriptPropertiesSelftest` (`112 -> 119` checks):** Added 7 new assertions covering `<do_elseif>` `zone.isclass.highway` + `<substitute_text>/<replace>` + root-variable overwrite stop, top-level `and` vs `or`/`not` conjunctions, `<aiscript>` declaration masking + `player.target.isclass.ship` narrowing, mixed-case `<cue name="Gamestart">` vs lowercase `gamestart.state`, multi-segment `'hint'` provenance, and incompatible `faction.argon.isclass.npc` refusal.
- **Post-lock contract changes & reason:** None to production code; refined 2 new selftest assertions (`conjunctionFindings[1,2]` carry `$NPC` implicit hint `{ datatype: 'component', confidence: 'hint' }` rather than `undefined`, and `incompatibleGuard` uses declared `faction.argon` rather than undeclared `string` in `SCRIPT_PROPERTIES_FIXTURE`).

## VALIDATE

- **`runScriptPropertiesSelftest` (`task-15859`, `2026-11-25T20:41:45Z`):** `119/119 PASS` (`0` failed).
- **Official X4 `9.00` Corpus Sweeps (`task-15859` base `221` MD + `178` AI; `task-15870` + `task-15877` base+DLC `424` MD + `212` AI = `636` files):**
  - `gamestartStateHits: 0` (down from `8` in `md/x4ep1_pirates_subscriptions.xml`).
  - `aiPlayerInteractionHits: 0` (down from `4` in `aiscripts/player.interaction.{budget,semilegal,trade,userquestion}.xml`).
  - `md/notifications.xml` `zone.isclass.highway` hits: `0` (down from `2` at lines `187, 2867`).
  - `md/npc_state_machines.xml` `parent.isclass.dockingbay and ...` hits: `0` (down from `2` at lines `2509, 2576`).
  - Verified that the `5` remaining base+DLC `.zone.destination` / `.parent.dockstate` hits (`md/rml_barterwares.xml:223` unguarded, `md/setup.xml:421-422` `.issuperhighway` boolean property, `md/x4ep1_mentor_subscription.xml:1694` debug-only `<assert>`) are genuinely unguarded at runtime and rightly NOT over-narrowed.
- **Focused Validation Suites (`task-15868`, `2026-11-25T20:43:21Z`):**
  - `npx tsx src/lib/scriptPropertyTrace.selftest.ts`: `PASS`
  - `npx tsx scripts/claude-validation-matrix.selftest.ts`: `34/34 PASS`
  - `npx tsx scripts/validation-noise.selftest.ts`: `42/42 PASS`
  - `npx tsx scripts/schema-intelligence-check.ts`: `339/339 PASS` (`scriptproperties: 119/119 PASS`)
  - `npx tsx scripts/diagnostic-source-navigation-selftest.ts` (`task-15874`): `33/33 PASS`
- **Static, Audit, Oracle & Route Gates (`task-15863` & `task-15874`, `2026-11-25T20:46:57Z`):**
  - `npm run typecheck`: exit `0`
  - `npx eslint src/lib/scriptProperties.ts`: exit `0` (`0` errors, `0` warnings)
  - `npm run lint -- --max-warnings 600`: exit `0` (`0` errors, `579` warnings)
  - `npm run test:writers`: `30/30 + PASS + 8/8` (`50` raw writers & `sourceFingerprint: 74f0a969...` unchanged)
  - `npm run test:oracles`: `134/134 PASS`
  - `npm run test:routes` (`X4_XSD_PATH` / `X4_REFERENCE_ROOT` unset): `807/807 PASS`

## REVIEW

- Positive `<do_if>`/`<do_elseif>` `isclass` narrowing in `<mdscript>` & `<aiscript>` with `'guarded'` provenance and mutation/overwrite barriers -> **done (evidenced)** (`119/119` selftest + `0` hits in `md/notifications.xml`).
- Top-level `and`-conjunction `isclass` narrowing rejecting `or` and `not` -> **done (evidenced)** (`119/119` selftest + `0` hits in `md/npc_state_machines.xml`).
- Multi-segment `$var` producer-hint provenance (`confidence: 'hint'`) -> **done (evidenced)** (`$s.boardingoperation.attacker` -> `operation` `'hint'`, `$s.cargo.fre` -> `containercargolist` `'hint'`).
- Declaration `@name`/`@id` masking & mixed-case `<cue>` root resolution -> **done (evidenced)** (`gamestartStateHits: 0`, `aiPlayerInteractionHits: 0` across `636` vanilla base+DLC files).
- Fresh-eyes diff review -> **clean**: single-file diff (`src/lib/scriptProperties.ts`), zero auto-fix leakage onto guarded/hinted findings, zero writer/capability churn.

## CLOSE

- **Status:** `VERIFIED` (Dev source, corpus, oracle, and route layers; `#80` GitHub issue kept open through `0.0.98` VSIX + `Antigravity IDE 1.107.0` extension-host Problems/CodeSense verification).
- **Remaining risks / deferred work:** Installed `0.0.98` extension-host Problems diagnostic range & provenance check alongside `X4CodeSense 1.2.0` due on next unit (`Unit 61` -> `0.0.98`).
- **Suggested commit title:** `feat(validation): generalize isclass property narrowing and multi-segment hint provenance (#80)`

## AAR

- **Triggers:**
  1. First `runScriptPropertiesSelftest` run (`step 15819`, `117/119`) exposed two selftest fixture assumptions: `$NPC` matches `<datatype name="npc">` in `knownVariableDatatype` (so rejected `or`/`not` controls carried `typeContext: { datatype: 'component', confidence: 'hint' }` rather than `undefined`), and `SCRIPT_PROPERTIES_FIXTURE` omits `<datatype name="string">` (requiring `faction.argon` for the incompatible-datatype negative control).
  2. One read-only scratch command (`step 15855`) imported `buildScriptPropertiesIndex` (plural) before checking `buildScriptPropertyIndex` (singular).
  3. First `npm run precommit:check` (`task-15907`) hit Windows Node v24.15.0 libuv teardown exit `3221226505` (`0xC0000409`) inside `test:e2e-vite-server` (`profileProxyHttpControls` `AbortController` + `clientRequest.destroy()`) while concurrent `npx tsx` read-only CLI processes were spawning; standalone `npm run test:e2e-vite-server` (`task-15915`) and quiet `npm run precommit:check` passed cleanly. Hazard banked: keep the machine quiet (no parallel `tsx` process spawns) while `precommit:check` runs.
- **Sustain:** Replaying all `636` (`424` MD + `212` AIScript) base + DLC X4 `9.00` scripts proved both that all 4 targeted false-positive families dropped to `0` and that remaining `.zone.destination` / `.parent.dockstate` warnings in `rml_barterwares.xml`, `setup.xml`, and `x4ep1_mentor_subscription.xml` are genuinely unguarded at runtime (e.g. debug-only `<assert>`).
- **Improve work/approach:** Always check exported symbol spelling (`git grep "export function"`) and fixture `<datatype>` presence before writing new selftest assertions or scratch one-liners.
- **Improve tools:** `schema-intelligence-check.ts` now exercises all `119` `scriptproperties` checks (`339/339` total) automatically in CI.
- **Highest-risk evidenced weakness:** `No evidenced risk delta` (all negative controls for `or`, `not`, `<do_else>`, `<assert>`, `<wait>`, `<run_actions>`, and variable overwrite held across `119` unit checks and `636` corpus files).
- **Lessons banked:** In X4 `scriptproperties.xml`, variable names matching a `<datatype name="...">` (such as `$NPC` -> `npc`) receive implicit variable-name datatype hints via `knownVariableDatatype`; test controls using `$NPC` should assert `'hint'` provenance on unguarded paths.
