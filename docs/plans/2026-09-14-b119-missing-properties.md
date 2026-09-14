# B119 add omitted text properties

Lane FULL. Status PARTIAL at 05:51Z: source owner implemented/tested, rendered authoring gate pending. Full builder goal PARTIAL.
Previous turn PROGRESS: alignment UI/evidence plus reproduced inspector scroll reset.
Purpose: plain newly added Text must gain ordinary supported layout properties without Lua.
No generated replacement widget, invented defaults or alternate menu representation.

Authoritative references: objective, approved2026-09-10canvas-first plan, original brief;
shipped helper at ui/addons/ego_detailmonitorhelper/helper.lua. Same CAS/workspace ADR-F1/F5.
Candidate reuse: current SourceEdits catalog has exact row-local replace-statement entries;
existing structural apply validates/reparses/matches owner chain and commits via workspace CAS.
Before choosing this path, measure whether blank-property Text has replacement authority,
including a runtime-dependent sibling. Discovery explicitly filters replacements on partial
programs, which may make this path insufficient. Do not weaken that filter speculatively.
Direct minimal property insertion must preserve all other statement bytes and existing
selection/history owners; whole-statement range alone would lose nested Text selection.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, previous dirty bytes preserved.
Evidence:test-results/b119-missing-properties-20260914/.410pins from layout-controls final
rendered receipt;50artifacts/4realLua/19live membership protected. Initial potential owners:
SourceEdits.ts/selftest.ts, SourceEditor.tsx/selftest.tsx, x4-ui-source-editor.spec.ts.
No mutation of product until reconciliation settles implementation contract. Diagnostic
script uses isolated in-memory workspace and supplied profile; not canonical-font/UI proof.
Rollback exact owner delta from baseline, never reset whole dirty files.

Required final vertical path: create/add plain Text -> choose omitted property/value in
selected pane -> Add through existing authority -> visible pixels/exact Lua -> ordinary
subsequent property editing -> Undo/Redo and source preservation. Missing inputs/aliases,
duplicate properties, stale source/selection and unsupported values must refuse, not overwrite.
Owner fail-first/unit negative checks, tsc/lint, full mounted tests, actual rendered fixture,
screenshots and protected stack cleanup required. Final detailed implementation contract will
be reconciled below before product mutation. No Git/publish/install/game/mod/config/issue/wiki/
global-memory changes. Inspector scroll defect and full fidelity/full-suite/native obligations
remain open; do not redefine the full goal around this first property-add path.

## Reconciled implementation contract (05:10Z, before product edits)

Probe evidence: without text-height proof blank Text is partial/locked; explicitheight20 is
projected and exact replacement accepts halign. With separately supplied minTextHeight7,
blank Text is also projected and replacement accepts; dynamic sibling remains partial and
no replacement is issued. These are in-memory diagnostics, not native/font proof. Reuse the
working projected replacement owner; do not globally relax partial-program eligibility.

Add typed discover/apply helpers inside existing SourceEdits owner, backed by its private
catalog authority and existing exact replace-statement entry. Support missing halign,
fontsize, wordwrap, x, y, minRowHeight on direct createText/setText/setText2 options. Shipped
helper3206-3216 defines these. Accept direct literal option tables or omitted final options;
refuse aliases, computed/unknown table keys, duplicates, unsupported calls/values and partial
replacement authority. Direct nonnegative numbers only, consistent with scalar literal edits;
positive fontsize. No default values are silently written. Partial/import aliases stay an
explicit unresolved capability in the full goal; this first path targets new ordinary Text.

For literal table insert at its opening brace, with a trailing separator, preserving every
existing byte including comments/whitespace. For omitted options insert before the proven
closing parenthesis. Existing structural apply reparses and verifies the replacement; helper
also proves the added editable field's exact call/range/value. Return the minimal equivalent
splice for existing parent acknowledgement/selection/history transfer. No new mutation owner.

Selected pane gets an Add text property section with only eligible omitted fields, a typed
value control (alignment choices, yes/no wrapping, number), and Add. Use existing draft store
and Apply dispatcher/context/selection guards. Empty choice/value does nothing; existing
drafts disable structural add until applied/discarded. After acknowledgement remain on same
Text and expose normal scalar edit controls for the inserted field. Technical IDs stay hidden.

Acceptance detail: owner tests cover empty/omitted/commented tables, repeated additions,
subsequent scalar editing, exact minimal-splice correspondence; reject cloned/stale/foreign
catalog, duplicate/alias/computed-key/invalid values. Real browser starts from plain Text {},
adds alignment and font size, edits added value, Undo/Redo to original source and back, exact
source/other-file/history and canvas checks. No test deadline relaxation. Full owner/mounted,
types/lint and focused browser required; preserve all prior assertions. Inspect screenshots.
Feature result may be PARTIAL if a named UI/authority gate fails; never call full builder done.

## Reconciliation update: multiline option tables

Owner fail-first exposed the missing API. The first candidate run also exposed a test-oracle
mistake: replacing the first `{}` changed addRow instead of Text. The oracle now targets the
exact Text call; original failed evidence is retained. The corrected run reproduced the
generic replacement owner's single-line policy on the commented/multiline fixture.
Preserve that public policy. Only the typed property helper may parse a byte-preserving
generated insertion with existing line breaks, then pass its private proof through the same
structural CAS/reparse owner. No general multiline source-replacement permission is added.
Review also requires the unsafe-authority-graph guard before property discovery traverses
the issued public model. Retain multiline/comment, generic-refusal and hostile-input tests.

## Review correction: call-specific supported fields (05:47Z)

Expanded tests exposed that setText/setText2 cannot accept wordwrap: the structural owner
correctly refuses a non-applied replacement call. Existing CallModel property contracts
(createText84-87 versus setters88-93) admit wordwrap/minRowHeight only for createText.
Constrain both discovery and typed application accordingly; do not relax parser/layout gates.
Keep the failed owner-complete/owner-field-diagnostic receipts. Setters must reject these
two fields; ordinary Text still supports all six and repeated numeric additions must remain
discoverable. This corrects the earlier overly broad call/field matrix, not native semantics.

Validation/tool interruptions: TypeScript first caught discriminant narrowing/test kind
mistakes, corrected. Review-generated baseline .ts/.tsx copies were unintentionally included
by tsc; all five were SHA-verified and renamed .txt, and review.mjs corrected. No compiler
exclusion or test oracle weakened. A transient absolute-path patch lookup and two Node
UNKNOWN read failures occurred before test dispatch; unchanged guard subsequently passed
05:40:35Z. Windows reported F healthy, ~2TB free, ~9GB RAM free; cause unproven.
Degradation call made; finish this correctness checkpoint and durable handoff before any
new unit. Full rendered/packaged/native obligations remain, no verified feature close yet.

## Checkpoint close and AAR (05:51Z)

IMPLEMENT: five owner files changed. Typed add/discovery reuse exact statement authority,
private parsed payload proof, structural reparse/CAS and a minimal equivalent history splice.
Plain Text supports halign/fontsize/wordwrap/x/y/minRowHeight; setters exclude wrapping and
row sizing. Empty/omitted/commented tables retain old bytes. Selected-pane control uses the
existing draft/apply/selection/acknowledgement/history owners. Secondary text choices are
labelled distinctly. New rendered test starts with actual palette insertion, then two added
properties, scalar follow-up, exact full-workspace comparison and three Undo/Redo steps.

VALIDATE (receipts/logs under the evidence root):
- owner-multiline: full source suite PASS after typed multiline route.
- owner-negatives: full source suite PASS with alias/computed-key/accessor negatives.
- mounted: full editor selftest PASS before later secondary-label/call-matrix corrections;
  this is not a final-current mounted verdict. Existing deliberate duplicate-key warning in
  hostile-scene coverage remains in the log; no claim of a warning-free installed UI.
- owner-call-matrix: full source suite PASS, all six numeric/boolean/string properties on
  plain Text; primary/secondary setters and unsupported-field refusal. After this run only
  one test guard changed to assert.ok(propertySplice), fixing TS2367 without changing the
  tested product or weakening the accepted-result assertion. Earlier failures retained.
- types-checkpoint: whole tsc --noEmit PASS with final owners and .txt baseline artifacts.
- lint-checkpoint: SourceEdits.ts, SourceEditor.tsx and e2e spec PASS.
- git diff --check over all five owners: PASS. Baseline-relative deltas generated/read;
  changes after review are the explicit per-call correction, label and test strengthening.
- Required final mounted rerun and new rendered journey: NOT RUN. No browser stack started
  this unit; source/SSR assertions do not establish visible UX or native fidelity.
- All completed wrappers preserved410input pins during execution,50prior artifacts,
  4realLua and19live-file membership. Last static receipts have current owner fingerprints.

REVIEW: source authority/byte preservation/negative cases done and evidenced. UI control is
implemented, but selection, real pixels and Undo/Redo via the new Add-property path remain
PARTIAL until the actual browser test runs. Full goal9journeys/3menus/12references/full130+
integration/package/install/native obligations unchanged. No renderer/parser replacement,
generic multiline relaxation, partial-program replacement relaxation or default injection.
No verified capability-map delta published; candidate authoring delta remains in this plan
pending rendered evidence. No Git/precommit/release/install/real-mod/game/config/issue/wiki/
global-memory writes. No commit point claimed for this PARTIAL feature.

AAR — triggered: reconciliation corrected call-field scope, oracle/type mistakes and failed
commands, transient file reads, review artifact contamination; degradation call made.
- Sustain: exact existing owner reuse, strict failed receipts retained, independent full
  source/pixel requirements, negative tests caught unsafe/unsupported requests.
- Improve approach: consult per-call contracts before promising a uniform text-property
  list. Do not let a loop silently skip missing expected choices; tests now assert them.
- Improve tools: generated review copies must use .txt, not compileable extensions. The
  renamed five files preserve their baseline hashes. Bound output before broad reads; avoid
  Windows rg wildcard path arguments. Do not bypass a transient input guard failure.
- Highest-risk evidenced weakness: editor offers can overpromise parser-supported authoring
  when similar calls have different property contracts. Current bounded fix constrains both
  discovery and apply and tests createText/setText/setText2. Next must inspect actual UI flow.
- Project lessons banked here. External/global ledgers deliberately not mutated.

NEXT (same unit, fresh context): checkpoint.mjs check, then final mounted selftest and isolated
single-worker rendered new missing-property + existing layout-controls/recovery tests. Audit
writer delta: the only new E2E writer is page.screenshot(test.info().outputPath(...)); all old
test writers and setup remain unchanged relative to baseline. Do not mark VERIFIED before
screenshots and source/history proof. Keep Antigravity visible if actual computer use occurs.

## Rendered-validation continuation

Previous goal turn PROGRESS: source-owner implementation and evidence changed the next action.
Full objective reread; all nine journeys and native/census obligations retained. Current
baseline guard05:53:00Z PASS with the same five owner hashes as the last checkpoint; no new
worker or mutation owner. Full current mounted suite dispatched as mounted-final, handle94288;
poll that same handle to terminal before the serialized browser stack. No arbitrary retry or
deadline relaxation. The objective's continue-safe-work instruction supersedes repeated
review-permission prompts; real external/game/config writes still require explicit approval.

Read/audited the selected fixture and ephemeral workspace writer, config isolation, Vite
setup/cleanup, runner JSON destination and selected screenshots. New writer is solely
test.info().outputPath(added-text-properties-redo.png); existing selected layout/recovery
captures also use outputPath. No top-level test hooks write external artifacts. Read-only
corpus routes and isolated API remain the source of fixture font/geometry data. Prior pinned
runner/setup owners unchanged. Browser selection: new property journey plus existing layout
controls and locked-recovery; output browser-first, ports3200/3201, workers1, trace on.
Recall yielded an older June Forge history note, not a relevant solution; current code and
handoff govern. No external ledger/Git/release/mod/config writes authorized in this unit.

## First rendered result and visual review

mounted-final PASS current code. rendered-first PASS3/3first,0flake/0skip/0globalerrors,
31.4s new property journey,16.8s existing layout,15.5s recovery. Exact Lua/history/pixels
passed; stack treeGone and all protected files/membership unchanged, X4absent, only3100.
Saved new-property and alignment-redo screenshots inspected. [REPRODUCED appearance] the
new-property final image has a nearly invisible neighboring label; existing alignment image
has a clipped-looking right text edge. Cause/pre-existence is not established by these final
images. Add before/after and active-property screenshots in the SAME existing test to inspect
the actual progression. No render oracle/deadline weakened, no renderer implementation scope
expanded yet. Keep full fidelity open; do not equate changed pixels with correct layout.

## Superseding rendered and correctness continuation

rendered-visual PASS1/1 first with intermediate screenshots; mounted-final PASS current.
Combined with rendered-first3/3, actual palette/add-property/ordinary edit/UndoRedo/source
preservation and locked recovery are evidenced. Screenshots reproduced vertical loss of an
unchanged sibling as another label grows. This was not a source/property-write defect.
New separately baselined repair: docs/plans/2026-09-14-b119-text-top-anchor.md. Follow its
checkpoint now; do NOT run the old five-owner check after the authorized Scene changes.
It corrects native row-top anchoring, retains clips and adds unchanged-sibling pixel checks.
No missing-property product code changed during the repair. Full builder stays PARTIAL.
