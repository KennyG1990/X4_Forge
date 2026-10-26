import { SharedSourceCoordinator } from '../src/server/sharedSourceCoordinator';

// Only the parent-owned test directory/key are accepted. Never resolve the default registry.
const [directory, key] = process.argv.slice(2);
if (!directory || !key || !process.send) throw new Error('C06c worker requires explicit directory, key and IPC.');
const coordinator = new SharedSourceCoordinator({ directory, waitMs: 10_000, pollMs: 10 });
const release = new Promise<void>((resolve, reject) => {
  process.on('message', message => {
    if (message === 'release') resolve();
    if (message === 'throw') reject(new Error('injected child handler failure'));
  });
});
try {
  await coordinator.run([key], { actor: 'child-owner', operation: 'held-write', workspaceId: 'ws_child' }, async () => {
    process.send!({ type: 'entered', pid: process.pid });
    await release;
  });
  process.send({ type: 'released' });
} catch (error) {
  process.send({ type: 'error', message: String(error) });
  process.exitCode = 1;
} finally {
  coordinator.close();
  process.disconnect?.();
}
