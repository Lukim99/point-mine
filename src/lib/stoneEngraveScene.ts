import backdropUrl from '../assets/bg_pc.png'
import pickaxesUrl from '../assets/pickaxes.png'
import { spriteBounds } from './sprites'
import {
  BACKDROP_FS,
  COLORS,
  FULLSCREEN_VS,
  FX,
  FX_FS,
  GlProgram,
  PARTICLE,
  ParticleField,
  PostPass,
  QuadMesh,
  SPRITE_FS,
  SPRITE_VS,
  applyCamera,
  backdropPlate,
  bindTexture,
  createCamera,
  createTexture,
  cropSquareToPot,
  drawFx,
  easeOut,
  fitToPot,
  isPotImage,
  mixRgb,
  placeQuad,
  prepareGlState,
  randomBetween,
  smooth,
  sprayParticles,
  stoneArt,
  worldToScreen,
  type GlScene,
  type Rgb,
  type StoneArt,
  type Vec2,
} from './stoneGl'

// 「각인 의식」 장면: 세공을 마친 스톤이 곡괭이 머리의 소켓으로 내리꽂히고,
// 황동 테가 녹아 조여든 뒤 스톤의 마력이 곡괭이 전체로 혈관처럼 번져 나갑니다.

// 화면에서 곡괭이가 놓일 영역(오버레이 기준 0~1, 위가 0)
export interface FocusRect { x: number; y: number; w: number; h: number }

// 모임 → 강하 → 결합(효과음·문구 공개) → 안착 순서의 시간표(초)
export const ENGRAVE_TIMING = { gather: 1.4, bind: 1.8, settle: 2.7 } as const

export const engraveImageUrls = (variant: number): string[] => [backdropUrl, pickaxesUrl, stoneArt(variant).url]

// 곡괭이 그림마다 자루와 머리가 만나는 소켓 자리(그림 경계 기준 0~1, 위가 0)
const PICKAXE_SOCKETS: readonly (readonly [number, number])[] = [
  [0.75, 0.15], [0.73, 0.15], [0.74, 0.14], [0.7, 0.15],
  [0.68, 0.14], [0.69, 0.17], [0.63, 0.21], [0.63, 0.21],
  [0.72, 0.16], [0.65, 0.17], [0.5, 0.23], [0.49, 0.21],
  [0.5, 0.22], [0.48, 0.19], [0.52, 0.22], [0.5, 0.19],
]

const FRAME_PADDING = 1.06

// 곡괭이 그림의 아틀라스 경계와, PickaxeSprite와 같은 정사각 틀 안에서의 소켓 위치를 돌려줍니다.
export function pickaxeArt(spriteIndex: number) {
  const index = Math.max(0, Math.min(spriteBounds.pickaxes.length - 1, Math.floor(spriteIndex)))
  const bounds = spriteBounds.pickaxes[index]
  const [left, top, right, bottom] = bounds
  const width = right - left
  const height = bottom - top
  const side = Math.max(width, height) * FRAME_PADDING
  const [socketU, socketV] = PICKAXE_SOCKETS[index] ?? [0.6, 0.2]
  const socket: Vec2 = [0.5 + ((socketU - 0.5) * width) / side, 0.5 + ((socketV - 0.5) * height) / side]
  return { bounds, socket }
}

interface SpriteLook {
  exposure: number
  rim: readonly [number, number, number, number]
  veins: readonly [number, number, number, number]
  veinColor: Rgb
  flash: number
  mana: readonly [number, number, number, number]
  relief: number
}

const KEY_LIGHT = [-1.6, 1.4, 1.4] as const
const KEY_COLOR: Rgb = [1.0, 0.84, 0.64]

export class StoneEngraveScene implements GlScene {
  private readonly backdrop: HTMLImageElement
  private readonly atlas: HTMLImageElement
  private readonly stoneImage: HTMLImageElement
  private readonly art: StoneArt
  private readonly pickaxe: ReturnType<typeof pickaxeArt>
  private readonly reduced: boolean
  private readonly origin = performance.now() / 1000
  private readonly particles = new ParticleField(420)
  private readonly camera = createCamera()

  private gl: WebGLRenderingContext | null = null
  private quad: QuadMesh | null = null
  private backdropProgram: GlProgram | null = null
  private spriteProgram: GlProgram | null = null
  private fxProgram: GlProgram | null = null
  private post: PostPass | null = null
  private textures: { backdrop: WebGLTexture | null; pickaxe: WebGLTexture | null; stone: WebGLTexture | null } | null = null
  private sources: { backdrop: TexImageSource; pickaxe: TexImageSource; stone: TexImageSource } | null = null
  private width = 1
  private height = 1
  private focus: FocusRect = { x: 0.08, y: 0.1, w: 0.84, h: 0.5 }
  // 건너뛰기와 늦은 준비는 음수 시작 시각을 만들 수 있어 미시작 상태는 null로 구분합니다.
  private playAt: number | null = null
  private gatherFired = false
  private bindFired = false
  private lastTrail = 0
  private lastEmber = 0

  constructor(images: HTMLImageElement[], spriteIndex: number, variant: number, reducedMotion: boolean) {
    const [backdrop, atlas, stone] = images
    this.backdrop = backdrop
    this.atlas = atlas
    this.stoneImage = stone
    this.art = stoneArt(variant)
    this.pickaxe = pickaxeArt(spriteIndex)
    this.reduced = reducedMotion
  }

  // ---------- 화면 쪽에서 부르는 조작 ----------

  setFocus(rect: FocusRect) {
    if (rect.w > 0 && rect.h > 0) this.focus = rect
  }

  // 의식을 시작합니다. 장면이 늦게 준비되면 이미 지난 시간만큼 앞당겨 화면의 문구·효과음과 맞춥니다.
  play(elapsed = 0) {
    if (this.playAt !== null) return
    if (this.reduced) {
      this.skip()
      return
    }
    this.playAt = this.clock() - elapsed
    this.gatherFired = elapsed > 0.6
    this.bindFired = elapsed > ENGRAVE_TIMING.bind + 0.15
  }

  // 결합이 끝난 모습으로 바로 넘어갑니다.
  skip() {
    const now = this.clock()
    const settled = ENGRAVE_TIMING.settle + 0.25
    if (this.playAt === null || now - this.playAt < settled) this.playAt = now - settled
    this.gatherFired = true
    this.bindFired = true
  }

  // ---------- GlScene ----------

  setup(gl: WebGLRenderingContext) {
    this.gl = gl
    prepareGlState(gl)
    this.quad = new QuadMesh(gl)
    this.backdropProgram = new GlProgram(gl, FULLSCREEN_VS, BACKDROP_FS)
    this.spriteProgram = new GlProgram(gl, SPRITE_VS, SPRITE_FS)
    this.fxProgram = new GlProgram(gl, SPRITE_VS, FX_FS)
    this.post = new PostPass(gl)
    this.particles.setup(gl)
    this.sources ??= {
      backdrop: fitToPot(this.backdrop, 1024, 512),
      pickaxe: cropSquareToPot(this.atlas, this.pickaxe.bounds, 512, FRAME_PADDING),
      stone: isPotImage(this.stoneImage) ? this.stoneImage : fitToPot(this.stoneImage, 512, 512),
    }
    this.textures = {
      backdrop: createTexture(gl, this.sources.backdrop, true),
      pickaxe: createTexture(gl, this.sources.pickaxe, true),
      stone: createTexture(gl, this.sources.stone, true),
    }
    this.post.resize(this.width, this.height)
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.post?.resize(width, height)
  }

  dispose(gl: WebGLRenderingContext) {
    this.particles.dispose(gl)
    this.post?.dispose()
    this.quad?.dispose()
    this.backdropProgram?.dispose()
    this.spriteProgram?.dispose()
    this.fxProgram?.dispose()
    if (this.textures) {
      gl.deleteTexture(this.textures.backdrop)
      gl.deleteTexture(this.textures.pickaxe)
      gl.deleteTexture(this.textures.stone)
    }
    this.textures = null
    this.gl = null
  }

  render(time: number) {
    const gl = this.gl
    const quad = this.quad
    const post = this.post
    const textures = this.textures
    const backdrop = this.backdropProgram
    const sprite = this.spriteProgram
    const fx = this.fxProgram
    if (!gl || !quad || !post || !textures || !backdrop || !sprite || !fx) return
    const t = time - this.origin
    const loop = t % 600
    const pt = this.playAt !== null ? t - this.playAt : -1
    const { bind, gather, settle } = ENGRAVE_TIMING
    const tint = this.art.tint
    const aspect = this.width / Math.max(1, this.height)

    // 곡괭이가 놓일 자리: 화면 쪽 빈 영역(focus)의 가운데
    const centerX = ((this.focus.x + this.focus.w / 2) * 2 - 1) * aspect
    const centerY = 1 - (this.focus.y + this.focus.h / 2) * 2
    const side = Math.max(0.35, Math.min(this.focus.h * 2 * 0.84, this.focus.w * 2 * aspect * 0.84, 1.5))
    const gatherK = pt < 0 ? 0 : smooth(pt / 1.0)
    const bound = pt >= bind
    const bindAge = pt - bind
    const motion = this.reduced ? 0 : 1
    const bob = Math.sin(t * 1.25) * 0.012 * side * (bound ? 1 : 0.4) * motion
    const rotation = Math.sin(t * 0.8) * 0.02 * (bound ? 1 : 0.5) * motion
    const pickX = centerX
    const pickY = centerY + bob - 0.03 * side * (1 - gatherK)
    const [socketU, socketV] = this.pickaxe.socket
    const localX = (socketU - 0.5) * side
    const localY = (0.5 - socketV) * side
    const socket: Vec2 = [pickX + localX * Math.cos(rotation) - localY * Math.sin(rotation), pickY + localX * Math.sin(rotation) + localY * Math.cos(rotation)]

    // 스톤: 왼쪽 위에 떠서 마력을 모으다가 곡선을 그리며 소켓으로 내리꽂힙니다.
    const hover: Vec2 = [centerX - 0.4 * side, centerY + 0.27 * side + Math.sin(t * 1.6) * 0.015 * side * motion + 0.04 * side * gatherK]
    const stoneHeight = 0.46 * side
    const inlayHeight = 0.12 * side
    let stonePos: Vec2 = hover
    let stoneSize = stoneHeight
    let stoneTurn = 0
    if (pt >= gather && !bound) {
      const u = Math.pow((pt - gather) / (bind - gather), 2)
      const control: Vec2 = [socket[0] - 0.15 * side, socket[1] + 0.55 * side]
      const a = 1 - u
      stonePos = [a * a * hover[0] + 2 * a * u * control[0] + u * u * socket[0], a * a * hover[1] + 2 * a * u * control[1] + u * u * socket[1]]
      stoneSize = stoneHeight + (inlayHeight - stoneHeight) * u
      stoneTurn = u * 0.6
    } else if (bound) {
      stonePos = socket
      stoneSize = inlayHeight
    }

    this.fireEvents(t, pt, hover, stonePos, socket, side)
    this.updateCamera(t, pt, centerX, centerY, aspect)
    const camera = this.camera
    const flare = bound ? Math.exp(-bindAge * 2.2) : 0
    const runeColor = mixRgb(tint, COLORS.gold, 0.45)

    post.begin()

    // 1. 어두운 갱도
    backdrop.use()
    bindTexture(gl, backdrop, textures.backdrop)
    const plate = backdropPlate(this.backdrop, camera.aspect, 0.05)
    backdrop.f4('uPlate', plate[0], plate[1], plate[2], plate[3])
    backdrop.f4('uView', camera.x, camera.y, camera.zoom, camera.roll)
    backdrop.f2('uViewShake', camera.shakeX, camera.shakeY)
    backdrop.f1('uViewAspect', camera.aspect)
    backdrop.f1('uDepth', 0.3)
    backdrop.f1('uTime', loop)
    backdrop.f1('uDim', 0.6)
    backdrop.f1('uBlur', 0.003)
    backdrop.f4('uMana', socket[0], socket[1], 0.35 + 0.5 * gatherK + flare, 1.3 * side + 0.4)
    backdrop.rgb('uManaColor', tint)
    backdrop.f1('uFlicker', this.reduced ? 0.25 : 1)
    backdrop.f1('uDust', this.reduced ? 0 : 1)
    backdrop.f3('uGrade', 0.96, 0.93, 0.92)
    quad.draw(backdrop)

    // 2. 바닥 마법진과 곡괭이 뒤 기운
    const runeProgress = pt < 0 ? 0 : Math.min(1.05, (pt - 0.2) / 1.0)
    drawFx(fx, quad, camera, { mode: FX.rune, x: centerX, y: centerY - side * 0.47, halfX: side * 0.82, halfY: side * 0.21, color: runeColor, intensity: (0.5 + 0.9 * flare) * Math.min(1, Math.max(0, pt) / 0.4), params: [runeProgress, 0, 0, 0] }, loop)
    drawFx(fx, quad, camera, { mode: FX.glow, x: centerX, y: centerY, halfX: side * 1.05, halfY: side * 1.05, color: tint, intensity: 0.12 + 0.25 * gatherK + (bound ? 0.12 + 0.35 * Math.exp(-bindAge * 1.2) : 0), params: [2.2, this.reduced ? 0 : 0.5, 0.2, 0] }, loop)

    // 3. 결합 직전에 내려꽂히는 빛기둥
    if (pt >= bind - 0.25 && pt < bind + 1.4) {
      const beam = smooth((pt - (bind - 0.25)) / 0.25) * Math.exp(-Math.max(0, bindAge) * 2.0) * 0.9
      drawFx(fx, quad, camera, { mode: FX.beam, x: socket[0], y: socket[1] + side * 0.9, halfX: side * 0.24, halfY: side * 1.0, color: mixRgb(tint, [1, 1, 1], 0.4), intensity: beam }, loop)
    }

    // 4. 곡괭이: 결합 순간 섬광, 이후 소켓에서부터 마력 혈관이 번집니다.
    const veinRadius = bound ? 1.35 * easeOut(bindAge / 0.9) : 0
    const veinPower = !bound ? 0 : pt < settle ? 1 : 0.62 + 0.18 * Math.sin(t * 2.1)
    this.drawSprite(gl, quad, textures.pickaxe, 512, pickX, pickY, side / 2, side / 2, rotation, {
      exposure: 0.4 + 0.6 * gatherK,
      rim: bound ? [tint[0], tint[1], tint[2], 0.35 + 0.9 * Math.exp(-bindAge * 1.5)] : [1, 0.75, 0.4, 0.25 * gatherK],
      veins: [socketU, socketV, veinRadius, veinPower],
      veinColor: mixRgb(tint, [1, 1, 1], 0.15),
      flash: bound ? Math.exp(-bindAge * 7) * 0.9 : 0,
      mana: [socket[0], socket[1], bound ? 0.9 : 0.4 * gatherK, side * 0.6],
      relief: 2.4,
    }, loop)

    // 5. 스톤과 소켓
    const charge = pt < 0 ? 0 : bound ? 0 : smooth(pt / gather)
    if (bound) {
      drawFx(fx, quad, camera, { mode: FX.glow, x: socket[0], y: socket[1], halfX: inlayHeight * 1.9, halfY: inlayHeight * 1.9, color: tint, intensity: 0.55 + 0.25 * Math.sin(t * 2.4) + flare * 1.2, params: [3.0, 0, 0, 0] }, loop)
    } else {
      drawFx(fx, quad, camera, { mode: FX.glow, x: stonePos[0], y: stonePos[1], halfX: stoneSize * 1.1, halfY: stoneSize * 1.1, color: tint, intensity: 0.3 + 0.5 * charge, params: [2.6, this.reduced ? 0 : 0.4, 0.4, 0] }, loop)
    }
    this.drawStone(gl, quad, stonePos, stoneSize, stoneTurn, {
      exposure: bound ? 1.12 + 0.12 * Math.sin(t * 2.4) : 0.9 + 0.35 * charge,
      rim: [tint[0], tint[1], tint[2], bound ? 0.7 : 0.45 + 0.7 * charge],
      veins: [0, 0, 0, 0],
      veinColor: tint,
      flash: bound ? Math.exp(-bindAge * 6) * 0.8 : 0,
      mana: [stonePos[0], stonePos[1], 0, 1],
      relief: 2.0,
    }, loop)
    if (bound) {
      // 녹은 황동 테가 바깥에서 조여들며 스톤을 물립니다.
      const close = easeOut(bindAge / 0.35)
      const radius = side * 0.42 + (inlayHeight * 0.78 - side * 0.42) * close
      drawFx(fx, quad, camera, { mode: FX.ring, x: socket[0], y: socket[1], halfX: radius, halfY: radius, color: COLORS.gold, intensity: 0.75 + 0.7 * (1 - close) + flare * 0.4, params: [0.8, 0.07, 0, 0] }, loop)
    }

    this.particles.draw(camera, t)
    post.finish(quad, this.postEffect(t, loop, pt, socket))
  }

  // ---------- 내부 ----------

  private clock() {
    return performance.now() / 1000 - this.origin
  }

  private updateCamera(t: number, pt: number, focusX: number, focusY: number, aspect: number) {
    const camera = this.camera
    camera.aspect = aspect
    let zoom = 1
    let shakeX = 0
    let shakeY = 0
    let driftX = 0
    let driftY = 0
    if (!this.reduced && pt >= 0) {
      const bindAge = pt - ENGRAVE_TIMING.bind
      zoom += 0.045 * smooth(pt / ENGRAVE_TIMING.gather) - (bindAge > 0 ? 0.02 * smooth(bindAge / 1.2) : 0)
      if (bindAge >= 0 && bindAge < 1.5) {
        const punch = bindAge < 0.06 ? bindAge / 0.06 : Math.exp(-(bindAge - 0.06) * 3.2)
        zoom += 0.07 * punch
        const shake = 0.03 * Math.exp(-bindAge * 6)
        shakeX = shake * (Math.sin(bindAge * 97.3) + 0.5 * Math.sin(bindAge * 41.1))
        shakeY = shake * (Math.cos(bindAge * 83.9) + 0.5 * Math.cos(bindAge * 57.7))
      }
      driftX = Math.sin(t * 0.21) * 0.01
      driftY = Math.sin(t * 0.17 + 0.7) * 0.008
    }
    // 곡괭이 자리를 중심으로 확대해 아래 문구와 어긋나지 않게 합니다.
    camera.zoom = zoom
    camera.x = focusX * (1 - 1 / zoom) + driftX
    camera.y = focusY * (1 - 1 / zoom) + driftY
    camera.roll = 0
    camera.shakeX = shakeX
    camera.shakeY = shakeY
  }

  private fireEvents(t: number, pt: number, hover: Vec2, stonePos: Vec2, socket: Vec2, side: number) {
    if (pt < 0 || this.reduced) return
    const tint = this.art.tint
    const { bind, gather, settle } = ENGRAVE_TIMING
    if (!this.gatherFired && pt >= 0.15) {
      this.gatherFired = true
      // 사방에서 마력 알갱이가 소용돌이치며 스톤으로 모여듭니다.
      for (let index = 0; index < 34; index += 1) {
        const angle = Math.random() * Math.PI * 2
        const radius = randomBetween(0.32, 0.8) * side
        this.particles.emit({
          x: hover[0],
          y: hover[1],
          vx: Math.cos(angle) * radius,
          vy: Math.sin(angle) * radius,
          life: randomBetween(0.8, 1.15),
          size: randomBetween(0.009, 0.017),
          kind: PARTICLE.converge,
          color: index % 4 === 0 ? COLORS.gold : mixRgb(tint, [1, 1, 1], 0.25),
          birth: t + index * 0.018,
        })
      }
    }
    if (pt >= gather && pt < bind && t - this.lastTrail > 0.016) {
      this.lastTrail = t
      sprayParticles(this.particles, stonePos, Math.PI / 2, { count: 3, kind: PARTICLE.spark, speed: [0.1, 0.5], spread: Math.PI, life: [0.25, 0.45], size: [0.006, 0.01], colors: [mixRgb(tint, [1, 1, 1], 0.3), COLORS.gold], around: true }, t)
    }
    if (!this.bindFired && pt >= bind) {
      this.bindFired = true
      sprayParticles(this.particles, socket, 0, { count: 44, kind: PARTICLE.spark, speed: [1.0, 3.0], spread: Math.PI, life: [0.35, 0.75], size: [0.008, 0.012], colors: [COLORS.hot, COLORS.gold], lift: 0.3, around: true }, t)
      sprayParticles(this.particles, socket, 0, { count: 26, kind: PARTICLE.shard, speed: [0.6, 1.8], spread: Math.PI, life: [0.6, 1.1], size: [0.014, 0.024], colors: [tint, [0.92, 1, 0.98]], lift: 0.4, around: true }, t)
      sprayParticles(this.particles, socket, 0, { count: 18, kind: PARTICLE.orbit, speed: [0.12, 0.28], spread: Math.PI, life: [0.8, 1.2], size: [0.009, 0.014], colors: [COLORS.gold], around: true }, t)
      sprayParticles(this.particles, socket, Math.PI / 2, { count: 16, kind: PARTICLE.ember, speed: [0.2, 0.7], spread: 1.2, life: [1.2, 2.0], size: [0.009, 0.015], colors: [tint, COLORS.gold] }, t)
    }
    if (pt >= settle && t - this.lastEmber > 0.28) {
      this.lastEmber = t
      this.particles.emit({
        x: socket[0] + (Math.random() - 0.5) * side * 0.3,
        y: socket[1] + (Math.random() - 0.5) * side * 0.15,
        vx: (Math.random() - 0.5) * 0.12,
        vy: randomBetween(0.15, 0.35),
        life: randomBetween(1.4, 2.2),
        size: randomBetween(0.007, 0.012),
        kind: PARTICLE.ember,
        color: Math.random() > 0.3 ? tint : COLORS.gold,
        birth: t,
      })
    }
  }

  private drawSprite(gl: WebGLRenderingContext, quad: QuadMesh, texture: WebGLTexture | null, textureSize: number, x: number, y: number, halfX: number, halfY: number, rotation: number, look: SpriteLook, loop: number) {
    const sprite = this.spriteProgram
    if (!sprite) return
    sprite.use()
    applyCamera(sprite, this.camera, 1)
    placeQuad(sprite, x, y, halfX, halfY, rotation)
    bindTexture(gl, sprite, texture)
    sprite.f2('uTexel', 1 / textureSize, 1 / textureSize)
    sprite.f3('uKeyLight', KEY_LIGHT[0], KEY_LIGHT[1], KEY_LIGHT[2])
    sprite.rgb('uKeyColor', KEY_COLOR)
    sprite.f3('uAmbient', 0.26, 0.25, 0.28)
    sprite.f4('uMana', look.mana[0], look.mana[1], look.mana[2], look.mana[3])
    sprite.rgb('uManaColor', this.art.tint)
    sprite.f1('uRelief', look.relief)
    sprite.f1('uExposure', look.exposure)
    sprite.f1('uSaturation', 1)
    sprite.f1('uOpacity', 1)
    sprite.f1('uFloorFade', 0)
    sprite.f4('uRim', look.rim[0], look.rim[1], look.rim[2], look.rim[3])
    sprite.f4('uVeins', look.veins[0], look.veins[1], look.veins[2], look.veins[3])
    sprite.rgb('uVeinColor', look.veinColor)
    sprite.f1('uFlash', look.flash)
    sprite.f1('uTime', loop)
    quad.draw(sprite)
  }

  // 스톤 그림(512px) 전체를 그리되, 실제 결정 경계의 가운데가 (x, y)에 오도록 맞춥니다.
  private drawStone(gl: WebGLRenderingContext, quad: QuadMesh, position: Vec2, height: number, rotation: number, look: SpriteLook, loop: number) {
    const textures = this.textures
    if (!textures) return
    const size = this.stoneImage.naturalWidth || 512
    const [left, top, right, bottom] = this.art.bounds
    const full = (height * size) / (bottom - top)
    const offsetX = (((left + right) / 2 - size / 2) / size) * full
    const offsetY = ((size / 2 - (top + bottom) / 2) / size) * full
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    this.drawSprite(gl, quad, textures.stone, size, position[0] - (offsetX * cos - offsetY * sin), position[1] - (offsetX * sin + offsetY * cos), full / 2, full / 2, rotation, look, loop)
  }

  private postEffect(t: number, loop: number, pt: number, socket: Vec2) {
    let wave: [number, number, number, number] = [0.5, 0.5, 0, 0]
    let flash: [number, number, number, number] = [0, 0, 0, 0]
    let aberration = 0
    const bindAge = pt - ENGRAVE_TIMING.bind
    if (pt >= 0 && bindAge >= 0 && bindAge < 2.2) {
      const [u, v] = worldToScreen(this.camera, socket[0], socket[1])
      const color = mixRgb(this.art.tint, COLORS.gold, 0.5)
      wave = [u, v, bindAge, this.reduced ? 0 : 1.3]
      flash = [color[0], color[1], color[2], Math.exp(-bindAge * 7) * (this.reduced ? 0.15 : 0.5)]
      aberration = this.reduced ? 0 : Math.exp(-bindAge * 5)
    }
    return { wave, flash, aberration, vignette: 0.66, grain: 0.035, fade: Math.min(1, t / 0.6), time: loop }
  }
}
