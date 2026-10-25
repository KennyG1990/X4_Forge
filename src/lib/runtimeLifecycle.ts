/** Opt-in log protocol. These are attributed mod reports, not authenticated engine telemetry. */
export interface RuntimeLifecycleEvent {
  v: 1;
  modId: string;
  event: 'save-loaded' | 'game-started' | 'helper-ready' | 'helper-unavailable' | 'reload-invoked' | 'reload-failed';
  boot?: string;
  ts?: number;
  requestId?: string;
  command?: 'refreshmd' | 'reloadui';
}
export function parseRuntimeLifecycle(text: string, modIds: readonly string[]): RuntimeLifecycleEvent | null {
  if (text.length > 2048) return null;
  const match = /(?:^|\s)FORGE-LIFECYCLE (\{[^\r\n]+\})$/.exec(text);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    if (!value || value.v !== 1 || !modIds.includes(value.modId)
      || !['save-loaded', 'game-started', 'helper-ready', 'helper-unavailable', 'reload-invoked', 'reload-failed'].includes(value.event)
      || Object.keys(value).some(k => !['v', 'modId', 'event', 'boot', 'ts', 'requestId', 'command'].includes(k))
      || (value.boot !== undefined && (typeof value.boot !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(value.boot)))
      || (value.ts !== undefined && (!Number.isSafeInteger(value.ts) || value.ts < 0))
      || (value.requestId !== undefined && (typeof value.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(value.requestId)))
      || (value.command !== undefined && !['refreshmd', 'reloadui'].includes(value.command))) return null;
    return value as RuntimeLifecycleEvent;
  } catch { return null; }
}
