/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * x4validate — standalone CLI for the X4 Forge validation engine.
 * "Engine as the product" stage 1 (2026-07-08 design review): the deterministic
 * checker usable WITHOUT opening the Forge UI — from a terminal, a CI job, or
 * another tool. Same engine stack as POST /api/agent/project/validate.
 *
 * Usage (run from the X4 Forge repo root so config.json resolves):
 *   npm run validate:mod -- "<MODS_ROOT>\x4_ai_influence"
 *   npm run validate:mod -- "<mod folder>" --json
 *
 * Exit codes: 0 = passed, 1 = failed validation gate, 2 = usage/load failure.
 *
 * Honesty notes printed with the report:
 * - Game-object reference checks (macros/wares/factions) need the Forge's object
 *   index and are NOT run by the CLI — use the Forge for those.
 * - Schema/scriptproperties layers read the game data via config.json; if a layer
 *   is unavailable it is reported as such, never silently skipped.
 */

import path from "path";
import { parseArgs } from 'node:util';
import { flattenProjectValidation, loadProjectFromDisk, runProjectValidation, type FlatProjectDiagnostic, type ProjectValidationResult } from "../src/server/projectValidation";
import { buildValidationEvidence } from '../src/lib/validationEvidence';
import { renderValidationReport, safeValidationLog, stringifyValidationJson, validationSeverity, type ValidationReportFormat, type ValidationSeverity } from './x4validate-report';

function printUsage() {
  console.log([
    "x4validate — deterministic X4 mod validation (X4 Forge engine, no UI).",
    "",
    "Usage:  npm run validate:mod -- \"<mod folder>\" [--json]",
    "        npm run validate:mod -- \"<mod folder>\" --format text|json|sarif|github [--fail-on error|warning|info]",
    "",
    "Runs: structure, cue references (cross-file), MD<->Lua event wiring,",
    "XSD validation (md.xsd + aiscripts.xsd incl. cat/dat harvest),",
    "aiscript order-param lint, scriptproperty chain lint, and exact root",
    "forge.rules.json v1 contracts/reviewed warning suppressions.",
    "",
    "Exit codes: 0 passed | 1 failed validation gate | 2 usage/load failure",
  ].join("\n"));
}

function main(): number {
  const { values, positionals, tokens } = parseArgs({
    allowPositionals: true,
    tokens: true,
    options: { help: { type: 'boolean' }, json: { type: 'boolean' }, format: { type: 'string' }, 'fail-on': { type: 'string' } },
  });
  if (values.help) { printUsage(); return 0; }
  if (positionals.length > 1 || (values.json && values.format !== undefined)
    || tokens.filter(token => token.kind === 'option' && token.name === 'format').length > 1) {
    throw new Error('Choose one mod folder and at most one output format.');
  }
  if (values.format !== undefined && !['text', 'json', 'sarif', 'github'].includes(values.format)) {
    throw new Error('--format must be text, json, sarif, or github.');
  }
  const threshold = values['fail-on'] ?? 'error';
  if (!Object.hasOwn(validationSeverity, threshold)
    || tokens.filter(token => token.kind === 'option' && token.name === 'fail-on').length > 1) {
    throw new Error('Use --fail-on at most once with error, warning, or info.');
  }
  if (!positionals.length) { printUsage(); return 2; }

  const target = path.resolve(positionals[0]);
  const load = loadProjectFromDisk(target);
  if (!load.project.files.length) {
    console.error(`No loadable mod files found under: ${safeValidationLog(target)}`);
    console.error("Expected an extension folder containing content.xml / md/*.xml / aiscripts/*.xml / *.lua");
    return 2;
  }
  const result = runProjectValidation(load.project);
  const flat = flattenProjectValidation(result);
  const failOn = threshold as ValidationSeverity;
  const gated = values.format !== undefined || values['fail-on'] !== undefined;
  const passed = result.ok && (!gated || !flat.some(finding => validationSeverity[finding.severity] >= validationSeverity[failOn]));

  if (values.format !== undefined) {
    const evidence = load.skipped.length || !result.evidence ? buildValidationEvidence(load.project, flat, [
      ...(result.evidence?.coverage.gaps || []),
      ...load.skipped.map(file => ({ check: 'source.inventory', filePath: file.path, reason: file.reason })),
    ]) : result.evidence;
    console.log(renderValidationReport(values.format as ValidationReportFormat, target, load.loaded, evidence, result.ok, passed, failOn));
  } else if (values.json) {
    console.log(stringifyValidationJson({ target, loaded: load.loaded, skipped: load.skipped, ...result, flat }, 2));
  } else {
    printHumanReport(target, load.project.id, load.skipped.length, result, flat);
    if (values['fail-on'] !== undefined) console.log(`Severity gate (${failOn}): ${passed ? 'PASS' : 'FAIL'}`);
  }
  return passed ? 0 : 1;
}

function printHumanReport(target: string, id: string, skipped: number, result: ProjectValidationResult, flat: FlatProjectDiagnostic[]): void {
  const logText = process.env.GITHUB_ACTIONS === 'true' ? safeValidationLog : (value: string) => value;
  const s = result.summary;
  console.log(`\nX4 Forge validate — ${logText(id)}`);
  console.log(`Folder: ${logText(target)}`);
  console.log(`Files:  ${s.files} loaded${skipped ? ` (${skipped} skipped)` : ""}`);
  console.log("");
  console.log(`Verdict: ${result.ok ? "VALID (no errors)" : "ERRORS FOUND"}`);
  console.log(`  structural errors:          ${s.structuralErrors}`);
  console.log(`  unresolved cue refs:        ${s.unresolvedCueRefs}`);
  console.log(`  cross-file errors:          ${s.crossFileErrors} (missing Lua registers: ${s.mdLuaMissingRegisters}, missing MD listeners: ${s.luaMdMissingListeners})`);
  console.log(`  schema errors/warnings:     ${s.schemaErrors}/${s.schemaWarnings} (md schema: ${result.schema.mdAvailable ? "loaded" : "UNAVAILABLE"}, aiscripts schema: ${result.schema.aiscriptAvailable ? "loaded" : "UNAVAILABLE"})`);
  console.log(`  aiscript lint errors:       ${s.aiscriptErrors}`);
  console.log(`  Lua errors/warnings:        ${s.luaErrors}/${s.luaWarnings}`);
  console.log(`  X4 UI errors/warnings:      ${s.x4UiErrors}/${s.x4UiWarnings} (unverified: ${s.x4UiUnverified}, truncated: ${s.x4UiTruncated})`);
  console.log(`  MD pitfall errors/warnings: ${s.mdPitfallErrors}/${s.mdPitfallWarnings}`);
  console.log(`  scriptproperty warnings:    ${s.scriptPropertyWarnings} (index: ${result.scriptProperties.available ? "loaded" : "UNAVAILABLE"})`);
  console.log(`  active/raw warnings:        ${s.activeWarnings}/${s.rawWarnings} (${s.suppressedWarnings} suppressed by reviewed project rules)`);
  console.log(`  project-rules errors:       ${s.rulesErrors} (forge.rules.json: ${result.rules.present ? (result.rules.valid ? `v${result.rules.version} valid` : "INVALID") : "not present"})`);
  console.log("  note: game-object reference checks (macros/wares/factions) run only inside the Forge.");

  const lines = flat.map(f =>
    `[${f.severity}] ${f.code || "validation"}: ${f.message}${f.filePath ? ` (${f.filePath}${f.line ? `:${f.line}` : ""})` : ""}`,
  );

  if (lines.length) {
    console.log(`\nFindings (${lines.length}):`);
    for (const l of lines) console.log("  " + logText(l));
  } else {
    console.log("\nNo findings.");
  }
}

try { process.exitCode = main(); }
catch (error) {
  console.error(`x4validate: ${safeValidationLog(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 2;
}
