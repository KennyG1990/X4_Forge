/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tier 2 / T3.1 — log-telemetry parser engine.
 *
 * Parses raw X4 debug-log text into structured entries and correlates each one to the
 * mod's cues, so the studio can light up the cue-lineage tree from a log (static text
 * first; a live file-tail comes later). Pure and testable — no game required.
 *
 * Correlation has two paths:
 *   1. A deterministic studio marker `[MDStudio] cue=<Name> ...` (unambiguous — the
 *      studio can emit these from its own generated cues).
 *   2. A best-effort word-boundary match of any workspace cue name in the message.
 *
 * X4's log format is NOT a stable public contract, so the line parser is intentionally
 * forgiving: it recognises a leading `[Category]` and an optional numeric/clock
 * timestamp, and falls back to treating the whole line as the message.
 */

export type LogSeverity = 'error' | 'warning' | 'info';

export interface LogEntry {
  lineNo: number;
  raw: string;
  timestamp: string | null;
  category: string | null;
  severity: LogSeverity;
  message: string;
  /** Cue names this line is correlated to (marker + name matches, deduped). */
  cueNames: string[];
  /** The cue from a deterministic `[MDStudio] cue=…` marker, if present. */
  markerCue: string | null;
}

export interface CueTelemetry {
  name: string;
  hits: number;
  errors: number;
  warnings: number;
  lastLineNo: number;
}

export interface LogTelemetryResult {
  entries: LogEntry[];
  /** Per-cue summary, only for cues that actually appeared in the log. */
  cues: CueTelemetry[];
  totals: { lines: number; errors: number; warnings: number; correlatedCues: number };
}

const ERROR_RE = /(^|[^a-z])(error|exception|failed|failure|cannot|nil value|stack traceback)([^a-z]|$)/i;
const WARN_RE = /(^|[^a-z])(warn|warning|deprecated)([^a-z]|$)/i;
const CATEGORY_RE = /^\s*\[([^\]]{1,40})\]\s*(.*)$/;
const TS_RE = /^\s*((?:\d{1,7}(?:\.\d+)?)|(?:\d{1,2}:\d{2}:\d{2}(?:\.\d+)?))\s+(.*)$/;
const MARKER_RE = /\[MDStudio\][^\n]*?\bcue\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classifySeverity(category: string | null, message: string): LogSeverity {
  const cat = (category || '').toLowerCase();
  if (/error/.test(cat) || ERROR_RE.test(message)) return 'error';
  if (/warn/.test(cat) || WARN_RE.test(message)) return 'warning';
  return 'info';
}

/**
 * Parse log text and correlate to the given cue names. `cueNames` is the workspace's
 * list of cue `properties.name` values (used for best-effort message matching).
 */
export function parseLogTelemetry(logText: string, cueNames: string[]): LogTelemetryResult {
  const text = typeof logText === 'string' ? logText : '';
  const names = Array.from(new Set((cueNames || []).filter(n => n && typeof n === 'string')));
  // Precompile word-boundary matchers for each cue name (longest first, so e.g.
  // "Escort_Cue_2" is preferred over "Escort_Cue" — both can still match).
  const matchers = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(n => ({ name: n, re: new RegExp('(^|[^A-Za-z0-9_])' + escapeRegExp(n) + '([^A-Za-z0-9_]|$)') }));

  const entries: LogEntry[] = [];
  const cueMap = new Map<string, CueTelemetry>();
  let errors = 0, warnings = 0;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim().length === 0) continue;

    let rest = raw;
    let category: string | null = null;
    const cm = raw.match(CATEGORY_RE);
    if (cm) { category = cm[1].trim(); rest = cm[2]; }

    let timestamp: string | null = null;
    const tm = rest.match(TS_RE);
    if (tm) { timestamp = tm[1]; rest = tm[2]; }

    const message = rest.trim();
    const severity = classifySeverity(category, message);
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;

    // correlation
    const markerMatch = raw.match(MARKER_RE);
    const markerCue = markerMatch ? markerMatch[1] : null;
    const found = new Set<string>();
    if (markerCue) found.add(markerCue);
    for (const m of matchers) if (m.re.test(message)) found.add(m.name);
    const cueNamesForLine = Array.from(found);

    const entry: LogEntry = { lineNo: i + 1, raw, timestamp, category, severity, message, cueNames: cueNamesForLine, markerCue };
    entries.push(entry);

    for (const name of cueNamesForLine) {
      let t = cueMap.get(name);
      if (!t) { t = { name, hits: 0, errors: 0, warnings: 0, lastLineNo: 0 }; cueMap.set(name, t); }
      t.hits++;
      if (severity === 'error') t.errors++;
      else if (severity === 'warning') t.warnings++;
      t.lastLineNo = i + 1;
    }
  }

  const cues = Array.from(cueMap.values()).sort((a, b) => b.errors - a.errors || b.hits - a.hits);
  return { entries, cues, totals: { lines: entries.length, errors, warnings, correlatedCues: cues.length } };
}

/** Self-test oracle over synthetic X4-style log text. */
export function runLogTelemetrySelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const cueNames = ['My_Startup_Cue', 'Escort_Cue', 'Build_Cue', 'Unused_Cue'];
  const log = [
    '[General] 100.5 Mission started for cue My_Startup_Cue',
    '[=ERROR=] 101.2 Script error in cue Escort_Cue: attempt to index a nil value',
    '[MDStudio] cue=Build_Cue event=fired payload=ok',
    '[General] 102.0 nothing interesting happened here',
    '   ',
    '[Scripts] 12:30:01 WARNING deprecated call near Escort_Cue'
  ].join('\n');

  const r = parseLogTelemetry(log, cueNames);

  ok('skips_blank_lines', r.entries.length === 5);
  ok('parses_category', r.entries[0].category === 'General');
  ok('parses_timestamp', r.entries[0].timestamp === '100.5');
  ok('clock_timestamp', r.entries[4].timestamp === '12:30:01');
  ok('error_severity', r.entries[1].severity === 'error');
  ok('warning_severity', r.entries[4].severity === 'warning');
  ok('info_severity', r.entries[3].severity === 'info');
  ok('correlates_by_name', r.entries[0].cueNames.indexOf('My_Startup_Cue') !== -1);
  ok('correlates_by_marker', r.entries[2].markerCue === 'Build_Cue' && r.entries[2].cueNames.indexOf('Build_Cue') !== -1);
  ok('error_cue_attributed', !!r.cues.find(c => c.name === 'Escort_Cue' && c.errors === 1));
  ok('escort_cue_two_hits', !!r.cues.find(c => c.name === 'Escort_Cue' && c.hits === 2));
  ok('unused_cue_absent', !r.cues.find(c => c.name === 'Unused_Cue'));
  ok('totals_errors', r.totals.errors === 1);
  ok('totals_warnings', r.totals.warnings === 1);
  ok('cues_sorted_errors_first', r.cues.length > 0 && r.cues[0].name === 'Escort_Cue');
  ok('no_false_partial_match', parseLogTelemetry('cue MyStartupCueXYZ ran', ['My_Startup_Cue']).cues.length === 0);
  ok('empty_log_safe', parseLogTelemetry('', cueNames).entries.length === 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
