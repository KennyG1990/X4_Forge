# Validation findings and diagnostic tools

**SPECIFIED · #33 and the existing Notion UI consolidation audit.** Keep one list of project findings and make it the first detailed content under the Validation summary. Move the existing local critic, Studio selftests and eligible AI handoff into one compact Diagnostic tools disclosure. Make repeated Package readiness navigation show Validation from any Diagnostics tab.

## Intent and scope

**Who** · Mod authors and QA agents who need to find the next diagnostic they can act on. **What** · One reachable finding list, one optional tools disclosure and one Diagnostics scope state. **Where** · The existing Diagnostics Validation tab and Package readiness entry. **When** · During continuous checks, across repeat tab selections, and while optional selftests run. **Why** · The current panel puts reference tools above the findings and maintains two competing selectors for the same Diagnostics scope.

Reuse the existing finding rows, counts, freshness, provenance, filters, pagination, source actions, Why and exact suppression. Keep the current first-canvas-error action, Find diagnostics focus shortcut, critic messages, selftests results and AI prompt content. Keep tools mounted when collapsed so a selftest finishes normally and its result remains available. Use the existing AI tier to gate the button and the current handoff event. Continue to label the critic and Studio selftests separately from full-project validation. Use App's existing scope state as the owner so Package readiness reopens Validation even after the user visits Install or Performance.

## Acceptance

At a narrow width, the actual Studio shows the first finding higher on the page and preserves the same result, counts and selection controls. Test keyboard Find diagnostics, opening and closing the tools, finishing a held selftest while collapsed, the preserved result summary, AI Off with zero provider dispatch, and the eligible handoff to the existing assistant. Reopen Validation repeatedly using the Package readiness button after both Install and Performance. Use a booted App with a pinned synthetic project and controlled requests in one temporary G: headless browser. Capture the current narrow layout under the existing screenshot record. No validator, writer, suppression, API schema or live setting changes. Required precommit and exact installed-host qualification remain release gates. Roll back only the layout, controlled scope flow, AI handoff eligibility and the paired regression.

## Close

**PARTIAL · Source rendered and exercised.** Baseline 408f254 put the first of three fixed findings 765 px below the scope control. The candidate places it 526 px below the same control at 900 × 700. It still starts below the fold at that height. Pressing Enter on Find diagnostics focuses search and exposes the first finding. The screenshot captures that interaction. The adjacent tab strip remains horizontally scrollable and can clip its first labels when scrolled.

The booted App preserved filter and clear behavior, opened Diagnostic tools by keyboard, retained progress and all 31 mocked selftest results, routed Package readiness back from both Install and Performance, refused the AI handoff in Off, and dispatched it once in Explain. The fixture hash held with zero external requests. Scoped Forge types passed for six files and the isolated browser state retired. Two existing full-backend scenarios were extended. No capability-map delta. Routine full-backend E2E, precommit and installed Antigravity remain open. Suggested commit title is `fix(ui): prioritize validation findings and preserve diagnostic tools`.

Evidence is `diagnostics_triage_layout` in the G order-completion receipt and `diagnostics-tools-900.png` in the existing G screenshots folder.

**AAR.** Replaying the real App exposed both competing selection state and an Off-mode handoff. The baseline harness needed an unsupported bundler option removed. The compact layout improves position but still requires a scroll at short height, for which the existing Find action was proven. The focused type harness picked up the repository Vite declarations on retry. No new artifact directories were needed.
