# Review file changes before deploying

Status: SPECIFIED. Owner: [#34](https://github.com/KennyG1990/X4_Forge/issues/34). Related cutover evidence: [#85](https://github.com/KennyG1990/X4_Forge/issues/85). Baseline G: checkout at 408f2542d4f6f91873417f2f6cb6cca52b6ef034. The four existing implementation and test files are clean relative to this baseline. The separate #74 candidate is present in other files.

A headless render of the actual wizard showed counts of one addition, replacement, removal and preserved path. The three supplied file paths were absent. Playtest has the same count-only rendering. The native preview already returns effect.added, overwritten, deleted and preserved. It reports added and deleted bytes and both byte counts for a replacement. #116 covers the catalog forecast and receipt. Reuse the payload directly.

Give the wizard and Playtest the same collapsible file list alongside the existing destination and Apply button. Keep counts visible while collapsed. Show exact relative paths, added sizes, replacement before/after sizes, removal sizes and preserved paths. Keep the list unmounted while collapsed and page large lists. An older response without effect rows should remain usable. Missing sizes must read as unavailable. Preserve DTO serialization, authorization, deploy requests, preview binding, stale checks, settings and receipts. Existing Apply interaction remains the single write action. Roll back by removing this view and restoring the previous count renderers.

Acceptance requires that a five-byte add, seven-to-eleven-byte replacement, thirteen-byte removal and preserved path appear identically in both views before Apply. A review interaction makes zero apply requests. The existing replay checks still require explicit confirmation, fresh binding, cancellation and refusal. Prove empty or missing size handling and bounded navigation with a focused render check. Extend the existing Playwright deploy review. Run precommit, the rendered wizard/Playtest scenario and exact installed package checks in an eligible isolated window before release. This presentation change has no in-game install dependency.

Evidence stays on G:. Record source and rendered results separately. Update #34 with the scoped result after testing.

## Implementation and evidence

PARTIAL. The wizard and Playtest share the same disclosure. It keeps the count and exact destination in view, mounts details only on demand, and renders at most 50 rows per page. Legacy missing categories and invalid sizes remain explicitly unavailable. Deploy metadata and authority are unchanged. No capability-map delta until installed delivery.

- Baseline wizard render exited 0 with all four category counts and none of the three known supplied paths.
- Final targeted check exited 0 with zero diagnostics across the four touched source files. The existing test extension passed syntax validation. The initial ad hoc commands omitted application ambient declarations and flags. Final type-check used the project compiler options and the actual declaration read from main.tsx in memory. Scoped Git whitespace validation passed.
- An offline headless Chromium run of both real React components passed in 1.895 seconds. It checked the exact add, old/new overwrite and delete sizes, the preserved path, keyboard disclosure, 50 then four rows, return to page one after closing from page two, and missing size, empty and malformed results. The mocked transport received one read-only preview and zero apply requests. The owned G: browser folder was removed. Component SHA-256 eb219841f859c7ff9f64efdbe037ff2058ef23e001e380f76bc0dd0110edbfc2.
- Full configured deploy-review E2E, mandatory precommit and exact VSIX verification remain pending. X4 was active during the focused work. This was a component render with a controlled response, so it does not prove the packaged layout or end-to-end request binding.

AAR. The wire contract already held all the needed facts, so one UI disclosure fixed the missing review step. Fresh-eyes review caught a false zero for malformed categories and a weak page-reset test. Both are covered in the final focused run. The original script and invocation still belong to the separate #85 cutover.

## Responsive layout follow-up

A styled headless reproduction used the real Studio stylesheet and a catalog replacement of 7,465,341 bytes with 11,654,123 bytes. In the 390px wizard the three-column row gave its filename 0px width and 915px height. The shared row now puts the path on its own line in narrow containers and uses the compact three columns when space permits.

The repaired path had widths of 205px and 335px in the 390px and 800px wizard, and 272px and 424px in Playtest. No row overflowed horizontally. The review list remained 160px high and the wizard Apply button stayed visible. Playtest sent one simulated preview and both views sent zero Apply requests. The existing deploy-review test now includes this catalog entry at 390px. Scoped types and spec syntax passed with zero diagnostics. The check used 58,401 CSS bytes compiled from the actual stylesheet and selected component utilities. The one captured 390px wizard screenshot was inspected and kept at G:/Forge-QA/checkpoints/deploy-file-review-20261121.png, SHA-256 9f0eaff5ed74193dd7760f04ca1725a3152f16f95b0beacf6b22faaaB67ce285. The browser phase was retired. Component SHA-256 73340f0978e4bb019c7bd260db59a7c54a348a0ef47dfca4137b4533a45052da. Full release gates remain pending.

AAR follow-up. The unstyled rendered check correctly covered behavior and missed a zero-width column. The styled fixture with a real-size catalog row now catches it. The Tailwind compiler was reused from the checkout. Its memory scan needed source contents without the file parameter to generate the utilities.


## Discovery output lifecycle

SPECIFIED. A source-only Playwright listing of the current release candidate discovered 150 tests and created an empty deploy-review output directory by importing the test module. Move this module's existing directory creation into its test body. Keep the same evidence location and ordinary scenario. The repeat listing must preserve all 150 names in order, including the prior 143 in their qualified order, and create no deploy-review folder. No browser, suite execution or game action is needed for discovery.


VERIFIED for source discovery. The repeat Playwright listing found 150 unique cases and the same ordered identity digest as the first listing. The prior qualified 143 remain in order. The seven additions cover autosave convergence, Files Save and New File authority, and held Diff to Patch responses across candidate edits, reset and workspace changes. Moving the directory operation kept the sequence unchanged. Discovery created no deploy-review evidence directory and preserved the existing last-run record. Only discovery was exercised. The G: QA evidence pins the current order.


## Confirmed file changes after Apply

SPECIFIED under #34 and the #85 cutover. The existing deploy effect attachment and native response already carry verified add, replace, remove, and preserved paths. Compile & Deploy and Playtest unmount their review panels after Apply, and their shared result summary drops the effects. The actual summary rendered a committed, byte-confirmed response in memory and showed confirmation with no file list. This reproduces the missing post-deploy record in both consumers. The normal receipt, existing CLI/API, and pre-Apply disclosure already serve their respective roles.

Reuse DeployFileChanges inside DeployValidationSummary for a successful non-preview response with confirmed bytes, a committed receipt, and an effect payload. Label the result Applied file changes and render the response's categories, paths and sizes. Leave legacy or unavailable effects, unconfirmed outcomes, failed or rolled-back responses, and the preview control with their existing behavior. Opening details must send no request. Use the existing bounded list. No server behavior or authority changes.

Acceptance: actual shared renderer shows the collapsed file counts for a confirmed response. The expanded UI shows the exact applied rows and sizes. A preview, an unconfirmed or failed Apply, a rolled-back receipt, or missing effects cannot produce an applied report. Extend the current deploy-review E2E without changing its scenario title, identity or Apply count. Exercise both product consumers in the existing eligible E2E gate. Run in-memory/isolated component checks, targeted TypeScript transpilation and Git whitespace review now. Full E2E, ordinary precommit, and installed product proof stay separate. Evidence goes in this record on G:. Rollback by undoing this unit's hunks. This uses the existing deployment capability and changes no capability-map claim before delivery.


PARTIAL. The applied view reuses the existing disclosure with the byte-confirmed committed result. Eleven offline headless checks passed against the actual shared React component. The result exposes all four categories, shows exact bytes for the large catalog replacement, supports keyboard disclosure, unmounts closed details and sends zero requests. Preview, unconfirmed, failed, rolled-back, legacy and missing-effect cases remained truthful. Scoped TypeScript and existing spec syntax passed with zero diagnostics. The existing routed test now distinguishes the applied effects from the forecast using a different preserved path in the controlled response. Fresh-eyes review checked both consumers and the exact test selectors.

Source discovery kept all 150 case identities in order, with digest 8db68e00e2bba871df40e163fa75b0311e386bad4ea25c950630aadf5a907dac. It created no review output and preserved the existing last-run state. The offline render and discovery scratch roots retired on G:. Full routed execution, required precommit and installed delivery are pending. The exact script and cutover acceptance remain on #85.

AAR. The existing result already had the data, so the fix stayed in the shared view with no new requests. The first list-only probe called Playwright without its run-state owner and correctly refused. Using the existing isolated bootstrap and comparing titles without source coordinates established that registration and order were preserved. Keep the routed test's distinct apply payload so a preview could never satisfy the result assertion.
