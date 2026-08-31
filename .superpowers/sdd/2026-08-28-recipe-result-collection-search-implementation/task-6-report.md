# Task 6 report — recipe collection alias explanations

## Status

Committed as `16e6a16 feat: explain recipe collection aliases` after the final
verification evidence below.

## Implemented

- Migrated the routed Unicode browser fixture to the complete schema-v3 graph:
  enriched recipes, two isolated collections, and all four generated-data routes.
  The browser assertion retains the UTF-16 `😀İx` source/span check and now
  distinguishes the craftable output from the matched member.
- Added a real-browser Brown Bed alias scenario.  The target is exact White
  Bed; Brown Bed is in the same `bed` collection but its recipe is ineligible.
  A separate eligible junk collection has every one- and two-character target
  candidate from `Brown Bed` and `White Bed` except `wn`, so the winner is
  deterministically `wn` with no junk.  The test verifies White Bed is the
  target/craftable output and Brown Bed appears only as matching evidence.
- Added the missing App fixture assertion that its generated-data load
  requests `recipe-result-collections.json`.
- Updated the pre-existing production-data E2E expectation from `ak s` / 4.5
  to `a s` / 3.5.  Collection-member candidates now validly include the alias
  result: `a s` matches the slab/stairs collection members and also the exact
  Oak Sign output, producing one junk item and the observed 3.5 score.

## Inherited completed work

The controller's Task 5 boundary ruling had already delivered production
`ResultPanel` alias rendering, its focused component fixture, and the App
explanation fixture on base `48d22e2`.  I inspected those files and did not
repeat their migrations or invent RED evidence for them.

## TDD evidence

- RED: the first complete browser run found the existing production-data
  expectation stale: `Expected: "ak s"; Received: "a s"`.  After updating
  that single expectation, the same focused run exposed the accompanying
  score drift (`4.5` absent; rendered score `3.5`), confirming the candidate
  expansion rather than an optimizer failure.  The error-context accessibility
  snapshot showed the alias member explanations and one exact Oak Sign junk
  output.
- GREEN: after correcting the E2E expectation and adding the schema-v3 routed
  fixtures, the full Playwright command completed all three scenarios,
  including Unicode and Brown Bed alias coverage.
- The new Brown Bed browser test did not have a separate production RED: the
  matching and rendering implementation was deliberately inherited from the
  reviewed Task 5 commit.  I did not revert it or manufacture a failure solely
  to create evidence.

## Verification

- `node.exe node_modules/vitest/vitest.mjs run src/components/ResultPanel.test.tsx src/App.test.tsx`
  — 2 files, 15 tests passed.
- `node.exe node_modules/@playwright/test/cli.js test --reporter=line`
  — 3 Chromium E2E scenarios completed successfully.
- `node.exe node_modules/vitest/vitest.mjs run`
  — 14 files, 113 tests passed.
- `node.exe node_modules/typescript/bin/tsc -b --pretty false`
  — exit 0, no diagnostics.
- `git diff --check` — no whitespace errors.

All Node commands used the pinned Codex runtime Node executable from `web`.
The browser commands required elevated local execution because Vite/esbuild
must follow the shared `node_modules` junction; Playwright emitted the
non-failing `NO_COLOR`/`FORCE_COLOR` environment warning.

## Files changed

- `web/e2e/app.spec.ts`
- `web/src/App.test.tsx`
- `.superpowers/sdd/2026-08-28-recipe-result-collection-search-implementation/task-6-report.md`

## Self-review and concerns

Reviewed the diff against the Task 6 brief.  The junk fixture explicitly
covers all competing one/two-character candidates (`b`, `r`, `o`, `w`, `n`,
space, `e`, `d`, `h`, `i`, `t`, and every pair other than `wn`); no production
code or unrelated artifacts were changed.  No remaining concerns.

## Fix round 1/5 — schema-valid Brown Bed E2E fixture

Task 7 full verification found two fixture-only schema-v3 violations in the
Brown Bed browser payload: the space-only junk search line was rejected as an
empty search string, and `fixture:unavailable` was not declared in the
inventory-item graph.  Replaced that line with `" x"`, which is nonempty and
still matches the one-space candidate, and declared `fixture:unavailable` as
an inventory item without selecting it.  Brown Bed therefore remains
ineligible while the full graph validates.  Committed as
`5768bb5 test: fix Brown Bed browser fixture`.

Verification after the fix:

- `node.exe node_modules/@playwright/test/cli.js test --grep 'Brown Bed' --reporter=line`
  — 1 Chromium scenario passed.
- `node.exe node_modules/@playwright/test/cli.js test --reporter=line`
  — 3 Chromium scenarios passed.
- `node.exe node_modules/vitest/vitest.mjs run src/components/ResultPanel.test.tsx src/App.test.tsx`
  — 2 files, 15 tests passed.
- `node.exe node_modules/typescript/bin/tsc -b --pretty false`
  — exit 0, no diagnostics.
