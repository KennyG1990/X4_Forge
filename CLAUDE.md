# Agent Instructions

> Entry point for AI agents working in this repo. Read at session start. (Mirror to CLAUDE.md / GEMINI.md if your harness reads those instead.)

## Building the `x4_ai_influence` mod — agent API allowed (UI-only mandate LIFTED 2026-06-24)

**UPDATE 2026-06-24 (Ken): the old "build the mod ONLY through this Forge's UI" HARD RULE is REVERSED.** It
contradicted `F:\DEV_ENV\CLAUDE.md`, which is authoritative — both now agree. You **may use the Forge agent API
(`/api/agent/*`) to author, validate, and deploy** the `x4_ai_influence` mod (in-game MD/Lua/content), and use
mouse clicks (Claude-in-Chrome / computer-use) for *validation*. Pure-canvas building was too slow. The Forge is
still proven by building a real mod end-to-end — but via the API is fine; a UI gap found while building is worth
fixing in the Forge (log it in ROADMAP) but no longer blocks. (Verification — driving X4, reading the debuglog,
querying the bridge DB — tests results, not the build. The Python bridge is not a Forge artifact, edited normally.)

## Code knowledge graph (graphify)

A precomputed knowledge graph of this codebase lives at `graphify-out/graph.json`
(**1160 nodes · 2649 edges · 51 communities**, AST-extracted, code-only). Use it to
orient and reason about structure **before** grepping the whole tree — it answers
relationship questions that grep/LSP can't cheaply: blast radius, shortest paths,
and what a symbol connects to.

The CLI is `graphify` (installed; package is `graphifyy`). Run from the repo root so
it finds `graphify-out/graph.json` by default:

```bash
graphify query   "How does X work?"        # BFS traversal — broad context for a question
graphify affected "generateMDXML()"        # REVERSE blast-radius: what breaks if I change this
graphify path    "Canvas.tsx" "xsdParser.ts"  # shortest dependency path between two nodes
graphify explain "ModWorkspace"            # a node + its neighbors (degree, community, edges)
```

Core abstractions (god nodes): `ModWorkspace` (67 edges), `MDNode` (38),
`generateMDXML()` (33), `compileAndSaveAll()` (21), `validateModWorkspace()` (15).

**Keep it fresh.** After changing code, rebuild deterministically (no LLM, free, seconds):

```bash
graphify update .
```

**Scope caveat:** the graph is **code-only** — it does NOT include ROADMAP.md, docs/,
schemas, or wares/jobs data (those are stripped by `.graphifyignore`). For mod-authoring
work, the graph of the Forge's own source is the wrong layer — use the Forge agent API
(see the `x4-forge-api` skill). This graph is for navigating/maintaining the Forge codebase.

A human-navigable Obsidian copy is exported to `F:\StarForge\graphify\x4-forge\` (open as a vault).

<!-- SYNCED from F:\DEV_ENV\CLAUDE.md (authoritative) on 2026-07-09 - the workflow HARD RULES were missing from this mirror, which is how an agent worked a full session without them. -->
## ⛔ HARD RULE — Every task follows PLAN → RECONCILE → DOCUMENT → IMPLEMENT → VALIDATE → REVIEW → DOCUMENT → AAR (enforce 100%)

Ken's mandated per-task workflow (instituted 2026-06-26), non-negotiable on every task / meaningful unit of work:

**LANES — scale the ceremony to the task (added 2026-06-27).** The full 8 steps are for CODE / FEATURE work. A
TRIVIAL task (a single-file doc/text edit; no code; no new endpoint / table / panel) runs the LIGHT lane: one-line
PLAN → do it → DOCUMENT the close → AAR only if a trigger fired. Never spend more on bookkeeping than on the change
itself. RECONCILE + honesty still apply; when in doubt, use the full lane.

1. **PLAN** — decide the bounded approach BEFORE touching code. State assumptions, the ONE clearly-scoped unit,
   and how it will be proven. Ground against proven references first (the `x4-reference-mods` skill / DeadAir /
   StarForge canon) instead of inventing.
2. **RECONCILE WITH THE CODEBASE (does this already exist?)** — BEFORE documenting or building, validate the plan
   against what's already there. A previous session or a different agent (Codex / Gemini) may have already built
   X. Check: **grep/read the live codebase** for the function / endpoint / table / panel you're about to add;
   query the **Agent Brain** (`agent-brain-recall`) + the **ROADMAP** + **StarForge canon** for prior work. If it
   already exists, do NOT rebuild — **EXTEND / UPGRADE / WIRE** the existing infrastructure and revise the plan.
   (Lived examples: the economy briefing prose, the dashboard economy panel, and the `hostile_events`
   `linked_order_id` column all ALREADY existed — the real work was upgrading/wiring, not greenfield. Building
   redundant infrastructure on top of working code is a defect, not progress.)
   **RECONCILE v2 (Ken 2026-07-02, distilled from the #124-#131 run — five sub-rules, all project-agnostic):**
   - **(a) Search by RESOURCE, not by name.** Names lie; call graphs don't. Identify the resource the task
     touches (a table, a port, a paid API, a chokepoint function) and enumerate its READERS/WRITERS — grep the
     call site, not the feature word you'd have used. (Lived: the LLM budget system was found via the
     `npc_complete` call site, never via "budget"; the unmetered $256 call pool via the same grep.)
   - **(b) The map is CUMULATIVE — write it.** End every reconcile by appending one line per finding to the
     project's `F:\StarForge\wiki\<project>\capability-map.md` — POSITIVE ("spend gate = player2_client
     ._llm_gate") and NEGATIVE ("no NPC claim driver exists as of <date>"; absence proven is a finding).
     Maintaining the map IS part of step 2, not a courtesy — it is what makes the next session's reconcile
     cheap and vocabulary-proof.
   - **(c) Reconcile the COUPLINGS, not just the components.** When adding a parallel path, ask "what must
     AGREE with what I'm adding?" and re-check the path being paralleled. (Lived: #125 — the new hire:<verb>
     branch was checked, the legacy branch beside it wasn't; type/verb divergence shipped.)
   - **(d) Rebuild trigger (counter the conservatism bias).** If the component found has appeared in ≥3 AAR
     worst-picks, extending it requires an explicit extend-vs-replace decision logged to decisions.md — never
     a silent extend. Reconcile must not be the mechanism that makes bad architecture immortal.
   - **(e) STANDING-HAZARD SWEEP (task-independent).** Every ~10 closed tasks, or whenever a spend/security
     surface changes: enumerate everything that SPENDS MONEY, TOUCHES THE NETWORK, or DELETES DATA — each must
     have a meter AND a limit, verified. Task-scoped reconcile can never catch a hazard no task points at
     (lived: 9 LLM call sites, 2 audited, $256). Log the sweep result in the capability map even when clean.
3. **DOCUMENT (the plan)** — write the (reconciled) scope into the right ROADMAP *before* building (Forge-codebase
   work → the Forge ROADMAP; mod + bridge work → the Neural Link ROADMAP). Mark it spec'd / planned, not started.
4. **IMPLEMENT** — build only that scoped unit. No silent scope creep.
5. **VALIDATE — and CITE the validation methods by name.** Never claim done on inference. Run every applicable
   check and NAME it in the close-out. The menu (use all that apply):
   - **Forge schema validation** — `POST /api/agent/project/validate` → `ok:true`, 0 errors.
   - **Forge debug-watcher** — `GET /api/agent/debug-watcher/brief` → `erroringCount`/`modRuntime.errorCount` 0,
     `activeErrors` 0 (mind the `[=ERROR=]`/`DebugError` marker false-positive on `runtimeErrors`).
   - **Browser confirmation** — Claude-in-Chrome: render/click the REAL UI, read the rendered DOM or screenshot.
   - **Dashboard DB feedback** — the `:8713` `/api/*` endpoints + `*_selftest` routes (state the pass count, e.g.
     "rollup_selftest 11/11", "eligibility_selftest 12/12").
   - **In-game** — drive X4 (computer-use), reload, read the debuglog, SEE the effect (logbook/notification/NPC).
   - **Sandbox unit / replica** — deterministic Python/logic check when the live process isn't yet reloaded.

   A task is **✅ only when all applicable methods pass**; partial = **◐** with the missing method named. An
   optimistic mid-transcript claim is NOT a verified outcome (see the lost-work canon).
   **CI GATE (workflow v2, 2026-07-01):** the bridge watcher smoke-runs fast selftests after every auto-reload and
   prints PASS/FAIL — a RED gate means the change is NOT done regardless of any local claim; fix before proceeding.
   Machinery runs the tests so green never depends on anyone remembering to check.
   **IN-GAME GATE (added 2026-06-27; SPLIT amended by Ken 2026-07-02 — ADR-G3): a PLAYER-FACING feature is ✅
   ONLY after it is verified IN-GAME.** The gate has two grades:
   - **EXECUTION gates flip on GAME-REPORTED events** — watchdog order events (arrived/engaged/completed),
     fleet-census deltas, logbook writes, debuglog lines: evidence the GAME emitted about its own state,
     machine-read. No human sighting required. (First application: the first NPC contractor dispatch — the
     lease + create_order + order events came FROM the game; Ken's eyeball added nothing to that chain.)
   - **EXPERIENCE gates keep the eyeball standard** — anything the player is meant to READ, SEE, or FEEL
     (briefings, news prose, mission guidance, board state, notifications) flips ✅ only on Ken's screen.
     Rationale (lived, same day): three times the machine walls were fully green while Ken's eyes caught the
     real defect (type/verb mismatch in a briefing, a haunted mission board, raw ids in a news article).
     Machine verification proves STATE; only the player notices when the EXPERIENCE is wrong.
   Bridge + dashboard + selftest all green = **◐** until the applicable grade's evidence lands. Pure
   backend/infra with no player surface is exempt: its applicable methods ARE its bar.
6. **SECOND-LAYER PASS (coverage review — the "second coat of paint").** BEFORE the closing document, re-read the
   source you executed against (the blueprint / spec / DeadAir reference / ROADMAP entry) and walk it
   point-by-point against what you ACTUALLY built. Did you cover 100%, or only ~70%? Enumerate every requirement
   and mark each done / partial / missed. If anything is missed or half-done, GO BACK and cover it (re-IMPLEMENT +
   re-VALIDATE) — never document "done" over a partial job. Repeat the pass until coverage is complete; only an
   explicit, deliberately deferred item (logged as ◐ with a reason) may remain. This catches the silent
   70%-coverage failure where the happy path works but edge cases / secondary requirements were skipped.
   **REVIEW (amended by Ken 2026-07-02 — CODEX IS NOT PART OF THE WORKFLOW; cross-model peer review removed):**
   the second-layer pass above IS the review, for every diff. For SIGNIFICANT diffs — new subsystem, schema
   change, cross-layer contract, anything touching the anti-cheat/validator surface — do the pass with fresh
   eyes: re-read the diff top-to-bottom AGAINST the grounding reference (not from memory), explicitly hunt your
   own assumption-lock (what did I never question?), and record the findings in the close.
7. **DOCUMENT (the close)** — update the ROADMAP with what was done + the CITED validation, honestly
   (✅ done+verified · ◐ partial/bridge-only · spec'd). The roadmap is the cross-session memory; an undocumented
   task is a lost task.
   **COMMITS ARE KEN'S, NOT THE AGENT'S (final, Ken 2026-07-01).** Agents NEVER run `git` — not in the sandbox,
   not anywhere (a sandbox commit corrupted router.py via stale mount reads; removed from the workflow entirely).
   Ken commits himself via Antigravity. The ROADMAP close entry title doubles as the suggested commit message;
   writing the honest close IS the agent's whole part of version control.
8. **AFTER-ACTION REPORT (AAR — what can be learned; can we do this better?).** NON-SKIPPABLE: every task closes
   with an explicit AAR in THREE parts — **Points to sustain** (what worked — name it so it's deliberately
   repeated), **Points to improve** (the WORK / my approach), and **Points to improve the TOOLS** (if a trigger
   traces to a limitation of ANY tool we USE to do the job (across ANY project) — a tool WE built (Forge, bridge,
   dashboard, watcher, a skill, this workflow) OR a third-party tool / IDE / program we depend on — do NOT silently
   work AROUND it. If WE own it → log a tool-improvement to that tool's ROADMAP and fix it when worth the cost (its
   limits are TASKS, not constraints). If we do NOT own it → bank the durable workaround in canon and/or
   configure/replace it or file the request. Either way the friction becomes a banked improvement, not a recurring tax. e.g. the Forge
   validates XSD but not MD scriptproperty access → add property validation so a wrong-but-legal property is caught
   offline, not after N in-game reloads). The PASS is never skipped; only the
   resulting EDIT is conditional.
   **WORST-IMPLEMENTATION PICK (added 2026-07-01, Ken):** every AAR additionally names ONE poorly-implemented
   feature we currently ship (from this task or any earlier one), explains WHY it is poor — the mechanism, not
   vibes — and proposes concretely how it should be better; spec it into the BACKLOG when actionable. (Lived
   example: the flat OPORD_JOB_REWARDS table + the reward-0 pricing crawl → threat-scaled `price_job`, ROADMAP
   #80.) This keeps the retro adversarial toward our own SHIPPED work, not just toward the process. **"Clean" is OBJECTIVE, not a feeling** — if ANY trigger fired the task is NOT
   clean and the AAR MUST bank a durable lesson and ACT on it now (workflow / skill / canon note / my approach) so
   the next task is measurably better. **Triggers:** (a) reconcile changed the plan/scope; (b) the second-layer
   pass forced a re-implement; (c) any error / 404 / failed check / exception en route; (d) an assumption corrected
   mid-task ("wait/actually"); (e) a gotcha or surprise not already in canon; (f) any step took >1 attempt. Only
   with ZERO triggers may the AAR conclude "clean — no durable lesson", and even that is LOGGED, never silent.
   (Why non-skippable: a self-judged skip on the very step meant to audit self-serving behavior is a conflict of
   interest; and the AAR is how lessons get written OUT of my head into durable memory — roadmap/canon — because
   session context resets. Self-annealing: every error is an opportunity to make the system stronger.)
   **LOG IT (two tiers — route by SCOPE so project specifics never pollute the global record):** classify each
   lesson — *generalizes to ANY project* (harness mechanics, the workflow/AAR loop, verification/reconcile meta,
   working-with-Ken) → the GLOBAL ledger `F:\StarForge\wiki\workflow\aar-log.md`; *specific to ONE project* (e.g.
   X4 bridge/mod/Forge internals) → that project's ledger `F:\StarForge\wiki\<project>\aar-log.md` (X4 =
   `x4-neural-link\aar-log.md`). A single AAR may write BOTH (a project entry + a generalized line in global).
   Maintaining both ledgers IS part of the AAR — never skip it; durable lessons also get acted on in canon/roadmap.

**TASK SELECTION — don't let easy crowd out important (added 2026-06-27).** "Buildable-now + easily-cited"
(bridge/dashboard/selftest) work tends to win over gated IN-GAME work because it's simpler to validate — but the
gated keystones are usually the higher-value goal. Every few tasks, deliberately pull a gated/in-game task instead
of another bridge task, so the PLAYER experience advances, not just the verifiable substrate. (Tell: an in-game
task sitting `in_progress` for many sessions while bridge tasks close around it — e.g. #67.)

**RECORDS (workflow v2, 2026-07-01 — MD-only, Ken's policy; no third-party trackers):**
- **BACKLOG.md** (per repo, SMALL): open work ONLY — spec'd / in-progress items with states and owners. Sessions
  START by reading it (2KB of open squawks, not 550KB of history).
- **ROADMAP.md**: append-only VERIFIED history (the changelog / maintenance binder). Closed entries with cited
  validation. Open work never lives here — closing a backlog item MOVES it into the roadmap as a dated entry.
- **decisions.md** (ADR ledger, `F:\StarForge\wiki\<project>\decisions.md`; cross-project →
  `wiki\workflow\decisions.md`): numbered Architecture Decision Records — every irreversible design/doctrine
  decision as context → decision → consequences. RECONCILE (step 2) CHECKS the ADR ledger; a design that
  contradicts an ADR requires Ken's explicit sign-off, never a silent re-derivation. (This is what prevents stale
  spec clauses — e.g. pre-pivot "deterministic commander" language — from steering new work.)

The two HARD RULEs below (roadmap-at-end, scope + validate-with-all-three-tools) are COMPONENTS of this loop.

## ⛔ HARD RULE — Update the ROADMAP at the END of EVERY task (enforce 100%)

Every task / meaningful unit of work CLOSES with a roadmap update before moving on — non-negotiable.
Pick the right roadmap (keep them SEPARATE): **Forge-codebase work → the Forge ROADMAP**
(`X4-Foundations-Mod-Studio/ROADMAP.md`); **mod + bridge work → the Neural Link ROADMAP**
(`x4_ai_influence/x4_neural_link/ROADMAP.md`). Record what was done + the verification, honestly
(✅ done+verified · ◐ partial/bridge-only · spec'd). The roadmaps are the cross-session / cross-agent
memory — an undocumented task is a lost task.

## ⛔ HARD RULE — Scope, document, and validate EVERY task with all three tools (enforce 100%)

Ken's standing instruction for this system (X4 AI Influence / Neural Link), non-negotiable on every task:

**"Document it, keep it scoped and documented. Validation tools you must use: Forge diagnostics/ecosystem,
database dashboard feedback, in-game."**

- **Keep it scoped & documented** — one clearly-bounded unit of work; spec it before building and record what
  was done + how it was verified in the right ROADMAP (see the rule above). No silent scope creep.
- **Validate with ALL THREE, every time** (not one of three — all that apply):
  1. **Forge diagnostics / ecosystem** — `POST /api/agent/project/validate` (XSD + cross-file cue resolution +
     md↔lua binding) → `ok:true`; use the Forge's own diagnostics as the authoritative legality check.
  2. **Database dashboard feedback** — confirm the bridge DB reflects the change (the `:8713` dashboard /
     `/v1/*` endpoints): the data is actually written, categorized, drained, deduped as intended.
  3. **In-game** — drive X4 (computer-use), reload, and SEE the effect on screen (logbook tab, notification,
     NPC speech). Read the debuglog for MD/Lua errors. Final proof is always in-game, not a transcript claim.
- A task is **not** ✅ until all three applicable checks pass. Partial = ◐ with the missing check named.
- An optimistic mid-transcript claim is **not** a verified outcome (see the lost-work lesson in StarForge canon).

## Agent Brain — cross-session memory (query this BEFORE non-trivial work)

A semantic knowledge graph of my past work across **Claude Code + Cowork + Gemini** lives at
`F:\DEV_ENV\Agent Brain Vault`. It exists so I don't re-derive what a past session already solved
(e.g. the X4 Neural Link skills/relation work).

**THE ONE RULE:** before non-trivial work — or whenever Ken references something "we did before,"
a project by name, or a past decision/outcome — **query the brain first instead of guessing or
re-reading raw files.**

**First-class MCP — `claude-brain`.** Graphify's own server `graphify-mcp` serves the semantic
graph. Registration lives in `Agent Brain Vault\_brain-tools\brain.mcp.json`; for Claude Code,
merge it into `F:\DEV_ENV\.mcp.json` (Cowork: add as a connector). It points at
`Agent Brain Vault\graphify-out\graph.json`. Call its tools (discover via tools/list — query /
explain / stats) for meaning-based recall. Phrase questions by MEANING, not filenames.
- If no MCP is connected, fall back to the CLI:
  `python "F:\DEV_ENV\Agent Brain Vault\_brain-tools\query_brain.py" --vault "F:\DEV_ENV\Agent Brain Vault" "<question>"`
- Verbatim source notes: `Agent Brain Vault\notes\` (one per conversation).

**Query `graph.json`, NOT Obsidian's Graph View** — that view is a shallow `[[wikilink]]` keyword
co-occurrence graph (the kind we discarded). The real retrieval layer is the LLM-extracted
`graph.json` / `graph.html`.

**Brain vs StarForge:** the brain = the dragnet (every conversation, raw — "where did I ever touch
X"); StarForge `wiki/` = the canon (curated design). Distill durable brain findings into canon.

**Refresh:** notes auto-refresh nightly (free, deterministic) via the `ClaudeBrain-normalize` task;
the semantic graph needs a paid LLM pass — refresh with
`/graphify "F:\DEV_ENV\Agent Brain Vault\notes" --update` (new/changed notes only — cheap).

**Honest limits:** coverage is partial (Cowork-heavy, ~27 Gemini transcripts; claude.ai web chat
excluded) and the CURRENT live session is never in it yet. Treat as strong-but-incomplete.

