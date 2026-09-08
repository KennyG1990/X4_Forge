import { strict as assert } from 'node:assert';
import * as path from 'node:path';

import playwrightConfig, {
  E2E_API_ORIGIN,
  E2E_API_PORT,
  E2E_VITE_ENV,
  E2E_WEB_ORIGIN,
  E2E_WEB_PORT,
  resolveE2ePorts,
} from '../playwright.config';

type ConfigSurface = {
  webServer?: unknown;
  use?: unknown;
};

type WebServerSurface = {
  env?: unknown;
  url?: unknown;
};

type UseSurface = {
  baseURL?: unknown;
  storageState?: unknown;
};

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function requireEnv(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  if (typeof value !== 'string') {
    assert.fail(`${name} must be defined in the API webServer environment`);
  }
  assert.notEqual(value, '', `${name} must not be empty in the API webServer environment`);
  return value;
}

const defaultPorts = resolveE2ePorts({});
assert.deepEqual(defaultPorts, { webPort: 3100, apiPort: 3101 }, 'E2E defaults must remain web 3100 / API 3101');
assert.deepEqual(resolveE2ePorts({
  X4_FORGE_E2E_WEB_PORT: '3200',
  X4_FORGE_E2E_API_PORT: '3201',
}), { webPort: 3200, apiPort: 3201 }, 'E2E override pair must resolve as decimal ports');

let inheritedGetterExecuted = false;
const inheritedPrototype = Object.create(null) as Record<string, unknown>;
Object.defineProperty(inheritedPrototype, 'X4_FORGE_E2E_WEB_PORT', {
  get: () => {
    inheritedGetterExecuted = true;
    return '3200';
  },
});
const inheritedPortEnv = Object.create(inheritedPrototype) as Record<string, unknown>;
assert.deepEqual(resolveE2ePorts(inheritedPortEnv), defaultPorts, 'inherited port values must be ignored in favor of defaults');
assert.equal(inheritedGetterExecuted, false, 'inherited accessors must not be invoked');

let accessorGetterExecuted = false;
const accessorPortEnv = Object.create(null) as Record<string, unknown>;
Object.defineProperty(accessorPortEnv, 'X4_FORGE_E2E_WEB_PORT', {
  get: () => {
    accessorGetterExecuted = true;
    throw new Error('accessor getter must not execute');
  },
});
Object.defineProperty(accessorPortEnv, 'X4_FORGE_E2E_API_PORT', { value: '3201' });
assert.throws(
  () => resolveE2ePorts(accessorPortEnv),
  /Invalid X4_FORGE_E2E_WEB_PORT: expected an own data property containing a decimal integer from 1 to 65535; received an accessor property\./,
  'accessor-backed port values must fail closed without invoking the accessor',
);
assert.equal(accessorGetterExecuted, false, 'accessor-backed port getter must not be invoked');

const invalidPortSelections: Array<{ label: string; env: Record<string, unknown>; error: RegExp }> = [
  {
    label: 'malformed',
    env: { X4_FORGE_E2E_WEB_PORT: 'three-thousand', X4_FORGE_E2E_API_PORT: '3201' },
    error: /Invalid X4_FORGE_E2E_WEB_PORT: expected a decimal integer from 1 to 65535/,
  },
  {
    label: 'fractional',
    env: { X4_FORGE_E2E_WEB_PORT: '3200.5', X4_FORGE_E2E_API_PORT: '3201' },
    error: /Invalid X4_FORGE_E2E_WEB_PORT: expected a decimal integer from 1 to 65535/,
  },
  {
    label: 'zero',
    env: { X4_FORGE_E2E_WEB_PORT: '0', X4_FORGE_E2E_API_PORT: '3201' },
    error: /Invalid X4_FORGE_E2E_WEB_PORT: expected a decimal integer from 1 to 65535/,
  },
  {
    label: 'out of range',
    env: { X4_FORGE_E2E_WEB_PORT: '65536', X4_FORGE_E2E_API_PORT: '3201' },
    error: /Invalid X4_FORGE_E2E_WEB_PORT: expected a decimal integer from 1 to 65535/,
  },
  {
    label: 'non-string',
    env: { X4_FORGE_E2E_WEB_PORT: 3200, X4_FORGE_E2E_API_PORT: '3201' },
    error: /Invalid X4_FORGE_E2E_WEB_PORT: expected a decimal integer from 1 to 65535/,
  },
  {
    label: 'equal pair',
    env: { X4_FORGE_E2E_WEB_PORT: '3200', X4_FORGE_E2E_API_PORT: '3200' },
    error: /Invalid E2E port selection: web and API ports must differ/,
  },
  {
    label: 'protected web port',
    env: { X4_FORGE_E2E_WEB_PORT: '3000', X4_FORGE_E2E_API_PORT: '3201' },
    error: new RegExp('X4_FORGE_E2E_WEB_PORT=3000 is protected because 3000/3001 belong to the live stack'),
  },
  {
    label: 'protected API port',
    env: { X4_FORGE_E2E_WEB_PORT: '3200', X4_FORGE_E2E_API_PORT: '3001' },
    error: new RegExp('X4_FORGE_E2E_API_PORT=3001 is protected because 3000/3001 belong to the live stack'),
  },
];

for (const selection of invalidPortSelections) {
  assert.throws(() => resolveE2ePorts(selection.env), selection.error, `${selection.label} port selection must fail closed`);
}

const config = playwrightConfig as ConfigSurface;
const configuredPorts = resolveE2ePorts(process.env);
assert.equal(E2E_WEB_PORT, configuredPorts.webPort, 'config and resolver must share the resolved web port');
assert.equal(E2E_API_PORT, configuredPorts.apiPort, 'config and resolver must share the resolved API port');
assert.equal(E2E_WEB_ORIGIN, `http://127.0.0.1:${E2E_WEB_PORT}`, 'web origin must be loopback and derived from the web port');
assert.equal(E2E_API_ORIGIN, `http://127.0.0.1:${E2E_API_PORT}`, 'API origin must be loopback and derived from the API port');
assert.equal(E2E_VITE_ENV.API_PORT, String(E2E_API_PORT), 'Vite API proxy environment must use the resolved API port');

assert.ok(Array.isArray(config.webServer), 'Playwright config must expose a webServer array');
const apiServer = config.webServer[0] as WebServerSurface | undefined;
assert.ok(apiServer && typeof apiServer === 'object', 'Playwright config must expose its API webServer entry');
assert.ok(apiServer.env && typeof apiServer.env === 'object', 'API webServer must expose its environment');
assert.equal(apiServer.url, `${E2E_API_ORIGIN}/api/agent/schema`, 'API webServer URL must use the resolved API origin');

const env = apiServer.env as Record<string, unknown>;
assert.equal(env.API_PORT, String(E2E_API_PORT), 'API webServer API_PORT must use the resolved API port');
assert.equal(env.PORT, String(E2E_API_PORT), 'API webServer PORT must use the resolved API port');
const mutableNames = ['X4_STATE_DIR', 'X4_CONFIG_DIR', 'X4_DATA_DIR', 'X4FORGE_DISCOVERY_DIR'];
const mutablePaths = Object.fromEntries(mutableNames.map(name => [name, requireEnv(env, name)]));
const stateRoot = path.resolve(mutablePaths.X4_STATE_DIR);
const liveDataPath = path.resolve(process.cwd(), 'data');

for (const name of mutableNames) {
  const value = mutablePaths[name];
  assert.ok(path.isAbsolute(value), `${name} must be absolute`);
  assert.ok(isContained(stateRoot, path.resolve(value)), `${name} must be contained in X4_STATE_DIR`);
}

assert.notEqual(path.resolve(mutablePaths.X4_DATA_DIR), liveDataPath, 'X4_DATA_DIR must not be the live repository data path');

const referenceRoot = env.X4_REFERENCE_ROOT;
if (referenceRoot !== undefined) {
  if (typeof referenceRoot !== 'string') {
    assert.fail('X4_REFERENCE_ROOT must be a string when configured');
  }
  assert.ok(path.isAbsolute(referenceRoot), 'X4_REFERENCE_ROOT must be absolute when configured');
  assert.ok(!isContained(stateRoot, path.resolve(referenceRoot)), 'X4_REFERENCE_ROOT must remain external to X4_STATE_DIR');
}

const use = config.use as UseSurface | undefined;
assert.ok(use && typeof use === 'object', 'Playwright config must expose its browser settings');
assert.equal(use.baseURL, process.env.PLAYWRIGHT_BASE_URL || E2E_WEB_ORIGIN, 'Playwright base URL must use the resolved web authority');
const storageState = use.storageState as { origins?: Array<{ origin?: unknown }> } | undefined;
assert.equal(storageState?.origins?.[0]?.origin, new URL(String(use.baseURL)).origin, 'storage state must target the same browser origin');

console.log('e2e ephemeral environment containment selftest passed');
