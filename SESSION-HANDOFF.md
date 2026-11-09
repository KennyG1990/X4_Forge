# X4 Forge Dev handoff — A15 asynchronous check runs

Use the isolated `forge-a15-native-proof` worktree. The prior verified base is `1988afe83690678f1b7d7ab28d32224a14c3df23`. The separate public release candidate remains pinned to `b49f1ab7ca57ec6242c8d242da327331fe6e9af9`.

## Current unit

Dev Forge can admit an approved asynchronous project check run, recover its status by operation ID, and pass the exact suite receipt to native deploy. The fixture runs on an explicitly enabled unmanaged Windows backend with a standalone mod and scratch game root. The native proof remains tied to the addressed source, logical artifact, and owner approval. A restart reports unresolved attempts as `pending-recovery` without automatic replay.

The [A15 record](docs/plans/2026-11-08-a15-dev-async-runs.md) contains the API sequence, validation, and AAR. Keep the worktree separate from the release source, live Antigravity, X4, AiLive, and other agents' checkouts. No computer use. The project harness owns its ephemeral listeners and the standalone mod.

## Next work

- [Issue #61](https://github.com/KennyG1990/X4_Forge/issues/61) stays open. The next bounded unit is explicit host-owner enrollment for a project setup. Reconcile installed supervisor recovery and project validation coverage separately before broadening availability.
- [Issue #85](https://github.com/KennyG1990/X4_Forge/issues/85) still needs the exact general-purpose bypass script and failure receipt. The Dev proof above exercises independently reproduced behavior.
- The latest checked Claude board window was HELD during batch 474. Game installation and play remain Claude's responsibility. This backend checkpoint has no operator eyeball step. Keep any installed-build or game verification in its own lane.
- Keep the local checkpoint separate from publication. The public package and existing release evidence are tracked in `docs/releases/` and their owner issues.
