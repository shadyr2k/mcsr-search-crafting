# MCSR Search-Crafting Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static Minecraft 1.16.1 MCSR optimizer that derives English recipe-book search text, filters outputs through an explicit infinite inventory, and ranks single-query and overlapping-query crafts for user-defined target sets.

**Architecture:** A Python package converts the local 1.16.1 recipe, tag, and language resources into validated JSON. A framework-independent TypeScript engine loads that JSON and performs craftability, search, scoring, and overlap optimization; a React/Vite interface manages inventory presets, target sets, persistence, and explainable results. Data generation, engine logic, and UI are implemented in dependency order so each layer has an independent test gate.

**Tech Stack:** Python 3.11+, pytest, React, TypeScript, Vite, Vitest, Testing Library, browser `localStorage`

**Spec:** `docs/superpowers/specs/2026-08-27-mcsr-search-crafting-design.md`

## Global Constraints

- Target Minecraft 1.16.1 and `en_us` only.
- Include only `minecraft:crafting_shaped` and `minecraft:crafting_shapeless` recipes.
- Treat selected inventory item IDs as explicit and infinite; never infer derived materials.
- Count junk by distinct visible output item ID and independently at each overlap step.
- Permit all searchable characters and limit queries to one through five characters.
- Keep single-query, overlap, and incomplete results as separate categories.
- Use the approved scoring formula and deterministic maximum-plus-five failure score.
- Provide exactly three browser-stored custom inventory slots; persist the target-set workspace separately.
- Require Node.js 20.19+ or 22.12+ for the current Vite toolchain.
- Do not commit or modify the user's extracted `minecraft-data/` source files as part of implementation commits.

---

## File Map

```text
.gitignore                                      Local inputs, Python caches, Node output
pyproject.toml                                  Python package and pytest configuration
generator/src/mcsr_data/models.py               Generated-data dataclasses and serialization
generator/src/mcsr_data/recipes.py              Recipe parsing, pattern trimming, grid rules
generator/src/mcsr_data/tags.py                 Recursive item-tag resolution
generator/src/mcsr_data/translations.py         Item/block translation lookup
generator/src/mcsr_data/tooltips.py             1.16.1 searchable tooltip reproduction
generator/src/mcsr_data/validation.py           Structured diagnostics and failure policy
generator/src/mcsr_data/generate.py             Generator orchestration and CLI
generator/src/mcsr_data/overrides.json           Auditable exceptional tooltip data
generator/tests/                                Focused Python unit/integration tests
web/package.json                                Browser scripts and dependencies
web/vite.config.ts                              Static relative-path build and Vitest config
web/src/domain/types.ts                         Shared immutable domain interfaces
web/src/data/schema.ts                          Runtime generated-data validation
web/src/engine/craftability.ts                  Inventory and grid filtering
web/src/engine/search.ts                        Line-bounded matching and explanations
web/src/engine/candidates.ts                    Unique one-to-five-character candidates
web/src/engine/scoring.ts                       Approved score functions and failure bound
web/src/engine/singleOptimizer.ts               Complete single-query ranking
web/src/engine/overlapOptimizer.ts              Covered-mask/last-query state search
web/src/persistence/storage.ts                  Versioned localStorage adapters
web/src/presets/builtInPresets.ts               User-supplied read-only inventory presets
web/src/components/InventoryPanel.tsx           Inventory selection and preset slots
web/src/components/TargetSetList.tsx            Target entries, grid choice, enable/order
web/src/components/ResultPanel.tsx               Single, overlap, failure, match explanations
web/src/App.tsx                                 Workspace orchestration and aggregate score
web/src/**/*.test.ts(x)                         Engine, persistence, and component tests
web/e2e/app.spec.ts                             Browser-level primary workflow test
```

### Task 1: Establish the Python generator package and recipe model

**Files:**
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `generator/src/mcsr_data/__init__.py`
- Create: `generator/src/mcsr_data/models.py`
- Create: `generator/src/mcsr_data/recipes.py`
- Create: `generator/tests/test_recipes.py`

**Interfaces:**
- Consumes: JSON files under `minecraft-data/recipes/`.
- Produces: `parse_recipe(recipe_id: str, raw: dict[str, object]) -> NormalizedRecipe | None`, `load_crafting_recipes(path: Path) -> list[NormalizedRecipe]`, and serializable `IngredientSlot`/`NormalizedRecipe` dataclasses.

- [ ] **Step 1: Add package/test configuration and local-artifact exclusions**

```toml
[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[project]
name = "mcsr-search-data"
version = "0.1.0"
requires-python = ">=3.11"

[project.optional-dependencies]
test = ["pytest>=8,<10"]

[tool.pytest.ini_options]
pythonpath = ["generator/src"]
testpaths = ["generator/tests"]
```

Add `.gitignore` entries for `.venv/`, `__pycache__/`, `.pytest_cache/`, `web/node_modules/`, `web/dist/`, and `minecraft-data/` while leaving the user's existing local folder untouched. Generated validation reports under `web/public/data/` remain tracked with the other generated browser data.

- [ ] **Step 2: Write failing recipe parsing tests**

```python
def test_shaped_recipe_is_trimmed_and_grid_compatible():
    recipe = parse_recipe("minecraft:test", {
        "type": "minecraft:crafting_shaped",
        "pattern": [" A ", " B "],
        "key": {"A": {"item": "minecraft:iron_ingot"}, "B": {"item": "minecraft:stick"}},
        "result": {"item": "minecraft:iron_sword"},
    })
    assert recipe.width == 1
    assert recipe.height == 2
    assert recipe.fits_2x2 is True

def test_non_crafting_recipe_is_ignored():
    assert parse_recipe("minecraft:coal", {
        "type": "minecraft:smelting",
        "ingredient": {"item": "minecraft:coal_ore"},
        "result": "minecraft:coal",
    }) is None
```

- [ ] **Step 3: Run the focused test and confirm the red state**

Run: `python -m pytest generator/tests/test_recipes.py -v`

Expected: FAIL because `mcsr_data.recipes` and its types do not exist.

- [ ] **Step 4: Implement immutable recipe models and parsing**

Define `IngredientRef(kind: Literal["item", "tag"], value: str)`, `IngredientSlot(options: tuple[IngredientRef, ...])`, and `NormalizedRecipe`. Trim all-space outer rows and columns for shaped recipes, preserve repeated ingredient slots, count shapeless slots, derive `fits_2x2`, and reject malformed patterns with `RecipeParseError`.

- [ ] **Step 5: Run recipe tests and the real-data count check**

Run: `python -m pytest generator/tests/test_recipes.py -v`

Run: `python -c "from pathlib import Path; from mcsr_data.recipes import load_crafting_recipes; r=load_crafting_recipes(Path('minecraft-data/recipes')); assert len(r)==634; print(len(r))"`

Expected: tests PASS and count prints `634`.

- [ ] **Step 6: Commit the recipe parser**

```bash
git add .gitignore pyproject.toml generator/src/mcsr_data generator/tests/test_recipes.py
git commit -m "feat: parse Minecraft crafting recipes"
```

### Task 2: Resolve item tags and ingredient alternatives

**Files:**
- Create: `generator/src/mcsr_data/tags.py`
- Create: `generator/tests/test_tags.py`
- Modify: `generator/src/mcsr_data/models.py`
- Modify: `generator/src/mcsr_data/recipes.py`

**Interfaces:**
- Consumes: `IngredientRef` values and tag JSON under `minecraft-data/tags/items/`.
- Produces: `TagResolver.from_directory(path: Path)`, `TagResolver.resolve(tag_id: str) -> frozenset[str]`, and normalized `IngredientSlot.accepted_items: tuple[str, ...]`.

- [ ] **Step 1: Write tests for direct, nested, optional, and cyclic tags**

```python
def test_nested_tag_resolution(tmp_path):
    write_tag(tmp_path, "planks", ["minecraft:oak_planks", "#minecraft:fungal_planks"])
    write_tag(tmp_path, "fungal_planks", ["minecraft:crimson_planks"])
    resolver = TagResolver.from_directory(tmp_path)
    assert resolver.resolve("minecraft:planks") == frozenset({
        "minecraft:oak_planks", "minecraft:crimson_planks"
    })

def test_cycle_is_rejected(tmp_path):
    write_tag(tmp_path, "a", ["#minecraft:b"])
    write_tag(tmp_path, "b", ["#minecraft:a"])
    with pytest.raises(TagResolutionError, match="cycle"):
        TagResolver.from_directory(tmp_path).resolve("minecraft:a")
```

- [ ] **Step 2: Run the tag tests and confirm failure**

Run: `python -m pytest generator/tests/test_tags.py -v`

Expected: FAIL because `TagResolver` is undefined.

- [ ] **Step 3: Implement recursive namespace-aware resolution**

Support `values` entries that are strings or `{ "id": ..., "required": false }`, expand `#namespace:tag` references recursively, deduplicate and sort item IDs, cache successful resolutions, and report missing required tags with their dependency chain.

- [ ] **Step 4: Integrate resolved alternatives into recipes**

Add `resolve_recipe_ingredients(recipe: NormalizedRecipe, tags: TagResolver) -> NormalizedRecipe`. Preserve slot boundaries while replacing each item/tag reference with a sorted union of accepted concrete item IDs.

- [ ] **Step 5: Verify tags and all recipe ingredients**

Run: `python -m pytest generator/tests/test_tags.py generator/tests/test_recipes.py -v`

Expected: PASS, including `minecraft:planks` accepting the six overworld plank types and Nether plank types present in 1.16.1 data.

- [ ] **Step 6: Commit tag resolution**

```bash
git add generator/src/mcsr_data generator/tests/test_tags.py generator/tests/test_recipes.py
git commit -m "feat: resolve crafting ingredient tags"
```

### Task 3: Resolve English item names and define validation diagnostics

**Files:**
- Create: `generator/src/mcsr_data/translations.py`
- Create: `generator/src/mcsr_data/validation.py`
- Create: `generator/tests/test_translations.py`
- Create: `generator/tests/test_validation.py`

**Interfaces:**
- Consumes: `minecraft-data/lang/en_us.json` and output item IDs.
- Produces: `TranslationCatalog.load(path: Path)`, `TranslationCatalog.item_name(item_id: str) -> str`, `Diagnostic`, `ValidationReport`, and `ValidationFailed`.

- [ ] **Step 1: Write failing item/block lookup and diagnostic tests**

```python
def test_item_name_falls_back_to_block_translation():
    catalog = TranslationCatalog({"block.minecraft.crafting_table": "Crafting Table"})
    assert catalog.item_name("minecraft:crafting_table") == "Crafting Table"

def test_missing_name_is_an_error():
    report = ValidationReport()
    report.error("missing_translation", "minecraft:unknown", "No en_us name")
    with pytest.raises(ValidationFailed):
        report.raise_if_errors()
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `python -m pytest generator/tests/test_translations.py generator/tests/test_validation.py -v`

Expected: FAIL because the catalog and report types do not exist.

- [ ] **Step 3: Implement deterministic translation lookup and diagnostics**

Try `item.<namespace>.<path>` first, then `block.<namespace>.<path>`. Never synthesize a display name from an ID. Store diagnostics as `{severity, code, subject, message}` sorted by severity/code/subject for stable output.

- [ ] **Step 4: Verify every distinct crafting output has a translation**

Run: `python -m pytest generator/tests/test_translations.py generator/tests/test_validation.py -v`

Run a focused integration test that loads all 634 recipes, deduplicates output IDs, and calls `item_name` for each.

Expected: PASS or an explicit fixture-backed exception list added as validation data, never silent fallback text.

- [ ] **Step 5: Commit translation and validation support**

```bash
git add generator/src/mcsr_data generator/tests/test_translations.py generator/tests/test_validation.py
git commit -m "feat: validate English crafting output names"
```

### Task 4: Reproduce Minecraft 1.16.1 searchable tooltip lines

**Files:**
- Create: `generator/src/mcsr_data/tooltips.py`
- Create: `generator/src/mcsr_data/overrides.json`
- Create: `generator/references/minecraft-1.16.1-tooltip-sources.md`
- Create: `generator/tests/fixtures/expected_tooltips.json`
- Create: `generator/tests/test_tooltips.py`
- Modify: `generator/src/mcsr_data/models.py`

**Interfaces:**
- Consumes: output item ID, translated name, default recipe-output metadata, and auditable overrides.
- Produces: `build_search_item(item_id: str, name: str, output_nbt: dict[str, object] | None) -> SearchItem` with line sources and confidence.

- [ ] **Step 1: Encode known behavior as failing fixtures**

```json
{
  "minecraft:iron_sword": [
    "Iron Sword",
    "When in Main Hand:",
    "+5 Attack Damage",
    "-2.4 Attack Speed"
  ],
  "minecraft:diamond_sword": [
    "Diamond Sword",
    "When in Main Hand:",
    "+6 Attack Damage",
    "-2.4 Attack Speed"
  ]
}
```

Test that each fixture matches exactly, that all sword fixtures contain `4`, and that formatting retains plus/minus signs and Minecraft-style decimal trimming.

- [ ] **Step 2: Run tooltip tests and confirm failure**

Run: `python -m pytest generator/tests/test_tooltips.py -v`

Expected: FAIL because tooltip rule generation is not implemented.

- [ ] **Step 3: Audit and record the Minecraft 1.16.1 source path**

Use a pinned 1.16.1 Fabric Loom/Yarn source workspace or an equivalent named decompilation of the user's 1.16.1 client JAR. Record the exact mapped classes and methods responsible for recipe-search indexing, `ItemStack` tooltip construction, item attribute modifiers, equipment-slot headers, and number formatting in `generator/references/minecraft-1.16.1-tooltip-sources.md`. For every copied numeric attribute constant, record its source class, field or constructor, mappings version, and Minecraft version. Do not infer constants from modern Minecraft or visible wiki values.

- [ ] **Step 4: Implement source-backed equipment attribute tables and formatting**

Create explicit 1.16.1 material/type definitions for swords, axes, pickaxes, shovels, hoes, helmets, chestplates, leggings, and boots. Generate null-player attribute modifier lines using English translation labels and a number formatter that preserves the game's signs and decimal representation. Keep data definitions separate from formatting functions so later game-export diffs identify whether a mismatch is data or rendering.

- [ ] **Step 5: Add narrow override loading and audit rules**

Define override records with `item_id`, exact `lines`, and non-empty `reason`. Reject unknown fields, duplicate item IDs, and overrides without reasons. Mark generated equipment as `source_reproduced` and overrides as `explicit_override`.

- [ ] **Step 6: Expand fixtures across every equipment family and edge formatting value**

Include at least one wooden, stone, iron, golden, diamond, and Netherite case where craftable in the scoped recipe data; include positive integers, negative decimals, zero-free decimal trimming, armor values, and an exact iron-axe fixture containing `+8 Attack Damage` as the symbolic-search regression.

- [ ] **Step 7: Run the tooltip suite**

Run: `python -m pytest generator/tests/test_tooltips.py -v`

Expected: PASS with exact line equality and no unreported special-case output.

- [ ] **Step 8: Commit tooltip reproduction**

```bash
git add generator/src/mcsr_data generator/references/minecraft-1.16.1-tooltip-sources.md generator/tests/fixtures/expected_tooltips.json generator/tests/test_tooltips.py
git commit -m "feat: reproduce searchable item tooltips"
```

### Task 5: Generate deterministic browser data and validation reports

**Files:**
- Create: `generator/src/mcsr_data/generate.py`
- Create: `generator/tests/test_generate.py`
- Create: `web/public/data/.gitkeep`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: `generate(source_root: Path, output_root: Path) -> GenerationSummary`.
- Produces: `web/public/data/search-items.json`, `web/public/data/crafting-recipes.json`, and `web/public/data/validation-report.json` with `schema_version: 1`.

- [ ] **Step 1: Write a failing end-to-end fixture test**

```python
def test_generate_writes_stable_versioned_files(fixture_data, tmp_path):
    summary = generate(fixture_data, tmp_path)
    items = json.loads((tmp_path / "search-items.json").read_text())
    recipes = json.loads((tmp_path / "crafting-recipes.json").read_text())
    assert items["schema_version"] == 1
    assert recipes["schema_version"] == 1
    assert summary.error_count == 0
    assert list(items["items"]) == sorted(items["items"])
```

- [ ] **Step 2: Run the generator test and confirm failure**

Run: `python -m pytest generator/tests/test_generate.py -v`

Expected: FAIL because `generate` does not exist.

- [ ] **Step 3: Implement orchestration, atomic writes, and CLI**

Add a `mcsr-generate` script entry point accepting `--source minecraft-data` and `--output web/public/data`. Serialize sorted IDs and compact stable JSON, write temporary sibling files, and replace final files only after validation succeeds.

- [ ] **Step 4: Run generation against the real extracted data**

Run: `python -m mcsr_data.generate --source minecraft-data --output web/public/data`

Expected: 634 recipes processed, all tag references resolved, every distinct output named, zero validation errors, and three JSON outputs created.

- [ ] **Step 5: Verify determinism and all Python tests**

Run the generator twice and compare SHA-256 hashes of all outputs.

Run: `python -m pytest -v`

Expected: identical hashes and all tests PASS.

- [ ] **Step 6: Commit generator orchestration and generated artifacts**

```bash
git add pyproject.toml generator web/public/data
git commit -m "feat: generate validated search crafting data"
```

### Task 6: Scaffold the typed static web application and data schemas

**Files:**
- Create: `web/package.json` and Vite React/TypeScript scaffold files
- Create: `web/src/domain/types.ts`
- Create: `web/src/data/schema.ts`
- Create: `web/src/data/schema.test.ts`
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: generated JSON with `schema_version: 1`.
- Produces: `loadGeneratedData(baseUrl?: string) -> Promise<GeneratedData>` and domain types used by every engine/UI task.

- [ ] **Step 1: Scaffold React/TypeScript and install test dependencies**

Run: `npm create vite@latest web -- --template react-ts --no-interactive`

Run from `web/`: `npm install && npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`

Set Vite `base: "./"`, add `test`, `test:watch`, `typecheck`, and `build` scripts, and configure Vitest with `environment: "jsdom"`.

- [ ] **Step 2: Define exact domain interfaces and failing schema tests**

```ts
export interface SearchLine { source: string; text: string }
export interface SearchItem { id: string; name: string; searchLines: SearchLine[]; confidence: string }
export interface IngredientSlot { acceptedItems: string[] }
export interface CraftingRecipe {
  id: string; outputItemId: string; outputCount: number;
  ingredientSlots: IngredientSlot[]; fits2x2: boolean; fits3x3: boolean;
}
export interface GeneratedData {
  schemaVersion: 1; items: Map<string, SearchItem>; recipes: CraftingRecipe[];
}
```

Test rejection of a wrong schema version, missing item references, duplicate recipe IDs, empty search lines, and recipes with neither grid flag.

- [ ] **Step 3: Run the schema tests and confirm failure**

Run from `web/`: `npm test -- --run src/data/schema.test.ts`

Expected: FAIL because the validator/loader is missing.

- [ ] **Step 4: Implement runtime validation without adding a schema library**

Use focused type guards that collect path-specific errors and throw `GeneratedDataError`. Fetch both files relative to `import.meta.env.BASE_URL`, validate cross-references, and convert item records to a `Map`.

- [ ] **Step 5: Verify test, typecheck, and static build**

Run from `web/`: `npm test -- --run src/data/schema.test.ts && npm run typecheck && npm run build`

Expected: PASS and `web/dist/` contains relative asset/data references.

- [ ] **Step 6: Commit the browser scaffold**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/tsconfig*.json web/index.html web/src
git commit -m "feat: scaffold typed search crafting app"
```

### Task 7: Implement grid and infinite-inventory craftability

**Files:**
- Create: `web/src/engine/craftability.ts`
- Create: `web/src/engine/craftability.test.ts`

**Interfaces:**
- Consumes: `CraftingRecipe[]`, `Set<string>` inventory, and `GridSize = 2 | 3`.
- Produces: `isRecipeCraftable(recipe, inventory, gridSize) -> boolean`, `visibleOutputIds(recipes, inventory, gridSize) -> Set<string>`, and `targetSupports2x2(targetId, recipes) -> boolean`.

- [ ] **Step 1: Write failing behavior tests**

Test that repeated string slots succeed with one selected string ID, a plank tag succeeds only when a concrete accepted plank is selected, an oak log does not imply oak planks, 2x2 rejects 3x3 recipes, 3x3 includes 2x2 recipes, and multiple recipes produce one distinct output ID.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- --run src/engine/craftability.test.ts`

Expected: FAIL because the craftability functions are absent.

- [ ] **Step 3: Implement pure craftability functions**

Every ingredient slot passes when `acceptedItems.some(id => inventory.has(id))`. Ignore counts and consumption. Deduplicate visible outputs with a `Set`. Derive 2x2 target eligibility from any recipe for that target.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --run src/engine/craftability.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit craftability**

```bash
git add web/src/engine/craftability.ts web/src/engine/craftability.test.ts
git commit -m "feat: evaluate infinite inventory craftability"
```

### Task 8: Implement line-bounded search, candidates, and scoring

**Files:**
- Create: `web/src/engine/search.ts`
- Create: `web/src/engine/search.test.ts`
- Create: `web/src/engine/candidates.ts`
- Create: `web/src/engine/candidates.test.ts`
- Create: `web/src/engine/scoring.ts`
- Create: `web/src/engine/scoring.test.ts`

**Interfaces:**
- Produces: `matchItem(item, query) -> MatchExplanation[]`, `candidateQueries(targets, maxLength = 5) -> string[]`, `scoreStep(queryLength, junkCount) -> ScoreBreakdown`, `transitionTypingCost(from, to) -> number`, and `incompleteScore(targetCount, visibleCount) -> number`.

- [ ] **Step 1: Write failing search/candidate tests**

Test case-insensitive matching, exact matched spans, `+8`, spaces and punctuation, no cross-line matching, unique substrings of lengths one through five, and deterministic candidate ordering.

- [ ] **Step 2: Write failing score tests**

```ts
expect(scoreStep(2, 0).total).toBe(0)
expect(scoreStep(3, 0).total).toBe(1)
expect(scoreStep(1, 2).total).toBe(3)
expect(transitionTypingCost('bed', 'bow')).toBe(2)
expect(transitionTypingCost('iron', 'iro')).toBe(0)
expect(incompleteScore(2, 10)).toBeGreaterThan(maximumValidScore(2, 10))
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- --run src/engine/search.test.ts src/engine/candidates.test.ts src/engine/scoring.test.ts`

Expected: FAIL because the engine modules are missing.

- [ ] **Step 4: Implement normalized matching and candidate generation**

Use locale-stable lowercase normalization, retain original line text for explanations, and derive candidates independently from each target line. Never concatenate lines. Reject empty queries and lengths above five.

- [ ] **Step 5: Implement approved scoring formulas**

Return component breakdowns rather than bare totals. Use `0.5` per distinct junk output, a `2` junk-presence penalty, free backspaces via longest common prefix, and the clamped maximum-valid formula from the spec.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- --run src/engine/search.test.ts src/engine/candidates.test.ts src/engine/scoring.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit search primitives**

```bash
git add web/src/engine/search* web/src/engine/candidates* web/src/engine/scoring*
git commit -m "feat: add search matching and scoring primitives"
```

### Task 9: Rank complete single-query crafts

**Files:**
- Create: `web/src/engine/singleOptimizer.ts`
- Create: `web/src/engine/singleOptimizer.test.ts`

**Interfaces:**
- Consumes: target IDs, visible item IDs, and `Map<string, SearchItem>`.
- Produces: `optimizeSingle(input: OptimizeInput) -> SingleResult[]`, where every result contains query, covered targets, distinct junk IDs, explanations, and score breakdown.

- [ ] **Step 1: Write failing optimizer tests**

Create a fixture where `4` covers all swords with two distinct junk outputs, two recipes share one junk output, a cleaner three-character query competes with a dirty one-character query, and ties exercise all four approved tie-breakers.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/engine/singleOptimizer.test.ts`

Expected: FAIL because `optimizeSingle` is missing.

- [ ] **Step 3: Implement complete-candidate filtering and ranking**

Generate candidates from targets, compute each candidate's matches across visible outputs once, retain only candidates covering every target, calculate `junk = matches - targets`, attach line explanations, and sort by score then approved tie-breakers.

- [ ] **Step 4: Run optimizer and regression tests**

Run: `npm test -- --run src/engine/singleOptimizer.test.ts src/engine/search.test.ts src/engine/scoring.test.ts`

Expected: PASS with stable ordering.

- [ ] **Step 5: Commit single-query optimization**

```bash
git add web/src/engine/singleOptimizer.ts web/src/engine/singleOptimizer.test.ts
git commit -m "feat: rank single-query search crafts"
```

### Task 10: Find and rank craft-overlap sequences

**Files:**
- Create: `web/src/engine/overlapOptimizer.ts`
- Create: `web/src/engine/overlapOptimizer.test.ts`

**Interfaces:**
- Consumes: the same `OptimizeInput` as the single optimizer.
- Produces: `optimizeOverlap(input: OptimizeInput) -> OverlapResult[]` containing ordered steps, retained prefixes, free backspace counts, newly typed suffixes, per-step junk, combined unique junk, and total score.

- [ ] **Step 1: Write failing overlap tests**

Test that `bed -> bow` covers two targets with transition cost two, reverse ordering may cost more, each step covers a new target, repeated junk is charged at every step, target items are never junk, one query may cover multiple targets, and no sequence exceeds target count.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/engine/overlapOptimizer.test.ts`

Expected: FAIL because the state-search implementation is missing.

- [ ] **Step 3: Implement covered-mask/last-query state search**

Assign targets stable bit positions. Precompute each candidate's target mask, visible matches, per-step junk, and explanations. Start a state from every candidate covering a target; transition only to candidates adding a new target bit. Retain the best score and path for each `(mask, lastQuery)` state, then collect full-mask states.

- [ ] **Step 4: Add deterministic result ranking and path reconstruction**

Apply score, junk appearances, step count, new-character count, and alphabetical sequence tie-breakers. Reconstruct each transition's retained prefix, zero-cost backspaces, and typed suffix.

- [ ] **Step 5: Run all engine tests**

Run: `npm test -- --run src/engine && npm run typecheck`

Expected: PASS, including directional and repeated-junk cases.

- [ ] **Step 6: Commit overlap optimization**

```bash
git add web/src/engine/overlapOptimizer.ts web/src/engine/overlapOptimizer.test.ts
git commit -m "feat: optimize overlapping search crafts"
```

### Task 11: Add versioned inventory and target-workspace persistence

**Files:**
- Create: `web/src/persistence/storage.ts`
- Create: `web/src/persistence/storage.test.ts`
- Create: `web/src/presets/builtInPresets.ts`

**Interfaces:**
- Produces: `loadCustomInventorySlots()`, `saveCustomInventorySlot(index, preset)`, `clearCustomInventorySlot(index)`, `loadTargetWorkspace()`, and `saveTargetWorkspace(workspace)`.

- [ ] **Step 1: Write failing persistence tests with an isolated Storage double**

Test exactly three slots, slot bounds `0..2`, name/item-only inventory records, separately stored target entries, enabled/grid/order round trips, schema-version migration, corrupt-record isolation, and preservation of the raw corrupt value under a recovery key.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- --run src/persistence/storage.test.ts`

Expected: FAIL because storage adapters do not exist.

- [ ] **Step 3: Implement version-1 codecs and safe recovery**

Use distinct keys `mcsr.inventory-slots.v1` and `mcsr.target-workspace.v1`. Parse and validate each record; on failure copy the original string to a timestamped `mcsr.recovery.*` key, return safe defaults, and expose a user-readable warning.

- [ ] **Step 4: Add an initially empty typed built-in preset list**

Export `BUILT_IN_INVENTORY_PRESETS: readonly InventoryPreset[] = []` with a comment directing future preset additions to this file. Do not invent MCSR stage contents; the user will supply them.

- [ ] **Step 5: Run persistence tests and typecheck**

Run: `npm test -- --run src/persistence/storage.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add web/src/persistence web/src/presets
git commit -m "feat: persist inventories and target workspace"
```

### Task 12: Build inventory and target-set editing UI

**Files:**
- Create: `web/src/components/InventoryPanel.tsx`
- Create: `web/src/components/InventoryPanel.test.tsx`
- Create: `web/src/components/TargetSetList.tsx`
- Create: `web/src/components/TargetSetList.test.tsx`
- Create: `web/src/components/ItemPicker.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`

**Interfaces:**
- Consumes: loaded item data, recipes, preset/storage adapters, and pure engine eligibility functions.
- Produces: controlled inventory and target-workspace state passed to optimization.

- [ ] **Step 1: Write failing inventory interaction tests**

Test searching/selecting explicit item IDs, loading a built-in preset into an editable copy, naming/saving/loading/clearing each of three custom slots, and verifying that selecting oak log does not select oak planks.

- [ ] **Step 2: Write failing target-set interaction tests**

Test adding/removing targets, defaulting new sets to 3x3, allowing 2x2 only when every target supports it, explaining incompatible targets, enabling/disabling entries, reordering entries, and auto-saving the workspace without modifying inventory slots.

- [ ] **Step 3: Run component tests and confirm failure**

Run: `npm test -- --run src/components/InventoryPanel.test.tsx src/components/TargetSetList.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement accessible controlled components**

Use labeled inputs, real buttons, checkbox/switch semantics, keyboard-operable item selection, and textual grid-error feedback. Keep persistence effects in `App.tsx`; components emit typed changes and remain independently testable.

- [ ] **Step 5: Run component tests, typecheck, and build**

Run: `npm test -- --run src/components && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit editing UI**

```bash
git add web/src/components web/src/App.tsx web/src/App.css
git commit -m "feat: edit inventories and target sets"
```

### Task 13: Present explainable optimization results and aggregate scoring

**Files:**
- Create: `web/src/components/ResultPanel.tsx`
- Create: `web/src/components/ResultPanel.test.tsx`
- Create: `web/src/engine/optimizeWorkspace.ts`
- Create: `web/src/engine/optimizeWorkspace.test.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`

**Interfaces:**
- Produces: `optimizeWorkspace(data, inventory, entries) -> WorkspaceResult`, cancellation token support, per-entry categories, and aggregate enabled-entry score.

- [ ] **Step 1: Write failing workspace orchestration tests**

Test disabled-entry exclusion, 2x2 versus 3x3 visible outputs, separate single/overlap categories, promotion of overlap when single is empty, incomplete maximum score when both are empty, and aggregate summing of each enabled entry's lowest complete category score or failure score.

- [ ] **Step 2: Write failing result presentation tests**

Test query sequences, component score breakdown, targets per step, distinct per-step junk, repeated-junk charges, combined junk list, exact matched line/span, retained prefix, free backspace count, typed suffix, and recovery/data-validation errors.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- --run src/engine/optimizeWorkspace.test.ts src/components/ResultPanel.test.tsx`

Expected: FAIL because orchestration and result views are missing.

- [ ] **Step 4: Implement cancellable workspace optimization**

Use an incrementing request ID or `AbortController` boundary so input changes invalidate older calculations. Optimize enabled entries independently, yield between entries for UI responsiveness, and publish results only when the request remains current.

- [ ] **Step 5: Implement result categories and explanations**

Render single and overlap sections independently. When single is empty, label overlap as the available complete method; when both are empty, show unmatched targets and the deterministic maximum score. Display aggregate score without hiding the non-winning complete category.

- [ ] **Step 6: Run full browser unit suite**

Run: `npm test -- --run && npm run typecheck && npm run build`

Expected: all tests PASS and production build succeeds.

- [ ] **Step 7: Commit results and orchestration**

```bash
git add web/src/components/ResultPanel* web/src/engine/optimizeWorkspace* web/src/App.tsx web/src/App.css
git commit -m "feat: display explainable optimized crafts"
```

### Task 14: Verify the complete static application

**Files:**
- Create: `web/e2e/app.spec.ts`
- Create: `web/playwright.config.ts`
- Modify: `web/package.json`
- Create: `README.md`

**Interfaces:**
- Consumes: completed generator, engine, UI, and real generated data.
- Produces: documented local generation/test/build workflow and one browser-level acceptance path.

- [ ] **Step 1: Add Playwright and a failing acceptance test**

Install `@playwright/test`, add `e2e` script, and test this full path: load generated data, select an explicit inventory, create a target set, choose a valid grid, view ranked single and overlap sections, disable the set, and verify the aggregate score excludes it.

- [ ] **Step 2: Run the acceptance test and confirm its initial failure**

Run from `web/`: `npm run e2e`

Expected: FAIL until selectors, startup configuration, or missing integration behavior is completed.

- [ ] **Step 3: Complete only the integration fixes exposed by the acceptance test**

Use accessible roles/labels rather than test-only selectors. Configure Playwright to start `npm run dev -- --host 127.0.0.1` and test Chromium at a desktop viewport.

- [ ] **Step 4: Document exact development workflow**

Document Python environment setup, generator invocation, web dependency installation, unit tests, E2E tests, static build, data locations, built-in preset editing, the three custom slots, target-workspace persistence, and the deferred Fabric validation step.

- [ ] **Step 5: Run final verification from clean generated outputs**

Run:

```bash
python -m pytest -v
python -m mcsr_data.generate --source minecraft-data --output web/public/data
cd web
npm test -- --run
npm run typecheck
npm run build
npm run e2e
```

Expected: all Python, TypeScript, component, and browser tests PASS; generation reports zero errors; the production static build succeeds.

- [ ] **Step 6: Inspect Git scope and commit final integration**

Run: `git status --short` and verify `minecraft-data/`, `.venv/`, `node_modules/`, and `dist/` are not staged.

```bash
git add README.md web/e2e web/playwright.config.ts web/package.json web/package-lock.json
git commit -m "test: verify complete search crafting workflow"
```
