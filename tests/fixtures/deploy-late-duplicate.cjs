// Route-test preload. Introduce a conflict only after the owned target is activated.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ServerResponse } = require('node:http');

const { FORGE_ROUTE_TEST_ROOT: root, FORGE_QA_DUPLICATE_TARGET: target,
  FORGE_QA_DUPLICATE_TRIGGER: trigger, FORGE_QA_DUPLICATE_MOD: modId, X4_DATA_DIR: data } = process.env;
const insideRoot = value => {
  if (!root || !value || !path.isAbsolute(root) || !path.isAbsolute(value)) return false;
  const relative = path.relative(root, value);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
if (process.env.FORGE_ROUTE_TEST_MODE !== '1' || !insideRoot(target) || !insideRoot(trigger) || !insideRoot(data)
  || !/^[a-z0-9_]+$/.test(modId || '')) {
  throw new Error('Late duplicate fixture requires owned scratch target, trigger and receipt roots.');
}

const receipts = path.join(data, 'action-receipts');
const receiptPattern = /^ar_[0-9a-f]{64}\.json$/;
const failureMarker = trigger + '.reply-fault';
const rename = fs.renameSync;
let armed;
fs.renameSync = function (from, to) {
  if (armed && typeof from === 'string' && typeof to === 'string' && path.dirname(from) === receipts
    && path.dirname(to) === receipts && receiptPattern.test(path.basename(to))) {
    const next = JSON.parse(fs.readFileSync(from, 'utf8'));
    const refuseCommit = armed.afterVerified && next.status === 'committed';
    if ((next.status === 'rolled_back' || refuseCommit) && next.authority?.operationId === armed.receiptOperation
      && next.metadata?.modId === modId) {
      const prepared = JSON.parse(fs.readFileSync(to, 'utf8'));
      if (prepared.status !== 'prepared' || prepared.id !== next.id || !prepared.rollback?.reference) {
        throw new Error('Late duplicate receipt fault was not bound to the prepared operation.');
      }
      if (armed.afterVerified) {
        const file = path.join(data, 'recoveries', prepared.rollback.reference, 'record.json');
        const recovery = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (recovery.status !== 'ready' || !recovery.postcheckEvidence?.hash
          || recovery.stagedEvidence?.preparedReceiptHash !== prepared.hash
          || (!refuseCommit && !armed.commitRefused)) {
          throw new Error('The finalization fault requires exact verified recovery and bound terminal writes.');
        }
      }
      if (refuseCommit) armed.commitRefused = true;
      else armed.prepared = { id: prepared.id, hash: prepared.hash, recoveryId: prepared.rollback.reference };
      throw Object.assign(new Error('Isolated terminal receipt publication refusal.'), { code: 'ENOSPC' });
    }
  }
  rename.apply(this, arguments);
  if (to !== target || path.basename(from) !== 'next'
    || path.dirname(path.dirname(from)) !== path.dirname(target)
    || !path.basename(path.dirname(from)).startsWith('.' + path.basename(target) + '.x4forge-next-' + process.pid + '-')
    || !fs.existsSync(trigger)) return;
  const requested = fs.readFileSync(trigger, 'utf8');
  fs.unlinkSync(trigger);
  armed = undefined;
  if (requested !== 'trigger') {
    const afterVerified = requested.startsWith('finalize:');
    const request = afterVerified ? requested.slice('finalize:'.length) : requested;
    if (!/^forge_op_[0-9a-f]{32}$/.test(request)) throw new Error('Invalid deployment receipt fault operation.');
    const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    armed = { request, receiptOperation: 'deploy:' + digest, afterVerified };
    if (afterVerified) return;
  }
  const duplicate = path.join(path.dirname(target), 'introduced-after-activation');
  fs.mkdirSync(duplicate);
  fs.writeFileSync(path.join(duplicate, 'content.xml'), '<content id="' + modId + '"/>');
};

const writeHead = ServerResponse.prototype.writeHead;
ServerResponse.prototype.writeHead = function (status) {
  if (status === 507 && armed?.prepared && !armed.replyFailed && !this.headersSent
    && this.req?.headers['x-forge-operation-id'] === armed.request) {
    armed.replyFailed = true;
    if (armed.afterVerified) writeHead.apply(this, arguments);
    fs.writeFileSync(failureMarker, JSON.stringify({ ...armed.prepared, headersSent: this.headersSent,
      commitRefused: armed.commitRefused === true }), { flag: 'wx' });
    throw new Error('Isolated rollback reply failure.');
  }
  return writeHead.apply(this, arguments);
};
