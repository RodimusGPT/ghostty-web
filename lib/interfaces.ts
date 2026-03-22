/**
 * xterm.js-compatible interfaces
 */

import type { Ghostty } from './ghostty';

export type FontWeight =
  | 'normal'
  | 'bold'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';

export interface ITerminalOptions {
  cols?: number; // Default: 80
  rows?: number; // Default: 24
  cursorBlink?: boolean; // Default: false
  cursorStyle?: 'block' | 'underline' | 'bar';
  theme?: ITheme;
  scrollback?: number; // Default: 1000
  fontSize?: number; // Default: 15
  fontFamily?: string; // Default: 'monospace'
  fontWeight?: FontWeight; // Default: 'normal'
  fontWeightBold?: FontWeight; // Default: 'bold'
  lineHeight?: number; // Line height multiplier (default: 1.0)
  letterSpacing?: number; // Extra horizontal pixels between characters (default: 0)
  allowTransparency?: boolean;
  drawBoldTextInBrightColors?: boolean; // Render bold text in bright colors (default: true)
  minimumContrastRatio?: number; // Minimum WCAG contrast ratio 1-21 (default: 1, disabled)
  cursorInactiveStyle?: 'outline' | 'block' | 'bar' | 'underline' | 'none'; // Cursor when unfocused (default: 'outline')
  tabStopWidth?: number; // Tab stop width in columns (default: 8)
  wordSeparator?: string; // Word boundary chars for double-click (default: ' ()[]{}\',:;"')
  altClickMovesCursor?: boolean; // Alt+click moves cursor (default: true)
  rightClickSelectsWord?: boolean; // Right-click selects word (default: false)
  scrollOnUserInput?: boolean; // Auto-scroll to bottom on input (default: true)

  convertEol?: boolean; // Convert \n to \r\n (default: false)
  disableStdin?: boolean; // Disable keyboard input (default: false)

  macOptionIsMeta?: boolean; // Treat Option key as Meta/Alt on macOS (default: false)

  smoothScrollDuration?: number; // Duration in ms for smooth scroll animation (default: 100, 0 = instant)

  // Internal: Ghostty WASM instance (optional, for test isolation)
  // If not provided, uses the module-level instance from init()
  ghostty?: Ghostty;
}

export interface ITheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;

  // ANSI colors (0-15)
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface IDisposable {
  dispose(): void;
}

export type IEvent<T> = (listener: (arg: T) => void) => IDisposable;

export interface ITerminalAddon {
  activate(terminal: ITerminalCore): void;
  dispose(): void;
}

/**
 * A marker tracks a position in the buffer that moves with content.
 * Created via terminal.registerMarker().
 */
export interface IMarker extends IDisposable {
  /** Unique marker ID */
  readonly id: number;
  /** Whether the marker is still valid (not disposed and line not removed from scrollback) */
  readonly isDisposed: boolean;
  /** The buffer line this marker points to (absolute buffer position) */
  readonly line: number;
  /** Fires when the marker is disposed */
  readonly onDispose: IEvent<void>;
}

/**
 * Options for creating a decoration via terminal.registerDecoration().
 */
export interface IDecorationOptions {
  /** The marker to attach the decoration to */
  readonly marker: IMarker;
  /** The anchor position: 'right' | 'left' (default: 'left') */
  readonly anchor?: 'right' | 'left';
  /** X offset from anchor in cells (default: 0) */
  readonly x?: number;
  /** Width of the decoration in cells (default: terminal width) */
  readonly width?: number;
  /** Height of the decoration in cells (default: 1) */
  readonly height?: number;
  /** Layer: 'bottom' renders below text, 'top' above (default: 'bottom') */
  readonly layer?: 'bottom' | 'top';
}

/**
 * A decoration is a DOM element attached to a marker position.
 */
export interface IDecoration extends IDisposable {
  /** The marker this decoration is attached to */
  readonly marker: IMarker;
  /** The DOM element (created when the decoration enters the viewport) */
  readonly element: HTMLElement | undefined;
  /** Whether the decoration is disposed */
  readonly isDisposed: boolean;
  /** Fires when the decoration's element is created and available */
  readonly onRender: IEvent<HTMLElement>;
  /** Fires when the decoration is disposed */
  readonly onDispose: IEvent<void>;
}

/**
 * Terminal mode state (xterm.js compatible).
 * Reflects current DEC/ANSI mode settings.
 */
export interface IModes {
  /** Application cursor keys mode (DECCKM, mode 1) */
  readonly applicationCursorKeysMode: boolean;
  /** Application keypad mode (DECKPAM/DECKPNM, mode 66) */
  readonly applicationKeypadMode: boolean;
  /** Bracketed paste mode (mode 2004) */
  readonly bracketedPasteMode: boolean;
  /** Insert mode (IRM, mode 4) */
  readonly insertMode: boolean;
  /** Mouse tracking mode: 'none' | 'x10' | 'vt200' | 'drag' | 'any' */
  readonly mouseTrackingMode: 'none' | 'x10' | 'vt200' | 'drag' | 'any';
  /** Origin mode (DECOM, mode 6) */
  readonly originMode: boolean;
  /** Reverse wraparound mode (mode 45) */
  readonly reverseWraparoundMode: boolean;
  /** Send focus events mode (mode 1004) */
  readonly sendFocusMode: boolean;
  /** Wraparound mode (DECAWM, mode 7) */
  readonly wraparoundMode: boolean;
}

/**
 * Parser interface for registering custom escape sequence handlers.
 * Enables addons to intercept and handle specific sequences.
 */
export interface IParser {
  /**
   * Register a handler for CSI (Control Sequence Introducer) sequences.
   * @param id The CSI final character and optional prefix (e.g., {final: 'm'})
   * @param callback Called with params when the sequence is parsed. Return true if handled.
   * @returns IDisposable to unregister the handler
   */
  registerCsiHandler(
    id: IFunctionIdentifier,
    callback: (params: (number | number[])[]) => boolean | Promise<boolean>
  ): IDisposable;

  /**
   * Register a handler for DCS (Device Control String) sequences.
   * @param id The DCS identifier
   * @param callback Called with data string. Return true if handled.
   * @returns IDisposable to unregister the handler
   */
  registerDcsHandler(
    id: IFunctionIdentifier,
    callback: (data: string, param: (number | number[])[]) => boolean | Promise<boolean>
  ): IDisposable;

  /**
   * Register a handler for ESC (Escape) sequences.
   * @param id The ESC identifier
   * @param callback Called when the sequence is parsed. Return true if handled.
   * @returns IDisposable to unregister the handler
   */
  registerEscHandler(
    id: IFunctionIdentifier,
    callback: () => boolean | Promise<boolean>
  ): IDisposable;

  /**
   * Register a handler for OSC (Operating System Command) sequences.
   * @param ident The OSC number (e.g., 0 for title)
   * @param callback Called with the OSC data string. Return true if handled.
   * @returns IDisposable to unregister the handler
   */
  registerOscHandler(
    ident: number,
    callback: (data: string) => boolean | Promise<boolean>
  ): IDisposable;
}

/**
 * Identifies a function sequence (CSI, DCS, ESC) by its final character
 * and optional prefix/intermediates.
 */
export interface IFunctionIdentifier {
  /** The prefix character (e.g., '?' for DEC private modes) */
  prefix?: string;
  /** Intermediate characters */
  intermediates?: string;
  /** The final character that identifies the sequence */
  final: string;
}

export interface ITerminalCore {
  cols: number;
  rows: number;
  element?: HTMLElement;
  textarea?: HTMLTextAreaElement;
}

/**
 * Buffer range for selection coordinates
 */
export interface IBufferRange {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Keyboard event with key and DOM event
 */
export interface IKeyEvent {
  key: string;
  domEvent: KeyboardEvent;
}

/**
 * Unicode version provider (xterm.js compatibility)
 */
export interface IUnicodeVersionProvider {
  readonly activeVersion: string;
}

// ============================================================================
// Buffer API Interfaces (xterm.js compatibility)
// ============================================================================

/**
 * Top-level buffer API namespace
 * Provides access to active, normal, and alternate screen buffers
 */
export interface IBufferNamespace {
  /** The currently active buffer (normal or alternate) */
  readonly active: IBuffer;
  /** The normal buffer (primary screen) */
  readonly normal: IBuffer;
  /** The alternate buffer (used by full-screen apps like vim) */
  readonly alternate: IBuffer;

  /** Event fired when buffer changes (normal ↔ alternate) */
  readonly onBufferChange: IEvent<IBuffer>;
}

/**
 * A terminal buffer (normal or alternate screen)
 */
export interface IBuffer {
  /** Buffer type: 'normal' or 'alternate' */
  readonly type: 'normal' | 'alternate';
  /** Cursor X position (0-indexed) */
  readonly cursorX: number;
  /** Cursor Y position (0-indexed, relative to viewport) */
  readonly cursorY: number;
  /** Viewport Y position (scroll offset, 0 = bottom of scrollback) */
  readonly viewportY: number;
  /** Base Y position (always 0 for normal buffer, may vary for alternate) */
  readonly baseY: number;
  /** Total buffer length (rows + scrollback for normal, just rows for alternate) */
  readonly length: number;

  /**
   * Get a line from the buffer
   * @param y Line index (0 = top of scrollback for normal buffer)
   * @returns Line object or undefined if out of bounds
   */
  getLine(y: number): IBufferLine | undefined;

  /**
   * Get the null cell (used for empty/uninitialized cells)
   */
  getNullCell(): IBufferCell;
}

/**
 * A single line in the buffer
 */
export interface IBufferLine {
  /** Length of the line (in columns) */
  readonly length: number;
  /** Whether this line wraps to the next line */
  readonly isWrapped: boolean;

  /**
   * Get a cell from this line
   * @param x Column index (0-indexed)
   * @returns Cell object or undefined if out of bounds
   */
  getCell(x: number): IBufferCell | undefined;

  /**
   * Translate the line to a string
   * @param trimRight Whether to trim trailing whitespace (default: false)
   * @param startColumn Start column (default: 0)
   * @param endColumn End column (default: length)
   * @returns String representation of the line
   */
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

/**
 * A single cell in the buffer
 */
export interface IBufferCell {
  /** Character(s) in this cell (may be empty, single char, or emoji) */
  getChars(): string;
  /** Unicode codepoint (0 for null cell) */
  getCode(): number;
  /** Character width (1 = normal, 2 = wide/emoji, 0 = combining) */
  getWidth(): number;

  /** Foreground color index (for palette colors) or -1 for RGB */
  getFgColorMode(): number;
  /** Background color index (for palette colors) or -1 for RGB */
  getBgColorMode(): number;
  /** Foreground RGB color (or 0 for default) */
  getFgColor(): number;
  /** Background RGB color (or 0 for default) */
  getBgColor(): number;

  /** Whether cell has bold style */
  isBold(): number;
  /** Whether cell has italic style */
  isItalic(): number;
  /** Whether cell has underline style */
  isUnderline(): number;
  /** Whether cell has strikethrough style */
  isStrikethrough(): number;
  /** Whether cell has blink style */
  isBlink(): number;
  /** Whether cell has inverse video style */
  isInverse(): number;
  /** Whether cell has invisible style */
  isInvisible(): number;
  /** Whether cell has faint/dim style */
  isFaint(): number;

  // Link detection support
  /** Get hyperlink ID for this cell (0 = no link) */
  getHyperlinkId(): number;
  /** Get the Unicode codepoint for this cell */
  getCodepoint(): number;
  /** Whether cell has dim/faint attribute (boolean version) */
  isDim(): boolean;
  /** Whether cell has overline style */
  isOverline(): number;
  /** Whether foreground is RGB color */
  isFgRGB(): boolean;
  /** Whether background is RGB color */
  isBgRGB(): boolean;
  /** Whether foreground is palette color */
  isFgPalette(): boolean;
  /** Whether background is palette color */
  isBgPalette(): boolean;
  /** Whether foreground is default color */
  isFgDefault(): boolean;
  /** Whether background is default color */
  isBgDefault(): boolean;
  /** Whether all attributes are default */
  isAttributeDefault(): boolean;
}
