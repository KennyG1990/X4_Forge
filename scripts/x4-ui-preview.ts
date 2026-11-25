#!/usr/bin/env tsx
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  X4_UI_HEADLESS_PREVIEW_SCHEMA,
  previewX4UiLua,
  type X4UiHeadlessFixtureInput,
  type X4UiHeadlessPreviewResult,
} from '../src/server/x4UiHeadlessPreview';
import { resolveXsdConfig } from '../src/lib/xsdParser';

interface ParsedCliArgs {
  selftest: boolean;
  help: boolean;
  filePath: string | null;
  fixturePath: string | null;
  target: string | undefined;
  frameParam: string | undefined;
  width: number | undefined;
  height: number | undefined;
  uiScale: number | undefined;
  referenceRoot: string | undefined;
  json: boolean;
  failOnError: boolean;
  failOnClip: boolean;
  failOnOverlap: boolean;
}

function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const out: ParsedCliArgs = {
    selftest: false,
    help: false,
    filePath: null,
    fixturePath: null,
    target: undefined,
    frameParam: undefined,
    width: undefined,
    height: undefined,
    uiScale: undefined,
    referenceRoot: undefined,
    json: false,
    failOnError: false,
    failOnClip: false,
    failOnOverlap: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--selftest') out.selftest = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-error') out.failOnError = true;
    else if (arg === '--fail-on-clip') out.failOnClip = true;
    else if (arg === '--fail-on-overlap') out.failOnOverlap = true;
    else if (arg === '--fixture' && i + 1 < argv.length) out.fixturePath = argv[++i];
    else if (arg === '--target' && i + 1 < argv.length) out.target = argv[++i];
    else if (arg === '--frame-param' && i + 1 < argv.length) out.frameParam = argv[++i];
    else if (arg === '--width' && i + 1 < argv.length) out.width = Number(argv[++i]);
    else if (arg === '--height' && i + 1 < argv.length) out.height = Number(argv[++i]);
    else if (arg === '--ui-scale' && i + 1 < argv.length) out.uiScale = Number(argv[++i]);
    else if (arg === '--reference-root' && i + 1 < argv.length) out.referenceRoot = argv[++i];
    else if (!arg.startsWith('-') && !out.filePath) out.filePath = arg;
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  return out;
}

function formatHumanSummary(result: X4UiHeadlessPreviewResult): string {
  const lines: string[] = [];
  lines.push(`X4 UI Headless Preview — ${result.path} (${result.bytes} bytes)`);
  lines.push(`  Corpus         : ${result.corpus.status}${result.corpus.reason ? ` (${result.corpus.reason})` : ''}`);
  lines.push(`  Drawable       : ${result.profile.drawable.width}x${result.profile.drawable.height} @ scale ${result.profile.uiScale}`);
  lines.push(`  Lint           : ${result.lint.status} (errors=${result.lint.errorCount}, warnings=${result.lint.warningCount}, gaps=${result.lint.verificationGapCount}, staticallyVerified=${result.lint.isStaticallyVerified})`);
  lines.push(`  Target         : ${result.selectedTarget ? `${result.selectedTarget.name || result.selectedTarget.kind} (lines ${result.selectedTarget.lineStart}-${result.selectedTarget.lineEnd}, harness=${result.previewHarness})` : 'none'}`);
  lines.push(`  Layout / Scene : program=${result.layout.programStatus}, scene=${result.layout.sceneStatus}${result.layout.refusalReason ? ` (${result.layout.refusalReason})` : ''}`);
  lines.push(`  Geometry       : frames=${result.layout.frameCount}, tables=${result.layout.tableCount}, rows=${result.layout.rowCount}, widgets=${result.layout.widgetCount}`);
  lines.push(`  Checks         : clippedText=${result.layout.clippedTextCount}, overlaps=${result.layout.overlapCount}, appliedSamples=${result.layout.appliedSamples}, unresolvedSamples=${result.layout.unresolvedSampleCount}`);
  for (const finding of result.lint.findings) {
    lines.push(`  [LINT ${finding.severity.toUpperCase()}] L${finding.line}:${finding.column} ${finding.code} — ${finding.message}`);
  }
  for (const clip of result.layout.clippedText) {
    lines.push(`  [CLIP] L${clip.line}:${clip.column} "${clip.displayedText}" (width=${clip.width}px, available=${clip.availableWidth ?? '?'}px, truncated=${clip.truncated}, overflow=${clip.overflow})`);
  }
  for (const ov of result.layout.overlaps) {
    lines.push(`  [OVERLAP] ${ov.kind} L${ov.firstLine} vs L${ov.secondLine} (${ov.intersection.width}x${ov.intersection.height} at ${ov.intersection.x},${ov.intersection.y})`);
  }
  return lines.join('\n');
}

async function runSelftest(): Promise<void> {
  const configuredRefRoot =
    process.env.X4_REFERENCE_ROOT
    || resolveXsdConfig().x4ReferenceRoot
    || null;
  const hasCanonicalCorpus = Boolean(
    configuredRefRoot
    && fs.existsSync(path.join(configuredRefRoot, 'ui', 'addons', 'ego_detailmonitorhelper', 'helper.lua')),
  );

  let passed = 0;

  // 1. Direct createFrameHandle + local helper wrapper expansion
  {
    const lua = [
      'local menu = { name = "DogfoodHub", layer = 1 }',
      'function menu.display()',
      '  local frame = Helper.createFrameHandle(menu, { width = 600, height = 400 })',
      '  local tbl = frame:addTable(2, { width = 560, reserveScrollBar = false, scaling = false })',
      '  tbl:setColWidthPercent(1, 50)',
      '  local function addSection(f, label, val)',
      '    local sub = f:addTable(2, { width = 560, reserveScrollBar = false, scaling = false })',
      '    sub:setColWidthPercent(1, 50)',
      '    local r = sub:addRow(false, { scaling = false })',
      '    r[1]:createText(label, { height = 20, scaling = false })',
      '    r[2]:createText(val, { height = 20, scaling = false })',
      '  end',
      '  local r0 = tbl:addRow(false, { scaling = false })',
      '  r0[1]:createText("Header", { height = 20, scaling = false })',
      '  r0[2]:createText("Status", { height = 20, scaling = false })',
      '  addSection(frame, "Faction", "Argon Federation")',
      '  frame:display()',
      'end',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/hub.lua',
      content: lua,
      referenceRoot: configuredRefRoot,
    });
    assert.equal(res.schema, X4_UI_HEADLESS_PREVIEW_SCHEMA);
    assert.equal(res.lint.parsed, true);
    assert.equal(res.lint.errorCount, 0);
    assert.equal(res.previewHarness, 'direct');
    assert.ok(res.layout.programStatus === 'projected' || res.layout.programStatus === 'partial');
    assert.equal(res.layout.tableCount, 2);
    assert.equal(res.layout.rowCount, 2);
    if (hasCanonicalCorpus) {
      assert.equal(res.corpus.status, 'canonical-9.00');
      assert.ok(res.layout.sceneStatus === 'projected' || res.layout.sceneStatus === 'partial');
      assert.equal(res.layout.widgetCount, 4);
    }
    console.log('[1/8] direct menu + local helper wrapper expansion: PASS');
    passed++;
  }

  // 2. Shared-hub frame-parameter tab module (M.renderTab(frame, headerTitle) + return M)
  {
    const lua = [
      'local M = {}',
      'function M.renderTab(frame, headerTitle)',
      '  local tbl = frame:addTable(2, { width = 500, reserveScrollBar = false, scaling = false })',
      '  tbl:setColWidthPercent(1, 40)',
      '  local row = tbl:addRow(false, { scaling = false })',
      '  row[1]:createText(headerTitle, { height = 20, scaling = false })',
      '  row[2]:createText("Ready", { height = 20, scaling = false })',
      'end',
      'return M',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/addons/dogfood/tab_orders.lua',
      content: lua,
      fixture: {
        samples: { headerTitle: 'Chain of Command' },
      },
      referenceRoot: configuredRefRoot,
    });
    assert.equal(res.lint.parsed, true);
    assert.equal(res.lint.errorCount, 0);
    assert.equal(res.previewHarness, 'shared-frame-parameter');
    assert.equal(res.selectedTarget?.name, 'M.renderTab');
    assert.equal(res.selectedTarget?.lineStart, 2);
    assert.equal(res.layout.tableCount, 1);
    assert.equal(res.layout.tables[0]?.line, 3, 'Authored line numbers must remain exact');
    assert.equal(res.layout.appliedSamples, 1);
    console.log('[2/8] shared-hub frame-parameter module preview: PASS');
    passed++;
  }

  // 3. Clipped/truncated text detection when Zekton corpus is available (and graceful fallback without corpus)
  {
    const lua = [
      'local menu = { name = "ClipCheck", layer = 1 }',
      'function menu.display()',
      '  local frame = Helper.createFrameHandle(menu, { width = 200, height = 200 })',
      '  local tbl = frame:addTable(1, { width = 60, reserveScrollBar = false, scaling = false })',
      '  local row = tbl:addRow(false, { scaling = false })',
      '  row[1]:createText("Commander Vivienne Otani Extraordinary Long Fleet Assignment Title", { wordwrap = false, height = 20, scaling = false })',
      '  frame:display()',
      'end',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/clip_test.lua',
      content: lua,
      referenceRoot: configuredRefRoot,
    });
    assert.ok(res.layout.programStatus === 'projected' || res.layout.programStatus === 'partial');
    if (hasCanonicalCorpus) {
      assert.ok(res.layout.sceneStatus === 'projected' || res.layout.sceneStatus === 'partial');
      assert.ok(res.layout.clippedTextCount >= 1, 'Expected clipped/truncated text in 60px non-wrapping column');
      assert.equal(res.layout.clippedText[0]?.line, 6);
    }
    const fallbackNoCorpus = await previewX4UiLua({
      logicalPath: 'ui/clip_test.lua',
      content: lua,
      referenceRoot: null,
    });
    assert.equal(fallbackNoCorpus.corpus.status, 'unavailable');
    assert.ok(fallbackNoCorpus.layout.programStatus === 'projected' || fallbackNoCorpus.layout.programStatus === 'partial');
    assert.equal(fallbackNoCorpus.layout.sceneStatus, 'unavailable');
    console.log('[3/8] clipped text detection + corpus-absent fallback: PASS');
    passed++;
  }

  // 4. Sibling table overlap detection
  {
    const lua = [
      'local menu = { name = "OverlapCheck", layer = 1 }',
      'function menu.display()',
      '  local frame = Helper.createFrameHandle(menu, { width = 400, height = 300 })',
      '  local t1 = frame:addTable(1, { x = 10, y = 10, width = 200, reserveScrollBar = false, scaling = false })',
      '  local r1 = t1:addRow(false, { scaling = false })',
      '  r1[1]:createText("First table", { height = 30, scaling = false })',
      '  local t2 = frame:addTable(1, { x = 10, y = 15, width = 200, reserveScrollBar = false, scaling = false })',
      '  local r2 = t2:addRow(false, { scaling = false })',
      '  r2[1]:createText("Overlapping second table", { height = 30, scaling = false })',
      '  frame:display()',
      'end',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/overlap_test.lua',
      content: lua,
      referenceRoot: configuredRefRoot,
    });
    assert.equal(res.layout.tableCount, 2);
    if (hasCanonicalCorpus) {
      assert.equal(res.layout.overlapCount, 1);
      assert.equal(res.layout.overlaps[0]?.kind, 'table-overlap');
      assert.equal(res.layout.overlaps[0]?.firstLine, 4);
      assert.equal(res.layout.overlaps[0]?.secondLine, 7);
    }
    console.log('[4/8] sibling table bounding-box overlap detection: PASS');
    passed++;
  }

  // 5. Fatal 24-column table limit lint
  {
    const lua = [
      'local menu = { name = "TooWide", layer = 1 }',
      'local frame = Helper.createFrameHandle(menu, { width = 800, height = 600 })',
      'local tbl = frame:addTable(24, { width = 760 })',
      'OpenMenu("TooWide", nil, nil, true)',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/too_many_cols.lua',
      content: lua,
      referenceRoot: configuredRefRoot,
    });
    assert.equal(res.lint.errorCount, 1);
    const colErr = res.lint.findings.find(f => f.code === 'x4-ui.add-table-column-limit');
    assert.ok(colErr, 'Expected x4-ui.add-table-column-limit error finding');
    assert.equal(colErr.line, 3);
    assert.equal(colErr.severity, 'error');
    console.log('[5/8] fatal 24-column limit lint reported: PASS');
    passed++;
  }

  // 6. Dynamic sample + loop iteration bindings via fixture
  {
    const lua = [
      'local menu = { name = "LoopSample", layer = 1 }',
      'local ITEMS = { "a", "b", "c" }',
      'function menu.display(dynCols, dynLabel)',
      '  local frame = Helper.createFrameHandle(menu, { width = 500, height = 400 })',
      '  local tbl = frame:addTable(dynCols, { width = 460, reserveScrollBar = false, scaling = false })',
      '  for _, item in ipairs(ITEMS) do',
      '    local r = tbl:addRow(false, { scaling = false })',
      '    r[1]:createText(dynLabel, { height = 20, scaling = false })',
      '  end',
      '  frame:display()',
      'end',
    ].join('\n');
    const res = await previewX4UiLua({
      logicalPath: 'ui/loop_sample.lua',
      content: lua,
      fixture: {
        samples: { dynCols: 2, dynLabel: 'Item Row' },
        loops: { default: 3 },
      },
      referenceRoot: configuredRefRoot,
    });
    assert.ok(res.layout.appliedSamples >= 2, `Expected >=2 applied samples, got ${res.layout.appliedSamples}`);
    assert.equal(res.layout.unresolvedSampleCount, 0);
    assert.equal(res.layout.rowCount, 3);
    console.log('[6/8] fixture expression sample + loop count bindings: PASS');
    passed++;
  }

  // 7. Negative path: syntax error Lua handled cleanly without throwing
  {
    const res = await previewX4UiLua({
      logicalPath: 'ui/broken.lua',
      content: 'function broken(\n  local x =',
      referenceRoot: null,
    });
    assert.equal(res.ok, true);
    assert.equal(res.lint.parsed, false);
    assert.equal(res.layout.programStatus, 'not-run');
    console.log('[7/8] malformed Lua negative path handled cleanly: PASS');
    passed++;
  }

  // 8. Negative path: unknown target name reports structured refusal
  {
    const res = await previewX4UiLua({
      logicalPath: 'ui/unknown_target.lua',
      content: 'local menu = { name = "M" }\nfunction menu.display()\n  local f = Helper.createFrameHandle(menu, { width = 200, height = 200 })\nend\n',
      target: 'menu.doesNotExist',
      referenceRoot: null,
    });
    assert.equal(res.ok, true);
    assert.equal(res.selectedTarget, null);
    assert.equal(res.layout.programStatus, 'not-run');
    assert.ok(res.layout.refusalReason?.includes('menu.doesNotExist'));
    console.log('[8/8] missing target negative path handled cleanly: PASS');
    passed++;
  }

  console.log(`[x4-ui-preview] OK (${passed}/8 passed, canonicalCorpus=${hasCanonicalCorpus})`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: tsx scripts/x4-ui-preview.ts <file.lua> [--fixture <state.json>] [--target <name>] [--frame-param <param>] [--width <px>] [--height <px>] [--ui-scale <n>] [--reference-root <dir>] [--json] [--fail-on-error] [--fail-on-clip] [--fail-on-overlap]');
    return;
  }
  if (args.selftest) {
    await runSelftest();
    return;
  }
  if (!args.filePath) {
    throw new Error('Missing <file.lua> path (or pass --selftest).');
  }
  const resolvedFile = path.resolve(args.filePath);
  const content = fs.readFileSync(resolvedFile, 'utf8');
  let fixture: X4UiHeadlessFixtureInput = {};
  if (args.fixturePath) {
    const rawFixture = JSON.parse(fs.readFileSync(path.resolve(args.fixturePath), 'utf8')) as Record<string, unknown>;
    fixture = {
      ...(typeof rawFixture.samples === 'object' && rawFixture.samples !== null ? { samples: rawFixture.samples as Record<string, string | number | boolean> } : {}),
      ...(typeof rawFixture.loops === 'object' && rawFixture.loops !== null ? { loops: rawFixture.loops as Record<string, number> } : {}),
      ...(typeof rawFixture.drawable === 'object' && rawFixture.drawable !== null ? { drawable: rawFixture.drawable as { width?: number; height?: number } } : {}),
      ...(typeof rawFixture.uiScale === 'number' ? { uiScale: rawFixture.uiScale } : {}),
      ...(typeof rawFixture.frameParameter === 'string' ? { frameParameter: rawFixture.frameParameter } : {}),
    };
  }
  if (args.width !== undefined || args.height !== undefined) {
    fixture = {
      ...fixture,
      drawable: {
        ...(fixture.drawable || {}),
        ...(args.width !== undefined ? { width: args.width } : {}),
        ...(args.height !== undefined ? { height: args.height } : {}),
      },
    };
  }
  if (args.uiScale !== undefined) {
    fixture = { ...fixture, uiScale: args.uiScale };
  }
  if (args.frameParam !== undefined) {
    fixture = { ...fixture, frameParameter: args.frameParam };
  }

  const refRoot = args.referenceRoot ?? process.env.X4_REFERENCE_ROOT ?? resolveXsdConfig().x4ReferenceRoot ?? null;
  const result = await previewX4UiLua({
    logicalPath: path.basename(resolvedFile),
    content,
    target: args.target,
    fixture,
    referenceRoot: refRoot,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHumanSummary(result));
  }

  if (
    (args.failOnError && (!result.lint.parsed || result.lint.errorCount > 0))
    || (args.failOnClip && result.layout.clippedTextCount > 0)
    || (args.failOnOverlap && result.layout.overlapCount > 0)
  ) {
    process.exit(1);
  }
}

void main().catch(err => {
  console.error('[x4-ui-preview] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
