# Task 5 report — collection-aware optimizer integration

## Implementation

- Replaced flat `visibleItemIds` optimizer input with eligible recipes, all recipes, recipe-result collections, and search items.
- Changed target candidate preparation to use `candidateQueriesForTargets` and evaluate every candidate through `matchEligibleCollectionOutputs`.
- Derived target masks, covered targets, and junk solely from exact eligible output IDs. Uncraftable alias members can explain a match but cannot become visible junk.
- Kept synchronous and cooperative preparation on the same collection-matching and candidate-finalization helpers so their prepared results are deeply equal.
- Changed matching work accounting to candidate query count multiplied by eligible collection count. Progress, yield, and abort checks occur after each configured collection-sized work chunk.
- Wired workspace optimization through `eligibleRecipes`, while retaining exact visible-output IDs, incomplete-result behavior, entry ordering, aggregation, and stale/abort checks.
- Changed single, prepared, and overlap explanation types to `CollectionMatchExplanation[]`. No scoring formula, overlap transition, state expansion, tie-breaker, or failure-score function was changed.
- Per controller ruling, pulled forward the smallest Task 6 consumer migration needed to keep Task 5 independently type-safe: `ResultPanel` now renders the visible craftable output separately from the matched member, uses explanation-owned names/IDs, shows group or isolated collection identity, and preserves highlighting plus invalid-span handling. `ResultPanel.test.tsx` and the affected `App.test.tsx` synthetic result were migrated to full collection explanations. E2E was not changed.

## TDD evidence

### Optimizer RED

Command (from `web`):

```text
C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/vitest/vitest.mjs --run src/engine/singleOptimizer.test.ts src/engine/overlapOptimizer.test.ts src/engine/optimizeWorkspace.test.ts
```

Observed before optimizer implementation:

```text
Test Files  3 failed (3)
Tests       12 failed | 12 passed (24)
```

The single and overlap fixtures failed with `input.visibleItemIds is not iterable`, proving they exercised the requested new input contract. The workspace alias assertion failed because query `wn` was absent, proving flat output matching could not surface White Bed through Brown Bed.

### Optimizer GREEN

Same command after implementation:

```text
Test Files  3 passed (3)
Tests       24 passed (24)
```

### Consumer RED

Command (from `web`):

```text
C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/vitest/vitest.mjs --run src/components/ResultPanel.test.tsx src/App.test.tsx
```

Observed after migrating fixtures but before changing the panel:

```text
Test Files  1 failed | 1 passed (2)
Tests       3 failed | 12 passed (15)
```

The old renderer produced blank legacy item IDs and did not render either the visible craftable output role or matched-member role.

### Consumer GREEN

Same command after the panel migration:

```text
Test Files  2 passed (2)
Tests       15 passed (15)
```

## Final verification

All commands used the required bundled Node executable and were run from `web`.

- Focused optimizer Vitest: 3 files passed, 24 tests passed.
- Full Vitest: 14 files passed, 113 tests passed.
- TypeScript: `node_modules/typescript/bin/tsc -b --pretty false` exited 0 with no output.
- `git diff --check`: exited 0; no whitespace errors.

## Files changed

- `web/src/engine/singleOptimizer.ts`
- `web/src/engine/singleOptimizer.test.ts`
- `web/src/engine/overlapOptimizer.ts`
- `web/src/engine/overlapOptimizer.test.ts`
- `web/src/engine/optimizeWorkspace.ts`
- `web/src/engine/optimizeWorkspace.test.ts`
- `web/src/components/ResultPanel.tsx` (controller-ruling boundary correction)
- `web/src/components/ResultPanel.test.tsx` (controller-ruling boundary correction)
- `web/src/App.test.tsx` (mechanical collection-explanation fixture migration)

## Self-review

- Confirmed `scoreStep`, `transitionTypingCost`, `optimizeSinglePrepared`, overlap state expansion/ranking, and `incompleteScore` mathematics are unchanged.
- Confirmed both preparation modes call the same collection matcher and finalizer; the cooperative equality test compares the complete prepared structures.
- Confirmed collection IDs, output IDs, queries, targets, junk, and explanations are deterministically sorted by the existing collection matcher plus sorted eligible collection traversal.
- Confirmed tests independently reverse recipe order, collection-map order, collection member output order, target order, and inventory order, comparing complete `WorkspaceResult` values.
- Confirmed pre-abort, between-entry abort, within-entry abort/progress, and large-member-collection cancellation remain covered.
- Confirmed the ResultPanel derives both roles from `CollectionMatchExplanation` rather than the runtime item map.

## Concerns

- Task 6 now starts with its ResultPanel renderer/unit-fixture portion already implemented by controller ruling. Its remaining E2E alias fixture and any broader App/E2E work should build on these changes rather than repeat them.

## Review fix round 1

### Finding addressed

Cooperative preparation previously called the synchronous collection matcher and could not yield or observe cancellation until every member in a large collection had been scanned and the query×collection unit was reported complete.

The collection matcher now shares deterministic grouping, explanation construction, deduplication, and final sorting between synchronous and cooperative traversal. The cooperative traversal checkpoints between collection members. `prepareOptimizationCooperatively` uses the configured work chunk size for those inter-member yields, reports the current unchanged collection-unit progress before yielding, and increments `completed` only after the complete collection match is returned. The existing collection-level progress/yield counter remains separate.

The synchronous/cooperative equality fixture now uses a real two-member alias collection, covering the new traversal rather than only isolated one-member collections.

### Fix RED

Command:

```text
C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/vitest/vitest.mjs --run src/engine/optimizeWorkspace.test.ts -t "cancels during member matching"
```

Observed before the correction:

```text
Test Files  1 failed (1)
Tests       1 failed | 12 skipped (13)
expected Set{ 0, 1 } to deeply equal Set{ 0 }
```

This proved the aborting yield happened only after the collection had reported one completed unit.

### Fix GREEN and final verification

- Targeted regression: 1 passed, 12 skipped.
- Focused optimizer gate: 3 files passed, 24 tests passed.
- Full Vitest: 14 files passed, 113 tests passed.
- TypeScript: `node_modules/typescript/bin/tsc -b --pretty false` exited 0 with no output.
