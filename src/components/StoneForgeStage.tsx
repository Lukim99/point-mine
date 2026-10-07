import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import rockUrl from '../assets/mine-rock.webp'
import { findPickaxe } from '../game'
import { engraveImageUrls, StoneEngraveScene } from '../lib/stoneEngraveScene'
import { forgeImageUrls, StoneForgeScene, type ForgeSnapshot, type ForgeStrike } from '../lib/stoneForgeScene'
import { prefersReducedMotion } from '../lib/stoneGl'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { PickaxeSprite } from './PickaxeSprite'
import { useStoneGl } from './useStoneGl'

interface StoneForgeStageProps {
  variant: number
  hostPickaxeId?: string
  snapshot: ForgeSnapshot
  // 버튼을 누른 순간과 서버 판정이 도착한 순간을 각각 한 번씩 알립니다. 번호가 바뀔 때마다 연출을 다시 시작합니다.
  tap: { id: number; line: number } | null
  strike: (ForgeStrike & { id: number }) | null
  children?: ReactNode
}

// 세공대 장면을 그리는 무대입니다. WebGL을 쓸 수 없거나 준비 중일 때는 같은 구도의 정지 그림을 보여 줍니다.
export function StoneForgeStage(props: StoneForgeStageProps) {
  return props.hostPickaxeId
    ? <EngravedStoneStage variant={props.variant} pickaxeId={props.hostPickaxeId}>{props.children}</EngravedStoneStage>
    : <FacetStoneStage {...props} />
}

// 각인된 스톤은 의식이 끝난 곡괭이 모습으로 보여 줍니다. 같은 WebGL 장면과 이미지 경계를 재사용합니다.
function EngravedStoneStage({ variant, pickaxeId, children }: { variant: number; pickaxeId: string; children?: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [reducedMotion] = useState(prefersReducedMotion)
  const { status } = useStoneGl(hostRef, `engraved-${pickaxeId}-${variant}`, engraveImageUrls(variant), (images) => {
    const scene = new StoneEngraveScene(images, findPickaxe(pickaxeId)?.spriteIndex ?? 0, variant, reducedMotion)
    scene.setFocus({ x: 0.08, y: 0.18, w: 0.84, h: 0.72 })
    scene.skip()
    return scene
  }, { maxPixels: 1_500_000 })

  return (
    <div className={`sf-stage is-${status}`}>
      <div className="sf-stage-fallback" aria-hidden="true">
        <span className="sf-fallback-pickaxe"><PickaxeSprite pickaxeId={pickaxeId} size="large" enchanted /></span>
      </div>
      <div className="sf-stage-canvas" ref={hostRef} />
      {children}
    </div>
  )
}

function FacetStoneStage({ variant, snapshot, tap, strike, children }: StoneForgeStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef(snapshot)
  const [reducedMotion] = useState(prefersReducedMotion)
  const { status, sceneRef } = useStoneGl(hostRef, `forge-${variant}`, forgeImageUrls(variant), (images) => {
    const scene = new StoneForgeScene(images, variant, reducedMotion)
    scene.sync(snapshotRef.current)
    return scene
  }, { maxPixels: 1_500_000 })

  useEffect(() => {
    if (tap) sceneRef.current?.tap(tap.line)
  }, [tap, sceneRef])

  useEffect(() => {
    if (strike) sceneRef.current?.strike(strike)
  }, [strike, sceneRef])

  useEffect(() => {
    snapshotRef.current = snapshot
    sceneRef.current?.sync(snapshot)
  })

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    sceneRef.current?.pointer(((event.clientX - bounds.left) / bounds.width) * 2 - 1, 1 - ((event.clientY - bounds.top) / bounds.height) * 2)
  }

  return (
    <div className={`sf-stage is-${status}`} onPointerMove={handlePointerMove} onPointerLeave={() => sceneRef.current?.pointer(0, 0)}>
      <div className="sf-stage-fallback" aria-hidden="true">
        <img className="sf-fallback-rock" src={rockUrl} alt="" draggable={false} />
        <span className={`sf-fallback-stone ${strike ? `is-${strike.tone}` : ''}`} key={strike?.id ?? 'idle'}>
          <AbilityStoneSprite variant={variant} size="large" />
        </span>
      </div>
      <div className="sf-stage-canvas" ref={hostRef} />
      {children}
    </div>
  )
}
