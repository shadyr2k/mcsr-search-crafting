import { describe, expect, test } from 'vitest'

import { createItemSetWorkspaceShareCode, ITEM_SET_WORKSPACE_SHARE_PREFIX, parseItemSetWorkspaceShareCode } from './itemSetShare'

const available = {
  items: new Map([
    ['minecraft:stick', { id: 'minecraft:stick' }],
    ['minecraft:bow', { id: 'minecraft:bow' }],
  ]),
  inventoryItems: new Map([
    ['minecraft:oak_planks', { id: 'minecraft:oak_planks' }],
    ['minecraft:string', { id: 'minecraft:string' }],
  ]),
}

describe('item-set collection sharing', () => {
  test('round-trips every portable condition while preserving collection and goal order', () => {
    const code = createItemSetWorkspaceShareCode([
      {
        targetIds: ['minecraft:bow', 'minecraft:stick'],
        inventoryItemIds: ['minecraft:string', 'minecraft:oak_planks'],
        enabled: false,
        gridSize: 2,
        retainCraftOrder: true,
      },
      {
        targetIds: ['minecraft:stick'],
        inventoryItemIds: [],
        enabled: true,
        gridSize: 3,
        retainCraftOrder: false,
      },
    ])

    expect(code.startsWith(ITEM_SET_WORKSPACE_SHARE_PREFIX)).toBe(true)
    expect(parseItemSetWorkspaceShareCode(code, available)).toEqual({
      ok: true,
      drafts: [
        {
          targetIds: ['minecraft:bow', 'minecraft:stick'],
          inventoryItemIds: ['minecraft:oak_planks', 'minecraft:string'],
          enabled: false,
          gridSize: 2,
          retainCraftOrder: true,
        },
        {
          targetIds: ['minecraft:stick'],
          inventoryItemIds: [],
          enabled: true,
          gridSize: 3,
          retainCraftOrder: false,
        },
      ],
    })
  })

  test('rejects incompatible, malformed, and unknown-item codes', () => {
    expect(parseItemSetWorkspaceShareCode('not a share code', available)).toEqual({
      ok: false,
      error: 'That is not an item-set collection share code.',
    })
    expect(parseItemSetWorkspaceShareCode(`${ITEM_SET_WORKSPACE_SHARE_PREFIX}not-valid!`, available)).toEqual({
      ok: false,
      error: 'This item-set collection share code is incomplete or corrupted.',
    })

    const unknownGoal = createItemSetWorkspaceShareCode([{
      targetIds: ['minecraft:unknown'],
      inventoryItemIds: [],
      gridSize: 3,
      enabled: true,
      retainCraftOrder: false,
    }])
    expect(parseItemSetWorkspaceShareCode(unknownGoal, available)).toEqual({
      ok: false,
      error: 'This collection includes a goal that is unavailable in this version of Minecraft.',
    })
  })

  test('preserves an intentionally empty item-set column', () => {
    const code = createItemSetWorkspaceShareCode([])

    expect(parseItemSetWorkspaceShareCode(code, available)).toEqual({ ok: true, drafts: [] })
  })
})
