"""Generate deterministic, browser-ready Minecraft crafting search data."""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Mapping, Sequence

from mcsr_data.models import (
    InventoryItem,
    NormalizedRecipe,
    RecipeBookCategory,
    RecipeResultCollection,
    SearchItem,
)
from mcsr_data.language_assets import (
    LanguageAssetError,
    LanguageMetadata,
    load_language_catalogs,
    load_language_metadata,
)
from mcsr_data.language_info import build_localized_language_info
from mcsr_data.presets import InventoryPreset, load_inventory_presets
from mcsr_data.recipe_collections import (
    RecipeCollectionError,
    assign_recipe_result_collections,
    load_recipe_book_categories,
)
from mcsr_data.recipes import load_crafting_recipes, resolve_recipe_ingredients
from mcsr_data.tags import TagResolver
from mcsr_data.tooltips import build_search_item, load_overrides
from mcsr_data.translations import TranslationCatalog
from mcsr_data.validation import Diagnostic, ValidationReport


SCHEMA_VERSION = 3
LOCALIZED_SEARCH_SCHEMA_VERSION = 1
MINECRAFT_VERSION = "1.16.1"
LANGUAGE = "en_us"
FAILURE_REPORT_FILENAME = "validation-failure-report.json"


@dataclass(frozen=True)
class GenerationBaseline:
    recipe_count: int
    output_item_count: int
    inventory_item_count: int
    collection_count: int


MINECRAFT_1_16_1_BASELINE = GenerationBaseline(
    recipe_count=634,
    output_item_count=562,
    inventory_item_count=283,
    collection_count=354,
)

MINECRAFT_26_1_2_BASELINE = GenerationBaseline(
    recipe_count=1030,
    output_item_count=887,
    inventory_item_count=508,
    collection_count=541,
)

BASELINES_BY_MINECRAFT_VERSION = {
    "1.16.1": MINECRAFT_1_16_1_BASELINE,
    "26.1.2": MINECRAFT_26_1_2_BASELINE,
}


@dataclass(frozen=True)
class GenerationSummary:
    recipe_count: int
    output_item_count: int
    inventory_item_count: int
    collection_count: int
    error_count: int
    warning_count: int
    diagnostics: tuple[Diagnostic, ...]


class GenerationFailed(ValueError):
    """Raised when source data cannot be safely published."""

    def __init__(
        self,
        report: ValidationReport,
        summary: GenerationSummary,
        failure_report_path: Path | None,
    ) -> None:
        self.report = report
        self.summary = summary
        self.failure_report_path = failure_report_path
        super().__init__(f"validation failed with {summary.error_count} error(s)")


def generate(
    source_root: Path,
    output_root: Path,
    *,
    baseline: GenerationBaseline | None = MINECRAFT_1_16_1_BASELINE,
    recipe_book_categories: Mapping[str, RecipeBookCategory] | None = None,
    language_asset_root: Path | None = None,
    language_asset_index: Path | None = None,
    minecraft_version: str = MINECRAFT_VERSION,
) -> GenerationSummary:
    """Validate source data and atomically publish browser artifacts."""
    report = ValidationReport()
    _validate_source_paths(source_root, report, minecraft_version)
    recipes = _load_recipes(source_root, report)
    tags = _load_tags(source_root, report)
    catalog = _load_translations(source_root, report)
    overrides = _load_overrides(report)
    presets = _load_inventory_presets(report)

    resolved_recipes = _resolve_recipes(recipes, tags, report)
    categories = (
        recipe_book_categories
        if recipe_book_categories is not None
        else _load_recipe_book_categories(report)
    )
    enriched_recipes, collections = _assign_recipe_collections(
        resolved_recipes,
        categories,
        report,
    )
    items = _build_items(
        enriched_recipes,
        catalog,
        overrides,
        report,
        minecraft_version=minecraft_version,
    )
    inventory_items = _build_inventory_items(enriched_recipes, presets, catalog, report)
    localized_catalogs = _load_language_catalogs(
        language_asset_root,
        language_asset_index,
        catalog,
        report,
    )
    language_metadata = _load_language_metadata(
        language_asset_root,
        language_asset_index,
        catalog,
        report,
        minecraft_version,
    )
    localized_search_data = _build_localized_search_data(
        enriched_recipes,
        presets,
        items,
        inventory_items,
        localized_catalogs,
        overrides,
        report,
        minecraft_version,
    )
    localized_language_info = _build_localized_language_info(
        catalog,
        localized_catalogs,
        report,
        minecraft_version,
    )
    _validate_cross_references(
        enriched_recipes,
        items,
        inventory_items,
        collections,
        report,
    )
    if baseline is not None:
        _validate_baseline(enriched_recipes, items, inventory_items, collections, baseline, report)

    summary = _summary(enriched_recipes, items, inventory_items, collections, report)
    if summary.error_count:
        failure_path = output_root / FAILURE_REPORT_FILENAME
        try:
            _atomic_write_all(output_root, {
                FAILURE_REPORT_FILENAME: _serialize_report(summary, status="failed"),
            })
        except OSError as error:
            report.error("failure_report_write_failed", str(failure_path), str(error))
            summary = _summary(enriched_recipes, items, inventory_items, collections, report)
            raise GenerationFailed(report, summary, None) from error
        raise GenerationFailed(report, summary, failure_path)

    payloads = {
        "search-items.json": {
            "schema_version": SCHEMA_VERSION,
            "items": {item_id: _serialize_item(item) for item_id, item in sorted(items.items())},
        },
        "inventory-items.json": {
            "schema_version": SCHEMA_VERSION,
            "items": {
                item_id: _serialize_inventory_item(item)
                for item_id, item in sorted(inventory_items.items())
            },
        },
        "inventory-presets.json": {
            "schema_version": SCHEMA_VERSION,
            "presets": [
                _serialize_preset(preset)
                for preset in sorted(presets, key=lambda preset: preset.preset_id)
            ],
        },
        "crafting-recipes.json": {
            "schema_version": SCHEMA_VERSION,
            "recipes": [_serialize_recipe(recipe) for recipe in enriched_recipes],
        },
        "recipe-result-collections.json": {
            "schema_version": SCHEMA_VERSION,
            "minecraft_version": minecraft_version,
            "language": LANGUAGE,
            "collections": [_serialize_collection(collection) for collection in collections],
        },
        "validation-report.json": _serialize_report(summary, status="valid"),
    }
    if localized_search_data is not None:
        payloads["localized-search-data.json"] = localized_search_data
    if localized_language_info is not None:
        payloads["localized-language-info.json"] = localized_language_info
    if language_metadata is not None:
        payloads["language-metadata.json"] = language_metadata
    _atomic_write_all(output_root, payloads)
    (output_root / FAILURE_REPORT_FILENAME).unlink(missing_ok=True)
    return summary


def _validate_source_paths(source_root: Path, report: ValidationReport, minecraft_version: str) -> None:
    required_paths = (
        ("recipes", True),
        ("tags/items", True),
        ("lang/en_us.json", False),
    )
    for relative_path, must_be_directory in required_paths:
        source_path = source_root / relative_path
        exists_with_expected_type = (
            source_path.is_dir() if must_be_directory else source_path.is_file()
        )
        if not exists_with_expected_type:
            expected = "directory" if must_be_directory else "file"
            report.error(
                "missing_source_path",
                relative_path,
                f"required Minecraft {minecraft_version} source {expected} is missing: {source_path}",
            )


def _load_recipes(source_root: Path, report: ValidationReport) -> list[NormalizedRecipe]:
    try:
        return load_crafting_recipes(source_root / "recipes")
    except (OSError, ValueError) as error:
        report.error("invalid_recipes", "recipes", str(error))
        return []


def _load_tags(source_root: Path, report: ValidationReport) -> TagResolver | None:
    try:
        return TagResolver.from_directory(source_root / "tags" / "items")
    except (OSError, ValueError) as error:
        report.error("invalid_tags", "tags/items", str(error))
        return None


def _load_translations(source_root: Path, report: ValidationReport) -> TranslationCatalog | None:
    try:
        return TranslationCatalog.load(source_root / "lang" / "en_us.json")
    except (OSError, ValueError) as error:
        report.error("invalid_translations", "lang/en_us.json", str(error))
        return None


def _load_language_catalogs(
    asset_root: Path | None,
    asset_index: Path | None,
    fallback: TranslationCatalog | None,
    report: ValidationReport,
) -> dict[str, TranslationCatalog] | None:
    if asset_root is None and asset_index is None:
        return None
    if asset_root is None or asset_index is None:
        report.error(
            "invalid_language_asset_source",
            "language assets",
            "language_asset_root and language_asset_index must be provided together",
        )
        return None
    if fallback is None:
        return None
    try:
        return load_language_catalogs(asset_root, asset_index, fallback=fallback)
    except LanguageAssetError as error:
        report.error("invalid_language_assets", "language assets", str(error))
        return None


def _load_language_metadata(
    asset_root: Path | None,
    asset_index: Path | None,
    source_catalog: TranslationCatalog | None,
    report: ValidationReport,
    minecraft_version: str,
) -> dict[str, object] | None:
    if asset_root is None and asset_index is None:
        return None
    if asset_root is None or asset_index is None or source_catalog is None:
        return None
    try:
        cached_metadata = load_language_metadata(asset_root, asset_index)
        try:
            source_name = source_catalog.translation("language.name")
            source_region = source_catalog.translation("language.region")
        except KeyError:
            source_name = "English"
            source_region = "United States"
        source_metadata = LanguageMetadata(
            locale=LANGUAGE,
            name=source_name,
            region=source_region,
            script="latin",
        )
    except LanguageAssetError as error:
        report.error("invalid_language_metadata", "language metadata", str(error))
        return None
    metadata = {**cached_metadata, LANGUAGE: source_metadata}
    return {
        "schema_version": LOCALIZED_SEARCH_SCHEMA_VERSION,
        "minecraft_version": minecraft_version,
        "locales": {
            locale: {
                "name": definition.name,
                "region": definition.region,
                "script": definition.script,
            }
            for locale, definition in sorted(metadata.items())
        },
    }


def _load_overrides(report: ValidationReport) -> dict[str, object]:
    try:
        return load_overrides()
    except ValueError as error:
        report.error("invalid_overrides", "overrides", str(error))
        return {}


def _load_inventory_presets(report: ValidationReport) -> tuple[InventoryPreset, ...]:
    try:
        return load_inventory_presets()
    except (OSError, ValueError) as error:
        report.error("invalid_inventory_presets", "inventory_presets", str(error))
        return ()


def _resolve_recipes(
    recipes: list[NormalizedRecipe],
    tags: TagResolver | None,
    report: ValidationReport,
) -> list[NormalizedRecipe]:
    if tags is None:
        return []
    resolved: list[NormalizedRecipe] = []
    for recipe in recipes:
        try:
            resolved.append(resolve_recipe_ingredients(recipe, tags))
        except ValueError as error:
            report.error("unresolved_ingredients", recipe.recipe_id, str(error))
    return resolved


def _load_recipe_book_categories(
    report: ValidationReport,
) -> Mapping[str, RecipeBookCategory]:
    try:
        return load_recipe_book_categories()
    except RecipeCollectionError as error:
        report.error("invalid_recipe_book_categories", "recipe_book_categories", str(error))
        return {}


def _assign_recipe_collections(
    recipes: list[NormalizedRecipe],
    categories: Mapping[str, RecipeBookCategory],
    report: ValidationReport,
) -> tuple[list[NormalizedRecipe], list[RecipeResultCollection]]:
    try:
        return assign_recipe_result_collections(recipes, categories)
    except RecipeCollectionError as error:
        report.error("invalid_recipe_collections", "recipes", str(error))
        return [], []


def _build_items(
    recipes: list[NormalizedRecipe],
    catalog: TranslationCatalog | None,
    overrides: dict[str, object],
    report: ValidationReport,
    *,
    subject_prefix: str = "",
    minecraft_version: str = MINECRAFT_VERSION,
) -> dict[str, SearchItem]:
    if catalog is None:
        return {}
    items: dict[str, SearchItem] = {}
    for item_id in sorted({recipe.output_item for recipe in recipes}):
        try:
            items[item_id] = build_search_item(
                item_id,
                catalog.item_name(item_id),
                None,
                overrides=overrides,
                catalog=catalog,
                minecraft_version=minecraft_version,
                require_classification=True,
            )
        except KeyError as error:
            report.error("missing_translation", f"{subject_prefix}{item_id}", str(error))
        except ValueError as error:
            report.error("unsupported_tooltip", f"{subject_prefix}{item_id}", str(error))
    return items


def _build_inventory_items(
    recipes: list[NormalizedRecipe],
    presets: tuple[InventoryPreset, ...],
    catalog: TranslationCatalog | None,
    report: ValidationReport,
    *,
    subject_prefix: str = "",
) -> dict[str, InventoryItem]:
    if catalog is None:
        return {}
    items: dict[str, InventoryItem] = {}
    inventory_ids = {
        item_id
        for recipe in recipes
        for slot in recipe.ingredient_slots
        for item_id in slot.accepted_items
    }
    inventory_ids.update(
        item_id
        for preset in presets
        for item_id in preset.item_ids
    )
    for item_id in sorted(inventory_ids):
        try:
            items[item_id] = InventoryItem(item_id=item_id, name=catalog.item_name(item_id))
        except KeyError as error:
            report.error(
                "missing_inventory_translation",
                f"{subject_prefix}{item_id}",
                str(error),
            )
    return items


def _build_localized_search_data(
    recipes: list[NormalizedRecipe],
    presets: tuple[InventoryPreset, ...],
    base_items: dict[str, SearchItem],
    base_inventory_items: dict[str, InventoryItem],
    catalogs: dict[str, TranslationCatalog] | None,
    overrides: dict[str, object],
    report: ValidationReport,
    minecraft_version: str,
) -> dict[str, object] | None:
    if catalogs is None:
        return None

    locales: dict[str, dict[str, object]] = {
        LANGUAGE: _serialize_localized_catalog(base_items, base_inventory_items),
    }
    for locale, catalog in sorted(catalogs.items()):
        if locale == LANGUAGE:
            continue
        items = _build_items(
            recipes,
            catalog,
            overrides,
            report,
            subject_prefix=f"{locale}:",
            minecraft_version=minecraft_version,
        )
        inventory_items = _build_inventory_items(
            recipes,
            presets,
            catalog,
            report,
            subject_prefix=f"{locale}:",
        )
        locales[locale] = _serialize_localized_catalog(items, inventory_items)
    return {
        "schema_version": LOCALIZED_SEARCH_SCHEMA_VERSION,
        "minecraft_version": minecraft_version,
        "locales": locales,
    }


def _build_localized_language_info(
    base_catalog: TranslationCatalog | None,
    catalogs: dict[str, TranslationCatalog] | None,
    report: ValidationReport,
    minecraft_version: str,
) -> dict[str, object] | None:
    if base_catalog is None or catalogs is None:
        return None
    try:
        return build_localized_language_info(base_catalog, catalogs, minecraft_version=minecraft_version)
    except KeyError as error:
        report.error("missing_language_info_translation", "language-info", str(error))
        return None


def _serialize_localized_catalog(
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
) -> dict[str, object]:
    return {
        "search_items": {
            item_id: _serialize_item(item)
            for item_id, item in sorted(items.items())
        },
        "inventory_items": {
            item_id: _serialize_inventory_item(item)
            for item_id, item in sorted(inventory_items.items())
        },
    }


def _validate_cross_references(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
    collections: list[RecipeResultCollection],
    report: ValidationReport,
) -> None:
    seen_recipe_ids: set[str] = set()
    recipes_by_id: dict[str, NormalizedRecipe] = {}
    for recipe in recipes:
        if recipe.recipe_id in seen_recipe_ids:
            report.error("duplicate_recipe", recipe.recipe_id, "recipe ID is not unique")
        seen_recipe_ids.add(recipe.recipe_id)
        recipes_by_id[recipe.recipe_id] = recipe
        if recipe.output_item not in items:
            report.error("missing_output_item", recipe.recipe_id, recipe.output_item)
        if not recipe.fits_2x2 and not recipe.fits_3x3:
            report.error("unsupported_grid", recipe.recipe_id, "recipe fits neither crafting grid")
        for index, slot in enumerate(recipe.ingredient_slots):
            if not slot.accepted_items:
                report.error("empty_ingredient_slot", f"{recipe.recipe_id}[{index}]", "no accepted items")
            for item_id in slot.accepted_items:
                if item_id not in inventory_items:
                    report.error(
                        "missing_inventory_item",
                        f"{recipe.recipe_id}[{index}]",
                        item_id,
                    )

    membership_counts = {recipe_id: 0 for recipe_id in recipes_by_id}
    seen_collection_ids: set[str] = set()
    for collection in collections:
        if collection.collection_id in seen_collection_ids:
            report.error(
                "duplicate_collection",
                collection.collection_id,
                "collection ID is not unique",
            )
        seen_collection_ids.add(collection.collection_id)
        if not collection.recipe_ids:
            report.error("empty_collection", collection.collection_id, "collection has no recipes")
        if not collection.output_item_ids:
            report.error("empty_collection_outputs", collection.collection_id, "collection has no outputs")
        if collection.recipe_ids != tuple(sorted(set(collection.recipe_ids))):
            report.error(
                "invalid_collection_recipe_ids",
                collection.collection_id,
                "recipe IDs must be sorted and unique",
            )
        if collection.output_item_ids != tuple(sorted(set(collection.output_item_ids))):
            report.error(
                "invalid_collection_output_item_ids",
                collection.collection_id,
                "output item IDs must be sorted and unique",
            )

        member_output_item_ids: set[str] = set()
        for recipe_id in collection.recipe_ids:
            recipe = recipes_by_id.get(recipe_id)
            if recipe is None:
                report.error(
                    "missing_collection_recipe",
                    collection.collection_id,
                    recipe_id,
                )
                continue
            membership_counts[recipe_id] += 1
            member_output_item_ids.add(recipe.output_item)
            if recipe.result_collection_id != collection.collection_id:
                report.error(
                    "result_collection_reference_mismatch",
                    recipe_id,
                    collection.collection_id,
                )
            if recipe.recipe_book_category != collection.recipe_book_category:
                report.error(
                    "collection_category_mismatch",
                    recipe_id,
                    collection.collection_id,
                )
            if recipe.recipe_group != collection.recipe_group:
                report.error(
                    "collection_group_mismatch",
                    recipe_id,
                    collection.collection_id,
                )
        for output_item_id in collection.output_item_ids:
            if output_item_id not in items:
                report.error(
                    "missing_collection_output_item",
                    collection.collection_id,
                    output_item_id,
                )
        if set(collection.output_item_ids) != member_output_item_ids:
            report.error(
                "collection_output_reference_mismatch",
                collection.collection_id,
                "collection outputs do not match its recipe outputs",
            )

    for recipe in recipes:
        if recipe.recipe_book_category is None:
            report.error(
                "missing_recipe_book_category",
                recipe.recipe_id,
                "recipe has no recipe-book category",
            )
        if recipe.result_collection_id is None:
            report.error(
                "missing_result_collection",
                recipe.recipe_id,
                "recipe has no result collection",
            )
        elif recipe.result_collection_id not in seen_collection_ids:
            report.error(
                "missing_result_collection_reference",
                recipe.recipe_id,
                recipe.result_collection_id,
            )
        membership_count = membership_counts[recipe.recipe_id]
        if membership_count == 0:
            report.error(
                "missing_collection_membership",
                recipe.recipe_id,
                "recipe is not referenced by a collection",
            )
        elif membership_count > 1:
            report.error(
                "multiple_collection_memberships",
                recipe.recipe_id,
                "recipe is referenced by multiple collections",
            )


def _validate_baseline(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
    collections: list[RecipeResultCollection],
    baseline: GenerationBaseline,
    report: ValidationReport,
) -> None:
    if len(recipes) != baseline.recipe_count:
        report.error(
            "baseline_recipe_count",
            "minecraft:1.16.1",
            f"expected {baseline.recipe_count} crafting recipes, found {len(recipes)}",
        )
    if len(items) != baseline.output_item_count:
        report.error(
            "baseline_output_count",
            "minecraft:1.16.1",
            f"expected {baseline.output_item_count} distinct recipe outputs, found {len(items)}",
        )
    if len(inventory_items) != baseline.inventory_item_count:
        report.error(
            "baseline_inventory_count",
            "minecraft:1.16.1",
            f"expected {baseline.inventory_item_count} inventory items, found {len(inventory_items)}",
        )
    if len(collections) != baseline.collection_count:
        report.error(
            "baseline_collection_count",
            "minecraft:1.16.1",
            f"expected {baseline.collection_count} result collections, found {len(collections)}",
        )


def _summary(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
    collections: list[RecipeResultCollection],
    report: ValidationReport,
) -> GenerationSummary:
    diagnostics = report.diagnostics
    return GenerationSummary(
        recipe_count=len(recipes),
        output_item_count=len(items),
        inventory_item_count=len(inventory_items),
        collection_count=len(collections),
        error_count=sum(diagnostic.severity == "error" for diagnostic in diagnostics),
        warning_count=sum(diagnostic.severity == "warning" for diagnostic in diagnostics),
        diagnostics=diagnostics,
    )


def _serialize_item(item: SearchItem) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": item.name,
        "search_lines": [
            {"source": line.source, "text": line.text}
            for line in item.search_lines
        ],
        "generation_method": item.generation_method,
        "confidence": item.confidence,
    }
    if item.override_reason is not None:
        payload["override_reason"] = item.override_reason
    return payload


def _serialize_inventory_item(item: InventoryItem) -> dict[str, object]:
    return {"name": item.name}


def _serialize_recipe(recipe: NormalizedRecipe) -> dict[str, object]:
    return {
        "id": recipe.recipe_id,
        "type": recipe.recipe_type,
        "recipe_group": recipe.recipe_group,
        "recipe_book_category": recipe.recipe_book_category,
        "result_collection_id": recipe.result_collection_id,
        "output_item_id": recipe.output_item,
        "output_count": recipe.output_count,
        "ingredient_slots": [
            {"accepted_items": list(slot.accepted_items)}
            for slot in recipe.ingredient_slots
        ],
        "ingredient_layout": [
            None if slot is None else {"accepted_items": list(slot.accepted_items)}
            for slot in recipe.ingredient_layout
        ],
        "width": recipe.width,
        "height": recipe.height,
        "fits_2x2": recipe.fits_2x2,
        "fits_3x3": recipe.fits_3x3,
    }


def _serialize_collection(collection: RecipeResultCollection) -> dict[str, object]:
    return {
        "id": collection.collection_id,
        "recipe_book_category": collection.recipe_book_category,
        "recipe_group": collection.recipe_group,
        "recipe_ids": list(collection.recipe_ids),
        "output_item_ids": list(collection.output_item_ids),
    }


def _serialize_preset(preset: InventoryPreset) -> dict[str, object]:
    return {
        "id": preset.preset_id,
        "name": preset.name,
        "item_ids": list(preset.item_ids),
    }


def _serialize_report(summary: GenerationSummary, *, status: str) -> dict[str, object]:
    return {
        "schema_version": SCHEMA_VERSION,
        "status": status,
        "recipe_count": summary.recipe_count,
        "output_item_count": summary.output_item_count,
        "inventory_item_count": summary.inventory_item_count,
        "collection_count": summary.collection_count,
        "error_count": summary.error_count,
        "warning_count": summary.warning_count,
        "diagnostics": [
            {
                "severity": diagnostic.severity,
                "code": diagnostic.code,
                "subject": diagnostic.subject,
                "message": diagnostic.message,
            }
            for diagnostic in summary.diagnostics
        ],
    }


def _atomic_write_all(output_root: Path, payloads: dict[str, dict[str, object]]) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    temporary_paths: list[tuple[Path, Path]] = []
    backup_paths: list[tuple[Path, Path]] = []
    published_paths: list[Path] = []
    try:
        for filename, payload in payloads.items():
            destination = output_root / filename
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=output_root,
                prefix=f".{filename}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
                temporary.write("\n")
                temporary_path = Path(temporary.name)
            temporary_paths.append((temporary_path, destination))

        for _, destination in temporary_paths:
            if destination.exists():
                with NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=output_root,
                    prefix=f".{destination.name}.",
                    suffix=".backup",
                    delete=False,
                ) as backup:
                    backup_path = Path(backup.name)
                os.replace(destination, backup_path)
                backup_paths.append((backup_path, destination))
        for temporary_path, destination in temporary_paths:
            os.replace(temporary_path, destination)
            published_paths.append(destination)
    except OSError:
        destinations_with_backups = {
            destination for _, destination in backup_paths
        }
        for backup_path, destination in reversed(backup_paths):
            os.replace(backup_path, destination)
        for destination in reversed(published_paths):
            if destination not in destinations_with_backups:
                destination.unlink(missing_ok=True)
        raise
    finally:
        for temporary_path, _ in temporary_paths:
            temporary_path.unlink(missing_ok=True)
        for backup_path, _ in backup_paths:
            backup_path.unlink(missing_ok=True)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("minecraft-data"))
    parser.add_argument("--output", type=Path, default=Path("web/public/data"))
    parser.add_argument("--minecraft-version", default=MINECRAFT_VERSION)
    parser.add_argument(
        "--language-asset-root",
        type=Path,
        help="existing launcher assets directory containing objects/; never modified",
    )
    parser.add_argument(
        "--language-asset-index",
        type=Path,
        help="existing Minecraft asset index, such as assets/indexes/1.16.json",
    )
    parser.add_argument(
        "--allow-non-baseline",
        action="store_true",
        help=(
            "allow fixture or test source data instead of enforcing the pinned "
            "Minecraft 1.16.1 baseline"
        ),
    )
    arguments = parser.parse_args(argv)
    baseline = None if arguments.allow_non_baseline else BASELINES_BY_MINECRAFT_VERSION.get(arguments.minecraft_version)
    if baseline is None and not arguments.allow_non_baseline:
        parser.error(
            f"no validated generation baseline is registered for Minecraft {arguments.minecraft_version}; "
            "add one before publishing data"
        )
    try:
        summary = generate(
            arguments.source,
            arguments.output,
            baseline=baseline,
            language_asset_root=arguments.language_asset_root,
            language_asset_index=arguments.language_asset_index,
            minecraft_version=arguments.minecraft_version,
        )
    except GenerationFailed as error:
        for diagnostic in error.report.diagnostics:
            print(
                f"{diagnostic.severity} {diagnostic.code} {diagnostic.subject}: "
                f"{diagnostic.message}",
                file=sys.stderr,
            )
        if error.failure_report_path is None:
            print("Generation failed and the failure report could not be written.", file=sys.stderr)
        else:
            print(f"Generation failed. Diagnostics: {error.failure_report_path}", file=sys.stderr)
        return 1
    print(
        f"Generated {summary.recipe_count} recipes, {summary.output_item_count} output items, "
        f"{summary.inventory_item_count} inventory items, and {summary.collection_count} result collections "
        f"with {summary.error_count} validation errors."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
