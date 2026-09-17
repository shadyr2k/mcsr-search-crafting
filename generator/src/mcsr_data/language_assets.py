"""Read Minecraft language packs from a launcher asset cache without mutating it."""

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from mcsr_data.translations import TranslationCatalog


_LANGUAGE_ASSET_PATTERN = re.compile(r"minecraft/lang/([a-z0-9_]+)\.json\Z")
_SHA1_PATTERN = re.compile(r"[0-9a-f]{40}\Z")


@dataclass(frozen=True)
class LanguageAsset:
    """One locale stored as a content-addressed Minecraft launcher asset."""

    locale: str
    hash: str
    size: int


@dataclass(frozen=True)
class LanguageMetadata:
    locale: str
    name: str
    region: str
    script: str


class LanguageAssetError(ValueError):
    """Raised when a launcher asset index or its local objects are invalid."""


def discover_language_assets(asset_index_path: Path) -> tuple[LanguageAsset, ...]:
    """Return language assets in deterministic locale order from an asset index."""
    try:
        raw = json.loads(asset_index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LanguageAssetError(
            f"{asset_index_path}: cannot load Minecraft asset index: {error}"
        ) from error
    if not isinstance(raw, dict) or not isinstance(raw.get("objects"), dict):
        raise LanguageAssetError(f"{asset_index_path}: asset index objects must be an object")

    assets: list[LanguageAsset] = []
    for asset_path, value in raw["objects"].items():
        match = _LANGUAGE_ASSET_PATTERN.fullmatch(asset_path)
        if match is None:
            continue
        if not isinstance(value, dict):
            raise LanguageAssetError(f"{asset_index_path}: {asset_path} must be an object")
        hash_value = value.get("hash")
        size = value.get("size")
        if not isinstance(hash_value, str) or _SHA1_PATTERN.fullmatch(hash_value) is None:
            raise LanguageAssetError(f"{asset_index_path}: {asset_path} has an invalid SHA-1 hash")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise LanguageAssetError(f"{asset_index_path}: {asset_path} has an invalid size")
        assets.append(LanguageAsset(match.group(1), hash_value, size))

    locales = [asset.locale for asset in assets]
    if len(locales) != len(set(locales)):
        raise LanguageAssetError(f"{asset_index_path}: duplicate Minecraft language locale")
    return tuple(sorted(assets, key=lambda asset: asset.locale))


def resolve_asset_path(asset_root: Path, asset_hash: str) -> Path:
    """Resolve an asset object using Mojang's SHA-1 object-cache layout."""
    if _SHA1_PATTERN.fullmatch(asset_hash) is None:
        raise LanguageAssetError(f"invalid Minecraft asset SHA-1 hash: {asset_hash!r}")
    # Launchers store the cache under assets/objects/, while supplied source
    # bundles often contain that objects directory itself.
    object_root = asset_root / "objects"
    if not object_root.is_dir() and (asset_root / asset_hash[:2]).is_dir():
        object_root = asset_root
    return object_root / asset_hash[:2] / asset_hash


def load_language_catalogs(
    asset_root: Path,
    asset_index_path: Path,
    *,
    fallback: TranslationCatalog,
) -> dict[str, TranslationCatalog]:
    """Load every cached language pack with en_us fallback, without downloading."""
    catalogs: dict[str, TranslationCatalog] = {}
    for asset in discover_language_assets(asset_index_path):
        asset_path = resolve_asset_path(asset_root, asset.hash)
        if not asset_path.is_file():
            raise LanguageAssetError(
                f"{asset.locale}: indexed language asset is missing locally: {asset_path}"
            )
        if asset_path.stat().st_size != asset.size:
            raise LanguageAssetError(
                f"{asset.locale}: indexed language asset size does not match cache: {asset_path}"
            )
        try:
            catalog = TranslationCatalog.load(asset_path, fallback=fallback)
        except (OSError, ValueError) as error:
            raise LanguageAssetError(f"{asset.locale}: invalid language asset: {error}") from error
        catalogs[asset.locale] = catalog
    return catalogs


def load_language_metadata(
    asset_root: Path,
    asset_index_path: Path,
) -> dict[str, LanguageMetadata]:
    """Read display metadata and primary script classification from cached packs."""
    metadata: dict[str, LanguageMetadata] = {}
    for asset in discover_language_assets(asset_index_path):
        asset_path = resolve_asset_path(asset_root, asset.hash)
        if not asset_path.is_file():
            raise LanguageAssetError(
                f"{asset.locale}: indexed language asset is missing locally: {asset_path}"
            )
        try:
            raw = json.loads(asset_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise LanguageAssetError(f"{asset.locale}: invalid language asset: {error}") from error
        if not isinstance(raw, dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in raw.items()
        ):
            raise LanguageAssetError(f"{asset.locale}: language asset must be a string-to-string object")
        name = raw.get("language.name")
        region = raw.get("language.region")
        # Translation fixtures and a few third-party language files can omit
        # the menu metadata.  They still provide usable item translations, so
        # retain the locale with a deterministic display fallback.
        if not isinstance(name, str) or not name:
            name = asset.locale
        if not isinstance(region, str):
            region = ""
        metadata[asset.locale] = LanguageMetadata(
            locale=asset.locale,
            name=name,
            region=region,
            script=_classify_script(raw.values()),
        )
    return metadata


def _classify_script(values: Iterable[str]) -> str:
    latin_letters = 0
    non_latin_letters = 0
    for value in values:
        for character in value:
            if not character.isalpha():
                continue
            if "LATIN" in unicodedata.name(character, ""):
                latin_letters += 1
            else:
                non_latin_letters += 1
    return "latin" if latin_letters >= non_latin_letters else "non_latin"
