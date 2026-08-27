import json

import pytest

from mcsr_data.tags import TagResolutionError, TagResolver


def write_tag(directory, name, values):
    (directory / f"{name}.json").write_text(json.dumps({"values": values}), encoding="utf-8")


def test_direct_tag_resolution_is_sorted_and_deduplicated(tmp_path):
    write_tag(tmp_path, "dyes", ["minecraft:blue_dye", "minecraft:red_dye", "minecraft:blue_dye"])

    assert TagResolver.from_directory(tmp_path).resolve("minecraft:dyes") == frozenset({
        "minecraft:blue_dye", "minecraft:red_dye",
    })


def test_nested_tag_resolution(tmp_path):
    write_tag(tmp_path, "planks", ["minecraft:oak_planks", "#minecraft:fungal_planks"])
    write_tag(tmp_path, "fungal_planks", ["minecraft:crimson_planks"])

    resolver = TagResolver.from_directory(tmp_path)

    assert resolver.resolve("minecraft:planks") == frozenset({
        "minecraft:oak_planks", "minecraft:crimson_planks"
    })


def test_optional_missing_tag_is_ignored(tmp_path):
    write_tag(tmp_path, "dyes", [
        {"id": "#minecraft:missing", "required": False},
        "minecraft:red_dye",
    ])

    assert TagResolver.from_directory(tmp_path).resolve("minecraft:dyes") == frozenset({"minecraft:red_dye"})


def test_optional_existing_tag_cycle_is_rejected(tmp_path):
    write_tag(tmp_path, "root", [{"id": "#minecraft:optional", "required": False}])
    write_tag(tmp_path, "optional", ["#minecraft:root"])

    with pytest.raises(TagResolutionError, match="cycle"):
        TagResolver.from_directory(tmp_path).resolve("minecraft:root")


def test_optional_existing_tag_with_missing_required_descendant_is_rejected(tmp_path):
    write_tag(tmp_path, "root", [{"id": "#minecraft:optional", "required": False}])
    write_tag(tmp_path, "optional", ["#minecraft:missing"])

    with pytest.raises(TagResolutionError, match="minecraft:root.*minecraft:optional.*minecraft:missing"):
        TagResolver.from_directory(tmp_path).resolve("minecraft:root")


def test_missing_required_tag_reports_dependency_chain(tmp_path):
    write_tag(tmp_path, "a", ["#minecraft:b"])

    with pytest.raises(TagResolutionError, match="minecraft:a.*minecraft:b"):
        TagResolver.from_directory(tmp_path).resolve("minecraft:a")


def test_cycle_is_rejected(tmp_path):
    write_tag(tmp_path, "a", ["#minecraft:b"])
    write_tag(tmp_path, "b", ["#minecraft:a"])

    with pytest.raises(TagResolutionError, match="cycle"):
        TagResolver.from_directory(tmp_path).resolve("minecraft:a")
