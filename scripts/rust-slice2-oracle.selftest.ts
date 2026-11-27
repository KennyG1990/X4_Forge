/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice 2 black-box oracle selftest:
 *  A. `x4forge lsp` stdio LSP 3.17 E2E (diagnostics + all 13 providers + cold-start latency)
 *  B. `x4forge mcp --mode standalone` MCP 2024-11-05 E2E (7 native tools + protocol errors)
 *  C. `x4forge mcp --mode proxy` live loopback discovery, auth/channel headers, fixedBody,
 *     302 redirect refusal, non-loopback SSRF refusal, and isolated-host refusal
 *  D. Optional live X4 9.00 corpus MCP benchmark (skipped cleanly on CI if absent)
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planCatDatCatalogs } from '../src/lib/x4CatDat';
import { resolveRustX4ForgeBin } from '../src/server/rustAccelerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function physicalTmpRoot(): string {
  const base = fs.realpathSync.native(os.tmpdir());
  return fs.mkdtempSync(path.join(base, 'x4-slice2-oracle-'));
}

function posFromOffset(text: string, offset: number): { line: number; character: number } {
  const prefix = text.slice(0, offset);
  const lines = prefix.split('\n');
  const line = lines.length - 1;
  const last = lines[line] ?? '';
  return { line, character: last.length };
}

class LspClient {
  private child: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
  private diagnostics = new Map<string, Array<{ code?: string; message: string }>>();
  private diagWaiters: Array<() => void> = [];
  private exitPromise: Promise<number | null>;

  constructor(bin: string, args: string[] = ['lsp']) {
    this.child = spawn(bin, args, {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    let stderr = '';
    this.child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once('exit', (code) => {
        for (const p of this.pending.values()) {
          p.reject(new Error(`LSP exited unexpectedly (${code}): ${stderr}`));
        }
        this.pending.clear();
        resolve(code);
      });
    });
  }

  private drain(): void {
    while (true) {
      const sepIdx = this.buffer.indexOf('\r\n\r\n');
      if (sepIdx < 0) return;
      const header = this.buffer.subarray(0, sepIdx).toString('ascii');
      const m = /content-length:\s*(\d+)/i.exec(header);
      if (!m) {
        throw new Error(`Invalid LSP frame header: ${header}`);
      }
      const len = Number(m[1]);
      const bodyStart = sepIdx + 4;
      if (this.buffer.length < bodyStart + len) return;
      const bodyBuf = this.buffer.subarray(bodyStart, bodyStart + len);
      this.buffer = this.buffer.subarray(bodyStart + len);

      const msg = JSON.parse(bodyBuf.toString('utf8')) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { code: number; message: string };
      };
      if (typeof msg.id === 'number') {
        const slot = this.pending.get(msg.id);
        if (slot) {
          this.pending.delete(msg.id);
          if (msg.error) {
            slot.reject(new Error(`LSP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            slot.resolve(msg.result);
          }
        }
      } else if (msg.method === 'textDocument/publishDiagnostics' && msg.params) {
        const uri = String(msg.params.uri || '').toLowerCase();
        const diags = (msg.params.diagnostics as Array<{ code?: string; message: string }>) || [];
        this.diagnostics.set(uri, diags);
        const waiters = this.diagWaiters.splice(0);
        for (const w of waiters) w();
      }
    }
  }

  private writeFrame(obj: unknown): void {
    const json = JSON.stringify(obj);
    const bytes = Buffer.from(json, 'utf8');
    const hdr = Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, 'ascii');
    this.child.stdin.write(Buffer.concat([hdr, bytes]));
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.writeFrame({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) });
    });
  }

  notify(method: string, params?: unknown): void {
    this.writeFrame({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) });
  }

  async waitForDiagnostics(uriSuffix: string, predicate: (diags: Array<{ code?: string; message: string }>) => boolean, timeoutMs = 4000): Promise<Array<{ code?: string; message: string }>> {
    const suffix = uriSuffix.toLowerCase();
    const deadline = Date.now() + timeoutMs;
    while (true) {
      for (const [k, v] of this.diagnostics) {
        if (k.endsWith(suffix) && predicate(v)) return v;
      }
      const rem = deadline - Date.now();
      if (rem <= 0) {
        throw new Error(`Timed out waiting for diagnostics on ${uriSuffix}`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, Math.min(rem, 150));
        this.diagWaiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  async close(): Promise<number | null> {
    await this.request('shutdown');
    this.notify('exit');
    this.child.stdin.end();
    return this.exitPromise;
  }
}

class McpClient {
  private child: ChildProcessWithoutNullStreams;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number | string, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
  private stderrChunks: string[] = [];
  private exitPromise: Promise<number | null>;

  constructor(bin: string, args: string[], envOverrides: Record<string, string | undefined> = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    this.child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).replace(/\r$/, '').trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as {
          id?: number | string | null;
          result?: unknown;
          error?: { code: number; message: string };
        };
        const key = msg.id === null ? '__null__' : msg.id;
        if (key !== undefined) {
          const slot = this.pending.get(key);
          if (slot) {
            this.pending.delete(key);
            slot.resolve(msg);
          }
        }
      }
    });
    this.child.stderr.on('data', (c: Buffer) => {
      this.stderrChunks.push(c.toString('utf8'));
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once('exit', (code) => {
        for (const slot of this.pending.values()) {
          slot.reject(new Error(`MCP process exited (${code}): ${this.stderrChunks.join('')}`));
        }
        this.pending.clear();
        resolve(code);
      });
    });
  }

  sendRaw(line: string, expectNullId = false): Promise<{ id?: unknown; result?: unknown; error?: { code: number; message: string } }> {
    const key = expectNullId ? '__null__' : '__none__';
    return new Promise((resolve, reject) => {
      if (expectNullId) {
        this.pending.set(key, { resolve: resolve as (v: unknown) => void, reject });
      }
      this.child.stdin.write(`${line}\n`);
      if (!expectNullId) resolve({});
    });
  }

  request(method: string, params?: unknown): Promise<{ id?: unknown; result?: unknown; error?: { code: number; message: string } }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) });
      this.child.stdin.write(`${payload}\n`);
    });
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })}\n`);
  }

  async close(): Promise<number | null> {
    this.child.stdin.end();
    return this.exitPromise;
  }
}

async function verifyLspE2E(bin: string, scratch: string): Promise<number> {
  const modDir = path.join(scratch, 'lsp-mod');
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(modDir, 't'), { recursive: true });
  fs.mkdirSync(path.join(modDir, 'ui'), { recursive: true });

  const sampleMd = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<mdscript name="DemoScript">',
    '  <!-- #region Setup -->',
    '  <cues>',
    '    <library name="HelperLib" purpose="run_actions">',
    '      <params><param name="Ship" type="ship"/></params>',
    '      <actions>',
    '        <debug_text text="{998801, 1}"/>',
    '      </actions>',
    '    </library>',
    '    <cue name="Start" instantiate="true" namespace="this">',
    '      <actions>',
    '        <find_ship name="$s" space="player.sector"/>',
    '        <run_actions ref="HelperLib"><param name="Ship" value="$s"/></run_actions>',
    '        <debug_text text="\'%s in %s\'.[$s.knownname, player.sector.knownname]"/>',
    '      </actions>',
    '    </cue>',
    '  </cues>',
    '  <!-- #endregion -->',
    '</mdscript>',
  ].join('\n');

  const tXml = '<language id="44">\n  <page id="998801">\n    <t id="1">Patrol Ready</t>\n    <t id="2">Sector Clear</t>\n  </page>\n</language>';
  const typoXml = '<mdscript name="T"><cues><cue name="C"><actions><set_valeu exact="1"/><signal_cue cue="NewCue"/></actions></cue></cues></mdscript>';
  const diffXml = '<diff>\n  <replace sel="/mdscript/cues/cue[@name=\'A\']"/>\n</diff>';
  const luaSrc = 'local PAGE = 998801\nlocal txt = ReadText(PAGE, 1)\nlocal inc = ReadText(998801, ';
  const compXml = '<mdscript name="Comp"><cues><cue name="S"><actions><run_actions ref="';

  fs.writeFileSync(path.join(modDir, 'content.xml'), '<content id="slice2_oracle" name="Slice2" version="100"/>', 'utf8');
  fs.writeFileSync(path.join(modDir, 't', '0001-l044.xml'), tXml, 'utf8');
  fs.writeFileSync(path.join(modDir, 'md', 'demo.xml'), sampleMd, 'utf8');
  fs.writeFileSync(path.join(modDir, 'md', 'typo.xml'), typoXml, 'utf8');
  fs.writeFileSync(path.join(modDir, 'md', 'diff.xml'), diffXml, 'utf8');
  fs.writeFileSync(path.join(modDir, 'ui', 'demo.lua'), luaSrc, 'utf8');

  const uriDemo = pathToFileURL(path.join(modDir, 'md', 'demo.xml')).href;
  const uriTypo = pathToFileURL(path.join(modDir, 'md', 'typo.xml')).href;
  const uriDiff = pathToFileURL(path.join(modDir, 'md', 'diff.xml')).href;
  const uriLua = pathToFileURL(path.join(modDir, 'ui', 'demo.lua')).href;
  const uriComp = pathToFileURL(path.join(modDir, 'md', 'comp.xml')).href;

  const t0 = performance.now();
  const lsp = new LspClient(bin, ['lsp']);
  const initRes = await lsp.request<{ capabilities: Record<string, unknown>; serverInfo?: { name: string } }>('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(modDir).href,
    capabilities: {},
  });
  const coldMs = performance.now() - t0;
  assert.equal(initRes.serverInfo?.name, 'x4forge-lsp');
  lsp.notify('initialized', {});

  lsp.notify('textDocument/didOpen', { textDocument: { uri: uriDemo, languageId: 'xml', version: 1, text: sampleMd } });
  lsp.notify('textDocument/didOpen', { textDocument: { uri: uriTypo, languageId: 'xml', version: 1, text: typoXml } });
  lsp.notify('textDocument/didOpen', { textDocument: { uri: uriDiff, languageId: 'xml', version: 1, text: diffXml } });
  lsp.notify('textDocument/didOpen', { textDocument: { uri: uriLua, languageId: 'lua', version: 1, text: luaSrc } });
  lsp.notify('textDocument/didOpen', { textDocument: { uri: uriComp, languageId: 'xml', version: 1, text: compXml } });

  // Live publishDiagnostics on typo.xml
  const typoDiags = await lsp.waitForDiagnostics('md/typo.xml', (ds) => ds.some((d) => d.code === 'cue.unresolved'));
  assert(typoDiags.some((d) => d.message.includes('NewCue')), 'Expected cue.unresolved diagnostic mentioning NewCue');

  // 1. foldingRange
  const folds = await lsp.request<Array<{ startLine: number; endLine: number; kind?: string }>>('textDocument/foldingRange', {
    textDocument: { uri: uriDemo },
  });
  assert(folds.some((f) => f.kind === 'region'), 'Expected region folding range');
  assert(folds.filter((f) => !f.kind).length >= 4, 'Expected >= 4 element folding ranges');

  // 2. documentSymbol
  const symbols = await lsp.request<Array<{ name: string; children?: Array<{ name: string; children?: Array<{ name: string }> }> }>>('textDocument/documentSymbol', {
    textDocument: { uri: uriDemo },
  });
  assert.equal(symbols.length, 1);
  assert.equal(symbols[0].name, 'DemoScript');
  assert(symbols[0].children?.some((c) => c.name === 'HelperLib'), 'Expected HelperLib in outline');
  assert(symbols[0].children?.some((c) => c.name === 'Start' && c.children?.some((v) => v.name === '$s')), 'Expected $s in Start cue outline');

  const diffSymbols = await lsp.request<Array<{ name: string }>>('textDocument/documentSymbol', {
    textDocument: { uri: uriDiff },
  });
  assert(diffSymbols.length === 1 && diffSymbols[0].name.includes('replace'), 'Expected diff <replace> outline symbol');

  // 3. semanticTokens/full
  const sem = await lsp.request<{ data: number[] }>('textDocument/semanticTokens/full', {
    textDocument: { uri: uriDemo },
  });
  assert(sem.data.length >= 30 && sem.data.length % 5 === 0, `Expected >= 6 semantic token 5-tuples, got ${sem.data.length}`);

  // 4. inlayHint
  const hints = await lsp.request<Array<{ label: string }>>('textDocument/inlayHint', {
    textDocument: { uri: uriDemo },
    range: { start: { line: 0, character: 0 }, end: { line: 50, character: 0 } },
  });
  assert(hints.some((h) => h.label.includes('Patrol Ready')), 'Expected localized text inlay hint');
  assert(hints.some((h) => h.label === ': ship?'), 'Expected : ship? variable type inlay hint');

  // 5. codeLens
  const lenses = await lsp.request<Array<{ command?: { title: string; arguments?: unknown[] } }>>('textDocument/codeLens', {
    textDocument: { uri: uriDemo },
  });
  const libLens = lenses.find((l) => l.command?.arguments?.[0] === 'HelperLib');
  assert.equal(libLens?.command?.title, '1 reference');

  // 6. signatureHelp
  const sig = await lsp.request<{ signatures: Array<{ parameters: unknown[] }>; activeParameter?: number }>('textDocument/signatureHelp', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('player.sector.knownname')),
  });
  assert.equal(sig.signatures[0].parameters.length, 2);
  assert.equal(sig.activeParameter, 1);

  // 7. definition (MD library ref + Lua ReadText)
  const mdDef = await lsp.request<Array<{ uri: string; range: { start: { line: number } } }>>('textDocument/definition', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('ref="HelperLib"') + 6),
  });
  assert.equal(mdDef.length, 1);
  assert.equal(mdDef[0].range.start.line, 4);

  const luaDef = await lsp.request<Array<{ uri: string; range: { start: { line: number } } }>>('textDocument/definition', {
    textDocument: { uri: uriLua },
    position: posFromOffset(luaSrc, luaSrc.indexOf('PAGE, 1') + 2),
  });
  assert.equal(luaDef.length, 1);
  assert(luaDef[0].uri.toLowerCase().endsWith('t/0001-l044.xml'));
  assert.equal(luaDef[0].range.start.line, 2);

  // 8. references
  const refs = await lsp.request<Array<{ uri: string }>>('textDocument/references', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('HelperLib"') + 2),
    context: { includeDeclaration: true },
  });
  assert(refs.length >= 2, `Expected >= 2 references for HelperLib, got ${refs.length}`);

  // 9. prepareRename + rename
  const prepVar = await lsp.request<{ placeholder: string }>('textDocument/prepareRename', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('$s.knownname') + 1),
  });
  assert.equal(prepVar.placeholder, '$s');

  const renameVar = await lsp.request<{ changes: Record<string, Array<{ newText: string }>> }>('textDocument/rename', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('$s.knownname') + 1),
    newName: '$targetShip',
  });
  const varEdits = Object.values(renameVar.changes).flat();
  assert.equal(varEdits.length, 3);
  assert(varEdits.every((e) => e.newText === '$targetShip'));

  const renameLib = await lsp.request<{ changes: Record<string, Array<{ newText: string }>> }>('textDocument/rename', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('HelperLib"') + 2),
    newName: 'RenamedLib',
  });
  assert.equal(Object.values(renameLib.changes).flat().length, 2);

  // 10. hover
  const hoverText = await lsp.request<{ contents: { value: string } }>('textDocument/hover', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('{998801, 1}') + 3),
  });
  assert(hoverText.contents.value.includes('Patrol Ready'));

  const hoverVar = await lsp.request<{ contents: { value: string } }>('textDocument/hover', {
    textDocument: { uri: uriDemo },
    position: posFromOffset(sampleMd, sampleMd.indexOf('$s.knownname') + 1),
  });
  assert(hoverVar.contents.value.includes('ship'));

  // 11. completion (Lua ReadText + MD library ref)
  const luaComp = await lsp.request<Array<{ label: string }>>('textDocument/completion', {
    textDocument: { uri: uriLua },
    position: posFromOffset(luaSrc, luaSrc.length),
  });
  assert.equal(luaComp.length, 2);
  assert.equal(luaComp[0].label, '1');
  assert.equal(luaComp[1].label, '2');

  const mdComp = await lsp.request<Array<{ label: string }>>('textDocument/completion', {
    textDocument: { uri: uriComp },
    position: posFromOffset(compXml, compXml.length),
  });
  assert(mdComp.some((c) => c.label === 'HelperLib'), 'Expected HelperLib in run_actions ref completion');

  // 12. codeAction (set_valeu -> set_value + Create cue "NewCue")
  const typoPos = posFromOffset(typoXml, typoXml.indexOf('set_valeu') + 3);
  const typoActions = await lsp.request<Array<{ title: string; isPreferred?: boolean; edit?: { changes?: Record<string, Array<{ newText: string }>> } }>>('textDocument/codeAction', {
    textDocument: { uri: uriTypo },
    range: { start: typoPos, end: typoPos },
    context: { diagnostics: [] },
  });
  assert(
    typoActions.some((a) => a.isPreferred && Object.values(a.edit?.changes || {}).flat().some((e) => e.newText === 'set_value')),
    'Expected preferred set_value quick-fix',
  );

  const cuePos = posFromOffset(typoXml, typoXml.indexOf('NewCue') + 2);
  const cueActions = await lsp.request<Array<{ title: string }>>('textDocument/codeAction', {
    textDocument: { uri: uriTypo },
    range: { start: cuePos, end: cuePos },
    context: { diagnostics: [] },
  });
  assert(cueActions.some((a) => a.title === 'Create cue "NewCue"'), 'Expected Create cue "NewCue" quick-fix');

  // 13. workspace/symbol
  const wsSyms = await lsp.request<Array<{ name: string }>>('workspace/symbol', { query: 'Helper' });
  assert(wsSyms.some((s) => s.name === 'HelperLib'), 'Expected HelperLib in workspace/symbol');

  const exitCode = await lsp.close();
  assert.equal(exitCode, 0, 'Expected x4forge lsp shutdown+exit to exit 0');
  return coldMs;
}

async function verifyMcpStandaloneE2E(bin: string, scratch: string): Promise<number> {
  const modDir = path.join(scratch, 'mcp-mod');
  const unpackedDir = path.join(scratch, 'mini-corpus');
  const catOutDir = path.join(scratch, 'cat-out');
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(unpackedDir, 'libraries'), { recursive: true });
  fs.mkdirSync(catOutDir, { recursive: true });

  fs.writeFileSync(path.join(modDir, 'content.xml'), '<content id="mcp_demo" name="MCP Demo" version="100"/>', 'utf8');
  fs.writeFileSync(path.join(modDir, 'md', 'main.xml'), '<mdscript name="Main"><cues><cue name="Boot"><actions><debug_text text="\'hi\'"/></actions></cue></cues></mdscript>', 'utf8');
  fs.writeFileSync(path.join(unpackedDir, 'libraries', 'factions.xml'), '<factions><faction id="argon"/><faction id="teladi"/></factions>', 'utf8');
  fs.writeFileSync(path.join(unpackedDir, 'libraries', 'wares.xml'), '<wares><ware id="hullparts" transport="container" group="refined"/></wares>', 'utf8');

  // Build miniature .cat/.dat via planCatDatCatalogs + Slice 1 x4forge cat-pack
  const payloadText = '<content id="packed_demo"/>\n';
  const payloadBuf = Buffer.from(payloadText, 'utf8');
  const plannedLayout = planCatDatCatalogs(
    [{
      name: 'content.xml',
      size: payloadBuf.length,
      expectedSha256: crypto.createHash('sha256').update(payloadBuf).digest('hex'),
      content: payloadText,
    }],
    { baseName: 'ext' },
  );
  assert.equal(plannedLayout.errors.length, 0, plannedLayout.errors.join('; '));
  const rustLayout = {
    volumes: plannedLayout.volumes.map((v) => ({
      index: v.index,
      catName: v.catName,
      datName: v.datName,
      catBytes: v.catBytes,
      datBytes: v.datBytes,
      entries: v.entries.map((e) => ({
        name: e.name,
        size: e.size,
        expectedSha256: e.expectedSha256,
        timestamp: 0,
        content: typeof e.content === 'string' ? e.content : '',
      })),
    })),
    errors: plannedLayout.errors,
  };
  const layoutFile = path.join(scratch, 'pack-layout.json');
  fs.writeFileSync(layoutFile, JSON.stringify(rustLayout), 'utf8');
  execFileSync(bin, ['cat-pack', catOutDir, '--layout-file', layoutFile], { cwd: REPO_ROOT, windowsHide: true });

  const t0 = performance.now();
  const mcp = new McpClient(bin, ['mcp', '--mode', 'standalone']);
  const init = await mcp.request('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'oracle', version: '1' } });
  const coldMs = performance.now() - t0;
  assert.equal((init.result as { protocolVersion: string }).protocolVersion, '2024-11-05');
  mcp.notify('notifications/initialized', {});

  const ping = await mcp.request('ping');
  assert.deepEqual(ping.result, {});

  // Protocol negative checks
  const parseErr = await mcp.sendRaw('{invalid json', true);
  assert.equal(parseErr.error?.code, -32700);

  const methErr = await mcp.request('nonexistent/method');
  assert.equal(methErr.error?.code, -32601);

  const cursorErr = await mcp.request('tools/list', { cursor: 'page2' });
  assert.equal(cursorErr.error?.code, -32602);

  const unknownToolErr = await mcp.request('tools/call', { name: 'no_such_tool', arguments: {} });
  assert.equal(unknownToolErr.error?.code, -32602);

  // List all 7 native tools
  const listRes = await mcp.request('tools/list');
  const tools = (listRes.result as { tools: Array<{ name: string }> }).tools;
  for (const reqName of ['x4_validate_mod', 'x4_scan_corpus', 'x4_search_corpus', 'x4_hash_tree', 'x4_cat_list', 'x4_cat_extract', 'x4_inspect_document']) {
    assert(tools.some((t) => t.name === reqName), `Missing native tool ${reqName}`);
  }

  // Exercise all 7 native tools
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const r = await mcp.request('tools/call', { name, arguments: args });
    const res = r.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(res.isError, false, `${name} returned isError=true: ${res.content[0]?.text}`);
    return JSON.parse(res.content[0].text) as Record<string, unknown>;
  };

  const valOut = await callTool('x4_validate_mod', { modDir });
  assert.equal(valOut.passed, true);

  const scanOut = await callTool('x4_scan_corpus', { unpackedRoot: unpackedDir, summaryOnly: true });
  // x4-corpus indexes both `id` and `faction.<id>` in factions
  assert.equal(scanOut.factions, 4);

  const searchOut = await callTool('x4_search_corpus', { query: 'arg', kind: 'faction', unpackedRoot: unpackedDir });
  assert.equal(searchOut.totalMatched, 2);

  const hashOut = await callTool('x4_hash_tree', { root: modDir });
  assert.equal(hashOut.ok, true);

  const catPath = path.join(catOutDir, 'ext_01.cat');
  const datPath = path.join(catOutDir, 'ext_01.dat');
  const catListOut = await callTool('x4_cat_list', { catPath });
  assert.equal(catListOut.totalEntries, 1);

  const catExtOut = await callTool('x4_cat_extract', { catPath, datPath, entryName: 'content.xml' });
  assert.equal(catExtOut.content, payloadText);

  const inspectOut = await callTool('x4_inspect_document', { path: path.join(modDir, 'md', 'main.xml') });
  assert((inspectOut.symbolCount as number) >= 2);

  const code = await mcp.close();
  assert.equal(code, 0);
  return coldMs;
}

async function verifyMcpProxyAndSecurityE2E(bin: string, scratch: string): Promise<void> {
  // Ephemeral local loopback Forge mock
  const server = http.createServer((req, res) => {
    if (req.url === '/api/agent/capabilities' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        contractHash: 'slice2-hash-001',
        capabilities: [
          {
            id: 'mock.echo',
            version: 1,
            description: 'Mock echo capability',
            inputSchema: { type: 'object', properties: { msg: { type: 'string' }, enforced: { type: 'string' } } },
            api: [{ method: 'POST', path: '/api/mock/echo', inputLocation: 'body', role: 'primary', fixedBody: { enforced: 'server-pinned' } }],
            surfaces: { mcp: [{ id: 'forge_mock_echo', status: 'connected' }] },
          },
          {
            id: 'mock.redirect',
            version: 1,
            description: 'Mock redirect trap',
            inputSchema: { type: 'object', properties: {} },
            api: [{ method: 'GET', path: '/api/mock/redirect', inputLocation: 'query', role: 'primary' }],
            surfaces: { mcp: [{ id: 'forge_mock_redirect', status: 'connected' }] },
          },
        ],
      }));
      return;
    }
    if (req.url === '/api/mock/echo' && req.method === 'POST') {
      assert.equal(req.headers.authorization, 'Bearer test-secret');
      assert.equal(req.headers['x-workspace-id'], 'ws-slice2');
      assert.equal(req.headers['x-forge-channel'], 'mcp');
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: body }));
      });
      return;
    }
    if (req.url === '/api/mock/redirect' && req.method === 'GET') {
      res.writeHead(302, { Location: 'http://127.0.0.1:9/' });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  try {
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const mcp = new McpClient(bin, ['mcp', '--mode', 'proxy', '--url', baseUrl, '--key', 'test-secret', '--workspace-id', 'ws-slice2']);
    await mcp.request('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'oracle', version: '1' } });
    const listRes = await mcp.request('tools/list');
    const tools = (listRes.result as { tools: Array<{ name: string; _meta?: Record<string, unknown> }> }).tools;
    const echoTool = tools.find((t) => t.name === 'forge_mock_echo');
    assert(echoTool, 'Expected dynamically discovered forge_mock_echo tool');
    assert.equal(echoTool._meta?.['x4forge/capabilityId'], 'mock.echo');
    assert.equal(echoTool._meta?.['x4forge/contractHash'], 'slice2-hash-001');

    // Enforce fixedBody overrides tampered caller input
    const callRes = await mcp.request('tools/call', {
      name: 'forge_mock_echo',
      arguments: { msg: 'hi', enforced: 'tampered' },
    });
    const echoPayload = callRes.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(echoPayload.isError, false);
    const bodyObj = JSON.parse(echoPayload.content[0].text) as { received: { msg: string; enforced: string } };
    assert.equal(bodyObj.received.msg, 'hi');
    assert.equal(bodyObj.received.enforced, 'server-pinned');

    // Enforce redirect: error
    const redirRes = await mcp.request('tools/call', {
      name: 'forge_mock_redirect',
      arguments: {},
    });
    const redirPayload = redirRes.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(redirPayload.isError, true);
    assert(redirPayload.content[0].text.toLowerCase().includes('redirect'));

    await mcp.close();

    // Negative check: non-loopback SSRF refusal on startup
    const ssrf = spawnSync(bin, ['mcp', '--mode', 'proxy', '--url', 'https://evil.example.com'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(ssrf.status, 2, `Expected exit 2 on SSRF URL, got ${ssrf.status}`);
    assert(ssrf.stderr.includes('Refusing non-loopback Forge URL'), `Expected SSRF refusal stderr, got: ${ssrf.stderr}`);

    // Negative check: isolated-host discovery refusal when X4FORGE_ALLOW_ISOLATED_HOST=0
    const discDir = path.join(scratch, 'isolated-disc');
    fs.mkdirSync(discDir, { recursive: true });
    fs.writeFileSync(path.join(discDir, 'latest.json'), JSON.stringify({ url: baseUrl, hostMode: 'dev-build' }), 'utf8');
    const discMcp = new McpClient(bin, ['mcp', '--mode', 'proxy', '--discovery-dir', discDir], {
      X4FORGE_URL: undefined,
      X4FORGE_KEY: undefined,
      X4FORGE_WORKSPACE_ID: undefined,
      X4FORGE_ALLOW_ISOLATED_HOST: '0',
    });
    const discList = await discMcp.request('tools/list');
    assert.equal(discList.error?.code, -32603);
    assert(discList.error?.message.includes('Refusing isolated Forge host mode'));
    await discMcp.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function runOptionalLiveCorpusBenchmark(bin: string): Promise<void> {
  const candidates = [
    process.env.X4_REFERENCE_ROOT?.trim(),
    'G:\\F-rescue-2026-09-26\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00',
  ].filter((x): x is string => Boolean(x));
  const liveRoot = candidates.find((p) => fs.existsSync(p));
  if (!liveRoot) {
    console.log('Slice 2 live X4 9.00 benchmark: skipped (unpacked corpus not present in CI)');
    return;
  }
  const t0 = performance.now();
  const mcp = new McpClient(bin, ['mcp', '--mode', 'standalone', '--unpacked', liveRoot]);
  await mcp.request('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'bench', version: '1' } });
  const scanRes = await mcp.request('tools/call', { name: 'x4_scan_corpus', arguments: { summaryOnly: true } });
  const scanMs = performance.now() - t0;
  const search0 = performance.now();
  const searchRes = await mcp.request('tools/call', { name: 'x4_search_corpus', arguments: { query: 'argon', kind: 'faction' } });
  const searchMs = performance.now() - search0;
  await mcp.close();
  assert.equal((scanRes.result as { isError: boolean }).isError, false);
  assert.equal((searchRes.result as { isError: boolean }).isError, false);
  console.log(`Slice 2 live X4 9.00 MCP benchmark: scan=${scanMs.toFixed(1)}ms search=${searchMs.toFixed(2)}ms`);
}

async function main(): Promise<void> {
  const bin = resolveRustX4ForgeBin();
  assert(bin, 'Built x4forge binary not found; run `npm run build:rust` first.');
  const scratch = physicalTmpRoot();
  try {
    const lspColdMs = await verifyLspE2E(bin, scratch);
    const mcpColdMs = await verifyMcpStandaloneE2E(bin, scratch);
    await verifyMcpProxyAndSecurityE2E(bin, scratch);
    await runOptionalLiveCorpusBenchmark(bin);
    console.log(
      `rust-slice2-oracle PASS | lsp_cold=${lspColdMs.toFixed(1)}ms | mcp_cold=${mcpColdMs.toFixed(1)}ms`,
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('rust-slice2-oracle FAIL:', err);
  process.exit(1);
});
