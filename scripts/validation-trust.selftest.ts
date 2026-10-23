import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectFromDisk, runProjectValidation } from '../src/server/projectValidation';
import { buildValidationEvidence, parseValidationProject, ValidationInputError } from '../src/lib/validationEvidence';

const project = { id: 'folder_alias', name: 'Fixture', files: [
  { path: 'content.xml', kind: 'content' as const, content: '<content id="trust_fixture" name="Fixture" version="100"/>' },
  { path: 'ui/main.lua', kind: 'lua' as const, content: 'local valid = true' },
] };
const result = runProjectValidation(project);
assert.ok(result.evidence, 'shared validation must identify its subject and coverage');
assert.equal(result.evidence.modId, 'trust_fixture', 'manifest identity, not folder alias');
const results: string[] = ['shared engine emits manifest identity'];
function check(name: string, fn: () => void) { fn(); results.push(name); }
const base = buildValidationEvidence(project, []);
check('hash explicitly names validation-only scope', () => assert.equal(base.hashScope, 'project-validation-inputs-v1'));
check('manifest version retained', () => assert.equal(base.modVersion, '100'));
check('file order does not change identity', () => assert.equal(buildValidationEvidence({ ...project, files: [...project.files].reverse() }, []).sourceHash, base.sourceHash));
check('one source byte changes identity', () => assert.notEqual(buildValidationEvidence({ ...project, files: project.files.map(f => ({ ...f, content: f.content + '\n' })) }, []).sourceHash, base.sourceHash));
check('missing content differs from empty inspected source', () => {
  const missing = buildValidationEvidence({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] }, []);
  const empty = buildValidationEvidence({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md', content: '' }] }, []);
  assert.notEqual(missing.sourceHash, empty.sourceHash); assert.equal(missing.outcome, 'incomplete');
});
check('missing manifest is unresolved, not guessed from folder', () => {
  const unknown = buildValidationEvidence({ ...project, files: [] }, []);
  assert.equal(unknown.modId, null); assert.equal(unknown.identitySource, 'unresolved'); assert.equal(unknown.coverage.complete, false);
});
check('commented manifest cannot spoof identity', () => {
  const e = buildValidationEvidence({ ...project, files: [{ ...project.files[0], content: '<!-- <content id="wrong"/> --><content id="right" version="101"/>' }] }, []);
  assert.equal(e.modId, 'right');
});
check('malformed manifest cannot assert identity', () => assert.equal(buildValidationEvidence({ ...project, files: [{ ...project.files[0], content: '<content id="wrong"><x></content>' }] }, []).modId, null));
const unavailable = { severity: 'error' as const, code: 'validation.lua_ast_unavailable', filePath: 'ui/main.lua', message: 'Analysis unavailable' };
const badLua = { severity: 'error' as const, code: 'lua.syntax_error', filePath: 'ui/main.lua', message: 'Unexpected symbol' };
check('unavailable parser is not a mod error', () => {
  const e = buildValidationEvidence(project, [unavailable]);
  assert.equal(e.modErrorCount, 0); assert.equal(e.outcome, 'incomplete'); assert.equal(e.findings[0].category, 'check-unavailable');
});
check('genuine syntax finding remains a mod finding', () => {
  const e = buildValidationEvidence(project, [unavailable, badLua]);
  assert.equal(e.modErrorCount, 1); assert.equal(e.outcome, 'mod-findings'); assert.equal(e.coverage.complete, false);
});
check('finding identity deterministic and order independent', () => {
  const a = buildValidationEvidence(project, [badLua, unavailable]);
  const b = buildValidationEvidence(project, [unavailable, badLua]);
  assert.equal(a.findings[0].findingId, b.findings[1].findingId);
});
check('finding identity expires with source change', () => {
  const a = buildValidationEvidence(project, [badLua]);
  const b = buildValidationEvidence({ ...project, files: project.files.map(f => ({ ...f, content: f.content + ' ' })) }, [badLua]);
  assert.notEqual(a.findings[0].findingId, b.findings[0].findingId);
});
check('schema gap cannot be called clean', () => assert.equal(buildValidationEvidence(project, [], [{ check: 'schema.md', reason: 'md.xsd missing' }]).outcome, 'incomplete'));
check('bounded UI gaps remain incomplete', () => assert.equal(buildValidationEvidence(project, [{ severity: 'info', code: 'x4-ui.verification-gap', message: 'Not statically verified' }]).coverage.complete, false));
check('valid input classifies files when kind omitted', () => assert.equal(parseValidationProject({ ...project, files: [{ path: 'ui/main.lua', content: '' }] }).files[0].kind, 'lua'));
for (const [name, value] of [
  ['null project', null], ['array project', []], ['missing id', { name: '', files: [] }],
  ['null file', { ...project, files: [null] }], ['nonstring content', { ...project, files: [{ path: 'a.lua', content: {} }] }],
  ['unknown kind', { ...project, files: [{ path: 'a.lua', kind: 'xml' }] }],
  ['absolute path', { ...project, files: [{ path: 'C:/a.lua' }] }],
  ['traversal path', { ...project, files: [{ path: '../a.lua' }] }],
  ['case collision', { ...project, files: [{ path: 'a.lua' }, { path: 'A.LUA' }] }],
] as const) check(`rejects ${name}`, () => assert.throws(() => parseValidationProject(value), ValidationInputError));
check('real Lua syntax error survives shared engine', () => {
  const bad = runProjectValidation({ ...project, files: [project.files[0], { path: 'ui/bad.lua', kind: 'lua', content: 'local x = )' }] });
  assert.equal(bad.ok, false); assert.ok(bad.evidence?.findings.some(f => f.code === 'lua.syntax_error' && f.category === 'mod-finding'));
});
check('missing MD content returns incomplete evidence rather than throwing', () => {
  const missing = runProjectValidation({ ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] });
  assert.equal(missing.evidence?.coverage.complete, false);
  assert.ok(missing.evidence?.coverage.gaps.some(gap => gap.filePath === 'md/missing.xml'));
});
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-validation-trust-'));
try {
  check('actual missing MD schema is explicitly unavailable in the shared engine', () => {
    const names = ['X4_REFERENCE_ROOT', 'X4_XSD_PATH', 'X4_GAME_PATH'];
    const saved = names.map(name => process.env[name]);
    try {
      for (const name of names) process.env[name] = path.join(scratch, 'missing-schemas');
      const result = runProjectValidation({ ...project, files: [...project.files, { path: 'md/main.xml', kind: 'md', content: '<mdscript name="Fixture"><cues/></mdscript>' }] });
      assert.equal(result.schema.mdAvailable, false);
      assert.ok(result.evidence?.coverage.gaps.some(gap => gap.check === 'schema.md'));
      assert.equal(result.evidence?.coverage.complete, false);
    } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
  });
  check('unreadable/missing directory is explicit incomplete inventory', () => {
    const result = loadProjectFromDisk(path.join(scratch, 'absent'));
    assert.equal(result.loaded.length, 0); assert.equal(result.skipped.length, 1);
  });
  check('file limit does not silently drop remaining source', () => {
    for (let index = 0; index < 501; index++) fs.writeFileSync(path.join(scratch, `${index}.lua`), 'local n = 1');
    const result = loadProjectFromDisk(scratch);
    assert.equal(result.loaded.length, 500); assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /file limit/);
  });
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
console.log(JSON.stringify({ pass: true, checks: results.length, results }, null, 2));
