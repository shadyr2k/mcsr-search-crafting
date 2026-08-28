# MCSR Search-Crafting Optimizer Design

## Purpose

Build an English-first Minecraft 1.16.1 search-crafting optimizer for MCSR. The application will reproduce the effective searchable text of crafting-book outputs, filter those outputs using an explicitly selected infinite inventory, and rank both single-query and overlapping-query crafts for user-defined target item sets.

Version 1 is a static browser application backed by generated JSON. It will not require a server, accounts, or a live Minecraft instance. A future Minecraft client exporter can validate the generated tooltip data against the game without changing the application data model.

## Scope

Version 1 includes:

- Minecraft 1.16.1 only.
- English (`en_us`) only.
- `minecraft:crafting_shaped` and `minecraft:crafting_shapeless` recipes only.
- Every distinct output item from those recipes, including unwanted outputs that may appear as junk.
- Explicit, infinite-quantity inventory selections.
- Per-target-set 2x2 or 3x3 grid selection.
- Single-query and craft-overlap optimization.
- Queries from one through five characters, including letters, numbers, spaces, and symbols.
- Built-in inventory presets and three browser-stored custom inventory slots.
- One separately persisted workspace of target item sets.

Version 1 excludes:

- Furnace, blasting, smoking, campfire, stonecutting, and smithing recipes.
- Recipe-unlock simulation. All included crafting recipes are considered unlocked.
- Inventory quantities or ingredient consumption.
- Recursive availability. Selecting a log does not imply access to planks or sticks.
- Languages other than English.
- A live backend or external database.
- Automatic verification against a running Minecraft client.

## Source Data

The local extracted source-data layout is:

```text
minecraft-data/
├── recipes/
├── tags/
│   └── items/
└── lang/
    └── en_us.json
```

The recipe folder currently contains 859 JSON files, of which 491 are shaped and 143 are shapeless. The item-tag folder contains 54 JSON files. The English language file contains 4,754 translation entries.

## Architecture

The system has two build-time and runtime layers:

```text
Minecraft 1.16.1 source data
├── recipes
├── item tags
├── English translations
└── reproduced tooltip rules
             |
             v
Python data generator
├── search-items.json
├── inventory-items.json
├── crafting-recipes.json
└── validation report
             |
             v
React + TypeScript static application
├── inventory and preset state
├── craftability engine
├── search index
├── single-query optimizer
├── overlap optimizer
└── scoring and explanations
```

Vite will build the React application to ordinary static files. Python is required only when regenerating Minecraft data, not when using the application.

## Generated Data

The browser-data contract uses `schema_version: 2`. Searchable target/output records and selectable inventory-input records are deliberately separate so ingredient-only items never become target choices.

### Searchable items

`search-items.json` contains one record per distinct recipe output item. Search text remains separated into lines so the optimizer can explain matches and avoid incorrectly matching across tooltip line boundaries.

Example:

```json
{
  "minecraft:iron_sword": {
    "name": "Iron Sword",
    "search_lines": [
      { "source": "name", "text": "Iron Sword" },
      { "source": "attribute_header", "text": "When in main hand:" },
      { "source": "attribute", "text": "+5 Attack Damage" },
      { "source": "attribute", "text": "-2.4 Attack Speed" }
    ],
    "generation_method": "derived_attribute_logic",
    "confidence": "source_reproduced"
  }
}
```

Formatting codes and non-searchable control characters are removed. Matching is case-insensitive, but the original display text is preserved. A query must occur within one searchable line; separate lines are not concatenated for matching.

The initial confidence values distinguish source-reproduced data from explicit overrides. A future in-game exporter may promote validated entries to `game_verified`.

### Crafting recipes

`crafting-recipes.json` contains normalized shaped and shapeless recipes. Each record contains:

- Recipe ID.
- Output item ID and output count.
- Ingredient slots and all accepted item alternatives after tag resolution.
- Normalized shaped-pattern width and height, or shapeless ingredient-slot count.
- Whether the recipe fits 2x2 and 3x3 grids.

Recipe data is separate from searchable item data because multiple recipes can produce the same output. Search text belongs to an output item; ingredient requirements and grid compatibility belong to recipes.

### Inventory items

`inventory-items.json` contains the sorted union of every concrete item ID accepted by any normalized recipe ingredient slot, paired with its exact English name. The inventory picker uses this catalog, including ingredient-only items such as `minecraft:oak_log` and `minecraft:cobblestone`. The target picker continues to use `search-items.json`, which contains recipe outputs only.

## Tooltip Reproduction

The generator will reproduce the Minecraft 1.16.1 recipe-book tooltip path rather than approximate visible player tooltips:

```text
recipe output ItemStack
-> translated item name and item-specific tooltip lines
-> attribute modifier section
-> null player context
-> normal tooltip mode
-> formatting removal
-> case-insensitive search normalization
```

The implementation must cover translated names, item-specific additions, default output NBT, equipment-slot attribute modifiers, exact signs and number formatting, translated attribute labels, and null-player behavior. Ordinary items generally contribute only their names; tools, weapons, armor, and specialized items require explicit logic.

The generator may use a small, clearly identified override table for cases that cannot be cleanly derived. It must report every override and every unsupported or unresolved item. It must not silently omit searchable lines.

A future Fabric 1.16.1 client-side exporter will enumerate the same recipe outputs, call the game's tooltip implementation, and write a comparable language-specific JSON file. Automated diffing against that export will serve as the final oracle for accuracy and later multilingual work.

## Inventory and Craftability

The active inventory is a set of explicit item IDs. Every selected item has infinite quantity.

A recipe is craftable when every ingredient slot accepts at least one selected item. Repeated ingredient slots and output quantities do not consume inventory because supply is infinite. An ingredient tag is satisfied when at least one explicitly selected item is a member of the resolved tag.

There is no recursive inference. Selecting `minecraft:oak_log` does not select or imply `minecraft:oak_planks`, `minecraft:stick`, or any other derived item.

The inventory editor offers every concrete ID present in the generated ingredient catalog; it is not limited to items that are themselves crafting outputs.

A distinct output is visible if at least one of its recipes is craftable and fits the entry's selected grid.

Grid rules are inclusive:

- In 2x2 mode, shaped recipes require width and height at most two, and shapeless recipes require at most four ingredient slots.
- In 3x3 mode, all valid 2x2 recipes remain included; shaped recipes require width and height at most three, and shapeless recipes require at most nine ingredient slots.

## Target Item Sets

Each optimization entry contains:

```json
{
  "id": "stable-browser-generated-id",
  "enabled": true,
  "targets": ["minecraft:stick", "minecraft:crafting_table"],
  "grid_size": 2
}
```

The grid defaults to 3x3. The user may select 2x2 only when every target has at least one 2x2-compatible recipe. When 2x2 is unavailable, the interface explains which targets require 3x3.

Each entry is optimized independently. Disabled entries remain saved and visible but are excluded from optimization and aggregate scores.

Enabled entries with no targets are also preserved as editor state but are excluded from optimization and aggregate scores until at least one target is added.

## Search Semantics

For a query `q`:

```text
matches(q) = distinct visible output items with at least one searchable line containing q
```

Matching is case-insensitive. Every printable character present in searchable text is eligible, including spaces, digits, `+`, `-`, punctuation, and language-specific characters. Queries are limited to lengths one through five.

Candidates are generated from unique substrings of individual target search lines rather than by brute-forcing an alphabet. A candidate is then tested against every visible output. This is complete because a valid query must occur in each target it is intended to cover.

For a target set `T`:

```text
valid_single(q) = T is a subset of matches(q)
junk(q) = matches(q) minus T
```

Junk is counted by distinct output item ID actually shown in the grid, not by recipe count. Target items are never junk.

## Single-Query Scoring

For a complete single-query craft:

```text
length penalty = max(0, query length - 2)
junk-presence penalty = 2 if junk exists, otherwise 0
junk-count penalty = 0.5 * number of distinct junk items

score = length penalty + junk-presence penalty + junk-count penalty
```

One- and two-character queries therefore have equal length weight. Each additional character through the five-character maximum adds one point.

## Craft-Overlap Optimization

Overlap results are an ordered sequence of queries whose combined target coverage contains the entire target set. Every step must cover at least one target not covered by earlier steps. Therefore, a useful sequence has at most one step per target.

The optimizer may reorder steps to minimize directional edit cost. Backspaces have zero scoring cost because they can be overlapped with mouse movement. Only newly typed characters count.

For consecutive queries `a` and `b`:

```text
retained = longest common prefix of a and b
transition typing cost = length(b) - length(retained)
```

For example, `bed -> bow` retains `b`, backspaces `ed`, and types `ow`, so its transition cost is two.

An overlap sequence score consists of:

- The first query's normal length penalty.
- Newly typed characters for each transition.
- The junk-presence and junk-count penalties calculated independently for every step.

The same junk item is penalized again if it appears at multiple steps. The interface also reports the combined unique junk list for context.

The overlap optimizer uses a state graph keyed by covered-target bitmask and most recent query. Transitions add a query that covers at least one new target. This finds the cheapest ordering without enumerating irrelevant repeated steps.

## Failure Scoring and Language Comparison

Complete single-query results, complete overlap results, and incomplete attempts are separate result categories. A failure can never outrank a complete craft.

For cross-language comparison, an incomplete entry receives a deterministic finite penalty greater than every possible complete result for that entry. Let:

- `T` be the number of target items.
- `N` be the number of distinct visible craftable outputs.

The upper bound is:

```text
maximum valid score =
  3
  + 5 * (T - 1)
  + T * (2 + 0.5 * max(0, N - T))

incomplete score = maximum valid score + 5
```

The terms represent the maximum initial length penalty, maximum replacement typing across useful overlap steps, and maximum per-step junk penalty. The clamp handles configurations in which one or more targets are not visible and `T` can exceed `N`. Because the same entry and inventory have the same `T` and `N` in each language, the failure value is comparable across languages.

Incomplete diagnostics record which targets were matched and which remain unmatched, but partial coverage does not reduce the official failure score.

## Ranking and Results

Single-query and overlap crafts are shown in separate categories. If no single query succeeds, the interface explicitly promotes overlap as the viable category. If neither category succeeds, it shows incomplete diagnostics and the maximum failure score.

Within equal numerical scores, results use stable tie-breakers:

1. Fewer total junk appearances.
2. Fewer search steps.
3. Fewer newly typed characters.
4. Alphabetical query sequence.

Every displayed result includes:

- Query or ordered query sequence.
- Total score and component breakdown.
- Targets matched at each step.
- Distinct junk items at each step.
- The exact searchable line and matched span explaining every match.
- For overlap results, retained prefixes, free backspaces, and newly typed suffixes.

The workspace aggregate score sums the best applicable score for every enabled item set. Single-query and overlap category results remain visible separately even when one supplies the lower aggregate score.

## Presets and Browser Persistence

Built-in inventory presets are supplied by the user and committed as read-only application data. They contain only a preset ID, name, and available-item list.

The browser provides exactly three custom inventory slots. Each stores only a user-defined name and available-item list. A slot can be loaded, overwritten, or cleared. Loading any preset creates an editable working copy; it does not mutate the saved preset until the user explicitly overwrites a custom slot.

The complete list of target item sets is stored separately as one auto-saved browser workspace. It includes target IDs, per-entry grid size, enabled state, and display order. Changing inventory presets recalculates the existing item sets without replacing them.

Persisted records include a schema version. Invalid or outdated data is migrated when a supported migration exists. Otherwise, the application preserves the raw value for recovery, returns to safe defaults, and explains the problem rather than silently discarding state.

## Application Components

The browser code is divided into modules with explicit boundaries:

- Data loader and schema validator.
- Search index and match-explanation engine.
- Recipe/tag craftability engine.
- Inventory preset store.
- Target-set workspace store.
- Candidate query generator.
- Single-query optimizer.
- Overlap state-search optimizer.
- Scoring and deterministic ranking.
- React views and reusable controls.

Optimization logic remains framework-independent TypeScript so it can be tested without rendering React components.

## Error Handling

The generator fails with actionable diagnostics for malformed JSON, unresolved tags, missing translations, unsupported recipe structures, invalid patterns, or unexplained tooltip cases. A machine-readable validation report accompanies human-readable errors.

The production generator command requires the pinned Minecraft 1.16.1 source layout and validates the authoritative baseline of 634 crafting recipes and 562 distinct outputs. Fixture generation requires an explicit non-baseline option. A failed run retains its complete `ValidationReport`, prints every diagnostic, and atomically writes `validation-failure-report.json` without replacing the last valid browser artifacts.

The browser validates generated schemas before optimization. If data is invalid or incomplete, it blocks misleading results and identifies the affected file or record. Individual malformed browser presets or workspace entries are isolated so one bad record does not break the entire application.

Computationally expensive optimization is cancellable when inputs change. The UI shows calculation progress for large target sets and prevents stale results from replacing newer ones.

Candidate matching is shared by the single-query and overlap optimizers. Matching and overlap state expansion run in bounded chunks with abort checks, progress updates, and event-loop yields inside each entry.

## Testing

Python generator tests cover:

- Parsing all supplied shaped and shapeless recipes.
- Trimming shaped patterns and calculating dimensions.
- Resolving direct, alternative, nested, and invalid tags.
- Translation lookup for item and block-backed output IDs.
- Attribute and tooltip formatting rules.
- Validation failures and override reporting.
- Stable, deterministic generated output.
- Version-2 ingredient catalogs, pinned baseline enforcement, and non-destructive failure reports.

TypeScript engine tests cover:

- 2x2 and 3x3 compatibility.
- Explicit infinite inventory behavior.
- No recursive material inference.
- Multiple recipes producing one distinct output.
- Case-insensitive line-bounded substring matching.
- Printable symbols and the five-character maximum.
- Distinct-output junk counting.
- Junk counted independently at each overlap step.
- `bed -> bow` replacement cost of two.
- Directional overlap ordering.
- Complete-result and maximum-failure ranking guarantees.
- Deterministic tie-breakers.
- Browser schema migration and recovery.
- Empty enabled-set exclusion and cancellation during one large entry.

Known-behavior regression fixtures include swords matching `4` through `-2.4 Attack Speed` and symbolic tool searches such as `+8` when supported by the reproduced 1.16.1 tooltip data.

React tests cover creating and disabling target sets, grid eligibility feedback, loading built-in and custom inventories, all three custom preset operations, persistence, scoring explanations, and error presentation.

Browser persistence tests also cover unavailable or quota-limited local storage: state remains usable in memory and the interface warns that it may be lost on reload.

## Delivery Sequence

Implementation should proceed in independently verifiable stages:

1. Python recipe/tag/language parsing and normalized recipe generation.
2. Reproduced English searchable-tooltip generation with validation reports.
3. Framework-independent TypeScript craftability, matching, and scoring engine.
4. Single-query optimization.
5. Overlap optimization.
6. React inventory, target-set, result, and persistence interface.
7. User-supplied built-in presets.
8. Static build and end-to-end verification.
9. Later, a separate Fabric 1.16.1 exporter and cross-language support.
