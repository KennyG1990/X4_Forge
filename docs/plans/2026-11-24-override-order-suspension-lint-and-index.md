# Unit 40 Plan — `#67` (`FF-28`): Override Order Suspension Semantics, Advisory Critic/Pitfall Lint & Vanilla Override-Order Coverage Index

- **Status:** `VERIFIED` (Dev source, X4 9.00 corpus, HTTP API, Object Browser UI, stdio MCP, `134/134` oracles, `792/792` routes; GitHub `#67` & `#19` remain open/`PARTIAL` pending `0.0.94` installed `FORGE DEVELOPMENT` IDE delivery)
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Issue:** GitHub `#67` (`Friction FF-28: override suspension also raises event_object_order_cancelled`) + `#19` (`reference.override.orders.read@1` / `list_override_order_issuers` MCP parity)
- **Baseline HEAD:** `30f30e14c0722ac6c0ecbf656a4a5158479cb2a5` (`134/134` oracles, `791/791` routes, `108` capabilities, `109` MCP tools, `50` raw writers, `Quality` `45513135702` `SUCCESS`)

---

## 1. Reconciled Engine & Corpus Facts (`X4 9.00`)

1. **Engine Behavior (`#67` + `#issuecomment-6507350660` + X4 9.00 Corpus):**
   - When an override order starts on a ship (most notably `aiscripts/interrupt.attacked.xml:145` `<create_order object="event.object" id="'Attack'" immediate="true" override="true">` or `:198` `'Flee'`), the running order is **suspended** (not removed) and resumes automatically once the override finishes — yet X4 still raises `<event_object_order_cancelled>` for the suspended order at the moment the override interrupts it.
   - Egosoft's own `md/factionsubgoal_recon.xml:638-641` explicitly guards `<event_object_order_cancelled>` with `<check_value value="not event.param.exists" comment="only when recon-order was permanently removed"/>` (and `md/scenario_tutorials.xml:13562` checks `$ScoutShip.orders.count == 0`; `md/factiongoal_plunder.xml:342` checks `not $Contractor.orders.indexof.{$Order_Contractor}`; `x4_ai_influence` distinguishes live override suspension via `@$order.exists and @$ship.order.isoverride`).
   - Across the entire unpacked X4 9.00 base + official DLC corpus (`aiscripts/` + `md/`), exactly **14** `<create_order>` call sites set `override` (`!= 'false'`): `10` in `aiscripts/` (`interrupt.attacked.xml` x2, `lib.respond.foundabandonedship.xml` x1, `lib.respond.foundlockbox.xml` x2, `lib.respond.inspected.xml` x5) and `4` in `md/` (`md/conversations.xml` x2, `extensions/ego_dlc_timelines/md/scenario_assassinate.xml` x1, `extensions/ego_dlc_timelines/md/setup_dlc_timelines.xml` x1).

2. **Reconciled Existing Forge Infrastructure:**
   - `src/lib/mdSemantics.ts`: Deterministic MD element registry (`REGISTRY`); has `create_order` but lacks `event_object_order_cancelled` and lacks the `override="true"` suspension note on `create_order`.
   - `src/lib/forgeKnowledge.ts`: Shared `WIKI_TOPICS` powering `WikiBrowser`, Omni-Search, and `query_forge_knowledge` MCP; lacks a topic documenting `event_object_order_cancelled` vs override suspension.
   - `src/lib/mdPitfallLints.ts` & `src/server/projectValidation.ts`: Raw XML pitfall engine (`lintMdPitfalls`); `flattenProjectValidationRaw` passes `f.severity` straight through without inflating `mdPitfallErrors` or `mdPitfallWarnings` when `severity === 'info'`.
   - `src/lib/mdCritic.ts`: Visual Canvas graph critic (`critiqueWorkspace`); supports `'info' | 'warning' | 'error'` severities.
   - `src/lib/diagnosticExplain.ts`: Deterministic diagnostic guidance (`explainDiagnostic`).
   - `src/lib/referenceCorpus.ts` & `src/server/referenceRoutes.ts`: Canonical base + official DLC reference corpus & `/api/reference/*` + `/api/agent/reference/*` routes.

---

## 2. Bounded Scope & Non-Goals

### In Scope
1. **Reference & Semantics (`#67` Ask 1):**
   - `src/lib/mdSemantics.ts`: Add `event_object_order_cancelled` and update `create_order` (`override="true"` suspension behavior + `not event.param.exists` / `.isoverride` check note) + selftests in `runSemanticsSelftest()`.
   - `src/lib/forgeKnowledge.ts`: Add `mdscript_order_override_suspension` `WikiTopic` with Egosoft & dogfood idioms + selftest check.
   - `src/lib/diagnosticExplain.ts`: Add deterministic guidance for `md_pitfall.order_cancelled_override_suspension` and `order_cancelled_override_suspension` + selftest check.
2. **Static Advisory Pitfall Lint & Canvas Graph Critic (`#67` Ask 2):**
   - `src/lib/mdPitfallLints.ts`: Widen `MdPitfallFinding['severity']` to `'error' | 'warning' | 'info'`, add `'md_pitfall.order_cancelled_override_suspension'`, and implement `lintMdOrderCancelledOverrideSuspension(root, filePath)` emitting `severity: 'info'` on `<cue>`s whose own `<conditions>` contain `<event_object_order_cancelled>` (when not paired with `<event_object_order_finished>` in the same `<check_any>`) without checking `.isoverride`, `(?:event\.param|\$[A-Za-z_]\w*)\.exists\b`, or `\.orders\.(?:indexof|count)\b` in `<conditions>` or own `<actions>` (highlighting duplicate-order risk when `<create_order>` appears in `<actions>`, and producing **`0/362` vanilla X4 9.00 MD findings**).
   - `src/lib/mdCritic.ts`: Add `'order_cancelled_override_suspension'` (`severity: 'info'`) to `critiqueWorkspace` for visual Canvas graphs + positive/negative checks in `runCriticSelftest()`.
3. **Vanilla Override-Order Issuers Coverage Index (`#67` Ask 3 + `#19` MCP Parity):**
   - `src/lib/referenceCorpus.ts`: Add `overrideOrders` on `AIScriptReference` + cached `listOverrideOrderIssuers(rootInput, forceRefresh)` indexing all `<create_order ... override="...">` (`override !== 'false'`) across base + official DLC `aiscripts/` and `md/` without altering `corpus.sourceFiles` startup count.
   - `src/server/referenceRoutes.ts`, `server.ts`, `src/lib/agentHistory.ts`, `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`: Expose anonymous Studio `GET /api/reference/override-orders` and protected Agent/MCP `GET /api/agent/reference/override-orders` (`reference.override.orders.read@1` -> `list_override_order_issuers`, `109` capabilities, `110` MCP tools, `MCP_MODULE_AUDIT_VERSION = 42`), updating `config/forge-route-dispositions.json` (`399` routes).

### Out of Scope
- Blocking valid mods (`severity` is strictly `'info'`, never `'error'` or deploy-blocking `'warning'`).
- Any writes to live Forge, `x4_ai_influence`, or X4 game files (`0` new raw `fs.*` writers).

---

## 3. Acceptance Criteria & Validation Contract

1. **Positive & Negative Unit / Oracle Proof:**
   - Unguarded `<event_object_order_cancelled>` cue (and unguarded re-queuing `<create_order>` cue) emits `severity: 'info'` `md_pitfall.order_cancelled_override_suspension` (in `mdPitfallLints.ts` + `projectValidation.ts`) and `order_cancelled_override_suspension` (in `mdCritic.ts`), never flipping `validation.ok` to `false` or blocking `deploy-verify`.
   - Guarded cues (`not event.param.exists`, `@$order.exists and @$ship.order.isoverride`, `event.object.order.isoverride`, `$Ship.orders.indexof.{$Ord}`, `$Ship.orders.count == 0`, and `<check_any>` pairing `<event_object_order_finished>` + `<event_object_order_cancelled>`) emit **zero** findings, and scanning all **362** raw X4 9.00 base+DLC MD files emits **zero** findings.
   - `listOverrideOrderIssuers` against X4 9.00 returns all **14** canonical call sites (`interrupt.attacked.xml:145` `'Attack'`, `:198` `'Flee'`, `lib.respond.*`, `md/conversations.xml`, `ego_dlc_timelines`), supports `scriptKind`/`orderId`/`q` filtering, and rejects invalid query parameters on `/api/agent/reference/override-orders` with `400 CAPABILITY_INPUT_INVALID` and unauthenticated requests with `401`.
2. **Full Suite Gates:**
   - `npm run lint -- --max-warnings 600`, `npm run typecheck`, `npm run test:writers` (`30/30 + PASS + 8/8`), `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`, `npm run test:mcp-capabilities`, `npm run test:workspace-files-mcp`, `npm run test:reference-corpus`, `npm run test:reference-api`, `npm run test:oracles` (`134/134`), `npm run test:routes`, `npm run build`, `npm run precommit:check`, commit + push to `origin/main` + green GitHub Actions `Quality` CI + GitHub `#67` & Notion `Forge QA Field Log` sync.
3. **Planned Rollback:**
   - Restore touched files from `30f30e1` via `git show HEAD:<path>` + `fs.writeFileSync` if any gate fails.

---

## 4. Implementation, Validation & Review Close Record

### Implemented Changes
1. **Semantics, Wiki & Diagnostic Explain (`#67` Ask 1):**
   - `src/lib/mdSemantics.ts`: Curated `event_object_order_cancelled` (`reads: ['object.orders']`, `notInSchema: false`, note citing X4 9.00 `override="true"` suspension, `not event.param.exists`, and `@$order.exists and @$ship.order.isoverride`) and updated `create_order` (`describe` + `note`) + selftests (`52/52`).
   - `src/lib/forgeKnowledge.ts`: Added `mdscript_order_override_suspension` `WikiTopic` covering `aiscripts/interrupt.attacked.xml`, `md/factionsubgoal_recon.xml`, `@$Order.exists and @$Ship.order.isoverride`, and `list_override_order_issuers` + selftest.
   - `src/lib/diagnosticExplain.ts`: Added deterministic guidance for `md_pitfall.order_cancelled_override_suspension` and `order_cancelled_override_suspension` (`24/24`).
2. **Static Advisory Pitfall Lint & Canvas Graph Critic (`#67` Ask 2):**
   - `src/lib/mdPitfallLints.ts`: Widened `MdPitfallFinding['severity']` to `'error' | 'warning' | 'info'` and added `lintMdOrderCancelledOverrideSuspension` (`md_pitfall.order_cancelled_override_suspension`, `severity: 'info'`), flagging `<cue>`s with unguarded `<event_object_order_cancelled>` (noting duplicate-order risk when `<create_order>` appears in own `<actions>`) while suppressing on `event.param.exists`, `$var.exists`, `.isoverride`, `.orders.indexof`, `.orders.count`, and `<check_any>` `<event_object_order_finished>` pairings (`117/117` selftest, **`0/362` vanilla + DLC X4 9.00 MD findings**).
   - `src/lib/mdCritic.ts`: Added `order_cancelled_override_suspension` (`severity: 'info'`) to `critiqueWorkspace` + positive/negative selftests (`30/30`).
3. **Canonical Override-Order Issuers Index across UI, Agent API & MCP (`#67` Ask 3 + `#19`):**
   - `src/lib/referenceCorpus.ts`: Added `overrideOrders` on `AIScriptReference` and signature-cached `listOverrideOrderIssuers(rootInput, force)` indexing all base + official-DLC `aiscripts/` and `md/` `<create_order>` call sites with `override !== 'false'` (`14` sites across X4 9.00; `corpus.sourceFiles = 383` unchanged; `33/33` selftest).
   - `src/server/referenceRoutes.ts`, `server.ts`, `src/components/ObjectBrowser.tsx`, `src/lib/forgeCapabilities.ts`, `src/lib/forgeCapabilities.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `config/forge-route-dispositions.json`: Registered `GET /api/agent/reference/override-orders` (`reference.override.orders.read@1` / `list_override_order_issuers`, `109` capabilities, `398` disposed routes, `110` MCP aliases, `MCP_MODULE_AUDIT_VERSION = 42`, Contract SHA-256 `d3e41cb6bde50e421f64fe1c534654b4d913481583f7b307ad0d012f93df8367`, UI-action parity SHA-256 `726c75ace1ec48c3dcc710c0c450ed54e40b5b7c27b247c1f140bb6a7000b625`, route dispositions SHA-256 `488e4ea696478b9efcb88155e30b7d7720002d13dde66f37943e74111e1e2ad2`) and added `Override Orders (FF-28)` to `ObjectBrowser`.

### Validation Evidence
- **X4 9.00 Corpus Sweep:** `362` MD files scanned -> `0` vanilla false positives; `listOverrideOrderIssuers` -> `14` exact sites (`Attack: 3`, `Flee: 5`, `WaitForSignal: 2`, `ProtectShip: 1`, `CollectLockbox: 1`, `Wait: 1`, `MoveDie: 1`).
- **`npm run typecheck`:** `0` errors.
- **`npm run lint -- --max-warnings 600`:** `0` errors (`582` pre-existing/bounded warnings).
- **`npm run test:writers`:** `30/30 + PASS + 8/8` (`50` raw writers & `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged).
- **`FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`:** `PASS` (`109` capabilities, `398` routes, `110` MCP aliases).
- **`npm run test:mcp-capabilities`:** `PASS` (`read=64, write=69, deploy=70`).
- **`npm run test:action-receipt-coverage`:** `PASS` (`139` routes / `69` surfaces, SHA-256 `6eb8ef0ed2fae8ee6a9b2787a7592090770a188f04d3b7d525cadb9386f390fa`).
- **`npm run test:reference-corpus` & `npm run test:reference-api` (`X4_REFERENCE_ROOT` set):** `15/15 PASS` (`sources=383`) & full HTTP integration `PASS` (`401` anon, `400` invalid query, `200` `14` sites with zero host paths).
- **`npm run test:workspace-files-mcp`:** `18/18 PASS`.
- **`npm run test:oracles`:** `134/134 green`.
- **`npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset):** `792/792 PASS`.
- **`npm run build` & `npm run precommit:check`:** `[precommit] OK`.

### Requirement-by-Requirement Review
- `#67` Ask 1 (Reference & semantics for `override="true"` suspension + `event_object_order_cancelled`): **Done & evidenced** (`mdSemantics.ts`, `forgeKnowledge.ts`, `diagnosticExplain.ts`).
- `#67` Ask 2 (Advisory `info` pitfall lint & Canvas critic without blocking valid mods or false-flagging vanilla): **Done & evidenced** (`mdPitfallLints.ts`, `mdCritic.ts`, `0/362` vanilla MD hits).
- `#67` Ask 3 + `#19` (Searchable vanilla override-order coverage index across UI, API, and MCP): **Done & evidenced** (`ObjectBrowser.tsx`, `GET /api/agent/reference/override-orders`, `list_override_order_issuers`).
- Installed `FORGE DEVELOPMENT` (`0.0.94`) VSIX delivery: **Deferred (`PARTIAL` on GitHub `#67`/`#19`)** pending Ken's Machine-State Ask + Write Gate.

### Triggered AAR
1. **Triggers:** Initial `tsc --noEmit` flagged `@xmldom/xmldom` `Element` vs `xmlLite` `ElementLike` mismatch (`mdPitfallLints.ts`); synthetic `aiscripts/interrupt.attacked.xml` sorted before `order.patrol` in `runReferenceCorpusSelftest`; `capability-contract-audit.ts:8977` required `mappings.length !== 110` + candidate SHA-256 on `--promote-candidate`; `mcp-capability-selftest.ts` required `TOOLS`-order placement in `DIAGNOSTIC_READ_TOOLS` / `READ_TOOLS`.
2. **Points to sustain:** Grounding the advisory guard set against all 5 vanilla/DLC `event_object_order_cancelled` files upfront yielded `0/362` false positives on the very first corpus run while catching unguarded re-queuing cues cleanly.
3. **Points to improve — work/approach:** When adding a new MCP tool to `x4forge-mcp.cjs`, update `capability-contract-audit.ts` (`MCP_MODULE_AUDIT_VERSION` AND `mappings.length`) and mirror the exact `TOOLS` insertion position in `scripts/mcp-capability-selftest.ts` (`DIAGNOSTIC_READ_TOOLS` & `READ_TOOLS`) in the same edit batch.
4. **Points to improve — tools:** `--promote-candidate` requires passing the exact SHA-256 of `test-results/forge-route-dispositions.candidate.json` after patching `resourceClass`/`workspaceMode`.
5. **Highest-risk observed weakness:** Synthetic corpus selftest assertions in `runReferenceCorpusSelftest()` index `first.aiScripts[0]` positionally rather than by `.find(s => s.id === 'order.patrol')`, making alphabetical fixture additions brittle; kept `'z.interrupt.attacked'` to preserve existing checks without weakening them.
