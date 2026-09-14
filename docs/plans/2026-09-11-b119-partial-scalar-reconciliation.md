# B119 partial-menu scalar editing reconciliation

Date: 2026-09-11. Lane: FULL. Status: RECONCILED / NOT IMPLEMENTED.
Parent: canvas-first goal, real-menu journey7. This is a read-only design checkpoint, not an implementation authorization.

## Bounded product problem

The real source menu can expose known title/header geometry while unrelated runtime-built regions remain
unresolved. Those unrelated regions currently prevent all scalar editing. Goal intent requires supported
content to remain usable without inventing unknown content. Structural changes have different risks and
must retain the existing stricter gate.

## Verified current owners and evidence

- SourceEdits91C1B97A7980D98E8D5E1B1D4E2B0267BC82753833C6E6454C2C260B96F089D0.
- SourceEdits selftest55A472AF7CEA90B48DF1E0F1D3C8297B5163A16D265FE80995BEF1EFB20BA536.
- BuilderPresentationCDAF4EFADC5E932D9FEA1DB7A4AEFA6004EB00AF86E0AD35FCB6FA377049AB0A.
- Layout0770487808964873FC5304F2FC943C8103BDB4246A4E57835CBEDE973AA60270.
- Existing A4 HUB log/test-results receipt remains authoritative; no runtime check was run against Gibbs's moving parser.
- Historical log readback identifies nonapplied operations: title addTable674, expanded scaleY107,
  tab-strip addTable686, conditional setColWidthPercent687, unresolved addRow688,
  conditional createButton/setText691, unresolved scaleY695.
- Actual genuine HUB Lua674-680 contains title table, two column widths, a row, direct
  "AI INFLUENCE" text and direct "CLOSE" button text. Source is read-only and unchanged.
- Latest recorded source-derived HUB has9 geometric nodes/0editable, no positive preview samples.
  Title addTable is unresolved because tabOrder is runtime-dependent even though its numeric geometry is known.

## Reconciliation findings

1. scalarProgramIsActionable1688 requires a nonempty projected/partial stream with EVERY operation applied.
   Used by discovery7057/scalar apply8156 AND row-move8791/widget insertion8892. Never relax it globally.
2. editableEntry1564 separately requires static direct literal/type/source/bytes, an applied selected operation,
   exact target context, and no localExpansion. These are existing local safeguards, not yet proof that
   all partial-program scalar edits are safe.
3. Complete owner-issued call/evidence correspondence1454 is checked in discovery and scalar apply.
   Existing source CAS/byteLocality prove only one literal splice; encodeX4UiSourceEditReplacement owns spelling.
4. Scalar reparse7475 reruns complete source, reselects the target, reprojects with issued authorities,
   finds exactly one same-order applied operation, checks exact reparsed literal/value/fields, and requires
   rediscovery. No whole before/after scalar call/record/operation correspondence checker was found within
   this owner; the exported structural comparator4852/5794 accepts structural entries only.
5. NEW coupling: reprojectX4UiLayoutProgramWithIssuedColorAuthority1546 explicitly replays canonical
   corpus/color but OMITS preview samples and preview paths. A partial scalar path must not silently
   claim those scenario inputs survived a source-identity change. Sample/path remapping is a separate
   authority design, not a convenience cast or blind ID copy.
6. BuilderPresentation sourceEntriesForX4UiBuilderNode994 maps exact operation IDs and already retains
   partial hierarchy/known Scene geometry. There is no evidence that a second inspector/renderer is needed.
7. Old selftests4153 and4365 intentionally assert whole partial-stream refusal, including an applied frame
   next to unresolved content and a literal text next to conditional display. Any extension must explicitly
   replace that blanket expectation with selected-owner acceptance plus preservation of unknown/conditional/
   rejected/unreachable entry refusal. Do not delete the old fixtures.
8. Catalog structuralEntries are currently reached only after the shared gate. Merely changing the early
   return could expose delete/replace/insert actions even if row/widget apply guards remain intact.
   A scalar-only extension must preserve the whole previous structural discovery/apply boundary.
9. NEW recorded real-HUB backstep: nonapplied operation order is addTable674/modelOrder426 followed by
   expanded scaleY107/modelOrder18 (localExpansion present), then direct addTable686/modelOrder447.
   Parent bounded log extraction asserted this backstep. orderedCallLedger1433 requires source calls
   sorted by order; modelMatchesEvidenceAuthority1467 rejects any indexedCall.index <= previousCallIndex.
   Thus relaxing the first gate alone is predicted to hit a second provenance refusal. The observed
   backstep is reproduced from the saved actual HUB log; the second refusal is source-inspected, not
   directly exercised through a modified public API. Do not bypass/reorder/drop expanded evidence.
10. The owner-issued Layout record815 privately retains canonicalCorpus/color plus complete model snapshot.
    No existing public canonical-corpus-presence guard was found in the searched Layout/SourceEdits owner.
    Existing no-corpus partial-program negatives must remain; source pins or generic pair issuance alone
    must not be mislabeled as loader-issued canonical corpus proof for newly enabled mixed-stream edits.
11. Correction from current source re-read: local-expansion limits are in program.profile, and scalar
    reparse copies that profile into reprojection. The earlier claim that these options are omitted was
    not established. Verify exact expanded replay before adding any mechanism. Samples/paths/loops really
    are omitted from the existing reprojection call and need explicit preservation or refusal semantics.

Implementation contract now SPECIFIED in docs/plans/2026-09-11-b119-partial-scalar-editing.md.
It retains the full real-menu requirement; first worker checkpoint is fail-first only, before production writes.

Design restraint: absence of a generalized scalar comparator is not itself an evidenced bug. Exact typed
literal encoding, full byteLocality/CAS, complete reparse and existing issued-model/evidence validation
may establish the required invariant without another comparison framework. Evaluate that smaller reuse
against causal before/after tests; add a production comparator only for a demonstrated missing contract.

## Next required acceptance design

Before a SourceEdits writer is dispatched:
- Prove one exact direct title/text edit on an issued applied operation in unchanged genuine HUB source
  with no manually fabricated samples. If not applied, name the real missing owner evidence first.
- Define scalar-specific before/after source/call/record/operation correspondence proof using existing
  literal/CAS/reparse/evidence owners where sufficient. Do not cast scalar into structural intent or
  create a parallel comparator merely because one was not found. Include direct plus expanded operations.
- Preserve complete source bytes outside one literal, nonselected files, opaque/runtime regions,
  call/record ordering, ownership/context, and refusal identity. Geometry changed by the requested
  property is allowed; unrelated source changes or falsely promoted unknown facts are not.
- Make discovery and apply consistent, keep structural catalogs/actions locked on previously refused streams,
  and retain exact issued authority, stale CAS, forged/accessor, aliased/local-expanded and no-corpus negatives.
- Verify same-value/no-op and variable-length/escaped-string edits, post-edit reselection, and usable
  fresh preview. Never treat successful source mutation with vanished target geometry as visual success.
- Define explicit handling for preexisting sample/path-dependent previews. Do not erase a scenario invisibly.
- Then validate pure SourceEdits/Session/BuilderPresentation plus complete UI editing and undo/reopen journey
  after fresh machine clearance. Source-only success cannot close journey7.

## Close / AAR

Status: PARTIAL reconnaissance. No implementation or positive capability-map delta.
No product/parser/Layout/SourceEdits/UI/protected/Git/external writes in this work; this local record only.
ADR-F1/F2/F5 remain in force: byte-local CAS, barrier reduction, immutable workspace identity.
Graphify returned only a nearby selection-intent node, so current source reads govern this reconciliation.
Sustain: separate per-value proof from whole-stream structural safety.
Improve: early-return changes can accidentally expose structural actions; sample replay was another coupling.
Highest-risk evidenced weakness: source-identity changes intentionally drop preview scenarios in the current
reprojection API. Scope and prove that behavior before claiming general imported-menu editing.
Further source-inspected blocker: execution-order expanded operations do not satisfy the existing monotonic
raw-call order guard. Future design must validate both ledgers against their actual owner, not force one
order onto the other. This changes the next unit's scope; a one-line early-gate patch is not ready.
