### Task 3: Load and cross-validate schema version 3 in the browser

**Files:**
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/data/schema.ts`
- Modify: `web/src/data/schema.test.ts`

**Interfaces:**

```typescript
export type RecipeBookCategory =
  | 'crafting_building_blocks'
  | 'crafting_equipment'
  | 'crafting_redstone'
  | 'crafting_misc'

export interface RecipeResultCollection {
  id: string
  recipeBookCategory: RecipeBookCategory
  recipeGroup: string | null
  recipeIds: string[]
  outputItemIds: string[]
}

export interface GeneratedData {
  schemaVersion: 3
  items: Map<string, SearchItem>
  inventoryItems: Map<string, InventoryItem>
  recipes: CraftingRecipe[]
  collections: Map<string, RecipeResultCollection>
}
```

`CraftingRecipe` gains `recipeGroup`, `recipeBookCategory`, and `resultCollectionId`.

- [ ] **Step 1: Replace schema-test fixtures with one complete valid graph**

Use version 3 for every payload. Add these recipe fields:

```typescript
recipe_group: null,
recipe_book_category: 'crafting_misc',
result_collection_id: 'crafting_misc/recipe/minecraft%3Atorch',
```

Add a collection payload whose one record references the recipe and output. Change `parseGeneratedData` test calls to four payloads and assert a populated `Map<string, RecipeResultCollection>`.

- [ ] **Step 2: Add failing graph-validation tests**

Add one test per diagnostic boundary:

- one payload remains schema version 2 while the other three are version 3;
- invalid category string;
- duplicate collection ID;
- duplicate recipe ID or output ID within a collection;
- collection references a missing recipe;
- collection references a missing searchable output;
- recipe references a missing collection;
- recipe category/group disagrees with its collection;
- recipe appears in zero or two collections;
- collection recipe's output is absent from `output_item_ids`.

Each assertion must include the precise JSON path in `GeneratedDataError.errors`.

- [ ] **Step 3: Run the schema tests and confirm the red state**

Run: `pnpm --dir web test --run src/data/schema.test.ts`

Expected: FAIL because the domain and parser know only schema version 2 and three payloads.

- [ ] **Step 4: Implement strict parsing and cross-reference validation**

Set `GENERATED_SCHEMA_VERSION = 3`. Add a category type guard, nullable-group parser, unique string-array parser, indexed collection parsing, and a final graph validation pass. Do not silently repair data. Aggregate all independent errors as the current parser does.

Update the public parser signature exactly:

```typescript
export function parseGeneratedData(
  itemsPayload: unknown,
  inventoryItemsPayload: unknown,
  recipesPayload: unknown,
  collectionsPayload: unknown,
): GeneratedData
```

- [ ] **Step 5: Fetch the fourth artifact in parallel**

```typescript
const [itemsPayload, inventoryItemsPayload, recipesPayload, collectionsPayload] = await Promise.all([
  fetchJson(`${base}data/search-items.json`),
  fetchJson(`${base}data/inventory-items.json`),
  fetchJson(`${base}data/crafting-recipes.json`),
  fetchJson(`${base}data/recipe-result-collections.json`),
])
```

Assert the fourth fetch URL and return the four-argument parser result.

- [ ] **Step 6: Run the focused loader gate and type checker**

Run: `pnpm --dir web test --run src/data/schema.test.ts`

Run: `pnpm --dir web run typecheck`

Expected: both PASS.

- [ ] **Step 7: Commit the schema-v3 browser boundary**

```powershell
git add -- web/src/domain/types.ts web/src/data/schema.ts web/src/data/schema.test.ts
git commit -m "feat: load recipe collection schema"
```

