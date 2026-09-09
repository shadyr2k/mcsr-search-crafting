import type { GeneratedData, TargetWorkspace } from '../domain/types'

interface StarterItemSet {
  id: string
  targetIds: string[]
  gridSize: 2 | 3
  retainCraftOrder: boolean
  presetId: string
}

const starterItemSets: readonly StarterItemSet[] = [
  {
    id: 'flint-and-steel',
    targetIds: ['minecraft:flint_and_steel'],
    gridSize: 2,
    retainCraftOrder: false,
    presetId: 'overworld',
  },
  {
    id: 'gold-tools',
    targetIds: ['minecraft:golden_helmet', 'minecraft:golden_pickaxe'],
    gridSize: 3,
    retainCraftOrder: false,
    presetId: 'overworld',
  },
  {
    id: 'ingots',
    targetIds: ['minecraft:gold_ingot', 'minecraft:iron_ingot'],
    gridSize: 3,
    retainCraftOrder: false,
    presetId: 'nether-bastion',
  },
  {
    id: 'iron-tools',
    targetIds: ['minecraft:iron_ingot', 'minecraft:iron_sword', 'minecraft:iron_axe'],
    gridSize: 3,
    retainCraftOrder: true,
    presetId: 'nether-bastion',
  },
  {
    id: 'bastion-building-blocks',
    targetIds: ['minecraft:glowstone', 'minecraft:white_wool', 'minecraft:nether_bricks'],
    gridSize: 2,
    retainCraftOrder: false,
    presetId: 'nether-bastion',
  },
  {
    id: 'fortress-utilities',
    targetIds: ['minecraft:white_bed', 'minecraft:respawn_anchor', 'minecraft:bow'],
    gridSize: 3,
    retainCraftOrder: false,
    presetId: 'nether-fortress',
  },
  {
    id: 'blaze-and-eyes',
    targetIds: ['minecraft:blaze_powder', 'minecraft:ender_eye'],
    gridSize: 2,
    retainCraftOrder: true,
    presetId: 'nether-fortress',
  },
]

export function starterWorkspace(data: Pick<GeneratedData, 'presets'>): TargetWorkspace {
  const presets = starterItemSets.map((itemSet) => data.presets.get(itemSet.presetId))
  if (presets.some((preset) => preset === undefined)) return { entries: [] }

  return {
    entries: starterItemSets.map((itemSet, order) => ({
      id: `starter-${itemSet.id}`,
      targetIds: [...itemSet.targetIds],
      inventoryItemIds: [...presets[order]!.itemIds],
      enabled: true,
      gridSize: itemSet.gridSize,
      ...(itemSet.retainCraftOrder ? { retainCraftOrder: true } : {}),
      order,
    })),
  }
}
