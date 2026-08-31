# Task 3 report: Load and cross-validate schema version 3 in the browser

## Implementation

Updated only the Task 3 implementation files:

- `web/src/domain/types.ts`
  - Added `RecipeBookCategory` and `RecipeResultCollection`.
  - Added recipe group, category, and result-collection fields to `CraftingRecipe`.
  - Raised `GeneratedData` to schema version 3 and added its collection map.
- `web/src/data/schema.ts`
  - Requires schema version 3 for all four generated artifacts.
  - Strictly parses recipe group/category/collection references and collection records.
  - Rejects invalid categories, duplicate collection IDs, duplicate collection member IDs, missing graph references, mismatched recipe metadata, missing/multiple memberships, and output-list mismatches while aggregating independent diagnostics.
  - Fetches `recipe-result-collections.json` in the existing parallel `Promise.all` and passes all four payloads to the public parser.
- `web/src/data/schema.test.ts`
  - Replaced fixtures with a complete schema-v3 graph.
  - Added exact-path diagnostics for every requested graph-validation boundary, including category and group disagreement.
  - Asserts that the loader requests the fourth generated artifact.

## TDD evidence

RED command (run from `web` with the pinned Node executable):

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Result before implementation: failed, with 13 of 19 tests failing. The valid v3 fixture reported `items.schema_version`, `inventoryItems.schema_version`, and `recipes.schema_version` as expecting 2; all new collection diagnostics were absent because the old parser accepted only three payloads.

GREEN command (same pinned Node invocation):

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Final result: passed — 1 file, 20 tests.

## Verification

Focused loader gate:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Passed: 20/20 tests.

Typecheck:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/typescript/bin/tsc -b --pretty false
```

Failed with seven downstream fixture errors outside Task 3 scope:

- `src/components/TargetSetList.test.tsx`: three `CraftingRecipe` literals omit the new required v3 recipe fields.
- `src/engine/craftability.test.ts`: its `Partial<CraftingRecipe>` builder can leave the required v3 fields undefined.
- `src/engine/optimizeWorkspace.test.ts`: one `CraftingRecipe` literal omits the new fields and two `GeneratedData` fixtures still declare schema version 2.

Full suite:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run
```

Result: 12 test files passed, 1 failed; 91 tests passed and 6 failed. Every failure is in `src/App.test.tsx`, whose stub still serves three schema-v2 payloads and no collections payload. The new browser boundary correctly rejects that mixed graph. Those fixtures are assigned to the later app-wiring task and were intentionally not changed here.

The first sandboxed focused-test attempt could not read Vite's worktree configuration; all recorded RED/GREEN, typecheck, and full-suite runs used the same pinned Node executable with approved worktree access. `pnpm` was not invoked, as instructed for the `web/node_modules` junction.

## Self-review

- Reviewed the full diff and ran `git diff --check`; no whitespace errors.
- Confirmed all parser diagnostics contain a JSON source path.
- Confirmed collection parsing does not repair invalid data and graph validation runs after all independent artifact parsers.
- Confirmed duplicate graph records remain errors even though maps are constructed only after validation succeeds.

## Concerns

The required schema-v3 type contract necessarily invalidates legacy v2 test fixtures in later task files. Updating them here would exceed the specified Task 3 file and commit scope; the follow-on tasks must migrate those fixtures before repository-wide typecheck and App-suite success can be claimed.

## Concern resolution: Ruling 3 fixture migration

Applied the controller's Ruling 3 to keep Task 3 independently testable:

- `web/src/components/TargetSetList.test.tsx` now gives each recipe the required group, category, and result-collection reference.
- `web/src/engine/craftability.test.ts` supplies valid schema-v3 recipe metadata from its fixture builder.
- `web/src/engine/optimizeWorkspace.test.ts` now builds schema-version 3 `GeneratedData` fixtures with an isolated, matching collection for each recipe.
- `web/src/App.test.tsx` now serves schema-version 3 item, inventory, recipe, and collection payloads. Its custom single-recipe scenario also supplies the corresponding single collection, keeping the graph valid.

Verification after the migration (all commands run from `web` with the pinned Node executable):

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/components/TargetSetList.test.tsx src/engine/craftability.test.ts src/engine/optimizeWorkspace.test.ts src/App.test.tsx
```

Passed: 4 files, 31 tests.

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run
```

Passed: 13 files, 97 tests.

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/typescript/bin/tsc -b --pretty false
```

Passed: exit code 0 with no diagnostics.

## Review fix round 1/5: exact whitespace recipe groups

Resolved the review finding in `getNullableGroup`: group values now reject only non-strings and `''`; a non-empty group is preserved exactly, including a whitespace-only string. The generic trimmed non-empty-string parser remains in use for fields that must not accept whitespace-only identifiers.

Added a regression that parses a complete graph where both the recipe and its collection use `recipe_group: ' '`, then asserts the resulting domain recipe and collection retain `' '` verbatim.

RED verification:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Before the parser fix: 1 failed / 21 tests, with both `recipes[0].recipe_group` and `collections[0].recipe_group` rejecting the whitespace group.

GREEN verification:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Passed: 21/21 tests.

Full verification:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/typescript/bin/tsc -b --pretty false
```

Passed: Vitest 13 files / 98 tests; TypeScript exit code 0 with no diagnostics.

## Final whole-branch review fix round 1/5: collection construction invariants

Strengthened browser graph validation so an internally referential schema-v3 payload cannot encode source-invalid collection construction:

- Every collection must have non-empty `recipe_ids` and `output_item_ids` arrays.
- A collection with `recipe_group: null` must contain exactly one recipe.
- A non-null `(recipe_book_category, recipe_group)` pair can occur in only one collection. The key uses the source group string verbatim, without trimming or normalization.

Tests add internally consistent adversarial graphs that previously parsed successfully: an empty orphan collection, a merged two-recipe null-group collection, and split grouped collections with the same semantic key. A companion success test verifies `' tools'` and `'tools'` remain distinct keys.

RED verification:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
```

Before the fix: 3 failed / 24 tests; each adversarial payload parsed successfully instead of producing `GeneratedDataError` diagnostics.

GREEN and full verification:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/data/schema.test.ts
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/typescript/bin/tsc -b --pretty false
```

Passed: schema suite 25/25; full Vitest 15 files / 121 tests; TypeScript exit code 0 with no diagnostics.
