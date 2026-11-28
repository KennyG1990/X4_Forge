/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selftest for pure dual-mode domain indexing (`src/lib/domainSourceIndex.ts`).
 * Run: npx tsx src/lib/domainSourceIndex.selftest.ts
 */

import assert from 'node:assert/strict';
import type { ModWorkspace, PassthroughFile } from '../types';
import { lintAiscript } from './aiscriptLint';
import {
  countWorkspaceDomainAssets,
  indexSourceBackedAiScripts,
  indexSourceBackedDiffFiles,
  indexSourceBackedLibraries,
} from './domainSourceIndex';

function baseWorkspace(overrides: Partial<ModWorkspace> = {}): ModWorkspace {
  return {
    id: 'aic_test_mod',
    name: 'AI Command Test Mod',
    version: '1.00',
    author: 'Forge QA',
    description: 'Dual-mode domain index test workspace',
    nodes: [],
    links: [],
    uiWidgets: [],
    uiTheme: {
      backgroundColor: '#000',
      borderColor: '#000',
      accentColor: '#000',
      opacity: 1,
      showIcons: true,
    },
    ...overrides,
  };
}

const CUSTOM_PROTECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Hand-authored fleet protect order -->
<aiscript name="order.aic.protect" version="2" priority="5">
  <order id="AicProtectOrder" name="AIC Protect" description="Hold position" category="combat" infinite="true">
    <params>
      <param name="destination" type="position" text="{1041,10002}" default="null" required="true" />
      <param name="range" type="length" text="{1041,10003}" default="15km" advanced="true" />
    </params>
  </order>
  <interrupts>
    <handler ref="AttackHandler" />
    <handler name="HullDamaged">
      <conditions><event_object_hull_damaged object="this.ship" /></conditions>
      <actions><run_interrupt_script name="'move.flee'" /></actions>
    </handler>
  </interrupts>
  <patch sinceversion="2" />
  <attention min="insector">
    <actions>
      <label name="start" />
      <wait exact="5s" />
      <resume label="start" />
    </actions>
  </attention>
</aiscript>`;

const BAD_PARAM_AI_XML = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="order.aic.badparam" version="1">
  <order id="AicBadOrder" name="Bad Order" category="trade">
    <params>
      <param name="broken_note" type="text" text="Note" />
    </params>
  </order>
  <attention min="unknown">
    <actions><wait exact="1s" /></actions>
  </attention>
</aiscript>`;

const DIFF_RESPOND_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Vanilla AI script diff patch -->
<diff>
  <add sel="//aiscript/attention/actions" pos="prepend">
    <debug_text text="'AIC inspected hook'" chance="0" />
  </add>
  <remove sel="//aiscript/attention/actions/wait[@chance='0']" />
</diff>`;

const DIFF_INTERACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <replace sel="//aiscript/attention/actions/wait/@exact">2s</replace>
</diff>`;

const WARES_DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/wares">
    <ware id="aic_relay_core" name="AIC Relay Core" transport="container" volume="12" tags="economy">
      <price min="120" average="160" max="210" />
    </ware>
  </add>
  <replace sel="/wares/ware[@id='energycells']/price/@average">18</replace>
</diff>`;

const BASKETS_XML = `<?xml version="1.0" encoding="utf-8"?>
<baskets>
  <basket id="aic_trade_basket">
    <wares>
      <ware ware="aic_relay_core" />
      <ware ware="energycells" />
    </wares>
  </basket>
</baskets>`;

const GOD_DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/god/products">
    <product id="aic_relay_factory" owner="argon" type="factory" ware="aic_relay_core">
      <quota galaxy="4" />
    </product>
  </add>
  <add sel="/god/stations">
    <station id="aic_relay_hub" owner="player" type="tradingstation">
      <quota galaxy="1" />
    </station>
  </add>
</diff>`;

function run() {
  // 1. Positive: 4 hand-written AiLive-shaped aiscripts + libraries + diffs
  const passthroughFiles: PassthroughFile[] = [
    { path: 'aiscripts/order.aic.protect.xml', content: CUSTOM_PROTECT_XML, reason: 'partial' },
    { path: 'aiscripts\\order.aic.badparam.xml', content: BAD_PARAM_AI_XML, reason: 'partial' },
    { path: 'aiscripts/lib.respond.inspected.xml', content: DIFF_RESPOND_XML, reason: 'partial' },
    { path: 'aiscripts/player.interaction.xml', content: DIFF_INTERACTION_XML, reason: 'partial' },
    { path: 'libraries/wares.xml', content: WARES_DIFF_XML, reason: 'partial' },
    { path: 'libraries/baskets.xml', content: BASKETS_XML, reason: 'unknown_domain' },
    { path: 'libraries/god.xml', content: GOD_DIFF_XML, reason: 'unknown_domain' },
    { path: 'assets/props/aic_beacon.xml', content: '<diff><replace sel="//macros/macro/@class">object</replace></diff>', reason: 'unknown_domain' },
    // Negative-path passthrough entries that must be cleanly ignored or fail soft:
    { path: 'aiscripts/omitted_big.xml', omitted: true, reason: 'too_large', bytes: 9_999_999 },
    { path: 'aiscripts/binary_blob.bin', content: 'AAAA', contentEncoding: 'base64', reason: 'binary' },
    { path: 'aiscripts/notes.txt', content: 'plain text note', reason: 'unknown_domain' },
    { path: 'aiscripts/empty.xml', content: '   ', reason: 'partial' },
  ];
  passthroughFiles.forEach(pf => Object.freeze(pf));
  const frozenPassthrough = Object.freeze([...passthroughFiles]) as PassthroughFile[];
  const snapshotBefore = JSON.stringify(frozenPassthrough);

  const ws = baseWorkspace({ passthroughFiles: frozenPassthrough });

  // Verify AI Scripts indexing (must be 4, ordered by path)
  const aiScripts = indexSourceBackedAiScripts(ws);
  assert.equal(aiScripts.length, 4, `Expected 4 indexed source aiscripts, got ${aiScripts.length}`);
  assert.deepEqual(
    aiScripts.map(s => `${s.stem}:${s.mode}`),
    [
      'lib.respond.inspected:diff',
      'order.aic.badparam:aiscript',
      'order.aic.protect:aiscript',
      'player.interaction:diff',
    ],
  );

  const protect = aiScripts.find(s => s.stem === 'order.aic.protect')!;
  assert.equal(protect.name, 'order.aic.protect');
  assert.equal(protect.version, 2);
  assert.equal(protect.priority, 5);
  assert.equal(protect.order?.id, 'AicProtectOrder');
  assert.equal(protect.order?.infinite, true);
  assert.equal(protect.params.length, 2);
  assert.equal(protect.interruptCount, 2);
  assert.deepEqual(protect.attentionLevels, ['insector']);
  assert.deepEqual(protect.patchVersions, [2]);
  assert.equal(protect.rawXml, CUSTOM_PROTECT_XML, 'Raw XML must remain verbatim');
  assert.equal(lintAiscript(protect.rawXml).filter(f => f.severity === 'error').length, 0);

  const badParam = aiScripts.find(s => s.stem === 'order.aic.badparam')!;
  const badFindings = lintAiscript(badParam.rawXml);
  assert.ok(
    badFindings.some(f => f.code === 'aiscript.order_param_illegal_type'),
    `Expected aiscript.order_param_illegal_type on broken_note, got ${JSON.stringify(badFindings)}`,
  );

  const respondDiff = aiScripts.find(s => s.stem === 'lib.respond.inspected')!;
  assert.equal(respondDiff.mode, 'diff');
  assert.equal(respondDiff.targetVanillaPath, 'aiscripts/lib.respond.inspected.xml');
  assert.equal(respondDiff.diffOps.length, 2);
  assert.equal(respondDiff.diffOps[0].op, 'add');
  assert.equal(respondDiff.diffOps[0].pos, 'prepend');
  assert.equal(respondDiff.diffOps[1].op, 'remove');

  // Verify Libraries indexing
  const libs = indexSourceBackedLibraries(ws);
  assert.equal(libs.wares.length, 2);
  assert.equal(libs.wares[0].id, 'aic_relay_core');
  assert.equal(libs.wares[0].entryKind, 'definition');
  assert.equal(libs.wares[1].entryKind, 'diff_op');
  assert.equal(libs.baskets.length, 1);
  assert.equal(libs.baskets[0].id, 'aic_trade_basket');
  assert.equal(libs.god.length, 2);
  assert.deepEqual(libs.god.map(g => `${g.subKind}:${g.id}`), ['product:aic_relay_factory', 'station:aic_relay_hub']);

  // Verify Diff Files index across aiscripts/libraries/assets
  const diffFiles = indexSourceBackedDiffFiles(ws);
  assert.equal(diffFiles.length, 5, `Expected 5 <diff> files across domains, got ${diffFiles.length}`);
  assert.deepEqual(
    diffFiles.map(d => `${d.domain}:${d.path}`),
    [
      'aiscripts:aiscripts/lib.respond.inspected.xml',
      'aiscripts:aiscripts/player.interaction.xml',
      'assets:assets/props/aic_beacon.xml',
      'libraries:libraries/god.xml',
      'libraries:libraries/wares.xml',
    ],
  );

  // Verify domain asset counts
  const counts = countWorkspaceDomainAssets(ws);
  assert.equal(counts.totalAiScripts, 4);
  assert.equal(counts.totalWares, 2);
  assert.equal(counts.totalBaskets, 1);
  assert.equal(counts.totalGod, 2);
  assert.equal(counts.sourceDiffFiles, 5);

  // Verify zero mutation of workspace.passthroughFiles
  assert.equal(JSON.stringify(frozenPassthrough), snapshotBefore, 'passthroughFiles must never be mutated');

  // 2. Deduplication check: editable entry prevents double-counting same filename
  const dedupWs = baseWorkspace({
    aiScripts: [
      {
        id: 'editable_protect',
        name: 'order.aic.protect',
        description: '',
        command: '',
        attentionLevel: 'insector',
        params: [],
        interrupts: [],
        actions: [],
      },
    ],
    wares: [
      {
        id: 'aic_relay_core',
        name: 'AIC Relay Core',
        description: '',
        transport: 'container',
        volume: 12,
        minPrice: 120,
        avgPrice: 160,
        maxPrice: 210,
        prodTime: 10,
        prodAmount: 1,
      },
    ],
    passthroughFiles: frozenPassthrough,
  });
  const dedupAi = indexSourceBackedAiScripts(dedupWs);
  assert.equal(dedupAi.length, 3, 'Editable script overrides matching passthrough stem cleanly');
  assert.ok(!dedupAi.some(s => s.stem === 'order.aic.protect'));
  const dedupLibs = indexSourceBackedLibraries(dedupWs);
  assert.equal(dedupLibs.wares.length, 1, 'Editable ware overrides matching passthrough ware id cleanly');
  assert.equal(dedupLibs.wares[0].entryKind, 'diff_op');

  // 3. Negative: malformed XML degrades cleanly with parseError (no exception, rawXml preserved)
  const brokenXml = '<aiscript name="broken"><attention><actions><do_if></do_elseif>';
  const brokenWs = baseWorkspace({
    passthroughFiles: [
      { path: 'aiscripts/broken.xml', content: brokenXml, reason: 'partial' },
      { path: 'libraries/wares.xml', content: '<wares><ware id="bad"></mismatched>', reason: 'partial' },
    ],
  });
  const brokenAi = indexSourceBackedAiScripts(brokenWs);
  assert.equal(brokenAi.length, 1);
  assert.ok(brokenAi[0].parseError, 'Expected parseError on malformed aiscript');
  assert.equal(brokenAi[0].rawXml, brokenXml);

  const brokenLibs = indexSourceBackedLibraries(brokenWs);
  assert.equal(brokenLibs.wares.length, 1);
  assert.equal(brokenLibs.wares[0].entryKind, 'parse_error');
  assert.ok(brokenLibs.wares[0].parseError);

  console.log('domainSourceIndex.selftest PASS (positive + negative + lossless freeze verified)');
}

run();
