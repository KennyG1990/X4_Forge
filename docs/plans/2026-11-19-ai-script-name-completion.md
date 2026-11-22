# Complete quoted AI-script call names

SPECIFIED under [#74](https://github.com/KennyG1990/X4_Forge/issues/74) on `4dbc4a9`. Work in the private Forge projection and native test profile. The authoring worktree contains unrelated edits to `referenceLanguage.ts`, the native extension and its fallback cursor parser. Integrate only the new completion hunks. Rollback is a focused revert. No write to a game, live mod, standing settings or production service.

The isolated baseline loses the attribute context at `<run_script name="'order.pa|'"/>` and has no call-name binding. X4 9.00 `aiscripts.xsd` declares expression-valued `name` for `run_script` and `run_interrupt_script`. `common.xsd` declares that attribute for `start_script`. The same corpus defines AI-script names with initial `!` or ASCII letter and subsequent letters, digits, underscores or dots. CodeSense 1.2.0 documents quoting inserted script names. Reuse the schema resolver, canonical catalog and request route. The committed product hosts source editing in the native IDE. No CodeMirror completion consumer exists at this revision.

Extend the existing completion response with an optional absolute UTF-16 replacement range. A valid static call-name value can be empty, partially typed, or already quoted. Replace its full single-line XML value, preserving the outer delimiter. Escape the expression quotes for a single-quoted XML attribute. A dynamic expression, neighboring attribute, unrelated element, comment, missing schema, or unsupported multi-line value must never get a catalog replacement. Preserve ordinary expression suggestions and all existing text edits. The native provider must discard canceled, stale or invalid replacement responses and apply a literal string for the new range. No change to route authority, corpus state, or old completion payloads.

Acceptance is an exact resulting XML line for empty, mid-token, existing closing quote, and single-quoted attribute cases. Verify current project names and provenance, canonical names including the initial `!`, and preservation of a nearby attribute. Use the existing reference language oracle, a real corpus API or source differential, matched CodeSense and Forge native completion probes where supported, and ordinary precommit. The installed release must exercise the same edit through the Antigravity provider. Keep reports in the private QA directory, update existing Notion and GitHub records, and retain the source and installed verdicts separately.

The first integration run passed the new script completion checks, then the pre-existing inline validation fixture returned HTTP 400. The fixture uses four `kind: 'xml'` values. The committed `parseValidationProject` admission allows `library` for these paths and rejects `xml`. Correct those four fixture kinds and retain every validation assertion and authored source byte. Report the rejected request code and detail on future failure. The product validator remains unchanged. Reuse the existing integration test and private server for the full replay.

## Verification

The reference language oracle passed 21/21. The actual X4 9.00 reference loader found 178 AI scripts. Four direct cases verified empty insertion, an exact middle-of-token replacement, interrupt completion, and escaped delimiters for an MD call. `r089-script-completion-source-proof.json` SHA-256 `c92b7abf528a89dbc680d130d0f5a69aaec7cdd02290fbe273303b11f98c60ab`.

`node scripts/reference-api-integration.mjs`, the `test:reference-api` command, passed 92/92 on a private backend in 111.031 seconds. It checked exact edits through the existing authenticated route, rejected a catalog replacement in a dynamic expression, and retained the addressed workspace's `Project.Test` spelling and provenance. All previous assertions passed. The private process tree retired and port 8973 was vacant. `r089-script-completion-api-a2.json` SHA-256 `ce8f6fd931a46f7aede51981e6064360ed1a6a0c59873b20e3276b8bbb7c0785`. The 80/92 first attempt is retained as `r089-script-completion-api-a1.json`.

The CodeSense 1.2.0 language server returned a quoted literal and full replacement span for the empty, partially typed and interrupt fixtures. It returned no matching item for the single-quoted MD value, project prefix or dynamic expression in this reduced six-case fixture. The comparator used four unmodified game schemas and one canonical script, and the scratch tree retired. `r089-codesense-quoted-completion.json` SHA-256 `74a108d2be56d7dc532b69fe0e237caaba31c466b5d85582964707300668aa31`. This is a language-server comparison. The native Forge witness uses the same applicable document bytes.

The modern completion response rejects late replies after a buffer change, cancellation, closure or backend/workspace change. Review traced an existing legacy fallback that can return after a delay without rechecking the document. This checkpoint adds editor spans on the modern route and leaves the legacy contract in its existing scope.

Native source build and Antigravity behavior VERIFIED. On the private desktop the real Forge provider matched three CodeSense LSP ranges and insertions. The editor accepted all four exact edits, including the single-quoted MD value, and one Undo restored each original buffer. The dynamic expression produced no target edit. A malformed range and a late response after an actual buffer edit were refused. The source sidecar, private port and Job retired. The input desktop remained unchanged. The retry reused the same controller, server and supervisor hashes after selecting the current editor before the injected edit. The first harness failure remains in `r089-quoted-native-source-proof.json`. Passing `r089-quoted-native-source-proof-a2.json` SHA-256 `cdb7113c49a7e37e8e8ef7eaaa011cc52089bfa260f98e1dac56f29f30bc29d7`. This verifies the native source build. Exact published-package installation and suggestion popup rendering have their own evidence.

No capability-map delta. The existing catalog, completion route and native provider gained a range-aware result. The most consequential risk was replacing only the word at the cursor and leaving a second quote or a stale suffix. Keep matching editor spans, exact applied text and Undo in the acceptance test. The first fixture used a script outside the bounded empty-result list and read project provenance from `documentation` instead of the existing `detail`. Both controls now follow the real suggestion contract. The legacy fallback freshness check remains a separate candidate under #74.

The first ordinary hook passed the writer and receipt inventories, then stopped at TS2345 because the new test fixture inferred `source` as `string`. Annotating the fixture with its existing `ReferenceLanguageResources` type fixed the compile. The root TypeScript command passed in 62.578 seconds and the 21 source checks passed again. The before and after TypeScript compile to byte-identical JavaScript under the same esbuild settings. `r089-completion-fixture-type-proof.json` SHA-256 `57748c84de3c00780b1af55662b7d891d9654e42f923268edd04b502abf85e03`. The native and HTTP proofs still apply to the same runtime behavior. Preserve the failed hook receipt and rerun the ordinary hook on the annotated source.

## Quoted AI order ID completion

Source baseline is 408f2542d4f6f91873417f2f6cb6cca52b6ef034. This candidate
completes literal create_order/@id values in AI and Mission Director scripts.
It draws IDs from the game and DLC index, saved declarations in the addressed
project, and the active AI buffer. The completion replaces the full quoted
value and skips dynamic expressions. An unsaved sibling editor is outside this
request's document snapshot.

PARTIAL. The unchanged baseline ran 25 checks, the candidate source ran 32,
and the rebuilt backend ran 34 against private fixtures. Focused language
(27), suggestions (6), and corpus (21) suites passed. With packaged CodeSense
1.2.0, all six selected edit cases matched. Installed extension verification
and GitHub delivery are pending.

All new Forge QA scratch checkouts, dependency installs and caches, package
staging, test profiles, logs, and retained evidence belong on G: under
Forge-QA. Override the child process temporary directories for QA runs and
retire completed scratch once its patch and compact proof are preserved.

## Unsaved sibling order declarations

SPECIFIED under #74. CodeSense 1.2.0 changed three caller completion results
from the saved sibling ID to the unsaved sibling ID, with no disk change.
Closing the sibling restored the saved ID. The preceding Forge candidate
reads only the addressed saved workspace and the active caller text.

Extend the current completion request and its existing Forge-side caller.
When editing a create_order ID, collect bounded, already-open AI XML files
from the caller's physical mod folder. Reuse the tab's workspace identity and
the existing editor text hover source-folder binding on the server. The
extension submits text only and the server does not open the submitted paths.
A request with a different active source must use only its own active text and
the canonical corpus. Standalone legacy requests keep their existing behavior.

Within the addressed source, sibling editor text replaces the equivalent
saved entry and the active caller takes precedence. A removed or malformed
order must never revive the saved ID. Report editor provenance. Discard late
results when a relevant tab, workspace, client, or request changes. Bound
paths, count and UTF-8 bytes; reject duplicate paths, invalid names and
non-Studio overlay submissions. No filesystem or project mutations.

Focused tests cover the old/new/close sequence, removed headers, path bounds,
context mismatches, existing AI name behavior, and exact quote/range edits.
A native API fixture must observe the same address and return ordinary
canonical suggestions when the submitted source differs. Installed-host
qualification remains separate. Work, temp files and retained evidence stay
under G:/Forge-QA. Rollback is the previous four-file order checkpoint.

PARTIAL for delivery. Isolated G: source passes 70 focused reference and
cursor checks and 44 actual HTTP checks. Three consecutive caller requests
saw the changed sibling ID, omitted the old ID and kept canonical IDs. The
next request without the sibling recovered the saved ID. Removing the
header suppressed it. Foreign or unaddressed roots cannot supply project
orders. Invalid and case-colliding paths refuse, and ordinary agent keys
retain the original completion route without editor overlay authority.
The private process, port and fixture retired.

Scoped TypeScript for the reference route and shared types passed. The
native extension bundled in memory. The installed editor is still required
for the open-tab lifecycle and delayed-response proof. No new watcher,
project writes, capability grant or directory setting was introduced.

Fresh-eyes review found that failed buffer capture once fell through to
the saved workspace. The provider now keeps canonical suggestions without
reviving saved sibling IDs in that case. The compiled replay passed 45
checks, including this fallback. The first compile fixture omitted the
manifest required by the validator fingerprint; the passing build used
Forge's normal layout. Both compile fixtures and the final bundles retired.
Scoped TypeScript, the writer audit and the current extension bundle passed.

### Capability inventory check

The combined capability audit reproduced one missing route-source entry.
Record the shared editor overlay parser in the source inventory. The route
scopes, capability descriptors and receipt rules remain byte-equivalent
as JSON values. The policy hash includes the source inventory, so it
changes with this entry. Re-run both normal auditors on the composition.

## Legacy completion result freshness in the assembled candidate

SPECIFIED under #74. The earlier bounded repair and its source proof already exist as the November 20 legacy-completion patch and receipt. Their exact hashes are recorded with the current G: order-completion evidence. The archived patch predates the current sibling order overlay. Integrate its cache and request guards without dropping that overlay or copying a parallel provider.

The current source returned stale items in eight controlled legacy waits, including edit, close, cancellation, workspace, client, token, backend and sibling-close transitions. Identical queries could carry cached items into a different backend handle. A held old response also replaced a newer backend's cached items. The fixture uses the actual extracted provider and cursor parser with controlled replies and no network requests.

Keep the existing three legacy paths, ranking, snippets, timeout and cache limits. Recheck document and observed backend context after each wait and preserve the captured sibling check in the modern and legacy paths. Do not couple local MD parameter-name suggestions to a remote backend change. The legacy cache stays with the backend handle that supplied the results. Switching the observed handle discards its earlier cache, and late replies cannot refill it. The same attached URL with no observed handle transition retains its existing TTL. Verify current results, both cache races, modern replacement ranges and dry fallback behavior, plus scoped extension TypeScript and bundle. The installed provider and full precommit remain release gates. Keep work on G:. Rollback is the scoped provider inverse.

PARTIAL delivery. The archived repair is integrated with the current editor order overlay. The actual composed provider and cursor parser passed 20 controlled checks. The eight stale legacy results stopped, identical queries could no longer reuse entries across observed backend handles, and a delayed old reply could no longer overwrite the active cache. The current legacy element, enum and attribute insertions kept their expected snippets and ranking. Modern literal ranges and sibling-driven invalidation still worked. Local MD completion continued across an unrelated backend change and discarded a changed document. The fixture performed zero network requests.

The existing cursor oracle passed 11/11. Extension TypeScript had zero diagnostics and the controller built in memory with stock bundle settings. The durable writer inventory and whitespace passed. The exact G: source and provider proof are under legacy_completion_freshness in the existing order-completion receipt. Full precommit and installed Antigravity proof are pending. No capability-map delta.

AAR. Reconciliation found a previously qualified approach that needed the new sibling guard when merged. Use the actual cursor parser in controlled provider tests so a stale synthetic context cannot mask a missing branch. The first type check lacked the G: copy of the Koffi type package. Using the same locked VS Code and Koffi type versions from their retained copy allowed the exact source check without a dependency install. The remaining attach limitation is the existing same-handle TTL when a new backend behind the same URL goes unobserved.

### Reject order suggestions after a sibling tab closes

**SPECIFIED.** Existing owner #74 and this plan's unsaved sibling order contract apply. Actual installed Antigravity loaded the exact private 0.0.90 VSIX (SHA-256 `3c950ed2b50a25060467bf7a631f9dd2fd61665a8b14595fa7d80319b0dc9c1b`). Removing the last clean AIScript tab left its TextDocument open with the same version. A held reply still supplied that sibling's completion. See the G: verification receipt `release_090_native_installed_tab_close_failure`. The prior installed gate remains failed.

Use the current editor's tab membership to select the existing physical XML document map only for order ID completion. Collect file-backed text tabs across all tab groups, including inactive tabs and the editable side of text diff tabs. Use the existing same-folder and Windows path identity rules. Deduplicate the same file across split views. Both request capture and the freshness check must use this membership. An empty editor overlay keeps the existing addressed saved-source behavior. Keep the caller text, server transport, byte limits, and shared MD navigation logic intact.

Replay a detached document that remains loaded after its last tab is removed. Hold a real completion reply, close the clean tab at the original version, and require the result to be withheld. A fresh request must omit that overlay and restore the saved ID while keeping the exact insertion range. Cover inactive and split tabs and reproduce the old result in a focused adapter. Retest real installed activation after repackaging. Use only disposable G: fixtures and no foreground desktop interaction. Rollback restores the prior order capture and check. No new service, permission, or game test is needed for this editor behavior.

**PARTIAL.** Source now captures only current text tab inputs for the order overlay and rechecks the same membership when the reply arrives. The installed 0.0.90 baseline still reproduces stale completion. The focused source baseline kept the old reply current. The repair passed 10 controls, strict extension TypeScript, and all 32 existing reference-language checks. It preserves the saved fallback and leaves the shared navigation collector intact. The exact installed replay needs a rebuilt package. No capability-map delta. Suggested commit title is `fix(editor): invalidate order completion after the last sibling tab closes`.

**AAR.** The old native witness waited for TextDocument disposal when the actual editor tab had closed. Checking tab membership directly exposed the defect. The focused source adapter now includes the ordinary Node Buffer global. Reuse the same held-reply control against the rebuilt package.
