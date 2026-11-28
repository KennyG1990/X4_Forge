import { workspaceSourceFiles } from '../types';
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
import { FolderTree, FileCode, FileText, Box, Link2, AlertTriangle, CheckCircle2, Plug, Shield } from 'lucide-react';
import { ModWorkspace, generateMDXML } from '../types';
import {
  inspectWorkspaceDiffHooks,
  toggleAdditiveOnlyInRulesJson,
  type AdditiveGuardReport,
  type VanillaDiffHook,
} from '../lib/additiveGuard';
import { parseProjectRules } from '../lib/projectRules';
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
import ModDependencyView from './ModDependencyView';
import XmlReferenceView from './XmlReferenceView';
import ReleaseCenter from './ReleaseCenter';
import { DEFAULT_RELEASE_PREFERENCES, type ReleasePreferences } from '../lib/releasePreferences';

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
    content: buildContentXml({ id, name: ws.name, version: ws.version, author: ws.author, description: ws.description, deps: ws.dependencies?.map(d => ({ ...d, optional: d.optional ?? false })) }),
  });

  if ((ws.nodes || []).length > 0) {
    files.push({ path: `md/${id}.xml`, kind: 'md', content: generateMDXML(ws) });
  }
  if (ws.customLua && ws.customLua.trim()) {
    files.push({ path: `ui/${id}_custom.lua`, kind: 'lua', content: ws.customLua });
  }
  for (const pf of workspaceSourceFiles(ws)) {
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

type ProjectTab = 'overview' | 'xml-references' | 'release';
const PROJECT_TABS: readonly ProjectTab[] = ['overview', 'xml-references', 'release'];

interface ProjectInspectorProps {
  workspace: ModWorkspace;
  setWorkspace?: (ws: ModWorkspace) => void;
  additiveGuard?: AdditiveGuardReport | null;
  schemaConfigVersion?: number;
  releasePreferences?: ReleasePreferences;
  initialTab?: ProjectTab;
  tabRequestNonce?: number;
  onOpenValidator?: () => void;
  onOpenDeployWizard?: () => void;
  onOpenReleaseCenter?: () => void;
}

export default function ProjectInspector({
  workspace,
  setWorkspace,
  additiveGuard = null,
  schemaConfigVersion = 0,
  releasePreferences = DEFAULT_RELEASE_PREFERENCES,
  initialTab = 'overview',
  tabRequestNonce = 0,
  onOpenValidator,
  onOpenDeployWizard,
  onOpenReleaseCenter,
}: ProjectInspectorProps) {
  const [view, setView] = useState<ProjectTab>(initialTab);
  const [additiveToggleError, setAdditiveToggleError] = useState<string | null>(null);
  useEffect(() => {
    if (tabRequestNonce > 0) setView(initialTab);
  }, [initialTab, tabRequestNonce]);
  const project = useMemo(() => projectFromWorkspace(workspace), [workspace]);
  const structure = useMemo(() => validateProjectStructure(project), [project]);
  const cueIndex = useMemo(() => indexCueReferences(project), [project]);

  const rulesFile = useMemo(
    () => workspaceSourceFiles(workspace).find(
      item => item.path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase() === 'forge.rules.json',
    ),
    [workspace],
  );
  const parsedRules = useMemo(
    () => parseProjectRules({
      id: project.id,
      name: project.name,
      files: rulesFile && typeof rulesFile.content === 'string'
        ? [{ path: 'forge.rules.json', kind: 'other', content: rulesFile.content }]
        : [],
    }),
    [project.id, project.name, rulesFile],
  );
  const additiveEnabled = parsedRules.valid && parsedRules.config?.additiveOnly !== undefined
    ? parsedRules.config.additiveOnly
    : Boolean(additiveGuard?.enabled);
  const diffHooks = useMemo<VanillaDiffHook[]>(
    () => additiveGuard?.hooks ?? inspectWorkspaceDiffHooks(project.files),
    [additiveGuard, project.files],
  );
  const handleToggleAdditiveOnly = () => {
    if (!setWorkspace) return;
    if (rulesFile?.omitted && typeof rulesFile.content !== 'string') {
      setAdditiveToggleError('forge.rules.json is omitted due to size; edit it externally.');
      return;
    }
    const next = toggleAdditiveOnlyInRulesJson(rulesFile?.content, !additiveEnabled);
    if ('error' in next) {
      setAdditiveToggleError(next.error);
      return;
    }
    setAdditiveToggleError(null);
    const existing = Array.isArray(workspace.passthroughFiles) ? workspace.passthroughFiles : [];
    const nextPassthrough = existing.filter(
      item => item.path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase() !== 'forge.rules.json',
    );
    nextPassthrough.push({
      path: 'forge.rules.json',
      content: next.content,
      bytes: new TextEncoder().encode(next.content).length,
    });
    setWorkspace({
      ...workspace,
      passthroughFiles: nextPassthrough,
    });
  };

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
    <div data-testid="project-inspector" className="h-full overflow-auto bg-[#0c0e12] text-[#eef2f7] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold tracking-tight text-[#eef2f7]">Extension Project</h2>
          <span className="text-[11px] text-slate-400 font-mono">{project.name} · {project.files.length} files</span>
        </div>
        {(onOpenValidator || onOpenDeployWizard || onOpenReleaseCenter || view !== 'release') && (
          <div className="flex items-center gap-1.5">
            {onOpenValidator && (
              <button
                type="button"
                onClick={onOpenValidator}
                className="h-7 px-2.5 rounded-md border border-white/[0.08] bg-[#11141a] hover:border-blue-500/40 text-[11px] font-medium text-slate-200 hover:text-white cursor-pointer transition-colors"
              >
                Validator
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setView('release');
                onOpenReleaseCenter?.();
              }}
              className="h-7 px-2.5 rounded-md border border-white/[0.08] bg-[#11141a] hover:border-emerald-500/40 text-[11px] font-medium text-slate-200 hover:text-emerald-200 cursor-pointer transition-colors"
            >
              Release Center
            </button>
            {onOpenDeployWizard && (
              <button
                type="button"
                onClick={onOpenDeployWizard}
                className="h-7 px-2.5 rounded-md border border-blue-500/45 bg-blue-500/20 hover:bg-blue-500/30 text-[11px] font-semibold text-blue-100 cursor-pointer transition-colors"
              >
                Validate &amp; Deploy
              </button>
            )}
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Project views" className="flex flex-wrap gap-2 border-b border-[#262c36] pb-2">
        {PROJECT_TABS.map(tab => <button key={tab} type="button" role="tab"
          id={`project-tab-${tab}`} aria-controls={`project-panel-${tab}`} aria-selected={view === tab}
          tabIndex={view === tab ? 0 : -1}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const idx = PROJECT_TABS.indexOf(tab);
            const next = event.key === 'Home'
              ? PROJECT_TABS[0]
              : event.key === 'End'
                ? PROJECT_TABS[PROJECT_TABS.length - 1]
                : event.key === 'ArrowRight'
                  ? PROJECT_TABS[(idx + 1) % PROJECT_TABS.length]
                  : PROJECT_TABS[(idx - 1 + PROJECT_TABS.length) % PROJECT_TABS.length];
            setView(next);
            event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#project-tab-${next}`)?.focus();
          }}
          onClick={() => setView(tab)} className={`rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${view === tab
            ? 'border-[#3b82f6]/50 bg-[#3b82f6]/15 text-[#93c5fd]' : 'border-[#262c36] bg-[#11141a] text-[#a0aab8] hover:text-[#eef2f7]'}`}>
          {tab === 'overview' ? 'Overview' : tab === 'xml-references' ? 'XML References' : 'Release'}
        </button>)}
      </div>
      {view === 'release' ? (
        <div role="tabpanel" id="project-panel-release" aria-labelledby="project-tab-release" className="max-w-3xl">
          <ReleaseCenter workspace={workspace} preferences={releasePreferences} />
        </div>
      ) : view === 'xml-references' ? <div role="tabpanel" id="project-panel-xml-references" aria-labelledby="project-tab-xml-references">
        <XmlReferenceView workspace={workspace} schemaConfigVersion={schemaConfigVersion} />
      </div> : <div role="tabpanel" id="project-panel-overview" aria-labelledby="project-tab-overview" className="space-y-4">
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

      {/* #142 — Project additive-only vanilla protection guard & diff hooks report */}
      <section data-testid="project-additive-guard" className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="w-4 h-4 text-[#93c5fd]" />
            <h3 className="text-xs font-semibold text-[#eef2f7]">Additive-Only Guard &amp; Vanilla Diff Hooks</h3>
            <span
              data-testid="project-additive-guard-status"
              className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                additiveEnabled
                  ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-300'
                  : 'border-[#262c36] bg-[#0a0c10] text-[#a0aab8]'
              }`}
            >
              {additiveEnabled ? 'Enforced (additiveOnly: true)' : 'Advisory only'}
            </span>
          </div>
          {setWorkspace && (
            <button
              type="button"
              data-testid="project-additive-only-toggle"
              onClick={handleToggleAdditiveOnly}
              className="rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 px-2.5 py-1 text-[11px] font-medium text-[#93c5fd] cursor-pointer transition-colors"
            >
              {additiveEnabled ? 'Disable additiveOnly in forge.rules.json' : 'Enable additiveOnly in forge.rules.json'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#a0aab8]">
          <span>Diff hooks: <strong className="text-[#eef2f7]">{diffHooks.length}</strong></span>
          {additiveGuard && (
            <>
              <span>Shadowed vanilla files: <strong className="text-[#eef2f7]">{additiveGuard.summary.vanillaFilesShadowed}</strong></span>
              <span>Destructive diffs: <strong className="text-[#eef2f7]">{additiveGuard.summary.destructiveDiffOps}</strong></span>
              <span>Reused scripts/pages: <strong className="text-[#eef2f7]">{additiveGuard.summary.reusedAiScriptNames + additiveGuard.summary.reusedMdScriptNames + additiveGuard.summary.reusedPageIds}</strong></span>
            </>
          )}
          {workspace.sourceStamp?.dir && (
            <span className="font-sans text-[#687385]">
              Disk-backed workspace: deploy/export to persist <code className="text-[#a0aab8]">forge.rules.json</code> changes on disk.
            </span>
          )}
        </div>

        {additiveToggleError && (
          <div className="rounded border border-rose-500/35 bg-rose-950/20 px-2.5 py-1.5 text-[11px] text-rose-300">
            {additiveToggleError}
          </div>
        )}

        <div data-testid="project-vanilla-hooks-report" className="rounded-md border border-[#262c36] bg-[#0a0c10] p-2.5">
          {diffHooks.length === 0 ? (
            <div className="text-[11px] text-[#687385]">No XML &lt;diff&gt; patch hooks declared in this project.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[#262c36] text-[#687385]">
                    <th className="py-1 pr-3 font-medium">File</th>
                    <th className="py-1 pr-3 font-medium">Op</th>
                    <th className="py-1 pr-3 font-medium">Vanilla Target</th>
                    <th className="py-1 font-medium">Selector (sel)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262c36]/60">
                  {diffHooks.map((hook, idx) => (
                    <tr key={`${hook.filePath}-${hook.line ?? idx}-${idx}`}>
                      <td className="py-1.5 pr-3 text-[#eef2f7] whitespace-nowrap">{hook.filePath}{hook.line ? `:${hook.line}` : ''}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${hook.additive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                          {hook.op}{hook.attrType ? ` (${hook.attrType})` : ''}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-[#a0aab8] whitespace-nowrap">
                        {hook.isVanillaTarget
                          ? `${hook.vanillaTarget}${hook.vanillaSources.length ? ` (${hook.vanillaSources.join(', ')})` : ''}`
                          : additiveGuard?.available === false
                            ? `${hook.vanillaTarget} (corpus unverified)`
                            : `${hook.vanillaTarget} (non-vanilla)`}
                      </td>
                      <td className="py-1.5 text-[#a0aab8] break-all">{hook.sel || '(missing sel)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* file tree */}
        <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 space-y-2.5">
          <h3 className="text-[13px] font-semibold text-[#eef2f7]">Files</h3>
          <div className="space-y-2.5">
            {[...byKind.entries()].map(([kind, files]) => {
              const Meta = KIND_META[kind];
              const Icon = Meta.icon;
              return (
                <div key={kind}>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#a0aab8]">
                    <Icon className="w-3.5 h-3.5 text-[#93c5fd]" /> {Meta.label} ({files.length})
                  </div>
                  <ul className="ml-4 mt-1 space-y-0.5">
                    {files.map(f => (
                      <li key={f.path} className="text-xs font-mono text-[#cbd5e1]">{f.path}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {structuralErrors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {structure.map((iss, i) => (
                <li key={i} className={`text-[11px] ${iss.severity === 'error' ? 'text-rose-300' : 'text-[#a0aab8]'}`}>
                  {iss.severity === 'error' ? '✕' : 'ℹ'} {iss.detail}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* cross-file cue index — the value-add */}
        <section className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[#eef2f7]">
            <Link2 className="w-3.5 h-3.5 text-[#93c5fd]" /> Cross-file cue references
          </h3>
          <div className="text-[11px] text-[#687385] font-mono">
            {cueIndex.defined.length} cues defined · {cueIndex.references.length} references · {cueIndex.unresolved.length} unresolved
          </div>

          {cueIndex.unresolved.length > 0 && (
            <div data-testid="unresolved-refs" className="rounded-md border border-rose-500/35 bg-rose-500/10 p-2.5">
              <div className="text-[11px] font-semibold text-rose-300 mb-1">Broken references</div>
              <ul className="space-y-1">
                {cueIndex.unresolved.map((r, i) => (
                  <li key={i} className="text-xs font-mono text-rose-200">
                    <span className="text-rose-400">✕</span> {r.ref}
                    <span className="text-[#a0aab8]"> — in {r.file} ({r.scope})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1 max-h-64 overflow-auto">
            {cueIndex.references.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className={r.resolved ? 'text-emerald-400' : 'text-rose-400'}>{r.resolved ? '✓' : '✕'}</span>
                <span className="text-[#cbd5e1]">{r.ref}</span>
                <span className="text-[#687385] text-[11px]">{r.scope}</span>
              </div>
            ))}
            {cueIndex.references.length === 0 && (
              <div className="text-xs text-[#687385] italic">No signalling cue references in this project.</div>
            )}
          </div>
        </section>
      </div>

      {/* P4 — third-party API usage (◐ heuristic, curated registry, not exhaustive) */}
      <section data-testid="external-api-usage" className="rounded-lg border border-[#262c36] bg-[#11141a] p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Plug className="w-3.5 h-3.5 text-[#93c5fd]" />
          <h3 className="text-[13px] font-semibold text-[#eef2f7]">Third-party API usage</h3>
          <span className="rounded border border-[#262c36] bg-[#0a0c10] px-2 py-0.5 text-[11px] font-medium text-[#a0aab8]" title="Heuristic, curated registry — not schema-grade.">
            Soft check
          </span>
        </div>

        {/* loaded registry provenance — confirms dropped-in defs took effect */}
        <div className="text-[11px] font-mono text-[#687385]">
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
          <div className="text-[11px] text-rose-300">
            {apiSources.errors.length} API def file(s) failed to load — check data/api-registry.
          </div>
        )}

        {detectedApis.length === 0 ? (
          <div className="text-xs text-[#687385] italic">
            No known community APIs (sn_mod_support_apis, kuertee) detected in this project.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {detectedApis.map(api => (
                <div key={api.extensionId} className="text-xs font-mono">
                  <span className="text-[#93c5fd]">{api.name}</span>
                  <span className="text-[#687385]"> — {api.components.map(c => c.title).join(', ')}</span>
                </div>
              ))}
            </div>

            {apiWarnings.length > 0 && (
              <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-2.5">
                <div className="text-[11px] font-semibold text-amber-300 mb-1">
                  Dependency warnings ({apiWarnings.length})
                </div>
                <ul className="space-y-1">
                  {apiWarnings.map((f, i) => (
                    <li key={i} className="text-xs text-amber-200">
                      <span className="text-amber-400">⚠</span> {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {apiWarnings.length === 0 && (
              <div className="text-xs text-emerald-300">✓ Detected APIs have their content.xml dependencies declared.</div>
            )}
          </>
        )}
      </section>

      {/* #71 — multi-mod ecosystem: dependency graph across all installed extensions */}
      <ModDependencyView embedded />
      </div>}
    </div>
  );
}
