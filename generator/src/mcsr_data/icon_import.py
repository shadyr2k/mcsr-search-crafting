from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Sequence

from .icon_contact_sheet import IconContactSheetError, write_contact_sheet
from .icon_manifest import (
    WINDOWS_RESERVED_NAMES,
    IconManifestError,
    ValidatedExport,
    load_export_manifest,
)


ITEM_ID_PATTERN = re.compile(r"[a-z0-9_.-]+:[a-z0-9/._-]+\Z")


class IconImportError(ValueError):
    """Raised when validated icons cannot be published atomically."""


def required_item_ids(
    search_items_path: Path, inventory_items_path: Path
) -> tuple[str, ...]:
    item_ids = _catalog_item_ids(Path(search_items_path))
    item_ids.update(_catalog_item_ids(Path(inventory_items_path)))
    return tuple(sorted(item_ids))


def import_icons(
    export_root: Path,
    search_items_path: Path,
    inventory_items_path: Path,
    output_root: Path,
    contact_sheet_path: Path,
) -> None:
    try:
        validated = load_export_manifest(Path(export_root))
    except IconManifestError as error:
        raise IconImportError(str(error)) from error

    required = required_item_ids(search_items_path, inventory_items_path)
    output, contact = _safe_destinations(
        validated.root,
        Path(search_items_path),
        Path(inventory_items_path),
        Path(output_root),
        Path(contact_sheet_path),
    )
    _require_icons(validated, required)

    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        staging: Path | None = Path(
            tempfile.mkdtemp(dir=output.parent, prefix=f".{output.name}.staging-")
        )
    except OSError as error:
        raise IconImportError(f"could not create publication staging: {error}") from error
    try:
        assert staging is not None
        manifest = _stage_subset(validated, required, staging)
        _validate_staged_tree(validated, required, staging, manifest)
        try:
            write_contact_sheet(
                {
                    item_id: validated.root / icon.relative_path
                    for item_id, icon in validated.icons.items()
                },
                contact,
            )
        except IconContactSheetError as error:
            raise IconImportError(str(error)) from error
        _publish_directory(staging, output)
        staging = None
    except IconImportError:
        raise
    except OSError as error:
        raise IconImportError(str(error)) from error
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)


def _catalog_item_ids(path: Path) -> set[str]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise IconImportError(f"{path}: invalid item catalog") from error
    if not isinstance(raw, dict):
        raise IconImportError(f"{path}: expected object")
    schema = raw.get("schema_version")
    if isinstance(schema, bool) or schema != 3:
        raise IconImportError(f"{path}: schema_version: expected 3")
    items = raw.get("items")
    if not isinstance(items, dict):
        raise IconImportError(f"{path}: items: expected object")
    item_ids: set[str] = set()
    for item_id in items:
        if not isinstance(item_id, str) or not _portable_item_id(item_id):
            raise IconImportError(f"{path}: invalid item identifier: {item_id!r}")
        item_ids.add(item_id)
    return item_ids


def _safe_destinations(
    export_root: Path,
    search_items_path: Path,
    inventory_items_path: Path,
    output_root: Path,
    contact_sheet_path: Path,
) -> tuple[Path, Path]:
    output = _resolved_destination(output_root)
    contact = _resolved_destination(contact_sheet_path)
    if output.is_symlink() or (output.exists() and not output.is_dir()):
        raise IconImportError("output destination must be a real directory or absent")
    if contact.is_symlink() or (contact.exists() and not contact.is_file()):
        raise IconImportError("contact-sheet destination must be a real file or absent")
    if _overlaps(output, export_root):
        raise IconImportError("output destination must not overlap the export")
    if _overlaps(contact, export_root):
        raise IconImportError("contact-sheet destination must not overlap the export")
    if contact == output or output in contact.parents:
        raise IconImportError("contact-sheet destination must be outside output destination")
    for source in (search_items_path.resolve(), inventory_items_path.resolve()):
        if _overlaps(output, source) or contact == source:
            raise IconImportError("destination must not overlap an input catalog")
    return output, contact


def _resolved_destination(path: Path) -> Path:
    if not path.name or path.name in {".", ".."}:
        raise IconImportError("invalid destination")
    parent = path.parent.resolve()
    return parent / path.name


def _overlaps(first: Path, second: Path) -> bool:
    return first == second or first in second.parents or second in first.parents


def _portable_item_id(item_id: str) -> bool:
    if ITEM_ID_PATTERN.fullmatch(item_id) is None:
        return False
    namespace, item_path = item_id.split(":", 1)
    segments = [namespace, *item_path.split("/")]
    return not any(
        segment in {"", ".", ".."}
        or segment.endswith((".", " "))
        or segment.split(".", 1)[0].upper() in WINDOWS_RESERVED_NAMES
        for segment in segments
    )


def _require_icons(validated: ValidatedExport, required: tuple[str, ...]) -> None:
    diagnostics: list[str] = []
    for item_id in required:
        if item_id in validated.failed_item_ids:
            diagnostics.append(f"required icon failed to export: {item_id}")
        elif item_id not in validated.icons:
            diagnostics.append(f"missing required icon: {item_id}")
    if diagnostics:
        raise IconImportError("\n".join(diagnostics))


def _stage_subset(
    validated: ValidatedExport, required: tuple[str, ...], staging: Path
) -> dict[str, object]:
    published_icons: dict[str, str] = {}
    for item_id in required:
        icon = validated.icons[item_id]
        namespace, item_path = item_id.split(":", 1)
        relative = Path(namespace) / f"{item_path}.png"
        destination = staging / relative
        try:
            destination.resolve(strict=False).relative_to(staging.resolve())
        except ValueError as error:
            raise IconImportError(f"unsafe published icon path: {item_id}") from error
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(validated.root / icon.relative_path, destination)
        published_icons[item_id] = relative.as_posix()
    manifest: dict[str, object] = {
        "schema_version": 1,
        "minecraft_version": "1.16.1",
        "icon_width": 16,
        "icon_height": 16,
        "icons": published_icons,
    }
    (staging / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest


def _validate_staged_tree(
    validated: ValidatedExport,
    required: tuple[str, ...],
    staging: Path,
    manifest: dict[str, object],
) -> None:
    expected_files = {"manifest.json"}
    icons = manifest["icons"]
    assert isinstance(icons, dict)
    if tuple(icons) != required:
        raise IconImportError("staged manifest icon IDs are not deterministic")
    parsed = json.loads((staging / "manifest.json").read_text(encoding="utf-8"))
    if parsed != manifest:
        raise IconImportError("staged manifest does not match publication")
    for item_id in required:
        relative = icons[item_id]
        assert isinstance(relative, str)
        expected_files.add(relative)
        destination = staging.joinpath(*relative.split("/"))
        actual_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
        if actual_hash != validated.icons[item_id].sha256:
            raise IconImportError(f"staged icon bytes changed: {item_id}")
    actual_files = {
        path.relative_to(staging).as_posix()
        for path in staging.rglob("*")
        if path.is_file()
    }
    if actual_files != expected_files:
        raise IconImportError("staged publication contains unexpected files")


def _publish_directory(staging: Path, output: Path) -> None:
    backup: Path | None = None
    if output.exists():
        backup = output.parent / f".{output.name}.backup-{uuid.uuid4().hex}"
        os.replace(output, backup)
    try:
        os.replace(staging, output)
    except OSError as error:
        if backup is not None:
            try:
                os.replace(backup, output)
                backup = None
            except OSError as restore_error:
                error.add_note(f"rollback failed: {restore_error}")
        raise IconImportError(f"could not publish icon directory: {error}") from error
    if backup is not None:
        shutil.rmtree(backup, ignore_errors=True)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Import validated Minecraft item icons")
    parser.add_argument("--export", type=Path, required=True)
    parser.add_argument("--search-items", type=Path, required=True)
    parser.add_argument("--inventory-items", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path, required=True)
    args = parser.parse_args(argv)
    import_icons(
        args.export,
        args.search_items,
        args.inventory_items,
        args.output,
        args.contact_sheet,
    )
    count = len(required_item_ids(args.search_items, args.inventory_items))
    print(f"Imported {count} required icons to {args.output}")
    print(f"Contact sheet: {args.contact_sheet}")


if __name__ == "__main__":
    main()
