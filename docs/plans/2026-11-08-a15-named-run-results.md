# A15 receipt-backed project check results

Status VERIFIED for the isolated Dev checkpoint on 2026-11-08. [Issue #61](https://github.com/KennyG1990/X4_Forge/issues/61) remains PARTIAL. Full lane. Baseline is the clean isolated Dev checkout `d0420789bd0ccba683d8a135ff5dd89a16698aff`. The previous async status route reported a generic suite failure. The new projection reuses the command identities, terminal worker outcomes, and existing receipt limits.

Bind the attempted child receipt IDs and hashes to a failed or incomplete suite's terminal receipt. Bind a failed run to the exact failed suite receipt. Reopen only the bounded children linked by the suite. Verify their identities, authority hashes, artifact, terminal facts and attempted set before reporting named results. Report the planned and unattempted counts separately and label a check refused before start separately. Retain the existing passing suite reference only when all exact children can be reopened. A missing or tampered expected result produces an incomplete status without verification credit. Keep old failures without terminal links readable as coarse failures. A prepared or interrupted run remains pending recovery and cannot replay.

Expose worker outcome, duration, exit, bounded output count and its digest without retaining raw output, commands, environment or paths in the status response. Mark an exceeded output cap explicitly. Add no runner privileges, live operations, or raw output store. Raw output presentation remains a separate policy and product decision. Keep the normal Forge validation and native apply authority checks.

Prove actual successful, named nonzero exit, timeout, and output-limit Windows attempts over an approved scratch project. Test fail-fast unattempted counts, exact retry/restart persistence, unrelated key and missing child refusal, and native deploy regression. Run precommit before a local commit. Keep evidence in the private QA directory, this record, and #61. Rollback checkpoint is the baseline. Installed IDE, parallel execution, raw output and X4 verification remain separate.

## Status response

Poll `GET /api/agent/project-check-runs/:id` using the original workspace and deploy key. An exact terminal result may include `suiteReport` with the suite identity, planned count, unattempted count, and linked command results sorted by check name. `stoppedBeforeCheckId` identifies a planned check refused before it began. A command with an unconfirmed result has no worker metrics. A worker verdict and the enclosing receipt can differ if the approval or artifact binding changes during execution.

`worker.outputLimitExceeded` marks a capped output count. In that case `outputBytes` is the observed lower bound. Worker output is represented by the byte count and retained-tail SHA-256. A historical passing result can supply `suiteReceipt`. Native deployment still rechecks that receipt against current authority and artifact bytes.

## Evidence and review

- The previous exact bundle reproduced the unnamed failure in 23/23 baseline assertions. The new bundle SHA-256 `d3bb057f6fb0ff4b3f73341e32bf0f04aace4b51f610388d5a2c4deeaa079350` passed 90/90 HTTP assertions. Real Windows checks passed and produced named nonzero, timeout and output-limit results. The restart and retry replay reopened the same exact reports. Removing an expected child downgraded both passing and failed results to incomplete. The foreign key could not read the run. Raw worker output stayed out of the response and durable receipts.
- The real Windows suite selftest passed 9/9 scenarios, including unconfirmed worker evidence and owner revocation before the next command starts. The report identifies the stopped-before check and preserves the last confirmed result without assigning an invented worker outcome.
- Private evidence is in `forge-a15-named-results-http-jyem2u6q/verdict.json`, `forge-a15-named-results-http-1v6xi9rx/verdict.json`, and `forge-a15-named-suite-selftest.log`. No public capability-map delta. Installed result presentation and raw output access remain pending.
- The same bundle passed native proof 60/60 and async interruption 52/52. Precommit passed TypeScript, capability, MCP, durable writers, and receipt audit. Evidence is `forge-a15-owner-native-regression-lvbo04pp/verdict.json`, `forge-a15-async-runs-http-61exwhep/verdict.json`, and `forge-a15-named-precommit.log`.

## AAR

Keep a real failing control on the previous build and reopen the new result after restart. Failed receipts have no after state, so the existing terminal summary binds the exact attempted child set. The action receipt format canonicalizes authority resources. The report sorts by name and does not infer declaration order. The worker's output-cap sentinel is a lower bound. A missing receipt is unresolved evidence even when the original terminal result had passed.
