import oresUrl from '../assets/ores.png'
import { ORES, type OreId } from '../game'
import '../OreSprite.css'

interface OreSpriteProps {
  oreId: string
  size?: 'small' | 'medium'
}

const CELL_WIDTH = 352
const CROP_SIZE = 192
const SHEET_WIDTH = 1408
const CROP_LEFT = [111, 94, 76, 59, 111, 94, 75, 58, 107, 90, 75, 65, 108, 90, 76, 65]
const SPRITE_INDEX_OVERRIDES: Partial<Record<OreId, number>> = {
  ruby: 13,
  emerald: 11,
}

export function OreSprite({ oreId, size = 'small' }: OreSpriteProps) {
  const oreIndex = Math.max(0, ORES.findIndex((ore) => ore.id === oreId))
  const spriteIndex = SPRITE_INDEX_OVERRIDES[oreId as OreId] ?? oreIndex
  const column = spriteIndex % 4
  const row = Math.floor(spriteIndex / 4)
  const ore = ORES[oreIndex]
  const cropStartX = column * CELL_WIDTH + CROP_LEFT[spriteIndex]
  const positionX = (cropStartX / (SHEET_WIDTH - CROP_SIZE)) * 100

  return (
    <span
      className={`ore-sprite ore-sprite--${size}`}
      style={{
        backgroundImage: `url(${oresUrl})`,
        backgroundPosition: `${positionX}% ${row * (100 / 3)}%`,
      }}
      role="img"
      aria-label={ore.name}
    />
  )
}
