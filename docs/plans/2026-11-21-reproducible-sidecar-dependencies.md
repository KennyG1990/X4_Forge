# Reproducible staged sidecar dependencies (#20)

> **For agents:** Use the planning or brainstorming skill if context is missing.

**Status** SPECIFIED. **Lane** Full. **Owner** Forge QA, [#20](https://github.com/KennyG1990/X4_Forge/issues/20#issuecomment-7065908447).

## Objective and baseline

Make the normal Forge sidecar package install depend on one reviewed, reproducible dependency graph per supported manifest. The G checkout is at `408f2542d4f6f91873417f2f6cb6cca52b6ef034`. On 2026-11-21 a lock-only replay of the old `npm install` selected four direct versions different from the root lock. That prospective graph audited clean but was not bound to the next staging run. Existing production artifacts were absent. X4 was active, so use only local lightweight, no-install tests on G. Full normal release gates remain a separate requirement.

## Reconciliation and architecture

`vscode-extension/scripts/stage-app.mjs` owns the pruned manifest, platform check, staging, and native assertions. Use its dependency mapping in release staging and explicit lock refresh. Windows has one additional direct dependency for native job containment. Preserve both supported graphs without introducing Windows-only bindings to the portable package. The old release notes already link deterministic runtime locking to #20. The capability map and decision ledger identify existing staged and isolated installed proof. Package inspection and Dev runtime reuse stay in place.

An optional audited lock argument would leave normal CI staging unpinned. Reusing the root lock also cannot express the Windows job dependency from the extension without mixing dependency trees. Instead track `vscode-extension/runtime-locks/{windows,portable}.json` as the two npm lock inputs. Normal staging verifies the selected physical lock's identity, dependencies and direct resolutions before replacing the staged app. Write the lock bytes into the stage, run the normal npm lifecycle with `npm ci --omit=dev`, and verify the lock bytes afterward. One package tree is installed in the ordinary staging directory. Keep the Dev-only qualified runtime input supported. Add an explicit refresh command that resolves both locks with the same manifest-generation code and writes the new locks after both resolutions validate. The source locks are build inputs excluded by the VSIX allowlist. Existing package version and published artifacts stay outside this unit.

## Validation and rollback

1. Refresh both profiles with lock resolution only. Inspect roots and verify npm integrity metadata. Audit both exact graphs at high severity without installing package files.
2. The ordinary stage selftest must verify platform selection, stale/missing/link/mismatched lock refusals, and preserve existing Dev-source cases. A workspace-level verification must run an npm CI offline dry-run against each exact lock without using or creating a package tree. Check unchanged lock hashes and owned temp cleanup.
3. When authorized, run ordinary precommit, staged runtime and installed VSIX gates on the exact release candidate, including SQLite and Koffi as applicable. Do not infer full installed proof from the dry-runs. Record evidence in the G sidecar receipt and on #20.

Rollback this bounded source change by reverting only the stage script, the two lock files, the publishing guide and the plan. Preserve the mixed dirty candidate and any staged/app artifacts that preceded the unit. Capability map delta is none for the plan. CI, publication, game and SDK behavior remain outside the focused setup.

## Implementation and close

**Status** PARTIAL. The default command now chooses the reviewed target lock, validates it, uses `npm ci`, and checks the actual output lock bytes. Refresh resolves lock metadata without running package installation scripts. No product capability-map change. The platform locks total 213,665 bytes.

- `node --check vscode-extension/scripts/stage-app.mjs`, the stage selftest, and all three ordinary entry-point refusals passed on G. The existing staged sentinel survived each refusal.
- Both exact locks passed an offline `npm ci --dry-run` and registry audit with zero advisories. Windows has 240 recorded packages and Linux dry-run selected from the 219-entry portable graph. Both temporary fixtures retired and installed zero packages.
- Required precommit, full staging/native boot, and installed/packaged proof remain pending. Current X4 was active. The dry-run did not execute any native lifecycle or test an actual Linux host.
- Evidence is under `reviewed_runtime_lock_stage` in the existing G deployment receipt. Commit title after the required checks is `fix(packaging): stage sidecar from reviewed runtime locks`.

AAR. The scoped stage probes kept a single checkout and retired all temporary directories. The documentation edit emitted a non-blocking Python backtick warning. Readback and diff validation matched the intended documentation. Exact staging with native scripts and VSIX installation remains the highest-risk unverified boundary.

### Exact Windows SQLite native dependency

The locked better-sqlite3 12.11.1 and its loaded JavaScript dependencies matched npm lock integrity records. The upstream Windows x64 Node ABI 137 archive matched its published SHA-256. In a 1,953,441-byte owned G fixture, pinned Node 24.22.1 loaded that exact native module, committed and rolled back separate transactions, passed SQLite integrity_check, and refused a deliberately missing native binding. SQLite reported 3.53.2. The fixture was retired. This checks the scoped dependency and ABI. Normal npm staging, full precommit, and installed VSIX qualification still require their own evidence. See the existing G deploy receipt under reviewed_sqlite_native_probe.

### Windows release cache readiness

An offline dry-run selected 171 Windows package entries but did not open the tarballs. Of 170 distinct integrity values, 139 are present and verified in the existing G npm cache. The exact SQLite ABI 137 archive is absent from the installer's separate prebuild cache.

Use the Windows lock's SHA-512 values to fetch only the 31 missing registry tarballs into the existing content-addressed cache. Verify the SQLite archive against the official asset digest and write it at the filename resolved by prebuild-install. Count both the package entries and distinct verified blobs. Prove that the npm fetcher can read the cached tarballs offline and that the normal native downloader resolves the verified archive from G. A missing digest or wrong native binary must fail the probe. Keep the stage, checkout dependency trees, and published release unchanged. Record results in the existing G receipt. The ordinary staging command and VSIX checks remain required.

All 171 selected Windows entries were read offline by npm 11.12.1's package fetcher against the exact lock integrity fields. Those entries use 170 distinct tarballs, now all verified. A deliberately absent integrity digest returned ENOTCACHED. The 31 newly retained tarballs occupy 10,028,365 bytes of archive payload. The exact 1,039,428-byte SQLite archive matched the upstream digest and is retained once at the installer's G cache path.

The real prebuild-install 7.1.3 CLI reported the G cache hit, unpacked and loaded the exact native binary under Node 24.22.1. The CLI version matches the lock. Its supporting node-abi in this probe is the root toolchain's 3.92.0, while the staged graph pins 3.104.0. The fixture and native reader were retired. Normal npm ci, sidecar startup, precommit and installed VSIX still require independent verification.

For this host's release run, ensure the stage command's bare npm child uses the qualified Node and resolves npm cache, logs, node-gyp headers, TEMP and TMP to G. The default Windows npm.cmd pins its sibling Node 24.15.0 even when a parent uses 24.22.1. Run npm-cli.js with the qualified Node and verify the nested npm selection before staging.

Evidence is under g_stage_runtime_cache in the G deploy receipt. AAR. The native installer logs its archive path separately from the cache-hit line. A required DLL stays locked until its Windows process exits. The corrected probe checks both lines and loads the module in a child process before retiring the fixture.

### Preserve the staging Node runtime

**Status** SPECIFIED. The Windows host has a qualified Node 24.22.1 and a normal npm.cmd that selects its sibling Node 24.15.0. Both lock refresh and staging currently invoke bare npm. Use the actual npm CLI exported by npm run and the staging process's Node executable. Put that Node directory first in the npm child's PATH so the child also selects it for install scripts. Leave the established PATH invocation available for direct runs and non-npm launchers. Direct qualified runtime reuse requires no npm.

Test the ordinary staging and lock-refresh entry points in a small G fixture with a deliberately failing npm child. Verify exact arguments, child Node, lifecycle PATH, inherited cache and temporary directories, and propagated failure. A missing or relative declared npm CLI must fail before replacing an existing app or writing lock files. Use the real npm CLI in a G-only offline dry-run to verify the ordinary npm run stage-app call path. Preserve lock bytes and retire the fixture. While X4 is active, defer full npm installation, precommit and the installed VSIX. Roll back the launcher unit by removing only the new npm helper, its uses, and its documentation.

Review found that Windows folds Path and PATH when spawning a child. Verify the effective child PATH with both spellings present and preserve the inherited lookup order after the qualified Node.

**Status** PARTIAL. Ordinary staging and refresh had selected the PATH npm command in the original fixture. Both now use the staging Node and preserve cwd, exact argument lists and failure propagation. Six invalid-launcher controls preserved the existing app or both lock files, and a dry-run of the real npm entry used Node 24.22.1 at both levels with exact lock readback. The current source passed syntax, runtime selftest and diff checks. Both reviewed lock hashes are unchanged. The owned fixtures were retired.

For this host, start npm-cli.js with the qualified Node and put that Node directory first on PATH for the outer npm run. The staging command pins its own npm child and lifecycle PATH. All generated QA files stay on G. The fork of direct node execution without an npm lifecycle preserves the existing PATH fallback.

AAR. The fixture needed the original Forge manifests and an ESM child because the source project declares module mode. Independent review then found a Windows Path/PATH collision. The existing selftest now reproduces and verifies that case. See g_stage_npm_runtime in the G receipt. Full staging with npm lifecycle, precommit, installed qualification, and commit remain open.

### Preserve the previous stage when required assets are missing

**Status** SPECIFIED. The ordinary staging command at stage script SHA-256 6bbfd38c4113d1f9b30de03ae94884acacf55ac4a1c089cc207c4f21c8f0fbeb exited 1 with missing assets at 2026-11-21T22:45:54Z. Its existing app sentinel was gone, and new partial app/dist bytes remained. The npm child was never invoked and the disposable G fixture was retired.

Use the existing required build artifact preflight to check that dist/assets is a physical, unaliased directory before removing the staged app. Preserve the current four required root file checks. The default stage must reject missing assets, a non-directory assets entry, and any missing, empty, or non-file required root artifact before it invokes an npm child or changes the predecessor. Use one disposable G-only fixture with an npm sentinel. Keep syntax and the existing stage selftest in scope. Full build, ordinary npm ci and installed VSIX qualification remain separate. Roll back the assets check hunk. No capability-map delta is expected.

**Status** VERIFIED for the required artifact preflight. On Node v24.22.1 at 2026-11-21T22:48:51Z, 17 ordinary stage entry-point checks passed. The checks covered missing, file and junction assets, missing, empty and directory variants of each of the four required root files, an unexpected root entry, and a physical assets directory that reached the later missing-lock check. In every case the command exited 1 with the expected diagnostic, retained the exact predecessor bytes and did not invoke the npm child. The matrix, Node syntax check and existing stage selftest took 1.479 seconds. All owned fixtures were retired. Candidate stage script SHA-256 cfe6d07c4d0d132b9e3c0a544c1a42fe895ece726f6cd3bba9bc407d0cec4875. Reversing the assets validation delta reconstructed the exact baseline SHA-256. No capability-map delta. Commit title after required gates is “fix(packaging): preserve staged app on invalid build assets”.

AAR. The first harness run removed the Windows lock for its negative control and reached the selftest before restoring the lock. The corrected harness restored it, provided both reviewed locks and reran the entire matrix. The first close-writer invocation failed to parse before writing. The corrected writer verified the source delta and read back the close. This unit checks the preflight before replacement. Ordinary npm ci, stock sidecar startup, precommit and installed VSIX qualification remain open under #20.

### Exercise the exact Windows SQLite installer offline

**Status** VERIFIED for the locked installer closure. The earlier real installer probe resolved node-abi 3.92.0 from the root toolchain. Npm 11.12.1 resolved the reviewed Windows lock to 38 packages for SQLite and its installer. Pacote extracted all 38 after SHA-512 verification of 2,912,775 cached archive bytes. Prebuild-install 7.1.3 resolved the fixture's node-abi 3.104.0, selected the verified Windows x64 ABI-137 archive offline, and loaded the exact native binding. SQLite 3.53.2 passed commit, rollback and integrity_check. The missing binding and network-denial controls passed. No socket connections were attempted during the positive replay. The fixture occupied 17,205,240 bytes at verification and was removed. The probe completed in 2.353 seconds.

The full root and extension no-emit checks passed with the tested source inputs unchanged. Evidence is under g_locked_sqlite_installer_closure in the G deploy receipt. Ordinary stage-app with the full npm lifecycle, stock sidecar boot, precommit, routed E2E and exact installed VSIX remain open. No capability-map delta.

### Run the ordinary Windows lifecycle in a bounded fixture

**Status** SPECIFIED. The live-work deferral above still covers the stock candidate build and full release installation. Run one ordinary offline stage-app on a minimal physical G: build fixture while X4 remains active. Use the reviewed lock, only its cached Windows archives, pinned Node 24.22.1 and real npm. Run foreground lifecycle scripts serially in the existing Windows Job with a 30-second stage limit. Keep all writes in the fixture and deny network and compiler fallback. No stock bundle, IDE, or X4 is started.

Verify the exact staged lock and installed Windows package inventory, copied build bytes, sourcemap filtering, and the staged SQLite and Koffi bindings. The Job must drain and the fixture must be removed. Stock bundle, precommit, complete E2E and the exact packaged installation remain distinct gates.

**VERIFIED for the ordinary Windows staging lifecycle on the synthetic build fixture.** The real npm run stage-app completed in 4.015 seconds. Npm ci installed the exact 171 Windows entries from 170 SHA-512-verified cached tarballs. The staged lock and copied fixture bundles matched their input bytes. All 11 observed Node processes used 24.22.1. The staged ABI-137 SQLite binding matched its expected digest and passed commit, rollback and integrity_check, and staged Koffi reported 3.3.7. Socket denial was verified separately. The positive run made zero network or compiler fallback attempts. Sourcemaps and standing state were absent.

The stage was 60,940,646 bytes and the entire fixture, including its private cache, was 80,371,590 bytes before removal. All Windows Jobs drained. Nothing was staged in the G: checkout. See g_ordinary_windows_stage_fixture in the existing G: deploy receipt. Stock build and stage, full precommit and release suites, and installed VSIX qualification remain open. No capability-map delta.

### Preserve the staged app through npm and runtime validation failures

**SPECIFIED · #20.** The current ordinary G fixture reaches npm ci. An exact local npm-cli.js stub exits 17 after writing inert partial state. Stage exits 1, removes the previous app sentinel and leaves a partially installed app. The existing input preflight covers earlier refusal only. No safe reusable directory publisher was found, so keep the change in stage-app.mjs and reuse its lock and runtime-source checks.

Build and verify one candidate inside an exclusive local staging directory owned by the packaging script on the same volume. Check Koffi using an exact short-lived child so Windows handles are closed before promotion. Publish by renaming the incumbent and then the verified candidate. Restore the incumbent on a failed promotion and retain the predecessor if rollback itself fails. Never roll back a successful promotion from a partially cleaned predecessor. Preserve existing reuse overlap refusals, require the owned physical directory identity for cleanup, and reject concurrent staging. Roll back this bounded staging change only.

Require paired ordinary npm failure, native-binding failure and success with a tiny synthetic package tree. Check locked incumbent, promotion rollback and cleanup failure through the existing selftest without launching the stock release build. Normal npm lifecycle on the exact new staging code, full precommit, complete release checks and installed VSIX remain separate. No capability-map delta.

**VERIFIED in isolated source fixtures.** The same ordinary npm failure now exits 1, retains the exact previous app and removes the incomplete candidate. Broken Koffi, missing SQLite, both overlapping reuse paths, successful replacement and the no-predecessor case passed in seven ordinary-entry checks. The existing selftest also covers blocked concurrent staging, changed incumbent identity, locked incumbent, promotion rollback, retained recovery after restore refusal and cleanup failure after successful promotion. A separate qualified Node child loaded the existing G: Koffi 3.3.7 and exited. Real native lifecycle against this revised staging code and exact VSIX qualification remain pending. No capability-map delta.

AAR. The first diagnostic stub had the wrong filename, so the runner used real npm. Its install output was confined to the retired G: fixture, but the default C: npm cache grew by at least 17,577,205 bytes across 161 matched lock tarballs and a 66,701-byte log. Subsequent fixture commands use the exact local npm-cli.js path with offline settings and the G: cache and verify a stub marker. The shared C: cache requires separate authorization to change. Failure proof and recovery scope are in the existing G: receipt.

**VERIFIED revised ordinary Windows lifecycle on the same synthetic build fixture.** The recovery-enabled stage script 1722909f ran real npm 11.12.1 with pinned Node 24.22.1 and the existing G: cache. All 171 installed package versions match the reviewed Windows lock. The promoted app contains all five expected fixture files byte-for-byte, and all 2,151 staged files total 60,940,626 bytes. Existing staged marker, transaction directory, sourcemaps and unlisted top-level entries are absent after promotion. The exact SQLite binding passes ABI 137 load, commit, rollback and integrity_check, and Koffi reports 3.3.7. The 12.672-second staging Job and both control/readback Jobs retired and the one owned fixture was removed. The socket-denial control passed. The positive stage logged no network or compiler attempts. See release_090_repaired_ordinary_windows_lifecycle. Full stock build, ordinary precommit, release suites and exact installed VSIX remain open.
