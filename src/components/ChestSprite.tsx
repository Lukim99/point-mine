import closedChestsUrl from '../assets/chests.png'
import openChestsUrl from '../assets/chests-open.png'
import '../ShopMobile.css'

interface ChestSpriteProps {
  spriteIndex: number
  open?: boolean
  size?: 'card' | 'opening'
  className?: string
}

export function ChestSprite({ spriteIndex, open = false, size = 'card', className = '' }: ChestSpriteProps) {
  const column = spriteIndex % 2
  const row = Math.floor(spriteIndex / 2)
  const needsBottomCrop = open && row === 0

  return (
    <span
      className={`chest-sprite chest-sprite--${size} ${className}`}
      style={{
        backgroundImage: `url(${open ? openChestsUrl : closedChestsUrl})`,
        backgroundPosition: `${column * 100}% ${row * 100}%`,
        backgroundSize: '200% 200%',
        clipPath: needsBottomCrop ? 'inset(0 0 8% 0)' : undefined,
      }}
      aria-hidden="true"
    />
  )
}
