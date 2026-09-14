# B119 source-bound ipairs labels

Lane: FULL. Status: PARTIAL; headless source recovery VERIFIED. Goal ACTIVE/PARTIAL; owner issue #41.
Goal: import literal-list tabs without asking the modder to supply iteration counts or labels.
Architecture: extend the existing AST-backed sequence proof and preview-loop specialization.
Tech stack: TypeScript, luaparse, existing layout/evidence/session pipeline.

## Plan and acceptance

- Reuse exact local table alias lineage and whole-source read-only analysis currently inside
  numericExpressionStructureError. Extract shared helpers without weakening existing #sequence tests.
- Prove direct builtin ipairs over dense immutable literal lists (1..16), exact loop binding and
  per-iteration numeric index/string value. No arbitrary Lua execution or alternative renderer.
- Preserve explicit mismatched manual counts as unresolved, rather than partially specializing.
- Allow read-only captured labels in callbacks, but reject writes/shadows and never specialize
  expressions inside nested functions as if they ran in the loop.
- Verify six ordered labels and indexed cells, renamed lists/variables, alias lists, independent
  loops, and unchanged input/source identity. Reject mutation/escape, replaced/shadowed ipairs,
  runtime/sparse/oversize lists, early exits, reassignment and forged metadata.
- Required checks: complete layout owner suite, pipeline/session focused coverage, typecheck/lint,
  unchanged original HUB public projection at two profiles, then rendered follow-through where
  geometry is actually known. Full real-HUB body/y, full E2E, installed/native and three-menu
  fidelity remain required for the goal and are not proved by this unit.
- Evidence: F:/DEV_ENV/X4_Forge/test-results/b119-ipairs-labels-20260914/.
- No server, dependency, schema, spend/network/delete/config/deploy change. No real mod writes.
- Rollback: exact owned-path delta against main3ec189db1e2db9432295082f10c68f8863d47e10;
  preserve all 93 unrelated paths and failed evidence; no broad staging or reset.

## Reconciliation and baseline

Source owners: src/lib/x4UiLayoutProgram.ts and its selftest; existing public EditorSession and
PreviewPipeline tests/probe. No new parser or public proof schema required. Graphify confirms
numericForBindingProofFor feeds normalizePreviewLoops and expandPreviewLoops. Current generic
loops retain unresolved i/name; real HUB lines689-694 uses direct ipairs(TABS) and a read-only
callback capture of name. Source-derived widths already work. Existing old HUB owner fixture
expects unresolved generic cells and must be revised only to the newly source-proven outcome,
retaining equivalent unknown-list coverage.

Alternatives: manual label samples preserve scripting overhead; running Lua violates import
safety; extending the bounded existing proof is selected. No capability-map external write.
Session starts from verified local checkpoint3ec189d, empty index; baseline runner records
source/protected/live hashes and machine state before mutation. Last close committed.

## Execution / close / AAR

Implementation first pass proves all new positive/negative list cases. Full owner suite exposed
a coupled existing defect: findCell overwrites a materialized cell's identity when a different
source expression addresses the same row/column, invalidating earlier operation references.
Reconciled scope includes preserving the first canonical cell identity and normalizing later
operation owner references only AFTER existing causal row/column resolution, while retaining
each operation's source expression/location and facts. No evidence-validator weakening.
Retain duplicate-creator rejection, cross-cell/row tampering, and runtime-list deferred coverage.
Original HUB probe now resolves six labels at both profiles; no rendered/full-menu claim yet.

## Validation and review

- layout-red exit1: four new positive cases failed exactly because no loop/labels were recovered;
  unsafe-list cases retained unresolved behavior. No original product source changed for this run.
- layout-first exit1: new cases pass; old sampled HUB fixture exposed overwritten cell identity.
- layout-owner and layout-final pass after canonical-cell repair. Final layout-complete1007/1007.
- pipeline-complete127/127 and editor-final complete suite PASS; these exercise public surfaces,
  automatic counts without manual state/sample requests, and input immutability.
- types-complete/lint-complete exit0. types-final initially rejected an unnarrowed test descriptor
  union; test now checks status=known before reading value. Product typecheck had already passed.
- hub-final exit0: unchanged original SHA657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F,
  two profiles1920x1080/1 and2560x1440/1.4; six exact label strings, indexes1..6 and widths16percent.
- Independent verify.mjs exit0, verification.json: checks exact counts, input hashes, final owner
  bytes, public HUB labels/indexes/widths and unchanged original source.413 pinned inputs;
  run guards retained50 protected artifacts,4 real sources,19 live files and403 source members.
- Existing ownership/tampering schemas and validators unchanged. Re-read complete owner diff;
  canonical reference normalization occurs only after causal row/column resolution and only when
  source receiver/result/cell references agree. Original operation expressions/locations retained.
- Duplicate creators remain rejected; unknown-list deferred-owner test retained separately.
  Explicit mismatched counts never partially specialize the known source sequence.
- No new screenshot, rendered, installed or native-X4 proof this unit. Current full E2E remains
  pending; historical132/132 predates sequence/numeric/generic-loop changes. No push/install.
- Capability delta: local source-proof/replay now accepts bounded immutable ipairs sequences;
  no external capability-map/issue mutation. Generic helpers, runtime lists and arbitrary Lua
  remain unsupported or sampled; body dispatch and rowH/y geometry are not solved by labels.

## AAR / handoff

Triggered: expected red tests, ownership defect, test type error, missing-path reads and oversized
log output. First new baseline command reported success but file was missing on readback; no writer
was identified. Re-run with immediate file readback succeeded before implementation. Baseline contains
new failure-first tests; product source baseline remains exact parent3ec189d. The claimed .last-run
change was corrected: hash exactly matched prior checkpoint; no external mutation established.

Sustain: real unchanged-HUB probe and full owner suite exposed more than the focused positive case.
Improve approach: inspect hash baselines before inferring external writes; inspect function signatures
before constructing test calls. Improve tools: scalar JSON summaries instead of raw monolithic logs.
Highest-risk evidenced weakness: materialized cell identity overwritten by another proven expression
for the same column. Fixed at the existing owner, with unchanged strict evidence validators and
duplicate/deferred/cross-owner tests. No memory writes; project lessons recorded here.

Next: rendered follow-through of six real HUB tabs, then existing scalar-helper rowH/y and body
dispatch recovery. Full9journeys,3menus/12references,full E2E,installed and native remain open.
Suggested local checkpoint: feat(ui): recover source-bound ipairs labels and preserve cell ownership.
Actual commit outcome authority: test-results/b119-ipairs-labels-20260914/checkpoint/post-commit.json.
