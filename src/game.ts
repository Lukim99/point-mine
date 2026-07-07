export const PICKAXES = [
  { id: 'wood', name: '나무 곡괭이', spriteIndex: 0, rank: 0, durability: 5, attack: 1 },
  { id: 'stone', name: '돌 곡괭이', spriteIndex: 1, rank: 1, durability: 8, attack: 2 },
  { id: 'rusty_iron', name: '녹슨 철 곡괭이', spriteIndex: 2, rank: 2, durability: 12, attack: 3 },
  { id: 'steel', name: '강철 곡괭이', spriteIndex: 3, rank: 4, durability: 26, attack: 7 },
  { id: 'bronze', name: '청동 곡괭이', spriteIndex: 4, rank: 3, durability: 18, attack: 5 },
  { id: 'gold', name: '황금 곡괭이', spriteIndex: 5, rank: 5, durability: 38, attack: 9 },
  { id: 'titanium', name: '티타늄 곡괭이', spriteIndex: 6, rank: 6, durability: 55, attack: 11 },
  { id: 'platinum', name: '백금 곡괭이', spriteIndex: 7, rank: 7, durability: 80, attack: 13 },
  { id: 'obsidian', name: '흑요석 곡괭이', spriteIndex: 8, rank: 8, durability: 115, attack: 15 },
  { id: 'alloy', name: '강화 합금 곡괭이', spriteIndex: 9, rank: 9, durability: 165, attack: 17 },
  { id: 'ruby', name: '루비 곡괭이', spriteIndex: 10, rank: 10, durability: 235, attack: 19 },
  { id: 'sapphire', name: '사파이어 곡괭이', spriteIndex: 11, rank: 11, durability: 330, attack: 21 },
  { id: 'orichalcum', name: '오리하르콘 곡괭이', spriteIndex: 12, rank: 12, durability: 460, attack: 24 },
  { id: 'adamantium', name: '아다만티움 곡괭이', spriteIndex: 13, rank: 13, durability: 640, attack: 27 },
  { id: 'astral', name: '아스트랄 곡괭이', spriteIndex: 14, rank: 14, durability: 880, attack: 30 },
  { id: 'master', name: '마스터 곡괭이', spriteIndex: 15, rank: 15, durability: 1200, attack: 32 },
] as const

export const ORES = [
  { id: 'stone', name: '돌', points: 1, icon: '●' },
  { id: 'coal', name: '석탄', points: 2, icon: '◆' },
  { id: 'copper', name: '구리 광석', points: 3, icon: '⬟' },
  { id: 'iron', name: '철 광석', points: 5, icon: '⬢' },
  { id: 'silver', name: '은 광석', points: 10, icon: '✦' },
  { id: 'gold', name: '금 광석', points: 15, icon: '✧' },
  { id: 'jade', name: '비취석', points: 25, icon: '⬥' },
  { id: 'obsidian', name: '흑요석', points: 40, icon: '◈' },
  { id: 'topaz', name: '토파즈', points: 60, icon: '◆' },
  { id: 'amethyst', name: '자수정', points: 80, icon: '♦' },
  { id: 'aquamarine', name: '아쿠아마린', points: 100, icon: '✥' },
  { id: 'ruby', name: '루비', points: 250, icon: '♦' },
  { id: 'sapphire', name: '사파이어', points: 300, icon: '♦' },
  { id: 'emerald', name: '에메랄드', points: 150, icon: '♦' },
  { id: 'diamond', name: '다이아몬드', points: 400, icon: '◇' },
  { id: 'mithril', name: '미스릴', points: 1000, icon: '✦' },
] as const

// 사냥 몬스터. spriteIndex는 monsters.png(3x3) 기준이며, 층 구간별로 등장합니다.
export const MONSTERS = [
  { id: 'fly', name: '파리', spriteIndex: 0, maxHp: 8, minFloor: 1, maxFloor: 10 },
  { id: 'bug', name: '좀벌레', spriteIndex: 1, maxHp: 12, minFloor: 1, maxFloor: 10 },
  { id: 'larva', name: '유충', spriteIndex: 2, maxHp: 5, minFloor: 1, maxFloor: 10 },
  { id: 'stone_slime', name: '돌 슬라임', spriteIndex: 3, maxHp: 45, minFloor: 11, maxFloor: 30 },
  { id: 'cave_bat', name: '동굴 박쥐', spriteIndex: 4, maxHp: 35, minFloor: 11, maxFloor: 30 },
  { id: 'sulfur_slime', name: '유황 슬라임', spriteIndex: 5, maxHp: 110, minFloor: 31, maxFloor: 80 },
  { id: 'miner_skeleton', name: '광부 해골', spriteIndex: 6, maxHp: 140, minFloor: 31, maxFloor: 80 },
  { id: 'ghost', name: '유령', spriteIndex: 7, maxHp: 200, minFloor: 81, maxFloor: 100 },
  { id: 'stone_golem', name: '돌 골렘', spriteIndex: 8, maxHp: 280, minFloor: 81, maxFloor: 100 },
] as const

// 몬스터 아이템. spriteIndex는 monster-items.png(2x2) 기준이며, 판매 시 마나를 획득합니다.
export const MONSTER_ITEMS = [
  { id: 'fly_wing', name: '파리 날개', spriteIndex: 0, mana: 1 },
  { id: 'bug_shell', name: '좀벌레 껍질', spriteIndex: 1, mana: 1 },
  { id: 'bat_wing', name: '박쥐 날개', spriteIndex: 2, mana: 2 },
  { id: 'sulfur', name: '유황', spriteIndex: 3, mana: 3 },
] as const

// 마법 부여 정의. sign은 긍정/부정, maxLevel이 1이면 레벨 없는 고정형입니다.
export const ENCHANTMENTS = [
  { id: 'luck', name: '행운', sign: 'positive', maxLevel: 2, description: '광물을 1개 추가로 채굴할 확률이 주어집니다.' },
  { id: 'miner_eye', name: '광부의 눈', sign: 'positive', maxLevel: 5, description: '더 높은 등급의 광물을 채굴할 확률이 증가합니다.' },
  { id: 'sharp', name: '강화', sign: 'positive', maxLevel: 5, description: '공격력이 증가합니다. (1당 공격력 1)' },
  { id: 'self_repair', name: '자가 복원', sign: 'positive', maxLevel: 1, description: '매일 내구도가 1씩 수리됩니다.' },
  { id: 'wisdom', name: '지혜', sign: 'positive', maxLevel: 3, description: '채굴 시 경험치를 추가로 획득합니다. (1당 경험치 +1)' },
  { id: 'bug_hunter', name: '벌레잡이', sign: 'positive', maxLevel: 5, description: '파리·좀벌레·유충에 한해 공격력이 증가합니다. (1당 공격력 2)' },
  { id: 'slime_slayer', name: '슬라임 퇴치', sign: 'positive', maxLevel: 5, description: '돌·유황 슬라임에 한해 공격력이 증가합니다. (1당 공격력 2)' },
  { id: 'holy', name: '신성', sign: 'positive', maxLevel: 5, description: '광부 해골·유령에 한해 공격력이 증가합니다. (1당 공격력 2)' },
  { id: 'bat_hunter', name: '박쥐잡이', sign: 'positive', maxLevel: 5, description: '박쥐에 한해 공격력이 증가합니다. (1당 공격력 2)' },
  { id: 'golem_breaker', name: '골렘 파괴자', sign: 'positive', maxLevel: 5, description: '돌 골렘에 한해 공격력이 증가합니다. (1당 공격력 2)' },
  { id: 'plunder', name: '약탈', sign: 'positive', maxLevel: 3, description: '사냥 시 보상을 얻을 확률이 증가합니다. (1당 10%, 곱연산)' },
  { id: 'double_mine', name: '더블 채굴', sign: 'positive', maxLevel: 1, description: '채굴 시 내구도를 2배로 소모하는 대신 2개씩 채굴합니다.' },
  { id: 'fragile', name: '취약', sign: 'negative', maxLevel: 5, description: '내구도가 더 빠르게 소모됩니다. (1당 내구도 소모 +1)' },
  { id: 'unlucky', name: '불운', sign: 'negative', maxLevel: 3, description: '광물을 채굴하지 못할 확률이 생깁니다. (1당 5%)' },
  { id: 'destroyer', name: '파괴자', sign: 'negative', maxLevel: 2, description: '수리에 실패할 확률이 생깁니다. (1당 8%)' },
  { id: 'weaken', name: '약화', sign: 'negative', maxLevel: 5, description: '공격력이 하락합니다. (1당 공격력 -1)' },
] as const

export const ENCHANT_MANA_COST = 5

export type PickaxeId = (typeof PICKAXES)[number]['id']
export type OreId = (typeof ORES)[number]['id']
export type MonsterId = (typeof MONSTERS)[number]['id']
export type MonsterItemId = (typeof MONSTER_ITEMS)[number]['id']
export type EnchantId = (typeof ENCHANTMENTS)[number]['id']
export type ChestId = 'normal' | 'premium'

export interface ChestDrop {
  pickaxeId: PickaxeId
  chance: number
}

export interface ChestDefinition {
  id: ChestId
  name: string
  description: string
  price: number
  spriteIndex: number
  expectedValue: number
  drops: readonly ChestDrop[]
}

export const CHESTS: readonly ChestDefinition[] = [
  {
    id: 'normal',
    name: '일반 곡괭이 상자',
    description: '기본부터 상급 곡괭이까지 발견할 수 있습니다.',
    price: 100,
    spriteIndex: 0,
    expectedValue: 84.32,
    drops: [
      { pickaxeId: 'wood', chance: 24.5 },
      { pickaxeId: 'stone', chance: 24.5 },
      { pickaxeId: 'rusty_iron', chance: 20 },
      { pickaxeId: 'bronze', chance: 16 },
      { pickaxeId: 'steel', chance: 9 },
      { pickaxeId: 'gold', chance: 4 },
      { pickaxeId: 'titanium', chance: 1.2 },
      { pickaxeId: 'platinum', chance: 0.5 },
      { pickaxeId: 'obsidian', chance: 0.18 },
      { pickaxeId: 'alloy', chance: 0.07 },
      { pickaxeId: 'ruby', chance: 0.03 },
      { pickaxeId: 'sapphire', chance: 0.02 },
    ],
  },
  {
    id: 'premium',
    name: '고급 곡괭이 상자',
    description: '청동 이상, 마스터까지 등장하는 고급 상자입니다.',
    price: 500,
    spriteIndex: 1,
    expectedValue: 311.19,
    drops: [
      { pickaxeId: 'bronze', chance: 52.83 },
      { pickaxeId: 'steel', chance: 24 },
      { pickaxeId: 'gold', chance: 13 },
      { pickaxeId: 'titanium', chance: 6 },
      { pickaxeId: 'platinum', chance: 2.5 },
      { pickaxeId: 'obsidian', chance: 0.8 },
      { pickaxeId: 'alloy', chance: 0.4 },
      { pickaxeId: 'ruby', chance: 0.17 },
      { pickaxeId: 'sapphire', chance: 0.1 },
      { pickaxeId: 'orichalcum', chance: 0.08 },
      { pickaxeId: 'adamantium', chance: 0.05 },
      { pickaxeId: 'astral', chance: 0.05 },
      { pickaxeId: 'master', chance: 0.02 },
    ],
  },
] as const

export interface PickaxeInventoryItem {
  type: 'pickaxe'
  id: PickaxeId
  durability: number
  maxDurability: number
  equipped: boolean
  // 부여된 마법. { "<enchantId>": <level> } 형식이며 없으면 미부여 상태입니다.
  enchants?: Partial<Record<EnchantId, number>>
}

export interface MineralInventoryItem {
  type: 'mineral'
  id: OreId
  quantity: number
}

export interface MonsterItemInventoryItem {
  type: 'monster_item'
  id: MonsterItemId
  quantity: number
}

export type InventoryItem = PickaxeInventoryItem | MineralInventoryItem | MonsterItemInventoryItem

export interface UserProfile {
  nickname: string
  balance: number
  mana: number
  inventory: InventoryItem[]
  mineFloor: number
  mineExperience: string
  huntMonster: MonsterId | null
  huntMonsterHp: number | null
  vipExpiresAt: string | null
  vipLastNormalFree: string | null
  vipLastPremiumFree: string | null
}

// 처치 시 지급된 보상 한 건을 표현합니다.
export interface HuntReward {
  kind: 'mineral' | 'monster_item' | 'mana'
  id?: string
  name: string
  quantity: number
}

export interface AttackResult {
  status: 'success' | 'spawned' | 'no_pickaxe' | 'broken_pickaxe'
  monster_id?: MonsterId
  monster_name?: string
  monster_hp?: number
  monster_max_hp?: number
  damage?: number
  defeated?: boolean
  remaining_durability?: number
  rewards?: HuntReward[]
  inventory?: InventoryItem[]
  mana?: number
  xp_gained?: number
  mine_floor?: number
  mine_experience?: string
  floor_up?: boolean
}

export interface EnchantResult {
  status: 'success' | 'insufficient_mana' | 'pickaxe_not_found'
  pickaxe_id?: PickaxeId
  enchants?: Partial<Record<EnchantId, number>>
  mana?: number
  inventory?: InventoryItem[]
}

export interface SellMonsterItemsResult {
  status: 'success' | 'empty' | 'empty_selection'
  gained_mana?: number
  mana?: number
  inventory?: InventoryItem[]
}

export interface MineResult {
  status: 'success' | 'no_pickaxe' | 'broken_pickaxe'
  ore_id?: OreId
  ore_name?: string
  points?: number
  remaining_durability?: number
  inventory?: InventoryItem[]
  xp_gained?: number
  mine_floor?: number
  mine_experience?: string
  required_experience?: string
  floor_up?: boolean
  mined?: boolean
  quantity?: number
}

export interface OpenChestResult {
  status: 'success' | 'insufficient_balance' | 'invalid_chest' | 'company_not_found'
  chest_id?: ChestId
  pickaxe_id?: PickaxeId
  pickaxe_name?: string
  balance?: number
  inventory?: InventoryItem[]
  is_duplicate?: boolean
}

export interface BulkChestReward {
  pickaxe_id: PickaxeId
  pickaxe_name: string
  durability: number
  is_duplicate: boolean
}

export interface BulkOpenChestResult {
  status: 'success' | 'insufficient_balance' | 'invalid_chest' | 'invalid_count' | 'company_not_found'
  chest_id?: ChestId
  count?: number
  results?: BulkChestReward[]
  balance?: number
  inventory?: InventoryItem[]
}

// 한 번에 구매·개봉하는 상자 개수
export const BULK_CHEST_COUNT = 5

// VIP 티켓
export const VIP_PRICE = 3000
export const VIP_DAYS = 7
export const VIP_SINGLE_DISCOUNT = 5 // 상자 1개 구매 할인율(%)
export const VIP_BULK_DISCOUNT = 10 // 상자 5개 구매 할인율(%)
export const VIP_DAILY_MANA = 5

export interface VipPurchaseResult {
  status: 'success' | 'insufficient_balance' | 'company_not_found'
  balance?: number
  vip_expires_at?: string
}

export interface FreeVipChestResult {
  status: 'success' | 'not_vip' | 'already_claimed' | 'invalid_chest'
  chest_id?: ChestId
  count?: number
  results?: BulkChestReward[]
  inventory?: InventoryItem[]
}

// VIP 할인이 적용된 상자 가격(정수 내림, 서버와 동일한 계산)
export const discountedChestPrice = (price: number, vipActive: boolean, discountPercent: number) =>
  vipActive ? price - Math.floor((price * discountPercent) / 100) : price

// KST(Asia/Seoul) 기준 오늘 날짜(YYYY-MM-DD)
export const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

// VIP 만료 시각 문자열로 현재 VIP 활성 여부 판단
export const isVipActive = (vipExpiresAt: string | null) => Boolean(vipExpiresAt && new Date(vipExpiresAt).getTime() > Date.now())

export const findPickaxe = (id: string) => PICKAXES.find((pickaxe) => pickaxe.id === id)
export const findOre = (id: string) => ORES.find((ore) => ore.id === id)
export const findChest = (id: string) => CHESTS.find((chest) => chest.id === id)
// 곡괭이에 마법 부여가 하나라도 있는지 여부
export const isEnchanted = (item: { enchants?: Partial<Record<EnchantId, number>> }) => Boolean(item.enchants && Object.keys(item.enchants).length > 0)

// 정수를 로마 숫자로 변환합니다. (마법 부여 레벨 표기용)
export const toRoman = (value: number): string => {
  const numerals: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let remaining = Math.max(0, Math.floor(value))
  let result = ''
  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      result += symbol
      remaining -= amount
    }
  }
  return result
}

// 레벨을 반영한 마법 부여 설명문을 생성합니다.
export const enchantDescription = (id: EnchantId, level: number): string => {
  switch (id) {
    case 'luck': return `광물을 ${level === 1 ? 5 : 13}% 확률로 1개 추가 채굴합니다.`
    case 'miner_eye': return '더 높은 등급의 광물을 캘 확률이 증가합니다.'
    case 'sharp': return `공격력이 ${level} 증가합니다.`
    case 'self_repair': return '매일 내구도가 1씩 수리됩니다.'
    case 'wisdom': return `채굴 시 경험치를 ${level} 추가로 획득합니다.`
    case 'bug_hunter': return `파리·좀벌레·유충에게 공격력이 ${2 * level} 증가합니다.`
    case 'slime_slayer': return `돌·유황 슬라임에게 공격력이 ${2 * level} 증가합니다.`
    case 'holy': return `광부 해골·유령에게 공격력이 ${2 * level} 증가합니다.`
    case 'bat_hunter': return `박쥐에게 공격력이 ${2 * level} 증가합니다.`
    case 'golem_breaker': return `돌 골렘에게 공격력이 ${2 * level} 증가합니다.`
    case 'plunder': return `사냥 시 보상 확률이 ${Math.round((Math.pow(1.1, level) - 1) * 100)}% 증가합니다.`
    case 'double_mine': return '채굴 시 내구도를 2배 소모하고 광물을 2개씩 캡니다.'
    case 'fragile': return `내구도 소모가 ${level} 증가합니다.`
    case 'unlucky': return `${5 * level}% 확률로 채굴에 실패합니다.`
    case 'destroyer': return `${8 * level}% 확률로 수리에 실패합니다.`
    case 'weaken': return `공격력이 ${level} 감소합니다.`
    default: return ''
  }
}
export const findMonster = (id: string) => MONSTERS.find((monster) => monster.id === id)
export const findMonsterItem = (id: string) => MONSTER_ITEMS.find((item) => item.id === id)
export const findEnchantment = (id: string) => ENCHANTMENTS.find((enchant) => enchant.id === id)
