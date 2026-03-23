/**
 * WebSocket-to-SSH bridge using Bun.serve() and fly ssh console.
 *
 * Usage:
 *   FLY_APP=consoletm-sandboxes bun run server.ts
 *   FLY_APP=consoletm-sandboxes FLY_MACHINE=7813495c902de8 bun run server.ts
 */

const FLY_APP = process.env.FLY_APP || 'consoletm-sandboxes';
const FLY_MACHINE = process.env.FLY_MACHINE || '';
const FLY_BIN = process.env.FLY_BIN || '/home/console/.fly/bin/fly';
const PORT = Number(process.env.PORT) || 3000;

console.log(`Starting terminal server for fly app: ${FLY_APP}`);
if (FLY_MACHINE) console.log(`Target machine: ${FLY_MACHINE}`);

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade must be checked first
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const success = server.upgrade(req);
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Serve WASM
    if (url.pathname === '/ghostty-vt.wasm') {
      const file = Bun.file(import.meta.dir + '/../ghostty-vt.wasm');
      return new Response(file, {
        headers: { 'Content-Type': 'application/wasm' },
      });
    }

    // Serve bundled frontend JS
    if (url.pathname === '/frontend.js') {
      const result = await Bun.build({
        entrypoints: [import.meta.dir + '/frontend.ts'],
        format: 'esm',
        target: 'browser',
      });
      if (result.success) {
        return new Response(result.outputs[0], {
          headers: { 'Content-Type': 'application/javascript' },
        });
      }
      return new Response('Build failed', { status: 500 });
    }

    // Serve index
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file(import.meta.dir + '/index.html'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log('WebSocket connected, spawning fly ssh console...');

      const args = ['ssh', 'console', '-a', FLY_APP];
      if (FLY_MACHINE) args.push('-s', FLY_MACHINE);
      args.push('-C', '/bin/bash');

      const proc = Bun.spawn([FLY_BIN, ...args], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      // Store proc reference on ws
      (ws as any)._proc = proc;

      // stdout -> WebSocket
      (async () => {
        const reader = proc.stdout.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (ws.readyState === 1) {
              ws.send(value);
            }
          }
        } catch {
          // stream closed
        }
        ws.close();
      })();

      // stderr -> console
      (async () => {
        const reader = proc.stderr.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            if (text.trim()) console.error('[fly stderr]', text.trim());
          }
        } catch {
          // stream closed
        }
      })();

      proc.exited.then((code) => {
        console.log(`fly ssh exited with code ${code}`);
        if (ws.readyState === 1) ws.close();
      });
    },
    message(ws, message) {
      const proc = (ws as any)._proc;
      if (!proc?.stdin) return;

      // Check for resize messages
      if (typeof message === 'string') {
        try {
          const msg = JSON.parse(message);
          if (msg.type === 'resize') {
            // fly ssh console doesn't support resize via stdin,
            // but we can try sending the SIGWINCH-triggering escape
            return;
          }
        } catch {
          // not JSON, send as terminal data
        }
      }

      proc.stdin.write(message);
    },
    close(ws) {
      console.log('WebSocket closed');
      const proc = (ws as any)._proc;
      if (proc) {
        proc.stdin.end();
        proc.kill();
      }
    },
  },
});

console.log(`Terminal server running at http://localhost:${PORT}`);
