import { workspaceSourceFiles } from '../types';
/**
 * Deterministic, pure runtime-debugging model for X4 Forge.
 *
 * This module deliberately stops at a model boundary.  It does not read a log,
 * inspect a workspace on disk, persist a cursor, or call an AI provider.  A
 * later watcher/store/server adapter can supply the immutable workspace
 * description and the current log segment, then consume the JSON-friendly
 * results exported here.
 */

import type { MDNode, ModWorkspace } from '../types';
import { normPath, parseXmlLenient, walkElements } from './xmlLite';
import { isX4FileSignatureNotice } from './logTelemetry';

export type RuntimeAttributionDisposition =
  | 'confirmed_active'
  | 'ambiguous'
  | 'excluded_other_mod'
  | 'unknown';

export type RuntimeEvidenceStrength = 'exact' | 'alias' | 'display_name';

export type RuntimeCandidateKind =
  | 'direct_extension_fault'
  | 'md_fault'
  | 'ai_fault'
  | 'lua_fault'
  | 'engine_fault'
  | 'ui_reload_fault'
  | 'file_io'
  | 'authored_diagnostic'
  | 'raw_engine_id_in_player_text'
  | 'unknown';

export interface RuntimeReferenceEntry {
  id: string;
  name?: string;
}

export interface RuntimeReferenceVocabulary {
  factions?: Iterable<string | RuntimeReferenceEntry>;
  wares?: Iterable<string | RuntimeReferenceEntry>;
}

export interface RuntimeRawEngineIdLeak {
  id: string;
  domain: 'faction' | 'ware';
  displayName?: string;
  phrase: string;
  offset: number;
}

export interface RuntimeManifestFile {
  path: string;
  text: string;
}

export interface RuntimeMdScriptIdentity {
  name: string;
  path?: string;
  cues?: string[];
  libraries?: string[];
}

export interface RuntimeAiScriptIdentity {
  id?: string;
  name?: string;
  path?: string;
}

export interface RuntimeLuaIdentity {
  path: string;
  modules?: string[];
  text?: string;
}

export type RuntimeManifestInput = Record<string, string> | RuntimeManifestFile[];

/**
 * Workspace/extension data accepted by the pure index builder.  `workspace`
 * is optional so an adapter can pass the existing ModWorkspace directly while
 * also supplying deployed/source identities and a richer file manifest.
 */
export interface RuntimeExtensionInput {
  workspaceId?: string;
  id?: string;
  name?: string;
  displayName?: string;
  contentId?: string;
  contentIds?: string[];
  deployedFolder?: string;
  /** Alias accepted by adapters that call the deployed folder an id. */
  deployedId?: string;
  deployedFolders?: string[];
  /** Physical installed folders, excluding names inferred from a canonical content ID. */
  exactDeployedFolders?: string[];
  sourceFolder?: string;
  sourceFolders?: string[];
  aliases?: string[];
  manifest?: RuntimeManifestInput;
  files?: RuntimeManifestFile[];
  mdScripts?: RuntimeMdScriptIdentity[];
  aiScripts?: RuntimeAiScriptIdentity[];
  luaFiles?: RuntimeLuaIdentity[];
  nodes?: MDNode[];
  workspace?: ModWorkspace;
}

export interface RuntimeOwnershipBuildInput extends RuntimeExtensionInput {
  /** Explicit form for callers that keep the active workspace separate. */
  active?: RuntimeExtensionInput;
  otherExtensions?: RuntimeExtensionInput[];
  /** Synonym useful to a log adapter that has a known installed-extension list. */
  knownOtherExtensions?: RuntimeExtensionInput[];
}

export interface RuntimeOwnedNodeSpan {
  ownerId: string;
  nodeId: string;
  label: string;
  xmlTag: string;
  file: string;
  semanticPath?: string;
  start: number;
  end: number;
  modeled: boolean;
}

export interface RuntimeOwnedFile extends RuntimeManifestFile {
  ownerId: string;
}

export interface RuntimeOwnerRecord {
  ownerId: string;
  workspaceId: string;
  active: boolean;
  displayName: string;
  contentIds: string[];
  deployedFolders: string[];
  exactDeployedFolders: string[];
  sourceFolders: string[];
  aliases: string[];
  manifest: RuntimeOwnedFile[];
  mdScripts: RuntimeMdScriptIdentity[];
  aiScripts: RuntimeAiScriptIdentity[];
  luaFiles: RuntimeLuaIdentity[];
  nodeSpans: RuntimeOwnedNodeSpan[];
}

export interface RuntimeOwnershipIndex {
  activeWorkspaceId?: string;
  owners: RuntimeOwnerRecord[];
}

export interface RuntimeLogLine {
  lineNumber: number;
  text: string;
  category?: string;
  timestamp?: string;
}

export interface RuntimeStackFrame {
  file?: string;
  line?: number;
  functionName?: string;
  raw: string;
}

export interface RuntimeCandidateSource {
  file?: string;
  line?: number;
  extensionFolder?: string;
  mdScript?: string;
  mdReference?: string;
  cue?: string;
  library?: string;
  aiScript?: string;
  luaModule?: string;
  uiOwnershipConflict?: boolean;
  stackFrames: RuntimeStackFrame[];
}

export interface RuntimeCandidateEvidence {
  label: string;
  value: string;
  strength?: RuntimeEvidenceStrength;
}

export interface RuntimeAuthoredEmitterSupport {
  file: string;
  line: number;
  source: string;
}

export interface RuntimeAuthoredEmitterLocation {
  ownerId: string;
  workspaceId: string;
  file: string;
  line: number;
  source: string;
  supportingEvidence: RuntimeAuthoredEmitterSupport[];
}

export interface RuntimeCandidateIncident {
  id: string;
  startLine: number;
  endLine: number;
  /** First line, retained as a compatibility-friendly scalar. */
  lineNumber: number;
  lineNumbers: number[];
  lines: string[];
  raw: string;
  message: string;
  timestamp?: string;
  lastTimestamp?: string;
  kind: RuntimeCandidateKind;
  recognized: boolean;
  explicitUnknown: boolean;
  isEngineFailure: boolean;
  engineSignature?: string;
  /** Positioned tagged Lua faults require exact installed-folder attribution. */
  physicalLuaSource?: true;
  rawEngineIdLeaks?: RuntimeRawEngineIdLeak[];
  source: RuntimeCandidateSource;
  evidence: RuntimeCandidateEvidence[];
}

export interface RuntimeAttributionEvidence {
  ownerId?: string;
  label: string;
  value: string;
  strength: RuntimeEvidenceStrength;
  rank: number;
}

export interface RuntimeAttribution {
  disposition: RuntimeAttributionDisposition;
  confidence: number;
  reason: string;
  evidence: RuntimeAttributionEvidence[];
  matchedOwnerId?: string;
  matchedWorkspaceId?: string;
  authoredEmitter?: RuntimeAuthoredEmitterLocation;
  authoredEmitterCandidates?: RuntimeAuthoredEmitterLocation[];
}

export interface RuntimeSourceMapping {
  kind: 'node' | 'file_line' | 'unmapped';
  file?: string;
  line?: number;
  offset?: number;
  nodeId?: string;
  nodeLabel?: string;
  xmlTag?: string;
  semanticPath?: string;
  candidateLocations?: RuntimeAuthoredEmitterLocation[];
  reason: string;
}

export interface RuntimeExplanation {
  cause: string;
  impact: string;
  nextAction: string;
  evidenceLabel: string;
  ruleLabel?: string;
  summary: string;
}

export interface RuntimeAnalyzedCandidate extends RuntimeCandidateIncident {
  attribution: RuntimeAttribution;
  mapping: RuntimeSourceMapping;
  explanation: RuntimeExplanation;
}

export interface RuntimeIncidentSample {
  firstLine: number;
  lastLine: number;
  timestamp?: string;
  text: string;
}

export interface RuntimeIncident {
  key: string;
  count: number;
  firstLine: number;
  lastLine: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  candidateIds: string[];
  omittedCandidateIds: number;
  attribution: RuntimeAttribution;
  mapping: RuntimeSourceMapping;
  explanation: RuntimeExplanation;
  evidence: string[];
  samples: RuntimeIncidentSample[];
}

export interface RuntimeCoverage {
  candidates: number;
  recognized: number;
  explicitUnknown: number;
  silentlyDropped: number;
  recognizedOrExplicitUnknown: number;
  recognizedOrExplicitUnknownRatio: number;
  dispositionCounts: Record<RuntimeAttributionDisposition, number>;
  dispositionSum: number;
}

export type RuntimeExpectedStepTruth = 'observed' | 'missing' | 'unavailable';

export interface RuntimeExpectedStep {
  id: string;
  label?: string;
  marker?: string;
  markers?: string[];
  /** Any one of these exact substrings is sufficient evidence. */
  evidence?: string[];
  file?: string;
  line?: number;
  mdScript?: string;
  cue?: string;
  aiScript?: string;
  luaModule?: string;
}

export interface RuntimeCurrentSegmentEvidence {
  available: boolean;
  segmentId?: string;
  lines: string[];
  candidates?: RuntimeCandidateIncident[];
}

export interface RuntimeExpectedStepResult {
  id: string;
  label: string;
  truth: RuntimeExpectedStepTruth;
  observed: boolean;
  success: boolean;
  evidence: string[];
}

export interface RuntimeDebuggerAnalysisInput {
  logText: string;
  ownership?: RuntimeOwnershipIndex;
  active?: RuntimeExtensionInput;
  activeWorkspace?: RuntimeExtensionInput;
  otherExtensions?: RuntimeExtensionInput[];
  expectedSteps?: RuntimeExpectedStep[];
  currentSegment?: RuntimeCurrentSegmentEvidence;
  referenceVocabulary?: RuntimeReferenceVocabulary;
  sampleLimit?: number;
}

export interface RuntimeDebuggerAnalysis {
  ownership: RuntimeOwnershipIndex;
  candidates: RuntimeAnalyzedCandidate[];
  incidents: RuntimeIncident[];
  coverage: RuntimeCoverage;
  expectedSteps: RuntimeExpectedStepResult[];
}

/** Public payload ceilings for the pure model's hostile-input boundary. */
export const RUNTIME_DEBUGGER_LIMITS = {
  maxLineChars: 4096,
  maxGroupChars: 16384,
  maxMessageChars: 1024,
  maxEvidenceChars: 512,
  maxSourceTokenChars: 2048,
  maxStackFrames: 64,
  maxCandidateIds: 64,
  maxEvidence: 8,
  maxSamples: 4,
} as const;

const MAX_EVIDENCE = RUNTIME_DEBUGGER_LIMITS.maxEvidence;
const MAX_SAMPLES: number = RUNTIME_DEBUGGER_LIMITS.maxSamples;
const MAX_CANDIDATE_IDS = RUNTIME_DEBUGGER_LIMITS.maxCandidateIds;
const MAX_AUTHORED_EMITTERS = RUNTIME_DEBUGGER_LIMITS.maxEvidence;
const MAX_AUTHORED_EMITTER_SUPPORT = 4;

function clipText(value: unknown, limit: number): string {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function uniquePreservingOrder(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean)));
}

/** Stable extension-relative/path comparison used by both ownership and mapping. */
export function normalizeRuntimePath(value: string): string {
  return normPath(String(value ?? ''))
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function basename(value: string): string {
  const normalized = normalizeRuntimePath(value);
  return normalized.split('/').pop() || normalized;
}

function stem(value: string): string {
  return basename(value).replace(/\.(?:xml|lua|xpl)$/i, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeToken(text: string, token: string): boolean {
  const value = String(token ?? '').trim();
  if (value.length < 2) return false;
  if (value.includes('/') || value.includes('\\')) {
    return normalizeRuntimePath(text).includes(normalizeRuntimePath(value));
  }
  return new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(value)}([^A-Za-z0-9_.-]|$)`, 'i').test(text);
}

function containsDisplayName(text: string, name: string): boolean {
  const value = String(name ?? '').trim();
  return value.length >= 3 && text.toLowerCase().includes(value.toLowerCase());
}

function manifestEntries(input?: RuntimeManifestInput): RuntimeManifestFile[] {
  if (Array.isArray(input)) {
    return input
      .filter(file => file && typeof file.path === 'string' && typeof file.text === 'string')
      .map(file => ({ path: normalizeRuntimePath(file.path), text: file.text }));
  }
  if (input && typeof input === 'object') {
    return Object.entries(input)
      .filter(([, text]) => typeof text === 'string')
      .map(([path, text]) => ({ path: normalizeRuntimePath(path), text: text as string }));
  }
  return [];
}

function readWorkspace(input: RuntimeExtensionInput): ModWorkspace | undefined {
  if (input.workspace) return input.workspace;
  if (Array.isArray(input.nodes) && typeof input.id === 'string') return input as unknown as ModWorkspace;
  return undefined;
}

function collectManifest(input: RuntimeExtensionInput, workspace?: ModWorkspace): RuntimeManifestFile[] {
  const byPath = new Map<string, RuntimeManifestFile>();
  const add = (file: RuntimeManifestFile) => {
    const path = normalizeRuntimePath(file.path);
    if (path && typeof file.text === 'string') byPath.set(path, { path, text: file.text });
  };
  for (const file of manifestEntries(input.manifest)) add(file);
  for (const file of input.files || []) add(file);
  if (workspace?.contentOriginal) add({ path: 'content.xml', text: workspace.contentOriginal });
  if (workspace?.mdOriginal) add({ path: workspace.mdOriginal.path, text: workspace.mdOriginal.content });
  for (const file of workspace?.originalFiles || []) add({ path: file.path, text: file.content });
  for (const file of workspace ? workspaceSourceFiles(workspace) : []) {
    if (!file.omitted && typeof file.content === 'string') add({ path: file.path, text: file.content });
  }
  if (workspace?.customLua) {
    const id = workspace.contentId || workspace.id || 'workspace';
    add({ path: `ui/${id}_custom.lua`, text: workspace.customLua });
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function addMdIdentity(map: Map<string, RuntimeMdScriptIdentity>, value: RuntimeMdScriptIdentity): void {
  const name = String(value.name || '').trim();
  if (!name) return;
  const key = `${normalizeIdentity(name)}|${normalizeRuntimePath(value.path || '')}`;
  const prior = map.get(key);
  if (!prior) {
    map.set(key, {
      name,
      ...(value.path ? { path: normalizeRuntimePath(value.path) } : {}),
      cues: uniqueSorted(value.cues || []),
      libraries: uniqueSorted(value.libraries || []),
    });
    return;
  }
  prior.cues = uniqueSorted([...(prior.cues || []), ...(value.cues || [])]);
  prior.libraries = uniqueSorted([...(prior.libraries || []), ...(value.libraries || [])]);
}

function addAiIdentity(map: Map<string, RuntimeAiScriptIdentity>, value: RuntimeAiScriptIdentity): void {
  const id = String(value.id || value.name || value.path || '').trim();
  if (!id) return;
  const key = `${normalizeIdentity(value.id || '')}|${normalizeIdentity(value.name || '')}|${normalizeRuntimePath(value.path || '')}`;
  if (!map.has(key)) map.set(key, { ...value, ...(value.path ? { path: normalizeRuntimePath(value.path) } : {}) });
}

function addLuaIdentity(map: Map<string, RuntimeLuaIdentity>, value: RuntimeLuaIdentity): void {
  const path = normalizeRuntimePath(value.path);
  if (!path) return;
  const key = path;
  const prior = map.get(key);
  if (!prior) {
    map.set(key, { path, modules: uniqueSorted(value.modules || []), ...(value.text !== undefined ? { text: value.text } : {}) });
  } else {
    prior.modules = uniqueSorted([...(prior.modules || []), ...(value.modules || [])]);
    if (prior.text === undefined && value.text !== undefined) prior.text = value.text;
  }
}

function xmlIdentities(path: string, text: string, md: Map<string, RuntimeMdScriptIdentity>, ai: Map<string, RuntimeAiScriptIdentity>): void {
  const root = parseXmlLenient(text);
  if (root) {
    let currentMd: RuntimeMdScriptIdentity | undefined;
    walkElements(root, element => {
      if (element.nodeName === 'mdscript') {
        const name = element.getAttribute('name') || '';
        if (name) {
          currentMd = { name, path, cues: [], libraries: [] };
          addMdIdentity(md, currentMd);
        }
      } else if (currentMd && (element.nodeName === 'cue' || element.nodeName === 'library')) {
        const name = element.getAttribute('name') || '';
        if (name) {
          if (element.nodeName === 'cue') currentMd.cues = uniqueSorted([...(currentMd.cues || []), name]);
          else currentMd.libraries = uniqueSorted([...(currentMd.libraries || []), name]);
          addMdIdentity(md, currentMd);
        }
      } else if (element.nodeName === 'aiscript') {
        const name = element.getAttribute('name') || element.getAttribute('id') || '';
        if (name) addAiIdentity(ai, { id: name, name, path });
      }
    });
    return;
  }

  // Malformed source still contributes identity.  Comments are removed so a
  // commented-out cue cannot become ownership evidence.
  const source = text.replace(/<!--[\s\S]*?-->/g, '');
  const mdMatch = source.match(/<mdscript\b[^>]*\bname\s*=\s*["']([^"']+)["']/i);
  if (mdMatch) {
    const identity: RuntimeMdScriptIdentity = { name: mdMatch[1], path, cues: [], libraries: [] };
    const cueRe = /<(cue|library)\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = cueRe.exec(source))) {
      if (match[1].toLowerCase() === 'cue') identity.cues!.push(match[2]);
      else identity.libraries!.push(match[2]);
    }
    addMdIdentity(md, identity);
  }
  const aiMatch = source.match(/<aiscript\b[^>]*(?:name|id)\s*=\s*["']([^"']+)["']/i);
  if (aiMatch) addAiIdentity(ai, { id: aiMatch[1], name: aiMatch[1], path });
}

function deriveLuaModules(path: string, text?: string): string[] {
  const normalized = normalizeRuntimePath(path).replace(/\.lua$/i, '');
  const modules = [normalized, normalized.replace(/^ui\//, ''), normalized.replace(/\//g, '.')];
  const source = text || '';
  const moduleRe = /\b(?:module|require)\s*\(\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = moduleRe.exec(source))) modules.push(match[1]);
  return uniqueSorted(modules);
}

function buildOwnerRecord(input: RuntimeExtensionInput, active: boolean, ordinal: number): RuntimeOwnerRecord {
  const workspace = readWorkspace(input);
  const workspaceId = String(input.workspaceId || workspace?.id || input.id || input.contentId || input.deployedFolder || `runtime-owner-${ordinal}`).trim();
  const displayName = String(input.displayName || input.name || workspace?.name || workspaceId).trim();
  const contentId = String(input.contentId || workspace?.contentId || input.id || workspaceId).trim();
  const deployedFolder = String(input.deployedFolder || input.deployedId || workspace?.contentId || contentId).trim();
  const sourceFolder = String(input.sourceFolder || workspace?.sourceFolder || '').trim();
  const ownerId = `${active ? 'active' : 'other'}:${workspaceId || ordinal}`;
  const manifest = collectManifest(input, workspace).map(file => ({ ...file, ownerId }));
  const md = new Map<string, RuntimeMdScriptIdentity>();
  const ai = new Map<string, RuntimeAiScriptIdentity>();
  const lua = new Map<string, RuntimeLuaIdentity>();

  for (const identity of input.mdScripts || []) addMdIdentity(md, identity);
  for (const identity of input.aiScripts || []) addAiIdentity(ai, identity);
  for (const identity of input.luaFiles || []) addLuaIdentity(lua, { ...identity, modules: [...(identity.modules || []), ...deriveLuaModules(identity.path, identity.text)] });
  for (const file of manifest) {
    if (/\.xml$/i.test(file.path)) xmlIdentities(file.path, file.text, md, ai);
    if (/(^|\/)aiscripts?\//i.test(file.path)) addAiIdentity(ai, { id: stem(file.path), name: stem(file.path), path: file.path });
    if (/\.lua$/i.test(file.path)) addLuaIdentity(lua, { path: file.path, text: file.text, modules: deriveLuaModules(file.path, file.text) });
  }

  const nodes = input.nodes || workspace?.nodes || [];
  const nodeSpans: RuntimeOwnedNodeSpan[] = [];
  for (const node of nodes) {
    const source = node?.source;
    if (!source || typeof source.path !== 'string' || !Number.isFinite(source.start) || !Number.isFinite(source.end)) continue;
    const file = normalizeRuntimePath(source.path);
    if (!file || source.end < source.start) continue;
    nodeSpans.push({
      ownerId,
      nodeId: node.id,
      label: node.label || node.id,
      xmlTag: node.xmlTag,
      file,
      semanticPath: source.semanticPath,
      start: source.start,
      end: source.end,
      modeled: source.modeled !== false,
    });
    const script = String(node.properties?.mdScript || '').trim();
    const cueName = node.type === 'cue' ? String(node.properties?.name || '').trim() : '';
    const fileStem = String(node.properties?.mdFileStem || '').trim();
    if (script) addMdIdentity(md, { name: script, path: file, cues: cueName ? [cueName] : [] });
    else if (fileStem && /(^|\/)md\//i.test(file)) addMdIdentity(md, { name: fileStem, path: file, cues: cueName ? [cueName] : [] });
  }

  return {
    ownerId,
    workspaceId,
    active,
    displayName,
    contentIds: uniqueSorted([contentId, ...(input.contentIds || [])]),
    deployedFolders: uniqueSorted([deployedFolder, ...(input.deployedFolders || [])]),
    exactDeployedFolders: uniqueSorted((input.exactDeployedFolders ?? [input.deployedFolder || '']).map(normalizeIdentity)),
    sourceFolders: uniqueSorted([sourceFolder, sourceFolder ? basename(sourceFolder) : '', ...(input.sourceFolders || [])]),
    aliases: uniqueSorted(input.aliases || []),
    manifest,
    mdScripts: Array.from(md.values()).sort((left, right) => `${left.name}|${left.path || ''}`.localeCompare(`${right.name}|${right.path || ''}`)),
    aiScripts: Array.from(ai.values()).sort((left, right) => `${left.id || ''}|${left.path || ''}`.localeCompare(`${right.id || ''}|${right.path || ''}`)),
    luaFiles: Array.from(lua.values()).sort((left, right) => left.path.localeCompare(right.path)),
    nodeSpans: nodeSpans.sort((left, right) => left.file.localeCompare(right.file) || left.start - right.start || left.end - right.end || left.nodeId.localeCompare(right.nodeId)),
  };
}

/** Build active and known-other ownership without touching the filesystem. */
export function buildRuntimeOwnershipIndex(input: RuntimeOwnershipBuildInput | RuntimeExtensionInput): RuntimeOwnershipIndex {
  const envelope = input as RuntimeOwnershipBuildInput;
  const activeInput = envelope.active || input;
  const others = envelope.otherExtensions || envelope.knownOtherExtensions || [];
  const active = buildOwnerRecord(activeInput, true, 0);
  const records = [active, ...others.map((owner, index) => buildOwnerRecord(owner, false, index + 1))];
  return { activeWorkspaceId: active.workspaceId || undefined, owners: records };
}

function parseLogLine(text: string, lineNumber: number): RuntimeLogLine {
  const raw = String(text ?? '');
  const categoryMatch = raw.match(/^\s*\[([^\]]+)\]\s*/);
  const category = categoryMatch?.[1];
  const rest = categoryMatch ? raw.slice(categoryMatch[0].length) : raw;
  const timestampMatch = rest.match(/^(\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s+(.*)$/);
  return {
    lineNumber,
    text: raw,
    ...(category ? { category } : {}),
    ...(timestampMatch ? { timestamp: timestampMatch[1] } : {}),
  };
}

function normalizedText(text: string): string {
  return String(text ?? '').replace(/\\/g, '/');
}

function extractExtensionPath(text: string): { folder: string; relativePath: string; line?: number } | undefined {
  const value = normalizedText(text);
  const marker = /(?:^|[/\s"'(`])extensions\//ig;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(value))) {
    const markerText = value.slice(match.index);
    const extensionOffset = markerText.toLowerCase().indexOf('extensions/');
    if (extensionOffset < 0) continue;
    const start = match.index + extensionOffset;
    const rest = value.slice(start + 11);
    const folderMatch = rest.match(/^([^/\s"'`]+)/);
    if (!folderMatch) continue;
    const folder = folderMatch[1];
    const afterFolder = rest.slice(folder.length).replace(/^\/+/, '');
    const pathMatch = afterFolder.match(/^([^()\s"'`,]+?)(?:(?:\((\d+)\)|:(\d+)):?)?(?=\s|$|["'`,])/);
    if (!pathMatch || !pathMatch[1]) continue;
    return { folder, relativePath: normalizeRuntimePath(pathMatch[1]), line: pathMatch[2] || pathMatch[3] ? Number(pathMatch[2] || pathMatch[3]) : undefined };
  }
  return undefined;
}

function extractFileReferences(text: string): Array<{ file: string; line?: number }> {
  const value = normalizedText(text);
  const found: Array<{ file: string; line?: number }> = [];
  const tokens = /[^()\s"'`]+/g;
  const reference = /((?:[A-Za-z]:\/)?[^()\s"'`]+?\.(?:lua|xpl|xml))(?:(?::(\d+))|\((\d+)\))(?::?)/iy;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(value))) {
    const tokenEnd = tokens.lastIndex;
    let start = token.index;
    while (start < tokenEnd) {
      reference.lastIndex = start;
      const match = reference.exec(value);
      // A later start in this token cannot supply a missing positioned suffix.
      if (!match) break;
      const file = normalizeRuntimePath(match[1].replace(/^[([{]+/, '').replace(/[\]},]+$/, ''));
      if (file) found.push({ file, line: Number(match[2] || match[3]) });
      start = reference.lastIndex;
    }
    // A parenthesized coordinate can extend beyond the filename token.
    tokens.lastIndex = Math.max(tokenEnd, start);
  }
  return found;
}

function extractStackFrames(lines: string[]): RuntimeStackFrame[] {
  const frames: RuntimeStackFrame[] = [];
  for (const raw of lines) {
    const refs = extractFileReferences(raw);
    const functionName = raw.match(/\bin function\s+["']?([^"']+?)["']?\s*$/i)?.[1];
    if (refs.length) {
      for (const ref of refs) frames.push({ file: ref.file, line: ref.line, ...(functionName ? { functionName } : {}), raw });
    } else if (/^\s*(?:stack traceback:|at\s+)/i.test(raw)) {
      frames.push({ ...(functionName ? { functionName } : {}), raw });
    }
  }
  return frames;
}

function extractSource(text: string, lines: string[]): RuntimeCandidateSource {
  const all = lines.join('\n');
  const direct = extractExtensionPath(all);
  const fileRefs = extractFileReferences(all);
  const luaRef = fileRefs.find(ref => /\.(?:lua|xpl)$/i.test(ref.file));
  const mdRef = fileRefs.find(ref => /(^|\/)md\//i.test(ref.file));
  const aiRef = fileRefs.find(ref => /(^|\/)aiscripts?\//i.test(ref.file));
  const mdQualified = all.match(/\b(md\.[A-Za-z0-9_.-]+)/i)?.[1];
  const mdContext = all.match(/\b(?:md\s*script|mdscript|script)\s+["'`]?([A-Za-z0-9_.-]+)/i)?.[1];
  const cue = all.match(/\b(?:cue|cue\s+name)\s*(?:=|:)?\s*["'`]?([A-Za-z_][A-Za-z0-9_.-]*)/i)?.[1];
  const library = all.match(/\blibrary\s*(?:=|:)\s*["'`]?([A-Za-z_][A-Za-z0-9_.-]*)/i)?.[1];
  const aiContext = all.match(/\b(?:ai[\s_-]*script|aiscript)\s+["'`]?([A-Za-z0-9_.-]+)/i)?.[1];
  const moduleMatch = all.match(/\b(?:module|require)\s*\(\s*["']([^"']+)["']/i)?.[1];
  const qualifiedParts = mdQualified?.slice(3).split('.') || [];
  const mdScript = mdContext || (mdRef ? stem(mdRef.file) : qualifiedParts[0]);
  const qualifiedCue = qualifiedParts.length > 1 ? qualifiedParts[qualifiedParts.length - 1] : undefined;
  const sourceLine = direct?.line || luaRef?.line || mdRef?.line || aiRef?.line || Number(all.match(/\bline\s+(\d+)/i)?.[1] || 0) || undefined;
  const file = direct?.relativePath || luaRef?.file || mdRef?.file || aiRef?.file;
  const aiScript = aiContext || (aiRef ? stem(aiRef.file) : undefined);
  return {
    ...(file ? { file } : {}),
    ...(sourceLine ? { line: sourceLine } : {}),
    ...(direct ? { extensionFolder: normalizeIdentity(direct.folder) } : {}),
    ...(mdScript ? { mdScript: mdScript.replace(/^md\./i, '') } : {}),
    ...(mdQualified ? { mdReference: mdQualified } : {}),
    ...(cue || qualifiedCue ? { cue: cue || qualifiedCue } : {}),
    ...(library ? { library } : {}),
    ...(aiScript ? { aiScript } : {}),
    ...(moduleMatch ? { luaModule: moduleMatch } : {}),
    stackFrames: extractStackFrames(lines),
  };
}

function boundRuntimeSource(source: RuntimeCandidateSource): RuntimeCandidateSource {
  const bound = (value: string | undefined): string | undefined => value === undefined
    ? undefined
    : clipText(value, RUNTIME_DEBUGGER_LIMITS.maxSourceTokenChars);
  return {
    ...(bound(source.file) ? { file: bound(source.file) } : {}),
    ...(source.line === undefined ? {} : { line: source.line }),
    ...(bound(source.extensionFolder) ? { extensionFolder: bound(source.extensionFolder) } : {}),
    ...(bound(source.mdScript) ? { mdScript: bound(source.mdScript) } : {}),
    ...(bound(source.mdReference) ? { mdReference: bound(source.mdReference) } : {}),
    ...(bound(source.cue) ? { cue: bound(source.cue) } : {}),
    ...(bound(source.library) ? { library: bound(source.library) } : {}),
    ...(bound(source.aiScript) ? { aiScript: bound(source.aiScript) } : {}),
    ...(bound(source.luaModule) ? { luaModule: bound(source.luaModule) } : {}),
    ...(source.uiOwnershipConflict ? { uiOwnershipConflict: true } : {}),
    stackFrames: source.stackFrames.slice(0, RUNTIME_DEBUGGER_LIMITS.maxStackFrames).map(frame => ({
      ...(bound(frame.file) ? { file: bound(frame.file) } : {}),
      ...(frame.line === undefined ? {} : { line: frame.line }),
      ...(bound(frame.functionName) ? { functionName: bound(frame.functionName) } : {}),
      raw: clipText(frame.raw, RUNTIME_DEBUGGER_LIMITS.maxLineChars),
    })),
  };
}

const ENGINE_SIGNATURES: Array<{ re: RegExp; label: string }> = [
  { re: /\bscript error\b/i, label: 'script error' },
  { re: /\battempt to (?:index|call|perform|compare|concatenate)\b/i, label: 'lua runtime fault' },
  { re: /\bstack traceback\b/i, label: 'stack traceback' },
  { re: /\bnil value\b|\ba nil value\b/i, label: 'nil value' },
  { re: /\bunresolved\b|\bundefined (?:property|method|function)\b/i, label: 'unresolved reference' },
  { re: /\bcould not (?:find|resolve|load|open|create)\b/i, label: 'engine could-not' },
  { re: /\bfailed to (?:load|parse|open|read|create|initialise|initialize|run|compile)\b/i, label: 'engine failed-to' },
  { re: /\bexception\b/i, label: 'exception' },
  { re: /\binvalid (?:argument|parameter|value|expression|macro|reference)\b/i, label: 'invalid engine input' },
  { re: /\berror in (?:md|ai) (?:cue|script)\b|\bmd (?:script )?error\b/i, label: 'md/ai error' },
  { re: /\berror loading\b|\bloop or previous error\b/i, label: 'module load error' },
  { re: /\bparse error\b|\bsyntax error\b|\bnot well[- ]formed\b|\bpremature end\b/i, label: 'parse error' },
  { re: /\bno corresponding library\b|\bcannot run actions\b/i, label: 'invalid MD action' },
  { re: /\bneither of the attributes\s+['"]actor['"]\s+and\s+['"]template['"]\s+is\s+present\b/i, label: 'missing actor/template attributes' },
  { re: /\*{3}/, label: 'engine *** marker' },
];

function engineSignature(text: string): string | undefined {
  return ENGINE_SIGNATURES.find(item => item.re.test(text))?.label;
}

const FAILURE_RE = /\b(?:error|failed|failure|fatal|exception|invalid|cannot|could not|unable|rejected|abort(?:ed|ing)?|missing|undefined|nil value|attempt to|stack traceback|not found|no corresponding|crash|fault|warning|signature|parse error|syntax error)\b/i;
const FILE_IO_RE = /\b(?:file\s*i\/?o|fileio|signature|failed to verify|loading extension|load(?:ed|ing)? file|could not open file)\b/i;
const BRACKETED_DIAGNOSTIC_TAG_RE = /\[[A-Za-z][A-Za-z0-9_-]{2,}\]/i;
const TWO_BRACKETED_DIAGNOSTIC_TAGS_RE = /(?:\[[A-Za-z][A-Za-z0-9_-]{2,}\]){2,}/i;

function taggedRuntimePayload(line: string): string | undefined {
  if (!/^\s*\[=ERROR=\]/i.test(line) || isX4FileSignatureNotice(line)) return;
  return /^(?:\[[A-Za-z][A-Za-z0-9_-]{2,}\][ \t]*)+(.+)$/i.exec(compactMessage(line))?.[1];
}

/** Undefined means another format. Null means a Lua source without a usable position. */
function positionedTaggedLuaSource(payload: string) {
  const source = /^extensions[\\/]([a-z0-9_-][a-z0-9_.-]{0,127})[\\/]([^():\s"'`,]+?\.(?:lua|xpl))(?=$|[:(\s])/i.exec(payload);
  if (!source) return;
  const located = /^(?::(\d+)|\((\d+)\)):?[ \t]+(.+)$/.exec(payload.slice(source[0].length));
  if (!located) return null;
  const relative = normalizedText(source[2]);
  const line = Number(located[1] || located[2]);
  if (!Number.isSafeInteger(line) || line < 1 || relative.length > RUNTIME_DEBUGGER_LIMITS.maxSourceTokenChars
    || relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
  const signature = ENGINE_SIGNATURES.find(({ re, label }) => label !== 'engine *** marker' && re.exec(located[3])?.index === 0)?.label;
  return { folder: normalizeIdentity(source[1]), file: normalizeRuntimePath(relative), line, signature };
}

export function taggedLuaFaultFolder(line: string): string | undefined {
  const payload = taggedRuntimePayload(line);
  const source = payload ? positionedTaggedLuaSource(payload) : undefined;
  return source?.signature ? source.folder : undefined;
}

function isAuthoredTaggedPayload(payload: string): boolean {
  return !/^(?:extensions[\\/]|\S+\.(?:lua|xml|xpl)[:(]\d+|script error\b|error in (?:md|ai)\b|attempt to\b|stack traceback\b|invalid (?:argument|parameter)\b)/i.test(payload);
}

/** A tagged status can quote a fault while reporting ordinary mod activity. */
export function isAuthoredRuntimeDiagnostic(line: string): boolean {
  const payload = taggedRuntimePayload(line);
  if (!payload) return false;
  const source = positionedTaggedLuaSource(payload);
  return source === undefined ? isAuthoredTaggedPayload(payload) : !source?.signature;
}

function isUiWidgetFault(line: string): boolean {
  return /^CWidgetController::UpdateFrame\(\)\s*-\s*Validation error\b/i.test(compactMessage(line));
}

function isUiReload(line: string): boolean {
  return /^(?:Errormessage:\s*[^\r\n]*?:\d+:\s*)?Failed to create view for menu\s+[^\r\n]+?\.\s+Reloading UI\b/i.test(compactMessage(line));
}

const UI_TRACE_START = /^\s*stack traceback:/i;
const RUNTIME_GROUP_LINE_LIMIT = 80;

function luaExtensionFrame(line: string): { folder: string; frame: RuntimeStackFrame } | undefined {
  const match = /^\s*\[string (["'])extensions[\\/]([a-z0-9_-][a-z0-9_.-]{0,127})[\\/]([^"'\r\n]+)\1\]:(\d+)(?=$|:|\s)/i.exec(line);
  if (!match) return;
  const relative = match[3].replace(/\\/g, '/');
  // eslint-disable-next-line no-control-regex -- Reject C0 controls and colons before attributing an extension stack frame.
  if (/[:\u0000-\u001f]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) return;
  const folder = normalizeIdentity(match[2]);
  if (relative.endsWith('...')) return { folder, frame: { raw: line } };
  const number = Number(match[4]);
  if (!/\.(?:lua|xpl)$/i.test(relative) || !Number.isSafeInteger(number) || number < 1
    || relative.length > RUNTIME_DEBUGGER_LIMITS.maxSourceTokenChars) return;
  return { folder, frame: { file: normalizeRuntimePath(relative), line: number, raw: line } };
}

function uiFaultSource(lines: string[], widget: boolean): RuntimeCandidateSource {
  const traceStart = widget ? lines.findIndex(line => UI_TRACE_START.test(line)) : -1;
  const frames = traceStart < 0 ? [] : lines.slice(traceStart + 1).flatMap(line => luaExtensionFrame(line) ?? []);
  const folders = new Set(frames.map(({ folder }) => folder));
  const primary = frames[0];
  return {
    ...(folders.size > 1 ? { uiOwnershipConflict: true } : {}),
    ...(folders.size === 1 ? { extensionFolder: primary.folder,
      ...(primary.frame.file ? { file: primary.frame.file, line: primary.frame.line } : {}) } : {}),
    stackFrames: frames.map(({ frame }) => frame),
  };
}

function isAuthoredDiagnostic(text: string): boolean {
  const value = String(text ?? '');
  const marker = value.search(/\[=ERROR=\]/i);
  if (marker >= 0) {
    const lineEnd = value.indexOf('\n', marker);
    const markerLine = value.slice(marker, lineEnd < 0 ? value.length : lineEnd);
    if (BRACKETED_DIAGNOSTIC_TAG_RE.test(markerLine.slice(9))) return true;
  }
  return TWO_BRACKETED_DIAGNOSTIC_TAGS_RE.test(value);
}

function isHeader(line: RuntimeLogLine): boolean {
  return Boolean(line.category) || /^\s*\d+(?:\.\d+)?\s+/.test(line.text);
}

function hasSourceLikeContext(text: string): boolean {
  return Boolean(extractExtensionPath(text) || extractFileReferences(text).length || /\b(?:md\s*script|mdscript|aiscript|ai[\s_-]*script|stack traceback|module|require)\b/i.test(text) || FILE_IO_RE.test(text) || isAuthoredDiagnostic(text));
}

interface CompiledRuntimeVocabulary {
  factions: Map<string, string | undefined>;
  wares: Map<string, string | undefined>;
}

const compiledVocabCache = new WeakMap<object, CompiledRuntimeVocabulary>();

const SKIP_PLAIN_ENGLISH_IDS = new Set([
  'player', 'credits', 'crew', 'water', 'ice', 'ore', 'meat', 'wheat',
  'silicon', 'helium', 'hydrogen', 'methane', 'graphene', 'spices',
  'stimulants', 'plankton', 'condensate',
]);

const CONTEXTUAL_FACTION_IDS = new Set([
  'alliance', 'civilian', 'court', 'criminal', 'ministry', 'outlaw',
  'pioneers', 'scavenger', 'smuggler', 'split', 'trinity', 'visitor',
]);

const FACTION_SLOT_PREFIX_RE = /\b(?:sign\s+for|for|with|of|by|to|from|against|between|versus|vs\.?|envoy\s+of|representative\s+of|leadership\s+of|ships?\s+of|stations?\s+of|territory\s+of|paid\s+to|owed\s+by|lent\s+by)\s+$/i;
const ATTRIBUTIVE_NOUN_SUFFIX_RE = /^\s+(?:ships?|vessels?|stations?|traffic|pilots?|crews?|targets?|intent|activity|records?|fleets?|docks?|population|courts?|sectors?|space|laws?|rules?)\b/i;
const PROSE_NEIGHBOR_LEFT_RE = /(?:[A-Za-z]{2,}|\d+)\s+$/;
const PROSE_NEIGHBOR_RIGHT_RE = /^\s+[A-Za-z]{2,}/;

function compileRuntimeVocabulary(vocabulary?: RuntimeReferenceVocabulary): CompiledRuntimeVocabulary | null {
  if (!vocabulary || typeof vocabulary !== 'object') return null;
  const cached = compiledVocabCache.get(vocabulary as object);
  if (cached) return cached;
  const factions = new Map<string, string | undefined>();
  const wares = new Map<string, string | undefined>();
  for (const item of vocabulary.factions || []) {
    const rawId = typeof item === 'string' ? item : item?.id;
    if (!rawId) continue;
    const id = rawId.startsWith('faction.') ? rawId.slice(8) : rawId;
    if (!/^[a-z][a-z0-9_]*$/.test(id) || SKIP_PLAIN_ENGLISH_IDS.has(id)) continue;
    const displayName = typeof item === 'object' && item?.name ? item.name : undefined;
    if (!factions.has(id) || displayName) factions.set(id, displayName);
  }
  for (const item of vocabulary.wares || []) {
    const id = typeof item === 'string' ? item : item?.id;
    if (!id || !/^[a-z][a-z0-9_]*$/.test(id) || SKIP_PLAIN_ENGLISH_IDS.has(id)) continue;
    const displayName = typeof item === 'object' && item?.name ? item.name : undefined;
    if (!wares.has(id) || displayName) wares.set(id, displayName);
  }
  const compiled: CompiledRuntimeVocabulary = { factions, wares };
  if (factions.size || wares.size) compiledVocabCache.set(vocabulary as object, compiled);
  return factions.size || wares.size ? compiled : null;
}

/**
 * Scan a runtime/game-log line for bare lowercase canonical faction or ware IDs used as words in prose.
 * Excludes FileIO/signature notices, stack frames, engine fault headers, capitalized display names,
 * quoted literals, key=value pairs, paths, and attributive English uses ("for civilian ships").
 */
export function detectRawEngineIdsInProse(text: string, vocabulary?: RuntimeReferenceVocabulary): RuntimeRawEngineIdLeak[] {
  const compiled = compileRuntimeVocabulary(vocabulary);
  if (!compiled) return [];
  const raw = String(text ?? '');
  if (!raw.trim() || isX4FileSignatureNotice(raw) || FILE_IO_RE.test(raw)) return [];
  if (/^\s*(?:stack traceback:|\[C\]\s*:|at\s+|in function\b|\[string\s+)/i.test(raw)) return [];
  if (isUiWidgetFault(raw) || isUiReload(raw)) return [];
  const compact = compactMessage(raw);
  const body = compact.replace(/^(?:\s*\[[A-Za-z][A-Za-z0-9_-]{2,}\]\s*)+/, '').trim();
  if (!body || /^(?:extensions[\\/]|\S+\.(?:lua|xml|xpl)[:(]\d+|error in (?:md|ai)\b)/i.test(body)) return [];

  const leaks: RuntimeRawEngineIdLeak[] = [];
  const seen = new Set<string>();
  const tokenRe = /[A-Za-z0-9_./\\'"=:-]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(body)) !== null) {
    const token = match[0];
    // Allow trailing sentence punctuation `:` only when stripped; reject key=value, paths, quotes, or uppercase.
    const clean = token.replace(/:+$/, '');
    if (!clean || clean.length < 3 || !/^[a-z][a-z0-9_]*$/.test(clean)) continue;
    if (token.includes(':') && clean !== token && /^\S/.test(body.slice(match.index + token.length))) {
      // e.g. `brief:civilian:1` stays a single token above; `civilian: something` has space after `:` and is allowed.
    }
    if (SKIP_PLAIN_ENGLISH_IDS.has(clean)) continue;
    const isFaction = compiled.factions.has(clean);
    const isWare = !isFaction && compiled.wares.has(clean);
    if (!isFaction && !isWare) continue;

    const before = body.slice(0, match.index);
    const after = body.slice(match.index + clean.length);
    if (CONTEXTUAL_FACTION_IDS.has(clean)) {
      if (!FACTION_SLOT_PREFIX_RE.test(before)) continue;
      if (ATTRIBUTIVE_NOUN_SUFFIX_RE.test(after)) continue;
    } else {
      if (!PROSE_NEIGHBOR_LEFT_RE.test(before) && !PROSE_NEIGHBOR_RIGHT_RE.test(after)) continue;
    }

    const key = `${isFaction ? 'faction' : 'ware'}:${clean}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const phraseStart = Math.max(0, match.index - 28);
    const phraseEnd = Math.min(body.length, match.index + clean.length + 28);
    const phrase = body.slice(phraseStart, phraseEnd).trim();
    leaks.push({
      id: clean,
      domain: isFaction ? 'faction' : 'ware',
      displayName: isFaction ? compiled.factions.get(clean) : compiled.wares.get(clean),
      phrase,
      offset: match.index,
    });
    if (leaks.length >= MAX_EVIDENCE) break;
  }
  return leaks;
}

function isCandidateStart(line: RuntimeLogLine, vocabulary?: RuntimeReferenceVocabulary): boolean {
  const text = line.text;
  return FAILURE_RE.test(text) || hasSourceLikeContext(text) || isUiWidgetFault(text) || isUiReload(text)
    || (vocabulary !== undefined && detectRawEngineIdsInProse(text, vocabulary).length > 0);
}

function isContinuation(line: RuntimeLogLine): boolean {
  const text = line.text;
  if (/^\s*\[C\]\s*:/i.test(text)) return true;
  if (isHeader(line)) return false;
  return /^\s+/.test(text)
    || /^\s*(?:stack traceback:|at\s+|in function\b|caused by\b|from\b|while\b|during\b)/i.test(text)
    || Boolean(extractFileReferences(text).length && /\.(?:lua|xpl|xml)/i.test(text));
}

function runtimeGroupContinuation(line: RuntimeLogLine, widget: boolean): 'boundary' | 'reload' | 'continue' {
  if (isUiWidgetFault(line.text) || isX4FileSignatureNotice(line.text)) return 'boundary';
  if (isUiReload(line.text)) return widget ? 'reload' : 'boundary';
  return isContinuation(line) || (widget && luaExtensionFrame(line.text)) ? 'continue' : 'boundary';
}

export type RuntimeWidgetFaultGroup = {
  lines: number;
  hasTrace: boolean;
  /** Undefined until a frame establishes a folder. Null means conflicting folders. */
  folder?: string | null;
};

/** Advance a complete physical line without retaining text or source frames across polls. */
export function advanceRuntimeWidgetFaultGroup(pending: RuntimeWidgetFaultGroup | undefined, text: string):
  { pending?: RuntimeWidgetFaultGroup; closedFolder?: string } | undefined {
  if (!pending) {
    if (!/CWidgetController::UpdateFrame/i.test(text) || !isUiWidgetFault(text)) return;
    return { pending: { lines: 1, hasTrace: false } };
  }

  const continuation = runtimeGroupContinuation(parseLogLine(text, pending.lines + 1), true);
  if (continuation === 'boundary') {
    return {
      closedFolder: pending.folder ?? undefined,
      pending: isUiWidgetFault(text) ? { lines: 1, hasTrace: false } : undefined,
    };
  }

  const frameFolder = pending.hasTrace ? luaExtensionFrame(text)?.folder : undefined;
  let folder = pending.folder;
  if (frameFolder) folder = folder === undefined || folder === frameFolder ? frameFolder : null;
  const lines = pending.lines + 1;
  if (continuation === 'reload' || lines === RUNTIME_GROUP_LINE_LIMIT) return { closedFolder: folder ?? undefined };
  return { pending: { lines, hasTrace: pending.hasTrace || UI_TRACE_START.test(text), folder } };
}

function compactMessage(text: string): string {
  return text.replace(/^\s*\[[^\]]+\]\s*/, '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
}

function candidateKind(source: RuntimeCandidateSource, text: string, signature: string | undefined, authored: boolean, fileIo: boolean): { kind: RuntimeCandidateKind; isEngineFailure: boolean } {
  const directFault = Boolean(source.extensionFolder && FAILURE_RE.test(text));
  const contextualFault = Boolean(signature || FAILURE_RE.test(text));
  // Authored diagnostics can name an owned extension path and can be emitted on
  // X4's error channel.  The authored marker is therefore evaluated before the
  // generic direct-path failure heuristic; a genuine governed engine signature
  // still keeps failure severity when it is present alongside the marker.
  if (authored && !signature) return { kind: 'authored_diagnostic', isEngineFailure: false };
  if (fileIo && !signature && !/\b(?:runtime|script)\s+error\b/i.test(text)) return { kind: 'file_io', isEngineFailure: false };
  if (source.extensionFolder && directFault) return { kind: 'direct_extension_fault', isEngineFailure: true };
  if (source.luaModule || (source.file && /\.(?:lua|xpl)$/i.test(source.file))) return { kind: 'lua_fault', isEngineFailure: contextualFault };
  if (source.aiScript || (source.file && /(^|\/)aiscripts?\//i.test(source.file))) return { kind: 'ai_fault', isEngineFailure: contextualFault };
  if (source.mdScript || source.mdReference || source.cue || source.library || (source.file && /(^|\/)md\//i.test(source.file))) return { kind: 'md_fault', isEngineFailure: contextualFault };
  if (signature) return { kind: 'engine_fault', isEngineFailure: true };
  if (authored) return { kind: 'authored_diagnostic', isEngineFailure: false };
  return { kind: 'unknown', isEngineFailure: false };
}

function hashRuntimeText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseCandidate(lines: RuntimeLogLine[], vocabulary?: RuntimeReferenceVocabulary): RuntimeCandidateIncident {
  const fullLines = lines.map(line => line.text);
  const fullRaw = fullLines.join('\n');
  const rawLines = fullLines.map(line => clipText(line, RUNTIME_DEBUGGER_LIMITS.maxLineChars));
  const raw = clipText(rawLines.join('\n'), RUNTIME_DEBUGGER_LIMITS.maxGroupChars);
  const widget = isUiWidgetFault(fullLines[0]);
  const uiFault = widget || isUiReload(fullLines[0]);
  const signatureNotice = isX4FileSignatureNotice(fullLines[0]);
  const source = boundRuntimeSource(uiFault ? uiFaultSource(fullLines, widget) : extractSource(fullRaw, fullLines));
  const tagged = taggedRuntimePayload(fullLines[0]);
  const taggedLua = tagged ? positionedTaggedLuaSource(tagged) : undefined;
  if (taggedLua) {
    source.extensionFolder = taggedLua.folder;
    source.file = taggedLua.file;
    source.line = taggedLua.line;
  }
  const signature = uiFault ? 'X4 UI validation and reload'
    : signatureNotice ? undefined
      : taggedLua !== undefined ? taggedLua?.signature
        : tagged && isAuthoredTaggedPayload(tagged) ? undefined : engineSignature(fullRaw);
  const authored = isAuthoredDiagnostic(fullRaw);
  const fileIo = FILE_IO_RE.test(fullRaw);
  const baseClassification = uiFault ? { kind: 'ui_reload_fault' as const, isEngineFailure: true }
    : signatureNotice ? { kind: 'file_io' as const, isEngineFailure: false }
      : candidateKind(source, fullRaw, signature, authored, fileIo);
  const rawEngineIdLeaks = !uiFault && !signatureNotice && !baseClassification.isEngineFailure && vocabulary
    ? detectRawEngineIdsInProse(fullLines[0] || fullRaw, vocabulary)
    : [];
  const classification = rawEngineIdLeaks.length > 0
    ? { kind: 'raw_engine_id_in_player_text' as const, isEngineFailure: false }
    : baseClassification;
  const recognized = classification.kind !== 'unknown';
  const timestamps = lines.map(line => line.timestamp).filter(Boolean) as string[];
  const evidence: RuntimeCandidateEvidence[] = [];
  const addEvidence = (label: string, value: string, strength?: RuntimeEvidenceStrength) => {
    const boundedValue = clipText(value, RUNTIME_DEBUGGER_LIMITS.maxEvidenceChars);
    if (!boundedValue || evidence.some(item => item.label === label && item.value === boundedValue)) return;
    if (evidence.length < MAX_EVIDENCE) evidence.push({ label, value: boundedValue, ...(strength ? { strength } : {}) });
  };
  if (widget) addEvidence('UI widget validation', compactMessage(fullLines[0]));
  if (uiFault && isUiReload(fullLines.at(-1)!)) addEvidence('UI reload', compactMessage(fullLines.at(-1)!));
  if (source.extensionFolder && source.file) addEvidence('exact extension path', `extensions/${source.extensionFolder}/${source.file}`, 'exact');
  else if (uiFault && source.extensionFolder) addEvidence('exact extension folder', source.extensionFolder, 'exact');
  else if (source.file) addEvidence('source file', source.file, 'exact');
  if (source.mdScript) addEvidence('MD script', source.mdScript, 'exact');
  if (source.cue) addEvidence('MD cue', source.cue, 'exact');
  if (source.library) addEvidence('MD library', source.library, 'exact');
  if (source.aiScript) addEvidence('AI script', source.aiScript, 'exact');
  if (source.luaModule) addEvidence('Lua module', source.luaModule, 'exact');
  if (source.stackFrames.length) addEvidence('stack frames', String(source.stackFrames.length));
  if (signature) addEvidence('engine rule', signature, 'exact');
  if (fileIo) addEvidence('FileIO/load evidence', compactMessage(fullRaw));
  for (const leak of rawEngineIdLeaks) {
    addEvidence(
      'raw engine id in player text',
      `${leak.domain}:${leak.id}${leak.displayName ? ` (${leak.displayName})` : ''} in "${leak.phrase}"`,
      'exact',
    );
  }
  if (authored) addEvidence('authored diagnostic marker', 'bracketed [=ERROR=] diagnostic');
  if (!recognized) addEvidence('unsupported candidate failure', compactMessage(fullRaw));
  const idInput = `${lines[0].lineNumber}:${lines[lines.length - 1].lineNumber}:${classification.kind}:${fullRaw}`;
  return {
    id: `runtime-${hashRuntimeText(idInput)}`,
    startLine: lines[0].lineNumber,
    endLine: lines[lines.length - 1].lineNumber,
    lineNumber: lines[0].lineNumber,
    lineNumbers: lines.map(line => line.lineNumber),
    lines: rawLines,
    raw,
    message: clipText(compactMessage(fullLines[0]), RUNTIME_DEBUGGER_LIMITS.maxMessageChars),
    ...(timestamps[0] ? { timestamp: timestamps[0] } : {}),
    ...(timestamps[timestamps.length - 1] ? { lastTimestamp: timestamps[timestamps.length - 1] } : {}),
    kind: classification.kind,
    recognized,
    explicitUnknown: !recognized,
    isEngineFailure: classification.isEngineFailure,
    ...(signature ? { engineSignature: signature } : {}),
    ...(taggedLua?.signature ? { physicalLuaSource: true as const } : {}),
    ...(rawEngineIdLeaks.length ? { rawEngineIdLeaks } : {}),
    source,
    evidence,
  };
}

export interface RuntimeParseOptions {
  /** Absolute line number for the first supplied line; defaults to 1. */
  startLine?: number;
  /** Backward-compatible synonym for `startLine`. */
  baseLine?: number;
  /** Optional canonical faction/ware reference vocabulary for player-text prose scanning (#58). */
  referenceVocabulary?: RuntimeReferenceVocabulary;
}

/** Parse failure-like log lines into bounded multiline candidates. */
export function parseRuntimeCandidates(logText: string, options?: RuntimeParseOptions): RuntimeCandidateIncident[] {
  return parseRuntimeCandidateBatch(logText, options).candidates;
}

/** Expose the one trailing widget group that could still accept a later line. */
export function parseRuntimeCandidateBatch(logText: string, options?: RuntimeParseOptions, isolatedLines?: ReadonlySet<number>) {
  const requestedBaseLine = options?.startLine ?? options?.baseLine ?? 1;
  const baseLine = Number.isFinite(requestedBaseLine) ? Math.max(1, Math.floor(requestedBaseLine)) : 1;
  const vocabulary = options?.referenceVocabulary;
  const lines = String(logText ?? '').split(/\r?\n/).map((line, index) => parseLogLine(line, index + baseLine));
  const candidates: RuntimeCandidateIncident[] = [];
  let openUiFaultStartLine: number | undefined;
  for (let index = 0; index < lines.length; index++) {
    if (!isCandidateStart(lines[index], vocabulary) || !lines[index].text.trim()) continue;
    const group = [lines[index]];
    const widget = isUiWidgetFault(lines[index].text);
    const orphanReload = isUiReload(lines[index].text);
    const signatureNotice = isX4FileSignatureNotice(lines[index].text);
    const isolated = isolatedLines?.has(lines[index].lineNumber);
    let cursor = index + 1;
    let closedByReload = false;
    while (!isolated && !orphanReload && !signatureNotice && cursor < lines.length && group.length < RUNTIME_GROUP_LINE_LIMIT) {
      const next = lines[cursor];
      if (isolatedLines?.has(next.lineNumber)) break;
      const continuation = runtimeGroupContinuation(next, widget);
      if (continuation === 'boundary') break;
      group.push(next);
      cursor++;
      if (continuation === 'reload') {
        closedByReload = true;
        break;
      }
    }
    if (widget && !isolated && !closedByReload && cursor === lines.length && group.length < RUNTIME_GROUP_LINE_LIMIT) {
      openUiFaultStartLine = lines[index].lineNumber;
    }
    candidates.push(parseCandidate(group, vocabulary));
    index = cursor - 1;
  }
  return { candidates, openUiFaultStartLine };
}

/** Compatibility alias for adapters that call the parser a log parser. */
export const parseRuntimeLog = parseRuntimeCandidates;

function ownerFileMatches(owner: RuntimeOwnerRecord, file: string, extensionFolder?: string): RuntimeOwnedFile[] {
  const requested = normalizeRuntimePath(file);
  const directFolder = normalizeIdentity(extensionFolder || '');
  return owner.manifest.filter(entry => {
    const owned = normalizeRuntimePath(entry.path);
    const pathMatch = requested === owned || requested.endsWith(`/${owned}`) || owned.endsWith(`/${requested}`);
    const folderMatch = !directFolder || owner.deployedFolders.some(folder => normalizeIdentity(folder) === directFolder || normalizeIdentity(folder) === normalizeIdentity(owner.contentIds[0] || ''));
    return pathMatch && folderMatch;
  });
}

function ownerNodeFileMatches(owner: RuntimeOwnerRecord, file: string, extensionFolder?: string): RuntimeOwnedNodeSpan[] {
  const requested = normalizeRuntimePath(file);
  const directFolder = normalizeIdentity(extensionFolder || '');
  if (directFolder && !owner.deployedFolders.some(folder => normalizeIdentity(folder) === directFolder || owner.contentIds.some(id => normalizeIdentity(id) === directFolder))) return [];
  return owner.nodeSpans.filter(span => {
    const owned = normalizeRuntimePath(span.file);
    return requested === owned || requested.endsWith(`/${owned}`) || owned.endsWith(`/${requested}`);
  });
}

function addOwnerMatch(matches: RuntimeAttributionEvidence[], owner: RuntimeOwnerRecord, label: string, value: string, rank: number): void {
  if (!value || matches.some(item => item.ownerId === owner.ownerId && item.label === label && item.value === value)) return;
  matches.push({ ownerId: owner.ownerId, label, value, strength: 'exact', rank });
}

function exactOwnerEvidence(owner: RuntimeOwnerRecord, candidate: RuntimeCandidateIncident): RuntimeAttributionEvidence[] {
  const source = candidate.source;
  const matches: RuntimeAttributionEvidence[] = [];
  const directFolder = normalizeIdentity(source.extensionFolder || '');
  if (directFolder && owner.deployedFolders.some(folder => normalizeIdentity(folder) === directFolder || owner.contentIds.some(id => normalizeIdentity(id) === directFolder))) {
    addOwnerMatch(matches, owner, 'exact extension folder', directFolder, 120);
    if (source.file && ownerFileMatches(owner, source.file, source.extensionFolder).length) addOwnerMatch(matches, owner, 'exact extension path', `${directFolder}/${normalizeRuntimePath(source.file)}`, 140);
  }
  if (source.file && ownerFileMatches(owner, source.file).length) addOwnerMatch(matches, owner, 'exact manifest path', normalizeRuntimePath(source.file), 100);
  if (source.file && ownerNodeFileMatches(owner, source.file, source.extensionFolder).length) addOwnerMatch(matches, owner, 'exact node source path', normalizeRuntimePath(source.file), 102);
  for (const contentId of owner.contentIds) if (wholeToken(candidate.raw, contentId)) addOwnerMatch(matches, owner, 'exact content id', contentId, 96);
  for (const deployedFolder of owner.deployedFolders) if (wholeToken(candidate.raw, deployedFolder)) addOwnerMatch(matches, owner, 'exact deployed folder id', deployedFolder, 98);
  if (source.file) {
    const sourceFile = normalizeRuntimePath(source.file);
    for (const sourceFolder of owner.sourceFolders.filter(folder => folder.includes('/'))) {
      const normalizedFolder = normalizeRuntimePath(sourceFolder);
      if (sourceFile.startsWith(`${normalizedFolder}/`)) addOwnerMatch(matches, owner, 'exact source folder identity', normalizedFolder, 118);
    }
  }
  if (source.mdReference) {
    const qualified = normalizeIdentity(source.mdReference);
    for (const script of owner.mdScripts) {
      if (qualified === `md.${normalizeIdentity(script.name)}` || qualified.startsWith(`md.${normalizeIdentity(script.name)}.`)) {
        addOwnerMatch(matches, owner, 'exact MD script reference', source.mdReference, 112);
      }
    }
  }
  if (source.mdScript && owner.mdScripts.some(script => normalizeIdentity(script.name) === normalizeIdentity(source.mdScript))) addOwnerMatch(matches, owner, 'exact MD script', source.mdScript, 108);
  if (source.cue && owner.mdScripts.some(script => (script.cues || []).some(cue => normalizeIdentity(cue) === normalizeIdentity(source.cue)))) addOwnerMatch(matches, owner, 'exact MD cue identity', source.cue, 86);
  if (source.library && owner.mdScripts.some(script => (script.libraries || []).some(library => normalizeIdentity(library) === normalizeIdentity(source.library)))) addOwnerMatch(matches, owner, 'exact MD library identity', source.library, 86);
  if (source.aiScript && owner.aiScripts.some(script => normalizeIdentity(script.id || script.name || '') === normalizeIdentity(source.aiScript) || normalizeIdentity(script.name || '') === normalizeIdentity(source.aiScript))) addOwnerMatch(matches, owner, 'exact AI script identity', source.aiScript, 106);
  if (source.file && /(^|\/)aiscripts?\//i.test(source.file) && owner.aiScripts.some(script => script.path && normalizeRuntimePath(script.path) === normalizeRuntimePath(source.file))) addOwnerMatch(matches, owner, 'exact AI script path', normalizeRuntimePath(source.file), 110);
  if (source.file && /\.(?:lua|xpl)$/i.test(source.file) && owner.luaFiles.some(file => normalizeRuntimePath(file.path) === normalizeRuntimePath(source.file))) addOwnerMatch(matches, owner, 'exact Lua path', normalizeRuntimePath(source.file), 110);
  if (source.luaModule && owner.luaFiles.some(file => (file.modules || []).some(module => normalizeIdentity(module) === normalizeIdentity(source.luaModule)))) addOwnerMatch(matches, owner, 'exact Lua module', source.luaModule, 104);
  if (owner.workspaceId && wholeToken(candidate.raw, owner.workspaceId)) addOwnerMatch(matches, owner, 'exact workspace id', owner.workspaceId, 115);
  return matches;
}

function ownerAliasEvidence(owner: RuntimeOwnerRecord, candidate: RuntimeCandidateIncident): RuntimeAttributionEvidence[] {
  return owner.aliases.filter(alias => wholeToken(candidate.raw, alias)).map(alias => ({ ownerId: owner.ownerId, label: 'explicit alias', value: alias, strength: 'alias' as const, rank: 40 }));
}

function ownerDisplayEvidence(owner: RuntimeOwnerRecord, candidate: RuntimeCandidateIncident): RuntimeAttributionEvidence[] {
  return owner.displayName && containsDisplayName(candidate.raw, owner.displayName)
    ? [{ ownerId: owner.ownerId, label: 'display-name substring', value: owner.displayName, strength: 'display_name', rank: 10 }]
    : [];
}

/** Attribute one candidate; weak names can never produce confirmed_active. */
export function attributeRuntimeCandidate(index: RuntimeOwnershipIndex, candidate: RuntimeCandidateIncident): RuntimeAttribution {
  const uiFault = candidate.kind === 'ui_reload_fault';
  const physicalFolderRequired = uiFault || candidate.physicalLuaSource;
  const folder = candidate.source.extensionFolder;
  if (uiFault && !folder) {
    return { disposition: 'unknown', confidence: 0,
      reason: candidate.source.uiOwnershipConflict ? 'Lua frames name multiple extensions.' : 'No owning extension Lua frame was found.',
      evidence: [] };
  }
  const authoredEmitters = findAuthoredEmitterLocations(index, candidate);
  if (authoredEmitters.length) {
    if (candidate.kind === 'raw_engine_id_in_player_text' && new Set(authoredEmitters.map(loc => loc.ownerId)).size === 1) {
      return attributeAuthoredEmitter(index, [authoredEmitters[0]]);
    }
    return attributeAuthoredEmitter(index, authoredEmitters);
  }

  const exact = index.owners.map(owner => {
    if (!physicalFolderRequired) return { owner, evidence: exactOwnerEvidence(owner, candidate) };
    const evidence: RuntimeAttributionEvidence[] = [];
    if (folder && owner.exactDeployedFolders.includes(folder)) addOwnerMatch(evidence, owner, 'exact deployed extension folder', folder, 120);
    return { owner, evidence };
  }).filter(item => item.evidence.length);
  if (exact.length) {
    const ranked = exact.map(item => ({ ...item, rank: Math.max(...item.evidence.map(evidence => evidence.rank)) }));
    const highest = Math.max(...ranked.map(item => item.rank));
    const top = ranked.filter(item => item.rank === highest);
    const activeTop = top.filter(item => item.owner.active);
    const otherTop = top.filter(item => !item.owner.active);
    if (activeTop.length === 1 && otherTop.length === 0) {
      const item = activeTop[0];
      const labels = uniquePreservingOrder(item.evidence.filter(evidence => evidence.rank === highest).map(evidence => evidence.label));
      return {
        disposition: 'confirmed_active',
        confidence: highest >= 120 ? 0.99 : 0.96,
        reason: `${labels.join(' + ')} is an exact active-workspace match; weak aliases are not required.`,
        evidence: item.evidence,
        matchedOwnerId: item.owner.ownerId,
        matchedWorkspaceId: item.owner.workspaceId,
      };
    }
    if (activeTop.length === 0 && otherTop.length > 0) {
      const item = otherTop[0];
      return {
        disposition: 'excluded_other_mod',
        confidence: highest >= 120 ? 0.99 : 0.95,
        reason: `Exact evidence belongs to known other extension ${item.owner.workspaceId}; it is excluded from the active-mod incident set.`,
        evidence: item.evidence,
        matchedOwnerId: item.owner.ownerId,
        matchedWorkspaceId: item.owner.workspaceId,
      };
    }
    const evidence = top.flatMap(item => item.evidence);
    return {
      disposition: 'ambiguous',
      confidence: 0.45,
      reason: `Exact ownership evidence collides across ${top.map(item => item.owner.workspaceId).sort().join(', ')}; no active certainty is allowed.`,
      evidence,
    };
  }

  if (physicalFolderRequired) return { disposition: 'unknown', confidence: 0,
    reason: 'The extension named by the Lua source is outside the physical folder inventory.', evidence: [] };

  const aliases = index.owners.flatMap(owner => ownerAliasEvidence(owner, candidate));
  if (aliases.length) {
    const owners = uniqueSorted(aliases.map(item => item.ownerId));
    const first = index.owners.find(owner => owner.ownerId === owners[0]);
    return {
      disposition: 'ambiguous',
      confidence: 0.4,
      reason: `Explicit alias evidence is weak and cannot confirm ownership${owners.length > 1 ? '; aliases collide' : ''}.`,
      evidence: aliases,
      ...(first ? { matchedOwnerId: first.ownerId, matchedWorkspaceId: first.workspaceId } : {}),
    };
  }

  const display = index.owners.flatMap(owner => ownerDisplayEvidence(owner, candidate));
  if (display.length > 1) {
    return { disposition: 'ambiguous', confidence: 0.2, reason: 'Display-name substrings collide and are weak evidence only.', evidence: display };
  }
  if (display.length === 1) {
    return { disposition: 'unknown', confidence: 0.1, reason: 'Display-name substring is weak evidence and never confirms active ownership.', evidence: display };
  }
  return { disposition: 'unknown', confidence: 0, reason: 'No exact ownership evidence was found for this candidate failure.', evidence: [] };
}

function relativeFileForLookup(file: string): { folder?: string; relative: string } {
  const normalized = normalizeRuntimePath(file);
  const match = normalized.match(/(?:^|\/)extensions\/([^/]+)\/(.+)$/i);
  return match ? { folder: match[1], relative: match[2] } : { relative: normalized };
}

function ownerManifestText(owner: RuntimeOwnerRecord, file: string): string | undefined {
  const requested = normalizeRuntimePath(file);
  return owner.manifest.find(entry => {
    const owned = normalizeRuntimePath(entry.path);
    return requested === owned || requested.endsWith(`/${owned}`) || owned.endsWith(`/${requested}`);
  })?.text;
}

const AUTHORED_TAG_TOKEN_RE = /\[[A-Za-z][A-Za-z0-9_-]{2,}\]/g;
const AUTHORED_EMITTER_CALL_RE = /\b(?:log|print|printf|debug|trace|warn|info)\s*\(/i;

function authoredDiagnosticParts(candidate: RuntimeCandidateIncident): { tags: string[]; words: string[] } {
  const firstLine = candidate.lines[0] || candidate.raw.split(/\r?\n/, 1)[0] || '';
  const compact = compactMessage(firstLine);
  const tags = compact.match(AUTHORED_TAG_TOKEN_RE) || [];
  const body = compact.replace(/^(?:\s*\[[A-Za-z][A-Za-z0-9_-]{2,}\]\s*)+/, '').trim();
  const words = body.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
  return { tags: uniquePreservingOrder(tags), words: words.map(word => word.toLowerCase()) };
}

function containsWordSequence(text: string, words: string[]): boolean {
  if (words.length < 2) return false;
  const haystack = (text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || []).map(word => word.toLowerCase());
  for (let index = 0; index <= haystack.length - words.length; index++) {
    if (words.every((word, offset) => haystack[index + offset] === word)) return true;
  }
  return false;
}

function authoredEmitterLocationLabel(location: RuntimeAuthoredEmitterLocation): string {
  return `${location.file}:${location.line}`;
}

function findPlayerTextLeakLocations(index: RuntimeOwnershipIndex, candidate: RuntimeCandidateIncident): RuntimeAuthoredEmitterLocation[] {
  const leaks = candidate.rawEngineIdLeaks || [];
  if (!leaks.length) return [];
  const firstLine = candidate.lines[0] || candidate.raw.split(/\r?\n/, 1)[0] || '';
  const compact = compactMessage(firstLine);
  const tags = uniquePreservingOrder(compact.match(AUTHORED_TAG_TOKEN_RE) || []);
  const body = compact.replace(/^(?:\s*\[[A-Za-z][A-Za-z0-9_-]{2,}\]\s*)+/, '').trim();

  const leftGroups: string[][] = [];
  const rightGroups: string[][] = [];
  for (const leak of leaks) {
    const leftWords = (body.slice(0, leak.offset).match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) || []).map(w => w.toLowerCase());
    const rightWords = (body.slice(leak.offset + leak.id.length).match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) || []).map(w => w.toLowerCase());
    for (let len = Math.min(6, leftWords.length); len >= 2; len--) leftGroups.push(leftWords.slice(-len));
    for (let len = Math.min(10, rightWords.length); len >= 2; len--) rightGroups.push(rightWords.slice(0, len));
  }
  if (!leftGroups.length && !rightGroups.length) return [];

  const lineTokens = (line: string) => (line.match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) || []).map(w => w.toLowerCase());
  const hasSeq = (haystack: string[], seq: string[]): boolean => {
    if (seq.length < 2 || haystack.length < seq.length) return false;
    for (let i = 0; i <= haystack.length - seq.length; i++) {
      if (seq.every((w, off) => haystack[i + off] === w)) return true;
    }
    return false;
  };

  type Scored = { loc: RuntimeAuthoredEmitterLocation; score: number };
  const scored: Scored[] = [];
  const directFolder = normalizeIdentity(candidate.source.extensionFolder || '');
  for (const owner of index.owners) {
    if (directFolder && !owner.deployedFolders.some(folder => normalizeIdentity(folder) === directFolder || owner.contentIds.some(id => normalizeIdentity(id) === directFolder))) {
      continue;
    }
    for (const manifest of owner.manifest) {
      const isLua = /\.(?:lua|xpl)$/i.test(manifest.path);
      const isXml = /\.xml$/i.test(manifest.path) && !/(^|\/)content\.xml$/i.test(manifest.path);
      if (!isLua && !isXml) continue;
      const sourceLines = manifest.text.split(/\r?\n/);
      const tagSources = tags.length === 0
        ? []
        : sourceLines
          .map((source, lineIndex) => ({ source, line: lineIndex + 1 }))
          .filter(item => tags.every(tag => item.source.toLowerCase().includes(tag.toLowerCase())))
          .slice(0, MAX_AUTHORED_EMITTER_SUPPORT)
          .map(item => ({ file: manifest.path, line: item.line, source: clipText(item.source.trim(), RUNTIME_DEBUGGER_LIMITS.maxLineChars) }));
      const tagBonus = tags.length > 0 && tagSources.length > 0 ? 4 : 0;

      for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
        const sourceLine = sourceLines[lineIndex];
        if (isLua && /^\s*--/.test(sourceLine)) continue;
        if (isXml && /^\s*<!--/.test(sourceLine)) continue;
        if (isLua && !sourceLine.includes('..') && !AUTHORED_EMITTER_CALL_RE.test(sourceLine) && !/\bDebugError\s*\(/.test(sourceLine)) continue;
        if (isXml && !sourceLine.includes('+') && !/<(?:debug_text|write_to_logbook|show_notification|show_help|write_incoming_message)\b/i.test(sourceLine)) continue;
        const tokens = lineTokens(sourceLine);
        let bestLeft = 0;
        let bestRight = 0;
        for (const seq of leftGroups) {
          if (hasSeq(tokens, seq)) bestLeft = Math.max(bestLeft, seq.length);
        }
        for (const seq of rightGroups) {
          if (hasSeq(tokens, seq)) bestRight = Math.max(bestRight, seq.length);
        }
        const matchScore = bestLeft + bestRight;
        if (matchScore < 2) continue;
        scored.push({
          score: matchScore + tagBonus,
          loc: {
            ownerId: owner.ownerId,
            workspaceId: owner.workspaceId,
            file: manifest.path,
            line: lineIndex + 1,
            source: clipText(sourceLine.trim(), RUNTIME_DEBUGGER_LIMITS.maxLineChars),
            supportingEvidence: tagSources.filter(item => item.line !== lineIndex + 1),
          },
        });
      }
    }
  }
  if (!scored.length) return [];
  const bestScore = Math.max(...scored.map(item => item.score));
  const best = scored.filter(item => item.score === bestScore).map(item => item.loc);
  const deduped: RuntimeAuthoredEmitterLocation[] = [];
  for (const loc of best) {
    if (!deduped.some(existing => existing.ownerId === loc.ownerId && existing.file === loc.file && existing.line === loc.line)) {
      deduped.push(loc);
    }
  }
  return deduped
    .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId) || left.file.localeCompare(right.file) || left.line - right.line)
    .slice(0, MAX_AUTHORED_EMITTERS);
}

function findAuthoredEmitterLocations(index: RuntimeOwnershipIndex, candidate: RuntimeCandidateIncident): RuntimeAuthoredEmitterLocation[] {
  if (candidate.kind === 'raw_engine_id_in_player_text') return findPlayerTextLeakLocations(index, candidate);
  if (candidate.kind !== 'authored_diagnostic') return [];
  const { tags, words } = authoredDiagnosticParts(candidate);
  if (words.length < 2) return [];
  const locations: RuntimeAuthoredEmitterLocation[] = [];
  for (const owner of index.owners) {
    for (const manifest of owner.manifest) {
      if (!/\.(?:lua|xpl)$/i.test(manifest.path)) continue;
      const sourceLines = manifest.text.split(/\r?\n/);
      const tagSources = tags.length === 0
        ? []
        : sourceLines
          .map((source, lineIndex) => ({ source, line: lineIndex + 1 }))
          .filter(item => tags.every(tag => item.source.toLowerCase().includes(tag.toLowerCase())))
          .slice(0, MAX_AUTHORED_EMITTER_SUPPORT)
          .map(item => ({ file: manifest.path, line: item.line, source: clipText(item.source.trim(), RUNTIME_DEBUGGER_LIMITS.maxLineChars) }));
      for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
        const sourceLine = sourceLines[lineIndex];
        if (/^\s*--/.test(sourceLine) || !AUTHORED_EMITTER_CALL_RE.test(sourceLine) || !containsWordSequence(sourceLine, words)) continue;
        const line = lineIndex + 1;
        if (locations.some(location => location.ownerId === owner.ownerId && location.file === manifest.path && location.line === line)) continue;
        locations.push({
          ownerId: owner.ownerId,
          workspaceId: owner.workspaceId,
          file: manifest.path,
          line,
          source: clipText(sourceLine.trim(), RUNTIME_DEBUGGER_LIMITS.maxLineChars),
          supportingEvidence: tagSources.filter(item => item.line !== line),
        });
      }
    }
  }
  return locations
    .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId) || left.file.localeCompare(right.file) || left.line - right.line)
    .slice(0, MAX_AUTHORED_EMITTERS);
}

function authoredEmitterEvidence(locations: RuntimeAuthoredEmitterLocation[]): RuntimeAttributionEvidence[] {
  return locations.flatMap(location => [
    {
      ownerId: location.ownerId,
      label: 'authored emitter',
      value: authoredEmitterLocationLabel(location),
      strength: 'exact' as const,
      rank: 150,
    },
    {
      ownerId: location.ownerId,
      label: 'authored emitter source',
      value: location.source,
      strength: 'exact' as const,
      rank: 150,
    },
    ...location.supportingEvidence.map(support => ({
      ownerId: location.ownerId,
      label: 'authored tag helper',
      value: `${support.file}:${support.line}: ${support.source}`,
      strength: 'exact' as const,
      rank: 145,
    })),
  ]).slice(0, MAX_EVIDENCE);
}

function attributeAuthoredEmitter(index: RuntimeOwnershipIndex, locations: RuntimeAuthoredEmitterLocation[]): RuntimeAttribution {
  const evidence = authoredEmitterEvidence(locations);
  if (locations.length === 1) {
    const location = locations[0];
    const owner = index.owners.find(item => item.ownerId === location.ownerId);
    if (owner) {
      return {
        disposition: owner.active ? 'confirmed_active' : 'excluded_other_mod',
        confidence: 0.99,
        reason: owner.active
          ? `Unique authored emitter ${authoredEmitterLocationLabel(location)} is an exact active-workspace manifest match.`
          : `Unique authored emitter ${authoredEmitterLocationLabel(location)} belongs to known other extension ${owner.workspaceId}; it is excluded from the active-mod incident set.`,
        evidence,
        matchedOwnerId: owner.ownerId,
        matchedWorkspaceId: owner.workspaceId,
        authoredEmitter: location,
        authoredEmitterCandidates: locations,
      };
    }
  }
  const labels = locations.map(authoredEmitterLocationLabel).join(', ');
  return {
    disposition: 'ambiguous',
    confidence: 0.45,
    reason: `Multiple authored emitters matched; ownership remains ambiguous across bounded candidate locations: ${labels}.`,
    evidence,
    authoredEmitterCandidates: locations,
  };
}

function lineStartOffset(text: string, line: number, column?: number): number | undefined {
  if (!Number.isInteger(line) || line < 1) return undefined;
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf('\n', offset);
    if (next < 0) return undefined;
    offset = next + 1;
  }
  if (column && column > 1) return Math.min(text.length, offset + column - 1);
  const lineEnd = text.indexOf('\n', offset);
  const end = lineEnd < 0 ? text.length : lineEnd;
  const firstNonWhitespace = text.slice(offset, end).search(/\S/);
  return firstNonWhitespace < 0 ? offset : offset + firstNonWhitespace;
}

function sourceSpanMatches(span: RuntimeOwnedNodeSpan, relativeFile: string): boolean {
  const requested = normalizeRuntimePath(relativeFile);
  const owned = normalizeRuntimePath(span.file);
  return requested === owned || requested.endsWith(`/${owned}`) || owned.endsWith(`/${requested}`);
}

/** Map a file/line to the smallest/deepest modeled node, with honest fallback. */
export function mapRuntimeFileLineToNode(index: RuntimeOwnershipIndex, location: {
  file: string;
  line: number;
  column?: number;
  ownerId?: string;
  workspaceId?: string;
}): RuntimeSourceMapping {
  const fileInfo = relativeFileForLookup(location.file);
  const relative = fileInfo.relative;
  const constrainedOwners = index.owners.filter(owner =>
    (!location.ownerId || owner.ownerId === location.ownerId)
    && (!location.workspaceId || owner.workspaceId === location.workspaceId));
  const owners = fileInfo.folder
    ? constrainedOwners.filter(owner => owner.deployedFolders.some(folder => normalizeIdentity(folder) === normalizeIdentity(fileInfo.folder!) || owner.contentIds.some(id => normalizeIdentity(id) === normalizeIdentity(fileInfo.folder!))))
    : constrainedOwners;
  const spans = owners.flatMap(owner => owner.nodeSpans.filter(span => span.modeled && sourceSpanMatches(span, relative)));
  const textOwner = owners.find(owner => ownerManifestText(owner, relative) !== undefined);
  const text = textOwner ? ownerManifestText(textOwner, relative) : undefined;
  const offset = text === undefined ? undefined : lineStartOffset(text, location.line, location.column);
  if (offset !== undefined) {
    const containing = spans.filter(span => span.start <= offset && offset < span.end).sort((left, right) => {
      const size = (left.end - left.start) - (right.end - right.start);
      if (size !== 0) return size;
      const depth = (right.semanticPath || '').split('/').length - (left.semanticPath || '').split('/').length;
      return depth || left.nodeId.localeCompare(right.nodeId);
    });
    const deepest = containing[0];
    if (deepest) {
      return {
        kind: 'node',
        file: relative,
        line: location.line,
        offset,
        nodeId: deepest.nodeId,
        nodeLabel: deepest.label,
        xmlTag: deepest.xmlTag,
        ...(deepest.semanticPath ? { semanticPath: deepest.semanticPath } : {}),
        reason: 'smallest/deepest containing modeled MDNode source span',
      };
    }
  }
  if (relative && Number.isInteger(location.line) && location.line > 0) {
    return {
      kind: 'file_line',
      file: relative,
      line: location.line,
      ...(offset !== undefined ? { offset } : {}),
      reason: offset === undefined ? 'manifest text unavailable or line is outside its text; exact file/line retained' : 'no containing modeled source span; exact file/line retained',
    };
  }
  return { kind: 'unmapped', ...(relative ? { file: relative } : {}), ...(location.line ? { line: location.line } : {}), reason: 'source evidence did not contain a usable file and line' };
}

function inferFileFromIdentity(index: RuntimeOwnershipIndex, candidate: RuntimeCandidateIncident & { attribution?: RuntimeAttribution }): string | undefined {
  if (candidate.source.file) return candidate.source.file;
  const owners = index.owners.filter(owner => candidate.attribution?.matchedOwnerId ? owner.ownerId === candidate.attribution.matchedOwnerId : true);
  if (candidate.source.mdScript) {
    const matches = owners.flatMap(owner => owner.mdScripts.filter(script => normalizeIdentity(script.name) === normalizeIdentity(candidate.source.mdScript!)).map(script => script.path)).filter(Boolean) as string[];
    if (matches.length === 1) return matches[0];
  }
  if (candidate.source.aiScript) {
    const matches = owners.flatMap(owner => owner.aiScripts.filter(script => normalizeIdentity(script.id || script.name || '') === normalizeIdentity(candidate.source.aiScript!)).map(script => script.path)).filter(Boolean) as string[];
    if (matches.length === 1) return matches[0];
  }
  if (candidate.source.luaModule) {
    const matches = owners.flatMap(owner => owner.luaFiles.filter(file => (file.modules || []).some(module => normalizeIdentity(module) === normalizeIdentity(candidate.source.luaModule!))).map(file => file.path));
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

export function mapRuntimeCandidateToSource(index: RuntimeOwnershipIndex, candidate: RuntimeCandidateIncident & { attribution?: RuntimeAttribution }): RuntimeSourceMapping {
  if (candidate.kind === 'ui_reload_fault' && (!candidate.source.file || !candidate.source.line
    || !candidate.attribution?.matchedOwnerId
    || !['confirmed_active', 'excluded_other_mod'].includes(candidate.attribution.disposition))) {
    return { kind: 'unmapped', reason: 'No exact owned Lua frame location was established for this UI fault.' };
  }
  const authoredEmitter = candidate.attribution?.authoredEmitter;
  const isEmitterMappedKind = candidate.kind === 'authored_diagnostic' || candidate.kind === 'raw_engine_id_in_player_text';
  if (isEmitterMappedKind && authoredEmitter) {
    return mapRuntimeFileLineToNode(index, {
      file: authoredEmitter.file,
      line: authoredEmitter.line,
      ownerId: authoredEmitter.ownerId,
      workspaceId: authoredEmitter.workspaceId,
    });
  }
  const authoredEmitterCandidates = candidate.attribution?.authoredEmitterCandidates;
  if (isEmitterMappedKind && authoredEmitterCandidates?.length) {
    return {
      kind: 'unmapped',
      candidateLocations: authoredEmitterCandidates,
      reason: 'multiple authored emitters matched; exact source navigation is withheld until ownership is unambiguous',
    };
  }
  if (isEmitterMappedKind && !candidate.source.file) {
    return { kind: 'unmapped', reason: 'no exact authored emitter was resolved from the owner manifests' };
  }
  const file = inferFileFromIdentity(index, candidate);
  const line = candidate.source.line || candidate.source.stackFrames.find(frame => frame.line)?.line;
  if (!file || !line) return { kind: 'unmapped', ...(file ? { file } : {}), ...(line ? { line } : {}), reason: 'candidate has no exact source file and line' };
  const attribution = candidate.attribution;
  if (!attribution || (attribution.disposition !== 'confirmed_active' && attribution.disposition !== 'excluded_other_mod') || !attribution.matchedOwnerId) {
    return { kind: 'file_line', file: normalizeRuntimePath(file), line, reason: 'ownership is ambiguous or unknown; node navigation withheld' };
  }
  return mapRuntimeFileLineToNode(index, {
    file,
    line,
    ownerId: attribution.matchedOwnerId,
    workspaceId: attribution.matchedWorkspaceId,
  });
}

export function explainRuntimeCandidate(candidate: RuntimeCandidateIncident, attribution?: RuntimeAttribution): RuntimeExplanation {
  const ruleLabel = candidate.engineSignature;
  let cause: string;
  let impact: string;
  let nextAction: string;
  let evidenceLabel: string;
  if (candidate.kind === 'raw_engine_id_in_player_text') {
    const authoredEmitter = attribution?.authoredEmitter;
    const authoredEmitterCandidates = attribution?.authoredEmitterCandidates || [];
    const leakSummary = (candidate.rawEngineIdLeaks || [])
      .map(leak => `${leak.domain} "${leak.id}"${leak.displayName ? ` (${leak.displayName})` : ''}`)
      .join(', ');
    cause = `Player-visible or mod-logged prose contains bare canonical X4 engine ID(s)${leakSummary ? `: ${leakSummary}` : ''}.`;
    impact = 'Players see raw internal faction or ware identifiers instead of localized display names in UI panels, notifications, comms, or logbook entries.';
    nextAction = authoredEmitter
      ? `Inspect ${authoredEmitterLocationLabel(authoredEmitter)} and resolve the localized display name via GetFactionData(id, "name") / GetWareData(id, "name") in Lua or .knownname / .name in MD.`
      : authoredEmitterCandidates.length
        ? `Inspect the matching prose builders (${authoredEmitterCandidates.map(authoredEmitterLocationLabel).join(', ')}) and replace raw IDs with localized display-name lookups.`
        : candidate.source.file
          ? `Inspect ${candidate.source.file}${candidate.source.line ? `:${candidate.source.line}` : ''} and replace raw IDs with localized display-name lookups.`
          : 'Inspect the prose builder that emitted this line and replace raw IDs with localized display-name lookups.';
    evidenceLabel = authoredEmitter
      ? `raw engine ID prose emitter at ${authoredEmitterLocationLabel(authoredEmitter)}`
      : 'raw engine ID in prose';
  } else if (candidate.kind === 'authored_diagnostic') {
    const authoredEmitter = attribution?.authoredEmitter;
    const authoredEmitterCandidates = attribution?.authoredEmitterCandidates || [];
    cause = 'The mod emitted authored telemetry/activity; no engine fault is indicated by this line.';
    impact = authoredEmitterCandidates.length > 1
      ? 'This is mod-emitted activity; no engine fault is indicated, but its source matches multiple bounded emitters and remains ambiguous.'
      : authoredEmitter
        ? 'This is mod-emitted activity; no engine fault is indicated by the governed parser.'
        : 'This is mod-emitted activity; no engine fault is indicated and no exact emitter was resolved.';
    nextAction = authoredEmitter
      ? `If this activity is unexpected, inspect the exact emitter at ${authoredEmitterLocationLabel(authoredEmitter)}.`
      : authoredEmitterCandidates.length
        ? `If this activity is unexpected, inspect one of these candidate emitters: ${authoredEmitterCandidates.map(authoredEmitterLocationLabel).join(', ')}.`
        : 'If this activity is unexpected, inspect the mod-authored logging source; no exact emitter was found.';
    evidenceLabel = authoredEmitter
      ? `authored emitter at ${authoredEmitterLocationLabel(authoredEmitter)}`
      : authoredEmitterCandidates.length
        ? 'ambiguous authored emitter candidates'
        : 'authored diagnostic marker';
  } else if (candidate.kind === 'file_io') {
    cause = 'X4 reported file, signature, or extension-load evidence.';
    impact = 'The file may not have loaded or may be unavailable to the engine; runtime execution is not proven by this line alone.';
    nextAction = 'Verify the exact deployed path and current segment, then inspect a subsequent engine/runtime fault if present.';
    evidenceLabel = 'FileIO/load evidence';
  } else if (candidate.isEngineFailure) {
    cause = candidate.engineSignature ? `X4 reported an engine fault matching the ${candidate.engineSignature} rule.` : 'X4 reported a runtime failure with source context.';
    impact = 'The referenced MD, AI, Lua, or extension path may have failed during load or execution.';
    nextAction = 'Inspect the mapped file/line or deepest modeled node, correct the bounded fault, then re-run the current segment.';
    evidenceLabel = candidate.source.file ? `engine failure at ${candidate.source.file}${candidate.source.line ? `:${candidate.source.line}` : ''}` : 'engine failure evidence';
  } else {
    cause = 'The line looks failure-like, but no governed engine or authored-diagnostic rule identified its cause.';
    impact = 'The impact is unknown; this candidate must remain visible rather than becoming a false clean result.';
    nextAction = 'Inspect the complete multiline evidence and add a deterministic rule only after the engine log shape is known.';
    evidenceLabel = 'unsupported candidate failure';
  }
  const attributionLabel = attribution?.disposition === 'confirmed_active'
    ? 'confirmed active ownership'
    : attribution?.disposition === 'excluded_other_mod'
      ? 'known other-mod evidence'
      : attribution?.disposition === 'ambiguous'
        ? 'ambiguous ownership'
        : 'unknown ownership';
  const summary = `${cause} Impact: ${impact} Next action: ${nextAction} Evidence: ${evidenceLabel}; ${attributionLabel}.`;
  return { cause, impact, nextAction, evidenceLabel, ...(ruleLabel ? { ruleLabel } : {}), summary };
}

function dedupText(candidate: RuntimeCandidateIncident): string {
  return compactMessage(candidate.lines[0] || candidate.raw).toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateDedupKey(candidate: RuntimeAnalyzedCandidate | RuntimeCandidateIncident): string {
  const attribution = 'attribution' in candidate ? candidate.attribution : undefined;
  return [
    candidate.kind,
    candidate.engineSignature || '',
    normalizeRuntimePath(candidate.source.file || ''),
    candidate.source.line || '',
    normalizeIdentity(candidate.source.mdScript || ''),
    normalizeIdentity(candidate.source.aiScript || ''),
    normalizeIdentity(candidate.source.luaModule || ''),
    attribution?.disposition || 'unknown',
    attribution?.matchedWorkspaceId || '',
    dedupText(candidate),
  ].join('|');
}

/** Collapse equivalent candidates while retaining bounded first/last evidence. */
export function deduplicateRuntimeIncidents(candidates: Array<RuntimeAnalyzedCandidate | RuntimeCandidateIncident>, sampleLimit = MAX_SAMPLES): RuntimeIncident[] {
  const groups = new Map<string, RuntimeIncident>();
  const limit = Math.max(1, Math.min(MAX_SAMPLES, Math.floor(sampleLimit || MAX_SAMPLES)));
  for (const candidate of candidates) {
    const key = candidateDedupKey(candidate);
    const analyzed = 'attribution' in candidate ? candidate : undefined;
    const attribution = analyzed?.attribution || { disposition: 'unknown' as const, confidence: 0, reason: 'candidate was not attributed', evidence: [] };
    const mapping = analyzed?.mapping || { kind: 'unmapped' as const, reason: 'candidate was not mapped' };
    const explanation = analyzed?.explanation || explainRuntimeCandidate(candidate, attribution);
    const existing = groups.get(key);
    const evidence = candidate.evidence.slice(0, MAX_EVIDENCE).map(item => clipText(`${item.label}: ${item.value}`, RUNTIME_DEBUGGER_LIMITS.maxEvidenceChars));
    if (!existing) {
      groups.set(key, {
        key: `incident-${hashRuntimeText(key)}`,
        count: 1,
        firstLine: candidate.startLine,
        lastLine: candidate.endLine,
        ...(candidate.timestamp ? { firstTimestamp: candidate.timestamp } : {}),
        ...(candidate.lastTimestamp ? { lastTimestamp: candidate.lastTimestamp } : {}),
        candidateIds: [candidate.id],
        omittedCandidateIds: 0,
        attribution,
        mapping,
        explanation,
        evidence: uniquePreservingOrder(evidence).slice(0, MAX_EVIDENCE),
        samples: [{ firstLine: candidate.startLine, lastLine: candidate.endLine, ...(candidate.timestamp ? { timestamp: candidate.timestamp } : {}), text: clipText(candidate.raw, RUNTIME_DEBUGGER_LIMITS.maxGroupChars) }],
      });
      continue;
    }
    existing.count++;
    existing.lastLine = Math.max(existing.lastLine, candidate.endLine);
    existing.lastTimestamp = candidate.lastTimestamp || candidate.timestamp || existing.lastTimestamp;
    if (existing.candidateIds.length < MAX_CANDIDATE_IDS) existing.candidateIds.push(candidate.id);
    else existing.omittedCandidateIds++;
    existing.evidence = uniquePreservingOrder([...existing.evidence, ...evidence]).slice(0, MAX_EVIDENCE);
    if (existing.samples.length < limit) existing.samples.push({ firstLine: candidate.startLine, lastLine: candidate.endLine, ...(candidate.timestamp ? { timestamp: candidate.timestamp } : {}), text: clipText(candidate.raw, RUNTIME_DEBUGGER_LIMITS.maxGroupChars) });
  }
  return Array.from(groups.values()).sort((left, right) => left.firstLine - right.firstLine || left.key.localeCompare(right.key));
}

export function buildRuntimeCoverage(candidates: Array<RuntimeAnalyzedCandidate | RuntimeCandidateIncident>): RuntimeCoverage {
  const dispositionCounts: Record<RuntimeAttributionDisposition, number> = {
    confirmed_active: 0,
    ambiguous: 0,
    excluded_other_mod: 0,
    unknown: 0,
  };
  for (const candidate of candidates) {
    const candidateDisposition = 'attribution' in candidate ? candidate.attribution?.disposition : undefined;
    const disposition: RuntimeAttributionDisposition = candidateDisposition === 'confirmed_active'
      || candidateDisposition === 'ambiguous'
      || candidateDisposition === 'excluded_other_mod'
      || candidateDisposition === 'unknown'
      ? candidateDisposition
      : 'unknown';
    dispositionCounts[disposition]++;
  }
  const recognized = candidates.filter(candidate => candidate.recognized).length;
  const explicitUnknown = candidates.filter(candidate => candidate.explicitUnknown).length;
  const recognizedOrExplicitUnknown = candidates.filter(candidate => candidate.recognized || candidate.explicitUnknown).length;
  const total = candidates.length;
  return {
    candidates: total,
    recognized,
    explicitUnknown,
    silentlyDropped: Math.max(0, total - recognizedOrExplicitUnknown),
    recognizedOrExplicitUnknown,
    recognizedOrExplicitUnknownRatio: total === 0 ? 1 : recognizedOrExplicitUnknown / total,
    dispositionCounts,
    dispositionSum: Object.values(dispositionCounts).reduce((sum, value) => sum + value, 0),
  };
}

function expectedStepMatches(step: RuntimeExpectedStep, evidenceText: string, candidates: RuntimeCandidateIncident[]): string[] {
  const evidence: string[] = [];
  const needles = uniquePreservingOrder([step.marker || '', ...(step.markers || []), ...(step.evidence || [])]).filter(Boolean);
  for (const needle of needles) if (evidenceText.toLowerCase().includes(needle.toLowerCase())) evidence.push(needle);
  const candidateMatch = candidates.find(candidate => {
    const source = candidate.source;
    if (step.file && normalizeRuntimePath(step.file) !== normalizeRuntimePath(source.file || '')) return false;
    if (step.line && step.line !== source.line) return false;
    if (step.mdScript && normalizeIdentity(step.mdScript) !== normalizeIdentity(source.mdScript || '')) return false;
    if (step.cue && normalizeIdentity(step.cue) !== normalizeIdentity(source.cue || '')) return false;
    if (step.aiScript && normalizeIdentity(step.aiScript) !== normalizeIdentity(source.aiScript || '')) return false;
    if (step.luaModule && normalizeIdentity(step.luaModule) !== normalizeIdentity(source.luaModule || '')) return false;
    return Boolean(step.file || step.line || step.mdScript || step.cue || step.aiScript || step.luaModule);
  });
  if (candidateMatch) evidence.push(candidateMatch.message);
  return uniquePreservingOrder(evidence).slice(0, MAX_EVIDENCE);
}

/** Evaluate declared steps against only the supplied current-segment evidence. */
export function evaluateExpectedRuntimeSteps(steps: RuntimeExpectedStep[], currentSegment?: RuntimeCurrentSegmentEvidence): RuntimeExpectedStepResult[] {
  return (steps || []).map(step => {
    const label = step.label || step.id;
    if (!currentSegment || currentSegment.available !== true) return { id: step.id, label, truth: 'unavailable', observed: false, success: false, evidence: [] };
    const lines = Array.isArray(currentSegment.lines) ? currentSegment.lines : [];
    const candidates = currentSegment.candidates || [];
    const evidence = expectedStepMatches(step, lines.join('\n'), candidates);
    const observed = evidence.length > 0;
    return { id: step.id, label, truth: observed ? 'observed' : 'missing', observed, success: observed, evidence };
  });
}

export function analyzeRuntimeDebugger(input: RuntimeDebuggerAnalysisInput): RuntimeDebuggerAnalysis {
  const ownership = input.ownership || buildRuntimeOwnershipIndex({
    active: input.activeWorkspace || input.active || {},
    otherExtensions: input.otherExtensions || [],
  });
  const parsed = parseRuntimeCandidates(input.logText, input.referenceVocabulary ? { referenceVocabulary: input.referenceVocabulary } : undefined);
  const candidates = parsed.map(candidate => {
    const attribution = attributeRuntimeCandidate(ownership, candidate);
    const mapping = mapRuntimeCandidateToSource(ownership, { ...candidate, attribution });
    const explanation = explainRuntimeCandidate(candidate, attribution);
    return { ...candidate, attribution, mapping, explanation };
  });
  return {
    ownership,
    candidates,
    incidents: deduplicateRuntimeIncidents(candidates, input.sampleLimit),
    coverage: buildRuntimeCoverage(candidates),
    expectedSteps: evaluateExpectedRuntimeSteps(input.expectedSteps || [], input.currentSegment),
  };
}

export const analyzeRuntimeLog = analyzeRuntimeDebugger;
export const mapFileLineToDeepestNode = mapRuntimeFileLineToNode;
export const evaluateExpectedSteps = evaluateExpectedRuntimeSteps;
