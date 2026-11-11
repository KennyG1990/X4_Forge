import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { E2E_API_ORIGIN, E2E_TOKEN } from '../../playwright.config';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` } });

const project = { id: 'folder_alias', name: 'Validation trust', files: [
  { path: 'content.xml', kind: 'content', content: '<content id="trust_fixture" name="Fixture" version="100"/>' },
  { path: 'ui/main.lua', kind: 'lua', content: 'local valid = true' },
] };

test('validation API binds exact source and distinguishes unavailable coverage from mod errors', async ({ request }, testInfo) => {
  const validate = async (subject: typeof project) => {
    const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data: { project: subject, detail: 'full' } });
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

test('ware reference API and Problems distinguish table fields from actual ids', async ({ request }, testInfo) => {
  const variants = [
    { name: 'reported-table-fields', lua: 'local ware = namedSupplyWare(rows, text)\nif active(c) and (not ware or c.ware == ware.ware) then end\nlocal label = ware.wname', ids: [] },
    { name: 'genuine-unknown-id', lua: 'local name = GetWareData("notaware", "name")', ids: ['notaware'] },
    { name: 'canonical-id', lua: 'local name = GetWareData("energycells", "name")', ids: [] },
  ];
  const evidence: unknown[] = [];
  try {
  for (const variant of variants) {
    const subject = { id: 'forge_ware64', name: 'Ware reference control', files: [
      { path: 'content.xml', kind: 'content', content: '<content id="forge_ware64" name="Ware reference control" version="100"/>' },
      { path: 'ui.xml', kind: 'ui', content: '<addon name="forge_ware64"><environment type="menus"><dependency name="ego_detailmonitor"/><file name="ui/ware64.lua"/></environment></addon>' },
      { path: 'ui/ware64.lua', kind: 'lua', content: variant.lua },
    ] };
    const fullResponse = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data: { project: subject, detail: 'full' } });
    expect(fullResponse.status(), await fullResponse.text()).toBe(200);
    const full = await fullResponse.json();
    expect(full.modId).toBe('forge_ware64');
    expect(full.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(full.references.available).toBe(true);
    const findings = full.references.findings.filter((finding: { code: string }) => finding.code === 'reference.unknown_ware');
    expect(findings.map((finding: { id: string }) => finding.id), variant.name).toEqual(variant.ids);
    const problemsResponse = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate/check`, { data: { project: subject } });
    expect(problemsResponse.status(), await problemsResponse.text()).toBe(200);
    const problems = await problemsResponse.json();
    const flat = problems.flat.filter((finding: { code: string }) => finding.code === 'reference.unknown_ware');
    const position = (finding: { filePath: string; line: number; column: number; severity: string }) =>
      [finding.filePath, finding.line, finding.column, finding.severity];
    expect(flat.map(position), variant.name).toEqual(findings.map(position));
    if (variant.ids.length) expect(findings[0]).toMatchObject({ filePath: 'ui/ware64.lua', line: 1, column: 27, severity: 'warning' });
    // Fixing a reference false positive cannot certify arbitrary UI execution.
    expect(full.evidence.coverage.complete).toBe(false);
    expect(full.evidence.checkUnavailableCount).toBeGreaterThan(0);
    evidence.push({ name: variant.name, subject, full, problems });
  }
  } finally {
    // The runner retires its temporary JSON report, including body-only
    // attachments. Keep one real test artifact for subsequent proof review.
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    const artifact = testInfo.outputPath('ware-reference-api-evidence.json');
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2) + '\n');
    await testInfo.attach('ware-reference-api-evidence', { path: artifact, contentType: 'application/json' });
  }
});
