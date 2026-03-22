/**
 * WebGL Terminal Renderer
 *
 * GPU-accelerated renderer using instanced rendering + glyph texture atlas.
 * Replaces per-cell fillText/fillRect with batched draw calls.
 */

import type { FontWeight, ITheme } from '../../interfaces';
import type {
  FontMetrics,
  IRenderable,
  IRenderer,
  IScrollbackProvider,
  RendererOptions,
} from '../../renderer';
import { DEFAULT_THEME } from '../../renderer';
import type { SelectionCoordinates, SelectionManager } from '../../selection-manager';
import type { GhosttyCell } from '../../types';
import { CellFlags } from '../../types';
import { GlyphAtlas } from './glyph-atlas';
import { BG_FRAG, BG_VERT, FG_FRAG, FG_VERT, LINE_FRAG, LINE_VERT } from './shaders';
import { createProgram } from './webgl-utils';

export class WebglRenderer implements IRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private atlas: GlyphAtlas;

  private fontSize: number;
  private fontFamily: string;
  private fontWeight: FontWeight;
  private fontWeightBold: FontWeight;
  private lineHeight: number;
  private letterSpacing: number;
  private cursorStyle: 'block' | 'underline' | 'bar' = 'block';
  private cursorBlink = false;
  private cursorVisible = true;
  private cursorBlinkInterval?: number;
  private theme: Required<ITheme>;
  private devicePixelRatio: number;
  private metrics: FontMetrics;

  private selectionManager?: SelectionManager;
  private hoveredHyperlinkId = 0;
  private hoveredLinkRange: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null = null;

  // GL resources
  private bgProgram: WebGLProgram;
  private fgProgram: WebGLProgram;
  private lineProgram: WebGLProgram;
  private bgVAO: WebGLVertexArrayObject;
  private fgVAO: WebGLVertexArrayObject;
  private lineVAO: WebGLVertexArrayObject;
  private bgBuffer: WebGLBuffer;
  private fgBuffer: WebGLBuffer;
  private lineBuffer: WebGLBuffer;

  // Reusable typed arrays for cell data upload
  private bgData: Float32Array;
  private fgData: Float32Array;
  private lineData: Float32Array;
  private lastCursorPosition = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.fontSize = options.fontSize ?? 15;
    this.fontFamily = options.fontFamily ?? 'monospace';
    this.fontWeight = options.fontWeight ?? 'normal';
    this.fontWeightBold = options.fontWeightBold ?? 'bold';
    this.lineHeight = options.lineHeight ?? 1.0;
    this.letterSpacing = options.letterSpacing ?? 0;
    this.cursorStyle = options.cursorStyle ?? 'block';
    this.cursorBlink = options.cursorBlink ?? false;
    this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;

    this.metrics = this.measureFont();

    // Compile shaders
    this.bgProgram = createProgram(gl, BG_VERT, BG_FRAG);
    this.fgProgram = createProgram(gl, FG_VERT, FG_FRAG);
    this.lineProgram = createProgram(gl, LINE_VERT, LINE_FRAG);

    // Create VAOs and buffers
    this.bgVAO = gl.createVertexArray()!;
    this.fgVAO = gl.createVertexArray()!;
    this.lineVAO = gl.createVertexArray()!;
    this.bgBuffer = gl.createBuffer()!;
    this.fgBuffer = gl.createBuffer()!;
    this.lineBuffer = gl.createBuffer()!;

    this.setupBgVAO();
    this.setupFgVAO();

    // Initialize data arrays (will resize with terminal)
    this.bgData = new Float32Array(0);
    this.fgData = new Float32Array(0);
    this.lineData = new Float32Array(0);

    // Create glyph atlas
    this.atlas = new GlyphAtlas(gl, {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight as string,
      fontWeightBold: this.fontWeightBold as string,
      devicePixelRatio: this.devicePixelRatio,
      cellWidth: this.metrics.width,
      cellHeight: this.metrics.height,
      baseline: this.metrics.baseline,
    });

    // Enable blending for text alpha
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (this.cursorBlink) this.startCursorBlink();
  }

  // ==========================================================================
  // IRenderer implementation
  // ==========================================================================

  render(
    buffer: IRenderable,
    forceAll = false,
    viewportY = 0,
    scrollbackProvider?: IScrollbackProvider,
    _scrollbarOpacity = 1
  ): void {
    const gl = this.gl;
    const cursor = buffer.getCursor();
    const dims = buffer.getDimensions();
    const cols = dims.cols;
    const rows = dims.rows;

    // Resize if needed
    const needsResize =
      this.canvas.width !== cols * this.metrics.width * this.devicePixelRatio ||
      this.canvas.height !== rows * this.metrics.height * this.devicePixelRatio;
    if (needsResize) {
      this.resize(cols, rows);
      forceAll = true;
    }

    if (buffer.needsFullRedraw?.()) forceAll = true;

    // Collect cell data
    const totalCells = cols * rows;
    const bgFloatsPerCell = 5; // gridX, gridY, r, g, b
    const fgFloatsPerCell = 10; // gridX, gridY, r, g, b, atlasU, atlasV, atlasW, atlasH, alpha
    const lineFloatsPerLine = 8; // startX, startY, endX, endY(unused), r, g, b, yOffset

    if (this.bgData.length < totalCells * bgFloatsPerCell) {
      this.bgData = new Float32Array(totalCells * bgFloatsPerCell);
      this.fgData = new Float32Array(totalCells * fgFloatsPerCell);
      this.lineData = new Float32Array(totalCells * lineFloatsPerLine * 2); // 2 lines max per cell
    }

    let bgCount = 0;
    let fgCount = 0;
    let lineCount = 0;
    const scrollbackLength = scrollbackProvider?.getScrollbackLength() ?? 0;

    // Selection state
    const selCoords = this.selectionManager?.hasSelection()
      ? this.selectionManager.getSelectionCoords()
      : null;
    const selBg = this.hexToRgb(this.theme.selectionBackground);
    const selFg = this.hexToRgb(this.theme.selectionForeground);

    for (let y = 0; y < rows; y++) {
      let line: GhosttyCell[] | null = null;
      if (viewportY > 0 && scrollbackProvider) {
        if (y < viewportY) {
          const offset = scrollbackLength - Math.floor(viewportY) + y;
          line = scrollbackProvider.getScrollbackLine(offset);
        } else {
          line = buffer.getLine(y - Math.floor(viewportY));
        }
      } else {
        line = buffer.getLine(y);
      }
      if (!line) continue;

      for (let x = 0; x < line.length; x++) {
        const cell = line[x];
        if (cell.width === 0) continue;

        // Check selection
        const isSelected = selCoords ? this.isInSelection(x, y, selCoords) : false;

        // === Background ===
        let bgR: number, bgG: number, bgB: number;
        if (isSelected) {
          bgR = selBg[0];
          bgG = selBg[1];
          bgB = selBg[2];
        } else if (cell.flags & CellFlags.INVERSE) {
          bgR = cell.fg_r / 255;
          bgG = cell.fg_g / 255;
          bgB = cell.fg_b / 255;
        } else {
          bgR = cell.bg_r / 255;
          bgG = cell.bg_g / 255;
          bgB = cell.bg_b / 255;
        }

        const isDefaultBg =
          !isSelected &&
          cell.bg_r === 0 &&
          cell.bg_g === 0 &&
          cell.bg_b === 0 &&
          !(cell.flags & CellFlags.INVERSE);
        if (!isDefaultBg) {
          const bi = bgCount * bgFloatsPerCell;
          this.bgData[bi] = x;
          this.bgData[bi + 1] = y;
          this.bgData[bi + 2] = bgR;
          this.bgData[bi + 3] = bgG;
          this.bgData[bi + 4] = bgB;
          bgCount++;
        }

        // === Foreground (text) ===
        if (cell.flags & CellFlags.INVISIBLE) continue;

        let fgR: number, fgG: number, fgB: number;
        if (isSelected) {
          fgR = selFg[0];
          fgG = selFg[1];
          fgB = selFg[2];
        } else if (cell.flags & CellFlags.INVERSE) {
          fgR = cell.bg_r / 255;
          fgG = cell.bg_g / 255;
          fgB = cell.bg_b / 255;
        } else {
          fgR = cell.fg_r / 255;
          fgG = cell.fg_g / 255;
          fgB = cell.fg_b / 255;
        }

        const alpha = cell.flags & CellFlags.FAINT ? 0.5 : 1.0;

        // Decorations: underline and strikethrough
        if (cell.flags & CellFlags.UNDERLINE) {
          // Underline color: use dedicated color if available, else fg color
          let ulR = fgR,
            ulG = fgG,
            ulB = fgB;
          const ulColor = buffer.getUnderlineColor?.(y, x);
          if (ulColor) {
            ulR = ulColor.r / 255;
            ulG = ulColor.g / 255;
            ulB = ulColor.b / 255;
          }
          const li = lineCount * lineFloatsPerLine;
          this.lineData[li] = x;
          this.lineData[li + 1] = y;
          this.lineData[li + 2] = x + cell.width;
          this.lineData[li + 3] = y;
          this.lineData[li + 4] = ulR;
          this.lineData[li + 5] = ulG;
          this.lineData[li + 6] = ulB;
          this.lineData[li + 7] = (this.metrics.baseline + 2) / this.metrics.height;
          lineCount++;
        }

        if (cell.flags & CellFlags.STRIKETHROUGH) {
          const li = lineCount * lineFloatsPerLine;
          this.lineData[li] = x;
          this.lineData[li + 1] = y;
          this.lineData[li + 2] = x + cell.width;
          this.lineData[li + 3] = y;
          this.lineData[li + 4] = fgR;
          this.lineData[li + 5] = fgG;
          this.lineData[li + 6] = fgB;
          this.lineData[li + 7] = 0.5; // vertical center
          lineCount++;
        }

        // Hyperlink underlines
        if (cell.hyperlink_id > 0 && cell.hyperlink_id === this.hoveredHyperlinkId) {
          const linkColor = this.hexToRgb('#4A90E2');
          const li = lineCount * lineFloatsPerLine;
          this.lineData[li] = x;
          this.lineData[li + 1] = y;
          this.lineData[li + 2] = x + cell.width;
          this.lineData[li + 3] = y;
          this.lineData[li + 4] = linkColor[0];
          this.lineData[li + 5] = linkColor[1];
          this.lineData[li + 6] = linkColor[2];
          this.lineData[li + 7] = (this.metrics.baseline + 2) / this.metrics.height;
          lineCount++;
        }

        // Regex link underlines
        if (this.hoveredLinkRange) {
          const r = this.hoveredLinkRange;
          const inRange =
            (y === r.startY && x >= r.startX && (y < r.endY || x <= r.endX)) ||
            (y > r.startY && y < r.endY) ||
            (y === r.endY && x <= r.endX && (y > r.startY || x >= r.startX));
          if (inRange) {
            const linkColor = this.hexToRgb('#4A90E2');
            const li = lineCount * lineFloatsPerLine;
            this.lineData[li] = x;
            this.lineData[li + 1] = y;
            this.lineData[li + 2] = x + cell.width;
            this.lineData[li + 3] = y;
            this.lineData[li + 4] = linkColor[0];
            this.lineData[li + 5] = linkColor[1];
            this.lineData[li + 6] = linkColor[2];
            this.lineData[li + 7] = (this.metrics.baseline + 2) / this.metrics.height;
            lineCount++;
          }
        }

        // Skip empty/space for text rendering
        if (cell.codepoint === 0 || cell.codepoint === 32) continue;

        let char: string;
        if (cell.grapheme_len > 0 && buffer.getGraphemeString) {
          char = buffer.getGraphemeString(y, x);
        } else {
          char = String.fromCodePoint(cell.codepoint);
        }

        const bold = !!(cell.flags & CellFlags.BOLD);
        const italic = !!(cell.flags & CellFlags.ITALIC);
        const glyph = this.atlas.getGlyph(char, bold, italic);

        const fi = fgCount * fgFloatsPerCell;
        this.fgData[fi] = x;
        this.fgData[fi + 1] = y;
        this.fgData[fi + 2] = fgR;
        this.fgData[fi + 3] = fgG;
        this.fgData[fi + 4] = fgB;
        this.fgData[fi + 5] = glyph.u;
        this.fgData[fi + 6] = glyph.v;
        this.fgData[fi + 7] = glyph.w;
        this.fgData[fi + 8] = glyph.h;
        this.fgData[fi + 9] = alpha;
        fgCount++;
      }
    }

    // Upload atlas if new glyphs were rasterized
    this.atlas.uploadIfDirty();

    // Clear
    const bgColor = this.hexToRgb(this.theme.background);
    gl.clearColor(bgColor[0], bgColor[1], bgColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Draw backgrounds
    if (bgCount > 0) {
      gl.useProgram(this.bgProgram);
      gl.uniform2f(
        gl.getUniformLocation(this.bgProgram, 'u_cellSize'),
        2.0 / dims.cols,
        2.0 / dims.rows
      );

      gl.bindVertexArray(this.bgVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.bgData.subarray(0, bgCount * bgFloatsPerCell),
        gl.DYNAMIC_DRAW
      );

      // Setup instance attributes
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, bgFloatsPerCell * 4, 0);
      gl.vertexAttribDivisor(0, 1);

      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bgFloatsPerCell * 4, 8);
      gl.vertexAttribDivisor(1, 1);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bgCount);
      gl.bindVertexArray(null);
    }

    // Draw foreground (text)
    if (fgCount > 0) {
      gl.useProgram(this.fgProgram);
      gl.uniform2f(
        gl.getUniformLocation(this.fgProgram, 'u_cellSize'),
        2.0 / dims.cols,
        2.0 / dims.rows
      );
      gl.uniform2f(
        gl.getUniformLocation(this.fgProgram, 'u_atlasSize'),
        this.atlas.getWidth(),
        this.atlas.getHeight()
      );
      // Bind atlas texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas.getTexture());
      gl.uniform1i(gl.getUniformLocation(this.fgProgram, 'u_atlas'), 0);

      gl.bindVertexArray(this.fgVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fgBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.fgData.subarray(0, fgCount * fgFloatsPerCell),
        gl.DYNAMIC_DRAW
      );

      // gridPos (vec2)
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, fgFloatsPerCell * 4, 0);
      gl.vertexAttribDivisor(0, 1);

      // fgColor (vec3)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, fgFloatsPerCell * 4, 8);
      gl.vertexAttribDivisor(1, 1);

      // atlasUV (vec4)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, fgFloatsPerCell * 4, 20);
      gl.vertexAttribDivisor(2, 1);

      // alpha (float)
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, fgFloatsPerCell * 4, 36);
      gl.vertexAttribDivisor(3, 1);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fgCount);
      gl.bindVertexArray(null);
    }

    // Draw decoration lines (underlines, strikethrough, link underlines)
    if (lineCount > 0) {
      gl.useProgram(this.lineProgram);
      gl.uniform2f(
        gl.getUniformLocation(this.lineProgram, 'u_cellSize'),
        2.0 / dims.cols,
        2.0 / dims.rows
      );
      gl.uniform1f(
        gl.getUniformLocation(this.lineProgram, 'u_lineWidth'),
        (1.0 / (dims.rows * this.metrics.height)) * 2.0
      );

      gl.bindVertexArray(this.lineVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.lineData.subarray(0, lineCount * lineFloatsPerLine),
        gl.DYNAMIC_DRAW
      );

      // lineCoords (vec4)
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, lineFloatsPerLine * 4, 0);
      gl.vertexAttribDivisor(0, 1);

      // lineColor (vec3)
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, lineFloatsPerLine * 4, 16);
      gl.vertexAttribDivisor(1, 1);

      // yOffset (float)
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, lineFloatsPerLine * 4, 28);
      gl.vertexAttribDivisor(2, 1);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lineCount);
      gl.bindVertexArray(null);
    }

    // Cursor rendering
    if (viewportY === 0 && cursor.visible && this.cursorVisible) {
      this.renderCursor(cursor.x, cursor.y, dims.cols, dims.rows);
    }

    this.lastCursorPosition = { x: cursor.x, y: cursor.y };
    buffer.clearDirty();
  }

  resize(cols: number, rows: number): void {
    const cssWidth = cols * this.metrics.width;
    const cssHeight = rows * this.metrics.height;
    this.canvas.width = cssWidth * this.devicePixelRatio;
    this.canvas.height = cssHeight * this.devicePixelRatio;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  remeasureFont(): void {
    this.metrics = this.measureFont();
  }

  getMetrics(): FontMetrics {
    return { ...this.metrics };
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  get charWidth(): number {
    return this.metrics.width;
  }

  get charHeight(): number {
    return this.metrics.height;
  }

  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
  }

  setTheme(theme: ITheme): void {
    this.theme = { ...DEFAULT_THEME, ...theme };
  }

  setFontSize(size: number): void {
    this.fontSize = size;
    this.metrics = this.measureFont();
  }

  setFontFamily(family: string): void {
    this.fontFamily = family;
    this.metrics = this.measureFont();
  }

  getCursorStyle(): 'block' | 'underline' | 'bar' {
    return this.cursorStyle;
  }

  setCursorStyle(style: 'block' | 'underline' | 'bar'): void {
    this.cursorStyle = style;
  }

  getCursorBlink(): boolean {
    return this.cursorBlink;
  }

  setCursorBlink(enabled: boolean): void {
    if (enabled && !this.cursorBlink) {
      this.cursorBlink = true;
      this.startCursorBlink();
    } else if (!enabled && this.cursorBlink) {
      this.cursorBlink = false;
      this.stopCursorBlink();
    }
  }

  setHoveredHyperlinkId(id: number): void {
    this.hoveredHyperlinkId = id;
  }

  setHoveredLinkRange(
    range: { startX: number; startY: number; endX: number; endY: number } | null
  ): void {
    this.hoveredLinkRange = range;
  }

  clear(): void {
    const gl = this.gl;
    const bgColor = this.hexToRgb(this.theme.background);
    gl.clearColor(bgColor[0], bgColor[1], bgColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    this.stopCursorBlink();
    const gl = this.gl;
    gl.deleteProgram(this.bgProgram);
    gl.deleteProgram(this.fgProgram);
    gl.deleteProgram(this.lineProgram);
    gl.deleteVertexArray(this.bgVAO);
    gl.deleteVertexArray(this.fgVAO);
    gl.deleteVertexArray(this.lineVAO);
    gl.deleteBuffer(this.bgBuffer);
    gl.deleteBuffer(this.fgBuffer);
    gl.deleteBuffer(this.lineBuffer);
    this.atlas.dispose();
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private measureFont(): FontMetrics {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
    const m = ctx.measureText('M');
    const ascent = m.actualBoundingBoxAscent || this.fontSize * 0.8;
    const descent = m.actualBoundingBoxDescent || this.fontSize * 0.2;
    const baseWidth = Math.ceil(m.width);
    const baseHeight = Math.ceil(ascent + descent) + 2;
    const baseline = Math.ceil(ascent) + 1;
    return {
      width: baseWidth + Math.round(this.letterSpacing),
      height: Math.round(baseHeight * this.lineHeight),
      baseline,
    };
  }

  private setupBgVAO(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.bgVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuffer);
    gl.bindVertexArray(null);
  }

  private setupFgVAO(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fgVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fgBuffer);
    gl.bindVertexArray(null);
  }

  private renderCursor(x: number, y: number, cols: number, rows: number): void {
    const gl = this.gl;
    const cursorColor = this.hexToRgb(this.theme.cursor);
    const cellSizeX = 2.0 / cols;
    const cellSizeY = 2.0 / rows;

    switch (this.cursorStyle) {
      case 'block': {
        // Full cell quad
        const data = new Float32Array([x, y, cursorColor[0], cursorColor[1], cursorColor[2]]);
        gl.useProgram(this.bgProgram);
        gl.uniform2f(gl.getUniformLocation(this.bgProgram, 'u_cellSize'), cellSizeX, cellSizeY);
        gl.bindVertexArray(this.bgVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
        gl.vertexAttribDivisor(1, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
        gl.bindVertexArray(null);
        break;
      }
      case 'underline': {
        // Thin line at bottom of cell
        const lineY = (this.metrics.height - 2) / this.metrics.height;
        const data = new Float32Array([
          x,
          y,
          x + 1,
          y,
          cursorColor[0],
          cursorColor[1],
          cursorColor[2],
          lineY,
        ]);
        gl.useProgram(this.lineProgram);
        gl.uniform2f(gl.getUniformLocation(this.lineProgram, 'u_cellSize'), cellSizeX, cellSizeY);
        gl.uniform1f(
          gl.getUniformLocation(this.lineProgram, 'u_lineWidth'),
          (2.0 / (rows * this.metrics.height)) * 2.0
        );
        gl.bindVertexArray(this.lineVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 16);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
        gl.vertexAttribDivisor(2, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
        gl.bindVertexArray(null);
        break;
      }
      case 'bar': {
        // Thin vertical line at left of cell — rendered as a narrow bg quad
        const barWidthFrac =
          Math.max(2, Math.floor(this.metrics.width * 0.15)) / this.metrics.width;
        const data = new Float32Array([x, y, cursorColor[0], cursorColor[1], cursorColor[2]]);
        // Use bg program but with a narrow cell width
        gl.useProgram(this.bgProgram);
        gl.uniform2f(
          gl.getUniformLocation(this.bgProgram, 'u_cellSize'),
          cellSizeX * barWidthFrac,
          cellSizeY
        );
        gl.bindVertexArray(this.bgVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
        gl.vertexAttribDivisor(1, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
        gl.bindVertexArray(null);
        break;
      }
    }
  }

  private isInSelection(x: number, y: number, coords: SelectionCoordinates): boolean {
    if (y < coords.startRow || y > coords.endRow) return false;
    if (y === coords.startRow && y === coords.endRow) {
      return x >= coords.startCol && x <= coords.endCol;
    }
    if (y === coords.startRow) return x >= coords.startCol;
    if (y === coords.endRow) return x <= coords.endCol;
    return true;
  }

  private hexToRgb(hex: string): [number, number, number] {
    const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
    const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
    const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  private startCursorBlink(): void {
    this.cursorBlinkInterval = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
    }, 530);
  }

  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval !== undefined) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = undefined;
    }
    this.cursorVisible = true;
  }
}
