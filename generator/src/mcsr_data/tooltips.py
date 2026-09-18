import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Mapping

from mcsr_data.models import SearchItem, SearchLine
from mcsr_data.translations import TranslationCatalog


@dataclass(frozen=True)
class ToolMaterialDefinition:
    attack_damage: Decimal


@dataclass(frozen=True)
class ToolTypeDefinition:
    constructor_damage: Mapping[str, Decimal]
    attack_speed: Mapping[str, Decimal]


@dataclass(frozen=True)
class ArmorMaterialDefinition:
    protection: Mapping[str, Decimal]
    toughness: Decimal
    knockback_resistance: Decimal


@dataclass(frozen=True)
class TooltipOverride:
    item_id: str
    lines: tuple[str, ...]
    reason: str


@dataclass(frozen=True)
class TooltipClassifications:
    name_only: frozenset[str]
    banner_pattern_descriptions: Mapping[str, str]
    item_tooltips: frozenset[str]
    equipment: frozenset[str]

    @property
    def all_item_ids(self) -> set[str]:
        return (
            set(self.name_only)
            | set(self.banner_pattern_descriptions)
            | set(self.item_tooltips)
            | set(self.equipment)
        )


class OverrideValidationError(ValueError):
    """Raised when an auditable tooltip override is malformed."""


class UnsupportedTooltipDataError(ValueError):
    """Raised when output NBT can change tooltip lines but is not reproduced."""


class UnsupportedTooltipItemError(ValueError):
    """Raised when an item lacks an explicit source-audited classification."""


_MATERIALS = ("wooden", "stone", "copper", "iron", "diamond", "golden", "netherite")

TOOL_MATERIALS: Mapping[str, ToolMaterialDefinition] = {
    "wooden": ToolMaterialDefinition(Decimal("0")),
    "stone": ToolMaterialDefinition(Decimal("1")),
    "copper": ToolMaterialDefinition(Decimal("1")),
    "iron": ToolMaterialDefinition(Decimal("2")),
    "diamond": ToolMaterialDefinition(Decimal("3")),
    "golden": ToolMaterialDefinition(Decimal("0")),
    "netherite": ToolMaterialDefinition(Decimal("4")),
}

TOOL_TYPES: Mapping[str, ToolTypeDefinition] = {
    "sword": ToolTypeDefinition(
        constructor_damage={material: Decimal("3") for material in _MATERIALS},
        attack_speed={material: Decimal("-2.4") for material in _MATERIALS},
    ),
    "axe": ToolTypeDefinition(
        constructor_damage={
            "wooden": Decimal("6"),
            "stone": Decimal("7"),
            "copper": Decimal("7"),
            "iron": Decimal("6"),
            "diamond": Decimal("5"),
            "golden": Decimal("6"),
            "netherite": Decimal("5"),
        },
        attack_speed={
            "wooden": Decimal("-3.2"),
            "stone": Decimal("-3.2"),
            "copper": Decimal("-3.2"),
            "iron": Decimal("-3.1"),
            "diamond": Decimal("-3"),
            "golden": Decimal("-3"),
            "netherite": Decimal("-3"),
        },
    ),
    "pickaxe": ToolTypeDefinition(
        constructor_damage={material: Decimal("1") for material in _MATERIALS},
        attack_speed={material: Decimal("-2.8") for material in _MATERIALS},
    ),
    "shovel": ToolTypeDefinition(
        constructor_damage={material: Decimal("1.5") for material in _MATERIALS},
        attack_speed={material: Decimal("-3") for material in _MATERIALS},
    ),
    "hoe": ToolTypeDefinition(
        constructor_damage={
            "wooden": Decimal("0"),
            "stone": Decimal("-1"),
            "copper": Decimal("-1"),
            "iron": Decimal("-2"),
            "diamond": Decimal("-3"),
            "golden": Decimal("0"),
            "netherite": Decimal("-4"),
        },
        attack_speed={
            "wooden": Decimal("-3"),
            "stone": Decimal("-2"),
            "copper": Decimal("-2"),
            "iron": Decimal("-1"),
            "diamond": Decimal("0"),
            "golden": Decimal("-3"),
            "netherite": Decimal("0"),
        },
    ),
}

# Minecraft 26.1.2's Item.Properties.spear builder assigns these material
# damage bonuses and derives attack speed as (1 / swing duration) - 4. The
# values were read from the supplied 26.1.2 client JAR.
SPEAR_26_1_2_ATTACK_DAMAGE: Mapping[str, Decimal] = {
    "wooden": Decimal("0"),
    "stone": Decimal("1"),
    "copper": Decimal("1"),
    "iron": Decimal("2"),
    "golden": Decimal("0"),
    "diamond": Decimal("3"),
    "netherite": Decimal("4"),
}
SPEAR_26_1_2_SWING_DURATIONS: Mapping[str, Decimal] = {
    "wooden": Decimal("0.65"),
    "stone": Decimal("0.75"),
    "copper": Decimal("0.85"),
    "iron": Decimal("0.95"),
    "golden": Decimal("0.95"),
    "diamond": Decimal("1.05"),
    "netherite": Decimal("1.15"),
}

ARMOR_MATERIALS: Mapping[str, ArmorMaterialDefinition] = {
    "copper": ArmorMaterialDefinition(
        protection={"boots": Decimal("1"), "leggings": Decimal("3"), "chestplate": Decimal("4"), "helmet": Decimal("2")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "leather": ArmorMaterialDefinition(
        protection={"boots": Decimal("1"), "leggings": Decimal("2"), "chestplate": Decimal("3"), "helmet": Decimal("1")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "chainmail": ArmorMaterialDefinition(
        protection={"boots": Decimal("1"), "leggings": Decimal("4"), "chestplate": Decimal("5"), "helmet": Decimal("2")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "iron": ArmorMaterialDefinition(
        protection={"boots": Decimal("2"), "leggings": Decimal("5"), "chestplate": Decimal("6"), "helmet": Decimal("2")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "golden": ArmorMaterialDefinition(
        protection={"boots": Decimal("1"), "leggings": Decimal("3"), "chestplate": Decimal("5"), "helmet": Decimal("2")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "diamond": ArmorMaterialDefinition(
        protection={"boots": Decimal("3"), "leggings": Decimal("6"), "chestplate": Decimal("8"), "helmet": Decimal("3")},
        toughness=Decimal("2"),
        knockback_resistance=Decimal("0"),
    ),
    "turtle": ArmorMaterialDefinition(
        protection={"boots": Decimal("2"), "leggings": Decimal("5"), "chestplate": Decimal("6"), "helmet": Decimal("2")},
        toughness=Decimal("0"),
        knockback_resistance=Decimal("0"),
    ),
    "netherite": ArmorMaterialDefinition(
        protection={"boots": Decimal("3"), "leggings": Decimal("6"), "chestplate": Decimal("8"), "helmet": Decimal("3")},
        toughness=Decimal("3"),
        knockback_resistance=Decimal("0.1"),
    ),
}

_ARMOR_HEADERS = {
    "boots": "When on feet:",
    "leggings": "When on legs:",
    "chestplate": "When on body:",
    "helmet": "When on head:",
}
_ARMOR_HEADERS_26_1_2 = {
    "boots": "When on Feet:",
    "leggings": "When on Legs:",
    "chestplate": "When on Chest:",
    "helmet": "When on Head:",
}
_ARMOR_HEADER_KEYS = {
    "boots": "item.modifiers.feet",
    "leggings": "item.modifiers.legs",
    "chestplate": "item.modifiers.chest",
    "helmet": "item.modifiers.head",
}
_ARMOR_SLOTS_BY_MATERIAL = {
    material: frozenset(_ARMOR_HEADERS)
    for material in ARMOR_MATERIALS
}
_ARMOR_SLOTS_BY_MATERIAL["turtle"] = frozenset({"helmet"})
_MAIN_HAND_HEADER = "When in main hand:"
_MAIN_HAND_HEADER_26_1_2 = "When in Main Hand:"
_OVERRIDES_PATH = Path(__file__).with_name("overrides.json")
_CLASSIFICATION_PATHS = {
    "1.16.1": Path(__file__).with_name("tooltip_classifications.json"),
    "26.1.2": Path(__file__).with_name("tooltip_classifications_26_1_2.json"),
}
_OVERRIDE_FIELDS = frozenset({"item_id", "lines", "reason"})
_CLASSIFICATION_FIELDS = frozenset({
    "schema_version", "minecraft_version", "name_only",
    "banner_pattern_descriptions", "item_tooltips", "equipment",
})


def load_overrides(path: Path | None = None) -> dict[str, TooltipOverride]:
    override_path = path or _OVERRIDES_PATH
    try:
        raw = json.loads(override_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise OverrideValidationError(f"{override_path}: cannot load overrides: {error}") from error
    if not isinstance(raw, list):
        raise OverrideValidationError(f"{override_path}: overrides must be a list")

    overrides: dict[str, TooltipOverride] = {}
    for index, record in enumerate(raw):
        subject = f"{override_path}: record {index}"
        if not isinstance(record, dict):
            raise OverrideValidationError(f"{subject}: override must be an object")
        unknown_fields = set(record) - _OVERRIDE_FIELDS
        if unknown_fields:
            raise OverrideValidationError(
                f"{subject}: unknown fields: {', '.join(sorted(unknown_fields))}"
            )
        missing_fields = _OVERRIDE_FIELDS - set(record)
        if missing_fields:
            raise OverrideValidationError(
                f"{subject}: missing fields: {', '.join(sorted(missing_fields))}"
            )

        item_id = record["item_id"]
        lines = record["lines"]
        reason = record["reason"]
        if not isinstance(item_id, str) or not item_id.strip():
            raise OverrideValidationError(f"{subject}: item_id must be a non-empty string")
        if item_id in overrides:
            raise OverrideValidationError(f"{subject}: duplicate item_id {item_id}")
        if (
            not isinstance(lines, list)
            or not lines
            or not all(isinstance(line, str) and line.strip() for line in lines)
        ):
            raise OverrideValidationError(f"{subject}: lines must be non-empty strings")
        if not isinstance(reason, str) or not reason.strip():
            raise OverrideValidationError(f"{subject}: reason must be a non-empty string")
        overrides[item_id] = TooltipOverride(item_id, tuple(lines), reason.strip())
    return overrides


def load_tooltip_classifications(
    path: Path | None = None,
    *,
    minecraft_version: str = "1.16.1",
) -> TooltipClassifications:
    classification_path = path or _CLASSIFICATION_PATHS.get(minecraft_version)
    if classification_path is None:
        raise UnsupportedTooltipItemError(
            f"Minecraft {minecraft_version}: no source-audited tooltip classifications are available"
        )
    try:
        raw = json.loads(classification_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise UnsupportedTooltipItemError(
            f"{classification_path}: cannot load tooltip classifications: {error}"
        ) from error
    if not isinstance(raw, dict):
        raise UnsupportedTooltipItemError(
            f"{classification_path}: tooltip classifications must be an object"
        )
    unknown_fields = set(raw) - _CLASSIFICATION_FIELDS
    missing_fields = _CLASSIFICATION_FIELDS - set(raw)
    if unknown_fields or missing_fields:
        raise UnsupportedTooltipItemError(
            f"{classification_path}: invalid classification fields; "
            f"unknown={sorted(unknown_fields)}, missing={sorted(missing_fields)}"
        )
    if raw["schema_version"] != 2 or raw["minecraft_version"] != minecraft_version:
        raise UnsupportedTooltipItemError(
            f"{classification_path}: expected schema 2 for Minecraft {minecraft_version}"
        )

    name_only = _load_classification_list(classification_path, "name_only", raw["name_only"])
    item_tooltips = _load_classification_list(
        classification_path,
        "item_tooltips",
        raw["item_tooltips"],
    )
    equipment = _load_classification_list(classification_path, "equipment", raw["equipment"])
    raw_descriptions = raw["banner_pattern_descriptions"]
    if (
        not isinstance(raw_descriptions, dict)
        or not all(
            isinstance(item_id, str)
            and item_id
            and isinstance(description, str)
            and description
            for item_id, description in raw_descriptions.items()
        )
    ):
        raise UnsupportedTooltipItemError(
            f"{classification_path}: banner_pattern_descriptions must map item IDs to text"
        )
    descriptions = dict(raw_descriptions)
    categories = (name_only, frozenset(descriptions), item_tooltips, equipment)
    if any(left & right for index, left in enumerate(categories) for right in categories[index + 1:]):
        raise UnsupportedTooltipItemError(
            f"{classification_path}: tooltip classification categories overlap"
        )
    return TooltipClassifications(name_only, descriptions, item_tooltips, equipment)


def build_search_item(
    item_id: str,
    name: str,
    output_nbt: dict[str, object] | None,
    *,
    overrides: Mapping[str, TooltipOverride] | None = None,
    catalog: TranslationCatalog | None = None,
    minecraft_version: str | None = None,
    require_classification: bool = False,
) -> SearchItem:
    tooltip_version = minecraft_version or "1.16.1"
    display_name = _stack_display_name(item_id, name, catalog, minecraft_version=tooltip_version)
    hide_flags = _validated_hide_flags(item_id, output_nbt)
    override = (load_overrides() if overrides is None else overrides).get(item_id)
    if override is not None:
        if hide_flags != 0:
            raise UnsupportedTooltipDataError(
                f"{item_id}: nonzero HideFlags cannot be combined with an explicit override; "
                "add a source-backed HideFlags-specific override contract before generation"
            )
        lines = tuple(
            SearchLine("name" if index == 0 and text == name else "override", text)
            for index, text in enumerate(override.lines)
        )
        return SearchItem(
            item_id=item_id,
            name=name,
            search_lines=lines,
            generation_method="explicit_override",
            confidence="explicit_override",
            override_reason=override.reason,
        )

    classifications = load_tooltip_classifications(minecraft_version=tooltip_version)
    description = classifications.banner_pattern_descriptions.get(item_id)
    if description is not None:
        if catalog is not None:
            description = catalog.translation(_banner_pattern_description_key(item_id))
        return SearchItem(
            item_id=item_id,
            name=display_name,
            search_lines=(
                SearchLine("name", display_name),
                SearchLine("item_description", description),
            ),
            generation_method="derived_item_tooltip",
            confidence="source_reproduced",
        )

    item_tooltips = _item_tooltip_lines(item_id, catalog, minecraft_version=tooltip_version)
    if item_id in classifications.item_tooltips or (
        item_tooltips is not None and not require_classification
    ):
        if item_tooltips is None:
            raise UnsupportedTooltipItemError(
                f"{item_id}: classified with item tooltip lines but has no source-backed rule"
            )
        return SearchItem(
            item_id=item_id,
            name=display_name,
            search_lines=(
                SearchLine("name", display_name),
                *(SearchLine("item_description", line) for line in item_tooltips),
            ),
            generation_method="derived_item_tooltip",
            confidence="source_reproduced",
        )

    equipment = _equipment_attributes(item_id, catalog, minecraft_version=tooltip_version)
    if item_id in classifications.equipment:
        if equipment is None:
            raise UnsupportedTooltipItemError(
                f"{item_id}: classified as equipment but has no source-backed equipment rule"
            )
    elif equipment is not None and require_classification:
        raise UnsupportedTooltipItemError(
            f"{item_id}: has source-derived equipment attributes but is absent from the "
            f"Minecraft {tooltip_version} tooltip classification"
        )
    elif item_tooltips is not None and require_classification:
        raise UnsupportedTooltipItemError(
            f"{item_id}: has source-derived item tooltip lines but is absent from the "
            f"Minecraft {tooltip_version} tooltip classification"
        )

    if equipment is None and item_id not in classifications.name_only:
        raise UnsupportedTooltipItemError(
            f"{item_id}: no source-audited tooltip classification for Minecraft "
            f"{tooltip_version}; audit the item tooltip and add an explicit classification "
            "or override"
        )
    search_lines = [SearchLine("name", display_name)]
    if equipment is not None and not _attributes_hidden(hide_flags):
        header, modifiers = equipment
        search_lines.append(SearchLine("attribute_header", header))
        search_lines.extend(
            SearchLine("attribute", line)
            for value, label, scale in modifiers
            if (line := _format_modifier(value, label, scale, catalog)) is not None
        )
    return SearchItem(
        item_id=item_id,
        name=display_name,
        search_lines=tuple(search_lines),
        generation_method="derived_attribute_logic" if equipment is not None else "name_only",
        confidence="source_reproduced",
    )


def _stack_display_name(
    item_id: str,
    fallback_name: str,
    catalog: TranslationCatalog | None,
    *,
    minecraft_version: str,
) -> str:
    """Return the default stack name after client-provided item components apply."""
    if minecraft_version != "26.1.2":
        return fallback_name
    if item_id.endswith("_smithing_template") or item_id in {
        "minecraft:creeper_banner_pattern",
        "minecraft:flower_banner_pattern",
        "minecraft:mojang_banner_pattern",
        "minecraft:skull_banner_pattern",
    }:
        path = item_id.removeprefix("minecraft:")
        return _translation(catalog, f"item.minecraft.{path}.new", fallback_name)
    return fallback_name


def _item_tooltip_lines(
    item_id: str,
    catalog: TranslationCatalog | None,
    *,
    minecraft_version: str,
) -> tuple[str, ...] | None:
    """Reproduce non-attribute normal-tooltip lines for the audited 26.1.2 outputs."""
    if minecraft_version != "26.1.2":
        return None
    if item_id == "minecraft:beehive":
        return (
            _format_translation(catalog, "container.beehive.bees", "Bees: %s / %s", "0", "3"),
            _format_translation(catalog, "container.beehive.honey", "Honey: %s / %s", "0", "5"),
        )
    if item_id == "minecraft:firework_rocket":
        return (
            f"{_translation(catalog, 'item.minecraft.firework_rocket.flight', 'Flight Duration:')} 1",
        )
    if item_id == "minecraft:music_disc_5":
        return (_translation(catalog, "jukebox_song.minecraft.5", "Samuel Åberg - 5"),)
    if item_id == "minecraft:netherite_upgrade_smithing_template":
        return _smithing_template_tooltip_lines(
            catalog,
            "item.minecraft.smithing_template.netherite_upgrade.applies_to",
            "Diamond Equipment",
            "item.minecraft.smithing_template.netherite_upgrade.ingredients",
            "Netherite Ingot",
        )
    if item_id.endswith("_armor_trim_smithing_template"):
        return _smithing_template_tooltip_lines(
            catalog,
            "item.minecraft.smithing_template.armor_trim.applies_to",
            "Armor",
            "item.minecraft.smithing_template.armor_trim.ingredients",
            "Ingots & Crystals",
        )
    return None


def _smithing_template_tooltip_lines(
    catalog: TranslationCatalog | None,
    applies_to_key: str,
    applies_to_fallback: str,
    ingredients_key: str,
    ingredients_fallback: str,
) -> tuple[str, ...]:
    return (
        _translation(catalog, "item.minecraft.smithing_template", "Smithing Template"),
        _translation(catalog, "item.minecraft.smithing_template.applies_to", "Applies to:"),
        _translation(catalog, applies_to_key, applies_to_fallback),
        _translation(catalog, "item.minecraft.smithing_template.ingredients", "Ingredients:"),
        _translation(catalog, ingredients_key, ingredients_fallback),
    )


def _equipment_attributes(
    item_id: str,
    catalog: TranslationCatalog | None,
    *,
    minecraft_version: str,
) -> tuple[str, tuple[tuple[Decimal, str, Decimal], ...]] | None:
    if not item_id.startswith("minecraft:"):
        return None
    if minecraft_version == "26.1.2":
        if item_id == "minecraft:mace":
            return _translation(
                catalog,
                "item.modifiers.mainhand",
                _MAIN_HAND_HEADER_26_1_2,
            ), (
                (
                    Decimal("5"),
                    _translation(
                        catalog,
                        "attribute.name.generic.attack_damage",
                        "Attack Damage",
                    ),
                    Decimal("1"),
                ),
                (
                    Decimal("-3.4"),
                    _translation(
                        catalog,
                        "attribute.name.generic.attack_speed",
                        "Attack Speed",
                    ),
                    Decimal("1"),
                ),
            )
        if item_id in {"minecraft:leather_horse_armor", "minecraft:wolf_armor"}:
            armor = Decimal("3") if item_id == "minecraft:leather_horse_armor" else Decimal("11")
            return _translation(catalog, "item.modifiers.body", "When equipped:"), (
                (
                    armor,
                    _translation(catalog, "attribute.name.generic.armor", "Armor"),
                    Decimal("1"),
                ),
            )

    path = item_id.removeprefix("minecraft:")
    material, separator, item_type = path.rpartition("_")
    if not separator:
        return None

    tool_material = TOOL_MATERIALS.get(material)
    tool_type = TOOL_TYPES.get(item_type)
    if tool_material is not None and tool_type is not None:
        modifiers = (
            (
                tool_material.attack_damage + tool_type.constructor_damage[material],
                _translation(catalog, "attribute.name.generic.attack_damage", "Attack Damage"),
                Decimal("1"),
            ),
            (
                tool_type.attack_speed[material],
                _translation(catalog, "attribute.name.generic.attack_speed", "Attack Speed"),
                Decimal("1"),
            ),
        )
        return _translation(
            catalog,
            "item.modifiers.mainhand",
            _MAIN_HAND_HEADER_26_1_2 if minecraft_version == "26.1.2" else _MAIN_HAND_HEADER,
        ), modifiers

    if minecraft_version == "26.1.2" and item_type == "spear":
        attack_damage = SPEAR_26_1_2_ATTACK_DAMAGE.get(material)
        swing_duration = SPEAR_26_1_2_SWING_DURATIONS.get(material)
        if attack_damage is not None and swing_duration is not None:
            modifiers = (
                (
                    attack_damage,
                    _translation(catalog, "attribute.name.generic.attack_damage", "Attack Damage"),
                    Decimal("1"),
                ),
                (
                    Decimal("1") / swing_duration - Decimal("4"),
                    _translation(catalog, "attribute.name.generic.attack_speed", "Attack Speed"),
                    Decimal("1"),
                ),
            )
            return _translation(
                catalog,
                "item.modifiers.mainhand",
                _MAIN_HAND_HEADER_26_1_2,
            ), modifiers

    armor_material = ARMOR_MATERIALS.get(material)
    header = (
        _ARMOR_HEADERS_26_1_2 if minecraft_version == "26.1.2" else _ARMOR_HEADERS
    ).get(item_type)
    if (
        armor_material is None
        or header is None
        or item_type not in _ARMOR_SLOTS_BY_MATERIAL[material]
    ):
        return None
    modifiers = [
        (
            armor_material.protection[item_type],
            _translation(catalog, "attribute.name.generic.armor", "Armor"),
            Decimal("1"),
        ),
        (
            armor_material.toughness,
            _translation(catalog, "attribute.name.generic.armor_toughness", "Armor Toughness"),
            Decimal("1"),
        ),
    ]
    if armor_material.knockback_resistance != 0:
        modifiers.append((
            armor_material.knockback_resistance,
            _translation(
                catalog,
                "attribute.name.generic.knockback_resistance",
                "Knockback Resistance",
            ),
            Decimal("10"),
        ))
    return _translation(catalog, _ARMOR_HEADER_KEYS[item_type], header), tuple(modifiers)


def _validated_hide_flags(
    item_id: str,
    output_nbt: dict[str, object] | None,
) -> int:
    if output_nbt is None or output_nbt == {}:
        return 0
    if not isinstance(output_nbt, dict):
        raise UnsupportedTooltipDataError(
            f"{item_id}: output NBT must be an object or null"
        )
    unsupported_keys = set(output_nbt) - {"HideFlags"}
    if unsupported_keys:
        raise UnsupportedTooltipDataError(
            f"{item_id}: unsupported tooltip-affecting output NBT keys: "
            f"{', '.join(sorted(unsupported_keys))}; add source-backed handling "
            "before generating searchable lines"
        )
    hide_flags = output_nbt.get("HideFlags")
    if not isinstance(hide_flags, int) or isinstance(hide_flags, bool):
        raise UnsupportedTooltipDataError(
            f"{item_id}: HideFlags must be an integer in the audited Minecraft 1.16.1 form"
        )
    return hide_flags


def _attributes_hidden(hide_flags: int) -> bool:
    return bool(hide_flags & 2)


def _load_classification_list(
    path: Path,
    field: str,
    raw: object,
) -> frozenset[str]:
    if (
        not isinstance(raw, list)
        or not all(isinstance(item_id, str) and item_id for item_id in raw)
        or raw != sorted(set(raw))
    ):
        raise UnsupportedTooltipItemError(
            f"{path}: {field} must be a sorted list of unique non-empty item IDs"
        )
    return frozenset(raw)


def _format_modifier(
    value: Decimal,
    label: str,
    scale: Decimal,
    catalog: TranslationCatalog | None,
) -> str | None:
    if value == 0:
        return None
    number = _format_number(abs(value) * scale)
    if catalog is None:
        sign = "+" if value > 0 else "-"
        return f"{sign}{number} {label}"
    key = "attribute.modifier.plus.0" if value > 0 else "attribute.modifier.take.0"
    return catalog.format(key, number, label)


def _format_number(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    return format(rounded, "f").rstrip("0").rstrip(".") or "0"


def _translation(
    catalog: TranslationCatalog | None,
    key: str,
    fallback: str,
) -> str:
    return fallback if catalog is None else catalog.translation(key)


def _format_translation(
    catalog: TranslationCatalog | None,
    key: str,
    fallback: str,
    *arguments: str,
) -> str:
    if catalog is None:
        return TranslationCatalog({key: fallback}).format(key, *arguments)
    return catalog.format(key, *arguments)


def _banner_pattern_description_key(item_id: str) -> str:
    path = item_id.removeprefix("minecraft:")
    return f"item.minecraft.{path}.desc"
