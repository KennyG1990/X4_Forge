/**
 * agentLoop.ts — B55 Phase 1 (2026-07-16): the validation-driven repair loop.
 *
 * Forge-Agent lesson applied to the in-app agent: THE VALIDATOR DRIVES THE LOOP; the model
 * only proposes candidates. This module is pure orchestration — the composite validator and
 * the model call are INJECTED, so the oracle proves convergence/halt/spend behavior with
 * deterministic fakes and the server wires the real `validateModWorkspace` +
 * `runProjectValidation` + `callMultiProviderAI`.
 *
 * Loop contract (plan: docs/plans/2026-07-16-validation-driven-agent-loop.md):
 *  - clean first validation → ZERO repair calls (no spend);
 *  - hard cap on attempts (default 3, clamp 1..3 — 1 reproduces the old one-shot behavior);
 *  - no-progress halt: an identical actionable-signature set surviving 2 consecutive
 *    attempts stops the loop (the model is looping, stop paying it);
 *  - a repair call that throws (spend cap, provider error) halts HONESTLY: the best
 *    workspace seen so far is returned, never a half-applied candidate;
 *  - the returned workspace is always the BEST seen (fewest errors, then warnings) —
 *    a candidate that makes things worse is recorded but never adopted.
 */

export interface LoopDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  filePath?: string;
  sourceRef?: string;
  nodeId?: string;
  line?: number;
}

export interface RemediationCapsule {
  /** stable identity of this defect across attempts (the no-progress currency) */
  signature: string;
  severity: 'error' | 'warning';
  code?: string;
  filePath?: string;
  sourceRef?: string;
  nodeId?: string;
  message: string;
  /** grounded repair guidance when a deterministic source (e.g. quick-fix descriptor) has one */
  hint?: string;
}

/** Actionable = drives repair + no-progress detection. Info never triggers a model call. */
const ACTIONABLE = new Set(['error', 'warning']);

/**
 * Stable identity for a diagnostic. Message text is the LAST resort (models rephrase nothing
 * here — messages are deterministic — but they can embed values; prefer structured fields).
 */
export function diagnosticSignature(d: LoopDiagnostic): string {
  const anchor = d.sourceRef || d.nodeId || d.message.slice(0, 80);
  return `${d.severity}|${d.code || '?'}|${d.filePath || ''}|${anchor}`;
}

/** Sorted, de-duplicated actionable signature set — order-independent by construction. */
export function signatureSet(diags: LoopDiagnostic[]): string[] {
  return Array.from(new Set(diags.filter(d => ACTIONABLE.has(d.severity)).map(diagnosticSignature))).sort();
}

export function buildRemediationCapsules(
  diags: LoopDiagnostic[],
  hintFor?: (d: LoopDiagnostic) => string | undefined,
): RemediationCapsule[] {
  const seen = new Set<string>();
  const out: RemediationCapsule[] = [];
  for (const d of diags) {
    if (!ACTIONABLE.has(d.severity)) continue;
    const signature = diagnosticSignature(d);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const hint = hintFor ? hintFor(d) : undefined;
    out.push({
      signature,
      severity: d.severity as 'error' | 'warning',
      ...(d.code ? { code: d.code } : {}),
      ...(d.filePath ? { filePath: d.filePath } : {}),
      ...(d.sourceRef ? { sourceRef: d.sourceRef } : {}),
      ...(d.nodeId ? { nodeId: d.nodeId } : {}),
      message: d.message,
      ...(hint ? { hint } : {}),
    });
  }
  return out;
}

export type HaltReason = 'clean' | 'max_attempts' | 'no_progress' | 'repair_error' | 'spend_cap';

export interface RepairLoopResult<W> {
  /** the best workspace seen (fewest errors, then fewest warnings) */
  workspace: W;
  /** repair (model) calls actually made */
  attempts: number;
  haltReason: HaltReason;
  /** actionable capsules still open against the RETURNED workspace */
  remaining: RemediationCapsule[];
  /** signature-set history per validation (index 0 = initial) for honest reporting */
  history: string[][];
  /** message of the throwing repair call when haltReason is repair_error/spend_cap */
  repairError?: string;
}

function score(diags: LoopDiagnostic[]): [number, number] {
  let errors = 0, warnings = 0;
  for (const d of diags) {
    if (d.severity === 'error') errors++;
    else if (d.severity === 'warning') warnings++;
  }
  return [errors, warnings];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
}

/** The spend-cap error thrown at the callMultiProviderAI chokepoint (B25). */
const SPEND_CAP_RE = /call cap reached/i;

export async function runRepairLoop<W>(args: {
  initial: W;
  validate: (w: W) => LoopDiagnostic[];
  repair: (w: W, capsules: RemediationCapsule[], attempt: number) => Promise<W>;
  maxAttempts?: number;
  hintFor?: (d: LoopDiagnostic) => string | undefined;
}): Promise<RepairLoopResult<W>> {
  const maxAttempts = Math.max(1, Math.min(3, Math.floor(args.maxAttempts ?? 3)));

  let current = args.initial;
  let currentDiags = args.validate(current);
  const history: string[][] = [signatureSet(currentDiags)];

  let best = current;
  let bestDiags = currentDiags;
  let bestScore = score(currentDiags);

  if (history[0].length === 0) {
    return { workspace: current, attempts: 0, haltReason: 'clean', remaining: [], history };
  }

  let attempts = 0;
  let stalls = 0;
  let haltReason: HaltReason = 'max_attempts';
  let repairError: string | undefined;

  while (attempts < maxAttempts) {
    const before = signatureSet(currentDiags);
    const capsules = buildRemediationCapsules(currentDiags, args.hintFor);
    let candidate: W;
    try {
      candidate = await args.repair(current, capsules, attempts + 1);
    } catch (err) {
      repairError = err instanceof Error ? err.message : String(err);
      haltReason = SPEND_CAP_RE.test(repairError) ? 'spend_cap' : 'repair_error';
      attempts++;
      break;
    }
    attempts++;

    const candidateDiags = args.validate(candidate);
    const after = signatureSet(candidateDiags);
    history.push(after);

    const candidateScore = score(candidateDiags);
    if (better(candidateScore, bestScore)) {
      best = candidate;
      bestDiags = candidateDiags;
      bestScore = candidateScore;
    }

    if (after.length === 0) {
      return { workspace: candidate, attempts, haltReason: 'clean', remaining: [], history };
    }

    // No-progress detection runs on the CANDIDATE's set vs the set the model was shown —
    // an unchanged set means the model achieved nothing this attempt.
    if (after.length === before.length && after.every((s, i) => s === before[i])) {
      stalls++;
      if (stalls >= 2) { haltReason = 'no_progress'; break; }
    } else {
      stalls = 0;
    }

    // Continue from the candidate only when it did not regress the error count —
    // repairing from a worse state compounds; the validator decides, not the model.
    if (candidateScore[0] <= score(currentDiags)[0]) {
      current = candidate;
      currentDiags = candidateDiags;
    }
  }

  return {
    workspace: best,
    attempts,
    haltReason,
    remaining: buildRemediationCapsules(bestDiags, args.hintFor),
    history,
    ...(repairError ? { repairError } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Oracle — deterministic fakes only; proves loop semantics without AI.
 * ------------------------------------------------------------------ */

export async function runAgentLoopSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const E = (msg: string, code = 'X'): LoopDiagnostic => ({ severity: 'error', message: msg, code, sourceRef: msg });
  const W = (msg: string): LoopDiagnostic => ({ severity: 'warning', message: msg, code: 'W', sourceRef: msg });

  // signature stability: order-independent, info excluded
  ok('signature_set_order_independent',
    JSON.stringify(signatureSet([E('a'), W('b')])) === JSON.stringify(signatureSet([W('b'), E('a')])));
  ok('info_never_actionable', signatureSet([{ severity: 'info', message: 'x' }]).length === 0);
  ok('capsules_dedupe_and_hint',
    (() => {
      const caps = buildRemediationCapsules([E('dup'), E('dup'), W('w1')], d => (d.severity === 'warning' ? 'try this' : undefined));
      return caps.length === 2 && caps.find(c => c.severity === 'warning')?.hint === 'try this';
    })());

  // 1. clean initial → zero repair calls
  {
    let calls = 0;
    const r = await runRepairLoop<string>({
      initial: 'ws', validate: () => [], repair: async w => { calls++; return w; },
    });
    ok('clean_initial_zero_spend', r.attempts === 0 && r.haltReason === 'clean' && calls === 0);
  }

  // 2. converges on attempt 2
  {
    const diagsByWs: Record<string, LoopDiagnostic[]> = { ws0: [E('e1'), E('e2')], ws1: [E('e2')], ws2: [] };
    const r = await runRepairLoop<string>({
      initial: 'ws0', validate: w => diagsByWs[w],
      repair: async (_w, _c, attempt) => `ws${attempt}`,
    });
    ok('converges_attempt_2', r.attempts === 2 && r.haltReason === 'clean' && r.workspace === 'ws2' && r.remaining.length === 0,
      JSON.stringify({ attempts: r.attempts, halt: r.haltReason }));
  }

  // 3. stubborn identical diagnostics → no_progress halt after 2 stalls (not maxAttempts)
  {
    let calls = 0;
    const r = await runRepairLoop<string>({
      initial: 'ws', validate: () => [E('stuck')],
      repair: async () => { calls++; return 'ws'; },
    });
    ok('no_progress_halts_after_2_stalls', r.haltReason === 'no_progress' && r.attempts === 2 && calls === 2 && r.remaining.length === 1,
      JSON.stringify({ attempts: r.attempts, halt: r.haltReason }));
  }

  // 4. spend-cap throw → honest halt, initial workspace kept, capsules preserved
  {
    const r = await runRepairLoop<string>({
      initial: 'ws', validate: w => (w === 'ws' ? [E('open')] : []),
      repair: async () => { throw new Error('Daily AI call cap reached (50/50). This is the runaway-spend backstop.'); },
    });
    ok('spend_cap_honest_halt', r.haltReason === 'spend_cap' && r.workspace === 'ws' && r.remaining.length === 1 && !!r.repairError);
  }

  // 5. generic repair error → repair_error halt
  {
    const r = await runRepairLoop<string>({
      initial: 'ws', validate: () => [E('open')],
      repair: async () => { throw new Error('provider exploded'); },
    });
    ok('repair_error_halt', r.haltReason === 'repair_error' && r.repairError === 'provider exploded');
  }

  // 6. a WORSE candidate is never adopted as the result (best-seen wins)
  {
    const diagsByWs: Record<string, LoopDiagnostic[]> = { good: [E('one')], bad: [E('one'), E('two'), E('three')] };
    const r = await runRepairLoop<string>({
      initial: 'good', validate: w => diagsByWs[w], maxAttempts: 1,
      repair: async () => 'bad',
    });
    ok('worse_candidate_not_adopted', r.workspace === 'good' && r.remaining.length === 1 && r.haltReason === 'max_attempts');
  }

  // 7. maxAttempts clamps to 1..3 and 1 reproduces the old one-shot behavior
  {
    let calls = 0;
    const r = await runRepairLoop<string>({
      initial: 'ws', validate: () => [E('stuck')], maxAttempts: 99,
      repair: async () => { calls++; return 'ws'; },
    });
    // stall halt still fires first (2 stalls < clamp 3)
    ok('max_attempts_clamped', calls <= 3 && r.attempts <= 3);
    let oneShotCalls = 0;
    const r1 = await runRepairLoop<string>({
      initial: 'ws', validate: () => [E('stuck')], maxAttempts: 1,
      repair: async () => { oneShotCalls++; return 'ws'; },
    });
    ok('one_shot_mode_single_call', oneShotCalls === 1 && r1.attempts === 1 && r1.haltReason === 'max_attempts');
  }

  // 8. history records every validation's signature set (initial + per attempt)
  {
    const diagsByWs: Record<string, LoopDiagnostic[]> = { ws0: [E('a')], ws1: [] };
    const r = await runRepairLoop<string>({
      initial: 'ws0', validate: w => diagsByWs[w],
      repair: async () => 'ws1',
    });
    ok('history_tracks_each_validation', r.history.length === 2 && r.history[0].length === 1 && r.history[1].length === 0);
  }

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
