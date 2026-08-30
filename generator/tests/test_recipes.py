import pytest

from pathlib import Path

from mcsr_data.recipes import RecipeParseError, parse_recipe, resolve_recipe_ingredients
from mcsr_data.tags import TagResolver


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


def test_shaped_recipe_is_trimmed_and_grid_compatible():
    recipe = parse_recipe("minecraft:test", {
        "type": "minecraft:crafting_shaped",
        "pattern": [" A ", " B "],
        "key": {"A": {"item": "minecraft:iron_ingot"}, "B": {"item": "minecraft:stick"}},
        "result": {"item": "minecraft:iron_sword"},
    })
    assert recipe.width == 1
    assert recipe.height == 2
    assert recipe.fits_2x2 is True


def test_shaped_recipe_trimming_does_not_mutate_the_source_pattern():
    pattern = ["   ", " A ", " B ", "   "]
    raw = {
        "type": "minecraft:crafting_shaped",
        "pattern": pattern,
        "key": {"A": {"item": "minecraft:iron_ingot"}, "B": {"item": "minecraft:stick"}},
        "result": {"item": "minecraft:iron_sword"},
    }

    parse_recipe("minecraft:test", raw)

    assert pattern == ["   ", " A ", " B ", "   "]


def test_non_crafting_recipe_is_ignored():
    assert parse_recipe("minecraft:coal", {
        "type": "minecraft:smelting",
        "ingredient": {"item": "minecraft:coal_ore"},
        "result": "minecraft:coal",
    }) is None


@pytest.mark.parametrize(("raw_group", "expected"), [
    (None, None),
    ("", None),
    ("bed", "bed"),
    (" Bed ", " Bed "),
])
def test_recipe_group_preserves_nonempty_exact_values(raw_group, expected):
    raw = {
        "type": "minecraft:crafting_shapeless",
        "ingredients": [{"item": "minecraft:white_wool"}],
        "result": {"item": "minecraft:white_bed"},
    }
    if raw_group is not None:
        raw["group"] = raw_group

    assert parse_recipe("minecraft:white_bed", raw).recipe_group == expected


@pytest.mark.parametrize("invalid_group", [None, 7, [], {}])
def test_explicit_non_string_recipe_groups_are_rejected(invalid_group):
    with pytest.raises(RecipeParseError, match="group must be a string"):
        parse_recipe("minecraft:bad", {
            "type": "minecraft:crafting_shapeless",
            "group": invalid_group,
            "ingredients": [{"item": "minecraft:white_wool"}],
            "result": {"item": "minecraft:white_bed"},
        })


def test_shapeless_recipe_preserves_repeated_slots_and_counts_them():
    recipe = parse_recipe("minecraft:test", {
        "type": "minecraft:crafting_shapeless",
        "ingredients": [
            {"item": "minecraft:red_dye"},
            [{"item": "minecraft:blue_dye"}, {"tag": "minecraft:green_dyes"}],
            {"item": "minecraft:red_dye"},
        ],
        "result": {"item": "minecraft:test_item", "count": 2},
    })
    assert recipe.width == 3
    assert recipe.height == 1
    assert recipe.fits_2x2 is True
    assert recipe.output_count == 2
    assert [slot.options[0].value for slot in recipe.ingredient_slots] == [
        "minecraft:red_dye", "minecraft:blue_dye", "minecraft:red_dye",
    ]
    assert recipe.ingredient_slots[1].options[1].kind == "tag"


def test_shaped_recipe_with_unknown_pattern_symbol_is_rejected():
    with pytest.raises(RecipeParseError, match="missing key"):
        parse_recipe("minecraft:bad", {
            "type": "minecraft:crafting_shaped",
            "pattern": ["A"],
            "key": {},
            "result": {"item": "minecraft:test_item"},
        })


def test_resolve_recipe_ingredients_replaces_each_slot_with_concrete_alternatives():
    recipe = parse_recipe("minecraft:test", {
        "type": "minecraft:crafting_shapeless",
        "ingredients": [
            [{"item": "minecraft:stick"}, {"tag": "minecraft:planks"}],
            {"item": "minecraft:stick"},
        ],
        "result": {"item": "minecraft:test_item"},
    })

    resolved = resolve_recipe_ingredients(
        recipe,
        TagResolver.from_directory(MINECRAFT_DATA_ROOT / "tags" / "items"),
    )

    assert [slot.accepted_items for slot in resolved.ingredient_slots] == [
        (
            "minecraft:acacia_planks", "minecraft:birch_planks", "minecraft:crimson_planks",
            "minecraft:dark_oak_planks", "minecraft:jungle_planks", "minecraft:oak_planks",
            "minecraft:spruce_planks", "minecraft:stick", "minecraft:warped_planks",
        ),
        ("minecraft:stick",),
    ]
