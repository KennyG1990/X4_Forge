import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildArtifactPlan,
  buildArtifactPlanWithDiskIdentity,
  materializeArtifact,
  verifyMaterializedArtifact,
  type ArtifactPlan,
} from '../src/lib/artifactPipeline';
import { planCatDatCatalogs, verifyCatDatCatalogs, writeCatDatCatalogs } from '../src/lib/x4CatDat';
import { forecastCatalogArtifact, materializeCatalogArtifact } from '../src/lib/artifactPackager';
import { toTFileName } from '../src/lib/modCompiler';

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];
const check = (name: string, pass: boolean, detail?: unknown) => {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail: String(detail) }) });
};

function write(root: string, relativePath: string, content: string | Buffer): void {
  const absolute = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    while (true) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read <= 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function sha256Buffer(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function included(plan: ArtifactPlan, relativePath: string) {
  return plan.entries.find(entry => entry.path === relativePath);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-artifact-check-'));
const source = path.join(root, 'source');
const output = path.join(root, 'output');
const brokenOutput = path.join(root, 'broken-output');
const catalogOutput = path.join(root, 'catalog-output');
const catalogOutputRepeat = path.join(root, 'catalog-output-repeat');
const packagedOutput = path.join(root, 'packaged-output');

try {
  const encodingRoot = path.join(root, 'text-ownership');
  const malformedPath = 'md/legacy.xml';
  const truncatedPath = 'ui/truncated.lua';
  const malformed = Buffer.concat([Buffer.from('<mdscript/> <!-- '), Buffer.from([0x80]), Buffer.from(' -->')]);
  const truncated = Buffer.from([0x61, 0xe2, 0x82]);
  write(encodingRoot, malformedPath, malformed);
  write(encodingRoot, truncatedPath, truncated);
  const replacement = { [malformedPath]: malformed.toString('utf8'), [truncatedPath]: truncated.toString('utf8') };
  for (const format of ['loose', 'catalog'] as const) {
    const observed = buildArtifactPlanWithDiskIdentity({ sourceRoot: encodingRoot, passthroughFiles: replacement }, format);
    check(`native ${format} refuses replacement-text overlays before selecting an artifact`,
      !observed.plan.ok && observed.diskIdentity === null
      && [malformedPath, truncatedPath].every(file => observed.plan.sourceEncodingConflicts?.includes(file)));
  }
  const ordinary = buildArtifactPlan({ sourceRoot: encodingRoot, generatedFiles: replacement });
  check('ordinary artifact planning refuses generated overlay of undecodable source',
    !ordinary.ok && ordinary.sourceEncodingConflicts?.length === 2);
  const diskOnly = buildArtifactPlan({ sourceRoot: encodingRoot });
  check('raw disk-copy remains admissible without a competing text overlay',
    diskOnly.ok && diskOnly.entries.every(entry => entry.disposition === 'source-copy'));
  const equal = buildArtifactPlan({ sourceRoot: encodingRoot, generatedFiles: { [malformedPath]: malformed } });
  check('an exact raw Buffer overlay preserves bytes and remains admissible', equal.ok
    && equal.entries.some(entry => entry.path === malformedPath && entry.sha256 === sha256Buffer(malformed)));
  const byteEdit = Buffer.from([0x80, 0x61]);
  const explicitBytes = buildArtifactPlanWithDiskIdentity({
    sourceRoot: encodingRoot, passthroughFiles: { [malformedPath]: byteEdit },
  }, 'catalog');
  check('explicit byte passthrough retains precedence without text decoding', explicitBytes.plan.ok
    && explicitBytes.plan.entries.some(entry => entry.path === malformedPath && entry.sha256 === sha256Buffer(byteEdit)));
  const splitPath = 'split.txt';
  const validSplit = Buffer.concat([Buffer.alloc(1024 * 1024 - 1, 0x61), Buffer.from('\uFFFD')]);
  write(encodingRoot, splitPath, validSplit);
  const validOptions = { sourceRoot: encodingRoot, generatedFiles: { [splitPath]: 'intentional text edit' } };
  check('normal text editing preserves support for a valid multibyte sequence split across hash blocks',
    buildArtifactPlan(validOptions).ok);
  const physical = path.join(encodingRoot, splitPath);
  let opened = 0;
  const previousOpen = fs.openSync;
  fs.openSync = ((filePath, ...args) => {
    if (filePath === physical) opened++;
    return Reflect.apply(previousOpen, fs, [filePath, ...args]);
  }) as typeof fs.openSync;
  try {
    const observed = buildArtifactPlanWithDiskIdentity(validOptions, 'loose');
    check('native text-overlay validation reads the selected disk path once', observed.plan.ok && opened === 1, opened);
  } finally {
    fs.openSync = previousOpen;
  }
  const ignored = buildArtifactPlan({ sourceRoot: encodingRoot, passthroughFiles: replacement,
    rules: { exclude: [malformedPath], runtimeOwned: [truncatedPath] } });
  check('excluded and runtime-owned files keep their existing precedence',
    ignored.ok && ignored.excluded.some(file => file.path === malformedPath)
    && ignored.runtimeOwned.some(file => file.path === truncatedPath) && ignored.sourceEncodingConflicts === undefined);
  const caseConflict = buildArtifactPlan({ sourceRoot: encodingRoot, generatedFiles: { 'md/Legacy.xml': 'new' } });
  check('case collision refusal remains ahead of text inspection', !caseConflict.ok
    && caseConflict.errors.some(problem => problem.includes('case normalization')) && caseConflict.sourceEncodingConflicts === undefined);
  const ruleLabelRoot = path.join(root, 'rule-labels');
  write(ruleLabelRoot, 'probe.txt', 'rule order');
  const overlappingRules = ['p*.txt', '*.txt'];
  const firstLabel = buildArtifactPlan({ sourceRoot: ruleLabelRoot, rules: { exclude: overlappingRules } });
  const reversedLabel = buildArtifactPlan({ sourceRoot: ruleLabelRoot, rules: { exclude: [...overlappingRules].reverse() } });
  check('overlapping exclusions report the first matching rule in caller order', firstLabel.ok && reversedLabel.ok
    && firstLabel.excluded.find(entry => entry.path === 'probe.txt')?.rule === overlappingRules[0]
    && reversedLabel.excluded.find(entry => entry.path === 'probe.txt')?.rule === overlappingRules[1]);
  const explicitTextNames = [
    ['0001-L044.xml', '44', '0001-L044.xml'],
    ['0002-l44.xml', '44', '0002-l44.xml'],
    ['0003-L00044.xml', '44', '0003-L00044.xml'],
    ['0004-l044.xml', '44', '0004-l044.xml'],
    ['0005-l00044.xml', '44', '0005-l00044.xml'],
    ['Forge.Translations.xml', '44', 'Forge.Translations.xml'],
    ['author-L9.XML', '9', 'author-L9.XML'],
    ['custom-L049.xml', '44', 'custom-L049.xml'],
    ['  kept-L007.xml  ', '07', 'kept-L007.xml'],
  ];
  for (const [fileName, languageId, expected] of explicitTextNames) {
    const actual = toTFileName({ fileName, languageId });
    check(`explicit translation filename is preserved: ${JSON.stringify(fileName)}`, actual === expected, actual);
  }
  for (const [languageId, expected] of [['44', '0001-l044.xml'], ['07', '0001-l007.xml'], ['9', '0001-l009.xml']]) {
    const actual = toTFileName({ languageId });
    check(`generated translation filename stays canonical for language ${languageId}`, actual === expected, actual);
  }
  check('blank translation filename still uses the generated English default', toTFileName({ fileName: '  ' }) === '0001-l044.xml');
  const textCasePair = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    't/0001-L044.xml': '<language id="44"/>',
    't/0001-l044.xml': '<language id="44"/>',
  } });
  check('distinct case-folded translation owners still collide', !textCasePair.ok && textCasePair.errors.some(error => error.toLowerCase().includes('collide')));
  const unsafeTextName = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    [`t/${toTFileName({ fileName: '../escape.xml', languageId: '44' })}`]: '<language id="44"/>',
  } });
  check('explicit translation traversal remains rejected by the artifact guard', !unsafeTextName.ok && unsafeTextName.errors.some(error => error.toLowerCase().includes('unsafe')));
  const memoryPlan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: { 'content.xml': '<content id="memory"/>' } });
  check('memory-only plan never enumerates current directory', memoryPlan.ok && memoryPlan.sourceRoot === '' && memoryPlan.entries.length === 1);
  check('memory-only plan refuses a simultaneous disk root', !buildArtifactPlan({ sourceRoot: root, memoryOnly: true }).ok);
  const originalCwd = process.cwd();
  try {
    process.chdir(root);
    const target = path.join(root, 'memory-artifact');
    const built = materializeArtifact(memoryPlan, target);
    check('generated-only artifact can materialize below the working directory',
      built.ok && verifyMaterializedArtifact(memoryPlan, target).ok, built.errors.join('; '));
    const diskPlan = buildArtifactPlan({ sourceRoot: root });
    const nestedTarget = path.join(root, 'nested-disk-target');
    const overlapping = materializeArtifact(diskPlan, nestedTarget);
    check('disk-backed artifact still refuses nested output before creating it',
      diskPlan.ok && !overlapping.ok && !fs.existsSync(nestedTarget)
      && overlapping.errors.some(error => error.includes('must not overlap')));
  } finally {
    process.chdir(originalCwd);
  }
  fs.mkdirSync(source, { recursive: true });
  write(source, 'content.xml', '<?xml version="1.0"?><content id="artifact_torture" name="Artifact Torture" version="100"/>');
  write(source, 'md/source.xml', '<?xml version="1.0"?><mdscript name="Source"><cues/></mdscript>\r\n');
  write(source, 'aiscripts/behavior.xml', '<?xml version="1.0"?><aiscript name="behavior"/>\n');
  write(source, 'libraries/arbitrary.unknownxml', '<anything value="opaque"/>');
  write(source, 'ui/over-256k.lua', `-- deliberately above the old per-file cap\n${'x'.repeat(300 * 1024)}`);
  write(source, 'ui/under-256k.lua', `-- deliberately below the old per-file cap\n${'y'.repeat((256 * 1024) - 256)}`);
  write(source, 'assets/multi-megabyte.weirdbin', Buffer.alloc((7 * 1024 * 1024) + 123, 0xa5));
  write(source, 'textures/raw-bytes.texture', Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x0d, 0x0a, 0x1a, 0x00]));
  write(source, 'unicode/船/данные.bin', Buffer.from('unicode-path-payload'));
  write(source, 'path with spaces/another file.custom', 'spaces survive');
  write(source, 'deep/a/b/c/d/e/f/g/h/file.no-known-type', 'deep survives');
  write(source, 'duplicate-a/shared.name', 'first basename');
  write(source, 'duplicate-b/shared.name', 'second basename');
  write(source, 'empty/zero.bin', Buffer.alloc(0));
  write(source, 'extensionless', 'no extension');
  write(source, 'encoding/utf8-bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('BOM text') ]));
  write(source, 'encoding/crlf.txt', 'one\r\ntwo\r\n');
  write(source, 'encoding/lf.txt', 'one\ntwo\n');
  write(source, 't/0001-l044.xml', '<?xml version="1.0"?><language id="44"><page id="1000" title="Fixture"><t id="1">Artifact</t></page></language>');
  write(source, 'replace/me.txt', 'source version');
  write(source, 'private/secret.dat', 'must not ship');
  write(source, 'runtime/state.db', Buffer.from('runtime-owned')); 
  write(source, '.git/config', '[remote "origin"]\nurl=https://example.invalid/private.git\n');
  write(source, '.claude/session.json', '{"private":true}');
  write(source, '.kilo/state.json', '{"private":true}');
  write(source, '.forge/cache.bin', Buffer.from('private-forge-state'));
  write(source, 'node_modules/package/index.js', 'module.exports = 1');
  write(source, '.forgeartifact.json', JSON.stringify({
    exclude: ['private/**'],
    runtimeOwned: ['runtime/**'],
    catalogLoose: ['preview.*'],
  }, null, 2));
  write(source, 'preview.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  write(source, 'ext_07.cat', 'opaque pre-existing catalog manifest');
  write(source, 'ext_07.dat', Buffer.from([0xca, 0x7a, 0x10, 0x07]));
  const loadedTextPath = 'tools/forge.py';
  const loadedTextBytes = Buffer.from('#!/usr/bin/env python3\nprint("loaded bytes")\n', 'utf8');
  const loadedBinaryPath = 'loaded/raw-bytes.arbitrary';
  const loadedBinaryBytes = Buffer.from([0x00, 0xff, 0x10, 0x20, 0x80]);
  const loadedEmptyPath = 'loaded/empty.bin';

  const plan = buildArtifactPlan({
    sourceRoot: source,
    generatedFiles: {
      'md/generated.xml': '<?xml version="1.0"?><mdscript name="Generated"><cues/></mdscript>',
      'replace/me.txt': 'generated version',
    },
    passthroughFiles: {
      [loadedTextPath]: loadedTextBytes,
      [loadedBinaryPath]: loadedBinaryBytes,
      [loadedEmptyPath]: Buffer.alloc(0),
    },
  });
  const loadedTextEntry = included(plan, loadedTextPath);
  const loadedTextContent = loadedTextEntry?.content;
  const loadedBinaryEntry = included(plan, loadedBinaryPath);
  const loadedBinaryContent = loadedBinaryEntry?.content;
  const loadedEmptyEntry = included(plan, loadedEmptyPath);
  const loadedEmptyContent = loadedEmptyEntry?.content;

  check('plan succeeds', plan.ok, plan.errors.join('; '));
  check('large text is source-copy', included(plan, 'ui/over-256k.lua')?.disposition === 'source-copy');
  check('multi-megabyte arbitrary binary is source-copy', included(plan, 'assets/multi-megabyte.weirdbin')?.disposition === 'source-copy');
  check('generated output is owned by compiler output', included(plan, 'md/generated.xml')?.disposition === 'generated');
  check('generated output replaces same-path source deterministically', included(plan, 'replace/me.txt')?.disposition === 'generated');
  check('unknown extension defaults to source-copy', included(plan, 'libraries/arbitrary.unknownxml')?.disposition === 'source-copy');
  check('unicode path survives planning', included(plan, 'unicode/船/данные.bin')?.disposition === 'source-copy');
  check('empty file survives planning', included(plan, 'empty/zero.bin')?.size === 0);
  check(
    'loaded .py passthrough Buffer keeps original plan bytes and hash',
    loadedTextEntry?.disposition === 'generated'
      && loadedTextEntry.size === loadedTextBytes.length
      && loadedTextEntry.sha256 === sha256Buffer(loadedTextBytes)
      && Buffer.isBuffer(loadedTextContent)
      && loadedTextContent.equals(loadedTextBytes),
  );
  check(
    'loaded arbitrary and empty passthrough Buffers keep exact plan bytes',
    loadedBinaryEntry?.size === loadedBinaryBytes.length
      && loadedBinaryEntry.sha256 === sha256Buffer(loadedBinaryBytes)
      && Buffer.isBuffer(loadedBinaryContent)
      && loadedBinaryContent.equals(loadedBinaryBytes)
      && loadedEmptyEntry?.size === 0
      && loadedEmptyEntry.sha256 === sha256Buffer(Buffer.alloc(0))
      && Buffer.isBuffer(loadedEmptyContent)
      && loadedEmptyContent.length === 0,
  );
  check('git metadata excluded', plan.excluded.some(entry => entry.path === '.git/**'));
  check('agent metadata excluded', ['.claude/**', '.kilo/**', '.forge/**'].every(p => plan.excluded.some(entry => entry.path === p)));
  check('node_modules excluded', plan.excluded.some(entry => entry.path === 'node_modules/**'));
  check('project exclusion applied', plan.excluded.some(entry => entry.path === 'private/**' && entry.reason.includes('project')));
  check('runtime-owned path separated', plan.runtimeOwned.some(entry => entry.path === 'runtime/**'));
  check('artifact config is not shipped', plan.excluded.some(entry => entry.path === '.forgeartifact.json'));
  check('catalogLoose rule recorded', included(plan, 'preview.jpg')?.catalogLoose === true);

  const build = materializeArtifact(plan, output);
  check('materialization succeeds', build.ok, build.errors.join('; '));
  const verification = verifyMaterializedArtifact(plan, output);
  check('materialized artifact verifies', verification.ok, verification.errors.join('; '));
  for (const relativePath of ['empty/zero.bin', loadedTextPath]) {
    const growingPath = path.join(output, ...relativePath.split('/'));
    const originalBytes = fs.readFileSync(growingPath);
    const previousStat = fs.statSync;
    let growthTriggered = false;
    const statWithGrowth = ((filePath, ...args) => {
      const observed = Reflect.apply(previousStat, fs, [filePath, ...args]);
      if (filePath === growingPath && !growthTriggered) {
        // Return the genuine earlier size after the file has grown. The verifier
        // must consume the added byte even when that size hint was zero.
        fs.appendFileSync(growingPath, Buffer.from([0xa5]));
        growthTriggered = true;
      }
      return observed;
    }) as typeof fs.statSync;
    if (!Reflect.set(fs, 'statSync', statWithGrowth)) throw new Error('Could not install the fixture stat hook.');
    try {
      const growth = verifyMaterializedArtifact(plan, output);
      check(`stale observed size still hashes ${relativePath} growth through EOF`, growthTriggered && !growth.ok
        && growth.checked === plan.entries.length
        && growth.errors.some(error => error.startsWith(`Artifact hash mismatch for ${relativePath}:`))
        && !growth.errors.some(error => error.startsWith(`Artifact size mismatch for ${relativePath}:`)), growth.errors.join('; '));
    } finally {
      Reflect.set(fs, 'statSync', previousStat);
      fs.writeFileSync(growingPath, originalBytes);
    }
  }
  check('large text hash-identical', sha256File(path.join(source, 'ui', 'over-256k.lua')) === sha256File(path.join(output, 'ui', 'over-256k.lua')));
  check('multi-megabyte binary hash-identical', sha256File(path.join(source, 'assets', 'multi-megabyte.weirdbin')) === sha256File(path.join(output, 'assets', 'multi-megabyte.weirdbin')));
  check('loaded .py passthrough materializes exact bytes', fs.readFileSync(path.join(output, ...loadedTextPath.split('/'))).equals(loadedTextBytes));
  check('loaded arbitrary passthrough materializes exact bytes', fs.readFileSync(path.join(output, ...loadedBinaryPath.split('/'))).equals(loadedBinaryBytes));
  check('loaded empty passthrough remains empty', fs.readFileSync(path.join(output, ...loadedEmptyPath.split('/'))).equals(Buffer.alloc(0)));
  check('generated replacement wins', fs.readFileSync(path.join(output, 'replace', 'me.txt'), 'utf8') === 'generated version');
  check('excluded paths absent', !fs.existsSync(path.join(output, '.git')) && !fs.existsSync(path.join(output, 'private')));
  check('runtime-owned paths absent from fresh artifact', !fs.existsSync(path.join(output, 'runtime')));

  const loadedTamperPath = path.join(output, ...loadedTextPath.split('/'));
  const loadedOriginalBytes = fs.readFileSync(loadedTamperPath);
  const loadedTamperedBytes = Buffer.from(loadedOriginalBytes);
  loadedTamperedBytes[0] ^= 0xff;
  fs.writeFileSync(loadedTamperPath, loadedTamperedBytes);
  const loadedTamperVerification = verifyMaterializedArtifact(plan, output);
  fs.writeFileSync(loadedTamperPath, loadedOriginalBytes);
  check(
    'loaded passthrough byte tamper is rejected',
    !loadedTamperVerification.ok
      && loadedTamperVerification.errors.some(error => error.includes(loadedTextPath) && error.includes('mismatch')),
    loadedTamperVerification.errors.join('; '),
  );

  const catalogEntries = plan.entries
    .filter(entry => entry.path !== 'content.xml' && !entry.catalogLoose)
    .map(entry => ({
      name: entry.path,
      size: entry.size,
      sourcePath: entry.sourcePath,
      content: entry.content,
      expectedSha256: entry.sha256,
    }));
  const catalogs = writeCatDatCatalogs(catalogEntries, catalogOutput, { maxVolumeBytes: 2 * 1024 * 1024 });
  check('catalog writer succeeds', catalogs.ok, catalogs.errors.join('; '));
  check('catalog writer splits deterministic volumes without splitting files', catalogs.volumes.length >= 2);
  const catalogVerification = verifyCatDatCatalogs(catalogs);
  check('catalog reopen and hash verification succeeds', catalogVerification.ok, catalogVerification.errors.join('; '));
  check('catalog contains arbitrary and unicode paths', catalogs.volumes.some(volume => volume.entries.some(entry => entry.name === 'unicode/船/данные.bin')));
  check('content.xml and catalogLoose paths remain outside catalogs', catalogs.volumes.every(volume => volume.entries.every(entry => entry.name !== 'content.xml' && entry.name !== 'preview.jpg')));
  const catalogLayout = planCatDatCatalogs(catalogEntries, { maxVolumeBytes: 2 * 1024 * 1024 });
  check('split layout predicts exact CAT and DAT sizes on disk', catalogLayout.errors.length === 0
    && catalogLayout.volumes.length === catalogs.volumes.length && catalogLayout.volumes.every((volume, index) => {
      const actual = catalogs.volumes[index];
      return volume.catName === path.basename(actual.catPath) && volume.datName === path.basename(actual.datPath)
        && volume.catBytes === fs.statSync(actual.catPath).size && volume.datBytes === fs.statSync(actual.datPath).size;
    }));
  const boundaryLayout = planCatDatCatalogs([{ name: 'a', size: 1 }, { name: 'b', size: 1 }, { name: 'c', size: 3 }, { name: 'd', size: 0 }],
    { maxVolumeBytes: 2 });
  check('layout retains exact-limit, oversized-singleton and zero-byte partition behavior', boundaryLayout.errors.length === 0
    && JSON.stringify(boundaryLayout.volumes.map(volume => [volume.datBytes, volume.entries.length])) === '[[2,2],[3,1],[0,1]]');

  const repeatedCatalogs = writeCatDatCatalogs(catalogEntries, catalogOutputRepeat, { maxVolumeBytes: 2 * 1024 * 1024 });
  const firstCatalogHashes = catalogs.volumes.flatMap(volume => [sha256File(volume.catPath), sha256File(volume.datPath)]);
  const repeatCatalogHashes = repeatedCatalogs.volumes.flatMap(volume => [sha256File(volume.catPath), sha256File(volume.datPath)]);
  check('catalog build is byte-deterministic', repeatedCatalogs.ok && JSON.stringify(firstCatalogHashes) === JSON.stringify(repeatCatalogHashes), repeatedCatalogs.errors.join('; '));

  if (catalogs.volumes[0]?.bytes) {
    const fd = fs.openSync(catalogs.volumes[0].datPath, 'r+');
    try {
      const byte = Buffer.alloc(1);
      fs.readSync(fd, byte, 0, 1, 0);
      byte[0] ^= 0xff;
      fs.writeSync(fd, byte, 0, 1, 0);
    } finally {
      fs.closeSync(fd);
    }
  }
  const tamperedCatalogVerification = verifyCatDatCatalogs(catalogs);
  check('catalog tamper is detected', !tamperedCatalogVerification.ok && tamperedCatalogVerification.errors.some(error => error.includes('mismatch')), tamperedCatalogVerification.errors.join('; '));

  const unsafeCatalog = writeCatDatCatalogs([{ name: '../escape.bin', size: 0, content: Buffer.alloc(0) }], path.join(root, 'unsafe-catalog'));
  check('catalog traversal path rejected', !unsafeCatalog.ok && unsafeCatalog.errors.some(error => error.includes('Unsafe')));
  const ambiguousName = [{ name: ' leading.bin', size: 0, content: Buffer.alloc(0) }];
  const ambiguousLayout = planCatDatCatalogs(ambiguousName);
  const ambiguousOutput = path.join(root, 'ambiguous-catalog');
  const ambiguousCatalog = writeCatDatCatalogs(ambiguousName, ambiguousOutput);
  check('layout refuses a filename the CAT reader would trim', ambiguousLayout.errors.some(error => error.includes('round-trip'))
    && !ambiguousCatalog.ok && !fs.existsSync(ambiguousOutput));
  const rollbackCatalogRoot = path.join(root, 'rollback-catalog');
  const rollbackCatalog = writeCatDatCatalogs([
    { name: 'a.bin', size: 1, content: Buffer.from([1]) },
    { name: 'z.bin', size: 1, sourcePath: path.join(root, 'missing.bin') },
  ], rollbackCatalogRoot, { maxVolumeBytes: 1 });
  check('partial multi-volume failure rolls back prior volumes', !rollbackCatalog.ok && rollbackCatalog.volumes.length === 0 && fs.readdirSync(rollbackCatalogRoot).length === 0, rollbackCatalog.errors.join('; '));

  const packageOptions = { maxVolumeBytes: 2 * 1024 * 1024 };
  const forecast = forecastCatalogArtifact(plan, packageOptions);
  check('forecast does not create packaged output', !fs.existsSync(packagedOutput));
  const packaged = materializeCatalogArtifact(plan, packagedOutput, packageOptions);
  check('packed artifact materialization succeeds', packaged.ok, packaged.errors.join('; '));
  check('packed artifact keeps content.xml loose', fs.existsSync(path.join(packagedOutput, 'content.xml')));
  check('packed artifact keeps configured preview loose', fs.existsSync(path.join(packagedOutput, 'preview.jpg')));
  check('packed artifact preserves pre-existing root catalog pair', fs.existsSync(path.join(packagedOutput, 'ext_07.cat')) && fs.existsSync(path.join(packagedOutput, 'ext_07.dat')));
  check('new catalogs follow pre-existing catalog index', packaged.catalogs.volumes[0]?.index === 8, packaged.catalogs.volumes.map(volume => volume.index).join(','));
  check('packed payload is not duplicated loose', !fs.existsSync(path.join(packagedOutput, 'md')) && !fs.existsSync(path.join(packagedOutput, 'assets')));
  check('forecast includes exact sizes of every loose and generated output', 'files' in forecast
    && JSON.stringify(forecast.files) === JSON.stringify(packaged.files.map(file => ({
      path: file.path, size: fs.statSync(path.join(packagedOutput, ...file.path.split('/'))).size,
    }))));

  const allLoosePlan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    'content.xml': '<content/>', 'ext_07.sig': 'old signature', 'preview.jpg': 'loose',
  }, rules: { catalogLoose: ['preview.jpg'] } });
  const allLooseForecast = forecastCatalogArtifact(allLoosePlan);
  const allLooseOutput = path.join(root, 'all-loose-package');
  const allLoose = materializeCatalogArtifact(allLoosePlan, allLooseOutput);
  check('all-loose packages do not invent a catalog volume', allLoose.ok && allLoose.catalogs.volumes.length === 0
    && 'files' in allLooseForecast && JSON.stringify(allLooseForecast.files) === JSON.stringify(allLoose.files.map(file => ({
      path: file.path, size: fs.statSync(path.join(allLooseOutput, file.path)).size,
    }))));
  const conflictPlan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    'ext_01.cat/loose.txt': 'loose', 'payload.bin': 'packed',
  }, rules: { catalogLoose: ['ext_01.cat/**'] } });
  const impossibleForecast = forecastCatalogArtifact(conflictPlan);
  const impossibleOutput = path.join(root, 'impossible-package');
  const impossiblePackage = materializeCatalogArtifact(conflictPlan, impossibleOutput);
  check('forecast and packing refuse a catalog filename occupied by a loose directory', 'errors' in impossibleForecast
    && impossibleForecast.errors.some(error => error.includes('ext_01.cat')) && !impossiblePackage.ok && !fs.existsSync(impossibleOutput));

  fs.rmSync(path.join(source, 'ui', 'over-256k.lua'));
  const broken = materializeArtifact(plan, brokenOutput);
  check('missing planned source fails closed', !broken.ok && broken.errors.some(error => error.includes('ui/over-256k.lua')), broken.errors.join('; '));

  const traversalPlan = buildArtifactPlan({ sourceRoot: source, generatedFiles: { '../escape.txt': 'no' } });
  check('generated traversal rejected', !traversalPlan.ok && traversalPlan.errors.some(error => error.toLowerCase().includes('unsafe')));
  write(source, 'collision/Name.txt', 'source case');
  const collisionPlan = buildArtifactPlan({ sourceRoot: source, generatedFiles: { 'collision/name.txt': 'generated case' } });
  check('case-fold collision rejected', !collisionPlan.ok && collisionPlan.errors.some(error => error.toLowerCase().includes('collide')));

  const symlinkTarget = path.join(root, 'outside.txt');
  fs.writeFileSync(symlinkTarget, 'outside');
  let symlinkSupported = true;
  try {
    fs.symlinkSync(symlinkTarget, path.join(source, 'linked-outside.txt'), 'file');
  } catch {
    symlinkSupported = false;
  }
  if (symlinkSupported) {
    const symlinkPlan = buildArtifactPlan({ sourceRoot: source, generatedFiles: {} });
    check('symlink/reparse entry fails closed', !symlinkPlan.ok && symlinkPlan.errors.some(error => error.toLowerCase().includes('symbolic')));
  } else {
    check('symlink negative skipped when host forbids fixture creation', true);
  }
} catch (error) {
  check('test harness completed', false, error instanceof Error ? error.stack || error.message : String(error));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

const passed = checks.filter(item => item.pass).length;
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
console.log(`artifact pipeline: ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
