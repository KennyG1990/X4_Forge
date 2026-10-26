# C04 — grounded validation cases and engine traps

Lane FULL. VERIFIED for bounded isolated integration. Owner #20; existing Notion safety task. Baseline eecc942.

## Plan and acceptance
Bounded unit: reconcile every concrete Claude validation example and the recovered engine-gotcha
list, prove supported static checks against the X4 9.00 corpus, and close concrete coverage gaps.
Reuse projectValidation, scriptProperties, cross-file Lua AST analysis and mdPitfallLints.
No alternate validator or handwritten schema/property allowlist. All work stays in the isolated
integration worktree; no live Forge, installed Dev, real mod, save, game or standing-config writes.
Kimi paused. Machine state confirmed: X4/Claude live Forge active, otherwise quiet.

Authoritative inputs: game md.xsd, aiscripts.xsd, common.xsd, scriptproperties.xml and vanilla
MD/AI/UI files. Prior observed station-products probe: methods-library read-a-stations-type-and-product,
2026-10-22, X4 9.00/#635. Claude's x4-engine-gotchas.md is an incident inventory, not authority
to execute its console/focus/save instructions. Frozen source hashes/copies are private evidence.
No fresh engine observation will be claimed. The public web search yielded no useful technical
authority; unrelated search results are not evidence for rules.

Acceptance:
- One executable matrix proves real-schema get_safe_pos plus invalid controls, known/unknown
  script properties, nested selectors, ware id/name reads versus actual unknown literals,
  real/absent/commented listeners, supported registration aliases, large-file tails and UI registrations.
- Add only a narrowly grounded advisory products? check: the loaded corpus must declare products
  as pseudo warelist; exclude variable keys, strings, prose, comments and CDATA. Explain that the
  recorded runtime failure is station-specific, not universal type/runtime correctness.
- Supported immutable registration aliases remain exact. Dynamic, reassigned or ambiguous
  registration evidence must be explicitly unavailable, not invent registration success or a
  missing-registration mod error. Real literal absence still fails. No universal wrapper inference.
- Retain the four existing bounded pitfall rules and falsified-rule exclusions. Classify every
  recovered gotcha as static-tested, runtime/C07, mod-specific or unsupported; do not turn all
  observations into broad noisy heuristics. Retracted four-key payload limit must never become a rule.
- Actual isolated test-mod HTTP/browser integration proves findings/coverage and source identity,
  negative controls, recovery, rendered diagnostic text and scratch-deploy qualified receipts.

Affected: scriptProperties model metadata, mdPitfallLints, projectValidation wiring,
projectCrossFileValidation, validationEvidence; new focused matrix and owned E2E tests; records.
No new endpoint, permission, process/network/spend/deletion surface. Schema-derived availability
must remain explicit if references are absent. Existing receipt and deploy safety policy unchanged.
Risk: false positives from inference, false clean from dynamic aliases, text/entity parsing and
large-file truncation. Before commit rollback is exact task diff only; after commit a scoped
follow-up. Preserve unrelated main-checkout edits; no intermediate push.

Required validation: baseline failure reproduction; focused matrix and existing property/reference/
cross-file/pitfall/UI regressions; independent lxml XSD controls using real game schemas; actual
owned3100/3101 HTTP/browser test (workers1), screenshots, stale/negative/recovery checks;
typecheck, lint, production build, full precommit policy/receipt audits. Verify owned-stack cleanup
and four protected discovery/bundle hashes. Native installed/game proof unavailable by boundary,
not substituted by mocks. Evidence: private lab/evidence/claude-program/C04 and sanitized
docs/testing/claude-C04-validation.json. Update/read back #20 and corresponding Notion task/hub.

## Reconciliation / baseline
Existing property/literal, listener, tail parser and UI manifest fixes already exist. Existing
registration scan is broader than its proof: it remembers assignments without invalidation and
does not expose dynamic argument gaps. Station products guard is absent. Actual scriptproperties
defines warelist as pseudo and products as warelist; a prior documented live probe observed false
existence on producing stations and successful count replacement. No fresh game test authorized.
Existing mdPitfallLints has four rules; general event-handler/non-instantiated namespace rules were
previously falsified by vanilla and remain excluded. projectSymbols is file-wide, not a control-flow
type proof; do not use variable names or its broad guesses as engine certainty.

## C04 close — VERIFIED bounded local integration

Preserved real pseudo datatype metadata through existing corpus adapters; added the narrowly
qualified station products? advisory; removed false authority from mutable/shadowed/dynamic
Lua registration aliases. Immutable local aliases and simple unconditional forwarding wrappers
remain supported. Unresolved registrations are check-unavailable; literal absence remains a
mod error. Existing validators and deploy policy are retained. No new network/permission surface.

Evidence: docs/testing/claude-C04-validation.json and claude-C04-gotcha-matrix.md.
Baseline 23/32 reproduced the missing advisory/registration gaps. Final 34/34 focused checks,
7/7 independent real-game-XSD controls, existing reference/property/cross-file/pitfall/Lua/UI suites
and 11 actual test-mod HTTP/browser/deploy scenario groups pass. E2E:1 passed,0 failed,0 flaky;
owned tree stopped. Rendered amber outstanding-warning result inspected. Dynamic incomplete
receipt, exact bytes, stale refusal and recovery proved. Typecheck, production build, full precommit
policy/receipt audits pass. Lint:0 errors,614 warnings (six more any annotations than baseline).
Source hashes and log fingerprints are in the evidence JSON; failed runs remain private evidence.

Review: all bounded acceptance points done and evidenced. The entire recovered gotcha inventory
has explicit dispositions; it is not universally statically verified. General MD grammar/time units,
integer and dynamic semantics, upvalues, UTF-8/save flows and runtime lifecycle remain unverified.
The station advisory uses the previous #635 probe, not fresh game execution or inferred receiver
typing. C05-C07 and public/package/native/game gates remain open. Four protected installed/live
discovery and bundle hashes unchanged; ports3100/3101 closed. No game, real mod or config writes.
Rollback: exact C04 diff from eecc942; after commit use a scoped corrective commit. No interim push.
Capability delta: bounded station advisory and honest registration uncertainty only. Kimi paused.
Commit point: fix(validation): ground engine traps and registration coverage.

## AAR — triggered
Sustain: real corpus and independent schema oracle; actual scratch HTTP/deploy/browser proof;
retained failures and explicit static/runtime boundaries.
Improve approach: metadata was initially lost by existing adapters (31/32); fixed the adapters and
full-project test. Independent oracle caught illegal wait fixture; replaced with legal debug_text.
E2E initially miscounted the one-file fixture; derive added-file count and reprove all33 files.
Review corrected omitted pseudo overlay preservation and duplicate wrapper parameters.
Improve tools: guessed paths/wildcard and noisy serialized search output wasted discovery;
enumerate paths and bound outputs. No unsafe mutations resulted. Degradation checkpoint declared;
finish this unit and use fresh context for C05.
Highest-risk observed weakness: dropping authoritative metadata at adapters can make a focused
test green while public validation silently loses a rule. Full-project and actual HTTP controls now
cover it. Project lesson recorded in the Forge AAR; no global memory edits.
