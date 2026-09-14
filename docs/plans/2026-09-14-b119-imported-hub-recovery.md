# B119 imported HUB recovery

Lane: FULL. Status: PARTIAL (current-source diagnosis verified; recovery not implemented).

## Goal / design / acceptance

Recover a useful source-backed preview of the real HUB, beginning with its missing tab strip,
without asking the modder to transcribe source constants or inventing runtime tab content.
Use the existing CallModel, LayoutProgram, EditorSession and preview scenario owners. No Lua
execution, new renderer, whole-file source regeneration or fake replacement menu.

Reconciled choices: changing default zoom alone enlarges an incomplete preview; supplying
hard-coded samples for source-known constants makes ordinary users do compiler work; extending
the existing bounded source analysis can remove that work while keeping true runtime inputs
explicit. Choose the latter only where the actual source and existing authority prove it safe.

First bounded step is a current-source public-session probe. It must identify exact dependencies
that suppress the real HUB tab strip/body, distinguish source-known values from runtime values
and unsupported helper/control-flow shapes, and inspect the existing recovery UI capability.
Then specify the smallest source-owner extension that advances the complete imported-menu goal.
Do not implement speculative folding before determining mutation/escape and consumer contracts.

## Baseline / reconciliation

- HEAD8ceffa66abd6fe5280f87738bbee46ad880de0c4; prior turn PROGRESS: local12-path commit,
 93excluded changes preserved, complete precommit passed second attempt. First Vite timeout
 remains unexplained. Receipt:test-results/b119-green-checkpoint-20260914/attempt2/post-commit.json.
- Full132/132 integration remains current for executable bytes. No repeated full-suite gate here.
- Real HUB screenshot from that run shows only title/CLOSE at19.2% fit view; tab/body missing.
 Source hub.display653 builds #TABS columns and numeric/generic loops, then dispatches a tab
 helper through TAB_FN[hub.tab]/pcall. Missing content cannot be classified as a camera bug.
- Existing graph locates X4UiSourceEditor -> computeX4UiBuilderViewport and SelectionFocus;
 direct source confirms fit-menu includes the issued frame extent. Generic Canvas graph query
 was unrelated; Agent-Brain result was a weak old IDE-context match, not a prior solution.
- Existing local-helper expansion is already enabled by EditorSession; loops/dynamic callees
 have explicit refusal paths. Prior public probe lists #TABS,y,i,name as inputs, but must be
 rerun against current code before treating that old list as current diagnosis.
- Governing references: full goal attachment, original FORGE-UI-EDITOR-BRIEF, approved
 2026-09-10 canvas-first plan; capability map and ADR-F1/F2/F5/G3 boundaries retained.

## Scope / risk / validation

Owned: this plan, handoff/backlog updates and test-results/b119-imported-hub-recovery-20260914/.
Initially no executable product/test changes. Reuse prior probe's recorded reference transport,
verify raw source hashes and exact replay-vs-original BOM difference; no metadata fabrication.
Read real sources/corpus only; write evidence solely inside the named repository directory.
No live service, temp DB, installed app, real mod/game/config, publish/push, external wiki/issue,
memory mutation or new dependency. No capability-map delta yet.

Acceptance: current public projection for exact original HUB and both supported profiles;
preserve all gaps, missing inputs and invocation refusal reasons; source/program target identity
matched; before/after412 full-suite input pins and real source SHA unchanged. A projection's
canRender flag is not evidence that missing tabs or bodies have rendered. No Lua execution.
Negative: reject any reference request not in the captured transport and any source byte drift.
Evidence: probe.mjs, projection.json, run.log and receipt.json in the owned directory.
Rollback: no product edits; retain failed evidence, remove nothing automatically.

## Close / AAR

Pending actual probe and source-owner decision. Installed/native and all three-menu/twelve-
reference obligations stay open. Reconciliation changed initial camera hypothesis: exact screenshot
and real source show missing content, not just bad framing. Oversized batched reads were inefficient;
use bounded single-owner outputs. Do not add cosmetic viewport changes to hide unresolved content.

## Current-source result and next implementation boundary

Session72025 terminal exit0. Command: bundled node --import tsx
test-results/b119-imported-hub-recovery-20260914/probe.mjs. No service or game launched.
receipt.json confirms both profiles, exact original HUB SHA657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F,
and all412 executable/test pins unchanged before/after. Full projection.json retains program
gaps, operation identities, loop catalog, helper invocation ledger and descriptor facts.
Output was captured by tool session, not run.log; correction to planned evidence location.
The optional modelGaps field was absent (CallModel uses verificationGaps); program.gaps is
present and explicitly reports truncation of the upstream verification list. Do not infer a
complete model-gap census from this probe. No rerun needed to establish the following facts.

At1920x1080/scale1 and2560x1440/scale1.4: canRender=true but program.status=partial;
1frame,2table records,2row records,2cells. Counts include refused records, not rendered objects.
The title table is partial and has issued geometry. The tab-strip table is REFUSED.

| Consumer | Current authoritative failure | Required direction |
| --- | --- | --- |
| HUB addTable, line686 | #TABS column count unresolved | Source-bound immutable sequence length, with mutation/escape rejection |
| Same table y, line686 | y unresolved through rowH(1), line682 | Bounded local numeric return/proven parameter propagation; no guessed y |
| Column-width loop, line687 | Zero-or-more numeric loop catalog, i sample | Exact finite sequence/bound proof, preserving width freeze ordering |
| Button loop, lines689-694 | Zero-or-more generic loop, name sample | Exact ipairs sequence/iteration values; handler effects remain unexecuted |
| Body, lines698-699 | TAB_FN[hub.tab] selected through pcall; global/no exact callee refusal | Separate bounded dispatch design with explicit tab scenario and effects limits |

Other facts: nextTab() is a missing tabOrder sample but does not prevent the title from
painting. Helper rawget availability warnings are honest runtime limits. Several pcall/type/
tonumber/log invocation warnings are not proof that their containing content is all absent;
consumer descriptors and original screenshot establish the actual tab-strip refusal.

Implementation review: do NOT add a quick #table -> count fold. CallModel.evaluateUnary
currently folds #string only; tracked objects already have indexedValues, declarationNode,
mutated and escaped flags. Numeric provenance is independently checked by LayoutProgram.
Any sequence-length support must preserve source range/type/expression and consumer binding,
not just return6 from a convenient parsed table. Existing numeric-for proof only accepts
literal integer bounds and max16 iterations. Reuse/extend it, not parallel loop playback.
Next bounded implementation: source-bound immutable sequence length and loop-bound provenance,
with red positive/negative tests first; carry rowH/generic iteration/body-dispatch dependencies
as required follow-on work, not silently declare the real HUB fixed after length support.

Review: read-only current diagnosis and source-byte invariance DONE; recovery implementation,
new rendered acceptance, current installed/native acceptance NOT DONE. No capability-map delta.
All9journeys/3menus/12references retained. No Git commit/push, release/install, live mod/config,
external issue/wiki or memory write. Unrelated dirty files preserved.
AAR: actual probe passed first attempt. Repeated oversized reads and one failed documentation
patch context triggered degradation call; no partial patch was applied by that failure.
Sustain exact-source public projection and consumer-specific gaps. Improve tool output:
explicitly select scalar fields and capped rows, never nested table descriptors wholesale.
Highest evidenced product risk: canRender=true alongside a refused tab table and absent body
can look like a mostly working import. Retain the partial warning and require actual tab/body
pixels for the eventual recovery close. Lessons banked in this plan; next pass starts from
the tested source-analysis boundary, not another full132-test run.
