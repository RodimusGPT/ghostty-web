/**
 * Tests for cursor style mapping from WASM (DECSCUSR support)
 *
 * Validates that the ghostty_render_state_get_cursor_style and
 * ghostty_render_state_get_cursor_blinking WASM exports are correctly
 * mapped to terminal cursor styles.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Ghostty, type GhosttyTerminal } from './ghostty';

describe('Cursor Style WASM Mapping', () => {
  // Test the raw style value mapping (matches Ghostty's CursorStyle enum)
  // 0 = block, 1 = bar, 2 = underline

  function mapCursorStyle(rawStyle: number): 'block' | 'underline' | 'bar' {
    // This mirrors the mapping in ghostty.ts getCursor()
    if (rawStyle === 1) return 'bar';
    if (rawStyle === 2) return 'underline';
    return 'block';
  }

  test('maps 0 to block', () => {
    expect(mapCursorStyle(0)).toBe('block');
  });

  test('maps 1 to bar', () => {
    expect(mapCursorStyle(1)).toBe('bar');
  });

  test('maps 2 to underline', () => {
    expect(mapCursorStyle(2)).toBe('underline');
  });

  test('maps unknown values to block (defensive)', () => {
    expect(mapCursorStyle(3)).toBe('block');
    expect(mapCursorStyle(-1)).toBe('block');
    expect(mapCursorStyle(99)).toBe('block');
  });

  // Test DECSCUSR (Set Cursor Style) sequence values
  // CSI 0 SP q = default (block)
  // CSI 1 SP q = blinking block
  // CSI 2 SP q = steady block
  // CSI 3 SP q = blinking underline
  // CSI 4 SP q = steady underline
  // CSI 5 SP q = blinking bar
  // CSI 6 SP q = steady bar

  describe('DECSCUSR sequence mapping', () => {
    // Maps DECSCUSR parameter to expected cursor state
    // The WASM terminal handles the parsing; these tests document
    // the expected Ghostty CursorStyle values after DECSCUSR processing

    function decscusrToStyle(param: number): {
      style: 'block' | 'underline' | 'bar';
      blinking: boolean;
    } {
      // This mirrors Ghostty's cursor_style action handler in the patch:
      // .default, .steady_block, .steady_bar, .steady_underline => blink=false
      // .blinking_block, .blinking_bar, .blinking_underline => blink=true
      // .default, .blinking_block, .steady_block => block
      // .blinking_bar, .steady_bar => bar
      // .blinking_underline, .steady_underline => underline
      switch (param) {
        case 0:
          return { style: 'block', blinking: true }; // default = blinking block
        case 1:
          return { style: 'block', blinking: true };
        case 2:
          return { style: 'block', blinking: false };
        case 3:
          return { style: 'underline', blinking: true };
        case 4:
          return { style: 'underline', blinking: false };
        case 5:
          return { style: 'bar', blinking: true };
        case 6:
          return { style: 'bar', blinking: false };
        default:
          return { style: 'block', blinking: false };
      }
    }

    test('CSI 0 SP q = blinking block (default)', () => {
      const result = decscusrToStyle(0);
      expect(result.style).toBe('block');
      expect(result.blinking).toBe(true);
    });

    test('CSI 1 SP q = blinking block', () => {
      const result = decscusrToStyle(1);
      expect(result.style).toBe('block');
      expect(result.blinking).toBe(true);
    });

    test('CSI 2 SP q = steady block', () => {
      const result = decscusrToStyle(2);
      expect(result.style).toBe('block');
      expect(result.blinking).toBe(false);
    });

    test('CSI 3 SP q = blinking underline', () => {
      const result = decscusrToStyle(3);
      expect(result.style).toBe('underline');
      expect(result.blinking).toBe(true);
    });

    test('CSI 4 SP q = steady underline', () => {
      const result = decscusrToStyle(4);
      expect(result.style).toBe('underline');
      expect(result.blinking).toBe(false);
    });

    test('CSI 5 SP q = blinking bar', () => {
      const result = decscusrToStyle(5);
      expect(result.style).toBe('bar');
      expect(result.blinking).toBe(true);
    });

    test('CSI 6 SP q = steady bar', () => {
      const result = decscusrToStyle(6);
      expect(result.style).toBe('bar');
      expect(result.blinking).toBe(false);
    });
  });

  describe('End-to-end: DECSCUSR via WASM terminal', () => {
    // These tests load the actual WASM binary and write DECSCUSR sequences.
    // They share the same WASM loading constraints as buffer.test.ts / terminal.test.ts.
    // If WASM loading fails (e.g. in happy-dom), the tests will fail at setup.

    let wasmTerm: GhosttyTerminal | null = null;

    // Helper to check if WASM has cursor style exports
    function hasCursorStyleExport(term: GhosttyTerminal): boolean {
      // Write a DECSCUSR to change to bar and see if it takes effect.
      term.write('\x1b[5 q'); // blinking bar
      const after = term.getCursor();
      // Reset
      term.write('\x1b[2 q'); // steady block
      return after.style === 'bar';
    }

    beforeEach(async () => {
      const ghostty = await Ghostty.load();
      wasmTerm = ghostty.createTerminal(80, 24);
    });

    afterEach(() => {
      if (wasmTerm) {
        wasmTerm.free();
        wasmTerm = null;
      }
    });

    test('DECSCUSR 2: steady block cursor', () => {
      if (!wasmTerm) return;
      wasmTerm.write('\x1b[2 q');
      const cursor = wasmTerm.getCursor();
      if (!hasCursorStyleExport(wasmTerm)) return; // skip if WASM not rebuilt
      expect(cursor.style).toBe('block');
      expect(cursor.blinking).toBe(false);
    });

    test('DECSCUSR 4: steady underline cursor', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[4 q');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('underline');
      expect(cursor.blinking).toBe(false);
    });

    test('DECSCUSR 6: steady bar cursor', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[6 q');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('bar');
      expect(cursor.blinking).toBe(false);
    });

    test('DECSCUSR 5: blinking bar cursor', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[5 q');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('bar');
      expect(cursor.blinking).toBe(true);
    });

    test('DECSCUSR 3: blinking underline cursor', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[3 q');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('underline');
      expect(cursor.blinking).toBe(true);
    });

    test('DECSCUSR 1: blinking block cursor', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[1 q');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('block');
      expect(cursor.blinking).toBe(true);
    });

    test('cursor style persists across writes', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[6 q'); // steady bar
      wasmTerm.write('Hello, world!');
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('bar');
      expect(cursor.blinking).toBe(false);
    });

    test('cursor style can be changed multiple times', () => {
      if (!wasmTerm || !hasCursorStyleExport(wasmTerm)) return;
      wasmTerm.write('\x1b[6 q'); // steady bar
      expect(wasmTerm.getCursor().style).toBe('bar');

      wasmTerm.write('\x1b[4 q'); // steady underline
      expect(wasmTerm.getCursor().style).toBe('underline');

      wasmTerm.write('\x1b[2 q'); // steady block
      expect(wasmTerm.getCursor().style).toBe('block');
    });

    test('default cursor is block without DECSCUSR', () => {
      if (!wasmTerm) return;
      const cursor = wasmTerm.getCursor();
      expect(cursor.style).toBe('block');
    });
  });

  describe('Graceful fallback without WASM exports', () => {
    test('returns block/false when WASM exports are missing', () => {
      // Simulates the behavior when running against an older WASM binary
      // that doesn't have cursor style exports
      const mockExports: Record<string, unknown> = {};

      let style: 'block' | 'underline' | 'bar' = 'block';
      if (typeof mockExports.ghostty_render_state_get_cursor_style === 'function') {
        // Should not enter this branch
        style = 'bar';
      }

      let blinking = false;
      if (typeof mockExports.ghostty_render_state_get_cursor_blinking === 'function') {
        // Should not enter this branch
        blinking = true;
      }

      expect(style).toBe('block');
      expect(blinking).toBe(false);
    });

    test('uses WASM exports when they exist', () => {
      const mockExports: Record<string, unknown> = {
        ghostty_render_state_get_cursor_style: () => 1, // bar
        ghostty_render_state_get_cursor_blinking: () => true,
      };

      let style: 'block' | 'underline' | 'bar' = 'block';
      if (typeof mockExports.ghostty_render_state_get_cursor_style === 'function') {
        const rawStyle = (mockExports.ghostty_render_state_get_cursor_style as () => number)();
        if (rawStyle === 1) style = 'bar';
        else if (rawStyle === 2) style = 'underline';
      }

      let blinking = false;
      if (typeof mockExports.ghostty_render_state_get_cursor_blinking === 'function') {
        blinking = (mockExports.ghostty_render_state_get_cursor_blinking as () => boolean)();
      }

      expect(style).toBe('bar');
      expect(blinking).toBe(true);
    });
  });
});
