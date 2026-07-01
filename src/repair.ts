import type { OreId, PickaxeId } from './game'

export interface RepairCost {
  oreId: OreId
  quantity: number
}

export interface RepairRecipe {
  pickaxeId: PickaxeId
  costs: readonly RepairCost[]
}

export const REPAIR_RECIPES: readonly RepairRecipe[] = [
  { pickaxeId: 'stone', costs: [{ oreId: 'stone', quantity: 2 }] },
  { pickaxeId: 'rusty_iron', costs: [{ oreId: 'coal', quantity: 1 }] },
  { pickaxeId: 'bronze', costs: [{ oreId: 'copper', quantity: 1 }] },
  { pickaxeId: 'steel', costs: [{ oreId: 'iron', quantity: 1 }] },
  { pickaxeId: 'gold', costs: [{ oreId: 'coal', quantity: 2 }] },
  { pickaxeId: 'titanium', costs: [{ oreId: 'silver', quantity: 1 }] },
  { pickaxeId: 'platinum', costs: [{ oreId: 'silver', quantity: 2 }] },
  { pickaxeId: 'obsidian', costs: [{ oreId: 'jade', quantity: 1 }] },
  { pickaxeId: 'alloy', costs: [{ oreId: 'obsidian', quantity: 1 }] },
  { pickaxeId: 'ruby', costs: [{ oreId: 'amethyst', quantity: 1 }] },
  { pickaxeId: 'sapphire', costs: [{ oreId: 'amethyst', quantity: 1 }] },
  { pickaxeId: 'orichalcum', costs: [{ oreId: 'amethyst', quantity: 1 }] },
  { pickaxeId: 'adamantium', costs: [{ oreId: 'amethyst', quantity: 1 }] },
  { pickaxeId: 'astral', costs: [{ oreId: 'emerald', quantity: 1 }] },
  { pickaxeId: 'master', costs: [{ oreId: 'diamond', quantity: 1 }] },
] as const

export const findRepairRecipe = (pickaxeId: string) => REPAIR_RECIPES.find((recipe) => recipe.pickaxeId === pickaxeId)
