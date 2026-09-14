import { expect, test, type Page } from '@playwright/test';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

test.describe('Marketing Showcase UI Screenshots', () => {
  test.use({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  test('capture all primary X4 Forge Studio views and actions', async ({ page }) => {
    // Intercept galaxy map API to ensure vibrant sector map is displayed
    await page.route('**/api/agent/galaxy-map', async route => {
      const clusters = [
        {
          macro: 'Cluster_01_macro',
          name: 'Argon Prime',
          pos: { x: -8000000, y: 0, z: -5000000 },
          sectors: [
            { macro: 'Cluster_01_Sector001_macro', name: 'Argon Prime', cluster: 'Cluster_01_macro', pos: { x: -8000000, y: 0, z: -5000000 } }
          ]
        },
        {
          macro: 'Cluster_02_macro',
          name: 'Grand Exchange',
          pos: { x: 4000000, y: 0, z: 2000000 },
          sectors: [
            { macro: 'Cluster_02_Sector001_macro', name: 'Grand Exchange I', cluster: 'Cluster_02_macro', pos: { x: 4000000, y: 0, z: 2000000 } },
            { macro: 'Cluster_02_Sector002_macro', name: 'Grand Exchange III', cluster: 'Cluster_02_macro', pos: { x: 4500000, y: 0, z: 2500000 } }
          ]
        },
        {
          macro: 'Cluster_03_macro',
          name: 'Black Hole Sun',
          pos: { x: -2000000, y: 0, z: 1000000 },
          sectors: [
            { macro: 'Cluster_03_Sector001_macro', name: 'Black Hole Sun IV', cluster: 'Cluster_03_macro', pos: { x: -2000000, y: 0, z: 1000000 } }
          ]
        },
        {
          macro: 'Cluster_04_macro',
          name: 'Trinity Sanctum',
          pos: { x: 1000000, y: 0, z: -8000000 },
          sectors: [
            { macro: 'Cluster_04_Sector001_macro', name: 'Trinity Sanctum VII', cluster: 'Cluster_04_macro', pos: { x: 1000000, y: 0, z: -8000000 } }
          ]
        },
        {
          macro: 'Cluster_05_macro',
          name: 'Matrix #451',
          pos: { x: 9000000, y: 0, z: -7000000 },
          sectors: [
            { macro: 'Cluster_05_Sector001_macro', name: 'Matrix #451', cluster: 'Cluster_05_macro', pos: { x: 9000000, y: 0, z: -7000000 } }
          ]
        },
        {
          macro: 'Cluster_06_macro',
          name: 'Family Zhin',
          pos: { x: -6000000, y: 0, z: 9000000 },
          sectors: [
            { macro: 'Cluster_06_Sector001_macro', name: 'Family Zhin', cluster: 'Cluster_06_macro', pos: { x: -6000000, y: 0, z: 9000000 } }
          ]
        },
        {
          macro: 'Cluster_07_macro',
          name: 'Sol / Earth',
          pos: { x: -12000000, y: 0, z: -10000000 },
          sectors: [
            { macro: 'Cluster_07_Sector001_macro', name: 'Earth', cluster: 'Cluster_07_macro', pos: { x: -12000000, y: 0, z: -10000000 } },
            { macro: 'Cluster_07_Sector002_macro', name: 'Mars', cluster: 'Cluster_07_macro', pos: { x: -11000000, y: 0, z: -9000000 } }
          ]
        }
      ];

      const sectors = clusters.flatMap(c => c.sectors);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clusters,
          sectors,
          bounds: { minX: -14000000, maxX: 12000000, minZ: -12000000, maxZ: 11000000 },
          counts: { clusters: clusters.length, sectors: sectors.length, placedClusters: clusters.length },
          sources: {
            baseFiles: 383,
            extensionFiles: 1,
            galaxyDiffsApplied: 0,
            clusterMacroFilesApplied: 0,
            galaxyConnectionsAdded: 0,
            clusterMacrosAdded: 0,
            ignoredFiles: [],
            appliedFiles: ['maps/xu_ep2_universe/galaxy.xml']
          }
        })
      });
    });

    async function saveCleanScreenshot(filename: string) {
      // Hide startup walkaround panel, conflict toasts, and popovers for clean marketing shots
      await page.evaluate(() => {
        // Hide startup walkaround panel
        const allDivs = Array.from(document.querySelectorAll('div, section, aside'));
        allDivs.forEach(el => {
          if (el.textContent && el.textContent.includes('STARTUP WALKAROUND') && el.classList.contains('fixed')) {
            (el as HTMLElement).style.display = 'none';
          }
        });

        // Hide toast notifications like "Used server copy..."
        allDivs.forEach(el => {
          if (el.textContent && el.textContent.includes('Used server copy') && (el.classList.contains('fixed') || el.classList.contains('absolute'))) {
            (el as HTMLElement).style.display = 'none';
          }
        });

        // Dismiss conflict dialog if visible
        const serverCopyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Use server copy')) as HTMLElement;
        if (serverCopyBtn) serverCopyBtn.click();
      }).catch(() => {});

      await page.waitForTimeout(400);
      const screenshotPath = test.info().outputPath(filename);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await test.info().attach(filename, { path: screenshotPath, contentType: 'image/png' });
      console.log(`[SHOWCASE] Saved: ${filename}`);
    }

    async function loadWorkspaceDirectly(ws: any) {
      await seedServerWorkspace(ws);
      await page.addInitScript(() => {
        localStorage.setItem('x4_forge_experience_mode', 'expert');
        localStorage.removeItem('x4_mod_studio_workspace');
        localStorage.removeItem('x4_mod_studio_version');
      });
      await page.goto('/');
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        const serverCopyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Use server copy')) as HTMLElement;
        if (serverCopyBtn) serverCopyBtn.click();
      }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------------------
    // 01: Visual Mission Director Graph (Canvas)
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 01: Visual Mission Director Graph');
    const bountyMod = buildTemplateWorkspace('reward_on_kill');
    bountyMod.name = 'X4_Bounty_Hunter_System';
    bountyMod.description = 'Dynamic bounty reward triggers, combat kill monitoring, and credit payout cues.';
    await loadWorkspaceDirectly(bountyMod);

    const nodeTarget = page.locator('text=reward_player').first();
    if (await nodeTarget.isVisible()) {
      await nodeTarget.click();
      await page.waitForTimeout(400);
    }
    await saveCleanScreenshot('01_visual_mission_director_graph.png');

    // -------------------------------------------------------------------------
    // 02: XML Patching & Diff Simulation
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 02: XML Patching & Diff Simulation');
    const patchMod = buildTemplateWorkspace('price_tweak');
    patchMod.name = 'X4_Economy_Rebalance_Overhaul';
    patchMod.description = 'Custom price curves, weapon damages, and station ware trade balance patch.';
    patchMod.xmlPatches = [
      {
        id: 'patch_energycells_avg',
        targetFile: 'libraries/wares.xml',
        sel: "/wares/ware[@id='energycells']/price/@average",
        action: 'replace',
        content: '48',
        note: 'Adjust Energy Cells baseline price for sector factory startup',
        includeInBuild: true,
      },
      {
        id: 'patch_energycells_min',
        targetFile: 'libraries/wares.xml',
        sel: "/wares/ware[@id='energycells']/price/@min",
        action: 'replace',
        content: '32',
        note: 'Adjust minimum price floor',
        includeInBuild: true,
      },
      {
        id: 'patch_antimatter_production',
        targetFile: 'libraries/wares.xml',
        sel: "/wares/ware[@id='antimattercells']",
        action: 'add',
        content: '<production time="60" amount="120" method="default">\n  <primary>\n    <ware ware="energycells" amount="40" />\n    <ware ware="hydrogen" amount="160" />\n  </primary>\n</production>',
        note: 'Add accelerated antimatter synthesis method',
        includeInBuild: true,
      }
    ];
    await loadWorkspaceDirectly(patchMod);

    const patchNav = page.locator('button:has-text("XML Patching"), button:has-text("Patch")').first();
    if (await patchNav.isVisible()) {
      await patchNav.click();
      await page.waitForTimeout(1200);
    }
    await saveCleanScreenshot('02_xml_patching_and_diff_simulation.png');

    // -------------------------------------------------------------------------
    // 03: Bulk XML Transforms Workbench
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 03: Bulk XML Transforms Workbench');
    const bulkToggle = page.locator('button:has-text("BULK TRANSFORM"), button:has-text("Bulk")').first();
    if (await bulkToggle.isVisible()) {
      await bulkToggle.click();
      await page.waitForTimeout(800);
    }
    await saveCleanScreenshot('03_bulk_xml_transforms_workbench.png');

    // -------------------------------------------------------------------------
    // 04: HUD & Lua UI 2D Canvas Editor
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 04: HUD & Lua UI 2D Canvas Editor');
    const uiMod = {
      ...buildTemplateWorkspace('welcome'),
      id: 'x4-ui-showcase',
      name: 'X4_Custom_Cockpit_HUD',
      description: 'Faithful 2D X4 UI source-first renderer with real Lua widgets & keep-out guides.',
      passthroughFiles: [
        {
          path: 'ui.xml',
          content: [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<addon name="x4-custom-cockpit-hud">',
            '  <environment type="menus">',
            '    <file name="ui/cockpit_hud.lua" />',
            '  </environment>',
            '</addon>',
          ].join('\n'),
        },
        {
          path: 'ui/cockpit_hud.lua',
          content: [
            '-- X4 Custom Cockpit Interface & Tactical HUD',
            'local menu = { name = "CockpitTacticalHUD", layer = 2 }',
            'local frame = Helper.createFrameHandle(menu, { width = 520, height = 340, x = 60, y = 120 })',
            'local table = frame:addTable(2, { width = 500, reserveScrollBar = false, scaling = false })',
            'local headerRow = table:addRow(true, { bgColor = Color.group_title })',
            'headerRow[1]:createText("TACTICAL FLEET STATUS", { font = "regular", bold = true, color = Color.text_highlight })',
            'headerRow[2]:createText("SECTOR: GRAND EXCHANGE I", { align = "right", color = Color.text_normal })',
            'local statusRow = table:addRow(false, {})',
            'statusRow[1]:createText("Carrier Battle Group [Alpha]")',
            'statusRow[2]:createText("ENGAGED - SHIELDS 94%", { color = Color.green_bright })',
            'local cmdRow = table:addRow(false, {})',
            'cmdRow[1]:createButton({ text = "LAUNCH ESCORT PATROL", height = 32 })',
            'cmdRow[2]:createButton({ text = "ORDER FLEET RETREAT", height = 32, bgColor = Color.red_dark })',
            'frame:display()',
          ].join('\n'),
        },
      ],
    };
    await loadWorkspaceDirectly(uiMod);

    const uiNav = page.locator('button:has-text("HUD & Lua UI"), button:has-text("UI")').first();
    if (await uiNav.isVisible()) {
      await uiNav.click();
      await page.waitForTimeout(2000);
    }
    await saveCleanScreenshot('04_x4_ui_hud_and_lua_editor.png');

    // -------------------------------------------------------------------------
    // 05: External Integration Contracts & REST API Seam
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 05: External Integration Contracts');
    const contractMod = {
      ...buildTemplateWorkspace('welcome'),
      name: 'X4_AI_Companion_Bridge',
      description: 'External AI model & companion bridge with typed JSON endpoints.',
      integrationContract: {
        namespace: 'x4_companion_ai',
        baseUrl: 'http://127.0.0.1:8713',
        endpoints: [
          {
            id: 'query_tactical_advice',
            method: 'POST',
            path: '/v1/tactical/advice',
            params: [
              { name: 'sector', type: 'string' },
              { name: 'hullPercent', type: 'number' },
              { name: 'hostilesCount', type: 'number' }
            ],
            response: [
              { name: 'action', type: 'string' },
              { name: 'recommendedFormation', type: 'string' },
              { name: 'priorityTarget', type: 'string' }
            ]
          },
          {
            id: 'get_system_health',
            method: 'GET',
            path: '/v1/health',
            response: [
              { name: 'status', type: 'string' },
              { name: 'latencyMs', type: 'number' }
            ]
          }
        ]
      }
    };
    await loadWorkspaceDirectly(contractMod);

    const contractNav = page.locator('button:has-text("Contracts")').first();
    if (await contractNav.isVisible()) {
      await contractNav.click();
      await page.waitForTimeout(1200);
    }
    await saveCleanScreenshot('05_external_integration_contracts_editor.png');

    // -------------------------------------------------------------------------
    // 06: Project Overview, Dependencies & Release Center
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 06: Project Packaging & Release Center');
    const projectNav = page.locator('button:has-text("Project")').first();
    if (await projectNav.isVisible()) {
      await projectNav.click();
      await page.waitForTimeout(1200);
    }
    await saveCleanScreenshot('06_project_overview_and_release_center.png');

    // -------------------------------------------------------------------------
    // 07: Galaxy Map & Sector Navigator
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 07: Galaxy Map Navigator');
    const galaxyNav = page.locator('button:has-text("Galaxy")').first();
    if (await galaxyNav.isVisible()) {
      await galaxyNav.click();
      await page.waitForTimeout(1500);
    }
    await saveCleanScreenshot('07_galaxy_map_and_sector_navigator.png');

    // -------------------------------------------------------------------------
    // 08: Wares & Jobs Data Configurator
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 08: Wares & Jobs Data Configurator');
    const dataMod = {
      ...buildTemplateWorkspace('welcome'),
      name: 'X4_Military_Logistics_Expansion',
      description: 'Custom military wares, fusion reactor cores, and high-security defense jobs.',
      wares: [
        {
          id: 'fusion_core_heavy',
          name: 'Heavy Fusion Reactor Core Mk.3',
          description: 'High-yield military grade power reactor core for capital ships',
          transport: 'container',
          volume: 42,
          minPrice: 1250,
          avgPrice: 1890,
          maxPrice: 2450,
          prodTime: 90,
          prodAmount: 4,
          primaryWares: [{ ware: 'energycells', amount: 120 }, { ware: 'microchips', amount: 8 }]
        },
        {
          id: 'plasma_conduit_advanced',
          name: 'Superconducting Plasma Conduit',
          description: 'Cryogenically insulated high-voltage plasma routing line for heavy turrets',
          transport: 'container',
          volume: 18,
          minPrice: 420,
          avgPrice: 680,
          maxPrice: 950,
          prodTime: 45,
          prodAmount: 8,
          primaryWares: [{ ware: 'energycells', amount: 40 }, { ware: 'refinedmetals', amount: 12 }]
        }
      ],
      jobs: [
        {
          id: 'job_argon_heavy_patrol',
          name: 'Argon Prime Heavy Defense Fleet',
          faction: 'argon',
          shipClass: 'destroyer',
          shipMacro: 'ship_arg_l_destroyer_01_a_macro',
          galaxyQuota: 8,
          sectorQuota: 2,
          taskScript: 'move.patrol',
          rebuildOnDestroy: true
        },
        {
          id: 'job_terran_sol_blockade',
          name: 'Sol Border Interceptor Squadron',
          faction: 'terran',
          shipClass: 'fighter',
          shipMacro: 'ship_ter_s_fighter_01_a_macro',
          galaxyQuota: 24,
          sectorQuota: 6,
          taskScript: 'fight.attack.object',
          rebuildOnDestroy: true
        }
      ]
    };
    await loadWorkspaceDirectly(dataMod);

    const dataNav = page.locator('button:has-text("Wares & Jobs"), button:has-text("Data")').first();
    if (await dataNav.isVisible()) {
      await dataNav.click();
      await page.waitForTimeout(1000);
      const wareItem = page.locator('text=Heavy Fusion Reactor Core Mk.3').first();
      if (await wareItem.isVisible()) {
        await wareItem.click();
        await page.waitForTimeout(400);
      }
    }
    await saveCleanScreenshot('08_wares_and_jobs_configurator.png');

    // -------------------------------------------------------------------------
    // 09: AI Scripts Behavior Editor
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 09: AI Scripts Behavior Editor');
    const aiModWorkspace = {
      ...buildTemplateWorkspace('welcome'),
      name: 'X4_Tactical_AI_Overhaul',
      description: 'Advanced NPC tactical combat behaviors and formation escort routines.',
      aiScripts: [
        {
          id: 'script_hunter_escort',
          name: 'Elite Fighter Escort Protocol',
          description: 'Active interceptor escort behavior for player capital ships',
          command: 'escort',
          attentionLevel: 'high',
          params: [
            { name: 'target', type: 'object', defaultValue: 'player.ship', comment: 'Lead vessel to guard' },
            { name: 'engagementDistance', type: 'number', defaultValue: '5000', comment: 'Maximum combat radius (meters)' }
          ],
          interrupts: [
            { id: 'int_1', event: 'event_object_attacked', action: 'Engage attacker immediately' },
            { id: 'int_2', event: 'event_object_shield_critical', action: 'Break off and regenerate' }
          ],
          actions: [
            { id: 'act_1', command: 'move_to', label: 'Form Escort Delta Wing Formation', properties: { formation: 'delta', spacing: 250 } },
            { id: 'act_2', command: 'find_objects', label: 'Scan for Hostile Xenon / Pirates', properties: { class: 'ship', max: 5 } },
            { id: 'act_3', command: 'shoot', label: 'Weapons Free - Suppress Target', properties: { priority: 'nearest' } }
          ]
        }
      ]
    };
    await loadWorkspaceDirectly(aiModWorkspace);

    const aiNav = page.locator('button:has-text("AI Scripts"), button:has-text("AI")').first();
    if (await aiNav.isVisible()) {
      await aiNav.click();
      await page.waitForTimeout(1000);
      const scriptItem = page.locator('text=Elite Fighter Escort Protocol').first();
      if (await scriptItem.isVisible()) {
        await scriptItem.click();
        await page.waitForTimeout(400);
      }
    }
    await saveCleanScreenshot('09_aiscripts_behavior_editor.png');

    // -------------------------------------------------------------------------
    // 10: Languages (t/ files) Localization Editor
    // -------------------------------------------------------------------------
    console.log('[SHOWCASE] 10: Languages Localization Editor');
    const transMod = {
      ...buildTemplateWorkspace('welcome'),
      name: 'X4_Lore_and_Dialogues_Expansion',
      description: 'Multi-language voice and text localization tables for custom stories.',
      tFiles: [
        {
          languageId: '44',
          fileName: '0001-l044.xml',
          pages: [
            {
              id: '99901',
              title: 'Mission Briefings & Dialogue',
              items: [
                { id: '101', value: 'Incoming Transmission: High Priority Bounty Contract', description: 'Bounty briefing intro' },
                { id: '102', value: 'Target neutralized. 250,000 credits transferred to your account.', description: 'Bounty reward notification' },
                { id: '103', value: 'Warning: Heavy Xenon fleet signature detected in sector.', description: 'Sector alarm' }
              ]
            },
            {
              id: '99902',
              title: 'Custom Station & Equipment Wares',
              items: [
                { id: '201', value: 'Heavy Fusion Reactor Core Mk.3', description: 'Ware item name' },
                { id: '202', value: 'State of the art antimatter-assisted plasma generator.', description: 'Ware description' }
              ]
            }
          ]
        },
        {
          languageId: '49',
          fileName: '0001-l049.xml',
          pages: [
            {
              id: '99901',
              title: 'Missionsbesprechungen & Dialoge',
              items: [
                { id: '101', value: 'Eingehende Übertragung: Kopfgeldauftrag mit hoher Priorität', description: 'Bounty briefing intro' },
                { id: '102', value: 'Ziel neutralisiert. 250.000 Credits auf Ihr Konto überwiesen.', description: 'Bounty reward notification' }
              ]
            }
          ]
        }
      ]
    };
    await loadWorkspaceDirectly(transMod);

    const transNav = page.locator('button:has-text("Languages"), button:has-text("T/")').first();
    if (await transNav.isVisible()) {
      await transNav.click();
      await page.waitForTimeout(1000);
      const pageItem = page.locator('text=99901').first();
      if (await pageItem.isVisible()) {
        await pageItem.click();
        await page.waitForTimeout(400);
      }
    }
    await saveCleanScreenshot('10_t_file_localization_editor.png');
  });
});
