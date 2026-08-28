import json
from dataclasses import replace
from pathlib import Path
from typing import Literal, cast

from mcsr_data.models import IngredientRef, IngredientSlot, NormalizedRecipe
from mcsr_data.tags import TagResolver


class RecipeParseError(ValueError):
    """Raised when a crafting recipe cannot be normalized."""


def parse_recipe(recipe_id: str, raw: dict[str, object]) -> NormalizedRecipe | None:
    recipe_type = raw.get("type")
    if recipe_type not in {"minecraft:crafting_shaped", "minecraft:crafting_shapeless"}:
        return None

    output_item, output_count = _parse_result(recipe_id, raw.get("result"))
    if recipe_type == "minecraft:crafting_shaped":
        slots, width, height = _parse_shaped(recipe_id, raw)
        normalized_type: Literal["shaped", "shapeless"] = "shaped"
        fits_2x2 = width <= 2 and height <= 2
        fits_3x3 = width <= 3 and height <= 3
    else:
        slots, width, height = _parse_shapeless(recipe_id, raw)
        normalized_type = "shapeless"
        fits_2x2 = len(slots) <= 4
        fits_3x3 = len(slots) <= 9

    return NormalizedRecipe(
        recipe_id=recipe_id,
        recipe_type=normalized_type,
        output_item=output_item,
        output_count=output_count,
        ingredient_slots=tuple(slots),
        width=width,
        height=height,
        fits_2x2=fits_2x2,
        fits_3x3=fits_3x3,
    )


def load_crafting_recipes(path: Path) -> list[NormalizedRecipe]:
    recipes: list[NormalizedRecipe] = []
    for recipe_path in sorted(path.glob("*.json")):
        raw = json.loads(recipe_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise RecipeParseError(f"{recipe_path}: recipe must be an object")
        recipe = parse_recipe(f"minecraft:{recipe_path.stem}", raw)
        if recipe is not None:
            recipes.append(recipe)
    return recipes


def resolve_recipe_ingredients(recipe: NormalizedRecipe, tags: TagResolver) -> NormalizedRecipe:
    """Return a recipe whose slots include each concrete accepted item."""
    slots = tuple(
        replace(
            slot,
            accepted_items=tuple(sorted({
                item
                for option in slot.options
                for item in (tags.resolve(option.value) if option.kind == "tag" else (option.value,))
            })),
        )
        for slot in recipe.ingredient_slots
    )
    return replace(recipe, ingredient_slots=slots)


def _parse_result(recipe_id: str, raw_result: object) -> tuple[str, int]:
    if isinstance(raw_result, str):
        return raw_result, 1
    if not isinstance(raw_result, dict):
        raise RecipeParseError(f"{recipe_id}: result must be an item string or object")
    item = raw_result.get("item")
    count = raw_result.get("count", 1)
    if not isinstance(item, str) or not item:
        raise RecipeParseError(f"{recipe_id}: result item is required")
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise RecipeParseError(f"{recipe_id}: result count must be a positive integer")
    return item, count


def _parse_shaped(recipe_id: str, raw: dict[str, object]) -> tuple[list[IngredientSlot], int, int]:
    raw_pattern = raw.get("pattern")
    if not isinstance(raw_pattern, list) or not raw_pattern or not all(isinstance(row, str) for row in raw_pattern):
        raise RecipeParseError(f"{recipe_id}: pattern must be a non-empty list of strings")
    pattern = _trim_pattern(cast(list[str], raw_pattern), recipe_id)

    raw_key = raw.get("key")
    if not isinstance(raw_key, dict):
        raise RecipeParseError(f"{recipe_id}: shaped recipe key must be an object")

    slots: list[IngredientSlot] = []
    for row in pattern:
        for symbol in row:
            if symbol == " ":
                continue
            if symbol not in raw_key:
                raise RecipeParseError(f"{recipe_id}: pattern symbol {symbol!r} is missing key")
            slots.append(_parse_slot(recipe_id, raw_key[symbol]))
    return slots, len(pattern[0]), len(pattern)


def _trim_pattern(pattern: list[str], recipe_id: str) -> list[str]:
    first_row = 0
    last_row = len(pattern)
    while first_row < last_row and pattern[first_row].strip(" ") == "":
        first_row += 1
    while last_row > first_row and pattern[last_row - 1].strip(" ") == "":
        last_row -= 1
    trimmed = pattern[first_row:last_row]
    if not trimmed:
        raise RecipeParseError(f"{recipe_id}: pattern cannot be all spaces")
    if len({len(row) for row in trimmed}) != 1:
        raise RecipeParseError(f"{recipe_id}: pattern rows must have equal widths")

    left = min(next((index for index, symbol in enumerate(row) if symbol != " "), len(row)) for row in trimmed)
    right = max(index for row in trimmed for index, symbol in enumerate(row) if symbol != " ")
    if left > right:
        raise RecipeParseError(f"{recipe_id}: pattern cannot be all spaces")
    return [row[left:right + 1] for row in trimmed]


def _parse_shapeless(recipe_id: str, raw: dict[str, object]) -> tuple[list[IngredientSlot], int, int]:
    raw_ingredients = raw.get("ingredients")
    if not isinstance(raw_ingredients, list) or not raw_ingredients:
        raise RecipeParseError(f"{recipe_id}: shapeless ingredients must be a non-empty list")
    slots = [_parse_slot(recipe_id, ingredient) for ingredient in raw_ingredients]
    return slots, len(slots), 1


def _parse_slot(recipe_id: str, raw_slot: object) -> IngredientSlot:
    choices = raw_slot if isinstance(raw_slot, list) else [raw_slot]
    if not choices:
        raise RecipeParseError(f"{recipe_id}: ingredient alternatives cannot be empty")
    options = tuple(_parse_ref(recipe_id, choice) for choice in choices)
    return IngredientSlot(options=options)


def _parse_ref(recipe_id: str, raw_ref: object) -> IngredientRef:
    if not isinstance(raw_ref, dict):
        raise RecipeParseError(f"{recipe_id}: ingredient must be an object")
    item = raw_ref.get("item")
    tag = raw_ref.get("tag")
    if isinstance(item, str) and item and tag is None:
        return IngredientRef(kind="item", value=item)
    if isinstance(tag, str) and tag and item is None:
        return IngredientRef(kind="tag", value=tag)
    raise RecipeParseError(f"{recipe_id}: ingredient must define exactly one item or tag")
