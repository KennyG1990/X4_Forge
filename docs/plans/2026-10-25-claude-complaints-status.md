# Claude complaints — reconciled private Dev status, 2026-10-25

This is a scope ledger, not a claim that the public Forge contains these changes. C01 private fixes are integrated locally at d3eeb2e; C02-C04 are now verified locally. See docs/testing/claude-C01-integration.json and claude-C02-identities.json. Evidence below is private at `../lab/evidence/`. Private source is an archive with no Git metadata. Kimi remains paused. All game execution/experience proof remains separate.

| Original complaint | Current scope and evidence | What remains |
| --- | --- | --- |
| ui.xml treated as Lua/passthrough; lost imported registrations | VERIFIED private source-domain handling, preserved registrations/edits, malformed/missing registrations refused; ui-source-domain/verdict.json | Public release/installed verification; no claim all UI semantics are covered |
| Forge failure versus mod failure; misleading compile/deploy success | VERIFIED bounded API evidence classifications, compile/artifact truth and deploy UI outcome distinctions; compile-verdict, deploy-review-ui | Exhaustive failure-classification audit across every API remains broader than these proofs |
| Logged overrides, accepted findings | VERIFIED C03 warning-only exact-input reuse, original actor/reason plus per-deploy receipts, durable list/revoke controls; docs/testing/claude-C03-warning-reviews.json | All validation-source edits conservatively invalidate reviews; narrower dependency-aware reuse remains C05. No public/installed proof yet |
| Exact bytes, stale result, mod identity | VERIFIED snapshot-bound validate/deploy with stale refusal and workspace-mod guard; deploy-snapshot, client-isolation | No blanket claim every API response carries mod identity; other routes need contract census if this requirement is interpreted literally |
| Shared active workspace collisions | VERIFIED addressed workspaces, credential binding, paired CAS and wrong-mod deployment refusal; client-isolation | No raw source-folder editor lock; clients must select/provision their own workspace |
| Reference/property and listener false positives | VERIFIED specific property/literal and AST/XML listener cases; validation-noise | C04 proves immutable local registration aliases/simple forwarding wrappers; dynamic, reassigned and prefix cases explicitly incomplete. General MD expressions/arbitrary alias/wrapper/event semantics remain unverified; docs/testing/claude-C04-validation.json |
| AI-script handmade allowlist | Reported get_safe_pos case already passed current Forge and independent game XSD oracle; legal/invalid cases proved (import-aiscript) | Broad parity with the full XSD language/corpus is not established |
| Large Lua coverage and vanilla widget rules | Full large-file parse/tail-error and specific button text rule proved; lab summary, lua-button-text; coverage gaps explicit | Comprehensive Lua semantics and further vanilla helper traps remain open |
| Slow full validation | VERIFIED file-local Lua analysis caching with changed/dependent source parity; incremental-lua | XML/reference/project incremental validation and representative minute-scale latency benchmark remain open |
| Save-aware log, reload without keyboard, structured probes | Backend protocol and freshness gates VERIFIED with synthetic logs and Lua stubs; runtime-loop, log-freshness | Native X4 file/API capability, real save-load/reload completion, general read-only state probe, user experience proof. Companion concept is SPECIFIED only; no helper installed |
| Dead-path dependency health | VERIFIED private path diagnostics and installed API: dependency-health; exact failed path and setting, no false mod error | Parser/index/packed fallback and write-access health not certified by a readable-path result |
| Malformed import payloads returning200 | VERIFIED strict import request boundary; import-aiscript | Not a census of request validation on every endpoint |
| Stable node IDs | VERIFIED local C02: deterministic file-scoped MD IDs, conservative legacy layout/waypoint preservation, actual Load Project and fresh-byte scratch deploy; docs/testing/claude-C02-identities.json | Public package/installed verification; ambiguous or unanchored matches are not inferred |
| Engine-trap rules from gotchas | VERIFIED C04 qualified products? advisory grounded in prior station probe and loaded pseudo-warelist metadata, four prior rules retained | Complete gotcha dispositions: docs/testing/claude-C04-gotcha-matrix.md; runtime and unsupported semantics remain unverified, no fresh station/game proof |
| Usable public/installed release | Private Dev backend/frontend proved in bounded scopes | Integrate into Git, required release tests, native host/package verification and publish. Do not disturb Claude stable during private work |

Current highest user-priority remaining item is native game loop proof. It is deliberately not attempted while Claude owns the running game. C03 warning-only review reuse and bounded C04 validation are verified locally. Next is C05, followed by C06-C07 under the approved completion/release plan.

## Original complaint inventory

Consolidated from Claude's two pasted reviews, with repeated complaints merged. This is the
requested scope, not a completion claim:

1. Separate Forge/internal failures from mod failures; internal failures alone must not masquerade as mod errors.
2. Support exact, logged finding overrides with authenticated approver, reason and deployment record.
3. Ground checks in X4 schemas, script properties and vanilla code: transporttag, waretransport, property reads misread as ware IDs/names, get_safe_pos, and existing listeners.
4. Cover large Lua files and their tails honestly, expose unsupported analysis, and ground widget/helper rules in vanilla source.
5. Make deployment status truthful and useful instead of the repeated "DEPLOYED - NOT Forge-validated" warning.
6. Validate and deploy the exact same bytes in one workflow; refuse stale changes instead of shipping anyway.
7. Include mod identity/source hash in results and require expected identity at deployment.
8. Isolate client workspaces or provide explicit queryable source ownership/coordination.
9. Remember reviewed per-mod warnings; preserve actor/reason, distinguish new/known/resolved, invalidate changed evidence, and allow revocation.
10. Reload UI/refresh MD without keyboard or screen automation.
11. Provide save-aware log tails, reload/session markers and structured tagged probes.
12. Expose named read-only live-game state probes rather than inference from logs or raw commands.
13. Make health diagnostics identify missing dependencies and dead configured paths.
14. Reject malformed API/import requests instead of returning HTTP 200 with unusable results.
15. Keep imported node identities stable.
16. Validate incrementally with measured performance and full-run equivalence.
17. Add narrowly grounded MD engine-trap rules, including the reported station products? case after verifying its conditions.

Follow-up scope explicitly requested by Ken: complete ui.xml classification/validation/imported
registration preservation, and truthful compile/artifact success responses. These extend the
original validation and false-success complaints; they are not Kimi recommendations.
