/**
 * raidCatalog.js
 *
 * High-level raid / boss metadata used by the menu flow.
 * Gameplay specifics still live in the per-boss level JSON files.
 */

function buildBossAssetMeta(raidAssetFolder, bossFolder, bossAssetBase, bossId) {
  const folder = `sprites/${raidAssetFolder}/${bossFolder}`;
  return {
    assetFolder: bossFolder,
    assetBase: bossAssetBase,
    buttonPath: `${folder}/icon_boss_${bossAssetBase}.png`,
    loadingPath: `${folder}/boss_${bossAssetBase}.png`,
    encounterBackgroundPath: `${folder}/bg_boss_${bossAssetBase}.png`,
    idlePath: `${folder}/boss_${bossAssetBase}_idle.png`,
    attackPath: `${folder}/boss_${bossAssetBase}_attack.png`,
    defeatedPath: `${folder}/boss_${bossAssetBase}_defeated.png`,
    encounterBackgroundKey: `bg_boss_${bossId}`,
    idleSheetKey: `${bossId}_idle_sheet`,
    attackSheetKey: `${bossId}_attack_sheet`,
    defeatedSheetKey: `${bossId}_defeated_sheet`,
  };
}

function withBossAssets(raidId, raidAssetFolder, boss) {
  const assets = buildBossAssetMeta(
    raidAssetFolder,
    boss.assetFolder || boss.id,
    boss.assetBase || boss.id,
    boss.id,
  );

  return {
    ...boss,
    ...assets,
  };
}

export const RAID_CATALOG = {
  the_churning_core: {
    id: 'the_churning_core',
    name: 'The Churning Core',
    assetFolder: 'the_churning_core',
    buttonKey: 'button_the_churning_core',
    backgroundKey: 'bg_the_churning_core',
    backgroundPath: 'sprites/the_churning_core/bg_the_churning_core.png',
    bosses: [
      withBossAssets('the_churning_core', 'the_churning_core', {
        id: 'ragnaros',
        name: 'Ragnaros',
        buttonKey: 'button_ragnaros',
        loadingKey: 'loading_ragnaros',
        levelKey: 'level_ragnaros',
        levelPath: 'data/level01.json',
        assetFolder: 'ragnaros',
        assetBase: 'ragnaros',
      }),
    ],
  },
  spookspire_keep: {
    id: 'spookspire_keep',
    name: 'Spookspire Keep',
    assetFolder: 'spookspire_keep',
    buttonKey: 'button_spookspire_keep',
    backgroundKey: 'bg_spookspire_keep',
    backgroundPath: 'sprites/spookspire_keep/bg_spookspire_keep.png',
    bosses: [
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'nighttime_sir_trotsalot',
        name: 'Nighttime & Sir Trotsalot the Damned',
        buttonKey: 'button_nighttime_sir_trotsalot',
        loadingKey: 'loading_nighttime_sir_trotsalot',
        levelKey: 'level_nighttime_sir_trotsalot',
        levelPath: 'data/spookspire_keep/nighttime_sir_trotsalot.json',
        assetFolder: 'sir_trotsalot',
        assetBase: 'sir_trotsalot',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'mortimer',
        name: 'Mortimer',
        buttonKey: 'button_mortimer',
        loadingKey: 'loading_mortimer',
        levelKey: 'level_mortimer',
        levelPath: 'data/spookspire_keep/mortimer.json',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'lady_properness',
        name: 'Lady Properness',
        buttonKey: 'button_lady_properness',
        loadingKey: 'loading_lady_properness',
        levelKey: 'level_lady_properness',
        levelPath: 'data/spookspire_keep/lady_properness.json',
        assetFolder: 'lady_proper',
        assetBase: 'lady_proper',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'dorothy',
        name: 'Dorothy',
        buttonKey: 'button_dorothy',
        loadingKey: 'loading_dorothy',
        levelKey: 'level_dorothy',
        levelPath: 'data/spookspire_keep/dorothy.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'toto',
        name: 'Toto',
        buttonKey: 'button_toto',
        loadingKey: 'loading_toto',
        levelKey: 'level_toto',
        levelPath: 'data/spookspire_keep/toto.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'tin_man',
        name: 'Tin Man',
        buttonKey: 'button_tin_man',
        loadingKey: 'loading_tin_man',
        levelKey: 'level_tin_man',
        levelPath: 'data/spookspire_keep/tin_man.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'cowardly_lion',
        name: 'The Cowardly Lion',
        buttonKey: 'button_cowardly_lion',
        loadingKey: 'loading_cowardly_lion',
        levelKey: 'level_cowardly_lion',
        levelPath: 'data/spookspire_keep/cowardly_lion.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'wicked_witch',
        name: 'The Wicked Witch',
        buttonKey: 'button_wicked_witch',
        loadingKey: 'loading_wicked_witch',
        levelKey: 'level_wicked_witch',
        levelPath: 'data/spookspire_keep/wicked_witch.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'big_bad_wolf',
        name: 'Big Bad Wolf',
        buttonKey: 'button_big_bad_wolf',
        loadingKey: 'loading_big_bad_wolf',
        levelKey: 'level_big_bad_wolf',
        levelPath: 'data/spookspire_keep/big_bad_wolf.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'romeo',
        name: 'Romeo',
        buttonKey: 'button_romeo',
        loadingKey: 'loading_romeo',
        levelKey: 'level_romeo',
        levelPath: 'data/spookspire_keep/romeo.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'juliette',
        name: 'Juliette',
        buttonKey: 'button_juliette',
        loadingKey: 'loading_juliette',
        levelKey: 'level_juliette',
        levelPath: 'data/spookspire_keep/juliette.json',
        assetFolder: 'movie_theater',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'archivist',
        name: 'The Archivist',
        buttonKey: 'button_archivist',
        loadingKey: 'loading_archivist',
        levelKey: 'level_archivist',
        levelPath: 'data/spookspire_keep/archivist.json',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'malvestian_doomhoof',
        name: 'Malvestian Doomhoof',
        buttonKey: 'button_malvestian_doomhoof',
        loadingKey: 'loading_malvestian_doomhoof',
        levelKey: 'level_malvestian_doomhoof',
        levelPath: 'data/spookspire_keep/malvestian_doomhoof.json',
        assetFolder: 'doomhoof',
        assetBase: 'malvestian_doomhoof',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'phantom_magister',
        name: 'The Phantom Magister',
        buttonKey: 'button_phantom_magister',
        loadingKey: 'loading_phantom_magister',
        levelKey: 'level_phantom_magister',
        levelPath: 'data/spookspire_keep/phantom_magister.json',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'aether_drake',
        name: 'The Aether Drake',
        buttonKey: 'button_aether_drake',
        loadingKey: 'loading_aether_drake',
        levelKey: 'level_aether_drake',
        levelPath: 'data/spookspire_keep/aether_drake.json',
        assetFolder: 'astral_drake',
        assetBase: 'astral_drake',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'prince_malarkey',
        name: 'Prince Malarkey',
        buttonKey: 'button_prince_malarkey',
        loadingKey: 'loading_prince_malarkey',
        levelKey: 'level_prince_malarkey',
        levelPath: 'data/spookspire_keep/prince_malarkey.json',
      }),
      withBossAssets('spookspire_keep', 'spookspire_keep', {
        id: 'dreadwing_the_restless',
        name: 'Dreadwing the Restless',
        buttonKey: 'button_dreadwing_the_restless',
        loadingKey: 'loading_dreadwing_the_restless',
        levelKey: 'level_dreadwing_the_restless',
        levelPath: 'data/spookspire_keep/dreadwing_the_restless.json',
        assetFolder: 'dreadwing',
        assetBase: 'dreadwing',
      }),
    ],
  },
  the_cracked_mountain: {
    id: 'the_cracked_mountain',
    name: 'The Cracked Mountain',
    assetFolder: 'the_cracked_mountain',
    buttonKey: 'button_the_cracked_mountain',
    backgroundKey: 'bg_the_cracked_mountain',
    backgroundPath: 'sprites/the_cracked_mountain/bg_the_cracked_mountain.png',
    bosses: [],
  },
  the_demon_basement: {
    id: 'the_demon_basement',
    name: 'The Demon Basement',
    assetFolder: 'the_demon_basement',
    buttonKey: 'button_the_demon_basement',
    backgroundKey: 'bg_the_demon_basement',
    backgroundPath: 'sprites/the_demon_basement/bg_the_demon_basement.png',
    bosses: [],
  },
};

export const RAID_ORDER = [
  'spookspire_keep',
  'the_churning_core',
  'the_cracked_mountain',
  'the_demon_basement',
];
