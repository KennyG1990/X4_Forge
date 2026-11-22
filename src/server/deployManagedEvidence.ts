import type { AgentHistoryStore } from '../lib/agentHistoryStore';
import { DEPLOY_FORMATS, type DeployFormat } from '../lib/deployFormat';

export const DEPLOY_MANAGED_MAX_MANIFEST_BYTES = 512 * 1024;
export const DEPLOY_MANAGED_MAX_FILES = 4_096;
export const DEPLOY_MANAGED_MAX_BYTES = 128 * 1024 * 1024;

const REFERENCE_PREFIX = 'deploy-managed-v1:';
const UNAVAILABLE_REFERENCE = `${REFERENCE_PREFIX}unavailable`;
const SHA256 = /^[a-f0-9]{64}$/;
const WINDOWS_DEVICE = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|CLOCK\$|COM[0-9¹²³]|LPT[0-9¹²³])$/iu;

export interface DeployManagedFile {
  path: string;
  size: number;
  sha256: string;
}

export type DeployManagedEvidence =
  | { status: 'legacy' }
  | { status: 'unavailable' }
  | { status: 'available'; format: DeployFormat; files: readonly DeployManagedFile[] };

function isDeployFormat(value: unknown): value is DeployFormat {
  return DEPLOY_FORMATS.some(format => format === value);
}

function isPortablePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > 1_024
    || /[\\:"<>|?*\p{Cc}\p{Cs}]/u.test(value)) return false;

  const parts = value.split('/');
  return parts.length <= 64 && parts.every(part => part.length > 0 && part.length <= 255
    && !/[ .]$/.test(part) && !WINDOWS_DEVICE.test(part.split('.', 1)[0].trimEnd()));
}

function normalizeFiles(files: readonly DeployManagedFile[]): DeployManagedFile[] | undefined {
  if (!Array.isArray(files) || !files.length || files.length > DEPLOY_MANAGED_MAX_FILES) return;

  const records: DeployManagedFile[] = [];
  const filePaths = new Set<string>();
  let remainingBytes = DEPLOY_MANAGED_MAX_BYTES;
  for (const file of files) {
    if (!file || !isPortablePath(file.path) || !Number.isSafeInteger(file.size)
      || file.size < 0 || file.size > remainingBytes || typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) return;

    // Apply the case-collision check on every host so the same evidence is portable.
    const key = file.path.toUpperCase();
    if (filePaths.has(key)) return;
    filePaths.add(key);
    remainingBytes -= file.size;
    records.push({ path: file.path, size: file.size, sha256: file.sha256 });
  }

  for (const filename of filePaths) {
    for (let index = filename.lastIndexOf('/'); index !== -1; index = filename.lastIndexOf('/', index - 1)) {
      if (filePaths.has(filename.slice(0, index))) return;
    }
  }
  return records.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function encodeManifest(format: DeployFormat, files: readonly DeployManagedFile[]): Buffer {
  return Buffer.from(JSON.stringify({
    version: 1,
    format,
    files: files.map(({ path, size, sha256 }) => [path, size, sha256]),
  }), 'utf8');
}

/** Persist digests of verified physical outputs with the existing immutable blob writer. */
export function storeDeployManagedEvidence(
  history: Pick<AgentHistoryStore, 'putVerifiedDeployEffect'>,
  format: DeployFormat,
  files: readonly DeployManagedFile[],
): string {
  const normalized = normalizeFiles(files);
  if (!isDeployFormat(format) || !normalized) return UNAVAILABLE_REFERENCE;
  const bytes = encodeManifest(format, normalized);
  if (bytes.length > DEPLOY_MANAGED_MAX_MANIFEST_BYTES) return UNAVAILABLE_REFERENCE;
  const hash = history.putVerifiedDeployEffect(bytes);
  return hash && SHA256.test(hash) ? REFERENCE_PREFIX + hash : UNAVAILABLE_REFERENCE;
}

/** Decode only canonical, bounded evidence named by a committed receipt. */
export function readDeployManagedEvidence(
  history: Pick<AgentHistoryStore, 'readVerifiedDeployEffect'>,
  reference: unknown,
): DeployManagedEvidence {
  if (reference === undefined || (typeof reference === 'string' && !reference.startsWith(REFERENCE_PREFIX))) {
    return { status: 'legacy' };
  }
  if (typeof reference === 'string') {
    const hash = reference.slice(REFERENCE_PREFIX.length);
    const bytes = SHA256.test(hash) ? history.readVerifiedDeployEffect(hash) : null;
    if (bytes && bytes.length <= DEPLOY_MANAGED_MAX_MANIFEST_BYTES) {
      try {
        const decoded = JSON.parse(bytes.toString('utf8')) as { version?: unknown; format?: unknown; files?: unknown };
        if (decoded?.version === 1 && isDeployFormat(decoded.format) && Array.isArray(decoded.files)
          && decoded.files.length <= DEPLOY_MANAGED_MAX_FILES
          && decoded.files.every(row => Array.isArray(row) && row.length === 3)) {
          const files = normalizeFiles(decoded.files.map(([path, size, sha256]) => ({ path, size, sha256 })));
          if (files && encodeManifest(decoded.format, files).equals(bytes)) {
            return { status: 'available', format: decoded.format, files };
          }
        }
      } catch {
        // Corrupt or noncanonical evidence cannot verify the current target.
      }
    }
  }
  return { status: 'unavailable' };
}
