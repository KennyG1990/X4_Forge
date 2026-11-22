import { createHash, randomUUID } from 'node:crypto';
import type { Memento } from 'vscode';
import {
  assertValidActionReceipt,
  createPreparedActionReceipt,
  transitionActionReceipt,
  type ActionReceipt,
  type ActionReceiptResourceAuthority,
} from '../../shared/actionReceipt';

export interface PropertyCorrectionReceiptInput {
  workspaceId: string;
  relativePath: string;
  beforeHash: string;
  correctionHash: string;
  vocabularyHash: string;
  ruleHash: string;
}

export type PropertyCorrectionReceiptOutcome =
  | { kind: 'refused'; code: string }
  | { kind: 'uncertain'; code: string; afterHash?: string }
  | { kind: 'applied'; afterHash: string; project: { ok: boolean; complete: boolean; sourceHash: string } };

type JournalMemento = Pick<Memento, 'get' | 'update'>;

interface Uncertainty {
  code: string;
  observedBufferHash?: string;
  hash: string;
}

interface Entry {
  receipt: ActionReceipt;
  uncertainty?: Uncertainty;
}

interface Journal {
  pending: Promise<void>;
  entries?: Entry[];
}

const key = 'x4forge.propertyCorrectionReceipts.v1';
const capacity = 32;
const capability = { id: 'editor.property-correction', version: '1.0.0' };
const validator = 'editor.property-correction.target-verification';
const sha256Pattern = /^[a-f0-9]{64}$/;
const journals = new WeakMap<JournalMemento, Journal>();

function checkedHash(value: unknown): string {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) {
    throw new Error('Invalid property correction evidence hash.');
  }
  return value;
}

function refusedReceipt(receipt: ActionReceipt, code: string, at: string): ActionReceipt {
  return transitionActionReceipt(receipt, {
    to: 'failed', at,
    validation: { ...receipt.validation, status: 'failed', code },
    failure: { code },
  });
}

function uncertaintyEvidence(receipt: ActionReceipt, code: string, afterHash?: string): Uncertainty {
  // Use the kernel's failure-code policy without persisting a terminal refusal.
  refusedReceipt(receipt, code, receipt.times.preparedAt);
  const observedBufferHash = afterHash === undefined ? undefined : checkedHash(afterHash);
  const hash = createHash('sha256').update(JSON.stringify([
    'forge.property-correction.uncertainty.v1', receipt.hash, code, observedBufferHash ?? null,
  ])).digest('hex');
  return { code, ...(observedBufferHash === undefined ? {} : { observedBufferHash }), hash };
}

function readEntries(state: JournalMemento): Entry[] {
  const stored = state.get<unknown>(key);
  if (stored === undefined) return [];
  try {
    if (!Array.isArray(stored) || stored.length > capacity) throw new Error();
    const ids = new Set<string>();
    return stored.map((entry: Entry) => {
      const receipt = assertValidActionReceipt(entry.receipt);
      if (!('id' in receipt.capability) || receipt.capability.id !== capability.id
        || receipt.capability.version !== capability.version || receipt.authority.scope !== 'workspace'
        || receipt.validation.validator !== validator || !['prepared', 'failed', 'committed'].includes(receipt.status)
        || receipt.metadata?.mode !== 'buffer-only' || receipt.rollback.mode !== 'none' || ids.has(receipt.id)) {
        throw new Error();
      }
      ids.add(receipt.id);
      if (entry.uncertainty === undefined) return { receipt };
      if (receipt.status !== 'prepared') throw new Error();
      const uncertainty = uncertaintyEvidence(receipt, entry.uncertainty.code, entry.uncertainty.observedBufferHash);
      if (uncertainty.hash !== entry.uncertainty.hash) throw new Error();
      return { receipt, uncertainty };
    });
  } catch {
    throw new Error('Forge could not validate the property correction receipt journal.');
  }
}

export function createPropertyCorrectionJournal(globalState: JournalMemento): {
  prepare(input: PropertyCorrectionReceiptInput): Promise<{
    id: string;
    finish(outcome: PropertyCorrectionReceiptOutcome): Promise<void>;
  }>;
} {
  const journal: Journal = journals.get(globalState) ?? { pending: Promise.resolve() };
  journals.set(globalState, journal);

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = journal.pending.then(task);
    journal.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  function entries(): Entry[] {
    return journal.entries ??= readEntries(globalState);
  }

  async function persist(next: Entry[]): Promise<void> {
    try {
      await globalState.update(key, structuredClone(next));
    } catch (cause) {
      throw new Error('Forge could not persist the property correction receipt.', { cause });
    }
    // Memento implementations may update their in-memory cache before persistence.
    journal.entries = next;
  }

  return {
    async prepare(input) {
      const resource: ActionReceiptResourceAuthority = {
        role: 'file', root: 'editor-buffer', relativePath: input.relativePath, beforeHash: input.beforeHash,
      };
      const receipt = createPreparedActionReceipt({
        actor: { kind: 'human', id: 'native-editor-user' },
        client: { channel: 'studio', id: 'native-editor', version: capability.version },
        capability,
        authority: {
          scope: 'workspace', workspaceId: input.workspaceId,
          operationId: 'editor-property-' + randomUUID(), requestScope: 'editor-buffer', resources: [resource],
        },
        effects: { declared: [{
          id: 'editor-buffer-text-replacement', operation: 'replace-text', resource,
          // This flag denotes kernel-managed recovery. The editor owns its Undo.
          reversible: false,
        }] },
        input: { requestHash: input.correctionHash, beforeHash: input.beforeHash },
        validation: { validator, ruleHash: input.ruleHash },
        rollback: { required: false, mode: 'none' },
        metadata: {
          mode: 'buffer-only', corpusHash: checkedHash(input.vocabularyHash),
          summary: 'Native editor Undo restores the buffer.',
        },
      });

      await enqueue(async () => {
        const current = entries();
        const oldestTerminal = current.findIndex(entry => entry.receipt.status !== 'prepared');
        if (current.length === capacity && oldestTerminal === -1) {
          throw new Error('The property correction receipt journal is full of unresolved attempts.');
        }
        const retained = current.length === capacity
          ? current.filter((_, index) => index !== oldestTerminal)
          : current;
        await persist([...retained, { receipt }]);
      });

      return {
        id: receipt.id,
        finish(outcome) {
          return enqueue(async () => {
            const current = entries();
            const index = current.findIndex(entry => entry.receipt.id === receipt.id);
            if (index === -1 || current[index].receipt.status !== 'prepared') {
              throw new Error('The property correction receipt is no longer prepared.');
            }
            const prepared = current[index].receipt;
            const at = new Date(Math.max(Date.now(), Date.parse(prepared.times.preparedAt))).toISOString();
            let finished: Entry;
            if (outcome.kind === 'refused') {
              finished = { receipt: refusedReceipt(prepared, outcome.code, at) };
            } else if (outcome.kind === 'uncertain') {
              finished = { receipt: prepared, uncertainty: uncertaintyEvidence(prepared, outcome.code, outcome.afterHash) };
            } else {
              const afterHash = checkedHash(outcome.afterHash);
              if (afterHash === prepared.input.beforeHash) throw new Error('The corrected buffer has not changed.');
              const { ok, complete, sourceHash } = outcome.project;
              if (typeof ok !== 'boolean' || typeof complete !== 'boolean') {
                throw new Error('Invalid property correction project validation evidence.');
              }
              finished = { receipt: transitionActionReceipt(prepared, {
                to: 'committed', at,
                validation: {
                  ...prepared.validation, status: 'passed', code: 'PROPERTY_CORRECTION_TARGET_VERIFIED',
                  summary: JSON.stringify({ projectOk: ok, projectComplete: complete, projectSourceHash: checkedHash(sourceHash) }),
                },
                after: {
                  outcome: 'applied',
                  resources: [{ role: resource.role, root: resource.root, relativePath: resource.relativePath, hash: afterHash }],
                },
              }) };
            }
            const next = current.slice();
            next[index] = finished;
            await persist(next);
          });
        },
      };
    },
  };
}
