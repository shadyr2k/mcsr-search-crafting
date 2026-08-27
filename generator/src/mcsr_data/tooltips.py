import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Mapping

from mcsr_data.models import SearchItem, SearchLine


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


class OverrideValidationError(ValueError):
    """Raised when an auditable tooltip override is malformed."""


_MATERIALS = ("wooden", "stone", "iron", "diamond", "golden", "netherite")

TOOL_MATERIALS: Mapping[str, ToolMaterialDefinition] = {
    "wooden": ToolMaterialDefinition(Decimal("0")),
    "stone": ToolMaterialDefinition(Decimal("1")),
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
            "iron": Decimal("6"),
            "diamond": Decimal("5"),
            "golden": Decimal("6"),
            "netherite": Decimal("5"),
        },
        attack_speed={
            "wooden": Decimal("-3.2"),
            "stone": Decimal("-3.2"),
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
            "iron": Decimal("-2"),
            "diamond": Decimal("-3"),
            "golden": Decimal("0"),
            "netherite": Decimal("-4"),
        },
        attack_speed={
            "wooden": Decimal("-3"),
            "stone": Decimal("-2"),
            "iron": Decimal("-1"),
            "diamond": Decimal("0"),
            "golden": Decimal("-3"),
            "netherite": Decimal("0"),
        },
    ),
}

ARMOR_MATERIALS: Mapping[str, ArmorMaterialDefinition] = {
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
_ARMOR_SLOTS_BY_MATERIAL = {
    material: frozenset(_ARMOR_HEADERS)
    for material in ARMOR_MATERIALS
}
_ARMOR_SLOTS_BY_MATERIAL["turtle"] = frozenset({"helmet"})
_MAIN_HAND_HEADER = "When in main hand:"
_OVERRIDES_PATH = Path(__file__).with_name("overrides.json")
_OVERRIDE_FIELDS = frozenset({"item_id", "lines", "reason"})


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


def build_search_item(
    item_id: str,
    name: str,
    output_nbt: dict[str, object] | None,
    *,
    overrides: Mapping[str, TooltipOverride] | None = None,
) -> SearchItem:
    override = (load_overrides() if overrides is None else overrides).get(item_id)
    if override is not None:
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

    equipment = _equipment_attributes(item_id)
    search_lines = [SearchLine("name", name)]
    if equipment is not None and not _attributes_hidden(output_nbt):
        header, modifiers = equipment
        search_lines.append(SearchLine("attribute_header", header))
        search_lines.extend(
            SearchLine("attribute", line)
            for value, label, scale in modifiers
            if (line := _format_modifier(value, label, scale)) is not None
        )
    return SearchItem(
        item_id=item_id,
        name=name,
        search_lines=tuple(search_lines),
        generation_method="derived_attribute_logic" if equipment is not None else "name_only",
        confidence="source_reproduced",
    )


def _equipment_attributes(
    item_id: str,
) -> tuple[str, tuple[tuple[Decimal, str, Decimal], ...]] | None:
    if not item_id.startswith("minecraft:"):
        return None
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
                "Attack Damage",
                Decimal("1"),
            ),
            (tool_type.attack_speed[material], "Attack Speed", Decimal("1")),
        )
        return _MAIN_HAND_HEADER, modifiers

    armor_material = ARMOR_MATERIALS.get(material)
    header = _ARMOR_HEADERS.get(item_type)
    if (
        armor_material is None
        or header is None
        or item_type not in _ARMOR_SLOTS_BY_MATERIAL[material]
    ):
        return None
    modifiers = [
        (armor_material.protection[item_type], "Armor", Decimal("1")),
        (armor_material.toughness, "Armor Toughness", Decimal("1")),
    ]
    if armor_material.knockback_resistance != 0:
        modifiers.append((
            armor_material.knockback_resistance,
            "Knockback Resistance",
            Decimal("10"),
        ))
    return header, tuple(modifiers)


def _attributes_hidden(output_nbt: dict[str, object] | None) -> bool:
    if output_nbt is None:
        return False
    hide_flags = output_nbt.get("HideFlags", 0)
    return isinstance(hide_flags, int) and not isinstance(hide_flags, bool) and bool(hide_flags & 2)


def _format_modifier(value: Decimal, label: str, scale: Decimal) -> str | None:
    if value == 0:
        return None
    sign = "+" if value > 0 else "-"
    return f"{sign}{_format_number(abs(value) * scale)} {label}"


def _format_number(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
    return format(rounded, "f").rstrip("0").rstrip(".") or "0"
