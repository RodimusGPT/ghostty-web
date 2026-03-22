/**
 * Marker and Decoration implementations for xterm.js compatibility.
 *
 * Markers track buffer positions. Decorations attach DOM elements to markers.
 */

import { EventEmitter } from './event-emitter';
import type { IDecoration, IDecorationOptions, IDisposable, IEvent, IMarker } from './interfaces';

let nextMarkerId = 1;

export class Marker implements IMarker {
  readonly id: number;
  private _line: number;
  private _isDisposed = false;
  private disposeEmitter = new EventEmitter<void>();

  readonly onDispose: IEvent<void> = this.disposeEmitter.event;

  constructor(line: number) {
    this.id = nextMarkerId++;
    this._line = line;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get line(): number {
    return this._line;
  }

  /** Called internally when scrollback trims lines */
  adjustLine(delta: number): void {
    this._line += delta;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
  }
}

export class Decoration implements IDecoration {
  readonly marker: IMarker;
  private _element?: HTMLElement;
  private _isDisposed = false;
  private renderEmitter = new EventEmitter<HTMLElement>();
  private disposeEmitter = new EventEmitter<void>();
  private options: IDecorationOptions;

  readonly onRender: IEvent<HTMLElement> = this.renderEmitter.event;
  readonly onDispose: IEvent<void> = this.disposeEmitter.event;

  constructor(options: IDecorationOptions) {
    this.options = options;
    this.marker = options.marker;

    // Dispose decoration when marker is disposed
    this.marker.onDispose(() => this.dispose());
  }

  get element(): HTMLElement | undefined {
    return this._element;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Called by the terminal to render the decoration when it enters the viewport.
   * @param container The parent element to attach to
   * @param cellWidth Cell width in pixels
   * @param cellHeight Cell height in pixels
   * @param viewportRow The viewport row where the marker is visible
   */
  render(container: HTMLElement, cellWidth: number, cellHeight: number, viewportRow: number): void {
    if (this._isDisposed) return;

    if (!this._element) {
      this._element = document.createElement('div');
      this._element.style.position = 'absolute';
      this._element.style.pointerEvents = 'none';
      container.appendChild(this._element);
      this.renderEmitter.fire(this._element);
    }

    const x = (this.options.x ?? 0) * cellWidth;
    const y = viewportRow * cellHeight;
    const width = (this.options.width ?? 0) * cellWidth || '100%';
    const height = (this.options.height ?? 1) * cellHeight;

    this._element.style.left = `${x}px`;
    this._element.style.top = `${y}px`;
    if (typeof width === 'number') {
      this._element.style.width = `${width}px`;
    } else {
      this._element.style.width = width;
    }
    this._element.style.height = `${height}px`;
    this._element.style.zIndex = this.options.layer === 'top' ? '10' : '0';
  }

  /** Remove the DOM element from the container (when scrolled out of view) */
  hide(): void {
    this._element?.remove();
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this._element?.remove();
    this._element = undefined;
    this.disposeEmitter.fire();
    this.renderEmitter.dispose();
    this.disposeEmitter.dispose();
  }
}
