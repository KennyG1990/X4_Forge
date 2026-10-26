/** Real HTTP/CLI controls for failure evidence and fail-closed sweep results. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

const cases = [
  { name: 'green', body: { allPassed: true, passed: 1, total: 1 }, exit: 0 },
  { name: 'failed-details', body: { allPassed: false, passed: 0, total: 12,
    checks: [{ name: 'passing', pass: true }, ...Array.from({ length: 12 }, (_, i) => ({
      name: `failed-${i}-` + 'n'.repeat(250), pass: false, detail: 'd'.repeat(2000), private: 'do-not-dump',
    }))] }, exit: 1 },
  { name: 'http-error', status: 500, body: { allPassed: true, error: 'fixture unavailable' }, exit: 1 },
  { name: 'invalid-json', raw: 'not JSON', exit: 1 },
];

for (const fixture of cases) {
  let houseCalls = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/api/agent/selftest-index') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ selftests: ['/agent/fixture-selftest'] }));
    } else if (request.url === '/api/agent/fixture-selftest') {
      houseCalls += 1;
      response.statusCode = fixture.status || 200;
      response.end(fixture.raw ?? JSON.stringify(fixture.body));
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const json of [true, false]) {
      const args = ['scripts/oracle-sweep.mjs', ...(json ? ['--json'] : [])];
      const child = spawn(process.execPath, args, {
        shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, X4_FORGE_BASE: `http://127.0.0.1:${server.address().port}` },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      const timer = setTimeout(() => child.kill(), 10_000);
      let code;
      try { [code] = await once(child, 'close'); } finally { clearTimeout(timer); }
      assert.equal(code, fixture.exit, `${fixture.name}: ${stdout}\n${stderr}`);
      assert.equal(houseCalls, json ? 1 : 2, 'one call per oracle; no retry or aggregate substitution');
      if (json) {
        const report = JSON.parse(stdout);
        assert.equal(report.total, 1);
        assert.equal(report.red, fixture.exit);
        if (fixture.name === 'failed-details') {
          assert.equal(report.results[0].failedChecks.length, 10);
          assert.equal(report.results[0].failedChecks[0].name.length, 200);
          assert.equal(report.results[0].failedChecks[0].detail.length, 1024);
          assert.equal('private' in report.results[0].failedChecks[0], false);
        }
      } else if (fixture.name === 'failed-details') {
        assert.ok(stdout.includes('failed-0-') && !stdout.includes('do-not-dump'));
      }
    }
    console.log(`PASS oracle-sweep ${fixture.name} (JSON and text)`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
