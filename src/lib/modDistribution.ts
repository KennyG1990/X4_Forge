/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mod distribution engine (B9, 2026-07-10) — the "I shipped a mod" endpoint of the user
 * timeline. Takes a compiled, ZERO-ERROR file manifest and produces a Nexus-ready release:
 * a `<modId>/`-rooted zip (extract-into-extensions layout), a surgically version-bumped
 * content.xml (byte-fidelity preserved everywhere else), and a player-facing install
 * README inside the mod folder.
 *
 * ZERO dependencies: Node's zlib provides DEFLATE (the compression inside every zip);
 * this module supplies the ZIP container (local headers + central directory + EOCD) and
 * CRC-32. Mods are small; no zip64 needed. The container is oracle-checked structurally
 * and the live route's artifact is verified by a real extractor (PowerShell Expand-Archive)
 * in the validation step.
 *
 * RELEASE GATE: `buildReleasePlan` refuses to plan a package for a manifest with ANY
 * error-severity diagnostic. The Forge never helps a modder ship a red build.
 */

import * as zlib from 'zlib';

/* ------------------------------------------------------------------ *
 * CRC-32 (IEEE 802.3, the zip flavor)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ *
 * Minimal ZIP writer (method 8 = deflate; DOS timestamps; no zip64)
 * ------------------------------------------------------------------ */

export interface ZipEntry {
  /** forward-slash relative path inside the zip */
  path: string;
  data: Buffer;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const { time, date } = dosDateTime();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.path.replace(/\\/g, '/').replace(/^\/+/, ''), 'utf8');
    const crc = crc32(e.data);
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    // store wins when deflate would grow tiny files
    const useDeflate = deflated.length < e.data.length;
    const payload = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);      // local file header signature
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18); // compressed size
    local.writeUInt32LE(e.data.length, 22);  // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);              // extra length
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);    // central directory signature
    central.writeUInt16LE(20, 4);            // version made by
    central.writeUInt16LE(20, 6);            // version needed
    central.writeUInt16LE(0x0800, 8);        // flags: UTF-8 names
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra/comment/disk/attrs all zero
    central.writeUInt32LE(offset, 42);       // local header offset
    centralParts.push(central, name);

    offset += 30 + name.length + payload.length;
  }

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);         // end of central directory signature
  eocd.writeUInt16LE(entries.length, 8);     // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);    // entries total
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);            // central directory offset
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/* ------------------------------------------------------------------ *
 * Release planning
 * ------------------------------------------------------------------ */

/** X4 content.xml versions are integers ("100" = v1.00). Semver-ish strings get real
 * bumps; unrecognized formats are left alone (never corrupt what we don't understand). */
export function bumpVersion(version: string, kind: 'none' | 'patch' | 'minor'): { version: string; changed: boolean } {
  const v = String(version || '').trim();
  if (kind === 'none' || !v) return { version: v, changed: false };
  if (/^\d+$/.test(v)) {
    const n = parseInt(v, 10) + (kind === 'minor' ? 10 : 1); // X4 convention: 100=1.00 → minor=+10, patch=+1
    return { version: String(n), changed: true };
  }
  const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (m) {
    const [maj, min, pat] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10)];
    return {
      version: kind === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`,
      changed: true,
    };
  }
  return { version: v, changed: false };
}

/** Surgical version edit: touch ONLY the version attribute of the <content …> element;
 * every other byte of a fidelity-preserved content.xml stays identical. */
export function setContentVersion(contentXml: string, newVersion: string): string {
  return String(contentXml || '').replace(
    /(<content\b[^>]*?\bversion\s*=\s*")[^"]*(")/,
    `$1${newVersion}$2`,
  );
}

export function buildPlayerReadme(meta: { modId: string; name?: string; version: string; author?: string; description?: string }): string {
  return [
    `# ${meta.name || meta.modId} — v${meta.version}`,
    meta.author ? `by ${meta.author}` : '',
    '',
    meta.description || '',
    '',
    '## Install',
    '1. Extract this zip into your X4 installation\'s `extensions/` folder',
    `   (result: \`X4 Foundations/extensions/${meta.modId}/content.xml\`).`,
    '2. Launch X4 and enable the extension in Settings → Extensions if it is not on already.',
    '3. Existing saves: the mod activates on load. To remove it later, disable it in-game first,',
    '   save, then delete the folder.',
    '',
    `Built with X4 Forge.`,
    '',
  ].filter(l => l !== null).join('\n');
}

export interface ReleasePlan {
  ok: boolean;
  blocking?: Array<{ severity: string; message?: string; code?: string }>;
  modId?: string;
  version?: string;
  zipName?: string;
  entries?: ZipEntry[];
  readme?: string;
  warnings?: number;
}

/**
 * Plan a release from a compiled manifest + its diagnostics. GATE: any error-severity
 * diagnostic blocks the plan. Layout: everything under `<modId>/` so "extract into
 * extensions/" is the whole install; README_INSTALL.md rides inside the mod folder.
 */
export function buildReleasePlan(input: {
  modId: string;
  files: Record<string, string>;
  diagnostics: Array<{ severity?: string; message?: string; code?: string }>;
  bump?: 'none' | 'patch' | 'minor';
  meta?: { name?: string; author?: string; description?: string };
}): ReleasePlan {
  const errors = (input.diagnostics || []).filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { ok: false, blocking: errors.map(d => ({ severity: 'error', message: d.message, code: d.code })) };
  }
  const modId = String(input.modId || 'mod').replace(/[^\w.-]+/g, '_');

  const contentXml = input.files['content.xml'] || '';
  const currentVersion = contentXml.match(/<content\b[^>]*?\bversion\s*=\s*"([^"]*)"/)?.[1] || '';
  const bumped = bumpVersion(currentVersion, input.bump || 'none');
  const files = { ...input.files };
  if (bumped.changed && contentXml) files['content.xml'] = setContentVersion(contentXml, bumped.version);

  const version = bumped.version || currentVersion || '1';
  const readme = buildPlayerReadme({ modId, version, ...(input.meta || {}) });
  const entries: ZipEntry[] = [
    ...Object.entries(files)
      .filter(([rel]) => !rel.includes('..') && !rel.startsWith('.git'))
      .map(([rel, content]) => ({ path: `${modId}/${rel.replace(/\\/g, '/')}`, data: Buffer.from(String(content), 'utf8') })),
    { path: `${modId}/README_INSTALL.md`, data: Buffer.from(readme, 'utf8') },
  ];
  return {
    ok: true,
    modId,
    version,
    zipName: `${modId}_v${version.replace(/[^\w.-]+/g, '_')}.zip`,
    entries,
    readme,
    warnings: (input.diagnostics || []).filter(d => d.severity === 'warning').length,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runModDistributionSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  // CRC-32 known vector (the classic '123456789' → 0xCBF43926)
  ok('crc32_known_vector', crc32(Buffer.from('123456789')) === 0xcbf43926, crc32(Buffer.from('123456789')).toString(16));

  // zip container structure
  const zip = buildZip([
    { path: 'm/content.xml', data: Buffer.from('<content version="100"/>') },
    { path: 'm/md/a.xml', data: Buffer.from('<mdscript name="A"><cues/></mdscript>') },
  ]);
  ok('zip_local_header_sig', zip.readUInt32LE(0) === 0x04034b50);
  ok('zip_eocd_sig_and_count', zip.readUInt32LE(zip.length - 22) === 0x06054b50 && zip.readUInt16LE(zip.length - 12) === 2);
  const cdOffset = zip.readUInt32LE(zip.length - 6);
  ok('zip_central_dir_sig_at_offset', zip.readUInt32LE(cdOffset) === 0x02014b50, String(cdOffset));
  // deflate round-trip of the first entry equals the original bytes
  {
    const nameLen = zip.readUInt16LE(26);
    const method = zip.readUInt16LE(8);
    const compSize = zip.readUInt32LE(18);
    const payload = zip.subarray(30 + nameLen, 30 + nameLen + compSize);
    const restored = method === 8 ? zlib.inflateRawSync(payload) : Buffer.from(payload);
    ok('zip_first_entry_roundtrips', restored.toString() === '<content version="100"/>', `method=${method}`);
  }

  // version bumping — X4 integer convention + semver-ish + unknown-left-alone
  ok('bump_x4_integer_patch', bumpVersion('100', 'patch').version === '101');
  ok('bump_x4_integer_minor', bumpVersion('100', 'minor').version === '110');
  ok('bump_semver_patch', bumpVersion('1.2.3', 'patch').version === '1.2.4');
  ok('bump_semver_minor_resets_patch', bumpVersion('1.2.3', 'minor').version === '1.3.0');
  ok('bump_none_unchanged', bumpVersion('100', 'none').changed === false);
  ok('bump_unknown_format_left_alone', bumpVersion('v2-beta', 'patch').changed === false);

  // surgical content.xml edit — ONLY the content element's version changes
  const cx = '<?xml version="1.0" encoding="utf-8"?>\n<content id="m" name="M" version="100" save="false">\n  <text language="44" version="ignore-me"/>\n</content>';
  const edited = setContentVersion(cx, '101');
  ok('content_version_replaced', edited.includes('<content id="m" name="M" version="101"'));
  ok('xml_declaration_untouched', edited.startsWith('<?xml version="1.0"'));
  ok('other_version_attrs_untouched', edited.includes('version="ignore-me"'));

  // release gate — errors block, warnings pass through counted
  const blocked = buildReleasePlan({ modId: 'm', files: { 'content.xml': cx }, diagnostics: [{ severity: 'error', message: 'x' }] });
  ok('gate_blocks_on_error', blocked.ok === false && (blocked.blocking || []).length === 1);
  const plan = buildReleasePlan({
    modId: 'my mod!', files: { 'content.xml': cx, 'md/a.xml': '<mdscript/>' },
    diagnostics: [{ severity: 'warning' }], bump: 'patch', meta: { name: 'My Mod', author: 'Ken' },
  });
  ok('plan_ok_with_warnings_counted', plan.ok === true && plan.warnings === 1);
  ok('mod_id_sanitized', plan.modId === 'my_mod_');
  ok('version_bumped_in_plan', plan.version === '101' && plan.zipName === 'my_mod__v101.zip');
  ok('entries_rooted_under_modid', (plan.entries || []).every(e => e.path.startsWith('my_mod_/')));
  ok('readme_included_with_install_path', (plan.entries || []).some(e => e.path.endsWith('README_INSTALL.md'))
    && String(plan.readme).includes('extensions/') && String(plan.readme).includes('v101'));
  ok('bumped_version_written_into_manifest_copy',
    (plan.entries || []).some(e => e.path.endsWith('content.xml') && e.data.toString().includes('version="101"')));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
