export const PICKAXES = [
  { id: 'wood', name: '나무 곡괭이', spriteIndex: 0, rank: 0, durability: 5 },
  { id: 'stone', name: '돌 곡괭이', spriteIndex: 1, rank: 1, durability: 8 },
  { id: 'rusty_iron', name: '녹슨 철 곡괭이', spriteIndex: 2, rank: 2, durability: 12 },
  { id: 'steel', name: '강철 곡괭이', spriteIndex: 3, rank: 4, durability: 26 },
  { id: 'bronze', name: '청동 곡괭이', spriteIndex: 4, rank: 3, durability: 18 },
  { id: 'gold', name: '황금 곡괭이', spriteIndex: 5, rank: 5, durability: 38 },
  { id: 'titanium', name: '티타늄 곡괭이', spriteIndex: 6, rank: 6, durability: 55 },
  { id: 'platinum', name: '백금 곡괭이', spriteIndex: 7, rank: 7, durability: 80 },
  { id: 'obsidian', name: '흑요석 곡괭이', spriteIndex: 8, rank: 8, durability: 115 },
  { id: 'alloy', name: '강화 합금 곡괭이', spriteIndex: 9, rank: 9, durability: 165 },
  { id: 'ruby', name: '루비 곡괭이', spriteIndex: 10, rank: 10, durability: 235 },
  { id: 'sapphire', name: '사파이어 곡괭이', spriteIndex: 11, rank: 11, durability: 330 },
  { id: 'orichalcum', name: '오리하르콘 곡괭이', spriteIndex: 12, rank: 12, durability: 460 },
  { id: 'adamantium', name: '아다만티움 곡괭이', spriteIndex: 13, rank: 13, durability: 640 },
  { id: 'astral', name: '아스트랄 곡괭이', spriteIndex: 14, rank: 14, durability: 880 },
  { id: 'master', name: '마스터 곡괭이', spriteIndex: 15, rank: 15, durability: 1200 },
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

export type PickaxeId = (typeof PICKAXES)[number]['id']
export type OreId = (typeof ORES)[number]['id']
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
    expectedValue: 407.93,
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
      { pickaxeId: 'astral', chance: 0.02 },
      { pickaxeId: 'master', chance: 0.05 },
    ],
  },
] as const

export interface PickaxeInventoryItem {
  type: 'pickaxe'
  id: PickaxeId
  durability: number
  maxDurability: number
  equipped: boolean
}

export interface MineralInventoryItem {
  type: 'mineral'
  id: OreId
  quantity: number
}

export type InventoryItem = PickaxeInventoryItem | MineralInventoryItem

export interface UserProfile {
  nickname: string
  balance: number
  inventory: InventoryItem[]
}

export interface MineResult {
  status: 'success' | 'no_pickaxe' | 'broken_pickaxe'
  ore_id?: OreId
  ore_name?: string
  points?: number
  remaining_durability?: number
  inventory?: InventoryItem[]
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

export const findPickaxe = (id: string) => PICKAXES.find((pickaxe) => pickaxe.id === id)
export const findOre = (id: string) => ORES.find((ore) => ore.id === id)
export const findChest = (id: string) => CHESTS.find((chest) => chest.id === id)
