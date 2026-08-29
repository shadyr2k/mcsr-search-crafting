# Recipe-Result Collection Search Design

## Status and relationship to the original design

This design revises the search semantics of the existing Minecraft 1.16.1
MCSR search-crafting optimizer. The original design remains authoritative for
inventory, craftability, target sets, scoring, overlap, persistence, and the
English-only crafting-book scope. This document supersedes its per-output
search model.

The central correction is that Minecraft searches recipe-result collections,
not isolated output items. Output and inventory item IDs remain exact; color,
wood, and other variants are not collapsed into generic application records.

## Confirmed behavior

The following English Minecraft 1.16.1 observations are acceptance fixtures:

- `wn` returns craftable White Bed, Respawn Anchor, White Carpet, and White
  Banner for the supplied inventory.
- `wn `, including the trailing space, returns the same four outputs.
- `re` returns those outputs plus other craftable outputs whose own searchable
  lines contain `re`.
- White Wool does not appear merely because String makes its ungrouped recipe
  craftable.
- `ngo` finds Iron Ingot and Gold Ingot through their own names.
- `ro` finds applicable Iron outputs through their own names.
- `oe` finds applicable Hoes through their own names.

The grouped results are explained by member aliases such as Brown Bed, Brown
Carpet, Brown Banner, Red Bed, and Green Bed. Respawn Anchor matches `wn ` and
`re` directly.

## Source-accurate collection rule

The generator will reproduce the pinned 1.16.1 `ClientRecipeBook` collection
construction and `SearchManager.RECIPE_OUTPUT` indexing path from the same
official-client/Yarn audit used for tooltip reproduction.

A crafting recipe belongs to exactly one recipe-result collection:

- A recipe with a non-empty JSON `group` joins recipes with the same
  source-reproduced crafting recipe-book category and identical group string.
- A recipe with no group or an empty group gets its own collection.
- Only the already-supported shaped and shapeless crafting recipes participate.
- All included recipes remain treated as unlocked, matching the existing
  version-one simplification.

Recipe-book category is part of the key. Reusing a group string in another
category must not merge the collections. Category classification must be
derived from the pinned 1.16.1 client behavior or an exhaustive audited table;
it must not be inferred from English names.

Examples from the supplied recipes:

- White Bed and Brown Bed share `bed`.
- White Carpet and Brown Carpet share `carpet`.
- White Banner and Brown Banner share `banner`.
- Respawn Anchor is ungrouped and therefore isolated.
- White Wool from String is ungrouped and does not join the colored `wool`
  collection.

## Exact-item boundary

Inventory choices remain exact item IDs with infinite quantities. Selecting
White Wool does not grant Brown Wool, and selecting Oak Logs still does not
grant Oak Planks.

Targets, visible outputs, and junk also remain exact output item IDs. White Bed
and Red Bed are separate targets and separate visible outputs. If both are
craftable and a matching collection exposes both, both count as distinct
outputs. This intentionally avoids a second layer of application-defined color
or material families.

The only grouping behavior reproduced here is Minecraft's recipe-result
collection search behavior.

## Generated schema version 3

The generated browser contract advances from schema version 2 to schema
version 3.

Each normalized recipe gains:

- `recipe_group`: the exact JSON group string or `null`.
- `recipe_book_category`: the source-reproduced crafting category.
- `result_collection_id`: a deterministic identifier.

A new `recipe-result-collections.json` artifact contains:

- Schema version and Minecraft/language provenance.
- Collection ID.
- Recipe-book category.
- Exact group string or `null`.
- Sorted member recipe IDs.
- Sorted distinct member output item IDs.

Searchable lines remain normalized once in `search-items.json`. Collections
reference output IDs instead of duplicating tooltip strings. The browser joins
collection members to searchable items during schema loading.

Grouped collection IDs are derived from category and group. Ungrouped IDs are
derived from category and recipe ID. The exact encoding is an implementation
detail but must be stable, collision-free, and tested.

Production generation retains the pinned baselines of 634 recipes, 562 output
items, and 281 inventory items. It will also pin the audited collection count
after the first source-accurate generation. Failed generation must preserve the
last valid collection artifact alongside the four existing artifacts.

## Runtime search pipeline

For an inventory, grid size, and query `q`, the engine performs these stages in
order:

1. Mark each recipe eligible when it fits the grid and every ingredient slot is
   satisfied by the exact inventory.
2. Match each recipe-result collection against `q` using the searchable lines
   of every member output, whether or not that particular member recipe is
   eligible.
3. For every matched collection, emit only the exact outputs of its eligible
   member recipes.
4. Deduplicate emitted outputs by item ID across collections.

This order is load-bearing. An uncraftable Brown Bed supplies the `wn` alias to
the `bed` collection, while a craftable White Bed member is the output that
actually becomes visible.

Search normalization, line boundaries, printable characters, one-to-five
character queries, and exact UTF-16 match spans remain unchanged. A trailing
space is an ordinary searchable character, so `wn ` is generated and matched.

## Candidate generation and optimization

For a target item, candidate substrings are generated from every searchable
member line of every collection containing a recipe that outputs that target.
This replaces generation from only the target item's own lines.

A candidate is then evaluated through the runtime collection pipeline against
all eligible recipes. The existing single-query and overlap optimizers continue
to consume sets of exact visible output IDs. Therefore target coverage, junk
counting, score formulas, directional overlap cost, failure bounds, and
tie-breakers do not change.

Prepared collection matching must remain shared between the single-query and
overlap paths. Existing cooperative chunking, cancellation, progress reporting,
and stale-publication guards remain required.

## Match explanations

An explanation must distinguish the line that matched from the output that was
surfaced. It includes:

- Query.
- Collection ID and optional group string.
- Matched member item ID and name.
- Source line and exact matched span.
- Visible craftable output item ID and name.

For example, a White Bed result for `wn` explains that the `bed` collection
matched the name `Brown Bed`, while `minecraft:white_bed` was the eligible
member emitted by that collection.

When several member lines match, explanations use a deterministic ordering and
retain enough evidence to show every visible output's collection path. UI copy
must not imply that the alias item itself was craftable.

## Persistence and interface

Inventory slots continue storing exact inventory item IDs. Target workspaces
continue storing exact output item IDs. No browser persistence migration is
needed for this change.

The target picker continues to list every exact recipe output. Results and junk
continue to display exact item names. The results panel adds concise collection
alias text when a result was found through another member's searchable line.

Schema-version failure remains explicit: an older cached or deployed artifact
set cannot be mixed with schema version 3.

## Validation and error handling

Generation fails with actionable diagnostics when:

- A crafting recipe group is not a string.
- A recipe-book category cannot be source-accurately classified.
- A recipe belongs to zero or multiple result collections.
- A collection references a missing recipe or searchable output.
- A grouped collection contains inconsistent category/group data.
- Collection IDs collide or generation is nondeterministic.
- The pinned recipe, output, inventory, or audited collection count differs.

The machine-readable validation reports include collection diagnostics. A
failed run writes the separate failure report without replacing any valid
schema-version-3 artifact.

## Testing

Generator tests cover:

- Parsing absent, empty, and non-empty group fields.
- Exact category-plus-group collection construction.
- Isolation of ungrouped recipes.
- Stable collection IDs and deterministic output.
- Bed, carpet, banner, anchor, and white-wool membership fixtures.
- Full-corpus invariants and the pinned collection count.

Engine tests cover:

- An uncraftable alias member surfacing a different craftable member.
- Exact inventory and exact output IDs remaining separate.
- Multiple craftable members remaining distinct outputs.
- Deduplication when an output is emitted through multiple collections.
- Candidate generation from member aliases.
- Trailing-space queries.
- Alias-aware explanations and Unicode-safe spans.
- Existing cancellation/progress behavior during collection matching.

Acceptance tests cover the confirmed `wn`, `wn `, `re`, `ngo`, `ro`, and `oe`
behaviors. The browser flow also verifies that White Wool remains absent in the
String-only `wn` case and that result explanations identify alias versus
craftable output correctly.

## Considered alternatives

### Flat per-output tooltip search

Rejected because it cannot reproduce the confirmed bed, carpet, and banner
results.

### Append every color name to a white representative

Rejected because it would make ungrouped White Wool inherit Brown Wool search
text and would discard exact item identity.

### Collapse collection members into generic application targets

Deferred. It reduces UI clutter but introduces new target identities, migration,
labels, and junk semantics that Minecraft itself does not provide. Exact items
plus source-accurate collection search solves the observed correctness defect
without that extra abstraction.
