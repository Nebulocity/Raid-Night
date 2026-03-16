/**
 * raidCatalog.js
 *
 * High-level raid / boss metadata used by the menu flow.
 * Gameplay specifics still live in the per-boss level JSON files.
 */
export const RAID_CATALOG = {
  molten_core: {
    id: 'molten_core',
    name: 'Molten Core',
    buttonKey: 'button_molten_core',
    backgroundKey: 'bg_molten_core',
    bosses: [
      {
        id: 'ragnaros',
        name: 'Ragnaros',
        buttonKey: 'button_ragnaros',
        loadingKey: 'loading_ragnaros',
        levelKey: 'level_ragnaros',
        levelPath: 'data/level01.json',
      },
    ],
  },
  karazhan: {
    id: 'karazhan',
    name: 'Karazhan',
    buttonKey: 'button_karazhan',
    backgroundKey: 'bg_karazhan',
    bosses: [
      {
        id: 'attumen',
        name: 'Attumen the Huntsman',
        buttonKey: 'button_attumen',
        loadingKey: 'loading_attumen',
      },
      {
        id: 'moroes',
        name: 'Moroes',
        buttonKey: 'button_moroes',
        loadingKey: 'loading_moroes',
      },
      {
        id: 'maiden_of_virtue',
        name: 'Maiden of Virtue',
        buttonKey: 'button_maiden_of_virtue',
        loadingKey: 'loading_maiden_of_virtue',
      },
      {
        id: 'opera_event',
        name: 'Opera Event',
        buttonKey: 'button_opera_event',
        loadingKey: 'loading_opera_event',
      },
      {
        id: 'the_curator',
        name: 'The Curator',
        buttonKey: 'button_the_curator',
        loadingKey: 'loading_the_curator',
      },
      {
        id: 'terestian_illhoof',
        name: 'Terestian Illhoof',
        buttonKey: 'button_terestian_illhoof',
        loadingKey: 'loading_terestian_illhoof',
      },
      {
        id: 'shade_of_aran',
        name: 'Shade of Aran',
        buttonKey: 'button_shade_of_aran',
        loadingKey: 'loading_shade_of_aran',
      },
      {
        id: 'netherspite',
        name: 'Netherspite',
        buttonKey: 'button_netherspite',
        loadingKey: 'loading_netherspite',
      },
      {
        id: 'chess_event',
        name: 'Chess Event',
        buttonKey: 'button_chess_event',
        loadingKey: 'loading_chess_event',
      },
      {
        id: 'prince_malchezaar',
        name: 'Prince Malchezaar',
        buttonKey: 'button_prince_malchezaar',
        loadingKey: 'loading_prince_malchezaar',
      },
      {
        id: 'nightbane',
        name: 'Nightbane',
        buttonKey: 'button_nightbane',
        loadingKey: 'loading_nightbane',
      },
      {
        id: 'servants_quarters',
        name: 'Servants\' Quarters',
        buttonKey: 'button_servants_quarters',
        loadingKey: 'loading_servants_quarters',
      },
    ],
  },
  gruuls_lair: {
    id: 'gruuls_lair',
    name: "Gruul's Lair",
    buttonKey: 'button_gruul',
    backgroundKey: 'bg_gruul',
    bosses: [],
  },
  magtheridons_lair: {
    id: 'magtheridons_lair',
    name: "Magtheridon's Lair",
    buttonKey: 'button_magtheridon',
    backgroundKey: 'bg_magtheridon',
    bosses: [],
  },
};

export const RAID_ORDER = [
  'karazhan',
  'molten_core',
  'gruuls_lair',
  'magtheridons_lair',
];
