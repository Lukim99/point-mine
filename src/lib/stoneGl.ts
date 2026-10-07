import aquamarineUrl from '../assets/stones/ability-stone-0.webp'
import lapisUrl from '../assets/stones/ability-stone-1.webp'
import jadeUrl from '../assets/stones/ability-stone-2.webp'
import amethystUrl from '../assets/stones/ability-stone-3.webp'

// 어빌리티 스톤 세공·각인 화면이 함께 쓰는 WebGL 도구입니다.
// 외부 라이브러리 없이 WebGL1(GLSL ES 1.00)만 사용해 오래된 모바일 기기에서도 그려지도록 합니다.

export type GlStatus = 'loading' | 'ready' | 'unsupported' | 'lost'
export type Vec2 = [number, number]
export type Rgb = readonly [number, number, number]

export interface GlScene {
  // 컨텍스트가 처음 만들어지거나 손실 후 복구될 때마다 GPU 자원을 새로 만듭니다.
  setup(gl: WebGLRenderingContext): void
  // 그리기 버퍼의 실제 픽셀 크기가 바뀌면 호출됩니다.
  resize(width: number, height: number): void
  // 한 프레임을 그립니다. time은 performance.now() 기준 초, dt는 지난 프레임과의 간격입니다.
  render(time: number, dt: number): void
  // 컨텍스트가 살아 있을 때 GPU 자원을 해제합니다.
  dispose(gl: WebGLRenderingContext): void
}

export interface Camera { x: number; y: number; zoom: number; roll: number; shakeX: number; shakeY: number; aspect: number }

// 스톤 그림(512px)마다 실제 결정이 차지하는 경계(AbilityStoneSprite와 같은 값)와 빛깔,
// 그리고 세 줄이 닿는 타격점(경계 안 0~1 좌표, 위가 0)입니다.
export const STONE_ART = [
  { url: aquamarineUrl, bounds: [119, 12, 394, 486], tint: [0.25, 0.78, 0.84], anchors: [[0.33, 0.23], [0.71, 0.34], [0.48, 0.58]] },
  { url: lapisUrl, bounds: [82, 45, 430, 467], tint: [0.41, 0.49, 0.96], anchors: [[0.32, 0.2], [0.71, 0.28], [0.38, 0.55]] },
  { url: jadeUrl, bounds: [134, 7, 379, 499], tint: [0.25, 0.78, 0.52], anchors: [[0.29, 0.29], [0.72, 0.39], [0.39, 0.64]] },
  { url: amethystUrl, bounds: [119, 8, 393, 499], tint: [0.71, 0.44, 0.92], anchors: [[0.37, 0.29], [0.66, 0.39], [0.39, 0.59]] },
] as const

export type StoneArt = (typeof STONE_ART)[number]
export const stoneArt = (variant: number | undefined): StoneArt => STONE_ART[Math.abs(Math.floor(variant ?? 0)) % STONE_ART.length]

export const COLORS = {
  jade: [0.53, 0.89, 0.61],
  cinnabar: [1.0, 0.42, 0.3],
  ward: [0.42, 0.92, 0.85],
  gold: [1.0, 0.82, 0.45],
  hot: [1.0, 0.62, 0.24],
  rock: [0.42, 0.37, 0.32],
  ash: [0.52, 0.47, 0.42],
} as const satisfies Record<string, Rgb>

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const smooth = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t) }
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3)
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function loadImages(urls: readonly string[]): Promise<HTMLImageElement[]> {
  return Promise.all(urls.map((url) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    image.src = url
  })))
}

export function createGlContext(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  const attributes: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' }
  try {
    const context = canvas.getContext('webgl', attributes) ?? canvas.getContext('experimental-webgl', attributes)
    return context instanceof WebGLRenderingContext ? context : null
  } catch {
    return null
  }
}

// ---------- 셰이더 프로그램 ----------

const FRAGMENT_PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('셰이더를 만들지 못했습니다.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new Error(`셰이더 컴파일 실패: ${log}`)
  }
  return shader
}

export class GlProgram {
  readonly handle: WebGLProgram
  private readonly gl: WebGLRenderingContext
  private readonly uniforms = new Map<string, WebGLUniformLocation>()
  private readonly attributes = new Map<string, number>()

  constructor(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
    this.gl = gl
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_PRECISION + fragmentSource)
    const handle = gl.createProgram()
    if (!handle) throw new Error('셰이더 프로그램을 만들지 못했습니다.')
    gl.attachShader(handle, vertex)
    gl.attachShader(handle, fragment)
    // 0번 속성이 항상 쓰이도록 모서리 좌표를 0번에 고정합니다.
    gl.bindAttribLocation(handle, 0, 'aCorner')
    gl.linkProgram(handle)
    gl.detachShader(handle, vertex)
    gl.detachShader(handle, fragment)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(handle) ?? ''
      gl.deleteProgram(handle)
      throw new Error(`셰이더 연결 실패: ${log}`)
    }
    this.handle = handle
    const uniformCount = Number(gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS))
    for (let index = 0; index < uniformCount; index += 1) {
      const info = gl.getActiveUniform(handle, index)
      if (!info) continue
      const name = info.name.replace(/\[0\]$/, '')
      const location = gl.getUniformLocation(handle, name)
      if (location) this.uniforms.set(name, location)
    }
    const attributeCount = Number(gl.getProgramParameter(handle, gl.ACTIVE_ATTRIBUTES))
    for (let index = 0; index < attributeCount; index += 1) {
      const info = gl.getActiveAttrib(handle, index)
      if (info) this.attributes.set(info.name, gl.getAttribLocation(handle, info.name))
    }
  }

  use() { this.gl.useProgram(this.handle) }
  attribute(name: string) { return this.attributes.get(name) ?? -1 }
  f1(name: string, x: number) { const location = this.uniforms.get(name); if (location) this.gl.uniform1f(location, x) }
  f2(name: string, x: number, y: number) { const location = this.uniforms.get(name); if (location) this.gl.uniform2f(location, x, y) }
  f3(name: string, x: number, y: number, z: number) { const location = this.uniforms.get(name); if (location) this.gl.uniform3f(location, x, y, z) }
  f4(name: string, x: number, y: number, z: number, w: number) { const location = this.uniforms.get(name); if (location) this.gl.uniform4f(location, x, y, z, w) }
  rgb(name: string, color: Rgb) { this.f3(name, color[0], color[1], color[2]) }
  v4(name: string, values: Float32Array) { const location = this.uniforms.get(name); if (location) this.gl.uniform4fv(location, values) }
  i1(name: string, x: number) { const location = this.uniforms.get(name); if (location) this.gl.uniform1i(location, x) }
  dispose() { this.gl.deleteProgram(this.handle) }
}

// 네 모서리(-1~1)로 이루어진 사각형 하나를 모든 스프라이트·효과가 함께 씁니다.
export class QuadMesh {
  private readonly gl: WebGLRenderingContext
  private readonly buffer: WebGLBuffer | null

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  }

  draw(program: GlProgram) {
    const gl = this.gl
    const location = program.attribute('aCorner')
    if (location < 0) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disableVertexAttribArray(location)
  }

  dispose() { this.gl.deleteBuffer(this.buffer) }
}

// ---------- 텍스처 ----------

export function createTexture(gl: WebGLRenderingContext, source: TexImageSource, mipmap: boolean): WebGLTexture | null {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  // 미리 곱한 알파로 올려 가장자리의 검은 테두리 없이 섞이게 합니다.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  }
  return texture
}

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0
export const isPotImage = (image: HTMLImageElement) => isPowerOfTwo(image.naturalWidth) && isPowerOfTwo(image.naturalHeight)

// WebGL1은 2의 거듭제곱 크기에서만 밉맵을 만들 수 있어, 큰 그림은 맞는 크기의 캔버스로 옮겨 그립니다.
export function fitToPot(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, width, height)
  }
  return canvas
}

// 아틀라스의 한 그림만 정사각 틀(긴 변 × padding) 가운데에 옮겨 그립니다. PickaxeSprite와 같은 틀 비율입니다.
export function cropSquareToPot(image: HTMLImageElement, bounds: readonly [number, number, number, number], size: number, padding: number): HTMLCanvasElement {
  const [left, top, right, bottom] = bounds
  const width = right - left
  const height = bottom - top
  const side = Math.max(width, height) * padding
  const scale = size / side
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, left, top, width, height, ((side - width) / 2) * scale, ((side - height) / 2) * scale, width * scale, height * scale)
  }
  return canvas
}

// ---------- 카메라 ----------

export const createCamera = (): Camera => ({ x: 0, y: 0, zoom: 1, roll: 0, shakeX: 0, shakeY: 0, aspect: 1 })

export function applyCamera(program: GlProgram, camera: Camera, parallax: number) {
  program.f4('uCamera', camera.x, camera.y, camera.zoom, camera.roll)
  program.f2('uShake', camera.shakeX, camera.shakeY)
  program.f1('uAspect', camera.aspect)
  program.f1('uParallax', parallax)
}

// 월드 좌표를 화면 0~1 좌표(아래가 0)로 바꿉니다. 후처리 충격파의 중심을 잡을 때 씁니다.
export function worldToScreen(camera: Camera, x: number, y: number): Vec2 {
  const px = (x - camera.x - camera.shakeX) * camera.zoom
  const py = (y - camera.y - camera.shakeY) * camera.zoom
  const cos = Math.cos(camera.roll)
  const sin = Math.sin(camera.roll)
  return [((px * cos - py * sin) / camera.aspect) * 0.5 + 0.5, (px * sin + py * cos) * 0.5 + 0.5]
}

export function placeQuad(program: GlProgram, x: number, y: number, halfX: number, halfY: number, rotation = 0, crop: readonly [number, number, number, number] = FULL_CROP) {
  program.f2('uCenter', x, y)
  program.f2('uHalf', halfX, halfY)
  program.f1('uRotation', rotation)
  program.f4('uCrop', crop[0], crop[1], crop[2], crop[3])
}

const FULL_CROP = [0, 0, 1, 1] as const

// ---------- GLSL 조각 ----------

const NOISE_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(17.13, 9.71);
    amplitude *= 0.5;
  }
  return value;
}
float fade(float inner, float outer, float x) { return 1.0 - smoothstep(inner, outer, x); }
float luma(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
`

// 결정면·균열용 보로노이: x = 셀 경계까지 거리, yz = 셀 정수 좌표
const VORONOI_GLSL = `
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  float edge = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + hash22(n + g) - f;
      vec2 diff = r - mr;
      if (dot(diff, diff) > 0.00001) edge = min(edge, dot(0.5 * (mr + r), normalize(diff)));
    }
  }
  return vec3(edge, n + mg);
}
`

const CAMERA_GLSL = `
uniform vec4 uCamera;
uniform vec2 uShake;
uniform float uAspect;
uniform float uParallax;
vec2 worldToClip(vec2 world) {
  float zoom = 1.0 + (uCamera.z - 1.0) * uParallax;
  vec2 p = (world - (uCamera.xy + uShake) * uParallax) * zoom;
  float roll = uCamera.w * uParallax;
  float c = cos(roll);
  float s = sin(roll);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  return vec2(p.x / uAspect, p.y);
}
`

export const FULLSCREEN_VS = `
attribute vec2 aCorner;
varying vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}
`

// 월드에 놓이는 사각형: 중심·반폭·회전과 텍스처 자르기 영역을 받습니다.
export const SPRITE_VS = `
attribute vec2 aCorner;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uRotation;
uniform vec4 uCrop;
varying vec2 vUv;
varying vec2 vSt;
varying vec2 vLocal;
varying vec2 vWorld;
${CAMERA_GLSL}
void main() {
  float c = cos(uRotation);
  float s = sin(uRotation);
  vec2 local = aCorner * uHalf;
  vec2 world = uCenter + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vSt = vec2(aCorner.x * 0.5 + 0.5, 0.5 - aCorner.y * 0.5);
  vUv = vec2(mix(uCrop.x, uCrop.z, vSt.x), mix(uCrop.y, uCrop.w, vSt.y));
  vLocal = aCorner;
  vWorld = world;
  gl_Position = vec4(worldToClip(world), 0.0, 1.0);
}
`

// 갱도 배경: 피사계 심도 흐림, 흔들리는 등불, 스톤이 비추는 마력 빛, 떠다니는 먼지
export const BACKDROP_FS = `
uniform sampler2D uTex;
uniform vec4 uPlate;
uniform vec4 uView;
uniform vec2 uViewShake;
uniform float uViewAspect;
uniform float uDepth;
uniform float uTime;
uniform float uDim;
uniform float uBlur;
uniform vec4 uMana;
uniform vec3 uManaColor;
uniform float uFlicker;
uniform float uDust;
uniform vec3 uGrade;
varying vec2 vUv;
${NOISE_GLSL}
vec2 plateToWorld(vec2 uv) {
  return vec2(uPlate.x + (uv.x - 0.5) * 2.0 * uPlate.z, uPlate.y + (0.5 - uv.y) * 2.0 * uPlate.w);
}
float lantern(vec2 world, vec2 uv, float phase) {
  vec2 d = world - plateToWorld(uv);
  float r2 = dot(d, d);
  float flicker = 1.0 + uFlicker * (0.1 * sin(uTime * 7.3 + phase) + 0.07 * sin(uTime * 12.7 + phase * 2.3) + 0.16 * (noise(vec2(uTime * 2.6, phase * 5.0)) - 0.5));
  return (exp(-r2 * 30.0) * 0.85 + exp(-r2 * 2.4) * 0.3) * flicker;
}
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uViewAspect, 1.0);
  float roll = -uView.w * uDepth;
  float c = cos(roll);
  float s = sin(roll);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  float zoom = 1.0 + (uView.z - 1.0) * uDepth;
  vec2 world = p / zoom + (uView.xy + uViewShake) * uDepth;
  vec2 uv = vec2((world.x - uPlate.x) / (2.0 * uPlate.z) + 0.5, 0.5 - (world.y - uPlate.y) / (2.0 * uPlate.w));
  vec3 color = texture2D(uTex, uv).rgb * 0.36;
  color += texture2D(uTex, uv + vec2(uBlur, 0.0)).rgb * 0.16;
  color += texture2D(uTex, uv - vec2(uBlur, 0.0)).rgb * 0.16;
  color += texture2D(uTex, uv + vec2(0.0, uBlur * 1.78)).rgb * 0.16;
  color += texture2D(uTex, uv - vec2(0.0, uBlur * 1.78)).rgb * 0.16;
  float lights = lantern(world, vec2(0.169, 0.351), 0.0) + lantern(world, vec2(0.73, 0.377), 1.7) + lantern(world, vec2(0.909, 0.395), 3.1) * 0.45;
  vec2 manaDelta = world - uMana.xy;
  float manaFall = uMana.z * exp(-dot(manaDelta, manaDelta) / max(uMana.w * uMana.w, 0.0001));
  color *= (1.0 - uDim) + lights * 0.55 + manaFall * 0.6;
  color += vec3(1.0, 0.6, 0.26) * lights * 0.22;
  color += uManaColor * manaFall * 0.16;
  vec2 drift = world * 8.0 + vec2(sin(uTime * 0.2) * 0.6, -uTime * 0.32);
  vec2 cell = floor(drift);
  vec2 jitter = hash22(cell) - 0.5;
  float pick = hash12(cell + 7.0);
  float mote = fade(0.02, 0.07, length(fract(drift) - 0.5 - jitter * 0.7)) * step(0.84, pick);
  float twinkle = 0.5 + 0.5 * sin(uTime * (1.2 + pick * 3.0) + pick * 40.0);
  color += vec3(1.0, 0.82, 0.58) * mote * twinkle * (lights * 0.8 + manaFall * 0.7 + 0.05) * uDust;
  gl_FragColor = vec4(color * uGrade, 1.0);
}
`

// 일반 스프라이트(바위·곡괭이·스톤): 명암으로 추정한 법선에 등불·마력 빛을 받고,
// 바깥 테두리 빛과 소켓에서 번지는 마력 혈관을 덧그립니다.
export const SPRITE_FS = `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec3 uKeyLight;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
uniform vec4 uMana;
uniform vec3 uManaColor;
uniform float uRelief;
uniform float uExposure;
uniform float uSaturation;
uniform float uOpacity;
uniform float uFloorFade;
uniform vec4 uRim;
uniform vec4 uVeins;
uniform vec3 uVeinColor;
uniform float uFlash;
uniform float uTime;
varying vec2 vUv;
varying vec2 vSt;
varying vec2 vLocal;
varying vec2 vWorld;
${NOISE_GLSL}
void main() {
  vec4 texel = texture2D(uTex, vUv);
  float alpha = texel.a;
  float rim = 0.0;
  if (uRim.a > 0.0) {
    vec2 o = uTexel * 7.0;
    float around = texture2D(uTex, vUv + vec2(o.x, 0.0)).a + texture2D(uTex, vUv - vec2(o.x, 0.0)).a
      + texture2D(uTex, vUv + vec2(0.0, o.y)).a + texture2D(uTex, vUv - vec2(0.0, o.y)).a
      + texture2D(uTex, vUv + o * 0.7071).a + texture2D(uTex, vUv - o * 0.7071).a
      + texture2D(uTex, vUv + vec2(o.x, -o.y) * 0.7071).a + texture2D(uTex, vUv + vec2(-o.x, o.y) * 0.7071).a;
    rim = clamp(around / 8.0 - alpha * 0.6, 0.0, 1.0);
  }
  vec3 base = texel.rgb / max(alpha, 0.001);
  float hL = luma(texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).rgb);
  float hR = luma(texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb);
  float hU = luma(texture2D(uTex, vUv - vec2(0.0, uTexel.y)).rgb);
  float hD = luma(texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb);
  vec3 normal = normalize(vec3((hL - hR) * uRelief, (hD - hU) * uRelief, 1.0));
  vec3 toLight = normalize(vec3(uKeyLight.xy - vWorld, uKeyLight.z));
  float diffuse = max(dot(normal, toLight), 0.0);
  float specular = pow(max(dot(normal, normalize(toLight + vec3(0.0, 0.0, 1.0))), 0.0), 28.0);
  vec2 manaDelta = vWorld - uMana.xy;
  float manaFall = uMana.z * exp(-dot(manaDelta, manaDelta) / max(uMana.w * uMana.w, 0.0001));
  float manaFacing = max(dot(normal, normalize(vec3(-manaDelta, 0.45))), 0.0);
  vec3 color = base * (uAmbient + uKeyColor * (0.3 + 0.8 * diffuse)) + uKeyColor * specular * 0.3;
  color += base * uManaColor * manaFall * (0.35 + 0.9 * manaFacing);
  color = mix(vec3(luma(color)), color, uSaturation) * uExposure;
  color *= mix(1.0, smoothstep(-1.05, 0.35, vLocal.y), uFloorFade);
  if (uVeins.w > 0.0) {
    float d = distance(vSt, uVeins.xy);
    float ridge = 1.0 - abs(noise(vSt * 18.0 + vec2(uTime * 0.15, 0.0)) * 2.0 - 1.0);
    float strands = pow(ridge, 7.0);
    float inside = fade(uVeins.z - 0.15, uVeins.z, d);
    float front = fade(0.0, 0.09, abs(d - uVeins.z)) * step(d, 1.2);
    float pulse = 0.65 + 0.35 * sin(uTime * 2.6 - d * 14.0);
    color += uVeinColor * uVeins.w * (strands * inside * pulse * 1.3 + front * 0.9 + inside * 0.08);
  }
  color += vec3(1.0, 0.94, 0.82) * uFlash;
  float outAlpha = alpha * uOpacity;
  gl_FragColor = vec4(color * outAlpha + uRim.rgb * rim * uRim.a * uOpacity, outAlpha);
}
`

// 세공대의 스톤: 원석 껍질, 줄마다 빛나는 결정면·균열·불리 침식·회피 봉인, 타격 섬광을 한 번에 그립니다.
export const FORGE_STONE_FS = `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec3 uKeyLight;
uniform vec3 uKeyColor;
uniform vec3 uTint;
uniform vec4 uLines[3];
uniform vec4 uLineState[3];
uniform vec4 uImpact;
uniform vec3 uImpactColor;
uniform vec4 uCharge;
uniform float uProgress;
uniform float uComplete;
uniform float uSweep;
uniform float uCropAspect;
uniform float uTime;
uniform float uSheen;
varying vec2 vUv;
varying vec2 vSt;
varying vec2 vWorld;
${NOISE_GLSL}
${VORONOI_GLSL}
const vec3 JADE = vec3(0.53, 0.89, 0.61);
const vec3 CINNABAR = vec3(1.0, 0.42, 0.3);
const vec3 WARD = vec3(0.42, 0.92, 0.85);
const vec3 GOLD = vec3(1.0, 0.82, 0.45);
float brassMask(vec3 color) {
  float high = max(max(color.r, color.g), color.b);
  float low = min(min(color.r, color.g), color.b);
  float warm = smoothstep(-0.015, 0.02, color.r - color.g) * smoothstep(-0.015, 0.02, color.g - color.b);
  float hue = (color.g - color.b) / max(color.r - color.b, 0.001);
  float amber = smoothstep(0.22, 0.4, hue) * fade(0.85, 0.98, hue);
  return warm * amber * smoothstep(0.06, 0.14, high - low) * smoothstep(0.05, 0.12, high);
}
void main() {
  vec4 texel = texture2D(uTex, vUv);
  float alpha = texel.a;
  vec3 base = texel.rgb / max(alpha, 0.001);
  float crystal = (1.0 - brassMask(base)) * smoothstep(0.25, 0.7, alpha);

  float hL = luma(texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).rgb);
  float hR = luma(texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb);
  float hU = luma(texture2D(uTex, vUv - vec2(0.0, uTexel.y)).rgb);
  float hD = luma(texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb);
  vec3 normal = normalize(vec3((hL - hR) * 2.4, (hD - hU) * 2.4, 1.0));
  vec3 toLight = normalize(vec3(uKeyLight.xy - vWorld, uKeyLight.z));
  float diffuse = max(dot(normal, toLight), 0.0);
  float specular = pow(max(dot(normal, normalize(toLight + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);

  vec2 iso = vec2(vSt.x * uCropAspect, vSt.y);
  vec3 facet = voronoi(iso * 7.0);
  vec2 facetPoint = (facet.yz + hash22(facet.yz)) / 7.0;
  float facetRand = hash12(facet.yz + 3.7);
  float facetEdge = fade(0.0, 0.07, facet.x);
  vec3 shard = voronoi(iso * 16.0 + 4.3);
  float crackLine = fade(0.0, 0.06, shard.x);
  float grain = noise(iso * 9.0);

  vec3 glow = vec3(0.0);
  float cracks = 0.0;
  float taint = 0.0;
  float reveal = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 line = uLines[i];
    vec4 state = uLineState[i];
    if (line.w > 0.5) {
      vec2 anchor = vec2(line.x * uCropAspect, line.y);
      float anchorDist = distance(iso, anchor);
      float dFrag = anchorDist + (grain - 0.5) * 0.08;
      float dFacet = distance(facetPoint, anchor);
      float positive = step(0.0, line.z);
      float chipR = 0.06 + state.z * 0.045;
      reveal = max(reveal, fade(chipR - 0.03, chipR + 0.03, dFrag) * clamp(state.z, 0.0, 1.0));
      float litR = 0.03 + state.x * 0.034;
      float lit = fade(litR - 0.025, litR, dFacet) * clamp(state.x, 0.0, 1.0);
      float scarR = 0.03 + state.y * 0.03;
      float scar = fade(scarR - 0.05, scarR, dFrag) * clamp(state.y, 0.0, 1.0);
      if (positive > 0.5) {
        vec3 facetColor = mix(uTint, JADE, 0.4) * (0.45 + 0.75 * facetRand);
        glow += facetColor * lit * (0.3 + 1.0 * facetEdge);
        cracks = max(cracks, crackLine * scar);
      } else {
        taint = max(taint, lit);
        glow += CINNABAR * lit * (0.12 + 1.15 * facetEdge);
        glow += WARD * scar * (0.04 + 0.5 * crackLine);
      }
      float ring = fade(0.0, 0.014, abs(anchorDist - (0.06 + 0.01 * sin(uTime * 6.0))));
      glow += mix(CINNABAR, GOLD, positive) * ring * state.w;
    }
  }

  float clarity = mix(0.5, 1.0, max(uProgress, uComplete));
  vec3 gem = base * (0.6 + 0.65 * diffuse) + uKeyColor * specular * (0.2 + 0.5 * crystal);
  gem = mix(gem, mix(vec3(luma(gem)), gem, clarity) * (0.72 + 0.28 * clarity), crystal);
  gem *= 1.0 - cracks * 0.8 * crystal;
  gem = mix(gem, gem * vec3(0.78, 0.42, 0.36), taint * 0.4 * crystal);
  gem += glow * crystal;
  float sweepLine = fract(uTime * 0.09) * 2.8 - 0.6;
  float glint = fade(0.0, 0.045, abs(vSt.x * 0.5 + vSt.y - sweepLine));
  gem += vec3(1.0, 0.95, 0.86) * glint * uSheen * crystal * clarity * 0.32;
  float sweep = fade(0.0, 0.09, abs(vSt.x * 0.4 + vSt.y - (uSweep * 2.0 - 0.45))) * step(0.001, uSweep) * step(uSweep, 0.999);
  gem += GOLD * (sweep * 1.3 + facetEdge * 0.16 * uComplete) * crystal;

  float crustNoise = fbm(iso * 4.5 + 1.3);
  float coverage = 0.92 - uProgress * 0.8;
  float crust = fade(coverage - 0.05, coverage + 0.05, crustNoise) * (1.0 - reveal) * (1.0 - uComplete) * crystal;
  float rockGrain = fbm(iso * 16.0);
  vec3 rock = mix(vec3(0.15, 0.135, 0.12), vec3(0.47, 0.42, 0.36), rockGrain);
  rock *= 0.5 + 0.8 * diffuse;
  rock += uTint * smoothstep(0.66, 0.74, rockGrain) * 0.3;
  float chipped = smoothstep(0.0, 0.35, crust) * fade(0.65, 1.0, crust);
  rock += vec3(0.95, 0.82, 0.62) * chipped * 0.22;
  vec3 color = mix(gem, rock, smoothstep(0.0, 1.0, crust));

  vec2 hitAnchor = vec2(uImpact.x * uCropAspect, uImpact.y);
  float hitDist = distance(iso, hitAnchor);
  float age = uImpact.z;
  float flashCore = exp(-hitDist * hitDist / 0.006) * exp(-age * 7.0) * 1.5;
  float wave = fade(0.0, 0.045, abs(hitDist - age * 0.8)) * exp(-age * 3.2);
  color += uImpactColor * (flashCore + wave * crystal);
  float ash = step(0.5, uImpact.w) * step(uImpact.w, 1.5);
  color += vec3(1.0, 0.5, 0.2) * cracks * ash * exp(-age * 2.4) * 1.6 * fade(0.1, 0.45, hitDist);
  vec2 chargeAnchor = vec2(uCharge.x * uCropAspect, uCharge.y);
  float chargeDist = distance(iso, chargeAnchor);
  color += uTint * exp(-chargeDist * chargeDist / 0.0035) * uCharge.z * (0.7 + 0.3 * sin(uTime * 34.0));
  gl_FragColor = vec4(color * alpha, alpha);
}
`

export const FX = { glow: 0, ring: 1, shadow: 2, chisel: 3, marker: 4, rune: 5, beam: 6 } as const

// 거리장으로 그리는 효과: 빛무리·충격 고리·그림자·세공 끌·줄 표식·각인 마법진·빛기둥
export const FX_FS = `
uniform float uMode;
uniform vec4 uColor;
uniform vec4 uParams;
uniform vec2 uScale;
uniform float uPixel;
uniform float uTime;
varying vec2 vLocal;
${NOISE_GLSL}
vec4 glowShape(vec2 q) {
  float r = length(q);
  float g = exp(-r * r * uParams.x) * fade(0.75, 1.0, r);
  if (uParams.y > 0.0) g *= mix(1.0, 0.55 + 0.9 * fbm(q * 2.4 + vec2(0.0, -uTime * uParams.z)), uParams.y);
  return vec4(uColor.rgb * g * uColor.a, 0.0);
}
vec4 ringShape(vec2 q) {
  float r = length(q);
  float ring = fade(0.0, uParams.y, abs(r - uParams.x)) * fade(0.9, 1.0, r);
  return vec4(uColor.rgb * ring * uColor.a, 0.0);
}
vec4 shadowShape(vec2 q) {
  return vec4(0.0, 0.0, 0.0, fade(uParams.x, 1.0, length(q)) * uColor.a);
}
vec4 chiselShape(vec2 q) {
  vec2 p = q * uScale;
  float x = p.x;
  float halfWidth = 0.022;
  float part = 0.0;
  if (x > 0.3) {
    halfWidth = mix(0.022, 0.004, clamp((x - 0.3) / 0.1, 0.0, 1.0));
  } else if (x > 0.02) {
    halfWidth = 0.022;
  } else if (x > -0.035) {
    halfWidth = 0.03;
    part = 1.0;
  } else if (x > -0.33) {
    halfWidth = mix(0.031, 0.036, 1.0 - smoothstep(-0.2, -0.035, x));
    part = 2.0;
  } else {
    halfWidth = 0.04;
    part = 3.0;
  }
  float aa = uPixel;
  float body = fade(-aa, aa, abs(p.y) - halfWidth) * smoothstep(-0.39 - aa, -0.39 + aa, x) * fade(0.4 - aa, 0.4 + aa, x);
  float across = clamp(p.y / halfWidth, -1.0, 1.0);
  float bulge = sqrt(max(1.0 - across * across, 0.0));
  float shade = (0.5 + 0.5 * across * uParams.x) * (0.35 + 0.65 * bulge);
  float shine = fade(0.0, 0.22, abs(across - 0.45 * sign(uParams.x)));
  vec3 color;
  if (part < 0.5) {
    color = mix(vec3(0.17, 0.18, 0.2), vec3(0.8, 0.82, 0.86), shade) + shine * 0.45;
  } else if (part < 1.5) {
    color = mix(vec3(0.3, 0.19, 0.07), vec3(0.98, 0.78, 0.42), shade) + shine * 0.4;
  } else if (part < 2.5) {
    color = mix(vec3(0.11, 0.06, 0.035), vec3(0.46, 0.28, 0.14), shade) * (0.78 + 0.34 * noise(vec2(x * 70.0, p.y * 240.0)));
  } else {
    color = mix(vec3(0.15, 0.15, 0.16), vec3(0.6, 0.61, 0.64), shade) + shine * 0.25;
  }
  color *= 0.55 + 0.45 * smoothstep(0.0, 0.3, 1.0 - abs(across));
  float heat = uParams.y * smoothstep(0.24, 0.4, x);
  color = mix(color, vec3(1.0, 0.56, 0.2) * 1.5, heat * 0.85);
  vec2 tip = p - vec2(0.4, 0.0);
  float spark = exp(-dot(tip, tip) / 0.0012) * uParams.z;
  return vec4(color * body + uColor.rgb * spark, body);
}
vec4 markerShape(vec2 local) {
  vec2 q = local * uParams.z;
  float r = length(q);
  float aa = uPixel * uParams.z;
  float disc = fade(0.9 - aa, 0.9 + aa, r);
  float band = smoothstep(0.64 - aa, 0.64 + aa, r) * disc;
  float bevel = clamp(dot(q, vec2(-0.45, 0.89)) / max(r, 0.001), -1.0, 1.0);
  vec3 brass = mix(vec3(0.34, 0.22, 0.09), vec3(0.98, 0.8, 0.47), 0.5 + 0.5 * bevel);
  vec3 inner = vec3(0.045, 0.04, 0.035) + uColor.rgb * 0.22 * fade(0.0, 0.64, r);
  float spacing = 0.2;
  float span = (uParams.x - 1.0) * spacing;
  float bars = 0.0;
  for (int i = 0; i < 3; i++) {
    float index = float(i);
    float cx = -span * 0.5 + index * spacing;
    float bar = fade(0.045 - aa, 0.045 + aa, abs(q.x - cx)) * fade(0.3 - aa, 0.3 + aa, abs(q.y));
    bars = max(bars, bar * step(index + 0.5, uParams.x));
  }
  float serifHalf = span * 0.5 + 0.1;
  float serif = fade(0.03 - aa, 0.03 + aa, abs(abs(q.y) - 0.3)) * fade(serifHalf - aa, serifHalf + aa, abs(q.x));
  float glyph = max(bars, serif) * (1.0 - band);
  vec3 color = mix(inner, brass, band);
  color = mix(color, mix(uColor.rgb, vec3(1.0), 0.35) * (0.75 + 0.6 * uParams.y), glyph);
  float alpha = disc * uColor.a;
  vec3 halo = uColor.rgb * exp(-r * r * 1.6) * uParams.y * 0.55 * (1.0 - disc) * uColor.a;
  return vec4(color * alpha + halo, alpha);
}
float triangleLine(vec2 q, float rotation, float radius, float width) {
  float d = -10.0;
  for (int k = 0; k < 3; k++) {
    float angle = rotation + float(k) * 2.0943951;
    d = max(d, dot(q, vec2(cos(angle), sin(angle))));
  }
  return fade(0.0, width, abs(d - radius));
}
vec4 runeShape(vec2 q) {
  float r = length(q);
  float turn = (atan(q.y, q.x) + 3.14159265) / 6.2831853;
  float drawn = fade(uParams.x - 0.02, uParams.x, turn);
  float w = 0.018;
  float outer = fade(0.0, w * 1.6, abs(r - 0.95));
  float innerRing = fade(0.0, w, abs(r - 0.8));
  float bandMask = step(0.82, r) * step(r, 0.93);
  float ticks = bandMask * step(0.5, fract(turn * 54.0)) * step(0.35, hash12(vec2(floor(turn * 54.0), 4.0)));
  float star = max(triangleLine(q, 1.5707963, 0.39, w), triangleLine(q, -1.5707963, 0.39, w)) * step(r, 0.8);
  float core = fade(0.0, w, abs(r - 0.42));
  float value = (outer + innerRing * 0.8 + ticks * 0.65 + star * 0.75 + core * 0.5) * drawn;
  float pulse = 0.85 + 0.15 * sin(uTime * 2.2 + r * 6.0);
  return vec4(uColor.rgb * value * pulse * uColor.a, 0.0);
}
vec4 beamShape(vec2 q) {
  float core = exp(-q.x * q.x * 14.0);
  float along = smoothstep(-1.0, -0.6, q.y) * fade(0.1, 1.0, q.y);
  float flicker = 0.8 + 0.2 * noise(vec2(q.y * 3.0 - uTime * 2.5, q.x * 2.0));
  return vec4(uColor.rgb * core * along * flicker * uColor.a, 0.0);
}
void main() {
  vec4 color;
  if (uMode < 0.5) color = glowShape(vLocal);
  else if (uMode < 1.5) color = ringShape(vLocal);
  else if (uMode < 2.5) color = shadowShape(vLocal);
  else if (uMode < 3.5) color = chiselShape(vLocal);
  else if (uMode < 4.5) color = markerShape(vLocal);
  else if (uMode < 5.5) color = runeShape(vLocal);
  else color = beamShape(vLocal);
  gl_FragColor = color;
}
`

export interface FxDraw {
  mode: number
  x: number
  y: number
  halfX: number
  halfY: number
  rotation?: number
  color: Rgb
  intensity: number
  params?: readonly [number, number, number, number]
  scale?: readonly [number, number]
  pixel?: number
}

const NO_PARAMS = [0, 0, 0, 0] as const
const UNIT_SCALE = [1, 1] as const

export function drawFx(program: GlProgram, quad: QuadMesh, camera: Camera, fx: FxDraw, time: number, parallax = 1) {
  if (fx.intensity <= 0.0005) return
  program.use()
  applyCamera(program, camera, parallax)
  placeQuad(program, fx.x, fx.y, fx.halfX, fx.halfY, fx.rotation ?? 0)
  program.f1('uMode', fx.mode)
  program.f4('uColor', fx.color[0], fx.color[1], fx.color[2], fx.intensity)
  const params = fx.params ?? NO_PARAMS
  program.f4('uParams', params[0], params[1], params[2], params[3])
  const scale = fx.scale ?? UNIT_SCALE
  program.f2('uScale', scale[0], scale[1])
  program.f1('uPixel', fx.pixel ?? 0.01)
  program.f1('uTime', time)
  quad.draw(program)
}

// ---------- 입자 ----------

export const PARTICLE = { spark: 0, shard: 1, dust: 2, ember: 3, converge: 4, chip: 5, orbit: 6 } as const

// 입자는 태어난 순간의 위치·속도만 GPU에 올리고, 현재 위치는 정점 셰이더가 시간으로 계산합니다.
const PARTICLE_VS = `
attribute vec4 aMotion;
attribute vec4 aLife;
attribute vec4 aColor;
attribute vec2 aCorner;
uniform float uTime;
varying vec2 vCorner;
varying vec3 vColor;
varying float vKind;
varying float vFade;
varying float vSeed;
${CAMERA_GLSL}
void main() {
  float age = uTime - aLife.x;
  float life = max(aLife.y, 0.001);
  float kind = aLife.w;
  vCorner = aCorner;
  vColor = aColor.rgb;
  vKind = kind;
  vSeed = aColor.w;
  vFade = 0.0;
  if (age < 0.0 || age > life) {
    gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
  } else {
    float drag = 3.0;
    float gravity = -1.6;
    float spin = 0.0;
    float grow = 1.0;
    if (kind < 0.5) { drag = 3.2; gravity = -2.2; }
    else if (kind < 1.5) { drag = 2.4; gravity = -1.4; spin = 9.0; }
    else if (kind < 2.5) { drag = 4.5; gravity = 0.18; spin = 1.0; grow = 1.0 + age / life * 1.8; }
    else if (kind < 3.5) { drag = 1.6; gravity = 0.55; }
    else if (kind < 5.5 && kind > 4.5) { drag = 1.1; gravity = -3.2; spin = 12.0; }
    float f = age / life;
    vec2 origin = aMotion.xy;
    vec2 vel0 = aMotion.zw;
    vec2 pos;
    vec2 vel;
    if (kind > 3.5 && kind < 4.5) {
      float radius = length(vel0) * (1.0 - f) * (1.0 - f);
      float angle = atan(vel0.y, vel0.x) + f * 3.0 * (aColor.w > 0.5 ? 1.0 : -1.0);
      pos = origin + vec2(cos(angle), sin(angle)) * radius;
      vel = vec2(-sin(angle), cos(angle));
    } else if (kind > 5.5) {
      float radius = length(vel0) * (0.25 + 0.75 * sqrt(f));
      float angle = atan(vel0.y, vel0.x) + f * 2.4;
      pos = origin + vec2(cos(angle), sin(angle)) * radius;
      vel = vec2(-sin(angle), cos(angle));
    } else {
      vec2 g = vec2(0.0, gravity);
      float k = max(drag, 0.01);
      float e = exp(-k * age);
      pos = origin + (vel0 - g / k) * (1.0 - e) / k + g / k * age;
      vel = (vel0 - g / k) * e + g / k;
      if (kind > 2.5 && kind < 3.5) pos.x += sin(age * 6.0 + aColor.w * 20.0) * 0.015;
    }
    float size = aLife.z * grow;
    vec2 axisX;
    vec2 axisY;
    float sizeX = size;
    float sizeY = size;
    if (kind < 0.5) {
      float speed = length(vel);
      vec2 dir = speed > 0.0001 ? vel / speed : vec2(1.0, 0.0);
      axisX = dir;
      axisY = vec2(-dir.y, dir.x);
      sizeX = size + speed * 0.028;
      sizeY = size * 0.42;
    } else {
      float turn = aColor.w * 6.2831 + age * spin;
      axisX = vec2(cos(turn), sin(turn));
      axisY = vec2(-axisX.y, axisX.x);
    }
    vec2 world = pos + axisX * aCorner.x * sizeX + axisY * aCorner.y * sizeY;
    vFade = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.55, 1.0, f));
    gl_Position = vec4(worldToClip(world), 0.0, 1.0);
  }
}
`

const PARTICLE_FS = `
varying vec2 vCorner;
varying vec3 vColor;
varying float vKind;
varying float vFade;
varying float vSeed;
void main() {
  float r = length(vCorner);
  vec4 color = vec4(0.0);
  if (vKind < 0.5) {
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    color = vec4(mix(vColor, vec3(1.0, 0.97, 0.88), core * core) * core * vFade * 1.7, 0.0);
  } else if (vKind < 1.5) {
    float d = abs(vCorner.x) + abs(vCorner.y) * 1.35;
    float body = 1.0 - smoothstep(0.72, 1.0, d);
    float hot = 1.0 - smoothstep(0.0, 0.55, d);
    color = vec4((vColor * body + vec3(1.0) * hot * 0.55) * vFade * 1.25, 0.0);
  } else if (vKind < 2.5) {
    float a = (1.0 - smoothstep(0.1, 1.0, r)) * 0.3 * vFade;
    color = vec4(vColor * a, a);
  } else if (vKind < 4.5 || vKind > 5.5) {
    float g = exp(-r * r * 4.0) * (1.0 - smoothstep(0.7, 1.0, r));
    color = vec4(vColor * g * vFade * 1.5, 0.0);
  } else {
    float d = max(abs(vCorner.x), abs(vCorner.y) * 1.25) + (vSeed - 0.5) * 0.2 * vCorner.x;
    float a = (1.0 - smoothstep(0.72, 0.92, d)) * vFade;
    color = vec4(vColor * (0.6 + 0.6 * (vCorner.y * 0.5 + 0.5)) * a, a);
  }
  gl_FragColor = color;
}
`

export interface ParticleSpec {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  kind: number
  color: Rgb
  birth: number
  seed?: number
}

export interface SprayOptions {
  count: number
  kind: number
  speed: readonly [number, number]
  spread: number
  life: readonly [number, number]
  size: readonly [number, number]
  colors: readonly Rgb[]
  lift?: number
  around?: boolean
}

// direction(라디안)을 중심으로 spread만큼 흩어지며 튀는 입자 묶음을 만듭니다. around면 사방으로 퍼집니다.
export function sprayParticles(field: ParticleField, origin: Vec2, direction: number, options: SprayOptions, birth: number) {
  for (let index = 0; index < options.count; index += 1) {
    const angle = options.around ? Math.random() * Math.PI * 2 : direction + (Math.random() - 0.5) * 2 * options.spread
    const speed = randomBetween(options.speed[0], options.speed[1])
    const color = options.colors[index % options.colors.length]
    const jitter = 0.85 + Math.random() * 0.3
    field.emit({
      x: origin[0] + (Math.random() - 0.5) * 0.02,
      y: origin[1] + (Math.random() - 0.5) * 0.02,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + (options.lift ?? 0),
      life: randomBetween(options.life[0], options.life[1]),
      size: randomBetween(options.size[0], options.size[1]),
      kind: options.kind,
      color: [color[0] * jitter, color[1] * jitter, color[2] * jitter],
      birth: birth + Math.random() * 0.03,
    })
  }
}

const PARTICLE_FLOATS = 14
const PARTICLE_CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]

export class ParticleField {
  private readonly capacity: number
  private readonly data: Float32Array
  private cursor = 0
  private dirtyFrom = Number.POSITIVE_INFINITY
  private dirtyTo = -1
  private gl: WebGLRenderingContext | null = null
  private buffer: WebGLBuffer | null = null
  private program: GlProgram | null = null

  constructor(capacity: number) {
    this.capacity = capacity
    this.data = new Float32Array(capacity * 6 * PARTICLE_FLOATS)
    // 처음에는 모든 칸을 이미 수명이 끝난 입자로 채웁니다.
    for (let offset = 4; offset < this.data.length; offset += PARTICLE_FLOATS) this.data[offset] = -1000
  }

  setup(gl: WebGLRenderingContext) {
    this.gl = gl
    this.program = new GlProgram(gl, PARTICLE_VS, PARTICLE_FS)
    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW)
    this.dirtyFrom = Number.POSITIVE_INFINITY
    this.dirtyTo = -1
  }

  emit(spec: ParticleSpec) {
    const index = this.cursor
    this.cursor = (this.cursor + 1) % this.capacity
    const seed = spec.seed ?? Math.random()
    const data = this.data
    let offset = index * 6 * PARTICLE_FLOATS
    for (let vertex = 0; vertex < 6; vertex += 1) {
      data[offset] = spec.x
      data[offset + 1] = spec.y
      data[offset + 2] = spec.vx
      data[offset + 3] = spec.vy
      data[offset + 4] = spec.birth
      data[offset + 5] = spec.life
      data[offset + 6] = spec.size
      data[offset + 7] = spec.kind
      data[offset + 8] = spec.color[0]
      data[offset + 9] = spec.color[1]
      data[offset + 10] = spec.color[2]
      data[offset + 11] = seed
      data[offset + 12] = PARTICLE_CORNERS[vertex * 2]
      data[offset + 13] = PARTICLE_CORNERS[vertex * 2 + 1]
      offset += PARTICLE_FLOATS
    }
    this.dirtyFrom = Math.min(this.dirtyFrom, index)
    this.dirtyTo = Math.max(this.dirtyTo, index)
  }

  draw(camera: Camera, time: number) {
    const gl = this.gl
    const program = this.program
    if (!gl || !program || !this.buffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    if (this.dirtyTo >= this.dirtyFrom) {
      const from = this.dirtyFrom * 6 * PARTICLE_FLOATS
      const to = (this.dirtyTo + 1) * 6 * PARTICLE_FLOATS
      gl.bufferSubData(gl.ARRAY_BUFFER, from * 4, this.data.subarray(from, to))
      this.dirtyFrom = Number.POSITIVE_INFINITY
      this.dirtyTo = -1
    }
    program.use()
    applyCamera(program, camera, 1)
    program.f1('uTime', time)
    const stride = PARTICLE_FLOATS * 4
    const layout: [string, number, number][] = [['aMotion', 4, 0], ['aLife', 4, 16], ['aColor', 4, 32], ['aCorner', 2, 48]]
    const enabled: number[] = []
    for (const [name, size, offset] of layout) {
      const location = program.attribute(name)
      if (location < 0) continue
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
      enabled.push(location)
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.capacity * 6)
    for (const location of enabled) gl.disableVertexAttribArray(location)
  }

  dispose(gl: WebGLRenderingContext) {
    this.program?.dispose()
    gl.deleteBuffer(this.buffer)
    this.program = null
    this.buffer = null
    this.gl = null
  }
}

// ---------- 후처리 ----------

// 장면을 텍스처에 그린 뒤 충격파 굴절·색 번짐·섬광·비네트·필름 입자를 한 번에 입힙니다.
const POST_FS = `
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec4 uWave;
uniform vec4 uFlash;
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
uniform float uFade;
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 delta = (vUv - uWave.xy) * aspect;
  float dist = length(delta);
  vec2 dir = delta / max(dist, 0.0001);
  float band = fade(0.0, 0.14, abs(dist - uWave.z * 1.3));
  float push = uWave.w * band * exp(-uWave.z * 2.6);
  vec2 uv = vUv - dir / aspect * push * 0.03;
  vec2 split = (uv - 0.5) * uAberration * 0.012;
  vec3 color = vec3(texture2D(uScene, uv + split).r, texture2D(uScene, uv).g, texture2D(uScene, uv - split).b);
  color += uFlash.rgb * uFlash.a * exp(-dist * dist * 3.0);
  vec2 vignette = (vUv - 0.5) * vec2(1.2, 1.35);
  color *= 1.0 - uVignette * smoothstep(0.32, 0.92, length(vignette));
  color += (hash12(vUv * uResolution + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain;
  gl_FragColor = vec4(color * uFade, 1.0);
}
`

export interface PostEffect {
  wave: readonly [number, number, number, number]
  flash: readonly [number, number, number, number]
  aberration: number
  vignette: number
  grain: number
  fade: number
  time: number
}

export class PostPass {
  private readonly gl: WebGLRenderingContext
  private readonly program: GlProgram
  private framebuffer: WebGLFramebuffer | null = null
  private texture: WebGLTexture | null = null
  private width = 1
  private height = 1
  private ready = false

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
    this.program = new GlProgram(gl, FULLSCREEN_VS, POST_FS)
  }

  resize(width: number, height: number) {
    const gl = this.gl
    this.width = width
    this.height = height
    this.texture ??= gl.createTexture()
    this.framebuffer ??= gl.createFramebuffer()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0)
    // 렌더 타깃을 만들 수 없는 기기에서는 후처리 없이 화면에 바로 그립니다.
    this.ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  begin() {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ready ? this.framebuffer : null)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  finish(quad: QuadMesh, effect: PostEffect) {
    if (!this.ready) return
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.BLEND)
    this.program.use()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    this.program.i1('uScene', 0)
    this.program.f2('uResolution', this.width, this.height)
    this.program.f4('uWave', effect.wave[0], effect.wave[1], effect.wave[2], effect.wave[3])
    this.program.f4('uFlash', effect.flash[0], effect.flash[1], effect.flash[2], effect.flash[3])
    this.program.f1('uAberration', effect.aberration)
    this.program.f1('uVignette', effect.vignette)
    this.program.f1('uGrain', effect.grain)
    this.program.f1('uFade', effect.fade)
    this.program.f1('uTime', effect.time)
    quad.draw(this.program)
    gl.enable(gl.BLEND)
  }

  dispose() {
    const gl = this.gl
    this.program.dispose()
    gl.deleteFramebuffer(this.framebuffer)
    gl.deleteTexture(this.texture)
    this.framebuffer = null
    this.texture = null
  }
}

// 모든 장면이 같은 혼합 규칙(미리 곱한 알파)을 씁니다. 알파 0으로 내보내면 빛을 더하는 효과가 됩니다.
export function prepareGlState(gl: WebGLRenderingContext) {
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
}

export function bindTexture(gl: WebGLRenderingContext, program: GlProgram, texture: WebGLTexture | null, name = 'uTex') {
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  program.i1(name, 0)
}

// 배경 그림을 화면 비율에 맞춰 덮도록 월드 위의 판 크기를 정합니다. 두 등불 사이(가로 45%)가 가운데에 옵니다.
export function backdropPlate(image: HTMLImageElement, aspect: number, centerY: number): [number, number, number, number] {
  const imageAspect = image.naturalWidth / Math.max(1, image.naturalHeight)
  const halfHeight = Math.max(1.2, (1.2 * aspect) / imageAspect)
  const halfWidth = halfHeight * imageAspect
  return [0.1 * halfWidth, centerY, halfWidth, halfHeight]
}

// ---------- 그리기 루프 ----------

export interface GlStageOptions { maxDpr?: number; maxPixels?: number }

// 캔버스 크기·픽셀 비율·화면 표시 여부·컨텍스트 손실을 관리하며 장면을 그립니다.
export class GlStage {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext
  private readonly scene: GlScene
  private readonly report: (status: GlStatus) => void
  private readonly maxDpr: number
  private readonly maxPixels: number
  private frame = 0
  private lastTime = 0
  private lost = false
  private failed = false
  private pageVisible = true
  private inView = true
  private sizeDirty = true
  private lastDpr = 0
  private resizeObserver: ResizeObserver | null = null
  private viewObserver: IntersectionObserver | null = null

  constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, scene: GlScene, report: (status: GlStatus) => void, options: GlStageOptions = {}) {
    this.canvas = canvas
    this.gl = gl
    this.scene = scene
    this.report = report
    this.maxDpr = options.maxDpr ?? 2
    this.maxPixels = options.maxPixels ?? 1_800_000
  }

  start() {
    this.canvas.addEventListener('webglcontextlost', this.handleLost)
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored)
    document.addEventListener('visibilitychange', this.handleVisibility)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.markResize)
      this.resizeObserver.observe(this.canvas)
    } else {
      window.addEventListener('resize', this.markResize)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.viewObserver = new IntersectionObserver((entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting)
        this.schedule()
      })
      this.viewObserver.observe(this.canvas)
    }
    this.pageVisible = !document.hidden
    this.initialize()
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('resize', this.markResize)
    this.resizeObserver?.disconnect()
    this.viewObserver?.disconnect()
    if (!this.lost && !this.gl.isContextLost()) {
      try {
        this.scene.dispose(this.gl)
      } catch {
        // 해제 중 오류가 나도 컨텍스트 자체를 버리므로 무시합니다.
      }
    }
    // 브라우저의 동시 WebGL 컨텍스트 수 제한에 걸리지 않도록 바로 반납합니다.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  private initialize() {
    try {
      this.scene.setup(this.gl)
      this.failed = false
      this.sizeDirty = true
      this.report('ready')
      this.schedule()
    } catch {
      this.failed = true
      this.report(this.gl.isContextLost() ? 'lost' : 'unsupported')
    }
  }

  private schedule() {
    if (this.frame || this.lost || this.failed || !this.pageVisible || !this.inView) return
    this.frame = requestAnimationFrame(this.tick)
  }

  private applySize(dpr: number) {
    const cssWidth = Math.max(1, this.canvas.clientWidth)
    const cssHeight = Math.max(1, this.canvas.clientHeight)
    let ratio = Math.min(dpr, this.maxDpr)
    if (cssWidth * cssHeight * ratio * ratio > this.maxPixels) ratio = Math.max(0.75, Math.sqrt(this.maxPixels / (cssWidth * cssHeight)))
    const width = Math.max(1, Math.round(cssWidth * ratio))
    const height = Math.max(1, Math.round(cssHeight * ratio))
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.scene.resize(width, height)
    this.sizeDirty = false
    this.lastDpr = dpr
  }

  private readonly tick = (now: number) => {
    this.frame = 0
    if (this.lost || this.failed) return
    const dpr = window.devicePixelRatio || 1
    if (this.sizeDirty || dpr !== this.lastDpr) this.applySize(dpr)
    const time = now / 1000
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, time - this.lastTime)) : 1 / 60
    this.lastTime = time
    try {
      this.scene.render(time, dt)
    } catch {
      this.failed = true
      this.report('unsupported')
      return
    }
    this.schedule()
  }

  private readonly markResize = () => {
    this.sizeDirty = true
    this.schedule()
  }

  private readonly handleVisibility = () => {
    this.pageVisible = !document.hidden
    this.lastTime = 0
    this.schedule()
  }

  private readonly handleLost = (event: Event) => {
    // 기본 동작을 막아야 브라우저가 컨텍스트를 복구해 줍니다.
    event.preventDefault()
    this.lost = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.report('lost')
  }

  private readonly handleRestored = () => {
    this.lost = false
    this.initialize()
  }
}
