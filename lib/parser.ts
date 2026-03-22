/**
 * TerminalParser — xterm.js-compatible IParser implementation.
 *
 * Provides handler registration for custom escape sequence processing.
 * Handlers are called when matching sequences are detected in terminal write data.
 *
 * Note: Since Ghostty's WASM parser doesn't expose hooks, this implementation
 * scans the raw data stream for registered sequences before passing to WASM.
 * This means handlers fire based on raw data pattern matching, not the parser's
 * internal state machine. For most use cases (OSC handlers, simple CSI handlers)
 * this is functionally equivalent.
 */

import type { IDisposable, IFunctionIdentifier, IParser } from './interfaces';

interface HandlerEntry<T> {
  callback: T;
  id: number;
}

let nextHandlerId = 1;

export class TerminalParser implements IParser {
  private csiHandlers = new Map<
    string,
    HandlerEntry<(params: (number | number[])[]) => boolean | Promise<boolean>>[]
  >();
  private dcsHandlers = new Map<
    string,
    HandlerEntry<(data: string, params: (number | number[])[]) => boolean | Promise<boolean>>[]
  >();
  private escHandlers = new Map<string, HandlerEntry<() => boolean | Promise<boolean>>[]>();
  private oscHandlers = new Map<
    number,
    HandlerEntry<(data: string) => boolean | Promise<boolean>>[]
  >();

  registerCsiHandler(
    id: IFunctionIdentifier,
    callback: (params: (number | number[])[]) => boolean | Promise<boolean>
  ): IDisposable {
    const key = this.functionIdToKey(id);
    if (!this.csiHandlers.has(key)) {
      this.csiHandlers.set(key, []);
    }
    const entry = { callback, id: nextHandlerId++ };
    this.csiHandlers.get(key)!.push(entry);
    return {
      dispose: () => {
        const handlers = this.csiHandlers.get(key);
        if (handlers) {
          const idx = handlers.findIndex((h) => h.id === entry.id);
          if (idx !== -1) handlers.splice(idx, 1);
        }
      },
    };
  }

  registerDcsHandler(
    id: IFunctionIdentifier,
    callback: (data: string, params: (number | number[])[]) => boolean | Promise<boolean>
  ): IDisposable {
    const key = this.functionIdToKey(id);
    if (!this.dcsHandlers.has(key)) {
      this.dcsHandlers.set(key, []);
    }
    const entry = { callback, id: nextHandlerId++ };
    this.dcsHandlers.get(key)!.push(entry);
    return {
      dispose: () => {
        const handlers = this.dcsHandlers.get(key);
        if (handlers) {
          const idx = handlers.findIndex((h) => h.id === entry.id);
          if (idx !== -1) handlers.splice(idx, 1);
        }
      },
    };
  }

  registerEscHandler(
    id: IFunctionIdentifier,
    callback: () => boolean | Promise<boolean>
  ): IDisposable {
    const key = this.functionIdToKey(id);
    if (!this.escHandlers.has(key)) {
      this.escHandlers.set(key, []);
    }
    const entry = { callback, id: nextHandlerId++ };
    this.escHandlers.get(key)!.push(entry);
    return {
      dispose: () => {
        const handlers = this.escHandlers.get(key);
        if (handlers) {
          const idx = handlers.findIndex((h) => h.id === entry.id);
          if (idx !== -1) handlers.splice(idx, 1);
        }
      },
    };
  }

  registerOscHandler(
    ident: number,
    callback: (data: string) => boolean | Promise<boolean>
  ): IDisposable {
    if (!this.oscHandlers.has(ident)) {
      this.oscHandlers.set(ident, []);
    }
    const entry = { callback, id: nextHandlerId++ };
    this.oscHandlers.get(ident)!.push(entry);
    return {
      dispose: () => {
        const handlers = this.oscHandlers.get(ident);
        if (handlers) {
          const idx = handlers.findIndex((h) => h.id === entry.id);
          if (idx !== -1) handlers.splice(idx, 1);
        }
      },
    };
  }

  /**
   * Process raw data and fire any matching handlers.
   * Called by Terminal.writeInternal() before passing data to WASM.
   * @returns true if any handler consumed the data
   */
  processData(data: string): boolean {
    let handled = false;

    // Check OSC sequences: \x1b]<number>;<data>\x07 or \x1b]<number>;<data>\x1b\\
    const oscRegex = /\x1b\](\d+);([^\x07\x1b]*?)(?:\x07|\x1b\\)/g;
    let match: RegExpExecArray | null = oscRegex.exec(data);
    while (match !== null) {
      const oscNum = Number.parseInt(match[1], 10);
      const oscData = match[2];
      const handlers = this.oscHandlers.get(oscNum);
      if (handlers) {
        for (const handler of handlers) {
          const result = handler.callback(oscData);
          if (result === true) {
            handled = true;
            break;
          }
        }
      }
      match = oscRegex.exec(data);
    }

    // Check CSI sequences: \x1b[<params><final>
    const csiRegex = /\x1b\[([?>=!]?)([0-9;]*)([a-zA-Z@`])/g;
    match = csiRegex.exec(data);
    while (match !== null) {
      const prefix = match[1] || '';
      const paramStr = match[2];
      const final = match[3];
      const key = `${prefix}${final}`;
      const handlers = this.csiHandlers.get(key);
      if (handlers) {
        const params = paramStr
          ? paramStr.split(';').map((p) => (p ? Number.parseInt(p, 10) : 0))
          : [];
        for (const handler of handlers) {
          const result = handler.callback(params);
          if (result === true) {
            handled = true;
            break;
          }
        }
      }
      match = csiRegex.exec(data);
    }

    return handled;
  }

  private functionIdToKey(id: IFunctionIdentifier): string {
    return `${id.prefix || ''}${id.intermediates || ''}${id.final}`;
  }
}
