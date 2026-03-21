/**
 * Tests for Canvas Renderer
 *
 * Note: Most renderer tests are visual and require a browser environment.
 * These tests verify non-visual aspects like theme configuration.
 * Full visual tests are in examples/renderer-demo.html
 */

import { describe, expect, test } from 'bun:test';
import { CanvasRenderer, DEFAULT_THEME } from './renderer';

describe('CanvasRenderer', () => {
  describe('Cursor Style API', () => {
    // Test the cursor style getter/setter round-trip (no DOM needed)
    function createMinimalRenderer(
      opts: { cursorStyle?: 'block' | 'underline' | 'bar'; cursorBlink?: boolean } = {}
    ): CanvasRenderer {
      // Create a renderer with a mock canvas element
      const canvas = {
        getContext: () => ({
          measureText: () => ({
            width: 8,
            actualBoundingBoxAscent: 12,
            actualBoundingBoxDescent: 2,
          }),
          font: '',
          fillStyle: '',
          strokeStyle: '',
          textBaseline: '',
          textAlign: '',
          lineWidth: 0,
          globalAlpha: 1,
          fillRect: () => {},
          clearRect: () => {},
          fillText: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          save: () => {},
          restore: () => {},
          rect: () => {},
          clip: () => {},
          scale: () => {},
        }),
        width: 640,
        height: 480,
        style: { width: '', height: '' },
      } as unknown as HTMLCanvasElement;

      return new CanvasRenderer(canvas, {
        cursorStyle: opts.cursorStyle ?? 'block',
        cursorBlink: opts.cursorBlink ?? false,
      });
    }

    test('getCursorStyle returns initial style', () => {
      const r = createMinimalRenderer({ cursorStyle: 'bar' });
      expect(r.getCursorStyle()).toBe('bar');
    });

    test('setCursorStyle updates getCursorStyle', () => {
      const r = createMinimalRenderer({ cursorStyle: 'block' });
      expect(r.getCursorStyle()).toBe('block');

      r.setCursorStyle('underline');
      expect(r.getCursorStyle()).toBe('underline');

      r.setCursorStyle('bar');
      expect(r.getCursorStyle()).toBe('bar');
    });

    test('getCursorBlink returns initial blink state', () => {
      const r = createMinimalRenderer({ cursorBlink: false });
      expect(r.getCursorBlink()).toBe(false);
    });

    test('setCursorBlink updates getCursorBlink', () => {
      const r = createMinimalRenderer({ cursorBlink: false });
      expect(r.getCursorBlink()).toBe(false);

      r.setCursorBlink(true);
      expect(r.getCursorBlink()).toBe(true);

      r.setCursorBlink(false);
      expect(r.getCursorBlink()).toBe(false);
    });
  });

  describe('Default Theme', () => {
    test('has all required ANSI colors', () => {
      expect(DEFAULT_THEME.black).toBe('#000000');
      expect(DEFAULT_THEME.red).toBe('#cd3131');
      expect(DEFAULT_THEME.green).toBe('#0dbc79');
      expect(DEFAULT_THEME.yellow).toBe('#e5e510');
      expect(DEFAULT_THEME.blue).toBe('#2472c8');
      expect(DEFAULT_THEME.magenta).toBe('#bc3fbc');
      expect(DEFAULT_THEME.cyan).toBe('#11a8cd');
      expect(DEFAULT_THEME.white).toBe('#e5e5e5');
    });

    test('has all bright ANSI colors', () => {
      expect(DEFAULT_THEME.brightBlack).toBe('#666666');
      expect(DEFAULT_THEME.brightRed).toBe('#f14c4c');
      expect(DEFAULT_THEME.brightGreen).toBe('#23d18b');
      expect(DEFAULT_THEME.brightYellow).toBe('#f5f543');
      expect(DEFAULT_THEME.brightBlue).toBe('#3b8eea');
      expect(DEFAULT_THEME.brightMagenta).toBe('#d670d6');
      expect(DEFAULT_THEME.brightCyan).toBe('#29b8db');
      expect(DEFAULT_THEME.brightWhite).toBe('#ffffff');
    });

    test('has foreground and background colors', () => {
      expect(DEFAULT_THEME.foreground).toBe('#d4d4d4');
      expect(DEFAULT_THEME.background).toBe('#1e1e1e');
    });

    test('has cursor colors', () => {
      expect(DEFAULT_THEME.cursor).toBe('#ffffff');
      expect(DEFAULT_THEME.cursorAccent).toBe('#1e1e1e');
    });

    test('has selection colors', () => {
      // Selection colors are now solid (not semi-transparent overlay)
      // Ghostty-style: selection bg = foreground color, selection fg = background color
      expect(DEFAULT_THEME.selectionBackground).toBe('#d4d4d4');
      expect(DEFAULT_THEME.selectionForeground).toBe('#1e1e1e');
    });
  });

  describe('Theme Color Format', () => {
    test('all colors are valid hex strings', () => {
      const hexPattern = /^#[0-9a-f]{6}$/i;

      expect(DEFAULT_THEME.black).toMatch(hexPattern);
      expect(DEFAULT_THEME.foreground).toMatch(hexPattern);
      expect(DEFAULT_THEME.background).toMatch(hexPattern);
      expect(DEFAULT_THEME.cursor).toMatch(hexPattern);
    });
  });
});
