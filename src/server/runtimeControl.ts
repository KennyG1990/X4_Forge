import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteFile, atomicWriteJson } from '../lib/workspaceState';
import { ActionReceiptStore } from '../lib/actionReceiptStore';
import { redactReceiptMetadata } from '../lib/actionReceipt';
import type { AcceptancePrincipal } from './findingAcceptance';
import type { RuntimeDebuggerAdapterResult } from './runtimeDebuggerAdapter';
import { runtimeCompanionFiles } from './runtimeCompanion';

type Payload = RuntimeDebuggerAdapterResult['payload'];
type Subject = { workspaceId: string; head: string; modId: string; payload: Payload };
type Request = { requestId: string; command: 'refreshmd' | 'reloadui'; expectedModId: string; expectedWorkspaceHash: string; expectedSessionId: string; reason: string };
type Pending = { workspaceId: string; modId: string; requestId: string; command: Request['command']; boot: string; sessionId: string; expires: number; queuedAt: number; receiptId: string; queueHash: string; requestHash: string };
const hash = (v: unknown) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
function refuse(code: string, message: string, status = 409): never { throw Object.assign(new Error(message), { code, status }); }

/** Private prototype: fixed file outbox, no network, shell, game filesystem or keyboard writes. */
export class RuntimeControl {
  constructor(readonly root: string, private receipts: ActionReceiptStore, private enabled: boolean, private now = Date.now) {}
  channel(workspaceId: string) {
    if (!/^ws_[A-Za-z0-9_-]{1,120}$/.test(workspaceId)) refuse('RUNTIME_IDENTITY_INVALID', 'Invalid workspace identity.', 400);
    return path.join(this.root, workspaceId);
  }
  private safeDirectory(dir: string, create = true) {
    const absolute = path.resolve(dir);
    const parsed = path.parse(absolute);
    let current = parsed.root;
    for (const part of path.relative(parsed.root, absolute).split(path.sep)) {
      current = path.join(current, part);
      if (!fs.existsSync(current)) { if (!create) return; fs.mkdirSync(current); }
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) refuse('RUNTIME_STORE_UNSAFE', 'Control storage must use regular owned directories.', 507);
    }
  }
  private pending(): Pending | null {
    this.safeDirectory(this.root, false);
    const file = path.join(this.root, 'pending.json');
    if (!fs.existsSync(file)) return null;
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) refuse('RUNTIME_STORE_UNSAFE', 'Invalid control record.', 507);
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!value || typeof value.expires !== 'number' || typeof value.workspaceId !== 'string' || !/^[a-f0-9]{32}$/.test(value.requestId)) throw new Error('Invalid');
      this.channel(value.workspaceId);
      const receipt = this.receipts.read(value.receiptId);
      if (receipt.status !== 'committed' || receipt.input.requestHash !== value.requestHash || receipt.metadata?.modId !== value.modId
        || value.queueHash !== hash(`${value.requestId}|${value.command}|${value.expires}|${value.boot}\n`)
        || receipt.after?.resources[0]?.hash !== value.queueHash) throw new Error('Record binding invalid');
      return value as Pending;
    } catch { refuse('RUNTIME_STORE_INVALID', 'Control authorization record is unreadable; nothing will be queued.', 507); }
  }
  private helper(subject: Subject) {
    if (subject.payload.logRead?.state !== 'caught-up') return null;
    const events = subject.payload.lifecycle?.events || [];
    const latest = events.filter(e => e.current && ['helper-ready','helper-unavailable'].includes(e.event)).at(-1);
    const seconds = Math.floor(this.now() / 1000);
    return latest?.event === 'helper-ready' && latest.boot && latest.ts && latest.ts >= seconds - 8 && latest.ts <= seconds + 2 ? latest : null;
  }
  status(subject: Subject) {
    const pending = this.pending();
    const owned = pending?.workspaceId === subject.workspaceId && pending.modId === subject.modId ? pending : null;
    const events = subject.payload.lifecycle?.events || [];
    const ack = owned && owned.sessionId === subject.payload.session.sessionId ? [...events].reverse().find(e => e.current && e.requestId === owned.requestId && e.boot === owned.boot && e.command === owned.command && e.ts && e.ts >= owned.queuedAt && e.ts <= owned.expires && ['reload-invoked','reload-failed'].includes(e.event)) : undefined;
    let delivered = false;
    if (owned) {
      const queue = path.join(this.channel(subject.workspaceId),'request.txt');
      try { const stat=fs.lstatSync(queue); delivered=stat.isFile() && !stat.isSymbolicLink() && stat.size<=2048 && hash(fs.readFileSync(queue,'utf8'))===owned.queueHash; } catch { /* no delivery proof */ }
    }
    const status = !owned ? 'none' : subject.payload.logRead?.state !== 'caught-up' ? 'log-not-current'
      : ack?.event === 'reload-invoked' ? 'invocation-observed' : ack?.event === 'reload-failed' ? 'failed'
      : owned.sessionId !== subject.payload.session.sessionId ? 'session-changed'
      : owned.expires < Math.floor(this.now()/1000) ? 'expired' : delivered ? 'queued-awaiting-evidence' : 'delivery-unconfirmed';
    return { enabled: this.enabled, modId: subject.modId, workspaceId: subject.workspaceId, workspaceHash: subject.head,
      sessionId: subject.payload.session.sessionId || null, helperAvailable: !!this.helper(subject),
      logRead: subject.payload.logRead,
      supportedCommands: ['refreshmd','reloadui'], request: owned ? { ...owned, status } : null,
      gameVerified: false, note: 'Invocation is a mod-reported API call, not proof that reload completed or the mod works. No keyboard fallback.' };
  }
  preview(subject: Subject) {
    return { ...this.status(subject), files: runtimeCompanionFiles(subject.modId, this.channel(subject.workspaceId)),
      registration: 'Add ui/forge_runtime.lua to the existing ui.xml menus environment. No files were installed.',
      limits: 'Optional file I/O must be available in game Lua; otherwise companion reports unavailable. Reload affects the running game globally.' };
  }
  request(subject: Subject, input: unknown, principal: AcceptancePrincipal) {
    if (!this.enabled) refuse('RUNTIME_CONTROL_DISABLED', 'Runtime control is enabled only in the private development prototype.', 503);
    if (!principal.deployAuthorized || principal.scope !== 'deploy') refuse('RUNTIME_CONTROL_FORBIDDEN', 'Deploy permission required.', 403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('RUNTIME_INPUT_INVALID', 'Expected an addressed reload request.', 400);
    const b = input as Request;
    const fields = ['requestId','command','expectedModId','expectedWorkspaceHash','expectedSessionId','reason'];
    if (Object.keys(b).some(k => !fields.includes(k)) || fields.some(k => typeof (b as unknown as Record<string, unknown>)[k] !== 'string')
      || !/^[a-f0-9]{32}$/.test(b.requestId) || !['refreshmd','reloadui'].includes(b.command)
      || !b.reason.trim() || b.reason.length > 512 || [...b.reason].some(c => c.charCodeAt(0)<32 || c.charCodeAt(0)===127)
      || redactReceiptMetadata({reason:b.reason})?.reason !== b.reason) refuse('RUNTIME_INPUT_INVALID', 'Exact request ID, command, expected identities and a nonblank reason are required; arbitrary commands/parameters are forbidden.', 400);
    if (b.expectedModId !== subject.modId || b.expectedWorkspaceHash !== subject.head || b.expectedSessionId !== subject.payload.session.sessionId)
      refuse('RUNTIME_IDENTITY_STALE', 'Mod, workspace or save session changed; review fresh status.');
    if (subject.payload.logRead?.state !== 'caught-up')
      refuse('RUNTIME_LOG_NOT_CURRENT', 'Log ingestion is incomplete or unavailable; poll fresh status before requesting a reload. No command sent.', 503);
    if (subject.payload.session.state !== 'current') refuse('RUNTIME_BASELINE_REQUIRED', 'A successful deployment baseline is required.');
    const helper = this.helper(subject);
    if (!helper) refuse('RUNTIME_HELPER_UNAVAILABLE', 'No fresh companion capability report for this mod/session. No command sent.', 503);
    const seconds = Math.floor(this.now()/1000);
    const pending = this.pending();
    if (pending?.requestId === b.requestId && pending.workspaceId === subject.workspaceId) {
      if (pending.requestHash !== hash([b,principal.id])) refuse('RUNTIME_REPLAY_CONFLICT', 'Request ID belongs to different command or actor facts.');
      return this.status(subject);
    }
    if (pending && pending.expires >= seconds) refuse('RUNTIME_RELOAD_BUSY', 'A reload is pending or cooling down; no second command queued.');
    const channel = this.channel(subject.workspaceId);
    this.safeDirectory(channel);
    const queue = path.join(channel,'request.txt');
    if (fs.existsSync(queue) && (!fs.lstatSync(queue).isFile() || fs.lstatSync(queue).isSymbolicLink())) refuse('RUNTIME_STORE_UNSAFE','Unsafe request file.',507);
    const expires = seconds + 15;
    const bytes = `${b.requestId}|${b.command}|${expires}|${helper.boot}\n`;
    const resource = { role: 'data' as const, root: 'runtime-control', relativePath: `${subject.workspaceId}/request.txt`, beforeHash: hash(subject.head) };
    const prepared = this.receipts.prepareWithDisposition({
      actor: {kind:principal.kind,id:principal.id}, client:{channel:principal.kind==='agent'?'api':'studio',id:principal.id,version:'runtime-control-v1'},
      capability:{legacyRoute:'/api/agent/runtime-control/reload',method:'POST',reviewed:true,reviewRef:'dev-runtime-loop-20261024'},
      authority:{scope:'workspace',workspaceId:subject.workspaceId,operationId:`runtime-reload:${subject.workspaceId}:${b.requestId}`,requestScope:'runtime.reload',resources:[resource]},
      effects:{declared:[{id:'authorize-reload',operation:'authorize-runtime-reload',resource,reversible:false}]},
      input:{requestHash:hash([b,principal.id]),beforeHash:hash(subject.head)},
      validation:{validator:'runtime-control-v1',ruleHash:hash('exact-session-helper-two-commands-v1')},
      rollback:{required:false,mode:'none'},metadata:{operation:'authorize-runtime-reload',modId:subject.modId,summary:`head=${subject.head}; session=${b.expectedSessionId}; beforeHash=SHA256(head)`,requestId:b.requestId,mode:b.command,reason:b.reason,actorLabel:principal.label,outcome:'authorized-not-executed'},
    });
    if (!prepared.created) refuse('RUNTIME_REQUEST_ALREADY_AUTHORIZED','This request was already authorized; it will not be delivered again.');
    const receipt = this.receipts.commit(prepared.receipt.id,{validation:{...prepared.receipt.validation,status:'passed',code:'RELOAD_AUTHORIZED_NOT_EXECUTED'},after:{outcome:'applied',resources:[{role:resource.role,root:resource.root,relativePath:resource.relativePath,hash:hash(bytes)}]}});
    const record: Pending={workspaceId:subject.workspaceId,modId:subject.modId,requestId:b.requestId,command:b.command,boot:helper.boot!,sessionId:b.expectedSessionId,expires,queuedAt:seconds,receiptId:receipt.id,queueHash:hash(bytes),requestHash:hash([b,principal.id])};
    // Journal authorization before delivery. Any uncertain delivery is never automatically retried.
    atomicWriteJson(path.join(this.root,'pending.json'),record);
    atomicWriteFile(queue,bytes);
    return {...this.status(subject),authorizationReceipt:receipt};
  }
}
