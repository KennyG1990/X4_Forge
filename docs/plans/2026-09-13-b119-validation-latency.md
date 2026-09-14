# B119 shared validation latency

Status: PARTIAL (measured owner; repair not implemented). Lane: FULL. Astra directly; no agents or Git mutations.

## PLAN / acceptance

- Bounded unit: identify the CPU/request owner behind reproduced 5.8–8.25s workspace
  reads in the unchanged complete Lua-file journey, then repair only the measured owner.
- Intent/authority: full goal, original brief, approved canvas-first plan, ADR-F5;
  real Lua canonical, full validation and final original-workspace restoration required.
- Reuse: normal isolated E2E lifecycle, existing projectValidation/schema/reference
  owners and existing test body. No alternate validator, renderer, history or deployer.
- Baseline: HEAD main 93c9af111d63ca77c99dee11f21882c4073bcda6; extensive dirty files
  including server.ts preserved. Previous continuation receipt binds 16 executable pins,
  real-source/protected-file guards, complete red Lua journey and green HUB.
- Runtime: X4 and ports3000/3001/3100/3101/3200/3201 absent at fresh observation.
  Other Node processes are not ours and must not be stopped.
- Scope now: ignored evidence-only preload/run/analyzer scripts, this plan and close
  records. Production files may change only after measured owner and amended contract.
- Instrumentation: same-process Node inspector, no debug listener; periodic CPU profiles
  survive normal harness tree termination. HTTP metadata limited to API path (no query),
  method, status and timing. No headers, bodies, tokens or arbitrary imported Lua execution.
- Risks: instrumentation adds overhead; profiled timing is diagnostic, never acceptance.
  Preload is restricted to API_ONLY server.ts on3201 with harness-owned state. No standing
  configuration, real game/mod/install, external wiki/GitHub/global memory writes.
- Recovery: remove process-local NODE_OPTIONS by ending wrapper; existing harness owns
  process cleanup. Exclusive evidence writes preserve previous artifacts. No dirty rollback.
- Required evidence: test-results/b119-validation-latency-20260913/; source/config pins,
  actual CPU samples, request intervals, structured verdict and lifecycle/guard checks.
- Negative checks: preload no-ops outside exact ephemeral API process; no API policy/test
  assertions/timeouts changed. Required later repair negatives: reference invalidation,
  complete validation, stale/CAS/wrong-workspace refusal; unchanged complete Lua journey
  first-attempt green, all affected owner suites/type/lint. Amend with exact repair first.
- Native/installed/full-suite/release proof not available from this bounded measurement;
  all remain required by the full goal, gameVerified=false.

## RECONCILE

- Graph existing-query vocabulary validation/project/reference/schema/compile/diagnostics
  returned shared server/App/schema owners, but not causal performance evidence. No rebuild.
- server.ts5839 workspace GET reads attached record/head/cached snapshotHash. Save6111
  and compile13543 run the same full validator5872; App background compile400ms and
  inventory500ms overlap autosave300ms. Concurrent durations must not be summed.
- src/server/projectValidation.ts runs real schema, reference, Lua, cross-file and other
  validation layers. schemaRegistry and xsdValidate already cache. referenceCorpus and
  validationRoutes already cache with root/signature keys. Presence does not prove cost.
- Prior recall contains historical corpus-loader requirements, not a measured solution
  for this stall. Current source/handoff are authoritative.
- Approach choice: measure actual API process first; standalone surrogate could miss
  queue owners, and speculative cache/debounce changes could weaken truth. No capability-map delta.

## IMPLEMENT / VALIDATE

- Evidence scripts only: api-profile.mjs/run.mjs/analyze.mjs/save-profile.mjs/query-probe.mjs/
  finalize.mjs. No production, test body, cache-policy, SQL, schema or permission changes.
- Preload syntax and non-server negative passed; no cpu directory created by the negative.
  Actual API process60652 recorded24exclusive profiles without opening a debug port. The
  24segment cap was too short for the entire run: it captured startup/index preparation
  and first workspace save, NOT later authoring/retry CPU. This scope is explicit.
- Wrapper25601 terminal exit1 at09:02:51Z; structured0passed/0failed/1flaky/1bad-result,
  report complete, owned treeGone=true. First attempt120s at spec5034 via4770/3086, after
  8checkpoints through import; retry16checkpoints INCLUDING original-workspace restoration.
  No page errors/failed requests. Parent inspected retry second-export PNG. Finalizer checks
  completed checkpoint local/server equality and all3available exported disk files against
  exact source bytes. Retry success is NOT first-attempt or zero-flake acceptance.
- Real manifest completed08:58:30.167Z, generation1789289577461-7c8d3e0c24,
  1,028,384files /33,206,154,495bytes. Isolated DB:
  C:/Users/Moshi/AppData/Local/Temp/x4forge-e2e-state-57204/data/reference-manifest/index.db.
  No writes to the real corpus; its manifest copy belongs to the completed harness.
- [REPRODUCED] First workspace POST08:58:34.774Z took3651.929ms; event-loop max3667.919ms.
  Of3532.102ms samples under applyWorkspaceMutation, queryReferenceFiles consumed2664ms
  (~75.4%). Chain: computeWorkspaceDiagnostics -> runFullWorkspaceValidation -> reference
  loaders -> queryReferenceManifest -> queryReferenceFiles (src/lib/db.ts470).
  Inclusive descendant durations overlap: do not add them. Existing reference cache remains.
- Read-only SQL EXPLAIN on that exact completed DB shows page queries walking all files
  in the generation and looking up each class. Count also scans the full generation index.
  For path/class-only projection, class-first CROSS JOIN uses existing covering
  idx_reffile_gen_class(generation_seq,class_id), preserving all compared rows/counts:
  corpus304ms ->0.66ms (383rows), aiscripts291ms ->0.30ms (212rows). Broad covering
  projection assets131ms ->40ms, base123ms ->66ms, all95ms ->82ms; q-only332ms ->323ms.
  These are diagnostic single comparisons of a NARROW projection, NOT full-record speed claims.
- [REPRODUCED] Expanding the same prototype to real record columns ran over90seconds
  without completion. No output receipt was written. Owned read-only probe18160 was
  stopped only after exact PID/name/command-line check; wrapper84439 terminal. No DB writes
  or data deletion. Do NOT ship unconditional full-record class-first join.
-22executablepins/36older inputs/4real sources/19protected files+membership and HEAD
  unchanged. db.ts has no Git diff. X4/test/live ports absent at final observation.

## REVIEW / next repaired acceptance contract

- Code-review-excellence manual review caught the crucial projection mismatch: a covering
  key query is not evidence for fetching full records. reviewctl unavailable; not installed.
- SQL policy must preserve every column, exact generation isolation, missing generation,
  all six class filters (single/combined), q wildcard semantics, path ordering, limit/offset,
  parameter binding, NULL schema_role, and orphan-class exclusion. No migration/newindex,
  cache TTL change or delayed validation is authorized by this unit.
- Next bounded experiment: count through class-first existing index; select bounded ordered
  path keys through that covering index, THEN fetch full rows by generation/path primarykey.
  Alternative: use class-first only for a genuinely small result count and preserve original
  broad page plan. This is SPECIFIED exploration, not a verified query implementation.
- Probe the exact full projection including bytes/mtime/hash and broad500k+/all1M cases,
  with an externally bounded child timeout and per-case progress artifacts before running.
  No more unbounded synchronous SQL benchmark. Read-only completed scratch DB is usable;
  don't rescan the whole corpus merely to run EXPLAIN or differential queries.
- Before production edits amend this plan with exact selected query/test files. Required:
  differential full-row/count tests, broad+narrow query plans, freshness/generation refresh,
  existing DB/reference-manifest/reference-corpus/schema/project-validation suites, type/lint,
  and unchanged rendered full Lua journey first attempt green with all16checkpoints. Preserve
  CAS/stale/wrong-workspace guards and full diagnostics; no timing/assertion changes.
- No capability-map delta: diagnostic owner identified, capability not strengthened yet.

## CLOSE / AAR

PARTIAL. Root owner measured; production repair outstanding. Full goal ACTIVE/PARTIAL;
native/installed/three-menu/twelve-reference/full release obligations unchanged.
Evidence: matching test-results receipt.json, save-profile.json, profile-complete.json,
query-probe.json, query-probe-wide.json, final.json and real browser artifacts.
No Git mutation, external wiki/GitHub/global memory or protected writes.
Suggested checkpoint title: test(ui): profile reference-query stalls in Lua authoring.

Triggered AAR: initial test failed/retry green; prototype broad full-field query did not
finish; diagnostic glob/nonexistent fixture/premature output reads and first handoff patch
format failed (recovered without partial writes); profile cap
did not cover later journey. Sustain: exact source pins, real corpus, independent CPU
ownership and SQL plan proof, strict negative/broad checks before production changes.
Improve approach: profile phase-aware rather than exhausting fixed slots on index prep;
test the COMPLETE consumer projection first. Improve tools: all future SQL probes need
external deadlines and per-case durable output; use verified ephemeral.ts, not nonexistent
fixtures.ts. Highest risk: tiny covering-query results can conceal catastrophic full-record
I/O under broad filters. Bounded fix experiment is recorded above. Degradation called;
checkpoint now, fresh goal turn for repair. Lessons banked here; external ledgers untouched.
