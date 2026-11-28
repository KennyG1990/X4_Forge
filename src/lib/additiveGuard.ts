/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure Additive-Only Guard & Vanilla Diff Hooks Inspector (#142).
 *
 * Enforces the project-level rule "never overwrite vanilla logic" without
 * Node-only built-ins so both server validators and browser views can share it:
 *   1. Non-<diff> XML files whose path matches a vanilla file under
 *      aiscripts/, md/, libraries/, index/, or maps/ are refused.
 *   2. <diff> operations against vanilla targets only allow structural <add>;
 *      <replace>, <remove>, and attribute adds (type="@..." or /@attr sel)
 *      are refused, while all <diff> hooks are reported for auditability.
 *   3. Non-<diff> aiscripts/ and md/ files cannot reuse vanilla script names.
 *   4. t/*.xml files cannot reuse vanilla localization <page id="...">.
 */

import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';

export type AdditiveGuardFindingCode =
  | 'additive.shadowed_vanilla_file'
  | 'additive.diff_replace_forbidden'
  | 'additive.diff_remove_forbidden'
  | 'additive.diff_attribute_add_forbidden'
  | 'additive.reused_vanilla_aiscript_name'
  | 'additive.reused_vanilla_mdscript_name'
  | 'additive.reused_vanilla_page_id';

export interface VanillaFileMatch {
  readonly path: string;
  readonly sources: readonly string[];
}

export interface VanillaScriptMatch {
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

export interface VanillaPageMatch {
  readonly id: string;
  readonly path: string;
  readonly source: string;
}

export interface VanillaAdditiveIndex {
  readonly filesAvailable: boolean;
  readonly files: ReadonlyMap<string, VanillaFileMatch>;
  readonly aiScriptsAvailable: boolean;
  readonly aiScripts: ReadonlyMap<string, VanillaScriptMatch>;
  readonly mdScriptsAvailable: boolean;
  readonly mdScripts: ReadonlyMap<string, VanillaScriptMatch>;
  readonly pageIdsAvailable: boolean;
  readonly pageIds: ReadonlyMap<string, VanillaPageMatch>;
}

export interface AdditiveGuardFinding {
  readonly severity: 'error';
  readonly code: AdditiveGuardFindingCode;
  readonly filePath: string;
  readonly line?: number;
  readonly sourceRef?: string;
  readonly vanillaTarget: string;
  readonly vanillaSources: readonly string[];
  readonly message: string;
}

export interface VanillaDiffHook {
  readonly filePath: string;
  readonly vanillaTarget: string;
  readonly vanillaSources: readonly string[];
  readonly isVanillaTarget: boolean;
  readonly op: 'add' | 'replace' | 'remove';
  readonly sel: string;
  readonly pos?: string;
  readonly attrType?: string;
  readonly line?: number;
  readonly additive: boolean;
}

export interface AdditiveGuardCoverageGap {
  readonly check: string;
  readonly filePath?: string;
  readonly reason: string;
}

export interface AdditiveGuardSummary {
  readonly vanillaFilesShadowed: number;
  readonly destructiveDiffOps: number;
  readonly reusedAiScriptNames: number;
  readonly reusedMdScriptNames: number;
  readonly reusedPageIds: number;
  readonly additiveDiffHooks: number;
  readonly totalDiffHooks: number;
}

export interface AdditiveGuardReport {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly findings: AdditiveGuardFinding[];
  readonly advisoryViolationsCount: number;
  readonly hooks: VanillaDiffHook[];
  readonly summary: AdditiveGuardSummary;
  readonly coverageGaps: AdditiveGuardCoverageGap[];
}

export interface AdditiveGuardProjectInput {
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly content?: string | null;
  }>;
}

export const EMPTY_VANILLA_ADDITIVE_INDEX: VanillaAdditiveIndex = {
  filesAvailable: false,
  files: new Map(),
  aiScriptsAvailable: false,
  aiScripts: new Map(),
  mdScriptsAvailable: false,
  mdScripts: new Map(),
  pageIdsAvailable: false,
  pageIds: new Map(),
};

const SHADOWED_VANILLA_DIRS = ['aiscripts/', 'md/', 'libraries/', 'index/', 'maps/'] as const;

export function normalizeAdditivePath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
}

function sniffRootTag(xml: string): string | null {
  const masked = xml
    .slice(0, 65536)
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\?[\s\S]*?\?>/g, ' ')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, ' ');
  const match = /<([A-Za-z_][\w.:-]*)/.exec(masked);
  return match ? match[1].toLowerCase() : null;
}

function parseXmlSafe(xml: string) {
  if (!xml.trim()) return null;
  try {
    const doc = new DOMParser({ onError: () => { /* handled upstream by xml_not_wellformed */ } }).parseFromString(xml, 'text/xml');
    return doc?.documentElement ? doc : null;
  } catch {
    return null;
  }
}

function elementLine(node: unknown): number | undefined {
  if (!node || typeof node !== 'object' || !('lineNumber' in node)) return undefined;
  const line = (node as { lineNumber?: unknown }).lineNumber;
  return typeof line === 'number' && Number.isInteger(line) && line > 0 ? line : undefined;
}

function canonicalPageId(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
}

function isShadowEligiblePath(relLower: string): boolean {
  return relLower.endsWith('.xml') && SHADOWED_VANILLA_DIRS.some(dir => relLower.startsWith(dir));
}

function isLocalizationPath(relLower: string): boolean {
  return /^t\/[^/]+\.xml$/.test(relLower);
}

function directChildElements(root: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (child && child.nodeType === 1) out.push(child as XmlElement);
  }
  return out;
}

function isAttributeAddOperation(attrType: string | undefined, sel: string): boolean {
  if (attrType && attrType.startsWith('@')) return true;
  return /\/@[A-Za-z_][\w.:-]*\s*$/.test(sel);
}

export function inspectWorkspaceDiffHooks(
  files: ReadonlyArray<{ readonly path: string; readonly content?: string | null }>,
  vanillaFiles?: ReadonlyMap<string, VanillaFileMatch>,
): VanillaDiffHook[] {
  const hooks: VanillaDiffHook[] = [];
  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const rel = normalizeAdditivePath(file.path);
    const relLower = rel.toLowerCase();
    if (!relLower.endsWith('.xml') || sniffRootTag(file.content) !== 'diff') continue;
    const doc = parseXmlSafe(file.content);
    if (!doc?.documentElement || doc.documentElement.tagName.toLowerCase() !== 'diff') continue;
    const match = vanillaFiles?.get(relLower);
    const vanillaTarget = match?.path ?? rel;
    const vanillaSources = match ? [...match.sources] : [];
    const isVanillaTarget = Boolean(match);
    for (const child of directChildElements(doc.documentElement)) {
      const opName = child.tagName.toLowerCase();
      if (opName !== 'add' && opName !== 'replace' && opName !== 'remove') continue;
      const sel = (child.getAttribute('sel') || '').trim();
      const pos = child.getAttribute('pos')?.trim() || undefined;
      const attrType = child.getAttribute('type')?.trim() || undefined;
      const line = elementLine(child);
      const additive = opName === 'add' && !isAttributeAddOperation(attrType, sel);
      hooks.push({
        filePath: rel,
        vanillaTarget,
        vanillaSources,
        isVanillaTarget,
        op: opName,
        sel,
        ...(pos ? { pos } : {}),
        ...(attrType ? { attrType } : {}),
        ...(line !== undefined ? { line } : {}),
        additive,
      });
    }
  }
  return hooks;
}

export function evaluateAdditiveOnlyGuard(input: {
  readonly project: AdditiveGuardProjectInput;
  readonly enforced: boolean;
  readonly vanillaIndex: VanillaAdditiveIndex;
}): AdditiveGuardReport {
  const { project, enforced, vanillaIndex } = input;
  const violations: AdditiveGuardFinding[] = [];
  const hooks: VanillaDiffHook[] = [];
  let vanillaFilesShadowed = 0;
  let destructiveDiffOps = 0;
  let reusedAiScriptNames = 0;
  let reusedMdScriptNames = 0;
  let reusedPageIds = 0;

  for (const file of project.files) {
    if (typeof file.content !== 'string') continue;
    const rel = normalizeAdditivePath(file.path);
    const relLower = rel.toLowerCase();
    if (!relLower.endsWith('.xml')) continue;
    const rootTag = sniffRootTag(file.content);

    // Check 1: Shadowed vanilla file (non-diff XML matching canonical path under 5 logic/data dirs).
    const vanillaFileMatch = vanillaIndex.files.get(relLower);
    if (isShadowEligiblePath(relLower) && rootTag !== 'diff' && vanillaIndex.filesAvailable && vanillaFileMatch) {
      const doc = parseXmlSafe(file.content);
      const line = doc?.documentElement ? elementLine(doc.documentElement) : 1;
      vanillaFilesShadowed++;
      violations.push({
        severity: 'error',
        code: 'additive.shadowed_vanilla_file',
        filePath: rel,
        ...(line !== undefined ? { line } : {}),
        sourceRef: rel,
        vanillaTarget: vanillaFileMatch.path,
        vanillaSources: [...vanillaFileMatch.sources],
        message: `${rel} is a full XML copy that shadows vanilla ${vanillaFileMatch.path} (${vanillaFileMatch.sources.join(', ')}). Replace it with an additive <diff> patch instead of overwriting vanilla.`,
      });
    }

    // Check 2: <diff> operations & Vanilla Diff Hooks report.
    if (rootTag === 'diff') {
      const fileHooks = inspectWorkspaceDiffHooks([{ path: rel, content: file.content }], vanillaIndex.files);
      for (const hook of fileHooks) {
        hooks.push(hook);
        if (hook.additive) continue;
        // When the vanilla file inventory is available and the path matches no vanilla target
        // (e.g. patching a companion extension's file), do not claim a vanilla overwrite.
        if (vanillaIndex.filesAvailable && !hook.isVanillaTarget) continue;
        destructiveDiffOps++;
        const sourceSuffix = hook.vanillaSources.length ? ` (${hook.vanillaSources.join(', ')})` : '';
        const selLabel = hook.sel || '(missing sel)';
        if (hook.op === 'replace') {
          violations.push({
            severity: 'error',
            code: 'additive.diff_replace_forbidden',
            filePath: rel,
            ...(hook.line !== undefined ? { line: hook.line } : {}),
            sourceRef: hook.sel || 'replace',
            vanillaTarget: hook.vanillaTarget,
            vanillaSources: hook.vanillaSources,
            message: `${rel}: <replace sel="${selLabel}"> overwrites vanilla ${hook.vanillaTarget}${sourceSuffix}. Additive-only mode only permits structural <add> hooks.`,
          });
        } else if (hook.op === 'remove') {
          violations.push({
            severity: 'error',
            code: 'additive.diff_remove_forbidden',
            filePath: rel,
            ...(hook.line !== undefined ? { line: hook.line } : {}),
            sourceRef: hook.sel || 'remove',
            vanillaTarget: hook.vanillaTarget,
            vanillaSources: hook.vanillaSources,
            message: `${rel}: <remove sel="${selLabel}"> deletes vanilla nodes from ${hook.vanillaTarget}${sourceSuffix}. Additive-only mode forbids destructive <remove> diffs.`,
          });
        } else {
          violations.push({
            severity: 'error',
            code: 'additive.diff_attribute_add_forbidden',
            filePath: rel,
            ...(hook.line !== undefined ? { line: hook.line } : {}),
            sourceRef: hook.attrType || hook.sel || 'add',
            vanillaTarget: hook.vanillaTarget,
            vanillaSources: hook.vanillaSources,
            message: `${rel}: <add${hook.attrType ? ` type="${hook.attrType}"` : ''} sel="${selLabel}"> mutates an attribute on vanilla ${hook.vanillaTarget}${sourceSuffix}. Only structural element <add> hooks are permitted.`,
          });
        }
      }
    }

    // Check 3: Reused vanilla aiscript / mdscript names on non-diff script files.
    if (relLower.startsWith('aiscripts/') && rootTag === 'aiscript') {
      const doc = parseXmlSafe(file.content);
      const rawName = doc?.documentElement?.getAttribute('name')?.trim() || '';
      const vanillaAi = rawName && vanillaIndex.aiScriptsAvailable
        ? vanillaIndex.aiScripts.get(rawName.toLowerCase())
        : undefined;
      if (vanillaAi) {
        const line = doc?.documentElement ? elementLine(doc.documentElement) : 1;
        reusedAiScriptNames++;
        violations.push({
          severity: 'error',
          code: 'additive.reused_vanilla_aiscript_name',
          filePath: rel,
          ...(line !== undefined ? { line } : {}),
          sourceRef: rawName,
          vanillaTarget: vanillaAi.path,
          vanillaSources: [vanillaAi.source],
          message: `${rel} declares <aiscript name="${rawName}">, which collides with vanilla AI script "${vanillaAi.name}" in ${vanillaAi.path} (${vanillaAi.source}). Rename the script or hook vanilla via <diff>.`,
        });
      }
    } else if (relLower.startsWith('md/') && rootTag === 'mdscript') {
      const doc = parseXmlSafe(file.content);
      const rawName = doc?.documentElement?.getAttribute('name')?.trim() || '';
      const vanillaMd = rawName && vanillaIndex.mdScriptsAvailable
        ? vanillaIndex.mdScripts.get(rawName.toLowerCase())
        : undefined;
      if (vanillaMd) {
        const line = doc?.documentElement ? elementLine(doc.documentElement) : 1;
        reusedMdScriptNames++;
        violations.push({
          severity: 'error',
          code: 'additive.reused_vanilla_mdscript_name',
          filePath: rel,
          ...(line !== undefined ? { line } : {}),
          sourceRef: rawName,
          vanillaTarget: vanillaMd.path,
          vanillaSources: [vanillaMd.source],
          message: `${rel} declares <mdscript name="${rawName}">, which collides with vanilla MD script "${vanillaMd.name}" in ${vanillaMd.path} (${vanillaMd.source}). Rename the script or hook vanilla via <diff>.`,
        });
      }
    }

    // Check 4: Language files (t/*.xml) must not reuse vanilla page IDs.
    if (isLocalizationPath(relLower) && vanillaIndex.pageIdsAvailable) {
      const doc = parseXmlSafe(file.content);
      if (doc) {
        const pages = doc.getElementsByTagName('page');
        for (let i = 0; i < pages.length; i++) {
          const pageEl = pages[i];
          const rawId = pageEl.getAttribute('id')?.trim() || '';
          if (!rawId) continue;
          const canonical = canonicalPageId(rawId);
          const vanillaPage = vanillaIndex.pageIds.get(canonical);
          if (!vanillaPage) continue;
          const line = elementLine(pageEl);
          reusedPageIds++;
          violations.push({
            severity: 'error',
            code: 'additive.reused_vanilla_page_id',
            filePath: rel,
            ...(line !== undefined ? { line } : {}),
            sourceRef: `page:${rawId}`,
            vanillaTarget: vanillaPage.path,
            vanillaSources: [vanillaPage.source],
            message: `${rel} defines <page id="${rawId}">, which collides with vanilla localization page ${vanillaPage.id} in ${vanillaPage.path} (${vanillaPage.source}). Allocate a mod-specific page ID.`,
          });
        }
      }
    }
  }

  const coverageGaps: AdditiveGuardCoverageGap[] = [];
  if (enforced) {
    if (!vanillaIndex.filesAvailable) {
      coverageGaps.push({
        check: 'additive.vanilla_files',
        reason: 'Vanilla file path index is unavailable; shadowed-vanilla-file detection did not run.',
      });
    }
    if (!vanillaIndex.aiScriptsAvailable) {
      coverageGaps.push({
        check: 'additive.vanilla_aiscripts',
        reason: 'Vanilla AI script name index is unavailable; reused aiscript name detection did not run.',
      });
    }
    if (!vanillaIndex.mdScriptsAvailable) {
      coverageGaps.push({
        check: 'additive.vanilla_mdscripts',
        reason: 'Vanilla MD script name index is unavailable; reused mdscript name detection did not run.',
      });
    }
    if (!vanillaIndex.pageIdsAvailable) {
      coverageGaps.push({
        check: 'additive.vanilla_text_pages',
        reason: 'Vanilla localization page index is unavailable; reused t-file page ID detection did not run.',
      });
    }
  }

  const additiveDiffHooks = hooks.filter(hook => hook.additive).length;
  const available = vanillaIndex.filesAvailable
    && vanillaIndex.aiScriptsAvailable
    && vanillaIndex.mdScriptsAvailable
    && vanillaIndex.pageIdsAvailable;

  return {
    enabled: enforced,
    available,
    findings: enforced ? violations : [],
    advisoryViolationsCount: violations.length,
    hooks,
    summary: {
      vanillaFilesShadowed,
      destructiveDiffOps,
      reusedAiScriptNames,
      reusedMdScriptNames,
      reusedPageIds,
      additiveDiffHooks,
      totalDiffHooks: hooks.length,
    },
    coverageGaps,
  };
}

export function toggleAdditiveOnlyInRulesJson(
  existingRaw: string | undefined,
  enabled: boolean,
): { readonly ok: true; readonly content: string } | { readonly ok: false; readonly error: string } {
  const defaultRules: Record<string, unknown> = {
    version: 1,
    additiveOnly: enabled,
    suppressions: [],
    contracts: {
      knownChains: [],
      wireKeys: [],
      expectedRegisters: [],
    },
  };
  const trimmed = typeof existingRaw === 'string' ? existingRaw.trim() : '';
  if (!trimmed) {
    return { ok: true, content: `${JSON.stringify(defaultRules, null, 2)}\n` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingRaw!);
  } catch (error) {
    return {
      ok: false,
      error: `Cannot toggle additiveOnly because forge.rules.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Cannot toggle additiveOnly because forge.rules.json must contain a JSON object.',
    };
  }
  const updated: Record<string, unknown> = {
    ...(parsed as Record<string, unknown>),
    additiveOnly: enabled,
  };
  return { ok: true, content: `${JSON.stringify(updated, null, 2)}\n` };
}
