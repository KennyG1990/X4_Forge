/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P3 — agent multi-file orchestration over ExtensionProject.
 *
 * Stateless and deterministic: agents pass/receive a whole ExtensionProject and can
 * create, add files, generate a bounded starter project, validate, and package it
 * without mutating the active Studio workspace.
 */

import {
  addFile,
  buildContentXml,
  classifyPath,
  createProject,
  indexCueReferences,
  validateProjectStructure,
  type ContentMeta,
  type ExtensionProject,
  type ProjectFile,
} from './extensionProject';
import { aiInfluenceChatBlocks, buildLuaLogicScript } from './luaLogicBlocks';
import { generateContractMdScript, generateHttpGlueLua, type IntegrationContract } from './contractGlue';
import { analyzeLuaFiles } from './luaStaticAnalysis';
import { validateProjectCrossFile } from './projectCrossFileValidation';

export interface ProjectCreateRequest {
  id: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
  deps?: ContentMeta['deps'];
}

export interface ProjectGenerationSpec extends ProjectCreateRequest {
  kind?: 'ai_influence_starter';
}

function safeId(id: string): string {
  return String(id || 'ai_influence').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'ai_influence';
}

function normalizeProject(project: ExtensionProject): ExtensionProject {
  let out = createProject(safeId(project.id), project.name || project.id || 'Extension Project');
  for (const file of project.files || []) {
    out = addFile(out, { ...file, kind: file.kind || classifyPath(file.path) });
  }
  return out;
}

export function createAgentProject(req: ProjectCreateRequest): ExtensionProject {
  const id = safeId(req.id);
  let project = createProject(id, req.name || id);
  project = addFile(project, {
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({
      id,
      name: req.name || id,
      version: req.version || '1.0.0',
      author: req.author || 'X4 Forge',
      description: req.description || '',
      deps: req.deps || [],
    }),
  });
  return project;
}

export function createProjectFile(project: ExtensionProject, file: Pick<ProjectFile, 'path' | 'content'> & Partial<ProjectFile>): ExtensionProject {
  return addFile(normalizeProject(project), {
    path: file.path,
    kind: file.kind || classifyPath(file.path),
    content: file.content || '',
  });
}

function aiInfluenceContract(): IntegrationContract {
  return {
    namespace: 'ai_influence',
    baseUrl: 'http://127.0.0.1:8713',
    endpoints: [
      {
        id: 'chat',
        method: 'POST',
        path: '/v1/chat',
        request: [{ name: 'prompt', type: 'string', required: true }],
        response: [{ name: 'reply', type: 'string' }],
      },
    ],
  };
}

function aiInfluenceMainMd(modId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="${modId}_main" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Start">
      <actions>
        <!-- Call_chat is a <library> — invoked via run_actions (vanilla pattern), never signal_cue
             (the game errors "Signalled cue … has no corresponding library"). -->
        <run_actions ref="md.${modId}_contract_http.Call_chat">
          <param name="prompt" value="'Hello from ${modId}'" />
        </run_actions>
      </actions>
    </cue>
  </cues>
</mdscript>`;
}

export function generateAgentProject(spec: ProjectGenerationSpec): ExtensionProject {
  const id = safeId(spec.id || 'ai_influence');
  const contract = aiInfluenceContract();
  let project = createAgentProject({
    id,
    name: spec.name || 'AI Influence',
    version: spec.version || '1.0.0',
    author: spec.author || 'X4 Forge',
    description: spec.description || 'Generated AI Influence starter project.',
    deps: spec.deps || [{ id: 'djfhe_http', optional: true }],
  });
  project = createProjectFile(project, { path: `md/${id}_main.xml`, content: aiInfluenceMainMd(id) });
  project = createProjectFile(project, { path: `md/${id}_contract.xml`, content: generateContractMdScript(contract, `${id}_contract`) });
  project = createProjectFile(project, { path: `ui/${id}_contract.lua`, content: generateHttpGlueLua(contract) });
  project = createProjectFile(project, { path: `ui/ai_influence_chat.lua`, content: buildLuaLogicScript(aiInfluenceChatBlocks()) });
  return project;
}

export function packageAgentProject(project: ExtensionProject) {
  const normalized = normalizeProject(project);
  const files: Record<string, string> = {};
  for (const file of normalized.files) {
    files[file.path.replace(/\\/g, '/').replace(/^\/+/, '')] = file.content || '';
  }
  const structure = validateProjectStructure(normalized);
  const cueIndex = indexCueReferences(normalized);
  const luaFiles = normalized.files
    .filter(f => f.path.toLowerCase().endsWith('.lua'))
    .map(f => ({ rel: f.path, text: f.content || '', source: 'loose' as const, sourcePath: 'project', extension: { folder: normalized.id, id: normalized.id, name: normalized.name } }));
  const lua = analyzeLuaFiles(luaFiles);
  const crossFile = validateProjectCrossFile(normalized);
  const errors = structure.filter(i => i.severity === 'error').length + cueIndex.unresolved.length + lua.findings.filter(f => f.severity === 'error').length + crossFile.summary.errors;
  return {
    ok: errors === 0,
    project: normalized,
    files,
    summary: {
      files: Object.keys(files).length,
      structuralErrors: structure.filter(i => i.severity === 'error').length,
      unresolvedCueRefs: cueIndex.unresolved.length,
      luaFiles: lua.filesScanned,
      luaErrors: lua.findings.filter(f => f.severity === 'error').length,
      crossFileErrors: crossFile.summary.errors,
      mdLuaMissingRegisters: crossFile.summary.mdLuaMissingRegisters,
      luaMdMissingListeners: crossFile.summary.luaMdMissingListeners,
    },
    validation: { structure, cueIndex, lua, crossFile },
  };
}

export function runProjectOrchestrationSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const created = createAgentProject({ id: 'AI Influence', name: 'AI Influence', deps: [{ id: 'djfhe_http', optional: true }] });
  ok('create_adds_content_xml', created.files.some(f => f.path === 'content.xml' && f.content?.includes('<dependency id="djfhe_http"')));

  const withFile = createProjectFile(created, { path: 'md/extra.xml', content: '<mdscript name="Extra"><cues><cue name="Start"/></cues></mdscript>' });
  ok('file_create_classifies_and_adds', withFile.files.some(f => f.path === 'md/extra.xml' && f.kind === 'md'));

  const generated = generateAgentProject({ id: 'ai_influence', kind: 'ai_influence_starter' });
  const pkg = packageAgentProject(generated);
  ok('generate_creates_multifile_project', generated.files.length >= 5, generated.files.map(f => f.path));
  ok('generate_includes_ai_influence_lua', !!pkg.files['ui/ai_influence_chat.lua'] && pkg.files['ui/ai_influence_chat.lua'].includes('poll_chat_response'));
  ok('generate_includes_contract_md_and_lua', !!pkg.files['md/ai_influence_contract.xml'] && !!pkg.files['ui/ai_influence_contract.lua']);
  ok('package_returns_file_manifest', pkg.ok && Object.keys(pkg.files).includes('content.xml'), pkg.summary);
  ok('package_validates_cross_file_refs', pkg.validation.cueIndex.references.some(r => r.scope === 'cross_file' && r.resolved), pkg.validation.cueIndex);
  ok('package_luaparse_clean', pkg.summary.luaFiles >= 2 && pkg.summary.luaErrors === 0, pkg.validation.lua.findings);
  ok('package_cross_file_validation_clean', pkg.summary.crossFileErrors === 0 && pkg.validation.crossFile.ok, pkg.validation.crossFile.findings);

  const badPkg = packageAgentProject(createProjectFile(created, { path: '../evil.lua', content: 'return true' }));
  ok('package_blocks_invalid_paths', !badPkg.ok && badPkg.validation.structure.some(i => i.code === 'invalid_path'), badPkg.validation.structure);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
