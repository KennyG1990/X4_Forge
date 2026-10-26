"""D0: actual compiled Dev mode refuses shared/default coordination before writes.

Reuses the C06c owned-server lifecycle; only the child's environment is varied.
All user/default directory paths are replaced by a fake per-user root. Never
connects to installed Forge, reads a real key or opens the real default registry.
"""
import argparse
import importlib.util
import json
import os
import pathlib
import socket
import traceback
import uuid
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('coordination_proof', ROOT / 'scripts/c06c-coordination-proof.py')
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


def main():
    if os.name != 'nt':
        raise SystemExit('This proof requires Windows; no child was launched and no user registry was opened.')
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'test-results/claude-D0')
    args = parser.parse_args()
    run = args.output.resolve() / ('run-' + uuid.uuid4().hex[:12])
    run.mkdir(parents=True)
    mods = run / 'mods'
    target = mods / proof.MOD / 'ui/d0.lua'
    target.parent.mkdir(parents=True)
    target.write_text('return 1\n', encoding='utf-8')
    checks, children, traces = {}, [], []
    failure = None
    server_hash = proof.file_hash(proof.ENTRY)
    harness_hash = proof.file_hash(__file__)

    def check(name, value):
        checks[name] = bool(value)
        if not value:
            raise AssertionError(name)

    original_popen = proof.subprocess.Popen
    try:
        for mode in ('missing', 'shared', 'private'):
            fake_user = run / mode / 'fake-localappdata'
            default = fake_user / 'X4Forge/source-coordination'
            private = run / mode / 'private-coordination'

            def launch(*pargs, **kwargs):
                env = dict(kwargs['env'])
                env.update(X4_FORGE_MODE='dev-build', LOCALAPPDATA=str(fake_user))
                if mode == 'missing':
                    env.pop('X4_SOURCE_COORDINATION_DIR', None)
                else:
                    env['X4_SOURCE_COORDINATION_DIR'] = str(default if mode == 'shared' else private)
                kwargs['env'] = env
                return original_popen(*pargs, **kwargs)

            with patch.object(proof.subprocess, 'Popen', launch):
                server = proof.Server(mode, run, mods, private, None, None, traces.append)
            children.append(server)
            server.ready()
            status = server.status()
            expected = proof.file_hash(target)
            code, result = server.request('/api/fs/write', {
                'path': proof.MOD + '/ui/d0.lua', 'content': 'return 2\n', 'expectedSha256': expected})
            if mode != 'private':
                check(mode + '-diagnostics-remain-readable', status.get('available') is False)
                check(mode + '-write-refused', code == 503 and result.get('code') == 'SOURCE_COORDINATION_UNAVAILABLE')
                check(mode + '-infrastructure-classification', result.get('failureCategory') == 'forge-infrastructure')
                check(mode + '-source-unchanged', proof.file_hash(target) == expected)
                check(mode + '-default-registry-never-created', not default.exists())
                check(mode + '-private-registry-never-created', not private.exists())
            else:
                check('private-native-coordinator-available', status.get('available') is True)
                check('private-write-succeeds', code == 200 and target.read_text() == 'return 2\n')
                check('private-registry-exists-only-in-private-root', (private / 'source-coordination.sqlite').is_file() and not default.exists())
                check('private-owner-released', not server.status().get('active'))
                db_code, db = server.request('/api/agent/db-selftest')
                actual = pathlib.Path(db.get('liveCache', '')).resolve()
                expected_cache = (server.run / 'data/studio-cache/index.db').resolve()
                check('private-studio-cache-contained', db_code == 200 and db.get('available') is True and actual == expected_cache and actual.is_file())
            server.stop()
        checks['completed'] = True
    except BaseException as error:
        failure = ''.join(traceback.format_exception(error))
        (run / 'failure.txt').write_text(failure, encoding='utf-8')
    finally:
        for server in children:
            server.stop()
        checks['owned-children-stopped'] = all(s.child.poll() is not None for s in children)
        closed = []
        for server in children:
            with socket.socket() as probe:
                probe.settimeout(.5)
                closed.append(probe.connect_ex(('127.0.0.1', server.port)) != 0)
        checks['owned-ports-closed'] = all(closed)
        checks['tested-server-unchanged'] = proof.file_hash(proof.ENTRY) == server_hash
        checks['harness-unchanged'] = proof.file_hash(__file__) == harness_hash
        result = {'pass': failure is None and all(checks.values()), 'checks': checks,
                  'serverHash': server_hash, 'harnessHash': harness_hash, 'run': str(run),
                  'children': [{'pid': s.child.pid, 'port': s.port, 'exitCode': s.child.poll()} for s in children],
                  'limits': ['three owned compiled servers run serially', 'fake per-user default registry',
                             'child environment variation only; no installed-host/game proof']}
        if failure:
            result['failure'] = failure
        proof.save_json(run / 'requests.json', traces)
        proof.save_json(run / 'verdict.json', result)
        print(json.dumps({'pass': result['pass'], 'checks': len(checks), 'run': str(run), 'serverHash': server_hash}), flush=True)
    if not result['pass']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
