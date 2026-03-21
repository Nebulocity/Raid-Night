/**
 * raidCatalog.js
 *
 * The single source of truth for all raids and bosses in the game.
 *
 * Each raid has:
 *   - id, name
 *   - buttonKey / buttonPath: image shown on the raid selection screen
 *   - backgroundKey / backgroundPath: background shown on the boss selection screen
 *   - bosses: ordered array of boss entries for this raid
 *
 * Each boss has:
 *   - id: unique identifier used in save data and JSON file keys
 *   - name: display name shown in menus
 *   - buttonKey / buttonPath: image shown on the boss selection screen
 *   - encounterBackgroundKey / encounterBackgroundPath: background during the fight
 *   - idleKey / idlePath: boss idle spritesheet (loaded by BossLoadingScene)
 *   - attackingKey / attackingPath: boss attack spritesheet
 *   - defeatedKey / defeatedPath: boss defeated spritesheet
 *   - levelKey: cache key for the level data JSON
 *   - levelPath: path to the level data JSON file
 *   - unlockedBy: array of boss IDs that must be defeated before this boss unlocks.
 *                 Empty array means always unlocked.
 */

// ============================================================
// Asset path helpers
// ============================================================

function raidAssetPath(raidId, filename) {
  return `assets/raids/${raidId}/${filename}`;
}

function bossAssetPath(raidId, bossId, subfolder, filename) {
  return `assets/raids/${raidId}/${subfolder}/${filename}`;
}

// ============================================================
// THE DEMON BASEMENT
// One boss: Magtheridax the Frustrated. Always unlocked.
// ============================================================

const the_basement_demon = {
  id:              'the_basement_demon',
  name:            'The Basement Demon',
  buttonKey:       'button_the_basement_demon',
  buttonPath:      raidAssetPath('the_basement_demon', 'button_the_basement_demon.webp'),
  bannerKey:       'banner_the_basement_demon',
  bannerPath:      raidAssetPath('the_basement_demon', 'banner_the_basement_demon.webp'),
  backgroundKey:   'bg_the_basement_demon',
  backgroundPath:  raidAssetPath('the_basement_demon', 'bg_the_basement_demon.webp'),
  bosses: [
    {
      id:                       'magtheridax',
      name:                     'Magtheridax the Frustrated',
      buttonKey:                'button_boss_magtheridax',
      buttonPath:               raidAssetPath('the_basement_demon', 'buttons/button_magtheridax.webp'),
      encounterBackgroundKey:   'bg_the_basement_demon',
      encounterBackgroundPath:  raidAssetPath('the_basement_demon', 'backgrounds/bg_the_basement_demon.webp'),
      idleKey:                  'boss_magtheridax_idle',
      idlePath:                 raidAssetPath('the_basement_demon', 'bosses/idle/boss_magtheridax_idle.webp'),
      attackingKey:             'boss_magtheridax_attacking',
      attackingPath:            raidAssetPath('the_basement_demon', 'bosses/attacking/boss_magtheridax_attacking.webp'),
      defeatedKey:              'boss_magtheridax_defeated',
      defeatedPath:             raidAssetPath('the_basement_demon', 'bosses/defeated/boss_magtheridax_defeated.webp'),
      levelKey:                 'level_magtheridax',
      levelPath:                'data/the_basement_demon/magtheridax.json',
      unlockedBy:               [],
    },
  ],
};

// ============================================================
// THE CRACKED MOUNTAIN
// Two encounters. Both always unlocked.
//   - High Chief Bonkgar and his council (fought together)
//   - Grull the Wyrm Whacker
// ============================================================

const THE_CRACKED_MOUNTAIN = {
  id:              'the_cracked_mountain',
  name:            'The Cracked Mountain',
  buttonKey:       'button_the_cracked_mountain',
  buttonPath:      raidAssetPath('the_cracked_mountain', 'button_the_cracked_mountain.webp'),
  bannerKey:       'banner_the_cracked_mountain',
  bannerPath:      raidAssetPath('the_cracked_mountain', 'banner_the_cracked_mountain.webp'),
  backgroundKey:   'bg_the_cracked_mountain',
  backgroundPath:  raidAssetPath('the_cracked_mountain', 'bg_the_cracked_mountain.webp'),
  bosses: [
    {
      id:                       'high_chief_bonkgar',
      name:                     'High Chief Bonkgar',
      buttonKey:                'button_boss_high_chief_bonkgar',
      buttonPath:               raidAssetPath('the_cracked_mountain', 'buttons/button_high_chief_bonkgar.webp'),
      encounterBackgroundKey:   'bg_encounter_high_chief_bonkgar',
      encounterBackgroundPath:  raidAssetPath('the_cracked_mountain', 'backgrounds/bg_high_chief_bonkgar.webp'),
      idleKey:                  'boss_high_chief_bonkgar_idle',
      idlePath:                 raidAssetPath('the_cracked_mountain', 'bosses/idle/boss_high_chief_bonkgar_idle.webp'),
      attackingKey:             'boss_high_chief_bonkgar_attacking',
      attackingPath:            raidAssetPath('the_cracked_mountain', 'bosses/attacking/boss_high_chief_bonkgar_attacking.webp'),
      defeatedKey:              'boss_high_chief_bonkgar_defeated',
      defeatedPath:             raidAssetPath('the_cracked_mountain', 'bosses/defeated/boss_high_chief_bonkgar_defeated.webp'),
      levelKey:                 'level_high_chief_bonkgar',
      levelPath:                'data/the_cracked_mountain/high_chief_bonkgar.json',
      unlockedBy:               [],
    },
    {
      id:                       'grull_the_wyrm_whacker',
      name:                     'Grull the Wyrm Whacker',
      buttonKey:                'button_boss_grull',
      buttonPath:               raidAssetPath('the_cracked_mountain', 'buttons/button_grull_the_wyrm_whacker.webp'),
      encounterBackgroundKey:   'bg_encounter_grull',
      encounterBackgroundPath:  raidAssetPath('the_cracked_mountain', 'backgrounds/bg_grull_the_wyrm_whacker.webp'),
      idleKey:                  'boss_grull_idle',
      idlePath:                 raidAssetPath('the_cracked_mountain', 'bosses/idle/boss_grull_the_wyrm_whacker_idle.webp'),
      attackingKey:             'boss_grull_attacking',
      attackingPath:            raidAssetPath('the_cracked_mountain', 'bosses/attacking/boss_grull_the_wyrm_whacker_attacking.webp'),
      defeatedKey:              'boss_grull_defeated',
      defeatedPath:             raidAssetPath('the_cracked_mountain', 'bosses/defeated/boss_grull_the_wyrm_whacker_defeated.webp'),
      levelKey:                 'level_grull',
      levelPath:                'data/the_cracked_mountain/grull_the_wyrm_whacker.json',
      unlockedBy:               ['high_chief_bonkgar'],
    },
  ],
};

// ============================================================
// SPOOKSPIRE KEEP
// Ten encounters with unlock requirements (see flowchart below).
//
// Unlock flowchart:
//
//   [sir_trotsalot_and_nighttime]  <- always unlocked
//          |           |
//     [mortimer]  [lady_proper]
//          |           
//   [the_movie_theater]  [the_archivist]
//          |                  |
//   [phantom_magister]  [aether_drake]
//          |
//   [malvestian_doomhoof_and_kilwretch]
//   [dreadwing]
//
//   [prince_malarkey] <- unlocks after BOTH the_movie_theater AND the_archivist
// ============================================================

const SPOOKSPIRE_KEEP = {
  id:              'spookspire_keep',
  name:            'Spookspire Keep',
  buttonKey:       'button_spookspire_keep',
  buttonPath:      raidAssetPath('spookspire_keep', 'button_spookspire_keep.webp'),
  bannerKey:       'banner_spookspire_keep',
  bannerPath:      raidAssetPath('spookspire_keep', 'banner_spookspire_keep.webp'),
  backgroundKey:   'bg_spookspire_keep',
  backgroundPath:  raidAssetPath('spookspire_keep', 'bg_spookspire_keep.webp'),
  bosses: [
    {
      id:                       'sir_trotsalot_and_nighttime',
      name:                     'Sir Trotsalot',
      buttonKey:                'button_boss_sir_trotsalot',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_sir_trotsalot.webp'),
      encounterBackgroundKey:   'bg_encounter_sir_trotsalot',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_boss_sir_trotsalot.webp'),
      idleKey:                  'boss_sir_trotsalot_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_sir_trotsalot_idle.webp'),
      attackingKey:             'boss_sir_trotsalot_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_sir_trotsalot_attacking.webp'),
      defeatedKey:              'boss_sir_trotsalot_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_sir_trotsalot_defeated.webp'),
      levelKey:                 'level_sir_trotsalot',
      levelPath:                'data/spookspire_keep/nighttime_sir_trotsalot.json',
      unlockedBy:               [],
    },
    {
      id:                       'mortimer',
      name:                     'Mortimer',
      buttonKey:                'button_boss_mortimer',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_mortimer.webp'),
      encounterBackgroundKey:   'bg_encounter_mortimer',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_boss_mortimer.webp'),
      idleKey:                  'boss_mortimer_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_mortimer_idle.webp'),
      attackingKey:             'boss_mortimer_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_mortimer_attacking.webp'),
      defeatedKey:              'boss_mortimer_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_mortimer_defeated.webp'),
      levelKey:                 'level_mortimer',
      levelPath:                'data/spookspire_keep/mortimer.json',
      unlockedBy:               ['sir_trotsalot_and_nighttime'],
    },
    {
      id:                       'lady_proper',
      name:                     'Lady Proper',
      buttonKey:                'button_boss_lady_proper',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_lady_proper.webp'),
      encounterBackgroundKey:   'bg_encounter_lady_proper',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_lady_proper.webp'),
      idleKey:                  'boss_lady_proper_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.webp'),  // TODO: add idle sheet
      attackingKey:             'boss_lady_proper_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.webp'),  // TODO: add attacking sheet
      defeatedKey:              'boss_lady_proper_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.webp'),  // TODO: add defeated sheet
      levelKey:                 'level_lady_proper',
      levelPath:                'data/spookspire_keep/lady_properness.json',
      unlockedBy:               ['sir_trotsalot_and_nighttime'],
    },
    {
      id:                       'the_movie_theater',
      name:                     'The Movie Theater',
      buttonKey:                'button_boss_the_movie_theater',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_the_movie_theater.webp'),
      encounterBackgroundKey:   'bg_encounter_the_movie_theater',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_the_movie_theater_closed.webp'),
      idleKey:                  'boss_the_movie_theater_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_sir_trotsalot_idle.webp'),  // TODO: add movie theater idle sheet
      attackingKey:             'boss_the_movie_theater_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_sir_trotsalot_attacking.webp'),  // TODO: add movie theater attacking sheet
      defeatedKey:              'boss_the_movie_theater_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_sir_trotsalot_defeated.webp'),  // TODO: add movie theater defeated sheet
      levelKey:                 'level_the_movie_theater',
      levelPath:                'data/spookspire_keep/the_movie_theater.json',
      unlockedBy:               ['mortimer'],
    },
    {
      id:                       'the_archivist',
      name:                     'The Archivist',
      buttonKey:                'button_boss_the_archivist',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_the_archivist.webp'),
      encounterBackgroundKey:   'bg_encounter_the_archivist',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_the_archivist.webp'),
      idleKey:                  'boss_the_archivist_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_the_archivist_idle.webp'),
      attackingKey:             'boss_the_archivist_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_the_archivist_attacking.webp'),
      defeatedKey:              'boss_the_archivist_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_the_archivist_.defeated.webp'),
      levelKey:                 'level_the_archivist',
      levelPath:                'data/spookspire_keep/archivist.json',
      unlockedBy:               ['mortimer'],
    },
    {
      id:                       'aether_drake',
      name:                     'Aether Drake',
      buttonKey:                'button_boss_aether_drake',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_aether_drake.webp'),
      encounterBackgroundKey:   'bg_encounter_aether_drake',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_aether_drake.webp'),
      idleKey:                  'boss_aether_drake_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_aether_drake_idle.webp'),
      attackingKey:             'boss_aether_drake_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_aether_drake_attacking.webp'),
      defeatedKey:              'boss_aether_drake_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_aether_drake_defeated.webp'),
      levelKey:                 'level_aether_drake',
      levelPath:                'data/spookspire_keep/aether_drake.json',
      unlockedBy:               ['the_archivist'],
    },
    {
      id:                       'phantom_magister',
      name:                     'Phantom Magister',
      buttonKey:                'button_boss_phantom_magister',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_phantom_magister.webp'),
      encounterBackgroundKey:   'bg_encounter_phantom_magister',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_phantom_magister.webp'),
      idleKey:                  'boss_phantom_magister_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/splash/boss_phantom_magister.webp'),
      attackingKey:             'boss_phantom_magister_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_phatnom_magister_attacking.webp'),
      defeatedKey:              'boss_phantom_magister_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_phatnom_magister_defeated.webp'),
      levelKey:                 'level_phantom_magister',
      levelPath:                'data/spookspire_keep/phantom_magister.json',
      unlockedBy:               ['the_movie_theater'],
    },
    {
      id:                       'malvestian_doomhoof_and_kilwretch',
      name:                     'Malvestian Doomhoof & Kilwretch',
      buttonKey:                'button_boss_malvestian_doomhoof',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_malvestian_doomhoof.webp'),
      encounterBackgroundKey:   'bg_encounter_malvestian_doomhoof',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_malvestian_doomhoof.webp'),
      idleKey:                  'boss_malvestian_doomhoof_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_malvestian_doomhoof_idle.webp'),
      attackingKey:             'boss_malvestian_doomhoof_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_malvestian_doomhoof_attacking.webp'),
      defeatedKey:              'boss_malvestian_doomhoof_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_malvestian_doomhoof_defeated.webp'),
      levelKey:                 'level_malvestian_doomhoof',
      levelPath:                'data/spookspire_keep/malvestian_doomhoof.json',
      unlockedBy:               ['phantom_magister'],
    },
    {
      id:                       'prince_malarkey',
      name:                     'Prince Malarkey',
      buttonKey:                'button_boss_prince_malarkey',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_prince_malarkey.webp'),
      encounterBackgroundKey:   'bg_encounter_prince_malarkey',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_prince_malarkey.webp'),
      idleKey:                  'boss_prince_malarkey_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_prince_malarkey_idle.webp'),
      attackingKey:             'boss_prince_malarkey_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_prince_malarkey_attacking.webp'),
      defeatedKey:              'boss_prince_malarkey_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_prince_malarkey_defeated.webp'),
      levelKey:                 'level_prince_malarkey',
      levelPath:                'data/spookspire_keep/prince_malarkey.json',
      unlockedBy:               ['the_movie_theater', 'the_archivist'],
    },
    {
      id:                       'dreadwing',
      name:                     'Dreadwing',
      buttonKey:                'button_boss_dreadwing',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_dreadwing.webp'),
      encounterBackgroundKey:   'bg_encounter_dreadwing',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_dreadwing.webp'),
      idleKey:                  'boss_dreadwing_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_dreadwing_idle.webp'),
      attackingKey:             'boss_dreadwing_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_dreadwing_attacking.webp'),
      defeatedKey:              'boss_dreadwing_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_dreadwing_defeated.webp'),
      levelKey:                 'level_dreadwing',
      levelPath:                'data/spookspire_keep/dreadwing_the_restless.json',
      unlockedBy:               ['phantom_magister'],
    },
  ],
};

// ============================================================
// Exports
// ============================================================

// RAID_CATALOG: access any raid by its id
export const RAID_CATALOG = {
  the_basement_demon:    the_basement_demon,
  the_cracked_mountain:  THE_CRACKED_MOUNTAIN,
  spookspire_keep:       SPOOKSPIRE_KEEP,
};

// RAID_ORDER: the display order on the raid selection screen
export const RAID_ORDER = [
  'spookspire_keep',
  'the_cracked_mountain',
  'the_basement_demon',
];
