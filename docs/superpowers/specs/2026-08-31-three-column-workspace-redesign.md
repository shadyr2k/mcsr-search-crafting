# MCSR Three-Column Workspace Redesign

## Status and relationship to existing designs

This design restructures the browser interface of the existing Minecraft
1.16.1 MCSR search-crafting optimizer. It also moves the working inventory
from global application state into each target-set entry.

The original MCSR optimizer design remains authoritative for Minecraft
version, recipe scope, exact infinite inventories, tooltip reproduction,
query generation, scoring, overlap costs, and maximum failure scoring. The
recipe-result collection design remains authoritative for Minecraft's grouped
search behavior and exact visible output IDs.

This document supersedes the earlier interface requirements in these areas:

- The workspace uses three persistent columns instead of separate global
  inventory, target, and result panels.
- Every item set owns a separate inventory.
- Single-query and overlap results are merged into one ranked presentation.
- Grid selection is a silent 2x2/3x3 slider instead of two radio buttons plus
  incompatibility text.
- Compact item displays use Minecraft inventory icons instead of visible item
  names.
- The selectable inventory catalog includes approved preset-only items in
  addition to normalized recipe ingredients.
- Browser icons come from the separately specified Minecraft 1.16.1 client
  exporter rather than a reimplementation of Minecraft's item renderer.

Version one remains English-only. The language column and aggregate result
contract are structured so additional languages can be added later, but this
work does not generate or expose other languages.

## Goals

- Match the approved three-column wireframe while keeping the interface
  practical for large item sets.
- Give each crafting goal the exact inventory available at that point in a
  speedrun.
- Make presets useful starting points without making them immutable working
  inventories.
- Show the best searches first, regardless of whether they use one query or an
  overlap sequence.
- Replace compact item-name lists with accurate Minecraft 1.16.1 item icons.
- Apply the supplied pink/red pastel theme and local fonts.
- Preserve the optimizer's existing accuracy, recipe-result collection search
  semantics, scoring formulas, deterministic ordering, and failure bounds.
- Migrate existing browser workspaces without inventing inventory contents.

## Non-goals

- Languages other than English.
- Inventory quantities, ingredient consumption, or recursive material
  inference.
- Changes to searchable-tooltip generation or recipe-result collection rules.
- Changes to query length, scoring weights, overlap backspace behavior, or
  maximum failure scoring.
- Reading the Minecraft client JAR in a user's browser.
- Shipping the complete Minecraft client JAR with the site.
- A backend, accounts, or cross-device workspace synchronization.

## Page layout

The desktop page has a header followed by three persistent columns:

1. **Languages** is the narrowest column. It is blank until the workspace has
   at least one enabled, nonempty saved item set. For this version it can show
   only English and its combined score.
2. **Item sets** is the workspace column. It displays one compact row for every
   saved item set, plus a control to create another set.
3. **Calculated searches** is the widest column. It displays one result row for
   each saved item-set row or, while editing, the selected row's editor.

Item-set and calculated-search rows retain the same order so their
correspondence is visually obvious. A small chevron between them reinforces
the relationship. The selected row's chevron disappears while its editor
occupies the right column.

On narrow screens the columns stack while preserving the logical order and
the same save-gated editing behavior. The implementation will use a desktop
grid with minimum usable panel widths rather than squeezing all three columns
below readability.

### Empty states

- With no saved item sets, the language and result columns show restrained
  empty states and the item-set column emphasizes Add item set.
- Empty drafts cannot be saved. A new item set does not join the
  workspace until it has at least one goal and is saved.
- Disabled item sets remain visible and editable but are visually muted and
  contribute no result or language score. Their aligned right-column rows show
  a muted Disabled state rather than a ranked-search list.

## Item-set rows and editor lifecycle

A compact middle-column row shows:

- Goal items as icon tiles.
- A 2x2 or 3x3 grid badge.
- Enabled state.
- A chevron or edit affordance.

Item names are not permanently printed in compact rows. Each icon retains an
English hover tooltip and accessible name.

Selecting a row opens its editor over the right column. The editor works on a
temporary draft copied from the saved row. While it is open:

- The existing saved result and English aggregate remain unchanged.
- The result column is covered by the editor, so no intermediate result is
  rendered.
- Save validates and commits the entire draft, closes the editor, persists the
  workspace, and recalculates that row.
- Cancel discards the draft and reveals the prior saved result unchanged.
- Another row cannot replace a dirty draft until the current draft is saved or
  cancelled.

Add item set opens a new draft over the right column. Saving adds the row to
the middle and right columns; cancelling discards it. Deleting an existing row
is available from its editor and requires confirmation. Enabled state and
keyboard-accessible move controls remain quick actions on saved rows and are
persisted immediately.

## Item-set editor

The editor contains:

1. A goal-item search and icon picker.
2. The grid-size slider.
3. A built-in or custom preset selector.
4. The editable exact inventory icon grid.
5. Save, Cancel, and, for an existing row, Delete controls.

The goal picker is sourced only from distinct normalized crafting-recipe
outputs. It may offer a goal that the draft inventory cannot currently craft;
that is necessary for meaningful maximum-score results. Ingredient-only items
do not appear as goals.

The inventory picker is sourced from the union of the exact normalized
ingredient catalog and exact item IDs referenced by the built-in presets. It
accepts English name searches and displays selected values as icons.
Selecting an item grants infinite quantity of that exact ID only. Oak Logs do
not imply Oak Planks, and White Wool does not imply another wool color.

Save is unavailable until the draft contains at least one goal and passes
schema validation. Inventory may be empty. An empty inventory is a legitimate
input: it yields no craftable outputs and therefore normally produces the
deterministic maximum-score result.

## Grid-size slider

Grid selection uses one control visually arranged as:

```text
2x2  [ slider ]  3x3
```

The control defaults to 3x3. Moving it left selects 2x2. A goal supports 2x2
when at least one normalized recipe for that exact output fits a 2x2 crafting
grid. The draft may use 2x2 only when every selected goal supports it.

If a goal requiring 3x3 is added while the slider is at 2x2, the value
silently changes to 3x3 and the slider becomes disabled in the 3x3 position.
Removing all incompatible goals re-enables the slider. No visible warning or
"cannot be crafted in a 2x2 grid" message is rendered.

The control exposes switch semantics, its selected grid size, and its disabled
state to assistive technology. Existing persisted 2x2 rows that are
incompatible with their goals are silently normalized to 3x3 during loading.

## Inventories and presets

Each saved item-set entry contains its own sorted, deduplicated list of exact
inventory item IDs. No shared working inventory remains.

Applying a preset replaces the draft inventory with a copy of the preset.
Subsequent additions and removals affect only the draft. Built-in presets are
read-only application data. The three existing custom preset slots remain
separately stored browser records; each slot stores a user name and exact item
IDs only, never goals, grid size, enabled state, or item-set order. A custom
preset can be loaded into any row or overwritten from the current draft
inventory. Saving to a custom slot requests a slot name, defaulting to its
existing name or `Custom 1`, `Custom 2`, or `Custom 3`.

The built-in presets are:

### Overworld

```text
minecraft:dirt
minecraft:oak_leaves
minecraft:oak_log
minecraft:oak_planks
minecraft:stick
minecraft:iron_nugget
minecraft:iron_ingot
minecraft:gold_nugget
minecraft:gold_ingot
minecraft:wheat
minecraft:carrot
minecraft:gravel
minecraft:flint
```

### Nether (Bastion)

```text
minecraft:dirt
minecraft:oak_planks
minecraft:stick
minecraft:cobblestone
minecraft:iron_nugget
minecraft:iron_ingot
minecraft:gold_nugget
minecraft:gold_ingot
minecraft:bucket
minecraft:obsidian
minecraft:crying_obsidian
minecraft:ender_pearl
minecraft:glowstone_dust
minecraft:glowstone
minecraft:string
minecraft:white_wool
minecraft:gravel
minecraft:soul_sand
minecraft:nether_brick
minecraft:nether_bricks
minecraft:blackstone
```

### Nether (Fortress)

```text
minecraft:dirt
minecraft:oak_planks
minecraft:stick
minecraft:cobblestone
minecraft:iron_nugget
minecraft:iron_ingot
minecraft:gold_ingot
minecraft:obsidian
minecraft:crying_obsidian
minecraft:ender_pearl
minecraft:glowstone
minecraft:string
minecraft:white_wool
minecraft:gravel
minecraft:soul_sand
minecraft:nether_brick
minecraft:nether_bricks
minecraft:blackstone
minecraft:blaze_rod
minecraft:blaze_powder
```

White Wool is intentional. Presets use the white variant of every colorable
item named by the user. Inventory identity otherwise remains exact. Minecraft
recipe-result collection matching, rather than application-defined color
families, continues to control grouped search behavior.

The preset definitions have one machine-readable source consumed by both the
data generator and the browser. The generator validates every preset ID,
resolves its English label, and adds it to the selectable inventory catalog
even when it does not satisfy a supported recipe ingredient. This is required
for `minecraft:oak_leaves` and `minecraft:bucket`, the two approved preset IDs
absent from the current ingredient-only catalog. Such an item remains visible
in the exact inventory but has no effect on craftability unless a supported
recipe accepts it. After these two additions, the pinned selectable-inventory
baseline advances from 281 to 283 items.

## Optimization data flow

The optimizer operates on one saved item set at a time:

```text
saved item-set row
  -> exact inventory + grid eligibility
  -> prepared recipe-result collection matching
  -> single-query results
  -> overlap results
  -> unified ranked-search records
  -> cached row result
  -> English aggregate
```

Saving a row cancels any obsolete optimization request for that row and starts
a new one. Unchanged rows retain their cached results. A request ID or abort
signal prevents stale work from replacing a newer result. Enabling or
disabling a saved row updates the aggregate and runs optimization only if an
enabled row lacks a current result.

The engine exposes a normalized ranked-search union for presentation. A record
identifies whether it is a single query or overlap sequence while retaining
queries, steps, covered exact targets, exact junk IDs per step, match evidence,
typed-character totals, score components, and total score.

## Unified result ranking

Complete single-query and overlap results are merged and sorted together.
The cross-category comparator is:

1. Lower total score.
2. Fewer total junk appearances across all steps.
3. Fewer search steps; a single query is one step.
4. Fewer total typed characters, defined as the full first query plus every
   later typed suffix.
5. Alphabetical query sequence.

This comparator is deterministic and does not change the underlying scoring
formula.

The collapsed result row displays the first three ranked searches separated by
commas. A single result is shown as its query, such as `wn`. An overlap result
is shown as its ordered sequence, such as `bed -> bow`.

Selecting a result row expands it in place. The top-three summary remains at
the top, followed by the complete ranks one through ten. If fewer than ten
complete results exist, all available results are shown.

When no complete result exists, the collapsed row shows `No viable search`
and the maximum failure score instead of an empty top-three list. Expanding it
may show matched and unmatched target icons, but this diagnostic never changes
the official score.

### Scoring

The existing rules are unchanged:

```text
single-step length penalty = max(0, query length - 2)
junk-presence penalty = 2 when junk exists at a step, otherwise 0
junk-count penalty = 0.5 * distinct junk output IDs at that step
```

Queries remain limited to one through five characters. For overlap paths, the
first query uses the normal length penalty, backspaces are free, later steps
charge only newly typed suffix characters, and junk is charged independently
at every step.

Each result's numerical score is an interactive badge. Hovering, focusing, or
tapping it opens a compact breakdown containing:

- Initial character penalty or transition typing cost.
- The `+2` junk-presence charge for every applicable step.
- The `+0.5` charge for each junk output at that step, accompanied by icons.
- The final total.

The popover is derived from the optimizer's score record rather than
recalculating values in the view.

### Match evidence

Expanded results replace the current explanation paragraphs with compact
evidence lines. Each line shows the relevant exact output icon and the
searchable text with the matched span highlighted. When a recipe-result
collection alias supplies the match, a matched-member icon and arrow always
distinguish the searchable member from the exact craftable output.
Tooltips and accessible labels provide both item names and the full explanation
without permanently occupying row space.

Overlap results show the evidence for each ordered step. Evidence ordering
remains deterministic and preserves the collection path needed to explain
cases such as a craftable White Bed matching `wn` through Brown Bed.

## No viable search versus calculation error

These are separate states:

- **No viable search** is a successful optimization outcome. The row receives
  the existing deterministic maximum failure score, displays that score, and
  contributes it to English's aggregate. An empty inventory normally produces
  this outcome.
- **Calculation error** means the optimizer did not produce a trustworthy
  result because of an unexpected software or data failure. The row displays
  `Calculation error` and a Retry control. The English aggregate is unavailable
  until every enabled, nonempty row has a successful complete or maximum-score
  outcome.

Partial target diagnostics may remain available in the expanded no-viable
state, but they do not lower its official score.

## Language ranking

The language column is data-driven but contains only English in this release.
English's combined score is the sum of each enabled, nonempty saved row's best
complete score or maximum failure score. Lower scores rank better. Disabled
and empty rows contribute nothing.

With no enabled, nonempty saved rows, the language list is blank rather than
showing a meaningless zero. While a row is recalculating, English shows a
pending state. A technical calculation error makes the aggregate unavailable;
a legitimate no-viable-search result does not.

## Icons and fonts

### Minecraft item icons

The browser consumes the validated output of the separate
[Minecraft 1.16.1 item-icon exporter design](2026-08-31-minecraft-item-icon-exporter-design.md).
A small Fabric client mod asks Minecraft's own
`ItemRenderer` to render native 16x16 GUI icons, including items handled by the
special built-in entity renderer such as beds, banners, chests, shields,
shulker boxes, skulls, conduits, and tridents. This avoids approximating final
icons from raw JAR textures and model JSON.

A repository-side importer validates the export against the union of
searchable recipe outputs and selectable inventory inputs, including
preset-only inputs. It then publishes:

- One transparent PNG per required exact item ID.
- A browser manifest from exact item ID to its icon asset.
- A validation report listing missing, invalid, or unexpected export records.

The website never loads the client mod, a running game, or the full client JAR.
The runtime uses a labeled fallback tile for an isolated failed image so one
broken request cannot make an item invisible. A missing required icon is still
a pre-deployment validation failure.

Icons render as crisp Minecraft-style tiles. Compact row icons, picker icons,
target icons, junk icons, and result icons all use the same manifest component.
Names remain available on hover/focus and through accessible labels.

### Typography

The user-supplied local fonts have fixed roles:

- `Coiny-Regular.ttf` for the page title and major section headings.
- `Geom-Medium.ttf` for interface text, search fields, buttons, tooltips, and
  explanatory copy.
- `Figtree-VariableFont_wght.ttf` at weight 800 for standalone rankings,
  scores, counts, and other metrics.

Numbers embedded in ordinary sentences remain Geom so typefaces do not switch
mid-line. Each `@font-face` declaration includes a suitable fallback stack and
uses local bundled assets rather than an external font service.

## Color and responsive visual system

The theme uses a warm pastel pink/red palette with semantic CSS variables for
page background, panel surfaces, selected surfaces, borders, accents, text,
muted text, highlights, errors, and focus rings. The baseline direction is:

- Very pale blush page background.
- Light pink panels and stronger pink selected rows.
- Rose borders and coral-red primary controls.
- Dark burgundy text with contrast verified against every surface.
- A soft highlight behind matched search spans.

Selected, hover, focus, disabled, pending, no-viable, and calculation-error
states must remain distinguishable without color alone. The layout avoids
heavy shadows and preserves the flat, soft appearance approved in the visual
companion.

## Persistence and migration

The target workspace schema advances from browser version 1 to version 2. A
version-2 entry contains:

```json
{
  "id": "stable-browser-generated-id",
  "targetIds": ["minecraft:stick"],
  "inventoryItemIds": ["minecraft:oak_planks"],
  "enabled": true,
  "gridSize": 2,
  "order": 0
}
```

The version-1 workspace stores goals, grid size, enabled state, and order but
does not persist the current global working inventory. Migration therefore:

1. Preserves every valid existing entry's ID, goals, grid size, enabled state,
   and order.
2. Initializes `inventoryItemIds` to an empty list for every migrated entry.
3. Silently upgrades an incompatible saved 2x2 value to 3x3 after recipe data
   loads.
4. Preserves the original version-1 record using the existing recovery
   mechanism until the version-2 write succeeds.

The migration must not guess a preset or claim to copy the previous global
working inventory because that inventory was never persisted. The user can
apply a built-in or custom preset after migration. Until then, the empty
inventory produces a normal maximum-score outcome.

The three custom inventory slots retain their existing schema and storage key.
Malformed records continue to be isolated and preserved for recovery. Storage
unavailability leaves the current page usable in memory and warns that changes
may be lost on reload.

## Component boundaries

The React application is divided into focused units:

- **App shell and data loader** load validated crafting data, the icon
  manifest, fonts, persisted workspace, and custom presets.
- **Language ranking** renders aggregate language results without knowing
  optimizer internals.
- **Item-set workspace** renders ordered rows and immediate row actions.
- **Item-set editor** owns a draft and emits only Save, Cancel, Delete, and
  custom-preset operations.
- **Inventory and goal pickers** search named records and render shared icon
  tiles.
- **Grid switch** derives availability from goal recipe compatibility.
- **Row optimization coordinator** caches and cancels work by stable row ID.
- **Unified result adapter** merges single and overlap engine output and applies
  the cross-category comparator.
- **Calculated-search row** owns collapsed/expanded presentation.
- **Score breakdown popover** presents score data supplied by the engine.
- **Match evidence** renders direct and collection-alias highlighted spans.
- **Persistence layer** validates and migrates versioned workspace records.

Optimizer, ranking, craftability, persistence validation, and icon-manifest
logic remain framework-independent wherever practical.

## Error handling

- Invalid generated crafting schemas continue to block optimization with an
  actionable application-level error.
- A calculation error is scoped to its item-set row and exposes Retry without
  being converted into a maximum score.
- Obsolete calculation work is cancelled and cannot publish stale output.
- A broken runtime image displays the labeled icon fallback.
- Missing required icon import fails the asset validation step before
  deployment.
- Invalid drafts cannot be saved and keep their fields available for
  correction.
- Invalid browser records use the existing recovery-copy behavior rather than
  silently discarding raw data.

## Accessibility

- Every icon-only control has an accessible English name.
- Item names and score breakdowns are reachable by keyboard focus, not hover
  alone.
- Score breakdowns are also available by click/tap on touch devices.
- The grid slider exposes switch state and its disabled condition.
- Focus order follows language, item sets, and calculated searches, then the
  opened editor when present.
- Expanded result rows use buttons and appropriate expanded-state attributes.
- Match highlights retain readable contrast and expose the complete source
  line to assistive technology.
- Reordering is possible without drag-and-drop.
- Loading, no-viable, disabled, and error states are not communicated by color
  alone.

## Testing

### Exporter and icon-import tests

- The separate Fabric exporter records Minecraft 1.16.1, vanilla resources,
  native 16x16 dimensions, exact registry IDs, PNG hashes, and export errors.
- Representative flat, block, tinted, and built-in-entity items are manually
  verified against the same running client that produced the export.
- Every searchable output and selectable inventory input resolves to one
  imported browser-manifest entry.
- Importing the same export twice produces identical browser assets and
  manifest bytes.
- Missing, corrupt, wrong-sized, nontransparent, wrong-version, or
  non-vanilla exports fail with exact diagnostics.
- The production website contains neither the exporter mod nor the client JAR.

### Engine and ranking tests

- Each item set is optimized with its own exact inventory.
- Empty inventories yield successful maximum-score outcomes, not calculation
  errors.
- Single and overlap results merge into one deterministic order.
- Cross-category ties follow junk appearances, step count, typed characters,
  and alphabetical sequence.
- Existing length, junk, transition, and maximum-failure formulas are
  unchanged.
- Recipe-result collection aliases and exact visible output/junk IDs remain
  unchanged.
- Per-row cancellation prevents stale publication while preserving unchanged
  cached rows.

### Persistence tests

- Version-1 entries migrate with empty inventories and all other fields
  preserved.
- Incompatible migrated 2x2 values normalize silently to 3x3.
- Version-2 per-row inventories round-trip independently.
- Custom slots remain compatible and separate from the workspace.
- Invalid records preserve recoverable raw data.
- Unavailable and quota-limited storage remains usable in memory with a
  warning.

### Component tests

- Add, Save, Cancel, Delete, enable/disable, and reorder behavior.
- Draft edits never change saved results before Save.
- Applying a preset copies rather than links its inventory.
- The three built-in presets contain the exact approved item IDs.
- Every built-in preset ID resolves through the selectable inventory catalog;
  `minecraft:oak_leaves` and `minecraft:bucket` remain selectable even when
  they do not affect a supported recipe.
- The grid slider defaults to 3x3, moves to 2x2 when compatible, silently
  returns to and locks at 3x3 when required, and never renders the old warning.
- Compact rows use icons with hover and accessible names.
- Collapsed results show the top three total and expanded results show up to
  ten total.
- Score badges expose exact per-step junk calculations on hover, focus, and
  tap.
- Match evidence highlights direct and recipe-result collection alias spans.
- No-viable and calculation-error states remain distinct.

### End-to-end and visual tests

- Create two item sets with different inventories, grid sizes, and goals;
  verify their independent results and English aggregate.
- Save and reload the browser; verify row order, inventories, enabled states,
  grids, and custom presets.
- Disable and re-enable a row; verify aggregate inclusion.
- Exercise a 2x2-compatible goal and a 3x3-only goal through the slider.
- Verify representative direct searches and collection searches, including
  `wn`, `wn `, `re`, `ngo`, `ro`, and `oe`.
- Verify the three-column desktop layout, selected-row editor replacement,
  expanded top-ten result, and narrow-screen stacking.
- Run the complete existing Python, TypeScript, build, and Playwright suites.

## Considered alternatives

### Patch the existing global panels

Rejected because per-row inventories, draft editing, result caching, and
aggregate language scoring would remain coupled in the top-level component.

### Full external state store and runtime model renderer

Rejected for the English-only version. It adds runtime weight and operational
complexity without improving the approved interaction. Static generated icons
and focused React state boundaries are sufficient.

### Raw texture extraction without model rendering

Rejected because block items, layered items, and tinted items would not match
their Minecraft inventory appearance.

### Reimplement the JAR model renderer at build time

Rejected after inspecting the supplied client JAR. Several required item-model
families use `builtin/entity`, so source textures and JSON alone do not encode
the final GUI pixels. Calling Minecraft's own renderer is smaller and more
accurate than reproducing baked models, tinting, lighting, and special block
entity item renderers.

### Assign a preset during version-1 migration

Rejected because the old working inventory was not persisted and no single
preset is correct for every point in a run. Empty inventories are explicit,
safe, and produce the expected maximum-score result until edited.
