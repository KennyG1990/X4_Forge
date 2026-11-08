import { existsSync } from 'node:fs';
import path from 'node:path';
import type koffiTypes from 'koffi' with { 'resolution-mode': 'import' };

export function enterWindowsSidecarJob(): void {
  // Both paths are relative to the installed or development extension, never the selected Forge root.
  const staged = path.join(__dirname, '..', 'app', 'node_modules', 'koffi', 'index.cjs');
  const development = path.join(__dirname, '..', 'node_modules', 'koffi', 'index.cjs');
  const koffi = require(existsSync(staged) ? staged : development) as typeof koffiTypes;
  const kernel = koffi.load('kernel32.dll');
  const create = kernel.func('__stdcall', 'CreateJobObjectW', 'void *', ['void *', 'void *']);
  const configure = kernel.func('__stdcall', 'SetInformationJobObject', 'int', ['void *', 'int', 'void *', 'uint32_t']);
  const assign = kernel.func('__stdcall', 'AssignProcessToJobObject', 'int', ['void *', 'void *']);
  const current = kernel.func('__stdcall', 'GetCurrentProcess', 'void *', []);
  const close = kernel.func('__stdcall', 'CloseHandle', 'int', ['void *']);

  const basic = koffi.struct({
    processTime: 'int64_t', jobTime: 'int64_t', flags: 'uint32_t',
    minWorkingSet: 'size_t', maxWorkingSet: 'size_t', activeProcesses: 'uint32_t',
    affinity: 'size_t', priority: 'uint32_t', scheduling: 'uint32_t',
  });
  const io = koffi.array('uint64_t', 6);
  const extended = koffi.struct({
    basic, io, processMemory: 'size_t', jobMemory: 'size_t',
    peakProcess: 'size_t', peakJob: 'size_t',
  });
  const limits = Buffer.alloc(koffi.sizeof(extended));
  const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  const JobObjectExtendedLimitInformation = 9;
  limits.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    koffi.offsetof(extended, 'basic') + koffi.offsetof(basic, 'flags'));

  const job = create(null, null);
  if (!job) throw new Error('CreateJobObjectW failed.');
  try {
    if (!configure(job, JobObjectExtendedLimitInformation, limits, limits.length)) {
      throw new Error('SetInformationJobObject failed.');
    }
    if (!assign(job, current())) throw new Error('AssignProcessToJobObject failed.');
  } catch (error) {
    close(job);
    throw error;
  }
  // Keep the sole non-inheritable handle open. Windows closes it when this
  // supervisor exits, then kills every process it started in the Job.
}
