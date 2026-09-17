import json
import os
from pathlib import Path

import pytest

import mcsr_data.generate as generate_module
from mcsr_data.generate import (
    GenerationFailed,
    _validate_cross_references,
    generate,
    main,
)
from mcsr_data.language_info import required_fixed_language_info_keys
from mcsr_data.models import (
    IngredientSlot,
    NormalizedRecipe,
    RecipeResultCollection,
    SearchItem,
)
from mcsr_data.presets import load_inventory_presets
from mcsr_data.validation import ValidationReport


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MINECRAFT_DATA_ROOT = REPOSITORY_ROOT / "minecraft-data"


@pytest.fixture
def fixture_data(tmp_path):
    source = tmp_path / "minecraft-data"
    (source / "recipes").mkdir(parents=True)
    (source / "tags" / "items").mkdir(parents=True)
    (source / "lang").mkdir()
    translations = {
        "block.minecraft.crafting_table": "Crafting Table",
        "block.minecraft.oak_planks": "Oak Planks",
    }
    translations.update({key: key for key in required_fixed_language_info_keys()})
    for preset in load_inventory_presets():
        for item_id in preset.item_ids:
            namespace, path = item_id.split(":", 1)
            translations.setdefault(
                f"item.{namespace}.{path}",
                path.replace("_", " ").title(),
            )
    (source / "lang" / "en_us.json").write_text(json.dumps(translations), encoding="utf-8")
    (source / "recipes" / "crafting_table.json").write_text(json.dumps({
        "type": "minecraft:crafting_shaped",
        "group": "fixture_group",
        "pattern": ["PP", "PP"],
        "key": {"P": {"item": "minecraft:oak_planks"}},
        "result": {"item": "minecraft:crafting_table"},
    }), encoding="utf-8")
    return source


def test_generate_writes_stable_versioned_files(fixture_data, tmp_path):
    output = tmp_path / "output"

    summary = generate(
        fixture_data,
        output,
        baseline=None,
        recipe_book_categories={
            "minecraft:crafting_table": "crafting_building_blocks",
        },
    )

    items = json.loads((output / "search-items.json").read_text(encoding="utf-8"))
    inventory_items = json.loads((output / "inventory-items.json").read_text(encoding="utf-8"))
    recipes = json.loads((output / "crafting-recipes.json").read_text(encoding="utf-8"))
    collections = json.loads(
        (output / "recipe-result-collections.json").read_text(encoding="utf-8")
    )
    presets = json.loads((output / "inventory-presets.json").read_text(encoding="utf-8"))
    report = json.loads((output / "validation-report.json").read_text(encoding="utf-8"))
    assert items["schema_version"] == 3
    assert inventory_items["schema_version"] == 3
    assert inventory_items["items"]["minecraft:oak_planks"] == {"name": "Oak Planks"}
    assert inventory_items["items"]["minecraft:bucket"] == {"name": "Bucket"}
    assert recipes["schema_version"] == 3
    assert collections["schema_version"] == 3
    assert [preset["id"] for preset in presets["presets"]] == [
        "nether-bastion",
        "nether-fortress",
        "overworld",
    ]
    assert "minecraft:bucket" in presets["presets"][0]["item_ids"]
    assert presets["presets"][2]["item_ids"][1] == "minecraft:oak_leaves"
    assert report["schema_version"] == 3
    assert recipes["recipes"][0]["recipe_group"] == "fixture_group"
    assert recipes["recipes"][0]["recipe_book_category"] == "crafting_building_blocks"
    assert recipes["recipes"][0]["result_collection_id"] == collections["collections"][0]["id"]
    assert collections["minecraft_version"] == "1.16.1"
    assert collections["language"] == "en_us"
    assert summary.error_count == 0
    assert summary.recipe_count == 1
    assert summary.inventory_item_count == 27
    assert summary.collection_count == 1
    assert list(items["items"]) == sorted(items["items"])
    assert recipes["recipes"][0]["output_count"] == 1
    assert recipes["recipes"][0]["fits_2x2"] is True
    assert recipes["recipes"][0]["ingredient_slots"] == [
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
    ]
    assert recipes["recipes"][0]["ingredient_layout"] == [
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
        {"accepted_items": ["minecraft:oak_planks"]},
    ]
    assert not (output / "validation-failure-report.json").exists()


def test_generate_writes_the_selected_minecraft_version(fixture_data, tmp_path):
    output = tmp_path / "output"

    generate(
        fixture_data,
        output,
        baseline=None,
        minecraft_version="26.1.2",
        recipe_book_categories={"minecraft:crafting_table": "crafting_building_blocks"},
    )

    collections = json.loads((output / "recipe-result-collections.json").read_text(encoding="utf-8"))
    assert collections["minecraft_version"] == "26.1.2"


def test_successful_generation_removes_a_prior_failure_report(fixture_data, tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    stale_report = output / "validation-failure-report.json"
    stale_report.write_text("stale", encoding="utf-8")

    generate(
        fixture_data,
        output,
        baseline=None,
        recipe_book_categories={"minecraft:crafting_table": "crafting_building_blocks"},
    )

    assert not stale_report.exists()


def test_generate_is_byte_deterministic_for_all_success_artifacts(fixture_data, tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"

    categories = {"minecraft:crafting_table": "crafting_building_blocks"}
    generate(fixture_data, first, baseline=None, recipe_book_categories=categories)
    generate(fixture_data, second, baseline=None, recipe_book_categories=categories)

    assert {
        path.name: path.read_bytes()
        for path in first.iterdir()
    } == {
        path.name: path.read_bytes()
        for path in second.iterdir()
    }
def test_generate_writes_locale_keyed_search_data_from_existing_asset_cache(fixture_data, tmp_path):
    asset_root = tmp_path / "assets"
    asset_hash = "d" * 40
    locale_contents = {
        "block.minecraft.crafting_table": "Werktisch",
        "block.minecraft.oak_planks": "Eichenbretter",
    }
    object_path = asset_root / "objects" / asset_hash[:2] / asset_hash
    object_path.parent.mkdir(parents=True)
    object_path.write_text(json.dumps(locale_contents), encoding="utf-8")
    index_path = asset_root / "indexes" / "1.16.json"
    index_path.parent.mkdir(parents=True)
    index_path.write_text(json.dumps({"objects": {
        "minecraft/lang/de_de.json": {
            "hash": asset_hash,
            "size": object_path.stat().st_size,
        },
    }}), encoding="utf-8")
    output = tmp_path / "output"

    generate(
        fixture_data,
        output,
        baseline=None,
        recipe_book_categories={
            "minecraft:crafting_table": "crafting_building_blocks",
        },
        language_asset_root=asset_root,
        language_asset_index=index_path,
    )

    baseline_items = json.loads((output / "search-items.json").read_text(encoding="utf-8"))
    baseline_inventory = json.loads((output / "inventory-items.json").read_text(encoding="utf-8"))
    localized = json.loads((output / "localized-search-data.json").read_text(encoding="utf-8"))
    language_info = json.loads((output / "localized-language-info.json").read_text(encoding="utf-8"))
    assert localized["schema_version"] == 1
    assert localized["minecraft_version"] == "1.16.1"
    assert list(localized["locales"]) == ["de_de", "en_us"]
    assert localized["locales"]["en_us"] == {
        "search_items": baseline_items["items"],
        "inventory_items": baseline_inventory["items"],
    }
    assert localized["locales"]["de_de"]["search_items"]["minecraft:crafting_table"]["name"] == "Werktisch"
    assert localized["locales"]["de_de"]["inventory_items"]["minecraft:oak_planks"] == {
        "name": "Eichenbretter",
    }
    assert language_info["schema_version"] == 1
    assert list(language_info["locales"]) == ["de_de", "en_us"]
    assert language_info["locales"]["de_de"]["difficulties"]["easy"]["name"] == "options.difficulty.easy"


def test_generate_preserves_existing_outputs_when_validation_fails(fixture_data, tmp_path):
    output = tmp_path / "output"
    output.mkdir()
    valid_artifacts = {
        filename: f"old {filename}"
        for filename in (
            "search-items.json",
            "inventory-items.json",
            "inventory-presets.json",
            "crafting-recipes.json",
            "recipe-result-collections.json",
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
        generate(
            fixture_data,
            output,
            baseline=None,
            recipe_book_categories={
                "minecraft:crafting_table": "crafting_building_blocks",
                "minecraft:unknown": "crafting_misc",
            },
        )

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


def test_collection_cross_references_report_invalid_graphs():
    recipe = NormalizedRecipe(
        recipe_id="minecraft:recipe",
        recipe_type="shapeless",
        recipe_group="recipe_group",
        output_item="minecraft:output",
        output_count=1,
        ingredient_slots=(IngredientSlot(options=()),),
        width=1,
        height=1,
        fits_2x2=True,
        fits_3x3=True,
        recipe_book_category="crafting_building_blocks",
        result_collection_id="crafting_building_blocks/group/expected",
    )
    output = SearchItem(
        item_id="minecraft:output",
        name="Output",
        search_lines=(),
        generation_method="name_only",
        confidence="source_reproduced",
    )
    invalid_collection = RecipeResultCollection(
        collection_id="crafting_misc/group/actual",
        recipe_book_category="crafting_misc",
        recipe_group="different_group",
        recipe_ids=("minecraft:recipe", "minecraft:missing"),
        output_item_ids=("minecraft:missing",),
    )
    empty_duplicate_collection = RecipeResultCollection(
        collection_id="crafting_misc/group/actual",
        recipe_book_category="crafting_misc",
        recipe_group=None,
        recipe_ids=(),
        output_item_ids=(),
    )
    report = ValidationReport()

    _validate_cross_references(
        [recipe],
        {output.item_id: output},
        {},
        [invalid_collection, empty_duplicate_collection],
        report,
    )

    assert {
        diagnostic.code for diagnostic in report.diagnostics
    } >= {
        "duplicate_collection",
        "empty_collection",
        "empty_collection_outputs",
        "missing_collection_recipe",
        "missing_collection_output_item",
        "collection_output_reference_mismatch",
        "collection_category_mismatch",
        "collection_group_mismatch",
        "result_collection_reference_mismatch",
    }


def test_collection_members_must_be_sorted_and_unique():
    recipes = [
        NormalizedRecipe(
            recipe_id="minecraft:a_recipe",
            recipe_type="shapeless",
            recipe_group="group",
            output_item="minecraft:a_output",
            output_count=1,
            ingredient_slots=(),
            width=1,
            height=1,
            fits_2x2=True,
            fits_3x3=True,
            recipe_book_category="crafting_building_blocks",
            result_collection_id="crafting_building_blocks/group/group",
        ),
        NormalizedRecipe(
            recipe_id="minecraft:b_recipe",
            recipe_type="shapeless",
            recipe_group="group",
            output_item="minecraft:b_output",
            output_count=1,
            ingredient_slots=(),
            width=1,
            height=1,
            fits_2x2=True,
            fits_3x3=True,
            recipe_book_category="crafting_building_blocks",
            result_collection_id="crafting_building_blocks/group/group",
        ),
    ]
    items = {
        item_id: SearchItem(
            item_id=item_id,
            name=item_id,
            search_lines=(),
            generation_method="name_only",
            confidence="source_reproduced",
        )
        for item_id in ("minecraft:a_output", "minecraft:b_output")
    }
    malformed_collection = RecipeResultCollection(
        collection_id="crafting_building_blocks/group/group",
        recipe_book_category="crafting_building_blocks",
        recipe_group="group",
        recipe_ids=("minecraft:b_recipe", "minecraft:a_recipe"),
        output_item_ids=(
            "minecraft:b_output",
            "minecraft:a_output",
            "minecraft:b_output",
        ),
    )
    report = ValidationReport()

    _validate_cross_references(recipes, items, {}, [malformed_collection], report)

    assert {
        diagnostic.code for diagnostic in report.diagnostics
    } >= {
        "invalid_collection_recipe_ids",
        "invalid_collection_output_item_ids",
    }


def test_atomic_publish_restores_all_artifacts_after_an_intermediate_replacement_fails(
    tmp_path,
    monkeypatch,
):
    output = tmp_path / "output"
    output.mkdir()
    filenames = (
        "search-items.json",
        "inventory-items.json",
        "inventory-presets.json",
        "crafting-recipes.json",
        "recipe-result-collections.json",
        "validation-report.json",
    )
    previous = {filename: f"old {filename}".encode("utf-8") for filename in filenames}
    for filename, contents in previous.items():
        (output / filename).write_bytes(contents)
    payloads = {filename: {"version": 3, "filename": filename} for filename in filenames}
    original_replace = os.replace
    failed = False

    def fail_after_intermediate_replacement(source, destination):
        nonlocal failed
        source_path = Path(source)
        destination_path = Path(destination)
        if (
            not failed
            and source_path.name.startswith(".crafting-recipes.json.")
            and destination_path.name == "crafting-recipes.json"
        ):
            failed = True
            raise OSError("injected replacement failure")
        original_replace(source, destination)

    monkeypatch.setattr(generate_module.os, "replace", fail_after_intermediate_replacement)

    with pytest.raises(OSError, match="injected replacement failure"):
        generate_module._atomic_write_all(output, payloads)

    assert failed
    assert {
        filename: (output / filename).read_bytes()
        for filename in filenames
    } == previous


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
    assert "baseline_inventory_count" in captured.err
    assert "expected 283" in captured.err
    assert "baseline_collection_count" in captured.err
    assert "expected 354" in captured.err
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
    assert summary.inventory_item_count == 283
    assert summary.collection_count == 354
    assert set(inventory_items) == ingredient_ids | {
        "minecraft:oak_leaves",
        "minecraft:bucket",
    }
    assert inventory_items["minecraft:oak_log"]["name"] == "Oak Log"
    assert inventory_items["minecraft:cobblestone"]["name"] == "Cobblestone"
    assert inventory_items["minecraft:oak_leaves"]["name"] == "Oak Leaves"
    assert inventory_items["minecraft:bucket"]["name"] == "Bucket"
    assert "minecraft:oak_log" not in search_items
    assert "minecraft:cobblestone" not in search_items
