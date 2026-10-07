import backdropUrl from '../assets/bg_pc.png'
import rockUrl from '../assets/mine-rock.webp'
import type { AbilityStoneSign } from '../game'
import {
  BACKDROP_FS,
  COLORS,
  FORGE_STONE_FS,
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
  type Camera,
  type GlScene,
  type Rgb,
  type SprayOptions,
  type StoneArt,
  type Vec2,
} from './stoneGl'

// 「세공대」 장면: 갱도 벽 앞, 광맥 바위 작업대 위에 놓인 원석을 끌로 두드려 세공합니다.
// 줄마다 스톤의 정해진 자리를 치고, 결과는 그 자리에 결정면(성공)·균열(실패)·진사 침식(불리 성공)·봉인(회피)으로 남습니다.

export type ForgeTone = 'boon' | 'ash' | 'bane' | 'relief'
export interface ForgeLine { sign: AbilityStoneSign; successes: number; failures: number }
export interface ForgeSnapshot { lines: ForgeLine[]; chance: number; progress: number; faceted: boolean; aim: number | null; pending: number | null }
export interface ForgeStrike { line: number; tone: ForgeTone; tier: boolean; completed: boolean }

export const forgeImageUrls = (variant: number): string[] => [backdropUrl, rockUrl, stoneArt(variant).url]

const MAX_LINES = 3
// 버튼을 누른 뒤 끌이 처음 닿는 순간과, 판정을 받은 뒤 내려치는 순간(초)
const TAP_CONTACT = 0.07
const STRIKE_CONTACT = 0.055
const STRIKE_HOLD = 0.85
const CHISEL_HALF = 0.4
const CHISEL_WIDTH = 0.045
const MARKER_HALF = 0.075
const REST_ANGLE = Math.PI - 0.08
const KEY_LIGHT = [-1.5, 1.15, 1.3] as const
const KEY_COLOR: Rgb = [1.0, 0.8, 0.58]
const LIGHT_DIR: Vec2 = [-0.55, 0.83]

const TONE_INDEX: Record<ForgeTone, number> = { boon: 0, ash: 1, bane: 2, relief: 3 }
const TONE_COLOR: Record<ForgeTone, Rgb> = {
  boon: [0.7, 0.98, 0.62],
  ash: [0.6, 0.5, 0.4],
  bane: [1.0, 0.38, 0.24],
  relief: [0.42, 0.95, 0.86],
}
// 판정별 손맛: 흔들림·충격파·섬광·색 번짐 세기
const TONE_FORCE: Record<ForgeTone, { shake: number; wave: number; flash: number; aberration: number }> = {
  boon: { shake: 0.011, wave: 1.0, flash: 0.34, aberration: 0.45 },
  ash: { shake: 0.022, wave: 0.55, flash: 0.14, aberration: 0.2 },
  bane: { shake: 0.02, wave: 1.1, flash: 0.36, aberration: 0.9 },
  relief: { shake: 0.008, wave: 0.7, flash: 0.26, aberration: 0.3 },
}

interface Box { x: number; y: number; hw: number; hh: number }
interface LineShown { successes: number; failures: number; tries: number; aim: number }
interface Impact extends ForgeStrike { at: number; startedAt: number }

const wrapAngle = (angle: number) => {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

export class StoneForgeScene implements GlScene {
  private readonly backdrop: HTMLImageElement
  private readonly rockImage: HTMLImageElement
  private readonly stoneImage: HTMLImageElement
  private readonly art: StoneArt
  private readonly reduced: boolean
  private readonly origin = performance.now() / 1000
  private readonly particles = new ParticleField(560)
  private readonly camera: Camera = createCamera()
  private readonly lineData = new Float32Array(MAX_LINES * 4)
  private readonly stateData = new Float32Array(MAX_LINES * 4)
  private readonly shown: LineShown[] = Array.from({ length: MAX_LINES }, () => ({ successes: 0, failures: 0, tries: 0, aim: 0 }))
  private readonly stone: Box
  private readonly rock: Box
  private readonly crop: [number, number, number, number]
  private readonly cropAspect: number
  private readonly restTip: Vec2

  private gl: WebGLRenderingContext | null = null
  private quad: QuadMesh | null = null
  private backdropProgram: GlProgram | null = null
  private spriteProgram: GlProgram | null = null
  private stoneProgram: GlProgram | null = null
  private fxProgram: GlProgram | null = null
  private post: PostPass | null = null
  private textures: { backdrop: WebGLTexture | null; rock: WebGLTexture | null; stone: WebGLTexture | null } | null = null
  private sources: { backdrop: TexImageSource; rock: TexImageSource; stone: TexImageSource } | null = null
  private width = 1
  private height = 1

  private target: ForgeSnapshot = { lines: [], chance: 75, progress: 0, faceted: false, aim: null, pending: null }
  private synced = false
  private holdUntil = 0
  private progressShown = 0
  private chanceShown = 1
  private completeShown = 0
  private sweepStart = -1
  private impact: Impact | null = null
  private tapAt = -10
  private chiselBase: Vec2
  private chiselAngle = REST_ANGLE
  private lastChiselTime = 0
  private pointerTarget: Vec2 = [0, 0]
  private pointerShown: Vec2 = [0, 0]

  constructor(images: HTMLImageElement[], variant: number, reducedMotion: boolean) {
    const [backdrop, rock, stone] = images
    this.backdrop = backdrop
    this.rockImage = rock
    this.stoneImage = stone
    this.art = stoneArt(variant)
    this.reduced = reducedMotion

    // 스톤은 바위 작업대 꼭대기(월드 y = -0.5)에 물림쇠를 딛고 섭니다.
    const [left, top, right, bottom] = this.art.bounds
    const size = stone.naturalWidth || 512
    this.crop = [left / size, top / size, right / size, bottom / size]
    const ratio = (right - left) / (bottom - top)
    this.cropAspect = ratio
    const height = ratio > 0.7 ? 0.98 : 1.1
    this.stone = { x: 0, y: -0.5 + height / 2, hw: (height * ratio) / 2, hh: height / 2 }
    const rockWidth = 1.75
    const rockHeight = rockWidth * (rock.naturalHeight / Math.max(1, rock.naturalWidth))
    this.rock = { x: 0, y: -0.5 + rockHeight * (0.234 - 0.5), hw: rockWidth / 2, hh: rockHeight / 2 }
    // 쉬는 끌은 스톤 오른쪽 바위 턱에 눕혀 둡니다.
    this.restTip = [this.stone.hw + 0.12, -0.53]
    this.chiselBase = [this.restTip[0], this.restTip[1]]
  }

  // ---------- 화면 쪽에서 부르는 조작 ----------

  sync(next: ForgeSnapshot) {
    this.target = next
    if (!this.synced) {
      // 처음 열 때는 지금 상태를 연출 없이 그대로 보여 줍니다.
      this.synced = true
      next.lines.slice(0, MAX_LINES).forEach((line, index) => {
        const shown = this.shown[index]
        shown.successes = line.successes
        shown.failures = line.failures
        shown.tries = line.successes + line.failures
      })
      this.progressShown = next.progress
      this.completeShown = next.faceted ? 1 : 0
      this.chanceShown = (next.chance - 25) / 50
    }
    // 판정 없이 대기가 풀리면(오류 등) 멈춰 둔 변화를 다시 흘려보냅니다.
    if (next.pending === null && this.holdUntil === Number.POSITIVE_INFINITY) this.holdUntil = 0
  }

  pointer(x: number, y: number) {
    this.pointerTarget = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))]
  }

  // 버튼을 누른 순간: 끌이 타격점에 가볍게 닿았다가 들어 올려져 판정을 기다립니다.
  tap(line: number) {
    const now = this.clock()
    this.tapAt = now
    this.holdUntil = Number.POSITIVE_INFINITY
    if (this.reduced || line >= MAX_LINES) return
    const anchor = this.anchorWorld(line)
    const away = this.handleDir(line)
    const contact = now + TAP_CONTACT
    this.spray(anchor, away, { count: 7, kind: PARTICLE.spark, speed: [0.8, 1.6], spread: 0.9, life: [0.18, 0.34], size: [0.005, 0.008], colors: [COLORS.hot] }, contact)
    if (this.progressShown < 0.95) this.spray(anchor, away, { count: 3, kind: PARTICLE.chip, speed: [0.4, 0.9], spread: 1.1, life: [0.5, 0.8], size: [0.008, 0.013], colors: [COLORS.rock] }, contact)
  }

  // 서버 판정을 받은 순간: 끌을 내려치고 판정에 맞는 파편·빛·충격을 터뜨립니다.
  strike(event: ForgeStrike) {
    const now = this.clock()
    const contact = this.reduced ? now : now + STRIKE_CONTACT
    this.impact = { ...event, at: contact, startedAt: now }
    this.holdUntil = contact
    if (event.completed) this.sweepStart = contact + 0.5
    if (event.line < MAX_LINES) this.burst(event, contact)
  }

  // ---------- GlScene ----------

  setup(gl: WebGLRenderingContext) {
    this.gl = gl
    prepareGlState(gl)
    this.quad = new QuadMesh(gl)
    this.backdropProgram = new GlProgram(gl, FULLSCREEN_VS, BACKDROP_FS)
    this.spriteProgram = new GlProgram(gl, SPRITE_VS, SPRITE_FS)
    this.stoneProgram = new GlProgram(gl, SPRITE_VS, FORGE_STONE_FS)
    this.fxProgram = new GlProgram(gl, SPRITE_VS, FX_FS)
    this.post = new PostPass(gl)
    this.particles.setup(gl)
    this.sources ??= {
      backdrop: fitToPot(this.backdrop, 1024, 512),
      rock: fitToPot(this.rockImage, 1024, 512),
      stone: isPotImage(this.stoneImage) ? this.stoneImage : fitToPot(this.stoneImage, 512, 512),
    }
    this.textures = {
      backdrop: createTexture(gl, this.sources.backdrop, true),
      rock: createTexture(gl, this.sources.rock, true),
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
    this.stoneProgram?.dispose()
    this.fxProgram?.dispose()
    if (this.textures) {
      gl.deleteTexture(this.textures.backdrop)
      gl.deleteTexture(this.textures.rock)
      gl.deleteTexture(this.textures.stone)
    }
    this.textures = null
    this.gl = null
  }

  render(time: number, dt: number) {
    const gl = this.gl
    const quad = this.quad
    const post = this.post
    const textures = this.textures
    if (!gl || !quad || !post || !textures || !this.backdropProgram || !this.spriteProgram || !this.stoneProgram || !this.fxProgram) return
    const t = time - this.origin
    // 셰이더의 순환 시간은 정밀도를 위해 10분마다 되감습니다.
    const loop = t % 600
    this.animate(t, dt)
    this.updateCamera(t)
    const camera = this.camera
    const tint = this.art.tint
    const pending = this.target.pending
    const aura = (0.2 + 0.3 * this.chanceShown) * (0.55 + 0.45 * this.progressShown) + 0.25 * this.completeShown
    const manaPower = 0.45 + aura * (pending !== null ? 1.4 : 1)
    const auraColor = mixRgb(tint, COLORS.gold, 0.35 * this.completeShown)

    post.begin()

    // 1. 갱도 배경
    const backdrop = this.backdropProgram
    backdrop.use()
    bindTexture(gl, backdrop, textures.backdrop)
    const plate = backdropPlate(this.backdrop, camera.aspect, 0.1)
    backdrop.f4('uPlate', plate[0], plate[1], plate[2], plate[3])
    backdrop.f4('uView', camera.x, camera.y, camera.zoom, camera.roll)
    backdrop.f2('uViewShake', camera.shakeX, camera.shakeY)
    backdrop.f1('uViewAspect', camera.aspect)
    backdrop.f1('uDepth', 0.35)
    backdrop.f1('uTime', loop)
    backdrop.f1('uDim', 0.42)
    backdrop.f1('uBlur', 0.0022)
    backdrop.f4('uMana', this.stone.x, this.stone.y, manaPower * 0.8, 1.1)
    backdrop.rgb('uManaColor', auraColor)
    backdrop.f1('uFlicker', this.reduced ? 0.25 : 1)
    backdrop.f1('uDust', this.reduced ? 0 : 1)
    backdrop.f3('uGrade', 1.0, 0.94, 0.86)
    quad.draw(backdrop)

    const fx = this.fxProgram
    const worldPerPixel = 2 / (this.height * camera.zoom)

    // 2. 스톤 뒤의 마력 기운 (확률이 높을수록 뜨겁고, 세공할수록 맑아집니다)
    drawFx(fx, quad, camera, { mode: FX.glow, x: this.stone.x, y: this.stone.y + 0.04, halfX: this.stone.hw * 2.6, halfY: this.stone.hh * 1.55, color: auraColor, intensity: aura * (pending !== null ? 1.3 : 1), params: [2.4, this.reduced ? 0 : 0.6, 0.25, 0] }, loop)

    // 3. 광맥 바위 작업대
    const sprite = this.spriteProgram
    sprite.use()
    applyCamera(sprite, camera, 1)
    placeQuad(sprite, this.rock.x, this.rock.y, this.rock.hw, this.rock.hh)
    bindTexture(gl, sprite, textures.rock)
    sprite.f2('uTexel', 1 / 1024, 1 / 512)
    sprite.f3('uKeyLight', KEY_LIGHT[0], KEY_LIGHT[1], KEY_LIGHT[2])
    sprite.rgb('uKeyColor', KEY_COLOR)
    sprite.f3('uAmbient', 0.2, 0.19, 0.2)
    sprite.f4('uMana', this.stone.x, this.stone.y - 0.25, manaPower, 0.75)
    sprite.rgb('uManaColor', auraColor)
    sprite.f1('uRelief', 3.0)
    sprite.f1('uExposure', 0.78)
    sprite.f1('uSaturation', 0.85)
    sprite.f1('uOpacity', 1)
    sprite.f1('uFloorFade', 0.85)
    sprite.f4('uRim', 0, 0, 0, 0)
    sprite.f4('uVeins', 0, 0, 0, 0)
    sprite.f3('uVeinColor', 0, 0, 0)
    sprite.f1('uFlash', 0)
    sprite.f1('uTime', loop)
    quad.draw(sprite)

    // 4. 물림쇠 아래 접지 그림자
    drawFx(fx, quad, camera, { mode: FX.shadow, x: this.stone.x, y: this.stone.y - this.stone.hh + 0.015, halfX: this.stone.hw * 1.25, halfY: 0.07, color: [0, 0, 0], intensity: 0.7, params: [0.2, 0, 0, 0] }, loop)

    // 5. 스톤
    this.drawStone(gl, quad, t, loop)

    // 6. 줄 표식(Ⅰ·Ⅱ·Ⅲ)과 타격 섬광
    this.drawMarkers(quad, t, loop, worldPerPixel)
    this.drawImpactFx(quad, t, loop)

    // 7. 끌과 파편
    this.drawChisel(quad, t, loop, worldPerPixel)
    this.particles.draw(camera, t)

    post.finish(quad, this.postEffect(t, loop))
  }

  // ---------- 상태 보간 ----------

  private clock() {
    return performance.now() / 1000 - this.origin
  }

  private animate(t: number, dt: number) {
    const follow = (rate: number) => 1 - Math.exp(-rate * dt)
    const advance = t >= this.holdUntil
    for (let index = 0; index < MAX_LINES; index += 1) {
      const line = this.target.lines[index]
      const shown = this.shown[index]
      if (line && advance) {
        shown.successes += (line.successes - shown.successes) * follow(7)
        shown.failures += (line.failures - shown.failures) * follow(7)
        shown.tries += (line.successes + line.failures - shown.tries) * follow(7)
      }
      const aimed = this.target.aim === index || this.target.pending === index ? 1 : 0
      shown.aim += (aimed - shown.aim) * follow(10)
    }
    if (advance) this.progressShown += (this.target.progress - this.progressShown) * follow(5)
    this.chanceShown += ((this.target.chance - 25) / 50 - this.chanceShown) * follow(4)
    if (this.sweepStart < 0 || t >= this.sweepStart) this.completeShown += ((this.target.faceted ? 1 : 0) - this.completeShown) * follow(2.2)
    const pointerFollow = follow(3)
    this.pointerShown[0] += (this.pointerTarget[0] - this.pointerShown[0]) * pointerFollow
    this.pointerShown[1] += (this.pointerTarget[1] - this.pointerShown[1]) * pointerFollow
  }

  private updateCamera(t: number) {
    const camera = this.camera
    camera.aspect = this.width / Math.max(1, this.height)
    let x = 0
    let y = 0.02
    let zoom = 1
    let roll = 0
    let shakeX = 0
    let shakeY = 0
    if (!this.reduced) {
      // 숨 쉬듯 느린 흔들림과 마우스를 따라가는 시차
      x += Math.sin(t * 0.23) * 0.012 + this.pointerShown[0] * 0.035
      y += Math.sin(t * 0.19 + 1.3) * 0.008 + this.pointerShown[1] * 0.02
      zoom += Math.sin(t * 0.17) * 0.004
      const impact = this.impact
      if (impact && impact.line < MAX_LINES) {
        const age = t - impact.at
        if (age >= 0 && age < 1.6) {
          const weight = impact.tier ? 1.45 : 1
          const punch = age < 0.07 ? age / 0.07 : Math.exp(-(age - 0.07) * 3.4)
          const [ax, ay] = this.anchorWorld(impact.line)
          zoom += 0.085 * punch * weight
          x += (ax - x) * 0.2 * punch
          y += (ay - y) * 0.2 * punch
          const shake = TONE_FORCE[impact.tone].shake * weight * Math.exp(-age * 7.5)
          shakeX = shake * (Math.sin(age * 93.1) + 0.5 * Math.sin(age * 51.7 + 1.1))
          shakeY = shake * (Math.cos(age * 81.3) + 0.5 * Math.sin(age * 63.9 + 2.3))
          if (impact.tone === 'bane') roll = 0.012 * Math.exp(-age * 4) * Math.sin(age * 31)
        }
      }
      if (this.sweepStart >= 0 && t >= this.sweepStart) {
        // 세공 완료: 스톤 쪽으로 천천히 다가갔다가 물러납니다.
        const age = t - this.sweepStart
        const push = smooth(age / 1.4) * (age < 3.2 ? 1 : Math.exp(-(age - 3.2) * 1.5))
        zoom += 0.07 * push
        y += (this.stone.y - y) * 0.12 * push
      }
    }
    camera.x = x
    camera.y = y
    camera.zoom = zoom
    camera.roll = roll
    camera.shakeX = shakeX
    camera.shakeY = shakeY
  }

  // ---------- 좌표 ----------

  private anchorWorld(line: number): Vec2 {
    const [u, v] = this.art.anchors[Math.min(line, MAX_LINES - 1)]
    return [this.stone.x + (u - 0.5) * 2 * this.stone.hw, this.stone.y + (0.5 - v) * 2 * this.stone.hh]
  }

  // 끌 자루가 놓이는 방향: 타격점에서 스톤 바깥쪽(좌우)과 위쪽으로 뻗어 결정면을 가리지 않습니다.
  private handleDir(line: number): Vec2 {
    const [ax, ay] = this.anchorWorld(line)
    const offset = ax - this.stone.x
    const dx = offset + (offset >= 0 ? 1 : -1) * this.stone.hw * 0.9
    const dy = ay - (this.stone.y - this.stone.hh * 0.3)
    const length = Math.hypot(dx, dy) || 1
    return [dx / length, dy / length]
  }

  // ---------- 그리기 ----------

  private drawStone(gl: WebGLRenderingContext, quad: QuadMesh, t: number, loop: number) {
    const program = this.stoneProgram
    const textures = this.textures
    if (!program || !textures) return
    program.use()
    applyCamera(program, this.camera, 1)
    placeQuad(program, this.stone.x, this.stone.y, this.stone.hw, this.stone.hh, 0, this.crop)
    bindTexture(gl, program, textures.stone)
    const size = this.stoneImage.naturalWidth || 512
    program.f2('uTexel', 1.5 / size, 1.5 / size)
    program.f3('uKeyLight', KEY_LIGHT[0], KEY_LIGHT[1], KEY_LIGHT[2])
    program.rgb('uKeyColor', KEY_COLOR)
    program.rgb('uTint', this.art.tint)
    for (let index = 0; index < MAX_LINES; index += 1) {
      const line = this.target.lines[index]
      const shown = this.shown[index]
      const [u, v] = this.art.anchors[index]
      const offset = index * 4
      this.lineData[offset] = u
      this.lineData[offset + 1] = v
      this.lineData[offset + 2] = line?.sign === 'negative' ? -1 : 1
      this.lineData[offset + 3] = line ? 1 : 0
      this.stateData[offset] = shown.successes
      this.stateData[offset + 1] = shown.failures
      this.stateData[offset + 2] = shown.tries
      this.stateData[offset + 3] = this.reduced ? shown.aim * 0.6 : shown.aim
    }
    program.v4('uLines', this.lineData)
    program.v4('uLineState', this.stateData)
    const impact = this.impact
    const age = impact ? t - impact.at : -1
    if (impact && impact.line < MAX_LINES && age >= 0) {
      const [u, v] = this.art.anchors[impact.line]
      program.f4('uImpact', u, v, age, TONE_INDEX[impact.tone])
      program.rgb('uImpactColor', impact.tier ? mixRgb(TONE_COLOR[impact.tone], COLORS.gold, impact.tone === 'boon' ? 0.5 : 0.2) : TONE_COLOR[impact.tone])
    } else {
      program.f4('uImpact', 0, 0, 99, 0)
      program.f3('uImpactColor', 0, 0, 0)
    }
    const pending = this.target.pending
    if (pending !== null && pending < MAX_LINES && t - this.tapAt > TAP_CONTACT) {
      const [u, v] = this.art.anchors[pending]
      program.f4('uCharge', u, v, 0.55, 0)
    } else {
      program.f4('uCharge', 0, 0, 0, 0)
    }
    program.f1('uProgress', this.progressShown)
    program.f1('uComplete', this.completeShown)
    const sweepAge = this.sweepStart >= 0 ? (t - this.sweepStart) / 1.3 : -1
    program.f1('uSweep', sweepAge > 0 && sweepAge < 1 ? sweepAge : 0)
    program.f1('uCropAspect', this.cropAspect)
    program.f1('uTime', loop)
    program.f1('uSheen', this.reduced ? 0 : 1)
    quad.draw(program)
  }

  private drawMarkers(quad: QuadMesh, t: number, loop: number, worldPerPixel: number) {
    const fx = this.fxProgram
    if (!fx) return
    const impact = this.impact
    this.target.lines.slice(0, MAX_LINES).forEach((line, index) => {
      const shown = this.shown[index]
      const [x, y] = this.anchorWorld(index)
      const striking = impact && impact.line === index && t - impact.startedAt < STRIKE_HOLD ? 0.2 : 1
      const done = line.successes + line.failures >= 10 ? 0.55 : 1
      const color = line.sign === 'negative' ? COLORS.cinnabar : COLORS.jade
      drawFx(fx, quad, this.camera, {
        mode: FX.marker,
        x,
        y,
        halfX: MARKER_HALF,
        halfY: MARKER_HALF,
        color,
        intensity: (0.62 + 0.38 * shown.aim) * striking * done,
        params: [index + 1, shown.aim, 1.7, 0],
        pixel: worldPerPixel / MARKER_HALF,
      }, loop)
    })
  }

  private drawImpactFx(quad: QuadMesh, t: number, loop: number) {
    const fx = this.fxProgram
    const impact = this.impact
    if (!fx) return
    if (impact && impact.line < MAX_LINES) {
      const age = t - impact.at
      if (age >= 0 && age < 1.4) {
        const [x, y] = this.anchorWorld(impact.line)
        const color = TONE_COLOR[impact.tone]
        const weight = impact.tier ? 1.4 : 1
        const flash = impact.tone === 'ash' ? 0.55 : 1.25
        drawFx(fx, quad, this.camera, { mode: FX.glow, x, y, halfX: 0.42 * (1 + age * 0.6), halfY: 0.42 * (1 + age * 0.6), color, intensity: Math.exp(-age * 5.5) * flash * weight, params: [3.5, 0, 0, 0] }, loop)
        if (!this.reduced && impact.tone !== 'ash') {
          drawFx(fx, quad, this.camera, { mode: FX.ring, x, y, halfX: 0.6, halfY: 0.6, color, intensity: Math.exp(-age * 3.2) * 0.9 * weight, params: [Math.min(0.88, age * 1.7), 0.05, 0, 0] }, loop)
        }
        if (!this.reduced && impact.tier && age > 0.08) {
          const late = age - 0.08
          drawFx(fx, quad, this.camera, { mode: FX.ring, x, y, halfX: 0.95, halfY: 0.95, color: impact.tone === 'bane' ? COLORS.cinnabar : COLORS.gold, intensity: Math.exp(-late * 2.6) * 1.1, params: [Math.min(0.88, late * 1.4), 0.04, 0, 0] }, loop)
        }
      }
    }
    if (this.sweepStart >= 0 && t >= this.sweepStart) {
      const age = t - this.sweepStart
      if (age < 2.6) {
        drawFx(fx, quad, this.camera, { mode: FX.glow, x: this.stone.x, y: this.stone.y, halfX: this.stone.hw * 3.2, halfY: this.stone.hh * 1.9, color: COLORS.gold, intensity: Math.sin(Math.min(1, age / 0.5) * Math.PI * 0.5) * Math.exp(-age * 1.2) * 1.3, params: [2.2, 0, 0, 0] }, loop)
        if (!this.reduced) drawFx(fx, quad, this.camera, { mode: FX.ring, x: this.stone.x, y: this.stone.y, halfX: 1.4, halfY: 1.4, color: COLORS.gold, intensity: Math.exp(-age * 1.8) * 1.2, params: [Math.min(0.88, age * 0.75), 0.035, 0, 0] }, loop)
      }
    }
  }

  private chiselGap(t: number, line: number): number {
    const impact = this.impact
    if (impact && impact.line === line && t - impact.startedAt < STRIKE_HOLD) {
      const s = t - impact.startedAt
      if (s < STRIKE_CONTACT) {
        const k = s / STRIKE_CONTACT
        return 0.13 * (1 - k * k)
      }
      const r = s - STRIKE_CONTACT
      const bounce = 0.014 * Math.abs(Math.sin(r * 26)) * Math.exp(-r * 8)
      return r < 0.32 ? bounce : bounce + 0.085 * smooth((r - 0.32) / 0.45)
    }
    if (this.target.pending === line) {
      const s = t - this.tapAt
      if (s < TAP_CONTACT) return 0.085 * (1 - s / TAP_CONTACT)
      if (s < TAP_CONTACT + 0.22) return 0.13 * easeOut((s - TAP_CONTACT) / 0.22)
      return 0.13 + Math.sin(t * 61) * 0.0035
    }
    return 0.085 + Math.sin(t * 2.6) * 0.008
  }

  private activeLine(t: number): number | null {
    const impact = this.impact
    if (impact && t - impact.startedAt < STRIKE_HOLD) return impact.line
    if (this.target.pending !== null) return this.target.pending
    return this.target.aim
  }

  private drawChisel(quad: QuadMesh, t: number, loop: number, worldPerPixel: number) {
    const fx = this.fxProgram
    if (!fx) return
    const line = this.reduced ? null : this.activeLine(t)
    let targetTip = this.restTip
    let targetAngle = REST_ANGLE
    let gap = 0
    if (line !== null && line < MAX_LINES && line < this.target.lines.length) {
      const [hx, hy] = this.handleDir(line)
      targetTip = this.anchorWorld(line)
      targetAngle = Math.atan2(-hy, -hx)
      gap = this.chiselGap(t, line)
    }
    const dt = Math.min(0.05, Math.max(0.001, t - this.lastChiselTime))
    this.lastChiselTime = t
    const follow = this.reduced ? 1 : 1 - Math.exp(-dt * 13)
    this.chiselBase[0] += (targetTip[0] - this.chiselBase[0]) * follow
    this.chiselBase[1] += (targetTip[1] - this.chiselBase[1]) * follow
    this.chiselAngle += wrapAngle(targetAngle - this.chiselAngle) * follow
    const dirX = Math.cos(this.chiselAngle)
    const dirY = Math.sin(this.chiselAngle)
    const tipX = this.chiselBase[0] - dirX * gap
    const tipY = this.chiselBase[1] - dirY * gap
    // 국소 +y 면이 등불을 향할수록 그쪽이 밝습니다.
    const facing = -dirY * LIGHT_DIR[0] + dirX * LIGHT_DIR[1]
    const impact = this.impact
    const heatAge = impact ? t - impact.at : -1
    const heat = heatAge >= 0 ? Math.exp(-heatAge * 3.2) * (impact?.tone === 'ash' ? 0.9 : 0.6) : 0
    const charging = this.target.pending !== null && t - this.tapAt > TAP_CONTACT + 0.1
    const charge = charging ? 0.55 + 0.45 * Math.sin(t * 18) : 0
    drawFx(fx, quad, this.camera, {
      mode: FX.chisel,
      x: tipX - dirX * CHISEL_HALF,
      y: tipY - dirY * CHISEL_HALF,
      halfX: CHISEL_HALF,
      halfY: CHISEL_WIDTH,
      rotation: this.chiselAngle,
      color: this.art.tint,
      intensity: 1,
      params: [facing, heat, charge, 0],
      scale: [CHISEL_HALF, CHISEL_WIDTH],
      pixel: worldPerPixel,
    }, loop, 1.04)
  }

  private postEffect(t: number, loop: number) {
    const impact = this.impact
    let wave: [number, number, number, number] = [0.5, 0.5, 0, 0]
    let flash: [number, number, number, number] = [0, 0, 0, 0]
    let aberration = 0
    if (impact && impact.line < MAX_LINES) {
      const age = t - impact.at
      if (age >= 0 && age < 2) {
        const force = TONE_FORCE[impact.tone]
        const weight = impact.tier ? 1.35 : 1
        const [x, y] = this.anchorWorld(impact.line)
        const [u, v] = worldToScreen(this.camera, x, y)
        const color = TONE_COLOR[impact.tone]
        wave = [u, v, age, this.reduced ? 0 : force.wave * weight]
        flash = [color[0], color[1], color[2], Math.exp(-age * 8) * (this.reduced ? 0.12 : force.flash) * weight]
        aberration = this.reduced ? 0 : Math.exp(-age * 6) * force.aberration * weight
      }
    }
    if (this.sweepStart >= 0 && t >= this.sweepStart) {
      const age = t - this.sweepStart
      if (age < 2) {
        const [u, v] = worldToScreen(this.camera, this.stone.x, this.stone.y)
        if (!this.reduced && wave[3] === 0) wave = [u, v, age * 0.8, 0.8]
        flash = [COLORS.gold[0], COLORS.gold[1], COLORS.gold[2], Math.max(flash[3], Math.exp(-age * 2.5) * 0.32)]
      }
    }
    return { wave, flash, aberration, vignette: 0.58, grain: 0.03, fade: Math.min(1, t / 0.45), time: loop }
  }

  // ---------- 파편 ----------

  private spray(origin: Vec2, away: Vec2, options: SprayOptions, birth: number) {
    sprayParticles(this.particles, origin, Math.atan2(away[1], away[0]), options, birth)
  }

  private burst(event: ForgeStrike, at: number) {
    if (this.reduced) return
    const anchor = this.anchorWorld(event.line)
    const away = this.handleDir(event.line)
    const tint = this.art.tint
    const weight = event.tier ? 1.5 : 1
    const crust = 1 - this.progressShown
    this.spray(anchor, away, { count: Math.round(16 * weight), kind: PARTICLE.spark, speed: [1.4, 2.8], spread: 1.25, life: [0.3, 0.6], size: [0.007, 0.011], colors: [COLORS.hot, [1, 0.8, 0.45]], lift: 0.4 }, at)
    if (crust > 0.05) this.spray(anchor, away, { count: Math.round(5 + 10 * crust), kind: PARTICLE.chip, speed: [0.7, 1.5], spread: 1.5, life: [0.7, 1.1], size: [0.012, 0.022], colors: [COLORS.rock, [0.5, 0.45, 0.38]], lift: 0.5 }, at)
    switch (event.tone) {
      case 'boon':
        this.spray(anchor, away, { count: Math.round(18 * weight), kind: PARTICLE.shard, speed: [0.6, 1.6], spread: Math.PI, life: [0.6, 1.0], size: [0.014, 0.024], colors: [COLORS.jade, tint, [0.85, 1, 0.9]], lift: 0.5, around: true }, at)
        if (event.tier) this.spray(anchor, away, { count: 16, kind: PARTICLE.ember, speed: [0.3, 0.9], spread: Math.PI, life: [1.0, 1.6], size: [0.01, 0.016], colors: [COLORS.gold], lift: 0.3, around: true }, at + 0.05)
        break
      case 'ash':
        this.spray(anchor, away, { count: 10, kind: PARTICLE.dust, speed: [0.15, 0.5], spread: 1.6, life: [0.9, 1.5], size: [0.05, 0.09], colors: [COLORS.ash], lift: 0.1 }, at)
        this.spray(anchor, away, { count: 10, kind: PARTICLE.chip, speed: [0.6, 1.3], spread: 1.4, life: [0.7, 1.1], size: [0.01, 0.018], colors: [[0.3, 0.27, 0.24], COLORS.ash], lift: 0.3 }, at)
        break
      case 'bane':
        this.spray(anchor, away, { count: Math.round(24 * weight), kind: PARTICLE.ember, speed: [0.2, 0.8], spread: 1.3, life: [1.0, 1.8], size: [0.008, 0.016], colors: [COLORS.cinnabar, [1, 0.6, 0.4]], lift: 0.35 }, at)
        this.spray(anchor, away, { count: 10, kind: PARTICLE.spark, speed: [1.2, 2.2], spread: 1.0, life: [0.25, 0.45], size: [0.007, 0.01], colors: [COLORS.cinnabar] }, at)
        break
      case 'relief':
        this.spray(anchor, away, { count: 22, kind: PARTICLE.orbit, speed: [0.16, 0.3], spread: Math.PI, life: [0.8, 1.2], size: [0.009, 0.014], colors: [COLORS.ward, [0.8, 1, 0.96]], around: true }, at)
        this.spray(anchor, away, { count: 8, kind: PARTICLE.shard, speed: [0.5, 1.1], spread: 1.2, life: [0.5, 0.8], size: [0.012, 0.018], colors: [COLORS.ward], lift: 0.3 }, at)
        break
    }
    if (event.completed) {
      // 세공 완료: 스톤 전체에서 금빛 불씨가 피어오릅니다.
      for (let index = 0; index < 46; index += 1) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.sqrt(Math.random())
        this.particles.emit({
          x: this.stone.x + Math.cos(angle) * radius * this.stone.hw * 0.9,
          y: this.stone.y + Math.sin(angle) * radius * this.stone.hh * 0.85,
          vx: (Math.random() - 0.5) * 0.3,
          vy: randomBetween(0.2, 0.6),
          life: randomBetween(1.2, 2.2),
          size: randomBetween(0.008, 0.016),
          kind: PARTICLE.ember,
          color: index % 3 === 0 ? tint : COLORS.gold,
          birth: at + 0.5 + Math.random() * 0.6,
        })
      }
    }
  }
}
