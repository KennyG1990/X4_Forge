#!/usr/bin/env tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Option A Extension-Webview Visual Inspection Harness (`npm run inspect:ui`).
 *
 * Launches an isolated Forge backend (`dist/server.cjs` or `x4forge serve`) or
 * attaches to an existing loopback Forge URL, wraps it inside the exact
 * `webviewHtml` iframe + CSP + `postMessage` shell from
 * `vscode-extension/src/extension.ts`, captures clean & annotated screenshots
 * across viewports/views, and emits a deterministic DOM + geometry audit JSON.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Frame, type Page, type Request } from '@playwright/test';
import { ACTION_OPERATION_ID_HEADER, createActionOperationId } from '../shared/actionOperationId';
import { buildTemplateWorkspace } from '../src/lib/modTemplates';
import type { WorkspaceView } from '../src/lib/experienceMode';
import {
  DEFAULT_STUDIO_LAYOUT,
  SIDEBAR_NAV_ITEMS,
  STUDIO_LAYOUT_KEY,
  WORKSPACE_NAV_ITEMS,
  type SidebarTab,
} from '../src/lib/studioLayout';
import { resolveRustX4ForgeBin } from '../src/server/rustAccelerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const ALLOWED_STUDIO_MESSAGES = [
  'open-workspace-file',
  'open-validated-source',
  'open-bound-workspace-file',
  'open-text-diff',
  'open-node-selection',
  'node-selection-result',
  'open-external-url',
  'release-native-action',
  'workspace-authority-changed',
] as const;

export const ALLOWED_HOST_FORWARD_MESSAGES = [
  'apply-node-selection',
  'release-native-result',
] as const;

const PROTECTED_LIVE_PORTS = new Set([3000, 3001]);
const VALID_VIEW_IDS = new Set<string>(WORKSPACE_NAV_ITEMS.map((item) => item.id));
const VALID_SIDEBAR_IDS = new Set<string>(SIDEBAR_NAV_ITEMS.map((item) => item.id));
const DEFAULT_VIEWS: WorkspaceView[] = ['blueprint', 'ui-designer', 'project'];
const LOCAL_CORPUS_FALLBACK = 'G:\\F-rescue-2026-09-26\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00';

export class CliUsageError extends Error {
  public readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export type InspectEngine = 'node' | 'rust' | 'attach';
export type InspectShellMode = 'extension' | 'direct';
export type InspectExperienceMode = 'expert' | 'guided';

export interface ViewportSpec {
  width: number;
  height: number;
  label: string;
}

export interface InspectCliOptions {
  engine: InspectEngine;
  url: string | null;
  shell: InspectShellMode;
  views: WorkspaceView[];
  sidebar: SidebarTab[];
  menu: boolean;
  selector: string | null;
  viewports: ViewportSpec[];
  mode: InspectExperienceMode;
  template: string;
  annotate: boolean;
  outDir: string;
  failOnError: boolean;
  failOnLayout: boolean;
  json: boolean;
  selftest: boolean;
  selftestUnit: boolean;
  help: boolean;
}

export interface DomRectBox {
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface InspectedElement {
  index: number;
  domId: number;
  ancestorDomIds: number[];
  tag: string;
  role: string | null;
  testId: string | null;
  workspaceView: string | null;
  sidebarTab: string | null;
  text: string;
  ariaLabel: string | null;
  title: string | null;
  isInteractive: boolean;
  clipContainerId: string;
  insideScrollableX: boolean;
  insideScrollableY: boolean;
  rect: DomRectBox;
  clientWidth: number;
  scrollWidth: number;
  overflowX: string;
  textOverflow: string;
  computedStyle?: Record<string, string>;
}

export interface DefectItem {
  index: number;
  tag: string;
  testId: string | null;
  text: string;
  reason: string;
  rect: DomRectBox;
}

export interface OverlapDefect {
  firstIndex: number;
  secondIndex: number;
  firstLabel: string;
  secondLabel: string;
  intersection: DomRectBox;
}

export interface GeometryAuditResult {
  horizontalOverflow: boolean;
  overflowPx: number;
  offscreenControls: DefectItem[];
  clippedText: DefectItem[];
  truncatedEllipsisCount: number;
  overlappingInteractive: OverlapDefect[];
  totalDefects: number;
}

export interface GeometrySnapshotInput {
  viewport: { width: number; height: number };
  docScrollWidth: number;
  docScrollHeight: number;
  elements: InspectedElement[];
}

export interface CaptureRecord {
  id: string;
  kind: 'view' | 'sidebar' | 'menu' | 'selector';
  viewport: string;
  target: string;
  screenshotPath: string;
  annotatedPath: string | null;
  elementCount: number;
  interactiveCount: number;
  geometry: GeometryAuditResult;
  shell: {
    frameRect: DomRectBox | null;
    badgeText: string | null;
    noticeHidden: boolean;
    cspViolations: string[];
  };
  selectorMatches?: Array<{
    text: string;
    rect: DomRectBox;
    computedStyle: Record<string, string>;
  }>;
  notes: string[];
}

export interface InspectionReport {
  schemaVersion: 'forge.ui-inspect.v1';
  generatedAt: string;
  engine: InspectEngine;
  shell: InspectShellMode;
  mode: InspectExperienceMode;
  forgeUrl: string;
  shellUrl: string;
  outDir: string;
  captures: CaptureRecord[];
  runtimeErrors: {
    consoleErrors: string[];
    pageErrors: string[];
    requestFailures: string[];
    httpServerErrors: Array<{ url: string; status: number }>;
    httpClientResponses: Array<{ url: string; status: number }>;
    cspViolations: string[];
  };
  summary: {
    captureCount: number;
    totalRuntimeErrors: number;
    totalHttp4xx: number;
    totalLayoutDefects: number;
  };
}

function physicalTempBase(): string {
  return fs.realpathSync.native(os.tmpdir());
}

function defaultOutDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(physicalTempBase(), `x4-forge-ui-inspect-${stamp}`);
}

export function validateLoopbackHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new CliUsageError(`Invalid --url '${rawUrl}': expected an http://127.0.0.1:<port> URL.`);
  }
  if (parsed.protocol !== 'http:') {
    throw new CliUsageError(
      `Refusing non-http --url '${rawUrl}': only loopback http://127.0.0.1, http://localhost, or http://[::1] is allowed.`,
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]' && host !== '::1') {
    throw new CliUsageError(
      `Refusing non-loopback --url host '${parsed.hostname}': only 127.0.0.1, localhost, or ::1 is permitted.`,
    );
  }
  if (!parsed.port) {
    throw new CliUsageError(`Invalid --url '${rawUrl}': an explicit port is required.`);
  }
  return parsed.origin;
}

export function parseViewportList(raw: string): ViewportSpec[] {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new CliUsageError(`Invalid --viewport '${raw}': provide at least one WxH entry (e.g. 1280x800).`);
  }
  return items.map((item) => {
    const m = /^(\d+)x(\d+)$/i.exec(item);
    if (!m) {
      throw new CliUsageError(`Invalid --viewport item '${item}': expected <width>x<height> (e.g. 1280x800).`);
    }
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || width > 3840 || height < 320 || height > 2160) {
      throw new CliUsageError(
        `Invalid --viewport bounds '${item}': width must be 320..3840 and height must be 320..2160.`,
      );
    }
    return { width, height, label: `${width}x${height}` };
  });
}

export function parseInspectArgs(argv: readonly string[]): InspectCliOptions {
  let engineExplicit = false;
  let engine: InspectEngine = 'node';
  let url: string | null = null;
  let shell: InspectShellMode = 'extension';
  let views: WorkspaceView[] = [...DEFAULT_VIEWS];
  let sidebar: SidebarTab[] = [];
  let menu = false;
  let selector: string | null = null;
  let viewports: ViewportSpec[] = [{ width: 1280, height: 800, label: '1280x800' }];
  let mode: InspectExperienceMode = 'expert';
  let template = 'welcome';
  let annotate = true;
  let outDir = defaultOutDir();
  let failOnError = false;
  let failOnLayout = false;
  let json = false;
  let selftest = false;
  let selftestUnit = false;
  let help = false;

  const takeValue = (idx: number, flag: string): string => {
    if (idx + 1 >= argv.length) {
      throw new CliUsageError(`Missing value for ${flag}.`);
    }
    return argv[idx + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--selftest') selftest = true;
    else if (arg === '--selftest-unit') selftestUnit = true;
    else if (arg === '--menu') menu = true;
    else if (arg === '--annotate') annotate = true;
    else if (arg === '--no-annotate') annotate = false;
    else if (arg === '--fail-on-error') failOnError = true;
    else if (arg === '--fail-on-layout') failOnLayout = true;
    else if (arg === '--json') json = true;
    else if (arg === '--engine') {
      const val = takeValue(i++, arg);
      if (val !== 'node' && val !== 'rust' && val !== 'attach') {
        throw new CliUsageError(`Invalid --engine '${val}': expected node, rust, or attach.`);
      }
      engine = val;
      engineExplicit = true;
    } else if (arg === '--url') {
      url = validateLoopbackHttpUrl(takeValue(i++, arg));
      if (!engineExplicit) engine = 'attach';
    } else if (arg === '--shell') {
      const val = takeValue(i++, arg);
      if (val !== 'extension' && val !== 'direct') {
        throw new CliUsageError(`Invalid --shell '${val}': expected extension or direct.`);
      }
      shell = val;
    } else if (arg === '--views') {
      const raw = takeValue(i++, arg);
      if (raw.trim().toLowerCase() === 'all') {
        views = WORKSPACE_NAV_ITEMS.map((item) => item.id);
      } else {
        const parsed = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parsed.length === 0) {
          throw new CliUsageError('Invalid --views: supply at least one view ID or "all".');
        }
        for (const v of parsed) {
          if (!VALID_VIEW_IDS.has(v)) {
            throw new CliUsageError(
              `Unknown workspace view '${v}'. Valid views: ${Array.from(VALID_VIEW_IDS).join(', ')}.`,
            );
          }
        }
        views = parsed as WorkspaceView[];
      }
    } else if (arg === '--sidebar') {
      const raw = takeValue(i++, arg);
      const parsed = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of parsed) {
        if (!VALID_SIDEBAR_IDS.has(s)) {
          throw new CliUsageError(
            `Unknown sidebar tab '${s}'. Valid tabs: ${Array.from(VALID_SIDEBAR_IDS).join(', ')}.`,
          );
        }
      }
      sidebar = parsed as SidebarTab[];
    } else if (arg === '--selector') {
      selector = takeValue(i++, arg).trim();
      if (!selector) throw new CliUsageError('Invalid --selector: expected a non-empty CSS selector.');
    } else if (arg === '--viewport') {
      viewports = parseViewportList(takeValue(i++, arg));
    } else if (arg === '--mode') {
      const val = takeValue(i++, arg);
      if (val !== 'expert' && val !== 'guided') {
        throw new CliUsageError(`Invalid --mode '${val}': expected expert or guided.`);
      }
      mode = val;
    } else if (arg === '--template') {
      template = takeValue(i++, arg).trim() || 'welcome';
    } else if (arg === '--out') {
      const rawOut = takeValue(i++, arg).trim();
      if (!rawOut) throw new CliUsageError('Invalid --out path.');
      outDir = path.resolve(rawOut);
    } else {
      throw new CliUsageError(`Unknown or unsupported argument: ${arg}`);
    }
  }

  if (engine === 'attach' && !url && !selftest && !selftestUnit && !help) {
    throw new CliUsageError('--engine attach requires --url <http://127.0.0.1:PORT>.');
  }

  return {
    engine,
    url,
    shell,
    views,
    sidebar,
    menu,
    selector,
    viewports,
    mode,
    template,
    annotate,
    outDir,
    failOnError,
    failOnLayout,
    json,
    selftest,
    selftestUnit,
    help,
  };
}

function printHelp(): void {
  console.log([
    'X4 Forge Extension-Webview Visual Inspection Harness (Option A)',
    '',
    'Usage:',
    '  npm run inspect:ui -- [options]',
    '',
    'Options:',
    '  --engine <node|rust|attach>   Backend target (default: node, or attach if --url given)',
    '  --url <http://127.0.0.1:PORT> Attach to running loopback Forge server',
    '  --shell <extension|direct>    Wrap in exact extension webview iframe or load directly (default: extension)',
    '  --views <csv|all>             Workspace views to capture (default: blueprint,ui-designer,project)',
    '  --sidebar <csv>               Sidebar tabs to capture (e.g. script,cues,diagnostics)',
    '  --menu                        Also capture opened Studio Actions Menu',
    '  --selector <css>              Crop screenshot + inspect computed style for selector in Forge frame',
    '  --viewport <WxH[,WxH...]>     One or more viewports (default: 1280x800)',
    '  --mode <expert|guided>        Studio experience mode (default: expert)',
    '  --template <id|none>          Template workspace to seed when booting Node sidecar (default: welcome)',
    '  --annotate / --no-annotate    Capture numbered bounding-box + defect overlays (default: on)',
    '  --out <dir>                   Output directory for PNGs + report.json (default: temp dir)',
    '  --fail-on-error               Exit 1 on console errors, page errors, CSP violations, or API >= 400',
    '  --fail-on-layout              Exit 1 on horizontal overflow, offscreen controls, clipping, or overlaps',
    '  --json                        Print JSON summary to stdout',
    '  --selftest-unit               Run hermetic shell parity + geometry analyzer unit tests (no Chromium)',
    '  --selftest                    Run unit tests + live Chromium visual inspection selftest',
  ].join('\n'));
}

export function buildExtensionWebviewHtml(forgeUrl: string, modeLabel: string, frameId: string, nonceOverride?: string): string {
  const nonce = nonceOverride ?? crypto.randomBytes(18).toString('base64');
  const forgeOrigin = new URL(forgeUrl).origin;
  const csp = [
    "default-src 'none'",
    'frame-src http://127.0.0.1:* http://localhost:*',
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const allowedStudio = JSON.stringify(ALLOWED_STUDIO_MESSAGES);
  const allowedHost = JSON.stringify(ALLOWED_HOST_FORWARD_MESSAGES);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0c0e12; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
    .badge { position: fixed; right: 10px; top: 38px; z-index: 2; padding: 3px 8px; border-radius: 5px; background: rgba(17, 20, 26, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); font: 11px system-ui, sans-serif; color: #cbd5e1; pointer-events: none; }
    #backend-notice { position: fixed; top: 0; left: 0; right: 0; z-index: 1; padding: 8px; color: #fff; background: #452912; font: 13px sans-serif; }
  </style>
</head>
<body>
  <iframe id="forge-frame" src="${forgeUrl}/" allow="clipboard-read; clipboard-write"></iframe>
  <div class="badge" id="forge-badge" hidden>X4 Forge Studio — ${modeLabel}</div>
  <div id="backend-notice" role="status" hidden></div>
  <script nonce="${nonce}">
    const __inspectHostState = {
      state: undefined,
      outboundMessages: [],
      cspViolations: [],
    };
    document.addEventListener('securitypolicyviolation', (ev) => {
      __inspectHostState.cspViolations.push(ev.violatedDirective + ': ' + (ev.blockedURI || ev.sourceFile || 'inline'));
    });
    function acquireVsCodeApi() {
      return {
        postMessage(msg) { __inspectHostState.outboundMessages.push(msg); },
        getState() { return __inspectHostState.state; },
        setState(next) { __inspectHostState.state = next; return next; },
      };
    }
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById('forge-frame');
    const badge = document.getElementById('forge-badge');
    const notice = document.getElementById('backend-notice');
    const frameId = ${JSON.stringify(frameId)};
    const forgeOrigin = ${JSON.stringify(forgeOrigin)};
    window.addEventListener('message', (event) => {
      if (!notice.hidden || event.source !== frame.contentWindow || event.origin !== forgeOrigin) return;
      const data = event.data;
      if (!data || data.source !== 'x4forge-studio' || !${allowedStudio}.includes(data.type)) return;
      vscode.postMessage({ ...data, frameId });
    });
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (data?.source === 'x4forge-native-host' && data.type === 'backend-offline') {
        if (event.source === frame.contentWindow || data.frameId !== frameId) return;
        if (badge) {
          badge.textContent = 'X4 Forge Studio — backend stopped';
          badge.hidden = false;
        }
        notice.textContent = data.message;
        notice.hidden = false;
        return;
      }
      if (!data || data.source !== 'x4forge-native-host' || !${allowedHost}.includes(data.type)) return;
      frame.contentWindow.postMessage(data, forgeOrigin);
    });
    window.__x4InspectHost = {
      getState: () => __inspectHostState,
      simulateBackendOffline: (message) => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { source: 'x4forge-native-host', type: 'backend-offline', frameId, message },
        }));
      },
      simulateHostMessage: (payload) => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { source: 'x4forge-native-host', ...payload },
        }));
      },
    };
  </script>
</body>
</html>`;
}

export function analyzeGeometryDefects(input: GeometrySnapshotInput): GeometryAuditResult {
  const overflowPx = Math.max(0, Math.round(input.docScrollWidth - input.viewport.width));
  const horizontalOverflow = input.docScrollWidth > input.viewport.width + 2;

  const offscreenControls: DefectItem[] = [];
  const clippedText: DefectItem[] = [];
  let truncatedEllipsisCount = 0;

  for (const el of input.elements) {
    if (el.isInteractive) {
      const outX = !el.insideScrollableX && (el.rect.left < -2 || el.rect.right > input.viewport.width + 2);
      const outY = !el.insideScrollableY && (el.rect.top < -2 || el.rect.bottom > input.viewport.height + 2);
      if (outX || outY) {
        const reasons: string[] = [];
        if (el.rect.left < -2) reasons.push(`left=${Math.round(el.rect.left)}`);
        if (el.rect.right > input.viewport.width + 2) reasons.push(`right=${Math.round(el.rect.right)}>${input.viewport.width}`);
        if (el.rect.top < -2) reasons.push(`top=${Math.round(el.rect.top)}`);
        if (el.rect.bottom > input.viewport.height + 2) reasons.push(`bottom=${Math.round(el.rect.bottom)}>${input.viewport.height}`);
        offscreenControls.push({
          index: el.index,
          tag: el.tag,
          testId: el.testId,
          text: el.text || el.ariaLabel || el.title || '',
          reason: `offscreen (${reasons.join(', ')})`,
          rect: el.rect,
        });
      }
    }

    if (el.text.length > 0 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      if (el.textOverflow === 'ellipsis') {
        truncatedEllipsisCount += 1;
      } else if (el.overflowX === 'hidden' || el.overflowX === 'clip') {
        clippedText.push({
          index: el.index,
          tag: el.tag,
          testId: el.testId,
          text: el.text,
          reason: `text clipped (${el.scrollWidth}px > ${el.clientWidth}px, overflow-x=${el.overflowX})`,
          rect: el.rect,
        });
      }
    }
  }

  const interactive = input.elements.filter(
    (el) => el.isInteractive && el.rect.width >= 8 && el.rect.height >= 8,
  );
  const overlappingInteractive: OverlapDefect[] = [];
  for (let i = 0; i < interactive.length; i++) {
    const a = interactive[i];
    const aAncestors = new Set(a.ancestorDomIds);
    for (let j = i + 1; j < interactive.length; j++) {
      const b = interactive[j];
      if (a.clipContainerId !== b.clipContainerId) continue;
      if (aAncestors.has(b.domId) || b.ancestorDomIds.includes(a.domId)) continue;
      const ixLeft = Math.max(a.rect.left, b.rect.left);
      const ixTop = Math.max(a.rect.top, b.rect.top);
      const ixRight = Math.min(a.rect.right, b.rect.right);
      const ixBottom = Math.min(a.rect.bottom, b.rect.bottom);
      const ixW = ixRight - ixLeft;
      const ixH = ixBottom - ixTop;
      if (ixW >= 4 && ixH >= 4) {
        overlappingInteractive.push({
          firstIndex: a.index,
          secondIndex: b.index,
          firstLabel: a.testId || a.text || a.ariaLabel || a.tag,
          secondLabel: b.testId || b.text || b.ariaLabel || b.tag,
          intersection: {
            x: ixLeft,
            y: ixTop,
            left: ixLeft,
            top: ixTop,
            right: ixRight,
            bottom: ixBottom,
            width: ixW,
            height: ixH,
          },
        });
      }
    }
  }

  const totalDefects =
    (horizontalOverflow ? 1 : 0) +
    offscreenControls.length +
    clippedText.length +
    overlappingInteractive.length;

  return {
    horizontalOverflow,
    overflowPx,
    offscreenControls,
    clippedText,
    truncatedEllipsisCount,
    overlappingInteractive,
    totalDefects,
  };
}

async function allocateSafeLoopbackPort(): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = await new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        const picked = addr && typeof addr !== 'string' ? addr.port : 0;
        srv.close((err) => {
          if (err) reject(err);
          else resolve(picked);
        });
      });
    });
    if (port > 0 && !PROTECTED_LIVE_PORTS.has(port)) return port;
  }
  throw new Error('Failed allocating an ephemeral loopback port outside 3000/3001.');
}

function detectReferenceRoot(): string | undefined {
  const candidates = [process.env.X4_REFERENCE_ROOT?.trim(), LOCAL_CORPUS_FALLBACK].filter(
    (x): x is string => Boolean(x),
  );
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

interface StartedBackend {
  baseUrl: string;
  token: string;
  modeLabel: string;
  stop: () => Promise<void>;
}

async function waitForHttpReady(baseUrl: string, child: ChildProcess, stderrChunks: string[], timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early with code ${child.exitCode}: ${stderrChunks.join('')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/agent/schema`);
      if (res.ok) return;
    } catch {
      // retry until ready
    }
    await new Promise<void>((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/agent/schema; stderr=${stderrChunks.join('')}`);
}

async function terminateProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill();
  await Promise.race([exited, new Promise<void>((r) => setTimeout(r, 3000))]);
}

async function seedNodeWorkspace(baseUrl: string, token: string, templateId: string): Promise<void> {
  const clientId = 'client_ui_inspect_0001';
  const bootRes = await fetch(`${baseUrl}/api/agent/workspaces/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-client-id': clientId,
    },
    body: JSON.stringify({ clientId }),
  });
  const bootJson = (await bootRes.json()) as { workspaceId?: string };
  if (!bootRes.ok || !bootJson.workspaceId) {
    throw new Error(`Bootstrap workspace failed (${bootRes.status}): ${JSON.stringify(bootJson)}`);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-client-id': clientId,
    'x-workspace-id': String(bootJson.workspaceId),
    [ACTION_OPERATION_ID_HEADER]: createActionOperationId((n) => crypto.randomBytes(n)),
  };

  const wsPayload = buildTemplateWorkspace(templateId);
  const wsRes = await fetch(`${baseUrl}/api/agent/workspace`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspace: wsPayload, force: true }),
  });
  if (!wsRes.ok) {
    throw new Error(`Seed workspace failed (${wsRes.status}): ${await wsRes.text()}`);
  }

  const layoutRes = await fetch(`${baseUrl}/api/studio/layout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ layout: DEFAULT_STUDIO_LAYOUT }),
  });
  if (!layoutRes.ok) {
    throw new Error(`Seed layout failed (${layoutRes.status}): ${await layoutRes.text()}`);
  }
}

async function startNodeSidecar(scratch: string, template: string): Promise<StartedBackend> {
  const serverCjs = path.join(REPO_ROOT, 'dist', 'server.cjs');
  const indexHtml = path.join(REPO_ROOT, 'dist', 'index.html');
  if (!fs.existsSync(serverCjs) || !fs.existsSync(indexHtml)) {
    throw new Error('Compiled bundle missing (dist/server.cjs or dist/index.html). Run `npm run build` first.');
  }
  const port = await allocateSafeLoopbackPort();
  const token = `x4inspect_${crypto.randomBytes(24).toString('hex')}`;
  const stateDir = path.join(scratch, 'node-state');
  fs.mkdirSync(path.join(stateDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'discovery'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'source-coordination'), { recursive: true });

  const refRoot = detectReferenceRoot();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    API_ONLY: 'false',
    PORT: String(port),
    STUDIO_API_TOKEN: token,
    DISABLE_HMR: 'true',
    X4_STATE_DIR: stateDir,
    X4_CONFIG_DIR: stateDir,
    X4_DATA_DIR: path.join(stateDir, 'data'),
    X4_SOURCE_COORDINATION_DIR: path.join(stateDir, 'source-coordination'),
    X4FORGE_DISCOVERY_DIR: path.join(stateDir, 'discovery'),
  };
  if (refRoot) env.X4_REFERENCE_ROOT = refRoot;
  else delete env.X4_REFERENCE_ROOT;

  const stderrChunks: string[] = [];
  const child = spawn(process.execPath, [serverCjs], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c.toString('utf8')));
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttpReady(baseUrl, child, stderrChunks);

  if (template !== 'none') {
    await seedNodeWorkspace(baseUrl, token, template);
  }

  return {
    baseUrl,
    token,
    modeLabel: `managed sidecar on port ${port}`,
    stop: () => terminateProcess(child),
  };
}

async function startRustSidecar(scratch: string): Promise<StartedBackend> {
  const bin = resolveRustX4ForgeBin();
  if (!bin) {
    throw new Error('Built x4forge binary not found; run `npm run build:rust` first.');
  }
  const distDir = path.join(REPO_ROOT, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Production static UI bundle missing (dist/index.html). Run `npm run build` first.');
  }
  const dataDir = path.join(scratch, 'rust-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const token = `x4inspect_${crypto.randomBytes(24).toString('hex')}`;
  const args = [
    'serve',
    '--port',
    '0',
    '--ready-json',
    '--no-discovery',
    '--data-dir',
    dataDir,
    '--static-dir',
    distDir,
    '--token',
    token,
  ];
  const refRoot = detectReferenceRoot();
  if (refRoot) {
    args.push('--unpacked', refRoot);
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.STUDIO_API_TOKEN;
  delete env.X4_REFERENCE_ROOT;

  const stderrChunks: string[] = [];
  const child = spawn(bin, args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c.toString('utf8')));

  const ready = await new Promise<{ port: number; url: string }>((resolve, reject) => {
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`Timed out waiting for x4forge serve ready JSON; stderr=${stderrChunks.join('')}`));
      }
    }, 20_000);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\n');
      if (idx >= 0 && !settled) {
        const line = buf.slice(0, idx).replace(/\r$/, '').trim();
        if (line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line) as { ready?: boolean; port?: number; url?: string };
            if (parsed.ready && parsed.port && parsed.url) {
              settled = true;
              clearTimeout(timer);
              child.stdout?.off('data', onData);
              resolve({ port: parsed.port, url: parsed.url });
            }
          } catch {
            // continue reading
          }
        }
      }
    };
    child.stdout?.on('data', onData);
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`x4forge serve exited before ready (${code}): ${stderrChunks.join('')}`));
      }
    });
  });

  return {
    baseUrl: ready.url,
    token,
    modeLabel: `managed rust sidecar on port ${ready.port}`,
    stop: () => terminateProcess(child),
  };
}

async function startExtensionShellServer(forgeUrl: string, modeLabel: string): Promise<{
  shellUrl: string;
  frameId: string;
  close: () => Promise<void>;
}> {
  const frameId = crypto.randomBytes(18).toString('hex');
  const html = buildExtensionWebviewHtml(forgeUrl, modeLabel, frameId);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed binding extension shell loopback server.');
  }
  return {
    shellUrl: `http://127.0.0.1:${addr.port}`,
    frameId,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function waitForForgeFrame(page: Page, forgeOrigin: string, shell: InspectShellMode, timeoutMs = 20_000): Promise<Frame> {
  if (shell === 'direct') {
    return page.mainFrame();
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = page.frames().find((f) => f.url().startsWith(forgeOrigin));
    if (match) return match;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for #forge-frame matching ${forgeOrigin}.`);
}

async function collectFrameSnapshot(frame: Frame, selectorFilter: string | null): Promise<{
  snapshot: GeometrySnapshotInput;
  selectorMatches: Array<{ text: string; rect: DomRectBox; computedStyle: Record<string, string> }>;
}> {
  return frame.evaluate((selFilter) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const docScrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    const docScrollHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);

    const domIds = new WeakMap<Element, number>();
    let nextDomId = 1;

    const querySelector = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[data-testid]',
      '[data-workspace-view]',
      '[data-sidebar-tab]',
      'h1',
      'h2',
      'h3',
      'label',
    ].join(', ');

    const rawEls = Array.from(document.querySelectorAll(querySelector));
    const elements: InspectedElement[] = [];

    let idx = 1;
    for (const el of rawEls) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) <= 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0.5 || r.height <= 0.5) continue;

      let elDomId = domIds.get(el);
      if (!elDomId) {
        elDomId = nextDomId++;
        domIds.set(el, elDomId);
      }

      const ancestorDomIds: number[] = [];
      let clipContainerId = 'root';
      let insideScrollableX = false;
      let insideScrollableY = false;

      let p: Element | null = el.parentElement;
      while (p) {
        let pid = domIds.get(p);
        if (!pid) {
          pid = nextDomId++;
          domIds.set(p, pid);
        }
        ancestorDomIds.push(pid);
        const pst = getComputedStyle(p);
        const ox = pst.overflowX;
        const oy = pst.overflowY;
        const isClipping = ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll' || oy === 'hidden' || oy === 'clip' || oy === 'auto' || oy === 'scroll';
        if (isClipping && clipContainerId === 'root') {
          clipContainerId = `c${pid}`;
        }
        if (p.getAttribute('data-pannable-surface') === 'true') {
          insideScrollableX = true;
          insideScrollableY = true;
        }
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 2) {
          insideScrollableX = true;
        }
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) {
          insideScrollableY = true;
        }
        p = p.parentElement;
      }

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const isInteractive =
        tag === 'button' ||
        tag === 'input' ||
        tag === 'select' ||
        tag === 'textarea' ||
        tag === 'a' ||
        role === 'button' ||
        role === 'tab' ||
        role === 'menuitem';

      const directText = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      elements.push({
        index: idx++,
        domId: elDomId,
        ancestorDomIds,
        tag,
        role,
        testId: el.getAttribute('data-testid'),
        workspaceView: el.getAttribute('data-workspace-view'),
        sidebarTab: el.getAttribute('data-sidebar-tab'),
        text: directText,
        ariaLabel: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        isInteractive,
        clipContainerId,
        insideScrollableX,
        insideScrollableY,
        rect: {
          x: r.x,
          y: r.y,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        },
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: st.overflowX,
        textOverflow: st.textOverflow,
      });
    }

    const selectorMatches: Array<{ text: string; rect: DomRectBox; computedStyle: Record<string, string> }> = [];
    if (selFilter) {
      for (const el of Array.from(document.querySelectorAll(selFilter)).slice(0, 10)) {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        selectorMatches.push({
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
          rect: {
            x: r.x,
            y: r.y,
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          },
          computedStyle: {
            display: st.display,
            position: st.position,
            fontSize: st.fontSize,
            color: st.color,
            backgroundColor: st.backgroundColor,
            overflowX: st.overflowX,
            overflowY: st.overflowY,
          },
        });
      }
    }

    return {
      snapshot: { viewport, docScrollWidth, docScrollHeight, elements },
      selectorMatches,
    };
  }, selectorFilter);
}

async function injectOverlay(
  frame: Frame,
  elements: InspectedElement[],
  geometry: GeometryAuditResult,
): Promise<void> {
  const targets = elements
    .filter((el) => el.isInteractive || el.testId !== null)
    .slice(0, 40)
    .map((el) => ({ index: el.index, left: el.rect.left, top: el.rect.top, width: el.rect.width, height: el.rect.height }));
  const defects = [
    ...geometry.offscreenControls.map((d) => ({ label: `OFFSCREEN #${d.index}`, left: Math.max(0, d.rect.left), top: Math.max(0, d.rect.top), width: d.rect.width, height: d.rect.height })),
    ...geometry.clippedText.map((d) => ({ label: `CLIPPED #${d.index}`, left: d.rect.left, top: d.rect.top, width: d.rect.width, height: d.rect.height })),
    ...geometry.overlappingInteractive.map((d) => ({ label: `OVERLAP #${d.firstIndex}/${d.secondIndex}`, left: d.intersection.left, top: d.intersection.top, width: Math.max(d.intersection.width, 24), height: Math.max(d.intersection.height, 14) })),
  ];

  await frame.evaluate(
    ({ boxes, bad }) => {
      document.getElementById('__x4_inspect_overlay')?.remove();
      const root = document.createElement('div');
      root.id = '__x4_inspect_overlay';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const b of boxes) {
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;border:1px solid rgba(56,189,248,0.85);background:rgba(56,189,248,0.06);box-sizing:border-box;`;
        const tag = document.createElement('span');
        tag.textContent = String(b.index);
        tag.style.cssText = 'position:absolute;left:0;top:0;font:600 9px/1 sans-serif;padding:1px 3px;background:#0284c7;color:#fff;';
        box.appendChild(tag);
        root.appendChild(box);
      }
      for (const d of bad) {
        const box = document.createElement('div');
        box.style.cssText = `position:fixed;left:${d.left}px;top:${d.top}px;width:${d.width}px;height:${d.height}px;border:2px dashed #ef4444;background:rgba(239,68,68,0.12);box-sizing:border-box;`;
        const tag = document.createElement('span');
        tag.textContent = d.label;
        tag.style.cssText = 'position:absolute;right:0;top:0;font:700 9px/1 sans-serif;padding:2px 4px;background:#dc2626;color:#fff;';
        box.appendChild(tag);
        root.appendChild(box);
      }
      document.body.appendChild(root);
    },
    { boxes: targets, bad: defects },
  );
}

async function removeOverlay(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    document.getElementById('__x4_inspect_overlay')?.remove();
  }).catch(() => undefined);
}

async function readShellDiagnostics(page: Page, shell: InspectShellMode): Promise<{
  frameRect: DomRectBox | null;
  badgeText: string | null;
  noticeHidden: boolean;
  cspViolations: string[];
}> {
  if (shell === 'direct') {
    return { frameRect: null, badgeText: null, noticeHidden: true, cspViolations: [] };
  }
  return page.evaluate(() => {
    const iframe = document.getElementById('forge-frame');
    const badge = document.getElementById('forge-badge');
    const notice = document.getElementById('backend-notice') as HTMLElement | null;
    const r = iframe?.getBoundingClientRect();
    const host = (window as unknown as { __x4InspectHost?: { getState: () => { cspViolations: string[] } } }).__x4InspectHost;
    return {
      frameRect: r
        ? { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
        : null,
      badgeText: badge?.textContent ?? null,
      noticeHidden: notice ? notice.hidden : true,
      cspViolations: host?.getState().cspViolations ?? [],
    };
  });
}

export async function waitForApiQuiet(
  inFlight: ReadonlySet<unknown>,
  maxWaitMs = 5_000,
  quietMs = 150,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  let quietSince: number | null = inFlight.size === 0 ? Date.now() : null;
  while (Date.now() < deadline) {
    if (inFlight.size === 0) {
      if (quietSince === null) quietSince = Date.now();
      if (Date.now() - quietSince >= quietMs) return true;
    } else {
      quietSince = null;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

async function settleLayout(frame: Frame, inFlightApiRequests?: ReadonlySet<unknown>): Promise<void> {
  await frame.waitForTimeout(150);
  if (inFlightApiRequests) {
    await waitForApiQuiet(inFlightApiRequests, 5_000, 150);
  }
  await frame.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))).catch(() => undefined);
}

export async function runVisualInspection(
  opts: InspectCliOptions,
  hooks?: { onShellReady?: (page: Page, frame: Frame) => Promise<void> },
): Promise<InspectionReport> {
  const scratch = fs.mkdtempSync(path.join(physicalTempBase(), 'x4-ui-inspect-work-'));
  fs.mkdirSync(opts.outDir, { recursive: true });

  let backend: StartedBackend;
  if (opts.engine === 'attach') {
    const attachedUrl = opts.url!;
    backend = {
      baseUrl: attachedUrl,
      token: '',
      modeLabel: `attached to ${attachedUrl}`,
      stop: async () => undefined,
    };
  } else if (opts.engine === 'rust') {
    backend = await startRustSidecar(scratch);
  } else {
    backend = await startNodeSidecar(scratch, opts.template);
  }

  const shellServer = opts.shell === 'extension'
    ? await startExtensionShellServer(backend.baseUrl, backend.modeLabel)
    : { shellUrl: backend.baseUrl, frameId: 'direct', close: async () => undefined };

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const inFlightApiRequests = new Set<Request>();
  const httpServerErrors: Array<{ url: string; status: number }> = [];
  const httpClientResponses: Array<{ url: string; status: number }> = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const firstVp = opts.viewports[0];
    const context = await browser.newContext({
      viewport: { width: firstVp.width, height: firstVp.height },
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Browser-synthesized duplicate for 4xx responses is tracked with exact URL+status in httpClientResponses.
      if (/^Failed to load resource: the server responded with a status of 4\d\d\b/.test(text)) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('request', (req) => {
      try {
        if (new URL(req.url()).pathname.startsWith('/api/')) {
          inFlightApiRequests.add(req);
        }
      } catch {
        /* ignore non-HTTP/data URLs */
      }
    });
    page.on('requestfinished', (req) => {
      inFlightApiRequests.delete(req);
    });
    page.on('requestfailed', (req) => {
      inFlightApiRequests.delete(req);
      requestFailures.push(`${req.method()} ${req.url()} (${req.failure()?.errorText ?? 'failed'})`);
    });
    page.on('response', (res) => {
      const status = res.status();
      if (status < 400 || !new URL(res.url()).pathname.startsWith('/api/')) return;
      if (status >= 500) httpServerErrors.push({ url: res.url(), status });
      else httpClientResponses.push({ url: res.url(), status });
    });

    const forgeOrigin = new URL(backend.baseUrl).origin;
    await page.addInitScript(
      ({ targetOrigin, modeVal, layoutKey, layoutVal }) => {
        if (window.location.origin !== targetOrigin) return;
        localStorage.setItem('x4_forge_experience_mode', modeVal);
        if (sessionStorage.getItem('__x4_ui_inspect_init') !== '1') {
          localStorage.setItem(layoutKey, JSON.stringify(layoutVal));
          sessionStorage.setItem('__x4_ui_inspect_init', '1');
        }
      },
      {
        targetOrigin: forgeOrigin,
        modeVal: opts.mode,
        layoutKey: STUDIO_LAYOUT_KEY,
        layoutVal: DEFAULT_STUDIO_LAYOUT,
      },
    );

    await page.goto(shellServer.shellUrl, { waitUntil: 'domcontentloaded' });
    const frame = await waitForForgeFrame(page, forgeOrigin, opts.shell);

    let studioMounted = true;
    if (opts.engine === 'rust') {
      await frame.waitForFunction(
        () => Boolean(
          document.querySelector('[data-testid="studio-header"], [data-testid="studio-workspace"]')
          || (document.getElementById('root')?.textContent?.trim().length ?? 0) > 0,
        ),
        undefined,
        { timeout: 20_000 },
      );
      studioMounted = await frame
        .locator('[data-testid="studio-header"], [data-testid="studio-workspace"]')
        .first()
        .isVisible()
        .catch(() => false);
    } else {
      await frame.locator('[data-testid="studio-header"], [data-testid="studio-workspace"]').first().waitFor({
        state: 'visible',
        timeout: 20_000,
      });
    }
    const rustBootstrapNotice = studioMounted
      ? null
      : await frame.evaluate(() => document.getElementById('root')?.textContent?.trim() ?? '');

    const healthDismiss = frame.getByTestId('health-card-dismiss');
    if (await healthDismiss.isVisible().catch(() => false)) {
      await healthDismiss.click().catch(() => undefined);
    }

    const captures: CaptureRecord[] = [];

    const captureTarget = async (
      kind: CaptureRecord['kind'],
      vpLabel: string,
      target: string,
      fileStem: string,
      notes: string[],
    ): Promise<void> => {
      if (rustBootstrapNotice) {
        notes.push(`Rust Slice 3A pre-bootstrap notice in #forge-frame: ${rustBootstrapNotice}`);
      }
      await settleLayout(frame, inFlightApiRequests);
      const { snapshot, selectorMatches } = await collectFrameSnapshot(frame, opts.selector);
      const geometry = analyzeGeometryDefects(snapshot);
      const shellDiag = await readShellDiagnostics(page, opts.shell);
      const interactiveCount = snapshot.elements.filter((e) => e.isInteractive).length;

      const cleanPath = path.join(opts.outDir, `${fileStem}.png`);
      await page.screenshot({ path: cleanPath });

      let annotatedPath: string | null = null;
      if (opts.annotate) {
        await injectOverlay(frame, snapshot.elements, geometry);
        try {
          annotatedPath = path.join(opts.outDir, `${fileStem}.annotated.png`);
          await page.screenshot({ path: annotatedPath });
        } finally {
          await removeOverlay(frame);
        }
      }

      if (opts.selector && selectorMatches.length > 0) {
        const cropPath = path.join(opts.outDir, `${fileStem}-selector.png`);
        await frame.locator(opts.selector).first().screenshot({ path: cropPath }).catch(() => undefined);
      }

      captures.push({
        id: fileStem,
        kind,
        viewport: vpLabel,
        target,
        screenshotPath: cleanPath,
        annotatedPath,
        elementCount: snapshot.elements.length,
        interactiveCount,
        geometry,
        shell: shellDiag,
        ...(opts.selector ? { selectorMatches } : {}),
        notes,
      });
    };

    for (const vp of opts.viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await settleLayout(frame, inFlightApiRequests);

      for (const viewId of opts.views) {
        const notes: string[] = [];
        const navBtn = frame.locator(`[data-workspace-view="${viewId}"]`).first();
        if (await navBtn.isVisible().catch(() => false)) {
          await navBtn.click();
        } else {
          notes.push(`Workspace view tab '${viewId}' is hidden at ${vp.label} / mode=${opts.mode}`);
        }
        await captureTarget('view', vp.label, viewId, `${vp.label}-${viewId}`, notes);
      }

      for (const tabId of opts.sidebar) {
        const notes: string[] = [];
        const tabBtn = frame.locator(`[data-sidebar-tab="${tabId}"]`).first();
        if (await tabBtn.isVisible().catch(() => false)) {
          await tabBtn.click();
        } else {
          notes.push(`Sidebar tab '${tabId}' is hidden at ${vp.label} / mode=${opts.mode}`);
        }
        await captureTarget('sidebar', vp.label, tabId, `${vp.label}-sidebar-${tabId}`, notes);
      }

      if (opts.menu) {
        const notes: string[] = [];
        const menuBtn = frame.getByTestId('studio-menu-button');
        if (await menuBtn.isVisible().catch(() => false)) {
          await menuBtn.click();
          await frame.getByTestId('studio-menu').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {
            notes.push('studio-menu did not become visible after clicking studio-menu-button');
          });
          await captureTarget('menu', vp.label, 'studio-menu', `${vp.label}-studio-menu`, notes);
          await page.keyboard.press('Escape');
        } else {
          notes.push(`studio-menu-button is not visible at ${vp.label}`);
        }
      }
    }

    if (hooks?.onShellReady) {
      await hooks.onShellReady(page, frame);
    }

    const finalShell = await readShellDiagnostics(page, opts.shell);
    const totalLayoutDefects = captures.reduce((acc, c) => acc + c.geometry.totalDefects, 0);
    const totalRuntimeErrors =
      consoleErrors.length + pageErrors.length + requestFailures.length + httpServerErrors.length + finalShell.cspViolations.length;

    const report: InspectionReport = {
      schemaVersion: 'forge.ui-inspect.v1',
      generatedAt: new Date().toISOString(),
      engine: opts.engine,
      shell: opts.shell,
      mode: opts.mode,
      forgeUrl: backend.baseUrl,
      shellUrl: shellServer.shellUrl,
      outDir: opts.outDir,
      captures,
      runtimeErrors: {
        consoleErrors,
        pageErrors,
        requestFailures,
        httpServerErrors,
        httpClientResponses,
        cspViolations: finalShell.cspViolations,
      },
      summary: {
        captureCount: captures.length,
        totalRuntimeErrors,
        totalHttp4xx: httpClientResponses.length,
        totalLayoutDefects,
      },
    };

    fs.writeFileSync(path.join(opts.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await context.close();
    return report;
  } finally {
    await browser.close();
    await shellServer.close();
    await backend.stop();
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function runUnitSelftest(): void {
  // 1. Loopback URL validation
  assert.equal(validateLoopbackHttpUrl('http://127.0.0.1:3456/foo'), 'http://127.0.0.1:3456');
  assert.equal(validateLoopbackHttpUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(validateLoopbackHttpUrl('http://[::1]:9000'), 'http://[::1]:9000');
  assert.throws(() => validateLoopbackHttpUrl('https://evil.example.com:443'), CliUsageError);
  assert.throws(() => validateLoopbackHttpUrl('http://192.168.1.10:3000'), CliUsageError);
  assert.throws(() => validateLoopbackHttpUrl('file:///etc/passwd'), CliUsageError);

  // 2. CLI parser defaults & negative validation
  const defaults = parseInspectArgs([]);
  assert.equal(defaults.engine, 'node');
  assert.equal(defaults.shell, 'extension');
  assert.deepEqual(defaults.views, DEFAULT_VIEWS);
  assert.deepEqual(defaults.viewports.map((v) => v.label), ['1280x800']);

  const attached = parseInspectArgs(['--url', 'http://127.0.0.1:3456', '--viewport', '1280x800,900x700', '--views', 'all', '--no-annotate']);
  assert.equal(attached.engine, 'attach');
  assert.equal(attached.viewports.length, 2);
  assert.equal(attached.views.length, WORKSPACE_NAV_ITEMS.length);
  assert.equal(attached.annotate, false);

  assert.throws(() => parseInspectArgs(['--views', 'no_such_view']), CliUsageError);
  assert.throws(() => parseInspectArgs(['--viewport', '10x10']), CliUsageError);
  assert.throws(() => parseInspectArgs(['--engine', 'attach']), CliUsageError);

  // 3. Exact parity with vscode-extension/src/extension.ts webviewHtml()
  const extSource = fs.readFileSync(path.join(REPO_ROOT, 'vscode-extension', 'src', 'extension.ts'), 'utf8');
  const html = buildExtensionWebviewHtml('http://127.0.0.1:3456', 'managed sidecar on port 3456', 'frame_abc', 'nonce_xyz');
  for (const needle of [
    "default-src 'none'",
    'frame-src http://127.0.0.1:* http://localhost:*',
    "style-src 'unsafe-inline'",
    'id="forge-frame"',
    'id="forge-badge"',
    'id="backend-notice"',
  ]) {
    assert(extSource.includes(needle), `extension.ts expected to contain ${needle}`);
    assert(html.includes(needle), `buildExtensionWebviewHtml missing ${needle}`);
  }
  assert(extSource.includes("script-src 'nonce-${nonce}'"), "extension.ts expected to contain script-src 'nonce-${nonce}'");
  assert(html.includes("script-src 'nonce-nonce_xyz'"), "buildExtensionWebviewHtml missing script-src 'nonce-nonce_xyz'");
  for (const msg of [...ALLOWED_STUDIO_MESSAGES, ...ALLOWED_HOST_FORWARD_MESSAGES]) {
    assert(extSource.includes(`'${msg}'`), `extension.ts missing message type '${msg}'`);
    assert(html.includes(`"${msg}"`), `buildExtensionWebviewHtml missing message type "${msg}"`);
  }

  // 4. Geometry defect analyzer positive & negative cases
  const makeEl = (partial: Partial<InspectedElement> & { index: number; domId: number }): InspectedElement => ({
    ancestorDomIds: [],
    tag: 'button',
    role: 'button',
    testId: null,
    workspaceView: null,
    sidebarTab: null,
    text: 'Btn',
    ariaLabel: null,
    title: null,
    isInteractive: true,
    clipContainerId: 'root',
    insideScrollableX: false,
    insideScrollableY: false,
    rect: { x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 38, width: 80, height: 28 },
    clientWidth: 80,
    scrollWidth: 80,
    overflowX: 'visible',
    textOverflow: 'clip',
    ...partial,
  });

  const clean = analyzeGeometryDefects({
    viewport: { width: 1280, height: 800 },
    docScrollWidth: 1280,
    docScrollHeight: 800,
    elements: [
      makeEl({ index: 1, domId: 1 }),
      makeEl({
        index: 2,
        domId: 2,
        rect: { x: 120, y: 10, left: 120, top: 10, right: 200, bottom: 38, width: 80, height: 28 },
        clientWidth: 60,
        scrollWidth: 95,
        overflowX: 'hidden',
        textOverflow: 'ellipsis',
      }),
      // Parent-child nesting must NOT false-positive as overlap
      makeEl({
        index: 3,
        domId: 3,
        ancestorDomIds: [1],
        rect: { x: 15, y: 12, left: 15, top: 12, right: 45, bottom: 32, width: 30, height: 20 },
      }),
    ],
  });
  assert.equal(clean.totalDefects, 0, `Expected 0 defects in clean synthetic snapshot, got ${JSON.stringify(clean)}`);
  assert.equal(clean.truncatedEllipsisCount, 1);

  const broken = analyzeGeometryDefects({
    viewport: { width: 900, height: 700 },
    docScrollWidth: 948,
    docScrollHeight: 700,
    elements: [
      makeEl({
        index: 1,
        domId: 10,
        text: 'ClippedLabel',
        clientWidth: 40,
        scrollWidth: 110,
        overflowX: 'hidden',
        textOverflow: 'clip',
        rect: { x: 860, y: 10, left: 860, top: 10, right: 920, bottom: 38, width: 60, height: 28 },
      }),
      makeEl({
        index: 2,
        domId: 11,
        text: 'PeerOverlap',
        rect: { x: 870, y: 15, left: 870, top: 15, right: 930, bottom: 35, width: 60, height: 20 },
      }),
    ],
  });
  assert.equal(broken.horizontalOverflow, true);
  assert.equal(broken.overflowPx, 48);
  assert.equal(broken.offscreenControls.length, 2);
  assert.equal(broken.clippedText.length, 1);
  assert.equal(broken.overlappingInteractive.length, 1);
  assert.equal(broken.totalDefects, 5);

  const pannableExempt = analyzeGeometryDefects({
    viewport: { width: 1280, height: 800 },
    docScrollWidth: 1280,
    docScrollHeight: 800,
    elements: [
      makeEl({
        index: 1,
        domId: 20,
        text: 'PannableNodeControl',
        insideScrollableX: true,
        insideScrollableY: true,
        rect: { x: 1281, y: 236, left: 1281, top: 236, right: 1305, bottom: 258, width: 24, height: 22 },
      }),
    ],
  });
  assert.equal(pannableExempt.offscreenControls.length, 0);
  assert.equal(pannableExempt.totalDefects, 0);

  const fixedChromeFlagged = analyzeGeometryDefects({
    viewport: { width: 1280, height: 800 },
    docScrollWidth: 1280,
    docScrollHeight: 800,
    elements: [
      makeEl({
        index: 1,
        domId: 21,
        text: 'FixedChromeControl',
        insideScrollableX: false,
        insideScrollableY: false,
        rect: { x: 1281, y: 236, left: 1281, top: 236, right: 1305, bottom: 258, width: 24, height: 22 },
      }),
    ],
  });
  assert.equal(fixedChromeFlagged.offscreenControls.length, 1);
  assert.equal(fixedChromeFlagged.totalDefects, 1);

  console.log('ui-inspect-unit PASS | extension.ts shell parity & geometry analyzer verified');
}

async function runFullSelftest(): Promise<void> {
  runUnitSelftest();

  assert.equal(await waitForApiQuiet(new Set(), 500, 30), true, 'empty in-flight set should settle immediately');
  const draining = new Set(['req1']);
  setTimeout(() => draining.delete('req1'), 60);
  assert.equal(await waitForApiQuiet(draining, 1_000, 40), true, 'draining in-flight set should settle after completion');
  const stuck = new Set(['hung']);
  assert.equal(await waitForApiQuiet(stuck, 120, 40), false, 'stuck in-flight set should hit bounded timeout');

  const scratch = fs.mkdtempSync(path.join(physicalTempBase(), 'x4-ui-inspect-e2e-'));
  try {
    // 1. Live Chromium + Node extension shell + simulated backend-offline check
    let offlineBannerVerified = false;
    const nodeOut = path.join(scratch, 'node-inspect');
    const nodeReport = await runVisualInspection(
      parseInspectArgs([
        '--engine',
        'node',
        '--shell',
        'extension',
        '--views',
        'blueprint,ui-designer,project',
        '--viewport',
        '1280x800',
        '--menu',
        '--annotate',
        '--out',
        nodeOut,
      ]),
      {
        onShellReady: async (page) => {
          const beforeOffline = await page.evaluate(() => {
            const notice = document.getElementById('backend-notice') as HTMLElement | null;
            const badge = document.getElementById('forge-badge') as HTMLElement | null;
            return {
              noticeHidden: notice?.hidden ?? false,
              badgeHidden: badge?.hidden ?? false,
            };
          });
          assert.equal(beforeOffline.noticeHidden, true, 'Expected #backend-notice hidden while backend is healthy');
          assert.equal(beforeOffline.badgeHidden, true, 'Expected #forge-badge hidden while backend is healthy (zero status-bar overlap)');

          await page.evaluate(() => {
            const host = (window as unknown as { __x4InspectHost: { simulateBackendOffline: (m: string) => void } }).__x4InspectHost;
            host.simulateBackendOffline('Simulated offline test');
          });
          const state = await page.evaluate(() => {
            const notice = document.getElementById('backend-notice') as HTMLElement | null;
            const badge = document.getElementById('forge-badge') as HTMLElement | null;
            return {
              hidden: notice?.hidden ?? true,
              text: notice?.textContent ?? '',
              badgeHidden: badge?.hidden ?? true,
              badge: badge?.textContent ?? '',
            };
          });
          assert.equal(state.hidden, false, 'Expected #backend-notice to un-hide on backend-offline message');
          assert.equal(state.text, 'Simulated offline test');
          assert.equal(state.badgeHidden, false, 'Expected #forge-badge to become visible on backend-offline message');
          assert.equal(state.badge, 'X4 Forge Studio — backend stopped');
          offlineBannerVerified = true;
        },
      },
    );

    assert.equal(offlineBannerVerified, true);
    assert.equal(nodeReport.summary.totalRuntimeErrors, 0, `Unexpected runtime errors: ${JSON.stringify(nodeReport.runtimeErrors)}`);
    assert.equal(nodeReport.captures.length, 4, 'Expected 3 views + 1 studio-menu capture');
    for (const c of nodeReport.captures) {
      assert.equal(c.shell.cspViolations.length, 0);
      assert(c.shell.frameRect && Math.round(c.shell.frameRect.width) === 1280 && Math.round(c.shell.frameRect.height) === 800);
      assert(fs.statSync(c.screenshotPath).size > 10_240, `Expected PNG > 10 KiB at ${c.screenshotPath}`);
      assert(c.annotatedPath && fs.statSync(c.annotatedPath).size > 10_240, `Expected annotated PNG > 10 KiB`);
    }
    const parsedReport = JSON.parse(fs.readFileSync(path.join(nodeOut, 'report.json'), 'utf8')) as InspectionReport;
    assert.equal(parsedReport.summary.captureCount, 4);

    // 2. Smoke capture against Rust x4forge serve --static-dir dist (when binary built)
    let rustSmoke = 'skipped';
    if (resolveRustX4ForgeBin()) {
      const rustOut = path.join(scratch, 'rust-inspect');
      const rustReport = await runVisualInspection(
        parseInspectArgs([
          '--engine',
          'rust',
          '--shell',
          'extension',
          '--views',
          'blueprint',
          '--viewport',
          '1280x800',
          '--no-annotate',
          '--out',
          rustOut,
        ]),
      );
      assert.equal(rustReport.runtimeErrors.cspViolations.length, 0);
      assert.equal(rustReport.runtimeErrors.pageErrors.length, 0);
      const rustCap = rustReport.captures[0];
      assert(rustCap, 'Expected Rust capture record');
      assert(
        rustCap.shell.frameRect
        && Math.round(rustCap.shell.frameRect.width) === 1280
        && Math.round(rustCap.shell.frameRect.height) === 800,
        'Expected #forge-frame to fill 1280x800 in Rust smoke capture',
      );
      assert(fs.statSync(rustCap.screenshotPath).size > 5_120, 'Expected Rust smoke PNG > 5 KiB');
      rustSmoke = `pass (notes=${rustCap.notes.length}, elements=${rustCap.elementCount})`;
    }

    console.log(`ui-inspect-selftest PASS | node_captures=${nodeReport.captures.length} | offline_notice=verified | rust_smoke=${rustSmoke}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main(): Promise<void> {
  let opts: InspectCliOptions;
  try {
    opts = parseInspectArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    throw err;
  }

  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.selftestUnit) {
    runUnitSelftest();
    return;
  }
  if (opts.selftest) {
    await runFullSelftest();
    return;
  }

  const report = await runVisualInspection(opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`X4 Forge UI Inspection (${report.engine} / ${report.shell}) -> ${report.outDir}`);
    console.log(`  Captures : ${report.summary.captureCount}`);
    console.log(`  Runtime  : ${report.summary.totalRuntimeErrors} errors`);
    console.log(`  Http 4xx : ${report.summary.totalHttp4xx}`);
    console.log(`  Layout   : ${report.summary.totalLayoutDefects} defects`);
    for (const c of report.captures) {
      console.log(`  - ${c.id}: elements=${c.elementCount}, defects=${c.geometry.totalDefects}, png=${c.screenshotPath}`);
    }
  }

  if (opts.failOnError && report.summary.totalRuntimeErrors > 0) {
    process.exit(1);
  }
  if (opts.failOnLayout && report.summary.totalLayoutDefects > 0) {
    process.exit(1);
  }
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isEntrypoint) {
  main().catch((err) => {
    console.error('studio-ui-inspect FAIL:', err);
    process.exit(1);
  });
}
