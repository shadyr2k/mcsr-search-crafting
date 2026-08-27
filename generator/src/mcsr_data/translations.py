import json
from pathlib import Path
from typing import Mapping


class TranslationCatalog:
    """English Minecraft translations used to label generated data."""

    def __init__(self, translations: Mapping[str, str]) -> None:
        self._translations = dict(translations)

    @classmethod
    def load(cls, path: Path) -> "TranslationCatalog":
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in raw.items()
        ):
            raise ValueError(f"{path}: translations must be a string-to-string object")
        return cls(raw)

    def item_name(self, item_id: str) -> str:
        namespace, path = item_id.split(":", 1)
        for kind in ("item", "block"):
            translation = self._translations.get(f"{kind}.{namespace}.{path}")
            if translation is not None:
                return translation
        raise KeyError(f"No en_us translation for {item_id}")
