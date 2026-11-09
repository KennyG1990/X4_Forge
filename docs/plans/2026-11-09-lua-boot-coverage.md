# Report Lua boot markers for an installed extension

**VERIFIED in isolated Dev · Full lane.** [Owner issue #55](https://github.com/KennyG1990/X4_Forge/issues/55) · [Game-observed fixture](https://github.com/KennyG1990/X4_Forge/issues/55#issuecomment-6722751624).

## Baseline and reconciliation

Isolated Dev starts clean at `d393d5762415597ca85c35291a77f4e8923fd5b4`. The current native advisory describes added Lua registrations. The runtime debugger still has no opt-in per-file boot evidence. The archived loose, packed and cross-tail cases and the previous X4 marker witness define the protocol. Agent-Brain hits were unrelated. ADR-F1 scopes game logs to the machine and addressed runtime evidence to the workspace. The capability map already names the legacy status and addressed debugger routes and the latter's durable deploy EOF. Reuse the current strict X4 menu parser, installed root-file reader and bounded game-log reader. Keep #57 load evidence, the native #55 advisory and recent runtime incidents independent.

## Acceptance

1. Accept optional root `forge-lua-boot.json` with version 1 and up to 128 unique contained menu Lua paths also registered in exact installed `ui.xml`. Use a single bounded lookup for the two loose or catalog root files. Apply individual loose precedence and withhold evidence for invalid, corrupt, ambiguous or unsupported versioned inputs. Resolve an exact owned deployed folder, including the physical alias bound by a known deploy. Use the canonical manifest ID for marker ownership.
2. Fold exact `[FORGE-LUA-BOOT]` begin, file and complete lines from one run. Keep missing null until the matching completion in a trustworthy current log window. Wrong owner, run and path, out-of-order lines and partial controls cannot satisfy it. Preserve a current completed run over the recent tail using the existing 16 MiB scan and bounded process-local cursor. Report unknown after a scan gap, log change, registration change or unresolved boundary until fresh controls. The published result represents marker evidence. Actual Lua execution beyond the marker and any saved-game behavior remain separate.
3. Use the exact deploy token and EOF when available, including the addressed runtime adapter's existing durable session after restart. A legacy lookup without a trustworthy deployment fence begins observing current bytes without borrowing old marker evidence. Keep the existing runtime authorization and verdicts. Project one result through `game-log/status`, addressed Runtime Debugger and its legacy watcher envelope. No new endpoint, disk writer, credential or live change.
4. Replay the exact baseline and candidate on owned scratch backends and the frozen, previously game-observed fixture. Cover native loose/catalog bytes and receipts, aliases, all three responses, one observed and one silent tracked file, no false missing before completion, wrong marker controls, prior-deploy records, 12 MiB append, warm zero history read, invalid or changed manifests, rotation, and addressed cold EOF. Re-run the current native advisory and #57 log behavior where applicable. Run focused parser, runtime, typecheck, writer/capability and normal precommit gates. Evidence stays in private Forge QA. Installed Studio/API qualification and the separately queued actual warm/cold X4 witness remain open.

Rollback is the isolated source diff. Live work permits only lightweight owned headless checks.

The exact install lookup also reads the bounded loose `content.xml` identity before trusting opt-in configuration. This rejects a workspace or alias pointing at the wrong extension. A missing, invalid or changed observed opt-in invalidates the cached run. Manual installs and legacy lookups without a verified EOF start observing at their first poll.

Fresh review found that the deploy's existing artifact-folder field may differ from its canonical extension ID. Preserve the optional canonical ID in the existing runtime deploy envelope so a restart cannot infer ownership from mutable workspace source. The deployed file must still declare that exact ID. Keep historical token hashing unchanged. The independent legacy load and opt-in boot projections each cap cold reads at 16 MiB, so one opted-in legacy request can scan up to 32 MiB of history.

An observed same-file discontinuity or a replacement log created before a manifest revision re-fences the boot reader at the current end of the log. The older deploy boundary stays separate, even when the log file was originally created after deployment.

Invalidation stays attached to an existing boot cursor until a fresh observation. If the bounded cursor is evicted or Forge restarts, the read can reconstruct a run from the retained deploy EOF and current manifests. Earlier out-of-band edits are not independently recoverable after that cache loss.

## Close

[REPRODUCED] The exact baseline omitted boot coverage from all three routes, even after the frozen fixture's exact loose and catalog files and complete synthetic controls were present. Baseline 18/18, server SHA-256 `c2a96cd34dffd8e76398014e6d5396b917e619ebe9aae6796b91960c68926aef`. Private verdict `forge-55-boot-http-fpme57cd/verdict.json` SHA-256 `07b3c217cba9c39c8cf4e8815e1aebbb0bc1d92ceaf1d1df3e1a38e8d19c2690`.

The exact candidate passed 46/46. Native loose and catalog applies each verified all eight files, including packed manifests, and reopened exact named receipts. All three views matched the expected marker result. Foreign owner, run and path, pre-deploy controls and a partial run kept missing unknown. A 12 MiB append retained the complete result, and warm polls reread zero historical bytes. After a private restart, the addressed views recovered the run from retained EOF byte 861. The legacy view without a retained deploy observed no historical bytes. Wrong installed identity, changed or invalid manifests, opt-out cache pressure, same-file rewrite, an older replacement file, rotation and a 17 MiB gap all required fresh controls. Both owned processes and listeners retired.

Candidate server SHA-256 `09a237cdfed06524bca41a0de5dfb7f3b09317755bcdf429430d2e36d01245ed`. Private verdict `forge-55-boot-http-pt8rfzsh/verdict.json` SHA-256 `bd38507a16002b23118a0684fb462c062d83ad22c4f58e1363cba07e1e570ff8`. The pure boot protocol passed 29/29 and the repository runtime freshness checks passed 33/33. Project typecheck, writer and capability audits and diff checks passed. The normal precommit hook gates the local checkpoint.

The prior native registration advisory passed all 139 regression checks on this same bundle, including exact committed receipts, format transitions and invalid catalog inputs. The owned process retired. Private verdict `registration55-http-vjq0uayw/verdict.json` SHA-256 `672f793c40bbc50f9f743dbaf751a4c790485bdfc57b9c47011ba55da7125071`.

The capability delta is opt-in marker evidence on three existing queries. The actual engine emitted the archived fixture's markers in the earlier X4 test. The new backend replay used those exact files with synthetic log controls. Installed qualification and the distinct A100/B101 warm versus cold test remain open.

## Three-unit release review

The three Dev checkpoints are #57 (`f3e60b8`), the #55 advisory (`d393d57`) and this boot coverage unit. The 0.0.82 release remains pinned to the reviewed 902-file tree `c4d390da543184dc97281e156bac6d0eb88141eb` and its two selected receipt fixes. The archive and manifest reverified, and the source-gate, VSIX and installed receipts remain pending. Public GitHub main still points to `f76775f02dbd8c61a100233e9d11d659f7a5d39b`, and both stores serve 0.0.81. [Open VSX](https://open-vsx.org/api/x4forge/x4-forge-studio/latest) · [GitHub release](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.81)

Claude's board still read HELD. The brief absence of an X4 process at the readback did not establish a quiet window. Run the pinned private qualification after machine clearance. The exact generic bypass script and original failed request remain pending under #85. [Frozen release source](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6734430444) · [Agent Board](https://app.notion.com/p/40e4618ed15b81b1b5fdc92a60d5d834)

## AAR

Sustain byte-identical loose and packed deployment before runtime assertions. The first baseline attempt used a key missing an existing audit effect. The corrected fixture uses the existing authorized runtime capability and still proves under-scoped denial. Fresh review caught stale marker reuse after a manifest revision, a foreign content identity, cache invalidation pressure and an older renamed log. The final runtime and repository controls cover those cases. The highest-risk remaining weakness is assuming marker presence establishes behavior after the marker or guarantees the installed artifact ran. The guide defines the observation boundary.
