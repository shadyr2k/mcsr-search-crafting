"""Build the standalone Minecraft language-reference artifact."""

from dataclasses import dataclass

from mcsr_data.translations import TranslationCatalog


LANGUAGE_INFO_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class LanguageInfoEntry:
    identifier: str
    key: str
    requirement_key: str | None = None


# These are the exact 1.16.1 language keys inspected from en_us.json.
# Minecraft calls the medium difficulty "normal" in this version.
_FIXED_SECTIONS: tuple[tuple[str, tuple[LanguageInfoEntry, ...]], ...] = (
    ("difficulties", (
        LanguageInfoEntry("peaceful", "options.difficulty.peaceful"),
        LanguageInfoEntry("easy", "options.difficulty.easy"),
        LanguageInfoEntry("normal", "options.difficulty.normal"),
        LanguageInfoEntry("hard", "options.difficulty.hard"),
    )),
    ("options", (
        LanguageInfoEntry("options", "options.title"),
        LanguageInfoEntry("video_settings", "options.video"),
        LanguageInfoEntry("render_distance", "options.renderDistance"),
        LanguageInfoEntry("entity_distance", "options.entityDistanceScaling"),
    )),
    ("subtitles", (
        LanguageInfoEntry("lava_pops", "subtitles.block.lava.ambient"),
        LanguageInfoEntry("water_flows", "subtitles.block.water.ambient"),
        LanguageInfoEntry("bubbles", "subtitles.block.bubble_column.bubble_pop"),
        LanguageInfoEntry("blaze", "subtitles.entity.blaze.ambient"),
        LanguageInfoEntry("silverfish", "subtitles.entity.silverfish.ambient"),
        LanguageInfoEntry("endermite", "subtitles.entity.endermite.ambient"),
        LanguageInfoEntry("piglin", "subtitles.entity.piglin.ambient"),
        LanguageInfoEntry("skeleton", "subtitles.entity.skeleton.ambient"),
    )),
    ("game_modes", (
        LanguageInfoEntry("survival", "gameMode.survival"),
        LanguageInfoEntry("creative", "gameMode.creative"),
        LanguageInfoEntry("adventure", "gameMode.adventure"),
        LanguageInfoEntry("spectator", "gameMode.spectator"),
    )),
    ("enchantments", (
        LanguageInfoEntry("unbreaking", "enchantment.minecraft.unbreaking"),
        LanguageInfoEntry("efficiency", "enchantment.minecraft.efficiency"),
        LanguageInfoEntry("binding_curse", "enchantment.minecraft.binding_curse"),
        LanguageInfoEntry("mending", "enchantment.minecraft.mending"),
        LanguageInfoEntry("silk_touch", "enchantment.minecraft.silk_touch"),
        LanguageInfoEntry("protection", "enchantment.minecraft.protection"),
        LanguageInfoEntry("looting", "enchantment.minecraft.looting"),
        LanguageInfoEntry("thorns", "enchantment.minecraft.thorns"),
        LanguageInfoEntry("fire_aspect", "enchantment.minecraft.fire_aspect"),
        LanguageInfoEntry("feather_falling", "enchantment.minecraft.feather_falling"),
        LanguageInfoEntry("depth_strider", "enchantment.minecraft.depth_strider"),
        LanguageInfoEntry("soul_speed", "enchantment.minecraft.soul_speed"),
        LanguageInfoEntry("quick_charge", "enchantment.minecraft.quick_charge"),
        LanguageInfoEntry("knockback", "enchantment.minecraft.knockback"),
    )),
    ("advancements", (
        LanguageInfoEntry("acquire_hardware", "advancements.story.smelt_iron.title", "advancements.story.smelt_iron.description"),
        LanguageInfoEntry("diamonds", "advancements.story.mine_diamond.title", "advancements.story.mine_diamond.description"),
        LanguageInfoEntry("iron_pick", "advancements.story.iron_tools.title", "advancements.story.iron_tools.description"),
        LanguageInfoEntry("hot_stuff", "advancements.story.lava_bucket.title", "advancements.story.lava_bucket.description"),
        LanguageInfoEntry("go_deeper", "advancements.story.enter_the_nether.title", "advancements.story.enter_the_nether.description"),
        LanguageInfoEntry("those_were_the_days", "advancements.nether.find_bastion.title", "advancements.nether.find_bastion.description"),
        LanguageInfoEntry("oh_shiny", "advancements.nether.distract_piglin.title", "advancements.nether.distract_piglin.description"),
        LanguageInfoEntry("war_pigs", "advancements.nether.loot_bastion.title", "advancements.nether.loot_bastion.description"),
        LanguageInfoEntry("ice_bucket_challenge", "advancements.story.form_obsidian.title", "advancements.story.form_obsidian.description"),
        LanguageInfoEntry("cutting_onions", "advancements.nether.obtain_crying_obsidian.title", "advancements.nether.obtain_crying_obsidian.description"),
        LanguageInfoEntry("terrible_fortress", "advancements.nether.find_fortress.title", "advancements.nether.find_fortress.description"),
        LanguageInfoEntry("monster_hunter", "advancements.adventure.kill_a_mob.title", "advancements.adventure.kill_a_mob.description"),
        LanguageInfoEntry("into_fire", "advancements.nether.obtain_blaze_rod.title", "advancements.nether.obtain_blaze_rod.description"),
        LanguageInfoEntry("eye_spy", "advancements.story.follow_ender_eye.title", "advancements.story.follow_ender_eye.description"),
        LanguageInfoEntry("the_end", "advancements.story.enter_the_end.title", "advancements.story.enter_the_end.description"),
        LanguageInfoEntry("ol_betsy", "advancements.adventure.ol_betsy.title", "advancements.adventure.ol_betsy.description"),
        LanguageInfoEntry("take_aim", "advancements.adventure.shoot_arrow.title", "advancements.adventure.shoot_arrow.description"),
        LanguageInfoEntry("free_the_end", "advancements.end.kill_dragon.title", "advancements.end.kill_dragon.description"),
        LanguageInfoEntry("nine_lives", "advancements.nether.charge_respawn_anchor.title", "advancements.nether.charge_respawn_anchor.description"),
    )),
)


def required_fixed_language_info_keys() -> tuple[str, ...]:
    """Return fixed 1.16.1 language keys needed in every source catalog."""
    return tuple(
        key
        for _, entries in _FIXED_SECTIONS
        for entry in entries
        for key in (entry.key, entry.requirement_key)
        if key is not None
    )


def build_localized_language_info(
    base_catalog: TranslationCatalog,
    localized_catalogs: dict[str, TranslationCatalog],
) -> dict[str, object]:
    """Return deterministic definitions plus locale-keyed Minecraft translations."""
    sections = _sections(base_catalog)
    catalogs = {"en_us": base_catalog, **localized_catalogs}
    return {
        "schema_version": LANGUAGE_INFO_SCHEMA_VERSION,
        "minecraft_version": "1.16.1",
        "sections": {
            section_id: [_serialize_definition(base_catalog, entry) for entry in entries]
            for section_id, entries in sections
        },
        "locales": {
            locale: {
                section_id: {
                    entry.identifier: _serialize_locale_entry(catalog, entry)
                    for entry in entries
                }
                for section_id, entries in sections
            }
            for locale, catalog in sorted(catalogs.items())
        },
    }


def _sections(catalog: TranslationCatalog) -> tuple[tuple[str, tuple[LanguageInfoEntry, ...]], ...]:
    return _FIXED_SECTIONS


def _serialize_definition(catalog: TranslationCatalog, entry: LanguageInfoEntry) -> dict[str, str]:
    definition = {
        "id": entry.identifier,
        "key": entry.key,
        "english": catalog.translation(entry.key),
    }
    if entry.requirement_key is not None:
        definition["requirement_key"] = entry.requirement_key
        definition["english_requirement"] = catalog.translation(entry.requirement_key)
    return definition


def _serialize_locale_entry(catalog: TranslationCatalog, entry: LanguageInfoEntry) -> dict[str, str]:
    value = {"name": catalog.translation(entry.key)}
    if entry.requirement_key is not None:
        value["requirement"] = catalog.translation(entry.requirement_key)
    return value
