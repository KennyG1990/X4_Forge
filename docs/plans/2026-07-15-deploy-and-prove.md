# B38 — Playtest Deploy and Prove

The program-level direction lives in `2026-07-14-product-loop-next-level-{design,implementation}.md`.
This record captures the reconciled B38 acceptance contract before implementation.

## PLAN

- **Lane:** FULL.
- **Bounded unit:** replace Playtest's scattered deploy, watcher, cue, watch-value, state-topic, and text-artifact
  fragments with one `Deploy and prove` session driven by a pure state machine and one coherent watcher snapshot.
  GuidedRail consumes the same session/verdict semantics instead of maintaining a second deploy guess.
- **Assumptions/unresolved:** X4 can only prove what it logs. File-load evidence proves the extension was seen;
  cue/marker evidence proves execution; FORGE-WATCH and FORGE-STATE are optional and must never be required for
  mods that do not emit them. Experience confirmation remains a separate player gate. A generic workspace cannot
  be safely cloned by changing only its extension id because internal identifiers may collide.
- **In scope:** pure proof reducer and artifact builder; one reusable DeployAndProve component; exact write
  confirmation; current visible workspace in every workspace deploy; server watcher brief enriched with one-tail
  watches/state/capture identity; file-load-aware watcher verdict; executed-cue/source navigation; copy/download
  JSON proof; timeout, stale, partial-expected-chain, runtime-error, network, and retry states; GuidedRail reuse;
  selftests, e2e, rendered browser proof, and a purpose-built scratch X4 validation run after explicit approval.
- **Out of scope:** automatic cloning/renaming of arbitrary mods; rewriting internal X4 identifiers; persisting
  proof history server-side; claiming player experience from logs; changing ADR-F3's read-only FORGE-STATE rule;
  B39 AI editing; installer work; real mod/config/Git mutation without its separate authorization.
- **Risks/authorization:** deploy-verify writes staging and the real X4 extensions directory. The UI must display
  the exact workspace id and target and require a second explicit click. This task will not perform that real write
  until the operator paragraph is given and Ken explicitly approves. Client artifacts contain local paths and log
  excerpts, so export is user-initiated and never uploaded.
- **Rollback/checkpoint:** HEAD `8050e03` plus the captured mixed B34-B37 dirty tree. B38 is additive at the pure
  seam/component and backward-compatible watcher fields; removal restores the prior panels. No migration or
  persistent server proof store is introduced.
- **Acceptance:** (1) no workspace deploy request can omit the visible workspace; (2) one reducer owns idle,
  confirming, deploying, waiting, partial, proved, failed, timed-out, and retry behavior; (3) a proof cannot become
  green without a successful matching deploy plus post-deploy game evidence; (4) a fresh file-load mention can
  prove data-only extensions seen, while marker/cue evidence is labelled stronger execution proof; (5) stale/no-log/
  not-seen/error states remain non-green; (6) optional watches, state topics, executed cues, deploy checklist,
  timestamps, hashes, and watcher evidence appear in one copyable/downloadable JSON artifact; (7) GuidedRail and
  Playtest do not independently derive success; (8) source navigation still opens a failing/executed cue.
- **Required validation:** typecheck; focused playtest-proof and watcher-verdict selftests; oracle sweep; focused
  e2e with mocked no-write contracts; full e2e; rendered in-app browser at desktop and 1280 with zero console
  errors; production build; precommit; graph refresh; authenticated live-workspace identity check. Negative paths:
  confirmation cancel, omitted/mismatched deploy identity, stale/no log, data-only file load, partial expected chain,
  runtime error, timeout, network failure, and retry. Final live layer: purpose-built scratch extension deployed and
  observed in X4 only after explicit game-write approval.
- **Evidence:** selftest/sweep output, Playwright report, browser screenshot/DOM evidence, exported proof fixture,
  scratch X4 debug-log evidence, ROADMAP/handoff/AAR.

## BASELINE

- **Revision:** `8050e03`; B34-B37 and their records are intentional uncommitted work and must be preserved.
- **Runtime:** `:3000/:3001` live; authenticated workspace `Player_Elite_Escort`, 3 nodes / 2 links / 3 widgets,
  content hash `dac6d106bd45f2bd`.
- **Existing state:** `/api/agent/deploy-verify` already validates, compiles, writes staging + extensions, confirms
  bytes, runs Extension Doctor, and records an in-memory workspace hash. `/api/agent/debug-watcher/brief` already
  owns the deterministic watcher verdict, timeline, expected-chain checks, deploy freshness, nested cue liveness,
  and a text artifact. `/api/agent/live/cue-telemetry` exposes FORGE-WATCH; `/api/agent/live/forge-state` exposes
  FORGE-STATE. Playtest polls three endpoints and renders them separately; GuidedRail runs its own deploy/poll loop.

## RECONCILE

- **Resources/readers/writers:** deploy-verify callers in App, CodePreview, CueViewer, DiagnosticsHub,
  PlaytestWorkspace, and GuidedRail; lastDeployInfo/readiness; game-log status and watcher brief; live cue telemetry;
  FORGE-WATCH/FORGE-STATE parsers; readiness ladder; source-navigation event bus; template RailGuide; ADR-F3.
- **Existing capability reused:** the deploy gate, watcher verdict, cue attribution, watch/state parsers, readiness
  hashes, source navigation, compile checklist, and browser download APIs. No second compiler, deploy route, or
  success heuristic is created.
- **Couplings:** visible workspace -> deploy request -> lastDeploy hash -> watcher sinceDeploy -> readiness;
  one log tail -> verdict/cues/watches/state/artifact; proof phase -> GuidedRail/Playtest; cue evidence -> source nav;
  exact deploy identity -> experience confirmation.
- **Presence/absence:** the watcher brief is the right read contract and can be backward-compatibly enriched, so a
  new playtest server endpoint is unnecessary. There is no safe generic scratch-clone facility. There is also no
  durable/shareable structured proof bundle; the current artifact is text and omits watches, state, workspace hash,
  capture time, and deploy checklist.
- **Reproduced defects:** Playtest's blank path sends `{}` and can deploy the server-cached workspace instead of the
  visible canvas. Its expected chain is hard-coded to AI Influence cue names for every mod. The watcher verdict
  ignores its own `states.seenByX4`/file-load evidence, so data-only patch/t-file mods can remain `not_seen` even
  when X4 logs loading the extension.
- **Extend versus replace:** extend the watcher brief and replace only component-local orchestration. The existing
  server primitives are authoritative and have regression coverage; duplicating them would create a new divergence.
- **Capability-map delta:** pending close; B38 will add a structured game-backed proof-session capability.
- **Plan changes from program draft:** automatic scratch cloning is rejected as unsafe. The product confirms and
  deploys the current workspace unchanged; the validation fixture itself is a purpose-built scratch workspace.

## IMPLEMENT

- Not started. Implementation remains behind the requested B34-B37 commit point.

## VALIDATE

- Not started.

## REVIEW

- Specification reconciled; no implementation review yet.

## CLOSE

- **Status:** SPECIFIED.
- **Remaining gate:** commit/review the existing B34-B37 mixed dirty tree before B38 implementation; later, explicit
  approval is required for the scratch game-directory write and X4 run.
- **Suggested eventual commit:** `B38: consolidate deploy and game-backed proof`.

## AAR

- **Triggers:** reconciliation invalidated the generic scratch-clone assumption and reproduced two existing proof
  divergences plus one stale-workspace deploy path.
- **Sustain:** tracing resources and all callers found the narrow authoritative seam before adding infrastructure.
- **Improve work/approach:** product safety claims must include X4's internal identifier namespaces, not only the
  extension folder/content id.
- **Improve tools:** no new tool weakness evidenced during specification.
- **Highest-risk evidenced weakness:** the blank-path Playtest button can deploy a workspace other than the one the
  user sees. B38 makes workspace identity mandatory in the request and proof reducer.
- **Lessons banked:** recorded in this task file; external canon remains unchanged pending its separate authority.
