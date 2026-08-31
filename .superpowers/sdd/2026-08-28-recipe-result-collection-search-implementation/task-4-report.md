# Task 4 — Collection-aware recipe matching

## Status

DONE. Implemented only the Task 4 engine/source test scope on top of `73f586a`.

## Behavior implemented

- `eligibleRecipes` exposes every recipe that satisfies the existing exact-item, infinite-inventory craftability predicate. `visibleOutputIds` now projects those recipes to distinct output IDs without changing its observable behavior.
- `candidateQueriesForTargets` finds every collection reached by an exact target recipe, supplies all of each collection's output members to the existing line-bounded normalized substring generator, and rejects missing collection/item graph references.
- `matchEligibleCollectionOutputs` first matches every member line of each collection represented by an eligible recipe, then emits only that collection's eligible exact output IDs. An uncraftable alias member may therefore make a different craftable output searchable.
- Collection explanations retain the matched alias member and visible craftable output separately, preserve low-level Unicode-safe spans, sort deterministically, and deduplicate identical output/explanation tuples.

## Files changed

- `web/src/engine/craftability.ts`
- `web/src/engine/craftability.test.ts`
- `web/src/engine/search.ts`
- `web/src/engine/candidates.ts`
- `web/src/engine/candidates.test.ts`
- `web/src/engine/collectionSearch.ts`
- `web/src/engine/collectionSearch.test.ts`

## TDD evidence

### RED

After adding the Task 4 tests and before adding production code, ran from `web`:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/engine/collectionSearch.test.ts src/engine/candidates.test.ts src/engine/craftability.test.ts
```

The required elevated retry (the existing `node_modules` junction cannot be followed inside the filesystem sandbox) failed as expected: `eligibleRecipes` and `candidateQueriesForTargets` were not functions, and `collectionSearch.test.ts` could not resolve the absent `./collectionSearch` module. The initial test fixture had a syntax typo; it was corrected before the recorded RED rerun. A later expected-value correction removed a second accidental `wn` occurrence from `Brown Bed wn `, retaining the intended single `Brown`/trailing-space match.

### GREEN

After the minimal implementation, ran:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run src/engine/search.test.ts src/engine/candidates.test.ts src/engine/craftability.test.ts src/engine/collectionSearch.test.ts
```

Result: 4 test files passed; 25 tests passed.

## Verification

Full Vitest suite:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/vitest/vitest.mjs run
```

Result: 14 test files passed; 107 tests passed.

Typecheck:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' node_modules/typescript/bin/tsc -b --pretty false
```

Result: passed with no output.

`git diff --check` produced no whitespace errors.

## Self-review

Reviewed the complete Task 4 source/test diff after verification. The implementation keeps the pre-existing line matcher as the only matching primitive, does not alter item IDs or scoring, uses a distinct eligible-output projection, and sorts both output IDs and explanation records. Tests cover alias-only visibility, trailing spaces, multiple eligible outputs, cross-collection output merging, duplicate eligible recipes, candidate uniqueness/line boundaries/length limits, missing item references, and Unicode spans.

## Concerns

None. Engine functions rely on the schema loader's graph validation for recipe-to-collection membership/category consistency, as specified; they explicitly reject the missing collection and item references that would otherwise make candidate/match traversal unsafe.
