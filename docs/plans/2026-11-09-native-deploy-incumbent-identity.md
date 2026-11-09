# Verify the installed extension identity before native replacement

**VERIFIED in isolated Dev · Full lane.** Follow-on to [issue #87](https://github.com/KennyG1990/X4_Forge/issues/87) and the [folder and manifest identity checkpoint](2026-11-09-forge-deploy-folder-manifest-identity.md). The [general-purpose bypass reproduction](https://github.com/KennyG1990/X4_Forge/issues/85) remains a separate input.

## Baseline and reconciliation

Isolated Dev begins clean at `52df49070b648022ac2e534a86f8b121529aa745`. Native preview and apply already fingerprint the exact physical target, report the file effect and use the same installed manifest scan to reject another folder with the incoming ID. The scan excludes the selected folder from its sibling conflict predicate. Source predicts that a selected folder already occupied by a different extension can return a successful preview and exact bound apply. Prove this with an owned scratch backend before changing behavior. Agent-Brain's matches were older project or filename context without this exact reproduction.

## Acceptance and boundaries

- Both native aliases refuse a different current manifest ID before staging, target activation, validation baseline or receipt changes. Return the selected folder, current manifest ID and incoming ID so the client can identify the collision. A nonempty existing target without a verifiable declared ID also refuses. An empty or absent target remains eligible.
- An existing same-ID extension remains eligible, including a physical alias and case-insensitive canonical match. Preview and exact apply preserve normal byte and receipt checks. The existing stale-target and competing-sibling guards retain their wire behavior. The final activation gate checks the same identity policy.
- Reuse the installed manifest scan, the exact target fingerprint, the native refusal envelope and guarded activation. No new route, settings, write authority, automated identity migration or game action. Keep release 0.0.82's pinned source separate. Rollback is the bounded source delta at the baseline SHA.
- Run paired private HTTP replays, check both aliases and stale or unresolved controls, and reopen a passing native receipt. Run the deployment snapshot oracle, writer/receipt/capability audits, TypeScript, diff and normal headless precommit. Record exact bundle and verdict paths. Installed UI and X4 behavior remain separate.

Fresh-eyes review confirmed that the shared artifact writer has a manifest-free preservation fixture. Keep this guard at the native route, so package, staging and direct artifact writer behavior remains intact. Preserve the existing sibling-duplicate verdict even when the selected folder is also occupied. Reject invalid manifest encoding without changing the scanner's legacy diagnostic fallback.

## Results

The prior backend returned green previews on both native aliases. The selected `game_positive` target contained valid `forge_incumbent_foreign_87` bytes. The incoming workspace declared `forge_cue_trigger_oracle`. Preview bound the incumbent's exact fingerprint and listed a generic overwrite and deletion. Apply replaced the manifest, deleted the 17-byte sentinel and reopened committed receipt `ar_6978423ec6856a328455cf6059a647a60689b1d296d898032495bff9888f9122`.

Both final aliases refuse the same fresh foreign occupant before any managed write. The wire names the selected folder and both IDs. Missing, malformed and invalid UTF-8 incumbent manifests also refuse a nonempty target. An exact apply constructed from the refusal identity cannot bypass the gate. Source, target, staging, receipts and last-green state remain byte-identical for the tested refusals. A target planted after preview still returns `DEPLOY_TARGET_CHANGED`. A simultaneous sibling duplicate keeps its original error. Absent, empty and case-insensitive same-ID alias controls committed exact bytes and reopened their receipts. All owned loopback listeners and discovery records retired.

| Exact bundle | Result | Private verdict |
| --- | --- | --- |
| `8b1fdb0c623365dbe3a34e749b366e357181552317d32b94276392f3a9c0cc85` | 57 baseline checks | `forge-87-incumbent-http-r4xdo4je/verdict.json` |
| `1fb5cd858ef769ab8b8848b22163b32e057d81cb57e6ab533c67e209d931bb91` | 115 final checks | `forge-87-incumbent-http-1p3raop7/verdict.json` |

The existing deploy snapshot oracle passed 53 checks. TypeScript, durable writer and receipt coverage audits, capability contract, route harness syntax and diff checks passed. The regular precommit log is `forge-87-incumbent-commit.log` in the private QA root. The persistent route regression covers both request phases and exact target preservation. Its catalog preservation fixture now uses a valid same-ID incumbent. Full route integration, installed Studio and release verification remain separate. No capability-map delta. The existing private qualification tree stays pinned.

## AAR

Preserve an unrelated sentinel and prove exact receipt readback. The prior receipt was authentic even though the selected folder belonged to another extension. Fresh-eyes review found an occupied manifest-free catalog fixture and the existing sibling error precedence. The updated fixture retains runtime-state preservation and stale-file cleanup, and the final replay covers the precedence and invalid encoding. The remaining operational gap is visible user confirmation of the selected native target in Playtest. It has its own [issue #34 replay](https://github.com/KennyG1990/X4_Forge/issues/34#issuecomment-6721562907).
