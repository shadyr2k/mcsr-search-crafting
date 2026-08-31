# Task 1 report — recipe-result collection model

Status: DONE

Commit: `fc229aa feat: model recipe result collections`

## Implementation summary

- Recorded a reproducible Minecraft Java 1.16.1 client-source audit using the
  pinned official client, Fabric intermediary mappings, Yarn
  `1.16.1+build.21`, Tiny Remapper `0.12.2`, and CFR `0.152`.
- Reproduced `ClientRecipeBook#getGroupForRecipe` from output item groups:
  219 building-block outputs, 53 equipment outputs, 68 redstone outputs, and
  222 misc outputs.
- Retained exact non-empty recipe group strings, converted missing/empty
  groups to `None`, and rejected explicit non-string values.
- Added the recipe-book category and result-collection model, including the
  optional recipe enrichment fields required by later generator stages.
- Added a strict loader for the packaged exhaustive category resource.
- Added deterministic category-plus-group collection construction with
  isolated ungrouped recipes, URL-encoded stable IDs, sorted members and
  outputs, collision detection, and exactly-one-assignment validation.
- Added package-data configuration for all `mcsr_data` JSON resources.
- Reproduced the pinned corpus result: 634 recipes, 562 exact output items,
  and 354 recipe-result collections.

## Files changed

- `pyproject.toml`
- `generator/references/minecraft-1.16.1-recipe-collection-sources.md`
- `generator/src/mcsr_data/models.py`
- `generator/src/mcsr_data/recipes.py`
- `generator/src/mcsr_data/recipe_book_categories.json`
- `generator/src/mcsr_data/recipe_collections.py`
- `generator/tests/test_recipes.py`
- `generator/tests/test_recipe_collections.py`

## Tests and exact results

### Baseline

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest -v
```

Result before edits: `68 passed in 1.15s`.

### Focused parser gate

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipes.py -v
```

RED result: `8 failed, 6 passed in 0.38s`.

GREEN result: `14 passed in 0.04s`.

### Focused collection gate

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipe_collections.py -v
```

RED result: collection stopped with one expected import error,
`ModuleNotFoundError: No module named 'mcsr_data.recipe_collections'`.

First implementation run: `16 passed, 1 failed in 0.31s`. The failure showed
that the test's output-based helper incorrectly assumed Brown Bed has only one
recipe collection; the real corpus has both `bed` and `dyed_bed` recipes. The
fixture was corrected to compare the specific client recipe members required
by the brief, including `white_wool_from_string` for the isolated White Wool
recipe.

Final collection result: `17 passed in 0.25s`.

### Final focused gate

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_recipes.py generator/tests/test_recipe_collections.py -v
```

Result: `31 passed in 1.56s`.

### Full Python suite

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest -v
```

Result: `93 passed in 1.46s`.

### Additional verification

- `git diff --cached --check`: exit 0, no output.
- Staged-path review: exactly the eight Task 1 paths listed above.
- Corpus probe: `recipes=634 outputs=562 collections=354`.
- Audited category probe:
  `crafting_building_blocks=219`, `crafting_equipment=53`,
  `crafting_redstone=68`, `crafting_misc=222`.

## RED/GREEN TDD evidence

1. Parser tests were written first and failed because `NormalizedRecipe` had
   no `recipe_group` attribute and invalid explicit groups were accepted.
   Minimal parser/model changes made all 14 parser tests pass.
2. Collection tests were written before the module/model/resource existed and
   failed at the expected missing-module boundary. The collection model,
   loader, audited resource, and assigner were then implemented to satisfy the
   tests.
3. The real-corpus test was tightened during self-review to require exact set
   equality between the 562 generated outputs and the category resource, not
   merely successful assignment.

## Self-review findings

- Confirmed group strings are neither trimmed nor lower-cased; the whitespace
  preservation fixture passes.
- Confirmed explicit JSON null is rejected while an absent field is valid.
- Confirmed grouped keys include both category and exact group; ungrouped keys
  include exact recipe ID.
- Confirmed URL encoding protects arbitrary group and recipe strings from
  delimiter collisions.
- Confirmed recipe IDs, distinct output IDs, enriched recipes, and collections
  are all returned in deterministic order.
- Confirmed the category loader rejects wrong version, unknown category,
  duplicate assignment, non-string/empty item IDs, and unsorted/duplicate
  lists with deterministic errors.
- Confirmed the exhaustive resource exactly equals the real 562-output set and
  reproduces the pinned bed, carpet, banner, respawn-anchor, and White Wool
  membership behavior.
- Confirmed only Task 1 files were committed. The temporary downloaded,
  remapped, and decompiled audit artifacts were removed before staging.
- No reviewer was dispatched, per the task contract.

## Concerns

None.
