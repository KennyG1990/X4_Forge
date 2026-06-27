/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createEmptySchemaLibrary, loadSchemaLibrary, readXsdConfig, resolveXsdConfig, writeXsdConfig } from "./src/lib/xsdParser";

// Import types & helpers from the frontend shared file
import {
  generateMDXML,
  generateUIIndexXML,
  generateUILuaScript,
  validateModWorkspace,
  X4_FACTIONS,
  X4_SHIP_MACROS,
  X4_STATION_MACROS,
  X4_SOUND_EFFECTS,
  NODE_TEMPLATES,
  PRESETS,
  ModWorkspace,
  PatchBlock,
  sanitizeWorkspace,
  type AIBehaviorScript
} from "./src/types";
import {
  toSafeModId,
  toTFileName,
  generateContentXML,
  compileScriptToXML,
  namespaceAiScriptName,
  compileWaresXML,
  compileJobsXML,
  compileTFileXML,
  compileDiffDocument
} from "./src/lib/modCompiler";
import { runModDoctor } from "./src/lib/modDoctor";
import { buildX4ObjectIndex, filterX4ObjectIndex, runObjectIndexSelftest, type X4ObjectIndex } from "./src/lib/x4ObjectIndex";
import { runProposalReviewSelftest } from "./src/lib/proposalReview";
import { runIntentCheckSelftest, type IntentRequirement, type IntentCheckSpec } from "./src/lib/intentCheck";
import { runBlueprintSelftest } from "./src/lib/modBlueprint";
import { runArchitectLoopSelftest } from "./src/lib/architectLoop";
import { runCanvasInteractionSelftest } from "./src/lib/canvasInteractions";
import { runLiveLogNavSelftest } from "./src/lib/liveLogNav";
import { runWaresJobsRoundtripSelftest, parseWaresXml, parseJobsXml } from "./src/lib/waresJobsParser";
import { runModFixesSelftest } from "./src/lib/modFixes";
import { runAiScriptRoundtripSelftest, parseAiScriptXml } from "./src/lib/aiScriptParser";
import { runLuaMdBindingSelftest } from "./src/lib/luaMdBinding";
import { runPositionPickerSelftest } from "./src/lib/positionPicker";
import { debugScan as catDatDebugScan, extractBaseGameFile as catDatExtractBaseGameFile, extractEntries as catDatExtractEntries, findCatDatArchives, parseCat, readEntryText, runCatDatSelftest } from "./src/lib/x4CatDat";
import { buildSchemaIndex, validateXmlAgainstSchema, type SchemaIndex } from "./src/lib/xsdValidate";
import { parseXMLToWorkspace, extractTopLevelCueXml } from "./src/lib/xmlParser";
import type { SchemaLibrary } from "./src/lib/schemaTypes";
import { generateHttpGlueLua, generateContractMdScript, validateContract, runContractGlueSelftest, type IntegrationContract } from "./src/lib/contractGlue";
import { runFileBridgeTransportSelftest } from "./src/lib/fileBridgeTransport";
import { LUA_SNIPPETS, runLuaSnippetSelftest } from "./src/lib/luaSnippets";
import { runLuaLogicBlocksSelftest } from "./src/lib/luaLogicBlocks";
import { analyzeLuaFiles, runLuaStaticAnalysisSelftest, type LuaFileInput } from "./src/lib/luaStaticAnalysis";
import { runLuaRuntimeLogSelftest } from "./src/lib/luaRuntimeLog";
import { runCueLineageSelftest } from "./src/lib/cueLineage";
import { runSemanticsSelftest, listSemantics, semanticsForNode } from "./src/lib/mdSemantics";
import { runExplainSelftest, explainWorkspace } from "./src/lib/mdExplain";
import { runCriticSelftest, critiqueWorkspace } from "./src/lib/mdCritic";
import { runXmlWellformedSelftest, checkXmlWellformed } from "./src/lib/xmlWellformed";
import { runVanillaUiReferenceSelftest, profileMenuLua, deriveSchemaEvidence } from "./src/lib/vanillaUiReference";
import { runSimulateSelftest, simulateWorkspace } from "./src/lib/mdSimulate";
import { runPortSemanticsSelftest } from "./src/lib/portSemantics";
import { runFriendlyNamesSelftest } from "./src/lib/mdFriendlyNames";
import { runCompileSelftest } from "./src/lib/mdCompileSelftest";
import { runModTemplatesSelftest } from "./src/lib/modTemplates";
import { runCompositeBlocksSelftest } from "./src/lib/compositeBlocks";
import { runAutoLayoutSelftest } from "./src/lib/mdAutoLayout"; // port-semantics layer (50th pass)
import { validateNodesAgainstSchema, summarizeByNode, runNodeDiagnosticsSelftest, type NodeSchemaView } from "./src/lib/nodeDiagnostics";
import { runNodeAlignSelftest } from "./src/lib/nodeAlign";
import { runLiveFixesSelftest } from "./src/lib/liveFixes";
import { runLogTelemetrySelftest, parseLogTelemetry } from "./src/lib/logTelemetry";
import { runUiWidgetValidateSelftest } from "./src/lib/uiWidgetValidate";
import { runUILayoutSelftest } from "./src/lib/uiLayout";
import { analyzeOverrides, runOverrideMapSelftest, simulateLoadOrder } from "./src/lib/overrideMap";
import { analyzeModDependencies, runModDependencyGraphSelftest, parseModManifest, type ModManifest } from "./src/lib/modDependencyGraph";
import { buildMergedGalaxyMap, runGalaxyMapSelftest, type GalaxyMapSource } from "./src/lib/galaxyMap";
import { runExtensionProjectSelftest, validateProjectStructure, indexCueReferences, buildContentXml, type ExtensionProject } from "./src/lib/extensionProject";
import { createAgentProject, createProjectFile, generateAgentProject, packageAgentProject, runProjectOrchestrationSelftest } from "./src/lib/projectOrchestration";
import { runProjectCrossFileSelftest, validateProjectCrossFile } from "./src/lib/projectCrossFileValidation";
import {
  runExternalApiRegistrySelftest,
  EXTERNAL_API_REGISTRY,
  validateApiDefinition,
  mergeRegistries,
  setActiveRegistry,
  getActiveRegistry,
  deriveApiDefinition,
  type ApiDefinition,
  type ApiOrigin,
} from "./src/lib/externalApiRegistry";
import { synthesizePatch, runXpathSynthSelftest } from "./src/lib/xpathSynth";
import * as xpathLib from "xpath";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import {
  isDbAvailable, openStudioDb, bindGamePath, dbSelfTest,
  cacheObjectIndex as dbCacheObjectIndex,
  readAllObjects as dbReadAllObjects,
  objectIndexCounts as dbObjectIndexCounts,
  sourcesUnchanged as dbSourcesUnchanged,
  recordSourceStamps as dbRecordSourceStamps,
  getDbMeta, setDbMeta,
  type StudioDb, type SourceStamp
} from "./src/lib/db";

dotenv.config();
// Also load .env.local (Vite convention) so values like GITHUB_CLIENT_ID and GEMINI_API_KEY
// placed there are visible to the server. .env.local takes precedence.
dotenv.config({ path: '.env.local', override: true });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TOKEN_FILE = path.join(process.cwd(), ".studio-api-token");

function loadStudioApiToken(): string {
  if (process.env.STUDIO_API_TOKEN?.trim()) {
    return process.env.STUDIO_API_TOKEN.trim();
  }
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing) {
      return existing;
    }
  } catch {
    // First run on this checkout; create a local-only token below.
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { encoding: "utf8" });
  return token;
}

const STUDIO_API_TOKEN = loadStudioApiToken();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function injectStudioToken(html: string): string {
  const tokenScript = `<script>window.__STUDIO_API_TOKEN__=${JSON.stringify(STUDIO_API_TOKEN)};</script>`;
  return html.replace("</head>", `  ${tokenScript}\n  </head>`);
}

function loadCurrentSchemaLibrary(): SchemaLibrary {
  try {
    const resolved = resolveXsdConfig();
    const library = loadSchemaLibrary(resolved.schemaDir, resolved.schemaFiles || ['md.xsd', 'common.xsd']);
    console.log(`[AI-STUDIO] Loaded XSD schema library: ${library.events.length} events, ${library.conditions.length} conditions, ${library.actions.length} actions.`);
    return library;
  } catch (error) {
    const message = errorMessage(error);
    console.warn(`[AI-STUDIO] XSD schema library unavailable: ${message}`);
    return createEmptySchemaLibrary(message);
  }
}

let schemaLibrary: SchemaLibrary = loadCurrentSchemaLibrary();
let schemaTemplatesByTag = new Map(schemaLibrary.templates.map(template => [template.xmlTag, template]));
let objectIndexCache: { key: string; builtAt: number; index: X4ObjectIndex } | null = null;

// SQLite cache (mirror-write stage — see src/lib/db.ts). Lazily opened once;
// null when better-sqlite3 isn't installed or the DB can't be opened. All uses
// are best-effort: a cache failure must never break the in-memory path.
let studioDb: StudioDb | null | undefined; // undefined = not attempted yet
function getStudioDb(): StudioDb | null {
  if (studioDb !== undefined) return studioDb;
  studioDb = isDbAvailable().available ? openStudioDb() : null;
  if (studioDb) console.log(`[studio-db] SQLite cache active at ${studioDb.path}`);
  return studioDb;
}

function reloadSchemaLibrary(): SchemaLibrary {
  schemaLibrary = loadCurrentSchemaLibrary();
  schemaTemplatesByTag = new Map(schemaLibrary.templates.map(template => [template.xmlTag, template]));
  objectIndexCache = null;
  return schemaLibrary;
}

app.use(express.json({ limit: "5mb" }));

// Enable CORS only for this app's same-port localhost origins.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`
  ]);
  if (origin && allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-ai-provider, x-custom-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Middleware to verify the app session token for all /api/* routes.
// Read-only diagnostic GET endpoints that expose no secrets and no mutation.
// Public so localhost dev/verification tooling can reach them without the token.
const PUBLIC_READONLY_GETS = new Set<string>([
  "/agent/schema",
  "/agent/md-audit",
  "/agent/xsd-debug",
  "/agent/catdat-debug",
  "/agent/round-trip-selftest",
  "/agent/patch-audit",
  "/agent/diagnostics",
  "/agent/api-selftest",
  "/agent/log-selftest",
  "/agent/reference-selftest",
  "/agent/type-probe",
  "/agent/selftest",
  "/agent/db-selftest",
  "/agent/contract-selftest",
  "/agent/file-bridge-transport-selftest",
  "/agent/contract-glue-sample",
  "/agent/lua-snippets",
  "/agent/lua-logic-blocks-selftest",
  "/agent/lua-static-selftest",
  "/agent/lua-runtime-log-selftest",
  "/agent/cue-lineage-selftest",
  "/agent/semantics-selftest",
  "/agent/semantics",
  "/agent/explain-selftest",
  "/agent/critic-selftest",
  "/agent/xml-wellformed-selftest",
  "/agent/vanilla-ui-selftest",
  "/agent/vanilla-ui-harvest",
  "/agent/node-diagnostics-selftest",
  "/agent/node-align-selftest",
  "/agent/simulate-selftest",
  "/agent/port-semantics-selftest",
  "/agent/friendly-names-selftest",
  "/agent/compile-selftest",
  "/agent/mod-templates-selftest",
  "/agent/composite-blocks-selftest",
  "/agent/auto-layout-selftest",
  "/agent/log-telemetry-selftest",
  "/agent/log-file-selftest",
  "/agent/ui-widget-validate-selftest",
  "/agent/ui-layout-selftest",
  "/agent/override-map-selftest",
  "/agent/catdat-selftest",
  "/agent/object-index-selftest",
  "/agent/proposal-review-selftest",
  "/agent/intent-check-selftest",
  "/agent/blueprint-selftest",
  "/agent/architect-loop-selftest",
  "/agent/canvas-interaction-selftest",
  "/agent/wares-jobs-roundtrip-selftest",
  "/agent/mod-fixes-selftest",
  "/agent/aiscript-roundtrip-selftest",
  "/agent/lua-md-binding-selftest",
  "/agent/position-picker-selftest",
  "/agent/xpath-synth-selftest",
  "/agent/live-fixes-selftest",
  "/agent/mod-dependency-selftest",
  "/agent/galaxy-map-selftest",
  "/agent/extension-project-selftest",
  "/agent/project-orchestration-selftest",
  "/agent/project-crossfile-selftest",
  "/agent/external-api-registry-selftest",
  "/agent/external-api-registry",
  "/agent/mod-dependency-graph",
  "/agent/live-log-nav-selftest"
]);

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === "GET" && PUBLIC_READONLY_GETS.has(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token." });
  }
  
  const token = authHeader.substring(7);
  if (token !== STUDIO_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
  
  next();
}

app.use("/api", authMiddleware);

type CompiledFileManifest = Record<string, string>;

type ServerDiagnostic = {
  severity: "error" | "warning" | "info";
  category: string;
  code: string;
  domain: string;
  filePath: string;
  message: string;
  sourceRef?: { kind: string; id?: string; label?: string };
};

type PatchDiagnosticBlock = Pick<PatchBlock, "id" | "sel" | "targetFile" | "includeInBuild"> & {
  selector?: string;
};

type LastDeployInfo = {
  modId: string;
  workspaceName: string;
  deployedAt: string;
  stagingPath?: string;
  deployedPath?: string;
};

let lastDeployInfo: LastDeployInfo | null = null;

function activeBuildWorkspace(workspaceInput: unknown): ModWorkspace {
  const sanitized = sanitizeWorkspace(workspaceInput);
  return {
    ...sanitized,
    nodes: (sanitized.nodes || []).filter(n => n.includeInBuild !== false),
    uiWidgets: (sanitized.uiWidgets || []).filter(w => w.includeInBuild !== false),
    aiScripts: (sanitized.aiScripts || []).filter(s => s.includeInBuild !== false),
    wares: (sanitized.wares || []).filter(w => w.includeInBuild !== false),
    jobs: (sanitized.jobs || []).filter(j => j.includeInBuild !== false),
    tFiles: (sanitized.tFiles || []).filter(t => t.includeInBuild !== false),
    xmlPatches: (sanitized.xmlPatches || []).filter(p => p.includeInBuild !== false)
  };
}

/**
 * Namespace the mod's OWN AI scripts (and the job <task script> references that point to
 * them) with the mod id, so two studio-made mods don't ship colliding generic filenames
 * like aiscripts/hunter.escort.behavior.xml — a real cross-mod conflict the Extension
 * Doctor flags. Base-game script refs (move.*, order.*, etc.) are NOT the mod's own and
 * are left untouched. `ws` is a fresh sanitized copy, so mutating it here is safe.
 */
function namespaceModAiScripts(ws: ModWorkspace, modId: string): void {
  const scripts = ws.aiScripts || [];
  if (!scripts.length) return;
  // #65: imported scripts (namespaced:true) keep their FINAL name — never re-prefix a
  // foreign-namespaced script with this workspace's modId. Authored scripts get prefixed
  // and then flagged final (idempotent). Job task-refs that point at an own script that
  // actually got renamed are updated to match.
  const renames = new Map<string, string>();
  for (const s of scripts) {
    if (!s.name) continue;
    const final = namespaceAiScriptName(s.name, modId, s.namespaced === true);
    if (final !== s.name) renames.set(s.name, final);
    s.name = final;
    s.namespaced = true;
  }
  for (const job of ws.jobs || []) {
    if (job.taskScript && renames.has(job.taskScript)) {
      job.taskScript = renames.get(job.taskScript)!;
    }
  }
}

function buildWorkspaceFileManifest(workspaceInput: unknown): { modId: string; files: CompiledFileManifest } {
  const ws = activeBuildWorkspace(workspaceInput);
  const modId = effectiveModId(ws);
  namespaceModAiScripts(ws, modId);
  const files: CompiledFileManifest = {};
  const settings = ws.compileSettings || { md: true, ui: true, ai: true, library: true, translations: true, patches: true };

  files["content.xml"] = contentXmlFor(modId, ws);
  files["README.md"] = `# ${ws.name || modId}\n\nGenerated by X4 Forge.\n\nInstall location:\n\n\`\`\`\nX4 Foundations/extensions/${modId}/\n\`\`\`\n\nRuntime reload during development: save files, then run \`refreshmd\` in X4's debug command input.\n`;
  
  if (settings.md) {
    // MULTI-SCRIPT export: group cue nodes by their owning file stem (tagged on import) and emit
    // one <mdscript> per file at its original path, with its original <mdscript name>. Single-
    // script and freshly-built mods (cues without a stem) fall back to one file at the mod id.
    const cueNodes = (ws.nodes || []).filter((n: any) => n.type === 'cue');
    const subCueIds = new Set((ws.links || []).filter((l: any) => l.sourcePortId === 'out_sub').map((l: any) => l.targetNodeId));
    const stems = Array.from(new Set(cueNodes
      .map((c: any) => c.properties?.mdFileStem)
      .filter((s: any) => typeof s === 'string' && /^[\w.-]+$/.test(s))));
    if (stems.length > 0) {
      for (const stem of stems) {
        const topCueIds = cueNodes
          .filter((c: any) => c.properties?.mdFileStem === stem && !subCueIds.has(c.id))
          .map((c: any) => c.id);
        const scriptName = cueNodes.find((c: any) => c.properties?.mdFileStem === stem)?.properties?.mdScript || String(stem);
        files[`md/${stem}.xml`] = generateMDXML(ws, topCueIds, scriptName);
      }
      // Cues with no stem (newly created in-canvas) → emit under the mod id.
      const orphanTop = cueNodes.filter((c: any) => !c.properties?.mdFileStem && !subCueIds.has(c.id)).map((c: any) => c.id);
      if (orphanTop.length > 0) files[`md/${modId}.xml`] = generateMDXML(ws, orphanTop);
    } else {
      const mdStem = (ws.mdFileStem && /^[\w.-]+$/.test(ws.mdFileStem)) ? ws.mdFileStem : modId;
      files[`md/${mdStem}.xml`] = generateMDXML(ws);
    }
  }

  if (settings.ui && ws.uiWidgets?.length) {
    // X4-correct UI packaging: an extension-root ui.xml index registering a Lua
    // entry point under ui/. (The legacy md_ui_layouts/<id>_ui.xml used a
    // non-standard <ui_menu> schema X4 ignores; it is no longer packaged but is
    // still available as a design-time descriptor via generateUIXML.)
    files["ui.xml"] = generateUIIndexXML(ws, modId);
    files[`ui/${modId}.lua`] = generateUILuaScript(ws, modId);
  }

  if (settings.ai) {
    for (const script of ws.aiScripts || []) {
      const fileName = script.name.endsWith(".xml") ? script.name : `${script.name}.xml`;
      files[`aiscripts/${fileName}`] = compileScriptToXML(script);
    }
  }

  if (settings.library) {
    if (ws.wares?.length) {
      files["libraries/wares.xml"] = compileWaresXML(ws.wares);
    }
    if (ws.jobs?.length) {
      files["libraries/jobs.xml"] = compileJobsXML(ws.jobs);
    }
  }

  if (settings.translations) {
    for (const tFile of ws.tFiles || []) {
      files[`t/${toTFileName(tFile)}`] = compileTFileXML(tFile);
    }
  }

  if (settings.patches && ws.xmlPatches?.length) {
    const patchesByFile: Record<string, PatchBlock[]> = {};
    ws.xmlPatches.forEach((patch) => {
      const file = patch.targetFile || "libraries/wares.xml";
      if (!patchesByFile[file]) {
        patchesByFile[file] = [];
      }
      patchesByFile[file].push(patch);
    });

    for (const [filePath, filePatches] of Object.entries(patchesByFile)) {
      files[filePath] = compileDiffDocument(filePatches, filePath);
    }
  }

  // Passthrough files preserved from an imported mod. Generated output always
  // wins a path collision so the studio's modeled domains stay authoritative.
  for (const pf of (ws.passthroughFiles || [])) {
    if (!pf || typeof pf.path !== 'string') continue;
    const rel = pf.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel || rel.includes('..')) continue;
    if (pf.omitted || pf.content === undefined) continue; // tracked-not-loaded: preserved on disk, never overwrite with empty
    if (files[rel] === undefined) {
      files[rel] = pf.content;
    }
  }

  return { modId, files };
}

function summarizeWorkspaceDomains(ws: ModWorkspace) {
  return {
    nodes: ws.nodes?.length || 0,
    links: ws.links?.length || 0,
    uiWidgets: ws.uiWidgets?.length || 0,
    tFiles: ws.tFiles?.length || 0,
    aiScripts: ws.aiScripts?.length || 0,
    wares: ws.wares?.length || 0,
    jobs: ws.jobs?.length || 0,
    xmlPatches: ws.xmlPatches?.length || 0
  };
}

type GameLogIssue = {
  severity: "error" | "warning";
  lineNumber: number;
  text: string;
  matchesActiveMod: boolean;
  sourceRef?: { kind: string; file?: string; line?: number; label?: string };
};

function uniqueExistingParentCandidates(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths
    .filter(Boolean)
    .map(candidate => path.normalize(candidate))
    .filter(candidate => {
      const key = candidate.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findDebugLogCandidates(): string[] {
  const resolved = resolveXsdConfig();
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const docs = home ? path.join(home, "Documents", "Egosoft", "X4") : "";
  const candidates = [
    // User-configured log path takes priority.
    resolved.x4LogPath || "",
    path.join(process.cwd(), "debuglog.txt"),
    path.join(process.cwd(), "uidata.log"),
    resolved.x4GamePath ? path.join(resolved.x4GamePath, "debuglog.txt") : "",
    resolved.x4GamePath ? path.join(resolved.x4GamePath, "uidata.log") : ""
  ];

  if (docs && fs.existsSync(docs)) {
    try {
      for (const profileName of fs.readdirSync(docs)) {
        const profilePath = path.join(docs, profileName);
        if (fs.existsSync(profilePath) && fs.statSync(profilePath).isDirectory()) {
          candidates.push(path.join(profilePath, "debuglog.txt"));
          candidates.push(path.join(profilePath, "uidata.log"));
        }
      }
    } catch {
      // Candidate discovery is best-effort; callers still get explicit paths checked.
    }
  }

  return uniqueExistingParentCandidates(candidates);
}

function readTail(filePath: string, maxBytes: number): string {
  const stat = fs.statSync(filePath);
  const bytesToRead = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8");
}

/**
 * Map an X4 log line back to a Studio source reference where possible. X4 errors
 * commonly name the MD script and a line, e.g. "* Error in MD script
 * 'sector_bounty_hunter' ... line 18" or "(md.Foo.Cue): ...". Deterministic, no AI.
 */
function mapLogLineToSourceRef(text: string): { kind: string; file?: string; line?: number; label?: string } | undefined {
  const scriptQuoted = text.match(/(?:md script|script)\s+'([\w.-]+)'/i)?.[1]
    || text.match(/\bmd\.([\w]+)\b/i)?.[1];
  const lineNo = text.match(/\bline\s+(\d+)/i)?.[1];
  const cue = text.match(/cue\s+'([\w.-]+)'/i)?.[1];
  if (scriptQuoted) {
    const base = scriptQuoted.replace(/^md\./i, '');
    return { kind: 'md_file', file: `md/${base}.xml`, line: lineNo ? Number(lineNo) : undefined, label: cue ? `cue ${cue}` : undefined };
  }
  return undefined;
}

function analyzeGameLog(tail: string, modIds: string[]): { issues: GameLogIssue[]; tailLines: string[] } {
  // Match against a SET of candidate identifiers, not one. A hand-authored mod's real
  // extension folder/content id (e.g. "ai_influence_test") can differ from the id the
  // Studio derives from the display name (toSafeModId("AI Influence Test Mod") =
  // "ai_influence_test_mod"). Matching only the derived id silently misses the mod's real
  // log lines → a dangerous false "all clear". So we test every candidate.
  const mods = Array.from(new Set((modIds || []).map(m => (m || '').toLowerCase()).filter(m => m.length >= 3)));
  const lines = tail.split(/\r?\n/).filter(line => line.trim().length > 0);
  const baseLine = Math.max(1, lines.length - 1);
  const issuePattern = /\b(error|warning|failed|exception|invalid|not allowed|rejected|could not|unable to)\b/i;
  const issues = lines
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => issuePattern.test(text))
    .map(({ text, index }) => ({
      severity: /\b(warning|warn)\b/i.test(text) && !/\berror\b/i.test(text) ? "warning" as const : "error" as const,
      lineNumber: baseLine + index,
      text,
      matchesActiveMod: mods.length > 0 && mods.some(m => text.toLowerCase().includes(m)),
      sourceRef: mapLogLineToSourceRef(text)
    }));

  return {
    issues,
    tailLines: lines.slice(-120)
  };
}

interface LogHypothesis {
  code: 'djfhe_require' | 'truncated_or_malformed' | 'signal_library' | 'duplicate_addon' | 'code_never_ran';
  confidence: 'high' | 'medium';
  evidence: string;
  explanation: string;
  suggestion: string;
}

type DebugTimelineKind = "deploy" | "file_load" | "marker" | "cue" | "issue" | "runtime_fault";

type DebugTimelineItem = {
  kind: DebugTimelineKind;
  severity: "info" | "warning" | "error";
  label: string;
  lineNumber?: number;
  evidence: string;
};

type ExpectedDebugStep = {
  step: string;
  seen: boolean;
  evidence?: string;
};

/**
 * Deterministic root-cause layer over the live log. NOT an AI guess — a fixed
 * symptom→cause table plus a markersSeen signal. Each hypothesis is something a
 * named log pattern justifies. `markersSeen` distinguishes "X4 merely READ the mod's
 * files" (file-IO/signature lines only) from "the mod's own code actually RAN" (a
 * non-file-IO line mentioning the mod, e.g. a DebugError marker) — the exact inference
 * that found the refreshmd chat-window bug ("UI registered but MD never fired").
 */
function deriveLogDiagnosis(tail: string, modIds: string[], activeIssues: { severity: string; text: string }[]): { filesLoaded: boolean; markersSeen: boolean; hypotheses: LogHypothesis[] } {
  const mods = (modIds || []).map(m => (m || '').toLowerCase()).filter(m => m.length >= 3);
  // BOUNDED + substring-only. Runs on every 4s watcher poll over a 256KB tail, so it must be
  // cheap and free of regex backtracking: cap to the last 400 lines and use indexOf checks.
  const lines = String(tail || '').split(/\r?\n/).slice(-400);
  const lc = lines.map(l => l.toLowerCase());
  const modLineIdx = lines.map((_, i) => i).filter(i => mods.some(m => lc[i].includes(m)));
  const isFileLoadLine = (x: string) => x.includes('[fileio') || x.includes('signature') || x.includes('loading extension') || x.includes(".xml'") || x.includes(".lua'");
  const filesLoaded = modLineIdx.length > 0;
  const markersSeen = modLineIdx.some(i => !isFileLoadLine(lc[i]));
  const findLine = (pred: (x: string) => boolean) => { for (let i = 0; i < lines.length; i++) if (pred(lc[i])) return lines[i]; return ''; };
  const hyp: LogHypothesis[] = [];
  let m = '';
  if ((m = findLine(x => x.includes('loop or previous error loading module') || (x.includes('module') && x.includes('not found')) || x.includes('no such module')))) {
    hyp.push({ code: 'djfhe_require', confidence: 'high', evidence: m.trim().slice(0, 200),
      explanation: 'A Lua require failed or poisoned the module cache.',
      suggestion: 'Require only "djfhe.http.request" LAZILY at call time; never require "djfhe.http.client" and never add a broad "extensions/?.lua" to package.path.' });
  }
  if ((m = findLine(x => x.includes("couldn't find end of start tag") || x.includes('unexpected end of') || x.includes('premature end') || x.includes('not well-formed') || x.includes('xml parse')))) {
    hyp.push({ code: 'truncated_or_malformed', confidence: 'high', evidence: m.trim().slice(0, 200),
      explanation: 'A deployed XML file is truncated or malformed.',
      suggestion: 'Re-deploy from the host (Forge), verify byte length via extension-file. Stale/truncated sandbox-mount bytes are the usual cause.' });
  }
  if ((m = findLine(x => x.includes('has no corresponding library')))) {
    hyp.push({ code: 'signal_library', confidence: 'high', evidence: m.trim().slice(0, 200),
      explanation: 'A signal_cue targeted a <library>.',
      suggestion: 'Invoke libraries with <run_actions ref="..."> (purpose="run_actions"), not signal_cue.' });
  }
  if ((m = findLine(x => (x.includes('registered already') || x.includes('duplicate') || x.includes('already exists')) && (x.includes('addon') || x.includes('extension') || x.includes('menu') || x.includes('cue') || x.includes(' id'))))) {
    hyp.push({ code: 'duplicate_addon', confidence: 'medium', evidence: m.trim().slice(0, 200),
      explanation: 'A duplicate addon/extension is loaded — usually a stale sibling folder (e.g. <id>_mod).',
      suggestion: 'Confirm the deployed folder name matches what X4 loads; remove the orphan via extension-doctor / delete-dir.' });
  }
  const hasRealActiveError = activeIssues.some(i => i.severity === 'error' && !i.text.toLowerCase().includes('signature'));
  if (filesLoaded && !markersSeen && !hasRealActiveError) {
    hyp.push({ code: 'code_never_ran', confidence: 'medium', evidence: 'mod files appear in the log, but no mod-authored marker line does',
      explanation: 'X4 read the mod files but no mod code (script/Lua marker) ran — a trigger likely never fired.',
      suggestion: 'If you reloaded with refreshmd, a cue gated on <event_game_loaded> will NOT fire — use a conditionless cue, or load a save. Confirm your [MARKER] DebugError lines appear once it runs.' });
  }
  return { filesLoaded, markersSeen, hypotheses: hyp };
}

/**
 * Deterministic state model for the live feedback loop. Pure function so it can
 * be unit-tested with synthetic log content.
 */
function computeGameStates(args: { tail: string; modIds: string[]; deployed: boolean; stale: boolean }) {
  const { tail, modIds, deployed, stale } = args;
  const { issues } = analyzeGameLog(tail, modIds);
  const active = issues.filter(i => i.matchesActiveMod);
  const mods = (modIds || []).map(m => (m || '').toLowerCase()).filter(m => m.length >= 3);
  const seenByX4 = mods.some(m => tail.toLowerCase().includes(m));
  const runtimeErrors = active.some(i => i.severity === 'error');
  return {
    deployed,                                   // a Studio deploy happened
    seenByX4: seenByX4 && !stale,               // the (fresh) log mentions the extension id
    loadedCleanly: seenByX4 && !stale && !runtimeErrors,
    runtimeErrors,
    activeIssueCount: active.length
  };
}

// Cue/library names the DEPLOYED mod defines — read straight from its md/*.xml on disk. Lets the
// watcher report CUE LIVENESS (are the mod's cues actually firing in the log?) independent of whether
// the mod prints its own name or emits debug markers. This is the signal that catches a silently-dead
// cue (e.g. an event handler that isn't instantiate="true", or one whose body skips on a bad read) —
// exactly the class of bug the error-grep + markersSeen heuristics miss.
function collectDeployedModCueNames(modId: string): string[] {
  const resolved = resolveXsdConfig();
  const names = new Set<string>();
  const roots = [resolved.filesystemPath, resolved.modWorkspacePath].filter(Boolean) as string[];
  const re = /<(?:cue|library)\b[^>]*\bname\s*=\s*"([^"]+)"/g;
  const readMdDir = (mdDir: string): boolean => {
    let files: string[] = [];
    try { files = fs.readdirSync(mdDir).filter(f => f.toLowerCase().endsWith(".xml")); } catch { return false; }
    for (const f of files.slice(0, 60)) {
      try {
        const txt = fs.readFileSync(path.join(mdDir, f), "utf8");
        let m: RegExpExecArray | null; re.lastIndex = 0;
        while ((m = re.exec(txt))) { if (m[1] && m[1].length >= 2) names.add(m[1]); }
      } catch { /* skip unreadable file */ }
    }
    return files.length > 0;
  };
  // The watcher modId (content.xml id, e.g. "ai_influence") often differs from the deployed FOLDER
  // name (e.g. "x4_ai_influence"). Try the obvious folder variants, then a bounded name-contains scan.
  const bare = modId.toLowerCase().replace(/^x4_/, "");
  const candidates = Array.from(new Set([modId, `x4_${modId}`, `${modId}_mod`, bare]));
  for (const root of roots) {
    for (const folder of candidates) {
      readMdDir(path.join(root, folder, "md"));
      if (names.size > 0) return Array.from(names);
    }
    try {
      for (const entry of fs.readdirSync(root)) {
        if (entry.toLowerCase().includes(bare)) {
          readMdDir(path.join(root, entry, "md"));
          if (names.size > 0) return Array.from(names);
        }
      }
    } catch { /* root unreadable */ }
  }
  return Array.from(names);
}

// The mod's own LOG MARKER(s) — mods print under an arbitrary prefix (e.g. `DebugError("[AICHAT][UIX] …")`),
// NOT their extension id, so an id-grep never sees them. Scan the deployed mod's Lua for the bracket prefix
// used in DebugError/print calls so the watcher can recognise the mod's lines (and the errors next to them).
function collectModLogMarkers(modId: string): string[] {
  const resolved = resolveXsdConfig();
  const roots = [resolved.filesystemPath, resolved.modWorkspacePath].filter(Boolean) as string[];
  const bare = modId.toLowerCase().replace(/^x4_/, "");
  const markers = new Set<string>();
  const callRe = /(?:DebugError|print)\s*\(\s*["'`]\s*\[([A-Za-z][A-Za-z0-9_]{3,})\]/g;
  const scanLua = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.slice(0, 300)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) scanLua(full, depth + 1);
      else if (/\.lua$/i.test(e.name)) {
        try {
          const txt = fs.readFileSync(full, "utf8");
          let m: RegExpExecArray | null; callRe.lastIndex = 0;
          while ((m = callRe.exec(txt))) markers.add(m[1].toLowerCase());
        } catch { /* skip */ }
      }
    }
  };
  const candidates = Array.from(new Set([modId, `x4_${modId}`, `${modId}_mod`, bare]));
  for (const root of roots) {
    let modDir = "";
    for (const folder of candidates) {
      const d = path.join(root, folder);
      try { if (fs.statSync(d).isDirectory()) { modDir = d; break; } } catch { /* */ }
    }
    if (!modDir) {
      try { for (const ent of fs.readdirSync(root)) { if (ent.toLowerCase().includes(bare)) { const d = path.join(root, ent); if (fs.statSync(d).isDirectory()) { modDir = d; break; } } } } catch { /* */ }
    }
    if (modDir) { scanLua(path.join(modDir, "ui"), 0); if (markers.size) break; }
  }
  return Array.from(markers);
}

// A REAL engine/Lua fault signature — phrases the ENGINE emits, not text a mod author chose to print.
// Crucial in X4: mods can only log via DebugError (which the engine stamps "[=ERROR=]"), so the "[=ERROR=]"
// prefix and the bare word "error" appear on the mod's BENIGN heartbeat too and cannot be the signal. A
// genuine fault carries one of these distinctive engine strings instead.
const ENGINE_FAULT_SIG = /invalid argument|got cdata|cannot run actions|error in (md|ai) (cue|script)|attempt to (call|index)|stack traceback|a nil value|no corresponding library|couldn't find end|not well-formed|premature end|unknown (parameter|keyword)|failed to (load|run|parse|compile)/i;

// Attribute genuine engine faults to the mod by PROXIMITY to its own log markers: a
// "GetComponentData(): Invalid argument … got cdata" thrown inside the mod's UIX reader is logged with no
// cue/mod name, but right next to a "[AICHAT][UIX] …" line. Count only fault-signature lines adjacent to a
// marker (the marker line itself is the mod's benign info, excluded) → precise RED, no heartbeat noise.
function countModRuntimeErrors(tail: string, markers: string[]): { count: number; markerLines: number; samples: string[] } {
  if (!markers.length) return { count: 0, markerLines: 0, samples: [] };
  const lines = String(tail || "").split(/\r?\n/).slice(-2000);
  const lc = lines.map(l => l.toLowerCase());
  const markerIdx = new Set<number>();
  for (let i = 0; i < lines.length; i++) if (markers.some(m => lc[i].includes(m))) markerIdx.add(i);
  if (!markerIdx.size) return { count: 0, markerLines: 0, samples: [] };
  const samples: string[] = [];
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (markerIdx.has(i)) continue;            // the mod's own marker line = benign info, never the fault
    if (!ENGINE_FAULT_SIG.test(lines[i])) continue;
    let near = false;
    for (let d = -3; d <= 3; d++) if (markerIdx.has(i + d)) { near = true; break; }
    if (near) { count++; if (samples.length < 6) samples.push(lines[i].trim().slice(0, 200)); }
  }
  return { count, markerLines: markerIdx.size, samples };
}

function getGameLogStatus(modIdInput?: string) {
  const raw = String(modIdInput || lastDeployInfo?.workspaceName || activeWorkspace.name || '');
  const modId = toSafeModId(raw); // primary id for display
  // Candidate identifiers the log line might actually use — covers the display name, its
  // space/underscore forms, and the common display-name→folder-id drift (a trailing "_mod"
  // that the real extension folder doesn't have). Matching any of these avoids false all-clear.
  const bareId = modId.replace(/_mod$/, '');
  // The mod's OWN log marker(s), scanned from its Lua (e.g. "aichat" from `DebugError("[AICHAT][UIX] …")`).
  // This is what X4 actually prints — mods log under a prefix, not their extension id — so matching it is
  // how the watcher recognises the mod's lines + the errors next to them. (Ken: "it's looking for ai_influence".)
  const modMarkers = collectModLogMarkers(modId);
  const modIds = Array.from(new Set([
    modId,
    raw.toLowerCase().trim(),
    raw.toLowerCase().trim().replace(/\s+/g, '_'),
    bareId,
    // X4's log uses the DEPLOYED FOLDER id, which is often the metadata name with an `x4_` prefix
    // (e.g. metadata "AI Influence" → folder "x4_ai_influence").
    `x4_${modId}`,
    `x4_${bareId}`,
    // NOTE: deliberately NOT including the mod's DebugError marker (e.g. "aichat") here. X4 emits EVERY
    // mod DebugError line as "[=ERROR=] … [AICHAT][UIX] …" — the only log channel a mod has — so matching
    // the marker in this generic error grep flags the mod's normal heartbeat as 34 false "errors". The
    // marker is used for liveness (markersSeen) and precise runtime-fault attribution below, not here.
  ].filter(s => s && s.length >= 3)));
  const candidates = findDebugLogCandidates();
  const selectedLogPath = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  const relevantLastDeploy = lastDeployInfo?.modId === modId ? lastDeployInfo : null;

  if (!selectedLogPath) {
    return {
      status: "no_log",
      modId,
      summary: "No debuglog.txt or uidata.log file was found in the known X4 log locations.",
      selectedLogPath: "",
      checkedPaths: candidates,
      lastDeploy: relevantLastDeploy,
      issues: [],
      tailLines: []
    };
  }

  const stat = fs.statSync(selectedLogPath);
  const tail = readTail(selectedLogPath, 256 * 1024);
  const { issues, tailLines } = analyzeGameLog(tail, modIds);
  // CUE-CORRELATED ERRORS — tie each X4 error line back to the mod CUE that threw it (the error
  // line names the cue, e.g. "Error in MD cue ...worldsync.Tick: Cannot run actions of library
  // ...Do_sync"). This is the RED signal: which of the mod's own cues are failing, by name.
  // NOTE: we deliberately do NOT treat cue-SILENCE as a fault — a healthy mod that doesn't print
  // debug markers logs nothing, so "0 cues seen" is normal and must never raise a false "inert".
  const modCueNames = collectDeployedModCueNames(modId);
  const cueTelemetry = modCueNames.length ? parseLogTelemetry(tail, modCueNames).cues : [];
  const erroringCues = cueTelemetry.filter(c => c.errors > 0).sort((a, b) => b.errors - a.errors);
  const firingCues = cueTelemetry.filter(c => c.hits > 0 && c.errors === 0).sort((a, b) => b.hits - a.hits);
  const cueLiveness = {
    totalCues: modCueNames.length,
    erroringCount: erroringCues.length,
    firingCount: firingCues.length,
    // RED — cues with errors in the log (clickable → navigate to the node).
    erroring: erroringCues.slice(0, 16).map(c => ({ name: c.name, errors: c.errors, hits: c.hits, lastLineNo: c.lastLineNo })),
    // GREEN — cues observed firing cleanly.
    firing: firingCues.slice(0, 16).map(c => ({ name: c.name, hits: c.hits })),
  };
  // RUNTIME (Lua) ERRORS — the mod's own DebugError/print marker (e.g. "[AICHAT][UIX]") tags its lines,
  // but a Lua engine error it triggers (e.g. "GetComponentData(): Invalid argument … got cdata") is logged
  // as a bare [=ERROR=] line that names NO cue and NO mod. Attribute [=ERROR=] lines that sit right next to
  // the mod's marker lines to the mod → this is the RED Ken wanted (errors the cue-grep alone can't see).
  const runtime = countModRuntimeErrors(tail, modMarkers);
  // BENIGN LOG NOISE — X4 logs "[error] [FileIO] Failed to verify the file signature for file … (error: 14)"
  // for EVERY unsigned loose mod file at load. It's harmless (the mod still loads in modified mode) and
  // PERMANENT for any dev mod, so counting it would pin the watcher red forever. A file that's actually broken
  // surfaces as an XML-parse / cue error instead (still caught). Exclude signature-verification noise from RED.
  const BENIGN_LOG_NOISE = /verify the file signature/i;
  const activeIssues = issues.filter(issue => issue.matchesActiveMod);
  const signatureNotices = activeIssues.filter(issue => BENIGN_LOG_NOISE.test(issue.text));
  const activeErrors = activeIssues.filter(issue => issue.severity === "error" && !BENIGN_LOG_NOISE.test(issue.text));
  const activeWarnings = activeIssues.filter(issue => issue.severity === "warning" && !BENIGN_LOG_NOISE.test(issue.text));
  const logUpdatedAt = stat.mtime.toISOString();
  const staleForLastDeploy = Boolean(relevantLastDeploy?.deployedAt && new Date(logUpdatedAt).getTime() < new Date(relevantLastDeploy.deployedAt).getTime());

  let status: "stale" | "errors" | "warnings" | "clean" = "clean";
  if (staleForLastDeploy) status = "stale";
  else if (activeErrors.length > 0) status = "errors";
  else if (activeWarnings.length > 0) status = "warnings";

  const baseSummary = status === "stale"
    ? "A log file was found, but it has not changed since the last Studio deploy."
    : status === "errors"
      ? `${activeErrors.length} active-mod error(s) found in recent X4 log output.`
      : status === "warnings"
        ? `${activeWarnings.length} active-mod warning(s) found in recent X4 log output.`
        : `No recent X4 errors or warnings mentioning "${modId}" were found in the tailed log.`;
  // Per-cue ERRORS are the real RED signal — a cue throwing in the log is a fault regardless of the
  // mod-name grep. Escalate to errors and name the failing cues. Cue SILENCE is NOT a fault.
  if (cueLiveness.erroringCount > 0 && status !== "stale") status = "errors";
  // Runtime Lua errors adjacent to the mod's marker are RED too, even when no cue is named.
  if (runtime.count > 0 && status !== "stale") status = "errors";
  const runtimeNote = runtime.count > 0
    ? ` ✗ ${runtime.count} runtime error(s) logged next to the mod's "${modMarkers.join('/')}" marker (likely the mod's Lua): ${runtime.samples.slice(0, 2).join(' | ')}`
    : "";
  const cueNote = cueLiveness.erroringCount > 0
    ? ` ✗ ${cueLiveness.erroringCount} of the mod's cues are THROWING ERRORS: ${cueLiveness.erroring.map(c => `${c.name}(${c.errors})`).join(', ')}.`
    : cueLiveness.firingCount > 0
      ? ` ${cueLiveness.firingCount} of the mod's cues are firing cleanly.`
      : cueLiveness.totalCues > 0
        ? ` (No cue activity for this mod in the tail — a healthy mod that emits no debug markers logs nothing, so this alone is not a fault.)`
        : "";
  const summary = baseSummary + cueNote + runtimeNote;

  const states = computeGameStates({ tail, modIds, deployed: Boolean(relevantLastDeploy), stale: staleForLastDeploy });

  return {
    status,
    modId,
    summary,
    cueLiveness,
    // Mod runtime (Lua) errors detected by marker-proximity — RED even when no cue is named.
    modMarkers,
    modRuntime: { markersSeen: runtime.markerLines > 0, markerLines: runtime.markerLines, errorCount: runtime.count, samples: runtime.samples },
    // Explicit pipeline states: Compiled -> Deployed -> Seen by X4 -> Loaded cleanly -> Runtime errors.
    states,
    selectedLogPath,
    checkedPaths: candidates,
    logUpdatedAt,
    logBytes: stat.size,
    lastDeploy: relevantLastDeploy,
    // Benign: unsigned-file signature notices X4 logs at load for every loose mod file (not a fault).
    signatureNotices: signatureNotices.length,
    counts: {
      allIssues: issues.length,
      activeIssues: activeIssues.length,
      activeErrors: activeErrors.length,
      activeWarnings: activeWarnings.length
    },
    issues: activeIssues.slice(-50),
    recentGlobalIssues: issues.slice(-20),
    // Deterministic root-cause layer: named hypotheses + markersSeen (did the mod's own code run?).
    // Pass the mod's DebugError marker alongside the ids so "markers seen" reflects the mod actually
    // logging (its "[AICHAT][UIX] …" lines), even though the marker is kept out of the error grep above.
    diagnosis: deriveLogDiagnosis(tail, [...modIds, ...modMarkers], activeIssues),
    tailLines
  };
}

function classifyTimelineLine(line: string, lineNumber: number, modIds: string[], markers: string[], cueNames: string[]): DebugTimelineItem | null {
  const raw = String(line || "").trim();
  if (!raw) return null;
  const lc = raw.toLowerCase();
  const modHit = modIds.some(m => m && lc.includes(m.toLowerCase()));
  const markerHit = markers.find(m => m && lc.includes(m.toLowerCase()));
  const cueHit = cueNames.find(c => c && new RegExp(`(^|[^A-Za-z0-9_])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`).test(raw));
  const isFileLoad = lc.includes("[fileio") || lc.includes("signature") || lc.includes("loading extension") || lc.includes(".xml'") || lc.includes(".lua'");
  const isIssue = /\b(error|warning|failed|exception|invalid|not allowed|rejected|could not|unable to)\b/i.test(raw);

  if (ENGINE_FAULT_SIG.test(raw) && (markerHit || cueHit || modHit)) {
    return { kind: "runtime_fault", severity: "error", label: "Runtime fault", lineNumber, evidence: raw.slice(0, 240) };
  }
  if (cueHit && isIssue) {
    return { kind: "cue", severity: /warn/i.test(raw) && !/error/i.test(raw) ? "warning" : "error", label: `Cue ${cueHit}`, lineNumber, evidence: raw.slice(0, 240) };
  }
  if (cueHit) {
    return { kind: "cue", severity: "info", label: `Cue ${cueHit}`, lineNumber, evidence: raw.slice(0, 240) };
  }
  if (markerHit) {
    return { kind: "marker", severity: isIssue ? "warning" : "info", label: `[${markerHit.toUpperCase()}] marker`, lineNumber, evidence: raw.slice(0, 240) };
  }
  if (modHit && isFileLoad) {
    return { kind: "file_load", severity: "info", label: "Mod file seen by X4", lineNumber, evidence: raw.slice(0, 240) };
  }
  if (modHit && isIssue && !/verify the file signature/i.test(raw)) {
    return { kind: "issue", severity: /warn/i.test(raw) && !/error/i.test(raw) ? "warning" : "error", label: "Active-mod issue", lineNumber, evidence: raw.slice(0, 240) };
  }
  return null;
}

function buildDebugWatcherBrief(modIdInput?: string, expectedInput: string[] = []) {
  const status: any = getGameLogStatus(modIdInput);
  if (!status.selectedLogPath || !fs.existsSync(status.selectedLogPath)) {
    return {
      ok: status.status !== "error",
      status,
      brief: status.summary || "No X4 debug log found.",
      timeline: [],
      expectedChain: [],
      sinceDeploy: { hasDeploy: Boolean(status.lastDeploy), changedSinceDeploy: false, summary: "No readable log to compare with deploy state." },
      artifact: `Debug Watcher Brief\nStatus: ${status.status}\nSummary: ${status.summary || ""}\n`
    };
  }

  const modId = status.modId || toSafeModId(String(modIdInput || ""));
  const bareId = String(modId).replace(/_mod$/, "");
  const raw = String(modIdInput || lastDeployInfo?.workspaceName || activeWorkspace.name || "");
  const modIds = Array.from(new Set([
    modId,
    raw.toLowerCase().trim(),
    raw.toLowerCase().trim().replace(/\s+/g, "_"),
    bareId,
    `x4_${modId}`,
    `x4_${bareId}`,
  ].filter(s => s && s.length >= 3)));
  const markers = Array.isArray(status.modMarkers) ? status.modMarkers : collectModLogMarkers(modId);
  const cueNames = collectDeployedModCueNames(modId);
  const tail = readTail(status.selectedLogPath, 256 * 1024);
  const lines = tail.split(/\r?\n/).filter(l => l.trim().length > 0);
  const baseLine = Math.max(1, lines.length - 399);
  const timeline = lines.slice(-400)
    .map((line, i) => classifyTimelineLine(line, baseLine + i, modIds, markers, cueNames))
    .filter(Boolean)
    .slice(-80) as DebugTimelineItem[];

  const firedCueNames = new Set<string>((status.cueLiveness?.firing || []).map((c: any) => String(c.name)));
  const errorCueNames = new Set<string>((status.cueLiveness?.erroring || []).map((c: any) => String(c.name)));
  const searchableEvidence = [
    ...timeline.map(t => `${t.label} ${t.evidence}`),
    ...(status.modMarkers || []),
  ].join("\n").toLowerCase();
  const expectedChain: ExpectedDebugStep[] = expectedInput
    .map(s => String(s || "").trim())
    .filter(Boolean)
    .map(step => {
      const bare = step.replace(/^(cue|marker):/i, "").trim();
      const seen = firedCueNames.has(bare) || errorCueNames.has(bare) || searchableEvidence.includes(bare.toLowerCase());
      const ev = timeline.find(t => t.evidence.toLowerCase().includes(bare.toLowerCase()) || t.label.toLowerCase().includes(bare.toLowerCase()));
      return { step, seen, evidence: ev?.evidence };
    });

  const logTime = status.logUpdatedAt ? new Date(status.logUpdatedAt).getTime() : 0;
  const deployTime = status.lastDeploy?.deployedAt ? new Date(status.lastDeploy.deployedAt).getTime() : 0;
  const changedSinceDeploy = Boolean(deployTime && logTime && logTime >= deployTime);
  const sinceDeploy = {
    hasDeploy: Boolean(status.lastDeploy),
    changedSinceDeploy,
    deployedAt: status.lastDeploy?.deployedAt,
    logUpdatedAt: status.logUpdatedAt,
    summary: !status.lastDeploy
      ? "No Studio deploy metadata is available for this mod."
      : changedSinceDeploy
        ? "The log has changed since the last Studio deploy; current findings are relevant to this deploy window."
        : "The log has not changed since the last Studio deploy; findings may be stale."
  };

  const topEvidence = [
    ...(status.cueLiveness?.erroring || []).map((c: any) => `Cue error: ${c.name} (${c.errors})`),
    ...(status.modRuntime?.samples || []).map((s: string) => `Runtime: ${s}`),
    ...(status.diagnosis?.hypotheses || []).map((h: any) => `Hypothesis ${h.code}: ${h.explanation}`),
    ...timeline.slice(-8).map(t => `${t.kind}: ${t.evidence}`),
  ].slice(0, 16);

  const artifact = [
    "Debug Watcher Brief",
    `Mod: ${modId}`,
    `Status: ${status.status}`,
    `Summary: ${status.summary || ""}`,
    `Log: ${status.selectedLogPath || ""}`,
    `Updated: ${status.logUpdatedAt || ""}`,
    `Deploy: ${status.lastDeploy?.deployedAt || "none"}`,
    `Since deploy: ${sinceDeploy.summary}`,
    "",
    "Expected Chain:",
    ...(expectedChain.length ? expectedChain.map(s => `${s.seen ? "PASS" : "MISS"} ${s.step}${s.evidence ? ` :: ${s.evidence}` : ""}`) : ["(none configured)"]),
    "",
    "Evidence:",
    ...(topEvidence.length ? topEvidence : ["No high-signal evidence in the current tail."]),
  ].join("\n");

  return {
    ok: status.status !== "error",
    status,
    brief: status.summary || "",
    timeline,
    expectedChain,
    sinceDeploy,
    evidence: topEvidence,
    artifact,
  };
}

/**
 * Invalidation stamps for the SQLite-cached object index: every .cat archive
 * (game root + extension subfolders + mod workspace) plus the top-level mtimes
 * of the scan roots. Cheap to collect; catches archive/install changes. Deeply
 * nested loose-XML edits may not bump these — the warm path still fully
 * rebuilds every 60 s, so staleness is bounded to cold boots after such edits.
 */
function collectObjectIndexStamps(resolved: ReturnType<typeof resolveXsdConfig>): SourceStamp[] {
  const stamps: SourceStamp[] = [];
  const stat = (p: string) => { try { return Math.floor(fs.statSync(p).mtimeMs); } catch { return null; } };
  const addCats = (dir: string) => {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.toLowerCase().endsWith('.cat')) continue;
        const p = path.join(dir, f);
        const m = stat(p);
        if (m !== null) stamps.push({ path: p, mtime: m });
      }
    } catch { /* root missing */ }
  };
  if (resolved.x4GamePath) {
    addCats(resolved.x4GamePath);
    const extDir = path.join(resolved.x4GamePath, 'extensions');
    try {
      for (const sub of fs.readdirSync(extDir)) addCats(path.join(extDir, sub));
    } catch { /* no extensions dir */ }
    const extM = stat(extDir);
    if (extM !== null) stamps.push({ path: extDir, mtime: extM });
  }
  for (const root of [resolved.modWorkspacePath, resolved.filesystemPath]) {
    if (!root) continue;
    addCats(root);
    const m = stat(root);
    if (m !== null) stamps.push({ path: root, mtime: m });
  }
  return stamps;
}

function getObjectIndex(): X4ObjectIndex {
  const resolved = resolveXsdConfig();
  const roots = [
    resolved.x4GamePath ? path.join(resolved.x4GamePath, "libraries") : "",
    resolved.x4GamePath ? path.join(resolved.x4GamePath, "assets") : "",
    resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions") : "",
    resolved.modWorkspacePath || "",
    resolved.filesystemPath || ""
  ];
  const cacheKey = JSON.stringify({ roots, indexerVersion: 5, schemaLoaded: schemaLibrary.loaded, schemaCounts: {
    events: schemaLibrary.events.length,
    conditions: schemaLibrary.conditions.length,
    actions: schemaLibrary.actions.length,
    controlFlow: schemaLibrary.controlFlow.length
  }});

  if (objectIndexCache && objectIndexCache.key === cacheKey && Date.now() - objectIndexCache.builtAt < 60_000) {
    return objectIndexCache.index;
  }

  // COLD-BOOT FAST PATH (SQLite stage 3): if this process has never built the
  // index, the cached copy was built with the same cacheKey, and every source
  // stamp matches, restore from the DB instead of re-decoding 60+ archives.
  if (!objectIndexCache) {
    try {
      const db = getStudioDb();
      if (db) {
        bindGamePath(db, resolved.x4GamePath || "");
        const metaRaw = getDbMeta(db, 'object_index_meta');
        if (metaRaw) {
          const meta = JSON.parse(metaRaw);
          const stamps = collectObjectIndexStamps(resolved);
          if (meta.cacheKey === cacheKey && stamps.length > 0 && dbSourcesUnchanged(db, stamps)) {
            const rows = dbReadAllObjects(db);
            if (rows.length > 0) {
              const restored: X4ObjectIndex = {
                generatedAt: meta.generatedAt,
                roots: meta.roots || [],
                scannedFiles: meta.scannedFiles || 0,
                skippedFiles: meta.skippedFiles || 0,
                truncated: !!meta.truncated,
                packedArchives: meta.packedArchives || 0,
                packedEntriesScanned: meta.packedEntriesScanned || 0,
                counts: meta.counts || {},
                items: rows.map(r => ({
                  kind: r.kind as any, id: r.id, name: r.name,
                  sourceFile: r.source_file || '', detail: r.detail || undefined
                }))
              };
              objectIndexCache = { key: cacheKey, builtAt: Date.now(), index: restored };
              console.log(`[studio-db] object index restored from SQLite cache (${rows.length} rows, no archive decode).`);
              return restored;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[studio-db] cold-boot restore failed, falling back to full build:', err);
    }
  }

  const schemaElements = [
    ...schemaLibrary.events.map(element => ({ tag: element.tag, category: "md_event" })),
    ...schemaLibrary.conditions.map(element => ({ tag: element.tag, category: "md_condition" })),
    ...schemaLibrary.actions.map(element => ({ tag: element.tag, category: "md_action" })),
    ...schemaLibrary.controlFlow.map(element => ({ tag: element.tag, category: "md_control_flow" }))
  ];
  // Roots that may hold packed .cat/.dat archives: the game install (base
  // 01.cat..NN.cat + extensions/<dlc>/ext_NN.cat) and the mod workspace.
  const catDatRoots = [resolved.x4GamePath || "", resolved.modWorkspacePath || ""].filter(Boolean);
  const index = buildX4ObjectIndex(roots, schemaElements, catDatRoots);
  objectIndexCache = { key: cacheKey, builtAt: Date.now(), index };

  // Mirror-write into the SQLite cache + record invalidation stamps and the
  // restore metadata the cold-boot fast path needs (best-effort; in-memory
  // remains authoritative for this process).
  try {
    const db = getStudioDb();
    if (db) {
      bindGamePath(db, resolved.x4GamePath || "");
      dbCacheObjectIndex(db, index.items.map(it => ({
        kind: it.kind, id: it.id, name: it.name,
        source_file: it.sourceFile || null, detail: it.detail ?? null
      })), index.generatedAt);
      const stamps = collectObjectIndexStamps(resolved);
      dbRecordSourceStamps(db, stamps);
      setDbMeta(db, 'object_index_meta', JSON.stringify({
        cacheKey,
        generatedAt: index.generatedAt,
        roots: index.roots,
        scannedFiles: index.scannedFiles,
        skippedFiles: index.skippedFiles,
        truncated: index.truncated,
        packedArchives: index.packedArchives,
        packedEntriesScanned: index.packedEntriesScanned,
        counts: index.counts
      }));
    }
  } catch (err) {
    console.warn('[studio-db] object-index mirror-write failed (ignored):', err);
  }

  return index;
}

function getSchemaIndex(): SchemaIndex {
  const resolved = resolveXsdConfig();
  return buildSchemaIndex([resolved.mdXsdPath, resolved.commonXsdPath].filter(Boolean));
}

// AI scripts use a different schema (aiscripts.xsd). Validate against it only
// when it exists in the configured schema dir; never fall back to md.xsd, which
// would produce false positives on AI-specific elements/attributes.
function getAiSchemaIndex(): SchemaIndex | null {
  const resolved = resolveXsdConfig();
  const aiXsd = path.join(resolved.schemaDir || "", "aiscripts.xsd");
  if (!fs.existsSync(aiXsd)) return null;
  return buildSchemaIndex([aiXsd, resolved.commonXsdPath].filter(Boolean));
}

/**
 * Real XSD-backed validation of the generated package. Validates the MD file and
 * any AI script files against the parsed md.xsd/common.xsd element/attribute
 * index. Returns ModDoctor-shaped diagnostics so they merge with heuristic ones.
 */
/** Build reference id sets from the game index, keyed by schema semantic type. */
function getReferenceSets(): { macros: Set<string>; wares: Set<string>; factions: Set<string> } {
  const macros = new Set<string>();
  const wares = new Set<string>();
  const factions = new Set<string>();
  try {
    const idx = getObjectIndex();
    for (const item of idx.items) {
      const id = item.id.toLowerCase();
      if (item.kind === 'ship' || item.kind === 'station' || item.kind === 'macro') macros.add(id);
      else if (item.kind === 'ware') wares.add(id);
      else if (item.kind === 'faction') { factions.add(id); factions.add(id.replace(/^faction\./, '')); }
    }
  } catch { /* no index — empty sets disable ref checks */ }
  return { macros, wares, factions };
}

function runSchemaValidation(files: Record<string, string>, modId: string): ServerDiagnostic[] {
  const out: ServerDiagnostic[] = [];
  let index: SchemaIndex;
  try {
    index = getSchemaIndex();
  } catch {
    return out;
  }
  if (!index.loaded) return out;

  const references = getReferenceSets();

  const validateFile = (filePath: string, domain: string, reportUnknownElements: boolean, useIndex: SchemaIndex) => {
    const xml = files[filePath];
    if (!xml) return;
    const diags = validateXmlAgainstSchema(xml, useIndex, { filePath, domain, reportUnknownElements, references });
    for (const d of diags) {
      out.push({
        severity: d.severity,
        category: 'schema',
        code: d.code,
        domain,
        filePath,
        message: d.line ? `${d.message} (line ${d.line})` : d.message,
        sourceRef: d.sourceRef ? { kind: 'xsd', label: d.sourceRef } : undefined
      });
    }
  };

  // Validate whatever MD file(s) the manifest emitted (the editable file may keep its
  // original name, e.g. md/ai_influence_test_chat.xml, not md/<modId>.xml).
  for (const fp of Object.keys(files)) {
    if (/^md\/[^/]+\.xml$/i.test(fp)) validateFile(fp, 'mission_director', true, index);
  }

  // AI scripts only when their own schema is available (avoid wrong-schema noise).
  const aiIndex = (() => { try { return getAiSchemaIndex(); } catch { return null; } })();
  if (aiIndex && aiIndex.loaded) {
    for (const fp of Object.keys(files)) {
      if (/^aiscripts\//i.test(fp)) validateFile(fp, 'ai_scripts', true, aiIndex);
    }
  }
  return out;
}

/**
 * True iff `child` is the same path as `root` or lives strictly inside it.
 * Uses a separator-anchored boundary so a sibling like `/mods/myMod-secret`
 * does NOT pass containment for root `/mods/myMod` (a bare startsWith prefix
 * check would wrongly accept it — the classic path-traversal edge case).
 */
function isPathWithin(child: string, root: string): boolean {
  const rootAbs = path.resolve(root);
  const childAbs = path.resolve(child);
  return childAbs === rootAbs || childAbs.startsWith(rootAbs + path.sep);
}

/** Resolve an XML patch target's base content from loose files or packed archives. */
function resolvePatchBaseContent(targetFile: string): { content: string; source: 'loose' | 'packed'; sourcePath: string } | null {
  const normalized = path.normalize(targetFile);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
  const resolved = resolveXsdConfig();
  // Prefer the BASE-GAME file (what a <diff> patch actually applies against) over
  // the mod's own output. Order: game loose -> packed base game -> mod workspace.
  const looseGame: string[] = [];
  if (resolved.x4GamePath) looseGame.push(path.join(resolved.x4GamePath, targetFile));
  for (const p of looseGame) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return { content: fs.readFileSync(p, 'utf8'), source: 'loose', sourcePath: p }; } catch { /* */ }
  }
  if (resolved.x4GamePath) {
    try {
      const packed = catDatExtractBaseGameFile(resolved.x4GamePath, targetFile);
      if (packed) return { content: packed.text, source: 'packed', sourcePath: `${packed.catPath} :: ${packed.name}` };
    } catch { /* */ }
  }
  // Fallbacks: enabled extensions, then the mod workspace (cross-mod patching).
  const fallbacks: string[] = [];
  if (resolved.x4GamePath) {
    const extPath = path.join(resolved.x4GamePath, 'extensions');
    try {
      if (fs.existsSync(extPath) && fs.statSync(extPath).isDirectory()) {
        for (const ext of fs.readdirSync(extPath)) fallbacks.push(path.join(extPath, ext, targetFile));
      }
    } catch { /* ignore */ }
  }
  if (resolved.modWorkspacePath) fallbacks.push(path.join(resolved.modWorkspacePath, targetFile));
  for (const p of fallbacks) {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return { content: fs.readFileSync(p, 'utf8'), source: 'loose', sourcePath: p }; } catch { /* */ }
  }
  return null;
}

/**
 * Server-side XML-patch diagnostics: resolve each patch's target base file
 * (loose or packed) and sanity-check the selector's root against the base file's
 * root element. Full XPath match-counting runs client-side; this surfaces the
 * highest-value server-checkable issues into /api/agent/compile and Mod Doctor.
 */
function runPatchDiagnostics(ws: { xmlPatches?: PatchDiagnosticBlock[] }): ServerDiagnostic[] {
  const out: ServerDiagnostic[] = [];
  const patches: PatchDiagnosticBlock[] = (ws.xmlPatches || []).filter(p => p.includeInBuild !== false);
  if (!patches.length) return out;
  const baseCache = new Map<string, ReturnType<typeof resolvePatchBaseContent>>();
  for (const patch of patches) {
    const targetFile = (patch.targetFile || 'libraries/wares.xml').replace(/\\/g, '/');
    if (!baseCache.has(targetFile)) baseCache.set(targetFile, resolvePatchBaseContent(targetFile));
    const base = baseCache.get(targetFile)!;
    if (!base) {
      out.push({
        severity: 'warning', category: 'schema', code: 'patch.target_unresolved', domain: 'xml_patches',
        filePath: targetFile, sourceRef: { kind: 'xml_patch', id: patch.id },
        message: `Patch target "${targetFile}" was not found in loose files or packed .cat/.dat archives. XPath selectors can't be validated and the patch may fail silently in-game.`
      });
      continue;
    }
    // Root-element sanity check: the selector's first segment should match the
    // base file's root (or a <diff> wrapper).
    const sel = String(patch.sel || patch.selector || '').trim();
    const firstSeg = sel.replace(/^\/+/, '').split(/[/[]/)[0]?.toLowerCase();
    const rootMatch = base.content.match(/<\s*([a-zA-Z_][\w.-]*)/);
    const root = rootMatch ? rootMatch[1].toLowerCase() : '';
    if (firstSeg && root && root !== 'diff' && root !== firstSeg && !base.content.toLowerCase().includes(`<${firstSeg}`)) {
      out.push({
        severity: 'warning', category: 'schema', code: 'patch.selector_root_mismatch', domain: 'xml_patches',
        filePath: targetFile, sourceRef: { kind: 'xml_patch', id: patch.id },
        message: `Patch selector "${sel}" starts with "/${firstSeg}" but the ${base.source} base file "${targetFile}" has root <${root}> and no <${firstSeg}> element — the selector will match nothing.`
      });
    } else {
      out.push({
        severity: 'info', category: 'schema', code: 'patch.target_resolved', domain: 'xml_patches',
        filePath: targetFile, sourceRef: { kind: 'xml_patch', id: patch.id },
        message: `Patch target "${targetFile}" resolved from ${base.source} base file. Selector root looks consistent; run the in-editor XPath preview for exact match counts.`
      });
    }
  }
  return out;
}

// Server-persisted active workspace (in-memory, preloaded with the Escort project)
const DEFAULT_WORKSPACE: ModWorkspace = {
  id: "workspace_default",
  name: "Player_Elite_Escort",
  version: "1.2.0",
  author: "EliteModder",
  description: "Automatically equips the user playership with heavy wing escorts on game entry.",
  nodes: [
    {
      id: "cue_0",
      type: "cue",
      label: "Mission Cue",
      xmlTag: "cue",
      x: 100,
      y: 100,
      properties: {
        name: "Escort_Trigger_Cue",
        instantiate: "true",
        namespace: "this",
        state: "active"
      },
      propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
      inputs: NODE_TEMPLATES[0].inputs,
      outputs: NODE_TEMPLATES[0].outputs
    },
    {
      id: "event_0",
      type: "event",
      label: "Event: Game Started",
      xmlTag: "event_cue_signalled",
      x: 100,
      y: 400,
      properties: { cue: "md.Setup.Start" },
      propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].propertiesSchema,
      inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].inputs,
      outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].outputs
    },
    {
      id: "action_0",
      type: "action",
      label: "Spawn Ship",
      xmlTag: "create_ship",
      x: 450,
      y: 150,
      properties: {
        name: "$MyHeavyEscort",
        macro: "ship_arg_s_fighter_01_a_macro (Elite Vanguard)",
        faction: "player",
        sector: "player.sector",
        coords: "0,500,-1000"
      },
      propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].propertiesSchema,
      inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].inputs,
      outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].outputs
    }
  ],
  links: [
    { id: "l0", sourceNodeId: "cue_0", sourcePortId: "out_cond", targetNodeId: "event_0", targetPortId: "in_cond" },
    { id: "l1", sourceNodeId: "cue_0", sourcePortId: "out_act", targetNodeId: "action_0", targetPortId: "in_act" }
  ],
  uiWidgets: [
    { id: "w_0", type: "window", x: 100, y: 100, w: 420, h: 300, label: "Escort Fleet Terminal", properties: {} },
    { id: "w_1", type: "header", x: 120, y: 140, w: 380, h: 40, label: "TACTICAL FLIGHT OPS", properties: {} },
    { id: "w_2", type: "progressbar", x: 120, y: 200, w: 380, h: 30, label: "Escort Integrity", properties: { value: 92, progressColor: "#00ccff" } }
  ],
  uiTheme: {
    backgroundColor: "#111827",
    borderColor: "#06b6d4",
    accentColor: "#0891b2",
    opacity: 0.9,
    showIcons: true
  }
};

let activeWorkspace: ModWorkspace = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE));
// Track version counter to help with client-side merge prompts
let workspaceVersion = 1;

// -----------------------------------------------------
// Helper to call generateContent with retry and fallback model capability
// to handle temporary 503 Spikes in Demand / UNAVAILABLE errors.
// -----------------------------------------------------
async function generateContentWithRetry(ai: any, params: any, maxRetries = 2) {
  const modelsToTry = [params.model, "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const modelsList = Array.from(new Set(modelsToTry.filter(Boolean)));
  
  let lastError: any = null;
  
  for (const modelName of modelsList) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AI-STUDIO] Trying generation on model: ${modelName} (attempt ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          ...params,
          model: modelName,
        });
        return response;
      } catch (error) {
        lastError = error;
        const errMessage = error.message || "";
        const errString = JSON.stringify(error) || "";
        const is503 = errMessage.includes("503") || 
                      errMessage.toLowerCase().includes("unavailable") || 
                      errMessage.toLowerCase().includes("high demand") || 
                      errString.includes("503") || 
                      errString.toLowerCase().includes("unavailable") ||
                      errString.toLowerCase().includes("high demand");
                      
        console.error(`[AI-STUDIO] Error with model ${modelName} on attempt ${attempt}:`, error);
        
        if (is503) {
          if (attempt < maxRetries) {
            const delay = attempt * 1200;
            console.log(`[AI-STUDIO] Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            console.warn(`[AI-STUDIO] Model ${modelName} failed after max retries.`);
          }
        } else {
          // If we encounter a critical non-503 failure (e.g. incorrect parameter or permissions),
          // skip to trying the fallback model immediately.
          break;
        }
      }
    }
  }
  
  throw lastError || new Error("All model options and retries failed.");
}

// -----------------------------------------------------
// Unified Multi-Provider AI Endpoint Controller (Gemini, Claude, OpenAI)
// Plays direct native fetch proxy requests to protect backend secrets.
// -----------------------------------------------------
// Security (Track B): the server's own .env provider keys may only back requests that
// came from the app UI in the browser (Origin/Referer = the app's localhost origins).
// External clients (scripts, agents, other local processes) must supply their own key
// via x-custom-api-key — they hold the studio token, but that authorizes workspace
// access, not spending the user's provider credits.
function isAppUiRequest(req: express.Request): boolean {
  const appOrigins = new Set([
    "http://localhost:3000", "http://127.0.0.1:3000",
    `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`
  ]);
  const origin = (req.headers.origin as string) || "";
  if (appOrigins.has(origin)) return true;
  const referer = (req.headers.referer as string) || "";
  for (const o of appOrigins) {
    if (referer.startsWith(o + "/") || referer === o) return true;
  }
  return false;
}

async function callMultiProviderAI(
  req: express.Request,
  systemInstruction: string,
  prompt: string,
  responseFormat: "json" | "text" = "text",
  jsonSchema?: any
): Promise<string> {
  const provider = (req.headers["x-ai-provider"] as string) || "gemini";
  const customKeyHeader = (req.headers["x-custom-api-key"] as string) || "";
  const envFallbackAllowed = isAppUiRequest(req);
  // Hard server-side timeout: a hung provider must not leave the client spinning forever.
  const AI_TIMEOUT_MS = 120_000;
  const NO_KEY_MSG = "No API key for this request. App-UI requests use the configured provider settings; external/agent requests must supply their own key via the x-custom-api-key header (the server's .env keys are reserved for the app UI).";
  const customKey = customKeyHeader;
  const model = (req.headers["x-ai-model"] as string) || "";
  const reasoning = (req.headers["x-ai-reasoning"] as string) || "none";

  if (provider === "claude") {
    const claudeKey = customKey || (envFallbackAllowed ? process.env.ANTHROPIC_API_KEY : undefined);
    if (!claudeKey) {
      throw new Error(envFallbackAllowed ? "Anthropic API key is not configured. Please supply your API Key in the AI Providers settings modal." : NO_KEY_MSG);
    }

    const finalModel = model || "claude-3-5-sonnet-latest";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      system: systemInstruction,
      messages: [
        { role: "user", content: finalPrompt }
      ]
    };

    // If user requested active thinking level, configure budget_tokens
    if (reasoning !== "none" && (finalModel.includes("3-7") || finalModel.includes("4-") || finalModel.includes("thinking") || reasoning === "extra_high" || reasoning === "high")) {
      let budget = 2048;
      if (reasoning === "low") budget = 1024;
      else if (reasoning === "medium") budget = 2048;
      else if (reasoning === "high") budget = 4096;
      else if (reasoning === "extra_high") budget = 8192;

      bodyPayload.thinking = {
        type: "enabled",
        budget_tokens: budget
      };
      bodyPayload.max_tokens = budget + 4000;
    } else {
      bodyPayload.max_tokens = 4000;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Anthropic Claude API returned error code ${response.status}`);
    }

    let textOut = data?.content?.[0]?.text || "";
    // Clean codeblock wraps if returned
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else if (provider === "openai") {
    const openaiKey = customKey || (envFallbackAllowed ? process.env.OPENAI_API_KEY : undefined);
    if (!openaiKey) {
      throw new Error(envFallbackAllowed ? "OpenAI API key is not configured. Please supply your API Key in the AI Providers settings modal." : NO_KEY_MSG);
    }

    const finalModel = model || "gpt-4o";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: finalPrompt }
      ],
      response_format: responseFormat === "json" ? { type: "json_object" } : undefined
    };

    // Custom reasoning levels for o-models / reasoning
    if (reasoning !== "none" && (finalModel.startsWith("o") || finalModel.includes("reasoning"))) {
      let effort: "low" | "medium" | "high" = "medium";
      if (reasoning === "low") effort = "low";
      else if (reasoning === "medium") effort = "medium";
      else if (reasoning === "high" || reasoning === "extra_high") effort = "high";

      bodyPayload.reasoning_effort = effort;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenAI API returned error code ${response.status}`);
    }

    let textOut = data?.choices?.[0]?.message?.content || "";
    // Clean codeblock wraps if returned
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else if (provider === "openrouter") {
    const openrouterKey = customKey || (envFallbackAllowed ? (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY) : undefined);
    if (!openrouterKey) {
      throw new Error(envFallbackAllowed ? "OpenRouter API key is not configured. Please supply your API Key in the AI Providers settings modal." : NO_KEY_MSG);
    }

    const finalModel = model || "google/gemini-2.1-flash";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: finalPrompt }
      ],
      response_format: responseFormat === "json" ? { type: "json_object" } : undefined
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai.studio/build",
        "X-Title": "AI Studio Build"
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenRouter API returned error code ${response.status}`);
    }

    let textOut = data?.choices?.[0]?.message?.content || "";
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else {
    // Default to Google Gemini API (standard model schema)
    const geminiKey = customKey || (envFallbackAllowed ? process.env.GEMINI_API_KEY : undefined);
    if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
      throw new Error(envFallbackAllowed ? "Gemini API key is not configured. Please supply your API Key in the AI Providers settings modal to enable cognitive assistance." : NO_KEY_MSG);
    }

    const finalModel = model || "gemini-3.5-flash";

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        // Server-side cap so a hung Gemini call can't spin the client forever.
        timeout: AI_TIMEOUT_MS
      }
    });

    const config: any = {
      systemInstruction,
      temperature: responseFormat === "json" ? 0.3 : 0.7,
    };

    if (reasoning !== "none") {
      // Set thinking budget or custom instructions
      let extraInstructions = "";
      if (reasoning === "low") extraInstructions = "\n(Optimize for brief, straightforward, direct responses with light analysis)";
      else if (reasoning === "medium") extraInstructions = "\n(Employ steady logical step-by-step thinking processes for accuracy)";
      else if (reasoning === "high") extraInstructions = "\n(Utilize deep internal multi-step reasoning before outputting details)";
      else if (reasoning === "extra_high") extraInstructions = "\n(Maximize comprehensive logical thinking effort and address all latent edge cases)";
      
      config.systemInstruction = `${systemInstruction}${extraInstructions}`;
    }

    if (responseFormat === "json") {
      config.responseMimeType = "application/json";
      config.responseSchema = jsonSchema;
    }

    const response = await generateContentWithRetry(ai, {
      model: finalModel,
      contents: prompt,
      config
    });

    return response.text || "";
  }
}

// -----------------------------------------------------
// 1. ORIGINAL GEMINI CHAT CHOTBOT API
// -----------------------------------------------------
app.post("/api/gemini", async (req, res) => {
  const { prompt, currentWorkspace, diagnostics } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt parameter." });
  }

  try {
    const systemInstruction = `You are an elite X4: Foundations XML & Mission Director MD scripting expert and workspace coordinator.
Help the player write clean, functional scripts, design layouts, and troubleshoot diagnostics.

Your response MUST be a JSON object that satisfies the following JSON Schema:
{
  "type": "object",
  "required": ["text"],
  "properties": {
    "text": {
      "type": "string",
      "description": "Explanations, answers, recommendations or instructions. Use markdown formatting to render clean lists and scan-friendly code blocks."
    },
    "actionRequired": {
      "type": "boolean",
      "description": "Set to true if the user asked you to adjust/fix properties, toggle options, or modify components, and you are providing the corrected workspace."
    },
    "proposedWorkspace": {
      "type": "object",
      "description": "The complete, updated ModWorkspace object with the proposed edits applied. Keep all other nodes, links, and widgets intact."
    }
  }
}

If the player has validation warnings/errors or requests a change, you should analyze the issue, explain the fix in 'text', set 'actionRequired' to true, and provide the updated workspace in 'proposedWorkspace' (e.g., setting 'includeInBuild: false' on UI widgets, altering node properties, etc.). Otherwise, keep 'actionRequired' false and omit 'proposedWorkspace'.`;
    
    let finalPrompt = prompt;
    if (currentWorkspace) {
      finalPrompt = `You are helping the player analyze, fix, or write script code within the context of their active visual node-graph workspace and list of active XML schema diagnostics.

[Active Workspace Context]:
- Name: "${currentWorkspace.name}"
- Description: "${currentWorkspace.description || "No description provided."}"
- Nodes: ${JSON.stringify(currentWorkspace.nodes?.map((n: any) => ({ id: n.id, label: n.label, type: n.type, xmlTag: n.xmlTag, properties: n.properties })) || [])}
- Links/Connections: ${JSON.stringify(currentWorkspace.links || [])}
- UI Widgets: ${JSON.stringify(currentWorkspace.uiWidgets || [])}

[Live XML Schema Diagnostics (Errors / Warnings)]:
${diagnostics && diagnostics.length > 0 ? JSON.stringify(diagnostics, null, 2) : "0 Errors, 0 Warnings. Everything currently compiles and validates successfully!"}

[User Query / Direct Instructions]:
"${prompt}"

Please respond accurately to the user query using the above active workspace state and diagnostics as key context. If they are asking you to fix a warning or error, analyze which node or property is violating rules and tell them exactly how they can adjust those parameters!`;
    }

    const schema = {
      type: Type.OBJECT,
      required: ["text"],
      properties: {
        text: { type: Type.STRING, description: "Detailed response text, explanations or guidelines." },
        actionRequired: { type: Type.BOOLEAN, description: "True if you are proposing one or more automated fixes such as toggling options/attributes on nodes or widgets." },
        proposedWorkspace: {
          type: Type.OBJECT,
          description: "The complete updated ModWorkspace object. You MUST preserve the existing nodes, UI widgets, and links, but make the requested changes (like setting includeInBuild to false for specific widgets, changing properties on a node, etc.)."
        }
      }
    };

    const responseText = await callMultiProviderAI(req, systemInstruction, finalPrompt, "json", schema);
    
    try {
      const parsed = JSON.parse(responseText.trim());
      return res.json({
        text: parsed.text || "",
        actionRequired: !!parsed.actionRequired,
        proposedWorkspace: parsed.proposedWorkspace || null
      });
    } catch {
      return res.json({ text: responseText, actionRequired: false, proposedWorkspace: null });
    }
  } catch (error) {
    console.error("Multi-Provider chat routing error: ", error);
    return res.status(500).json({ error: error.message || "Failed to trigger AI compilation." });
  }
});

/**
 * POST /api/gemini/analyze
 * Analyzes the visual graph workspace and returns a structured, plain-English summary breakdown.
 */
app.post("/api/gemini/analyze", async (req, res) => {
  const { workspace } = req.body;
  if (!workspace) {
    return res.status(400).json({ error: "Missing workspace in request body." });
  }

  try {
    const systemInstruction = `You are a cognitive script compiler and narrative designer for X4: Foundations' Egosoft Mission Director (MD) codebase.
Your task is to analyze the provided visual graph workspace representing an X4 mod. Explain in plain English how the logic flows, what events are triggered, what actions are taken, and registry of any entities created (ships, stations, sounds, UI widgets, etc.).
Be highly precise and translate technical terms to clear logical human outcomes. Avoid overly technical jargon, make it friendly, descriptive, and clean. Ensure to outline safety warnings if any logical flaws exist (like disconnected nodes or triggers with no actions).`;

    const prompt = `Analyze this X4 Foundations ModWorkspace: ${JSON.stringify(workspace)}`;
    const schema = {
      type: Type.OBJECT,
      required: ["summary", "triggerCondition", "flowSteps", "entityRegistry", "tacticalInsights"],
      properties: {
        summary: {
          type: Type.STRING,
          description: "A high-level 1-2 sentence overview of what this script actually accomplishes in plain English."
        },
        triggerCondition: {
          type: Type.STRING,
          description: "Clear explanation of how the script triggers in the game (e.g. game start, entering slot, sector change, etc.)."
        },
        flowSteps: {
          type: Type.ARRAY,
          description: "Step-by-step logical progression of the cues and links in the node network. Detail the links / connections between nodes in clear sequential order.",
          items: {
            type: Type.OBJECT,
            required: ["nodeId", "nodeLabel", "xmlTag", "plainEnglishAction", "sequenceOrder"],
            properties: {
              nodeId: { type: Type.STRING },
              nodeLabel: { type: Type.STRING },
              xmlTag: { type: Type.STRING },
              plainEnglishAction: { type: Type.STRING, description: "A highly descriptive sentence explaining what this specific node does and what settings it uses." },
              sequenceOrder: { type: Type.INTEGER, description: "Sequential order of execution start from 1" }
            }
          }
        },
        entityRegistry: {
          type: Type.ARRAY,
          description: "List of all physical or auditory assets created/spawned or customized by this script, including HUD UI widgets designed.",
          items: {
            type: Type.OBJECT,
            required: ["name", "type", "detail"],
            properties: {
              name: { type: Type.STRING, description: "Variables name or reference, e.g. $MyHeavyEscort, UI Frame 1, Sound: alarm_red" },
              type: { type: Type.STRING, description: "e.g., Ship, Station, UI Widget, Sound, State" },
              detail: { type: Type.STRING, description: "Specification details, like macros, faction settings, dimensions, colors, or values." }
            }
          }
        },
        tacticalInsights: {
          type: Type.ARRAY,
          description: "3 highly valuable recommendations, tips, or potential logic safety bugs about this visual script layout.",
          items: {
            type: Type.STRING
          }
        }
      }
    };

    const textOutput = await callMultiProviderAI(req, systemInstruction, prompt, "json", schema);
    const analysisResult = JSON.parse(textOutput.trim());
    return res.json({ analysis: analysisResult });

  } catch (error) {
    console.error("AI script analysis request error: ", error);
    return res.status(500).json({ error: error.message || "Failed to analyze mod script using AI." });
  }
});

/**
 * POST /api/gemini/analyze-log
 * Analyzes copy-pasted or uploaded debug.log contents, matches errors, logs, or cue warnings
 * with the visual script workspace, and generates direct 1-click playtest auto-fixes.
 */
app.post("/api/gemini/analyze-log", async (req, res) => {
  const { workspace, logs } = req.body;
  if (!workspace || !logs) {
    return res.status(400).json({ error: "Missing workspace or logs in request body." });
  }

  try {
    const systemInstruction = `You are a legendary senior game engine compiler and Mission Director (MD) debugger for X4: Foundations (Egosoft).
Your job is to analyze the user's modding game logs (such as debug.log or custom terminal traces) in context with their visual node workspace.
You must find and correlate issues mentioned in the logs to the specific nodes in the workspace.
For each correlated issue, explain the cause in clear plain English, cite the effect on the game, recommend a detailed playbook action, and provide a 1-click JSON "autoFix" structure to update a node property in the editor when applicable.

Validation / Correlation Rules:
- Under 'affectedNodeId', specify the ID of the node that caused or is corresponding to the error (e.g., matching a cue name to the node's 'name' property, or a sound/ship action).
- If 'autoFix' is generated, set type: 'update_node_property', nodeId to the ID of that node, propertyKey to the property key (like 'instantiate', 'faction', 'macro', etc.), and propertyValue to the corrected value.
- If no node perfectly matches, or it's a general game load log, leave affectedNodeId empty and omit the autoFix field.
- Be supportive, knowledgeable, and provide awesome expert playtester tips.`;

    const prompt = `Here is the current visual workspace:
${JSON.stringify({
  name: workspace.name,
  description: workspace.description,
  nodes: workspace.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label, properties: n.properties, xmlTag: n.xmlTag })),
  links: workspace.links
})}

Here is the log segment uploaded by the user / playtester:
-----
${logs}
-----

Analyze this trace and return the structured issues diagnostics and suggestions.`;

    const schema = {
      type: Type.OBJECT,
      required: ["parsedLogsCount", "issues", "summaryOfGameMDReload"],
      properties: {
        parsedLogsCount: {
          type: Type.INTEGER,
          description: "Estimated number of distinct MD script errors/warnings parsed from logs"
        },
        summaryOfGameMDReload: {
          type: Type.STRING,
          description: "Brief human diagnosis summarizing the current playtest session reload state in X4."
        },
        issues: {
          type: Type.ARRAY,
          description: "Array of distinct warning/error issues found with actionable solutions.",
          items: {
            type: Type.OBJECT,
            required: ["id", "severity", "title", "errorLogSnippet", "explanation", "impact", "suggestedAction"],
            properties: {
              id: { type: Type.STRING, description: "Unique ID for identifying issue e.g. err_1" },
              severity: { type: Type.STRING, description: "Must be 'error' or 'warning'" },
              title: { type: Type.STRING, description: "Short descriptive title of the issue" },
              errorLogSnippet: { type: Type.STRING, description: "The exact line or relevant segment from user's logs" },
              explanation: { type: Type.STRING, description: "Why the Egosoft engine threw this warning/error" },
              impact: { type: Type.STRING, description: "How this impacts the gameplay experience or script execution" },
              suggestedAction: { type: Type.STRING, description: "Clear instructions of how the player should fix this manually inside or outside" },
              affectedNodeId: { type: Type.STRING, description: "Optional. The exact node ID from the workspace suffering from this issue." },
              autoFix: {
                type: Type.OBJECT,
                description: "Optional. Provide a 1-click auto-repair payload for the editor if applicable.",
                properties: {
                  type: { type: Type.STRING, description: "Must be 'update_node_property'" },
                  nodeId: { type: Type.STRING },
                  propertyKey: { type: Type.STRING, description: "Name of property to change on node" },
                  propertyValue: { type: Type.STRING, description: "The new corrected value for property" }
                }
              }
            }
          }
        }
      }
    };

    const textOutput = await callMultiProviderAI(req, systemInstruction, prompt, "json", schema);
    const parsedOutput = JSON.parse(textOutput.trim());
    return res.json({ analysis: parsedOutput });

  } catch (error) {
    console.error("AI log analysis error: ", error);
    return res.status(500).json({ error: error.message || "Failed to analyze X4 reload logs via AI compiler." });
  }
});


// -----------------------------------------------------
// 2. EXTERNAL AI AGENT DEVELOPMENT API ENDPOINTS
// -----------------------------------------------------

/**
 * GET /api/agent/schema
 * Exposes core constants, valid selection macro values, structural boundaries, and base templates.
 * Extremely helpful for AI agents to understand exactly what values are valid before making updates.
 */
app.get("/api/agent/schema", (req, res) => {
  const currentConfig = readXsdConfig();
  const resolvedConfig = resolveXsdConfig();
  return res.json({
    api_version: "2026-06-10.agent.v2",
    description: "X4 Forge external agent contract. Use this to inspect supported workspace domains, valid values, compile outputs, and protected API routes before modifying the studio.",
    auth: {
      read_only_schema_is_public: true,
      protected_routes: "Every /api route except GET /api/agent/schema requires Authorization: Bearer <token>.",
      token_sources_for_local_agents: [
        "Read process.env.STUDIO_API_TOKEN when the server was started with one.",
        "Otherwise read the gitignored .studio-api-token file in the project root.",
        "The browser app receives the same token via injected window.__STUDIO_API_TOKEN__."
      ],
      curl_header: "Authorization: Bearer $(Get-Content .studio-api-token)"
    },
    workspace_contract: {
      required_root_fields: ["id", "name", "version", "author", "description", "nodes", "links", "uiWidgets", "uiTheme"],
      optional_domain_fields: ["tFiles", "aiScripts", "wares", "jobs", "xmlPatches"],
      domains: {
        mission_director: {
          fields: ["nodes", "links"],
          output: "md/<modId>.xml",
          node_types: ["cue", "event", "condition", "action", "variable", "comment"],
          link_ports: {
            cue_conditions: "cue.out_cond -> event_or_condition.in_cond",
            cue_actions: "cue.out_act -> first_action.in_act",
            action_chain: "action.out_next -> next_action.in_act",
            child_cues: "cue.out_sub -> child_cue.in_flow"
          }
        },
        ui_layout: {
          fields: ["uiWidgets", "uiTheme"],
          outputs: ["ui.xml", "ui/<modId>.lua"],
          note: "X4-correct UI packaging: an extension-root ui.xml <addon><environment type=menus> index registering a Lua entry point under ui/. The legacy non-standard md_ui_layouts/<id>_ui.xml is no longer packaged.",
          widget_types: ["window", "table", "button", "text", "progressbar", "dropdown", "header", "input", "chat"],
          theme_fields: ["backgroundColor", "borderColor", "accentColor", "opacity", "showIcons"]
        },
        translations: {
          field: "tFiles",
          output: "t/<fileName>",
          shape: {
            languageId: "string, e.g. 44",
            fileName: "string, e.g. 0001-l044.xml",
            pages: [{ id: "string", title: "optional string", items: [{ id: "string", value: "string", description: "optional string" }] }]
          }
        },
        ai_scripts: {
          field: "aiScripts",
          output: "aiscripts/<script.name>.xml",
          action_commands: ["move_to", "flee", "shoot", "dock_at", "wait", "find_objects", "custom_xml"],
          param_types: ["object", "number", "boolean", "ware", "faction"],
          attention_levels: ["high", "low"]
        },
        libraries: {
          fields: ["wares", "jobs"],
          outputs: ["libraries/wares.xml", "libraries/jobs.xml"],
          ware_transport_types: ["container", "liquid", "solid", "energy"],
          job_ship_classes: ["fighter", "corvette", "destroyer", "carrier", "freighter"]
        },
        xml_patches: {
          field: "xmlPatches",
          output: "<patch.targetFile>",
          actions: ["add", "replace", "remove"],
          common_targets: ["libraries/ship_macros.xml", "libraries/sound_library.xml", "libraries/wares.xml", "libraries/jobs.xml"]
        },
        object_index: {
          endpoint: "/api/agent/object-index",
          purpose: "Search local loose XML and packed .cat/.dat game/mod data for ships, station macros, wares, factions, sounds, jobs, AI scripts, generic macros, and schema-derived MD elements.",
          query: {
            q: "optional text search over id, name, detail, and sourceFile",
            kind: "optional kind filter: all | ship | station | ware | faction | sound | job | aiscript | md_element | macro",
            limit: "optional result cap, max 2000"
          },
          note: "Indexes loose XML from configured paths AND decodes packed .cat/.dat archives (base game + DLC extensions) for catalog macros (index/macros.xml), factions, wares, jobs, and sounds. Response includes packedArchives and packedEntriesScanned counters."
        },
        package_manifest: {
          always_outputs: ["content.xml", "README.md"],
          conditional_outputs: ["md/<modId>.xml", "ui.xml", "ui/<modId>.lua", "aiscripts/*.xml", "libraries/wares.xml", "libraries/jobs.xml", "t/*.xml", "<xmlPatch.targetFile>"]
        },
        mod_doctor: {
          purpose: "Package-wide diagnostics for agents and the Studio UI.",
          coverage: ["content.xml metadata", "Mission Director graph/XML", "UI layout dimensions and runtime-risk warnings", "AI script names/actions/params", "wares price and production invariants", "jobs required fields and task references", "translation language/page/item ids", "XML patch selectors/actions/content", "compile settings and includeInBuild exclusions"],
          diagnostic_fields: ["severity", "message", "category", "code", "domain", "filePath", "nodeId", "sourceRef"]
        }
      },
      minimal_workspace: sanitizeWorkspace({ name: "My_AI_Mod", nodes: [], links: [], uiWidgets: [] })
    },
    endpoints: [
      {
        method: "GET",
        path: "/api/agent/schema",
        auth: false,
        purpose: "Fetch this agent contract, valid constants, schema templates, endpoint catalog, and workspace domain descriptions."
      },
      {
        method: "GET",
        path: "/api/agent/workspace",
        auth: true,
        purpose: "Read the active studio workspace plus version counter."
      },
      {
        method: "POST",
        path: "/api/agent/workspace",
        auth: true,
        body: { workspace: "ModWorkspace", expectedVersion: "optional number (optimistic concurrency; 409 on mismatch)", dryRun: "optional boolean (validate + return diagnostics without applying)" },
        purpose: "Replace the active studio workspace and bump the version if changed.",
        example: "POST {\"workspace\":{...},\"expectedVersion\":7} -> 409 {error:'version_conflict'} if stale, else 200 {applied,version,diagnosticsSummary}"
      },
      {
        method: "POST",
        path: "/api/agent/workspace/merge",
        auth: true,
        body: { changes: "partial top-level ModWorkspace fields to merge (JSON-merge-patch)", expectedVersion: "optional number", dryRun: "optional boolean" },
        purpose: "Granular edit: merge only the provided top-level fields into the active workspace.",
        example: "POST {\"changes\":{\"version\":\"2.0.0\"},\"expectedVersion\":7}"
      },
      {
        method: "GET",
        path: "/api/agent/diagnostics",
        auth: false,
        purpose: "Read-only current diagnostics for the active workspace (Mod Doctor + XSD + patch checks) with a severity summary."
      },
      {
        method: "POST",
        path: "/api/agent/compile",
        auth: true,
        body: { workspace: "optional ModWorkspace; defaults to active workspace" },
        purpose: "Compile every supported workspace domain into an in-memory file manifest without writing to disk."
      },
      {
        method: "POST",
        path: "/api/agent/package",
        auth: true,
        body: { workspace: "optional ModWorkspace; defaults to active workspace" },
        purpose: "Alias of compile for agents that want a package/file-manifest vocabulary."
      },
      {
        method: "POST",
        path: "/api/agent/project/create",
        auth: true,
        body: { meta: "content/project metadata: id, name, version, author, description, deps" },
        purpose: "Create a stateless multi-file ExtensionProject with content.xml already authored."
      },
      {
        method: "POST",
        path: "/api/agent/project/file/create",
        auth: true,
        body: { project: "ExtensionProject", file: "{ path, kind?, content? }" },
        purpose: "Return a new ExtensionProject with one file added/replaced and path-kind classified."
      },
      {
        method: "POST",
        path: "/api/agent/project/generate",
        auth: true,
        body: { spec: "ProjectGenerationSpec; default kind ai_influence_starter" },
        purpose: "Generate a bounded multi-file AI Influence starter project: content.xml, MD, contract Lua/MD, and ai_influence_chat.lua."
      },
      {
        method: "POST",
        path: "/api/agent/project/package",
        auth: true,
        body: { project: "ExtensionProject" },
        purpose: "Validate and return a file manifest for a multi-file ExtensionProject without mutating active workspace."
      },
      {
        method: "POST",
        path: "/api/agent/project/validate-crossfile",
        auth: true,
        body: { project: "ExtensionProject" },
        purpose: "Project-level diagnostics for structure, cross-file cue refs, MD-to-Lua RegisterEvent coverage, Lua-to-MD event_ui_triggered coverage, and content.xml dependency sanity."
      },
      {
        method: "POST",
        path: "/api/agent/deploy",
        auth: true,
        body: { workspace: "optional ModWorkspace; defaults to active workspace" },
        purpose: "Compile and write the package into configured Mod Workspace and/or X4 game extensions paths."
      },
      {
        method: "GET",
        path: "/api/agent/game-log/status?modId=<optionalModId>",
        auth: true,
        purpose: "Read recent X4 debuglog.txt/uidata.log output, classify active-mod errors or warnings, and report whether the log is stale relative to the last Studio deploy."
      },
      {
        method: "GET",
        path: "/api/agent/debug-watcher/brief?modId=<optionalModId>&expect=<commaSeparatedCueOrMarkerNames>",
        auth: true,
        purpose: "Headless debug watcher report for agents: active-mod status, timeline, expected-chain pass/miss, since-deploy freshness, and copyable evidence artifact."
      },
      {
        method: "GET",
        path: "/api/agent/object-index?q=<optional>&kind=<optional>&limit=<optional>",
        auth: true,
        purpose: "Search local X4 loose XML data and schema elements for object ids external agents can use in generated mods."
      },
      {
        method: "POST",
        path: "/api/agent/generate",
        auth: true,
        body: { prompt: "string", currentWorkspace: "optional ModWorkspace", diagnostics: "optional XMLDiagnostic[]" },
        purpose: "Ask the server-side AI provider to generate/edit a workspace. Current implementation mainly edits MD graph and UI domains while preserving other existing domains."
      },
      {
        method: "GET",
        path: "/api/schema/library",
        auth: true,
        purpose: "Read the loaded XSD-derived MD schema library."
      },
      {
        method: "GET",
        path: "/api/schema/config",
        auth: true,
        purpose: "Read configured X4 game path, mod workspace path, filesystem path, and XSD schema path."
      },
      {
        method: "POST",
        path: "/api/schema/config",
        auth: true,
        purpose: "Update directory settings and reload md.xsd/common.xsd."
      },
      {
        method: "GET",
        path: "/api/fs/list",
        auth: true,
        purpose: "List configured filesystem/mod workspace root."
      },
      {
        method: "GET",
        path: "/api/fs/read?path=<relativePath>",
        auth: true,
        purpose: "Read a file under the configured filesystem/mod workspace root."
      },
      {
        method: "POST",
        path: "/api/fs/write",
        auth: true,
        body: { path: "relative path under configured root", content: "string" },
        purpose: "Write a file under the configured filesystem/mod workspace root."
      },
      {
        method: "POST",
        path: "/api/fs/create",
        auth: true,
        body: { name: "relative name", type: "directory or file" },
        purpose: "Create a file or directory under the configured filesystem/mod workspace root."
      },
      {
        method: "GET",
        path: "/api/fs/snapshots?modId=<modId>",
        auth: true,
        purpose: "List package snapshots for a compiled mod."
      },
      {
        method: "POST",
        path: "/api/fs/restore-snapshot",
        auth: true,
        body: { modId: "string", snapshotName: "string" },
        purpose: "Restore a snapshot into the active server workspace."
      },
      {
        method: "POST",
        path: "/api/github/*",
        auth: true,
        purpose: "GitHub load, push, create, device-flow, and commits endpoints used by the SOURCE panel."
      }
    ],
    current_state: {
      workspace_version: workspaceVersion,
      active_workspace_domains: summarizeWorkspaceDomains(activeWorkspace),
      config: {
        has_x4_game_path: Boolean(currentConfig.x4GamePath),
        has_mod_workspace_path: Boolean(currentConfig.modWorkspacePath),
        has_filesystem_path: Boolean(currentConfig.filesystemPath),
        has_xsd_schema_path: Boolean(currentConfig.xsdSchemaPath),
        resolved_md_xsd: resolvedConfig.mdExists,
        resolved_common_xsd: resolvedConfig.commonExists
      },
      last_deploy: lastDeployInfo
    },
    constants: {
      factions: X4_FACTIONS,
      ship_macros: X4_SHIP_MACROS,
      station_macros: X4_STATION_MACROS,
      sound_effects: X4_SOUND_EFFECTS,
    },
    node_templates: NODE_TEMPLATES,
    schema_library_loaded: schemaLibrary.loaded,
    schema_counts: {
      events: schemaLibrary.events.length,
      conditions: schemaLibrary.conditions.length,
      actions: schemaLibrary.actions.length,
      control_flow: schemaLibrary.controlFlow.length,
    },
    schema_node_templates: schemaLibrary.templates,
    presets_list: Object.keys(PRESETS).map(key => ({
      id: key,
      name: PRESETS[key].name,
      desc: PRESETS[key].desc
    })),
    compile_response_shape: {
      success: "boolean",
      modId: "safe extension folder id",
      files: "Record<relativePath,string> containing every generated package file",
      legacy_files: {
        mission_director_xml: "same content as files['md/<modId>.xml']",
        ui_index_xml: "same content as files['ui.xml'] when UI widgets exist"
      },
      diagnostics: "Mod Doctor package-wide diagnostics with optional code, domain, filePath, nodeId, and sourceRef metadata",
      file_count: "number"
    },
    game_log_status_shape: {
      status: "no_log | stale | clean | warnings | errors",
      modId: "safe extension folder id used for active-mod line matching",
      selectedLogPath: "debuglog.txt or uidata.log path when found",
      checkedPaths: "candidate paths searched",
      lastDeploy: "last successful Studio deploy metadata when available",
      counts: "issue counters for all tailed issues and active-mod issues",
      issues: "recent errors/warnings whose text mentions the active mod id",
      recentGlobalIssues: "recent errors/warnings from the log tail, even when not matched to the active mod",
      tailLines: "last log lines used for UI/runtime inspection"
    },
    object_index_shape: {
      generatedAt: "ISO timestamp for index build",
      roots: "existing roots scanned",
      scannedFiles: "number of XML files scanned",
      skippedFiles: "number of unreadable or too-large files skipped",
      truncated: "true if scan hit safety cap",
      counts: "counts by object kind",
      items: "array of { id, name, kind, sourceFile, detail }"
    }
  });
});

app.get("/api/schema/library", (req, res) => {
  return res.json(schemaLibrary);
});

app.get("/api/schema/config", (req, res) => {
  try {
    return res.json({
      config: readXsdConfig(),
      resolved: resolveXsdConfig(),
      schema_counts: {
        events: schemaLibrary.events.length,
        conditions: schemaLibrary.conditions.length,
        actions: schemaLibrary.actions.length,
        control_flow: schemaLibrary.controlFlow.length,
      },
      loaded: schemaLibrary.loaded,
      error: schemaLibrary.error
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to read schema config." });
  }
});

app.post("/api/schema/config", (req, res) => {
  try {
    const schemaDir = String(req.body?.schemaDir || '').trim();
    const gamePath = String(req.body?.x4GamePath || '').trim();
    const modWorkspacePath = req.body?.modWorkspacePath !== undefined ? String(req.body.modWorkspacePath || '').trim() : undefined;
    const filesystemPath = req.body?.filesystemPath !== undefined ? String(req.body.filesystemPath || '').trim() : undefined;

    if (!schemaDir) {
      return res.status(400).json({ error: "Missing required schemaDir." });
    }

    const nextConfig = {
      ...readXsdConfig(),
      ...(gamePath ? { x4GamePath: gamePath } : {}),
      ...(modWorkspacePath !== undefined ? { modWorkspacePath } : {}),
      ...(filesystemPath !== undefined ? { filesystemPath } : {}),
      xsdSchemaPath: schemaDir,
      schemaFiles: ['md.xsd', 'common.xsd']
    };
    const resolved = resolveXsdConfig(nextConfig);
    if (!resolved.mdExists || !resolved.commonExists) {
      return res.status(400).json({
        error: "Schema directory must contain both md.xsd and common.xsd.",
        resolved
      });
    }

    writeXsdConfig(nextConfig);
    const library = reloadSchemaLibrary();
    return res.json({
      success: library.loaded,
      config: nextConfig,
      resolved: resolveXsdConfig(nextConfig),
      schema_counts: {
        events: library.events.length,
        conditions: library.conditions.length,
        actions: library.actions.length,
        control_flow: library.controlFlow.length,
      },
      loaded: library.loaded,
      error: library.error
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to update schema config." });
  }
});

// Helper for scanning filesystem recursively
function scanDirectory(dir: string, baseDir: string): any[] {
  const items: any[] = [];
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      if (entry.name.startsWith('.') && entry.name !== '.snapshots') {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          kind: 'directory',
          path: relativePath,
          children: scanDirectory(fullPath, baseDir)
        });
      } else {
        items.push({
          name: entry.name,
          kind: 'file',
          path: relativePath
        });
      }
    }
  } catch (err) {
    console.warn(`Error scanning directory ${dir}:`, err);
  }
  
  return items.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

// Server Filesystem list endpoint
app.get("/api/fs/list", (req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const rootPath = resolved.filesystemPath || resolved.modWorkspacePath;
    if (!rootPath) {
      return res.json([]);
    }
    if (!fs.existsSync(rootPath)) {
      return res.json([]);
    }
    const tree = scanDirectory(rootPath, rootPath);
    return res.json(tree);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list filesystem." });
  }
});

// Server Filesystem read endpoint
app.get("/api/fs/read", (req, res) => {
  try {
    const relativePath = String(req.query.path || '').trim();
    if (!relativePath) {
      return res.status(400).json({ error: "Missing path parameter." });
    }
    const resolved = resolveXsdConfig();
    const rootPath = resolved.filesystemPath || resolved.modWorkspacePath;
    if (!rootPath) {
      return res.status(400).json({ error: "No filesystem/workspace path configured." });
    }
    
    const safePath = path.resolve(rootPath, relativePath);
    if (!isPathWithin(safePath, rootPath)) {
      return res.status(403).json({ error: "Forbidden: Directory traversal detected." });
    }
    
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found." });
    }
    
    const content = fs.readFileSync(safePath, 'utf8');
    return res.json({ content });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to read file." });
  }
});

// Server base target file resolver for XML patch preview/validation
app.get("/api/patch/base-content", (req, res) => {
  try {
    const targetFile = String(req.query.targetFile || '').trim();
    if (!targetFile) {
      return res.status(400).json({ error: "Missing targetFile parameter." });
    }
    const normalized = path.normalize(targetFile);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return res.status(400).json({ error: "Forbidden: Invalid targetFile path." });
    }

    const resolved = resolveXsdConfig();
    const pathsToCheck: string[] = [];

    // Check workspace path
    if (resolved.modWorkspacePath) {
      pathsToCheck.push(path.join(resolved.modWorkspacePath, targetFile));
    }
    // Check main game path
    if (resolved.x4GamePath) {
      pathsToCheck.push(path.join(resolved.x4GamePath, targetFile));
      // Check extensions folder
      const extPath = path.join(resolved.x4GamePath, 'extensions');
      if (fs.existsSync(extPath) && fs.statSync(extPath).isDirectory()) {
        try {
          const extensions = fs.readdirSync(extPath);
          for (const ext of extensions) {
            pathsToCheck.push(path.join(extPath, ext, targetFile));
          }
        } catch {
          // Ignore
        }
      }
    }

    for (const p of pathsToCheck) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const content = fs.readFileSync(p, 'utf8');
        return res.json({ content, sourcePath: p, source: 'loose' });
      }
    }

    // Loose lookup failed — fall back to decoding the base-game .cat/.dat archives.
    if (resolved.x4GamePath) {
      try {
        const packed = catDatExtractBaseGameFile(resolved.x4GamePath, targetFile);
        if (packed) {
          return res.json({
            content: packed.text,
            sourcePath: `${packed.catPath} :: ${packed.name}`,
            source: 'packed',
            note: 'Extracted from packed base-game .cat/.dat archives. DLC additions are not merged into this preview.'
          });
        }
      } catch {
        // fall through to 404
      }
    }

    return res.status(404).json({ error: `File '${targetFile}' not found in loose files or packed game archives (.cat/.dat).`, isPacked: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to find target base file." });
  }
});

// Server Filesystem write endpoint
app.post("/api/fs/write", (req, res) => {
  try {
    const relativePath = String(req.body?.path || '').trim();
    const content = req.body?.content ?? '';
    if (!relativePath) {
      return res.status(400).json({ error: "Missing path parameter." });
    }
    const resolved = resolveXsdConfig();
    const rootPath = resolved.filesystemPath || resolved.modWorkspacePath;
    if (!rootPath) {
      return res.status(400).json({ error: "No filesystem/workspace path configured." });
    }
    
    const safePath = path.resolve(rootPath, relativePath);
    if (!isPathWithin(safePath, rootPath)) {
      return res.status(403).json({ error: "Forbidden: Directory traversal detected." });
    }
    
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(safePath, content, 'utf8');
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to write file." });
  }
});

// Server Filesystem create endpoint
app.post("/api/fs/create", (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Missing name parameter." });
    }
    const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const resolved = resolveXsdConfig();
    const rootPath = resolved.filesystemPath || resolved.modWorkspacePath;
    if (!rootPath) {
      return res.status(400).json({ error: "No filesystem/workspace path configured." });
    }
    
    const safePath = path.resolve(rootPath, cleanName);
    if (!isPathWithin(safePath, rootPath)) {
      return res.status(403).json({ error: "Forbidden: Directory traversal detected." });
    }
    
    if (fs.existsSync(safePath)) {
      return res.status(400).json({ error: "Target already exists." });
    }
    
    if (type === 'directory') {
      fs.mkdirSync(safePath, { recursive: true });
    } else {
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(safePath, '', 'utf8');
    }
    
    return res.json({ success: true, path: cleanName });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create resource." });
  }
});

// Server Filesystem snapshots list endpoint
app.get("/api/fs/snapshots", (req, res) => {
  try {
    const modId = String(req.query.modId || '').trim();
    if (!modId) {
      return res.status(400).json({ error: "Missing modId parameter." });
    }
    const resolved = resolveXsdConfig();
    const modWorkspacePath = resolved.modWorkspacePath;
    if (!modWorkspacePath) {
      return res.json([]);
    }
    const modDir = path.join(modWorkspacePath, modId);
    
    // Read the unique mod ID from .studio-mod-id in staging mod folder
    const modIdFile = path.join(modDir, '.studio-mod-id');
    let currentModUniqueId = '';
    if (fs.existsSync(modIdFile)) {
      currentModUniqueId = fs.readFileSync(modIdFile, 'utf8').trim();
    }

    const snapDir = path.join(modDir, '.snapshots');
    if (!fs.existsSync(snapDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(snapDir).filter(name => name.startsWith('snapshot_') && name.endsWith('.json'));
    const list = files.map(file => {
      try {
        const content = fs.readFileSync(path.join(snapDir, file), 'utf8');
        const parsed = JSON.parse(content);
        return {
          id: file,
          name: parsed.name || file.replace('snapshot_', '').replace('.json', '').replace(/-/g, ':'),
          timestamp: parsed.savedAt ? new Date(parsed.savedAt).toLocaleString() : new Date(fs.statSync(path.join(snapDir, file)).mtime).toLocaleString(),
          workspace: parsed.workspace || parsed,
          modId: parsed.modId
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Filter snapshots to only return those matching the current mod's unique ID
    const filteredList = list.filter((item: any) => !currentModUniqueId || item.modId === currentModUniqueId);

    filteredList.sort((a, b) => b.id.localeCompare(a.id));
    return res.json(filteredList);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list snapshots." });
  }
});

// Server Filesystem save snapshot endpoint
app.post("/api/fs/snapshot", (req, res) => {
  try {
    const { modId, workspace, name } = req.body;
    if (!modId || !workspace) {
      return res.status(400).json({ error: "Missing modId or workspace." });
    }
    const resolved = resolveXsdConfig();
    const modWorkspacePath = resolved.modWorkspacePath;
    if (!modWorkspacePath) {
      return res.status(400).json({ error: "No mod workspace path configured." });
    }
    const modDir = path.join(modWorkspacePath, modId);
    if (!fs.existsSync(modDir)) {
      fs.mkdirSync(modDir, { recursive: true });
    }

    const modIdFile = path.join(modDir, '.studio-mod-id');
    let modUniqueId = '';
    if (fs.existsSync(modIdFile)) {
      modUniqueId = fs.readFileSync(modIdFile, 'utf8').trim();
    }
    if (!modUniqueId) {
      modUniqueId = `mod_${crypto.randomBytes(8).toString('hex')}`;
      fs.writeFileSync(modIdFile, modUniqueId, 'utf8');
    }

    const snapDir = path.join(modDir, '.snapshots');
    if (!fs.existsSync(snapDir)) {
      fs.mkdirSync(snapDir, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(snapDir, `snapshot_${stamp}.json`),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        name: name || `Snapshot_${stamp}`,
        modId: modUniqueId,
        workspace
      }, null, 2),
      'utf8'
    );

    // Prune oldest snapshots beyond 30 limit
    const names = fs.readdirSync(snapDir).filter(n => n.startsWith('snapshot_') && n.endsWith('.json'));
    names.sort();
    const MAX_SNAPSHOTS = 30;
    for (let i = 0; i < names.length - MAX_SNAPSHOTS; i++) {
      fs.unlinkSync(path.join(snapDir, names[i]));
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to save snapshot." });
  }
});

// Server Filesystem restore snapshot endpoint
app.post("/api/fs/restore-snapshot", (req, res) => {
  try {
    const { modId, snapshotName } = req.body;
    if (!modId || !snapshotName) {
      return res.status(400).json({ error: "Missing modId or snapshotName parameter." });
    }
    const resolved = resolveXsdConfig();
    const modWorkspacePath = resolved.modWorkspacePath;
    if (!modWorkspacePath) {
      return res.status(400).json({ error: "No mod workspace path configured." });
    }
    const snapFile = path.join(modWorkspacePath, modId, '.snapshots', snapshotName);
    if (!fs.existsSync(snapFile)) {
      return res.status(404).json({ error: "Snapshot not found." });
    }
    const content = fs.readFileSync(snapFile, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed.workspace) {
      return res.status(400).json({ error: "Invalid snapshot format." });
    }
    
    activeWorkspace = parsed.workspace;
    workspaceVersion++;
    
    return res.json({ success: true, workspace: activeWorkspace });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to restore snapshot." });
  }
});

// Server Filesystem delete snapshot endpoint
app.post("/api/fs/delete-snapshot", (req, res) => {
  try {
    const { modId, snapshotName } = req.body;
    if (!modId || !snapshotName) {
      return res.status(400).json({ error: "Missing modId or snapshotName parameter." });
    }
    const resolved = resolveXsdConfig();
    const modWorkspacePath = resolved.modWorkspacePath;
    if (!modWorkspacePath) {
      return res.status(400).json({ error: "No mod workspace path configured." });
    }
    const snapFile = path.join(modWorkspacePath, modId, '.snapshots', snapshotName);
    if (fs.existsSync(snapFile)) {
      fs.unlinkSync(snapFile);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to delete snapshot." });
  }
});

// Remove a mod directory (undeploy / clean an orphan) from the configured roots — the deploy
// path can create folders, so there must be a safe way to remove them. Scoped exactly like
// fs/write: relative path only, must stay strictly inside a root, never deletes the root itself.
app.post("/api/fs/delete-dir", (req, res) => {
  try {
    const relativePath = String(req.body?.path || '').trim();
    if (!relativePath) return res.status(400).json({ error: "Missing path parameter." });
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(normalized) || normalized.startsWith('..') || normalized === '' || normalized === '.') {
      return res.status(400).json({ error: "Invalid path." });
    }
    const resolved = resolveXsdConfig();
    const roots = [resolved.filesystemPath, resolved.modWorkspacePath].filter((r): r is string => Boolean(r));
    const removed: string[] = [];
    for (const root of roots) {
      const rootAbs = path.resolve(root);
      const abs = path.resolve(rootAbs, normalized);
      if (abs === rootAbs || !abs.startsWith(rootAbs + path.sep)) continue; // never delete a root
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        fs.rmSync(abs, { recursive: true, force: true });
        removed.push(abs);
      }
    }
    return res.json({ success: true, removed });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to delete directory." });
  }
});

app.get("/api/schema/element/:tag", (req, res) => {
  const tag = req.params.tag;
  const element = [
    ...schemaLibrary.events,
    ...schemaLibrary.conditions,
    ...schemaLibrary.actions,
    ...schemaLibrary.controlFlow
  ].find(item => item.tag === tag);

  if (!element) {
    return res.status(404).json({ error: `Schema element not found: ${tag}` });
  }
  return res.json(element);
});

/**
 * GET /api/agent/workspace
 * Retrieves the currently active, synchronized workspace state.
 */
app.get("/api/agent/workspace", (req, res) => {
  return res.json({
    workspace: activeWorkspace,
    version: workspaceVersion,
    lastUpdated: new Date().toISOString()
  });
});

/** Compute the full diagnostic set for a workspace (doctor + XSD + patches). */
function computeWorkspaceDiagnostics(ws: ModWorkspace): any[] {
  const { modId, files } = buildWorkspaceFileManifest(ws);
  return [...runModDoctor(ws, files, modId), ...runSchemaValidation(files, modId), ...runPatchDiagnostics(ws)];
}

function summarizeDiagnostics(diags: any[]) {
  return {
    total: diags.length,
    errors: diags.filter(d => d.severity === 'error').length,
    warnings: diags.filter(d => d.severity === 'warning').length,
    info: diags.filter(d => d.severity === 'info').length
  };
}

/**
 * Shared mutation handler with optimistic concurrency + dry-run.
 * @param incoming   either a full workspace or (when merge) a partial set of top-level fields
 * @param opts.merge JSON-merge-patch semantics over the active workspace
 */
function applyWorkspaceMutation(incoming: any, opts: { expectedVersion?: number; dryRun?: boolean; merge?: boolean }): { status: number; body: any } {
  if (!incoming || typeof incoming !== 'object') {
    return { status: 400, body: { error: "Missing or invalid workspace payload." } };
  }
  // Optimistic concurrency: reject stale writes when expectedVersion is supplied.
  if (typeof opts.expectedVersion === 'number' && opts.expectedVersion !== workspaceVersion) {
    return {
      status: 409,
      body: {
        error: 'version_conflict',
        message: `Stale write rejected: expectedVersion ${opts.expectedVersion} != current ${workspaceVersion}. Re-fetch /api/agent/workspace and retry.`,
        currentVersion: workspaceVersion
      }
    };
  }
  const merged = opts.merge ? { ...activeWorkspace, ...incoming } : incoming;
  const nextWorkspace = sanitizeWorkspace(merged);
  const diagnostics = computeWorkspaceDiagnostics(nextWorkspace);

  if (opts.dryRun) {
    return {
      status: 200,
      body: {
        success: true, dryRun: true, applied: false,
        version: workspaceVersion,
        diagnosticsSummary: summarizeDiagnostics(diagnostics),
        diagnostics,
        previewWorkspace: nextWorkspace
      }
    };
  }

  const isDifferent = JSON.stringify(nextWorkspace) !== JSON.stringify(activeWorkspace);
  if (isDifferent) {
    activeWorkspace = nextWorkspace;
    workspaceVersion++;
  }
  return {
    status: 200,
    body: {
      success: true, applied: isDifferent,
      message: isDifferent ? 'Workspace updated; version bumped.' : 'Workspace already in sync.',
      version: workspaceVersion,
      diagnosticsSummary: summarizeDiagnostics(diagnostics),
      workspace: activeWorkspace
    }
  };
}

/**
 * POST /api/agent/workspace
 * Replace the active workspace. Supports optimistic concurrency via
 * `expectedVersion` (409 on mismatch) and `dryRun` (validate without applying).
 */
app.post("/api/agent/workspace", (req, res) => {
  const { workspace, expectedVersion, dryRun } = req.body || {};
  if (!workspace) {
    return res.status(400).json({ error: "Missing required 'workspace' body parameter." });
  }
  const r = applyWorkspaceMutation(workspace, { expectedVersion, dryRun });
  return res.status(r.status).json(r.body);
});

/**
 * POST /api/agent/workspace/merge
 * JSON-merge-patch style granular edit: provide only the top-level fields to
 * change (e.g. { "version": "2.0.0" } or { "wares": [...] }). Supports the same
 * `expectedVersion` and `dryRun` controls.
 */
app.post("/api/agent/workspace/merge", (req, res) => {
  const { changes, expectedVersion, dryRun } = req.body || {};
  if (!changes || typeof changes !== 'object') {
    return res.status(400).json({ error: "Missing required 'changes' object (top-level workspace fields to merge)." });
  }
  const r = applyWorkspaceMutation(changes, { expectedVersion, dryRun, merge: true });
  return res.status(r.status).json(r.body);
});

/**
 * GET /api/agent/diagnostics
 * Read-only current diagnostics for the active workspace (doctor + XSD + patches).
 */
app.get("/api/agent/diagnostics", (req, res) => {
  try {
    const diagnostics = computeWorkspaceDiagnostics(activeWorkspace);
    return res.json({ version: workspaceVersion, summary: summarizeDiagnostics(diagnostics), diagnostics });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'diagnostics failed' });
  }
});

/**
 * GET /api/agent/game-log/status
 * Log-first live game feedback loop. Reads recent X4 debug output and classifies
 * active-mod errors without sending log content to any AI provider.
 */
app.get("/api/agent/game-log/status", (req, res) => {
  try {
    const modId = typeof req.query.modId === "string" ? req.query.modId : undefined;
    return res.json(getGameLogStatus(modId));
  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error.message || "Failed to read X4 game log status."
    });
  }
});

/**
 * GET /api/agent/debug-watcher/brief
 * Headless, agent-friendly debug-log watcher report. Extends game-log/status with
 * a compact timeline, optional expected-chain checks, deploy freshness, and a
 * copyable evidence artifact. Deterministic only; no AI provider involved.
 */
app.get("/api/agent/debug-watcher/brief", (req, res) => {
  try {
    const modId = typeof req.query.modId === "string" ? req.query.modId : undefined;
    const expectRaw = typeof req.query.expect === "string" ? req.query.expect : "";
    const expected = expectRaw.split(",").map(s => s.trim()).filter(Boolean);
    return res.json(buildDebugWatcherBrief(modId, expected));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || "debug-watcher brief failed" });
  }
});

// A2 — run the deterministic root-cause layer over a PASTED trace (no live log needed).
// Same engine as game-log/status.diagnosis; lets a dev paste a known-bad trace and see the
// named hypothesis deterministically. No AI provider involved.
app.post("/api/agent/log-diagnose", (req, res) => {
  try {
    const tail = String(req.body?.tail || "");
    const rawMod = String(req.body?.modId || activeWorkspace.name || "");
    const modIds = Array.from(new Set([toSafeModId(rawMod), rawMod.toLowerCase().trim(), toSafeModId(rawMod).replace(/_mod$/, "")].filter(s => s && s.length >= 3)));
    const { issues } = analyzeGameLog(tail, modIds);
    const activeIssues = issues.filter(i => i.matchesActiveMod);
    return res.json({ modIds, diagnosis: deriveLogDiagnosis(tail, modIds, activeIssues) });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "log-diagnose failed" });
  }
});

/**
 * GET /api/agent/object-index
 * Agent and UI searchable index over local loose X4 XML objects plus MD schema elements.
 */
app.get("/api/agent/object-index", (req, res) => {
  try {
    const index = getObjectIndex();
    const filtered = filterX4ObjectIndex(index, {
      q: typeof req.query.q === "string" ? req.query.q : "",
      kind: typeof req.query.kind === "string" ? req.query.kind : "all",
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : 500
    });
    return res.json(filtered);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to build X4 object index."
    });
  }
});

// Real base-game XML file paths that can be the target of a <diff> patch, enumerated
// from the packed .cat manifests (so the patch editor only offers files that actually
// exist — e.g. surfaces that `libraries/ship_macros.xml` is NOT a real base file).
let patchTargetsCache: { key: string; builtAt: number; paths: string[] } | null = null;
function listBasePatchTargets(): string[] {
  const resolved = resolveXsdConfig();
  if (!resolved.x4GamePath) return [];
  const key = resolved.x4GamePath;
  if (patchTargetsCache && patchTargetsCache.key === key && Date.now() - patchTargetsCache.builtAt < 300_000) {
    return patchTargetsCache.paths;
  }
  const set = new Set<string>();
  try {
    for (const arc of findCatDatArchives([resolved.x4GamePath])) {
      let entries;
      try { entries = parseCat(arc.catPath); } catch { continue; }
      for (const e of entries) {
        const name = e.name.replace(/\\/g, "/");
        const lower = name.toLowerCase();
        // Realistic patch targets: base library/index/map XML files.
        if (lower.endsWith(".xml") && /^(libraries|index|maps)\//.test(lower)) set.add(name);
      }
    }
  } catch { /* best effort */ }
  const paths = [...set].sort();
  patchTargetsCache = { key, builtAt: Date.now(), paths };
  return paths;
}

app.get("/api/agent/patch-targets", (req, res) => {
  try {
    const q = (typeof req.query.q === "string" ? req.query.q : "").toLowerCase().trim();
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    let paths = listBasePatchTargets();
    if (q) paths = paths.filter(p => p.toLowerCase().includes(q));
    return res.json({ success: true, total: paths.length, items: paths.slice(0, limit).map(p => ({ id: p, name: "" })) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "patch-targets listing failed" });
  }
});

// ---------------------------------------------------------------------------
// Round-trip mod-folder import + lossiness reporting (P4)
// ---------------------------------------------------------------------------

const ROUND_TRIP_TEXT_EXTS = new Set(['.xml', '.lua', '.xsd', '.txt', '.md', '.json', '.css', '.html', '.csv', '.cfg', '.ini']);

function walkFilesRelative(absRoot: string, rel = '', out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(absRoot, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === '.snapshots' || e.name === '.git' || e.name.startsWith('.studio-')) continue;
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkFilesRelative(absRoot, childRel, out);
    else if (e.isFile()) out.push(childRel);
  }
  return out;
}

interface ExtensionFileView {
  rel: string;
  text: string;
  source: "loose" | "packed";
  sourcePath: string;
}

function readExtensionFilesWithPacked(absDir: string, maxBytesPerPackedEntry = 2 * 1024 * 1024): ExtensionFileView[] {
  const byRel = new Map<string, ExtensionFileView>();
  for (const rel of walkFilesRelative(absDir)) {
    const relNorm = rel.replace(/\\/g, "/");
    const lower = relNorm.toLowerCase();
    if (lower.endsWith(".cat") || lower.endsWith(".dat")) continue;
    const abs = path.join(absDir, relNorm);
    try {
      if (!fs.statSync(abs).isFile()) continue;
      byRel.set(lower, { rel: relNorm, text: fs.readFileSync(abs, "utf8"), source: "loose", sourcePath: abs });
    } catch {
      /* unreadable loose file — skip */
    }
  }

  for (const archive of findCatDatArchives([absDir], true).filter(a => path.dirname(a.catPath).toLowerCase() === absDir.toLowerCase())) {
    let entries: ReturnType<typeof parseCat> = [];
    try { entries = parseCat(archive.catPath); } catch { continue; }
    for (const entry of entries) {
      if (entry.size <= 0 || entry.size > maxBytesPerPackedEntry) continue;
      const relNorm = entry.name.replace(/\\/g, "/");
      const lower = relNorm.toLowerCase();
      if (byRel.has(lower)) continue; // Loose files override the same packed path for diagnostics/opening.
      try {
        byRel.set(lower, { rel: relNorm, text: readEntryText(archive.datPath, entry), source: "packed", sourcePath: archive.catPath });
      } catch {
        /* unreadable packed entry — skip */
      }
    }
  }

  return [...byRel.values()];
}

function parseContentMeta(xml: string): { id?: string; name?: string; version?: string; author?: string; description?: string } {
  const attr = (a: string) => {
    const m = xml.match(new RegExp(`<content\\b[^>]*\\b${a}\\s*=\\s*"([^"]*)"`, 'i'));
    return m?.[1];
  };
  return { id: attr('id'), name: attr('name') || attr('id'), version: attr('version'), author: attr('author'), description: attr('description') };
}

/**
 * The mod's real extension id (folder name + content.xml id). Preserve the imported
 * content id when present so export deploys to the SAME folder with the SAME id, instead
 * of renaming it after the display title (toSafeModId("AI Influence Test Mod") =
 * "ai_influence_test_mod" ≠ the real "ai_influence_test"). New mods fall back to the title.
 */
function effectiveModId(ws: any): string {
  // Name the mod after the FOLDER it was loaded from (sanitized to a valid X4 id), so compile
  // targets the directory you opened — not the content.xml display title. This keeps a copy
  // (e.g. "x4_ai_influence - Copy") a DISTINCT mod ("x4_ai_influence_copy") and stops it
  // silently deploying over the original via the copied content.xml id.
  if (ws && typeof ws.sourceFolder === 'string' && ws.sourceFolder) {
    const base = ws.sourceFolder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
    const fromFolder = toSafeModId(base);
    if (fromFolder) return fromFolder;
  }
  const cid = ws && ws.contentId;
  return (typeof cid === 'string' && /^[A-Za-z][\w.-]*$/.test(cid)) ? cid : toSafeModId(ws?.name);
}

/** content.xml to emit: the imported original bytes when the mod metadata is unedited (so
 *  <dependency> + formatting survive), otherwise the regenerated content.xml. */
function contentXmlFor(modId: string, ws: any): string {
  const orig = ws && ws.contentOriginal;
  if (typeof orig === 'string' && orig) {
    const m = parseContentMeta(orig);
    const eq = (a: any, b: any) => String(a ?? '') === String(b ?? '');
    if (eq(m.id, ws.contentId) && eq(m.name, ws.name) && eq(m.version, ws.version)
        && eq(m.author, ws.author) && eq(m.description, ws.description)) {
      return orig; // unedited → verbatim
    }
  }
  return generateContentXML(modId, ws);
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/**
 * Parse an X4 translation (t-file) into the studio's editable TFile model.
 * Structure: <language id><page id title><t id>value</t></page></language>.
 * `compileTFileXML` is the faithful inverse, so these round-trip cleanly.
 */
function parseTFileXML(xml: string, fileName: string): any | null {
  const langId = xml.match(/<language\b[^>]*\bid\s*=\s*"([^"]+)"/i)?.[1];
  if (!langId) return null;
  const pages: any[] = [];
  const pageRe = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(xml)) !== null) {
    const id = pm[1].match(/\bid\s*=\s*"([^"]+)"/i)?.[1];
    if (!id) continue;
    const title = pm[1].match(/\btitle\s*=\s*"([^"]*)"/i)?.[1] || '';
    const items: any[] = [];
    const tRe = /<t\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/t>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pm[2])) !== null) {
      items.push({ id: tm[1], value: decodeXmlEntities(tm[2]), description: '' });
    }
    pages.push({ id, title, items });
  }
  return { languageId: String(langId).replace(/\D/g, '') || langId, fileName, pages, includeInBuild: true };
}

/**
 * MD faithfulness guard (round-trip element preservation).
 *
 * The visual node graph models MOST — but not all — Mission Director XML. Constructs the
 * parser doesn't represent yet (e.g. `<delay>`, `<library>`, `<params>`) are silently lost
 * when a cue is regenerated from nodes on export. Classifying such a file as "editable"
 * therefore corrupts the mod with no error. This mirrors the aiscript faithfulness guard
 * (#65): only adopt an MD file as an editable node graph if regenerating it preserves every
 * element. We compare element-name multisets (whitespace/attribute-order immune); if the
 * regen has fewer of ANY tag, the file is NOT faithfully editable and stays passthrough.
 */
function mdElementCounts(xml: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(/<([a-zA-Z_][\w.-]*)/g)) {
    const tag = m[1];
    if (tag === 'xml' || tag === 'mdscript') continue; // header/wrapper noise
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}
function mdRoundTripPreservesElements(original: string, regenerated: string): boolean {
  const o = mdElementCounts(original);
  const r = mdElementCounts(regenerated);
  for (const [tag, n] of o) {
    if ((r.get(tag) || 0) < n) return false; // regen dropped at least one <tag> → lossy
  }
  return true;
}

/**
 * Canonical form of an MD document for "was this semantically edited?" comparison. Strips
 * comments, sorts each tag's attributes, and collapses whitespace — so two documents that
 * differ ONLY in comments/formatting/attribute-order canonicalize identically, but ANY change
 * to a tag, attribute name, or attribute VALUE makes them differ. Used to decide whether to
 * re-emit the original bytes verbatim (unedited → true byte-fidelity, comments kept) or the
 * regenerated XML (the graph was actually edited).
 */
const MD_DEFAULT_ATTRS = new Set(['namespace="this"', 'instantiate="false"', 'state="active"']);
function canonicalMd(xml: string): string {
  return String(xml || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<([a-zA-Z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, (_m, tag, attrs, close) => {
      // Drop attributes that equal their X4 default — so a source that OMITS them and a regen
      // that ADDS them (e.g. namespace="this") canonicalize identically, and we keep the
      // byte-perfect original instead of falsely treating the default-add as an edit.
      const pairs = [...String(attrs).matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)]
        .map(p => `${p[1]}="${p[2]}"`).filter(a => !MD_DEFAULT_ATTRS.has(a)).sort();
      return `<${tag}${pairs.length ? ' ' + pairs.join(' ') : ''}${close ? '/' : ''}>`;
    })
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Import a mod folder into a workspace, preserving every file losslessly. */
function importModFolder(absDir: string): { workspace: ModWorkspace; report: any } {
  const relFiles = walkFilesRelative(absDir);
  let baseWorkspace: ModWorkspace | null = null;
  const meta: any = {};

  // metadata from content.xml (+ keep the raw bytes for byte-fidelity on unedited export —
  // generateContentXML drops <dependency> elements and reformats, which would break the mod).
  const contentRel = relFiles.find(f => f.toLowerCase() === 'content.xml');
  let contentOriginalText = '';
  if (contentRel) {
    try {
      contentOriginalText = fs.readFileSync(path.join(absDir, contentRel), 'utf8');
      Object.assign(meta, parseContentMeta(contentOriginalText));
    } catch { /* */ }
  }

  // editable MD: parse the first md/*.xml — but only adopt it as an editable node graph
  // if regenerating from those nodes preserves every element (faithfulness guard). The
  // node model doesn't represent every MD construct yet (<delay>, <library>, <params>, …);
  // adopting a file we can't round-trip would silently delete them on export. On any loss
  // we leave baseWorkspace null so the original file is preserved verbatim (passthrough).
  // MULTI-SCRIPT: parse EVERY md/*.xml. Each file that round-trips faithfully (parse→regen
  // preserves all elements) is merged into ONE node graph — cues are tagged with their owning
  // script name (by the parser) + file stem (here) so export re-emits one <mdscript> per file at
  // its original path. Files that don't round-trip stay passthrough. Removes the old
  // "only the first md file is editable" limit (the root cause of multi-script mods being raw).
  const mdRels = relFiles.filter(f => /^md\/[^/]+\.xml$/i.test(f));
  const editableMdRels = new Set<string>();
  let mergedNodes: any[] = [];
  let mergedLinks: any[] = [];
  for (const rel of mdRels) {
    try {
      const mdText = fs.readFileSync(path.join(absDir, rel), 'utf8');
      const parsed = parseXMLToWorkspace(mdText);
      if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) continue;
      const regen = generateMDXML(sanitizeWorkspace({
        ...parsed,
        name: meta.name || parsed.name || path.basename(absDir),
      } as any));
      const stem = rel.replace(/^md\//i, '').replace(/\.xml$/i, '');
      if (!mdRoundTripPreservesElements(mdText, regen)) {
        // Not faithfully decomposable into typed nodes → preserve each top-level cue as a lossless
        // generic node (custom_xml_cue): still EDITABLE (renders on the canvas, round-trips verbatim),
        // so NO passthrough. This is what takes node coverage to 100% of cues.
        const mdName = (mdText.match(/<mdscript\b[^>]*\bname\s*=\s*"([^"]+)"/i) || [])[1] || stem;
        const tops = extractTopLevelCueXml(mdText);
        if (tops.length === 0) continue; // truly unparseable → leave passthrough
        tops.forEach((t, k) => {
          mergedNodes.push({
            id: `${stem}__rawcue_${k}`, type: 'cue', label: `Cue (raw): ${t.name}`,
            xmlTag: 'custom_xml_cue', x: 120, y: 100 + k * 220,
            properties: { name: t.name, mdScript: mdName, mdFileStem: stem, rawXml: t.xml },
            propertiesSchema: [],
            inputs: [{ id: 'in_flow', name: 'Trigger Parent', type: 'parent' }],
            outputs: [{ id: 'out_sub', name: 'Sub Cues', type: 'child' }],
          } as any);
        });
        editableMdRels.add(rel.toLowerCase());
        if (!baseWorkspace) baseWorkspace = parsed;
        continue;
      }
      // namespace node ids per file so two scripts never collide (parser ids are Date.now()-based)
      const idMap = new Map<string, string>();
      for (const n of parsed.nodes as any[]) {
        const nid = `${stem}__${n.id}`; idMap.set(n.id, nid); n.id = nid;
        if (n.type === 'cue') n.properties = { ...(n.properties || {}), mdFileStem: stem };
      }
      for (const l of (parsed.links || []) as any[]) {
        l.sourceNodeId = idMap.get(l.sourceNodeId) || l.sourceNodeId;
        l.targetNodeId = idMap.get(l.targetNodeId) || l.targetNodeId;
      }
      mergedNodes = mergedNodes.concat(parsed.nodes);
      mergedLinks = mergedLinks.concat(parsed.links || []);
      editableMdRels.add(rel.toLowerCase());
      if (!baseWorkspace) baseWorkspace = parsed;
    } catch { /* unreadable / lossy → passthrough */ }
  }
  if (baseWorkspace) { baseWorkspace.nodes = mergedNodes; baseWorkspace.links = mergedLinks; }

  const mdParsed = editableMdRels.size > 0;

  // Editable translations: parse every t/*.xml into the TFile model. fileName is
  // the original basename so toTFileName regenerates at the exact same path.
  const tFiles: any[] = [];
  const editableTPaths = new Set<string>();
  for (const rel of relFiles) {
    if (!/^t\/[^/]+\.xml$/i.test(rel)) continue;
    try {
      const parsed = parseTFileXML(fs.readFileSync(path.join(absDir, rel), 'utf8'), rel.replace(/^t\//i, ''));
      if (parsed && parsed.pages.length) { tFiles.push(parsed); editableTPaths.add(rel.toLowerCase()); }
    } catch { /* leave as passthrough */ }
  }

  // Editable wares/jobs (G13): parse libraries/wares.xml & libraries/jobs.xml into the
  // WareDef/JobDef models so a studio-authored economy mod round-trips as EDITABLE rather
  // than preserved-raw. parse* returns null for unrecognized content → falls back to
  // passthrough (lossless), so external files carrying unmodeled fields are never flattened.
  let importedWares: any[] | null = null;
  let importedJobs: any[] | null = null;
  const waresRel = relFiles.find(f => f.toLowerCase() === 'libraries/wares.xml');
  if (waresRel) { try { importedWares = parseWaresXml(fs.readFileSync(path.join(absDir, waresRel), 'utf8')); } catch { /* passthrough */ } }
  const jobsRel = relFiles.find(f => f.toLowerCase() === 'libraries/jobs.xml');
  if (jobsRel) { try { importedJobs = parseJobsXml(fs.readFileSync(path.join(absDir, jobsRel), 'utf8')); } catch { /* passthrough */ } }

  // #65 — aiscripts import as EDITABLE when faithfulness-safe, else passthrough. Two
  // determinism guards so re-export can't diverge from the original: (1) the parsed model
  // must re-compile BYTE-IDENTICALLY, and (2) name === the file's stem so the regenerated
  // file lands at the SAME path. Imported names are already final → flagged `namespaced`
  // so the export pipeline never re-prefixes them with this workspace's modId (the old
  // round-trip break). Anything that fails a guard stays passthrough (lossless).
  let importedAiScripts: AIBehaviorScript[] | null = null;
  for (const rel of relFiles) {
    if (!/^aiscripts\/.+\.xml$/i.test(rel.replace(/\\/g, '/'))) continue;
    try {
      const content = fs.readFileSync(path.join(absDir, rel), 'utf8');
      const parsed = parseAiScriptXml(content);
      if (!parsed) continue;
      const stem = path.basename(rel).replace(/\.xml$/i, '');
      if (parsed.name !== stem) continue;                      // guard 2: name === filename
      if (compileScriptToXML(parsed) !== content) continue;    // guard 1: byte-faithful re-compile
      if (!importedAiScripts) importedAiScripts = [];
      importedAiScripts.push({ ...parsed, namespaced: true, includeInBuild: true });
    } catch { /* unreadable → passthrough */ }
  }

  // Parse content.xml <dependency> declarations into the workspace model so they survive
  // regeneration (re-emitted by generateContentXML) instead of being silently dropped — which
  // made dependent APIs no-op in-game and kept the dependency analyzer warning.
  const parsedDeps: { id: string; version?: string; optional?: boolean }[] = [];
  if (contentOriginalText) {
    const depRe = /<dependency\b([^>]*)>/gi; let dm: RegExpExecArray | null;
    while ((dm = depRe.exec(contentOriginalText)) !== null) {
      const a = dm[1] || '';
      const id = (a.match(/\bid\s*=\s*"([^"]+)"/i) || [])[1];
      if (!id) continue;
      const version = (a.match(/\bversion\s*=\s*"([^"]+)"/i) || [])[1];
      const optional = /\boptional\s*=\s*"?true"?/i.test(a);
      parsedDeps.push({ id, ...(version ? { version } : {}), ...(optional ? { optional: true } : {}) });
    }
  }

  const ws: ModWorkspace = sanitizeWorkspace({
    ...(baseWorkspace || {}),
    sourceFolder: absDir, // so the UI can always show which folder/dir is open
    ...(parsedDeps.length ? { dependencies: parsedDeps } : {}),
    name: meta.name || baseWorkspace?.name || path.basename(absDir),
    version: meta.version || baseWorkspace?.version,
    author: meta.author || baseWorkspace?.author,
    description: meta.description || baseWorkspace?.description,
    // Preserve the editable MD file's original identity (script name + filename) so export
    // regenerates it at the SAME path with the SAME <mdscript name>, instead of renaming it
    // after the mod's display title. `baseWorkspace.name` holds the parsed <mdscript name>.
    // Multi-script: per-cue mdScript (the <mdscript name>) + mdFileStem (the output path) drive
    // export now, so we no longer pin a single mdScriptName/mdFileStem/mdOriginal on the workspace.
    // Preserve the real content.xml id so export keeps the SAME extension folder + id
    // (not renamed after the display title). Falls back to the title for new mods.
    ...(meta.id ? { contentId: meta.id } : {}),
    // Keep content.xml's original bytes too (preserves <dependency> + formatting on export).
    ...(contentOriginalText ? { contentOriginal: contentOriginalText } : {}),
    tFiles,
    ...(importedWares ? { wares: importedWares } : {}),
    ...(importedJobs ? { jobs: importedJobs } : {}),
    ...(importedAiScripts ? { aiScripts: importedAiScripts } : {}),
  });

  // Only regenerate domains we actually modeled. If the MD didn't parse, turn MD
  // generation OFF so the original md file is preserved verbatim (as passthrough)
  // instead of being overwritten by an empty regenerated file. Domains without an
  // importer stay OFF — their files round-trip as passthrough until a parser models them.
  ws.compileSettings = {
    md: mdParsed,
    ui: false,
    ai: !!importedAiScripts, // #65: regenerate the aiscripts we parsed to editable (namespaced-safe); others stay passthrough
    library: !!(importedWares || importedJobs), // G13: regenerate wares/jobs we parsed to editable
    translations: tFiles.length > 0,
    patches: false
  };

  // Paths the manifest will regenerate from the parsed/modeled domains.
  const regenPaths = new Set<string>(Object.keys(buildWorkspaceFileManifest(ws).files).map(p => p.toLowerCase()));

  // Four-way file classification for round-trip safety awareness.
  //   editable    — parsed into a fully-modeled, graph-editable domain (the MD file)
  //   generated   — the studio regenerates this path from modeled domains on export
  //   partial     — known domain but not yet parsed to editable; preserved verbatim
  //   passthrough — unknown domain; preserved verbatim
  //   binary      — non-text; not loaded into the workspace
  type FileClass = 'editable' | 'generated' | 'partial' | 'passthrough' | 'binary';
  const classification: { path: string; class: FileClass; note?: string }[] = [];
  const passthroughFiles: any[] = [];
  const KNOWN_DOMAIN = /^(md|aiscripts|libraries|t|ui)\//i;
  // Resilience caps: never inline so much file content into the workspace that the
  // renderer chokes (the all-or-nothing white-screen on a mod that carries a runtime
  // DB or a packed CAT/DAT archive). Oversized / over-budget files are TRACKED but
  // their content is NOT loaded; they stay on disk and are preserved by the deploy guard.
  const MAX_INLINE_BYTES = 256 * 1024;             // per-file cap
  const MAX_TOTAL_INLINE_BYTES = 6 * 1024 * 1024;  // whole-import budget
  let inlinedBytes = 0;

  for (const rel of relFiles) {
    const ext = path.extname(rel).toLowerCase();
    const lower = rel.toLowerCase();
    if (editableMdRels.has(lower)) {
      classification.push({ path: rel, class: 'editable', note: 'parsed into the MD node graph' });
      continue; // regenerated from nodes on export (per-script)
    }
    if (editableTPaths.has(lower) && regenPaths.has(lower)) {
      classification.push({ path: rel, class: 'editable', note: 'parsed into the editable translation (TFile) model' });
      continue;
    }
    if (regenPaths.has(lower)) {
      classification.push({ path: rel, class: 'generated', note: 'regenerated from a modeled domain on export' });
      continue;
    }
    const absPath = path.join(absDir, rel);
    let bytes = 0; try { bytes = fs.statSync(absPath).size; } catch {}
    const kb = Math.round(bytes / 1024);
    const overBudget = bytes > MAX_INLINE_BYTES || (inlinedBytes + bytes) > MAX_TOTAL_INLINE_BYTES;
    if (!ROUND_TRIP_TEXT_EXTS.has(ext)) {
      if (overBudget) {
        passthroughFiles.push({ path: rel, reason: 'binary', omitted: true, bytes });
        classification.push({ path: rel, class: 'binary', note: `binary, ${kb} KB — tracked, not loaded (preserved on disk)` });
        continue;
      }
      let content = '';
      try { content = fs.readFileSync(absPath, 'base64'); } catch { continue; }
      inlinedBytes += content.length;
      passthroughFiles.push({ path: rel, content, reason: 'binary' });
      classification.push({ path: rel, class: 'binary', note: 'binary file, preserved verbatim via base64 encoding' });
      continue;
    }
    if (overBudget) {
      passthroughFiles.push({ path: rel, reason: 'too_large', omitted: true, bytes });
      classification.push({ path: rel, class: 'passthrough', note: `large file, ${kb} KB — tracked, not loaded (preserved on disk)` });
      continue;
    }
    let content = '';
    try { content = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
    inlinedBytes += content.length;
    const known = KNOWN_DOMAIN.test(rel);
    const cls: FileClass = known ? 'partial' : 'passthrough';
    passthroughFiles.push({ path: rel, content, reason: known ? 'partial' : 'unknown_domain' });
    classification.push({ path: rel, class: cls, note: known ? 'known domain, preserved verbatim until a parser models it' : 'unknown file, preserved verbatim' });
  }

  ws.passthroughFiles = passthroughFiles;
  const counts = classification.reduce((a: any, c) => { a[c.class] = (a[c.class] || 0) + 1; return a; }, {});
  const report = {
    folder: absDir,
    totalFiles: relFiles.length,
    counts,
    classification,
    summary: `editable:${counts.editable || 0} generated:${counts.generated || 0} partial:${counts.partial || 0} passthrough:${counts.passthrough || 0} binary:${counts.binary || 0}`
  };
  return { workspace: ws, report };
}

function resolveModFolder(reqPath: string): { abs: string } | { error: string; status: number } {
  const resolved = resolveXsdConfig();
  const roots = [resolved.modWorkspacePath, resolved.filesystemPath]
    .filter((root): root is string => Boolean(root))
    .filter((root, idx, arr) => arr.indexOf(root) === idx);
  if (roots.length === 0) return { error: 'No modWorkspacePath/filesystemPath configured.', status: 400 };
  const rel = String(reqPath || '').trim();
  const normalized = path.normalize(rel);
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) return { error: 'Invalid folder path.', status: 400 };
  for (const root of roots) {
    const rootAbs = path.resolve(root);
    const abs = path.resolve(rootAbs, normalized);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) continue;
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return { abs };
  }
  return { error: `Folder not found in configured roots: ${rel}`, status: 404 };
}

app.post("/api/agent/mod-folder/import", (req, res) => {
  try {
    const r = resolveModFolder(req.body?.path);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    const { workspace, report } = importModFolder(r.abs);
    return res.json({ success: true, workspace, report });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'mod-folder import failed' });
  }
});

app.get("/api/agent/round-trip-selftest", (req, res) => {
  let tmp = '';
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4rt-'));
    // Synthesize a small mod exercising modeled + unknown domains.
    const mdXml = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="RoundTrip_Test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="RT_Cue">
      <conditions>
        <event_game_started/>
      </conditions>
      <actions>
        <set_value name="$rt" exact="1"/>
      </actions>
    </cue>
  </cues>
</mdscript>`;
    const godXml = `<?xml version="1.0" encoding="utf-8"?>\n<diff>\n  <add sel="/god/stations">\n    <station id="rt_custom_station"/>\n  </add>\n</diff>\n`;
    const customLua = `-- a hand-authored helper the studio does not model\nlocal m = {}\nreturn m\n`;
    const tFileXml = `<?xml version="1.0" encoding="utf-8"?>\n<language id="44">\n  <page id="10001" title="RoundTrip">\n    <t id="1001">Bounty Hunter</t>\n    <t id="1002">Destroy the target</t>\n  </page>\n</language>`;
    const files: Record<string, string> = {
      'content.xml': `<?xml version="1.0" encoding="utf-8"?>\n<content id="roundtrip_test" name="RoundTrip_Test" author="tester" version="100" date="2026-06-11" save="0"/>`,
      'md/roundtrip_test.xml': mdXml,
      'libraries/god.xml': godXml,
      // G13: studio-emit wares/jobs should import as EDITABLE (parsed into WareDef/JobDef).
      'libraries/wares.xml': compileWaresXML([{ id: 'rt_ware', name: 'RT Ware', description: 'rt', transport: 'container', volume: 5, minPrice: 10, avgPrice: 20, maxPrice: 30, prodTime: 60, prodAmount: 100, productionMethod: 'default', includeInBuild: true }]),
      'libraries/jobs.xml': compileJobsXML([{ id: 'rt_job', name: 'RT Job', faction: 'argon', shipClass: 'fighter', shipMacro: '', galaxyQuota: 3, sectorQuota: 1, taskScript: 'masstraffic.generic', rebuildOnDestroy: false, includeInBuild: true }]),
      // #52: studio-emit aiscript should import as EDITABLE (faithfulness-guarded). name === filename stem.
      'aiscripts/rt_patrol.xml': compileScriptToXML({ id: 'rt_patrol', name: 'rt_patrol', description: '', command: '', attentionLevel: 'low', params: [{ name: '$t', type: 'object', defaultValue: 'null', comment: 'tgt' }], interrupts: [], actions: [{ id: 'a0', command: 'flee', label: 'Run', properties: {} }], includeInBuild: true }),
      't/0001-l044.xml': tFileXml,
      'subscripts/custom_helper.lua': customLua,
      'unknown_top_level.xml': `<?xml version="1.0"?>\n<weird custom="data"/>\n`
    };
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }

    const { workspace, report } = importModFolder(tmp);
    const out = buildWorkspaceFileManifest(workspace);
    const outFiles = out.files;

    // Classification decides the contract: editable/generated files may be
    // regenerated (differ); partial/passthrough must be byte-identical.
    const classOf = (rel: string) => (report.classification.find((c: any) => c.path.toLowerCase() === rel.toLowerCase())?.class) || 'unknown';
    const checks: any[] = [];
    let lossless = true;
    for (const [rel, content] of Object.entries(files)) {
      const present = outFiles[rel] !== undefined;
      const cls = classOf(rel);
      const mayDiffer = cls === 'editable' || cls === 'generated';
      const identical = present && outFiles[rel] === content;
      if (!present) lossless = false;
      if (!mayDiffer && present && !identical) lossless = false;
      const pass = present && (mayDiffer || identical);
      checks.push({ name: rel, pass, path: rel, class: cls, present, byteIdentical: identical });
    }

    // G13: assert the wares/jobs imported as EDITABLE models (not preserved-raw passthrough).
    const waresOk = Array.isArray(workspace.wares) && workspace.wares.length === 1 && workspace.wares[0].id === 'rt_ware'
      && (classOf('libraries/wares.xml') === 'generated' || classOf('libraries/wares.xml') === 'editable');
    const jobsOk = Array.isArray(workspace.jobs) && workspace.jobs.length === 1 && workspace.jobs[0].id === 'rt_job'
      && (classOf('libraries/jobs.xml') === 'generated' || classOf('libraries/jobs.xml') === 'editable');
    checks.push({ name: 'G13 wares→editable model', pass: !!waresOk, class: classOf('libraries/wares.xml'), wares: (workspace.wares || []).length });
    checks.push({ name: 'G13 jobs→editable model', pass: !!jobsOk, class: classOf('libraries/jobs.xml'), jobs: (workspace.jobs || []).length });

    // #65: a faithfulness-safe aiscript (re-compiles byte-identically AND name === file stem)
    // now imports as EDITABLE — modeled into workspace.aiScripts and regenerated on export
    // (class 'generated'/'editable'), with namespaced:true so export won't re-prefix it.
    const aiCls = classOf('aiscripts/rt_patrol.xml');
    const aiOk = (aiCls === 'generated' || aiCls === 'editable')
      && (workspace.aiScripts || []).some(s => s.name === 'rt_patrol' && s.namespaced === true);
    checks.push({ name: '#65 aiscript→editable (faithful, namespaced)', pass: !!aiOk, class: aiCls, aiScripts: (workspace.aiScripts || []).length });

    // Byte-fidelity: an UNEDITED editable MD file must re-emit its ORIGINAL bytes verbatim
    // (comments/whitespace/attribute-order preserved), not a reformatted regen.
    const mdByteFaithful = outFiles['md/roundtrip_test.xml'] === files['md/roundtrip_test.xml'];
    checks.push({ name: 'md byte-fidelity (unedited→verbatim)', pass: !!mdByteFaithful, path: 'md/roundtrip_test.xml' });

    const passed = checks.filter((c: any) => c.pass).length;
    // House selftest contract (allPassed/passed/total) alongside the richer lossless report,
    // so a generic dashboard/agent doesn't misread {lossless:true} as a failure (H9).
    return res.json({
      allPassed: lossless && waresOk && jobsOk && aiOk && mdByteFaithful,
      passed,
      total: checks.length,
      lossless,
      inputFiles: Object.keys(files).length,
      outputFiles: Object.keys(outFiles).length,
      passthroughCount: (workspace.passthroughFiles || []).length,
      checks,
      importSummary: report.summary,
      importReport: report
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'selftest failed', stack: String(error?.stack || '').slice(0, 500) });
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } }
  }
});

app.post("/api/agent/round-trip-check", (req, res) => {
  try {
    const r = resolveModFolder(req.body?.path);
    if ('error' in r) return res.status(r.status).json({ error: r.error });
    const { workspace, report } = importModFolder(r.abs);
    const { files } = buildWorkspaceFileManifest(workspace);
    const outPaths = new Set(Object.keys(files).map(p => p.toLowerCase()));

    const inputFiles = walkFilesRelative(r.abs);
    const droppedFiles: string[] = [];
    const passthroughVerified: string[] = [];
    const passthroughMismatch: any[] = [];
    const modeledChanged: string[] = [];

    for (const rel of inputFiles) {
      const ext = path.extname(rel).toLowerCase();
      const inPassthrough = (workspace.passthroughFiles || []).find(p => p.path.toLowerCase() === rel.toLowerCase());
      if (inPassthrough) {
        const outContent = files[inPassthrough.path] ?? files[rel];
        if (outContent === undefined) {
          droppedFiles.push(rel);
        } else if (outContent === inPassthrough.content) {
          passthroughVerified.push(rel);
        } else {
          passthroughMismatch.push({ path: rel, inLen: inPassthrough.content.length, outLen: outContent.length });
        }
        continue;
      }
      if (outPaths.has(rel.toLowerCase())) {
        modeledChanged.push(rel); // present in output but regenerated/modeled
      } else if (!ROUND_TRIP_TEXT_EXTS.has(ext)) {
        // binary, intentionally not modeled — report separately, not a "drop"
        modeledChanged.push(rel + ' (binary, not modeled)');
      } else {
        droppedFiles.push(rel);
      }
    }

    const lossless = droppedFiles.length === 0 && passthroughMismatch.length === 0;
    return res.json({
      success: true,
      lossless,
      inputFileCount: inputFiles.length,
      outputFileCount: Object.keys(files).length,
      passthroughVerified: passthroughVerified.length,
      passthroughMismatch,
      modeledOrRegenerated: modeledChanged.length,
      droppedFiles,
      importReport: report
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'round-trip-check failed' });
  }
});

/**
 * Extension Doctor (P-A) — cross-mod conflict scan over an extensions/ folder.
 * Read-only and side-effect-free. Checks: (1) missing dependencies, (2) duplicate
 * extension ids, (3) cross-mod file/patch collisions (full-file overrides + identical
 * diff selectors on a shared base path). Returns the standard diagnostic shape.
 * Extracted as a function so both the live endpoint and the selftest can call it.
 */
function runExtensionDoctor(extRoot: string, opts?: { resolveBaseContent?: (rel: string) => string | null }) {
    interface ExtInfo {
      folder: string; id: string; idLower: string; name?: string; version?: string;
      enabled: boolean; deps: { id: string; optional: boolean; name?: string }[]; absDir: string;
    }

    const exts: ExtInfo[] = [];
    for (const folder of fs.readdirSync(extRoot)) {
      const absDir = path.join(extRoot, folder);
      let isDir = false;
      try { isDir = fs.statSync(absDir).isDirectory(); } catch { isDir = false; }
      const contentPath = path.join(absDir, "content.xml");
      if (!isDir || !fs.existsSync(contentPath)) continue;

      let xml = "";
      try { xml = fs.readFileSync(contentPath, "utf8"); } catch { continue; }
      const id = xml.match(/<content\b[^>]*\bid\s*=\s*"([^"]+)"/i)?.[1] || folder;
      const enabledAttr = xml.match(/<content\b[^>]*\benabled\s*=\s*"([^"]+)"/i)?.[1];
      const enabled = enabledAttr !== "0" && enabledAttr !== "false";
      const name = xml.match(/<content\b[^>]*\bname\s*=\s*"([^"]+)"/i)?.[1];
      const version = xml.match(/<content\b[^>]*\bversion\s*=\s*"([^"]+)"/i)?.[1];

      const deps: { id: string; optional: boolean; name?: string }[] = [];
      const depRe = /<dependency\b([^>]*)>/gi;
      let dm: RegExpExecArray | null;
      while ((dm = depRe.exec(xml))) {
        const attrs = dm[1];
        const depId = attrs.match(/\bid\s*=\s*"([^"]+)"/i)?.[1];
        if (!depId) continue;
        deps.push({
          id: depId,
          optional: /\boptional\s*=\s*"(?:true|1)"/i.test(attrs),
          name: attrs.match(/\bname\s*=\s*"([^"]+)"/i)?.[1]
        });
      }
      exts.push({ folder, id, idLower: id.toLowerCase(), name, version, enabled, deps, absDir });
    }

    const idToExts = new Map<string, ExtInfo[]>();
    for (const e of exts) {
      const arr = idToExts.get(e.idLower) || [];
      arr.push(e);
      idToExts.set(e.idLower, arr);
    }
    const installedIds = new Set(exts.map(e => e.idLower));

    const findings: any[] = [];

    // CHECK 1 — dependency resolution.
    for (const e of exts) {
      for (const d of e.deps) {
        if (installedIds.has(d.id.toLowerCase())) continue;
        findings.push({
          severity: d.optional ? "info" : "error",
          category: "dependency",
          code: d.optional ? "dep.missing_optional" : "dep.missing_required",
          domain: "extension",
          filePath: `extensions/${e.folder}/content.xml`,
          message: `${e.name || e.folder} ${d.optional ? "optionally depends on" : "requires"} "${d.id}"${d.name ? ` (${d.name})` : ""}, which is not installed${d.optional ? "." : " — this extension may fail to load."}`,
          sourceRef: { kind: "dependency", id: d.id, label: e.id },
          openTargets: [{ label: e.folder, path: `${e.folder}/content.xml` }]
        });
      }
    }

    // CHECK 2 — duplicate extension ids.
    for (const arr of idToExts.values()) {
      if (arr.length < 2) continue;
      findings.push({
        severity: "error",
        category: "conflict",
        code: "ext.duplicate_id",
        domain: "extension",
        filePath: arr.map(a => `extensions/${a.folder}/content.xml`).join(", "),
        message: `Duplicate extension id "${arr[0].id}" declared by ${arr.length} folders (${arr.map(a => a.folder).join(", ")}). X4 loads only one of them.`,
        sourceRef: { kind: "extension", id: arr[0].id },
        openTargets: arr.map(a => ({ label: a.folder, path: `${a.folder}/content.xml` }))
      });
    }

    // CHECK 2b — folder name vs content id mismatch. Not fatal (X4 identifies
    // extensions by folder; dependencies reference the content id), but a mismatch
    // is a common source of confusion when wiring dependencies and debugging load
    // issues, so surface it as info. First-party ego_* content is skipped.
    for (const e of exts) {
      if (/^ego_/i.test(e.id) || /^ego_/i.test(e.folder)) continue;
      if (e.folder.toLowerCase() === e.idLower) continue;
      findings.push({
        severity: "info",
        category: "convention",
        code: "ext.folder_id_mismatch",
        domain: "extension",
        filePath: `extensions/${e.folder}/content.xml`,
        message: `Folder "${e.folder}" declares content id "${e.id}" — folder name and id differ. Dependencies resolve by id, the engine identifies the extension by folder; keeping them identical avoids wiring mistakes.`,
        sourceRef: { kind: "extension", id: e.id, label: e.folder },
        openTargets: [{ label: e.folder, path: `${e.folder}/content.xml` }]
      });
    }

    // LOAD ORDER SIMULATION — X4 loads extensions alphabetically by folder name
    // (case-insensitive), with declared dependencies loaded before their dependents.
    // Deterministic topological sort with alphabetical tie-break; used to annotate
    // conflict findings with the actual winner (last loaded wins).
    const enabledExts = exts.filter(e => e.enabled);
    const loadOrder = simulateLoadOrder(enabledExts);
    const loadRank = new Map(loadOrder.map((f, i) => [f, i]));
    const orderContested = (mods: string[]) =>
      [...mods].sort((a, b) => (loadRank.get(a) ?? -1) - (loadRank.get(b) ?? -1));

    // CHECK 2d — dependency CYCLES. simulateLoadOrder silently bails out of a cyclic
    // branch (so the load order above hides cycles); the modDependencyGraph analyzer
    // surfaces them explicitly. Reuses ONE detection path (the same engine behind
    // /api/agent/mod-dependency-selftest) rather than a second copy here.
    const depGraph = analyzeModDependencies(enabledExts.map(e => ({
      folder: e.folder, id: e.id, version: e.version, name: e.name, enabled: e.enabled,
      deps: e.deps.map(d => ({ id: d.id, optional: d.optional, name: d.name })),
    })));
    for (const cyc of depGraph.cycles) {
      const folders = cyc.slice(0, -1); // drop the repeated closing folder
      findings.push({
        severity: "error",
        category: "dependency",
        code: "dep.cycle",
        domain: "extension",
        filePath: folders.map(f => `extensions/${f}/content.xml`).join(", "),
        message: `Dependency cycle: ${cyc.join(" → ")}. X4 has no valid load order for these extensions — one will load before its dependency is ready.`,
        sourceRef: { kind: "dependency", id: folders[0] },
        openTargets: folders.map(f => ({ label: f, path: `${f}/content.xml` }))
      });
    }

    const extensionFiles = new Map<string, ExtensionFileView[]>();
    for (const e of exts) {
      if (!e.enabled || /^ego_/i.test(e.id)) continue;
      extensionFiles.set(e.folder, readExtensionFilesWithPacked(e.absDir));
    }

    // CHECK 2c — two-layer Lua analysis. Baseline layer: parser-backed syntax
    // and undefined-global hygiene with deterministic globals only. X4 layer:
    // engine/runtime hazards such as 9.0 restricted UI online-user-item calls.
    const luaFiles: LuaFileInput[] = [];
    for (const e of enabledExts) {
      if (/^ego_/i.test(e.id)) continue;
      for (const file of extensionFiles.get(e.folder) || []) {
        if (!file.rel.toLowerCase().endsWith(".lua")) continue;
        luaFiles.push({
          rel: file.rel,
          text: file.text,
          source: file.source,
          sourcePath: file.sourcePath,
          extension: { folder: e.folder, id: e.id, name: e.name }
        });
      }
    }
    const luaAnalysis = analyzeLuaFiles(luaFiles);
    let undefinedGlobalInfos = 0;
    for (const lf of luaAnalysis.findings) {
      if (lf.code === "lua.undefined_global" && undefinedGlobalInfos++ >= 25) continue;
      const e = luaFiles.find(f => f.rel === lf.rel && f.sourcePath === lf.sourcePath)?.extension;
      const folder = e?.folder || "unknown";
      findings.push({
        severity: lf.severity,
        category: lf.layer === "x4" ? "runtime" : "lua_hygiene",
        code: lf.code,
        domain: lf.layer === "x4" ? "lua_ui" : "lua",
        filePath: `extensions/${folder}/${lf.rel}`,
        message: `${e?.name || folder}: ${lf.message}${lf.source === "packed" ? ` (${path.basename(lf.sourcePath)})` : ""}`,
        sourceRef: { kind: "lua_static", id: lf.symbol || lf.code, label: folder },
        openTargets: [{ label: `${folder}/${lf.rel}`, path: `${folder}/${lf.rel}` }],
        packed: lf.source === "packed",
        archive: lf.source === "packed" ? path.basename(lf.sourcePath) : undefined,
        layer: lf.layer,
        line: lf.line,
        column: lf.column
      });
    }

    // CHECK 3 — cross-mod file/patch collisions.
    // Key every (third-party) mod's XML files by the base path they occupy (rel to ext
    // root, mirroring the base-game layout). Official DLCs (ego_*) are excluded — first-
    // party, mostly packed, layered by the engine. A path shared by >=2 mods is contested:
    // full-file overrides collide outright; diff files collide on identical selectors.
    interface FileRec { folder: string; isDiff: boolean; selectors: { op: string; sel: string }[]; }
    const pathMap = new Map<string, FileRec[]>();
    for (const e of exts) {
      if (!e.enabled || /^ego_/i.test(e.id)) continue;
      for (const file of extensionFiles.get(e.folder) || []) {
        const rel = file.rel;
        const relLower = rel.toLowerCase();
        // content.xml and ui.xml are per-extension root manifests (each mod has its own;
        // they register that mod's content/UI, they don't override each other) — never a conflict.
        if (!relLower.endsWith(".xml") || relLower === "content.xml" || relLower === "ui.xml") continue;
        // Translations (t/) and index/ files are merged additively by X4 (by language→page→id,
        // or name→path), not destructively overridden — a shared path there is not a real
        // file-level conflict, so skip them to avoid false "load order decides" warnings.
        if (relLower.startsWith("t/") || relLower.startsWith("index/")) continue;
        const xml = file.text;
        const isDiff = /<diff[\s>]/.test(xml);
        const selectors = isDiff
          ? [...xml.matchAll(/<(add|replace|remove)\b[^>]*\bsel\s*=\s*"([^"]+)"/gi)].map(mm => ({ op: mm[1].toLowerCase(), sel: mm[2] }))
          : [];
        const tf = rel.replace(/\\/g, "/");
        const arr = pathMap.get(tf) || [];
        arr.push({ folder: e.folder, isDiff, selectors });
        pathMap.set(tf, arr);
      }
    }
    for (const [tf, recs] of pathMap) {
      if (recs.length < 2) continue;
      const mods = recs.map(r => r.folder);
      const fullFileOwners = recs.filter(r => !r.isDiff).map(r => r.folder);
      const selOwners = new Map<string, string[]>();
      for (const r of recs) {
        for (const s of r.selectors) {
          const a = selOwners.get(s.sel) || [];
          a.push(r.folder);
          selOwners.set(s.sel, a);
        }
      }
      const selCollisions = [...selOwners.entries()].filter(([, o]) => o.length > 1);

      const ordered = orderContested(mods);
      const winner = ordered[ordered.length - 1];

      if (fullFileOwners.length > 0) {
        findings.push({
          severity: "warning", category: "conflict", code: "file.override_collision",
          domain: "xml_patches", filePath: tf,
          message: `${recs.length} enabled mods provide ${tf} (full-file override) — simulated load order: ${ordered.join(" → ")}; winner (loaded last): ${winner}.`,
          sourceRef: { kind: "file_conflict", id: tf, label: mods.join(", ") },
          openTargets: recs.map(r => ({ label: r.folder, path: `${r.folder}/${tf}` })),
          loadOrder: ordered, winner
        });
      } else if (selCollisions.length) {
        findings.push({
          severity: "warning", category: "conflict", code: "patch.selector_collision",
          domain: "xml_patches", filePath: tf,
          message: `${mods.length} enabled mods patch ${tf} with ${selCollisions.length} identical selector(s) — simulated load order: ${ordered.join(" → ")}; winner (loaded last): ${winner}.`,
          sourceRef: { kind: "patch_conflict", id: tf, label: mods.join(", ") },
          openTargets: recs.map(r => ({ label: r.folder, path: `${r.folder}/${tf}` })),
          loadOrder: ordered, winner
        });
      } else {
        // XPath-LEVEL overlap: selector strings differ, but they may still resolve
        // to the same node in the real base file (e.g. /jobs/job[@id='x'] vs
        // //job[@id='x']). Evaluate every selector against the resolved base
        // content and flag nodes claimed by >=2 mods where at least one op is
        // replace/remove (add+add to a shared parent merges and is fine).
        const xpathConflicts: { nodeName: string; folders: string[]; sels: string[] }[] = [];
        const baseContent = opts?.resolveBaseContent ? opts.resolveBaseContent(tf) : null;
        if (baseContent && baseContent.length <= 2_000_000) {
          try {
            const doc = new XmlDomParser({ onError: () => { /* tolerate recoverable parse noise */ } })
              .parseFromString(baseContent, 'text/xml');
            const nodeOwners = new Map<any, { folder: string; op: string; sel: string }[]>();
            let evaluated = 0;
            for (const r of recs) {
              for (const s of r.selectors) {
                if (evaluated >= 200) break;
                evaluated++;
                let matches: any;
                try { matches = xpathLib.select(s.sel, doc as any); } catch { continue; }
                if (!Array.isArray(matches)) continue;
                for (const n of matches.slice(0, 50)) {
                  const arr = nodeOwners.get(n) || [];
                  arr.push({ folder: r.folder, op: s.op, sel: s.sel });
                  nodeOwners.set(n, arr);
                }
              }
            }
            for (const [n, owners] of nodeOwners) {
              const ownerFolders = [...new Set(owners.map(o => o.folder))];
              if (ownerFolders.length < 2) continue;
              if (!owners.some(o => o.op === 'replace' || o.op === 'remove')) continue;
              xpathConflicts.push({
                nodeName: (n && n.nodeName) || '?',
                folders: ownerFolders,
                sels: [...new Set(owners.map(o => o.sel))].slice(0, 4)
              });
              if (xpathConflicts.length >= 5) break;
            }
          } catch { /* unparseable base — fall through to the info finding */ }
        }

        if (xpathConflicts.length > 0) {
          const example = xpathConflicts[0];
          const ordered2 = orderContested([...new Set(xpathConflicts.flatMap(c => c.folders))]);
          const winner2 = ordered2[ordered2.length - 1];
          findings.push({
            severity: "warning", category: "conflict", code: "patch.xpath_overlap",
            domain: "xml_patches", filePath: tf,
            message: `${mods.length} enabled mods patch ${tf} with DIFFERENT selector strings that resolve to the same node(s) in the base file — e.g. <${example.nodeName}> targeted by ${example.sels.map(s => `"${s}"`).join(" and ")} (${example.folders.join(", ")}). ${xpathConflicts.length} overlapping node(s) found; at least one op is replace/remove, so load order decides the result — simulated order: ${ordered2.join(" → ")}; winner: ${winner2}.`,
            sourceRef: { kind: "patch_conflict", id: tf, label: example.folders.join(", ") },
            openTargets: recs.map(r => ({ label: r.folder, path: `${r.folder}/${tf}` })),
            loadOrder: ordered2, winner: winner2,
            overlaps: xpathConflicts
          });
        } else {
          findings.push({
            severity: "info", category: "conflict", code: "patch.shared_target",
            domain: "xml_patches", filePath: tf,
            message: `${mods.length} enabled mods patch ${tf} (different selectors — lower conflict risk): ${mods.join(", ")}.`,
            sourceRef: { kind: "patch_conflict", id: tf, label: mods.join(", ") },
            openTargets: recs.map(r => ({ label: r.folder, path: `${r.folder}/${tf}` }))
          });
        }
      }
    }

    const rank: Record<string, number> = { error: 0, warning: 1, info: 2 };
    findings.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
    const counts = { error: 0, warning: 0, info: 0 } as Record<string, number>;
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

    return {
      extensionsScanned: exts.length,
      enabledCount: exts.filter(e => e.enabled).length,
      counts,
      findings,
      loadOrder
    };
}

app.get("/api/agent/extension-doctor", (_req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const extRoot = resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions") : "";
    if (!extRoot || !fs.existsSync(extRoot)) {
      return res.status(400).json({ error: "X4 extensions folder not found. Set the X4 game path in Settings." });
    }
    // Base-content resolver for XPath-level overlap detection: loose game file
    // first, then the packed .cat/.dat archives. Cached per scan.
    const baseCache = new Map<string, string | null>();
    const resolveBaseContent = (rel: string): string | null => {
      if (baseCache.has(rel)) return baseCache.get(rel)!;
      let out: string | null = null;
      try {
        const loose = path.join(resolved.x4GamePath!, rel);
        if (fs.existsSync(loose) && fs.statSync(loose).isFile()) {
          out = fs.readFileSync(loose, 'utf8');
        } else {
          const packed = catDatExtractBaseGameFile(resolved.x4GamePath!, rel.replace(/\\/g, '/'));
          if (packed) out = packed.text;
        }
      } catch { out = null; }
      baseCache.set(rel, out);
      return out;
    };
    return res.json({ success: true, extensionsRoot: extRoot, ...runExtensionDoctor(extRoot, { resolveBaseContent }) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "extension-doctor scan failed" });
  }
});

// #71 — multi-mod project view. Exposes the FULL dependency graph (nodes + resolved
// load order + cycles + missing/optional-dep issues) across the installed extensions,
// so the UI can show the mod ecosystem, not just the cycle findings the Doctor folds in.
app.get("/api/agent/mod-dependency-graph", (_req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const extRoot = resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions") : "";
    if (!extRoot || !fs.existsSync(extRoot)) {
      return res.status(400).json({ success: false, error: "X4 extensions folder not found. Set the X4 game path in Settings." });
    }
    const present: ModManifest[] = [];
    for (const folder of fs.readdirSync(extRoot)) {
      const absDir = path.join(extRoot, folder);
      try { if (!fs.statSync(absDir).isDirectory()) continue; } catch { continue; }
      const contentPath = path.join(absDir, "content.xml");
      if (!fs.existsSync(contentPath)) continue;
      try {
        const man = parseModManifest(folder, fs.readFileSync(contentPath, "utf8"));
        if (man) present.push(man);
      } catch { /* skip unreadable extension */ }
    }
    const graph = analyzeModDependencies(present);
    return res.json({ success: true, extensionsRoot: extRoot, ...graph });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || "mod-dependency-graph scan failed" });
  }
});

// T4.4 Override Visualizer (Inc 1) — per-element drill-down on a contested base
// file: who rewrites what, who wins. EXTENDS the Extension Doctor (same record
// shape + its simulated load order); the analysis engine is src/lib/overrideMap.ts.
app.get("/api/agent/override-map", (req, res) => {
  try {
    const targetFile = String(req.query.file || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!targetFile || targetFile.includes(":") || targetFile.split("/").includes("..")) {
      return res.status(400).json({ error: "Provide ?file=<base-relative xml path>, e.g. libraries/jobs.xml" });
    }
    const resolved = resolveXsdConfig();
    const extRoot = resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions") : "";
    if (!extRoot || !fs.existsSync(extRoot)) {
      return res.status(400).json({ error: "X4 extensions folder not found. Set the X4 game path in Settings." });
    }
    // Targeted record collection: same enabled / ego_* / diff-selector rules as the
    // Doctor's pathMap, but checking only the requested rel path in each extension.
    const records: { folder: string; isDiff: boolean; selectors: { op: string; sel: string }[] }[] = [];
    const extInfos: { folder: string; idLower: string; deps: { id: string }[] }[] = [];
    for (const folder of fs.readdirSync(extRoot)) {
      const absDir = path.join(extRoot, folder);
      const contentPath = path.join(absDir, "content.xml");
      try { if (!fs.statSync(absDir).isDirectory() || !fs.existsSync(contentPath)) continue; } catch { continue; }
      let cxml = "";
      try { cxml = fs.readFileSync(contentPath, "utf8"); } catch { continue; }
      const id = cxml.match(/<content\b[^>]*\bid\s*=\s*"([^"]+)"/i)?.[1] || folder;
      if (/^ego_/i.test(id)) continue;
      const enabledAttr = cxml.match(/<content\b[^>]*\benabled\s*=\s*"([^"]+)"/i)?.[1];
      if (enabledAttr === "0" || enabledAttr === "false") continue;
      extInfos.push({ folder, idLower: id.toLowerCase(), deps: [...cxml.matchAll(/<dependency\b[^>]*\bid\s*=\s*"([^"]+)"/gi)].map(mm => ({ id: mm[1] })) });
      const filePath = path.join(absDir, targetFile);
      if (!fs.existsSync(filePath)) continue;
      let xml = "";
      try { xml = fs.readFileSync(filePath, "utf8"); } catch { continue; }
      const isDiff = /<diff[\s>]/.test(xml);
      const selectors = isDiff
        ? [...xml.matchAll(/<(add|replace|remove)\b[^>]*\bsel\s*=\s*"([^"]+)"/gi)].map(mm => ({ op: mm[1].toLowerCase(), sel: mm[2] }))
        : [];
      records.push({ folder, isDiff, selectors });
    }
    // Simulated load order — the same shared topo sort the Extension Doctor
    // uses (simulateLoadOrder), WITHOUT re-running the Doctor's full file walk
    // on every drill-down call. ego_* DLCs are excluded here as in the Doctor's
    // collision pass — they never contest third-party records.
    const loadOrder = simulateLoadOrder(extInfos);
    // Vanilla content: loose game file first, then the packed .cat/.dat archives.
    let baseContent: string | null = null;
    try {
      const loose = path.join(resolved.x4GamePath!, targetFile);
      if (fs.existsSync(loose) && fs.statSync(loose).isFile()) {
        baseContent = fs.readFileSync(loose, "utf8");
      } else {
        const packed = catDatExtractBaseGameFile(resolved.x4GamePath!, targetFile);
        if (packed) baseContent = packed.text;
      }
    } catch { baseContent = null; }
    return res.json({ success: true, ...analyzeOverrides({ targetFile, records, loadOrder, baseContent }) });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "override-map failed" });
  }
});

app.get("/api/agent/override-map-selftest", (_req, res) => {
  try {
    return res.json(runOverrideMapSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "override-map-selftest failed" });
  }
});

// T4.1 Inc 0 — cat/dat round-trip spike oracle (synthetic fixture; proves
// parse → positioned read → gzip/zlib decompress before any VFS UI is built).
app.get("/api/agent/catdat-selftest", (_req, res) => {
  try {
    return res.json(runCatDatSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "catdat-selftest failed" });
  }
});

// H8 — object-index name-resolution oracle (synthetic fixtures; guards the regex
// XML/localization parsing incl. the multi-macro identification bounding fix).
app.get("/api/agent/object-index-selftest", (_req, res) => {
  try {
    return res.json(runObjectIndexSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "object-index-selftest failed" });
  }
});

// A4.2 — proposal-review engine oracle (synthetic fixtures; verifies the node
// diff + Schema/Graph verdicts + applySafe contract that gates AI applies).
app.get("/api/agent/proposal-review-selftest", (_req, res) => {
  try {
    return res.json(runProposalReviewSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "proposal-review-selftest failed" });
  }
});

// A4.9 — intent-satisfaction checker oracle (synthetic; verifies requirement
// pattern assertions incl. the Codex 'missing game-start trigger → FAIL' case).
app.get("/api/agent/intent-check-selftest", (_req, res) => {
  try {
    return res.json(runIntentCheckSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "intent-check-selftest failed" });
  }
});

// A5.1 — Architect ModBlueprint oracle (sanitize + the canMarkDone M-ARCH-2 guarantee).
app.get("/api/agent/blueprint-selftest", (_req, res) => {
  try {
    return res.json(runBlueprintSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "blueprint-selftest failed" });
  }
});

app.get("/api/agent/architect-loop-selftest", (_req, res) => {
  try {
    return res.json(runArchitectLoopSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "architect-loop-selftest failed" });
  }
});

app.get("/api/agent/canvas-interaction-selftest", (_req, res) => {
  try {
    return res.json(runCanvasInteractionSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "canvas-interaction-selftest failed" });
  }
});

// #23 — live-log error -> cue -> canvas navigation oracle (the deterministic core of the alert+jump feature).
app.get("/api/agent/live-log-nav-selftest", (_req, res) => {
  try {
    return res.json(runLiveLogNavSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "live-log-nav-selftest failed" });
  }
});

app.get("/api/agent/wares-jobs-roundtrip-selftest", (_req, res) => {
  try {
    return res.json(runWaresJobsRoundtripSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "wares-jobs-roundtrip-selftest failed" });
  }
});

app.get("/api/agent/mod-fixes-selftest", (_req, res) => {
  try {
    return res.json(runModFixesSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "mod-fixes-selftest failed" });
  }
});

// MD faithfulness guard oracle: proves the importer refuses to model MD it can't
// round-trip (so <delay>/<library>/<params> are preserved verbatim, never silently
// dropped), while still modeling MD it CAN round-trip.
app.get("/api/agent/md-faithfulness-selftest", (_req, res) => {
  try {
    const checks: { name: string; pass: boolean; detail?: any }[] = [];
    const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

    const wsOf = (md: string) => {
      const parsed = parseXMLToWorkspace(md);
      if (!parsed || !(parsed.nodes || []).length) return null;
      return generateMDXML(sanitizeWorkspace({ ...parsed, name: 'Faith_Test' } as any));
    };

    // 1) A cue with a <delay> now ROUND-TRIPS: the timer survives + elements preserved.
    const delayMd = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="D" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Tick"><delay exact="1s" /><actions><reset_cue cue="Tick" /></actions></cue>
  </cues>
</mdscript>`;
    const delayRegen = wsOf(delayMd);
    ok('delay_roundtrips', delayRegen !== null && /<delay exact="1s"/.test(delayRegen) && mdRoundTripPreservesElements(delayMd, delayRegen),
      { regenDelay: delayRegen ? (delayRegen.match(/<delay[^>]*>/) || [''])[0] : 'no-nodes' });

    // 2) A <library> now ROUND-TRIPS: re-emitted as <library>, params + actions preserved.
    const libMd = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="L" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <library name="Foo"><params><param name="x" default="1" /></params><actions><set_value name="$x" exact="1" /></actions></library>
    <cue name="Start"><conditions><event_game_started /></conditions><actions><set_value name="$y" exact="2" /></actions></cue>
  </cues>
</mdscript>`;
    const libRegen = wsOf(libMd);
    ok('library_roundtrips', libRegen !== null && /<library name="Foo"/.test(libRegen) && /<param name="x"/.test(libRegen) && mdRoundTripPreservesElements(libMd, libRegen),
      { regenHasLibrary: libRegen ? /<library/.test(libRegen) : 'no-nodes', regenHasParams: libRegen ? /<param /.test(libRegen) : false });

    // 3) Backstop still works: a construct we DON'T model (alternating delay/actions blocks)
    //    is detected lossy so it stays verbatim instead of silently dropping a block.
    const exoticMd = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="E" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Multi"><delay exact="1s" /><actions><set_value name="$a" exact="1" /></actions><delay exact="2s" /><actions><set_value name="$b" exact="2" /></actions></cue>
  </cues>
</mdscript>`;
    const exoticRegen = wsOf(exoticMd);
    ok('exotic_guard_backstop', exoticRegen !== null && !mdRoundTripPreservesElements(exoticMd, exoticRegen),
      { note: 'two delay/actions blocks; model keeps one → guard keeps file verbatim' });

    // 4) A fully-modelable cue must round-trip FAITHFULLY (still editable; not a false trip).
    const cleanMd = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="C" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Start"><conditions><event_game_started /></conditions><actions><set_value name="$z" exact="3" /></actions></cue>
  </cues>
</mdscript>`;
    const cleanRegen = wsOf(cleanMd);
    ok('clean_md_stays_faithful', cleanRegen !== null && mdRoundTripPreservesElements(cleanMd, cleanRegen),
      { regen: cleanRegen ? cleanRegen.replace(/\s+/g, ' ').slice(0, 160) : 'no-nodes' });

    const passed = checks.filter(c => c.pass).length;
    return res.json({ allPassed: passed === checks.length, passed, total: checks.length, checks });
  } catch (error) {
    return res.status(500).json({ allPassed: false, error: errorMessage(error) || "md-faithfulness-selftest failed" });
  }
});

app.get("/api/agent/aiscript-roundtrip-selftest", (_req, res) => {
  try {
    return res.json(runAiScriptRoundtripSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "aiscript-roundtrip-selftest failed" });
  }
});

app.get("/api/agent/lua-md-binding-selftest", (_req, res) => {
  try {
    return res.json(runLuaMdBindingSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "lua-md-binding-selftest failed" });
  }
});

app.get("/api/agent/mod-dependency-selftest", (_req, res) => {
  try {
    return res.json(runModDependencyGraphSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "mod-dependency-selftest failed" });
  }
});

app.get("/api/agent/galaxy-map-selftest", (_req, res) => {
  try {
    return res.json(runGalaxyMapSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "galaxy-map-selftest failed" });
  }
});

app.get("/api/agent/extension-project-selftest", (_req, res) => {
  try {
    return res.json(runExtensionProjectSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "extension-project-selftest failed" });
  }
});

app.get("/api/agent/project-orchestration-selftest", (_req, res) => {
  try {
    return res.json(runProjectOrchestrationSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "project-orchestration-selftest failed" });
  }
});

app.get("/api/agent/project-crossfile-selftest", (_req, res) => {
  try {
    return res.json(runProjectCrossFileSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "project-crossfile-selftest failed" });
  }
});

// P4 — third-party API registry (palettization). Curated registry + ◐ heuristic
// dependency/usage validation for community library mods (sn_mod_support_apis, kuertee).
app.get("/api/agent/external-api-registry-selftest", (_req, res) => {
  try {
    return res.json(runExternalApiRegistrySelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "external-api-registry-selftest failed" });
  }
});

/* ------------------------------------------------------------------ *
 * P4 dynamic registry — DUMP IN new API defs from three sources, all merged
 * onto the built-in seed through the same validate→merge pipeline:
 *   1. bundled repo dir  data/api-registry/*.json
 *   2. configured folder config.apiRegistryPath (optional)
 *   3. runtime endpoint  POST /api/agent/external-api/register  (in-memory)
 * Plus derive→refine: GET /api/agent/external-api/derive reads an installed mod.
 * ------------------------------------------------------------------ */

// in-memory defs registered at runtime via the endpoint (source 3)
const runtimeApiDefs: ApiDefinition[] = [];
// last load report (for the listing endpoint)
let apiRegistrySources: {
  builtin: number; dataDir: number; folder: number; endpoint: number;
  errors: { source: string; file?: string; errors: string[] }[];
  conflicts: { extensionId: string; kind: string; detail: string }[];
} = { builtin: EXTERNAL_API_REGISTRY.length, dataDir: 0, folder: 0, endpoint: 0, errors: [], conflicts: [] };

/** Read + validate every *.json def in a directory. Bad files are reported, never fatal. */
function loadApiDefsFromDir(dir: string, origin: ApiOrigin): { defs: ApiDefinition[]; errors: { source: string; file?: string; errors: string[] }[] } {
  const defs: ApiDefinition[] = [];
  const errors: { source: string; file?: string; errors: string[] }[] = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir).filter(f => {
      const lower = f.toLowerCase();
      // skip the JSON Schema + any underscore-prefixed helper files
      return lower.endsWith(".json") && lower !== "schema.json" && !f.startsWith("_");
    });
  } catch { return { defs, errors }; } // dir missing is fine
  for (const f of entries) {
    const full = path.join(dir, f);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const parsed = JSON.parse(raw);
      const v = validateApiDefinition(parsed, origin);
      if (v.ok && v.normalized) defs.push(v.normalized);
      else errors.push({ source: origin, file: f, errors: v.errors });
    } catch (e) {
      errors.push({ source: origin, file: f, errors: [errorMessage(e) || "unreadable / invalid JSON"] });
    }
  }
  return { defs, errors };
}

/** Rebuild + apply the active registry from all three sources. Idempotent. */
function loadAndApplyExternalApiRegistry(): void {
  const errors: { source: string; file?: string; errors: string[] }[] = [];
  const conflictsAll: { extensionId: string; kind: string; detail: string }[] = [];

  const dataDir = path.join(process.cwd(), "data", "api-registry");
  const fromData = loadApiDefsFromDir(dataDir, "data-dir");
  errors.push(...fromData.errors);

  let fromFolder = { defs: [] as ApiDefinition[], errors: [] as typeof errors };
  try {
    const cfg = readXsdConfig() as Record<string, unknown>;
    const folder = typeof cfg.apiRegistryPath === "string" ? cfg.apiRegistryPath.trim() : "";
    if (folder) { fromFolder = loadApiDefsFromDir(folder, "folder"); errors.push(...fromFolder.errors); }
  } catch { /* no config */ }

  // merge in order: data-dir → folder → endpoint
  let merged = EXTERNAL_API_REGISTRY.map(e => ({ ...e, origin: "builtin" as ApiOrigin })) as ApiDefinition[];
  for (const layer of [fromData.defs, fromFolder.defs, runtimeApiDefs]) {
    const r = mergeRegistries(merged, layer);
    merged = r.registry;
    conflictsAll.push(...r.conflicts);
  }
  setActiveRegistry(merged);

  apiRegistrySources = {
    builtin: EXTERNAL_API_REGISTRY.length,
    dataDir: fromData.defs.length,
    folder: fromFolder.defs.length,
    endpoint: runtimeApiDefs.length,
    errors,
    conflicts: conflictsAll,
  };

  // Load-time guards (curated built-ins now ship as data files): make a missing or
  // malformed registry LOUD instead of silently degrading the validators.
  if (merged.length === 0) {
    console.error("[external-api-registry] WARNING: active registry is EMPTY — no API defs loaded (check data/api-registry/).");
  } else if (fromData.defs.length === 0) {
    console.warn(`[external-api-registry] No built-in API defs loaded from ${dataDir} — only ${merged.length} API(s) from other sources.`);
  }
  if (errors.length > 0) {
    console.warn(`[external-api-registry] ${errors.length} API def file(s) failed validation:`, errors.map(e => `${e.source}/${e.file || "?"}`).join(", "));
  }
}
loadAndApplyExternalApiRegistry();

// Public read-only: the merged active registry + where each entry came from + load report.
app.get("/api/agent/external-api-registry", (req, res) => {
  try {
    const registry = getActiveRegistry();
    const full = String(req.query.full || "") === "1" || req.query.full === "true";
    return res.json({
      success: true,
      count: registry.length,
      // ?full=1 returns the complete entries (with symbols) so the UI can run the
      // same detect/validate the server would; default returns a light summary.
      apis: full
        ? registry
        : registry.map(e => ({
            extensionId: e.extensionId,
            name: e.name,
            origin: (e as ApiDefinition).origin || "builtin",
            dependsOn: e.dependsOn,
            components: e.components.map(c => ({ id: c.id, title: c.title, symbols: c.symbols.length })),
          })),
      sources: apiRegistrySources,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: errorMessage(error) || "external-api-registry failed" });
  }
});

// Authenticated: register an API def at runtime (in-memory; not persisted to disk).
app.post("/api/agent/external-api/register", (req, res) => {
  try {
    const v = validateApiDefinition(req.body, "endpoint");
    if (!v.ok || !v.normalized) {
      return res.status(400).json({ success: false, ok: false, errors: v.errors });
    }
    // replace any existing runtime def with the same id, then re-merge
    const idx = runtimeApiDefs.findIndex(d => d.extensionId.toLowerCase() === v.normalized!.extensionId.toLowerCase());
    if (idx >= 0) runtimeApiDefs[idx] = v.normalized; else runtimeApiDefs.push(v.normalized);
    loadAndApplyExternalApiRegistry();
    return res.json({
      success: true, ok: true,
      registered: v.normalized.extensionId,
      totalApis: getActiveRegistry().length,
      sources: apiRegistrySources,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: errorMessage(error) || "external-api register failed" });
  }
});

// Authenticated: derive a DRAFT API def from an installed extension's loose files.
app.get("/api/agent/external-api/derive", (req, res) => {
  try {
    const ext = String(req.query.ext || "").trim();
    if (!ext || /[\\/]|\.\./.test(ext)) {
      return res.status(400).json({ success: false, error: "provide ?ext=<extension_folder_name> (no path separators)" });
    }
    const resolved = resolveXsdConfig();
    const candidates = [
      resolved.filesystemPath ? path.join(resolved.filesystemPath, ext) : "",
      resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions", ext) : "",
      resolved.modWorkspacePath ? path.join(resolved.modWorkspacePath, ext) : "",
    ].filter(Boolean);
    const extRoot = candidates.find(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
    if (!extRoot) {
      return res.status(404).json({ success: false, error: `extension "${ext}" not found under configured roots`, searched: candidates });
    }
    // collect loose .xml/.lua files (packed cat/dat not read here — honest limitation)
    const files: { path: string; content: string }[] = [];
    const MAX_FILES = 400, MAX_BYTES = 2_000_000;
    let bytes = 0;
    const walk = (dir: string, rel: string) => {
      if (files.length >= MAX_FILES || bytes >= MAX_BYTES) return;
      let ents: fs.Dirent[] = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const d of ents) {
        if (files.length >= MAX_FILES || bytes >= MAX_BYTES) break;
        const abs = path.join(dir, d.name);
        const r = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) { walk(abs, r); continue; }
        if (!/\.(xml|lua)$/i.test(d.name)) continue;
        try {
          const sz = fs.statSync(abs).size;
          if (sz > 500_000) continue;
          const content = fs.readFileSync(abs, "utf8");
          bytes += content.length;
          files.push({ path: r, content });
        } catch { /* skip unreadable */ }
      }
    };
    walk(extRoot, "");
    // Also read PACKED .xml/.lua from the extension's own .cat/.dat (published mods —
    // sn/kuertee on Steam Workshop — ship packed, so loose-only would find nothing).
    let packedFiles = 0;
    try {
      for (const archive of findCatDatArchives([extRoot], true).filter(a => path.dirname(a.catPath).toLowerCase() === extRoot.toLowerCase())) {
        if (bytes >= MAX_BYTES || files.length >= MAX_FILES) break;
        let entries: ReturnType<typeof parseCat> = [];
        try { entries = parseCat(archive.catPath); } catch { continue; }
        for (const entry of entries) {
          if (bytes >= MAX_BYTES || files.length >= MAX_FILES) break;
          if (!/\.(xml|lua)$/i.test(entry.name)) continue;
          try {
            const content = readEntryText(archive.datPath, entry);
            if (!content || content.length > 500_000) continue;
            bytes += content.length;
            packedFiles++;
            files.push({ path: entry.name.replace(/\\/g, "/"), content });
          } catch { /* skip unreadable entry */ }
        }
      }
    } catch { /* no packed archives */ }
    const { definition, notes } = deriveApiDefinition(ext, files);
    const validation = validateApiDefinition(definition, "derived");
    return res.json({
      success: true,
      extensionRoot: extRoot,
      filesScanned: files.length,
      packedFilesScanned: packedFiles,
      definition,
      notes,
      validates: validation.ok,
      validationErrors: validation.errors,
      note: "DRAFT — reads loose + packed (.cat/.dat) .xml/.lua. Refine summaries + detect tokens, then POST to /api/agent/external-api/register.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: errorMessage(error) || "external-api derive failed" });
  }
});

// P0c — project-level agent API. Stateless: the agent holds the project (create + add
// files client-side) and POSTs it here to validate as a unit. Returns BOTH structural
// issues AND the cross-file cue index (defined/references/unresolved) as first-class
// results — the cross-file linkage is the keystone's actual value-add over per-file checks.
app.post("/api/agent/project/create", (req, res) => {
  try {
    const meta = req.body?.meta || req.body || {};
    if (!meta.id) return res.status(400).json({ error: "Body must include { meta: { id, name?, version?, deps? } } or top-level id." });
    const project = createAgentProject(meta);
    return res.json({ success: true, project });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project create failed" });
  }
});

app.post("/api/agent/project/file/create", (req, res) => {
  try {
    const project = req.body?.project as ExtensionProject | undefined;
    const file = req.body?.file;
    if (!project || !Array.isArray(project.files) || !file?.path) {
      return res.status(400).json({ error: "Body must be { project, file: { path, content?, kind? } }." });
    }
    return res.json({ success: true, project: createProjectFile(project, file) });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project file/create failed" });
  }
});

app.post("/api/agent/project/generate", (req, res) => {
  try {
    const spec = req.body?.spec || req.body || {};
    const project = generateAgentProject(spec);
    const packaged = packageAgentProject(project);
    return res.json({ success: true, project, summary: packaged.summary, validation: packaged.validation });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project generate failed" });
  }
});

app.post("/api/agent/project/package", (req, res) => {
  try {
    const project = req.body?.project as ExtensionProject | undefined;
    if (!project || !Array.isArray(project.files)) {
      return res.status(400).json({ error: "Body must be { project: { id, name, files } }." });
    }
    const packaged = packageAgentProject(project);
    return res.json({ success: true, ...packaged });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project package failed" });
  }
});

app.post("/api/agent/project/validate-crossfile", (req, res) => {
  try {
    const project = req.body?.project as ExtensionProject | undefined;
    if (!project || typeof project !== "object" || !Array.isArray(project.files)) {
      return res.status(400).json({ error: "Body must be { project: { id, name, files: [{ path, kind, content? }, ...] } }." });
    }
    if (project.files.length > 2000) {
      return res.status(413).json({ error: "Project has too many files (>2000)." });
    }
    return res.json(validateProjectCrossFile(project));
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project cross-file validate failed" });
  }
});

app.post("/api/agent/project/validate", (req, res) => {
  try {
    const project = req.body?.project as ExtensionProject | undefined;
    if (!project || typeof project !== "object" || !Array.isArray(project.files)) {
      return res.status(400).json({ error: "Body must be { project: { id, name, files: [{ path, kind, content? }, ...] } }." });
    }
    if (project.files.length > 2000) {
      return res.status(413).json({ error: "Project has too many files (>2000)." });
    }
    const structure = validateProjectStructure(project);
    const cueIndex = indexCueReferences(project);
    const crossFile = validateProjectCrossFile(project);
    const structuralErrors = structure.filter(i => i.severity === "error").length;
    return res.json({
      ok: structuralErrors === 0 && cueIndex.unresolved.length === 0 && crossFile.ok,
      summary: {
        files: project.files.length,
        structuralErrors,
        definedCues: cueIndex.defined.length,
        cueReferences: cueIndex.references.length,
        unresolvedCueRefs: cueIndex.unresolved.length,
        crossFileErrors: crossFile.summary.errors,
        mdLuaMissingRegisters: crossFile.summary.mdLuaMissingRegisters,
        luaMdMissingListeners: crossFile.summary.luaMdMissingListeners,
      },
      structure,
      cueIndex, // { defined, references, unresolved } — cross-file linkage, first-class
      crossFile,
    });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "project validate failed" });
  }
});

// P0b/P0c — author a content.xml (with <dependency> children) from declarative meta.
app.post("/api/agent/project/content-xml", (req, res) => {
  try {
    const meta = req.body?.meta;
    if (!meta || typeof meta !== "object" || !meta.id) {
      return res.status(400).json({ error: "Body must be { meta: { id, name?, version?, author?, description?, deps? } }." });
    }
    return res.json({ contentXml: buildContentXml(meta) });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "content-xml authoring failed" });
  }
});

// #64 Phase 1 — real-data galaxy/sector map built from the installed universe files.
// Read-only; reads base-game maps/xu_ep2_universe/{galaxy,clusters}.xml plus
// packed DLC/extension galaxy diffs and *_clusters.xml macro files via cat/dat.
app.get("/api/agent/galaxy-map", (_req, res) => {
  try {
    const resolved = resolveXsdConfig();
    if (!resolved.x4GamePath) return res.status(400).json({ error: "X4 game path not set." });
    const galaxyHit = catDatExtractBaseGameFile(resolved.x4GamePath, "maps/xu_ep2_universe/galaxy.xml");
    const clustersHit = catDatExtractBaseGameFile(resolved.x4GamePath, "maps/xu_ep2_universe/clusters.xml");
    if (!galaxyHit || !clustersHit) {
      return res.status(404).json({ error: "Universe files not found in the configured game path." });
    }
    const extensionMatches = catDatExtractEntries(
      [resolved.x4GamePath],
      name => name.startsWith("maps/xu_ep2_universe/")
        && (/(^|\/)galaxy\.xml$/i.test(name) || /(^|\/)[^/]*_clusters\.xml$/i.test(name)),
      { dedupeByName: false, includeSubst: true, maxBytesPerEntry: 8 * 1024 * 1024 }
    ).matches.filter(match => /[\\/]extensions[\\/]/i.test(match.catPath));
    const extensionSources: GalaxyMapSource[] = extensionMatches.map(match => ({
      path: match.name,
      text: match.text,
      source: `${path.basename(path.dirname(match.catPath))}/${match.name}`,
    }));
    const map = buildMergedGalaxyMap(galaxyHit.text, clustersHit.text, extensionSources);
    return res.json({ success: true, counts: map.counts, bounds: map.bounds, clusters: map.clusters, sectors: map.sectors, sources: map.sources });
  } catch (error) {
    return res.status(500).json({ error: errorMessage(error) || "galaxy-map failed" });
  }
});

app.get("/api/agent/position-picker-selftest", (_req, res) => {
  try {
    return res.json(runPositionPickerSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "position-picker-selftest failed" });
  }
});

// T4.2 Diff-to-Patch — synthesize the minimal X4 <diff> turning a vanilla file
// into the user's edited copy (engine: src/lib/xpathSynth.ts). The vanilla side
// can be supplied inline or resolved from the game data (loose → packed).
app.post("/api/agent/xpath-synth", (req, res) => {
  try {
    const editedXml = String(req.body?.editedXml || "");
    if (!editedXml.trim()) {
      return res.status(400).json({ error: "Missing editedXml." });
    }
    let vanillaXml = typeof req.body?.vanillaXml === "string" ? req.body.vanillaXml : "";
    const targetFile = String(req.body?.targetFile || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!vanillaXml && targetFile) {
      if (targetFile.includes(":") || targetFile.split("/").includes("..")) {
        return res.status(400).json({ error: "Invalid targetFile path." });
      }
      const resolved = resolveXsdConfig();
      if (resolved.x4GamePath) {
        const loose = path.join(resolved.x4GamePath, targetFile);
        if (fs.existsSync(loose) && fs.statSync(loose).isFile()) {
          vanillaXml = fs.readFileSync(loose, "utf8");
        } else {
          const packed = catDatExtractBaseGameFile(resolved.x4GamePath, targetFile);
          if (packed) vanillaXml = packed.text;
        }
      }
      if (!vanillaXml) {
        return res.status(404).json({ error: "Could not resolve vanilla content for " + targetFile + " (loose or packed)." });
      }
    }
    if (!vanillaXml) {
      return res.status(400).json({ error: "Provide vanillaXml or a resolvable targetFile." });
    }
    const result = synthesizePatch(vanillaXml, editedXml);
    return res.json({ success: true, targetFile: targetFile || null, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message || "xpath-synth failed" });
  }
});

app.get("/api/agent/xpath-synth-selftest", (_req, res) => {
  try {
    return res.json(runXpathSynthSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: error.message || "xpath-synth-selftest failed" });
  }
});

// Positive regression test: synthesize a temp extensions folder with deliberate faults
// (a required missing dependency, a duplicate id, and two mods patching the same
// libraries/jobs.xml with an identical selector) and assert each check fires. The real
// install is conflict-clean, so this is how we prove the positive paths actually work.
// UI layout (grid descriptor + pixel->grid bridge) self-test.
app.get("/api/agent/ui-layout-selftest", (_req, res) => {
  try { res.json(runUILayoutSelftest()); }
  catch (error) { res.status(500).json({ error: error?.message || "ui-layout-selftest failed" }); }
});

// HUD & LUA UI Layout Designer — widget validation self-test.
app.get("/api/agent/ui-widget-validate-selftest", (_req, res) => {
  try {
    res.json(runUiWidgetValidateSelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "ui-widget-validate-selftest failed" });
  }
});

// Tier 2 / T3.3 — read/tail an X4 debug-log file and parse it into cue telemetry.
function readAndParseLogFile(filePath: string, cueNames: string[], maxBytes = 262144) {
  const stat = fs.statSync(filePath);
  let text: string;
  if (stat.size > maxBytes) {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
      text = buf.toString("utf8");
      const nl = text.indexOf("\n"); if (nl >= 0) text = text.slice(nl + 1); // drop the partial first line
    } finally { fs.closeSync(fd); }
  } else {
    text = fs.readFileSync(filePath, "utf8");
  }
  return parseLogTelemetry(text, Array.isArray(cueNames) ? cueNames : []);
}

function runLogFileSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const tmp = path.join(os.tmpdir(), `mdstudio_logtest_${Date.now()}.log`);
  let cleaned = false;
  try {
    fs.writeFileSync(tmp, "[General] 1.0 cue Foo started\n[=ERROR=] 2.0 error in cue Bar: nil value\n");
    const r = readAndParseLogFile(tmp, ["Foo", "Bar"]);
    ok("reads_two_lines", r.totals.lines === 2);
    ok("parses_one_error", r.totals.errors === 1);
    ok("correlates_bar_error", !!r.cues.find(c => c.name === "Bar" && c.errors === 1));
    ok("correlates_foo_clean", !!r.cues.find(c => c.name === "Foo" && c.errors === 0));
  } catch (e) { ok("no_exception", false, String(e && e.message || e)); }
  finally { try { fs.unlinkSync(tmp); cleaned = true; } catch {} }
  ok("temp_cleaned_up", cleaned);
  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}

app.get("/api/agent/log-file-selftest", (_req, res) => {
  try {
    res.json(runLogFileSelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "log-file-selftest failed" });
  }
});

// Live-tail endpoint (authed): read the tail of a user-specified log file + parse it.
app.post("/api/agent/log-file-tail", (req, res) => {
  try {
    const { path: filePath, cueNames, maxBytes } = (req.body || {}) as any;
    if (!filePath || typeof filePath !== "string") return res.status(400).json({ error: "path required" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file not found" });
    const telemetry = readAndParseLogFile(filePath, cueNames, typeof maxBytes === "number" ? maxBytes : undefined);
    res.json({ success: true, path: filePath, telemetry: { ...telemetry, entries: telemetry.entries.slice(-500) } });
  } catch (error) {
    res.status(500).json({ error: error?.message || "log-file-tail failed" });
  }
});

// Tier 2 / T3.1 — log-telemetry parser self-test.
app.get("/api/agent/log-telemetry-selftest", (_req, res) => {
  try {
    res.json(runLogTelemetrySelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "log-telemetry-selftest failed" });
  }
});

// T5 — Live Fix Loop rule-engine self-test.
app.get("/api/agent/live-fixes-selftest", (_req, res) => {
  try {
    res.json(runLiveFixesSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "live-fixes-selftest failed" });
  }
});

// Tier 2 / T2.1 — structural cue-lineage analyzer self-test.
app.get("/api/agent/cue-lineage-selftest", (_req, res) => {
  try {
    res.json(runCueLineageSelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "cue-lineage-selftest failed" });
  }
});

// Determinism Doctrine / Phase 1 — MD Semantics Registry (the "Meaning" layer) self-test.
app.get("/api/agent/semantics-selftest", (_req, res) => {
  try {
    res.json(runSemanticsSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "semantics-selftest failed" });
  }
});

// Deterministic semantics lookup. No arg → the curated registry listing.
// ?tag=<element> → curated entry or honest fallback. ?tag=&props={json} → a
// node-style description (used to prove deterministic describe over real attributes).
app.get("/api/agent/semantics", (req, res) => {
  try {
    const tag = (req.query.tag as string) || "";
    if (!tag) {
      return res.json({ success: true, count: listSemantics().length, registry: listSemantics() });
    }
    let props: Record<string, any> = {};
    if (req.query.props) {
      try { props = JSON.parse(req.query.props as string); } catch { props = {}; }
    }
    const type = (req.query.type as string) || "action";
    res.json({ success: true, ...semanticsForNode({ xmlTag: tag, type: type as any, properties: props }) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || "semantics lookup failed" });
  }
});

// Determinism Doctrine / Phase 2 — deterministic explainer self-test.
app.get("/api/agent/explain-selftest", (_req, res) => {
  try {
    res.json(runExplainSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "explain-selftest failed" });
  }
});

// Deterministic explanation of a posted {nodes, links} graph (no AI). Authed POST.
app.post("/api/agent/explain", (req, res) => {
  try {
    const { nodes, links } = req.body || {};
    res.json({ success: true, ...explainWorkspace(nodes || [], links || []) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || "explain failed" });
  }
});

// Node-level schema diagnostics — maps game-schema validation to the exact node, for
// the in-your-face on-canvas error/warning badges. Schema-driven (md.xsd), no AI.
function getNodeSchemaView(): NodeSchemaView {
  try {
    const idx = getSchemaIndex();
    return {
      loaded: !!idx.loaded,
      has: (t: string) => idx.elements.has(String(t).toLowerCase()),
      requiredAttrs: (t: string) => {
        const spec = idx.elements.get(String(t).toLowerCase());
        if (!spec) return [];
        return [...spec.attributes.entries()].filter(([, a]: any) => a.required).map(([k]: any) => k);
      },
    };
  } catch {
    return { loaded: false, has: () => false, requiredAttrs: () => [] };
  }
}

app.post("/api/agent/node-diagnostics", (req, res) => {
  try {
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : (req.body?.workspace?.nodes || []);
    const diagnostics = validateNodesAgainstSchema(nodes, getNodeSchemaView());
    res.json({ success: true, schemaLoaded: getNodeSchemaView().loaded, diagnostics, byNode: summarizeByNode(diagnostics) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || "node-diagnostics failed" });
  }
});

app.get("/api/agent/node-diagnostics-selftest", (_req, res) => {
  try {
    res.json(runNodeDiagnosticsSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "node-diagnostics-selftest failed" });
  }
});

// Selective node alignment/distribution geometry oracle (UE5-style align tools).
app.get("/api/agent/node-align-selftest", (_req, res) => {
  try {
    res.json(runNodeAlignSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "node-align-selftest failed" });
  }
});

// Graph auto-layout (53rd pass, gap G11) — deterministic tiered layout; no-overlap oracle.
app.get("/api/agent/auto-layout-selftest", (_req, res) => {
  try {
    res.json(runAutoLayoutSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "auto-layout-selftest failed" });
  }
});

// Composite blocks (53rd pass, gap G10) — one-click multi-node patterns; structural + compile checks.
app.get("/api/agent/composite-blocks-selftest", (_req, res) => {
  try {
    res.json(runCompositeBlocksSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "composite-blocks-selftest failed" });
  }
});

// Starter mod templates (53rd pass, gap G9) — each non-blank template must compile clean.
app.get("/api/agent/mod-templates-selftest", (_req, res) => {
  try {
    res.json(runModTemplatesSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "mod-templates-selftest failed" });
  }
});

// Compiled-XML self-test (52nd pass, gap G2) — asserts what generateMDXML actually emits.
app.get("/api/agent/compile-selftest", (_req, res) => {
  try {
    res.json(runCompileSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "compile-selftest failed" });
  }
});

// Friendly node names (51st pass, Track 1) — plain-English display-name registry self-test.
app.get("/api/agent/friendly-names-selftest", (_req, res) => {
  try {
    res.json(runFriendlyNamesSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "friendly-names-selftest failed" });
  }
});

// Port-semantics layer (50th pass) — typed-connector + branch-body model self-test.
app.get("/api/agent/port-semantics-selftest", (_req, res) => {
  try {
    res.json(runPortSemanticsSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "port-semantics-selftest failed" });
  }
});

// Determinism Doctrine / Phase 4 — deterministic MD simulator self-test.
app.get("/api/agent/simulate-selftest", (_req, res) => {
  try {
    res.json(runSimulateSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "simulate-selftest failed" });
  }
});

// Deterministic simulation of a posted {nodes, links, seed} graph (no AI). Authed POST.
// seed pre-loads known variable values (e.g. {"$threat": 5}); unseeded ⇒ unknown.
app.post("/api/agent/simulate", (req, res) => {
  try {
    const { nodes, links, seed } = req.body || {};
    res.json({ success: true, ...simulateWorkspace(nodes || [], links || [], seed || {}) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || "simulate failed" });
  }
});

// Determinism Doctrine / Phase 3 — deterministic critic self-test.
app.get("/api/agent/critic-selftest", (_req, res) => {
  try {
    res.json(runCriticSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "critic-selftest failed" });
  }
});

// XML well-formedness gate self-test — the layer below the graph importer that catches the
// mismatched/unclosed-tag class X4 rejects on load but @xmldom/xmldom silently tolerated.
app.get("/api/agent/xml-wellformed-selftest", (_req, res) => {
  try {
    res.json(runXmlWellformedSelftest());
  } catch (error) {
    res.status(500).json({ allPassed: false, error: error?.message || "xml-wellformed-selftest failed" });
  }
});

// Vanilla-UI reference engine self-test — profiles menu Lua against the standalone-menu schema and
// validates a candidate against the patterns observed in known-working menus.
app.get("/api/agent/vanilla-ui-selftest", (_req, res) => {
  try {
    res.json(runVanillaUiReferenceSelftest());
  } catch (error) {
    res.status(500).json({ allPassed: false, error: error?.message || "vanilla-ui-selftest failed" });
  }
});

// REAL-DATA harvester: scan the base-game .cat/.dat for vanilla menu Lua, profile each against the
// standalone-menu contract, and derive which schema elements are UNIVERSAL across real menus. This
// grounds X4_STANDALONE_MENU_SCHEMA in the engine's own menus instead of two hand-picked examples.
// Authenticated, read-only, on-demand (full-cat scan is fine off the hot path).
app.get("/api/agent/vanilla-ui-harvest", (req, res) => {
  try {
    const resolved = resolveXsdConfig();
    if (!resolved.x4GamePath) return res.status(400).json({ error: "X4 game path not configured." });
    const limit = Math.min(Number(req.query.limit) || 24, 60);
    // Menu-bearing vanilla UI lua: ui/core/menus/<name>/<name>.lua, chatwindow, optionsmenu, etc.
    const isMenuLua = (n: string) => /^ui\/.*\.lua$/i.test(n) &&
      /(menu|chatwindow|widget_fullscreen|optionsmenu|interactmenu|gameoptions)/i.test(n);
    const corpus: { name: string; profile: ReturnType<typeof profileMenuLua> }[] = [];
    let scanned = 0;
    for (const arc of findCatDatArchives([resolved.x4GamePath], true)) {
      let entries: ReturnType<typeof parseCat> = [];
      try { entries = parseCat(arc.catPath); } catch { continue; }
      for (const e of entries) {
        if (corpus.length >= limit) break;
        const name = e.name.replace(/\\/g, "/");
        if (!isMenuLua(name) || !(e.size > 0 && e.size < 512 * 1024)) continue;
        let text = '';
        try { text = readEntryText(arc.datPath, e); } catch { continue; }
        if (!text) continue;
        scanned++;
        const profile = profileMenuLua(text);
        if (profile.isMenuLike) corpus.push({ name, profile });
      }
      if (corpus.length >= limit) break;
    }
    const evidence = deriveSchemaEvidence(corpus);
    return res.json({
      ok: true, scanned, menusProfiled: corpus.length,
      evidence,
      menus: corpus.map((c) => ({ name: c.name, ...c.profile })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "vanilla-ui-harvest failed" });
  }
});

// Deterministic critique of a posted {nodes, links} graph (no AI). Authed POST.
app.post("/api/agent/critic", (req, res) => {
  try {
    const { nodes, links } = req.body || {};
    res.json({ success: true, ...critiqueWorkspace(nodes || [], links || []) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || "critic failed" });
  }
});

// Lever 3 — vetted Lua snippet library (the harder X4 patterns) + its self-test.
app.get("/api/agent/lua-snippets", (_req, res) => {
  try {
    res.json({ success: true, snippets: LUA_SNIPPETS, selftest: runLuaSnippetSelftest() });
  } catch (error) {
    res.status(500).json({ error: error?.message || "lua-snippets failed" });
  }
});

app.get("/api/agent/lua-static-selftest", (_req, res) => {
  try {
    res.json(runLuaStaticAnalysisSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "lua-static-selftest failed" });
  }
});

app.get("/api/agent/lua-runtime-log-selftest", (_req, res) => {
  try {
    return res.json(runLuaRuntimeLogSelftest());
  } catch (error) {
    return res.status(500).json({ pass: false, error: errorMessage(error) || "lua-runtime-log-selftest failed" });
  }
});

app.get("/api/agent/lua-logic-blocks-selftest", (_req, res) => {
  try {
    res.json(runLuaLogicBlocksSelftest());
  } catch (error) {
    res.status(500).json({ pass: false, error: error?.message || "lua-logic-blocks-selftest failed" });
  }
});

// Lever 2 — external-integration / contract seam: validate the X4<->external HTTP/JSON
// contract and generate the X4-side glue Lua. Read-only public GETs (no secrets, no mutation).
app.get("/api/agent/contract-selftest", (_req, res) => {
  try {
    res.json(runContractGlueSelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "contract-selftest failed" });
  }
});

app.get("/api/agent/file-bridge-transport-selftest", (_req, res) => {
  try {
    res.json(runFileBridgeTransportSelftest());
  } catch (error) {
    res.status(500).json({ error: error?.message || "file-bridge-transport-selftest failed" });
  }
});

app.get("/api/agent/contract-glue-sample", (_req, res) => {
  try {
    const sample: IntegrationContract = {
      namespace: "myai",
      baseUrl: "http://127.0.0.1:8713",
      endpoints: [
        { id: "get_status", method: "GET", path: "/v1/status", response: [{ name: "ok", type: "boolean" }] },
        { id: "send_prompt", method: "POST", path: "/v1/prompt", request: [{ name: "text", type: "string", required: true }], response: [{ name: "reply", type: "string" }] },
        { id: "file_prompt", kind: "file_bridge", request: [{ name: "text", type: "string", required: true }], response: [{ name: "reply", type: "string" }],
          fileBridge: { directory: "x4_forge_bridge", requestFile: "prompt_request.json", responseFile: "prompt_response.json", pollInterval: "0.5s", timeout: "8s" } }
      ]
    };
    const findings = validateContract(sample);
    const lua = generateHttpGlueLua(sample);
    const mdScript = generateContractMdScript(sample, "mymod_http");
    res.json({ success: true, contract: sample, findings, lua, mdScript });
  } catch (error) {
    res.status(500).json({ error: error?.message || "contract-glue-sample failed" });
  }
});

app.get("/api/agent/extension-doctor-selftest", (_req, res) => {
  let tmp = "";
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "x4ed-"));
    const write = (rel: string, content: string) => {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    };
    const writeCatDat = (folder: string, catName: string, entries: { name: string; text: string }[]) => {
      const dir = path.join(tmp, folder);
      fs.mkdirSync(dir, { recursive: true });
      const parts = entries.map(e => ({ name: e.name, data: Buffer.from(e.text, "utf8") }));
      const cat = parts.map((p, i) => `${p.name} ${p.data.length} ${1700000000 + i} ${String(i).repeat(32).slice(0, 32).padEnd(32, "0")}`).join("\n") + "\n";
      fs.writeFileSync(path.join(dir, catName), cat);
      fs.writeFileSync(path.join(dir, catName.replace(/\.cat$/i, ".dat")), Buffer.concat(parts.map(p => p.data)));
    };
    write("mod_a/content.xml", `<?xml version="1.0"?>\n<content id="mod_a" name="Mod A" version="100" enabled="1">\n  <dependency id="not_installed_dep" name="Ghost Dependency"/>\n</content>`);
    write("mod_a/libraries/jobs.xml", `<?xml version="1.0"?>\n<diff>\n  <add sel="/jobs"><job id="a_job"/></add>\n</diff>`);
    write("mod_b/content.xml", `<?xml version="1.0"?>\n<content id="mod_b" name="Mod B" version="100" enabled="1">\n  <dependency id="mod_z" name="Z Library"/>\n</content>`);
    write("mod_b/libraries/jobs.xml", `<?xml version="1.0"?>\n<diff>\n  <add sel="/jobs"><job id="b_job"/></add>\n</diff>`);
    // mod_z: alphabetically AFTER mod_b, but mod_b depends on it, so the topological
    // load order must place mod_z BEFORE mod_b. Also collides with mod_a/mod_b on a
    // full-file override (libraries/wares.xml) to test winner annotation.
    write("mod_z/content.xml", `<?xml version="1.0"?>\n<content id="mod_z" name="Mod Z" version="100" enabled="1"/>`);
    write("mod_a/libraries/wares.xml", `<?xml version="1.0"?>\n<wares><ware id="a_ware"/></wares>`);
    write("mod_z/libraries/wares.xml", `<?xml version="1.0"?>\n<wares><ware id="z_ware"/></wares>`);
    // XPath-overlap fixtures: DIFFERENT selector strings that resolve to the SAME
    // base node (must fire patch.xpath_overlap) vs different nodes (must stay info).
    write("mod_a/libraries/baskets.xml", `<?xml version="1.0"?>\n<diff>\n  <remove sel="/baskets/basket[@id='shared']"/>\n</diff>`);
    write("mod_b/libraries/baskets.xml", `<?xml version="1.0"?>\n<diff>\n  <replace sel="//basket[@id='shared']"><basket id="shared" tier="2"/></replace>\n</diff>`);
    write("mod_a/libraries/god.xml", `<?xml version="1.0"?>\n<diff>\n  <remove sel="/god/x[@id='a_node']"/>\n</diff>`);
    write("mod_b/libraries/god.xml", `<?xml version="1.0"?>\n<diff>\n  <replace sel="/god/x[@id='b_node']"><x id="b_node2"/></replace>\n</diff>`);
    write("mod_c/content.xml", `<?xml version="1.0"?>\n<content id="dup_id" name="Mod C" version="100" enabled="1"/>`);
    write("mod_c_dup/content.xml", `<?xml version="1.0"?>\n<content id="dup_id" name="Mod C Clone" version="100" enabled="1"/>`);
    // Both mods also ship t/0001.xml (translations MERGE) and a root ui.xml (per-extension
    // manifest) — neither must be flagged as a collision.
    write("mod_a/t/0001.xml", `<?xml version="1.0"?>\n<language id="44"><page id="1"><t id="1">A</t></page></language>`);
    write("mod_b/t/0001.xml", `<?xml version="1.0"?>\n<language id="44"><page id="2"><t id="1">B</t></page></language>`);
    write("mod_a/ui.xml", `<?xml version="1.0"?>\n<addon><environment type="menus"><file name="ui/a.lua"/></environment></addon>`);
    write("mod_b/ui.xml", `<?xml version="1.0"?>\n<addon><environment type="menus"><file name="ui/b.lua"/></environment></addon>`);
    write("mod_packed/content.xml", `<?xml version="1.0"?>\n<content id="mod_packed" name="Packed Runtime Mod" version="100" enabled="1"/>`);
    writeCatDat("mod_packed", "ext_01.cat", [
      { name: "ui/hotkey/interface.lua", text: `local amount = OnlineGetUserItemAmount("x4-example")\nreturn amount\n` },
      { name: "md/packed.xml", text: `<?xml version="1.0"?><mdscript name="Packed"><cues/></mdscript>` }
    ]);

    // Stub base resolver: the synthetic mods patch these "base game" files.
    const stubBases: Record<string, string> = {
      'libraries/baskets.xml': `<baskets><basket id="shared" tier="1"/><basket id="other"/></baskets>`,
      'libraries/god.xml': `<god><x id="a_node"/><x id="b_node"/></god>`
    };
    const result = runExtensionDoctor(tmp, { resolveBaseContent: rel => stubBases[rel.replace(/\\/g, '/')] ?? null });
    const has = (code: string, pred?: (f: any) => boolean) =>
      result.findings.some((f: any) => f.code === code && (!pred || pred(f)));
    const checks = {
      missingRequiredDep: has("dep.missing_required", f => f.sourceRef?.id === "not_installed_dep" && f.severity === "error"),
      duplicateId: has("ext.duplicate_id"),
      selectorCollision: has("patch.selector_collision", f => f.filePath === "libraries/jobs.xml" && f.severity === "warning"),
      // negative cases: translations merge and ui.xml/content.xml are per-extension manifests,
      // so shared t/ and ui.xml paths must NOT produce collisions.
      tFilesNotFlagged: !result.findings.some((f: any) => f.filePath === "t/0001.xml"),
      uiManifestNotFlagged: !result.findings.some((f: any) => f.filePath === "ui.xml"),
      // folder "mod_c" declares id "dup_id" → folder/id mismatch must fire (as info).
      folderIdMismatch: has("ext.folder_id_mismatch", f => f.sourceRef?.label === "mod_c" && f.severity === "info"),
      // load-order simulation: mod_b depends on mod_z, so mod_z loads before mod_b
      // despite sorting after it alphabetically.
      depAwareLoadOrder: Array.isArray(result.loadOrder)
        && result.loadOrder.indexOf("mod_z") !== -1
        && result.loadOrder.indexOf("mod_z") < result.loadOrder.indexOf("mod_b"),
      // selector collision (mod_a vs mod_b on libraries/jobs.xml): winner = mod_b (loads last).
      selectorWinner: has("patch.selector_collision", f => f.filePath === "libraries/jobs.xml" && f.winner === "mod_b"),
      // full-file override (mod_a vs mod_z on libraries/wares.xml): mod_z loads before
      // mod_b but after mod_a (topo: a, z, b) → winner = mod_z.
      overrideWinner: has("file.override_collision", f => f.filePath === "libraries/wares.xml" && f.winner === "mod_z"),
      // XPath overlap: "/baskets/basket[@id='shared']" (remove) and "//basket[@id='shared']"
      // (replace) are different strings resolving to the same base node → warning.
      xpathOverlap: has("patch.xpath_overlap", f => f.filePath === "libraries/baskets.xml" && f.severity === "warning"),
      // Different selectors hitting DIFFERENT nodes must stay an info shared-target.
      xpathNoFalsePositive: has("patch.shared_target", f => f.filePath === "libraries/god.xml")
        && !result.findings.some((f: any) => f.code === "patch.xpath_overlap" && f.filePath === "libraries/god.xml"),
      packedLuaRestrictedCall: has("lua.restricted_online_call", f =>
        f.filePath === "extensions/mod_packed/ui/hotkey/interface.lua"
        && f.severity === "error"
        && f.packed === true
        && f.archive === "ext_01.cat")
    };
    const pass = checks.missingRequiredDep && checks.duplicateId && checks.selectorCollision
      && checks.tFilesNotFlagged && checks.uiManifestNotFlagged
      && checks.folderIdMismatch && checks.depAwareLoadOrder
      && checks.selectorWinner && checks.overrideWinner
      && checks.xpathOverlap && checks.xpathNoFalsePositive
      && checks.packedLuaRestrictedCall;
    return res.json({ success: true, pass, checks, codes: result.findings.map((f: any) => f.code), result });
  } catch (error) {
    return res.status(500).json({ error: error.message || "extension-doctor-selftest failed" });
  } finally {
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});

// (cold-boot restore verified live: see ROADMAP 8th pass.)
// SQLite cache self-test (migration step 4's oracle): builds a throwaway DB and
// asserts the query layer matches a known in-memory fixture. Reports
// {available:false, reason} cleanly when better-sqlite3 isn't installed.
app.get("/api/agent/db-selftest", (_req, res) => {
  try {
    const result = dbSelfTest();

    // Stage-4 parity: when the live process has an in-memory index AND the live
    // cache DB has rows, their per-kind counts must agree.
    let liveParity: any = null;
    try {
      const db = getStudioDb();
      if (db && objectIndexCache) {
        const dbCounts = dbObjectIndexCounts(db);
        const memCounts: Record<string, number> = {};
        for (const it of objectIndexCache.index.items) memCounts[it.kind] = (memCounts[it.kind] || 0) + 1;
        const kinds = new Set([...Object.keys(dbCounts), ...Object.keys(memCounts)]);
        const mismatches = [...kinds].filter(k => (dbCounts[k] || 0) !== (memCounts[k] || 0));
        liveParity = { match: mismatches.length === 0, mismatches, memory: memCounts, db: dbCounts };
      }
    } catch { /* parity is informational */ }

    return res.json({ success: true, ...result, liveCache: getStudioDb()?.path || null, liveParity });
  } catch (error) {
    return res.status(500).json({ error: error.message || "db-selftest failed" });
  }
});

// Read a single file inside the extensions/ folder by ext-root-relative path (e.g.
// "deadair_scripts/content.xml"). Backs the Extension Doctor finding click-through.
// Read-only and path-traversal guarded.
app.get("/api/agent/extension-file", (req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const extRoot = resolved.x4GamePath ? path.join(resolved.x4GamePath, "extensions") : "";
    if (!extRoot) return res.status(400).json({ error: "X4 game path not configured." });
    const rel = String(req.query.path || "").replace(/\\/g, "/");
    if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
      return res.status(400).json({ error: "Invalid path." });
    }
    const abs = path.join(extRoot, rel);
    if (!isPathWithin(abs, extRoot)) return res.status(400).json({ error: "Path escapes extensions root." });
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, "utf8");
      return res.json({ success: true, path: rel, name: path.basename(rel), content, source: "loose" });
    }

    const parts = rel.split("/").filter(Boolean);
    const folder = parts.shift();
    if (!folder || !parts.length) return res.status(404).json({ error: "File not found." });
    const extDir = path.join(extRoot, folder);
    if (!isPathWithin(extDir, extRoot) || !fs.existsSync(extDir)) return res.status(404).json({ error: "File not found." });
    const entryRel = parts.join("/").toLowerCase();
    for (const archive of findCatDatArchives([extDir], true).filter(a => path.dirname(a.catPath).toLowerCase() === extDir.toLowerCase())) {
      let entries: ReturnType<typeof parseCat> = [];
      try { entries = parseCat(archive.catPath); } catch { continue; }
      const entry = entries.find(e => e.name.toLowerCase() === entryRel);
      if (!entry || entry.size <= 0 || entry.size > 8 * 1024 * 1024) continue;
      const content = readEntryText(archive.datPath, entry);
      return res.json({ success: true, path: rel, name: path.basename(entry.name), content, source: "packed", archive: path.basename(archive.catPath) });
    }
    return res.status(404).json({ error: "File not found." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "extension-file read failed" });
  }
});

// Public read-only audit: build a workspace exercising every node template and
// curated MD branch, generate MD, validate against the real schema, and report
// findings plus the schema truth for each involved element. Used to drive the
// MD generator to zero schema violations.
app.get("/api/agent/md-audit", (req, res) => {
  try {
    // Build one cue with every event/condition under conditions and every action
    // chained under actions so the generator's curated + generic paths all fire.
    const nodes: any[] = [];
    const links: any[] = [];
    const cueId = 'audit_cue';
    nodes.push({ id: cueId, type: 'cue', xmlTag: 'cue', label: 'Audit Cue', x: 0, y: 0, properties: { name: 'Audit_Cue' }, includeInBuild: true });

    let prevAction: string | null = null;
    let actionIndex = 0;
    let condIndex = 0;
    for (const tpl of (NODE_TEMPLATES as any[])) {
      if (tpl.xmlTag === 'cue') continue;
      const id = `n_${tpl.xmlTag}_${actionIndex}_${condIndex}`;
      nodes.push({ ...tpl, id, x: 0, y: 0, properties: { ...tpl.properties }, includeInBuild: true });
      if (tpl.type === 'action') {
        if (prevAction === null) links.push({ id: `l_${id}`, sourceNodeId: cueId, sourcePortId: 'out_act', targetNodeId: id, targetPortId: 'in_act' });
        else links.push({ id: `l_${id}`, sourceNodeId: prevAction, sourcePortId: 'out_next', targetNodeId: id, targetPortId: 'in_act' });
        prevAction = id; actionIndex++;
      } else {
        // events + conditions go under the cue's conditions block
        links.push({ id: `l_${id}`, sourceNodeId: cueId, sourcePortId: 'out_cond', targetNodeId: id, targetPortId: 'in_cond' });
        condIndex++;
      }
    }

    const ws = sanitizeWorkspace({ name: 'MD_Audit', nodes, links });
    const md = generateMDXML(ws);
    const index = getSchemaIndex();
    const findings = validateXmlAgainstSchema(md, index, { filePath: 'md/md_audit.xml', domain: 'mission_director', reportUnknownElements: true, references: getReferenceSets() });

    // Schema truth for every element that appears in a finding.
    const involved = [...new Set(findings.map(f => String(f.sourceRef || '').split('@')[0]).filter(Boolean))];
    const schemaTruth: Record<string, any> = {};
    for (const name of involved) {
      const spec = index.elements.get(name.toLowerCase());
      schemaTruth[name] = spec
        ? { resolved: spec.resolved, attrs: [...spec.attributes.keys()], children: [...spec.children] }
        : { inIndex: false };
    }

    return res.json({
      findingCount: findings.length,
      byCode: findings.reduce((a: any, f) => { a[f.code || '?'] = (a[f.code || '?'] || 0) + 1; return a; }, {}),
      findings: findings.map(f => ({ severity: f.severity, code: f.code, ref: f.sourceRef, line: f.line, message: f.message })),
      schemaTruth,
      md
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'md-audit failed', stack: String(error?.stack || '').slice(0, 400) });
  }
});

// Public read-only self-test for the agent mutation API. Snapshots and restores
// the live workspace/version so it never leaves a side effect.
app.get("/api/agent/api-selftest", (req, res) => {
  const savedWs = activeWorkspace;
  const savedVer = workspaceVersion;
  try {
    const results: any[] = [];
    // 1. dry-run replace: must NOT apply, version unchanged.
    const dry = applyWorkspaceMutation({ ...savedWs, version: '9.9.9' }, { dryRun: true });
    results.push({ test: 'dryRun', pass: dry.status === 200 && dry.body.applied === false && workspaceVersion === savedVer, detail: { applied: dry.body.applied, version: workspaceVersion } });
    // 2. stale write: expectedVersion wrong -> 409.
    const stale = applyWorkspaceMutation({ ...savedWs }, { expectedVersion: savedVer + 999 });
    results.push({ test: 'versionConflict', pass: stale.status === 409 && stale.body.error === 'version_conflict', detail: { status: stale.status } });
    // 3. merge with correct expectedVersion: applies, version bumps.
    const merge = applyWorkspaceMutation({ version: '7.7.7' }, { expectedVersion: savedVer, merge: true });
    results.push({ test: 'mergeApply', pass: merge.status === 200 && merge.body.applied === true && workspaceVersion === savedVer + 1 && activeWorkspace.version === '7.7.7', detail: { applied: merge.body.applied, newVersion: workspaceVersion, mergedVersion: activeWorkspace.version } });
    return res.json({ allPassed: results.every(r => r.pass), results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'api-selftest failed' });
  } finally {
    // Always restore live state.
    activeWorkspace = savedWs;
    workspaceVersion = savedVer;
  }
});

// Public read-only self-test for the deterministic live-feedback log logic.
// Public read-only test for reference + time-format validation, using the exact
// failures observed in-game (invalid macro, bare-number duration).
// Consolidated regression: runs every public self-test and reports one verdict.
app.get("/api/agent/selftest", async (req, res) => {
  const base = `http://127.0.0.1:${PORT}/api/agent`;
  const get = async (p: string) => { try { const r = await fetch(`${base}/${p}`); return await r.json(); } catch (e) { return { __error: String(e?.message || e) }; } };
  try {
    const [md, ref, api, log, rt, patch] = await Promise.all([
      get('md-audit'), get('reference-selftest'), get('api-selftest'), get('log-selftest'), get('round-trip-selftest'), get('patch-audit')
    ]);
    const checks = [
      { name: 'md_generator_zero_findings', pass: md.findingCount === 0, detail: { findingCount: md.findingCount } },
      { name: 'reference_macro_caught', pass: (ref.macroDiagnostics || []).length === 1 },
      { name: 'reference_time_format_caught', pass: (ref.timeFormatDiagnostics || []).length === 1 },
      { name: 'reference_faction_bad_caught', pass: ref.factionBadDetected === true },
      { name: 'reference_faction_good_clean', pass: ref.factionGoodClean === true },
      { name: 'generator_emits_time_units', pass: ref.durationEmittedWithUnit === true },
      { name: 'agent_api_concurrency', pass: api.allPassed === true },
      { name: 'live_feedback_logic', pass: log.allPassed === true },
      { name: 'round_trip_lossless', pass: rt.lossless === true },
      { name: 'patch_diagnostics', pass: Array.isArray(patch.diagnostics) && patch.diagnostics.some((d: any) => d.code === 'patch.target_unresolved') && patch.diagnostics.some((d: any) => d.code === 'patch.selector_root_mismatch') }
    ];
    return res.json({ allPassed: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length, total: checks.length, checks });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'selftest failed' });
  }
});

// Public probe: report the schema-declared type of specific element attributes,
// to confirm whether X4 types are strict (time/int) or permissive (expression).
app.get("/api/agent/type-probe", (req, res) => {
  try {
    const index = getSchemaIndex();
    const probe: Array<[string, string]> = [
      ['show_help', 'duration'], ['set_value', 'exact'], ['wait', 'exact'], ['wait', 'min'],
      ['create_ship', 'macro'], ['show_notification', 'timeout'], ['signal_cue_instantly', 'cue'], ['play_sound', 'sound']
    ];
    const out: any = {};
    for (const [el, at] of probe) {
      const spec = index.elements.get(el);
      const a = spec?.attributes.get(at);
      out[`${el}@${at}`] = a ? { type: a.type || '(none)', enum: a.enumValues ? a.enumValues.slice(0, 6) : undefined, required: a.required } : (spec ? 'attr_not_found' : 'element_not_found');
    }
    // Full type vocabulary across the index (to find reference types like macroname/cuename/warename).
    const typeCounts: Record<string, number> = {};
    for (const [, spec] of index.elements) {
      for (const [, a] of spec.attributes) {
        const t = a.type || '(none)';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    }
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const nameTypes = sortedTypes.filter(([t]) => /name$|ref$/i.test(t));
    // Sample real macros to pick valid template defaults.
    const oi = getObjectIndex();
    const sampleStations = oi.items.filter(i => i.kind === 'station' && /defence|defense/i.test(i.id)).slice(0, 8).map(i => i.id);
    const anyStations = oi.items.filter(i => i.kind === 'station').slice(0, 6).map(i => i.id);
    const sampleShips = oi.items.filter(i => i.kind === 'ship' && i.id.includes('arg')).slice(0, 4).map(i => i.id);
    return res.json({
      note: 'If types are generic (expression/unions), the XSD cannot catch runtime value errors — value-format validation is needed.',
      types: out,
      referenceTypeCandidates: nameTypes,
      sampleDefenceStations: sampleStations,
      anyStations,
      sampleArgonShips: sampleShips
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'type-probe failed' });
  }
});

app.get("/api/agent/reference-selftest", (req, res) => {
  try {
    const badWs = sanitizeWorkspace({
      name: 'Ref_Test',
      nodes: [
        { id: 'c', type: 'cue', xmlTag: 'cue', properties: { name: 'C' }, includeInBuild: true },
        { id: 's1', type: 'action', xmlTag: 'create_ship', properties: { name: '$x', macro: 'ship_xen_i_destroyer_01_macro', faction: 'xenon' }, includeInBuild: true },
        { id: 'h1', type: 'action', xmlTag: 'show_help', properties: { text: 'hi', duration: 8 }, includeInBuild: true }
      ],
      links: [
        { id: 'l1', sourceNodeId: 'c', sourcePortId: 'out_act', targetNodeId: 's1', targetPortId: 'in_act' },
        { id: 'l2', sourceNodeId: 's1', sourcePortId: 'out_next', targetNodeId: 'h1', targetPortId: 'in_act' }
      ]
    });
    const { modId, files } = buildWorkspaceFileManifest(badWs);
    const md = files[`md/${modId}.xml`] || '';
    // Schema-driven validation with real reference sets (macroname type -> macro index).
    const index = getSchemaIndex();
    const references = getReferenceSets();
    const diags = validateXmlAgainstSchema(md, index, { domain: 'mission_director', reportUnknownElements: true, references });
    // Also validate a raw bare-number duration to confirm the time-format net.
    const timeDiags = validateXmlAgainstSchema('<show_help custom="x" duration="8"/>', index, { references });
    // Faction: invalid vs valid literal.
    const factionBad = validateXmlAgainstSchema('<create_ship macro="ship_arg_l_destroyer_01_a_macro"><owner exact="faction.notareal"/></create_ship>', index, { references });
    const factionGood = validateXmlAgainstSchema('<create_ship macro="ship_arg_l_destroyer_01_a_macro"><owner exact="faction.argon"/></create_ship>', index, { references });
    const macroDiagnostics = diags.filter(d => d.code === 'REF_UNKNOWN_MACRO').map(d => ({ code: d.code, severity: d.severity, ref: d.sourceRef, message: d.message.slice(0, 110) }));
    const timeFormatDiagnostics = timeDiags.filter(d => d.code === 'XSD_TIME_FORMAT').map(d => ({ code: d.code, severity: d.severity, message: d.message.slice(0, 110) }));
    const durationEmittedWithUnit = /duration="8s"/.test(md);
    const factionBadDetected = factionBad.some(d => d.code === 'REF_UNKNOWN_FACTION');
    const factionGoodClean = !factionGood.some(d => d.code === 'REF_UNKNOWN_FACTION');
    const checks = [
      { name: 'generator_emits_time_units', pass: durationEmittedWithUnit },
      { name: 'unknown_macro_caught', pass: macroDiagnostics.length > 0 },
      { name: 'bare_time_format_caught', pass: timeFormatDiagnostics.length > 0 },
      { name: 'bad_faction_caught', pass: factionBadDetected },
      { name: 'valid_faction_clean', pass: factionGoodClean }
    ];
    return res.json({
      pass: checks.every(c => c.pass),
      checks,
      durationEmittedWithUnit,
      durationRaw: (md.match(/duration="[^"]*"/) || [])[0] || null,
      macroDiagnostics,
      timeFormatDiagnostics,
      factionBadDetected,
      factionGoodClean,
      mdSnippet: (md.match(/<create_ship[^>]*>/) || [])[0] || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'reference-selftest failed', stack: String(error?.stack||'').slice(0,300) });
  }
});

app.get("/api/agent/log-selftest", (req, res) => {
  try {
    const modId = 'mymod';
    const cleanTail = `[General] 1.23 Loading extension mymod\n[General] 1.40 extension 'mymod' loaded`;
    const errorTail = `[General] 1.23 Loading extension mymod\n[Scripts] 2.5 *** Error in MD script 'mymod' cue 'Start': unexpected value (line 18)`;
    const notSeenTail = `[General] 1.0 Loading extension othermod\n[General] 1.1 done`;

    const clean = computeGameStates({ tail: cleanTail, modIds: [modId], deployed: true, stale: false });
    const errored = computeGameStates({ tail: errorTail, modIds: [modId], deployed: true, stale: false });
    const errIssue = analyzeGameLog(errorTail, [modId]).issues.find(i => i.matchesActiveMod);
    const notSeen = computeGameStates({ tail: notSeenTail, modIds: [modId], deployed: true, stale: false });

    // A2 — deterministic root-cause + markersSeen fixtures.
    const fileOnlyTail = `[FileIO ] 1.2 File I/O: Failed to verify the file signature for file '.\\extensions\\mymod\\md\\mymod.xml' (error: 14)\n[General] 1.3 Loading extension mymod`;
    const markerTail = `[FileIO ] 1.2 signature for file '.\\extensions\\mymod\\ui.xml' (error: 14)\n[=ERROR=] 1.4 [MYMOD] events registered: open, poll`;
    const djfheTail = `[General] 1.0 Loading extension mymod\n[=ERROR=] 1.5 Error: loop or previous error loading module 'djfhe.http.client'`;
    const truncTail = `[General] 1.0 Loading extension mymod\n[=ERROR=] 1.6 Parse error in md/mymod.xml: Couldn't find end of Start Tag cue line 39`;

    const fileOnly = deriveLogDiagnosis(fileOnlyTail, [modId], analyzeGameLog(fileOnlyTail, [modId]).issues.filter(i => i.matchesActiveMod));
    const marker = deriveLogDiagnosis(markerTail, [modId], analyzeGameLog(markerTail, [modId]).issues.filter(i => i.matchesActiveMod));
    const djfhe = deriveLogDiagnosis(djfheTail, [modId], analyzeGameLog(djfheTail, [modId]).issues.filter(i => i.matchesActiveMod));
    const trunc = deriveLogDiagnosis(truncTail, [modId], analyzeGameLog(truncTail, [modId]).issues.filter(i => i.matchesActiveMod));

    const results = [
      { test: 'cleanLoad', pass: clean.seenByX4 && clean.loadedCleanly && !clean.runtimeErrors, detail: clean },
      { test: 'runtimeError', pass: errored.runtimeErrors && !errored.loadedCleanly, detail: errored },
      { test: 'errorSourceRefMapping', pass: errIssue?.sourceRef?.file === 'md/mymod.xml' && errIssue?.sourceRef?.line === 18, detail: errIssue?.sourceRef },
      { test: 'notSeen', pass: !notSeen.seenByX4 && !notSeen.loadedCleanly, detail: notSeen },
      // A2: files-loaded-but-no-markers → code_never_ran hypothesis; markersSeen=false.
      { test: 'diag_code_never_ran', pass: fileOnly.filesLoaded && !fileOnly.markersSeen && fileOnly.hypotheses.some(h => h.code === 'code_never_ran'), detail: fileOnly },
      // A2: a mod-authored marker line flips markersSeen and suppresses code_never_ran.
      { test: 'diag_markers_seen', pass: marker.markersSeen && !marker.hypotheses.some(h => h.code === 'code_never_ran'), detail: marker },
      { test: 'diag_djfhe_require', pass: djfhe.hypotheses.some(h => h.code === 'djfhe_require' && h.confidence === 'high'), detail: djfhe.hypotheses },
      { test: 'diag_truncated', pass: trunc.hypotheses.some(h => h.code === 'truncated_or_malformed'), detail: trunc.hypotheses }
    ];
    return res.json({ allPassed: results.every(r => r.pass), results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'log-selftest failed' });
  }
});

app.get("/api/agent/patch-audit", (req, res) => {
  try {
    const ws = {
      xmlPatches: [
        { id: 'p_ok', targetFile: 'libraries/wares.xml', sel: '/wares', action: 'add', content: '<ware id="x"/>', includeInBuild: true },
        { id: 'p_missing', targetFile: 'libraries/does_not_exist.xml', sel: '/foo', action: 'add', content: '<x/>', includeInBuild: true },
        { id: 'p_rootmismatch', targetFile: 'libraries/wares.xml', sel: '/jobs/job', action: 'add', content: '<job/>', includeInBuild: true }
      ]
    };
    const diagnostics = runPatchDiagnostics(ws);
    const hasResolved = diagnostics.some(d => d.code === 'patch.target_resolved' && d.severity === 'info');
    const hasMissing = diagnostics.some(d => d.code === 'patch.target_unresolved' && d.severity === 'warning');
    const hasRootMismatch = diagnostics.some(d => d.code === 'patch.selector_root_mismatch' && d.severity === 'warning');
    const checks = [
      { name: 'known_target_resolves', pass: hasResolved },
      { name: 'missing_target_warns', pass: hasMissing },
      { name: 'selector_root_mismatch_warns', pass: hasRootMismatch }
    ];
    return res.json({ pass: checks.every(c => c.pass), checks, diagnostics });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'patch-audit failed' });
  }
});

app.post("/api/agent/xsd-lookup", (req, res) => {
  try {
    const index = getSchemaIndex();
    const names: string[] = Array.isArray(req.body?.elements) ? req.body.elements : [];
    const out: Record<string, any> = {};
    for (const n of names) {
      const spec = index.elements.get(String(n).toLowerCase());
      out[n] = spec
        ? {
            inIndex: true,
            resolved: spec.resolved,
            attributes: [...spec.attributes.entries()].map(([k, a]) => ({ name: k, required: a.required, enum: a.enumValues })),
            children: [...spec.children]
          }
        : { inIndex: false };
    }
    return res.json({ loaded: index.loaded, elementCount: index.elementCount, elements: out });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'xsd-lookup failed' });
  }
});

app.get("/api/agent/xsd-debug", (req, res) => {
  try {
    const index = getSchemaIndex();
    // Element lookup mode: ?el=create_ship returns that element's resolved attrs.
    if (typeof req.query.el === 'string' && req.query.el) {
      const spec = index.elements.get(req.query.el.toLowerCase());
      const resolved = resolveXsdConfig();
      let rawHit: string | null = null;
      try {
        const xsd = fs.readFileSync(resolved.mdXsdPath, 'utf8');
        const term = String(req.query.search || req.query.el);
        const i = xsd.toLowerCase().indexOf(String(term).toLowerCase());
        rawHit = i >= 0 ? xsd.slice(Math.max(0, i - 30), i + 300).replace(/\s+/g, ' ') : 'NOT_FOUND_IN_md.xsd';
      } catch (e) { rawHit = 'read_err:' + e.message; }
      return res.json({
        element: req.query.el,
        inIndex: Boolean(spec),
        resolved: spec?.resolved,
        attrNames: spec ? [...spec.attributes.keys()] : [],
        rawHit
      });
    }
    const sample = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="Test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Test_Cue">
      <conditions>
        <event_object_signalled bogusattr="x"/>
      </conditions>
      <actions>
        <set_value name="$x" exact="1" operation="not_a_real_enum_value"/>
        <totally_made_up_action foo="bar"/>
      </actions>
    </cue>
  </cues>
</mdscript>`;
    const diags = validateXmlAgainstSchema(sample, index, { filePath: 'md/test.xml', domain: 'mission_director', reportUnknownElements: true });
    // also surface a couple of known elements + whether they carry enum attrs
    const knownSamples: Record<string, any> = {};
    for (const name of ['set_value', 'event_object_signalled', 'attention', 'cue']) {
      const spec = index.elements.get(name);
      knownSamples[name] = spec ? {
        attrCount: spec.attributes.size,
        enumAttrs: [...spec.attributes.entries()].filter(([, a]) => a.enumValues && a.enumValues.length).map(([k, a]) => `${k}:[${(a.enumValues || []).slice(0, 4).join(',')}]`).slice(0, 5),
        requiredAttrs: [...spec.attributes.entries()].filter(([, a]) => a.required).map(([k]) => k)
      } : 'NOT_IN_INDEX';
    }
    return res.json({ loaded: index.loaded, elementCount: index.elementCount, sourceFiles: index.sourceFiles, knownSamples, sampleDiagnostics: diags });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'xsd-debug failed', stack: String(error?.stack || '').slice(0, 400) });
  }
});

app.get("/api/agent/catdat-debug", (req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const roots = [resolved.x4GamePath || "", resolved.modWorkspacePath || ""].filter(Boolean);

    // Optional ?file=<relpath> — read-only probe of a single base-game file (loose or
    // packed). Used to ground deterministic parsers (e.g. #64 galaxy map) against the
    // real installed universe files instead of assumed shapes. Base-game files only,
    // path-traversal guarded, output capped.
    const fileParam = String(req.query.file || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (fileParam) {
      if (!resolved.x4GamePath) return res.status(400).json({ error: "X4 game path not set." });
      if (fileParam.includes(":") || fileParam.split("/").includes("..")) {
        return res.status(400).json({ error: "Invalid file path." });
      }
      const hit = catDatExtractBaseGameFile(resolved.x4GamePath, fileParam);
      if (!hit) return res.json({ file: fileParam, found: false });
      const MAX = 200_000;
      const text = hit.text || "";
      return res.json({
        file: fileParam, found: true, bytes: text.length,
        truncated: text.length > MAX, text: text.slice(0, MAX),
      });
    }

    const report = catDatDebugScan(roots);
    // Trim to keep payload reasonable: only show archives that have entries or errors.
    return res.json(report);
  } catch (error) {
    return res.status(500).json({ error: error.message || "catdat-debug failed" });
  }
});

function cleanDirectoryExceptMetadata(dirPath: string) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.snapshots' || entry.name === '.studio-mod-id') {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.warn(`Error cleaning directory ${dirPath}:`, err);
  }
}

// Explicit preserve-list: newline-separated top-level names (e.g. "x4_neural_link") in a `.forgekeep`
// file at the deploy root. Lines starting with '#' are comments. Lets a mod co-locate non-Forge runtime.
function readForgeKeep(dirPath: string): Set<string> {
  const keep = new Set<string>();
  try {
    const kp = path.join(dirPath, '.forgekeep');
    if (fs.existsSync(kp)) {
      for (const line of fs.readFileSync(kp, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t && !t.startsWith('#')) keep.add(t.replace(/[\\/]+$/, ''));
      }
    }
  } catch { /* ignore */ }
  return keep;
}

// Safe deploy refresh: delete ONLY the top-level entries the Forge is about to (re)write (`managedTop`),
// so its own content stays current, while PRESERVING any foreign entry the Forge doesn't manage (a
// co-located service like x4_neural_link) and anything listed in .forgekeep. Replaces the old
// wipe-everything behavior that destroyed non-Forge files on every deploy.
function cleanForgeManagedEntries(dirPath: string, managedTop: Set<string>) {
  if (!fs.existsSync(dirPath)) return;
  const keep = readForgeKeep(dirPath);
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const name = entry.name;
      if (name === '.snapshots' || name === '.studio-mod-id' || name === '.forgekeep') continue;
      if (keep.has(name)) continue;            // explicit preserve-list
      if (!managedTop.has(name)) continue;     // foreign top-level entry → preserve (e.g. the bridge)
      const fullPath = path.join(dirPath, name);
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.warn(`Error refreshing Forge-managed entries in ${dirPath}:`, err);
  }
}

function compileWorkspaceToFolder(ws: any, rootPath: string, mode: 'candy' | 'store', writeSnapshots: boolean = false): string {
  ws = activeBuildWorkspace(ws);
  // SINGLE SOURCE OF TRUTH: write exactly what buildWorkspaceFileManifest produces — byte-fidelity
  // MD + content.xml (deps/comments/names/ids preserved) and every passthrough file — instead of a
  // divergent re-derivation. This is the same map the validator/round-trip and agent endpoints use.
  const { modId, files } = buildWorkspaceFileManifest(ws);
  const targetPath = mode === 'store' ? path.join(rootPath, modId) : rootPath;

  if (mode === 'store' && fs.existsSync(targetPath)) {
    // Refresh ONLY the top-level entries the Forge actually writes; PRESERVE everything foreign
    // (e.g. a nested non-Forge service like x4_neural_link) plus anything an explicit .forgekeep lists.
    // Previously this wiped the whole directory, deleting files/dirs the Forge does not manage — which
    // silently destroyed co-located runtime (the Neural Link bridge). See cleanForgeManagedEntries.
    const managedTop = new Set<string>(
      Object.keys(files).map(rel => rel.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0])
    );
    cleanForgeManagedEntries(targetPath, managedTop);
  }
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  // Binary passthrough files are stored base64 in the manifest; decode them on write.
  const binaryRel = new Set<string>(
    (ws.passthroughFiles || [])
      .filter((pf: any) => pf && pf.reason === 'binary' && typeof pf.path === 'string')
      .map((pf: any) => pf.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase())
  );
  // .forgekeep'd top-level dirs are FULLY foreign: the Forge neither cleans nor (re)writes them.
  // This stops the deploy from writing over a co-located live service's open files — e.g. the
  // Neural Link bridge's SQLite -shm/-wal, which previously errored the whole compile (EBUSY /
  // "unknown error, open …shm"). The on-disk copy is left exactly as-is.
  const keepTop = readForgeKeep(targetPath);
  for (const [rel, content] of Object.entries(files)) {
    const top = rel.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0];
    if (keepTop.has(top)) continue;
    const destPath = path.join(targetPath, rel);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (binaryRel.has(rel.toLowerCase())) {
      fs.writeFileSync(destPath, Buffer.from(String(content), 'base64'));
    } else {
      fs.writeFileSync(destPath, String(content), 'utf8');
    }
  }

  // Snapshots & modID identification
  if (writeSnapshots) {
    // 1. Find or create the unique mod ID in the ambiguous file
    const modIdFile = path.join(targetPath, '.studio-mod-id');
    let modUniqueId = '';
    if (fs.existsSync(modIdFile)) {
      try {
        modUniqueId = fs.readFileSync(modIdFile, 'utf8').trim();
      } catch (err) {
        console.warn('Failed to read .studio-mod-id:', err);
      }
    }
    if (!modUniqueId) {
      modUniqueId = `mod_${crypto.randomBytes(8).toString('hex')}`;
      try {
        fs.writeFileSync(modIdFile, modUniqueId, 'utf8');
      } catch (err) {
        console.warn('Failed to write .studio-mod-id:', err);
      }
    }

    // 2. Write the workspace snapshot
    try {
      const snapDir = path.join(targetPath, '.snapshots');
      if (!fs.existsSync(snapDir)) {
        fs.mkdirSync(snapDir, { recursive: true });
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(
        path.join(snapDir, `snapshot_${stamp}.json`),
        JSON.stringify({ savedAt: new Date().toISOString(), name: ws.name, modId: modUniqueId, workspace: ws }, null, 2),
        'utf8'
      );
      const names = fs.readdirSync(snapDir).filter(name => name.startsWith('snapshot_') && name.endsWith('.json'));
      names.sort();
      const MAX_SNAPSHOTS = 30;
      for (let i = 0; i < names.length - MAX_SNAPSHOTS; i++) {
        fs.unlinkSync(path.join(snapDir, names[i]));
      }
    } catch (err) {
      console.warn('Snapshot write failed (non-fatal):', err);
    }
  }

  return targetPath;
}

/**
 * POST /api/agent/deploy
 * Compiles and deploys the workspace directly into the configured X4 Extensions directory.
 */
app.post("/api/agent/deploy", (req, res) => {
  const ws = sanitizeWorkspace(req.body.workspace || activeWorkspace);
  try {
    const resolved = resolveXsdConfig();
    const modWorkspacePath = resolved.modWorkspacePath;
    const x4GamePath = resolved.x4GamePath;
    
    if (!modWorkspacePath && !x4GamePath) {
      return res.status(400).json({
        success: false,
        error: "Neither Mod Workspace Folder nor X4 Game Installation are configured."
      });
    }

    const modId = effectiveModId(ws);
    let stagingPath = '';
    let deployedPath = '';

    // 1. Compile to Mod Workspace Path (Staging) if configured
    if (modWorkspacePath) {
      if (!fs.existsSync(modWorkspacePath)) {
        fs.mkdirSync(modWorkspacePath, { recursive: true });
      }
      stagingPath = compileWorkspaceToFolder(ws, modWorkspacePath, 'store', true);
    }

    // 2. Compile and deploy to Game Extensions Path if configured
    if (x4GamePath) {
      if (fs.existsSync(x4GamePath)) {
        const extensionsPath = path.join(x4GamePath, 'extensions');
        if (!fs.existsSync(extensionsPath)) {
          fs.mkdirSync(extensionsPath, { recursive: true });
        }
        deployedPath = compileWorkspaceToFolder(ws, extensionsPath, 'store', false);
      } else {
        console.warn(`Configured X4 Game Installation path "${x4GamePath}" does not exist.`);
      }
    }

    let message = '';
    if (stagingPath && deployedPath) {
      message = `Successfully compiled to staging workspace AND deployed to game extensions: ${deployedPath}`;
    } else if (stagingPath) {
      message = `Successfully compiled to staging workspace: ${stagingPath}`;
    } else if (deployedPath) {
      message = `Successfully deployed to game extensions: ${deployedPath}`;
    }

    lastDeployInfo = {
      modId,
      workspaceName: ws.name,
      deployedAt: new Date().toISOString(),
      stagingPath: stagingPath || undefined,
      deployedPath: deployedPath || undefined
    };

    return res.json({
      success: true,
      message,
      deployedPath: deployedPath || stagingPath,
      lastDeploy: lastDeployInfo
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to compile/deploy mod."
    });
  }
});

/**
 * POST /api/agent/compile
 * Compiles a submitted workspace JSON body on-the-fly and runs the X4 Forge XML validator check.
 */
// A1 — deploy-verify: ONE orchestration over existing primitives. import-by-path (fresh
// from disk, avoids stale-workspace bugs) → compile gate (0 errors) → deploy (staging +
// extensions) → bytes confirm (deployed content.xml exists + id matches) → extension-doctor
// (auto-FAIL on duplicate-id / folder-id-mismatch). Returns a single pass/fail verdict so the
// agent/UI never skips the doctor. On-demand only (not a hot poll), so full-folder scan is fine.
app.post("/api/agent/deploy-verify", (req, res) => {
  try {
    const resolved = resolveXsdConfig();
    const x4GamePath = resolved.x4GamePath;
    const modWorkspacePath = resolved.modWorkspacePath;
    if (!x4GamePath) return res.status(400).json({ ok: false, stage: 'config', error: 'X4 Game Installation path not configured.' });

    // 1. Resolve workspace: fresh import-by-path if given, else the active workspace.
    let ws: any;
    let modSourceDir = '';
    const reqPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    if (reqPath) {
      const r = resolveModFolder(reqPath);
      if ('error' in r) return res.status(r.status).json({ ok: false, stage: 'import', error: r.error });
      modSourceDir = r.abs;
      ws = importModFolder(r.abs).workspace;
    } else {
      ws = sanitizeWorkspace(activeWorkspace);
    }

    // 1b. Well-formedness gate on the SOURCE .xml files on disk. importModFolder keeps MD as
    // byte-fidelity passthrough text (it doesn't re-run the parser's well-formedness check on
    // every file), so a malformed file (mismatched/unclosed tag — which X4 rejects on load but
    // @xmldom/xmldom silently tolerates) could otherwise sail through deploy-verify. This makes
    // deploy-verify catch the exact class that previously deployed "clean" and then failed in X4.
    if (modSourceDir) {
      const xmlFiles: string[] = [];
      const walk = (dir: string) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { if (!/^(\.|node_modules$)/.test(e.name)) walk(full); }
          else if (/\.xml$/i.test(e.name)) xmlFiles.push(full);
        }
      };
      walk(modSourceDir);
      const malformed: any[] = [];
      for (const f of xmlFiles) {
        let txt = '';
        try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
        const wf = checkXmlWellformed(txt);
        if (!wf.ok) {
          malformed.push({ file: path.relative(modSourceDir, f).replace(/\\/g, '/'), errors: wf.errors.slice(0, 3) });
        }
      }
      if (malformed.length > 0) {
        return res.json({ ok: false, stage: 'wellformed', modId: ws?.name || reqPath, malformed });
      }
    }

    // 2. Compile gate — reuse the exact diagnostics the /compile route runs, but gate on the
    // EMITTED files, not the graph. A byte-fidelity import keeps MD as passthrough text (empty
    // graph), so runModDoctor's "no cue nodes" (package.readiness) false-fires even though the
    // deployed file has cues. Exclude that one code when the emitted MD actually contains cues.
    const { modId, files } = buildWorkspaceFileManifest(ws);
    const emittedMd = Object.entries(files).filter(([k]) => /^md\/.*\.xml$/i.test(k)).map(([, v]) => String(v)).join('\n');
    const hasCuesInEmitted = /<cue\b|<library\b/i.test(emittedMd);
    const diagnostics = [...runModDoctor(ws, files, modId), ...runSchemaValidation(files, modId), ...runPatchDiagnostics(ws)];
    const compileErrors = diagnostics.filter((d: any) => d.severity === 'error' && !(d.code === 'package.readiness' && hasCuesInEmitted));
    if (compileErrors.length > 0) {
      return res.json({ ok: false, stage: 'compile', modId, compileErrors: compileErrors.slice(0, 10) });
    }

    // 3. Deploy — staging (writeSnapshots) + game extensions (clean), same as /deploy.
    let stagingPath = '';
    if (modWorkspacePath) {
      if (!fs.existsSync(modWorkspacePath)) fs.mkdirSync(modWorkspacePath, { recursive: true });
      stagingPath = compileWorkspaceToFolder(ws, modWorkspacePath, 'store', true);
    }
    const extensionsPath = path.join(x4GamePath, 'extensions');
    if (!fs.existsSync(extensionsPath)) fs.mkdirSync(extensionsPath, { recursive: true });
    const deployedPath = compileWorkspaceToFolder(ws, extensionsPath, 'store', false);

    // 4. Bytes confirm — deployed content.xml exists, non-empty, id matches modId.
    const deployedContent = path.join(deployedPath, 'content.xml');
    const deployedBytes = fs.existsSync(deployedContent) ? fs.statSync(deployedContent).size : 0;
    const deployedId = deployedBytes ? (fs.readFileSync(deployedContent, 'utf8').match(/<content\b[^>]*\bid\s*=\s*"([^"]+)"/i)?.[1] || '') : '';
    const bytesConfirmed = deployedBytes > 0 && deployedId.toLowerCase() === modId.toLowerCase();

    // 5. Extension-doctor — filter to this mod; FAIL on duplicate-id / folder-id-mismatch / any error.
    const doctor = runExtensionDoctor(extensionsPath);
    const modFindings = (doctor.findings || []).filter((f: any) => JSON.stringify(f).toLowerCase().includes(modId.toLowerCase()));
    const blocking = modFindings.filter((f: any) => f.severity === 'error' || f.code === 'ext.duplicate_id' || f.code === 'ext.folder_id_mismatch');

    const ok = bytesConfirmed && blocking.length === 0;
    lastDeployInfo = { modId, workspaceName: ws.name, deployedAt: new Date().toISOString(), stagingPath: stagingPath || undefined, deployedPath: deployedPath || undefined };
    return res.json({
      ok, stage: 'done', modId, deployedPath, stagingPath, bytesConfirmed, deployedBytes,
      compileErrors: [],
      doctor: {
        scanned: doctor.findings?.length || 0,
        modFindings: modFindings.map((f: any) => ({ code: f.code, severity: f.severity })),
        blocking: blocking.map((f: any) => ({ code: f.code, severity: f.severity })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, stage: 'exception', error: error?.message || 'deploy-verify failed' });
  }
});

app.post("/api/agent/compile", (req, res) => {
  const ws = sanitizeWorkspace(req.body.workspace || activeWorkspace);
  try {
    const { modId, files } = buildWorkspaceFileManifest(ws);
    const mdPath = `md/${modId}.xml`;
    const uiIndexPath = `ui.xml`;
    const uiLuaPath = `ui/${modId}.lua`;
    const diagnostics = [...runModDoctor(ws, files, modId), ...runSchemaValidation(files, modId), ...runPatchDiagnostics(ws)];

    return res.json({
      success: true,
      modId,
      file_count: Object.keys(files).length,
      files: {
        ...files,
        mission_director_xml: files[mdPath],
        ui_index_xml: files[uiIndexPath] || "",
        ui_lua: files[uiLuaPath] || ""
      },
      legacy_files: {
        mission_director_xml: files[mdPath],
        ui_index_xml: files[uiIndexPath] || ""
      },
      diagnostics
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to compile workspace schema to XML."
    });
  }
});

/**
 * POST /api/agent/package
 * Agent-friendly alias for compile that returns the complete package file manifest.
 */
app.post("/api/agent/package", (req, res) => {
  const ws = sanitizeWorkspace(req.body.workspace || activeWorkspace);
  try {
    const { modId, files } = buildWorkspaceFileManifest(ws);
    const diagnostics = [...runModDoctor(ws, files, modId), ...runSchemaValidation(files, modId), ...runPatchDiagnostics(ws)];

    return res.json({
      success: true,
      modId,
      file_count: Object.keys(files).length,
      files,
      diagnostics
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to package workspace schema to file manifest."
    });
  }
});

function populateNodeMetadata(nodes: any[]): any[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map(node => {
    // Attempt to match by xmlTag
    let template = NODE_TEMPLATES.find(t => t.xmlTag === node.xmlTag);
    if (!template) {
      template = schemaTemplatesByTag.get(node.xmlTag);
    }
    // Fallback search by type
    if (!template) {
      template = NODE_TEMPLATES.find(t => t.type === node.type);
    }
    // Deep fallback to first template
    if (!template) {
      template = NODE_TEMPLATES[0];
    }
    
    return {
      id: node.id || `node_${Math.random().toString(36).substring(2, 9)}`,
      type: node.type || template.type,
      label: node.label || template.label,
      xmlTag: node.xmlTag || template.xmlTag,
      x: typeof node.x === 'number' ? node.x : Math.floor(Math.random() * 500) + 100,
      y: typeof node.y === 'number' ? node.y : Math.floor(Math.random() * 400) + 100,
      properties: { ...template.properties, ...node.properties },
      propertiesSchema: template.propertiesSchema,
      inputs: template.inputs,
      outputs: template.outputs,
      comment: node.comment || ""
    };
  });
}

/**
 * POST /api/agent/generate
 * Prompts the built-in Gemini language model to map a natural language instruction directly
 * into a highly complex, logical ModWorkspace structured JSON value.
 */
app.post("/api/agent/generate", async (req, res) => {
  const { prompt, currentWorkspace } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing 'prompt' body parameter." });
  }
  const baseWorkspace = sanitizeWorkspace(currentWorkspace || activeWorkspace);

  try {
    console.log(`[AI-STUDIO] Starting Phased Cognitive Prompt Interpretation Workflow...`);
    
    // --- PHASE 1: CORE NODE BLUEPRINT INTERPRETER ---
    console.log(`[AI-STUDIO] [Phase 1/4] Interrogating Intent & Node Visual Setup...`);
    const phase1System = `You are Phase 1 of a visual workspace translator. Design or edit ONLY the workspace metadata (name, version, author, description) and the raw "nodes" array based on the user's raw prompt.
Do not worry about linkages / links or uiWidgets. 
Focus on allocating:
1. Cue nodes (type="cue", xmlTag="cue") representing mission cues.
2. Event/Condition nodes (type="event" or type="condition") representing triggers/checks. Available xmlTags: "event_cue_signalled", "event_object_destroyed", "event_object_changed_sector", "check_value", "custom_event", "custom_condition".
3. Action nodes (type="action") representing actions. Available xmlTags: "create_ship", "reward_player", "play_sound", "show_help", "create_station", "custom_xml".

Ensure each node has a unique 'id' (e.g., 'cue_0', 'event_0', 'action_0', etc.) and appropriate 'properties' matching their template.
Position nodes clearly: Cues on the left, conditions to their right, and action chains horizontally to the right.`;

    const phase1Schema = {
      type: Type.OBJECT,
      required: ["name", "version", "author", "description", "nodes"],
      properties: {
        name: { type: Type.STRING, description: "Alphanumeric mod name with underscores, e.g. Bounty_Killer_Mod" },
        version: { type: Type.STRING },
        author: { type: Type.STRING },
        description: { type: Type.STRING },
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "label", "xmlTag", "x", "y", "properties"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "cue, event, condition, or action" },
              label: { type: Type.STRING },
              xmlTag: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              properties: {
                type: Type.OBJECT,
                description: "Properties for the node. E.g. for cue: {name, instantiate, namespace, state}. For event/condition/action: relevant keys according to their templates."
              },
              comment: { type: Type.STRING }
            }
          }
        }
      }
    };

    let phase1Prompt = `Prompt: "${prompt}"`;
    if (baseWorkspace) {
      const promptNodes = (baseWorkspace.nodes || []).map((node: any) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        xmlTag: node.xmlTag,
        x: node.x,
        y: node.y,
        properties: node.properties
      }));
      phase1Prompt = `You are modifying an existing ModWorkspace layout.
[Current Workspace Structure]:
- Name: "${baseWorkspace.name}"
- Version: "${baseWorkspace.version || "1.0.0"}"
- Author: "${baseWorkspace.author || ""}"
- Description: "${baseWorkspace.description || ""}"
- Current Nodes: ${JSON.stringify(promptNodes)}
- Non-MD domains to preserve unless the user explicitly asks to change them: ${JSON.stringify(summarizeWorkspaceDomains(baseWorkspace))}

Modify these nodes or add new ones to satisfy this prompt:
"${prompt}"

Maintain as many existing nodes as possible unless they require replacement.`;
    }

    const phase1RawResult = await callMultiProviderAI(req, phase1System, phase1Prompt, "json", phase1Schema);
    const phase1Result = JSON.parse(phase1RawResult.trim());
    
    // Auto-populate port signatures and property schemas from source dictionary to ensure 100% compliance
    const populatedNodes = populateNodeMetadata(phase1Result.nodes);

    // --- PHASE 2: RELATIONAL WIRE LOGIC LINKEAGES ---
    console.log(`[AI-STUDIO] [Phase 2/4] Constructing Relational Wire Linkages...`);
    const phase2System = `You are Phase 2 of a visual workspace translator. Given the populated list of visual nodes (cues, events, conditions, actions), define how they connect together.
Return ONLY the links connection list matching the specified JSON schema.

CRITICAL LINKING RULES:
1. Connect conditions/events to their cue: sourceNodeId is the cue, sourcePortId="out_cond", targetNodeId is the event/condition, targetPortId="in_cond".
2. Connect the first action of a cue: sourceNodeId is the cue, sourcePortId="out_act", targetNodeId is the first action, targetPortId="in_act".
3. Chain subsequent actions together: sourceNodeId is the previous action, sourcePortId="out_next", targetNodeId is the next action, targetPortId="in_act".
4. Connect child cues to parent cues for nested sub-cues: sourceNodeId is parent, sourcePortId="out_sub", targetNodeId is the child cue, targetPortId="in_flow".`;

    const phase2Schema = {
      type: Type.OBJECT,
      required: ["links"],
      properties: {
        links: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
            properties: {
              id: { type: Type.STRING },
              sourceNodeId: { type: Type.STRING, description: "ID of the source node" },
              sourcePortId: { type: Type.STRING, description: "out_cond, out_act, out_next, or out_sub" },
              targetNodeId: { type: Type.STRING, description: "ID of the target node" },
              targetPortId: { type: Type.STRING, description: "in_cond, in_act, or in_flow" }
            }
          }
        }
      }
    };

    const phase2Prompt = `Construct logic link arrays for this workspace layout.
[Populated Nodes Layout]:
${JSON.stringify(populatedNodes.map(n => ({ id: n.id, label: n.label, type: n.type, xmlTag: n.xmlTag, inputs: n.inputs, outputs: n.outputs })))}

[User Prompt Requirement Context]:
"${prompt}"

Please connect the nodes logically. For example, connect a Cue node's outputs ('out_cond' / 'out_act') to its associated Event or Action node inputs ('in_cond' / 'in_act').`;

    const phase2RawResult = await callMultiProviderAI(req, phase2System, phase2Prompt, "json", phase2Schema);
    const phase2Result = JSON.parse(phase2RawResult.trim());

    // --- PHASE 3: HUD USER CONTROL INTERFACES ---
    console.log(`[AI-STUDIO] [Phase 3/4] Designing Graphic Interface Control overlays...`);
    const phase3System = `You are Phase 3 of a visual workspace translator. Design or edit active web graphic HUD dashboard widgets and custom UI themes that fit the mod behavior.
Ensure that smaller UI elements (progressbar, buttons, checkboxes, input text) are styled and positioned visually inside container "window" elements (w, h heights).
Return ONLY the uiWidgets and uiTheme block fit.`;

    const phase3Schema = {
      type: Type.OBJECT,
      required: ["uiWidgets", "uiTheme"],
      properties: {
        uiWidgets: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "x", "y", "w", "h", "label", "properties"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "window, table, button, progressbar, check, text, dropdown, header, input, chat" },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              w: { type: Type.NUMBER },
              h: { type: Type.NUMBER },
              label: { type: Type.STRING },
              properties: { type: Type.OBJECT }
            }
          }
        },
        uiTheme: {
          type: Type.OBJECT,
          required: ["backgroundColor", "borderColor", "accentColor", "opacity", "showIcons"],
          properties: {
            backgroundColor: { type: Type.STRING },
            borderColor: { type: Type.STRING },
            accentColor: { type: Type.STRING },
            opacity: { type: Type.NUMBER },
            showIcons: { type: Type.BOOLEAN }
          }
        }
      }
    };

    const currentUIWidgets = baseWorkspace.uiWidgets || [];
    const currentUITheme = baseWorkspace.uiTheme || {
      backgroundColor: "#0d1117",
      borderColor: "#df9825",
      accentColor: "#f39c12",
      opacity: 0.85,
      showIcons: true
    };

    const phase3Prompt = `Add or adjust visual HUD display control widgets.
[User Request]:
"${prompt}"

[Nodes Created]:
${JSON.stringify(populatedNodes.map(n => ({ id: n.id, label: n.label, xmlTag: n.xmlTag })))}

[Current HUD widgets]:
${JSON.stringify(currentUIWidgets)}

Create, update, or reposition HUD window containers and nested controller elements to fit the mod. Return the compiled array.`;

    const phase3RawResult = await callMultiProviderAI(req, phase3System, phase3Prompt, "json", phase3Schema);
    const phase3Result = JSON.parse(phase3RawResult.trim());

    // --- PACK COMBINED EXPERIMENT STAGE ---
    let combinedWorkspace: ModWorkspace = {
      ...baseWorkspace,
      id: `workspace_${Date.now()}`,
      name: phase1Result.name || (baseWorkspace.name || "My_Custom_Mod"),
      version: phase1Result.version || (baseWorkspace.version || "1.0.0"),
      author: phase1Result.author || (baseWorkspace.author || "Player"),
      description: phase1Result.description || (baseWorkspace.description || ""),
      nodes: populatedNodes,
      links: phase2Result.links || [],
      uiWidgets: phase3Result.uiWidgets || [],
      uiTheme: phase3Result.uiTheme || currentUITheme
    };

    // --- PHASE 4: EXPERT SCHEMA SELF-REPAIR SANITY VET ---
    console.log(`[AI-STUDIO] [Phase 4/4] Executing Egosoft Schema Verification & Healing...`);
    const currentCode = generateMDXML(combinedWorkspace);
    const validationDiagnostics = validateModWorkspace(combinedWorkspace, currentCode);
    let selfHealError: string | null = null;

    if (validationDiagnostics.length > 0) {
      console.log(`[AI-STUDIO] Validation reported ${validationDiagnostics.length} warnings. Running auto-remedy fix...`);
      
      const phase4System = `You are Phase 4 (Self-Healing Compiler) for the X4 Foundations visual editor.
The generated workspace layout currently fails Egosoft's visual schema checks with specific warnings/errors.
Study the diagnostics report, apply corrections to the nodes, properties, and links, and return the absolute complete ModWorkspace JSON.

CRITICAL COMPLIANCE RULES:
1. Visual Event, Condition, and Action nodes must be linked correctly to their respective parent Cue node.
2. Conditions/events connect via Cue's out_cond to Condition's in_cond.
3. Actions connect sequentially starting from Cue's out_act to first Action's in_act, then Action's out_next to next Action's in_act.
4. Child cues connect via parent Cue's out_sub to child Cue's in_flow.`;

      const phase4Schema = {
        type: Type.OBJECT,
        required: ["name", "version", "author", "description", "nodes", "links", "uiWidgets", "uiTheme"],
        properties: {
          name: { type: Type.STRING },
          version: { type: Type.STRING },
          author: { type: Type.STRING },
          description: { type: Type.STRING },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "type", "label", "xmlTag", "x", "y", "properties"],
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                label: { type: Type.STRING },
                xmlTag: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                properties: {
                  type: Type.OBJECT,
                  description: "Properties for the node. E.g. for cue: {name, instantiate, namespace, state}. For event/condition/action: relevant keys according to their templates."
                },
                comment: { type: Type.STRING }
              }
            }
          },
          links: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
              properties: {
                id: { type: Type.STRING },
                sourceNodeId: { type: Type.STRING },
                sourcePortId: { type: Type.STRING },
                targetNodeId: { type: Type.STRING },
                targetPortId: { type: Type.STRING }
              }
            }
          },
          uiWidgets: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          uiTheme: { type: Type.OBJECT }
        }
      };

      const phase4Prompt = `Correct the layout parameters of this ModWorkspace structure.
[Damaged Workspace Layout]:
${JSON.stringify({
  name: combinedWorkspace.name,
  description: combinedWorkspace.description,
  nodes: combinedWorkspace.nodes.map(n => ({ id: n.id, xmlTag: n.xmlTag, properties: n.properties })),
  links: combinedWorkspace.links
})}

[Egosoft Validation Diagnostics Code Reports]:
${JSON.stringify(validationDiagnostics, null, 2)}

Please edit the links or properties to resolve all errors in the diagnostic suite. Output the corrected variables.`;

      try {
        const phase4Raw = await callMultiProviderAI(req, phase4System, phase4Prompt, "json", phase4Schema);
        const phase4Result = JSON.parse(phase4Raw.trim());
        
        // Re-populate system metadata to guarantee property schemas remain undamaged
        const fixedNodes = populateNodeMetadata(phase4Result.nodes);
        
        combinedWorkspace = {
          ...combinedWorkspace,
          name: phase4Result.name || combinedWorkspace.name,
          nodes: fixedNodes,
          links: phase4Result.links || combinedWorkspace.links,
          uiWidgets: phase4Result.uiWidgets || combinedWorkspace.uiWidgets,
          uiTheme: phase4Result.uiTheme || combinedWorkspace.uiTheme
        };
        console.log(`[AI-STUDIO] Phased Auto-Remedy cycle completed successfully.`);
      } catch (repairErr) {
        selfHealError = repairErr?.message || String(repairErr);
        console.warn(`[AI-STUDIO] Self-heal attempt failed (falling back to base layout):`, repairErr);
      }
    } else {
      console.log(`[AI-STUDIO] Verification complete: pristine schema validated on first run.`);
    }

    // Approval-flow fix (Codex finding): the in-app AI guide sends apply:false
    // so the generated blueprint is STAGED — returned to the client for its
    // Confirm & Apply card — without touching the shared workspace. Previously
    // generate committed here unconditionally, so the canvas sync adopted the
    // change before the user approved (the approval step was not the first
    // mutation point). External agents keep the documented apply-by-default.
    const applyGenerated = req.body.apply !== false;
    if (applyGenerated) {
      activeWorkspace = combinedWorkspace;
      workspaceVersion++;
    }

    console.log(`[AI-STUDIO] Phased interpretation complete. Delivered blueprint named: ${combinedWorkspace.name}`);

    const finalCode = generateMDXML(combinedWorkspace);
    const finalDiagnostics = validateModWorkspace(combinedWorkspace, finalCode);
    const finalErrors = finalDiagnostics.filter(d => d.severity === 'error').length;
    const finalWarnings = finalDiagnostics.filter(d => d.severity === 'warning').length;

    // Honest reporting: the message must reflect the real post-validation state,
    // including a self-heal attempt that threw (previously swallowed silently).
    let resultMessage = `AI Agent generated${applyGenerated ? " and applied" : " (staged for approval — NOT applied)"} "${combinedWorkspace.name}" (${combinedWorkspace.nodes.length} nodes) in 4 phases.`;
    if (finalDiagnostics.length === 0) {
      resultMessage += ` Validation clean: 0 errors / 0 warnings.`;
    } else {
      resultMessage += ` Validation found ${finalErrors} error(s) / ${finalWarnings} warning(s) remaining.`;
    }
    if (selfHealError) {
      resultMessage += ` Self-heal phase failed (${selfHealError}); the un-healed layout was applied.`;
    }

    // A4.9b — extract checkable requirements from the ORIGINAL prompt (separate
    // from generation) so the review can verify INTENT, not just legality. The
    // client runs these deterministically via checkIntent against the output.
    type RawIntentRequirement = {
      id?: unknown;
      label?: unknown;
      kind?: unknown;
      xmlTag?: unknown;
      prop?: unknown;
    };
    let intentRequirements: IntentRequirement[] = [];
    try {
      const reqSystem = `Convert an X4 mod request into a SHORT list (3-6) of checkable requirements. For each pick a verification "kind":
- "triggerWired": the cue must be triggered by an event of a given xmlTag (e.g. event_game_started, event_object_changed_sector, event_object_destroyed).
- "actionInChain": the cue must run an action of a given xmlTag (e.g. show_help, reward_player, create_ship, play_sound, create_station).
- "nodePresent": a node of a given xmlTag must exist.
- "nodePropPositive": a node of xmlTag must have a positive numeric property "prop" (e.g. reward_player money).
- "manual": subjective/unverifiable (tone, "fun", balance).
Use real X4 Mission Director xmlTags. Each requirement: {id, label (plain English), kind, xmlTag (omit for manual), prop (only nodePropPositive)}.`;
      const reqSchema = {
        type: Type.OBJECT,
        required: ["requirements"],
        properties: {
          requirements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "label", "kind"],
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                kind: { type: Type.STRING, description: "triggerWired|actionInChain|nodePresent|nodePropPositive|manual" },
                xmlTag: { type: Type.STRING },
                prop: { type: Type.STRING }
              }
            }
          }
        }
      };
      const reqRaw = await callMultiProviderAI(req, reqSystem, `User request: "${prompt}"`, "json", reqSchema);
      const reqParsed = JSON.parse(reqRaw.trim());
      const reqObj = reqParsed && typeof reqParsed === "object" ? reqParsed as { requirements?: unknown } : {};
      const ALLOWED = new Set<IntentCheckSpec["kind"]>(["nodePresent", "nodePropPositive", "triggerWired", "actionInChain", "manual"]);
      intentRequirements = (Array.isArray(reqObj.requirements) ? reqObj.requirements : []).slice(0, 8).map((raw, i: number) => {
        const r = raw && typeof raw === "object" ? raw as RawIntentRequirement : {};
        const kind = ALLOWED.has(r.kind as IntentCheckSpec["kind"]) ? r.kind as IntentCheckSpec["kind"] : "manual";
        const xmlTag = String(r.xmlTag || "").trim();
        const check: IntentCheckSpec = kind === "manual" || !xmlTag
          ? { kind: "manual" }
          : kind === "nodePropPositive"
            ? { kind, xmlTag, prop: String(r.prop || "").trim() }
            : { kind, xmlTag };
        return { id: String(r.id || `req_${i}`), label: String(r.label || "Requirement"), check };
      });
    } catch (e) {
      console.warn("[AI-STUDIO] requirement extraction failed (non-fatal):", e);
    }

    return res.json({
      success: true,
      message: resultMessage,
      applied: applyGenerated,
      version: workspaceVersion,
      workspace: combinedWorkspace,
      diagnostics: finalDiagnostics,
      requirements: intentRequirements,
      selfHealFailed: (validationDiagnostics.length > 0 && finalDiagnostics.length > 0) || !!selfHealError,
      selfHealError
    });

  } catch (error) {
    console.error("AI Agent layout generation error: ", error);
    return res.status(500).json({
      error: error.message || "Failed to trigger automated workspace planner in phased execution mode."
    });
  }
});


// -----------------------------------------------------
// 3. SECURE GITHUB API SYSTEM PROXY
// -----------------------------------------------------

app.post("/api/github/load", async (req, res) => {
  const { pat, owner, repo, path: filePath, branch } = req.body;
  
  if (!owner || !repo || !filePath) {
    return res.status(400).json({ error: "Missing repo parameters (owner, repo, or path)." });
  }

  // Token is optional if repo is public, but helpful to configure
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "x4-md-studio-proxy"
  };

  if (pat) {
    headers["Authorization"] = `token ${pat}`;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch || "main"}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `GitHub returned error: ${response.statusText}`,
        details: errorText
      });
    }
    
    const data: any = await response.json();
    if (data.type !== "file") {
      return res.status(400).json({ error: "Selected path is not a single file." });
    }

    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return res.json({
      success: true,
      sha: data.sha,
      content: decoded,
      fileName: data.name
    });
  } catch (error) {
    console.error("GitHub file load error: ", error);
    return res.status(500).json({ error: error.message || "Failed to load file from GitHub." });
  }
});

app.post("/api/github/push", async (req, res) => {
  const { pat, owner, repo, branch, commitMessage, files } = req.body;

  if (!pat) {
    return res.status(400).json({ error: "GitHub Personal Access Token (PAT) is required." });
  }
  if (!owner || !repo) {
    return res.status(400).json({ error: "Owner and repository name are required." });
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files provided to push." });
  }

  const selectedBranch = branch || "main";
  const msg = commitMessage || "Update mod files from X4 Forge";
  const results: any[] = [];

  try {
    // For each file, we'll sequentially commit it
    for (const file of files) {
      const { path: filePath, content } = file;
      if (!filePath || content === undefined) continue;

      const headers: Record<string, string> = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${pat}`,
        "User-Agent": "x4-md-studio-proxy"
      };

      // 1. Get the pre-existing SHA if it exists
      let currentSha: string | undefined;
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${selectedBranch}`;
      
      try {
        const getRes = await fetch(getUrl, { headers });
        if (getRes.status === 200) {
          const getData: any = await getRes.json();
          currentSha = getData.sha;
        }
      } catch {
        // Log error but ignore (might be new file)
        console.log(`Pre-fetch SHA failed for ${filePath}, assuming new file.`);
      }

      // 2. Put file contents back
      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
      const base64Content = Buffer.from(content).toString("base64");
      
      const bodyPayload: any = {
        message: msg,
        content: base64Content,
        branch: selectedBranch
      };
      
      if (currentSha) {
        bodyPayload.sha = currentSha;
      }

      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!putRes.ok) {
        const errDetails = await putRes.text();
        throw new Error(`Failed to push file: ${filePath}. Status: ${putRes.status}, Response: ${errDetails}`);
      }

      const putData: any = await putRes.json();
      results.push({
        path: filePath,
        sha: putData.content.sha,
        success: true
      });
    }

    return res.json({
      success: true,
      message: `Successfully pushed ${results.length} files to ${owner}/${repo} on branch ${selectedBranch}.`,
      results
    });

  } catch (error) {
    console.error("GitHub push error: ", error);
    return res.status(500).json({ error: error.message || "Failed to commit files to GitHub." });
  }
});


/**
 * POST /api/github/create
 * Creates a new GitHub repository under the authenticated user (from the PAT),
 * so a mod-in-progress can be published as a fresh repo in one click.
 */
app.post("/api/github/create", async (req, res) => {
  const { pat, name, description, private: isPrivate } = req.body;

  if (!pat) {
    return res.status(400).json({ error: "GitHub Personal Access Token (PAT) is required." });
  }
  if (!name) {
    return res.status(400).json({ error: "Repository name is required." });
  }

  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${pat}`,
        "User-Agent": "x4-md-studio-proxy",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        description: description || "X4 Foundations mod created with X4 Forge",
        private: !!isPrivate,
        auto_init: false
      })
    });

    const data: any = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.message || `GitHub returned error code ${response.status}`,
        details: data?.errors
      });
    }

    return res.json({
      success: true,
      owner: data.owner?.login,
      repo: data.name,
      full_name: data.full_name,
      html_url: data.html_url,
      default_branch: data.default_branch || "main"
    });
  } catch (error) {
    console.error("GitHub create-repo error: ", error);
    return res.status(500).json({ error: error.message || "Failed to create GitHub repository." });
  }
});


/**
 * POST /api/github/device/start
 * Begins the GitHub OAuth Device Flow: requests a device + user code so the user can
 * authorize in their browser (no PAT copy-paste, no client secret needed).
 */
app.post("/api/github/device/start", async (req, res) => {
  const clientId = String(req.body?.client_id || process.env.GITHUB_CLIENT_ID || "").trim();
  const scope = String(req.body?.scope || "repo").trim();
  if (!clientId) {
    return res.status(400).json({ error: "Missing GitHub OAuth Client ID. Register an OAuth App (with Device Flow enabled) and provide its Client ID." });
  }
  try {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "x4-md-studio" },
      body: JSON.stringify({ client_id: clientId, scope })
    });
    const data: any = await response.json();
    if (!response.ok || data.error) {
      return res.status(400).json({ error: data.error_description || data.error || "Failed to start GitHub device authorization." });
    }
    // data: device_code, user_code, verification_uri, expires_in, interval
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Device authorization request failed." });
  }
});

/**
 * POST /api/github/device/poll
 * Polls GitHub for the device-flow access token. Returns { pending: true } until the
 * user approves, then { access_token, login } once authorized.
 */
app.post("/api/github/device/poll", async (req, res) => {
  const clientId = String(req.body?.client_id || process.env.GITHUB_CLIENT_ID || "").trim();
  const deviceCode = String(req.body?.device_code || "").trim();
  if (!clientId || !deviceCode) {
    return res.status(400).json({ error: "Missing client_id or device_code." });
  }
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "x4-md-studio" },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const data: any = await response.json();

    if (data.access_token) {
      // Fetch the authenticated user's login so the client can auto-fill the repo owner.
      let login: string | undefined;
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `token ${data.access_token}`,
            "User-Agent": "x4-md-studio"
          }
        });
        const userData: any = await userRes.json();
        login = userData?.login;
      } catch {
        // Non-fatal; owner can be entered manually.
      }
      return res.json({ access_token: data.access_token, token_type: data.token_type, scope: data.scope, login });
    }

    // Still waiting / throttled / expired — surface the GitHub error code to the poller.
    return res.json({ pending: true, error: data.error, interval: data.interval });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Device token poll failed." });
  }
});


/**
 * POST /api/github/commits
 * Returns the real commit history for the connected repo/branch so the Graph Log
 * reflects the actual mod repository instead of seeded placeholder data.
 */
app.post("/api/github/commits", async (req, res) => {
  const { pat, owner, repo, branch } = req.body;
  if (!pat || !owner || !repo) {
    return res.status(400).json({ error: "Missing pat, owner, or repo." });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch || "main")}&per_page=50`;
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${pat}`,
        "User-Agent": "x4-md-studio-proxy"
      }
    });
    const data: any = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || `GitHub returned ${response.status}` });
    }
    const commits = (Array.isArray(data) ? data : []).map((c: any) => ({
      sha: (c.sha || "").substring(0, 7),
      message: (c.commit?.message || "").split("\n")[0],
      body: c.commit?.message || "",
      author: c.commit?.author?.name || c.author?.login || "unknown",
      email: c.commit?.author?.email || "",
      date: c.commit?.author?.date || "",
      html_url: c.html_url
    }));
    return res.json({ commits });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to fetch repository commits." });
  }
});


// Configure Vite middleware or static serving
async function setupDevOrProd() {
  // Split-dev mode: run as an API-only server. The web UI + HMR are served by a
  // standalone Vite process (see vite.config.ts), which proxies /api here. A
  // backend restart (tsx watch) then no longer tears down the browser page.
  if (process.env.API_ONLY === "true") {
    app.get("/", (_req, res) => {
      res
        .status(200)
        .type("text/plain")
        .end(
          "X4 Forge API server (API_ONLY). The web UI is served by Vite — open http://localhost:3000",
        );
    });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.get("/", async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
        const html = await vite.transformIndexHtml(req.originalUrl, injectStudioToken(template));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const html = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
      res.status(200).set({ "Content-Type": "text/html" }).end(injectStudioToken(html));
    });
  }
}


app.get("/api/run_command", async (req, res) => {
  const cmd = String(req.query.cmd || "");
  try {
    const { exec } = await import("child_process");
    exec(cmd, (err, stdout, stderr) => {
      res.json({
        error: err ? err.message : null,
        stdout,
        stderr
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

setupDevOrProd().then(() => {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`X4 Forge Dev Server running on http://127.0.0.1:${PORT}`);
  });
}).catch(err => {
  console.error("Server failure: ", err);
});
