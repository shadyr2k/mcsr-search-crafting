from mcsr_data.language_info import (
    build_localized_language_info,
    required_fixed_language_info_keys,
)
from mcsr_data.translations import TranslationCatalog


def test_builds_separate_locale_keyed_language_info_from_1_16_key_families():
    english = {
        key: key.replace(".", " ")
        for key in required_fixed_language_info_keys()
    }
    english.update({
        "options.difficulty.easy": "Easy",
        "enchantment.minecraft.unbreaking": "Unbreaking",
        "enchantment.minecraft.efficiency": "Efficiency",
        "gameMode.survival": "Survival Mode",
        "advancements.story.smelt_iron.title": "Acquire Hardware",
        "advancements.story.smelt_iron.description": "Smelt an iron ingot",
    })
    base = TranslationCatalog(english)
    german = TranslationCatalog({
        "options.difficulty.easy": "Leicht",
        "enchantment.minecraft.unbreaking": "Haltbarkeit",
        "advancements.story.smelt_iron.title": "Hart wie Eisen",
        "advancements.story.smelt_iron.description": "Schmelze einen Eisenbarren",
    }, fallback=base)

    payload = build_localized_language_info(base, {"de_de": german})

    assert payload["schema_version"] == 1
    assert list(payload["sections"]) == [
        "difficulties",
        "options",
        "subtitles",
        "game_modes",
        "enchantments",
        "advancements",
    ]
    assert [entry["key"] for entry in payload["sections"]["enchantments"]] == [
        "enchantment.minecraft.unbreaking",
        "enchantment.minecraft.efficiency",
        "enchantment.minecraft.binding_curse",
        "enchantment.minecraft.mending",
        "enchantment.minecraft.silk_touch",
        "enchantment.minecraft.protection",
        "enchantment.minecraft.looting",
        "enchantment.minecraft.thorns",
        "enchantment.minecraft.fire_aspect",
        "enchantment.minecraft.feather_falling",
        "enchantment.minecraft.depth_strider",
        "enchantment.minecraft.soul_speed",
        "enchantment.minecraft.quick_charge",
        "enchantment.minecraft.knockback",
    ]
    assert payload["locales"]["de_de"]["difficulties"]["easy"] == {"name": "Leicht"}
    assert payload["locales"]["de_de"]["enchantments"]["unbreaking"] == {"name": "Haltbarkeit"}
    assert payload["locales"]["de_de"]["advancements"]["acquire_hardware"] == {
        "name": "Hart wie Eisen",
        "requirement": "Schmelze einen Eisenbarren",
    }
