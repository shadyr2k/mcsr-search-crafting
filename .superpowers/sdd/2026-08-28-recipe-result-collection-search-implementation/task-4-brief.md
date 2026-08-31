### Task 4: Implement collection-aware matching and target candidate generation

**Files:**
- Modify: `web/src/engine/craftability.ts`
- Modify: `web/src/engine/craftability.test.ts`
- Modify: `web/src/engine/search.ts`
- Modify: `web/src/engine/candidates.ts`
- Modify: `web/src/engine/candidates.test.ts`
- Create: `web/src/engine/collectionSearch.ts`
- Create: `web/src/engine/collectionSearch.test.ts`

**Interfaces:**

```typescript
export interface CollectionMatchExplanation {
  query: string
  collectionId: string
  recipeGroup: string | null
  matchedMemberItemId: string
  matchedMemberName: string
  visibleOutputItemId: string
  visibleOutputName: string
  source: string
  line: string
  matchedSpan: { start: number; end: number; text: string }
}

export function eligibleRecipes(
  recipes: readonly CraftingRecipe[],
  inventory: ReadonlySet<string>,
  gridSize: GridSize,
): CraftingRecipe[]

export function candidateQueriesForTargets(
  targetIds: ReadonlySet<string>,
  recipes: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
  maxLength?: number,
): string[]

export function matchEligibleCollectionOutputs(
  query: string,
  eligible: readonly CraftingRecipe[],
  collections: ReadonlyMap<string, RecipeResultCollection>,
  items: ReadonlyMap<string, SearchItem>,
): Map<string, CollectionMatchExplanation[]>
```

- [ ] **Step 1: Add the canonical bed/anchor/wool test fixture**

Build these collections and recipes in `collectionSearch.test.ts`:

```text
bed collection: Brown Bed member is not eligible; White Bed member is eligible
carpet collection: Brown Carpet alias; White Carpet eligible
banner collection: Brown Banner alias; White Banner eligible
Respawn Anchor collection: one directly matching eligible member
White Wool collection: one eligible ungrouped member
```

Give Brown Bed, Brown Carpet, and Brown Banner names containing `wn`; give each White output a name that does not contain `wn`; use `Respawn Anchor` for the direct member.

- [ ] **Step 2: Write failing collection-matching assertions**

```typescript
expect([...matchEligibleCollectionOutputs('wn', eligible, collections, items).keys()]).toEqual([
  'minecraft:respawn_anchor',
  'minecraft:white_banner',
  'minecraft:white_bed',
  'minecraft:white_carpet',
])
expect(matchEligibleCollectionOutputs('wn', eligible, collections, items).has('minecraft:white_wool')).toBe(false)
```

Also assert:

- `wn ` matches the same fixture outputs when the alias/direct lines contain the trailing space;
- an uncraftable Brown Bed can match but is not emitted;
- two eligible bed variants are emitted as two exact IDs;
- one output emitted through two matched collections is deduplicated by output ID;
- explanations distinguish Brown Bed as `matchedMemberItemId` and White Bed as `visibleOutputItemId`;
- explanation ordering is collection ID, visible output ID, member item ID, source, line, span start;
- existing Unicode-safe spans survive the mapping.

- [ ] **Step 3: Write failing alias-candidate tests**

```typescript
const candidates = candidateQueriesForTargets(
  new Set(['minecraft:white_bed']),
  recipes,
  collections,
  items,
)
expect(candidates).toContain('wn')
expect(candidates).toContain('wn ')
```

Assert candidates come from every member output in each target collection, never join adjacent lines, remain unique/sorted, and stay within one through five characters. A collection that cannot output the target must not expand its candidate set.

- [ ] **Step 4: Run focused engine tests and confirm the red state**

Run: `pnpm --dir web test --run src/engine/collectionSearch.test.ts src/engine/candidates.test.ts src/engine/craftability.test.ts`

Expected: FAIL because the collection-search API and alias candidate traversal do not exist.

- [ ] **Step 5: Expose eligible recipes without changing infinite-inventory semantics**

Implement `eligibleRecipes` with the existing `isRecipeCraftable` predicate. Rewrite `visibleOutputIds` as a distinct-ID projection of `eligibleRecipes`, preserving its public behavior and tests. Repeated ingredient slots remain satisfied by one selected exact item because quantity is infinite.

- [ ] **Step 6: Implement candidate traversal through target collections**

For every recipe whose exact output is a target, collect its `resultCollectionId`. For every such collection, collect all referenced member `SearchItem`s and pass them to the existing normalized substring generator. Reject missing graph references with an exception because schema validation should have made them impossible.

- [ ] **Step 7: Implement match-then-emit collection semantics**

For each collection represented by an eligible recipe:

1. Run existing `matchItem` against every collection member output.
2. If no member line matches, emit nothing from that collection.
3. If any member line matches, emit each distinct output of eligible recipes in that collection.
4. Attach every deterministic member-line match to each emitted output, naming both IDs and names.
5. Merge duplicate output IDs across collections and deduplicate identical explanation tuples.

Do not require the matched member recipe to be eligible. Do not add aliases to `SearchItem.searchLines`; grouping belongs only in this layer.

- [ ] **Step 8: Run the focused collection engine gate**

Run: `pnpm --dir web test --run src/engine/search.test.ts src/engine/candidates.test.ts src/engine/craftability.test.ts src/engine/collectionSearch.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 9: Commit collection matching**

```powershell
git add -- web/src/engine/craftability.ts web/src/engine/craftability.test.ts web/src/engine/search.ts web/src/engine/candidates.ts web/src/engine/candidates.test.ts web/src/engine/collectionSearch.ts web/src/engine/collectionSearch.test.ts
git commit -m "feat: match eligible recipe collections"
```

