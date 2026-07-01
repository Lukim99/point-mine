import pickaxesUrl from '../assets/pickaxes.png'
import { findPickaxe } from '../game'

interface PickaxeSpriteProps {
  pickaxeId: string
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export function PickaxeSprite({ pickaxeId, size = 'medium', className = '' }: PickaxeSpriteProps) {
  const pickaxe = findPickaxe(pickaxeId)
  const spriteIndex = pickaxe?.spriteIndex ?? 0
  const column = spriteIndex % 4
  const row = Math.floor(spriteIndex / 4)

  return (
    <span
      className={`pickaxe-sprite pickaxe-sprite--${size} ${className}`}
      style={{
        backgroundImage: `url(${pickaxesUrl})`,
        backgroundPosition: `${column * (100 / 3)}% ${row * (100 / 3)}%`,
      }}
      role="img"
      aria-label={pickaxe?.name ?? '곡괭이'}
    />
  )
}
