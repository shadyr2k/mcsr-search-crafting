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

