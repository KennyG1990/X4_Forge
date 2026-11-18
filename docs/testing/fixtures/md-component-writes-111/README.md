# Mission Director write fixture for #111

This standalone extension preserves the six original experiments and runs each once when its required player context exists. Only Claude installs, drives X4 and cleans up. Use the exact two payloads pinned by SHA256.json and the successor batch linked on the existing Agent Board row.

## Install and observation window

At the next permitted cold-test window with the deploy lock free, require forge_qa111_md_component absent, verify the source manifest, install only that folder and verify both installed hashes. Start a fresh Young Gun game with a fresh debug log. Record X4 version/build and enabled extensions; stay in the starting ship through player control plus 120 seconds. Do not load a campaign, issue orders for this test, move test files during the run or save.

Each plain one-shot cue now checks readiness every 1 second. There is no fixed startup-only opportunity or game-age cutoff. Controls require player entity, ship and sector; list cases require ship and sector; scalar and unset cases require the ship. The observation deadline is 120 seconds AFTER player control, not player/game age. By that deadline account for all six cases separately.

| Case / cue | Required entry and original evidence |
| --- | --- |
| Controls | Exactly one FORGE_MD111_CONTROLS_ENTRY before CONTROLS_BEGIN and CONTROLS_END. Inside that window require ENTITY_VALUE_OK, ENTITY_REMOVE_OK, ENTITY_LIST_OK, ENTITY_LIST_REMOVE_OK, TABLE_VALUE_OK and TABLE_REMOVE_OK, with no control error. |
| ShipScalar | SCALAR_ENTRY then SCALAR_BEFORE; capture exact engine error, SCALAR_AFTER, PRESENT or MISSING, and seeded-removal result if attempted. |
| ShipList | LIST_ENTRY then LIST_BEFORE; same accounting for the nested ship receiver and list RHS. |
| ShipDirectList | DIRECT_LIST_ENTRY then DIRECT_LIST_BEFORE; same list RHS on the direct player.ship receiver. |
| ShipNestedScalar | NESTED_SCALAR_ENTRY then NESTED_SCALAR_BEFORE; scalar101 on the nested receiver. |
| ShipRemoveUnset | UNSET_ENTRY then UNSET_BEFORE; capture the exact diagnostic for $ForgeQa111Unset and whether UNSET_AFTER follows. An UNSET_UNEXPECTED outcome is unresolved. |

All suffixes in the table use the FORGE_MD111_ prefix. Retain raw chronological lines with cue and variable names, including BEFORE, errors and continuation/readback/removal markers; do not separate error and marker lists in a way that loses their order. Other cues may interleave.

## Interpret each case honestly

Exactly one ENTRY establishes that its readiness opportunity was reached; the original BEFORE/error/readback signals establish which payload was attempted and what happened. No ENTRY by the observation deadline is an unresolved readiness timeout, not an accepted or rejected engine write. Repeated entry, SKIP, UNEXPECTED, fixture parse/load faults, a missing original BEFORE, or ambiguous diagnostics leave that case unresolved. A missing optional AFTER is a continuation observation to report, not a reason to invent success.

For the four seeded ship-write cases, PRESENT/value proof must precede interpretation of REMOVE_PRESENT or REMOVE_ABSENT. If the write never seeded the field, deletion of a stored value was not tested. The unset-removal case tests a distinct already absent field. Entity/table controls must pass before interpreting the ship results.

Original receivers and RHS remain unchanged. The list cases and entity/table controls use the same four-item list; the order slot is constant101, not the live order handle from the original report. Do not substitute primaryship. These fixtures never issue orders, spawn objects or change another mod.

Post exact per-case evidence on [#111](https://github.com/KennyG1990/X4_Forge/issues/111) and return VERIFIED or FIX on the existing board row. Any readiness timeout keeps that case open.

## Cleanup

Exit without saving. After X4 closes, use the existing batch runner to verify that the installed folder contains exactly the two manifest paths and hashes. Refuse cleanup on drift, extra files or links. Only Claude removes that verified folder, then confirms it is absent. Source fixture files stay pinned while the request is READY.
