# B52 · In-app bug reporter → GitHub Issues — SPECIFIED 2026-07-16

Lane: FULL. Ken's decision: reports land in the **Issues tab of KennyG1990/X4_Forge** ("bugs are
issues and this tracks"); the entry point must be **obvious**.

## Design (secret-free by construction)
- The app NEVER talks to GitHub itself — no tokens, no outbound server calls. The button builds a
  **prefilled new-issue URL** (`github.com/KennyG1990/X4_Forge/issues/new?labels=bug&title=…&body=…`)
  and opens it in the user's browser; THEY submit it under their own account. Clipboard copy is
  the universal fallback (no GitHub account / popup blocked).
- House pattern: pure `src/lib/bugReport.ts` — `buildBugReport(input)` → `{issueUrl, body,
  truncated}`. Sanitizes secret-shaped strings out of the context (x4fk_ keys, 64-hex tokens →
  `[redacted]`), caps the URL under GitHub's length limit (truncates body, flags it so the UI
  copies the FULL text to clipboard). Oracle `runBugReportSelftest` registered in SELFTESTS.
- UI: **header bug button (icon + title)** next to SETTINGS — the header is shared by Beginner
  AND Expert modes, so it's obvious in both. Opens `BugReportModal.tsx`: title (required), what
  happened / steps textarea, "include technical details" (default on) showing the exact context
  that will be attached (version, build/commit, platform, workspace name + node/link counts,
  shell hint) — nothing hidden. Buttons: "Open GitHub Issue" (primary) + "Copy report" fallback
  + a plain note that submitting needs a (free) GitHub account.
- Manifest rider: add `repository` + `bugs.url` to vscode-extension/package.json (repo is
  public) — the store page gains a real "Report Issue" link too.

## Acceptance
1. Oracle green (encoding, env table, secret redaction, truncation, empty-title rejection) + in sweep.
2. tsc/lint/precommit 0; full e2e 19/19 (no regression).
3. LIVE (browser on a scratch sidecar): button visible in BOTH modes → modal → filled report →
   "Open GitHub Issue" opens the prefilled github.com/.../issues/new page (verified URL + new tab)
   → "Copy report" puts the full markdown on the clipboard.
4. Negative: empty title blocks submit; a planted x4fk_ token in context arrives `[redacted]`.
5. Records + close; Ken commits; publish rides the NEXT stable release (0.0.8) after his commit.

## Rollback
Self-contained additive UI + one pure lib; revert = drop the files + header button.
