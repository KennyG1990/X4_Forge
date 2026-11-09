import { createHash } from 'node:crypto';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { canonicalJson } from '../lib/actionReceipt';
import type { DeploymentSnapshot } from './deploymentSnapshot';
import type { ProjectCheckApprovalLedger } from './projectCheckApproval';
import { captureProjectCheckSetup, type freezeProjectCheckSetup } from './projectCheckSetup';
import { canonicalSourceKey } from './resourceCoordinator';

interface ProjectCheckBindingInput {
  setupInput: Parameters<typeof captureProjectCheckSetup>[0];
  frozen: ReturnType<typeof freezeProjectCheckSetup>;
  artifact: { modId: string; snapshot: DeploymentSnapshot };
  approvals: ProjectCheckApprovalLedger;
  approvalId: string;
  runId: string;
  systemRoot: string;
  assertLaunchAuthority?: () => void;
}

function bindProjectChecks(input: ProjectCheckBindingInput, checkId?: string) {
  const { frozen, approvals } = input;
  const { modId, snapshot } = input.artifact;
  const setupInput = { ...input.setupInput, interpreterDependencies: [...(input.setupInput.interpreterDependencies ?? [])] };
  const setup = frozen.setup;
  if (process.platform !== 'win32' || !/^[A-Za-z]:[\\/]/.test(input.systemRoot) || /[\u0000-\u001f]/.test(input.systemRoot)) {
    throw new Error('A local Windows system root is required for this project check runner.');
  }
  if (!/^[a-f0-9]{32}$/.test(input.runId)) throw new Error('A server-owned project check run ID is required.');
  if (setup.modId !== modId) throw new Error('The approved project does not match the deployment artifact subject.');
  const manifest = snapshot.manifest.files.find(file => file.path.toLowerCase() === setup.manifest.path);
  if (!manifest || manifest.sha256 !== setup.manifest.sha256 || manifest.size !== setup.manifest.size) {
    throw new Error('The deployment artifact declaration does not match the approved setup.');
  }
  const contentEntry = snapshot.manifest.files.find(file => file.path.toLowerCase() === 'content.xml');
  const content = snapshot.files.find(file => file.path.toLowerCase() === 'content.xml')?.content;
  if (typeof content !== 'string' || !contentEntry || createHash('sha256').update(content).digest('hex') !== contentEntry.sha256) {
    throw new Error('The deployment artifact has no verified content.xml identity.');
  }
  let malformed = false;
  const root = new DOMParser({ onError: () => { malformed = true; } })
    .parseFromString(content.replace(/^\uFEFF/, ''), 'text/xml').documentElement;
  if (malformed || root?.nodeName !== 'content' || root.getAttribute('id')?.toLowerCase() !== modId.toLowerCase()) {
    throw new Error('The deployment artifact content.xml names a different project.');
  }
  const sourceKey = canonicalSourceKey(setup.sourceRoot);
  const selected = checkId === undefined ? setup.checks : setup.checks.filter(check => check.id === checkId);
  if (!selected.length) throw new Error('The project check does not appear in the approved setup.');
  const approval = approvals.requireUsable(input.approvalId, setup);
  function assertReady() {
    const current = captureProjectCheckSetup(setupInput);
    if (current.setupHash !== setup.setupHash) throw new Error('Project check setup changed since binding.');
    if (approvals.requireUsable(approval.id, current).hash !== approval.hash) {
      throw new Error('Project check approval changed since binding.');
    }
    frozen.assertIntegrity();
    snapshot.assertIntegrity();
    input.assertLaunchAuthority?.();
  }
  assertReady();

  return Object.freeze(selected.map(check => {
    const coveredFiles = Object.freeze(check.covers.map(file => {
      const entry = snapshot.manifest.files.find(candidate => candidate.path === file);
      if (!entry) throw new Error(`Declared covered file is absent from the deployment artifact: ${file}`);
      return Object.freeze({ path: entry.path, size: entry.size, sha256: entry.sha256 });
    }));
    const jobId = createHash('sha256').update(canonicalJson([input.runId, check.id])).digest('hex').slice(0, 32);
    const command = Object.freeze({
      runner: 'windows-python-job-v1',
      runId: input.runId,
      checkId: check.id,
      jobName: `Local\\X4ForgeProjectCheck-${jobId}`,
      executable: frozen.interpreterPath,
      args: Object.freeze(['-I', '-S', '-B', path.join(frozen.projectRoot, ...check.script.split('/')), ...check.args]),
      cwd: frozen.projectRoot,
      environment: Object.freeze({ SystemRoot: input.systemRoot, FORGE_ARTIFACT_ROOT: snapshot.payloadRoot }),
      timeoutSeconds: check.timeoutSeconds,
      retainedOutputBytes: 64 * 1024,
      maxOutputBytes: 1024 * 1024,
    });
    const binding = Object.freeze({
      version: 1,
      modId: setup.modId,
      setupHash: setup.setupHash,
      artifactHash: snapshot.manifest.hash,
      approvalId: approval.id,
      approvalHash: approval.hash,
      coveredFiles,
      command,
    });
    const bindingHash = createHash('sha256').update(canonicalJson(binding)).digest('hex');
    const commandHash = createHash('sha256').update(canonicalJson(command)).digest('hex');

    return Object.freeze({ binding, bindingHash, commandHash, sourceKey, assertReady });
  }));
}

/** Prepare one Windows Python invocation from already addressed, internal authority. */
export function bindProjectCheckCommand(input: ProjectCheckBindingInput & { checkId: string }) {
  return bindProjectChecks(input, input.checkId)[0];
}

/** Validate a complete declared set before any command is armed. */
export function bindProjectCheckCommands(input: ProjectCheckBindingInput) {
  return bindProjectChecks(input);
}
