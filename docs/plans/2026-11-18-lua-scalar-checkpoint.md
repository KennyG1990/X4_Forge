# Lua Unicode scalar development checkpoint

Task: deliver the existing #61 surrogate-escape repair as a coherent development source commit.
Lane: FULL. Status: VERIFIED source/compiler; PARTIAL delivery (2026-11-18).

## PLAN

- Bounded unit: reject active quoted `\u{...}` escapes in D800-DFFF, preserve valid Unicode scalars, escaped backslash parity, raw strings/comments, existing upstream errors, callback/AST/options/deferred behavior and positioned earliest-profile errors.
- Reuse existing shared `parseX4Lua` and grammar fixture. Select only frozen two-file patch `2fe5c636aaf58bd08e774758c2cace927ef45d9e46d2516fb9011949a835221f`. Later Unicode identifier/BOM and cross-consumer working changes stay outside this checkpoint.
- References: existing #61 plan `2026-11-13-ailive-codesense-comparison.md`, its pinned LuaJIT 2.1 lexer reference, the existing compile-only engine witness and historical source/native receipts. Existing capability map already records the bounded rule; no capability-map delta from committing it.
- Scope: `src/lib/x4LuaParser.ts`, `scripts/lua-grammar.selftest.ts`, this record. No dependency, endpoint, UI, schema, version, packaging, installed product or project-check policy change.
- Risks: over-rejecting literal/backslash/raw-string forms, incorrect UTF-16 positions, changing error precedence or capturing unrelated dirty hunks. Recovery: exact selected patch inverse on the owned source projection, preserve all actual working bytes, review a separate revert if a committed repair needs reversal.
- Acceptance: fresh same-input selected grammar matrix reproduces58/72 before and passes72/72 after; actual compile-only LuaJIT 2.1 agrees on all21 Unicode fixtures; strict parser typing includes the repository's existing declaration; exact source/protected state and patch inversion pass. Ordinary unchanged real-index precommit hook must pass on the selected tree, followed by nonforce commit/push and actual remote/origin/main/HEAD equality.
- Negative paths: range boundaries and padding, odd/even slash runs, bare string argument, raw/comment exclusion, escaped quote/newlines, malformed upstream input, deferred buffer, source options and local-limit-versus-surrogate ordering. Duplicate patch application must refuse.
- Evidence: one finite qualification/ordinary-hook/retirement receipt plus push receipt under the existing November08 QA directory; source evidence and non-clean failures retained. Reuse the previously qualified selected-tree runner from retirement receipt6f1f9efa; no new persistent helper, installation into donors or backup tree.
- Validation applicability: source/static, actual offline compiler, focused integration already included by shared grammar consumers, ordinary precommit/hook and Git/owned-cleanup checks. Native eight-route and game-witness proof retain historical scope. Installed/rendered/current AiLive/public delivery and full engine/project equivalence remain PARTIAL, outside this development commit. No browser/computer use, game operation or live service request.

## BASELINE

HEAD/origin/main `fc47a18fc3da5d4c329f0fc38d7050aeb41ac10a`, detached; index empty. That commit contains the active-local repair. Real parser/grammar working files include later changes and must remain byte-identical during selected staging/testing.

Selected preimages: parser `0f14440f53ceb0e3869a9f8630a4a304e8a55b3203d26372502b8109da9316ca`, grammar `4a678ba9cb75f38245b1a6e0784dfce9becec47437eeb486a48c0872b01aa984`. Postimages: parser `4dbb72a8b251e122bf999077482d020466ae79a6f93bb75b551363bc7433a36c`, grammar `788841866bd125c165e846583db92d354525da038dfa6d41fef292a257845d26`.

User authorizes serial isolated headless work while live development is active; no new quiet-window question. Private Dev native/process/membership/files are observed afresh before execution. Preserve live Forge/IDE/CodeSense/AiLive/game/saves/config/credentials. No fixed memory/CPU floor; existing heaps, serial execution, Windows Job retirement and owned paths remain enforced. Required Quality44264576002 fails unchanged dependency audit#120, so release NOT_READY independently of this source checkpoint.

## RECONCILE

Exact in-memory admission against current HEAD matches both postimages. One shared parser already owns the relevant consumers; no duplicate lexer or Lua execution path. Existing callbacks provide raw literal text and requested locations/ranges. The patch changes only deterministic profile checking after upstream parsing. Raw strings/comments remain outside the rule. Upstream parse failure can precede a collected profile error; positionless calls retain callback-observed ordering. These are existing declared boundaries, not full compiler parity.

Independent source review found no blocking defect and confirmed upstream callback, raw-text and deferred parsing semantics. Historical receipt37fc3b02 proves58/72->72/72 plus21 compiler cases and native receiptcc2f29a3 proves eight routes on its own composed backend; neither replaces fresh current-head source/hook qualification. No capability-map delta or new external side effect. Source publication is separate from a versioned marketplace release.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE

The exact HEAD-plus-two-file projection passed fresh source qualification. Context `forge-1118-lua-scalar-product-25b9ef7c42/qualified-context.json` SHA256 `3d28e4f66bf31b06fc53cad8ad0b033a5e67ccd5cf2d2aeaf6b1856fab566bb0` retains actual commands, outputs, same-input compiler data and source/private/donor/native/Git pins. Final receipt name is `forge-1118-lua-scalar-product-retirement.json`; commit/hook/push outcomes remain separate facts recorded by that receipt and the owning issue.

- The same72-case suite reproduced exactly the14 historical baseline failures (58/72); the selected candidate passed72/72, preserving all48 preceding local-limit/cdata/callback/corpus controls.
- Actual pinned LuaJIT 2.1 matched all21 original expected outcomes, using byte-identical1,045-byte fixture JSON SHA256 `8782eb0b91b4dbb9c4c7a90204c437cbf6ef804b9bf4c28203a66c8a6c95bec6`. No returned fixture function ran and no compiler/runtime was copied.
- Strict parser typing included existing `src/types/luaparse.d.ts` and passed. All four serial Jobs emptied. Exact source inventory, duplicate-application refusal, patch inversion, actual working/private/donor/native/Git guards passed.
- Final private index admission matched all1,117 stage-zero modes/blob IDs to HEAD plus exactly the two selected files, then pinned the metadata after its last private Git command. Private Git metadata is parked before the real hook.
- Fresh independent source review and narrow runner review passed after the corrections below. Source semantics remain the existing reviewed patch.

The final commit is admitted only through the unchanged ordinary real-index precommit hook on this qualified tree; no alternate index, bypass, version or release mutation. All bounded source/compiler requirements are evidenced. Whole#61, installed/current-project/public delivery and required dependency CI remain PARTIAL/open. No capability-map delta or runtime-performance claim. Commit point: `fix(validation): reject LuaJIT surrogate escapes`.

## AAR

NON_CLEAN. An exact replacement-count guard stopped preparation before any write. Fresh review then caught three runner-only errors before execution: a stale base-file count, Python local/global shadowing and treating owned fixture bytes as surviving external donor files. Dynamic full-map admission, the existing global metadata binding and separate owned-fixture pins corrected those errors. The first actual source qualification then passed all four declared Jobs without further source changes. Sustain independent review, original fixtures and qualified recipe reuse. Improve by separating owned data from donor data and deriving tree cardinality from the frozen base. Highest evidenced risk remains the mixed uncommitted parser/test tree; select exact patch blobs and preserve later working bytes. Temporary runner/data belong only to the owned QA root and must retire with full evidence. No Codex memory or new skill write.
