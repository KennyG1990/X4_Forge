import { createHash } from 'node:crypto';
import type { ProjectFileKind } from './projectFileKind';

export interface ValidationProjectFileInput {
  path: string;
  content?: string;
}

function normalizePath(value: string | undefined): string {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** Hash the exact validation subject independently of array order or Windows path spelling. */
export function validationProjectContentHash(files: ValidationProjectFileInput[]): string {
  const rows = files.map(file => ({
    path: normalizePath(file.path),
    contentHash: sha256(String(file.content || '')),
  })).sort((left, right) => left.path.localeCompare(right.path) || left.contentHash.localeCompare(right.contentHash));
  return sha256(JSON.stringify(rows));
}

/** Bind presence and declared kind as well as exact inspected source. */
export function validationSubjectSourceHash(files: readonly (ValidationProjectFileInput & { kind: ProjectFileKind })[]): string {
  return validationProjectContentHash(files.map(file => ({
    path: file.path,
    content: JSON.stringify([file.kind, typeof file.content === 'string', file.content ?? null]),
  })));
}
