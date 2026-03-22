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

// Per-instance: grid position, fg color, atlas UV rect
layout(location = 0) in vec2 a_gridPos;
layout(location = 1) in vec3 a_fgColor;
layout(location = 2) in vec4 a_atlasUV;  // x, y, w, h in texels

uniform vec2 u_cellSize;     // cell size in clip space
uniform vec2 u_atlasSize;    // atlas texture size in texels

out vec2 v_texCoord;
out vec3 v_color;

void main() {
  int vid = gl_VertexID % 4;
  vec2 corner = vec2(
    (vid == 1 || vid == 3) ? 1.0 : 0.0,
    (vid == 2 || vid == 3) ? 1.0 : 0.0
  );

  // Position in clip space
  vec2 pos = vec2(
    -1.0 + (a_gridPos.x + corner.x) * u_cellSize.x,
     1.0 - (a_gridPos.y + corner.y) * u_cellSize.y
  );

  // Texture coordinates (normalized 0-1)
  vec2 uvOrigin = a_atlasUV.xy / u_atlasSize;
  vec2 uvSize = a_atlasUV.zw / u_atlasSize;
  v_texCoord = uvOrigin + corner * uvSize;

  gl_Position = vec4(pos, 0.0, 1.0);
  v_color = a_fgColor;
}
`;

export const FG_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec3 v_color;

uniform sampler2D u_atlas;
uniform float u_globalAlpha;

out vec4 fragColor;

void main() {
  vec4 texel = texture(u_atlas, v_texCoord);
  // Use the texel's luminance as alpha (white glyph on transparent bg)
  float alpha = texel.r * u_globalAlpha;
  if (alpha < 0.01) discard;
  fragColor = vec4(v_color, alpha);
}
`;
