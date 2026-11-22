/**
 * diagnosticsMap.ts — B56s1 (2026-07-17): pure mapping from the Forge's flat diagnostic
 * list (`flat` on POST /api/agent/project/validate, the B55P1 currency) to per-file,
 * 0-based-line entries ready for a vscode.DiagnosticCollection.
 *
 * Deliberately vscode-free so the mapping is node-testable headlessly (the extension host
 * itself is IDE-gated); extension.ts converts MappedDiagnostic → vscode.Diagnostic 1:1.
 */

export interface FlatFinding {
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
  filePath?: string;
  sourceRef?: string;
  line?: number;
  column?: number;
}

export interface MappedDiagnostic {
  /** forward-slash path relative to the mod root; findings without one anchor to content.xml */
  relPath: string;
  /** 0-based line for vscode.Range */
  line: number;
  /** 0-based UTF-16 column, when the finding has an authored position. */
  column?: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
}

export interface MappedResult {
  byFile: Map<string, MappedDiagnostic[]>;
  /** findings that could not be anchored to any loaded file (reported as a count, never lost) */
  unanchored: number;
  total: number;
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();

/**
 * Map flat findings onto the mod's loaded files. `loadedFiles` comes from the validate
 * response's `source.loaded`; a finding whose filePath is absent or unknown anchors to
 * content.xml when loaded (structure-level findings), else counts as unanchored.
 */
export function mapFlatFindings(flat: FlatFinding[], loadedFiles: string[]): MappedResult {
  const loaded = new Map(loadedFiles.map(f => [norm(f), f.replace(/\\/g, "/")]));
  const contentXml = loaded.get("content.xml");
  const byFile = new Map<string, MappedDiagnostic[]>();
  let unanchored = 0;

  for (const f of flat || []) {
    if (!f || !f.message) continue;
    const matchedPath = f.filePath ? loaded.get(norm(f.filePath)) : undefined;
    const anchor = matchedPath ?? contentXml;
    if (!anchor) { unanchored++; continue; }
    const line = f.line ?? 1;
    const column = f.column ?? 0;
    const positioned = matchedPath && f.line !== undefined && Number.isSafeInteger(line) && line > 0
      && Number.isSafeInteger(column) && column > 0;
    const entry: MappedDiagnostic = {
      relPath: anchor,
      line: Number.isFinite(line) ? Math.max(0, Math.floor(line) - 1) : 0,
      ...(positioned ? { column: column - 1 } : {}),
      severity: f.severity === "error" || f.severity === "warning" ? f.severity : "info",
      message: f.sourceRef ? `${f.message} (${f.sourceRef})` : f.message,
      ...(f.code ? { code: f.code } : {}),
    };
    const list = byFile.get(anchor) || [];
    list.push(entry);
    byFile.set(anchor, list);
  }
  return { byFile, unanchored, total: (flat || []).length };
}

/** Use the request's own text for precise ranges. A changed editor keeps its line-only range. */
export function createDiagnosticRangeMapper(
  submittedText: string | undefined,
  openDocument?: { lineCount: number; lineAt(line: number): { text: string }; getText(): string },
): (finding: MappedDiagnostic) => { line: number; start: number; end: number } {
  const hasBom = submittedText?.startsWith("\uFEFF") ?? false;
  const precise = submittedText !== undefined && !/[\u0085\u2028\u2029]/.test(submittedText)
    && (!openDocument || openDocument.getText() === submittedText);
  const lines = openDocument ? undefined : submittedText?.replace(/^\uFEFF/, "").split(/\r\n?|\n/g);
  const lineCount = openDocument?.lineCount ?? lines?.length;
  return finding => {
    const line = lineCount ? Math.min(finding.line, lineCount - 1) : finding.line;
    const text = openDocument?.lineAt(line).text ?? lines?.[line];
    const column = finding.column;
    if (precise && line === finding.line && (line > 0 || !hasBom)
        && text !== undefined && column !== undefined && column < text.length) {
      const character = text.codePointAt(column);
      if (character !== undefined && (character < 0xDC00 || character > 0xDFFF)) {
        return { line, start: column, end: column + (character > 0xFFFF ? 2 : 1) };
      }
    }
    return { line, start: 0, end: text?.length ?? 200 };
  };
}

/* ------------------------------------------------------------------ *
 * Selftest — run headlessly: npx tsx vscode-extension/src/diagnosticsMap.ts
 * ------------------------------------------------------------------ */

export function runDiagnosticsMapSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const loaded = ["content.xml", "md/story.xml", "libraries/factions.xml", "t/0001-l044.xml"];
  const flat: FlatFinding[] = [
    { severity: "warning", message: "unknown attr", code: "XSD_UNKNOWN_ATTRIBUTE", filePath: "libraries/factions.xml", sourceRef: "faction@bogus", line: 3 },
    { severity: "error", message: "unresolved cue", code: "project.unresolved_cue_ref", filePath: "md/story.xml", line: 12 },
    { severity: "error", message: "missing content.xml dependency", code: "project.missing_content_xml" }, // no filePath → content.xml
    { severity: "warning", message: "page id missing", code: "TFILE_PAGE_ID", filePath: "t\\0001-L044.xml", line: 1 }, // backslash + case
    { severity: "warning", message: "phantom file finding", filePath: "md/not_loaded.xml", line: 2 }, // unknown file → content.xml
    { severity: "info", message: "note without line", filePath: "md/story.xml" },
  ];

  const r = mapFlatFindings(flat, loaded);
  ok("total_counted", r.total === 6);
  ok("nothing_unanchored_with_content_xml", r.unanchored === 0);
  ok("factions_anchored_line_0based", r.byFile.get("libraries/factions.xml")?.[0].line === 2);
  ok("sourceRef_appended", /faction@bogus/.test(r.byFile.get("libraries/factions.xml")?.[0].message || ""));
  ok("md_has_two", r.byFile.get("md/story.xml")?.length === 2);
  ok("missing_line_clamps_to_0", r.byFile.get("md/story.xml")?.some(d => d.line === 0) === true);
  ok("caseless_backslash_path_matches", (r.byFile.get("t/0001-l044.xml")?.length ?? 0) === 1);
  ok("pathless_and_unknown_anchor_to_content_xml", r.byFile.get("content.xml")?.length === 2);

  const noContent = mapFlatFindings([{ severity: "error", message: "x" }], ["md/a.xml"]);
  ok("unanchored_counted_when_no_content_xml", noContent.unanchored === 1 && noContent.byFile.size === 0);
  const empty = mapFlatFindings([], []);
  ok("empty_inputs_safe", empty.total === 0 && empty.unanchored === 0);
  const luaFailureMessage = "Literal addTable(24) exceeds the measured X4 mod boundary. Failure mode: Engine refuses the ENTIRE frame: no partial draw/Lua error; UI auto-reloads. Next action: verify this boundary in-game.";
  const luaResult = mapFlatFindings([{
    severity: "error",
    message: luaFailureMessage,
    code: "x4-ui.add-table-column-limit",
    filePath: "ui/too_many_columns.lua",
    line: 3,
  }], ["content.xml", "ui/too_many_columns.lua"]);
  const luaDiagnostic = luaResult.byFile.get("ui/too_many_columns.lua")?.[0];
  ok(
    "lua_path_code_line_message_preserved",
    luaDiagnostic?.relPath === "ui/too_many_columns.lua"
      && luaDiagnostic.line === 2
      && luaDiagnostic.severity === "error"
      && luaDiagnostic.code === "x4-ui.add-table-column-limit"
      && luaDiagnostic.message === luaFailureMessage,
  );

  const text = "<mdscript/>\r\n<!--🚀--><cue/>";
  const file = "md/positions.xml";
  const sameLine = mapFlatFindings([10, 11].map(column => ({
    filePath: file, severity: "warning", line: 2, column, message: "same-line finding",
  })), [file]).byFile.get(file)!;
  const first = sameLine[0];
  const rangeFor = createDiagnosticRangeMapper(text);
  const range = (value: ReturnType<typeof rangeFor>) => [value.line, value.start, value.end].join(",");
  ok("same_line_api_columns_have_distinct_ranges",
    sameLine.map(finding => range(rangeFor(finding))).join(";") === "1,9,10;1,10,11");
  ok("surrogate_pair_range_keeps_whole_character", range(rangeFor({ ...first, column: 4 })) === "1,4,6");
  ok("surrogate_low_half_falls_back_to_line", range(rangeFor({ ...first, column: 5 })) === "1,0,15");
  ok("missing_or_oversized_column_falls_back_to_line",
    range(rangeFor({ ...first, column: undefined })) === "1,0,15" && range(rangeFor({ ...first, column: 99 })) === "1,0,15");
  ok("line_past_source_does_not_gain_precision", range(rangeFor({ ...first, line: 99 })) === "1,0,15");
  const open = (source: string) => ({
    lineCount: 2, getText: () => source, lineAt: (line: number) => ({ text: source.split("\r\n")[line] }),
  });
  ok("matching_editor_agrees_with_closed_file", range(createDiagnosticRangeMapper(text, open(text))(first)) === "1,9,10");
  ok("changed_editor_text_falls_back_to_its_current_line",
    range(createDiagnosticRangeMapper(text, open("<mdscript/>\r\n<cue/>"))(first)) === "1,0,6");
  const withBom = createDiagnosticRangeMapper("\uFEFF" + text);
  ok("ambiguous_first_line_bom_does_not_create_guessed_column",
    range(withBom({ ...first, line: 0 })) === "0,0,11" && range(withBom(first)) === "1,9,10");
  ok("exceptional_xml_line_separators_disable_precision",
    range(createDiagnosticRangeMapper(text + "\u2028")(first)) === "1,0,16");
  const invalid = mapFlatFindings([
    { filePath: "missing.xml", severity: "error", line: 1, column: 2, message: "fallback" },
    { filePath: file, severity: "error", line: 2, column: -1, message: "negative" },
    { filePath: file, severity: "error", column: 2, message: "no line" },
    { filePath: file, severity: "error", line: 2, column: 2.5, message: "fractional" },
  ], ["content.xml", file]);
  ok("unknown_files_and_invalid_positions_do_not_acquire_columns",
    [...invalid.byFile.values()].flat().every(finding => finding.column === undefined));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}

// Headless runner: `npx tsx vscode-extension/src/diagnosticsMap.ts`
const invokedScript = process.argv[1]?.replace(/\\/g, "/");
if (invokedScript?.endsWith("vscode-extension/src/diagnosticsMap.ts")) {
  const r = runDiagnosticsMapSelftest();
  console.log(`diagnosticsMap selftest: ${r.passed}/${r.total} allPassed=${r.allPassed}`);
  for (const c of r.checks) if (!c.pass) console.log("FAIL", c.name, c.detail || "");
  process.exit(r.allPassed ? 0 : 1);
}
