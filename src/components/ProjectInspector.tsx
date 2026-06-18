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

import { useMemo } from 'react';
import { FolderTree, FileCode, FileText, Box, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
    </div>
  );
}
