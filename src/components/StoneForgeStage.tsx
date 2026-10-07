import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import rockUrl from '../assets/mine-rock.webp'
import { forgeImageUrls, StoneForgeScene, type ForgeSnapshot, type ForgeStrike } from '../lib/stoneForgeScene'
import { prefersReducedMotion } from '../lib/stoneGl'
import { AbilityStoneSprite } from './AbilityStoneSprite'
import { useStoneGl } from './useStoneGl'

interface StoneForgeStageProps {
  variant: number
  snapshot: ForgeSnapshot
  // 버튼을 누른 순간과 서버 판정이 도착한 순간을 각각 한 번씩 알립니다. 번호가 바뀔 때마다 연출을 다시 시작합니다.
  tap: { id: number; line: number } | null
  strike: (ForgeStrike & { id: number }) | null
  children?: ReactNode
}

// 세공대 장면을 그리는 무대입니다. WebGL을 쓸 수 없거나 준비 중일 때는 같은 구도의 정지 그림을 보여 줍니다.
export function StoneForgeStage({ variant, snapshot, tap, strike, children }: StoneForgeStageProps) {
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
