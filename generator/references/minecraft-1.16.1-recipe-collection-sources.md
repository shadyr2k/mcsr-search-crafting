# Minecraft 1.16.1 recipe-result collection source provenance

## Pinned inputs

- Minecraft version: Java Edition `1.16.1`.
- Official version manifest:
  `https://piston-meta.mojang.com/v1/packages/54fa3af57d041d2771e66d390197b2c0288e697c/1.16.1.json`.
- Official client:
  `https://piston-data.mojang.com/v1/objects/c9abbe8ee4fa490751ca70635340b7cf00db83ff/client.jar`.
  Its SHA-1 is `c9abbe8ee4fa490751ca70635340b7cf00db83ff` and its
  SHA-256 is
  `b4831e7b63b10588ff06ea86322108d916c536446f3aea3ae988b7fe3e1f66ef`.
- Fabric intermediary mappings: `net.fabricmc:intermediary:1.16.1:v2`,
  SHA-256
  `1daffb2da1503d79ab3f9ea3cf258ec5045cc41204d2a1151321e26652f3c654`.
- Yarn mappings: `net.fabricmc:yarn:1.16.1+build.21:v2`, SHA-256
  `cf3cc87c146042767d0d46191c9cd6bb47a22404956726fcb851c0acb851fa0b`.
- Pinned Yarn documentation:
  `https://maven.fabricmc.net/docs/yarn-1.16.1+build.21/net/minecraft/client/recipebook/ClientRecipeBook.html`
  (documentation root:
  `https://maven.fabricmc.net/docs/yarn-1.16.1+build.21/`).
- Remapper: Tiny Remapper `0.12.2`, fat JAR SHA-256
  `6c4b7f1ad6cf00a78cca83ed99d4e12b9ecfa7e1863a1f31a7554c7d5b3da0dd`.
- Decompiled named view: CFR `0.152`, JAR SHA-256
  `f686e8f3ded377d7bc87d216a90e9e9512df4156e75b06c655a16648ae8765b2`.

The official client was remapped `official -> intermediary -> named`. The
following observations come from the named decompilation, not from translated
item names.

## Category decision rule

For a `RecipeType.CRAFTING` recipe,
`ClientRecipeBook#getGroupForRecipe` reads
`recipe.getOutput().getItem().getGroup()` and applies this exact decision
table:

| Source output item group | Recipe-book category | Scoped output count |
| --- | --- | ---: |
| `ItemGroup.BUILDING_BLOCKS` | `RecipeBookGroup.CRAFTING_BUILDING_BLOCKS` | 219 |
| `ItemGroup.TOOLS` or `ItemGroup.COMBAT` | `RecipeBookGroup.CRAFTING_EQUIPMENT` | 53 |
| `ItemGroup.REDSTONE` | `RecipeBookGroup.CRAFTING_REDSTONE` | 68 |
| Every other group, including no group | `RecipeBookGroup.CRAFTING_MISC` | 222 |
| **Total** | | **562** |

The committed classification resource was reproduced by parsing the pinned
`net.minecraft.item.Items` static registrations, taking each registered
item's exact `ItemGroup`, intersecting those registrations with the 562
distinct shaped/shapeless recipe output IDs in `minecraft-data/recipes`, and
applying the table above. All 562 scoped outputs were found in `Items`; none
was classified from its English name. The resource lists each output exactly
once and sorts each category list, making the audit diffable and repeatable.

## Collection construction

`ClientRecipeBook#reload` skips recipes ignored by the recipe book, obtains
the category from `getGroupForRecipe`, and reads the recipe's exact group
string. An empty group calls `addGroup` unconditionally, creating a distinct
`RecipeResultCollection` for that recipe. A non-empty group uses a
`HashBasedTable` keyed by `(RecipeBookGroup, group)` and therefore reuses a
collection only when both category and exact group match. Each recipe is then
added to that collection with `RecipeResultCollection#addRecipe`.

For each of
`RecipeBookGroup.CRAFTING_BUILDING_BLOCKS`,
`RecipeBookGroup.CRAFTING_EQUIPMENT`,
`RecipeBookGroup.CRAFTING_REDSTONE`, and
`RecipeBookGroup.CRAFTING_MISC`, `addGroup` also adds the same collection to
the aggregate `RecipeBookGroup.SEARCH` result list. Applying this construction
to the 634 supported shaped/shapeless recipes produces 354 distinct result
collections.

## Search indexing evidence

`SearchManager.RECIPE_OUTPUT` is declared as
`SearchManager.Key<RecipeResultCollection>`, not as a recipe or item key.
`MinecraftClient#initializeSearchableContainers` constructs a
`TextSearchableContainer<RecipeResultCollection>` whose text supplier calls
`recipeResultCollection.getAllRecipes()` and indexes every member recipe
output tooltip. Its identifier supplier likewise traverses all member recipes
and returns their output item IDs. That container is installed under
`SearchManager.RECIPE_OUTPUT`.

Together, these bodies show that search is performed against whole
`RecipeResultCollection` instances built by `ClientRecipeBook#reload`, rather
than against individual recipes or output items.
