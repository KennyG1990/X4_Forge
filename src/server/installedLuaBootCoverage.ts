import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readContentManifestIdentity } from '../lib/validationEvidence';
import { createLuaBootLogFold, LUA_BOOT_MANIFEST, readLuaBootManifest, summarizeLuaBootRun, type LuaBootRunState } from '../lib/luaBootCoverage';
import { createGameLogEvidenceReader, type GameLogDeployFence } from './gameLogLoadEvidence';
import { readInstalledExtensionRootFiles } from './installedExtensionRootFiles';

const bootReader = createGameLogEvidenceReader<LuaBootRunState>();

function pathKey(value: string): string {
  const absolute = path.resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

export function installedLuaBootCoverage({ extensionsRoot, target, modId, logPath, fence }: {
  extensionsRoot: string;
  target: string;
  modId: string;
  logPath: string;
  fence?: GameLogDeployFence;
}) {
  const expectedId = modId.toLowerCase();
  const folder = path.basename(target);
  if (!/^[a-z0-9_-][a-z0-9_.-]{0,127}$/i.test(expectedId) || !/^[a-z0-9_-][a-z0-9_.-]{0,127}$/i.test(folder)) return null;
  const subject = pathKey(target);
  const invalidate = () => {
    if (logPath) bootReader.invalidate(logPath, subject, fence);
  };
  const unavailable = (detail: string) => {
    invalidate();
    return { status: 'window-unavailable' as const, detail, missing: null };
  };

  try {
    if (!fs.lstatSync(extensionsRoot, { throwIfNoEntry: false })?.isDirectory()) return null;
    const root = fs.realpathSync.native(extensionsRoot);
    if (![pathKey(extensionsRoot), pathKey(root)].includes(pathKey(path.dirname(target)))) return null;
    const installed = path.join(root, folder);
    const directory = fs.lstatSync(installed, { throwIfNoEntry: false });
    if (!directory) { invalidate(); return null; }
    if (!directory.isDirectory() || pathKey(fs.realpathSync.native(installed)) !== pathKey(installed)) {
      return unavailable('The installed extension folder could not be verified.');
    }
    const manifests = readInstalledExtensionRootFiles(installed, [LUA_BOOT_MANIFEST, 'ui.xml', 'content.xml']);
    const manifest = manifests.get(LUA_BOOT_MANIFEST);
    if (manifest === undefined) { invalidate(); return null; }
    const content = manifests.get('content.xml');
    const owner = readContentManifestIdentity(content)?.modId.toLowerCase();
    if (!fs.lstatSync(path.join(installed, 'content.xml'), { throwIfNoEntry: false })?.isFile()
      || !owner || !/^[a-z0-9_-][a-z0-9_.-]{0,127}$/i.test(owner)
      || owner !== expectedId) {
      return unavailable('The installed extension identity does not match the boot subject.');
    }
    const uiXml = manifests.get('ui.xml') ?? '';
    const registration = readLuaBootManifest(manifest, uiXml);
    if (registration.status !== 'valid') { invalidate(); return { ...registration, missing: null }; }
    const fold = createLuaBootLogFold(owner, registration.files);
    if (!logPath) return summarizeLuaBootRun(registration, fold.initial());
    const revision = createHash('sha256').update(JSON.stringify([manifest, uiXml, content])).digest('hex');
    const scan = bootReader.read(logPath, subject, fold, fence, { revision, observationOnly: true });
    const run = scan.partialLinePending ? { ...scan.evidence, completed: false } : scan.evidence;
    return {
      ...summarizeLuaBootRun(registration, run),
      logScan: { bytesScanned: scan.bytesScanned, scannedFromByte: scan.from, recentTailStartByte: scan.tailStartByte },
    };
  } catch {
    return unavailable('Installed registration or the log window could not be read.');
  }
}
