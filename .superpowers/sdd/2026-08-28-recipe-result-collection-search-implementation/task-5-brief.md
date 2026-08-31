### Task 5: Feed collection matches through single, overlap, and workspace optimization

**Files:**
- Modify: `web/src/engine/singleOptimizer.ts`
- Modify: `web/src/engine/singleOptimizer.test.ts`
- Modify: `web/src/engine/overlapOptimizer.ts`
- Modify: `web/src/engine/overlapOptimizer.test.ts`
- Modify: `web/src/engine/optimizeWorkspace.ts`
- Modify: `web/src/engine/optimizeWorkspace.test.ts`

**Interfaces:**

```typescript
export interface OptimizeInput {
  targetIds: ReadonlySet<string>
  eligibleRecipes: readonly CraftingRecipe[]
  recipes: readonly CraftingRecipe[]
  collections: ReadonlyMap<string, RecipeResultCollection>
  items: ReadonlyMap<string, SearchItem>
}
```

`SingleResult.explanations`, `PreparedCandidate.explanations`, and `OverlapStep.explanations` become `CollectionMatchExplanation[]`.

- [ ] **Step 1: Update optimizer fixtures to explicit collection graphs**

Replace flat `visibleItemIds` fixtures with recipes, eligible recipes, collections, and items. Use one helper that constructs an isolated collection for ordinary direct-name tests so the pre-existing score/tie cases remain readable.

- [ ] **Step 2: Add failing optimizer-level alias tests**

Assert that:

- White Bed can be completely covered by query `wn` through the Brown Bed member;
- Brown Bed is never counted as visible junk when its recipe is not eligible;
- a craftable White Carpet exposed by the same query is exact junk when only White Bed is targeted;
- candidate generation includes `wn` even though White Bed's own lines do not;
- the overlap path carries alias-aware explanations at each step;
- junk is still charged separately on every overlap step.

- [ ] **Step 3: Run focused optimizer tests and confirm the red state**

Run: `pnpm --dir web test --run src/engine/singleOptimizer.test.ts src/engine/overlapOptimizer.test.ts src/engine/optimizeWorkspace.test.ts`

Expected: FAIL because optimizer preparation still accepts flat visible item IDs and flat matches.

- [ ] **Step 4: Refactor shared preparation only, not ranking**

In `preparationContext`, call `candidateQueriesForTargets`. For each query, call `matchEligibleCollectionOutputs`; derive `matchedItemIds` from the returned map keys, target masks from exact output IDs, junk from exact non-target output IDs, and explanations from map values in deterministic order.

Leave `optimizeSinglePrepared`, overlap state expansion, `scoreStep`, `transitionTypingCost`, tie-breakers, and failure-score functions mathematically unchanged.

- [ ] **Step 5: Preserve cooperative work accounting and cancellation**

Measure matching work as `query count × eligible collection count`, not `query count × visible item count`. Provide an internal collection-at-a-time matcher or callback so `prepareOptimizationCooperatively` can:

```typescript
completed += 1
options.onProgress?.(completed, total)
throwIfAborted(options.signal)
await options.yieldControl()
throwIfAborted(options.signal)
```

at the configured chunk boundary. The synchronous and cooperative preparation functions must return deeply equal candidates for identical input.

- [ ] **Step 6: Wire workspace inventory/grid filtering to eligible recipes**

In `optimizeEntry`, compute `eligible = eligibleRecipes(data.recipes, inventory, entry.gridSize)`. Pass `eligible`, all recipes, collections, and items to preparation. Derive `visibleItemIds` and incomplete matched targets from the exact outputs of `eligible`. Keep target sorting, enabled/empty behavior, aggregate scoring, and stale request behavior unchanged.

- [ ] **Step 7: Extend cancellation and determinism tests**

Retain the existing pre-abort, between-entry abort, and within-entry progress tests. Add a large collection fixture in which cancellation occurs during member matching. Reverse recipe, collection-map, member-output, target, and inventory order independently and assert a deeply equal `WorkspaceResult`.

- [ ] **Step 8: Run optimizer and type gates**

Run: `pnpm --dir web test --run src/engine/singleOptimizer.test.ts src/engine/overlapOptimizer.test.ts src/engine/optimizeWorkspace.test.ts`

Run: `pnpm --dir web run typecheck`

Expected: both PASS.

- [ ] **Step 9: Commit optimizer integration**

```powershell
git add -- web/src/engine/singleOptimizer.ts web/src/engine/singleOptimizer.test.ts web/src/engine/overlapOptimizer.ts web/src/engine/overlapOptimizer.test.ts web/src/engine/optimizeWorkspace.ts web/src/engine/optimizeWorkspace.test.ts
git commit -m "feat: optimize collection search queries"
```

