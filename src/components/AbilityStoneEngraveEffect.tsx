import { useEffect, useRef, useState } from 'react'
import { abilityStoneTitle, findAbilityStoneOption, findPickaxe, type AbilityStoneInventoryItem } from '../game'
import { playSound } from '../lib/sound'
import { ENGRAVE_TIMING, engraveImageUrls, pickaxeArt, StoneEngraveScene, type FocusRect } from '../lib/stoneEngraveScene'
import { prefersReducedMotion } from '../lib/stoneGl'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { ArcaneGlyph } from './ArcaneParts'
import { PickaxeSprite } from './PickaxeSprite'
import { useStoneGl } from './useStoneGl'
import '../StoneForge.css'

interface AbilityStoneEngraveEffectProps {
  pickaxeId: string
  stone: AbilityStoneInventoryItem
  onClose: () => void
}

// idle: 장면 준비 중, gather: 스톤이 마력을 모아 내리꽂히는 중, bound: 결합 직후, done: 확인 가능
type RitePhase = 'idle' | 'gather' | 'bound' | 'done'

// WebGL 준비가 이보다 늦으면 정지 그림으로 먼저 의식을 시작합니다.
const START_GRACE = 900

const formatValue = (value: number, unit: string) => `${value > 0 ? '+' : ''}${Number.isInteger(value) ? value : value.toLocaleString('ko-KR')}${unit}`

export function AbilityStoneEngraveEffect({ pickaxeId, stone, onClose }: AbilityStoneEngraveEffectProps) {
  const pickaxe = findPickaxe(pickaxeId)
  const spriteIndex = pickaxe?.spriteIndex ?? 0
  const variant = Math.abs(Math.floor(stone.variant ?? 0)) % 4
  const socket = pickaxeArt(spriteIndex).socket
  const [reducedMotion] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState<RitePhase>('idle')
  const phaseRef = useRef<RitePhase>('idle')
  const overlayRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const timersRef = useRef<number[]>([])
  const startedAtRef = useRef<number | null>(null)
  const focusRectRef = useRef<FocusRect | null>(null)
  const primaryActionRef = useRef<() => void>(() => undefined)

  const { status, sceneRef } = useStoneGl(hostRef, `rite-${spriteIndex}-${variant}`, engraveImageUrls(variant), (images) => {
    const scene = new StoneEngraveScene(images, spriteIndex, variant, reducedMotion)
    if (focusRectRef.current) scene.setFocus(focusRectRef.current)
    // 장면이 늦게 준비되었다면 이미 흘러간 의식 시간에 맞춰 이어서 그립니다.
    if (startedAtRef.current !== null) {
      if (phaseRef.current === 'done') scene.skip()
      else scene.play((performance.now() - startedAtRef.current) / 1000)
    }
    return scene
  }, { maxPixels: 2_000_000 })

  const updatePhase = (next: RitePhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }

  // 시전음과 함께 의식을 시작하고, 결합 순간에 결합음을 냅니다. 장면의 시간표와 같은 값을 씁니다.
  useEffect(() => {
    if (startedAtRef.current !== null) return
    const begin = () => {
      if (startedAtRef.current !== null) return
      startedAtRef.current = performance.now()
      playSound('enchantCast')
      if (reducedMotion) {
        playSound('enchantReveal')
        phaseRef.current = 'done'
        setPhase('done')
        sceneRef.current?.skip()
        return
      }
      phaseRef.current = 'gather'
      setPhase('gather')
      sceneRef.current?.play(0)
      timersRef.current.push(window.setTimeout(() => {
        playSound('enchantReveal')
        phaseRef.current = 'bound'
        setPhase('bound')
      }, ENGRAVE_TIMING.bind * 1000))
      timersRef.current.push(window.setTimeout(() => {
        phaseRef.current = 'done'
        setPhase('done')
      }, ENGRAVE_TIMING.settle * 1000))
    }
    if (status !== 'loading') {
      begin()
      return
    }
    const graceTimer = window.setTimeout(begin, START_GRACE)
    return () => window.clearTimeout(graceTimer)
  }, [status, reducedMotion, sceneRef])

  // 닫힐 때 남은 시간표를 모두 정리합니다.
  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }, [])

  const skip = () => {
    clearTimers()
    if (phaseRef.current === 'idle' || phaseRef.current === 'gather') playSound('enchantReveal')
    startedAtRef.current ??= performance.now()
    updatePhase('done')
    sceneRef.current?.skip()
  }
  const handlePrimary = () => (phaseRef.current === 'done' ? onClose() : skip())

  useEffect(() => {
    primaryActionRef.current = handlePrimary
  })

  // 확인 버튼에 초점을 두고, 아래에 깔린 화면이 Esc·Tab을 받지 않도록 먼저 가로챕니다. 닫히면 초점을 돌려줍니다.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    confirmRef.current?.focus({ preventScroll: true })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        primaryActionRef.current()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        confirmRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [])

  // 곡괭이가 놓일 빈 자리(focus)를 장면에 알려 문구와 겹치지 않게 합니다. 스크롤·크기 변화에도 따라갑니다.
  useEffect(() => {
    const overlay = overlayRef.current
    const focus = focusRef.current
    const scroller = scrollRef.current
    if (!overlay || !focus || !scroller) return
    const update = () => {
      const box = overlay.getBoundingClientRect()
      const rect = focus.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const next = { x: (rect.left - box.left) / box.width, y: (rect.top - box.top) / box.height, w: rect.width / box.width, h: rect.height / box.height }
      focusRectRef.current = next
      sceneRef.current?.setFocus(next)
    }
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(overlay)
    observer?.observe(focus)
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [sceneRef])

  if (!pickaxe) return null

  const options = stone.options.map((option, index) => {
    const definition = findAbilityStoneOption(option.id)
    const active = Number(option.tier ?? 0) > 0
    return {
      key: `${option.id}-${index}`,
      positive: option.sign === 'positive',
      active,
      name: definition?.name ?? option.name ?? option.id,
      value: active ? formatValue(Number(option.value ?? option.effectValue ?? 0), definition?.unit ?? option.unit ?? '') : '미활성',
    }
  })
  const revealed = phase === 'bound' || phase === 'done'
  const announcement = phase === 'done'
    ? `${pickaxe.name}에 ${abilityStoneTitle(stone)}을 각인했습니다. ${options.map((option) => `${option.positive ? '이로운 효과' : '불리한 효과'} ${option.name} ${option.value}`).join(', ')}`
    : ''

  return (
    <div
      className={`sf-rite is-${phase} is-gl-${status} ${reducedMotion ? 'is-still' : ''} aw-variant-${variant}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sf-rite-title"
      ref={overlayRef}
    >
      <div className="sf-rite-canvas" ref={hostRef} aria-hidden="true" />
      <div className="sf-rite-scroll" ref={scrollRef}>
        <p className="sf-rite-kicker"><ArcaneGlyph name="gem" />어빌리티 스톤 각인</p>
        <div className="sf-rite-focus" ref={focusRef} aria-hidden="true">
          <div className="sf-rite-fallback">
            <span className="sf-rite-relic">
              <PickaxeSprite pickaxeId={pickaxe.id} size="large" />
              <span className="sf-rite-gem" style={{ left: `${socket[0] * 100}%`, top: `${socket[1] * 100}%` }}>
                <AbilityStoneSprite variant={stone.variant} size="medium" />
              </span>
            </span>
          </div>
        </div>
        <div className={`sf-rite-info ${revealed ? 'is-revealed' : ''}`}>
          <h2 className="sf-rite-title" id="sf-rite-title">{pickaxe.name}</h2>
          <p className="sf-rite-stone">{abilityStoneTitle(stone)}</p>
          <ul className="sf-rite-options">
            {options.map((option, index) => (
              <li
                className={`sf-rite-option ${option.positive ? 'is-positive' : 'is-negative'} ${option.active ? 'is-active' : 'is-dormant'}`}
                key={option.key}
                style={{ animationDelay: `${260 + index * 150}ms` }}
              >
                <span className="sf-rite-option-sign"><ArcaneGlyph name={option.positive ? 'spark' : 'warn'} />{option.positive ? '이로움' : '불리'}</span>
                <span className="sf-rite-option-name">{option.name}</span>
                <strong>{option.value}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="sf-rite-actions">
          <button className={`sf-rite-confirm ${phase === 'done' ? 'is-ready' : ''}`} type="button" onClick={handlePrimary} ref={confirmRef}>
            {phase === 'done' ? '확인' : '건너뛰기'}
          </button>
        </div>
      </div>
      <p className="aw-sr-only" aria-live="polite">{announcement}</p>
    </div>
  )
}
