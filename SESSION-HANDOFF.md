# SESSION HANDOFF — X4 Forge

> Written by the outgoing agent at every commit point / session close. The incoming agent reads
> BACKLOG.md + THIS FILE before anything else — it transfers the WORKING STATE the Agent Brain
> and ROADMAP can't: hot files, live hazards, dead theories, the next unit's first command.
> Overwrite it each close; history lives in ROADMAP, not here.

## Handoff 2026-07-10 (continuation of the marathon session; board fully green)

**One-line state:** EVERY engineering item ✅ — audits, backlog B1–B7/B13guard/B15/B16, e2e suite
**11/11 in 32.5s**, B15 root-caused (B1 adoption poll vs POST-only e2e isolation) and fixed in both canvas
specs. Open: B2 slices 2–3, B13 remainder QoL, release track (B8/B9, Ken's call), depth items (B10–B14).

**Hot working set:** tests/e2e/canvas-interactions.spec.ts + canvas-coverage.spec.ts (the canonical
seeded-harness pattern: POST isolation + GET isolation with startGetIsolation AFTER the seed captures the
true server `original`, stopGetIsolation before teardown verify — reuse, don't reinvent);
server.ts (CAS ~2995-3030, job API ~7285s); App.tsx (poll/badge ~815-880, preset guard ~1200);
src/components/PropertiesInspector.tsx.

**Live hazards:**
- Sandbox bash mount of X4_Forge is STALE (reads AND greps lie) — host Read/Grep + the run_command JOB API
  (`POST /api/run_command/job`, poll `GET /api/run_command/job/:id`) are truth. Job API for anything >5s.
- Chrome console-reader MCP serves stale buffers — trap console in-page instead.
- Ken uses the machine + app while agents work (OPERATOR PROTOCOL rule 2: ask; freeze state-touching work
  if he's live). His canvas is HIS — never restore/replace without asking.
- Any NEW seeded-canvas e2e spec MUST use the isolation pattern above or the B1 poll will clobber it.

**Dead theories:** "lossy compiler" (wrong — stale-state class, fixed by monotonic version + source-sync
gate + CAS); "canvas-interactions red = environment/load" (disproven on quiet machine); "spec passed in
run 1" (log-truncation inference error — when counts don't reconcile, the missing item is the lead).

**Next unit, first command:** B2 slice 2 — client sends `expectedHead` on the 300ms sync
(App.tsx syncLocalEditsToServer ~750) and wires 409 `head_conflict` into the B1 badge as explicit
Adopt-server / Keep-mine(force) UI. Ask Ken's go first: App.tsx edits hot-reload his live page.
Then B2 slice 3 (per-mod server keying). Release track (B8/B9) when Ken calls it.

**Ken-gated:** commit (titles in ROADMAP, latest: "B15 root cause + e2e isolation + B5 flip — suite 11/11");
release-track timing decision.
