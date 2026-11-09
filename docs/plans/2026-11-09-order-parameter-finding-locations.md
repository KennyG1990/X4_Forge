# Locate AI order parameter errors in native deploy

**VERIFIED in isolated Dev · Full lane.** [Owner issue #33](https://github.com/KennyG1990/X4_Forge/issues/33) · [Batch-shaped replay](https://github.com/KennyG1990/X4_Forge/issues/33#issuecomment-6722825181).

## Baseline and reconciliation

Dev starts clean at `6bb589c6c7649398c3456340e32977852ee2b466`. The prior isolated fixture reproduced six errors matching Claude's batch 387 missing-label report using two synthetic AI scripts. The current lint emits order and parameter names without element coordinates. The project aggregator attaches a path only to findings that already have a `sourceRef`. Existing scoped action-label findings have both fields, and the existing flattening path already projects location and derives the stable order/parameter reference when needed. Graph and source inspection identify the linter and aggregator as the only changes needed. Agent-Brain returned weak matches to older reference and bridge work.

The X4 9.00 schema defines the existing parameter attributes, and recorded engine evidence drives the Forge missing-label error. The prior black-box CodeSense 1.2.0 run returned no findings on these exact two unlabeled files with schema validation enabled. This change repairs Forge's location evidence while preserving its existing engine rule. The capability map already describes shared project, deploy and IDE diagnostics. No capability-map delta.

## Implementation and acceptance

1. Reuse the existing xmldom opening-element coordinates on all three order-parameter errors in `src/lib/aiscriptLint.ts`. Attach the owning project-relative path at the existing `src/server/projectValidation.ts` aggregation boundary. Preserve order/parameter references, rule codes, severity and schema precedence. No new parsing, deploy policy, suppression, or navigation behavior. Findings IDs that previously lacked their true location may change.
2. Extend the existing lint oracle to verify locations for the three rules and exact opening positions for repeated same-line and multiline parameters. Keep the vanilla-shaped positive and scoped label controls. Run it before and after the implementation.
3. Replay the six unlabeled findings on the exact baseline and candidate under an owned loopback Forge. Full project validation and native preflight must agree on exact project paths, opening coordinates and order/parameter references. All six must remain blocking and identifiable. Missing labels must leave the scratch destination untouched. Adding labels must enable a fresh bound native deploy, with the exact selected bytes and durable receipt readback. Verify process cleanup.

Run typecheck, the lint oracle, the existing incremental validation checks, durable writer audit, diff checks and normal precommit. Preserve exact private evidence and update GitHub and the Forge QA field log. Installed navigation, release delivery and the remaining #33 work are separate. The live window permits lightweight headless checks. No live source, game, standing configuration, permission or credential changes. Rollback is the bounded linter and project aggregation diff.

## Close

[REPRODUCED] The exact baseline reports six blocking errors in full project validation and both native deploy aliases. Each identifies the order and parameter without file, line or column. Baseline server SHA-256 `b473959bf921f5272f5a7ddd86032e445f73cf50d6e830614bc14d0eec0fefe0`. The 22-check private verdict `forge-33-order-location-http-pjvfybt_/verdict.json` has SHA-256 `77fefc7fea4aa03bf14adc7796b5770c66123ff174a9788a6638cc1b90218b7a`.

The exact Dev candidate reports all six findings at lines 5–7, column 7 across two paths, with matching order/parameter references and the same six distinct IDs on both previews. Full project, `deploy-verify` and `deploy` agree. Both bound unlabeled applies refuse before any target, staging or receipt write. A stale preview refuses after the source changes. Adding labels permits an exact five-file v101 deployment and reopens the committed operation receipt through each alias. Candidate server SHA-256 `ca94e6bc5a4992b2b47c99c46a5bb7d57c5adf09304f7b0a7aba296c45eb0813`. The 22-check private verdict `forge-33-order-location-http-i3bu3zj3/verdict.json` has SHA-256 `5b9fab3a808aafc58eeac7cc025585eeeaaea02f655ff308542802db8cb913e6`. Both successful runs retired their owned processes and listeners.

The isolated CodeSense CLI 1.2.0 black-box replay on the two pinned input files found zero diagnostics with X4 9.00 schema validation enabled. The parsed result matched the archived run. Private verdict `forge-33-codesense-0hj4mh8g/verdict.json` SHA-256 `65f0ce10d311b43b605c4fb0c94301c6b896ebba1e4f53ea2290379c47d03606`.

The AI lint oracle passed 20/20 after the two new position checks failed on the baseline. Incremental and full validation parity passed 26/26 using a reduced copy of the 9.00 references. Typecheck, writer inventory and diff checks passed. The normal precommit hook gates the local checkpoint. The IDE diagnostic mapper currently uses the file and whole line. Exact-column evidence is verified on the API. Installed navigation, other B112 diagnostics and public qualification remain open.

## Three-unit release review

The isolated checkpoints since the last review are #49 (`07dc015`), #22 (`6bb589c`) and this #33 slice. The exact 0.0.82 frozen source remains `c4d390da543184dc97281e156bac6d0eb88141eb` with 902 files and the two selected receipt fixes. The archive and manifest reverified. Keep that selection separate from these newer Dev checkpoints. GitHub main remains `f76775f02dbd8c61a100233e9d11d659f7a5d39b`. Open VSX and GitHub still serve 0.0.81. [Open VSX](https://open-vsx.org/api/x4forge/x4-forge-studio/latest) · [GitHub release](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.81)

Claude's 11:20 UTC board check still shows active live work and no Forge quiet window. The short source and package roots were absent. Start the pinned recipe after machine clearance, then require source gates, exact VSIX packaging, isolated installation and installed native replay before publication. The separate generic deploy bypass evidence remains pending under #85. [Release source](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6734430444) · [Agent Board](https://app.notion.com/p/40e4618ed15b81b1b5fdc92a60d5d834)

## AAR

Sustain a failing oracle on the baseline and matching project/native evidence on the exact candidate. The first incremental check stopped because the reference root was unset. It passed with a six-file private corpus copy. The first HTTP attempt stopped before listening because the private dependency path was missing. It passed using the established staged modules. The highest-risk observed weakness was forcing an agent to infer where an engine-backed blocking diagnostic came from. File and opening-tag location now travel in the same finding, and the separate installed navigation gate covers how the IDE uses those fields.
