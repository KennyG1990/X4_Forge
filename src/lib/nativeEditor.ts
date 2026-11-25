import type { ModWorkspace } from '../types';
import {
  extractWorkspaceWriteFailure,
  formatWorkspaceWriteErrorMessage,
  reconcileFailedWorkspaceWrite,
  type WorkspaceReadbackSnapshot,
} from './workspaceWriteRecovery';

export interface NativeEditorOpenRequest {
  source: 'x4forge-studio';
  type: 'open-workspace-file' | 'open-validated-source' | 'open-bound-workspace-file';
  path: string;
  sourceFolder?: string;
  expectedWorkspaceRootId?: string;
  line?: number;
  column?: number;
  expectedSourceSha256?: string;
}

export interface NativeTextDiffRequest {
  source: 'x4forge-studio';
  type: 'open-text-diff';
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  language?: string;
}

export interface NativeNodeSelectionRequest {
  source: 'x4forge-studio';
  type: 'open-node-selection';
  requestId: string;
  title: string;
  content: string;
  token: string;
  nodeIds: string[];
  readOnly: boolean;
  warnings: string[];
}

export interface NativeNodeSelectionResult {
  source: 'x4forge-studio';
  type: 'node-selection-result';
  requestId: string;
  ok: boolean;
  message: string;
  token?: string;
  content?: string;
  warnings?: number;
}

export interface NativeNodeApplyRequest {
  source: 'x4forge-native-host';
  type: 'apply-node-selection';
  requestId: string;
  content: string;
  token: string;
  nodeIds: string[];
}

export const X4_UNPACKER_URL = 'https://www.nexusmods.com/x4foundations/mods/2142?tab=description';
export const X4_FORGE_DISCORD_URL = 'https://discord.gg/9qvAvtXqWP';

export interface NativeExternalUrlRequest {
  source: 'x4forge-studio';
  type: 'open-external-url';
  url: typeof X4_UNPACKER_URL | typeof X4_FORGE_DISCORD_URL;
}

export type NativeReleaseAction =
  | { action: 'select-preview' }
  | { action: 'select-workshop-tool' }
  | { action: 'export-artifact'; platform: 'nexus' | 'steam'; sourcePath: string; suggestedName: string; sha256: string; sizeBytes: number }
  | { action: 'open-steam-terminal'; command: string; stagedModPath: string; toolPath: string };

export interface NativeReleaseRequest {
  source: 'x4forge-studio';
  type: 'release-native-action';
  requestId: string;
  request: NativeReleaseAction;
}

export interface NativeReleaseResult {
  source: 'x4forge-native-host';
  type: 'release-native-result';
  requestId: string;
  ok: boolean;
  cancelled?: boolean;
  code: string;
  message: string;
  path?: string;
  sha256?: string;
  sizeBytes?: number;
}

export function notifyNativeWorkspaceAuthority(workspaceId: string): void {
  if (!hasNativeReleaseHost() || !/^ws_[a-f0-9]{24}$/i.test(workspaceId)) return;
  window.parent.postMessage({
    source: 'x4forge-studio',
    type: 'workspace-authority-changed',
    workspaceId,
  }, '*');
}

const NATIVE_EXTERNAL_URLS = new Set<string>([X4_UNPACKER_URL, X4_FORGE_DISCORD_URL]);

export function hasNativeReleaseHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

export function requestNativeReleaseAction(request: NativeReleaseAction): Promise<NativeReleaseResult | null> {
  if (!hasNativeReleaseHost()) return Promise.resolve(null);
  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `release-${Date.now()}-${Math.random()}`;
  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', receive);
      resolve({ source: 'x4forge-native-host', type: 'release-native-result', requestId, ok: false, code: 'NATIVE_RELEASE_TIMEOUT', message: 'The installed host did not answer the release request. Nothing was exported or launched.' });
    }, 120_000);
    const receive = (event: MessageEvent) => {
      const candidate = event.data as Partial<NativeReleaseResult> | null;
      if (event.source !== window.parent || !candidate || candidate.source !== 'x4forge-native-host'
        || candidate.type !== 'release-native-result' || candidate.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      resolve(candidate as NativeReleaseResult);
    };
    window.addEventListener('message', receive);
    const message: NativeReleaseRequest = { source: 'x4forge-studio', type: 'release-native-action', requestId, request };
    window.parent.postMessage(message, '*');
  });
}

interface NativeProjectFileEntry {
  path: string;
  state: 'source' | 'synchronized-generated' | 'generated-only' | 'conflict';
  text: boolean;
  openable: boolean;
  materializable: boolean;
}

interface NativeProjectInventoryResponse {
  sourceAvailable?: boolean;
  sourceFolder?: string | null;
  workspaceRootId?: string;
  entries?: NativeProjectFileEntry[];
  errors?: string[];
  error?: string;
}

export interface NativeProjectOpenResult {
  ok: boolean;
  materialized: boolean;
  message: string;
}

export function needsManifestMaterialization(projectPath: string, sourceAvailable: boolean): boolean {
  return projectPath !== 'content.xml' && !sourceAvailable;
}

function bindNativeProjectSelection(): () => void {
  const context = window.__X4_WORKSPACE_CONTEXT__;
  const workspaceId = context?.getWorkspaceId();
  if (context && !/^ws_[a-f0-9]{24}$/i.test(workspaceId ?? '')) {
    throw new Error('Select a Forge workspace before using native file actions.');
  }
  const selectionRevision = context?.getSelectionRevision();
  return () => {
    if (window.__X4_WORKSPACE_CONTEXT__ !== context
      || context?.getWorkspaceId() !== workspaceId
      || context?.getSelectionRevision() !== selectionRevision) {
      throw new Error('The workspace selection changed before the file action finished.');
    }
  };
}

function requireNativeProjectRoot(inventory: NativeProjectInventoryResponse): string {
  const id = inventory.workspaceRootId;
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) {
    throw new Error('Forge could not identify the Mod Workspace folder. Refresh Project Files.');
  }
  return id;
}

export async function openSourceVsGeneratedDiff(
  workspace: ModWorkspace,
  projectPath: string,
): Promise<NativeProjectOpenResult> {
  if (typeof window === 'undefined' || window.parent === window) {
    return { ok: false, materialized: false, message: 'Native diffs are available in the installed Antigravity/VS Code extension.' };
  }
  try {
    const requireSameSelection = bindNativeProjectSelection();
    const inventoryResponse = await fetch('/api/agent/project/files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }),
    });
    requireSameSelection();
    const inventory = await inventoryResponse.json() as NativeProjectInventoryResponse;
    requireSameSelection();
    const entry = inventory.entries?.find(candidate => candidate.path === projectPath);
    if (!inventoryResponse.ok || !entry || !entry.openable || !entry.text || !inventory.sourceFolder) {
      throw new Error(inventory.error || `${projectPath} has no source/generated text pair to compare.`);
    }
    const expectedWorkspaceRootId = requireNativeProjectRoot(inventory);
    const sourceQuery = new URLSearchParams({
      root: 'workspace',
      path: `${inventory.sourceFolder}/${projectPath}`,
      expectedWorkspaceRootId,
    });
    const [sourceResponse, compileResponse] = await Promise.all([
      fetch(`/api/fs/read?${sourceQuery}`),
      fetch('/api/agent/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }),
      }),
    ]);
    requireSameSelection();
    const source = await sourceResponse.json() as { content?: string; error?: string; workspaceRootId?: string };
    requireSameSelection();
    const compiled = await compileResponse.json() as { files?: Record<string, string>; error?: string };
    requireSameSelection();
    const generated = compiled.files?.[projectPath];
    if (!sourceResponse.ok || typeof source.content !== 'string' || source.workspaceRootId !== expectedWorkspaceRootId) {
      throw new Error(source.error || `Could not confirm the Mod Workspace folder for ${projectPath}.`);
    }
    if (!compileResponse.ok || typeof generated !== 'string') throw new Error(compiled.error || `Forge did not generate ${projectPath}.`);
    if (new Blob([source.content]).size > 8 * 1024 * 1024 || new Blob([generated]).size > 8 * 1024 * 1024) {
      throw new Error('Native diff preview is limited to 8 MB per text side. The source file remains editable in Antigravity.');
    }
    const opened = openNativeTextDiff({
      title: `Forge Source vs Generated — ${projectPath}`,
      leftLabel: `${projectPath} (workspace source)`,
      rightLabel: `${projectPath} (Forge generated)`,
      leftContent: source.content,
      rightContent: generated,
      language: projectPath.toLowerCase().endsWith('.xml') ? 'xml' : projectPath.toLowerCase().endsWith('.lua') ? 'lua' : 'text',
    });
    return opened
      ? { ok: true, materialized: false, message: `Opened a read-only native diff for ${projectPath}.` }
      : { ok: false, materialized: false, message: 'Native diffs are available in the installed Antigravity/VS Code extension.' };
  } catch (error) {
    return { ok: false, materialized: false, message: error instanceof Error ? error.message : `Could not compare ${projectPath}.` };
  }
}

/**
 * Ask the VS Code/Antigravity extension host to open a real workspace file.
 * Standalone browser builds degrade honestly: they have no native editor host.
 */
export function openInNativeEditor(
  path: string,
  position?: { line?: number; column?: number },
  sourceFolder?: string,
  expectedSourceSha256?: string,
): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false;
  const message: NativeEditorOpenRequest = {
    source: 'x4forge-studio',
    type: expectedSourceSha256 === undefined ? 'open-workspace-file' : 'open-validated-source',
    path,
    ...(sourceFolder ? { sourceFolder } : {}),
    ...(Number.isInteger(position?.line) ? { line: position!.line } : {}),
    ...(Number.isInteger(position?.column) ? { column: position!.column } : {}),
    ...(expectedSourceSha256 !== undefined ? { expectedSourceSha256 } : {}),
  };
  window.parent.postMessage(message, '*');
  return true;
}

/** Ask the host to open a relative file from the same folder used by Project Files. */
export function openBoundWorkspaceFile(path: string, sourceFolder: string, expectedWorkspaceRootId: string): boolean {
  if (!hasNativeReleaseHost()) return false;
  const message: NativeEditorOpenRequest = {
    source: 'x4forge-studio', type: 'open-bound-workspace-file', path, sourceFolder, expectedWorkspaceRootId,
  };
  window.parent.postMessage(message, '*');
  return true;
}

/** Open an ephemeral, read-only two-pane diff in the native IDE host. */
export function openNativeTextDiff(options: Omit<NativeTextDiffRequest, 'source' | 'type'>): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false;
  const message: NativeTextDiffRequest = { source: 'x4forge-studio', type: 'open-text-diff', ...options };
  window.parent.postMessage(message, '*');
  return true;
}

export function openNativeNodeSelection(options: Omit<NativeNodeSelectionRequest, 'source' | 'type' | 'requestId'>): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false;
  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `node-${Date.now()}-${Math.random()}`;
  const message: NativeNodeSelectionRequest = { source: 'x4forge-studio', type: 'open-node-selection', requestId, ...options };
  window.parent.postMessage(message, '*');
  return true;
}

export function postNativeNodeSelectionResult(result: Omit<NativeNodeSelectionResult, 'source' | 'type'>): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  const message: NativeNodeSelectionResult = { source: 'x4forge-studio', type: 'node-selection-result', ...result };
  window.parent.postMessage(message, '*');
}

/**
 * Route one of Forge's two credited/support links through the installed IDE host.
 * Returning false deliberately leaves an ordinary anchor in charge in a standalone browser.
 */
export function openExternalUrlInNativeHost(url: string): boolean {
  if (!NATIVE_EXTERNAL_URLS.has(url) || typeof window === 'undefined' || window.parent === window) return false;
  const message: NativeExternalUrlRequest = {
    source: 'x4forge-studio',
    type: 'open-external-url',
    url: url as NativeExternalUrlRequest['url'],
  };
  window.parent.postMessage(message, '*');
  return true;
}

/**
 * Open a real source file in Antigravity. Generated-only text is first written
 * through Forge's validated, compare-and-swap write route; existing source is
 * never overwritten when its bytes disagree with the canvas compiler.
 */
export async function openOrMaterializeInNativeEditor(
  workspace: ModWorkspace,
  projectPath: string,
): Promise<NativeProjectOpenResult> {
  if (typeof window === 'undefined' || window.parent === window) {
    return { ok: false, materialized: false, message: 'Native tabs are available in the installed Antigravity/VS Code extension.' };
  }

  let manifestWritten = false;
  let materialized = false;
  let unconfirmedPath: string | undefined;
  try {
    const requireSameSelection = bindNativeProjectSelection();
    const inventoryResponse = await fetch('/api/agent/project/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    });
    requireSameSelection();
    const inventory = await inventoryResponse.json() as NativeProjectInventoryResponse;
    requireSameSelection();
    if (!inventoryResponse.ok && !inventory.entries) {
      throw new Error(inventory.error || inventory.errors?.join(' ') || `HTTP ${inventoryResponse.status}`);
    }
    const entry = inventory.entries?.find(candidate => candidate.path === projectPath);
    if (!entry) return { ok: false, materialized: false, message: `${projectPath} is not part of the compiled project.` };
    if (!entry.text) return { ok: false, materialized: false, message: `${projectPath} is preserved as binary data and cannot be opened as text.` };
    if (entry.openable && inventory.sourceFolder) {
      openBoundWorkspaceFile(projectPath, inventory.sourceFolder, requireNativeProjectRoot(inventory));
      return { ok: true, materialized: false, message: `Requested ${projectPath} in Antigravity.` };
    }
    if (entry.state === 'conflict') {
      return {
        ok: false,
        materialized: false,
        message: `${projectPath} differs from the canvas-generated bytes. Forge refused to overwrite it; open the source from the project inventory and reconcile it explicitly.`,
      };
    }
    if (!entry.materializable || !inventory.sourceFolder) {
      return {
        ok: false,
        materialized: false,
        message: `${projectPath} has no editable source copy yet. Import or compile this mod into the configured Mod Workspace first.`,
      };
    }

    const expectedWorkspaceRootId = requireNativeProjectRoot(inventory);
    const compileResponse = await fetch('/api/agent/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
    });
    requireSameSelection();
    const compiled = await compileResponse.json() as { files?: Record<string, string>; error?: string };
    requireSameSelection();
    const content = compiled.files?.[projectPath];
    if (!compileResponse.ok || typeof content !== 'string') {
      throw new Error(compiled.error || `Forge did not generate ${projectPath}.`);
    }
    const materializeFile = async (relativePath: string, fileContent: string) => {
      requireSameSelection();
      unconfirmedPath = relativePath;
      const targetRelPath = `${inventory.sourceFolder}/${relativePath}`;
      const writeResponse = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetRelPath,
          content: fileContent,
          strict: true,
          expectedSha256: null,
          expectedWorkspaceRootId,
        }),
      });
      // Read the acknowledgement even after a selection change. The prior write
      // may have committed and its result must survive cancellation of the next step.
      const reply = await writeResponse.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        code?: string;
        workspaceRootId?: string;
        written?: { root?: string; byteExact?: boolean };
        writeFailure?: unknown;
      };
      if (!writeResponse.ok) {
        const headerRequestId = writeResponse.headers?.get?.('X-Forge-Write-Request-Id') ?? null;
        if (reply.code === 'FILE_CHANGED' || reply.code === 'REJECTED_BY_STRICT_VALIDATION' || reply.code === 'WORKSPACE_ROOT_CHANGED') {
          unconfirmedPath = undefined;
          throw new Error(formatWorkspaceWriteErrorMessage(reply, `HTTP ${writeResponse.status}`, {
            status: writeResponse.status,
            headerRequestId,
          }));
        }
        const telemetry = extractWorkspaceWriteFailure(reply, headerRequestId);
        if (telemetry?.outcome === 'target-absent' || telemetry?.outcome === 'before-bytes-observed') {
          unconfirmedPath = undefined;
          throw new Error(formatWorkspaceWriteErrorMessage(reply, `HTTP ${writeResponse.status}`, {
            status: writeResponse.status,
            headerRequestId,
          }));
        }
        if (writeResponse.status >= 500) {
          const reconciled = await reconcileFailedWorkspaceWrite({
            status: writeResponse.status,
            body: reply,
            headerRequestId,
            fallbackMessage: `HTTP ${writeResponse.status}`,
            intendedContent: fileContent,
            expectedPreviousSha256: null,
            expectedWorkspaceRootId,
            readback: async (): Promise<WorkspaceReadbackSnapshot> => {
              const readRes = await fetch(
                `/api/fs/read?root=workspace&path=${encodeURIComponent(targetRelPath)}&expectedWorkspaceRootId=${encodeURIComponent(expectedWorkspaceRootId)}`,
              );
              if (readRes.status === 404) {
                const errJson = await readRes.json().catch(() => ({})) as { code?: string };
                return errJson.code === 'FILE_NOT_FOUND_IN_ROOT' ? { state: 'absent' } : { state: 'unavailable' };
              }
              if (!readRes.ok) return { state: 'unavailable' };
              const readJson = await readRes.json().catch(() => ({})) as {
                root?: string;
                sha256?: string;
                content?: string;
                workspaceRootId?: string;
              };
              if (readJson.root !== 'workspace' || typeof readJson.sha256 !== 'string') return { state: 'unavailable' };
              return {
                state: 'file',
                sha256: readJson.sha256,
                content: readJson.content,
                workspaceRootId: readJson.workspaceRootId,
              };
            },
          });
          if (reconciled.kind === 'landed-verified') {
            unconfirmedPath = undefined;
            return;
          }
          if (reconciled.kind === 'unchanged-verified') {
            unconfirmedPath = undefined;
          }
          throw new Error(reconciled.message);
        }
        throw new Error(formatWorkspaceWriteErrorMessage(reply, `HTTP ${writeResponse.status}`, {
          status: writeResponse.status,
          headerRequestId,
        }));
      }
      if (reply.success !== true || reply.workspaceRootId !== expectedWorkspaceRootId
        || reply.written?.root !== 'workspace' || reply.written.byteExact !== true) {
        throw new Error('Forge could not verify the saved bytes.');
      }
      unconfirmedPath = undefined;
    };
    // A brand-new source folder needs its manifest created before any nested file can
    // become a usable mod. Existing source folders already have content.xml (that is
    // how the inventory recognizes them), so leave that source-owned manifest alone.
    if (needsManifestMaterialization(projectPath, Boolean(inventory.sourceAvailable))) {
      const manifest = compiled.files?.['content.xml'];
      if (typeof manifest !== 'string') throw new Error('Forge did not generate content.xml for the materialized mod.');
      await materializeFile('content.xml', manifest);
      manifestWritten = true;
    }
    await materializeFile(projectPath, content);
    materialized = true;
    requireSameSelection();
    openBoundWorkspaceFile(projectPath, inventory.sourceFolder, expectedWorkspaceRootId);
    return {
      ok: true,
      materialized: true,
      message: `${projectPath} was materialized through Forge validation. Native open was requested.`,
    };
  } catch (error) {
    const message = [error instanceof Error ? error.message : `Could not open ${projectPath}.`];
    if (materialized) {
      message.push(`${projectPath} was materialized in the original workspace. Native open was canceled.`);
    } else if (manifestWritten) {
      message.push('Forge created content.xml in the original workspace before stopping.');
    }
    if (unconfirmedPath) {
      message.push(`Check ${unconfirmedPath} in the original workspace before retrying. Its write could not be confirmed.`);
    }
    return { ok: false, materialized, message: message.join(' ') };
  }
}
