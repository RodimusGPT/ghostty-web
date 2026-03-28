# ghostty-web

[![NPM Version](https://img.shields.io/npm/v/ghostty-web)](https://npmjs.com/package/ghostty-web) [![NPM Downloads](https://img.shields.io/npm/dw/ghostty-web)](https://npmjs.com/package/ghostty-web) [![npm bundle size](https://img.shields.io/bundlephobia/minzip/ghostty-web)](https://npmjs.com/package/ghostty-web) [![license](https://img.shields.io/github/license/coder/ghostty-web)](./LICENSE)

[Ghostty](https://github.com/ghostty-org/ghostty) for the web with [xterm.js](https://github.com/xtermjs/xterm.js) API compatibility — giving you a proper VT100 implementation in the browser.

- Migrate from xterm by changing your import: `@xterm/xterm` → `ghostty-web`
- WASM-compiled parser from Ghostty—the same code that runs the native app
- Zero runtime dependencies, ~400KB WASM bundle

Originally created for [Mux](https://github.com/coder/mux) (a desktop app for isolated, parallel agentic development), but designed to be used anywhere.

## Try It

- [Live Demo](https://ghostty.ondis.co) on an ephemeral VM (thank you to Greg from [disco.cloud](https://disco.cloud) for hosting).

- On your computer:

  ```bash
  npx @ghostty-web/demo@next
  ```

  This starts a local HTTP server with a real shell on `http://localhost:8080`. Works best on Linux and macOS.

![ghostty](https://github.com/user-attachments/assets/aceee7eb-d57b-4d89-ac3d-ee1885d0187a)

## Comparison with xterm.js

xterm.js is everywhere—VS Code, Hyper, countless web terminals. But it has fundamental issues:

| Issue                                    | xterm.js                                                         | ghostty-web                |
| ---------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| **Complex scripts** (Devanagari, Arabic) | Rendering issues                                                 | ✓ Proper grapheme handling |
| **XTPUSHSGR/XTPOPSGR**                   | [Not supported](https://github.com/xtermjs/xterm.js/issues/2570) | ✓ Full support             |

xterm.js reimplements terminal emulation in JavaScript. Every escape sequence, every edge case, every Unicode quirk—all hand-coded. Ghostty's emulator is the same battle-tested code that runs the native Ghostty app.

## Installation

```bash
npm install ghostty-web
```

## Usage

ghostty-web aims to be API-compatible with the xterm.js API.

```javascript
import { init, Terminal } from 'ghostty-web';

await init();

const term = new Terminal({
  fontSize: 14,
  theme: {
    background: '#1a1b26',
    foreground: '#a9b1d6',
  },
});

term.open(document.getElementById('terminal'));
term.onData((data) => websocket.send(data));
websocket.onmessage = (e) => term.write(e.data);
```

For a comprehensive client <-> server example, refer to the [demo](./demo/index.html#L141).

## How It Works

ghostty-web bridges Ghostty's native terminal emulator to the browser via WebAssembly. The architecture has three layers:

### WASM Layer (`lib/ghostty.ts`, `lib/types.ts`)

The Ghostty VT100 parser is compiled from Zig to `wasm32-freestanding` and loaded at runtime. The `Ghostty` class wraps the raw WASM exports, providing:

- **`GhosttyTerminal`** — a WASM-backed terminal instance with methods like `write()`, `resize()`, `getLine()`, and `getCursor()`. It owns the screen buffer and scrollback in WASM linear memory.
- **`KeyEncoder`** — encodes browser keyboard events into terminal escape sequences using Ghostty's key encoding logic (supporting legacy, xterm, and Kitty protocols).
- **`RenderState`** — a pre-computed snapshot API that returns all render data (cells, cursor, colors, dirty lines) in a single call, minimizing JS↔WASM boundary crossings.

The `init()` function loads the WASM binary once; all `Terminal` instances share the same WASM module but get their own `GhosttyTerminal` handles.

### Terminal Layer (`lib/terminal.ts`, `lib/buffer.ts`)

The `Terminal` class implements the xterm.js `ITerminalCore` interface. When you call `term.open(container)`, it:

1. Creates a `GhosttyTerminal` WASM instance with the configured rows/cols
2. Sets up a `CanvasRenderer` (or `WebglRenderer` via addon) that draws cells to a `<canvas>`
3. Attaches an `InputHandler` that listens for `keydown`/`keyup` events, maps `KeyboardEvent.code` to USB HID key codes, and encodes them through Ghostty's `KeyEncoder`
4. Creates a `SelectionManager` for mouse-based text selection (drag, double-click word select, clipboard integration)
5. Starts a `requestAnimationFrame` render loop that queries dirty lines from WASM and redraws only what changed

Data flows as: **user input → `InputHandler` → `KeyEncoder` (WASM) → `onData` event → your app sends to PTY** and **PTY output → `term.write()` → `GhosttyTerminal.write()` (WASM parses escape sequences) → render loop draws dirty lines**.

The `BufferNamespace` provides xterm.js-compatible read access to the active/normal/alternate screen buffers, exposing per-line and per-cell data including characters, colors, and attributes.

### Rendering (`lib/renderer.ts`, `lib/addons/webgl/`)

Two renderer implementations behind the `IRenderer` interface:

- **`CanvasRenderer`** (default) — Canvas 2D API. Measures font metrics at startup, supports DPI scaling, draws text with full style support (bold, italic, underline, strikethrough, colored underlines), and renders block/underline/bar cursors with optional blink animation.
- **`WebglRenderer`** (addon) — GPU-accelerated via WebGL2. Uses a glyph atlas texture and instanced rendering for high-throughput drawing. Falls back to Canvas 2D if WebGL is unavailable.

Both renderers use dirty-line tracking: `GhosttyTerminal.isRowDirty(y)` returns whether WASM modified a row since the last frame, so only changed rows are redrawn.

### Addons

Following the xterm.js addon pattern (`ITerminalAddon` interface, loaded via `term.loadAddon()`):

| Addon | Description |
| --- | --- |
| `FitAddon` | Auto-resize terminal to fill its container. Uses `ResizeObserver` with debouncing. |
| `WebglAddon` | Swap the Canvas 2D renderer for GPU-accelerated WebGL2. |
| `SearchAddon` | Find text in the buffer (including scrollback) with regex, case-sensitive, and whole-word options. |

### Link Detection (`lib/link-detector.ts`, `lib/providers/`)

The `LinkDetector` coordinates multiple `ILinkProvider` implementations with per-row caching:

- **`OSC8LinkProvider`** — detects explicit hyperlinks set via OSC 8 escape sequences
- **`UrlRegexProvider`** — regex-based URL detection for implicit links

### Escape Sequence Hooks (`lib/parser.ts`)

The `TerminalParser` provides xterm.js-compatible `registerCsiHandler`, `registerOscHandler`, etc. Since Ghostty's WASM parser doesn't expose hooks directly, it pattern-matches the raw data stream before passing it to WASM — functionally equivalent for most use cases.

## Project Structure

```
lib/
├── index.ts              # Public API exports, init() / getGhostty()
├── terminal.ts           # Terminal class (xterm.js-compatible)
├── ghostty.ts            # WASM wrapper (Ghostty, GhosttyTerminal, KeyEncoder)
├── types.ts              # TypeScript types for the WASM API
├── interfaces.ts         # xterm.js-compatible interface definitions
├── renderer.ts           # Canvas 2D renderer
├── buffer.ts             # Buffer API (active/normal/alternate screens)
├── input-handler.ts      # Keyboard → terminal escape sequence encoding
├── selection-manager.ts  # Mouse text selection
├── parser.ts             # Escape sequence handler registration
├── link-detector.ts      # Link detection coordinator
├── event-emitter.ts      # Event system
├── marker.ts             # Buffer position markers and decorations
├── providers/
│   ├── osc8-link-provider.ts
│   └── url-regex-provider.ts
└── addons/
    ├── fit.ts            # FitAddon
    ├── search.ts         # SearchAddon
    └── webgl/            # WebglAddon (renderer, glyph atlas, shaders)
scripts/
└── build-wasm.sh         # Builds ghostty-vt.wasm from Ghostty source
patches/
└── ghostty-wasm-api.patch # Patch applied to Ghostty to expose WASM API
ghostty/                  # Ghostty git submodule
demo/                     # Demo app with local shell server
```

## Development

ghostty-web builds from Ghostty's source with a [patch](./patches/ghostty-wasm-api.patch) to expose additional
functionality.

> Requires Zig 0.15.2+ and Bun.

### Build

```bash
bun run build
```

This runs three steps:
1. **`build:wasm`** — initializes the Ghostty submodule, applies the WASM API patch, compiles with `zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall`, then reverts the patch
2. **`build:lib`** — bundles the TypeScript library with Vite (ES module + UMD, with rolled-up `.d.ts`)
3. **`build:wasm-copy`** — copies `ghostty-vt.wasm` into `dist/`

### Dev Server

```bash
bun run dev        # Vite dev server on port 8000
bun run demo:dev   # Demo app with local shell
```

### Test

```bash
bun test lib/              # Unit tests
bun run test:visual        # Playwright visual regression tests
bun run typecheck          # TypeScript type checking
bun run lint               # Biome linter
bun run fmt                # Prettier format check
```

Mitchell Hashimoto (author of Ghostty) has [been working](https://mitchellh.com/writing/libghostty-is-coming) on `libghostty` which makes this all possible. The patches are very minimal thanks to the work the Ghostty team has done, and we expect them to get smaller.

This library will eventually consume a native Ghostty WASM distribution once available, and will continue to provide an xterm.js compatible API.

At Coder we're big fans of Ghostty, so kudos to that team for all the amazing work.

## License

[MIT](./LICENSE)
