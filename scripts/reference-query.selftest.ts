/** Full-record parity and indexed-page regression for the shared reference manifest. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendReferenceFiles, beginReferenceGeneration, openStudioDb, queryReferenceFiles,
  type DbReferenceFile, type StudioDb,
} from '../src/lib/db';

type Filters = Parameters<typeof queryReferenceFiles>[2];

// Frozen pre-repair SQL oracle: complete result, not a key-only projection.
function original(db: StudioDb, id: string, filters: Filters) {
  const generation = db.raw.prepare('SELECT seq FROM reference_generations WHERE id = ?').get(id);
  if (!generation) return { total: 0, files: [] };
  const clauses = ['f.generation_seq = ?'];
  const params: unknown[] = [generation.seq];
  for (const [column, value] of Object.entries({ extension: filters.extension, source: filters.source,
    domain: filters.domain, role: filters.role, authority: filters.authority, consumer: filters.consumer })) {
    if (value) { clauses.push(`c.${column} = ?`); params.push(value); }
  }
  if (filters.q) { clauses.push('f.rel_path LIKE ?'); params.push(`%${filters.q}%`); }
  const where = clauses.join(' AND ');
  const total = Number(db.raw.prepare(`SELECT COUNT(*) AS n FROM reference_files f
    JOIN reference_classes c ON c.class_id = f.class_id WHERE ${where}`).get(...params).n);
  const limit = Math.max(1, Math.min(Number.isFinite(filters.limit) ? Number(filters.limit) : 100, 500));
  const offset = Math.max(0, Math.min(Number.isFinite(filters.offset) ? Number(filters.offset) : 0, 5_000_000));
  const files = db.raw.prepare(`SELECT ? AS generation_id, f.rel_path, c.extension, c.source, c.domain, c.role,
    c.authority, c.consumer, NULLIF(c.schema_role, '') AS schema_role, f.bytes, f.mtime_ms, f.sha256
    FROM reference_files f JOIN reference_classes c ON c.class_id = f.class_id
    WHERE ${where} ORDER BY f.rel_path LIMIT ? OFFSET ?`).all(id, ...params, limit, offset);
  return { total, files };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4-reference-query-'));
const db = openStudioDb(tmp);
assert.ok(db, 'Native SQLite required; unavailable is not a passing query test');
let cases = 0;
try {
  for (const id of ['first', 'second']) {
    beginReferenceGeneration(db, { id, root_key: id, root: `fixture/${id}`, started_at: id });
    const rows: DbReferenceFile[] = Array.from({ length: 1400 }, (_, i) => ({
      generation_id: id, rel_path: `file/${String(1399 - i).padStart(4, '0')}_${i % 7 ? 'ordinary' : 'UPPER'}.xml`,
      extension: i % 3 ? '.xml' : '.xsd', source: i % 5 ? 'base' : 'ego_dlc_test',
      domain: i % 2 ? 'aiscripts' : 'libraries', role: i % 3 ? 'canonical-data' : 'grammar',
      authority: i % 7 ? 'canonical' : 'advisory', consumer: i % 2 ? 'reference-corpus' : 'schema-registry',
      schema_role: i % 3 ? '' : 'canonical-library', bytes: i + (id === 'first' ? 5 : 10000),
      mtime_ms: 1700000000000 + i / 4, sha256: i % 2 ? null : `hash-${id}-${i}`,
    }));
    appendReferenceFiles(db, rows);
  }
  // No foreign-key constraint exists: preserve the old INNER JOIN's orphan exclusion.
  db.raw.prepare(`INSERT INTO reference_files(generation_seq,rel_path,class_id,bytes,mtime_ms)
    SELECT seq,'orphan.xml',999999,1,1 FROM reference_generations WHERE id = ?`).run('first');
  const compare = (filters: Filters, id = 'first') => {
    assert.deepEqual(queryReferenceFiles(db, id, filters), original(db, id, filters), JSON.stringify({ id, filters }));
    cases++;
  };
  const fields: Filters = { extension: '.xml', source: 'base', domain: 'aiscripts',
    role: 'canonical-data', authority: 'canonical', consumer: 'reference-corpus' };
  const entries = Object.entries(fields);
  for (let bits = 0; bits < 64; bits++) {
    const selected = Object.fromEntries(entries.filter((_, i) => bits & (1 << i)));
    compare(selected);
    compare({ ...selected, q: 'UPPER', limit: 7, offset: 3 });
  }
  for (const key of Object.keys(fields)) compare({ [key]: "' OR 1=1 --" });
  for (const q of ['', '%', '_', 'upper', 'UPPER', 'ordinary', "' OR 1=1 --", 'orphan', 'no-such-file']) compare({ q });
  for (const limit of [-10, 0, 1, 7, 499, 500, 501, Infinity, NaN]) {
    for (const offset of [-10, 0, 3, 499, 500, 1390, 1400, 5_000_001, Infinity, NaN]) compare({ limit, offset });
  }
  for (const filters of [{ limit: 1.5 }, { offset: 1.5 }]) {
    assert.throws(() => original(db, 'first', filters), /datatype mismatch/);
    assert.throws(() => queryReferenceFiles(db, 'first', filters), /datatype mismatch/);
    cases++;
  }
  compare({ consumer: 'reference-corpus' }, 'second');
  compare({}, 'missing');
  assert.equal(queryReferenceFiles(db, 'first', {}).total, 1400);
  assert.equal(queryReferenceFiles(db, 'first', { q: 'orphan' }).total, 0);
  assert.notDeepEqual(queryReferenceFiles(db, 'first', {}).files, queryReferenceFiles(db, 'second', {}).files);
  const pages = [0, 500, 1000].flatMap(offset => queryReferenceFiles(db, 'first', { limit: 500, offset }).files);
  assert.equal(new Set(pages.map(row => row.rel_path)).size, 1400);
  assert.deepEqual(pages.map(row => row.rel_path), pages.map(row => row.rel_path).sort());
  assert.ok(pages.some(row => row.schema_role === null) && pages.some(row => row.schema_role === 'canonical-library'));
  const plans: Array<{ sql: string; details: string[] }> = [];
  const observed: StudioDb = { path: db.path, raw: { prepare(sql: string) {
    const statement = db.raw.prepare(sql);
    return {
      get(...params: unknown[]) {
        plans.push({ sql, details: db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((r: { detail: string }) => r.detail) });
        return statement.get(...params);
      },
      all(...params: unknown[]) {
        plans.push({ sql, details: db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((r: { detail: string }) => r.detail) });
        return statement.all(...params);
      },
    };
  } } };
  for (const filters of [{}, { consumer: 'reference-corpus' }, { q: '%' }]) {
    plans.length = 0;
    assert.deepEqual(queryReferenceFiles(observed, 'first', filters), original(db, 'first', filters));
    const count = plans.find(p => /COUNT\(\*\)/.test(p.sql));
    const page = plans.find(p => /AS generation_id/.test(p.sql));
    assert.ok(count?.details.some(line => /COVERING INDEX idx_reffile_gen_class.*generation_seq=\? AND class_id=\?/.test(line)),
      'count must seek matching classes through the existing covering index');
    assert.ok(page?.details.some(line => /COVERING INDEX idx_reffile_gen_class.*generation_seq=\? AND class_id=\?/.test(line)),
      'page selection must remain a covering-key read');
    assert.ok(page?.details.some(line => /PRIMARY KEY.*generation_seq=\? AND rel_path=\?/.test(line)),
      'full records must be point-read only after bounded key selection');
  }
  // No result cache: existing record edits become visible immediately.
  db.raw.prepare(`UPDATE reference_files SET bytes = 8675309 WHERE generation_seq =
    (SELECT seq FROM reference_generations WHERE id = ?) AND rel_path = ?`).run('first', pages[0].rel_path);
  assert.equal(queryReferenceFiles(db, 'first', { limit: 1 }).files[0].bytes, 8675309);
  compare({});
  console.log(`PASS reference query: ${cases} full-record parity cases, pagination, isolation, freshness, indexed count/key-page/point-read plans`);
} finally {
  db.raw.close();
  const resolved = fs.realpathSync(tmp);
  assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(resolved).startsWith('x4-reference-query-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
