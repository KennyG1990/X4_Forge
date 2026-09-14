# B119 E2E output-isolation audit

Lane: FULL. Status: PARTIAL; read-only source audit completed within the boundary below.
Checkpoint: 2026-09-13T22:36:22Z. Full integration remains FAILED/safety-paused.
No code/test repair, test execution, image restoration, cache opening, or Git mutation.

## PLAN / BASELINE

- Bounded unit: enumerate direct E2E filesystem writers, trace their destinations and
  showcase consumers, and reconcile the shared SQLite path before requesting the repair.
- Authority: full goal, original brief, approved canvas-first plan, and the safety pause in
  `2026-09-13-b119-full-integration-gate.md`. This audit does not narrow any product gate.
- Acceptance: distinguish per-test artifacts, owned temporary fixtures, fixed repository
  outputs, external task outputs, and server cache writes; preserve existing files.
- Scope: read-only source/metadata/hash checks; changes only to local audit/close records.
  No test collection via Playwright: the marketing spec has a module-level mkdir.
- Baseline: main/HEAD `93c9af111d63ca77c99dee11f21882c4073bcda6`; existing dirty/untracked
  work remains user-owned. The marketing spec is pre-existing untracked work.
- Rollback: no executable changes to reverse; any correction is to these local records only.
- Validation: source AST inventory, destination/consumer searches, current-versus-frozen
  input hashes and membership, current process/port observation. Runtime isolation remains
  unavailable pending explicit repair/rerun approval. No native or packaged claim.

## RECONCILE / FINDINGS

TypeScript AST traversal of all 29 `.ts` files under `tests/e2e` found 25 spec files and
97 direct callsites matching screenshot/write/copy/download/directory/removal operations.
These are callsites, not unique output files or proof that every branch executed.

| Owner | Calls | Destination and finding |
| --- | ---: | --- |
| `capability-contract.spec.ts` | 3 | Lines36/78/142 use fixed `test-results/capability-contract-live.png`, `capability-contract-invalid.png`, and `b118-agent-key-custom-authority.png`; bypass per-run output. |
| `continuous-polling.spec.ts` | 2 | Lines185-194 mkdir/write `test-results/b116/<name>.json`, then attach it. Four callers at532/548/564/594 reuse fixed names across runs. |
| `marketing-showcase.spec.ts` | 3 | Line10 module-level repository mkdir; lines130-133 screenshot into the external Antigravity task and copy into repository evidence. Ten outputs were already runtime-reproduced in the stopped run. |
| `diagnostic-suppression.spec.ts` | 7 | Unique mkdtemp root; source/deployment/rules writes and finally cleanup derive from that root. |
| `native-authoring.spec.ts` | 5 | Unique mkdtemp root; fixture source/deployment and finally cleanup derive from it. |
| `project-browser.spec.ts` | 7 | Unique mkdtemp root; fixture files and finally cleanup derive from it. Other absolute example paths are routed fixture data. |
| `project-validate.spec.ts` | 6 | Unique mkdtemp root; fixture files and finally cleanup derive from it. |
| `product-copy.spec.ts` | 2 | Screenshots use `testInfo.outputPath`. |
| `x4-ui-source-editor.spec.ts` | 62 | Screenshots/JSON/profile paths derive from `test.info().outputPath` or `testInfo.outputPath`; export downloads use children of those output directories with asserted expected filenames. |

The seven fixed repository artifact names are [REPRODUCED source] locality defects, not
newly proven overwrites in this audit. Unlike the external marketing incident, their
before/after execution impact was not reconstructed. No artifact was deleted or restored.

### Shared cache is a distinct writer

[REPRODUCED source/log] `server.ts:385-389` calls `openStudioDb()` without its optional
directory argument. `src/lib/db.ts:125-156` falls back to OS-temp `x4-studio-cache`, opens
`index.db`, enables WAL, and performs schema setup/migration writes. The stopped run's
`full/rendered.log:90` confirms that shared path was opened.

The cache is not merely read-only: `server.ts:2582,2641-2648` binds the configured game
path and mirrors object-index data; `db.ts:189-199` can clear cache tables on a different
game-path binding. No pre-run cache snapshot exists, so actual row changes or damage are
NOT established. Do not open, migrate, clear, or restore the existing cache for this audit.

Graphify's existing `openStudioDb` graph locates two separate consumers. Live source
confirms `referenceManifest.ts:83-85` already passes `dataPath('reference-manifest')`,
which the E2E environment isolates through `X4_DATA_DIR`. That correct manifest path does
not isolate the separate no-argument studio cache. Reuse the existing optional-directory
boundary in a future repair; do not replace SQLite or alter live/installed cache defaults.

### Showcase consumers

`vscode-extension/README.md:31-97` references ten `media/showcase` images. Packaging's
`.vscodeignore` allows `media/**`, not `evidence/**`. All ten referenced media files exist
and differ from the same-name evidence copies at this checkpoint. Five additional legacy
same-name pairs are equal. Equality is a current comparison, not pre-run provenance.

Search of repository application/test/script/config/document text, excluding dependencies,
build output, graph output and generated evidence, found no executable automatic copier
from `evidence/showcase` to `media/showcase`; the marketing helper is the identified writer
to the former. Do not overwrite or synchronize either asset set during the isolation fix.
No active executable consumer of the four B116 measurement filenames or three fixed
capability PNGs was found in scripts, extension source, or CI configuration. Historical
records reference B116 evidence; retaining per-test attachments is required.

## VALIDATE / REVIEW

- `rg --files tests/e2e` plus AST call traversal (TypeScript parser only; no imports/spec
  execution), 22:34:53Z: 29 files / 25 specs / 97 matching callsites in nine owners.
  AST queries were run inline through Node, without creating a script or output file.
- Destination declarations, helper imports, download destinations, mock routes and
  temporary fixture paths were inspected against the call inventory. Fixed root writers
  require repair; owned temporary fixtures and per-test artifacts are not equivalent faults.
- Consumer searches and current image byte comparisons, 22:36:22Z: findings above.
- Exact enumeration from the prior `run-full.mjs` baseline, evaluated read-only:
  all408 source/script/test input hashes unchanged; membership unchanged; HEAD unchanged.
  Baseline source: `test-results/b119-full-integration-20260913/baseline.json`.
- Process/port check, 22:35:28Z: prior owned30872/40732/60780 absent;3200/3201 have no listeners.
- No browser/server/SQLite connection was started. The original failed receipt is intact.
- Boundary: this is not a transitive audit of every dependency or every server endpoint,
  and not a runtime guarantee. It does not establish that all machine state was unchanged.
  Standard runner verdict files and dependency/build caches remain separate owned surfaces.

## CLOSE / NEXT AUTHORIZED BOUNDARY

The next repair scope changes from one marketing spec to three artifact-writing specs
plus explicit per-run studio-cache wiring and focused prevention coverage. Preserve all
assertions, tests, retry/timeout rules and full-suite discovery; do not skip marketing.
Keep existing external/evidence/media images and the shared cache untouched. Before coding,
record the exact reviewed file backup/rollback and consumer-preservation acceptance checks.
Full rerun remains paused awaiting explicit user approval. No capability-map delta;
no external wiki/GitHub/global-memory write. No code commit point added by this audit.

Previous status turn: NO PROGRESS. This turn: PROGRESS through new source-backed evidence
that changes repair scope. The resumed blocked audit starts fresh; no blocked/complete
goal update is justified by this audit turn.

## AAR

- Triggered: reconciliation expanded the repair; original safety failure remains open.
- Sustain: inspect destinations and consumers without executing module-level test code;
  distinguish shared cache from correctly isolated reference-manifest storage.
- Improve approach: fixed repository evidence can escape run isolation even without an
  external path; do not audit only drive-letter literals or screenshots.
- Improve tools: graph lookup helps locate consumers but source/logs determine actual
  paths. Bounded outputs avoid losing findings to truncation; no graph installation/update.
- Highest-risk evidenced weakness: test configuration isolates workspace/config/discovery
  but leaves a mutation-capable studio cache shared. Bounded mitigation is explicit per-run
  cache injection with unchanged live defaults and a negative destination check.
- Project findings banked in this local record only. No verified procedural skill created.

### Approval-boundary revalidation —2026-09-13T22:40:05Z

Second consecutive resumed occurrence. Previous audit turn PROGRESS; this turn NO PROGRESS,
not a verified wait. No explicit user approval followed the repair/rerun question. Three
artifact specs, server.ts and playwright.config.ts still match the frozen baseline hashes;
prior owned processes absent and3200/3201 free. No repair/rerun or external mutation.
Goal stays active pending the third-turn audit threshold. Check-only AAR: no new failure
or risk delta; original triggered audit remains authoritative.

### Third resumed approval audit —2026-09-13T22:41:03Z

Same boundary for three consecutive resumed goal turns, with no explicit approval.
The five named files still match baseline; old owned processes absent,3200/3201 free.
Previous and current turns NO PROGRESS, not verified waits. Meaningful read-only audit
has been completed; no repair or rerun is authorized through this pause. Goal marked
BLOCKED via update_goal, not complete. No code/test/image/cache mutation. A later resume
starts a fresh blocked audit. Check-only AAR: no new failure or risk delta.
