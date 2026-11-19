# Mission Director arithmetic lookup witness for #114

The fixture uses only local cue variables and debug output. Both payload hashes are pinned by `SHA256.json`.

## Run

Claude runs this during a planned cold start with the deploy lock free. Require `extensions/forge_qa114_md_arithmetic` absent, then install and verify the two pinned files using the existing batch runner. Start any disposable new game with a fresh debug log and script logging enabled. Record the X4 version and build. Capture raw chronological lines through player control plus 120 seconds. This fixture has no ship or station prerequisite.

## Evidence

- `ReadRemoved` must emit `FORGE_MD114_ARITHMETIC_REMOVED_BEFORE` and then the lookup error for `$Qa114ArithmeticRemoved`. Capture its `REMOVED_AFTER` value if it appears.
- `ReadUnset` must emit `FORGE_MD114_ARITHMETIC_UNSET_BEFORE` and then the lookup error for `$Qa114ArithmeticUnset`. Capture its `UNSET_AFTER` value if it appears.
- Controls must report `FORGE_MD114_ARITHMETIC_PRIOR=10`, `FORGE_MD114_ARITHMETIC_SUPPRESSED=1` and `FORGE_MD114_ARITHMETIC_CONDITIONAL=9` exactly once. Capture any lookup error in these cases.

The guide predicts a value of `1` after each strict failed lookup. Treat the actual error, continuation and result as separate observations. Missing or repeated required markers, load errors, control errors or a different value leave that case unresolved. Post raw lines and a per-case result on [#114](https://github.com/KennyG1990/X4_Forge/issues/114).

## Cleanup

Exit without saving. Verify both installed file hashes and the absence of extra files or links before removing the fixture folder with the existing batch runner. Confirm the folder is absent and report any drift.
