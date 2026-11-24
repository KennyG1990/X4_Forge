#!/usr/bin/env node
/**
 * x4forge-mcp.cjs — B56s4 (2026-07-17): a dependency-free MCP (Model Context Protocol)
 * stdio server that exposes a CURATED subset of the X4 Forge agent API as tools for
 * IDE-resident coding agents (Antigravity agent, Claude Code, Codex, …).
 *
 * Security posture (workflow rule 3.6, reviewed at ship time):
 *  - This process LISTENS on nothing — stdio only; it is a CLIENT of the Forge sidecar.
 *  - Auth = a scoped, revocable agent key (mint via "X4 Forge: Create Agent Key");
 *    scope enforcement is SERVER-side (read includes reviewed read/analyze POSTs; write adds validate/compile;
 *    deploy tools require deploy scope PLUS an explicit per-key capability and effect grant).
 *  - No AI-spend path exists through these tools (generate is not exposed; the Forge
 *    additionally requires external agents to bring their own AI keys).
 *  - Config: X4FORGE_URL + X4FORGE_KEY + the key-bound X4FORGE_WORKSPACE_ID.
 *
 * Wire format: newline-delimited JSON-RPC 2.0 (MCP stdio transport).
 */

"use strict";

const readline = require("node:readline");
const crypto = require("node:crypto");

const BASE = (process.env.X4FORGE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const KEY = (process.env.X4FORGE_KEY || "").trim();
const WORKSPACE_ID = (process.env.X4FORGE_WORKSPACE_ID || "").trim();

const SERVER_INFO = { name: "x4forge", version: "0.1.0" };
const PROTOCOL_VERSION = "2024-11-05";
const CAPABILITY_DISCOVERY_TIMEOUT_MS = 2000;
const CAPABILITY_RETRY_MS = Math.max(100, Number(process.env.X4FORGE_CAPABILITY_RETRY_MS) || 5000);
const EFFECTIVE_AUTHORITY_API_VERSION = "2026-08-01.agent-effective.v1";
const EFFECTIVE_AUTHORITY_SCHEMA_VERSION = "forge.agent-capability-authority.v1";
const ROUTE_AUTHORITY_VERSION = "forge.route-dispositions.v4";
const RUNTIME_EXPECT_MAX_LENGTH = 256;
const RUNTIME_MAX_INCIDENTS = 8;
const RUNTIME_MAX_EXPECTED_STEPS = 16;
const RUNTIME_MAX_EVIDENCE_ITEMS = 5;
const RUNTIME_MAX_STRING_ARRAY_ITEMS = 16;
const RUNTIME_MAX_COUNT = 1_000_000;
const RUNTIME_MAX_LINE = 1_000_000_000;
const XML_REFERENCE_MAX_DEPTH = 2;
const XML_REFERENCE_MAX_NODES = 60;
const XML_REFERENCE_MAX_EDGES = 120;
const XML_REFERENCE_MAX_FILES = 256;
const XML_REFERENCE_MAX_CANDIDATES = 16;
const XML_REFERENCE_MAX_OUTPUT_BYTES = 512 * 1024;
const AUTHORED_NAVIGATION_TOOLS = new Set(["navigate_ai_script", "navigate_md_script"]);
const AUTHORED_NAVIGATION_CAPABILITIES = new Set(["project.ai.navigation", "project.md.navigation"]);
const AUTHORED_NAVIGATION_ROUTES = new Set(["/api/agent/project/ai-navigation", "/api/agent/project/md-navigation"]);
const CONFIGURATION_TOOLS = new Set([
  "request_configuration_access",
  "get_configuration_access_status",
  "get_configuration",
  "preview_configuration_change",
  "apply_configuration_change",
  "get_configuration_operation_status",
]);
const CONFIGURATION_CAPABILITIES = new Set([
  "configuration.access.request",
  "configuration.access.status",
  "configuration.apply",
  "configuration.preview",
  "configuration.read",
  "configuration.status",
]);
const DEPLOY_TOOLS = new Set([
  "preview_native_deploy",
  "apply_native_deploy",
  "get_deploy_operation_status",
  "undo_native_deploy",
  "prepare_nexus_release",
  "prepare_steam_release",
  "verify_steam_release",
  "adopt_steam_workshop_id",
  "revoke_warning_review",
]);
const DEPLOY_CAPABILITIES = new Set([
  "deploy.apply",
  "deploy.preview",
  "deploy.status",
  "deploy.undo",
  "release.nexus.prepare",
  "release.steam.adopt",
  "release.steam.prepare",
  "release.steam.verify",
  "reviews.warning.revoke",
]);
const WORKSPACE_FILES_TOOLS = new Set([
  "preview_bulk_transform",
  "apply_bulk_transform",
  "get_project_file_inventory",
  "list_workspace_files",
  "read_workspace_file",
  "scaffold_mod_project",
  "write_workspace_file",
  "remove_workspace_file",
  "remove_workspace_directory",
  "restore_workspace_file",
  "apply_warning_suppression",
  "rename_md_symbol",
  "list_workspace_snapshots",
  "create_workspace_snapshot",
  "restore_workspace_snapshot",
  "delete_workspace_snapshot",
  "revert_action_history",
  "get_mod_drift",
  "import_mod_folder",
  "update_workspace_domain",
]);
const WORKSPACE_FILES_CAPABILITIES = new Set([
  "bulk.transform.apply",
  "bulk.transform.preview",
  "files.delete",
  "files.delete.dir",
  "files.inventory.read",
  "files.list",
  "files.read",
  "files.restore",
  "files.scaffold",
  "files.write",
  "history.revert",
  "project.md.rename",
  "rules.suppression.apply",
  "snapshots.create",
  "snapshots.delete",
  "snapshots.list",
  "snapshots.restore",
  "workspace.domain.write",
  "workspace.mod.drift",
  "workspace.mod.import",
]);
const AUTHORED_NAVIGATION_MAX_FILES = 512;
const AUTHORED_NAVIGATION_MAX_FILE_BYTES = 8 * 1024 * 1024;
const AUTHORED_NAVIGATION_MAX_TOTAL_BYTES = 4 * AUTHORED_NAVIGATION_MAX_FILE_BYTES;
const AUTHORED_NAVIGATION_MAX_REFERENCES = 2048;
const MD_NAVIGATION_EVIDENCE = {
  label: "Mission Director navigation",
  subject: "Mission Director scripts",
  schemaVersion: "forge.md-navigation.v1",
  scope: "authored-md-snapshot",
  file: /^md\/[^/\\:<>"|?*\x00-\x1f\x7f]+\.xml$/i,
};
const AI_NAVIGATION_EVIDENCE = {
  label: "AI script navigation",
  subject: "AI scripts",
  schemaVersion: "forge.ai-navigation.v1",
  scope: "authored-ai-snapshot",
  file: /^aiscripts\/[^/\\:<>"|?*\x00-\x1f\x7f]+\.xml$/i,
};
const PERFORMANCE_LIVE_TOOLS = new Set(["get_forge_performance", "start_forge_performance_capture", "profile_forge_backend"]);
const DIAGNOSTIC_READ_LIVE_TOOLS = new Set([
  "list_action_history",
  "get_compile_result",
  "get_last_validation_verdict",
  "get_mod_proof",
  "get_agent_brief",
  "get_reference_status",
  "search_reference_symbols",
  "read_reference_file",
  "search_x4_objects",
  "simulate_xml_diff",
  "diagnose_game_log",
  "suggest_expression_completions",
  "get_mod_dependency_graph",
  "get_extension_override_map",
  "list_patch_targets",
  "synthesize_xml_patch",
  "get_galaxy_map",
  "check_xml_round_trip",
  "suggest_quick_fixes",
  "prepare_warning_suppression",
  "verify_release_artifact",
  "search_workspace_symbols",
  "read_action_history_blob",
  "derive_external_api_contract",
  "list_external_api_contracts",
  "read_extension_file",
  "read_patch_base_content",
  "complete_xpath_selector",
  "get_reference_coverage",
  "list_lua_ui_snippets",
  "harvest_vanilla_ui_menus",
  "prepare_bug_report",
  "query_forge_knowledge",
  "get_forge_health_card",
  "preview_forge_probe",
  "get_live_forge_state",
  "get_workspace_domain",
  "get_ai_spend_status",
  "preview_contract_glue",
  "audit_workspace_patches",
  "inspect_schema_domain",
  "list_reference_manifest_files",
  "get_live_bridge_state",
  "get_runtime_control_status",
  "analyze_cue_telemetry",
  "get_game_log_status",
]);
const PERFORMANCE_PROFILE_HTTP_FAILURES = { PROFILE_DISABLED: 503, PROFILE_BUSY: 409, PROFILE_RATE_LIMITED: 429, PROFILE_DISPOSED: 503, PROFILE_INPUT_INVALID: 400, PROFILE_ABORTED: 408, PROFILE_FAILED: 500, PROFILE_CLEANUP_UNCONFIRMED: 409 };
const PERFORMANCE_COLLECTION_HTTP_FAILURES = { PERFORMANCE_DISPOSED: 503, PERFORMANCE_COLLECTION_BUSY: 409, PERFORMANCE_COLLECTION_REFUSED: 409, PROJECT_INPUT_INVALID: 400, PERFORMANCE_COLLECTION_FAILED: 500 };
const PERFORMANCE_MAX_OUTPUT_BYTES = 256 * 1024;
const PERFORMANCE_RESOURCE_FIELDS = ["atUnixMs", "elapsedMs", "cpuUserMicros", "cpuSystemMicros", "cpuOneCorePercent", "cpuHostPercent", "logicalCpuCount", "rssBytes", "heapUsedBytes", "heapTotalBytes", "externalBytes", "arrayBuffersBytes", "uptimeSeconds", "eventLoopUtilization", "eventLoopDelayP50Ms", "eventLoopDelayP95Ms", "eventLoopDelayMaxMs", "fps", "frameIntervalMs", "longTaskDurationMs", "jsHeapUsedBytes"];

// Native public transport owns a separate, finite request/response contract.
const nativePerformanceClock = require("node:perf_hooks").performance;
const NATIVE_PERFORMANCE_LIVE_TOOLS = new Set(["get_forge_native_performance", "start_forge_native_performance_capture", "stop_forge_native_performance_capture"]);
const NATIVE_PERFORMANCE_CAPABILITIES = new Set(["performance.native.read", "performance.native.collect", "performance.native.stop"]);
const NATIVE_PERFORMANCE_HTTP_FAILURES = Object.freeze({
  NATIVE_PERFORMANCE_INPUT_INVALID: 400, NATIVE_PERFORMANCE_BUSY: 409, NATIVE_PERFORMANCE_CAPTURE_MISMATCH: 409,
  NATIVE_PERFORMANCE_IDENTITY_MISMATCH: 409, NATIVE_PERFORMANCE_PREEMPTED: 409, NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED: 409,
  NATIVE_PERFORMANCE_DISPOSED: 503, NATIVE_PERFORMANCE_UNAVAILABLE: 503, NATIVE_PERFORMANCE_RETIRED: 503,
  NATIVE_PERFORMANCE_AUTHORITY_REVOKED: 403, NATIVE_PERFORMANCE_NOT_OWNER: 403,
  NATIVE_PERFORMANCE_CONTROL_TIMEOUT: 408, NATIVE_PERFORMANCE_ABORTED: 408, NATIVE_PERFORMANCE_PROTOCOL_ERROR: 502,
  NATIVE_PERFORMANCE_READER_LIMIT: 429, NATIVE_PERFORMANCE_START_FAILED: 500, NATIVE_PERFORMANCE_REQUEST_FAILED: 500,
});
const NATIVE_PERFORMANCE_REQUEST_LIMIT = 16;
const NATIVE_PERFORMANCE_REQUEST_MS = 10000;
const NATIVE_PERFORMANCE_RESPONSE_BYTES = 1024 * 1024;
const NATIVE_PERFORMANCE_DISCOVERY_BYTES = 4 * 1024 * 1024;
const NATIVE_PERFORMANCE_OPERATION_NAMES = new Set([
  "native.activate", "native.backend.ensure", "native.backend.spawn", "native.backend.stop", "native.backend.restart",
  "native.panel.open", "native.command", "native.provider.read", "native.provider.write", "native.validation.queue",
  "native.validation.scan", "native.validation.overlay", "native.validation.serialize", "native.validation.http",
  "native.validation.map", "native.validation.apply",
]);
const NATIVE_PERFORMANCE_HISTOGRAM_MS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 60000, 120000, 300000, 600000, 1800000, 3600000, 86400000];
const nativeRequests = new Map();
let nativeTransportDisposed = false;

/** Curated tool surface — additions require the B56s4 security review, not just code. */
const TOOLS = [
  {
    name: "validate_mod",
    capabilityId: "project.validate",
    capabilityVersion: 1,
    description:
      "Run the Forge's full validation stack over a mod folder under the configured Mod Workspace root. Returns status, per-layer summary, source files, and at most the first 100 flat findings; use the Agent API for an untruncated result.",
    inputSchema: {
      type: "object",
      properties: { fromPath: { type: "string", description: "Mod folder name under the Mod Workspace root, e.g. x4_ai_influence" } },
      required: ["fromPath"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const d = await forgeValidation(context, { fromPath: String(args.fromPath || "") });
      return { ok: d.ok, summary: d.summary, findings: (d.flat || []).slice(0, 100), files: d.source?.loaded, root: d.source?.root };
    },
  },
  {
    name: "list_schema_domains",
    capabilityId: "schema.domains.list",
    capabilityVersion: 1,
    description: "List every game XSD domain the Forge discovered (factions, gamestarts, diff, md, …) with include-chain counts — a compact vocabulary map for X4 file types.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const d = requireResponse(await forge("GET", "/api/agent/schema-registry"), "schema registry", {
        roots: "array", domainCount: "number", domains: "array",
      });
      return { roots: d.roots, domains: (d.domains || []).map((x) => ({ domain: x.domain, includes: (x.includes || []).length, missingIncludes: x.missingIncludes })) };
    },
  },
  {
    name: "get_workspace",
    capabilityId: "workspace.read",
    capabilityVersion: 2,
    description: "Read a bounded summary of the explicitly bound Forge workspace, including its content CAS hash, complete snapshot hash, name/version, counts, and up to 50 node summaries. Authority comes from X4FORGE_WORKSPACE_ID plus the key binding.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_input, context) => {
      const legacyProjection = usesStaticCompatibilityRoutes(context);
      const d = requireResponse(await forge("GET", "/api/agent/workspace"), "workspace", {
        workspaceId: "string", workspace: "object", version: "number", workspaceHash: "string",
        ...(legacyProjection ? {} : { snapshotHash: "string" }), lastUpdated: "string", origin: "string",
      });
      const ws = d.workspace || d;
      return {
        name: ws.name, version: d.version, workspaceHash: d.workspaceHash,
        ...(legacyProjection ? { snapshotHashAvailable: false, compatibility: "workspace.read@1" } : { snapshotHash: d.snapshotHash }),
        nodes: (ws.nodes || []).length, links: (ws.links || []).length,
        nodeSummary: (ws.nodes || []).slice(0, 50).map((n) => ({ id: n.id, tag: n.xmlTag, label: n.label })),
      };
    },
  },
  {
    name: "compile_workspace",
    capabilityId: "workspace.compile",
    capabilityVersion: 2,
    description: "Compile the explicitly bound workspace to an in-memory file manifest and return file names plus a bounded validator summary. This does not write or package the mod.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const d = requireResponse(await forge("POST", "/api/agent/compile", {}), "workspace compile", {
        success: "boolean", modId: "string", file_count: "number", files: "object", diagnostics: "array", validation: "object",
      });
      requireResponse(d.validation, "workspace compile validation", { ok: "boolean" });
      // Older servers may claim success even when their validation failed.
      const success = d.success === true && d.validation.ok === true;
      return {
        success, generation: d.generation || { success: true },
        modId: d.modId, files: Object.keys(d.files || {}),
        diagnostics: d.diagnostics.slice(0, 100), validation: d.validation,
        ...(!success ? {
          status: d.status || "BLOCKED",
          code: d.code || "PROJECT_VALIDATION_FAILED",
          error: d.error || "Generated output did not pass project validation. Inspect diagnostics before deployment.",
          failedStages: d.failedStages || ["validation"],
        } : {}),
      };
    },
  },
  {
    name: "author_check",
    capabilityId: "project.validate",
    capabilityVersion: 1,
    description:
      "Validate draft file contents before writing anything to disk. Returns status, summary, at most 100 findings, and at most 50 repair capsules; use the Agent API for an untruncated result.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          description: "Draft files as {path, content} — paths relative to the mod root, e.g. md/my_script.xml",
          items: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: "string" } },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const files = (args.files || []).map((f) => ({ path: String(f.path || ""), content: String(f.content || "") }));
      const d = await forgeValidation(context, {
        project: { id: "author_check", name: "author_check", files },
      });
      return { ok: d.ok, summary: d.summary, findings: (d.flat || []).slice(0, 100), capsules: (d.capsules || []).slice(0, 50) };
    },
  },
  {
    name: "stage_and_validate",
    capabilityId: "project.validate",
    capabilityVersion: 1,
    description:
      "Validate a mod folder on disk and return status, summary, source files, and at most 100 remediation capsules. A clean bounded response is authoritative only when the returned summary/status is clean; use the Agent API for an untruncated result.",
    inputSchema: {
      type: "object",
      properties: { fromPath: { type: "string", description: "Mod folder name under the Mod Workspace root" } },
      required: ["fromPath"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const d = await forgeValidation(context, { fromPath: String(args.fromPath || "") });
      return { ok: d.ok, summary: d.summary, capsules: (d.capsules || []).slice(0, 100), files: d.source?.loaded, root: d.source?.root };
    },
  },
  {
    name: "readiness",
    capabilityId: "readiness.read",
    capabilityVersion: 1,
    description:
      "The Forge readiness ladder as machine truth — graph/package/deployed/seen/experience stages with evidence. THIS is the only legitimate 'done' claim: a change is complete when the machine stages pass. The experience stage flips only on the user's own screen; never claim it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => requireResponse(await forge("GET", "/api/agent/readiness"), "readiness", {
      workspaceId: "string", workspace: "string", modId: "string", stages: "array", note: "string",
    }),
  },
  {
    name: "runtime_debugger",
    capabilityId: "runtime.debug.read",
    capabilityVersion: 1,
    description:
      "Read the addressed workspace's bounded deterministic runtime-debugger payload. Returns schema, authority, session, verdict, coverage, expected steps, ambiguity, hidden unrelated-extension evidence, and bounded source-navigation evidence; it never returns the whole log or accepts a log path.",
    inputSchema: {
      type: "object",
      properties: {
        expect: {
          type: "string",
          maxLength: RUNTIME_EXPECT_MAX_LENGTH,
          description: "Optional bounded comma-separated expected cue or marker names.",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const query = new URLSearchParams();
      const expect = typeof args?.expect === "string" ? args.expect.trim() : "";
      if (expect.length > RUNTIME_EXPECT_MAX_LENGTH) {
        throw new Error(`runtime debugger expect must be at most ${RUNTIME_EXPECT_MAX_LENGTH} characters`);
      }
      if (expect) query.set("expect", expect);
      const d = requireRuntimeDebuggerResponse(
        await forge("GET", `/api/agent/runtime-debugger?${query}`),
        "runtime debugger",
      );
      return projectRuntimeDebugger(d);
    },
  },
  {
    name: "lookup_text",
    capabilityId: "text.lookup",
    capabilityVersion: 1,
    description: "Look up one literal X4 text entry in a selected language. Choose the configured reference corpus or the saved workspace. Returns the checked scope and relative source evidence. Missing language, ambiguous definitions, and unresolved nested references are explicit.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 0, maximum: 9007199254740991 },
        id: { type: "integer", minimum: 0, maximum: 9007199254740991 },
        language: { type: "integer", minimum: 1, maximum: 999 },
        scope: { type: "string", enum: ["reference", "workspace"] },
      },
      required: ["page", "id", "language", "scope"],
      additionalProperties: false,
    },
    handler: async args => requireResponse(await forge("POST", "/api/agent/text/lookup", args), "text lookup", {
      status: "string", page: "number", id: "number", language: "number", scope: "string",
    }),
  },
  {
    name: "check_expression",
    capabilityId: "expression.check",
    capabilityVersion: 1,
    description: "Check one unsaved MD or AIScript expression with Forge's rules and configured script property data. Returns legality and up to 50 problems. It does not evaluate runtime values.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", maxLength: 4096 },
        variableTypes: { type: "object", additionalProperties: { type: "string", maxLength: 128 } },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const d = requireResponse(await forge("POST", "/api/agent/expressions/check", args), "expression check", {
        ok: "boolean", legal: "boolean", expression: "string", problems: "array",
      });
      return {
        ok: d.ok, legal: d.legal, expression: d.expression,
        problems: d.problems.slice(0, 50), problemCount: d.problems.length,
        ...(typeof d.note === "string" ? { note: d.note } : {}),
      };
    },
  },
  {
    name: "inspect_expression",
    capabilityId: "expression.inspect",
    capabilityVersion: 1,
    description: "Read ordered ScriptProperties type evidence for one unsaved static MD or AIScript property chain. An explicit variable type hint remains an assumption throughout the trace. Unsupported or unresolved chains report a status.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", maxLength: 4096 },
        variableTypes: { type: "object", additionalProperties: { type: "string", maxLength: 128 } },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    handler: async args => requireExpressionInspection(
      await forge("POST", "/api/agent/expressions/inspect", args),
      args.expression.trim(),
    ),
  },
  {
    name: "get_xml_references",
    capabilityId: "project.xml.references",
    capabilityVersion: 1,
    description: "Read a bounded XML file-reference map for one focus file in the explicitly bound saved workspace. Preserves source-resolution statuses, coverage and signature; reports projection totals and truncation. Uses configured game/schema knowledge. It does not return source text, run validation, write files or prove runtime loading.",
    inputSchema: {
      type: "object",
      properties: {
        focus: {
          type: "object",
          properties: {
            origin: { type: "string", enum: ["project", "reference"] },
            path: { type: "string", maxLength: 1024, description: "Safe relative XML path in the selected origin." },
            line: { type: "integer", description: "Optional positive one-based source line." },
            column: { type: "integer", description: "Optional positive one-based source column." },
          },
          required: ["origin", "path"],
          additionalProperties: false,
        },
        maxDepth: { type: "integer", enum: [0, 1, 2], description: "Traversal depth; default 2." },
        maxNodes: { type: "integer", description: "Node limit from 1 to 60; default 60." },
        maxEdges: { type: "integer", description: "Edge limit from 1 to 120; default 120." },
      },
      required: ["focus"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const focus = args.focus;
      if (!isXmlReferencePath(focus.path) || !/\.xml$/i.test(focus.path)) {
        throw new Error("XML reference focus must be a safe relative XML path");
      }
      for (const coordinate of ["line", "column"]) {
        if (focus[coordinate] !== undefined) xmlReferenceLimit(focus[coordinate], undefined, 1, 1_000_000_000, `focus.${coordinate}`);
      }
      const body = {
        focus,
        maxDepth: xmlReferenceLimit(args.maxDepth, XML_REFERENCE_MAX_DEPTH, 0, XML_REFERENCE_MAX_DEPTH, "maxDepth"),
        maxNodes: xmlReferenceLimit(args.maxNodes, XML_REFERENCE_MAX_NODES, 1, XML_REFERENCE_MAX_NODES, "maxNodes"),
        maxEdges: xmlReferenceLimit(args.maxEdges, XML_REFERENCE_MAX_EDGES, 1, XML_REFERENCE_MAX_EDGES, "maxEdges"),
        includeSource: false,
      };
      return projectXmlReferenceMap(await forge("POST", "/api/agent/project/xml-references", body), body);
    },
  },
  {
    name: "navigate_ai_script",
    capabilityId: "project.ai.navigation",
    capabilityVersion: 1,
    description: "Resolve literal AIScript run_script definitions and references at a zero-based UTF-16 offset in submitted XML. Requires an explicit grant in the bound workspace. Supports up to 512 files, 8 MiB UTF-8 per file and 32 MiB total.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 256 },
            name: { type: "string", maxLength: 512 },
            files: {
              type: "array", maxItems: AUTHORED_NAVIGATION_MAX_FILES,
              items: {
                type: "object",
                properties: {
                  path: { type: "string", maxLength: 1024 },
                  content: { type: "string", maxLength: AUTHORED_NAVIGATION_MAX_FILE_BYTES },
                },
                required: ["path"], additionalProperties: false,
              },
            },
          },
          required: ["id", "name", "files"], additionalProperties: false,
        },
        path: { type: "string", maxLength: 1024 },
        offset: { type: "integer", minimum: 0, maximum: AUTHORED_NAVIGATION_MAX_FILE_BYTES },
        mode: { type: "string", enum: ["definition", "references"] },
        includeDeclaration: { type: "boolean" },
      },
      required: ["project", "path", "offset", "mode"], additionalProperties: false,
    },
    handler: async (args) => {
      validateAuthoredNavigationInput(args, AI_NAVIGATION_EVIDENCE);
      let result;
      try {
        result = await forge("POST", "/api/agent/project/ai-navigation", args);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? " (HTTP " + error.status + ")" : "";
        throw new Error("Forge AI script navigation request failed" + status);
      }
      return projectAuthoredNavigation(result, args, AI_NAVIGATION_EVIDENCE);
    },
  },
  {
    name: "navigate_md_script",
    capabilityId: "project.md.navigation",
    capabilityVersion: 1,
    description: "Resolve literal Mission Director cue or library definitions and references at a zero-based UTF-16 offset in submitted XML. Requires an explicit grant in the bound workspace. Supports up to 512 files, 8 MiB UTF-8 per file and 32 MiB total.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 256 },
            name: { type: "string", maxLength: 512 },
            files: {
              type: "array", maxItems: AUTHORED_NAVIGATION_MAX_FILES,
              items: {
                type: "object",
                properties: {
                  path: { type: "string", maxLength: 1024 },
                  content: { type: "string", maxLength: AUTHORED_NAVIGATION_MAX_FILE_BYTES },
                },
                required: ["path"], additionalProperties: false,
              },
            },
          },
          required: ["id", "name", "files"], additionalProperties: false,
        },
        path: { type: "string", maxLength: 1024 },
        offset: { type: "integer", minimum: 0, maximum: AUTHORED_NAVIGATION_MAX_FILE_BYTES },
        mode: { type: "string", enum: ["definition", "references"] },
        includeDeclaration: { type: "boolean" },
      },
      required: ["project", "path", "offset", "mode"], additionalProperties: false,
    },
    handler: async (args) => {
      validateAuthoredNavigationInput(args, MD_NAVIGATION_EVIDENCE);
      let result;
      try {
        result = await forge("POST", "/api/agent/project/md-navigation", args);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? " (HTTP " + error.status + ")" : "";
        throw new Error("Forge Mission Director navigation request failed" + status);
      }
      return projectAuthoredNavigation(result, args, MD_NAVIGATION_EVIDENCE);
    },
  },
  {
    name: "get_forge_performance",
    capabilityId: "performance.read",
    capabilityVersion: 1,
    description: "Read bounded Forge backend process/operation performance, existing cache counters and explicit producer coverage. Does not start collection, profiling, scans or validation. Returns up to 32 operations, 16 recent slow records and 20 latest resource samples with original totals; unknown metrics remain null.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => projectForgePerformanceReport(await forge("GET", "/api/agent/performance")),
  },
  {
    name: "start_forge_performance_capture",
    capabilityId: "performance.collect",
    capabilityVersion: 1,
    description: "Start an expiring in-memory performance collection for the current Forge backend, not a completed benchmark. Captures for at most 15 minutes with bounded retention; no workspace/configuration changes, commands or automatic file exports. Existing actor ownership refuses overlap.",
    inputSchema: { type: "object", properties: {
      durationMs: { type: "integer", description: "1000..900000 milliseconds; default 60000." },
      intervalMs: { type: "integer", description: "1000..60000 milliseconds; default 2000." },
      eventLoopDelay: { type: "boolean", description: "Opt in to event-loop delay monitoring; default false." },
    }, additionalProperties: false },
    handler: async (args) => {
      const body = {
        durationMs: performanceBound(args.durationMs, 60000, 1000, 900000, "durationMs"),
        intervalMs: performanceBound(args.intervalMs, 2000, 1000, 60000, "intervalMs"),
        eventLoopDelay: args.eventLoopDelay ?? false,
      };
      let response;
      try { response = await forge("POST", "/api/agent/performance/collection", body); }
      catch (error) { return performanceHttpFailure(error, PERFORMANCE_COLLECTION_HTTP_FAILURES); }
      const result = requireResponse(response, "performance collection", { ok: "boolean", control: "object", backend: "object" });
      return performanceOutput({ ok: result.ok, ...(result.error !== undefined ? { error: performanceText(result.error, "error", 512) } : {}), control: projectPerformanceControl(result.control), backend: projectPerformanceSnapshot(result.backend) });
    },
  },
  {
    name: "profile_forge_backend",
    capabilityId: "performance.profile",
    capabilityVersion: 1,
    description: "Capture sampled self-time for functions in the current Forge backend only, for 100..2000ms. Native host/webview functions are unsupported here. Returns up to 32 function summaries with relative module labels, coverage, omissions and delayed-stop evidence; no raw source, private paths, debugger port or profile files. Server ownership/cooldown still apply.",
    inputSchema: { type: "object", properties: {
      durationMs: { type: "integer", description: "100..2000 milliseconds; default 250." },
      samplingIntervalMicros: { type: "integer", description: "1000..100000 microseconds; default 1000." },
      maxFunctions: { type: "integer", description: "1..32 function summaries; default 16." },
    }, additionalProperties: false },
    handler: async (args) => {
      const body = {
        durationMs: performanceBound(args.durationMs, 250, 100, 2000, "durationMs"),
        samplingIntervalMicros: performanceBound(args.samplingIntervalMicros, 1000, 1000, 100000, "samplingIntervalMicros"),
        maxFunctions: performanceBound(args.maxFunctions, 16, 1, 32, "maxFunctions"),
      };
      let response;
      try { response = await forge("POST", "/api/agent/performance/profile", body); }
      catch (error) { response = performanceHttpFailure(error, PERFORMANCE_PROFILE_HTTP_FAILURES); }
      return projectPerformanceProfile(response, body.maxFunctions);
    },
  },
  {
    name: "get_forge_native_performance",
    capabilityId: "performance.native.read",
    capabilityVersion: 1,
    description: "Read bounded native extension-host performance, shared-process attribution, current capture identity, cleanup state and snapshot freshness. This does not start collection. Native function profiles are unavailable; null metrics remain unknown.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, context) => projectNativePerformanceReport(
      await forge("GET", "/api/agent/performance/native", undefined, context.signal), "read"),
  },
  {
    name: "start_forge_native_performance_capture",
    capabilityId: "performance.native.collect",
    capabilityVersion: 1,
    description: "Start one expiring native extension-host capture using the exact identities returned by native read. Shared-process telemetry only; success requires native execution ACK. Controls return cleanup/capture status without retained snapshot data.",
    inputSchema: { type: "object", properties: {
      expectedBackendInstanceId: { type: "string", maxLength: 128, description: "Current backend instance ID from native performance read; 8..128 letters, digits, underscores or hyphens." },
      expectedNativeInstanceId: { type: "string", maxLength: 128, description: "Current native instance ID from native performance read; 8..128 letters, digits, underscores or hyphens." },
      durationMs: { type: "integer", description: "1000..900000 milliseconds; default 60000." },
      intervalMs: { type: "integer", description: "1000..60000 milliseconds; default 2000." },
      eventLoopDelay: { type: "boolean", description: "Opt in to event-loop delay monitoring; default false." },
    }, required: ["expectedBackendInstanceId", "expectedNativeInstanceId"], additionalProperties: false },
    handler: async (args, context) => {
      const body = nativePerformanceInput(args, "start");
      return projectNativePerformanceReport(await forge("POST", "/api/agent/performance/native/collection", body, context.signal), "start", body);
    },
  },
  {
    name: "stop_forge_native_performance_capture",
    capabilityId: "performance.native.stop",
    capabilityVersion: 1,
    description: "Stop the exact native capture using current backend/native IDs and captureId. Agent ownership and native cleanup ACK are required; refusal/unknown cleanup is not success. This does not read retained snapshots or globally stop on client disposal.",
    inputSchema: { type: "object", properties: {
      expectedBackendInstanceId: { type: "string", maxLength: 128, description: "Current backend instance ID from native performance read; 8..128 letters, digits, underscores or hyphens." },
      expectedNativeInstanceId: { type: "string", maxLength: 128, description: "Current native instance ID from native performance read; 8..128 letters, digits, underscores or hyphens." },
      captureId: { type: "string", maxLength: 128, description: "Exact capture ID returned by the native owner; 8..128 letters, digits, underscores or hyphens." },
    }, required: ["expectedBackendInstanceId", "expectedNativeInstanceId", "captureId"], additionalProperties: false },
    handler: async (args, context) => {
      const body = nativePerformanceInput(args, "stop");
      return projectNativePerformanceReport(await forge("POST", "/api/agent/performance/native/stop", body, context.signal), "stop", body);
    },
  },
  {
    name: "check_conflicts",
    capabilityId: "extensions.conflicts.analyze",
    capabilityVersion: 1,
    description:
      "Scan installed extensions for dependency, override, and load-order evidence. Returns aggregate counts, load order, and at most the first 50 findings; use the Agent API for the complete finding set.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const d = requireResponse(await forge("GET", "/api/agent/extension-doctor"), "extension doctor", {
        success: "boolean", extensionsScanned: "number", enabledCount: "number", findings: "array",
      });
      return {
        extensionsScanned: d.extensionsScanned,
        enabledCount: d.enabledCount,
        counts: d.counts,
        loadOrder: d.loadOrder,
        findings: (d.findings || []).slice(0, 50).map((f) => ({
          severity: f.severity, code: f.code, file: f.filePath, message: f.message,
        })),
      };
    },
  },
  {
    name: "check_patch_readiness",
    capabilityId: "patch.readiness.analyze",
    capabilityVersion: 2,
    description:
      "Check a mod's <diff> selectors against old and current game data. Returns summary data plus at most 50 findings filtered to broken or removed targets; use the Agent API for all verdicts.",
    inputSchema: {
      type: "object",
      properties: {
        fromPath: { type: "string", description: "Mod folder name under the Mod Workspace root" },
        oldRoot: { type: "string", description: "Path to the PREVIOUS game version's data (unpacked or install) to compare against" },
        newRoot: { type: "string", description: "Path to the new game version's data (default: the configured game path)" },
      },
      required: ["fromPath", "oldRoot"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ fromPath: String(args.fromPath || ""), oldRoot: String(args.oldRoot || "") });
      if (args.newRoot) q.set("newRoot", String(args.newRoot));
      const d = requireResponse(await forge("GET", `/api/agent/patch-readiness?${q}`), "patch readiness", {
        oldRoot: "string", newRoot: "string", diffFiles: "number", summary: "object", findings: "array",
      });
      return {
        diffFiles: d.diffFiles,
        summary: d.summary,
        broken: (d.findings || []).filter((f) => f.verdict === "broken" || f.verdict === "target_file_removed").slice(0, 50),
      };
    },
  },
  {
    name: "explain_element",
    capabilityId: "schema.element.explain",
    capabilityVersion: 1,
    description: "Explain an X4 MD/AIScript XML element: schema-declared attributes (required/enums) plus the Forge's curated deterministic semantics (what it does, risk class).",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Element name, e.g. create_ship" },
        file: { type: "string", description: "Context file path (routes to the right schema), e.g. md/story.xml", default: "md/x.xml" },
      },
      required: ["tag"],
      additionalProperties: false,
    },
    handler: async (args, context) => {
      const q = new URLSearchParams({ file: String(args.file || "md/x.xml"), tag: String(args.tag || "") });
      if (!usesStaticCompatibilityRoutes(context)) {
        return requireResponse(await forge("GET", `/api/agent/lang/element-explain?${q}`), "element explanation", {
          domain: "string", tag: "string", known: "boolean", requiredAttrs: "array", attrCount: "number", attrs: "array",
        });
      }
      const hover = requireResponse(await forge("GET", `/api/agent/lang/hover?${q}`), "element hover", {
        domain: "string", tag: "string", known: "boolean", requiredAttrs: "array", attrCount: "number",
      });
      const attrs = requireResponse(await forge("GET", `/api/agent/lang/attrs?${q}`), "element attributes", { attrs: "array" });
      return { ...hover, attrs: attrs.attrs };
    },
  },
  {
    name: "request_configuration_access",
    capabilityId: "configuration.access.request",
    capabilityVersion: 1,
    description: "Submit a profile-bound owner approval request for explicit Forge configuration fields, physical root leases, and session duration. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        instance: {
          type: "object",
          properties: {
            profileId: { type: "string", maxLength: 128 },
            pid: { type: "integer", minimum: 1, maximum: 4294967295 },
            startedAt: { type: "string", maxLength: 64 },
          },
          required: ["profileId", "pid", "startedAt"],
          additionalProperties: false,
        },
        operationId: { type: "string", maxLength: 96 },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: ["schemaDir", "x4ReferenceRoot", "x4GamePath", "modWorkspacePath", "filesystemPath", "deployFormat"],
          },
        },
        roots: {
          type: "object",
          properties: {
            schemaDir: { type: "array", items: { type: "string", maxLength: 4096 } },
            x4ReferenceRoot: { type: "array", items: { type: "string", maxLength: 4096 } },
            x4GamePath: { type: "array", items: { type: "string", maxLength: 4096 } },
            modWorkspacePath: { type: "array", items: { type: "string", maxLength: 4096 } },
            filesystemPath: { type: "array", items: { type: "string", maxLength: 4096 } },
          },
          additionalProperties: false,
        },
        durationMs: { type: "integer", minimum: 60000, maximum: 86400000 },
        restartPolicy: { type: "string", enum: ["same-profile"] },
      },
      required: ["instance", "operationId", "fields", "roots", "durationMs"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/configuration/access/request", args),
      "configuration access request",
      { success: "boolean", requestId: "string", operationId: "string", state: "string", instance: "object", expiresAt: "number", requested: "object" },
    ),
  },
  {
    name: "get_configuration_access_status",
    capabilityId: "configuration.access.status",
    capabilityVersion: 1,
    description: "Inspect the current pending, approved, or denied status of a caller-owned configuration access request.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", maxLength: 96 },
      },
      required: ["operationId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ operationId: String(args.operationId || "") });
      return requireResponse(
        await forge("GET", `/api/agent/configuration/access?${q}`),
        "configuration access status",
        { success: "boolean", requestId: "string", operationId: "string", state: "string", instance: "object", expiresAt: "number", requested: "object" },
      );
    },
  },
  {
    name: "get_configuration",
    capabilityId: "configuration.read",
    capabilityVersion: 1,
    description: "Read allowlisted saved and effective directory settings, deployment format preference, resolver provenance, lock reasons, and current revision for this profile without exposing secrets.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async () => requireResponse(
      await forge("GET", "/api/agent/configuration"),
      "configuration",
      { success: "boolean", instance: "object", revision: "string", saved: "object", effective: "object", locks: "object", mutability: "object", provenance: "object", deployFormats: "array" },
    ),
  },
  {
    name: "preview_configuration_change",
    capabilityId: "configuration.preview",
    capabilityVersion: 1,
    description: "Validate a strict six-field directory or default deploy-format patch against the current profile revision, path-role locks, and physical root leases without modifying config.json.",
    inputSchema: {
      type: "object",
      properties: {
        instance: {
          type: "object",
          properties: {
            profileId: { type: "string", maxLength: 128 },
            pid: { type: "integer", minimum: 1, maximum: 4294967295 },
            startedAt: { type: "string", maxLength: 64 },
          },
          required: ["profileId", "pid", "startedAt"],
          additionalProperties: false,
        },
        revision: { type: "string", maxLength: 64 },
        operationId: { type: "string", maxLength: 96 },
        patch: {
          type: "object",
          properties: {
            schemaDir: { type: "string", maxLength: 4096 },
            x4ReferenceRoot: { type: "string", maxLength: 4096 },
            x4GamePath: { type: "string", maxLength: 4096 },
            modWorkspacePath: { type: "string", maxLength: 4096 },
            filesystemPath: { type: "string", maxLength: 4096 },
            deployFormat: { type: "string", enum: ["loose", "catalog"] },
          },
          additionalProperties: false,
        },
      },
      required: ["instance", "revision", "operationId", "patch"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/configuration/preview", args),
      "configuration preview",
      { success: "boolean", proposalId: "string", operationId: "string", expiresAt: "number" },
    ),
  },
  {
    name: "apply_configuration_change",
    capabilityId: "configuration.apply",
    capabilityVersion: 1,
    description: "Atomically persist a revision- and instance-bound configuration proposal, refresh schema/reference caches, and record a durable profile receipt.",
    inputSchema: {
      type: "object",
      properties: {
        instance: {
          type: "object",
          properties: {
            profileId: { type: "string", maxLength: 128 },
            pid: { type: "integer", minimum: 1, maximum: 4294967295 },
            startedAt: { type: "string", maxLength: 64 },
          },
          required: ["profileId", "pid", "startedAt"],
          additionalProperties: false,
        },
        proposalId: { type: "string", maxLength: 96 },
        operationId: { type: "string", maxLength: 96 },
      },
      required: ["instance", "proposalId", "operationId"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/configuration/apply", args),
      "configuration apply",
      { success: "boolean", code: "string", operationId: "string", proposalId: "string", receiptStatus: "string" },
    ),
  },
  {
    name: "get_configuration_operation_status",
    capabilityId: "configuration.status",
    capabilityVersion: 1,
    description: "Inspect the saved, follow-up, receipt, and recovery-patch status of a caller-owned configuration preview or apply operation.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", maxLength: 96 },
      },
      required: ["operationId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ operationId: String(args.operationId || "") });
      return requireResponse(
        await forge("GET", `/api/agent/configuration/status?${q}`),
        "configuration operation status",
        { success: "boolean", code: "string", operationId: "string", proposalId: "string", receiptStatus: "string", instance: "object", recoveryPatch: "object" },
      );
    },
  },
  {
    name: "preview_native_deploy",
    capabilityId: "deploy.preview",
    capabilityVersion: 1,
    description: "Run the real native deployment planner, full validation stack, finding-review evaluation, and destination file-effect preview (loose or CAT/DAT catalog) without writing staging or installed files. Requires an explicit deploy capability grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 4096 },
        root: { type: "string", enum: ["workspace", "filesystem"] },
        useAddressedWorkspace: { type: "boolean" },
        deployFormat: { type: "string", enum: ["loose", "catalog"] },
        detail: { type: "string", enum: ["compact", "full"] },
        autoReimport: { type: "boolean" },
        inspectDeployOperationId: { type: "string", maxLength: 96 },
        projectCheckSuiteReceiptId: { type: "string", maxLength: 96 },
        expectedProjectCheckSuiteReceiptHash: { type: "string", maxLength: 64 },
        acceptances: {
          type: "array",
          items: {
            type: "object",
            properties: {
              findingId: { type: "string", maxLength: 128 },
              bindingHash: { type: "string", maxLength: 64 },
              reason: { type: "string", maxLength: 512 },
            },
            required: ["findingId", "bindingHash", "reason"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/deploy-verify/preview", args),
      "native deploy preview",
      { ok: "boolean", stage: "string", checklist: "array", deployment: "object" },
    ),
  },
  {
    name: "apply_native_deploy",
    capabilityId: "deploy.apply",
    capabilityVersion: 1,
    description: "Deploy a preview-bound mod artifact (loose or CAT/DAT catalog) through the shared native deploy transaction, verifying source/artifact/binding/target hashes, recording durable action and recovery receipts, and confirming deployed bytes. Requires an explicit deploy capability grant.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", maxLength: 96 },
        path: { type: "string", maxLength: 4096 },
        root: { type: "string", enum: ["workspace", "filesystem"] },
        useAddressedWorkspace: { type: "boolean" },
        deployFormat: { type: "string", enum: ["loose", "catalog"] },
        detail: { type: "string", enum: ["compact", "full"] },
        autoReimport: { type: "boolean" },
        expectedModId: { type: "string", maxLength: 256 },
        expectedSourceHash: { type: "string", maxLength: 64 },
        expectedArtifactHash: { type: "string", maxLength: 64 },
        expectedBindingHash: { type: "string", maxLength: 64 },
        expectedTargetFingerprint: { type: "string", maxLength: 64 },
        projectCheckSuiteReceiptId: { type: "string", maxLength: 96 },
        expectedProjectCheckSuiteReceiptHash: { type: "string", maxLength: 64 },
        acceptances: {
          type: "array",
          items: {
            type: "object",
            properties: {
              findingId: { type: "string", maxLength: 128 },
              bindingHash: { type: "string", maxLength: 64 },
              reason: { type: "string", maxLength: 512 },
            },
            required: ["findingId", "bindingHash", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["operationId", "expectedModId", "expectedSourceHash", "expectedArtifactHash", "expectedBindingHash", "expectedTargetFingerprint"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/deploy-verify/apply", args),
      "native deploy apply",
      { ok: "boolean", success: "boolean", stage: "string", checklist: "array", deployment: "object" },
    ),
  },
  {
    name: "get_deploy_operation_status",
    capabilityId: "deploy.status",
    capabilityVersion: 1,
    description: "Inspect the durable deployment receipt, outcome, optional live target/managed-output observation, and committed file-effect report for an addressed agent deployment operation.",
    inputSchema: {
      type: "object",
      properties: {
        deployOperationId: { type: "string", maxLength: 96 },
        inspectDeployTarget: { type: "string", enum: ["1", "managed"] },
        inspectDeployEffect: { type: "string", enum: ["1"] },
      },
      required: ["deployOperationId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ deployOperationId: String(args.deployOperationId || "") });
      if (args.inspectDeployTarget !== undefined) q.set("inspectDeployTarget", String(args.inspectDeployTarget));
      if (args.inspectDeployEffect !== undefined) q.set("inspectDeployEffect", String(args.inspectDeployEffect));
      return requireResponse(
        await forge("GET", `/api/agent/deploy-verify/status?${q}`),
        "deploy operation status",
        { ok: "boolean", workspaceId: "string", outcome: "string", receipt: "object" },
      );
    },
  },
  {
    name: "undo_native_deploy",
    capabilityId: "deploy.undo",
    capabilityVersion: 1,
    description: "Restore the exact pre-deploy extensions target state once using a CAS-checked deployment recovery record addressed by deployOperationId, recoveryId, or historyId.",
    inputSchema: {
      type: "object",
      properties: {
        deployOperationId: { type: "string", maxLength: 96 },
        recoveryId: { type: "string", maxLength: 96 },
        historyId: { type: "string", maxLength: 96 },
      },
      additionalProperties: false,
      anyOf: [
        {
          type: "object",
          properties: { deployOperationId: { type: "string", maxLength: 96 } },
          required: ["deployOperationId"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { recoveryId: { type: "string", maxLength: 96 } },
          required: ["recoveryId"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { historyId: { type: "string", maxLength: 96 } },
          required: ["historyId"],
          additionalProperties: false,
        },
      ],
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/deploy-verify/undo", args),
      "native deploy undo",
      { ok: "boolean", recoveryId: "string", recoveryKind: "string", deployedPath: "string", restoredFingerprint: "string", priorExisted: "boolean" },
    ),
  },
  {
    name: "list_action_history",
    capabilityId: "history.list",
    capabilityVersion: 2,
    description: "Read the addressed workspace's Agent Action Ledger rows, counts, recovery metadata, and honest ledger-failure counter without mutating state.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", maxLength: 64 },
        outcome: { type: "string", maxLength: 64 },
        file: { type: "string", maxLength: 1024 },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.kind !== undefined) q.set("kind", String(args.kind));
      if (args?.outcome !== undefined) q.set("outcome", String(args.outcome));
      if (args?.file !== undefined) q.set("file", String(args.file));
      if (args?.limit !== undefined) q.set("limit", String(args.limit));
      return requireResponse(
        await forge("GET", `/api/agent/history?${q}`),
        "action history",
        { ok: "boolean", workspaceId: "string", rows: "array", total: "number", ledgerFailures: "number" },
      );
    },
  },
  {
    name: "get_compile_result",
    capabilityId: "workspace.compile.result",
    capabilityVersion: 2,
    description: "Reopen an exact retained validation report from the addressed workspace by ID without recompiling.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 128 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ id: String(args?.id || "") });
      return requireResponse(
        await forge("GET", `/api/agent/compile/result?${q}`),
        "compile validation report",
        { modId: "string", success: "boolean", diagnostics: "array", validation: "object" },
      );
    },
  },
  {
    name: "get_last_validation_verdict",
    capabilityId: "validation.last.read",
    capabilityVersion: 1,
    description: "Read the durable hash-bound deploy-verify validation receipt for the addressed workspace mod or an explicit modId, including exact source-hash freshness (current vs superseded).",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
        sourceHash: { type: "string", maxLength: 64 },
        checkSource: { type: "string", enum: ["0", "1"] },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.modId !== undefined) q.set("modId", String(args.modId));
      if (args?.sourceHash !== undefined) q.set("sourceHash", String(args.sourceHash));
      if (args?.checkSource !== undefined) q.set("checkSource", String(args.checkSource));
      return requireResponse(
        await forge("GET", `/api/agent/validation/last?${q}`),
        "last validation verdict",
        { ok: "boolean", modId: "string", canonicalSurface: "string", status: "string", freshness: "object" },
      );
    },
  },
  {
    name: "get_mod_proof",
    capabilityId: "project.proof.read",
    capabilityVersion: 1,
    description: "Render the deterministic PROOF.md machine-evidence report for the addressed workspace and an optional guarded mod folder without writing disk.",
    inputSchema: {
      type: "object",
      properties: {
        fromPath: { type: "string", maxLength: 512 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.fromPath !== undefined) q.set("fromPath", String(args.fromPath));
      return requireResponse(
        await forge("GET", `/api/agent/proof?${q}`),
        "mod proof",
        { ok: "boolean", workspaceId: "string", workspace: "string", markdown: "string" },
      );
    },
  },
  {
    name: "get_agent_brief",
    capabilityId: "project.brief.read",
    capabilityVersion: 1,
    description: "Read deterministic AGENTS.md and X4_NOTES.md source text plus mod domain, file-ownership, cue-index, and default MCP tool inventory for a guarded mod folder.",
    inputSchema: {
      type: "object",
      properties: {
        fromPath: { type: "string", maxLength: 512 },
      },
      required: ["fromPath"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ fromPath: String(args?.fromPath || "") });
      return requireResponse(
        await forge("GET", `/api/agent/project/brief?${q}`),
        "agent brief",
        { input: "object", agentsMd: "string", notesMd: "string" },
      );
    },
  },
  {
    name: "get_reference_status",
    capabilityId: "reference.status.read",
    capabilityVersion: 1,
    description: "Read canonical X4 reference corpus availability, counts, generation, and manifest state without exposing host filesystem root paths.",
    inputSchema: {
      type: "object",
      properties: {
        observe: { type: "string", enum: ["0", "1"] },
        refresh: { type: "string", enum: ["0", "1"] },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.observe !== undefined) q.set("observe", String(args.observe));
      if (args?.refresh !== undefined) q.set("refresh", String(args.refresh));
      return requireResponse(
        await forge("GET", `/api/agent/reference/status?${q}`),
        "reference status",
        { available: "boolean", sourceFiles: "number", manifest: "object" },
      );
    },
  },
  {
    name: "search_reference_symbols",
    capabilityId: "reference.suggest",
    capabilityVersion: 1,
    description: "Search and rank canonical base+DLC plus addressed-workspace X4 faction, ware, sector, macro, job, or aiscript symbols.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["faction", "ware", "sector", "macro", "job", "aiscript"] },
        q: { type: "string", maxLength: 256 },
        intent: { type: "string", enum: ["reference", "new-definition", "selector"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        refresh: { type: "string", enum: ["0", "1"] },
      },
      required: ["kind"],
      additionalProperties: false,
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["faction", "ware", "sector", "macro", "job", "aiscript"] },
            q: { type: "string", maxLength: 256 },
            intent: { type: "string", enum: ["reference", "new-definition", "selector"] },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            refresh: { type: "string", enum: ["0", "1"] },
          },
          required: ["kind", "q"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["faction", "ware", "sector", "macro", "job", "aiscript"] },
            q: { type: "string", maxLength: 256 },
            intent: { type: "string", enum: ["reference", "new-definition", "selector"] },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            refresh: { type: "string", enum: ["0", "1"] },
          },
          required: ["kind", "limit"],
          additionalProperties: false,
        },
      ],
    },
    handler: async (args) => {
      const q = new URLSearchParams({ kind: String(args?.kind || "") });
      if (args?.q !== undefined) q.set("q", String(args.q));
      if (args?.intent !== undefined) q.set("intent", String(args.intent));
      if (args?.limit !== undefined) q.set("limit", String(args.limit));
      if (args?.refresh !== undefined) q.set("refresh", String(args.refresh));
      return requireResponse(
        await forge("GET", `/api/agent/reference/suggest?${q}`),
        "reference symbol search",
        { generation: "string", kind: "string", query: "string", intent: "string", items: "array" },
      );
    },
  },
  {
    name: "read_reference_file",
    capabilityId: "reference.file.read",
    capabilityVersion: 1,
    description: "Read a composed canonical base+DLC reference XML document or its script-symbol origins. Projection limit: XML content is capped at 256 KiB.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        refresh: { type: "string", enum: ["0", "1"] },
        view: { type: "string", enum: ["script-symbol-origins"] },
        compact: { type: "string", enum: ["0", "1"] },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ path: String(args?.path || "") });
      if (args?.refresh !== undefined) q.set("refresh", String(args.refresh));
      if (args?.view !== undefined) q.set("view", String(args.view));
      if (args?.compact !== undefined) q.set("compact", String(args.compact));
      const d = requireResponse(
        await forge("GET", `/api/agent/reference/effective-file?${q}`),
        "effective reference file",
        { relativePath: "string", available: "boolean", complete: "boolean" },
      );
      const rawContent = typeof d.content === "string" ? d.content : undefined;
      return {
        relativePath: d.relativePath,
        available: d.available,
        complete: d.complete,
        ...(rawContent !== undefined ? {
          content: rawContent.slice(0, 262144),
          contentLength: rawContent.length,
          contentTruncated: rawContent.length > 262144,
        } : {}),
        ...(Array.isArray(d.sources) ? { sources: d.sources } : {}),
        ...(Array.isArray(d.findings) ? { findings: d.findings } : {}),
        ...(isRecord(d.scriptSymbolOrigins) ? { scriptSymbolOrigins: d.scriptSymbolOrigins } : {}),
      };
    },
  },
  {
    name: "search_x4_objects",
    capabilityId: "reference.objects.search",
    capabilityVersion: 1,
    description: "Search indexed X4 ships, stations, wares, factions, jobs, sounds, aiscripts, macros, and MD elements. Projection limit: omits host roots and caps items at 200.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 256 },
        kind: { type: "string", enum: ["all", "ship", "station", "ware", "faction", "sound", "job", "aiscript", "md_element", "macro"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.q !== undefined) q.set("q", String(args.q));
      if (args?.kind !== undefined) q.set("kind", String(args.kind));
      q.set("limit", String(args?.limit !== undefined ? args.limit : 100));
      const d = requireResponse(
        await forge("GET", `/api/agent/object-index?${q}`),
        "object index",
        { generatedAt: "string", scannedFiles: "number", skippedFiles: "number", truncated: "boolean", counts: "object", items: "array" },
      );
      return {
        generatedAt: d.generatedAt,
        scannedFiles: d.scannedFiles,
        skippedFiles: d.skippedFiles,
        truncated: d.truncated || d.items.length > 200,
        counts: d.counts,
        items: d.items.slice(0, 200),
      };
    },
  },
  {
    name: "simulate_xml_diff",
    capabilityId: "patch.diff.simulate",
    capabilityVersion: 1,
    description: "Simulate an RFC 5261 <diff> XML patch against a composed canonical base+DLC X4 XML target file without writing disk. Projection limit: input capped at 512 KiB, merged XML capped at 256 KiB.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        content: { type: "string", maxLength: 524288 },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const d = requireResponse(
        await forge("POST", "/api/agent/reference/simulate-diff", {
          path: String(args?.path || ""),
          content: String(args?.content || ""),
        }),
        "XML diff simulation",
        { path: "string", base: "object", ok: "boolean", content: "string", operations: "array", findings: "array" },
      );
      return {
        path: d.path,
        base: d.base,
        ok: d.ok,
        content: d.content.slice(0, 262144),
        contentLength: d.content.length,
        contentTruncated: d.content.length > 262144,
        operations: d.operations,
        findings: d.findings,
      };
    },
  },
  {
    name: "diagnose_game_log",
    capabilityId: "runtime.log.diagnose",
    capabilityVersion: 1,
    description: "Run deterministic root-cause classification and #58 raw engine-ID prose leak detection over a pasted X4 log trace (up to 512 KiB) without AI spend.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
        tail: { type: "string", maxLength: 524288 },
      },
      required: ["modId", "tail"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/log-diagnose", {
        modId: String(args?.modId || ""),
        tail: String(args?.tail || ""),
      }),
      "game log diagnosis",
      { modIds: "array", diagnosis: "object" },
    ),
  },
  {
    name: "preview_bulk_transform",
    capabilityId: "bulk.transform.preview",
    capabilityVersion: 1,
    description: "Build a read-only deterministic bulk XML diff plan across canonical base+DLC corpus files and return matched file counts, sample changes, CAS hashes, and expectedPlanHash without mutating workspace state. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        rule: {
          type: "object",
          properties: {
            pathPrefix: { type: "string", maxLength: 512 },
            selector: { type: "string", maxLength: 512 },
            operation: { type: "string", enum: ["multiply", "divide", "add", "subtract", "set", "clamp"] },
            operand: {
              anyOf: [
                { type: "number" },
                { type: "array", items: { type: "number" } },
              ],
            },
            rounding: { type: "string", enum: ["none", "nearest", "floor", "ceil"] },
            roundingIncrement: { type: "number", minimum: 0.000001 },
            maxFiles: { type: "integer", minimum: 1, maximum: 5000 },
            operations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", maxLength: 64 },
                  selector: { type: "string", maxLength: 512 },
                  operation: { type: "string", enum: ["multiply", "divide", "add", "subtract", "set", "clamp"] },
                  operand: {
                    anyOf: [
                      { type: "number" },
                      { type: "array", items: { type: "number" } },
                    ],
                  },
                  rounding: { type: "string", enum: ["none", "nearest", "floor", "ceil"] },
                  roundingIncrement: { type: "number", minimum: 0.000001 },
                },
                required: ["selector", "operation", "operand"],
                additionalProperties: false,
              },
            },
          },
          required: ["pathPrefix", "maxFiles"],
          additionalProperties: false,
        },
      },
      required: ["rule"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/bulk-transform/preview-plan", { rule: args.rule }),
      "bulk transform preview",
      { ok: "boolean", applied: "boolean", planHash: "string", matchedFiles: "number", workspaceId: "string", workspaceHash: "string", snapshotHash: "string" },
    ),
  },
  {
    name: "apply_bulk_transform",
    capabilityId: "bulk.transform.apply",
    capabilityVersion: 1,
    description: "Commit validated <diff> patches from a previewed deterministic corpus numeric transform into the addressed workspace under expectedPlanHash, expectedHead, and expectedSnapshotHash CAS guards with an action receipt and one-use workspace recovery. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", maxLength: 96 },
        rule: {
          type: "object",
          properties: {
            pathPrefix: { type: "string", maxLength: 512 },
            selector: { type: "string", maxLength: 512 },
            operation: { type: "string", enum: ["multiply", "divide", "add", "subtract", "set", "clamp"] },
            operand: {
              anyOf: [
                { type: "number" },
                { type: "array", items: { type: "number" } },
              ],
            },
            rounding: { type: "string", enum: ["none", "nearest", "floor", "ceil"] },
            roundingIncrement: { type: "number", minimum: 0.000001 },
            maxFiles: { type: "integer", minimum: 1, maximum: 5000 },
            operations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", maxLength: 64 },
                  selector: { type: "string", maxLength: 512 },
                  operation: { type: "string", enum: ["multiply", "divide", "add", "subtract", "set", "clamp"] },
                  operand: {
                    anyOf: [
                      { type: "number" },
                      { type: "array", items: { type: "number" } },
                    ],
                  },
                  rounding: { type: "string", enum: ["none", "nearest", "floor", "ceil"] },
                  roundingIncrement: { type: "number", minimum: 0.000001 },
                },
                required: ["selector", "operation", "operand"],
                additionalProperties: false,
              },
            },
          },
          required: ["pathPrefix", "maxFiles"],
          additionalProperties: false,
        },
        expectedPlanHash: { type: "string", maxLength: 128 },
        expectedHead: { type: "string", maxLength: 64 },
        expectedSnapshotHash: { type: "string", maxLength: 64 },
        detail: { type: "string", enum: ["compact", "full"] },
      },
      required: ["operationId", "rule", "expectedPlanHash", "expectedHead", "expectedSnapshotHash"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/bulk-transform/execute", args),
      "bulk transform apply",
      { success: "boolean", applied: "boolean", replayed: "boolean", added: "number", workspaceId: "string", version: "number", workspaceHash: "string", snapshotHash: "string", plan: "object", receipt: "object" },
    ),
  },
  {
    name: "list_workspace_files",
    capabilityId: "files.list",
    capabilityVersion: 1,
    description: "Inspect one shallow directory (at most 500 visible entries) inside the configured Mod Workspace or deployed Filesystem root without exposing host filesystem paths. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", enum: ["workspace", "filesystem"] },
        path: { type: "string", maxLength: 1024 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.root !== undefined) q.set("root", String(args.root));
      if (args?.path !== undefined) q.set("path", String(args.path));
      return requireResponse(
        await forge("GET", `/api/agent/files/list?${q}`),
        "workspace files list",
        { ok: "boolean", root: "string", path: "string", totalItems: "number", truncated: "boolean", items: "array" },
      );
    },
  },
  {
    name: "read_workspace_file",
    capabilityId: "files.read",
    capabilityVersion: 1,
    description: "Read one bounded regular UTF-8 text file (at most 512 KiB) from the configured Mod Workspace or deployed Filesystem root and return its sha256 digest and optional workspaceRootId without exposing host absolute paths. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        root: { type: "string", enum: ["workspace", "filesystem"] },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ path: String(args?.path || "") });
      if (args?.root !== undefined) q.set("root", String(args.root));
      if (args?.expectedWorkspaceRootId !== undefined) q.set("expectedWorkspaceRootId", String(args.expectedWorkspaceRootId));
      return requireResponse(
        await forge("GET", `/api/agent/files/read?${q}`),
        "workspace file read",
        { ok: "boolean", path: "string", root: "string", bytes: "number", sha256: "string", content: "string" },
      );
    },
  },
  {
    name: "write_workspace_file",
    capabilityId: "files.write",
    capabilityVersion: 2,
    description: "Atomically create or update one UTF-8 text file (at most 512 KiB) inside the configured Mod Workspace root using mandatory expectedSha256 CAS (64-hex digest or null for new files), default strict XML/scriptproperty preflight before touching disk, automatic Action Ledger undo capture, and a one-use undo-create recovery receipt when expectedSha256 is null. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        content: { type: "string", maxLength: 524288 },
        expectedSha256: {
          anyOf: [
            { type: "string", maxLength: 64 },
            { type: "null" },
          ],
        },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
        strict: { type: "boolean" },
      },
      required: ["path", "content", "expectedSha256"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/files/write", args),
      "workspace file write",
      { ok: "boolean", success: "boolean", path: "string", written: "object", validation: "object" },
    ),
  },
  {
    name: "remove_workspace_file",
    capabilityId: "files.delete",
    capabilityVersion: 1,
    description: "Atomically remove one regular file inside the configured Mod Workspace root using mandatory expectedSha256 CAS, explicit directory/symlink/traversal/hidden-path refusal, durable pre-delete byte preservation, and a one-use CAS recovery receipt. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        expectedSha256: { type: "string", maxLength: 64 },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
      },
      required: ["path", "expectedSha256"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/files/delete", args),
      "workspace file removal",
      { ok: "boolean", success: "boolean", path: "string", removed: "object", recovery: "object" },
    ),
  },
  {
    name: "get_project_file_inventory",
    capabilityId: "files.inventory.read",
    capabilityVersion: 1,
    description: "Inspect the addressed workspace artifact-plan file inventory (up to 500 entries) reconciled against its Mod Workspace folder, reporting source vs synchronized-generated vs generated-only vs conflict state, sha256 digests, and materialization eligibility without exposing host filesystem paths. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.modId !== undefined) q.set("modId", String(args.modId));
      return requireResponse(
        await forge("GET", `/api/agent/files/inventory?${q}`),
        "project file inventory",
        { ok: "boolean", sourceAvailable: "boolean", workspaceId: "string", modId: "string", totalEntries: "number", truncated: "boolean", excludedCount: "number", errors: "array", entries: "array" },
      );
    },
  },
  {
    name: "scaffold_mod_project",
    capabilityId: "files.scaffold",
    capabilityVersion: 1,
    description: "Preview (apply=false) or atomically materialize (apply=true) a new X4 extension folder under the configured Mod Workspace root with authored content.xml and optional starter Mission Director or AI-Influence contract files, returning a one-use undo-create-dir recovery receipt. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 64 },
        name: { type: "string", maxLength: 512 },
        version: { type: "string", maxLength: 512 },
        author: { type: "string", maxLength: 512 },
        description: { type: "string", maxLength: 512 },
        deps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", maxLength: 80 },
              version: { type: "string", maxLength: 32 },
              optional: { type: "boolean" },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
        starterKind: { type: "string", enum: ["minimal", "md_cue", "ai_influence_starter"] },
        apply: { type: "boolean" },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/files/scaffold", args),
      "scaffold mod project",
      { ok: "boolean", success: "boolean", applied: "boolean", modId: "string", starterKind: "string", fileCount: "number", files: "array" },
    ),
  },
  {
    name: "remove_workspace_directory",
    capabilityId: "files.delete.dir",
    capabilityVersion: 1,
    description: "Preview (apply=false) or atomically remove (apply=true with expectedTreeSha256) a regular directory inside the configured Mod Workspace root under tree CAS guards, returning a one-use delete-dir recovery receipt restorable via restore_workspace_file or revert_action_history. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        apply: { type: "boolean" },
        expectedTreeSha256: { type: "string", maxLength: 64 },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/files/delete-dir", args),
      "workspace directory removal",
      { ok: "boolean", success: "boolean", applied: "boolean", path: "string" },
    ),
  },
  {
    name: "restore_workspace_file",
    capabilityId: "files.restore",
    capabilityVersion: 2,
    description: "Consume one ready file or directory recovery receipt (delete-file, undo-create, delete-dir, or undo-create-dir) inside the matching workspace and Mod Workspace root under CAS guards. Restores exact pre-delete bytes or directory trees when absent, or removes an unmodified newly created file or scaffolded mod folder. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        recoveryId: { type: "string", maxLength: 81 },
        expectedWorkspaceRootId: { type: "string", maxLength: 64 },
      },
      required: ["recoveryId"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/files/restore", args),
      "workspace file recovery",
      { ok: "boolean", success: "boolean", recoveryId: "string", recoveryKind: "string", operation: "string", action: "string", path: "string" },
    ),
  },
  {
    name: "revert_action_history",
    capabilityId: "history.revert",
    capabilityVersion: 2,
    description: "Revert one eligible Action Ledger entry by id in the addressed workspace. Workspace and deploy recovery-receipt rows are one-use and CAS-checked; ordinary before-blob file edit reverts use the guarded Mod Workspace writer. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 96 },
        detail: { type: "string", enum: ["compact", "full"] },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/history/revert", args),
      "action history revert",
      { ok: "boolean", revertedTo: "string" },
    ),
  },
  {
    name: "get_mod_drift",
    capabilityId: "workspace.mod.drift",
    capabilityVersion: 1,
    description: "Compare one mod folder across the configured Mod Workspace and deployed Filesystem roots and return deterministic per-file sync, modified, workspace-only, and deployed-only status. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        mod: { type: "string", maxLength: 256 },
      },
      required: ["mod"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ mod: String(args?.mod || "") });
      return requireResponse(
        await forge("GET", `/api/agent/mod-folder/drift?${q}`),
        "mod folder drift",
        { ok: "boolean", available: "boolean", mod: "string" },
      );
    },
  },
  {
    name: "import_mod_folder",
    capabilityId: "workspace.mod.import",
    capabilityVersion: 1,
    description: "Preview or commit an existing X4 mod folder import from Mod Workspace or deployed Filesystem root into the addressed Studio workspace under CAS guards with an action receipt and one-use workspace recovery. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        root: { type: "string", enum: ["workspace", "filesystem"] },
        apply: { type: "boolean" },
        operationId: { type: "string", maxLength: 96 },
        expectedHead: { type: "string", maxLength: 64 },
        expectedSnapshotHash: { type: "string", maxLength: 64 },
        expectedVersion: { type: "integer", minimum: 0 },
        detail: { type: "string", enum: ["compact", "full"] },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/mod-folder/sync", args),
      "mod folder import",
      { ok: "boolean", success: "boolean", applied: "boolean", workspaceId: "string", modId: "string", report: "object" },
    ),
  },
  {
    name: "suggest_expression_completions",
    capabilityId: "expression.suggest",
    capabilityVersion: 1,
    description: "Suggest ranked ScriptProperty continuations at a caret position in an unsaved MD or AIScript expression, optionally narrowed by variableTypes hints.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: 4000 },
        caret: { type: "integer", minimum: 0, maximum: 4000 },
        variableTypes: { type: "object", additionalProperties: { type: "string", maxLength: 128 } },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["text"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/suggest/expression", args),
      "expression completion suggestions",
      { available: "boolean", total: "number", truncated: "boolean", suggestions: "array" },
    ),
  },
  {
    name: "get_mod_dependency_graph",
    capabilityId: "extensions.dependencies.analyze",
    capabilityVersion: 1,
    description: "Inspect installed X4 extension manifests, resolved dependency edges, simulated load order, cycles, and missing required or optional dependencies without exposing host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async () => requireResponse(
      await forge("GET", "/api/agent/extensions/dependency-graph"),
      "mod dependency graph",
      { success: "boolean", nodes: "array", loadOrder: "array", cycles: "array", issues: "array", counts: "object" },
    ),
  },
  {
    name: "get_extension_override_map",
    capabilityId: "extensions.overrides.analyze",
    capabilityVersion: 1,
    description: "Build the per-element and per-attribute override map and simulated load-order winner across enabled third-party X4 extensions for one contested relative XML target file.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", maxLength: 1024 },
      },
      required: ["file"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ file: String(args?.file || "") });
      return requireResponse(
        await forge("GET", `/api/agent/override-map?${q}`),
        "extension override map",
        { success: "boolean", targetFile: "string", resolution: "string", loadOrder: "array", entries: "array", counts: "object" },
      );
    },
  },
  {
    name: "list_patch_targets",
    capabilityId: "patch.targets.list",
    capabilityVersion: 1,
    description: "Search relative X4 base-game and official DLC XML target paths eligible for RFC 5261 <diff> patching.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 256 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.q !== undefined) q.set("q", String(args.q));
      if (args?.limit !== undefined) q.set("limit", String(args.limit));
      return requireResponse(
        await forge("GET", `/api/agent/patch-targets?${q}`),
        "patch targets list",
        { success: "boolean", total: "number", items: "array" },
      );
    },
  },
  {
    name: "synthesize_xml_patch",
    capabilityId: "patch.xpath.synthesize",
    capabilityVersion: 1,
    description: "Compute minimal id/name-anchored X4 <diff> add, replace, and remove operations turning a vanilla or canonical composed XML document into a modified XML candidate without writing disk.",
    inputSchema: {
      type: "object",
      properties: {
        editedXml: { type: "string", maxLength: 524288 },
        vanillaXml: { type: "string", maxLength: 524288 },
        targetFile: { type: "string", maxLength: 1024 },
        sourceSignature: {
          anyOf: [
            { type: "string", maxLength: 128 },
            { type: "null" },
          ],
        },
      },
      required: ["editedXml"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const d = requireResponse(
        await forge("POST", "/api/agent/xpath-synth", args),
        "XML patch synthesis",
        { success: "boolean", diffXml: "string", ops: "array", warnings: "array" },
      );
      const maxDiffChars = 262144;
      const diffXmlLength = d.diffXml.length;
      const diffXmlTruncated = diffXmlLength > maxDiffChars;
      const totalOps = d.ops.length;
      const ops = d.ops.slice(0, 200);
      return {
        success: d.success,
        targetFile: d.targetFile ?? null,
        sourceSignature: d.sourceSignature ?? null,
        diffXml: diffXmlTruncated ? d.diffXml.slice(0, maxDiffChars) : d.diffXml,
        diffXmlLength,
        diffXmlTruncated,
        ops,
        totalOps,
        opsTruncated: ops.length < totalOps,
        warnings: d.warnings.slice(0, 100),
        ...(d.base && typeof d.base === "object" ? { base: d.base } : {}),
      };
    },
  },
  {
    name: "get_galaxy_map",
    capabilityId: "reference.galaxy.read",
    capabilityVersion: 1,
    description: "Read merged base-game, DLC, and extension cluster and sector 3D placement coordinates from maps/xu_ep2_universe without exposing host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 256 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args?.q !== undefined) q.set("q", String(args.q));
      return requireResponse(
        await forge("GET", `/api/agent/galaxy-map?${q}`),
        "galaxy map",
        { success: "boolean", counts: "object", bounds: "object", clusters: "array", sectors: "array" },
      );
    },
  },
  {
    name: "check_xml_round_trip",
    capabilityId: "workspace.roundtrip.check",
    capabilityVersion: 1,
    description: "Import a mod folder from Mod Workspace or deployed Filesystem in memory, compile its manifest, and verify lossless passthrough preservation, modeled XML byte equivalence, and zero dropped files without mutating disk or workspace state.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        root: { type: "string", enum: ["workspace", "filesystem"] },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/mod-folder/round-trip", args),
      "mod folder round-trip check",
      {
        ok: "boolean",
        success: "boolean",
        path: "string",
        root: "string",
        lossless: "boolean",
        strictLossless: "boolean",
        inputFileCount: "number",
        outputFileCount: "number",
        passthroughVerified: "number",
        droppedFiles: "array",
        passthroughMismatch: "array",
        modeledByteChanged: "array",
        importReport: "object",
      },
    ),
  },
  {
    name: "suggest_quick_fixes",
    capabilityId: "diagnostics.quick.fixes",
    capabilityVersion: 1,
    description: "List deterministic quick-fix and repair descriptors across the addressed Studio workspace graph using the server-owned ScriptProperty union (capped at 200).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/quick-fixes", args),
      "workspace quick fixes",
      { ok: "boolean", total: "number", truncated: "boolean", fixes: "array" },
    ),
  },
  {
    name: "prepare_warning_suppression",
    capabilityId: "rules.suppression.prepare",
    capabilityVersion: 1,
    description: "Reproduce an exact active full-project warning on a Mod Workspace mod folder (or the addressed Studio workspace) and return the expectedSha256 CAS token, suggested rule metadata defaults, and remediation guidance without mutating disk.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        useAddressedWorkspace: { type: "boolean" },
        scope: {
          type: "object",
          properties: {
            code: { type: "string", maxLength: 128 },
            file: { type: "string", maxLength: 1024 },
            sourceRef: { type: "string", maxLength: 1024 },
          },
          required: ["code"],
          additionalProperties: false,
        },
      },
      required: ["scope"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/project-rules/suppression/prepare", args),
      "warning suppression preparation",
      {
        ok: "boolean",
        success: "boolean",
        target: "string",
        scope: "object",
        defaults: "object",
        existingSuppressions: "number",
        explanation: "object",
      },
    ),
  },
  {
    name: "apply_warning_suppression",
    capabilityId: "rules.suppression.apply",
    capabilityVersion: 1,
    description: "Reproduce an exact active warning and CAS-commit a reviewed forge.rules.json v1 suppression rule inside Mod Workspace using expectedSha256 (or null when creating forge.rules.json), capturing an Action Ledger diff and undo-create recovery receipt. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        useAddressedWorkspace: { type: "boolean" },
        scope: {
          type: "object",
          properties: {
            code: { type: "string", maxLength: 128 },
            file: { type: "string", maxLength: 1024 },
            sourceRef: { type: "string", maxLength: 1024 },
          },
          required: ["code"],
          additionalProperties: false,
        },
        expectedSha256: {
          anyOf: [
            { type: "string", maxLength: 64 },
            { type: "null" },
          ],
        },
        review: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 128 },
            owner: { type: "string", maxLength: 128 },
            reason: { type: "string", maxLength: 1024 },
            reviewBy: { type: "string", maxLength: 32 },
          },
          required: ["id", "owner", "reason", "reviewBy"],
          additionalProperties: false,
        },
      },
      required: ["scope", "expectedSha256", "review"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/project-rules/suppression/apply", args),
      "warning suppression commit",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        target: "string",
        rule: "object",
        written: "object",
        sourceHash: "string",
      },
    ),
  },
  {
    name: "revoke_warning_review",
    capabilityId: "reviews.warning.revoke",
    capabilityVersion: 1,
    description: "Record an immutable revocation receipt for a previously accepted deployment warning review belonging to the addressed workspace mod and source scope without modifying source or deployed game files. Requires an explicit deploy key grant.",
    inputSchema: {
      type: "object",
      properties: {
        receiptId: { type: "string", maxLength: 67 },
        reviewScopeHash: { type: "string", maxLength: 64 },
        reason: { type: "string", maxLength: 512 },
      },
      required: ["receiptId", "reviewScopeHash", "reason"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/warning-reviews/revoke-review", args),
      "warning review revocation",
      { ok: "boolean", outcome: "string", scope: "string", receipt: "object", note: "string" },
    ),
  },
  {
    name: "prepare_nexus_release",
    capabilityId: "release.nexus.prepare",
    capabilityVersion: 1,
    description: "Validate a mod source folder inside Mod Workspace (or the addressed Studio workspace), build a reopen-verified Nexus Mods release ZIP plus its .forge-release.json provenance report, and return redacted relative artifact filenames and SHA-256 receipts. Requires an explicit deploy key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        useAddressedWorkspace: { type: "boolean" },
        bump: { type: "string", enum: ["none", "patch", "minor"] },
      },
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/release/nexus/build", args),
      "Nexus release preparation",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        platform: "string",
        modId: "string",
        folderName: "string",
        version: "string",
        artifactFile: "string",
        reportFile: "string",
        sha256: "string",
        sizeBytes: "number",
        fileCount: "number",
        stages: "array",
      },
    ),
  },
  {
    name: "prepare_steam_release",
    capabilityId: "release.steam.prepare",
    capabilityVersion: 1,
    description: "Validate a mod source folder inside Mod Workspace (or the addressed Studio workspace), build a verified Steam CAT/DAT staging folder, validate and stage an optional relative preview image, write a reopen-verified rollback backup ZIP plus its .forge-release.json provenance report, and return redacted relative filenames. Requires an explicit deploy key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        useAddressedWorkspace: { type: "boolean" },
        bump: { type: "string", enum: ["none", "patch", "minor"] },
        previewFile: { type: "string", maxLength: 256 },
        changeNote: { type: "string", maxLength: 4000 },
        minorUpdate: { type: "boolean" },
      },
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/release/steam/build", args),
      "Steam release preparation",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        platform: "string",
        readyForUpload: "boolean",
        modId: "string",
        folderName: "string",
        version: "string",
        targetFolder: "string",
        backupFile: "string",
        backupHash: "string",
        backupSizeBytes: "number",
        reportFile: "string",
        sourceManifestAdoptionAvailable: "boolean",
        stages: "array",
      },
    ),
  },
  {
    name: "verify_steam_release",
    capabilityId: "release.steam.verify",
    capabilityVersion: 1,
    description: "Verify on disk after interactive Egosoft WorkshopTool execution that staged content.xml contains a valid ws_<numeric> Workshop ID, only Workshop-managed manifest attributes changed relative to preparedManifestXml, and every non-manifest staged payload file remains byte-identical, updating <modId>.forge-release.json. Requires an explicit deploy key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
      },
      required: ["modId"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/release/steam/check", args),
      "Steam post-tool verification",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        platform: "string",
        modId: "string",
        workshopId: "string",
        targetFolder: "string",
        reportFile: "string",
        sourceManifestAdoptionRequired: "boolean",
        sourceManifestAdoptionAvailable: "boolean",
        stages: "array",
      },
    ),
  },
  {
    name: "adopt_steam_workshop_id",
    capabilityId: "release.steam.adopt",
    capabilityVersion: 1,
    description: "Preview (apply: false) or compare-and-swap adopt (apply: true) the post-WorkshopTool verified ws_<numeric> Workshop ID and release version from staged content.xml back into the Mod Workspace source content.xml with physical file-identity guards and automatic rollback on mismatch. Requires an explicit deploy key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
        apply: { type: "boolean" },
        expectedSourceSha256: { type: "string", maxLength: 64 },
        expectedWorkshopId: { type: "string", maxLength: 64 },
        expectedBindingHash: { type: "string", maxLength: 64 },
      },
      required: ["modId"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/release/steam/apply-adoption", args),
      "Steam Workshop ID adoption",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        platform: "string",
        modId: "string",
        sourceManifestFile: "string",
        workshopId: "string",
        version: "string",
        beforeSha256: "string",
        afterSha256: "string",
        bindingHash: "string",
        sourceWritePerformed: "boolean",
        stages: "array",
      },
    ),
  },
  {
    name: "verify_release_artifact",
    capabilityId: "release.artifact.verify",
    capabilityVersion: 1,
    description: "Verify on disk that a prepared Nexus Mods ZIP or Steam Workshop backup ZIP inside the release output root matches its recorded .forge-release.json SHA-256, byte size, and source provenance without streaming raw binary bytes over stdio.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["nexus", "steam"] },
        modId: { type: "string", maxLength: 256 },
        artifactFile: { type: "string", maxLength: 256 },
      },
      required: ["platform", "modId", "artifactFile"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({
        platform: String(args.platform),
        modId: String(args.modId),
        artifactFile: String(args.artifactFile),
      });
      return requireResponse(
        await forge("GET", `/api/agent/release/artifact/status?${q}`),
        "release artifact verification",
        {
          ok: "boolean",
          success: "boolean",
          verified: "boolean",
          platform: "string",
          modId: "string",
          artifactFile: "string",
          reportFile: "string",
          sha256: "string",
          sizeBytes: "number",
        },
      );
    },
  },
  {
    name: "search_workspace_symbols",
    capabilityId: "project.symbols.search",
    capabilityVersion: 1,
    description: "Search Mission Director scripts, cues, and libraries plus AIScripts and interrupt-handler libraries across an authored Mod Workspace mod folder (or the addressed Studio workspace), unpacked base-game and official DLC reference catalogs, and loose installed extensions without exposing host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 256 },
        path: { type: "string", maxLength: 1024 },
        includeReference: { type: "boolean" },
        includeInstalled: { type: "boolean" },
        kind: { type: "string", enum: ["script", "cue", "library", "interrupt-handler"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["q"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ q: String(args.q) });
      if (args?.path !== undefined) q.set("path", String(args.path));
      if (args?.includeReference !== undefined) q.set("includeReference", String(args.includeReference));
      if (args?.includeInstalled !== undefined) q.set("includeInstalled", String(args.includeInstalled));
      if (args?.kind !== undefined) q.set("kind", String(args.kind));
      if (args?.limit !== undefined) q.set("limit", String(args.limit));
      return requireResponse(
        await forge("GET", `/api/agent/mod-folder/symbols?${q}`),
        "workspace symbol search",
        {
          ok: "boolean",
          success: "boolean",
          query: "string",
          total: "number",
          truncated: "boolean",
          referenceIncluded: "boolean",
          installedIncluded: "boolean",
          countsByScope: "object",
          symbols: "array",
        },
      );
    },
  },
  {
    name: "rename_md_symbol",
    capabilityId: "project.md.rename",
    capabilityVersion: 1,
    description: "Plan or compare-and-swap commit an exact Mission Director cue or library symbol rename across all physical md/*.xml files in a Mod Workspace mod folder (or the addressed Studio workspace), refusing unsafe captures, opaque $which operands, unmodeled property expressions, casefolded collisions, and stale file SHA-256 digests. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        useAddressedWorkspace: { type: "boolean" },
        file: { type: "string", maxLength: 1024 },
        offset: { type: "integer", minimum: 0, maximum: 8388608 },
        newName: { type: "string", maxLength: 128 },
        apply: { type: "boolean" },
        expectedSha256ByFile: {
          type: "object",
          additionalProperties: { type: "string", maxLength: 64 },
        },
      },
      required: ["file", "offset", "newName"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/mod-folder/md-rename", args),
      "Mission Director symbol rename",
      {
        ok: "boolean",
        success: "boolean",
        applied: "boolean",
        modId: "string",
        symbolFile: "string",
        newName: "string",
        editCount: "number",
        touchedFiles: "array",
        expectedSha256ByFile: "object",
        edits: "array",
      },
    ),
  },
  {
    name: "read_action_history_blob",
    capabilityId: "history.raw.read",
    capabilityVersion: 1,
    description: "Read the content-addressed diff, before-file, after-file, or diagnostics/file-effects payload attached to an Action Ledger entry in the addressed workspace, verifying deployment receipt hashes when applicable and capping output at 256 KiB.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 128 },
        which: { type: "string", enum: ["diff", "before", "after", "diagnostics"] },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ id: String(args.id) });
      if (args?.which !== undefined) q.set("which", String(args.which));
      return requireResponse(
        await forge("GET", `/api/agent/history/raw?${q}`),
        "action history raw payload",
        {
          ok: "boolean",
          workspaceId: "string",
          id: "string",
          which: "string",
          bytes: "number",
          contentLength: "number",
          contentTruncated: "boolean",
          content: "string",
        },
      );
    },
  },
  {
    name: "list_workspace_snapshots",
    capabilityId: "snapshots.list",
    capabilityVersion: 1,
    description: "List saved workspace snapshots inside <modId>/.snapshots/ under Mod Workspace with SHA-256 digests, byte sizes, and node/link counts without streaming raw multi-megabyte workspace bodies. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
      },
      required: ["modId"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ modId: String(args.modId) });
      return requireResponse(
        await forge("GET", `/api/agent/snapshots/list?${q}`),
        "workspace snapshots list",
        {
          ok: "boolean",
          success: "boolean",
          modId: "string",
          total: "number",
          snapshots: "array",
        },
      );
    },
  },
  {
    name: "create_workspace_snapshot",
    capabilityId: "snapshots.create",
    capabilityVersion: 1,
    description: "Save a timestamped JSON snapshot of the addressed Studio workspace inside <modId>/.snapshots/ under Mod Workspace, pruning snapshots older than the newest 30 and returning a one-use undo-create recovery receipt without echoing multi-megabyte workspace payloads. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
        name: { type: "string", maxLength: 256 },
      },
      required: ["modId"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/snapshots/create", args),
      "workspace snapshot creation",
      {
        ok: "boolean",
        success: "boolean",
        modId: "string",
        snapshotName: "string",
        name: "string",
        savedAt: "string",
        sha256: "string",
        bytes: "number",
        workspaceHash: "string",
        snapshotHash: "string",
      },
    ),
  },
  {
    name: "restore_workspace_snapshot",
    capabilityId: "snapshots.restore",
    capabilityVersion: 1,
    description: "Restore a saved snapshot_<stamp>.json inside <modId>/.snapshots/ into the addressed Studio workspace using expectedHead + expectedSnapshotHash compare-and-swap preconditions, persisted action receipts, compact workspace summaries, and one-use workspace undo recovery. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", maxLength: 128 },
        modId: { type: "string", maxLength: 256 },
        snapshotName: { type: "string", maxLength: 256 },
        expectedHead: { type: "string", maxLength: 64 },
        expectedSnapshotHash: { type: "string", maxLength: 64 },
        expectedVersion: { type: "integer", minimum: 0 },
        detail: { type: "string", enum: ["compact", "full"] },
      },
      required: ["operationId", "modId", "snapshotName", "expectedHead", "expectedSnapshotHash"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/snapshots/restore", args),
      "workspace snapshot restore",
      {
        ok: "boolean",
        success: "boolean",
        status: "string",
        applied: "boolean",
        replayed: "boolean",
        workspaceId: "string",
        version: "number",
        workspaceHash: "string",
        snapshotHash: "string",
        receipt: "object",
      },
    ),
  },
  {
    name: "delete_workspace_snapshot",
    capabilityId: "snapshots.delete",
    capabilityVersion: 1,
    description: "Remove one named snapshot_<stamp>.json file inside <modId>/.snapshots/ under Mod Workspace when expectedSha256 matches, recording a one-use FileRecoveryRecord before unlinking so the deletion is reversible via restore_workspace_file. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      properties: {
        modId: { type: "string", maxLength: 256 },
        snapshotName: { type: "string", maxLength: 256 },
        expectedSha256: { type: "string", maxLength: 64 },
      },
      required: ["modId", "snapshotName", "expectedSha256"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/snapshots/delete", args),
      "workspace snapshot deletion",
      {
        ok: "boolean",
        success: "boolean",
        modId: "string",
        snapshotName: "string",
        removed: "object",
        recovery: "object",
      },
    ),
  },
  {
    name: "derive_external_api_contract",
    capabilityId: "contracts.derive",
    capabilityVersion: 1,
    description: "Scan loose .xml/.lua files and packed .cat/.dat archives of a single extension folder under configured Filesystem, Game extensions/, or Mod Workspace roots, synthesize a draft external API contract definition, validate it against the Forge API-registry schema, and return redacted provenance without mutating disk.",
    inputSchema: {
      type: "object",
      properties: {
        ext: { type: "string", maxLength: 128 },
      },
      required: ["ext"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ ext: String(args.ext) });
      return requireResponse(
        await forge("GET", `/api/agent/external-api/derive-draft?${q}`),
        "external API contract derivation",
        {
          ok: "boolean",
          success: "boolean",
          extensionFolder: "string",
          sourceKind: "string",
          filesScanned: "number",
          packedFilesScanned: "number",
          definition: "object",
          notes: "array",
          validates: "boolean",
          validationErrors: "array",
        },
      );
    },
  },
  {
    name: "list_external_api_contracts",
    capabilityId: "contracts.registry.read",
    capabilityVersion: 1,
    description: "Read the merged active external-API contract registry (built-in, data-dir, configured folder, and Studio runtime registrations) with optional full symbol payloads or single-extension filtering.",
    inputSchema: {
      type: "object",
      properties: {
        full: { type: "string", enum: ["0", "1"] },
        extensionId: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.full !== undefined) q.set("full", String(args.full));
      if (args.extensionId !== undefined) q.set("extensionId", String(args.extensionId));
      return requireResponse(
        await forge("GET", `/api/agent/external-api/registry?${q}`),
        "external API contract registry",
        {
          ok: "boolean",
          success: "boolean",
          count: "number",
          totalApis: "number",
          full: "boolean",
          apis: "array",
          sources: "object",
        },
      );
    },
  },
  {
    name: "read_extension_file",
    capabilityId: "extensions.file.read",
    capabilityVersion: 1,
    description: "Read one relative file (<extensionFolder>/<relativeFile>) from the configured X4 game extensions/ directory across both loose regular files and packed .cat/.dat archives, bounding returned UTF-8 content at 512 KiB and redacting host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ path: String(args.path) });
      return requireResponse(
        await forge("GET", `/api/agent/extensions/file?${q}`),
        "installed extension file read",
        {
          ok: "boolean",
          success: "boolean",
          path: "string",
          name: "string",
          source: "string",
          bytes: "number",
          contentLength: "number",
          contentTruncated: "boolean",
          sha256: "string",
          content: "string",
        },
      );
    },
  },
  {
    name: "read_patch_base_content",
    capabilityId: "patch.base.read",
    capabilityVersion: 1,
    description: "Resolve and read an XML patch target file across Mod Workspace, loose game files, loose installed extensions, or packed base-game .cat/.dat archives, bounding UTF-8 output at 512 KiB and redacting host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {
        targetFile: { type: "string", maxLength: 1024 },
      },
      required: ["targetFile"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams({ targetFile: String(args.targetFile) });
      return requireResponse(
        await forge("GET", `/api/agent/patch/base-content?${q}`),
        "patch base content read",
        {
          ok: "boolean",
          success: "boolean",
          targetFile: "string",
          source: "string",
          sourceKind: "string",
          bytes: "number",
          contentLength: "number",
          contentTruncated: "boolean",
          sha256: "string",
          content: "string",
        },
      );
    },
  },
  {
    name: "complete_xpath_selector",
    capabilityId: "patch.xpath.complete",
    capabilityVersion: 1,
    description: "Compute ranked XPath element, attribute, and predicate selector completions at a cursor offset against a composed canonical base+DLC XML target document without mutating disk.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 1024 },
        selector: { type: "string", maxLength: 16384 },
        cursor: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        refresh: { type: "boolean" },
      },
      required: ["path", "selector", "cursor"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/patch/xpath-complete", args),
      "XPath selector completion",
      {
        ok: "boolean",
        path: "string",
        available: "boolean",
        complete: "boolean",
        signature: "string",
        sources: "array",
        findings: "array",
        incompleteFindings: "array",
        total: "number",
        items: "array",
      },
    ),
  },
  {
    name: "get_reference_coverage",
    capabilityId: "reference.coverage.read",
    capabilityVersion: 1,
    description: "Read or schedule the SQLite reference-manifest coverage summary across canonical X4 domains, sources, and authority roles with host filesystem paths redacted.",
    inputSchema: {
      type: "object",
      properties: {
        refresh: { type: "string", enum: ["0", "1"] },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.refresh !== undefined) q.set("refresh", String(args.refresh));
      const payload = requireResponse(
        await forge("GET", `/api/agent/reference/coverage?${q}`),
        "reference manifest coverage",
        {
          ok: "boolean",
          ready: "boolean",
          status: "object",
        },
      );
      if (payload.coverage !== null && (!payload.coverage || typeof payload.coverage !== "object" || Array.isArray(payload.coverage))) {
        const error = new Error("reference manifest coverage response has invalid coverage field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "list_lua_ui_snippets",
    capabilityId: "ui.lua.snippets.read",
    capabilityVersion: 1,
    description: "Read the curated library of X4 UI Lua patterns (menus, widgets, event bridges, tables) with optional keyword filtering and built-in Lua snippet validation evidence.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.q !== undefined) q.set("q", String(args.q));
      return requireResponse(
        await forge("GET", `/api/agent/ui/lua-snippets?${q}`),
        "X4 UI Lua snippets",
        {
          ok: "boolean",
          success: "boolean",
          total: "number",
          count: "number",
          snippets: "array",
          selftest: "object",
        },
      );
    },
  },
  {
    name: "harvest_vanilla_ui_menus",
    capabilityId: "ui.vanilla.harvest",
    capabilityVersion: 1,
    description: "Scan packed base-game .cat/.dat archives for menu-bearing vanilla X4 UI Lua files, profile each against the standalone-menu contract, and return universal schema evidence without exposing host filesystem paths.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "string", maxLength: 4 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.limit !== undefined) q.set("limit", String(args.limit));
      return requireResponse(
        await forge("GET", `/api/agent/ui/vanilla-harvest?${q}`),
        "vanilla UI menu harvest",
        {
          ok: "boolean",
          scanned: "number",
          menusProfiled: "number",
          evidence: "array",
          menus: "array",
        },
      );
    },
  },
  {
    name: "prepare_bug_report",
    capabilityId: "help.bug.report",
    capabilityVersion: 1,
    description: "Assemble a secret-free, host-path-redacted diagnostic bug report markdown bundle and bounded GitHub new-issue URL for KennyG1990/X4_Forge, automatically attaching Forge version, runtime/schema/reference status, and optional addressed workspace plus last-validation summaries without calling GitHub or writing disk.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 256 },
        description: { type: "string", maxLength: 16000 },
        includeContext: { type: "boolean" },
        extraContext: {
          type: "object",
          additionalProperties: { type: "string", maxLength: 512 },
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/help/bug-report", args),
      "bug report bundle",
      {
        ok: "boolean",
        repo: "string",
        issueUrl: "string",
        body: "string",
        truncated: "boolean",
        context: "object",
      },
    ),
  },
  {
    name: "query_forge_knowledge",
    capabilityId: "help.knowledge.read",
    capabilityVersion: 1,
    description: "Search and read the single-source-of-truth in-app X4 modding wiki articles (MD, AIScript, XML diff patching, Lua UI, kuertee UIX, validator architecture), Studio keyboard shortcut reference, and starter-template guided onboarding rails.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["all", "wiki", "shortcuts", "onboarding"] },
        category: { type: "string", enum: ["mdscript", "aiscript", "xmlpatch", "luaui", "reference"] },
        q: { type: "string", maxLength: 256 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.section !== undefined) q.set("section", String(args.section));
      if (args.category !== undefined) q.set("category", String(args.category));
      if (args.q !== undefined) q.set("q", String(args.q));
      const payload = requireResponse(
        await forge("GET", `/api/agent/help/knowledge?${q}`),
        "Forge knowledge query",
        {
          ok: "boolean",
          section: "string",
          query: "string",
          counts: "object",
          wikiTopics: "array",
          shortcuts: "array",
          starterGuides: "array",
        },
      );
      if (payload.category !== null && typeof payload.category !== "string") {
        const error = new Error("Forge knowledge query response has invalid category field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "get_forge_health_card",
    capabilityId: "runtime.health.read",
    capabilityVersion: 1,
    description: "Evaluate the ten-row X4 Forge environment walkaround card (game installation, staging folder, MD/AI schemas, scriptproperties, object index, optional bridge, debug log, mod drift, and Lua freshness) for the addressed workspace with host filesystem paths redacted.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async () => {
      const payload = requireResponse(
        await forge("GET", "/api/agent/runtime/health-card"),
        "Forge walkaround health card",
        {
          ok: "boolean",
          workspaceId: "string",
          verdict: "string",
          summary: "string",
          rows: "array",
        },
      );
      if (payload.activeMod !== null && typeof payload.activeMod !== "string") {
        const error = new Error("Forge walkaround health card response has invalid activeMod field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "preview_forge_probe",
    capabilityId: "runtime.probe.preview",
    capabilityVersion: 1,
    description: "Generate and validate the optional read-only x4_forge_probe Mission Director XML (ADR-F3 FORGE-STATE debug_text snapshots only, zero save or game-state mutation) for default or custom probe topics without touching game directories.",
    inputSchema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              topic: { type: "string", maxLength: 64 },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string", maxLength: 64 },
                    expression: { type: "string", maxLength: 256 },
                  },
                  required: ["key", "expression"],
                  additionalProperties: false,
                },
              },
            },
            required: ["topic", "fields"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => requireResponse(
      await forge("POST", "/api/agent/runtime/probe-preview", args),
      "x4_forge_probe preview",
      {
        ok: "boolean",
        topicCount: "number",
        md: "string",
        diagnosticsSummary: "object",
        readOnly: "boolean",
        note: "string",
      },
    ),
  },
  {
    name: "get_live_forge_state",
    capabilityId: "runtime.state.read",
    capabilityVersion: 1,
    description: "Parse structured FORGE-STATE JSON topic snapshots from the active X4 debug log tail (up to 100 topics, optionally filtered by topic name) with host debuglog filesystem paths redacted.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", maxLength: 128 },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.topic !== undefined) q.set("topic", String(args.topic));
      const payload = requireResponse(
        await forge("GET", `/api/agent/runtime/forge-state?${q}`),
        "live FORGE-STATE snapshot",
        {
          ok: "boolean",
          available: "boolean",
          live: "boolean",
          totalTopics: "number",
          truncated: "boolean",
          topics: "array",
          malformed: "number",
        },
      );
      if (payload.logUpdatedAt !== null && typeof payload.logUpdatedAt !== "string") {
        const error = new Error("live FORGE-STATE snapshot response has invalid logUpdatedAt field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "get_workspace_domain",
    capabilityId: "workspace.domain.read",
    capabilityVersion: 2,
    description: "Read one complete, host-path-redacted domain model slice (aiscripts, integration_contract, libraries, md_graph, translations, ui_layout, or xml_patches) from the addressed Studio workspace along with version, CAS workspaceHash, snapshotHash, and compileSettings (bounded at 512 KiB UTF-8 without 50-node truncation).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["domain"],
      properties: {
        domain: {
          type: "string",
          enum: ["aiscripts", "integration_contract", "libraries", "md_graph", "translations", "ui_layout", "xml_patches"],
        },
      },
    },
    handler: async (args) => {
      const q = new URLSearchParams({ domain: String(args.domain) });
      return requireResponse(
        await forge("GET", `/api/agent/workspace/domain?${q}`),
        "workspace domain model read",
        {
          ok: "boolean",
          success: "boolean",
          workspaceId: "string",
          version: "number",
          workspaceHash: "string",
          snapshotHash: "string",
          modId: "string",
          domain: "string",
          compileSettings: "object",
          data: "object",
        },
      );
    },
  },
  {
    name: "update_workspace_domain",
    capabilityId: "workspace.domain.write",
    capabilityVersion: 2,
    description: "Validate and preview (apply:false, default) or compare-and-swap commit (apply:true) updates to one isolated Studio workspace domain (aiscripts, integration_contract, libraries, md_graph, translations, ui_layout, or xml_patches) under expectedHead + expectedSnapshotHash guards, preserving sibling compileSettings and uiTheme fields and recording an action receipt plus one-use workspace recovery. Requires an explicit key grant.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["domain", "changes"],
      properties: {
        domain: {
          type: "string",
          enum: ["aiscripts", "integration_contract", "libraries", "md_graph", "translations", "ui_layout", "xml_patches"],
        },
        changes: {
          type: "object",
          additionalProperties: true,
        },
        apply: {
          type: "boolean",
          default: false,
        },
        operationId: {
          type: "string",
          maxLength: 96,
        },
        expectedHead: {
          type: "string",
          maxLength: 64,
        },
        expectedSnapshotHash: {
          type: "string",
          maxLength: 64,
        },
        expectedVersion: {
          type: "integer",
          minimum: 0,
        },
        detail: {
          type: "string",
          enum: ["compact", "full"],
        },
      },
    },
    handler: async (args) => {
      const body = {
        domain: args.domain,
        changes: args.changes,
        ...(args.apply !== undefined ? { apply: args.apply } : {}),
        ...(args.operationId !== undefined ? { operationId: args.operationId } : {}),
        ...(args.expectedHead !== undefined ? { expectedHead: args.expectedHead } : {}),
        ...(args.expectedSnapshotHash !== undefined ? { expectedSnapshotHash: args.expectedSnapshotHash } : {}),
        ...(args.expectedVersion !== undefined ? { expectedVersion: args.expectedVersion } : {}),
        ...(args.detail !== undefined ? { detail: args.detail } : {}),
      };
      return requireResponse(
        await forge("POST", "/api/agent/workspace/domain", body),
        "workspace domain model update",
        {
          ok: "boolean",
          success: "boolean",
          applied: "boolean",
          detail: "string",
          domain: "string",
          touchedFields: "array",
          workspaceId: "string",
          modId: "string",
          data: "object",
        },
      );
    },
  },
  {
    name: "get_ai_spend_status",
    capabilityId: "ai.usage.read",
    capabilityVersion: 1,
    description: "Read daily AI provider call counts, refused-call counts, estimated USD spend, daily call/USD safety caps, and meter availability without exposing API keys, prompts, or host paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    handler: async () => requireResponse(
      await forge("GET", "/api/agent/ai/usage"),
      "AI spend meter status",
      {
        ok: "boolean",
        success: "boolean",
        day: "string",
        cap: "number",
        usdCap: "number",
        calls: "object",
        refused: "object",
        usd: "object",
        totalToday: "number",
        totalUsdToday: "number",
        meterAvailable: "boolean",
      },
    ),
  },
  {
    name: "preview_contract_glue",
    capabilityId: "contracts.glue.preview",
    capabilityVersion: 1,
    description: "Validate an inline IntegrationContract, the addressed workspace integrationContract, or the canonical Lever-2 sample contract, and generate deterministic X4 HTTP/UI-event/file-bridge Lua glue plus companion Mission Director script without mutating workspace or disk state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["inline", "workspace", "sample"],
        },
        contract: {
          type: "object",
          additionalProperties: true,
        },
        scriptPrefix: {
          type: "string",
          maxLength: 64,
        },
      },
    },
    handler: async (args) => {
      const payload = requireResponse(
        await forge("POST", "/api/agent/external-api/glue-preview", args),
        "contract glue preview",
        {
          ok: "boolean",
          success: "boolean",
          mode: "string",
          available: "boolean",
          findings: "array",
          errorCount: "number",
          warningCount: "number",
          lua: "string",
          mdScript: "string",
        },
      );
      if (payload.contract !== null && (!payload.contract || typeof payload.contract !== "object" || Array.isArray(payload.contract))) {
        const error = new Error("contract glue preview response has invalid contract field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "audit_workspace_patches",
    capabilityId: "patch.audit.read",
    capabilityVersion: 1,
    description: "Run deterministic target-resolution and root-element sanity diagnostics over the addressed workspace xmlPatches (mode=\"workspace\", default, bounded at 200 diagnostics with zero host paths) or run the 3-patch self-audit fixture (mode=\"selftest\").",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["workspace", "selftest"],
        },
      },
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.mode !== undefined) q.set("mode", String(args.mode));
      return requireResponse(
        await forge("GET", `/api/agent/patch/audit?${q}`),
        "workspace patch audit",
        {
          ok: "boolean",
          success: "boolean",
          mode: "string",
          totalPatches: "number",
          activePatches: "number",
          truncated: "boolean",
          summary: "object",
          diagnostics: "array",
        },
      );
    },
  },
  {
    name: "inspect_schema_domain",
    capabilityId: "schema.domain.inspect",
    capabilityVersion: 1,
    description: "Discover active X4 XSD schema domains with optional cache refresh and optional per-domain element-index drill-down (bounded up to 500 elements) while redacting all host filesystem paths to file basenames.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        domain: {
          type: "string",
          maxLength: 128,
        },
        refresh: {
          type: "string",
          enum: ["0", "1"],
        },
        limit: {
          type: "string",
          maxLength: 8,
        },
      },
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.domain !== undefined) q.set("domain", String(args.domain));
      if (args.refresh !== undefined) q.set("refresh", String(args.refresh));
      if (args.limit !== undefined) q.set("limit", String(args.limit));
      return requireResponse(
        await forge("GET", `/api/agent/schema/domain?${q}`),
        "schema domain inspection",
        {
          ok: "boolean",
          success: "boolean",
          rootCount: "number",
          domainCount: "number",
          domains: "array",
        },
      );
    },
  },
  {
    name: "list_reference_manifest_files",
    capabilityId: "reference.manifest.list",
    capabilityVersion: 1,
    description: "Search and paginate indexed files across the unpacked X4 base-game and official DLC SQLite reference manifest by substring query, extension, source, domain, role, authority, or consumer (up to 500 rows per page) with host filesystem root and database paths redacted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string", maxLength: 256 },
        extension: { type: "string", maxLength: 32 },
        source: { type: "string", maxLength: 128 },
        domain: { type: "string", maxLength: 128 },
        role: {
          type: "string",
          enum: ["grammar", "canonical-data", "localization", "executable-example", "asset", "signature", "unsupported"],
        },
        authority: {
          type: "string",
          enum: ["deterministic", "canonical", "advisory", "existence", "none"],
        },
        consumer: { type: "string", maxLength: 128 },
        limit: { type: "string", maxLength: 8 },
        offset: { type: "string", maxLength: 12 },
        refresh: { type: "string", enum: ["0", "1"] },
        observe: { type: "string", enum: ["0", "1"] },
      },
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      for (const key of ["q", "extension", "source", "domain", "role", "authority", "consumer", "limit", "offset", "refresh", "observe"]) {
        if (args[key] !== undefined) q.set(key, String(args[key]));
      }
      return requireResponse(
        await forge("GET", `/api/agent/reference/manifest?${q}`),
        "reference manifest file list",
        {
          ok: "boolean",
          ready: "boolean",
          status: "object",
          total: "number",
          limit: "number",
          offset: "number",
          files: "array",
        },
      );
    },
  },
  {
    name: "get_live_bridge_state",
    capabilityId: "runtime.bridge.read",
    capabilityVersion: 1,
    description: "Check whether an optional external runtime bridge is reachable and whether in-game bridge_events have arrived within the active play window, without exposing local SQLite paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    handler: async () => {
      const payload = requireResponse(
        await forge("GET", "/api/agent/runtime/bridge-state"),
        "live bridge state",
        {
          ok: "boolean",
          success: "boolean",
          bridgeUp: "boolean",
          gameActive: "boolean",
          eventsLastHour: "number",
          errorsLastHour: "number",
          summary: "string",
        },
      );
      if (payload.lastEventAgoMs !== null && typeof payload.lastEventAgoMs !== "number") {
        const error = new Error("live bridge state response has invalid lastEventAgoMs field");
        error.invalidResponse = true;
        throw error;
      }
      if (payload.lastEventKind !== null && typeof payload.lastEventKind !== "string") {
        const error = new Error("live bridge state response has invalid lastEventKind field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "get_runtime_control_status",
    capabilityId: "runtime.control.read",
    capabilityVersion: 1,
    description: "Inspect runtime-control enablement, companion helper readiness, current logRead state, supported reload commands (refreshmd, reloadui), and any active reload authorization status for the addressed workspace without queuing commands or exposing host paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    handler: async () => {
      const payload = requireResponse(
        await forge("GET", "/api/agent/runtime/control-status"),
        "runtime control status",
        {
          ok: "boolean",
          success: "boolean",
          enabled: "boolean",
          modId: "string",
          workspaceId: "string",
          workspaceHash: "string",
          helperAvailable: "boolean",
          supportedCommands: "array",
          gameVerified: "boolean",
          note: "string",
        },
      );
      if (payload.sessionId !== null && typeof payload.sessionId !== "string") {
        const error = new Error("runtime control status response has invalid sessionId field");
        error.invalidResponse = true;
        throw error;
      }
      if (payload.request !== null && (!payload.request || typeof payload.request !== "object" || Array.isArray(payload.request))) {
        const error = new Error("runtime control status response has invalid request field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "analyze_cue_telemetry",
    capabilityId: "runtime.cue.telemetry",
    capabilityVersion: 1,
    description: "Correlate explicit cueNames (up to 500) or the addressed workspace cue nodes against the active X4 debug log tail, returning per-cue fire/error counts, latest FORGE-WATCH values, and live bridge status with host log paths redacted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        cueNames: {
          type: "array",
          items: { type: "string", maxLength: 256 },
        },
      },
    },
    handler: async (args) => {
      const payload = requireResponse(
        await forge("POST", "/api/agent/runtime/cue-telemetry", args),
        "live cue telemetry",
        {
          ok: "boolean",
          success: "boolean",
          available: "boolean",
          live: "boolean",
          cueCount: "number",
          cues: "array",
          watches: "array",
          bridge: "object",
        },
      );
      if (payload.logUpdatedAt !== null && typeof payload.logUpdatedAt !== "string") {
        const error = new Error("live cue telemetry response has invalid logUpdatedAt field");
        error.invalidResponse = true;
        throw error;
      }
      if (payload.totals !== null && (!payload.totals || typeof payload.totals !== "object" || Array.isArray(payload.totals))) {
        const error = new Error("live cue telemetry response has invalid totals field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
  {
    name: "get_game_log_status",
    capabilityId: "runtime.gamelog.read",
    capabilityVersion: 1,
    description: "Inspect the latest X4 debug log for the target modId or addressed workspace, returning load/activity pipeline states, cue liveness, FORGE-LUAV resident-vs-disk Lua staleness (#7), root-cause diagnosis, and bounded scrubbed issues/tailLines with host paths redacted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        modId: { type: "string", maxLength: 128 },
      },
    },
    handler: async (args) => {
      const q = new URLSearchParams();
      if (args.modId !== undefined) q.set("modId", String(args.modId));
      const payload = requireResponse(
        await forge("GET", `/api/agent/runtime/game-log?${q}`),
        "live X4 game log status",
        {
          ok: "boolean",
          success: "boolean",
          status: "string",
          modId: "string",
          logAvailable: "boolean",
          logBytes: "number",
          summary: "string",
          counts: "object",
          issues: "array",
          tailLines: "array",
        },
      );
      if (payload.logUpdatedAt !== null && typeof payload.logUpdatedAt !== "string") {
        const error = new Error("live X4 game log status response has invalid logUpdatedAt field");
        error.invalidResponse = true;
        throw error;
      }
      return payload;
    },
  },
];
const STATIC_TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));
STATIC_TOOL_NAMES.delete("runtime_debugger");
STATIC_TOOL_NAMES.delete("check_expression");
STATIC_TOOL_NAMES.delete("inspect_expression");
STATIC_TOOL_NAMES.delete("lookup_text");
STATIC_TOOL_NAMES.delete("get_xml_references");
for (const name of AUTHORED_NAVIGATION_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of CONFIGURATION_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of DEPLOY_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of WORKSPACE_FILES_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of PERFORMANCE_LIVE_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of DIAGNOSTIC_READ_LIVE_TOOLS) STATIC_TOOL_NAMES.delete(name);
for (const name of NATIVE_PERFORMANCE_LIVE_TOOLS) STATIC_TOOL_NAMES.delete(name);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function schemaValueError(schema, value, location = "arguments") {
  if (Array.isArray(schema?.anyOf) && !schema.anyOf.some((candidate) => !schemaValueError(candidate, value, location))) {
    return `${location} does not match any allowed schema`;
  }
  if (Array.isArray(schema?.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return `${location} is not an allowed value`;
  }
  const types = schema?.type === undefined ? [] : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types.length) {
    const matches = types.some((type) => type === "null" ? value === null
      : type === "array" ? Array.isArray(value)
      : type === "object" ? !!value && typeof value === "object" && !Array.isArray(value)
      : type === "integer" ? Number.isInteger(value)
      : type === "number" ? typeof value === "number" && Number.isFinite(value)
      : typeof value === type);
    if (!matches) return `${location} must be ${types.join(" or ")}`;
  }
  if (typeof value === "string" && typeof schema?.maxLength === "number" &&
    schema.maxLength >= 0 && schema.maxLength % 1 === 0 && value.length > schema.maxLength) {
    return `${location} must be at most ${schema.maxLength} characters`;
  }
  if (typeof value === "number") {
    if (typeof schema?.minimum === "number" && value < schema.minimum) return `${location} must be at least ${schema.minimum}`;
    if (typeof schema?.maximum === "number" && value > schema.maximum) return `${location} must be at most ${schema.maximum}`;
  }
  if (schema?.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return `${location}.${key} is required`;
    for (const [key, child] of Object.entries(value)) {
      const properties = schema.properties;
      const childSchema = properties && Object.hasOwn(properties, key) ? properties[key] : undefined;
      if (childSchema !== undefined) {
        const error = schemaValueError(childSchema, child, `${location}.${key}`);
        if (error) return error;
      } else if (schema.additionalProperties === false) return `${location}.${key} is not allowed`;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        const error = schemaValueError(schema.additionalProperties, child, `${location}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema?.type === "array" && Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      const error = schemaValueError(schema.items, value[index], `${location}[${index}]`);
      if (error) return error;
    }
  }
  return null;
}

function requireResponse(value, label, fields = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) {
    const error = new Error(`${label} returned no valid JSON object`);
    error.invalidResponse = true;
    throw error;
  }
  for (const [field, type] of Object.entries(fields)) {
    const candidate = value[field];
    const valid = type === "array" ? Array.isArray(candidate)
      : type === "object" ? !!candidate && typeof candidate === "object" && !Array.isArray(candidate)
      : typeof candidate === type;
    if (!valid) {
      const error = new Error(`${label} response is missing ${field}:${type}`);
      error.invalidResponse = true;
      throw error;
    }
  }
  return value;
}

function isXmlReferencePath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  return !normalized.startsWith("/") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) &&
    normalized.split("/").every(part => part && part !== "." && part !== "..");
}

function validateAuthoredNavigationInput(args, evidence) {
  if (!WORKSPACE_ID) throw new Error("Set X4FORGE_WORKSPACE_ID to the key-bound workspace before navigating " + evidence.subject);
  if (args.project.files.length > AUTHORED_NAVIGATION_MAX_FILES) throw new Error(evidence.label + " accepts at most 512 project files");
  let totalBytes = 0;
  for (const file of args.project.files) {
    const bytes = Buffer.byteLength(file.content ?? "", "utf8");
    totalBytes += bytes;
    if (bytes > AUTHORED_NAVIGATION_MAX_FILE_BYTES || totalBytes > AUTHORED_NAVIGATION_MAX_TOTAL_BYTES) {
      throw new Error(evidence.label + " snapshot exceeds its UTF-8 byte budget");
    }
  }
}

function projectAuthoredNavigation(value, args, evidence) {
  const result = requireResponse(value, evidence.label, {
    schemaVersion: "string", workspaceId: "string", inputHash: "string", scope: "string", status: "string",
  });
  const invalid = () => { throw new Error("Forge returned invalid " + evidence.label + " evidence"); };
  const inputHash = crypto.createHash("sha256").update(JSON.stringify([
    args.project.id, args.project.files.map(file => [file.path, file.content ?? null]),
  ]), "utf8").digest("hex");
  const { schemaVersion, workspaceId, scope, status } = result;
  if (schemaVersion !== evidence.schemaVersion || workspaceId !== WORKSPACE_ID || result.inputHash !== inputHash
    || scope !== evidence.scope || result.modId !== args.project.id || result.sourceHash !== inputHash
    || result.sourceHashScope !== scope || !["resolved", "not-found", "not-a-literal", "ambiguous", "unavailable"].includes(status)) invalid();

  const projected = { schemaVersion, workspaceId, inputHash, scope, status };
  const base = [...Object.keys(projected), "modId", "sourceHash", "sourceHashScope"];
  if (status === "unavailable") {
    if (!hasExactKeys(result, [...base, "reason"]) || !["focus", "inventory", "source", "limit"].includes(result.reason)) invalid();
    return { ...projected, reason: result.reason };
  }
  if (status !== "resolved") {
    if (!hasExactKeys(result, base)) invalid();
    return projected;
  }

  const limit = AUTHORED_NAVIGATION_MAX_REFERENCES + (args.includeDeclaration === true ? 1 : 0);
  if (!hasExactKeys(result, [...base, "locations"]) || !Array.isArray(result.locations) || result.locations.length > limit
    || (args.mode === "definition" && result.locations.length !== 1)) invalid();
  const sourcePaths = new Set(args.project.files
    .filter(file => typeof file.content === "string").map(file => file.path.replace(/\\/g, "/")));
  const position = point => {
    if (!isRecord(point) || !hasExactKeys(point, ["line", "column"]) || [point.line, point.column].some(coordinate =>
      !Number.isSafeInteger(coordinate) || coordinate < 0 || coordinate > AUTHORED_NAVIGATION_MAX_FILE_BYTES)) invalid();
    return { line: point.line, column: point.column };
  };
  const locations = result.locations.map(location => {
    if (!isRecord(location) || !hasExactKeys(location, ["file", "start", "end"]) || !isXmlReferencePath(location.file)
      || !evidence.file.test(location.file) || !sourcePaths.has(location.file)) invalid();
    const start = position(location.start);
    const end = position(location.end);
    if (end.line < start.line || (end.line === start.line && end.column <= start.column)) invalid();
    return { file: location.file, start, end };
  });
  return { ...projected, locations };
}

function requireExpressionInspection(value, expression) {
  const result = requireResponse(value, "expression inspection", { status: "string", expression: "string", steps: "array" });
  const statuses = [
    "resolved", "unknown-receiver", "unknown-property", "ambiguous", "unsupported", "invalid-expression", "unavailable", "limit",
  ];
  const invalid = () => new Error("Forge returned malformed expression type evidence");
  if (result.expression !== expression || result.steps.length > 32 || !statuses.includes(result.status)) throw invalid();
  const resolved = result.status === "resolved";
  if (!hasExactKeys(result, resolved ? ["expression", "status", "steps", "resultType"] : ["expression", "status", "steps"])
    || resolved && (!result.steps.length || !isNonEmptyString(result.resultType))) throw invalid();

  let previousEnd = 0;
  for (const item of result.steps) {
    const step = requireResponse(item, "expression inspection step", {
      segment: "string", kind: "string", confidence: "string", start: "number", end: "number",
    });
    if (Object.keys(step).some(key => !["segment", "kind", "confidence", "start", "end", "owner", "property", "datatype", "inherited"].includes(key))
      || !Number.isSafeInteger(step.start) || !Number.isSafeInteger(step.end)
      || step.start < previousEnd || step.end <= step.start || step.end > expression.length
      || step.segment !== expression.slice(step.start, step.end)
      || !["keyword", "variable", "property"].includes(step.kind)
      || !["declared", "hint", "unestablished"].includes(step.confidence)
      || ["owner", "property", "datatype"].some(key => Object.hasOwn(step, key) && !isNonEmptyString(step[key]))
      || Object.hasOwn(step, "inherited") && typeof step.inherited !== "boolean") throw invalid();
    if (resolved && (step.confidence === "unestablished" || (previousEnd === 0
      ? step.start !== 0
      : !/^\s*\.\s*$/.test(expression.slice(previousEnd, step.start))))) throw invalid();
    previousEnd = step.end;
  }
  if (resolved && (previousEnd !== expression.length || result.steps.at(-1).datatype !== result.resultType)) throw invalid();
  return result;
}

function xmlReferenceLimit(value, fallback, minimum, maximum, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`XML reference ${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function projectXmlReferenceMap(value, requestedLimits) {
  const label = "XML reference map";
  const payload = requireResponse(value, label, {
    ok: "boolean", schemaVersion: "string", signature: "string", files: "array", nodes: "array", edges: "array", coverage: "object", context: "object",
  });
  const invalid = (field) => {
    const error = new Error(`${label} response has invalid ${field}`);
    error.invalidResponse = true;
    throw error;
  };
  const text = (item, field, maximum = 2048) => {
    if (typeof item !== "string" || item.length > maximum) invalid(field);
    return item;
  };
  const integer = (item, field) => {
    if (!Number.isSafeInteger(item) || item < 0) invalid(field);
    return item;
  };
  const origin = (item, field) => {
    if (!["project", "reference"].includes(item)) invalid(field);
    return item;
  };
  const filePath = (item, field) => {
    if (!isXmlReferencePath(item)) invalid(field);
    return item;
  };
  const optionalText = (item, fields) => Object.fromEntries(fields.filter(field => item[field] !== undefined)
    .map(field => [field, text(item[field], field)]));
  if (payload.schemaVersion !== "forge.xml-reference-map.v1") invalid("schemaVersion");
  if (!/^[a-f0-9]{64}$/.test(payload.signature)) invalid("signature");
  if (payload.context.workspaceId !== WORKSPACE_ID) invalid("context.workspaceId");
  const projectFile = (file) => {
    requireResponse(file, label, { id: "string", origin: "string", path: "string", sha256: "string", locationKind: "string", complete: "boolean", available: "boolean" });
    if (!["authored", "effective"].includes(file.locationKind) || !/^[a-f0-9]{64}$/.test(file.sha256)) invalid("file identity");
    const result = {
      id: text(file.id, "file.id"), origin: origin(file.origin, "file.origin"), path: filePath(file.path, "file.path"),
      sha256: file.sha256, locationKind: file.locationKind, complete: file.complete, available: file.available,
      ...optionalText(file, ["reason"]),
    };
    if (file.depth !== undefined) result.depth = integer(file.depth, "file.depth");
    // Authored source paths and native absolute roots are outside this curated projection.
    return result;
  };
  const projectLocation = (location) => {
    requireResponse(location, label, { origin: "string", path: "string", kind: "string" });
    if (!["authored", "effective"].includes(location.kind)) invalid("location.kind");
    const result = { origin: origin(location.origin, "location.origin"), path: filePath(location.path, "location.path"), kind: location.kind };
    for (const coordinate of ["line", "column"]) if (location[coordinate] !== undefined) {
      if (!Number.isSafeInteger(location[coordinate]) || location[coordinate] < 1 || location[coordinate] > 1_000_000_000) invalid(`location.${coordinate}`);
      result[coordinate] = location[coordinate];
    }
    return result;
  };
  let candidateCount = 0;
  let returnedCandidateCount = 0;
  let targetIdCount = 0;
  let returnedTargetIdCount = 0;
  const edges = payload.edges.slice(0, requestedLimits.maxEdges).map(edge => {
    requireResponse(edge, label, { id: "string", sourceId: "string", targetIds: "array", kind: "string", symbol: "string", status: "string", location: "object" });
    if (!["macro", "component", "ware", "bullet", "index-file", "local-connection", "unknown"].includes(edge.kind) ||
      !["resolved", "missing", "ambiguous", "dynamic", "unsupported", "incomplete"].includes(edge.status)) invalid("edge kind/status");
    targetIdCount += edge.targetIds.length;
    const targetIds = edge.targetIds.slice(0, XML_REFERENCE_MAX_CANDIDATES).map(id => text(id, "edge.targetIds"));
    returnedTargetIdCount += targetIds.length;
    const result = {
      id: text(edge.id, "edge.id"), sourceId: text(edge.sourceId, "edge.sourceId"),
      targetIds, targetIdCount: edge.targetIds.length, targetIdsTruncated: targetIds.length < edge.targetIds.length, kind: edge.kind,
      symbol: text(edge.symbol, "edge.symbol", 512), status: edge.status, location: projectLocation(edge.location),
      ...optionalText(edge, ["targetId", "reason"]),
    };
    if (edge.candidates !== undefined) {
      if (!Array.isArray(edge.candidates)) invalid("edge.candidates");
      candidateCount += edge.candidates.length;
      result.candidates = edge.candidates.slice(0, XML_REFERENCE_MAX_CANDIDATES).map(candidate => {
        requireResponse(candidate, label, { fileId: "string", origin: "string", path: "string" });
        return { fileId: text(candidate.fileId, "candidate.fileId"), origin: origin(candidate.origin, "candidate.origin"), path: filePath(candidate.path, "candidate.path") };
      });
      returnedCandidateCount += result.candidates.length;
      result.candidateCount = edge.candidates.length;
      result.candidatesTruncated = result.candidates.length < edge.candidates.length;
    }
    return result;
  });
  const coverage = requireResponse(payload.coverage, label, { scope: "string", incomingScope: "string", truncated: "boolean", reasons: "array", limits: "object" });
  if (coverage.reasons.length > 64) invalid("coverage.reasons limit");
  const projectedCoverage = {
    scope: text(coverage.scope, "coverage.scope"), incomingScope: text(coverage.incomingScope, "coverage.incomingScope"),
    truncated: coverage.truncated, reasons: coverage.reasons.map(reason => text(reason, "coverage.reasons", 360)),
    limits: {},
  };
  for (const field of ["scannedFiles", "scannedProjectFiles", "scannedReferenceFiles", "knownProjectFiles", "unsupported", "incomplete"]) {
    projectedCoverage[field] = integer(coverage[field], `coverage.${field}`);
  }
  for (const field of ["maxDepth", "maxNodes", "maxEdges", "maxDocuments", "maxDocumentBytes", "maxTotalBytes", "maxPreviewChars", "maxResponseBytes"]) {
    projectedCoverage.limits[field] = integer(coverage.limits[field], `coverage.limits.${field}`);
  }
  const files = payload.files.slice(0, XML_REFERENCE_MAX_FILES).map(projectFile);
  const nodes = payload.nodes.slice(0, requestedLimits.maxNodes).map(projectFile);
  const result = {
    ok: payload.ok, schemaVersion: payload.schemaVersion, signature: payload.signature, files, nodes, edges,
    coverage: projectedCoverage,
    context: optionalText(payload.context, ["workspaceId", "inputMode", "inputFingerprint", "corpusSignature", "corpusGeneration", "usedSourceSignature"]),
    projection: {
      fileCount: payload.files.length, returnedFileCount: files.length,
      nodeCount: payload.nodes.length, returnedNodeCount: nodes.length,
      edgeCount: payload.edges.length, returnedEdgeCount: edges.length,
      candidateCountInReturnedEdges: candidateCount, returnedCandidateCount,
      targetIdCountInReturnedEdges: targetIdCount, returnedTargetIdCount,
      truncated: files.length < payload.files.length || nodes.length < payload.nodes.length || edges.length < payload.edges.length || returnedCandidateCount < candidateCount || returnedTargetIdCount < targetIdCount,
      sourceIncluded: false,
      omittedFields: ["preview", "files.sourcePaths", "nodes.sourcePaths", "context.nativeSourceFolder"],
    },
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > XML_REFERENCE_MAX_OUTPUT_BYTES) invalid("projection exceeds 512 KiB UTF-8; use the Agent API for this result");
  return result;
}

function performanceInvalid(field) {
  const error = new Error(`Forge performance response has invalid ${field}`);
  error.invalidResponse = true;
  throw error;
}
function performanceBound(value, fallback, minimum, maximum, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
function performanceText(value, label, maximum = 160) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) performanceInvalid(label);
  return value;
}
function performanceNumbers(value, fields, nullable = false, integers = false) {
  if (!isRecord(value)) performanceInvalid("metric object");
  return Object.fromEntries(fields.map(field => {
    const item = value[field];
    if (!(nullable && item === null) && (typeof item !== "number" || !Number.isFinite(item) || item < 0 || integers && !Number.isSafeInteger(item))) performanceInvalid(field);
    return [field, item];
  }));
}
function performanceConstants(value, expected) {
  if (!isRecord(value)) performanceInvalid("coverage");
  for (const [field, wanted] of Object.entries(expected)) if (value[field] !== wanted) performanceInvalid(`coverage.${field}`);
  return { ...expected };
}
function performanceProducer(value) {
  if (!isRecord(value) || value.component !== "backend" || value.scope !== "owned-process" ||
    !Number.isSafeInteger(value.pid) || value.pid < 1 || value.instanceId !== null &&
    (typeof value.instanceId !== "string" || !/^[A-Za-z0-9_.-]{1,160}$/.test(value.instanceId))) performanceInvalid("backend producer identity");
  return { component: value.component, scope: value.scope, pid: value.pid, instanceId: value.instanceId };
}
function performanceOutput(value) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > PERFORMANCE_MAX_OUTPUT_BYTES) performanceInvalid("projection exceeds 256 KiB UTF-8");
  return value;
}
function performanceHttpFailure(error, expectedStatuses) {
  const result = error?.performanceResponse;
  if (!isRecord(result) || result.ok !== false || typeof result.code !== "string" || !Object.hasOwn(expectedStatuses, result.code) || expectedStatuses[result.code] !== error.status) throw error;
  return { ok: false, code: result.code, error: performanceText(result.error, "control refusal error", 512) };
}
function projectPerformanceSnapshot(value) {
  const input = requireResponse(value, "performance snapshot", { schemaVersion: "string", producer: "object", enabled: "boolean", disposed: "boolean", operations: "array", recentSlowOperations: "array", resources: "array", drops: "object", limits: "object", selfOverhead: "object", coverage: "object" });
  if (input.schemaVersion !== "forge.performance.v1") performanceInvalid("snapshot.schemaVersion");
  const operation = item => {
    requireResponse(item, "performance operation", { name: "string", outcomes: "object", quantileMethod: "string", histogram: "object" });
    if (!/^[A-Za-z][A-Za-z0-9_.:/ -]{0,159}$/.test(item.name) || item.name.includes("://") || item.name.includes("//")) performanceInvalid("operation.name");
    if (item.quantileMethod !== "fixed-histogram-upper-bound" || !Array.isArray(item.histogram.upperBoundsMs) || !Array.isArray(item.histogram.counts) ||
      item.histogram.upperBoundsMs.length > 24 || item.histogram.upperBoundsMs.length !== item.histogram.counts.length ||
      item.histogram.upperBoundsMs.some(n => !Number.isFinite(n) || n < 0) || item.histogram.counts.some(n => !Number.isSafeInteger(n) || n < 0)) performanceInvalid("operation.histogram");
    return { name: item.name, ...performanceNumbers(item, ["count"], false, true),
      ...performanceNumbers(item, ["totalMs", "minMs", "maxMs", "meanMs"]), ...performanceNumbers(item, ["p50Ms", "p95Ms", "p99Ms"], true),
      outcomes: performanceNumbers(item.outcomes, ["ok", "error", "cancelled", "aborted", "superseded"], false, true), quantileMethod: item.quantileMethod };
  };
  const operations = input.operations.slice(0, 128).map(operation).sort((left, right) => right.totalMs - left.totalMs || left.name.localeCompare(right.name)).slice(0, 32);
  const recentSlowOperations = input.recentSlowOperations.slice(-16).map(item => {
    requireResponse(item, "slow performance operation", { name: "string", outcome: "string" });
    if (!/^[A-Za-z][A-Za-z0-9_.:/ -]{0,159}$/.test(item.name) || item.name.includes("://") || item.name.includes("//") || !["ok", "error", "cancelled", "aborted", "superseded"].includes(item.outcome)) performanceInvalid("slow operation identity");
    const projected = { name: item.name, outcome: item.outcome, ...performanceNumbers(item, ["durationMs"]), ...performanceNumbers(item, ["atUnixMs"], true) };
    if (item.correlationId !== undefined) {
      if (typeof item.correlationId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(item.correlationId)) performanceInvalid("correlationId");
      projected.correlationId = item.correlationId;
    }
    return projected;
  });
  const resources = input.resources.slice(-20).map(item => performanceNumbers(item, PERFORMANCE_RESOURCE_FIELDS, true));
  return {
    schemaVersion: input.schemaVersion, producer: performanceProducer(input.producer), enabled: input.enabled, disposed: input.disposed,
    ...performanceNumbers(input, ["startedAtUnixMs", "capturedAtUnixMs"], true), operations, recentSlowOperations, resources,
    drops: performanceNumbers(input.drops, ["disabled", "disposed", "invalidOperations", "invalidResources", "operationCapacity", "slowOverwrites", "resourceOverwrites", "duplicateFinishes", "recorderErrors", "snapshotOmissions", "staleFinishes"], false, true),
    limits: performanceNumbers(input.limits, ["maxOperations", "maxSlowOperations", "maxResources", "maxSnapshotBytes", "maxNameChars", "maxCorrelationChars", "slowOperationMs"]),
    selfOverhead: { ...performanceNumbers(input.selfOverhead, ["recordCalls", "snapshotCalls", "clockFailures"]),
      ...performanceNumbers(input.selfOverhead, ["recordMs", "snapshotMs"], true),
      ...performanceConstants(input.selfOverhead, { snapshotScope: "completed-prior-snapshots-including-serialization-and-freeze" }) },
    coverage: performanceConstants(input.coverage, { operations: "instrumented-boundaries-only", cpuAttribution: "process-interval-not-exclusive-operation", memoryAttribution: "process-or-host-estimates-not-function-allocations", quantiles: "histogram-estimates", resourceFields: "null-means-unavailable-or-unsampled", functionProfiles: "separate-bounded-producer", limitsAre: "retained-state-not-os-quota" }),
    projection: { operationCount: input.operations.length, scannedOperationCount: Math.min(input.operations.length, 128), returnedOperationCount: operations.length,
      slowOperationCount: input.recentSlowOperations.length, returnedSlowOperationCount: recentSlowOperations.length,
      resourceSampleCount: input.resources.length, returnedResourceSampleCount: resources.length,
      truncated: operations.length < input.operations.length || recentSlowOperations.length < input.recentSlowOperations.length || resources.length < input.resources.length,
      omittedFields: ["operations.histogram"] },
  };
}
function projectPerformanceControl(value) {
  if (!isRecord(value)) performanceInvalid("control");
  const booleans = ["disposed", "collectionActive", "profilingEnabled", "profileActive", "eventLoopDelayMonitoring", "profileCleanupUnconfirmed", "collectionCleanupUnconfirmed", "abortListenerCleanupUnconfirmed"];
  for (const field of booleans) if (typeof value[field] !== "boolean") performanceInvalid(`control.${field}`);
  if (![null, "unavailable", "producer-identity-changed", "clock-unavailable"].includes(value.lastResourceError)) performanceInvalid("control.lastResourceError");
  const coverage = performanceConstants(value.coverage, { extensionHost: "not-this-producer", webview: "not-this-producer", childProcesses: "excluded", memory: "process-not-function", cpu: "process-interval" });
  return { ...Object.fromEntries(booleans.map(field => [field, value[field]])),
    ...performanceNumbers(value, ["collectionStartedAtUnixMs", "collectionExpiresAtUnixMs", "collectionStopDelayMs", "profileCooldownRemainingMs"], true),
    ...performanceNumbers(value, ["intervalMs", "resourceSamples", "resourceErrors", "throttledSamples", "counterResets", "sampleOverheadMs", "profileCapturesStarted", "profileCapturesSucceeded", "profileCapturesFailed", "profileRateLimited", "ownedTimerCount", "failedTimerCount"]),
    lastResourceError: value.lastResourceError,
    coverage: { ...coverage, ...performanceNumbers(value.coverage, ["backendPid"], false, true) },
  };
}
function projectForgePerformanceReport(value) {
  const input = requireResponse(value, "Forge performance report", { ok: "boolean", schemaVersion: "string", backend: "object", control: "object", caches: "object", coverage: "object" });
  if (input.ok !== true || input.schemaVersion !== "forge.performance.report.v1") performanceInvalid("report schema/status");
  const cacheFields = ["hits", "misses", "bypasses", "evictions", "entries", "accountedBytes"];
  const cache = requireResponse(input.caches.projectValidation, "validation cache", { lua: "object", effectiveSchema: "object" });
  return performanceOutput({ ok: true, schemaVersion: input.schemaVersion, backend: projectPerformanceSnapshot(input.backend), control: projectPerformanceControl(input.control),
    caches: { projectValidation: { ...performanceNumbers(cache, cacheFields, false, true), lua: performanceNumbers(cache.lua, cacheFields, false, true), effectiveSchema: performanceNumbers(cache.effectiveSchema, cacheFields, false, true) } },
    coverage: performanceConstants(input.coverage, { native: "unavailable-not-wired", webview: "local-current-panel-only", profiling: "backend-only-explicit-control", cacheBytes: "accounted-not-exact-heap", operations: "instrumented-boundaries-only" }),
  });
}
function projectPerformanceProfile(value, maxFunctions) {
  const input = requireResponse(value, "backend CPU profile", { ok: "boolean" });
  if (!input.ok) {
    if (typeof input.code !== "string" || !Object.hasOwn(PERFORMANCE_PROFILE_HTTP_FAILURES, input.code)) performanceInvalid("profile refusal code");
    return { ok: false, code: input.code, error: performanceText(input.error, "profile.error", 512) };
  }
  requireResponse(input, "backend CPU profile", { schemaVersion: "string", producer: "object", functions: "array", omitted: "object", coverage: "object" });
  if (input.schemaVersion !== "forge.cpu-profile.v1") performanceInvalid("profile.schemaVersion");
  const functions = input.functions.slice(0, maxFunctions).map(item => {
    requireResponse(item, "CPU function", { name: "string", module: "string" });
    const module = performanceText(item.module, "function.module");
    if (module !== "(external-or-runtime)" && !/^node:[A-Za-z0-9_./-]+$/.test(module) && !isXmlReferencePath(module)) performanceInvalid("function.module absolute/private path");
    if (!/^[A-Za-z0-9_$ .<>()\[\]:-]{1,128}$/.test(item.name)) performanceInvalid("function.name");
    return { name: performanceText(item.name, "function.name", 128), module,
      ...performanceNumbers(item, ["line", "column", "selfSampleMicros"], true), ...performanceNumbers(item, ["selfSamples"], false, true) };
  });
  const samples = input.coverage.samples;
  if (!["available", "unavailable"].includes(samples)) performanceInvalid("profile.coverage.samples");
  return performanceOutput({ ok: true, schemaVersion: input.schemaVersion, producer: performanceProducer(input.producer),
    ...performanceNumbers(input, ["requestedDurationMs", "samplingIntervalMicros", "scannedSampleCount"]),
    ...performanceNumbers(input, ["observedDurationMs", "delayedStopMs", "profileDurationMicros", "sampleCount"], true), functions,
    omitted: performanceNumbers(input.omitted, ["nodes", "samples", "functions", "unknownNodeSamples", "invalidNodes", "invalidDeltas", "redactedLabels"], false, true),
    coverage: { ...performanceConstants(input.coverage, { process: "current-backend-only", attribution: "sampled-self-time-not-exact-operation-cpu", rawProfile: "not-returned-or-persisted", timer: "event-loop-blockage-can-delay-stop", resourceLimit: "no-os-heap-quota" }), samples },
    projection: { functionCount: input.functions.length, returnedFunctionCount: functions.length, truncated: functions.length < input.functions.length },
  });
}

function requireRuntimeDebuggerResponse(value, label) {
  const payload = requireResponse(value, label, {
    schemaVersion: "number", authority: "object", identity: "object", session: "object",
    incidents: "array", coverage: "object", expectedSteps: "array",
    hiddenOtherModCount: "number", ambiguousCount: "number", hiddenOtherModSummary: "string", verdict: "object",
  });
  const invalid = (field, type) => {
    const error = new Error(`${label} response is missing ${field}:${type}`);
    error.invalidResponse = true;
    throw error;
  };
  if (typeof payload.authority.workspaceId !== "string") invalid("authority.workspaceId", "string");
  if (typeof payload.identity.workspaceId !== "string") invalid("identity.workspaceId", "string");
  if (typeof payload.session.state !== "string") invalid("session.state", "string");
  if (typeof payload.verdict.state !== "string") invalid("verdict.state", "string");
  if (typeof payload.coverage.target !== "number" || !Number.isFinite(payload.coverage.target)) {
    invalid("coverage.target", "number");
  }
  if (typeof payload.coverage.met !== "boolean") invalid("coverage.met", "boolean");
  for (const field of [
    "candidates", "recognized", "explicitUnknown", "silentlyDropped",
    "recognizedOrExplicitUnknown", "dispositionSum",
  ]) {
    if (typeof payload.coverage[field] !== "number" || !Number.isFinite(payload.coverage[field])) {
      invalid(`coverage.${field}`, "number");
    }
  }
  if (typeof payload.coverage.recognizedOrExplicitUnknownRatio !== "number" ||
    !Number.isFinite(payload.coverage.recognizedOrExplicitUnknownRatio)) {
    invalid("coverage.recognizedOrExplicitUnknownRatio", "number");
  }
  if (!isRecord(payload.coverage.dispositionCounts)) invalid("coverage.dispositionCounts", "object");
  for (const field of ["confirmed_active", "ambiguous", "excluded_other_mod", "unknown"]) {
    if (typeof payload.coverage.dispositionCounts[field] !== "number" ||
      !Number.isFinite(payload.coverage.dispositionCounts[field])) {
      invalid(`coverage.dispositionCounts.${field}`, "number");
    }
  }
  return payload;
}

function runtimeText(value, limit = 360) {
  let text = typeof value === "string" ? value : value == null ? "" : String(value);
  const roots = [process.env.USERPROFILE, process.env.HOME]
    .filter((root) => typeof root === "string" && root.trim())
    .map((root) => root.trim())
    .filter((root, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === root.toLowerCase()) === index);
  for (const root of roots) {
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`${escaped}(?=$|[\\\\/])`, "gi"), "%USERPROFILE%");
  }
  text = text.replace(/(?:[A-Za-z]:[\\/]Users[\\/][^\\/]+|[\\/]Users[\\/][^\\/]+|[\\/]home[\\/][^\\/]+|[A-Za-z]:[\\/]Documents and Settings[\\/][^\\/]+)/gi, "%USERPROFILE%");
  const boundedLimit = Math.max(1, Math.floor(limit));
  return text.length <= boundedLimit ? text : `${text.slice(0, Math.max(0, boundedLimit - 1))}…`;
}

function runtimeStringArray(value, count, limit = 280) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === "string")
    .map((item) => runtimeText(item, limit).trim())
    .filter(Boolean)
    .slice(0, count);
}

function runtimeOptionalText(value, limit = 360) {
  if (typeof value !== "string") return undefined;
  const text = runtimeText(value, limit).trim();
  return text || undefined;
}

function runtimeCount(value, limit = RUNTIME_MAX_COUNT) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(limit, Math.max(0, Math.floor(value)));
}

function runtimeLine(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(RUNTIME_MAX_LINE, Math.floor(value)) : undefined;
}

function runtimeRatio(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function projectRuntimeIncident(incident) {
  const attribution = incident?.attribution && typeof incident.attribution === "object" ? incident.attribution : {};
  const mapping = incident?.mapping && typeof incident.mapping === "object" ? incident.mapping : {};
  const disposition = ["confirmed_active", "ambiguous", "excluded_other_mod", "unknown"].includes(attribution.disposition)
    ? attribution.disposition : "unknown";
  const mappingKind = ["node", "file_line", "unmapped"].includes(mapping.kind) ? mapping.kind : "unmapped";
  const nodeId = runtimeOptionalText(mapping.nodeId, 180);
  const nodeLabel = runtimeOptionalText(mapping.nodeLabel, 280);
  const file = runtimeOptionalText(mapping.file, 300);
  const line = runtimeLine(mapping.line);
  const navigationEvidence = disposition === "confirmed_active" && mappingKind === "node" && nodeId
    ? { kind: "md_node", nodeId, ...(nodeLabel ? { nodeLabel } : {}), actionLabel: "OPEN DEEPEST NODE" }
    : disposition === "confirmed_active" && mappingKind === "file_line" && file && line
      ? { kind: "file_line", file, sourceLine: line, nativeLine: Math.max(0, line - 1), actionLabel: "OPEN FILE IN NATIVE EDITOR" }
      : undefined;
  return {
    key: runtimeText(incident?.key, 180),
    count: Math.max(1, runtimeCount(incident?.count)),
    ...(runtimeLine(incident?.firstLine) ? { firstLine: runtimeLine(incident.firstLine) } : {}),
    ...(runtimeLine(incident?.lastLine) ? { lastLine: runtimeLine(incident.lastLine) } : {}),
    ...(runtimeOptionalText(incident?.classification, 180) ? { classification: runtimeOptionalText(incident.classification, 180) } : {}),
    ...(runtimeOptionalText(incident?.severity, 32) ? { severity: runtimeOptionalText(incident.severity, 32) } : {}),
    isEngineFailure: incident?.isEngineFailure === true,
    disposition,
    unresolved: disposition === "ambiguous" || disposition === "unknown",
    attributionReason: runtimeText(attribution.reason, 360),
    evidence: runtimeStringArray(incident?.evidence, RUNTIME_MAX_EVIDENCE_ITEMS),
    explanation: {
      cause: runtimeText(incident?.explanation?.cause, 360),
      impact: runtimeText(incident?.explanation?.impact, 360),
      nextAction: runtimeText(incident?.explanation?.nextAction, 360),
      summary: runtimeText(incident?.explanation?.summary, 360),
      evidenceLabel: runtimeText(incident?.explanation?.evidenceLabel, 280),
    },
    mapping: {
      kind: mappingKind,
      ...(file ? { file } : {}),
      ...(line ? { line } : {}),
      ...(nodeId ? { nodeId } : {}),
      ...(nodeLabel ? { nodeLabel } : {}),
      reason: runtimeText(mapping.reason, 360),
    },
    ...(navigationEvidence ? { navigationEvidence } : {}),
  };
}

function projectRuntimeDebugger(payload) {
  const authority = payload.authority || {};
  const identity = payload.identity || {};
  const session = payload.session || {};
  const verdict = payload.verdict || {};
  const coverage = payload.coverage || {};
  return {
    schemaVersion: runtimeCount(payload.schemaVersion, 1_000),
    authority: {
      workspaceId: runtimeText(authority.workspaceId, 180),
      displayName: runtimeText(authority.displayName, 180),
      ...(runtimeOptionalText(authority.contentId, 180) ? { contentId: runtimeOptionalText(authority.contentId, 180) } : {}),
    },
    identity: {
      workspaceId: runtimeText(identity.workspaceId, 180),
      contentIds: runtimeStringArray(identity.contentIds, RUNTIME_MAX_STRING_ARRAY_ITEMS, 180),
      deployedFolders: runtimeStringArray(identity.deployedFolders, RUNTIME_MAX_STRING_ARRAY_ITEMS, 180),
      ownedFileCount: runtimeCount(identity.ownedFileCount),
      inventoryComplete: identity.inventoryComplete === true,
      inventoryOtherExtensionCount: runtimeCount(identity.inventoryOtherExtensionCount),
      ...(runtimeOptionalText(identity.inventoryScannedAt, 64) ? { inventoryScannedAt: runtimeOptionalText(identity.inventoryScannedAt, 64) } : {}),
    },
    session: {
      state: ["current", "historical", "unavailable"].includes(session.state) ? session.state : "unavailable",
      ...(runtimeOptionalText(session.sessionId, 180) ? { sessionId: runtimeOptionalText(session.sessionId, 180) } : {}),
      ...(typeof session.generation === "number" && Number.isFinite(session.generation) ? { generation: runtimeCount(session.generation) } : {}),
      ...(runtimeLine(session.firstLine) ? { firstLine: runtimeLine(session.firstLine) } : {}),
      ...(runtimeLine(session.lastLine) ? { lastLine: runtimeLine(session.lastLine) } : {}),
      ...(typeof session.newlyReadBytes === "number" && Number.isFinite(session.newlyReadBytes) ? { newlyReadBytes: runtimeCount(session.newlyReadBytes) } : {}),
      ...(runtimeOptionalText(session.resetReason, 280) ? { resetReason: runtimeOptionalText(session.resetReason, 280) } : {}),
      ...(runtimeOptionalText(session.observedAt, 64) ? { observedAt: runtimeOptionalText(session.observedAt, 64) } : {}),
      detail: runtimeText(session.detail, 360),
    },
    verdict: {
      state: runtimeText(verdict.state, 48),
      detail: runtimeText(verdict.detail, 360),
      errorCount: runtimeCount(verdict.errorCount),
      currentSession: verdict.currentSession === true,
      positiveExecutionEvidence: verdict.positiveExecutionEvidence === true,
      coverageMet: verdict.coverageMet === true,
      unresolvedBlocker: verdict.unresolvedBlocker === true,
    },
    coverage: {
      target: runtimeRatio(coverage.target),
      met: coverage.met === true,
      candidates: runtimeCount(coverage.candidates),
      recognized: runtimeCount(coverage.recognized),
      explicitUnknown: runtimeCount(coverage.explicitUnknown),
      silentlyDropped: runtimeCount(coverage.silentlyDropped),
      recognizedOrExplicitUnknown: runtimeCount(coverage.recognizedOrExplicitUnknown),
      recognizedOrExplicitUnknownRatio: runtimeRatio(coverage.recognizedOrExplicitUnknownRatio),
      dispositionCounts: {
        confirmed_active: runtimeCount(coverage.dispositionCounts?.confirmed_active),
        ambiguous: runtimeCount(coverage.dispositionCounts?.ambiguous),
        excluded_other_mod: runtimeCount(coverage.dispositionCounts?.excluded_other_mod),
        unknown: runtimeCount(coverage.dispositionCounts?.unknown),
      },
      dispositionSum: runtimeCount(coverage.dispositionSum),
    },
    expectedSteps: (Array.isArray(payload.expectedSteps) ? payload.expectedSteps : []).slice(0, RUNTIME_MAX_EXPECTED_STEPS).map((step) => ({
      id: runtimeText(step?.id, 180),
      label: runtimeText(step?.label, 280),
      truth: ["observed", "missing", "unavailable"].includes(step?.truth) ? step.truth : "unavailable",
      observed: step?.observed === true,
      success: step?.success === true,
      evidence: runtimeStringArray(step?.evidence, RUNTIME_MAX_EVIDENCE_ITEMS),
    })),
    incidents: (Array.isArray(payload.incidents) ? payload.incidents : []).slice(0, RUNTIME_MAX_INCIDENTS).map(projectRuntimeIncident),
    hiddenOtherModCount: runtimeCount(payload.hiddenOtherModCount),
    ambiguousCount: runtimeCount(payload.ambiguousCount),
    hiddenOtherModSummary: runtimeText(payload.hiddenOtherModSummary, 360),
  };
}

// Native-only input, public DTO and transport lifecycle. Legacy projections above
// keep their existing producer checks, truncation and HTTP behavior.
function nativePerformanceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
function nativePerformanceInput(args, operation) {
  const keys = operation === "start" ? ["expectedBackendInstanceId", "expectedNativeInstanceId", "durationMs", "intervalMs", "eventLoopDelay"]
    : ["expectedBackendInstanceId", "expectedNativeInstanceId", "captureId"];
  const invalid = () => {
    const error = new Error("Native controls require exact current instance IDs, closed fields and protocol-bounded options.");
    error.nativeInputInvalid = true;
    throw error;
  };
  if (!isRecord(args) || Object.keys(args).some(key => !keys.includes(key)) ||
    !nativePerformanceId(args.expectedBackendInstanceId) || !nativePerformanceId(args.expectedNativeInstanceId)) invalid();
  const identity = { expectedBackendInstanceId: args.expectedBackendInstanceId, expectedNativeInstanceId: args.expectedNativeInstanceId };
  if (operation === "stop") {
    if (!nativePerformanceId(args.captureId)) invalid();
    return { ...identity, captureId: args.captureId };
  }
  const durationMs = args.durationMs === undefined ? 60000 : args.durationMs;
  const intervalMs = args.intervalMs === undefined ? 2000 : args.intervalMs;
  const eventLoopDelay = args.eventLoopDelay === undefined ? false : args.eventLoopDelay;
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 900000 ||
    !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000 || typeof eventLoopDelay !== "boolean") invalid();
  return { ...identity, durationMs, intervalMs, eventLoopDelay };
}
function nativeResponseInvalid() {
  const error = new Error("Native performance response was not a valid bounded public report.");
  error.nativeCode = "NATIVE_PERFORMANCE_RESPONSE_INVALID";
  error.invalidResponse = true;
  return error;
}
function nativeRequire(condition) {
  if (!condition) throw nativeResponseInvalid();
}
function nativeExact(value, required, optional = []) {
  return isRecord(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function nativeFinite(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function nativeInteger(value) { return nativeFinite(value) && Number.isSafeInteger(value); }
function nativeNullable(value) { return value === null || nativeFinite(value); }
function nativePublicTree(value, depth = 0, budget = { nodes: 0 }) {
  nativeRequire(++budget.nodes <= 30000 && depth <= 12);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { nativeRequire(Number.isFinite(value)); return; }
  if (typeof value === "string") { nativeRequire(value.length <= 256); return; }
  if (Array.isArray(value)) {
    nativeRequire(value.length <= 128);
    for (const item of value) nativePublicTree(item, depth + 1, budget);
    return;
  }
  nativeRequire(isRecord(value) && Object.keys(value).length <= 48);
  for (const item of Object.values(value)) nativePublicTree(item, depth + 1, budget);
}
function nativeProducer(value) {
  nativeRequire(nativeExact(value, ["component", "scope", "pid", "instanceId"]) && value.component === "extension-host" &&
    value.scope === "shared-process" && nativeInteger(value.pid) && value.pid > 0 && nativePerformanceId(value.instanceId));
}
function nativeStatus(value) {
  nativeRequire(nativeExact(value, ["schemaVersion", "producer", "disposed", "collectionActive", "captureId", "collectionStartedAtUnixMs",
    "collectionExpiresAtUnixMs", "intervalMs", "eventLoopDelayMonitoring", "resourceSamples", "resourceErrors", "throttledSamples",
    "counterResets", "sampleOverheadMs", "lastResourceError", "collectionStopDelayMs", "collectionCleanupUnconfirmed", "ownedTimerCount",
    "failedTimerCount", "lastStopReason"]) && value.schemaVersion === "forge.native-performance.status.v1");
  nativeProducer(value.producer);
  nativeRequire(["disposed", "collectionActive", "eventLoopDelayMonitoring", "collectionCleanupUnconfirmed"].every(key => typeof value[key] === "boolean") &&
    (value.captureId === null || nativePerformanceId(value.captureId)) &&
    ["collectionStartedAtUnixMs", "collectionExpiresAtUnixMs", "collectionStopDelayMs"].every(key => nativeNullable(value[key])) &&
    nativeInteger(value.intervalMs) && value.intervalMs >= 1000 && value.intervalMs <= 60000 &&
    ["resourceSamples", "resourceErrors", "throttledSamples", "counterResets", "ownedTimerCount", "failedTimerCount"].every(key => nativeInteger(value[key])) &&
    value.ownedTimerCount <= 16 && value.failedTimerCount <= 16 && nativeFinite(value.sampleOverheadMs) &&
    [null, "unavailable", "producer-identity-changed", "clock-unavailable"].includes(value.lastResourceError) &&
    [null, "requested", "expired", "cancelled", "retired", "disposed"].includes(value.lastStopReason) &&
    (!value.collectionActive || value.captureId !== null && !value.disposed));
}
function nativeSnapshot(value) {
  nativeRequire(nativeExact(value, ["schemaVersion", "producer", "enabled", "disposed", "startedAtUnixMs", "capturedAtUnixMs", "operations",
    "recentSlowOperations", "resources", "drops", "limits", "selfOverhead", "coverage"]) && value.schemaVersion === "forge.performance.v1");
  nativeProducer(value.producer);
  nativeRequire(typeof value.enabled === "boolean" && typeof value.disposed === "boolean" && nativeNullable(value.startedAtUnixMs) &&
    nativeNullable(value.capturedAtUnixMs) && Array.isArray(value.operations) && value.operations.length <= 128 &&
    Array.isArray(value.recentSlowOperations) && value.recentSlowOperations.length <= 64 && Array.isArray(value.resources) && value.resources.length <= 120);
  const names = new Set(), outcomes = ["ok", "error", "cancelled", "aborted", "superseded"];
  for (const row of value.operations) {
    nativeRequire(nativeExact(row, ["name", "count", "outcomes", "totalMs", "minMs", "maxMs", "meanMs", "p50Ms", "p95Ms", "p99Ms", "quantileMethod", "histogram"]) &&
      NATIVE_PERFORMANCE_OPERATION_NAMES.has(row.name) && !names.has(row.name) && nativeInteger(row.count) && row.count > 0 &&
      ["totalMs", "minMs", "maxMs", "meanMs"].every(key => nativeFinite(row[key])) && ["p50Ms", "p95Ms", "p99Ms"].every(key => nativeNullable(row[key])) &&
      row.quantileMethod === "fixed-histogram-upper-bound" && nativeExact(row.outcomes, outcomes) && outcomes.every(key => nativeInteger(row.outcomes[key])) &&
      outcomes.reduce((sum, key) => sum + row.outcomes[key], 0) === row.count && nativeExact(row.histogram, ["upperBoundsMs", "counts"]) &&
      Array.isArray(row.histogram.upperBoundsMs) && Array.isArray(row.histogram.counts) &&
      row.histogram.upperBoundsMs.length === NATIVE_PERFORMANCE_HISTOGRAM_MS.length && row.histogram.counts.length === NATIVE_PERFORMANCE_HISTOGRAM_MS.length &&
      row.histogram.upperBoundsMs.every((bound, index) => bound === NATIVE_PERFORMANCE_HISTOGRAM_MS[index]) && row.histogram.counts.every(nativeInteger) &&
      row.histogram.counts.reduce((sum, count) => sum + count, 0) === row.count);
    names.add(row.name);
  }
  for (const row of value.recentSlowOperations) nativeRequire(nativeExact(row, ["name", "durationMs", "outcome", "atUnixMs"]) &&
    NATIVE_PERFORMANCE_OPERATION_NAMES.has(row.name) && nativeFinite(row.durationMs) && outcomes.includes(row.outcome) && nativeNullable(row.atUnixMs));
  for (const row of value.resources) nativeRequire(nativeExact(row, PERFORMANCE_RESOURCE_FIELDS) && PERFORMANCE_RESOURCE_FIELDS.every(key => nativeNullable(row[key])) &&
    ["fps", "frameIntervalMs", "longTaskDurationMs", "jsHeapUsedBytes"].every(key => row[key] === null));
  const dropFields = ["disabled", "disposed", "invalidOperations", "invalidResources", "operationCapacity", "slowOverwrites", "resourceOverwrites", "duplicateFinishes", "recorderErrors", "snapshotOmissions", "staleFinishes"];
  nativeRequire(nativeExact(value.drops, dropFields) && dropFields.every(key => nativeInteger(value.drops[key])));
  const limits = { maxOperations: 128, maxSlowOperations: 64, maxResources: 120, maxSnapshotBytes: 1048576, maxNameChars: 160, maxCorrelationChars: 80 };
  nativeRequire(nativeExact(value.limits, [...Object.keys(limits), "slowOperationMs"]) && Object.entries(limits).every(([key, maximum]) =>
    nativeInteger(value.limits[key]) && value.limits[key] >= 1 && value.limits[key] <= maximum) && nativeFinite(value.limits.slowOperationMs) &&
    value.limits.slowOperationMs <= 86400000 && value.operations.length <= value.limits.maxOperations &&
    value.recentSlowOperations.length <= value.limits.maxSlowOperations && value.resources.length <= value.limits.maxResources &&
    Buffer.byteLength(JSON.stringify(value), "utf8") <= value.limits.maxSnapshotBytes);
  nativeRequire(nativeExact(value.selfOverhead, ["recordCalls", "recordMs", "snapshotCalls", "snapshotMs", "clockFailures", "snapshotScope"]) &&
    ["recordCalls", "snapshotCalls", "clockFailures"].every(key => nativeInteger(value.selfOverhead[key])) && nativeNullable(value.selfOverhead.recordMs) &&
    nativeNullable(value.selfOverhead.snapshotMs) && value.selfOverhead.snapshotScope === "completed-prior-snapshots-including-serialization-and-freeze");
  const coverage = { operations: "instrumented-boundaries-only", cpuAttribution: "process-interval-not-exclusive-operation",
    memoryAttribution: "process-or-host-estimates-not-function-allocations", quantiles: "histogram-estimates", resourceFields: "null-means-unavailable-or-unsampled",
    functionProfiles: "separate-bounded-producer", limitsAre: "retained-state-not-os-quota" };
  nativeRequire(nativeExact(value.coverage, Object.keys(coverage)) && Object.entries(coverage).every(([key, expected]) => value.coverage[key] === expected));
}
function projectNativePerformanceReport(response, operation, expected) {
  nativeRequire(nativeExact(response, ["nativeHttpStatus", "nativePayload"]));
  const value = response.nativePayload;
  nativePublicTree(value);
  nativeRequire(nativeExact(value, ["schemaVersion", "operation", "ok", "availability", "unavailableReason", "ownership", "status"], ["code"]) &&
    value.schemaVersion === "forge.native-performance.report.v1" && value.operation === operation && typeof value.ok === "boolean" &&
    ["unavailable", "waiting", "ready", "retired"].includes(value.availability) &&
    [null, "transport-absent", "contract-invalid", "waiting", "ready-timeout", "producer-disposed", "retired", "authority-revoked"].includes(value.unavailableReason) &&
    ["none", "self", "other", "operator"].includes(value.ownership));
  nativeRequire(value.ok ? response.nativeHttpStatus === 200 && !Object.hasOwn(value, "code")
    : typeof value.code === "string" && Object.hasOwn(NATIVE_PERFORMANCE_HTTP_FAILURES, value.code) &&
      NATIVE_PERFORMANCE_HTTP_FAILURES[value.code] === response.nativeHttpStatus);
  if (value.status === null) {
    nativeRequire(value.availability === "unavailable" && value.ownership === "none" && (!value.ok || operation === "read"));
    return value;
  }
  const status = value.status;
  nativeRequire(nativeExact(status, ["schemaVersion", "backendInstanceId", "availability", "unavailableReason", "native", "pending", "cancellation",
    "cleanupUnconfirmed", "orphaned", "captureOwned", "readSubscribers", "snapshot", "snapshotAgeMs", "lastRefreshOutcome", "rejectedMessages",
    "lateResults", "droppedSnapshots", "timerCleanupUnconfirmed"]) && status.schemaVersion === "forge.native-performance.broker.v1" &&
    nativePerformanceId(status.backendInstanceId) && status.availability === value.availability && status.unavailableReason === value.unavailableReason &&
    [null, "read", "start", "stop"].includes(status.pending) && ["none", "pending", "unknown"].includes(status.cancellation) &&
    ["cleanupUnconfirmed", "orphaned", "captureOwned", "timerCleanupUnconfirmed"].every(key => typeof status[key] === "boolean") &&
    ["readSubscribers", "rejectedMessages", "lateResults", "droppedSnapshots"].every(key => nativeInteger(status[key])) &&
    status.readSubscribers <= 16 && nativeNullable(status.snapshotAgeMs) &&
    ["never", "pending", "ok", "timeout", "aborted", "preempted", "rejected", "invalidated", "retired"].includes(status.lastRefreshOutcome));
  if (status.native !== null) nativeStatus(status.native);
  if (status.availability === "ready") nativeRequire(status.native !== null && !status.native.disposed);
  if (operation !== "read") nativeRequire(status.snapshot === null && status.snapshotAgeMs === null);
  if (!value.ok && ["NATIVE_PERFORMANCE_AUTHORITY_REVOKED", "NATIVE_PERFORMANCE_NOT_OWNER"].includes(value.code)) nativeRequire(status.snapshot === null);
  if (status.snapshot !== null) {
    nativeRequire(operation === "read" && status.native !== null);
    nativeSnapshot(status.snapshot);
    nativeRequire(["component", "scope", "pid", "instanceId"].every(key => status.snapshot.producer[key] === status.native.producer[key]));
  }
  if (value.ok && operation !== "read") {
    nativeRequire(expected && status.native !== null && status.availability === "ready" &&
      status.backendInstanceId === expected.expectedBackendInstanceId && status.native.producer.instanceId === expected.expectedNativeInstanceId &&
      !status.native.disposed && !status.cleanupUnconfirmed && !status.timerCleanupUnconfirmed && !status.native.collectionCleanupUnconfirmed);
    nativeRequire(operation === "start" ? status.native.collectionActive && nativePerformanceId(status.native.captureId)
      : !status.native.collectionActive && (status.native.captureId === null || status.native.captureId === expected.captureId) &&
        status.native.ownedTimerCount === 0 && status.native.failedTimerCount === 0 && status.native.eventLoopDelayMonitoring === false);
  }
  return value;
}
async function readNativeJson(response, signal, maximum) {
  let reader;
  try {
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maximum)) throw nativeResponseInvalid();
    nativeRequire(response.body !== null);
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      if (signal?.aborted) throw nativeResponseInvalid();
      const next = await reader.read();
      if (signal?.aborted) throw nativeResponseInvalid();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) throw nativeResponseInvalid();
      if (next.value.byteLength) chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes)));
  } catch {
    try { await reader?.cancel(); } catch { /* Owned transport refusal, never a cleanup ACK. */ }
    if (!reader) try { await response.body?.cancel(); } catch { /* Preserve the fixed public failure. */ }
    throw nativeResponseInvalid();
  } finally {
    try { reader?.releaseLock(); } catch { /* No native execution claim follows this local reader cleanup. */ }
  }
}
function nativePerformanceRoute(method, apiPath) {
  return method === "GET" && apiPath === "/api/agent/performance/native" ||
    method === "POST" && (apiPath === "/api/agent/performance/native/collection" || apiPath === "/api/agent/performance/native/stop");
}
function nativeGrantAllowed(capability, authority) {
  return NATIVE_PERFORMANCE_CAPABILITIES.has(capability.id) && capability.version === 1 && isRecord(authority?.constraint) &&
    capability.access.agentScopes.includes(authority.actor.scope) &&
    authority.constraint.capabilityIdentities.includes(`${capability.id}@1`) &&
    capability.effects.every(effect => authority.constraint.allowedEffects.includes(effect));
}
function nativeRequestOwned(request) {
  if (!request || !request.active || nativeTransportDisposed || nativeRequests.get(request.id) !== request) return false;
  if (nativePerformanceClock.now() >= request.deadline) {
    expireNativeRequest(request);
    return false;
  }
  return true;
}
function retireNativeRequest(request, abort = false) {
  if (!request || nativeRequests.get(request.id) !== request) return;
  request.active = false;
  nativeRequests.delete(request.id);
  clearTimeout(request.timer);
  if (abort) request.controller.abort();
}
function nativeToolError(id, code) {
  const error = code === "NATIVE_PERFORMANCE_TRANSPORT_TIMEOUT" ? "Native control deadline exceeded; outcome unknown."
    : code === "NATIVE_PERFORMANCE_REQUEST_LIMIT" ? "Native request admission refused; active request ownership was preserved."
      : "Native response was unavailable or invalid; no native execution or cleanup result is claimed.";
  return reply(id, { content: [{ type: "text", text: JSON.stringify({ ok: false, code, error,
    ...(code === "NATIVE_PERFORMANCE_TRANSPORT_TIMEOUT" ? { outcome: "unknown" } : {}) }, null, 2) }], isError: true });
}
function expireNativeRequest(request) {
  if (!request || !request.active || nativeTransportDisposed || nativeRequests.get(request.id) !== request) return;
  retireNativeRequest(request, true);
  nativeToolError(request.id, "NATIVE_PERFORMANCE_TRANSPORT_TIMEOUT");
}
function beginNativeRequest(id) {
  if (nativeTransportDisposed) return undefined;
  if (!(typeof id === "string" && id.length >= 1 && id.length <= 128 || typeof id === "number" && Number.isSafeInteger(id))) {
    replyError(null, -32600, "Native tools require a bounded string or integer request ID.");
    return undefined;
  }
  if (nativeRequests.has(id) || nativeRequests.size >= NATIVE_PERFORMANCE_REQUEST_LIMIT) {
    nativeToolError(id, "NATIVE_PERFORMANCE_REQUEST_LIMIT");
    return undefined;
  }
  const request = { id, active: true, controller: new AbortController(), timer: undefined,
    deadline: nativePerformanceClock.now() + NATIVE_PERFORMANCE_REQUEST_MS };
  nativeRequests.set(id, request);
  request.timer = setTimeout(() => expireNativeRequest(request), NATIVE_PERFORMANCE_REQUEST_MS);
  return request;
}
function cancelNativeRequest(params) {
  if (!isRecord(params) || !(typeof params.requestId === "string" || typeof params.requestId === "number") ||
    params.reason !== undefined && typeof params.reason !== "string") return;
  const request = nativeRequests.get(params.requestId);
  if (request) retireNativeRequest(request, true);
}
function disposeNativeTransport() {
  nativeTransportDisposed = true;
  discoveryController?.abort();
  for (const request of nativeRequests.values()) retireNativeRequest(request, true);
}

async function forgeValidation(context, body) {
  if (usesStaticCompatibilityRoutes(context)) {
    return requireResponse(await forge("POST", "/api/agent/project/validate", body), "project validation", {
      ok: "boolean", summary: "object", flat: "array", capsules: "array", source: "object",
    });
  }
  return requireResponse(await forge("POST", "/api/agent/project/validate/check", body), "project validation", {
    ok: "boolean", summary: "object", flat: "array", capsules: "array", source: "object",
  });
}

function usesStaticCompatibilityRoutes(context) {
  return String(context?.contractState || "").endsWith("-static-fallback");
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value, allowed) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && (!allowed || allowed.has(item)));
}

function hasUniqueStrings(values) {
  return new Set(values).size === values.length;
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isLiteralForgeApiPath(value) {
  if (typeof value !== "string" || !/^\/api(?:\/(?:[A-Za-z0-9._~-]+|:[A-Za-z_][A-Za-z0-9_]*))+$/.test(value)) return false;
  return value.split("/").slice(2).every((segment) => segment !== "." && segment !== "..");
}

function jsonValueMatchesSchema(schema, value, depth = 0) {
  if (depth > 24) return false;
  if (schema.anyOf?.length && !schema.anyOf.some((candidate) => jsonValueMatchesSchema(candidate, value, depth + 1))) return false;
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) return false;
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matchesType = (type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return isRecord(value);
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  };
  if (types.length && !types.some(matchesType)) return false;
  if (isRecord(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return false;
    for (const [key, child] of Object.entries(value)) {
      const properties = schema.properties;
      const childSchema = properties && Object.hasOwn(properties, key) ? properties[key] : undefined;
      if (childSchema !== undefined) {
        if (!jsonValueMatchesSchema(childSchema, child, depth + 1)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object" &&
        !jsonValueMatchesSchema(schema.additionalProperties, child, depth + 1)) return false;
    }
  }
  if (Array.isArray(value) && schema.items && !value.every((child) => jsonValueMatchesSchema(schema.items, child, depth + 1))) return false;
  return true;
}

const JSON_SCHEMA_TYPES = new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);
const CONTEXT_REQUIREMENTS = new Set(["none", "optional", "required"]);
const AGENT_SCOPES = new Set(["read", "write", "deploy"]);
const CAPABILITY_EFFECTS = new Set([
  "read", "analyze", "audit-write", "audit-retention-delete", "workspace-write", "filesystem-write", "package", "deploy", "delete",
  "network", "spend", "credential", "publish",
]);
const CONFIRMATION_POLICIES = new Set(["none", "preview-required", "human-only"]);
const API_INPUT_LOCATIONS = new Set(["none", "query", "body", "path", "path-and-query"]);
const API_BINDING_ROLES = new Set(["primary", "supporting"]);
const SURFACE_STATUSES = new Set(["connected", "partial", "disconnected"]);

function isJsonSchema(value, depth = 0) {
  if (!isRecord(value) || depth > 24) return false;
  if (value.type !== undefined) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!isStringArray(types, JSON_SCHEMA_TYPES) || types.length === 0 || !hasUniqueStrings(types)) return false;
  }
  if (value.description !== undefined && typeof value.description !== "string") return false;
  if (value.properties !== undefined) {
    if (!isRecord(value.properties) || !Object.values(value.properties).every((schema) => isJsonSchema(schema, depth + 1))) return false;
  }
  if (value.required !== undefined) {
    if (!isStringArray(value.required) || !hasUniqueStrings(value.required)) return false;
    if (value.properties !== undefined && (!isRecord(value.properties) || !value.required.every((key) => Object.hasOwn(value.properties, key)))) return false;
  }
  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== "boolean" &&
    !isJsonSchema(value.additionalProperties, depth + 1)) return false;
  if (value.items !== undefined && !isJsonSchema(value.items, depth + 1)) return false;
  if (value.enum !== undefined && !Array.isArray(value.enum)) return false;
  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf) || value.anyOf.length === 0 || !value.anyOf.every((schema) => isJsonSchema(schema, depth + 1))) return false;
  }
  return true;
}

function isApiBinding(value) {
  return isRecord(value) && ["GET", "POST"].includes(value.method) && isLiteralForgeApiPath(value.path) &&
    API_INPUT_LOCATIONS.has(value.inputLocation) &&
    API_BINDING_ROLES.has(value.role) &&
    (value.fixedBody === undefined || (isRecord(value.fixedBody) && value.inputLocation === "body"));
}

function schemaDeclaresCallerInput(schema) {
  if (Object.keys(schema.properties || {}).length > 0 || (schema.required?.length || 0) > 0 ||
    schema.additionalProperties === true || (schema.additionalProperties !== undefined && typeof schema.additionalProperties === "object")) return true;
  return schema.anyOf?.some((branch) => schemaDeclaresCallerInput(branch)) === true;
}

function isSurfaceProjection(value) {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !SURFACE_STATUSES.has(value.status)) return false;
  if (value.anchor !== undefined && typeof value.anchor !== "string") return false;
  if (value.note !== undefined && typeof value.note !== "string") return false;
  if (["connected", "partial"].includes(value.status)) {
    if (!isNonEmptyString(value.anchor) || !value.anchor.includes("::")) return false;
  } else if (value.anchor !== undefined) return false;
  if (["partial", "disconnected"].includes(value.status) && !isNonEmptyString(value.note)) return false;
  return true;
}

function isCapabilityDescriptorV1(capability) {
  if (!isRecord(capability) || !isNonEmptyString(capability.id) ||
    !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(capability.id) ||
    !Number.isInteger(capability.version) || capability.version < 1 ||
    !isNonEmptyString(capability.title) || !isNonEmptyString(capability.description) ||
    !isJsonSchema(capability.inputSchema) || capability.inputSchema.type !== "object" ||
    !isJsonSchema(capability.outputSchema) || capability.outputSchema.type !== "object" ||
    !isRecord(capability.outputSchema.properties) || !Array.isArray(capability.outputSchema.required) ||
    capability.outputSchema.required.length === 0 ||
    !isRecord(capability.context) || !CONTEXT_REQUIREMENTS.has(capability.context.workspace) ||
    !CONTEXT_REQUIREMENTS.has(capability.context.profile) ||
    !isRecord(capability.access) || typeof capability.access.public !== "boolean" ||
    capability.access.studioSession !== true || !isStringArray(capability.access.agentScopes, AGENT_SCOPES) ||
    !hasUniqueStrings(capability.access.agentScopes) ||
    !isStringArray(capability.effects, CAPABILITY_EFFECTS) || capability.effects.length === 0 ||
    !hasUniqueStrings(capability.effects) || !CONFIRMATION_POLICIES.has(capability.confirmation) ||
    !Array.isArray(capability.apiBindings) || capability.apiBindings.length === 0 ||
    !capability.apiBindings.every(isApiBinding) || !isRecord(capability.surfaces) ||
    capability.surfaces.agentApi !== true) return false;
  if (capability.access.public && !capability.access.agentScopes.includes("read")) return false;
  const primaryBindings = capability.apiBindings.filter((binding) => binding.role === "primary");
  if (primaryBindings.length !== 1) return false;
  const declaresCallerInput = schemaDeclaresCallerInput(capability.inputSchema);
  if ((primaryBindings[0].inputLocation === "none") === declaresCallerInput) return false;
  const bindingKeys = capability.apiBindings.map((binding) => `${binding.method} ${binding.path}`);
  if (!hasUniqueStrings(bindingKeys)) return false;
  for (const binding of capability.apiBindings) {
    for (const [key, fixedValue] of Object.entries(binding.fixedBody || {})) {
      const property = capability.inputSchema.properties?.[key];
      if (!property || !jsonValueMatchesSchema(property, fixedValue)) return false;
    }
  }
  for (const surface of ["ui", "cli", "mcp", "builtInHarness", "externalAgents"]) {
    const projections = capability.surfaces[surface];
    if (!Array.isArray(projections) || !projections.every(isSurfaceProjection) ||
      !hasUniqueStrings(projections.map((projection) => projection.id))) return false;
  }
  return true;
}

function validateLiveContract(contract) {
  if (
    !isRecord(contract) ||
    !hasExactKeys(contract, ["capabilities", "contractHash", "schemaVersion"]) ||
    contract.schemaVersion !== "forge.capability.v1" ||
    !/^[a-f0-9]{64}$/i.test(String(contract.contractHash || "")) ||
    !Array.isArray(contract.capabilities)
  ) return false;
  const identities = new Set();
  const stableIds = new Set();
  const bindings = new Set();
  const mcpAliases = new Set();
  for (const capability of contract.capabilities) {
    if (!isCapabilityDescriptorV1(capability)) return false;
    const identity = `${capability.id}@${capability.version}`;
    if (identities.has(identity) || stableIds.has(capability.id)) return false;
    identities.add(identity);
    stableIds.add(capability.id);
    for (const binding of capability.apiBindings) {
      const key = `${binding.method} ${binding.path}`;
      if (bindings.has(key)) return false;
      bindings.add(key);
    }
    for (const projection of capability.surfaces.mcp) {
      if (mcpAliases.has(projection.id)) return false;
      mcpAliases.add(projection.id);
    }
  }
  const sortedIds = [...stableIds].sort();
  if (contract.capabilities.some((capability, index) => capability.id !== sortedIds[index])) return false;
  const payload = stableStringify({ schemaVersion: contract.schemaVersion, capabilities: contract.capabilities });
  const expected = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return expected === String(contract.contractHash).toLowerCase();
}

function authoredNavigationGrantAllowed(capability, authority) {
  const grant = authority.constraint;
  return capability.version === 1 && isRecord(grant)
    && grant.capabilityIdentities.includes(capability.id + "@1")
    && grant.allowedEffects.includes("read") && grant.allowedEffects.includes("analyze");
}

function configurationGrantAllowed(capability, authority) {
  const grant = authority.constraint;
  return capability.version === 1 && isRecord(grant)
    && grant.capabilityIdentities.includes(capability.id + "@1")
    && capability.effects.every((effect) => grant.allowedEffects.includes(effect));
}

function deployGrantAllowed(capability, authority) {
  const grant = authority.constraint;
  return capability.version === 1 && isRecord(grant)
    && grant.capabilityIdentities.includes(capability.id + "@1")
    && capability.effects.every((effect) => grant.allowedEffects.includes(effect));
}

function workspaceFilesGrantAllowed(capability, authority) {
  const grant = authority.constraint;
  const expectedVersion = capability.id === "history.revert" || capability.id === "files.write" || capability.id === "files.restore" || capability.id === "workspace.domain.write" ? 2 : 1;
  return capability.version === expectedVersion && isRecord(grant)
    && grant.capabilityIdentities.includes(`${capability.id}@${expectedVersion}`)
    && capability.effects.every((effect) => grant.allowedEffects.includes(effect));
}

function validateEffectiveAuthority(authority, canonicalContract) {
  if (!isRecord(authority) || !hasExactKeys(authority, [
    "actor", "api_version", "authority_hash", "authority_schema_version", "capability_contract",
    "constraint", "exclusions", "route_policy",
  ]) || authority.api_version !== EFFECTIVE_AUTHORITY_API_VERSION ||
    authority.authority_schema_version !== EFFECTIVE_AUTHORITY_SCHEMA_VERSION ||
    !/^[a-f0-9]{64}$/i.test(String(authority.authority_hash || "")) ||
    !isRecord(authority.actor) || !hasExactKeys(authority.actor, ["keyId", "kind", "label", "scope", "workspaceId"]) ||
    authority.actor.kind !== "agent" || !isNonEmptyString(authority.actor.keyId) ||
    !isNonEmptyString(authority.actor.label) || !AGENT_SCOPES.has(authority.actor.scope) ||
    !isNonEmptyString(authority.actor.workspaceId) || authority.actor.workspaceId !== WORKSPACE_ID ||
    !isRecord(authority.route_policy) || !hasExactKeys(authority.route_policy, ["hash", "version"]) ||
    authority.route_policy.version !== ROUTE_AUTHORITY_VERSION ||
    !/^[a-f0-9]{64}$/i.test(String(authority.route_policy.hash || "")) ||
    !validateLiveContract(authority.capability_contract) || !Array.isArray(authority.exclusions)) return false;

  const constraint = authority.constraint;
  if (constraint !== null && (!isRecord(constraint) ||
    !hasExactKeys(constraint, ["allowedEffects", "capabilityIdentities"]) ||
    !isStringArray(constraint.capabilityIdentities) || !hasUniqueStrings(constraint.capabilityIdentities) ||
    !isStringArray(constraint.allowedEffects, CAPABILITY_EFFECTS) || !hasUniqueStrings(constraint.allowedEffects) ||
    stableStringify(constraint.capabilityIdentities) !== stableStringify([...constraint.capabilityIdentities].sort()))) return false;

  const canonicalByIdentity = new Map(canonicalContract.capabilities.map((capability) => [
    `${capability.id}@${capability.version}`, capability,
  ]));
  const effectiveByIdentity = new Map();
  for (const capability of authority.capability_contract.capabilities) {
    const identity = `${capability.id}@${capability.version}`;
    const canonical = canonicalByIdentity.get(identity);
    if (!canonical || stableStringify(canonical) !== stableStringify(capability)) return false;
    effectiveByIdentity.set(identity, capability);
  }

  const allowedEffects = new Set(constraint?.allowedEffects || []);
  const selectedIdentities = new Set(constraint?.capabilityIdentities || []);
  for (const identity of selectedIdentities) {
    const selected = canonicalByIdentity.get(identity);
    if (!selected || selected.access.public || !selected.access.agentScopes.includes(authority.actor.scope)) return false;
  }
  const expectedEffective = canonicalContract.capabilities.filter((capability) => {
    if (!capability.access.agentScopes.includes(authority.actor.scope)) return false;
    if (NATIVE_PERFORMANCE_CAPABILITIES.has(capability.id)) return nativeGrantAllowed(capability, authority);
    if (AUTHORED_NAVIGATION_CAPABILITIES.has(capability.id)) return authoredNavigationGrantAllowed(capability, authority);
    if (CONFIGURATION_CAPABILITIES.has(capability.id)) return configurationGrantAllowed(capability, authority);
    if (DEPLOY_CAPABILITIES.has(capability.id)) return deployGrantAllowed(capability, authority);
    if (WORKSPACE_FILES_CAPABILITIES.has(capability.id)) return workspaceFilesGrantAllowed(capability, authority);
    if (capability.access.public || constraint === null) return true;
    const identity = `${capability.id}@${capability.version}`;
    return selectedIdentities.has(identity) && capability.effects.every((effect) => allowedEffects.has(effect));
  }).map((capability) => `${capability.id}@${capability.version}`);
  if (stableStringify([...effectiveByIdentity.keys()]) !== stableStringify(expectedEffective)) return false;

  const exclusions = new Map();
  for (const exclusion of authority.exclusions) {
    if (!isRecord(exclusion) || !isNonEmptyString(exclusion.capabilityIdentity) ||
      !["CAPABILITY_ROUTE_UNREVIEWED", "CAPABILITY_OWNER_MISMATCH", "CAPABILITY_SCOPE_DENIED",
        "CAPABILITY_WORKSPACE_REQUIRED", "CAPABILITY_NOT_GRANTED", "CAPABILITY_EFFECT_DENIED"].includes(exclusion.code) ||
      (exclusion.disallowedEffects !== undefined &&
        (!isStringArray(exclusion.disallowedEffects, CAPABILITY_EFFECTS) || !hasUniqueStrings(exclusion.disallowedEffects))) ||
      !hasExactKeys(exclusion, exclusion.disallowedEffects === undefined
        ? ["capabilityIdentity", "code"]
        : ["capabilityIdentity", "code", "disallowedEffects"]) ||
      exclusions.has(exclusion.capabilityIdentity) || !canonicalByIdentity.has(exclusion.capabilityIdentity)) return false;
    exclusions.set(exclusion.capabilityIdentity, exclusion);
  }
  const expectedExcluded = [...canonicalByIdentity.keys()].filter((identity) => !effectiveByIdentity.has(identity));
  if (stableStringify([...exclusions.keys()]) !== stableStringify(expectedExcluded)) return false;

  const unsigned = { ...authority };
  delete unsigned.authority_hash;
  const expectedHash = crypto.createHash("sha256").update(stableStringify(unsigned), "utf8").digest("hex");
  return expectedHash === String(authority.authority_hash).toLowerCase();
}

let discoveryInFlight;
let discoveryController;
let stickyLiveToolNames = null;
let lastValidContract = null;
let lastValidAuthority = null;
let blockedUntilValidContract = false;
let reviewedLegacyConfirmed = false;
let clientInitialized = false;
let recoveryTimer = null;
let lastAdvertisedToolSignature = null;
const REVIEWED_LEGACY_SCHEMA_API_VERSIONS = new Set([
  "2026-06-10.agent.v2",
  "legacy.agent.v0",
]);

async function loadCapabilityContract(nativeRequest) {
  if (!nativeRequest && discoveryInFlight) return discoveryInFlight;
  const current = (async () => {
    const controller = nativeRequest ? nativeRequest.controller : new AbortController();
    if (!nativeRequest) discoveryController = controller;
    const timeout = nativeRequest ? undefined : setTimeout(() => controller.abort(), CAPABILITY_DISCOVERY_TIMEOUT_MS);
    try {
      if (!KEY || !WORKSPACE_ID) return { state: "invalid" };
      const schema = await forge("GET", "/api/agent/schema", undefined, controller.signal, !!nativeRequest);
      if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { state: "invalid" };
      if (!("capability_contract" in schema)) {
        if (!REVIEWED_LEGACY_SCHEMA_API_VERSIONS.has(schema.api_version)) return { state: "invalid" };
        try {
          await forge("GET", "/api/agent/capabilities/effective", undefined, controller.signal, !!nativeRequest);
          return { state: "invalid" };
        } catch (error) {
          return Number(error?.status || 0) === 404 ? { state: "legacy" } : { state: "invalid" };
        }
      }
      const canonicalContract = schema.capability_contract;
      if (!validateLiveContract(canonicalContract)) return { state: "invalid" };
      const authority = await forge("GET", "/api/agent/capabilities/effective", undefined, controller.signal, !!nativeRequest);
      return validateEffectiveAuthority(authority, canonicalContract)
        ? { state: "live", contract: authority.capability_contract, authority }
        : { state: "invalid" };
    } catch (error) {
      if (nativeRequest && controller.signal.aborted) throw error;
      const status = Number(error?.status || 0);
      return error?.invalidResponse || (status >= 400 && status < 500) ? { state: "invalid" } : { state: "unavailable" };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (!nativeRequest && discoveryController === controller) discoveryController = undefined;
    }
  })();
  // Native callers own discovery cancellation individually; cancelling one must
  // not abort a legacy/shared discovery waiter or leave a later control queued.
  if (nativeRequest) return current;
  discoveryInFlight = current;
  try {
    return await current;
  } finally {
    if (discoveryInFlight === current) discoveryInFlight = undefined;
  }
}

async function availableTools(nativeRequest) {
  const discovery = await loadCapabilityContract(nativeRequest);
  if (nativeRequest && !nativeRequestOwned(nativeRequest)) throw nativeResponseInvalid();
  if (discovery.state === "invalid") {
    blockedUntilValidContract = true;
    reviewedLegacyConfirmed = false;
    return { discovery, toolNames: [], effectiveContract: null, contractState: "invalid" };
  }
  if (discovery.state === "live") {
    blockedUntilValidContract = false;
    reviewedLegacyConfirmed = false;
    lastValidContract = discovery.contract;
    lastValidAuthority = discovery.authority;
    const advertised = new Map(discovery.contract.capabilities.map((capability) => [`${capability.id}@${capability.version}`, capability]));
    const supportedNow = new Set();
    for (let toolIndex = 0; toolIndex < TOOLS.length; toolIndex += 1) {
      const capability = advertised.get(`${TOOLS[toolIndex].capabilityId}@${TOOLS[toolIndex].capabilityVersion}`);
      const projection = capability?.surfaces?.mcp?.find((candidate) => candidate.id === TOOLS[toolIndex].name);
      if (NATIVE_PERFORMANCE_LIVE_TOOLS.has(TOOLS[toolIndex].name) && (!capability || !nativeGrantAllowed(capability, discovery.authority))) continue;
      if (AUTHORED_NAVIGATION_TOOLS.has(TOOLS[toolIndex].name) && (!capability || !authoredNavigationGrantAllowed(capability, discovery.authority))) continue;
      if (CONFIGURATION_TOOLS.has(TOOLS[toolIndex].name) && (!capability || !configurationGrantAllowed(capability, discovery.authority))) continue;
      if (DEPLOY_TOOLS.has(TOOLS[toolIndex].name) && (!capability || !deployGrantAllowed(capability, discovery.authority))) continue;
      if (WORKSPACE_FILES_TOOLS.has(TOOLS[toolIndex].name) && (!capability || !workspaceFilesGrantAllowed(capability, discovery.authority))) continue;
      if (projection && projection.status !== "disconnected") supportedNow.add(TOOLS[toolIndex].name);
    }
    stickyLiveToolNames = stickyLiveToolNames === null
      ? supportedNow
      : new Set([...stickyLiveToolNames].filter((name) => supportedNow.has(name)));
    return {
      discovery,
      toolNames: [...stickyLiveToolNames],
      effectiveContract: discovery.contract,
      effectiveAuthority: discovery.authority,
      contractState: discovery.contract.schemaVersion,
    };
  }
  if (blockedUntilValidContract) {
    return { discovery, toolNames: [], effectiveContract: null, contractState: `${discovery.state}-blocked-invalid` };
  }
  if (stickyLiveToolNames !== null) {
    return {
      discovery,
      toolNames: [...stickyLiveToolNames].filter(name => !["check_expression", "inspect_expression", "get_xml_references", "lookup_text"].includes(name) && !AUTHORED_NAVIGATION_TOOLS.has(name) && !CONFIGURATION_TOOLS.has(name) && !DEPLOY_TOOLS.has(name) && !WORKSPACE_FILES_TOOLS.has(name) && !PERFORMANCE_LIVE_TOOLS.has(name) && !DIAGNOSTIC_READ_LIVE_TOOLS.has(name) && !NATIVE_PERFORMANCE_LIVE_TOOLS.has(name)),
      effectiveContract: lastValidContract,
      effectiveAuthority: lastValidAuthority,
      contractState: `${discovery.state}-sticky-live`,
    };
  }
  if (discovery.state === "legacy") {
    reviewedLegacyConfirmed = true;
    return {
      discovery,
      toolNames: [...STATIC_TOOL_NAMES],
      effectiveContract: null,
      effectiveAuthority: null,
      contractState: "legacy-static-fallback",
    };
  }
  if (reviewedLegacyConfirmed) return {
    discovery,
    toolNames: [...STATIC_TOOL_NAMES],
    effectiveContract: null,
    effectiveAuthority: null,
    contractState: `${discovery.state}-legacy-static-fallback`,
  };
  return { discovery, toolNames: [], effectiveContract: null, effectiveAuthority: null, contractState: discovery.state };
}

function toolAvailabilitySignature(availability) {
  const names = availability.toolNames;
  return stableStringify({
    names,
    ...(names.length ? {
      contractState: availability.contractState,
      contractHash: availability.effectiveContract?.contractHash || null,
      authorityHash: availability.effectiveAuthority?.authority_hash || null,
    } : {}),
  });
}

function notifyToolListChanged() {
  if (!clientInitialized || nativeTransportDisposed) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })}\n`);
}

function scheduleCapabilityRecovery() {
  if (recoveryTimer || nativeTransportDisposed) return;
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    try { await resolveAvailableTools(true); } catch { /* the next bounded retry records availability again */ }
  }, CAPABILITY_RETRY_MS);
  recoveryTimer.unref?.();
}

async function resolveAvailableTools(notifyOnChange, nativeRequest) {
  const availability = await availableTools(nativeRequest);
  if (nativeRequest && !nativeRequestOwned(nativeRequest)) throw nativeResponseInvalid();
  const signature = toolAvailabilitySignature(availability);
  if (notifyOnChange && lastAdvertisedToolSignature !== null && signature !== lastAdvertisedToolSignature) {
    notifyToolListChanged();
  }
  lastAdvertisedToolSignature = signature;
  scheduleCapabilityRecovery();
  return availability;
}

async function listTools() {
  const { toolNames, effectiveContract: contract, effectiveAuthority: authority, contractState } = await resolveAvailableTools(true);
  const capabilities = new Map((contract?.capabilities || []).map((capability) => [`${capability.id}@${capability.version}`, capability]));
  const listed = [];
  for (let toolIndex = 0; toolIndex < TOOLS.length; toolIndex += 1) {
    if (!toolNames.includes(TOOLS[toolIndex].name)) continue;
    const capability = capabilities.get(`${TOOLS[toolIndex].capabilityId}@${TOOLS[toolIndex].capabilityVersion}`);
    const projection = capability?.surfaces?.mcp?.find((candidate) => candidate.id === TOOLS[toolIndex].name);
    const legacyWorkspaceRead = contractState.endsWith("legacy-static-fallback") && TOOLS[toolIndex].name === "get_workspace";
    const projectionDescription = legacyWorkspaceRead
      ? "Read a bounded workspace.read@1 compatibility summary from a reviewed legacy Forge server. The legacy response has workspaceHash but no complete snapshotHash; snapshotHashAvailable is false."
      : projection?.status === "partial" && projection.note
      ? `${TOOLS[toolIndex].description} Projection limit: ${projection.note}`
      : TOOLS[toolIndex].description;
    listed.push({
      name: TOOLS[toolIndex].name,
      description: projectionDescription,
      inputSchema: structuredClone(TOOLS[toolIndex].inputSchema),
      _meta: {
        "x4forge/capabilityId": TOOLS[toolIndex].capabilityId,
        "x4forge/capabilityVersion": legacyWorkspaceRead ? 1 : TOOLS[toolIndex].capabilityVersion,
        "x4forge/contractVersion": contractState,
        ...(contract?.contractHash ? { "x4forge/contractHash": contract.contractHash } : {}),
        ...(authority?.authority_hash ? {
          "x4forge/authorityVersion": authority.api_version,
          "x4forge/authorityHash": authority.authority_hash,
        } : {}),
      },
    });
  }
  return listed;
}

async function forge(method, apiPath, body, signal, nativeDiscovery = false) {
  const headers = { "Content-Type": "application/json", "x-forge-channel": "mcp" };
  if (KEY) headers.Authorization = `Bearer ${KEY}`;
  if (WORKSPACE_ID) headers["x-workspace-id"] = WORKSPACE_ID;
  const nativeRoute = nativePerformanceRoute(method, apiPath);
  const configurationRoute = apiPath.startsWith("/api/agent/configuration");
  const deployRoute = apiPath.startsWith("/api/agent/deploy-verify/")
    || apiPath === "/api/agent/release/nexus/build"
    || apiPath.startsWith("/api/agent/release/steam/")
    || apiPath === "/api/agent/warning-reviews/revoke-review";
  const workspaceFilesRoute = apiPath.startsWith("/api/agent/files/")
    || apiPath.startsWith("/api/agent/bulk-transform/")
    || apiPath === "/api/agent/history/revert"
    || apiPath.startsWith("/api/agent/mod-folder/")
    || apiPath.startsWith("/api/agent/snapshots/")
    || apiPath.startsWith("/api/agent/project-rules/suppression/")
    || apiPath === "/api/agent/workspace/domain";
  const forwardsAuthoredSource = method === "POST" && AUTHORED_NAVIGATION_ROUTES.has(apiPath);
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers,
    ...(signal ? { signal } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(nativeRoute || nativeDiscovery || forwardsAuthoredSource || configurationRoute || deployRoute || workspaceFilesRoute ? { redirect: "error" } : {}),
  });
  let data = null;
  if (nativeRoute || nativeDiscovery) data = await readNativeJson(res, signal, nativeRoute ? NATIVE_PERFORMANCE_RESPONSE_BYTES : NATIVE_PERFORMANCE_DISCOVERY_BYTES);
  else try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (nativeRoute) return { nativeHttpStatus: res.status, nativePayload: data };
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    const error = new Error(`Forge API ${apiPath}: ${msg}${res.status === 401 ? " (is X4FORGE_KEY set to a valid agent key?)" : ""}${res.status === 403 ? " (check key scope and its workspace binding)" : ""}${data?.code === 'WORKSPACE_ID_REQUIRED' ? " (set X4FORGE_WORKSPACE_ID to the key-bound workspace)" : ""}`);
    error.status = res.status;
    if (["/api/agent/performance/collection", "/api/agent/performance/profile"].includes(apiPath)) error.performanceResponse = data;
    if (configurationRoute && isRecord(data)) error.configurationResponse = data;
    if (deployRoute && isRecord(data)) error.deployResponse = data;
    if (workspaceFilesRoute && isRecord(data)) error.workspaceFilesResponse = data;
    throw error;
  }
  requireResponse(data, `Forge API ${apiPath}`);
  return data;
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
function replyError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
  const text = line.trim();
  if (!text) return;
  let msg;
  try { msg = JSON.parse(text); } catch { return replyError(null, -32700, "Parse error"); }
  const { id, method, params } = msg;
  let nativeRequest;
  try {
    if (method === "initialize") {
      return reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: true } }, serverInfo: SERVER_INFO });
    }
    if (method === "notifications/initialized") {
      clientInitialized = true;
      return;
    }
    if (method === "notifications/cancelled") {
      cancelNativeRequest(params);
      return;
    }
    if ((method || "").startsWith("notifications/")) return; // notifications: no response
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") {
      if (params !== undefined && (!isRecord(params) || Object.keys(params).some((key) => key !== "cursor") ||
        (Object.hasOwn(params, "cursor") && typeof params.cursor !== "string"))) {
        return replyError(id, -32602, "Invalid tools/list params: expected an optional string cursor");
      }
      if (isRecord(params) && Object.hasOwn(params, "cursor")) {
        return replyError(id, -32602, "Invalid tools/list cursor: this one-page inventory did not issue a cursor");
      }
      return reply(id, { tools: await listTools() });
    }
    if (method === "tools/call") {
      if (!isRecord(params) || !isNonEmptyString(params.name) ||
        Object.keys(params).some((key) => key !== "name" && key !== "arguments") ||
        (Object.hasOwn(params, "arguments") && !isRecord(params.arguments))) {
        return replyError(id, -32602, "Invalid tools/call params: expected name and an optional object arguments field");
      }
      if (NATIVE_PERFORMANCE_LIVE_TOOLS.has(params.name)) {
        nativeRequest = beginNativeRequest(id);
        if (!nativeRequest) return;
      }
      const availability = await resolveAvailableTools(true, nativeRequest);
      if (nativeRequest && !nativeRequestOwned(nativeRequest)) return;
      let toolIndex = -1;
      if (availability.toolNames.includes(params?.name)) {
        for (let candidateIndex = 0; candidateIndex < TOOLS.length; candidateIndex += 1) {
          if (TOOLS[candidateIndex].name === params?.name) {
            toolIndex = candidateIndex;
            break;
          }
        }
      }
      if (toolIndex < 0) return replyError(id, -32602, `Unknown tool: ${params?.name}`);
      const toolArguments = params?.arguments ?? {};
      const inputError = schemaValueError(TOOLS[toolIndex].inputSchema, toolArguments);
      if (inputError) return replyError(id, -32602, `Invalid arguments for ${params?.name}: ${inputError}`);
      try {
        const result = await TOOLS[toolIndex].handler(toolArguments, { contractState: availability.contractState, signal: nativeRequest?.controller.signal });
        if (nativeRequest && !nativeRequestOwned(nativeRequest)) return;
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          ...(TOOLS[toolIndex].name === "compile_workspace" && result.success === false || CONFIGURATION_TOOLS.has(TOOLS[toolIndex].name) && result.success === false || DEPLOY_TOOLS.has(TOOLS[toolIndex].name) && (result.ok === false || result.success === false || result.status === "FAILED") || WORKSPACE_FILES_TOOLS.has(TOOLS[toolIndex].name) && (result.ok === false || result.success === false || result.status === "FAILED") || PERFORMANCE_LIVE_TOOLS.has(TOOLS[toolIndex].name) && result.ok === false || NATIVE_PERFORMANCE_LIVE_TOOLS.has(TOOLS[toolIndex].name) && result.ok === false ? { isError: true } : {}),
        });
      } catch (err) {
        if (nativeRequest) {
          if (!nativeRequestOwned(nativeRequest)) return;
          if (err?.nativeInputInvalid) return replyError(id, -32602, err.message);
          return nativeToolError(id, "NATIVE_PERFORMANCE_RESPONSE_INVALID");
        }
        if (CONFIGURATION_TOOLS.has(TOOLS[toolIndex].name) && isRecord(err?.configurationResponse)) {
          return reply(id, { content: [{ type: "text", text: JSON.stringify(err.configurationResponse, null, 2) }], isError: true });
        }
        if (DEPLOY_TOOLS.has(TOOLS[toolIndex].name) && isRecord(err?.deployResponse)) {
          return reply(id, { content: [{ type: "text", text: JSON.stringify(err.deployResponse, null, 2) }], isError: true });
        }
        if (WORKSPACE_FILES_TOOLS.has(TOOLS[toolIndex].name) && isRecord(err?.workspaceFilesResponse)) {
          return reply(id, { content: [{ type: "text", text: JSON.stringify(err.workspaceFilesResponse, null, 2) }], isError: true });
        }
        return reply(id, { content: [{ type: "text", text: `ERROR: ${err && err.message ? err.message : String(err)}` }], isError: true });
      }
    }
    return replyError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    if (nativeRequest) {
      if (!nativeRequestOwned(nativeRequest)) return;
      return nativeToolError(id, "NATIVE_PERFORMANCE_RESPONSE_INVALID");
    }
    return replyError(id, -32603, `Internal error: ${err && err.message ? err.message : String(err)}`);
  } finally {
    if (nativeRequest) retireNativeRequest(nativeRequest);
  }
});

rl.once("close", () => {
  disposeNativeTransport();
  if (recoveryTimer) clearTimeout(recoveryTimer);
  // Let Node drain naturally on EOF instead of forcing process.exit(0) while Windows libuv closes handles (async.c:76).
  process.stdin.destroy();
});
