from pathlib import Path

import pytest

from mcsr_data.recipes import load_crafting_recipes
from mcsr_data.translations import TranslationCatalog


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


def test_item_name_falls_back_to_block_translation():
    catalog = TranslationCatalog({"block.minecraft.crafting_table": "Crafting Table"})

    assert catalog.item_name("minecraft:crafting_table") == "Crafting Table"


def test_item_name_prefers_item_translation_over_block_translation():
    catalog = TranslationCatalog({
        "item.minecraft.crafting_table": "Item Name",
        "block.minecraft.crafting_table": "Block Name",
    })

    assert catalog.item_name("minecraft:crafting_table") == "Item Name"


def test_item_name_reports_an_unknown_id_without_synthesizing_a_name():
    catalog = TranslationCatalog({})

    with pytest.raises(KeyError, match="minecraft:unknown"):
        catalog.item_name("minecraft:unknown")


def test_all_distinct_crafting_outputs_have_an_english_name():
    recipes = load_crafting_recipes(MINECRAFT_DATA_ROOT / "recipes")
    catalog = TranslationCatalog.load(MINECRAFT_DATA_ROOT / "lang" / "en_us.json")
    output_ids = {recipe.output_item for recipe in recipes}

    assert len(recipes) == 634
    assert all(catalog.item_name(output_id) for output_id in output_ids)
