# X4 Forge Studio extension — private-beta test script (B41 tester package)

Purpose: measure whether the IDE shell earns its keep BEFORE any product conversion.
This is the human half of the market experiment; the technical spike cannot answer it.

## Cohorts

- **Cohort A — IDE-native:** existing VS Code (or Antigravity) users, any modding experience.
- **Cohort B — X4 modders, non-IDE:** currently mod X4 by hand or with the standalone
  Forge; do not normally use an IDE.

Recruit ~5 per cohort minimum (small-N directional evidence, not statistics).

## Setup we give each tester

- The VSIX file + a one-paragraph install note (below) — nothing else. Support only when
  asked, and LOG every intervention.
- Install note (verbatim): "Install: open VS Code → Extensions panel → `…` menu →
  'Install from VSIX…' → pick the file. Then run the command **X4 Forge: Open Studio**
  (Ctrl+Shift+P). Requires Node.js installed. Make one tiny mod and package it."

## Tasks (per tester, one session, self-timed)

1. Install the extension unaided.
2. Open the studio via the command.
3. Complete first-run (dismiss or run setup — their choice).
4. Pick a starter template (Beginner path) or keep the sample mod.
5. Change one thing (ship variable / message text — anything visible in the inspector).
6. Validate (Beginner → Validate must show green).
7. Produce a package (compile/package step; deploy-to-game optional and only if they
   already own X4 with a configured install).
8. Close VS Code, reopen, reopen the studio (does their work come back?).
9. Days later: invite a second session (unprompted content — do they return?).

## Metrics (record per tester)

| Metric | How measured |
|---|---|
| Unaided install success | Y/N — no support message before first studio render |
| Time to first successful package | wall clock from VSIX install start → package produced (compare vs standalone Forge's TTFM funnel numbers, B20) |
| Support interventions | count of distinct helps we had to give |
| Completion rate | reached step 7 Y/N |
| Second-session return | Y/N (accepted + actually opened studio again) |
| Preference | exit question: "extension or standalone Forge, and why?" (Cohort B answers after also trying standalone; Cohort A may answer on extension alone) |

## Go / no-go thresholds (recorded now, before any data)

- ≥ 70% of Cohort A installs without assistance.
- Median time-to-first-package **no worse than standalone Forge** (B20 funnel baseline).
- ≥ 50% of all testers return for a second session.
- ≥ 60% of Cohort A prefers the extension.
- Support burden does not materially increase (rule of thumb: ≤1 intervention/tester median).

Failing 2+ thresholds = the extension stays a side-channel; the standalone remains the
product. Passing all = a real decision package for deeper investment goes to Ken.

## Honest instrumentation limits

- TTFM funnel (B20) instruments the app locally; the extension sidecar has its own state
  dir, so per-tester funnel snapshots must be collected manually (ask testers to click the
  readiness ladder → evidence, or send `data/` funnel file) — no telemetry is added for
  this beta (local-only posture).
- "Preference" from 5+5 testers is directional, not proof; treat 60% as a smell test.
