# B35 — Searchable virtualized node catalog

This execution record is the first buildable slice of
`2026-07-14-product-loop-next-level-implementation.md`, which was documented before implementation.

## PLAN

- **Lane:** FULL.
- **Bounded unit:** replace the NODES sidebar's eager schema render with one shared ranked/searchable
  catalog and a bounded windowed DOM; reuse the catalog in Canvas quick-add.
- **Assumptions:** the loaded schema remains authoritative; B21's live corpus census is the measured
  default order; eight observed child elements are not legal standalone curated actions.
- **In scope:** Curated/All, intent aliases, favorites, recents, existing type filters, full-schema
  search, virtualization, Canvas catalog parity, deterministic selftest and e2e coverage.
- **Out of scope:** changing XSD classification, compiler behavior, deployment, game/mod/config writes,
  Git mutation, and the later B36–B40 slices.
- **Risks/authorization:** a misleading curated list or a search-only regression could hide valid nodes;
  local preference corruption must not block authoring. No external side effect is authorized or needed.
- **Rollback/checkpoint:** HEAD `8050e03`; remove the new catalog/toolbox modules and restore Sidebar's
  prior list plus Canvas's prior starter-tag filter. Existing dirty B34 work is preserved.
- **Acceptance:** curated ranking is deterministic; all schema nodes remain discoverable; mounted rows
  remain bounded in Curated and All; alias search inserts the intended node; structural child tags are
  absent from Curated but available through All/search; favorites/recents work; empty and corrupt-state
  paths fail soft; typecheck, runtime sweep, full e2e, and real rendered browser inspection pass.
- **Evidence:** selftest endpoint/oracle sweep output; Playwright report; rendered DOM/screenshot; this
  record, `BACKLOG.md`, `ROADMAP.md`, and `SESSION-HANDOFF.md`.

## BASELINE

- **Revision:** `8050e03`.
- **Existing changes:** B34 UI compiler truth/parity work and its docs were already dirty; B35 does not
  claim or revert them. See session-start `git status` in `SESSION-HANDOFF.md`.
- **Runtime:** dev server on `:3000/:3001`; authenticated workspace `Player_Elite_Escort`, 3 nodes,
  2 links, 3 UI widgets. The prior NODES sidebar eagerly mapped the complete loaded vocabulary.
- **Checkpoint:** read-only HEAD plus the captured pre-task status/diff; no migration or persistent
  workspace mutation is required.

## RECONCILE

- **Resources searched:** `Sidebar.tsx` toolbox renderer, `Canvas.tsx` quick-add palette,
  `mdFriendlyNames.ts` starter set, `xsdParser.ts` classification, `schemaTypes.ts` template conversion,
  B21 action-census endpoint/corpus, e2e harness, graphify relationships, capability map and ADR ledger.
- **Existing capability reused:** schema templates, node insertion callback, type filters, starter tags,
  e2e ephemeral workspace, runtime selftest registry.
- **Couplings checked:** Sidebar and Canvas catalog semantics; census tags and schema templates; user
  preferences and render state; catalog result count and windowed DOM.
- **Presence/absence:** full vocabulary and starter curation existed; search, intent aliases,
  favorites/recents, shared ranking, and DOM virtualization did not. The corpus top 52 contained eight
  structural children, so they are excluded only from Curated pending the later schema-category fix.
- **Capability-map delta:** pending close; B35 strengthens node-discovery UX but adds no compiler/domain
  capability.
- **Plan change:** the initial top-52 proposal was corrected to top-52 standalone actions after
  reconciliation exposed structural children. They remain available in All/search.

## IMPLEMENT

- Added `src/lib/nodeToolbox.ts` as the shared pure catalog/ranking/preference seam and selftest.
- Added `src/components/VirtualizedNodeToolbox.tsx` with a fixed-height window, Curated/All,
  aliases, favorites, recents, type filtering, and fail-soft preferences.
- Replaced Sidebar's eager map and routed Canvas quick-add through the same catalog.
- Added the runtime selftest registration and focused e2e acceptance coverage.
- **Scope changes:** only the structural-child correction above; no external or unrelated mutation.

## VALIDATE

- `npm run typecheck` -> PASS.
- `GET /api/agent/node-toolbox-selftest` -> PASS 13/13.
- `node scripts/oracle-sweep.mjs` -> PASS 78/78.
- Focused e2e -> first run FAILED 1/2 because the test named a non-schema fixture; corrected against the
  authenticated schema library, rerun PASS 2/2.
- Full `npm run test:e2e` -> PASS 14/14, verdict parser PASS.
- Real rendered browser inspection -> PASS: Curated 66 results / 8 mounted rows; All 1,217 results /
  8 mounted rows; `money` exposed Reward Player; structural `param` searchable in All and absent from
  empty-query Curated; layout remained usable. No live graph mutation was needed.
- Negative paths -> corrupt preference and empty results PASS in selftest/e2e; exact search outranks fuzzy
  favorite pinned by the 14th oracle after fresh-eyes review found the weighting defect.
- `npm run build` -> PASS (1,793 modules; production server bundle emitted; existing chunk-size warning).
- `npm run precommit:check` -> PASS; `git diff --check` -> PASS.
- Live workspace post-e2e -> unchanged `Player_Elite_Escort`, 3 nodes / 2 links / 3 widgets.
- `graphify update .` -> PASS: 1,533 nodes / 3,549 edges / 85 communities.

## REVIEW

- Shared Sidebar/Canvas catalog -> done and evidenced.
- Curated/All, aliases, favorites, recents, type filters -> done and evidenced.
- Full-schema discoverability + bounded DOM -> done and evidenced in browser/e2e.
- Structural-child treatment -> done at B35's UX boundary; root XSD classification deliberately deferred
  to the existing B10 rider.
- Failure paths -> done and evidenced.
- Fresh-eyes finding -> preference weighting could outrank exact search; corrected so relevance owns
  non-overlapping score bands and pinned by oracle.
- Unrelated churn -> none claimed; B34's pre-existing overlapping files remain preserved.

## CLOSE

- **Status:** VERIFIED.
- **Remaining risk:** the schema classifier still calls structural children actions upstream; B35 excludes
  the eight reproduced tags from Curated but does not replace B10's schema-layer root fix.
- **Suggested commit title:** `B35: replace eager schema toolbox with ranked virtualized catalog`.

## AAR

- **Triggers:** reconciliation corrected the proposed top-52 contents; fresh-eyes review forced a ranking
  correction; first focused e2e failed because a synthetic friendly-name example was mistaken for a real
  schema template.
- **Sustain:** measure defaults from the real corpus and reuse schema/template ownership.
- **Improve work/approach:** verify semantic legality before turning frequency into user-facing curation.
- **Improve tools:** the census currently conflates structural children and standalone actions; tests need
  schema-backed fixtures rather than names that merely pass the humanizer.
- **Highest-risk evidenced weakness:** XSD classification can promote child elements into action-facing
  tools; B35 contains the symptom, while B10's structural-category rider remains the bounded root fix.
- **Lessons banked:** project and global AAR ledgers updated at close.
