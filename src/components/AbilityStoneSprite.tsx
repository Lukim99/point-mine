import aquamarineUrl from '../assets/stones/ability-stone-0.webp'
import lapisUrl from '../assets/stones/ability-stone-1.webp'
import jadeUrl from '../assets/stones/ability-stone-2.webp'
import amethystUrl from '../assets/stones/ability-stone-3.webp'
import { atlasSpriteStyle } from '../lib/sprites'

const stones = [
  { url: aquamarineUrl, bounds: [119, 12, 394, 486] },
  { url: lapisUrl, bounds: [82, 45, 430, 467] },
  { url: jadeUrl, bounds: [134, 7, 379, 499] },
  { url: amethystUrl, bounds: [119, 8, 393, 499] },
] as const

interface AbilityStoneSpriteProps {
  variant?: number
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export function AbilityStoneSprite({ variant = 0, size = 'small', className = '' }: AbilityStoneSpriteProps) {
  const stone = stones[Math.abs(Math.floor(variant)) % stones.length]

  return (
    <span
      className={`atlas-sprite ability-stone-sprite ability-stone-sprite--${size} ${className}`}
      role="img"
      aria-label="어빌리티 스톤"
    >
      <span className="sprite-art" style={atlasSpriteStyle(stone.url, 512, 512, stone.bounds)} />
    </span>
  )
}
