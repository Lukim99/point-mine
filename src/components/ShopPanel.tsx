import { useState } from 'react'
import { CHESTS, findPickaxe, type ChestDefinition, type ChestId } from '../game'
import { ChestSprite } from './ChestSprite'
import { Modal } from './Modal'

interface ShopPanelProps {
  balance: number
  busy: boolean
  onOpenChest: (chestId: ChestId) => void
}

const formatChance = (chance: number) => {
  const fractionDigits = chance % 1 === 0 ? 0 : (chance * 10) % 1 === 0 ? 1 : 2
  return `${chance.toFixed(fractionDigits)}%`
}

export function ShopPanel({ balance, busy, onOpenChest }: ShopPanelProps) {
  const [rateChest, setRateChest] = useState<ChestDefinition | null>(null)

  return (
    <section className="shop-panel" aria-labelledby="shop-title">
      <div className="shop-heading">
        <div>
          <span className="section-kicker">광부 조달소</span>
          <h2 id="shop-title">곡괭이 상점</h2>
          <p>상자를 열어 새로운 장비를 획득하세요.</p>
        </div>
        <div className="shop-balance"><span>사용 가능</span><strong>{balance.toLocaleString('ko-KR')} P</strong></div>
      </div>

      <div className="chest-shop-grid">
        {CHESTS.map((chest) => {
          const canBuy = balance >= chest.price
          return (
            <article className={`chest-card chest-card--${chest.id}`} key={chest.id}>
              <div className="chest-display">
                <span className="chest-aura" />
                <ChestSprite spriteIndex={chest.spriteIndex} />
              </div>
              <div className="chest-card-copy">
                <span className="chest-tier">{chest.id === 'normal' ? 'NORMAL SUPPLY' : 'PREMIUM SUPPLY'}</span>
                <h3>{chest.name}</h3>
                <p>{chest.description}</p>
                <button className="rate-button" type="button" onClick={() => setRateChest(chest)}>획득 확률 보기</button>
              </div>
              <button
                className="buy-chest-button"
                type="button"
                onClick={() => onOpenChest(chest.id)}
                disabled={busy || !canBuy}
              >
                <span>{busy ? '개봉 준비 중...' : canBuy ? '상자 구매 및 개봉' : '포인트 부족'}</span>
                <strong>{chest.price.toLocaleString('ko-KR')} P</strong>
              </button>
            </article>
          )
        })}
      </div>

      <p className="shop-footnote">중복 곡괭이는 기존 장비에 기본 내구도가 합산됩니다.</p>

      {rateChest && (
        <Modal title={`${rateChest.name} 확률`} onClose={() => setRateChest(null)} labelledBy="chest-rates-title">
          <div className="rate-table-wrap">
            <table className="rate-table">
              <thead><tr><th>곡괭이</th><th>기본 내구도</th><th>확률</th></tr></thead>
              <tbody>
                {rateChest.drops.map((drop) => {
                  const pickaxe = findPickaxe(drop.pickaxeId)
                  return (
                    <tr key={drop.pickaxeId}>
                      <td>{pickaxe?.name}</td>
                      <td>{pickaxe?.durability}</td>
                      <td>{formatChance(drop.chance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </section>
  )
}
