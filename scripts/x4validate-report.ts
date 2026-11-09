import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ValidationEvidence, ValidationEvidenceFinding } from '../src/lib/validationEvidence';

export const validationSeverity = { info: 0, warning: 1, error: 2 } as const;
export type ValidationSeverity = keyof typeof validationSeverity;
export type ValidationReportFormat = 'text' | 'json' | 'sarif' | 'github';

const CLI_LIMITATIONS = ['Game-object reference checks require the Forge backend.'];
const SARIF_SCHEMA = 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';

function relativeFile(base: string, file: string): string | undefined {
  const relative = path.relative(base, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  return relative.split(path.sep).join('/');
}

function physicalPath(file: string, regularFile = false): string | undefined {
  try {
    if (regularFile && !fs.lstatSync(file).isFile()) return;
    return fs.realpathSync.native(file);
  } catch { return undefined; }
}

function position(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

// A GitHub runner also recognizes the legacy workflow prefix inside ordinary log lines.
export function stringifyValidationJson(value: unknown, space?: number): string {
  return JSON.stringify(value, null, space).replaceAll('##[', '##\\u005b');
}

export function safeValidationLog(value: string): string {
  return value.replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('##[', '##\\[');
}

function escapeCommand(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value: string): string {
  return escapeCommand(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function renderValidationReport(
  format: ValidationReportFormat,
  target: string,
  loadedFiles: readonly string[],
  evidence: ValidationEvidence,
  validationOk: boolean,
  passed: boolean,
  failOn: ValidationSeverity,
): string {
  const findings = evidence.findings;
  const counts = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  const summary = `X4 Forge validation ${passed ? 'PASS' : 'FAIL'} | validator=${validationOk ? 'ok' : 'errors'} | errors=${counts.error} warnings=${counts.warning} info=${counts.info} | coverage=${evidence.coverage.complete ? 'complete' : 'incomplete'} | CLI limits=${CLI_LIMITATIONS.length} | fail-on=${failOn}`;
  const verdict = {
    passed, validationOk, failOn, counts, summary,
    modId: evidence.modId, sourceHash: evidence.sourceHash, sourceHashScope: evidence.hashScope,
    outcome: evidence.outcome, coverage: evidence.coverage, limitations: CLI_LIMITATIONS,
  };
  if (format === 'text') return summary;
  if (format === 'json') return stringifyValidationJson({ ...verdict, findings });

  const root = physicalPath(target);
  const workspace = physicalPath(process.env.GITHUB_WORKSPACE || process.cwd());
  const workspaceContainsMod = root && workspace && (path.relative(workspace, root) === '' || relativeFile(workspace, root));
  const base = format === 'github' || workspaceContainsMod ? workspace : root;
  const loaded = new Set(loadedFiles);
  const locations = new Map<string, string | undefined>();
  function findingFile(finding: ValidationEvidenceFinding): string | undefined {
    if (!base || !root || !finding.filePath) return;
    const source = process.platform === 'win32' ? finding.filePath.replaceAll('\\', '/') : finding.filePath;
    if (!loaded.has(source)) return;
    if (!locations.has(source)) {
      const absolute = path.resolve(root, source);
      const physical = physicalPath(absolute, true);
      locations.set(source, physical && relativeFile(root, absolute) && path.relative(absolute, physical) === ''
        ? relativeFile(base, physical) : undefined);
    }
    return locations.get(source);
  }

  if (format === 'github') {
    const annotations = findings.map(finding => {
      const command = finding.severity === 'info' ? 'notice' : finding.severity;
      const file = findingFile(finding);
      const line = file ? position(finding.line) : undefined;
      const column = line ? position(finding.column) : undefined;
      const properties = [`title=${escapeProperty(finding.code || 'X4 Forge validation')}`];
      if (file) properties.push(`file=${escapeProperty(file)}`);
      if (line) properties.push(`line=${line}`);
      if (column) properties.push(`col=${column}`);
      return `::${command} ${properties.join(',')}::${escapeCommand(finding.message)}`;
    });
    return [...annotations, summary].join('\n');
  }

  const ruleIds = [...new Set(findings.map(finding => finding.code || 'validation'))].sort();
  const results = findings.map(finding => {
    const file = findingFile(finding);
    const line = position(finding.line);
    const column = line ? position(finding.column) : undefined;
    return {
      ruleId: finding.code || 'validation',
      level: finding.severity === 'info' ? 'note' : finding.severity,
      message: { text: finding.message },
      properties: { category: finding.category },
      ...(file ? { locations: [{ physicalLocation: {
        artifactLocation: { uri: file.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' },
        ...(line ? { region: { startLine: line, ...(column ? { startColumn: column } : {}) } } : {}),
      } }] } : {}),
    };
  });
  return stringifyValidationJson({
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'X4 Forge', rules: ruleIds.map(id => ({ id })) } },
      columnKind: 'utf16CodeUnits',
      ...(base ? { originalUriBaseIds: { '%SRCROOT%': { uri: pathToFileURL(`${base}${path.sep}`).href } } } : {}),
      properties: verdict,
      results,
    }],
  });
}
