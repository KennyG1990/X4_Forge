import type { BulkTransformOperation, BulkTransformOperationRule, BulkTransformRule } from './bulkCorpusTransform';

export const BULK_RECIPE_MAX_BYTES = 2 * 1024 * 1024;
export const BULK_RECIPE_MAX_OPERATIONS = 16;
const schemaVersion = 'x4forge.bulk-transform-recipe.v1';
const operationNames: readonly BulkTransformOperation[] = ['multiply', 'add', 'set', 'round', 'min', 'max', 'clamp'];
const roundingNames = ['none', 'round', 'floor', 'ceil'] as const;

interface RecipeInputs extends Pick<BulkTransformRule, 'pathPrefix' | 'maxFiles'> {
  operations: BulkTransformOperationRule[];
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a recipe object.');
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readOperation(value: unknown, index: number): BulkTransformOperationRule {
  const { id, selector, operation, operand, rounding, roundingIncrement } = object(value);
  const name = operationNames.find(candidate => candidate === operation);
  const roundingMode = roundingNames.find(candidate => candidate === rounding);
  const label = `Field ${index + 1}`;
  if (typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 128) throw new Error(`${label} needs a stable operation ID.`);
  if (typeof selector !== 'string' || !selector.trim() || selector.length > 16_384) throw new Error(`${label} needs a selector of up to 16,384 characters.`);
  if (!name || !roundingMode || !finiteNumber(roundingIncrement) || roundingIncrement <= 0) {
    throw new Error(`${label} has an unsupported operation or rounding setting.`);
  }

  if (name === 'clamp') {
    if (!Array.isArray(operand) || operand.length !== 2 || !finiteNumber(operand[0]) || !finiteNumber(operand[1]) || operand[0] > operand[1]) {
      throw new Error(`${label} needs a finite minimum and maximum in ascending order.`);
    }
    return { id, selector, operation: name, operand: [operand[0], operand[1]], rounding: roundingMode, roundingIncrement };
  }
  if (!finiteNumber(operand)) throw new Error(`${label} needs a finite numeric operand.`);
  return { id, selector, operation: name, operand, rounding: roundingMode, roundingIncrement };
}

function readInputs(value: Record<string, unknown>): RecipeInputs {
  const { pathPrefix, maxFiles, operations } = value;
  if (typeof pathPrefix !== 'string' || !pathPrefix.trim() || pathPrefix.length > 4_096) throw new Error('Choose a corpus path scope.');
  if (typeof maxFiles !== 'number' || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 500) throw new Error('The safety cap must be an integer from 1 to 500.');
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > BULK_RECIPE_MAX_OPERATIONS) {
    throw new Error(`A recipe needs 1 to ${BULK_RECIPE_MAX_OPERATIONS} numeric operations.`);
  }
  const parsed = operations.map(readOperation);
  if (new Set(parsed.map(operation => operation.id)).size !== parsed.length) throw new Error('A recipe needs a unique ID for each operation.');
  return { pathPrefix, maxFiles, operations: parsed };
}

export function writeBulkTransformRecipe(inputs: RecipeInputs): string {
  return `${JSON.stringify({ schemaVersion, ...readInputs({ ...inputs }) }, null, 2)}\n`;
}

export function readBulkTransformRecipe(text: string): RecipeInputs {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This recipe file is not valid JSON.'); }
  const data = object(value);
  if (data.schemaVersion !== schemaVersion) throw new Error('This bulk transform recipe version is unsupported.');
  return readInputs(data);
}
