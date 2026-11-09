"""Private one-command worker for the shared Forge source lease."""

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import types


APPLICATION_ID = 0x58345343
SCHEMA_VERSION = 2
MAX_FRAME_BYTES = 256 * 1024
RETAINED_OUTPUT_BYTES = 64 * 1024
MAX_OUTPUT_BYTES = 1024 * 1024
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
RUN_ID = re.compile(r"[0-9a-f]{32}")
BINDING_HASH = re.compile(r"[0-9a-f]{64}")
CHECK_ID = re.compile(r"[a-z][a-z0-9._-]{0,63}")
DEVICE_SERIAL = re.compile(r"[1-9][0-9]{0,9}")
FILE_INDEX = re.compile(r"[1-9][0-9]{0,19}")
MAX_LAUNCHER_BYTES = 1024 * 1024


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field.")
        result[key] = value
    return result


def _reject_number(_value):
    raise ValueError("Invalid JSON number.")


def _parse_json(text):
    return json.loads(text, object_pairs_hook=_strict_object, parse_constant=_reject_number)


def _canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _shape(value, keys):
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError("Unexpected launch frame fields.")


def _match(value, pattern):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def _valid_pid(value):
    return type(value) is int and 0 < value <= 0xffffffff


def _valid_text(value):
    return isinstance(value, str) and all(32 <= ord(char) != 127 and not 0xd800 <= ord(char) <= 0xdfff for char in value)


def _local_path(value):
    if not _valid_text(value) or len(value) > 32767:
        raise ValueError("An absolute local path is required.")
    path = Path(value)
    if not path.is_absolute() or not re.fullmatch(r"[A-Za-z]:", path.drive) or ":" in value[2:]:
        raise ValueError("An absolute local path is required.")
    return path


def _validate_command(command, guard):
    _shape(command, {"runner", "runId", "checkId", "jobName", "executable", "args", "cwd",
                     "environment", "timeoutSeconds", "retainedOutputBytes", "maxOutputBytes"})
    if (command["runner"] != "windows-python-job-v1" or command["runId"] != guard["runId"]
        or not _match(command["checkId"], CHECK_ID) or command["jobName"] != guard["jobName"]):
        raise ValueError("Command identity does not match the guarded run.")
    key = _canonical_json([command["runId"], command["checkId"]]).encode("utf8")
    expected_job = "Local\\X4ForgeProjectCheck-" + hashlib.sha256(key).hexdigest()[:32]
    if command["jobName"] != expected_job:
        raise ValueError("Unexpected Job name for this check.")
    if hashlib.sha256(_canonical_json(command).encode("utf8")).hexdigest() != guard["commandHash"]:
        raise ValueError("Exact command differs from the admitted binding.")
    executable = _local_path(command["executable"])
    cwd = _local_path(command["cwd"])
    args = command["args"]
    if (not isinstance(args, list) or not 4 <= len(args) <= 68 or args[:3] != ["-I", "-S", "-B"]
        or not all(_valid_text(item) for item in args)):
        raise ValueError("Invalid private Python arguments.")
    script = _local_path(args[3])
    if (executable.suffix.lower() != ".exe" or script.suffix.lower() != ".py"
        or not script.is_relative_to(cwd) or ".." in script.parts):
        raise ValueError("Invalid private Python entry point.")
    _shape(command["environment"], {"SystemRoot", "FORGE_ARTIFACT_ROOT"})
    for value in command["environment"].values():
        _local_path(value)
    if (type(command["timeoutSeconds"]) is not int or not 1 <= command["timeoutSeconds"] <= 300
        or type(command["retainedOutputBytes"]) is not int or command["retainedOutputBytes"] != RETAINED_OUTPUT_BYTES
        or type(command["maxOutputBytes"]) is not int or command["maxOutputBytes"] != MAX_OUTPUT_BYTES):
        raise ValueError("Unexpected project check limits.")


def _read_frame():
    line = sys.stdin.buffer.readline(MAX_FRAME_BYTES + 1)
    if len(line) > MAX_FRAME_BYTES or not line.endswith(b"\n"):
        raise ValueError("No complete bounded launch frame.")
    frame = _parse_json(line.decode("utf8"))
    _shape(frame, {"registry", "claimId", "instanceId", "backendPid", "guardJson", "command"})
    if (not _match(frame["claimId"], UUID) or not _match(frame["instanceId"], UUID)
        or not _valid_pid(frame["backendPid"]) or frame["backendPid"] == os.getpid()):
        raise ValueError("Invalid coordination identity.")
    registry = _local_path(frame["registry"])
    if registry.name.lower() != "source-coordination.sqlite":
        raise ValueError("Unexpected coordination registry filename.")
    if not isinstance(frame["guardJson"], str) or len(frame["guardJson"]) > 1024:
        raise ValueError("Invalid launch guard.")
    guard = _parse_json(frame["guardJson"])
    _shape(guard, {"bindingHash", "commandHash", "helperPid", "jobName", "launcherHash", "registryDevice", "registryFile", "runId"})
    if (not _match(guard["bindingHash"], BINDING_HASH) or not _match(guard["commandHash"], BINDING_HASH)
        or not _match(guard["runId"], RUN_ID)
        or not _match(guard["launcherHash"], BINDING_HASH)
        or not _match(guard["registryDevice"], DEVICE_SERIAL)
        or not _match(guard["registryFile"], FILE_INDEX)
        or not _valid_pid(guard["helperPid"]) or guard["helperPid"] != os.getpid()
        or frame["guardJson"] != _canonical_json(guard)):
        raise ValueError("Launch guard does not address this helper.")
    _validate_command(frame["command"], guard)
    return frame, registry, (int(guard["registryDevice"]), int(guard["registryFile"])), guard["launcherHash"]


def _registry_identity(registry):
    resolved = registry.resolve(strict=True)
    stat = resolved.stat()
    if (os.path.normcase(str(resolved)) != os.path.normcase(str(registry))
        or not resolved.is_file() or stat.st_nlink != 1):
        raise ValueError("The coordination registry must be an existing local file.")
    return stat.st_dev, stat.st_ino


def _transition(database, registry, identity, frame, previous, next_phase):
    if _registry_identity(registry) != identity:
        raise RuntimeError("Coordination registry identity changed.")
    database.execute("BEGIN IMMEDIATE")
    try:
        application = database.execute("PRAGMA application_id").fetchone()[0]
        version = database.execute("PRAGMA user_version").fetchone()[0]
        if application != APPLICATION_ID or version != SCHEMA_VERSION:
            raise RuntimeError("Unexpected coordination database version.")
        relation = database.execute("SELECT type FROM sqlite_schema WHERE name = 'claims'").fetchone()
        trigger = database.execute("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'claims' LIMIT 1").fetchone()
        if relation != ("table",) or trigger is not None:
            raise RuntimeError("Unexpected coordination claims relation.")
        updated = database.execute(
            "UPDATE claims SET guard_phase = ? WHERE id = ? COLLATE BINARY AND instance_id = ? COLLATE BINARY AND pid = ?"
            " AND state = 'active' COLLATE BINARY AND guard_json = ? COLLATE BINARY AND guard_phase = ? COLLATE BINARY",
            (next_phase, frame["claimId"], frame["instanceId"], frame["backendPid"], frame["guardJson"], previous),
        ).rowcount
        if updated not in (0, 1) or _registry_identity(registry) != identity:
            raise RuntimeError("Coordination claim transition is unresolved.")
        database.execute("COMMIT")
        return updated == 1
    except BaseException:
        if database.in_transaction:
            database.rollback()
        raise


def _load_launcher(expected_hash):
    # Compile the pinned source directly. -B alone still permits cached bytecode reads.
    filename = Path(__file__).resolve(strict=True).with_name("projectCheckWindowsJob.py")
    with filename.open("rb") as source:
        content = source.read(MAX_LAUNCHER_BYTES + 1)
    if len(content) > MAX_LAUNCHER_BYTES or hashlib.sha256(content).hexdigest() != expected_hash:
        raise RuntimeError("Private Windows launcher failed verification.")
    module = types.ModuleType("projectCheckWindowsJob")
    module.__file__ = str(filename)
    sys.modules[module.__name__] = module
    exec(compile(content, str(filename), "exec", dont_inherit=True), module.__dict__)
    return module


def _result(status, *, result=None, cleanup_persisted=False):
    return {
        "status": status,
        "exitCode": result.exit_code if result else None,
        "outputBytes": result.output_bytes if result else 0,
        "durationSeconds": result.duration_seconds if result else 0,
        "treeEmpty": result.tree_empty if result else False,
        "cleanupPersisted": cleanup_persisted,
        **({"outputTailBase64": base64.b64encode(result.output_tail).decode("ascii")} if result else {}),
    }


def _write_result(result):
    data = (_canonical_json(result) + "\n").encode("ascii")
    offset = 0
    try:
        while offset < len(data):
            count = os.write(sys.stdout.fileno(), data[offset:])
            if not count:
                return
            offset += count
    except OSError:
        # A dead backend's pipe cannot undo a committed drained phase.
        pass


def main():
    if os.name != "nt" or not sys.flags.isolated or not sys.flags.no_site or not sys.dont_write_bytecode or len(sys.argv) != 1:
        return 1
    try:
        frame, registry, armed_identity, launcher_hash = _read_frame()
    except (OSError, ValueError, RecursionError):
        _write_result(_result("invalid-frame"))
        return 1
    command = frame["command"]
    args = (command["executable"], command["args"])
    options = dict(cwd=command["cwd"], environment=command["environment"],
                   job_name=command["jobName"], timeout_seconds=command["timeoutSeconds"],
                   retained_bytes=command["retainedOutputBytes"], max_output_bytes=command["maxOutputBytes"])
    try:
        launcher = _load_launcher(launcher_hash)
    except Exception:
        _write_result(_result("infrastructure-error"))
        return 1
    try:
        launcher.prepare_launch(*args, **options)
    except ValueError:
        _write_result(_result("invalid-frame"))
        return 1
    database = None
    try:
        try:
            identity = _registry_identity(registry)
            if (identity[0] & 0xffffffff, identity[1]) != armed_identity:
                raise RuntimeError("Coordination registry differs from the armed file.")
            database = sqlite3.connect(registry.as_uri() + "?mode=rw", uri=True, timeout=0.1, isolation_level=None)
            database.execute("PRAGMA synchronous = FULL")
            if not _transition(database, registry, identity, frame, "armed", "running"):
                _write_result(_result("claim-mismatch"))
                return 1
        except Exception:
            _write_result(_result("registry-unavailable"))
            return 1
        try:
            result = launcher.run_command(*args, **options)
        except launcher.CommandNotStartedError:
            result = launcher.CommandResult("infrastructure-error", None, b"", 0, 0, True)
        except Exception:
            _write_result(_result("infrastructure-error"))
            return 1
        if not result.tree_empty:
            _write_result(_result("cleanup-unconfirmed", result=result))
            return 1
        try:
            # Hold completed cleanup evidence through brief writes by other Forge instances.
            database.execute("PRAGMA busy_timeout = 2000")
            persisted = _transition(database, registry, identity, frame, "running", "drained")
        except Exception:
            persisted = False
        _write_result(_result(result.status if persisted else "cleanup-unconfirmed",
                             result=result, cleanup_persisted=persisted))
        return 0 if persisted else 1
    finally:
        if database is not None:
            database.close()


if __name__ == "__main__":
    sys.exit(main())
