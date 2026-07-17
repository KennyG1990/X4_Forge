# B57 · IDE-native Forge, Phase B — exploiting the AGENT-FIRST environment — SPECIFIED 2026-07-17

Lane: **FULL** (program of slices). Origin: Ken, 2026-07-17 — "what other things can exploit
the Antigravity environment: easier to use, more reliable outputs."

## The organizing insight

Phase A made the IDE *display* Forge truth and gave agents *tools*. Phase B exploits what an
AGENT-FIRST IDE actually is: Antigravity's resident agent works across editor + terminal +
browser and builds verification artifacts. Two new motions:
① **make the mod folder self-describing for ANY resident agent** (instructions + grounding +
workflow-encoded tools, so a weak model in the IDE inherits the Forge's discipline);
② **close the editor loop** (fixes, navigation, live feedback, and — gated — two-way editing
via the EXISTING byte-faithful importer). Reconciled enablers already shipped: quick-fix
descriptors with mechanical ops (`listQuickFixes`/`applyQuickFix`), the guarded
`importModFolder` (#65 byte-faithful re-compile guard), cue reference index, B36 readiness
evidence, FORGE-STATE, the B55 repair loop, scoped agent keys + MCP shim.

## Slices

### B57s1 · Self-describing mod folder — AGENTS.md + grounding notes (reliability, cheap)
`openModFolder` (and a refresh command) writes into the mod folder:
- **AGENTS.md** (agent-agnostic instructions; Antigravity/Claude/Codex all read this class of
  file): what this folder is, THE rule ("propose → validate with the x4forge MCP tool →
  fix → revalidate; the validator is the referee, never claim done with findings open"),
  which files are generated (canvas-owned) vs hand-editable, the deploy gate, where evidence
  lives. Content generated from live server truth (mod id, domains present, readiness state).
- **X4_NOTES.md** — a compact grounding sheet distilled from EXISTING data (census top tags +
  curated semantics titles + the mod's own cue index): the corpus cheat-sheet an IDE agent
  reads before touching MD. Deterministic, regenerated on demand, corpus-bytes-derived only.
- **Acceptance:** files generated from a seeded mod match fixtures (selftest); content names
  the real MCP tool + real mod facts; regeneration is idempotent; an agent-readability drill
  (feed AGENTS.md to a real agent session and have it validate via MCP without other context).

### B57s2 · Workflow-encoded MCP tools — the harness inside the tool (reliability, core)
Weak agents skip steps; tools that ARE the loop can't be skipped. Extend the shim with:
- `author_check {files:[{path,content}]}` → inline project/validate (nothing written) — lets
  an agent validate its DRAFT before touching disk.
- `stage_and_validate {fromPath}` → validate + return findings + REMEDIATION CAPSULES
  (B55P1's currency, with quick-fix hints attached) — the same packet our own repair loop
  feeds the model.
- `readiness {fromPath|workspace}` → the B36 ladder as machine truth (graph/package/deploy/
  seen/experience + evidence) — the "am I actually done?" contract for any agent; AGENTS.md
  points at it as the ONLY legitimate done-claim.
- **Acceptance:** stdio drill incl. a scripted "weak agent" transcript that reaches
  readiness-green only through the loop; scope negatives; capsule parity with the in-app
  repair loop (same shapes, one currency).

### B57s3 · Editor loop closure — lightbulbs, navigation, live diagnostics (ease of use)
- **Code Actions (lightbulbs):** project server-side quick-fix descriptors onto s1
  diagnostics; APPLY runs server-side (`applyQuickFix` via a new authed POST) and the file
  refreshes — the extension never re-implements fix logic (one-referee rule).
- **Go-to-definition / references for cue names** (DefinitionProvider/ReferenceProvider over
  the existing cue index endpoint); no rename-refactor (Egosoft warns renames break saves —
  deliberately out).
- **Unsaved-buffer diagnostics:** debounce → inline project/validate (content passed inline,
  nothing written) → squiggles while typing, not just on save.
- **Acceptance:** pure mapping selftests + live drills per feature; negative: apply on a
  stale buffer refuses (CAS class); typing latency budget measured.

### B57s4 · Evidence deep links + proof artifact (Antigravity's verification culture)
- Stable URL routing into the studio (`/?panel=diagnostics`, `/?panel=readiness&mod=x`) so
  agent walkthroughs, artifacts, and our own IDE surfaces can link DIRECTLY to evidence.
- `GET /api/agent/proof?fromPath=x` → one markdown **proof artifact** (readiness ladder +
  last validate summary + watcher verdict + content hash, timestamped) — written on demand to
  the mod folder (`PROOF.md`); the natural attachment for an Antigravity walkthrough and a
  one-page morning review for Ken.
- **Acceptance:** deep links land on the right panel (browser drill); proof artifact matches
  live evidence (drill: change state → regenerate → diff); no evidence forgery path (the
  artifact only ever renders server-computed state).

### B57s5 · Two-way folder editing — the gated unlock (ease of use, HIGHEST risk)
The read-mostly gate opens via machinery that ALREADY exists: FileSystemWatcher on the mod
folder → drift detected → IDE toast "adopt into canvas / keep canvas" → adopt runs the
GUARDED `importModFolder` chain (byte-faithful re-compile guard #65) → canvas updates.
- Never silent: adoption is always explicit; failed guard = clear refusal with the reason;
  `files.readonlyInclude` hints for generated files while the preference is read-mostly.
- **GATE (unchanged from Phase A): needs drift telemetry from real use first** — ship
  behind a default-off setting, collect adopt/refuse counts, Ken decides default-on.
- **Acceptance:** round-trip drill (IDE edit → adopt → canvas shows it → recompile
  byte-identical); guard-refusal negative; concurrent-edit CAS negative.

### B57s6 (bucket, demand-driven) · deeper ecosystem
EmmyLua stubs from ui-harvest (mod Lua IntelliSense) · lemminx corpus-proof (IDE session) ·
format-on-save PROTECTION (formatting generated XML creates phantom drift — ship settings
that exclude generated files from formatters; reliability guard, promote if drift telemetry
shows formatter churn) · precise-children completion mode (carried from Phase A).

## Order recommendation
**s1 → s2** (the reliability pair — self-describing folder + workflow-encoded tools — is the
"weak model, strong harness" thesis applied to OTHER people's agents; small code, big lever)
→ **s3** (daily-driver ease) → **s4** (evidence culture fit) → **s5 last** (highest risk,
needs the telemetry its own setting generates). s6 on demand.

## Boundaries & risks
- AGENTS.md/X4_NOTES/PROOF are GENERATED, marked as such, regenerated idempotently — never
  hand-curated per mod (staleness class).
- s2 tools stay spend-free (no generate exposure; AI keys remain bring-your-own).
- s3 apply = server-side only; the extension never mutates workspace logic itself.
- s5 stays default-off until telemetry; renames stay out entirely (saved-game hazard).
- Every new POST rides existing auth/scopes; new tools get the s4-class security note.
