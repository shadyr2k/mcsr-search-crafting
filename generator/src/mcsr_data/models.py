from dataclasses import dataclass
from typing import Literal


RecipeBookCategory = Literal[
    "crafting_building_blocks",
    "crafting_equipment",
    "crafting_redstone",
    "crafting_misc",
]


@dataclass(frozen=True)
class IngredientRef:
    kind: Literal["item", "tag"]
    value: str


@dataclass(frozen=True)
class IngredientSlot:
    options: tuple[IngredientRef, ...]
    accepted_items: tuple[str, ...] = ()


@dataclass(frozen=True)
class NormalizedRecipe:
    recipe_id: str
    recipe_type: Literal["shaped", "shapeless"]
    recipe_group: str | None
    output_item: str
    output_count: int
    ingredient_slots: tuple[IngredientSlot, ...]
    width: int
    height: int
    fits_2x2: bool
    fits_3x3: bool
    recipe_book_category: RecipeBookCategory | None = None
    result_collection_id: str | None = None


@dataclass(frozen=True)
class RecipeResultCollection:
    collection_id: str
    recipe_book_category: RecipeBookCategory
    recipe_group: str | None
    recipe_ids: tuple[str, ...]
    output_item_ids: tuple[str, ...]


@dataclass(frozen=True)
class SearchLine:
    source: Literal["name", "item_description", "attribute_header", "attribute", "override"]
    text: str


@dataclass(frozen=True)
class SearchItem:
    item_id: str
    name: str
    search_lines: tuple[SearchLine, ...]
    generation_method: Literal[
        "name_only", "derived_item_tooltip", "derived_attribute_logic", "explicit_override"
    ]
    confidence: Literal["source_reproduced", "explicit_override"]
    override_reason: str | None = None


@dataclass(frozen=True)
class InventoryItem:
    item_id: str
    name: str
