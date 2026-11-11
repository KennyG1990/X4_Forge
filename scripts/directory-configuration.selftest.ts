import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeDeployFormat } from '../src/lib/deployFormat';
import { validateDirectoryRoles } from '../src/lib/pathRoles';
import type { XsdConfig, ResolvedXsdConfig } from '../src/lib/xsdParser';
import { planDirectoryConfigurationChange } from '../src/server/directoryConfiguration';

// No fixture writes, backend, child commands or listeners. Paths stay private and
// uncreated. The actual role validator still owns game/physical-overlap checks.
const root = path.join(os.tmpdir(), 'forge-configuration-plan-uncreated');
assert(!fs.existsSync(root), 'The read-only fixture namespace must be absent.');
const corpus = path.join(root, 'corpus');
const mods = path.join(root, 'mods');
const game = path.join(root, 'scratch-game');
const pins = { x4GamePath: game, modWorkspacePath: mods, filesystemPath: path.join(game, 'extensions'),
  x4LogPath: path.join(game, 'debuglog.txt') };
type Config = XsdConfig & { deployFormat?: string; preserved?: string };
interface Scenario {
  name: string; body?: Record<string, unknown> | null; owner?: boolean; scratch?: boolean;
  denied?: boolean; schema?: boolean; config?: Config; effectiveCorpus?: string;
  failure?: 'read' | 'resolve' | 'storage' | 'write' | 'reload' | 'manifest';
  status?: number; code?: string; writes?: number;
}
const baseConfig: Config = { x4GamePath: '', x4ReferenceRoot: corpus, xsdSchemaPath: path.join(root, 'schema'),
  modWorkspacePath: mods, filesystemPath: path.join(root, 'browse'), x4LogPath: 'preserved-log',
  schemaFiles: ['old.xsd'], deployFormat: 'loose', preserved: 'unrelated-value' };
function resolve(config: XsdConfig, scenario: Scenario): ResolvedXsdConfig {
  const schemaDir = config.xsdSchemaPath || path.join(root, 'harvested');
  return { ...config, ...(scenario.scratch ? { ...pins, isolatedScratch: true as const } : {}),
    schemaDir, mdXsdPath: path.join(schemaDir, 'md.xsd'), commonXsdPath: path.join(schemaDir, 'common.xsd'),
    mdExists: !!scenario.schema, commonExists: !!scenario.schema,
    x4ReferenceRoot: scenario.effectiveCorpus || config.x4ReferenceRoot || corpus, x4ReferenceExists: false };
}
function callback(source: string): string {
  const file = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(file) === 'app' && node.expression.name.text === 'post'
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === '/api/schema/config') matches.push(node.arguments[1]);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(matches.length, 1, 'Exactly one actual config POST callback.');
  return matches[0].getText(file);
}
const source = fs.readFileSync('server.ts', 'utf8');
const current = callback(source);
assert(current.includes('planDirectoryConfigurationChange('), 'The actual handler must use the shared planner.');
assert.equal((current.match(/writeXsdConfig\(/g) || []).length, 1, 'One existing persistence owner.');
const baseline = process.argv.includes('--baseline-stdin') ? callback(fs.readFileSync(0, 'utf8')) : undefined;
if (baseline) assert(!baseline.includes('planDirectoryConfigurationChange('), 'Supply the pre-extraction baseline.');

function run(handlerSource: string, scenario: Scenario) {
  const events: string[] = [];
  let saved: Config = structuredClone(scenario.config || baseConfig);
  let writes = 0;
  const step = (event: string) => { events.push(event); if (scenario.failure === event) throw new Error(`fixture ${event}`); };
  const readConfig = () => { step('read'); return structuredClone(saved); };
  const resolveConfig = (config: XsdConfig) => { step('resolve'); return resolve(config, scenario); };
  let status = 200;
  let result: unknown;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { result = value; return this; } };
  const globals = {
    path, normalizeDeployFormat, Object,
    requireStudioActor(_req: unknown, response: typeof res) {
      events.push('auth');
      if (scenario.denied) { response.status(403).json({ code: 'STUDIO_REQUIRED' }); return false; }
      return true;
    },
    projectCheckOwnerProfileEnabled: () => !!scenario.owner,
    readXsdConfig: readConfig, resolveXsdConfig: resolveConfig,
    planDirectoryConfigurationChange: (body: Scenario['body'], owner: boolean) =>
      planDirectoryConfigurationChange(body, owner, { readConfig, resolveConfig }),
    directoryRoleIssues: (resolved: ResolvedXsdConfig) => validateDirectoryRoles(resolved,
      resolved.isolatedScratch ? resolved.x4GamePath : undefined),
    validateDevScratchStorage: () => step('storage'),
    writeXsdConfig(config: Config) { step('write'); saved = structuredClone(config); writes++; },
    reloadSchemaLibrary() { step('reload'); return { events: [], conditions: [], actions: [], controlFlow: [], loaded: true, error: null }; },
    startCanonicalReferenceManifest(changed: boolean) { step('manifest'); return { changed }; },
    directorySettingsConfig(config: Config, resolved: ResolvedXsdConfig) {
      if (!resolved.isolatedScratch) return config;
      const { x4GamePath, modWorkspacePath, filesystemPath, x4LogPath } = resolved;
      return { ...config, x4GamePath, modWorkspacePath, filesystemPath, x4LogPath };
    },
  };
  const js = ts.transpileModule(`globalThis.handler = (${handlerSource});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = vm.createContext(globals);
  vm.runInContext(js, context, { timeout: 1000 });
  context.handler({ body: scenario.body }, res);
  return JSON.parse(JSON.stringify({ status, result, saved, writes, events }));
}

const scenarios: Scenario[] = [
  { name: 'omitted body preserves paths' }, { name: 'null body preserves paths', body: null },
  { name: 'empty request preserves unrelated values', body: {} },
  { name: 'catalog only preserves schema path', body: { deployFormat: ' CATALOG ' } },
  { name: 'loose format', body: { deployFormat: 'loose' }, schema: true },
  { name: 'paths save with incomplete schema', body: { schemaDir: ' next-schema ', filesystemPath: ' next-browse ' } },
  { name: 'explicit clears', body: { schemaDir: '', x4GamePath: '', x4ReferenceRoot: '', modWorkspacePath: '', filesystemPath: '' } },
  { name: 'legacy null false number coercions', body: { schemaDir: null, modWorkspacePath: false, filesystemPath: 42 } },
  { name: 'unknown fields are ignored', body: { x4LogPath: 'new-log', surprise: 'ignored' } },
  { name: 'saved effective corpus changes', body: { x4ReferenceRoot: path.join(root, 'next-corpus') } },
  { name: 'environment corpus precedence', body: { x4ReferenceRoot: path.join(root, 'next-corpus') }, effectiveCorpus: corpus },
  { name: 'owner format remains editable', owner: true, body: { deployFormat: 'catalog' } },
  { name: 'owner lock before bad format/read', owner: true, body: { schemaDir: '', deployFormat: 'zip' },
    status: 409, code: 'PROJECT_CHECK_OWNER_ROOTS_LOCKED', writes: 0 },
  { name: 'Studio denial before every effect', denied: true, owner: true, body: { schemaDir: '' }, status: 403, code: 'STUDIO_REQUIRED', writes: 0 },
  { name: 'scratch exact pins preserve raw saved fields', scratch: true, body: { ...pins, deployFormat: 'catalog' } },
  { name: 'scratch schema and reference editable', scratch: true, body: { schemaDir: 'next', x4ReferenceRoot: path.join(root, 'next-corpus') } },
  { name: 'protected corpus overlap', body: { modWorkspacePath: path.join(corpus, 'bad') }, status: 400, code: 'PROTECTED_ROOT_OVERLAP', writes: 0 },
  { name: 'ordinary game still needs installation', body: { x4GamePath: game }, status: 400, code: 'GAME_NOT_FOUND', writes: 0 },
  ...(['schemaDir', 'x4GamePath', 'modWorkspacePath', 'filesystemPath', 'x4ReferenceRoot'] as const).map(field =>
    ({ name: `owner locks ${field}`, owner: true, body: { [field]: undefined }, status: 409, code: 'PROJECT_CHECK_OWNER_ROOTS_LOCKED', writes: 0 })),
  ...(['x4GamePath', 'modWorkspacePath', 'filesystemPath', 'x4LogPath'] as const).flatMap(field =>
    ['', 'relative', path.join(root, 'retarget'), null].map(value => ({ name: `scratch locks ${field}:${value}`, scratch: true,
      body: { [field]: value }, status: 409, code: 'DEV_SCRATCH_PATH_LOCKED', writes: 0 }))),
  ...(['zip', '', null, false, 0, {}, []] as unknown[]).map(value => ({ name: `invalid format ${JSON.stringify(value)}`,
    body: { deployFormat: value }, status: 400, code: 'UNKNOWN_DEPLOY_FORMAT', writes: 0 })),
  ...(['read', 'resolve', 'storage', 'write', 'reload', 'manifest'] as const).map(failure =>
    ({ name: `failure at ${failure}`, failure, scratch: failure === 'storage', status: 500,
      writes: ['reload', 'manifest'].includes(failure) ? 1 : 0 })),
];
let passed = 0;
for (const scenario of scenarios) {
  const observed = run(current, scenario);
  assert.equal(observed.status, scenario.status ?? 200, scenario.name);
  assert.equal(observed.writes, scenario.writes ?? 1, scenario.name);
  if (scenario.code) assert.equal(observed.result.code, scenario.code, scenario.name);
  if (observed.status === 200) {
    assert.equal(observed.result.saved, true);
    assert.equal(observed.result.schemaComplete, !!scenario.schema);
    assert.deepEqual(observed.saved.schemaFiles, ['md.xsd', 'common.xsd']);
    assert.equal(observed.saved.preserved, 'unrelated-value');
    assert.equal(observed.saved.x4LogPath, 'preserved-log');
    if (scenario.scratch) assert.equal(observed.result.config.x4GamePath, pins.x4GamePath);
  }
  if (!observed.writes) assert.deepEqual(observed.saved, scenario.config || baseConfig, scenario.name);
  if (baseline) assert.deepEqual(observed, run(baseline, scenario), `exact old/new handler parity: ${scenario.name}`);
  passed++;
}
const readers = { readConfig: () => structuredClone(baseConfig), resolveConfig: (config: XsdConfig) => resolve(config, { name: 'read-only planner' }) };
const original = structuredClone(baseConfig);
const planned = planDirectoryConfigurationChange({ deployFormat: 'catalog' }, false, readers);
assert.equal(planned.ok, true);
assert.deepEqual(baseConfig, original, 'Planning does not mutate caller-owned config.');
assert.equal(normalizeDeployFormat(' CATALOG '), 'catalog');
assert.equal(normalizeDeployFormat('LOOSE'), 'loose');
assert.equal(normalizeDeployFormat('unknown'), null);
assert(!fs.existsSync(root), 'Planner/handler proof created no fixture files.');
console.log(JSON.stringify({ status: 'PASS', scenarios: passed, baselineParity: !!baseline,
  writesOnRefusals: 0, fixtureFiles: 0, scope: 'planner and actual source callback; not HTTP/auth middleware/installed proof' }));
