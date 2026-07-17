/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project validation CORE — stage 2 of the server modularization, and stage 1 of
 * "the validation engine is the product" (2026-07-08 design review).
 *
 * One function, `runProjectValidation(project)`, owns the full validation layering
 * (structure → cue index → cross-file → XSD md/aiscript → aiscript order-param lint →
 * scriptproperty chains), so every consumer gets the SAME verdict:
 *   - POST /api/agent/project/validate (inline payload)     — server.ts route
 *   - POST /api/agent/project/validate { fromPath }         — server reads the mod
 *     folder itself (ROADMAP tool-improvement #6: no inline payload ceiling, no
 *     sandbox-mount staleness — host-disk truth)
 *   - scripts/x4validate.ts                                 — standalone CLI (CI-able)
 *
 * `loadProjectFromDisk` turns a real mod folder (workspace or LIVE extensions dir —
 * ROADMAP #5's "can't import the live mod" gap) into an ExtensionProject envelope.
 * Path containment (`isPathWithin`) is the security boundary for fromPath.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { compareModCopies, type DriftReport, type FileFingerprint } from "../lib/modDrift";
import { resolveXsdConfig } from "../lib/xsdParser";
import { discoverSchemaRegistry, expandIncludeChain } from "../lib/schemaRegistry";
import { validateRoutedFiles, type RoutedFileResult } from "../lib/schemaRouting";
import { buildSchemaIndex, validateXmlAgainstSchema, type XsdDiagnostic } from "../lib/xsdValidate";
import {
  classifyPath,
  indexCueReferences,
  validateProjectStructure,
  type ExtensionProject,
  type ProjectFile,
} from "../lib/extensionProject";
import { validateProjectCrossFile } from "../lib/projectCrossFileValidation";
import { lintScriptPropertyChains, type ScriptPropertyFinding } from "../lib/scriptProperties";
import { lintAiscriptOrderParams, type AiscriptLintFinding } from "../lib/aiscriptLint";
import { lintMdPitfalls, type MdPitfallFinding } from "../lib/mdPitfallLints";
import { getAiOrderParamTypes, getAiSchemaIndex, getScriptPropertyIndex } from "./validationRoutes";

/**
 * MD schema index (md.xsd + common.xsd from the configured schema dir).
 * B46P2: each root XSD is expanded through its transitive xs:include chain first —
 * the unpacked game's md/md.xsd is a zero-declaration include shim, and without the
 * expansion the whole real MD vocabulary (libraries/md.xsd) silently drops out.
 */
export function getSchemaIndex() {
  const resolved = resolveXsdConfig();
  const roots = [resolved.mdXsdPath, resolved.commonXsdPath].filter((p): p is string => !!p);
  const expanded = Array.from(new Set(roots.flatMap(p => expandIncludeChain(p))));
  return buildSchemaIndex(expanded.length ? expanded : roots);
}

export interface ProjectValidationReferences {
  macros?: Set<string>;
  wares?: Set<string>;
  factions?: Set<string>;
}

export interface ProjectValidationResult {
  ok: boolean;
  summary: {
    files: number;
    structuralErrors: number;
    definedCues: number;
    cueReferences: number;
    unresolvedCueRefs: number;
    crossFileErrors: number;
    mdLuaMissingRegisters: number;
    luaMdMissingListeners: number;
    schemaErrors: number;
    schemaWarnings: number;
    aiscriptErrors: number;
    scriptPropertyWarnings: number;
    mdPitfallWarnings: number;
  };
  structure: ReturnType<typeof validateProjectStructure>;
  cueIndex: ReturnType<typeof indexCueReferences>;
  crossFile: ReturnType<typeof validateProjectCrossFile>;
  schema: {
    mdAvailable: boolean;
    aiscriptAvailable: boolean;
    findings: XsdDiagnostic[];
    /** B46P2: which non-md/aiscripts files were routed to which game schema (honest reporting) */
    routed: Array<Pick<RoutedFileResult, "path" | "route" | "domainAvailable" | "severityCapped">>;
  };
  aiscript: { findings: AiscriptLintFinding[] };
  scriptProperties: { available: boolean; findings: ScriptPropertyFinding[] };
  pitfalls: { findings: MdPitfallFinding[] };
}

/**
 * The full validation layering. Each layer degrades honestly when its data source
 * is unavailable (`available:false`) — it never claims a check it didn't run.
 */
export function runProjectValidation(
  project: ExtensionProject,
  opts: { references?: ProjectValidationReferences } = {},
): ProjectValidationResult {
  const structure = validateProjectStructure(project);
  const cueIndex = indexCueReferences(project);
  const crossFile = validateProjectCrossFile(project);
  const structuralErrors = structure.filter(i => i.severity === "error").length;

  const schemaFindings: XsdDiagnostic[] = [];
  let mdSchemaAvailable = false;
  let aiSchemaAvailable = false;
  let aiIndexRef: ReturnType<typeof getAiSchemaIndex> = null;
  try {
    const mdIndex = getSchemaIndex();
    mdSchemaAvailable = !!mdIndex.loaded && mdIndex.elements.size > 0;
    if (mdSchemaAvailable) {
      for (const f of project.files) {
        if ((f.kind === "md" || classifyPath(f.path) === "md") && typeof f.content === "string") {
          schemaFindings.push(...validateXmlAgainstSchema(f.content, mdIndex, {
            filePath: f.path, domain: "mission_director", reportUnknownElements: true, references: opts.references,
          }));
        }
      }
    }
    aiIndexRef = getAiSchemaIndex();
    aiSchemaAvailable = !!aiIndexRef?.loaded;
    if (aiIndexRef && aiSchemaAvailable) {
      for (const f of project.files) {
        if ((f.kind === "aiscript" || classifyPath(f.path) === "aiscript") && typeof f.content === "string") {
          schemaFindings.push(...validateXmlAgainstSchema(f.content, aiIndexRef, {
            filePath: f.path, domain: "ai_scripts", reportUnknownElements: true, references: opts.references,
          }));
        }
      }
    }
  } catch { /* schema layer unavailable — reported via available flags */ }

  // B46P2: route the non-md/aiscripts subset (factions/gamestarts/wares/jobs/ui/t + diff
  // patches) to their real game schemas via the phase-1 registry. Degrades to an empty
  // route list on schema-less instances — never wrong-schema noise.
  let routed: RoutedFileResult[] = [];
  try {
    const resolved = resolveXsdConfig();
    const registry = (resolved.schemaDir || resolved.x4GamePath)
      ? discoverSchemaRegistry(resolved.schemaDir, resolved.x4GamePath || undefined)
      : null;
    routed = validateRoutedFiles(
      project.files.filter(f => typeof f.content === "string").map(f => ({ path: f.path, content: f.content as string })),
      registry,
      { references: opts.references },
    );
    for (const r of routed) schemaFindings.push(...r.findings);
  } catch { /* routing degrades silently; md/aiscripts layers already reported */ }

  const aiscriptLint: AiscriptLintFinding[] = [];
  try {
    const legalTypes = getAiOrderParamTypes(aiIndexRef);
    for (const f of project.files) {
      if ((f.kind === "aiscript" || classifyPath(f.path) === "aiscript") && typeof f.content === "string") {
        aiscriptLint.push(...lintAiscriptOrderParams(f.content, legalTypes));
      }
    }
  } catch { /* lint is pure; only reachable on truly malformed input */ }

  const scriptPropertyFindings: ScriptPropertyFinding[] = [];
  const spIndex = getScriptPropertyIndex();
  if (spIndex) {
    for (const f of project.files) {
      const k = f.kind || classifyPath(f.path);
      if ((k === "md" || k === "aiscript") && typeof f.content === "string") {
        scriptPropertyFindings.push(...lintScriptPropertyChains(f.content, spIndex, { filePath: f.path }));
      }
    }
  }

  // Corpus-grounded MD pitfall lints (dead UI listeners, offer-accept keyword refs,
  // param3 bare-key reads). Union-aware where the scriptproperty index is available.
  const pitfallFindings: MdPitfallFinding[] = [];
  for (const f of project.files) {
    if ((f.kind === "md" || classifyPath(f.path) === "md") && typeof f.content === "string") {
      pitfallFindings.push(...lintMdPitfalls(f.content, { propertyUnion: spIndex?.union, filePath: f.path }));
    }
  }

  const schemaErrors = schemaFindings.filter(d => d.severity === "error").length;
  const aiscriptErrors = aiscriptLint.filter(d => d.severity === "error").length;
  return {
    ok: structuralErrors === 0 && cueIndex.unresolved.length === 0 && crossFile.ok
      && schemaErrors === 0 && aiscriptErrors === 0,
    summary: {
      files: project.files.length,
      structuralErrors,
      definedCues: cueIndex.defined.length,
      cueReferences: cueIndex.references.length,
      unresolvedCueRefs: cueIndex.unresolved.length,
      crossFileErrors: crossFile.summary.errors,
      mdLuaMissingRegisters: crossFile.summary.mdLuaMissingRegisters,
      luaMdMissingListeners: crossFile.summary.luaMdMissingListeners,
      schemaErrors,
      schemaWarnings: schemaFindings.filter(d => d.severity === "warning").length,
      aiscriptErrors,
      scriptPropertyWarnings: scriptPropertyFindings.length,
      mdPitfallWarnings: pitfallFindings.length,
    },
    structure,
    cueIndex,
    crossFile,
    schema: {
      mdAvailable: mdSchemaAvailable,
      aiscriptAvailable: aiSchemaAvailable,
      findings: schemaFindings,
      routed: routed.map(({ path: p, route, domainAvailable, severityCapped }) => ({ path: p, route, domainAvailable, severityCapped })),
    },
    aiscript: { findings: aiscriptLint },
    scriptProperties: { available: !!spIndex, findings: scriptPropertyFindings },
    pitfalls: { findings: pitfallFindings },
  };
}

/* ------------------------------------------------------------------ *
 * Disk loading (fromPath / CLI).
 * ------------------------------------------------------------------ */

// B46P2: ui/**/*.xml added — ui addon documents now route to addon/coreaddon.xsd.
const LOADABLE_RE = /^(content\.xml|md\/[^/]+\.xml|aiscripts\/[^/]+\.xml|t\/[^/]+\.xml|libraries\/[^/]+\.xml|ui\/.+\.xml|(?:ui|lua|subst_lua)\/.+\.lua|[^/]+\.lua)$/i;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface DiskProjectLoad {
  project: ExtensionProject;
  root: string;
  loaded: string[];
  skipped: { path: string; reason: string }[];
}

/** Build an ExtensionProject from a real mod folder (workspace or live extensions dir). */
export function loadProjectFromDisk(rootDir: string, id?: string): DiskProjectLoad {
  const root = path.resolve(rootDir);
  const loaded: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const files: ProjectFile[] = [];

  const walk = (dir: string) => {
    if (files.length >= MAX_FILES) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= MAX_FILES) return;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      if (!LOADABLE_RE.test(rel)) continue;
      let statSize = 0;
      try { statSize = fs.statSync(abs).size; } catch { continue; }
      if (statSize > MAX_FILE_BYTES) { skipped.push({ path: rel, reason: `file exceeds ${MAX_FILE_BYTES} bytes` }); continue; }
      try {
        const content = fs.readFileSync(abs, "utf8");
        files.push({ path: rel, kind: classifyPath(rel), content });
        loaded.push(rel);
      } catch (err) {
        skipped.push({ path: rel, reason: String(err instanceof Error ? err.message : err) });
      }
    }
  };
  walk(root);

  const projectId = id || path.basename(root);
  return { project: { id: projectId, name: projectId, files }, root, loaded, skipped };
}

// NOTE: fromPath → folder resolution reuses server.ts's existing `resolveModFolder`
// (modWorkspacePath + filesystemPath roots, containment-guarded) — no duplicate here.

/* ------------------------------------------------------------------ *
 * Drift detection (workspace copy vs deployed copy) — first-class state.
 * ------------------------------------------------------------------ */

const DRIFT_SKIP_DIRS = new Set([".git", ".snapshots", "node_modules", "__pycache__", ".forgekeep"]);
const DRIFT_MAX_FILES = 800;
const DRIFT_MAX_FILE_BYTES = 8 * 1024 * 1024;

/** sha1-fingerprint every regular file in a mod folder (bounded; skips VCS/cache dirs). */
export function fingerprintModFolder(rootDir: string): FileFingerprint[] {
  const root = path.resolve(rootDir);
  const out: FileFingerprint[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || out.length >= DRIFT_MAX_FILES) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= DRIFT_MAX_FILES) return;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!DRIFT_SKIP_DIRS.has(e.name.toLowerCase())) walk(abs, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      try {
        const stat = fs.statSync(abs);
        if (stat.size > DRIFT_MAX_FILE_BYTES) continue;
        const hash = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
        out.push({ path: path.relative(root, abs).replace(/\\/g, "/"), hash, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch { /* unreadable file — skip */ }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Compare the workspace and deployed copies of a mod folder. Returns null when the mod
 * doesn't exist in BOTH roots (nothing to compare — that's not drift, that's absence).
 */
export function computeModDrift(modFolderName: string): DriftReport | null {
  const name = String(modFolderName || "").trim();
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  const resolved = resolveXsdConfig();
  const wsRoot = resolved.modWorkspacePath;
  const depRoot = resolved.filesystemPath;
  if (!wsRoot || !depRoot || path.resolve(wsRoot) === path.resolve(depRoot)) return null;
  const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const a = path.join(wsRoot, name);
  const b = path.join(depRoot, name);
  if (!isDir(a) || !isDir(b)) return null;
  return compareModCopies(fingerprintModFolder(a), fingerprintModFolder(b), "workspace", "deployed");
}
