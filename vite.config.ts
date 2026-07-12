import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// API server port in split-dev mode (Vite serves the UI on 3000 and proxies /api here).
const API_PORT = process.env.API_PORT || '3001';

// Single source of truth for the app version: package.json. Injected below as
// a compile-time constant (__APP_VERSION__) so the header (and anything else)
// always shows the released version — bump package.json once per release.
const APP_VERSION = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version || '0.0.0');
  } catch {
    return '0.0.0';
  }
})();

/**
 * Dev-only: inject the shared studio API token into index.html, mirroring
 * server.ts's injectStudioToken. In split-dev mode Vite (not Express) serves the
 * page, so without this the client never gets window.__STUDIO_API_TOKEN__ and
 * every /api call 401s. Reads the same `.studio-api-token` file the API writes,
 * so both processes agree on the token. `apply: 'serve'` keeps it out of builds.
 */
function studioTokenPlugin(): Plugin {
  return {
    name: 'studio-api-token-inject',
    apply: 'serve',
    transformIndexHtml(html) {
      // In combined fallback mode server.ts already injected the token; don't double up.
      if (html.includes('__STUDIO_API_TOKEN__')) return html;
      try {
        const token = fs
          .readFileSync(path.resolve(__dirname, '.studio-api-token'), 'utf8')
          .trim();
        if (token) {
          return html.replace(
            '</head>',
            `  <script>window.__STUDIO_API_TOKEN__=${JSON.stringify(token)};</script>\n  </head>`,
          );
        }
      } catch {
        // Token file not created yet (the API server writes it on first start).
        // The page will pick it up on the next load once the API is up.
      }
      return html;
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    plugins: [react(), tailwindcss(), studioTokenPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Vite owns the browser-facing port. It does NOT restart when the API
      // (tsx watch on API_PORT) restarts, so backend edits stop reloading the page.
      port: 3000,
      strictPort: true,
      // Forward API calls to the standalone API server. Use 127.0.0.1 (not
      // "localhost") to match the API's IPv4 bind and avoid an IPv6 (::1) miss.
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${API_PORT}`,
          changeOrigin: true,
          // The API (tsx watch) restarts on backend edits — there's a ~2-3s window
          // where 3001 isn't listening yet. Handle ECONNREFUSED gracefully: return a
          // soft 503 the client can retry, instead of dumping proxy-error stack traces.
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              const r = res as any;
              if (r && typeof r.writeHead === 'function' && !r.headersSent) {
                try {
                  r.writeHead(503, {'Content-Type': 'application/json'});
                  r.end(
                    JSON.stringify({error: 'API server is restarting, retry shortly.'}),
                  );
                } catch {
                  /* socket already closed */
                }
              }
            });
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // When watching IS on, ignore files the app/docs/tooling write at runtime so
      // they don't trigger spurious full-page reloads (the app writes the token,
      // snapshots, logs, config, and round-trip temp files into the project tree).
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                // Pure-backend files the client never imports. Vite can't HMR them,
                // so without this it does a FULL PAGE RELOAD on every backend edit —
                // the API server (tsx watch) restarts on its own and the page stays put.
                '**/server.ts',
                '**/install_mod.ts',
                '**/use_agent_api.py',
                // App/doc/tooling writes that shouldn't trigger reloads.
                '**/.studio-api-token',
                // B2s3 workspace persistence: the API writes active/parked state on every
                // commit — without this every canvas edit full-reloads every client.
                '**/.studio-state/**',
                // B26 runtime-writes audit: server runtime data (AI usage meter, harvested
                // schemas, api-registry) — same spurious-reload class as .studio-state.
                '**/data/**',
                '**/.tmp_*',
                '**/*.log',
                '**/.snapshots/**',
                '**/dist/**',
                '**/temp_import/**',
                '**/temp_package_test.json',
                '**/config.json',
                '**/*.md',
              ],
            },
    },
  };
});
