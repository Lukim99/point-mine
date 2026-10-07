import closedChestsUrl from '../assets/chests.png'
import openChestsUrl from '../assets/chests-open.png'
import '../ShopMobile.css'
import { atlasSpriteStyle, spriteBounds } from '../lib/sprites'

interface ChestSpriteProps {
  spriteIndex: number
  open?: boolean
  size?: 'card' | 'opening'
  className?: string
}

export function ChestSprite({ spriteIndex, open = false, size = 'card', className = '' }: ChestSpriteProps) {

  return (
    <span
      className={`atlas-sprite chest-sprite chest-sprite--${size} ${className}`}
      aria-hidden="true"
    >
      <span className="sprite-art" style={atlasSpriteStyle(open ? openChestsUrl : closedChestsUrl, 1254, 1254, (open ? spriteBounds.openChests : spriteBounds.chests)[spriteIndex])} />
    </span>
  )
}
