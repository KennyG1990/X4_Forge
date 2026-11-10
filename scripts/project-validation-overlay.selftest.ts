import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEffectiveReferenceDocument } from '../src/lib/referenceOverlay';
import { runProjectValidation, flattenProjectValidation } from '../src/server/projectValidation';
import { simulateXmlDiff, validateDiffSourceXml } from '../src/lib/diffSimulator';
import type { ExtensionProject } from '../src/lib/extensionProject';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-overlay-coverage-'));
const previous = Object.fromEntries(['X4_REFERENCE_ROOT', 'X4_CONFIG_DIR', 'X4_GAME_PATH', 'X4_XSD_PATH',
  'X4_FORGE_DEV_SCRATCH_SETTINGS', 'X4_FORGE_DEV_ROOT'].map(key => [key, process.env[key]]));
const checks: { name: string; pass: boolean; detail?: string }[] = [];
const relative = 'libraries/overlay_probe.xml';
const base = '<root><item id="value" exact="0"/></root>';
const patch = '<diff><replace sel="/root/item/@exact">7</replace></diff>';
const invalid = '<diff><replace sel="//*[">lost</replace></diff>';
const project: ExtensionProject = { id: 'overlay_probe', name: 'Overlay probe', files: [
  { path: 'content.xml', kind: 'content', content: '<content id="overlay_probe" name="Overlay probe" author="Forge QA" version="100" date="2026-11-10" description="Synthetic coverage test"/>' },
  { path: relative, kind: 'library', content: patch },
] };
const options = { references: { macros: new Set<string>(), wares: new Set<string>(), factions: new Set<string>(), sectors: new Set<string>() } };
const write = (relativePath: string, content: string) => {
  const target = path.join(temporary, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const dlc = (id: string, content: string) => {
  write(`extensions/${id}/content.xml`, `<content id="${id}"/>`);
  write(`extensions/${id}/${relative}`, content);
};
const check = (name: string, run: () => void) => {
  try { run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: String(error) }); }
};
const validate = (incremental = true) => runProjectValidation(project, { ...options, incremental });
const referenceGaps = (result: ReturnType<typeof validate>) => result.evidence!.coverage.gaps.filter(gap => gap.check === 'diff.reference');

try {
  process.env.X4_REFERENCE_ROOT = temporary;
  process.env.X4_CONFIG_DIR = path.join(temporary, 'config');
  process.env.X4_GAME_PATH = path.join(temporary, 'game');
  process.env.X4_XSD_PATH = path.join(temporary, 'schemas');
  delete process.env.X4_FORGE_DEV_SCRATCH_SETTINGS;
  delete process.env.X4_FORGE_DEV_ROOT;
  write(relative, base);
  dlc('ego_dlc_a', invalid);
  const failed = resolveEffectiveReferenceDocument(temporary, relative, true);
  const result = validate();
  check('failed official patch retains available content and source-owned raw failure', () => {
    assert.equal(failed.available, true);
    assert.equal(failed.complete, false);
    assert.ok(failed.incompleteFindings.some(finding => finding.source === 'ego_dlc_a'));
    assert.deepEqual(resolveEffectiveReferenceDocument(temporary, relative), failed);
    assert.ok(failed.findings.some(finding => finding.severity === 'error' && finding.source === 'ego_dlc_a'));
  });
  check('official failure makes shared project coverage incomplete at authored patch', () => {
    assert.equal(result.evidence!.coverage.complete, false, JSON.stringify(result.evidence));
    assert.ok(referenceGaps(result).some(gap => gap.filePath === relative && gap.reason.includes('ego_dlc_a')));
  });
  check('official failure is not blamed on the mod or used as a post-apply proof', () => {
    assert.equal(result.summary.diffErrors, 0);
    assert.equal(result.summary.diffWarnings, 0);
    assert.deepEqual(result.diffSimulation.files[0].findings, []);
    assert.deepEqual(result.diffSimulation.files[0].postApplyFindings, []);
    assert.ok(!flattenProjectValidation(result).some(finding => finding.code === 'DIFF_SELECTOR_INVALID'));
    const visible = result.evidence!.findings.filter(finding => finding.code === 'diff.reference');
    assert.equal(visible.length, 1);
    assert.equal(visible[0].category, 'check-unavailable');
    assert.equal(referenceGaps(result).length, 1);
  });
  check('cached/full project runs preserve exactly the same coverage and ownership', () => {
    assert.deepEqual(validate().evidence, result.evidence);
    assert.deepEqual(validate(false).evidence, result.evidence);
  });
  dlc('ego_dlc_a', '<diff><replace sel="/root/item/@exact">3</replace></diff>');
  const fixed = validate();
  check('changed official bytes invalidate failure and allow authored simulation', () => {
    assert.deepEqual(referenceGaps(fixed), []);
    assert.ok(fixed.diffSimulation.files[0].findings.every(finding => finding.severity !== 'error'));
    assert.equal(resolveEffectiveReferenceDocument(temporary, relative).complete, true);
  });
  dlc('ego_dlc_a', '<diff><remove sel="/root/missing"/></diff>');
  check('known zero-selector no-op remains a modeled warning, not missing authority', () => {
    const zero = validate();
    assert.deepEqual(referenceGaps(zero), []);
    assert.ok(zero.diffSimulation.files[0].overlayFindings.some(finding => finding.code === 'DIFF_SELECTOR_ZERO'));
  });
  dlc('ego_dlc_a', '<diff><remove sel="/root/item" if="false"/></diff>');
  check('false condition remains modeled without unavailable coverage', () => {
    const skipped = validate();
    assert.deepEqual(referenceGaps(skipped), []);
    assert.ok(skipped.diffSimulation.files[0].overlayFindings.some(finding => finding.code === 'DIFF_CONDITION_FALSE'));
  });
  write(relative, '<root><item exact="1"/><item exact="2"/></root>');
  dlc('ego_dlc_a', '<diff><replace sel="/root/item/@exact">3</replace></diff>');
  check('successful multimatch remains fully composed', () => {
    const multiple = validate();
    assert.deepEqual(referenceGaps(multiple), []);
    assert.ok(multiple.diffSimulation.files[0].overlayFindings.some(finding => finding.code === 'DIFF_SELECTOR_MULTI'));
  });
  write(relative, base);
  dlc('ego_dlc_a', invalid);
  dlc('ego_dlc_b', base);
  check('full replacement clears active failure but preserves historical evidence', () => {
    const replaced = validate();
    assert.deepEqual(referenceGaps(replaced), []);
    assert.ok(replaced.diffSimulation.files[0].overlayFindings.some(finding => finding.severity === 'error'));
  });
  dlc('ego_dlc_b', '<diff><replace sel="/root/item/@exact">9</replace></diff>');
  check('successful later diff cannot repair failed earlier composition', () => {
    assert.ok(referenceGaps(validate()).length > 0);
  });
  dlc('ego_dlc_b', '<root><item></root>');
  check('malformed full replacement owns its own unavailable failure', () => {
    const malformed = validate();
    assert.ok(referenceGaps(malformed).some(gap => gap.reason.includes('ego_dlc_b') && gap.reason.includes('DIFF_XML_INVALID')));
    assert.ok(!referenceGaps(malformed).some(gap => gap.reason.includes('ego_dlc_a')));
    assert.equal(malformed.summary.diffErrors, 0);
  });
  fs.rmSync(path.join(temporary, 'extensions'), { recursive: true });
  write(relative, '<root><item></root>');
  check('malformed base is unavailable reference authority, not invalid mod patch', () => {
    const malformed = validate();
    assert.ok(referenceGaps(malformed).some(gap => gap.reason.includes('base') && gap.reason.includes('DIFF_XML_INVALID')));
    assert.equal(malformed.summary.diffErrors, 0);
  });
  write(relative, '');
  check('empty full reference does not establish a parsed document', () => {
    assert.ok(referenceGaps(validate()).some(gap => gap.reason.includes('DIFF_XML_INVALID')));
  });
  for (const [name, xml] of [
    ['comments only', '<!-- no root -->'],
    ['multiple roots', '<root/><root/>'],
    ['unquoted attribute', '<root value=unquoted/>'],
    ['missing attribute value', '<root value/>'],
  ]) {
    write(relative, xml);
    check(`full source refuses ${name} as reference authority`, () => {
      assert.ok(referenceGaps(validate()).some(gap => gap.reason.includes('DIFF_XML_INVALID')));
    });
  }
  check('strict authority check does not change default simulator repair behavior', () => {
    const xml = '<root value=unquoted/>';
    assert.equal(simulateXmlDiff(xml, '<diff/>').ok, true);
    assert.equal(validateDiffSourceXml(xml)[0]?.code, 'DIFF_XML_INVALID');
  });
  write(relative, base);
  dlc('ego_dlc_a', '<diff><remove sel=/root/missing/></diff>');
  check('repaired official diff syntax is incomplete even when simulation succeeds', () => {
    assert.ok(referenceGaps(validate()).some(gap => gap.reason.includes('DIFF_XML_INVALID')));
  });
  dlc('ego_dlc_a', `<diff><remove sel="//*[${'x'.repeat(3000)}"/></diff>`);
  check('coverage excerpt is bounded while raw official evidence is retained', () => {
    const bounded = validate();
    const gap = referenceGaps(bounded)[0];
    assert.ok(gap && gap.reason.length < 600);
    assert.ok(bounded.diffSimulation.files[0].overlayFindings.some(finding => finding.message.length > 3000));
  });
  fs.rmSync(path.join(temporary, 'extensions'), { recursive: true });
  fs.rmSync(path.join(temporary, relative));
  dlc('ego_dlc_a', patch);
  check('orphan official diff retains unavailable content semantics', () => {
    const orphan = resolveEffectiveReferenceDocument(temporary, relative);
    assert.equal(orphan.available, false);
    assert.equal(orphan.complete, false);
    assert.equal(orphan.incompleteFindings[0].code, 'DIFF_SELECTOR_ZERO');
  });
  dlc('ego_dlc_b', base);
  check('later complete source repairs an orphan without erasing its history', () => {
    const repaired = resolveEffectiveReferenceDocument(temporary, relative);
    assert.equal(repaired.available, true);
    assert.equal(repaired.complete, true);
    assert.deepEqual(repaired.incompleteFindings, []);
    assert.ok(repaired.findings.some(finding => finding.source === 'ego_dlc_a'));
  });
  fs.rmSync(path.join(temporary, 'extensions'), { recursive: true });
  check('missing base retains the existing single missing-base coverage owner', () => {
    const missing = validate();
    assert.deepEqual(referenceGaps(missing), []);
    assert.equal(missing.evidence!.coverage.gaps.filter(gap => gap.check === 'diff.simulation').length, 1);
  });
  write(relative, base);
  const invalidMod: ExtensionProject = { ...project, files: project.files.map(file => file.path === relative ? { ...file, content: invalid } : file) };
  check('invalid authored patch still produces an authored mod error', () => {
    const bad = runProjectValidation(invalidMod, options);
    assert.equal(bad.ok, false);
    assert.ok(bad.summary.diffErrors > 0);
    assert.ok(flattenProjectValidation(bad).some(finding => finding.code === 'DIFF_SELECTOR_INVALID'));
  });
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
const pass = checks.every(check => check.pass);
console.log(JSON.stringify({ pass, passed: checks.filter(check => check.pass).length, total: checks.length, checks }, null, 2));
if (!pass) process.exitCode = 1;
