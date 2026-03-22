/**
 * GLSL shaders for WebGL terminal renderer.
 *
 * Background shader: renders cell backgrounds as colored quads.
 * Foreground shader: renders glyphs from the atlas texture.
 */

export const BG_VERT = `#version 300 es
precision highp float;

// Per-instance: grid position (col, row) + bg color
layout(location = 0) in vec2 a_gridPos;
layout(location = 1) in vec3 a_bgColor;

uniform vec2 u_cellSize;   // cell size in clip space (2/cols, 2/rows)

out vec3 v_color;

void main() {
  // Quad vertices: 0-3 for triangle strip (2 triangles)
  int vid = gl_VertexID % 4;
  vec2 corner = vec2(
    (vid == 1 || vid == 3) ? 1.0 : 0.0,
    (vid == 2 || vid == 3) ? 1.0 : 0.0
  );

  // Position in clip space: [-1, 1]
  vec2 pos = vec2(
    -1.0 + (a_gridPos.x + corner.x) * u_cellSize.x,
     1.0 - (a_gridPos.y + corner.y) * u_cellSize.y
  );

  gl_Position = vec4(pos, 0.0, 1.0);
  v_color = a_bgColor;
}
`;

export const BG_FRAG = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_color, 1.0);
}
`;

export const FG_VERT = `#version 300 es
precision highp float;

// Per-instance: grid position, fg color, atlas UV rect, alpha
layout(location = 0) in vec2 a_gridPos;
layout(location = 1) in vec3 a_fgColor;
layout(location = 2) in vec4 a_atlasUV;  // x, y, w, h in texels
layout(location = 3) in float a_alpha;   // 1.0 normal, 0.5 faint

uniform vec2 u_cellSize;     // cell size in clip space
uniform vec2 u_atlasSize;    // atlas texture size in texels

out vec2 v_texCoord;
out vec3 v_color;
flat out float v_alpha;

void main() {
  int vid = gl_VertexID % 4;
  vec2 corner = vec2(
    (vid == 1 || vid == 3) ? 1.0 : 0.0,
    (vid == 2 || vid == 3) ? 1.0 : 0.0
  );

  vec2 pos = vec2(
    -1.0 + (a_gridPos.x + corner.x) * u_cellSize.x,
     1.0 - (a_gridPos.y + corner.y) * u_cellSize.y
  );

  vec2 uvOrigin = a_atlasUV.xy / u_atlasSize;
  vec2 uvSize = a_atlasUV.zw / u_atlasSize;
  v_texCoord = uvOrigin + corner * uvSize;

  gl_Position = vec4(pos, 0.0, 1.0);
  v_color = a_fgColor;
  v_alpha = a_alpha;
}
`;

export const FG_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec3 v_color;
flat in float v_alpha;

uniform sampler2D u_atlas;

out vec4 fragColor;

void main() {
  vec4 texel = texture(u_atlas, v_texCoord);
  float alpha = texel.r * v_alpha;
  if (alpha < 0.01) discard;
  fragColor = vec4(v_color, alpha);
}
`;

// Line decoration shader (underlines, strikethrough, link underlines)
export const LINE_VERT = `#version 300 es
precision highp float;

// Per-instance: start pos, end pos (in grid coords), color, Y offset (in cell-height fraction)
layout(location = 0) in vec4 a_lineCoords; // startX, startY, endX, endY (endY unused, same row)
layout(location = 1) in vec3 a_lineColor;
layout(location = 2) in float a_yOffset;   // vertical offset as fraction of cell height

uniform vec2 u_cellSize;
uniform float u_lineWidth; // in clip-space Y units

out vec3 v_color;

void main() {
  int vid = gl_VertexID % 4;
  float lx = (vid == 1 || vid == 3) ? a_lineCoords.z + 1.0 : a_lineCoords.x;
  float ly = (vid == 2 || vid == 3) ? 1.0 : 0.0;

  float x = -1.0 + lx * u_cellSize.x;
  float baseY = 1.0 - (a_lineCoords.y + a_yOffset) * u_cellSize.y;
  float y = baseY - ly * u_lineWidth;

  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = a_lineColor;
}
`;

export const LINE_FRAG = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_color, 1.0);
}
`;
