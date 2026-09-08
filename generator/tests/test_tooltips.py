import json
from pathlib import Path

import pytest

from mcsr_data.tooltips import (
    OverrideValidationError,
    UnsupportedTooltipDataError,
    UnsupportedTooltipItemError,
    build_search_item,
    load_overrides,
    load_tooltip_classifications,
)
from mcsr_data.recipes import load_crafting_recipes
from mcsr_data.translations import TranslationCatalog


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "expected_tooltips.json"
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


def expected_tooltips() -> dict[str, list[str]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("item_id", sorted(expected_tooltips()))
def test_source_reproduced_lines_match_literal_fixture(item_id):
    expected = expected_tooltips()[item_id]

    item = build_search_item(item_id, expected[0], None)

    assert [line.text for line in item.search_lines] == expected
    assert item.confidence == "source_reproduced"


def test_generated_lines_preserve_their_sources():
    item = build_search_item("minecraft:iron_sword", "Iron Sword", None)

    assert [line.source for line in item.search_lines] == [
        "name", "attribute_header", "attribute", "attribute",
    ]
    assert item.generation_method == "derived_attribute_logic"


def test_equipment_tooltips_use_locale_templates_and_argument_order():
    catalog = TranslationCatalog({
        "item.modifiers.mainhand": "Main hand:",
        "attribute.name.generic.attack_damage": "Damage",
        "attribute.name.generic.attack_speed": "Speed",
        "attribute.modifier.plus.0": "%2$s +%1$s",
        "attribute.modifier.take.0": "%2$s -%1$s",
    })

    item = build_search_item(
        "minecraft:iron_sword",
        "Localized Sword",
        None,
        catalog=catalog,
    )

    assert [line.text for line in item.search_lines] == [
        "Localized Sword",
        "Main hand:",
        "Damage +5",
        "Speed -2.4",
    ]


@pytest.mark.parametrize("item_id", [
    "minecraft:creeper_banner_pattern",
    "minecraft:flower_banner_pattern",
    "minecraft:mojang_banner_pattern",
    "minecraft:skull_banner_pattern",
])
def test_banner_pattern_description_has_source_provenance(item_id):
    item = build_search_item(item_id, "Banner Pattern", None)

    assert [line.source for line in item.search_lines] == ["name", "item_description"]
    assert item.generation_method == "derived_item_tooltip"
    assert item.confidence == "source_reproduced"


def test_all_sword_fixtures_retain_the_symbolic_four():
    swords = {
        item_id: lines
        for item_id, lines in expected_tooltips().items()
        if item_id.endswith("_sword")
    }

    assert swords
    assert all(any("4" in line for line in lines) for lines in swords.values())


def test_fixture_covers_every_equipment_family_and_material():
    item_ids = set(expected_tooltips())

    assert all(any(item_id.endswith(f"_{family}") for item_id in item_ids) for family in (
        "sword", "axe", "pickaxe", "shovel", "hoe",
        "helmet", "chestplate", "leggings", "boots",
    ))
    assert all(any(item_id.startswith(f"minecraft:{material}_") for item_id in item_ids) for material in (
        "wooden", "stone", "iron", "golden", "diamond", "netherite",
    ))


def test_hide_attributes_flag_removes_the_attribute_section():
    item = build_search_item(
        "minecraft:iron_sword",
        "Iron Sword",
        {"HideFlags": 2},
    )

    assert [line.text for line in item.search_lines] == ["Iron Sword"]


def test_nonzero_hide_flags_with_an_explicit_override_are_rejected(tmp_path):
    override_path = tmp_path / "overrides.json"
    override_path.write_text(json.dumps([{
        "item_id": "minecraft:iron_sword",
        "lines": ["Iron Sword", "Audited custom line"],
        "reason": "Fixture override.",
    }]), encoding="utf-8")
    overrides = load_overrides(override_path)
    with pytest.raises(UnsupportedTooltipDataError, match="HideFlags.*override"):
        build_search_item(
            "minecraft:iron_sword",
            "Iron Sword",
            {"HideFlags": 2},
            overrides=overrides,
        )


@pytest.mark.parametrize("output_nbt, key", [
    ({"AttributeModifiers": []}, "AttributeModifiers"),
    ({"display": {"Lore": ['{"text":"Audited lore"}']}}, "display"),
])
def test_tooltip_affecting_nbt_is_rejected_instead_of_ignored(output_nbt, key):
    with pytest.raises(
        UnsupportedTooltipDataError,
        match=rf"minecraft:iron_sword.*{key}",
    ):
        build_search_item("minecraft:iron_sword", "Iron Sword", output_nbt)


@pytest.mark.parametrize("hide_flags", [True, "2", 2.0])
def test_hide_flags_requires_the_audited_integer_form(hide_flags):
    with pytest.raises(UnsupportedTooltipDataError, match="HideFlags.*integer"):
        build_search_item(
            "minecraft:iron_sword",
            "Iron Sword",
            {"HideFlags": hide_flags},
        )


def test_non_equipment_item_uses_only_its_name():
    item = build_search_item("minecraft:crafting_table", "Crafting Table", None)

    assert [(line.source, line.text) for line in item.search_lines] == [
        ("name", "Crafting Table"),
    ]
    assert item.generation_method == "name_only"
    assert item.confidence == "source_reproduced"


def test_unknown_item_is_not_silently_marked_source_reproduced():
    with pytest.raises(UnsupportedTooltipItemError, match="minecraft:turtle_boots"):
        build_search_item("minecraft:turtle_boots", "Turtle Boots", None)


def test_all_scoped_recipe_outputs_have_an_explicit_tooltip_classification():
    recipes = load_crafting_recipes(MINECRAFT_DATA_ROOT / "recipes")
    catalog = TranslationCatalog.load(MINECRAFT_DATA_ROOT / "lang" / "en_us.json")

    assert len(recipes) == 634
    for recipe in recipes:
        item = build_search_item(
            recipe.output_item,
            catalog.item_name(recipe.output_item),
            None,
        )
        assert item.confidence in {"source_reproduced", "explicit_override"}


def test_classification_catalog_exactly_covers_distinct_scoped_outputs():
    outputs = {
        recipe.output_item
        for recipe in load_crafting_recipes(MINECRAFT_DATA_ROOT / "recipes")
    }
    classifications = load_tooltip_classifications()

    assert classifications.all_item_ids == outputs
    assert set(classifications.banner_pattern_descriptions) == {
        "minecraft:creeper_banner_pattern",
        "minecraft:flower_banner_pattern",
        "minecraft:mojang_banner_pattern",
        "minecraft:skull_banner_pattern",
    }


def test_valid_override_replaces_exact_lines_and_records_reason(tmp_path):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps([{
        "item_id": "minecraft:test_item",
        "lines": ["Test Item", "Special searchable line"],
        "reason": "The default output contains item-specific tooltip text.",
    }]), encoding="utf-8")
    overrides = load_overrides(path)

    item = build_search_item(
        "minecraft:test_item",
        "Test Item",
        None,
        overrides=overrides,
    )

    assert [line.text for line in item.search_lines] == [
        "Test Item", "Special searchable line",
    ]
    assert [line.source for line in item.search_lines] == ["name", "override"]
    assert item.generation_method == "explicit_override"
    assert item.confidence == "explicit_override"
    assert item.override_reason == "The default output contains item-specific tooltip text."


@pytest.mark.parametrize("records, message", [
    ([{
        "item_id": "minecraft:test",
        "lines": ["Test"],
        "reason": "Audited.",
        "unexpected": True,
    }], "unknown fields"),
    ([
        {"item_id": "minecraft:test", "lines": ["Test"], "reason": "First."},
        {"item_id": "minecraft:test", "lines": ["Test"], "reason": "Second."},
    ], "duplicate item_id"),
    ([{"item_id": "minecraft:test", "lines": ["Test"], "reason": "  "}], "reason"),
    ([{"item_id": "minecraft:test", "lines": [], "reason": "Audited."}], "lines"),
])
def test_invalid_overrides_are_rejected(tmp_path, records, message):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps(records), encoding="utf-8")

    with pytest.raises(OverrideValidationError, match=message):
        load_overrides(path)


def test_packaged_override_file_is_valid_and_has_no_unreasoned_cases():
    assert load_overrides() == {}
