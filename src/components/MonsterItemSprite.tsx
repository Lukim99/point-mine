import monsterItemsUrl from '../assets/monster-items.png'
import { findMonsterItem } from '../game'
import { atlasSpriteStyle, spriteBounds } from '../lib/sprites'

interface MonsterItemSpriteProps {
  itemId: string
  size?: 'small' | 'medium'
  className?: string
}

// 아이템마다 다른 투명 여백을 제외하고 동일한 중심에 표시합니다.
export function MonsterItemSprite({ itemId, size = 'small', className = '' }: MonsterItemSpriteProps) {
  const item = findMonsterItem(itemId)
  const spriteIndex = item?.spriteIndex ?? 0

  return (
    <span
      className={`atlas-sprite monster-item-sprite monster-item-sprite--${size} ${className}`}
      role="img"
      aria-label={item?.name ?? '몬스터 아이템'}
    >
      <span className="sprite-art" style={atlasSpriteStyle(monsterItemsUrl, 1254, 1254, spriteBounds.monsterItems[spriteIndex])} />
    </span>
  )
}
