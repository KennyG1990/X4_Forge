/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic contract for the visual UI package emitter. This guards the exact
 * regression where UIBuilder previewed a runnable menu while package output was a scaffold.
 */
import { generateUILuaScript, sanitizeWorkspace, type ModWorkspace, type UIWidget } from '../types';
import { analyzeLuaFiles } from './luaStaticAnalysis';
import { runModDoctor } from './modDoctor';
import { runPackageStatusSelftest } from './packageStatus';

const widget = (type: UIWidget['type'], index: number, extra: Partial<UIWidget> = {}): UIWidget => ({
  id: `w_${index}`,
  type,
  x: 20,
  y: index * 50,
  w: 320,
  h: 40,
  label: `${type} ${index}`,
  properties: {},
  includeInBuild: true,
  ...extra,
});

export function runUiCompilerSelftest() {
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });
  const types: UIWidget['type'][] = ['window', 'table', 'button', 'text', 'progressbar', 'dropdown', 'header', 'input', 'chat'];
  const ws = sanitizeWorkspace({
    name: 'UI Compiler Test',
    nodes: [],
    links: [],
    uiWidgets: [
      ...types.map((type, index) => widget(type, index + 1, type === 'window'
        ? { properties: { autoOpen: true } }
        : type === 'dropdown'
          ? { properties: { options: ['One', 'Two'] } }
          : {})),
      widget('text', 90, { id: 'excluded_widget', label: 'MUST NOT SHIP', includeInBuild: false }),
      widget('text', 91, { id: 'escaped_widget', label: 'Quote " slash \\ newline\nnext' }),
    ],
  } as Partial<ModWorkspace>);
  const lua = generateUILuaScript(ws, 'ui_compiler_test');

  ok('all_widget_types_emit', [
    'createText(', 'createButton(', 'createEditBox(', 'createDropDown(', 'createStatusBar(',
    'Item', 'menu.transcript',
  ].every(token => lua.includes(token)));
  ok('standalone_menu_lifecycle', [
    'rawget(_G, "Helper")', 'function menu.ensureRegistered()', 'Helper.registerMenu',
    'function menu.open(context)', 'OpenMenu(menu.name', 'function menu.onShowMenu()',
    'function menu.retryOpen()', 'SetScript("onUpdate", menu.retryOpen)',
    'Helper.createFrameHandle', 'menu.frame:display()',
  ].every(token => lua.includes(token)));
  ok('namespaced_open_event', lua.includes('RegisterEvent("ui_compiler_test_menu.open"'));
  ok('template_auto_open_is_opt_in', lua.includes('SetScript("onUpdate", autoOpenWhenReady)'));
  ok('excluded_widget_absent', !lua.includes('excluded_widget') && !lua.includes('MUST NOT SHIP'));
  ok('lua_strings_escaped', lua.includes('Quote \\" slash \\\\ newline\\nnext'));

  const normal = generateUILuaScript(sanitizeWorkspace({
    name: 'Normal Menu', nodes: [], links: [], uiWidgets: [widget('button', 1)],
  } as Partial<ModWorkspace>), 'normal_menu');
  ok('normal_menu_does_not_auto_open', !normal.includes('autoOpenWhenReady') && normal.includes('normal_menu_menu.open'));

  const staticResult = analyzeLuaFiles([{
    rel: 'ui/ui_compiler_test.lua',
    text: lua,
    source: 'loose',
    sourcePath: 'generated',
    extension: { id: 'ui_compiler_test', folder: 'ui_compiler_test' },
  }]);
  const staticErrors = staticResult.findings.filter(f => f.severity === 'error');
  ok('static_analysis_clean', staticErrors.length === 0, staticErrors);

  const doctor = runModDoctor(ws, {
    'content.xml': '<content id="ui_compiler_test" name="UI Compiler Test" version="100"/>',
    'ui.xml': '<addon name="ui_compiler_test"><environment type="menus"><file name="ui/ui_compiler_test.lua"/></environment></addon>',
    'ui/ui_compiler_test.lua': lua,
  }, 'ui_compiler_test');
  ok('scaffold_diagnostic_retired', !doctor.some(d => d.code === 'ui.lua_scaffold'), doctor);

  const invalid = sanitizeWorkspace({
    name: 'Invalid UI', nodes: [], links: [], uiWidgets: [widget('button', 1, { w: 0 })],
  } as Partial<ModWorkspace>);
  const invalidDoctor = runModDoctor(invalid, { 'content.xml': '<content/>' }, 'invalid_ui');
  ok('invalid_size_still_blocks', invalidDoctor.some(d => d.code === 'ui.invalid_size' && d.severity === 'error'));

  const packageStatus = runPackageStatusSelftest();
  ok('package_status_negative_paths', packageStatus.allPassed, packageStatus.checks);

  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
