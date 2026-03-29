/**
 * Public API for @cmux/ghostty-terminal
 *
 * Main entry point following xterm.js conventions
 */

import { Ghostty } from './ghostty';

// Flag indicating init() has been called (WASM module compiled and cached)
let initialized = false;

/**
 * Initialize the ghostty-web library by compiling the WASM module.
 * Must be called before creating any Terminal instances.
 *
 * The compiled module is cached — each Terminal gets its own WASM instance
 * with isolated linear memory, but compilation only happens once.
 *
 * @example
 * ```typescript
 * import { init, Terminal } from 'ghostty-web';
 *
 * await init();
 * const term = new Terminal();
 * term.open(document.getElementById('terminal'));
 * ```
 */
export async function init(): Promise<void> {
  if (initialized) {
    return; // Already compiled
  }
  // Ghostty.load() compiles and caches the module on first call,
  // then instantiates. We discard this instance — it just primes the cache.
  await Ghostty.load();
  initialized = true;
}

/**
 * Create a new isolated Ghostty instance for a Terminal.
 * Each instance has its own WASM linear memory — no shared mutable state.
 * Throws if init() hasn't been called.
 * @internal
 */
export async function createGhostty(): Promise<Ghostty> {
  if (!initialized) {
    throw new Error(
      'ghostty-web not initialized. Call init() before creating Terminal instances.\n' +
        'Example:\n' +
        '  import { init, Terminal } from "ghostty-web";\n' +
        '  await init();\n' +
        '  const term = new Terminal();\n\n' +
        'For tests, pass a Ghostty instance directly:\n' +
        '  import { Ghostty, Terminal } from "ghostty-web";\n' +
        '  const ghostty = await Ghostty.load();\n' +
        '  const term = new Terminal({ ghostty });'
    );
  }
  return Ghostty.load();
}

/**
 * @deprecated Use createGhostty() instead. This returns a shared instance
 * which can cause cross-terminal data contamination.
 * @internal
 */
export function getGhostty(): never {
  throw new Error(
    'getGhostty() has been removed. Each Terminal now gets its own WASM instance.\n' +
      'Call init() first, then new Terminal() — the Terminal constructor handles instantiation.'
  );
}

// Main Terminal class
export { Terminal } from './terminal';

// xterm.js-compatible interfaces
export type {
  FontWeight,
  ITerminalOptions,
  ITheme,
  ITerminalAddon,
  ITerminalCore,
  IDisposable,
  IEvent,
  IBufferRange,
  IKeyEvent,
  IMarker,
  IDecoration,
  IDecorationOptions,
  IModes,
  IParser,
  IFunctionIdentifier,
  IUnicodeVersionProvider,
} from './interfaces';

// Ghostty WASM components (for advanced usage)
export {
  Ghostty,
  GhosttyTerminal,
  KeyEncoder,
  CellFlags,
  DirtyState,
  KeyEncoderOption,
} from './ghostty';
export { Key, KeyAction, Mods } from './types';
export type { KeyEvent, GhosttyCell, RGB, Cursor, TerminalHandle } from './types';

// Low-level components (for custom integrations)
export { CanvasRenderer } from './renderer';
export type { IRenderer, RendererOptions, FontMetrics, IRenderable } from './renderer';
export { InputHandler } from './input-handler';
export { EventEmitter } from './event-emitter';
export { SelectionManager } from './selection-manager';
export type { SelectionCoordinates } from './selection-manager';

// Addons
export { FitAddon } from './addons/fit';
export type { ITerminalDimensions } from './addons/fit';
export { WebglAddon } from './addons/webgl/webgl';
export { SearchAddon } from './addons/search';
export type { ISearchOptions } from './addons/search';

// Link providers
export { OSC8LinkProvider } from './providers/osc8-link-provider';
export { UrlRegexProvider } from './providers/url-regex-provider';
export { LinkDetector } from './link-detector';
export type { ILink, ILinkProvider, IBufferCellPosition } from './types';
