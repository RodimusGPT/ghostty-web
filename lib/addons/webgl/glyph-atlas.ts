/**
 * Glyph Atlas — rasterizes glyphs into a WebGL texture via offscreen Canvas 2D.
 *
 * Uses shelf-packing: glyphs are placed left-to-right in rows. When a row fills,
 * a new row starts below. The atlas grows if needed (up to MAX_SIZE).
 */

export interface GlyphInfo {
  u: number; // texture X in pixels
  v: number; // texture Y in pixels
  w: number; // glyph width in pixels
  h: number; // glyph height in pixels
  offsetX: number; // horizontal offset from cell origin
  offsetY: number; // vertical offset from cell origin (baseline-relative)
}

export class GlyphAtlas {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture;
  private cache = new Map<string, GlyphInfo>();

  private atlasWidth: number;
  private atlasHeight: number;
  private shelfX = 0; // current X position in current shelf
  private shelfY = 0; // Y position of current shelf top
  private shelfHeight = 0; // height of tallest glyph in current shelf

  private fontSize: number;
  private fontFamily: string;
  private fontWeight: string;
  private fontWeightBold: string;
  private devicePixelRatio: number;
  private cellWidth: number;
  private cellHeight: number;
  private baseline: number;
  private dirty = false;

  private static readonly INITIAL_SIZE = 1024;
  private static readonly MAX_SIZE = 4096;
  private static readonly PADDING = 2; // pixels between glyphs

  constructor(
    gl: WebGL2RenderingContext,
    opts: {
      fontSize: number;
      fontFamily: string;
      fontWeight: string;
      fontWeightBold: string;
      devicePixelRatio: number;
      cellWidth: number;
      cellHeight: number;
      baseline: number;
    }
  ) {
    this.gl = gl;
    this.fontSize = opts.fontSize;
    this.fontFamily = opts.fontFamily;
    this.fontWeight = opts.fontWeight;
    this.fontWeightBold = opts.fontWeightBold;
    this.devicePixelRatio = opts.devicePixelRatio;
    this.cellWidth = opts.cellWidth;
    this.cellHeight = opts.cellHeight;
    this.baseline = opts.baseline;

    this.atlasWidth = GlyphAtlas.INITIAL_SIZE;
    this.atlasHeight = GlyphAtlas.INITIAL_SIZE;

    // Create offscreen canvas for glyph rasterization
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(this.atlasWidth, this.atlasHeight);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.atlasWidth;
      this.canvas.height = this.atlasHeight;
    }
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    // Create GPU texture
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.atlasWidth,
      this.atlasHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
  }

  /**
   * Get glyph info, rasterizing on demand if not cached.
   * @param char The character string to render
   * @param bold Whether to use bold weight
   * @param italic Whether to use italic style
   * @returns GlyphInfo with texture coordinates
   */
  getGlyph(char: string, bold: boolean, italic: boolean): GlyphInfo {
    const key = `${char}|${bold ? 'b' : ''}${italic ? 'i' : ''}`;
    let info = this.cache.get(key);
    if (info) return info;

    info = this.rasterizeGlyph(char, bold, italic);
    this.cache.set(key, info);
    this.dirty = true;
    return info;
  }

  /**
   * Upload dirty region to GPU texture. Call once per frame if dirty.
   */
  uploadIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas as any);
  }

  getTexture(): WebGLTexture {
    return this.texture;
  }

  getWidth(): number {
    return this.atlasWidth;
  }

  getHeight(): number {
    return this.atlasHeight;
  }

  private rasterizeGlyph(char: string, bold: boolean, italic: boolean): GlyphInfo {
    const dpr = this.devicePixelRatio;
    const physFontSize = this.fontSize * dpr;
    const weight = bold ? this.fontWeightBold : this.fontWeight;
    let fontStr = `${weight} ${physFontSize}px ${this.fontFamily}`;
    if (italic) fontStr = `italic ${fontStr}`;

    this.ctx.font = fontStr;
    const metrics = this.ctx.measureText(char);

    // Glyph dimensions in physical pixels
    const glyphW = Math.ceil(metrics.width) + GlyphAtlas.PADDING * 2;
    const glyphH = Math.ceil(this.cellHeight * dpr) + GlyphAtlas.PADDING * 2;

    // Allocate space in atlas (shelf packing)
    if (this.shelfX + glyphW > this.atlasWidth) {
      // Move to next shelf
      this.shelfY += this.shelfHeight + GlyphAtlas.PADDING;
      this.shelfX = 0;
      this.shelfHeight = 0;
    }

    if (this.shelfY + glyphH > this.atlasHeight) {
      // Atlas full — rebuild with larger size
      if (this.atlasWidth < GlyphAtlas.MAX_SIZE) {
        this.grow();
      } else {
        // At max size, clear and start over
        this.clear();
      }
    }

    const u = this.shelfX;
    const v = this.shelfY;

    // Rasterize into atlas canvas
    this.ctx.font = fontStr;
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = '#ffffff'; // White glyph — color is applied in shader
    this.ctx.fillText(char, u + GlyphAtlas.PADDING, v + GlyphAtlas.PADDING + this.baseline * dpr);

    // Advance shelf cursor
    this.shelfX += glyphW;
    if (glyphH > this.shelfHeight) this.shelfHeight = glyphH;

    return {
      u: u + GlyphAtlas.PADDING,
      v: v + GlyphAtlas.PADDING,
      w: Math.ceil(metrics.width),
      h: Math.ceil(this.cellHeight * dpr),
      offsetX: 0,
      offsetY: 0,
    };
  }

  private grow(): void {
    const newSize = Math.min(this.atlasWidth * 2, GlyphAtlas.MAX_SIZE);
    const oldCanvas = this.canvas;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(newSize, newSize);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = newSize;
      this.canvas.height = newSize;
    }

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    // Copy old atlas content
    this.ctx.drawImage(oldCanvas as any, 0, 0);

    this.atlasWidth = newSize;
    this.atlasHeight = newSize;

    // Resize GPU texture
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.atlasWidth,
      this.atlasHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    this.dirty = true;
  }

  clear(): void {
    this.cache.clear();
    this.shelfX = 0;
    this.shelfY = 0;
    this.shelfHeight = 0;
    this.ctx.clearRect(0, 0, this.atlasWidth, this.atlasHeight);
    this.dirty = true;
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.cache.clear();
  }
}
