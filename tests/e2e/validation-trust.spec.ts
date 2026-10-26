import { expect, test } from '@playwright/test';
import { E2E_API_ORIGIN, E2E_TOKEN } from '../../playwright.config';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` } });

const project = { id: 'folder_alias', name: 'Validation trust', files: [
  { path: 'content.xml', kind: 'content', content: '<content id="trust_fixture" name="Fixture" version="100"/>' },
  { path: 'ui/main.lua', kind: 'lua', content: 'local valid = true' },
] };

test('validation API binds exact source and distinguishes unavailable coverage from mod errors', async ({ request }, testInfo) => {
  const validate = async (subject: typeof project) => {
    const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data: { project: subject } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const valid = await validate(project);
  expect(valid.modId).toBe('trust_fixture');
  expect(valid.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(valid.evidence.hashScope).toBe('project-validation-inputs-v1');
  const changed = await validate({ ...project, files: project.files.map(f => ({ ...f, content: f.content + '\n' })) });
  expect(changed.sourceHash).not.toBe(valid.sourceHash);
  const broken = await validate({ ...project, files: [project.files[0], { path: 'ui/bad.lua', kind: 'lua', content: 'local x = )' }] });
  expect(broken.ok).toBe(false);
  expect(broken.evidence.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'lua.syntax_error', category: 'mod-finding', findingId: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    expect.objectContaining({ code: 'validation.lua_ast_unavailable', category: 'check-unavailable' }),
  ]));
  expect(broken.evidence.coverage.complete).toBe(false);
  await testInfo.attach('validation-evidence', { body: JSON.stringify({ valid, broken }, null, 2), contentType: 'application/json' });
});

test('malformed or ambiguous validation subjects never return a successful empty result', async ({ request }) => {
  for (const data of [
    { project: null }, { project: { ...project, files: [null] } },
    { project, path: 'different_mod' }, { project, fromPath: 12 },
    { project: { ...project, files: [{ path: 'ui/a.lua', content: 10 }] } },
    { project: { ...project, files: [{ path: 'ui/a.lua' }, { path: 'UI/A.LUA' }] } },
  ]) {
    const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data });
    expect(response.status(), await response.text()).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: 'PROJECT_INPUT_INVALID', category: 'request-invalid', modId: null, sourceHash: null, sourceHashScope: 'unresolved' });
  }
});

test('incomplete source cannot become a last-green baseline', async ({ request }) => {
  const data = { project: { ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] }, recordBaseline: true };
  const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data });
  expect(response.status(), await response.text()).toBe(409);
  const body = await response.json();
  expect(body.evidence.coverage.complete).toBe(false);
  expect(body.baselinePromotion.recorded).toBe(false);
  expect(body.code).toBe('VALIDATION_BASELINE_RECORD_FAILED');
});
