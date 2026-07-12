/**
 * run-e2e.mjs — the e2e gate wrapper (BACKLOG B17, 2026-07-11).
 *
 * Why this exists: on this Node build, Playwright finishes the suite, prints its
 * summary ("N passed"), and THEN dies in libuv teardown
 * (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, src\win\async.c:76,
 * exit 0xC0000409) — reproduced 2/2 on 2026-07-11. The child's exit code is
 * therefore unusable as a gate: a fully green suite exits non-zero.
 *
 * This wrapper spawns `npx playwright test <args>` (no args = ALL specs in
 * tests/e2e per playwright.config.ts), echoes output through, parses the summary
 * lines, and exits on the VERDICT — not the child's exit code:
 *   exit 0  ⇔ at least one test passed AND zero failed/flaky/interrupted/did-not-run
 *   exit 1  ⇔ anything else (failures, no tests found, no summary parseable)
 *
 * Usage:
 *   npm run test:e2e                 # full suite (the gate records should cite)
 *   node scripts/run-e2e.mjs <spec>  # any subset, same verdict semantics
 *
 * NOTE: the suite swaps the live server workspace during the run (workspace-guard
 * restores it). The machine-state rule applies: ask Ken before running.
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const child = spawn('npx', ['playwright', 'test', ...args], {
  shell: process.platform === 'win32',
  stdio: ['inherit', 'pipe', 'pipe'],
});

let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });

child.on('close', (code) => {
  // Playwright list-reporter summary lines, e.g. "  11 passed (30.3s)", "  1 failed".
  const count = (re) => { const m = out.match(re); return m ? parseInt(m[1], 10) : 0; };
  const passed = count(/(\d+)\s+passed/);
  const failed = count(/(\d+)\s+failed/);
  const flaky = count(/(\d+)\s+flaky/);
  const interrupted = count(/(\d+)\s+interrupted/);
  const didNotRun = count(/(\d+)\s+did not run/);
  const noTests = /no tests found/i.test(out);

  // B26: the workspace-guard teardown verifies its own restore and prints a parseable
  // marker — a green suite that leaked test state into the live workspace is NOT green.
  const guardFail = /\[workspace-guard\] RESTORE-VERIFY: FAIL/.test(out);

  const red = failed > 0 || flaky > 0 || interrupted > 0 || didNotRun > 0 || guardFail;
  const green = passed > 0 && !red && !noTests;

  const crashed = code !== 0;
  const detail = `${passed} passed, ${failed} failed, ${flaky} flaky, ${interrupted} interrupted, ${didNotRun} did not run` +
    (noTests ? ', NO TESTS FOUND' : '') +
    (guardFail ? ', WORKSPACE-GUARD RESTORE-VERIFY FAILED' : '') +
    (crashed ? ` (child exit ${code} IGNORED — verdict comes from the summary; libuv teardown crash is a known non-signal)` : '');

  console.log(`\n[run-e2e] VERDICT: ${green ? 'PASS' : 'FAIL'} — ${detail}`);
  process.exit(green ? 0 : 1);
});

child.on('error', (err) => {
  console.error(`[run-e2e] failed to spawn playwright: ${err.message}`);
  process.exit(1);
});
