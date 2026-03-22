/**
 * SearchAddon - Find text in the terminal buffer
 *
 * Provides find-next / find-previous functionality across the terminal
 * buffer (including scrollback). Highlights matches via selection.
 *
 * Usage:
 * ```typescript
 * const searchAddon = new SearchAddon();
 * term.loadAddon(searchAddon);
 *
 * searchAddon.findNext('hello');       // find and select next match
 * searchAddon.findPrevious('hello');   // find and select previous match
 * searchAddon.clearDecorations();      // clear search state
 * ```
 */

import type { ITerminalAddon, ITerminalCore } from '../interfaces';
import type { Terminal } from '../terminal';

export interface ISearchOptions {
  /** Use regex for matching (default: false) */
  regex?: boolean;
  /** Case-sensitive search (default: false) */
  caseSensitive?: boolean;
  /** Match whole word only (default: false) */
  wholeWord?: boolean;
  /** Search only in the current viewport (default: false — searches full buffer) */
  incremental?: boolean;
}

interface SearchMatch {
  /** Absolute buffer row (0 = top of scrollback) */
  row: number;
  /** Column where match starts */
  col: number;
  /** Length of the match in characters */
  length: number;
}

export class SearchAddon implements ITerminalAddon {
  private terminal?: Terminal;
  private lastSearchTerm = '';
  private lastSearchOptions: ISearchOptions = {};
  private currentMatchIndex = -1;
  private matches: SearchMatch[] = [];

  activate(terminal: ITerminalCore): void {
    this.terminal = terminal as Terminal;
  }

  dispose(): void {
    this.clearDecorations();
    this.terminal = undefined;
  }

  /**
   * Find the next occurrence of a search term.
   * @returns true if a match was found
   */
  findNext(term: string, options?: ISearchOptions): boolean {
    if (!this.terminal || !term) return false;

    // Re-search if term or options changed
    if (term !== this.lastSearchTerm || !this.optionsMatch(options)) {
      this.search(term, options);
    }

    if (this.matches.length === 0) return false;

    // Advance to next match
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    this.selectMatch(this.matches[this.currentMatchIndex]);
    return true;
  }

  /**
   * Find the previous occurrence of a search term.
   * @returns true if a match was found
   */
  findPrevious(term: string, options?: ISearchOptions): boolean {
    if (!this.terminal || !term) return false;

    // Re-search if term or options changed
    if (term !== this.lastSearchTerm || !this.optionsMatch(options)) {
      this.search(term, options);
    }

    if (this.matches.length === 0) return false;

    // Go to previous match
    this.currentMatchIndex =
      this.currentMatchIndex <= 0 ? this.matches.length - 1 : this.currentMatchIndex - 1;
    this.selectMatch(this.matches[this.currentMatchIndex]);
    return true;
  }

  /**
   * Clear search state and selection.
   */
  clearDecorations(): void {
    this.matches = [];
    this.currentMatchIndex = -1;
    this.lastSearchTerm = '';
    this.lastSearchOptions = {};
    this.terminal?.clearSelection();
  }

  /**
   * Get total number of matches for the current search.
   */
  get matchCount(): number {
    return this.matches.length;
  }

  /**
   * Get the current match index (0-based), or -1 if no match.
   */
  get currentMatch(): number {
    return this.currentMatchIndex;
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private search(term: string, options?: ISearchOptions): void {
    this.lastSearchTerm = term;
    this.lastSearchOptions = options ?? {};
    this.matches = [];
    this.currentMatchIndex = -1;

    const buf = this.terminal!.buffer.active;
    const totalLines = buf.length;

    let searchStr = term;
    let regex: RegExp | null = null;

    if (options?.regex) {
      try {
        regex = new RegExp(searchStr, options.caseSensitive ? 'g' : 'gi');
      } catch {
        return; // invalid regex
      }
    } else if (!options?.caseSensitive) {
      searchStr = searchStr.toLowerCase();
    }

    for (let y = 0; y < totalLines; y++) {
      const line = buf.getLine(y);
      if (!line) continue;

      const lineText = line.translateToString(false);

      if (regex) {
        // Regex search
        regex.lastIndex = 0;
        let match: RegExpExecArray | null = regex.exec(lineText);
        while (match !== null) {
          if (match[0].length === 0) {
            regex.lastIndex++;
          } else if (this.isWholeWord(lineText, match.index, match[0].length, options)) {
            this.matches.push({ row: y, col: match.index, length: match[0].length });
          }
          match = regex.exec(lineText);
        }
      } else {
        // Plain text search
        const haystack = options?.caseSensitive ? lineText : lineText.toLowerCase();
        let startIdx = 0;
        while (startIdx < haystack.length) {
          const idx = haystack.indexOf(searchStr, startIdx);
          if (idx === -1) break;
          if (this.isWholeWord(lineText, idx, searchStr.length, options)) {
            this.matches.push({ row: y, col: idx, length: searchStr.length });
          }
          startIdx = idx + 1;
        }
      }
    }
  }

  private isWholeWord(
    text: string,
    index: number,
    length: number,
    options?: ISearchOptions
  ): boolean {
    if (!options?.wholeWord) return true;

    const before = index > 0 ? text[index - 1] : ' ';
    const after = index + length < text.length ? text[index + length] : ' ';
    return /\W/.test(before) && /\W/.test(after);
  }

  private selectMatch(match: SearchMatch): void {
    const term = this.terminal!;
    const buf = term.buffer.active;

    // Calculate viewport scroll position to make match visible
    const scrollbackLength = buf.length - term.rows;
    if (scrollbackLength > 0 && match.row < scrollbackLength) {
      // Match is in scrollback — scroll to it
      const viewportY = scrollbackLength - match.row;
      term.scrollToLine(match.row);
    } else if (match.row >= scrollbackLength + term.rows) {
      // Shouldn't happen, but safety
      term.scrollToBottom();
    }

    // Select the match
    term.select(match.col, match.row, match.length);
  }

  private optionsMatch(options?: ISearchOptions): boolean {
    const a = this.lastSearchOptions;
    const b = options ?? {};
    return (
      !!a.regex === !!b.regex &&
      !!a.caseSensitive === !!b.caseSensitive &&
      !!a.wholeWord === !!b.wholeWord
    );
  }
}
