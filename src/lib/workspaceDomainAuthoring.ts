/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #19 P4 Slice 12 — Pure domain-isolated projection and strict input validation
 * for addressed Studio workspace domain readback (`workspace.domain.read@1`) and
 * explicit-grant CAS domain authoring (`workspace.domain.write@1`).
 */

import type { ModWorkspace } from '../types';
import { sanitizeWorkspace } from '../types';

export const WORKSPACE_AUTHORING_DOMAINS = [
  'aiscripts',
  'libraries',
  'md_graph',
  'translations',
  'ui_layout',
  'xml_patches',
] as const;

export type WorkspaceAuthoringDomain = (typeof WORKSPACE_AUTHORING_DOMAINS)[number];

export const WORKSPACE_DOMAIN_MAX_RESPONSE_BYTES = 512 * 1024;

const DOMAIN_COMPILE_KEY: Record<WorkspaceAuthoringDomain, keyof NonNullable<ModWorkspace['compileSettings']>> = {
  aiscripts: 'ai',
  libraries: 'library',
  md_graph: 'md',
  translations: 'translations',
  ui_layout: 'ui',
  xml_patches: 'patches',
};

const DOMAIN_ALLOWED_CHANGE_KEYS: Record<WorkspaceAuthoringDomain, ReadonlySet<string>> = {
  aiscripts: new Set(['aiScripts', 'compileEnabled']),
  libraries: new Set([
    'name',
    'version',
    'author',
    'description',
    'contentId',
    'dependencies',
    'wares',
    'jobs',
    'compileEnabled',
  ]),
  md_graph: new Set(['nodes', 'links', 'templates', 'mdScriptName', 'mdFileStem', 'compileEnabled']),
  translations: new Set(['tFiles', 'compileEnabled']),
  ui_layout: new Set(['uiWidgets', 'uiTheme', 'customLua', 'compileEnabled']),
  xml_patches: new Set(['xmlPatches', 'compileEnabled']),
};

const VALID_WARE_TRANSPORTS = new Set(['container', 'liquid', 'solid', 'energy']);
const VALID_JOB_SHIP_CLASSES = new Set(['fighter', 'corvette', 'destroyer', 'carrier', 'freighter']);
const VALID_WIDGET_TYPES = new Set([
  'window',
  'table',
  'button',
  'text',
  'progressbar',
  'dropdown',
  'header',
  'input',
  'chat',
]);
const VALID_PATCH_ACTIONS = new Set(['add', 'replace', 'remove']);
const VALID_PATCH_POS = new Set(['before', 'after', 'prepend', 'append']);
const VALID_NODE_TYPES = new Set(['cue', 'event', 'condition', 'action', 'variable', 'comment']);
const VALID_AI_PARAM_TYPES = new Set(['object', 'number', 'boolean', 'ware', 'faction']);
const VALID_AI_COMMANDS = new Set([
  'move_to',
  'flee',
  'shoot',
  'dock_at',
  'wait',
  'find_objects',
  'custom_xml',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasControlChars(text: string, allowNewlines = false): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (allowNewlines && (code === 9 || code === 10 || code === 13)) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function isSafeRelativeXmlTarget(raw: string): boolean {
  if (!raw || raw.length > 512 || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || hasControlChars(raw)) {
    return false;
  }
  const segments = raw.split('/');
  return segments.every(seg => seg.length > 0 && seg !== '.' && seg !== '..');
}

function isSafeStemOrId(raw: string, maxLen = 128): boolean {
  return (
    typeof raw === 'string' &&
    raw.trim().length > 0 &&
    raw.length <= maxLen &&
    !raw.includes('/') &&
    !raw.includes('\\') &&
    !raw.includes('..') &&
    !hasControlChars(raw)
  );
}

export function isWorkspaceAuthoringDomain(value: unknown): value is WorkspaceAuthoringDomain {
  return typeof value === 'string' && (WORKSPACE_AUTHORING_DOMAINS as readonly string[]).includes(value);
}

export function projectWorkspaceDomainData(
  sanitized: ModWorkspace,
  domain: WorkspaceAuthoringDomain,
): Record<string, unknown> {
  switch (domain) {
    case 'aiscripts':
      return {
        aiScripts: sanitized.aiScripts || [],
      };
    case 'libraries':
      return {
        name: sanitized.name,
        version: sanitized.version,
        author: sanitized.author,
        description: sanitized.description,
        contentId: sanitized.contentId ?? null,
        dependencies: sanitized.dependencies || [],
        wares: sanitized.wares || [],
        jobs: sanitized.jobs || [],
      };
    case 'md_graph':
      return {
        mdScriptName: sanitized.mdScriptName ?? null,
        mdFileStem: sanitized.mdFileStem ?? null,
        nodes: sanitized.nodes || [],
        links: sanitized.links || [],
        templates: sanitized.templates || [],
      };
    case 'translations':
      return {
        tFiles: sanitized.tFiles || [],
      };
    case 'ui_layout':
      return {
        uiWidgets: sanitized.uiWidgets || [],
        uiTheme: sanitized.uiTheme,
        customLua: sanitized.customLua ?? '',
        uiSourceFilePaths: (sanitized.uiSourceFiles || []).map(file => ({
          path: file.path,
          kind: file.kind,
          bytes: typeof file.bytes === 'number' ? file.bytes : Buffer.byteLength(file.content || '', 'utf8'),
          omitted: Boolean(file.omitted),
        })),
      };
    case 'xml_patches':
      return {
        xmlPatches: sanitized.xmlPatches || [],
      };
  }
}

function validateAiScriptsArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 512) {
    return 'aiScripts must be an array of at most 512 AI script definitions.';
  }
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!isPlainRecord(item)) return `aiScripts[${i}] must be an object.`;
    if (!isSafeStemOrId(String(item.id || ''), 128)) return `aiScripts[${i}].id must be a non-empty safe identifier.`;
    if (!isSafeStemOrId(String(item.name || ''), 128)) return `aiScripts[${i}].name must be a non-empty safe script name.`;
    if (item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 4096)) {
      return `aiScripts[${i}].description must be a bounded string.`;
    }
    if (item.command !== undefined && (typeof item.command !== 'string' || item.command.length > 256)) {
      return `aiScripts[${i}].command must be a bounded string.`;
    }
    if (item.attentionLevel !== 'high' && item.attentionLevel !== 'low') {
      return `aiScripts[${i}].attentionLevel must be "high" or "low".`;
    }
    if (!Array.isArray(item.params) || item.params.length > 128) return `aiScripts[${i}].params must be a bounded array.`;
    for (let p = 0; p < item.params.length; p += 1) {
      const param = item.params[p];
      if (!isPlainRecord(param) || typeof param.name !== 'string' || !param.name.trim() || !VALID_AI_PARAM_TYPES.has(String(param.type))) {
        return `aiScripts[${i}].params[${p}] requires a valid name and type.`;
      }
    }
    if (!Array.isArray(item.interrupts) || item.interrupts.length > 128) return `aiScripts[${i}].interrupts must be a bounded array.`;
    if (!Array.isArray(item.actions) || item.actions.length > 1024) return `aiScripts[${i}].actions must be a bounded array.`;
    for (let a = 0; a < item.actions.length; a += 1) {
      const act = item.actions[a];
      if (!isPlainRecord(act) || typeof act.id !== 'string' || !act.id.trim() || !VALID_AI_COMMANDS.has(String(act.command))) {
        return `aiScripts[${i}].actions[${a}] requires a valid id and command.`;
      }
    }
    if (item.includeInBuild !== undefined && typeof item.includeInBuild !== 'boolean') {
      return `aiScripts[${i}].includeInBuild must be boolean.`;
    }
    if (item.namespaced !== undefined && typeof item.namespaced !== 'boolean') {
      return `aiScripts[${i}].namespaced must be boolean.`;
    }
  }
  return null;
}

function validateLibrariesFields(changes: Record<string, unknown>): string | null {
  for (const key of ['name', 'version', 'author', 'description'] as const) {
    if (changes[key] !== undefined) {
      const v = changes[key];
      if (typeof v !== 'string' || v.length > 8192 || v.includes('\0')) {
        return `changes.${key} must be a bounded string.`;
      }
      if ((key === 'name' || key === 'version') && !v.trim()) {
        return `changes.${key} must not be empty.`;
      }
    }
  }
  if (changes.contentId !== undefined && changes.contentId !== null) {
    if (!isSafeStemOrId(String(changes.contentId), 128) || !/^[A-Za-z0-9_.-]+$/.test(String(changes.contentId))) {
      return 'changes.contentId must be null or a safe extension id (letters, digits, _, ., -).';
    }
  }
  if (changes.dependencies !== undefined) {
    if (!Array.isArray(changes.dependencies) || changes.dependencies.length > 256) {
      return 'changes.dependencies must be an array of at most 256 entries.';
    }
    for (let i = 0; i < changes.dependencies.length; i += 1) {
      const dep = changes.dependencies[i];
      if (!isPlainRecord(dep) || typeof dep.id !== 'string' || !dep.id.trim() || dep.id.length > 128) {
        return `changes.dependencies[${i}].id must be a non-empty bounded string.`;
      }
      if (dep.version !== undefined && (typeof dep.version !== 'string' || dep.version.length > 64)) {
        return `changes.dependencies[${i}].version must be a bounded string.`;
      }
      if (dep.optional !== undefined && typeof dep.optional !== 'boolean') {
        return `changes.dependencies[${i}].optional must be boolean.`;
      }
      if (dep.name !== undefined && (typeof dep.name !== 'string' || dep.name.length > 256)) {
        return `changes.dependencies[${i}].name must be a bounded string.`;
      }
    }
  }
  if (changes.wares !== undefined) {
    if (!Array.isArray(changes.wares) || changes.wares.length > 2048) {
      return 'changes.wares must be an array of at most 2048 ware definitions.';
    }
    for (let i = 0; i < changes.wares.length; i += 1) {
      const ware = changes.wares[i];
      if (!isPlainRecord(ware) || !isSafeStemOrId(String(ware.id || ''), 128)) {
        return `changes.wares[${i}].id must be a non-empty safe identifier.`;
      }
      if (typeof ware.name !== 'string' || !ware.name.trim() || ware.name.length > 512) {
        return `changes.wares[${i}].name must be a non-empty bounded string.`;
      }
      if (!VALID_WARE_TRANSPORTS.has(String(ware.transport))) {
        return `changes.wares[${i}].transport must be container, liquid, solid, or energy.`;
      }
      for (const numKey of ['volume', 'minPrice', 'avgPrice', 'maxPrice', 'prodTime', 'prodAmount'] as const) {
        const num = ware[numKey];
        if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) {
          return `changes.wares[${i}].${numKey} must be a non-negative finite number.`;
        }
      }
      if (ware.includeInBuild !== undefined && typeof ware.includeInBuild !== 'boolean') {
        return `changes.wares[${i}].includeInBuild must be boolean.`;
      }
    }
  }
  if (changes.jobs !== undefined) {
    if (!Array.isArray(changes.jobs) || changes.jobs.length > 2048) {
      return 'changes.jobs must be an array of at most 2048 job definitions.';
    }
    for (let i = 0; i < changes.jobs.length; i += 1) {
      const job = changes.jobs[i];
      if (!isPlainRecord(job) || !isSafeStemOrId(String(job.id || ''), 128)) {
        return `changes.jobs[${i}].id must be a non-empty safe identifier.`;
      }
      if (typeof job.name !== 'string' || !job.name.trim() || job.name.length > 512) {
        return `changes.jobs[${i}].name must be a non-empty bounded string.`;
      }
      if (typeof job.faction !== 'string' || !job.faction.trim() || job.faction.length > 128) {
        return `changes.jobs[${i}].faction must be a non-empty bounded string.`;
      }
      if (!VALID_JOB_SHIP_CLASSES.has(String(job.shipClass))) {
        return `changes.jobs[${i}].shipClass must be fighter, corvette, destroyer, carrier, or freighter.`;
      }
      if (typeof job.shipMacro !== 'string' || !job.shipMacro.trim() || job.shipMacro.length > 256) {
        return `changes.jobs[${i}].shipMacro must be a non-empty bounded string.`;
      }
      for (const numKey of ['galaxyQuota', 'sectorQuota'] as const) {
        const num = job[numKey];
        if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) {
          return `changes.jobs[${i}].${numKey} must be a non-negative finite number.`;
        }
      }
      if (typeof job.taskScript !== 'string' || !job.taskScript.trim() || job.taskScript.length > 256) {
        return `changes.jobs[${i}].taskScript must be a non-empty bounded string.`;
      }
      if (typeof job.rebuildOnDestroy !== 'boolean') {
        return `changes.jobs[${i}].rebuildOnDestroy must be boolean.`;
      }
      if (job.includeInBuild !== undefined && typeof job.includeInBuild !== 'boolean') {
        return `changes.jobs[${i}].includeInBuild must be boolean.`;
      }
    }
  }
  return null;
}

function validateMdGraphFields(changes: Record<string, unknown>): string | null {
  for (const key of ['mdScriptName', 'mdFileStem'] as const) {
    if (changes[key] !== undefined && changes[key] !== null) {
      if (!isSafeStemOrId(String(changes[key]), 128)) {
        return `changes.${key} must be null or a safe single-segment identifier.`;
      }
    }
  }
  for (const nodeListKey of ['nodes', 'templates'] as const) {
    if (changes[nodeListKey] !== undefined) {
      const maxLen = nodeListKey === 'nodes' ? 2048 : 512;
      const list = changes[nodeListKey];
      if (!Array.isArray(list) || list.length > maxLen) {
        return `changes.${nodeListKey} must be an array of at most ${maxLen} nodes.`;
      }
      for (let i = 0; i < list.length; i += 1) {
        const node = list[i];
        if (!isPlainRecord(node) || typeof node.id !== 'string' || !node.id.trim() || !VALID_NODE_TYPES.has(String(node.type))) {
          return `changes.${nodeListKey}[${i}] requires a valid id and type.`;
        }
        if (typeof node.xmlTag !== 'string' || !node.xmlTag.trim() || typeof node.x !== 'number' || !Number.isFinite(node.x) || typeof node.y !== 'number' || !Number.isFinite(node.y)) {
          return `changes.${nodeListKey}[${i}] requires a non-empty xmlTag and finite x/y coordinates.`;
        }
      }
    }
  }
  if (changes.links !== undefined) {
    if (!Array.isArray(changes.links) || changes.links.length > 4096) {
      return 'changes.links must be an array of at most 4096 links.';
    }
    for (let i = 0; i < changes.links.length; i += 1) {
      const link = changes.links[i];
      if (
        !isPlainRecord(link) ||
        typeof link.id !== 'string' || !link.id.trim() ||
        typeof link.sourceNodeId !== 'string' || !link.sourceNodeId.trim() ||
        typeof link.sourcePortId !== 'string' || !link.sourcePortId.trim() ||
        typeof link.targetNodeId !== 'string' || !link.targetNodeId.trim() ||
        typeof link.targetPortId !== 'string' || !link.targetPortId.trim()
      ) {
        return `changes.links[${i}] requires id, sourceNodeId, sourcePortId, targetNodeId, and targetPortId.`;
      }
    }
  }
  return null;
}

function validateTranslationsFields(changes: Record<string, unknown>): string | null {
  if (changes.tFiles !== undefined) {
    if (!Array.isArray(changes.tFiles) || changes.tFiles.length > 128) {
      return 'changes.tFiles must be an array of at most 128 translation files.';
    }
    for (let i = 0; i < changes.tFiles.length; i += 1) {
      const tf = changes.tFiles[i];
      if (!isPlainRecord(tf) || typeof tf.languageId !== 'string' || !/^\d{1,4}$/.test(tf.languageId.trim())) {
        return `changes.tFiles[${i}].languageId must be a numeric X4 language ID string (for example "44").`;
      }
      if (!isSafeStemOrId(String(tf.fileName || ''), 128) || !/\.xml$/i.test(String(tf.fileName))) {
        return `changes.tFiles[${i}].fileName must be a single-segment .xml filename.`;
      }
      if (!Array.isArray(tf.pages) || tf.pages.length > 1024) {
        return `changes.tFiles[${i}].pages must be a bounded array.`;
      }
      for (let p = 0; p < tf.pages.length; p += 1) {
        const page = tf.pages[p];
        if (!isPlainRecord(page) || typeof page.id !== 'string' || !/^\d+$/.test(page.id.trim()) || !Array.isArray(page.items) || page.items.length > 4096) {
          return `changes.tFiles[${i}].pages[${p}] requires a numeric string id and bounded items array.`;
        }
        for (let k = 0; k < page.items.length; k += 1) {
          const entry = page.items[k];
          if (!isPlainRecord(entry) || typeof entry.id !== 'string' || !/^\d+$/.test(entry.id.trim()) || typeof entry.value !== 'string') {
            return `changes.tFiles[${i}].pages[${p}].items[${k}] requires a numeric string id and string value.`;
          }
        }
      }
      if (tf.includeInBuild !== undefined && typeof tf.includeInBuild !== 'boolean') {
        return `changes.tFiles[${i}].includeInBuild must be boolean.`;
      }
    }
  }
  return null;
}

function validateUiLayoutFields(changes: Record<string, unknown>): string | null {
  if (changes.uiWidgets !== undefined) {
    if (!Array.isArray(changes.uiWidgets) || changes.uiWidgets.length > 512) {
      return 'changes.uiWidgets must be an array of at most 512 widgets.';
    }
    for (let i = 0; i < changes.uiWidgets.length; i += 1) {
      const widget = changes.uiWidgets[i];
      if (!isPlainRecord(widget) || !isSafeStemOrId(String(widget.id || ''), 128) || !VALID_WIDGET_TYPES.has(String(widget.type))) {
        return `changes.uiWidgets[${i}] requires a valid id and widget type.`;
      }
      if (typeof widget.label !== 'string' || widget.label.length > 1024) {
        return `changes.uiWidgets[${i}].label must be a bounded string.`;
      }
      for (const dim of ['x', 'y', 'w', 'h'] as const) {
        if (typeof widget[dim] !== 'number' || !Number.isFinite(widget[dim])) {
          return `changes.uiWidgets[${i}].${dim} must be a finite number.`;
        }
      }
      if (widget.properties !== undefined && !isPlainRecord(widget.properties)) {
        return `changes.uiWidgets[${i}].properties must be an object.`;
      }
      if (widget.includeInBuild !== undefined && typeof widget.includeInBuild !== 'boolean') {
        return `changes.uiWidgets[${i}].includeInBuild must be boolean.`;
      }
    }
  }
  if (changes.uiTheme !== undefined) {
    if (!isPlainRecord(changes.uiTheme)) return 'changes.uiTheme must be an object.';
    const themeAllowed = new Set(['backgroundColor', 'borderColor', 'accentColor', 'opacity', 'showIcons']);
    for (const k of Object.keys(changes.uiTheme)) {
      if (!themeAllowed.has(k)) return `changes.uiTheme has unknown field: ${k}.`;
    }
    for (const colorKey of ['backgroundColor', 'borderColor', 'accentColor'] as const) {
      if (changes.uiTheme[colorKey] !== undefined && (typeof changes.uiTheme[colorKey] !== 'string' || String(changes.uiTheme[colorKey]).length > 64)) {
        return `changes.uiTheme.${colorKey} must be a bounded color string.`;
      }
    }
    if (changes.uiTheme.opacity !== undefined) {
      const op = changes.uiTheme.opacity;
      if (typeof op !== 'number' || !Number.isFinite(op) || op < 0 || op > 1) {
        return 'changes.uiTheme.opacity must be a number between 0 and 1.';
      }
    }
    if (changes.uiTheme.showIcons !== undefined && typeof changes.uiTheme.showIcons !== 'boolean') {
      return 'changes.uiTheme.showIcons must be boolean.';
    }
  }
  if (changes.customLua !== undefined && changes.customLua !== null) {
    if (typeof changes.customLua !== 'string' || changes.customLua.length > 512 * 1024 || changes.customLua.includes('\0')) {
      return 'changes.customLua must be null or a UTF-8 string of at most 524288 characters.';
    }
  }
  return null;
}

function validateXmlPatchesFields(changes: Record<string, unknown>): string | null {
  if (changes.xmlPatches !== undefined) {
    if (!Array.isArray(changes.xmlPatches) || changes.xmlPatches.length > 2048) {
      return 'changes.xmlPatches must be an array of at most 2048 patch blocks.';
    }
    for (let i = 0; i < changes.xmlPatches.length; i += 1) {
      const patch = changes.xmlPatches[i];
      if (!isPlainRecord(patch) || !isSafeStemOrId(String(patch.id || ''), 128)) {
        return `changes.xmlPatches[${i}].id must be a non-empty safe identifier.`;
      }
      if (typeof patch.sel !== 'string' || !patch.sel.trim() || patch.sel.length > 4096) {
        return `changes.xmlPatches[${i}].sel must be a non-empty XPath selector.`;
      }
      if (!VALID_PATCH_ACTIONS.has(String(patch.action))) {
        return `changes.xmlPatches[${i}].action must be add, replace, or remove.`;
      }
      if (typeof patch.content !== 'string' || patch.content.length > 512 * 1024) {
        return `changes.xmlPatches[${i}].content must be a bounded string.`;
      }
      if (patch.note !== undefined && (typeof patch.note !== 'string' || patch.note.length > 4096)) {
        return `changes.xmlPatches[${i}].note must be a bounded string.`;
      }
      if (patch.pos !== undefined && !VALID_PATCH_POS.has(String(patch.pos))) {
        return `changes.xmlPatches[${i}].pos must be before, after, prepend, or append.`;
      }
      if (patch.attrType !== undefined && (typeof patch.attrType !== 'string' || patch.attrType.length > 128)) {
        return `changes.xmlPatches[${i}].attrType must be a bounded string.`;
      }
      if (patch.targetFile !== undefined && !isSafeRelativeXmlTarget(String(patch.targetFile))) {
        return `changes.xmlPatches[${i}].targetFile must be a safe relative path.`;
      }
      if (patch.includeInBuild !== undefined && typeof patch.includeInBuild !== 'boolean') {
        return `changes.xmlPatches[${i}].includeInBuild must be boolean.`;
      }
    }
  }
  return null;
}

export function buildWorkspaceDomainMergePatch(
  currentSanitized: ModWorkspace,
  domain: WorkspaceAuthoringDomain,
  rawChanges: unknown,
): { ok: true; patch: Record<string, unknown>; touchedFields: string[] } | { ok: false; error: string } {
  if (!isPlainRecord(rawChanges)) {
    return { ok: false, error: 'changes must be a non-empty JSON object.' };
  }
  const keys = Object.keys(rawChanges);
  if (keys.length === 0) {
    return { ok: false, error: `changes must specify at least one ${domain} domain field.` };
  }
  const allowed = DOMAIN_ALLOWED_CHANGE_KEYS[domain];
  const disallowed = keys.filter(key => !allowed.has(key));
  if (disallowed.length > 0) {
    return {
      ok: false,
      error: `workspace.domain.write (${domain}) does not accept field(s): ${disallowed.join(', ')}. Allowed fields: ${[...allowed].join(', ')}.`,
    };
  }
  if (rawChanges.compileEnabled !== undefined && typeof rawChanges.compileEnabled !== 'boolean') {
    return { ok: false, error: 'changes.compileEnabled must be boolean.' };
  }

  const domainError =
    domain === 'aiscripts'
      ? (rawChanges.aiScripts !== undefined ? validateAiScriptsArray(rawChanges.aiScripts) : null)
      : domain === 'libraries'
        ? validateLibrariesFields(rawChanges)
        : domain === 'md_graph'
          ? validateMdGraphFields(rawChanges)
          : domain === 'translations'
            ? validateTranslationsFields(rawChanges)
            : domain === 'ui_layout'
              ? validateUiLayoutFields(rawChanges)
              : validateXmlPatchesFields(rawChanges);
  if (domainError) return { ok: false, error: domainError };

  const patch: Record<string, unknown> = {};
  const touchedFields: string[] = [];
  for (const key of keys) {
    if (key === 'compileEnabled') continue;
    if (domain === 'ui_layout' && key === 'uiTheme') {
      patch.uiTheme = {
        ...currentSanitized.uiTheme,
        ...(rawChanges.uiTheme as Record<string, unknown>),
      };
      touchedFields.push('uiTheme');
    } else if (domain === 'ui_layout' && key === 'customLua' && rawChanges.customLua === null) {
      patch.customLua = '';
      touchedFields.push('customLua');
    } else {
      patch[key] = rawChanges[key];
      touchedFields.push(key);
    }
  }
  if (rawChanges.compileEnabled !== undefined) {
    const compileKey = DOMAIN_COMPILE_KEY[domain];
    patch.compileSettings = {
      md: currentSanitized.compileSettings?.md ?? true,
      ui: currentSanitized.compileSettings?.ui ?? true,
      ai: currentSanitized.compileSettings?.ai ?? true,
      library: currentSanitized.compileSettings?.library ?? true,
      translations: currentSanitized.compileSettings?.translations ?? true,
      patches: currentSanitized.compileSettings?.patches ?? true,
      [compileKey]: rawChanges.compileEnabled,
    };
    touchedFields.push(`compileSettings.${compileKey}`);
  }

  return { ok: true, patch, touchedFields };
}

export function runWorkspaceDomainAuthoringSelftest(): { ok: boolean; passed: number; failed: string[] } {
  const failed: string[] = [];
  let passed = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) passed += 1;
    else failed.push(name);
  };

  const base = sanitizeWorkspace({
    name: 'Forge_Domain_Test',
    version: '1.0.0',
    author: 'QA',
    description: 'Baseline',
    nodes: [],
    links: [],
    uiWidgets: [],
    compileSettings: { md: true, ui: true, ai: true, library: true, translations: true, patches: true },
  });

  check('recognizes_six_domains', WORKSPACE_AUTHORING_DOMAINS.every(d => isWorkspaceAuthoringDomain(d)) && !isWorkspaceAuthoringDomain('unknown'));

  const crossDomain = buildWorkspaceDomainMergePatch(base, 'translations', { wares: [] });
  check('rejects_cross_domain_field_injection', crossDomain.ok === false && crossDomain.error.includes('wares'));

  const nanWare = buildWorkspaceDomainMergePatch(base, 'libraries', {
    wares: [{
      id: 'ware_bad', name: 'Bad', description: '', transport: 'container',
      volume: Number.NaN, minPrice: 10, avgPrice: 20, maxPrice: 30, prodTime: 10, prodAmount: 1,
    }],
  });
  check('rejects_nan_numeric_ware_fields', nanWare.ok === false && nanWare.error.includes('volume'));

  const aiPatch = buildWorkspaceDomainMergePatch(base, 'aiscripts', {
    aiScripts: [{
      id: 'ai_1', name: 'patrol.fast', description: 'Patrol', command: 'command.patrol',
      attentionLevel: 'low', params: [{ name: 'range', type: 'number', defaultValue: '10', comment: '' }],
      interrupts: [], actions: [{ id: 'a1', command: 'wait', label: 'Wait', properties: { exact: '5s' } }],
    }],
    compileEnabled: false,
  });
  check(
    'preserves_sibling_compile_settings',
    aiPatch.ok === true &&
      (aiPatch.patch.compileSettings as Record<string, unknown> | undefined)?.ai === false &&
      (aiPatch.patch.compileSettings as Record<string, unknown> | undefined)?.md === true &&
      (aiPatch.patch.compileSettings as Record<string, unknown> | undefined)?.translations === true,
  );

  const uiPatch = buildWorkspaceDomainMergePatch(base, 'ui_layout', {
    uiTheme: { opacity: 0.75 },
    uiWidgets: [{ id: 'w1', type: 'window', x: 10, y: 20, w: 300, h: 200, label: 'HUD', properties: {} }],
  });
  check(
    'preserves_sibling_ui_theme_fields',
    uiPatch.ok === true &&
      (uiPatch.patch.uiTheme as Record<string, unknown> | undefined)?.opacity === 0.75 &&
      typeof (uiPatch.patch.uiTheme as Record<string, unknown> | undefined)?.backgroundColor === 'string',
  );

  const merged = sanitizeWorkspace({ ...base, ...(aiPatch.ok ? aiPatch.patch : {}) });
  const projectedAi = projectWorkspaceDomainData(merged, 'aiscripts');
  check('projects_domain_without_host_paths', Array.isArray(projectedAi.aiScripts) && projectedAi.aiScripts.length === 1 && !('sourceFolder' in projectedAi));

  return { ok: failed.length === 0, passed, failed };
}
