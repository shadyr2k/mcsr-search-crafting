# Task 7 implementation report

## What I implemented

- Added `web/src/engine/realDataAcceptance.test.ts`, which imports all four tracked runtime JSON payloads and passes them through `parseGeneratedData` before exercising `eligibleRecipes`, `matchEligibleCollectionOutputs`, and `candidateQueriesForTargets`.
- Locked exact `wn` and `wn ` output sets, required `re` inclusions, String-only White Wool isolation, direct-name `ngo`/`ro`/`oe` results, and White Bed alias-derived candidates.
- Updated `README.md` with the complete schema-version-3 contract, five generated artifacts, pinned 634/562/281/354 counts, category-plus-group construction, ungrouped isolation, match-all-members/emit-only-eligible behavior, exact item identity, the Brown Bed to White Bed example, four runtime fetches, mixed-version rejection, acceptance queries, and browser alias coverage.

## TDD evidence

Task 7 adds acceptance coverage for collection behavior already implemented in Tasks 4–6, so a correct test passed against the unmodified production code. To prove the test detects the load-bearing regression, I used a temporary mutation in `collectionSearch.ts` that limited matching to the first collection member (`slice(0, 1)`), ran the test, and restored the production implementation without retaining a diff.

### RED

Command:

```powershell
& 'C:\Users\Carsten\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' --run 'src/engine/realDataAcceptance.test.ts'
```

Result with the temporary regression: exit 1; 1 test file failed; 2 tests failed and 2 passed. The exact `wn` assertion received only `minecraft:respawn_anchor` instead of White Bed, Respawn Anchor, White Carpet, and White Banner. The `re` inclusion assertion also failed. This was the expected failure because truncating member search removes the Brown aliases that surface eligible white outputs.

### GREEN

After restoring `collection.outputItemIds.slice()`, the same focused command passed: 1 test file, 4 tests, 4 passed. The final fresh run after the Task 6 fixture correction also passed 4/4 in 1.14 seconds.

## Final verification from `5768bb5`

- `\.venv\Scripts\python.exe -m pytest -v`: 96 collected, 96 passed in 1.35 seconds.
- `\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data`: generated 634 recipes, 562 output items, 281 inventory items, 354 result collections, 0 validation errors.
- Generation artifact check: SHA-256 for all five tracked artifacts was unchanged from the committed files. A second production generation produced identical hashes for all five artifacts.
- Pinned Node focused Vitest command: 1 file passed, 4/4 tests passed.
- Pinned Node full Vitest command (`node_modules/vitest/vitest.mjs --run`): 15 files passed, 117/117 tests passed in 2.43 seconds.
- Pinned TypeScript command (`node_modules/typescript/bin/tsc -b --pretty false`): exit 0, no output.
- Pinned Vite command (`node_modules/vite/bin/vite.js build`): exit 0; 45 modules transformed; production build completed in 513 ms.
- Pinned Playwright command (`node_modules/@playwright/test/cli.js test`): 3/3 Chromium tests passed in 4.7 seconds at the configured 1440x1000 viewport.
- `git diff --check`: exit 0, no whitespace errors (Git printed only the existing LF-to-CRLF working-copy notice for README).
- `git status --short` before commit: only `README.md` modified and `web/src/engine/realDataAcceptance.test.ts` untracked.
- Unfinished/schema-drift scan: clean; no `TBD`, `FIXME`, `NotImplemented`, `schemaVersion: 2`, or `schema_version: 2` matches in the specified spec, plan, generator, runtime, E2E, and README paths.

## Self-review

- Completeness: every Task 7 acceptance query and README contract item is covered.
- Test quality: expectations are literal exact item IDs; `wn` and `wn ` remain exact `Set` equality, while `re` and direct-name cases use explicit required inclusions as specified.
- Boundary fidelity: tests use tracked generated payloads through the real parser and engine APIs; they do not inspect raw names directly or duplicate matching logic.
- Scope: no production code or generated data remains changed; only the two authorized deliverables will be committed.
- Mutation check: truncating collection member traversal makes the new acceptance suite fail for the intended reason.

## Issues or concerns

- The first Playwright run found a pre-existing invalid Task 6 routed fixture. The controller reopened Task 6; commit `5768bb5` corrected and independently approved it. The complete Playwright suite now passes.
- Playwright emits a non-failing environment warning that `NO_COLOR` is ignored because `FORCE_COLOR` is set. No application/test warning or failure remains.

## Commit

- `7b544adaf24726b9a0bdcde73f7861abdd0e4309` — `test: lock recipe collection search behavior`
- Commit contains only `README.md` and `web/src/engine/realDataAcceptance.test.ts`; post-commit `git status --short` is empty.
