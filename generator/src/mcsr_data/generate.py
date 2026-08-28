"""Generate deterministic, browser-ready Minecraft crafting search data."""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Sequence

from mcsr_data.models import InventoryItem, NormalizedRecipe, SearchItem
from mcsr_data.recipes import load_crafting_recipes, resolve_recipe_ingredients
from mcsr_data.tags import TagResolver
from mcsr_data.tooltips import build_search_item, load_overrides
from mcsr_data.translations import TranslationCatalog
from mcsr_data.validation import Diagnostic, ValidationReport


SCHEMA_VERSION = 2
FAILURE_REPORT_FILENAME = "validation-failure-report.json"


@dataclass(frozen=True)
class GenerationBaseline:
    recipe_count: int
    output_item_count: int


MINECRAFT_1_16_1_BASELINE = GenerationBaseline(
    recipe_count=634,
    output_item_count=562,
)


@dataclass(frozen=True)
class GenerationSummary:
    recipe_count: int
    output_item_count: int
    inventory_item_count: int
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
) -> GenerationSummary:
    """Validate source data and atomically publish browser artifacts."""
    report = ValidationReport()
    _validate_source_paths(source_root, report)
    recipes = _load_recipes(source_root, report)
    tags = _load_tags(source_root, report)
    catalog = _load_translations(source_root, report)
    overrides = _load_overrides(report)

    resolved_recipes = _resolve_recipes(recipes, tags, report)
    items = _build_items(resolved_recipes, catalog, overrides, report)
    inventory_items = _build_inventory_items(resolved_recipes, catalog, report)
    _validate_cross_references(resolved_recipes, items, inventory_items, report)
    if baseline is not None:
        _validate_baseline(resolved_recipes, items, baseline, report)

    summary = _summary(resolved_recipes, items, inventory_items, report)
    if summary.error_count:
        failure_path = output_root / FAILURE_REPORT_FILENAME
        try:
            _atomic_write_all(output_root, {
                FAILURE_REPORT_FILENAME: _serialize_report(summary, status="failed"),
            })
        except OSError as error:
            report.error("failure_report_write_failed", str(failure_path), str(error))
            summary = _summary(resolved_recipes, items, inventory_items, report)
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
        "crafting-recipes.json": {
            "schema_version": SCHEMA_VERSION,
            "recipes": [_serialize_recipe(recipe) for recipe in sorted(resolved_recipes, key=lambda item: item.recipe_id)],
        },
        "validation-report.json": _serialize_report(summary, status="valid"),
    }
    _atomic_write_all(output_root, payloads)
    return summary


def _validate_source_paths(source_root: Path, report: ValidationReport) -> None:
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
                f"required Minecraft 1.16.1 source {expected} is missing: {source_path}",
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


def _load_overrides(report: ValidationReport) -> dict[str, object]:
    try:
        return load_overrides()
    except ValueError as error:
        report.error("invalid_overrides", "overrides", str(error))
        return {}


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


def _build_items(
    recipes: list[NormalizedRecipe],
    catalog: TranslationCatalog | None,
    overrides: dict[str, object],
    report: ValidationReport,
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
            )
        except KeyError as error:
            report.error("missing_translation", item_id, str(error))
        except ValueError as error:
            report.error("unsupported_tooltip", item_id, str(error))
    return items


def _build_inventory_items(
    recipes: list[NormalizedRecipe],
    catalog: TranslationCatalog | None,
    report: ValidationReport,
) -> dict[str, InventoryItem]:
    if catalog is None:
        return {}
    items: dict[str, InventoryItem] = {}
    ingredient_ids = {
        item_id
        for recipe in recipes
        for slot in recipe.ingredient_slots
        for item_id in slot.accepted_items
    }
    for item_id in sorted(ingredient_ids):
        try:
            items[item_id] = InventoryItem(item_id=item_id, name=catalog.item_name(item_id))
        except KeyError as error:
            report.error("missing_inventory_translation", item_id, str(error))
    return items


def _validate_cross_references(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
    report: ValidationReport,
) -> None:
    seen_recipe_ids: set[str] = set()
    for recipe in recipes:
        if recipe.recipe_id in seen_recipe_ids:
            report.error("duplicate_recipe", recipe.recipe_id, "recipe ID is not unique")
        seen_recipe_ids.add(recipe.recipe_id)
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


def _validate_baseline(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
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


def _summary(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    inventory_items: dict[str, InventoryItem],
    report: ValidationReport,
) -> GenerationSummary:
    diagnostics = report.diagnostics
    return GenerationSummary(
        recipe_count=len(recipes),
        output_item_count=len(items),
        inventory_item_count=len(inventory_items),
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
        "output_item_id": recipe.output_item,
        "output_count": recipe.output_count,
        "ingredient_slots": [
            {"accepted_items": list(slot.accepted_items)}
            for slot in recipe.ingredient_slots
        ],
        "width": recipe.width,
        "height": recipe.height,
        "fits_2x2": recipe.fits_2x2,
        "fits_3x3": recipe.fits_3x3,
    }


def _serialize_report(summary: GenerationSummary, *, status: str) -> dict[str, object]:
    return {
        "schema_version": SCHEMA_VERSION,
        "status": status,
        "recipe_count": summary.recipe_count,
        "output_item_count": summary.output_item_count,
        "inventory_item_count": summary.inventory_item_count,
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
        for temporary_path, destination in temporary_paths:
            os.replace(temporary_path, destination)
    finally:
        for temporary_path, _ in temporary_paths:
            temporary_path.unlink(missing_ok=True)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("minecraft-data"))
    parser.add_argument("--output", type=Path, default=Path("web/public/data"))
    parser.add_argument(
        "--allow-non-baseline",
        action="store_true",
        help=(
            "allow fixture or test source data instead of enforcing the pinned "
            "Minecraft 1.16.1 baseline"
        ),
    )
    arguments = parser.parse_args(argv)
    baseline = None if arguments.allow_non_baseline else MINECRAFT_1_16_1_BASELINE
    try:
        summary = generate(arguments.source, arguments.output, baseline=baseline)
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
        f"and {summary.inventory_item_count} inventory items "
        f"with {summary.error_count} validation errors."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
