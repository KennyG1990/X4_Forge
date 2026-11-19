import fs from 'node:fs';
import path from 'node:path';
import { sameArtifactStamp } from '../lib/artifactPipeline';
import {
  LITERAL_TEXT_MAX_FILE_BYTES,
  LITERAL_TEXT_MAX_FILES,
  LITERAL_TEXT_MAX_TOTAL_BYTES,
  literalTextFilenameLanguage,
} from '../lib/literalTextLookup';

type LiteralReferenceInput = {
  files: { path: string; content: string }[];
  complete: boolean;
};

const MAX_DIRECTORY_ENTRIES = 4096;
const MAX_DLC_DIRECTORIES = 64;
const OFFICIAL_DLC = /^ego_dlc_[a-z0-9_-]+$/i;
const NO_FOLLOW = process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const PRESERVING_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function physicalPath(file: string): boolean {
  return path.relative(file, fs.realpathSync.native(file)) === '';
}

function listDirectory(directory: string, allowed: number): fs.Dirent[] {
  const entries: fs.Dirent[] = [];
  const open = fs.opendirSync(directory);
  try {
    for (let entry = open.readSync(); entry; entry = open.readSync()) {
      if (entries.length >= allowed) throw new Error('Text source directory limit exceeded.');
      entries.push(entry);
    }
  } finally {
    open.closeSync();
  }
  return entries;
}

function readTextFile(file: string, before: fs.BigIntStats): string {
  const handle = fs.openSync(file, fs.constants.O_RDONLY | NO_FOLLOW);
  try {
    if (!sameArtifactStamp(before, fs.fstatSync(handle, { bigint: true }))) {
      throw new Error('Text source changed before reading.');
    }
    const bytes = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error('Text source ended during reading.');
      offset += count;
    }
    if (!sameArtifactStamp(before, fs.fstatSync(handle, { bigint: true }))) {
      throw new Error('Text source changed during reading.');
    }
    return PRESERVING_UTF8_DECODER.decode(bytes);
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Only read loose text definitions at the configured unpacked corpus.
 * A filename can exclude a valid, different explicit language. The resolver
 * checks unsuffixed or invalid candidates and the language root.
 */
export function readLiteralReferenceTexts(rootInput: string, language: number): LiteralReferenceInput {
  if (!path.isAbsolute(rootInput) || !Number.isInteger(language) || language < 1 || language > 999) {
    return { files: [], complete: false };
  }
  const root = path.resolve(rootInput);
  const observed = new Map<string, fs.BigIntStats | undefined>();
  let remainingEntries = MAX_DIRECTORY_ENTRIES;
  const observeDirectory = (directory: string, required = false): boolean => {
    const before = fs.lstatSync(directory, { bigint: true, throwIfNoEntry: false });
    if (before ? !before.isDirectory() || !physicalPath(directory) : required) {
      throw new Error('Text source directory is unavailable or aliased.');
    }
    observed.set(directory, before);
    return before !== undefined;
  };
  const list = (directory: string, required = false): fs.Dirent[] => {
    if (!observeDirectory(directory, required)) return [];
    const entries = listDirectory(directory, remainingEntries);
    remainingEntries -= entries.length;
    return entries;
  };

  try {
    observeDirectory(root, true);
    const candidates = new Map<string, string>();
    const collect = (parent: string, required = false) => {
      const folder = path.join(root, parent, 't');
      for (const entry of list(folder, required)) {
        if (!/\.xml$/i.test(entry.name)) continue;
        const filenameLanguage = literalTextFilenameLanguage(entry.name);
        if (filenameLanguage && filenameLanguage !== language) continue;
        const relative = parent ? `${parent}/t/${entry.name}` : `t/${entry.name}`;
        const key = relative.toLowerCase();
        // eslint-disable-next-line no-control-regex -- Reject control characters before exposing source paths.
        if (/[\\:\x00-\x1f\x7f]/.test(entry.name) || relative.length > 512
          || candidates.has(key) || candidates.size >= LITERAL_TEXT_MAX_FILES) {
          throw new Error('Text source inventory is outside the read bounds.');
        }
        candidates.set(key, relative);
      }
    };

    collect('', true);
    const extensions = path.join(root, 'extensions');
    const dlcs = list(extensions).filter(entry => OFFICIAL_DLC.test(entry.name));
    if (dlcs.length > MAX_DLC_DIRECTORIES) throw new Error('Text source DLC limit exceeded.');
    for (const entry of dlcs) {
      observeDirectory(path.join(extensions, entry.name), true);
      collect(`extensions/${entry.name}`);
    }

    const files: LiteralReferenceInput['files'] = [];
    let remainingBytes = BigInt(LITERAL_TEXT_MAX_TOTAL_BYTES);
    for (const relative of [...candidates.values()].sort()) {
      const file = path.join(root, ...relative.split('/'));
      const before = fs.lstatSync(file, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n || !physicalPath(file)
        || before.size > BigInt(LITERAL_TEXT_MAX_FILE_BYTES) || before.size > remainingBytes) {
        throw new Error('Text source is unreadable, aliased, or oversized.');
      }
      remainingBytes -= before.size;
      files.push({ path: relative, content: readTextFile(file, before) });
      observed.set(file, before);
    }

    for (const [file, before] of observed) {
      const after = fs.lstatSync(file, { bigint: true, throwIfNoEntry: false });
      if (before ? !after || !sameArtifactStamp(before, after) || !physicalPath(file) : after) {
        throw new Error('Text source inventory changed during lookup.');
      }
    }
    return { files, complete: true };
  } catch {
    return { files: [], complete: false };
  }
}
