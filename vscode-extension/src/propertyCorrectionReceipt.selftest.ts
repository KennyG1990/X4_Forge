import assert from 'node:assert/strict';
import type { Memento } from 'vscode';
import { assertValidActionReceipt } from '../../shared/actionReceipt';
import { createPropertyCorrectionJournal, type PropertyCorrectionReceiptInput } from './propertyCorrectionReceipt';

type MementoMethods = Pick<Memento, 'get' | 'update'>;
const workspaceId = 'ws_' + 'a'.repeat(24);
const beforeHash = 'b'.repeat(64);
const afterHash = 'c'.repeat(64);
const correctionHash = 'd'.repeat(64);
const vocabularyHash = 'e'.repeat(64);
const ruleHash = 'f'.repeat(64);
const sourceHash = '0'.repeat(64);
const input: PropertyCorrectionReceiptInput = {
  workspaceId, relativePath: 'md/example.xml', beforeHash, correctionHash, vocabularyHash, ruleHash,
};

class MemoryMemento implements MementoMethods {
  private cache: Map<string, unknown>;
  active = 0;
  maxActive = 0;
  failNextUpdate = false;

  constructor(private readonly durable = new Map<string, unknown>()) {
    this.cache = structuredClone(durable);
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.cache.get(key) as T | undefined) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.cache.set(key, structuredClone(value));
    this.maxActive = Math.max(this.maxActive, ++this.active);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        throw new Error('simulated persistence failure after optimistic cache update');
      }
      this.durable.set(key, structuredClone(value));
    } finally {
      this.active--;
    }
  }

  records() {
    const records = [...this.durable.values()];
    assert.equal(records.length, 1);
    return records[0] as Array<{
      receipt: unknown;
      uncertainty?: { code: string; observedBufferHash?: string; hash: string };
    }>;
  }

  restart() {
    return new MemoryMemento(this.durable);
  }
}

async function main() {
  const memory = new MemoryMemento();
  const journal = createPropertyCorrectionJournal(memory);
  const edit = await journal.prepare(input);
  const prepared = assertValidActionReceipt(memory.records()[0].receipt);
  assert.equal(edit.id, prepared.id);
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.authority.scope, 'workspace');
  assert.deepEqual(prepared.input, { requestHash: correctionHash, beforeHash });
  assert.deepEqual(prepared.rollback, { required: false, mode: 'none', status: 'not_required' });
  assert.equal(prepared.validation.ruleHash, ruleHash);
  assert.equal(prepared.metadata?.corpusHash, vocabularyHash);
  assert.equal(prepared.metadata?.mode, 'buffer-only');
  assert.match(String(prepared.metadata?.summary), /Undo/);

  await assert.rejects(edit.finish({ kind: 'applied', afterHash: beforeHash,
    project: { ok: true, complete: true, sourceHash } }), /has not changed/);
  assert.equal(assertValidActionReceipt(memory.records()[0].receipt).status, 'prepared');

  memory.failNextUpdate = true;
  const renderedEvidence = { kind: 'applied', afterHash, project: { ok: false, complete: false, sourceHash } } as const;
  await assert.rejects(edit.finish(renderedEvidence), /could not persist/);
  assert.equal(assertValidActionReceipt(memory.records()[0].receipt).status, 'prepared');
  await edit.finish(renderedEvidence);
  const applied = assertValidActionReceipt(memory.records()[0].receipt);
  assert.equal(applied.id, edit.id);
  assert.equal(applied.status, 'committed');
  assert.equal(applied.validation.code, 'PROPERTY_CORRECTION_TARGET_VERIFIED');
  assert.deepEqual(JSON.parse(applied.validation.summary!), {
    projectOk: false, projectComplete: false, projectSourceHash: sourceHash,
  });
  assert.deepEqual(applied.after?.resources, [{
    role: 'file', root: 'editor-buffer', relativePath: input.relativePath, hash: afterHash,
  }]);
  await assert.rejects(edit.finish({ kind: 'refused', code: 'STALE_BUFFER' }), /no longer prepared/);

  for (const bad of [
    { workspaceId: 'unbound' },
    { relativePath: '../example.xml' },
    { relativePath: 'C:/example.xml' },
    { vocabularyHash: 'wrong' },
    { correctionHash: 'wrong' },
  ]) await assert.rejects(journal.prepare({ ...input, ...bad }));
  assert.equal(memory.records().length, 1);

  const uncertain = await journal.prepare(input);
  await uncertain.finish({ kind: 'uncertain', code: 'APPLY_RESULT_UNKNOWN' });
  let pending = memory.records().at(-1)!;
  assert.equal(assertValidActionReceipt(pending.receipt).status, 'prepared');
  assert.equal(pending.uncertainty?.code, 'APPLY_RESULT_UNKNOWN');
  assert.equal(pending.uncertainty?.observedBufferHash, undefined);
  assert.equal(assertValidActionReceipt(pending.receipt).after, undefined);
  await uncertain.finish({ kind: 'uncertain', code: 'POSTCHECK_CHANGED', afterHash });
  pending = memory.records().at(-1)!;
  assert.equal(pending.uncertainty?.observedBufferHash, afterHash);
  assert.equal(assertValidActionReceipt(pending.receipt).after, undefined);
  const reader = createPropertyCorrectionJournal(memory.restart());
  const refused = await reader.prepare(input);
  await refused.finish({ kind: 'refused', code: 'AUTHORITY_CHANGED' });
  const denied = assertValidActionReceipt(memory.records().at(-1)!.receipt);
  assert.equal(denied.id, refused.id);
  assert.equal(denied.status, 'failed');
  assert.equal(denied.failure?.code, 'AUTHORITY_CHANGED');
  assert.equal(denied.after, undefined);

  const parallelMemory = new MemoryMemento();
  const left = createPropertyCorrectionJournal(parallelMemory);
  const right = createPropertyCorrectionJournal(parallelMemory);
  const unresolved = await Promise.all(Array.from({ length: 32 }, (_, index) =>
    (index % 2 === 0 ? left : right).prepare(input)));
  assert.equal(parallelMemory.maxActive, 1);
  assert.equal(new Set(unresolved.map(item => item.id)).size, 32);
  await unresolved[0].finish({ kind: 'uncertain', code: 'APPLY_RESULT_UNKNOWN' });
  await assert.rejects(right.prepare(input), /full of unresolved/);
  await unresolved[1].finish({ kind: 'refused', code: 'STALE_BUFFER' });
  parallelMemory.failNextUpdate = true;
  await assert.rejects(right.prepare(input), /could not persist/);
  assert.equal(assertValidActionReceipt(parallelMemory.records()[1].receipt).id, unresolved[1].id);
  const next = await right.prepare(input);
  const retained = parallelMemory.records().map(entry => assertValidActionReceipt(entry.receipt));
  assert.equal(retained.length, 32);
  assert.equal(retained[0].id, unresolved[0].id);
  assert.equal(retained[0].status, 'prepared');
  assert.ok(!retained.some(record => record.id === unresolved[1].id));
  assert.equal(retained.at(-1)?.id, next.id);

  parallelMemory.records()[0].uncertainty!.code = 'ALTERED';
  const corruptReader = createPropertyCorrectionJournal(parallelMemory.restart());
  await assert.rejects(corruptReader.prepare(input), /could not validate/);

  console.log('[property-correction-receipt] PASS prepare, validation, refusal, uncertainty, retry, capacity, serialized persistence, integrity');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
