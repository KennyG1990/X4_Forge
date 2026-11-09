"""Private Windows command containment. The caller owns trust and the run lease."""

import ctypes as ct
from ctypes import wintypes as win
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import math
import os
from pathlib import Path
import re
import subprocess
import time


if os.name != "nt":
    raise RuntimeError("Project check Jobs require Windows.")

_KERNEL = ct.WinDLL("kernel32", use_last_error=True)
_HANDLE = win.HANDLE
_DWORD = win.DWORD
_SIZE_T = ct.c_size_t
_PVOID = ct.c_void_p
_INVALID_HANDLE = _PVOID(-1).value

JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION = 1
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x20002
PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x2000D
EXTENDED_STARTUPINFO_PRESENT = 0x80000
CREATE_UNICODE_ENVIRONMENT = 0x400
CREATE_NO_WINDOW = 0x8000000
STARTF_USESTDHANDLES = 0x100
HANDLE_FLAG_INHERIT = 1
ERROR_ALREADY_EXISTS = 183
ERROR_INSUFFICIENT_BUFFER = 122
_PIPE_CLOSED = (109, 233)
_POLL_SECONDS = 0.01
_CLEANUP_SECONDS = 5
_MAX_RETAINED = 64 * 1024
_MAX_OUTPUT = 1024 * 1024
_MAX_WINDOWS_BLOCK_UNITS = 32767


class _BasicLimits(ct.Structure):
    _fields_ = [
        ("process_time", ct.c_longlong), ("job_time", ct.c_longlong), ("flags", _DWORD),
        ("min_working_set", _SIZE_T), ("max_working_set", _SIZE_T), ("active_limit", _DWORD),
        ("affinity", _SIZE_T), ("priority_class", _DWORD), ("scheduling_class", _DWORD),
    ]


class _ExtendedLimits(ct.Structure):
    _fields_ = [
        ("basic", _BasicLimits), ("io", ct.c_uint64 * 6), ("process_memory", _SIZE_T),
        ("job_memory", _SIZE_T), ("peak_process_memory", _SIZE_T), ("peak_job_memory", _SIZE_T),
    ]


class _Accounting(ct.Structure):
    _fields_ = [
        ("user_time", ct.c_longlong), ("kernel_time", ct.c_longlong),
        ("period_user_time", ct.c_longlong), ("period_kernel_time", ct.c_longlong),
        ("page_faults", _DWORD), ("total_processes", _DWORD), ("active_processes", _DWORD),
        ("terminated_processes", _DWORD),
    ]


class _StartupInfo(ct.Structure):
    _fields_ = [
        ("size", _DWORD), ("reserved", win.LPWSTR), ("desktop", win.LPWSTR), ("title", win.LPWSTR),
        ("x", _DWORD), ("y", _DWORD), ("x_size", _DWORD), ("y_size", _DWORD),
        ("x_chars", _DWORD), ("y_chars", _DWORD), ("fill", _DWORD), ("flags", _DWORD),
        ("show", win.WORD), ("reserved_bytes", win.WORD), ("reserved_data", _PVOID),
        ("stdin", _HANDLE), ("stdout", _HANDLE), ("stderr", _HANDLE),
    ]


class _StartupInfoEx(ct.Structure):
    _fields_ = [("startup", _StartupInfo), ("attributes", _PVOID)]


class _ProcessInfo(ct.Structure):
    _fields_ = [("process", _HANDLE), ("thread", _HANDLE), ("pid", _DWORD), ("tid", _DWORD)]


class _SecurityAttributes(ct.Structure):
    _fields_ = [("length", _DWORD), ("descriptor", _PVOID), ("inheritable", win.BOOL)]


def _bind(name, result, *arguments):
    function = getattr(_KERNEL, name)
    function.restype = result
    function.argtypes = arguments
    return function


_create_job = _bind("CreateJobObjectW", _HANDLE, _PVOID, win.LPCWSTR)
_set_job = _bind("SetInformationJobObject", win.BOOL, _HANDLE, ct.c_int, _PVOID, _DWORD)
_query_job = _bind("QueryInformationJobObject", win.BOOL, _HANDLE, ct.c_int, _PVOID, _DWORD, _PVOID)
_terminate_job = _bind("TerminateJobObject", win.BOOL, _HANDLE, win.UINT)
_close_handle = _bind("CloseHandle", win.BOOL, _HANDLE)
_create_pipe = _bind("CreatePipe", win.BOOL, ct.POINTER(_HANDLE), ct.POINTER(_HANDLE), _PVOID, _DWORD)
_set_handle = _bind("SetHandleInformation", win.BOOL, _HANDLE, _DWORD, _DWORD)
_create_file = _bind("CreateFileW", _HANDLE, win.LPCWSTR, _DWORD, _DWORD, _PVOID, _DWORD, _DWORD, _HANDLE)
_peek_pipe = _bind("PeekNamedPipe", win.BOOL, _HANDLE, _PVOID, _DWORD, _PVOID, ct.POINTER(_DWORD), _PVOID)
_read_file = _bind("ReadFile", win.BOOL, _HANDLE, _PVOID, _DWORD, ct.POINTER(_DWORD), _PVOID)
_init_attributes = _bind("InitializeProcThreadAttributeList", win.BOOL, _PVOID, _DWORD, _DWORD, ct.POINTER(_SIZE_T))
_update_attribute = _bind("UpdateProcThreadAttribute", win.BOOL, _PVOID, _DWORD, _SIZE_T, _PVOID, _SIZE_T, _PVOID, _PVOID)
_delete_attributes = _bind("DeleteProcThreadAttributeList", None, _PVOID)
_create_process = _bind(
    "CreateProcessW", win.BOOL, win.LPCWSTR, win.LPWSTR, _PVOID, _PVOID, win.BOOL, _DWORD,
    _PVOID, win.LPCWSTR, ct.POINTER(_StartupInfo), ct.POINTER(_ProcessInfo),
)
_get_exit_code = _bind("GetExitCodeProcess", win.BOOL, _HANDLE, ct.POINTER(_DWORD))


@dataclass(frozen=True)
class CommandResult:
    status: str
    exit_code: int | None
    output_tail: bytes
    output_bytes: int
    duration_seconds: float
    tree_empty: bool
    error: str | None = None


def _check(ok, name):
    if not ok:
        error = ct.get_last_error()
        raise OSError(error, f"{name} failed with Win32 error {error}")


def _close(handle):
    if handle is not None and handle != _INVALID_HANDLE:
        _close_handle(handle)


def _active(job):
    result = _Accounting()
    _check(_query_job(job, JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION, ct.byref(result),
                      ct.sizeof(result), None), "QueryInformationJobObject")
    return result.active_processes


def _kill_and_confirm(job):
    _terminate_job(job, 1)
    deadline = time.monotonic() + _CLEANUP_SECONDS
    try:
        while _active(job):
            if time.monotonic() >= deadline:
                return False
            time.sleep(_POLL_SECONDS)
    except OSError:
        return False
    return True


def _launch(job, output, stdin, executable, command_line, cwd, env_block, process):
    size = _SIZE_T()
    ct.set_last_error(0)
    _init_attributes(None, 2, 0, ct.byref(size))
    if not size.value or ct.get_last_error() != ERROR_INSUFFICIENT_BUFFER:
        _check(False, "InitializeProcThreadAttributeList sizing")
    attributes = ct.create_string_buffer(size.value)
    _check(_init_attributes(attributes, 2, 0, ct.byref(size)), "InitializeProcThreadAttributeList")
    try:
        jobs = (_HANDLE * 1)(job)
        handles = (_HANDLE * 2)(output, stdin)
        _check(_update_attribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs, ct.sizeof(jobs),
                                 None, None), "UpdateProcThreadAttribute JOB_LIST")
        _check(_update_attribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles, ct.sizeof(handles),
                                 None, None), "UpdateProcThreadAttribute HANDLE_LIST")
        startup = _StartupInfoEx()
        startup.startup.size = ct.sizeof(startup)
        startup.startup.flags = STARTF_USESTDHANDLES
        startup.startup.stdin = stdin
        startup.startup.stdout = output
        startup.startup.stderr = output
        startup.attributes = ct.addressof(attributes)
        # The process enters the Job atomically, before its first instruction.
        _check(_create_process(executable, command_line, None, None, True,
                               EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                               env_block, cwd, ct.byref(startup.startup), ct.byref(process)), "CreateProcessW")
    finally:
        _delete_attributes(attributes)


def _read_output(pipe, remaining):
    available = _DWORD()
    if not _peek_pipe(pipe, None, 0, None, ct.byref(available), None):
        if ct.get_last_error() in _PIPE_CLOSED:
            return b"", True
        _check(False, "PeekNamedPipe")
    if not available.value:
        return b"", False
    buffer = ct.create_string_buffer(min(available.value, remaining, _MAX_RETAINED))
    count = _DWORD()
    _check(_read_file(pipe, buffer, ct.sizeof(buffer), ct.byref(count), None), "ReadFile")
    return buffer.raw[:count.value], False


def _observe(job, process, pipe, started, timeout, cancel, retained, maximum):
    tail = bytearray()
    seen = 0
    error = None
    try:
        while True:
            if cancel is not None and cancel():
                status = "canceled"
                break
            if time.monotonic() - started >= timeout:
                status = "timed-out"
                break
            chunk, eof = _read_output(pipe, maximum + 1 - seen)
            seen += len(chunk)
            if retained:
                tail.extend(chunk)
                if len(tail) > retained:
                    del tail[:-retained]
            if seen > maximum:
                status = "output-limit"
                break
            if eof and _active(job) == 0:
                exit_code = _DWORD()
                _check(_get_exit_code(process, ct.byref(exit_code)), "GetExitCodeProcess")
                return CommandResult("passed" if exit_code.value == 0 else "failed", exit_code.value,
                                     bytes(tail), seen, time.monotonic() - started, True)
            if not chunk:
                time.sleep(_POLL_SECONDS)
    except Exception as exc:
        status, error = "infrastructure-error", str(exc)
    tree_empty = _kill_and_confirm(job)
    return CommandResult(status if tree_empty else "cleanup-unconfirmed", None, bytes(tail), seen,
                         time.monotonic() - started, tree_empty, error)


class CommandNotStartedError(OSError):
    """Windows rejected the attempt before it produced a process handle."""


def prepare_launch(executable, arguments, *, cwd, environment, job_name, timeout_seconds,
                   retained_bytes, max_output_bytes):
    for value in (executable, cwd):
        location = Path(value)
        if not location.is_absolute() or not re.fullmatch(r"[A-Za-z]:", location.drive) or "\0" in value:
            raise ValueError("Executable and working directory must be absolute local paths.")
    if not re.fullmatch(r"Local\\X4ForgeProjectCheck-[a-f0-9]{32}", job_name):
        raise ValueError("A unique local Forge Job name is required.")
    if isinstance(timeout_seconds, bool) or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= 300:
        raise ValueError("Command timeout must be positive and at most 300 seconds.")
    if (type(retained_bytes) is not int or type(max_output_bytes) is not int
        or not 0 <= retained_bytes <= _MAX_RETAINED or not 1 <= max_output_bytes <= _MAX_OUTPUT):
        raise ValueError("Command output limits exceed the private runner bounds.")
    if (isinstance(arguments, (str, bytes)) or len(arguments) > 128
        or any(not isinstance(arg, str) or "\0" in arg for arg in arguments)):
        raise ValueError("Command arguments must be literal strings without NUL.")
    if len(environment) > 64 or any(
        not isinstance(key, str) or not isinstance(value, str) or not key
        or "=" in key or "\0" in key or "\0" in value for key, value in environment.items()
    ):
        raise ValueError("Invalid explicit environment.")
    env = sorted(environment.items(), key=lambda item: item[0].upper())
    if len({key.upper() for key, _ in env}) != len(env):
        raise ValueError("Explicit environment contains case-colliding keys.")
    command = subprocess.list2cmdline([executable, *arguments])
    environment_text = "\0".join(f"{key}={value}" for key, value in env) + "\0"
    if any(len(value.encode("utf-16-le")) // 2 + 1 > _MAX_WINDOWS_BLOCK_UNITS
           for value in (command, environment_text)):
        raise ValueError("Command or explicit environment exceeds the Windows launch limit.")
    return ct.create_unicode_buffer(command), ct.create_unicode_buffer(environment_text)


def run_command(
    executable: str, arguments: Sequence[str], *,
    cwd: str, environment: Mapping[str, str], job_name: str, timeout_seconds: float,
    cancel: Callable[[], bool] | None = None, retained_bytes: int = _MAX_RETAINED,
    max_output_bytes: int = _MAX_OUTPUT,
) -> CommandResult:
    """Run one authorized command and report completion only after Job cleanup."""
    command_line, env_block = prepare_launch(
        executable, arguments, cwd=cwd, environment=environment, job_name=job_name,
        timeout_seconds=timeout_seconds, retained_bytes=retained_bytes, max_output_bytes=max_output_bytes,
    )
    started = time.monotonic()
    if cancel is not None and cancel():
        return CommandResult("canceled", None, b"", 0, time.monotonic() - started, True)

    ct.set_last_error(0)
    job = _create_job(None, job_name)
    creation_error = ct.get_last_error()
    try:
        _check(job, "CreateJobObjectW")
    except OSError as exc:
        raise CommandNotStartedError(*exc.args) from exc
    reader, writer, process = _HANDLE(), _HANDLE(), _ProcessInfo()
    stdin = None
    try:
        if creation_error == ERROR_ALREADY_EXISTS:
            raise OSError(creation_error, "Project check Job already exists.")
        limits = _ExtendedLimits()
        limits.basic.flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        _check(_set_job(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ct.byref(limits),
                        ct.sizeof(limits)), "SetInformationJobObject")
        _check(_create_pipe(ct.byref(reader), ct.byref(writer), None, 0), "CreatePipe")
        _check(_set_handle(writer, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT), "SetHandleInformation")
        inheritable = _SecurityAttributes(ct.sizeof(_SecurityAttributes), None, True)
        stdin = _create_file("NUL", 0x80000000, 3, ct.byref(inheritable), 3, 0x80, None)
        _check(stdin != _INVALID_HANDLE, "CreateFileW NUL")
        if cancel is not None and cancel():
            return CommandResult("canceled", None, b"", 0, time.monotonic() - started, True)
        if time.monotonic() - started >= timeout_seconds:
            return CommandResult("timed-out", None, b"", 0, time.monotonic() - started, True)
        _launch(job, writer.value, stdin, executable, command_line, cwd, env_block, process)
        _close(process.thread)
        process.thread = None
        _close(writer.value)
        writer.value = None
        _close(stdin)
        stdin = None
        return _observe(job, process.process, reader.value, started, timeout_seconds, cancel,
                        retained_bytes, max_output_bytes)
    except OSError as exc:
        if not process.process:
            raise CommandNotStartedError(*exc.args) from exc
        raise
    finally:
        _close(stdin)
        _close(writer.value)
        _close(reader.value)
        _close(process.thread)
        _close(process.process)
        _close(job)
