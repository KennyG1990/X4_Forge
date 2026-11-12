# Collection law c1112 — phase 1 source

Status: static checks VERIFIED; game behavior UNTESTED. Six XML files parse, the observer validates against the actual game9.00 libraries/md.xsd plus common.xsd, and owned manifest/version/dependency checks pass. DTD and unknown-MD-action negatives reject. SHA256.json and BATCH.json bind the exact source. This is not Forge native-deploy or engine-collection proof.

Six XML files in three extension folders. Dependency order is `forge_collection11_c1112_a` → `forge_collection11_c1112_b` → `forge_collection11_c1112_c`. A and B each supply a full `libraries/wares.xml`; C contains only its manifest and the unique `md/forge_collection11_c1112.xml`. Nothing patches vanilla `md/setup.xml`.

The content manifests follow the existing `buildContentXml` vocabulary (`version=100`, `save=0`, `enabled=1`). MD uses the vanilla standalone script shape, `event_game_loaded`, lookup-list iteration and debug formatting. Ware attributes/prices are corpus-grounded; the game has no applicable wares-content XSD, so this is not a ware-XSD validation claim. Existing TextDB IDs `{20201,701}` and `{20201,702}` supply labels only.

The observer iterates `lookup.ware.list`, compares known entries' `.id`, increments cue-local counters and reports integer `.volume`. It never directly looks up a missing ware, uses `ware.exists`, emits a success verdict, creates objects, grants inventory, creates production/offers or changes an existing ware. Adding the fixture changes the test game's ware registry; use only a disposable new game and never save a campaign with it.

## Raw observations

Capture one fresh, complete sequence from `FORGE_COLLECTION11_C1112_PHASE1_BEGIN` to `FORGE_COLLECTION11_C1112_PHASE1_END`, including every `FORGE_COLLECTION11_C1112_PHASE1_OBS` and the single `FORGE_COLLECTION11_C1112_PHASE1_COUNTS` line.

| Observed ID | Authored volume | What to record |
| --- | --- | --- |
| `energycells` | Vanilla 9.00 is 1 | Count and actual volume; other enabled mods may affect this control. |
| `forge_collection11_c1112_a_keep` | 11 | Count and every observed volume. |
| `forge_collection11_c1112_a_remove` | 12 | Phase 1 before-state for a later removal. |
| `forge_collection11_c1112_a_rename` | 13 | Phase 1 before-state for a later rename. |
| `forge_collection11_c1112_b_keep` | 21 | Count and every observed volume. |
| `forge_collection11_c1112_b_remove` | 22 | Phase 1 before-state for a later removal. |
| `forge_collection11_c1112_b_rename` | 23 | Phase 1 before-state for a later rename. |
| `forge_collection11_c1112_duplicate` | A: 14; B: 24 | Count and every emitted volume. No winner or duplicate-collapse rule is assumed. |

Full-collection coexistence would leave the six unique A/B records observable together. This expectation is a hypothesis to test. Missing BEGIN/COUNTS/END, a diagnostic storm, missing controls or unexpected values require the raw failure report, not an inferred success or replacement-law verdict.

## Operator boundary

After root publishes the reviewed batch: verify the exact manifest and three absent destination folders before installing only those folders. Use the next agreed cold restart and one disposable new game. Record the actual game/build, installed file hashes, enabled fixture IDs, timestamps, exact marker sequence and fixture-related load diagnostics. Do not edit AiLive, an existing mod, a campaign or standing configuration. Stop on conflicting ownership or a diagnostic storm.

After the game is closed and fixture files are no longer in use, verify exact installed ownership/hashes and remove only the three unchanged fixture folders under the authorized batch cleanup. Changed/unexpected files require refusal and a report. Retain the source, manifests and log evidence. This fixture is not accepted by the old W7 six-file MD-only stager/closed-case receipt.

The current shared batch runner's `remove` branch does not itself verify the installed tree or hashes. Before invoking it, independently verify that the three installed trees contain exactly the six manifest files and all six hashes agree; refuse cleanup on any difference. This requirement comes from inspection of the actual runner, not an assumption that its source-hash check covers installed files.

Phase 2 is deliberately absent. A later separately hashed C delta may remove/rename only these run-owned controls after the actual phase 1 before-state is retained; it requires its own cold disposable-game observation.
