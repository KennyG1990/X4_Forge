/** Harness-only preload. Never shipped or exposed through an HTTP route.
 * Blocks one exact scratch-file rename using owned stdin/stdout pipes, so the
 * parent can observe a real source operation after CAS and before promotion.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const nativeFailure = process.env.C06C_SQLITE_FAILURE;
if (nativeFailure) {
  if (!['missing', 'abi'].includes(nativeFailure)) throw new Error('Unknown C06c native failure.');
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'better-sqlite3') {
      throw Object.assign(new Error(nativeFailure === 'missing'
        ? "Cannot find module 'better-sqlite3' (C06c isolated dependency drill)"
        : 'better-sqlite3 native binding NODE_MODULE_VERSION mismatch (C06c isolated dependency drill)'),
      { code: nativeFailure === 'missing' ? 'MODULE_NOT_FOUND' : 'ERR_DLOPEN_FAILED' });
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}
if (process.env.C06C_BARRIER_TARGET) installBarrier();
else if (!nativeFailure) throw new Error('C06c preload requires an explicit owned test purpose.');

function installBarrier() {
const root = fs.realpathSync(process.env.C06C_BARRIER_ROOT || '');
const target = path.resolve(process.env.C06C_BARRIER_TARGET);
const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const actualParent = fs.realpathSync(path.dirname(target));
if (!normalized(actualParent).startsWith(normalized(root) + path.sep)) {
  throw new Error('C06c barrier target must be strictly inside the owned scratch root.');
}
const originalRename = fs.renameSync;
let sequence = 0;
fs.renameSync = function (from, to) {
  if (typeof to === 'string' && normalized(to) === normalized(target)) {
    fs.writeSync(1, 'C06C_BARRIER ' + JSON.stringify({ event: 'held-before-rename', pid: process.pid,
      sequence: ++sequence, target, temporary: String(from) }) + '\n');
    const command = Buffer.alloc(1);
    const bytes = fs.readSync(0, command, 0, 1, null);
    if (bytes !== 1 || command.toString() !== 'r') {
      throw Object.assign(new Error('C06c owned harness refused the scratch rename.'), { code: 'C06C_HARNESS_RENAME_REFUSED' });
    }
  }
  return originalRename.call(this, from, to);
};
}
