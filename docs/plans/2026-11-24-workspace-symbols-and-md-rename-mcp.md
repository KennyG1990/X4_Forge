# Plan & Close — `#130` + `#19` P4 Slice 6: Multi-Source Workspace Symbol Search and CAS Mission Director Symbol Rename across API & MCP

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (in isolated Dev HTTP/MCP; `#130` and `#19` remain `PARTIAL` pending `0.0.94` packaged/installed IDE & E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#130`, `#19` (`navigation.symbols.rename_and_workspace_search`)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Project Forge's shared multi-source Workspace Symbol search (`shared/workspaceScriptSymbols.ts`) and Mission Director cue/library symbol rename engine (`shared/mdScriptNavigation.ts`) across protected Agent HTTP endpoints and stdio MCP tools, flipping `navigation.symbols.rename_and_workspace_search` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to `available` (`available: 14 -> 15`, `partial: 25 -> 24`, `openGaps: 35 -> 34`):
  1. **`project.symbols.search@1`** (`search_workspace_symbols` -> `GET /api/agent/mod-folder/symbols`, `effects: ['read', 'analyze']`, `agentScopes: ['read', 'write', 'deploy']`):
     - Closed query parameters: `q` (`1..256` chars, required), optional `path` (relative mod folder inside `Mod Workspace`; defaults to addressed Studio workspace when omitted), optional `includeReference` (`'true' | 'false'`, default `'true'`), optional `includeInstalled` (`'true' | 'false'`, default `'true'`), optional `kind` (`'script' | 'cue' | 'library' | 'interrupt-handler'`), optional `limit` (`1..200`, default `50`).
     - Indexes authored MD scripts/cues/libraries and AIScripts/interrupt-libraries (`originPriority: 0`), generation-cached base-game (`originPriority: 1`) + official DLC (`originPriority: 2`) scripts from `queryReferenceManifest` (with loose-folder fallback before manifest ready), and loose installed extensions (`originPriority: 3`), preserving authored precedence on identical `qualifiedName`, qualified `md.Script.Cue` disambiguation, zero host-path disclosure, and zero disk re-reads across warm reference queries.
  2. **`project.md.rename@1`** (`rename_md_symbol` -> `POST /api/agent/mod-folder/md-rename`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`):
     - Closed body: `{ path?, useAddressedWorkspace?, file, offset, newName, apply?: boolean, expectedSha256ByFile?: Record<string, string> }`.
     - Verifies physical `modDir` inside `Mod Workspace` (regular `content.xml`, flat `md/*.xml` inventory without symlinks, nested `md/` subdirs, `extensions/` overlays, or `.cat`/`.dat` archives — matching `vscode-extension/src/mdRenameHost.ts`), runs `planMdRename` across all `md/*.xml` files, and returns `422 MD_RENAME_REFUSED` when unsafe (unresolved-reference capture, opaque `$which` cue operand, unmodeled property use, casefolded collision, structural keyword, duplicate script identity, or caret on script qualifier).
     - When `apply !== true` (default `false`), returns `{ ok: true, success: true, applied: false, modId, symbolFile, newName, editCount, touchedFiles, expectedSha256ByFile, edits }` without touching disk or adding an Action Ledger row.
     - When `apply === true`, verifies `expectedSha256ByFile` matches every touched file's current SHA-256 (`409 MD_RENAME_CONFLICT` before any write if stale or incomplete) and commits via `writeWorkspaceFileGuarded` with transactional rollback if any file fails preflight, plus Action Ledger `edit` recording across all touched files.
- **Out of scope:** Packed `.cat`/`.dat` installed-extension symbol extraction over HTTP (loose installed extensions + unpacked reference corpus are indexed; packed game/extension archives remain native-IDE host scope) and live IDE/game writes.

## 2. Baseline & Reconciliation

- **Baseline:** `2693bf0cbc9712202e8f52b5f33e4e1a7fc1d35a` (`origin/main`, GitHub Actions `Quality` run `45413350642` `success`).
- **Reconciled owners reused:**
  - `shared/workspaceScriptSymbols.ts`: `readWorkspaceScriptSymbols` and `searchWorkspaceScriptSymbols` (ranks `exact > prefix > substring`, then `qualifiedName`, then `originPriority` `0..3`).
  - `shared/mdScriptNavigation.ts`: `planMdRename` and `hasInvalidNavigationPathCharacters`.
  - `src/lib/referenceManifest.ts`: `getReferenceManifestStatus`, `scheduleReferenceManifest`, and `queryReferenceManifest`.
  - `server.ts`: `writeWorkspaceFileGuarded`, `atomicWriteFile`, `coordinatedSourceOperation`, `ledgerMiddleware`, and `ForgeDecoratedRequest`.
- **Capability-map delta:** Added `project.md.rename@1` and `project.symbols.search@1` (`66 -> 68` capabilities, `67 -> 69` MCP tools, `MCP_MODULE_AUDIT_VERSION = 32`, Contract SHA-256 `0c767a6b80fdce2d4826e1aa5700db6070759d43f7b48a8e66d06bb5a1076c2e`), flipping `navigation.symbols.rename_and_workspace_search` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to `available` (`available: 14 -> 15`, `partial: 25 -> 24`, `openGaps: 35 -> 34`, UI-action parity SHA-256 `6dc13e25c5ce73a46f408abf9df74f053f655fd9922eefc3dc5ba9bcd1d4c43a`).

## 3. Implementation & Manifest Promotions

- `src/server/workspaceSymbolService.ts`: Implemented `WorkspaceSymbolService` (stamp-keyed file cache + generation-keyed reference & installed caches), `executeModFolderMdRename` (physical directory/manifest/inventory verification, `planMdRename` orchestration, double-checked pre-commit SHA-256 TOCTOU guard, and callback-delegated guarded file commits with zero new raw `fs.*` writer calls), and `runWorkspaceSymbolServiceSelftest()` (`6/6`).
- `src/lib/agentCapabilityAuthority.ts`, `src/lib/agentHistory.ts` & `.selftest.ts`, `server.ts`: Added `'project.md.rename'` to `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, registered `POST /api/agent/mod-folder/md-rename` (`kind: 'edit'`, dropping `2xx` `applied === false` dry-run rows while recording multi-file line/byte deltas and unified diffs on `apply: true`) and `GET /api/agent/mod-folder/symbols` (`durableKeyRoute`, `sourceOperationKeys`).
- `src/lib/forgeCapabilities.ts` & `.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/mcp-capability-selftest.ts`: Registered `project.md.rename@1` (`rename_md_symbol`) and `project.symbols.search@1` (`search_workspace_symbols`).
- Reviewed manifests promoted:
  - `config/durable-writers.json`: `sourceFingerprint: 675bbddd0b1da20e065595537dd1496657d6bb48b93a246abd679a753ab464dc` (`50` raw filesystem sources unchanged).
  - `config/forge-route-dispositions.json`: `357` routes, SHA-256 `316536b2f3b3e6c047f6546844bed9893a3f4b3bf8a24629b5b7f6cc911311d7`.
  - `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts` & `.selftest.ts`: `121` routes / `69` surfaces, SHA-256 `7471046cab3fc8962d3bf617fb36b11329b26141cd772aad9e99018a3d9c4716`.

## 4. Validation & Review

- `npx tsx src/server/workspaceSymbolService.ts`: `6/6 PASS`.
- `npm run lint -- --max-warnings 600`: `0 errors, 580 warnings` (zero new warnings).
- `npm run typecheck`: `0` errors.
- `npm run test:writers`: `30/30 + PASS + 8/8`.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`68` capabilities, `357` routes, `69` MCP aliases, `51` UI-action parity rows).
- `npm run test:action-receipt-coverage` & `:selftest` + `actionReceiptPolicyBundle.selftest.ts`: `PASS` (`79/79 + 23/23 + 19/19`).
- `npx tsx scripts/c06-contracts.selftest.ts` & `c06-api.selftest.ts`: `196/196` & `42/42 PASS`.
- `npm run test:mcp-capabilities`: `PASS` (`read=34, write=39, deploy=40`).
- `npm run test:native-deploy-mcp`: `6/6 PASS`.
- `npm run test:workspace-files-mcp`: `9/9 PASS` (including multi-source `OverrideCue` precedence `authored > base > dlc > installed`, qualified `md.DlcMissions.SharedCue` lookup, `rename_md_symbol` cross-file `&#97;` entity preview, `MD_RENAME_REFUSED` collision refusal, `MD_RENAME_CONFLICT` stale-hash refusal, atomic multi-file commit, post-rename symbol cache invalidation, and multi-file Action Ledger `edit` row).
- `npm run build`, `npm run test:oracles` (`134/134`), `npm run test:routes` (`741/741 PASS`), and `npm run precommit:check`: `[precommit] OK`.
- **Review:** Every acceptance criterion met; status `VERIFIED` in isolated Dev (`PARTIAL` for `#130`/`#19` overall pending `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project multi-source workspace symbol search and CAS MD symbol rename (#130, #19)`

## 5. Triggered AAR

- **Triggers:**
  1. `--generate-candidate` flagged missing `studio-*` `disconnected` UI projections on `project.md.rename` and `project.symbols.search`.
  2. ESLint `no-control-regex` flagged `\x00-\x1f\x7f` in `workspaceSymbolService.ts:665` (redundant with `hasInvalidNavigationPathCharacters`), and `tsc` caught `resolvedCfg.x4ReferencePath` -> `resolvedCfg.x4ReferenceRoot` at `server.ts:10726`.
  3. `--promote-candidate` on `action-receipt-coverage-audit.ts` required `.envelopeSha256` from `--write-candidate` JSON output rather than `.candidateSha256`.
  4. `searchWorkspaceScriptSymbols` in `shared/workspaceScriptSymbols.ts:96-98` sorts by `rank`, then `qualifiedName`, then `originPriority` — so multi-source precedence (`authored > base > dlc > installed`) applies when multiple sources declare the same `qualifiedName` (`md.SharedOverride.OverrideCue`).
- **Points to sustain:** Delegating `executeModFolderMdRename` disk writes through `writeWorkspaceFileGuarded` kept `durable-writers.json` raw source counts completely unchanged (`50` sources), and typing `__mdRenameLedger` on `ForgeDecoratedRequest` added zero ESLint `no-explicit-any` warnings (`580`).
- **Points to improve (work/approach):** Always declare both `vscode-extension-*` and `studio-*` host states in `FORGE_CAPABILITIES` `surfaces.ui` upfront, and read `--write-candidate`'s `envelopeSha256` key directly.
- **Points to improve (tools):** `ResolvedXsdConfig` mixes `*Path` (`x4GamePath`, `xsdSchemaPath`, `modWorkspacePath`) and `*Root` (`x4ReferenceRoot`) naming; `tsc --noEmit` caught the mismatch immediately before runtime tests.
- **Highest-risk observed weakness:** Without strict TypeScript checking (`ResolvedXsdConfig`), `resolvedCfg.x4ReferencePath` would have evaluated to `undefined`, silently disabling unpacked reference symbol indexing (`referenceIncluded: false`) when `x4ReferenceRoot` was configured; mitigated by `tsc --noEmit` + explicit `assert.equal(symRes.payload.referenceIncluded, true)` in `workspace-files-mcp.selftest.ts`.
