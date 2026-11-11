# Reuse the frozen payload for loose deployment staging

FULL lane. SPECIFIED under [#97](https://github.com/KennyG1990/X4_Forge/issues/97). Baseline clean Dev commit `7368ae0`. The same 992-file scratch apply took 88.96 s, including 22.85 s writing, 21.10 s validating, and 15.30 s importing. The headless native replay passed 313/313. No game check is queued.

Native deploy already owns a verified payload and exact manifest through `captureDeploymentSnapshot`. For loose output, `compileWorkspaceToFolder` currently materializes those bytes again and verifies that intermediate tree before the transaction copies it into sibling staging. Reuse the owned payload as the transaction input and verify the copied staging tree against the frozen manifest before admitting preserved files or activating it. Use the existing verifier and transaction owners. Retain the before-activation hooks, preservation rules, target observation, lock fallback, rollback, post-activation hash checks, workspace snapshot, and receipt. Catalog output still needs packaging. Workspace-side loose staging can use the logical payload for a catalog deployment. Ordinary builds keep their existing materialization path.

The stage writer follows the manifest's individual source paths. A whole-tree copy could carry unplanned directory entries from a changed snapshot. Verify the complete stage before preservation, with source snapshot integrity checked at the existing route barriers.

No new request fields, credentials, external paths, or cleanup policy. The existing snapshot owner disposes its payload after the request. Roll back with a revert. Accept only with a verified direct loose stage, corruption refusal before activation, preservation and rollback checks, exact hashes and receipt across both native routes, and the same 992-file replay. Run the existing artifact oracle, native replay, scoped lint, typecheck and normal precommit. Record exact timings and retained footprint. Review release readiness at verified unit 15 with current remote main and marketplace versions. Installed, rendered and game proof remain separate.

## Measured result

The workspace stage and installed loose target now copy their selected files straight from the frozen plan into each private sibling transaction stage. The existing artifact verifier reopens the complete stage before preservation or activation. All seven source checks still ran. Catalog packing and ordinary builds still use their own materialization paths.

| Same synthetic fixture | Before | After |
| --- | ---: | ---: |
| Preview HTTP | 59.36 s | 58.57 s |
| Bound apply HTTP | 88.96 s | 80.26 s |
| Apply write stage | 22.85 s | 13.46 s |

The write stage improved 41.1% and HTTP apply improved 9.8%. Apply validation now took 21.84 s, import 14.53 s, and source rechecks 12.55 s. The artifact identity and all 993 output hashes matched, including every authored file. Coverage remained 500 text, 22 unavailable and 471 byte-only. Receipt readback passed and last-green stayed unchanged. This remains the synthetic fixture. The actual consumer timing and the under-one-minute target are open.

The 71 focused snapshot assertions passed. The artifact oracle passed 122/122, including the direct loose stage from a catalog logical snapshot, corruption refusal with an unchanged previous target, and the existing preservation and rollback cases. The native mutation test again refused a same-length edit after freezing. The 992-file and mutation scratch roots retired after terminal proof.

## Verified close

Unit 15. The native replay passed 313/313 through both deploy aliases, with exact output and reopened receipts, retained source barriers and no-write mismatch refusals. Independent verification hashed all 91 retained raw captures and matched six preview, apply and refusal projections. The per-run project-check declaration differs by the embedded absolute path. Stable validation results and all other file rows matched. The replay's owned workers, listener and runtime retired. The capability-map delta covers the direct manifest-selected staging path and its corruption check. Evidence is in `QA/forge-1110-deploy97-frozen-loose-staging.json` and `QA/forge-lua61-native-evidence-ku5muzz6`.

After-action review. The first design reused a whole-tree copy. Copying manifest-selected paths closes the chance of carrying stray snapshot directories into the stage. The writer audit detected one added append in the corruption oracle and an updated cleanup guard. The manifest now accounts for that exact test-only writer. The next performance risk is spending validation work again across a large preview and apply. Measure the validator's working set and cache churn before increasing or reorganizing the cache. Retain exact content and dependency matching.

## Release review at unit 15

NOT_READY. Public main is `01d508dd916ac7370dadc0a9f39610135c3cd1e6` and the starting Dev commit is five commits behind and 117 ahead. The histories share merge base `42283e7ca795f93e63003bffaaaebaabf6d37085`. Of 46 paths changed on both sides, 28 have differing final contents. The reconciliation scope includes deployment, validation, route tests and the extension manifest. The six paths changed only on public main include the Discord workflow and current release files. Carry the public history and these files into an isolated release candidate before versioning.

The Dev manifest is 0.0.81. Open VSX latest and the latest non-draft GitHub release are both 0.0.82. The reconciled candidate still requires routes, isolated E2E, runtime oracles, production build, exact VSIX and installed verification, and required CI. The current checkpoint supplies headless source evidence. Next review at unit 18. [Open VSX listing](https://open-vsx.org/extension/x4forge/x4-forge-studio) and [GitHub release](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.82).
