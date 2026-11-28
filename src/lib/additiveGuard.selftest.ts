/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure deterministic selftest suite for Additive-Only Guard (#142).
 */

import assert from 'node:assert/strict';
import {
  EMPTY_VANILLA_ADDITIVE_INDEX,
  evaluateAdditiveOnlyGuard,
  toggleAdditiveOnlyInRulesJson,
  type VanillaAdditiveIndex,
} from './additiveGuard';

function fixtureVanillaIndex(): VanillaAdditiveIndex {
  return {
    filesAvailable: true,
    files: new Map([
      ['aiscripts/move.flee.xml', { path: 'aiscripts/move.flee.xml', sources: ['base'] }],
      ['md/setup.xml', { path: 'md/setup.xml', sources: ['base'] }],
      ['libraries/wares.xml', { path: 'libraries/wares.xml', sources: ['base', 'ego_dlc_split'] }],
      ['index/macros.xml', { path: 'index/macros.xml', sources: ['base'] }],
      ['maps/xu_ep2_universe/sectors.xml', { path: 'maps/xu_ep2_universe/sectors.xml', sources: ['base'] }],
      ['t/0001-l044.xml', { path: 't/0001-l044.xml', sources: ['base'] }],
    ]),
    aiScriptsAvailable: true,
    aiScripts: new Map([
      ['move.flee', { name: 'move.flee', path: 'aiscripts/move.flee.xml', source: 'base' }],
    ]),
    mdScriptsAvailable: true,
    mdScripts: new Map([
      ['setup', { name: 'Setup', path: 'md/setup.xml', source: 'base' }],
    ]),
    pageIdsAvailable: true,
    pageIds: new Map([
      ['1001', { id: '1001', path: 't/0001-l044.xml', source: 'base' }],
    ]),
  };
}

function run(): void {
  const vanillaIndex = fixtureVanillaIndex();

  // 1. Clean additive mod -> 0 findings, hooks report populated.
  const cleanReport = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex,
    project: {
      files: [
        {
          path: 'aiscripts/move.flee.xml',
          content: '<diff>\n  <add sel="/aiscript/attention/actions"><wait exact="1s"/></add>\n</diff>',
        },
        {
          path: 'aiscripts/my_custom_patrol.xml',
          content: '<aiscript name="my.custom.patrol"><actions><wait/></actions></aiscript>',
        },
        {
          path: 'md/my_custom_controller.xml',
          content: '<mdscript name="MyCustomController"><cues><cue name="Init"/></cues></mdscript>',
        },
        {
          path: 't/0001-l044.xml',
          content: '<language id="44"><page id="998877"><t id="1">Custom Text</t></page></language>',
        },
      ],
    },
  });
  assert.equal(cleanReport.findings.length, 0, 'clean additive mod must emit 0 findings');
  assert.equal(cleanReport.advisoryViolationsCount, 0);
  assert.equal(cleanReport.coverageGaps.length, 0);
  assert.equal(cleanReport.hooks.length, 1);
  assert.equal(cleanReport.hooks[0]?.additive, true);
  assert.equal(cleanReport.hooks[0]?.isVanillaTarget, true);
  assert.equal(cleanReport.hooks[0]?.vanillaTarget, 'aiscripts/move.flee.xml');
  assert.equal(cleanReport.hooks[0]?.sel, '/aiscript/attention/actions');

  // 2. Check 1: Shadowed vanilla files across 5 dirs refused; t/0001-l044.xml with custom page is allowed.
  const shadowReport = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex,
    project: {
      files: [
        { path: 'aiscripts/move.flee.xml', content: '<aiscript name="other.name"/>' },
        { path: 'md/setup.xml', content: '<mdscript name="OtherSetup"/>' },
        { path: 'libraries/wares.xml', content: '<wares><ware id="custom"/></wares>' },
        { path: 'index/macros.xml', content: '<index><entry name="x" value="y"/></index>' },
        { path: 'maps/xu_ep2_universe/sectors.xml', content: '<macros><macro name="x"/></macros>' },
        { path: 't/0001-l044.xml', content: '<language id="44"><page id="998877"><t id="1">Ok</t></page></language>' },
      ],
    },
  });
  assert.equal(shadowReport.summary.vanillaFilesShadowed, 5);
  assert.equal(shadowReport.findings.filter(f => f.code === 'additive.shadowed_vanilla_file').length, 5);
  assert.equal(shadowReport.findings.some(f => f.filePath === 't/0001-l044.xml'), false);

  // 3. Check 2: <replace>, <remove>, <add type="@...">, and <add sel=".../@attr"> on vanilla refused;
  // companion-mod non-vanilla diff allowed.
  const diffReport = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex,
    project: {
      files: [
        {
          path: 'libraries/wares.xml',
          content: [
            '<diff>',
            '  <replace sel="/wares/ware[@id=\'hullparts\']/price/@average">120</replace>',
            '  <remove sel="/wares/ware[@id=\'claytronics\']"/>',
            '  <add sel="/wares/ware[@id=\'energycells\']" type="@tags">illegal</add>',
            '  <add sel="/wares/ware[@id=\'microchips\']/@amount">5</add>',
            '  <add sel="/wares"><ware id="mod_only_ware"/></add>',
            '</diff>',
          ].join('\n'),
        },
        {
          path: 'libraries/companion_mod_only.xml',
          content: '<diff><replace sel="/companion/node/@attr">1</replace></diff>',
        },
      ],
    },
  });
  assert.equal(diffReport.findings.filter(f => f.code === 'additive.diff_replace_forbidden').length, 1);
  assert.equal(diffReport.findings.filter(f => f.code === 'additive.diff_remove_forbidden').length, 1);
  assert.equal(diffReport.findings.filter(f => f.code === 'additive.diff_attribute_add_forbidden').length, 2);
  assert.equal(diffReport.findings.some(f => f.filePath === 'libraries/companion_mod_only.xml'), false);
  assert.equal(diffReport.hooks.length, 6);
  assert.equal(diffReport.summary.additiveDiffHooks, 1);

  // 4. Check 3: Reused vanilla aiscript / mdscript names (case-insensitive) on non-vanilla paths refused.
  const scriptReuseReport = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex,
    project: {
      files: [
        { path: 'aiscripts/renamed_flee.xml', content: '<aiscript name="Move.Flee"/>' },
        { path: 'md/renamed_setup.xml', content: '<mdscript name="setup"/>' },
      ],
    },
  });
  assert.equal(scriptReuseReport.summary.reusedAiScriptNames, 1);
  assert.equal(scriptReuseReport.summary.reusedMdScriptNames, 1);
  assert.equal(scriptReuseReport.findings[0]?.code, 'additive.reused_vanilla_aiscript_name');
  assert.equal(scriptReuseReport.findings[1]?.code, 'additive.reused_vanilla_mdscript_name');

  // 5. Check 4: Language files reusing vanilla page ID (plain <language> AND <diff> + leading zeros) refused.
  const pageReuseReport = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex,
    project: {
      files: [
        {
          path: 't/0001-l044.xml',
          content: '<language id="44"><page id="1001"><t id="1">Override</t></page><page id="998877"><t id="1">Ok</t></page></language>',
        },
        {
          path: 't/custom-l044.xml',
          content: '<diff><add sel="/language"><page id="01001"><t id="2">Override</t></page></add></diff>',
        },
      ],
    },
  });
  assert.equal(pageReuseReport.summary.reusedPageIds, 2);
  assert.equal(pageReuseReport.findings.every(f => f.code === 'additive.reused_vanilla_page_id'), true);

  // 6. Advisory mode (`enforced: false`): 0 blocking findings, advisoryViolationsCount > 0, hooks kept, 0 coverageGaps.
  const advisoryReport = evaluateAdditiveOnlyGuard({
    enforced: false,
    vanillaIndex: EMPTY_VANILLA_ADDITIVE_INDEX,
    project: {
      files: [
        {
          path: 'aiscripts/move.flee.xml',
          content: '<diff><replace sel="/aiscript/order/@id">x</replace><add sel="/aiscript"><params/></add></diff>',
        },
      ],
    },
  });
  assert.equal(advisoryReport.enabled, false);
  assert.equal(advisoryReport.findings.length, 0);
  assert.equal(advisoryReport.advisoryViolationsCount, 1);
  assert.equal(advisoryReport.hooks.length, 2);
  assert.equal(advisoryReport.coverageGaps.length, 0);

  // 7. Unavailable corpus with enforced=true: emits honest coverageGaps AND still refuses destructive diffs.
  const unavailableEnforced = evaluateAdditiveOnlyGuard({
    enforced: true,
    vanillaIndex: EMPTY_VANILLA_ADDITIVE_INDEX,
    project: {
      files: [
        {
          path: 'md/setup.xml',
          content: '<diff><remove sel="/mdscript/cues/cue"/></diff>',
        },
      ],
    },
  });
  assert.equal(unavailableEnforced.available, false);
  assert.equal(unavailableEnforced.coverageGaps.length, 4);
  assert.equal(unavailableEnforced.findings.length, 1);
  assert.equal(unavailableEnforced.findings[0]?.code, 'additive.diff_remove_forbidden');

  // 8. toggleAdditiveOnlyInRulesJson helper.
  const created = toggleAdditiveOnlyInRulesJson(undefined, true);
  assert.equal(created.ok, true);
  if (created.ok) {
    const parsedCreated = JSON.parse(created.content);
    assert.equal(parsedCreated.version, 1);
    assert.equal(parsedCreated.additiveOnly, true);
    assert.deepEqual(parsedCreated.suppressions, []);
  }
  const existing = JSON.stringify({
    version: 1,
    versionPolicy: 'per-release',
    suppressions: [{ id: 's1', owner: 'qa', reason: 'Keep suppression', reviewBy: '2027-01-01', code: 'x.w', file: 'md/a.xml' }],
    contracts: { knownChains: [], wireKeys: [], expectedRegisters: [] },
  });
  const enabledExisting = toggleAdditiveOnlyInRulesJson(existing, true);
  assert.equal(enabledExisting.ok, true);
  if (enabledExisting.ok) {
    const parsedEnabled = JSON.parse(enabledExisting.content);
    assert.equal(parsedEnabled.additiveOnly, true);
    assert.equal(parsedEnabled.versionPolicy, 'per-release');
    assert.equal(parsedEnabled.suppressions.length, 1);
    const disabledExisting = toggleAdditiveOnlyInRulesJson(enabledExisting.content, false);
    assert.equal(disabledExisting.ok, true);
    if (disabledExisting.ok) {
      const parsedDisabled = JSON.parse(disabledExisting.content);
      assert.equal(parsedDisabled.additiveOnly, false);
      assert.equal(parsedDisabled.suppressions.length, 1);
    }
  }
  const invalidToggle = toggleAdditiveOnlyInRulesJson('{broken', true);
  assert.equal(invalidToggle.ok, false);

  console.log('additiveGuard.selftest PASS (8/8 matrices verified)');
}

run();
