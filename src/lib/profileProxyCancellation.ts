import type { ProxyOptions } from 'vite';

/** Bridge owned performance requests' pre-header disconnect; Vite owns post-header IO. */
export function configureProfileProxyCancellation(proxy: Parameters<NonNullable<ProxyOptions['configure']>>[0]): void {
  proxy.on('proxyReq', (upstream, request, response) => {
    const owns = (request.method === 'POST' && (request.url === '/api/agent/performance/profile'
      || request.url === '/api/agent/performance/native/collection' || request.url === '/api/agent/performance/native/stop'))
      || (request.method === 'GET' && request.url === '/api/agent/performance/native');
    if (!owns) return;

    let owned = true;
    const retire = () => {
      if (!owned) return;
      owned = false;
      response.removeListener('close', disconnect);
      upstream.removeListener('response', retire);
      upstream.removeListener('error', retire);
      upstream.removeListener('close', retire);
    };
    const disconnect = () => {
      const cancel = owned && !response.writableFinished;
      retire();
      if (cancel) {
        try { upstream.destroy(); }
        catch { /* A disconnected client's cleanup must not throw into the proxy. */ }
      }
    };

    upstream.once('response', retire);
    upstream.once('error', retire);
    upstream.once('close', retire);
    response.once('close', disconnect);
    if (upstream.destroyed) retire();
    else if (response.destroyed) disconnect();
  });
}
