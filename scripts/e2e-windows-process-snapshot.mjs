import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { endianness } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROCESS_INFORMATION = 5;
const BUFFER_TOO_SHORT = 0xc0000004;
const MAX_TABLE_BYTES = 32 * 1024 * 1024;
const MAX_TABLE_ROWS = 100_000;
// Prefix of the x64 SYSTEM_PROCESS_INFORMATION layout through the parent's ID.
const PROCESS_PREFIX_BYTES = 96;
const CREATE_TIME_OFFSET = 32;
const PID_OFFSET = 80;
const PARENT_PID_OFFSET = 88;
const WINDOWS_EPOCH_MILLISECONDS = 11644473600000n;
const CSV_HEADER = 'Node,CreationDate,ParentProcessId,ProcessId';

function readProcessRows(bytes, length) {
  assert(Number.isInteger(length) && length >= PROCESS_PREFIX_BYTES && length <= bytes.length);
  const rows = [];
  const seen = new Set();
  for (let offset = 0; ; ) {
    assert(offset % 8 === 0 && offset + PROCESS_PREFIX_BYTES <= length);
    const next = bytes.readUInt32LE(offset);
    const pid = Number(bytes.readBigUInt64LE(offset + PID_OFFSET));
    const parentPid = Number(bytes.readBigUInt64LE(offset + PARENT_PID_OFFSET));
    assert(pid <= 0xffffffff && parentPid <= 0xffffffff);
    assert(!seen.has(pid) && seen.size < MAX_TABLE_ROWS);
    seen.add(pid);
    if (pid !== 0) {
      const creation = bytes.readBigInt64LE(offset + CREATE_TIME_OFFSET);
      assert(creation > 0n);
      rows.push({ pid, parentPid, creation });
    }
    if (next === 0) break;
    assert(next >= PROCESS_PREFIX_BYTES);
    offset += next;
  }
  return rows;
}

function formatCreationTime(ticks) {
  const date = new Date(Number(ticks / 10000n - WINDOWS_EPOCH_MILLISECONDS));
  const year = date.getFullYear();
  const offset = -date.getTimezoneOffset();
  assert(year >= 1 && year <= 9999 && Number.isInteger(offset) && Math.abs(offset) <= 999);
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const calendar = pad(year, 4) + pad(date.getMonth() + 1) + pad(date.getDate())
    + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  // Use Date for the local calendar and date-specific offset. Keep the native
  // ticks for all six DMTF fractional digits.
  return calendar + '.' + pad((ticks / 10n) % 1000000n, 6)
    + (offset < 0 ? '-' : '+') + pad(Math.abs(offset), 3);
}

function requireCurrentIdentity(rows, pid, parentPid, creation) {
  const current = rows.find(row => row.pid === pid);
  assert(current && current.parentPid === parentPid && current.creation === creation);
}

function queryProcessRows(query) {
  let size = 1024 * 1024;
  while (size <= MAX_TABLE_BYTES) {
    const buffer = Buffer.alloc(size);
    const length = Buffer.alloc(4);
    const status = query(PROCESS_INFORMATION, buffer, size, length) >>> 0;
    if (status === 0) return readProcessRows(buffer, length.readUInt32LE(0));
    assert.equal(status, BUFFER_TOO_SHORT);
    size = Math.max(size * 2, length.readUInt32LE(0));
  }
  throw new Error('Native process table exceeds bounds');
}

function collectSnapshot() {
  assert(process.platform === 'win32' && process.arch === 'x64' && endianness() === 'LE');
  const require = createRequire(import.meta.url);
  const koffi = require('../vscode-extension/node_modules/koffi/index.cjs');
  const ntdll = koffi.load('ntdll.dll');
  const kernel = koffi.load('kernel32.dll');
  const query = ntdll.func('__stdcall', 'NtQuerySystemInformation', 'int32_t',
    ['int32_t', 'void *', 'uint32_t', 'void *']);
  const current = kernel.func('__stdcall', 'GetCurrentProcess', 'void *', []);
  const times = kernel.func('__stdcall', 'GetProcessTimes', 'int',
    ['void *', 'void *', 'void *', 'void *', 'void *']);
  const creation = Buffer.alloc(8);
  assert(times(current(), creation, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)));
  const rows = queryProcessRows(query);
  // CreateTime is not exposed as a supported field in the public declaration.
  // Reject the whole table if the layout disagrees with a documented live handle.
  requireCurrentIdentity(rows, process.pid, process.ppid, creation.readBigInt64LE(0));
  return [CSV_HEADER, ...rows.map(row =>
    ['.', formatCreationTime(row.creation), row.parentPid, row.pid].join(','))].join('\n');
}

export function runWindowsProcessSnapshotSelftest() {
  const ticks = ms => (BigInt(ms) + WINDOWS_EPOCH_MILLISECONDS) * 10000n + 4567n;
  const birth = ticks(Date.UTC(2026, 10, 19, 13, 15, 14, 123));
  const fixture = Buffer.alloc(2 * PROCESS_PREFIX_BYTES);
  fixture.writeUInt32LE(PROCESS_PREFIX_BYTES, 0);
  fixture.writeBigInt64LE(birth, PROCESS_PREFIX_BYTES + CREATE_TIME_OFFSET);
  fixture.writeBigUInt64LE(42n, PROCESS_PREFIX_BYTES + PID_OFFSET);
  fixture.writeBigUInt64LE(13n, PROCESS_PREFIX_BYTES + PARENT_PID_OFFSET);
  const rows = readProcessRows(fixture, fixture.length);
  assert.deepEqual(rows, [{ pid: 42, parentPid: 13, creation: birth }]);
  requireCurrentIdentity(rows, 42, 13, birth);
  assert.throws(() => requireCurrentIdentity(rows, 42, 13, birth + 1n));
  assert.throws(() => requireCurrentIdentity(rows, 42, 14, birth));
  assert.throws(() => requireCurrentIdentity(rows, 43, 13, birth));
  assert.throws(() => readProcessRows(fixture, fixture.length + 1));
  assert.throws(() => readProcessRows(fixture, fixture.length - 1));

  const withField = (value, write) => {
    const invalid = Buffer.from(fixture);
    write(invalid, value);
    return invalid;
  };
  const shortStep = withField(8, (bytes, value) => bytes.writeUInt32LE(value, 0));
  const misaligned = withField(99, (bytes, value) => bytes.writeUInt32LE(value, 0));
  const duplicate = withField(42n, (bytes, value) => {
    bytes.writeBigUInt64LE(value, PID_OFFSET);
    bytes.writeBigInt64LE(birth, CREATE_TIME_OFFSET);
  });
  const zeroBirth = withField(0n, (bytes, value) => bytes.writeBigInt64LE(value, PROCESS_PREFIX_BYTES + CREATE_TIME_OFFSET));
  for (const invalid of [shortStep, misaligned, duplicate, zeroBirth]) {
    assert.throws(() => readProcessRows(invalid, invalid.length));
  }

  let queries = 0;
  const retried = queryProcessRows((type, bytes, size, length) => {
    assert.equal(type, PROCESS_INFORMATION);
    if (++queries === 1) {
      length.writeUInt32LE(size + 1);
      return BUFFER_TOO_SHORT;
    }
    fixture.copy(bytes);
    length.writeUInt32LE(fixture.length);
    return 0;
  });
  assert.equal(queries, 2);
  assert.deepEqual(retried, rows);
  assert.throws(() => queryProcessRows((_type, _bytes, _size, length) => {
    length.writeUInt32LE(MAX_TABLE_BYTES + 1);
    return BUFFER_TOO_SHORT;
  }));

  // Check round trips, including adjacent dates across the US March offset
  // transition on a host or test process configured for that timezone.
  for (const ms of [
    Date.UTC(2026, 2, 8, 6, 59, 59, 123), Date.UTC(2026, 2, 8, 7, 0, 0, 123),
    Date.UTC(2026, 6, 1, 12, 0, 0, 123), Date.UTC(2026, 11, 1, 12, 0, 0, 123),
  ]) {
    const text = formatCreationTime(ticks(ms));
    assert.match(text, /^\d{14}\.123456[+-]\d{3}$/);
    const utc = Date.UTC(+text.slice(0, 4), +text.slice(4, 6) - 1, +text.slice(6, 8),
      +text.slice(8, 10), +text.slice(10, 12), +text.slice(12, 14), 123)
      - Number(text.slice(21)) * 60000;
    assert.equal(utc, ms);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2);
    process.stdout.write(collectSnapshot());
  } catch {
    process.stderr.write('Native Windows process snapshot unavailable\n');
    process.exitCode = 1;
  }
}
