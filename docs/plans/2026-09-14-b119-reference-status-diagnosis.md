# B119 reference-status timeout diagnosis

Task/lane: FULL read-only diagnostic; 2026-09-14 11:25Z.
Status: VERIFIED for trace localization; PARTIAL for causal diagnosis. Full B119 remains PARTIAL.

## Plan / baseline / reconcile

Bounded unit: inspect retained full-integration real-MENU first/retry traces and current
reference-status owners. No rerun, product edit, fixture alteration or timeout increase.
Acceptance: correlate request elapsed times, manifest state/generation and synchronous
source work; distinguish observations from hypotheses. Negative check: a completed index
does not establish that the parsed corpus is cheap, nor does a slow request identify CPU ownership.
Evidence: original ZIPs below and source readback. No new rendered/native gate applies to
this read-only diagnosis; previous product gates remain open. Rollback: documentation-only delta.

HEAD: 5b730a67774516d44b9fff4f4b640b4113ade9ac. Existing renderer/selftest/test changes and
unrelated dirty files preserved. The failed132-test run remains129pass/2fail/1flake.
References: full goal, SESSION-HANDOFF, full-integration and workspace-abort plans,
existing Graphify graph, capability map and ADR lookup. No capability-map delta.
Graphify located the extracted route in src/server/referenceRoutes.ts, not server.ts.
An Agent Brain recall found an older canonical-reference API task; its displayed initial
request concerns authoritative base/DLC data, not this timeout. It supplies no causal proof.

## Evidence

Archives, read directly with System.IO.Compression.ZipFile.OpenRead; JSON lines parsed
from 0-trace.trace and readiness attachments, without extraction or original writes:

- test-results/b119-full-integration-20260914/browser/x4-ui-source-editor-Source-e9f36-s-and-reopens-real-MENU-Lua-chromium/trace.zip
- test-results/b119-full-integration-20260914/browser/x4-ui-source-editor-Source-e9f36-s-and-reopens-real-MENU-Lua-chromium-retry1/trace.zip

Elapsed milliseconds from matched API before/after call IDs (not summed nested spans):

| Request | First attempt | Retry |
| --- | ---: | ---: |
| GET /api/reference/status | 549.904, HTTP200 | 3473.864, HTTP200 |
| GET /api/reference/manifest?limit=1 | 123.521, HTTP200 | 126.819, HTTP200 |
| GET /api/reference/status?refresh=1 | 10009.777, timeout10000 | 1743.473, HTTP200 |

Both readiness attachments report manifest state ready and generation
1789370598070-6ab128fc50 before forced refresh. First attempt starts07:38:19.205Z,
finishes07:38:29.899Z without consumed response. Its initial corpus generatedAt is
07:30:51.214Z. Retry starts07:38:48.086Z, finishes07:38:53.452Z; its initial corpus
generatedAt is07:38:49.255Z and consumed corpus generatedAt07:38:53.398Z, same generation.
The timestamps do not distinguish a delayed earlier request from work performed on retry.

Source chain inspected:

- referenceRoutes.ts:169 status handler calls load(req) before reading manifest status.
- load/forceRefresh passes true for refresh=1 to getReferenceCorpus.
- referenceCorpus.ts:486 bypasses both cache reuse branches on force=true, discovers files,
  computes stat signature, then synchronously builds all parsed canonical sets.
- discoverReferenceFiles:173 uses three manifest bulk reads (consumer, jobs path,
  AI-script domain), file existence checks, deduplication, sorting; signatureFor:235 stats files.
- buildCorpus:440 reads/parses localization, factions, wares, jobs, AI scripts, maps/macros
  and script properties, and sorts symbols. These operations run synchronously.
- referenceManifest.ts:319 pages at500 records through queryReferenceManifest.
- db.ts:484 queryReferenceFiles performs a count and bounded ordered page query on every
  page; a path substring query is among the discovery filters. This is inspected work,
  not measured proof that SQLite is the bottleneck.
- referenceManifest.ts:280 status reads existing generation/scan state, not a new scan.
- test fixture current line4904 retains10000ms; its comment calls this a lightweight
  corpus refresh, which is not evidence of measured cost.

Source SHA256 at11:25Z:

```text
referenceRoutes.ts 30BFEA00EE666711533257D762C9E920B64D437B5C7E9D875B3EA77468F0136C
referenceCorpus.ts E47AD2C8641ED0881B94FFB50C7E4F990014080CE2DF3A7A276412BD6E3492DD
referenceManifest.ts 809C2008B43B6A7F864BF27FA844967AF00F08B29795D9CDD56B0CB7EA21AEE4
db.ts 5C5117E4AAB0DE3C713795B2AA623A7BA866E23A9F4B71F2A60734FD29964119
x4-ui-source-editor.spec.ts B663C108C1D32D03F7D7F88A693FD655383E64AFFD530353DD2833B2AF0F23D9
```

## Review / close / AAR

[REPRODUCED] Historical request timeout and same-generation successful retry are evidenced.
[HYPOTHESIS] Most likely cost lies in synchronous refresh work and/or server scheduling;
rough working confidence75%, versus20% other concurrent process/IO pressure and5% transport
or test-client factors. These are judgment estimates, not measurements. Exact owner unknown.
No forced refresh can be declared repaired from the retry, and no browser trace here measures
server CPU. A fresh manifest scan is contradicted by ready state/same generation at request time.

Next bounded unit: plan isolated server-side phase timing/CPU observation around the existing
refresh owner; retain identical corpus, force semantics,10000ms deadline and test assertions.
Distinguish request admission, discovery/database work, stat signature and parsing; observe
negative paths and probe transparency before any live run. Reuse the guarded local harness;
no live service/config/index reuse or external output writes without authorization.

No implementation changes, no new E2E verdict, no commit/push/release/install/game or
external wiki/memory writes. Original workspace cancellation also remains causally unproven.
Acceptance: trace localization done/evidenced; backend owner deliberately unresolved.
Validation close: all five source hashes rechecked unchanged; tracked documentation
diff-check passed (only existing LF/CRLF conversion notices). Handoff/plan read back;
buildCorpus source locator corrected to440 during review. No executable validation run.
AAR triggered: oversized tool output and guessed nonexistent source paths wasted reads.
Sustain paired first/retry traces and exact generation identities. Improve by following
observed imports and projecting compact JSON fields rather than dumping raw traces.
Highest-risk evidenced weakness: blocking refresh cost is invisible in current client-only
evidence. Bounded next measurement above; do not substitute a timeout increase for diagnosis.
Degradation checkpoint called; source editing deferred to a fresh bounded pass.
Commit point: docs(b119): localize reference-status timeout (documentation checkpoint only;
Git commit not performed, normal precommit still required).
