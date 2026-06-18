/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P0 (Tier 1, KEYSTONE) — extension PROJECT model, deterministic core.
 *
 * Forge today models one workspace = one MD file (ModWorkspace = a single nodes/links
 * graph → one md/<id>.xml). Real extensions (the AI Influence exemplar: 9 MD scripts +
 * Lua + UI + content.xml with deps) are multi-file. This is the pure model for a
 * multi-file extension PROJECT: a collection of typed files, structural validation, and
 * — the part Forge has never had — a CROSS-FILE cue reference index (does a
 * `md.<script>.<cue>` reference in file A resolve to a cue actually defined in file B?).
 *
 * Composes existing pieces, doesn't replace them: each MD file's authoring/compile stays
 * the single-workspace path; this layer is the project = collection-of-files envelope and
 * the cross-file linkage the single-file model can't see. Reuses cueLineage for ref
 * extraction. Pure: no fs/network. House pattern: engine + oracle + public GET, then UI/API.
 */

import { parseSignalCueRefs } from './cueLineage';
import { parseModManifest, type ModDependency } from './modDependencyGraph';

export type ProjectFileKind = 'md' | 'lua' | 'ui' | 'content' | 't' | 'library' | 'aiscript' | 'other';

export interface ProjectFile {
  /** relative path within the extension, e.g. "md/chat.xml", "ui/chat.lua", "content.xml" */
  path: string;
  kind: ProjectFileKind;
  /** raw file content (XML/Lua/etc.); optional so a project can model structure before content exists */
  content?: string;
}

export interface ExtensionProject {
  id: string;
  name: string;
  files: ProjectFile[];
}

export interface ProjectIssue {
  code: 'missing_content_xml' | 'duplicate_path' | 'invalid_path' | 'kind_path_mismatch';
  severity: 'error' | 'warning' | 'info';
  path?: string;
  detail: string;
}

export interface CueDef { name: string; file: string; script: string }
export interface CueRef {
  /** the raw reference string, e.g. "md.ChatScript.OnReply" or "this.LocalCue" */
  ref: string;
  /** file the reference appears in */
  file: string;
  /** classification of how it resolves */
  scope: 'local' | 'cross_file' | 'external';
  resolved: boolean;
}
export interface CueReferenceIndex {
  defined: CueDef[];
  references: CueRef[];
  /** the actionable subset: in-project refs (local or cross_file) that resolve to nothing */
  unresolved: CueRef[];
}

/* ------------------------------------------------------------------ *
 * Path classification + file ops (pure; ops return a new project).
 * ------------------------------------------------------------------ */

export function classifyPath(path: string): ProjectFileKind {
  const p = (path || '').replace(/\\/g, '/').toLowerCase();
  if (p === 'content.xml') return 'content';
  if (p.endsWith('.lua')) return 'lua';
  if (/(^|\/)md\/.+\.xml$/.test(p)) return 'md';
  if (/(^|\/)aiscripts\/.+\.xml$/.test(p)) return 'aiscript';
  if (/(^|\/)t\/.+\.xml$/.test(p)) return 't';
  if (/(^|\/)(libraries|index|maps|assets)\/.+/.test(p)) return 'library';
  if (/(^|\/)ui\/.+/.test(p)) return 'ui';
  return 'other';
}

function normPath(path: string): string {
  return (path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function createProject(id: string, name: string): ExtensionProject {
  return { id, name, files: [] };
}

export function addFile(project: ExtensionProject, file: ProjectFile): ExtensionProject {
  const path = normPath(file.path);
  const kind = file.kind || classifyPath(path);
  const files = project.files.filter(f => normPath(f.path) !== path); // replace if same path
  return { ...project, files: [...files, { ...file, path, kind }] };
}

export function removeFile(project: ExtensionProject, path: string): ExtensionProject {
  const target = normPath(path);
  return { ...project, files: project.files.filter(f => normPath(f.path) !== target) };
}

export function getFile(project: ExtensionProject, path: string): ProjectFile | undefined {
  const target = normPath(path);
  return project.files.find(f => normPath(f.path) === target);
}

/* ------------------------------------------------------------------ *
 * Structural validation.
 * ------------------------------------------------------------------ */

export function validateProjectStructure(project: ExtensionProject): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const files = project?.files || [];

  if (!files.some(f => normPath(f.path) === 'content.xml')) {
    issues.push({ code: 'missing_content_xml', severity: 'error',
      detail: 'Extension has no content.xml — X4 will not discover it.' });
  }

  const seen = new Map<string, number>();
  for (const f of files) {
    const p = normPath(f.path);
    seen.set(p, (seen.get(p) || 0) + 1);
    if (p.includes(':') || p.split('/').includes('..') || p === '') {
      issues.push({ code: 'invalid_path', severity: 'error', path: f.path,
        detail: `Invalid extension-relative path "${f.path}".` });
    }
    const expected = classifyPath(p);
    if (f.kind !== expected && expected !== 'other' && f.kind !== 'other') {
      issues.push({ code: 'kind_path_mismatch', severity: 'info', path: f.path,
        detail: `File "${f.path}" is declared kind "${f.kind}" but its path looks like "${expected}".` });
    }
  }
  for (const [p, n] of seen) {
    if (n > 1) issues.push({ code: 'duplicate_path', severity: 'error', path: p,
      detail: `Path "${p}" is claimed by ${n} files; X4 packages one file per path.` });
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * content.xml authoring WITH dependencies (modCompiler.generateContentXML
 * emits no <dependency> children; this does). Deterministic; pure string build.
 * ------------------------------------------------------------------ */

export interface ContentMeta {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  /** X4 content.xml save-compat flag; default "0". */
  save?: string;
  deps?: ModDependency[];
}

function escapeXmlAttr(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** X4 wants an integer-ish version; "1.2.0" → "120", bare ints pass through, else "100". */
export function toContentVersion(version?: string): string {
  if (!version) return '100';
  const digits = String(version).replace(/[^0-9]/g, '');
  return digits.length ? String(parseInt(digits, 10)) : '100';
}

/** Build a content.xml string including <dependency> children. */
export function buildContentXml(meta: ContentMeta): string {
  const id = escapeXmlAttr(meta.id || 'my_extension');
  const name = escapeXmlAttr(meta.name || meta.id || 'My Extension');
  const desc = escapeXmlAttr(meta.description || '');
  const author = escapeXmlAttr(meta.author || '');
  const version = toContentVersion(meta.version);
  const save = escapeXmlAttr(meta.save || '0');
  const deps = (meta.deps || []).filter(d => d && d.id);
  const depLines = deps.map(d => {
    const attrs = [`id="${escapeXmlAttr(d.id)}"`];
    if (d.version) attrs.push(`version="${escapeXmlAttr(d.version)}"`);
    if (d.optional) attrs.push(`optional="true"`);
    if (d.name) attrs.push(`name="${escapeXmlAttr(d.name)}"`);
    return `  <dependency ${attrs.join(' ')} />`;
  });
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<content id="${id}" name="${name}" description="${desc}" author="${author}" version="${version}" save="${save}" enabled="1">`,
    `  <text language="44" name="${name}" description="${desc}" author="${author}" />`,
    ...depLines,
    `</content>`,
    ``,
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Cross-file cue reference index — the linkage the single-file model can't see.
 * ------------------------------------------------------------------ */

/** Parse the `<mdscript name="...">` name from one MD file (empty if none). */
function mdScriptName(content: string): string {
  return content.match(/<mdscript\b[^>]*\bname\s*=\s*"([^"]+)"/i)?.[1] || '';
}

/** All `<cue name="...">` (and library cues) defined in one MD file. */
function definedCueNames(content: string): string[] {
  const out: string[] = [];
  const re = /<cue\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

/**
 * Build the project-wide cue index: every defined cue (by file + owning mdscript) and
 * every signalling reference (signal_cue / reset_cue / cancel_cue), classified as
 * local (same file), cross_file (`md.<script>.<cue>` to another file), or external
 * (qualified ref to a script not in this project — never flagged). `unresolved` is the
 * actionable subset: in-project refs that resolve to no defined cue.
 */
export function indexCueReferences(project: ExtensionProject): CueReferenceIndex {
  const mdFiles = (project?.files || []).filter(f => f.kind === 'md' && typeof f.content === 'string');

  const defined: CueDef[] = [];
  // script name -> set of cue names defined in it
  const cuesByScript = new Map<string, Set<string>>();
  // file path -> its mdscript name
  const scriptByFile = new Map<string, string>();

  for (const f of mdFiles) {
    const script = mdScriptName(f.content!);
    scriptByFile.set(normPath(f.path), script);
    const set = cuesByScript.get(script) || new Set<string>();
    for (const name of definedCueNames(f.content!)) {
      defined.push({ name, file: f.path, script });
      set.add(name);
    }
    cuesByScript.set(script, set);
  }

  const knownScripts = new Set([...cuesByScript.keys()].filter(Boolean));
  const references: CueRef[] = [];

  for (const f of mdFiles) {
    const ownScript = scriptByFile.get(normPath(f.path)) || '';
    const ownCues = cuesByScript.get(ownScript) || new Set<string>();
    for (const raw of parseSignalCueRefs(f.content!)) {
      const ref = raw.trim();
      let scope: CueRef['scope'];
      let resolved: boolean;

      // NOTE: this intentionally does NOT reuse cueLineage.normalizeLocalCueRef. That
      // helper collapses every dotted ref to `null` ("external"), but the PROJECT context
      // needs to keep `md.<script>.<cue>` as a *cross_file* ref to resolve against sibling
      // files — a distinction normalizeLocalCueRef erases. Do not "dedupe" these into one.
      const local = ref.startsWith('this.') ? ref.slice(5) : ref;
      const cross = ref.match(/^md\.([^.]+)\.(.+)$/i);

      if (cross) {
        // md.<script>.<cue...> — cross-file within the project if the script is ours.
        const [, script, cuePath] = cross;
        const firstCue = cuePath.split('.')[0];
        if (knownScripts.has(script)) {
          scope = 'cross_file';
          resolved = (cuesByScript.get(script) || new Set()).has(firstCue);
        } else {
          scope = 'external'; resolved = true; // script not in project → external, never flagged
        }
      } else if (!local.includes('.') && !local.startsWith('$') && !local.startsWith('{') && local.length > 0) {
        scope = 'local';
        resolved = ownCues.has(local);
      } else {
        scope = 'external'; resolved = true; // parent./static./expression/qualified → external
      }
      references.push({ ref, file: f.path, scope, resolved });
    }
  }

  const unresolved = references.filter(r => !r.resolved && r.scope !== 'external');
  return { defined, references, unresolved };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runExtensionProjectSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // --- path classification ---
  ok('classify content.xml', classifyPath('content.xml') === 'content');
  ok('classify md file', classifyPath('md/chat.xml') === 'md');
  ok('classify lua file', classifyPath('ui/chat.lua') === 'lua');
  ok('classify t file', classifyPath('t/0001-L044.xml') === 't');
  ok('classify library file', classifyPath('libraries/wares.xml') === 'library');

  // --- file ops (immutable) ---
  let proj = createProject('my_ext', 'My Extension');
  proj = addFile(proj, { path: 'content.xml', kind: 'content', content: '<content id="my_ext"/>' });
  proj = addFile(proj, { path: 'md/a.xml', kind: 'md', content: '<mdscript name="A"><cues><cue name="Start"/></cues></mdscript>' });
  ok('addFile adds files', proj.files.length === 2);
  ok('getFile finds by path', getFile(proj, 'md/a.xml')?.kind === 'md');
  const afterDup = addFile(proj, { path: 'md/a.xml', kind: 'md', content: '<mdscript name="A2"/>' });
  ok('addFile replaces same path (no dup)', afterDup.files.filter(f => f.path === 'md/a.xml').length === 1);
  ok('removeFile removes', removeFile(proj, 'md/a.xml').files.length === 1);

  // --- structural validation ---
  ok('clean project: no structural errors',
    validateProjectStructure(proj).filter(i => i.severity === 'error').length === 0,
    JSON.stringify(validateProjectStructure(proj)));
  ok('missing content.xml flagged',
    validateProjectStructure({ id: 'x', name: 'x', files: [{ path: 'md/a.xml', kind: 'md' }] })
      .some(i => i.code === 'missing_content_xml'));
  ok('path traversal flagged',
    validateProjectStructure({ id: 'x', name: 'x', files: [{ path: '../evil.xml', kind: 'other' }, { path: 'content.xml', kind: 'content' }] })
      .some(i => i.code === 'invalid_path'));

  // --- cross-file cue index ---
  const fileA = `<mdscript name="ChatScript"><cues>
    <cue name="OnPlayerInput"><actions><signal_cue cue="md.WorkerScript.DoFetch"/></actions></cue>
  </cues></mdscript>`;
  const fileB = `<mdscript name="WorkerScript"><cues>
    <cue name="DoFetch"><actions><signal_cue cue="this.Broken"/><signal_cue cue="md.ChatScript.OnPlayerInput"/></actions></cue>
    <cue name="Broken"><actions><signal_cue cue="md.WorkerScript.NoSuchCue"/></actions></cue>
  </cues></mdscript>`;
  let p2 = createProject('p2', 'P2');
  p2 = addFile(p2, { path: 'content.xml', kind: 'content', content: '<content id="p2"/>' });
  p2 = addFile(p2, { path: 'md/chat.xml', kind: 'md', content: fileA });
  p2 = addFile(p2, { path: 'md/worker.xml', kind: 'md', content: fileB });
  const idx = indexCueReferences(p2);

  ok('indexes all defined cues across files', idx.defined.length === 3, JSON.stringify(idx.defined.map(d => `${d.script}.${d.name}`)));
  ok('cross-file ref to existing cue resolves',
    idx.references.some(r => r.ref === 'md.WorkerScript.DoFetch' && r.scope === 'cross_file' && r.resolved));
  ok('local this. ref resolves within same file',
    idx.references.some(r => r.ref === 'this.Broken' && r.scope === 'local' && r.resolved));
  ok('this. ref is scoped to its OWN script (not resolved by another file\'s cue)',
    indexCueReferences({ id: 'z', name: 'z', files: [
      { path: 'content.xml', kind: 'content', content: '<content/>' },
      { path: 'md/x.xml', kind: 'md', content: '<mdscript name="X"><cues><cue name="Local"/></cues></mdscript>' },
      { path: 'md/y.xml', kind: 'md', content: '<mdscript name="Y"><cues><cue name="Q"><actions><signal_cue cue="this.Local"/></actions></cue></cues></mdscript>' },
    ] }).unresolved.some(r => r.ref === 'this.Local'));
  ok('cross-file ref back to chat resolves',
    idx.references.some(r => r.ref === 'md.ChatScript.OnPlayerInput' && r.scope === 'cross_file' && r.resolved));
  ok('cross-file ref to NON-existent cue is unresolved',
    idx.unresolved.some(r => r.ref === 'md.WorkerScript.NoSuchCue'), JSON.stringify(idx.unresolved));
  ok('only one unresolved ref total', idx.unresolved.length === 1, JSON.stringify(idx.unresolved.map(r => r.ref)));

  // external ref to a script NOT in the project is never flagged
  let p3 = createProject('p3', 'P3');
  p3 = addFile(p3, { path: 'content.xml', kind: 'content', content: '<content id="p3"/>' });
  p3 = addFile(p3, { path: 'md/a.xml', kind: 'md', content: '<mdscript name="A"><cues><cue name="C"><actions><signal_cue cue="md.SomeOtherMod.Thing"/></actions></cue></cues></mdscript>' });
  ok('ref to script outside project is external, not unresolved',
    indexCueReferences(p3).unresolved.length === 0
    && indexCueReferences(p3).references.some(r => r.scope === 'external'));

  // --- content.xml authoring WITH deps (build → parse-back idempotence) ---
  const cx = buildContentXml({
    id: 'ai_influence', name: 'AI Influence', version: '1.2.0', author: 'Ken', description: 'Talk to NPCs',
    deps: [
      { id: 'ego_dlc_split', optional: false },
      { id: 'djfhe_http', version: '100', optional: true },
    ],
  });
  ok('content.xml version normalized 1.2.0→120', cx.includes('version="120"'), cx.match(/version="[^"]*"/)?.[0]);
  ok('content.xml emits required + optional dependencies',
    cx.includes('<dependency id="ego_dlc_split" />') && cx.includes('optional="true"'), cx);
  // parse the built content.xml back through modDependencyGraph — must round-trip
  const back = parseModManifest('ai_influence', cx)!;
  ok('built content.xml parses back to same id', back.id === 'ai_influence');
  ok('built content.xml round-trips 2 dependencies', back.deps.length === 2, JSON.stringify(back.deps));
  ok('round-trip preserves optional flag',
    back.deps.find(d => d.id === 'djfhe_http')?.optional === true
    && back.deps.find(d => d.id === 'ego_dlc_split')?.optional === false);
  ok('content.xml escapes special chars',
    buildContentXml({ id: 'x', name: 'A & B "C"' }).includes('A &amp; B &quot;C&quot;'));

  // degrades safely
  ok('empty project degrades', indexCueReferences(createProject('e', 'E')).defined.length === 0
    && validateProjectStructure(createProject('e', 'E')).some(i => i.code === 'missing_content_xml'));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
