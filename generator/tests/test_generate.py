import json

import pytest

from mcsr_data.generate import generate


@pytest.fixture
def fixture_data(tmp_path):
    source = tmp_path / "minecraft-data"
    (source / "recipes").mkdir(parents=True)
    (source / "tags" / "items").mkdir(parents=True)
    (source / "lang").mkdir()
    (source / "lang" / "en_us.json").write_text(json.dumps({
        "block.minecraft.crafting_table": "Crafting Table",
    }), encoding="utf-8")
    (source / "recipes" / "crafting_table.json").write_text(json.dumps({
        "type": "minecraft:crafting_shaped",
        "pattern": ["PP", "PP"],
        "key": {"P": {"item": "minecraft:oak_planks"}},
        "result": {"item": "minecraft:crafting_table"},
    }), encoding="utf-8")
    return source


def test_generate_writes_stable_versioned_files(fixture_data, tmp_path):
    output = tmp_path / "output"

    summary = generate(fixture_data, output)

    items = json.loads((output / "search-items.json").read_text(encoding="utf-8"))
    recipes = json.loads((output / "crafting-recipes.json").read_text(encoding="utf-8"))
    report = json.loads((output / "validation-report.json").read_text(encoding="utf-8"))
    assert items["schema_version"] == 1
    assert recipes["schema_version"] == 1
    assert report["schema_version"] == 1
    assert summary.error_count == 0
    assert summary.recipe_count == 1
    assert list(items["items"]) == sorted(items["items"])
    assert recipes["recipes"][0]["output_count"] == 1
    assert recipes["recipes"][0]["fits_2x2"] is True
    assert recipes["recipes"][0]["ingredient_slots"] == [
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
    ]


def test_generate_preserves_existing_outputs_when_validation_fails(fixture_data, tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    existing = output / "search-items.json"
    existing.write_text("old data", encoding="utf-8")
    (fixture_data / "recipes" / "unknown.json").write_text(json.dumps({
        "type": "minecraft:crafting_shapeless",
        "ingredients": [{"item": "minecraft:oak_planks"}],
        "result": {"item": "minecraft:unknown"},
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="validation failed"):
        generate(fixture_data, output)

    assert existing.read_text(encoding="utf-8") == "old data"
    assert not (output / "crafting-recipes.json").exists()
    assert not (output / "validation-report.json").exists()
