import json
import re
from pathlib import Path
from typing import Mapping


class TranslationCatalog:
    """Minecraft translations with optional en_us fallback."""

    def __init__(
        self,
        translations: Mapping[str, str],
        *,
        fallback: "TranslationCatalog | None" = None,
    ) -> None:
        self._translations = dict(translations)
        self._fallback = fallback

    @classmethod
    def load(
        cls,
        path: Path,
        *,
        fallback: "TranslationCatalog | None" = None,
    ) -> "TranslationCatalog":
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in raw.items()
        ):
            raise ValueError(f"{path}: translations must be a string-to-string object")
        return cls(raw, fallback=fallback)

    def translation(self, key: str) -> str:
        translation = self._translations.get(key)
        if translation is not None:
            return translation
        if self._fallback is not None:
            return self._fallback.translation(key)
        raise KeyError(f"No translation for {key}")

    def format(self, key: str, *arguments: str) -> str:
        """Render the %s and positional %1$s placeholders used by 1.16 language packs."""
        template = self.translation(key)
        next_argument = 0

        def replace(match: re.Match[str]) -> str:
            nonlocal next_argument
            position = match.group("position")
            if position is None:
                index = next_argument
                next_argument += 1
            else:
                index = int(position[:-1]) - 1
            if index < 0 or index >= len(arguments):
                raise ValueError(
                    f"{key}: placeholder references argument {index + 1}, "
                    f"but only {len(arguments)} value(s) were provided"
                )
            return arguments[index]

        return _FORMAT_PLACEHOLDER.sub(replace, template).replace("%%", "%")

    def keys_matching(self, prefix: str) -> tuple[str, ...]:
        """Return this catalog's keys in deterministic order for a key family."""
        return tuple(sorted(key for key in self._translations if key.startswith(prefix)))

    def item_name(self, item_id: str) -> str:
        namespace, path = item_id.split(":", 1)
        for kind in ("item", "block"):
            key = f"{kind}.{namespace}.{path}"
            translation = self._translations.get(key)
            if translation is not None:
                return translation
        if self._fallback is not None:
            return self._fallback.item_name(item_id)
        raise KeyError(f"No translation for {item_id}")


_FORMAT_PLACEHOLDER = re.compile(r"%(?P<position>\d+\$)?[sd]")
