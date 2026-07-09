# X4 Forge — BACKLOG (open work ONLY)

> Workflow v2 records policy: this file stays SMALL — spec'd / in-progress items with states and owners.
> Sessions START here. Closing an item MOVES it into ROADMAP.md as a dated, verification-cited entry.
> States: `spec'd` · `in_progress` · `blocked` · `parked`. Owner is whoever picks it up (agent or Ken).

## P1 — Safety / architecture

### B1 · Workspace sync-trust slice — ✅ CLOSED 2026-07-09 → ROADMAP (badge verified live; residual: badge clipping polish → B13)
### B1-old spec (kept for context) — `done`
The mutable-singleton + integer-version sync has caused two incident classes (e2e clobber; the 2026-07-09
stale-canvas overwrite). Full redesign is B2; this slice makes staleness VISIBLE and self-healing.
**Scope:** server computes a content hash of the active workspace and returns it from `GET /api/agent/workspace`
(and bumps it on every write); client compares its canvas hash each poll; on mismatch-with-no-local-edits it
adopts (version gate stays as tiebreak), on mismatch-with-local-edits it shows a visible badge
("Canvas differs from server — Adopt server / Keep mine") instead of deciding silently.
**Acceptance:** oracle for the hash (stable across key order, sensitive to node/property change); simulated
divergence shows the badge; adopt button converges; tsc/sweep green.

### B2 · Sync protocol replacement: content-addressed workspace states — `spec'd`, **design DECIDED (ADR-F1, 2026-07-09)**
Full design in `F:\StarForge\wiki\x4-forge\decisions.md` → ADR-F1 (CAS over content-addressed states;
fast-forward-only adoption; explicit conflict UI; legacy writes one deprecation round; keyed per mod id —
absorbs the one-project-model refactor). **First slice (next session, bounded):** server head tracking
(`{hash, parentHash, at, origin}` on every write) + `expectedHead` CAS on `POST /api/agent/workspace` +
409 conflict payload with both heads — no UI change needed (the B1 badge already renders divergence);
reuses `workspaceContentHash`. **Acceptance:** two simulated clients cannot silently overwrite each other;
e2e workspace-guard removed as the proof.

### B3 · Console health probe — ◐ built 2026-07-09 (watchdog + web supervisor wired into restart-studio); flip ✅ after one observed live recovery at next restart
Supervisor respawns the API process only; a dead console/vite (lived 2026-07-09) needs a human.
**Scope:** watchdog loop pings 3000 + 3001 every ~20s, respawns whichever is down, logs restarts.
**Acceptance:** kill vite → auto-recovers; kill API → auto-recovers; both logged.

## P2 — Committed audit work (deferred by budget)

### B4 · R3: quick-fix graph mutations — ✅ CLOSED 2026-07-09 → ROADMAP (oracle 20/20, headless compile-legal
proof; ◐ residual: in-UI eyeball of the new cards at Ken's next session)
### B4-old spec (kept for context) — `done`
Extend `QuickFixDescriptor` ops with graph mutations (`add_node` / `add_link`); make modFixes'
"cue has no trigger" ADVICE a MECHANICAL one-click fix (adds + wires an event node); fold the 💡 advice
block into the 🔧 apply block; retire `modFixes.ts` + its selftest once absorbed.
**Acceptance:** quick-fixes oracle covers add_node/add_link paths; a triggerless cue on a scratch workspace
gets a working one-click fix (validated by compile + crossfile); modFixes selftest removed from the sweep
with its checks migrated.

### B5 · Sidebar Properties Inspector extraction — ◐ DONE 2026-07-09 (Ken overrode the deferral: "you have
the context in this session"). Extraction complete + live-verified (screenshot); flips ✅ with B15.

### B15 · canvas-interactions.spec.ts RED — cause not isolated — `spec'd` (investigation, NEXT SESSION)
Times out at its palette-add step (`reward_player`), page closed after 60s. Facts: fails 3× consecutively on
UNCHANGED spec code (all experiments reverted); PASSED earlier the same evening post-B5-extraction (run 1);
both suspect surfaces (Sidebar palette, PropertiesInspector) proven working in the live browser with a
screenshot; canvas-coverage's similar seeded tests pass 3/3 in 19s after their harness fix; the machine
showed repeated renderer freezes/CDP timeouts under load all evening. Suspects, in order: environment
(memory/load — retry on a quiet machine first), the B1 3s poll interacting with this spec's non-isolated
harness (add the canvas-coverage GET-isolation pattern), a real palette regression (least likely given the
live proof). **Acceptance:** spec green 3× consecutively, or failure pinned with evidence.

### B6 · xmldom scan — ✅ CLOSED 2026-07-09 → ROADMAP (DOM-first with regex degrade; 8 new oracle checks; real mod compiles clean)

### B7 · Small fixes pair — ✅ CLOSED 2026-07-09 → ROADMAP (drift verdict + wizard checklist, both verified live)
(a) `computeModDrift` excludes tool-owned metadata (`.studio-mod-id`, `.forgekeep`) from the VERDICT
(still listed, never "drifted" alone). (b) Compile wizard renders the deploy-verify checklist card in the
wizard's result step (verdict currently hides in the Playtest tab).
**Acceptance:** drift on the real mod reports `identical`; wizard confirm shows per-stage rows incl.
source-sync; a stale-canvas 409 renders the failure row, not a toast.

## P3 — Release track (parked: Ken's call on timing)

### B8 · G5: packaged installable build — `parked`
Single artifact a non-dev installs (Electron or single-binary + static bundle); includes G6 residuals
(README, support docs, release assets). Production mode already exists (API_ONLY + static serving +
run_command gated out).

### B9 · One-click distributable — `spec'd`
"Package for Nexus": zip with content.xml version bump + README scaffold, building on the compiler +
deploy-verify (only packages a green preflight).

## P4 — Depth / UX long tail

### B10 · G12: long-tail action semantics — `spec'd`
~40 of 785 actions have curated meaning; explainer/simulator stay shallow (honest-unknown) on the rest.
Expand curated coverage for the most-used modding actions (frequency-ranked from the vanilla corpus).

### B11 · G13 residual: aiscripts visually editable — `spec'd`
Wares/jobs slice done; aiscripts import editable only when byte-faithful (#65 guards) but have no visual
editor surface beyond code view.

### B12 · Multi-workspace tabs — `spec'd` (largely absorbed by B2's per-mod server state)

### B13 · QoL batch — `spec'd`
Auto-select on create (wares ADD leaves "NO ACTIVE ASSET SELECTED"); consistent empty-state skeletons
(WARES.XML preview blank at zero wares); delete toast with visible Undo; keyboard-shortcut audit + docs;
override-map entry click → Diff→Patch pre-targeted at that file; "wire a HUD button in 3 steps" WIKI snippet.
Added 2026-07-09: preset dropdown needs a CONFIRM guard (it can silently REPLACE the canvas, incl. re-apply
on reload — lived twice); sync-diverged badge clips on narrow headers (overflow handling).

### B14 · Staleness-era leftovers — `spec'd`
Full server-side XPath match counts (needs an XPath lib decision); golden round-trip corpus across several
real published mods (needs mod paths from Ken); T1.3 runtime ftable loader (gated on in-game verification);
mod profiles / update audit (P-C/P-D); T4.3 canvas cross-domain arrow.
