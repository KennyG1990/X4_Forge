import { buildValidationEvidence, parseValidationProject, ValidationInputError } from '../lib/validationEvidence';
import { classifyPath, type ExtensionProject } from '../lib/extensionProject';
import { canonicalWorkspaceContentString } from '../lib/workspaceIdentity';
import { createHash } from 'node:crypto';

type RecordValue = Record<string, any>;
export const isApiObject = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
export interface ApiSubject { modId: string | null; modVersion?: string | null; sourceHash: string | null; sourceHashScope: string }
export function projectApiSubject(project: ExtensionProject): ApiSubject {
  const evidence = buildValidationEvidence(project, []);
  return { modId: evidence.modId, modVersion: evidence.modVersion, sourceHash: evidence.sourceHash, sourceHashScope: evidence.hashScope };
}
export function fileApiSubject(id: string, files: Record<string, string>): ApiSubject {
  return projectApiSubject({ id, name: id, files: Object.entries(files).map(([path, content]) => ({ path, content, kind: classifyPath(path) })) });
}

/** Exact body contracts for the project entry points; workspace payload has its own sanitizer. */
export const PROJECT_API_FIELDS: Record<string, readonly string[]> = {
  '/api/agent/project/file/create': ['project', 'file'],
  '/api/agent/project/package': ['project'],
  '/api/agent/project/validate-crossfile': ['project'],
  '/api/agent/project/validate': ['project', 'fromPath', 'path', 'root', 'recordBaseline'],
  '/api/agent/project/validate/check': ['project', 'fromPath', 'root', 'recordBaseline'],
  '/api/agent/project/content-xml': ['meta'],
  '/api/agent/compile': ['workspace', 'fileOverrides'],
  '/api/agent/package': ['workspace'],
  '/api/agent/artifact/build': ['workspace', 'format'],
  '/api/agent/project/files': ['workspace'],
  '/api/fs/write': ['path', 'content', 'expectedSha256', 'strict'],
  '/api/fs/create': ['name', 'type'],
};
const metaFields = ['id', 'name', 'version', 'author', 'description', 'deps'];
function invalid(message: string): never { throw new ValidationInputError(message); }
function fields(value: unknown, allowed: readonly string[], label: string): asserts value is RecordValue {
  if (!isApiObject(value)) invalid(`${label} must be a JSON object.`);
  const extra = Object.keys(value).filter(k => !allowed.includes(k));
  if (extra.length) invalid(`${label} has unknown fields: ${extra.join(', ')}.`);
}
function meta(value: unknown, generation = false) {
  fields(value, generation ? [...metaFields, 'kind'] : metaFields, 'Project metadata');
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 256) invalid('Project id must be a nonempty string.');
  for (const k of ['name', 'version', 'author', 'description']) if (value[k] !== undefined && (typeof value[k] !== 'string' || value[k].length > 8192)) invalid(`${k} must be a bounded string.`);
  if (generation && value.kind !== undefined && value.kind !== 'ai_influence_starter') invalid('Unsupported project kind.');
  if (value.deps !== undefined) {
    if (!Array.isArray(value.deps) || value.deps.length > 256) invalid('deps must be a bounded array.');
    for (const dep of value.deps) {
      fields(dep, ['id', 'version', 'optional'], 'Dependency');
      if (typeof dep.id !== 'string' || !dep.id.trim() || (dep.version !== undefined && typeof dep.version !== 'string')
        || (dep.optional !== undefined && typeof dep.optional !== 'boolean')) invalid('Malformed dependency.');
    }
  }
}

export function validateProjectApiBody(route: string, value: unknown): void {
  if (route === '/api/agent/project/create' || route === '/api/agent/project/generate') {
    if (!isApiObject(value)) invalid('Body must be a JSON object.');
    const key = route.endsWith('/create') ? 'meta' : 'spec';
    if (Object.hasOwn(value, key)) { fields(value, [key], 'Body'); meta(value[key], key === 'spec'); }
    else meta(value, key === 'spec');
    return;
  }
  const allowed = PROJECT_API_FIELDS[route];
  if (!allowed) return;
  fields(value, allowed, 'Body');
  if (route.endsWith('/content-xml')) meta(value.meta);
  if (Object.hasOwn(value, 'project')) parseValidationProject(value.project);
  if (['/api/agent/project/file/create', '/api/agent/project/package', '/api/agent/project/validate-crossfile'].includes(route) && !Object.hasOwn(value, 'project')) invalid('project is required.');
  if (Object.hasOwn(value, 'workspace') && (!isApiObject(value.workspace) || typeof value.workspace.name !== 'string'
    || !Array.isArray(value.workspace.nodes) || !Array.isArray(value.workspace.links))) invalid('workspace requires name, nodes and links; malformed payloads cannot select an empty mod.');
  if (route === '/api/agent/project/file/create') {
    fields(value.file, ['path', 'kind', 'content'], 'file');
    parseValidationProject({ id: 'file', name: 'file', files: [value.file] });
  }
  if (route.includes('/project/validate') && !route.endsWith('crossfile')) {
    const selectors = ['project', 'fromPath', 'path'].filter(k => Object.hasOwn(value, k));
    if (selectors.length !== 1) invalid('Choose exactly one project, fromPath or path.');
    for (const k of ['path', 'fromPath']) if (Object.hasOwn(value, k) && (typeof value[k] !== 'string' || !value[k].trim())) invalid(`${k} must be a nonempty string.`);
    if (value.root !== undefined && !['workspace', 'filesystem'].includes(value.root)) invalid('root must be workspace or filesystem.');
    if (value.project !== undefined && value.root !== undefined) invalid('root is not an inline-project selector.');
    if (value.recordBaseline !== undefined && typeof value.recordBaseline !== 'boolean') invalid('recordBaseline must be boolean.');
  }
  if (route === '/api/fs/write') {
    if (typeof value.path !== 'string' || !value.path.trim() || typeof value.content !== 'string') invalid('write requires path and content strings.');
    if (value.strict !== undefined && typeof value.strict !== 'boolean') invalid('strict must be boolean.');
    if (value.expectedSha256 !== undefined && value.expectedSha256 !== null && (typeof value.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.expectedSha256))) invalid('expectedSha256 must be a SHA-256 string or null.');
  }
  if (route === '/api/fs/create' && (typeof value.name !== 'string' || !value.name.trim() || !['file', 'directory'].includes(value.type))) invalid('create requires name and type file or directory.');
}

export function projectApiEnvelope(route: string, body: unknown, subject?: ApiSubject) {
  if (!isApiObject(body)) return body;
  if (route === '/api/agent/health-card' || route === '/api/agent/game-log/status') {
    return { ...body, environment: { scope: 'server-process', pid: process.pid, mode: process.env.X4_FORGE_MODE || 'standalone' } };
  }
  // Only project surfaces: reference/global endpoints retain their environment semantics.
  const scoped = route.startsWith('/api/agent/project/') || /^\/api\/agent\/(?:mod-folder\/import|compile|package|artifact\/build|deploy(?:-verify)?|runtime-control(?:\/.*)?|workspace(?:\/.*)?|status)$/.test(route);
  if (!scoped) return body;
  let actual = subject;
  if (!actual && isApiObject(body.project) && Array.isArray(body.project.files)) actual = projectApiSubject(body.project as ExtensionProject);
  if (!actual && isApiObject(body.workspace) && Array.isArray(body.workspace.nodes) && Array.isArray(body.workspace.links)) {
    actual = { modId: null, sourceHash: createHash('sha256').update(canonicalWorkspaceContentString(body.workspace as any)).digest('hex'),
      sourceHashScope: 'workspace-content-sha256-v1' };
    // Workspace IDs/names are editable metadata, not a proven content.xml identity.
    const originals = [...(body.workspace.uiSourceFiles || []), ...(body.workspace.passthroughFiles || [])];
    const manifest = originals.find((f: any) => f.path?.toLowerCase() === 'content.xml' && typeof f.content === 'string');
    if (manifest) actual.modId = fileApiSubject('workspace', { 'content.xml': manifest.content }).modId;
  }
  const evidence = body.validation?.evidence || body.evidence;
  return { modId: null, sourceHash: null, sourceHashScope: 'unresolved', ...actual,
    ...(evidence?.sourceHash ? { sourceHashScope: evidence.hashScope } : {}), ...body };
}
