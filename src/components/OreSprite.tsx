import oresUrl from '../assets/ores.png'
import { ORES, type OreId } from '../game'
import '../OreSprite.css'
import { atlasSpriteStyle, spriteBounds } from '../lib/sprites'

interface OreSpriteProps {
  oreId: string
  size?: 'small' | 'medium'
}

const SPRITE_INDEX_OVERRIDES: Partial<Record<OreId, number>> = {
  ruby: 13,
  emerald: 11,
}

export function OreSprite({ oreId, size = 'small' }: OreSpriteProps) {
  const oreIndex = Math.max(0, ORES.findIndex((ore) => ore.id === oreId))
  const spriteIndex = SPRITE_INDEX_OVERRIDES[oreId as OreId] ?? oreIndex
  const ore = ORES[oreIndex]

  return (
    <span
      className={`atlas-sprite ore-sprite ore-sprite--${size}`}
      role="img"
      aria-label={ore.name}
    >
      <span className="sprite-art" style={atlasSpriteStyle(oresUrl, 1408, 768, spriteBounds.ores[spriteIndex])} />
    </span>
  )
}
