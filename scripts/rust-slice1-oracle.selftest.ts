/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice 1 black-box oracle selftest:
 *  A. Tree-hash & buildArtifactPlan bit-for-bit parity (Rust ON vs X4_FORGE_DISABLE_RUST=1) + symlink refusal
 *  B. .cat/.dat round-trip parity (TS x4CatDat <-> x4forge cat-list / cat-extract / cat-pack)
 *  C. x4forge validate: clean mod (0 findings), 24+ seeded defects, SARIF/GitHub outputs, forge.rules.json, --fix
 *  D. Optional local X4 9.00 benchmark printout (skipped gracefully on CI when X4_REFERENCE_ROOT is absent)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactPlanIdentity, buildArtifactPlan, buildArtifactPlanWithDiskIdentity } from '../src/lib/artifactPipeline';
import { getReferenceCorpus } from '../src/lib/referenceCorpus';
import { parseCat, planCatDatCatalogs, readEntryBytes, writeCatDatLayout } from '../src/lib/x4CatDat';
import { resolveRustX4ForgeBin, tryRustHashTree } from '../src/server/rustAccelerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function runX4Forge(bin: string, args: string[], envOverrides: Record<string, string | undefined> = {}): { status: number; stdout: string; stderr: string } {
  const env = { ...process.env, ...envOverrides };
  try {
    const stdout = execFileSync(bin, args, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: typeof e.status === 'number' ? e.status : 2,
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
    };
  }
}

function withDisableRust<T>(disabled: boolean, fn: () => T): T {
  const prev = process.env.X4_FORGE_DISABLE_RUST;
  if (disabled) process.env.X4_FORGE_DISABLE_RUST = '1';
  else delete process.env.X4_FORGE_DISABLE_RUST;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.X4_FORGE_DISABLE_RUST;
    else process.env.X4_FORGE_DISABLE_RUST = prev;
  }
}

function verifyCheckA(bin: string, scratch: string): void {
  const srcRoot = path.join(scratch, 'tree-parity');
  fs.mkdirSync(path.join(srcRoot, 'SubDir'), { recursive: true });
  fs.mkdirSync(path.join(srcRoot, '.git', 'objects'), { recursive: true });
  fs.writeFileSync(path.join(srcRoot, 'Alpha.xml'), '<content id="parity"/>\n', 'utf8');
  fs.writeFileSync(path.join(srcRoot, 'empty.bin'), Buffer.alloc(0));
  fs.writeFileSync(path.join(srcRoot, 'large.dat'), Buffer.alloc(196_608, 0x5a));
  fs.writeFileSync(path.join(srcRoot, 'SubDir', 'Gamma.lua'), 'local ok = true\nreturn ok\n', 'utf8');
  fs.writeFileSync(path.join(srcRoot, 'bad_utf8.xml'), Buffer.from([0xff, 0xfe, 0x80, 0x3c]));
  fs.writeFileSync(path.join(srcRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');

  // Assert Rust accelerator actually runs for this check.
  const rustProbe = withDisableRust(false, () => tryRustHashTree(srcRoot, {
    checkUtf8: true,
    excludeDirs: ['.git'],
  }));
  assert(rustProbe && rustProbe.ok, 'Expected tryRustHashTree to succeed with Rust binary built');

  const opts = {
    sourceRoot: srcRoot,
    generatedFiles: {
      'bad_utf8.xml': '<repaired/>',
      'SubDir/Gamma.lua': 'local ok = false\nreturn ok\n',
    },
  };
  const forceWithRust = <T>(fn: () => T): T => {
    const prevForce = process.env.X4_FORGE_FORCE_RUST;
    process.env.X4_FORGE_FORCE_RUST = '1';
    try {
      return withDisableRust(false, fn);
    } finally {
      if (prevForce === undefined) delete process.env.X4_FORGE_FORCE_RUST;
      else process.env.X4_FORGE_FORCE_RUST = prevForce;
    }
  };
  const planRust = forceWithRust(() => buildArtifactPlan(opts));
  const planTs = withDisableRust(true, () => buildArtifactPlan(opts));

  assert.equal(planRust.ok, planTs.ok, 'artifactPlan ok must match');
  assert.deepEqual(planRust.sourceEncodingConflicts, planTs.sourceEncodingConflicts, 'encoding conflicts must match');
  assert.deepEqual(planRust.excluded, planTs.excluded, 'excluded list must match');
  assert.deepEqual(planRust.errors, planTs.errors, 'errors must match');

  // Verify encoding-conflict case passes once bad_utf8.xml isn't overlaid.
  const cleanOpts = {
    sourceRoot: srcRoot,
    generatedFiles: {
      'SubDir/Gamma.lua': 'local ok = false\nreturn ok\n',
    },
  };
  const diskRust: Array<{ path: string; sha256: string; size: number }> = [];
  const diskTs: Array<{ path: string; sha256: string; size: number }> = [];
  const cleanRust = forceWithRust(() => {
    const res = buildArtifactPlanWithDiskIdentity(cleanOpts, 'loose');
    for (const e of res.plan.entries) diskRust.push({ path: e.path, sha256: e.sha256, size: e.size });
    return res;
  });
  const cleanTs = withDisableRust(true, () => {
    const res = buildArtifactPlanWithDiskIdentity(cleanOpts, 'loose');
    for (const e of res.plan.entries) diskTs.push({ path: e.path, sha256: e.sha256, size: e.size });
    return res;
  });
  assert.equal(cleanRust.plan.ok, true);
  assert.equal(cleanRust.diskIdentity, cleanTs.diskIdentity);
  assert.equal(artifactPlanIdentity(cleanRust.plan, 'loose'), artifactPlanIdentity(cleanTs.plan, 'loose'));
  assert.deepEqual(diskRust, diskTs);

  // Symlink/junction check: Rust exits 3 cleanly and TS fallback emits the canonical symlink error.
  const linkTarget = path.join(scratch, 'sym-target');
  const linkPath = path.join(srcRoot, 'linked_dir');
  fs.mkdirSync(linkTarget, { recursive: true });
  let linked = false;
  try {
    fs.symlinkSync(linkTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    linked = true;
  } catch {
    linked = false;
  }
  if (linked) {
    const cliSym = runX4Forge(bin, ['hash-tree', srcRoot]);
    assert.equal(cliSym.status, 3, `Expected x4forge hash-tree exit 3 on symlink, got ${cliSym.status}`);
    const symPlanRust = withDisableRust(false, () => buildArtifactPlan({ sourceRoot: srcRoot }));
    const symPlanTs = withDisableRust(true, () => buildArtifactPlan({ sourceRoot: srcRoot }));
    assert.equal(symPlanRust.ok, false);
    assert.deepEqual(symPlanRust.errors, symPlanTs.errors);
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
}

function verifyCheckB(bin: string, scratch: string): void {
  const tsOut = path.join(scratch, 'catdat-ts');
  const rustOut = path.join(scratch, 'catdat-rust');
  fs.mkdirSync(tsOut, { recursive: true });
  fs.mkdirSync(rustOut, { recursive: true });

  const makePackEntry = (name: string, content: string | Buffer) => {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    return {
      name,
      size: buf.length,
      expectedSha256: crypto.createHash('sha256').update(buf).digest('hex'),
      content,
    };
  };
  const entries = [
    makePackEntry('md/example mission.xml', '<mdscript name="Example"><cues/></mdscript>\n'),
    makePackEntry('ui/panel.lua', Buffer.from('-- lua\nreturn {}\n', 'utf8')),
    makePackEntry('substitutions/bin with spaces.bin', Buffer.from([0, 1, 2, 3, 250, 251, 255])),
  ];
  const layout = planCatDatCatalogs(entries, { baseName: 'ext' });
  assert.equal(layout.errors.length, 0, layout.errors.join('; '));

  const tsPacked = writeCatDatLayout(layout, tsOut);
  assert.equal(tsPacked.ok, true, `TS writeCatDatLayout failed: ${tsPacked.errors.join('; ')}`);

  // Serialize layout for Rust cat-pack (--layout-file).
  const rustLayout = {
    volumes: layout.volumes.map(v => ({
      index: v.index,
      catName: v.catName,
      datName: v.datName,
      catBytes: v.catBytes,
      datBytes: v.datBytes,
      entries: v.entries.map(e => ({
        name: e.name,
        size: e.size,
        expectedSha256: e.expectedSha256,
        timestamp: 0,
        ...(typeof e.content === 'string'
          ? { content: e.content }
          : Buffer.isBuffer(e.content)
            ? { contentBase64: e.content.toString('base64') }
            : {}),
      })),
    })),
    errors: layout.errors,
  };
  const layoutFile = path.join(scratch, 'pack-layout.json');
  fs.writeFileSync(layoutFile, JSON.stringify(rustLayout), 'utf8');

  const packRes = runX4Forge(bin, ['cat-pack', rustOut, '--layout-file', layoutFile]);
  assert.equal(packRes.status, 0, `cat-pack failed: ${packRes.stderr} ${packRes.stdout}`);
  const parsedPack = JSON.parse(packRes.stdout) as { ok: boolean };
  assert.equal(parsedPack.ok, true);

  // Byte-for-byte parity on .dat and parse parity on .cat between TS and Rust!
  const tsDat = fs.readFileSync(tsPacked.volumes[0].datPath);
  const rustDat = fs.readFileSync(path.join(rustOut, layout.volumes[0].datName));
  assert.equal(
    crypto.createHash('sha256').update(tsDat).digest('hex'),
    crypto.createHash('sha256').update(rustDat).digest('hex'),
    '.dat archive SHA-256 must match identically between TS and Rust',
  );

  // List & extract via x4forge on TS-packed archive, and read back Rust-packed archive via TS parseCat/readEntryBytes.
  const listRes = runX4Forge(bin, ['cat-list', tsPacked.volumes[0].catPath, '--strict']);
  assert.equal(listRes.status, 0);
  const listed = JSON.parse(listRes.stdout) as Array<{ name: string; size: number }>;
  assert.equal(listed.length, 3);
  assert.equal(listed[0].name, 'md/example mission.xml');

  const extractOut = path.join(scratch, 'extracted.bin');
  const extRes = runX4Forge(bin, [
    'cat-extract',
    tsPacked.volumes[0].catPath,
    tsPacked.volumes[0].datPath,
    'substitutions/bin with spaces.bin',
    '--out',
    extractOut,
  ]);
  assert.equal(extRes.status, 0);
  assert.deepEqual(fs.readFileSync(extractOut), Buffer.from([0, 1, 2, 3, 250, 251, 255]));

  const tsReadCat = parseCat(path.join(rustOut, layout.volumes[0].catName));
  assert.equal(tsReadCat.length, 3);
  const targetBinEntry = tsReadCat.find(e => e.name === 'substitutions/bin with spaces.bin');
  assert(targetBinEntry, 'Expected substitutions/bin with spaces.bin in Rust-packed catalog');
  const roundTripped = readEntryBytes(path.join(rustOut, layout.volumes[0].datName), targetBinEntry);
  assert.deepEqual(roundTripped, Buffer.from([0, 1, 2, 3, 250, 251, 255]));
}

function buildHermeticCorpus(root: string): void {
  const dirs = ['libraries', 'md', 'aiscripts', 'index', 'maps'];
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });

  fs.writeFileSync(path.join(root, 'libraries', 'common.xsd'), `<?xml version="1.0" encoding="utf-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="actionmode">
    <xs:restriction base="xs:string">
      <xs:enumeration value="instant"/>
      <xs:enumeration value="queued"/>
    </xs:restriction>
  </xs:simpleType>
</xs:schema>`, 'utf8');

  fs.writeFileSync(path.join(root, 'libraries', 'diff.xsd'), `<?xml version="1.0" encoding="utf-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="diff">
    <xs:complexType>
      <xs:choice maxOccurs="unbounded">
        <xs:element name="add" type="diffop"/>
        <xs:element name="replace" type="diffop"/>
        <xs:element name="remove" type="diffremove"/>
      </xs:choice>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="diffop" mixed="true">
    <xs:attribute name="sel" type="xs:string" use="required"/>
    <xs:attribute name="pos" type="xs:string"/>
    <xs:anyAttribute/>
  </xs:complexType>
  <xs:complexType name="diffremove">
    <xs:attribute name="sel" type="xs:string" use="required"/>
  </xs:complexType>
</xs:schema>`, 'utf8');

  fs.writeFileSync(path.join(root, 'md', 'md.xsd'), `<?xml version="1.0" encoding="utf-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="../libraries/common.xsd"/>
  <xs:element name="mdscript">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="cues" type="cuesType" minOccurs="0"/>
      </xs:sequence>
      <xs:attribute name="name" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="cuesType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="cue" type="cueType"/>
      <xs:element name="library" type="libraryType"/>
    </xs:choice>
  </xs:complexType>
  <xs:complexType name="cueType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="conditions" type="anyBlockType" minOccurs="0"/>
      <xs:element name="actions" type="actionsType" minOccurs="0"/>
      <xs:element name="cues" type="cuesType" minOccurs="0"/>
    </xs:choice>
    <xs:attribute name="name" type="xs:string" use="required"/>
    <xs:attribute name="instantiate" type="xs:boolean"/>
  </xs:complexType>
  <xs:complexType name="libraryType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="params" type="paramsType" minOccurs="0"/>
      <xs:element name="actions" type="actionsType" minOccurs="0"/>
    </xs:choice>
    <xs:attribute name="name" type="xs:string" use="required"/>
    <xs:attribute name="purpose" type="xs:string"/>
  </xs:complexType>
  <xs:complexType name="paramsType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="param">
        <xs:complexType>
          <xs:attribute name="name" type="xs:string" use="required"/>
          <xs:attribute name="required" type="xs:boolean"/>
          <xs:attribute name="default" type="xs:string"/>
        </xs:complexType>
      </xs:element>
    </xs:choice>
  </xs:complexType>
  <xs:complexType name="anyBlockType">
    <xs:sequence maxOccurs="unbounded">
      <xs:any minOccurs="0"/>
    </xs:sequence>
    <xs:anyAttribute/>
  </xs:complexType>
  <xs:complexType name="actionsType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="set_value" type="anyAttrs"/>
      <xs:element name="remove_value" type="anyAttrs"/>
      <xs:element name="debug_text" type="anyAttrs"/>
      <xs:element name="signal_cue" type="signalType"/>
      <xs:element name="signal_cue_instantly" type="signalType"/>
      <xs:element name="include_actions" type="callLibType"/>
      <xs:element name="run_actions" type="callLibType"/>
      <xs:element name="raise_lua_event" type="anyAttrs"/>
      <xs:element name="return" type="anyAttrs"/>
      <xs:element name="do_if" type="condActionsType"/>
      <xs:element name="do_elseif" type="condActionsType"/>
      <xs:element name="do_else" type="actionsType"/>
      <xs:element name="reset_cue" type="signalType"/>
    </xs:choice>
  </xs:complexType>
  <xs:complexType name="condActionsType">
    <xs:complexContent>
      <xs:extension base="actionsType">
        <xs:attribute name="value" type="xs:string" use="required"/>
      </xs:extension>
    </xs:complexContent>
  </xs:complexType>
  <xs:complexType name="signalType">
    <xs:attribute name="cue" type="xs:string" use="required"/>
    <xs:attribute name="mode" type="actionmode"/>
  </xs:complexType>
  <xs:complexType name="callLibType">
    <xs:choice maxOccurs="unbounded">
      <xs:element name="param" type="anyAttrs" minOccurs="0"/>
    </xs:choice>
    <xs:attribute name="ref" type="xs:string" use="required"/>
  </xs:complexType>
  <xs:complexType name="anyAttrs">
    <xs:anyAttribute/>
  </xs:complexType>
</xs:schema>`, 'utf8');

  fs.writeFileSync(path.join(root, 'libraries', 'factions.xml'), `<factions><faction id="argon" name="Argon"/></factions>`, 'utf8');
  fs.writeFileSync(path.join(root, 'libraries', 'wares.xml'), `<wares><ware id="hullparts" transport="container" group="refined"/></wares>`, 'utf8');
  fs.writeFileSync(path.join(root, 'libraries', 'jobs.xml'), `<jobs><job id="patrol"><category faction="argon" size="ship_m"/><orders><order order="Patrol"/></orders></job></jobs>`, 'utf8');
  fs.writeFileSync(path.join(root, 'libraries', 'scriptproperties.xml'), `<scriptproperties><keyword name="player"><property name="money" type="money"/></keyword></scriptproperties>`, 'utf8');
  fs.writeFileSync(path.join(root, 'index', 'macros.xml'), `<index><entry name="ship_arg_m_fighter_01_a_macro" value="units/argon/ship"/></index>`, 'utf8');
  fs.writeFileSync(path.join(root, 'aiscripts', 'trade.station.xml'), `<aiscript name="trade.station"><params><param name="home"/></params><actions/></aiscript>`, 'utf8');
  fs.writeFileSync(path.join(root, 'md', 'vanilla_helper.xml'), `<mdscript name="VanillaHelper"><cues><cue name="BaseCue"><actions/></cue></cues></mdscript>`, 'utf8');
}

function verifyCheckC(bin: string, scratch: string): void {
  const corpusRoot = path.join(scratch, 'hermetic-corpus');
  buildHermeticCorpus(corpusRoot);

  // 1. Clean mod -> PASS with 0 errors and 0 warnings.
  const cleanMod = path.join(scratch, 'clean-mod');
  fs.mkdirSync(path.join(cleanMod, 'md'), { recursive: true });
  fs.mkdirSync(path.join(cleanMod, 'ui'), { recursive: true });
  fs.mkdirSync(path.join(cleanMod, 't'), { recursive: true });
  fs.writeFileSync(path.join(cleanMod, 'content.xml'), '<content id="clean_mod" name="Clean" version="100"/>', 'utf8');
  fs.writeFileSync(path.join(cleanMod, 't', '0001-L044.xml'), '<language id="44"><page id="99000"><t id="1">Ready</t></page></language>', 'utf8');
  fs.writeFileSync(path.join(cleanMod, 'md', 'main.xml'), `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="CleanMain">
  <cues>
    <cue name="Start">
      <actions>
        <set_value name="$cash" exact="player.money"/>
        <do_if value="$cash != null">
          <debug_text text="'{99000,1}'"/>
        </do_if>
        <do_else>
          <raise_lua_event name="clean.notify"/>
        </do_else>
      </actions>
    </cue>
  </cues>
</mdscript>`, 'utf8');
  fs.writeFileSync(path.join(cleanMod, 'ui', 'handler.lua'), 'local function onNotify()\n  return true\nend\nRegisterEvent("clean.notify", onNotify)\n', 'utf8');

  const cleanRes = runX4Forge(bin, ['validate', cleanMod, '--unpacked', corpusRoot, '--format', 'json', '--fail-on', 'warning']);
  assert.equal(cleanRes.status, 0, `Clean mod should pass: ${cleanRes.stdout}`);
  const cleanJson = JSON.parse(cleanRes.stdout) as { passed: boolean; counts: { error: number; warning: number }; findings: unknown[] };
  assert.equal(cleanJson.passed, true);
  assert.equal(cleanJson.counts.error, 0);
  assert.equal(cleanJson.counts.warning, 0);

  // 2. Broken mod without content.xml -> project.structure
  const noContentMod = path.join(scratch, 'no-content');
  fs.mkdirSync(path.join(noContentMod, 'md'), { recursive: true });
  fs.writeFileSync(path.join(noContentMod, 'md', 'orphan.xml'), '<mdscript name="O"><cues/></mdscript>', 'utf8');
  const noContentRes = runX4Forge(bin, ['validate', noContentMod, '--json']);
  assert.equal(noContentRes.status, 1);
  const noContentCodes = new Set((JSON.parse(noContentRes.stdout) as { findings: Array<{ code: string }> }).findings.map(f => f.code));
  assert(noContentCodes.has('project.structure'), 'Expected project.structure');

  // 3. Seed 23 additional distinct defect classes into broken-mod.
  const brokenMod = path.join(scratch, 'broken-mod');
  for (const sub of ['md', 'ui', 't', 'libraries']) fs.mkdirSync(path.join(brokenMod, sub), { recursive: true });
  fs.writeFileSync(path.join(brokenMod, 'content.xml'), `<content id="broken_mod" name="Broken">
  <dependency id="broken_mod"/>
  <dependency id="ego_dlc_split"/>
  <dependency id="ego_dlc_split"/>
</content>`, 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'md', 'malformed.xml'), '<mdscript name="M"><cues><cue name="Oops"></cues></mdscript>', 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'md', 'defects.xml'), `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="Defects">
  <cues>
    <library name="NeedParamLib">
      <params>
        <param name="requiredTarget" required="true"/>
      </params>
      <actions/>
    </library>
    <cue/>
    <cue name="UnsetVarCue">
      <actions>
        <debug_text text="$neverAssignedVar"/>
      </actions>
    </cue>
    <cue name="SchemaExprRef" instantiate="notabool" bogusAttr="1">illegal text
      <conditions>
        <event_object_destroyed/>
      </conditions>
      <actions>
        <bogus_element/>
        <do_else/>
        <do_if value="$bad == (1 + 2"/>
        <set_value name="$f1" exact="'%q'.[$arg]"/>
        <set_value name="$f2" exact="'%s %d'.[$onlyOne]"/>
        <do_if value="not $ship? and $ship.isowner"/>
        <set_value name="$sp" exact="player.missing_prop_xyz"/>
        <set_value name="$wref" exact="ware.nonexistent_ware_xyz"/>
        <signal_cue cue="MissingCueTarget" mode="bogusmode"/>
        <signal_cue cue="NeedParamLib"/>
        <include_actions ref="NeedParamLib"/>
        <raise_lua_event name="broken.neverRegistered"/>
      </actions>
    </cue>
  </cues>
</mdscript>`, 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'ui', 'broken.lua'), 'local function oops(\n  return\nend\n', 'utf8');
  fs.writeFileSync(path.join(brokenMod, 't', '0001-L044.xml'), '<language id="44"><page id="99100"><t id="1">Ok</t></page></language>', 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'libraries', 'factions.xml'), `<diff><add sel="/factions/faction[@id='missing_faction']"><relation faction="argon" relation="2.5"/></add></diff>`, 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'libraries', 'wares.xml'), `<diff><replace sel="/wares/ware[@id='hullparts']/price"><price min="50" average="30" max="40"/></replace></diff>`, 'utf8');
  fs.writeFileSync(path.join(brokenMod, 'md', 'textref.xml'), `<mdscript name="TextRef"><cues><cue name="TR"><actions><debug_text text="'{99100,999}'"/></actions></cue></cues></mdscript>`, 'utf8');

  const brokenRes = runX4Forge(bin, ['validate', brokenMod, '--unpacked', corpusRoot, '--format', 'json']);
  assert.equal(brokenRes.status, 1);
  const brokenJson = JSON.parse(brokenRes.stdout) as { findings: Array<{ code: string }> };
  const codes = new Set(brokenJson.findings.map(f => f.code));

  const requiredCodes = [
    'xml.wellformedness',
    'dep.self',
    'dep.duplicate',
    'XSD_UNKNOWN_ELEMENT',
    'XSD_UNKNOWN_ATTRIBUTE',
    'XSD_MISSING_REQUIRED',
    'XSD_ENUM_VIOLATION',
    'XSD_TYPE_VIOLATION',
    'XSD_TEXT_NOT_ALLOWED',
    'md.unmatched_else',
    'expression-syntax',
    'expression-format-specifier',
    'format-arguments-missing',
    'expression-null-safe-exists',
    'scriptproperty.unknown',
    'cue.unresolved',
    'md.signal_library',
    'md.cue_library_param_required',
    'md_pitfall.destroyed_event_source_required',
    'md_pitfall.variable_never_set',
    'lua.syntax_error',
    'md_lua.missing_register',
    'factions.relation_out_of_range',
    'wares.invalid_price_range',
    'tfile.dangling_text_ref',
    'diff.selector_zero_match',
    'reference.unknown_ware',
  ];
  for (const rc of requiredCodes) {
    assert(codes.has(rc), `Missing expected diagnostic code "${rc}". Got: ${[...codes].sort().join(', ')}`);
  }

  // Verify SARIF and GitHub formats
  const sarifRes = runX4Forge(bin, ['validate', brokenMod, '--unpacked', corpusRoot, '--format', 'sarif']);
  assert.equal(sarifRes.status, 1);
  const sarif = JSON.parse(sarifRes.stdout) as { version: string; runs: Array<{ columnKind: string; results: unknown[] }> };
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].columnKind, 'utf16CodeUnits');
  assert(sarif.runs[0].results.length >= requiredCodes.length);

  const ghRes = runX4Forge(bin, ['validate', brokenMod, '--unpacked', corpusRoot, '--format', 'github']);
  assert.equal(ghRes.status, 1);
  assert(ghRes.stdout.includes('::error ') && ghRes.stdout.includes('::warning '));

  // Verify forge.rules.json suppresses a warning but never suppresses errors
  const rulesMod = path.join(scratch, 'rules-mod');
  fs.mkdirSync(path.join(rulesMod, 'md'), { recursive: true });
  fs.writeFileSync(path.join(rulesMod, 'content.xml'), '<content id="rules_mod" name="Rules"/>', 'utf8');
  fs.writeFileSync(path.join(rulesMod, 'md', 'w.xml'), '<mdscript name="W"><cues><cue name="C"><actions><debug_text text="$unset"/><do_else/></actions></cue></cues></mdscript>', 'utf8');
  fs.writeFileSync(path.join(rulesMod, 'forge.rules.json'), JSON.stringify({
    version: 1,
    suppressions: [
      { id: 'allow.unset', owner: 'qa', reason: 'intentional warning suppression check', reviewBy: '2027-01-01', code: 'md_pitfall.variable_never_set', file: 'md/w.xml' },
      { id: 'try.error', owner: 'qa', reason: 'must never suppress an actual error', reviewBy: '2027-01-01', code: 'md.unmatched_else', file: 'md/w.xml' },
    ],
  }), 'utf8');
  const rulesRes = runX4Forge(bin, ['validate', rulesMod, '--json']);
  assert.equal(rulesRes.status, 1);
  const rulesJson = JSON.parse(rulesRes.stdout) as { suppressedCount: number; findings: Array<{ code: string }> };
  assert.equal(rulesJson.suppressedCount, 1);
  assert(!rulesJson.findings.some(f => f.code === 'md_pitfall.variable_never_set'));
  assert(rulesJson.findings.some(f => f.code === 'md.unmatched_else'));

  // Verify --fix repairs distance-2 typo <siganl_cue> -> <signal_cue>
  const fixMod = path.join(scratch, 'fix-mod');
  fs.mkdirSync(path.join(fixMod, 'md'), { recursive: true });
  fs.writeFileSync(path.join(fixMod, 'content.xml'), '<content id="fix_mod" name="Fix"/>', 'utf8');
  fs.writeFileSync(path.join(fixMod, 'md', 'typo.xml'), '<mdscript name="T"><cues><cue name="Init"><actions><siganl_cue cue="Init"/></actions></cue></cues></mdscript>', 'utf8');
  const fixRes = runX4Forge(bin, ['validate', fixMod, '--unpacked', corpusRoot, '--fix', '--json']);
  assert.equal(fixRes.status, 0, `Expected fixed mod to pass: ${fixRes.stdout}`);
  const fixedXml = fs.readFileSync(path.join(fixMod, 'md', 'typo.xml'), 'utf8');
  assert(fixedXml.includes('<signal_cue cue="Init"/>'), `Expected --fix to rewrite typo tag, got: ${fixedXml}`);
}

function maybeRunLocalX4Benchmark(bin: string, scratch: string): Record<string, number> | null {
  const localCorpus = process.env.X4_REFERENCE_ROOT?.trim()
    || 'G:\\F-rescue-2026-09-26\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00';
  if (!fs.existsSync(localCorpus)) return null;

  const cacheFile = path.join(scratch, 'bench-corpus-cache.json');
  const t0 = performance.now();
  const cold = runX4Forge(bin, ['scan-corpus', localCorpus, '--cache', cacheFile, '--summary-only']);
  const rustCorpusColdMs = Math.round(performance.now() - t0);
  assert.equal(cold.status, 0, `scan-corpus cold failed: ${cold.stderr}`);

  const t1 = performance.now();
  const warm = runX4Forge(bin, ['scan-corpus', localCorpus, '--cache', cacheFile, '--summary-only']);
  const rustCorpusWarmMs = Math.round(performance.now() - t1);
  assert.equal(warm.status, 0);

  const t2 = performance.now();
  getReferenceCorpus(localCorpus, true);
  const tsCorpusColdMs = Math.round(performance.now() - t2);

  // Tree hash comparison on real X4 9.00 `md/` + realistic 64 MiB mod payload (#97-scale)
  const mdDir = path.join(localCorpus, 'md');
  const t3 = performance.now();
  withDisableRust(false, () => buildArtifactPlan({ sourceRoot: mdDir }));
  const rustMdTreePlanMs = Math.round(performance.now() - t3);

  const t4 = performance.now();
  withDisableRust(true, () => buildArtifactPlan({ sourceRoot: mdDir }));
  const tsMdTreePlanMs = Math.round(performance.now() - t4);

  const benchDir64 = path.join(scratch, 'bench-64mb');
  fs.mkdirSync(benchDir64, { recursive: true });
  const chunk = Buffer.alloc(1024 * 1024, 0x37);
  for (let i = 0; i < 64; i++) {
    chunk.writeUInt32LE(i, 0);
    fs.writeFileSync(path.join(benchDir64, `payload_${String(i).padStart(3, '0')}.dat`), chunk);
  }
  const t5 = performance.now();
  withDisableRust(false, () => buildArtifactPlan({ sourceRoot: benchDir64 }));
  const rust64MbPlanMs = Math.round(performance.now() - t5);

  const t6 = performance.now();
  withDisableRust(true, () => buildArtifactPlan({ sourceRoot: benchDir64 }));
  const ts64MbPlanMs = Math.round(performance.now() - t6);

  const benchValMod = path.join(scratch, 'clean-mod');
  const tVal = performance.now();
  const valBench = runX4Forge(bin, ['validate', benchValMod, '--unpacked', localCorpus, '--cache', cacheFile, '--json']);
  const rustValidateWarmMs = Math.round(performance.now() - tVal);
  assert.equal(valBench.status, 0, `validate against X4 9.00 corpus failed: ${valBench.stdout} ${valBench.stderr}`);

  return {
    rustCorpusColdMs,
    rustCorpusWarmMs,
    tsCorpusColdMs,
    rustValidateWarmMs,
    rustMdTreePlanMs,
    tsMdTreePlanMs,
    rust64MbPlanMs,
    ts64MbPlanMs,
  };
}

function main(): void {
  const bin = withDisableRust(false, () => resolveRustX4ForgeBin());
  assert(bin, 'Expected built x4forge release binary via resolveRustX4ForgeBin()');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-slice1-'));
  try {
    verifyCheckA(bin, scratch);
    verifyCheckB(bin, scratch);
    verifyCheckC(bin, scratch);
    const bench = maybeRunLocalX4Benchmark(bin, scratch);
    console.log(JSON.stringify({
      ok: true,
      bin,
      checks: ['tree_hash_parity', 'cat_dat_roundtrip', 'validator_24_defects_rules_fix'],
      ...(bench ? { bench } : {}),
    }, null, 2));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
