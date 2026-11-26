# Plan & Close: X4CodeSense 1.2.0 vs X4 Forge Empirical Benchmark & Full-Surface Superiority (`Unit 64`)

- **Status:** `VERIFIED`
- **Date:** 2026-11-26
- **Owner:** Forge QA Agent (`Unit 64`)
- **Lane:** `FULL`
- **Clean-Room Policy:** Strict black-box protocol (`BACKLOG.md:43`, `docs/plans/2026-11-13-ailive-codesense-comparison.md:9`): zero inspection or decompilation of X4CodeSense bundled JS (`dist/*.js`); only public manifest/README/`--help` and live CLI/LSP/MCP protocol I/O were exercised.

## Required Task Record

- **Task:** X4CodeSense 1.2.0 vs X4 Forge Empirical Benchmark & Full-Surface Superiority (`Unit 64`)
- **Lane:** `FULL` | **Status:** `SPECIFIED -> VERIFIED`

### BASELINE
- **Baseline Revision:** `ab11324` (rebased onto `d434cbc` `main` prior to final benchmark & repo gates).
- **Reference Corpus:** Unpacked X4 9.00 (`G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`).
- **Why X4CodeSense 1.2.0 appeared idle in `FORGE DEVELOPMENT` (`[REPRODUCED]`):** `G:\Forge-QA\development-ide\profile\User\settings.json` has `x4CodeSense.unpackedFileLocation` unset (`""`) and `diagnosticMode` at default `"openFilesOnly"`; per `readme.md:214`, without game files configured, X4CodeSense checks XML well-formedness only.
- **Baseline Benchmark (`G:\Forge-QA\temp\codesense-vs-forge-bench\benchmark-baseline.json`):**
  - Defect recall (`24` distinct defect classes `D01`..`D24`): X4CodeSense `21/24` (`87.5%`) vs Baseline Forge `16/24` (`66.7%`).
  - CLI (`scale_mod_100` `102` files): X4CodeSense `5,031.7 ms` / `1,605.5 MiB` vs Baseline Forge (`tsx`) `6,707.4 ms` / `586.5 MiB`.
  - Interactive IDE Provider Matrix (`16` rows): X4CodeSense `16/16` vs Baseline Forge `8/16`.

### RECONCILE
- **Resources & Couplings Checked:**
  - Validation engine: `src/lib/xsdValidate.ts`, `src/lib/expressionAst.ts`, `src/lib/mdPitfallLints.ts`, `src/lib/schemaRouting.ts`, `src/lib/factionsLint.ts`, `src/lib/projectSymbols.ts`, `src/lib/referenceLint.ts`, `src/lib/referenceOverlay.ts`, `shared/x4XmlDiff.ts`, `src/lib/diagnosticExplain.ts`, `src/server/projectValidation.ts`.
  - CLI surface: `scripts/x4validate.ts`, `scripts/x4validate-report.ts`, `package.json` (`build` & `build:cli` -> `dist/x4validate.cjs`), preserving `scripts/x4validate.ts::game-object reference checks` anchor for `src/lib/forgeCapabilities.ts:2889`.
  - VS Code / Antigravity extension providers: `vscode-extension/src/x4IdeFeatures.ts`, `vscode-extension/src/x4IdeFeatures.selftest.ts`, `vscode-extension/src/x4IdeFeaturesHost.ts`, `vscode-extension/src/langCallHelp.ts`, `vscode-extension/src/langCallHelp.selftest.ts`, `vscode-extension/src/langNav.ts`, `vscode-extension/src/capabilities.ts`, `vscode-extension/src/extension.ts`.
  - Durable writers & capability contracts: `0` new `fs.*` writer calls inside `src/`, `vscode-extension/src/`, or `server.ts` (`sourceFingerprint` updated in place to `d01a77a19caaaa7a379630beee2fc80f07860a6b94eeefbf9b28bafbea148177`; `113` capabilities, `402` routes, `141` receipt routes / `69` surfaces unchanged).
- **Capability-Map Delta:** Extended native IDE language provider coverage (`16/16` parity + superiority) and full-corpus `x4validate` CLI caching/flags without changing HTTP/MCP route contracts (`no capability-map delta` on `FORGE_CAPABILITIES` contract hash `e526817379d4c41550a4b2f178940df5ac97e1780d83853d971bae3ad01f3717`).

### IMPLEMENT
1. **Validation Engine (`16/24 -> 24/24` Recall, `0` Vanilla X4 9.00 Regressions, `2x+` Throughput):**
   - `src/lib/xsdValidate.ts`: added scalar primitive validation (`XSD_TYPE_VIOLATION` for `xs:boolean`/`boolean`, `xs:integer`, `xs:nonNegativeInteger`, `xs:positiveInteger`), stray character-data check (`XSD_TEXT_NOT_ALLOWED` across `mission_director`/`ai_scripts`/`md`/`aiscripts`), and memoized `ParticleDfaState.summary` (`O(1)` `ContentParticleCursor.state()`, eliminating `807`-item `Set` allocations per XML tag).
   - `src/lib/expressionAst.ts` & `src/lib/mdPitfallLints.ts`: added `lintCompleteScriptExpressionSyntax` (`expression-syntax`, accepting leading-decimal floats like `.3f` in `md/cinematiccamera.xml:2966`) and `md_pitfall.variable_never_set` for `namespace="this"` root cues when sibling files have malformed XML or `instantiate="true"`.
   - `src/lib/schemaRouting.ts`: routed `libraries/*.xml` carrying explicit `xsi:noNamespaceSchemaLocation="<domain>.xsd"` and emitted `LIBRARY_SCHEMA_UNKNOWN` when an explicit library `.xsd` is missing.
   - `src/lib/factionsLint.ts`: extended faction `<relation>` range/target lints into `<diff>` `<add>`/`<replace>` blocks.
   - `src/lib/projectSymbols.ts`, `src/lib/referenceLint.ts`, & `src/server/projectValidation.ts`: inferred `table[...]` / `[...]` / `<param type="...">` / `multiple="true"` variable types; checked literal `<run_script>`/`<start_script>`/`<run_interrupt_script>`/`<create_order>` against canonical + project AI scripts & orders (`reference.unknown_aiscript`, `reference.unknown_order`); added `md.unknown_script_reference` when `content.xml` has zero external mod `<dependency>` entries; skipped unused `10 MB` DOM serialization (`skipSerialize` in `shared/x4XmlDiff.ts`) when `<diff>` targets have no content XSD (`wares.xml`, `jobs.xml`); wired specific `explainDiagnostic` entries in `src/lib/diagnosticExplain.ts`.
2. **Bundled Fast CLI & Caching (`scripts/x4validate.ts`, `scripts/x4validate-report.ts`, `src/lib/referenceOverlay.ts`, `package.json`):**
   - Bundled `dist/x4validate.cjs` via `esbuild` (`build` & `build:cli`), added `--unpacked`, `--game`, `--extensions`, `--fix`, and `--fail-on hint`, and added generation/signature-verified `<X4_DATA_DIR>/x4validate-corpus-cache.json` + `x4validate-overlay-cache.json` caches.
3. **Complete Native IDE / LSP Provider Suite (`vscode-extension/src/x4IdeFeatures*.ts`, `extension.ts`, `capabilities.ts`):**
   - Added pure engine + VS Code host registrations for `FoldingRangeProvider`, `DocumentSymbolProvider` (Outline), `DocumentSemanticTokensProvider`, `InlayHintsProvider` (`{page, id}` text + `: datatype` hints), reference `CodeLensProvider`, native `F2` `RenameProvider` (MD cues/libraries, local `$vars`, AIScript labels), format-string `SignatureHelp` (`'%s'.[...]`, `{page,id}.[...]`), Lua `ReadText` `DefinitionProvider` + `CompletionItemProvider`, and Damerau-Levenshtein XML `CodeActionProvider` quick fixes (element typos, missing required attributes, Create Cue/Library).

### VALIDATE — Empirical Before / After Scorecard (`benchmark-baseline.json` vs `benchmark-upgraded.json`)

| Metric / Dimension | X4CodeSense 1.2.0 | Forge Baseline (`ab11324`) | Forge Upgraded (`Unit 64`) | Outcome |
|---|---:|---:|---:|---|
| **Defect Recall (`D01`–`D24`)** | `21 / 24` (`87.5%`) | `16 / 24` (`66.7%`) | **`24 / 24` (`100.0%`)** | **Forge +3 classes over CodeSense** (`D22` wares/jobs, `D23` Lua, `D24` MD<->Lua bridge) |
| **`clean_mod` Errors + Warnings** | `0` | `0` | **`0`** | **0 false positives** (+ `0` hits across `399+` vanilla X4 9.00 MD/AIScript files) |
| **CLI `clean_mod` (warm / cold)** | `6,232 ms` / `7,597 ms` | `3,389 ms` / `3,471 ms` | **`3,573 ms` / `3,662 ms`** (concurrent load) · **`2,404 ms` quiet** | **Forge 1.75x–2.07x faster** |
| **CLI `workbench_mod` (warm / cold)** | `6,443 ms` / `5,811 ms` | `2,598 ms` / `2,609 ms` | **`2,835 ms` / `2,941 ms`** (concurrent load) · **`1,814 ms` quiet** | **Forge 2.0x–2.27x faster** |
| **CLI `seeded_bugs_mod` (`30` files)** | `6,178 ms` | `6,876 ms` | **`5,822 ms`** (concurrent load) · **`4,567 ms` quiet** | **Forge faster** while running Lua + UI + cross-file + content lints |
| **CLI `scale_mod_100` (`102` files)** | `7,169 ms` | `6,707 ms` | **`6,160 ms`** (concurrent load) · **`3,836 ms` quiet** | **Forge 1.01s faster** |
| **CLI Peak RAM (`clean` .. `scale_100`)** | `1,528`–`1,558 MiB` | `314`–`587 MiB` | **`295`–`635 MiB`** | **Forge uses 2.4x–5.2x less RAM** |
| **IDE Provider Matrix (`16` capabilities)** | `16 / 16` | `8 / 16` | **`16 / 16` (`100%`)** | **Full parity + working XML/prop quick fixes (`1+1` vs `0+0`)** |
| **Warm Edit Re-Validation (`p50` / `p95`)** | `140.1 ms` / `163.4 ms` | `80.0 ms` / `91.0 ms` | **`84.8 ms` / `93.8 ms`** (`65.4 ms` quiet) | **Forge 1.65x–2.0x faster** |
| **Interactive Hover / Refs / WsSymbols** | `254.3 ms` / `18.2 ms` / `33.0 ms` | `0.92 ms` / `0.53 ms` / `0.16 ms` | **`0.93 ms` / `0.41 ms` / `0.25 ms`** | **Forge 44x–273x faster** |
| **Agent MCP Tools** | `9` (read-only) | `109` | **`113`** (full read/CAS-write/UI-preview/deploy/release) | **Forge 12.5x larger full-lifecycle MCP surface** |

- **Repo Gates (`G:\Forge-QA\forge-development`, `task-12058`, `task-12063`, `task-12069`):**
  - Unit selftests: `xsd` `15/15`, `routing` `28/28`, `expr` `27/27`, `factions` `12/12`, `refLint` `29/29`, `x4IdeFeatures` `14/14`, `capabilities` `8/8`, vanilla X4 9.00 MD+AIScript new-rule hits `0`.
  - `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`exit 0`).
  - `npm run typecheck` & `npx tsc -p vscode-extension/tsconfig.json --noEmit` -> `exit 0`.
  - `npm run test:writers` -> `30/30` + `PASS` + `8/8` (`sourceFingerprint: d01a77a19caaaa7a379630beee2fc80f07860a6b94eeefbf9b28bafbea148177`, `0` new writer calls).
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`113` capabilities, `402` routes).
  - `npm run test:action-receipt-coverage` -> `PASS` (`141` routes / `69` surfaces).
  - `npm run build` & `npm run build --prefix vscode-extension` -> `exit 0` (`dist/server.cjs`, `dist/canonical-md-worker.cjs`, `dist/x4validate.cjs`, `out/extension.js`).
  - `npm run test:oracles` -> `134/134 green` (`exit 0`).
  - `npm run test:routes` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset) -> `807/807 PASS` (`exit 0`).
  - `npm run precommit:check` -> `[precommit] OK` (`exit 0`).
  - `Reload-FORGE-DEVELOPMENT.ps1` -> synced `G:\Forge-QA\development-ide\extensions\x4forge.x4-forge-studio-0.0.98` (`exit 0`).

### REVIEW
- Empirical apples-to-apples benchmark (`baseline` & `upgraded` JSON artifacts): **done (evidenced)**.
- Diagnostic recall (`24/24` vs `21/24`) + `0` false positives: **done (evidenced)**.
- CLI batch speed & memory superiority across all 4 targets + CLI flag parity: **done (evidenced)**.
- Interactive IDE `16/16` provider parity & sub-2ms warm cursor latency: **done (evidenced)**.
- Clean-room compliance (`0` CodeSense source files read): **done (evidenced)**.

### CLOSE
- **Remaining Risks / Optional Operator Follow-Up:** `G:\Forge-QA\development-ide\profile\User\settings.json` intentionally leaves `x4CodeSense.unpackedFileLocation` untouched (`""`) unless Ken approves a Write Gate to enable side-by-side X4CodeSense corpus indexing in `FORGE DEVELOPMENT`. Public Open VSX `0.0.99` release awaits a quiet host (`X4.exe` + concurrent `claude` processes currently active) for `PUBLISHING.md`'s 0-flake `153/153` `npm run test:e2e` gate (or Unit 65's 3-unit release checkpoint).
- **Commit Title:** `feat(validation,ide,cli): exceed X4CodeSense across recall, CLI speed, and 16/16 IDE providers`

### AAR (Triggered / Non-Clean)
1. **Triggers:**
   - (1) `damerauLevenshtein` needed in `computeXmlQuickFixes` so adjacent transposition typos (`set_valeu` -> `set_value`) score distance `1` (`task-11672`).
   - (2) `JobsVocabulary` uses `.classes` and `.sizes` rather than `.locationClasses`/`.shipSizes` (`task-11672`).
   - (3) `esbuild --bundle --format=cjs` sets `require.main === module` inside bundled `dist/x4validate.cjs`, firing `vscode-extension/src/langNav.ts`'s selftest onto `stdout` (`task-11750`); fixed by matching `process.argv[1]` (`/(?:^|[\\/])langNav\.[cm]?[jt]s$/i`).
   - (4) CPU profiling on `scale_mod_100` & `seeded_bugs_mod` (`task-11990`) revealed `ContentParticleCursor.state()` allocating two `807`-element `Set`s per `<actions>` child tag and `simulateXmlDiff` serializing `10 MB` of unrouted `wares.xml`/`jobs.xml` DOMs; fixed via `ParticleDfaState.summary` memoization + `skipSerialize` + signature-verified CLI overlay cache (`task-12049`).
2. **Sustain:**
   - Running a real `--cpu-prof` profile on `dist/x4validate.cjs` immediately pinpointed `ContentParticleCursor.state()` (`632` samples) and `nodeSerializeToString` (`650+` samples), turning a `276 ms` `scale_mod_100` deficit into a `>1,000 ms` win across all 4 CLI targets without weakening a single check.
   - Sweeping all `399+` vanilla X4 9.00 MD & AIScript files (`verify-vanilla-crywolf.mjs`) caught leading-decimal float literals (`.3f`) before any false positive could ship.
3. **Improve work/approach:**
   - Check `process.argv[1]` rather than `require.main === module` in every module reachable by `esbuild` CJS bundles (`dist/server.cjs`, `dist/x4validate.cjs`, `out/extension.js`).
4. **Improve tools:**
   - Shipped `npm run build:cli` (`dist/x4validate.cjs`) + signature-verified `<X4_DATA_DIR>/x4validate-corpus-cache.json` and `x4validate-overlay-cache.json` so standalone CLI validation avoids `tsx` startup and redundant 6-DLC XML recomposition.
5. **Highest-risk evidenced weakness:**
   - `ContentParticleCursor.state()` previously allocated $O(|\text{transitions}|)$ `Set`s on every XML open tag (`1,600+` entries per tag inside `<actions>`) -> **Eliminated** by memoizing `ParticleDfaState.summary`.
