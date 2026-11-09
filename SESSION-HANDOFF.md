# X4 Forge Dev handoff — durable deploy commit readback

Use the isolated `forge-a15-native-proof` worktree. The prior verified base is `4b9ce48874d68b6978108097ba75f4e7b59154e9`.

## Current unit

Native deploy now reconciles a failed committed receipt read against the exact canonical transition before allowing rollback. Private loopback verified one failed read, persistent read failure, and a failed terminal publication. See the [commit readback proof](docs/plans/2026-11-09-forge-deploy-commit-readback.md), [admitted interruption proof](docs/plans/2026-11-09-forge-admitted-deploy-interruption.md), and [explicit backend recovery record](docs/plans/2026-11-09-forge-local-backend-recovery.md).

Keep the worktree separate from the release source, live Antigravity, X4, AiLive, and other agents' checkouts. Headless fixtures use owned ephemeral listeners and scratch roots. This API checkpoint has no operator eyeball step.

## Next work

- [Issue #48](https://github.com/KennyG1990/X4_Forge/issues/48) stays open through full release integration and delivery. The [compact API record](docs/plans/2026-11-08-project-validation-compact.md) has the 65-check wire proof. The old private A15 replay should request full detail on branches that read individual findings.
- [Issue #61](https://github.com/KennyG1990/X4_Forge/issues/61) stays open. Independently provision and prove a real device credential and the rendered owner review. Reconcile installed supervisor recovery and result presentation before broadening availability. Prior [credential rotation evidence](docs/plans/2026-11-08-a15-owner-policy-rotation.md).
- [Issue #85](https://github.com/KennyG1990/X4_Forge/issues/85) still needs the exact general-purpose bypass script and failure receipt. The Dev proof above exercises independently reproduced behavior.
- Claude's combined 479–484 deploy committed through installed 0.0.81 after the restart. The lock was FREE at 06:50 UTC with X4 reload and acceptance deferred. [#77, #78 and #73 standalone handoffs](https://app.notion.com/p/40e4618ed15b81b1b5fdc92a60d5d834?d=4114618ed15b81759f20001ce5d10d78) await Claude's verdicts. The two #82 official pairs remain unverified at runtime.
- [#53 live batch 480](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6733886629) remains unknown under the legacy receipt. Keep post-activation reconciliation open until durable byte and postcheck proof can establish an outcome. Automatic cold resume needs cross-host ownership, and rendered selection needs installed verification. [#83](https://github.com/KennyG1990/X4_Forge/issues/83) already has the implementation and isolated replay.
- The third-unit [release readiness review](docs/plans/2026-11-09-forge-deploy-commit-readback.md#third-unit-release-readiness-review) confirmed GitHub main `f76775f02dbd8c61a100233e9d11d659f7a5d39b` and public version 0.0.81. Keep `forge-082-source-f76775f-b49f1ab.zip` as a fallback. Narrowly port both #53 server fixes into the release selection, then repin the source archive and gates. Explicit Start needs installed command and panel proof. Use a short physical source root for the new selection. Private dependency hydration, full source, VSIX and installed gates await machine clearance.
