# X4 Forge — Known Bugs (active defects only)

**Rule:** this file contains only current, observed defects. Fixed items move to `ROADMAP.md`; rejected,
stale, non-defect, and recommendation material is removed rather than retained as an apparent bug.

## Active defects

---

## 🟡 FB-24 · Permanent `scriptproperty.unknown` / `reference.unknown_ware` false positives (restored — scoped out of B108, never fixed)

**Status:** these are Kimi's original FB-4 and FB-5. B108's bounded unit was FB-2/12/13/14/16/17/18/19/20/21
and part of FB-22; these two were never in scope, so they left this file with the rewrite rather than with a
repair. Re-filed because they are still observed.

**Observed:** every `validate_ws` run against `x4_ai_influence`, unchanged through 2026-07-29:

```
scriptPropertyWarnings: 4   referenceWarnings: 5
{"code":"scriptproperty.unknown","chain":"$pship2.cargo.free.all","segment":"all",
 "suggestions":["age","hull","null"]}
{"code":"reference.unknown_ware","kind":"ware","id":"name","suggestions":["ice","ore","water"]}
```

`cargo.free.all` works in-game and has for months. The `reference.unknown_ware` literal id is `name` — the
validator is reading a *variable* ware reference (`ware.{$var}`) as though `name` were a ware id.

**Nine false findings on every single run, permanently.** This is not noise-level annoyance; it is the
mechanism by which a real failure hid. The mod's `deploy.py` printed `RESULT: FIDELITY OK` over a deploy that
never happened, and the reason it went unnoticed for weeks is that the warnings block had been trained into
background texture. A permanent false positive is worse than no check.

**Fix:** R1's mod-local suppression manifest (declare known-good chains and dynamic-reference patterns with a
review date) is the root fix and is currently `OPEN` in the recommendations ledger. Modelling the two chains
directly is the narrow fix. Either makes zero warnings reachable, at which point a *new* warning is signal.

---

## ⚪ FB-25 · 0.0.58's deploy-target requirement is a breaking change for agent clients with no migration note

**Observed:** 2026-07-29, on the `x4_ai_influence` client.

B108 correctly made deploy identity explicit (`server.ts:10621-10629`): a request with neither `path` nor
`workspace` is rejected with `DEPLOY_TARGET_REQUIRED`, and one with both is `DEPLOY_TARGET_AMBIGUOUS`. **This
is the right fix** — it makes FB-12's wrong-mod deploy structurally impossible rather than merely detectable,
and the error codes are clear.

The defect is documentation, not behaviour. Every pre-0.0.58 agent client sends the old shape:

```python
post('/api/agent/deploy-verify', {'workspace': None, 'autoReimport': True})
```

`null` fails the `!!req.body?.workspace` test, so this is now a hard 400 at the first call, before any gate
runs. `AGENT-USING-THE-FORGE.md` carries no migration note, so the failure is discovered by reading
`server.ts` rather than by reading the docs. The mod client was broken for exactly this reason and diagnosed
only by source inspection.

**Fix:** a migration line in `AGENT-USING-THE-FORGE.md` naming the required shape
(`{"path": "<modFolderName>", "autoReimport": true}`, exactly one of `path`/`workspace`), and ideally a
`hint` field on the 400 body carrying the corrected request. The error already names the rule; it does not
name the fix.

---


Kimi K3's 2026-07-29 findings were reconciled under B108. The confirmed defects have been repaired in the
0.0.58 release and passed their local/installed/public-artifact gates. The late-discovered legacy discovery-token migration defect
was also repaired: the rebuilt packaged server scrubbed the real legacy profile, then installed Antigravity
published only public address metadata and served the live sidecar API. OpenVSX 0.0.58 is public and its
downloaded VSIX hash matches the installed/tested artifact. The clean Windows Quality workflow passed publicly in
run `30500157383` after the corrected dependency, hermetic fixture, bounded-history, and build-order gates.

The full finding-by-finding disposition, acceptance contract, implementation record, and current evidence are
in `docs/plans/2026-07-29-known-bugs-hardening-release.md`.
