# B119 everyday game overlays

Lane FULL. Status VERIFIED (bounded, 2026-09-14 04:40Z). Full builder goal PARTIAL. Previous turn PROGRESS: retained
caller-only optimization with3browser first passes. Return to actual canvas-first authoring.
Goal: choose context keep-out guides without opening technical Inspect, while preserving
canonical Lua, selection/history, renderer authority, calibrated geometry and advisory truth.
Architecture: reuse activePresetId/enabledEntryIds, selectPreset/toggleEntry, KEEP_OUT_PRESETS
and session projections. Move preset controls to one toolbar details panel; active-context
checkboxes there only. Inspect retains read-only provenance and all manual calibration controls.
No duplicate controls/state, invented geometry, persistence, renderer or deployer.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6. Preserve410pins/protected50artifacts/
4realLua/19live files and membership. Own only SourceEditor.tsx, its selftest.tsx, and
tests/e2e/x4-ui-source-editor.spec.ts. Snapshot exact dirty bytes in evidence baseline.json.
Prior receipt:b119-continuation-fallback-20260914/rendered-receipt.json. Reobserve X4/ports
before rendered run; owned3200/3201/single worker, no live canvas replacement.

Reconcile: existing controls currently inside x4-ui-inspect. Every preset button already
drives selectPreset; applicable members enabled by default. toggleEntry already rejects
inactive-origin and unsupported members. Existing long-text browser journey opens Inspect
to choose4contexts, verifies changed canvas pixels, turns Off and verifies exact restoration,
and checks no source/history changes. Strengthen this real journey instead of a mock substitute.
Original objective and approved canvas-first plan explicitly require accessible context overlays.
New access does not claim new geometry/fidelity. Technical evidence/manual calibration remain
Inspect; advisory-only/not-game-verified stays ordinary-visible. No core capability-map delta.

Design: Game overlays summary shows Off/current context; popup contains Off+existing4preset
buttons and only the active preset's guide toggles. Keep labels from canonical preset data,
show unavailable context members disabled with plain explanation. Show preview-only/Lua
unchanged and advisory/not-verified warning. Read-only evidence remains grouped in Inspect.
Alternative burying inside Preview settings adds another search step; duplicating Inspect
controls risks two control owners. Chosen single toolbar owner uses existing button test IDs.

Acceptance/implementation:
1. Fail-first SSR assertion requires overlay toolbar outside Inspect and one preset control
   owner. Add UI with existing state/handlers; replace Inspect interactive list with read-only
   evidence (do not alter manual calibration). No source/geometry/kernel changes.
2. Update existing long-text/scale/keepout browser test to use toolbar, keep Inspect closed,
   preserve every original source/history/pixel/scale assertion. Add checked toggle off/on
   pixel-change/restoration and disabled-member coverage; per-test screenshots only.
3. Run tsc/lint, complete mounted selftest and existing keep-out selftest; real long-text
   browser journey plus scenario-history/New-menu history. No timeout/retry/oracle relaxation.
4. Inspect actual popup and context screenshots; ensure canvas remains usable when closed,
   technical evidence not promoted into everyday labels, advisory warning visible. Verify
   no source/history changes from guides, exact Off restoration and all input guards/cleanup.

Risks: duplicate control IDs, active-context toggle mismatch, misleading geometry confidence,
popup clipping, affected old DOM assumptions. Negative: disabled unsupported member plus
existing inactive-origin rejection, Off restores exact original bitmap. No config/game/mod/
install/network/publish/Git/wiki/global-memory write. Rollback exact owner delta from baseline.
Evidence:test-results/b119-overlay-toolbar-20260914/. Plan/close/AAR/handoff/backlog local.
Full130/installed/native/3menu/12reference/layout-property/export obligations remain open;
this access improvement alone does not complete journey5 or the full builder.

## Implementation, validation and review

Moved the existing Off/preset buttons and applicable guide checkboxes into one Game overlays
toolbar popup before Inspect. Same state, handlers, projections and canonical label data.
Inspect retains read-only provenance and byte-identical manual calibration. Added advisory
warning and disabled-context explanation; no source/geometry/history/persistence changes.
The existing long-text browser journey now uses this toolbar with Inspect closed throughout.

Evidence root above contains exact command inputs, UTC receipts, raw logs and baseline bytes.
- toolbar-red: expected fail-first SSR failure; protected guards passed.
- types-final / lint-final: exit0. Lint warnings remain; no errors.
- review: exit1, reviewer used guessed Inspect test ID. Corrected only new assertions/reviewer
  to actual x4-ui-inspect-panel; review-final exit0. Not a product failure or weakened oracle.
- mounted: complete SourceEditor selftest exit0, including stale callbacks and scenario/profile
  continuity. keepouts: exit0, existing18/18 plus causal9/9 and inactive-origin rejection.
- rendered: PASS3/3 first attempt,0failed/0flaky/0skipped/0globalerrors. Scenario history46.3s,
  long-text/scale/keepouts35.0s, New-menu history59.8s. No timeout/retry relaxation.
- Browser proves4contexts with Inspect closed, checked guide off/on changes/restores native
  canvas pixels, disabled unmapped guides, Off exact bitmap restoration, unchanged Lua/history.
- Inspected game-overlays-toolbar.png, all4 long-text-context PNGs, scenario-B-redo.png and
  b119-source-history-alternate-edit.png under browser/. Popup fits tested1280x720 viewport;
  advisory warning, labels and disabled explanation readable. Closing restores unobstructed
  canvas. Thin guides at Fit screen are visible; this is not new geometry/native proof.
- rendered-receipt.json at04:40:08Z:410input pins stable during run; protected50artifacts,
  4realLua,19livefiles and memberships unchanged. Owned stack treeGone; X4absent; only
  Deckwright3100/PID69604 remains. Every command terminal, including session48386.

Fresh-eyes review: all pre-existing assertion lines retained, one control owner, all handlers
and owners unchanged (except canonical label import), manual calibration suffix byte-identical.
Acceptance1-4 done/evidenced. Full130, narrower-window accessibility, installed/native checks,
three-menu/twelve-reference census and remaining authoring journeys not claimed by this unit.
No core capability-map delta. Rollback is this unit's exact three-owner baseline delta, never
whole-file checkout over prior dirty work. No Git/release/install/mod/config/external writes.

## Close / AAR

VERIFIED bounded overlay access; full goal PARTIAL. Commit point:
feat(ui): expose game overlays beside the source canvas (not committed).
Triggered AAR: fail-first red and incorrect new reviewer selector. Sustain: reuse current
projection/control owners and strengthen existing real journey without replacing its oracles.
Improve approach/tools: read actual DOM test ID before writing review probes; failed review
log retained and corrected exact selector now asserted explicitly. Highest evidenced risk:
New-menu history took59.8s in this run; latency remains an open usability/test-margin risk,
not solved by this access change. Continue ordinary layout-property authoring and measure its
interaction cost rather than adding another cache. Project lesson banked here; no global write.
