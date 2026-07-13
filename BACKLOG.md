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

### B19 · Template → in-game guided rail — s1 ◐ (07-11) · s2a+s2b ✅ CLOSED 2026-07-12 → ROADMAP
s2a: server `verdict` field (oracle 9/9) — rail + Playtest render it, TTFM gated on true loaded_clean.
s2b: beyond-canvas templates (price patch / t-file / HUD button, oracle 23/23) + the two coupling
fixes (onboarding empty-in-every-domain; rail mounts on any-domain content). **Open (game-gated):**
rail-to-game EXPERIENCE + template stamps → in-game batch. **Acceptance (final):** a non-author tester
ships welcome-message to a running game on on-screen guidance alone.

### B33 · RESET → template picker — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
(dead starter cue removed from BLANK_WORKSPACE; RESET→picker proven live; sweep 75/75, e2e 12/12)

### B20 · TTFM instrumentation — ✅ CLOSED 2026-07-11 → ROADMAP (oracle 9/9, sweep 68/68, e2e 12/12;
report panel deferred until the first real funnel completes)

### B21 · MD action-frequency census — ✅ CLOSED 2026-07-11 → ROADMAP (oracle 12/12; live corpus:
106,437 instances, top-52 actions = 90% of usage, curated already 41.4% of instances)

### B22 · Pattern browser — s1 ◐ (07-11) · s2 ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Mid-canvas stamping live (oracle 16/16 incl. a caught cue-name-collision defect; stamp→undo drill
green). Card unification deferred → B13 batch 2.

### B28 · Browser-pane wedge — ◐ CLOSED-RECLASSIFIED 2026-07-12 (workflow v3, PARTIAL) → ROADMAP
Ours (Vite watch gaps killing evals) fixed via B29/B26; the tool's (screenshot/stale-frame/click-desync
in the pane's capture path) banked with workarounds — no buildable Forge unit remains. Escalate
upstream if it persists across sessions.

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
**B24s1 · FORGE-STATE parser + Inspector panel** — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) →
ROADMAP (oracle 12/12; endpoint + panel DOM-proven against a synthetic fixture; in-game emission →
in-game batch). **B24s2 · probe-extension generator** — ◐ IMPLEMENTED 2026-07-13 → ROADMAP: generator
(`forgeProbe.ts`) + oracle 9/9 + read-only `/api/agent/probe/preview` all VERIFIED (probe compiles to 0
errors, read-only invariant enforced, round-trips the parser; also fixed a latent B24s1 `\"`-vs-`&quot;`
emit bug). **◐ residual = the deploy + in-game confirmation** (write gate + game session, Ken). Periodic
heartbeat needs a `checkinterval` emit the compiler lacks (further follow-up). Constraints (binding):
optional, read-only, zero impact absent; bridge = lessons only.

## P4 — Depth / UX long tail

### B10 · curated action semantics — slice 1 ✅ CLOSED 2026-07-11 → ROADMAP (**91.5%** of observed
usage curated; oracle 50/50). Remaining (optional depth, demand-driven): tags beyond the top 52; the
xsdParser `structural` category rider (B21 close) so census/palette stop calling child elements actions.

### B11 · aiscripts visually editable — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED — ALREADY EXISTED; stale entry)
Reconcile + live drill proved the full chain has existed since #65 + the AIScriptEditor: guarded
byte-faithful import → editable AIBehaviorScript model → the editor's visual pipeline edits it (UI field
edit → model updated, drill-proven). The "no visual surface beyond code view" claim was stale. No code
written — the workflow's redundant-infrastructure rule in action.

### B12 · Multi-workspace switcher — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
(parked-state optgroup in the header select; non-destructive round-trip proven via the real user flow;
tab-strip chrome deliberately out of scope — switch-without-loss was the substance)
· RESIDUAL CLOSED 2026-07-13: domain-aware `contentSummary` replaces "0 nodes" for beyond-canvas parked
states (oracle 11/11, live-verified). Standing-hazard sweep also run same day (clean + 1 dead-wipe
foot-gun removed) → ROADMAP.

### B13 · QoL batch — batch 1 ✅ (07-12) · batch 2 ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Batch 2: override-map→Diff→Patch pre-target (event+mailbox, mount-race caught+fixed) · HUD-button
3-step wiki guide · StarterCard unification (B22s2 deferral closed). All drills live; suite green.

### B17 · e2e gate hygiene — ✅ CLOSED 2026-07-11 → ROADMAP (green/red/no-tests all verified; Node-bump
probe ◐ Ken-gated machine change)

### B26 · workspace-guard restore self-check — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Restore-verify marker + wrapper red-on-FAIL (negative path drilled); api-selftest 6/6 covers all gate
branches; RESET audited clean (CAS + parks); runtime-writes audit found+fixed a 2nd vite gap (data/**).
Guard KEPT until B31. Residual note: verify line can race the libuv crash → B31 moves it in-process.

### B31 · Ephemeral e2e server state — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
Suite 12/12 ×2 on its own per-run stack; guard + all workspace route-mocks DELETED; live workspace
untouched with no restore ever running; acceptance literal (0 interceptions). e2e no longer needs the
machine-state ask. Bonus: the libuv crash didn't reproduce off the shared server (3 runs).

### B16 · run_command async-job mode — ✅ CLOSED 2026-07-09 → ROADMAP (dogfood-verified: app answered in 7ms mid-job)

### B14 · Staleness-era leftovers — ✅ FULLY DISPOSITIONED 2026-07-12 (all remaining lines Ken/game-gated)
KEN-GATED: XPath match counts (lib = dependency DECISION, local-npm-only posture) · golden round-trip
corpus (needs Ken's mod paths) · P-C/P-D mod profiles (stale spec — keep-or-drop call). GAME-GATED:
T1.3 runtime ftable loader. T4.3 "canvas arrow" → CLOSED (already resolved by substitution in the 37th
pass: the PropertiesInspector's contextual Lua↔MD binding panel; live-drilled 07-12 → ROADMAP).

### B32 · Recurring-mistake tripwires — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
TRIPWIRES table in precommit-check.mjs (runs before typecheck, named messages); negative drill BLOCKED
exit 1, green tree exit 0. Add future mechanical-mistake patterns to the table.

### B30 · Mirror-drift gate — ✅ CLOSED 2026-07-12 (workflow v3, VERIFIED) → ROADMAP
(precommit byte-compares the 3 in-repo mirrors; deliberate-divergence drill BLOCKED exit 1; green now.
The GLOBAL F:\DEV_ENV\CLAUDE.md copy remains Ken's named canon-lag item — outside this repo's gate.)
