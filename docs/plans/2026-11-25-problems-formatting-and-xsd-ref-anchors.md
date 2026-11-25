# Unit 51 — Concise Native Problems Formatting & Uppercase `REF_UNKNOWN_*` / `XSD_*` Diagnostic Anchors (`#33`, `#66`)

Task: Eliminate raw serialized `md.reference` / `md.declaration` JSON dumps from native IDE Problems and Studio finding labels while preserving exact occurrence IDs, add exact multiline/CRLF/lone-CR attribute & literal `(line, column)` anchors for uppercase `REF_UNKNOWN_*` and `XSD_*` schema diagnostics, and close rule-guidance fallback gaps (`#33`, `#66`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Close the remaining source-level diagnostic anchor, Problems presentation, and guidance parity gaps across `#33` (including the `#110` installed Problems observation) and `#66`:
  1. **Concise human `sourceRef` projection (`vscode-extension/src/diagnosticsMap.ts`, `src/lib/diagnosticExplain.ts`, `server.ts`):** Parse internal occurrence keys (`md.reference:[...]`, `md.reference_unpositioned:[...]`, `md.declaration:[...]`) so native IDE Problems messages (`MappedDiagnostic.message`) and Studio `PackageDiagnostic.sourceRef` labels display only the human-readable authored call role (e.g. `(signal_cue/@cue)`, `(cue@MyCue)`) or omit unpositioned JSON noise, while preserving ordinary `sourceRef` strings (`faction@bogus`, `$ship.pilot.bogus`) verbatim and retaining the raw `sourceRef` string on `MappedDiagnostic.sourceRef`, `FlatProjectDiagnostic.sourceRef`, and `suppressionScope.sourceRef`.
  2. **Exact multiline / CRLF / lone-CR / BOM `(line, column)` anchors on uppercase `REF_UNKNOWN_*` & `XSD_*` (`src/lib/xsdValidate.ts`, `src/server/projectValidation.ts`):** Upgrade `scanTags` and `scanTagEvents` to track 1-based line and UTF-16 column across `\r\n`, `\n`, and lone `\r` (with leading `\uFEFF` BOM handling), attach attribute-value `(valueLine, valueColumn)` to `REF_UNKNOWN_FACTION`, `REF_UNKNOWN_WARE`, `REF_UNKNOWN_MACRO`, `REF_UNKNOWN_SECTOR`, `XSD_ENUM_VIOLATION`, `XSD_FIXED_VIOLATION`, `XSD_PATTERN_VIOLATION`, and `XSD_TIME_FORMAT`, attribute-name `(line, column)` to `XSD_UNKNOWN_ATTRIBUTE`, and tag-name `(line, column)` to `XSD_UNKNOWN_ELEMENT`, `XSD_MISSING_REQUIRED`, `XSD_ILLEGAL_CHILD`, `XSD_CHILD_ORDER`, and `XSD_CHILD_CARDINALITY`, and forward `column` through `flattenProjectValidationRaw`.
  3. **Rule-specific deterministic guidance parity (`src/lib/diagnosticExplain.ts`):** Extend `GUIDANCE` matchers to cover uppercase `REF_UNKNOWN_*`, `TFILE_*`, `project.unresolved_cue_ref`, and `md.cue_*` without altering `X4_CORE_RULE_PACK` (`55f96f23783d6b3acfe11b02eb14b9a063818babf21ca87c62adf8f99eca54a7`).
- **Assumptions & authoritative references:**
  - GitHub Issues `#33` (`https://github.com/KennyG1990/X4_Forge/issues/33`), `#66` (`https://github.com/KennyG1990/X4_Forge/issues/66`), and `#110`.
  - Zero capability-contract or route-disposition changes (`no capability-map delta`), zero new `fs.*` writers.
- **In scope:**
  - `vscode-extension/src/diagnosticsMap.ts` (+ selftest checks)
  - `src/lib/xsdValidate.ts` (+ selftest checks)
  - `src/server/projectValidation.ts` (+ selftest checks)
  - `src/lib/diagnosticExplain.ts` (+ selftest checks)
  - `server.ts` (`sourceRef` human label projection at `9272`)
- **Out of scope:**
  - Changing `X4_CORE_RULE_PACK` governed hashes or changing warning suppression scope keys (`suppressionScope.sourceRef` must remain byte-identical).
- **Risks & rollback:**
  - Warning review / finding acceptance hashes bind positioned `[line, column]` — improved multiline `REF_UNKNOWN_*` / `XSD_*` coordinates intentionally distinguish multiple findings on multiline tags (explicitly noted in `#66`). Rollback target: `17b78668ff353bcb29335eff9fb83a292784ea16`.
- **Acceptance criteria & validation:**
  1. `npx tsx vscode-extension/src/diagnosticsMap.ts` passes with new positive & negative checks: `md.reference:[...]` renders `(signal_cue/@cue)` without JSON brackets while preserving `MappedDiagnostic.sourceRef`, `md.reference_unpositioned:[...]` appends no JSON suffix, `faction@bogus` remains `(faction@bogus)`, and malformed `md.reference:` degrades safely.
  2. `runXsdValidateSelftest()` and `runProjectValidationSelftest()` prove multiline LF, CRLF, lone-CR (`\r`), and UTF-8 BOM inputs anchor `REF_UNKNOWN_WARE`, `REF_UNKNOWN_MACRO`, `REF_UNKNOWN_FACTION`, `REF_UNKNOWN_SECTOR`, `XSD_UNKNOWN_ATTRIBUTE`, and `XSD_UNKNOWN_ELEMENT` at exact 1-based `(line, column)` and preserve two distinct same-element/multiline `REF_UNKNOWN_WARE` findings through `flattenProjectValidation` and `mapFlatFindings` + `createDiagnosticRangeMapper`.
  3. `runDiagnosticExplainSelftest()` proves `REF_UNKNOWN_WARE`, `REF_UNKNOWN_FACTION`, `TFILE_PAGE_ID`, `project.unresolved_cue_ref`, and `md.cue_duplicate_name` return domain-specific guidance while `XSD_UNKNOWN_ELEMENT` retains governed `x4.schema.routed_validation` provenance.
  4. `typecheck`, `vscode-extension` `tsc`, `lint -- --max-warnings 600`, `test:writers`, `test:oracles`, `test:routes`, and `precommit:check` pass.

## BASELINE
- **Revision:** `17b78668ff353bcb29335eff9fb83a292784ea16` (`main == origin/main`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `vscode-extension/src/diagnosticsMap.ts` (`66`, `105-190`), `vscode-extension/src/extension.ts` (`3149`, `3296`), `src/lib/xsdValidate.ts` (`24-32`, `931-995`, `1086-1344`), `src/server/projectValidation.ts` (`1219-1221`, `1274-1276`, `1289-1296`), `src/server/diagnosticSourceNavigation.ts`, `src/lib/diagnosticExplain.ts` (`67-228`, `304-437`), `server.ts` (`9262-9279`).
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **Actual bounded changes (`8` code/config files):**
  - `vscode-extension/src/diagnosticsMap.ts`: Added `formatDiagnosticSourceRef(sourceRef)` and `MappedDiagnostic.sourceRef`, omitting raw serialized JSON occurrence arrays (`md.reference:[...]`, `md.reference_unpositioned:[...]`, `md.declaration:[...]`) from `MappedDiagnostic.message` while appending concise authored call roles (`(signal_cue/@cue)`, `(cue@DupCue)`), leaving ordinary `sourceRef` labels (`faction@bogus`) verbatim, and retaining raw `sourceRef` on `MappedDiagnostic.sourceRef`. Also extended exact column range mapping to cover `REF_UNKNOWN_*` and `XSD_*` codes (`22/22` selftest checks).
  - `src/lib/diagnosticExplain.ts` & `server.ts`: Exported `formatHumanDiagnosticSourceRef` (wired into `server.ts:9262` `PackageDiagnostic.sourceRef.label` while keeping `suppressionScope.sourceRef` byte-identically raw) and extended deterministic `GUIDANCE` matchers to cover uppercase `REF_UNKNOWN_*`, `TFILE_*`, `project.unresolved_cue_ref`, and `md.cue_*` without touching `X4_CORE_RULE_PACK` (`55f96f23783d6b3acfe11b02eb14b9a063818babf21ca87c62adf8f99eca54a7`) (`25/25` selftest checks).
  - `src/lib/xsdValidate.ts` & `src/server/projectValidation.ts`: Added `column?: number` to `XsdDiagnostic`, upgraded `scanTags` and `scanTagEvents` to use `createSourcePositionLocator(xml)` while preserving both `\r` and `\n` in masked comment/CDATA/PI spans (`s.replace(/[^\r\n]/g, ' ')`), attached exact 1-based `(line, column)` across multiline LF, CRLF, lone-CR (`\r`), and UTF-8 BOM inputs to `REF_UNKNOWN_FACTION`, `REF_UNKNOWN_WARE`, `REF_UNKNOWN_MACRO`, `REF_UNKNOWN_SECTOR`, `XSD_ENUM_VIOLATION`, `XSD_FIXED_VIOLATION`, `XSD_PATTERN_VIOLATION`, `XSD_TIME_FORMAT`, `XSD_UNKNOWN_ATTRIBUTE`, `XSD_UNKNOWN_ELEMENT`, `XSD_MISSING_REQUIRED`, `XSD_ILLEGAL_CHILD`, `XSD_CHILD_ORDER`, and `XSD_CHILD_CARDINALITY` (`13/13` selftest checks), and forwarded `column` in `flattenProjectValidationRaw` (`projectValidation.ts:1220,1276`).
  - `src/server/diagnosticSourceNavigation.ts` & `scripts/diagnostic-source-navigation-selftest.ts`: Wired `REF_UNKNOWN_*` and `XSD_*` (excluding synthetic `post-apply.*`) into `bindDiagnosticSourceFiles` so Studio `Open source` and imported `nodeId` graph navigation resolve on `XSD_*` and `REF_UNKNOWN_*` findings (`33/33` selftest checks).
  - `config/durable-writers.json`: Updated `sourceFingerprint` in place to `74f0a969e78384f1531772240177506b49893797e395506ac78213dfa7a4c9e0` (`50` raw writers unchanged).
- **Post-lock scope adjustments:** Added `src/server/diagnosticSourceNavigation.ts` + `scripts/diagnostic-source-navigation-selftest.ts` and `config/durable-writers.json` `sourceFingerprint` sync so exact `REF_UNKNOWN_*`/`XSD_*` positions also flow end-to-end into Studio source/graph navigation and pass the writer-fingerprint gate.

## VALIDATE
- `npx tsx vscode-extension/src/diagnosticsMap.ts` -> `22/22 allPassed=true` (`0`)
- `npx tsx scripts/diagnostic-source-navigation-selftest.ts` -> `33/33 passed` (`0`)
- `npm run typecheck` -> `0` errors; `npx tsc -p vscode-extension/tsconfig.json --noEmit` -> `0` errors
- `npm run lint -- --max-warnings 600` -> `0` errors, `578` warnings (`<= 600` CI limit)
- `npm run test:writers` -> `30/30 + PASS + 8/8` (`0`)
- `npm run test:action-receipt-coverage` -> `141/69 PASS` (`0`)
- `npm run test:oracles` (`X4_*` env unset) -> `134/134 PASS` (including `diagnostic-explain-selftest 25/25`, `xsd-model-selftest 13/13`)
- `npm run test:routes` (`X4_*` env unset) -> `801/801 PASS`
- `npm run precommit:check` -> `[precommit] OK`

## REVIEW
- Concise `sourceRef` projection without JSON noise while keeping `MappedDiagnostic.sourceRef` & `suppressionScope.sourceRef` byte-identical -> **Done and evidenced** (`diagnosticsMap.ts` `22/22`, `server.ts:9262`).
- Exact multiline LF, CRLF, lone-CR (`\r`), and BOM `(line, column)` anchors for `REF_UNKNOWN_*` and `XSD_*` + source navigation binding -> **Done and evidenced** (`xsdValidate.ts` `13/13`, `diagnostic-source-navigation-selftest.ts` `33/33`, `projectValidation.ts`).
- Rule-specific deterministic guidance parity for `REF_UNKNOWN_*`, `TFILE_*`, `project.unresolved_cue_ref`, and `md.cue_*` with untouched `X4_CORE_RULE_PACK` hash -> **Done and evidenced** (`diagnosticExplain.ts` `25/25`).
- Public `0.0.95` VSIX packaging & installed `FORGE DEVELOPMENT` verification -> **Next immediate gate** (Unit 51 triggers the 3-unit `0.0.95` release review & publication).

## CLOSE
- **Status:** `VERIFIED` (Dev source, selftests, `134/134` oracles, `801/801` routes, and `precommit:check` green; public `0.0.95` VSIX packaging + installed `FORGE DEVELOPMENT` verification runs immediately next).
- **Remaining risks / deferred work:** Prior warning acceptances keyed on legacy element-level `REF_UNKNOWN_*` / `XSD_*` lines intentionally require re-review when multiline tags emit per-attribute `(line, column)` anchors (noted in `#66`).
- **Suggested commit title:** `fix(diagnostics): concise Problems sourceRefs and exact XSD/REF positions (#33, #66)`

## AAR
- **Triggers:** (1) `src/lib/xsdValidate.ts` is tracked by `config/durable-writers.json` (`mkdtempSync`/`writeFileSync`/`rmSync` in its selftest), requiring an in-place `sourceFingerprint` update (`74f0a969...`); (2) added `src/server/diagnosticSourceNavigation.ts` binding so exact `REF_UNKNOWN_*` and `XSD_*` coordinates also drive Studio source/graph navigation.
- **Sustain:** Reusing `createSourcePositionLocator(xml)` with `s.replace(/[^\r\n]/g, ' ')` eliminated lone-CR (`\r`) line-break drift cleanly across both `scanTags` and `scanTagEvents`, while separating human `sourceRef` display labels from raw `suppressionScope.sourceRef` preserved exact suppression and occurrence hashes.
- **Improve work/approach:** Check `config/durable-writers.json` membership up front during `RECONCILE` whenever editing files with embedded selftest temp directories (`src/lib/xsdValidate.ts`).
- **Improve tools:** `durable-writer-audit.mjs` immediately caught the `sourceFingerprint` drift with an exact SHA-256 diff.
- **Highest-risk evidenced weakness:** Masking comments/CDATA via `s.replace(/[^\n]/g, ' ')` silently collapses classic lone-CR (`\r`) line breaks into spaces; fixed in `src/lib/xsdValidate.ts` by preserving `[^\r\n]`.
- **Lessons banked:** Updated `SESSION-HANDOFF.md` with new `sourceFingerprint` (`74f0a969...`) and Unit 51 verification summary.
