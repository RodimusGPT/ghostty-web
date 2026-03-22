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
    const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
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

  // Theme switcher
  const themes: Record<string, any> = {
    dark: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#aeafad',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    },
    light: {
      background: '#ffffff',
      foreground: '#383a42',
      cursor: '#526eff',
      black: '#383a42',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#c18401',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#a0a1a7',
      brightBlack: '#4f525e',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
    monokai: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
    solarized: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
    dracula: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  };

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  themeSelect.addEventListener('change', () => {
    const theme = themes[themeSelect.value];
    if (theme) {
      term.options.theme = theme;
      document.body.style.background = theme.background;
      const header = document.querySelector('header') as HTMLElement;
      if (header) header.style.background = theme.background;
    }
  });

  // Expose for e2e tests
  (window as any).__term = term;
  (window as any).__themes = themes;

  term.focus();
}

main().catch(console.error);
