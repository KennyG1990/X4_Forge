import { buildValidationEvidence, parseValidationProject, ValidationInputError } from '../lib/validationEvidence';
import { classifyPath, type ExtensionProject } from '../lib/extensionProject';
import { canonicalWorkspaceContentString } from '../lib/workspaceIdentity';
import { createHash } from 'node:crypto';
import type { ModWorkspace } from '../types';

type RecordValue = Record<string, any>;
export const isApiObject = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
export interface ApiSubject {
  modId: string | null;
  modVersion?: string | null;
  sourceHash: string | null;
  sourceHashScope: string;
  sourceIdentityProvenance?: 'recorded-release-report' | 'caller-supplied-log';
}
const unresolvedSubject = (): ApiSubject => ({ modId: null, sourceHash: null, sourceHashScope: 'unresolved' });
export function projectApiSubject(project: ExtensionProject): ApiSubject {
  const evidence = buildValidationEvidence(project, []);
  return { modId: evidence.modId, modVersion: evidence.modVersion, sourceHash: evidence.sourceHash, sourceHashScope: evidence.hashScope };
}
export function fileApiSubject(id: string, files: Record<string, string>): ApiSubject {
  return projectApiSubject({ id, name: id, files: Object.entries(files).map(([path, content]) => ({ path, content, kind: classifyPath(path) })) });
}

/** The caller supplies a resolved registry head/effective compiler ID, never request assertions. */
export function workspaceApiSubject(workspace: unknown, options: { modId?: string | null; head?: string } = {}): ApiSubject {
  if (!isApiObject(workspace) || !Array.isArray(workspace.nodes) || !Array.isArray(workspace.links)) return unresolvedSubject();
  let modId = options.modId ?? null;
  if (!Object.hasOwn(options, 'modId')) {
    const originals = ['uiSourceFiles', 'passthroughFiles', 'originalFiles']
      .flatMap(key => Array.isArray(workspace[key]) ? workspace[key] : []);
    const manifests = originals.filter(file => isApiObject(file) && typeof file.path === 'string'
      && file.path.toLowerCase() === 'content.xml' && typeof file.content === 'string').map(file => file.content);
    if (typeof workspace.contentOriginal === 'string') manifests.push(workspace.contentOriginal);
    const identities = new Set(manifests.map(content => fileApiSubject('workspace', { 'content.xml': content }).modId));
    if (identities.size === 1) modId = [...identities][0];
  }
  const head = typeof options.head === 'string' && options.head.length > 0 ? options.head : undefined;
  return { modId, sourceHash: head || createHash('sha256').update(canonicalWorkspaceContentString(workspace as ModWorkspace)).digest('hex'),
    sourceHashScope: head ? 'workspace-head' : 'workspace-content-sha256-v1' };
}

/** Pasted trace provenance is caller supplied; this is not a validated source/game-loaded hash. */
export function pastedLogApiSubject(tail: string, modId: string): ApiSubject {
  return { modId, sourceHash: createHash('sha256').update(tail, 'utf8').digest('hex'),
    sourceHashScope: 'pasted-log-utf8-sha256-v1', sourceIdentityProvenance: 'caller-supplied-log' };
}

/** Read recorded evidence only. Artifact linkage and filesystem trust remain the route owner's job. */
export function releaseReportApiSubject(report: unknown): ApiSubject {
  if (!isApiObject(report) || !isApiObject(report.validatedSource)) return unresolvedSubject();
  const subject = report.validatedSource;
  if (typeof subject.modId !== 'string' || subject.modId.length > 256 || !/^[A-Za-z][\w.-]*$/.test(subject.modId)
    || typeof subject.sourceHash !== 'string' || !/^[a-f0-9]{64}$/i.test(subject.sourceHash)
    || subject.sourceHashScope !== 'project-validation-inputs-v1'
    || (subject.modVersion !== undefined && subject.modVersion !== null && typeof subject.modVersion !== 'string')) return unresolvedSubject();
  // report.modId is the legacy release folder selector; content.xml may have a different ID.
  if (Object.hasOwn(report, 'preparedSource')) {
    const prepared = report.preparedSource;
    if (!isApiObject(prepared) || prepared.modId !== subject.modId || typeof prepared.sourceHash !== 'string'
      || !/^[a-f0-9]{64}$/i.test(prepared.sourceHash)
      || prepared.sourceHashScope !== 'release-artifact-inputs-v1') return unresolvedSubject();
  }
  return { modId: subject.modId, ...(subject.modVersion !== undefined ? { modVersion: subject.modVersion } : {}),
    sourceHash: subject.sourceHash, sourceHashScope: subject.sourceHashScope, sourceIdentityProvenance: 'recorded-release-report' };
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
  '/api/agent/workspaces/bootstrap': ['clientId', 'workspaceId'],
  '/api/agent/workspace/restore-parked': ['targetWorkspaceId'],
  '/api/agent/log-diagnose': ['tail', 'modId'],
  '/api/agent/release/nexus/prepare': ['workspace', 'bump'],
  '/api/agent/package/release': ['workspace', 'bump'],
  '/api/agent/release/steam/prepare': ['workspace', 'bump', 'minorUpdate', 'previewPath', 'toolPath', 'changeNote'],
  '/api/agent/release/artifact/download': ['platform', 'modId', 'artifactPath'],
  '/api/agent/release/export/receipt': ['platform', 'modId', 'method', 'destination', 'artifactPath', 'sha256', 'sizeBytes'],
  '/api/agent/release/steam/verify': ['modId'],
  '/api/agent/release/steam/adopt': ['modId', 'apply', 'expectedSourceSha256', 'expectedWorkshopId'],
};
const metaFields = ['id', 'name', 'version', 'author', 'description', 'deps'];
function invalid(message: string): never { throw new ValidationInputError(message); }
function fields(value: unknown, allowed: readonly string[], label: string): asserts value is RecordValue {
  if (!isApiObject(value)) invalid(`${label} must be a JSON object.`);
  const extra = Object.keys(value).filter(k => !allowed.includes(k));
  if (extra.length) invalid(`${label} has unknown fields: ${extra.join(', ')}.`);
}
function stringField(value: RecordValue, key: string, options: { required?: boolean; max?: number; empty?: boolean; singleLine?: boolean; pattern?: RegExp } = {}) {
  const field = value[key];
  if (field === undefined && !options.required) return;
  if (typeof field !== 'string' || field.length > (options.max ?? 4096)
    || (!options.empty && !field.trim()) || field.includes('\0')
    || (options.singleLine && /[\r\n]/.test(field)) || (options.pattern && !options.pattern.test(field))) invalid(`${key} must be a valid bounded string.`);
}
function booleanField(value: RecordValue, key: string) {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') invalid(`${key} must be boolean.`);
}
function workspaceShape(value: unknown, partial = false, allowClear = false): void {
  if (!isApiObject(value)) invalid('workspace must be a JSON object.');
  if (!partial && (typeof value.name !== 'string' || !Array.isArray(value.nodes) || !Array.isArray(value.links))) {
    invalid('workspace requires name, nodes and links; malformed payloads cannot select an empty mod.');
  }
  for (const key of ['name', 'version', 'author', 'description', 'customLua', 'contentId', 'contentOriginal', 'mdScriptName', 'mdFileStem', 'sourceFolder']) {
    if (value[key] !== undefined && !(allowClear && value[key] === null) && typeof value[key] !== 'string') invalid(`workspace.${key} must be a string.`);
  }
  for (const key of ['nodes', 'links', 'uiWidgets', 'aiScripts', 'wares', 'jobs', 'tFiles', 'xmlPatches', 'dependencies', 'templates', 'uiSourceFiles', 'passthroughFiles', 'originalFiles']) {
    if (value[key] !== undefined && !(allowClear && value[key] === null) && !Array.isArray(value[key])) invalid(`workspace.${key} must be an array.`);
  }
}

/** Invoke inside the existing creation receipt flow, not before it in generic middleware. */
export function validateWorkspaceCreateBody(value: unknown): void {
  fields(value, ['clientId', 'workspaceId', 'name', 'workspace'], 'Body');
  stringField(value, 'clientId', { max: 256 });
  stringField(value, 'workspaceId', { pattern: /^ws_[a-f0-9]{24}$/i });
  stringField(value, 'name', { max: 8192, empty: true });
  if (Object.hasOwn(value, 'workspace')) workspaceShape(value.workspace);
}

/** A thrown error becomes the existing receipt preflight body failure; never skip that receipt. */
export function validateWorkspaceMutationBody(mode: 'replace' | 'merge', value: unknown): void {
  const key = mode === 'replace' ? 'workspace' : 'changes';
  if (!isApiObject(value) || !Object.hasOwn(value, key) || value[key] === null || value[key] === undefined) {
    invalid(mode === 'replace' ? "Missing required 'workspace' body parameter." : "Missing required 'changes' object (top-level workspace fields to merge).");
  }
  fields(value, [key, 'expectedVersion', 'expectedHead', 'expectedSnapshotHash', 'dryRun', 'force', 'workspaceId', 'clientId'], 'Body');
  stringField(value, 'clientId', { max: 256 });
  stringField(value, 'workspaceId', { pattern: /^ws_[a-f0-9]{24}$/i });
  workspaceShape(value[key], mode === 'merge', mode === 'merge');
  booleanField(value, 'dryRun'); booleanField(value, 'force');
  if (value.expectedVersion !== undefined && (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0)) invalid('expectedVersion must be a nonnegative safe integer.');
  stringField(value, 'expectedHead', { pattern: /^[a-f0-9]{16}$/ });
  stringField(value, 'expectedSnapshotHash', { pattern: /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/ });
}

/** Only shape validation; addressed-workspace authority and legacy mod-filter matching stay in the route. */
export function validateProjectApiQuery(route: string, query: unknown): void {
  const options: Record<string, readonly string[]> = {
    '/api/agent/runtime-debugger': ['expect'],
    '/api/agent/debug-watcher/brief': ['expect', 'modId', 'workspaceId', 'clientId'],
    '/api/agent/game-log/status': ['modId'],
    '/api/agent/runtime-control': [], '/api/agent/runtime-control/preview': [], '/api/agent/runtime-control/reload': [],
    '/api/agent/diagnostics': ['workspaceId', 'clientId'], '/api/agent/readiness': ['workspaceId', 'clientId'], '/api/agent/workspaces': [],
    '/api/agent/workspace': ['workspaceId', 'clientId'], '/api/agent/workspace/parked': ['workspaceId', 'clientId'],
  };
  const allowed = options[route];
  if (!allowed) return;
  fields(query, allowed, 'Query');
  stringField(query, 'expect', { max: 256, empty: true });
  stringField(query, 'modId', { max: 256, empty: true, singleLine: true });
  stringField(query, 'workspaceId', { pattern: /^ws_[a-f0-9]{24}$/i });
  stringField(query, 'clientId', { max: 256 });
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
  if (Object.hasOwn(value, 'workspace')) workspaceShape(value.workspace);
  if (route === '/api/agent/workspaces/bootstrap') {
    stringField(value, 'clientId', { max: 256 });
    stringField(value, 'workspaceId', { pattern: /^ws_[a-f0-9]{24}$/i });
  }
  if (route === '/api/agent/workspace/restore-parked') stringField(value, 'targetWorkspaceId', { required: true, pattern: /^ws_[a-f0-9]{24}$/i });
  if (route === '/api/agent/log-diagnose') {
    stringField(value, 'modId', { required: true, max: 256, singleLine: true });
    stringField(value, 'tail', { required: true, max: 10 * 1024 * 1024, empty: true });
  }
  if (route.startsWith('/api/agent/release/') || route === '/api/agent/package/release') {
    if (route.endsWith('/prepare') || route === '/api/agent/package/release') {
      if (!Object.hasOwn(value, 'workspace')) invalid('Body must include the explicit workspace to package.');
      if (value.bump !== undefined && !['none', 'patch', 'minor'].includes(value.bump)) invalid('bump must be none, patch or minor.');
      booleanField(value, 'minorUpdate');
      for (const key of ['previewPath', 'toolPath']) stringField(value, key, { empty: true, singleLine: true });
      stringField(value, 'changeNote', { empty: true, max: 8192 });
    } else {
      stringField(value, 'modId', { required: true, max: 256, pattern: /^[A-Za-z][\w.-]*$/ });
      if (route.endsWith('/download') || route.endsWith('/receipt')) {
        if (!['nexus', 'steam'].includes(value.platform)) invalid('platform must be nexus or steam.');
        stringField(value, 'artifactPath', { required: true, singleLine: true });
      }
      if (route.endsWith('/receipt')) {
        if (!['native-save', 'browser-save'].includes(value.method)) invalid('method must be native-save or browser-save.');
        stringField(value, 'destination', { required: true, singleLine: true });
        stringField(value, 'sha256', { required: true, pattern: /^[a-f0-9]{64}$/i });
        if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 || value.sizeBytes > 0xffffffff) invalid('sizeBytes must be a positive ZIP-sized safe integer.');
      }
      if (route.endsWith('/adopt')) {
        booleanField(value, 'apply');
        stringField(value, 'expectedSourceSha256', { pattern: /^[a-f0-9]{64}$/i });
        stringField(value, 'expectedWorkshopId', { pattern: /^ws_[0-9]+$/ });
      }
    }
  }
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

export function projectApiEnvelope(route: string, body: RecordValue, subject?: ApiSubject): RecordValue;
export function projectApiEnvelope(route: string, body: unknown, subject?: ApiSubject): unknown;
export function projectApiEnvelope(route: string, body: unknown, subject?: ApiSubject) {
  if (!isApiObject(body)) return body;
  if (route === '/api/agent/health-card' || route === '/api/agent/game-log/status') {
    return { ...body, environment: { scope: 'server-process', pid: process.pid, mode: process.env.X4_FORGE_MODE || 'standalone' } };
  }
  if ((route === '/api/agent/workspaces' && Array.isArray(body.workspaces)) || (route === '/api/agent/workspace/parked' && Array.isArray(body.parked))) {
    const key = route.endsWith('/parked') ? 'parked' : 'workspaces';
    return { ...body, modId: null, sourceHash: null, sourceHashScope: 'workspace-collection',
      [key]: body[key].map((item: unknown) => isApiObject(item) ? { ...unresolvedSubject(), ...item } : item),
      environment: { scope: 'workspace-collection', pid: process.pid, mode: process.env.X4_FORGE_MODE || 'standalone' } };
  }
  // Only project surfaces: reference/global endpoints retain their environment semantics.
  const scoped = route.startsWith('/api/agent/project/') || route.startsWith('/api/agent/release/')
    || /^\/api\/agent\/(?:mod-folder\/import|compile|package(?:\/release)?|artifact\/build|deploy(?:-verify)?|runtime-control(?:\/.*)?|runtime-debugger|debug-watcher\/brief|log-diagnose|diagnostics|readiness|workspaces?(?:\/.*)?|status)$/.test(route);
  if (!scoped) return body;
  let actual = subject;
  if (isApiObject(body.previewWorkspace) && Array.isArray(body.previewWorkspace.nodes) && Array.isArray(body.previewWorkspace.links)) {
    return { ...body, ...workspaceApiSubject(body.previewWorkspace), ...(subject ? { currentSource: subject } : {}) };
  }
  if (!actual && isApiObject(body.project) && Array.isArray(body.project.files)) actual = projectApiSubject(body.project as ExtensionProject);
  if (!actual && isApiObject(body.workspace) && Array.isArray(body.workspace.nodes) && Array.isArray(body.workspace.links)) {
    actual = workspaceApiSubject(body.workspace);
  }
  const evidence = body.validation?.evidence || body.evidence;
  if (!actual && isApiObject(evidence) && typeof evidence.sourceHash === 'string' && typeof evidence.hashScope === 'string') {
    actual = { modId: typeof evidence.modId === 'string' ? evidence.modId : null,
      sourceHash: evidence.sourceHash, sourceHashScope: evidence.hashScope };
  }
  if (route.startsWith('/api/agent/release/') || route === '/api/agent/package/release'
    || route === '/api/agent/runtime-control' || route.startsWith('/api/agent/runtime-control/')) {
    // Runtime control also uses the folder ID as its operational selector and helper marker.
    // Never replace the ID a client must echo in expectedModId with the content.xml identity.
    const sourceIdentity = actual || unresolvedSubject();
    return { ...body, modId: typeof body.modId === 'string' ? body.modId : null, modIdScope: 'artifact-folder',
      sourceHash: sourceIdentity.sourceHash, sourceHashScope: sourceIdentity.sourceHashScope, sourceIdentity };
  }
  return { ...unresolvedSubject(), ...body, ...actual };
}
