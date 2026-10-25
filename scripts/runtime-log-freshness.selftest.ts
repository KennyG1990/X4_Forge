import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeDebuggerAdapter, expectedInputFromLegacy } from '../src/server/runtimeDebuggerAdapter';
import { RuntimeDebugSessionStore } from '../src/lib/runtimeDebugSession';
import { RuntimeControl } from '../src/server/runtimeControl';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import type { ModWorkspace } from '../src/types';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-log-freshness-'));
const log = path.join(root, 'debug.log'); fs.writeFileSync(log, '');
const now = Date.now();
const marker = (event: string, extra = {}) => 'FORGE-LIFECYCLE ' + JSON.stringify({ v: 1, modId: 'forge_regression_lab', event, ...extra });
const record = { workspaceId: 'ws_111111111111111111111111', workspace: { id: 'forge_regression_lab', name: 'Lab', contentId: 'forge_regression_lab', nodes: [], links: [] } as unknown as ModWorkspace };
const manifest = { 'content.xml': '<content id="forge_regression_lab"/>', 'md/lab.xml': '<mdscript name="lab"><cues/></mdscript>' };
const store = new RuntimeDebugSessionStore({ root: path.join(root, 'sessions'), maxBytesPerIngest: 1024 });
const adapter = new RuntimeDebuggerAdapter({ store, preferredLogPath: log, now: () => now, installedInventory: () => ({ complete: true, scannedAt: new Date(now).toISOString(), extensions: [] }) });
const expectedSteps = expectedInputFromLegacy(['marker:OLD_ONLY']);
const brief = () => adapter.buildBrief({ record, manifest, expectedSteps }).payload;
const control = new RuntimeControl(path.join(root, 'control'), new ActionReceiptStore({ root: path.join(root, 'receipts') }), true, () => now);
const principal = { kind: 'agent' as const, id: 'fixture_agent', label: 'Fixture agent', scope: 'deploy' as const, deployAuthorized: true };
const checks: Record<string, boolean> = {};
try {
  adapter.recordSuccessfulDeploy(record.workspaceId, { modId: 'forge_regression_lab', workspaceName: 'Lab', workspaceHash: 'a'.repeat(16), deployedAt: new Date(now).toISOString() });
  fs.appendFileSync(log, marker('save-loaded') + '\nOLD_ONLY\n' + marker('helper-ready', { boot: 'boot1', ts: Math.floor(now / 1000) }) + '\n');
  let p = brief(); const firstSession = p.session.sessionId;
  checks.initialExpectedObserved = p.expectedSteps.some(x => x.observed);
  fs.appendFileSync(log, '\n'.repeat(1500) + marker('save-loaded') + '\n');
  p = brief();
  const subject = () => ({ workspaceId: record.workspaceId, modId: 'forge_regression_lab', head: 'a'.repeat(16), payload: p });
  const body = { requestId: '1'.repeat(32), command: 'refreshmd', expectedModId: 'forge_regression_lab', expectedWorkspaceHash: 'a'.repeat(16), expectedSessionId: firstSession!, reason: 'Isolated log backlog regression' };
  let refusal = '';
  try { control.request(subject(), body, principal); } catch (e) { refusal = (e as { code: string }).code; }
  const read = (p as typeof p & { logRead?: { state: string; unreadBytes: number; pendingLineBytes: number } }).logRead;
  checks.backlogReported = read?.state === 'catching-up' && read.unreadBytes > 0;
  checks.backlogNotCurrent = p.session.state !== 'current' && !p.verdict.currentSession;
  checks.backlogExpectedNotCurrent = p.expectedSteps.every(x => !x.observed);
  checks.backlogHelperUnavailable = !control.status(subject()).helperAvailable;
  checks.reloadRefused = refusal === 'RUNTIME_LOG_NOT_CURRENT';
  checks.noQueueOrReceipt = !fs.existsSync(path.join(control.channel(record.workspaceId), 'request.txt')) && !fs.existsSync(path.join(root, 'receipts'));
  if (process.argv.includes('--before')) {
    console.log(JSON.stringify({ reproduced: !checks.backlogNotCurrent && !checks.reloadRefused, oldSessionRetained: p.session.sessionId === firstSession, refusal, checks }));
  } else {
    p = brief();
    checks.catchUpFindsNewSave = p.session.sessionId !== firstSession && p.expectedSteps.every(x => !x.observed);
    fs.appendFileSync(log, 'OLD_ONLY\n'); p = brief();
    checks.caughtUpEvidenceRecovers = p.session.state === 'current' && p.expectedSteps.some(x => x.observed);
    const partial = marker('save-loaded'); fs.appendFileSync(log, partial.slice(0, 20)); p = brief();
    checks.partialCannotClaimCurrent = p.session.state !== 'current' && p.expectedSteps.every(x => !x.observed) && !p.verdict.currentSession;
    fs.appendFileSync(log, partial.slice(20) + '\n'); p = brief();
    checks.completeBoundaryClearsOldEvidence = p.session.state === 'current' && p.expectedSteps.every(x => !x.observed);
    fs.appendFileSync(log, 'OLD_ONLY'); p = brief();
    checks.unterminatedEvidenceWithheld = p.expectedSteps.every(x => !x.observed) && p.session.state !== 'current';
    fs.appendFileSync(log, '\n'); p = brief();
    checks.terminatedEvidenceRecovers = p.expectedSteps.some(x => x.observed) && p.session.state === 'current';
    fs.appendFileSync(log, marker('helper-ready', { boot: 'boot2', ts: Math.floor(now / 1000) }) + '\n'); p = brief();
    const queued = control.request(subject(), { ...body, expectedSessionId: p.session.sessionId }, principal);
    checks.caughtUpReloadStillQueues = queued.request?.status === 'queued-awaiting-evidence' && !queued.gameVerified;
    fs.appendFileSync(log, marker('reload-invoked', { boot: 'boot2', ts: Math.floor(now / 1000), requestId: body.requestId, command: body.command }) + '\n'); p = brief();
    checks.caughtUpInvocationStillObserved = control.status(subject()).request?.status === 'invocation-observed';
    fs.appendFileSync(log, 'partial'); p = brief();
    checks.priorInvocationNotFreshDuringPartial = control.status(subject()).request?.status === 'log-not-current' && !control.status(subject()).helperAvailable;

    // Real files mutate during the store read, not between two ordinary polls.
    for (const mode of ['growth', 'replacement', 'deletion'] as const) {
      const raceLog = path.join(root, mode + '.log'); fs.writeFileSync(raceLog, '');
      let mutate = false;
      const raceStore = new RuntimeDebugSessionStore({ root: path.join(root, mode), read: (file, position, length) => {
        const fd = fs.openSync(file, 'r'); const bytes = Buffer.alloc(length);
        let count: number; try { count = fs.readSync(fd, bytes, 0, length, position); } finally { fs.closeSync(fd); }
        if (mutate) {
          mutate = false;
          if (mode === 'growth') fs.appendFileSync(file, marker('save-loaded') + '\n');
          else if (mode === 'deletion') fs.unlinkSync(file);
          else { fs.renameSync(file, file + '.old'); fs.writeFileSync(file, marker('save-loaded') + '\n'); }
        }
        return bytes.subarray(0, count);
      } });
      const raceAdapter = new RuntimeDebuggerAdapter({ store: raceStore, preferredLogPath: raceLog, installedInventory: () => ({ complete: true, scannedAt: new Date(now).toISOString(), extensions: [] }) });
      raceAdapter.recordSuccessfulDeploy(record.workspaceId, { modId: 'forge_regression_lab', workspaceName: 'Lab', workspaceHash: 'a'.repeat(16), deployedAt: new Date(now).toISOString() });
      fs.appendFileSync(raceLog, 'OLD_ONLY\n'); mutate = true;
      const race = raceAdapter.buildBrief({ record, manifest, expectedSteps }).payload;
      checks[mode + 'DuringReadWithheld'] = race.session.state !== 'current' && !race.verdict.currentSession && race.expectedSteps.every(x => !x.observed);
    }
    console.log(JSON.stringify({ pass: Object.values(checks).every(Boolean), checks }));
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify(checks));
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
