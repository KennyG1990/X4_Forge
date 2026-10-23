import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyPath } from '../src/lib/extensionProject';
import { routeProjectFile } from '../src/lib/schemaRouting';
import { loadProjectFromDisk, runProjectValidation } from '../src/server/projectValidation';
import { validateProjectCrossFile } from '../src/lib/projectCrossFileValidation';
import { buildX4UiSourceBundle, addX4UiSourceBundleRegistration } from '../src/lib/x4UiSourceBundle';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ui-manifest-'));
const xml = '<?xml version="1.0"?>\r\n<addon name="fixture">\r\n<!-- keep -->\r\n<environment type="menus"><dependency name="ego_detailmonitor"/><file name="ui/first.lua"/><file name="ui/second.lua"/></environment>\r\n</addon>';
const luaFiles = [{ path: 'ui/first.lua', text: 'local first = 1' }, { path: 'ui/second.lua', text: 'local second = 2' }];
const results: { name: string; pass: boolean; error?: string }[] = [];
function check(name: string, fn: () => void) {
  try { fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: String(error) }); }
}
try {
  fs.mkdirSync(path.join(root, 'ui'));
  fs.writeFileSync(path.join(root, 'content.xml'), '<content id="fixture" name="Fixture" version="100"/>');
  fs.writeFileSync(path.join(root, 'ui.xml'), xml);
  for (const file of luaFiles) fs.writeFileSync(path.join(root, file.path), file.text);
  check('root manifest classified as UI including uppercase', () => {
    assert.equal(classifyPath('ui.xml'), 'ui'); assert.equal(classifyPath('UI.XML'), 'ui');
  });
  check('root manifest routed to addon schema', () => {
    assert.equal(routeProjectFile('ui.xml', xml)?.domain, 'addon');
    assert.equal(routeProjectFile('UI.XML', '<wrong/>')?.domain, 'addon');
  });
  const loaded = loadProjectFromDisk(root);
  check('disk loader retains root manifest exact bytes', () => assert.equal(loaded.project.files.find(f => f.path === 'ui.xml')?.content, xml));
  const project = { id: 'fixture', name: 'Fixture', files: [
    { path: 'content.xml', kind: 'content' as const, content: '<content id="fixture"/>' },
    { path: 'ui.xml', kind: 'ui' as const, content: xml },
    ...luaFiles.map(f => ({ path: f.path, kind: 'lua' as const, content: f.text })),
  ] };
  check('valid manifest and local registrations pass', () => assert.equal(validateProjectCrossFile(project).ok, true));
  check('real addon schema is available and valid manifest passes', () => {
    const validation = runProjectValidation(loaded.project);
    assert.equal(validation.schema.routed.find(f => f.path === 'ui.xml')?.domainAvailable, true);
    assert.equal(validation.ok, true, JSON.stringify(validation.schema.findings));
  });
  check('invalid manifest attribute fails real addon schema', () => {
    const invalid = { ...project, files: project.files.map(f => f.path === 'ui.xml' ? { ...f, content: xml.replace('type="menus"', 'type="invalid"') } : f) };
    const validation = runProjectValidation(invalid);
    assert.equal(validation.ok, false);
    assert.ok(validation.schema.findings.some(f => f.filePath === 'ui.xml' && f.severity === 'error'));
  });
  check('wrong manifest root rejected', () => {
    const invalid = { ...project, files: project.files.map(f => f.path === 'ui.xml' ? { ...f, content: '<wrong/>' } : f) };
    assert.equal(runProjectValidation(invalid).ok, false);
  });
  for (const [name, content] of [
    ['unknown element', '<addon name="fixture"><unknown/></addon>'],
    ['misplaced registration', '<addon name="fixture"><file name="ui/first.lua"/></addon>'],
    ['missing addon name', '<addon><environment type="menus"/></addon>'],
  ]) {
    check(`reject ${name}`, () => {
      const invalid = { ...project, files: project.files.map(f => f.path === 'ui.xml' ? { ...f, content } : f) };
      assert.equal(runProjectValidation(invalid).ok, false);
    });
  }
  for (const target of ['ui/missing.lua', '../escape.lua', 'C:/escape.lua']) {
    check(`reject registration ${target}`, () => {
      const bad = { ...project, files: project.files.map(f => f.path === 'ui.xml' ? { ...f, content: xml.replace('ui/first.lua', target) } : f) };
      assert.equal(validateProjectCrossFile(bad).ok, false);
    });
  }
  check('malformed root XML rejected on disk validation', () => {
    fs.writeFileSync(path.join(root, 'ui.xml'), '<addon><environment></addon>');
    assert.equal(runProjectValidation(loadProjectFromDisk(root).project).ok, false);
  });
  check('source registration edit preserves existing metadata order and Lua', () => {
    const bundle = buildX4UiSourceBundle({ uiXml: xml, luaFiles });
    const added = addX4UiSourceBundleRegistration(bundle, { path: 'ui/third.lua', text: 'local third = 3' });
    assert.equal(added.accepted, true);
    assert.ok(added.bundle.uiXml.includes('<!-- keep -->'));
    assert.ok(added.bundle.uiXml.includes('<dependency name="ego_detailmonitor"/>'));
    assert.deepEqual(added.bundle.registrations.map(r => r.rawPath), [...luaFiles.map(f => f.path), 'ui/third.lua']);
    assert.equal(bundle.uiXml, xml);
  });
  check('missing addon schema fails closed', () => {
    const names = ['X4_REFERENCE_ROOT', 'X4_XSD_PATH', 'X4_GAME_PATH'];
    const saved = names.map(name => process.env[name]);
    try {
      for (const name of names) process.env[name] = path.join(root, 'missing-schemas');
      const validation = runProjectValidation(project);
      assert.equal(validation.ok, false);
      assert.ok(validation.schema.findings.some(f => f.code === 'UI_SCHEMA_UNAVAILABLE'));
    } finally {
      names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
    }
  });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, total: results.length, results }, null, 2));
process.exitCode = results.every(r => r.pass) ? 0 : 1;
