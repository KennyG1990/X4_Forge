# Actionable deploy snapshot storage refusal

**SPECIFIED · [#123](https://github.com/KennyG1990/X4_Forge/issues/123).** AiLive 785 passed 323 project checks and the law check, then its native preview returned `DEPLOY_SNAPSHOT_FAILED` from an `ENOSPC` copy on the Windows temporary volume. It made no deployment writes and left build 784 installed. This is a confirmed native deploy blocker. It supplies no evidence about the separate reported bypass tracked in #85.

The current mixed Dev checkout is `408f254`. Both ordinary and owned snapshots materialize under the verified physical `os.tmpdir()`. `materializeArtifact` flattens the copy error into a message. Snapshot capture converts that text to a generic code and the native route returns HTTP 500. Later workspace staging under `.forge-builds` is a different phase. Extend the existing materializer and snapshot owner. Preserve typed `ENOSPC` or `EDQUOT` from the snapshot write, fail before validation or output writes, report HTTP 507 with a snapshot-stage checklist and a compact payload naming the actual Windows volume or Unix scratch directory, payload bytes, and safely measured free bytes when available. Treat measurements as advisory. Offer a retry after freeing space or starting Forge with an appropriate process temporary directory. Keep the same temporary root choice, filesystem ownership, cleanup, permissions and full validation on retry. Do not add fallback writes, a free-space threshold, or a new storage setting. Preserve cleanup guards for incomplete owned staging.

Run failing-first and passing focused tests using a real-shaped filesystem error at copy/write and snapshot creation. Keep unrelated errors and current exact-byte checks. Replay native preview with a private, one-shot failure after one fixture copy and with a normal retry against identical inputs. Assert no changes to source, target, workspace staging, receipt or recovery on refusal and distinguish cleanup uncertainty from success. Tests use a small owned F: fixture and a synthetic error, without filling a drive or changing a live process. Capture runtime and gate results here. Rollback is the scoped code and guide delta over the pinned Dev files. Commit and deliver only after ordinary gates.

**Verified at the focused source and isolated native runtime layers. Delivery PARTIAL.** The fail-first snapshot oracle received `DEPLOY_SNAPSHOT_FAILED` after a typed injected copy failure. Final snapshot tests passed 128/128, including directory allocation, generated writes, a missing free-space sample, an out-of-scratch error, a permission error, and quota plus cleanup failure. Scoped TypeScript passed across 528 files. The writer audit initially refused the changed writer-neighborhood fingerprint. The reviewed repin passed with the same writer inventory and ownership. `git diff --check` passed.

Both native routes returned HTTP 507 at `snapshot` with `writeAttempted: false` after a real first fixture file copy. Each named the physical F: temporary directory and separately reported the five selected files’ 541,100 logical bytes and a simulated zero-byte availability sample. No protected tree changed and cleanup retired each partial snapshot. An injected `EACCES` remained a generic snapshot failure. The two healthy previews selected identical bytes. Reviewed Apply then wrote all five files exactly and reopened the committed receipt. The 41-check native run took 9.984 seconds. The owned process, private port, discovery and all F: files retired. The compiled server was `aeba913cb76ec0b4a24c64c99520eb1e3322d88f3d88583e826ed3981ea37949` SHA-256. QA evidence `forge-1120-snapshot-space-result.json`, SHA-256 `61f5ca15b8c6a691d046c684207c3a0d94f3db7e5a4af331555912300ffcc096`. Runner `forge-1120-snapshot-space-runner.py`, SHA-256 `25d69c6c945a0b13d3b8ff454b739bc72ed4493be90e51b1934334d13b5f4247`.

The current route change adds a structured diagnostic and preserves the writer and permission inventory. Normal gates, commit, published and installed host verification remain pending. The serving live process for build 785 was outside the replay. The private backend proves the native refusal and successful retry with an adequately provisioned temporary directory. An independent configuration control for temporary storage remains a separate design dependency because registered project checks bind the current temporary parent to the isolated Dev lab.

**AAR.** The first HTTP fixture used inline files and passed without triggering the injected copy. Two omitted binary inputs selected the exact disk-copy path. The recorded fault traces established a real successful first write before each injection. Verify future failure fixtures against the actual materialization disposition. The principal remaining operational constraint is the sidecar temporary volume. Source and installation paths do not identify that volume.

### Main rebase and D: replay

PARTIAL for delivery. On base 408f2542d4f6f91873417f2f6cb6cca52b6ef034 the
unchanged storage handling passed the writer audit and all 85 assertions
executed by the current deployment snapshot suite. The earlier 128 count
belongs to a previous report. Main's writer inventory was preserved, and the
fingerprint field was updated.

A separately compiled 41-check replay ran this storage patch by itself.
Both native preview aliases returned HTTP 507 after one successful scratch
copy and reported the D: temp directory and 541,100 selected bytes.
Permission failure retained its classification. The successful retry's Apply
wrote all five files, and the committed receipt reopened. Exit, listener and
discovery retirement all passed. The owned D: fixture was removed and the
isolated editor patch was restored byte for byte.

Full precommit, commit, installed verification and delivery remain pending.
A selectable snapshot path is a settings change. This fix uses the sidecar's
existing temporary directory.

## Operator retry confirmed

**VERIFIED for the live retry · 2026-11-21.** Claude reports that AiLive 785 and 786 deployed normally on installed Forge after the temporary-volume problem cleared, with verified bytes. The live retry is closed on Notion. #123 remains open for delivery of the clearer HTTP 507 diagnostic. [Claude’s recovery and delivery status](https://github.com/KennyG1990/X4_Forge/issues/123#issuecomment-7073259958).
