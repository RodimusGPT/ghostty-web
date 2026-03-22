/**
 * WebGL Addon — GPU-accelerated terminal renderer.
 *
 * Usage:
 *   const term = new Terminal();
 *   term.open(container);
 *   try {
 *     const webgl = new WebglAddon();
 *     term.loadAddon(webgl);
 *   } catch (e) {
 *     console.warn('WebGL not available, using Canvas 2D');
 *   }
 */

import type { ITerminalAddon, ITerminalCore } from '../../interfaces';
import type { RendererOptions } from '../../renderer';
import type { Terminal } from '../../terminal';
import { WebglRenderer } from './webgl-renderer';

export class WebglAddon implements ITerminalAddon {
  private renderer?: WebglRenderer;
  private terminal?: Terminal;

  activate(terminal: ITerminalCore): void {
    const term = terminal as Terminal;
    this.terminal = term;

    if (!term.renderer) {
      throw new Error('Terminal must be open before loading WebglAddon');
    }

    // Get options from existing renderer
    const metrics = term.renderer.getMetrics();
    const canvas = term.renderer.getCanvas();

    // Create WebGL canvas (reuse the existing canvas element)
    const options: RendererOptions = {
      fontSize: (term.options as any).fontSize ?? 15,
      fontFamily: (term.options as any).fontFamily ?? 'monospace',
      fontWeight: (term.options as any).fontWeight ?? 'normal',
      fontWeightBold: (term.options as any).fontWeightBold ?? 'bold',
      lineHeight: (term.options as any).lineHeight ?? 1.0,
      letterSpacing: (term.options as any).letterSpacing ?? 0,
      cursorStyle: term.renderer.getCursorStyle(),
      cursorBlink: term.renderer.getCursorBlink(),
      theme: (term.options as any).theme,
      devicePixelRatio: window.devicePixelRatio ?? 1,
    };

    this.renderer = new WebglRenderer(canvas, options);
    term.setRenderer(this.renderer);
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = undefined;
    this.terminal = undefined;
  }
}
