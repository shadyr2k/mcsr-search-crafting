# MCSR Search Crafting

MCSR Search Crafting is a static React application that ranks Minecraft Java Edition 1.16.1 recipe-book searches for an explicit, infinite inventory. It loads deterministic JSON produced by the repository's Python generator, determines which crafting outputs are visible in a selected 2x2 or 3x3 grid, and compares complete single-query and overlapping-query routes for each enabled target set.

Version 1 is intentionally English-only (`en_us`) and Minecraft 1.16.1-only. It includes shaped and shapeless crafting-table recipes; it does not infer materials recursively, track quantities, simulate recipe unlocks, or include furnace, blasting, smoking, campfire, stonecutting, or smithing recipes.

## Prerequisites

- Python 3.11 or newer.
- Node.js 24.19.0 and pnpm 11.19.0 (the versions used by this repository's Codex bundled runtime).
- An extracted Minecraft 1.16.1 source tree at `minecraft-data/` containing `recipes/`, `tags/items/`, and `lang/en_us.json`. This local source tree is intentionally Git-ignored.

From the repository root, create the Python environment and install both toolchains:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
pnpm --dir web install --frozen-lockfile
pnpm --dir web exec playwright install chromium
```

On macOS or Linux, replace `.\.venv\Scripts\python.exe` with `./.venv/bin/python`. The Playwright browser download is a one-time setup for the end-to-end suite.

## Generate, develop, and verify

Generate the browser data from the pinned source tree:

```powershell
.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data
```

A successful run reports the recipe and output-item counts and `0 validation errors`. It atomically writes:

- `web/public/data/search-items.json`: output item names, line-bounded searchable text, provenance, and confidence.
- `web/public/data/crafting-recipes.json`: normalized recipes, resolved ingredient alternatives, output counts, and grid compatibility.
- `web/public/data/validation-report.json`: generation counts and machine-readable diagnostics.

Run the development server:

```powershell
pnpm --dir web run dev --host 127.0.0.1
```

Then open `http://127.0.0.1:5173`. Python is not required to serve or deploy already generated data.

Run the complete verification workflow from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -v
.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data
pnpm --dir web test --run
pnpm --dir web run typecheck
pnpm --dir web run build
pnpm --dir web run e2e
```

The browser test starts Vite on `127.0.0.1`, runs Chromium at a desktop viewport, and uses accessible roles and labels to exercise real generated data. It selects an explicit inventory, creates and configures a target set, verifies ranked single-query and overlap results, disables the set, and verifies that the aggregate excludes it.

The production build is emitted to the ignored `web/dist/` directory. Its files use relative asset paths and can be hosted by an ordinary static-file server.

## Architecture

The build-time generator under `generator/src/mcsr_data/` parses the extracted 1.16.1 recipes, resolves item tags, applies English translations and source-reproduced tooltip rules, validates cross-references, and publishes deterministic JSON. Generator tests live in `generator/tests/`; tooltip-source provenance is recorded in `generator/references/minecraft-1.16.1-tooltip-sources.md`.

The runtime application under `web/src/` has explicit module boundaries:

- `data/` validates and loads the generated schemas.
- `engine/` implements craftability, line-bounded search, candidate generation, single-query ranking, overlap state search, scoring, cancellation, and workspace aggregation without React dependencies.
- `persistence/` validates, migrates, and recovers browser records.
- `presets/` contains committed read-only inventory presets.
- `components/` and `App.tsx` own the accessible editor, persisted working state, optimization lifecycle, and explanations.

The React application never contacts a live game or backend. Changing the explicit inventory recalculates the saved target workspace but does not replace it.

## Inventories, presets, and browser storage

The inventory is a set of exact item IDs, each available in infinite quantity. Selecting `minecraft:oak_log`, for example, does not imply planks, sticks, or any other derived item.

Edit `web/src/presets/builtInPresets.ts` to add committed built-in presets. Each preset has a stable `id`, a display `name`, and exact `itemIds`. Loading a built-in preset creates an editable working inventory; it does not mutate the preset.

The browser exposes exactly three custom inventory slots. Each stores only a name and exact item-ID list and can be saved, overwritten, loaded, or cleared. They are versioned in local storage under `mcsr.inventory-slots.v1`.

Target sets are stored separately as one auto-saved workspace under `mcsr.target-workspace.v1`. That record preserves every set's ID, targets, enabled state, grid size, and display order. Disabled sets stay visible and saved but do not contribute to optimization or the aggregate score. Malformed members are isolated where possible; unrecoverable raw records are copied to `mcsr.recovery.*` keys before safe defaults are restored.

## Search and scoring

Queries are case-insensitive substrings, one through five characters long, and must occur within one searchable name or tooltip line. Printable spaces, numbers, punctuation, and symbols are eligible. Results explain the exact source line and matched span.

For a complete single query:

```text
length penalty        = max(0, query length - 2)
junk-presence penalty = 2 when any non-target output matches, otherwise 0
junk-count penalty    = 0.5 × distinct junk output count
score                 = sum of those penalties
```

Overlap results order useful queries to cover new targets. The first query uses the same length penalty; each transition charges only newly typed characters after the longest retained prefix. Backspaces are free. Junk presence and distinct junk are charged independently at every step, so the same junk item can be charged again later.

Single-query and overlap rankings remain separate. Each enabled target set contributes its lower complete score to the aggregate; if neither method completes, it contributes a deterministic finite failure score above every possible complete result for the same target and visible-output counts. Ties prefer fewer junk appearances, fewer steps, fewer typed characters, then alphabetical query sequence.

## Validation boundary

The generator's tooltip behavior is audited against Minecraft 1.16.1 client sources, and every generated artifact must pass schema and diagnostic validation. However, automatic comparison with a running game is deferred: a future Fabric 1.16.1 client exporter will enumerate the same recipe outputs, call the game's tooltip implementation in English, and diff that export against `search-items.json`. Until that separate validator exists and runs, confidence means source-reproduced or explicitly overridden—not live-game verified.
