from dataclasses import dataclass
from typing import Literal


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
    output_item: str
    output_count: int
    ingredient_slots: tuple[IngredientSlot, ...]
    width: int
    height: int
    fits_2x2: bool
    fits_3x3: bool
