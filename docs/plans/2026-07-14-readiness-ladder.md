# B36 — One readiness evidence ladder

The full program and slice order were documented before B35 implementation in
`2026-07-14-product-loop-next-level-implementation.md`. This record captures B36's reconciled execution.

## PLAN

- **Lane:** FULL.
- **Bounded unit:** one five-stage evidence model and global clickable ladder: Graph valid → Package valid
  → Deployed → Seen in game → Experience confirmed.
- **Assumptions/unresolved:** the existing server watcher verdict is authoritative for machine-observed game
  state; experience remains an explicit user assertion. In-memory deploy metadata is honest but does not
  survive server restart; restart therefore becomes unavailable/no-deploy, never green.
- **In scope:** pure readiness state engine, deploy workspace hash, App polling adapter, compact ladder,
  evidence details, owner navigation, per-deploy experience confirmation, oracle and e2e.
- **Out of scope:** performing a deploy, changing watcher heuristics, persisting deploy history across server
  restarts, B37 shell, B38 deploy-and-prove orchestration, game/mod/config writes, Git mutation.
- **Risks/authorization:** false-green evidence is the primary risk. Browser/e2e may mutate disposable or
  explicitly authorized workspace state, but this slice requires no real deployment.
- **Rollback/checkpoint:** HEAD `8050e03` plus the mixed B34/B35 dirty tree captured in handoff/status. Remove
  new readiness files/App adapter/hash field; no data migration exists.
- **Acceptance:** fixed five-stage order; graph/package use current workspace evidence; checking/local fallback
  cannot be green package proof; deploy requires game path plus matching workspace hash; edits make deploy,
  seen, and confirmation stale; watcher no-log/stale/not-seen/errors/clean map honestly; experience confirms
  only the current clean deploy; clicks route to Canvas/Package Diagnostics/Playtest; negative states are
  visually distinct; typecheck, runtime sweep, full e2e, browser, production build, precommit pass.
- **Evidence:** readiness selftest, Playwright report, rendered browser screenshot/DOM, ROADMAP/handoff/AAR.

## BASELINE

- **Revision:** `8050e03`; B34 and B35 are uncommitted and preserved.
- **Runtime:** `:3000/:3001` live; `Player_Elite_Escort` 3 nodes/2 links/3 widgets.
- **Existing state:** App owns current local/package diagnostics; deploy handlers independently render results;
  debug-watcher brief owns one server verdict and deploy/log freshness; GuidedRail and Playtest render it.
  `LastDeployInfo` records mod/time/paths but not workspace content, so it cannot prove current deploy freshness.

## RECONCILE

- **Resources/readers/writers:** App diagnostics and routing; `deploy-verify` plus legacy deploy writers;
  `LastDeployInfo`; `buildDebugWatcherBrief`; `watcherVerdict`; Canvas package badge; DiagnosticsCenter;
  GuidedRail; DiagnosticsHub/PlaytestWorkspace; TTFM experience mark; capability map and ADRs.
- **Existing capability reused:** `validateModWorkspace`, B34 package diagnostics/source, B2 workspace hash,
  deploy metadata, B19s2 watcher verdict, existing sidebar/workspace routing.
- **Couplings:** current workspace hash ↔ deployed hash; deploy timestamp ↔ log freshness ↔ confirmation;
  package source ↔ false-green prevention; ladder owner ↔ mounted route.
- **Presence/absence:** every evidence source exists, but no shared model/ladder or explicit experience proof
  exists. Deploy metadata lacks content identity. No duplicate validator or watcher is needed.
- **Capability-map delta:** pending close.
- **Plan change:** add workspace hash to existing deploy metadata; without it the proposed freshness contract
  would be false.

## IMPLEMENT

- Added `readiness.ts`: one pure five-stage model with explicit pass/warning/fail/pending/stale/unavailable
  states and fail-soft confirmation storage.
- Extended existing successful deploy metadata with sanitized workspace content identity. Failed
  byte/doctor gates no longer overwrite successful deploy evidence.
- Added global `ReadinessLadder` and App adapter over current graph/package/watcher sources; no duplicate
  validator or watcher.
- Added controlled Package Diagnostics routing and exact-deploy user experience confirmation.
- Added focused e2e and runtime selftest registration.

## VALIDATE

- `npm run typecheck` -> PASS; one initial selftest fixture category typo was caught and corrected.
- readiness selftest -> PASS 21/21.
- `node scripts/oracle-sweep.mjs` -> PASS 79/79 via runtime index.
- Focused e2e -> final PASS 2/2. Earlier runs exposed a missing adoption precondition, a synthetic reload
  normalization mismatch, and one known Windows worker crash; final production-shaped poll path is stable.
- Full `npm run test:e2e` -> PASS 16/16, verdict parser PASS.
- Browser -> PASS: Graph/Package green; Deploy “Not deployed”; In game “Deploy first”; Experience waiting;
  no confirm button without clean proof. Package routed to Package Diagnostics; Deploy routed to Playtest;
  evidence expanded inline; screenshot visually usable.
- `npm run build` -> PASS (1,795 modules; existing chunk-size warning only).
- `npm run precommit:check` -> PASS; `git diff --check` -> PASS.
- `graphify update .` -> PASS: 1,559 nodes / 3,610 edges / 94 communities.
- Live workspace after isolated e2e -> unchanged `Player_Elite_Escort`, 3/2/3.

## REVIEW

- Graph/package current evidence -> done/evidenced.
- Deploy content identity and stale-after-edit -> done/evidenced.
- Watcher no-log/stale/not-seen/error/clean -> done/evidenced.
- Exact-deploy experience confirmation -> done/evidenced; impossible in the live no-deploy state.
- Owner routing -> done/evidenced.
- Fresh-eyes findings corrected: failed deploy attempts previously overwrote last-deploy metadata; log
  activity could pass Seen without a current matching deploy. Both false-green paths are closed.
- Deliberately deferred: persisted deploy history across server restarts and B38 orchestration.

## CLOSE

- **Status:** VERIFIED.
- **Remaining risk:** last successful deploy metadata remains process-memory evidence; after server restart
  the ladder honestly returns no deploy proof until the next Forge deploy.
- **Suggested commit:** `B36: unify graph-to-game readiness evidence`.

## AAR

- **Trigger:** reconciliation strengthened the plan with deploy content identity.
- **Other triggers:** initial typecheck fixture error; two focused e2e assertion failures plus one worker
  crash; fresh-eyes review forced two false-green corrections.
- **Sustain:** reuse authoritative evidence owners and make content identity part of freshness.
- **Improve work/approach:** e2e readiness fixtures must wait for workspace adoption and should exercise the
  live poll instead of introducing a second boot normalization cycle.
- **Improve tools:** deploy evidence should eventually persist if cross-restart history becomes product-critical.
- **Highest-risk evidenced weakness:** attempted/failed deploys were recorded as last deploy and could green
  downstream state. Only verified success now writes that evidence.
- **Lessons banked:** project and global AAR ledgers updated.
