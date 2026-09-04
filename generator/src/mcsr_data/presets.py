"""Load the approved built-in inventory presets."""

import json
import re
from dataclasses import dataclass
from pathlib import Path


_PRESET_SCHEMA_VERSION = 1
_PRESET_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*\Z")
_ITEM_ID_PATTERN = re.compile(r"[a-z0-9_.-]+:[a-z0-9_./-]+\Z")


@dataclass(frozen=True)
class InventoryPreset:
    preset_id: str
    name: str
    item_ids: tuple[str, ...]


def load_inventory_presets(path: Path | None = None) -> tuple[InventoryPreset, ...]:
    """Load the versioned, repository-owned built-in preset definitions."""
    source_path = path or Path(__file__).with_name("inventory_presets.json")
    try:
        raw = json.loads(source_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{source_path}: invalid JSON: {error.msg}") from error

    if not isinstance(raw, dict):
        raise ValueError(f"{source_path}: expected an object")
    _reject_unknown_fields(raw, {"schema_version", "presets"}, str(source_path))
    if raw.get("schema_version") != _PRESET_SCHEMA_VERSION:
        raise ValueError(f"{source_path}: schema_version must be {_PRESET_SCHEMA_VERSION}")
    if not isinstance(raw.get("presets"), list) or not raw["presets"]:
        raise ValueError(f"{source_path}: presets must be a non-empty array")

    presets: list[InventoryPreset] = []
    preset_ids: set[str] = set()
    preset_names: set[str] = set()
    for index, value in enumerate(raw["presets"]):
        location = f"{source_path}: presets[{index}]"
        if not isinstance(value, dict):
            raise ValueError(f"{location}: expected an object")
        _reject_unknown_fields(value, {"id", "name", "item_ids"}, location)

        preset_id = value.get("id")
        if not isinstance(preset_id, str) or not _PRESET_ID_PATTERN.fullmatch(preset_id):
            raise ValueError(f"{location}.id: expected a non-empty lowercase preset ID")
        if preset_id in preset_ids:
            raise ValueError(f"{location}.id: duplicate preset ID {preset_id}")

        name = value.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"{location}.name: expected a non-empty name")
        if name in preset_names:
            raise ValueError(f"{location}.name: duplicate preset name {name}")

        item_ids = value.get("item_ids")
        if not isinstance(item_ids, list) or not item_ids:
            raise ValueError(f"{location}.item_ids: expected a non-empty array")
        parsed_item_ids: list[str] = []
        seen_item_ids: set[str] = set()
        for item_index, item_id in enumerate(item_ids):
            item_location = f"{location}.item_ids[{item_index}]"
            if not isinstance(item_id, str) or not _ITEM_ID_PATTERN.fullmatch(item_id):
                raise ValueError(f"{item_location}: invalid item ID")
            if item_id in seen_item_ids:
                raise ValueError(f"{item_location}: duplicate item ID {item_id}")
            seen_item_ids.add(item_id)
            parsed_item_ids.append(item_id)

        preset_ids.add(preset_id)
        preset_names.add(name)
        presets.append(InventoryPreset(preset_id, name, tuple(parsed_item_ids)))

    return tuple(presets)


def _reject_unknown_fields(
    value: dict[str, object],
    allowed_fields: set[str],
    location: str,
) -> None:
    unknown_fields = sorted(set(value) - allowed_fields)
    if unknown_fields:
        raise ValueError(f"{location}: unknown field {unknown_fields[0]}")
