"""Publish the exact generated item set from a flat archive of native PNGs."""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Mapping, Sequence

from PIL import Image, UnidentifiedImageError

from .icon_import import IconImportError, required_item_ids


# The recipe result carries effect components, but the runtime catalog stores
# its item ID only.  The archive has one rendered image per effect, so use one
# deterministic representative until result components are modeled.
ARCHIVE_ICON_OVERRIDES: Mapping[str, str] = {
    "minecraft:suspicious_stew": "suspicious_stew__1c0f0534.png",
}


def import_raw_icon_archive(
    archive_path: Path,
    search_items_path: Path,
    inventory_items_path: Path,
    output_root: Path,
    *,
    minecraft_version: str,
    overrides: Mapping[str, str] = ARCHIVE_ICON_OVERRIDES,
) -> None:
    """Validate and publish the exact search/inventory icon union atomically."""
    archive = Path(archive_path)
    if not archive.is_file():
        raise IconImportError(f"{archive}: icon archive does not exist")
    output = _safe_output(Path(output_root))
    required = required_item_ids(search_items_path, inventory_items_path)

    try:
        with zipfile.ZipFile(archive) as source:
            archive_names = _flat_png_names(source)
            selected = _select_archive_members(required, archive_names, overrides)
            staging = Path(tempfile.mkdtemp(dir=output.parent, prefix=f".{output.name}.staging-"))
            try:
                manifest = _stage_icons(source, required, selected, staging, minecraft_version)
                _publish_directory(staging, output)
            except Exception:
                shutil.rmtree(staging, ignore_errors=True)
                raise
    except (OSError, zipfile.BadZipFile) as error:
        raise IconImportError(f"{archive}: could not read icon archive: {error}") from error


def _safe_output(output_root: Path) -> Path:
    output = output_root.parent.resolve() / output_root.name
    if not output.name or output.is_symlink() or (output.exists() and not output.is_dir()):
        raise IconImportError("output destination must be a real directory or absent")
    output.parent.mkdir(parents=True, exist_ok=True)
    return output


def _flat_png_names(source: zipfile.ZipFile) -> tuple[str, ...]:
    names: list[str] = []
    for info in source.infolist():
        path = PurePosixPath(info.filename)
        if info.is_dir() or path.suffix != ".png":
            continue
        if len(path.parts) != 1 or path.name in {".", ".."}:
            continue
        names.append(path.name)
    if len(names) != len(set(names)):
        raise IconImportError("icon archive contains duplicate PNG filenames")
    return tuple(sorted(names))


def _select_archive_members(
    required: tuple[str, ...],
    archive_names: tuple[str, ...],
    overrides: Mapping[str, str],
) -> dict[str, str]:
    available = set(archive_names)
    selected: dict[str, str] = {}
    errors: list[str] = []
    for item_id in required:
        _namespace, path = item_id.split(":", 1)
        candidate = overrides.get(item_id, f"{path}.png")
        if candidate not in available:
            errors.append(f"missing required icon: {item_id} (expected {candidate})")
        else:
            selected[item_id] = candidate
    if errors:
        raise IconImportError("\n".join(errors))
    return selected


def _stage_icons(
    source: zipfile.ZipFile,
    required: tuple[str, ...],
    selected: Mapping[str, str],
    staging: Path,
    minecraft_version: str,
) -> dict[str, object]:
    published: dict[str, str] = {}
    for item_id in required:
        namespace, path = item_id.split(":", 1)
        relative = Path(namespace) / f"{path}.png"
        destination = staging / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            png = source.read(selected[item_id])
        except KeyError as error:
            raise IconImportError(f"archive member disappeared: {selected[item_id]}") from error
        destination.write_bytes(_prepare_icon(item_id, png))
        published[item_id] = relative.as_posix()

    manifest: dict[str, object] = {
        "schema_version": 1,
        "minecraft_version": minecraft_version,
        "icon_width": 16,
        "icon_height": 16,
        "icons": published,
    }
    (staging / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest


def _prepare_icon(item_id: str, contents: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(contents)) as image:
            image.load()
            if image.format != "PNG" or image.mode != "RGBA":
                raise IconImportError(
                    f"{item_id}: expected an RGBA PNG"
                )
            if image.size == (16, 16):
                return contents
            if image.size != (128, 128):
                raise IconImportError(
                    f"{item_id}: expected a 16x16 or 128x128 RGBA PNG"
                )
            resized = image.resize((16, 16), Image.Resampling.NEAREST)
            try:
                output = io.BytesIO()
                resized.save(output, format="PNG", compress_level=9)
                return output.getvalue()
            finally:
                resized.close()
    except IconImportError:
        raise
    except (OSError, ValueError, UnidentifiedImageError) as error:
        raise IconImportError(f"{item_id}: invalid PNG: {error}") from error


def _publish_directory(staging: Path, output: Path) -> None:
    backup: Path | None = None
    if output.exists():
        backup = output.parent / f".{output.name}.backup-{uuid.uuid4().hex}"
        os.replace(output, backup)
    try:
        os.replace(staging, output)
    except OSError as error:
        if backup is not None:
            os.replace(backup, output)
        raise IconImportError(f"could not publish icon archive: {error}") from error
    if backup is not None:
        shutil.rmtree(backup, ignore_errors=True)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--search-items", type=Path, required=True)
    parser.add_argument("--inventory-items", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--minecraft-version", required=True)
    args = parser.parse_args(argv)
    import_raw_icon_archive(
        args.archive,
        args.search_items,
        args.inventory_items,
        args.output,
        minecraft_version=args.minecraft_version,
    )
