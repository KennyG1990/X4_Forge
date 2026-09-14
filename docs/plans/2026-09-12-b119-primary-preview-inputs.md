# B119 primary preview inputs

Status: PARTIAL, source implementation frozen with passing pure/static gates; rendered proof pending.
Lane: FULL. Astra implemented/tested directly; no Luna worker used.
Baseline captured2026-09-12T05:46:39.9333626Z: all25 inputs match prior accepted static gates; five
inert owner snapshots are byte-equal. Record:test-results/b119-primary-preview-inputs-baseline-20260912T0550Z/baseline.json.
Goal: let a modder supply relevant preview values beside the canvas without opening Inspect.
Architecture: extend the existing BuilderPresentation view mapping and SourceEditor sample controls;
EditorSession remains the only sample validation/adoption owner. React/TypeScript, existing selftests/E2E.

## Plan and acceptance contract

- Full objective and approved canvas-first plan remain authoritative, including all nine journeys,
  saved named scenarios and three-menu/twelve-reference native fidelity. This is one required unit.
- Current source: Samples4198/4246 is mounted only inside Inspect6462. updateSample5362 stages against
  exact catalog/binding/authority; applySampleDraft5390 validates before adoption; resetSampleDraft5423
  discards draft only. EditorSession1938 supports clearing via an all-empty validated draft.
- Sample entries expose exact operationKind/field/operationId consumers. Reuse existing property label
  classification and exact hierarchy membership. Never use friendly labels as identity or authority.
- Toolbar preview inputs: accessible toggle adjacent to Preview settings; bounded scrolling panel,
  meaningful number/string/boolean labels, multiline long text, affected-element descriptions, distinct
  same-label inputs, applied/unapplied state. No expressions/IDs/source ranges in the primary controls.
- Apply to preview adopts valid draft; Discard edits restores displayed applied values; Clear preview
  values works even with no draft and clears both applied values and draft through current authority.
- Invalid/stale apply or clear must retain accepted state and show a concise refusal. Technical error
  details, expressions and all catalog entries remain accessible in existing Inspect. No fake Saved.
- Missing values remain optional/unresolved, never default to zero or fabricated geometry. Preview
  samples do not unlock Lua edits, alter Lua/workspace/history/export/profile or grant game verification.
- Out of scope: named scenario persistence choice (pending user decision, still required), new storage,
  parser/layout fixes, new source/history/deployment authority, dependencies, real mod/game/config writes.

## Ownership, baseline and rollback

Only these implementation/test owners may change:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.selftest.ts
- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx
- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.selftest.tsx
- F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts

HEAD93c9af111d63ca77c99dee11f21882c4073bcda6. All five contain pre-existing accepted property work.
Capture a new25-input baseline and inert owner snapshots before mutation; preserve unrelated dirty
files. Roll back only this unit delta against those snapshots, never whole files against Git HEAD.
Prior source checkpoint: test-results/b119-property-recovery-20260912T-final-revalidation-3/.
No live coding workers. Source-only tests are serialized; no browser/services/build until clearance.

## Implementation and validation

1. Add actual source-issued sample presentation assertions to existing pure BuilderPresentation test.
   Reuse current controlled unit corpus and Session fixture; cover identities, semantic labels, unknown
   consumers, duplicate labels, and no mutation. Supplement fixtures only for exceptional label cases.
2. Extend disposable presentation mapper, then render primary sample controls in existing SourceEditor.
   Preserve technical Inspect view using unique test/control IDs. Reuse current callbacks/state.
3. Add guarded clear action using current catalog/authority and the existing all-empty draft transaction.
   Exercise actual EditorSession apply/invalid/clear/stale-authority paths with source-issued objects.
4. Add markup assertions in existing SourceEditor selftest and actual interface journey in existing E2E:
   open primary inputs, stage/apply/discard/clear, long text, unchanged source and canvas identity, keep
   Inspect collapsed for ordinary work. Existing15 targeted tests remain intact; new case increases count.
5. Run bundled Node pure presentation test, whole-repo tsc --noEmit, strict exact-five ESLint and diff
   hygiene; freeze and compare all25 inputs. Re-read full new diff and negative paths independently.

Required later: full SourceEditor selftest (launches Chromium), targeted E2E, actual1280x720 rendered
host inspection, all full-goal gates. These are unavailable until renewed machine-state clearance;
authoring tests is not passing them. UI unit cannot close VERIFIED without actual rendered proof.
Evidence: unique test-results/b119-primary-preview-inputs-* directories with commands, UTC, child exit,
raw streams and hashes, final input pins and actual screenshots when authorized.
No new network/spend/delete surface or capability-map delta. No Git/publish/install/native mutation.

## Reconciliation / AAR

Reuse current owners per ADR-F1/F2/F5. No replacement renderer/history/store. The existing sample
catalog already provides consumer semantics; this is wiring/presentation plus a missing explicit
clear action, not a new input system. Original field/source authority and partial-state honesty stay.
Prior turn: PROGRESS, user-requested direct-execution policy adopted and completed property checkpoint
recorded; no new product code in that turn. This turn must implement the present unit, not repeat status.
Record actual outcomes and AAR at close. Do not claim a product pass from a static-only checkpoint.

## Implementation, review and close — 2026-09-12

- Implemented primary Preview inputs toolbar panel, exact-consumer readable labels and affected-element
  descriptions, distinct labels for separate equal-expression reads, number/boolean/multiline text controls.
- Reused existing sample draft/apply/discard state and added explicit guarded Clear through the current
  EditorSession authority. Stale callbacks/authority refuse without UI adoption. Full technical controls
  and errors remain under Inspect with distinct primary/technical control IDs.
- Pure source fixture proves all four typed inputs are owner-issued, known text remains without them,
  both dynamic Text nodes appear after normal Session adoption, invalid current-authority input preserves
  accepted values, old/forged authority refuses, and all-empty draft clears without rewriting Lua.
- All five new diffs reviewed against this unit's inert snapshots. No source/parser/layout/history/store
  authority changed. Existing diagnostic ordering check is now scoped to technical Inspect; a new check
  places primary inputs before the canvas workspace. CSS disabled variants are not a disabled attribute.
  Browser test explicitly waits for changed/restored pixels rather than trusting a stale status string.
- Actual pure/E2E fixture arrays match all13 lines. Browser inventory is now14 SourceEditor cases
  (11 literal plus3 parameterized) and2 builder-mode; existing cases retained, no skips/only/fixme added.

Validation evidence:
F:/DEV_ENV/X4_Forge/test-results/b119-primary-preview-inputs-final-20260912T060133Z/receipt.json

- Final input pin06:02:19.1017406Z. Presentation child0 at06:02:21.2731379Z,227 stdout bytes/0 stderr.
- Whole-repo tsc child0 at06:02:59.8654563Z; strict exact-five lint child0 at06:03:38.3841718Z,
  both streams empty. Raw child streams and hashes are in the final evidence directory.
- Final/current06:04:27 check:25 inputs,0 drift during gates,5 expected owner deltas,20 protected inputs
  unchanged from baseline. No claims beyond this recorded input boundary. HEAD unchanged.
- Tracked diff check0. Per-file no-index --check reports1 for changed files with only existing LF/CRLF
  conversion warnings, not whitespace diagnostics; those exit1 values are not reported as child0.
- Full SourceEditor selftest (including added markup assertions), targeted E2E, real1280x720 rendering,
  installed/native/full-goal gates NOT RUN. No screenshot was generated; screenshot code is not evidence.
- reviewctl/BlastRadius unavailable, rechecked; manual complete unit diffs + real static gates used.
  Graph remains navigation-only/stale pending deterministic refresh before broader acceptance.

Remaining: real host keyboard/open/stage/apply/discard/clear journey, source/history/pixel checks, named
scenario persistence decision/implementation, numeric integration and the original full fidelity gates.
Eyeball script after authorized current build: open fixture menu -> Preview inputs -> supply width100,
Scale Off and two texts -> Apply -> edit text -> Discard -> Clear with no draft -> confirm known text
remains, Lua/history unchanged, Inspect closed and Not verified in game still visible.
Suggested eventual commit: feat(ui-builder): expose friendly preview inputs. No commit/push/publish.
No capability-map delta or external wiki/memory record changed. Full goal remains ACTIVE/PARTIAL.

AAR NON-CLEAN:
- Sustain: direct bounded implementation, reuse of actual producer/consumer semantics and source authority,
  byte-matched unit/browser fixtures, final frozen gates and independent diff reread.
- Improve approach: first new test correctly failed on missing mapper; later integration test reused an
  expired authority after a new Session. Use the newly issued authority and keep old-authority rejection
  explicit. No production owner was weakened to make the test pass.
- Improve tools: bounded reads avoid large whole-task outputs; native no-index diff exit1 means differences,
  not automatically a validation failure. Capture raw final streams, not guessed receipt names/counts.
- Highest evidenced risk: user-facing behavior remains unobserved despite static green. Keep the actual
  browser/host gate open; do not treat the source checkpoint as usable-product acceptance.
