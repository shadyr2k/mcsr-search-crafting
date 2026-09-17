import json
from dataclasses import replace
from pathlib import Path
from typing import Callable, Mapping, Sequence, cast
from urllib.parse import quote

from mcsr_data.models import (
    NormalizedRecipe,
    RecipeBookCategory,
    RecipeResultCollection,
)


class RecipeCollectionError(ValueError):
    """Raised when recipe-book categories or result collections are invalid."""


CategoryLoader = Callable[[], dict[str, RecipeBookCategory]]
CollectionAssigner = Callable[
    [Sequence[NormalizedRecipe], Mapping[str, RecipeBookCategory]],
    tuple[list[NormalizedRecipe], list[RecipeResultCollection]],
]


_CATEGORY_PATH = Path(__file__).with_name("recipe_book_categories.json")
_MINECRAFT_VERSION = "1.16.1"
_CATEGORIES: tuple[RecipeBookCategory, ...] = (
    "crafting_building_blocks",
    "crafting_equipment",
    "crafting_redstone",
    "crafting_misc",
)
_CATEGORY_SET = frozenset(_CATEGORIES)


def load_recipe_book_categories(
    path: Path | None = None,
) -> dict[str, RecipeBookCategory]:
    category_path = path or _CATEGORY_PATH
    try:
        raw = json.loads(category_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RecipeCollectionError(
            f"{category_path}: cannot load recipe-book categories: {error}"
        ) from error

    if not isinstance(raw, dict):
        raise RecipeCollectionError(f"{category_path}: resource must be an object")
    if raw.get("minecraft_version") != _MINECRAFT_VERSION:
        raise RecipeCollectionError(
            f"{category_path}: minecraft_version must be '{_MINECRAFT_VERSION}'"
        )
    raw_categories = raw.get("categories")
    if not isinstance(raw_categories, dict):
        raise RecipeCollectionError(f"{category_path}: categories must be an object")

    unknown_categories = sorted(set(raw_categories) - _CATEGORY_SET)
    if unknown_categories:
        raise RecipeCollectionError(
            f"{category_path}: unknown recipe-book category: {unknown_categories[0]}"
        )
    missing_categories = [
        category for category in _CATEGORIES if category not in raw_categories
    ]
    if missing_categories:
        raise RecipeCollectionError(
            f"{category_path}: missing recipe-book categories: "
            f"{', '.join(missing_categories)}"
        )

    assignments: dict[str, RecipeBookCategory] = {}
    for category in _CATEGORIES:
        raw_item_ids = raw_categories[category]
        if not isinstance(raw_item_ids, list):
            raise RecipeCollectionError(
                f"{category_path}: {category} item IDs must be a list"
            )
        if not all(isinstance(item_id, str) and item_id for item_id in raw_item_ids):
            raise RecipeCollectionError(
                f"{category_path}: {category} item IDs must be non-empty strings"
            )
        item_ids = cast(list[str], raw_item_ids)
        if item_ids != sorted(set(item_ids)):
            raise RecipeCollectionError(
                f"{category_path}: {category} item IDs must be sorted and unique"
            )
        for item_id in item_ids:
            previous = assignments.get(item_id)
            if previous is not None:
                raise RecipeCollectionError(
                    f"{category_path}: duplicate output item ID {item_id} in "
                    f"{previous} and {category}"
                )
            assignments[item_id] = category
    return assignments


def collection_id_for(
    category: RecipeBookCategory,
    recipe_group: str | None,
    recipe_id: str,
) -> str:
    if recipe_group is None:
        return f"{category}/recipe/{quote(recipe_id, safe='')}"
    return f"{category}/group/{quote(recipe_group, safe='')}"


def assign_recipe_result_collections(
    recipes: Sequence[NormalizedRecipe],
    categories: Mapping[str, RecipeBookCategory],
) -> tuple[list[NormalizedRecipe], list[RecipeResultCollection]]:
    ordered_recipes = sorted(recipes, key=lambda recipe: recipe.recipe_id)
    seen_recipe_ids: set[str] = set()
    grouped: dict[
        tuple[RecipeBookCategory, str, str],
        list[NormalizedRecipe],
    ] = {}

    for recipe in ordered_recipes:
        if recipe.recipe_id in seen_recipe_ids:
            raise RecipeCollectionError(f"duplicate recipe ID: {recipe.recipe_id}")
        seen_recipe_ids.add(recipe.recipe_id)

        category = recipe.recipe_book_category or categories.get(recipe.output_item)
        if category is None:
            raise RecipeCollectionError(
                f"{recipe.recipe_id}: no recipe-book category for output "
                f"{recipe.output_item}"
            )
        if category not in _CATEGORY_SET:
            raise RecipeCollectionError(
                f"{recipe.recipe_id}: unknown recipe-book category {category}"
            )
        if recipe.recipe_group is None:
            key = (category, "recipe", recipe.recipe_id)
        else:
            key = (category, "group", recipe.recipe_group)
        grouped.setdefault(key, []).append(recipe)

    collections: list[RecipeResultCollection] = []
    collection_keys_by_id: dict[
        str,
        tuple[RecipeBookCategory, str, str],
    ] = {}
    collection_ids_by_recipe: dict[str, str] = {}

    for key, members in grouped.items():
        category, key_kind, key_value = key
        recipe_group = key_value if key_kind == "group" else None
        id_recipe = members[0].recipe_id if recipe_group is not None else key_value
        collection_id = collection_id_for(category, recipe_group, id_recipe)
        previous_key = collection_keys_by_id.get(collection_id)
        if previous_key is not None and previous_key != key:
            raise RecipeCollectionError(f"collection ID collision: {collection_id}")
        collection_keys_by_id[collection_id] = key

        recipe_ids = tuple(member.recipe_id for member in members)
        for recipe_id in recipe_ids:
            if recipe_id in collection_ids_by_recipe:
                raise RecipeCollectionError(
                    f"recipe assigned to multiple collections: {recipe_id}"
                )
            collection_ids_by_recipe[recipe_id] = collection_id
        collections.append(RecipeResultCollection(
            collection_id=collection_id,
            recipe_book_category=category,
            recipe_group=recipe_group,
            recipe_ids=recipe_ids,
            output_item_ids=tuple(sorted({member.output_item for member in members})),
        ))

    missing_recipe_ids = sorted(seen_recipe_ids - set(collection_ids_by_recipe))
    if missing_recipe_ids:
        raise RecipeCollectionError(
            f"recipe assigned to no collection: {missing_recipe_ids[0]}"
        )

    enriched = [
        replace(
            recipe,
            recipe_book_category=recipe.recipe_book_category or categories[recipe.output_item],
            result_collection_id=collection_ids_by_recipe[recipe.recipe_id],
        )
        for recipe in ordered_recipes
    ]
    return enriched, sorted(collections, key=lambda collection: collection.collection_id)
