import monstersUrl from '../assets/monsters.png'
import { findMonster } from '../game'

interface MonsterSpriteProps {
  monsterId: string
  size?: 'small' | 'medium' | 'large'
  className?: string
}

// monsters.png는 3x3 격자로, spriteIndex를 열/행으로 환산해 배경 위치를 잡습니다.
export function MonsterSprite({ monsterId, size = 'medium', className = '' }: MonsterSpriteProps) {
  const monster = findMonster(monsterId)
  const spriteIndex = monster?.spriteIndex ?? 0
  const column = spriteIndex % 3
  const row = Math.floor(spriteIndex / 3)

  return (
    <span
      className={`monster-sprite monster-sprite--${size} ${className}`}
      style={{
        backgroundImage: `url(${monstersUrl})`,
        backgroundPosition: `${column * (100 / 2)}% ${row * (100 / 2)}%`,
      }}
      role="img"
      aria-label={monster?.name ?? '몬스터'}
    />
  )
}
