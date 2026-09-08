import json

import pytest

from mcsr_data.language_assets import (
    LanguageAsset,
    LanguageAssetError,
    discover_language_assets,
    load_language_catalogs,
    load_language_metadata,
    resolve_asset_path,
)
from mcsr_data.translations import TranslationCatalog


def _write_index(asset_root, objects):
    index_path = asset_root / "indexes" / "1.16.json"
    index_path.parent.mkdir(parents=True)
    index_path.write_text(json.dumps({"objects": objects}), encoding="utf-8")
    return index_path


def _write_asset(asset_root, asset_hash, contents):
    path = resolve_asset_path(asset_root, asset_hash)
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(contents), encoding="utf-8")
    return path


def test_discovers_language_assets_in_locale_order(tmp_path):
    asset_root = tmp_path / "assets"
    fr_hash = "f" * 40
    de_hash = "d" * 40
    index_path = _write_index(asset_root, {
        "minecraft/sounds.json": {"hash": "a" * 40, "size": 3},
        "minecraft/lang/fr_fr.json": {"hash": fr_hash, "size": 4},
        "minecraft/lang/de_de.json": {"hash": de_hash, "size": 5},
    })

    assert discover_language_assets(index_path) == (
        LanguageAsset("de_de", de_hash, 5),
        LanguageAsset("fr_fr", fr_hash, 4),
    )


def test_resolves_mojang_asset_hash_to_the_object_cache_layout(tmp_path):
    asset_hash = "ab" + "c" * 38

    assert resolve_asset_path(tmp_path / "assets", asset_hash) == (
        tmp_path / "assets" / "objects" / "ab" / asset_hash
    )


def test_reports_an_indexed_language_asset_that_is_missing_from_the_cache(tmp_path):
    asset_root = tmp_path / "assets"
    asset_hash = "d" * 40
    index_path = _write_index(asset_root, {
        "minecraft/lang/de_de.json": {"hash": asset_hash, "size": 2},
    })

    with pytest.raises(LanguageAssetError, match="de_de.*missing locally"):
        load_language_catalogs(
            asset_root,
            index_path,
            fallback=TranslationCatalog({}),
        )


def test_loads_localized_catalogs_with_en_us_fallback(tmp_path):
    asset_root = tmp_path / "assets"
    asset_hash = "d" * 40
    contents = {"item.minecraft.crafting_table": "Werktisch"}
    asset_path = _write_asset(asset_root, asset_hash, contents)
    index_path = _write_index(asset_root, {
        "minecraft/lang/de_de.json": {
            "hash": asset_hash,
            "size": asset_path.stat().st_size,
        },
    })

    catalogs = load_language_catalogs(
        asset_root,
        index_path,
        fallback=TranslationCatalog({"block.minecraft.oak_planks": "Oak Planks"}),
    )

    assert catalogs["de_de"].item_name("minecraft:crafting_table") == "Werktisch"
    assert catalogs["de_de"].item_name("minecraft:oak_planks") == "Oak Planks"


def test_loads_minecraft_language_metadata_and_classifies_its_script(tmp_path):
    asset_root = tmp_path / "assets"
    asset_hash = "d" * 40
    contents = {
        "language.name": "Deutsch",
        "language.region": "Deutschland",
        "item.minecraft.crafting_table": "Werktisch",
    }
    asset_path = _write_asset(asset_root, asset_hash, contents)
    index_path = _write_index(asset_root, {
        "minecraft/lang/de_de.json": {
            "hash": asset_hash,
            "size": asset_path.stat().st_size,
        },
    })

    metadata = load_language_metadata(asset_root, index_path)

    assert metadata["de_de"].name == "Deutsch"
    assert metadata["de_de"].region == "Deutschland"
    assert metadata["de_de"].script == "latin"
