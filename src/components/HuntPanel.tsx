import { abilityStoneEffectValue, findMonster, findPickaxe, MONSTERS, type AbilityStoneInventoryItem, type AttackResult, type MonsterId, type PickaxeInventoryItem } from '../game'
import { MonsterSprite } from './MonsterSprite'
import { OreSprite } from './OreSprite'
import { MonsterItemSprite } from './MonsterItemSprite'

interface HuntPanelProps {
  equipped?: PickaxeInventoryItem
  abilityStone?: AbilityStoneInventoryItem | null
  floor: number
  huntMonster: MonsterId | null
  huntMonsterHp: number | null
  attacking: boolean
  lastAttack: AttackResult | null
  onAttack: () => void
}

// 현재 층 구간에 등장할 수 있는 몬스터 목록을 반환합니다.
const monstersForFloor = (floor: number) => MONSTERS.filter((monster) => floor >= monster.minFloor && floor <= monster.maxFloor)

export function HuntPanel({ equipped, abilityStone, floor, huntMonster, huntMonsterHp, attacking, lastAttack, onAttack }: HuntPanelProps) {
  const definition = equipped ? findPickaxe(equipped.id) : null
  const durabilityCost = 1 + (equipped?.enchants?.fragile ?? 0) + Math.max(0, abilityStoneEffectValue(abilityStone, 'durability_cost'))
  const attack = Math.max(1, (definition?.attack ?? 0) + (equipped?.enchants?.sharp ?? 0) - (equipped?.enchants?.weaken ?? 0) + abilityStoneEffectValue(abilityStone, 'attack'))
  const canAttack = Boolean(equipped && equipped.durability >= durabilityCost)
  const monster = huntMonster ? findMonster(huntMonster) : null
  const maxHp = monster?.maxHp ?? 0
  const currentHp = huntMonsterHp ?? maxHp
  const hpRatio = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0
  const candidates = monstersForFloor(floor)

  return (
    <section className="hunt-area" aria-labelledby="hunt-title">
      <div className="hunt-title-row">
        <div>
          <span className="section-kicker">지하 {floor}층 · 사냥터</span>
          <h2 id="hunt-title">{monster ? monster.name : '사냥 대기'}</h2>
        </div>
        <div className="hunt-candidates" aria-label="출현 몬스터">
          {candidates.map((entry) => (
            <span key={entry.id} className="hunt-candidate" title={entry.name}>
              <MonsterSprite monsterId={entry.id} size="small" />
            </span>
          ))}
        </div>
      </div>

      <div className={`hunt-stage ${attacking ? 'is-attacking' : ''}`}>
        <div className="cave-light" />
        {monster ? (
          <div className="hunt-monster" key={monster.id}>
            <MonsterSprite monsterId={monster.id} size="large" className="active-monster" />
            <div className="monster-hp" aria-label={`체력 ${currentHp} / ${maxHp}`}>
              <span style={{ width: `${hpRatio}%` }} />
            </div>
            <strong className="monster-hp-label">{currentHp} / {maxHp} HP</strong>
          </div>
        ) : (
          <p className="hunt-empty">공격을 시작하면 몬스터가 등장합니다.</p>
        )}

        {lastAttack?.status === 'success' && (
          <div className="hunt-result" key={`${lastAttack.monster_id}-${lastAttack.monster_hp}-${lastAttack.defeated}`}>
            <span className="hunt-damage">-{lastAttack.damage}</span>
            {(lastAttack.xp_gained ?? 0) > 0 && <small className="hunt-xp">+{lastAttack.xp_gained} EXP</small>}
            {lastAttack.floor_up && <em className="hunt-floor-up">지하 {lastAttack.mine_floor}층 도달!</em>}
            {lastAttack.defeated && (
              <div className="hunt-reward">
                <em>{findMonster(lastAttack.monster_id ?? '')?.name} 처치!</em>
                <div className="hunt-reward-list">
                  {(lastAttack.rewards ?? []).length === 0 ? (
                    <small>보상 없음</small>
                  ) : (
                    lastAttack.rewards?.map((reward, index) => (
                      <span className="hunt-reward-item" key={`${reward.kind}-${reward.id ?? 'mana'}-${index}`}>
                        {reward.kind === 'mineral' && <OreSprite oreId={reward.id ?? ''} />}
                        {reward.kind === 'monster_item' && <MonsterItemSprite itemId={reward.id ?? ''} />}
                        {reward.kind === 'mana' && <span className="mana-chip" aria-hidden="true">✦</span>}
                        <small>{reward.name} ×{reward.quantity}</small>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="hunt-controls">
          <p>{definition ? `${definition.name} 장착 중 · 기본 공격력 ${attack}` : '인벤토리에서 곡괭이를 장착하세요'}</p>
          <button className="attack-button" type="button" onClick={onAttack} disabled={!canAttack || attacking}>
            <span aria-hidden="true">⚔</span>{attacking ? '공격 중...' : monster ? '공격' : '몬스터 탐색'}
          </button>
          {equipped && <small>남은 내구도 {equipped.durability} / {equipped.maxDurability}</small>}
          {!canAttack && equipped && <small className="hunt-warn">공격에 필요한 내구도가 부족합니다. (필요 {durabilityCost})</small>}
        </div>
      </div>
    </section>
  )
}
