# X4 Forge — Session Technical Changelog (2026-06-16)

Scope: AI Experience work — A5.5, A4.3, A4.0 Slice 1, and A5.2 (Architect agent loop) D1–D3, plus two bugs found during live browser testing. All validation was done against live browser/host behavior (oracle endpoints + screenshots), never sandbox metadata.

Determinism note carried throughout: the deterministic engine is the referee of every AI output; the model's prose is never the artifact.

---

## 1. A5.5 — Collaborative blueprint editing

**What & why.** Make the Architect blueprint user-editable and durable, so the human and (later) the agent loop share one persistent plan. Previously the panel was read-only.

**Files / symbols.**
- `src/components/BlueprintPanel.tsx` — editable `intent` field (`<input value={bp.intent} onChange=…>`); `addNote()` appends to `scratchpad.notes`; `update(next)` persisted via `saveBlueprint`. Initial implementation owned local state `const [bp,setBp]=useState(blueprint)`.

**Approach.** Edits write through to `localStorage` key `x4_mod_blueprint` (via `modBlueprint.saveBlueprint`). (This local-state ownership was later generalized to *controlled-with-fallback* in A5.2 D3 — see §6 — so App can be the single source of truth without regressing this behavior.)

**Validation.** Added a note → rendered in the Scratchpad sub-view → performed a **full page reload** → note re-read from `localStorage`. DOM-confirmed (`noteStillThere=true`, `lsHasNote=true`) and screenshot-confirmed. Editable goal field present. Test note removed afterward to avoid polluting the blueprint.

**Status.** ✅ Done & verified live (editing + persistence). The "model honors user edits" sub-part (M-ARCH-6) is exercised in the A5.2 loop.

---

## 2. A4.3 — `explain` tier surfaces (tier-differentiated AI UI)

**What & why.** Make the three AI tiers expose genuinely different surfaces (previously any tier > `off` showed the full panel). `explain` = read-only chat; `assist` = + Builder; `cobuild` = + Architect. Enforces the opt-in doctrine: at `explain` there is structurally **no way to mutate the canvas**.

**Files / symbols.**
- `src/components/AIHelper.tsx` — new prop `aiTier?: 'off'|'explain'|'assist'|'cobuild'`; capability flags `canBuild = aiTier==='assist'||'cobuild'`, `canArchitect = aiTier==='cobuild'`; a `useEffect` that **coerces** a stale `activeMode` (e.g. persisted `architect`) down to an allowed mode when the tier drops; conditional render of the BUILDER and ARCHITECT tab buttons; a cyan read-only banner shown when `!canBuild`; the chat-proposal **Apply button disabled at `explain`** (`disabled={!canBuild || !review.applySafe}`, label "Read-only (Explain tier)").
- `src/App.tsx` — passes `aiTier={aiTier}` to the floating `AIHelper`.
- `src/components/Sidebar.tsx` — new `aiTier` prop, forwarded to the docked `AIHelper`; App passes `aiTier` to `Sidebar`.

**Approach.** Tier flows App → (floating AIHelper) and App → Sidebar → (docked AIHelper). The no-mutation guarantee at `explain` is structural (no Apply affordance, no Builder/Architect), not a runtime check.

**Validation.** Toggled `localStorage.x4_ai_tier` + reloaded across the full matrix, screenshot each: `explain` → CHAT only + read-only banner; `assist` → CHAT + BUILDER (no Architect, no banner); `cobuild` → CHAT + BUILDER + ARCHITECT. Tier restored to `cobuild`.

**Status.** ✅ Done & verified live. (The contextual "Explain this specific error" verb folds into A4.0.)

---

## 3. A4.0 Slice 1 — "Explain this node" verb (deterministic-first, additive)

**What & why.** First contextual action verb: a deterministic per-node explanation attached to a selected node. Scoped to NOT touch the open product question (chat stays put; this only *adds* a verb). Works at every tier including AI `off` (it's deterministic) — the A4.10 doctrine made into an action.

**Files / symbols.**
- `src/lib/mdExplain.ts` — new `NodeExplanation` interface and `explainNode(nodeId, nodes, links): NodeExplanation`. Built only from `mdSemantics.describeNode` + `semanticsForNode` (summary, `schemaRecognized = !sem.notInSchema`, `note`, `risk`, `reads`, `writes`) plus a graph edge-walk reusing `triggerNodesOf` / `actionChainOf` to derive `wiring` (`wiredToCue` / `inChainOf` / `orphan`). Extended `runExplainSelftest()` with **+9** `explainNode` assertions.
- `src/components/Sidebar.tsx` — `import { explainNode }`; `explainOpen` state; an "Explain this node" collapsible in the Properties Inspector that renders the deterministic explanation for the selected node (no tier gate).

**Approach.** No new endpoint — the existing public `GET /api/agent/explain-selftest` (already in `PUBLIC_READONLY_GETS`) covers the extended oracle. `orphan = node.type!=='cue' && no incoming link` (cues are roots, never orphans).

**Validation.** `explain-selftest` **30/30** (was 21) via the live endpoint — new checks: action-in-chain, deterministic-summary, note+write+risk, schema-recognized flag, trigger-wired-to-cue, cue-not-orphan, safe-recognized, orphan, missing-node. Browser screenshot: selecting `show_help` rendered "DETERMINISTIC · NO AI · &lt;show_help&gt;", summary "Shows an on-screen help/notification message: 'Welcome to the sector!'", role=action, risk=safe, writes=ui.help, wiring "part of the action chain of cue cue_first". No app console errors.

**Status.** ✅ Done & verified live. Remaining A4.0 verbs (Suggest fix / Find missing trigger / Convert idea to plan) and the chat-demotion product decision are deferred & explicitly un-assumed.

---

## 4. A5.2 D1 — Deterministic loop core / referee (pure, no model)

**What & why.** The anti-hallucination heart of the Architect loop: given a model-proposed workspace for the active task, decide `accept` / `revise` / `reject` using ONLY the determinism engine. The model can never declare success — a task advances only when its machine check passes (M-ARCH-2). Headline guarantee: structurally valid XML that doesn't satisfy the task's intent is **sent back, never accepted**.

**Files / symbols.**
- `src/lib/architectLoop.ts` (new) —
  - types `ArchitectDecision = 'accept'|'revise'|'reject'`, `VetResult`.
  - `deriveApproach(base, proposed)` — sorted set of ADDED node tags, used as the lessons-log match key.
  - `nextActiveTask(b)` — first non-`done` task whose `blockedBy` are all done.
  - `loopStopReason(b, iterations, max)` — `complete` | `max-iterations` | `stalled` | `null`.
  - `vetTaskProposal({ base, proposed, blueprint, activeTaskId, knownTags, requirements, approach })` — runs `reviewProposal`; decision order: (1) `isRejectedApproach` → **reject**; (2) `!review.applySafe` (schema/graph fail or unknown/hallucinated tag) → **revise**; (3) active task's deterministic check fails on `evaluateBlueprintChecks(blueprint, proposed)` → **revise** (the valid-but-wrong catch); (4) → **accept**.
  - `runArchitectLoopSelftest()` oracle.
- `server.ts` — `import { runArchitectLoopSelftest }`; new route `GET /api/agent/architect-loop-selftest`; added `"/agent/architect-loop-selftest"` to `PUBLIC_READONLY_GETS`.

**Approach.** Reuses existing deterministic pieces (`proposalReview.reviewProposal`, `modBlueprint.evaluateBlueprintChecks`, `modBlueprint.isRejectedApproach`). The oracle injects a `knownTags` schema set exactly as the live loop does, so legit md.xsd tags (`event_game_started`) aren't false-flagged while `set_god_mode` still is (carries the A4.5 false-block lesson forward).

**Validation.** `architect-loop-selftest` **14/14** via the live endpoint — including `accept_when_safe_and_task_passes`, `revise_on_valid_but_wrong` + `valid_but_wrong_is_still_applySafe` (proves the *intent* check, not the hard gate, catches it), `revise_on_unknown_tag` + `unknown_tag_not_applySafe`, `reject_on_rejected_approach`, `deriveApproach_added_tags`, `next_is_unblocked_first` / `next_advances_after_unblock`, and all four `loopStopReason` states.

**Status.** ✅ Done & verified live.

---

## 5. A5.2 D2 — Live model wiring

**What & why.** Put the real OpenRouter model into the loop for the per-task node proposal, grounded on actual state rather than recall.

**Files / symbols.**
- `src/App.tsx` — inside `runArchitectStep()`: builds a prompt from `blueprint.intent` + the SPECIFIC active task title + its `doneCheck` + the lessons log ("do NOT repeat these rejected approaches: …"); `POST /api/agent/generate` with `{ prompt, currentWorkspace, diagnostics, apply:false }` and `getAIHeaders()`; consumes `data.workspace` (proposed) and `data.requirements`.

**Approach.** Reuses the existing Builder generation endpoint (staged, `apply:false`) rather than a new endpoint. The proposed workspace + `data.requirements` + `aiKnownTags` feed straight into `vetTaskProposal`.

**Validation.** A real OpenRouter round-trip (deepseek-v4-pro) completed live; the returned proposal flowed through the referee and rendered a decision (see D3 / D4).

**Status.** ✅ Built; a live round-trip confirmed working.

---

## 6. A5.2 D3 — Orchestration + UI + blueprint-state lift

**What & why.** Wire the loop into the UI and make App the single source of truth for the blueprint (so the loop and the panel share one object), without regressing A5.5's verified editing.

**Files / symbols.**
- `src/App.tsx` —
  - **State lift:** `architectBlueprint` state (init `loadBlueprint() || sampleBlueprint()`); `setArchitectBlueprint(b)` sets state **and** `saveBlueprint(b)`; `architectRunning`, `architectStep` states; `architectPendingRef` (accepted proposal awaiting Confirm).
  - Handlers: `runArchitectStep()` (pick task → generate → vet → accept stages for Confirm / revise → non-blocking note / reject → `recordRejection` / error → no lessons); `confirmArchitectStep()` (`saveCheckpoint()` → `setWorkspace(pending.proposed)` → append changelog; the panel re-evaluates and auto-advances the task to `done` iff its check passes — M-ARCH-2); `declineArchitectStep()`; `architectCanRun = !!getProviderKey(getActiveProvider())`.
  - Imports added: `loadBlueprint, sampleBlueprint, saveBlueprint, recordRejection, evaluateBlueprintChecks, ModBlueprint` (modBlueprint); `vetTaskProposal, nextActiveTask` (architectLoop); `ArchitectStepView` type (BlueprintPanel); `getProviderKey` (apiHelper).
  - Both `AIHelper` renders (floating in App, docked via Sidebar) receive the full architect prop set.
- `src/components/BlueprintPanel.tsx` —
  - exported `ArchitectStepView` interface.
  - **Controlled-with-fallback:** `bp = onChange ? blueprint : localBp`; `update(next)` calls `onChange(next)` when supplied, else `setLocalBp + saveBlueprint`. This keeps A5.5 standalone editing intact while letting App own state.
  - New "Run Architect step" button + step-result card (accept → SCHEMA/GRAPH/INTENT verdict chips + Confirm&apply / Decline; revise → amber "sent back"; reject → red "logged to lessons"; error → red "step failed"); `verdictColor` helper.
- `src/components/AIHelper.tsx` — new props (`architectBlueprint`, `onBlueprintChange`, `onRunArchitectStep`, `architectRunning`, `architectStep`, `onConfirmArchitectStep`, `onDeclineArchitectStep`, `architectCanRun`, `architectRunDisabledReason`); `architectBlueprint = prop ?? fallbackMemo`; all forwarded to `BlueprintPanel`.
- `src/components/Sidebar.tsx` — same prop set added to `SidebarProps`, destructured, and forwarded to the docked `AIHelper`; App passes them to `Sidebar`.

**Approach / data flow.** App owns `architectBlueprint` → threaded to both AIHelper instances → BlueprintPanel (controlled). The loop reads/writes the same App object. Apply path is checkpoint-before-mutate; task status is never set by the model — it's derived by `evaluateBlueprintChecks` against the live workspace.

**Validation.** Browser screenshots: cobuild Architect tab renders the Run control + "2/3 tasks verified done" + task list with per-task checks. A live Run produced a real model proposal that the referee returned as **"SENT BACK FOR REVISION" (SCHEMA WARN · GRAPH FAIL · INTENT FAIL), nothing applied** — confirming the loop end-to-end on the revise path. HMR updated cleanly; no app console errors (only Chrome-extension channel noise).

**Status.** ✅ Built & partly verified live (revise path). The **accept → Confirm → task auto-advances to `done`** happy path (M-ARCH-2 live) is not yet verified — blocked on the API restart (see §9).

---

## 7. Bug fix (live-found #1) — task selection used unevaluated statuses

**Symptom.** The first live Run targeted "Startup cue present" (already satisfied by the current canvas) instead of the actually-open "Game-start trigger wired".

**Cause.** `nextActiveTask(architectBlueprint)` read the **raw stored** blueprint, whose task statuses were all `pending` (the panel only derives `done` in a display-time memo). So it picked the first stored-pending task regardless of the live workspace.

**Fix.** `src/App.tsx`, in `runArchitectStep()`: evaluate first, then pick — `const bp = evaluateBlueprintChecks(architectBlueprint, workspace); const task = nextActiveTask(bp);`. Added `evaluateBlueprintChecks` to the modBlueprint import.

**Found by.** Live screenshot showing the wrong task title in the step-result card.

---

## 8. Bug fix (live-found #2) — network error mislabeled as a referee "reject"

**Symptom.** A transient "Failed to fetch" (API down) rendered as **"REJECTED — logged to lessons"**, implying a referee decision and lessons-log pollution.

**Cause.** The `catch` in `runArchitectStep()` set `decision:'reject'`; BlueprintPanel's `reject` branch shows "logged to lessons".

**Fix.**
- `src/components/BlueprintPanel.tsx` — `ArchitectStepView.decision` union extended with `'error'`; the step card renders `error` as a red **"Step failed"** with a "Run again to retry" note and **no** "logged to lessons" text; container color treats `error` like `reject` (red) but the label/footer differ.
- `src/App.tsx` — `catch` now sets `decision:'error'` (both AbortError and general failures) and **never** calls `recordRejection`.

**Related correctness fix (same edit).** Split the lessons-log recording by decision: only **`reject`** (a genuinely rejected approach) calls `recordRejection` (blocking, via `deriveApproach` signature); **`revise`** now writes a **non-blocking** `scratchpad.notes` entry instead — because revise means "refine & retry" and may legitimately reuse the same tags, so it must not be added to the blocking lessons log (which would risk false-rejecting the correct approach via substring match).

**Found by.** Live screenshots of the failed fetch + reasoning about the lessons-log match semantics.

---

## 9. Open / blocked  *(updated 2026-06-17 after host restart)*

- **A5.2 D4 (live end-to-end):** ✅ MOSTLY VERIFIED. After the host restart, re-confirmed `architect-loop-selftest` 14/14 live, then ran the loop on "Game-start trigger wired":
  - Correct-task targeting (bug #1 fix) verified live.
  - **Headline guarantee verified live on 3 consecutive real model outputs** — deepseek-v4-pro returned valid proposals (incl. SCHEMA PASS · GRAPH PASS · INTENT FAIL) and the referee sent every one back, applied nothing, advanced no task, polluted no lessons log. M-ARCH-2 working on live output.
  - **Accept → Confirm → advance NOT captured live** because deepseek-v4-pro never produced an intent-satisfying proposal (0/3). Accept decision is oracle-proven (14/14); Confirm→apply reuses the verified A4.2 checkpoint+setWorkspace + A5.3 auto-advance. The live `2/3 → 3/3` screenshot is gated on a stronger model. This confirms the roadmap's documented model-capability dependency.
  - **Decision pending:** accept the oracle-proven accept-path + documented model limitation, OR point the loop at a stronger model and re-run for the happy-path screenshot.
- **N2 (station-module display names):** not started; queued next.

All code changes above are written to disk; nothing in this changelog requires the dev server. Per-item roadmap entries in `ROADMAP.md` carry the same detail.
