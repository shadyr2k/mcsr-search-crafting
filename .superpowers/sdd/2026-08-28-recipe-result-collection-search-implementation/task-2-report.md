# Task 2 Report: Publish and validate schema-version-3 collection graph

## Implementation summary

- Raised the browser-data schema version from 2 to 3.
- Integrated the packaged recipe-book category table and result-collection assignment after ingredient resolution and before item construction/validation. Tests can inject a category mapping through `generate()` without weakening production validation.
- Added collection-count baselines (281 inventory items and 354 result collections), summary/report fields, and CLI output.
- Published `recipe-result-collections.json` with schema, Minecraft version, language, and deterministic collection entries. Enriched recipe payloads now include recipe group, category, and collection ID.
- Extended cross-reference validation for missing and mismatched recipe/category/collection/output references, duplicate or empty collections, inconsistent collection members, and zero/multiple recipe membership.
- Preserved all five last-valid published data artifacts during failed generation; only `validation-failure-report.json` may be written on failure.
- Regenerated the pinned browser artifacts.

## Files changed

- `generator/src/mcsr_data/generate.py`
- `generator/tests/test_generate.py`
- `web/public/data/search-items.json`
- `web/public/data/inventory-items.json`
- `web/public/data/crafting-recipes.json`
- `web/public/data/recipe-result-collections.json` (new)
- `web/public/data/validation-report.json`

## RED/GREEN TDD evidence

1. Updated the schema-v3 fixture test first (including an injected fixture category map and collection assertions), then ran:

   ```powershell
   .\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py -v
   ```

   RED result: 5 failed, 2 passed. The expected missing `recipe_book_categories` parameter, schema-v3 fields, collection count, and expanded baseline checks caused the failures.

2. Implemented the minimal generation, serialization, baseline, and atomic-publish changes. Then ran:

   ```powershell
   .\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py generator/tests/test_recipe_collections.py -v
   ```

   GREEN result: 24 passed.

3. Added a second invalid-collection-graph regression test for the explicit recipe-to-collection-ID cross-reference. It failed first with only `result_collection_reference_mismatch` absent, then passed after the validation was added. The focused suite subsequently reported 25 passed.

## Generation and determinism

Ran the production generator twice:

```powershell
.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data
```

Both runs printed:

```text
Generated 634 recipes, 562 output items, 281 inventory items, and 354 result collections with 0 validation errors.
```

First-run artifact snapshots, compared byte-for-byte by SHA-256 plus size after the second run:

| Artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| `search-items.json` | `4662BB93DD791806AC72C86445B6299A5B7F97EB4E0F6CB923B20AF12980CFD8` | 105687 |
| `inventory-items.json` | `66F90FE6E8A30D20DB578A8E81B6D55285438C4B6A78E4BC62FD776EC5075F7F` | 13724 |
| `crafting-recipes.json` | `D283019752C64773EEBE14D2CB6412B5BB966528F679C4AA82C98B9C9650886B` | 386762 |
| `recipe-result-collections.json` | `B145C66A36ACB03B5940AE5D996C886D4BACFE1A907EDB407CB59A0EC16CB6E2` | 90422 |
| `validation-report.json` | `A93E5D9E37EE2810650C3FF4E10999133A1FAA9A66DE7AFA1383C184399BCB94` | 183 |

Second-run comparison result: all five artifacts matched the first-run SHA-256 and byte lengths. No `git diff --exit-code` determinism check was used while the intentional generated-data changes were uncommitted.

## Exact test results

- `python -m pytest generator/tests/test_generate.py generator/tests/test_recipe_collections.py -v`: 25 passed.
- `python -m pytest generator/tests -v`: 94 passed.
- Production generation: exit 0, 634 recipes, 562 output items, 281 inventory items, 354 collections, 0 validation errors.

## Self-review

- Reviewed the final implementation diff and generated artifact shape.
- Confirmed `git diff --check` had no whitespace errors.
- Confirmed the generated collection graph has schema version 3, Minecraft version `1.16.1`, language `en_us`, 634 recipes, 354 collections, and a valid report count.
- Found and addressed one issue during review: collection membership alone did not prove that a recipe's `result_collection_id` matched the collection that referenced it. Added a RED/GREEN regression test and the explicit mismatch diagnostic.

## Concerns

None known. The required report file is intentionally not part of the Task 2 implementation commit.

## Fix round 1: malformed collection ordering and rollback publication

### Findings addressed

1. Collection `recipe_ids` and `output_item_ids` now require sorted, unique tuples before serialization. Invalid graphs report `invalid_collection_recipe_ids` or `invalid_collection_output_item_ids` with an actionable message.
2. Successful-artifact publication now preserves each existing destination as a same-directory backup before replacements begin. If any replacement fails, backups replace their destinations again and artifacts that had no prior destination are removed. This restores the complete last-valid artifact set after an intermediate replacement failure.

### RED/GREEN evidence

Added two regression tests to `generator/tests/test_generate.py`:

- `test_collection_members_must_be_sorted_and_unique`
- `test_atomic_publish_restores_all_artifacts_after_an_intermediate_replacement_fails`

RED command:

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py::test_collection_members_must_be_sorted_and_unique generator/tests/test_generate.py::test_atomic_publish_restores_all_artifacts_after_an_intermediate_replacement_fails -v
```

Exact result: `2 failed in 0.18s`. The first test reported an empty diagnostic set; the second showed `search-items.json` and `inventory-items.json` had advanced to the new payload after the injected `crafting-recipes.json` replacement failure.

After implementation, reran the same command.

Exact result: `2 passed in 0.11s`.

### Covering gates

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py -v
```

Exact result: `10 passed in 0.54s`.

```powershell
.\.venv\Scripts\python.exe -m pytest generator/tests/test_generate.py generator/tests/test_recipe_collections.py -v
```

Exact result: `27 passed in 0.64s`.
