"""Windows-only smoke with private, short-lived Python fixtures."""

import ctypes as ct
from ctypes import wintypes as win
import json
import msvcrt
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from uuid import uuid4


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "server"))
from projectCheckWindowsJob import (
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    _close, _create_job, _ExtendedLimits, _set_job, run_command,
)


PYTHON = str(Path(sys.executable).resolve(strict=True))
ENVIRONMENT = {"SystemRoot": os.environ["SystemRoot"], "X4_JOB_TEST_ALLOWED": "explicit"}
PYTHON_FLAGS = ["-I", "-S", "-B"]
SYNCHRONIZE = 0x100000
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 258


def job_name():
    return "Local\\X4ForgeProjectCheck-" + uuid4().hex


def run(root, script, *arguments, **settings):
    return run_command(PYTHON, [*PYTHON_FLAGS, "-c", script, *arguments], cwd=str(root),
                       environment=ENVIRONMENT, job_name=job_name(),
                       **{"timeout_seconds": 5, **settings})


def crash_helper(root):
    descendant = (
        "import os,time;from pathlib import Path;"
        "Path('descendant.pid').write_text(str(os.getpid()), encoding='ascii');time.sleep(20)"
    )
    primary = (
        "import os,subprocess,sys,time;from pathlib import Path;"
        "Path('primary.pid').write_text(str(os.getpid()), encoding='ascii');"
        f"subprocess.Popen([sys.executable, '-I', '-S', '-B', '-c', {descendant!r}],"
        "stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL);time.sleep(20)"
    )
    run(root, primary, timeout_seconds=10)


def nested_helper(root):
    # Match the existing supervisor's self-assignment. The command itself joins
    # its own nested Job atomically through the runner under test.
    kernel = ct.WinDLL("kernel32", use_last_error=True)
    assign = kernel.AssignProcessToJobObject
    assign.argtypes = [win.HANDLE, win.HANDLE]
    assign.restype = win.BOOL
    current = kernel.GetCurrentProcess
    current.argtypes = []
    current.restype = win.HANDLE
    outer = _create_job(None, job_name())
    assert outer
    limits = _ExtendedLimits()
    limits.basic.flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    assert _set_job(outer, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ct.byref(limits), ct.sizeof(limits))
    assert assign(outer, current()), ct.get_last_error()
    result = run(root, "print('nested command')")
    assert result.status == "passed" and result.tree_empty and b"nested command" in result.output_tail, result
    # OS closes the outer handle when this self-assigned helper exits.
    print("nested contained", flush=True)


def wait_for_fixture_pids(root, helper):
    deadline = time.monotonic() + 5
    paths = [root / "primary.pid", root / "descendant.pid"]
    while time.monotonic() < deadline and helper.poll() is None:
        try:
            return [int(path.read_text(encoding="ascii")) for path in paths]
        except (OSError, ValueError):
            time.sleep(0.02)
    raise AssertionError("Fixture did not publish both contained process IDs.")


def assert_helper_death_reaps_tree(root, scratch):
    kernel = ct.WinDLL("kernel32", use_last_error=True)
    open_process = kernel.OpenProcess
    open_process.argtypes = [win.DWORD, win.BOOL, win.DWORD]
    open_process.restype = win.HANDLE
    wait = kernel.WaitForSingleObject
    wait.argtypes = [win.HANDLE, win.DWORD]
    wait.restype = win.DWORD
    helper = subprocess.Popen([PYTHON, *PYTHON_FLAGS, __file__, "--crash-helper", str(root)],
                              cwd=root, env={**ENVIRONMENT, "X4_FORGE_PRIVATE_QA": str(scratch)},
                              stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    handles = []
    try:
        for pid in wait_for_fixture_pids(root, helper):
            handle = open_process(SYNCHRONIZE, False, pid)
            assert handle, "The published fixture PID must be addressable before helper death."
            handles.append(handle)
        assert all(wait(handle, 0) == WAIT_TIMEOUT for handle in handles)
        helper.kill()
        helper.wait(timeout=5)
        assert all(wait(handle, 5000) == WAIT_OBJECT_0 for handle in handles), "Helper death left a live fixture process."
    finally:
        if helper.poll() is None:
            helper.kill()
            helper.wait(timeout=5)
        for handle in handles:
            _close(handle)


def main():
    scratch = Path(os.environ["X4_FORGE_PRIVATE_QA"]).resolve(strict=True)
    if len(sys.argv) == 3 and sys.argv[1] in ("--crash-helper", "--nested-helper"):
        root = Path(sys.argv[2]).resolve(strict=True)
        assert root.parent == scratch and root.name.startswith("a15-job-")
        if sys.argv[1] == "--crash-helper":
            crash_helper(root)
        else:
            nested_helper(root)
        return
    assert len(sys.argv) == 1
    with tempfile.TemporaryDirectory(prefix="a15-job-", dir=scratch) as fixture:
        root = Path(fixture).resolve(strict=True)
        assert root.parent == scratch
        os.environ["X4_JOB_TEST_PRIVATE_PARENT_VALUE"] = "parent-only"
        arguments = ("with space", 'quote" and trailing slash ' + chr(92), "")
        passed = run(root, """
import json, os, sys
assert os.environ.get("X4_JOB_TEST_PRIVATE_PARENT_VALUE") is None
assert os.environ["X4_JOB_TEST_ALLOWED"] == "explicit"
assert sys.stdin.buffer.read() == b""
print(json.dumps(sys.argv[1:]), flush=True)
print("stderr", file=sys.stderr, flush=True)
""", *arguments)
        assert passed.status == "passed" and passed.exit_code == 0 and passed.tree_empty, passed
        lines = passed.output_tail.decode("utf8").splitlines()
        assert json.loads(lines[0]) == list(arguments) and lines[1] == "stderr", passed
        print("PASS literal arguments, explicit environment, null stdin and captured output", flush=True)

        with (root / "parent-only-handle").open("w+b") as private_file:
            parent_handle = msvcrt.get_osfhandle(private_file.fileno())
            os.set_handle_inheritable(parent_handle, True)
            denied = run(root, """
import ctypes as ct, sys
from ctypes import wintypes as win
path_for = ct.WinDLL("kernel32").GetFinalPathNameByHandleW
path_for.argtypes = [win.HANDLE, win.LPWSTR, win.DWORD, win.DWORD]
path_for.restype = win.DWORD
path = ct.create_unicode_buffer(4096)
path_for(int(sys.argv[1]), path, len(path), 0)
assert not path.value.endswith("parent-only-handle")
""", str(parent_handle))
        assert denied.status == "passed" and denied.tree_empty, denied
        print("PASS an unrelated inheritable file handle stays private", flush=True)

        failed = run(root, "print('failure');raise SystemExit(7)")
        assert failed.status == "failed" and failed.exit_code == 7 and failed.tree_empty and b"failure" in failed.output_tail, failed
        print("PASS nonzero status", flush=True)

        try:
            run(root, "raise AssertionError('must not launch')", "a" * 32767)
        except ValueError as error:
            assert "launch limit" in str(error)
        else:
            raise AssertionError("Oversized argv was not refused.")
        print("PASS oversized launch input is refused", flush=True)

        flood = run(root, "import sys;sys.stdout.buffer.write(b'x' * 200000)", retained_bytes=64, max_output_bytes=4096)
        assert flood.status == "output-limit" and flood.output_bytes == 4097 and flood.output_tail == b"x" * 64 and flood.tree_empty, flood
        print("PASS bounded output flood and retained tail", flush=True)

        timed_out = run(root, "import time;time.sleep(20)", timeout_seconds=0.2)
        assert timed_out.status == "timed-out" and timed_out.tree_empty, timed_out
        deadline = time.monotonic() + 0.2
        canceled = run(root, "import time;time.sleep(20)", cancel=lambda: time.monotonic() >= deadline)
        assert canceled.status == "canceled" and canceled.tree_empty, canceled
        pre_canceled = run(root, "from pathlib import Path;Path('pre-canceled').touch()", cancel=lambda: True)
        assert pre_canceled.status == "canceled" and pre_canceled.tree_empty and not (root / "pre-canceled").exists()
        print("PASS timeout and cancellation confirmed empty", flush=True)

        grandchild = "import time;from pathlib import Path;time.sleep(0.5);Path('grandchild.done').touch()"
        tree = run(root, (
            "import subprocess,sys;"
            f"subprocess.Popen([sys.executable, '-I', '-S', '-B', '-c', {grandchild!r}],"
            "stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL);print('root exited')"
        ))
        assert tree.status == "passed" and tree.tree_empty and (root / "grandchild.done").is_file(), tree
        assert tree.duration_seconds >= 0.5, tree
        print("PASS root exit with live grandchild waits for Job empty", flush=True)

        occupied = job_name()
        handle = _create_job(None, occupied)
        assert handle
        try:
            try:
                run_command(PYTHON, [*PYTHON_FLAGS, "-c", "raise SystemExit(0)"], cwd=str(root),
                            environment=ENVIRONMENT, job_name=occupied, timeout_seconds=3)
            except OSError as error:
                assert error.errno == 183
            else:
                raise AssertionError("Named Job collision did not refuse launch.")
        finally:
            _close(handle)
        print("PASS occupied named Job is not reused", flush=True)

        assert_helper_death_reaps_tree(root, scratch)
        print("PASS helper death reaps both owned processes", flush=True)
        nested = subprocess.run([PYTHON, *PYTHON_FLAGS, __file__, "--nested-helper", str(root)],
                                cwd=root, env={**ENVIRONMENT, "X4_FORGE_PRIVATE_QA": str(scratch)},
                                stdin=subprocess.DEVNULL, capture_output=True, timeout=8,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        assert nested.returncode == 0 and b"nested contained" in nested.stdout, nested
        print("PASS command Job nests inside a self-assigned supervisor Job", flush=True)


if __name__ == "__main__":
    main()
