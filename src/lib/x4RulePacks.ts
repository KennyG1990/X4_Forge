import rawX4CoreRulePack from './x4RulePack.core.json' with { type: 'json' };

import { parseX4RulePackValue } from './x4RulePackParser';
import { resolveX4DiagnosticRule } from './x4RulePackResolver';
import type {
  X4DiagnosticRuleInput,
  X4VerifiedRulePackV1,
} from './x4RulePackTypes';

export const X4_CORE_RULE_PACK_EXPECTED_SHA256 =
  '55f96f23783d6b3acfe11b02eb14b9a063818babf21ca87c62adf8f99eca54a7' as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const parsedCoreRulePack = parseX4RulePackValue(rawX4CoreRulePack);
if (parsedCoreRulePack.packSha256 !== X4_CORE_RULE_PACK_EXPECTED_SHA256) {
  throw new Error(
    `X4 core rule pack identity mismatch: expected ${X4_CORE_RULE_PACK_EXPECTED_SHA256}, received ${parsedCoreRulePack.packSha256}.`,
  );
}

export const X4_CORE_RULE_PACK: X4VerifiedRulePackV1 = deepFreeze(parsedCoreRulePack);

export function resolveCoreX4DiagnosticRule(input: X4DiagnosticRuleInput) {
  return resolveX4DiagnosticRule(X4_CORE_RULE_PACK, input);
}
