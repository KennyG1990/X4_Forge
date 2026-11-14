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
 *    deploy tools are deliberately NOT exposed here at all).
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
const PERFORMANCE_LIVE_TOOLS = new Set(["get_forge_performance", "start_forge_performance_capture", "profile_forge_backend"]);
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
];
const STATIC_TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));
STATIC_TOOL_NAMES.delete("runtime_debugger");
STATIC_TOOL_NAMES.delete("check_expression");
STATIC_TOOL_NAMES.delete("get_xml_references");
for (const name of PERFORMANCE_LIVE_TOOLS) STATIC_TOOL_NAMES.delete(name);
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
      toolNames: [...stickyLiveToolNames].filter(name => !["check_expression", "get_xml_references"].includes(name) && !PERFORMANCE_LIVE_TOOLS.has(name) && !NATIVE_PERFORMANCE_LIVE_TOOLS.has(name)),
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
  const headers = { "Content-Type": "application/json" };
  if (KEY) headers.Authorization = `Bearer ${KEY}`;
  if (WORKSPACE_ID) headers["x-workspace-id"] = WORKSPACE_ID;
  const nativeRoute = nativePerformanceRoute(method, apiPath);
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers,
    ...(signal ? { signal } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(nativeRoute || nativeDiscovery ? { redirect: "error" } : {}),
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
          ...(TOOLS[toolIndex].name === "compile_workspace" && result.success === false || PERFORMANCE_LIVE_TOOLS.has(TOOLS[toolIndex].name) && result.ok === false || NATIVE_PERFORMANCE_LIVE_TOOLS.has(TOOLS[toolIndex].name) && result.ok === false ? { isError: true } : {}),
        });
      } catch (err) {
        if (nativeRequest) {
          if (!nativeRequestOwned(nativeRequest)) return;
          if (err?.nativeInputInvalid) return replyError(id, -32602, err.message);
          return nativeToolError(id, "NATIVE_PERFORMANCE_RESPONSE_INVALID");
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
});
rl.on("close", () => process.exit(0));
