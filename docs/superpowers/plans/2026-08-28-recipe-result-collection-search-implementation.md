# Recipe-Result Collection Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat per-output search with Minecraft Java Edition 1.16.1 recipe-result collection search so collection-member aliases such as Brown Bed can surface a craftable White Bed while inventory, target, output, and junk identities remain exact.

**Architecture:** The Python generator will retain recipe groups, apply an audited reproduction of the client recipe-book category, assign every crafting recipe to one deterministic result collection, and publish a schema-version-3 collection artifact. The TypeScript loader will validate and join that graph. A shared collection-search layer will derive alias-aware candidates and emit only eligible exact outputs; the existing single-query and overlap rankers will consume that prepared data without changing scoring. React will render the alias member separately from the craftable output.

**Tech Stack:** Python 3.11+, pytest, dataclasses, JSON; TypeScript, React 19, Vite 7, Vitest 3, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-08-28-recipe-result-collection-search-design.md`

## Global Constraints

- Reproduce Minecraft Java Edition 1.16.1 `ClientRecipeBook` collection construction for shaped and shapeless crafting recipes only.
- Treat all generated recipes as unlocked, as in the existing application.
- Keep inventory, targets, visible outputs, and junk as exact item IDs. Do not introduce color, wood, or material-family IDs.
- A non-empty JSON `group` joins only recipes with the same exact group and crafting recipe-book category. Missing or empty groups remain isolated.
- Match a collection against all member output search lines before filtering its emitted outputs to eligible recipes.
- Generate target candidates from all searchable members of every collection that can output that exact target.
- Preserve one-to-five-character, case-insensitive, line-bounded matching, including ordinary trailing spaces and UTF-16 source spans.
- Preserve all current score formulas, overlap transition rules, deterministic ordering, exact browser persistence records, cancellation, progress, and stale-result protection.
- Advance all generated browser artifacts together from schema version 2 to schema version 3. Mixed versions must fail explicitly.
- Keep the production baselines at 634 recipes, 562 output items, 281 inventory items, 354 recipe-result collections, and zero validation errors.
- Never modify or commit the user's ignored `minecraft-data/`, `.pnpm-store/`, virtual environment, browser output, or other unrelated files.
- Every task follows red-green-refactor: add a focused failing test, run it and observe the intended failure, make the smallest implementation, rerun the focused gate, then commit only task files.

---

## File Map

```text
pyproject.toml
  Include generator JSON classification resources in the Python package.

generator/references/minecraft-1.16.1-recipe-collection-sources.md
  Record the audited client methods, mappings, category rule, and collection fixtures.
generator/src/mcsr_data/models.py
  Add recipe group/category/collection fields and RecipeResultCollection.
generator/src/mcsr_data/recipes.py
  Parse absent, empty, non-empty, and malformed JSON group values.
generator/src/mcsr_data/recipe_book_categories.json
  Exhaustive audited output-ID assignment to the four crafting categories.
generator/src/mcsr_data/recipe_collections.py
  Load category assignments, create stable IDs, enrich recipes, and build collections.
generator/src/mcsr_data/generate.py
  Orchestrate collections, validate baselines, serialize schema v3, and report counts.
generator/tests/test_recipes.py
  Cover exact group parsing.
generator/tests/test_recipe_collections.py
  Cover category-plus-group construction, isolation, IDs, and real membership.
generator/tests/test_generate.py
  Cover schema-v3 artifacts, atomic failure behavior, counts, and determinism.

web/public/data/search-items.json
web/public/data/inventory-items.json
web/public/data/crafting-recipes.json
web/public/data/recipe-result-collections.json
web/public/data/validation-report.json
  Regenerated, mutually consistent Minecraft 1.16.1 English schema-v3 data.

web/src/domain/types.ts
  Add category, enriched recipe, collection, and generated-data contracts.
web/src/data/schema.ts
  Parse four input payloads and validate the complete recipe/collection graph.
web/src/data/schema.test.ts
  Cover schema-v3 parsing, mixed versions, duplicates, and cross-references.
web/src/engine/craftability.ts
  Expose eligible recipes while retaining distinct visible-output helpers.
web/src/engine/search.ts
  Retain the low-level line matcher and define alias-aware explanation fields.
web/src/engine/candidates.ts
  Generate candidates through every collection containing a target recipe.
web/src/engine/collectionSearch.ts
  Match collection members, emit eligible exact outputs, deduplicate, and explain aliases.
web/src/engine/collectionSearch.test.ts
  Cover alias visibility, isolation, multiple outputs, deduplication, spaces, and spans.
web/src/engine/singleOptimizer.ts
  Prepare collection-aware candidates once for both ranking modes.
web/src/engine/overlapOptimizer.ts
  Carry collection explanations through unchanged scoring and path ranking.
web/src/engine/optimizeWorkspace.ts
  Pass eligible recipes and collections into preparation and retain failure semantics.
web/src/engine/candidates.test.ts
web/src/engine/singleOptimizer.test.ts
web/src/engine/overlapOptimizer.test.ts
web/src/engine/optimizeWorkspace.test.ts
  Update fixtures and assert collection-aware optimization and cooperation.
web/src/engine/realDataAcceptance.test.ts
  Assert `wn`, `wn `, `re`, `ngo`, `ro`, `oe`, and White Wool behavior on generated data.

web/src/components/ResultPanel.tsx
web/src/components/ResultPanel.test.tsx
  Render matched member, collection/group, and visible craftable output distinctly.
web/src/App.test.tsx
  Serve a complete schema-v3 fixture including the fourth generated file.
web/e2e/app.spec.ts
  Route collection data in fixtures and verify alias explanations through the browser.
README.md
  Document schema v3, result-collection semantics, artifacts, and verification counts.
```

### Task 1: Retain recipe groups and reproduce recipe-result collection construction

**Files:**
- Modify: `pyproject.toml`
- Modify: `generator/src/mcsr_data/models.py`
- Modify: `generator/src/mcsr_data/recipes.py`
- Create: `generator/src/mcsr_data/recipe_book_categories.json`
- Create: `generator/src/mcsr_data/recipe_collections.py`
- Create: `generator/references/minecraft-1.16.1-recipe-collection-sources.md`
- Modify: `generator/tests/test_recipes.py`
- Create: `generator/tests/test_recipe_collections.py`

**Interfaces:**

```python
RecipeBookCategory = Literal[
    "crafting_building_blocks",
    "crafting_equipment",
    "crafting_redstone",
    "crafting_misc",
]

@dataclass(frozen=True)
class RecipeResultCollection:
    collection_id: str
    recipe_book_category: RecipeBookCategory
    recipe_group: str | None
    recipe_ids: tuple[str, ...]
    output_item_ids: tuple[str, ...]

CategoryLoader = Callable[[], dict[str, RecipeBookCategory]]
CollectionAssigner = Callable[
    [Sequence[NormalizedRecipe], Mapping[str, RecipeBookCategory]],
    tuple[list[NormalizedRecipe], list[RecipeResultCollection]],
]
```

`NormalizedRecipe` gains `recipe_group: str | None`, `recipe_book_category: RecipeBookCategory | None = None`, and `result_collection_id: str | None = None`. The optional enrichment fields are an internal staging state only; successful serialized recipes must contain concrete values.

- [ ] **Step 1: Record the pinned client-source audit before encoding its behavior**

Document the exact Minecraft/Yarn 1.16.1 identities and source observations used by the implementation:

```text
ClientRecipeBook#getGroupForRecipe
ClientRecipeBook#reload
RecipeBookGroup.CRAFTING_BUILDING_BLOCKS
RecipeBookGroup.CRAFTING_EQUIPMENT
RecipeBookGroup.CRAFTING_REDSTONE
RecipeBookGroup.CRAFTING_MISC
SearchManager.RECIPE_OUTPUT
RecipeResultCollection
```

The reference must include the pinned Yarn documentation URL, the mappings build, the category decision rule from the audited client body, and the evidence that result collections are indexed rather than individual recipes. Record the audit as a reproducible classification table; do not infer category from English output names.

- [ ] **Step 2: Write failing group-parser tests**

```python
@pytest.mark.parametrize((raw_group, expected), [
    (None, None),
    ("", None),
    ("bed", "bed"),
])
def test_recipe_group_preserves_nonempty_exact_values(raw_group, expected):
    raw = {
        "type": "minecraft:crafting_shapeless",
        "ingredients": [{"item": "minecraft:white_wool"}],
        "result": {"item": "minecraft:white_bed"},
    }
    if raw_group is not None:
        raw["group"] = raw_group
    assert parse_recipe("minecraft:white_bed", raw).recipe_group == expected

@pytest.mark.parametrize("invalid_group", [None, 7, [], {}])
def test_explicit_non_string_recipe_groups_are_rejected(invalid_group):
    with pytest.raises(RecipeParseError, match="group must be a string"):
        parse_recipe("minecraft:bad", {
            "type": "minecraft:crafting_shapeless",
            "group": invalid_group,
            "ingredients": [{"item": "minecraft:white_wool"}],
            "result": {"item": "minecraft:white_bed"},
        })
```

- [ ] **Step 3: Run the parser tests and confirm the red state**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipes.py -v`

Expected: FAIL because `NormalizedRecipe` has no `recipe_group` and non-string groups are not rejected.

- [ ] **Step 4: Parse group values without normalizing their text**

Add a helper with exact absent/empty-string behavior:

```python
def _parse_group(recipe_id: str, raw: Mapping[str, object]) -> str | None:
    if "group" not in raw or raw["group"] == "":
        return None
    raw_group = raw["group"]
    if not isinstance(raw_group, str):
        raise RecipeParseError(f"{recipe_id}: group must be a string")
    return raw_group
```

Do not trim whitespace or lower-case group names; they are source identifiers. An explicit JSON `null` is malformed even though an absent field is valid.

- [ ] **Step 5: Write failing collection-construction tests**

Use small recipes whose enrichment fields start as `None`. Cover these exact cases:

```python
def test_same_nonempty_group_joins_only_within_one_category():
    recipes = [
        recipe("minecraft:white_bed", "minecraft:white_bed", group="bed"),
        recipe("minecraft:brown_bed", "minecraft:brown_bed", group="bed"),
        recipe("minecraft:test_redstone", "minecraft:test_redstone", group="bed"),
    ]
    categories = {
        "minecraft:white_bed": "crafting_building_blocks",
        "minecraft:brown_bed": "crafting_building_blocks",
        "minecraft:test_redstone": "crafting_redstone",
    }

    enriched, collections = assign_recipe_result_collections(recipes, categories)

    assert [collection.recipe_ids for collection in collections] == [
        ("minecraft:brown_bed", "minecraft:white_bed"),
        ("minecraft:test_redstone",),
    ]
    assert len({item.result_collection_id for item in enriched}) == 2

def test_ungrouped_recipes_are_isolated_even_when_outputs_match():
    first = recipe("minecraft:first", "minecraft:white_wool", group=None)
    second = recipe("minecraft:second", "minecraft:white_wool", group=None)
    enriched, collections = assign_recipe_result_collections(
        [first, second],
        {"minecraft:white_wool": "crafting_building_blocks"},
    )
    assert len(collections) == 2
    assert len({item.result_collection_id for item in enriched}) == 2
```

Also assert that missing output categories, duplicate recipe IDs, and collection-ID collisions raise deterministic `RecipeCollectionError` messages.

- [ ] **Step 6: Run the new collection tests and confirm the red state**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipe_collections.py -v`

Expected: FAIL because `recipe_collections.py` and the collection dataclass do not exist.

- [ ] **Step 7: Add the exhaustive audited category resource**

Use this exact top-level shape:

```json
{
  "minecraft_version": "1.16.1",
  "categories": {
    "crafting_building_blocks": ["minecraft:acacia_button"],
    "crafting_equipment": ["minecraft:bow"],
    "crafting_redstone": ["minecraft:activator_rail"],
    "crafting_misc": ["minecraft:bread"]
  }
}
```

Populate every distinct recipe output exactly once, with each list sorted. The one-item lists above demonstrate shape only; the committed resource must contain all 562 generated output IDs. Configure setuptools package data so both `overrides.json` and `recipe_book_categories.json` are available outside editable installs:

```toml
[tool.setuptools.package-data]
mcsr_data = ["*.json"]
```

The loader rejects an incorrect Minecraft version, unknown category, duplicate assignment, non-string item ID, or unsorted category list.

- [ ] **Step 8: Implement deterministic category-plus-group collection construction**

Use URL encoding so arbitrary exact group strings cannot collide with delimiters:

```python
def collection_id_for(
    category: RecipeBookCategory,
    recipe_group: str | None,
    recipe_id: str,
) -> str:
    if recipe_group is None:
        return f"{category}/recipe/{quote(recipe_id, safe='')}"
    return f"{category}/group/{quote(recipe_group, safe='')}"
```

Sort recipes by `recipe_id`; key grouped recipes by `(category, group)` and ungrouped recipes by `(category, recipe_id)`; sort distinct output IDs within each collection; return collections sorted by ID. Validate one and only one collection assignment per recipe.

- [ ] **Step 9: Add and run real-corpus membership tests**

Assert all of the following against `minecraft-data/recipes` plus the audited category resource:

```python
assert collection_for("minecraft:white_bed") == collection_for("minecraft:brown_bed")
assert collection_for("minecraft:white_carpet") == collection_for("minecraft:brown_carpet")
assert collection_for("minecraft:white_banner") == collection_for("minecraft:brown_banner")
assert collection_for("minecraft:respawn_anchor") != collection_for("minecraft:white_bed")
assert collection_for("minecraft:white_wool") != collection_for("minecraft:brown_wool")
assert len(enriched_recipes) == 634
assert len(collections) == 354
```

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipes.py generator/tests/test_recipe_collections.py -v`

Expected: PASS with 634 recipes and 354 collections.

- [ ] **Step 10: Commit the source-audited collection model**

```powershell
git add -- pyproject.toml generator/references/minecraft-1.16.1-recipe-collection-sources.md generator/src/mcsr_data/models.py generator/src/mcsr_data/recipes.py generator/src/mcsr_data/recipe_book_categories.json generator/src/mcsr_data/recipe_collections.py generator/tests/test_recipes.py generator/tests/test_recipe_collections.py
git commit -m "feat: model recipe result collections"
```

### Task 2: Publish and validate the schema-version-3 collection graph

**Files:**
- Modify: `generator/src/mcsr_data/generate.py`
- Modify: `generator/tests/test_generate.py`
- Modify: `web/public/data/search-items.json`
- Modify: `web/public/data/inventory-items.json`
- Modify: `web/public/data/crafting-recipes.json`
- Create: `web/public/data/recipe-result-collections.json`
- Modify: `web/public/data/validation-report.json`

**Interfaces:**

```json
{
  "schema_version": 3,
  "minecraft_version": "1.16.1",
  "language": "en_us",
  "collections": [
    {
      "id": "crafting_building_blocks/group/bed",
      "recipe_book_category": "crafting_building_blocks",
      "recipe_group": "bed",
      "recipe_ids": ["minecraft:brown_bed", "minecraft:white_bed"],
      "output_item_ids": ["minecraft:brown_bed", "minecraft:white_bed"]
    }
  ]
}
```

- [ ] **Step 1: Write failing schema-v3 generation tests**

Update the fixture recipe to include `"group": "fixture_group"` and assert:

```python
assert items["schema_version"] == 3
assert inventory_items["schema_version"] == 3
assert recipes["schema_version"] == 3
assert collections["schema_version"] == 3
assert report["schema_version"] == 3
assert recipes["recipes"][0]["recipe_group"] == "fixture_group"
assert recipes["recipes"][0]["recipe_book_category"] == "crafting_building_blocks"
assert recipes["recipes"][0]["result_collection_id"] == collections["collections"][0]["id"]
assert collections["minecraft_version"] == "1.16.1"
assert collections["language"] == "en_us"
assert summary.collection_count == 1
```

Inject a fixture category mapping into `generate` rather than weakening production validation. Extend `GenerationBaseline` with `inventory_item_count` and `collection_count`, then assert the production baseline values 281 and 354.

- [ ] **Step 2: Run focused generation tests and confirm the red state**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py -v`

Expected: FAIL because the generator still emits schema version 2 and no collection artifact/count.

- [ ] **Step 3: Integrate collection assignment before item and cross-reference validation**

Change the orchestration order to:

```text
parse recipes
resolve ingredient tags
assign category and result collection
build searchable output items and inventory items
validate recipe/item/collection cross-references and baselines
atomically publish every successful artifact
```

Set `SCHEMA_VERSION = 3`. Add `collection_count` to `GenerationSummary`, the success/failure report, CLI output, and baseline checks. Production generation must use the packaged category table; tests may pass an explicit mapping.

- [ ] **Step 4: Serialize enriched recipes and collections**

Extend `_serialize_recipe` with:

```python
"recipe_group": recipe.recipe_group,
"recipe_book_category": recipe.recipe_book_category,
"result_collection_id": recipe.result_collection_id,
```

Add `_serialize_collection` with all five collection fields. Before serialization, report errors for a recipe with no category/collection, a missing recipe/output reference, a grouped member whose category/group differs from its collection, an empty collection, duplicate collection IDs, or a recipe referenced by zero/multiple collections.

- [ ] **Step 5: Preserve all five last-valid data artifacts on failure**

Extend the existing atomic-failure fixture's `valid_artifacts` to include `recipe-result-collections.json`. Cause a missing translation and assert byte-for-byte preservation of:

```text
search-items.json
inventory-items.json
crafting-recipes.json
recipe-result-collections.json
validation-report.json
```

Only `validation-failure-report.json` may change on failure.

- [ ] **Step 6: Verify fixture determinism and production baselines**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py generator/tests/test_recipe_collections.py -v`

Run: `.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data`

Expected CLI summary: 634 recipes, 562 output items, 281 inventory items, 354 result collections, and 0 validation errors. Run generation a second time and confirm `git diff --exit-code -- web/public/data` after recording the first generated diff; the second run must introduce no further changes.

- [ ] **Step 7: Run the complete generator suite**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests -v`

Expected: all generator tests PASS.

- [ ] **Step 8: Commit schema v3 and regenerated data**

```powershell
git add -- generator/src/mcsr_data/generate.py generator/tests/test_generate.py web/public/data/search-items.json web/public/data/inventory-items.json web/public/data/crafting-recipes.json web/public/data/recipe-result-collections.json web/public/data/validation-report.json
git commit -m "feat: publish recipe collection data"
```

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

### Task 6: Render alias-aware explanations and update application fixtures

**Files:**
- Modify: `web/src/components/ResultPanel.tsx`
- Modify: `web/src/components/ResultPanel.test.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/e2e/app.spec.ts`

- [ ] **Step 1: Write a failing result-panel alias explanation test**

Use an explanation with Brown Bed as the matched member and White Bed as the visible output. Assert visible copy with both roles:

```text
White Bed (minecraft:white_bed) was craftable in collection bed.
Matched Brown Bed (minecraft:brown_bed): name · span 3–5
```

The exact presentation may use separate semantic elements, but tests must assert both item names/IDs, the collection group or isolated collection label, the line source, and the exact highlighted `wn` span. It must not state or imply that Brown Bed was craftable.

- [ ] **Step 2: Run the component test and confirm the red state**

Run: `pnpm --dir web test --run src/components/ResultPanel.test.tsx`

Expected: FAIL because `ExactMatch` renders only the old single `itemId`.

- [ ] **Step 3: Render the output path and matching evidence separately**

Change `ExactMatch` to display:

- visible craftable output name and ID;
- collection group when non-null, otherwise the collection ID;
- matched member name and ID;
- source and UTF-16 span;
- the existing source line with only the exact match inside `<mark>`.

Keep the invalid-span alert. Derive display labels from the explanation itself so a malformed runtime item map cannot swap alias/output roles.

- [ ] **Step 4: Upgrade App test fixtures to schema version 3**

Add recipe group/category/collection fields to every fixture recipe, add a complete collection payload, and make `stubGeneratedData` route by all four filenames. Assert the app requests `recipe-result-collections.json` and still preserves, normalizes, saves, cancels, and re-optimizes the same exact browser workspace data.

- [ ] **Step 5: Upgrade the routed Unicode E2E fixture**

Route a schema-v3 collection artifact and enrich its recipes. Preserve the existing UTF-16 assertion while changing the explanation copy to distinguish matched member from visible output.

- [ ] **Step 6: Add a browser-level alias explanation fixture**

Route a small schema-v3 bed collection in which Brown Bed supplies `wn`, White Bed is the only eligible target output, and a separate eligible junk collection makes every competing one- or two-character target candidate dirty while leaving `wn` clean. Through the real App:

1. select the exact White Bed ingredient;
2. add exact White Bed as the target;
3. wait for a complete result containing query `wn`;
4. assert the panel identifies Brown Bed as the matched member;
5. assert it identifies White Bed as the craftable output;
6. assert Brown Bed is absent from targets and junk.

- [ ] **Step 7: Run component, App, and browser gates**

Run: `pnpm --dir web test --run src/components/ResultPanel.test.tsx src/App.test.tsx`

Run: `pnpm --dir web run e2e`

Expected: unit/component tests and all Playwright tests PASS.

- [ ] **Step 8: Commit UI and fixture changes**

```powershell
git add -- web/src/components/ResultPanel.tsx web/src/components/ResultPanel.test.tsx web/src/App.test.tsx web/e2e/app.spec.ts
git commit -m "feat: explain recipe collection aliases"
```

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
