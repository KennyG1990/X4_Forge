/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P0d (Tier 1) — Project Inspector. The human-facing surface for the multi-file
 * extension-project model (src/lib/extensionProject.ts). Assembles the current mod as an
 * ExtensionProject (compiled main MD + authored content.xml + imported passthrough files),
 * then renders the structural validation AND — the keystone's value-add — the CROSS-FILE
 * cue reference index: which `md.<script>.<cue>` references resolve, and which are broken.
 * Runs the pure engine client-side (no network); the /api/agent/project/* endpoints serve
 * external agents.
 */

import { useEffect, useMemo, useState } from 'react';
import { FolderTree, FileCode, FileText, Box, Link2, AlertTriangle, CheckCircle2, Plug } from 'lucide-react';
import { ModWorkspace, generateMDXML } from '../types';
import {
  classifyPath,
  validateProjectStructure,
  indexCueReferences,
  buildContentXml,
  type ExtensionProject,
  type ProjectFile,
  type ProjectFileKind,
} from '../lib/extensionProject';
import {
  detectProjectApis,
  validateExternalApiUsage,
  getActiveRegistry,
  type ExternalApiEntry,
} from '../lib/externalApiRegistry';

interface ApiRegistrySources {
  builtin: number; dataDir: number; folder: number; endpoint: number;
  errors: { source: string; file?: string; errors: string[] }[];
}

function toSafeModId(name: string): string {
  return (name || 'my_extension').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'my_extension';
}

/** Build an ExtensionProject from the live workspace: main MD + content.xml + passthroughs. */
function projectFromWorkspace(ws: ModWorkspace): ExtensionProject {
  const id = toSafeModId(ws.name);
  const files: ProjectFile[] = [];

  files.push({
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({ id, name: ws.name, version: ws.version, author: ws.author, description: ws.description }),
  });

  if ((ws.nodes || []).length > 0) {
    files.push({ path: `md/${id}.xml`, kind: 'md', content: generateMDXML(ws) });
  }
  if (ws.customLua && ws.customLua.trim()) {
    files.push({ path: `ui/${id}_custom.lua`, kind: 'lua', content: ws.customLua });
  }
  for (const pf of ws.passthroughFiles || []) {
    files.push({ path: pf.path, kind: classifyPath(pf.path), content: pf.content });
  }
  return { id, name: ws.name, files };
}

const KIND_META: Record<ProjectFileKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  md: { label: 'MD scripts', icon: FileCode },
  lua: { label: 'Lua', icon: FileCode },
  ui: { label: 'UI', icon: Box },
  content: { label: 'Manifest', icon: FileText },
  t: { label: 'Translations', icon: FileText },
  library: { label: 'Libraries', icon: Box },
  aiscript: { label: 'AI scripts', icon: FileCode },
  other: { label: 'Other', icon: FileText },
};

interface ProjectInspectorProps {
  workspace: ModWorkspace;
}

export default function ProjectInspector({ workspace }: ProjectInspectorProps) {
  const project = useMemo(() => projectFromWorkspace(workspace), [workspace]);
  const structure = useMemo(() => validateProjectStructure(project), [project]);
  const cueIndex = useMemo(() => indexCueReferences(project), [project]);

  // The dynamically-loaded API defs live on the server; fetch the merged registry
  // so the client validates against the same set (built-ins + dropped-in defs).
  const [apiRegistry, setApiRegistry] = useState<ExternalApiEntry[]>(() => getActiveRegistry());
  const [apiSources, setApiSources] = useState<ApiRegistrySources | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/agent/external-api-registry?full=1')
      .then(r => r.json())
      .then(d => {
        if (!alive || !d?.success) return;
        if (Array.isArray(d.apis)) setApiRegistry(d.apis as ExternalApiEntry[]);
        if (d.sources) setApiSources(d.sources as ApiRegistrySources);
      })
      .catch(() => { /* offline / API down — fall back to built-in client registry */ });
    return () => { alive = false; };
  }, []);

  const detectedApis = useMemo(() => detectProjectApis(project, apiRegistry), [project, apiRegistry]);
  const apiFindings = useMemo(() => validateExternalApiUsage(project, apiRegistry), [project, apiRegistry]);
  const apiWarnings = apiFindings.filter(f => f.severity === 'warning');

  const structuralErrors = structure.filter(i => i.severity === 'error');
  const ok = structuralErrors.length === 0 && cueIndex.unresolved.length === 0;

  const byKind = new Map<ProjectFileKind, ProjectFile[]>();
  for (const f of project.files) {
    const arr = byKind.get(f.kind) || [];
    arr.push(f);
    byKind.set(f.kind, arr);
  }

  return (
    <div data-testid="project-inspector" className="h-full overflow-auto bg-[#0b0d12] text-slate-200 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FolderTree className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-cyan-300">Extension Project</h2>
        <span className="text-[11px] text-slate-500 font-mono">{project.name} · {project.files.length} files</span>
      </div>

      {/* status banner */}
      <div
        data-testid="project-status"
        className={`flex items-center gap-2 rounded border px-3 py-2 text-[12px] ${
          ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
             : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        }`}
      >
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        <span>
          {ok
            ? 'Project validates as a unit — structure sound, all cross-file cue references resolve.'
            : `${structuralErrors.length} structural error(s), ${cueIndex.unresolved.length} unresolved cross-file cue reference(s).`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* file tree */}
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h3 className="text-[11px] font-bold font-mono uppercase text-slate-400 mb-2">Files</h3>
          <div className="space-y-2">
            {[...byKind.entries()].map(([kind, files]) => {
              const Meta = KIND_META[kind];
              const Icon = Meta.icon;
              return (
                <div key={kind}>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-500">
                    <Icon className="w-3 h-3" /> {Meta.label} ({files.length})
                  </div>
                  <ul className="ml-4 mt-1 space-y-0.5">
                    {files.map(f => (
                      <li key={f.path} className="text-[12px] font-mono text-slate-300">{f.path}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {structuralErrors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {structure.map((iss, i) => (
                <li key={i} className={`text-[11px] ${iss.severity === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>
                  {iss.severity === 'error' ? '✕' : 'ℹ'} {iss.detail}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* cross-file cue index — the value-add */}
        <section className="rounded border border-white/10 bg-black/30 p-3">
          <h3 className="flex items-center gap-1.5 text-[11px] font-bold font-mono uppercase text-slate-400 mb-2">
            <Link2 className="w-3 h-3" /> Cross-file cue references
          </h3>
          <div className="text-[11px] text-slate-500 font-mono mb-2">
            {cueIndex.defined.length} cues defined · {cueIndex.references.length} references · {cueIndex.unresolved.length} unresolved
          </div>

          {cueIndex.unresolved.length > 0 && (
            <div data-testid="unresolved-refs" className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 p-2">
              <div className="text-[10px] font-bold font-mono uppercase text-rose-300 mb-1">Broken references</div>
              <ul className="space-y-1">
                {cueIndex.unresolved.map((r, i) => (
                  <li key={i} className="text-[12px] font-mono text-rose-200">
                    <span className="text-rose-400">✕</span> {r.ref}
                    <span className="text-slate-500"> — in {r.file} ({r.scope})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-0.5 max-h-64 overflow-auto">
            {cueIndex.references.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] font-mono">
                <span className={r.resolved ? 'text-emerald-400' : 'text-rose-400'}>{r.resolved ? '✓' : '✕'}</span>
                <span className="text-slate-300">{r.ref}</span>
                <span className="text-slate-600 text-[10px]">{r.scope}</span>
              </div>
            ))}
            {cueIndex.references.length === 0 && (
              <div className="text-[12px] text-slate-500 italic">No signalling cue references in this project.</div>
            )}
          </div>
        </section>
      </div>

      {/* P4 — third-party API usage (◐ heuristic, curated registry, not exhaustive) */}
      <section data-testid="external-api-usage" className="rounded border border-white/10 bg-black/30 p-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold font-mono uppercase text-slate-400 mb-2">
          <Plug className="w-3 h-3" /> Third-party API usage
          <span className="ml-1 rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] text-slate-300" title="Heuristic, curated registry — not schema-grade.">◐ soft</span>
        </h3>

        {/* loaded registry provenance — confirms dropped-in defs took effect */}
        <div className="text-[10px] font-mono text-slate-500 mb-2">
          {apiRegistry.length} APIs loaded
          {apiSources && (
            <span> · {apiSources.builtin} built-in
              {apiSources.dataDir > 0 && <span> · {apiSources.dataDir} data-dir</span>}
              {apiSources.folder > 0 && <span> · {apiSources.folder} folder</span>}
              {apiSources.endpoint > 0 && <span> · {apiSources.endpoint} runtime</span>}
            </span>
          )}
        </div>
        {apiSources && apiSources.errors.length > 0 && (
          <div className="mb-2 text-[11px] text-rose-300">
            {apiSources.errors.length} API def file(s) failed to load — check data/api-registry.
          </div>
        )}

        {detectedApis.length === 0 ? (
          <div className="text-[12px] text-slate-500 italic">
            No known community APIs (sn_mod_support_apis, kuertee) detected in this project.
          </div>
        ) : (
          <>
            <div className="space-y-1.5 mb-3">
              {detectedApis.map(api => (
                <div key={api.extensionId} className="text-[12px] font-mono">
                  <span className="text-cyan-300">{api.name}</span>
                  <span className="text-slate-500"> — {api.components.map(c => c.title).join(', ')}</span>
                </div>
              ))}
            </div>

            {apiWarnings.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
                <div className="text-[10px] font-bold font-mono uppercase text-amber-300 mb-1">
                  Dependency warnings ({apiWarnings.length})
                </div>
                <ul className="space-y-1">
                  {apiWarnings.map((f, i) => (
                    <li key={i} className="text-[12px] text-amber-200">
                      <span className="text-amber-400">⚠</span> {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {apiWarnings.length === 0 && (
              <div className="text-[12px] text-emerald-300">✓ Detected APIs have their content.xml dependencies declared.</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
