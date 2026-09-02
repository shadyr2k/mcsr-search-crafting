from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from PIL import Image

from mcsr_data.icon_contact_sheet import REPRESENTATIVE_ICONS
from mcsr_data.icon_import import IconImportError, import_icons, required_item_ids


def write_items(path: Path, item_ids: list[str]) -> Path:
    path.write_text(
        json.dumps(
            {
                "schema_version": 3,
                "items": {item_id: {"name": item_id} for item_id in item_ids},
            }
        ),
        encoding="utf-8",
    )
    return path


def write_export(
    root: Path,
    item_ids: list[str],
    *,
    failures: list[str] | None = None,
) -> Path:
    icons: dict[str, dict[str, str]] = {}
    for index, item_id in enumerate(item_ids):
        namespace, item_path = item_id.split(":", 1)
        relative = Path("icons") / namespace / f"{item_path}.png"
        source = root / relative
        source.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (16, 16), (index, 20, 30, 255)).save(source, "PNG")
        icons[item_id] = {
            "path": relative.as_posix(),
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        }
    manifest = {
        "schema_version": 1,
        "minecraft_version": "1.16.1",
        "exporter_version": "1.0.0",
        "icon_width": 16,
        "icon_height": 16,
        "resource_packs": ["vanilla"],
        "icons": icons,
        "failures": [
            {
                "item_id": item_id,
                "exception_class": "RuntimeException",
                "message": "render failed",
            }
            for item_id in failures or []
        ],
    }
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return root


def generated_catalogs(tmp_path: Path) -> tuple[Path, Path]:
    return (
        write_items(
            tmp_path / "search.json", ["minecraft:bed", "minecraft:stick"]
        ),
        write_items(
            tmp_path / "inventory.json", ["minecraft:bucket", "minecraft:stick"]
        ),
    )


def with_representatives(item_ids: list[str]) -> list[str]:
    return sorted(set(item_ids) | {item_id for item_id, _label in REPRESENTATIVE_ICONS})


def tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def test_required_ids_are_sorted_search_inventory_union(tmp_path: Path) -> None:
    search, inventory = generated_catalogs(tmp_path)

    assert required_item_ids(search, inventory) == (
        "minecraft:bed",
        "minecraft:bucket",
        "minecraft:stick",
    )


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"schema_version": True, "items": {}}, "schema_version: expected 3"),
        ({"schema_version": 3, "items": []}, "items: expected object"),
        (
            {"schema_version": 3, "items": {"bad item": {}}},
            "invalid item identifier",
        ),
        (
            {"schema_version": 3, "items": {"..:stick": {}}},
            "invalid item identifier",
        ),
        (
            {"schema_version": 3, "items": {"minecraft:CON": {}}},
            "invalid item identifier",
        ),
    ],
)
def test_required_ids_reject_malformed_catalogs(
    tmp_path: Path, payload: object, message: str
) -> None:
    bad = tmp_path / "bad.json"
    good = write_items(tmp_path / "good.json", [])
    bad.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(IconImportError, match=message):
        required_item_ids(bad, good)


def test_import_publishes_exact_required_subset_and_ignores_extra(
    tmp_path: Path,
) -> None:
    search, inventory = generated_catalogs(tmp_path)
    export = write_export(
        tmp_path / "export",
        with_representatives(
            [
                "minecraft:bed",
                "minecraft:bucket",
                "minecraft:stick",
                "minecraft:unexpected",
            ]
        ),
    )
    output = tmp_path / "item-icons"

    import_icons(export, search, inventory, output, tmp_path / "contact.png")

    manifest_bytes = (output / "manifest.json").read_bytes()
    assert manifest_bytes.endswith(b"\n")
    manifest = json.loads(manifest_bytes)
    assert manifest == {
        "schema_version": 1,
        "minecraft_version": "1.16.1",
        "icon_width": 16,
        "icon_height": 16,
        "icons": {
            "minecraft:bed": "minecraft/bed.png",
            "minecraft:bucket": "minecraft/bucket.png",
            "minecraft:stick": "minecraft/stick.png",
        },
    }
    assert set(tree_bytes(output)) == {
        "manifest.json",
        "minecraft/bed.png",
        "minecraft/bucket.png",
        "minecraft/stick.png",
    }
    assert not (output / "minecraft" / "unexpected.png").exists()


def test_failed_import_preserves_existing_output(tmp_path: Path) -> None:
    search, inventory = generated_catalogs(tmp_path)
    export = write_export(
        tmp_path / "export", ["minecraft:bed", "minecraft:stick"]
    )
    output = tmp_path / "item-icons"
    output.mkdir()
    (output / "marker.txt").write_text("accepted", encoding="utf-8")
    before = tree_bytes(output)

    with pytest.raises(IconImportError, match="missing required icon: minecraft:bucket"):
        import_icons(export, search, inventory, output, tmp_path / "contact.png")

    assert tree_bytes(output) == before


def test_required_failure_record_preserves_existing_output(tmp_path: Path) -> None:
    search = write_items(tmp_path / "search.json", ["minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(
        tmp_path / "export", [], failures=["minecraft:stick"]
    )
    output = tmp_path / "item-icons"
    output.mkdir()
    (output / "marker.txt").write_text("accepted", encoding="utf-8")

    with pytest.raises(
        IconImportError, match="required icon failed to export: minecraft:stick"
    ):
        import_icons(export, search, inventory, output, tmp_path / "contact.png")

    assert (output / "marker.txt").read_text(encoding="utf-8") == "accepted"


def test_repeated_import_is_byte_deterministic_and_removes_stale_files(
    tmp_path: Path,
) -> None:
    search = write_items(tmp_path / "search.json", ["minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(
        tmp_path / "export", with_representatives(["minecraft:stick"])
    )
    first = tmp_path / "first"
    second = tmp_path / "second"

    import_icons(export, search, inventory, first, tmp_path / "first-contact.png")
    second.mkdir()
    (second / "stale.txt").write_text("stale", encoding="utf-8")
    import_icons(export, search, inventory, second, tmp_path / "second-contact.png")

    assert tree_bytes(first) == tree_bytes(second)
    assert (tmp_path / "first-contact.png").read_bytes() == (
        tmp_path / "second-contact.png"
    ).read_bytes()


@pytest.mark.parametrize(
    "relationship", ["output_in_export", "contact_in_output", "output_over_catalog"]
)
def test_rejects_unsafe_destinations(tmp_path: Path, relationship: str) -> None:
    search = write_items(tmp_path / "search.json", [])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(tmp_path / "export", [])
    if relationship == "output_in_export":
        output = export / "published"
        contact = tmp_path / "contact.png"
    elif relationship == "contact_in_output":
        output = tmp_path / "item-icons"
        contact = output / "contact.png"
    else:
        output = tmp_path
        contact = tmp_path.parent / "contact.png"

    with pytest.raises(IconImportError, match="destination"):
        import_icons(export, search, inventory, output, contact)


def test_publication_rename_failure_restores_existing_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import mcsr_data.icon_import as module

    search = write_items(tmp_path / "search.json", ["minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(
        tmp_path / "export", with_representatives(["minecraft:stick"])
    )
    output = tmp_path / "item-icons"
    output.mkdir()
    (output / "marker.txt").write_text("accepted", encoding="utf-8")
    before = tree_bytes(output)
    real_replace = module.os.replace
    failed = False

    def fail_staging_publication(source: str | Path, destination: str | Path) -> None:
        nonlocal failed
        if not failed and ".staging-" in Path(source).name and Path(destination) == output:
            failed = True
            raise OSError("simulated publication failure")
        real_replace(source, destination)

    monkeypatch.setattr(module.os, "replace", fail_staging_publication)

    with pytest.raises(IconImportError, match="simulated publication failure"):
        import_icons(export, search, inventory, output, tmp_path / "contact.png")

    assert tree_bytes(output) == before


def test_staged_copy_corruption_preserves_existing_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import mcsr_data.icon_import as module

    search = write_items(tmp_path / "search.json", ["minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(
        tmp_path / "export", with_representatives(["minecraft:stick"])
    )
    output = tmp_path / "item-icons"
    output.mkdir()
    (output / "marker.txt").write_text("accepted", encoding="utf-8")
    real_copy = module.shutil.copyfile

    def corrupt_copy(source: str | Path, destination: str | Path) -> str:
        result = real_copy(source, destination)
        if Path(destination).name == "stick.png":
            Path(destination).write_bytes(b"corrupt")
        return result

    monkeypatch.setattr(module.shutil, "copyfile", corrupt_copy)

    with pytest.raises(IconImportError, match="staged icon bytes changed"):
        import_icons(export, search, inventory, output, tmp_path / "contact.png")

    assert (output / "marker.txt").read_text(encoding="utf-8") == "accepted"


def test_cli_imports_and_reports_paths(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from mcsr_data.icon_import import main

    search = write_items(tmp_path / "search.json", ["minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", [])
    export = write_export(
        tmp_path / "export", with_representatives(["minecraft:stick"])
    )
    output = tmp_path / "item-icons"
    contact = tmp_path / "contact.png"

    main(
        [
            "--export",
            str(export),
            "--search-items",
            str(search),
            "--inventory-items",
            str(inventory),
            "--output",
            str(output),
            "--contact-sheet",
            str(contact),
        ]
    )

    captured = capsys.readouterr().out
    assert "Imported 1 required icons" in captured
    assert str(output) in captured
    assert str(contact) in captured
