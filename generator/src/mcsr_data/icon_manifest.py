from __future__ import annotations

import hashlib
import io
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from types import MappingProxyType
from typing import Mapping

from PIL import Image, UnidentifiedImageError


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ITEM_ID_PATTERN = re.compile(r"[a-z0-9_.-]+:[a-z0-9/._-]+\Z")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
DRIVE_PATTERN = re.compile(r"[A-Za-z]:")
TOP_LEVEL_FIELDS = frozenset(
    {
        "schema_version",
        "minecraft_version",
        "exporter_version",
        "icon_width",
        "icon_height",
        "resource_packs",
        "icons",
        "failures",
    }
)
ICON_FIELDS = frozenset({"path", "sha256"})
FAILURE_FIELDS = frozenset({"item_id", "exception_class", "message"})


class IconManifestError(ValueError):
    """Raised when an icon export contains one or more validation errors."""


@dataclass(frozen=True)
class ExportIcon:
    item_id: str
    relative_path: PurePosixPath
    sha256: str


@dataclass(frozen=True)
class ValidatedExport:
    root: Path
    minecraft_version: str
    width: int
    height: int
    icons: Mapping[str, ExportIcon]
    failed_item_ids: frozenset[str]


class _JSONObject(dict[str, object]):
    def __init__(self, pairs: list[tuple[str, object]]) -> None:
        super().__init__()
        self.duplicate_fields: list[str] = []
        for key, value in pairs:
            if key in self:
                self.duplicate_fields.append(key)
            self[key] = value


class _Diagnostics:
    def __init__(self) -> None:
        self._messages: list[str] = []

    def add(self, path: str, message: str) -> None:
        self._messages.append(f"{path}: {message}")

    def raise_if_any(self) -> None:
        if self._messages:
            raise IconManifestError("\n".join(sorted(self._messages)))


def load_export_manifest(export_root: Path) -> ValidatedExport:
    diagnostics = _Diagnostics()
    root = Path(export_root)
    if not root.is_dir():
        diagnostics.add("export root", "expected directory")
        diagnostics.raise_if_any()
    if root.is_symlink():
        diagnostics.add("export root", "symlink is not allowed")
        diagnostics.raise_if_any()
    root = root.resolve()

    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        diagnostics.add("manifest.json", "file does not exist")
        diagnostics.raise_if_any()
    if manifest_path.is_symlink():
        diagnostics.add("manifest.json", "symlink is not allowed")
        diagnostics.raise_if_any()

    try:
        raw = json.loads(
            manifest_path.read_text(encoding="utf-8"),
            object_pairs_hook=_JSONObject,
        )
    except (OSError, UnicodeError, json.JSONDecodeError):
        diagnostics.add("manifest.json", "invalid JSON")
        diagnostics.raise_if_any()

    if not isinstance(raw, dict):
        diagnostics.add("manifest.json", "expected object")
        diagnostics.raise_if_any()

    _validate_object_fields(raw, TOP_LEVEL_FIELDS, "", diagnostics)
    schema_version = _integer_field(raw, "schema_version", diagnostics)
    if schema_version is not None and schema_version != 1:
        diagnostics.add("schema_version", "expected 1")

    minecraft_version = _string_field(raw, "minecraft_version", diagnostics)
    if minecraft_version is not None and minecraft_version != "1.16.1":
        diagnostics.add("minecraft_version", "expected 1.16.1")

    _string_field(raw, "exporter_version", diagnostics)

    width = _integer_field(raw, "icon_width", diagnostics)
    if width is not None and width != 16:
        diagnostics.add("icon_width", "expected 16")

    height = _integer_field(raw, "icon_height", diagnostics)
    if height is not None and height != 16:
        diagnostics.add("icon_height", "expected 16")

    _validate_resource_packs(raw, diagnostics)

    icons = _validate_icons(raw, root, diagnostics)
    failed_item_ids = _validate_failures(raw, set(icons), diagnostics)
    diagnostics.raise_if_any()

    return ValidatedExport(
        root=root,
        minecraft_version=minecraft_version,
        width=width,
        height=height,
        icons=MappingProxyType(dict(sorted(icons.items()))),
        failed_item_ids=frozenset(failed_item_ids),
    )


def _validate_object_fields(
    raw: dict[str, object],
    expected: frozenset[str],
    prefix: str,
    diagnostics: _Diagnostics,
) -> None:
    if isinstance(raw, _JSONObject):
        for field in raw.duplicate_fields:
            path = f"{prefix}.{field}" if prefix else f"manifest.json.{field}"
            diagnostics.add(path, "duplicate field")
    for field in raw.keys() - expected:
        path = f"{prefix}.{field}" if prefix else field
        diagnostics.add(path, "unknown field")
    for field in expected - raw.keys():
        path = f"{prefix}.{field}" if prefix else field
        diagnostics.add(path, "missing field")


def _integer_field(
    raw: dict[str, object],
    field: str,
    diagnostics: _Diagnostics,
) -> int | None:
    if field not in raw:
        return None
    value = raw[field]
    if isinstance(value, bool) or not isinstance(value, int):
        diagnostics.add(field, "expected integer")
        return None
    return value


def _string_field(
    raw: dict[str, object],
    field: str,
    diagnostics: _Diagnostics,
) -> str | None:
    if field not in raw:
        return None
    value = raw[field]
    if not isinstance(value, str):
        diagnostics.add(field, "expected string")
        return None
    return value


def _validate_resource_packs(
    raw: dict[str, object], diagnostics: _Diagnostics
) -> None:
    if "resource_packs" not in raw:
        return
    resource_packs = raw["resource_packs"]
    if not isinstance(resource_packs, list):
        diagnostics.add("resource_packs", "expected array")
        return
    types_valid = True
    for index, resource_pack in enumerate(resource_packs):
        if not isinstance(resource_pack, str):
            diagnostics.add(f"resource_packs[{index}]", "expected string")
            types_valid = False
    if types_valid and resource_packs != ["vanilla"]:
        diagnostics.add("resource_packs", "expected exactly vanilla")


def _validate_icons(
    raw: dict[str, object], root: Path, diagnostics: _Diagnostics
) -> dict[str, ExportIcon]:
    if "icons" not in raw:
        return {}
    raw_icons = raw["icons"]
    if not isinstance(raw_icons, dict):
        diagnostics.add("icons", "expected object")
        return {}
    if isinstance(raw_icons, _JSONObject):
        for item_id in raw_icons.duplicate_fields:
            diagnostics.add(f"icons.{item_id}", "duplicate item identifier")

    icons: dict[str, ExportIcon] = {}
    normalized_paths: dict[str, str] = {}
    for item_id, record in raw_icons.items():
        icon_prefix = f"icons.{item_id}"
        identifier_valid = _validate_identifier(item_id, icon_prefix, diagnostics)
        if not isinstance(record, dict):
            diagnostics.add(icon_prefix, "expected object")
            continue
        _validate_object_fields(record, ICON_FIELDS, icon_prefix, diagnostics)

        path_value = _nested_string_field(record, "path", icon_prefix, diagnostics)
        sha256 = _nested_string_field(record, "sha256", icon_prefix, diagnostics)
        hash_valid = sha256 is not None and SHA256_PATTERN.fullmatch(sha256) is not None
        if sha256 is not None and not hash_valid:
            diagnostics.add(
                f"{icon_prefix}.sha256",
                "expected 64 lower-case hexadecimal characters",
            )

        relative_path = None
        source_path = None
        if path_value is not None:
            relative_path, source_path = _validate_path(
                path_value, root, f"{icon_prefix}.path", diagnostics
            )
            if source_path is not None:
                normalized = os.path.normcase(str(source_path.resolve(strict=False)))
                prior_item_id = normalized_paths.get(normalized)
                if prior_item_id is not None:
                    diagnostics.add(
                        f"{icon_prefix}.path",
                        f"duplicate normalized path also used by {prior_item_id}",
                    )
                else:
                    normalized_paths[normalized] = item_id

        if source_path is not None and hash_valid:
            _validate_source_image(source_path, sha256, icon_prefix, diagnostics)

        if identifier_valid and relative_path is not None and hash_valid:
            icons[item_id] = ExportIcon(item_id, relative_path, sha256)
    return icons


def _validate_failures(
    raw: dict[str, object],
    icon_ids: set[str],
    diagnostics: _Diagnostics,
) -> set[str]:
    if "failures" not in raw:
        return set()
    raw_failures = raw["failures"]
    if not isinstance(raw_failures, list):
        diagnostics.add("failures", "expected array")
        return set()

    failed_ids: set[str] = set()
    for index, record in enumerate(raw_failures):
        prefix = f"failures[{index}]"
        if not isinstance(record, dict):
            diagnostics.add(prefix, "expected object")
            continue
        _validate_object_fields(record, FAILURE_FIELDS, prefix, diagnostics)
        item_id = _nested_string_field(record, "item_id", prefix, diagnostics)
        _nested_string_field(record, "exception_class", prefix, diagnostics)
        _nested_string_field(record, "message", prefix, diagnostics)
        if item_id is None or not _validate_identifier(
            item_id, f"{prefix}.item_id", diagnostics
        ):
            continue
        if item_id in icon_ids:
            diagnostics.add(f"{prefix}.item_id", "item also appears in icons")
        failed_ids.add(item_id)
    return failed_ids


def _nested_string_field(
    raw: dict[str, object],
    field: str,
    prefix: str,
    diagnostics: _Diagnostics,
) -> str | None:
    if field not in raw:
        return None
    value = raw[field]
    if not isinstance(value, str):
        diagnostics.add(f"{prefix}.{field}", "expected string")
        return None
    return value


def _validate_identifier(
    item_id: object, path: str, diagnostics: _Diagnostics
) -> bool:
    if not isinstance(item_id, str):
        diagnostics.add(path, "item identifier must be a string")
        return False
    if ITEM_ID_PATTERN.fullmatch(item_id) is None:
        diagnostics.add(path, "invalid item identifier")
        return False
    namespace, item_path = item_id.split(":", 1)
    if any(segment in {"", ".", ".."} for segment in item_path.split("/")):
        diagnostics.add(path, "invalid item identifier")
        return False
    return bool(namespace)


def _validate_path(
    value: str,
    root: Path,
    diagnostic_path: str,
    diagnostics: _Diagnostics,
) -> tuple[PurePosixPath | None, Path | None]:
    if value.startswith("//") or value.startswith("\\\\"):
        diagnostics.add(diagnostic_path, "UNC path is not allowed")
        return None, None
    if DRIVE_PATTERN.match(value):
        diagnostics.add(diagnostic_path, "drive path is not allowed")
        return None, None
    if value.startswith("/"):
        diagnostics.add(diagnostic_path, "absolute path is not allowed")
        return None, None
    if "\\" in value:
        diagnostics.add(diagnostic_path, "backslash is not allowed")
        return None, None

    segments = value.split("/")
    if "" in segments:
        diagnostics.add(diagnostic_path, "empty path segment is not allowed")
        return None, None
    if ".." in segments:
        diagnostics.add(diagnostic_path, "path escapes export root")
        return None, None
    if "." in segments:
        diagnostics.add(diagnostic_path, "dot path segment is not allowed")
        return None, None

    source_path = root.joinpath(*segments)
    try:
        source_path.resolve(strict=False).relative_to(root)
    except ValueError:
        diagnostics.add(diagnostic_path, "path escapes export root")
        return None, None

    current = root
    for segment in segments:
        current = current / segment
        if current.is_symlink():
            diagnostics.add(diagnostic_path, "symlink is not allowed")
            return None, None

    return PurePosixPath(value), source_path


def _validate_source_image(
    source_path: Path,
    expected_sha256: str,
    icon_prefix: str,
    diagnostics: _Diagnostics,
) -> None:
    if not source_path.is_file():
        diagnostics.add(f"{icon_prefix}.path", "source file does not exist")
        return
    try:
        source_bytes = source_path.read_bytes()
    except OSError:
        diagnostics.add(f"{icon_prefix}.path", "source file could not be read")
        return

    actual_sha256 = hashlib.sha256(source_bytes).hexdigest()
    if actual_sha256 != expected_sha256:
        diagnostics.add(f"{icon_prefix}.sha256", "source bytes do not match")

    if not source_bytes.startswith(PNG_SIGNATURE):
        diagnostics.add(f"{icon_prefix}.path", "source file has invalid PNG signature")
        return

    try:
        with Image.open(io.BytesIO(source_bytes)) as image:
            image.load()
            if image.format != "PNG":
                diagnostics.add(f"{icon_prefix}.path", "source image format: expected PNG")
            if image.mode != "RGBA":
                diagnostics.add(f"{icon_prefix}.path", "source image mode: expected RGBA")
            if image.size != (16, 16):
                diagnostics.add(f"{icon_prefix}.path", "source image size: expected 16x16")
    except (OSError, ValueError, UnidentifiedImageError):
        diagnostics.add(f"{icon_prefix}.path", "source image: invalid PNG")
