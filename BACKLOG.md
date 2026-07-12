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

### B2 · Sync protocol replacement (ADR-F1) — ✅ ALL SLICES CLOSED (s1–2 07-09/07-10, s3 2026-07-12) → ROADMAP
Slice 3 closed 07-12: persistence + chokepoint + legacy gate + park-on-switch; acceptance proven live
(zero-client restart survival ×2; blank-client incident reproduction → dead). Residuals folded into B26
(guard self-check + RESET-button audit + guard-removal decision). B12 tabs ride the parked-state map.

### B3 · Console health probe — ✅ CLOSED 2026-07-09 → ROADMAP (Ken's live drill: closed the Web window →
respawned ~60s; closed the API window → respawned; both verified from the agent side, app + API answering)

### B25 · AI spend meter + daily cap — ✅ CLOSED 2026-07-11 → ROADMAP (oracle 7/7, sweep 70/70;
GET /api/ai/usage live; cap-trip proven by oracle, not by spending)

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

### B27 · Selftest index endpoint — ✅ CLOSED 2026-07-11 → ROADMAP (sweep 71/71 via runtime index;
acceptance diff caught 2 census errors incl. a nested-path oracle NO prior method ever swept)

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

### B21 · MD action-frequency census — ✅ CLOSED 2026-07-11 → ROADMAP (oracle 12/12; live corpus:
106,437 instances, top-52 actions = 90% of usage, curated already 41.4% of instances)

### B22 · Pattern browser — slice 1 ◐ IMPLEMENTED 2026-07-11 → ROADMAP (4 proven patterns, oracle 9/9,
DOM-verified browse→stamp; slice 2: mid-canvas stamping via graph-mutation ops + unified card component)

### B28 · Browser-pane renderer wedge — `spec'd` (recurring tool hazard, 3× on 2026-07-11, 2× more on 07-12)
Pane renderer stops answering screenshots after HMR + setWorkspace churn (JS/DOM stays alive;
navigate-reload recovers). Suspect the canvas rAF loop + HMR interplay. Root-cause pass; until then
the banked workaround is DOM-read validation + reload. **New evidence 07-12:** in the degraded state
the pane also serves STALE SCREENSHOT FRAMES and physical clicks fail to land even when the click echo
reports the correct DOM coordinates (wizard-✕ looked broken for 2 clicks; btn.click() + DOM-read proved
the app handler fine) — when the pane misbehaves, trust ONLY DOM reads, never pixels or click echoes.
**Third mode (07-12, B2s3 close):** long-running JS evals get killed mid-flight ("Inspected target
navigated or closed", "Promise was collected") — 3 drill interruptions; workaround: pane JS must be
short-lived (<~2s), no multi-second awaits; split drills into per-action calls.

### B29 · Header horizontal overflow — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Fits at 1280 AND 1920 (DOM-rect drills, 0 clipped controls); conflict card promoted to a fixed
sync-status layer (unclippable by construction); live-409 negative path proven at 1280; e2e 12/12,
sweep 73/73. Bonus: found+fixed the B2s3 Vite watch-ignore gap (persistence writes were
full-reloading every client) and closed the Keep-mine residual end-to-end. Note: label-restore
threshold min-[2150px] is a measured constant — re-measure if the header gains features.

### B23 · Installer unpark decision package — `blocked` (Phase 3; KEN GATE, after Phase 1 lands)
When TTFM-in-app measured ≤15 min: present B8 unpark w/ funnel evidence; Electron-vs-single-binary
ADR at unpark. Until then B8 stays parked.

### B24 · Live game-state inspector — SPIKE ✅ CLOSED 2026-07-11 → **ADR-F3** (StarForge decisions.md);
slices spec'd below
**B24s1 · FORGE-STATE parser + read-only Inspector panel** — `spec'd`: parse `FORGE-STATE {json}`
debuglog lines via the existing watcher tail; panel renders whatever arrives (works with hand-authored
probe cues). **B24s2 · probe-extension generator** — `spec'd`, gated on s1: Forge generates
`x4_forge_probe` on demand (faction census / player assets / cue heartbeats), deploy write-gated,
save-removable. Bridge = lessons only, never a dependency. Constraints (binding): optional, read-only,
zero impact absent.

## P4 — Depth / UX long tail

### B10 · curated action semantics — slice 1 ✅ CLOSED 2026-07-11 → ROADMAP (**91.5%** of observed
usage curated; oracle 50/50). Remaining (optional depth, demand-driven): tags beyond the top 52; the
xsdParser `structural` category rider (B21 close) so census/palette stop calling child elements actions.

### B11 · G13 residual: aiscripts visually editable — `spec'd`
Wares/jobs slice done; aiscripts import editable only when byte-faithful (#65 guards) but have no visual
editor surface beyond code view.

### B12 · Multi-workspace tabs — `spec'd` (largely absorbed by B2's per-mod server state)

### B13 · QoL batch — batch 1 ✅ VERIFIED 2026-07-12 (all surfaces agent-confirmed; Ken feel-pass optional)
Batch 1 surfaces browser-confirmed live by the agent (per Ken's validate-visually directive): canvas
delete toast + undo ✅ · library delete toast + undo loop ✅ (PLUS fix: last-item delete was impossible —
"keep at least one" guard removed, zero-state legal) · empty-state skeletons ✅ · ShortcutsOverlay ✅
(prior session) · FirstRunWizard ✕ ✅ (07-12: DOM-verified present→click→absent; handler wired) ·
conflict-card narrow-width ✅ VERIFIED with defect found (07-12: real 409 produced live; compact ⚠
collapse works at <xl, BUT the card sits off-screen — header overflow, spun out as **B29**).
**Batch 2 (spec'd):** override-map click → Diff→Patch pre-target; "wire a HUD button in 3 steps" WIKI
snippet.

### B17 · e2e gate hygiene — ✅ CLOSED 2026-07-11 → ROADMAP (green/red/no-tests all verified; Node-bump
probe ◐ Ken-gated machine change)

### B26 · workspace-guard restore self-check — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Restore-verify marker + wrapper red-on-FAIL (negative path drilled); api-selftest 6/6 covers all gate
branches; RESET audited clean (CAS + parks); runtime-writes audit found+fixed a 2nd vite gap (data/**).
Guard KEPT until B31. Residual note: verify line can race the libuv crash → B31 moves it in-process.

### B31 · Ephemeral e2e server state — `spec'd` (B2s3 AAR worst-pick, 2026-07-12; renumbered from B30 — collision with the parallel v3-adoption session's mirror-drift gate)
The e2e isolation harness route-mocks around the SHARED live singleton — half-isolation has now
caused/complicated three incident classes (B15 RED, guard-leak class #70, the 07-12 suppression
interplay). With B2s3's per-mod persisted state landed, the right shape: e2e runs against an EPHEMERAL
server state (per-run state dir via env flag, or a fixture mod key), killing route-mocks AND the guard.
**Acceptance:** suite green with zero `page.route('**/api/agent/workspace')` interceptions and zero
guard dependence; Ken's live workspace untouched by construction, not by restoration.

### B16 · run_command async-job mode — ✅ CLOSED 2026-07-09 → ROADMAP (dogfood-verified: app answered in 7ms mid-job)

### B14 · Staleness-era leftovers — `spec'd`
Full server-side XPath match counts (needs an XPath lib decision); golden round-trip corpus across several
real published mods (needs mod paths from Ken); T1.3 runtime ftable loader (gated on in-game verification);
mod profiles / update audit (P-C/P-D); T4.3 canvas cross-domain arrow.

### B32 · Recurring-mistake tripwires — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
TRIPWIRES table in precommit-check.mjs (runs before typecheck, named messages); negative drill BLOCKED
exit 1, green tree exit 0. Add future mechanical-mistake patterns to the table.

### B30 · Mirror-drift gate — `spec'd` (added 2026-07-12, from the workflow-v3 AAR)
Canon lives in 3 in-repo mirrors (CLAUDE.md/AGENTS.md/GEMINI.md) + the global F:\DEV_ENV\CLAUDE.md,
synced by hand — the exact drift class that let an agent work a full session without the workflow
(2026-07-09). Extend `scripts/precommit-check.mjs` to diff the three in-repo mirrors and FAIL on
divergence. Acceptance: precommit red when any mirror differs; green now (md5-identical as of v3
adoption); ROADMAP close cites a deliberate-divergence test.
