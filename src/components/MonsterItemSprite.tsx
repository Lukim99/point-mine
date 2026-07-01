import monsterItemsUrl from '../assets/monster-items.png'
import { findMonsterItem } from '../game'

interface MonsterItemSpriteProps {
  itemId: string
  size?: 'small' | 'medium'
  className?: string
}

// monster-items.png는 2x2 격자로, spriteIndex를 열/행으로 환산해 배경 위치를 잡습니다.
export function MonsterItemSprite({ itemId, size = 'small', className = '' }: MonsterItemSpriteProps) {
  const item = findMonsterItem(itemId)
  const spriteIndex = item?.spriteIndex ?? 0
  const column = spriteIndex % 2
  const row = Math.floor(spriteIndex / 2)

  return (
    <span
      className={`monster-item-sprite monster-item-sprite--${size} ${className}`}
      style={{
        backgroundImage: `url(${monsterItemsUrl})`,
        backgroundPosition: `${column * 100}% ${row * 100}%`,
      }}
      role="img"
      aria-label={item?.name ?? '몬스터 아이템'}
    />
  )
}
