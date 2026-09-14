# B119 full-record reference query repair

Status: VERIFIED bounded query repair (2026-09-13 09:29Z). Full goal ACTIVE/PARTIAL.
Lane: FULL. Astra directly; no agents/Git mutations.

## Goal / baseline / reconcile

Remove measured reference-query blocking from ordinary UI authoring, while preserving
the entire full-project validation and real Lua journey. Prior measured owner/failed
prototype: docs/plans/2026-09-13-b119-validation-latency.md and matching receipt.
HEAD main93c9af111d63ca77c99dee11f21882c4073bcda6, extensive dirty work untouched.
db.ts remains clean/hash8620B22E99E26DFB242AD7B88C0B87B9AB58C70A7E9145021FAD8DB33E821A2A.
Fresh state: X4 stopped;3200/3201 free; Deckwright3100/PID8256 must be preserved.
Full goal/brief/approved canvas-first plan/ADR-F5 still govern. Cache and indexes already
exist; repair queryReferenceFiles, not caches/validator/schema/permissions. SQL owner is
src/lib/db.ts470; callers referenceManifest -> referenceCorpus/validationRoutes/server.
No capability-map delta until measured repair/acceptance evidence.

## Bounded implementation and acceptance

1. Evidence-only full-record SQL comparison against completed read-only harness DB at
   C:/Users/Moshi/AppData/Local/Temp/x4forge-e2e-state-57204/data/reference-manifest/index.db.
   Compare old query with bounded path-key page + primary-key full-row lookup, class-first
   count. Include narrow corpus/AI and broad assets/base/all1M rows and q-only search.
   Each case in its own20s-deadline child; exclusive per-case evidence before/after.
2. If exact full-row/count parity and broad/narrow bounds pass, modify ONLY
   F:/DEV_ENV/X4_Forge/src/lib/db.ts queryReferenceFiles SQL. No migration/new index or
   schema version bump. Count/page retain generation, all six filters, bound parameters,
   SQL LIKE semantics, stable path order, identical limit/offset clamping and orphan exclusion.
3. Add deterministic regression coverage at
   F:/DEV_ENV/X4_Forge/scripts/reference-query.selftest.ts. Isolated DB, old-query oracle,
   all individual/combined filters, wildcard/injection strings, multiple generations,
   missing generation, pagination, empty/nonempty schema_role, hashes/mtime/bytes, orphan
   classes; capture executed EXPLAIN to prove indexed key page and bounded full-row reads.
   New regression must fail original query on query-plan contract without relaxing parity.
4. Verify original DB/manifest/corpus/schema/project-validation suites, typecheck and
   exact-file lint. Full validator golden result on saved real authoring workspace if
   feasible through existing compiler; same corpus signature/data, no custom validator.
5. Run unchanged complete Lua journey via original isolated harness on3200/3201, no
   profiler and120s unchanged. First attempt green, all16checkpoints, real rendered PNG
   inspection, disk export parity, cleanup+protected hashes required. Keep full-stale/CAS/
   wrong-workspace guard tests. No automatic full-goal/native/package/release claim.

Risks: query planner may still materialize too many full records; broad negative and
external timeout are mandatory. Full-record parity rather than narrow projection is the
oracle. No new external network/spend/config/game/install writes. Scratch DB read-only;
selftests use isolated owned DBs. Rollback: reverse this exact db.ts hunk only, preserve
all earlier dirty work. Evidence root:test-results/b119-reference-query-repair-20260913/.
No native/installed validation available in this unit; all goal obligations remain.

## Implementation / validation / review / close / AAR

Reconciled selection: bounded path-key subquery + primary-key full-row lookup, class-first
count. Read-only full projection (all returned fields) matches original digests for6cases.
Observed original/bounded ms: corpus310.55/28.48,aiscripts293.17/0.95,jobs334.03/326.83,
assets135.31/46.97,base128.93/71.78,all110.41/85.70. All children exit0within20s.
EXPLAIN proves covering-key selection and generation/path point lookup for full rows.
New regression-before exits1 on expected indexed-count contract, after full-row parity
checks pass. Exact23source pins and db-before.ts stored before production edit.
Applied selected SQL change only to queryReferenceFiles (14 added / 5 removed lines).
Existing schema/index definitions, cache identity/freshness, requests and E2E test bodies
are untouched. Independent comparison proves db.ts outside this function byte-identical
to db-before.ts. Used planning, graphify orientation and code-review-excellence; graph
results were generic, so current callers, executed query plans and CPU evidence govern.
reviewctl unavailable; complete production diff and new regression were reviewed manually.

### Validation evidence

Evidence root: test-results/b119-reference-query-repair-20260913/.
Final receipt.json finalized at 2026-09-13T09:29:13.953Z, exit 0.

- Regression: scripts/reference-query.selftest.ts, 238 full-row/count parity cases pass.
  Includes all 64 combinations of six filters, bound injection/wildcard values, generation
  isolation, missing generations, orphan classes, ordering/pagination, bounds, nullable
  schema roles and immediate update visibility. Fractional bounds retain the same SQL
  error. Executed EXPLAIN requires indexed count/key selection and bounded full-row PK
  reads. Original SQL fails that plan assertion after parity passes (regression-before.json).
- Actual production function on the read-only 1,028,384-record manifest matches all six
  original full-result digests: corpus 3.07ms, aiscripts 0.73ms, jobs 337.02ms, assets
  41.95ms, base 67.39ms, all 84.18ms (production-probe.json). These are single comparisons;
  q-only path scanning is not fixed and universal responsiveness is not claimed.
- DB 11/11; reference corpus 16/16; schema registry 13/13; schema discovery 14/14;
  XSD validation 12/12; manifest 8/8; real corpus 14/14; project-validation routing PASS;
  manifest API integration 16/16. Commands, times and exit codes are in checks.json,
  checks-r2.json and receipt.json. Real corpus includes 383 sources / 1,192 jobs.
- Typecheck PASS. Exact-file ESLint PASS, zero errors and eight existing db.ts warnings.
  Initial typecheck failed only in evidence wrapper owners.ts (union access to allPassed);
  corrected by a property-presence guard and rerun. Original failed output retained.
- Original isolated scripts/run-e2e.mjs batch: 14/14, zero failures/flakes/bad results.
  Specs: complete Lua journey, workspace isolation, workspace conflict, project validate,
  continuous validation. Full Lua journey passes FIRST attempt in 57.6 seconds under
  unchanged 120-second limit, all 16 checkpoints including original-workspace restoration.
  Batch took 6.3 minutes including genuine corpus/index preparation. No profiler.
- Existing shared full-validation, stale/CAS, conflict overwrite/recovery, wrong-workspace,
  outside-root rejection and diagnostics tests pass. Optional saved-workspace before/after
  validator golden was not run: compiler helper is private in server.ts; no duplicate
  compiler was introduced. Actual backend validator integration passed instead. This does
  not claim a separate full-validator golden comparison.
- Second-export rendered PNG inspected: actual canvas, hierarchy, inspector and edited
  captions visible; honest Not verified in game status. Overlay reads 60FPS / 2588ms;
  this is not evidence of continuously smooth interaction or a localized stall diagnosis.
  Both downloaded files independently match checkpoint source bytes; all 16 local/server
  workspace states agree; no page errors or failed requests (receipt.json).
- Cleanup PASS: owned stack gone; X4 and ports 3000/3001/3101/3200/3201/8974 absent.
  Deckwright 3100/PID8256 preserved and command-line verified. Final 29 source pins,
  36 older inputs, four real sources, 19 protected files plus membership, and HEAD stable.
  No Git, release, install, real-mod/game/config or external-ledger writes.

### Review / close

All required bounded acceptance criteria are done and evidenced; conditional additional
golden method not performed as explained above. Negative SQL semantics, broad full-record
cost, generation identity, freshness, complete authoring/restoration and teardown reviewed.
No semantic capability-map delta: existing manifest querying is faster, not a new feature.
Rollback remains the exact db.ts hunk plus new selftest, preserving unrelated dirty work.
Status: VERIFIED bounded query repair. Full builder remains ACTIVE/PARTIAL: MENU rendering/
editing, selection continuity, broader scenario/reference census, full E2E/precommit and
packaged/installed/native/public-release gates are not completed by this batch.
Commit point: perf(reference): bound full-record manifest queries (not committed).

### AAR

Triggered: expected red regression, diagnostic wrapper type error, Windows rg path-glob
failure and optional golden-method feasibility reconciliation. No product-test oracle
or deadline was weakened; failed diagnostic outputs remain available.
Sustain: measure the actual full-record consumer, test broad and narrow cases under child
deadlines, then rerun the unchanged complete rendered journey and independently check bytes.
Improve work/approach: include evidence-only TypeScript wrappers in the first type review;
do not conflate a narrow-projection speedup with the production query's full-row cost.
Improve tools: use rg -g for Windows path patterns; guard diagnostic result unions before
reading variant fields. These bounded workarounds are recorded here, not a new subsystem.
Highest-risk evidenced weakness: q-only LIKE still scans paths (~337ms in this probe),
so this repair does not establish general responsiveness. A future bounded experiment
must retain exact LIKE semantics and measure that actual consumer before another change.
Project lesson banked in this plan; external/global ledger writes not authorized this unit.
