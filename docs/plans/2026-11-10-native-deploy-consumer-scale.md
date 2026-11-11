# Native deploy benchmark at 992 source files

FULL lane. SPECIFIED under [#97](https://github.com/KennyG1990/X4_Forge/issues/97). Baseline clean Dev commit `67db370`. Existing 13-file headless native replay passed 313/313. The 60-patch validator benchmark isolated repeat schema work. Neither measurement reproduces the reported 992-file workload. The consumer's artifact inventory, per-file bytes, graph nodes and wrapper readback are distinct measurements.

Generate one standalone 992-file synthetic mod in a disposable private source API root. Include reference-backed MD patches, full MD, registered Lua, excess XML and small byte-only assets. Use the existing private launch, path and receipt contract with ephemeral private authentication. Measure HTTP wall time and returned handler stages for preview and bound apply, plus independent target readback. Count semantic text, unavailable and byte-only rows against the exact artifact inventory. Report any generated artifact files separately. Preserve the source, corpus, approval, and target checks. The negative request uses a deliberately wrong preview binding and must preserve target, staging, receipts, and last-green state. Capture exact artifact/receipt and no-write witnesses. No live mod, game, IDE, standing credential, or public release write.

Run one private loopback backend and serial requests. The 992-file fixture needs room for transient frozen, staged and deployed trees. Keep total payload under 64 MiB and check a 5,000-file ceiling for this fixture. Retain one compact evidence packet with generator and hashes. Retire the owned listener and scratch tree after terminal proof. Rollback is scratch retirement and revert of the evidence record. Acceptance requires a successful preview, exact byte and receipt proof on apply, refusal on the wrong binding, and a coverage/stage breakdown. If an actual native blocker appears, preserve its evidence before recovery. The 992-file consumer result remains separate.

## Verified close

Unit 13. The standalone input contained 472 XML files, 49 Lua files, one rules file and 470 byte-only assets. The 60 MD patches targeted 15,600 reference actions. Full MD contained 13,680 authored actions. The source was 361,583 bytes. All 992 authored files reached the target byte-for-byte, plus one generated README. The result contains 500 text inputs, 22 unavailable XML inputs, and 471 byte-only inputs. Forge reported incomplete checks and left last-green unchanged. The selected manifest was identical at preview and apply, independent readback verified all 993 path, size and hash rows, and the committed receipt matched its stored bytes.

| Measurement | Seconds |
| --- | ---: |
| Preview HTTP | 57.78 |
| Bound apply HTTP | 163.69 |
| Apply handler | 162.56 |
| Apply source rechecks | 89.60 |
| Apply write | 26.05 |
| Apply validation | 18.42 |
| Apply import | 13.03 |
| Independent target readback | 0.67 |

Source rechecks consumed 55.1% of the apply handler time. A separate run of the same artifact returned HTTP 409 in 38.46 s for a wrong binding, with target, staging, receipts and last-green unchanged. Both previews agreed on the covered and unavailable counts. The complete apply response carried 33,726,917 bytes for a 361,802-byte artifact. The harness streamed the large workspace field and retained the manifest, timing and receipt summaries.

All 18 checks in the completed run passed, plus the no-write wrong-binding witness from the same artifact in the prior run. All stage timings sum to their handler totals. The completed run's terminal scratch census was 58,121,023 bytes and 3,080 files. Each owned backend and listener terminated and each scratch tree was retired. Evidence, exact generator, stage timings and hashes are in `QA/forge-1110-deploy97-native-992.json`. No executable change and no capability-map delta. The consumer's under-one-minute target remains open, and the measured fixture is synthetic.

After-action review. The first launch adapter assumed a historical checkout path. The second probe queried the agent route without an addressed workspace. The separate import response exceeded the initial harness capture limit. After switching to the native disk path, the 110-second cutoff interrupted the first apply in scratch. The completed run used the same artifact with a longer timeout and retained the no-write witness. Keep future capture bounded while allowing the tested operation to reach a terminal response. Trace the repeated source inventory, compiler output and frozen-byte checks within `sourceRecheck` before changing any write barrier. Prioritize redundant reads within each barrier, then rerun this exact fixture.
