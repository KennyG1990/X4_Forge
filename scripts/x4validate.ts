/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * x4validate — standalone CLI for the X4 Forge validation engine.
 * "Engine as the product" stage 1 (2026-07-08 design review): the deterministic
 * checker usable WITHOUT opening the Forge UI — from a terminal, a CI job, or
 * another tool. Same engine stack as POST /api/agent/project/validate.
 *
 * Usage:
 *   npm run validate:mod -- "<MODS_ROOT>\x4_ai_influence"
 *   npm run validate:mod -- --unpacked "<X4_UNPACKED>" "<mod folder>" --format json
 *
 * Exit codes: 0 = passed, 1 = failed validation gate, 2 = usage/load failure.
 *
 * Honesty notes:
 * - Runs full game-object reference checks (macros/wares/factions/sectors/aiscripts/orders)
 *   plus jobs/wares vocabularies whenever an unpacked X4 corpus is configured via
 *   --unpacked, X4_REFERENCE_ROOT, or config.json; when unconfigured, reports
 *   explicitly that game-object reference checks did not run.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { dataPath } from "../src/lib/dataDir";
import { resolveXsdConfig } from "../src/lib/xsdParser";
import {
  flattenProjectValidation,
  loadProjectFromDisk,
  runProjectValidation,
  type FlatProjectDiagnostic,
  type ProjectValidationReferences,
  type ProjectValidationResult,
} from "../src/server/projectValidation";
import {
  readCanonicalMdProviderCatalog,
  readCanonicalMdProviderGeneration,
  type CanonicalMdCatalog,
  type CanonicalMdProvider,
} from "../src/lib/canonicalMdProviderCatalog";
import { getReferenceCorpus } from "../src/lib/referenceCorpus";
import { exportReferenceOverlayCache, seedReferenceOverlayCache } from "../src/lib/referenceOverlay";
import { learnJobsVocabulary, type JobsVocabulary } from "../src/lib/jobsContentLint";
import { learnWaresVocabulary, type WaresVocabulary } from "../src/lib/waresContentLint";
import { isMdReferenceCoverageCheck } from "../src/lib/mdEffectiveLibraryPurpose";
import { buildValidationEvidence, MD_INITIAL_STATE_COVERAGE_CHECK, sourceInventoryGaps } from "../src/lib/validationEvidence";
import { computeXmlQuickFixes } from "../vscode-extension/src/x4IdeFeatures";
import { getSchemaIndex } from "../src/server/projectValidation";
import {
  renderValidationReport,
  safeValidationLog,
  stringifyValidationJson,
  validationSeverity,
  type ValidationReportFormat,
  type ValidationSeverity,
} from "./x4validate-report";

interface CachedCliCorpusPayload {
  version: 1;
  root: string;
  mdGeneration: string;
  libSignature: string;
  logicalPaths: number;
  providers: Array<[string, CanonicalMdProvider | null]>;
  references: {
    macros: string[];
    wares: string[];
    factions: string[];
    sectors: string[];
    aiScripts: string[];
    orders: string[];
  };
  jobsVocabulary: {
    classes: string[];
    orders: string[];
    sizes: string[];
    factions: string[];
  } | null;
  waresVocabulary: {
    transports: string[];
    groups: string[];
    tags: string[];
  } | null;
}

function computeLibSignature(refRoot: string): string {
  const candidates = [
    "libraries/wares.xml",
    "libraries/jobs.xml",
    "libraries/factions.xml",
    "libraries/scriptproperties.xml",
    "index/macros.xml",
  ];
  return candidates
    .map(rel => {
      try {
        const st = fs.statSync(path.join(refRoot, ...rel.split("/")));
        return `${rel}:${st.size}:${st.mtimeMs}`;
      } catch {
        return `${rel}:absent`;
      }
    })
    .join("|");
}

function loadOrBuildCliCorpus(refRoot: string): {
  catalog?: Extract<CanonicalMdCatalog, { status: "ready" }>;
  references?: ProjectValidationReferences;
  jobsVocabulary?: JobsVocabulary;
  waresVocabulary?: WaresVocabulary;
} {
  if (!refRoot || !fs.existsSync(refRoot)) return {};
  const resolvedRoot = path.resolve(refRoot);
  const mdGen = readCanonicalMdProviderGeneration(resolvedRoot);
  const libSig = computeLibSignature(resolvedRoot);
  const cacheFile = dataPath("x4validate-corpus-cache.json");

  if (mdGen) {
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as CachedCliCorpusPayload;
        if (
          raw.version === 1 &&
          raw.root.toLowerCase() === mdGen.root.toLowerCase() &&
          raw.mdGeneration === mdGen.generation &&
          raw.libSignature === libSig
        ) {
          const catalog: Extract<CanonicalMdCatalog, { status: "ready" }> = {
            status: "ready",
            root: raw.root,
            generation: raw.mdGeneration,
            logicalPaths: raw.logicalPaths,
            providers: new Map(raw.providers),
          };
          const references: ProjectValidationReferences = {
            macros: new Set(raw.references.macros),
            wares: new Set(raw.references.wares),
            factions: new Set(raw.references.factions),
            sectors: new Set(raw.references.sectors),
            aiScripts: new Set(raw.references.aiScripts),
            orders: new Set(raw.references.orders),
          };
          const jobsVocabulary: JobsVocabulary | undefined = raw.jobsVocabulary
            ? {
                classes: new Set(raw.jobsVocabulary.classes),
                orders: new Set(raw.jobsVocabulary.orders),
                sizes: new Set(raw.jobsVocabulary.sizes),
                factions: new Set(raw.jobsVocabulary.factions),
              }
            : undefined;
          const waresVocabulary: WaresVocabulary | undefined = raw.waresVocabulary
            ? {
                transports: new Set(raw.waresVocabulary.transports),
                groups: new Set(raw.waresVocabulary.groups),
                tags: new Set(raw.waresVocabulary.tags),
              }
            : undefined;
          return { catalog, references, jobsVocabulary, waresVocabulary };
        }
      }
    } catch {
      /* rebuild cache on corrupt or stale payload */
    }
  }

  const catRes = readCanonicalMdProviderCatalog(resolvedRoot);
  const catalog = catRes.status === "ready" ? catRes : undefined;
  let references: ProjectValidationReferences | undefined;
  let jobsVocabulary: JobsVocabulary | undefined;
  let waresVocabulary: WaresVocabulary | undefined;

  try {
    const corpus = getReferenceCorpus(resolvedRoot);
    const orders = new Set<string>();
    for (const s of corpus.aiScripts) {
      if (s.order?.id) orders.add(s.order.id.toLowerCase());
    }
    references = {
      macros: corpus.references.macros,
      wares: corpus.references.wares,
      factions: corpus.references.factions,
      sectors: corpus.references.sectors,
      aiScripts: corpus.references.aiScripts,
      orders,
    };
    const jobsPath = path.join(resolvedRoot, "libraries", "jobs.xml");
    if (fs.existsSync(jobsPath)) {
      jobsVocabulary = learnJobsVocabulary(fs.readFileSync(jobsPath, "utf8"), corpus.references.factions);
    }
    const waresPath = path.join(resolvedRoot, "libraries", "wares.xml");
    if (fs.existsSync(waresPath)) {
      waresVocabulary = learnWaresVocabulary(fs.readFileSync(waresPath, "utf8"));
    }

    if (catalog && references) {
      const payload: CachedCliCorpusPayload = {
        version: 1,
        root: catalog.root,
        mdGeneration: catalog.generation,
        libSignature: libSig,
        logicalPaths: catalog.logicalPaths,
        providers: [...catalog.providers.entries()],
        references: {
          macros: [...(references.macros || [])],
          wares: [...(references.wares || [])],
          factions: [...(references.factions || [])],
          sectors: [...(references.sectors || [])],
          aiScripts: [...(references.aiScripts || [])],
          orders: [...(references.orders || [])],
        },
        jobsVocabulary: jobsVocabulary
          ? {
              classes: [...jobsVocabulary.classes],
              orders: [...jobsVocabulary.orders],
              sizes: [...jobsVocabulary.sizes],
              factions: [...(jobsVocabulary.factions || [])],
            }
          : null,
        waresVocabulary: waresVocabulary
          ? {
              transports: [...waresVocabulary.transports],
              groups: [...waresVocabulary.groups],
              tags: [...waresVocabulary.tags],
            }
          : null,
      };
      try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        const tmpFile = `${cacheFile}.${process.pid}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf8");
        fs.renameSync(tmpFile, cacheFile);
      } catch {
        /* non-fatal if data dir is read-only */
      }
    }
  } catch {
    /* corpus partially unavailable; degrade gracefully */
  }

  return { catalog, references, jobsVocabulary, waresVocabulary };
}

function applyPreferredFixesToMod(targetDir: string): number {
  const load = loadProjectFromDisk(targetDir);
  const mdIdx = getSchemaIndex();
  const knownElements = mdIdx.loaded ? [...mdIdx.elements.keys()] : [];
  let fixedCount = 0;

  for (const file of load.project.files) {
    if (typeof file.content !== "string" || !/\.xml$/i.test(file.path)) continue;
    if (!/(^|\/)(md|aiscripts)\//i.test(file.path.replace(/\\/g, "/"))) continue;
    let updated = file.content;
    const tagRe = /<([A-Za-z_][\w.:-]*)\b/g;
    const pendingEdits: Array<{ start: number; end: number; newText: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(updated)) !== null) {
      const tag = m[1].toLowerCase();
      if (knownElements.includes(tag)) continue;
      const qf = computeXmlQuickFixes(updated, m.index + 1, { knownElements });
      const pref = qf.find(f => f.preferred);
      if (pref) {
        pendingEdits.push(...pref.edits);
      }
    }
    if (pendingEdits.length > 0) {
      const dedup = new Map<string, { start: number; end: number; newText: string }>();
      for (const e of pendingEdits) dedup.set(`${e.start}:${e.end}`, e);
      for (const e of [...dedup.values()].sort((a, b) => b.start - a.start)) {
        updated = updated.slice(0, e.start) + e.newText + updated.slice(e.end);
        fixedCount++;
      }
      const absFile = path.join(targetDir, ...file.path.replace(/\\/g, "/").split("/"));
      fs.writeFileSync(absFile, updated, "utf8");
    }
  }
  return fixedCount;
}

function printUsage() {
  console.log([
    "x4validate — deterministic X4 mod validation (X4 Forge engine, no UI).",
    "",
    "Usage:  npm run validate:mod -- \"<mod folder>\" [--json]",
    "        npm run validate:mod -- [--unpacked \"<dir>\"] [--game \"<dir>\"] [--fix] \"<mod folder>\" --format text|json|sarif|github [--fail-on error|warning|info|hint]",
    "",
    "Runs: structure, cue references (cross-file + canonical corpus), MD<->Lua event wiring,",
    "XSD validation (md.xsd + aiscripts.xsd + schema-named libraries), aiscript/order lint,",
    "scriptproperty chain lint, jobs/wares/factions/t-file content lints, game-object",
    "reference checks, and exact root forge.rules.json v1 contracts/suppressions.",
    "",
    "Exit codes: 0 passed | 1 failed validation gate | 2 usage/load failure",
  ].join("\n"));
}

function main(): number {
  const { values, positionals, tokens } = parseArgs({
    allowPositionals: true,
    tokens: true,
    options: {
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      format: { type: "string" },
      "fail-on": { type: "string" },
      unpacked: { type: "string" },
      game: { type: "string" },
      extensions: { type: "string", multiple: true },
      fix: { type: "boolean" },
    },
  });
  if (values.help) { printUsage(); return 0; }
  if (positionals.length > 1 || (values.json && values.format !== undefined)
    || tokens.filter(token => token.kind === "option" && token.name === "format").length > 1) {
    throw new Error("Choose one mod folder and at most one output format.");
  }
  if (values.format !== undefined && !["text", "json", "sarif", "github"].includes(values.format)) {
    throw new Error("--format must be text, json, sarif, or github.");
  }
  const threshold = values["fail-on"] ?? "error";
  if (!Object.hasOwn(validationSeverity, threshold)
    || tokens.filter(token => token.kind === "option" && token.name === "fail-on").length > 1) {
    throw new Error("Use --fail-on at most once with error, warning, info, or hint.");
  }
  if (!positionals.length) { printUsage(); return 2; }

  if (values.unpacked) process.env.X4_REFERENCE_ROOT = path.resolve(values.unpacked);
  if (values.game) process.env.X4_GAME_PATH = path.resolve(values.game);

  const target = path.resolve(positionals[0]);
  if (values.fix) {
    applyPreferredFixesToMod(target);
  }

  const load = loadProjectFromDisk(target);
  if (!load.project.files.length) {
    console.error(`No loadable mod files found under: ${safeValidationLog(target)}`);
    console.error("Expected an extension folder containing content.xml / md/*.xml / aiscripts/*.xml / *.lua");
    return 2;
  }

  const resolvedCfg = resolveXsdConfig();
  const cliCorpus = loadOrBuildCliCorpus(resolvedCfg.x4ReferenceRoot);
  const overlayCacheFile = dataPath("x4validate-overlay-cache.json");
  let initialOverlayCount = 0;
  try {
    if (fs.existsSync(overlayCacheFile)) {
      const saved = JSON.parse(fs.readFileSync(overlayCacheFile, "utf8"));
      if (Array.isArray(saved)) {
        seedReferenceOverlayCache(saved);
        initialOverlayCount = saved.length;
      }
    }
  } catch { /* rebuild overlay cache on corrupt payload */ }

  const result = runProjectValidation(load.project, {
    references: cliCorpus.references,
    jobsVocabulary: cliCorpus.jobsVocabulary,
    waresVocabulary: cliCorpus.waresVocabulary,
    canonicalMd: {
      skippedFiles: load.skipped,
      read(root) {
        if (cliCorpus.catalog && path.resolve(root).toLowerCase() === path.resolve(cliCorpus.catalog.root).toLowerCase()) {
          return cliCorpus.catalog;
        }
        const catalog = readCanonicalMdProviderCatalog(root);
        return catalog.status === "ready" ? catalog : undefined;
      },
    },
  });
  try {
    const exported = exportReferenceOverlayCache();
    if (exported.length > initialOverlayCount) {
      fs.mkdirSync(path.dirname(overlayCacheFile), { recursive: true });
      const tmpOverlay = `${overlayCacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmpOverlay, JSON.stringify(exported), "utf8");
      fs.renameSync(tmpOverlay, overlayCacheFile);
    }
  } catch { /* non-fatal if data dir is read-only */ }
  const flat = flattenProjectValidation(result);
  const failOn = threshold as ValidationSeverity;
  const gated = values.format !== undefined || values["fail-on"] !== undefined;
  const passed = result.ok && (!gated || !flat.some(finding => validationSeverity[finding.severity] >= validationSeverity[failOn]));

  const evidence = load.skipped.length || !result.evidence ? buildValidationEvidence(load.project, flat, [
    ...(result.evidence?.coverage.gaps || []),
    ...sourceInventoryGaps(load.skipped),
  ]) : result.evidence;
  const cliLimitations = cliCorpus.references ? [] : ["Game-object reference checks require an unpacked corpus or the Forge backend."];
  if (values.format !== undefined) {
    console.log(renderValidationReport(values.format as ValidationReportFormat, target, load.loaded, evidence, result.ok, passed, failOn, cliLimitations));
  } else if (values.json) {
    console.log(stringifyValidationJson({ target, loaded: load.loaded, skipped: load.skipped, ...result, evidence, flat }, 2));
  } else {
    printHumanReport(target, load.project.id, load.skipped.length, result, flat, Boolean(cliCorpus.references));
    if (values["fail-on"] !== undefined) console.log(`Severity gate (${failOn}): ${passed ? "PASS" : "FAIL"}`);
  }
  return passed ? 0 : 1;
}

function printHumanReport(target: string, id: string, skipped: number, result: ProjectValidationResult, flat: FlatProjectDiagnostic[], hasReferences: boolean): void {
  const logText = process.env.GITHUB_ACTIONS === "true" ? safeValidationLog : (value: string) => value;
  const s = result.summary;
  console.log(`\nX4 Forge validate — ${logText(id)}`);
  console.log(`Folder: ${logText(target)}`);
  console.log(`Files:  ${s.files} loaded${skipped ? ` (${skipped} skipped)` : ""}`);
  console.log("");
  console.log(`Verdict: ${result.ok ? "VALID (no errors)" : "ERRORS FOUND"}`);
  console.log(`  structural errors:          ${s.structuralErrors}`);
  console.log(`  unresolved cue refs:        ${s.unresolvedCueRefs}`);
  console.log(`  cross-file errors:          ${s.crossFileErrors} (missing Lua registers: ${s.mdLuaMissingRegisters}, missing MD listeners: ${s.luaMdMissingListeners})`);
  console.log(`  schema errors/warnings:     ${s.schemaErrors}/${s.schemaWarnings} (md schema: ${result.schema.mdAvailable ? "loaded" : "UNAVAILABLE"}, aiscripts schema: ${result.schema.aiscriptAvailable ? "loaded" : "UNAVAILABLE"})`);
  console.log(`  aiscript lint errors:       ${s.aiscriptErrors}`);
  console.log(`  Lua errors/warnings:        ${s.luaErrors}/${s.luaWarnings}`);
  console.log(`  X4 UI errors/warnings:      ${s.x4UiErrors}/${s.x4UiWarnings} (unverified: ${s.x4UiUnverified}, truncated: ${s.x4UiTruncated})`);
  console.log(`  MD pitfall errors/warnings: ${s.mdPitfallErrors}/${s.mdPitfallWarnings}`);
  console.log(`  scriptproperty warnings:    ${s.scriptPropertyWarnings} (index: ${result.scriptProperties.available ? "loaded" : "UNAVAILABLE"})`);
  console.log(`  reference warnings:         ${s.referenceWarnings} (corpus: ${hasReferences ? "loaded" : "UNAVAILABLE"})`);
  console.log(`  active/raw warnings:        ${s.activeWarnings}/${s.rawWarnings} (${s.suppressedWarnings} suppressed by reviewed project rules)`);
  console.log(`  project-rules errors:       ${s.rulesErrors} (forge.rules.json: ${result.rules.present ? (result.rules.valid ? `v${result.rules.version} valid` : "INVALID") : "not present"})`);
  if (!hasReferences) {
    console.log("  note: pass --unpacked <folder> or set X4_REFERENCE_ROOT to enable game-object reference checks.");
  }

  const lines = flat.map(f =>
    `[${f.severity}] ${f.code || "validation"}: ${f.message}${f.filePath ? ` (${f.filePath}${f.line ? `:${f.line}` : ""})` : ""}`,
  );
  const mdCoverageGaps = result.evidence?.coverage.gaps.filter(gap =>
    isMdReferenceCoverageCheck(gap.check) || gap.check === MD_INITIAL_STATE_COVERAGE_CHECK) ?? [];

  if (lines.length) {
    console.log(`\nFindings (${lines.length}):`);
    for (const l of lines) console.log("  " + logText(l));
  } else {
    console.log(mdCoverageGaps.length ? "\nNo findings from completed checks." : "\nNo findings.");
  }

  if (mdCoverageGaps.length) {
    console.log("\nMD coverage incomplete:");
    for (const gap of mdCoverageGaps) {
      const position = gap.line === undefined ? "" : `:${gap.line}${gap.column === undefined ? "" : `:${gap.column}`}`;
      const location = gap.filePath ? `${gap.filePath}${position}: ` : "";
      console.log(`  ${logText(`[${gap.check}] ${location}${gap.reason}`)}`);
    }
  }
}

try { process.exitCode = main(); }
catch (error) {
  console.error(`x4validate: ${safeValidationLog(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 2;
}
