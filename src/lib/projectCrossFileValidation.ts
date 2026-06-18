/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P5 - project-level cross-file validation.
 *
 * The P0 project model can already answer "does this signal_cue resolve across
 * files?" This layer adds the next contract: MD <-> Lua event wiring and
 * content.xml dependency diagnostics over the same ExtensionProject envelope.
 */

import {
  addFile,
  buildContentXml,
  classifyPath,
  createProject,
  indexCueReferences,
  validateProjectStructure,
  type ExtensionProject,
} from './extensionProject';
import { parseModManifest, type ModDependency, type ModManifest } from './modDependencyGraph';

export type ProjectCrossFileFindingCode =
  | 'project.structure'
  | 'cue.unresolved'
  | 'md_lua.missing_register'
  | 'lua_md.missing_listener'
  | 'dep.missing_content_xml'
  | 'dep.duplicate'
  | 'dep.self';

export interface ProjectCrossFileFinding {
  code: ProjectCrossFileFindingCode;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  event?: string;
  dependencyId?: string;
  detail: string;
}

export interface ProjectEventRef {
  event: string;
  file: string;
}

export interface ProjectUiEventRef {
  namespace: string;
  control: string;
  event: string;
  file: string;
}

export interface ProjectCrossFileValidationResult {
  ok: boolean;
  summary: {
    files: number;
    findings: number;
    errors: number;
    structuralErrors: number;
    unresolvedCueRefs: number;
    mdLuaMissingRegisters: number;
    luaMdMissingListeners: number;
    dependencies: number;
  };
  findings: ProjectCrossFileFinding[];
  cueIndex: ReturnType<typeof indexCueReferences>;
  mdLua: {
    raised: ProjectEventRef[];
    registered: ProjectEventRef[];
    emitted: ProjectUiEventRef[];
    listened: ProjectUiEventRef[];
    missingRegisters: ProjectEventRef[];
    missingListeners: ProjectUiEventRef[];
  };
  deps: {
    manifest: ModManifest | null;
    dependencies: ModDependency[];
  };
}

function normPath(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function stripMdLiteral(value: string | undefined): string {
  const raw = String(value || '').trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseAttr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
}

function parseMdRaisedLuaEvents(content: string, file: string): ProjectEventRef[] {
  const out: ProjectEventRef[] = [];
  const re = /<raise_lua_event\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) {
    const event = stripMdLiteral(parseAttr(m[0], 'name'));
    if (event) out.push({ event, file });
  }
  return out;
}

function parseMdUiListeners(content: string, file: string): ProjectUiEventRef[] {
  const out: ProjectUiEventRef[] = [];
  const re = /<event_ui_triggered\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) {
    const namespace = stripMdLiteral(parseAttr(m[0], 'screen'));
    const control = stripMdLiteral(parseAttr(m[0], 'control'));
    if (namespace && control) out.push({ namespace, control, event: `${namespace}.${control}`, file });
  }
  return out;
}

function parseLuaLocalStrings(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  const re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) vars.set(m[1], m[2]);
  return vars;
}

function parseLuaRegisteredEvents(content: string, file: string): ProjectEventRef[] {
  const out: ProjectEventRef[] = [];
  const re = /\bRegisterEvent\s*\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) out.push({ event: m[1], file });
  return out;
}

function parseLuaUiEmits(content: string, file: string): ProjectUiEventRef[] {
  const out: ProjectUiEventRef[] = [];
  const vars = parseLuaLocalStrings(content);
  const arg = `(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))`;
  const re = new RegExp(`\\bAddUITriggeredEvent\\s*\\(\\s*${arg}\\s*,\\s*${arg}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) {
    const namespace = m[1] || m[2] || vars.get(m[3] || '') || '';
    const control = m[4] || m[5] || vars.get(m[6] || '') || '';
    if (namespace && control) out.push({ namespace, control, event: `${namespace}.${control}`, file });
  }
  return out;
}

function findContentManifest(project: ExtensionProject): ModManifest | null {
  const content = (project.files || []).find(f => normPath(f.path).toLowerCase() === 'content.xml');
  return content ? parseModManifest(project.id || 'project', content.content || '') : null;
}

export function validateProjectCrossFile(project: ExtensionProject): ProjectCrossFileValidationResult {
  const files = Array.isArray(project?.files) ? project.files : [];
  const structure = validateProjectStructure(project);
  const cueIndex = indexCueReferences(project);
  const findings: ProjectCrossFileFinding[] = [];

  for (const issue of structure) {
    findings.push({
      code: 'project.structure',
      severity: issue.severity,
      file: issue.path,
      detail: issue.detail,
    });
  }
  for (const ref of cueIndex.unresolved) {
    findings.push({
      code: 'cue.unresolved',
      severity: 'error',
      file: ref.file,
      detail: `Unresolved cue reference "${ref.ref}".`,
    });
  }

  const mdFiles = files.filter(f => f.kind === 'md' || classifyPath(f.path) === 'md');
  const luaFiles = files.filter(f => f.kind === 'lua' || f.kind === 'ui' || classifyPath(f.path) === 'lua');
  const raised = mdFiles.flatMap(f => parseMdRaisedLuaEvents(f.content || '', f.path));
  const listened = mdFiles.flatMap(f => parseMdUiListeners(f.content || '', f.path));
  const registered = luaFiles.flatMap(f => parseLuaRegisteredEvents(f.content || '', f.path));
  const emitted = luaFiles.flatMap(f => parseLuaUiEmits(f.content || '', f.path));

  const registeredEvents = new Set(registered.map(r => r.event));
  const listenedEvents = new Set(listened.map(r => r.event));
  const missingRegisters = raised.filter(r => !registeredEvents.has(r.event));
  const missingListeners = emitted.filter(r => !listenedEvents.has(r.event));

  for (const event of missingRegisters) {
    findings.push({
      code: 'md_lua.missing_register',
      severity: 'error',
      file: event.file,
      event: event.event,
      detail: `MD raises Lua event "${event.event}" but no project Lua file registers it.`,
    });
  }
  for (const event of missingListeners) {
    findings.push({
      code: 'lua_md.missing_listener',
      severity: 'error',
      file: event.file,
      event: event.event,
      detail: `Lua emits UI event "${event.event}" but no project MD file listens for it.`,
    });
  }

  const manifest = findContentManifest(project);
  if (!manifest) {
    findings.push({
      code: 'dep.missing_content_xml',
      severity: 'error',
      file: 'content.xml',
      detail: 'No parseable content.xml manifest is present.',
    });
  } else {
    const seen = new Set<string>();
    for (const dep of manifest.deps) {
      const key = dep.id.toLowerCase();
      if (key === manifest.id.toLowerCase()) {
        findings.push({
          code: 'dep.self',
          severity: 'error',
          file: 'content.xml',
          dependencyId: dep.id,
          detail: `content.xml declares a dependency on itself (${dep.id}).`,
        });
      }
      if (seen.has(key)) {
        findings.push({
          code: 'dep.duplicate',
          severity: 'warning',
          file: 'content.xml',
          dependencyId: dep.id,
          detail: `content.xml declares dependency "${dep.id}" more than once.`,
        });
      }
      seen.add(key);
    }
  }

  const errors = findings.filter(f => f.severity === 'error').length;
  return {
    ok: errors === 0,
    summary: {
      files: files.length,
      findings: findings.length,
      errors,
      structuralErrors: structure.filter(i => i.severity === 'error').length,
      unresolvedCueRefs: cueIndex.unresolved.length,
      mdLuaMissingRegisters: missingRegisters.length,
      luaMdMissingListeners: missingListeners.length,
      dependencies: manifest?.deps.length || 0,
    },
    findings,
    cueIndex,
    mdLua: { raised, registered, emitted, listened, missingRegisters, missingListeners },
    deps: { manifest, dependencies: manifest?.deps || [] },
  };
}

function fixtureProject(): ExtensionProject {
  let project = createProject('ai_influence', 'AI Influence');
  project = addFile(project, {
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({
      id: 'ai_influence',
      name: 'AI Influence',
      deps: [{ id: 'djfhe_http', optional: true }],
    }),
  });
  project = addFile(project, {
    path: 'md/main.xml',
    kind: 'md',
    content: `<mdscript name="Main"><cues><cue name="Start"><actions><signal_cue cue="md.Contract.Call_chat" /></actions></cue></cues></mdscript>`,
  });
  project = addFile(project, {
    path: 'md/contract.xml',
    kind: 'md',
    content: `<mdscript name="Contract"><cues>
      <library name="Call_chat"><actions><raise_lua_event name="'ai_influence.chat'" param="table[prompt=$prompt]" /></actions></library>
      <cue name="On_chat_response"><conditions><event_ui_triggered screen="'ai_influence'" control="'chat.response'" /></conditions></cue>
    </cues></mdscript>`,
  });
  project = addFile(project, {
    path: 'ui/chat.lua',
    kind: 'lua',
    content: `local NS = "ai_influence"
RegisterEvent("ai_influence.chat", function(_, payload) end)
AddUITriggeredEvent(NS, "chat.response", { reply = "ok" })`,
  });
  return project;
}

export function runProjectCrossFileSelftest() {
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

  const good = validateProjectCrossFile(fixtureProject());
  ok('valid_project_has_no_errors', good.ok, good.findings);
  ok('indexes_md_to_lua_raise_and_register', good.mdLua.raised.some(e => e.event === 'ai_influence.chat') && good.mdLua.registered.some(e => e.event === 'ai_influence.chat'), good.mdLua);
  ok('indexes_lua_to_md_emit_and_listener', good.mdLua.emitted.some(e => e.event === 'ai_influence.chat.response') && good.mdLua.listened.some(e => e.event === 'ai_influence.chat.response'), good.mdLua);
  ok('reports_content_dependencies', good.deps.dependencies.some(d => d.id === 'djfhe_http' && d.optional), good.deps);

  const noLuaRegister: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'ui/chat.lua' ? { ...f, content: 'local NS = "ai_influence"\nAddUITriggeredEvent(NS, "chat.response", {})' } : f),
  };
  const missingRegister = validateProjectCrossFile(noLuaRegister);
  ok('flags_md_raise_without_lua_register', !missingRegister.ok && missingRegister.findings.some(f => f.code === 'md_lua.missing_register' && f.event === 'ai_influence.chat'), missingRegister.findings);

  const noMdListener: ExtensionProject = {
    ...fixtureProject(),
    files: fixtureProject().files.map(f => f.path === 'md/contract.xml' ? { ...f, content: f.content!.replace(/<cue name="On_chat_response">[\s\S]*?<\/cue>/, '') } : f),
  };
  const missingListener = validateProjectCrossFile(noMdListener);
  ok('flags_lua_emit_without_md_listener', !missingListener.ok && missingListener.findings.some(f => f.code === 'lua_md.missing_listener' && f.event === 'ai_influence.chat.response'), missingListener.findings);

  const brokenCue = addFile(fixtureProject(), {
    path: 'md/broken.xml',
    kind: 'md',
    content: '<mdscript name="Broken"><cues><cue name="Start"><actions><signal_cue cue="md.Contract.Nope" /></actions></cue></cues></mdscript>',
  });
  const unresolved = validateProjectCrossFile(brokenCue);
  ok('keeps_unresolved_cross_file_cue_diagnostic', !unresolved.ok && unresolved.findings.some(f => f.code === 'cue.unresolved'), unresolved.findings);

  const duplicateDeps = addFile(fixtureProject(), {
    path: 'content.xml',
    kind: 'content',
    content: buildContentXml({ id: 'ai_influence', name: 'AI Influence', deps: [
      { id: 'djfhe_http', optional: true },
      { id: 'djfhe_http', optional: false },
    ] }),
  });
  const dup = validateProjectCrossFile(duplicateDeps);
  ok('flags_duplicate_dependency', dup.findings.some(f => f.code === 'dep.duplicate' && f.severity === 'warning'), dup.findings);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
