import json
from pathlib import Path

import pytest

from mcsr_data.generate import GenerationFailed, generate, main
from mcsr_data.validation import ValidationReport


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


@pytest.fixture
def fixture_data(tmp_path):
    source = tmp_path / "minecraft-data"
    (source / "recipes").mkdir(parents=True)
    (source / "tags" / "items").mkdir(parents=True)
    (source / "lang").mkdir()
    (source / "lang" / "en_us.json").write_text(json.dumps({
        "block.minecraft.crafting_table": "Crafting Table",
        "block.minecraft.oak_planks": "Oak Planks",
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

    summary = generate(fixture_data, output, baseline=None)

    items = json.loads((output / "search-items.json").read_text(encoding="utf-8"))
    inventory_items = json.loads((output / "inventory-items.json").read_text(encoding="utf-8"))
    recipes = json.loads((output / "crafting-recipes.json").read_text(encoding="utf-8"))
    report = json.loads((output / "validation-report.json").read_text(encoding="utf-8"))
    assert items["schema_version"] == 2
    assert inventory_items == {
        "items": {"minecraft:oak_planks": {"name": "Oak Planks"}},
        "schema_version": 2,
    }
    assert recipes["schema_version"] == 2
    assert report["schema_version"] == 2
    assert summary.error_count == 0
    assert summary.recipe_count == 1
    assert summary.inventory_item_count == 1
    assert list(items["items"]) == sorted(items["items"])
    assert recipes["recipes"][0]["output_count"] == 1
    assert recipes["recipes"][0]["fits_2x2"] is True
    assert recipes["recipes"][0]["ingredient_slots"] == [
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
    ]
    assert not (output / "validation-failure-report.json").exists()


def test_generate_is_byte_deterministic_for_all_success_artifacts(fixture_data, tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"

    generate(fixture_data, first, baseline=None)
    generate(fixture_data, second, baseline=None)

    assert {
        path.name: path.read_bytes()
        for path in first.iterdir()
    } == {
        path.name: path.read_bytes()
        for path in second.iterdir()
    }


def test_generate_preserves_existing_outputs_when_validation_fails(fixture_data, tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    valid_artifacts = {
        filename: f"old {filename}"
        for filename in (
            "search-items.json",
            "inventory-items.json",
            "crafting-recipes.json",
            "validation-report.json",
        )
    }
    for filename, contents in valid_artifacts.items():
        (output / filename).write_text(contents, encoding="utf-8")
    (fixture_data / "recipes" / "unknown.json").write_text(json.dumps({
        "type": "minecraft:crafting_shapeless",
        "ingredients": [{"item": "minecraft:oak_planks"}],
        "result": {"item": "minecraft:unknown"},
    }), encoding="utf-8")

    with pytest.raises(GenerationFailed, match="validation failed") as failure:
        generate(fixture_data, output, baseline=None)

    assert isinstance(failure.value.report, ValidationReport)
    assert any(
        diagnostic.code == "missing_translation" and diagnostic.subject == "minecraft:unknown"
        for diagnostic in failure.value.report.diagnostics
    )
    failure_report = json.loads(
        (output / "validation-failure-report.json").read_text(encoding="utf-8")
    )
    assert failure_report["status"] == "failed"
    assert failure_report["error_count"] >= 1
    assert any(
        diagnostic["code"] == "missing_translation"
        and diagnostic["subject"] == "minecraft:unknown"
        for diagnostic in failure_report["diagnostics"]
    )
    assert {
        filename: (output / filename).read_text(encoding="utf-8")
        for filename in valid_artifacts
    } == valid_artifacts


def test_generate_reports_every_missing_required_source_path(tmp_path):
    source = tmp_path / "missing-source"
    source.mkdir()
    output = tmp_path / "output"

    with pytest.raises(GenerationFailed) as failure:
        generate(source, output, baseline=None)

    missing_subjects = {
        diagnostic.subject
        for diagnostic in failure.value.report.diagnostics
        if diagnostic.code == "missing_source_path"
    }
    assert missing_subjects == {"recipes", "tags/items", "lang/en_us.json"}


def test_production_cli_enforces_the_pinned_recipe_and_output_counts(
    fixture_data,
    tmp_path,
    capsys,
):
    output = tmp_path / "output"

    exit_code = main(["--source", str(fixture_data), "--output", str(output)])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "baseline_recipe_count" in captured.err
    assert "expected 634" in captured.err
    assert "baseline_output_count" in captured.err
    assert "expected 562" in captured.err
    assert "validation-failure-report.json" in captured.err
    assert not (output / "search-items.json").exists()


def test_cli_requires_an_explicit_flag_for_nonbaseline_fixture_generation(
    fixture_data,
    tmp_path,
    capsys,
):
    output = tmp_path / "output"

    exit_code = main([
        "--source", str(fixture_data),
        "--output", str(output),
        "--allow-non-baseline",
    ])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Generated 1 recipes" in captured.out
    assert (output / "inventory-items.json").exists()


def test_real_inventory_catalog_covers_every_concrete_ingredient_with_english_names(tmp_path):
    output = tmp_path / "real-output"

    summary = generate(MINECRAFT_DATA_ROOT, output)

    inventory_items = json.loads(
        (output / "inventory-items.json").read_text(encoding="utf-8")
    )["items"]
    search_items = json.loads(
        (output / "search-items.json").read_text(encoding="utf-8")
    )["items"]
    recipes = json.loads(
        (output / "crafting-recipes.json").read_text(encoding="utf-8")
    )["recipes"]
    ingredient_ids = {
        item_id
        for recipe in recipes
        for slot in recipe["ingredient_slots"]
        for item_id in slot["accepted_items"]
    }

    assert summary.recipe_count == 634
    assert summary.output_item_count == 562
    assert set(inventory_items) == ingredient_ids
    assert inventory_items["minecraft:oak_log"]["name"] == "Oak Log"
    assert inventory_items["minecraft:cobblestone"]["name"] == "Cobblestone"
    assert "minecraft:oak_log" not in search_items
    assert "minecraft:cobblestone" not in search_items
