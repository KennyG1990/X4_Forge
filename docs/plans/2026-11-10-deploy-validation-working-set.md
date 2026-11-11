# Keep validation facts across preview and apply

FULL lane. SPECIFIED under [#97](https://github.com/KennyG1990/X4_Forge/issues/97). Baseline clean Dev commit `80e6776`. The 992-file native scratch apply took 80.26 s, including 21.84 s under the validation stage. Its validator consumes 500 text files. On the same 500-file working set, standalone validation used 3,211 ordinary per-file facts. The 508-entry cache produced zero hits and 3,211 evictions on identical input. Only 89,408 bytes of its 24 MiB payload budget were in use. Repeat validation took 2.70 s without profiling and 2.67 s after one MD edit. The previous native stage also includes readiness, decision work, and deployment effect calculation. The effect calculator calls the compiler even when supplied the exact frozen plan.

Keep the same cache and dependencies. Set the per-file fact limit to 4,500 entries, allowing up to nine facts per file for the 500-file working set. The ordinary cache stays within its existing 24 MiB serialized-payload budget. Larger entry counts can increase object overhead. Lua and effective schema keep their existing partitions. Calculate the effect directly from a supplied frozen plan and use the existing compiler path when a plan is absent. Add request-local readiness, project validation and deployment effect timings within the existing validate stage.

Keep rule evaluation, reference and schema resolution, external proof, approvals, target and source checks, and receipts on their existing paths. No new request fields, file writes, credentials or release behavior. Roll back by reverting. Acceptance requires exact cached and uncached output equality, actual reuse on 500 files, and small cache churn after a one-file edit. The artifact oracle must match a frozen effect even if compiling the editable model would fail. Rerun the same 992-file fixture, both native aliases, focused schema and overlay tests, scoped lint and precommit. Keep all measurements separate from actual AiLive timing and installed or game verification.

## Standalone validation result

An unchanged pass hit all 3,211 ordinary facts with zero evictions. It took 1.03 s without profiling. One MD edit hit 3,204 facts, missed seven, and took 1.07 s. The retained ordinary payload was 771,616 bytes after the edit. Baseline, candidate, and uncached result hashes matched for each input. The CPU sample shifted from schema-state matching to filesystem metadata and parsing. Focused 33/33 and overlay 24/24 passed. The in-server artifact oracle passed 123/123, including exact effect output from a frozen plan with a conflicting editable model. The in-flight original-byte edit was still refused with HTTP 409 before writes.

## Native scale result

The same 992 authored files previewed in 50.80 s and applied in 69.48 s, down from 58.57 s and 80.26 s. Handler validation fell from 21.84 s to 11.75 s on apply. The candidate split is 10.59 s readiness, 1.12 s project validation, and 2.64 ms effect. Preview's cold project validation took 6.36 s. The earlier native run has no substage split, so the combined improvement cannot be apportioned across the two changes.

All 18 scale assertions passed. The manifest and all 993 target file hashes matched the prior run. All seven apply source rechecks ran. The result still identifies 500 text, 471 bytes-only and 22 unavailable rows, the receipt reopens, and last-green stays unpromoted. The disposable runtime was retired. The same-input control shows 13.4% faster native apply on this fixture. The actual AiLive consumer timing and one-minute target remain open.

The full source-native replay passed 313/313 across both aliases. Independent verification checked the stored and decompressed hashes of all 91 captures, compared Lua results, effects and refusal outcomes for both aliases against the prior run, and confirmed the private runtime root was retired. The native evidence directory is `QA/forge-lua61-native-evidence-s3n67352` and the compact summary is `QA/forge-1110-deploy97-validation-working-set.json`.

VERIFIED in isolated source Dev. Scoped ESLint reported zero errors and 234 existing warnings. The full precommit check passed, including typecheck, write inventory and capability checks. Release and installed IDE qualification remain outside this checkpoint.

## AAR

The byte budget alone hid a cache that was too small in entries. Sustain exact result hash comparison with a cold validator, unchanged warm input and one authored edit. Record hit and eviction counts as well as elapsed time. The extra effect compilation was visible only after tracing native validation callers. The new split exposes readiness as the dominant validation stage. The next bounded experiment should profile Doctor's generated MD fallback and workspace action-chain traversal before changing either.
