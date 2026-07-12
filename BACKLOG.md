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

### B2 · Sync protocol replacement (ADR-F1) — slices 1–2 ✅ CLOSED (07-09/07-10) → ROADMAP; slice 3 `spec'd`
Slices 1+2 live: full client↔server CAS with the WRITE CONFLICT card (Adopt/Keep-mine), adoption held
during conflicts. **Slice 3 (remaining):** per-mod-id server state keying (absorbs one-project-model;
multi-workspace B12 rides on it). **Acceptance:** two simulated clients cannot silently overwrite each
other *per mod*; e2e workspace-guard removed as the proof.

### B3 · Console health probe — ✅ CLOSED 2026-07-09 → ROADMAP (Ken's live drill: closed the Web window →
respawned ~60s; closed the API window → respawned; both verified from the agent side, app + API answering)

### B25 · AI spend meter + limit — `spec'd` (from the 2026-07-11 standing-hazard sweep)
`callMultiProviderAI` is the single spend chokepoint (~10 call sites; the orchestration chain fires up
to 5 provider calls per user request). Gates exist (tier default-off, per-call token cap, origin-locked
keys) but **no cumulative meter, no session/daily limit** — the neural-link $256 lesson shape. Scope:
count calls+tokens per provider per day at the chokepoint (one-point change), local meter surface,
soft-stop at a configurable daily cap with an explicit user override. **Acceptance:** meter visible;
cap trips in a test; zero behavior change while tier is off.

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

### B5 · Sidebar Properties Inspector extraction — ✅ CLOSED 2026-07-10 → ROADMAP (flipped by B15's fix; suite 11/11)

### B15 · canvas-interactions RED — ✅ CLOSED 2026-07-10 → ROADMAP (root cause: B1 adoption poll vs the
spec's POST-only isolation; GET isolation ported with capture-first toggles; suite 11/11, spec 3× green)

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

### B9 · One-click distributable — ✅ CLOSED 2026-07-10 → ROADMAP (zero-dep zip engine, 21/21 oracle,
independent-extractor verified, gate blocks red builds, Playtest button live)

## P3.5 — Vision v2: barrier-to-entry track (ADR-F2, ratified 2026-07-11)

> Direction: "the UE5 editor for X4" — TTFM (Time To First Mod) is the north-star metric.
> Full plan + sequencing rationale: `docs/plans/2026-07-11-vision-v2-ue5-editor.md`. Items below
> are Phase 1/2 (buildable now); Phase 3 rides B2s3/B8; Phase 4 starts with the B24 spike.

### B18 · First-run setup wizard + game autodetect — ◐ IMPLEMENTED 2026-07-11 → ROADMAP
All backend stages live-proven on the real machine (detect via registry+VDF, harvest 3 XSDs from
cat/dat, apply = existing /api/schema/config); oracle 10/10; sweep 67/67; e2e 11/11. **Open:** wizard
visuals → eyeball batch (⚠ ?firstrun=1 LOOK ONLY — apply would rewrite Ken's real config); fresh-boot
acceptance (<2min zero-typing) → scratch checkout or B23 stranger test; GOG branch unverified.

### B27 · Selftest index endpoint for sweep discovery — `spec'd` (B18 AAR worst-pick)
oracle-sweep discovers via regex-over-source TWICE (allowlist block + SELFTESTS map) — brittle; the
registry already holds the truth. Add `GET /api/agent/selftest-index` (registry-fed, public) and make
the sweep prefer it (source-parse as offline fallback). **Acceptance:** sweep count identical from
both discovery paths; a new registry oracle appears in both automatically.

### B19 · Template → in-game guided rail — slice 1 ◐ IMPLEMENTED 2026-07-11 → ROADMAP (ABSORBS audit #7)
Slice 1 shipped: GuidedRail (3 steps, deploy-verify inline, live watcher poll), RailGuide metadata on
all 3 non-blank templates, sourceId plumbing; e2e `guided-rail.spec.ts` green (suite 12/12), sweep
67/67. **Open:** rail feel → eyeball batch; rail-to-game EXPERIENCE + in-game template stamps →
in-game batch (game-gated). **Slice 2 spec'd:** beyond-canvas starter intents (price-tweak XML patch,
t-file text, HUD button); crisp server-computed "mod loaded and clean" verdict field in the
debug-watcher brief (kills the rail's heuristic field guesses). **Acceptance (unchanged, final):** a
non-author tester ships welcome-message to a running game on on-screen guidance alone.

### B20 · TTFM instrumentation — ✅ CLOSED 2026-07-11 → ROADMAP (oracle 9/9, sweep 68/68, e2e 12/12;
report panel deferred until the first real funnel completes)

### B21 · MD action-frequency census — `spec'd` (Phase 2; gates B10 spend — measure first)
Rank 785 actions by frequency over vanilla+DLC corpus (+available mods); output curation priority +
coverage math. House pattern (lib + oracle + GET). **Acceptance:** oracle green; "top N = X% usage"
table in the close; B10 re-scoped from it.

### B22 · Pattern browser — `spec'd` (Phase 2; DeadAir knowledge moves INTO the product)
Stampable validated workspace fragments w/ provenance, stamped via EXISTING quick-fix graph-mutation
ops. **Acceptance:** browse → stamp → 0 errors → deployable; provenance renders.

### B23 · Installer unpark decision package — `blocked` (Phase 3; KEN GATE, after Phase 1 lands)
When TTFM-in-app measured ≤15 min: present B8 unpark w/ funnel evidence; Electron-vs-single-binary
ADR at unpark. Until then B8 stays parked.

### B24 · Live game-state inspector SPIKE — `spec'd` (Phase 4; output = ADR, NOT code)
Evaluate world-outliner data paths (debuglog protocol / opt-in companion mod / bridge lessons-only).
Constraints: optional, read-only default, zero impact absent. Any write path = separate, write-gated.

## P4 — Depth / UX long tail

### B10 · G12: long-tail action semantics — `spec'd` (PROMOTED to Vision-v2 Phase 2 by ADR-F2)
~40 of 785 actions have curated meaning; explainer/simulator stay shallow (honest-unknown) on the rest.
Re-scoped 2026-07-11: **B21's census runs FIRST** (measure before curating); then milestone slices
(N=75, N=150…) until coverage ≥ ~90% of observed usage. No longer "long tail" — for the barrier-to-entry
brief this is core hand-holding depth.

### B11 · G13 residual: aiscripts visually editable — `spec'd`
Wares/jobs slice done; aiscripts import editable only when byte-faithful (#65 guards) but have no visual
editor surface beyond code view.

### B12 · Multi-workspace tabs — `spec'd` (largely absorbed by B2's per-mod server state)

### B13 · QoL batch — `in_progress` ◐ (batch 1 machine-verified 2026-07-11; awaiting Ken's eyeball)
**Batch 1 implemented (uncommitted), all machine gates green 2026-07-11** (tsc 0 / sweep 35/35 / full e2e
11/11 — see ROADMAP ◐ entry): empty-state XML skeletons; canvas delete toast + Ctrl+Z hint; library delete
toast with REAL undo checkpoint; ShortcutsOverlay ("?"/button/Esc); badge clip fix. Auto-select-on-create
found ALREADY existing (reconcile). **Remaining to flip ✅:** Ken's eyeball on ① canvas delete toast,
② library delete toast+Undo, ③ empty-state skeletons (empty scratch library), ④ compact badge narrow.
**Still spec'd (batch 2, deliberately deferred):** override-map entry click → Diff→Patch pre-targeted at
that file; "wire a HUD button in 3 steps" WIKI snippet.

### B17 · e2e gate hygiene — ✅ CLOSED 2026-07-11 → ROADMAP (green/red/no-tests all verified; Node-bump
probe ◐ Ken-gated machine change)

### B26 · workspace-guard restore self-check — `spec'd` (B17 AAR worst-pick)
Guard restore is verified manually (authenticated GET) after every e2e run; nothing asserts it.
Scope: workspace-guard.teardown verifies the restored workspace matches its snapshot (name+hash) and
fails LOUDLY on mismatch. **Acceptance:** simulated restore failure → teardown reports it, wrapper red.

### B16 · run_command async-job mode — ✅ CLOSED 2026-07-09 → ROADMAP (dogfood-verified: app answered in 7ms mid-job)

### B14 · Staleness-era leftovers — `spec'd`
Full server-side XPath match counts (needs an XPath lib decision); golden round-trip corpus across several
real published mods (needs mod paths from Ken); T1.3 runtime ftable loader (gated on in-game verification);
mod profiles / update audit (P-C/P-D); T4.3 canvas cross-domain arrow.
