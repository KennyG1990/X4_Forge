# B119 cold-start Tailwind source ownership

Lane FULL. Status VERIFIED for this bounded startup/source-ownership repair.
Full builder goal PARTIAL. Local/direct; no agents, Git, release or external writes.

## PLAN / BASELINE / RECONCILE

Full objective reread: all nine authoring journeys, three real menus, broader numeric/native
fidelity and package/release gates remain required. Previous turn PROGRESS: scenario replay
improved measured interaction time, but remaining first-case navigation consumed27.8s.

[REPRODUCED] Existing immutable first-attempt trace: /src/index.css27.103s,27.094s waiting;
five other assets26.6-26.7s waiting concurrently. Largest recorded API request0.326s.
Existing installed Tailwind scanner default cwd/** scan:13.858s,766files,78567candidates;
artifacts16files/86,039,283bytes vs src314files/14,208,176bytes. No files modified by census.
[HYPOTHESIS] Broad Tailwind source detection contributes to cold-start stall; must verify
actual cold browser after correction, not call scanner time the full navigation cause.

Graphify read-only query `vite` locates vite.config.ts/studioTokenPlugin; live source is
authoritative. Tailwind Vite plugin uses compiler.root (or cwd) plus compiler.sources to
construct its scanner. src/index.css imports Tailwind with no source boundary. Actual UI
entry is index.html -> src/main.tsx -> src/App.tsx. Shared modules imported by main contain
no className/class=; public-assets/index.html also contain no such styles. Keep all src
files (including fixtures) conservatively and register index.html explicitly.
Official reference: https://tailwindcss.com/docs/detecting-classes-in-source-files . Installed
@tailwindcss/node compile and oxide Scanner types/implementation verify supported syntax.
ADR-F1/F5 and capability map read; no workspace/source authority changes or capability delta.
Recall matched old reference API note header only; weak retrieval, no inferred prior fix.

Selected: set source("./") on src/index.css import, plus @source "../index.html".
Alternatives: excluding only artifacts leaves other non-UI roots growing; increasing test
timeout hides startup delay. Explicit frontend ownership is shared dev/production behavior.
Owners: src/index.css; scripts/e2e-vite-server.selftest.ts (existing precommit-owned gate).
Reuse existing Vite lifecycle fixture, installed compiler/scanner, browser tests and runner.
No new renderer, result cache, arbitrary Lua execution, geometry, test deadline or oracle change.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; all dirty changes preserved. Prior
scenario checkpoint guards rechecked03:06Z. New exclusive evidence root
test-results/b119-tailwind-scope-20260914/: owner-byte backups; prior408inputs plus index.css
and index.html; membership,50oldartifacts/4realLua/19livefiles. Wrapper reused, exact new
owners only. No modification to old evidence. X4/ports observed at baseline and browser start.
Rollback only CSS directive/test additions against backups, never restore dirty files wholesale.

## ACCEPTANCE / VALIDATION

1. Baseline existing Vite selftest, then add fail-first source-ownership regression using
   actual compiled stylesheet's declared scanner sources. Exact frontend file and candidate
   conservation against independent src+index scan. No external dirs allowed. Reject the
   old implicit root as counterfactual. Compile all frontend candidates under old/new import
   modes; generated CSS must be identical (preserves custom rules and all frontend utilities).
2. Minimal CSS directives, then full existing Vite lifecycle selftest green including occupied
   port rejection/environment restoration. Whole tsc; changed-test lint; exact task diff review.
3. Isolated production Vite build under this evidence root (no standing dist writes), confirm
   stylesheet output. Browser check covers real stylesheet in actual rendered app, not only
   SourceEditor's synthetic bare-Tailwind mounted selftest. No installed/native claim.
4. Cold unchanged B-after-A scenario history plus named scenarios and New-menu history in
   standard runner3200/3201,1worker,retry1,trace on, existing60s/zero-flake rules. Inspect PNGs,
   exact CSS/navigation timing, complete report, owned-stack cleanup and all protected inputs.
   Existing actualMENU source roundtrip passed prior turn; CSS compile conservation covers
   its frontend classes but does not replace full integration/three-menu/package/native gates.
5. Preserve original failed traces; log commands/results, final status and AAR here/backlog/
   handoff. No commit/publish, game/mod/config/install, external wiki/issues or memory writes.

Risk: omitted frontend class source would change styling. Exact full src+index candidate
and compiled-CSS conservation, production build and real rendered history journeys are required.
No new spend/network/delete/permission surface. User continuation overrides generic skill
feedback/commit pauses, not authorization gates. No machine-state change observed so far.

## CLOSE / AAR

Implemented only two CSS directives and a regression in the existing Vite selftest.
Exact inverse review confirms original CSS bytes beyond the import unchanged and every
prior lifecycle assertion retained. No new cache, renderer, runtime input, source edit,
authority rule, browser assertion, timeout, retry or flake-policy change.

Validation (all commands use bundled Node through this unit's checkpoint.mjs run <label>):
- vite-before: original existing lifecycle suite PASS0.
- vite-red: new test on old product FAIL1 as required,452nonfrontend files. Frontend CSS
  equivalence control already green before the ownership assertion fails.
- vite-after: full lifecycle plus exact315frontend files/42,762candidates PASS0;
  zero outside sources. Frontend CSS SHA256 unchanged before/after:
  99626de66504a252b6a5789bf20a2e14d88752076cf233a95f8d3c4f272f6ed2.
  Occupied-port refusal, successful/failed-start environment restoration still pass.
- types: whole tsc --noEmit PASS0. lint: changed selftest PASS0. Whitespace PASS.
- production: Vite build --outDir test-results/b119-tailwind-scope-20260914/production
  PASS0 in18.12s. CSS162.30kB,JS3105.68kB. Existing large-chunk advisory retained; no standing
  dist/server/install writes, and no installed-host claim.
- review: exact two-directive delta, all original test bodies preserved, before/after
  candidate/CSS control PASS0. code-review-excellence used for reread/coupling review;
  optional reviewctl/rules/BlastRadius absent, no install; manual review plus gates used.
- rendered: session29542/runner44520 TERMINAL, started03:17:03.175Z. Three existing journeys
  complete first attempt: scenario-B history35.2s, named scenarios17.3s, New-menu history53.8s.
  Structured PASS3/0failed/0flaky/0skipped,3terminal,0globalerrors. No test suppression.
- final-review: summarize.mjs validates complete verdict, three traces, two old/new network
  captures and containment. timing-review.json records exact timestamps/timing/guards.
  All410frozen inputs/408nonowners,50protectedartifacts/4realLua/19livefiles and memberships
  unchanged; ownedtreeGone, X4 absent, only existing Deckwright3100/PID69604. All handles terminal.

[REPRODUCED] Fresh-stack first navigation1241.7ms vs27826.8ms; index.css492.745ms vs27103.026ms.
New CSS wait484.052ms; prior27093.727ms. No before/after source validation bypass. This is
one observed comparison, not a universal cold-OS-cache benchmark. Initial scanner-only
13.858s versus warm red252.3ms/green101.3ms demonstrates cache sensitivity; do not equate
scanner-only time with total Vite generation. Source boundary removes452irrelevant files
and the uncontrolled artifact dependency independently of wall-clock variance.

Rendered PNGs inspected: scenario-B-redo and b119-source-history-alternate-edit. Canvas,
hierarchy, inspector, selection and scenario text match prior visible state; Not verified
in game remains. Existing fixture validation indicator is not a claim about whole real mod.
Scope review: every declared startup method evidenced. No capability-map delta. Full130
integration, immediate property feedback, remaining normal layout/keep-out/recovery UX,
three-menu/twelve-reference numeric and native parity, package/install/release remain open.
No Git/issue/wiki/global-memory writes. Rollback is exact directive/test-addition inverse
against owner backups; do not restore entire dirty files. Commit point:
perf(ui): scope Tailwind scanning to frontend sources (not committed).

AAR non-clean: fail-first intentional failure; initial overlong skill output and one rg
string-versus-object formatting error corrected without mutation. Sustain source-derived
network evidence, independent frontend candidate/CSS conservation, immutable before/after
traces and cold first-case verification. Improve approach: inspect slow network responses
before attributing every timeout to UI computation. Improve tools: bound reads by individual
file/chunk; rg emits strings, not Select-String MatchInfo. No external memory update.
Highest evidenced product risk: synchronous authoring still stalls several seconds on small
fixtures and previously15-20s on realMENU; this CSS fix does not claim to solve it. Next use
existing CPU evidence to isolate remaining validation cost while preserving all authorities.
