import abilityStonesUrl from '../assets/ability-stones.png'

interface AbilityStoneSpriteProps {
  variant?: number
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export function AbilityStoneSprite({ variant = 0, size = 'small', className = '' }: AbilityStoneSpriteProps) {
  const column = Math.abs(Math.floor(variant)) % 4

  return (
    <span
      className={`ability-stone-sprite ability-stone-sprite--${size} ${className}`}
      style={{
        backgroundImage: `url(${abilityStonesUrl})`,
        backgroundPosition: `${column * (100 / 3)}% 0%`,
      }}
      role="img"
      aria-label="어빌리티 스톤"
    />
  )
}
