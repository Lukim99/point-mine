import pickaxesUrl from '../assets/pickaxes.png'
import { findPickaxe } from '../game'
import { atlasSpriteStyle, spriteBounds } from '../lib/sprites'

interface PickaxeSpriteProps {
  pickaxeId: string
  size?: 'small' | 'medium' | 'large'
  className?: string
  enchanted?: boolean
}

export function PickaxeSprite({ pickaxeId, size = 'medium', className = '', enchanted = false }: PickaxeSpriteProps) {
  const pickaxe = findPickaxe(pickaxeId)
  const spriteIndex = pickaxe?.spriteIndex ?? 0

  return (
    <span
      className={`atlas-sprite pickaxe-sprite pickaxe-sprite--${size} ${enchanted ? 'pickaxe-sprite--enchanted' : ''} ${className}`}
      role="img"
      aria-label={pickaxe?.name ?? '곡괭이'}
    >
      <span className="sprite-art" style={atlasSpriteStyle(pickaxesUrl, 1254, 1254, spriteBounds.pickaxes[spriteIndex])} />
    </span>
  )
}
