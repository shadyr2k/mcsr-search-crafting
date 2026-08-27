"""Generate deterministic, browser-ready Minecraft crafting search data."""

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from mcsr_data.models import NormalizedRecipe, SearchItem
from mcsr_data.recipes import load_crafting_recipes, resolve_recipe_ingredients
from mcsr_data.tags import TagResolver
from mcsr_data.tooltips import build_search_item, load_overrides
from mcsr_data.translations import TranslationCatalog
from mcsr_data.validation import Diagnostic, ValidationReport


SCHEMA_VERSION = 1


@dataclass(frozen=True)
class GenerationSummary:
    recipe_count: int
    output_item_count: int
    error_count: int
    warning_count: int
    diagnostics: tuple[Diagnostic, ...]


class GenerationFailed(ValueError):
    """Raised when source data cannot be safely published."""


def generate(source_root: Path, output_root: Path) -> GenerationSummary:
    """Validate source data and atomically publish the three browser artifacts."""
    report = ValidationReport()
    recipes = _load_recipes(source_root, report)
    tags = _load_tags(source_root, report)
    catalog = _load_translations(source_root, report)
    overrides = _load_overrides(report)

    resolved_recipes = _resolve_recipes(recipes, tags, report)
    items = _build_items(resolved_recipes, catalog, overrides, report)
    _validate_cross_references(resolved_recipes, items, report)

    summary = _summary(resolved_recipes, items, report)
    if summary.error_count:
        raise GenerationFailed(f"validation failed with {summary.error_count} error(s)")

    payloads = {
        "search-items.json": {
            "schema_version": SCHEMA_VERSION,
            "items": {item_id: _serialize_item(item) for item_id, item in sorted(items.items())},
        },
        "crafting-recipes.json": {
            "schema_version": SCHEMA_VERSION,
            "recipes": [_serialize_recipe(recipe) for recipe in sorted(resolved_recipes, key=lambda item: item.recipe_id)],
        },
        "validation-report.json": _serialize_report(summary),
    }
    _atomic_write_all(output_root, payloads)
    return summary


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


def _validate_cross_references(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
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


def _summary(
    recipes: list[NormalizedRecipe],
    items: dict[str, SearchItem],
    report: ValidationReport,
) -> GenerationSummary:
    diagnostics = report.diagnostics
    return GenerationSummary(
        recipe_count=len(recipes),
        output_item_count=len(items),
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


def _serialize_report(summary: GenerationSummary) -> dict[str, object]:
    return {
        "schema_version": SCHEMA_VERSION,
        "recipe_count": summary.recipe_count,
        "output_item_count": summary.output_item_count,
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("minecraft-data"))
    parser.add_argument("--output", type=Path, default=Path("web/public/data"))
    arguments = parser.parse_args()
    summary = generate(arguments.source, arguments.output)
    print(
        f"Generated {summary.recipe_count} recipes and {summary.output_item_count} output items "
        f"with {summary.error_count} validation errors."
    )


if __name__ == "__main__":
    main()
