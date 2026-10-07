import { useEffect, type CSSProperties } from 'react'
import { hasEngravedAbilityStone, isEnchanted, type PickaxeInventoryItem } from '../game'
import { playSound } from '../lib/sound'
import { PickaxeSprite } from './PickaxeSprite'
import mineRockUrl from '../assets/mine-rock.webp'
import '../MiningStrike.css'

export const MINE_STRIKE_DURATION = 640
const IMPACT_AT = 280

// 파편마다 방향과 크기를 달리하되, 다시 그릴 때 위치가 임의로 바뀌지 않도록 고정합니다.
const CHIPS = [
  [-76, -37, 38, 5], [-52, -69, -58, 4], [-23, -87, 124, 3], [13, -73, 63, 5],
  [47, -54, -92, 4], [83, -23, 167, 3], [-88, 16, -134, 4], [72, 28, 92, 5],
  [-43, 40, 185, 3], [31, 45, -68, 4],
] as const

// 통신이 빨리 끝나도 끌어올림·타격·반동은 끝까지 재생합니다. 판정과 보상은 기존 서버 응답이 맡습니다.
export function MiningStrike({ pickaxe, sequence }: { pickaxe?: PickaxeInventoryItem; sequence: number }) {
  useEffect(() => {
    if (!sequence) return
    const timer = window.setTimeout(() => playSound('mineHit'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : IMPACT_AT)
    return () => window.clearTimeout(timer)
  }, [sequence])

  return (
    <div className="mine-strike-scene" aria-hidden="true" style={{ '--mine-strike-duration': `${MINE_STRIKE_DURATION}ms` } as CSSProperties}>
      <div className={`mine-strike-frame ${sequence ? 'has-struck' : ''}`} key={sequence}>
        <div className="mine-ground-shadow" />
        <div className="mine-strike-rock">
          <img src={mineRockUrl} width={960} height={640} alt="" draggable={false} />
          <span className="mine-vein-glow" />
        </div>
        {pickaxe && <>
          <svg className="mine-swing-trail" viewBox="0 0 360 280" preserveAspectRatio="none">
            <path className="mine-trail-wide" d="M258 32C350 73 329 181 177 195" />
            <path className="mine-trail-edge" d="M276 45C331 104 305 173 177 195" />
          </svg>
          <span className="mine-strike-tool"><PickaxeSprite pickaxeId={pickaxe.id} size="large" enchanted={isEnchanted(pickaxe) || hasEngravedAbilityStone(pickaxe)} /></span>
          {sequence > 0 && <span className="mine-impact">
            <span className="mine-impact-flash" />
            <span className="mine-impact-ring" />
            <span className="mine-impact-dust" />
            {CHIPS.map(([x, y, spin, size], index) => <i className={`mine-chip ${index % 3 === 0 ? 'is-spark' : ''}`} key={index} style={{ '--chip-x': `${x}px`, '--chip-y': `${y}px`, '--chip-spin': `${spin}deg`, '--chip-size': `${size}px` } as CSSProperties} />)}
          </span>}
        </>}
      </div>
    </div>
  )
}
