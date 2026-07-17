# B56 · IDE-native Forge — the extension stops being a picture frame — SPECIFIED 2026-07-17
# BUILD STATUS (overnight run 2026-07-17, Ken's /goal): unit-0 + s1–s5 IMPLEMENTED and
# machine-validated (all oracles + gates green; details in ROADMAP). ◐ PARTIAL pending
# Ken's IDE eyeball batch (scripts in SESSION-HANDOFF). s6 deliberately deferred (spec'd
# bucket, demand-driven). Residuals recorded below and in BACKLOG.
#
# Build-time deltas vs this spec (recorded per workflow):
# - s2 tasks.json CUT (reconciled: commands are natively keybindable; problem matchers
#   are redundant against s1's direct DiagnosticCollection — tasks would be ceremony).
# - s3 residual: completion child-lists are OVER-INCLUSIVE (the SchemaIndex children sets
#   were built deliberately over-inclusive for unknown-element SUPPRESSION; e.g.
#   `conditions` offers 440 items incl. action tags). Suggestions are hints, not gates —
#   the validator stays the referee — but a precise-children index mode is the follow-up.
# - s4 shipped with FIVE read/validate/compile tools only; deploy/generate deliberately
#   not exposed (spend/write surfaces stay out of agent reach v1). Security review in the
#   ROADMAP close (stdio-only, loopback client, scoped keys, server-side enforcement).
# - s5 shipped as the default-off association generator + recommendations; the
#   THIRD-PARTY validator corpus-proof (lemminx) is IDE-gated (cannot run headless) —
#   documented, associations restricted to plain-rooted factions/gamestarts/addon files.
#   EmmyLua stubs deferred (demand-driven).

Lane: **FULL** (program of slices; each slice is its own bounded unit with its own close).
Origin: Ken, 2026-07-17 — "having the Forge running inside an IDE gives us opportunities we
didn't have before… exploiting other extensions like linters etc."

## The organizing insight (reconciled)

The webview extension (B41→B54) treats the IDE as a SHELL: panel + sidecar + launcher +
watchdog. Reconcile 2026-07-17 (extension.ts, 586 lines; manifest contributes): the extension
uses only `createWebviewPanel`, `createOutputChannel`, `createStatusBarItem`, and one
TreeDataProvider. It uses NONE of: DiagnosticCollection (Problems panel), `languages.*`
providers (completion/hover/definition), workspace folders / FileSystemProvider, `vscode.diff`,
SCM, Tasks, Terminal, CodeLens, custom editors, extension interop, or agent/MCP tooling.

Meanwhile the SIDECAR already computes nearly everything those surfaces want to show:
`runProjectValidation` + B46P2 routing (one flat diagnostic currency since B55P1's
`flattenProjectValidation`), the B46P1 40-domain schema registry with include chains, the
scriptproperty index, the action census, B36 readiness evidence, the debug-watcher verdict,
FORGE-STATE, drift, and scoped agent keys (B52-era `createAgentKey` command already ships).

**So the program is two motions:** ① PROJECT existing Forge truth into native IDE surfaces;
② INGEST IDE/ecosystem capability (editors, linters, neighboring coding agents) into the
Forge loop — with the same corpus-proof/cry-wolf discipline as B46.

## Slices (tiered; each ≈ one session; sequencing rationale at the end)

### B56s1 · Problems panel projection — Forge diagnostics become IDE diagnostics
The highest-leverage/lowest-risk slice. A `DiagnosticCollection` fed from the sidecar:
validate the configured mod workspace (`project/validate` fromPath) on open/save/interval,
map `FlatProjectDiagnostic` (severity/code/filePath/line — the B55P1 currency, purpose-built
for this) to `vscode.Diagnostic` on real file URIs under `modWorkspacePath`.
- Every validator layer (incl. routed domains, script properties, pitfalls) lands where IDE
  users already look, with go-to-line, filtering, and problem-count badges for free.
- **Acceptance:** open a mod folder → seeded defect appears in Problems with correct
  file/line/severity/code; fix → clears on save; sidecar down → collection clears with a
  status-bar hint (never stale diagnostics); zero diagnostics on the corpus-clean fixtures.
- Risks: URI mapping (workspace-relative vs absolute); debounce (validate is subsecond but
  registry cold-walk applies — reuse the TTL); duplicate-source confusion if s5's third-party
  XML validator is later enabled (source-tag every diagnostic `x4forge`).

### B56s2 · The mod workspace becomes a real IDE folder (+ tasks + recommendations)
`modWorkspacePath/<mod>` added as a workspace folder (or "Open Mod Folder" command): file
explorer, global search, git-over-mod, and every ecosystem extension now see the mod.
- Phase A (safe): read-mostly projection — IDE edits are legal but the canvas/server remains
  the writer of generated files; reuse the EXISTING drift/hash machinery (`computeModDrift`,
  workspace content hash, B2 CAS) to surface "canvas differs from disk" as a status-bar state
  with adopt/keep actions (the B1 badge pattern, IDE-native).
- Ship `.vscode/extensions.json` (recommendations) + `.vscode/tasks.json` (Validate Mod /
  Deploy / Watch Game Log tasks calling the sidecar API) into the mod folder — Tasks give
  keybindings and pre-launch chains for free.
- **Acceptance:** open-folder command works from the launcher; tasks run green against the
  sidecar; an external edit to a generated file flips the drift state and the adopt path
  round-trips byte-clean; NEGATIVE: sidecar-down task fails with a named message, not a hang.
- Risks: dual-writer sync is the historical incident class (#70, B2) — Phase A deliberately
  keeps one writer; full two-way editing is a LATER decision gated on drift telemetry.

### B56s3 · X4 IntelliSense — language features from the schema registry
The biggest user-facing win. Completion/hover/diagnostics providers for MD/AIScript/routed
XML, powered by what B46 built: 40-domain registry + include chains (md = 1507 elements),
attribute sets + enums, census ranking (top-52 first in completions), scriptproperties for
`$obj.property` chains, mdSemantics curation for hover docs.
- Direct `languages.register*Provider` calls hitting sidecar endpoints (debounced + cached);
  a full LSP server is NOT required at this scope and would duplicate the registry cache.
- Element completion filtered by parent context (children sets exist in SchemaIndex);
  attribute completion with enum values; hover = schema doc + census frequency + curated
  semantics; t-file `{page,id}` reference hover via the (B46P3) reference sets when they land.
- **Acceptance:** in a real md file, `<` inside `<actions>` offers census-ranked legal
  children; attribute enum completion matches the schema; hover on a curated action shows its
  semantics; providers degrade silently when the sidecar is down; keystroke latency budget
  (<100ms warm) measured and recorded.
- Risks: context detection in raw text (use a lightweight cursor-context parser, not a full
  DOM per keystroke); registry TTL cold-walk on first completion (pre-warm on activation).

### B56s4 · Agent-tool surface — the coding agent next door becomes X4-aware
IDE users have coding agents resident (Antigravity's agent, Claude Code, Codex). The Forge
agent API + scoped keys (already shipped) become their toolbelt:
- Ship an MCP server manifest (stdio shim → sidecar HTTP with a scoped agent key) exposing a
  CURATED tool subset: validate / schema-registry / project read / generate(staged) / deploy
  ONLY where policy allows. External-agent spend policy stays: their own AI keys; our tools
  meter and gate.
- The B55 loop composes: an IDE agent authoring MD gets `validate` as a tool and the same
  composite verdict the in-app agent gets.
- **Acceptance:** a real IDE agent session (Ken drives, or Claude Code in the worktree)
  completes author→validate→fix→validate-green on a scratch mod through the MCP tools with a
  scoped key; key revocation kills access live; NEGATIVE: a tool call outside the key's scope
  is refused with a named error.
- Risks: security surface (this is a NEW network/permission surface → workflow rule 3.6:
  meter/limit/failure-behavior verified before ship; default-off setting; loopback-only).

### B56s5 · Ecosystem interop — linters and language servers as extra referees
- **Red Hat XML (`redhat.vscode-xml`)**: native XSD validation. We can WRITE
  `xml.fileAssociations` into the mod folder settings from the B46P2 routing map (the game's
  own XSDs per file pattern). CRY-WOLF GATE: raw XSD strictness disagrees with corpus reality
  (diff-rooted patch docs; the wares/jobs no-schema finding) — so associations ship ONLY for
  corpus-proven plain-doc domains (factions/gamestarts/addon plain files), never for
  patches/wares/jobs/t. Corpus-prove the third-party validator itself before recommending it
  (same 124-file sweep, zero-false-positive bar).
- **Lua**: recommend a Lua LS for `ui/*.lua`; longer-term, emit EmmyLua annotation stubs for
  the X4 UI API from the existing ui-harvest infrastructure so mod Lua gets real completions.
- **Acceptance per interop:** the corpus sweep result recorded; a deliberate defect caught by
  the third-party tool; zero false positives on vanilla-shaped files; recommendations are
  suggestions (never forced installs).
- Risks: we don't control third-party rule sets — pin versions in recommendations; every
  interop is opt-in.

### B56s6 (later, demand-driven) · Native diff/merge + SCM + watcher-as-problem-matcher
`vscode.diff`/merge over virtual documents for the override-map→patch flow (in-app three-pane
merge already exists — lower marginal value); SCM decorations for drift; debug-watcher verdict
as a Task problem matcher. Spec'd as a bucket, not scheduled.

## Visual recon (2026-07-17, Ken-directed — REQUIRED READING before implementing any slice)

Toured the REAL rendered UI (scratch prod instance :3779, static bundle, Claude-in-Chrome; the
Browser-pane screenshot channel timed out again — known). Every B56 surface seen live. Deltas:

- **s1 source confirmed + widened.** The in-app "Problems panel" is Diagnostics rail →
  PACKAGE tab: error/warning COUNT chips (badge "API INTEGRATED" — server-fed), plus a
  DETERMINISTIC CRITIC card (no-AI findings: ref mismatches, one-way writes, unguarded
  high-risk actions) and a RUN ALL SELFTESTS button. s1 must project BOTH package diagnostics
  AND critic findings; the IDE Problems panel becomes the itemized view (in-app shows counts +
  status prose when clean). Also project the readiness chips (each has a click-to-evidence
  one-liner — maps to a status-bar item + tooltip).
- **s2 confirmed as a strict upgrade.** In-app FILES = a FLAT "loose files list" over one
  configured folder (unconfigured by default). In-app SOURCE = a mini-SCM diffing COMPILED XML
  vs a loaded baseline with a commit-drafting desk + GitHub remotes — it operates at
  workspace/compiled level, so IDE git (file level) is COMPLEMENTARY, not duplicate; document
  the two-truth boundary (canvas→baseline diff vs files→git) in the s2 close. PLAYTEST panel
  (Ingame File Syncer + debug-log watcher + AGENT DEBUG BRIEF rendering the watcher verdict
  with expected-cue chips) maps to the s2 Tasks + s6 problem matcher.
- **s3 sources confirmed.** Diagnostics → SCRIPTS tab renders DETERMINISTIC plain-English
  explanations from curated semantics ("NO AI" badge; per-node execution flowchart; referenced
  assets) — this is the hover-doc corpus for IntelliSense, already written and product-voiced.
  Toolbox = Curated 65 / Show All with type filters — completions must mirror this curation
  (census-ranked curated first, full vocabulary reachable). The code pane (B48 CodeMirror,
  MD.xml + UI_LAYOUT tabs, collapsed by default) holds the exact bytes s2 exposes to IDE
  editors.
- **PROMOTED RESIDUAL:** the XML PATCHING meta panel displays "EVENTS 382 / ACTIONS 807" from
  the include-blind palette loader — the B46P2 residual is USER-VISIBLE in the shipped UI and
  will contradict IDE completions (1507-element index) the moment s3 lands. Fix
  `loadSchemaLibrary` include expansion BEFORE or WITH s3 (single-truth rule).
- **s6 surface:** the XML DIFF INTERACTIVE WORKBENCH (patch-block queue, live `<diff>` doc,
  APPLIED PREVIEW / DIFF-PATCH tabs, per-file targeting e.g. libraries/wares.xml) is the
  in-app diff authoring surface; IDE-native diff should ride its endpoints, not reimplement.
- **Key-gating pattern:** the in-app AI panel is HIDDEN without a provider key. Every IDE
  surface must have the same honest degrade (s1/s3 work key-less; s4 requires keys and must
  say so).
- Evidence: session screenshots (Beginner rail + walkaround card incl. "1507 elements loaded";
  Expert studio; Diagnostics Scripts/Package; Files; Source; Playtest; code pane; XML
  workbench; readiness evidence line). Canvas state on the scratch instance was touched once
  (Tidy re-layout) — scratch-only, no live state involved.

## Sequencing recommendation
**s1 → s2 → (palette-loader residual fix) → s3**, then **s4 and s5 by Ken's call** (s4 =
agent-facing power, security-gated; s3 = user-facing power). s1 first because it reuses
B55P1's diagnostic currency verbatim and makes the Forge visible in the IDE's native language
within one session. s2 before s3 because IntelliSense needs real files open in real editors to
matter, and s2's folder mode is what puts them there. The palette-loader fix rides in front of
s3 (recon finding: the shipped UI already displays the stale 382-event count — IDE completions
must not contradict the in-app readout).

## Program-level risks & boundaries
- **One truth:** every IDE surface projects SERVER truth (validate/registry/evidence) — no
  IDE-side revalidation logic, ever (the redundant-infrastructure rule).
- **Dual-writer:** folder mode starts read-mostly; two-way editing is a separate gated
  decision with drift telemetry as evidence.
- **Cry-wolf:** third-party validators get the same corpus-proof bar as our own domains.
- **Security/spend:** s4 is a new permission surface — rule 3.6 sweep before ship;
  agent keys scoped + revocable; loopback-only; external agents bring their own AI keys.
- **Fork parity:** target the vanilla VS Code API (engine ^1.85) — no Antigravity-only APIs
  without a fallback (B43 lesson: verify fork parity by inspecting the fork, not assuming).

## Out of scope (program)
Replacing the webview studio (the canvas stays the product's heart); MS Marketplace (Azure
gate unchanged); a full LSP server process; auto-installing third-party extensions.

## Decision points for Ken (pre-s1 answers not required; pre-s4/s5 required)
1. **Order after s1–s3:** agent-tools (s4) or ecosystem linters (s5) first?
2. **Folder mode writes:** stay read-mostly until drift telemetry says two-way is safe — OK?
3. **Third-party XSD validation:** ship as default-off recommendation with corpus-proof
   evidence attached, or keep our validator the only referee until users ask?
