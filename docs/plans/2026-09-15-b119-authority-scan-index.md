# B119 source-authority scan index

Lane FULL. Status PARTIAL: implemented/headless and scoped rendered journeys validated;
precise rendered action timing measured; normal precommit passed; full-goal validation pending.
Full visual-builder goal remains ACTIVE/PARTIAL.

## Plan and baseline

Bounded unit: retain an ordered subset of syntax nodes in the existing source-only AST
index for globalAuthorityAvailableAt and numericStandardTablesUnmodified. Both currently
scan every ranged node, although their decisions only inspect AssignmentStatement,
LocalStatement, FunctionDeclaration and CallExpression. Preserve their complete predicates.
The private parser index is keyed by model identity AND exact current source text; this
is not an authority-verdict cache. No public schema, persistence or renderer changes.

Baseline HEAD9eb3561,108dirty/index empty. Preserve earlier helper-return candidate and
all unrelated changes. hub-authority-scan-before passes both real-HUB profiles, source Y
124/171, all823/50/4/19 guards; wall32.271s includes startup/corpus/projections/edit catalog.
Descriptor-copy experiment is rejected: original mean118.61/117.68ms versus134.11/136.48ms.
It passed25controls with0getter calls but was slower. No descriptor change enters product.

## Reconciliation / architecture decision

Reuse NumericExpressionSourceAstIndex, its parser, exact-text invalidation, frozen node
arrays and original scan order from nodesByRange. Existing source proof has several earlier
performance incidents; choose extension of its parser-fact index, not another validator,
result cache or parser. Alternatives: per-query filtering still traverses the whole tree;
caching verdicts changes authority assumptions and is excluded. The selected index removes
only node types for which the current scan bodies cannot reject. Parse errors still refuse.
Existing global writes, local environment replacement, function assignment and rawset/escape
checks run unchanged. No new network/deletion/spending/config surface; no capability-map delta.

## Steps / acceptance

1. Extend the existing metric selftest matrix with harmless literal-node padding, rawset,
   late/nested assignments and environment-shadow cases. Run before the implementation:
   semantics must already pass; this is a performance repair, not changed accepted Lua.
2. Modify only src/lib/x4UiLayoutProgram.ts AST index and the two scan iterators. Use a frozen
   array collected from the same ranged nodes in the same order. Error index uses empty array.
3. Run the full Layout selftest, typecheck and exact-file lint. Repeat guarded real-HUB
   body-probe and require deep equality of all results/read pins/source hashes to baseline.
   Treat wall time as diagnostic only; report no visible speedup before browser measurement.
4. Fresh review against complete scan predicates and old diff. Required downstream freshness:
   SourceEdits, SourceBundle/parser, session/scenario/pipeline, Scene, normal precommit and
   unchanged real-HUB rendered gate remain before candidate checkpoint. Do not increase limits.

Evidence: test-results/b119-drawing-helper-returns-20260915/hub-authority-scan-* and
authority-scan-* logs/receipts. Protected source/corpus/live hashes remain mandatory.
Rollback only this unit's exact index/iterator/test hunks; preserve earlier helper-return work.
No install/native/mod/config/publication/push. No completion claim from headless timings.

## Close / AAR

Pending implementation and validation. Full nine journeys/three menus/twelve references open.

Baseline semantics run1196/1198: the new local-_G refusal expectation was incorrect.
localAstReplacesGlobalEnvironment explicitly recognizes _ENV, not an unrelated local _G;
the fixture never consumes that local _G. Preserve both failures and correct the matrix to
accept unrelated local _G shadowing while requiring _ENV replacement refusal. No production
code changed. This is a test-design correction, not a relaxed authority rule.

Corrected baseline1200/1200PASS. Indexed candidate implemented with both scan predicates
unchanged. Full candidate Layout1200/1200PASS. First real-HUB after26.121s versus32.271s
before; JSON summaries/read pins/source hash byte-identical (CB8C6BC0...C1C614), source Y
124/171 preserved. This is one headless paired diagnostic, not browser responsiveness.
All823/50/4/19 guards pass. Next serial batch: repeat real-HUB, types, two-file lint, parser,
bundle, source edits, session, scenarios, pipeline and Scene using existing guarded runner.
Audited selftest direct writers: only Scene's existing mkdtemp-contained junction fixture,
with both targets beneath its owned temporary root; no real-mod or live-canvas writes.
All other selected tests have no direct filesystem writers. No tests run concurrently.

## Close — PARTIAL, 2026-09-15 06:09Z

PROGRESS. authority-scan-freshness serial10step batch completed05:56:53–06:05:41Z exit0.
Layout1200/1200, parser162/162, SourceBundle, SourceEdits175/175, EditorSession,
PreviewScenarios, PreviewPipeline127/127, Scene196/196(configured real3/3), types and
two-file lint all pass. Repeat headless HUB21.713s; before/after/repeat JSON summary bytes
equal, SHA256 CB8C6BC0EA57C77A04FF0140D43EF39739BE7D205E7C372B08616327C2C1C614.
Timing variance prevents a stable speedup percentage; this is not browser action latency
or complete serialized evidence-pair equality. Every inner823/50/4/19 guard and outer
824/50/4/19 guard passes. Final machineX4absent, Deckwright3100PID61604 only. All jobs
terminal. HEAD9eb3561/109dirty/index empty. git diff --check passes.

Review: original full-scan predicate cases match the four retained types; both consumers
retain all predicates/order. Parse-error refusal and exact-text replacement still apply;
frozen subset is parser data only. Metric mutation/escape/late-write and source-replacement
tests execute. No public-schema or capability-map delta. reviewctl/BlastRadius unavailable;
manual complete new-hunk review and repository gates used. No descriptor change retained.

Required pending: unchanged real-HUB/contextual/history browser acceptance with exact
action spans and screenshot inspection, normal precommit on this candidate, full integration
and packaged/native obligations. Previous4pass/1fail browser result remains authoritative.
Local checkpoint deferred, not pushed. Existing helper-return candidate and96exclusions
preserved; next work measures actual authoring, not more substitute headless counts.

AAR NON-CLEAN: descriptor alternative slower; new negative confused local_G with_ENV and
failed at both scales; corrected from existing owner semantics, originals preserved.
Inspection repeated Windows wildcard/oversized-output friction. Initial handoff update
used unsupported delete+add for one path; apply_patch rejected atomically, then exact whole
file Update succeeded. Sustain: measure before production, exact result equality, independent
negatives and source/live guards. Improve work: distinguish environment binding from a
similarly named variable before asserting refusal. Improve tools: parsed fields/character
bounds, not last-N lines of JSON; one Update operation per file. Highest evidenced weakness:
last actual browser edit remains seconds-long; this candidate lacks fresh UX proof. Next
bounded experiment is unchanged rendered journey, not cached validation verdicts. Lessons
recorded here only; no memory/skill/global-ledger write.

## Rendered acceptance batch — SPECIFIED, 2026-09-15 06:13Z

Previous continuation PROGRESS. Read full goal/current plan/handoff; HEAD9eb3561,
109dirty/index empty unchanged. Quiet/rendered authorization remains; fresh X4absent,
only Deckwright3100PID61604. No concurrent validation process or isolated stack.
Compared all823 pins from helper-return-final-rendered: only LayoutProgram/selftest
(duplicate path spellings) and ignored body-probe callback changed. All E2E tests, shared
fixtures, runners, configuration and direct writer implementations remain byte-identical
to the previous audited run. Selected contextual PNG/JSON, history/profile artifacts,
real-menu captures and exported Lua use test.info().outputPath. Real mod Lua read-only,
source containment/hash asserted; no real-mod/config/install writes or live-canvas use.

Run unchanged seven tests: four contextual insertion/edit/history fixtures, scenario B
across source Undo/Redo, named scenarios, real-HUB edit/export/independent reopen. Existing
scripts/run-e2e.mjs verdict parser and run.mjs guards, ports3200/3201, workers1, diagnostic
instrumentation0. Keep120s HUB deadline and preparation request limits unchanged.
Command: bundledNode run.mjs authority-scan-rendered scripts/run-e2e.mjs
tests/e2e/x4-ui-source-editor.spec.ts --grep
"contextually inserts and edits|keeps scenario B chosen|saves and switches computer-local named|visually edits and reopens real HUB Lua"
--workers=1.

Acceptance: complete verdict7passed/0failed/0flaky, protected823/50/4/19 and workspace
preservation, stack cleanup; inspect fresh canvas images and actual Apply/Undo/Redo trace
spans. Preserve fresh artifacts before another E2E run. A pass is scoped journey proof,
not full-body/instant-feedback/native acceptance. Failure retains original evidence and
returns to diagnosis; no timeout relaxation. No production edits during this batch.

Rendered result06:26Z: authority-scan-rendered PASS7/7 first attempt,0flaky, complete
structured report7terminal,treeGone=true. Run06:13:26–06:26:00Z. HUB finishes within
unchanged120s limit (reporter1.5m). All823/50/4/19guards and before/after machine match.
No production changes this continuation. Inspected fresh alias redo/input recovery and
HUB reopened screenshots: edited text/controls/section survive; Inspect closed. HUB body
remains partial. Frame-stall badges remain visible (HUB reopened17233ms), not a stable FPS
or isolated action-duration measurement. This is not immediate-feedback/native proof.

Evidence limitation: config retains traces only on failure; passing run has no trace.zip.
Runner's temporary JSON report is gone after final verdict; do not invent precise action
times from rounded list-reporter output or checkpoint spans. Before another E2E, preserve
all37 current artifacts recursively from the seven exact test directories (including both
Lua exports and attachments) to authority-scan-rendered-evidence, exclusive copy/hash check.
Reject symlinks/path escapes/stale artifacts; no external output destinations. Use new
ignored save-authority-rendered.mjs, not the older copier that required a failed trace.
Next timing run must request --trace on explicitly (installed CLI supports this), unchanged
HUB test/assertions/deadlines/instrumentation0. No standing config mutation or gate waiver.

Archive preflight first refused36!=37 before target creation: initial tree census included
root .last-run.json, whereas seven-directory traversal did not. Read-only root listing
identifies exactly that45byte metadata file. Include it explicitly under the same freshness,
containment and exclusive-copy checks; keep expected37 and both Lua-export checks intact.
Original failure and all824/50/4/19guards retained; browser verdict remains7/7PASS.

## Rendered continuation close — PARTIAL, 2026-09-15 06:33Z

PROGRESS: unchanged seven-test browser gate now passes first attempt; the prior real-HUB
timeout gate is cleared for this candidate. No production changes this continuation.
authority-scan-save-complete exit0 exclusively preserves37files/2Lua exports with SHA256
manifest; all824/50/4/19guards pass. All jobs terminal. Fresh screenshots inspected as above.
No capability-map delta: this strengthens bounded proof, not full-body or native capability.
No commit/push/release/install/config write. Next: explicit--trace on for the same HUB journey
to retain exact action spans on success, then remaining checkpoint/full-product gates.

Review: all original seven test assertions/deadlines remain unchanged; all823 prior run
pins compared (only current LayoutProgram/selftest and ignored observer differ). Successful
state/export/source/history oracles are not inferred from screenshots. Reopened canvas
confirms title/six tabs/FACTIONS, but substantial body content remains unresolved. Source
wrappers/metadata preserved; stage only owned hunks when normal precommit allows it.

AAR NON-CLEAN: trace retention was not aligned with the declared action-timing evidence
before launch. Missing guessed fixture path corrected by searching the known spec; no code
change. Archive preflight counted root metadata but initially traversed only subfolders;
no overwrite occurred and all37files were then retained. Sustain: complete zero-flake
verdict, source/live guards and genuine screenshot inspection. Improve: set--trace on at
launch whenever success timings are required; discover paths instead of guessing and
enumerate exact archival members before asserting counts. Highest observed weakness remains
multi-second visible stalls and unresolved real-menu body, despite passing bounded journeys.
No precise action improvement claim; full goal ACTIVE/PARTIAL. Lessons banked here only.

## Success-trace batch — SPECIFIED, 2026-09-15 06:34Z

Previous turn PROGRESS. Read full goal/current plan/handoff and re-baseline: HEAD9eb3561,
109dirty/index empty, X4absent, only Deckwright3100PID61604. All823 executable/test/config
pins identical to the seven-test run; all37 archived artifact hashes verified before rerun.
Existing direct output writers remain unchanged and scoped to owned test.info().outputPath;
trace retention is a CLI override, not a standing config write. Installed Playwright lists
--trace on; existing runner forwards it. No production changes or new data/network surface.

Run three existing tests: primary preview-input edit/clear, helper-return recovery, real-HUB
edit/undo/redo/export/reopen. Original assertions/120s HUB/request/preparation limits stay.
Command: bundledNode run.mjs authority-scan-traced scripts/run-e2e.mjs
tests/e2e/x4-ui-source-editor.spec.ts --grep
"edits and clears primary preview inputs|recovers a helper-return position|visually edits and reopens real HUB Lua"
--workers=1 --trace on.

Acceptance: complete3/3 first-attempt zero-flake verdict, source/live/cleanup guards, retain
fresh complete traces and captures/exports exclusively before another run. Extract matching
before/after call IDs and source-line/selector identities for actual Apply/Undo/Redo spans;
keep subsequent polls separate and never sum nested Evaluate twice. Reject missing/negative
timings or ambiguous attribution; show raw evidence and do not infer from total test time.
Compare to preserved failed-run trace baseline, with the different pass/fail context stated.
Inspect fresh helper recovery and HUB capture. This measures known journey cost, not full
body/native/instant-feedback acceptance. Normal precommit/local checkpoint remains next.

## Trace close / checkpoint batch — 2026-09-15

PROGRESS: authority-scan-traced completed06:34:55.812–06:40:35.418Z, exit0,
3passed/0failed/0flaky, complete structured verdict and treeGone=true. Primary preview-input
edit/clear, opaque helper-return recovery, and unchanged real-HUB edit/history/export/reopen
pass first attempt. All823 input/50protected/4original-Lua/19live-file guards pass;
X4 absent and Deckwright3100PID61604 unchanged before/after. No native proof.

authority-scan-trace-comparison exit0 independently pairs exact before/after call IDs,
spec locations and selectors. Four negative controls reject missing completion, negative
duration, duplicate call identity and wrong locator. Earlier failed-total-timeout trace
versus new passing trace (same action source): Apply22341.118→17652.205ms,
Undo16323.952→13713.847ms, Redo16346.005→13349.267ms. Following workspace polls separately
3853.698→1053.610ms,3842.021→1020.169ms,5863.644→1041.534ms. These are Playwright API and
expectation spans, not pure CPU measurements, stable percentages or immediate-feedback proof.
No claim that the earlier cold-preparation GET timeout's cause is repaired.

authority-scan-save-traced completed06:46:14.979Z exit0:20fresh artifacts exclusively
copied and hash-verified under authority-scan-traced-evidence, including3passing traces,
both HUB Lua exports, helper recovery/clear/move and HUB edited/reopened screenshots.
Manifest retains every SHA256; source HUB trace matches the comparison's recorded hash.
All824/50/4/19guards pass. Do not rerun the copier over its existing destination.

Current screenshot inspection: Position Y40 reveals Recovered content; clearing it removes
that dependent content but leaves Always visible heading. HUB edited title, six tabs and
FACTIONS survive reopening. Much of the HUB body remains absent/unresolved; Inspect closed.
These are actual Chromium captures, not generated art, installed-host or native X4 proof.

Revalidated HEAD9eb3561/main,109individual dirty paths (short Git status groups folders),
index empty. No concurrent E2E or X4 process; only3100 listener. Current batch is completion
of the existing checkpoint plan, not another product feature. Normal precommit launched
06:46:31.066Z through run.mjs authority-scan-precommit, without environment guard overrides.
Keep source/test/config pins unchanged throughout. Then exact14path staging plus independent
staged diff review; exclude the final E2E countB119BrowserAction hunk and95other paths.
Use ignored checkpoint.mjs with baseline/hashes, normal installed precommit hook, and
post-commit verification of exact patch, exclusions,57archived files,823inputs and live guards.
No push, release, installation, real-mod/game/config write or full-goal completion claim.

Review: complete executable/test diff reread, including source-matched numeric trees,
RHS-before-assignment parameter handling, caller/sibling lineage, and negative tests.
Scene census changes are coupled to exact source loops/consumers/text glyphs, not counts alone.
Parser-only caches preserve exact-source invalidation; no accepted-verdict cache. SourceBundle
parser reuse introduces no reverse dependency to LayoutProgram. Existing structural input
closed-data checks precede numeric tree traversal. reviewctl/BlastRadius unavailable; manual
review and repository gates apply. Graph vocabulary layout/source/model returned SourceBundle
and generic owners, insufficient for current new helpers; live diff is authoritative. Recall
matched a different Agent_Harness_Extension conversation, not a solved B119 repair.
No capability-map delta or external issue/ledger write.

AAR NON-CLEAN: repeated oversized reads required bounded rereads; one Windows wildcard
search failed without mutation. Degradation called, scope held to review/checkpoint.
Sustain successful-trace retention, independent selector/source attribution, preserved
negative evidence, and exact source/live guards. Improve output handling: one bounded owner
or parsed receipt per call. Highest evidenced weakness remains13–18second authoring actions
and incomplete real-menu body. Next product batch must reduce measured action cost and
restore source-supported body content; passing this checkpoint does not finish the builder.
Lessons recorded in this repository plan only; no global memory/skill changes.

Checkpoint readiness: authority-scan-precommit completed06:46:31.066–06:57:17.567Z,
exit0 with normal defaults, [precommit] OK and all823/50/4/19guards intact. Session48770
terminal. All required scoped source/coupled/rendered/timing/negative methods are evidenced;
overall goal remains PARTIAL because immediate feedback, complete body and full-product
gates are not satisfied. Exact14path local checkpoint now permitted by this unit's gates;
installed hook remains enabled. See checkpoint/post-commit.json for final hash and independent
post-commit verification; its absence is not success. No claim of public release readiness.
