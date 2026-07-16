/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * B53 — the server's runtime-data root ("data/"): harvested schemas, AI usage meter, AI keys,
 * agent keys, api-registry. Historically hardcoded to <cwd>/data, which inside the PACKAGED
 * EXTENSION is the install directory — wiped on every update (users lost agent keys, AI keys,
 * and the spend meter each release; config.json got the same fix in B51 via X4_CONFIG_DIR).
 *
 * `X4_DATA_DIR` (set by the extension to <globalStorage>/data) relocates it. Unset =
 * <cwd>/data, so dev/standalone behavior is unchanged. Deliberately NOT coupled to
 * X4_STATE_DIR (the ephemeral e2e stack sets that for workspace isolation — coupling config
 * to it was the B51 regression; same rule here).
 */

import path from 'path';

export function resolveDataDir(): string {
  const dir = process.env.X4_DATA_DIR?.trim();
  return dir ? path.resolve(dir) : path.join(process.cwd(), 'data');
}

/** Convenience: a path inside the runtime-data root. */
export function dataPath(...segments: string[]): string {
  return path.join(resolveDataDir(), ...segments);
}

export function runDataDirSelftest(): { pass: boolean; checks: Array<{ name: string; pass: boolean; detail?: string }> } {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const saved = process.env.X4_DATA_DIR;
  try {
    delete process.env.X4_DATA_DIR;
    ok('default is <cwd>/data', resolveDataDir() === path.join(process.cwd(), 'data'), resolveDataDir());
    process.env.X4_DATA_DIR = path.join(process.cwd(), 'custom-data-root');
    ok('env override honored (absolute)', resolveDataDir() === path.join(process.cwd(), 'custom-data-root'));
    ok('dataPath joins under the root', dataPath('a', 'b.json') === path.join(process.cwd(), 'custom-data-root', 'a', 'b.json'));
    process.env.X4_DATA_DIR = '   ';
    ok('blank env falls back to default', resolveDataDir() === path.join(process.cwd(), 'data'));
  } finally {
    if (saved === undefined) delete process.env.X4_DATA_DIR; else process.env.X4_DATA_DIR = saved;
  }
  return { pass: checks.every(c => c.pass), checks };
}
