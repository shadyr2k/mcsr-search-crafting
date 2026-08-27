import json
from pathlib import Path

import pytest

from mcsr_data.tooltips import (
    OverrideValidationError,
    build_search_item,
    load_overrides,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "expected_tooltips.json"


def expected_tooltips() -> dict[str, list[str]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("item_id", sorted(expected_tooltips()))
def test_source_reproduced_equipment_lines_match_literal_fixture(item_id):
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


def test_non_equipment_item_uses_only_its_name():
    item = build_search_item("minecraft:crafting_table", "Crafting Table", None)

    assert [(line.source, line.text) for line in item.search_lines] == [
        ("name", "Crafting Table"),
    ]
    assert item.generation_method == "name_only"
    assert item.confidence == "source_reproduced"


def test_nonexistent_turtle_armor_is_not_fabricated():
    item = build_search_item("minecraft:turtle_boots", "Turtle Boots", None)

    assert [line.text for line in item.search_lines] == ["Turtle Boots"]
    assert item.generation_method == "name_only"


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
