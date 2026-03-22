import { FitAddon, Terminal, init } from '../lib/index';

async function main() {
  const container = document.getElementById('terminal-container')!;
  const statusEl = document.getElementById('status')!;

  try {
    await init();
  } catch (e: any) {
    statusEl.textContent = 'WASM load failed';
    statusEl.className = 'status disconnected';
    container.innerHTML = `<pre style="color:#ff4d4f;padding:20px">Failed to load WASM: ${e.message}\n\nMake sure ghostty-vt.wasm is built with the latest patch.</pre>`;
    return;
  }

  const term = new Terminal({
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    cursorBlink: true,
    cursorStyle: 'bar',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
      selectionForeground: '#ffffff',
    },
  });

  try {
    term.open(container);
  } catch (e: any) {
    statusEl.textContent = 'Terminal failed';
    statusEl.className = 'status disconnected';
    container.innerHTML = `<pre style="color:#ff4d4f;padding:20px">Terminal open failed: ${e.message}\n\nThe WASM binary may be outdated. Rebuild with ./scripts/build-wasm.sh</pre>`;
    return;
  }

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  fitAddon.fit();

  // Connect WebSocket
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    statusEl.textContent = 'Connected';
    statusEl.className = 'status connected';
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  };

  ws.onmessage = (event) => {
    const data =
      event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
    term.write(data);
  };

  ws.onclose = () => {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status disconnected';
    term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
  };

  ws.onerror = () => {
    statusEl.textContent = 'Error';
    statusEl.className = 'status disconnected';
  };

  // Terminal -> SSH
  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Handle resize
  term.onResize(({ cols, rows }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  window.addEventListener('resize', () => fitAddon.fit());
  term.focus();
}

main().catch(console.error);
