/**
 * SearchAddon unit tests
 */

import { describe, expect, test } from 'bun:test';
import { SearchAddon } from './search';

// Mock terminal with buffer lines
function createMockTerminal(lines: string[]) {
  const bufferLines = lines.map((text) => ({
    length: text.length,
    isWrapped: false,
    getCell: () => undefined,
    translateToString: () => text,
  }));

  return {
    cols: 80,
    rows: lines.length,
    element: undefined,
    textarea: undefined,
    buffer: {
      active: {
        type: 'normal' as const,
        cursorX: 0,
        cursorY: 0,
        viewportY: 0,
        baseY: 0,
        length: lines.length,
        getLine: (y: number) => (y >= 0 && y < bufferLines.length ? bufferLines[y] : undefined),
        getNullCell: () => ({ getChars: () => '', getCode: () => 0, getWidth: () => 1 }),
      },
      normal: {} as any,
      alternate: {} as any,
      onBufferChange: (() => ({ dispose: () => {} })) as any,
    },
    options: {},
    select: () => {},
    clearSelection: () => {},
    scrollToLine: () => {},
    scrollToBottom: () => {},
  };
}

describe('SearchAddon', () => {
  test('findNext returns false for empty search', () => {
    const term = createMockTerminal(['hello world']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('')).toBe(false);
  });

  test('findNext finds a match', () => {
    const term = createMockTerminal(['hello world', 'foo bar']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('hello')).toBe(true);
    expect(search.matchCount).toBe(1);
    expect(search.currentMatch).toBe(0);
  });

  test('findNext finds multiple matches', () => {
    const term = createMockTerminal(['abc abc', 'abc xyz']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('abc')).toBe(true);
    expect(search.matchCount).toBe(3);
    expect(search.currentMatch).toBe(0);

    expect(search.findNext('abc')).toBe(true);
    expect(search.currentMatch).toBe(1);

    expect(search.findNext('abc')).toBe(true);
    expect(search.currentMatch).toBe(2);

    // Wraps around
    expect(search.findNext('abc')).toBe(true);
    expect(search.currentMatch).toBe(0);
  });

  test('findPrevious goes backwards', () => {
    const term = createMockTerminal(['abc def', 'abc ghi']);
    const search = new SearchAddon();
    search.activate(term as any);

    // First call starts from end
    expect(search.findPrevious('abc')).toBe(true);
    expect(search.currentMatch).toBe(1); // last match

    expect(search.findPrevious('abc')).toBe(true);
    expect(search.currentMatch).toBe(0);

    // Wraps around
    expect(search.findPrevious('abc')).toBe(true);
    expect(search.currentMatch).toBe(1);
  });

  test('case-insensitive search by default', () => {
    const term = createMockTerminal(['Hello HELLO hello']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('hello')).toBe(true);
    expect(search.matchCount).toBe(3);
  });

  test('case-sensitive search when enabled', () => {
    const term = createMockTerminal(['Hello HELLO hello']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('Hello', { caseSensitive: true })).toBe(true);
    expect(search.matchCount).toBe(1);
  });

  test('regex search', () => {
    const term = createMockTerminal(['abc 123 def 456']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('\\d+', { regex: true })).toBe(true);
    expect(search.matchCount).toBe(2);
  });

  test('whole word search', () => {
    const term = createMockTerminal(['cat catch concatenate']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('cat', { wholeWord: true })).toBe(true);
    expect(search.matchCount).toBe(1);
  });

  test('no match returns false', () => {
    const term = createMockTerminal(['hello world']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('xyz')).toBe(false);
    expect(search.matchCount).toBe(0);
  });

  test('clearDecorations resets state', () => {
    const term = createMockTerminal(['hello world']);
    const search = new SearchAddon();
    search.activate(term as any);

    search.findNext('hello');
    expect(search.matchCount).toBe(1);

    search.clearDecorations();
    expect(search.matchCount).toBe(0);
    expect(search.currentMatch).toBe(-1);
  });

  test('select is called with match coordinates', () => {
    let selectedCol = -1;
    let selectedRow = -1;
    let selectedLen = -1;

    const term = createMockTerminal(['foo hello bar']);
    term.select = (col: number, row: number, length: number) => {
      selectedCol = col;
      selectedRow = row;
      selectedLen = length;
    };

    const search = new SearchAddon();
    search.activate(term as any);

    search.findNext('hello');
    expect(selectedCol).toBe(4);
    expect(selectedRow).toBe(0);
    expect(selectedLen).toBe(5);
  });

  test('search across multiple lines', () => {
    const term = createMockTerminal([
      'line 1: first match here',
      'line 2: nothing',
      'line 3: second match here',
    ]);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('match')).toBe(true);
    expect(search.matchCount).toBe(2);
  });

  test('invalid regex does not crash', () => {
    const term = createMockTerminal(['hello world']);
    const search = new SearchAddon();
    search.activate(term as any);

    expect(search.findNext('[invalid', { regex: true })).toBe(false);
  });

  test('dispose clears state', () => {
    const term = createMockTerminal(['hello']);
    const search = new SearchAddon();
    search.activate(term as any);
    search.findNext('hello');

    search.dispose();
    expect(search.matchCount).toBe(0);
  });
});
