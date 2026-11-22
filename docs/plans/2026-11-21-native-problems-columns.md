# Native Problems columns from project diagnostics

**Owner** [#80](https://github.com/KennyG1990/X4_Forge/issues/80) under #74. **Lane** Full. **Status** SPECIFIED.

**Goal** Two positioned warnings on one line must open at their own columns in native Problems and use distinct squiggle starts. Keep existing whole-line display for legacy findings without a reliable position.

## Baseline and design

On G checkout `408f254` plus the current release candidate, both extension-owned validators use `mapFlatFindings`. It drops the API column, then the workspace and node editor construct ranges that begin at column zero. The server already produces authored one-based UTF-16 positions for many relevant finding types. Some older producers normalize first-line BOM or XML separators differently. Reuse backend positions for the exact submitted text and preserve the existing mapper and severity handling. The source-bound Studio navigation API has different authority and remains intact.

Using a start-only point risks an invisible underline. Highlight one source character at the observed position, keeping a surrogate pair together. A missing/invalid/out-of-bounds column, a fallback anchor, changed open text, a legacy first-line BOM or unsupported line separators uses the line-only range. Find exact positions from the bytes sent in the current validation request. For unopened files, use the submitted text only for findings that have columns, without reading the file again. Do not adjust diagnostics policy, counts, validation evidence, inputs or accepted warnings. Preserve existing mixed developer edits. No game, live Forge, or user document changes.

## Acceptance and validation

1. Existing mapper tests stay green. Reproduce losing same-line columns in the existing pure mapper before editing; then assert separate UTF-16 ranges, valid same-line anchors, whole-line fallback, BOM, CRLF, non-BMP, invalid/negative/no column and stale text controls through the shared range function.
2. Exercise real server findings on a synthetic two-typo same-line MD fixture, map the result into two distinct native ranges, and confirm generation guards and both extension entry points still call the common function. Verify extension typecheck and in-memory controller build on G.
3. Native Problems in installed Antigravity, full precommit/release remain required and pending while live X4 is active. No rendered/installed credit from source checks. External package and release unmodified.
4. Roll back only the mapping and the two scoped extension hunks after comparing the baseline diffs. Link proof to #80 and current handoff.

## Close and AAR

**Status** PARTIAL. The baseline mapped both server warnings to the entire line. The repair retains authored positions for both extension consumers. The mapper passed 21 checks and shared validation passed 54. A two-warning CRLF MD fixture with an astral character produced two IDs and authored positions 43 and 84 on line two through real project validation. The native adapter mapped them to distinct one-character ranges. The exact extension type check and in-memory controller build passed.

The #110 effective-reference subset also passed 51 of 51 in 1.344 seconds. No working mod, installed IDE, game, or backend listener was used. Both test fixtures were retired. The existing G receipt records exact source and controller hashes and the ranges. No capability-map expansion is claimed before native host verification.

AAR. A Windows wildcard lookup failed before editing and was corrected with exact paths. Provenance checks keep stale source, unknown file, and ambiguous BOM ranges on the line fallback. Installed Problems navigation is the highest-risk remaining validation. Commit point after normal precommit and installed proof is fix(editor): place Problems diagnostics at authored columns.
