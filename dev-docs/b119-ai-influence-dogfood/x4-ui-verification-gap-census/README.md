# B119 X4 UI verification-gap census

Captured: `2026-09-09T16:01:10.1424419-04:00`

Status: `VERIFIED` for this bounded report implementation; the live census
itself is explicitly incomplete, and overall B119 remains `IN_PROGRESS / PARTIAL`.

The existing read-only corpus census now attaches one deterministic,
bounded `x4UiVerificationGapCensus` to every report. It reuses the existing
manifest selection, file read, `analyzeLuaFiles` call, `analysis.x4UiResults`,
and `x4UiSummary`. It does not add a scanner, parser, source execution,
renderer, or visual/game census.

## Live read-only receipt

- Authority: `http://127.0.0.1:60836`; manifest generation
  `1788680993999-6fc9cf04ab`; state `ready/current`.
- Command: `C:\Users\Moshi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/x4-ui-lint-corpus-check.ts --json --base-url=http://127.0.0.1:60836`
- Safe Node: `v24.19.0`; exit: `0`; report status:
  `no-known-fatal-static-gaps`.
- Baseline reproduced: `81/81` selected/read, `0` failed, `7,669,552` bytes,
  `81` X4 UI files, `0` applicable fatal errors, `6` not-applicable findings,
  `29` warnings, `70` unverified files, `26` truncated files, and `13,731`
  verification gaps.
- Census: `totalGaps=13,731`, `affectedFiles=70`, `30` category/status rows,
  and `12` top files. The total reconciles to the observed structured gaps,
  summed per-file counts, and aggregate bucket counts.
- `evidenceComplete=false` because `truncated-files: 26`. The count is an
  observed bounded count, not complete underlying truth or a support priority.
- Current fatal/warning/not-applicable/status and process-exit semantics are
  unchanged. The complete bounded census is in
  `live-readonly-receipt.json`.

## Fail-first evidence

Before implementation, the two causal census-contract checks failed as
expected: the same safe Node selftest exited `1` with
`verification-gap-census-is-always-present` and
`verification-gap-census-contract-fields-exist` false. The exact stdout is
retained in the plan and in `live-readonly-receipt.json` under `failFirst`.

## Bounded contract

Each bucket is sorted by category/status and keeps at most three unique,
POSIX-normalized relative path examples. Top files are capped at twelve and
sorted by observed gap count descending, then path ascending; only path, gap
count, sorted categories/statuses, and truncation state are retained.
Malformed category/status values enter the reserved `invalid-evidence /
invalid-evidence` bucket. Unsafe or absolute paths are omitted from census
samples/top files and force incompleteness. No source path, source text,
messages, expressions, or secrets are serialized in the new census object.

## Validation

The owner selftest passes `23/23`; `npm run typecheck`, scoped ESLint,
owned-path `git diff --check`, and `npm run precommit:check` pass. Preview
remains for layout and game remains the truth boundary; this receipt makes no
visual, in-game, arbitrary-Lua, universal-C++, same-state parity, or real-mod
correction claim.
