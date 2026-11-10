# Lua runtime scope and ordered-source analysis

> For Agent: use the planning skill; read this contract before source edits. Root owns the serial test slot and must release the frozen A15 native source snapshot first.

Status **SPECIFIED**. Lane **FULL**. Owner [#86](https://github.com/KennyG1990/X4_Forge/issues/86), consumer requirement under [#61](https://github.com/KennyG1990/X4_Forge/issues/61#issuecomment-6774988939). This file is a reconciled implementation plan, not implementation or validation success. No new issue, checker, cache, runner, UI panel, readiness-ladder stage, or total extension ordering is proposed.

Goal: make the existing shared Lua validator distinguish registered runtime sources and bounded eager source order from deferred or unknown execution, preserve real findings, and expose the exact checked/unchecked scope in existing project/native evidence.

Architecture: extend the manifest/path/registration owner in `x4UiSourceBundle.ts` with a lightweight inventory projection, then consume it in the existing `analyzeLuaFiles` path. Parse each file once for baseline Lua facts and reuse that AST for lexical reads/writes and execution classification. Keep the existing X4 UI model/cache independent of project-dependent global decisions; it is not a second global checker.

Tech stack: TypeScript, existing luaparse 0.3.x configured for Lua 5.2, existing xmldom parser, existing validation evidence and approved project-check machinery. LuaJIT20 grammar parity is a separate limitation.

## PLAN / acceptance contract

### Authorization and bounded unit

- This planning task may write **only this file**. Production files, existing tests, services, native driver, Git state, GUI, AiLive, game/mod trees and standing configuration remain untouched by this author.
- Production implementation starts only after root observes the full native replay terminal result and explicitly releases source authors. Do not overlap source changes with a hash-frozen run.
- The source unit repairs #86 registered-file/global scope and local manifest order; #61 remains open for its broader execution, ownership, coverage and installed contracts.
- Full project validation, disk validation, Problems API, Doctor, package readiness and both native deploy aliases must consume one shared inventory/analyzer contract. Context-free generated previews remain supported with an explicit absence of runtime-scope proof.
- No arbitrary Lua execution, dynamic import resolver, engine catalogue generator, dependency scheduler, project-check permission change, runtime setup change, result cache, public release, installation, game input or live owner enrollment is in scope.
- Do not retire the project's healthgate: its journal, handler guard, failure throttling and event assertions exceed syntax/order/global-reference checks. Gate retirement and any deploy-time reduction require a separate exact behavioral comparison. Consumer timing is a report, not a benchmark of this candidate.

### Authoritative references and observed facts

1. Repo `AGENTS.md`, `UNIVERSAL_AI_TASK_WORKFLOW.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`; capability map and ADR ledger at `F:/StarForge/wiki/x4-forge/`. Capability/ADR reconciliation found no competing implementation or contrary Lua-order decision. Existing capability is extended, not replaced.
2. [#61 consumer comment 6774988939](https://github.com/KennyG1990/X4_Forge/issues/61#issuecomment-6774988939), created/updated 2026-11-10T17:56:31Z: syntax, ui.xml order and undefined globals on listed files, grounded engine allowlist, named validation/coverage. Fresh connector reads find #61 and #86 OPEN. Open-issue Lua search found #86 as this precision owner, with no duplicate scope/order issue. #93 text IDs, #64 faction references and #97 deploy performance are separate; do not absorb them.
3. [#86 checkpoint 6736089913](https://github.com/KennyG1990/X4_Forge/issues/86#issuecomment-6736089913), source checkpoint `bc820e40818a5eff64472a27c45d782fbcb0b27a`: four engine globals, root tools namespace, exact folder/path ownership, syntax/X4 preservation and disk junction checks already exist. Installed verification, broader catalogue and dynamic loading remain open.
4. Existing plans: `2026-11-09-forge-lua-global-tooling-scope.md` and `2026-11-10-a15-lua-behavioral-qualification.md` in this directory. The latter's runtime-scope probe reproduced control=1 advisory, unlisted-provider=0 and later-listed-provider=0. Evidence: `C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2/forge-1110-lua61-runtime-scope-probe.json`.
5. Actual unpacked 9.00 corpus root: `G:/F-rescue-2026-09-26/Downskies/x4unpackersuiteV1/X4 unpacked 9.00`. Read-only source grounding:

| Source under that root | SHA-256 | Governing fact |
| --- | --- | --- |
| `ui/core/addon.xsd` | `67d318ee4a6892905198519df094b8abe357c84751166e3bc4af2ee19a826cca` | Extension addon: only `menus`; file paths have a directory component and `.lua`; dependency means load after the named addon, and no load if absent; saved variables use savegame/userdata. |
| `ui/core/coreaddon.xsd` | `dc4b8e04262c8f8b0a1273041b3c2b951e4bec16c375be0ee44409a70330faeb` | Core addon differs: bare Lua names, binding groups and `__CORE_` saved variables. Do not apply extension restrictions to the core corpus. |
| `ui/widget/lua/widget_fullscreen.lua` | `420afba33d925a7b55f2a82ab12773df04826ef588317010d209b249de7baed1` | Lines 430-449: registry, `MakeGlobalAvailable`, `AddGlobalAccess`, `SetEGOGlobals`; line 18830 explicitly exports `GetTopRow`. |
| `ui/addons/ego_detailmonitor/ui.xml` | `7462cc56746d4fb1705477cc0471674c147e33d162d1758f9162eb55cc03a937` | Ordered files and explicit dependency on `ego_detailmonitorHelper`; this is a core manifest. |
| `ui/addons/ego_detailmonitorhelper/helper.lua` | `d24a08b8da9f2c972794b60acb48ae36f38cb026c991249dab9f1164272d4df2` | `Helper` assignment then `MakeGlobalAvailable("Helper")` at line 585; global export mechanisms matter. |
| `ui/addons/ego_detailmonitor/menu_diplomacy.lua` | `06ffb9ad52b78dbbf798ab9c0fb0b322a4a1ec91dac2edb6f64aff054a6e0ffd` | Bare `GetTopRow` uses at 332/336/341/346/432/993. |

6. Primary author [sn_mod_support_apis/ui.xml](https://raw.githubusercontent.com/bvbohnen/x4-projects/master/extensions/sn_mod_support_apis/ui.xml) explicitly orders its provider first and importer last; its [README](https://raw.githubusercontent.com/bvbohnen/x4-projects/master/extensions/sn_mod_support_apis/Readme.md) documents dependency/inclusion order and delayed initialization. [Egosoft UI documentation](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/UI%20Modding%20support/) distinguishes menu Lua and the separate HUD environment. These references establish the bounded source contract, not observed engine execution for this candidate.
7. Grounded `GetTopRow` provenance and copied hub's deferred `pcall(GetTopRow, t.id)` are retained in `forge-1110-lua61-behavior.json`, key `nextLuaPrecision`, under the QA directory above. Add only this additionally evidenced name, preserving the four prior seeds and genuine typo controls. Do not promote arbitrary corpus call tokens into engine globals.

### Reconciled semantics (the contract, not optional suggestions)

**Inventory.** The public runtime inventory accepts the strict extension-addon manifest topology only, sharing direct-addon strict registration reading with existing `readX4MenuLuaPaths(strict:true)`. Preserve relaxed legacy reads and all existing permissive source-bundle behavior through shared internal registration resolution; do not tighten their existing public projections. The exact root manifest and exact supplied source paths are authoritative. Preserve raw spelling, case-sensitive contained lookup keys, environment block, registration occurrence/order, duplicate, missing and ambiguous facts. Missing input is absent; blank/malformed input is invalid; neither is a valid empty manifest. Do not use extension ID, a flat file array, alphabetical order or `content.xml` order as a Lua execution order. Only the same physical extension's compatible menu-environment inventory can provide local runtime definitions. Multiple environment blocks or unresolved registrations must remain explicit boundaries unless their shared order is proven; do not concatenate them silently. A structurally known inventory is not complete XSD, dependency-availability or runtime proof. Repeated menu environments are schema-valid; use their environmentIndex and never establish a definite earlier provider across blocks. Possible provider names may qualify deferred analysis only, with the unresolved environment boundary retained.

**Known registered source.** Only uniquely resolved listed Lua can provide runtime globals or receive runtime undefined-global/order analysis. Unlisted non-tools, standalone tools and neighboring extensions cannot mask a registered consumer. Consumer and inventory sourceIndex must refer to the same exact supplied per-extension Lua array; verify sourceIndex AND normalized exact path/provenance, never a later filtered/global array offset. Preserve syntax and current X4-specific checks for every supplied file, including unregistered/invalid tools. The root tools loader containment/junction protection is unchanged. Manifest dependency names do not prove installed availability or global exports: record the unresolved dependency boundary as a gap where it affects the source check, rather than granting a full-runtime pass.

**No inventory supplied.** Existing single-source/generated/context-free callers retain their API and hygiene compatibility, including their current sibling-global test expectations. Return `runtime scope unavailable/context-free`; do not claim manifest/order coverage. An explicitly absent/invalid project inventory must not fall back to blanket scanned definitions. It gets an unavailable scope result and bounded per-file source hygiene, with no cross-file suppression or order verdict. Avoid unnecessary missing-manifest noise for a project with no Lua.

**AST facts.** Cache nothing new. Normalize BOM once, parse once into a per-call map, preserve parser failures and source locations, then walk lexical reads and writes. Use luaparse locality and explicit lexical binding frames where needed; a local identifier or `T.member = ...`/`function T.member()` does not define global `T`. Member/index bases are reads. Evaluate all assignment RHS and member/index targets before applying assignment writes. Avoid treating declaration identifiers as reads.

**Definite provider.** An unshadowed bare global function declaration or unconditional bare assignment with a source-proven non-nil literal, table or function value can establish a provider after its statement completes. Literal nil removes availability. Unknown RHS, conditional/loop/deferred writes are possible providers only. A narrow `G = G or {}`/function/literal non-nil initializer may be handled when same-symbol and short-circuit semantics are proven; otherwise mark unknown. Do not infer arbitrary call returns or global table member existence. Earlier files count only under the stated assumption that earlier chunks complete; runtime exceptions, external mutation and full engine completeness are not proven.

**Eager source order.** A straight-line, unguarded load-time read with a known later-only direct provider produces `lua.global_before_definition` at warning level, with consumer and provider positions. Wording says the source reads/captures the value before that registered provider executes; it does not claim an inevitable crash or a complete engine catalogue. Same-file order follows statement/RHS evaluation, not text-wide collection. Bare unknown names with no supported registered provider keep positioned `lua.undefined_global` info, worded as a deterministic source/seed advisory.

**Execution phase.** Record `load`, `deferred` or `unknown` plus protection/reachability separately. A function body is not eager merely because its text occurs early. A later provider used only by a deferred callback must never receive unconditional before-definition failure. Direct anonymous IIFEs execute eagerly. An exact unshadowed `pcall(function() ... end)` body executes eagerly/protected; `pcall(G, ...)` protects calling G, while evaluating `G.member` before entering pcall is not protected. An arbitrary passed callback may execute synchronously: classify unknown unless proven. A named local/global helper invoked at top level is not assumed deferred: either resolve its exact unshadowed binding with bounded recursion/cycle handling, or report unknown-call coverage. The initial bounded implementation may choose the latter; it must not call the path checked-safe.

**Guards and control flow.** Direct existence checks and source-proven short-circuit/branch guards must not create unconditional missing-global/order failures. Conditional/loop writes are not definite providers. Literal unreachable branches can be excluded only with Lua-correct truthiness; numeric zero is truthy. Complex guards, branch joins, reassigned aliases, recursion and unsupported constructs are explicit unknown coverage. A registration API callback is only labelled deferred when its API/argument use is proven; function nesting alone is insufficient evidence about invocation time.

**Dynamic and environment boundaries.** `require`, `dofile`, `load*`, `package` loader/path mutation, `_G`/`rawset` writes, `_ENV`, `setfenv`, environment metatables, exported-global APIs and opaque aliases do not silently establish providers or imports. Retain source-located reasons; a known literal engine import such as `require("ffi")` can be classified external/known without treating project modules as loaded. Do not inspect live imports or filesystem paths. Seed availability remains bounded to the evidenced menu context; no cross-addon export or dependency closure is invented.

**Named results and credit.** Add named source-only results under `result.lua.runtimeScope` for `lua.syntax`, `lua.registrations` and `lua.globals-order`, with exact files/counts, `pass | fail | partial | unavailable | not-applicable`, evidence boundary and positioned gaps. A successful bounded stage means those facts were checked on those bytes. It does not mean the file's UI/render/behavior is Forge-verified. Map new scope-unavailable findings into the existing `ValidationEvidence` unavailable-code classification and coverage gaps. Keep `applyProjectCheckCoverage` unchanged: new static passes cannot erase `x4-ui.verification-gap`, unrelated missing checks or static mod findings, and stale/missing/revoked project receipts still earn no credit. No sixth readiness-ladder stage or UI change is required.

### Interfaces and author ownership

Exact repo root `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge` (REPO below). Freeze the small interface with root before parallel source authors; no author may edit another author's files.

```ts
// In existing x4UiSourceBundle owner; names may be refined before implementation.
interface X4MenuLuaRuntimeInventory {
  manifestStatus: 'known' | 'absent' | 'invalid';
  addonName?: string;
  registrations: readonly (X4UiSourceRegistration & { readonly environmentIndex: number })[];
  diagnostics: readonly X4UiSourceDiagnostic[];
}
function buildX4MenuLuaRuntimeInventory(input: {
  readonly uiXml?: string;
  readonly luaFiles: X4UiSourceFileInputs;
}): X4MenuLuaRuntimeInventory;
// Accept existing input shape; do not parse/duplicate Lua texts or build call models.
// sourceIndex refers to that exact input's existing canonical order.

// Additive LuaFileInput.extension.runtimeInventory; retain menuLuaPaths compatibility.
// Additive LuaStaticAnalysisResult.runtimeScope contains named results and gaps.
// No required signature changes for generated/context-free analyzeLuaFiles callers.
```

| Author | Exclusive source/test scope (absolute paths) | Dependency |
| --- | --- | --- |
| Manifest author | `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/x4UiSourceBundle.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/x4UiSourceBundle.selftest.ts` | Agree inventory contract first; extract shared resolution without changing permissive legacy bundle projections. |
| Analyzer author | `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/luaStaticAnalysis.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/scripts/incremental-lua-selftest.ts` | Consume shared inventory; do not edit UI call-model/cache owners. |
| Consumer/evidence author | `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/server/projectValidation.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/projectOrchestration.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/modCompiler.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/src/lib/validationEvidence.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/server.ts`; `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/scripts/validation-trust.selftest.ts` | Consume frozen interfaces; preserve Doctor folder provenance, current caps and both native aliases. |
| Root / serial integration | This plan and task records; existing `C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2/forge-a15-project-coverage-replay.py`; existing `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/scripts/project-check-lua.selftest.ts` only if a reviewed qualification delta is needed | Root alone runs services/tests, assigns source release, owns exact review/cleanup, issue projection, hook and commit. Never weaken/rewrite immutable prior replay evidence. |

No new helper family is authorized. Reuse the current driver in place for API parity; retain old evidence. If an additional permanent helper/file, new permission surface or broader phase evaluator becomes necessary, amend this plan before that edit.

### Acceptance criteria

1. Reproduced unlisted/later-provider masks are removed for known project runtime inventories; correct earlier provider remains resolved.
2. Locals/member writes/conditional/deferred definitions cannot create false definite providers; same-file statement order is honored.
3. Deferred/protected/guarded/unknown calls do not become unconditional order failures; unknown execution is visible and not credited safe.
4. Missing/invalid/duplicate/missing-source/wrong-case/environment ambiguity is retained, with no silent empty-set or cross-extension fallback.
5. All full-project consumers agree on symbols, codes, severity, positions, stage states and coverage for the same exact inputs. Single-source callers remain compatible and explicitly unqualified for runtime order.
6. The four prior seeds and grounded GetTopRow clear; a real typo remains. All true syntax and X4 errors/warnings remain. Existing static findings cannot be hidden by passed project checks.
7. Existing approved real-Lua positive/semantic-negative, exact nine-Lua inventory, receipt provenance and both native aliases still pass the relevant contract after intentional expected-finding deltas are reviewed. Source, logical artifact, admission identity and suite coverage hashes remain distinct.
8. Changed-file lint, typecheck, focused regressions, normal precommit and fresh-eyes diff review pass. No broad or repeated test expansion without a new concern.
9. Evidence records commands, exits, timestamps, source hashes, exact fixture inventory, stage/gap counts, protected-state comparisons and terminal cleanup. Source-only completion remains distinct from installed/rendered/game proof.

## BASELINE

Planning readback HEAD `ba391fc7ac44d21db6183f9f246e1c1120cddac0`. Existing dirty file: `docs/plans/2026-11-10-a15-lua-behavioral-qualification.md`, owned by the root native continuation; preserve it. This plan did not exist. Root's native replay owns its source snapshot and current process state; no old handoff handle may be restarted.

| Production source at planning readback | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/lib/x4UiSourceBundle.ts` | 52,435 | `e1bde9c44fa694da07308ec6540c4b0a80c0a15b8961150449fe0c4dbb58d4f8` |
| `src/lib/luaStaticAnalysis.ts` | 46,025 | `121c53edfd6338aa86ff71c7042cab926d9acf6eb1af68a6875a7c6bea6251c2` |
| `src/server/projectValidation.ts` | 73,985 | `a3c34ba12afcf8334c8c0e0a244e833a4aaa696363518d17b58400c64f175c16` |
| `src/lib/projectOrchestration.ts` | 11,812 | `848f32b2f9592a0f1e10bf0cdfea8b5efa676c5e5cb97d28034c9035b0465520` |
| `src/lib/modCompiler.ts` | 40,841 | `ef965f07dfef3d1d2a81776dfec9895fce067e8f936034a526db3e7d22fcffcc` |
| `src/lib/validationEvidence.ts` | Not separately metered | `4a9f41a005a0e51001a049c1acf3d3055d2f97b322e1eae13613895b4f4e24d5` |
| `server.ts` | 957,264 | `c415bae719fa2d2482fde31620d992173775c772540b6751a4dbc1fe43ed585e` |

Rebaseline status, exact hashes, relevant failing controls and isolated/live process/discovery identities after native completion and before implementation. These are planning identities, not permission to reuse stale runtime state. Test/service work remains serial and headless. Root must verify the authorized quiet/lightweight boundary; current live-active constraints prohibit GUI/build/E2E/package/install/restart/trust/config/game work.

## RECONCILE

- Graph was read before broad source search. It connects shared `analyzeLuaFiles` to project validation, Doctor, project orchestration, package readiness, UIBuilder, Lua logic blocks and regression scripts. Graph relationships were checked against actual host files.
- `luaStaticAnalysis.ts` currently performs definition parse plus analysis parse; its definition visitor accepts local/member roots and deferred/conditional writes. Flat `ast.globals` omits execution context. Current non-tool definition collection spans all analyzer inputs.
- `x4UiSourceBundle.ts` owns safe paths, raw order, duplicate/missing/ambiguous registrations and parser state. `readX4MenuLuaPaths` has strict missing/invalid distinction but a Set loses occurrences; full bundle construction eagerly builds UI call models. Extract the existing registration-only authority rather than invoking another expensive full model pass or cloning its resolver.
- `x4UiCallModel.ts` exposes UI function/branch/handler contexts and bounded protected callbacks, but not all global references or a whole-file invocation schedule. Do not treat those contexts as generic runtime proof or add another parser call through them.
- Doctor batches extensions, so folder identity must remain explicit. Existing IDs alone are insufficient. Package readiness's custom-Lua-only path cannot certify a complete artifact; supplied `PackageReadinessArtifactContext` is authoritative when available.
- `ValidationEvidence` has explicit unavailable-code classification. Existing `applyProjectCheckCoverage` resolves execution and x4-ui gaps only; preserve its authority and exact-byte receipt rules.
- **No capability-map delta yet.** A bounded delta is justified only after the corresponding implemented/validated claim exists. No three-incident reason to replace an owner was established; extend the existing owners.
- Reconciliation changed the earlier tools-only namespace assumption into registered runtime/source-order semantics. This is a non-clean Full-lane task with a required AAR, not a clean documentation correction.

## IMPLEMENT sequence (future, after root releases source)

1. Root rebaselines, records the full native result separately, fixes this unit's interface/status names and evidence budget, and assigns exclusive files. Preserve prior failures and native acceptance unchanged.
2. Manifest author adds failing focused cases for exact direct extension topology, order/occurrences, empty versus absent/invalid, source resolution and multiple environments. Extract existing registration resolution and add lightweight inventory. Preserve existing bundle/source splice and strict path tests.
3. Analyzer author adds failing minimal cases for the regression matrix below. Replace duplicate baseline parsing with a per-call parsed-fact map; implement lexical read/write/phase facts and bounded provider/order decisions. Add grounded GetTopRow. Preserve existing selftest contracts.
4. Consumer author wires the exact inventory into project/disk/Doctor/orchestration. Readiness with an artifact uses only included text and paths; omitted/unavailable artifact text cannot qualify. Without full artifact context, retain single-file hygiene with explicit unavailable scope.
5. Consumer author exposes named results through existing Lua result and maps unknown facts into evidence gaps, including suppression-resistance. Do not change project-check approval, runner, receipt, coverage-resolution or native admission policy.
6. Root reviews complete source diff before a runtime attempt, including negative paths and generated metadata. Reconcile any required extra file/scope before further edits.
7. Root runs focused checks, then one bounded isolated API/native parity sequence using the existing replay driver and exact installed runtime closure. Add the small manifest variants as separate subcases in that existing source API runner, not as another helper family. The real29 fixture intentionally has NO ui.xml and exactly14/13 artifact files: do not add a manifest to it, retrofit historical success, or retain an obsolete fixed three-gap expectation. New missing-manifest scope gaps after this repair are expected and must be recorded with exact before/after identities. Keep all A15 real-case/provenance/refusal assertions; no easier fixture substitution. Capture failures and compare protected hashes before/after cleanup.
8. Root conducts fresh-eyes requirement review, records close/AAR and current handoff, projects status to existing #86/#61 without duplicating issues, runs normal hook and performs only the Git operations authorized for the root task. This plan author performs none of those mutations.

## VALIDATE / required regression contract

| Group | Positive/negative controls and required result |
| --- | --- |
| Original masks | Undefined registered control remains; unlisted provider cannot clear it; later listed provider produces eager order warning; moving provider earlier clears only that warning. |
| Local order | Same-file before/after; all RHS before writes; nil/unknown assignment; global function/table/literal; global-or-initializer; local shadow and same-name nested scope. No local/member-root provider credit. |
| Phases/protection | Later provider in deferred handler has no unconditional order failure; direct IIFE eager; exact pcall protected; callback passed to opaque immediate-capable function unknown; top-level init helper resolved or explicitly unknown. |
| Guards/control flow | Guarded existence/call, and/or, unreachable literal arm, zero truthiness, conditional provider and loop provider. Complex conditions remain gaps; no false checked-safe result. |
| Dynamic/environment | Literal/dynamic import, loader/path mutation, _G/rawset/setfenv/_ENV/metatable and reassigned aliases. No arbitrary path following or silent provider credit. |
| Manifest/source | Absent/invalid/valid-empty, BOM, exact case, duplicate registration/source, missing file, unsafe path, unexpected topology, multiple environments. Preserve raw occurrences and unknown boundaries. |
| Ownership | Same ID in different physical folders; unrelated earlier/later Doctor extension; registered root tool versus standalone tool; replaced tools-root junction regression. No cross-suppression. |
| Real findings | Four prior engine names plus GetTopRow clear, typo remains. Broken unlisted/tools syntax and existing X4 restricted/fictional/column findings remain positioned and retain severity. |
| Consumers | Same input through analyzer, inline/disk validation, flat Problems feed, Doctor, package/readiness artifact and both native aliases yields matching bounded facts. Missing artifact text cannot count checked. Context-free previews remain deterministic/compatible. |
| Coverage/receipts | Named stages retain bounded scope; unknown gap is check-unavailable; suppression cannot erase it; a passing check cannot erase a real static error/new unrelated scope gap. Wrong/missing/revoked/stale suite proof earns no credit, original exact source/admission/payload domains preserved. |
| Runtime witness | Existing approved exact LuaJIT20 hubgate positive and syntactically-valid semantic negative remain qualified, with nine exact Lua and all29 historical cases. The real fixture remains manifest-free with exact14/13 artifact files; newly surfaced scope gaps are retained. Synthetic phase cases prove the bounded analyzer classification, not observed X4 scheduling. Do not alter the immutable original real-Lua fixture or add a runtime-snippet family for this source repair. |
| Lifecycle | Before/after protected live/Dev identities; source/fixture byte identities; no unknown filesystem changes; worker/command receipts terminal; owned listener/tree/cache retired within existing marker and footprint guards. |

### Exact focused commands (declared, NOT RUN by the plan author)

Run from `C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge`, Windows PowerShell `login:false`, qualified Node/loader, root's serial slot, private owned temp/cache roots. Recheck pinned executable SHA before execution. Do not use a server defaulting to live ports.

```powershell
$qaNode = 'C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$qaLoader = 'file:///C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge/node_modules/tsx/dist/loader.mjs'
& $qaNode --import $qaLoader ./src/lib/x4UiSourceBundle.selftest.ts
& $qaNode --import $qaLoader ./scripts/incremental-lua-selftest.ts
& $qaNode --import $qaLoader ./scripts/validation-trust.selftest.ts
& $qaNode --import $qaLoader --input-type=module -e 'const {runLuaStaticAnalysisSelftest:f}=await import("./src/lib/luaStaticAnalysis.ts"); const r=f(); console.log(JSON.stringify(r)); if(!r.pass) process.exitCode=1;'
& $qaNode --import $qaLoader --input-type=module -e 'const {runProjectValidationSelftest:f}=await import("./src/server/projectValidation.ts"); const r=f(); console.log(JSON.stringify(r)); if(!r.pass) process.exitCode=1;'
& $qaNode --import $qaLoader --input-type=module -e 'const {runProjectOrchestrationSelftest:f}=await import("./src/lib/projectOrchestration.ts"); const r=f(); console.log(JSON.stringify(r)); if(!r.pass) process.exitCode=1;'
& $qaNode --import $qaLoader --input-type=module -e 'const {runPackageReadinessParitySelftest:f}=await import("./src/lib/modCompiler.ts"); const r=f(); console.log(JSON.stringify(r)); if(!r.pass) process.exitCode=1;'
& $qaNode --import $qaLoader ./scripts/project-check-run-composition.selftest.ts
& $qaNode --import $qaLoader ./scripts/project-check-lua.selftest.ts
& $qaNode ./node_modules/typescript/bin/tsc --noEmit
& $qaNode ./node_modules/eslint/bin/eslint.js src/lib/x4UiSourceBundle.ts src/lib/luaStaticAnalysis.ts src/server/projectValidation.ts src/lib/projectOrchestration.ts src/lib/modCompiler.ts src/lib/validationEvidence.ts server.ts scripts/incremental-lua-selftest.ts scripts/validation-trust.selftest.ts
& $qaNode ./scripts/precommit-check.mjs
git diff --check
```

The existing real-Lua command requires `FORGE_QA_LUA_FIXTURE`, `FORGE_QA_PYTHON`, `FORGE_QA_TMP` and `SystemRoot`, as read from its actual entry point. Use the current root-owned values/guards; do not reuse historical handles or fall back to host site packages.

Minimal existing API/native runner: `owned_source_api_replay` / `replay(..., source_api=True)` in the existing QA driver. It already launches current `server.ts` using the qualified Node/tsx loader, owns its Popen handles, provides API/capture/refusal helpers and performs guarded retirement. Add separate small registered-manifest projects inside its owned source root and exercise the existing endpoints there; do not replace/add ui.xml to the exact real29 artifact. No bundle/build or new command family is needed. Exact current CLI shape (NOT RUN here):

```powershell
$qaPython = 'C:/Users/Moshi/AppData/Local/Programs/Python/Python312/python.exe'
$qaDriver = 'C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2/forge-a15-project-coverage-replay.py'
$qaCorpus = 'G:/F-rescue-2026-09-26/Downskies/x4unpackersuiteV1/X4 unpacked 9.00'
& $qaPython -X utf8 -B $qaDriver --source-api --python $qaPython --corpus $qaCorpus --lua-fixture 'C:/fqa-73d/lua61-hub' --node $qaNode
```

Root's full native replay is ACTIVE on session85593 with reviewed driver63b3 at this plan's finalization. No source edits until root declares terminal completion. Freeze the exact post-native driver SHA, actual CLI and environment in new evidence before this unit's replay; current native handles remain exclusively root-owned.

Required runtime methods: addressed Problems API plus full project validation; Doctor on owned extension fixture; readiness on exact included artifact; both existing native preview aliases; planted syntax/X4-error refusal before writes; bounded selected-byte scratch apply/reopen where required by the native contract. Use existing auth/owner and coordinator fixtures. No GUI/E2E/build/package/install/game validation is currently authorized or available. Those remain unavailable delivery/experience layers and cannot be marked VERIFIED by this unit.

### Evidence and footprint

Reuse QA root `C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2` and the existing driver. New compact aggregate: `forge-1110-lua-runtime-scope-order.json`; bounded logs/captures linked from it. Retain actual structured responses without credential material; use the qualified lossless capture codec for large reports. No source/dependency backup family, broad archive or new runner.

Root fixes the payload budget before staging: at most64MiB/1000 regular fixture/runtime entries plus32MiB/3000 separately metered tool-cache entries,96MiB total; a lower root-approved budget may be used. One canonical Lua runtime/source fixture, no duplicate runtime copies. Reuse exact pinned CPython3.12.10/Lupa2.6/LuaJIT20 from the prior qualification; no install/download/provider spend. Retire only exact owner-marked roots after terminal producer, receipt, identity, no-reparse/single-link and protected-state checks. Preserve every failed evidence artifact.

## REVIEW / risks and rollback

- New scope gaps may increase incomplete-check counts on complex projects. That is an intended evidence-boundary correction, not permission to weaken gap accounting. Record exact before/after counts and reasons.
- Known registered order does not prove arbitrary initialization, callback scheduling, cross-addon export visibility, successful earlier execution, function types or member existence. Broad globals and Lua5.2/LuaJIT20 grammar differences remain open.
- Do not cache project-dependent definitions in per-file X4 UI caches; same source with changed sibling/manifest/owner must recompute globals/order. Existing incremental tests must detect those changes.
- Preserve exact case/path and folder provenance through Doctor packed/loose views, disk loader and artifact inclusion. Generated excluded files cannot qualify deployment.
- Confirm diagnostic severity, code and finding identity changes before native replay; warnings may affect review/refusal behavior. Do not mass-accept them.
- Rollback is the bounded owned diff from the refreshed preimplementation HEAD plus exact scratch retirement. Never reset/clean/revert unrelated dirty changes. No live/game/config rollback should be needed because those writes are out of scope. If a real/live write becomes necessary, stop at the project write gate with concrete impact/undo; this plan supplies no such approval.
- Fresh-eyes review must trace every acceptance item to actual evidence, inspect complete diff/metadata, check unknown/negative paths and ensure no narrow test is promoted to full runtime or installed proof.

## CLOSE (planning record)

Status **SPECIFIED**; production implementation, focused tests and runtime replay **NOT RUN** by this author. Only this plan is added. Existing root-owned A15 plan is preserved. Current issue ownership and primary schema/source facts were read, and the interface/negative/runtime/delivery boundaries are documented. **No capability-map delta.** Implementation remains dependent on root's completed native replay, source release, interface review and exact post-native driver invocation. No source-unit cadence credit, issue close, commit, push or release follows from this planning artifact.

Suggested eventual source close title: `fix(lua): scope globals to ordered registered runtime sources`. Final status, exact source hash, commit/hook/cleanup evidence, remaining delivery gaps and #86/#61 projection must be appended by root after actual validation. A successful bounded source/native close does not close all of #61 or installed #86.

## AAR (planning outcome; implementation AAR still required)

- Triggered: reconciliation corrected the tools-only/flat-definition assumption; read-only discovery encountered absent guessed files and an unavailable official globals subpage. No failed command was treated as proof of absence or as runtime behavior.
- Sustain: reuse existing graph/manifest/analyzer/evidence owners; prove provider masking with a real missing-name control; ground schemas and GetTopRow in exact actual corpus bytes; keep source and behavioral credit distinct.
- Improve work/approach: enumerate files with `rg --files` before targeted reads; keep connector structured content and large notes bounded rather than dumping bodies; do not infer a current policy/fix from old Agent-Brain timing narratives.
- Improve tools: no owned tool fix is required for this unit. Use available connector structured results; retain unavailable-page/source fallback boundaries. No verified procedural skill is banked from this planning-only run.
- Highest-risk evidenced weakness: the current flat definition set suppresses a registered runtime typo with an unlisted/later/unrelated definition. This unit's shared inventory plus explicit phase/gap contract is the bounded correction; success remains unproven until the matrix and native parity run.
- Lessons banked in this project plan only. No global ledger or Codex memory write is authorized for this author.
