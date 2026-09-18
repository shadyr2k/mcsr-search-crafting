# Minecraft 26.1.2 searchable-tooltip source provenance

Status: source reproduction approved. This audit uses the supplied vanilla
Minecraft Java Edition 26.1.2 client and the supplied asset index and launcher
language cache.

## Pinned inputs

- Minecraft version: Java Edition `26.1.2`.
- Official named client: the supplied
  `minecraft-26.1.2-client.jar`. Unlike the 1.16.1 client, this JAR already
  contains Mojang's named classes, so no intermediary mapping or remapping
  step is required for the audit.
- Language source: the supplied asset index `30.json`, its complete launcher
  object cache, and the extracted `en_us.json` recipe-source language file.
- Recipe corpus: 1,030 shaped or shapeless recipes with 887 distinct output
  item IDs.

## Search indexing path

`net.minecraft.client.multiplayer.SessionSearchTrees.updateRecipes` builds
the recipe search tree. Its recipe-collection function resolves every
`RecipeDisplayEntry.resultItems(...)`; the text function passes those stacks
to `getTooltipLines` with the registry-backed `Item.TooltipContext`, a null
player, and `TooltipFlag.Default.NORMAL`.

`SessionSearchTrees.getTooltipLines` then performs exactly these operations
on each returned component:

1. `Component.getString()`;
2. `ChatFormatting.stripFormatting(...)`;
3. `trim()`;
4. discard an empty result.

Consequently, blank separators and the leading spaces that
`SmithingTemplateItem` applies to its descriptive values do not become
searchable. The normal flag also matters: recipe search does not use the
creative-only detail variant.

## Full output audit

The source client was initialized with its vanilla registry component maps and
queried once for the normal tooltip of each of the 887 crafting output stacks.
The generator's English `search-items.json` is compared with that result after
the same formatting strip and trim steps. The comparison has zero line
mismatches.

The client output divides into these four disjoint classes, stored in
`tooltip_classifications_26_1_2.json`:

| Class | Outputs | Reproduction |
| --- | ---: | --- |
| Name only | 805 | Default stack name only |
| Equipment | 60 | Item-registration attributes |
| Other item tooltip | 22 | Item component/provider translation paths |
| Banner description | 0 | Not used by this client version |

All 26.1.2 production generation paths require this classification. A new
crafting output without an audited classification fails generation rather than
silently searching its name only.

## Modern stack-name components

Four banner-pattern items and every craftable smithing template obtain their
visible stack name from the `item.minecraft.<id>.new` translation component.
The ordinary item translation remains a generic `Banner Pattern` or `Smithing
Template`, but it is not the line indexed by the client. The generator uses
the component translation for those 23 output names.

In particular, current banner-pattern stacks are named `Creeper Charge Banner
Pattern`, `Flower Charge Banner Pattern`, `Thing Banner Pattern`, and `Skull
Charge Banner Pattern`. They no longer append the separate description line
used by the 1.16.1 `BannerPatternItem` implementation.

## Source-defined non-attribute lines

The 22 default stacks with non-attribute detail reproduce the following
client paths and translation keys:

- `minecraft:beehive` reads its default bees component and emits
  `container.beehive.bees` with `0`, `3`, then `container.beehive.honey` with
  `0`, `5`.
- `minecraft:firework_rocket` reads its default fireworks component and emits
  `item.minecraft.firework_rocket.flight`, followed by the default duration
  `1`.
- `minecraft:music_disc_5` has a `JukeboxPlayable` component whose tooltip
  uses `jukebox_song.minecraft.5`.
- The 18 armor-trim templates emit `item.minecraft.smithing_template`,
  `item.minecraft.smithing_template.applies_to`,
  `item.minecraft.smithing_template.armor_trim.applies_to`,
  `item.minecraft.smithing_template.ingredients`, and
  `item.minecraft.smithing_template.armor_trim.ingredients`.
- `minecraft:netherite_upgrade_smithing_template` uses the same heading keys
  with the `item.minecraft.smithing_template.netherite_upgrade.applies_to`
  and `.ingredients` values.

Each is generated through its translation keys for every available language;
English strings are never copied into localized data as a substitute for the
client template.

## Equipment attributes

The client `Items` registrations, `ToolMaterial`, `ArmorMaterials`,
`Item.Properties.spear`, and `MaceItem` paths supply the 60 equipment
outputs. Existing wooden, stone, iron, golden, and diamond tool and armor
rules remain as in the 1.16.1 audit. The 26.1.2 additions are:

- Copper tool material attack bonus `1`; its axe constructor damage is `7`,
  and its hoe constructor damage and speed are `-1` and `-2`. The remaining
  tool constructors match their corresponding established tool types.
- Copper armor values are feet `1`, legs `3`, chest `4`, and head `2`.
- Spears use their source-defined material bonuses and
  `(1 / swing duration) - 4` attack-speed formula. The craftable materials
  are wooden, stone, copper, iron, golden, and diamond.
- `MaceItem` supplies `+5 Attack Damage` and `-3.4 Attack Speed` in the main
  hand.
- Leather horse armor and wolf armor use the body equipment group, with
  `+3 Armor` and `+11 Armor` respectively.

The current English asset capitalizes modifier headings, for example `When in
Main Hand:` and `When on Chest:`. The generator resolves these headers and
attribute formatting through the selected language catalog.

## Recipe-result component boundary

Seventeen suspicious-stew recipe results include the
`minecraft:suspicious_stew_effects` component. The
`SuspiciousStewEffects.addToTooltip` source only adds effect text when
`TooltipFlag.isCreative()` is true. Because recipe search uses the normal
flag, these components add no searchable line and their default stack name is
the complete normal-tooltip result.

No other shaped or shapeless 26.1.2 crafting result has a `components`
object. Future recipe-output components must be audited against this normal
recipe-search path before they can add searchable lines.
