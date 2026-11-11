import { createHash } from 'node:crypto';
import type { ProjectFile } from '../lib/extensionProject';
import { PROJECT_CHECK_MAX_PARALLEL } from './sharedSourceCoordinator';

export const PROJECT_CHECKS_PATH = 'forge.checks.json';
export const PROJECT_CHECKS_MAX_BYTES = 256 * 1024;

export function decodeProjectCheckManifest(bytes: Buffer): string | undefined {
  if (bytes.length > PROJECT_CHECKS_MAX_BYTES) return undefined;
  const decoded = bytes.toString('utf8');
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : undefined;
}

interface ProposedCheck {
  id: string;
  script: string;
  args: string[];
  dependencies: string[];
  covers: string[];
  timeoutSeconds: number;
}

export type ProjectCheckInspection =
  | { status: 'invalid'; execution: 'not-run'; error: string }
  | { status: 'proposed'; execution: 'not-run'; manifestHash: string; checks: ProposedCheck[]; maxParallelChecks?: number };

function fields(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error(`${label} has an invalid or unknown field.`);
  }
  return value as Record<string, unknown>;
}

function literal(value: unknown, max: number): value is string {
  // eslint-disable-next-line no-control-regex -- Reject C0 and DEL in bounded project-check literals.
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isProjectCheckRelativeFile(value: unknown): value is string {
  return literal(value, 512) && !/[\\:<>|"*?]/.test(value)
    && value.split('/').every(part => !!part && !/[ .]$/.test(part)
      && !/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
}

function strings(
  value: unknown, maxItems: number, valid: (item: unknown) => item is string, label: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || !value.every(valid)) {
    throw new Error(`${label} is invalid or exceeds its limit.`);
  }
  return value;
}

function fileList(value: unknown, limit: number, label: string): string[] {
  const paths = strings(value, limit, isProjectCheckRelativeFile, label);
  if (new Set(paths.map(file => file.toLowerCase())).size !== paths.length) {
    throw new Error(`${label} contains duplicate or case-colliding paths.`);
  }
  return paths;
}

export function inspectProjectCheckProposal(files: ProjectFile[]): ProjectCheckInspection | undefined {
  const manifests = files.filter(file => file.path.toLowerCase() === PROJECT_CHECKS_PATH);
  if (!manifests.length) return undefined;
  const raw = manifests[0].content;
  try {
    if (manifests.length !== 1 || typeof raw !== 'string' || Buffer.byteLength(raw) > PROJECT_CHECKS_MAX_BYTES) {
      throw new Error('Expected one readable root forge.checks.json within the 256 KiB limit.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '')); }
    catch { throw new Error('forge.checks.json is not valid JSON.'); }
    const config = fields(parsed, ['version', 'checks', 'maxParallelChecks'], PROJECT_CHECKS_PATH);
    if (config.version !== 1 || !Array.isArray(config.checks) || config.checks.length < 1 || config.checks.length > 32) {
      throw new Error('forge.checks.json requires version 1 and between 1 and 32 checks.');
    }
    const budget = config.maxParallelChecks;
    if (Object.hasOwn(config, 'maxParallelChecks') && (typeof budget !== 'number' || !Number.isInteger(budget)
      || budget < 1 || budget > PROJECT_CHECK_MAX_PARALLEL)) {
      throw new Error(`maxParallelChecks must be an integer from 1 to ${PROJECT_CHECK_MAX_PARALLEL}.`);
    }
    const ids = new Set<string>();
    const checks = config.checks.map((value: unknown, index: number): ProposedCheck => {
      const label = `checks[${index}]`;
      const { id, script, args, dependencies, covers, timeoutSeconds = 60 } = fields(value,
        ['id', 'script', 'args', 'dependencies', 'covers', 'timeoutSeconds'], label);
      if (typeof id !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(id) || ids.has(id)) {
        throw new Error(`${label}.id must be unique and use a lowercase check identifier.`);
      }
      if (!isProjectCheckRelativeFile(script) || !/\.py$/i.test(script)) {
        throw new Error(`${label}.script must be a relative Python file path.`);
      }
      if (typeof timeoutSeconds !== 'number' || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) {
        throw new Error(`${label}.timeoutSeconds must be an integer from 1 to 300.`);
      }
      ids.add(id);
      return {
        id, script, timeoutSeconds,
        args: strings(args, 64, (item): item is string => literal(item, 1024), `${label}.args`),
        dependencies: fileList(dependencies, 128, `${label}.dependencies`),
        covers: fileList(covers, 512, `${label}.covers`),
      };
    });
    return { status: 'proposed', execution: 'not-run', manifestHash: createHash('sha256').update(raw).digest('hex'), checks,
      ...(budget === undefined ? {} : { maxParallelChecks: budget as number }) };
  } catch (error) {
    return { status: 'invalid', execution: 'not-run', error: (error as Error).message };
  }
}
