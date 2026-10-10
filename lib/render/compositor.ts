/**
 * WebGL2 renderer for a Frame. Each card is one textured quad with real
 * perspective; rounded corners, the soft shadow and the vignette are drawn
 * with signed distance fields in the card's own plane, so they tilt with it.
 */

import type { CardLayer, Frame } from './frame';

const VERTEX_SHADER = `#version 300 es
in vec2 aCorner;
uniform mat4 uMvp;
uniform vec2 uSize;
uniform float uPad;
out vec2 vLocal;
void main() {
  vec2 local = aCorner * (uSize + 2.0 * uPad);
  vLocal = local;
  vec4 p = uMvp * vec4(local, 0.0, 1.0);
  gl_Position = vec4(p.xy, 0.0, p.w);
}`;

const SDF = `
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}`;

const CARD_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec4 uUv;
uniform float uRadius;
uniform float uOpacity;
uniform float uBlur;
uniform float uLodBias;
uniform float uVignette;
uniform float uVignetteSize;
out vec4 outColor;
${SDF}
void main() {
  float d = sdRoundRect(vLocal, uSize * 0.5, uRadius);
  float edge = fwidth(d) * 0.75 + uBlur;
  float coverage = 1.0 - smoothstep(-edge, edge, d);
  vec2 uv = uUv.xy + (vLocal / uSize + 0.5) * uUv.zw;
  vec3 color = texture(uTex, uv, uLodBias).rgb;
  float inside = clamp(-d / uVignetteSize, 0.0, 1.0);
  color *= 1.0 - uVignette * (1.0 - smoothstep(0.0, 1.0, inside));
  float alpha = coverage * uOpacity;
  outColor = vec4(color * alpha, alpha);
}`;

const SHADOW_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec2 uSize;
uniform float uRadius;
uniform float uOpacity;
uniform float uOffsetY;
uniform float uSpread;
uniform float uSoftness;
out vec4 outColor;
${SDF}
void main() {
  float d = sdRoundRect(vLocal - vec2(0.0, uOffsetY), uSize * 0.5 + uSpread, uRadius);
  float alpha = uOpacity * (1.0 - smoothstep(-uSoftness, uSoftness, d));
  outColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Texture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export type TextureSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

export interface CompositorOptions {
  /** Keep the drawn frame readable after rendering (needed to encode it). */
  preserveDrawingBuffer?: boolean;
  onContextRestored?: () => void;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl!: WebGL2RenderingContext;
  private card!: Program;
  private shadow!: Program;
  private quad: WebGLVertexArrayObject | null = null;
  private textures = new Map<string, Texture>();
  private anisotropy: { ext: EXT_texture_filter_anisotropic; max: number } | null = null;
  private lost = false;
  private readonly options: CompositorOptions;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: CompositorOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', this.handleLost as EventListener);
    canvas.addEventListener('webglcontextrestored', this.handleRestored as EventListener);
    this.init();
  }

  get maxTextureSize(): number {
    return this.lost ? 4096 : (this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number);
  }

  get isContextLost(): boolean {
    return this.lost;
  }

  hasTexture(key: string): boolean {
    return this.textures.has(key);
  }

  setTexture(key: string, source: TextureSource): void {
    if (this.lost) return;
    const gl = this.gl;
    const existing = this.textures.get(key);
    const texture = existing?.texture ?? gl.createTexture();
    if (!texture) return;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisotropy) {
      gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.anisotropy.max));
    }

    const width = 'width' in source ? source.width : 0;
    const height = 'height' in source ? source.height : 0;
    this.textures.set(key, { texture, width, height });
  }

  /** Drops textures whose keys are not in `keep`. */
  retainTextures(keep: Set<string>): void {
    for (const [key, entry] of this.textures) {
      if (!keep.has(key)) {
        if (!this.lost) this.gl.deleteTexture(entry.texture);
        this.textures.delete(key);
      }
    }
  }

  render(frame: Frame): void {
    if (this.lost) return;
    const gl = this.gl;
    const pixelWidth = this.canvas.width;
    const pixelHeight = this.canvas.height;

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(frame.background[0], frame.background[1], frame.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.quad);

    const pixelsPerUnit = pixelWidth / frame.width;
    for (const layer of frame.layers) {
      const texture = this.textures.get(layer.imageKey);
      if (!texture) continue;
      this.drawShadow(layer);
      this.drawCard(layer, texture, pixelsPerUnit);
    }

    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost as EventListener);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored as EventListener);
    if (!this.lost) {
      const gl = this.gl;
      for (const entry of this.textures.values()) gl.deleteTexture(entry.texture);
      gl.deleteProgram(this.card.program);
      gl.deleteProgram(this.shadow.program);
      gl.deleteVertexArray(this.quad);
    }
    this.textures.clear();
  }

  /**
   * Frees the GPU context right away instead of waiting for garbage
   * collection. Only for one-off canvases (exports): browsers cap live
   * contexts and drop the oldest, which would be the preview's.
   */
  release(): void {
    this.dispose();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private drawShadow(layer: CardLayer) {
    if (layer.shadowOpacity <= 0) return;
    const gl = this.gl;
    const { program, uniforms } = this.shadow;
    gl.useProgram(program);
    const pad = Math.abs(layer.shadowOffsetY) + layer.shadowBlur + Math.max(0, layer.shadowSpread);
    gl.uniformMatrix4fv(uniforms.uMvp, false, layer.mvp);
    gl.uniform2f(uniforms.uSize, layer.width, layer.height);
    gl.uniform1f(uniforms.uPad, pad);
    gl.uniform1f(uniforms.uRadius, layer.radius);
    gl.uniform1f(uniforms.uOpacity, layer.shadowOpacity * layer.opacity);
    gl.uniform1f(uniforms.uOffsetY, layer.shadowOffsetY);
    gl.uniform1f(uniforms.uSpread, layer.shadowSpread);
    gl.uniform1f(uniforms.uSoftness, layer.shadowBlur);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawCard(layer: CardLayer, texture: Texture, pixelsPerUnit: number) {
    const gl = this.gl;
    const { program, uniforms } = this.card;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture.texture);

    // Blur widens the texture footprint by sampling a coarser mip level
    const blurPixels = layer.blurReference * pixelsPerUnit;
    const lodBias = blurPixels > 0.5 ? Math.log2(1 + blurPixels) : -0.25;

    gl.uniformMatrix4fv(uniforms.uMvp, false, layer.mvp);
    gl.uniform2f(uniforms.uSize, layer.width, layer.height);
    gl.uniform1f(uniforms.uPad, 2 + layer.blur);
    gl.uniform1i(uniforms.uTex, 0);
    gl.uniform4f(uniforms.uUv, layer.uv[0], layer.uv[1], layer.uv[2], layer.uv[3]);
    gl.uniform1f(uniforms.uRadius, layer.radius);
    gl.uniform1f(uniforms.uOpacity, layer.opacity);
    gl.uniform1f(uniforms.uBlur, layer.blur);
    gl.uniform1f(uniforms.uLodBias, lodBias);
    gl.uniform1f(uniforms.uVignette, layer.vignette);
    gl.uniform1f(uniforms.uVignetteSize, layer.vignetteSize);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private init() {
    const gl = this.gl;
    this.card = this.createProgram(CARD_SHADER, [
      'uMvp', 'uSize', 'uPad', 'uTex', 'uUv', 'uRadius', 'uOpacity', 'uBlur', 'uLodBias', 'uVignette', 'uVignetteSize',
    ]);
    this.shadow = this.createProgram(SHADOW_SHADER, [
      'uMvp', 'uSize', 'uPad', 'uRadius', 'uOpacity', 'uOffsetY', 'uSpread', 'uSoftness',
    ]);

    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    this.anisotropy = ext
      ? { ext, max: gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number }
      : null;

    // One unit quad, scaled to the card in the vertex shader
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    for (const { program } of [this.card, this.shadow]) {
      const location = gl.getAttribLocation(program, 'aCorner');
      if (location >= 0) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  private createProgram(fragmentSource: string, uniformNames: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    // Both programs read the quad from attribute 0
    gl.bindAttribLocation(program, 0, 'aCorner');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    const uniforms: Program['uniforms'] = {};
    for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
    return { program, uniforms };
  }

  private handleLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.textures.clear();
  };

  private handleRestored = () => {
    this.lost = false;
    this.init();
    this.options.onContextRestored?.();
  };
}
