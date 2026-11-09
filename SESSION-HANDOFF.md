# X4 Forge Dev handoff — A15 owner approval

Use the isolated `forge-a15-native-proof` worktree. The prior verified base is `4a9f1ee95a2757ee535e463470e8c4b97c3376be`.

## Current unit

The isolated unmanaged Windows Dev backend accepts a signed approval from an independently host-pinned public credential. The exact approval survives restart, authorizes the addressed async suite, and lets native deploy apply the frozen bytes to scratch. Signed revocation prevents future starts and use of earlier suite proof, even if the harness has changed. The fixture uses a disposable key.

The [owner approval record](docs/plans/2026-11-08-a15-dev-owner-approval.md) contains the API sequence, validation, and AAR. Keep the worktree separate from the release source, live Antigravity, X4, AiLive, and other agents' checkouts. No computer use. The project harness owns its ephemeral listeners and the standalone mod.

## Next work

- [Issue #61](https://github.com/KennyG1990/X4_Forge/issues/61) stays open. Independently provision and prove a real device credential and the rendered owner review. Reconcile installed supervisor recovery and project validation coverage separately before broadening availability.
- [Issue #85](https://github.com/KennyG1990/X4_Forge/issues/85) still needs the exact general-purpose bypass script and failure receipt. The Dev proof above exercises independently reproduced behavior.
- The latest checked Claude board window was HELD during batch 475. Game installation and play remain Claude's responsibility. The backend checkpoint has no operator eyeball step. A real owner ceremony remains a separate test.
- Release cadence review found public GitHub and Open VSX at 0.0.81. GitHub main advanced to `f76775f02dbd8c61a100233e9d11d659f7a5d39b`. The separate 0.0.82 source pin `b49f1ab7ca57ec6242c8d242da327331fe6e9af9` needs those upstream changes reconciled before exact source and VSIX gates. Keep the Dev-only owner work separate from that candidate.
