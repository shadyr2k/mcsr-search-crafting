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

