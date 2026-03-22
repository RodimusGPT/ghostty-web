/**
 * Comprehensive Canvas Renderer Tests
 *
 * Tests the renderer by recording Canvas 2D API calls on a mock context.
 * Covers: backgrounds, text, colors, underline styles, strikethrough,
 * cursor styles, selection, wide chars, hyperlinks, font weight, dirty rows.
 */

import { describe, expect, test } from 'bun:test';
import { CanvasRenderer, DEFAULT_THEME, type IRenderable } from './renderer';
import type { GhosttyCell } from './types';
import { CellFlags } from './types';

// ============================================================================
// Test Infrastructure
// ============================================================================

type RecordedOp =
  | { type: 'call'; method: string; args: any[] }
  | { type: 'set'; prop: string; value: any };

function makeCell(overrides: Partial<GhosttyCell> = {}): GhosttyCell {
  return {
    codepoint: 0x41, // 'A'
    fg_r: 204,
    fg_g: 204,
    fg_b: 204,
    bg_r: 0,
    bg_g: 0,
    bg_b: 0,
    flags: 0,
    width: 1,
    hyperlink_id: 0,
    grapheme_len: 0,
    underline_style: 0,
    ...overrides,
  };
}

function createRecordingCanvas() {
  const ops: RecordedOp[] = [];

  const record = (method: string, ...args: any[]) => {
    ops.push({ type: 'call', method, args: [...args] });
  };

  const state: Record<string, any> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '12px monospace',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    lineWidth: 1,
  };

  const ctx = new Proxy(state, {
    set(target, prop, value) {
      target[prop as string] = value;
      ops.push({ type: 'set', prop: prop as string, value });
      return true;
    },
    get(target, prop) {
      const p = prop as string;
      const methods: Record<string, (...args: any[]) => any> = {
        fillRect: (...args: any[]) => record('fillRect', ...args),
        clearRect: (...args: any[]) => record('clearRect', ...args),
        fillText: (...args: any[]) => record('fillText', ...args),
        strokeRect: (...args: any[]) => record('strokeRect', ...args),
        strokeText: (...args: any[]) => record('strokeText', ...args),
        beginPath: () => record('beginPath'),
        closePath: () => record('closePath'),
        moveTo: (...args: any[]) => record('moveTo', ...args),
        lineTo: (...args: any[]) => record('lineTo', ...args),
        stroke: () => record('stroke'),
        fill: () => record('fill'),
        save: () => record('save'),
        restore: () => record('restore'),
        scale: (...args: any[]) => record('scale', ...args),
        rect: (...args: any[]) => record('rect', ...args),
        clip: () => record('clip'),
        setLineDash: (...args: any[]) => record('setLineDash', ...args),
        measureText: () => ({
          width: 8,
          actualBoundingBoxAscent: 12,
          actualBoundingBoxDescent: 3,
        }),
      };
      if (p in methods) return methods[p];
      return target[p];
    },
  });

  const canvas = {
    getContext: () => ctx,
    width: 640,
    height: 408,
    style: { width: '', height: '' },
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    ops,
    getCalls: (method: string) =>
      ops.filter(
        (o): o is RecordedOp & { type: 'call' } => o.type === 'call' && o.method === method
      ),
    getPropSets: (prop: string) =>
      ops.filter((o): o is RecordedOp & { type: 'set' } => o.type === 'set' && o.prop === prop),
    getLastPropBefore: (prop: string, beforeIndex: number) => {
      for (let i = beforeIndex - 1; i >= 0; i--) {
        if (ops[i].type === 'set' && ops[i].prop === prop) return ops[i].value;
      }
      return undefined;
    },
    clear: () => {
      ops.length = 0;
    },
  };
}

// Metrics with default fontSize=15: width=8, height=17, baseline=13
const CELL_W = 8;
const CELL_H = 17;
const BASELINE = 13;

function createMockBuffer(
  lines: GhosttyCell[][],
  opts: {
    cursor?: { x: number; y: number; visible: boolean };
    dirtyRows?: Set<number> | 'all';
    getGraphemeString?: (row: number, col: number) => string;
    getUnderlineColor?: (row: number, col: number) => { r: number; g: number; b: number } | null;
  } = {}
): IRenderable {
  const cols = lines[0]?.length ?? 0;
  const rows = lines.length;
  const dirty = opts.dirtyRows ?? 'all';

  return {
    getLine: (y: number) => (y >= 0 && y < rows ? lines[y] : null),
    getCursor: () => opts.cursor ?? { x: 0, y: 0, visible: false },
    getDimensions: () => ({ cols, rows }),
    isRowDirty: (y: number) => (dirty === 'all' ? true : dirty.has(y)),
    needsFullRedraw: () => false,
    clearDirty: () => {},
    getGraphemeString: opts.getGraphemeString,
    getUnderlineColor: opts.getUnderlineColor,
  };
}

function createRenderer(
  mock: ReturnType<typeof createRecordingCanvas>,
  opts: Record<string, any> = {}
) {
  return new CanvasRenderer(mock.canvas, {
    devicePixelRatio: 1,
    cursorBlink: false,
    ...opts,
  } as any);
}

// ============================================================================
// Tests
// ============================================================================

describe('CanvasRenderer', () => {
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

  describe('Cursor Style API', () => {
    test('getCursorStyle returns initial style', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'bar' });
      expect(r.getCursorStyle()).toBe('bar');
    });

    test('setCursorStyle updates getCursorStyle', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'block' });
      r.setCursorStyle('underline');
      expect(r.getCursorStyle()).toBe('underline');
    });

    test('getCursorBlink returns initial blink state', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorBlink: false });
      expect(r.getCursorBlink()).toBe(false);
    });

    test('setCursorBlink updates getCursorBlink', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorBlink: false });
      r.setCursorBlink(true);
      expect(r.getCursorBlink()).toBe(true);
      r.setCursorBlink(false);
      expect(r.getCursorBlink()).toBe(false);
    });
  });

  // ==========================================================================
  // Background Rendering
  // ==========================================================================

  describe('Background rendering', () => {
    test('default bg cells do not draw extra fillRect', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ bg_r: 0, bg_g: 0, bg_b: 0 })]]);
      r.render(buf, true);

      const fillRects = mock.getCalls('fillRect');
      const cellBgCalls = fillRects.filter((c) => {
        const idx = mock.ops.indexOf(c);
        const style = mock.getLastPropBefore('fillStyle', idx);
        return style === 'rgb(0, 0, 0)';
      });
      expect(cellBgCalls.length).toBe(0);
    });

    test('custom bg cell draws fillRect with rgb color', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ bg_r: 255, bg_g: 0, bg_b: 0 })]]);
      r.render(buf, true);

      const fillStyleSets = mock.getPropSets('fillStyle');
      expect(fillStyleSets.some((s) => s.value === 'rgb(255, 0, 0)')).toBe(true);
    });

    test('inverse flag uses fg colors for background', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ fg_r: 200, fg_g: 100, fg_b: 50, flags: CellFlags.INVERSE })],
      ]);
      r.render(buf, true);

      const fillStyleSets = mock.getPropSets('fillStyle');
      expect(fillStyleSets.some((s) => s.value === 'rgb(200, 100, 50)')).toBe(true);
    });
  });

  // ==========================================================================
  // Text Rendering
  // ==========================================================================

  describe('Text rendering', () => {
    test('renders character with fillText at correct position', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ codepoint: 0x41 })]]);
      r.render(buf, true);

      const textCall = mock.getCalls('fillText').find((c) => c.args[0] === 'A');
      expect(textCall).toBeDefined();
      expect(textCall!.args[1]).toBe(0);
      expect(textCall!.args[2]).toBe(BASELINE);
    });

    test('bold text sets font weight', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.BOLD })]]);
      r.render(buf, true);

      expect(mock.getPropSets('font').some((s) => (s.value as string).includes('bold'))).toBe(true);
    });

    test('italic text sets font style', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.ITALIC })]]);
      r.render(buf, true);

      expect(mock.getPropSets('font').some((s) => (s.value as string).includes('italic'))).toBe(
        true
      );
    });

    test('bold+italic combines both in font string', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.BOLD | CellFlags.ITALIC })]]);
      r.render(buf, true);

      expect(
        mock.getPropSets('font').some((s) => {
          const v = s.value as string;
          return v.includes('italic') && v.includes('bold');
        })
      ).toBe(true);
    });

    test('faint text sets globalAlpha to 0.5 then restores', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.FAINT })]]);
      r.render(buf, true);

      const values = mock.getPropSets('globalAlpha').map((s) => s.value);
      expect(values).toContain(0.5);
      expect(values).toContain(1.0);
      expect(values.indexOf(0.5)).toBeLessThan(values.indexOf(1.0));
    });

    test('invisible text skips fillText', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.INVISIBLE, codepoint: 0x41 })]]);
      r.render(buf, true);

      expect(mock.getCalls('fillText').filter((c) => c.args[0] === 'A').length).toBe(0);
    });

    test('null codepoint renders as space', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ codepoint: 0 })]]);
      r.render(buf, true);

      expect(mock.getCalls('fillText').some((c) => c.args[0] === ' ')).toBe(true);
    });

    test('grapheme cluster uses getGraphemeString', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ codepoint: 0x0915, grapheme_len: 1 })]], {
        getGraphemeString: () => '\u0915\u093f',
      });
      r.render(buf, true);

      expect(mock.getCalls('fillText').some((c) => c.args[0] === '\u0915\u093f')).toBe(true);
    });
  });

  // ==========================================================================
  // Color Rendering
  // ==========================================================================

  describe('Color rendering', () => {
    test('foreground color sets fillStyle from cell rgb', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ fg_r: 100, fg_g: 150, fg_b: 200 })]]);
      r.render(buf, true);

      expect(mock.getPropSets('fillStyle').some((s) => s.value === 'rgb(100, 150, 200)')).toBe(
        true
      );
    });

    test('inverse flag uses bg colors for text', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [
          makeCell({
            fg_r: 100,
            fg_g: 150,
            fg_b: 200,
            bg_r: 50,
            bg_g: 60,
            bg_b: 70,
            flags: CellFlags.INVERSE,
          }),
        ],
      ]);
      r.render(buf, true);

      expect(mock.getPropSets('fillStyle').some((s) => s.value === 'rgb(50, 60, 70)')).toBe(true);
    });
  });

  // ==========================================================================
  // Underline Styles
  // ==========================================================================

  describe('Underline styles', () => {
    test('single underline draws stroke', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ flags: CellFlags.UNDERLINE, underline_style: 1 })],
      ]);
      r.render(buf, true);

      expect(mock.getCalls('stroke').length).toBeGreaterThanOrEqual(1);
      expect(mock.getCalls('moveTo').length).toBeGreaterThanOrEqual(1);
      expect(mock.getCalls('lineTo').length).toBeGreaterThanOrEqual(1);
    });

    test('double underline draws two line pairs', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ flags: CellFlags.UNDERLINE, underline_style: 2 })],
      ]);
      r.render(buf, true);

      // Two moveTo/lineTo pairs for double underline
      const moveTos = mock.getCalls('moveTo').filter((c) => c.args[1] > CELL_H * 0.5);
      expect(moveTos.length).toBeGreaterThanOrEqual(2);
    });

    test('curly underline draws sine wave (many lineTo calls)', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ flags: CellFlags.UNDERLINE, underline_style: 3 })],
      ]);
      r.render(buf, true);

      expect(mock.getCalls('lineTo').length).toBeGreaterThan(3);
    });

    test('dotted underline sets lineDash [1,2]', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ flags: CellFlags.UNDERLINE, underline_style: 4 })],
      ]);
      r.render(buf, true);

      const dashCalls = mock.getCalls('setLineDash');
      expect(dashCalls.some((c) => c.args[0]?.[0] === 1 && c.args[0]?.[1] === 2)).toBe(true);
      expect(dashCalls.some((c) => c.args[0]?.length === 0)).toBe(true); // reset
    });

    test('dashed underline sets lineDash [3,2]', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ flags: CellFlags.UNDERLINE, underline_style: 5 })],
      ]);
      r.render(buf, true);

      const dashCalls = mock.getCalls('setLineDash');
      expect(dashCalls.some((c) => c.args[0]?.[0] === 3 && c.args[0]?.[1] === 2)).toBe(true);
    });

    test('underline color overrides text color', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer(
        [[makeCell({ flags: CellFlags.UNDERLINE, underline_style: 1 })]],
        { getUnderlineColor: () => ({ r: 255, g: 0, b: 0 }) }
      );
      r.render(buf, true);

      expect(mock.getPropSets('strokeStyle').some((s) => s.value === 'rgb(255, 0, 0)')).toBe(true);
    });
  });

  // ==========================================================================
  // Strikethrough
  // ==========================================================================

  describe('Strikethrough', () => {
    test('draws line at vertical center', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.STRIKETHROUGH })]]);
      r.render(buf, true);

      const strikeY = CELL_H / 2;
      expect(mock.getCalls('moveTo').some((c) => Math.abs(c.args[1] - strikeY) < 1)).toBe(true);
      expect(mock.getCalls('stroke').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Cursor Rendering
  // ==========================================================================

  describe('Cursor rendering', () => {
    test('block cursor fills full cell with cursor color', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'block' });
      const buf = createMockBuffer([[makeCell(), makeCell()]], {
        cursor: { x: 1, y: 0, visible: true },
      });
      r.render(buf, true);

      expect(mock.getPropSets('fillStyle').some((s) => s.value === DEFAULT_THEME.cursor)).toBe(
        true
      );
      expect(
        mock
          .getCalls('fillRect')
          .some(
            (c) =>
              c.args[0] === CELL_W &&
              c.args[1] === 0 &&
              c.args[2] === CELL_W &&
              c.args[3] === CELL_H
          )
      ).toBe(true);
    });

    test('block cursor re-renders text with cursorAccent', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'block' });
      const buf = createMockBuffer([[makeCell({ codepoint: 0x42 })]], {
        cursor: { x: 0, y: 0, visible: true },
      });
      r.render(buf, true);

      expect(mock.getCalls('save').length).toBeGreaterThanOrEqual(1);
      expect(mock.getCalls('clip').length).toBeGreaterThanOrEqual(1);
      expect(mock.getCalls('restore').length).toBeGreaterThanOrEqual(1);
      expect(
        mock.getPropSets('fillStyle').some((s) => s.value === DEFAULT_THEME.cursorAccent)
      ).toBe(true);
    });

    test('underline cursor fills thin rect at bottom', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'underline' });
      const buf = createMockBuffer([[makeCell()]], {
        cursor: { x: 0, y: 0, visible: true },
      });
      r.render(buf, true);

      const h = Math.max(2, Math.floor(CELL_H * 0.15));
      expect(
        mock.getCalls('fillRect').some((c) => c.args[1] === CELL_H - h && c.args[3] === h)
      ).toBe(true);
    });

    test('bar cursor fills thin rect at left', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'bar' });
      const buf = createMockBuffer([[makeCell()]], {
        cursor: { x: 0, y: 0, visible: true },
      });
      r.render(buf, true);

      const w = Math.max(2, Math.floor(CELL_W * 0.15));
      expect(
        mock
          .getCalls('fillRect')
          .some((c) => c.args[0] === 0 && c.args[2] === w && c.args[3] === CELL_H)
      ).toBe(true);
    });

    test('invisible cursor draws nothing extra', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'block' });
      const buf = createMockBuffer([[makeCell()]], {
        cursor: { x: 0, y: 0, visible: false },
      });
      r.render(buf, true);

      expect(mock.getCalls('clip').length).toBe(0);
    });

    test('cursor not drawn when scrolled', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { cursorStyle: 'block' });
      const buf = createMockBuffer([[makeCell()]], {
        cursor: { x: 0, y: 0, visible: true },
      });
      r.render(buf, true, 1);

      expect(mock.getCalls('clip').length).toBe(0);
    });
  });

  // ==========================================================================
  // Wide Characters
  // ==========================================================================

  describe('Wide characters', () => {
    test('wide char background spans 2 cell widths', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [makeCell({ width: 2, bg_r: 100, bg_g: 100, bg_b: 100 }), makeCell({ width: 0 })],
      ]);
      r.render(buf, true);

      expect(mock.getCalls('fillRect').some((c) => c.args[2] === CELL_W * 2)).toBe(true);
    });

    test('spacer cells (width=0) are skipped', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [
          makeCell({ width: 2, codepoint: 0x4e16 }),
          makeCell({ width: 0, codepoint: 0 }),
          makeCell({ codepoint: 0x42 }),
        ],
      ]);
      r.render(buf, true);

      const fillTexts = mock.getCalls('fillText');
      expect(fillTexts.length).toBe(2); // wide char + 'B', spacer skipped
    });
  });

  // ==========================================================================
  // Hyperlink Underlines
  // ==========================================================================

  describe('Hyperlink underlines', () => {
    test('non-hovered hyperlink has no blue underline', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell({ hyperlink_id: 5 })]]);
      r.render(buf, true);

      expect(mock.getPropSets('strokeStyle').some((s) => s.value === '#4A90E2')).toBe(false);
    });

    test('hovered hyperlink draws blue underline', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      r.setHoveredHyperlinkId(5);
      const buf = createMockBuffer([[makeCell({ hyperlink_id: 5 })]]);
      r.render(buf, true);

      expect(mock.getPropSets('strokeStyle').some((s) => s.value === '#4A90E2')).toBe(true);
    });

    test('hovered link range draws blue underline', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      r.setHoveredLinkRange({ startX: 0, startY: 0, endX: 2, endY: 0 });
      const buf = createMockBuffer([[makeCell(), makeCell(), makeCell()]]);
      r.render(buf, true);

      expect(mock.getPropSets('strokeStyle').some((s) => s.value === '#4A90E2')).toBe(true);
    });
  });

  // ==========================================================================
  // Font Weight
  // ==========================================================================

  describe('Font weight options', () => {
    test('custom fontWeight applied to normal text', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { fontWeight: '300' });
      const buf = createMockBuffer([[makeCell()]]);
      r.render(buf, true);

      expect(mock.getPropSets('font').some((s) => (s.value as string).includes('300'))).toBe(true);
    });

    test('custom fontWeightBold applied to bold text', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock, { fontWeightBold: '700' });
      const buf = createMockBuffer([[makeCell({ flags: CellFlags.BOLD })]]);
      r.render(buf, true);

      expect(mock.getPropSets('font').some((s) => (s.value as string).includes('700'))).toBe(true);
    });
  });

  // ==========================================================================
  // Dirty Row Optimization
  // ==========================================================================

  describe('Dirty row optimization', () => {
    test('clearDirty is called after render', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      let called = false;
      const buf: IRenderable = {
        ...createMockBuffer([[makeCell()]]),
        clearDirty: () => {
          called = true;
        },
      };
      r.render(buf, true);
      expect(called).toBe(true);
    });

    test('forceAll=true renders all rows', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer(
        [
          [makeCell({ codepoint: 0x41 })],
          [makeCell({ codepoint: 0x42 })],
          [makeCell({ codepoint: 0x43 })],
        ],
        { dirtyRows: new Set() }
      );
      r.render(buf, true);

      const chars = mock.getCalls('fillText').map((c) => c.args[0]);
      expect(chars).toContain('A');
      expect(chars).toContain('B');
      expect(chars).toContain('C');
    });

    test('only dirty rows and adjacent rows render when forceAll=false', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const lines = [
        [makeCell({ codepoint: 0x41 })],
        [makeCell({ codepoint: 0x42 })],
        [makeCell({ codepoint: 0x43 })],
      ];

      // First render forces all to set initial state
      r.render(createMockBuffer(lines), true);
      mock.clear();

      // Second render with only row 1 dirty
      r.render(createMockBuffer(lines, { dirtyRows: new Set([1]) }), false);

      const chars = mock.getCalls('fillText').map((c) => c.args[0]);
      expect(chars).toContain('B'); // dirty row
    });
  });

  // ==========================================================================
  // Two-Pass Architecture
  // ==========================================================================

  describe('Two-pass line rendering', () => {
    test('backgrounds drawn before text on same line', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [
          makeCell({ codepoint: 0x41, bg_r: 100, bg_g: 0, bg_b: 0 }),
          makeCell({ codepoint: 0x42, bg_r: 0, bg_g: 100, bg_b: 0 }),
        ],
      ]);
      r.render(buf, true);

      const bgIndices: number[] = [];
      const textIndices: number[] = [];

      mock.ops.forEach((op, i) => {
        if (op.type === 'call' && op.method === 'fillRect') {
          const style = mock.getLastPropBefore('fillStyle', i);
          if (style?.startsWith('rgb(') && style !== DEFAULT_THEME.background) {
            bgIndices.push(i);
          }
        }
        if (op.type === 'call' && op.method === 'fillText') {
          textIndices.push(i);
        }
      });

      if (bgIndices.length > 0 && textIndices.length > 0) {
        expect(Math.max(...bgIndices)).toBeLessThan(Math.min(...textIndices));
      }
    });

    test('clearRect precedes line background fill', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell()]]);
      r.render(buf, true);

      // Find first clearRect and the fillRect that immediately follows it (line bg)
      const clearRects = mock.getCalls('clearRect');
      expect(clearRects.length).toBeGreaterThan(0);
      const clearIdx = mock.ops.indexOf(clearRects[0]);
      // Next fillRect after the clearRect should be the line background
      const nextFill = mock.ops.findIndex(
        (op, i) => i > clearIdx && op.type === 'call' && op.method === 'fillRect'
      );
      expect(nextFill).toBeGreaterThan(clearIdx);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge cases', () => {
    test('null line does not crash', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf: IRenderable = {
        getLine: () => null,
        getCursor: () => ({ x: 0, y: 0, visible: false }),
        getDimensions: () => ({ cols: 80, rows: 1 }),
        isRowDirty: () => true,
        clearDirty: () => {},
      };
      expect(() => r.render(buf, true)).not.toThrow();
    });

    test('cell with all decoration flags renders without error', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([
        [
          makeCell({
            flags:
              CellFlags.BOLD |
              CellFlags.ITALIC |
              CellFlags.UNDERLINE |
              CellFlags.STRIKETHROUGH |
              CellFlags.FAINT,
            underline_style: 1,
          }),
        ],
      ]);
      expect(() => r.render(buf, true)).not.toThrow();
      expect(mock.getCalls('stroke').length).toBeGreaterThanOrEqual(2);
    });

    test('multiple renders do not crash', () => {
      const mock = createRecordingCanvas();
      const r = createRenderer(mock);
      const buf = createMockBuffer([[makeCell()]]);
      r.render(buf, true);
      r.render(buf, true);
      r.render(buf, false);
      expect(true).toBe(true);
    });
  });
});
