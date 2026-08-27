# Minecraft 1.16.1 searchable-tooltip source provenance

Status: source reproduction approved. On 2026-08-27 the task owner ruled that
the pinned Minecraft 1.16.1 source controls, so fixtures and design artifacts
use the exact lowercase `When in main hand:` translation.

## Pinned inputs and transformation

- Minecraft version: Java Edition `1.16.1`.
- Version manifest:
  `https://piston-meta.mojang.com/v1/packages/54fa3af57d041d2771e66d390197b2c0288e697c/1.16.1.json`.
- Official client:
  `https://piston-data.mojang.com/v1/objects/c9abbe8ee4fa490751ca70635340b7cf00db83ff/client.jar`.
  Its SHA-1 is `c9abbe8ee4fa490751ca70635340b7cf00db83ff`,
  exactly matching the version manifest; SHA-256 is
  `b4831e7b63b10588ff06ea86322108d916c536446f3aea3ae988b7fe3e1f66ef`.
- Fabric intermediary mappings: `net.fabricmc:intermediary:1.16.1:v2`,
  SHA-256
  `1daffb2da1503d79ab3f9ea3cf258ec5045cc41204d2a1151321e26652f3c654`.
- Yarn mappings: `net.fabricmc:yarn:1.16.1+build.21:v2`, SHA-256
  `cf3cc87c146042767d0d46191c9cd6bb47a22404956726fcb851c0acb851fa0b`.
- Remapper: Tiny Remapper `0.12.2`, fat JAR SHA-256
  `6c4b7f1ad6cf00a78cca83ed99d4e12b9ecfa7e1863a1f31a7554c7d5b3da0dd`.
- Decompiled named view: CFR `0.152`, JAR SHA-256
  `f686e8f3ded377d7bc87d216a90e9e9512df4156e75b06c655a16648ae8765b2`.
- The official client was remapped `official -> intermediary -> named`. The
  named JAR SHA-256 is
  `4e58173dd504e4afa939c19ff7700bc220e14c10d2504de3e9fc947f8eb5869e`.

## Search indexing path

Yarn maps intermediary `net/minecraft/class_310.method_1546` to
`net.minecraft.client.MinecraftClient.initializeSearchableContainers`.
The decompiled 1.16.1 method builds the `SearchManager.RECIPE_OUTPUT`
`TextSearchableContainer` from every recipe output's
`recipe.getOutput().getTooltip(null, TooltipContext.Default.NORMAL)`. It then
maps each `Text` through `Formatting.strip(text.getString()).trim()` and drops
empty strings. Therefore:

- the player argument is definitively `null`;
- the tooltip context is definitively normal, not advanced;
- the blank line that `ItemStack.getTooltip` inserts before an attribute
  section is not searchable;
- the translated text's spelling and capitalization are retained.

`net.minecraft.client.search.TextSearchableContainer.index` lowercases each
line only when adding it to the suffix array. The source line supplied to the
container remains the stripped, trimmed tooltip text.

## Tooltip construction and formatting

Yarn maps intermediary `net/minecraft/class_1799.method_7950` to
`net.minecraft.item.ItemStack.getTooltip(PlayerEntity, TooltipContext)`.
For each non-empty equipment-slot modifier map, the method adds the header
translation key `"item.modifiers." + slot.getName()`. Yarn maps
`net/minecraft/class_1304.method_5923` to
`net.minecraft.entity.EquipmentSlot.getName`; `EquipmentSlot.MAINHAND` is
constructed with the name `"mainhand"`. Consequently, the header key is
`item.modifiers.mainhand`.

The official 1.16.1 client's embedded
`assets/minecraft/lang/en_us.json` resolves that key as:

```text
When in main hand:
```

The initial plan used `When in Main Hand:`. The source-accuracy ruling changed
that stale expectation to `When in main hand:` because no rendering or
indexing step title-cases the translated string.

`ItemStack.MODIFIER_FORMAT` is a root-locale `DecimalFormat("#.##")`.
`getTooltip` selects `attribute.modifier.plus.<operation>` for positive raw
modifier values and `attribute.modifier.take.<operation>` for negative raw
values. In the official language asset, addition (`operation 0`) is
`+%s %s` and subtraction is `-%s %s`. With a null player, the method does not
add player base attack damage or attack speed and does not use the
`attribute.modifier.equals.*` branch.

`ItemStack.getTooltip` also reads `HideFlags`; bit `2` suppresses the complete
attribute section. This is the only recipe-output NBT behavior reproduced by
the equipment implementation.

## Copied numeric constants

Every value below comes from the named `1.16.1+build.21` decompilation.

### Tool material attack damage

`net.minecraft.item.ToolMaterials` enum constructor arguments provide the
material contribution used by `ToolMaterial.getAttackDamage()`:

| Material | Attack damage |
| --- | ---: |
| `WOOD` | `0.0f` |
| `STONE` | `1.0f` |
| `IRON` | `2.0f` |
| `DIAMOND` | `3.0f` |
| `GOLD` | `0.0f` |
| `NETHERITE` | `4.0f` |

`net.minecraft.item.SwordItem.<init>` and
`net.minecraft.item.MiningToolItem.<init>` add this material value to the
damage argument supplied by the corresponding static field in
`net.minecraft.item.Items`. Both constructors add attack-damage and
attack-speed modifiers with operation `ADDITION` for `MAINHAND`.

### Tool item constructor arguments

The following are the exact `(damage, speed)` arguments in `Items` static
field initializers. Material order is Wood, Stone, Iron, Diamond, Gold,
Netherite.

| Type | Wood | Stone | Iron | Diamond | Gold | Netherite |
| --- | --- | --- | --- | --- | --- | --- |
| Sword | `(3, -2.4f)` | `(3, -2.4f)` | `(3, -2.4f)` | `(3, -2.4f)` | `(3, -2.4f)` | `(3, -2.4f)` |
| Axe | `(6.0f, -3.2f)` | `(7.0f, -3.2f)` | `(6.0f, -3.1f)` | `(5.0f, -3.0f)` | `(6.0f, -3.0f)` | `(5.0f, -3.0f)` |
| Pickaxe | `(1, -2.8f)` | `(1, -2.8f)` | `(1, -2.8f)` | `(1, -2.8f)` | `(1, -2.8f)` | `(1, -2.8f)` |
| Shovel | `(1.5f, -3.0f)` | `(1.5f, -3.0f)` | `(1.5f, -3.0f)` | `(1.5f, -3.0f)` | `(1.5f, -3.0f)` | `(1.5f, -3.0f)` |
| Hoe | `(0, -3.0f)` | `(-1, -2.0f)` | `(-2, -1.0f)` | `(-3, 0.0f)` | `(0, -3.0f)` | `(-4, 0.0f)` |

This produces the required null-player regressions: iron sword `+5` and
`-2.4`, diamond sword `+6` and `-2.4`, and iron axe `+8` and `-3.1`.
Zero-valued modifiers remain present in the game's multimap but do not emit a
line; this is why diamond and Netherite hoes retain the header without an
attribute line.

### Armor material arguments

`net.minecraft.item.ArmorMaterials` supplies protection arrays in
`[feet, legs, chest, head]` order, followed by toughness and knockback
resistance. `net.minecraft.item.ArmorItem.<init>` always adds armor and armor
toughness modifiers; it additionally adds knockback resistance for Netherite.

| Material | Protection `[feet, legs, chest, head]` | Toughness | Knockback resistance |
| --- | --- | ---: | ---: |
| `LEATHER` | `[1, 2, 3, 1]` | `0.0f` | `0.0f` |
| `CHAIN` | `[1, 4, 5, 2]` | `0.0f` | `0.0f` |
| `IRON` | `[2, 5, 6, 2]` | `0.0f` | `0.0f` |
| `GOLD` | `[1, 3, 5, 2]` | `0.0f` | `0.0f` |
| `DIAMOND` | `[3, 6, 8, 3]` | `2.0f` | `0.0f` |
| `TURTLE` | `[2, 5, 6, 2]` | `0.0f` | `0.0f` |
| `NETHERITE` | `[3, 6, 8, 3]` | `3.0f` | `0.1f` |

For `EntityAttributes.GENERIC_KNOCKBACK_RESISTANCE`, `ItemStack.getTooltip`
multiplies the raw modifier by `10` before applying `MODIFIER_FORMAT`; the
Netherite value therefore renders as `+1 Knockback Resistance`.
