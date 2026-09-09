// Site-owned English copy for advancement tooltips. Edit these descriptions directly;
// they are intentionally independent of Minecraft's localized advancement requirements.
export const advancementTooltips: Readonly<Record<string, string>> = {
  acquire_hardware: 'obtain iron',
  diamonds: 'obtain diamonds',
  iron_pick: 'obtain iron pick',
  hot_stuff: 'fill a bucket with lava',
  go_deeper: 'enter the nether', 
  those_were_the_days: 'enter a bastion',
  oh_shiny: 'distract piglins with gold',
  war_pigs: 'loot a bastion chest',
  ice_bucket_challenge: 'obtain obsidian',
  cutting_onions: 'obtain crying obsidian',
  terrible_fortress: 'enter a fortress',
  monster_hunter: 'kill a hostile mob',
  into_fire: 'obtain a blaze rod',
  eye_spy: 'enter a stronghold',
  the_end: 'enter the end portal',
  ol_betsy: 'shoot a crossbow',
  take_aim: 'shoot something with an arrow',
  free_the_end: 'defeat the ender dragon',
  nine_lives: 'charge a respawn anchor to the maximum',
}

export function advancementTooltip(entryId: string, minecraftFallback: string | undefined): string | undefined {
  return advancementTooltips[entryId] ?? minecraftFallback
}
