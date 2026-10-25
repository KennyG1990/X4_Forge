import assert from 'node:assert/strict';
import { parseModFolderImportRequest } from '../src/server/modFolderImportRequest';

const invalid: unknown[] = [null, false, 1, 'mod', [], {}, { folder: 'mod' }, { source: { path: 'mod' } },
  { path: ['mod'] }, { path: { value: 'mod' } }, { path: true }, { path: 3 }, { path: null },
  { path: '' }, { path: ' ' }, { path: 'x'.repeat(4097) }, { path: 'mod\u0000' }, { path: 'mod\n' },
  { path: '../mod' }, { path: 'nested/../mod' }, { path: '..\\mod' }, { path: '/mod' },
  { path: 'C:\\mod' }, { path: 'C:mod' }, { path: '\\\\server\\share' },
  { path: 'mod', root: [] }, { path: 'mod', root: null }, { path: 'mod', root: '' }, { path: 'mod', root: 'other' },
  { path: 'mod', modId: 'other' }, { path: 'mod', dryRun: true }, JSON.parse('{"path":"mod","__proto__":{}}')];
for (const input of invalid) {
  const parsed = parseModFolderImportRequest(input);
  assert.equal(parsed.ok, false, JSON.stringify(input));
  if (!parsed.ok) assert.equal(parsed.code, 'IMPORT_INPUT_INVALID');
}
const valid = [
  [{ path: 'mod' }, { path: 'mod' }],
  [{ path: ' nested/mod ', root: ' WORKSPACE ' }, { path: 'nested/mod', root: 'workspace' }],
  [{ path: 'mod', root: 'filesystem' }, { path: 'mod', root: 'filesystem' }],
  [{ path: '.' }, { path: '.' }],
  [{ path: 'nested\\mod' }, { path: 'nested\\mod' }],
];
for (const [input, expected] of valid) assert.deepEqual(parseModFolderImportRequest(input), { ok: true, value: expected });
console.log(JSON.stringify({ pass: true, assertions: invalid.length + valid.length }));
