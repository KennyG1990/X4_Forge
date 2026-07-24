#!/usr/bin/env tsx

import { runXsdValidateSelftest } from '../src/lib/xsdValidate';
import {
  buildScriptPropertyIndex,
  runScriptPropertiesSelftest,
  SCRIPT_PROPERTIES_FIXTURE,
} from '../src/lib/scriptProperties';
import { runExpressionSuggestSelftest } from '../src/lib/expressionSuggest';
import { runReferenceLanguageSelftest } from '../src/lib/referenceLanguage';
import { runReferenceLiteralLintSelftest } from '../src/lib/referenceLint';

const suites = [
  ['xsd-model', runXsdValidateSelftest()],
  ['scriptproperties', runScriptPropertiesSelftest()],
  ['expression-suggest', runExpressionSuggestSelftest(buildScriptPropertyIndex(SCRIPT_PROPERTIES_FIXTURE))],
  ['reference-language', runReferenceLanguageSelftest()],
  ['reference-literals', runReferenceLiteralLintSelftest()],
] as const;

let passed = 0;
let total = 0;
for (const [name, suite] of suites) {
  passed += suite.passed;
  total += suite.total;
  console.log(`${name}: ${suite.passed}/${suite.total} ${suite.allPassed ? 'PASS' : 'FAIL'}`);
  for (const check of suite.checks) if (!check.pass) console.log(`  FAIL ${check.name}: ${'detail' in check ? check.detail || '' : ''}`);
}
console.log(`schema-intelligence: ${passed}/${total} ${passed === total ? 'PASS' : 'FAIL'}`);
process.exit(passed === total ? 0 : 1);
