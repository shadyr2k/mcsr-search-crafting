from __future__ import annotations

import copy
import hashlib
import json
import shutil
import struct
import zlib
from pathlib import Path

import pytest
from PIL import Image

from mcsr_data.icon_manifest import IconManifestError, load_export_manifest


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "icon_export"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@pytest.fixture
def valid_manifest() -> dict[str, object]:
    return json.loads((FIXTURE_ROOT / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture
def valid_export(tmp_path: Path) -> Path:
    export_root = tmp_path / "export"
    shutil.copytree(FIXTURE_ROOT, export_root)
    return export_root


def write_manifest(export_root: Path, raw: object) -> None:
    export_root.mkdir(parents=True, exist_ok=True)
    (export_root / "manifest.json").write_text(
        json.dumps(raw, indent=2) + "\n",
        encoding="utf-8",
    )


def write_rgba_png(path: Path, size: tuple[int, int] = (16, 16)) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", size, (10, 20, 30, 40)).save(path, format="PNG")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_with_dimensions(width: int, height: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return PNG_SIGNATURE + chunk(b"IHDR", header) + chunk(b"IEND", b"")


def error_lines(export_root: Path) -> list[str]:
    with pytest.raises(IconManifestError) as caught:
        load_export_manifest(export_root)
    return str(caught.value).splitlines()


def test_loads_valid_export_fixture(valid_export: Path) -> None:
    validated = load_export_manifest(valid_export)

    assert validated.root == valid_export.resolve()
    assert validated.minecraft_version == "1.16.1"
    assert validated.width == 16
    assert validated.height == 16
    assert tuple(validated.icons) == ("minecraft:stick",)
    assert validated.icons["minecraft:stick"].relative_path.as_posix() == (
        "icons/minecraft/stick.png"
    )
    assert validated.failed_item_ids == frozenset()


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("schema_version", 2, "schema_version: expected 1"),
        ("schema_version", True, "schema_version: expected integer"),
        ("minecraft_version", "1.16.2", "minecraft_version: expected 1.16.1"),
        ("minecraft_version", 1161, "minecraft_version: expected string"),
        ("exporter_version", 1, "exporter_version: expected string"),
        ("icon_width", 32, "icon_width: expected 16"),
        ("icon_width", True, "icon_width: expected integer"),
        ("icon_height", 8, "icon_height: expected 16"),
        ("icon_height", False, "icon_height: expected integer"),
        (
            "resource_packs",
            ["vanilla", "custom"],
            "resource_packs: expected exactly vanilla",
        ),
        ("resource_packs", "vanilla", "resource_packs: expected array"),
        ("icons", [], "icons: expected object"),
        ("failures", {}, "failures: expected array"),
    ],
)
def test_rejects_invalid_manifest_metadata(
    valid_manifest: dict[str, object],
    field: str,
    value: object,
    message: str,
    tmp_path: Path,
) -> None:
    valid_manifest[field] = value
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("target", "field", "message"),
    [
        ("manifest", "surprise", "surprise: unknown field"),
        (
            "icon",
            "surprise",
            "icons.minecraft:stick.surprise: unknown field",
        ),
        ("failure", "surprise", "failures[0].surprise: unknown field"),
    ],
)
def test_rejects_unknown_fields_at_every_object_level(
    valid_manifest: dict[str, object],
    target: str,
    field: str,
    message: str,
    tmp_path: Path,
) -> None:
    if target == "manifest":
        valid_manifest[field] = "unexpected"
    elif target == "icon":
        valid_manifest["icons"]["minecraft:stick"][field] = "unexpected"  # type: ignore[index]
    else:
        valid_manifest["failures"] = [
            {
                "item_id": "minecraft:apple",
                "exception_class": "RuntimeException",
                "message": "render failed",
                field: "unexpected",
            }
        ]
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            lambda raw: raw["icons"].__setitem__("Stick", raw["icons"].pop("minecraft:stick")),
            "icons.Stick: invalid item identifier",
        ),
        (
            lambda raw: raw["icons"].__setitem__("minecraft:bad path", raw["icons"].pop("minecraft:stick")),
            "icons.minecraft:bad path: invalid item identifier",
        ),
    ],
)
def test_rejects_invalid_icon_identifiers(
    valid_manifest: dict[str, object],
    mutation,
    message: str,
    tmp_path: Path,
) -> None:
    mutation(valid_manifest)
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("record", "message"),
    [
        ("not-an-object", "icons.minecraft:stick: expected object"),
        (
            {"sha256": "a" * 64},
            "icons.minecraft:stick.path: missing field",
        ),
        (
            {"path": "icons/minecraft/stick.png"},
            "icons.minecraft:stick.sha256: missing field",
        ),
        (
            {"path": 3, "sha256": "a" * 64},
            "icons.minecraft:stick.path: expected string",
        ),
        (
            {"path": "icons/minecraft/stick.png", "sha256": 3},
            "icons.minecraft:stick.sha256: expected string",
        ),
    ],
)
def test_rejects_invalid_icon_record_shapes(
    valid_manifest: dict[str, object],
    record: object,
    message: str,
    tmp_path: Path,
) -> None:
    valid_manifest["icons"]["minecraft:stick"] = record  # type: ignore[index]
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("path", "message"),
    [
        ("/icons/minecraft/stick.png", "absolute path is not allowed"),
        ("C:/icons/minecraft/stick.png", "drive path is not allowed"),
        ("//server/share/stick.png", "UNC path is not allowed"),
        ("icons\\minecraft\\stick.png", "backslash is not allowed"),
        ("icons//minecraft/stick.png", "empty path segment is not allowed"),
        ("icons/minecraft/./stick.png", "dot path segment is not allowed"),
        ("icons/minecraft/../stick.png", "path escapes export root"),
    ],
)
def test_rejects_unsafe_icon_paths(
    valid_manifest: dict[str, object],
    path: str,
    message: str,
    tmp_path: Path,
) -> None:
    valid_manifest["icons"]["minecraft:stick"]["path"] = path  # type: ignore[index]
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("path", "message"),
    [
        ("icons/minecraft/C:/stick.png", "colon is not allowed"),
        ("icons/minecraft/stick.png.", "path segment cannot end with dot or space"),
        ("icons/minecraft/stick.png ", "path segment cannot end with dot or space"),
        ("icons/minecraft/stick.png::$DATA", "colon is not allowed"),
        ("icons/minecraft/CON.png", "reserved Windows device name is not allowed"),
        ("icons/minecraft/lpt9.icon", "reserved Windows device name is not allowed"),
    ],
)
def test_rejects_windows_path_aliases(
    valid_export: Path,
    path: str,
    message: str,
) -> None:
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["path"] = path
    write_manifest(valid_export, raw)

    assert any(message in line for line in error_lines(valid_export))


def test_rejects_duplicate_normalized_paths(
    valid_manifest: dict[str, object],
    tmp_path: Path,
) -> None:
    valid_manifest["icons"]["minecraft:apple"] = copy.deepcopy(  # type: ignore[index]
        valid_manifest["icons"]["minecraft:stick"]  # type: ignore[index]
    )
    write_manifest(tmp_path, valid_manifest)

    assert any(
        "icons.minecraft:apple.path: duplicate normalized path" in line
        for line in error_lines(tmp_path)
    )


def test_rejects_symlinked_icon_path(valid_export: Path) -> None:
    source = valid_export / "icons" / "minecraft" / "stick.png"
    target = valid_export / "real-stick.png"
    source.replace(target)
    try:
        source.symlink_to(target)
    except OSError as error:
        pytest.skip(f"symlinks unavailable: {error}")

    assert any(
        "icons.minecraft:stick.path: symlink is not allowed" in line
        for line in error_lines(valid_export)
    )


@pytest.mark.parametrize(
    ("sha256", "message"),
    [
        ("A" * 64, "sha256: expected 64 lower-case hexadecimal characters"),
        ("a" * 63, "sha256: expected 64 lower-case hexadecimal characters"),
        ("z" * 64, "sha256: expected 64 lower-case hexadecimal characters"),
    ],
)
def test_rejects_malformed_sha256(
    valid_manifest: dict[str, object],
    sha256: str,
    message: str,
    tmp_path: Path,
) -> None:
    valid_manifest["icons"]["minecraft:stick"]["sha256"] = sha256  # type: ignore[index]
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


@pytest.mark.parametrize(
    ("source_problem", "source_messages"),
    [
        ("missing", ["source file does not exist"]),
        ("signature", ["source file has invalid PNG signature"]),
        (
            "metadata",
            [
                "source image mode: expected RGBA",
                "source image size: expected 16x16",
            ],
        ),
    ],
)
def test_malformed_sha_does_not_suppress_source_diagnostics(
    valid_export: Path,
    source_problem: str,
    source_messages: list[str],
) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    if source_problem == "missing":
        path.unlink()
    elif source_problem == "signature":
        path.write_bytes(b"not png data")
    else:
        Image.new("RGB", (15, 16), (10, 20, 30)).save(path, format="PNG")
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = "BAD"
    write_manifest(valid_export, raw)

    lines = error_lines(valid_export)

    assert any(
        "sha256: expected 64 lower-case hexadecimal characters" in line
        for line in lines
    )
    for message in source_messages:
        assert any(message in line for line in lines)
    assert not any("source bytes do not match" in line for line in lines)


def test_rejects_missing_icon_file(valid_export: Path) -> None:
    (valid_export / "icons" / "minecraft" / "stick.png").unlink()

    assert any("source file does not exist" in line for line in error_lines(valid_export))


def test_rejects_wrong_hash(valid_export: Path) -> None:
    manifest_path = valid_export / "manifest.json"
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = "0" * 64
    write_manifest(valid_export, raw)

    assert any("sha256: source bytes do not match" in line for line in error_lines(valid_export))


def test_rejects_bad_png_signature(valid_export: Path) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    path.write_bytes(b"not png data")
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    write_manifest(valid_export, raw)

    assert any("source file has invalid PNG signature" in line for line in error_lines(valid_export))


def test_rejects_png_with_wrong_dimensions(valid_export: Path) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    sha256 = write_rgba_png(path, size=(15, 16))
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = sha256
    write_manifest(valid_export, raw)

    assert any("source image size: expected 16x16" in line for line in error_lines(valid_export))


def test_rejects_png_without_rgba_mode(valid_export: Path) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    Image.new("RGB", (16, 16), (10, 20, 30)).save(path, format="PNG")
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    write_manifest(valid_export, raw)

    assert any("source image mode: expected RGBA" in line for line in error_lines(valid_export))


def test_rejects_non_png_image_with_png_signature(valid_export: Path) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    path.write_bytes(PNG_SIGNATURE + b"not a decodable image")
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    write_manifest(valid_export, raw)

    assert any("source image: invalid PNG" in line for line in error_lines(valid_export))


@pytest.mark.parametrize("size", [(10_000, 10_000), (100_000, 100_000)])
def test_reports_decompression_bomb_as_manifest_diagnostic(
    valid_export: Path,
    size: tuple[int, int],
) -> None:
    path = valid_export / "icons" / "minecraft" / "stick.png"
    path.write_bytes(png_with_dimensions(*size))
    raw = json.loads((valid_export / "manifest.json").read_text(encoding="utf-8"))
    raw["icons"]["minecraft:stick"]["sha256"] = hashlib.sha256(
        path.read_bytes()
    ).hexdigest()
    write_manifest(valid_export, raw)

    assert any(
        "source image size: exceeds Pillow safety limit" in line
        for line in error_lines(valid_export)
    )


@pytest.mark.parametrize(
    ("failure", "message"),
    [
        ("bad", "failures[0]: expected object"),
        (
            {"exception_class": "RuntimeException", "message": "failed"},
            "failures[0].item_id: missing field",
        ),
        (
            {"item_id": 3, "exception_class": "RuntimeException", "message": "failed"},
            "failures[0].item_id: expected string",
        ),
        (
            {"item_id": "Stick", "exception_class": "RuntimeException", "message": "failed"},
            "failures[0].item_id: invalid item identifier",
        ),
        (
            {"item_id": "minecraft:apple", "exception_class": 3, "message": "failed"},
            "failures[0].exception_class: expected string",
        ),
        (
            {"item_id": "minecraft:apple", "exception_class": "RuntimeException", "message": 3},
            "failures[0].message: expected string",
        ),
    ],
)
def test_rejects_invalid_failure_record_shapes(
    valid_manifest: dict[str, object],
    failure: object,
    message: str,
    tmp_path: Path,
) -> None:
    valid_manifest["failures"] = [failure]
    write_manifest(tmp_path, valid_manifest)

    assert any(message in line for line in error_lines(tmp_path))


def test_rejects_item_present_in_icons_and_failures(
    valid_manifest: dict[str, object],
    tmp_path: Path,
) -> None:
    valid_manifest["failures"] = [
        {
            "item_id": "minecraft:stick",
            "exception_class": "RuntimeException",
            "message": "render failed",
        }
    ]
    write_manifest(tmp_path, valid_manifest)

    assert any(
        "failures[0].item_id: item also appears in icons" in line
        for line in error_lines(tmp_path)
    )


def test_rejects_overlap_when_declared_icon_record_is_invalid(
    valid_manifest: dict[str, object],
    tmp_path: Path,
) -> None:
    valid_manifest["icons"]["minecraft:stick"] = {  # type: ignore[index]
        "path": "../stick.png",
        "sha256": "BAD",
    }
    valid_manifest["failures"] = [
        {
            "item_id": "minecraft:stick",
            "exception_class": "RuntimeException",
            "message": "render failed",
        }
    ]
    write_manifest(tmp_path, valid_manifest)

    lines = error_lines(tmp_path)

    assert any("path escapes export root" in line for line in lines)
    assert any(
        "sha256: expected 64 lower-case hexadecimal characters" in line
        for line in lines
    )
    assert any(
        "failures[0].item_id: item also appears in icons" in line
        for line in lines
    )


def test_collects_all_diagnostics_in_lexical_path_order(
    valid_export: Path,
) -> None:
    valid_manifest = json.loads(
        (valid_export / "manifest.json").read_text(encoding="utf-8")
    )
    valid_manifest["z_unknown"] = True
    valid_manifest["a_unknown"] = True
    valid_manifest["schema_version"] = False
    valid_manifest["icon_width"] = 20
    write_manifest(valid_export, valid_manifest)

    lines = error_lines(valid_export)

    assert len(lines) == 4
    assert lines == sorted(lines)


def test_rejects_missing_and_malformed_manifest(tmp_path: Path) -> None:
    assert error_lines(tmp_path) == ["manifest.json: file does not exist"]

    (tmp_path / "manifest.json").write_text("not json", encoding="utf-8")
    assert error_lines(tmp_path) == ["manifest.json: invalid JSON"]


def test_rejects_non_object_manifest(tmp_path: Path) -> None:
    write_manifest(tmp_path, [])

    assert error_lines(tmp_path) == ["manifest.json: expected object"]


def test_rejects_non_directory_export_root(tmp_path: Path) -> None:
    export_file = tmp_path / "export"
    export_file.write_text("not a directory", encoding="utf-8")

    assert error_lines(export_file) == ["export root: expected directory"]


def test_rejects_duplicate_json_object_keys(tmp_path: Path) -> None:
    (tmp_path / "manifest.json").write_text(
        '{"schema_version": 1, "schema_version": 1}',
        encoding="utf-8",
    )

    assert any(
        "manifest.json.schema_version: duplicate field" in line
        for line in error_lines(tmp_path)
    )


def test_rejects_duplicate_icon_identifiers_in_json(valid_export: Path) -> None:
    (valid_export / "manifest.json").write_text(
        """{
  "schema_version": 1,
  "minecraft_version": "1.16.1",
  "exporter_version": "1.0.0",
  "icon_width": 16,
  "icon_height": 16,
  "resource_packs": ["vanilla"],
  "icons": {
    "minecraft:stick": {
      "path": "icons/minecraft/stick.png",
      "sha256": "1827d7f083780363ba4bb221f77058a261673389757b256921e08f010b55285d"
    },
    "minecraft:stick": {
      "path": "icons/minecraft/stick.png",
      "sha256": "1827d7f083780363ba4bb221f77058a261673389757b256921e08f010b55285d"
    }
  },
  "failures": []
}
""",
        encoding="utf-8",
    )

    assert any(
        "icons.minecraft:stick: duplicate item identifier" in line
        for line in error_lines(valid_export)
    )


def test_rejects_path_through_symlinked_directory(valid_export: Path) -> None:
    icons = valid_export / "icons"
    real_icons = valid_export / "real-icons"
    icons.replace(real_icons)
    try:
        icons.symlink_to(real_icons, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlinks unavailable: {error}")

    assert any(
        "icons.minecraft:stick.path: symlink is not allowed" in line
        for line in error_lines(valid_export)
    )


def test_diagnostic_paths_are_independent_of_mapping_insertion_order(
    valid_manifest: dict[str, object],
    tmp_path: Path,
) -> None:
    stick = valid_manifest["icons"].pop("minecraft:stick")  # type: ignore[union-attr]
    valid_manifest["icons"] = {
        "minecraft:zeta": {"path": 4, "sha256": 5},
        "minecraft:alpha": stick,
    }
    write_manifest(tmp_path, valid_manifest)

    lines = error_lines(tmp_path)

    assert lines == sorted(lines)
