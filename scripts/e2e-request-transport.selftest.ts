import assert from 'node:assert/strict';
import http from 'node:http';
import type { Socket } from 'node:net';
import { request as playwrightRequest, type APIRequestContext, type Request, type Route } from '@playwright/test';
import { fetchRouteWithClosingConnection, withClosingApiRequest } from '../tests/e2e/request-transport';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'fetch';
type FetchOptions = NonNullable<Parameters<APIRequestContext['fetch']>[1]>;
type Echo = { method: string; url: string; body: string; socketId: number; headers: Record<string, string | string[] | undefined> };
const methods: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'];

async function main() {
  const checks: string[] = [];
  const contexts = new Set<APIRequestContext>();
  const sockets = new Set<Socket>();
  const socketIds = new WeakMap<Socket, number>();
  const closures = new Map<number, Promise<void>>();
  const attempts = new Map<string, number>();
  const observed: { last?: Echo } = {};
  const serverErrors: string[] = [];
  let requestCount = 0;
  let nextSocketId = 0;
  let deadlineError: Error | undefined;
  let primaryFailed = false;
  let primaryFailure: unknown;
  const cleanupFailures: unknown[] = [];
  let stopping = false;
  let activeRun: Promise<void> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout>;
  const requireRunning = () => { if (stopping) throw deadlineError || new Error('TRANSPORT_FIXTURE_STOPPED'); };
  const check = async (name: string, run: () => Promise<void>) => {
    requireRunning();
    await run();
    requireRunning();
    checks.push(name);
  };
  const server = http.createServer((req, res) => {
    if (++requestCount > 128) { serverErrors.push('REQUEST_LIMIT'); req.destroy(); return; }
    const route = new URL(req.url || '/', 'http://fixture.invalid').pathname;
    attempts.set(route, (attempts.get(route) || 0) + 1);
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('error', () => { if (!req.destroyed) serverErrors.push('REQUEST_ERROR'); });
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65_536) { serverErrors.push('INPUT_LIMIT'); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (req.destroyed) return;
      if (route === '/reset') { req.socket.destroy(); return; }
      observed.last = {
        method: req.method || '', url: req.url || '/', body: Buffer.concat(chunks).toString('utf8'),
        socketId: socketIds.get(req.socket)!,
        headers: { authorization: req.headers.authorization, cookie: req.headers.cookie,
          connection: req.headers.connection, contentType: req.headers['content-type'],
          inherited: req.headers['x-inherited'] },
      };
      const payload = route === '/body' ? 'complete-body:'.repeat(512) : JSON.stringify(observed.last);
      if (Buffer.byteLength(payload) > 16_384) { serverErrors.push('OUTPUT_LIMIT'); req.socket.destroy(); return; }
      if (route === '/cookie') res.setHeader('Set-Cookie', 'fixture_cookie=present; Path=/; HttpOnly');
      res.writeHead(route === '/status' ? 409 : 200, {
        'Content-Type': route === '/body' ? 'text/plain' : 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      });
      res.end(payload);
    });
  });
  server.on('connection', socket => {
    sockets.add(socket);
    const id = ++nextSocketId;
    socketIds.set(socket, id);
    closures.set(id, new Promise<void>(resolve => socket.once('close', () => { sockets.delete(socket); resolve(); })));
    socket.on('error', () => undefined);
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    deadlineTimer = setTimeout(() => {
      deadlineError = new Error('TRANSPORT_FIXTURE_DEADLINE');
      stopping = true;
      for (const socket of sockets) socket.destroy();
      reject(deadlineError);
    }, 30_000);
  });
  try {
    await Promise.race([new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    }), deadline]);
    const address = server.address();
    assert(address && typeof address !== 'string');
    const baseURL = `http://127.0.0.1:${address.port}`;
    const create = async (options?: Parameters<typeof playwrightRequest.newContext>[0]) => {
      requireRunning();
      const context = await playwrightRequest.newContext({ baseURL, timeout: 2000, ...options });
      contexts.add(context);
      if (stopping) {
        try { await context.dispose(); } catch (error) { cleanupFailures.push(error); }
        requireRunning();
      }
      return context;
    };
    const run = async () => {
      const inherited = Object.freeze({ Authorization: 'Bearer transport-fixture', 'x-inherited': 'original', Connection: 'keep-alive' });
      const original = await create({ extraHTTPHeaders: inherited });
      const api = withClosingApiRequest(original);
      let firstSocket = 0;
      await check('real inherited defaults, complete response and owned connection closure', async () => {
        assert.equal(withClosingApiRequest(original), api);
        assert.equal(withClosingApiRequest(api), api);
        const response = await api.get('/echo');
        const body = await response.json() as Echo;
        assert.equal(body.headers.authorization, inherited.Authorization);
        assert.equal(body.headers.inherited, 'original');
        assert.equal(body.headers.connection, 'close');
        firstSocket = body.socketId;
        assert(closures.has(firstSocket));
        await closures.get(firstSocket);
        assert.deepEqual(inherited, { Authorization: 'Bearer transport-fixture', 'x-inherited': 'original', Connection: 'keep-alive' });
        const empty = await (await api.get('/echo', { headers: Object.freeze({}) })).json() as Echo;
        assert.equal(empty.headers.authorization, inherited.Authorization);
        assert.equal(empty.headers.connection, 'close');
        const complete = await api.get('/body');
        assert.equal(await complete.text(), 'complete-body:'.repeat(512));
      });
      await check('all seven real HTTP methods retain method and per-call authorization', async () => {
        for (const method of methods) {
          const options = Object.freeze({ headers: Object.freeze({ Authorization: 'Bearer per-call', connection: 'keep-alive', CONNECTION: 'keep-alive' }) });
          const response = await api[method]('/echo', options);
          assert.equal(response.status(), 200);
          if (method === 'head') {
            assert.equal(await response.text(), '');
            assert.equal(observed.last?.method, 'HEAD');
            assert.equal(observed.last?.headers.authorization, 'Bearer per-call');
            assert.equal(observed.last?.headers.connection, 'close');
            continue;
          }
          const body = await response.json() as Echo;
          assert.equal(body.method, method === 'fetch' ? 'GET' : method.toUpperCase());
          assert.equal(body.headers.authorization, 'Bearer per-call');
          assert.equal(body.headers.connection, 'close');
          assert.equal(options.headers.connection, 'keep-alive');
          assert.equal(options.headers.CONNECTION, 'keep-alive');
        }
      });
      await check('real JSON, query, form and raw body remain exact', async () => {
        const data = Object.freeze({ value: 'two words', count: 2 });
        const options = Object.freeze({ data, params: new URLSearchParams([['q', 'one two'], ['q', 'three']]) });
        const json = await (await api.post('/echo', options)).json() as Echo;
        assert.deepEqual(JSON.parse(json.body), data);
        assert.deepEqual(new URL(json.url, baseURL).searchParams.getAll('q'), ['one two', 'three']);
        assert.equal(json.headers.contentType, 'application/json');
        const form = await (await api.post('/echo', { form: { value: 'two words', flag: true } })).json() as Echo;
        assert.equal(new URLSearchParams(form.body).get('value'), 'two words');
        assert.equal(new URLSearchParams(form.body).get('flag'), 'true');
        const raw = Buffer.from('unaltered raw payload');
        const binary = await (await api.put('/echo', { data: raw })).json() as Echo;
        assert.equal(binary.body, raw.toString());
        assert.equal(raw.toString(), 'unaltered raw payload');
      });
      await check('real cookies stay in the original jar and separate contexts remain separate', async () => {
        await (await api.get('/cookie')).body();
        const extractState = api.storageState;
        assert.deepEqual(await extractState(), await original.storageState());
        const cookie = await (await api.get('/echo')).json() as Echo;
        assert.equal(cookie.headers.cookie, 'fixture_cookie=present');
        const other = withClosingApiRequest(await create());
        const independent = await (await other.get('/echo')).json() as Echo;
        assert.equal(independent.headers.cookie, undefined);
        assert.equal(independent.headers.authorization, undefined);
        assert.notEqual(independent.socketId, firstSocket);
      });
      await check('real HTTP status and default-zero-retry reset failures are not hidden', async () => {
        assert.equal((await api.get('/status')).status(), 409);
        await assert.rejects(api.get('/status', { failOnStatusCode: true }));
        await assert.rejects(api.get('/reset'), error => error instanceof Error && /ECONNRESET|socket hang up/.test(error.message));
        assert.equal(attempts.get('/reset'), 1);
      });

      const forwarding = await create();
      const facade = withClosingApiRequest(forwarding);
      const marker = Object.freeze({ originalMember: true });
      Object.defineProperty(forwarding, 'transportFixtureMarker', {
        get() { assert.equal(this, forwarding); return marker; },
      });
      const sentinel = await api.get('/echo');
      const calls: Array<{ method: HttpMethod; input: string | Request; options?: FetchOptions }> = [];
      const originals = new Map<HttpMethod, APIRequestContext[HttpMethod]>();
      for (const method of methods) {
        originals.set(method, forwarding[method]);
        Reflect.set(forwarding, method, async function(this: APIRequestContext, input: string | Request, options?: FetchOptions) {
          assert.equal(this, forwarding);
          calls.push({ method, input, options });
          return sentinel;
        });
      }
      try {
        await check('typed seven-method forwarding keeps response and option value identities', async () => {
          assert.equal(Reflect.get(facade, 'transportFixtureMarker'), marker);
          const data = Object.freeze({ untouched: true });
          const params = Object.freeze({ q: 'same object' });
          const headers = Object.freeze({ Authorization: 'Bearer forwarding', connection: 'keep-alive', Connection: 'upgrade', CONNECTION: 'keep-alive' });
          const options = Object.freeze({ headers, data, params, timeout: 321, maxRedirects: 2, maxRetries: 0 });
          for (const method of methods) {
            assert.equal(await facade[method]('/identity', options), sentinel);
            const call = calls.at(-1)!;
            assert.equal(call.method, method);
            assert.equal(call.input, '/identity');
            assert.notEqual(call.options, options);
            assert.notEqual(call.options?.headers, headers);
            assert.deepEqual(call.options?.headers, { Authorization: 'Bearer forwarding', Connection: 'close' });
            assert.equal(call.options?.data, data);
            assert.equal(call.options?.params, params);
            assert.equal(call.options?.timeout, 321);
            assert.equal(call.options?.maxRedirects, 2);
            assert.equal(call.options?.maxRetries, 0);
          }
          assert.equal(headers.Connection, 'upgrade');
          let headerReads = 0;
          const accessorOptions: FetchOptions = {};
          Object.defineProperty(accessorOptions, 'headers', {
            enumerable: true, get() { headerReads++; return headers; },
          });
          await facade.post('/accessor', accessorOptions);
          assert.equal(headerReads, 1, 'copy the caller options once before selecting headers');
        });
        await check('fetch Request projection preserves replacement semantics without mutating input', async () => {
          let headerReads = 0;
          const sourceHeaders = Object.freeze({ Authorization: 'Bearer source-request', connection: 'keep-alive', 'x-source': 'source' });
          // Forwarding-only projection; it is never sent to the real transport.
          const projection: Pick<Request, 'headers'> = { headers: () => { headerReads++; return sourceHeaders; } };
          const source = projection as Request;
          assert.equal(await facade.fetch(source), sentinel);
          assert.equal(calls.at(-1)?.input, source);
          assert.deepEqual(calls.at(-1)?.options?.headers, { Authorization: 'Bearer source-request', 'x-source': 'source', Connection: 'close' });
          const reads = headerReads;
          await facade.fetch(source, Object.freeze({ headers: Object.freeze({}) }));
          assert.equal(headerReads, reads);
          assert.deepEqual(calls.at(-1)?.options?.headers, { Connection: 'close' });
          await facade.fetch(source, { headers: { Authorization: 'Bearer replacement' } });
          assert.equal(headerReads, reads);
          assert.deepEqual(calls.at(-1)?.options?.headers, { Authorization: 'Bearer replacement', Connection: 'close' });
          assert.equal(sourceHeaders.connection, 'keep-alive');
        });
        await check('route fetch keeps its original receiver, request and explicit header replacement', async () => {
          let reads = 0;
          const captured: { options?: Parameters<Route['fetch']>[0] } = {};
          const projection: Pick<Request, 'headers'> = { headers: () => { reads++; return { Authorization: 'Bearer route', connection: 'keep-alive' }; } };
          const source = projection as Request;
          const routeProjection: Pick<Route, 'request' | 'fetch'> = {
            request: () => source,
            async fetch(options) { assert.equal(this, routeProjection); captured.options = options; return sentinel; },
          };
          const route = routeProjection as Route;
          const options = Object.freeze({ timeout: 10_000, maxRedirects: 3, maxRetries: 0, postData: 'same payload' });
          assert.equal(await fetchRouteWithClosingConnection(route, options), sentinel);
          assert.deepEqual(captured.options, { ...options, headers: { Authorization: 'Bearer route', Connection: 'close' } });
          const previousReads = reads;
          await fetchRouteWithClosingConnection(route, { headers: {}, timeout: 30_000 });
          assert.equal(reads, previousReads);
          assert.deepEqual(captured.options, { headers: { Connection: 'close' }, timeout: 30_000 });
          await fetchRouteWithClosingConnection(route, { headers: { Authorization: 'Bearer override', CONNECTION: 'upgrade' } });
          assert.deepEqual(captured.options?.headers, { Authorization: 'Bearer override', Connection: 'close' });
          assert.equal(options.postData, 'same payload');
        });
        await check('forwarded request and route rejections retain the original error', async () => {
          const rejection = new Error('original synthetic rejection');
          Reflect.set(forwarding, 'get', async () => { throw rejection; });
          await assert.rejects(facade.get('/failure'), error => error === rejection);
          const routeProjection: Pick<Route, 'request' | 'fetch'> = {
            request: () => { throw rejection; },
            fetch: async () => { throw rejection; },
          };
          await assert.rejects(fetchRouteWithClosingConnection(routeProjection as Route), error => error === rejection);
          await assert.rejects(fetchRouteWithClosingConnection(routeProjection as Route, { headers: {} }), error => error === rejection);
        });
      } finally {
        for (const [method, originalMethod] of originals) Reflect.set(forwarding, method, originalMethod);
      }
      await check('ordinary and symbol disposal methods retain original context binding', async () => {
        const storageState = facade.storageState;
        assert.deepEqual(await storageState(), await forwarding.storageState());
        assert.equal(facade.storageState, facade.storageState);
        const symbolDispose: unknown = Reflect.get(facade, Symbol.asyncDispose);
        assert.equal(typeof symbolDispose, 'function');
        if (typeof symbolDispose !== 'function') throw new Error('SYMBOL_DISPOSE_MISSING');
        await symbolDispose();
        await assert.rejects(forwarding.get('/disposed'));
        const disposable = withClosingApiRequest(await create());
        const dispose = disposable.dispose;
        await dispose({ reason: 'owned transport selftest complete' });
        await assert.rejects(disposable.get('/disposed'));
      });
      assert.deepEqual(serverErrors, []);
      assert(requestCount <= 128);
    };
    activeRun = run();
    await Promise.race([activeRun, deadline]);
  } catch (error) {
    primaryFailed = true;
    primaryFailure = error;
  } finally {
    stopping = true;
    for (const socket of sockets) socket.destroy();
    try {
      for (const context of contexts) {
        try { await context.dispose(); } catch (error) { cleanupFailures.push(error); }
      }
      // Disposal cancels pending HTTP work; late creations dispose themselves.
      // Join the case owner before declaring that no more contexts can arrive.
      if (activeRun) { try { await activeRun; } catch { /* Preserve its primary failure above. */ } }
    } finally {
      for (const socket of sockets) socket.destroy();
      try {
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } catch (error) {
        cleanupFailures.push(error);
      } finally {
        clearTimeout(deadlineTimer!);
      }
    }
  }
  if (primaryFailed) throw primaryFailure;
  if (deadlineError) throw deadlineError;
  if (cleanupFailures.length) throw cleanupFailures[0];
  assert.equal(sockets.size, 0);
  console.log(JSON.stringify({ pass: true, passed: checks.length, total: checks.length, checks, requestCount, ownedConnectionsRemaining: sockets.size }));
}

main().catch(error => {
  console.error(`[e2e-request-transport selftest] FAIL: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
