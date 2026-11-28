/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { sanitizeWorkspace, type ModWorkspace } from '../types';
import {
  classifyDiskFileCounts,
  classifyLocalEditState,
  decideDiskSyncAction,
  isContentVersionDrifted,
  workspaceImportSubstanceHash,
  type WorkspaceSourceSyncStatus,
} from './workspaceSourceSync';

function makeBaseWorkspace(): ModWorkspace {
  const raw = sanitizeWorkspace({
    id: 'ws_sync_test',
    name: 'Test Mod',
    version: '201',
    author: 'Tester',
    description: 'Sync test workspace',
    nodes: [],
    links: [],
    uiWidgets: [],
    uiTheme: {
      backgroundColor: '#0F1115',
      borderColor: '#06b6d4',
      accentColor: '#0891b2',
      opacity: 0.95,
      showIcons: true,
    },
    sourceStamp: {
      dir: 'C:\\Temp\\TestMod',
      hash: 'disk_hash_1',
      at: '2026-11-28T00:00:00.000Z',
    },
  });
  const importedWorkspaceHash = workspaceImportSubstanceHash(raw);
  return {
    ...raw,
    sourceStamp: {
      dir: raw.sourceStamp!.dir,
      hash: raw.sourceStamp!.hash,
      at: raw.sourceStamp!.at,
      importedWorkspaceHash,
    },
  };
}

function makeDriftStatus(over: Partial<WorkspaceSourceSyncStatus> = {}): WorkspaceSourceSyncStatus {
  return {
    known: true,
    inSync: false,
    detail: 'Folder changed on disk.',
    stampedHash: 'disk_hash_1',
    currentHash: 'disk_hash_2',
    diskMeta: { id: 'test_mod', name: 'Test Mod', version: '330' },
    diskFileCounts: { total: 6, md: 1, aiscripts: 4, libraries: 0, t: 1, ui: 0 },
    localEditState: 'clean',
    canAutoSync: true,
    versionDrifted: true,
    reimportTarget: { root: 'workspace', path: 'test_mod' },
    ...over,
  };
}

export function runWorkspaceSourceSyncSelftest(): { passed: number; total: number } {
  const checks: Array<[string, () => void]> = [
    [
      'clean_imported_workspace_allows_auto_reload',
      () => {
        const ws = makeBaseWorkspace();
        assert.equal(classifyLocalEditState(ws), 'clean');
        // Refreshing stamp hash/at alone keeps substance clean.
        const stampedOnly: ModWorkspace = {
          ...ws,
          sourceStamp: { ...ws.sourceStamp!, hash: 'disk_hash_1b', at: '2026-11-28T01:00:00.000Z' },
        };
        assert.equal(classifyLocalEditState(stampedOnly), 'clean');
        const decision = decideDiskSyncAction({
          sourceSync: makeDriftStatus(),
          workspace: ws,
          hasUnsavedLocalDirty: false,
          queuedSyncs: 0,
          syncConflict: false,
          inFlightReload: false,
          dismissedDiskHash: null,
          lastFailedAutoReloadHash: null,
        });
        assert.equal(decision, 'auto-reload');
      },
    ],
    [
      'local_edits_refuse_auto_reload_and_prompt_banner',
      () => {
        const ws = makeBaseWorkspace();
        const edited: ModWorkspace = { ...ws, version: '331' };
        assert.equal(classifyLocalEditState(edited), 'local-edits');
        const decision = decideDiskSyncAction({
          sourceSync: makeDriftStatus(),
          workspace: edited,
          hasUnsavedLocalDirty: false,
          queuedSyncs: 0,
          syncConflict: false,
          inFlightReload: false,
          dismissedDiskHash: null,
          lastFailedAutoReloadHash: null,
        });
        assert.equal(decision, 'prompt-banner');
      },
    ],
    [
      'legacy_stamp_refuses_auto_reload_and_prompts_banner',
      () => {
        const ws = makeBaseWorkspace();
        const legacy: ModWorkspace = {
          ...ws,
          sourceStamp: { dir: ws.sourceStamp!.dir, hash: ws.sourceStamp!.hash, at: ws.sourceStamp!.at },
        };
        assert.equal(classifyLocalEditState(legacy), 'legacy-stamp');
        const decision = decideDiskSyncAction({
          sourceSync: makeDriftStatus({ localEditState: 'legacy-stamp', canAutoSync: false }),
          workspace: legacy,
          hasUnsavedLocalDirty: false,
          queuedSyncs: 0,
          syncConflict: false,
          inFlightReload: false,
          dismissedDiskHash: null,
          lastFailedAutoReloadHash: null,
        });
        assert.equal(decision, 'prompt-banner');
      },
    ],
    [
      'dirty_queued_conflict_and_failed_hash_guards_block_auto_reload',
      () => {
        const ws = makeBaseWorkspace();
        const baseArgs = {
          sourceSync: makeDriftStatus(),
          workspace: ws,
          hasUnsavedLocalDirty: false,
          queuedSyncs: 0,
          syncConflict: false,
          inFlightReload: false,
          dismissedDiskHash: null,
          lastFailedAutoReloadHash: null,
        };
        assert.equal(decideDiskSyncAction({ ...baseArgs, hasUnsavedLocalDirty: true }), 'prompt-banner');
        assert.equal(decideDiskSyncAction({ ...baseArgs, queuedSyncs: 1 }), 'prompt-banner');
        assert.equal(decideDiskSyncAction({ ...baseArgs, syncConflict: true }), 'prompt-banner');
        assert.equal(decideDiskSyncAction({ ...baseArgs, inFlightReload: true }), 'prompt-banner');
        assert.equal(decideDiskSyncAction({ ...baseArgs, lastFailedAutoReloadHash: 'disk_hash_2' }), 'prompt-banner');
        assert.equal(
          decideDiskSyncAction({ ...baseArgs, sourceSync: makeDriftStatus({ reimportTarget: null, canAutoSync: false }) }),
          'prompt-banner',
        );
        assert.equal(
          decideDiskSyncAction({ ...baseArgs, hasUnsavedLocalDirty: true, dismissedDiskHash: 'disk_hash_2' }),
          'none',
        );
        assert.equal(
          decideDiskSyncAction({ ...baseArgs, sourceSync: makeDriftStatus({ currentHash: undefined, canAutoSync: false }) }),
          'prompt-banner',
        );
        assert.equal(
          decideDiskSyncAction({ ...baseArgs, sourceSync: makeDriftStatus({ inSync: true }) }),
          'none',
        );
      },
    ],
    [
      'content_version_drift_uses_x4_numeric_normalization',
      () => {
        assert.equal(isContentVersionDrifted('330', '201'), true);
        assert.equal(isContentVersionDrifted('330', '3.3.0'), false);
        assert.equal(isContentVersionDrifted('330', '330'), false);
        assert.equal(isContentVersionDrifted('', '201'), false);
      },
    ],
    [
      'disk_file_counts_classify_x4_folders_case_insensitively',
      () => {
        const counts = classifyDiskFileCounts([
          'content.xml',
          'md/init.xml',
          'aiscripts\\order.aic.opord.protectposition.xml',
          'AISCRIPTS/lib.respond.inspected.xml',
          'libraries/wares.xml',
          'libraries/baskets.xml',
          't/0001-l044.xml',
          'ui.xml',
          'ui/panel.lua',
          'README.md',
        ]);
        assert.deepEqual(counts, {
          total: 10,
          md: 1,
          aiscripts: 2,
          libraries: 2,
          t: 1,
          ui: 2,
        });
      },
    ],
  ];

  for (const [name, fn] of checks) {
    try {
      fn();
    } catch (err) {
      console.error(`FAIL ${name}:`, err);
      throw err;
    }
  }
  return { passed: checks.length, total: checks.length };
}

const isEntry = typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]?.includes('workspaceSourceSync.selftest');
if (isEntry) {
  const result = runWorkspaceSourceSyncSelftest();
  console.log(`workspaceSourceSync.selftest PASS: ${result.passed}/${result.total}`);
}
