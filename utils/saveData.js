/**
 * saveData.js
 *
 * Very small localStorage wrapper for title / raid / boss menu progress.
 */
const SAVE_KEY = 'raidnight_save_v1';

export function createDefaultSaveData() {
  return {
    raidWipeTokensLeft: 3,
    unlockedRaidIds: ['the_churning_core', 'spookspire_keep'],
    unlockedBossIds: {
      the_churning_core: ['ragnaros'],
      spookspire_keep: [
      'nighttime_sir_trotsalot',
      'mortimer',
      'lady_properness',
      'dorothy',
      'toto',
      'tin_man',
      'cowardly_lion',
      'wicked_witch',
      'big_bad_wolf',
      'romeo',
      'juliette',
      'archivist',
      'malvestian_doomhoof',
      'phantom_magister',
      'aether_drake',
      'prince_malarkey',
      'dreadwing_the_restless',
    ],
      the_cracked_mountain: [],
      the_demon_basement: [],
    },
    lastSelectedRaidId: 'the_churning_core',
    lastSelectedBossId: 'ragnaros',
  };
}

export function loadSaveData() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createDefaultSaveData();
    }

    const parsed = JSON.parse(raw);
    return sanitizeSaveData(parsed);
  } catch (error) {
    console.warn('[saveData] Failed to load save data. Using defaults.', error);
    return createDefaultSaveData();
  }
}

export function saveSaveData(saveData) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(sanitizeSaveData(saveData)));
  } catch (error) {
    console.warn('[saveData] Failed to persist save data.', error);
  }
}

export function resetSaveData() {
  const defaults = createDefaultSaveData();
  saveSaveData(defaults);
  return defaults;
}

export function sanitizeSaveData(saveData) {
  const defaults = createDefaultSaveData();
  const safeData = {
    ...defaults,
    ...(saveData || {}),
  };

  safeData.unlockedRaidIds = Array.isArray(safeData.unlockedRaidIds)
    ? safeData.unlockedRaidIds
    : defaults.unlockedRaidIds;

  if (!safeData.unlockedRaidIds.includes('spookspire_keep')) {
    safeData.unlockedRaidIds = [...safeData.unlockedRaidIds, 'spookspire_keep'];
  }

  safeData.unlockedBossIds = {
    ...defaults.unlockedBossIds,
    ...(safeData.unlockedBossIds || {}),
  };

  const requiredspookspire_keepBossIds = [
    'nighttime_sir_trotsalot',
      'mortimer',
      'lady_properness',
      'dorothy',
      'toto',
      'tin_man',
      'cowardly_lion',
      'wicked_witch',
      'big_bad_wolf',
      'romeo',
      'juliette',
      'archivist',
      'malvestian_doomhoof',
      'phantom_magister',
      'aether_drake',
      'prince_malarkey',
      'dreadwing_the_restless',
  ];
  const existingspookspire_keepBossIds = Array.isArray(safeData.unlockedBossIds.spookspire_keep)
    ? safeData.unlockedBossIds.spookspire_keep
    : [];
  safeData.unlockedBossIds.spookspire_keep = Array.from(new Set([
    ...existingspookspire_keepBossIds,
    ...requiredspookspire_keepBossIds,
  ]));

  if (!safeData.lastSelectedRaidId) {
    safeData.lastSelectedRaidId = defaults.lastSelectedRaidId;
  }

  if (!safeData.lastSelectedBossId) {
    safeData.lastSelectedBossId = defaults.lastSelectedBossId;
  }

  if (typeof safeData.raidWipeTokensLeft !== 'number') {
    safeData.raidWipeTokensLeft = defaults.raidWipeTokensLeft;
  }

  return safeData;
}
