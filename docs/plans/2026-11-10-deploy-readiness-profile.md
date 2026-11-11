# Measure native deploy readiness

FULL lane, SPECIFIED under [#97](https://github.com/KennyG1990/X4_Forge/issues/97). Baseline Dev commit `a8f9e656ad5026d63c511ba74563390b6f4aa41d`, clean worktree. The same 992-file native apply reports 10.59 s readiness and 9.53 s compilation. The previous source-native replay passed 313 checks. The isolated Dev process chain and discovery identity are current.

This unit measures the existing generator, workspace validator and Doctor on the benchmark's 380 complete MD documents with 36 actions each. Reuse the actual XML parser, generator and Doctor. Keep source and output identities, diagnostic counts and CPU samples in one compact QA record. Compare the Doctor fallback with its existing supplied-file path to identify the generation cost. No production behavior changes. The next unit can implement only after the profile identifies the owning cost.

Acceptance requires exact reproducible input and output hashes, a separate time for generation and validation, a CPU sample of Doctor, and identical diagnostics on the fallback and explicit generated-file controls. Preserve all production source hashes and the private Dev discovery hash. No native deploy replay is required for this read-only measurement. The negative control must retain a node-bound validation error after an authored event-order change. Evidence goes in QA/forge-1110-deploy97-readiness-profile.json. Rollback removes only this documentation change.

Reconciliation checked the graph's 22 callers of validateModWorkspace, generator and Doctor source, ADR-F4 and the capability map. Existing mdExplain helpers use last-wins node maps and full link scans, so they do not yet satisfy first-match compatibility for the proposed traversal repair. Agent-Brain recall returned an old reference-data task, which was read and supplies no readiness performance result. No capability-map delta is claimed before measurement.

The source-independent isolated tests stay headless under the active machine-state authorization. Two exploratory file searches used Windows-incompatible globs. Corrected searches use a directory plus rg --glob. The operator degradation checkpoint applies after this profile.

## Reconciled control change

The first measurement refused its equality assertion before the CPU sample. Supplying the concatenated generated document adds an emitted MD file to Doctor's duplicate-declaration scan. That document combines 380 same-named cues from separate scripts and produces 379 positioned duplicate errors. The fallback checks the graph's per-script names and does not scan that synthetic document as an emitted file. These controls have different input inventories. Compare their shared diagnostics and require exactly those 379 additional duplicate findings. This change corrects the measurement contract and is non-clean. Keep the distinction when designing the traversal optimization.

## Verified measurement

The standalone subset has 380 parsed scripts, 13,680 actions, 14,060 nodes and 13,680 links. It uses the same complete-script dimensions as the scale fixture and excludes its diff and Lua inputs. Generation took 3.122 s and validation 5.051 s. Doctor's normal fallback took 5.844 s after those calls. The supplied-file control took 3.231 s, with exactly 379 additional positioned duplicate findings and identical shared diagnostics. Warm-up and input differences prevent adding or subtracting those timings to predict native latency.

The profiled fallback took 5.725 s. Of 3,817 samples, 3,430 occurred in the two largest anonymous types-module frames, getActionChain and validateModWorkspace. Those 89.9% of samples identify graph traversal as the dominant area. The anonymous frame locations refer to transformed source. Their exact predicates are inferred from the corresponding generator and validator source, which searches the full node and link arrays per action. Replacing those searches with call-local first-match indexes is the next bounded experiment.

The event-order negative control retained its error, node identity and file path. Source and input hashes stayed exact. The generated output hash is `e487656a861401bd2dcbf1f1797f544ad815828ab83f7d7bd9846992a14fed45`. The input hash is `761d4a9e166e62f2a54d4c4ed8c8de03dae902b17b54e36cf906c2ea28ee0b21`. This profile proves a standalone cost and preserves a parity baseline. Native timing after a repair remains to be measured.

## Close and AAR

VERIFIED read-only profile, with a reconciled control change. No capability-map delta. Production source is unchanged from a8f9e65. Keep the release counter at 16 substantial units and review at 18. The next implementation is unit 17.

Sustain separate elapsed and CPU measurements and exact output hashes. Improve control design by checking emitted inventory before asserting diagnostic equality. The failed assertion was corrected to require the specific extra findings, without removing any validation expectation. Tool friction included denied sandbox CIM access and two Windows-incompatible globs. The escalated read-only process check passed, and future searches use directory plus --glob. The highest-risk observed assumption was treating Doctor's fallback and an added emitted MD file as interchangeable. Keep that distinction in the next traversal repair. The operator degradation checkpoint follows this documentation commit.
