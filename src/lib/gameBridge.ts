// gameBridge.ts — studio-side seam to the external game_agent_bridge harness.
//
// The bridge (F:\DEV_ENV\tools\game_agent_bridge, configurable via
// config.json gameBridgeRoot) launches X4, sends input, and executes JSON run
// plans that emit machine-checkable evidence (report.json with passed +
// assertions, events.jsonl, screenshots). THIS module owns the studio's pure
// half: summarizing bridge reports for the UI and pre-flighting plans before
// a python process is ever spawned. Process spawning itself is server glue
// (server.ts /api/agent/game-bridge/*) — same split as the Extension Doctor.
//
// AUTHORITY NOTE: the bridge's own python validate_plan is the authoritative
// validator (an invalid plan refuses to execute there). validateBridgePlan
// here is a deliberately MINIMAL pre-flight so the UI can reject obvious
// mistakes without a process round-trip — keep it in sync, never stricter.
//
// House pattern: pure engine + runGameBridgeSelftest() + public GET, THEN UI.

export interface BridgeAssertion {
  label: string;
  matched: boolean;
}

export interface BridgeStepSummary {
  label: string;
  type: string;
  errors: string[];
  screenshots: string[];
  /** assert_log only */
  matched?: boolean;
  match?: string | null;
}

export interface BridgeRunSummary {
  passed: boolean;
  runId: string;
  runDir: string;
  startedAt: string | null;
  finishedAt: string | null;
  launchSource: string | null;
  windowFound: boolean;
  errors: string[];
  assertions: BridgeAssertion[];
  steps: BridgeStepSummary[];
  screenshots: string[];
}

const BRIDGE_STEP_TYPES = new Set(['wait', 'observe', 'click_relative', 'click_screen', 'press', 'type', 'assert_log']);

/**
 * Minimal pre-flight over a bridge plan (see AUTHORITY NOTE above).
 * Returns human-readable problems; empty array = OK to hand to python.
 */
export function validateBridgePlan(plan: any): string[] {
  const problems: string[] = [];
  if (!plan || typeof plan !== 'object') return ['plan is not an object'];
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) problems.push('plan has no steps');
  for (const [i, step] of (Array.isArray(plan.steps) ? plan.steps : []).entries()) {
    const n = i + 1;
    const t = step && step.type;
    if (!BRIDGE_STEP_TYPES.has(t)) { problems.push(`step ${n}: unknown type "${String(t)}"`); continue; }
    if (t === 'type' && !String(step.text || '')) problems.push(`step ${n}: type step needs text`);
    if (t === 'assert_log' && !String(step.pattern || '')) problems.push(`step ${n}: assert_log needs a pattern`);
    if ((t === 'click_relative' || t === 'click_screen') && (step.x === undefined || step.y === undefined)) {
      problems.push(`step ${n}: click needs x and y`);
    }
  }
  return problems;
}

/** Collapse a bridge report.json into what the UI needs. Defensive: a report
 *  from an older bridge (no passed/assertions fields) still summarizes. */
export function summarizeBridgeReport(report: any): BridgeRunSummary {
  const steps: BridgeStepSummary[] = [];
  const screenshots: string[] = [];
  for (const e of Array.isArray(report?.steps) ? report.steps : []) {
    const shots: string[] = [];
    const result = e?.result || {};
    if (typeof result.screenshot === 'string') shots.push(result.screenshot);
    if (typeof result.after_screenshot === 'string') shots.push(result.after_screenshot);
    screenshots.push(...shots);
    steps.push({
      label: String(e?.label ?? ''),
      type: String(e?.type ?? ''),
      errors: Array.isArray(e?.errors) ? e.errors.map(String) : [],
      screenshots: shots,
      ...(result.assertion ? { matched: !!result.matched, match: result.match ?? null } : {})
    });
  }
  const errors = Array.isArray(report?.errors) ? report.errors.map(String) : [];
  const assertions: BridgeAssertion[] = Array.isArray(report?.assertions)
    ? report.assertions.map((a: any) => ({ label: String(a?.label ?? ''), matched: !!a?.matched }))
    : steps.filter(s => s.matched !== undefined).map(s => ({ label: s.label, matched: !!s.matched }));
  return {
    passed: typeof report?.passed === 'boolean' ? report.passed : errors.length === 0,
    runId: String(report?.run_id ?? ''),
    runDir: String(report?.run_dir ?? ''),
    startedAt: report?.started_at ?? null,
    finishedAt: report?.finished_at ?? null,
    launchSource: report?.launch?.source ?? null,
    windowFound: !!report?.window_after_launch,
    errors,
    assertions,
    steps,
    screenshots
  };
}

// ---------------------------------------------------------------------------
// Selftest oracle — synthetic report/plan fixtures, no bridge install needed.
// ---------------------------------------------------------------------------

export interface GameBridgeCheck { name: string; pass: boolean; detail?: string }

export function runGameBridgeSelftest(): { pass: boolean; checks: GameBridgeCheck[] } {
  const checks: GameBridgeCheck[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  // plan pre-flight
  const goodPlan = {
    name: 'fixture', steps: [
      { type: 'observe' }, { type: 'press', key: 'enter' },
      { type: 'type', text: '/refreshmd' }, { type: 'assert_log', pattern: 'reload' }
    ]
  };
  ok('preflight: good plan clean', validateBridgePlan(goodPlan).length === 0);
  const badPlan = { steps: [{ type: 'warp' }, { type: 'type', text: '' }, { type: 'assert_log' }, { type: 'click_screen' }] };
  ok('preflight: catches all 4 bad steps', validateBridgePlan(badPlan).length === 4, validateBridgePlan(badPlan).join('; '));
  ok('preflight: non-object rejected', validateBridgePlan(null).length === 1);

  // report summarization — passing run with assertion + screenshots
  const passing = {
    run_id: 'r1', run_dir: 'D:\\runs\\r1', started_at: 't0', finished_at: 't1',
    passed: true, errors: [],
    launch: { source: 'already_running' },
    window_after_launch: { pid: 1 },
    assertions: [{ label: 'md_reload_seen', matched: true }],
    steps: [
      { label: 'before', type: 'observe', errors: [], result: { screenshot: 'a.png' } },
      { label: 'submit', type: 'press', errors: [], result: { after_screenshot: 'b.png' } },
      { label: 'md_reload_seen', type: 'assert_log', errors: [], result: { assertion: true, matched: true, match: '[MDStudio] cue=X fired' } }
    ]
  };
  const s1 = summarizeBridgeReport(passing);
  ok('summary: passing run summarized', s1.passed && s1.runId === 'r1' && s1.windowFound && s1.launchSource === 'already_running');
  ok('summary: screenshots collected in order', s1.screenshots.join(',') === 'a.png,b.png');
  ok('summary: assertion surfaced with match line',
    s1.assertions.length === 1 && s1.assertions[0].matched && s1.steps[2].match === '[MDStudio] cue=X fired');

  // failing run, OLD bridge shape (no passed/assertions fields) — must degrade honestly
  const failing = {
    run_id: 'r2', errors: ['step_3_failed'],
    steps: [{ label: 'md_reload_seen', type: 'assert_log', errors: ['assert_failed: x'], result: { assertion: true, matched: false, match: null } }]
  };
  const s2 = summarizeBridgeReport(failing);
  ok('summary: failing run not passed', !s2.passed && s2.errors.length === 1);
  ok('summary: assertions derived from steps when field absent',
    s2.assertions.length === 1 && !s2.assertions[0].matched);

  // garbage in, summary out — never throws
  let threw = false;
  try { summarizeBridgeReport(undefined); summarizeBridgeReport({ steps: 'nope' }); } catch { threw = true; }
  ok('summary: malformed reports never throw', !threw);

  return { pass: checks.every(c => c.pass), checks };
}
