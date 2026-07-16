# X4 Forge — BACKLOG (open work ONLY)

> Workflow v2 records policy: this file stays SMALL — spec'd / in-progress items with states and owners.
> Sessions START here. Closing an item MOVES it into ROADMAP.md as a dated, verification-cited entry.
> States: `spec'd` · `in_progress` · `blocked` · `parked`. Owner is whoever picks it up (agent or Ken).

## P0 — Active (this worktree branch)

### B41 · VS Code / Antigravity extension PoC — ✅ VERIFIED (both IDEs) 2026-07-15 → ROADMAP
Install-tested LIVE in desktop VS Code AND Antigravity (Ken authorized both installs): VSIX
installs, autoOpen launches the studio, the real UI renders in the webview over a managed
per-IDE sidecar (dynamic ports :62647 / :52030), representative edit→validate→compile→package
completes in each, Workspace Trust gate proven in Antigravity. VSIX 2092 files/16.77MB, inspected
clean. Standalone :3000 untouched. Evidence: `vscode-extension/evidence/VALIDATION.md`.
**Open (Ken, not blocking the tech result):** private-beta cohorts + go/no-go
(`vscode-extension/BETA-TEST-SCRIPT.md`); commit-of-this-branch decision.
**Residuals (bounded):** genericize server.ts baked default paths before ANY tester
distribution (13 machine literals ship in every build); optional X4_DATA_DIR seam so the
sidecar stops writing data/ into its install dir; port to main the 3 product/infra fixes
(prod token injection, db createRequire, e2e 127.0.0.1 pinning) — main already committed the
B34–B37 delta this session as ff38642.

### B42 · Agent key manager (scoped, expiring keys) + parity passes + ext icon — ✅ VERIFIED 2026-07-15 → ROADMAP
Named scoped expiring agent keys (read/write/deploy · 1h/24h/7d/30d/never · sha256-at-rest ·
one-time reveal · revoke · audit), AgentBridge AGENT KEYS tab, extension "Create Agent Key"
command, key-mgmt session-token-only. Oracle 18/18; e2e 19/19; sweep 79/81; full security
matrix + full key lifecycle proven LIVE in Antigravity (create→reveal→terminal use→scope
403→revoke→terminal 401). Parity: 19/19 surface engines 200 + visual panel passes. Icon
shipped; VSIX 0.0.2. Evidence: `vscode-extension/evidence/VALIDATION.md`.
**Open (Ken):** commit-of-branch decision; port the auth change + fixes to main. **Residual
(bounded):** attach-mode has no session credential, so the "Create Agent Key" command only
works against an owned sidecar (documented in the command's message).

### B43 · Gold-standard sidecar debugging (VS Code + Antigravity) — ✅ VERIFIED 2026-07-15 → ROADMAP
`x4forge.debug` (off/inspect/inspect-brk) spawns the sidecar under `--inspect` + auto-attaches the
IDE Node debugger. Proven LIVE in BOTH IDEs (debug toolbar active; Antigravity Call Stack "X4 Forge
Sidecar RUNNING"; VS Code "Debugger listening on ws://" + debug status). Source-level TS via
`x4forge.forgeRoot`; committed `.vscode/launch.json` for the controller. Default off = zero behavior
change (touched only vscode-extension/). VSIX 0.0.3, both IDEs. Evidence: `vscode-extension/evidence/VALIDATION.md`.

### B44 · Git-derived live version in the header — ✅ VERIFIED 2026-07-15 → ROADMAP
Header `v{__APP_VERSION__}` is now `major.minor.<git-commit-count>` (baked at build time), so it
moves with every commit and updates when users update the extension; tooltip `__APP_BUILD__` =
short SHA + commit date + dirty flag. Graceful fallback to package.json version if git absent.
`vite.config.ts` + `src/vite-env.d.ts` + one App.tsx attribute. Live-proven header "v1.0.213".

### B45 · Directory-save no longer gated on schema — ✅ VERIFIED 2026-07-15 → ROADMAP
`POST /api/schema/config` was 400-gated on schemaDir containing md.xsd+common.xsd, which
blocked saving the workspace/filesystem/game paths whenever the schema was absent/incomplete.
Now paths save independently; schema is validated + REPORTED (amber "saved, schema pending"),
never a hard gate. Server + DirectorySettingsModal. Live-proven: workspace-only save persists;
valid schema still loads (unpacked libraries → 402 events/807 actions). tsc/e2e 19/19.

### B46 · Full-corpus schema/reference validation — Phase 1 ✅ VERIFIED 2026-07-16; Phases 2–3 `spec'd`
**Phase 1 (multi-schema loader) SHIPPED:** `src/lib/schemaRegistry.ts` — discovers EVERY *.xsd
under the configured schema folder + game folder (bounded walk mirroring B51, base-over-DLC),
resolves transitive include chains, builds lazy per-domain indexes via the existing
`buildSchemaIndex`; `GET /api/agent/schema-registry` (+`?domain=` +`?refresh=1`), TTL registry
cache (cold walk 25.6s first-touch → 14ms cached). Oracle `schema-registry-selftest` 11/11
(synthetic: include chain, junk degrade, missing include, DLC preference). LIVE vs the real
unpacked 9.00: **40 domains** (incl. addon/coreaddon/cutscenes found in subdirs), 48 DLC dupes
shadowed, 0 unresolved includes; md 1507 / factions 1354 / gamestarts 1417 / parameters 1556 /
diff 4 elements. tsc/lint/precommit 0 · e2e 19/19 · sweep 82/85 (3 reds A/B-proven env-only).
MD path + getAiSchemaIndex untouched (validation behavior unchanged this phase BY DESIGN).
**Phase 2 (`spec'd`, fresh session):** file→schema routing (factions.xml→factions.xsd, emitted
patches→diff.xsd, wares/jobs/gamestarts/t/ui) wired into project/validate; negative-path
acceptance. NOTE for P2: the unpacked md.xsd flags 2 findings in the generator's synthetic MD
(md_generator_zero_findings env red) — investigate before routing. **Phase 3 (`spec'd`):**
full-corpus reference sets. Plan: `docs/plans/2026-07-15-full-corpus-validation.md`.

### B47 · Walkaround: neural-link bridge de-escalated to optional — ✅ VERIFIED 2026-07-15 → ROADMAP
Ken: the bridge is x4_ai_influence-specific (ADR-F3 "optional, never a dependency"), but the
startup walkaround warned amber "bridge DOWN" for EVERY mod. Now labeled "(optional)", a down
bridge reports neutral (unknown/grey) with copy naming its actual scope, never a warn, and no
longer counts toward "N items worth a look". healthCard.ts + oracle check pinning the negative.
Live-proven: counter 2→1, row grey with the optional copy. Oracle 9/9, tsc 0, precommit 0.

### B48 · Retire the hand-rolled code editor (Monaco swap + real-estate) — `spec'd` (SPECIFIED 2026-07-15)
Reconcile shrank the "heart surgery": the whole editor = ONE component (CodePreview.tsx, 1,255
lines, one mount in App.tsx, ~20-prop contract; shared state touches only App+itself). Phase 1
= swap the text/diff CORE for Monaco inside the existing shell (chrome/apply/CAS wiring intact,
BOTH shells benefit); Phase 2 = collapse-by-default for canvas real estate + extension-native
"Open in IDE editor" bridge. Plan: `docs/plans/2026-07-15-editor-replacement.md`. Fresh session.

### B49 · Marketplace — ✅ PUBLISHED to Open VSX (2026-07-16) → ROADMAP; MS Marketplace still gated
**LIVE:** `x4forge.x4-forge-studio v0.0.4`, MIT, pre-release, at
https://open-vsx.org/extension/x4forge/x4-forge-studio — auto-updates in Antigravity/Cursor/
Windsurf/VSCodium. Namespace `x4forge` claimed; token in `.env.local` (OVSX_PAT); README/LICENSE/
manifest finalized; bundle PII-clean. **UPDATE LOOP:** commit → bump version → `npm run package`
(vsce --pre-release) → `ovsx publish <vsix> -p $OVSX_PAT` (Ken-authorized each time). **STILL
OPEN (not blocking):** MS Marketplace — blocked on Azure DevOps org requiring a subscription
(their gate); revisit when Ken wants stock-VS-Code reach. Flip pre-release→stable via a normal
(non-`--pre-release`) package+publish when ready.

### B49-old · Marketplace readiness prep (superseded by the publish above)
VERIFIED: Antigravity pulls from **Open VSX** → dual-registry publish. **DONE 2026-07-16:**
① machine-path genericize — runtime defaults now empty/harvest-dir (xsdParser), fixtures+
placeholders scrubbed of usernames/drives; client bundle 0 traces; server.cjs remaining =
generic VDF fixtures + public mod-name provenance (assessed OK). Stranger-machine sim: bare
staged app boots 200, gamePath '', health verdict honestly `blocked`→wizard. ② liveBridge
better-sqlite3 static import → lazy degrade (portability crash killed). Sweep on BARE install
78/81 — expression-suggest 0/0 red is HONEST now (old G:\ default silently loaded Ken's real
schema; configured instances stay green). **Ken's part:** MS publisher account + Open VSX
namespace + license choice + beta-vs-prerelease call. Then: package.json publisher/repo/
keywords finalize → `vsce publish` + `ovsx publish` (each Ken-authorized). Plan:
`docs/plans/2026-07-15-marketplace-readiness.md`.

### B50 · Activity-bar launcher icon (click-to-run) — ✅ VERIFIED 2026-07-16 (Ken eyeball confirmed) → ROADMAP
Icon renders in the Activity Bar rail + launcher opens with working buttons — confirmed live on
Ken's screen 2026-07-16 (the only residual). Full implementation record in ROADMAP.

### B48 Phase 2 · Canvas real-estate (collapse-default) + lazy editor — ✅ VERIFIED 2026-07-16 (e2e 19/19)
Code pane starts COLLAPSED by default (canvas +164px wider live-measured), last choice persists
(localStorage `x4_forge_code_collapsed`); the CodeMirror chunk is a lazy `React.lazy`/Suspense
import (own 358KB/gz118 asset) NOT fetched until the pane is first opened — canvas-only sessions
never download it (verified: chunkLoaded=false while collapsed). Editor + persistent top bar +
all chrome intact; expand/collapse/persist drilled live. FOUND+FIXED live: the collapsed drawer
stayed full-width because the top-bar's intrinsic width defeated the aside's inline width via
flex min-content — `min-w-0` + `overflow-x-hidden` fixed it (300px collapsed confirmed). e2e:
experience-mode spec updated (Expert now opens the editor via the pull-tab, since collapsed-default).

### B53 · X4_DATA_DIR seam — runtime data survives extension updates — ◐ IMPLEMENTED 2026-07-16
`data/` (agent keys, AI keys, AI spend meter, api-registry, harvested schemas) was cwd-relative =
wiped on every extension update (like config.json was pre-B51). New `src/lib/dataDir.ts`
(`resolveDataDir`/`dataPath`, honors `X4_DATA_DIR`, NOT coupled to X4_STATE_DIR); 8 call sites
migrated (server.ts ×3, xsdParser ×2, aiKeyStore, gameDetectRoutes, validationRoutes); extension
passes `X4_DATA_DIR=<globalStorage>/data`. Oracle `data-dir-selftest` 4/4. Live-proven: a booted
sidecar wrote agent-keys.json into X4_DATA_DIR, not cwd.

### B48 · Real editor engine (CodeMirror 6) replaces hand-rolled CodePreview — Phase 1 ◐ IMPLEMENTED 2026-07-16
Swapped the transparent-textarea/pre editor + custom line-diff for CodeMirror 6 (`CodeMirrorField.tsx`),
behind flag `CODEMIRROR_EDITOR` (old renderer kept as fallback). Editable editor + read-only split
(MergeView) / unified (unifiedMergeView) diff; XML highlighting + line numbers native; chrome
(tabs, 7 toolbar btns, status bar, minimap, editable-badge, apply/save pills) PRESERVED. Decision:
CodeMirror not Monaco (CSP/worker-clean for the webview; both shells benefit). **VERIFIED live:**
editor mounts, edits flow to draft (DRAFT-MODIFIED flips), diff MergeView renders, syntax
highlight + gutter + status bar confirmed via DOM + screenshot; tsc 0. Bundle +360KB (lazy-load =
Phase 2 polish). **Open:** e2e (running), extension repackage, Phase 2 (collapse-default real
estate + optional native-IDE-tab bridge). Plan: `docs/plans/2026-07-15-editor-replacement.md`.

### B51 · Schema discovery (recursive, subdir-aware, multi-XSD) + config persistence — ◐ IMPLEMENTED 2026-07-16
Fixes reported bugs: (1) schema scanner only looked top-level for md.xsd/common.xsd, so pointing
it at an unpacked game (`…\X4 unpacked 9.00`) found nothing; now `discoverXsd` finds XSDs in
subdirs (md/, libraries/, aiscripts/), prefers base game over DLC copies, recurses as fallback.
(2) aiscripts.xsd now discovered + wired into `getAiSchemaIndex` (ai_schema loads from the game).
(3) directory settings didn't persist across extension updates — config.json now honors
`X4_CONFIG_DIR` (extension → globalStorage), NOT the throwaway state dir. Oracle
`schema-discovery-selftest` 9/9. **LIVE-PROVEN** against the real unpacked game: md_schema "1339
elements", ai_schema pass, config persists. Caught+fixed a self-inflicted e2e regression
(configPath fell back to X4_STATE_DIR which e2e sets). Plan/decision: this entry + capability-map.

### B52 · In-app bug reporter → GitHub Issues — ✅ VERIFIED 2026-07-16 (e2e 19/19) → ROADMAP; ships in next release after Ken commits
Ken's decision: reports land in KennyG1990/X4_Forge **Issues** tab; entry point must be obvious.
Built secret-free: header **REPORT BUG** button (amber, both modes — verified visible in Beginner
default) → modal (title/steps/attach-details with the exact context SHOWN to the user) → opens a
**prefilled github.com/…/issues/new?labels=bug** page the user submits themselves; COPY REPORT
clipboard fallback; secret redaction (x4fk_/64-hex/Bearer → [redacted]); URL-length truncation
with full-body clipboard rescue. Engine `src/lib/bugReport.ts` + oracle `bug-report-selftest`
**10/10** (served live). Manifest gains repository+bugs URLs (store "Report Issue" link). LIVE
drill: empty-title blocked ✓, filled report produced the exact prefilled URL (title/body/label/env
verified) ✓, context visible ✓, screenshot taken. Plan: `docs/plans/2026-07-16-bug-reporter.md`.

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

### B18 · First-run setup wizard + game autodetect — ✅ VERIFIED 2026-07-16 (visuals SEEN + fresh-boot acceptance on scratch) → ROADMAP
Both open gates closed 2026-07-16 on an ISOLATED scratch instance (X4_STATE/CONFIG/DATA_DIR →
scratchpad; game dir read-only): wizard visuals eyeballed via Claude-in-Chrome screenshots (modal,
detect card, proposal rows, buttons all render); full zero-typing auto-setup run end-to-end in
~15s (<2min bar) — detect→harvest 3 XSDs from real cat/dat→apply→reload → walkaround flipped
"2 blocking" → "nothing blocking", md 1507 elems + ai 1488 + 2333 scriptprops loaded from the
wizard's own writes. BONUS: the eyeball CAUGHT a real B53 coupling bug (proposal.xsdSchemaPath
was cwd-based while harvest writes to dataPath → extension auto-setup would point config at an
empty, update-wiped dir) — fixed in gameDetectRoutes.ts, live re-proven. **Residual (minor):**
GOG detect branch still unverified (no GOG install available); ships in 0.0.10.

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

### B37 · Beginner and Expert workspace shell — ✅ VERIFIED 2026-07-16 (Ken eyeball closed the last gate) → ROADMAP
Both shells confirmed rendering correctly live on Ken's screen 2026-07-16 — the only open gate
(the in-app screenshot transport had timed out on four captures; every machine-checkable layer was
already green: tsc/sweep 80/80/e2e 19/19/build/precommit/DOM+interaction drills). Full acceptance
contract: `docs/plans/2026-07-14-beginner-expert-workspace.md`.

### B38 · Playtest Deploy and Prove — `SPECIFIED` (implementation waits behind the B34-B37 commit point)
Consolidate the existing deploy-verify, watcher verdict, cue liveness, FORGE-WATCH/FORGE-STATE, source
navigation, and artifact surfaces into one deterministic proof session. Fix the reproduced blank-path Playtest
deploy bug (it currently omits the visible workspace), and let file-load evidence prove data-only mods are seen.
Exact current-workspace/game-target confirmation is mandatory; validation uses a purpose-built scratch workspace,
not an unsafe automatic clone. Full acceptance record: `docs/plans/2026-07-15-deploy-and-prove.md`.

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
usage curated; oracle 50/50). Remaining = OPTIONAL-DEPTH / DEMAND-DRIVEN NOTES (NOT queued agent work):
- **tags beyond the top 52** — demand-driven; the top 52 already cover 90% of real usage.
- **xsdParser `structural`-category rider** (B21 worst-pick) — `classifyFromGroup` labels structural
  child-elements (param/text/owner/position/rotation/safepos/match/replace) `'action'`, so they enter
  `schemaLibrary.actions` and the census's `actionTags` filter (server.ts ~7552). Fix = add a `structural`
  category; census/palette/explain exclude it. **Reconciled 2026-07-13 — why it's NOT force-built:** (1) its
  ACCEPTANCE (live census/palette stop showing these) needs the LIVE game schema + corpus loaded = Ken's
  configured install, so not cleanly agent-verifiable here; (2) it's a schema-layer change feeding
  palette/templates/validation — real blast radius, deserves fresh context, not a marathon tail;
  (3) the user-visible symptom is ALREADY handled (B10s1 curated these kind 'other' in mdSemantics). SPEC'd
  for a future session with the schema loaded. Blast-radius readers to check first: `schemaLibraryToTemplates`
  (schemaTypes.ts:81), the action/control_flow split (xsdParser.ts:291), census `actionTags` (server.ts:7552).

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
