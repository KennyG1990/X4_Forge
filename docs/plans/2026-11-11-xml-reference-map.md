# XML Reference Map — design and implementation plan

Status: SPECIFIED before implementation. Lane FULL. Owner: GitHub #100 under #21, related #18/#74/#15.
User authorization: Ken explicitly requested delivering the community's XML-file reference visualization, using ship and weapon modding as the motivating workflow. This is the next priority; the validation/debuglog worklist remains active.

## Goal and acceptance contract

Open a mod, choose XML References, select a file, see which XML it references and which scanned files reference it, follow a link, and inspect the real source. Include references into configured base/official-DLC XML, read-only. Expose the same deterministic result through Agent API and curated MCP.

This is a FILE graph. Do not substitute the MD node canvas, Graphify's Forge implementation graph, content.xml extension dependencies, a diff, a bulk editor, or a disconnected mock diagram.

Assumptions: mod-first exploration with game/DLC links and on-demand expansion is the useful default for ship/weapon authors. All-file corpus rendering is unnecessary; bounded/lazy navigation must still let users follow real referenced files. Unsupported/dynamic references and unscanned dependents stay explicit. This tool is source navigation, not evidence of game loading.

Alternatives considered:
1. Add only reference lists: inexpensive, useful navigation but misses the requested visualization.
2. Focused SVG file graph + directional lists + source pane: chosen; uses existing rendering patterns, gives navigable relationships without a new dependency.
3. Render every unpacked file at once: too much discovery/rendering, obscures useful relationships; retain expansion, search and declared scope instead.

In scope: ship/weapon macro, component, ware, bullet-macro and index-to-file links; project diffs through existing composition/provenance owners; mod/base/DLC identity; incoming/outgoing relationships within declared scan scope; source details/navigation; API/MCP; bounded coverage and authority.
Out of scope: automatic edits, source relocation, deploy/game actions, global settings grants, replacement of the existing knowledge/validation engines, copying X4CodeSense code, or claiming every runtime-computed reference is statically knowable.

## Baseline / reconciliation

Code baseline33b30a55ffb5e6aae89320e7464f551d60603926. Four pre-existing operational documentation edits are preserved in the preceding checkpoint. Current isolated Dev and CodeSense are verified separately in the restoration record; live/default editors, AiLive, other checkouts, game/saves and credentials remain outside write scope.

Existing owners:
- referenceCorpus/referenceManifest: canonical IDs, domains, bounded discovery and signatures.
- referenceOverlay/diffSimulator: official effective documents, project patch simulation and explicit completeness/provenance.
- projectFileInventory/buildWorkspaceFileManifest: source/generated/conflict ownership.
- xmlSourceSpans: verified original positions including BOM/CRLF/UTF16 offsets.
- referenceCorpus.resolveReferenceFile: realpath-contained raw reference opening.
- nativeEditor/nativeEditorBridge: existing project-file open and position transport.
- ProjectInspector/NativeProjectFiles: current project navigation; Canvas SVG pan/zoom/fit patterns.
- capability registry, exact project body contracts, route dispositions, selected-workspace authority and MCP adapters.

Absence boundary: inspected UI owners, relevant current routes, code graph and existing graph modules contain no asset XML file-reference map. modDependencyGraph is only extension dependencies. projectSymbols is MD/AI variable/type inference. Object discovery data is not canonical resolution authority.

Important gaps: macro symbols point to catalog files, not index @value assets; no public component-file resolver. Effective canonical composition has document lineage, not universal raw-token provenance. Preserve that distinction instead of inventing raw DLC positions.

Grounded 9.00 examples: a ware's component@ref names a macro; the macro's component@ref names a component. A weapon bullet@class may name another macro. A ship connection@ref is scoped inside its component; a nested macro@ref is a global macro reference. Root-prefixed DLC catalog values already exist. Element name alone is insufficient.

Capability delta: new native XML-reference analysis/navigation workflow, with read/analyze authority only. Reuse original indexes/guards; keep existing graph capabilities distinct. No package/dependency/AI/network/spend/write/delete feature is added.

## Shared contract and architecture

Public route: POST /api/agent/project/xml-references.
Inputs: exactly one optional workspace or project; neither means the explicitly addressed saved workspace. Optional focus={origin:'project'|'reference',path,line?,column?}, maxDepth, maxNodes, maxEdges and includeSource. Reject unknown fields, malformed selectors, unsafe paths, unsupported authority and conflicting input modes. Inline analysis must not dereference caller-supplied source-root metadata.

Result envelope: ok, schemaVersion='forge.xml-reference-map.v1', signature, files, nodes, edges, coverage, optional preview and context.
- files: selectable known files; nodes: displayed file neighborhood, with stable origin/path identity and content hashes.
- edges: source/target file IDs, typed symbol/kind, verified original line/column when available, reason and resolution status.
- statuses: resolved, missing, ambiguous, dynamic, unsupported, incomplete. Preserve duplicate candidates rather than first-wins concealment.
- preview: selected source/excerpt, file identity/hash, start line, truncation and authored/effective location kind.
- coverage: scanned scope/counts, unsupported/incomplete reasons, resource limits and truncation; an empty graph never silently means complete.
- context: input mode/fingerprint, exact workspace when addressed, corpus generation/used-source signatures. Do not return private absolute roots as user labels.

Backend source boundary:
1. Pure typed extraction/graph module; no filesystem/network/writes. Parse actual XML, not regex for every ref attribute.
2. Existing-guard server service loads only configured reference files and explicit project input. Batch catalog resolution and cache only within verified input/source signatures; no arbitrary filesystem root parameter or new persistent store.
3. Root route adapts current workspace/compiler/project inputs and authority, then calls service.
4. UI requests the same API and rejects late/stale results when workspace selection, source fingerprint or corpus generation changes.
5. MCP uses the same versioned route with honest bounded output.

Preserve authored source edges separately from effective composition. For project diffs, reuse simulation and its opt-in provenance; never map a merged line onto an unrelated raw patch. Incomplete overlays remain incomplete. A matching definition alone does not establish runtime load or registration.

Limits must bound document count/bytes, per-document/catalog input, traversal/depth/nodes/edges/preview and response size. Report partial scope and continuation/expansion truth. Do not rescan every asset in the unpacked game per click. Avoid posting binary content or presenting out-of-scope dependents as globally exhaustive.

## Implementation ownership / steps

### 1. Typed engine and bounded reference service
Owner files: src/lib/xmlReferenceGraph.ts; src/server/xmlReferenceMap.ts; meaningful selftest entry point if needed.
Publish the shared result/input types first to UI/route owners. Reuse existing XML parse/span and composition/path owners. Implement project definitions plus separate macro/component catalog resolution, real target files, context-sensitive refs, cycles and explicit coverage.
Tests: authored ship/weapon/ware/component/bullet/index chains; same basename/different path; duplicates; local connections; missing/dynamic/unsupported refs; malformed XML; BOM/CRLF/nonASCII/entity positions; project diff and incomplete overlay; root-prefixed DLC paths; traversal/symlink; byte/depth/node caps. Tests run serially after admission.

### 2. Reachable UI workflow
Owner files: src/components/XmlReferenceView.tsx; src/components/ProjectInspector.tsx.
Use a Project subview to avoid unrelated global navigation changes. File picker/search, pan/zoom/fit diagram, Uses/Used by, typed unresolved indicators and read-only source pane. Follow actual file targets and inspect exact source anchors. Reuse native project-file opening with one-based→zero-based conversion; existing bridge dispatch is not a confirmed native-open receipt. Keep corpus preview inside its read-only boundary.
Do not force file nodes into MDNode or modify the authored canvas. Preserve overview behavior, abort obsolete requests and bind results to selected context.

### 3. API/MCP/contracts
Owner files: server.ts; src/server/projectApiContract.ts; src/lib/forgeCapabilities.ts; config/forge-route-dispositions.json; vscode-extension/mcp/x4forge-mcp.cjs; scripts/mcp-capability-selftest.ts; relevant contract/oracle tests.
Read/analyze scopes, no confirmation/write grant. Require and echo workspace for addressed reads; explicitly supplied documents remain stateless. Add one curated XML references tool; do not claim a projection before it is wired. Preserve old-key authority and exact response limits.

### 4. Real integration / rendered proof
Owner file: tests/e2e/xml-reference-map.spec.ts, plus actual existing test helpers only when necessary.
Use a standalone fixture and real isolated backend, no semantic route mocks. Navigate Project→XML References, select ship/weapon XML, follow both directions, inspect correct source, preserve workspace/mod bytes, and switch workspaces during a delayed real response. Check deterministic unresolved/ambiguous/coverage states and actual production asset serving. Capture/inspect real headless source and compiled PNGs.
Pure backend/source navigation has no game execution requirement. Native webview/native document opening remains a distinct experience gate under the no-computer-use restriction; do not mislabel browser proof.

### 5. Qualification and delivery
Focused tests, type/lint, capability/MCP/body/authority controls, normal precommit and exact-head CI. Then required source/production/runtime/E2E/package/installed release gates; cite discovered totals. Qualified OpenVSX/GitHub release only with fresh version/notes and exact tested artifact under PUBLISHING.md. Do not overwrite/re-publish stable0.0.83 or promote an internal package as a store release.

## Resources / rollback / evidence

During active shared work: source edits/read-only reconciliation and admitted focused tests only. Existing qualified private toolchain/state roots, one producer, one core/low heap for focused checks; full build/browser/release admission remains separate. A source-only docs checkpoint may run the unchanged normal hook with1core/1536MiBV8, >=6GiBfree and reliable CPU<=25%; no browser/game/product backend. If that cap fails, preserve the failure and wait for the full envelope; no bypass.

Source-only admission observes other editors but does not require them closed: coexistence is the user's standing requirement. It must independently verify the private Dev owner, no X4 and the stated resource envelope, isolate all test state, and never control another editor. An initial overstrict unknown-editor refusal occurred before any staging/hook; it does not establish unsafe ownership of source-only tests. Product/backend/browser/release gates retain their separate stricter admission.

Rollback: bounded new module/UI/route/metadata diff, no user data migration or write. Do not reset unrelated changes. All fixture runtime uses owned temporary roots with bounded cleanup after terminal producer proof; no helper/backup families.

Evidence: finite XML-reference QA packet, this plan and existing private Notion QOL; GitHub #100 public execution summary. Exact private host/profile/token data stays in local QA. Update capability map by actual delta and append verified history only after the relevant gates pass.

## Review / close / AAR

Implementation not yet started at this specification. Before VERIFIED, re-read every outcome above against actual UI/API/MCP and edge/source/authority evidence. Any missing projection, invented target or source location, skipped scope presented as complete, stale cross-workspace display, false native-open claim or red required gate returns to implementation. Public release and overall initiative stay open until qualified.

AAR starts non-clean because reconciliation exposed catalog-vs-definition and authored-vs-effective provenance gaps. Sustain existing owners/guards and black-box reference policy. Improve duplicated discovery assumptions, costly broad payloads and reference navigation discoverability. Highest risk is a convincing graph with wrong target/source authority; typed context, raw locators, explicit ambiguity/coverage and actual rendered/backend tests are the bar.
