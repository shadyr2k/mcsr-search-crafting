"""Resolution of Minecraft item tags to concrete item identifiers."""

import json
from pathlib import Path


class TagResolutionError(ValueError):
    """Raised when an item tag cannot be expanded."""


class TagResolver:
    def __init__(self, definitions: dict[str, tuple[tuple[str, bool], ...]]) -> None:
        self._definitions = definitions
        self._cache: dict[str, frozenset[str]] = {}

    @classmethod
    def from_directory(cls, path: Path) -> "TagResolver":
        definitions: dict[str, tuple[tuple[str, bool], ...]] = {}
        for tag_path in sorted(path.rglob("*.json")):
            raw = json.loads(tag_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict) or not isinstance(raw.get("values"), list):
                raise TagResolutionError(f"{tag_path}: tag must define a values list")
            tag_id = _tag_id_from_path(path, tag_path)
            definitions[tag_id] = tuple(_parse_value(tag_path, value) for value in raw["values"])
        return cls(definitions)

    def resolve(self, tag_id: str) -> frozenset[str]:
        return self._resolve(_normalize_id(tag_id), ())

    def _resolve(self, tag_id: str, chain: tuple[str, ...]) -> frozenset[str]:
        if tag_id in self._cache:
            return self._cache[tag_id]
        if tag_id in chain:
            raise TagResolutionError(f"tag cycle: {' -> '.join((*chain, tag_id))}")
        try:
            values = self._definitions[tag_id]
        except KeyError as error:
            dependency_chain = " -> ".join((*chain, tag_id))
            raise TagResolutionError(f"missing required tag: {dependency_chain}") from error

        items: set[str] = set()
        for value, required in values:
            if value.startswith("#"):
                nested_tag = _normalize_id(value[1:])
                if nested_tag not in self._definitions and not required:
                    continue
                items.update(self._resolve(nested_tag, (*chain, tag_id)))
            else:
                items.add(_normalize_id(value))
        resolved = frozenset(items)
        self._cache[tag_id] = resolved
        return resolved


def _tag_id_from_path(directory: Path, tag_path: Path) -> str:
    relative = tag_path.relative_to(directory).with_suffix("")
    parts = relative.parts
    if len(parts) == 1:
        return f"minecraft:{parts[0]}"
    return f"{parts[0]}:{'/'.join(parts[1:])}"


def _parse_value(path: Path, value: object) -> tuple[str, bool]:
    if isinstance(value, str) and value:
        return value, True
    if isinstance(value, dict):
        identifier = value.get("id")
        required = value.get("required", True)
        if isinstance(identifier, str) and identifier and isinstance(required, bool):
            return identifier, required
    raise TagResolutionError(f"{path}: tag value must be an id string or optional id object")


def _normalize_id(identifier: str) -> str:
    return identifier if ":" in identifier else f"minecraft:{identifier}"
