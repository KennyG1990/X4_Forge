import fs from 'node:fs';
import path from 'node:path';
import { parseX4Lua } from '../lib/x4LuaParser';
import {
  buildX4UiCallModel,
  type X4UiCallModel,
  type X4UiSourceLocation,
} from '../lib/x4UiCallModel';
import {
  lintX4UiCallModel,
  type X4UiLintFinding,
  type X4UiLintStatus,
  type X4UiLintVerificationGap,
} from '../lib/x4UiLint';
import {
  createX4UiLayoutTargetCatalog,
  projectX4UiLayoutProgram,
  type X4UiLayoutPreviewLoopSelectionValue,
  type X4UiLayoutPreviewSampleValue,
  type X4UiLayoutProgram,
  type X4UiLayoutScalar,
  type X4UiLayoutTarget,
} from '../lib/x4UiLayoutProgram';
import {
  buildX4UiPreviewProfile,
} from '../lib/x4UiPreviewPipeline';
import {
  projectX4UiScene,
  type X4UiScene,
  type X4UiSceneProfile,
  type X4UiSceneRect,
} from '../lib/x4UiScene';
import {
  X4_UI_CORPUS_9_00_COLOR_CONTRACT,
  X4_UI_CORPUS_9_00_CONTRACT,
  X4_UI_CORPUS_FILE_URL,
  X4_UI_CORPUS_MANIFEST_URL,
  X4_UI_CORPUS_STATUS_URL,
  isX4UiCorpusCanonicalColorSuccess,
  isX4UiCorpusCanonicalSuccess,
  loadCanonicalX4UiCorpusAssets,
  loadCanonicalX4UiCorpusColorEvidence,
  type X4UiCorpusCanonicalColorSuccess,
  type X4UiCorpusCanonicalSuccess,
  type X4UiCorpusFetchResponse,
} from '../lib/x4UiCorpusAssets';
import { X4_LAYOUT_PROVENANCE } from '../lib/x4UiLayoutKernel';
import { ZEKTON_EVIDENCE_STATE } from '../lib/x4UiFontMetrics';
import { ZEKTON_TEXT_TRUTH_GRADE } from '../lib/x4UiTextLayout';
import { NOT_VERIFIED_IN_GAME } from '../lib/x4UiWorkspaceSource';

export const X4_UI_HEADLESS_PREVIEW_SCHEMA = 'forge.x4-ui-preview.v1' as const;
const DEFAULT_DRAWABLE_WIDTH = 1920;
const DEFAULT_DRAWABLE_HEIGHT = 1080;
const DEFAULT_UI_SCALE = 1;
const MAX_PREVIEW_LUA_BYTES = 1024 * 1024;
const MAX_REPORTED_ITEMS = 100;
const SYNTHETIC_PREVIEW_FN = '__forge_shared_frame_preview';
const SYNTHETIC_TARGET_FN = '__forge_shared_target_fn';

export interface X4UiHeadlessFixtureInput {
  readonly samples?: Readonly<Record<string, X4UiLayoutScalar>>;
  readonly loops?: Readonly<Record<string, number>>;
  readonly drawable?: {
    readonly width?: number;
    readonly height?: number;
  };
  readonly uiScale?: number;
  readonly frameParameter?: string;
}

export interface X4UiHeadlessPreviewRequest {
  readonly logicalPath: string;
  readonly content: string;
  readonly target?: string;
  readonly fixture?: X4UiHeadlessFixtureInput;
  readonly referenceRoot?: string | null;
}

export interface X4UiHeadlessTargetSummary {
  readonly id: string;
  readonly kind: string;
  readonly name: string | null;
  readonly handler: string | null;
  readonly lineStart: number;
  readonly lineEnd: number;
}

export interface X4UiHeadlessTableSummary {
  readonly id: string;
  readonly line: number;
  readonly column: number;
  readonly numColumns: number | null;
  readonly rowCount: number;
  readonly requestedWidth: number | null;
  readonly width: number | null;
  readonly fullHeight: number | null;
  readonly visibleHeight: number | null;
  readonly maxVisibleHeight: number | null;
  readonly reserveScrollBar: boolean | null;
  readonly scrollRequired: boolean;
  readonly exceedsFrameWidth: boolean;
  readonly exceedsFrameHeight: boolean;
  readonly rect: X4UiSceneRect | null;
}

export interface X4UiHeadlessClippedTextFinding {
  readonly textNodeId: string;
  readonly widgetId: string;
  readonly widgetKind: string;
  readonly content: string;
  readonly displayedText: string;
  readonly lineIndex: number;
  readonly width: number;
  readonly availableWidth: number | null;
  readonly truncated: boolean;
  readonly overflow: boolean;
  readonly breakReason: string;
  readonly line: number;
  readonly column: number;
}

export interface X4UiHeadlessOverlapFinding {
  readonly kind: 'frame-overlap' | 'table-overlap';
  readonly firstId: string;
  readonly firstLine: number;
  readonly secondId: string;
  readonly secondLine: number;
  readonly intersection: X4UiSceneRect;
}

export interface X4UiHeadlessUnresolvedSample {
  readonly expression: string;
  readonly expectedType: string;
  readonly line: number;
  readonly column: number;
}

export interface X4UiHeadlessPreviewResult {
  readonly ok: true;
  readonly schema: typeof X4_UI_HEADLESS_PREVIEW_SCHEMA;
  readonly gameTruth: typeof NOT_VERIFIED_IN_GAME;
  readonly path: string;
  readonly bytes: number;
  readonly corpus: {
    readonly canonicalAssetsLoaded: boolean;
    readonly canonicalColorsLoaded: boolean;
    readonly status: 'canonical-9.00' | 'unavailable';
    readonly reason?: string;
  };
  readonly profile: {
    readonly drawable: { readonly width: number; readonly height: number };
    readonly uiScale: number;
  };
  readonly lint: {
    readonly parsed: boolean;
    readonly status: X4UiLintStatus;
    readonly summary: string;
    readonly isStaticallyVerified: boolean;
    readonly errorCount: number;
    readonly warningCount: number;
    readonly verificationGapCount: number;
    readonly verificationGapsTruncated: boolean;
    readonly findings: readonly {
      readonly code: string;
      readonly severity: string;
      readonly message: string;
      readonly line: number;
      readonly column: number;
      readonly nextAction: string;
    }[];
    readonly verificationGaps: readonly {
      readonly category: string;
      readonly status: string;
      readonly expression: string;
      readonly reason: string;
      readonly line: number;
      readonly column: number;
    }[];
  };
  readonly targets: readonly X4UiHeadlessTargetSummary[];
  readonly selectedTarget: X4UiHeadlessTargetSummary | null;
  readonly previewHarness: 'direct' | 'shared-frame-parameter' | 'none';
  readonly layout: {
    readonly programStatus: 'projected' | 'partial' | 'refused' | 'not-run';
    readonly sceneStatus: 'projected' | 'partial' | 'refused' | 'unavailable';
    readonly refusalReason?: string;
    readonly frameCount: number;
    readonly tableCount: number;
    readonly rowCount: number;
    readonly widgetCount: number;
    readonly clippedTextCount: number;
    readonly overlapCount: number;
    readonly appliedSamples: number;
    readonly unresolvedSampleCount: number;
    readonly tables: readonly X4UiHeadlessTableSummary[];
    readonly clippedText: readonly X4UiHeadlessClippedTextFinding[];
    readonly overlaps: readonly X4UiHeadlessOverlapFinding[];
    readonly unresolvedSamples: readonly X4UiHeadlessUnresolvedSample[];
  };
}

interface CachedCanonicalCorpus {
  readonly rootRealpath: string;
  readonly corpus: X4UiCorpusCanonicalSuccess | null;
  readonly colors: X4UiCorpusCanonicalColorSuccess | null;
  readonly reason?: string;
}

const canonicalCorpusCache = new Map<string, Promise<CachedCanonicalCorpus>>();

function jsonFetchResponse(body: unknown, status = 200): X4UiCorpusFetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
  };
}

function bytesFetchResponse(bytes: Uint8Array, contentType: string, status = 200): X4UiCorpusFetchResponse {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: async () => copy.buffer,
  };
}

function queryParamFromUrl(url: string, key: string): string | null {
  const qIdx = url.indexOf('?');
  if (qIdx < 0) return null;
  const params = new URLSearchParams(url.slice(qIdx + 1));
  return params.get(key);
}

function contentTypeForCorpusAsset(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.lua')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.xml') || lower.endsWith('.xsd')) return 'application/xml; charset=utf-8';
  return 'application/octet-stream';
}

function buildAllowedCorpusRelPaths(): Set<string> {
  const c = X4_UI_CORPUS_9_00_CONTRACT;
  const cc = X4_UI_CORPUS_9_00_COLOR_CONTRACT;
  return new Set<string>([
    c.helper.relativePath,
    c.widget.relativePath,
    c.regular.descriptor.relativePath,
    c.regular.atlas.relativePath,
    c.bold.descriptor.relativePath,
    c.bold.atlas.relativePath,
    cc.xml.relativePath,
    cc.xsd.relativePath,
  ]);
}

const ALLOWED_CORPUS_RELPATHS = buildAllowedCorpusRelPaths();

async function loadCachedCanonicalCorpus(referenceRoot?: string | null): Promise<CachedCanonicalCorpus> {
  const trimmed = typeof referenceRoot === 'string' ? referenceRoot.trim() : '';
  if (!trimmed) {
    return { rootRealpath: '', corpus: null, colors: null, reason: 'No X4 reference root is configured.' };
  }
  let rootReal: string;
  try {
    const st = fs.statSync(trimmed);
    if (!st.isDirectory()) {
      return { rootRealpath: '', corpus: null, colors: null, reason: 'Configured X4 reference root is not a directory.' };
    }
    rootReal = fs.realpathSync(trimmed);
  } catch {
    return { rootRealpath: '', corpus: null, colors: null, reason: 'Configured X4 reference root is unreadable.' };
  }

  const existing = canonicalCorpusCache.get(rootReal);
  if (existing) return existing;

  const loadPromise = (async (): Promise<CachedCanonicalCorpus> => {
    const rootIdentity = 'configured-x4-9.00-corpus';
    const generation = 'headless-preview-v1';
    const statusTime = '2026-08-11T00:00:00.000Z';

    const readSafeCorpusBytes = (relPath: string): Uint8Array | null => {
      const normalized = relPath.replace(/\\/g, '/');
      if (!ALLOWED_CORPUS_RELPATHS.has(normalized)) return null;
      const candidate = path.resolve(rootReal, ...normalized.split('/'));
      try {
        const real = fs.realpathSync(candidate);
        const rel = path.relative(rootReal, real);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
        const buf = fs.readFileSync(real);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch {
        return null;
      }
    };

    const transport = async (url: string): Promise<X4UiCorpusFetchResponse> => {
      if (url === X4_UI_CORPUS_STATUS_URL) {
        return jsonFetchResponse({
          available: true,
          root: rootIdentity,
          generatedAt: statusTime,
          manifestGeneration: generation,
          manifest: {
            available: true,
            state: 'ready',
            root: rootIdentity,
            current: { generation, root: rootIdentity, generatedAt: statusTime },
          },
        });
      }
      if (url.startsWith(`${X4_UI_CORPUS_MANIFEST_URL}?`)) {
        const q = queryParamFromUrl(url, 'q') || '';
        const bytes = readSafeCorpusBytes(q);
        if (!bytes) {
          return jsonFetchResponse({
            status: { available: true, state: 'ready', root: rootIdentity, current: { generation, root: rootIdentity, generatedAt: statusTime } },
            generation,
            total: 0,
            limit: 500,
            offset: 0,
            files: [],
          });
        }
        return jsonFetchResponse({
          status: { available: true, state: 'ready', root: rootIdentity, current: { generation, root: rootIdentity, generatedAt: statusTime } },
          generation,
          total: 1,
          limit: 500,
          offset: 0,
          files: [{ path: q, bytes: bytes.byteLength }],
        });
      }
      if (url.startsWith(`${X4_UI_CORPUS_FILE_URL}?`)) {
        const rel = queryParamFromUrl(url, 'path') || '';
        const bytes = readSafeCorpusBytes(rel);
        if (!bytes) return jsonFetchResponse({ error: 'Asset not found' }, 404);
        return bytesFetchResponse(bytes, contentTypeForCorpusAsset(rel), 200);
      }
      return jsonFetchResponse({ error: 'Unsupported corpus URL' }, 404);
    };

    const corpusRes = await loadCanonicalX4UiCorpusAssets({ transport });
    if (!isX4UiCorpusCanonicalSuccess(corpusRes)) {
      const reason = corpusRes.ok === false
        ? `${corpusRes.error.code}: ${corpusRes.error.message}`
        : 'Canonical 9.00 UI corpus assets could not be verified.';
      return { rootRealpath: rootReal, corpus: null, colors: null, reason };
    }
    const colorRes = await loadCanonicalX4UiCorpusColorEvidence({ transport });
    const colors = isX4UiCorpusCanonicalColorSuccess(colorRes) ? colorRes : null;
    return { rootRealpath: rootReal, corpus: corpusRes, colors };
  })();

  canonicalCorpusCache.set(rootReal, loadPromise);
  const resolved = await loadPromise;
  if (!resolved.corpus) {
    // Allow retry if the reference folder had not been populated yet.
    canonicalCorpusCache.delete(rootReal);
  }
  return resolved;
}

interface AstFunctionInfo {
  readonly fullName: string;
  readonly isLocal: boolean;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly params: readonly string[];
  readonly headerStartOffset: number;
  readonly openParenOffset: number;
}

interface ParsedChunkFunctions {
  readonly functions: readonly AstFunctionInfo[];
  readonly topLevelReturnOffset: number | null;
}

type GenericAstNode = {
  readonly type?: string;
  readonly isLocal?: boolean;
  readonly identifier?: GenericAstNode | null;
  readonly parameters?: readonly GenericAstNode[];
  readonly body?: readonly GenericAstNode[];
  readonly loc?: {
    readonly start?: { readonly line?: number; readonly column?: number };
    readonly end?: { readonly line?: number; readonly column?: number };
  };
  readonly range?: readonly [number, number];
  readonly base?: GenericAstNode;
  readonly indexer?: string;
  readonly name?: string;
};

function formatAstFunctionName(node: GenericAstNode | null | undefined): string | null {
  if (!node) return null;
  if (node.type === 'Identifier' && typeof node.name === 'string') return node.name;
  if (node.type === 'MemberExpression' && node.base && node.identifier) {
    const left = formatAstFunctionName(node.base);
    const right = formatAstFunctionName(node.identifier);
    const sep = node.indexer === ':' ? ':' : '.';
    if (left && right) return `${left}${sep}${right}`;
  }
  return null;
}

function inspectTopLevelLuaFunctions(source: string): ParsedChunkFunctions {
  try {
    const ast = parseX4Lua(source, { locations: true, ranges: true }) as unknown as GenericAstNode;
    const body = Array.isArray(ast.body) ? ast.body : [];
    const functions: AstFunctionInfo[] = [];
    let topLevelReturnOffset: number | null = null;

    for (const stmt of body) {
      if (stmt.type === 'ReturnStatement' && Array.isArray(stmt.range)) {
        topLevelReturnOffset = stmt.range[0];
      }
      if (stmt.type === 'FunctionDeclaration' && Array.isArray(stmt.range) && stmt.loc?.start?.line && stmt.loc?.end?.line) {
        const fullName = formatAstFunctionName(stmt.identifier);
        if (!fullName) continue;
        const params: string[] = [];
        let hasVarargs = false;
        for (const param of stmt.parameters || []) {
          if (param.type === 'Identifier' && typeof param.name === 'string') {
            params.push(param.name);
          } else {
            hasVarargs = true;
          }
        }
        if (hasVarargs) continue;
        const slice = source.slice(stmt.range[0], stmt.range[1]);
        const parenRel = slice.indexOf('(');
        if (parenRel < 0) continue;
        functions.push({
          fullName,
          isLocal: stmt.isLocal === true,
          lineStart: stmt.loc.start.line,
          lineEnd: stmt.loc.end.line,
          params,
          headerStartOffset: stmt.range[0],
          openParenOffset: stmt.range[0] + parenRel,
        });
      }
    }
    return { functions, topLevelReturnOffset };
  } catch {
    return { functions: [], topLevelReturnOffset: null };
  }
}

function summarizeTarget(target: X4UiLayoutTarget): X4UiHeadlessTargetSummary {
  return {
    id: target.id,
    kind: target.kind,
    name: target.name ?? null,
    handler: target.handler ?? null,
    lineStart: target.source.start.line,
    lineEnd: target.source.end.line,
  };
}

function selectTargetFromCatalog(
  targets: readonly X4UiLayoutTarget[],
  model: X4UiCallModel,
  requestedName?: string,
): X4UiLayoutTarget | null {
  if (targets.length === 0) return null;
  if (requestedName && requestedName.trim()) {
    const wanted = requestedName.trim();
    return (
      targets.find(t => t.name === wanted || t.id === wanted || t.handler === wanted)
      || targets.find(t => t.name?.endsWith(`.${wanted}`) || t.name?.endsWith(`:${wanted}`))
      || null
    );
  }
  // Prefer a target that directly calls createFrameHandle
  const frameContexts = new Set<string>();
  for (const rec of model.records) {
    if ('arguments' in rec && rec.name === 'createFrameHandle' && rec.context.source) {
      frameContexts.add(`${rec.context.source.start.offset}:${rec.context.source.end.offset}`);
    }
  }
  const directFrameTarget = targets.find(
    t => t.kind !== 'top-level' && frameContexts.has(`${t.source.start.offset}:${t.source.end.offset}`),
  ) || targets.find(t => frameContexts.has(`${t.source.start.offset}:${t.source.end.offset}`));
  if (directFrameTarget) return directFrameTarget;

  // Next prefer non-top-level function/method that builds tables
  const tableContexts = new Set<string>();
  for (const rec of model.records) {
    if ('arguments' in rec && rec.name === 'addTable' && rec.context.source) {
      tableContexts.add(`${rec.context.source.start.offset}:${rec.context.source.end.offset}`);
    }
  }
  const tableTarget = targets.find(
    t => t.kind !== 'top-level' && tableContexts.has(`${t.source.start.offset}:${t.source.end.offset}`),
  );
  if (tableTarget) return tableTarget;

  const nonTop = targets.find(t => t.kind !== 'top-level');
  return nonTop || targets[0] || null;
}

function buildSharedFramePreviewSource(
  rawSource: string,
  selectedTarget: X4UiLayoutTarget,
  model: X4UiCallModel,
  explicitFrameParam?: string,
): { source: string; targetName: string } | null {
  // Check whether selectedTarget already calls createFrameHandle directly
  const targetHasCreateFrame = model.records.some(
    rec => 'arguments' in rec
      && rec.name === 'createFrameHandle'
      && rec.context.source
      && rec.context.source.start.line === selectedTarget.source.start.line
      && rec.context.source.end.line === selectedTarget.source.end.line,
  );
  if (targetHasCreateFrame) return null;

  // Find addTable calls in this target whose receiver is a parameter
  const addTableCalls = model.records.filter(
    rec => 'arguments' in rec
      && rec.name === 'addTable'
      && rec.context.source
      && rec.context.source.start.line === selectedTarget.source.start.line
      && rec.context.source.end.line === selectedTarget.source.end.line,
  );
  if (addTableCalls.length === 0) return null;

  const parsed = inspectTopLevelLuaFunctions(rawSource);
  const fnInfo = parsed.functions.find(
    fn => fn.lineStart === selectedTarget.source.start.line && fn.lineEnd === selectedTarget.source.end.line,
  );
  if (!fnInfo || fnInfo.params.length === 0) return null;

  const inferredReceiver = addTableCalls
    .map(call => ('receiver' in call ? (call.receiver?.parameter?.name || call.receiver?.symbol || '') : ''))
    .find(name => name.length > 0 && fnInfo.params.includes(name));
  const frameParam = explicitFrameParam && fnInfo.params.includes(explicitFrameParam)
    ? explicitFrameParam
    : inferredReceiver || fnInfo.params[0];
  const frameParamIdx = fnInfo.params.indexOf(frameParam);
  if (frameParamIdx < 0) return null;

  // Replace only the single function header prefix on the exact same line (zero newline delta!)
  let rewritten = rawSource;
  let calleeIdent = fnInfo.fullName;
  if (!fnInfo.isLocal) {
    const replacementHeader = `local function ${SYNTHETIC_TARGET_FN}`;
    rewritten =
      rawSource.slice(0, fnInfo.headerStartOffset)
      + replacementHeader
      + rawSource.slice(fnInfo.openParenOffset);
    calleeIdent = SYNTHETIC_TARGET_FN;
  }

  const forwardedParams = fnInfo.params.filter((_, idx) => idx !== frameParamIdx);
  const callArgs = fnInfo.params.map((param, idx) => (idx === frameParamIdx ? '__forge_frame' : param));
  const hubTargetName = `${SYNTHETIC_PREVIEW_FN}.display`;
  const wrapperBlock = [
    '',
    `local ${SYNTHETIC_PREVIEW_FN} = { name = "__forge_shared_frame", layer = 1 }`,
    `function ${hubTargetName}(${forwardedParams.join(', ')})`,
    `  local __forge_frame = Helper.createFrameHandle(${SYNTHETIC_PREVIEW_FN}, { width = Helper.viewWidth, height = Helper.viewHeight })`,
    `  ${calleeIdent}(${callArgs.join(', ')})`,
    '  __forge_frame:display()',
    'end',
    '',
  ].join('\n');

  if (parsed.topLevelReturnOffset !== null) {
    const shift = rewritten.length - rawSource.length;
    const insertAt = parsed.topLevelReturnOffset + shift;
    rewritten = `${rewritten.slice(0, insertAt)}${wrapperBlock}${rewritten.slice(insertAt)}`;
  } else {
    rewritten = `${rewritten}${wrapperBlock}`;
  }

  return { source: rewritten, targetName: hubTargetName };
}

function intersectRects(a: X4UiSceneRect, b: X4UiSceneRect): X4UiSceneRect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 - x1 > 0.5 && y2 - y1 > 0.5) {
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return null;
}

function extractSceneOverlaps(scene: X4UiScene): X4UiHeadlessOverlapFinding[] {
  const findings: X4UiHeadlessOverlapFinding[] = [];
  // 1. Sibling frames on the same layer
  for (let i = 0; i < scene.frames.length; i++) {
    for (let j = i + 1; j < scene.frames.length; j++) {
      const a = scene.frames[i];
      const b = scene.frames[j];
      if (!a.rect || !b.rect) continue;
      if (a.layer !== undefined && b.layer !== undefined && a.layer !== b.layer) continue;
      const hit = intersectRects(a.rect, b.rect);
      if (hit) {
        findings.push({
          kind: 'frame-overlap',
          firstId: a.id,
          firstLine: a.source.start.line,
          secondId: b.id,
          secondLine: b.source.start.line,
          intersection: hit,
        });
      }
    }
  }
  // 2. Sibling tables within the same frame
  const tablesByFrame = new Map<string, typeof scene.tables[number][]>();
  for (const table of scene.tables) {
    const key = table.frameId || '__unframed__';
    const list = tablesByFrame.get(key) || [];
    list.push(table);
    tablesByFrame.set(key, list);
  }
  for (const list of tablesByFrame.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a.rect || !b.rect) continue;
        const hit = intersectRects(a.rect, b.rect);
        if (hit) {
          findings.push({
            kind: 'table-overlap',
            firstId: a.id,
            firstLine: a.source.start.line,
            secondId: b.id,
            secondLine: b.source.start.line,
            intersection: hit,
          });
        }
      }
    }
  }
  return findings.slice(0, MAX_REPORTED_ITEMS);
}

function extractClippedText(scene: X4UiScene): X4UiHeadlessClippedTextFinding[] {
  const widgetKindById = new Map<string, string>();
  for (const widget of scene.widgets) {
    widgetKindById.set(widget.id, widget.kind);
  }
  const clipped: X4UiHeadlessClippedTextFinding[] = [];
  for (const textNode of scene.texts) {
    for (const line of textNode.lines) {
      if (line.truncated || line.overflow) {
        clipped.push({
          textNodeId: textNode.id,
          widgetId: textNode.widgetId,
          widgetKind: widgetKindById.get(textNode.widgetId) || 'text',
          content: textNode.content ?? textNode.defaultContent ?? '',
          displayedText: line.displayedText,
          lineIndex: line.lineIndex,
          width: line.width,
          availableWidth: textNode.availableWidth ?? null,
          truncated: line.truncated,
          overflow: line.overflow,
          breakReason: line.breakReason,
          line: textNode.source.start.line,
          column: textNode.source.start.column,
        });
      }
    }
  }
  return clipped.slice(0, MAX_REPORTED_ITEMS);
}

function extractTableSummaries(
  program: X4UiLayoutProgram,
  scene: X4UiScene | null,
): X4UiHeadlessTableSummary[] {
  const frameRectById = new Map<string, X4UiSceneRect>();
  if (scene) {
    for (const f of scene.frames) {
      if (f.rect) frameRectById.set(f.id, f.rect);
    }
  }
  const sceneTableById = new Map<string, typeof scene extends null ? never : NonNullable<typeof scene>['tables'][number]>();
  if (scene) {
    for (const t of scene.tables) {
      sceneTableById.set(t.id, t);
    }
  }

  return program.tables.slice(0, MAX_REPORTED_ITEMS).map(pTable => {
    const sTable = sceneTableById.get(pTable.id);
    const frameRect = pTable.frameId ? frameRectById.get(pTable.frameId) : undefined;
    const rect = sTable?.rect ?? null;
    const fullHeight = sTable?.fullHeight ?? (pTable.height?.status === 'known' ? pTable.height.value ?? null : null);
    const visibleHeight = sTable?.visibleHeight ?? fullHeight;
    const maxVisibleHeight = sTable?.maxVisibleHeight ?? null;
    const scrollRequired =
      fullHeight !== null && maxVisibleHeight !== null && fullHeight > maxVisibleHeight;
    const exceedsFrameWidth = Boolean(
      rect && frameRect && rect.x + rect.width > frameRect.x + frameRect.width + 0.5,
    );
    const exceedsFrameHeight = Boolean(
      rect && frameRect && rect.y + rect.height > frameRect.y + frameRect.height + 0.5,
    );

    return {
      id: pTable.id,
      line: pTable.source.start.line,
      column: pTable.source.start.column,
      numColumns: pTable.numColumns ?? (sTable?.columns ? sTable.columns.length : null),
      rowCount: sTable ? sTable.rowIds.length : pTable.rowIds.length,
      requestedWidth: pTable.requestedWidth ?? null,
      width: rect ? rect.width : (pTable.requestedWidth ?? null),
      fullHeight,
      visibleHeight,
      maxVisibleHeight,
      reserveScrollBar: sTable?.reserveScrollBar ?? null,
      scrollRequired,
      exceedsFrameWidth,
      exceedsFrameHeight,
      rect,
    };
  });
}

function mapLintFinding(f: X4UiLintFinding) {
  return {
    code: f.code,
    severity: f.severity,
    message: f.message,
    line: f.source.start.line,
    column: f.source.start.column,
    nextAction: f.nextAction,
  };
}

function mapVerificationGap(g: X4UiLintVerificationGap, fallbackLoc?: X4UiSourceLocation) {
  const loc = g.source || fallbackLoc;
  return {
    category: g.category,
    status: g.status,
    expression: g.expression,
    reason: g.reason,
    line: loc?.start.line ?? 1,
    column: loc?.start.column ?? 0,
  };
}

export async function previewX4UiLua(req: X4UiHeadlessPreviewRequest): Promise<X4UiHeadlessPreviewResult> {
  const normalizedPath = req.logicalPath.replace(/\\/g, '/').replace(/^\/+/, '') || 'ui/inline_preview.lua';
  const byteLength = Buffer.byteLength(req.content, 'utf8');
  if (byteLength > MAX_PREVIEW_LUA_BYTES) {
    throw new Error(`X4 UI Lua preview input exceeds ${MAX_PREVIEW_LUA_BYTES} bytes (${byteLength} bytes).`);
  }

  const width = req.fixture?.drawable?.width ?? DEFAULT_DRAWABLE_WIDTH;
  const height = req.fixture?.drawable?.height ?? DEFAULT_DRAWABLE_HEIGHT;
  const uiScale = req.fixture?.uiScale ?? DEFAULT_UI_SCALE;

  // 1. Always build CallModel & run Linter against the EXACT unmodified source text
  const rawModel = buildX4UiCallModel({
    rel: normalizedPath,
    text: req.content,
    sourcePath: normalizedPath,
  });
  const lintResult = lintX4UiCallModel(rawModel);
  const rawCatalog = createX4UiLayoutTargetCatalog(rawModel);
  const targetSummaries = rawCatalog.targets.map(summarizeTarget);

  const cachedCorpus = await loadCachedCanonicalCorpus(req.referenceRoot);

  const chosenRawTarget = selectTargetFromCatalog(rawCatalog.targets, rawModel, req.target);
  if (!rawModel.parsed || !chosenRawTarget) {
    return {
      ok: true,
      schema: X4_UI_HEADLESS_PREVIEW_SCHEMA,
      gameTruth: NOT_VERIFIED_IN_GAME,
      path: normalizedPath,
      bytes: byteLength,
      corpus: {
        canonicalAssetsLoaded: cachedCorpus.corpus !== null,
        canonicalColorsLoaded: cachedCorpus.colors !== null,
        status: cachedCorpus.corpus ? 'canonical-9.00' : 'unavailable',
        ...(cachedCorpus.reason ? { reason: cachedCorpus.reason } : {}),
      },
      profile: { drawable: { width, height }, uiScale },
      lint: {
        parsed: lintResult.parsed,
        status: lintResult.status,
        summary: lintResult.summary,
        isStaticallyVerified: lintResult.isStaticallyVerified,
        errorCount: lintResult.errorCount,
        warningCount: lintResult.warningCount,
        verificationGapCount: lintResult.verificationGapCount,
        verificationGapsTruncated: lintResult.verificationGapsTruncated,
        findings: lintResult.findings.slice(0, MAX_REPORTED_ITEMS).map(mapLintFinding),
        verificationGaps: lintResult.verificationGaps.slice(0, MAX_REPORTED_ITEMS).map(g => mapVerificationGap(g)),
      },
      targets: targetSummaries,
      selectedTarget: chosenRawTarget ? summarizeTarget(chosenRawTarget) : null,
      previewHarness: 'none',
      layout: {
        programStatus: 'not-run',
        sceneStatus: 'unavailable',
        refusalReason: !rawModel.parsed
          ? 'Lua source contains syntax errors.'
          : req.target
            ? `Requested target "${req.target}" was not found in target catalog.`
            : 'No layout target was found in the Lua file.',
        frameCount: 0,
        tableCount: 0,
        rowCount: 0,
        widgetCount: 0,
        clippedTextCount: 0,
        overlapCount: 0,
        appliedSamples: 0,
        unresolvedSampleCount: 0,
        tables: [],
        clippedText: [],
        overlaps: [],
        unresolvedSamples: [],
      },
    };
  }

  // 2. Determine whether shared-frame parameter harness is needed
  let projectionModel = rawModel;
  let projectionTarget = chosenRawTarget;
  let previewHarness: 'direct' | 'shared-frame-parameter' = 'direct';

  const sharedHarness = buildSharedFramePreviewSource(
    req.content,
    chosenRawTarget,
    rawModel,
    req.fixture?.frameParameter,
  );
  if (sharedHarness) {
    const wrappedModel = buildX4UiCallModel({
      rel: normalizedPath,
      text: sharedHarness.source,
      sourcePath: normalizedPath,
    });
    if (wrappedModel.parsed) {
      const wrappedCatalog = createX4UiLayoutTargetCatalog(wrappedModel);
      const wrappedTarget = wrappedCatalog.targets.find(t => t.name === sharedHarness.targetName);
      if (wrappedTarget) {
        projectionModel = wrappedModel;
        projectionTarget = wrappedTarget;
        previewHarness = 'shared-frame-parameter';
      }
    }
  }

  const buildProfile = (withExpansion: boolean) => buildX4UiPreviewProfile({
    id: 'headless-preview-profile',
    provenance: 'Forge headless X4 UI Lua preview',
    truthGrade: req.fixture?.drawable || req.fixture?.uiScale !== undefined ? 'supplied' : 'unverified-default',
    source: projectionTarget.sourceIdentity,
    drawable: { width, height },
    uiScale,
    ...(withExpansion ? { localExpansion: { maxDepth: 4, maxInvocations: 16 } } : {}),
  });

  let layoutProfile = buildProfile(true);

  // Pass 1: Unsampled layout program to discover sampleCatalog and previewLoopCatalog
  let firstPass = projectX4UiLayoutProgram(
    projectionModel,
    projectionTarget,
    layoutProfile,
    undefined,
    undefined,
    cachedCorpus.colors ?? undefined,
    cachedCorpus.corpus ?? undefined,
  );

  // Graceful fallback if bounded localExpansion hits an unsupported parameter-table helper shape
  if (firstPass.status === 'refused' && previewHarness === 'direct') {
    const noExpansionProfile = buildProfile(false);
    const fallbackPass = projectX4UiLayoutProgram(
      projectionModel,
      projectionTarget,
      noExpansionProfile,
      undefined,
      undefined,
      cachedCorpus.colors ?? undefined,
      cachedCorpus.corpus ?? undefined,
    );
    if (fallbackPass.status !== 'refused') {
      layoutProfile = noExpansionProfile;
      firstPass = fallbackPass;
    }
  }

  if (firstPass.status === 'refused' || !('program' in firstPass) || !firstPass.program) {
    const refusalReason = 'refusal' in firstPass ? firstPass.refusal.message : 'Layout program refused target.';
    return {
      ok: true,
      schema: X4_UI_HEADLESS_PREVIEW_SCHEMA,
      gameTruth: NOT_VERIFIED_IN_GAME,
      path: normalizedPath,
      bytes: byteLength,
      corpus: {
        canonicalAssetsLoaded: cachedCorpus.corpus !== null,
        canonicalColorsLoaded: cachedCorpus.colors !== null,
        status: cachedCorpus.corpus ? 'canonical-9.00' : 'unavailable',
        ...(cachedCorpus.reason ? { reason: cachedCorpus.reason } : {}),
      },
      profile: { drawable: { width, height }, uiScale },
      lint: {
        parsed: lintResult.parsed,
        status: lintResult.status,
        summary: lintResult.summary,
        isStaticallyVerified: lintResult.isStaticallyVerified,
        errorCount: lintResult.errorCount,
        warningCount: lintResult.warningCount,
        verificationGapCount: lintResult.verificationGapCount,
        verificationGapsTruncated: lintResult.verificationGapsTruncated,
        findings: lintResult.findings.slice(0, MAX_REPORTED_ITEMS).map(mapLintFinding),
        verificationGaps: lintResult.verificationGaps.slice(0, MAX_REPORTED_ITEMS).map(g => mapVerificationGap(g)),
      },
      targets: targetSummaries,
      selectedTarget: summarizeTarget(chosenRawTarget),
      previewHarness,
      layout: {
        programStatus: 'refused',
        sceneStatus: 'unavailable',
        refusalReason,
        frameCount: 0,
        tableCount: 0,
        rowCount: 0,
        widgetCount: 0,
        clippedTextCount: 0,
        overlapCount: 0,
        appliedSamples: 0,
        unresolvedSampleCount: 0,
        tables: [],
        clippedText: [],
        overlaps: [],
        unresolvedSamples: [],
      },
    };
  }

  // Pass 2 (+ bounded Pass 3 when loop unrolling or dynamic column counts expose child samples)
  const sampleMap = req.fixture?.samples || {};
  const loopMap = req.fixture?.loops || {};

  const collectSampleInput = (prog: X4UiLayoutProgram) => {
    const values: X4UiLayoutPreviewSampleValue[] = [];
    for (const entry of prog.sampleCatalog.entries) {
      if (Object.prototype.hasOwnProperty.call(sampleMap, entry.expression)) {
        const candidate = sampleMap[entry.expression];
        if (typeof candidate === entry.expectedType) {
          values.push({ id: entry.id, value: candidate });
        }
      } else if (Object.prototype.hasOwnProperty.call(sampleMap, entry.id)) {
        const candidate = sampleMap[entry.id];
        if (typeof candidate === entry.expectedType) {
          values.push({ id: entry.id, value: candidate });
        }
      }
    }
    return values.length > 0
      ? {
          catalogId: prog.sampleCatalog.id,
          source: prog.sampleCatalog.sourceIdentity,
          values,
        }
      : undefined;
  };

  const collectLoopInput = (prog: X4UiLayoutProgram) => {
    const selections: X4UiLayoutPreviewLoopSelectionValue[] = [];
    for (const entry of prog.previewLoopCatalog.entries) {
      const byId = loopMap[entry.id] ?? loopMap[entry.loopId] ?? loopMap[`line:${entry.source.start.line}`] ?? loopMap[String(entry.source.start.line)] ?? loopMap.default;
      if (typeof byId === 'number' && Number.isSafeInteger(byId) && byId >= 0 && byId <= 64) {
        selections.push({ id: entry.id, iterationCount: byId });
      }
    }
    return selections.length > 0
      ? {
          catalogId: prog.previewLoopCatalog.id,
          source: prog.previewLoopCatalog.sourceIdentity,
          targetId: prog.previewLoopCatalog.targetId,
          profileId: prog.previewLoopCatalog.profileId,
          selections,
        }
      : undefined;
  };

  let currentPass = firstPass;
  const initialLoops = collectLoopInput(firstPass.program);
  if (initialLoops) {
    const loopPass = projectX4UiLayoutProgram(
      projectionModel,
      projectionTarget,
      layoutProfile,
      undefined,
      undefined,
      cachedCorpus.colors ?? undefined,
      cachedCorpus.corpus ?? undefined,
      initialLoops,
    );
    if (loopPass.status !== 'refused' && 'program' in loopPass && loopPass.program) {
      currentPass = loopPass;
    }
  }

  for (let round = 0; round < 2; round++) {
    if (!('program' in currentPass) || !currentPass.program) break;
    const nextSamples = collectSampleInput(currentPass.program);
    const nextLoops = collectLoopInput(currentPass.program);
    if (!nextSamples) break;
    const prevBoundCount = currentPass.program.previewSampleBindings.filter(b => b.status === 'consumed').length;
    if (round > 0 && nextSamples.values.length <= prevBoundCount) break;
    const candidatePass = projectX4UiLayoutProgram(
      projectionModel,
      projectionTarget,
      layoutProfile,
      nextSamples,
      undefined,
      cachedCorpus.colors ?? undefined,
      cachedCorpus.corpus ?? undefined,
      nextLoops,
    );
    if (candidatePass.status === 'refused' || !('program' in candidatePass) || !candidatePass.program) {
      break;
    }
    currentPass = candidatePass;
  }

  const activeProgram = ('program' in currentPass && currentPass.program)
    ? currentPass.program
    : firstPass.program;
  const activeProgramResult = ('program' in currentPass && currentPass.program)
    ? currentPass
    : firstPass;

  const consumedSampleIds = new Set(
    activeProgram.previewSampleBindings
      .filter(binding => binding.status === 'consumed')
      .map(binding => binding.id),
  );
  const unresolvedSamples: X4UiHeadlessUnresolvedSample[] = activeProgram.sampleCatalog.entries
    .filter(entry => !consumedSampleIds.has(entry.id) && entry.source.start.line <= req.content.split('\n').length)
    .slice(0, MAX_REPORTED_ITEMS)
    .map(entry => ({
      expression: entry.expression,
      expectedType: entry.expectedType,
      line: entry.source.start.line,
      column: entry.source.start.column,
    }));

  // Project Scene if canonical 9.00 corpus is loaded
  let projectedScene: X4UiScene | null = null;
  let sceneStatus: 'projected' | 'partial' | 'refused' | 'unavailable' = 'unavailable';
  let sceneRefusal: string | undefined;

  if (cachedCorpus.corpus) {
    const sceneProfile: X4UiSceneProfile = {
      id: activeProgram.profile.id,
      provenance: activeProgram.profile.provenance,
      source: activeProgram.profile.source,
      helper: { sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath, sha256: X4_LAYOUT_PROVENANCE.helperSha256 },
      widget: { sourcePath: X4_LAYOUT_PROVENANCE.widgetSourcePath, sha256: X4_LAYOUT_PROVENANCE.widgetSha256 },
      fonts: {
        Zekton: {
          descriptor: {
            relativePath: cachedCorpus.corpus.assets.regular.descriptor.relativePath,
            sha256: cachedCorpus.corpus.assets.regular.descriptor.sha256,
          } as X4UiSceneProfile['fonts']['Zekton']['descriptor'],
          atlas: {
            relativePath: cachedCorpus.corpus.assets.regular.atlas.relativePath,
            sha256: cachedCorpus.corpus.assets.regular.atlas.sha256,
          } as X4UiSceneProfile['fonts']['Zekton']['atlas'],
        },
        'Zekton Bold': {
          descriptor: {
            relativePath: cachedCorpus.corpus.assets.bold.descriptor.relativePath,
            sha256: cachedCorpus.corpus.assets.bold.descriptor.sha256,
          } as X4UiSceneProfile['fonts']['Zekton Bold']['descriptor'],
          atlas: {
            relativePath: cachedCorpus.corpus.assets.bold.atlas.relativePath,
            sha256: cachedCorpus.corpus.assets.bold.atlas.sha256,
          } as X4UiSceneProfile['fonts']['Zekton Bold']['atlas'],
        },
      },
      drawable: { width: activeProgram.profile.frame.width, height: activeProgram.profile.frame.height },
      textPolicy: {
        nominalDesignSize: 32,
        lineSpacing: 0,
        wrapMode: 'word-wrap',
        truncationMode: 'ellipsis',
        whitespacePolicy: {
          mode: 'preserve',
          breakOn: 'ascii-space',
        },
        ellipsisPolicy: {
          token: '...',
          placement: 'end',
        },
        newlinePolicy: 'lf-crlf',
        truthGrade: ZEKTON_TEXT_TRUTH_GRADE,
        evidenceState: ZEKTON_EVIDENCE_STATE,
      },
    };
    const sceneRes = projectX4UiScene(activeProgramResult, cachedCorpus.corpus, sceneProfile);
    if (sceneRes.status === 'refused') {
      sceneStatus = 'refused';
      sceneRefusal = sceneRes.refusal.message;
    } else {
      sceneStatus = sceneRes.status;
      projectedScene = sceneRes.scene;
    }
  }

  const tables = extractTableSummaries(activeProgram, projectedScene);
  const clippedText = projectedScene ? extractClippedText(projectedScene) : [];
  const overlaps = projectedScene ? extractSceneOverlaps(projectedScene) : [];

  return {
    ok: true,
    schema: X4_UI_HEADLESS_PREVIEW_SCHEMA,
    gameTruth: NOT_VERIFIED_IN_GAME,
    path: normalizedPath,
    bytes: byteLength,
    corpus: {
      canonicalAssetsLoaded: cachedCorpus.corpus !== null,
      canonicalColorsLoaded: cachedCorpus.colors !== null,
      status: cachedCorpus.corpus ? 'canonical-9.00' : 'unavailable',
      ...(cachedCorpus.reason ? { reason: cachedCorpus.reason } : {}),
    },
    profile: { drawable: { width, height }, uiScale },
    lint: {
      parsed: lintResult.parsed,
      status: lintResult.status,
      summary: lintResult.summary,
      isStaticallyVerified: lintResult.isStaticallyVerified,
      errorCount: lintResult.errorCount,
      warningCount: lintResult.warningCount,
      verificationGapCount: lintResult.verificationGapCount,
      verificationGapsTruncated: lintResult.verificationGapsTruncated,
      findings: lintResult.findings.slice(0, MAX_REPORTED_ITEMS).map(mapLintFinding),
      verificationGaps: lintResult.verificationGaps.slice(0, MAX_REPORTED_ITEMS).map(g => mapVerificationGap(g)),
    },
    targets: targetSummaries,
    selectedTarget: summarizeTarget(chosenRawTarget),
    previewHarness,
    layout: {
      programStatus: activeProgram.status,
      sceneStatus,
      ...(sceneRefusal ? { refusalReason: sceneRefusal } : {}),
      frameCount: projectedScene ? projectedScene.frames.length : activeProgram.frames.length,
      tableCount: tables.length,
      rowCount: projectedScene ? projectedScene.rows.length : activeProgram.rows.length,
      widgetCount: projectedScene ? projectedScene.widgets.length : 0,
      clippedTextCount: clippedText.length,
      overlapCount: overlaps.length,
      appliedSamples: consumedSampleIds.size,
      unresolvedSampleCount: unresolvedSamples.length,
      tables,
      clippedText,
      overlaps,
      unresolvedSamples,
    },
  };
}
