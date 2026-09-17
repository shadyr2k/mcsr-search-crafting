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

function codeForPayload(version: number, payload: unknown): string {
  return `mcsr-item-sets-v${version}.${btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

describe('item-set collection sharing', () => {
  test('still imports the original full item ID format', () => {
    const code = codeForPayload(1, { v: 1, s: [{ v: 1, t: ['minecraft:stick'], i: ['minecraft:string'], g: 2, e: false, r: true }] })

    expect(parseItemSetWorkspaceShareCode(code, available)).toEqual({
      ok: true,
      drafts: [{ targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:string'], gridSize: 2, enabled: false, retainCraftOrder: true }],
    })
  })

  test('stores repeated inventories and item names only once', () => {
    const inventoryItemIds = Array.from({ length: 40 }, (_, index) => `minecraft:inventory_item_${index}`)
    const entries = Array.from({ length: 10 }, () => ({
      targetIds: ['minecraft:bow', 'minecraft:stick'], inventoryItemIds, gridSize: 3 as const, enabled: true, retainCraftOrder: false,
    }))
    const legacyCode = codeForPayload(1, { v: 1, s: entries.map((entry) => ({ v: 1, t: entry.targetIds, i: entry.inventoryItemIds, g: 3, e: true, r: false })) })
    const code = createItemSetWorkspaceShareCode(entries)
    const result = parseItemSetWorkspaceShareCode(code, {
      ...available,
      inventoryItems: new Map(inventoryItemIds.map((id) => [id, { id }])),
    })

    expect(code.length).toBeLessThan(legacyCode.length / 5)
    expect(result).toEqual({ ok: true, drafts: entries.map((entry) => ({ ...entry, inventoryItemIds: [...inventoryItemIds].sort() })) })
  })

  test.each([
    { v: 2, d: ['stick'], i: [[]], s: [[[1], 0, 2]] },
    { v: 2, d: ['stick'], i: [[]], s: [[[0], 1, 2]] },
    { v: 2, d: ['stick'], i: [[-1]], s: [[[0], 0, 2]] },
    { v: 2, d: ['stick'], i: [[]], s: [[[0], 0, 8]] },
    { v: 2, d: ['stick'], i: [[]], s: [[[0], 0, 1.5]] },
    { v: 2, d: ['stick', 'stick'], i: [[]], s: [[[0], 0, 2]] },
    { v: 2, d: ['stick', 'minecraft:stick'], i: [[]], s: [[[0], 0, 2]] },
    { v: 2, d: ['stick'], i: [[]], s: [[[0, 0], 0, 2]] },
    { v: 2, d: ['stick', 'string'], i: [[1, 1]], s: [[[0], 0, 2]] },
  ])('rejects invalid compact references and flags: %j', (payload) => {
    expect(parseItemSetWorkspaceShareCode(codeForPayload(2, payload), available).ok).toBe(false)
  })

  test('preserves every combination of grid, enabled, and craft-order flags', () => {
    const entries = Array.from({ length: 8 }, (_, flags) => ({
      targetIds: ['minecraft:stick'],
      inventoryItemIds: [],
      gridSize: flags & 1 ? 2 as const : 3 as const,
      enabled: Boolean(flags & 2),
      retainCraftOrder: Boolean(flags & 4),
    }))

    expect(parseItemSetWorkspaceShareCode(createItemSetWorkspaceShareCode(entries), available)).toEqual({ ok: true, drafts: entries })
  })

  test('keeps distinct inventories and non-Minecraft namespaces intact', () => {
    const entries = [
      { targetIds: ['example:stick'], inventoryItemIds: ['minecraft:string'], gridSize: 3 as const, enabled: true, retainCraftOrder: false },
      { targetIds: ['minecraft:stick'], inventoryItemIds: ['minecraft:oak_planks'], gridSize: 3 as const, enabled: true, retainCraftOrder: false },
    ]
    const catalog = { ...available, items: new Map([...available.items, ['example:stick', { id: 'example:stick' }]]) }

    expect(parseItemSetWorkspaceShareCode(createItemSetWorkspaceShareCode(entries), catalog)).toEqual({ ok: true, drafts: entries })
  })

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
