import monstersUrl from '../assets/monsters.png'
import { findMonster } from '../game'
import { atlasSpriteStyle, spriteBounds } from '../lib/sprites'

interface MonsterSpriteProps {
  monsterId: string
  size?: 'small' | 'medium' | 'large'
  className?: string
}

// 격자 경계에 걸친 몬스터도 실제 그림 영역으로 정렬합니다.
export function MonsterSprite({ monsterId, size = 'medium', className = '' }: MonsterSpriteProps) {
  const monster = findMonster(monsterId)
  // 시트 마지막 줄의 유령과 해골은 정의 순서와 반대로 그려져 있습니다.
  const spriteIndex = monsterId === 'miner_skeleton' ? 7 : monsterId === 'ghost' ? 6 : monster?.spriteIndex ?? 0

  return (
    <span
      className={`atlas-sprite monster-sprite monster-sprite--${size} ${className}`}
      role="img"
      aria-label={monster?.name ?? '몬스터'}
    >
      <span className="sprite-art" style={atlasSpriteStyle(monstersUrl, 1254, 1254, spriteBounds.monsters[spriteIndex])} />
    </span>
  )
}
