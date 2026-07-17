# B55 · Validation-driven agent loop — SPECIFIED 2026-07-16

Lane: **FULL** (AI generation core — spend surface, cross-layer, product-defining).
Origin: Ken's Forge-Agent conversation (Codex 5.6, 2026-07-16) — apply the Agent_Harness_Extension
harness lessons ("the validator drives the loop; the LLM only proposes") to X4 Forge's internal
agent. Premise verified against code THIS session before this plan was written.

## Reconcile — the verified current state (2026-07-16, code-level [REPRODUCED])

**What the internal agent is today (4 AI surfaces, all via the metered `callMultiProviderAI`):**
1. `POST /api/agent/generate` (server.ts ~7300–7640): 4 phases — nodes → links → UI widgets →
   ONE-SHOT self-heal. Phase 4 hands `validateModWorkspace` diagnostics to the model once,
   applies whatever returns, and the final re-validation feeds only the report string. No
   retry loop. `runProjectValidation` (structure, cross-file cues, md↔lua, aiscript lint,
   script-properties, pitfalls, and now B46P2 routed domains) is NEVER consulted here.
2. **Architect loop** (client, `App.tsx runArchitectStep` + `src/lib/architectLoop.ts`): picks
   ONE task from the blueprint (statuses derived from the live workspace), prompts with
   goal+task+doneCheck+rejected-lessons, calls generate with `apply:false`, runs the
   deterministic referee `vetTaskProposal` (schema/graph/intent verdicts), stages accepted
   proposals behind user Confirm (checkpoint-before-apply), records rejections as blocking
   lessons. `loopStopReason` (complete/max-iterations/stalled) EXISTS with a selftest.
3. `POST /api/gemini` guide chat: workspace JSON + `validateModWorkspace` diagnostics →
   text + optional staged `proposedWorkspace`.
4. Script/log analysis endpoints: read-only explainers + 1-click `update_node_property` fixes.

**Verified gaps (Codex's hypotheses, now reproduced):**
- Repair never iterates; identical-failure detection doesn't exist server-side.
- The strong validator stack is post-hoc reporting, not loop control.
- NO corpus retrieval: prompts carry workspace JSON + diagnostics only — never a vanilla
  example or an XSD slice, despite the unpacked 9.00 corpus being configured and indexed.
- No architect/editor model split (every phase uses the session's single provider).
- Evidence-gated "done" exists for HUMANS (B36 readiness ladder) but the agent's own loop
  stops at schema-clean, far below package/deploy/runtime proof.

**Existing infrastructure that MUST be reused (not rebuilt):** `runProjectValidation` +
B46P2 routing (the composite oracle) · `vetTaskProposal`/`loopStopReason` (referee + halt) ·
B25 spend meter/cap at the chokepoint (loop budget) · quick-fix descriptors (typed remediation)
· object index / action census / B46P1 registry corpus walkers (retrieval substrate) · B36
readiness evidence (proof ladder) · blueprint scratchpad lessons (persistent memory).

## Phases (each ≈ one focused session; commit point between)

### Phase 1 — Promote the full validator into the repair loop (server-side)
- New pure lib `src/lib/agentLoop.ts` (house pattern): `diagnosticSignature(d)` (stable
  code+sourceRef+filePath key), `buildRemediationCapsules(diags)` (typed: signature, affected
  node/file, grounded hint — reuse quick-fix descriptors where they exist), and
  `shouldHaltRepair(history)` (no-progress = identical signature SET survives 2 consecutive
  attempts; hard cap 3 attempts).
- `/api/agent/generate` phase 4 becomes that bounded loop, driven by the COMPOSITE verdict:
  `validateModWorkspace` + `runProjectValidation` over the compiled package (compile via the
  existing `generateMDXML`/package path into an ExtensionProject envelope — B46P2 routing
  rides free). Clean first pass = zero repair calls (no spend).
- Spend guard: loop respects the B25 meter — each retry is a metered call; abort the loop
  (honest PARTIAL report) if the cap trips mid-loop.
- Response gains `repair: { attempts, halted, reason, remainingSignatures }` — honest
  reporting; the existing message string keeps working.
- **Acceptance:** oracle (synthetic broken workspace converges ≤3; a no-progress fixture halts
  with the surviving signatures reported; clean workspace = 0 repair calls) · A/B on a scratch
  instance with a real key (Ken-authorized spend): the same deliberately-broken prompt, old
  one-shot vs new loop, diagnostic counts recorded · tsc/sweep/e2e green · negative path =
  cap-trip mid-loop degrades to honest PARTIAL.

### Phase 2 — Corpus retrieval into prompts (the canon reservoir goes active)
- Retrieval service over the unpacked corpus keyed by the task's xmlTags/domains: K smallest
  vanilla cue/snippet examples using those same tags (substrate: the existing corpus walkers;
  share the B46P3 SQLite cache when it lands — do NOT build a second index).
- Deterministic context budget (Forge-Agent lesson): hard cap per prompt (~8–12KB of
  examples), stable selection (no Date/random), smallest-first.
- Injected into phase-1/phase-2/repair prompts as `[Known-working vanilla examples]`.
- **Acceptance:** retrieval oracle (fixed tag set → deterministic snippets, budget respected)
  · prompt-assembly oracle (budget never exceeded) · A/B generation quality drill on 3 canned
  prompts (with/without examples, validator verdicts compared) · corpus-grounding rule: the
  retrieval layer only ever quotes REAL corpus bytes, never synthesized "examples".

### Phase 3 — Architect/editor split + evidence-gated done (product decision, Ken-gated)
- Per-role model config (architect vs editor) through the existing multi-provider seam;
  blueprint done-checks extended to name their required proof layer (schema → cross-file →
  package → deploy → runtime), riding B36 evidence rather than duplicating it.
- The causal A/B harness (same weak model: bare vs current vs harnessed) — the Forge-Agent
  proof-gap methodology applied here. Needs fixtures + a scoring oracle; design before build.

## Risks & boundaries
- **Spend:** the loop multiplies calls — B25 meter/cap is the hard boundary; Phase 1 ships
  with the cap-trip negative path proven. Real-key A/B drills are Ken-authorized per run.
- **Latency:** up to 3 extra model calls on broken generations; acceptable (generation is
  already multi-call) but report attempts honestly.
- **Compatibility:** `/api/agent/generate` is a documented external-agent surface — request
  shape unchanged; `apply` semantics unchanged; response only GAINS fields.
- **Out of scope:** transplanting the Forge Agent extension wholesale (shell/browser/process
  machinery is unnecessary here); changing the confirm-before-apply UX; touching md/aiscripts
  validation semantics.

## Rollback
Per-phase single-commit revert; the generate endpoint's old one-shot path is the degenerate
case of the loop (max attempts = 1), kept reachable via config until Phase 1 is proven live.
