"""C06c: deterministic cross-process proof against two owned production servers.

--baseline proves the old overlap, before rebuilding dist/server.cjs. Normal mode
requires shared coordination. Only scratch source/config/registries are written.
The preload holds one exact scratch rename over owned pipes; concurrency is proved
by observed barriers, not sleep duration. No public test endpoint, installed-server
connection, game command or live key.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import queue
import shutil
import socket
import subprocess
import threading
import time
import traceback
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'dist/server.cjs'
BARRIER = ROOT / 'scripts/c06c-write-barrier.cjs'
MOD = 'forge_regression_lab'
NODE = shutil.which('node')
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(filename):
    return digest(pathlib.Path(filename).read_bytes())


def snapshot(paths):
    return {str(p): file_hash(p) if pathlib.Path(p).is_file() else None for p in paths}


def save_json(filename, data):
    filename.write_text(json.dumps(data, indent=2), encoding='utf-8')


def eventually(probe, description, timeout=20):
    """Poll an observed predicate, never infer contention from elapsed time."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = probe()
        if last:
            return last
        threading.Event().wait(.025)
    raise AssertionError('Observed-state deadline: ' + description + '; last=' + repr(last))


class Server:
    def __init__(self, name, run, mods, registry, target, reference, trace, native_failure=None):
        self.name, self.run, self.mods, self.trace = name, run / name, mods, trace
        self.workspace = None
        self.client = 'client_c06c_' + name + '_fixture'
        self.token = uuid.uuid4().hex * 2
        self.events = queue.Queue()
        self.log_thread = None
        self.child = None
        for folder in ['state', 'data', 'config', 'discovery', 'game/extensions']:
            (self.run / folder).mkdir(parents=True)
        (self.run / 'game/X4.exe').write_bytes(b'C06c inert scratch installation marker; never executed.\n')
        self.config = dict(modWorkspacePath=str(mods), x4GamePath=str(self.run / 'game'),
                           filesystemPath=str(self.run / 'game/extensions'),
                           x4LogPath=str(self.run / 'simulated.log'))
        if reference:
            self.config.update(x4ReferenceRoot=str(reference), xsdSchemaPath=str(reference / 'libraries'))
        (self.run / 'simulated.log').write_text('', encoding='utf-8')
        save_json(self.run / 'config/config.json', self.config)
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            self.port = port_socket.getsockname()[1]
        # Do not inherit a live discovery, credential, test mode, or command hook.
        env = {k: v for k, v in os.environ.items()
               if not k.upper().startswith(('X4', 'FORGE_', 'C06C_', 'STUDIO_API_TOKEN', 'NODE_OPTIONS'))}
        env.update(PORT=str(self.port), NODE_ENV='production', API_ONLY='true', STUDIO_API_TOKEN=self.token,
                   X4_STATE_DIR=str(self.run / 'state'), X4_DATA_DIR=str(self.run / 'data'),
                   X4_CONFIG_DIR=str(self.run / 'config'), X4FORGE_DISCOVERY_DIR=str(self.run / 'discovery'),
                   X4_SOURCE_COORDINATION_DIR=str(registry), X4_FORGE_MODE='c06c-coordination-test',
                   NODE_PATH=str(ROOT / 'node_modules'))
        if reference:
            env['X4_REFERENCE_ROOT'] = str(reference)
        args = [NODE]
        if target or native_failure:
            args += ['--require', str(BARRIER)]
        if target:
            env.update(C06C_BARRIER_ROOT=str(run), C06C_BARRIER_TARGET=str(target))
        if native_failure:
            env['C06C_SQLITE_FAILURE'] = native_failure
        args.append(str(ENTRY))
        self.child = subprocess.Popen(args, cwd=ROOT, env=env, stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                      creationflags=NO_WINDOW)
        self.log_thread = threading.Thread(target=self.read_log, daemon=True)
        self.log_thread.start()

    def read_log(self):
        with open(self.run / 'server.log', 'wb') as output:
            for line in self.child.stdout:
                output.write(line)
                output.flush()
                if line.startswith(b'C06C_BARRIER '):
                    self.events.put(json.loads(line[len(b'C06C_BARRIER '):]))

    def request(self, route, body=None, workspace=None, client=None, timeout=45):
        headers = {'Authorization': 'Bearer ' + self.token, 'x-client-id': client or self.client}
        subject = workspace or self.workspace
        if subject:
            headers['x-workspace-id'] = subject
        operation = None
        if body is not None:
            operation = 'forge_op_' + uuid.uuid4().hex
            headers.update({'Content-Type': 'application/json', 'x-forge-operation-id': operation})
        req = urllib.request.Request('http://127.0.0.1:' + str(self.port) + route,
                                     data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout) as response:
                code, result = response.status, json.load(response)
        except urllib.error.HTTPError as error:
            code, result = error.code, json.load(error)
        self.trace({'server': self.name, 'route': route, 'workspace': subject, 'operationId': operation,
                    'status': code, 'response': result})
        return code, result

    def ready(self):
        def probe():
            if self.child.poll() is not None:
                raise AssertionError(self.name + ' exited during startup; see server.log')
            try:
                return self.request('/api/agent/schema', timeout=2)[0] == 200
            except (OSError, urllib.error.URLError):
                return False
        eventually(probe, self.name + ' server readiness', 60)
        code, result = self.request('/api/agent/workspaces/bootstrap', {'clientId': self.client})
        assert code == 200, result
        self.workspace = result['workspaceId']

    def import_workspace(self, relative, label):
        code, result = self.request('/api/agent/mod-folder/import', {'root': 'workspace', 'path': relative})
        assert code == 200 and result.get('success'), result
        code, created = self.request('/api/agent/workspaces', {
            'workspace': result['workspace'], 'name': label, 'clientId': self.client})
        assert code == 201, created
        return created['workspaceId']

    def status(self, workspace=None):
        code, result = self.request('/api/agent/status', workspace=workspace)
        assert code == 200, result
        return result['sourceCoordination']

    def held(self):
        event = self.events.get(timeout=20)
        assert event['event'] == 'held-before-rename' and event['pid'] == self.child.pid, event
        self.trace({'server': self.name, 'barrier': event})
        return event

    def release(self, command=b'r'):
        self.child.stdin.write(command)
        self.child.stdin.flush()

    def open_write_socket(self, content, expected, relative=None):
        """An owned client the parent can disconnect at an observed boundary."""
        body = json.dumps({'path': relative or MOD + '/ui/c06c_writer.lua',
                           'content': content, 'expectedSha256': expected}).encode()
        operation = 'forge_op_' + uuid.uuid4().hex
        headers = ['POST /api/fs/write HTTP/1.1', 'Host: 127.0.0.1:' + str(self.port),
                   'Authorization: Bearer ' + self.token, 'x-client-id: ' + self.client,
                   'x-workspace-id: ' + self.workspace, 'x-forge-operation-id: ' + operation,
                   'Content-Type: application/json', 'Content-Length: ' + str(len(body)),
                   'Connection: close', '', '']
        client = socket.create_connection(('127.0.0.1', self.port), timeout=20)
        client.sendall('\r\n'.join(headers).encode() + body)
        self.trace({'server': self.name, 'rawClientOperationId': operation, 'event': 'request-sent',
                    'relative': relative, 'contentHash': digest(content.encode())})
        return client

    def stop(self):
        if self.child and self.child.poll() is None:
            self.child.terminate()
        if self.child:
            self.child.wait(timeout=20)
        if self.log_thread:
            self.log_thread.join(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'test-results/claude-C06c')
    parser.add_argument('--protected-manifest', type=pathlib.Path)
    parser.add_argument('--reference-root', type=pathlib.Path)
    args = parser.parse_args()
    assert NODE and ENTRY.is_file(), 'Build dist/server.cjs before running this harness.'
    run = args.output.resolve() / (('baseline-' if args.baseline else 'fixed-') + uuid.uuid4().hex[:10])
    run.mkdir(parents=True)
    (run / 'harness').mkdir()
    for harness_source in [pathlib.Path(__file__), BARRIER]:
        shutil.copyfile(harness_source, run / 'harness' / harness_source.name)
    mods, registry = run / 'mods', run / 'coordination'
    mods.mkdir()
    registry.mkdir()
    fixture = json.loads((ROOT / 'tests/fixtures/forge-regression/project.json').read_text(encoding='utf-8'))
    for file in fixture['files']:
        target = mods / MOD / file['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file['content'].encode('utf-8'))
    other = mods / 'forge_unrelated_lab'
    other.mkdir()
    (other / 'content.xml').write_text('<content id="forge_unrelated_lab" name="Unrelated Lab" version="100"/>', encoding='utf-8')
    (other / 'ui').mkdir()
    target = mods / MOD / 'ui/c06c_writer.lua'
    target.write_text('return 0\n', encoding='utf-8')
    protected_paths = []
    if args.protected_manifest:
        protected_paths = [pathlib.Path(item['path']) for item in json.loads(args.protected_manifest.read_text(encoding='utf-8-sig'))['protected']]
    protected_before = snapshot(protected_paths)
    entry_hash = file_hash(ENTRY)
    harness_hashes = snapshot([pathlib.Path(__file__), BARRIER])
    save_json(run / 'baseline.json', {'timestamp': time.time(), 'mode': 'baseline' if args.baseline else 'fixed',
                                    'serverHash': entry_hash, 'protected': protected_before,
                                    'fixtureHash': file_hash(ROOT / 'tests/fixtures/forge-regression/project.json'),
                                    'harnessHashes': harness_hashes})
    checks, servers, futures, sockets = {}, [], [], []
    trace_lock = threading.Lock()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=6)

    def trace(record):
        with trace_lock, open(run / 'responses.jsonl', 'a', encoding='utf-8') as output:
            output.write(json.dumps(record) + '\n')

    def check(name, condition, detail=None):
        checks[name] = bool(condition)
        trace({'check': name, 'passed': bool(condition), 'detail': detail})
        assert condition, name + ': ' + repr(detail)

    def write(server, content, expected, workspace=None, relative=None):
        return server.request('/api/fs/write', {'path': relative or MOD + '/ui/c06c_writer.lua',
                                               'content': content, 'expectedSha256': expected}, workspace=workspace)

    def background(*values, **keywords):
        future = executor.submit(write, *values, **keywords)
        futures.append(future)
        return future

    failure = None
    try:
        reference = args.reference_root or (pathlib.Path(os.environ['X4_REFERENCE_ROOT']) if os.environ.get('X4_REFERENCE_ROOT') else None)
        a = Server('a', run, mods, registry, target, reference, trace)
        servers.append(a)
        b = Server('b', run, mods, registry, None, reference, trace)
        servers.append(b)
        for server in servers:
            server.ready()
            server.workspace = server.import_workspace(MOD, 'C06c ' + server.name)
        unrelated_ws = b.import_workspace('forge_unrelated_lab', 'C06c unrelated source')
        old = file_hash(target)
        first = background(a, 'return 101\n', old)
        a.held()
        check('held-boundary-before-promotion', file_hash(target) == old)
        second = background(b, 'return 202\n', old)
        if args.baseline:
            code, result = second.result(timeout=20)
            check('reproduced-other-process-entered-held-resource', code == 200 and target.read_text() == 'return 202\n', result)
            state = b.status()
            check('reproduced-status-cannot-see-other-owner', state.get('scope') == 'server-process' and not state['active'], state)
            a.release()
            code, result = first.result(timeout=20)
            check('reproduced-both-same-hash-writers-succeeded', code == 200 and target.read_text() == 'return 101\n', result)
        else:
            def queued(count=1, workspace=None):
                state = b.status(workspace)
                return state if len(state.get('waiting', [])) >= count else False
            state = eventually(queued, 'server B sees queued request behind A')
            check('shared-scope-and-honest-boundary', state.get('scope') == 'shared-participating-processes'
                  and state.get('available') is True and state.get('coordinatesParticipatingProcesses') is True
                  and state.get('controlsExternalEditors') is False and state.get('controlsOtherProcesses') is False, state)
            check('remote-active-owner-visible', any(row['pid'] == a.child.pid and row['instanceId'] and row['startedAt']
                  and row['owner']['operation'] == '/api/fs/write' for row in state['active']), state)
            check('queued-writer-has-not-mutated', not second.done() and file_hash(target) == old)
            code, result = write(b, 'return 303\n', None, unrelated_ws, 'forge_unrelated_lab/ui/unrelated.lua')
            check('unrelated-source-proceeds-while-owner-held', code == 200 and not second.done(), result)
            a.release()
            code_a, response_a = first.result(timeout=20)
            code_b, response_b = second.result(timeout=20)
            check('same-old-hash-second-writer-refused', code_a == 200 and code_b == 409
                  and response_b.get('code') == 'FILE_CHANGED' and target.read_text() == 'return 101\n', [response_a, response_b])
            check('no-remaining-owner-after-cas', not b.status()['active'] and not b.status()['waiting'])
            # Distinct addressed workspaces prevent process-local workspace scheduling
            # from hiding the two pending shared-source claims.
            second_ws = b.import_workspace(MOD, 'C06c second queued workspace')
            first = background(a, 'return 401\n', file_hash(target))
            a.held()
            queued_one = background(b, 'return 402\n', digest(b'return 401\n'))
            state_one = eventually(queued, 'first FIFO request registered')
            queued_two = background(b, 'return 403\n', digest(b'return 402\n'), second_ws)
            state_two = eventually(lambda: queued(2), 'second FIFO request registered')
            check('fifo-registration-order', state_two['waiting'][0]['id'] == state_one['waiting'][0]['id'], state_two)
            a.release()
            outcomes = [future.result(timeout=20) for future in [first, queued_one, queued_two]]
            check('fifo-writes-see-preceding-bytes', all(code == 200 for code, _ in outcomes)
                  and target.read_text() == 'return 403\n', outcomes)
            # Junctions are canonical resource aliases, not separate locks.
            alias = mods / 'forge_alias_lab'
            subprocess.run([NODE, '-e', "require('node:fs').symlinkSync(process.argv[1],process.argv[2],'junction')",
                            str(mods / MOD), str(alias)], cwd=ROOT, check=True, creationflags=NO_WINDOW)
            alias_ws = b.import_workspace('forge_alias_lab', 'C06c alias source')
            before = file_hash(target)
            alias_owner = background(a, 'return 410\n', before)
            a.held()
            alias_waiter = background(b, 'return 411\n', before, alias_ws,
                                      'forge_alias_lab/ui/c06c_writer.lua')
            alias_state = eventually(lambda: queued(1, alias_ws), 'junction alias waiter registered')
            check('alias-owner-and-waiter-share-canonical-key', alias_state['active'][0]['resources']
                  == alias_state['waiting'][0]['resources'] and not alias_waiter.done(), alias_state)
            a.release()
            check('alias-stale-write-refused', alias_owner.result(timeout=20)[0] == 200
                  and alias_waiter.result(timeout=20)[0] == 409 and target.read_text() == 'return 410\n')
            # B now addresses an actual child source root; no identical parent
            # workspace key can accidentally make this hierarchy assertion pass.
            child_source = mods / MOD / 'child_lab'
            (child_source / 'ui').mkdir(parents=True)
            (child_source / 'content.xml').write_text('<content id="forge_child_lab" name="Child Lab" version="100"/>', encoding='utf-8')
            code, result = b.request('/api/schema/config', {'modWorkspacePath': str(mods / MOD)})
            check('scratch-child-root-configured', code == 200, result)
            child_ws = b.import_workspace('child_lab', 'C06c child source')
            parent_owner = background(a, 'return 420\n', file_hash(target))
            a.held()
            child_waiter = background(b, 'return 421\n', None, child_ws, 'child_lab/ui/descendant.lua')
            child_state = eventually(lambda: queued(1, child_ws), 'child source waits for parent owner')
            parent_keys = child_state['active'][0]['resources']
            child_keys = child_state['waiting'][0]['resources']
            check('distinct-parent-child-keys-conflict', parent_keys != child_keys and not child_waiter.done()
                  and any(c.startswith(p + os.sep) for p in parent_keys for c in child_keys), child_state)
            a.release()
            check('child-source-runs-after-parent-release', parent_owner.result(timeout=20)[0] == 200
                  and child_waiter.result(timeout=20)[0] == 200
                  and (child_source / 'ui/descendant.lua').read_text() == 'return 421\n')
            code, result = b.request('/api/schema/config', {'modWorkspacePath': str(mods)})
            check('scratch-root-restored', code == 200, result)
            # The external editor is deliberately outside the registry. A fails
            # before promotion so the edited bytes survive; queued B rechecks CAS.
            before = file_hash(target)
            external_owner = background(a, 'return 430\n', before)
            a.held()
            external_waiter = background(b, 'return 431\n', before)
            eventually(queued, 'external-edit waiter registered')
            target.write_bytes(b'return 432 -- external scratch edit\n')
            external_hash = file_hash(target)
            a.release(b'f')
            code_a, _ = external_owner.result(timeout=20)
            code_b, result = external_waiter.result(timeout=20)
            check('queued-writer-refuses-external-edit', code_a == 500 and code_b == 409
                  and result.get('code') == 'FILE_CHANGED' and file_hash(target) == external_hash, result)
            # Queued clients may disappear, but their handler must not run later.
            disconnected_file = mods / MOD / 'ui/c06c_disconnected.lua'
            disconnect_owner = background(a, 'return 440\n', file_hash(target))
            a.held()
            disconnected_client = b.open_write_socket('return 441\n', None, MOD + '/ui/c06c_disconnected.lua')
            sockets.append(disconnected_client)
            eventually(queued, 'disconnecting client is queued')
            disconnected_client.shutdown(socket.SHUT_RDWR)
            disconnected_client.close()
            a.release()
            check('disconnect-owner-completed', disconnect_owner.result(timeout=20)[0] == 200)
            eventually(lambda: not b.status()['waiting'] and not b.status()['active'], 'disconnected queue drains')
            check('queued-disconnected-handler-never-wrote', not disconnected_file.exists())
            # A is already inside the synchronous production writer when its
            # client disconnects; B must still observe A's claim until promotion.
            active_client = a.open_write_socket('return 450\n', file_hash(target))
            sockets.append(active_client)
            a.held()
            active_client.shutdown(socket.SHUT_RDWR)
            active_client.close()
            active_waiter = background(b, 'return 451\n', file_hash(target))
            active_state = eventually(queued, 'active disconnect retains claim')
            check('active-disconnect-does-not-release-claim', any(row['pid'] == a.child.pid for row in active_state['active'])
                  and not active_waiter.done(), active_state)
            a.release()
            code, result = active_waiter.result(timeout=20)
            check('active-disconnect-write-finishes-before-waiter', code == 409 and result.get('code') == 'FILE_CHANGED'
                  and target.read_text() == 'return 450\n', result)
            # A failed promoted write leaves no target mutation or stranded owner.
            before = file_hash(target)
            failed = background(a, 'return 500\n', before)
            a.held()
            a.release(b'f')
            code, result = failed.result(timeout=20)
            check('handler-exception-preserves-target', code == 500 and file_hash(target) == before, result)
            code, result = write(b, 'return 501\n', before)
            check('handler-exception-releases-owner', code == 200, result)
            # Real process death, not a lease expiry: A is positively held, B is
            # positively queued, and recovery starts after the owned PID exits.
            before = file_hash(target)
            crashed = background(a, 'return 600\n', before)
            a.held()
            recovery = background(b, 'return 601\n', before)
            state = eventually(queued, 'crash recovery waiter registered')
            check('crash-owner-still-exclusive', file_hash(target) == before and not recovery.done(), state)
            a.stop()
            try:
                crashed.result(timeout=20)
                check('crashed-request-did-not-report-success', False)
            except (OSError, urllib.error.URLError):
                check('crashed-request-did-not-report-success', True)
            code, result = recovery.result(timeout=25)
            check('confirmed-dead-owner-recovery', a.child.poll() is not None and code == 200
                  and target.read_text() == 'return 601\n', result)
            final_state = b.status()
            check('recovered-registry-has-no-owner-or-waiter', not final_state['active'] and not final_state['waiting'], final_state)
            # Reuse the known workspace object without an import (import itself
            # correctly refuses when coordination is unavailable).
            code, workspace_result = b.request('/api/agent/workspace')
            check('workspace-read-for-failure-drills', code == 200 and bool(workspace_result.get('workspace')))
            for failure_kind in ['corrupt', 'unavailable', 'missing', 'abi']:
                isolated_registry = run / ('registry-' + failure_kind)
                if failure_kind == 'unavailable':
                    isolated_registry.write_bytes(b'not a directory')
                else:
                    isolated_registry.mkdir()
                    if failure_kind == 'corrupt':
                        (isolated_registry / 'source-coordination.sqlite').write_bytes(b'C06c intentionally corrupt database\n')
                unavailable = Server('failure-' + failure_kind, run, mods, isolated_registry, None, reference, trace,
                                     failure_kind if failure_kind in ['missing', 'abi'] else None)
                servers.append(unavailable)
                unavailable.ready()
                code, created = unavailable.request('/api/agent/workspaces', {
                    'workspace': workspace_result['workspace'], 'name': 'C06c failure ' + failure_kind,
                    'clientId': unavailable.client})
                check(failure_kind + '-workspace-created-without-source-write', code == 201, created)
                unavailable.workspace = created['workspaceId']
                unavailable_state = unavailable.status()
                check(failure_kind + '-health-readable-and-unavailable', unavailable_state.get('available') is False
                      and bool(unavailable_state.get('code')) and bool(unavailable_state.get('reason')), unavailable_state)
                if failure_kind in ['missing', 'abi']:
                    check(failure_kind + '-dependency-named', 'better-sqlite3' in unavailable_state.get('reason', ''), unavailable_state)
                before = file_hash(target)
                code, result = write(unavailable, 'return 999\n', before)
                check(failure_kind + '-write-refuses-without-fallback', code == 503
                      and result.get('failureCategory') == 'forge-infrastructure' and file_hash(target) == before, result)
                unavailable.stop()
                # Explicit scratch repair/restart, preserving the failed bytes.
                if failure_kind == 'corrupt':
                    (isolated_registry / 'source-coordination.sqlite').rename(isolated_registry / 'corrupt-original.sqlite')
                elif failure_kind == 'unavailable':
                    isolated_registry.rename(run / 'unavailable-original-file')
                    isolated_registry.mkdir()
                repaired = Server('recovery-' + failure_kind, run, mods, isolated_registry, None, reference, trace)
                servers.append(repaired)
                repaired.ready()
                repaired.workspace = repaired.import_workspace(MOD, 'C06c recovered ' + failure_kind)
                repaired_state = repaired.status()
                code, result = write(repaired, 'return 700 -- recovered ' + failure_kind + '\n', file_hash(target))
                check(failure_kind + '-explicit-restart-recovers', repaired_state.get('available') is True
                      and code == 200 and not repaired.status()['active'], result)
                repaired.stop()
            # Dependency/corruption failures do not poison a healthy participant.
            code, result = write(b, 'return 602\n', file_hash(target))
            check('healthy-participant-still-writes-after-failure-drills', code == 200 and target.read_text() == 'return 602\n', result)
        checks['completed'] = True
    except BaseException as error:
        failure = ''.join(traceback.format_exception(error))
        (run / 'failure.txt').write_text(failure, encoding='utf-8')
    finally:
        for client in sockets:
            client.close()
        for server in servers:
            server.stop()
        executor.shutdown(wait=True, cancel_futures=True)
        checks['owned-children-stopped'] = all(server.child.poll() is not None for server in servers)
        def port_closed(server):
            with socket.socket() as probe:
                probe.settimeout(.5)
                return probe.connect_ex(('127.0.0.1', server.port)) != 0
        checks['owned-server-ports-closed'] = all(port_closed(server) for server in servers)
        if protected_paths:
            checks['protected-files-unchanged'] = snapshot(protected_paths) == protected_before
        checks['tested-server-bytes-unchanged'] = file_hash(ENTRY) == entry_hash
        checks['harness-bytes-unchanged'] = snapshot([pathlib.Path(__file__), BARRIER]) == harness_hashes
        result = {'pass': failure is None and bool(checks) and all(checks.values()), 'checks': checks,
                  'run': str(run), 'serverHash': entry_hash,
                  'mode': 'baseline-reproduction' if args.baseline else 'fixed-production-http',
                  'children': [{'name': server.name, 'pid': server.child.pid, 'port': server.port,
                                'exitCode': server.child.poll()} for server in servers],
                  'protectedBefore': protected_before, 'protectedAfter': snapshot(protected_paths),
                  'protectedStateEvidence': 'compared' if protected_paths else 'not requested; no protected-state claim',
                  'limitations': ['scratch source and two owned compiled servers only',
                                  'exact-target harness preload pauses a production write before rename',
                                  'no installed-host, live Forge, external-editor exclusion or game proof']}
        if failure:
            result['failure'] = failure
        save_json(run / 'verdict.json', result)
        print(json.dumps({'pass': result['pass'], 'checks': len(checks), 'run': str(run), 'serverHash': entry_hash}), flush=True)
    if not result['pass']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
