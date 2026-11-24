/** Read-only canonical X4 unpacked-reference routes and validation service. */

import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { resolveX4ReferenceRoot, resolveXsdConfig } from '../lib/xsdParser';
import {
  assertReferenceRootDirectory,
  getReferenceCorpus,
  peekReferenceCorpus,
  resolveReferenceFile,
  runReferenceCorpusSelftest,
  type ReferenceCorpus,
} from '../lib/referenceCorpus';
import {
  completeReferenceDocument,
  getReferenceLanguageResources,
  hoverReferenceDocument,
  type ReferenceLanguageRequest,
} from '../lib/referenceLanguage';
import {
  getReferenceCoverage,
  getReferenceManifestStatus,
  queryReferenceManifest,
  scheduleReferenceManifest,
  type ReferenceManifestStatus,
} from '../lib/referenceManifest';
import { effectiveReferenceMetadata, resolveEffectiveReferenceDocument } from '../lib/referenceOverlay';
import { simulateXmlDiff } from '../lib/diffSimulator';
import { projectReferenceSymbols, suggestReferences, type ReferenceSuggestionIntent } from '../lib/referenceSuggestions';
import type { CanonicalSymbolKind } from '../lib/referenceCorpus';
import type { ModWorkspace } from '../types';
import { completeXPath } from '../lib/xpathCompletion';
import type { InstanceRecord } from '../lib/instanceDiscovery';
import { parseEditorOrderFiles } from '../../shared/referenceEditorOrders';

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function forceRefresh(req: Request): boolean { return /^(1|true|yes)$/i.test(String(req.query.refresh || '')); }

function load(req?: Request): ReferenceCorpus {
  const resolved = resolveXsdConfig();
  return getReferenceCorpus(resolved.x4ReferenceRoot, req ? forceRefresh(req) : false);
}

export function getCanonicalReferenceCorpus(): ReferenceCorpus | null {
  try { return load(); } catch { return null; }
}

function languageRequest(req: Request): ReferenceLanguageRequest {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const filePath = typeof body.path === 'string' ? body.path : '';
  const content = typeof body.content === 'string' ? body.content : '';
  const line = Number(body.line);
  const column = Number(body.column);
  if (!filePath.trim()) throw new Error('Invalid request: path is required.');
  if (typeof body.content !== 'string') throw new Error('Invalid request: content must be a string.');
  if (content.length > 5_000_000) throw new Error('Invalid request: content exceeds 5 MB.');
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 0 || column < 0) {
    throw new Error('Invalid request: line and column must be non-negative integers.');
  }
  return { path: filePath, content, line, column };
}

export function getCanonicalReferenceSets(): { macros: Set<string>; wares: Set<string>; factions: Set<string>; sectors: Set<string>; jobs: Set<string>; aiScripts: Set<string> } {
  try { return load().references; }
  catch { return { macros: new Set(), wares: new Set(), factions: new Set(), sectors: new Set(), jobs: new Set(), aiScripts: new Set() }; }
}

export function initializeReferenceCorpus(): void {
  const resolved = resolveXsdConfig();
  if (!resolved.x4ReferenceExists) {
    console.warn(`[reference-corpus] unavailable: ${resolved.x4ReferenceRoot} (set X4_REFERENCE_ROOT or Directory Settings)`);
    return;
  }
  try {
    const corpus = getReferenceCorpus(resolved.x4ReferenceRoot);
    console.log(`[reference-corpus] loaded ${corpus.factions.length} factions, ${corpus.wares.length} wares, ${corpus.sectors.length} sectors from ${corpus.sourceFiles.length} files (${corpus.root})`);
    const manifest = getReferenceManifestStatus(corpus.root);
    console.log(`[reference-manifest] ${manifest.state}: ${manifest.root}`);
  } catch (error) {
    console.warn(`[reference-corpus] failed to load ${resolved.x4ReferenceRoot}: ${errorText(error)}`);
  }
}

export function startCanonicalReferenceManifest(force = false): ReferenceManifestStatus {
  const resolved = resolveXsdConfig();
  return scheduleReferenceManifest(resolved.x4ReferenceRoot, force);
}

function sendCorpusError(res: Response, error: unknown, instance?: Omit<InstanceRecord, 'cwd'>): Response {
  const message = errorText(error);
  const body = { error: message || 'Reference corpus request failed.', ...(instance ? { instance } : {}) };
  if (/invalid request|outside the document|outside line|missing path/i.test(message)) return res.status(400).json(body);
  if (/traversal/i.test(message)) return res.status(403).json(body);
  if (/file not found/i.test(message)) return res.status(404).json(body);
  if (/root.*(unavailable|does not exist|not a directory)|script symbol origins unavailable/i.test(message)) return res.status(503).json(body);
  return res.status(500).json(body);
}

function validateReferenceCapabilityQuery(
  query: Request['query'],
  allowedKeys: readonly string[],
  capabilityId: string,
): string | null {
  const unknown = Object.keys(query).filter(key => !allowedKeys.includes(key));
  if (unknown.length) return `${capabilityId} does not accept: ${unknown.join(', ')}`;
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value !== undefined && typeof value !== 'string') {
      return `${capabilityId} query parameter ${key} must be a single string.`;
    }
  }
  return null;
}

function stripManifestRoot(manifest: ReferenceManifestStatus): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...manifest };
  delete copy.root;
  return copy;
}

export function respondAgentEffectiveReferenceFile(req: Request, res: Response): Response {
  const queryError = validateReferenceCapabilityQuery(
    req.query,
    ['path', 'refresh', 'view', 'compact', 'workspaceId', 'clientId'],
    'reference.file.read',
  );
  if (queryError) return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: queryError });
  const rawPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  if (!rawPath || rawPath.length > 1024) {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'reference.file.read requires a bounded non-empty ?path= query parameter.' });
  }
  if (req.query.refresh !== undefined && req.query.refresh !== '0' && req.query.refresh !== '1') {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?refresh= must be 0 or 1.' });
  }
  if (req.query.view !== undefined && req.query.view !== 'script-symbol-origins') {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?view= must be script-symbol-origins.' });
  }
  if (req.query.compact !== undefined && req.query.compact !== '0' && req.query.compact !== '1') {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?compact= must be 0 or 1.' });
  }
  try {
    const origins = req.query.view === 'script-symbol-origins';
    const root = origins ? resolveX4ReferenceRoot() : load(req).root;
    res.set('Cache-Control', 'no-store');
    const effective = resolveEffectiveReferenceDocument(root, rawPath, forceRefresh(req), { scriptSymbolOrigins: origins });
    const stripRoot = <T extends Record<string, unknown>>(payload: T): Omit<T, 'root'> => {
      const copy: Record<string, unknown> = { ...payload };
      delete copy.root;
      return copy as Omit<T, 'root'>;
    };
    if (!effective.available || effective.content === undefined) {
      return res.status(404).json(stripRoot({ error: `Canonical effective file not found: ${rawPath}`, ...effective }));
    }
    if (effective.complete !== true) {
      return res.status(503).json(stripRoot({
        ...effective,
        code: 'REFERENCE_EFFECTIVE_INCOMPLETE',
        error: 'Canonical reference composition is incomplete; inspect the active source findings.',
      }));
    }
    if (origins && !effective.scriptSymbolOrigins?.complete) {
      return res.status(503).json(stripRoot({
        ...effective,
        code: 'REFERENCE_SCRIPT_ORIGINS_INCOMPLETE',
        error: effective.scriptSymbolOrigins?.detail ?? 'Script symbol origins unavailable.',
      }));
    }
    if (origins && req.query.compact === '1') {
      return res.json({
        relativePath: effective.relativePath,
        available: effective.available,
        complete: effective.complete,
        scriptSymbolOrigins: effective.scriptSymbolOrigins,
      });
    }
    return res.json(stripRoot(effective as unknown as Record<string, unknown>));
  } catch (error) { return sendCorpusError(res, error); }
}

export function respondAgentSimulateDiff(req: Request, res: Response): Response {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'patch.diff.simulate requires a JSON object body.' });
    }
    const body = req.body as Record<string, unknown>;
    const unknown = Object.keys(body).filter(key => !['path', 'content'].includes(key));
    if (unknown.length) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: `patch.diff.simulate does not accept: ${unknown.join(', ')}` });
    }
    const relativePath = typeof body.path === 'string' ? body.path.trim() : '';
    const diff = typeof body.content === 'string' ? body.content : '';
    if (!relativePath || relativePath.length > 1024) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: path is required.' });
    }
    if (typeof body.content !== 'string') {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: content must be a string.' });
    }
    if (diff.length > 5_000_000) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: content exceeds 5 MB.' });
    }
    const corpus = load(req);
    const effective = resolveEffectiveReferenceDocument(corpus.root, relativePath, false);
    if (!effective.available || effective.content === undefined) {
      return res.status(404).json({ error: `Canonical base file not found: ${relativePath}`, effective });
    }
    const base = effectiveReferenceMetadata(effective);
    if (effective.complete !== true) {
      return res.status(503).json({
        path: effective.relativePath,
        base,
        ok: false,
        code: 'REFERENCE_EFFECTIVE_INCOMPLETE',
        error: 'Canonical reference composition is incomplete; diff simulation is unavailable.',
      });
    }
    const simulation = simulateXmlDiff(effective.content, diff);
    return res.json({
      path: effective.relativePath,
      base,
      ...simulation,
    });
  } catch (error) { return sendCorpusError(res, error); }
}

export function respondAgentReferenceStatus(req: Request, res: Response): Response {
  res.set('Cache-Control', 'no-store');
  const queryError = validateReferenceCapabilityQuery(
    req.query,
    ['observe', 'refresh', 'workspaceId', 'clientId'],
    'reference.status.read',
  );
  if (queryError) return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: queryError });
  if (req.query.observe !== undefined && req.query.observe !== '0' && req.query.observe !== '1') {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?observe= must be 0 or 1.' });
  }
  if (req.query.refresh !== undefined && req.query.refresh !== '0' && req.query.refresh !== '1') {
    return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?refresh= must be 0 or 1.' });
  }
  const observe = req.query.observe === '1';
  try {
    if (observe) {
      const resolved = resolveXsdConfig();
      const root = assertReferenceRootDirectory(resolved.x4ReferenceRoot);
      const manifest = getReferenceManifestStatus(root, { openDatabase: false });
      const corpus = peekReferenceCorpus(root);
      if (!corpus) {
        return res.json({
          available: false,
          observed: true,
          state: manifest.state === 'scanning' || manifest.state === 'stale' ? 'scanning' : 'cold',
          generatedAt: null,
          manifestGeneration: manifest.current?.generation || null,
          sourceFiles: 0,
          counts: null,
          manifest: stripManifestRoot(manifest),
        });
      }
      return res.json({
        available: true,
        observed: true,
        generatedAt: corpus.generatedAt,
        manifestGeneration: corpus.manifestGeneration || null,
        sourceFiles: corpus.sourceFiles.length,
        counts: { factions: corpus.factions.length, wares: corpus.wares.length, jobs: corpus.jobs.length, aiScripts: corpus.aiScripts.length, sectors: corpus.sectors.length, scriptProperties: corpus.scriptProperties.length },
        manifest: stripManifestRoot(manifest),
      });
    }
    const corpus = load(req);
    let manifest = req.query.refresh === '1'
      ? scheduleReferenceManifest(corpus.root, true)
      : getReferenceManifestStatus(corpus.root);
    if (manifest.state === 'idle') manifest = scheduleReferenceManifest(corpus.root, false);
    return res.json({
      available: true,
      generatedAt: corpus.generatedAt,
      manifestGeneration: corpus.manifestGeneration || null,
      sourceFiles: corpus.sourceFiles.length,
      counts: { factions: corpus.factions.length, wares: corpus.wares.length, jobs: corpus.jobs.length, aiScripts: corpus.aiScripts.length, sectors: corpus.sectors.length, scriptProperties: corpus.scriptProperties.length },
      manifest: stripManifestRoot(manifest),
    });
  } catch (error) { return sendCorpusError(res, error); }
}

export function respondAgentReferenceSuggest(req: Request, res: Response, workspace?: ModWorkspace | null): Response {
  try {
    const queryError = validateReferenceCapabilityQuery(
      req.query,
      ['kind', 'q', 'intent', 'limit', 'refresh', 'workspaceId', 'clientId'],
      'reference.suggest',
    );
    if (queryError) return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: queryError });
    const kind = String(req.query.kind || '').trim().toLowerCase() as CanonicalSymbolKind;
    const allowedKinds = new Set<CanonicalSymbolKind>(['faction', 'ware', 'sector', 'macro', 'job', 'aiscript']);
    if (!allowedKinds.has(kind)) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?kind=faction|ware|sector|macro|job|aiscript required.' });
    }
    const q = String(req.query.q || '').trim();
    if (q.length > 256) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?q= must be at most 256 characters.' });
    }
    if (!q && req.query.limit === undefined) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?q=<text> or an explicit bounded ?limit= is required.' });
    }
    const intentInput = String(req.query.intent || 'reference').trim().toLowerCase();
    if (!['reference', 'new-definition', 'selector'].includes(intentInput)) {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?intent=reference|new-definition|selector required.' });
    }
    let parsedLimit = 25;
    if (req.query.limit !== undefined && String(req.query.limit).trim() !== '') {
      const candidate = Number(req.query.limit);
      if (!Number.isInteger(candidate) || candidate < 1 || candidate > 100) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?limit= must be an integer between 1 and 100.' });
      }
      parsedLimit = candidate;
    }
    if (req.query.refresh !== undefined && req.query.refresh !== '0' && req.query.refresh !== '1') {
      return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?refresh= must be 0 or 1.' });
    }
    const corpus = load(req);
    const items = suggestReferences(corpus, {
      kind,
      query: q,
      intent: intentInput as ReferenceSuggestionIntent,
      limit: parsedLimit,
      projectSymbols: projectReferenceSymbols(workspace),
    });
    return res.json({ generation: corpus.manifestGeneration || corpus.signature, kind, query: q, intent: intentInput, items });
  } catch (error) { return sendCorpusError(res, error); }
}

export function registerReferenceRoutes(
  app: Express,
  workspaceProvider?: (req: Request) => ModWorkspace | null | undefined,
  publicInstance?: () => Omit<InstanceRecord, 'cwd'>,
  editorTextHover?: (req: Request, document: ReferenceLanguageRequest) => { status: number; value: unknown } | undefined,
  editorOrderScope?: (req: Request, sourceRoot: unknown) => { allowed: boolean; workspace?: ModWorkspace },
): void {
  app.get('/api/reference/effective-file', (req, res) => {
    try {
      const origins = req.query.view === 'script-symbol-origins';
      const root = origins ? resolveX4ReferenceRoot() : load(req).root;
      if (origins) res.set('Cache-Control', 'no-store');
      const effective = resolveEffectiveReferenceDocument(root, String(req.query.path || ''), forceRefresh(req), { scriptSymbolOrigins: origins });
      if (!effective.available || effective.content === undefined) return res.status(404).json({ error: `Canonical effective file not found: ${String(req.query.path || '')}`, ...effective });
      if (effective.complete !== true) return res.status(503).json({ ...effective,
        code: 'REFERENCE_EFFECTIVE_INCOMPLETE', error: 'Canonical reference composition is incomplete; inspect the active source findings.' });
      if (origins && !effective.scriptSymbolOrigins?.complete) return res.status(503).json({ ...effective,
        code: 'REFERENCE_SCRIPT_ORIGINS_INCOMPLETE', error: effective.scriptSymbolOrigins?.detail ?? 'Script symbol origins unavailable.' });
      if (origins && req.query.compact === '1') return res.json({
        root: effective.root, relativePath: effective.relativePath, complete: effective.complete,
        scriptSymbolOrigins: effective.scriptSymbolOrigins,
      });
      return res.json(effective);
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.post('/api/reference/xpath-complete', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
      const relativePath = typeof body.path === 'string' ? body.path.trim() : '';
      const selector = typeof body.selector === 'string' ? body.selector : '';
      const cursor = Number(body.cursor);
      if (!relativePath) throw new Error('Invalid request: path is required.');
      if (typeof body.selector !== 'string') throw new Error('Invalid request: selector must be a string.');
      if (selector.length > 16_384) throw new Error('Invalid request: selector exceeds 16 KB.');
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > selector.length) throw new Error('Invalid request: cursor is outside the selector.');
      const corpus = load(req);
      const effective = resolveEffectiveReferenceDocument(corpus.root, relativePath, forceRefresh(req));
      if (!effective.available || effective.content === undefined) return res.status(404).json({ error: `Canonical effective file not found: ${relativePath}`, effective });
      if (effective.complete !== true) return res.status(503).json({ path: effective.relativePath, ...effectiveReferenceMetadata(effective),
        code: 'REFERENCE_EFFECTIVE_INCOMPLETE', error: 'Canonical reference composition is incomplete; XPath completion is unavailable.', items: [] });
      const items = completeXPath({
        targetPath: effective.relativePath,
        content: effective.content,
        selector,
        cursor,
        corpus,
        limit: Number(body.limit || 50),
      });
      return res.json({ path: effective.relativePath, ...effectiveReferenceMetadata(effective), items });
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.post('/api/reference/simulate-diff', (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'patch.diff.simulate requires a JSON object body.' });
      }
      const body = req.body as Record<string, unknown>;
      const unknown = Object.keys(body).filter(key => !['path', 'content'].includes(key));
      if (unknown.length) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: `patch.diff.simulate does not accept: ${unknown.join(', ')}` });
      }
      const relativePath = typeof body.path === 'string' ? body.path.trim() : '';
      const diff = typeof body.content === 'string' ? body.content : '';
      if (!relativePath || relativePath.length > 1024) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: path is required.' });
      }
      if (typeof body.content !== 'string') {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: content must be a string.' });
      }
      if (diff.length > 5_000_000) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Invalid request: content exceeds 5 MB.' });
      }
      const corpus = load(req);
      const effective = resolveEffectiveReferenceDocument(corpus.root, relativePath, forceRefresh(req));
      if (!effective.available || effective.content === undefined) {
        return res.status(404).json({ error: `Canonical base file not found: ${relativePath}`, effective });
      }
      const base = effectiveReferenceMetadata(effective);
      if (effective.complete !== true) return res.status(503).json({ path: effective.relativePath, base, ok: false,
        code: 'REFERENCE_EFFECTIVE_INCOMPLETE', error: 'Canonical reference composition is incomplete; diff simulation is unavailable.' });
      const simulation = simulateXmlDiff(effective.content, diff);
      return res.json({
        path: effective.relativePath,
        base,
        ...simulation,
      });
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.post('/api/reference/complete', (req, res) => {
    try {
      const request = languageRequest(req);
      let workspace = workspaceProvider?.(req);
      if (req.body.editorOrderFiles !== undefined) {
        res.set('Cache-Control', 'no-store');
        const scope = editorOrderScope?.(req, req.body.editorSourceRoot);
        if (!scope?.allowed) return res.status(403).json({
          code: 'EDITOR_ORDER_OVERLAY_FORBIDDEN', error: 'Editor order buffers require the Studio actor.',
        });
        const files = parseEditorOrderFiles(req.body.editorOrderFiles);
        if (!files) throw new Error('Invalid request: editor order files require unique direct AI XML paths within the text budget.');
        workspace = scope.workspace;
        if (workspace) request.editorOrderFiles = files;
      }
      const corpus = load(req);
      return res.json(completeReferenceDocument(request, getReferenceLanguageResources(corpus, request, workspace)));
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.post('/api/reference/hover', (req, res) => {
    try {
      const request = languageRequest(req);
      const textHover = editorTextHover?.(req, request);
      if (textHover) return res.set('Cache-Control', 'no-store').status(textHover.status).json(textHover.value);
      const corpus = load(req);
      const workspace = req.body.textLanguage === undefined ? workspaceProvider?.(req) : undefined;
      return res.json(hoverReferenceDocument(request, getReferenceLanguageResources(corpus, request, workspace)));
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const instance = publicInstance?.();
    const observe = req.query.observe === '1';
    try {
      if (observe) {
        const resolved = resolveXsdConfig();
        const root = assertReferenceRootDirectory(resolved.x4ReferenceRoot);
        const manifest = getReferenceManifestStatus(root, { openDatabase: false });
        const corpus = peekReferenceCorpus(root);
        if (!corpus) {
          return res.json({
            available: false,
            observed: true,
            state: manifest.state === 'scanning' || manifest.state === 'stale' ? 'scanning' : 'cold',
            instance,
            root,
            generatedAt: null,
            manifestGeneration: manifest.current?.generation || null,
            sourceFiles: 0,
            counts: null,
            manifest,
          });
        }
        return res.json({
          available: true,
          observed: true,
          instance,
          root: corpus.root,
          generatedAt: corpus.generatedAt,
          manifestGeneration: corpus.manifestGeneration || null,
          sourceFiles: corpus.sourceFiles.length,
          counts: { factions: corpus.factions.length, wares: corpus.wares.length, jobs: corpus.jobs.length, aiScripts: corpus.aiScripts.length, sectors: corpus.sectors.length, scriptProperties: corpus.scriptProperties.length },
          manifest,
        });
      }
      const corpus = load(req);
      const manifest = getReferenceManifestStatus(corpus.root);
      return res.json({
        available: true,
        instance,
        root: corpus.root,
        generatedAt: corpus.generatedAt,
        manifestGeneration: corpus.manifestGeneration || null,
        sourceFiles: corpus.sourceFiles.length,
        counts: { factions: corpus.factions.length, wares: corpus.wares.length, jobs: corpus.jobs.length, aiScripts: corpus.aiScripts.length, sectors: corpus.sectors.length, scriptProperties: corpus.scriptProperties.length },
        manifest,
      });
    } catch (error) { return sendCorpusError(res, error, instance); }
  });

  app.get('/api/reference/manifest', (req, res) => {
    try {
      const observe = req.query.observe === '1';
      const root = observe ? resolveX4ReferenceRoot() : resolveXsdConfig().x4ReferenceRoot;
      if (observe) res.set('Cache-Control', 'no-store');
      let status = !observe && forceRefresh(req)
        ? scheduleReferenceManifest(root, true)
        : getReferenceManifestStatus(root, { openDatabase: !observe });
      if (!observe && status.state === 'idle') status = scheduleReferenceManifest(root, false);
      if (observe && !status.current) return res.status(status.state === 'unavailable' || status.state === 'error' ? 503 : 202)
        .json({ status, files: [], total: 0 });
      const extensionInput = String(req.query.extension || '').trim().toLowerCase();
      const result = queryReferenceManifest(root, {
        q: String(req.query.q || '').trim(),
        extension: extensionInput ? (extensionInput.startsWith('.') ? extensionInput : `.${extensionInput}`) : undefined,
        source: String(req.query.source || '').trim().toLowerCase() || undefined,
        domain: String(req.query.domain || '').trim().toLowerCase() || undefined,
        role: String(req.query.role || '').trim().toLowerCase() || undefined,
        authority: String(req.query.authority || '').trim().toLowerCase() || undefined,
        consumer: String(req.query.consumer || '').trim().toLowerCase() || undefined,
        limit: Number(req.query.limit || 100),
        offset: Number(req.query.offset || 0),
      });
      if (!result) return res.status(status.state === 'error' || status.state === 'unavailable' ? 503 : 202).json({ status, files: [], total: 0 });
      return res.json({ status, ...result });
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/coverage', (req, res) => {
    try {
      const resolved = resolveXsdConfig();
      let status = forceRefresh(req)
        ? scheduleReferenceManifest(resolved.x4ReferenceRoot, true)
        : getReferenceManifestStatus(resolved.x4ReferenceRoot);
      if (status.state === 'idle') status = scheduleReferenceManifest(resolved.x4ReferenceRoot, false);
      const coverage = getReferenceCoverage(resolved.x4ReferenceRoot);
      if (!coverage) return res.status(status.state === 'error' || status.state === 'unavailable' ? 503 : 202).json({ status });
      return res.json({ status, coverage });
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/factions', (req, res) => {
    try { return res.json(load(req).factions); }
    catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/wares', (req, res) => {
    try { return res.json(load(req).wares); }
    catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/jobs', (req, res) => {
    try { return res.json(load(req).jobs); }
    catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/aiscripts', (req, res) => {
    try { return res.json(load(req).aiScripts); }
    catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/suggest', (req, res) => {
    try {
      const queryError = validateReferenceCapabilityQuery(
        req.query,
        ['kind', 'q', 'intent', 'limit', 'refresh', 'workspaceId', 'clientId'],
        'reference.suggest',
      );
      if (queryError) return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: queryError });
      const kind = String(req.query.kind || '').trim().toLowerCase() as CanonicalSymbolKind;
      const allowedKinds = new Set<CanonicalSymbolKind>(['faction', 'ware', 'sector', 'macro', 'job', 'aiscript']);
      if (!allowedKinds.has(kind)) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?kind=faction|ware|sector|macro|job|aiscript required.' });
      }
      const q = String(req.query.q || '').trim();
      if (q.length > 256) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?q= must be at most 256 characters.' });
      }
      if (!q && req.query.limit === undefined) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?q=<text> or an explicit bounded ?limit= is required.' });
      }
      const intentInput = String(req.query.intent || 'reference').trim().toLowerCase();
      if (!['reference', 'new-definition', 'selector'].includes(intentInput)) {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?intent=reference|new-definition|selector required.' });
      }
      let parsedLimit = 25;
      if (req.query.limit !== undefined && String(req.query.limit).trim() !== '') {
        const candidate = Number(req.query.limit);
        if (!Number.isInteger(candidate) || candidate < 1 || candidate > 100) {
          return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Query ?limit= must be an integer between 1 and 100.' });
        }
        parsedLimit = candidate;
      }
      if (req.query.refresh !== undefined && req.query.refresh !== '0' && req.query.refresh !== '1') {
        return res.status(400).json({ code: 'CAPABILITY_INPUT_INVALID', error: 'Optional ?refresh= must be 0 or 1.' });
      }
      const corpus = load(req);
      const items = suggestReferences(corpus, {
        kind,
        query: q,
        intent: intentInput as ReferenceSuggestionIntent,
        limit: parsedLimit,
        projectSymbols: projectReferenceSymbols(workspaceProvider?.(req)),
      });
      return res.json({ generation: corpus.manifestGeneration || corpus.signature, kind, query: q, intent: intentInput, items });
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/sectors', (req, res) => {
    try { return res.json(load(req).sectors); }
    catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/scriptproperties', (req, res) => {
    try {
      const datatype = String(req.query.datatype || '').trim().toLowerCase();
      const keyword = String(req.query.keyword || '').trim().toLowerCase();
      const entries = load(req).scriptProperties.filter(entry =>
        (!datatype || (entry.kind === 'datatype' && entry.name === datatype))
        && (!keyword || (entry.kind === 'keyword' && entry.name === keyword)),
      );
      return res.json(entries);
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/file', (req, res) => {
    try {
      const resolved = resolveXsdConfig();
      const file = resolveReferenceFile(resolved.x4ReferenceRoot, String(req.query.path || ''));
      const ext = path.extname(file).toLowerCase();
      if (ext === '.xml' || ext === '.xsd' || ext === '.lua' || ext === '.txt' || ext === '.md') {
        const type = ext === '.xml' || ext === '.xsd' ? 'application/xml' : 'text/plain';
        return res.status(200).type(type).send(fs.readFileSync(file));
      }
      return res.status(200).type('application/octet-stream').send(fs.readFileSync(file));
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/search', (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      if (!q) return res.status(400).json({ error: 'Query ?q=<text> required.' });
      const kind = String(req.query.kind || '').trim().toLowerCase();
      const corpus = load(req);
      const result: Array<Record<string, unknown>> = [];
      const push = (recordKind: string, value: Record<string, unknown>) => {
        if (kind && kind !== recordKind && !(kind === 'property' && recordKind === 'property')) return;
        const haystack = JSON.stringify(value).toLowerCase();
        if (haystack.includes(q)) result.push({ kind: recordKind, ...value });
      };
      for (const f of corpus.factions) push('faction', f as unknown as Record<string, unknown>);
      for (const w of corpus.wares) push('ware', w as unknown as Record<string, unknown>);
      for (const job of corpus.jobs) push('job', job as unknown as Record<string, unknown>);
      for (const { id, name, source, path } of corpus.aiScripts) push('aiscript', { id, name, source, path });
      for (const s of corpus.sectors) push('sector', s as unknown as Record<string, unknown>);
      for (const entry of corpus.scriptProperties) {
        for (const property of entry.properties) push('property', { ownerKind: entry.kind, owner: entry.name, ...property });
      }
      return res.json(result.slice(0, 200));
    } catch (error) { return sendCorpusError(res, error); }
  });

  app.get('/api/reference/selftest', (_req, res) => {
    try { return res.json(runReferenceCorpusSelftest()); }
    catch (error) { return res.status(500).json({ pass: false, error: errorText(error) }); }
  });
}
