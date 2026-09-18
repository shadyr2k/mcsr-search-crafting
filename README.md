# MCSR Search Crafting

MCSR Search Crafting is a static React application that ranks Minecraft Java Edition recipe-book searches for an explicit, infinite inventory. It ships independently generated 1.16.1 and 26.1.2 packages, and the header selector switches the item catalog, recipes, translations, language metadata, and icons together.

The workspace is English-only and organized as three responsive columns: the combined English score, saved item sets, and their calculated searches. Each item set owns an independent infinite inventory and grid size. Draft edits are isolated until **Save**; Cancel leaves the saved calculation and browser data unchanged. Rows show the best three unified single/overlap routes by default, with up to ten on expansion. Native 16×16 Minecraft item icons are imported from the pinned client; see [the exporter workflow](docs/icon-exporter.md).

Each package includes shaped and shapeless crafting-table recipes; it does not infer materials recursively, track quantities, simulate recipe unlocks, or include furnace, blasting, smoking, campfire, stonecutting, or smithing recipes. The 26.1.2 package loads all supplied language translations and source-reproduces every normal-tooltip line for its 887 crafting outputs, including modern item names, attributes, and component-provided detail.

## Prerequisites

- Python 3.11 or newer.
- Node.js 20.19+ or 22.12+ and pnpm 11.19+ (the verified bundled runtime is Node.js 24.19.0 with pnpm 11.19.0; matching requirements are recorded in `web/package.json`).
- An extracted Minecraft source tree containing `recipes/`, `tags/items/`, and `lang/en_us.json`. This local source tree is intentionally Git-ignored. Versioned sources may live below `minecraft-data/`, such as `minecraft-data/26.1.2/`.

From the repository root, create the Python environment and install both toolchains:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
pnpm --dir web install --frozen-lockfile
pnpm --dir web exec playwright install chromium
```

On macOS or Linux, create the environment and install the Python package with:

```sh
python3 -m venv .venv
./.venv/bin/python -m pip install -e ".[test]"
pnpm --dir web install --frozen-lockfile
pnpm --dir web exec playwright install chromium
```

Use `./.venv/bin/python` for the Python commands below. The Playwright browser download is a one-time setup for the end-to-end suite.

## Generate, develop, and verify

Generate the browser data from the pinned source tree:

```powershell
.\.venv\Scripts\python.exe -m mcsr_data.generate --source minecraft-data --output web/public/data
```

The production command requires `recipes/`, `tags/items/`, and `lang/en_us.json`, then enforces the registered baseline for its Minecraft version. 1.16.1 contains 634 recipes, 562 output items, 283 selectable inventory items, and 354 recipe-result collections; 26.1.2 contains 1,030 recipes, 887 output items, 508 selectable inventory items, and 541 recipe-result collections. It atomically writes mutually consistent schema-version-3 artifacts:

- `web/public/data/search-items.json`: output item names, line-bounded searchable text, provenance, and confidence.
- `web/public/data/inventory-items.json`: every concrete recipe ingredient plus approved preset-only IDs and their English names for the inventory picker.
- `web/public/data/inventory-presets.json`: the approved built-in inventories and their exact item IDs.
- `web/public/data/crafting-recipes.json`: normalized recipes, resolved ingredient alternatives, output counts, grid compatibility, exact recipe groups, recipe-book categories, and result-collection IDs.
- `web/public/data/recipe-result-collections.json`: deterministic category-plus-group collections with their exact recipe and output members.
- `web/public/data/validation-report.json`: generation counts and machine-readable diagnostics.

If validation fails, the generator prints every diagnostic and atomically writes `validation-failure-report.json` while leaving all six last-valid browser artifacts untouched. Small fixture generation is intentionally opt-in:

```powershell
.\.venv\Scripts\python.exe -m mcsr_data.generate --source path/to/fixture --output path/to/output --allow-non-baseline
```

Do not use `--allow-non-baseline` for production browser data.

The versioned 26.1.2 package is generated with the supplied launcher language assets and index, then placed under `web/public/versions/26.1.2/`:

```powershell
.\.venv\Scripts\mcsr-generate.exe --source minecraft-data/26.1.2 --output web/public/versions/26.1.2/data --minecraft-version 26.1.2 --language-asset-root <copied-assets-objects-directory> --language-asset-index <26.1.2-asset-index.json>
.\.venv\Scripts\mcsr-import-raw-icons.exe --archive <item-icon-archive.zip> --search-items web/public/versions/26.1.2/data/search-items.json --inventory-items web/public/versions/26.1.2/data/inventory-items.json --output web/public/versions/26.1.2/item-icons --minecraft-version 26.1.2
```

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

The browser tests start Vite on `127.0.0.1` and run Chromium at an explicit 1440×1000 desktop viewport. They verify independent row inventories, save-gated drafts, 2×2 selection, disabled-row aggregate exclusion, reload persistence, and the narrow stacked layout. The generated-data acceptance suite locks the confirmed `wn`, `wn `, `re`, `ngo`, `ro`, and `oe` queries, including White Wool isolation and White Bed candidate generation.

The production build is emitted to the ignored `web/dist/` directory. Its files use relative asset paths and can be hosted by an ordinary static-file server.

## Architecture

The build-time generator under `generator/src/mcsr_data/` parses extracted recipes, resolves item tags, applies English translations and source-reproduced tooltip rules where audited, constructs recipe-result collections, validates cross-references, and publishes deterministic JSON. Generator tests live in `generator/tests/`; tooltip source provenance is recorded in `generator/references/minecraft-1.16.1-tooltip-sources.md` and `generator/references/minecraft-26.1.2-tooltip-sources.md`.

The runtime application under `web/src/` has explicit module boundaries:

- `data/` fetches the five runtime payloads (search items, inventory items, inventory presets, recipes, and result collections), rejects mixed schema versions, and validates their complete cross-reference graph.
- `engine/` implements craftability, line-bounded search, shared candidate preparation, single-query ranking, overlap state search, scoring, bounded within-entry cancellation/progress, and workspace aggregation without React dependencies.
- `persistence/` validates, migrates, and recovers browser records.
- `presets/` contains committed read-only inventory presets.
- `components/` and `App.tsx` own the accessible editor, persisted working state, optimization lifecycle, and explanations.

The React application never contacts a live game or backend. Changing the explicit inventory recalculates the saved target workspace but does not replace it.

## Inventories, presets, and browser storage

Every item set has a set of exact item IDs, each available in infinite quantity. Its choices come from the concrete ingredient union in `inventory-items.json`, while target choices remain the recipe outputs in `search-items.json`. Selecting `minecraft:oak_log`, for example, does not imply planks, sticks, or any other derived item. Empty inventories are valid and produce a finite no-viable result when a goal cannot be searched.

Built-in presets are generated from `generator/src/mcsr_data/inventory_presets.json`. Each has a stable `id`, a display `name`, and exact item IDs. Loading one creates an editable working inventory; it does not mutate the preset.

The browser exposes exactly three custom inventory slots. Each stores only a name and exact item-ID list and can be saved, overwritten, loaded, or cleared. They are versioned in local storage under `mcsr.inventory-slots.v1`.

Target sets are stored separately as one auto-saved workspace under `mcsr.target-workspace.v1`. Schema-v1 rows are migrated with an empty per-row inventory; schema-v2 preserves each set's ID, targets, inventory, enabled state, grid size, and display order. Disabled sets stay visible and saved but do not contribute to optimization or the aggregate score. Enabled empty sets are likewise saved and editable but remain non-scoring until a target is added. Malformed members are isolated where possible; unrecoverable raw records are copied to `mcsr.recovery.*` keys before safe defaults are restored.

Browser storage read, quota, or permission failures do not discard the active editor state. The app keeps the latest values in memory for the current page and surfaces a warning that they may be lost after reload.

## Search and scoring

Queries are case-insensitive substrings, one through five characters long, and must occur within one searchable name or tooltip line. Printable spaces, numbers, punctuation, and symbols are eligible. Results explain the exact source line and matched span.

Search reproduces Minecraft 1.16.1 recipe-result collections rather than treating each output as an isolated search document. Recipes with the same non-empty, exact JSON `group` join only when they also share the source-audited crafting recipe-book category; recipes with a missing or empty group each remain isolated. For a query, the engine first matches every searchable output member of an eligible recipe's collection, including members whose own recipes are not craftable, and then emits only the exact outputs of eligible recipes. For example, `wn` can match Brown Bed in the `bed` collection and surface craftable White Bed without claiming that Brown Bed is craftable.

This collection lookup does not collapse item identity. Inventory entries, targets, visible outputs, and junk remain exact Minecraft item IDs: White Wool does not grant Brown Wool, White Bed and Brown Bed remain separate outputs, and ungrouped White Wool made from String does not inherit colored-wool aliases. There are no generic color, wood, or material-family records.

For a complete single query:

```text
length penalty        = max(0, query length - 2)
junk-presence penalty = 2 when any non-target output matches, otherwise 0
junk-count penalty    = 0.5 × distinct junk output count
score                 = sum of those penalties
```

Overlap results order useful queries to cover new targets. The first query uses the same length penalty; each transition charges only newly typed characters after the longest retained prefix. Backspaces are free. Junk presence and distinct junk are charged independently at every step, so the same junk item can be charged again later.

Single-query and overlap routes share one deterministic ranking. Each enabled target set contributes its lowest ranked complete score to the English aggregate; if neither method completes, it contributes a deterministic finite failure score above every possible complete result for the same target and visible-output counts. Ties prefer fewer junk appearances, fewer steps, fewer typed characters, then alphabetical query sequence.

## Validation boundary

The generator's tooltip and recipe-result collection behavior is audited against the pinned Minecraft 1.16.1 and 26.1.2 client sources, and every generated artifact must pass schema and diagnostic validation. The browser requires schema version 3 for all five runtime payloads and rejects an older, newer, or mixed-version set explicitly. Native item icons are exported from the same pinned client and verified during import; see [the exporter workflow](docs/icon-exporter.md). Automatic live-game comparison of tooltip and language strings remains future work, so confidence means source-reproduced or explicitly overridden—not live-game verified.
