import type { PickaxeInventoryItem } from '../game'

export function Durability({ item }: { item: PickaxeInventoryItem }) {
  const ratio = Math.max(0, Math.min(100, (item.durability / item.maxDurability) * 100))

  return (
    <div className="durability" aria-label={`내구도 ${item.durability} / ${item.maxDurability}`}>
      <span style={{ width: `${ratio}%` }} />
    </div>
  )
}
