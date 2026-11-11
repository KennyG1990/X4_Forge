# Isolated Vite test-cache retention

Status: SPECIFIED; source fix not started. Lane: FULL. Owner: [#99](https://github.com/KennyG1990/X4_Forge/issues/99), child of #20. #98 concerns frozen project-check/runtime/snapshot staging and remains separate. Ken's standing disk-footprint instruction makes this the next unit before additional qualification or Windows packaging.

## Baseline and reconciliation

At functional checkpoint f2914082ffa645a4f6167e07687d44249658d071, source and compiled validation6/6each, rendered screenshots, source/normal hook and exact-head CI43115350011passed. This proves their functional contract; it does not prove bounded cache lifetime. No application source, public0.0.83 or installed payload changed.

The private checkout's physical `node_modules/.vite` retained87physical `deps_temp_<8hex>` directories,907files/18,358,439B after known test/hook producers stopped. Recent timestamps coincide with short-lived Vite test servers. Exact single-run causality is still unproven. Default cache placement and cancelled/short-lived optimization are hypotheses. No issue matched `deps_temp`; broader E2E/cache results #20/#47/#41 did not identify this exact resource owner. Existing lifecycle owner is `tests/e2e/e2e-vite-server.ts`, called by global setup and `scripts/e2e-vite-server.selftest.ts`; reuse it.

All87generated directories were retired after root/link/size/count/writer/listener guards, preserving all other entries. The cache root is empty. Technical evidence: existing QA `forge-1111-ware-reference-compiled-retirement.json`, subsection `viteTemporaryCache`. This is VERIFIED cleanup only; ongoing source retention remains unresolved. Required documentation-commit lifecycle checks may create another bounded batch before the fix; retire only that exact eligible batch after its producers stop and record it separately in the same manifest. No other qualification run should precede the source fix.

## Acceptance contract

- Reproduce once from an observed empty cache, using the current isolated lifecycle selftest; record before/after bytes, entries, timestamps and producer shutdown. Keep failed evidence. Do not infer a Vite defect solely from a temp name.
- Test caches belong to the existing isolated per-run/private state boundary. Define a bounded owner and lifetime; no cache writes enter a shared dependency root or live profile.
- Compiled proxy mode performs no unnecessary source dependency discovery/prebundling, while serving the actual built bytes.
- Successful close and failed startup retire only the exact owned cache after its writer stops. Unknown/active/replaced/linked/foreign paths are preserved and reported. Environment restoration and original failure remain truthful even if cleanup fails.
- Repeated lifecycle tests and actual source/compiled validation flows do not accumulate temporary copies. Record current/peak bytes and entries. Preserve all native/source/asset identities, genuine findings, refusal controls, worker1, protected ports and ownership deadlines.
- Source mode behavior stays unchanged. No new public route, grant, dependency, runtime copy, helper family or game/IDE action.

## Planned implementation and validation

Inspect the installed Vite cache/optimizer contract and decide extend versus replace before changes. Extend the existing owner if its proven listener/environment lifecycle remains suitable; source/compiled6/6and complete shutdown support that choice. Prefer an explicit private cache location and owner cleanup; inspect whether compiled mode can disable discovery through the public API. Do not add another server/runner.

Likely files: `tests/e2e/e2e-vite-server.ts`, existing lifecycle selftest and existing E2E setup/config only if needed. Tests must cover close/startup failure, owned versus foreign/replaced/linked state, exact compiled forwarding and repeated-run footprint. Use isolated fixtures; source gates one-core, E2E/browser affinity3(two cores), worker1,3GiB V8 cap,8GiB-free/25percent CPU/no game-or-IDE admission guard. These are process-local controls, not aggregate OS quotas. Keep the5s ownership query deadline unchanged.

Required checks: targeted lifecycle selftest, meaningful negative/refusal tests, actual source and compiled validation-trust files with inspected rendered proof, type/lint/precommit/normal hook/exact-head CI, post-run PID/listener and protected-pin checks. Reuse the existing finite QA packet/logs and one cache owner. Update #99/#20, capability delta and existing Notion QOL entry; no duplicate issue. Full Windows installed/native-host/game acceptance remains a separate #64/program gate.

Rollback is the bounded helper/config/test diff; generated cache is recomputable from existing dependencies, so no backup copy is needed. Never delete based only on a matching name outside the independently verified private ownership boundary. AAR begins non-clean: residue was discovered after functional qualification; cleanup succeeded but must not be called a permanent repair.
