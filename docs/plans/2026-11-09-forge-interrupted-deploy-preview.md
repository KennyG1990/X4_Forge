# Forge interrupted deploy comparison in preview

Status `VERIFIED` for the isolated preview API checkpoint under [issue #53](https://github.com/KennyG1990/X4_Forge/issues/53).

Dev starts clean at `5528cbaded89a31e5f1f1cfea495d6f3cbde5a3c`. The prior isolated replay proved recovery by one status lookup, one dry-run preview and a fresh apply. The agent had to compare the target binding and up to two saved fingerprints manually. The preview already fingerprints the exact current target and rechecks it before returning. The status helper already validates the prior receipt and recovery evidence after the owner exits. No existing preview classifies those values together.

Accept optional `inspectDeployOperationId` only on native dry-run requests with an authenticated deploy agent. Resolve the same actor and workspace scoped operation identity used by status. On successful preview, return `previousOperation` with the historical outcome and one observed target state. Verify target and format binding before comparing current bytes with saved evidence. Missing, inaccessible or unproven evidence yields `unavailable`. A valid retained record in another binding yields `binding-mismatch`. The same request on apply fails validation before staging, target, or receipt writes. Preserve the default preview response and duplicate refusal. Keep the original operation's history separate from what is visible now. No new endpoint, target scan or capability-map delta.

Validate each classification, mismatched target/format, wrong key, malformed/apply input, old receipt preservation, same-ID and stale apply refusal, and a fresh new guarded commit in isolated loopback. Run the focused oracle and normal headless precommit. Keep Dev, the frozen release candidate and installed evidence distinct. Rollback checkpoint `5528cba`.

## Implementation and evidence

Both native routes share the same handler. Opt-in preview uses the exact key and workspace operation identity, the existing durable status helper, and the target fingerprint and binding from the successful preview. The response contains only the requested operation ID, its historical outcome, and the comparison state. The normal source coordination claim still brackets the route. The regular operation header and duplicate guard keep their established behavior. No capability-map delta.

The focused receipt oracle passed 43/43, including all comparison states and an already committed receipt without current comparison evidence. The private `forge-53-preview-inspection.py` replay passed 62/62 on server SHA-256 `c1c5f6be4883e528ccf176d14e1638c058ac554d08f4ab5db0bb50ef573e5c77`, built from `5528cba` plus this exact server diff. Verdict `c53-o_3l0vj3/verdict.json` SHA-256 `84dbc2ee58d978efa40f52bdf9dad4e21efa219144d9939bc568f77290f1a486`. The source fixture, recovery record, and exact target were observed before and after owned backend turnover.

- Default preview omitted `previousOperation`. Both opt-in aliases returned `matches-staged` with historical `unknown`.
- Switching to catalog for the same target returned `binding-mismatch`. A different deploy key in the same workspace and a missing operation both returned `unavailable`.
- Studio credentials, malformed values and inspection on apply were refused. Both old operation aliases and a new apply with a stale target remained no-write refusals for staging, target and receipts.
- The fresh guarded apply committed exact v101, cleared the transaction sibling, and preserved the original receipt and recovery. Both owned processes, listeners, and discovery records retired.

Typecheck, durable writer and receipt coverage audits, and required headless precommit passed. The original status route remains available when preflight blocks a preview. This checkpoint proves the native API, with installed verification and historical outcome reconciliation still open. The 0.0.82 frozen tree retains its selected release scope. Rollback checkpoint `5528cba`.

## AAR

Sustain routing the comparison through the existing current-target check and testing wrong-key and wrong-format inputs independently. Fresh-eyes review clarified that the no-write guarantee applies to deployment, staging and receipts, and that a failed preflight has no comparison projection. The guide now names the status fallback. The remaining evidence gap is original-process completion after the activation cutpoint.
