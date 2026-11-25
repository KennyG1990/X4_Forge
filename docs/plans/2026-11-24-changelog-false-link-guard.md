# Unit 41 Plan — `#40`: Keep Historical & Ambiguous Changelog `#NN` Numbers From Becoming False GitHub Links

- **Status:** `VERIFIED`
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Issue:** GitHub `#40` (`[Release tooling] Keep historical changelog numbers from becoming false links`) + 3-Unit Release Readiness Review (Units 39–41)
- **Baseline HEAD:** `041542f2f4f2710535822b6b61a6f8368102623a`

---

## 1. Reconciled Facts (`[REPRODUCED]`)

1. **`@vscode/vsce` `ChangelogProcessor` Behavior (`node_modules/@vscode/vsce/out/package.js:601,725`):**
   - During `vsce package`, `ChangelogProcessor` writes `extension/changelog.md` after applying a raw regex over the entire Markdown text:
     `const markdownIssueRegex = /(\s|\n)([\w\d_-]+\/[\w\d_-]+)?#(\d+)\b/g;`
   - Any bare whitespace-preceded `#NN` (or `owner/repo#NN`) is rewritten to `[#NN](https://github.com/KennyG1990/X4_Forge/issues/NN)`.
   - Explicit Markdown links `[#NN](https://github.com/KennyG1990/X4_Forge/issues/NN)` (preceded by `[`) and CommonMark backslash-escaped `\#NN` (preceded by `\`) are NOT rewritten by `vsce`; `\#NN` renders as literal `#NN` in CommonMark/`markdown-it` without creating a link.
2. **Exact Reproduced False Links in `vscode-extension/CHANGELOG.md`:**
   - Lines `595` and `598` under `## 0.0.1 — 2026-07-08` (derived from pre-GitHub-issue `ROADMAP.md` commit subjects) contain bare `#63`, `#36/#37`, `#38`, and `#39/#40`, which `vsce` rewrites into links to unrelated GitHub issues (`#63` = `FF-24`, `#36` = community tooling, `#38` = marketplace refresh, `#39` = OpenVSX namespace).
   - In shallow checkouts (`git rev-parse --is-shallow-repository === 'true'`), `gen-changelog.mjs` preserves historical sections from `HEAD:vscode-extension/CHANGELOG.md` via `preserveShallowChangelog`.

---

## 2. Bounded Scope & Non-Goals

### In Scope
1. **`vscode-extension/scripts/gen-changelog.mjs`:**
   - Export `maskIntentionalGitHubIssueLinks`, `findAmbiguousHashReferences`, and `escapeAmbiguousHashNumbers`.
   - Escape bare `#NN` to `\#NN` in `humanizeSubject(subject)` (automatic git-subject fallback) and in historical `committed` sections inside `preserveShallowChangelog`.
   - Reject unescaped bare `#NN` in curated `release-notes.json` bullets and `buildChangelog(releases)` with a deterministic error while preserving explicit `[#NN](https://github.com/<owner>/<repo>/(issues|pull)/NN)` links untouched.
   - Expand `gen-changelog.mjs --selftest` with positive (explicit GitHub link preserved, escaped `\#NN` accepted, `humanizeSubject` & shallow-history escaping) and negative (ambiguous bare `#63` / `owner/repo#63` rejected) checks.
2. **`vscode-extension/CHANGELOG.md`:**
   - Regenerate via `npm run changelog --prefix vscode-extension` so lines `595` and `598` escape `\#63`, `\#36/\#37`, `\#38`, and `\#39/\#40` while keeping all six `0.0.66` bullets and every other version section byte-for-byte unchanged.
3. **`vscode-extension/scripts/inspect-vsix.mjs` & `.github/workflows/quality.yml`:**
   - Require non-empty `extension/changelog.md` (case-insensitive) in VSIX metadata inspection.
   - Export `inspectPackagedChangelog` and enforce it inside `inspectVsixBytes`: reject unescaped bare `#NN` outside explicit GitHub issue/PR links, reject roadmap false links, and verify zero silent VSCE changelog rewrites against `vscode-extension/CHANGELOG.md` when available.
   - Expand `inspect-vsix.mjs --selftest` and add `node vscode-extension/scripts/gen-changelog.mjs --selftest` to `.github/workflows/quality.yml`.

### Out of Scope
- Modifying any already-published VSIX archives or `vscode-extension/evidence/*` historical receipts.
- Modifying the six `0.0.66` release bullets.

---

## 3. Acceptance Criteria & Validation Contract

1. `node vscode-extension/scripts/gen-changelog.mjs --selftest` passes all existing + new false-link/intentional-link checks.
2. `npm run changelog --prefix vscode-extension` produces a `git diff` on `vscode-extension/CHANGELOG.md` touching ONLY lines `595` and `598` (`0.0.66` bullets 100% untouched).
3. `node vscode-extension/scripts/inspect-vsix.mjs --selftest` passes all metadata + changelog link-hygiene positive/negative checks.
4. Real scratch VSIX packaged via `npx --prefix vscode-extension @vscode/vsce package --allow-missing-repository --out G:\Forge-QA\temp\verify-40.vsix` passes `inspect-vsix.mjs`, has byte-identical LF `extension/changelog.md` vs `vscode-extension/CHANGELOG.md`, and is deleted after verification.
5. `npm run precommit:check` passes, commit pushed to `origin/main`, GitHub Actions `Quality` (which builds & inspects `x4-forge-studio-ci.vsix`!) passes `SUCCESS`, `#40` is updated/closed with exact evidence, Notion `Forge QA Field Log` updated, and **3-Unit Release Readiness Review** (Units 39–41) recorded.

---

## 4. Implementation, Validation, 3-Unit Release Readiness Review & AAR Close Record

### Implemented Changes
1. **`vscode-extension/scripts/gen-changelog.mjs`:**
   - Exported `maskIntentionalGitHubIssueLinks`, `findAmbiguousHashReferences`, and `escapeAmbiguousHashNumbers`.
   - Escaped bare `#NN` to `\#NN` in `humanizeSubject` (git-subject fallback) and in historical `committed` sections inside `preserveShallowChangelog`.
   - Enforced `assertNoAmbiguousHashReferences` in `loadCuratedNotes` and `buildChangelog` so unescaped bare `#NN` or mismatched `[#40](.../issues/41)` links fail deterministically while intentional `[#NN](https://github.com/<owner>/<repo>/(issues|pull)/NN)` links and escaped `\#NN` numbers pass (`29/29` selftest).
2. **`vscode-extension/CHANGELOG.md`:**
   - Regenerated via `npm run changelog --prefix vscode-extension`: escaped only historical `0.0.1` lines `595` (`\#63`) and `598` (`\#36/\#37`, `\#38`, `\#39/\#40`); all `81` version headers and all six `0.0.66` bullets stayed byte-for-byte identical.
3. **`vscode-extension/scripts/inspect-vsix.mjs` & `.github/workflows/quality.yml`:**
   - Required non-empty `extension/changelog.md` in `inspectEntryMetadata`, added `inspectPackagedChangelog` inside `inspectVsixBytes` (verifying Forge header, zero bare `#NN` references, zero roadmap false links, and byte-identical LF parity against `vscode-extension/CHANGELOG.md`), expanded `--selftest` (`17/17 PASS`), and wired `gen-changelog.mjs --selftest` into `.github/workflows/quality.yml`.

### Validation Evidence
- `node vscode-extension/scripts/gen-changelog.mjs --selftest`: `29/29 allPassed=true`.
- `npm run inspect-package --prefix vscode-extension -- --selftest`: `17/17 PASS`.
- `npm run changelog --prefix vscode-extension` + `git diff -- vscode-extension/CHANGELOG.md`: `81` versions written; diff confined strictly to lines `595` and `598` (`0.0.66` untouched).
- Real VSIX package & byte inspection (`vsce package --allow-missing-repository --out G:\Forge-QA\temp\verify-40.vsix` + `inspect-vsix.mjs`): `PASS` (`2,173` entries, `78,368,405` unpacked bytes, `27,766,936` archive bytes, zero VSCE changelog rewrites; scratch `.vsix` cleaned up).
- `npm run precommit:check`: `[precommit] OK`.

### 3-Unit Release Readiness Review (Units 39 `30f30e1`, 40 `041542f`, 41 `#40` — `41` units ahead of `0.0.93`)
- **Engineering & CI Qualification (`GREEN`):** `typecheck` (`0`), `lint -- --max-warnings 600` (`0` errors), `test:writers` (`30/30 + PASS + 8/8`, `50` raw writers), `test:capabilities` (`109` capabilities, `398` routes, `110` MCP tools), `test:oracles` (`134/134`), `test:routes` (`792/792`), `46/46` Playwright E2E UI tests (`30f30e1`), VSIX packaging + false-link inspection (`17/17` + `2,173`-entry VSIX `PASS`), and GitHub Actions `Quality` (`45513135702` & `45519053555` `SUCCESS`).
- **Release Gate Verdict (`READY_FOR_OPERATOR_GATE` / `HOLD_UNTIL_MACHINE_STATE_ASK`):** With the Unified UI Simplification Overhaul (`30f30e1`) and VSIX changelog false-link guard (`#40`) both verified, `0.0.94` is technically ready to cut as soon as Ken confirms the Machine-State Ask + Write Gate to upgrade `FORGE DEVELOPMENT` (`PID 34076`, currently `0.0.89`) and publish `x4forge/x4-forge-studio@0.0.94` to Open VSX. Next scheduled 3-unit review: **Unit 44**.

### AAR
- **Outcome:** `CLEAN` implementation pass (`0` failed commands or reworks during Unit 41).
- **Points to sustain:** Inspecting `@vscode/vsce/out/package.js` (`ChangelogProcessor` line `601`) and checking `git rev-parse --is-shallow-repository` (`true`) during Stage 3 Reconciliation prevented a shallow-history `HEAD:vscode-extension/CHANGELOG.md` overwrite trap before writing a single line of code.
- **Highest-risk evidenced weakness:** `No evidenced risk delta`.
