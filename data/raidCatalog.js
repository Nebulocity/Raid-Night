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
 *   - splashKey / splashPath: large image shown on the boss loading screen
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
// THE CHURNING CORE
// One boss: Ragnaros. Always unlocked.
// ============================================================

const THE_CHURNING_CORE = {
  id:              'the_churning_core',
  name:            'The Churning Core',
  buttonKey:       'button_the_churning_core',
  buttonPath:      raidAssetPath('the_churning_core', 'button_the_churning_core.png'),
  backgroundKey:   'bg_the_churning_core',
  backgroundPath:  raidAssetPath('the_churning_core', 'bg_the_churning_core.png'),
  bosses: [
    {
      id:                       'ragnaros',
      name:                     'Ragnaros',
      buttonKey:                'button_boss_ragnaros',
      buttonPath:               raidAssetPath('the_churning_core', 'buttons/button_ragnaros.png'),
      splashKey:                'splash_ragnaros',
      splashPath:               raidAssetPath('the_churning_core', 'bosses/splash/boss_ragnaros.png'),
      encounterBackgroundKey:   'bg_encounter_ragnaros',
      encounterBackgroundPath:  raidAssetPath('the_churning_core', 'backgrounds/bg_ragnaros.png'),
      idleKey:                  'boss_ragnaros_idle',
      idlePath:                 raidAssetPath('the_churning_core', 'bosses/idle/boss_ragnaros_idle.png'),
      attackingKey:             'boss_ragnaros_attacking',
      attackingPath:            raidAssetPath('the_churning_core', 'bosses/attacking/boss_ragnaros_attacking.png'),
      defeatedKey:              'boss_ragnaros_defeated',
      defeatedPath:             raidAssetPath('the_churning_core', 'bosses/defeated/boss_ragnaros_defeated.png'),
      levelKey:                 'level_ragnaros',
      levelPath:                'data/the_churning_core/ragnaros.json',
      unlockedBy:               [],
    },
  ],
};

// ============================================================
// THE DEMON BASEMENT
// One boss: Magtheridax the Frustrated. Always unlocked.
// ============================================================

const THE_DEMON_BASEMENT = {
  id:              'the_demon_basement',
  name:            'The Demon Basement',
  buttonKey:       'button_the_demon_basement',
  buttonPath:      raidAssetPath('the_demon_basement', 'button_the_demon_basement.png'),
  backgroundKey:   'bg_the_demon_basement',
  backgroundPath:  raidAssetPath('the_demon_basement', 'bg_the_demon_basement.png'),
  bosses: [
    {
      id:                       'magtheridax',
      name:                     'Magtheridax the Frustrated',
      buttonKey:                'button_boss_magtheridax',
      buttonPath:               raidAssetPath('the_demon_basement', 'buttons/button_magtheridax.png'),
      splashKey:                'splash_magtheridax',
      splashPath:               raidAssetPath('the_demon_basement', 'bosses/splash/boss_magtheridax.png'),
      encounterBackgroundKey:   'bg_the_demon_basement',
      encounterBackgroundPath:  raidAssetPath('the_demon_basement', 'backgrounds/bg_the_demon_basement.png'),
      idleKey:                  'boss_magtheridax_idle',
      idlePath:                 raidAssetPath('the_demon_basement', 'bosses/idle/boss_magtheridax_idle.png'),
      attackingKey:             'boss_magtheridax_attacking',
      attackingPath:            raidAssetPath('the_demon_basement', 'bosses/attacking/boss_magtheridax_attacking.png'),
      defeatedKey:              'boss_magtheridax_defeated',
      defeatedPath:             raidAssetPath('the_demon_basement', 'bosses/defeated/boss_magtheridax_defeated.png'),
      levelKey:                 'level_magtheridax',
      levelPath:                'data/the_demon_basement/magtheridax.json',
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
  buttonPath:      raidAssetPath('the_cracked_mountain', 'button_the_churning_core.png'), // TODO: rename file to button_the_cracked_mountain.png,
  backgroundKey:   'bg_the_cracked_mountain',
  backgroundPath:  raidAssetPath('the_cracked_mountain', 'bg_the_churning_core.png'),  // TODO: rename file to bg_the_cracked_mountain.png,
  bosses: [
    {
      id:                       'high_chief_bonkgar',
      name:                     'High Chief Bonkgar',
      buttonKey:                'button_boss_high_chief_bonkgar',
      buttonPath:               raidAssetPath('the_cracked_mountain', 'buttons/button_high_chief_bonkgar.png'),
      splashKey:                'splash_high_chief_bonkgar',
      splashPath:               raidAssetPath('the_cracked_mountain', 'bosses/splash/boss_high_chief_bonkgar.png'),
      encounterBackgroundKey:   'bg_encounter_high_chief_bonkgar',
      encounterBackgroundPath:  raidAssetPath('the_cracked_mountain', 'backgrounds/bg_high_chief_bonkgar.png'),
      idleKey:                  'boss_high_chief_bonkgar_idle',
      idlePath:                 raidAssetPath('the_cracked_mountain', 'bosses/idle/boss_high_chief_bonkgar_idle.png'),
      attackingKey:             'boss_high_chief_bonkgar_attacking',
      attackingPath:            raidAssetPath('the_cracked_mountain', 'bosses/attacking/boss_high_chief_bonkgar_attacking.png'),
      defeatedKey:              'boss_high_chief_bonkgar_defeated',
      defeatedPath:             raidAssetPath('the_cracked_mountain', 'bosses/defeated/boss_high_chief_bonkgar_defeated.png'),
      levelKey:                 'level_high_chief_bonkgar',
      levelPath:                'data/the_cracked_mountain/high_chief_bonkgar.json',
      unlockedBy:               [],
    },
    {
      id:                       'grull_the_wyrm_whacker',
      name:                     'Grull the Wyrm Whacker',
      buttonKey:                'button_boss_grull',
      buttonPath:               raidAssetPath('the_cracked_mountain', 'buttons/button_grull_the_wyrm_whacker.png'),
      splashKey:                'splash_grull',
      splashPath:               raidAssetPath('the_cracked_mountain', 'bosses/splash/boss_grull_the_wyrm_whacker.png'),
      encounterBackgroundKey:   'bg_encounter_grull',
      encounterBackgroundPath:  raidAssetPath('the_cracked_mountain', 'backgrounds/bg_grull_the_wyrm_whacker.png'),
      idleKey:                  'boss_grull_idle',
      idlePath:                 raidAssetPath('the_cracked_mountain', 'bosses/idle/boss_grull_the_wyrm_whacker_idle.png'),
      attackingKey:             'boss_grull_attacking',
      attackingPath:            raidAssetPath('the_cracked_mountain', 'bosses/attacking/boss_grull_the_wyrm_whacker_attacking.png'),
      defeatedKey:              'boss_grull_defeated',
      defeatedPath:             raidAssetPath('the_cracked_mountain', 'bosses/defeated/boss_grull_the_wyrm_whacker_defeated.png'),
      levelKey:                 'level_grull',
      levelPath:                'data/the_cracked_mountain/grull_the_wyrm_whacker.json',
      unlockedBy:               [],
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
  buttonPath:      raidAssetPath('spookspire_keep', 'button_spookspire_keep.png'),
  backgroundKey:   'bg_spookspire_keep',
  backgroundPath:  raidAssetPath('spookspire_keep', 'bg_spookspire_keep.png'),
  bosses: [
    {
      id:                       'sir_trotsalot_and_nighttime',
      name:                     'Sir Trotsalot & Nighttime',
      buttonKey:                'button_boss_sir_trotsalot',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_sir_trotsalot.png'),
      splashKey:                'splash_sir_trotsalot',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_sir_trotsalot_mounted.png'),
      encounterBackgroundKey:   'bg_encounter_sir_trotsalot',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_boss_sir_trotsalot.png'),
      idleKey:                  'boss_sir_trotsalot_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_sir_trotsalot_idle.png'),
      attackingKey:             'boss_sir_trotsalot_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_sir_trotsalot_attacking.png'),
      defeatedKey:              'boss_sir_trotsalot_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_sir_trotsalot_defeated.png'),
      levelKey:                 'level_sir_trotsalot',
      levelPath:                'data/spookspire_keep/nighttime_sir_trotsalot.json',
      unlockedBy:               [],
    },
    {
      id:                       'mortimer',
      name:                     'Mortimer',
      buttonKey:                'button_boss_mortimer',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_mortimer.png'),
      splashKey:                'splash_mortimer',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_mortimer.png'),
      encounterBackgroundKey:   'bg_encounter_mortimer',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_boss_mortimer.png'),
      idleKey:                  'boss_mortimer_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_mortimer_idle.png'),
      attackingKey:             'boss_mortimer_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_mortimer_attacking.png'),
      defeatedKey:              'boss_mortimer_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_mortimer_defeated.png'),
      levelKey:                 'level_mortimer',
      levelPath:                'data/spookspire_keep/mortimer.json',
      unlockedBy:               ['sir_trotsalot_and_nighttime'],
    },
    {
      id:                       'lady_proper',
      name:                     'Lady Proper',
      buttonKey:                'button_boss_lady_proper',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_lady_proper.png'),
      splashKey:                'splash_lady_proper',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.png'),
      encounterBackgroundKey:   'bg_encounter_lady_proper',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_lady_proper.png'),
      idleKey:                  'boss_lady_proper_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.png'),  // TODO: add idle sheet
      attackingKey:             'boss_lady_proper_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.png'),  // TODO: add attacking sheet
      defeatedKey:              'boss_lady_proper_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/splash/boss_lady_proper.png'),  // TODO: add defeated sheet
      levelKey:                 'level_lady_proper',
      levelPath:                'data/spookspire_keep/lady_properness.json',
      unlockedBy:               ['sir_trotsalot_and_nighttime'],
    },
    {
      id:                       'the_movie_theater',
      name:                     'The Movie Theater',
      buttonKey:                'button_boss_the_movie_theater',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_the_movie_theater.png'),
      splashKey:                'splash_the_movie_theater',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_sir_trotsalot.png'),  // No movie theater splash yet,
      encounterBackgroundKey:   'bg_encounter_the_movie_theater',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_the_movie_theater_closed.png'),
      idleKey:                  'boss_the_movie_theater_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_sir_trotsalot_idle.png'),  // TODO: add movie theater idle sheet
      attackingKey:             'boss_the_movie_theater_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_sir_trotsalot_attacking.png'),  // TODO: add movie theater attacking sheet
      defeatedKey:              'boss_the_movie_theater_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_sir_trotsalot_defeated.png'),  // TODO: add movie theater defeated sheet
      levelKey:                 'level_the_movie_theater',
      levelPath:                'data/spookspire_keep/the_movie_theater.json',
      unlockedBy:               ['mortimer'],
    },
    {
      id:                       'the_archivist',
      name:                     'The Archivist',
      buttonKey:                'button_boss_the_archivist',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_the_archivist.png'),
      splashKey:                'splash_archivist',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_archivist.png'),
      encounterBackgroundKey:   'bg_encounter_the_archivist',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_the_archivist.png'),
      idleKey:                  'boss_the_archivist_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_the_archivist_idle.png'),
      attackingKey:             'boss_the_archivist_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_the_archivist_attacking.png'),
      defeatedKey:              'boss_the_archivist_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_the_archivist_.defeated.png'),
      levelKey:                 'level_the_archivist',
      levelPath:                'data/spookspire_keep/archivist.json',
      unlockedBy:               ['mortimer'],
    },
    {
      id:                       'aether_drake',
      name:                     'Aether Drake',
      buttonKey:                'button_boss_aether_drake',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_aetherl_drake.png'),
      splashKey:                'splash_aether_drake',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_aether_drake.png'),
      encounterBackgroundKey:   'bg_encounter_aether_drake',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_aether_drake.png'),
      idleKey:                  'boss_aether_drake_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_aether_drake_idle.png'),
      attackingKey:             'boss_aether_drake_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_aether_drake_attacking.png'),
      defeatedKey:              'boss_aether_drake_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_aether_drake_defeated.png'),
      levelKey:                 'level_aether_drake',
      levelPath:                'data/spookspire_keep/aether_drake.json',
      unlockedBy:               ['the_archivist'],
    },
    {
      id:                       'phantom_magister',
      name:                     'Phantom Magister',
      buttonKey:                'button_boss_phantom_magister',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_phantom_magister.png'),
      splashKey:                'splash_phantom_magister',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_phantom_magister.png'),
      encounterBackgroundKey:   'bg_encounter_phantom_magister',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_phantom_magister.png'),
      idleKey:                  'boss_phantom_magister_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/splash/boss_phantom_magister.png'),
      attackingKey:             'boss_phantom_magister_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_phatnom_magister_attacking.png'),
      defeatedKey:              'boss_phantom_magister_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_phatnom_magister_defeated.png'),
      levelKey:                 'level_phantom_magister',
      levelPath:                'data/spookspire_keep/phantom_magister.json',
      unlockedBy:               ['the_movie_theater'],
    },
    {
      id:                       'malvestian_doomhoof_and_kilwretch',
      name:                     'Malvestian Doomhoof & Kilwretch',
      buttonKey:                'button_boss_malvestian_doomhoof',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_malvestian_doomhoof.png'),
      splashKey:                'splash_malvestian_doomhoof',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_malvestian_doomhoof.png'),
      encounterBackgroundKey:   'bg_encounter_malvestian_doomhoof',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_malvestian_doomhoof.png'),
      idleKey:                  'boss_malvestian_doomhoof_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_malvestian_doomhoof_idle.png'),
      attackingKey:             'boss_malvestian_doomhoof_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_malvestian_doomhoof_attacking.png'),
      defeatedKey:              'boss_malvestian_doomhoof_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_malvestian_doomhoof_defeated.png'),
      levelKey:                 'level_malvestian_doomhoof',
      levelPath:                'data/spookspire_keep/malvestian_doomhoof.json',
      unlockedBy:               ['phantom_magister'],
    },
    {
      id:                       'prince_malarkey',
      name:                     'Prince Malarkey',
      buttonKey:                'button_boss_prince_malarkey',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_prince_malarkey.png'),
      splashKey:                'splash_prince_malarkey',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_prince_malarkey.png'),
      encounterBackgroundKey:   'bg_encounter_prince_malarkey',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_prince_malarkey.png'),
      idleKey:                  'boss_prince_malarkey_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_prince_malarkey_idle.png'),
      attackingKey:             'boss_prince_malarkey_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_prince_malarkey_attacking.png'),
      defeatedKey:              'boss_prince_malarkey_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_prince_malarkey_defeated.png'),
      levelKey:                 'level_prince_malarkey',
      levelPath:                'data/spookspire_keep/prince_malarkey.json',
      unlockedBy:               ['the_movie_theater', 'the_archivist'],
    },
    {
      id:                       'dreadwing',
      name:                     'Dreadwing',
      buttonKey:                'button_boss_dreadwing',
      buttonPath:               raidAssetPath('spookspire_keep', 'buttons/button_boss_dreadwing.png'),
      splashKey:                'splash_dreadwing',
      splashPath:               raidAssetPath('spookspire_keep', 'bosses/splash/boss_dreadwing.png'),
      encounterBackgroundKey:   'bg_encounter_dreadwing',
      encounterBackgroundPath:  raidAssetPath('spookspire_keep', 'backgrounds/bg_dreadwing.png'),
      idleKey:                  'boss_dreadwing_idle',
      idlePath:                 raidAssetPath('spookspire_keep', 'bosses/idle/boss_dreadwing_idle.png'),
      attackingKey:             'boss_dreadwing_attacking',
      attackingPath:            raidAssetPath('spookspire_keep', 'bosses/attacking/boss_dreadwing_attacking.png'),
      defeatedKey:              'boss_dreadwing_defeated',
      defeatedPath:             raidAssetPath('spookspire_keep', 'bosses/defeated/boss_dreadwing_defeated.png'),
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
  the_churning_core:     THE_CHURNING_CORE,
  the_demon_basement:    THE_DEMON_BASEMENT,
  the_cracked_mountain:  THE_CRACKED_MOUNTAIN,
  spookspire_keep:       SPOOKSPIRE_KEEP,
};

// RAID_ORDER: the display order on the raid selection screen
export const RAID_ORDER = [
  'spookspire_keep',
  'the_churning_core',
  'the_cracked_mountain',
  'the_demon_basement',
];
