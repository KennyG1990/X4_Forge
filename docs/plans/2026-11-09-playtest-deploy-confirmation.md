# Separate Playtest deploy preview from apply

**VERIFIED in isolated Dev · PARTIAL for installed acceptance · Full lane.** [Owner issue #34](https://github.com/KennyG1990/X4_Forge/issues/34) · [Archived rendered scratch replay](https://github.com/KennyG1990/X4_Forge/issues/34#issuecomment-6721562907).

## Baseline and reconciliation

Isolated Dev starts clean at `091f50b3a9d57a0d3946bb3952f1e44614ecb537`. The Playtest Save XML callback in DiagnosticsHub and Deploy + Verify in Playtest both call the shared browser wrapper, which posts a native dry run and immediately posts apply when green. The first control says Save but invokes the same installed-target writer. An archived rendered harness already exercised the misleading control and a separate preview/confirm candidate. Reproduce the behavior on current source and an owned scratch backend. Agent-Brain matched older project context without this exact flow.

Preserve the existing workspace-save and checkpoint owners. Remove only the Playtest duplicate. A preview labels the canvas or folder under Mod Workspace, shows the returned X4 install destination and native file effect, and uses the existing validation summary. Only a separate explicit confirmation may submit the same preview source and five server binding fields. Typed folders explicitly keep the workspace root selection on both requests. The shared binding extraction preserves other users of the existing automatic wrapper.

## Acceptance

- Rendering Playtest shows one deploy path and distinguishes the configured workspace and staged build from the X4 install destination. Neither opening Playtest nor previewing writes installed bytes, staging, baselines or receipts. No confirmation appears on a failed, malformed or destination-less preview.
- Confirmation sends the original serialized source and exact binding once. A changed workspace selection, edited canvas or changed input invalidates the preview, including delayed responses. Existing server checks refuse stale disk source or target, wrong workspace/root, invalid validation and an owned locked changed file without false success. Preserve backend responses and show verified bytes and receipt when returned.
- Update the tracked Playtest browser consumers for the new explicit click. Replay the real rendered component against the isolated native backend, including no-write preview, locked and stale cases, exact readback and a workspace switch. Run typecheck, diff and normal precommit. Review the pinned release at this third verified Dev unit. Full release/installed Antigravity validation still needs the machine gate. No desktop automation, changes to live Forge, or X4 action.
- Rollback is the bounded UI and helper delta at the baseline SHA. Evidence belongs in the private QA root, with durable scoped results here and on the owner issue.

Fresh-eyes review adds a workspace selection revision. The global fetch wrapper reads the active ID at send time. A switch away and back between renders must also invalidate the old preview. Capture and recheck the selection revision with the existing request epoch. The browser test exercises both a delayed response and an old confirmation after a round trip.

## Rendered scratch evidence

Both baseline actions were clicked through the actual DiagnosticsHub and Playtest components. One Save XML click wrote the current canvas to the scratch installed and staged targets. One Deploy + Verify click did the same for a typed folder. Each action sent a preview followed by an apply and committed exact bytes. The user saw neither the exact install destination nor a confirmation before the write.

The candidate mounts the current components with compiled Forge CSS. Preview makes a single native request, displays the exact target and file counts, and leaves the scratch install and staging alone. Apply submits the frozen source and five matching fields, confirms the three exact files and shows its committed receipt. The native apply response and reopened durable record match. A delayed preview is discarded across a normal workspace switch and a direct switch away and back. A changed source, a changed target and a missing typed workspace folder refuse without applying the stale or wrong source. The configured source root and a same-name installed directory were distinct in the wrong-root control.

| Run | Browser checks | Private evidence |
| --- | --- | --- |
| Baseline, UI bundle `80efb5db552bb2eecd8ba2c89817aa051acff00e129ef62ed513a15988f78397` | 10 | `forge-34-playtest-http-rp8_tdkz/browser-verdict.json` |
| Candidate, UI bundle `7ee98b4cc2f12fc20032ef8917c7ff171e177545dc718fc3d97c73c1994846cf` | 30 | `forge-34-playtest-http-vz5fkeqh/browser-verdict.json` |
| Same candidate, validation and Windows lock | 18 | `forge-34-playtest-http-71vts7ge/browser-verdict.json` |

An independent ReadWrite probe observed Windows sharing violation 32 while an owned process held the installed MD file. A confirmed update with different bytes returned EBUSY and restored the exact original target. No new committed receipt appeared. A malformed XML preview returned `WELLFORMED_FAILED`. The exact well-formed #54 checking-mode witness returned `COMPILE_FAILED` and named the cue. Both failures were visible and offered no Apply. The supplemental supervisor independently reopened the committed setup receipt and verified its target resource. All owned browser, backend and lock processes retired.

The candidate uses backend SHA-256 `1fb5cd858ef769ab8b8848b22163b32e057d81cb57e6ab533c67e209d931bb91`. The 30-check run contains the inspected `preview.png` and `deployed.png` with the exact wrapped destination and receipt. The six tracked Playtest browser specs now use explicit confirmation and were syntax checked. TypeScript, product copy and diff checks passed. The normal commit-gate log is `forge-34-playtest-commit.log` in private QA. Full suite and installed Antigravity rendering remain release gates.

### Installed rendering gate

After clearance, use the pinned scratch paths and the isolated FORGE DEVELOPMENT profile. Open Forge Deploy Workbench and select Playtest. Enter `forge_deploy_workbench` in the workspace source field and click Preview deployment. Check that the shown X4 install destination is the private scratch extensions path and compare file counts and the pre-apply scratch hashes. Click Deploy + Verify only against that scratch destination. Capture the visible result and receipt ID, then compare the installed bytes and reopened receipt. Record the exact VSIX and profile evidence separately.

## Three-unit release review

The [UI crash checkpoint](2026-11-09-runtime-ui-crash-attribution.md), the [native incumbent checkpoint](2026-11-09-native-deploy-incumbent-identity.md) and this Playtest unit form the next Dev review set. Keep release 0.0.82 on the reviewed tree `c4d390da543184dc97281e156bac6d0eb88141eb` with its two selected receipt fixes. The private verifier rechecked all 902 tracked files and the pinned source archive. Public GitHub main is `f76775f02dbd8c61a100233e9d11d659f7a5d39b`, GitHub has tag 0.0.81 and Open VSX reports 0.0.81. [GitHub release](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.81) · [Open VSX](https://open-vsx.org/api/x4forge/x4-forge-studio/latest) · [Frozen source](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6734430444).

The short source and package roots are still absent. Claude freed the deploy lock, and release machine clearance remains pending. The next release gate is the pinned full source run, followed by the exact VSIX and installed Antigravity checks. This Playtest change has its own installed rendering requirement. The [#85 script and original failure](https://github.com/KennyG1990/X4_Forge/issues/85) remain pending.

## AAR

Run the original controls through the actual components before trusting their labels. Pair the destination and visible file effect with observed exact requests and independently reopened receipts. Fresh-eyes review caught the workspace round trip that an ID-only comparison misses. The first precommit refused the changed source fingerprint around the existing tab-session writer. The selection revision is in memory and the registered call inventory stayed constant. The manifest now binds the measured source fingerprint. Two supplemental harness attempts over-specified the expected validation stage. Keep the real malformed XML and #54 checking-mode fixtures distinct and assert their actual native gate. Public release metadata was verified through the direct public APIs after the cached browser redirect disagreed. The main remaining evidence gap is the rendering and route behavior in the installed IDE host.
