import json

import pytest

from mcsr_data.presets import load_inventory_presets


def test_builtin_presets_have_exact_approved_ids():
    presets = load_inventory_presets()

    assert [preset.preset_id for preset in presets] == [
        "overworld",
        "nether-bastion",
        "nether-fortress",
    ]
    assert presets[0].item_ids[1] == "minecraft:oak_leaves"
    assert "minecraft:bucket" in presets[1].item_ids
    assert "minecraft:white_wool" in presets[1].item_ids


def test_loader_rejects_unknown_fields(tmp_path):
    path = tmp_path / "inventory-presets.json"
    path.write_text(json.dumps({
        "schema_version": 1,
        "presets": [{
            "id": "overworld",
            "name": "Overworld",
            "item_ids": ["minecraft:dirt"],
            "unexpected": True,
        }],
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="unknown field"):
        load_inventory_presets(path)


def test_loader_rejects_duplicate_item_ids(tmp_path):
    path = tmp_path / "inventory-presets.json"
    path.write_text(json.dumps({
        "schema_version": 1,
        "presets": [{
            "id": "overworld",
            "name": "Overworld",
            "item_ids": ["minecraft:dirt", "minecraft:dirt"],
        }],
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="duplicate item ID"):
        load_inventory_presets(path)


def test_loader_rejects_invalid_item_ids_and_duplicate_preset_names(tmp_path):
    path = tmp_path / "inventory-presets.json"
    path.write_text(json.dumps({
        "schema_version": 1,
        "presets": [
            {"id": "overworld", "name": "Overworld", "item_ids": ["minecraft:dirt"]},
            {"id": "nether", "name": "Overworld", "item_ids": ["minecraft:dirt"]},
        ],
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="duplicate preset name"):
        load_inventory_presets(path)

    path.write_text(json.dumps({
        "schema_version": 1,
        "presets": [{"id": "overworld", "name": "Overworld", "item_ids": ["invalid"]}],
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="invalid item ID"):
        load_inventory_presets(path)
