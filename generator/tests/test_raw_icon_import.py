import io
import json
import zipfile

import pytest
from PIL import Image

from mcsr_data.icon_import import IconImportError
from mcsr_data.raw_icon_import import import_raw_icon_archive


def write_catalog(path, item_ids):
    path.write_text(json.dumps({
        "schema_version": 3,
        "items": {item_id: {"name": item_id} for item_id in item_ids},
    }), encoding="utf-8")


def png_bytes(*, size=(16, 16), mode="RGBA"):
    image = Image.new(mode, size, (12, 34, 56, 255) if mode == "RGBA" else (12, 34, 56))
    try:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
    finally:
        image.close()


def write_archive(path, members):
    with zipfile.ZipFile(path, "w") as archive:
        for name, contents in members.items():
            archive.writestr(name, contents)


def test_imports_the_exact_catalog_union_and_writes_a_versioned_manifest(tmp_path):
    search = tmp_path / "search-items.json"
    inventory = tmp_path / "inventory-items.json"
    archive = tmp_path / "icons.zip"
    output = tmp_path / "item-icons"
    write_catalog(search, ["minecraft:stick"])
    write_catalog(inventory, ["minecraft:bucket", "minecraft:stick"])
    write_archive(archive, {
        "stick.png": png_bytes(),
        "bucket.png": png_bytes(),
        "unused_26_2_item.png": png_bytes(),
    })

    import_raw_icon_archive(
        archive,
        search,
        inventory,
        output,
        minecraft_version="26.1.2",
    )

    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert manifest == {
        "schema_version": 1,
        "minecraft_version": "26.1.2",
        "icon_width": 16,
        "icon_height": 16,
        "icons": {
            "minecraft:bucket": "minecraft/bucket.png",
            "minecraft:stick": "minecraft/stick.png",
        },
    }
    assert (output / "minecraft" / "stick.png").read_bytes() == png_bytes()
    assert not (output / "minecraft" / "unused_26_2_item.png").exists()


def test_requires_an_exact_archive_member_for_every_generated_item(tmp_path):
    search = tmp_path / "search-items.json"
    inventory = tmp_path / "inventory-items.json"
    archive = tmp_path / "icons.zip"
    write_catalog(search, ["minecraft:missing"])
    write_catalog(inventory, [])
    write_archive(archive, {"other.png": png_bytes()})

    with pytest.raises(IconImportError, match="missing required icon: minecraft:missing"):
        import_raw_icon_archive(archive, search, inventory, tmp_path / "output", minecraft_version="26.1.2")


def test_rejects_non_native_icon_images(tmp_path):
    search = tmp_path / "search-items.json"
    inventory = tmp_path / "inventory-items.json"
    archive = tmp_path / "icons.zip"
    write_catalog(search, ["minecraft:stick"])
    write_catalog(inventory, [])
    write_archive(archive, {"stick.png": png_bytes(size=(32, 32))})

    with pytest.raises(IconImportError, match="expected a 16x16 or 128x128 RGBA PNG"):
        import_raw_icon_archive(archive, search, inventory, tmp_path / "output", minecraft_version="26.1.2")


def test_downsamples_the_archive_export_size_without_smoothing(tmp_path):
    search = tmp_path / "search-items.json"
    inventory = tmp_path / "inventory-items.json"
    archive = tmp_path / "icons.zip"
    write_catalog(search, ["minecraft:stick"])
    write_catalog(inventory, [])
    write_archive(archive, {"stick.png": png_bytes(size=(128, 128))})

    import_raw_icon_archive(archive, search, inventory, tmp_path / "output", minecraft_version="26.1.2")

    with Image.open(tmp_path / "output" / "minecraft" / "stick.png") as icon:
        assert icon.mode == "RGBA"
        assert icon.size == (16, 16)


def test_uses_an_explicit_icon_override_for_component_variants(tmp_path):
    search = tmp_path / "search-items.json"
    inventory = tmp_path / "inventory-items.json"
    archive = tmp_path / "icons.zip"
    write_catalog(search, ["minecraft:suspicious_stew"])
    write_catalog(inventory, [])
    write_archive(archive, {"suspicious_stew__effect.png": png_bytes()})

    import_raw_icon_archive(
        archive,
        search,
        inventory,
        tmp_path / "output",
        minecraft_version="26.1.2",
        overrides={"minecraft:suspicious_stew": "suspicious_stew__effect.png"},
    )

    assert (tmp_path / "output" / "minecraft" / "suspicious_stew.png").is_file()
