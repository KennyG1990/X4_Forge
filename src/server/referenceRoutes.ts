/** Read-only canonical X4 unpacked-reference routes and validation service. */

import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { resolveXsdConfig } from '../lib/xsdParser';
import {
  getReferenceCorpus,
  resolveReferenceFile,
  runReferenceCorpusSelftest,
  type ReferenceCorpus,
} from '../lib/referenceCorpus';

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function forceRefresh(req: Request): boolean { return /^(1|true|yes)$/i.test(String(req.query.refresh || '')); }

function load(req?: Request): ReferenceCorpus {
  const resolved = resolveXsdConfig();
  return getReferenceCorpus(resolved.x4ReferenceRoot, req ? forceRefresh(req) : false);
}

export function getCanonicalReferenceSets(): { macros: Set<string>; wares: Set<string>; factions: Set<string>; sectors: Set<string> } {
  try { return load().references; }
  catch { return { macros: new Set(), wares: new Set(), factions: new Set(), sectors: new Set() }; }
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
  } catch (error) {
    console.warn(`[reference-corpus] failed to load ${resolved.x4ReferenceRoot}: ${errorText(error)}`);
  }
}

function sendCorpusError(res: Response, error: unknown): Response {
  const message = errorText(error);
  if (/missing path/i.test(message)) return res.status(400).json({ error: message });
  if (/traversal/i.test(message)) return res.status(403).json({ error: message });
  if (/file not found/i.test(message)) return res.status(404).json({ error: message });
  if (/root.*(unavailable|does not exist|not a directory)/i.test(message)) return res.status(503).json({ error: message });
  return res.status(500).json({ error: message || 'Reference corpus request failed.' });
}

export function registerReferenceRoutes(app: Express): void {
  app.get('/api/reference/status', (req, res) => {
    try {
      const corpus = load(req);
      return res.json({
        available: true,
        root: corpus.root,
        generatedAt: corpus.generatedAt,
        sourceFiles: corpus.sourceFiles.length,
        counts: { factions: corpus.factions.length, wares: corpus.wares.length, sectors: corpus.sectors.length, scriptProperties: corpus.scriptProperties.length },
      });
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

