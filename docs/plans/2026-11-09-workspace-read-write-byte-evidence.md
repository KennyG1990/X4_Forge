# Workspace read and write byte evidence

**VERIFIED in isolated Dev · Full lane.** [Owner issue #22](https://github.com/KennyG1990/X4_Forge/issues/22) · [Archived root replay](https://github.com/KennyG1990/X4_Forge/issues/22#issuecomment-6720950265).

## Baseline and reconciliation

Isolated Dev starts clean at `07dc01524e1a52441770b615c90f88cb221f3bb9`. The exact bundled baseline `3a785265810bfd33cae0e76533722404995c71c6438780510578e646877ce9c3` passed all 39 baseline expectations. [REPRODUCED] The workspace read reports eight bytes for a four-byte malformed UTF-8 fixture and omits the raw SHA-256. Guarded write evidence identifies the bytes but omits the destination. Existing default workspace selection, explicit deployed reads, containment, missing-file behavior and guarded writes are already functional. Recall surfaced a related deployment investigation and a broad bug audit without exact #22 proof.

Graph and source inspection locate the selected-path read and shared guarded writer in `server.ts`. The capability map separates development and deployment roots, and ADR-F1 governs workspace identity. Current UI consumers use decoded `content`. Preserve the shared writer's outward shape on suppression and preserve history revert, project coordination, the compare-and-swap guard and #68 failure reporting. No capability-map delta for authority or available routes.

## Implementation and acceptance

1. Read the selected file into one buffer. Return the existing UTF-8 `content`, root and path with the physical buffer length and lowercase SHA-256. Keep all root and error behavior. A SHA-256 identifies bytes, while the role and path identify their location.
2. Add workspace role and the verified destination to `/api/fs/write` success under `written`. Reuse the existing guarded write and readback. Preserve the existing suppression response and avoid adding paths to failures. Update the Forge agent guide and API discovery text.
3. Extend the existing route regression with a malformed UTF-8 fixture, a fresh workspace hash edit, and a refusal of a different deployed-copy hash. Run the isolated two-root HTTP replay against the exact candidate. Check stale, deployed and decoded-text hashes refuse without writing. Verify role and path agreement, no cross-root fallback, traversal and junction refusal, and a separate native v101 deploy with exact receipt and bytes. Verify owned processes retire.

Run TypeScript, C06 contracts, route script syntax, the durable writer audit and Git diff checks. Run the normal precommit gate before the local checkpoint. Preserve evidence in the private Forge QA lab under `fs22-http-*`. The existing route suite receives the regression for the next full gate. Exact installed and public qualification remain separate while Claude's live window is active. This unit changes backend evidence only, with no game or desktop experience change.

The API addition carries location only for an authorized workspace write. No new data writer, permission, credential, spending or network surface is required. The rollback is the bounded source, test and guide diff against the clean base. If the writer inventory fingerprint changes, compare inventories before updating the pin.

## Close

The read, guarded write and guide now agree on the same workspace path. The writer passes its verified destination to the filesystem response. The project-rule suppression response still receives the existing byte evidence, and revert still checks whether the write succeeded. The durable writer inventory passed unchanged.

- Exact baseline replay passed 39/39. Private evidence `fs22-http-0tp8c7bk/verdict.json` SHA-256 `b61fa6abe6dea967f8c1292d236145984949aeeb235cf04a1f4406b58cf4cd70`.
- Candidate bundle `b473959bf921f5272f5a7ddd86032e445f73cf50d6e830614bc14d0eec0fefe0` passed 41/41 with `python -X utf8 forge-22-fs-byte-http.py` in the private Forge QA lab. Candidate evidence `fs22-http-jmrkw3ou/verdict.json` SHA-256 `a55cd4997e59ad33781128d7353ae8dad79222187ecac87c4e8c1980b1dfee84`.
- The response reported four physical bytes and their raw hash. The raw hash authorized one deliberate replacement. Hashes of the decoded text, a previous workspace version and a different deployed copy refused. Role, path and hash matched the explicit workspace reread. Root selectors, traversal, a physical junction and no fallback passed both sides of the replay.
- The same backend deployed the standalone v101 fixture and reopened its exact committed receipt `ar_ca5321a2d51b1d9c480ba04ce89f3f2ea7136d24a5d5c9d42f9e37089c5a6f24`. The owned backend, listener, discovery entry and junction retired.
- TypeScript, C06 contracts (119/119), route script syntax, durable-writer audit and diff checks passed. The new route assertions will also run in the broad suite. Installed and public qualification remain open. The local checkpoint is gated by the normal precommit hook.

## AAR

The baseline replay separated a fixed root-selection bug from a live evidence gap in Dev. Review of the archived approach caught that attaching the path to the shared wire object would disclose it on the suppression endpoint. The filesystem write projects the path only in its own response. The highest-risk observed weakness was deriving a concurrency token from decoded text when invalid UTF-8 changes the bytes. The replay now requires refusal of that token and acceptance of the raw file hash. No capability-map delta.
