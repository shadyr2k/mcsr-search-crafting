import { describe, expect, test } from 'vitest'

import type { InventoryPreset } from '../domain/types'
import { starterWorkspace } from './starterWorkspace'

function preset(id: string): InventoryPreset {
  return { id, name: id, itemIds: [`minecraft:${id}`] }
}

describe('starter workspace', () => {
  test('creates the seven first-visit MCSR crafting rows', () => {
    const workspace = starterWorkspace({ presets: new Map([
      ['overworld', preset('overworld')],
      ['nether-bastion', preset('nether-bastion')],
      ['nether-fortress', preset('nether-fortress')],
    ]) })

    expect(workspace.entries).toEqual([
      expect.objectContaining({ targetIds: ['minecraft:flint_and_steel'], inventoryItemIds: ['minecraft:overworld'], gridSize: 2, order: 0 }),
      expect.objectContaining({ targetIds: ['minecraft:golden_helmet', 'minecraft:golden_pickaxe'], inventoryItemIds: ['minecraft:overworld'], gridSize: 3, order: 1 }),
      expect.objectContaining({ targetIds: ['minecraft:gold_ingot', 'minecraft:iron_ingot'], inventoryItemIds: ['minecraft:nether-bastion'], gridSize: 3, order: 2 }),
      expect.objectContaining({ targetIds: ['minecraft:iron_ingot', 'minecraft:iron_sword', 'minecraft:iron_axe'], inventoryItemIds: ['minecraft:nether-bastion'], gridSize: 3, retainCraftOrder: true, order: 3 }),
      expect.objectContaining({ targetIds: ['minecraft:glowstone', 'minecraft:white_wool', 'minecraft:nether_bricks'], inventoryItemIds: ['minecraft:nether-bastion'], gridSize: 2, order: 4 }),
      expect.objectContaining({ targetIds: ['minecraft:white_bed', 'minecraft:respawn_anchor', 'minecraft:bow'], inventoryItemIds: ['minecraft:nether-fortress'], gridSize: 3, order: 5 }),
      expect.objectContaining({ targetIds: ['minecraft:blaze_powder', 'minecraft:ender_eye'], inventoryItemIds: ['minecraft:nether-fortress'], gridSize: 2, retainCraftOrder: true, order: 6 }),
    ])
    expect(workspace.entries.filter((entry) => entry.retainCraftOrder !== true)).toHaveLength(5)
  })

  test('does not create partial starter rows without every required preset', () => {
    expect(starterWorkspace({ presets: new Map([['overworld', preset('overworld')]]) })).toEqual({ entries: [] })
  })
})
