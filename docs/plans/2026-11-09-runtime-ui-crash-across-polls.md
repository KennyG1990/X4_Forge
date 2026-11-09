# Group X4 UI crash evidence across debugger polls

**VERIFIED in isolated Dev · Full lane.** [Owner issue #52](https://github.com/KennyG1990/X4_Forge/issues/52) · [Contiguous-log checkpoint](2026-11-09-runtime-ui-crash-attribution.md).

## Baseline and reconciliation

Isolated Dev starts clean at `fc6a6c3785ee5dd92e9f17f4dcc63e94fb194449`. The addressed adapter receives complete lines only from each new durable ingest. A complete widget line can be published before the traceback and reload arrive. Its cursor already passed that line when the next request runs. The existing partial-line remainder solves missing newline bytes only. Agent-Brain matched older project context. The legacy recent-tail projection already parses the contiguous lines together.

## Acceptance

- Reuse the shared parser to identify an open widget group at the end of an addressed batch. Present a pending span in coverage without counting a durable occurrence. Keep the cursor at the exact next unread byte. Persist one bounded same-segment byte span, physical line positions and digest with the existing cursor and incident write. Reopen and verify only that span using the existing read seam. Persist metadata only.
- Finish one normal incident when an adjacent traceback and reload arrive, across repeated polls and a backend restart. Preserve physical file ownership and exact source coordinates. A separator, another widget, lifecycle boundary, truncated line, rotation, path switch, deploy baseline or bound closes or clears the old span. A bad re-read loses the span and degrades coverage. An orphan, mixed owner or unrelated later fault cannot borrow attribution. Confirm ordinary diagnostics, line counters, lifecycle and Lua boot behavior stay accurate.
- Reproduce current HTTP behavior using a standalone scratch mod and exact native deploy. Verify the candidate through the addressed debugger and compatibility watcher. Cross-check the legacy tail, clean polls, complete and partial physical lines, restart and rejection controls. Run parser, session and adapter oracles, freshness/boot regression, TypeScript, writer/receipt/capability audits and normal headless precommit.
- No route, game behavior, new state directory or automatic live action. Rollback is the bounded source delta at `fc6a6c3`. Installed verification, menu-only attribution and the exact in-game trace remain separate.

Fresh-eyes review added two same-file rewrite controls. A finalized crash must reverify the combined physical group if the bytes change between the initial tail read and the pending-span read. When a pending span is lost while an adjacent physical line is incomplete, discard the cached partial bytes too. A later newline cannot turn those stale bytes into an orphan or a lifecycle signal.

## Baseline evidence

The exact pre-change backend `591b24560652b08f7d1636898038661f0fc1da736e2fc15b69572b1855b3144b` passed 62 reproduction checks. Three requests appended 145, 109 and 116 bytes to the same log and retained the native deploy receipt. The addressed debugger and watcher returned three records, an unowned widget error, an isolated attributed Lua frame, and an unowned reload. The legacy tail read the full physical block and grouped it. Private `forge-52-crosspoll-http-4ya0uky_/verdict.json` SHA-256 `d8976b4c7077492d806c874390138866a3c472a3d30523eb0693a54fe76f13e6`.

## Results

- Exact final candidate `163f55f0ab6d0a6125b6c783b1d1426867405c51d2264e820ea6d4bacacff60e` passed 94 isolated HTTP checks. The pending physical range grew from lines 4–5 to lines 4–7. The persisted six-field span reopened after the backend restart. An idle poll reported zero new bytes. The final append produced one confirmed crash at `ui/fixture.lua:2` in the addressed debugger, compatibility watcher and legacy tail. Native receipt and installed scratch bytes stayed exact.
- The same replay covered a reload that completed by appending only CRLF, an altered same-file span, an intervening engine record and log rotation. The altered span degraded coverage. The remaining negative paths did not stitch an old owner to a later reload. Both owned processes, ports and discovery records retired.
- Session-store tests exercised both within-read rewrite races and exact reread rollback. A joined incident checks the combined byte range before it publishes. Prior-span loss also drops cached bytes from its adjacent incomplete line. The parser still processes new physical lines independently. The optional span uses the existing atomic cursor write. Policy 5 reanalyzes retained derived data.
- Parser 61/61, view model 15/15, session store 53/53, adapter 48/48, and log freshness and Lua boot 33/33 passed. TypeScript, writer, receipt coverage, capability and diff checks passed. The normal precommit log is `forge-52-split-commit.log` in private QA.

Private final `forge-52-crosspoll-http-0ue11b2h/verdict.json` SHA-256 `69a3d86453634e05b76708ecad74f3e4b3f4b4fc55684585bd5f8e5d71bc5998`. This updates the existing runtime debugger's coverage behavior within the same route and writer. Installed and in-game proof, full release gates and menu-only ownership remain separate. The earlier reader rejects the new optional persisted field while a span is open. A rollback that restores the previous source must use the pre-change state checkpoint or a distinct profile for that reader.

## AAR

Preserve the exact native deploy and compare the legacy tail with the addressed cursor on each poll. The first extended replay used escaped CRLF instead of physical bytes. The corrected harness proves exact CRLF completion and source rewrite separately. The adapter test now checks the full stored byte extent, while its public line fields retain their occurrence semantics. Two focused assertions needed explicit discriminant comparisons for TypeScript, and their reviewed fixture writer fingerprint was updated. Fresh-eyes review found the mixed-generation and stale partial races after the first green replay. The final store oracle injects both before the last exact HTTP run.
