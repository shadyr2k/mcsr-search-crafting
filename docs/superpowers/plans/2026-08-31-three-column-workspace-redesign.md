# MCSR Three-Column Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace the global-inventory interface with a pastel pink/red three-column workspace in which every saved item set owns its exact infinite inventory, results merge single and overlap searches into one ranking, and compact item displays use validated Minecraft 1.16.1 icons.

**Architecture:** The Python generator publishes one canonical preset artifact and expands the selectable inventory catalog to include preset-only items. Browser persistence migrates workspace records to schema version 2 with empty per-row inventories. A framework-independent entry optimizer produces one normalized ranked-search union, while a React row coordinator caches and cancels calculations by stable entry ID/input fingerprint. Draft editing is save-gated in the right column; language aggregation and result rows consume only saved state.

**Tech Stack:** Python 3.11+, pytest, JSON; TypeScript 5.8, React 19, Vite 7, Vitest 3, Testing Library, Playwright; CSS Grid; local TTF fonts; static native Minecraft icons produced by the separate icon-exporter plan

**Spec:** `docs/superpowers/specs/2026-08-31-three-column-workspace-redesign.md`

## Cross-Plan Execution Order

This plan depends on `docs/superpowers/plans/2026-08-31-minecraft-item-icon-exporter.md`.

Execute in this order:

1. Icon-exporter Tasks 1–7, which build the mod, importer, browser manifest parser, and `ItemIcon` component.
2. This plan's Task 1, which advances the selectable inventory catalog from 281 to 283 items.
3. Icon-exporter Task 8, which imports real icons against that final 283-item catalog.
4. This plan's Tasks 2–9.

Do not accept a canonical icon manifest generated against the old 281-item catalog; it would omit `minecraft:oak_leaves` and `minecraft:bucket`.

## Global Constraints

- English is the only visible language in this release. Keep the language result data-driven so later locales do not require a layout rewrite.
- Every saved item set owns a sorted, deduplicated exact `inventoryItemIds` array. Infinite quantity applies only to selected exact IDs; never infer planks from logs or colors from white variants.
- Empty inventory is valid. It must produce the normal deterministic maximum-score no-viable outcome, not a calculation error.
- A new or edited row changes no saved result or aggregate before Save. Cancel restores the exact saved row. A dirty editor cannot be replaced by opening another row.
- Empty drafts cannot be saved. Existing migrated empty-goal rows remain visible/editable but contribute no result or aggregate until corrected or deleted.
- Built-in presets replace only the editor draft's inventory with a copy. Custom slots remain three independently persisted `{name, itemIds}` records.
- Default grid is 3x3. The 2x2 state is allowed only when every goal has at least one exact-output recipe that fits 2x2. Incompatibility silently forces and locks 3x3; render no warning.
- Preserve query generation, one-to-five-character limit, collection alias matching, exact visible outputs/junk IDs, scoring formulas, free backspaces, per-step junk charges, and maximum failure scoring.
- Merge complete single and overlap results by total score, total junk appearances, step count, total typed characters, then lexical query sequence. Show top 3 collapsed and top 10 expanded.
- No viable search is a successful maximum-score outcome. Unexpected optimizer/data failure is a distinct calculation error with Retry and makes the English aggregate unavailable.
- The language score is the sum of best successful outcomes from enabled nonempty saved rows. Disabled and empty rows contribute nothing. It is blank when no enabled nonempty row exists.
- Compact item displays are icon-first. English names remain in tooltips, picker search, and accessible labels.
- Use Coiny for the page title/major headings, Geom Medium for interface text, and Figtree weight 800 for standalone metrics.
- Preserve recoverable raw browser data on invalid records and keep the page usable in memory when storage is unavailable.
- Every code task follows red-green-refactor: add a focused failing test, run it and observe the intended failure, implement the smallest behavior, rerun the focused gate, then commit only that task's files.

---

## File Map

```text
generator/src/mcsr_data/inventory_presets.json
  Canonical exact built-in preset source.
generator/src/mcsr_data/presets.py
  Strictly parse and validate the preset source against English translations.
generator/src/mcsr_data/generate.py
  Include preset IDs in inventory items and emit inventory-presets.json atomically.
generator/tests/test_presets.py
generator/tests/test_generate.py
  Cover exact presets, preset-only inputs, determinism, and 283-item baseline.
web/public/data/inventory-items.json
web/public/data/inventory-presets.json
web/public/data/validation-report.json
  Regenerated final data artifacts.

web/src/domain/types.ts
  Add per-row inventories, generated presets, ranked-search records, and row outcomes.
web/src/data/schema.ts
web/src/data/schema.test.ts
  Parse the fifth generated artifact and validate all preset item references.
web/src/presets/builtInPresets.ts
  Expose generated built-ins without duplicating item lists in TypeScript.

web/src/persistence/storage.ts
web/src/persistence/storage.test.ts
  Migrate workspace schema v1 to v2 with empty inventories; retain custom-slot schema.
web/src/workspace/entryDraft.ts
web/src/workspace/entryDraft.test.ts
  Create/copy/validate drafts and silently normalize grid sizes.

web/src/engine/rankedSearch.ts
web/src/engine/rankedSearch.test.ts
  Adapt single/overlap results into one deterministic ranked union and score steps.
web/src/engine/optimizeWorkspace.ts
web/src/engine/optimizeWorkspace.test.ts
  Optimize one entry from its own inventory and aggregate successful row outcomes.
web/src/engine/singleOptimizer.ts
web/src/engine/overlapOptimizer.ts
  Export existing raw result types without changing scoring behavior.

web/src/hooks/useRowOptimizations.ts
web/src/hooks/useRowOptimizations.test.tsx
  Cache per-entry results, abort changed work, reject stale publications, and retry errors.

web/src/components/ItemPicker.tsx
web/src/components/ItemPicker.test.tsx
  Reusable searchable icon-first picker for goals and exact inventory items.
web/src/components/ItemIcon.tsx
  Reuse the validated icon component from the exporter plan.
web/src/components/GridSizeSwitch.tsx
web/src/components/GridSizeSwitch.test.tsx
  Accessible silent-lock 2x2/3x3 switch.
web/src/components/ItemSetRow.tsx
web/src/components/ItemSetWorkspace.tsx
web/src/components/ItemSetWorkspace.test.tsx
  Compact rows, immediate enabled/reorder actions, and editor selection.
web/src/components/ItemSetEditor.tsx
web/src/components/ItemSetEditor.test.tsx
  Draft goals, preset/custom inventories, grid, Save/Cancel/Delete lifecycle.
web/src/components/LanguageRanking.tsx
web/src/components/LanguageRanking.test.tsx
  English-only combined-score presentation.
web/src/components/CalculatedSearchRow.tsx
web/src/components/CalculatedSearchRow.test.tsx
  Aligned collapsed top-three and expanded top-ten result presentation.
web/src/components/ScoreBreakdownPopover.tsx
web/src/components/ScoreBreakdownPopover.test.tsx
  Hover/focus/tap score calculation using engine-provided steps.
web/src/components/MatchEvidence.tsx
web/src/components/MatchEvidence.test.tsx
  Icon-first highlighted direct and collection-alias evidence.

web/src/App.tsx
web/src/App.test.tsx
  Load data/icons/persistence and compose save-gated three-column state.
web/src/App.css
web/src/index.css
  Pastel design system, three-column/stacked layout, icon and state styling.
web/src/assets/fonts/Geom-Medium.ttf
web/src/assets/fonts/Coiny-Regular.ttf
web/src/assets/fonts/Figtree-VariableFont_wght.ttf
  Bundle the supplied local fonts.

web/src/components/InventoryPanel.tsx
web/src/components/InventoryPanel.test.tsx
web/src/components/TargetSetList.tsx
web/src/components/TargetSetList.test.tsx
web/src/components/ResultPanel.tsx
web/src/components/ResultPanel.test.tsx
  Remove after their behavior is covered by the new focused components.

web/e2e/app.spec.ts
  Exercise independent inventories, drafts, presets, ranking, aggregate, migration, and responsive layout.
README.md
  Document the new workflow, presets, local startup, and verification commands.
```

## Shared Interfaces

### Generated data and workspace

```ts
export interface InventoryPreset {
  id: string
  name: string
  itemIds: string[]
}

export interface GeneratedData {
  schemaVersion: 3
  items: Map<string, SearchItem>
  inventoryItems: Map<string, InventoryItem>
  recipes: CraftingRecipe[]
  collections: Map<string, RecipeResultCollection>
  presets: Map<string, InventoryPreset>
}

export interface TargetWorkspaceEntry {
  id: string
  targetIds: string[]
  inventoryItemIds: string[]
  enabled: boolean
  gridSize: 2 | 3
  order: number
}

export type ItemSetDraft = Omit<TargetWorkspaceEntry, 'id' | 'order'> & {
  sourceEntryId?: string
}
```

### Ranked search and row state

```ts
export interface RankedSearchStep {
  query: string
  retainedPrefix: string
  freeBackspaceCount: number
  typedSuffix: string
  coveredTargetIds: string[]
  newTargetIds: string[]
  junkItemIds: string[]
  explanations: CollectionMatchExplanation[]
  score: {
    typingPenalty: number
    junkPresencePenalty: number
    junkCountPenalty: number
    total: number
  }
}

export interface RankedSearch {
  kind: 'single' | 'overlap'
  queries: string[]
  steps: RankedSearchStep[]
  coveredTargetIds: string[]
  totalJunkAppearances: number
  totalTypedCharacters: number
  totalScore: number
}

export type EntryOptimizationOutcome =
  | {
      kind: 'ranked'
      entryId: string
      rankedSearches: RankedSearch[]
      bestScore: number
      visibleItemIds: string[]
    }
  | {
      kind: 'no-viable'
      entryId: string
      rankedSearches: []
      bestScore: number
      visibleItemIds: string[]
      matchedTargetIds: string[]
      unmatchedTargetIds: string[]
    }

export type RowOptimizationState =
  | { status: 'idle' }
  | { status: 'pending'; fingerprint: string; progress?: WorkspaceOptimizationProgress }
  | { status: 'ready'; fingerprint: string; outcome: EntryOptimizationOutcome }
  | { status: 'error'; fingerprint: string; message: string }
```

### Draft/editor lifecycle

```ts
export type EditorState =
  | { kind: 'closed' }
  | { kind: 'new'; draft: ItemSetDraft; dirty: boolean }
  | { kind: 'existing'; entryId: string; draft: ItemSetDraft; dirty: boolean }

export interface ItemSetEditorCommit {
  mode: 'create' | 'update'
  entryId?: string
  value: ItemSetDraft
}
```

---

### Task 1: Publish the canonical built-in presets and final 283-item inventory catalog

**Files:**
- Create: `generator/src/mcsr_data/inventory_presets.json`
- Create: `generator/src/mcsr_data/presets.py`
- Create: `generator/tests/test_presets.py`
- Modify: `generator/src/mcsr_data/generate.py`
- Modify: `generator/tests/test_generate.py`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/data/schema.ts`
- Modify: `web/src/data/schema.test.ts`
- Modify: `web/src/presets/builtInPresets.ts`
- Regenerate: `web/public/data/inventory-items.json`
- Create: `web/public/data/inventory-presets.json`
- Modify: `web/public/data/validation-report.json`

- [ ] **Step 1: Add the exact canonical JSON source**

Use this shape and these IDs, with keys and arrays preserved in the shown order before deterministic serialization:

```json
{
  "schema_version": 1,
  "presets": [
    {
      "id": "overworld",
      "name": "Overworld",
      "item_ids": [
        "minecraft:dirt", "minecraft:oak_leaves", "minecraft:oak_log",
        "minecraft:oak_planks", "minecraft:stick", "minecraft:iron_nugget",
        "minecraft:iron_ingot", "minecraft:gold_nugget", "minecraft:gold_ingot",
        "minecraft:wheat", "minecraft:carrot", "minecraft:gravel", "minecraft:flint"
      ]
    },
    {
      "id": "nether-bastion",
      "name": "Nether (Bastion)",
      "item_ids": [
        "minecraft:dirt", "minecraft:oak_planks", "minecraft:stick", "minecraft:cobblestone",
        "minecraft:iron_nugget", "minecraft:iron_ingot", "minecraft:gold_nugget",
        "minecraft:gold_ingot", "minecraft:bucket", "minecraft:obsidian",
        "minecraft:crying_obsidian", "minecraft:ender_pearl", "minecraft:glowstone_dust",
        "minecraft:glowstone", "minecraft:string", "minecraft:white_wool", "minecraft:gravel",
        "minecraft:soul_sand", "minecraft:nether_brick", "minecraft:nether_bricks",
        "minecraft:blackstone"
      ]
    },
    {
      "id": "nether-fortress",
      "name": "Nether (Fortress)",
      "item_ids": [
        "minecraft:dirt", "minecraft:oak_planks", "minecraft:stick", "minecraft:cobblestone",
        "minecraft:iron_nugget", "minecraft:iron_ingot", "minecraft:gold_ingot",
        "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:ender_pearl",
        "minecraft:glowstone", "minecraft:string", "minecraft:white_wool", "minecraft:gravel",
        "minecraft:soul_sand", "minecraft:nether_brick", "minecraft:nether_bricks",
        "minecraft:blackstone", "minecraft:blaze_rod", "minecraft:blaze_powder"
      ]
    }
  ]
}
```

- [ ] **Step 2: Write failing parser and generation tests**

```python
def test_builtin_presets_have_exact_approved_ids():
    presets = load_inventory_presets()
    assert [preset.preset_id for preset in presets] == [
        "overworld", "nether-bastion", "nether-fortress",
    ]
    assert presets[0].item_ids[1] == "minecraft:oak_leaves"
    assert "minecraft:bucket" in presets[1].item_ids
    assert "minecraft:white_wool" in presets[1].item_ids

def test_real_inventory_catalog_includes_preset_only_items(tmp_path):
    summary = generate(MINECRAFT_DATA_ROOT, tmp_path)
    inventory = read_items(tmp_path / "inventory-items.json")
    assert summary.inventory_item_count == 283
    assert inventory["minecraft:oak_leaves"]["name"] == "Oak Leaves"
    assert inventory["minecraft:bucket"]["name"] == "Bucket"
```

Update deterministic/atomic artifact expectations to include `inventory-presets.json` and change only the inventory baseline from 281 to 283.

- [ ] **Step 3: Run the focused Python tests and observe missing preset behavior**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_presets.py generator/tests/test_generate.py -q`

Expected: collection/import or assertion failures for the missing preset loader/artifact and old 281 baseline.

- [ ] **Step 4: Implement strict preset loading and generator union**

Add:

```python
@dataclass(frozen=True)
class InventoryPreset:
    preset_id: str
    name: str
    item_ids: tuple[str, ...]

def load_inventory_presets(path: Path | None = None) -> tuple[InventoryPreset, ...]: ...
```

Reject unknown fields, duplicate preset IDs/names, duplicate item IDs within a preset, invalid namespaced IDs, empty values, and schema versions other than 1. Build inventory IDs as `ingredient_ids | preset_item_ids`, resolve English names through the existing item-then-block translation lookup, and report missing translations through `ValidationReport`. Emit sorted preset records as one of the same atomic generation set.

- [ ] **Step 5: Write failing browser schema tests, then parse the fifth artifact**

```ts
it('loads generated presets and rejects unknown inventory references', () => {
  const data = parseGeneratedData(items, inventoryItems, recipes, collections, presets)
  expect(data.presets.get('overworld')?.itemIds).toContain('minecraft:oak_leaves')
  expect(() => parseGeneratedData(items, inventoryItems, recipes, collections,
    presetPayload(['minecraft:missing']))).toThrow('references missing inventory item')
})
```

Change `loadGeneratedData` to fetch `data/inventory-presets.json` with the other four artifacts. `BUILT_IN_INVENTORY_PRESETS` becomes a sorted adapter over `data.presets`; it must contain no copied item-ID literals.

- [ ] **Step 6: Regenerate and verify the real artifacts**

```powershell
.\.venv\Scripts\mcsr-generate.exe --source minecraft-data --output web/public/data
.\.venv\Scripts\python.exe -m pytest generator/tests/test_presets.py generator/tests/test_generate.py -q
pnpm --dir web test --run src/data/schema.test.ts
```

Expected: 634 recipes, 562 outputs, 283 inventory items, 354 collections, zero validation errors; all focused tests pass.

- [ ] **Step 7: Commit canonical presets and generated data**

```powershell
git add -- generator/src/mcsr_data/inventory_presets.json generator/src/mcsr_data/presets.py generator/src/mcsr_data/generate.py generator/tests/test_presets.py generator/tests/test_generate.py web/src/domain/types.ts web/src/data/schema.ts web/src/data/schema.test.ts web/src/presets/builtInPresets.ts web/public/data
git commit -m "feat: add MCSR inventory presets"
```

After this commit, return to icon-exporter Task 8 and import the real icons before continuing here.

---

### Task 2: Migrate persistence to independent per-row inventories

**Files:**
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/persistence/storage.ts`
- Modify: `web/src/persistence/storage.test.ts`
- Create: `web/src/workspace/entryDraft.ts`
- Create: `web/src/workspace/entryDraft.test.ts`

- [ ] **Step 1: Write failing version-1 migration and version-2 round-trip tests**

```ts
it('migrates every valid v1 row with an empty exact inventory', () => {
  storage.setItem('mcsr.target-workspace.v1', JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'late', targetIds: ['minecraft:stick'], enabled: true, gridSize: 2, order: 4 }],
  }))
  const loaded = loadTargetWorkspace(storage)
  expect(loaded.value.entries[0]).toEqual({
    id: 'late', targetIds: ['minecraft:stick'], inventoryItemIds: [],
    enabled: true, gridSize: 2, order: 4,
  })
  expect(JSON.parse(storage.getItem('mcsr.target-workspace.v1')!).schemaVersion).toBe(2)
  expect([...storageKeys(storage)].some((key) => key.startsWith('mcsr.recovery.target-workspace.'))).toBe(true)
})

it('round-trips independent v2 inventories without changing custom slots', () => {
  saveTargetWorkspace({ entries: [entry('a', ['minecraft:stick']), entry('b', ['minecraft:bucket'])] }, storage)
  expect(loadTargetWorkspace(storage).value.entries.map((entry) => entry.inventoryItemIds)).toEqual([
    ['minecraft:stick'], ['minecraft:bucket'],
  ])
  expect(storage.getItem('mcsr.inventory-slots.v1')).toBe(originalSlots)
})
```

Add malformed member, duplicate-array normalization, unsupported version, storage access/write failure, and stable-order cases.

- [ ] **Step 2: Run persistence tests and observe schema failures**

Run: `pnpm --dir web test --run src/persistence/storage.test.ts`

Expected: v1 rows lack `inventoryItemIds`, saved records still use schema version 1, and no migration recovery copy exists.

- [ ] **Step 3: Implement strict v2 encoding and one-time v1 migration**

Keep the existing storage key so old data is discoverable. Define separate validators:

```ts
interface VersionedTargetWorkspaceV1 { schemaVersion: 1; entries: TargetWorkspaceEntryV1[] }
interface VersionedTargetWorkspaceV2 extends TargetWorkspace { schemaVersion: 2 }

function migrateWorkspaceV1(value: VersionedTargetWorkspaceV1): TargetWorkspace {
  return { entries: value.entries.map((entry) => ({ ...entry, inventoryItemIds: [] })) }
}
```

Before replacing a valid v1 value, write its exact raw string to a recovery key; then save v2. Sort/deduplicate target and inventory arrays on save without changing row order. Preserve all current invalid-data and in-memory fallback behavior. Do not change `mcsr.inventory-slots.v1` or its schema.

- [ ] **Step 4: Write and implement draft/grid normalization tests**

```ts
it('forces incompatible 2x2 drafts to 3x3 without a message', () => {
  const normalized = normalizeDraftGrid(
    { ...newDraft(), gridSize: 2, targetIds: ['minecraft:iron_sword'] }, recipes,
  )
  expect(normalized.gridSize).toBe(3)
  expect(canDraftUse2x2(normalized, recipes)).toBe(false)
})

it('copies arrays when opening and applying a preset', () => {
  const draft = draftFromEntry(savedEntry)
  const changed = applyInventoryPreset(draft, preset)
  changed.inventoryItemIds.push('minecraft:stick')
  expect(savedEntry.inventoryItemIds).not.toContain('minecraft:stick')
  expect(preset.itemIds).not.toContain('minecraft:stick')
})
```

Implement `newItemSetDraft`, `draftFromEntry`, `applyInventoryPreset`, `canDraftUse2x2`, `normalizeDraftGrid`, and `validateItemSetDraft`. New drafts default to enabled, 3x3, empty targets, and empty inventory.

- [ ] **Step 5: Rerun persistence and draft tests**

Run: `pnpm --dir web test --run src/persistence/storage.test.ts src/workspace/entryDraft.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit the migration and draft model**

```powershell
git add -- web/src/domain/types.ts web/src/persistence/storage.ts web/src/persistence/storage.test.ts web/src/workspace/entryDraft.ts web/src/workspace/entryDraft.test.ts
git commit -m "feat: persist inventory per item set"
```

---

### Task 3: Normalize and rank single and overlap searches together

**Files:**
- Create: `web/src/engine/rankedSearch.ts`
- Create: `web/src/engine/rankedSearch.test.ts`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/engine/optimizeWorkspace.ts`
- Modify: `web/src/engine/optimizeWorkspace.test.ts`
- Modify: `web/src/engine/singleOptimizer.ts`
- Modify: `web/src/engine/overlapOptimizer.ts`

- [ ] **Step 1: Write failing cross-category comparator tests**

```ts
it('mixes single and overlap results by the approved total ordering', () => {
  const ranked = rankSearches(
    [single({ query: 'abc', total: 4, junk: ['x'] }), single({ query: 'z', total: 2 })],
    [overlap({ queries: ['b', 'bo'], total: 1 }), overlap({ queries: ['a', 'ax'], total: 2 })],
  )
  expect(ranked.map((result) => result.queries.join('→'))).toEqual(['b→bo', 'z', 'a→ax', 'abc'])
})

it('breaks equal scores by junk, steps, typed characters, then lexical sequence', () => {
  const ranked = [...fixtures].sort(compareRankedSearches)
  expect(ranked.map(searchKey)).toEqual(expectedKeys)
})
```

Add tests proving a single result has one score step, overlap carries junk separately for every step, backspaces do not enter `totalTypedCharacters`, and the underlying score totals are copied rather than recomputed by the view.

- [ ] **Step 2: Run the focused ranking test and observe the missing adapter**

Run: `pnpm --dir web test --run src/engine/rankedSearch.test.ts`

Expected: module resolution fails for `rankedSearch.ts`.

- [ ] **Step 3: Implement adapters and the deterministic comparator**

Expose:

```ts
export function rankedFromSingle(result: SingleResult): RankedSearch
export function rankedFromOverlap(result: OverlapResult): RankedSearch
export function compareRankedSearches(left: RankedSearch, right: RankedSearch): number
export function rankSearches(single: readonly SingleResult[], overlap: readonly OverlapResult[]): RankedSearch[]
export function searchSequenceLabel(result: RankedSearch): string
```

For a single result, `queries=[query]`, `totalJunkAppearances=junkItemIds.length`, `totalTypedCharacters=query.length`, and the single step's `typingPenalty=score.lengthPenalty`. For overlap, preserve every raw step; `totalTypedCharacters=newCharacterCount`; allocate the existing aggregate typing/junk values to steps from each step's typed suffix and junk IDs so their sum exactly equals `OverlapResult.score.total`. Comparator lexical ordering compares query strings element-by-element, then sequence length.

- [ ] **Step 4: Write failing per-entry inventory and no-viable tests**

```ts
it('optimizes each entry from only its own exact inventory', async () => {
  const craftable = await optimizeWorkspaceEntry(data, entry({ inventoryItemIds: ['minecraft:oak_planks'] }))
  const empty = await optimizeWorkspaceEntry(data, entry({ inventoryItemIds: [] }))
  expect(craftable.kind).toBe('ranked')
  expect(empty).toMatchObject({ kind: 'no-viable', bestScore: incompleteScore(1, 0) })
})

it('does not convert an unexpected optimizer rejection into no-viable', async () => {
  await expect(optimizeWorkspaceEntry(corruptData, entry())).rejects.toThrow('missing collection')
})
```

- [ ] **Step 5: Refactor the engine around `optimizeWorkspaceEntry`**

Expose:

```ts
export async function optimizeWorkspaceEntry(
  data: GeneratedData,
  entry: TargetWorkspaceEntry,
  options?: OptimizeWorkspaceOptions,
): Promise<EntryOptimizationOutcome>

export function aggregateEnglishScore(
  entries: readonly TargetWorkspaceEntry[],
  states: ReadonlyMap<string, RowOptimizationState>,
): { status: 'blank' | 'pending' | 'unavailable' | 'ready'; score?: number }
```

Construct the inventory as `new Set(entry.inventoryItemIds)`. Keep cooperative preparation/overlap code and progress. Filter overlap paths to two or more steps, merge all complete results, and return `no-viable` only when optimization completed but the merged list is empty. The no-viable score remains `incompleteScore(targetCount, visibleCount)`. Remove the global inventory argument from the runtime path.

- [ ] **Step 6: Verify existing scoring and alias acceptance remain unchanged**

Run:

```powershell
pnpm --dir web test --run src/engine/rankedSearch.test.ts src/engine/optimizeWorkspace.test.ts src/engine/scoring.test.ts src/engine/singleOptimizer.test.ts src/engine/overlapOptimizer.test.ts src/engine/realDataAcceptance.test.ts
```

Expected: all tests pass, including `wn`, `wn `, `re`, `ngo`, `ro`, and `oe` acceptance.

- [ ] **Step 7: Commit the unified engine**

```powershell
git add -- web/src/domain/types.ts web/src/engine/rankedSearch.ts web/src/engine/rankedSearch.test.ts web/src/engine/optimizeWorkspace.ts web/src/engine/optimizeWorkspace.test.ts web/src/engine/singleOptimizer.ts web/src/engine/overlapOptimizer.ts
git commit -m "feat: rank all search strategies together"
```

---

### Task 4: Cache, cancel, retry, and aggregate independent row calculations

**Files:**
- Create: `web/src/hooks/useRowOptimizations.ts`
- Create: `web/src/hooks/useRowOptimizations.test.tsx`
- Modify: `web/src/domain/types.ts`

- [ ] **Step 1: Write failing row-cache tests with a controlled optimizer**

```tsx
it('recalculates only the saved row whose fingerprint changed', async () => {
  const { rerender } = renderHook(({ entries }) => useRowOptimizations(data, entries, optimizer), {
    initialProps: { entries: [entryA, entryB] },
  })
  await settleAll()
  rerender({ entries: [{ ...entryA, inventoryItemIds: ['minecraft:stick'] }, entryB] })
  await settleAll()
  expect(optimizer.callsByEntry()).toEqual({ a: 2, b: 1 })
})

it('aborts obsolete work and ignores its later resolution', async () => {
  const first = deferredOutcome()
  optimizer.next(first.promise)
  const hook = renderHook(() => useRowOptimizations(data, [entryA], optimizer))
  hook.rerenderWith([{ ...entryA, gridSize: 2 }])
  await resolveLatest(readyOutcome(0))
  first.resolve(readyOutcome(99))
  expect(hook.result.current.states.get('a')).toMatchObject({ status: 'ready', outcome: { bestScore: 0 } })
})
```

Add cases for unchanged reorder, disabled row preserving cache, enabling an uncached row, row deletion abort, technical rejection becoming `error`, Retry using the same saved fingerprint, and aggregate blank/pending/unavailable/ready states.

- [ ] **Step 2: Run the hook tests and observe the missing module**

Run: `pnpm --dir web test --run src/hooks/useRowOptimizations.test.tsx`

Expected: module resolution fails for the hook.

- [ ] **Step 3: Implement stable fingerprints and per-row controllers**

```ts
export function entryOptimizationFingerprint(entry: TargetWorkspaceEntry): string {
  return JSON.stringify({
    targetIds: [...new Set(entry.targetIds)].sort(),
    inventoryItemIds: [...new Set(entry.inventoryItemIds)].sort(),
    gridSize: entry.gridSize,
  })
}

export function useRowOptimizations(
  data: GeneratedData | undefined,
  entries: readonly TargetWorkspaceEntry[],
  optimize?: typeof optimizeWorkspaceEntry,
): {
  states: ReadonlyMap<string, RowOptimizationState>
  aggregate: ReturnType<typeof aggregateEnglishScore>
  retry(entryId: string): void
}
```

Store `{requestId, controller, fingerprint}` per row in refs. Never clear ready results for unchanged fingerprints. An enabled nonempty row starts only when it lacks a ready/pending state for the current fingerprint. Disabled rows display Disabled and retain a compatible cached result but do not affect aggregate. Removing a row aborts and removes its state.

- [ ] **Step 4: Rerun focused tests**

Run: `pnpm --dir web test --run src/hooks/useRowOptimizations.test.tsx`

Expected: all cache/cancel/retry/aggregate tests pass.

- [ ] **Step 5: Commit row coordination**

```powershell
git add -- web/src/domain/types.ts web/src/hooks/useRowOptimizations.ts web/src/hooks/useRowOptimizations.test.tsx
git commit -m "feat: cache item set calculations"
```

---

### Task 5: Build icon-first pickers, grid switch, rows, and save-gated editor

**Files:**
- Modify: `web/src/components/ItemPicker.tsx`
- Create: `web/src/components/ItemPicker.test.tsx`
- Create: `web/src/components/GridSizeSwitch.tsx`
- Create: `web/src/components/GridSizeSwitch.test.tsx`
- Create: `web/src/components/ItemSetRow.tsx`
- Create: `web/src/components/ItemSetWorkspace.tsx`
- Create: `web/src/components/ItemSetWorkspace.test.tsx`
- Create: `web/src/components/ItemSetEditor.tsx`
- Create: `web/src/components/ItemSetEditor.test.tsx`
- Modify: `web/src/workspace/entryDraft.ts`

- [ ] **Step 1: Write failing icon-first picker and grid-switch tests**

```tsx
it('searches names and IDs but presents selectable icons with accessible names', async () => {
  render(<ItemPicker items={items} selectedIds={[]} manifest={icons} onChange={onChange} label="Inventory" />)
  await user.type(screen.getByRole('searchbox', { name: 'Search Inventory' }), 'oak lea')
  await user.click(screen.getByRole('checkbox', { name: 'Oak Leaves minecraft:oak_leaves' }))
  expect(onChange).toHaveBeenCalledWith(['minecraft:oak_leaves'])
  expect(screen.getByRole('img', { name: 'Oak Leaves' })).toBeInTheDocument()
})

it('silently forces and locks 3x3 when any goal needs it', async () => {
  render(<GridSizeSwitch value={2} targetIds={['minecraft:iron_sword']} recipes={recipes} onChange={onChange} />)
  expect(screen.getByRole('switch', { name: 'Crafting grid size' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('switch', { name: 'Crafting grid size' })).toBeDisabled()
  expect(screen.queryByText(/cannot be crafted/i)).not.toBeInTheDocument()
})
```

The switch uses `aria-checked="true"` for the right/3x3 position and `false` for 2x2.

- [ ] **Step 2: Run focused tests and observe missing/new-contract failures**

Run: `pnpm --dir web test --run src/components/ItemPicker.test.tsx src/components/GridSizeSwitch.test.tsx`

Expected: new component/module or prop-contract failures.

- [ ] **Step 3: Implement the reusable picker and silent grid switch**

The picker takes `ReadonlyMap<string, {id; name}>`, controlled selected IDs, the icon manifest, and an `allowSelection` predicate. Render selected icon tiles first, then at most 40 alphabetically sorted matches. Goal use passes `data.items`; inventory use passes `data.inventoryItems`. The switch effect calls `onChange(3)` once if a controlled incompatible value of 2 arrives, and otherwise emits only user changes.

- [ ] **Step 4: Write failing editor lifecycle and preset-copy tests**

```tsx
it('keeps saved rows and results untouched until Save', async () => {
  renderWorkspace({ entries: [saved], outcome: readyOutcome(2) })
  await user.click(screen.getByRole('button', { name: 'Edit item set 1' }))
  await selectInventory('minecraft:bucket')
  expect(onWorkspaceChange).not.toHaveBeenCalled()
  expect(screen.queryByText('No viable search')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save item set' }))
  expect(onWorkspaceChange).toHaveBeenCalledWith(expect.objectContaining({
    entries: [expect.objectContaining({ inventoryItemIds: ['minecraft:bucket'] })],
  }))
})

it('applies a built-in preset as an editable copy and allows empty inventory', async () => {
  renderEditor(newDraft())
  await user.selectOptions(screen.getByLabelText('Inventory preset'), 'overworld')
  await removeInventory('minecraft:dirt')
  expect(overworld.itemIds).toContain('minecraft:dirt')
  await clearInventory()
  expect(screen.getByRole('button', { name: 'Save item set' })).toBeDisabled() // no goal yet only
})
```

Add tests for Add/Cancel, edit/Cancel, dirty row-switch blocking, Delete confirmation, immediate enable, keyboard reorder, three custom slots/name persistence, exact goal-only output catalog, exact inventory catalog, grid default/force, and icon tooltips/ARIA.

- [ ] **Step 5: Implement compact rows and workspace ordering**

`ItemSetRow` displays ordered goal icons, one 2x2/3x3 metric badge, an accessible enabled checkbox, up/down buttons, and one edit button/row click target. `ItemSetWorkspace` owns no draft data; it renders sorted saved entries and emits immediate enable/reorder changes plus `onEdit(entryId)` and `onAdd()`.

- [ ] **Step 6: Implement the right-column draft editor**

Use this prop boundary:

```ts
interface ItemSetEditorProps {
  state: Extract<EditorState, { kind: 'new' | 'existing' }>
  data: GeneratedData
  icons: IconManifest
  customSlots: Array<CustomInventoryPreset | null>
  onDraftChange(draft: ItemSetDraft): void
  onSave(commit: ItemSetEditorCommit): void
  onCancel(): void
  onDelete?(): void
  onSaveCustomSlot(index: number, preset: CustomInventoryPreset): void
  onClearCustomSlot(index: number): void
}
```

Save is enabled iff at least one target exists and every target/inventory ID belongs to the correct catalog. Inventory may be empty. Applying any preset replaces only `inventoryItemIds`. Custom-slot save asks for a controlled name defaulting to current name or `Custom 1`–`Custom 3`. Delete uses a native or app dialog whose accessible prompt names the item-set number; cancellation makes no mutation.

- [ ] **Step 7: Rerun focused component tests**

Run:

```powershell
pnpm --dir web test --run src/components/ItemPicker.test.tsx src/components/GridSizeSwitch.test.tsx src/components/ItemSetWorkspace.test.tsx src/components/ItemSetEditor.test.tsx
pnpm --dir web typecheck
```

Expected: all tests and typecheck pass; no rendered text matches `cannot be crafted in a 2x2 grid`.

- [ ] **Step 8: Commit item-set editing**

```powershell
git add -- web/src/components/ItemPicker.tsx web/src/components/ItemPicker.test.tsx web/src/components/GridSizeSwitch.tsx web/src/components/GridSizeSwitch.test.tsx web/src/components/ItemSetRow.tsx web/src/components/ItemSetWorkspace.tsx web/src/components/ItemSetWorkspace.test.tsx web/src/components/ItemSetEditor.tsx web/src/components/ItemSetEditor.test.tsx web/src/workspace/entryDraft.ts
git commit -m "feat: edit independent item sets"
```

---

### Task 6: Present unified top-three/top-ten results, score tooltips, and match evidence

**Files:**
- Create: `web/src/components/CalculatedSearchRow.tsx`
- Create: `web/src/components/CalculatedSearchRow.test.tsx`
- Create: `web/src/components/ScoreBreakdownPopover.tsx`
- Create: `web/src/components/ScoreBreakdownPopover.test.tsx`
- Create: `web/src/components/MatchEvidence.tsx`
- Create: `web/src/components/MatchEvidence.test.tsx`
- Create: `web/src/components/LanguageRanking.tsx`
- Create: `web/src/components/LanguageRanking.test.tsx`

- [ ] **Step 1: Write failing collapsed/expanded ranking tests**

```tsx
it('shows the best three total and expands to at most ten total', async () => {
  render(<CalculatedSearchRow entry={entry} state={readyWithTwelve()} {...sharedProps} />)
  expect(screen.getByText('wn, bed → bow, re')).toBeInTheDocument()
  expect(screen.queryByText('Rank 4')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show searches for item set 1' }))
  expect(screen.getAllByRole('listitem', { name: /Rank / })).toHaveLength(10)
})

it.each([
  ['disabled', 'Disabled'], ['pending', 'Calculating…'], ['no-viable', 'No viable search'],
  ['error', 'Calculation error'],
])('renders %s distinctly', (fixture, label) => {
  renderResultState(fixture)
  expect(screen.getByText(label)).toBeInTheDocument()
})
```

Assert Retry is present only for `error`, the maximum score appears for `no-viable`, and expanded state uses `aria-expanded`.

- [ ] **Step 2: Write failing score popover tests**

```tsx
it('uses engine-provided per-step junk charges on hover, focus, and tap', async () => {
  render(<ScoreBreakdownPopover search={bedToBowWithJunk} items={items} icons={icons} />)
  const badge = screen.getByRole('button', { name: 'Score 4.5; show calculation' })
  await user.hover(badge)
  expect(screen.getByText('bed: typing +1, junk present +2, 1 junk item +0.5')).toBeVisible()
  await user.unhover(badge)
  badge.focus()
  expect(screen.getByText('bow: typed “ow” +2, junk +0')).toBeVisible()
  await user.click(badge)
  expect(badge).toHaveAttribute('aria-expanded', 'true')
})
```

Use Figtree only on the numeric badge and totals; descriptive sentences remain Geom.

- [ ] **Step 3: Write failing direct/alias match-evidence tests**

```tsx
it('highlights the matched span and identifies an alias member separately', () => {
  render(<MatchEvidence explanation={brownBedAlias} items={items} icons={icons} />)
  expect(screen.getByRole('img', { name: 'Brown Bed' })).toBeInTheDocument()
  expect(screen.getByLabelText('matches craftable White Bed')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'White Bed' })).toBeInTheDocument()
  expect(screen.getByText('wn', { selector: 'mark' })).toBeInTheDocument()
  expect(screen.getByText('Brown Bed', { exact: true })).toHaveAccessibleDescription(/full searchable line/i)
})
```

Add a direct-match case with no alias arrow and an invalid UTF-16 span case that renders a scoped data error rather than highlighting the wrong characters.

- [ ] **Step 4: Run focused tests and observe missing components**

Run: `pnpm --dir web test --run src/components/CalculatedSearchRow.test.tsx src/components/ScoreBreakdownPopover.test.tsx src/components/MatchEvidence.test.tsx`

Expected: module resolution failures.

- [ ] **Step 5: Implement result rows and exact score presentation**

The collapsed summary uses `rankedSearches.slice(0, 3).map(searchSequenceLabel).join(', ')`. Expansion renders `slice(0, 10)` and keeps the summary visible. Every rank includes query/sequence, score badge, target icons, step junk icons, and compact evidence. Do not rerank or recalculate score components in React.

The popover button opens persistently on click/tap and temporarily on pointer hover or keyboard focus. Escape closes a pinned popover, focus remains on the trigger, and only one popover ID is referenced by `aria-controls`.

- [ ] **Step 6: Implement compact highlighted evidence**

Validate `matchedSpan.start/end/text` against the source line before slicing. Show exact output icon only for a direct match. For a collection alias show `matchedMember icon → visibleOutput icon`, with accessible names for both sides. Put full source/member/output explanation in `aria-describedby` and title text, not permanent paragraphs.

- [ ] **Step 7: Write and implement language aggregate tests**

```tsx
it('is blank without enabled nonempty rows and otherwise shows English combined score', () => {
  const { rerender } = render(<LanguageRanking aggregate={{ status: 'blank' }} />)
  expect(screen.queryByText('English')).not.toBeInTheDocument()
  rerender(<LanguageRanking aggregate={{ status: 'ready', score: 7.5 }} />)
  expect(screen.getByText('English')).toBeInTheDocument()
  expect(screen.getByText('7.5')).toHaveClass('metric')
})
```

Pending renders English with an accessible pending label; unavailable renders English with `Score unavailable` and never a numeric score.

- [ ] **Step 8: Rerun focused tests and typecheck**

Run:

```powershell
pnpm --dir web test --run src/components/CalculatedSearchRow.test.tsx src/components/ScoreBreakdownPopover.test.tsx src/components/MatchEvidence.test.tsx src/components/LanguageRanking.test.tsx
pnpm --dir web typecheck
```

Expected: all commands pass.

- [ ] **Step 9: Commit result and language presentation**

```powershell
git add -- web/src/components/CalculatedSearchRow.tsx web/src/components/CalculatedSearchRow.test.tsx web/src/components/ScoreBreakdownPopover.tsx web/src/components/ScoreBreakdownPopover.test.tsx web/src/components/MatchEvidence.tsx web/src/components/MatchEvidence.test.tsx web/src/components/LanguageRanking.tsx web/src/components/LanguageRanking.test.tsx
git commit -m "feat: present unified crafting searches"
```

---

### Task 7: Compose the three-column application with save-gated state

**Files:**
- Modify: `web/src/App.tsx`
- Rewrite: `web/src/App.test.tsx`
- Delete: `web/src/components/InventoryPanel.tsx`
- Delete: `web/src/components/InventoryPanel.test.tsx`
- Delete: `web/src/components/TargetSetList.tsx`
- Delete: `web/src/components/TargetSetList.test.tsx`
- Delete: `web/src/components/ResultPanel.tsx`
- Delete: `web/src/components/ResultPanel.test.tsx`

- [ ] **Step 1: Rewrite App tests around saved and draft state**

```tsx
it('opens the selected editor over the result column and preserves saved calculation until Save', async () => {
  render(<App />)
  await openItemSet(1)
  expect(screen.getByRole('region', { name: 'Edit item set 1' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Calculated searches' })).not.toBeInTheDocument()
  await changeDraftInventory(['minecraft:bucket'])
  expect(savedStorageEntry().inventoryItemIds).not.toContain('minecraft:bucket')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText(previousSummary)).toBeInTheDocument()
})
```

Add App tests for load failures, icon coverage failure, v1 migration/autosave, storage warnings, Add/Save, dirty-editor row blocking, per-row retry, independent row results, disabled aggregate exclusion, persisted custom slots, and stale result rejection delegated to the hook.

- [ ] **Step 2: Run App tests and observe failures against the old global layout**

Run: `pnpm --dir web test --run src/App.test.tsx`

Expected: tests fail because global `InventoryPanel`, inline `TargetSetList`, and `ResultPanel` are still rendered.

- [ ] **Step 3: Implement the app data/load boundary**

Load generated data and icon manifest in parallel, then call `assertIconCoverage`. Load workspace/custom slots once. After crafting data arrives, normalize persisted 2x2 entries silently and autosave schema v2. A generated-data or icon-manifest error is an application-level blocking error; a storage warning is nonblocking.

- [ ] **Step 4: Implement editor state transitions and saved mutations**

Use pure helpers in `App.tsx` or `entryDraft.ts`:

```ts
function commitDraft(workspace: TargetWorkspace, commit: ItemSetEditorCommit): TargetWorkspace
function deleteEntry(workspace: TargetWorkspace, entryId: string): TargetWorkspace
function moveEntry(workspace: TargetWorkspace, entryId: string, delta: -1 | 1): TargetWorkspace
function setEntryEnabled(workspace: TargetWorkspace, entryId: string, enabled: boolean): TargetWorkspace
```

Creating assigns a collision-free ID and next order only on Save. Updating preserves ID/order. Cancel closes without mutation. If editor state is dirty, edit/add requests for another row leave the current editor open. Immediate enable/reorder controls operate only on saved rows and persist at once.

- [ ] **Step 5: Compose the three persistent columns**

```tsx
<div className="workspace-grid">
  <LanguageRanking aggregate={aggregate} />
  <ItemSetWorkspace entries={workspace.entries} ... />
  <section className="results-column" aria-label={editorOpen ? editorLabel : 'Calculated searches'}>
    {editorOpen
      ? <ItemSetEditor ... />
      : orderedEntries.map((entry, index) => <CalculatedSearchRow key={entry.id} ... />)}
  </section>
</div>
```

Middle and right rows use the same ordered entry sequence. Add a decorative, `aria-hidden` chevron between each pair; hide the selected chevron while the editor covers the right column. Empty states are restrained; languages stay blank until a scored row exists.

- [ ] **Step 6: Remove obsolete global components after coverage moves**

Delete `InventoryPanel`, `TargetSetList`, and `ResultPanel` plus their old tests only after the replacement component and App suites pass. Confirm no imports or CSS selectors remain with:

Run: `rg -n "InventoryPanel|TargetSetList|ResultPanel|grid-error|grid-choice" web/src`

Expected: no matches.

- [ ] **Step 7: Rerun App and all component tests**

Run: `pnpm --dir web test --run`

Expected: all Vitest tests pass.

- [ ] **Step 8: Commit the app composition**

```powershell
git add -- web/src/App.tsx web/src/App.test.tsx web/src/components
git commit -m "feat: compose three-column crafting workspace"
```

---

### Task 8: Apply the pastel theme, supplied fonts, and responsive layout

**Files:**
- Modify: `web/src/App.css`
- Modify: `web/src/index.css`
- Create: `web/src/assets/fonts/Geom-Medium.ttf`
- Create: `web/src/assets/fonts/Coiny-Regular.ttf`
- Create: `web/src/assets/fonts/Figtree-VariableFont_wght.ttf`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Copy the three supplied fonts into the repository**

Copy exactly:

```text
R:\mcsr ranked shit\font\Geom-Medium.ttf
  -> web/src/assets/fonts/Geom-Medium.ttf
R:\mcsr ranked shit\font\Coiny-Regular.ttf
  -> web/src/assets/fonts/Coiny-Regular.ttf
R:\mcsr ranked shit\font\Figtree-VariableFont_wght.ttf
  -> web/src/assets/fonts/Figtree-VariableFont_wght.ttf
```

Record source and destination hashes during execution and verify the copies are byte-identical before committing.

- [ ] **Step 2: Add a failing style-contract test**

```tsx
it('marks titles, body text, and standalone scores with their intended font roles', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'MCSR Search Crafting' })).toHaveClass('display-title')
  expect(screen.getByRole('main')).toHaveClass('app-shell')
  expect(screen.getByText('English').closest('.language-row')).toContainElement(
    screen.getByText('7.5'),
  )
  expect(screen.getByText('7.5')).toHaveClass('metric')
})
```

- [ ] **Step 3: Run the App test and observe missing class/theme assertions**

Run: `pnpm --dir web test --run src/App.test.tsx`

Expected: style-contract assertions fail until the new shell classes exist.

- [ ] **Step 4: Define fonts and semantic color tokens**

```css
@font-face { font-family: 'Geom'; src: url('./assets/fonts/Geom-Medium.ttf') format('truetype'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'Coiny'; src: url('./assets/fonts/Coiny-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Figtree'; src: url('./assets/fonts/Figtree-VariableFont_wght.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }

:root {
  --page: #fff2f4;
  --panel: #ffe1e6;
  --panel-selected: #ffcbd5;
  --border: #d98798;
  --accent: #d9586c;
  --accent-strong: #ad344d;
  --text: #5b2030;
  --muted: #875565;
  --match: #ffd27d;
  --error: #9f233d;
  --focus: #7b2746;
}
```

Verify WCAG AA contrast for ordinary text/control states and adjust tokens only within the approved pink/red palette if any pair fails.

- [ ] **Step 5: Implement desktop grid and narrow stacking**

Use `grid-template-columns: minmax(12rem, .72fr) minmax(20rem, 1.05fr) minmax(28rem, 1.45fr)` with aligned row gaps. At a breakpoint where those minimums no longer fit, switch to one column in logical DOM order. Do not horizontally compress icon controls below 44px pointer targets. Use `image-rendering: pixelated` for all item PNGs.

Selected, hover, focus, disabled, pending, no-viable, and error states require a text/icon/border cue in addition to color. Avoid heavy shadows. Apply Coiny only to `.display-title` and major `h2`; Geom is the default; Figtree 800 applies only to `.metric`.

- [ ] **Step 6: Verify local font bundling and production CSS**

Run:

```powershell
pnpm --dir web test --run src/App.test.tsx
pnpm --dir web typecheck
pnpm --dir web build
rg -n "fonts.googleapis|https://.*font" web/src web/dist
```

Expected: tests/typecheck/build pass and the external-font search returns no matches.

- [ ] **Step 7: Commit the visual system**

```powershell
git add -- web/src/App.css web/src/index.css web/src/assets/fonts web/src/App.test.tsx
git commit -m "style: add pastel crafting workspace theme"
```

---

### Task 9: Replace end-to-end coverage and complete the release gate

**Files:**
- Rewrite: `web/e2e/app.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the independent-inventory draft/persistence journey**

Create two rows through the UI:

1. Row 1: Overworld preset, goals Oak Slab and Oak Stairs, 3x3.
2. Row 2: empty inventory initially, goal Stick, then edit to add Oak Planks, 2x2.
3. Before each Save, assert the right result and English aggregate do not change.
4. After Save, assert each row calculates from only its own inventory.
5. Reorder, disable one row, and assert English excludes it.
6. Reload and verify row order, inventories, enabled states, grids, and custom slot names/items.

- [ ] **Step 2: Write the result, evidence, and error-state journeys**

Route deterministic fixtures and assert:

- collapsed top 3 mixes single and overlap by total order;
- expanded rows render ranks 1–10 only;
- a score badge exposes per-step character and junk charges by focus and click;
- `wn` shows Brown Bed alias icon → exact White Bed icon and highlighted `wn`;
- `wn `, `re`, `ngo`, `ro`, and `oe` retain their real-data behavior;
- empty inventory yields No viable search plus maximum score;
- injected optimizer rejection yields Calculation error, Retry, and unavailable English aggregate.

- [ ] **Step 3: Write the grid/editor/responsive journeys**

Assert:

- a new row defaults to 3x3;
- a 2x2-compatible goal permits the switch;
- adding a 3x3-only goal silently returns/locks it to 3x3 and no warning text exists;
- clicking a middle row covers the right column with the editor while the middle row stays visible;
- Cancel restores the old result;
- at 1440px the three columns are side by side;
- at 720px they stack Languages, Item sets, Calculated searches/editor.

- [ ] **Step 4: Run Playwright and fix only evidence-backed failures**

Run: `pnpm --dir web e2e`

Expected: every Chromium journey passes with no console errors or failed icon requests.

- [ ] **Step 5: Update README for the finished workflow**

Document Node/pnpm prerequisites, `pnpm --dir web dev --host 127.0.0.1`, local URL, English-only scope, per-row infinite inventories, the three built-in presets, custom slots, grid behavior, top-three/top-ten unified ranking, icon provenance/import link, persistence migration, and all verification commands.

- [ ] **Step 6: Run the complete clean verification matrix**

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests -q
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web e2e
git diff --check
```

Expected: Python reports the full passing suite, Vitest reports the full passing suite, typecheck/build/e2e exit 0, and `git diff --check` prints nothing.

- [ ] **Step 7: Inspect the built application locally**

Start `pnpm --dir web dev --host 127.0.0.1`, open `http://127.0.0.1:5173/`, and inspect desktop and narrow layouts. Verify the user-supplied fonts load, representative icons are crisp and correct, the palette matches the approved pastel pink/red direction, no result flashes during draft editing, and keyboard focus traverses columns/editor logically.

- [ ] **Step 8: Commit end-to-end coverage and documentation**

```powershell
git add -- web/e2e/app.spec.ts README.md
git commit -m "test: cover redesigned crafting workspace"
```

---

## Final Verification Checklist

- [ ] Generator reports 634 recipes, 562 outputs, 283 inventory items, 354 collections, and zero errors.
- [ ] The browser fetches and validates the one generated preset artifact; no TypeScript item-list copy exists.
- [ ] The imported icon manifest covers all 562 search outputs and all 283 selectable inventory IDs.
- [ ] Workspace v1 rows migrate with empty inventories and a recovery copy; v2 rows round-trip independently.
- [ ] Custom slots retain schema/key compatibility and store only name plus exact item IDs.
- [ ] Draft changes do not affect saved results, persistence, or aggregate before Save.
- [ ] Empty inventory is valid and yields a maximum-score no-viable outcome.
- [ ] 2x2 silently forces/locks to 3x3 for an incompatible goal and renders no warning.
- [ ] Single and overlap results share the approved five-level deterministic order.
- [ ] Collapsed rows show top 3; expanded rows retain the summary and show at most top 10.
- [ ] Score popovers show engine-provided per-step characters and junk charges by hover, focus, and tap.
- [ ] Match evidence highlights exact spans and always distinguishes collection alias member from visible output.
- [ ] Calculation errors expose Retry and block aggregate; no-viable outcomes contribute maximum score.
- [ ] English is blank with no enabled nonempty rows and otherwise sums enabled outcomes only.
- [ ] Compact items are icon-first with English hover and accessible names.
- [ ] Coiny, Geom, and Figtree are bundled locally and used only in their approved roles.
- [ ] Desktop columns and narrow stacked layout both pass Playwright and manual inspection.
- [ ] Full Python, Vitest, TypeScript, Vite, and Playwright gates pass.

