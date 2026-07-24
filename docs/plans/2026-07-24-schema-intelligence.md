# B74 · Schema-driven autocomplete and validation — SPECIFIED 2026-07-24

> **For Agent:** REQUIRED SUB-SKILL: use `executing-plans`; return to `planning` if reconciliation changes this contract.

**Goal:** Turn the configured unpacked X4 XSD grammar and canonical Part 1 reference corpus into one cached engine for cursor-aware completion, hover, and validation, then project it through the existing Forge API and VS Code/Antigravity providers.

**Architecture:** Extend the existing `SchemaIndex`, `scriptProperties`, `langService`, `schemaRegistry`, and project-validation seams. The canonical reference root owns both values and grammar; `xsi:noNamespaceSchemaLocation` selects a schema first, with existing path/root routing as fallback. HTTP is the transport; a standalone LSP is deliberately deferred.

**Tech stack:** TypeScript, Express, fast-xml-parser/xmldom, VS Code extension APIs, existing X4 Forge oracle and integration harnesses.

Task: B74 schema intelligence
Lane: FULL

## PLAN

- **Bounded unit:** schema-model enrichment; cursor-aware XML/expression completion and hover; `/api/reference/complete` and `/api/reference/hover`; existing extension-provider wiring; shared-engine validation for illegal structure, enums, script properties/functions, and canonical IDs.
- **Assumptions:** line/column are zero-based (matching VS Code); explicit `xsi:noNamespaceSchemaLocation` outranks fallback routing; reference-root `libraries/*.xsd` is canonical; `faction.id` is exposed because the corpus documents it.
- **Authoritative references:** configured X4 unpacked reference root; its `libraries/*.xsd`, `libraries/scriptproperties.xml`, base/DLC reference overlays; existing Forge capability map and ADR ledger.
- **In scope:** MD, AI scripts, diff documents, and any document whose declared XSD resolves in the canonical registry; element/attribute/enum/reference completion; datatype-aware script-expression completion/hover; XSD structure errors; semantic-reference warnings with suggestions; cache invalidation on root/XSD changes.
- **Out of scope:** standalone LSP server; XML formatting; project-wide variable-flow analysis beyond local assignments and conservative name-based datatype inference; replacing the schema engine with a native/full third-party XSD runtime; changing vanilla data.
- **Likely files:** `src/lib/xsdValidate.ts`, `src/lib/schemaRegistry.ts`, `src/lib/scriptProperties.ts`, `src/lib/expressionSuggest.ts`, `src/lib/langService.ts`, a new cursor-aware language module under `src/lib/`, `src/server/referenceRoutes.ts`, `src/server/projectValidation.ts`, `server.ts`, `vscode-extension/src/extension.ts`, integration/oracle scripts, `package.json`, durable records.
- **Risks:** false-positive structural errors from X4's context-dependent XSD declarations; keystroke latency; auth regression in attach mode; cache staleness; collision with the uncommitted Part 1 delta. Open VSX publication and updating the installed Antigravity extension to 0.0.32 were explicitly authorized on 2026-07-24; no game/mod-directory write is authorized.
- **Mitigation:** retain over-union semantics where a tag has multiple legal contexts; validate child legality only when the parent model is resolved and closed; allow `xs:any`; use canonical schemas and real-corpus sweeps; pre-index and mtime/signature-cache; keep legacy read-only GET language routes as fallback; preserve all unrelated dirty files.
- **Rollback/checkpoint:** pre-change revision `5b960d10b648fbf2b9bb912da9f451f27940cc01` plus the recorded dirty-file baseline; rollback is removal of B74-only edits, without reverting Part 1 changes. No Git mutation by this task unless Ken explicitly requests it.

## ACCEPTANCE CONTRACT

1. A cursor inside MD `<cue>` receives only schema-legal direct children, including the real cue structural children declared through `md.xsd`/`common.xsd`.
2. Attribute-name completion is schema-derived and required-first; enum values come from restrictions; faction/ware/sector/macro reference attributes use canonical Part 1 IDs.
3. `faction.player.` resolves to datatype `faction` and returns real properties/functions with documentation and return types, including `id`, `relationto`, `primaryrace`, and `knownname` when present in the corpus.
4. `$ship.` uses conservative datatype inference and returns ship/inherited datatype properties; chained return types drive the next segment.
5. `POST /api/reference/complete` and `/api/reference/hover` accept `{path,content,line,column}` and return editor-grade payloads; malformed coordinates/payloads reject cleanly.
6. Existing VS Code/Antigravity completion and hover providers call the new endpoints with document content/cursor and retain a safe legacy fallback when the authenticated POST path is unavailable.
7. Validation emits errors with XSD rule/source citations for illegal child elements, illegal attributes, missing required attributes, and bad literal enums when the rule is deterministic.
8. Validation emits warnings with did-you-mean suggestions for unknown script properties/functions and canonical faction/ware/sector/macro IDs.
9. `common.xsd` includes/imports resolve without unknown-type gaps; `<diff>` documents validate against `diff.xsd` while permitting schema-legal patch payload behavior.
10. Changing the configured reference root or adding/removing/changing a reference-root XSD invalidates the schema/language cache without a process restart.
11. Warm completion is pre-indexed and measured; target p95 is under 100 ms in the local integration harness, with no per-request XSD or scriptproperties parse.
12. Existing `/api/fs/*`, `/api/agent/validate`, project/import/debug-watcher, Part 1 reference endpoints, and legacy language routes do not regress.

## REQUIRED VALIDATION

- Baseline/current: `npm run typecheck`.
- Focused pure oracles for schema model, cursor context, expression datatype chaining, language completion/hover, cache invalidation, and negative payloads.
- `npm run test:routes`, `npm run test:reference-corpus`, `npm run test:reference-api`, and a new authenticated language API integration harness.
- Real-corpus checks against the configured unpacked root: schema count/includes, cue child set, faction property set including `id`, 32 faction reference completions, diff schema selection, and warm latency sample.
- Project-validation fixtures: illegal child, illegal attribute, bad enum, unknown property, unknown faction/ware; each expected severity/code/suggestion.
- `npm run typecheck`, `npm run lint`, `npm run precommit:check`, `npm run test:oracles`, `npm run build`, `graphify update .`.
- `npm run test:e2e` and installed Antigravity completion/hover proof only after the machine-state gate. Visual proof requires the real rendered host.
- **Negative paths:** unknown schema declaration degrades honestly; traversal/raw-reference behavior remains unchanged; missing reference root returns a controlled unavailable response; malformed cursor coordinates return 400; `xs:any` payload is not false-errored.
- **Evidence:** command output; integration summaries; updated `ROADMAP.md`, `SESSION-HANDOFF.md`, capability-map delta, and project/workflow AAR ledgers. Extension-visible proof goes under `vscode-extension/evidence/VALIDATION.md` if run.

## BASELINE

- Revision: `5b960d10b648fbf2b9bb912da9f451f27940cc01` (`feat(reference): Introduce canonical corpus API and validation`).
- Existing changes: Part 1 reference-corpus fixes/harnesses/docs are modified or untracked; preserve them exactly. See `SESSION-HANDOFF.md`.
- Static baseline: `npm run typecheck` passed 2026-07-24.
- Existing capability: 37 canonical `libraries/*.xsd` files observed; schema registry resolves transitive includes; `SchemaIndex` has flattened children/attributes/enums; legacy `/api/agent/lang/*` and extension providers exist; expression completion/lint exists but is not return-type-aware and suppresses dynamic faction IDs.
- Existing limitation: `xsdValidate.ts` explicitly omits sequence/cardinality/choice validation; registry discovery uses a five-minute TTL; project validation uses configured schema paths rather than making the Part 1 reference root the grammar authority.
- Machine/e2e/visual baseline: not run pending the required machine-state answer.

## RECONCILE

- **Reused resources:** `discoverSchemaRegistry`/`expandIncludeChain`, cached `buildSchemaIndex`, `langService`, `expressionSuggest`, `scriptProperties`, `referenceCorpus`, `runProjectValidation`, legacy language routes, extension completion/hover providers.
- **Couplings:** reference-root configuration and invalidation; schema routing and validation; scriptproperty model and reference API; HTTP auth and extension-owned/attach sidecars; diagnostics mapping; oracle discovery and public-route expectations.
- **Presence/absence:** basic schema IntelliSense and expression union completion are present; cursor-aware server requests, datatype return-flow, canonical dynamic-keyword IDs, XSD child errors, patterns/cardinality metadata, reference-root schema authority, and file-signature invalidation are absent.
- **Capability-map delta:** required at close because completion/hover and grammar validation materially extend the authoring surface.
- **Plan changes from reconciliation:** extend rather than replace the existing engine; keep legacy GET routes as compatibility fallback; add reference-root XSD signature invalidation; correct the original false criterion and explicitly expose `faction.id`.

## IMPLEMENTATION TASKS

### Task 1: Enrich the cached schema model

**Files:** modify `src/lib/xsdValidate.ts`; modify `src/lib/schemaRegistry.ts`.

1. Add exported attribute/child/element metadata for type/base/default/pattern/documentation, particle kind, min/max cardinality, and `xs:any` openness.
2. Resolve named simple/complex types, groups, and inheritance through already-expanded include chains while preserving conservative merged definitions.
3. Add deterministic direct-child validation and strict severity mode without weakening existing permissive callers.
4. Add synthetic oracle cases for sequence/choice/all metadata, `xs:any`, illegal child/attribute/enum, and include-derived types.

### Task 2: Make scriptproperties datatype-aware

**Files:** modify `src/lib/scriptProperties.ts`; modify `src/lib/expressionSuggest.ts`.

1. Retain imported dynamic-keyword result types and full inherited property records.
2. Resolve expression chains segment by segment, including selector/function-shaped properties and their return types.
3. Feed canonical dynamic IDs (`faction`, `ware`, sector/macro where applicable) into completion.
4. Preserve warning-only lint behavior and add did-you-mean coverage for functions/properties.

### Task 3: Build one cursor-aware language engine

**Files:** create `src/lib/referenceLanguage.ts`; modify `src/lib/langService.ts` only where shared adapters belong.

1. Parse zero-based cursor context from document text without reparsing XSDs.
2. Select schema by `xsi:noNamespaceSchemaLocation`, then existing path/root routing fallback.
3. Return normalized completion items `{label,kind,detail,insertText,documentation}` for elements, attributes, enums, references, and expressions.
4. Return element/attribute/property/reference hover signatures and documentation.
5. Add pure selftests and warm-cache timing hooks.

### Task 4: Expose authenticated reference endpoints

**Files:** modify `src/server/referenceRoutes.ts`; modify `server.ts`; modify/add route integration harnesses.

1. Add `POST /api/reference/complete` and `/hover`, with bounded payload and coordinate validation.
2. Load canonical corpus and reference-root schema registry once per signature; invalidate on root/XSD changes.
3. Preserve every existing Part 1 route and raw-file containment behavior.

### Task 5: Wire existing extension providers

**Files:** modify `vscode-extension/src/extension.ts`; modify extension selftests/evidence as applicable.

1. Send path/content/zero-based cursor to the POST endpoints with the owned sidecar token.
2. Map normalized kinds, snippets, details, and Markdown documentation into VS Code completion/hover objects.
3. Retain legacy GET behavior for an attached backend without a session token and silent degradation when no backend exists.

### Task 6: Fold strict grammar into project validation

**Files:** modify `src/server/projectValidation.ts`; modify `src/server/validationRoutes.ts` if schema-source ownership requires it; add fixtures/harness assertions.

1. Prefer canonical reference-root schemas for MD/AI/diff validation, with existing configured-schema fallback only when the reference root is unavailable.
2. Enable deterministic strict XSD diagnostics for canonical, resolved rules.
3. Keep semantic property/function/reference findings warning-only and suggestion-bearing.
4. Prove no false errors against representative canonical MD/AI/diff documents before enabling strict checks broadly.

### Task 7: Validate, review, and close

1. Run all declared focused/static/integration/negative/real-corpus gates.
2. Ask the machine-state question before e2e or rendered-host work; run them only if authorized and safe.
3. Perform a complete fresh-eyes diff review against every acceptance item.
4. Update capability map, backlog/roadmap, session handoff, documentation, and triggered AAR ledgers.
5. End with an honest `VERIFIED`, `PARTIAL`, `FAILED`, `BLOCKED`, or `REVERTED` status and a suggested commit title; do not mutate Git unless explicitly requested.

## IMPLEMENT

- Batch 1 complete: enriched `SchemaIndex` metadata and strict child validation; added reference-schema signature seam; retained dynamic scriptproperty result types and inherited property records; added datatype-aware expression state/completion for canonical dynamic IDs, selectors, return types, and conservative `$ship` inference; added `scripts/schema-intelligence-check.ts`.
- Batch 1 correction: the first focused run exposed a dynamic-lookup state bug (`faction.` skipped the required ID position when no canonical values were supplied). Root cause was a fallthrough from pending-selector state into datatype-property completion; fixed with an explicit quiet return.
- Batches 2-3 complete: added `referenceLanguage.ts`; authenticated completion/hover routes; VS Code/Antigravity provider transport; canonical-schema project validation; scriptproperty/reference warning integration; stable real-corpus API harness.
- Fresh-eyes corrections: inherited named simple-type enumerations; removed canonical macro/expression-result truncation; fixed CRLF cursor math; throttled Part 1 corpus signature walks for keystroke latency; deduplicated dual schema paths; extended MD/AI expression reference lint to ware/macro and corrected sector-set ownership.

## VALIDATE

- `npm run test:schema-intelligence` -> 78/78 PASS.
- `npm run test:reference-corpus` -> 10/10 PASS against unpacked 9.00: 32 factions, 1,902 wares, 170 sectors, 6,505 macros.
- `npm run test:reference-api` -> 40/40 PASS on isolated `127.0.0.1:8973`; 37 XSD domains, zero missing MD/common includes, contextual cue children, exactly 32 faction IDs, `faction.id: string`, diff payload, strict errors, warning suggestions, 401/400/403/404 negatives, warm completion p95 2.9 ms.
- `npm run test:routes` -> 16/16 PASS on isolated `127.0.0.1:8971`.
- `npm run test:oracles` -> 100/100 runtime-discovered oracles green on isolated `127.0.0.1:8972` after one red run exposed typed-continuation shadowing and forced correction.
- `npm run typecheck` and `npx tsc -p vscode-extension/tsconfig.json --noEmit` -> PASS.
- `npm run lint` -> exit 0, 0 errors; 430 existing warnings. First run exposed six B74 quote-escape errors, corrected.
- `npm run precommit:check` -> PASS; `npm run build` -> PASS; `graphify update .` -> 2,014 nodes / 4,734 edges / 122 communities.
- `git diff --check` -> PASS; existing LF-to-CRLF notices only.
- Negative/rollback: malformed cursor, unauthenticated POST, traversal, missing file/root, unknown schema, unknown reference/property, `xs:any` diff payload, and self-closing sibling behavior are all covered and green. No rollback was required.
- Reopened validation: Ken rejected partial proof and authorized publishing 0.0.32 to Open VSX, updating Antigravity, and validating the real installed extension against an isolated scratch mod. Full e2e remains frozen while X4 is running because it swaps the live server workspace and is not needed for this isolated editor proof.

## REVIEW

- 1 contextual cue children -> done, real-corpus HTTP evidence.
- 2 attributes/enums/reference IDs -> done, schema model + 32-ID faction attribute evidence; all macro results no longer truncated.
- 3 `faction.player.` including real `id`/functions/docs/types -> done; endpoint and hover evidence.
- 4 `$ship.` and return/continuation chaining -> done; production-corpus expression oracle 17/17.
- 5 authenticated HTTP completion/hover + negative payloads -> done.
- 6 existing extension providers -> implemented and extension typechecked; rendered host proof unavailable.
- 7 deterministic cited XSD errors -> done for illegal child/attribute/required/enum/fixed; patterns retained in the model and only enforced when the caller explicitly proves JS/XSD regex compatibility.
- 8 suggestion-bearing semantic warnings -> done for typed properties/functions and faction/ware/macro/sector references.
- 9 common includes and diff.xsd -> done; 37 domains, no MD include gaps, diff payload clean.
- 10 root/file cache invalidation -> done through corpus signatures, schema signatures, root-keyed caches, and explicit refresh; synthetic add/remove oracles green.
- 11 keystroke latency -> done, warm p95 2.9 ms.
- 12 regressions -> headless route/oracle/precommit/build gates green; e2e/rendered host remain the named residual.
- Fresh-eyes corrections made before close: inherited base enums; CRLF cursor math; removal of 24/5,000-result caps; overloaded selector preference; literal continuation traversal; MD/AI reference-lint wiring; sector-set ownership; duplicate diagnostics; corpus signature throttling; self-closing tag scanning; shell-free stable harness launches.
- Deliberately deferred: standalone LSP, project-wide variable data-flow, native/full XSD runtime, rendered-host/e2e proof while the game is active.

## CLOSE

- Status: REOPENED from PARTIAL for public-artifact and real rendered Antigravity validation. Final status will be recorded after Open VSX 0.0.32 is installed and exercised in the real host.
- Capability-map delta recorded; B74 moved from BACKLOG to ROADMAP. No vanilla/game/mod/config write, publishing, or Git mutation occurred.
- Suggested commit title: `feat: add schema-driven X4 completion hover and validation`.

## AAR

- Triggers: reconciliation changed architecture; PowerShell/orchestration failures triggered strategic pivot; focused/type/lint/integration/oracle gates failed before corrections; fresh-eyes review forced reimplementation.
- Sustain: one shared schema/scriptproperty/reference engine plus real-corpus HTTP evidence caught cross-layer defects synthetic fixtures missed; stable file-backed Node harnesses made failures reproducible.
- Improve work/approach: inspect full diagnostic payloads, not only pass counts; the first 38/38 run still contained a false self-nesting error. Production-corpus selftests must not encode fixture-only source assumptions.
- Improve tools: use `process.execPath + node_modules/tsx/dist/cli.mjs` for isolated Windows servers; `npx` through `shell:true` emits a security warning, while `npx.cmd` shell-free reproduced `spawn EINVAL`. `reviewctl` remains unavailable.
- Highest-risk evidenced weakness: the validator flattens context-dependent same-name XSD declarations into permissive unions. This prevents cry-wolf errors but cannot enforce full sequence/order/cardinality in every context. Bounded follow-up: add a context-path-aware particle automaton behind corpus-zero-error promotion rather than tightening the flat index.
- Lessons banked to both project and workflow ledgers.
