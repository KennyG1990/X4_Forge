import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createForgePerformanceCollector } from './forgePerformance';
import { clientRequestDeadlineMs, createAbortDeadline, timeoutError, type AbortDeadline } from './requestDeadline';
import { ACTION_OPERATION_ID_HEADER, resolveActionOperationId } from '../../shared/actionOperationId';
import { createWebviewPerformanceController, observeOwnedFetchPromise, WEBVIEW_PERFORMANCE_MAX_DURATION_MS, type WebviewPerformanceController, type WebviewPerformanceEnvironment } from './webviewPerformance';

class WebviewTestEnvironment implements WebviewPerformanceEnvironment {
  time = 0;
  private nextId = 1;
  timers = new Map<number, { at: number; callback: () => void }>();
  maxTimers = 0;
  now = () => this.time;
  wallNow = () => 10_000 + this.time;
  origin = () => 'https://forge.test';
  setTimer = (callback: () => void, durationMs: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + durationMs, callback });
    this.maxTimers = Math.max(this.maxTimers, this.timers.size);
    return id;
  };
  clearTimer = (handle: unknown) => { this.timers.delete(Number(handle)); };
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const due = [...this.timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.time = due[1].at; this.timers.delete(due[0]); due[1].callback();
    }
    this.time = target;
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Exercise the owner's underlying transport boundary, never install this on the
// returned outer Promise. The actual rejection-event probe below tests adoption.
function observeTransport(controller: WebviewPerformanceController, delegate: typeof fetch): typeof fetch {
  return function(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const observation = controller.beginRequest(input, init);
    try { return observation.observeOwnedPromise(delegate.call(this, input, init)); }
    catch (error) { observation.failure(error); throw error; }
  };
}

/** Exercise the actual fetch owner without importing main.tsx's app bootstrap.
 * Existing TypeScript is loaded only when this explicit selftest runs. */
async function mainFetchFixtureFactory() {
  const [{ readFile }, { default: ts }] = await Promise.all([import('node:fs/promises'), import('typescript')]);
  const text = await readFile('src/main.tsx', 'utf8');
  const source = ts.createSourceFile('main.tsx', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const variables = source.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
  const owner = variables.find(declaration => declaration.name.getText(source) === 'customFetch')?.initializer;
  const backoffs = variables.find(declaration => declaration.name.getText(source) === 'API_BOOT_BACKOFFS_MS')?.initializer;
  const method = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'methodOf');
  if (!owner || !backoffs || !method || !ts.isFunctionExpression(owner)) throw new Error('Actual main.tsx fetch owner could not be loaded for its cancellation control.');
  const javascript = ts.transpileModule(`${method.getText(source)}\nconst API_BOOT_BACKOFFS_MS = ${backoffs.getText(source)};\nconst customFetch = ${owner.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return (delegate: typeof fetch, options?: { deadlineMs?: number }) => {
    const headers: Response[] = []; const failures: unknown[] = []; const delays: number[] = [];
    const deadlines = new Set<AbortDeadline>(); let released = 0; let ownedPromises = 0;
    // BEGIN BATCH3 native fetch deadline fixture
    const deadlineDurations: number[] = [];
    // END BATCH3 native fetch deadline fixture
    const dependencies = {
      beginWebviewPerformanceRequest: () => ({
        headers: (response: Response) => { headers.push(response); },
        failure: (error: unknown) => { failures.push(error); },
        observeOwnedPromise: (promise: Promise<Response>) => {
          ownedPromises++;
          return observeOwnedFetchPromise(promise, response => { headers.push(response); }, error => { failures.push(error); });
        },
      }),
      location: { origin: 'https://forge.test' }, clientRequestDeadlineMs, timeoutError,
      createAbortDeadline: (upstream: AbortSignal | null | undefined, durationMs: number) => {
        // BEGIN BATCH3 native fetch bounded deadline injection
        deadlineDurations.push(durationMs);
        const deadline = createAbortDeadline(upstream, options?.deadlineMs ?? durationMs); deadlines.add(deadline);
        // END BATCH3 native fetch bounded deadline injection
        return { ...deadline, release: () => { released++; deadlines.delete(deadline); deadline.release(); } };
      },
      originalFetch: delegate, sessionStorage: { getItem: () => 'fixture_session' },
      window: { __X4_WORKSPACE_CONTEXT__: { getWorkspaceId: () => 'ws_111111111111111111111111' } },
      clientId: 'client_fixture', ACTION_OPERATION_ID_HEADER, resolveActionOperationId,
      studioStrongRandomBytes: (count: number) => new Uint8Array(count).fill(1),
      delay: async (durationMs: number) => { delays.push(durationMs); },
    };
    const fetch = new Function(...Object.keys(dependencies), `${javascript}\nreturn customFetch;`)(...Object.values(dependencies)) as typeof globalThis.fetch;
    return { fetch, headers, failures, delays, activeDeadlines: () => deadlines.size, released: () => released,
      ownedPromises: () => ownedPromises,
      // BEGIN BATCH3 native fetch fixture durations
      deadlineDurations,
      // END BATCH3 native fetch fixture durations
      dispose: () => { for (const deadline of deadlines) deadline.release(); deadlines.clear(); } };
  };
}

/** Actual unhandled rejections need an isolated process: do not contaminate the
 * selftest host's existing global error handlers. Executes the loaded helper's
 * actual function source; no files, ports, profiles or helper family are made. */
function unhandledRejectionProbe() {
  const source = observeOwnedFetchPromise.toString();
  if (source.length > 24_000) return { pass: false, code: 'unexpected-helper-size' };
  const script = `
    const observe = (${source});
    const events = [];
    process.on('unhandledRejection', (reason, promise) => events.push({ reason, promise }));
    process.on('rejectionHandled', () => {});
    const turn = () => new Promise(resolve => setImmediate(resolve));
    let observedFailures = 0;
    const reason = new Error('owner rejection sentinel');
    const raw = Promise.reject(reason);
    let adopted;
    const owner = (async () => { adopted = observe(raw, () => {}, () => { observedFailures++; }); return adopted; })();
    await turn();
    const exactUnhandled = events.length === 1 && events[0].reason === reason && events[0].promise === owner;
    void owner.catch(() => {});
    await turn();
    const handledReason = new Error('handled owner sentinel');
    const handled = (async () => observe(Promise.reject(handledReason), () => {}, () => { throw new Error('recorder failure'); }))();
    let caught;
    try { await handled; } catch (error) { caught = error; }
    await turn();
    const noSpuriousUnhandled = events.length === 1 && caught === handledReason;
    const wrongOwner = (async () => { throw new Error('negative-control wrong placement'); })();
    observe(wrongOwner, () => {}, () => {});
    await turn();
    const negativeControlSuppresses = events.length === 1;
    const facts = { exactUnhandled, noSpuriousUnhandled, negativeControlSuppresses,
      underlyingIdentity: adopted === raw, observedFailures };
    process.stdout.write(JSON.stringify(facts));
    process.exitCode = exactUnhandled && noSpuriousUnhandled && negativeControlSuppresses && adopted === raw && observedFailures === 1 ? 0 : 1;
  `;
  const child = spawnSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  let facts: Record<string, unknown> | null = null;
  try { facts = JSON.parse(child.stdout || ''); } catch { /* non-success remains explicit */ }
  return { pass: child.status === 0 && !child.error && facts?.exactUnhandled === true && facts?.noSpuriousUnhandled === true
    && facts?.negativeControlSuppresses === true && facts?.underlyingIdentity === true && facts?.observedFailures === 1,
  status: child.status, signal: child.signal, launchError: child.error ? child.error.name : null, facts };
}

/** Injected clocks/transports plus one bounded actual rejection-event child.
 * This starts no browser, request, scan, real sampler or evidence writer. */
export async function runWebviewPerformanceSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
  const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  const environment = new WebviewTestEnvironment();
  const controller = createWebviewPerformanceController({ environment });
  check('default disabled has no lease timer or observations', !controller.read().snapshot.enabled && environment.timers.size === 0
    && controller.read().snapshot.resources.length === 0 && controller.read().snapshot.operations.length === 0);
  const disabledPromise = Promise.resolve(new Response('untouched'));
  let disabledThenReads = 0;
  Object.defineProperty(disabledPromise, 'then', { get() { disabledThenReads++; throw new Error('Disabled collection must not attach observers.'); } });
  const disabledFetch = observeTransport(controller, () => disabledPromise);
  check('disabled returns original promise without reading then', disabledFetch('/api/agent/compile') === disabledPromise && disabledThenReads === 0);
  for (const duration of [0, -1, NaN, Infinity, 1.5, WEBVIEW_PERFORMANCE_MAX_DURATION_MS + 1, '100' as unknown as number]) {
    check(`rejects malformed or excessive lease ${String(duration)}`, controller.start(duration).ok === false && environment.timers.size === 0);
  }
  check('explicit lease starts one timer', controller.start(1000).ok && environment.timers.size === 1);
  const overlap = controller.start(1000);
  check('overlapping start refuses without another timer', overlap.ok === false && overlap.code === 'collection-active' && environment.timers.size === 1);

  const pending = deferred<Response>();
  const caller = { source: 'caller' };
  const abort = new AbortController();
  const init: RequestInit = { method: 'POST', signal: abort.signal, body: 'PRIVATE_BODY', headers: { Authorization: 'PRIVATE_KEY' } };
  const transportObservation: { receiver?: unknown } = {};
  let seenInput: unknown; let seenInit: unknown; let calls = 0;
  const transport = function(this: unknown, input: RequestInfo | URL, options?: RequestInit) {
    calls++; transportObservation.receiver = this; seenInput = input; seenInit = options; return pending.promise;
  };
  const observed = observeTransport(controller, transport);
  const input = 'https://forge.test/api/agent/compile?secret=PRIVATE_QUERY&path=PRIVATE_PATH';
  const returned = observed.call(caller, input, init);
  check('preserves exact promise and invocation arguments', returned === pending.promise && transportObservation.receiver === caller && seenInput === input && seenInit === init && calls === 1);
  check('does not count promise dispatch as completion', controller.read().snapshot.operations.length === 0);
  const response = new Response('PRIVATE_RESPONSE');
  let bodyReads = 0;
  Object.defineProperty(response, 'json', { value() { bodyReads++; throw new Error('Response body must not be read.'); } });
  Object.defineProperty(response, 'clone', { value() { bodyReads++; throw new Error('Response body must not be cloned.'); } });
  environment.advance(150); pending.resolve(response);
  check('settlement preserves response identity and body state', await returned === response && !response.bodyUsed && bodyReads === 0);
  const first = controller.read();
  check('records headers-only elapsed time once', first.snapshot.operations.length === 1 && first.snapshot.operations[0].count === 1
    && first.snapshot.operations[0].totalMs === 150 && first.snapshot.operations[0].name === 'http.POST.compile.headers'
    && first.coverage.fetch === 'logical-request-response-headers-only' && first.coverage.responseBodies === 'not-observed');
  check('retains no URL query body response or credentials', !/PRIVATE_/.test(JSON.stringify(first)));
  check('exported snapshot and adapter metadata are immutable', Object.isFrozen(first) && Object.isFrozen(first.collection)
    && Object.isFrozen(first.coverage) && Object.isFrozen(first.snapshot.resources));

  const retryFirst = deferred<Response>(); const retryBackoff = deferred<void>(); const retryLast = deferred<Response>();
  let ownerAttempts = 0;
  const ownerPromise = (async () => {
    ownerAttempts++;
    const firstHeaders = await retryFirst.promise;
    if (firstHeaders.status !== 503) return firstHeaders;
    await retryBackoff.promise; ownerAttempts++;
    return retryLast.promise;
  })();
  const logicalRetry = observeTransport(controller, () => ownerPromise)('/api/agent/workspace');
  environment.advance(25); retryFirst.resolve(new Response(null, { status: 503 })); await Promise.resolve();
  check('owner-controlled intermediate retry headers do not finish the logical span', ownerAttempts === 1
    && !controller.read().snapshot.operations.some(row => row.name === 'http.GET.workspace.headers'));
  environment.advance(200); retryBackoff.resolve(); await Promise.resolve();
  const recovered = new Response('recovered'); environment.advance(75); retryLast.resolve(recovered);
  check('one logical settlement includes owner retry and backoff', logicalRetry === ownerPromise && await logicalRetry === recovered
    && ownerAttempts === 2 && controller.read().snapshot.operations.some(row => row.name === 'http.GET.workspace.headers' && row.count === 1 && row.totalMs === 300));

  const failed = deferred<Response>();
  const rejection = new Error('PRIVATE_ERROR');
  const failedReturned = observeTransport(controller, () => failed.promise)('/api/agent/project/validate');
  failed.reject(rejection); let caught: unknown;
  try { await failedReturned; } catch (error) { caught = error; }
  check('preserves rejection object and promise identity', failedReturned === failed.promise && caught === rejection);
  const aborted = deferred<Response>();
  const abortReason = new DOMException('PRIVATE_ABORT', 'AbortError');
  const abortedReturned = observeTransport(controller, (_url, options) => {
    check('preserves supplied abort signal reference', options?.signal === abort.signal); return aborted.promise;
  })('/api/agent/project/validate', init);
  abort.abort(abortReason); aborted.reject(abortReason); caught = undefined;
  try { await abortedReturned; } catch (error) { caught = error; }
  check('observes abort without wrapping or replacing its reason', caught === abortReason && abortedReturned === aborted.promise
    && controller.read().snapshot.operations.some(row => row.outcomes.aborted === 1));
  const httpError = new Response('server refusal', { status: 503 });
  const httpPromise = Promise.resolve(httpError);
  const httpReturned = observeTransport(controller, () => httpPromise)('/api/agent/compile');
  check('HTTP failure stays fulfilled with original response', httpReturned === httpPromise && await httpReturned === httpError
    && controller.read().snapshot.operations.some(row => row.name === 'http.GET.compile.headers' && row.outcomes.error === 1));
  const syncError = new Error('synchronous delegate failure'); caught = undefined;
  try { observeTransport(controller, () => { throw syncError; })('/api/agent/compile'); } catch (error) { caught = error; }
  check('preserves synchronous delegate failure identity', caught === syncError);
  const operationsBeforeExternal = controller.read().snapshot.operations.reduce((sum, row) => sum + row.count, 0);
  const external = Promise.resolve(new Response('outside scope'));
  check('cross-origin and non-API transport are unchanged', observeTransport(controller, () => external)('https://external.test/api/secret') === external
    && observeTransport(controller, () => external)('/assets/private.xml') === external);
  check('external traffic does not acquire API attribution', controller.read().snapshot.operations.reduce((sum, row) => sum + row.count, 0) === operationsBeforeExternal);
  const unknown = observeTransport(controller, () => Promise.resolve(new Response('ok')));
  await Promise.all(Array.from({ length: 80 }, (_, index) => unknown(`/api/arbitrary/PRIVATE_PATH_${index}?PRIVATE_QUERY=${index}`)));
  check('arbitrary route cardinality shares one redacted bucket', controller.read().snapshot.operations.filter(row => row.name === 'http.GET.api.other.headers').length === 1
    && !/PRIVATE_/.test(JSON.stringify(controller.read())));

  controller.setSupport({ frames: 'observing', longTasks: 'unsupported', visibility: 'visible' });
  controller.recordLongTask(160, true);
  check('unsupported observer never produces a zero or task fact', controller.read().snapshot.operations.every(row => row.name !== 'ui.longtask'));
  controller.setSupport({ longTasks: 'supported' });
  controller.recordLongTask(0, true); controller.recordLongTask(NaN, true);
  check('malformed or non-longtask duration cannot become a stall fact', controller.read().snapshot.operations.every(row => row.name !== 'ui.longtask'));
  controller.recordLongTask(160, false);
  check('hidden longtask is not attributed to visible work', controller.read().snapshot.operations.every(row => row.name !== 'ui.longtask'));
  controller.recordLongTask(160, true);
  check('existing longtask observation becomes bounded fact', controller.read().snapshot.operations.some(row => row.name === 'ui.longtask' && row.totalMs === 160));
  controller.recordFrame({ fps: 60, frameIntervalMs: 1000 / 60, jsHeapUsedBytes: null, visibility: 'visible' });
  const resource = controller.read().snapshot.resources.at(-1)!;
  check('frame cadence preserves unavailable process and heap fields', resource.fps === 60 && resource.frameIntervalMs === 1000 / 60
    && resource.cpuOneCorePercent === null && resource.rssBytes === null && resource.jsHeapUsedBytes === null && controller.read().coverage.heap === 'unavailable');
  controller.recordFrame({ fps: 200, frameIntervalMs: 5, visibility: 'hidden' });
  check('hidden frame window remains unknown rather than fabricated foreground FPS', controller.read().snapshot.resources.at(-1)?.fps === null
    && controller.read().snapshot.resources.at(-1)?.frameIntervalMs === null);
  const staleTimer = [...environment.timers.values()][0].callback;
  controller.stop(); controller.stop();
  check('idempotent stop disables recording and clears lease timer', !controller.isCollecting() && !controller.read().snapshot.enabled && environment.timers.size === 0);
  const old = deferred<Response>();
  controller.start(1000);
  const oldReturned = observeTransport(controller, () => old.promise)('/api/agent/compile');
  controller.stop(); controller.start(1000); staleTimer();
  old.resolve(new Response('old collection')); await oldReturned;
  check('old timer and old request cannot contaminate a new lease', controller.isCollecting() && controller.read().snapshot.operations.length === 0
    && controller.read().coverage.ignoredCompletions === 1 && environment.maxTimers === 1);
  environment.advance(1000);
  check('lease expires without waiting for a snapshot or frame callback', !controller.read().collection.active
    && controller.read().collection.stopReason === 'expired' && !controller.read().snapshot.enabled && environment.timers.size === 0);
  controller.start(1000); environment.time += 1001;
  controller.recordFrame({ fps: 60, frameIntervalMs: 16, visibility: 'visible' });
  check('late expiry timer cannot permit post-deadline samples', controller.read().snapshot.resources.length === 0 && environment.timers.size === 0);
  controller.dispose(); controller.dispose();
  check('dispose is terminal and leaves no timer', !controller.start(1000).ok && controller.read().snapshot.disposed && environment.timers.size === 0);

  const clockFailure = createWebviewPerformanceController({ environment: { ...environment, now: () => NaN } });
  check('unavailable monotonic clock refuses unbounded collection', !clockFailure.start().ok && !clockFailure.read().collection.active);
  const timerFailure = createWebviewPerformanceController({ environment: { ...environment, setTimer: () => { throw new Error('timer unavailable'); } } });
  check('timer failure cannot leave recording enabled', !timerFailure.start().ok && !timerFailure.read().snapshot.enabled);
  const unavailableTimer = timerFailure.read().collection; const unavailableRestart = timerFailure.start();
  check('unreturned timer handle retains one uncertain slot and refuses restart', unavailableTimer.cleanupUnconfirmed
    && unavailableTimer.ownedTimerCount === 1 && unavailableTimer.failedTimerCount === 1 && unavailableRestart.ok === false && unavailableRestart.code === 'cleanup-unconfirmed');
  let immediateClears = 0;
  const immediateTimer = createWebviewPerformanceController({ environment: { ...environment, setTimer: callback => { callback(); return 1; }, clearTimer: () => { immediateClears++; throw new Error('already settled'); } } });
  check('synchronous broken timer cannot re-enable an expired lease', !immediateTimer.start().ok && !immediateTimer.read().snapshot.enabled && !immediateTimer.read().collection.active
    && !immediateTimer.read().collection.cleanupUnconfirmed && immediateTimer.read().collection.ownedTimerCount === 0 && immediateClears === 0);
  const clearEnvironment = new WebviewTestEnvironment(); let clearFails = true; let clearAttempts = 0;
  const cleanup = createWebviewPerformanceController({ environment: { ...clearEnvironment, clearTimer: handle => {
    clearAttempts++; if (clearFails) throw new Error('clear unavailable'); clearEnvironment.clearTimer(handle);
  } } });
  cleanup.start(1000); const failedClearCallback = [...clearEnvironment.timers.values()][0].callback; cleanup.stop();
  const failedClear = cleanup.read();
  check('failed clear keeps ownership while recording is disabled', !failedClear.collection.active && !failedClear.snapshot.enabled
    && failedClear.collection.cleanupUnconfirmed && failedClear.collection.ownedTimerCount === 1 && failedClear.collection.failedTimerCount === 1 && clearEnvironment.timers.size === 1);
  let refusedStarts = 0;
  for (let attempt = 0; attempt < 20; attempt++) { const result = cleanup.start(1000); if (result.ok === false && result.code === 'cleanup-unconfirmed') refusedStarts++; }
  check('failed clear cannot accumulate timers through repeated starts', refusedStarts === 20 && clearEnvironment.maxTimers === 1 && clearEnvironment.timers.size === 1 && clearAttempts === 1);
  clearFails = false; cleanup.stop();
  check('explicit stop retries and confirms the same failed timer', !cleanup.read().collection.cleanupUnconfirmed && cleanup.read().collection.ownedTimerCount === 0
    && cleanup.read().collection.failedTimerCount === 0 && clearEnvironment.timers.size === 0 && clearAttempts === 2);
  cleanup.start(1000); failedClearCallback();
  check('late failed-clear callback cannot settle another lease owner', cleanup.isCollecting() && cleanup.read().collection.ownedTimerCount === 1 && clearEnvironment.timers.size === 1);
  clearFails = true; cleanup.dispose();
  check('dispose does not hide failed timer cleanup', cleanup.read().snapshot.disposed && cleanup.read().collection.cleanupUnconfirmed
    && cleanup.read().collection.ownedTimerCount === 1 && clearEnvironment.timers.size === 1);
  clearFails = false; cleanup.dispose();
  check('repeated dispose retries failed timer cleanup without restarting', cleanup.read().snapshot.disposed && !cleanup.read().collection.cleanupUnconfirmed
    && cleanup.read().collection.ownedTimerCount === 0 && clearEnvironment.timers.size === 0 && !cleanup.start().ok);
  const settledEnvironment = new WebviewTestEnvironment();
  const settled = createWebviewPerformanceController({ environment: { ...settledEnvironment, clearTimer: () => { throw new Error('clear unavailable'); } } });
  settled.start(1000); settled.stop(); settledEnvironment.advance(1000);
  check('delivery of a failed-clear one-shot confirms its retained slot settled', !settled.read().collection.cleanupUnconfirmed
    && settled.read().collection.ownedTimerCount === 0 && settledEnvironment.timers.size === 0);
  const setThenThrowEnvironment = new WebviewTestEnvironment();
  const setThenThrow = createWebviewPerformanceController({ environment: { ...setThenThrowEnvironment, setTimer: (callback, durationMs) => {
    setThenThrowEnvironment.setTimer(callback, durationMs); throw new Error('scheduled before adapter failure');
  } } });
  const uncertainStart = setThenThrow.start(1000); const uncertainView = setThenThrow.read(); const uncertainSecond = setThenThrow.start(1000);
  check('set failure after scheduling retains uncertainty instead of admitting a second timer', !uncertainStart.ok && !uncertainView.snapshot.enabled
    && uncertainView.collection.cleanupUnconfirmed && uncertainView.collection.ownedTimerCount === 1 && uncertainView.collection.failedTimerCount === 1
    && uncertainSecond.ok === false && uncertainSecond.code === 'cleanup-unconfirmed' && setThenThrowEnvironment.maxTimers === 1);
  setThenThrowEnvironment.advance(1000);
  check('eventual callback can settle an unreturned timer handle', !setThenThrow.read().collection.cleanupUnconfirmed
    && setThenThrow.read().collection.ownedTimerCount === 0 && setThenThrowEnvironment.timers.size === 0);
  const synchronousThrow = createWebviewPerformanceController({ environment: { ...environment, setTimer: callback => { callback(); throw new Error('failure after synchronous settlement'); } } });
  check('synchronous callback followed by set failure remains settled and disabled', !synchronousThrow.start(1000).ok
    && !synchronousThrow.read().snapshot.enabled && !synchronousThrow.read().collection.cleanupUnconfirmed && synchronousThrow.read().collection.ownedTimerCount === 0);
  const registrationEnvironment = new WebviewTestEnvironment(); let registrationClearFails = true;
  const registrationStop: WebviewPerformanceController = createWebviewPerformanceController({ environment: { ...registrationEnvironment, setTimer: (callback, durationMs) => {
    const handle = registrationEnvironment.setTimer(callback, durationMs); registrationStop.stop(); return handle;
  }, clearTimer: handle => { if (registrationClearFails) throw new Error('registration cleanup unavailable'); registrationEnvironment.clearTimer(handle); } } });
  const stoppedWhileRegistering = registrationStop.start(1000);
  check('stop during timer registration retains a returned handle if subsequent cleanup fails', !stoppedWhileRegistering.ok
    && !registrationStop.read().snapshot.enabled && registrationStop.read().collection.cleanupUnconfirmed && registrationStop.read().collection.ownedTimerCount === 1
    && registrationEnvironment.maxTimers === 1);
  registrationClearFails = false; registrationStop.stop();
  check('registration-time cleanup remains retryable', !registrationStop.read().collection.cleanupUnconfirmed && registrationStop.read().collection.ownedTimerCount === 0 && registrationEnvironment.timers.size === 0);
  const maximumEnvironment = new WebviewTestEnvironment();
  const maximumLease = createWebviewPerformanceController({ environment: maximumEnvironment });
  check('fifteen-minute bounded collection is accepted', maximumLease.start(WEBVIEW_PERFORMANCE_MAX_DURATION_MS).ok
    && maximumLease.read().collection.durationMs === 900_000 && maximumEnvironment.timers.size === 1);
  const recorderEnvironment = new WebviewTestEnvironment();
  const real = createForgePerformanceCollector({ component: 'webview', scope: 'webview', now: recorderEnvironment.now, wallNow: recorderEnvironment.wallNow });
  const broken = createWebviewPerformanceController({ environment: recorderEnvironment, collector: { ...real,
    recordOperation() { throw new Error('recorder failure'); }, recordResource() { throw new Error('recorder failure'); } } });
  broken.start(1000);
  const unaffected = Promise.resolve(new Response('unchanged'));
  const unaffectedReturned = observeTransport(broken, () => unaffected)('/api/agent/compile');
  await unaffectedReturned;
  broken.recordFrame({ fps: 60, frameIntervalMs: 16, visibility: 'visible' });
  check('recorder failures cannot alter transport or escape producers', unaffectedReturned === unaffected && broken.read().coverage.adapterErrors >= 2);
  broken.dispose(); clockFailure.dispose(); timerFailure.dispose(); immediateTimer.dispose(); maximumLease.dispose();
  cleanup.dispose(); settled.dispose(); setThenThrow.dispose(); synchronousThrow.dispose(); registrationStop.dispose();
  const mainFetchFixture = await mainFetchFixtureFactory();
  for (const route of ['/api/agent/performance/collection', '/api/agent/performance/profile']) {
    const upstream = new AbortController(); const pending = deferred<Response>();
    const caller = { fixture: route }; const body = 'UNCHANGED_CONTROL_BODY';
    const controlObservation: { receiver?: unknown } = {};
    let calledInput: RequestInfo | URL | undefined; let calledInit: RequestInit | undefined;
    let calls = 0; let abortEvents = 0; let abortListenerRemovals = 0;
    const removeListener = upstream.signal.removeEventListener.bind(upstream.signal);
    upstream.signal.removeEventListener = (...args: Parameters<AbortSignal['removeEventListener']>) => {
      if (args[0] === 'abort') abortListenerRemovals++;
      removeListener(...args);
    };
    const fixture = mainFetchFixture(function(this: unknown, input, init) {
      calls++; controlObservation.receiver = this; calledInput = input; calledInit = init;
      init?.signal?.addEventListener('abort', () => { abortEvents++; }, { once: true });
      return pending.promise;
    });
    try {
      const returned = fixture.fetch.call(caller, route, { method: 'POST', signal: upstream.signal, body });
      const settled = returned.then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
      check(`${route} retains its deadline while transport is pending`, calls === 1 && fixture.activeDeadlines() === 1
        && fixture.released() === 0 && fixture.ownedPromises() === 0 && fixture.headers.length === 0 && fixture.failures.length === 0);
      const reason = new DOMException('pending control cancellation', 'AbortError');
      upstream.abort(reason);
      check(`${route} forwards upstream abort before transport settlement`, abortEvents === 1
        && calledInit?.signal?.aborted === true && calledInit.signal.reason === reason
        && fixture.activeDeadlines() === 1 && fixture.released() === 0 && abortListenerRemovals === 0);
      pending.reject(reason);
      const result = await settled;
      check(`${route} preserves rejection and cleans its deadline after settlement`, result.error === reason
        && fixture.failures.length === 1 && fixture.failures[0] === reason && fixture.headers.length === 0
        && fixture.released() === 1 && fixture.activeDeadlines() === 0 && abortListenerRemovals === 1
        && controlObservation.receiver === caller && calledInput === route && calledInit?.body === body && calls === 1 && fixture.delays.length === 0);
    } finally { fixture.dispose(); }
  }
  const requestAbort = new AbortController();
  const request = new Request('https://forge.test/api/agent/performance/profile', { method: 'POST', signal: requestAbort.signal, body: 'REQUEST_BODY' });
  const requestPending = deferred<Response>(); let requestSignal: AbortSignal | null | undefined;
  const requestFixture = mainFetchFixture((_input, init) => { requestSignal = init?.signal; return requestPending.promise; });
  try {
    const returned = requestFixture.fetch(request);
    const settled = returned.then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
    const reason = new DOMException('inherited Request cancellation', 'AbortError'); requestAbort.abort(reason);
    check('performance Request inherits POST and forwards its supplied signal', requestFixture.activeDeadlines() === 1
      && requestFixture.ownedPromises() === 0 && requestSignal?.aborted === true && requestSignal.reason === reason);
    requestPending.reject(reason); const result = await settled;
    check('performance Request releases inherited cancellation listener after rejection', result.error === reason
      && requestFixture.activeDeadlines() === 0 && requestFixture.released() === 1 && requestFixture.failures[0] === reason);
  } finally { requestFixture.dispose(); }

  const successPending = deferred<Response>();
  const successFixture = mainFetchFixture(() => successPending.promise);
  try {
    const returned = successFixture.fetch('https://forge.test/api/agent/performance/collection', { method: 'post', body: 'UNCHANGED_BODY' });
    const refusal = new Response('UNREAD_RESPONSE', { status: 409 }); let reads = 0;
    Object.defineProperty(refusal, 'json', { value() { reads++; throw new Error('The transport must not read bodies.'); } });
    Object.defineProperty(refusal, 'clone', { value() { reads++; throw new Error('The transport must not clone bodies.'); } });
    check('same-origin absolute lowercase POST awaits settlement', successFixture.activeDeadlines() === 1 && successFixture.released() === 0);
    successPending.resolve(refusal);
    check('performance HTTP refusal preserves headers response and unread body without retry', await returned === refusal
      && successFixture.headers.length === 1 && successFixture.headers[0] === refusal && successFixture.failures.length === 0
      && !refusal.bodyUsed && reads === 0 && successFixture.released() === 1 && successFixture.activeDeadlines() === 0 && successFixture.delays.length === 0);
  } finally { successFixture.dispose(); }

  for (const [input, method, expectedDeadlines] of [
    ['/api/agent/compile', 'POST', 1], ['/api/agent/performance/profile/extra', 'POST', 1],
    ['/api/agent/performance/collection-extra', 'POST', 1], ['/api/agent/performance/profile', 'PUT', 1],
    ['https://external.test/api/agent/performance/profile', 'POST', 0],
  ] as const) {
    const pending = deferred<Response>(); const fixture = mainFetchFixture(() => pending.promise);
    try {
      const returned = fixture.fetch(input, { method, body: 'UNCHANGED_LEGACY_BODY' });
      const reason = new Error('unchanged legacy rejection');
      const settled = returned.then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
      check(`${method} ${input} retains pre-existing fast-path lifetime`, fixture.released() === expectedDeadlines
        && fixture.activeDeadlines() === 0 && fixture.ownedPromises() === 1);
      pending.reject(reason); const result = await settled;
      check(`${method} ${input} retains rejection identity without retry`, result.error === reason
        && fixture.failures.length === 1 && fixture.failures[0] === reason && fixture.headers.length === 0 && fixture.delays.length === 0);
    } finally { fixture.dispose(); }
  }
  for (const [input, method] of [['/api/agent/workspace', 'GET'], ['/api/agent/workspaces/bootstrap', 'POST']] as const) {
    let attempts = 0; const operationIds: Array<string | null> = []; const response = new Response('UNREAD_RETRY_BODY');
    const fixture = mainFetchFixture((_input, init) => {
      operationIds.push(new Headers(init?.headers).get(ACTION_OPERATION_ID_HEADER));
      return Promise.resolve(++attempts === 1 ? new Response(null, { status: 503 }) : response);
    });
    try {
      const returned = await fixture.fetch(input, { method });
      check(`${method} ${input} keeps its existing retry and single headers observation`, returned === response
        && !response.bodyUsed && attempts === 2 && fixture.delays.length === 1 && fixture.delays[0] === 200
        && fixture.headers.length === 1 && fixture.headers[0] === response && fixture.failures.length === 0
        && fixture.ownedPromises() === 0 && fixture.released() === 1 && fixture.activeDeadlines() === 0
        && (method === 'GET' || operationIds[0] !== null && operationIds[0] === operationIds[1]));
    } finally { fixture.dispose(); }
  }
  const actualRejection = unhandledRejectionProbe();
  check('actual unhandled-rejection identity and recorder-failure negative', actualRejection.pass, actualRejection);
  // BEGIN BATCH3 native fetch default coverage
  checks.push(...(await runNativePerformanceFetchSelftest()).checks);
  // END BATCH3 native fetch default coverage
  const passed = checks.filter(row => row.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
// BEGIN BATCH3 native fetch cancellation tests
/** Actual main.tsx customFetch AST, injected transport, existing deadline owner.
 * The 5ms deadline probe changes only fixture timing, not the product's 30s budget. */
export async function runNativePerformanceFetchSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });
  const mainFetchFixture = await mainFetchFixtureFactory();
  const routes = [
    ['GET', '/api/agent/performance/native'],
    ['POST', '/api/agent/performance/native/collection'],
    ['POST', '/api/agent/performance/native/stop'],
  ] as const;
  for (const [method, route] of routes) {
    const upstream = new AbortController(), pending = deferred<Response>();
    let calls = 0, abortEvents = 0, removals = 0;
    let calledInput: RequestInfo | URL | undefined, calledInit: RequestInit | undefined;
    const remove = upstream.signal.removeEventListener.bind(upstream.signal);
    upstream.signal.removeEventListener = (...args: Parameters<AbortSignal['removeEventListener']>) => { if (args[0] === 'abort') removals++; remove(...args); };
    const body = method === 'POST' ? 'UNCHANGED_NATIVE_CONTROL_BODY' : undefined;
    const fixture = mainFetchFixture((input, init) => {
      calls++; calledInput = input; calledInit = init;
      init?.signal?.addEventListener('abort', () => { abortEvents++; }, { once: true }); return pending.promise;
    });
    try {
      const result = fixture.fetch(route, { method, signal: upstream.signal, body }).then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
      check(`native ${method} ${route} retains owned deadline until headers`, calls === 1 && fixture.activeDeadlines() === 1 && fixture.released() === 0 && fixture.ownedPromises() === 0
        && fixture.headers.length === 0 && fixture.failures.length === 0 && fixture.deadlineDurations.length === 1 && fixture.deadlineDurations[0] === 30_000);
      const reason = new DOMException('native pre-header caller cancellation', 'AbortError'); upstream.abort(reason);
      check(`native ${method} ${route} forwards caller cancellation before settlement`, abortEvents === 1 && calledInit?.signal?.aborted === true && calledInit.signal.reason === reason
        && fixture.released() === 0 && fixture.activeDeadlines() === 1 && removals === 0);
      pending.reject(reason); const settled = await result;
      check(`native ${method} ${route} cancels once without retry and releases only owned listeners`, settled.error === reason && calls === 1 && fixture.delays.length === 0
        && calledInput === route && calledInit?.body === body && fixture.released() === 1 && fixture.activeDeadlines() === 0 && removals === 1
        && fixture.failures.length === 1 && fixture.failures[0] === reason && fixture.headers.length === 0);
    } finally { pending.reject(new Error('fixture cleanup')); fixture.dispose(); }

    let attempts = 0, bodyReads = 0;
    const refusal = new Response('UNREAD_NATIVE_REFUSAL', { status: 503 });
    Object.defineProperty(refusal, 'json', { value() { bodyReads++; throw new Error('transport must not parse native bodies'); } });
    Object.defineProperty(refusal, 'clone', { value() { bodyReads++; throw new Error('transport must not duplicate native bodies'); } });
    const refusalFixture = mainFetchFixture(() => { attempts++; return Promise.resolve(refusal); });
    try {
      const received = await refusalFixture.fetch(`https://forge.test${route}`, { method: method.toLowerCase(), body });
      check(`native ${method} ${route} preserves unread refusal with no boot retry`, received === refusal && attempts === 1 && refusalFixture.delays.length === 0
        && bodyReads === 0 && !refusal.bodyUsed && refusalFixture.headers.length === 1 && refusalFixture.headers[0] === refusal
        && refusalFixture.failures.length === 0 && refusalFixture.released() === 1 && refusalFixture.activeDeadlines() === 0 && refusalFixture.ownedPromises() === 0);
    } finally { refusalFixture.dispose(); }

    let queryAttempts = 0;
    const queryRefusal = new Response('UNREAD_NATIVE_QUERY_REFUSAL', { status: 503 });
    const queryFixture = mainFetchFixture(() => { queryAttempts++; return Promise.resolve(queryRefusal); });
    try {
      const received = await queryFixture.fetch(`${route}?unexpected=1`, { method, body });
      check(`native ${method} ${route} query variant keeps pathname-owned no-retry lifetime`, received === queryRefusal && queryAttempts === 1
        && queryFixture.delays.length === 0 && queryFixture.ownedPromises() === 0 && queryFixture.released() === 1 && queryFixture.activeDeadlines() === 0 && !queryRefusal.bodyUsed);
    } finally { queryFixture.dispose(); }

    const requestAbort = new AbortController(), requestPending = deferred<Response>();
    const request = new Request(`https://forge.test${route}`, { method, body, signal: requestAbort.signal });
    let inherited: AbortSignal | null | undefined;
    const requestFixture = mainFetchFixture((_input, init) => { inherited = init?.signal; return requestPending.promise; });
    try {
      const result = requestFixture.fetch(request).then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
      const reason = new DOMException('native inherited Request cancellation', 'AbortError'); requestAbort.abort(reason);
      const forwarded = inherited?.aborted === true && inherited.reason === reason && requestFixture.activeDeadlines() === 1 && requestFixture.released() === 0;
      requestPending.reject(reason); const settled = await result;
      check(`native ${method} ${route} inherits Request method and signal without retry`, forwarded && settled.error === reason && requestFixture.ownedPromises() === 0
        && requestFixture.delays.length === 0 && requestFixture.released() === 1 && requestFixture.activeDeadlines() === 0);
    } finally { requestPending.reject(new Error('fixture cleanup')); requestFixture.dispose(); }

    let deadlineCalls = 0; let deadlineSignal: AbortSignal | null | undefined; let rescue: ReturnType<typeof setTimeout> | undefined;
    const deadlineFixture = mainFetchFixture((_input, init) => {
      deadlineCalls++; deadlineSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) { reject(init.signal.reason); return; }
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        rescue = setTimeout(() => reject(new Error('native request lost its deadline before headers')), 50);
      });
    }, { deadlineMs: 5 });
    try {
      let error: unknown; try { await deadlineFixture.fetch(route, { method, body }); } catch (failure) { error = failure; }
      check(`native ${method} ${route} deadline aborts pending transport without retry or success`, deadlineSignal?.aborted === true && error instanceof Error && error.name === 'TimeoutError'
        && error.message.includes('30000') && deadlineCalls === 1 && deadlineFixture.delays.length === 0 && deadlineFixture.headers.length === 0
        && deadlineFixture.failures.length === 1 && deadlineFixture.released() === 1 && deadlineFixture.activeDeadlines() === 0
        && deadlineFixture.deadlineDurations.length === 1 && deadlineFixture.deadlineDurations[0] === 30_000);
    } finally { clearTimeout(rescue); deadlineFixture.dispose(); }
  }
  for (const [input, method, expectedDeadlines] of [
    ['/api/agent/performance/native-extra', 'POST', 1], ['/api/agent/performance/native/collection/extra', 'POST', 1],
    ['/api/agent/performance/native/stop-extra', 'POST', 1], ['/api/agent/performance/native/stop', 'PUT', 1],
    ['https://external.test/api/agent/performance/native/collection', 'POST', 0],
  ] as const) {
    const pending = deferred<Response>(), fixture = mainFetchFixture(() => pending.promise);
    try {
      const result = fixture.fetch(input, { method, body: 'UNCHANGED_UNOWNED_BODY' }).then(response => ({ response, error: undefined }), error => ({ response: undefined, error }));
      const unchanged = fixture.released() === expectedDeadlines && fixture.activeDeadlines() === 0 && fixture.ownedPromises() === 1;
      const reason = new Error('unchanged unowned rejection'); pending.reject(reason); const settled = await result;
      check(`native exact ownership leaves ${method} ${input} unchanged`, unchanged && settled.error === reason && fixture.delays.length === 0 && fixture.failures[0] === reason);
    } finally { pending.reject(new Error('fixture cleanup')); fixture.dispose(); }
  }
  const passed = checks.filter(row => row.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
// END BATCH3 native fetch cancellation tests
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // BEGIN BATCH3 native fetch CLI selection
  const run = process.argv.includes('--native-performance-selftest') ? runNativePerformanceFetchSelftest : runWebviewPerformanceSelftest;
  // END BATCH3 native fetch CLI selection
  void run().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.allPassed) process.exitCode = 1; }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
