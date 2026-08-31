### Task 7: Lock real-data acceptance behavior, document it, and verify the complete system

**Files:**
- Create: `web/src/engine/realDataAcceptance.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add a generated-data acceptance harness**

Import the four tracked JSON payloads from `web/public/data`, pass them through `parseGeneratedData`, and expose a helper:

```typescript
function outputsFor(
  query: string,
  inventoryIds: string[],
  gridSize: 2 | 3 = 3,
): Set<string> {
  const eligible = eligibleRecipes(data.recipes, new Set(inventoryIds), gridSize)
  return new Set(matchEligibleCollectionOutputs(query, eligible, data.collections, data.items).keys())
}
```

This test must exercise the same parser and engine code as the app, not inspect raw names directly.

- [ ] **Step 2: Assert the confirmed `wn`, `wn `, and `re` behaviors**

With exact infinite inventory IDs:

```typescript
const groupedInventory = [
  'minecraft:white_wool',
  'minecraft:oak_planks',
  'minecraft:stick',
  'minecraft:crying_obsidian',
  'minecraft:glowstone',
  'minecraft:string',
]
const expectedGrouped = new Set([
  'minecraft:white_bed',
  'minecraft:respawn_anchor',
  'minecraft:white_carpet',
  'minecraft:white_banner',
])
expect(outputsFor('wn', groupedInventory)).toEqual(expectedGrouped)
expect(outputsFor('wn ', groupedInventory)).toEqual(expectedGrouped)
const reOutputs = outputsFor('re', groupedInventory)
for (const itemId of expectedGrouped) expect(reOutputs.has(itemId)).toBe(true)
expect(outputsFor('wn', ['minecraft:string']).has('minecraft:white_wool')).toBe(false)
```

Use explicit `Set` inclusion assertions for `re` if it legitimately includes additional direct-name outputs; do not weaken `wn` or `wn ` from exact equality.

- [ ] **Step 3: Assert direct-name regression examples**

```typescript
const ingotOutputs = outputsFor('ngo', [
  'minecraft:iron_nugget',
  'minecraft:iron_block',
  'minecraft:gold_nugget',
  'minecraft:gold_block',
])
expect(ingotOutputs.has('minecraft:iron_ingot')).toBe(true)
expect(ingotOutputs.has('minecraft:gold_ingot')).toBe(true)

expect(outputsFor('ro', ['minecraft:iron_ingot', 'minecraft:stick']).has('minecraft:iron_axe')).toBe(true)
expect(outputsFor('oe', ['minecraft:iron_ingot', 'minecraft:stick']).has('minecraft:iron_hoe')).toBe(true)
```

Also call `candidateQueriesForTargets` for exact White Bed and assert it includes `wn` and `wn `.

- [ ] **Step 4: Run the acceptance test and diagnose data or engine mismatches**

Run: `pnpm --dir web test --run src/engine/realDataAcceptance.test.ts`

Expected: PASS for all six confirmed query examples and White Wool isolation. If a direct-name result set contains additional legitimate outputs, assert the named inclusions while retaining exact output-ID accounting.

- [ ] **Step 5: Update the README contract**

Document:

- schema version 3 and all five generated data artifacts;
- the 634/562/281/354 production counts;
- category-plus-group and ungrouped collection construction;
- match-all-members then emit-only-eligible semantics;
- Brown Bed alias to craftable White Bed as the motivating example;
- exact inventory/target/output/junk identity and no generic color collapse;
- the fourth runtime fetch and mixed-schema rejection;
- the real-data acceptance queries and browser alias explanation coverage.

- [ ] **Step 6: Run all final verification from a clean task branch**

Run each command separately and retain its final count/output:

```powershell
.\.venv\Scripts\python.exe -m pytest -v
.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data
pnpm --dir web test --run
pnpm --dir web run typecheck
pnpm --dir web run build
pnpm --dir web run e2e
git diff --check
git status --short
```

Expected:

```text
Python suite: all tests pass
Generation: 634 recipes, 562 outputs, 281 inventory items, 354 collections, 0 errors
Vitest: all tests pass
TypeScript: no errors
Vite: production build succeeds
Playwright: all tests pass at the configured 1440x1000 viewport
git diff --check: no output
git status: only intended tracked changes plus the preserved untracked .pnpm-store/
```

- [ ] **Step 7: Scan the plan/spec and implementation for unfinished markers and schema drift**

Run:

```powershell
$unfinishedPattern = ('T'+'BD|F'+'IXME|Not'+'Implemented|schema'+'Version: 2|schema_'+'version.: 2')
rg -n $unfinishedPattern docs/superpowers/specs/2026-08-28-recipe-result-collection-search-design.md docs/superpowers/plans/2026-08-28-recipe-result-collection-search-implementation.md generator web/src web/e2e README.md
```

Expected: no unfinished marker and no schema-version-2 generated-data fixture. Persistence schema version 1 keys remain valid and are outside this generated-data check.

- [ ] **Step 8: Request final code review and address only verified findings**

Use `superpowers:requesting-code-review` against the complete task branch. The review must check every acceptance fixture, collection graph integrity, exact item boundary, cancellation, score invariance, generated-data determinism, UI alias wording, and unrelated-file preservation. Apply validated corrections with focused regression tests, then rerun Step 6.

- [ ] **Step 9: Commit documentation and acceptance coverage**

```powershell
git add -- web/src/engine/realDataAcceptance.test.ts README.md
git commit -m "test: lock recipe collection search behavior"
```

Do not merge, delete the task branch/worktree, or remove local artifacts in this task. After verification and review are clean, use `superpowers:finishing-a-development-branch` and present the integration choices to the user.
