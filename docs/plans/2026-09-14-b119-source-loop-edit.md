# Source-proven loop scalar editing repair

Status: VERIFIED bounded editing repair (initial plan SPECIFIED). Lane FULL. Goal remains ACTIVE/PARTIAL.
Goal: restore direct caption editing on imported menus with automatically proven loops.
Architecture: extend existing layout private issuance and source/CAS editor guards.
Tech stack: TypeScript, existing parser/layout/evidence, Playwright.

## Baseline and reconciliation

HEAD dd0548d8a1385d47f3eb20da981ae3e4fb80dcb8. Previous eight-path close committed
with normal precommit; no push. Preserve 93 unrelated dirty paths. The authorized
failed E2E may update test-results/.last-run.json; do not restore or stage that file.
Current rendered HUB test FAILED 0/1 twice, missing heading text property.
Evidence: test-results/b119-hub-render-20260914/browser-receipt.json and browser/ captures.
Read-only public projection returns locked catalog: old mixed-stream guard rejects all loops.
Browser wording is the locked-catalog branch, not proof of an exception. Prior exception
hypothesis is rejected. Diagnostic receipt label collided with outer wrapper; inner results
are diagnostic only, not an outer lifecycle receipt. Recheck guards independently.

Reuse sourceLoopBindingProofFor, exact private issuance, source edit catalog, CAS/reparse,
source splice transfer and existing rendered HUB journey. Graph orientation identifies
discoverX4UiSourceEdits and layout issuance owners. Capability map read; no external delta write.
Automatic loops now occupy the same ledger as manual preview counts; source edit authority
must distinguish exact proven finite loops from runtime/mismatched counts. Expanded metadata
must remain owner-issued, and repeated loop occurrences must not become direct edit anchors.

## Plan and acceptance

1. Freeze baseline and retain current source-edit suite failures before changing product code.
2. Add failure-first regression for automatic numeric/ipairs loops around a direct heading.
3. Reuse source-loop proof and private issuance to admit exact source-proven loop ledgers.
   Keep unknown/mismatched loops, path inputs, unconsumed samples, stale/forged authority,
   loop-body anchors and structural edits locked. No broad guard deletion or schema weakening.
4. Complete source-edit suite, layout suite, types/lint; verify direct edit changes only its
   literal, reparses and preserves loop count/labels. Negative stale and mismatched inputs required.
5. Rerun unchanged original-HUB browser edit/undo/redo/export/reopen with 3200/3201,
   one worker, per-run outputs; inspect genuine screenshots and cleanup/live/source guards.

Owned product paths: src/lib/x4UiLayoutProgram.ts, src/lib/x4UiSourceEdits.ts,
src/lib/x4UiSourceEdits.selftest.ts. Records: this plan, BACKLOG.md, SESSION-HANDOFF.md,
ROADMAP.md only on an evidenced close. Evidence: test-results/b119-source-loop-edit-20260914/.
No dependency/network/spend/deploy or standing config changes; real mod read-only.
Rollback is exact owned diff against HEAD, preserving failed evidence and unrelated files.
Alternative of disabling automatic loops regresses imports; admitting all manual loops
breaks proof boundaries. Chosen scope allows only independently source-proven counts.
Full tab y/rowH/body, all9 journeys/3menus/12references, full integration/package/native
remain out of this repair and required by full goal. No in-game claim from browser.

## Close and AAR

Reconciliation during validation: baseline source suite reproduced unsafe root deletion
authority for a loop-contained display call. Repair excludes replayed loop streams from
legacy structural authority; existing negative assertion retained unchanged. First new
regression fails on exact expanded metadata correspondence even for an all-applied loop.
Private issuance now also retains actual loop-instantiated input metadata, independently
of output snapshots. All four new caption/inverse/negative families pass first repair.
Full first suite reaches old no-input fixtures whose literal numeric loops now automatically
expand. Change those two fixtures to runtimeCount (not a known finite bound) to retain their
original unproven-input rejection contract; new numeric/ipairs fixtures explicitly cover the
source-proven counterpart. No skip or assertion weakening. Source-level original HUB caption
CAS and inverse pass at both profiles. Rendered follow-through below.

Non-clean: rendered failure and corrected exception
hypothesis; diagnostic wrapper receipt-name collision. Sustain exact source and evidence
guards. Improve: test catalog/edit couplings alongside source recovery; scalar summaries
only for large logs. Highest observed product risk: a successful importer change can lock
an unrelated direct edit through a global preview-input guard.

## Validation / review / close — 2026-09-14 16:32Z

- source-final terminal0: complete170/170 checks plus4 new numeric/ipairs mixed/all-applied
  caption families. Literal-only edit/inverse, retained labels/counts, unrelated bytes,
  stale/copied/mismatched-count refusals; runtime manual-loop and structural negatives pass.
- layout-final terminal0:1007/1007,0skipped. types-final/lint terminal0.
- hub-final terminal0: unchanged original HUB SHA and two profiles; caption CAS/inverse;
  six source labels/counts retained. This is not whole-menu visual proof.
- browser terminal0, first-pass1/1,0failed/flaky/skipped/reporterrors; treeGone=true.
  Same existing HUB test, no test edits/deadline changes. Actual edited/reopened screenshots
  inspected: Text field accepts AI INFLUENCE HUB, canvas/hierarchy update; export/reopen
  retains it. Header-only rendering remains: tab-table y and body are unresolved.
- Independent verify.mjs terminal0 -> verification.json at16:31:28Z checks all6 terminal
  receipts against current413frozen inputs, exact counts, HUB source/labels and cleanup.
  50protected artifacts,4realLua,19live files unchanged. X4absent; only Deckwright3100 remains.
- Re-read complete product/test diff. Source counts come from private exact source snapshot,
  not caller metadata; actual loop-instantiated input metadata is retained independently from
  output; schema/evidence validators unchanged. Literal edit remains byte-local and must
  rediscover its control after reparse. No structural authority added to replayed streams.
- Local capability delta: direct scalars coexist with source-proven loops; repeated loop
  anchors still locked. No external capability-map/GitHub/memory writes.
- AAR: sustain original-source probes and unchanged rendered test; improve cross-owner
  acceptance alongside parser changes. Baseline/source-red/source-first failures retained.
  Highest-risk evidenced weakness addressed by this coupling regression, not relaxed checks.
  A rejected documentation patch attempted delete/add on one path in a single patch; no
  mutation occurred. Reissued as one update after checking unchanged files. Keep writes bounded.
- Commit point: fix(ui): preserve direct caption editing across source-proven loops.
  Seven exact paths; normal precommit hook pending at documentation time. Commit authority
  lives in test-results/b119-source-loop-edit-20260914/checkpoint/{commit-exit,post-commit}.json.
  No push/publication/install. Full integration/installed/native and all broader goal criteria
  remain PARTIAL; next unit is existing rowH/y helper recovery, then runtime body dispatch.
