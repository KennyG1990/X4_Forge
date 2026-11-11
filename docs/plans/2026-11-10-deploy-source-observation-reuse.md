# Reuse the selected artifact during source rechecks

FULL lane. SPECIFIED under [#97](https://github.com/KennyG1990/X4_Forge/issues/97). Baseline clean Dev commit `c32515c`. The prior 992-file headless workload applied in 163.69 s with 89.60 s in source rechecks. The handler rebuilds the request's workspace output and both the selected and disk plans at each barrier. The handler owns a synchronous request-local workspace and snapshot. Its later writes to the returned workspace take place after activation.

Use the artifact planner's existing single filesystem walk to observe both the selected entries and original included disk entries. Hash the same disk rows and rules as the old independent disk plan. Retain the original disk bytes in the binding even when the compiler or passthrough wins. Derive both identities from the same observation to avoid accepting a newly added unselected file between the two initial scans. Preserve existing planner behavior for callers outside deployment. Both native aliases and the project-check worker must agree on the unchanged artifact identity contract.

At each existing barrier, independently verify frozen bytes, re-read the current disk identity, confirm required project-check declaration, current corpus and target path, and leave receipt/authority and target checks in place. Add timings for count and the snapshot, disk and corpus substeps. Do not cache file observations across barriers. There are no changes to public request fields, credentials, write targets or product layout. Roll back by reverting the unit.

Acceptance requires exact planner identity against the previous formula for loose and catalog, including overlaid disk bytes, project exclusion and runtime rules, removed and added files, and memory-only input. A same-length edit under an overlay must change the disk identity while the selected bytes remain fixed. A headless native mutation after freezing must be refused before staging or target writes. Run the full existing native replay, the same 992-file fixture, scoped lint and the mandatory precommit suite. Compare the exact artifact and validation counts and report handler, recheck and substep timings. Evidence stays in the existing QA directory. Installed and in-game work are outside this backend checkpoint.

## Measured result

Both original disk and selected artifact identities now come from the same scan. The artifact hash format is unchanged. Each later barrier reuses the selected artifact and rereads the original disk bytes, verifies the frozen payload, and checks current project declarations, corpus and target. The additive `timings.sourceRechecks` records count and snapshot, disk and corpus milliseconds.

| Same synthetic fixture | Before | After |
| --- | ---: | ---: |
| Preview HTTP | 57.78 s | 59.36 s |
| Preview source recheck | 9.41 s | 1.77 s |
| Bound apply HTTP | 163.69 s | 88.96 s |
| Apply source rechecks | 89.60 s | 12.01 s |

All seven source checks ran during apply. Their totals were 4.97 s frozen-payload verification, 4.66 s disk identity, and 2.10 s corpus identity, plus the remaining path and policy checks. The same artifact and all 993 output files matched the baseline hashes. Coverage remained 500 text, 22 unavailable, and 471 byte-only. The receipt reopened, and last-green did not advance. The synthetic apply improved 45.7%. Preview wall time varied across runs, and real AiLive deployment timing remains open.

The focused snapshot selftest passed 71 assertions. The isolated artifact oracle passed 120 checks. The native mutation test changed original `content.xml` after the selected bytes were frozen, with identical length and restored mtime. Forge returned HTTP 409 `DEPLOY_SOURCE_CHANGED` before staging or writing. The mutation left the target, staging, receipt set and last-green unchanged.

## Verified close

Unit 14. The full native replay passed 313/313, including the exact project-check suite, both aliases, receipt readback and no-write mismatch refusals. Independent readback verified the hashes of all 91 retained raw captures. The six preview, apply and refusal comparisons preserved stable validation fields and artifact rows. The per-run verification declaration contains a distinct absolute path, so its byte hash and the dependent run identities differ. Both apply aliases retained seven source checks. The mutation, scale and replay runtimes all retired. Scoped lint passed with zero errors and 233 existing warnings. The writer inventory passed unchanged. The exact precommit and normal hook results are recorded in `QA/forge-1110-deploy97-source-rechecks.json`. Native replay evidence is `QA/forge-lua61-native-evidence-oufii7ce`. Capability map delta covers paired disk and selected artifact observations and timing detail.

After-action review. The first timed candidate exposed a caller-review omission. The project validation proof path and the in-server artifact oracle also needed the revised planner return shape. The final source repeated the scale, mutation, oracle and native replay tests. A combined inline launcher exceeded the Windows command-line limit, so the final checks used serial invocations. Preserve exact source hashes for every timed run. The largest remaining stages are writes, validation and import. Measure reuse of the loose frozen payload within the existing transaction and preservation checks. The synthetic and real consumer under-one-minute targets remain open.
