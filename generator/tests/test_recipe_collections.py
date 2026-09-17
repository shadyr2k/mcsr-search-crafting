import json
from pathlib import Path

import pytest

import mcsr_data.recipe_collections as recipe_collections
from mcsr_data.models import IngredientRef, IngredientSlot, NormalizedRecipe
from mcsr_data.recipe_collections import (
    RecipeCollectionError,
    assign_recipe_result_collections,
    collection_id_for,
    load_recipe_book_categories,
)
from mcsr_data.recipes import load_crafting_recipes


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


def recipe(
    recipe_id: str,
    output_item: str,
    *,
    group: str | None,
) -> NormalizedRecipe:
    return NormalizedRecipe(
        recipe_id=recipe_id,
        recipe_type="shapeless",
        recipe_group=group,
        output_item=output_item,
        output_count=1,
        ingredient_slots=(
            IngredientSlot(options=(IngredientRef("item", "minecraft:stick"),)),
        ),
        width=1,
        height=1,
        fits_2x2=True,
        fits_3x3=True,
        recipe_book_category=None,
        result_collection_id=None,
    )


def test_same_nonempty_group_joins_only_within_one_category():
    recipes = [
        recipe("minecraft:white_bed", "minecraft:white_bed", group="bed"),
        recipe("minecraft:brown_bed", "minecraft:brown_bed", group="bed"),
        recipe("minecraft:test_redstone", "minecraft:test_redstone", group="bed"),
    ]
    categories = {
        "minecraft:white_bed": "crafting_building_blocks",
        "minecraft:brown_bed": "crafting_building_blocks",
        "minecraft:test_redstone": "crafting_redstone",
    }

    enriched, collections = assign_recipe_result_collections(recipes, categories)

    assert [collection.recipe_ids for collection in collections] == [
        ("minecraft:brown_bed", "minecraft:white_bed"),
        ("minecraft:test_redstone",),
    ]
    assert len({item.result_collection_id for item in enriched}) == 2
    assert [item.recipe_id for item in enriched] == [
        "minecraft:brown_bed",
        "minecraft:test_redstone",
        "minecraft:white_bed",
    ]
    assert [item.recipe_book_category for item in enriched] == [
        "crafting_building_blocks",
        "crafting_redstone",
        "crafting_building_blocks",
    ]


def test_ungrouped_recipes_are_isolated_even_when_outputs_match():
    first = recipe("minecraft:first", "minecraft:white_wool", group=None)
    second = recipe("minecraft:second", "minecraft:white_wool", group=None)

    enriched, collections = assign_recipe_result_collections(
        [first, second],
        {"minecraft:white_wool": "crafting_building_blocks"},
    )

    assert len(collections) == 2
    assert len({item.result_collection_id for item in enriched}) == 2
    assert [collection.output_item_ids for collection in collections] == [
        ("minecraft:white_wool",),
        ("minecraft:white_wool",),
    ]


def test_collection_ids_url_encode_exact_groups_and_recipe_ids():
    assert collection_id_for(
        "crafting_misc", " Bed /?% ", "minecraft:ignored"
    ) == "crafting_misc/group/%20Bed%20%2F%3F%25%20"
    assert collection_id_for(
        "crafting_misc", None, "minecraft:test/a"
    ) == "crafting_misc/recipe/minecraft%3Atest%2Fa"


def test_collection_construction_is_deterministic_and_deduplicates_outputs():
    recipes = [
        recipe("minecraft:z", "minecraft:shared", group="same"),
        recipe("minecraft:a", "minecraft:shared", group="same"),
    ]
    categories = {"minecraft:shared": "crafting_misc"}

    forward = assign_recipe_result_collections(recipes, categories)
    reverse = assign_recipe_result_collections(list(reversed(recipes)), categories)

    assert forward == reverse
    assert forward[1][0].recipe_ids == ("minecraft:a", "minecraft:z")
    assert forward[1][0].output_item_ids == ("minecraft:shared",)


def test_missing_output_category_is_rejected():
    with pytest.raises(
        RecipeCollectionError,
        match=(
            r"^minecraft:missing: no recipe-book category for output "
            r"minecraft:unknown$"
        ),
    ):
        assign_recipe_result_collections(
            [recipe("minecraft:missing", "minecraft:unknown", group=None)],
            {},
        )


def test_source_recipe_category_takes_precedence_over_the_legacy_output_mapping():
    source_categorized = recipe("minecraft:modern", "minecraft:unknown", group=None)
    source_categorized = source_categorized.__class__(
        **{**source_categorized.__dict__, "recipe_book_category": "crafting_equipment"}
    )

    enriched, collections = assign_recipe_result_collections([source_categorized], {})

    assert enriched[0].recipe_book_category == "crafting_equipment"
    assert collections[0].recipe_book_category == "crafting_equipment"


def test_duplicate_recipe_ids_are_rejected():
    recipes = [
        recipe("minecraft:duplicate", "minecraft:first", group=None),
        recipe("minecraft:duplicate", "minecraft:second", group=None),
    ]
    with pytest.raises(
        RecipeCollectionError,
        match=r"^duplicate recipe ID: minecraft:duplicate$",
    ):
        assign_recipe_result_collections(
            recipes,
            {
                "minecraft:first": "crafting_misc",
                "minecraft:second": "crafting_misc",
            },
        )


def test_collection_id_collisions_are_rejected(monkeypatch):
    monkeypatch.setattr(
        recipe_collections,
        "collection_id_for",
        lambda category, recipe_group, recipe_id: "forced-collision",
    )
    recipes = [
        recipe("minecraft:first", "minecraft:first", group=None),
        recipe("minecraft:second", "minecraft:second", group=None),
    ]

    with pytest.raises(
        RecipeCollectionError,
        match=r"^collection ID collision: forced-collision$",
    ):
        assign_recipe_result_collections(
            recipes,
            {
                "minecraft:first": "crafting_misc",
                "minecraft:second": "crafting_misc",
            },
        )


def category_payload() -> dict[str, object]:
    return {
        "minecraft_version": "1.16.1",
        "categories": {
            "crafting_building_blocks": ["minecraft:building"],
            "crafting_equipment": ["minecraft:equipment"],
            "crafting_redstone": ["minecraft:redstone"],
            "crafting_misc": ["minecraft:misc"],
        },
    }


def write_category_payload(tmp_path: Path, payload: object) -> Path:
    path = tmp_path / "categories.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_category_loader_returns_an_output_to_category_mapping(tmp_path):
    categories = load_recipe_book_categories(
        write_category_payload(tmp_path, category_payload())
    )

    assert categories == {
        "minecraft:building": "crafting_building_blocks",
        "minecraft:equipment": "crafting_equipment",
        "minecraft:redstone": "crafting_redstone",
        "minecraft:misc": "crafting_misc",
    }


def test_category_loader_rejects_the_wrong_minecraft_version(tmp_path):
    payload = category_payload()
    payload["minecraft_version"] = "1.16.2"

    with pytest.raises(
        RecipeCollectionError,
        match=r"minecraft_version must be '1\.16\.1'",
    ):
        load_recipe_book_categories(write_category_payload(tmp_path, payload))


def test_category_loader_rejects_an_unknown_category(tmp_path):
    payload = category_payload()
    payload["categories"]["crafting_unknown"] = []

    with pytest.raises(
        RecipeCollectionError,
        match=r"unknown recipe-book category: crafting_unknown",
    ):
        load_recipe_book_categories(write_category_payload(tmp_path, payload))


def test_category_loader_rejects_duplicate_assignments(tmp_path):
    payload = category_payload()
    payload["categories"]["crafting_misc"] = ["minecraft:building"]

    with pytest.raises(
        RecipeCollectionError,
        match=(
            r"duplicate output item ID minecraft:building in "
            r"crafting_building_blocks and crafting_misc"
        ),
    ):
        load_recipe_book_categories(write_category_payload(tmp_path, payload))


@pytest.mark.parametrize("item_id", [None, 7, [], {}])
def test_category_loader_rejects_non_string_item_ids(tmp_path, item_id):
    payload = category_payload()
    payload["categories"]["crafting_misc"] = [item_id]

    with pytest.raises(
        RecipeCollectionError,
        match=r"crafting_misc item IDs must be non-empty strings",
    ):
        load_recipe_book_categories(write_category_payload(tmp_path, payload))


def test_category_loader_rejects_unsorted_category_lists(tmp_path):
    payload = category_payload()
    payload["categories"]["crafting_misc"] = ["minecraft:z", "minecraft:a"]

    with pytest.raises(
        RecipeCollectionError,
        match=r"crafting_misc item IDs must be sorted and unique",
    ):
        load_recipe_book_categories(write_category_payload(tmp_path, payload))


def test_real_corpus_reproduces_pinned_collection_membership_and_counts():
    recipes = load_crafting_recipes(MINECRAFT_DATA_ROOT / "recipes")
    categories = load_recipe_book_categories()
    output_item_ids = {recipe.output_item for recipe in recipes}

    enriched, collections = assign_recipe_result_collections(recipes, categories)
    collection_by_recipe = {
        recipe.recipe_id: recipe.result_collection_id for recipe in enriched
    }

    assert collection_by_recipe["minecraft:white_bed"] == collection_by_recipe[
        "minecraft:brown_bed"
    ]
    assert collection_by_recipe["minecraft:white_carpet"] == collection_by_recipe[
        "minecraft:brown_carpet"
    ]
    assert collection_by_recipe["minecraft:white_banner"] == collection_by_recipe[
        "minecraft:brown_banner"
    ]
    assert collection_by_recipe["minecraft:respawn_anchor"] != collection_by_recipe[
        "minecraft:white_bed"
    ]
    assert collection_by_recipe["minecraft:white_wool_from_string"] != collection_by_recipe[
        "minecraft:brown_wool"
    ]
    assert set(categories) == output_item_ids
    assert len(output_item_ids) == 562
    assert len(enriched) == 634
    assert len(collections) == 354
